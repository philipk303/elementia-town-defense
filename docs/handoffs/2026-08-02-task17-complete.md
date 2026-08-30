# Handoff — Task 17 complete, Task 18 next

**Session date:** 2026-08-02
**Branch:** `codex/redesign-reconciliation`
**Commit:** `c08194a` — feat: add bounded combat animation controller

## Where we are

Task 17 (reusable combat animation controller) is done: `client/src/render/AnimationController.js`
(`CharacterAnimator`, `StructureAnimator`) and `client/src/render/EffectPool.js`, wired into
`GameScene.js`/`Preload.js`/`assets/manifest.js`. 34 new headless tests
(`test/client/animationController.test.js`). Suite 608/606/2, `npm run build` clean, verified live
in-browser through a full wave (see the commit message and `elementia-phase8-plan` memory,
session 18, for the full evidence and design rationale).

All six fusions (Task 16) and this animation infrastructure are the last purely-code tasks in
`docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md` before real art enters the
picture.

## The goal

Ship the staged combat redesign program to completion — see the program plan for the full task
list (currently through Task 20).

## Key files/paths

- Program plan: `docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md` (Task 18
  section, line ~526)
- Memory: `elementia-phase8-plan` memory file, session 18 entry, has the full Task 17 write-up and
  design facts worth not re-deriving (structure-family derivation, wire-format guarantees, etc.)
- Art pipeline authority: `docs/plans/2026-07-24-art-asset-generation-pipeline.md`
- Art direction spec: `docs/superpowers/specs/2026-07-25-art-direction-and-runtime-asset-integration.md`
  (animation contract: idle/run/cast/hurt/death, 4-direction, `<state>_<dir>_<idx>.png`)
- New render modules to build ON TOP OF (do not re-derive their contract, just consume it):
  `client/src/render/AnimationController.js`, `client/src/render/EffectPool.js`

## Next concrete step

**Task 18: produce animation and VFX vertical slices** — Wind basic (wind-up/release/flight/impact),
Rock Trap (warning shadow/fall/impact), Vortex (idle swirl/suction/directional release). Follow the
manifest/GPT-Image/Pillow/Phaser-scale contract in the art pipeline plan. This is a spike-and-approve
task: build the three slices, verify authoritative geometry alignment and frame timing in-engine, then
**stop and get Philip's visual approval before producing the rest of the roster** — do not batch-generate
past the three slices without that approval.

## Open decisions / blockers

- **Task 18 needs real art assets to exist first** (GPT Image generation → Pillow conversion → atlas
  packing) — this is the first task in the program that depends on an external asset pipeline rather
  than pure code, so budget for iteration on visual quality, not just implementation time.
- Codex review of `c08194a` (Task 17) is still technically owed per the program's review lifecycle —
  not run this session. Your call whether to run it before or in parallel with Task 18.
- The `art/`, `audio/`, `client/public/`, and several `*Preview.js` files remain uncommitted WIP from a
  parallel work stream on this same branch — do not `git add -A`; stage Task 18's files by name.

## Recommended setup

- **Model: Opus 4.8 (or Opus 5 if selectable).** The program's own model-assignment table places art
  integration/visual-approval work at Opus tier — real judgment on scale/readability/timing, not
  mechanical implementation.
- **Subagents: no.** Single sequential thread (spike scene → generate/convert three slices → get
  approval). No independent parallelizable pieces.
- **Review: the task's own visual-approval gate with Philip IS the review.** Separately, a Codex/
  engineer pass on Task 17 (`c08194a`) is still outstanding per the program's lifecycle — schedule it
  before or alongside Task 18, your call.
