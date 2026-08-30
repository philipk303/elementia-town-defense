# Handoff — tap-to-ghost build + PLAYTEST (Session B)

Date: 2026-08-23. Continues `docs/handoffs/2026-08-23-review-remainder-and-playtest.md`
(Session A, just landed as `217aa32`). This is the Session B half of that
two-session split — Philip's instruction was Session A on Sonnet 5, Session B
on a **new Opus 5 session**, because this half touches an input path.

Suite: **867 tests, 865 pass, 0 fail, 2 skipped.** Build clean.

## What Session A did (`217aa32`)

Items 1, 2, 4, 5 of the prior handoff — all bounded contrast/measurement/a11y
work, verified live:

- Placement ghost valid/invalid colours re-solved numerically (were 1.49–2.58:1,
  worse than the bug that started the whole contrast workstream), plus a
  non-colour differentiator (solid vs. dashed outline + an X mark on invalid).
- The theme-contrast gate generalized to composite over real draw alpha and
  real panel backdrops instead of checking colours at full opacity. This
  found FIVE further real failures nobody had ever checked (fusion buttons,
  ability "cooling" state, sell-card buttons) — all fixed, all moved into
  `theme.js` as the single source both the draw calls and the gate read from.
- Confirmed a second match cannot go silent, because a room is destroyed the
  instant `GAME_END` fires and the client has no return-to-lobby path — so no
  code was needed there.
- Haptic buzz on the aim stick's fire-threshold crossing, palette
  `aria-disabled`/`aria-label`/`aria-live`, a reflow-cache fix in the palette
  (which also fixed a real one-frame-stale height read as a side effect), and
  a new `test/client/hudGeometry.test.js` geometry gate.

**Deliberately NOT touched by Session A:** item 3, tap-to-ghost build. That is
this session's job.

---

## Item 3: tap-to-ghost build on touch — CONFIRM WITH PHILIP FIRST

**Do not write code until Philip has said yes.** He declined this once already
on 2026-08-22. The design review argued it became more urgent afterward,
because `2c0cabb` (select-then-confirm sell) made an outside-tap the natural
way to dismiss the sell card, and an outside tap falls through to the board
handler and **builds** — so the intuitive dismiss gesture now spends gold. A
close button (`×`) was added as a stopgap in `cdfda15`, but the underlying
hazard is still live: any accidental tap during the build phase still commits
immediately.

**If approved, the shape of the change:**

- Touch only. Desktop keeps one-click, because hover already previews
  validity via `_placementValidity` / the ghost colour — there is no
  equivalent "preview" state on touch today, which is the actual asymmetry
  worth fixing.
- First tap on a tile places/moves a ghost (visually: what `_drawPlacementGhost`
  already draws, just pinned instead of following the pointer). A second tap
  on the **same** tile commits — emits `BUILD_STRUCTURE` exactly as today.
  A tap on a **different** tile just moves the ghost, does not commit.
  Tapping a control (stick, palette, sell-card close button, anything already
  swallowed today) should still be swallowed exactly as now — the ghost tap
  logic only applies to taps that reach the board.
- Where to hook it: `GameScene`'s `pointerdown` handler, in the branch that
  currently does the immediate `net.emit(EVENTS.BUILD_STRUCTURE, ...)` for a
  build-phase board tap. Gate the whole ghost-then-confirm state machine on
  `this._inputScheme === 'touch'`.
- Reset the pending ghost tile whenever: the selected type changes (palette
  or keyboard), the phase leaves `build`, or the player selects/dismisses a
  structure card. A stale pending-ghost tile surviving a type change would
  silently commit the WRONG structure on the next tap.

**THE LOAD-BEARING CONSTRAINT, restated because this is the one thing that
must not slip:** a 17,000+-run balance corpus measures this game entirely
through one per-frame `PLAYER_INPUT` packet built in `GameScene._sendInput`
(`{ keys, aimX, aimY, actions }`). This change touches `pointerdown` handling
— a build-phase UI gesture — not that packet, so it should be structurally
incapable of forking the corpus the way a change to `_sendInput`,
`_readTouchInput`, or `_readDesktopInput` could. **Confirm that reasoning
explicitly before writing anything** — say it out loud in the session, the
same way the original touch-input-seam session did, rather than assuming it
because it sounds right.

After implementing: unit-test the ghost-then-confirm state machine (pure
logic, testable the same way `touchControls.js` is — a first tap records a
pending tile, a second tap on that tile fires a callback, a tap elsewhere
moves the pending tile, a reset event clears it), then verify live against a
running server exactly like every other change in this project's touch work
— synthetic touches with real `pageX`/`pageY`, not just unit tests. See the
recipe below.

---

## PLAYTEST — this is the actual point of this session

**Nothing in this entire body of work has been played by a human.** Every
claim in every commit message across three sessions (`964a45c` through
`217aa32`) is state-level verification: right values reach the server, right
sizes are computed, right events fire, right colours pass a numeric gate.
Whether any of it **feels** right is completely unknown, and no review pass
can answer that — the most severe finding of the last review round (the
palette covering the Hall) was something five seconds of actual play would
have made obvious immediately.

### Can other people join? Online is BUILT but NOT DEPLOYED

- The game is genuinely networked: socket.io rooms, 5-char shareable codes,
  reconnect tokens, host migration, bots filling empty slots to 4 (one per
  element, `CONFIG.MAX_PLAYERS = 4`).
- `render.yaml` describes a complete free-tier deploy: the game server (a Web
  Service — it needs websockets, never a Static Site) plus an always-on
  static "wake shell" in `shell/` that loads instantly and forwards once the
  cold-starting free instance answers `/healthz`.
- As of 2026-08-23, `https://elementia-town-defense.onrender.com` returns
  `x-render-routing: no-server` — nothing is deployed there. The repo also has
  **no git remote configured**. `.env` keys (ElevenLabs/Freesound/Gemini) are
  asset-generation only, not needed at runtime — a deploy needs no secrets,
  just: push to GitHub, point Render at `render.yaml`.

**Three options, ascending effort — do #1 first, in this session:**

1. **Local solo, works today.** `npm run dev` (or the `server`/`dev` configs
   in `.claude/launch.json`), create a room, press Start; bots fill the other
   three elements. This is enough for the balance program's actual need — a
   second build policy — since a human playing at all supplies that.
2. **LAN, works today, no deploy.** Others on the same network hit this
   machine's IP on port 3000 and join with the room code.
3. **Online.** Push to GitHub, connect the repo to Render, deploy from
   `render.yaml`. No code changes. Free tier spins down when idle (the wake
   shell exists for exactly this), one region, 4 players per room.

**Do not let a deploy block the first human playing this.**

### What to actually watch for

The three review passes checked correctness; this is for what they
structurally cannot reach:

- Does the two-tier aim stick threshold (fire at 0.6 of radius, release at
  0.55, hysteresis added in `cdfda15`) land where a thumb actually expects
  it? The aiming-only band is roughly 15–20 CSS px of travel.
- Does the new haptic buzz on crossing into "firing" actually help, or is it
  just noise?
- Is the DOM build palette in the way? It reserves ~115 CSS px on desktop and
  can grow to ~265 px on a phone (it wraps to more rows there), and the
  canvas now shrinks to fit **above** it (`217aa32`'s predecessor `cdfda15`
  fixed the palette from covering the board at all). Is that trade — a
  smaller board, but a board that's never obscured — the right one?
- Does select-then-confirm selling feel safe, or does it feel slow?
- Is the HUD readable at `hudScale` 1 without leaning in, now that its text
  size tracks device scale?
- If tap-to-ghost build was implemented this session: does the second-tap
  gesture read as "confirm", or does it read as "the game ignored my first
  tap"? This is exactly the kind of thing only a human can answer.

### Sandbox live-verification recipe

Screenshots are impossible in the CLI Browser pane — `document.hidden` stays
permanently `true`, so Phaser's render loop never composites a frame that can
be captured. But a **full live match is fully drivable** for state-level
verification: manually pump `game.loop.step()`, click the DOM lobby, and
dispatch synthetic `TouchEvent`s with real `pageX`/`pageY` set (Phaser reads
page coordinates, not just client coordinates — omitting them lands every
touch at (0,0)). Full recipe and the reasoning behind each step is in memory
`elementia-sandbox-browser-cannot-render`.

**Two gotchas that cost real time in prior sessions:**

- The harness injects `PORT`, so `npm run dev`'s bundled server fights vite
  for port 5173. Start the `server` launch config **separately** on port 3000
  and drive the game through that instead.
- `javascript_tool` calls time out at 30 seconds. Long async probes (readying
  up, waiting for a wave to complete) need to be split into several shorter
  calls rather than one long `await`-heavy block — this bit every session in
  this thread at least once.

---

## Balance — still paused, still do not touch it

Unchanged since 2026-08-19. The clean paired follow-up (3 arms × 2 mazes ×
3000, one family per fusion, seeds `20340801+`) is still queued and still not
run. Nothing in this session's scope should touch it.

## Recommended setup

- **Model: Opus 5**, per Philip's explicit instruction — this is the one
  remaining piece that touches an input path, and the standing project rule
  is the strongest model available for anything that could silently fork
  touch vs. desktop behaviour.
- **Subagents: no.** Single-threaded; the tap-to-ghost change and the
  playtest both center on `GameScene.js`.
- **Review:** if tap-to-ghost build is implemented, it should get at least
  one engineer-focused pass before being treated as done — but do not let a
  fourth review round substitute for actually playing the game. Three passes
  have already run; the playtest is the thing that has not happened yet and
  is worth more than a fourth audit.
