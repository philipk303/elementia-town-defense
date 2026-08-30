# Water Production Atlas and Basic FX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and visually validate an 80-frame four-direction Water hero atlas and a separate Water Palm FX atlas without changing gameplay, balance, networking, or audio.

**Architecture:** Reuse the validated Wind production contracts and generic Pillow conversion behavior. Water adds only class-specific identity sources, animation declarations, an isolated Phaser preview, Water Palm effect sources, and truthful ledger/QA records. Accepted concept art at `art/source/calibration/water-reference-v1.png` is the identity authority.

**Tech Stack:** OpenAI built-in image generation, Python 3.12 + Pillow, Phaser 3, Vite, Node test runner.

## Global Constraints

- Hero output is 80 untrimmed 64 x 64 RGBA frames: per direction, idle 2, run 4, attack 4, cast 4, hurt 2, death 4.
- Standing/contact frames use baseline y=56. The production converter uses fixed scale `0.0402`; grounded idle/run height must be 40-46 px.
- Atlas cells use 2 px transparent gutters and deterministic metadata.
- Water remains an unarmed high-ponytail martial artist. Water Palm body motion stays in the hero atlas; detached water release/impact art stays in the FX atlas.
- Right-facing sources may be mirrored into separate left-facing sources only if tunic closure, sash ornaments, ponytail motion, and hand poses remain readable.
- Source images stay outside `client/public/`; only converted atlases and JSON metadata ship there.
- Preview-only integration: do not modify gameplay atlas registration, scenes, server/shared code, balance, networking, or audio.
- Whirlpool and Tidal Wave effects are separate follow-up assets.
- Existing uncommitted repository work is preserved; this plan does not create commits that could capture unrelated files.

---

### Task 1: Water preview declarations and contracts

**Files:**
- Create: `client/src/assets/waterPreview.js`
- Create: `test/client/waterPreview.test.js`

**Interfaces:**
- Produces: `WATER_HERO_ANIMATIONS`, `WATER_FX_ANIMATIONS`, `WATER_HERO_ATLAS`, `WATER_FX_ATLAS`, `buildWaterHeroMatrix()`, and `buildWaterBasicDemo()`.

- [x] Write tests asserting 24 hero groups, 80 unique hero frames, exact state counts, all four directions, idle/run-only loops, and one-shot attack/cast/hurt/death.
- [x] Run `node --test test/client/waterPreview.test.js` and confirm failure because the Water declarations do not exist.
- [x] Implement the smallest frozen-data declaration module matching the Wind naming and playback contracts.
- [x] Re-run `node --test test/client/waterPreview.test.js`; expect all Water declaration tests to pass.

### Task 2: Identity-locked Water source production

**Files:**
- Create: `art/source/water-production/prompt-recipe.md`
- Create: `art/source/water-production/{state}_{direction}_{index}.png` (80 files)

**Interfaces:**
- Consumes: `art/source/calibration/water-reference-v1.png` and the corresponding accepted Wind frame as pose/camera guidance.
- Produces: the exact `expected_frame_names("hero")` matrix consumed by `tools/art/wind_pipeline.py`.

- [x] Record identity, palette, costume, high ponytail, unarmed hand rules, pose progression, magenta chroma contract, naming, and rejection gates in the recipe.
- [x] Generate and review the 20 down-facing sources.
- [x] Generate and review the 20 up-facing sources.
- [x] Generate and review the 20 right-facing sources.
- [x] Create separate left-facing sources by safe mirroring or independent regeneration after checking asymmetric costume and hand readability.
- [x] Run the hero converter into `art/build/water-production-review/`; expect exactly 80 converted 64 x 64 RGBA frames with shared baseline and no crop.

### Task 3: Water Palm FX source production

**Files:**
- Create: `art/source/water-basic-fx/prompt-recipe.md`
- Create: `art/source/water-basic-fx/release_00.png` through `release_03.png`
- Create: `art/source/water-basic-fx/impact_00.png` through `impact_02.png`
- Create: `art/source/water-basic-fx/dissipation_00.png` through `dissipation_02.png`

**Interfaces:**
- Produces: ten centered effect frames accepted by `expected_frame_names("fx")`; Water maps the generic FX profile's `flight` names to palm-release motion in user-facing declarations.

- [x] Define a compact forward water-palm burst with a stable center, no hero body, no scenery, and magenta chroma.
- [x] Generate four release frames, three impact frames, and three monotonic dissipation frames.
- [x] Run the FX converter into `art/build/water-basic-fx-review/`; expect exactly ten centered frames with no crop.

### Task 4: Production atlases and isolated preview

**Files:**
- Create: `client/public/art/chibi_water.png`
- Create: `client/public/art/chibi_water.json`
- Create: `client/public/art/water_basic_fx.png`
- Create: `client/public/art/water_basic_fx.json`
- Create: `client/src/waterPreview.js`
- Create: `client/water-preview.html`
- Modify: `client/vite.config.js`

**Interfaces:**
- Consumes: accepted source matrices and Task 1 declarations.
- Produces: engine-faithful 1x/3x hero matrix and Water Palm sequence review surfaces.

- [x] Build both atlases with `tools/art/wind_pipeline.py`, using `--profile hero` and `--profile fx` respectively.
- [x] Add a Vite entry for `/water-preview.html` without changing gameplay manifests.
- [x] Implement the Water preview by following the isolated Wind preview structure with Water-specific imports, labels, atlas keys, and basic-effect timing.
- [x] Run focused Water tests, production client build, and browser inspection with no console or asset-load errors.

### Task 5: Ledger, inventory, and QA truth

**Files:**
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/water-production-qa.md`
- Modify: `test/art/wind_pipeline_test.py`

**Interfaces:**
- Produces: verifiable source lineage, outputs, frame counts, origin/baseline, preview state, and remaining gameplay-integration gate.

- [x] First add a failing manifest test that requires Water's reference, source directories, 80 hero frames, ten FX frames, output paths, and `gameplay_integrated: false` state.
- [x] Update the JSON ledger and readable inventory with only achieved stages.
- [x] Record exact commands and visual findings in the Water QA file.
- [x] Run the bundled-Python art tests, focused Water client tests, full Node suite, production build, `git diff --check`, and a scope diff confirming gameplay/server/audio files are unchanged.

## Self-Review

- Scope matches the inherited Wind architecture and contains no new runtime schema.
- The class-specific deltas are explicit: identity, palette, silhouette, unarmed attack, and Water Palm FX.
- Special abilities remain out of scope, avoiding a second radial-FX contract.
- Every generated output has a named source, validator, preview, and truthful ledger stage.
