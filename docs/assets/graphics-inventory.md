# Elementia Town Defense graphics inventory

This is a manually derived readable snapshot of [`art/assets-manifest.json`](../../art/assets-manifest.json). The JSON ledger is authoritative; no generator exists yet.

## Current production state

All four hero atlases (`chibi_wind`, `chibi_water`, `chibi_fire`, `chibi_earth`) and all four hero basic-attack effects (`water_basic_fx`, `wind_basic_fx`, `earth_basic_fx`, plus the Wind fan-blade projectile sharing `wind_basic_fx`) are gameplay-integrated, along with all four elemental structures (`earth_special`/`rock_trap_fx` Rock Trap, `water_special` Water Geyser, `fire_special` Firepit, `wind_vortex`-backed `wind_special` Wind Vortex), the three enemy sprites (`goblin`, `orc`, `troll`), and the `fireball` projectile. Both hero special-cast effects (`water_special_fx` Whirlpool, `wind_special_fx` Wind Blast) are also gameplay-integrated, centered at the caster on every `SPECIAL_CAST` event.

Fire is still the one hero with no *dedicated* basic-attack FX source — none was ever produced. Its basic attack now reuses the static `fireball` projectile sprite as a temporary stand-in flash (`fire_saber_extension_effect`'s ledger entry marks this `substitute: true`), rather than playing no hit feedback at all. `GameScene._spawnAttackFx` grew a fallback path for exactly this: a static (non-atlas) texture with no animation states just holds briefly and fades instead of trying to chain through anim states that don't exist. Replace this wiring once real Fire basic-FX art is generated.

Earth and Fire were recovered from `codex/asset-wiring-prep` (commits `634e032`..`55c7f33`) via `codex/earth-asset-pipeline-recovery`, `codex/firepit-production-assets`, and `codex/orc-oni-art-integration` — see each affected ledger entry's `source`/`qa` fields for exact provenance and any narrow-branch discrepancies (e.g. `enemy_orc` notes a byte-different `orc.png` on the orc-oni branch that was NOT used, per the designated primary recovery source).

Grinder (`codex/grinder-production-assets`), Snare Post (`codex/snare-post-package`), Barricade/Watchtower (`codex/generic-structures-package`), Blizzard (`codex/blizzard-asset-package`), and Steam Vent (`codex/steam-vent-asset-package`) were recovered and gameplay-wired in a later round — see each entry's own "delivery" note below for provenance and the frame-vocabulary rename each one needed.

**None of this has had a manual Phaser playtest pass.** Every "gameplay_integrated" claim above was verified by: texture/animation-key existence checks against a running Preload scene, the full automated test suite (including the new `test:asset-delivery` gate), and — for the enemies — direct pixel/alpha inspection of the PNGs. The combined Goblin/Orc/Troll Phaser scale-spike gate from `docs/plans/2026-07-24-art-asset-generation-pipeline.md` remains open, as does a real desktop/landscape-phone visual pass for everything recovered in this round.

**Cast vs. attack frame naming:** `chibi_wind.json`/`chibi_water.json` ship distinct `attack_*` and `cast_*` frame sets. Renaming the existing, test-pinned `CHARACTER_STATE.CAST` (basic attacks) was out of scope, so rather than retiring it the `attack_*` frames were wired to a new `CHARACTER_STATE.SPECIAL`, driven by Q/E ability casts (`server/game/abilities.js`'s `trySpecial`/`trySecond` push a shared `SPECIAL_CAST` atk kind; `AnimationController.onSpecial` resolves it independently of the basic-attack `onAttack`/`CAST` channel). Net result: basics play `cast_*`, specials play `attack_*` — the reverse of the frame names' literal meaning, but both frame sets are now live in gameplay for Wind and Water. See `client/src/render/AnimationController.js`'s `STATE_ANIM` comment for the full rationale.

| Category | Entries | Runtime identity or scope |
|---|---:|---|
| Hero atlases | 4 | `chibi_earth`, `chibi_fire`, `chibi_water`, `chibi_wind` |
| Hero special effects | 2 | Water Whirlpool (`water_special_fx`) and Wind Blast (`wind_special_fx`), centered at the caster on `SPECIAL_CAST` with flight/impact/dissipation frames |
| Hero attack effects | 4 | Earth sweep, Water palm, Wind basic — all gameplay-integrated with dedicated art; Fire saber extension is gameplay-integrated as a temporary `fireball`-sprite substitute, no dedicated source art yet |
| Enemies | 3 | `goblin`, `orc`, `troll` |
| Generic/economy structures | 6 | Hall, Barricade, Snare Post, Watchtower, Farm, Marketplace |
| Elemental structures | 4 | `EARTH_SPECIAL`, `FIRE_SPECIAL`, `WATER_SPECIAL`, `WIND_SPECIAL` |
| Fusion structures | 6 | `MAGMA_TRAP`, `FIRESTORM`, `MUDDY_BOG`, `BLIZZARD`, `STEAM_VENT`, `GRINDER` |
| Projectiles | 2 | Fireball and Wind fan blade |
| Shared presentation | 10 | indicators, particles, and telegraphs |

## Runtime aliases and contracts

Technical runtime IDs are retained in the ledger. Display aliases separate those IDs from the planned storybook rendering: Goblin is a Karasu-tengu light runner, Orc an Oni ashigaru medium bruiser, Troll a Mountain-oni heavy, and `MAGMA_TRAP` displays as Volcano. `*_SPECIAL` IDs display as Rock Trap, Firepit, Water Geyser, and Wind Vortex.

Hero atlases use `{idle, run, attack, cast, hurt, death}` in four directions. Atlas frames follow `<state>_<direction>_<idx>.png` on 64 x 64 RGBA canvases, nearest-neighbor filtered, all four elements sharing the same validated center-x/baseline-56 origin contract and 0.0402 scale. In gameplay, `cast` actually plays on basic attacks and `attack` on Q/E specials (`CHARACTER_STATE.SPECIAL`) — see the "Cast vs. attack frame naming" note above.

| Asset group | Footprint and orientation | Critical states |
|---|---|---|
| Hall | 2 x 2, non-walkable | static |
| Barricade | 1 x 1, non-walkable | static (single image, no atlas) |
| Watchtower | 1 x 1, non-walkable | idle, active (delivered as idle/recoil; renamed to match `StructureAnimator`'s vocabulary) |
| Snare Post | 1 x 1, walkable | idle, active |
| Farm | 1 x 1, non-walkable | static |
| Marketplace market square | 2 x 2, non-walkable; source and package are present, runtime-registered as `marketplace` | static |
| Elemental structures | 2 x 1, walkable; transpose to 1 x 2 | Rock Trap: launcher idle/launch/recovery plus a target-point `impact_down` burst; Firepit: idle/active only (no telegraph/recovery/charged — its spec has no `targetImpact`/`cycle` family); Geyser: idle/compress(active)/launch; Vortex: idle/telegraph/active/charged/recovery, all four directional |
| Fusions | 2 x 2, walkable | Volcano idle/telegraph/charged/active/recovery (all five reachable — `entryTrigger` family); Firestorm idle/active only reachable (`volley` family has no phase machine), though the atlas ships all five; Muddy Bog idle/active (delivered as idle/entry/root, active a two-frame clip — `areaEntry` family, same no-phase-machine shape as Firepit); Blizzard idle structure image plus a target-point warning/spike/shatter burst (mirrors Rock Trap's pattern); Steam Vent idle/active (delivered as idle/pressure/confusion, active a two-frame clip); Grinder idle/telegraph/charged/active/recovery (delivered as idle/intake/crush/release) |

Shared indicators and telegraphs are planned as procedural runtime geometry; they intentionally have no Pillow output. The elemental particle library has planned reusable Pillow sprites and pooled runtime playback.

## Grinder delivery

The approved Earth + Wind vortex concept is preserved at `art/source/grinder/grinder-concept-v1.png`, with the four source frames under `art/source/grinder/frames/`. Its untrimmed 128 x 128 four-state atlas (`idle`, `intake`, `crush`, `release`) is `client/public/art/grinder.png` plus `client/public/art/grinder.json`, recovered from `codex/grinder-production-assets` (`ed8ed93`) and gameplay-wired here in `client/src/assets/manifest.js`/`Preload.js`/the fusion structure renderer. See `docs/assets/grinder-production-qa.md` and `docs/handoffs/2026-08-09-grinder-integration-handoff.md`.

## Volcano delivery

The approved Fire + Earth Volcano (`MAGMA_TRAP`) source frames are under `art/source/volcano/`: the bubbling idle crater, hotter charge state, and contained eruption state. `tools/art/volcano_pipeline.py` packages them as `client/public/art/magma_trap.png` plus `client/public/art/magma_trap.json`, a five-frame 128 x 128 atlas (`idle`, `telegraph`, `charged`, `active`, `recovery`) registered under the exact lowercase runtime key `magma_trap`. The atlas preserves the broad 2 x 2 walkable basalt lava pit and its four cardinal shrine gates. Recovered from `codex/volcano-magma-trap-assets` (`b62f042`) and gameplay-wired here. Unlike Grinder, Snare Post, Watchtower and Steam Vent, Volcano needed no frame rename and no server change: `MAGMA_TRAP` is the `entryTrigger` family, which already drove all five states and already bumped `cycleSeq` on eruption. See `docs/assets/volcano-production-qa.md` and `docs/handoffs/2026-08-12-volcano-runtime-integration.md`.

## Firestorm delivery

The approved Fire + Wind ceremonial signal pavilion concept is at `art/source/firestorm/firestorm-concept-draft-v2.png`, with the chroma-key production source and the idle/charge/volley state sources under `art/source/firestorm/`. `tools/art/firestorm_pipeline.py` packages them as `client/public/art/firestorm_fx.png` plus `client/public/art/firestorm_fx.json` — 10 untrimmed 96 x 96 frames, two each for `idle`, `telegraph`, `charged`, `active`, `recovery` — recovered from `codex/firestorm-asset-delivery` (`94bcdf7`, `9113ec6`) and registered under the runtime key `firestorm`.

Two things to know about this one. The key points at `firestorm_fx.*`, not a `firestorm.*` file, the same intentional key/filename split as `wind_special` -> `wind_vortex`; the earlier static `client/public/art/firestorm.png` from `94bcdf7` is superseded by the atlas and stays on disk unregistered as lineage evidence. And only two of the five packaged states can ever play: `FIRESTORM`'s spec is `volley`, a family `structureFamily()` gives no phase machine, so the animator rests at `idle` and shows `active` on each `cycleSeq` bump. The telegraph/charged/recovery frames are inert unless Firestorm later gains a charge ramp. No server change was needed — `volley.js` already bumped `cycleSeq` per volley. See `docs/assets/firestorm-production-qa.md` and `docs/handoffs/2026-08-09-firestorm-runtime-integration.md`.

## Muddy Bog delivery

The approved cozy feudal Japan/Asia rice-paddy bog concept is under `art/source/muddy-bog/` (`muddy-bog-draft-v2.png` plus idle/entry/root state sources). `tools/art/muddy_bog_pipeline.py` packages them as `client/public/art/muddy_bog.png` plus `client/public/art/muddy_bog.json`, a three-frame 64 x 64 atlas, centered x=0.5 with opaque baseline y=60, registered under the runtime key `muddy_bog`. Recovered from `codex/muddy-bog-package` (`408f8f3`) and gameplay-wired here.

The delivered `idle_0`/`entry_0`/`root_0` frame names were renamed to `idle_0`/`active_0`/`active_1` — a two-frame active clip (the crossing cue, then the ongoing root churn), the same shape as Steam Vent's `pressure`/`confusion` rename. `MUDDY_BOG`'s spec is `areaEntry`, a family `structureFamily()` has no phase machine for (falls through to `static`, idle/active only, same as Firepit). `areaEntry.js`'s `tickAreaEntry` never bumped `cycleSeq` before this registration — `areaEntry` was absent from `structureFamily()`'s switch, the same gap Snare Post's `aura.js` and Watchtower's `towers.js` default branch had before their own fixes. Fixed with a one-line bump on each fresh crossing (a new root cycle starting), not the recurring per-enemy damage pulse. See `docs/assets/muddy-bog-production-qa.md`.

## Snare Post delivery

The approved feudal Japan/China-inspired Snare Post source is preserved at `art/source/snare-post/snare-post-concept-v1.png`. Its two-frame untrimmed 64 x 64 atlas is `client/public/art/snare_post.png` plus `client/public/art/snare_post.json`, recovered from `codex/snare-post-package` (`973bfdf`) and registered in `ATLASES`. Its delivered `idle`/`pulse` frame names were renamed to `idle`/`active` to match `StructureAnimator`'s generic vocabulary; `server/game/structureBehaviors/aura.js`'s `tickAura` was given a one-line `cycleSeq` bump on each cadence pulse so the existing generic cycleSeq-bump-to-ACTIVE logic (and the already-wired `snare_pulse` activation SFX, which watched the same field but never fired before this) both actually trigger. See `docs/assets/snare-post-production-qa.md` and `docs/handoffs/2026-08-09-snare-post-integration-handoff.md`.

## Generic-structure delivery

Barricade and Watchtower use recovered calibration sources from `c10c210`, recovered from `codex/generic-structures-package` (`2fa873d`). Barricade is a single 64 x 64 static image, registered in `IMAGES`. Watchtower is a two-state atlas delivered as `idle`/`recoil`; `recoil` was renamed to `active` to match `StructureAnimator`'s vocabulary, and `server/game/towers.js`'s default (non-family) tower-fire branch — Watchtower's only occupant — was given the same one-line `cycleSeq` bump Snare Post needed, since it never had one either and the `watchtower_fire` activation SFX (`GameScene.js`'s `STRUCTURE_ACTIVATION_SFX`) was dormant for the same reason. See `docs/assets/generic-structures-production-qa.md` and `docs/handoffs/2026-08-09-generic-structures-integration-handoff.md`.

## Blizzard delivery

Recovered from `codex/blizzard-asset-package` (`4e0db0d`). Ships as two pieces, mirroring Rock Trap's split: a single 64 x 64 `client/public/art/blizzard.png` structure image (registered in `IMAGES`), plus a three-frame `client/public/art/blizzard_fx.png`/`.json` target-point atlas (`warning`, `spike`, `shatter`, registered in `ATLASES`) fired at `ds.tx`/`ds.ty`. `GameScene.js`'s previously Rock-Trap-only target-fx trigger (`s.type === 'EARTH_SPECIAL'`) was generalized into `STRUCTURE_TARGET_FX`/`STRUCTURE_TARGET_WARNING_FX` lookup tables so Blizzard's `targetImpact` family phase-0->1 edge plays `blizzard_fx_warning` once, and each `cycleSeq` bump chains `spike` into `shatter` via the existing `_spawnAttackFx` state-chaining support. See `docs/assets/blizzard-production-qa.md` and `docs/handoffs/2026-08-09-blizzard-integration-handoff.md`.

## Steam Vent delivery

Recovered from `codex/steam-vent-asset-package` (`b145b32`, `84ad082`). A single `client/public/art/steam_vent.png`/`.json` atlas, registered in `ATLASES`. Delivered as `idle`/`pressure`/`confusion`; `pressure` and `confusion` were renamed to `active_0`/`active_1` — a single two-frame `active` clip (steam building, then the scald burst) rather than duplicating Grinder's telegraph/charged-duplicate approach, since `buildAnimsForAtlas` groups same-named, differently-indexed frames into one multi-frame animation automatically. `confusion.js`'s `tickConfusion` (the `confusion` family, absent from `structureFamily()`'s switch the same as `aura`) never bumped `cycleSeq`, so the generic ACTIVE window never fired; fixed with a one-line bump gated on the same ready-AND-occupied condition the pulse itself already uses. See `docs/assets/steam-vent-production-qa.md` and `docs/handoffs/2026-08-09-steam-vent-integration-handoff.md`.

## Muddy Bog delivery

The approved 2 x 2 walkable Muddy Bog source states are preserved at `art/source/muddy-bog/`. Its three untrimmed 64 x 64 frames (`idle_0.png`, `entry_0.png`, and `root_0.png`) are packed into `client/public/art/muddy_bog.png` with matching Phaser metadata in `client/public/art/muddy_bog.json`. The package is deliberately not registered in `ATLASES`; see `docs/assets/muddy-bog-production-qa.md` and the dated integration handoff for target-branch wiring.

## Required calibration evidence

The first accepted Phaser evidence must cover Fire and Wind heroes, all three enemy slots, Barricade, Farm, Watchtower, Hall, and the three required presentation slices: Wind basic, Rock Trap, and Wind Vortex. It must demonstrate aligned footprints, origins, direction, effects, HUD/grid overlap, elite scaling, and fallback behavior at desktop and landscape-phone layouts.

**Status as of this recovery round:** Fire and Wind heroes, all three enemies, and Rock Trap/Wind Vortex are now runtime-registered and rendering through the real Preload/GameScene path — but the actual scale-spike evidence (a live Phaser screenshot at the 1280x736/40x23/32px grid, elite scaling, HUD overlap, fallback behavior) has not been captured for any of them. Farm and Hall remain unproduced (`planned` in the ledger); Barricade, Watchtower, and Blizzard are now produced and registered but likewise have no captured screenshot evidence, so this gate cannot close yet regardless.
