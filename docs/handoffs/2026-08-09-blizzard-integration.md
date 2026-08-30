# Blizzard integration handoff

- Source branch: `codex/blizzard-asset-package`
- Source commits: `4e0db0d`
- Target branch: `master`
- Ledger records: `blizzard`
- Runtime files: `client/public/art/blizzard.png`, `client/public/art/blizzard_fx.png`, `client/public/art/blizzard_fx.json`
- Registration files: `client/src/assets/manifest.js` keys `blizzard` and `blizzard_fx`; `client/src/scenes/GameScene.js` event `blizzard`
- Overlap or conflict files: `client/src/assets/manifest.js`, `client/src/audio.js`, `client/src/scenes/GameScene.js`, `server/game/towers.js`, `test/game/towers.test.js`
- Required target-branch commands:
  - `node --test test/game/towers.test.js test/art/blizzardPipeline.test.js`
  - `npm test`
  - `npm run build`
- State on this branch: `production-converted`
- Reason integration is blocked: `master` is checked out in a separate shared worktree; this isolated delivery branch must be reviewed and merged there before ledger/runtime state can advance.

Ready for integration. The current server resolves Blizzard immediately at its selected enemy; the client plays warning, spike, then shatter at that resolved target. A true pre-impact target lock/telegraph requires the combat timing redesign described in the Blizzard behavior specification.
