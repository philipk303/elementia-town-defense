# Farm production QA

Date: 2026-08-13

- Selected source: `art/source/calibration/farm-source-v3.png`.
- Candidate review: `farm-source-v1.png` omits the fields, `farm-source-v2.png` has a less balanced field composition, and the base image is byte-identical to v3. V3 provides the clearest complete farmhouse-and-rice-paddy silhouette for the economy structure.
- Runtime package: `client/public/art/farm.png`, a static 32 x 32 RGBA image.
- Conversion: removed the flat magenta calibration background, cropped the opaque subject, downscaled with Pillow nearest-neighbor sampling, and centered it at x=0.5 with baseline y=30.
- Pillow inspection: 32 x 32 RGBA; transparent at all four corners; non-empty alpha bounds `(5, 4, 27, 26)`.
- Visual inspection: the final 32 px package retains a readable blue-roof farmhouse, gold crop emblem, green paddy rows, and stone perimeter without visible magenta background.
- Focused validation: `uv run --with pillow python -m unittest test/art/farm_pipeline_test.py` passed: 1 test, 0 failures.
- Build validation: `npm run build` passed; Vite transformed 80 modules and emitted its existing large-chunk advisory.
- Full-suite validation: `npm test` reported 691 tests: 688 passed, 1 failed, and 2 skipped. The sole failure is the mandated `farm` fragment/aggregate drift awaiting Claude's target-branch `npm run build:manifest`; this producer branch must not regenerate or edit `art/assets-manifest.json`.
- Delivery state: `production_converted`; runtime registration is deliberately left planned for target-branch integration.
- Open gate: manual Phaser playtest confirmation of 1 x 1 footprint scale and readability after registration.
