# Handoff — review remainder, then PLAYTEST

Date: 2026-08-23. Continues `docs/handoffs/2026-08-22-touch-input-seam-handoff.md`.

Suite: **855 tests, 853 pass, 0 fail, 2 skipped.** Build clean. Nothing half-finished.

**THIS IS A TWO-SESSION HANDOFF.** Philip's instruction (2026-08-23): start the
fixes below on Sonnet 5, then hand off to a NEW session on Opus 5 for the one
item that touches an input path (tap-to-ghost build) plus the first human
playtest. Session boundary is marked below — do not skip it by doing
everything in one sitting.

## Commits this session

| sha | what |
|---|---|
| `964a45c` | touch input seam + twin virtual sticks |
| `b85e9ad` | audio: runaway vortex/firepit ambience, silent BGM |
| `fc94ed7` | split hudScale from device scale; touch target geometry |
| `2c0cabb` | sell needs select-then-confirm, both platforms |
| `d405786` | DOM build palette |
| `cdfda15` | acted on both adversarial reviews of the above |

Three adversarial Opus 5 review passes ran: two on `964a45c`, two more (engineer
+ design/a11y) on the four commits after it. Their findings are fixed in
`cdfda15`; the commit message lists each one and what it measured.

**The lesson worth carrying:** every serious finding was a UNIT or a
MEASUREMENT error, not a logic error. Sizes authored in logical pixels instead
of CSS pixels. A contrast gate measuring opaque tokens while the pixels shipped
translucent. An inset measuring a panel's height when what mattered was its
overlap. The code was correct about what it was doing and wrong about what it
was measuring. See memory `elementia-hudscale-displayscale-trap`.

---

## SESSION A (Sonnet 5) — bounded fixes, items 1/2/4/5

Model: Sonnet 5 is right for these — specified, bounded, mostly measurement
work. No subagents; everything converges on GameScene.js and buildPalette.js.
Verify each fix LIVE against a running server before claiming it done (recipe
at the bottom) — every claim in this project that later proved wrong was one
that skipped that step.

### 1. Placement ghost green/red — worse than anything that started this work

`GameScene._drawPlacementGhost`. Measured against the real ground:
valid `0x54c07a` = **2.58:1**, invalid `0xd15a5a` = **1.49:1**, and the two are
**1.73:1 against each other** — i.e. effectively colour-only, and failing worse
than the 1.38:1 idle stick ring that triggered the whole contrast workstream.

**Fix, both parts:**
- Lift both hues until each clears 3:1 against all three ground bands, solved
  numerically against `test/helpers/decodeRgbPng.js` — do not pick by eye.
- Add a NON-COLOUR differentiator: valid draws a solid outline, invalid draws
  a heavier dashed outline plus a small ✕ at the footprint centre.
- Bring both under `test/themeContrast.test.js`.

### 2. The contrast gate still measures the wrong thing for most of the HUD

Only `TOUCH_CONTROL_COLORS` is gated, and at full opacity — this session
shipped 2.06:1 pixels while the gate reported 3.14:1, because the controls
actually draw at 0.55 alpha. The fusion panel, sell card, ability-bar state
colours and the placement ghost (item 1) are not gated at all.

**Fix:** generalise the gate to take `(colour, alphaItIsDrawnAt, backdrop)`
and composite before measuring, where backdrop is a ground band or the panel
fill the element sits on. Then register every drawn UI colour. This encodes
the session's actual lesson: a gate that measures something other than what
ships is worse than no gate, because it buys false confidence.

### 4. Second match may be silent

`audio.js reconcileFromPhase` self-promotes the scene only from `'none'`.
After a match ends the director sits at `'postgame'`. If a room can return to
lobby and start a second match, match 2 gets no music for the same structural
reason match 1 didn't. `startGame` requires `room.phase === 'lobby'`, so
reachability was NOT confirmed this session.

**Fix:** first determine whether a room can restart at all (read
`server/rooms/index.js` and the GAME_END path). If it can, reset the director
on GAME_START rather than adding another self-heal branch — one authoritative
"a match is starting" reset beats three recovery paths.

### 5. Smaller, all cheap

- **Haptics on the fire threshold.** `navigator.vibrate?.(10)` on the
  not-firing → firing transition only. Idle vs firing knob colours are
  1.08:1 in greyscale and the knob sits under the thumb driving it, so touch
  is the one channel that survives both occlusion and colour blindness.
- **Palette accessibility.** `aria-label` on each type button (visible text is
  an abbreviation), `aria-live="polite"` on the gold readout, `aria-disabled`
  instead of `disabled` so the reason text stays reachable by keyboard/SR.
- **Palette render forces a synchronous reflow every frame** (`offsetHeight`
  after mutating ~18 elements). Cache it, invalidate on open/visible/resize
  edges. Do NOT reintroduce whole-render diffing — that caused a real
  stale-UI bug this session; diff per element if it ever matters.
- **`_layoutHud` has no geometry test.** The HUD overflow regression was found
  by a reviewer, not by a gate. Add a case to
  `test/client/touchTargetGeometry.test.js` asserting every HUD line's right
  edge stays clear of the wave preview and the stack's bottom stays on
  surface.

### Known and accepted — do not "fix" without asking

- Touch cannot build under the stick grab circles or the REPAIR button.
  Documented trade; the circular hit area already cut it from ~37% to a few
  percent of the board.
- `user-scalable=no` stays (Philip declined removing it).
- Repair stays a HOLD on touch, not a toggle (Philip declined).

### Before ending Session A

Run the full suite, verify each fix live, commit. Then **write the handoff for
Session B** — copy the "SESSION B" part below into a fresh
`docs/handoffs/<date>-touch-build-and-playtest.md`, updated with Session A's
actual commit SHAs and suite count, and hand off explicitly to Opus 5.

---

## SESSION B (Opus 5, NEW SESSION) — tap-to-ghost build + PLAYTEST

Model: Opus 5. This is the one remaining item that changes an input path, and
the project's standing rule is the strongest model on anything that could
silently fork touch vs desktop behavior (see the 17,000+-run balance corpus
note below). Single-threaded, no subagents.

### 3. Tap-to-ghost build on touch — CONFIRM WITH PHILIP BEFORE BUILDING

Philip declined this on 2026-08-22. The design review has since argued it
became MORE urgent, because `2c0cabb` made an outside-tap the natural way to
dismiss the sell card — and an outside tap falls through and BUILDS. A close
button was added as a stopgap, but the underlying hazard stands: any
accidental tap during build still spends gold immediately.

**Ask Philip explicitly before writing code.** If approved:

First tap on a tile places a ghost; a second tap on the SAME tile commits.
Desktop keeps one-click, because hover already previews validity — this is a
divergence grounded in a real difference in what the input can do, not
platform taste. It also makes every accidental tap free, which matters
because the sticks still swallow part of the board under them.

**THE LOAD-BEARING CONSTRAINT, restated for the new session:** a 17,000+-run
balance corpus measures this game through one per-frame PLAYER_INPUT packet
built in `GameScene._sendInput`. The tap-to-ghost change touches
`pointerdown` handling, not that packet, so it should not be able to fork the
corpus — but confirm that reasoning explicitly before writing anything, the
same way the original input seam did.

### PLAYTEST — this is the actual point of Session B

**Nothing in this entire body of work has been played by a human.** Every
claim in every commit message across both sessions is state-level
verification: right values reach the server, right sizes are computed, right
events fire. Whether any of it FEELS right is unknown, and three review
passes could not answer it — the most severe finding of the last pass (the
palette covering the Hall) is something five seconds of play would have made
obvious.

**Can other people join? Online is BUILT but NOT DEPLOYED, as of 2026-08-23.**
- Genuinely networked: socket.io rooms, 5-char shareable codes, reconnect
  tokens, host migration, bots filling empty slots to 4 (one per element).
- `render.yaml` describes a complete free-tier deploy: game server + an
  always-on static "wake shell" that loads instantly and forwards once the
  cold-starting server answers `/healthz`.
- `elementia-town-defense.onrender.com` returns `x-render-routing: no-server`
  — nothing is deployed there. **No git remote is configured** on this repo
  either. `.env` keys are asset-generation APIs only, not needed at runtime.

**Three options, ascending effort — do #1 first, in this session:**
1. **Local solo, works today.** `npm run dev`, create a room, press Start;
   bots fill the other three elements. Enough for the balance program — what
   it lacks is a second build policy, and a human playing at all supplies it.
2. **LAN, works today, no deploy.** Others hit this machine's IP on port 3000.
3. **Online.** Push to GitHub, point Render at `render.yaml`. No code changes,
   no secrets. Free tier spins down when idle (the wake shell exists for
   this), one region, 4 players per room.

**Do not let a deploy block the first human playing this.**

### What to actually watch for in the playtest

The reviews checked correctness; a playtest is for what they structurally
cannot reach:
- Does the two-tier aim stick threshold (fire 0.6, release 0.55) land where a
  thumb expects? The aiming-only band is ~15-20 CSS px of travel.
- Is the build palette in the way? It takes ~115 CSS px on desktop and ~265 on
  a phone, and the canvas shrinks to fit above it. Is that trade right?
- Does select-then-confirm selling feel safe or just slow?
- Do the sticks' dead board area and the sell card's placement annoy in
  practice?
- Is the HUD readable at hudScale 1 without leaning in?
- If tap-to-ghost build was implemented this session: does the second-tap
  gesture feel natural, or does it feel like the game ignored the first tap?

### Sandbox live-verification recipe (both sessions)

Screenshots are impossible in the CLI Browser pane (`document.hidden` is
permanently true), but a FULL LIVE MATCH is drivable — manual loop pumping,
DOM lobby clicks, synthetic `TouchEvent`s with `pageX`/`pageY` set. Full
recipe in memory `elementia-sandbox-browser-cannot-render`. Two gotchas that
cost time last session: the harness injects `PORT`, so `npm run dev`'s server
fights vite for 5173 — start the `server` config separately on 3000 and use
that; and `javascript_tool` times out at 30s, so split long async probes into
several calls.

---

## Balance — still paused, still do not touch it

Unchanged from 2026-08-22. The clean paired follow-up (3 arms x 2 mazes x
3000, one family per fusion, seeds `20340801+`) is still queued and still not
run.

## Next-session prompt — SESSION A (paste this now, Sonnet 5)

```
Resume Elementia. Read first:
  docs/handoffs/2026-08-23-review-remainder-and-playtest.md

Touch controls, the DOM build palette, select-then-confirm sell and the audio
fixes are all landed (964a45c, b85e9ad, fc94ed7, 2c0cabb, d405786) and three
adversarial Opus 5 review passes have been actioned (cdfda15). Suite is
855/853/0/2.

Do items 1, 2, 4 and 5 of that handoff's SESSION A section: the placement
ghost contrast fix, generalizing the theme-contrast gate to account for draw
alpha, checking/fixing whether a second match goes silent, and the small cheap
items (haptics, palette a11y, the reflow cache, the HUD geometry test). Verify
each fix live against a running server, not just by unit test -- the handoff
has the recipe and its two gotchas.

Do NOT touch item 3 (tap-to-ghost build) -- that is explicitly deferred to a
new Opus 5 session per Philip's instruction, because it touches an input path.
Do NOT start or retune the balance program.

When done: run the full suite, commit, then write the SESSION B handoff (copy
the "SESSION B" section of this file into a new dated handoff doc with your
actual commit SHAs and suite count) so the next session can pick up tap-to-
ghost + the playtest on Opus 5.
```

## Next-session prompt — SESSION B (paste this after Session A hands off, Opus 5)

```
Resume Elementia on Opus 5. Read first the SESSION B handoff Session A wrote
(check docs/handoffs/ for the newest file), which itself continues
docs/handoffs/2026-08-23-review-remainder-and-playtest.md.

Session A landed items 1/2/4/5 of the review remainder. This session:

1. CONFIRM WITH PHILIP before building anything: tap-to-ghost build on touch
   (item 3). He declined it once on 2026-08-22; the design review has since
   argued it got more urgent. If approved, implement it -- touch only, first
   tap ghosts, second tap on the same tile commits, desktop unchanged.

2. PLAYTEST. Nothing in this entire body of work has been played by a human.
   Local solo with bots works today and is enough -- do not let a deploy
   block it. Online multiplayer is built (render.yaml exists) but not
   currently deployed and there is no git remote; deploying is a real option
   if Philip wants other people in, but it is not required for a first
   playtest.

Do not start or retune the balance program.
```
