# Handoff — build-palette thumbnails (spec §2)

Date: 2026-08-31. Written at the end of a session that shipped the MENU
(controls list + restart), dropped pause, and added the first deliberate
wire-protocol change. §2 is next per the spec's own ordering, and this time
the open question in it has already been resolved with measurements.

---

## READ THIS FIRST

`docs/plans/2026-08-30-playtest-ui-specs.md` is the source of truth. It now
opens with a **status table** — read that before anything else, because three
of its six sections describe work that is already done and two of them say so
in a banner.

**Read §2 in full.** It was rewritten this session with the art measured out of
the shipped files, and it resolves the "frame rect vs exported thumbnails"
question §7 had left open. **Do not re-derive the art facts or re-audit the
frames — the numbers are in §2 and they were measured, not assumed.**

---

## What is DONE and committed

Local `master` is `614d6f8` plus the doc commit this file belongs to.
**Nothing since `f7a3c98` has been published** — see Publishing below.

| commit | what |
|---|---|
| `6303f31` | Controls panel: one DOM panel, two doors (build palette + a docked button during the action phase). |
| `2da00a9` | Stamped the spec and the previous handoff. |
| `3898c85` | Turned it into a **MENU** with a working **RESTART MATCH**; dropped pause entirely. |
| `614d6f8` | Spec + handoff updated: pause will-not-do, restart shipped. |

Both decisions the previous handoff was waiting on were taken:

- **Pause: dropped.** The menu opens over a running match. The sim is
  server-authoritative at 60Hz with bots in every empty seat, so a client-side
  freeze was never coherent, and stopping the server tick was not worth the
  multiplayer semantics.
- **Restart: the MATCH, in the same room, and anyone in the room may press
  it.** The griefing tradeoff was put explicitly and open access was chosen.
  The client requires a confirm; the server enforces a 3s per-room cooldown.

Three things from that work that shape anything you build next:

1. **A finished run no longer destroys its room.** `loop.js` onEnd used to call
   `destroyRoom` immediately. A finished room now waits out a five-minute grace
   window with its loop stopped, and that timer is cleared on **every** teardown
   path in `server/rooms/index.js` — room codes are reusable, so a timer
   outliving its room would destroy a *different* room later.
2. **`RESTART_MATCH` is the first deliberate break of the no-wire-change rule.**
   The rule still stands for everything else; breaking it again needs the same
   kind of sign-off.
3. **A phase can turn over while a panel is open**, which swaps which door
   button exists. `visibleMenuDoor()` on the palette exists so `close()` can
   hand focus to whichever door is on screen now, instead of to a button that
   has since been hidden. Found live, not in review.

---

## Next work: thumbnails in the build palette (§2)

Nine buttons, one per buildable, currently text-only. Give each one its art.

### The shape of it, already decided in §2

Slice the shipped sheets in CSS. **No build step, no new asset files, no
exported thumbnail set.** Everything needed is already loaded:

- `client/src/render/contentBoxes.js` (GENERATED — regenerate with
  `tools/art/measure_content_boxes.mjs`, never hand-edit) gives the box the
  visible pixels occupy inside a frame. Show that box, not the frame, or
  `farm` renders as 22x22 of art in a 32x32 mostly-empty square.
- Phaser's texture manager gives where that frame sits on the sheet:
  `scene.textures.get(key).get(frameName)` → `cutX/cutY/cutWidth/cutHeight`.
- Add the two together for a plain image the offset is zero, because the frame
  is the whole file.

**GameScene computes the rects and passes plain numbers into the palette.**
`buildPalette.js` owns DOM and holds no game state by design — it must not grow
a Phaser import to do this.

§2 lists the exact file, kind, frame size and chosen idle frame for all nine.
Two things in that table will bite if skipped:

- `wind_special` loads **`wind_vortex.png`**. Resolve every file through
  `structureArtKey()` in `client/src/assets/manifest.js`, never by guessing
  from the key. Guessing by filename is how a stale unregistered file got
  measured earlier in this project.
- Fusions are **not** buildables and are out of scope. `BUILDABLE_TYPES` is
  nine entries; fusions are made by combining placed structures.

### What must not regress

- Every target stays **>= 44 real CSS px**. Thumbnails make buttons taller,
  which is fine; they must never make them narrower.
- **Watch the dock.** The palette publishes its height as `--ep-dock` and the
  canvas is fitted above it, capped at 40% of viewport height. Nine wrapped
  buttons that each grew a thumbnail eat board space on a phone. Measure the
  dock at 375px wide before and after; if it nears the cap, the thumbnail is
  too big.
- **Disabled is an explicit dimmed palette, never opacity.** Opacity compounded
  with `.ep-why`'s own and put the refusal text at 2.67:1 — the least legible
  thing on the panel, and the whole point of the feature.
- **`aria-disabled`, never the native `disabled` attribute.** A natively
  disabled button leaves the tab order and the accessible name tree, so a
  screen-reader user could never reach the text explaining the refusal.
- The thumbnail is decorative: `aria-hidden="true"`. `aria-label` already
  carries name, cost and reason, and a double-read is worse than no image.
- Selection is carried by **border weight plus background**, not hue alone.

---

## Method — do not skip

**Verify before claiming.** `npm test` — currently **941 tests, 939 pass, 2
pre-existing skips**. Then drive a real match and assert on live state.

Getting a match running in this sandbox, which is not obvious:

- The Browser pane runs with `document.hidden`, so `window.innerHeight` is 0,
  nothing renders on its own, and **screenshots do not work**. Verification is
  state-level.
- Because rAF never fires, you must pump the loop by hand:
  `window.__game.loop.step(t)` with a monotonically increasing `t`. Scenes will
  not even transition without it — `Preload` finishes but `GameScene` sits at
  status 1 until you step.
- Drive the lobby with `element.click()` from `javascript_tool`; the pane's own
  click tool refuses, because with a 0-size viewport every element reads as
  off-screen.
- `--ep-dock` will read as 0 here no matter what, because the dock is capped at
  `innerHeight * 0.4` and `innerHeight` is 0. Do not chase that; set the
  variable by hand if you need to check something that depends on it.
- Editing a file triggers an HMR reload that resets the match. Finish your
  edits before starting a verification run.

**Do not use Bash to run dev servers** — except that `preview_start` is scoped
to whatever directory the session opened in, and will not see this repo's
`.claude/launch.json` if the session started elsewhere. If it cannot find the
`dev` config, `npm run dev` in the background and `navigate` to
`http://localhost:5173/` is the working fallback. Ports 5173 (vite) and 3000
(nodemon) are both wanted.

**Publishing.** Never `git push` master directly and never `git checkout` —
`test/harness/store/` is 1.6GB with two files over GitHub's 100MB hard limit,
and switching branches makes git refuse to move 29 huge files. Use the plumbing
recipe in the memory file `elementia-publish-to-render-recipe.md`: read-tree,
`rm --cached` the store, `write-tree`, `commit-tree`, push the resulting SHA.
Render auto-deploys; poll the live bundle to confirm rather than assuming.

**Nothing since `f7a3c98` is live.** Four commits of finished, verified work
are sitting local. Publishing is Philip's call — offer it, do not assume it.

---

## Key files

```
docs/plans/2026-08-30-playtest-ui-specs.md   status table + §2 — READ FIRST
client/src/ui/buildPalette.js                the nine buttons; DOM patterns
client/src/ui/menuPanel.js                   the panel pattern, focus handling
client/src/assets/manifest.js                structureArtKey() — resolve here
client/src/render/contentBoxes.js            GENERATED — do not hand-edit
tools/art/measure_content_boxes.mjs          regenerates the above
client/src/render/structureVisuals.js        how the board fits art to a tile
client/src/scenes/GameScene.js               palette + menu creation and wiring
test/client/menuPanel.test.js                pure-content test pattern
test/net/restart.test.js                     end-to-end netcode test pattern
```

---

## Recommended setup

- **Model: Sonnet 5.** DOM work against a decided path, with the art facts
  already measured and written down. No architecture, no protocol, no balance
  reasoning. (This session ran on Opus 5 because it took on the wire-protocol
  change; §2 does not.)
- **Subagents: none.** One sequential thread. A cold subagent would only
  re-derive what §2 already records.
- **Review before merge, one role:** **Accessibility (Sonnet 5)** — a
  decorative image added to nine existing labelled buttons is exactly the
  change that double-reads a screen-reader label or reintroduces opacity
  dimming.

---

## Remaining playtest items after this one

Per §7: §5 character select (touches the wire and the server; do it while the
lobby is still unthemed), then **theming last** (§6) so it styles the final set
of surfaces once. Theming must not lighten the board — the ground was rendered
at a deliberate dusk value so sprites read against it.

Still open from §1: `farm.png` fills only 69% of its frame and is the one asset
genuinely worth re-cropping. The renderer compensates by scaling its content
up, so this is cosmetic sharpness, not a layout bug — and it is the same asset
whose thumbnail will look softest, so §2 may make the case for it.

---

## Session state

Working tree carries pre-existing WIP that is **not mine and was left alone**,
for the third session running: `tools/art/ground_pipeline.py` modified, plus 20
untracked PNGs under `art/source/water_special_fx/` and
`art/source/wind_special_fx/`. Check `art/assets-manifest.json` before assuming
those are new work. Worth asking Philip whether they should be committed or
discarded — they have outlived three handoffs.
