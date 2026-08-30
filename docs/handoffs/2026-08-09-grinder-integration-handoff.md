# Grinder integration handoff

- Source branch: `codex/grinder-production-assets`
- Source commits: `ed8ed93`
- Target branch: `master`
- Ledger records: `grinder` (`GRINDER` / `grinder`)
- Runtime files: `client/public/art/grinder.png`, `client/public/art/grinder.json`
- Registration files: `client/src/assets/manifest.js` (`IMAGES` or `ATLASES` key `grinder`); `client/src/scenes/Preload.js` must consume the declared loader entry
- Overlap or conflict files: `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`; no runtime loader files changed on the source branch
- Required target-branch commands:
  - `C:\Users\phili\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest test.art.grinder_pipeline_test`
  - `npm test`
  - `npm run build`
- State on this branch: `production_converted`
- Reason integration is blocked: this delivery intentionally leaves runtime key registration and renderer/gameplay consumption to Claude Code on `master`.
