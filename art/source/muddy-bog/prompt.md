# Muddy Bog source lineage

Approved 2026-08-09 GPT Image draft: a 2 x 2 walkable bubbling quicksand rice-paddy bog with dark timber and stone edging, perimeter tiled timber gates, a bamboo sluice, stepping stones, and localized root hazards.

Style anchors are the recovered calibration assets from commit `c10c210`: `town-hall-source-v1.png`, `barricade-source-v2.png`, `watchtower-source-v1.png`, and `farm-source-v1.png` through `farm-source-v3.png`.

`idle_0.png` is the accepted draft. `entry_0.png` adds bubbling quicksand churn near the entry cells; `root_0.png` adds localized roots while preserving the visible stepping-stone path. `tools/art/muddy_bog_pipeline.py` removes the flat `#ff00ff` review background, normalizes all states to 64 x 64 RGBA, and emits the Phaser atlas.
