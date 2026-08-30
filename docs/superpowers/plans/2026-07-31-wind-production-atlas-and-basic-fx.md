# Wind Production Atlas and Basic FX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and visually validate an 80-frame four-direction Wind hero atlas and a shared 10-frame Wind basic FX atlas without changing gameplay or audio.

**Architecture:** Extend the existing Pillow converter with explicit, validated hero and FX profiles while keeping calibration mode compatible. Preserve the 14 approved sources, create new sources outside the public runtime tree, export deterministic untrimmed atlases, and exercise them only through the standalone Phaser preview. The authoritative JSON ledger and readable inventory record each achieved stage without claiming gameplay integration.

**Tech Stack:** Python 3.12, Pillow, NumPy, Python `unittest`, Phaser 3.87, Vite 5, Node test runner, GPT Image source generation.

## Global Constraints

- Preserve all 14 files under `art/source/wind-vertical-slice/` byte-for-byte.
- Hero output is 80 untrimmed 64 x 64 RGBA frames: per direction, idle 2, run 4, attack 4, cast 4, hurt 2, death 4.
- Standing/contact frames use baseline y=56. Production uses a fixed scale near `0.0402`; grounded idle/run height hard-validates at 40-46 px. The 28-32 px body-width target is visually assessed because hair, robe, and fan overhang may extend the total opaque bounds.
- FX output is flight 4, impact 3, dissipation 3 with a centered projectile origin.
- Use exact zero-based names and deterministic packing; reject missing, duplicate, malformed, or unexpected files.
- Source images stay outside `client/public/`; only converted atlases and metadata ship there.
- Do not edit gameplay registration, animation control, combat, networking, balance, camera/layout, or audio.
- `art/assets-manifest.json` remains authoritative; `docs/assets/graphics-inventory.md` mirrors it.
- All implementation code follows red-green-refactor; generated art is validated by automated contract checks and the isolated Phaser preview.

---

### Task 1: Production frame contracts and validation

**Files:**
- Modify: `test/art/wind_pipeline_test.py`
- Modify: `tools/art/wind_pipeline.py`

**Interfaces:**
- Produces: `expected_frame_names(profile: str) -> tuple[str, ...]`
- Produces: `validate_sources(sources: list[Path], profile: str) -> list[Path]`
- Produces: repeatable CLI `--sources-dir` plus `--profile calibration|hero|fx`

- [ ] **Step 1: Write failing tests for exact matrices and invalid sets**

Add tests asserting `hero` returns the exact 80 names from the six fixed state counts across `down`, `up`, `left`, `right`; `fx` returns `flight_00..03`, `impact_00..02`, and `dissipation_00..02`; and validation rejects one missing name, one unexpected name, and duplicate basenames from two source directories.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python -m unittest test.art.wind_pipeline_test.WindPipelineTest.test_expected_production_frame_names test.art.wind_pipeline_test.WindPipelineTest.test_validate_sources_rejects_incomplete_or_ambiguous_sets -v`

Expected: failure because the production-profile interfaces do not exist.

- [ ] **Step 3: Implement the minimum contract code**

Define ordered state counts, directions, `expected_frame_names`, and `validate_sources`. Keep calibration accepting the supplied files as it does today. Change `--sources-dir` to `action="append"`, flatten all PNG inputs, and validate only when `--profile` is `hero` or `fx`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `python -m unittest test.art.wind_pipeline_test -v`

Expected: all pipeline tests pass, including the original calibration tests.

- [ ] **Step 5: Commit the frame-contract change**

Run: `git add tools/art/wind_pipeline.py test/art/wind_pipeline_test.py && git commit -m "feat: validate Wind production frame contracts"`

---

### Task 2: Safe deterministic atlas packing and source mirroring

**Files:**
- Modify: `test/art/wind_pipeline_test.py`
- Modify: `tools/art/wind_pipeline.py`

**Interfaces:**
- Produces: `mirror_source(source: Path, output: Path) -> dict`
- Extends: `build_preview_atlas(..., profile="calibration", gutter=0) -> dict`
- Guarantees: validation completes before existing atlas outputs are replaced.

- [ ] **Step 1: Write failing tests for mirrors, gutters, ordering, and failure safety**

Use asymmetric synthetic pixels to prove horizontal mirroring, two source lists in different orders to prove identical frame placement, a two-pixel gutter to prove no neighboring opaque pixels touch, and sentinel atlas files to prove invalid profile input leaves both sentinels unchanged.

- [ ] **Step 2: Run the new tests and verify RED**

Run: `python -m unittest test.art.wind_pipeline_test.WindPipelineTest.test_mirror_source_is_non_destructive test.art.wind_pipeline_test.WindPipelineTest.test_production_atlas_is_deterministic_and_separated test.art.wind_pipeline_test.WindPipelineTest.test_invalid_build_preserves_existing_outputs -v`

Expected: failure because mirroring, profile packing, and guarded writes are absent.

- [ ] **Step 3: Implement minimal safe packing**

Sort validated inputs by the profile's expected order. For production, pack ten columns of 64 px frames with two transparent pixels between cells and write PNG/JSON temporary siblings only after all conversion and validation succeeds. Replace final outputs after both temporary files exist. Implement `mirror_source` with `Image.Transpose.FLIP_LEFT_RIGHT`, preserving the original file and recording `derived_from` plus `transform` metadata.

- [ ] **Step 4: Add production-scale and opaque-bound tests, verify RED, then implement**

Add tests proving the production profile applies one fixed scale near `0.0402`, a grounded idle/run frame passes at height 44 and baseline 56, and conversion fails for cropped alpha, baseline drift, inconsistent scale, or grounded idle/run height outside 40-46. Report total opaque width without hard-failing intentional hair/robe/fan overhang; width is resolved at the 1x visual gate. Do not apply standing-height limits to attack/cast overhang, airborne hurt/death transitions, or FX.

- [ ] **Step 5: Run the full Python suite and verify GREEN**

Run: `python -m unittest discover -s test/art -p "*_test.py" -v`

Expected: all art pipeline tests pass.

- [ ] **Step 6: Commit safe atlas packing**

Run: `git add tools/art/wind_pipeline.py test/art/wind_pipeline_test.py && git commit -m "feat: pack Wind atlases deterministically"`

---

### Task 3: Production preview declarations

**Files:**
- Modify: `test/client/windPreview.test.js`
- Modify: `client/src/assets/windPreview.js`

**Interfaces:**
- Produces: `WIND_HERO_ANIMATIONS` covering 24 state/direction groups and 80 unique frames.
- Produces: `WIND_FX_ANIMATIONS` covering flight, impact, dissipation and 10 unique frames.
- Produces: production atlas paths while retaining separately named calibration paths.

- [ ] **Step 1: Write failing declaration tests**

Assert 24 hero animations, 80 unique hero frames, exact per-state counts, four directions, loops only for idle/run, and one-shot attack/cast/hurt/death. Assert three FX animations, ten unique frames, only flight looping, and distinct hero/FX atlas keys and paths.

- [ ] **Step 2: Run the client test and verify RED**

Run: `node --test test/client/windPreview.test.js`

Expected: failure because production declarations do not exist.

- [ ] **Step 3: Implement declarations from compact contracts**

Generate declarations from frozen state-count, frame-rate, repeat, and direction data rather than hand-writing 90 filenames. Preserve the existing calibration exports until the preview migration is complete.

- [ ] **Step 4: Run the client test and verify GREEN**

Run: `node --test test/client/windPreview.test.js`

Expected: all Wind preview declaration tests pass.

- [ ] **Step 5: Commit preview declarations**

Run: `git add client/src/assets/windPreview.js test/client/windPreview.test.js && git commit -m "feat: declare complete Wind preview animations"`

---

### Task 4: Identity-locked Wind hero source production

**Files:**
- Create: `art/source/wind-production/prompt-recipe.md`
- Create: 66 PNG files under `art/source/wind-production/`
- Preserve: 14 PNG files under `art/source/wind-vertical-slice/`

**Interfaces:**
- Consumes: `art/source/calibration/wind.png` and nearest accepted pose for every generation.
- Produces: the complete hero matrix when combined with the immutable calibration directory.

- [ ] **Step 1: Record the reusable prompt recipe**

Lock identity, costume, paired fans, chibi proportions, camera angle, full-body framing, magenta chroma, pose-only single-image output, naming, and negative constraints. State that future hero classes reuse the pipeline, frame matrix, fixed canvas, baseline, preview, and validation gates while substituting their approved identity, asymmetric equipment, attack silhouette, and effects. Require a new full design only when a shared technical contract changes.

- [ ] **Step 2: Generate and review the six missing down frames**

Create `hurt_down_00..01.png` and `death_down_00..03.png`. Review identity, grounded contact frames, readable hurt/death progression, complete silhouette, and chroma separation before continuing.

- [ ] **Step 3: Generate and review all twenty up frames**

Create idle 00..01, run 00..03, attack 00..03, cast 00..03, hurt 00..01, death 00..03. Use a consistent rear-view anchor and reject any frame that reveals a front-facing face or changes costume geometry.

- [ ] **Step 4: Generate and review all twenty right frames**

Create the same state matrix with a consistent right-facing profile. Keep paired-fan ownership, robe closure, belt ornament, and hair mass consistent across states.

- [ ] **Step 5: Derive and review all twenty left sources**

Use `mirror_source` to create separate left-facing PNGs from accepted right frames. Inspect fan handedness, robe closure, and asymmetric ornament placement. Regenerate any unacceptable left frame independently instead of accepting a misleading mirror.

- [ ] **Step 6: Validate the complete source matrix**

Run the production-profile converter against both source directories into a temporary review location. Expected: exactly 80 frames, no duplicate or unexpected names, and no cropped output. Review the generated contact atlas at nearest-neighbor 1x and 3x.

- [ ] **Step 7: Commit only the Wind production sources and recipe**

Run: `git add art/source/wind-production && git commit -m "art: add complete Wind hero production sources"`

---

### Task 5: Wind basic projectile and effect sources

**Files:**
- Create: `art/source/wind-basic-fx/prompt-recipe.md`
- Create: `art/source/wind-basic-fx/flight_00.png` through `flight_03.png`
- Create: `art/source/wind-basic-fx/impact_00.png` through `impact_02.png`
- Create: `art/source/wind-basic-fx/dissipation_00.png` through `dissipation_02.png`

**Interfaces:**
- Consumes: Wind fan design and pale-cyan/navy/gold palette from the hero reference.
- Produces: centered velocity-aligned flight loop and centered one-shot impact/dissipation sequences.

- [ ] **Step 1: Record the FX prompt and anchor recipe**

Specify one isolated fan-blade projectile or wind curl per source, transparent-safe magenta chroma, no hero body, no scenery, a fixed center, and consistent visible mass across flight frames.

- [ ] **Step 2: Generate and review the four flight frames**

Ensure rotation reads as one coherent loop, the center does not travel, and the silhouette remains legible after 64 px conversion.

- [ ] **Step 3: Generate and review impact and dissipation**

Create three impact frames and three dissipation frames with centered expansion and a monotonically fading final sequence.

- [ ] **Step 4: Validate and commit the FX sources**

Run the FX production profile into a temporary review location. Expected: exactly ten frames with centered bounds and no cropped output. Then run `git add art/source/wind-basic-fx && git commit -m "art: add Wind fan projectile and impact sources"`.

---

### Task 6: Build production atlases and migrate the isolated preview

**Files:**
- Create: `client/public/art/chibi_wind.png`
- Create: `client/public/art/chibi_wind.json`
- Create: `client/public/art/wind_basic_fx.png`
- Create: `client/public/art/wind_basic_fx.json`
- Modify: `client/src/windPreview.js`
- Modify: `test/client/windPreview.test.js`

**Interfaces:**
- Consumes: `WIND_HERO_ANIMATIONS`, `WIND_FX_ANIMATIONS`, and production atlas paths.
- Produces: Hero Matrix and Basic FX views on the isolated 1280 x 736 Phaser page.

- [ ] **Step 1: Write failing tests for preview view-model behavior**

Extract pure helpers for the 6-column by 4-row hero matrix positions and the ordered attack/flight/impact/dissipation demo. Assert all 24 animations appear once, rows share baselines, and the FX sequence orders hero attack before projectile impact and dissipation.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/client/windPreview.test.js`

Expected: failure because production preview helpers are absent.

- [ ] **Step 3: Build production atlases**

Run the hero profile with both hero source directories and the FX profile with the FX directory, targeting the four production files above plus validation metadata. Confirm the hero JSON has 80 frames and the FX JSON has ten.

- [ ] **Step 4: Implement the two-view Phaser preview**

Load both atlases. Add Hero Matrix and Basic FX controls inside the isolated preview, use nearest-neighbor display, provide actual 1x gameplay-scale and 3x inspection-scale views, show state/direction labels and baseline guides, replay one-shots without looping, and rotate only the flight sprite in the FX view. Do not import or modify gameplay scene code.

- [ ] **Step 5: Run focused tests and the client build**

Run: `node --test test/client/windPreview.test.js`

Run: `npm run build`

Expected: tests and build pass; only the existing Phaser chunk-size warning may remain.

- [ ] **Step 6: Commit production outputs and preview**

Run: `git add client/public/art/chibi_wind.png client/public/art/chibi_wind.json client/public/art/wind_basic_fx.png client/public/art/wind_basic_fx.json client/src/windPreview.js test/client/windPreview.test.js && git commit -m "feat: preview production Wind hero and basic FX"`

---

### Task 7: Ledger, inventory, and final verification

**Files:**
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/wind-production-qa.md`

**Interfaces:**
- Produces: truthful source, conversion, preview, and QA evidence without gameplay-integration claims.

- [ ] **Step 1: Write a failing ledger assertion**

Extend the client or Python asset test to assert that the Wind hero entry names both source directories, records 80 converted frames, points to `chibi_wind` outputs, and remains not gameplay-integrated. Assert `wind_basic_effect` and `wind_fan_blade` share the FX output and record ten frames.

- [ ] **Step 2: Run the ledger test and verify RED**

Run the focused asset test. Expected: failure because the ledger still reports calibration-only/planned states.

- [ ] **Step 3: Update ledger and readable inventory**

Record exact source lineage, output paths, baseline/origin, frame counts, preview status, and the remaining runtime-integration gate. Update the readable inventory with the same distinctions. Write QA commands and observed browser evidence to `docs/assets/wind-production-qa.md`.

- [ ] **Step 4: Run automated verification**

Run: `python -m unittest discover -s test/art -p "*_test.py" -v`

Run: `node --test test/client/windPreview.test.js`

Run: `npm test`

Run: `npm run build`

Expected: zero failures; document any pre-existing warning without suppressing it.

- [ ] **Step 5: Run isolated browser verification**

Serve Vite, open `/wind-preview.html`, inspect Hero Matrix and Basic FX at actual 1x gameplay scale and 3x inspection scale in desktop and landscape-phone presentation, and capture console plus asset-load status. Reject anchor jumps, crop, bleed, identity drift, incorrect direction, looping one-shots, projectile-center movement, or overhang that obscures feet, grid edges, labels, nearby actors, or placement affordances.

- [ ] **Step 6: Review scope and commit documentation**

Confirm `client/src/assets/manifest.js`, gameplay scenes, server/shared code, and audio are unchanged. Run `git diff --check`, then commit only the ledger, inventory, QA record, and ledger test with `git commit -m "docs: record Wind production asset evidence"`.
