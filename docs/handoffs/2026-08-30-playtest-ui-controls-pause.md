# Handoff — playtest UI backlog: controls list + pause overlay

> **REMEDIATION STAMP — 2026-08-31.** Done, and then some. `6303f31` built the
> controls panel with two doors; `3898c85` turned it into a **MENU** carrying
> the controls list plus a working RESTART MATCH, and **dropped pause
> entirely** — §4b is closed as will-not-do.
>
> Both §8 decisions were taken this session: restart the MATCH in the same
> room (one new wire event, `RESTART_MATCH`), and **anyone in the room may
> press it** — the griefing tradeoff was put and accepted. The client requires
> a confirm; the server enforces a 3s per-room cooldown.
>
> The section below headed "Open decisions — ask before building either" is
> therefore **stale**; the spec's status table is current.
>
> One lifecycle change worth knowing: a finished run no longer destroys its
> room instantly, or restart would be impossible at the end screen. It waits
> out a five-minute grace window instead.
>
> 941 tests, 939 pass, 2 pre-existing skips. Verified in a live match.
> **Not yet published to Render** — that needs the plumbing recipe below and
> was left for Philip to trigger. Next item per §7 is §2 build-palette
> thumbnails. The pre-existing WIP under "Session state" was left alone again.

Date: 2026-08-30. Written at the end of a session that took the game from
"only playable on this PC" to publicly hosted, then closed out the whole art
sizing item from the first human playtest. Five of the six playtest items
remain, and the next one is specced but not started.

---

## READ THIS FIRST — the spec is the source of truth

`docs/plans/2026-08-30-playtest-ui-specs.md` specs all six playtest items
individually, grounded in measurements taken from the code rather than
assumptions. **Read §3 (controls list) and §4a (pause overlay) before writing
anything.** §7 carries the recommended order and §8 the open decisions.

Do not re-derive the bindings or re-audit the art — both were measured this
session and the numbers are in the spec and in the memory files.

---

## What is DONE and live

The game is deployed: **https://elementia-town-defense.onrender.com**
Public repo: `philipk303/elementia-town-defense` (snapshot lineage, NOT the
real history). Render Blueprint auto-deploys on push to that repo's master.

Landed this session, in order:

| commit | what |
|---|---|
| `14b2821` | Phaser was capturing W/A/S/D/Q/E/F window-wide, blocking typing those letters into the lobby name field. `enableCapture=false`. |
| `bc4a97c` | The six-item spec. |
| `bd49601` | Structure art was aspect-CRUSHED by `setDisplaySize(footprint)` — Watchtower +33%, Firepit +43%, Geyser +114%. |
| `ad77274` | Fitted art by measured CONTENT box, not frame (farm filled 69% of its tile, hall 78%). Also: `hallSprite` was **never sized at all**. |
| `e2642da` | Fitted on the RESTING pose, not the all-frames union — the idle volcano was floating ~9px above its tile. |
| `0ac69f2` | Actor art scaled to its gameplay hitbox. |

**Item 6 (structure sizing) is fully closed.** Verified in a live match, not
assumed: every structure's idle content spans its footprint width exactly with
its bottom edge on the ground line; all four player elements draw at 36.4px
from native widths of 43/38/25/33; goblin 18.2, orc 23.4.

Three lessons from that work worth keeping in mind:

1. **Measure, do not eyeball.** Every one of the three stacked defects was
   invisible until measured. `tools/art/measure_content_boxes.mjs` decodes PNG
   alpha with no dependencies — reuse it for any future art question.
2. **Resolve art files through the client manifest, never by key name.**
   `firestorm` loads `firestorm_fx.png`, and a superseded `art/firestorm.png`
   is still on disk and deliberately unregistered. Guessing by filename
   measured that stale file and reported the wrong frame size.
3. **Animated assets must be fitted on their idle frames.** Fitting the union
   of all frames sizes a structure by its loudest moment.

---

## Next work: controls list (§3) + pause overlay (§4a)

Treat these as ONE piece of work. The controls panel is the payload; the pause
button is one of its two doors (the other is a button in the build palette).

### Build it in DOM, not Phaser

`client/src/ui/buildPalette.js:4-22` documents why, with receipts: three of the
four Phaser-drawn UI surfaces sized their touch targets in LOGICAL pixels,
which under `Scale.FIT` is a fraction of a real pixel — shipping 7.6px ability
buttons. DOM is authored in real CSS pixels. **Keep every target >= 44px.**

Two a11y patterns in that file must NOT be regressed:
- `aria-disabled`, never the native `disabled` attribute — a natively disabled
  button drops out of the tab order and out of the accessible name tree, so a
  screen-reader user could never reach the text explaining the refusal
  (`buildPalette.js:57-67`).
- Disabled state is an explicit dimmed palette, not an opacity multiplier —
  opacity compounded and dropped the reason text to 2.67:1 contrast.

### Render the scheme the player is actually using

`GameScene` already tracks this. Reuse `this._inputScheme` and
`_noteSchemeUsed()` (`GameScene.js:534` and `:636`); `prefersTouchFirst` picks
the initial scheme and any real keypress flips a hybrid device back to desktop.
**Do not introduce a second notion of input mode.**

`inputHints()` (`client/src/input/touchControls.js:377`) already writes both
schemes in prose. Read it before writing new strings.

### The real bindings, verified 2026-08-30

```
move          W A S D            GameScene.js:517-523
special       Q
second        E
repair        F
select build  1-9                GameScene.js:548-552
rotate        R                  GameScene.js:572
output dir    arrow keys         GameScene.js:573-576
fusion Y/N    Y / N              GameScene.js:561
mute          M                  GameScene.js:535
HUD size      [ and ]            GameScene.js:543
touch         twin sticks + DOM build palette + tap-to-ghost confirm
```

### The constraint that shapes §4a

The sim is **server-authoritative at 60Hz** (`server/game/loop.js`) and a room
**always holds 4 slots**, with bots filling every seat a human is not in
(`server/rooms/index.js:173-186`). There is no offline or solo mode — even a
one-player game is a networked room.

So a client-side freeze cannot work: the server keeps simulating and the client
would snap forward on resume. **§4a is therefore a pause BUTTON that opens the
controls panel over a still-running game.** No server change, no wire change.
That covers the stated need, which was reading the controls mid-match.

---

## Open decisions — ask before building either

- **§4b real pause.** Stopping the tick is a server feature. Who may pause —
  anyone, or the host? What happens to other humans in the room (being frozen
  by a stranger is a grief vector)? Gate it to rooms with one human? It needs
  new wire events, which deliberately breaks the standing no-protocol-change
  rule from the touch work, so it needs sign-off.
- **"restart wave" vs "restart match".** Very different jobs. Restarting a WAVE
  means rolling back gold spent and structures built and destroyed during it.
  Restarting the MATCH is far cheaper and honest. Confirm which is wanted.

Neither blocks §4a. Do not let them.

---

## Remaining playtest items after this one

Per spec §7: build-palette thumbnails (§2), character select (§5), then
**theming last** (§6) — theming first would mean styling the build palette and
lobby twice, since both are about to change. Theming must not lighten the
board: the ground was rendered at a deliberate dusk value so sprites read
against it.

One small piece of item 6 is still open: `farm.png` fills only 69% of its frame
and is the one asset genuinely worth re-cropping. The renderer now compensates
by scaling its content up, so this is cosmetic sharpness, not a layout bug.

---

## Method — do not skip

**Verify before claiming.** `npm test` — currently 932 tests, 930 pass, 2
pre-existing skips. Then drive a real match: `preview_start` the `dev` config
(port 3000 usually already has a server running — reuse it rather than fighting
for the port), pump `window.__game.loop.step()` and assert on live DOM/state.
**Screenshots do not work in this sandbox** (`document.hidden`), so verification
is state-level. Editing a file triggers an HMR reload that resets the match, so
finish edits before starting a verification run.

**Publishing.** Never `git push` master directly and never `git checkout` —
`test/harness/store/` is 1.6GB with two files over GitHub's 100MB hard limit,
and switching branches makes git refuse to move 29 huge files. Use the plumbing
recipe in the memory file `elementia-publish-to-render-recipe.md`: read-tree,
`rm --cached` the store, `write-tree`, `commit-tree`, push the resulting SHA.
Render auto-deploys; poll the live bundle to confirm rather than assuming.

---

## Key files

```
docs/plans/2026-08-30-playtest-ui-specs.md   the six-item spec — READ FIRST
client/src/ui/buildPalette.js                the DOM UI pattern to copy
client/src/input/touchControls.js:377        inputHints(), both schemes in prose
client/src/scenes/GameScene.js:517-576       every keyboard binding
client/src/scenes/GameScene.js:534,:636      _noteSchemeUsed / _inputScheme
server/game/loop.js                          60Hz authoritative tick
server/rooms/index.js:173-186                bots always fill 4 slots
client/src/render/structureVisuals.js        art->footprint fit (done)
client/src/render/actorVisuals.js            art->hitbox scale (done)
client/src/render/contentBoxes.js            GENERATED — do not hand-edit
tools/art/measure_content_boxes.mjs          regenerates the above
```

---

## Recommended setup

- **Model: Sonnet 5.** The next step is UI implementation with a decided path —
  a DOM panel matching an existing pattern, plus a button. No architecture, no
  balance reasoning, no tricky debugging. Switch to **Opus 5** only if §4b (real
  pause) is taken on, since that is a protocol change with multiplayer
  semantics.
- **Subagents: none.** One sequential thread — build the panel, wire two entry
  points, verify. Nothing independent to parallelize, and a cold subagent would
  only re-derive what this file already records.
- **Review before merge, two roles:**
  - **Accessibility (Sonnet 5)** — a new interactive panel, and Philip uses a
    screen reader. The `aria-disabled` and dimmed-palette patterns above are
    exactly what a new panel tends to undo.
  - **Designer / UX (Opus 5)** — player-facing overlay with an unresolved
    question about what "pause" means when it cannot actually pause.

---

## Session state

Local `master` is `0ac69f2`; public repo master is `f7a3c98` (same content,
store stripped). Everything is committed and published — the live site was
polled and confirmed to be serving the new bundle.

Working tree carries pre-existing WIP that is **not mine and was left alone**:
`tools/art/ground_pipeline.py` modified, plus 20 untracked PNGs under
`art/source/water_special_fx/` and `art/source/wind_special_fx/`. Check
`art/assets-manifest.json` before assuming those are new work.
