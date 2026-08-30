# Wind Blast production QA

Date: 2026-08-08

## Delivery unit

- Source: `art/source/wind_special_fx/frames/` (10 named source frames); review sheet: `art/source/wind_special_fx/sequence-sheet.png`.
- Runtime atlas: `client/public/art/wind_special_fx.png` and `client/public/art/wind_special_fx.json`.
- Runtime key: `wind_special_fx` in `client/src/assets/manifest.js`.
- Consumer: `GameScene._playAtk` spawns the atlas at `(a.x, a.y)` for Wind `SPECIAL_CAST` events only.

## Package checks

- The deterministic `tools/art/wind_pipeline.py --profile fx` conversion produced ten untrimmed 64x64 frames with 2px gutters. Its temporary intermediate frames were written outside the repository; only the declared runtime atlas PNG/JSON are delivery outputs.
- `test/client/windSpecialFxAtlas.test.js` verifies the package, registration, named states, and Wind-only runtime path.

## Validation

- Focused test: `node --test test/client/windSpecialFxAtlas.test.js` — 3 passed, 0 failed.
- Delivery gate: `node --test test/assetDelivery.test.js` — 5 passed, 0 failed.
- Full test suite: `npm test` — 665 passed, 0 failed, 2 skipped.
- Build: `npm run build` — succeeded; Vite reported the existing Phaser chunk-size warning only.

## Open gate

Automated delivery and runtime-path validation do not replace a manual Phaser in-combat readability review.
