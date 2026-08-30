# Blizzard production QA

Date: 2026-08-09

- Source lineage: retained the approved draft and chroma-key originals under `art/source/blizzard/`; style calibration anchors are recorded in the ledger.
- Packaging: `node --test test/art/blizzardPipeline.test.js` produces a 64x64 RGBA structure image and a 196x64 RGBA atlas with `warning_0.png`, `spike_0.png`, and `shatter_0.png`.
- Runtime wiring: gameplay-integrated 2026-08-10, on `codex/redesign-reconciliation` (not `master` — see the branch-reconciliation note in this session's handoff). `blizzard` registered in `IMAGES` (structure image); `blizzard_fx` registered in `ATLASES` (target-point atlas).
- The source branch's loader entries and event consumer (a `state.fx`-array `{type:'blizzard'}` event, a `GameScene.js` `case 'blizzard':` handler, and `audio.js`'s `FX_MAP.blizzard`) assumed Blizzard still fired through the old default tower-fire path. On this branch Blizzard has been on the `targetImpact` behavior family (`structureBehaviors/targetImpact.js`) since before this delivery, so that whole mechanism is dead code here — removed rather than kept. Wired instead through the same `ds.tx`/`ds.ty` + `cycleSeq`-bump mechanism Rock Trap already used, generalizing what was a Rock-Trap-only hardcoded branch in `GameScene.js` into `STRUCTURE_TARGET_FX`/`STRUCTURE_TARGET_WARNING_FX` lookup tables: `warning` fires once on the `targetImpact` phase 0->1 edge, `spike` then `shatter` chain via `_spawnAttackFx`'s existing state-sequencing on the impact's `cycleSeq` bump.
- Not yet done: a manual Phaser playtest pass confirming the warning/spike/shatter sequence reads correctly in the live scene (build + `npm test` + `test:asset-delivery` all pass, but no visual capture was taken this session).
