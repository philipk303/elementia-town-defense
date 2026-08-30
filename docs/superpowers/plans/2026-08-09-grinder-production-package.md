# Grinder Production Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a source-derived four-state Grinder atlas ready for Claude Code runtime wiring.

**Architecture:** A Pillow pipeline derives four 128px frames from the approved concept using bounded compositing transforms, then packs a Phaser JSON atlas. The package updates the asset ledger and human inventory but intentionally leaves loader and gameplay wiring untouched.

**Tech Stack:** Python 3, Pillow, unittest, Phaser atlas JSON.

## Global Constraints

- Branch: `codex/grinder-production-assets`.
- Runtime ID/key: `GRINDER` / `grinder`.
- States: `idle`, `intake`, `crush`, `release`; no directions.
- Preserve source under `art/source/grinder/`; package to `client/public/art/`.
- Ledger state may advance only to `production_converted`; no runtime registration.

---

### Task 1: Test and pipeline

**Files:**
- Create: `test/art/grinder_pipeline_test.py`
- Create: `tools/art/grinder_pipeline.py`
- Create: `art/source/grinder/frames/idle_0.png`, `intake_0.png`, `crush_0.png`, `release_0.png`
- Create: `client/public/art/grinder.png`, `client/public/art/grinder.json`

- [ ] Write a unittest that supplies a 1280px concept fixture, calls `write_atlas`, and asserts four named 128x128 alpha frames plus a 520x128 atlas with metadata matching `grinder.png`.
- [ ] Run `python -m unittest test.art.grinder_pipeline_test` and confirm it fails because the pipeline module is absent.
- [ ] Implement `write_atlas(concept, source_dir, atlas_png, atlas_json)` with Pillow: remove the magenta border, crop/scale the approved concept to 128px, derive the four state frames through bounded vortex/boulder variations, and write deterministic atlas metadata.
- [ ] Run the focused test and confirm it passes.

### Task 2: Delivery evidence

**Files:**
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/grinder-production-qa.md`
- Create: `docs/handoffs/2026-08-09-grinder-integration-handoff.md`

- [ ] Record source lineage, frame count, output paths, `production_converted` status, and an explicit unregistered runtime state for the Grinder ledger record.
- [ ] Add the same output/state information to the graphics inventory and a dated QA record containing the focused command and observed pass result.
- [ ] Add the contract-formatted handoff naming `client/src/assets/manifest.js` and `client/src/scenes/Preload.js` as Claude Code registration targets and the exact validation commands.
- [ ] Re-run the focused test; then run `npm test` and `npm run build`.
