# Wind Vortex source lineage

`wind-vortex-concept-v1.png` is the approved art-direction concept. The
`frames/` directory contains the deterministic, source-derived 64px frames
created by `tools/art/wind_vortex_pipeline.py`; it is source material, not
runtime art.

The runtime package is `client/public/art/wind_vortex.png` and its Phaser JSON
metadata. It contains `idle`, `telegraph`, `charged`, `active`, and `recovery`
frames for each locked cardinal output direction.
