# Volcano integration handoff

- Source branch: `codex/volcano-magma-trap-assets`
- Source commits: `pending commit`
- Target branch: `codex/redesign-reconciliation`
- Ledger records: `volcano`
- Runtime files: `client/public/art/magma_trap.png`, `client/public/art/magma_trap.json`
- Registration files: `client/src/assets/manifest.js` key `magma_trap`
- Overlap or conflict files: `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`, `client/src/assets/manifest.js`
- Required target-branch commands:
  - `C:\Users\phili\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest test.art.volcano_pipeline_test`
  - `npm run test:asset-delivery`
  - `npm test`
  - `npm run build`
- State on this branch: `runtime-registered`
- Reason integration is blocked: this isolated asset-production worktree must not directly modify the active gameplay branch.

Ready for integration; do not report this asset group complete until the target branch contains the source, package, registration, ledger, inventory, and passing validations.
