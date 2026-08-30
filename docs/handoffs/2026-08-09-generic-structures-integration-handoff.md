# Barricade and Watchtower integration handoff

- Source branch: `codex/generic-structures-package`
- Source commits: `pending`
- Target branch: `master`
- Ledger records: `barricade`, `watchtower`
- Runtime files: `client/public/art/barricade.png`, `client/public/art/watchtower.png`, `client/public/art/watchtower.json`
- Registration files: `client/src/assets/manifest.js`; add `barricade` to `IMAGES` and `watchtower` to `ATLASES`.
- Overlap or conflict files: `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`, `client/src/assets/manifest.js`
- Required target-branch commands:
  - `uv run --with pillow python -m unittest test/art/generic_structures_pipeline_test.py`
  - `npm test`
  - `npm run build`
- State on this branch: `production_converted`
- Reason integration is blocked: Claude owns target-branch wiring and runtime validation.
