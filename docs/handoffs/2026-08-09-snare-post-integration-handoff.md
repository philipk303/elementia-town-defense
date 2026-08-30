# Snare Post integration handoff

- Source branch: `codex/snare-post-package`
- Source commits: `pending`
- Target branch: `master`
- Ledger records: `snare_post`
- Runtime files: `client/public/art/snare_post.png`, `client/public/art/snare_post.json`
- Registration files: `client/src/assets/manifest.js`, add `{ key: 'snare_post', png: 'art/snare_post.png', json: 'art/snare_post.json' }` to `ATLASES`
- Overlap or conflict files: `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`, and `client/src/assets/manifest.js`
- Required target-branch commands:
  - `uv run --with pillow python -m unittest test/art/snare_post_pipeline_test.py`
  - `npm test`
  - `npm run build`
- State on this branch: `production_converted`
- Reason integration is blocked: this producer session must not claim runtime registration or gameplay integration; wire and validate on `master`.

The target branch must receive the source, atlas PNG/JSON, ledger, inventory, QA, focused test, and registration together. Do not call the package complete until those items are present and validated on `master`.
