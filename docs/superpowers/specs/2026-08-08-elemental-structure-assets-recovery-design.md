# Elemental Structure Assets Recovery Design

## Scope

Complete only the four elemental structure graphics worked on August 8, 2026: Water Geyser, Rock Trap, Firepit, and Wind Vortex. Preserve all game rules, balance, placement, collision, network payloads, and audio behavior.

## Asset contract

Each structure keeps editable source artwork under `art/source/<asset>/`, produces a deterministic Phaser atlas in `client/public/art/`, and is registered through the existing client asset manifest and structure renderer. Every completed entry in `art/assets-manifest.json` and `docs/assets/graphics-inventory.md` must agree on source, output, frame/state coverage, and QA evidence.

Water Geyser is recovered from commit `09ca920`. Rock Trap is recovered from the saved `ecb8` worktree and is restricted to its `earth_special` launcher and `rock_trap_fx` target-point visual assets. Firepit and Wind Vortex receive new local source images, equivalent deterministic packaging, and minimal display-only registration.

## Validation and commits

Asset-specific tests validate atlas metadata and renderer selection. The client build validates runtime registration. Each recoverable unit is committed separately after its source, output, pipeline records, and focused tests are complete.
