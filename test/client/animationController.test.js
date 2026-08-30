// Task 17: headless test of the reusable animation controller and effect pool.
// Both modules are deliberately Phaser-free — they compute WHICH animation key
// should be playing from real game state and hand it to a duck-typed sprite —
// so the whole state machine is testable under plain `node --test` with a fake
// sprite, exactly like audioMap.test.js does for the audio map.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CharacterAnimator, StructureAnimator, CHARACTER_STATE, CHARACTER_PRIORITY,
  STRUCTURE_STATE, structureFamily, castDurationMs, ATTACK_KIND_ELEMENT,
} from '../../client/src/render/AnimationController.js'
import { EffectPool } from '../../client/src/render/EffectPool.js'
import { BALANCE } from '../../shared/balance.js'

// The client only ever sees `charge` after the wire quantizes it
// (server/net/encode.js: Math.round(charge * 100) / 100). Tests that feed the
// animator a raw 1.0 prove nothing about what production can actually reach,
// so the reachability tests below go through this.
const wireCharge = (c) => Math.round(c * 100) / 100

// Minimal stand-in for a Phaser.GameObjects.Sprite: records every play() so a
// test can assert both WHAT played and HOW OFTEN (a controller that re-plays
// the same key every frame would restart the animation on every snapshot).
function fakeSprite() {
  return {
    anims: { currentAnim: null },
    plays: [],
    destroyed: false,
    play(key) { this.plays.push(key); this.anims.currentAnim = { key }; return this },
    destroy() { this.destroyed = true },
  }
}
const anyAnim = () => true

// A moving/idle update payload with sane defaults, so each test only states
// the one thing it is actually about.
function step(a, over = {}) {
  return a.update({ nowMs: 0, dead: false, downed: false, dx: 0, dy: 0, ...over })
}

// ---------------------------------------------------------------- priorities

test('character priority order is death/downed > hurt > special > cast > run/idle', () => {
  const p = CHARACTER_PRIORITY
  assert.ok(p[CHARACTER_STATE.DEATH] > p[CHARACTER_STATE.DOWNED])
  assert.ok(p[CHARACTER_STATE.DOWNED] > p[CHARACTER_STATE.HURT])
  assert.ok(p[CHARACTER_STATE.HURT] > p[CHARACTER_STATE.SPECIAL])
  assert.ok(p[CHARACTER_STATE.SPECIAL] > p[CHARACTER_STATE.CAST])
  assert.ok(p[CHARACTER_STATE.CAST] > p[CHARACTER_STATE.RUN])
  assert.ok(p[CHARACTER_STATE.RUN] > p[CHARACTER_STATE.IDLE])
})

// --------------------------------------------------------- special (Q/E) casts

test('onSpecial drives the SPECIAL state on its own atlas key, independent of onAttack', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  assert.equal(a.onSpecial({ seq: 1 }, 0), true)
  assert.equal(step(a, { nowMs: 10 }), CHARACTER_STATE.SPECIAL)
  assert.equal(a.animKey(), 'chibi_water_attack_down', 'SPECIAL plays the attack_* frames, CAST plays cast_*')
})

test('special outranks an in-flight cast, and a cast does not cancel or extend it', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_wind' })
  a.onSpecial({ seq: 1, durationMs: 200 }, 0)
  a.onAttack({ seq: 1, kind: 'WIND_WINDUP' }, 0)
  assert.equal(step(a, { nowMs: 10 }), CHARACTER_STATE.SPECIAL, 'special still outranks the concurrent cast')
  assert.equal(step(a, { nowMs: 199 }), CHARACTER_STATE.SPECIAL)
  assert.equal(step(a, { nowMs: 200 }), CHARACTER_STATE.CAST, 'special ends on schedule, the still-running cast takes over')
})

test('onSpecial and onAttack gate staleness on independent seq counters', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  assert.equal(a.onSpecial({ seq: 1 }, 0), true)
  assert.equal(a.onAttack({ seq: 1, kind: 'WATER_REACH' }, 0), true, 'a basic at the same seq value is a different channel')
  assert.equal(a.onSpecial({ seq: 1 }, 10), false, 'but a repeat within onSpecial itself is stale')
})

test('death/downed cancel an in-flight special the same way they cancel a cast', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  a.onSpecial({ seq: 1, durationMs: 500 }, 0)
  step(a, { nowMs: 10, downed: true })
  assert.equal(step(a, { nowMs: 20 }), CHARACTER_STATE.IDLE, 'cancelled, not merely outranked')
})

test('a special event is refused while dead or downed, and after destroy', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  step(a, { dead: true })
  assert.equal(a.onSpecial({ seq: 1 }, 0), false)
  a.destroy()
  assert.equal(a.onSpecial({ seq: 99 }, 0), false)
})

test('death outranks every other state, including an in-flight cast', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_fire' })
  a.onAttack({ seq: 1, kind: 'FIRE_REACH' }, 0)
  assert.equal(step(a, { nowMs: 10 }), CHARACTER_STATE.CAST)
  assert.equal(step(a, { nowMs: 20, dead: true, dx: 9 }), CHARACTER_STATE.DEATH)
})

test('downed outranks hurt and cast but loses to death', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  a.onHurt(0)
  a.onAttack({ seq: 1, kind: 'WATER_REACH' }, 0)
  assert.equal(step(a, { nowMs: 10, downed: true }), CHARACTER_STATE.DOWNED)
  assert.equal(step(a, { nowMs: 10, downed: true, dead: true }), CHARACTER_STATE.DEATH)
})

test('hurt outranks an in-flight cast, then the cast resumes if it outlasts hurt', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_earth', hurtMs: 100 })
  a.onAttack({ seq: 1, kind: 'EARTH_CONE', durationMs: 400 }, 0)
  a.onHurt(0)
  assert.equal(step(a, { nowMs: 50 }), CHARACTER_STATE.HURT)
  assert.equal(step(a, { nowMs: 150 }), CHARACTER_STATE.CAST, 'cast still running under the hurt window')
  assert.equal(step(a, { nowMs: 450 }), CHARACTER_STATE.IDLE)
})

test('run beats idle, and idle is the resting state', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_wind' })
  assert.equal(step(a), CHARACTER_STATE.IDLE)
  assert.equal(step(a, { dx: 3, dy: 0 }), CHARACTER_STATE.RUN)
  assert.equal(step(a, { dx: 0, dy: 0 }), CHARACTER_STATE.IDLE)
})

test('run/idle is a SPEED test, so it does not change with the frame rate', () => {
  // The slowest class's real movement speed must read as `run` at every
  // plausible refresh rate. A per-frame pixel threshold used to fail here at
  // 240 Hz, where the slowest hero covers only ~0.29 px per frame.
  const slowestPxPerSec = Math.min(...BALANCE.PLAYER.SPEED_PX)
  for (const fps of [30, 60, 144, 240, 360]) {
    const dtMs = 1000 / fps
    const a = new CharacterAnimator({ atlasKey: 'chibi_earth' })
    const state = a.update({ nowMs: 0, dx: (slowestPxPerSec * dtMs) / 1000, dy: 0, dtMs })
    assert.equal(state, CHARACTER_STATE.RUN, `slowest class must read as run at ${fps} fps`)
    assert.equal(a.dir, 'right')
  }
  // And a genuinely stationary hero stays idle regardless of frame rate.
  for (const fps of [30, 240]) {
    const a = new CharacterAnimator({ atlasKey: 'chibi_earth' })
    assert.equal(a.update({ nowMs: 0, dx: 0, dy: 0, dtMs: 1000 / fps }), CHARACTER_STATE.IDLE)
  }
})

// ------------------------------------------------- timed actions and cancels

test('a timed action completes on its own after exactly its duration', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_fire' })
  a.onAttack({ seq: 1, kind: 'FIRE_REACH', durationMs: 200 }, 1_000)
  assert.equal(step(a, { nowMs: 1_199 }), CHARACTER_STATE.CAST)
  assert.equal(step(a, { nowMs: 1_200 }), CHARACTER_STATE.IDLE, 'ends AT the deadline, not after it')
})

test('death and downed cancel the timed action rather than deferring it', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_fire' })
  a.onAttack({ seq: 1, kind: 'FIRE_REACH', durationMs: 500 }, 0)
  step(a, { nowMs: 10, downed: true })
  assert.equal(step(a, { nowMs: 20 }), CHARACTER_STATE.IDLE, 'cancelled, not merely outranked')
})

test('an attack event is refused outright while dead or downed', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_fire' })
  step(a, { dead: true })
  assert.equal(a.onAttack({ seq: 1, kind: 'FIRE_REACH' }, 0), false)
})

test('cast duration comes from the real gameplay numbers, Wind from its wind-up', () => {
  assert.equal(ATTACK_KIND_ELEMENT.WIND_WINDUP, 'WIND')
  for (const kind of Object.keys(ATTACK_KIND_ELEMENT)) {
    assert.ok(castDurationMs(kind) > 0, `${kind} needs a positive cast duration`)
  }
  // Wind's readable window must at least span its authoritative wind-up, or
  // the animation would end before the fan blade is released.
  assert.ok(castDurationMs('WIND_WINDUP') >= 125)
  assert.equal(castDurationMs('NOT_A_KIND'), 0)
})

// ------------------------------------------ remote sequencing and staleness

test('per-caster seq ordering accepts a rising sequence', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  assert.equal(a.onAttack({ seq: 4, kind: 'WATER_REACH' }, 0), true)
  assert.equal(a.onAttack({ seq: 5, kind: 'WATER_REACH' }, 100), true)
  assert.equal(a.onAttack({ seq: 9, kind: 'WATER_REACH' }, 200), true, 'gaps are fine — emits get capped')
})

test('an out-of-order or duplicate seq is rejected as stale', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  a.onAttack({ seq: 7, kind: 'WATER_REACH' }, 0)
  assert.equal(a.onAttack({ seq: 6, kind: 'WATER_REACH' }, 10), false, 'older seq')
  assert.equal(a.onAttack({ seq: 7, kind: 'WATER_REACH' }, 10), false, 'same seq re-delivered')
})

test('an event whose whole duration already elapsed is rejected, not back-dated', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  const accepted = a.onAttack({ seq: 1, kind: 'WATER_REACH', durationMs: 200, tMs: 0 }, 500)
  assert.equal(accepted, false)
  assert.equal(step(a, { nowMs: 500 }), CHARACTER_STATE.IDLE)
})

test('a late-but-live event plays only its remaining time', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  assert.equal(a.onAttack({ seq: 1, kind: 'WATER_REACH', durationMs: 200, tMs: 0 }, 150), true)
  assert.equal(step(a, { nowMs: 190 }), CHARACTER_STATE.CAST)
  assert.equal(step(a, { nowMs: 200 }), CHARACTER_STATE.IDLE)
})

// ------------------------------------------------------- facing and sliding

test('facing follows the dominant movement axis and survives standing still', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_earth' })
  step(a, { dx: -5, dy: 1 }); assert.equal(a.dir, 'left')
  step(a, { dx: 1, dy: -5 }); assert.equal(a.dir, 'up')
  step(a, { dx: 0, dy: 0 });  assert.equal(a.dir, 'up', 'last non-zero facing is retained while idle')
  step(a, { dx: 5, dy: 1 });  assert.equal(a.dir, 'right')
  step(a, { dx: 1, dy: 5 });  assert.equal(a.dir, 'down')
})

test("Wind keeps casting while it moves — the state holds, the facing keeps tracking", () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_wind' })
  a.onAttack({ seq: 1, kind: 'WIND_WINDUP' }, 0)
  assert.equal(step(a, { nowMs: 10, dx: 6, dy: 0 }), CHARACTER_STATE.CAST, 'movement must not demote the cast')
  assert.equal(a.dir, 'right')
  assert.equal(step(a, { nowMs: 20, dx: 0, dy: 6 }), CHARACTER_STATE.CAST)
  assert.equal(a.dir, 'down', 'facing still tracks movement mid-cast (accepted foot sliding)')
})

// ------------------------------------------------------------ sprite driving

test('the animation key is atlas + state + direction, and hurt covers downed', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_fire' })
  step(a, { dx: 4 })
  assert.equal(a.animKey(), 'chibi_fire_run_right')
  step(a, { dx: 4, downed: true })
  assert.equal(a.animKey(), 'chibi_fire_hurt_right', 'downed reads through the hurt animation')
})

test('an unchanged state does not restart the animation every frame', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_fire' })
  const s = fakeSprite()
  for (let t = 0; t < 5; t++) { step(a, { nowMs: t * 16, dx: 3 }); a.syncSprite(s, anyAnim) }
  assert.deepEqual(s.plays, ['chibi_fire_run_right'])
})

test('a fresh accepted cast restarts the cast animation even at the same key', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_water' })
  const s = fakeSprite()
  a.onAttack({ seq: 1, kind: 'WATER_REACH', durationMs: 200 }, 0)
  step(a, { nowMs: 10 }); a.syncSprite(s, anyAnim)
  a.onAttack({ seq: 2, kind: 'WATER_REACH', durationMs: 200 }, 100)
  step(a, { nowMs: 110 }); a.syncSprite(s, anyAnim)
  assert.deepEqual(s.plays, ['chibi_water_cast_down', 'chibi_water_cast_down'])
})

test('with no atlas loaded (placeholder shapes) the controller drives nothing', () => {
  const a = new CharacterAnimator({ atlasKey: null })
  const s = fakeSprite()
  step(a, { dx: 3 })
  assert.equal(a.animKey(), null)
  assert.equal(a.syncSprite(s, anyAnim), null)
  assert.deepEqual(s.plays, [])
})

test('a key the atlas never built is skipped instead of crashing playback', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_fire' })
  const s = fakeSprite()
  step(a, { dx: 3 })
  assert.equal(a.syncSprite(s, k => k !== 'chibi_fire_run_right'), null)
  assert.deepEqual(s.plays, [])
})

test('destruction cleanup stops all further playback and state changes', () => {
  const a = new CharacterAnimator({ atlasKey: 'chibi_fire' })
  const s = fakeSprite()
  step(a, { dx: 3 }); a.syncSprite(s, anyAnim)
  a.destroy()
  assert.equal(a.onAttack({ seq: 99, kind: 'FIRE_REACH' }, 0), false)
  a.onHurt(0)
  step(a, { nowMs: 500, dx: 9 })
  assert.equal(a.syncSprite(s, anyAnim), null)
  assert.deepEqual(s.plays, ['chibi_fire_run_right'], 'no play after destroy')
})

// -------------------------------------------------------- structure states

test('structure families are read from the live BALANCE.TOWER spec shape', () => {
  assert.equal(structureFamily({ targetImpact: true }), 'targetImpact')
  assert.equal(structureFamily({ cycle: {} }), 'cycle')
  assert.equal(structureFamily({ grind: {} }), 'cycle')
  assert.equal(structureFamily({ entryTrigger: true }), 'entryTrigger')
  assert.equal(structureFamily({ volley: {} }), 'volley')
  assert.equal(structureFamily({ aura: {} }), 'static')
  assert.equal(structureFamily(undefined), 'static')
})

test('a target-impact structure telegraphs while armed and pulses on impact', () => {
  const a = new StructureAnimator({ atlasKey: 'rock_trap', spec: { targetImpact: true }, activeMs: 100 })
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 0 }, 0), STRUCTURE_STATE.IDLE)
  assert.equal(a.update({ phase: 1, charge: 0, cycle: 0 }, 10), STRUCTURE_STATE.TELEGRAPH)
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 1 }, 20), STRUCTURE_STATE.ACTIVE, 'cycleSeq bump = the impact')
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 1 }, 119), STRUCTURE_STATE.ACTIVE)
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 1 }, 120), STRUCTURE_STATE.IDLE)
})

test('a cycling structure charges, reads charged, then fires and recovers', () => {
  const a = new StructureAnimator({ atlasKey: 'wind_vortex', spec: { cycle: {} }, activeMs: 100 })
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 0 }, 0), STRUCTURE_STATE.IDLE)
  assert.equal(a.update({ phase: 0, charge: 0.4, cycle: 0 }, 10), STRUCTURE_STATE.TELEGRAPH)
  assert.equal(a.update({ phase: 0, charge: 1, cycle: 0 }, 20), STRUCTURE_STATE.CHARGED)
  assert.equal(a.update({ phase: 1, charge: 0, cycle: 1 }, 30), STRUCTURE_STATE.ACTIVE)
  assert.equal(a.update({ phase: 1, charge: 0, cycle: 1 }, 130), STRUCTURE_STATE.RECOVERY,
    'phase 1 outlives the pulse — the tail is recovery, not a second hit')
})

test('an entry-trigger structure reads its cooldown as recovery', () => {
  const a = new StructureAnimator({ atlasKey: 'steam_vent', spec: { entryTrigger: true }, activeMs: 100 })
  assert.equal(a.update({ phase: 1, charge: 0, cycle: 3 }, 500), STRUCTURE_STATE.RECOVERY)
  assert.equal(a.update({ phase: 0, charge: 0.5, cycle: 3 }, 600), STRUCTURE_STATE.TELEGRAPH)
  assert.equal(a.update({ phase: 0, charge: 1, cycle: 3 }, 700), STRUCTURE_STATE.CHARGED)
})

test('a static structure stays idle but still pulses when its cycleSeq bumps', () => {
  const a = new StructureAnimator({ atlasKey: 'snare_post', spec: { aura: {} }, activeMs: 50 })
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 0 }, 0), STRUCTURE_STATE.IDLE)
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 1 }, 10), STRUCTURE_STATE.ACTIVE)
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 1 }, 60), STRUCTURE_STATE.IDLE)
})

test('a cycleSeq that goes BACKWARDS is stale and must not re-fire the pulse', () => {
  const a = new StructureAnimator({ atlasKey: 'wind_vortex', spec: { cycle: {} }, activeMs: 100 })
  a.update({ phase: 0, charge: 0, cycle: 5 }, 0)
  a.update({ phase: 0, charge: 0, cycle: 5 }, 200)
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 3 }, 210), STRUCTURE_STATE.IDLE, 'no pulse from a stale packet')
  assert.equal(a.update({ phase: 0, charge: 0, cycle: 6 }, 220), STRUCTURE_STATE.ACTIVE, 'and the real next bump still lands')
})

// CHARGED used to be gated at >=0.999, which no real structure could ever put
// on the wire — the state existed in the machine but production never entered
// it. These two tests drive the animator from the charge values the REAL specs
// can actually emit, so the gate cannot silently drift back out of reach.

test('the entryTrigger structure emits no partial charge at all, so CHARGED is dead for it', () => {
  // This test used to assert the opposite. The 2026-08-27 cadence retune set
  // MAGMA_TRAP's chargeThreshold to 1 -- required, because threshold 2 leaves
  // the fusion worth nothing on maze B at ANY cooldown down to 400ms
  // (docs/reviews/2026-08-27-volcano-cadence-probe.md) -- and vtCharge resets in
  // the same tick it reaches the threshold, so the ONLY charge the Volcano can
  // ever put on the wire is 0.
  //
  // The consequence is deliberate and is recorded here rather than hidden: the
  // Volcano has no charge-up telegraph any more. Its readable rhythm is now
  // erupt -> RECOVERY for the 1300ms recharge -> IDLE, which is phase-driven,
  // not charge-driven. CHARGED remains reachable for cycle structures, which the
  // next test guards; this one pins that it is genuinely unreachable here so the
  // state cannot be quietly assumed live for entryTrigger again.
  const spec = BALANCE.TOWER.MAGMA_TRAP
  assert.equal(spec.chargeThreshold, 1, 'the premise of this test is the shipped threshold')

  const emittable = []
  for (let v = 0; v < spec.chargeThreshold; v++) emittable.push(wireCharge(v / spec.chargeThreshold))
  assert.deepEqual(emittable, [wireCharge(0)], 'zero is the only charge this structure can emit')

  const a = new StructureAnimator({ atlasKey: 'magma_trap', spec, activeMs: 100 })
  const states = emittable.map(charge => a.update({ phase: 0, charge, cycle: 0 }, 0))
  assert.deepEqual(states, [STRUCTURE_STATE.IDLE], 'un-erupted and un-charged reads as idle')
  assert.ok(!states.includes(STRUCTURE_STATE.CHARGED))

  // ...and the recharge phase is what the player actually reads instead.
  assert.equal(a.update({ phase: 1, charge: wireCharge(0), cycle: 0 }, 0), STRUCTURE_STATE.RECOVERY,
    'the 1300ms recharge is the tell that replaced the charge-up')
})

test('CHARGED is reachable well before a cycle structure fires, not in its last frame', () => {
  const spec = BALANCE.TOWER.WIND_SPECIAL
  const suctionMs = spec.cycle.suctionMs
  const a = new StructureAnimator({ atlasKey: 'wind_vortex', spec, activeMs: 100 })
  // The server ramps charge as elapsed/suctionMs during phase 0. Sample it at
  // the 20 Hz emit rate and count how long CHARGED is actually visible.
  let chargedMs = 0
  for (let elapsed = 0; elapsed < suctionMs; elapsed += 50) {
    const charge = wireCharge(Math.min(1, elapsed / suctionMs))
    if (a.update({ phase: 0, charge, cycle: 0 }, elapsed) === STRUCTURE_STATE.CHARGED) chargedMs += 50
  }
  assert.ok(chargedMs >= 200,
    `CHARGED visible for only ${chargedMs}ms of a ${suctionMs}ms ramp — not a readable state`)
})

test('a missing ds record leaves the structure idle rather than throwing', () => {
  const a = new StructureAnimator({ atlasKey: 'farm', spec: null })
  assert.equal(a.update(undefined, 0), STRUCTURE_STATE.IDLE)
})

test('structure animation keys carry the locked direction when one exists', () => {
  const a = new StructureAnimator({ atlasKey: 'water_geyser', spec: { targetImpact: true } })
  a.update({ phase: 1, charge: 0, cycle: 0 }, 0)
  assert.equal(a.animKey(), 'water_geyser_telegraph')
  a.dir = 'N'
  assert.equal(a.animKey(), 'water_geyser_telegraph_N')
})

test('destroying a structure animator stops its playback too', () => {
  const a = new StructureAnimator({ atlasKey: 'wind_vortex', spec: { cycle: {} } })
  const s = fakeSprite()
  a.update({ phase: 0, charge: 1, cycle: 0 }, 0)
  a.syncSprite(s, anyAnim)
  a.destroy()
  a.update({ phase: 1, charge: 0, cycle: 1 }, 10)
  assert.equal(a.syncSprite(s, anyAnim), null)
  assert.deepEqual(s.plays, ['wind_vortex_charged'])
})

// ------------------------------------------------------------- effect pool

function poolOfCounters(cap) {
  let made = 0
  return new EffectPool({
    cap,
    create: () => ({ id: ++made, live: false, killed: false, destroy() { this.killed = true } }),
    reset: (o, tag) => { o.live = true; o.tag = tag },
    hide: (o) => { o.live = false },
  })
}

test('the pool reuses a released object instead of allocating a new one', () => {
  const pool = poolOfCounters(8)
  const a = pool.acquire('one')
  assert.equal(a.tag, 'one')
  pool.release(a)
  assert.equal(a.live, false, 'released objects are hidden')
  const b = pool.acquire('two')
  assert.equal(b, a, 'same instance came back out of the free list')
  assert.equal(b.tag, 'two')
  assert.equal(b.live, true)
})

test('the pool caps simultaneous instances and recovers once one is released', () => {
  const pool = poolOfCounters(2)
  const a = pool.acquire(), b = pool.acquire()
  assert.equal(pool.acquire(), null, 'over the cap, acquire refuses rather than growing')
  assert.equal(pool.activeCount, 2)
  pool.release(a)
  assert.ok(pool.acquire(), 'a freed slot is immediately usable again')
  assert.ok(b)
})

test('releasing something the pool does not own is a no-op', () => {
  const pool = poolOfCounters(4)
  assert.equal(pool.release({ id: -1 }), false)
  const a = pool.acquire()
  assert.equal(pool.release(a), true)
  assert.equal(pool.release(a), false, 'double release must not corrupt the free list')
  assert.equal(pool.freeCount, 1)
})

test('destroying the pool destroys both live and pooled objects exactly once', () => {
  const pool = poolOfCounters(4)
  const a = pool.acquire(), b = pool.acquire()
  pool.release(b)
  pool.destroy()
  assert.equal(a.killed, true)
  assert.equal(b.killed, true)
  assert.equal(pool.activeCount, 0)
  assert.equal(pool.freeCount, 0)
  assert.equal(pool.acquire(), null, 'a destroyed pool hands out nothing')
})
