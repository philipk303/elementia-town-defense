# Hall production QA — 2026-08-13

- Asset: `HALL` / `hall`, static non-walkable 2 x 2 Town Hall structure.
- Source: approved `art/source/calibration/town-hall-source-v1.png`, reused as-is without regeneration.
- Runtime package: `client/public/art/hall.png`.
- Focused validation: `uv run --with pillow python -m unittest test.art.hall_pipeline_test` passed (`Ran 1 test in 0.033s`, `OK`); the package is one non-empty 64 x 64 RGBA image with transparent background and opaque bounds `(7, 2, 57, 62)`.
- Build validation: `npm run build` passed; Vite transformed 80 modules and completed the production build in 5.37s.
- Full-test validation: `npm test` ran 691 tests: 688 passed, 2 skipped, and 1 failed. The sole failure is the mandated aggregate-ledger drift check: `art/manifest/hall.json` intentionally differs from the untouched `art/assets-manifest.json`. Claude must run `npm run build:manifest` after merging the asset fragments; no other test failed.
- Visual review: the complete pagoda silhouette is centered with clear roof tiers, stairway, and seated princess; the magenta chroma-key matte is absent.
- Runtime state: not registered. `runtime.status` remains `planned`; loader registration and live Phaser scale/readability review belong to target-branch integration.
