# Grinder production package design

## Goal

Prepare the approved Earth + Wind Grinder vortex concept as a package Claude Code can wire into the game, without loader registration or gameplay integration.

## Scope

The package provides four non-directional 128x128 RGBA states: `idle`, `intake`, `crush`, and `release`. Each frame keeps the approved 2x2 stone foundation, four cardinal feudal timber-and-tile gates, central jade-gray vortex, and orbiting brown boulders. State changes are limited to vortex intensity and boulder motion so the object stays readable at runtime scale.

## Asset boundaries

- Editable/generated source lives under `art/source/grinder/`.
- A deterministic Pillow pipeline creates source frames and a Phaser atlas at `client/public/art/grinder.png` with matching `grinder.json`.
- `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`, and dated QA evidence document the conservative `production_converted` state.
- A focused pipeline test validates frame names, dimensions, alpha, and atlas metadata.
- No `client/src/assets/manifest.js`, preload loader, renderer, or gameplay files are modified. A dated handoff identifies the exact registration work remaining for Claude Code.

## Constraints

- Runtime identity remains `GRINDER` / `grinder`; it is a walkable 2x2 fusion structure.
- The existing approved concept is the sole visual source; the Marketplace is not a reference.
- The runtime atlas is not a claim of registration or gameplay integration.
- The contract requires source, package, ledger, inventory, QA evidence, focused validation, and handoff to agree.

## Acceptance criteria

- The atlas contains exactly `idle_0.png`, `intake_0.png`, `crush_0.png`, and `release_0.png`, each 128x128 with alpha.
- The source frames and packaged atlas derive deterministically from the approved concept.
- The focused test passes and the QA record reports its result.
- The manifest state is no higher than `production_converted`, and the handoff explicitly leaves runtime registration to Claude Code.
