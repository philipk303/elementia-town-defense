# Session handoff — HUD legibility + fusion buttons landed & reviewed, input seam next

Date: 2026-08-22. Continues `docs/handoffs/2026-08-19-touch-controls-hud-handoff.md`.

Commits this session: `c608b93`, `6178f94`, `884c717`. Suite still **801
tests, 799 pass, 0 fail, 2 skipped**. Build clean, nothing half-finished.

## What landed

1. **`c608b93` — HUD legibility.** Player HP + Hall HP status row (top-left,
   bar + numeric text, redrawn every frame in `update()`). `this.hudScale`
   (0.75–2.5, `[`/`]` keys, persisted to `localStorage['elementia.hudScale']`)
   drives HUD font sizes, line spacing, the status bars, and the ability-bar
   geometry. Raw server `tick` moved behind `?debug=1`.
2. **`6178f94` — fusion prompt buttons.** `_respondFusion(prompt, accept)`
   and `_setFusionDir(dir)` factor the accept/reject/direction logic out of
   the keydown handler so the Y/N/arrow keys and the new on-screen buttons
   share one path. The prompt renders as a centered panel with clickable
   ACCEPT/REJECT, plus N/E/S/W for a directional fusion's initiator.
3. **`884c717` — adversarial review fixes.** An Opus 5 review of the above
   two commits (full report below) found and fixed:
   - **Click-through** (serious): clicking the panel's body/text/gaps — not
     a button — fell through to the build-phase handler underneath, which
     could `BUILD_STRUCTURE` or `SELL_STRUCTURE` on the tile the panel was
     covering. Fixed: any click inside the panel's own recorded bounds
     (`this._fusionPanelHit`) is now swallowed unconditionally.
   - **Stale-prompt race** (serious): a button click re-resolved
     `_activeFusionPrompt()` at click time instead of checking the prompt it
     was drawn for. With two proposals pending, one resolving/expiring
     between the draw frame and the click could let a stale ACCEPT rect
     silently answer a *different* proposal the player never read. Fixed:
     `this._fusionPanelHit.promptId` must match before a button click acts.
   - Button-row Y offset dropped the text's own top margin (crowds the last
     text line at high hudScale) — fixed.
   - No word-wrap on the prompt text and no width ceiling on the panel or
     the top HUD line — could bleed off both screen edges at high hudScale.
     Fixed with `setWordWrapWidth` + a `this.scale.width` clamp; the
     `HUD X.XXx ([/])` suffix this session had added to the persistent top
     HUD line was removed rather than also being wrapped, since it wasn't
     load-bearing (pressing `[`/`]` is its own instant feedback).
   - A bystander (not in a proposal's `requiredIds`) got the full centered
     panel with zero buttons for the whole timed duration — pure
     obstruction. Fixed: bystanders now get the old compact top-left line.

## What was NOT verified this session — read before trusting it blind

**No live browser render happened, for either the original two commits or
the review fixes.** `preview_start` opened both `server` (port 3000) and
`dev` (port 5173) fine, socket.io connected, all art/atlas requests returned
200, and `node --check` passed on every edit. But `document.hidden` was
`true` for the whole session — the Browser pane in this sandbox never
actually composited a frame — and Phaser's game loop is gated on page
visibility, so `Preload.create()` never ran, `GameScene` never reached
`create()`, and `window.__scene` never existed to inspect. Manually stepping
`game.loop.step()` did not unstick it either. This looks like an environment
limitation of this particular sandboxed session, not a bug in the app — but
it means everything in this handoff (including the review fixes) is reasoned
math and control flow, never actually rendered or clicked.

**Before trusting the HUD/fusion-panel layout, actually load the game** (`npm
run dev`, or the existing `.claude/launch.json` `dev`/`server` configs) and
eyeball it at desktop, tablet (~1024x768) and phone viewports, and click
through a real fusion proposal (two humans or a human + the fusion prompt
against a bot-filled team) end to end. Specifically re-verify:
- The panel no longer swallows clicks meant for the board *outside* its
  bounds (only clicks inside `_fusionPanelHit`'s rect should be caught).
- Two fusion proposals pending at once, click ACCEPT on the first, let it
  resolve, confirm the panel correctly retargets the second one rather than
  going stale.
- Status-row bar/text vertical alignment and fusion panel sizing at
  `hudScale` 0.75, 1, 1.5, 2.5, at both 1280px and ~375px canvas widths.
- `[`/`]` actually change ability-bar size and status-bar size together.
- There is still **no automated test** for any of `GameScene.js`'s
  rendering — `themeContrast.test.js`/`groundLayer.test.js` only regex a
  couple of literal color values out of the file text.

## Full adversarial review report (Opus 5, 2026-08-22)

Kept verbatim for anyone who wants the reviewer's own reasoning, not just the
summary above:

> **1. Panel does not block click-through; only its six button rects do.**
> The comment claimed clicking through the panel must never fall through to
> build/sell, but the guard was button-rects only. A fusion prompt is live
> during the build phase (the phase fusions occur in); clicking the panel
> body/text/gap fell through to `pointer.worldX/worldY` resolving a tile
> *behind* the 85%-opacity panel. Fixed by recording the panel's own rect
> and returning on any hit inside it, buttons-first.
>
> **2. The click re-resolves the prompt instead of using the one the buttons
> were drawn for.** Rects are laid out for whatever `_activeFusionPrompt()`
> returned last frame; the handler called it again. With two proposals
> pending, one expiring/resolving in the frame between draw and click could
> let a stale ACCEPT rect fuse a proposal the player never read. Fixed by
> requiring the prompt id to match.
>
> **3. Button row starts too close to the text** — the 14×scale top offset
> the text used wasn't carried into the button-row Y calc, so at high scale
> or a taller wrapped message, buttons could visually collide with the text.
>
> **4. No word-wrap, no panel/line width ceiling** — at hudScale 2.5 an
> ~80-char monospace line is ~1700px on a 1280px canvas; panel bleeds off
> both edges, and the top HUD line (which also grew this session) overruns
> the fixed-position wave-preview widget.
>
> **5. Bystanders get a full centered panel they cannot act on** — a player
> not in `requiredIds` got a large opaque center-screen panel with zero
> buttons for the whole timed duration, plus (via finding 1) couldn't safely
> click the board underneath it either.
>
> **Checked and clean:** `pointer.x/y` are correctly in Phaser's
> logical/game coordinate space under `Scale.FIT` (confirmed via
> `InputManager.transformPointer` dividing by `displayScale`) — not raw DOM
> pixels, so hit-testing math itself was sound. `_layoutHud()` creation-order
> dependencies were all satisfied. `this._statusBarLayout` always written
> before read. `net.element`/`me.hp` degrade gracefully via `?.`/`??`.
> `BALANCE.PLAYER.CLASS[x].maxHp` is static, can't drift. `hallHpBar` and
> `_sendInput()` (the wire-protocol-critical method) were untouched by both
> commits — confirmed safe. Zero test coverage of any of `GameScene.js`'s
> actual rendering exists.

## What's left: the input seam + twin virtual sticks

This is the one piece flagged from the start as needing the strongest hand —
a subtle desktop/touch divergence would silently fork the game the entire
17,000+-run balance corpus measures. It was deliberately NOT started across
either of the last two sessions so it wouldn't get a rushed pass.

Everything from the 2026-08-19 handoff's plan still applies verbatim — see
that file's "3. INPUT SEAM + TWIN VIRTUAL STICKS" section and "THE LOAD-
BEARING CONSTRAINT" below it. Restated:

- Every gameplay input funnels through one per-frame `PLAYER_INPUT` packet
  built in `_sendInput()` (`client/src/scenes/GameScene.js` — search for the
  method name; line numbers have shifted across the three commits above).
  `keys{w,a,s,d}`, `aimX/aimY`, `actions{basic,special,second,repair}`.
- Add an input-source seam inside `_sendInput` so desktop reads
  keyboard+mouse (unchanged) and touch reads twin virtual sticks, both
  producing the exact same shape. **Do not change the wire protocol.**
  Server, `matchRunner`, and the balance corpus stay untouched.
- Movement stays boolean (8-way quantization) — parity with desktop's own
  8-way input, not a downgrade. Lifting it later means a protocol change AND
  a re-take of the corpus.
- Detect touch via `navigator.maxTouchPoints` + first pointer type, not user
  agent, so hybrid laptops/tablets keep both input paths live.
- `touch-action: none` on the canvas, or drags become page scroll.
- Bottom-left/bottom-right are empty in the current HUD — sticks go there.
  Merge with the existing bottom-center ability bar rather than drawing two
  separate widgets for the same cooldown state.
- Hint strings (the `buildHud` line) must be generated from the active input
  scheme, not forked — still hardcoded keyboard prose today (`WASD move ·
  click melee · Q special · E second (L4) · F repair`).
- **New from this session's review, applies to touch too:** whatever hit-
  testing pattern the twin sticks and touch ability/fusion buttons use should
  follow the same two lessons just paid for in cash — (a) any tap inside a
  control's own bounds should be swallowed, never fall through to a
  world-space action underneath it, and (b) if a touch control's hit-test
  target can change between frames (e.g. which prompt is active, which
  ability is selected), re-validate identity at the moment of the tap, not
  just position.

Still-open, recommended-but-not-confirmed items are unchanged from the
2026-08-19 handoff (build/sell tap-to-ghost safety, repair-as-toggle on
touch, hiding the rotate control for square footprints, whether touch is a
supported platform or an experiment) — ask Philip before committing to any of
those, none are blocking.

## Sequencing reminder (unchanged, still the thing that matters most)

Desktop playtesting can start today — it does not need touch. The balance
program's biggest open threat is still the empty cross-policy gate (only
`scripted-v1` exists). Don't let the input-seam work block scheduling a human
playtest.

## Balance — still paused deliberately, still don't touch it

Same status as 2026-08-19: R2 fusion roster re-take (`fc32f6f..823ad44`)
found every fusion resolvably harmful on its non-preferred maze; the
follow-up showed 58–96% of that split is the shared control's own maze
swing, not the fusion's (unpaired, descriptive only — see
`docs/reviews/2026-08-16-maze-split-mechanism.md`). The clean paired
follow-up (3 arms × 2 mazes × 3000, one family per fusion, seeds
`20340801+`) is still queued and still not run.

## Recommended setup for the input-seam session

- **Model: Opus 5**, not Sonnet — this is the one piece where a subtle
  mistake silently invalidates the balance corpus.
- **Subagents: no.** The input seam, the stick rendering, and the hint-string
  generation all touch the same handful of methods in one 1700+-line file.
- **Review: two passes** before merging — an engineer/code pass specifically
  hunting for desktop/touch behavioral divergence (this session's review
  found two serious bugs in a much smaller, lower-stakes change — budget for
  at least that much scrutiny here), and a designer/UX + accessibility pass
  on touch target sizes (44px minimum), stick placement, and whether
  `user-scalable=no` in `client/index.html` stays deliberate.
- **Check `document.hidden` early** if using this sandbox's Browser pane —
  confirm it can actually composite a frame before relying on it for the
  touch-target and drag-gesture testing this feature needs. If it can't,
  say so plainly rather than shipping untested claims, same as this session.

## Next-session prompt

```
Resume Elementia. Read first:
  docs/handoffs/2026-08-22-touch-input-seam-handoff.md
  docs/handoffs/2026-08-19-touch-controls-hud-handoff.md (original full plan)

HUD legibility (c608b93), fusion prompt buttons (6178f94), and an Opus 5
adversarial-review fix pass (884c717, two serious bugs: panel click-through
to build/sell, and a stale-prompt race that could silently mis-accept a
different fusion proposal) are all landed and unit-tested (801/799/0/2) but
NEVER RENDERED LIVE -- the sandbox's Browser pane didn't composite a frame in
either session (document.hidden stayed true, so Phaser's loop never ran).
Check document.hidden early this session; if the pane works, load the game
for real and walk through a full fusion accept/reject/direction flow plus the
HUD at desktop + tablet + phone widths BEFORE building anything else on top.

The only remaining piece of the touch-controls plan is the input seam + twin
virtual sticks (Step 3 of the original plan, restated in full in this
handoff). This is the highest-stakes item in the whole plan: a subtle
desktop/touch divergence in _sendInput would silently fork the game that the
entire balance corpus (17,000+ runs) measures. Use Opus 5. Work
single-threaded, no subagents -- everything converges on GameScene.js. Two
review passes before merging: engineer/code hunting specifically for
behavioral divergence (this session's review found two serious bugs in a
much smaller change -- budget commensurate scrutiny), and designer/UX +
accessibility on touch target sizes and stick placement.

Do not start or retune the balance program this session.
```
