# Missing graphics assets — brief for ChatGPT/Codex

Written 2026-08-13, after merging `codex/redesign-reconciliation` into `master` (commit `6e5b367`). That merge landed nearly every previously-stranded asset package. This document lists what's still genuinely missing and how to package it so Claude Code can find and wire it in without further back-and-forth.

**Ground truth, not this document:** the ledger is authoritative. Read it fresh before starting — statuses may have moved since this was written. This file is a snapshot of the gaps as of `6e5b367`. As of 2026-08-13 the ledger's editable source is `art/manifest/<id>.json` (one file per asset); `art/assets-manifest.json` is generated from those fragments via `npm run build:manifest` and stays committed as a readable/compatible aggregate for existing tooling. Read either — they should always agree — but **edit only your own fragment file** (see section 4 below).

## Before you generate anything: check for existing unpackaged sources

At least two of the four gaps below **already have approved concept art sitting on `master`, never packaged**. Before generating anything new, check `art/source/calibration/` and grep `git log --all --diff-filter=A -- '<pattern>'` across all `codex/*` branches for material that matches the asset you're about to work on. Regenerating art that already exists wastes a GPT Image call and risks a style mismatch with what's already approved.

## The 4 real gaps

### 1. Hall (Town Hall) — source already exists, just needs packaging

- Ledger id: `hall`, runtime id `HALL`, category `generic_or_economy_structure`
- Footprint: 2×2 tiles, non-walkable, single `static` state
- **Source already on disk:** `art/source/calibration/town-hall-source-v1.png` (added in `ed8ed93`, magenta chroma-key background, shows the pagoda-style hall with the seated princess — matches the ledger's display alias "Town Hall with visible princess"). Do not regenerate; use this file unless you have a specific reason to reject it.
- Action needed: write a Pillow pipeline (see `tools/art/generic_structures_pipeline.py` for the exact established pattern — chroma-key extraction, then fit-to-canvas) that outputs `client/public/art/hall.png` at a 64×64 calibration target, matching the ledger's `pillow.contract`.
- No frame states or directions needed — it's `orientation: "none"`, `states: ["static"]`.

### 2. Farm — source already exists, just needs packaging

- Ledger id: `farm`, runtime id `FARM`, category `generic_or_economy_structure`
- Footprint: 1×1 tile, non-walkable, single `static` state
- **Source already on disk:** four candidates in `art/source/calibration/`: `farm-source.png`, `farm-source-v1.png`, `farm-source-v2.png`, `farm-source-v3.png` (v2/v3/base from `c10c210`, v1 from `ed8ed93`). `farm-source-v3.png` is the highest-iteration version and looks final quality (farmhouse with rice-paddy fields, magenta chroma-key background) — use it unless a visual inspection says otherwise. Eyeball all four before picking.
- Action needed: same pipeline pattern as Hall — chroma-key extraction, fit to a 32×32 calibration target, output `client/public/art/farm.png`.

### 3. Fire hero basic-attack FX — needs new source art

- Ledger id: `fire_saber_extension_effect`, runtime id `fire_saber_extension`, category `hero_attack_effect`
- No visual source exists anywhere — checked all local `art/source/` directories and every `codex/*` branch. (There IS a `fire_saber_slash` sound effect already wired at `client/public/audio/sfx/fire_saber_slash.ogg` — that's audio only, unrelated to this visual gap.)
- Currently the game reuses the static `fireball` projectile sprite as a hold-and-fade stand-in (`runtime.substitute: true` in the ledger) — functional but not the real deliverable.
- Needed: `extend` and `impact` states, 4 directions (`down`, `up`, `left`, `right`), `orientation: "actor_facing"`. Follow the same visual language as the other three heroes' basic-attack FX for consistency:
  - Earth's `earth_basic_fx` — `art/source/earth-basic-fx/` (windup/release/impact, sweep-shaped)
  - Water's `water_basic_fx` — `art/source/water-basic-fx/` (release/impact/dissipation, palm-shaped)
  - Wind's `wind_basic_fx` — `art/source/wind-basic-fx/`
  - Look at these three source directories and their `prompt-recipe.md` files for the established prompt style before writing a new prompt for Fire's "saber extension" concept.
- Output contract: 10 centered, untrimmed 64×64 RGBA frames with 2px atlas gutters (same contract as the other three basic-FX atlases) at `client/public/art/fire_saber_extension.png` + matching `.json`.

### 4. Elemental particle library — lowest priority, needs new source art

- Ledger id: `elemental_particle_library`, runtime id `elemental_particles`, category `shared_presentation`
- Reusable pooled particle sprites for 7 states: `fire`, `steam`, `wind`, `water`, `snow`, `smoke`, `debris`
- No source exists anywhere. Nothing currently in the game depends on this being finished — treat as optional/lowest priority unless told otherwise.
- Output: "small reusable particle sprites" per the ledger — no fixed canvas size specified yet. If you take this on, propose a canvas size and gutter convention consistent with the other atlases (64×64, 2px gutters) and document the choice in the QA doc.

## Explicitly OUT of scope — do not generate art for these

The `shared_presentation` category also lists `placement_indicator`, `footprint_indicator`, `range_indicator`, `direction_indicator`, `cooldown_indicator`, `charge_indicator`, `fusion_indicator`, `status_indicator`, and `telegraph_library`. All of these have `pillow.status: "not_applicable"` in the ledger — they're intentionally procedural client-side geometry, not image assets. Confirm this in the ledger before starting anything; do not spend a generation pass on these.

## How to package each asset (repo convention)

This repo has an established pattern across ~15 prior asset deliveries (Barricade, Watchtower, Grinder, Snare Post, Volcano, Firestorm, Muddy Bog, Blizzard, Steam Vent, etc.). Follow it exactly so Claude Code can find your work without guessing:

1. **Source directory**: put raw/concept art under `art/source/<asset-name>/`, following the naming used by the existing directories listed above. If there's a prompt-recipe involved (new generation, not reuse of an existing source), write `art/source/<asset-name>/prompt-recipe.md`.

2. **Pillow pipeline script**: write `tools/art/<asset-name>_pipeline.py`. Reuse the exact conventions already established:
   - Chroma-key magenta backgrounds out: `r > 220 and b > 180 and g < 70` → alpha 0 (see `generic_structures_pipeline.py`'s `extract_subject`)
   - `nearest_neighbor` filter per `art/assets-manifest.json`'s `pipeline.filter`
   - Atlas frame naming: `<state>_<direction>_<idx>.png` where directions apply, else `<state>_<idx>.png`
   - Runtime output root: `client/public/art/`
   - Look at `tools/art/grinder_pipeline.py` or `tools/art/generic_structures_pipeline.py` for a complete working example matching what you're building (atlas vs. single static image).

3. **Test**: write `test/art/<asset-name>_pipeline_test.py` mirroring `test/art/grinder_pipeline_test.py` — build a synthetic chroma-keyed source in a temp dir, run the pipeline, assert the expected frame names/sizes/atlas dimensions. Run it with:
   ```
   python -m unittest test.art.<asset-name>_pipeline_test
   ```

4. **Update the ledger — edit your fragment file, not the aggregated one.** As of 2026-08-13, `art/assets-manifest.json` is generated output; the editable source of truth is `art/manifest/<your-asset-id>.json` (one file per asset — see `art/manifest/grinder.json` for a filled-in example, or any other existing fragment). **Edit only that one file.** In it:
   - `source.status` → `"production_source_complete"`, fill `reference_path`/`source_directory`/`prompt_edit_lineage`
   - `pillow.status` → `"production_converted"`, fill `output`/`frame_count`/`contract`
   - **Leave `runtime.status` as `"planned"` or `"not_registered"` / `"unregistered"`** — do NOT set `gameplay_integrated: true` and do NOT touch `client/src/assets/manifest.js`, `client/src/scenes/Preload.js`, or any renderer/gameplay code. Wiring into the running game is deliberately left to Claude Code, exactly like every prior delivery (Grinder, Snare Post, etc.) — see `docs/handoffs/2026-08-09-grinder-integration-handoff.md` for the exact pattern to copy.
   - `qa.status` → `"production_validated"`, `evidence` pointing at the QA doc from step 5.
   - **Do not run `npm run build:manifest` and do not touch `art/assets-manifest.json` yourself.** Regenerating and committing the aggregated ledger is Claude's job at merge time — see the parallel-dispatch doc for why.

5. **QA doc**: write `docs/assets/<asset-name>-production-qa.md` following the format of `docs/assets/grinder-production-qa.md` — what was produced, the pipeline test command and result, a visual-review paragraph, and explicit note that runtime registration is NOT done yet.

6. **Handoff doc**: write `docs/handoffs/<date>-<asset-name>-integration-handoff.md` following `docs/handoffs/2026-08-09-grinder-integration-handoff.md`'s exact template:
   ```
   # <Asset> integration handoff
   - Source branch: <your branch name>
   - Source commits: <commit hash(es)>
   - Target branch: master
   - Ledger records: <ledger id> (<runtime id> / <runtime key>)
   - Runtime files: client/public/art/<name>.png[, .json]
   - Registration files: client/src/assets/manifest.js (IMAGES or ATLASES key <name>); client/src/scenes/Preload.js must consume the declared loader entry
   - Overlap or conflict files: none expected — you only touched art/manifest/<your-asset-id>.json, a file no other in-flight branch should be editing; docs/assets/graphics-inventory.md is hand-maintained and Claude will update it at merge time
   - Required target-branch commands:
     - python -m unittest test.art.<asset-name>_pipeline_test
     - npm test
     - npm run build
   - State on this branch: production_converted
   - Reason integration is blocked: this delivery intentionally leaves runtime key registration and renderer/gameplay consumption to Claude Code on master.
   ```

## Git workflow

- Work on a new branch named `codex/<asset-name>-package` (matches every prior branch: `codex/grinder-production-assets`, `codex/snare-post-package`, `codex/generic-structures-package`, etc.)
- Commit with `feat(art): package <Asset Name> <structure/effect>` (matches `feat(art): package Grinder fusion structure` at `ed8ed93`)
- **Commit and push the branch** so Claude Code (working from `C:\dev\Elementia-Town-Defense` on `master`) can find it via `git branch --all` / `git fetch`. A local-only worktree with no pushed branch is invisible to the next session — this is exactly the problem the 2026-08-13 merge just spent an entire session fixing (97 commits of finished work sat unmerged for days because nobody surfaced the branch). Don't repeat that: push as soon as the commit is made, even if the QA gate isn't 100% polished yet.
- Do not merge into `master` yourself — leave that step, and the gameplay-wiring step, to Claude Code.

## What "done" looks like from your side

- [ ] Pipeline script + test, test passes
- [ ] Runtime PNG/JSON in `client/public/art/`
- [ ] Ledger entry updated (source/pillow/qa → complete; runtime → still `planned`/`unregistered`)
- [ ] QA doc written
- [ ] Handoff doc written
- [ ] Branch committed AND PUSHED
- [ ] `npm test` and `npm run build` still pass on your branch (registration is unwired, so these should pass unchanged)

Do not attempt runtime registration, `GameScene.js` rendering logic, or `manifest.js`/`Preload.js` edits — that's explicitly Claude Code's half of the handoff, same as every asset merged in this session.
