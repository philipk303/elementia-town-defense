# Elemental particle library production QA — 2026-08-13

- Asset: `elemental_particle_library` / `elemental_particles`, seven reusable presentation states.
- Source: generated state art and recipe under `art/source/elemental-particles/`.
- Runtime package: `client/public/art/elemental_particles.png` and `.json`.
- Contract choice: one centered untrimmed 64x64 RGBA frame per state in ledger order, with 2px transparent gutters; final atlas 460x64. This matches established game-effect sizing while keeping the pooled library compact.
- Focused validation: bundled workspace Python `-m unittest test.art.elemental_particles_pipeline_test` passed (1 test).
- Production build: `npm run build` passed (80 modules transformed; existing Phaser chunk-size advisory only).
- Full suite: `npm test` ran 691 tests: 688 passed, 2 skipped, and 1 failed solely because this fragment intentionally differs from the untouched generated aggregate. The dispatch forbids this branch from running `npm run build:manifest`; Claude must regenerate the aggregate after merge.
- Visual review: fire, steam, wind, water, snow, smoke, and debris remain distinct and readable at 64px; silhouettes are centered, fully contained, and separated by transparent gutters.
- Runtime state: intentionally remains planned/unregistered. Claude must register the atlas and choose pooled emitter behavior, including worst-case performance validation.
