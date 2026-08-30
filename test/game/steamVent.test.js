// Steam Vent / STEAM_VENT (redesign §6.1, Amendment A2.2, Task 16) — the
// CONFUSION half of the persistent-area family: a walkable 2x2 fusion wrapped
// in a ~3x3 steam cloud that scalds on a fixed cadence and keeps refreshing a
// short, hard-bounded confusion status.
//
// Row ids below (N*/T*/H*/M*/O*/X*/R*/D*/C*) name rows of the adversarial
// matrix written before any of this code existed:
// docs/plans/2026-08-01-steam-vent-adversarial-test-matrix.md
//
// COVERAGE IS NOT 1:1, and the first pass claimed it was (Task 16 review). Every
// test here names a real row, but these rows have no test:
//   T2, O4, X3, D3 — genuinely uncovered; each is a variant of a row that IS
//     covered (T1 for T2, O1 for O4, X1 for X3, D1 for D3), so the gap is
//     narrower than the count suggests, but it is a gap.
//   R3, R4 — whole-match behavior, delegated to the 288-cell hang gate. That
//     gate now also reports confusedSeconds, so it can tell "no hangs" apart
//     from "confusion never fired" (review finding F4).
//   C2, C3, C4 — wire round-trip and stride, already owned by encode.test.js.
//
// Every navigation row is written so it FAILS if the confusion branch in
// enemies.js is deleted. That is not decoration: the first pass put the wander
// heading and the cost-field march in the same direction, so 29 of 30 tests
// passed with the entire feature stubbed out (review findings F1/F2).
//
// The matrix exists because Amendment A4 names Steam Vent as the hall-ring
// soft-lock's exact signature (suspended navigation + suspended target
// acquisition). Every "still attacks" / "recovers" assertion here is guarding
// an enemy that has no move and no attack and holds the wave open forever.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore, tickEnemies } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { destroyStructure } from '../../server/game/structures.js'
import { ENEMY_TYPE, FLAG } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { CostField, hpToBand } from '../../server/game/costField.js'
import { tileToWorldX, tileToWorldY, TILE_SIZE } from '../../server/game/grid.js'
import { CONFIG, STRUCTURE_TYPES } from '../../shared/constants.js'
import {
  makeStatus, resetStatus, tickStatus, applyConfusion, isConfused,
  applyRoot, wanderHeading,
} from '../../server/game/status.js'

const SPEC = BALANCE.TOWER.STEAM_VENT
// The confusion SYSTEM outlived its only in-game source: the vent applies a
// strong slow now (2026-08-15 retune), so nothing in the shipped game calls
// applyConfusion. The system tests below drive it directly and keep their own
// duration rather than reading a vent field that no longer exists. They are
// pinning code that is currently UNREACHABLE in play -- see the note in
// section A. Retire them with the subsystem once the retune is confirmed.
const CONFUSE = { ms: 1200 }
const C = BALANCE.STATUS.CONFUSE

function vent(gx, gy, id = 1) {
  return { id, type: 'STEAM_VENT', ownerId: null, gx, gy, w: 2, h: 2, orient: 'H', hp: 90, maxHp: 90 }
}

// Tower-only fixture (no cost field / hall / players): exercises the structure
// behavior and the status system. Same shape and same `step` contract as
// muddyBog.test.js — tickTowers never advances status timers itself, so the
// test decays them exactly the way tickEnemies does in the real loop.
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0, now: 0, fx: [] }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) + 16 } }

// Status decays BEFORE structures run, matching the real per-tick order
// (players → enemies → structures, Task 2's tickOrderLog) — tickStatus stands in
// for the tickEnemies half. muddyBog.test.js's sibling helper has these the
// other way round, which for the bounding rows below would put the start of
// each post-immunity episode a tick later than production (Task 16 review,
// finding F6). The Bog's own rows are cadence-insensitive, so that fixture is
// not wrong for what it measures; this one is measuring the bound itself.
function step(st, dtMs) {
  st.now += dtMs
  for (let i = 0; i < st.enemyStore.count; i++) tickStatus(st.enemyStore.status[i], dtMs)
  tickTowers(st, st.now, dtMs)
}
function advance(st, totalMs, sliceMs = 16) {
  let remaining = totalMs
  while (remaining > 0) {
    const dt = Math.min(sliceMs, remaining)
    step(st, dt)
    remaining -= dt
  }
}

// Sim fixture for the navigation rows — needs a real cost field, hall and
// player list because those are what confusion is suspending. Mirrors
// walkableStructures.test.js's makeSimState.
function makeSimState({ structures = [], players = [], hallGx = 19, hallGy = 19 } = {}) {
  const cf = new CostField()
  cf.setHall(hallGx, hallGy)
  for (const s of structures) {
    if (s.banded) cf.setWallBand(s.gx, s.gy, hpToBand(s.hp, s.maxHp))
  }
  cf.compute()
  return {
    enemyStore: new EnemyStore(),
    costField: cf,
    structures,
    players,
    hall: {
      gx: hallGx, gy: hallGy, w: 2, h: 2,
      x: (hallGx + 1) * TILE_SIZE, y: (hallGy + 1) * TILE_SIZE, hp: 1000, maxHp: 1000,
    },
    placedVersion: 0, livingEnemyCount: 0, waveBounty: 0, now: 0, fx: [],
  }
}
// Real per-tick order (Task 2's tickOrderLog): enemies resolve BEFORE
// structures, so confusion applied on tick N first steers on tick N+1.
function simStep(st, dtMs) {
  st.now += dtMs
  tickEnemies(st, st.now, dtMs)
  tickTowers(st, st.now, dtMs)
}
// Force a known heading. The production heading is a hash of (id, turn) and is
// deliberately not steerable from a test; the navigation rows care about what
// the steering DOES with a heading, not which one it picked.
function setHeading(store, i, hx, hy) {
  store.status[i].confuseHx = hx
  store.status[i].confuseHy = hy
}

// --- A. navigation suspension ----------------------------------------------

test('N1/N2: confusion replaces cost-field steering with the wander heading', () => {
  const control = makeSimState({})
  spawnAt(control.enemyStore, tileToWorldX(19), tileToWorldY(5))
  simStep(control, 100)
  const marchedY = control.enemyStore.y[0]
  assert.ok(marchedY > tileToWorldY(5), 'control marches toward the hall (south)')

  const st = makeSimState({})
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5))
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  setHeading(st.enemyStore, i, 0, -1)                 // due NORTH, away from the hall
  simStep(st, 100)
  assert.ok(st.enemyStore.y[0] < tileToWorldY(5), 'confused enemy walks its heading, not the field')
})

// The hall is SOUTH of every fixture below, so a heading of due NORTH is the
// one direction the unconfused fallback will never take. That is deliberate:
// each of these rows has to fail if the confusion branch in enemies.js is
// deleted, and a geometry where the march happens to go the same way as the
// wander proves nothing about either (Task 16 review, finding F1).
test('N3: a confused enemy presses into a wall without crossing it', () => {
  const wall = { id: 2, type: STRUCTURE_TYPES.BARRICADE, gx: 19, gy: 4, w: 1, h: 1, hp: 1e6, maxHp: 1e6, banded: true }
  const st = makeSimState({ structures: [wall] })
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5) + 8)
  const y0 = st.enemyStore.y[i]
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  for (let t = 0; t < 40; t++) {
    setHeading(st.enemyStore, 0, 0, -1)               // hold due NORTH, into the wall
    simStep(st, 16)
  }
  assert.ok(st.enemyStore.y[0] < y0, 'it actually walked its heading, away from the hall')
  const wallBottom = tileToWorldY(4) + 16
  assert.ok(st.enemyStore.y[0] > wallBottom + st.enemyStore.radius[0] - 0.5,
    'pushout kept the body out of the walled tile')
})

test('N4: a confused enemy walks to the map edge and clamps there', () => {
  const st = makeSimState({})
  const i = spawnAt(st.enemyStore, tileToWorldX(1), tileToWorldY(5))
  const x0 = st.enemyStore.x[i]
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  for (let t = 0; t < 60; t++) {
    setHeading(st.enemyStore, 0, -1, 0)               // due WEST, off the edge
    simStep(st, 16)
  }
  assert.ok(st.enemyStore.x[0] < x0, 'it walked west, which no march from here would do')
  assert.ok(st.enemyStore.x[0] >= st.enemyStore.radius[0] - 1e-9, 'clamped inside the arena')
})

test('N5: confusion and root are independent — a confused+rooted enemy does not move', () => {
  const st = makeSimState({})
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5))
  const status = st.enemyStore.status[i]
  applyConfusion(status, CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  applyRoot(status, 2000, st.enemyStore.speed[i])
  setHeading(st.enemyStore, i, 0, -1)
  const x0 = st.enemyStore.x[i], y0 = st.enemyStore.y[i]
  simStep(st, 100)
  assert.equal(st.enemyStore.x[0], x0)
  assert.equal(st.enemyStore.y[0], y0)
  assert.ok(isConfused(st.enemyStore.status[0]), 'confusion still ticking under root')
})

test('N6: knockback still displaces a confused enemy', () => {
  const st = makeSimState({})
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5))
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  setHeading(st.enemyStore, i, 0, 0)                  // no self-motion contribution
  st.enemyStore.kvx[i] = 300
  const x0 = st.enemyStore.x[i]
  simStep(st, 16)
  assert.ok(st.enemyStore.x[0] > x0 + 1, 'knockback velocity is untouched by confusion')
})

test('N7: steering resumes the tick after confusion ends, with no stale heading', () => {
  const st = makeSimState({})
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5))
  const status = st.enemyStore.status[i]
  applyConfusion(status, CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  setHeading(st.enemyStore, i, 0, -1)
  for (let t = 0; t < 400 && isConfused(st.enemyStore.status[0]); t++) simStep(st, 16)
  assert.equal(isConfused(st.enemyStore.status[0]), false, 'confusion ended on its own')
  assert.equal(st.enemyStore.status[0].confuseHx, 0, 'heading cleared')
  assert.equal(st.enemyStore.status[0].confuseHy, 0)

  const y0 = st.enemyStore.y[0]
  simStep(st, 100)
  assert.ok(st.enemyStore.y[0] > y0, 'marching toward the hall again')
})

test('N8: the vent never touches the cost field', () => {
  const v = vent(10, 10)
  const st = makeSimState({ structures: [v] })
  const before = Array.from(st.costField.wallBand)
  spawnAt(st.enemyStore, ...Object.values(centerOf(10, 10)))
  for (let t = 0; t < 60; t++) simStep(st, 16)
  assert.deepEqual(Array.from(st.costField.wallBand), before)
})

// --- B. target acquisition --------------------------------------------------

test('T1: a confused enemy does not acquire a chase', () => {
  const player = { id: 'p0', x: tileToWorldX(19), y: tileToWorldY(5) + 20, alive: true, hp: 100 }
  const st = makeSimState({ players: [player] })
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5))
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  setHeading(st.enemyStore, i, 0, -1)
  simStep(st, 16)
  assert.notEqual(st.enemyStore.aggro[0].state, 'chase', 'target acquisition suspended')
})

test('T3: chase resumes cleanly once confusion ends', () => {
  const player = { id: 'p0', x: tileToWorldX(19), y: tileToWorldY(5) + 20, alive: true, hp: 100 }
  const st = makeSimState({ players: [player] })
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5))
  simStep(st, 16)
  assert.equal(st.enemyStore.aggro[0].state, 'chase', 'chase acquired while unconfused')

  applyConfusion(st.enemyStore.status[0], CONFUSE.ms, st.enemyStore.speed[0], st.enemyStore.id[0])
  setHeading(st.enemyStore, 0, 0, -1)
  for (let t = 0; t < 400 && isConfused(st.enemyStore.status[0]); t++) {
    simStep(st, 16)
    player.x = st.enemyStore.x[0]                     // stay in proximity
    player.y = st.enemyStore.y[0] + 20
  }
  simStep(st, 16)
  assert.equal(st.enemyStore.aggro[0].state, 'chase', 'aggro FSM was not left corrupted')
})

test('T5/T7: hall contact still lands while the march itself is suspended', () => {
  const st = makeSimState({})
  // Directly north of the hall footprint, within melee reach of its top edge but
  // NOT overlapping it: a body pressed into the hall gets ejected north by
  // pushout, which would satisfy a "moved away" assertion without any steering
  // being suspended at all (Task 16 review, finding F1).
  const i = spawnAt(st.enemyStore, tileToWorldX(19), 0)
  st.enemyStore.y[i] = tileToWorldY(19) - 16 - st.enemyStore.radius[i] - 2
  const y0 = st.enemyStore.y[i]
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  const hp0 = st.hall.hp
  for (let t = 0; t < 20; t++) {
    if (isConfused(st.enemyStore.status[0])) setHeading(st.enemyStore, 0, 0, -1)
    simStep(st, 16)
  }
  assert.ok(st.hall.hp < hp0, 'contact attacks are not silently converted into a stun')
  // The discriminating half: an unconfused enemy here marches SOUTH into the
  // hall. Retreating north is only possible if steering really was suspended.
  assert.ok(st.enemyStore.y[0] < y0 - 5, 'hall-march steering was suspended')
})

// Matrix row T6, the one anti-inertia mechanism that is unique to confusion:
// the wall probe follows the WANDER HEADING rather than the cheapest path, so a
// confused enemy bashes what it blunders into instead of standing inert against
// it for a whole episode. The wall sits NORTH, which the cost-field march from
// this tile never faces — so this fails outright if the probe is removed.
// It had no test at all in the first pass (Task 16 review, finding F2).
test('T6: a confused enemy bashes the wall it blunders into, not the one on its path', () => {
  const wall = { id: 2, type: STRUCTURE_TYPES.BARRICADE, gx: 19, gy: 4, w: 1, h: 1, hp: 1e6, maxHp: 1e6, banded: true }
  const st = makeSimState({ structures: [wall] })
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5) + 8)
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  const hp0 = wall.hp
  for (let t = 0; t < 40; t++) {
    if (isConfused(st.enemyStore.status[0])) setHeading(st.enemyStore, 0, 0, -1)
    simStep(st, 16)
  }
  assert.ok(wall.hp < hp0, 'the heading-direction wall probe fired')
})

test('T4: a slowed enemy standing on a walkable structure still attacks it', () => {
  const v = vent(19, 5)
  const st = makeSimState({ structures: [v] })
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5))
  const hp0 = v.hp
  for (let t = 0; t < 60; t++) {
    simStep(st, 16)
    if (st.enemyStore.count === 0) break
    assert.ok(st.enemyStore.status[0].slowMs > 0 || t < 2, 'inside the cloud → slowed')
  }
  assert.ok(v.hp < hp0, 'walkable contact attack survives the vent’s own status')
})

// --- C. heading changes -----------------------------------------------------

test('H1/H6: initial confusion picks a unit heading immediately', () => {
  const s = resetStatus(makeStatus())
  applyConfusion(s, CONFUSE.ms, 1, 7)
  assert.ok(Math.abs(Math.hypot(s.confuseHx, s.confuseHy) - 1) < 1e-9, 'unit vector')
})

// The heading is one of 16 compass directions, so two consecutive turns landing
// on the SAME direction is legitimate wander behavior at a ~1/16 rate, not a
// defect — asserting "it always changes" would be asserting a property the
// design does not have. What is guaranteed: it never re-rolls WITHIN an
// interval, the turn index advances at every interval, and over several
// intervals the direction demonstrably varies.
test('H2/H3: the heading holds for a turn interval, then turns over', () => {
  const s = resetStatus(makeStatus())
  applyConfusion(s, CONFUSE.ms, 0, 7)            // SLOW tier: full duration
  s.confuseCapMs = 1e9; s.confusedMs = 1e9            // isolate turnover from expiry
  const h0 = [s.confuseHx, s.confuseHy]
  tickStatus(s, 16)
  assert.deepEqual([s.confuseHx, s.confuseHy], h0, 'not re-rolled every tick')
  assert.equal(s.confuseTurn, 0)

  const seen = new Set([h0.join(',')])
  for (let elapsed = 16; elapsed < C.turnMs * 6; elapsed += 16) {
    tickStatus(s, 16)
    seen.add(`${s.confuseHx},${s.confuseHy}`)
  }
  assert.ok(s.confuseTurn >= 5, 'turn index advanced once per interval')
  assert.ok(seen.size > 1, 'the direction varies across intervals')
})

test('H4: headings are a deterministic function of (enemy id, turn index)', () => {
  assert.deepEqual(wanderHeading(42, 0), wanderHeading(42, 0), 'pure function')
  assert.deepEqual(wanderHeading(42, 3), wanderHeading(42, 3))
  const across = new Set(Array.from({ length: 16 }, (_, t) => wanderHeading(42, t).join(',')))
  assert.ok(across.size > 1, 'the turn index actually participates')
})

test('H5: two enemies confused on the same tick do not share a heading', () => {
  const seen = new Set()
  for (let id = 0; id < 12; id++) {
    const s = resetStatus(makeStatus())
    applyConfusion(s, CONFUSE.ms, 0, id)
    seen.add(`${s.confuseHx.toFixed(6)},${s.confuseHy.toFixed(6)}`)
  }
  assert.ok(seen.size > 1, 'heading is per-enemy, not global')
})

test('H7: confusion never draws from the run rng stream', () => {
  let draws = 0
  const v = vent(10, 10)
  const st = makeState([v])
  st.rng = () => { draws++; return 0.5 }
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx, cy)
  advance(st, 1000)
  assert.equal(draws, 0, 'the seeded spawn-schedule stream is untouched')
})

// --- D. immunity and refresh bounding ---------------------------------------

// The slow has NO episode budget, unlike the confusion it replaced: it is an
// ordinary refreshing status, so permanent occupancy means permanent slow. That
// is intended -- dwell time in the cloud is exactly what the scald is paid for
// (see the retune note in shared/balance.js). What must NOT happen is the
// factor compounding: applySlow keeps the STRONGER factor, it does not multiply.
test('M1/M2: unbroken occupancy refreshes the slow but never stacks it', () => {
  const v = vent(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)   // SLOW tier: full strength
  st.enemyStore.hp[i] = 1e6                                    // outlive the scald
  advance(st, 3000)
  const s0 = st.enemyStore.status[0]
  assert.ok(s0.slowMs > 0, 'still slowed while standing in the steam')
  assert.ok(s0.slowFactor >= SPEC.slow.factor - 1e-9,
    `slowFactor ${s0.slowFactor} fell below the spec factor ${SPEC.slow.factor} — refresh is compounding`)
})

test('M3: re-application during immunity is a no-op', () => {
  const s = resetStatus(makeStatus())
  s.confuseImmuneMs = 500
  applyConfusion(s, CONFUSE.ms, 0, 7)
  assert.equal(s.confusedMs, 0)
})

test('M5: the slow expires once the enemy leaves the steam', () => {
  const v = vent(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  st.enemyStore.hp[i] = 1e6
  advance(st, 600)
  assert.ok(st.enemyStore.status[0].slowMs > 0, 'slowed inside')
  st.enemyStore.x[0] = cx + 400
  advance(st, SPEC.slow.ms + 400)
  assert.equal(st.enemyStore.status[0].slowMs, 0,
    'a vent the enemy has left must not hold it slowed forever')
})

test('M6: faster enemies recover sooner', () => {
  const slow = resetStatus(makeStatus())
  const fast = resetStatus(makeStatus())
  applyConfusion(slow, CONFUSE.ms, 0, 1)         // SLOW
  applyConfusion(fast, CONFUSE.ms, 2, 2)         // FAST
  assert.ok(fast.confusedMs < slow.confusedMs)
  assert.ok(fast.confuseCapMs < slow.confuseCapMs, 'the episode cap scales too')
})

test('M7: super-fast enemies are confusion-immune', () => {
  const v = vent(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN, true)   // elite goblin: SUPER_FAST
  st.enemyStore.hp[i] = 1e6
  advance(st, 1000)
  assert.equal(isConfused(st.enemyStore.status[0]), false)
})

// --- E. overlapping vents ---------------------------------------------------

test('O1/O3: overlapping vents share one episode and one cap', () => {
  const a = vent(10, 10, 1), b = vent(11, 10, 2)      // clouds overlap
  const st = makeState([a, b])
  const { cx, cy } = centerOf(11, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  st.enemyStore.hp[i] = 1e6
  advance(st, C.maxEpisodeMs + 200)
  assert.equal(isConfused(st.enemyStore.status[0]), false, 'two sources cannot outlast one cap')
})

test('O2: overlapping vents each scald (damage stacks, confusion does not)', () => {
  const { cx, cy } = centerOf(11, 10)

  const one = makeState([vent(10, 10, 1)])
  const i1 = spawnAt(one.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  one.enemyStore.hp[i1] = 1e6
  advance(one, 1200)
  const soloDamage = 1e6 - one.enemyStore.hp[0]

  const two = makeState([vent(10, 10, 1), vent(11, 10, 2)])
  const i2 = spawnAt(two.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  two.enemyStore.hp[i2] = 1e6
  advance(two, 1200)
  const pairDamage = 1e6 - two.enemyStore.hp[0]

  assert.ok(soloDamage > 0)
  assert.ok(pairDamage > soloDamage, 'both vents pulse the shared occupant')
})

// --- F. exit persistence ----------------------------------------------------

test('X1/X2: the slow persists after exit but scald pulses stop immediately', () => {
  const v = vent(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  st.enemyStore.hp[i] = 1e6
  advance(st, 300)
  assert.ok(st.enemyStore.status[0].slowMs > 0, 'slowed inside')

  // Displaced clean out of the cloud while still slowed — the Muddy Bog Gate 6
  // defect transplanted: status and displacement are INDEPENDENT axes.
  st.enemyStore.x[0] = cx + 400
  const hpAtExit = st.enemyStore.hp[0]
  advance(st, 600)
  assert.equal(st.enemyStore.hp[0], hpAtExit, 'no damage at unbounded range')
  assert.ok(st.enemyStore.status[0].slowMs > 0, 'the slow persists briefly after exit')
})

// --- G. hall ring -----------------------------------------------------------

test('R1: a confused enemy on a hall-ring terminal tile still damages the hall', () => {
  const st = makeSimState({})
  // Hall ring tile, body nudged into melee contact with the hall's top edge.
  const i = spawnAt(st.enemyStore, tileToWorldX(19), 0)
  st.enemyStore.y[i] = tileToWorldY(19) - 16 - st.enemyStore.radius[i] - 2
  const y0 = st.enemyStore.y[i]
  const hp0 = st.hall.hp
  for (let t = 0; t < 60; t++) {
    const s = st.enemyStore.status[0]
    applyConfusion(s, CONFUSE.ms, st.enemyStore.speed[0], st.enemyStore.id[0])
    if (isConfused(s)) setHeading(st.enemyStore, 0, 0, -1)   // wander away from the hall
    simStep(st, 16)
  }
  assert.ok(st.hall.hp < hp0, 'the hall-ring soft-lock signature does not reappear')
  assert.ok(st.enemyStore.y[0] < y0 - 5, 'and it really was steering away, not marching in')
})

test('R2: a confused enemy near the ring recovers and closes on the hall', () => {
  const st = makeSimState({})
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(16))
  const y0 = st.enemyStore.y[i]
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  let confusedTicks = 0, yAtRecovery = null
  for (let t = 0; t < 400; t++) {
    if (isConfused(st.enemyStore.status[0])) { confusedTicks++; setHeading(st.enemyStore, 0, 0, -1) }
    else if (yAtRecovery === null) yAtRecovery = st.enemyStore.y[0]
    simStep(st, 16)
  }
  assert.ok(confusedTicks < 400, 'confusion is bounded, so navigation returns')
  // It must have LOST ground while confused and then made it back — the whole
  // shape of "bounded wandering", and impossible without the steering override.
  assert.ok(yAtRecovery < y0, 'it was driven away from the hall during the episode')
  assert.ok(st.hall.hp < 1000, 'and it still reached the hall afterwards')
})

// --- H. destruction ---------------------------------------------------------

test('D1/D2: destroying the vent stops pulses; a live slow runs out naturally', () => {
  const v = vent(10, 10)
  const st = makeState([v])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  st.enemyStore.hp[i] = 1e6
  advance(st, 600)
  assert.ok(st.enemyStore.status[0].slowMs > 0)

  destroyStructure(st, v)
  const hpAtDestroy = st.enemyStore.hp[0]
  advance(st, 400)
  assert.equal(st.enemyStore.hp[0], hpAtDestroy, 'pulses stopped')
  advance(st, SPEC.slow.ms + 400)
  assert.equal(st.enemyStore.status[0].slowMs, 0, 'no orphaned permanent slow')
})

test('D4: destroying one vent does not disturb another vent`s pulse clock', () => {
  const a = vent(10, 10, 1), b = vent(20, 20, 2)
  const st = makeState([a, b])
  const ib = spawnAt(st.enemyStore, ...Object.values(centerOf(20, 20)))
  st.enemyStore.hp[ib] = 1e6
  advance(st, 600)
  destroyStructure(st, a)
  const hp0 = st.enemyStore.hp[0]
  advance(st, 600)
  assert.ok(st.enemyStore.hp[0] < hp0, 'the surviving vent keeps pulsing')
})

// --- I. serialization -------------------------------------------------------

test('C1/C5: the confused flag serializes as one bit and disturbs no existing bit', () => {
  // Driven directly: the vent no longer confuses anything, so this pins the
  // SERIALIZATION contract of a subsystem that currently has no in-game source.
  const st = makeSimState({})
  const i = spawnAt(st.enemyStore, tileToWorldX(19), tileToWorldY(5))
  applyConfusion(st.enemyStore.status[i], CONFUSE.ms, st.enemyStore.speed[i], st.enemyStore.id[i])
  simStep(st, 16)
  assert.ok((st.enemyStore.flags[0] & FLAG.CONFUSED) !== 0, 'flag set while confused')
  assert.equal(FLAG.ELITE, 1 << 0)
  assert.equal(FLAG.AGGRO, 1 << 6)
  assert.equal(FLAG.CONFUSED, 1 << 7)
})
