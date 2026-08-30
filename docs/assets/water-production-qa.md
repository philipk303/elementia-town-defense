# Water production asset QA

## Scope

Validated the Water hero production atlas and separate Water Palm basic-effect atlas only. Gameplay registration, combat wiring, Whirlpool, Tidal Wave, audio, balance, networking, and server behavior remain outside this evidence.

## Source and conversion evidence

- Identity reference: `art/source/calibration/water-reference-v1.png`
- Hero sources: 80 exact production frames in `art/source/water-production/`
- Preserved raw framing corrections: 13 files in `art/source/water-production-raw-scale-drift/`
- Normalization lineage: `art/source/water-production/source-normalization.json`
- Water Palm sources: 10 exact frames in `art/source/water-basic-fx/`
- Hero output: `client/public/art/chibi_water.png` plus JSON
- FX output: `client/public/art/water_basic_fx.png` plus JSON

The hero validator reports 80 frames at fixed scale 0.0402, 64 x 64 untrimmed RGBA cells, baseline 56 for grounded idle/run frames, and 2 px gutters. Eighteen body-width warnings correspond to controlled ponytail/tunic overhang and were reviewed in the engine preview. The FX validator reports ten centered frames with no cropped opaque pixels.

## Automated evidence

Run with the bundled project Python runtime:

`python -m unittest test.art.wind_pipeline_test -v`

Run client contracts and build:

`node --test test/client/waterPreview.test.js`

`npm run build`

## Browser evidence

Reviewed `http://127.0.0.1:4173/water-preview.html` in the in-app browser on a 1280 x 736 Phaser canvas. The page loaded one canvas with the expected title and no console warnings or errors. The Hero Matrix showed all four directions across idle, run, attack, cast, hurt, and death at actual 1x scale, with a working 3x inspector. The Water Palm view loaded the hero attack plus centered release, impact, and dissipation frames at 1x and 3x.

## Remaining gate

Do not mark gameplay integration complete until the runtime atlas manifest and Water animation/effect state wiring are implemented and verified in the game scene. Whirlpool and Tidal Wave require their own radial/cone FX contracts.
