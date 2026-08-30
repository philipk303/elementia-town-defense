# Wind production QA

## Scope and contracts

- Hero sources: 80 frames across `art/source/wind-vertical-slice/` and `art/source/wind-production/`; calibration sources remain preserved.
- Hero output: `client/public/art/chibi_wind.png` and `.json`, 64 x 64 untrimmed RGBA frames, fixed scale 0.0402, baseline 56, and 2 px atlas gutters.
- Basic FX sources: 10 frames under `art/source/wind-basic-fx/` (four flight, three impact, three dissipation).
- FX output: `client/public/art/wind_basic_fx.png` and `.json`, centered 64 x 64 untrimmed RGBA frames with 2 px atlas gutters.
- Runtime scope: isolated production preview only. Gameplay atlas registration, animation-state wiring, attack/projectile integration, and audio are unchanged.

## Automated evidence

- `uv run --with pillow --with numpy python tools/art/wind_pipeline.py ... --profile hero`: 80 frames validated with the fixed hero contract. Eleven width findings were emitted as non-blocking visual-review warnings; the reviewed atlas showed no cropping or cell bleed.
- `uv run --with pillow --with numpy python tools/art/wind_pipeline.py ... --profile fx`: 10 frames validated; every converted opaque-bounds center is within 0.5 px of the 32,32 effect origin.
- `uv run --with pillow --with numpy python -m unittest discover -s test/art -p "*_test.py" -v`: art pipeline and manifest contract suite passes.
- `node --test test/client/windPreview.test.js`: preview declaration, matrix-layout, and basic-sequence suite passes.
- `npm test` and `npm run build`: project tests and production build pass. The build retains the existing Phaser chunk-size advisory.

## Visual evidence

The standalone Phaser preview was inspected at desktop and 844 x 390 landscape-phone viewports. The hero matrix displayed all 24 state/direction animations at actual size with shared row baselines and a 3x inspector. The basic sequence displayed simultaneous actual-size and 3x lanes in the order hero attack, fan flight, impact, and dissipation. Both layouts fit their viewports; no crop, cell bleed, browser error, or browser warning was observed.

## Corrections retained in the production sources

- Right run frames 00, 01, and 03 were proportionally normalized to meet the fixed-scale geometry contract; their left mirrors were regenerated from the accepted right sources.
- `death_right_02` was replaced with a grounded kneeling phase before mirroring.
- FX-only border-key normalization removed near-magenta edge outliers while leaving the global chroma-removal thresholds and calibration sources unchanged.
