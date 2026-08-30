# Firestorm production QA

Date: 2026-08-12

- Delivery branch: `codex/firestorm-asset-delivery`
- Target branch: `codex/redesign-reconciliation`
- Source: `art/source/firestorm/firestorm-concept-draft-v2.png` plus approved state sources in `art/source/firestorm/frames/`
- Runtime package: `client/public/art/firestorm.png`, `client/public/art/firestorm_fx.png`, `client/public/art/firestorm_fx.json`
- Runtime key: `firestorm` (not registered on this branch)
- Footprint: 2 x 2 walkable
- Ledger state: `production_converted`

## Conversion checks

- Preserved the v1 concept, approved v2 concept, chroma-key production source, and idle/charge/volley chroma-key state sources in `art/source/firestorm/` as the editable lineage.
- Validated the packaged static PNG as non-interlaced 64 x 64 RGBA, with alpha `0` at all four corners and a non-empty centered opaque silhouette.
- Built a paired Phaser atlas with 10 untrimmed 96 x 96 RGBA frames: `idle`, `telegraph`, `charged`, `active`, and `recovery`, two frames each, separated by 2 px transparent gutters.

## Focused validation

```powershell
python -m unittest test.art.firestorm_pipeline_test -v
```

Observed outcome: focused Firestorm tests pass. The validator proves source lineage, alpha-safe package dimensions and corners, named atlas frames, conservative ledger state, inventory/QA agreement, the blocked-integration handoff, and absence of Firestorm registration on this delivery branch.

## Repository command checks

- `npm test` ran 669 Node tests: 666 passed, 1 failed, and 2 skipped. The sole failure is pre-existing environment setup: `test/net/smoke.test.js` cannot resolve the missing `socket.io-client` package.
- `npm run build` could not start because the checkout does not have the `vite` executable installed.
- Neither command is target-branch integration evidence; rerun both after dependencies are installed on `codex/redesign-reconciliation`.

## Open runtime gate

The package is production-converted and ready for integration. Claude must register `ATLASES` key `firestorm` with `art/firestorm_fx.png` and `art/firestorm_fx.json`, replacing any static `IMAGES` entry, then consume the existing `StructureAnimator` states in the fusion renderer on `codex/redesign-reconciliation`; do not describe this asset as runtime-registered or gameplay-integrated before target-branch validation.
