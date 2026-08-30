# Water Geyser Production Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the approved rune-pool Water Geyser art as a registered directional Phaser atlas without changing gameplay behavior.

**Architecture:** Keep generated source art outside the runtime directory, generate fixed-canvas directional frames and deterministic TexturePacker-hash metadata, and register only the atlas. A focused renderer policy permits the animation's launch plume to overhang its unchanged 2×1/1×2 gameplay footprint.

**Tech Stack:** GPT Image source material, Pillow, Phaser 3, Node test runner, Vite.

## Global Constraints

- `WATER_SPECIAL` remains a walkable 2×1 or 1×2 gameplay footprint; orientation and launch direction remain independent.
- Atlas keys use `water_special`; frames use `<idle|telegraph|active|recovery|charged>_<N|E|S|W>_<idx>.png`.
- Runtime frames are untrimmed RGBA with 2px atlas gutters and nearest-neighbor presentation.
- No balance, networking, collision, pathing, or server changes.

---

### Task 1: Define and test Water Geyser visual sizing

**Files:**
- Create: `test/client/structureVisuals.test.js`
- Create: `client/src/render/structureVisuals.js`

**Interfaces:**
- Produces `structureDisplaySize(type, footprintWidth, footprintHeight, state)` returning `{ width, height }`.

- [ ] Write a failing test asserting idle follows the 2×1 footprint and active Water Geyser retains footprint width while gaining vertical launch overhang.
- [ ] Run `node --test test/client/structureVisuals.test.js` and confirm the missing-module failure.
- [ ] Implement only the size policy and rerun the focused test.

### Task 2: Package the atlas and register it

**Files:**
- Create: `art/source/water-geyser/README.md`
- Create: `tools/art/water_geyser_pipeline.py`
- Create: `client/public/art/water_special.png`
- Create: `client/public/art/water_special.json`
- Modify: `client/src/assets/manifest.js`
- Modify: `client/src/scenes/GameScene.js`

**Interfaces:**
- Consumes the generated source concept and emits an untrimmed 64px-frame TexturePacker-hash atlas.
- `Preload.buildAnimsForAtlas()` discovers the registered frame names without additional animation definitions.

- [ ] Generate source-derived state and directional frames, preserving the low rune pool in idle/telegraph and the surface-born launch plume in active.
- [ ] Pack the deterministic atlas with 2px gutters and validate frame count, dimensions, transparent margins, and metadata keys.
- [ ] Register `{ key: 'water_special', png: 'art/water_special.png', json: 'art/water_special.json' }` and route renderer sizing through the tested policy.
- [ ] Run focused tests, `npm test`, and `npm run build`.

### Task 3: Review and commit

**Files:**
- Modify: the files above only.

- [ ] Inspect the atlas and confirm all 20 state-direction frames are visually present and named correctly.
- [ ] Review the diff for unintended gameplay changes.
- [ ] Commit the verified production art package with message `feat(art): add water geyser atlas`.
