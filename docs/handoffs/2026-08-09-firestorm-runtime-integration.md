# Firestorm integration handoff

- Source branch: `codex/firestorm-asset-delivery`
- Source commits: `94bcdf7` plus this follow-up delivery commit
- Target branch: `codex/redesign-reconciliation`
- Ledger records: `firestorm`
- Runtime files: `client/public/art/firestorm.png`, `client/public/art/firestorm_fx.png`, `client/public/art/firestorm_fx.json`
- Registration files: `client/src/assets/manifest.js` — `ATLASES` key `firestorm` (replaces static `IMAGES` entry); `client/src/render/sprites.js` — existing fusion renderer
- Overlap or conflict files: `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`; runtime source files are untouched
- Required target-branch commands:
  - `python -m unittest test.art.firestorm_pipeline_test -v`
  - `npm test`
  - `npm run build`
- State on this branch: `production_converted`
- Reason integration is blocked: `Runtime registration and fusion-renderer wiring are owned by Claude on codex/redesign-reconciliation.`

Firestorm is ready for integration. Register the state atlas only after this delivery is applied to the target branch; do not advance its ledger state on this delivery branch.
