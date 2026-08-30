# Hall integration handoff

- Source branch: `codex/hall-package`
- Source commits:
  - `45e2f73fc9c2c9fb62bd56bed2d424df2c7383b1` — packages the Hall pipeline, test, runtime PNG, ledger fragment, QA record, and integration handoff.
  - Follow-up documentation correction — records the exact validation outcomes and replaces the original self-referential commit wording; its SHA is the documentation-only branch tip reported with delivery.
- Target branch: `master`
- Ledger records: `hall` (`HALL` / `hall`)
- Runtime files: `client/public/art/hall.png`
- Registration files: `client/src/assets/manifest.js` (`IMAGES` key `hall`); `client/src/scenes/Preload.js` must consume the declared loader entry.
- Overlap or conflict files: none expected — this branch only updates `art/manifest/hall.json`; `art/assets-manifest.json` and `docs/assets/graphics-inventory.md` remain target-branch integration work.
- Required target-branch commands:
  - `uv run --with pillow python -m unittest test.art.hall_pipeline_test`
  - `npm test`
  - `npm run build`
  - `npm run build:manifest` after merging all in-flight asset fragments
- State on this branch: `production_converted`
- Reason integration is blocked: this delivery intentionally leaves runtime key registration and renderer/gameplay consumption to Claude Code on `master`.
