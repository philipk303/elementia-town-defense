# Grinder production QA — 2026-08-09

- Asset: `GRINDER` / `grinder`, Earth + Wind, walkable 2 x 2 fusion structure.
- Source: `art/source/grinder/grinder-concept-v1.png`; four source-derived state frames in `art/source/grinder/frames/`.
- Runtime package: `client/public/art/grinder.png` and `client/public/art/grinder.json`.
- Focused validation: `C:\Users\phili\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest test.art.grinder_pipeline_test`
- Observed result: pass; exactly four named, non-empty 128 x 128 RGBA frames and a 518 x 128 Phaser atlas.
- Visual review: central wind vortex, orbiting brown boulders, and four cardinal feudal timber-and-tile gates remain legible in every state.
- Runtime state: gameplay-integrated 2026-08-10. Registered as `{ key: 'grinder', png: 'art/grinder.png', json: 'art/grinder.json' }` in `client/src/assets/manifest.js`'s `ATLASES`; `structureArtKey('GRINDER')` resolves to the same key with no code change needed.
- Frame rename: the delivered `idle/intake/crush/release` frame names were renamed in `grinder.json` to the generic `idle/telegraph/charged/active/recovery` vocabulary `StructureAnimator` (`client/src/render/AnimationController.js`) drives every `cycle`-family structure through — `intake` became `telegraph` (duplicated as `charged`, since the source has one frame for the whole INTAKE ramp), `crush` became `active`, `release` became `recovery`. The PNG pixels are unchanged; only the JSON frame keys and one duplicated frame entry changed. Verified against `server/game/structureBehaviors/cycle.js`'s `tickGrinder`: `active` fires on the `cycleSeq` bump at CRUSH entry (the crush+eject moment), `recovery` covers the rest of the CRUSH phase tail, `telegraph`/`charged` cover the INTAKE charge ramp.
- Not yet done: a manual Phaser playtest pass confirming the renamed frames read correctly in the live scene (build + `npm test` + `test:asset-delivery` all pass, but no visual capture was taken this session).
