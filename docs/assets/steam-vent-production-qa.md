# Steam Vent production QA

- Source: `art/source/steam-vent/`
- Runtime atlas prepared: `client/public/art/steam_vent.png` and `.json`
- Focused validation: `node --test test/client/steamVentAtlas.test.js`
- Runtime status: gameplay-integrated 2026-08-10. `steam_vent` registered in `ATLASES`; `structureArtKey('STEAM_VENT')` resolves to it with no code change.
- Frame rename: delivered `pressure_0.png`/`confusion_0.png` renamed to `active_0.png`/`active_1.png` — a two-frame `active` clip, not two separate states. `idle_0.png` unchanged. PNG pixels unchanged, only JSON frame keys changed.
- Gameplay-code change alongside the art wiring: `server/game/structureBehaviors/confusion.js`'s `tickConfusion` never bumped `s.cycleSeq`, so `StructureAnimator`'s generic cycleSeq-bump ACTIVE window never fired. Added `s.cycleSeq = (s.cycleSeq + 1) | 0` inside the existing `if (ready && occupied)` block, so it fires exactly when the pulse itself does. Also registered `STEAM_VENT: ['steam_vent_pressure', 'steam_vent_confusion']` in `GameScene.js`'s `STRUCTURE_ACTIVATION_SFX` — those two sfx were already processed and declared in `audio.js`'s `SFX_NAMES` but had no trigger until this cycleSeq fix made the existing detection logic fire for this type.
- Not yet done: a manual Phaser playtest pass confirming the idle/active pulse reads correctly in the live scene (build + `npm test` + `test:asset-delivery` all pass, but no visual capture was taken this session).
