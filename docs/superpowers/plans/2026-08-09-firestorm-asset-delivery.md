# Firestorm Asset Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a contract-compliant, unregistered Firestorm runtime image package and Claude handoff.

**Architecture:** Keep the approved source as provenance, generate a chroma-key production source, remove the key to a 64x64 RGBA static PNG, and record only the conservative converted state. A focused test verifies file and ledger agreement without testing unimplemented runtime wiring.

**Tech Stack:** PNG, Pillow, Node test runner, JSON ledger.

## Global Constraints

- Target branch is `codex/redesign-reconciliation`; this delivery branch is `codex/firestorm-asset-delivery`.
- Runtime key is `firestorm`; runtime path is `client/public/art/firestorm.png`.
- Ledger state may not exceed `production_converted`.
- Runtime loader and renderer registration are Claude-owned handoff work.

---

### Task 1: Produce and package the Firestorm image

**Files:**
- Create: `art/source/firestorm/firestorm-runtime-chromakey.png`
- Create: `client/public/art/firestorm.png`

- [ ] Generate a single chroma-key source matching approved Firestorm design.
- [ ] Remove the chroma key and downscale with nearest-neighbor to 64x64 RGBA.
- [ ] Validate alpha mode, dimensions, and transparent corners.

### Task 2: Record the delivery and prove package consistency

**Files:**
- Modify: `art/assets-manifest.json`
- Modify: `docs/assets/graphics-inventory.md`
- Create: `docs/assets/firestorm-production-qa.md`
- Create: `test/art/firestorm_pipeline_test.py`

- [x] Write a failing validation asserting the Firestorm source, output, key, and converted ledger state.
- [x] Update source/packaging/QA metadata and inventory to satisfy that validation.
- [x] Run the focused validation successfully.

### Task 3: Hand off runtime wiring

**Files:**
- Create: `docs/handoffs/2026-08-09-firestorm-runtime-integration.md`

- [x] Add the contract-format handoff with source commit, target branch, exact output path, `IMAGES` registration key, renderer touchpoint, and target-branch commands.
- [ ] Commit only Firestorm delivery files.
