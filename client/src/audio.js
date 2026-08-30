// Single owner of all game audio (mirrors network.js owning the socket).
// Howler-backed, ported from ez-ctf's audio.js (C:\dev\ez-ctf\client\src\audio.js).
//
// Design guarantees (unchanged from ez-ctf):
//  - NEVER throws into gameplay: every public method is wrapped in try/catch.
//  - Loads headless: Howler is imported LAZILY inside init() so this module can
//    be imported under Node (no top-level window/AudioContext access).
//  - Verifiable without sound: every playFx() appends the logical name to
//    window.__audioLog (text-verification path, and what the test suite checks).
//
// Music intensity is driven by build/fight PHASE, not flag-carrier state (no
// flags in this game) — GameScene calls audio.music.reconcileFromPhase(phase)
// as the single source of truth.

// Minimum ms between two audible plays of the SAME logical sfx name (applies
// to every name, not just the highest-frequency one as in ez-ctf's original).
// This is what de-dupes a snapshot batch's repeated fx types (see playFx) —
// a separate per-batch counter on top of it would be redundant. It is also
// what satisfies Task 7's "aggregate multi-target impacts into one logical
// sound": Earth's cone can push 3 'dmg' fx in the same emit (one per enemy
// hit), consumeServerFx forwards all 3 to playFx('enemy_hit'), and this
// floor lets only the first one actually sound.
const SAME_NAME_FLOOR_MS = 80

// ---- logical SFX assets (files live in client/public/audio/sfx/<name>.ogg) ----
// The element-attack/status/structure names below (earth_sweep..grinder_intake)
// are the 2026-08-02 Freesound sourcing pass, processed 2026-08-09 by
// tools/audio/process_sfx.py (docs/plans/2026-07-26-audio-asset-pipeline.md's
// 'sfx' profile) — see audio/assets-manifest.json for full provenance/license
// per name. 'melee_swing'/'explosion' (Phase 7 placeholders with no runtime
// file) are retired in favor of the real per-element/'projectile_explosion'
// sourced sounds below. Every structure name is declared and preloaded even
// where no trigger fires it yet (docs/assets/audio-fx-wiring-2026-08-09.md
// tracks which ones — Howler preloading a handful of KB-scale files that
// aren't played yet is harmless; NOT declaring a processed file at all would
// leave it silently invisible to the runtime).
export const SFX_NAMES = [
  'projectile_shoot', 'projectile_explosion', 'special_cast', 'second_cast',
  'enemy_hit', 'player_hurt', 'downed', 'death', 'revive', 'respawn',
  'build', 'sell', 'level_up', 'wave_start', 'victory', 'defeat', 'ui_click',
  'earth_sweep', 'stone_impact', 'water_palm', 'splash_impact',
  'fire_saber_slash', 'flame_impact',
  'wind_fan_throw', 'wind_fan_flight', 'wind_fan_impact',
  'root', 'freeze', 'burn_onset', 'heavy_impact',
  'watchtower_fire', 'snare_pulse',
  'firepit_ambience', 'firepit_flare',
  'rock_trap_warning', 'rock_trap_fall', 'rock_trap_impact',
  'water_geyser_charge', 'water_geyser_launch',
  'wind_vortex_suction', 'wind_vortex_release',
  'steam_vent_pressure', 'steam_vent_confusion',
  'volcano_charge', 'volcano_eruption',
  'firestorm_charge', 'firestorm_volley',
  'muddy_bog_entry', 'muddy_bog_root',
  'blizzard_warning', 'blizzard_impact',
  'grinder_intake', 'grinder_crush', 'grinder_release',
  'build_locked', 'attack_phase_started', 'wave_cleared', 'gate_warning',
  'fusion_proposed', 'fusion_accepted', 'fusion_rejected_or_expired', 'fusion_created',
  'rotate_structure', 'change_output_direction', 'placement_valid', 'placement_invalid',
  'repair_start_loop', 'repair_completed',
]

// Sustained sounds: constructed with `loop: true` and driven by setLoop()
// start/stop rather than playFx() one-shots. Kept as an explicit set (same
// discipline as ONE_SHOT_KEYS below) so a one-shot can never be started as a
// loop that then runs forever with nothing to stop it.
export const LOOP_SFX_NAMES = new Set([
  'firepit_ambience',
  'wind_vortex_suction',
  'repair_start_loop',
])

// Per-sound base volume (frequent combat sounds quieter; big events louder).
// New entries default toward the quieter end (0.25-0.4) until a real mix
// pass happens — matches the "readable, not loud" direction in the audio
// pipeline plan rather than guessing at a final balance.
const SFX_VOL = {
  projectile_shoot: 0.22, projectile_explosion: 0.5,
  special_cast: 0.5, second_cast: 0.5,
  enemy_hit: 0.28, player_hurt: 0.4, downed: 0.5, death: 0.55,
  revive: 0.5, respawn: 0.4,
  build: 0.45, sell: 0.4, level_up: 0.7, wave_start: 0.6,
  victory: 0.8, defeat: 0.7, ui_click: 0.35,
  earth_sweep: 0.32, stone_impact: 0.3, water_palm: 0.32, splash_impact: 0.3,
  fire_saber_slash: 0.32, flame_impact: 0.3,
  wind_fan_throw: 0.3, wind_fan_flight: 0.22, wind_fan_impact: 0.3,
  root: 0.3, freeze: 0.35, burn_onset: 0.3, heavy_impact: 0.35,
  watchtower_fire: 0.3, snare_pulse: 0.32,
  firepit_ambience: 0.2, firepit_flare: 0.35,
  rock_trap_warning: 0.3, rock_trap_fall: 0.35, rock_trap_impact: 0.35,
  water_geyser_charge: 0.28, water_geyser_launch: 0.4,
  wind_vortex_suction: 0.28, wind_vortex_release: 0.35,
  steam_vent_pressure: 0.28, steam_vent_confusion: 0.3,
  volcano_charge: 0.3, volcano_eruption: 0.5,
  firestorm_charge: 0.3, firestorm_volley: 0.4,
  muddy_bog_entry: 0.3, muddy_bog_root: 0.28,
  blizzard_warning: 0.25, blizzard_impact: 0.35,
  grinder_intake: 0.3, grinder_crush: 0.35, grinder_release: 0.3,
  build_locked: 0.4, attack_phase_started: 0.5, wave_cleared: 0.6, gate_warning: 0.5,
  fusion_proposed: 0.35, fusion_accepted: 0.4, fusion_rejected_or_expired: 0.35, fusion_created: 0.5,
  rotate_structure: 0.3, change_output_direction: 0.3, placement_valid: 0.25, placement_invalid: 0.3,
}

// server fx `type` (server/game/*.js: state.fx.push({ type, ... })) -> logical
// sfx name. Sound only (no intensity). 'swing' is deliberately absent —
// GameScene._playAtk plays the element-specific cast/impact pair directly
// (it already has the caster's element from the atk event; the generic
// per-tick 'swing' fx does not), so a generic melee_swing would just double
// the sound. See GameScene.js's _playAtk for the per-element trigger.
export const FX_MAP = {
  projSpawn: { sfx: 'projectile_shoot' },
  boom:      { sfx: 'projectile_explosion' },
  ability:   { sfx: 'special_cast' },
  ability2:  { sfx: 'second_cast' },
  dmg:       { sfx: 'enemy_hit' },
  pdmg:      { sfx: 'player_hurt' },
  downed:    { sfx: 'downed' },
  pdied:     { sfx: 'death' },
  revived:   { sfx: 'revive' },
  respawn:   { sfx: 'respawn' },
  // CC-onset cues (root/freeze/burn/confuse) — server pushes these only on
  // the 0->active transition (status.js's *Ms fields), not on every refresh
  // tick, so a continuously-occupied field (Firepit, Steam Vent) doesn't spam.
  root:      { sfx: 'root' },
  freeze:    { sfx: 'freeze' },
  burn:      { sfx: 'burn_onset' },
  // The vent's status changed from confusion to a strong slow (2026-08-15
  // retune), so the event it pushes is `scald`. The ASSET is deliberately kept:
  // it is a pressurised hiss, which reads for scalding steam at least as well
  // as it read for confusion. Only the trigger renamed, not the sound.
  scald:     { sfx: 'steam_vent_confusion' },
  // Repair channel completion (server/game/repair.js). The channel's LOOP is
  // not an fx event — it's driven off `ds.repairMs` in the snapshot, since a
  // loop needs a live "still going" signal rather than a one-shot edge.
  repair_done: { sfx: 'repair_completed' },
}

export const MUSIC_SRC = {
  menu_theme:     ['audio/music/menu_theme.mp3'],
  build_calm:     ['audio/music/build_calm.mp3'],
  build_light:    ['audio/music/build_light.mp3'],
  build_tense:    ['audio/music/build_tense.mp3'],
  build_final:    ['audio/music/build_final.mp3'],
  battle_base:    ['audio/music/battle_base.mp3'],
  battle_intense: ['audio/music/battle_intense.mp3'],
  victory_final:  ['audio/music/victory_final.mp3'],
  defeat_final:   ['audio/music/defeat_final.mp3'],
}

// victory_final/defeat_final are one-shot outcome stingers, not loops — every
// other key is a seamless-loop bed. Kept as an explicit set (not inferred
// from naming) so a future one-shot addition can't silently loop forever.
const ONE_SHOT_KEYS = new Set(['victory_final', 'defeat_final'])

// Shared ambient volume for whichever build/battle loop is currently active
// (only one plays at a time — crossfade-swap, not additive layering, same
// contract as the original battle_base/battle_intense pair).
const LOOP_VOL = 0.45
const MENU_VOL = 0.5
const POSTGAME_VOL = 0.3
const ONE_SHOT_VOL = 0.65

// Wave -> build-tier loop, per the four-tier progressive build arrangement
// (docs/plans/2026-07-26-audio-asset-pipeline.md): waves 1-3 calm, 4-6 light,
// 7-9 tense, 10 (and beyond, defensively) final.
function buildTierForWave(wave) {
  const w = wave ?? 1
  if (w <= 3) return 'build_calm'
  if (w <= 6) return 'build_light'
  if (w <= 9) return 'build_tense'
  return 'build_final'
}

// Later-wave threshold for the battle_base -> battle_intense crossfade. No
// design doc pins an exact wave; 8 is a judgment call that puts the last 3
// waves (matching build_tense/build_final's own escalation) on the more
// intense battle track.
const BATTLE_INTENSE_FROM_WAVE = 8

function logPlay(name) {
  if (typeof window === 'undefined') return
  if (!Array.isArray(window.__audioLog)) window.__audioLog = []
  window.__audioLog.push(name)
  if (window.__audioLog.length > 200) window.__audioLog.shift()
}

// Loop transitions land in the SAME __audioLog as one-shots, tagged with a
// start/stop suffix. One log keeps the text-verification path single-source;
// the suffix is what lets a test assert a loop actually stopped rather than
// just seeing the name appear.
function logLoop(name, on) {
  logPlay(`${name}:${on ? 'start' : 'stop'}`)
}

class MusicDirector {
  constructor(audio) {
    this._audio = audio
    this._scene = 'none'
    this._intensity = 0
    this._tracks = {}         // key -> Howl (lazy)
    this._activeLoopKey = null   // whichever of the 7 loop keys is currently the "bed"
    this._activeOneShotKey = null // victory_final/defeat_final while it's playing
    this._lastPhase = null    // last (phase, wave) reconcileFromPhase saw, so re-entering
    this._lastWave = null     // 'match' scene (or a late Howler-ready re-apply) can resume
  }

  _howl(key) {
    try {
      if (this._tracks[key]) return this._tracks[key]
      const H = this._audio._H
      if (!H) return null
      this._tracks[key] = new H.Howl({ src: MUSIC_SRC[key], loop: !ONE_SHOT_KEYS.has(key), volume: 0, html5: false })
      return this._tracks[key]
    } catch { return null }
  }

  _fade(key, to, ms) {
    try {
      const h = this._howl(key); if (!h) return
      if (to > 0 && !h.playing()) h.play()
      const from = h.volume()
      h.fade(from, to * (this._audio._muted ? 0 : 1), ms)
      if (to === 0) setTimeout(() => { try { if (h.volume() === 0) h.stop() } catch {} }, ms + 50)
    } catch {}
  }

  // Crossfade-swap the single active loop bed (build tier or battle tier) —
  // never additive layering, so at most 2 loop keys are audible mid-crossfade
  // (the budget's music_tracks_during_crossfade_max).
  _selectLoop(key, vol = LOOP_VOL, ms = 1200) {
    try {
      if (this._activeLoopKey === key) return
      const prev = this._activeLoopKey
      this._activeLoopKey = key
      if (prev) this._fade(prev, 0, ms)
      this._fade(key, vol, ms)
    } catch {}
  }

  setScene(scene) {
    try {
      if (this._scene === scene) return
      this._scene = scene
      if (scene === 'menu') {
        for (const k of Object.keys(MUSIC_SRC)) if (k !== 'menu_theme') this._fade(k, 0, 600)
        this._activeLoopKey = null
        this._fade('menu_theme', MENU_VOL, 800)
      } else if (scene === 'match') {
        this._fade('menu_theme', 0, 600)
        this._activeLoopKey = null
        // Resume where we left off if we've already seen a phase (e.g. Howler
        // finished loading after setScene('match') already ran once — see
        // Audio.init()). A fresh match relies on GameScene calling
        // reconcileFromPhase(phase, wave) right after this.
        if (this._lastPhase) this.reconcileFromPhase(this._lastPhase, this._lastWave)
      } else if (scene === 'postgame') {
        for (const k of Object.keys(MUSIC_SRC)) if (k !== 'menu_theme') this._fade(k, 0, 600)
        this._activeLoopKey = null
        this._fade('menu_theme', POSTGAME_VOL, 800)
      } else { // none
        for (const k of Object.keys(MUSIC_SRC)) this._fade(k, 0, 600)
        this._activeLoopKey = null
      }
    } catch {}
  }

  // base and intense are DISTINCT songs -> crossfade-SWAP (not additive
  // layering); _selectLoop is already idempotent on the target key.
  setIntensity(v) {
    try {
      this._intensity = v ? 1 : 0
      if (this._scene !== 'match') return
      this._selectLoop(this._intensity ? 'battle_intense' : 'battle_base', LOOP_VOL, 1200)
    } catch {}
  }

  // THE source of truth for the active loop bed. Called on every
  // PHASE_CHANGE by GameScene with the server's phase and wave number:
  // fight -> battle_base, or battle_intense from BATTLE_INTENSE_FROM_WAVE on;
  // any non-fight in-match phase (build/waveEnd/lobby) -> the build tier for
  // the current wave.
  reconcileFromPhase(phase, wave) {
    try {
      this._lastPhase = phase
      this._lastWave = wave
      // Self-heal the scene (2026-08-22). Music used to depend entirely on
      // catching ONE event: GameScene._onGameStart is the only caller of
      // setScene('match'). A client that missed it -- Preload still finishing
      // when the host pressed Start, a mid-match join, a reconnect -- sat at
      // scene 'none' forever, and this method then returned early on every
      // single PHASE_CHANGE. The result was a match where every SFX worked
      // and the BGM never played at all. Live phase info IS proof we are in a
      // match, so promote instead of giving up. Only from 'none', so a
      // finished match's 'postgame' bed is not stolen back.
      if (this._scene === 'none') this.setScene('match')
      if (this._scene !== 'match') return
      if (phase === 'fight') {
        this.setIntensity((wave ?? 0) >= BATTLE_INTENSE_FROM_WAVE)
      } else if (phase === 'build' || phase === 'waveEnd' || phase === 'lobby') {
        this._selectLoop(buildTierForWave(wave), LOOP_VOL)
      }
    } catch {}
  }

  // Final victory/defeat music stinger — distinct from the ordinary
  // 'victory'/'defeat' one-shot SFX (still played separately by GameScene).
  // Ducks the match loop bed via setScene('postgame') first, then plays the
  // stinger once on top at a more prominent volume.
  playOutcome(outcome) {
    try {
      const key = outcome === 'victory' ? 'victory_final' : 'defeat_final'
      this.setScene('postgame')
      const h = this._howl(key)
      if (!h) return
      this._activeOneShotKey = key
      h.volume(this._audio._muted ? 0 : ONE_SHOT_VOL)
      h.once('end', () => { if (this._activeOneShotKey === key) this._activeOneShotKey = null })
      h.play()
    } catch {}
  }

  applyMute() {
    try {
      for (const [k, h] of Object.entries(this._tracks)) {
        if (!h) continue
        if (this._audio._muted) { h.volume(0); continue }
        let want = 0
        if (k === this._activeLoopKey) want = LOOP_VOL
        else if (k === this._activeOneShotKey) want = ONE_SHOT_VOL
        else if (k === 'menu_theme' && this._scene === 'menu') want = MENU_VOL
        else if (k === 'menu_theme' && this._scene === 'postgame') want = POSTGAME_VOL
        h.volume(want)
        // Restoring volume is not enough to bring a track BACK (2026-08-22): a
        // crossfade that ran while muted faded the incoming bed to 0 and then
        // _fade's stop-at-zero timer stopped it outright. Unmuting used to set
        // a healthy volume on a stopped Howl, i.e. permanent silence until the
        // next phase change. Anything that should be audible now gets played.
        try { if (want > 0 && !h.playing()) h.play() } catch {}
      }
    } catch {}
  }
}

class Audio {
  constructor() {
    this._H = null        // { Howl, Howler } once init() resolves
    this._ready = false
    this._sfx = {}        // logical name -> Howl
    this._muted = false
    this._lastPlay = {}   // logical name -> last-play timestamp (rate limit)
    this._looping = new Set()   // sustained sounds currently started (see setLoop)
    this.music = new MusicDirector(this)
    // restore mute preference
    try {
      if (typeof localStorage !== 'undefined') this._muted = localStorage.getItem('elementia.muted') === '1'
    } catch {}
  }

  async init() {
    try {
      if (this._ready || typeof window === 'undefined') return
      this._H = await import('howler')
      for (const name of SFX_NAMES) {
        this._sfx[name] = new this._H.Howl({
          src: [`audio/sfx/${name}.ogg`], volume: SFX_VOL[name] ?? 0.5, preload: true,
          loop: LOOP_SFX_NAMES.has(name),
        })
      }
      this._ready = true
      // Same problem one level down for SFX loops: setLoop() records intent in
      // _looping even before Howler exists, and every later call then sees
      // want === active and returns, so a loop asked for pre-ready would stay
      // silent forever with nothing left to trigger it. Start them now.
      for (const name of this._looping) {
        const h = this._sfx[name]
        try { if (h && !h.playing()) h.play() } catch {}
      }
      // setScene may have run before Howler finished loading (so no Howls existed
      // yet). Re-apply the current scene now that we can construct music tracks.
      const sc = this.music._scene
      if (sc !== 'none') { this.music._scene = 'none'; this.music.setScene(sc) }
    } catch { /* audio unavailable — stay silent */ }
  }

  // Resume the AudioContext on a user gesture (browsers require this).
  unlock() {
    try { this._H?.Howler?.ctx?.resume?.() } catch {}
  }

  playFx(name, opts = {}) {
    try {
      // Logged before the gates below: __audioLog records every playFx
      // CALL (intent), not confirmed audible output — deliberate, so the
      // text-verification path still works pre-ready/while muted.
      logPlay(name)
      const now = Date.now()
      const last = this._lastPlay[name] ?? 0
      if (now - last < SAME_NAME_FLOOR_MS) return
      this._lastPlay[name] = now
      if (!this._ready || this._muted) return
      const h = this._sfx[name]
      if (h) h.play()
    } catch {}
  }

  // Idempotent start/stop for a sustained sound. Callers drive this from
  // per-frame STATE ("is this structure channeling right now"), not from
  // edges, so it must be safe to call with the same value every frame —
  // hence the _looping set gating the actual play()/stop().
  //
  // Unlike playFx there is no SAME_NAME_FLOOR_MS rate limit: the floor exists
  // to de-dupe repeated one-shots inside one snapshot batch, and applying it
  // here would drop a legitimate restart that lands within the floor window.
  setLoop(name, on) {
    try {
      const want = !!on
      const active = this._looping.has(name)
      if (want === active) return
      if (want) this._looping.add(name); else this._looping.delete(name)
      logLoop(name, want)
      if (!this._ready) return
      const h = this._sfx[name]
      if (!h) return
      // Muted is handled by Howler's global mute, NOT by skipping start here:
      // a loop started while muted must already be running when the player
      // unmutes, otherwise it stays silent until the next start edge.
      if (want) { if (!h.playing()) h.play() } else h.stop()
    } catch {}
  }

  // Stop every sustained sound at once — used on match teardown/scene exit so
  // a loop can't outlive the thing that started it.
  stopAllLoops() {
    try {
      for (const name of [...this._looping]) this.setLoop(name, false)
    } catch {}
  }

  // Server fx batches (up to a few sim ticks per 20Hz snapshot) commonly
  // repeat the same fx type (e.g. 3 ticks of damage in one emit) — de-duping
  // that down to one audible play per name is playFx's SAME_NAME_FLOOR_MS
  // job, not this loop's; it just forwards every mapped fx.
  consumeServerFx(list) {
    try {
      if (!Array.isArray(list)) return
      for (const f of list) {
        const m = FX_MAP[f?.type]
        if (!m || !m.sfx) continue
        this.playFx(m.sfx)
      }
    } catch {}
  }

  setMuted(b) {
    try {
      this._muted = !!b
      try { if (typeof localStorage !== 'undefined') localStorage.setItem('elementia.muted', b ? '1' : '0') } catch {}
      this._H?.Howler?.mute?.(this._muted)
      this.music.applyMute()
    } catch {}
  }

  isMuted() { return this._muted }
}

export const audio = new Audio()

if (typeof window !== 'undefined') window.__audio = audio
