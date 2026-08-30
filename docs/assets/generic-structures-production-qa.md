# Barricade and Watchtower production QA

- Sources recovered from commit `c10c210`: Barricade v2 and Watchtower v1 calibration PNGs.
- Barricade package: 32x32 RGBA static PNG at `client/public/art/barricade.png`.
- Watchtower package: idle/recoil untrimmed 48x64 atlas at `client/public/art/watchtower.png` plus JSON.
- Validation: `uv run --with pillow python -m unittest test/art/generic_structures_pipeline_test.py` passed on 2026-08-09.
- Delivery state: gameplay-integrated 2026-08-10. `barricade` registered in `IMAGES`; `watchtower` registered in `ATLASES`.
- Frame rename: Watchtower's delivered `recoil_0.png` was renamed to `active_0.png` in `watchtower.json` to match `StructureAnimator`'s generic vocabulary. The PNG pixels are unchanged, only the JSON frame key changed.
- Gameplay-code change alongside the art wiring: `server/game/towers.js`'s default (non-family) tower-fire branch — Watchtower is its only occupant, every other offensive structure type is dispatched to a named behavior family — never bumped `s.cycleSeq` on a shot, so neither `StructureAnimator`'s generic cycleSeq-bump-to-ACTIVE window nor the already-wired `watchtower_fire` activation SFX (`GameScene.js`'s `STRUCTURE_ACTIVATION_SFX`, which watches the same field) had ever fired. Added a one-line `s.cycleSeq = (s.cycleSeq + 1) | 0` alongside `s.attackReadyAt = now + spec.cooldownMs` — the minimum change needed for the delivered `active` frame (and the pre-existing dormant SFX) to ever be seen/heard. Same pattern as the Snare Post `aura.js` fix.
- Not yet done: a manual Phaser playtest pass confirming Watchtower's idle/active recoil reads correctly in the live scene, and confirming Barricade's static image displays at the right footprint/origin (build + `npm test` + `test:asset-delivery` all pass, but no visual capture was taken this session).
