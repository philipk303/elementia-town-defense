# Fire basic FX integration handoff

- Source branch: `codex/fire-basic-fx-package`
- Source commits: `205f403d2613c5c98463a9227bb31f7a37f2204a` (`feat(art): package Fire basic attack effect`), followed by the documentation-only correction commit containing this clarification.
- Target branch: `master`
- Ledger records: `fire_saber_extension_effect` (`fire_saber_extension` / `fire_saber_extension`)
- Runtime files: `client/public/art/fire_saber_extension.png`, `client/public/art/fire_saber_extension.json`
- Registration files: `client/src/assets/manifest.js` (`ATLASES` key `fire_saber_extension`); `client/src/scenes/Preload.js` must consume the declared loader entry. Fire attack rendering must replace the current static `fireball` substitute and explicitly rotate the centered, right-authored sprites for actor-facing `down`, `up`, `left`, and `right`.
- Integration-blocking direction requirement: the current loader ignores the atlas JSON's custom `orientation`, `authoredDirection`, and `directions` metadata. Those fields are documentation, not runtime behavior. Claude Code must implement actor-facing sprite rotation and add a focused automated test proving all four facing mappings before changing `runtime.status` from `planned` or setting `gameplay_integrated: true`.
- Overlap or conflict files: none expected — this branch only edits `art/manifest/fire_saber_extension_effect.json`; `docs/assets/graphics-inventory.md` is hand-maintained and must be updated on `master`.
- Required target-branch commands:
  - `C:\Users\phili\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest test.art.fire_basic_fx_pipeline_test`
  - `npm test`
  - `npm run build`
- State on this branch: `production_converted`
- Reason integration is blocked: this delivery intentionally leaves runtime key registration and renderer/gameplay consumption to Claude Code on `master`; registration alone is insufficient because authored-right sprite rotation and its focused four-facing test are required before runtime status can be cleared.
- Repository transport caveat: no Git remote is configured, so this branch cannot be pushed; consume the local branch/worktree directly.
