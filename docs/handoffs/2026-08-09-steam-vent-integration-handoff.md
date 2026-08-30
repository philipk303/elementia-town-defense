# Steam Vent integration handoff

- Source branch: `codex/steam-vent-asset-package`
- Source commits: pending commit
- Target branch: `master`
- Ledger records: `steam_vent`
- Runtime files: `client/public/art/steam_vent.png`, `client/public/art/steam_vent.json`
- Registration files: `client/src/assets/manifest.js` with atlas key `steam_vent`; `client/src/scenes/Preload.js` must load that exact key
- Overlap or conflict files: `art/assets-manifest.json`, `docs/assets/graphics-inventory.md`, `client/src/assets/manifest.js`, `client/src/scenes/Preload.js`
- Required target-branch commands:
  - `node --test test/client/steamVentAtlas.test.js`
  - `npm test`
  - `npm run build`
- State on this branch: `production_converted`
- Reason integration is blocked: this branch packages the approved art and named states only; Claude owns target-branch atlas registration, renderer selection, and gameplay state consumption.

Steam Vent uses the 2x2 walkable fusion record `steam_vent` / `STEAM_VENT` and three named atlas frames: `idle_0.png`, `pressure_0.png`, and `confusion_0.png`. Do not mark it runtime-registered or gameplay-integrated until the target branch contains the matching ledger and inventory updates plus focused validation.
