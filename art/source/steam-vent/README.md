# Steam Vent source lineage

Approved source states are `steam-vent-concept-v2-reference-aligned.png` (idle), `steam-vent-concept-v3-steam-gate.png` (pressure), and `steam-vent-concept-v4-overflowing-steam.png` (confusion). They follow the recovered c10c210 town-structure calibration anchors.

`tools/art/steam_vent_pipeline.py` packages the three fixed 128px atlas frames. The runtime package is `client/public/art/steam_vent.png` plus `steam_vent.json`; registration and gameplay consumption are deliberately deferred to Claude.
