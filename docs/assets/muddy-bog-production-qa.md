# Muddy Bog production QA

- Approved direction: cozy feudal Japan/Asia-inspired 2 x 2 rice-paddy bog with dark timber, tiled entry gates, stone base, bamboo sluice, bubbling tea-brown quicksand, and localized roots.
- Runtime footprint: 2 x 2 and walkable. Each state is an untrimmed 64 x 64 RGBA frame centered at x=0.5 with opaque baseline y=60.
- Package: `idle_0.png`, `entry_0.png`, and `root_0.png`, packed into `client/public/art/muddy_bog.png` with Phaser metadata in `client/public/art/muddy_bog.json`.
- Focused validation: `uv run --with pillow python -m unittest test/art/muddy_bog_pipeline_test.py` passed after regenerating the atlas on 2026-08-12.
- Delivery state: `production_converted`; the package is intentionally not registered or gameplay-integrated. Claude Code must add the `muddy_bog` atlas to `ATLASES` and prove target-branch consumption.
