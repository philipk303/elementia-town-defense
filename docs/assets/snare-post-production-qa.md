# Snare Post production QA

- Approved direction: compact feudal Japan/China-inspired dark-wood post with a tiled eave, braided rope loop, paper ward, and restrained jade accents.
- Runtime footprint: 1 x 1 and walkable; the asset is centered at x=0.5 with its opaque baseline at y=60 on an untrimmed 64 x 64 canvas.
- Package: `idle_0.png` and `pulse_0.png`, packed into `client/public/art/snare_post.png` with matching Phaser metadata in `client/public/art/snare_post.json`.
- Validation: `uv run --with pillow python -m unittest test/art/snare_post_pipeline_test.py` passed after regenerating the atlas on 2026-08-09.
- Delivery state: gameplay-integrated 2026-08-10. Registered as `{ key: 'snare_post', png: 'art/snare_post.png', json: 'art/snare_post.json' }` in `client/src/assets/manifest.js`'s `ATLASES`; `structureArtKey('SNARE_POST')` resolves to the same key with no code change needed.
- Frame rename: `pulse_0.png` was renamed to `active_0.png` in `snare_post.json` to match `StructureAnimator`'s generic vocabulary. The PNG pixels are unchanged, only the JSON frame key changed.
- Gameplay-code change alongside the art wiring: `server/game/structureBehaviors/aura.js`'s `tickAura` did not bump `s.cycleSeq` on its cadence pulse, so neither `StructureAnimator`'s generic cycleSeq-bump-to-ACTIVE window nor the already-wired `snare_pulse` activation SFX (`GameScene.js`'s `STRUCTURE_ACTIVATION_SFX`, which watches the same field) had ever fired for Snare Post. Added a one-line unconditional `s.cycleSeq = (s.cycleSeq + 1) | 0` on every cadence tick — this is the minimum change needed for the delivered `active` frame (and the pre-existing dormant SFX) to ever be seen/heard.
- Not yet done: a manual Phaser playtest pass confirming the idle/active pulse reads correctly in the live scene (build + `npm test` + `test:asset-delivery` all pass, but no visual capture was taken this session).
