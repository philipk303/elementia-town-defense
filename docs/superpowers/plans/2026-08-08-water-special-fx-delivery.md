# Water Special FX Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the existing Whirlpool source sequence as a registered, gameplay-consumed Phaser atlas on `codex/redesign-reconciliation`.

**Architecture:** Reuse `tools/art/wind_pipeline.py`'s deterministic FX profile to convert the ten source PNGs into one untrimmed 64px atlas. Register `water_special_fx` through the existing atlas loader and spawn it only for Water `SPECIAL_CAST` events at the caster position.

**Tech Stack:** Python/Pillow atlas packer, Phaser 3, Node test runner, Vite.

## Global Constraints

- Target branch: `codex/redesign-reconciliation`.
- Preserve the existing state names: `flight`, `impact`, `dissipation`.
- Source frames remain under `art/source/water_special_fx/`; runtime output is `client/public/art/water_special_fx.png` plus `.json`.
- Do not change gameplay timing, damage, events, or Wind special behavior.

---

### Task 1: Prove the declared runtime asset contract

**Files:**
- Create: `test/client/waterSpecialFxAtlas.test.js`
- Modify: `client/src/assets/manifest.js`
- Modify: `client/src/scenes/GameScene.js`

- [ ] Write a test requiring the `water_special_fx` atlas registration, ten named 64x64 untrimmed frames, and an explicit Water-only `SPECIAL_CAST` spawn path.
- [ ] Run `node --test test/client/waterSpecialFxAtlas.test.js` and confirm it fails because the package and registration do not exist.
- [ ] Add the minimum registration and Water event branch required by the test.
- [ ] Run the focused test and confirm it passes.

### Task 2: Package source, record provenance, and validate

**Files:**
- Create: `art/source/water_special_fx/*.png`
- Create: `client/public/art/water_special_fx.png`
- Create: `client/public/art/water_special_fx.json`
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/water-special-fx-production-qa.md`

- [ ] Copy the approved ten-frame source sequence into the feature worktree without replacing any other source set.
- [ ] Run `python tools/art/wind_pipeline.py --sources-dir art/source/water_special_fx --atlas-png client/public/art/water_special_fx.png --atlas-json client/public/art/water_special_fx.json --profile fx`.
- [ ] Record source provenance, output paths, runtime key, trigger, frame count, and focused-validation evidence in the graphics ledger, inventory, and QA record.
- [ ] Run the focused test, `npm test`, and `npm run build`; record their observed outcomes in the QA file.

### Task 3: Commit and merge the delivery unit

**Files:**
- All Task 1 and Task 2 files only.

- [ ] Inspect `git diff --check` and `git status --short` to confirm the delivery unit contains no unrelated files.
- [ ] Commit the complete asset group on `codex/water-special-fx-delivery`.
- [ ] Merge that commit into `codex/redesign-reconciliation` in a separate target worktree, then rerun the focused test, `npm test`, and `npm run build` there.
