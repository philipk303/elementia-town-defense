# Elemental Structure Assets Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package and integrate the four August 8 elemental structure graphic assets with truthful graphics-pipeline records.

**Architecture:** Recover the already-produced Water Geyser commit before moving the uncommitted Rock Trap assets onto the current base. Generate Firepit and Wind Vortex into the same source-to-atlas boundary, then use the existing client manifest and structure renderer without changing simulation behavior.

**Tech Stack:** PNG source frames, Python/Pillow packers, Phaser 3 atlas loading, Node test runner, Vite.

## Global Constraints

- Only Water Geyser, Rock Trap, Firepit, and Wind Vortex art assets created or directed on 2026-08-08 are in scope.
- Do not modify gameplay, balance, collision, networking, placement, or audio behavior.
- Preserve generated source images locally under `art/source/` and do not overwrite prior accepted sources.
- Register production completion in `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`, and per-asset QA evidence.

---

### Task 1: Recover Water Geyser

**Files:**
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/water-geyser-production-qa.md`
- Recover from commit: `09ca920`
- Test: `test/client/waterGeyserAtlas.test.js`

- [ ] Cherry-pick `09ca920` onto the current branch and resolve only asset-boundary conflicts.
- [ ] Run `node --test test/client/waterGeyserAtlas.test.js test/client/structureVisuals.test.js` and verify atlas metadata and renderer dimensions.
- [ ] Run `npm run build` and record the command and result in `docs/assets/water-geyser-production-qa.md`.
- [ ] Mark `water_geyser` production-converted and gameplay-integrated in the asset manifest and inventory with its source directory, atlas paths, frame count, and QA evidence.
- [ ] Commit only the Water Geyser recovery and ledger changes with `git commit -m "feat(art): integrate water geyser assets"`.

### Task 2: Recover Rock Trap

**Files:**
- Create: `art/source/rock-trap/`
- Create: `client/public/art/earth_special.png`
- Create: `client/public/art/earth_special.json`
- Create: `client/public/art/rock_trap_fx.png`
- Create: `client/public/art/rock_trap_fx.json`
- Create: `tools/art/generate_rock_trap.py`
- Modify: `client/src/assets/manifest.js`
- Modify: `client/src/scenes/GameScene.js`
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/rock-trap-production-qa.md`
- Test: `test/client/structureVisuals.test.js`

- [ ] Copy only Rock Trap source frames, packer, atlas outputs, and display-only client integration from `C:/Users/phili/.codex/worktrees/ecb8/Elementia-Town-Defense`.
- [ ] Add or update a focused client test that asserts `earth_special` and `rock_trap_fx` metadata are loadable and do not alter the structure footprint.
- [ ] Run the focused test, regenerate both atlases with `python tools/art/generate_rock_trap.py`, and rerun the test.
- [ ] Run `npm run build`, write the result and visual-inspection notes to `docs/assets/rock-trap-production-qa.md`, and update both graphics ledgers.
- [ ] Commit only Rock Trap files with `git commit -m "feat(art): package rock trap assets"`.

### Task 3: Produce Firepit assets

**Files:**
- Create: `art/source/firepit/`
- Create: `tools/art/firepit_pipeline.py`
- Create: `client/public/art/fire_special.png`
- Create: `client/public/art/fire_special.json`
- Modify: `client/src/assets/manifest.js`
- Modify: `client/src/render/structureVisuals.js`
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/firepit-production-qa.md`
- Create: `test/client/firepitAtlas.test.js`

- [ ] Generate a local Firepit source image using the approved fire-direction session contract, then extract or author idle, flame, and flare source frames without changing gameplay state names.
- [ ] Write `test/client/firepitAtlas.test.js` to require `fire_special` PNG/JSON metadata with `idle`, `flame`, and `flare` frames before registering it.
- [ ] Implement the deterministic Pillow packer, run it, register the atlas through the existing display-only structure path, and rerun the focused test.
- [ ] Run `npm run build`; record source lineage, frame coverage, commands, and visual QA in the Firepit QA file and graphics ledgers.
- [ ] Commit only Firepit files with `git commit -m "feat(art): package firepit assets"`.

### Task 4: Produce Wind Vortex assets

**Files:**
- Create: `art/source/wind-vortex/`
- Create: `tools/art/wind_vortex_pipeline.py`
- Create: `client/public/art/wind_special.png`
- Create: `client/public/art/wind_special.json`
- Modify: `client/src/assets/manifest.js`
- Modify: `client/src/render/structureVisuals.js`
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/wind-vortex-production-qa.md`
- Create: `test/client/windVortexAtlas.test.js`

- [ ] Generate a local Wind Vortex source image using the approved wind-direction session contract, then extract or author idle, suction, and release source frames without changing gameplay state names.
- [ ] Write `test/client/windVortexAtlas.test.js` to require `wind_special` PNG/JSON metadata with `idle`, `suction`, and `release` frames before registering it.
- [ ] Implement the deterministic Pillow packer, run it, register the atlas through the existing display-only structure path, and rerun the focused test.
- [ ] Run `npm run build`; record source lineage, frame coverage, commands, and visual QA in the Wind Vortex QA file and graphics ledgers.
- [ ] Commit only Wind Vortex files with `git commit -m "feat(art): package wind vortex assets"`.

### Task 5: Reconcile graphics ledger

**Files:**
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`

- [ ] Check all four completed entries for matching source path, atlas path, state list, frame count, runtime status, and QA evidence.
- [ ] Run `node --test test/client/waterGeyserAtlas.test.js test/client/firepitAtlas.test.js test/client/windVortexAtlas.test.js` and `npm run build`.
- [ ] Commit only the reconciliation if it is not included in prior asset commits with `git commit -m "docs(art): reconcile elemental structure ledger"`.
