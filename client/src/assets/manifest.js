// Single art drop-in point (spec §6, ez-ctf PNG+atlas convention:
// C:\dev\ez-ctf\client\src\classArt.js). Preload.js loads whatever is listed
// here and GameScene's render helper (client/src/render/sprites.js) falls
// back to placeholder shapes for any key with no matching entry, so adding an
// entry is the ONLY change needed to bring a new piece of real art online.
//
// ATLASES: animated, multi-frame sprites (Phaser texture-atlas JSON, frame
// names `<anim>_<dir>_<idx>.png` — see Preload.js's buildAnimsForAtlas).
// Files expected at client/public/art/<png|json>.
//
//   Per spec, the 4 playable elements each get their own baked chibi variant
//   (shared base rig, hair color + small accent differ — Fire ember trim,
//   Water droplet/flow, Earth stone-fleck, Wind wisps), NOT a single grey rig
//   + setTint() — the accents differ per element, not just the hue.
//   All four elements are live below.
//
//   Structures may ALSO ship as atlases (Task 17), listed here under the same
//   key `structureArtKey(type)` returns below — an atlas key and an image key
//   are interchangeable to entitySprite(), so a structure upgrades from a
//   static image to an animated one by moving its entry from IMAGES to
//   ATLASES with no code change. Their frames use the animation controller's
//   structure states instead of the hero states:
//     `<idle|telegraph|active|recovery|charged>_<idx>.png`, or
//     `<state>_<N|E|S|W>_<idx>.png` for the direction-locked structures
//     (Water Geyser / Wind Vortex). Any state the atlas omits is simply never
//     played — render/AnimationController.js checks scene.anims.exists first.
export const ATLASES = [
  { key: 'earth_special', png: 'art/earth_special.png', json: 'art/earth_special.json' },
  { key: 'rock_trap_fx', png: 'art/rock_trap_fx.png', json: 'art/rock_trap_fx.json' },
  { key: 'water_special', png: 'art/water_special.png', json: 'art/water_special.json' },
  { key: 'chibi_wind', png: 'art/chibi_wind.png', json: 'art/chibi_wind.json' },
  { key: 'chibi_water', png: 'art/chibi_water.png', json: 'art/chibi_water.json' },
  { key: 'wind_basic_fx', png: 'art/wind_basic_fx.png', json: 'art/wind_basic_fx.json' },
  { key: 'water_basic_fx', png: 'art/water_basic_fx.png', json: 'art/water_basic_fx.json' },
  { key: 'water_special_fx', png: 'art/water_special_fx.png', json: 'art/water_special_fx.json' },
  { key: 'wind_special_fx', png: 'art/wind_special_fx.png', json: 'art/wind_special_fx.json' },
  { key: 'chibi_fire', png: 'art/chibi_fire.png', json: 'art/chibi_fire.json' },
  { key: 'chibi_earth', png: 'art/chibi_earth.png', json: 'art/chibi_earth.json' },
  { key: 'earth_basic_fx', png: 'art/earth_basic_fx.png', json: 'art/earth_basic_fx.json' },
  { key: 'fire_special', png: 'art/fire_special.png', json: 'art/fire_special.json' },
  // Wind Vortex's runtime key follows structureArtKey('WIND_SPECIAL') below
  // ('wind_special', a pure lowercase of the server type), but its packaged
  // files are named wind_vortex.png/.json — the approved corrected package
  // (codex/asset-wiring-prep commit 55c7f33) superseded an earlier incomplete
  // wind_special.png single-image attempt; key and filename are independent
  // in this table, so this is the only place that distinction matters.
  { key: 'wind_special', png: 'art/wind_vortex.png', json: 'art/wind_vortex.json' },
  // Grinder's runtime key follows structureArtKey('GRINDER') below ('grinder').
  // The delivered atlas's original frame vocabulary (idle/intake/crush/release,
  // see docs/assets/grinder-production-qa.md) was renamed to the generic
  // structure-state vocabulary AnimationController expects (idle/telegraph/
  // charged/active/recovery) so it drives through StructureAnimator like every
  // other 'cycle'-family structure: intake -> telegraph/charged (duplicated,
  // same frame), crush -> active, release -> recovery.
  { key: 'grinder', png: 'art/grinder.png', json: 'art/grinder.json' },
  // Snare Post's runtime key follows structureArtKey('SNARE_POST') below
  // ('snare_post'). The delivered atlas's original 'pulse' frame was renamed
  // to 'active' for the same reason as Grinder above: the generic
  // cycleSeq-bump ACTIVE window (StructureAnimator.update, unconditional
  // for every family) needs an 'active' frame group to find. Aura-family
  // structures didn't bump cycleSeq at all before this delivery — see
  // server/game/structureBehaviors/aura.js's tickAura.
  { key: 'snare_post', png: 'art/snare_post.png', json: 'art/snare_post.json' },
  // Watchtower's runtime key follows structureArtKey('WATCHTOWER') below
  // ('watchtower'). Delivered 'recoil' frame renamed to 'active' for the same
  // reason as Grinder/Snare Post. Watchtower is the only structure on the
  // server's default (non-family) tower-fire branch in towers.js, which
  // didn't bump cycleSeq either -- fixed alongside this registration.
  { key: 'watchtower', png: 'art/watchtower.png', json: 'art/watchtower.json' },
  // Blizzard's target-point burst atlas (warning/spike/shatter), fired at
  // ds.tx/ds.ty by GameScene's STRUCTURE_TARGET_FX/STRUCTURE_TARGET_WARNING_FX
  // tables -- the same pattern as Rock Trap's rock_trap_fx. The structure's
  // own idle image is 'blizzard' in IMAGES below, not this atlas.
  { key: 'blizzard_fx', png: 'art/blizzard_fx.png', json: 'art/blizzard_fx.json' },
  // Steam Vent's runtime key follows structureArtKey('STEAM_VENT') below
  // ('steam_vent'). Delivered as idle/pressure/confusion; pressure and
  // confusion were renamed to active_0/active_1 -- a single two-frame
  // 'active' clip (steam building, then the scald burst) that plays once per
  // cycleSeq bump, rather than duplicating Grinder's telegraph/charged
  // approach. confusion.js's tickConfusion (the 'confusion' family, also
  // absent from structureFamily() same as aura) didn't bump cycleSeq either
  // -- fixed alongside this registration, gated on the same
  // ready-AND-occupied condition as the pulse itself.
  { key: 'steam_vent', png: 'art/steam_vent.png', json: 'art/steam_vent.json' },
  // Volcano's runtime key follows structureArtKey('MAGMA_TRAP') below
  // ('magma_trap'). The only package so far that needed no adaptation: the
  // pipeline already emitted the generic idle/telegraph/charged/active/
  // recovery vocabulary, and MAGMA_TRAP is the entryTrigger family, which
  // drives every one of those states and already bumped cycleSeq on
  // eruption -- so no frame rename and no server change, unlike Grinder /
  // Snare Post / Watchtower / Steam Vent above.
  { key: 'magma_trap', png: 'art/magma_trap.png', json: 'art/magma_trap.json' },
  // Firestorm's runtime key follows structureArtKey('FIRESTORM') below
  // ('firestorm'), but its packaged atlas files are named firestorm_fx.* --
  // the same key/filename split as wind_special -> wind_vortex above. The
  // delivery also shipped an earlier static art/firestorm.png; this atlas
  // supersedes it, so that file stays on disk as lineage evidence and is
  // deliberately NOT registered (two entries would collide on one key).
  //
  // Note what this atlas can actually show: FIRESTORM's spec is `volley`,
  // and structureFamily() gives that family no phase machine at all, so
  // _restingState returns IDLE unconditionally. Only 'idle' and the
  // cycleSeq-bump 'active' window are reachable; the packaged telegraph/
  // charged/recovery frames ship but never play. That is deliberate -- they
  // cost nothing and are already correct if FIRESTORM ever gains a charge
  // ramp. No server change was needed: volley.js already bumped cycleSeq.
  { key: 'firestorm', png: 'art/firestorm_fx.png', json: 'art/firestorm_fx.json' },
  // Muddy Bog's runtime key follows structureArtKey('MUDDY_BOG') below
  // ('muddy_bog'). Delivered idle/entry/root frames renamed to
  // idle_0/active_0/active_1 for the same reason as Steam Vent: a two-frame
  // 'active' clip (entry cue, then the ongoing root churn) rather than
  // duplicating Grinder's telegraph/charged approach, since MUDDY_BOG is
  // `areaEntry`, a family with no phase machine (structureFamily() falls
  // through to 'static', same as Firepit -- idle/active only, by design).
  //
  // areaEntry.js's tickAreaEntry never bumped cycleSeq before this
  // registration -- 'areaEntry' was absent from structureFamily()'s switch,
  // same gap Snare Post's aura.js and Watchtower's towers.js default branch
  // had. Fixed with a one-line bump on each fresh crossing (a new root
  // cycle starting), not on the recurring per-enemy damage pulse.
  { key: 'muddy_bog', png: 'art/muddy_bog.png', json: 'art/muddy_bog.json' },
  // Fire's basic-attack FX, replacing the static 'fireball' stand-in
  // (IMAGES below) GameScene._playAtk previously reused for FIRE_REACH.
  // Authored facing right only (frames: extend_00..05, impact_00..03, no
  // direction suffix -- FRAME_RE groups them as undirected 'extend'/
  // 'impact' anims); actor-facing down/up/left rotate this one right-facing
  // clip in code (GameScene._playAtk) rather than shipping 4 baked copies.
  { key: 'fire_saber_extension', png: 'art/fire_saber_extension.png', json: 'art/fire_saber_extension.json' },
  // Elemental particle library: 7 pooled one-shot particle states (fire,
  // water, wind, steam, snow, smoke, debris) for reuse across FX code that
  // currently spawns its own throwaway textures. Not wired into any emitter
  // yet -- registration only, per the delivery's integration handoff.
  { key: 'elemental_particles', png: 'art/elemental_particles.png', json: 'art/elemental_particles.json' },
]

// Maps a player's element to its chibi atlas key (used once ATLASES is filled).
export const ELEMENT_ATLAS_KEY = {
  FIRE: 'chibi_fire', WATER: 'chibi_water', EARTH: 'chibi_earth', WIND: 'chibi_wind',
}

// IMAGES: static, single-frame art (structures + enemies — no per-frame
// animation needed; elites reuse the base enemy image scaled up in code, same
// as today's placeholder circles, per spec "no new rig" for Elite).
// Files expected at client/public/art/<png>.
//   Structures:
//     hall (castle w/ visible princess), barricade, snare_post, watchtower,
//     farm, marketplace,
//     earth_special, fire_special, water_special, wind_special,
//     magma_trap, firestorm, muddy_bog, blizzard, steam_vent, grinder
//   Enemies:
//     goblin, orc, troll
export const IMAGES = [
  { key: 'ground', png: 'art/ground.png' },
  { key: 'marketplace', png: 'art/marketplace.png' },
  { key: 'hall', png: 'art/hall.png' },
  { key: 'farm', png: 'art/farm.png' },
  { key: 'goblin', png: 'art/goblin.png' },
  { key: 'orc', png: 'art/orc.png' },
  { key: 'troll', png: 'art/troll.png' },
  { key: 'fireball', png: 'art/fireball.png' },
  { key: 'barricade', png: 'art/barricade.png' },
  { key: 'blizzard', png: 'art/blizzard.png' },
]

// Server structure type (e.g. 'EARTH_SPECIAL', 'SNARE_POST') -> lowercase
// IMAGES key documented above. Pure string transform, so no separate map to
// keep in sync as structure types are added.
export function structureArtKey(type) {
  return type ? type.toLowerCase() : null
}

// Enemy base-type index (0/1/2, see theme.js ENEMY_BASE) -> IMAGES key.
export function enemyArtKey(typeIndex) {
  return ['goblin', 'orc', 'troll'][typeIndex] ?? null
}
