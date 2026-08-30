# Firepit Production QA

- Approved source: `art/source/firepit/approved.png`, generated from the user-approved rune-ringed flame-field concept.
- Converter: `tools/art/firepit_pipeline.py`; chroma removal accepts the generated source's near-green edge variation and produces transparent RGBA frames.
- Runtime contract: eight untrimmed 96 x 64 cells with 2 px atlas gutters; `idle_00..03` loop under the existing generic structure animator and `active_00..03` are available for shared active playback.
- Registration: `client/src/assets/manifest.js` registers `fire_special` at the public PNG/JSON paths.
- Scope: no Firepit balance, footprint, server, wire, combat, camera, input, FX, or audio behavior changed.
