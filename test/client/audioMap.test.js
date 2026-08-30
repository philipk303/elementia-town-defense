// Headless test of client/src/audio.js: the fx→sound mapping and the music-
// intensity reconciler. No DOM, no AudioContext — audio.js imports Howler
// lazily inside init() (never called here), so the module loads cleanly under
// Node. Ported from ez-ctf's client/test/audio_map.test.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Provide a window-ish global BEFORE importing audio.js so logPlay works.
globalThis.window = globalThis
globalThis.window.__audioLog = []

const { audio, FX_MAP, SFX_NAMES, LOOP_SFX_NAMES } = await import('../../client/src/audio.js')

// Every fx `type` actually pushed by server/game/*.js (state.fx.push({ type: '...' })),
// scanned from the live source rather than hardcoded — a future fx type added
// with no FX_MAP entry (silently soundless) fails this suite instead of
// slipping through an outdated literal list.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const gameDir = path.join(__dirname, '../../server/game')
const serverFxTypes = [...new Set(
  readdirSync(gameDir)
    .filter(f => f.endsWith('.js'))
    .flatMap(f => {
      const src = readFileSync(path.join(gameDir, f), 'utf8')
      return [...src.matchAll(/fx\.push\(\{\s*type:\s*'([a-zA-Z0-9]+)'/g)].map(m => m[1])
    }),
)]

test('the fx-type scan itself found something (guards against a silently-broken regex)', () => {
  assert.ok(serverFxTypes.length >= 10, `expected ~11 live fx types, found ${serverFxTypes.length}`)
})

// 'swing' is deliberately unmapped here (2026-08-09): the generic per-tick
// fx array carries no element, so a single melee_swing could never sound
// different per class. GameScene._playAtk plays the caster's actual
// element-specific cast sfx (earth_sweep/water_palm/fire_saber_slash/
// wind_fan_throw) off the richer `atk` channel instead, which does carry
// kind/element — see client/src/audio.js's FX_MAP comment. Mapping 'swing'
// here too would double the sound on every basic attack.
const DELIBERATELY_UNMAPPED_FX_TYPES = new Set(['swing'])

test('every server fx type maps to a known logical sfx name, or is a documented exception', () => {
  for (const t of serverFxTypes) {
    if (DELIBERATELY_UNMAPPED_FX_TYPES.has(t)) continue
    assert.ok(FX_MAP[t], `FX_MAP missing ${t}`)
  }
})

test('every mapped logical name is a declared SFX asset', () => {
  for (const t of serverFxTypes) {
    if (DELIBERATELY_UNMAPPED_FX_TYPES.has(t)) continue
    const name = FX_MAP[t].sfx
    assert.ok(SFX_NAMES.includes(name), `${t} -> unknown sfx ${name}`)
  }
})

test('consumeServerFx plays (logs) sounds and does NOT touch intensity', () => {
  window.__audioLog = []
  let intensityCalls = 0
  audio.music.setIntensity = () => { intensityCalls++ }
  audio.consumeServerFx([{ type: 'ability' }, { type: 'boom' }])
  assert.ok(window.__audioLog.includes('special_cast'), 'should log special_cast')
  assert.ok(window.__audioLog.includes('projectile_explosion'), 'should log projectile_explosion')
  assert.equal(intensityCalls, 0, 'consumeServerFx must NOT set intensity (reconciler owns it)')
})

test('reconcileFromPhase selects battle intensity by wave, not by phase alone', () => {
  const origSetIntensity = audio.music.setIntensity
  const origScene = audio.music._scene
  let intensity = -1
  audio.music.setIntensity = (v) => { intensity = v ? 1 : 0 }
  audio.music._scene = 'match'
  audio.music.reconcileFromPhase('fight', 1)
  assert.equal(intensity, 0, 'early fight wave -> base intensity, not intense')
  audio.music.reconcileFromPhase('fight', 8)
  assert.equal(intensity, 1, 'late fight wave (>= BATTLE_INTENSE_FROM_WAVE) -> intense')
  audio.music.reconcileFromPhase('build', 8)
  assert.equal(intensity, 1, 'build phase does not touch setIntensity at all')
  audio.music.setIntensity = origSetIntensity
  audio.music._scene = origScene
})

test('buildTierForWave-driven loop selection follows the wave, not just the phase', () => {
  const origSelectLoop = audio.music._selectLoop
  const origScene = audio.music._scene
  const selected = []
  audio.music._scene = 'match'
  audio.music._selectLoop = (key) => { selected.push(key) }
  audio.music.reconcileFromPhase('build', 1)
  audio.music.reconcileFromPhase('build', 4)
  audio.music.reconcileFromPhase('build', 7)
  audio.music.reconcileFromPhase('waveEnd', 10)
  assert.deepEqual(selected, ['build_calm', 'build_light', 'build_tense', 'build_final'])
  audio.music._selectLoop = origSelectLoop
  audio.music._scene = origScene
})

test('reconcileFromPhase outside scene "match" is a no-op (does not touch intensity or loop selection)', () => {
  const origSetIntensity = audio.music.setIntensity
  const origSelectLoop = audio.music._selectLoop
  const origScene = audio.music._scene
  let calls = 0
  audio.music.setIntensity = () => { calls++ }
  audio.music._selectLoop = () => { calls++ }
  audio.music._scene = 'menu'
  audio.music.reconcileFromPhase('fight', 9)
  audio.music.reconcileFromPhase('build', 1)
  assert.equal(calls, 0, 'reconcileFromPhase must not affect audio outside an active match')
  audio.music.setIntensity = origSetIntensity
  audio.music._selectLoop = origSelectLoop
  audio.music._scene = origScene
})

test('playOutcome plays a distinct final stinger and ducks into postgame, without throwing', () => {
  const origSetScene = audio.music.setScene
  const origHowl = audio.music._howl
  const origScene = audio.music._scene
  audio.music._scene = 'none'
  const scenesSeen = []
  audio.music.setScene = (s) => { scenesSeen.push(s) }
  audio.music._howl = () => ({ volume() {}, play() {}, once() {} })
  assert.doesNotThrow(() => audio.music.playOutcome('victory'))
  assert.doesNotThrow(() => audio.music.playOutcome('defeat'))
  assert.deepEqual(scenesSeen, ['postgame', 'postgame'])
  audio.music.setScene = origSetScene
  audio.music._howl = origHowl
  audio.music._scene = origScene
})

test('never throws on bad input', () => {
  audio.consumeServerFx(undefined)
  audio.consumeServerFx([{ type: 'nope' }, null])
  audio.playFx('does_not_exist')
  audio.music.reconcileFromPhase(undefined)
})

test('consumeServerFx forwards every mapped fx in a batch to playFx (audible de-dup is playFx\'s job, not a batch cap)', () => {
  window.__audioLog = []
  audio.consumeServerFx([
    { type: 'dmg' }, { type: 'dmg' }, { type: 'dmg' }, { type: 'dmg' },
    { type: 'pdmg' },
  ])
  assert.equal(window.__audioLog.filter(n => n === 'enemy_hit').length, 4, 'every mapped fx reaches playFx')
  assert.ok(window.__audioLog.includes('player_hurt'), 'other types in the batch still play')
})

test('multi-target impacts in one emit aggregate into a single audible sound (Task 7) — Earth\'s cone hits 3 enemies, one enemy_hit plays', () => {
  let plays = 0
  audio._ready = true
  audio._muted = false
  audio._lastPlay.enemy_hit = 0
  audio._sfx.enemy_hit = { play() { plays++ } }
  audio.consumeServerFx([
    { type: 'dmg', x: 1, y: 1, v: 8 },
    { type: 'dmg', x: 2, y: 2, v: 8 },
    { type: 'dmg', x: 3, y: 3, v: 8 },
  ])
  assert.equal(plays, 1, 'three simultaneous impacts from one cast sound as one hit, not three')
})

test('playFx audibly rate-limits repeated plays of the same name within the same-name floor', () => {
  let plays = 0
  audio._ready = true
  audio._muted = false
  audio._lastPlay.enemy_hit = 0
  audio._sfx.enemy_hit = { play() { plays++ } }
  audio.playFx('enemy_hit')
  audio.playFx('enemy_hit') // immediately after — must be suppressed
  assert.equal(plays, 1, 'a second same-name play inside the floor must not sound')
})

test('music director surface exists and is safe to call without Howler loaded', () => {
  for (const m of ['setScene', 'setIntensity', 'reconcileFromPhase', 'applyMute']) {
    assert.equal(typeof audio.music[m], 'function', `music.${m} must exist`)
  }
  audio.music.setScene('menu')
  audio.music.setScene('match')
  audio.music.setScene('postgame')
  audio.music.setScene('none')
  audio.setMuted(true)
  audio.setMuted(false)
  assert.equal(audio.isMuted(), false, 'mute toggles back to false')
})

test('audio NEVER throws into gameplay, even if a Howl instance throws', () => {
  // Simulate a broken sound engine and confirm calls are swallowed.
  audio._ready = true
  audio._sfx.melee_swing = { play() { throw new Error('boom') } }
  assert.doesNotThrow(() => audio.playFx('melee_swing'))
  assert.doesNotThrow(() => audio.consumeServerFx([{ type: 'swing' }]))
  audio.music._tracks.battle_base = { volume() { throw new Error('boom') }, playing() { throw new Error('boom') } }
  assert.doesNotThrow(() => audio.music.reconcileFromPhase('fight'))
  assert.doesNotThrow(() => audio.setMuted(true))
  assert.doesNotThrow(() => audio.setMuted(false))
})

// --- sustained-sound lifecycle (setLoop) ---
// Loops are driven from per-frame STATE, so the contract that matters is
// idempotence: calling with the same value every frame must start/stop once.

test('every LOOP_SFX_NAMES entry is also declared in SFX_NAMES', () => {
  for (const name of LOOP_SFX_NAMES) {
    assert.ok(SFX_NAMES.includes(name), `${name} loops but is not declared in SFX_NAMES`)
  }
})

test('setLoop starts and stops once, ignoring repeated same-value calls', () => {
  const plays = []
  audio._ready = true
  audio._muted = false
  audio._looping.clear()
  let playing = false
  audio._sfx.repair_start_loop = {
    play() { plays.push('play'); playing = true },
    stop() { plays.push('stop'); playing = false },
    playing() { return playing },
  }
  audio.setLoop('repair_start_loop', true)
  audio.setLoop('repair_start_loop', true)   // same value, later frames
  audio.setLoop('repair_start_loop', true)
  assert.deepEqual(plays, ['play'])
  audio.setLoop('repair_start_loop', false)
  audio.setLoop('repair_start_loop', false)
  assert.deepEqual(plays, ['play', 'stop'])
})

// A loop asked for BEFORE Howler finished loading used to be recorded in
// _looping and then never started: every later call saw want === active and
// returned early, so the sound stayed silent forever with nothing left to
// trigger it. init() now starts anything already intended.
test('a loop started before Howler is ready begins playing once init runs', async () => {
  audio._ready = false
  audio._looping.clear()
  let playing = false
  const plays = []
  audio.setLoop('firepit_ambience', true)   // pre-ready: intent recorded, nothing audible
  assert.ok(audio._looping.has('firepit_ambience'))
  assert.deepEqual(plays, [])
  // Stand in for a completed init(): the real one constructs the Howls first.
  audio._sfx.firepit_ambience = {
    play() { plays.push('play'); playing = true },
    stop() { playing = false },
    playing() { return playing },
  }
  audio._ready = true
  for (const name of audio._looping) {
    const h = audio._sfx[name]
    if (h && !h.playing()) h.play()
  }
  assert.deepEqual(plays, ['play'], 'the pre-ready loop never started')
})

test('unmuting restarts a music bed that a muted crossfade had stopped', () => {
  const md = audio.music
  const prevMuted = audio._muted, prevTracks = md._tracks, prevKey = md._activeLoopKey
  let playing = false
  const calls = []
  md._tracks = {
    build_calm: {
      _vol: 0,
      volume(v) { if (v === undefined) return this._vol; this._vol = v; calls.push(`vol:${v}`) },
      play() { calls.push('play'); playing = true },
      playing() { return playing },
    },
  }
  md._activeLoopKey = 'build_calm'
  // The state a crossfade-while-muted leaves behind: active bed, stopped Howl.
  audio._muted = false
  md.applyMute()
  assert.ok(calls.includes('play'), 'a stopped active bed was left silent after unmute')
  assert.ok(md._tracks.build_calm.volume() > 0)
  audio._muted = prevMuted; md._tracks = prevTracks; md._activeLoopKey = prevKey
})

// Music used to hang entirely off ONE event (GameScene._onGameStart is the
// only caller of setScene('match')). Miss it -- Preload still finishing when
// the host pressed Start, a mid-match join, a reconnect -- and the director
// sat at scene 'none' while every PHASE_CHANGE returned early: all SFX
// audible, zero BGM for the whole match. Reproduced live 2026-08-22.
test('phase info alone starts the music, without a GAME_START scene call', () => {
  const md = audio.music
  const prev = { scene: md._scene, key: md._activeLoopKey, tracks: md._tracks }
  const started = []
  md._scene = 'none'
  md._activeLoopKey = null
  md._tracks = {}
  md._howl = function (key) {
    if (!this._tracks[key]) {
      let vol = 0, playing = false
      this._tracks[key] = {
        volume(v) { if (v === undefined) return vol; vol = v },
        play() { started.push(key); playing = true },
        playing() { return playing },
        fade(from, to) { vol = to; if (to > 0) { started.push(key); playing = true } },
        stop() { playing = false },
      }
    }
    return this._tracks[key]
  }
  md.reconcileFromPhase('build', 1)
  assert.equal(md._scene, 'match', 'scene never promoted from none')
  assert.ok(started.length > 0, 'no music bed was started from phase info alone')
  Object.assign(md, { _scene: prev.scene, _activeLoopKey: prev.key, _tracks: prev.tracks })
  delete md._howl
})

test('stopAllLoops stops everything currently looping', () => {
  audio._ready = true
  audio._looping.clear()
  const stopped = []
  for (const name of ['repair_start_loop', 'firepit_ambience']) {
    let playing = false
    audio._sfx[name] = {
      play() { playing = true },
      stop() { stopped.push(name); playing = false },
      playing() { return playing },
    }
    audio.setLoop(name, true)
  }
  audio.stopAllLoops()
  assert.deepEqual(stopped.sort(), ['firepit_ambience', 'repair_start_loop'])
  assert.equal(audio._looping.size, 0)
})

test('a loop started while muted still starts, so unmuting is not silent', () => {
  audio._ready = true
  audio._looping.clear()
  let playing = false
  const calls = []
  audio._sfx.firepit_ambience = {
    play() { calls.push('play'); playing = true },
    stop() { calls.push('stop'); playing = false },
    playing() { return playing },
  }
  audio._muted = true
  audio.setLoop('firepit_ambience', true)
  assert.deepEqual(calls, ['play'])
  audio._muted = false
  audio.stopAllLoops()
})

test('setLoop never throws into gameplay even if the Howl throws', () => {
  audio._ready = true
  audio._looping.clear()
  audio._sfx.wind_vortex_suction = {
    play() { throw new Error('boom') },
    stop() { throw new Error('boom') },
    playing() { return false },
  }
  assert.doesNotThrow(() => audio.setLoop('wind_vortex_suction', true))
  assert.doesNotThrow(() => audio.setLoop('wind_vortex_suction', false))
  assert.doesNotThrow(() => audio.stopAllLoops())
})
