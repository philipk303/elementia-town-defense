# Character Asset Pipeline Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Commit all four elemental hero production slices at the isolated-preview pipeline boundary.

**Architecture:** Preserve accepted Wind and Water files in the main checkout, recover Earth from its existing worktree, and complete Fire in its existing worktree. Integrate each slice as a distinct provenance-preserving commit, then run a manifest reconciliation gate.

**Tech Stack:** GPT Image source PNGs, Pillow/Numpy converter, Phaser isolated previews, Node test runner, Git.

## Global Constraints

- No gameplay atlas registration, animation-controller changes, combat behavior, audio, or balance changes.
- Preserve accepted source images; never regenerate Wind, Water, or Earth.
- Final hero atlases have 80 untrimmed 64x64 RGBA frames; basic FX atlases have 10 frames where already produced.
- Exclude `art/build/` and other disposable debug artifacts unless existing QA evidence requires a specific rendered screenshot.

---

### Task 1: Package Wind and Water from the main checkout

**Files:** `art/source/wind-*`, `art/source/water-*`, `client/public/art/chibi_{wind,water}.*`, `client/public/art/{wind,water}_basic_fx.*`, previews, manifest, inventory, QA, and focused tests.

- [ ] Verify source counts and the four existing atlas JSON/PNG pairs.
- [ ] Run `python -m unittest test.art.wind_pipeline_test -v`, `node --test test/client/windPreview.test.js`, and `node --test test/client/waterPreview.test.js`.
- [ ] Stage only accepted Wind/Water sources, final public outputs, preview declarations, manifest/inventory/QA evidence, and tests; exclude build/debug directories.
- [ ] Commit Wind and Water as separate commits with their focused validation output recorded in QA evidence.

### Task 2: Recover and package Earth

**Files:** Existing Earth worktree `C:\Users\phili\.codex\worktrees\4580\Elementia-Town-Defense`, then the same production paths in the integration checkout.

- [ ] Verify the existing 80-frame hero and 10-frame FX source/output matrices against their JSON atlases.
- [ ] Bring only accepted Earth sources, final public atlas files, preview/test declarations, manifest/inventory/QA evidence, and any required preview screenshot into the integration checkout.
- [ ] Run the Earth converter validation and `node --test test/client/earthPreview.test.js`.
- [ ] Commit the Earth slice; stop and report if its manifest/evidence contradicts its files.

### Task 3: Complete and package Fire

**Files:** Existing Fire worktree `C:\Users\phili\.codex\worktrees\ffb3\Elementia-Town-Defense`, Fire source matrix, final atlas, preview, manifest, inventory, QA, and focused tests.

- [ ] Audit the saved Fire source matrix against the required 80-frame state/direction contract and preserve its accepted calibration images.
- [ ] Generate only the missing hero frames; derive allowed left mirrors from accepted right-facing frames and record the derivation.
- [ ] Convert and validate the 80-frame hero atlas, create the isolated Fire preview, and write focused QA evidence/test coverage.
- [ ] Commit the Fire hero slice without Fire attack FX or gameplay integration.

### Task 4: Reconcile the four-element manifest

**Files:** `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`, `test/art/wind_pipeline_test.py` or a focused reconciliation test.

- [ ] Add a deterministic assertion that all four hero entries point to extant 80-frame final atlas JSON/PNG pairs and correctly distinguish isolated-preview status from gameplay integration.
- [ ] Run the complete focused asset and preview test set.
- [ ] Commit the reconciliation evidence and report the remaining gameplay-integration gate.
