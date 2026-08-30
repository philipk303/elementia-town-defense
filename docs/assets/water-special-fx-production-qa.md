# Water Whirlpool production QA

Date: 2026-08-08

## Delivery unit

- Source: `art/source/water_special_fx/frames/` (10 named source frames); review sheet: `art/source/water_special_fx/sequence-sheet.png`.
- Runtime atlas: `client/public/art/water_special_fx.png` and `client/public/art/water_special_fx.json`.
- Runtime key: `water_special_fx` in `client/src/assets/manifest.js`.
- Consumer: `GameScene._playAtk` spawns the atlas at `(a.x, a.y)` for Water `SPECIAL_CAST` events only.

## Package checks

- The deterministic `tools/art/wind_pipeline.py --profile fx` conversion produced ten untrimmed 64x64 frames with 2px gutters. Its shared intermediate-frame writes were restored to the target baseline; only the declared `water_special_fx` atlas PNG/JSON are delivery outputs.
- `test/client/waterSpecialFxAtlas.test.js` verifies the package, registration, named states, and Water-only runtime path.

## Validation

- Focused test: `node --test test/client/waterSpecialFxAtlas.test.js` â€” 3 passed, 0 failed.
- Full test suite: `npm test` â€” 662 passed, 0 failed, 2 skipped.
- Build: `npm run build` â€” succeeded. Vite reported the existing Phaser chunk-size warning only.

## Open gate

Automated delivery and runtime-path validation do not replace a manual Phaser in-combat readability review.
