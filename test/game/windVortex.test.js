// Wind Vortex (redesign §5.4, Task 12) — the TIMED PHASE MACHINE family (spec
// §3 family 3): a fast repeating SUCTION (fixed pulses, gathers enemies
// toward center) -> RELEASE (ejects the gathered group once, in the locked
// cardinal `dir`) -> back to SUCTION cycle. No target search, no cooldown
// gate, no damage.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { applyKnockback, MAX_KB_VELOCITY } from '../../server/game/enemyMove.js'
import { VORTEX_PHASE } from '../../server/game/structureBehaviors/cycle.js'
import { encodeSnapshot, decodeSnapshot } from '../../server/net/encode.js'
import { createCombatStats } from '../../server/game/combatStats.js'

const SPEC = BALANCE.TOWER.WIND_SPECIAL
const C = SPEC.cycle

function vortex(gx, gy, dir, id = 1) {
  return { id, type: 'WIND_SPECIAL', ownerId: 'p0', gx, gy, w: 2, h: 1, orient: 'H', dir, hp: 70, maxHp: 70 }
}
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0 }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.GOBLIN, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) } }

test('a new cycle starts in SUCTION with the deadline set from cycle.suctionMs', () => {
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  tickTowers(st, 0, 16)
  assert.equal(g.phase, VORTEX_PHASE.SUCTION)
  assert.equal(g.phaseDeadline, C.suctionMs)
  assert.equal(g.cycleSeq, 0)
})

test('suction pulses on a fixed cadence, not every tick', () => {
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 50, cy) // off-center, so pull direction is visible

  tickTowers(st, 0, 16) // first pulse fires immediately
  const kvAfterFirst = st.enemyStore.kvx[i]
  assert.ok(kvAfterFirst < 0, 'pulled toward center (-x)')

  tickTowers(st, 100, 16) // still inside the same pulse window (pulseMs = 200)
  assert.equal(st.enemyStore.kvx[i], kvAfterFirst, 'no second pulse before pulseMs elapses')

  tickTowers(st, 200, 16) // pulse window elapsed
  assert.ok(st.enemyStore.kvx[i] < kvAfterFirst, 'a second pulse adds further pull')
})

test('suction impulses are recorded in combat instrumentation, not just release', () => {
  // Codex Gate 5 finding: suction called applyKnockback directly and
  // discarded the returned impulse, so balance telemetry only ever saw
  // Vortex's release — its repeated defining effect was invisible.
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  st.combatStats = createCombatStats()
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 50, cy)

  tickTowers(st, 0, 16) // one suction pulse, no release yet
  assert.ok(st.combatStats.byCategory.structure.displacement > 0,
    'a suction pulse must reach combatStats the same way release does')
})

test('outsiders are unaffected; only enemies within radiusPx are pulled', () => {
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const outside = spawnAt(st.enemyStore, cx + SPEC.radiusPx + 50, cy)
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.kvx[outside], 0)
})

test('phase deadline transitions SUCTION -> RELEASE exactly once, with no catch-up pulse storm', () => {
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 50, cy)

  tickTowers(st, 0, 16)
  tickTowers(st, C.suctionMs, 16) // deadline reached: transitions to RELEASE, no release yet this call
  assert.equal(g.phase, VORTEX_PHASE.RELEASE)
  assert.equal(g.phaseDeadline, C.suctionMs + C.releaseMs)
})

test('release fires exactly once per cycle, ejecting the tracked group in the locked direction', () => {
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy) // spawn at center: zero suction impulse, but still tracked

  tickTowers(st, 0, 16)
  tickTowers(st, C.suctionMs, 16) // -> RELEASE, not yet fired
  assert.equal(st.enemyStore.kvx[i], 0, 'no release velocity yet')

  tickTowers(st, C.suctionMs + 1, 16) // release fires
  assert.ok(st.enemyStore.kvx[i] > 0, 'east release is +x')
  assert.equal(st.enemyStore.kvy[i], 0)
  const kvxAfterRelease = st.enemyStore.kvx[i]

  tickTowers(st, C.suctionMs + 100, 16) // still inside RELEASE phase
  assert.equal(st.enemyStore.kvx[i], kvxAfterRelease, 'release is not reapplied within the same cycle')
})

test('the release direction matches the structure\'s locked cardinal', () => {
  const southG = vortex(20, 20, 'S')
  const st = makeState([southG])
  const { cx, cy } = centerOf(20, 20)
  const i = spawnAt(st.enemyStore, cx, cy)
  tickTowers(st, 0, 16)
  tickTowers(st, C.suctionMs, 16)
  tickTowers(st, C.suctionMs + 1, 16)
  assert.ok(st.enemyStore.kvy[i] > 0, 'south release is +y')
  assert.equal(st.enemyStore.kvx[i], 0)
})

test('a super-heavy elite troll is tracked but immune to both suction and release', () => {
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 50, cy, ENEMY_TYPE.TROLL, true) // super-heavy

  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.kvx[i], 0, 'suction fully resisted')
  tickTowers(st, C.suctionMs, 16)
  tickTowers(st, C.suctionMs + 1, 16) // release
  assert.equal(st.enemyStore.kvx[i], 0, 'release fully resisted')
  assert.equal(st.enemyStore.kvy[i], 0)
})

test('a released enemy is immune to this vortex\'s next suction, but a fresh enemy is not', () => {
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const captured = spawnAt(st.enemyStore, cx + 50, cy)

  tickTowers(st, 0, 16)
  tickTowers(st, C.suctionMs, 16)              // -> RELEASE
  tickTowers(st, C.suctionMs + 1, 16)          // release fires, immunity set
  const kvxAfterRelease = st.enemyStore.kvx[captured]

  const releaseDeadline = C.suctionMs + C.releaseMs
  tickTowers(st, releaseDeadline, 16)           // -> SUCTION (cycle 2), no pulse yet
  assert.equal(g.cycleSeq, 1)

  const fresh = spawnAt(st.enemyStore, cx + 50, cy)
  tickTowers(st, releaseDeadline + 1, 16)       // first pulse of the new cycle

  assert.equal(st.enemyStore.kvx[captured], kvxAfterRelease, 'recently-released enemy is skipped by suction (recapture immunity)')
  assert.ok(st.enemyStore.kvx[fresh] < 0, 'a fresh enemy in range is pulled normally')
})

test('destruction during suction cancels the release: removing the structure stops all further effects', () => {
  const g = vortex(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy) // at center: tracked, but no suction impulse either

  tickTowers(st, 0, 16) // captured into vxTracked during suction
  st.structures = [] // destroyed before the release deadline

  tickTowers(st, C.suctionMs, 16)
  tickTowers(st, C.suctionMs + 1, 16) // would have been the release tick
  assert.equal(st.enemyStore.kvx[i], 0, 'no release velocity: the structure was gone before it could fire')
  assert.equal(st.enemyStore.kvy[i], 0)
})

test('reconnect: phase, deadline, charge, and cycle survive an encode/decode round trip', () => {
  const g = vortex(10, 10, 'E', 42)
  const st = makeState([g])
  tickTowers(st, 0, 16)
  tickTowers(st, C.suctionMs, 16) // mid-transition state: phase RELEASE, not yet fired

  const netState = {
    tick: 1, placedVersion: 1, hall: { hp: 100 }, players: [],
    enemyStore: st.enemyStore, projectiles: [], fx: [], atkFx: [],
    structures: st.structures,
  }
  const decoded = decodeSnapshot(encodeSnapshot(netState, -1))
  const wire = decoded.structureState.find(s => s.id === 42)
  assert.equal(wire.phase, g.phase)
  assert.equal(wire.deadline, g.phaseDeadline)
  assert.equal(wire.cycle, g.cycleSeq)
})

test('a realistic overlap (a strong prior push plus a Vortex release) stays under the cap unclamped', () => {
  const kvx = new Float64Array(1), kvy = new Float64Array(1)
  // Simulate a Vortex release landing on an enemy already carrying a strong
  // push from another source (e.g. Water Geyser) in a different direction.
  applyKnockback(kvx, kvy, 0, 1, 0, 900, 0)              // strong prior push, +x
  applyKnockback(kvx, kvy, 0, 0, 1, C.releasePower, 0)   // Vortex release, +y
  const mag = Math.hypot(kvx[0], kvy[0])
  assert.ok(mag <= MAX_KB_VELOCITY + 1e-9, `combined velocity ${mag} must not exceed the global cap`)
  assert.ok(mag < MAX_KB_VELOCITY, 'this realistic case does not even need the clamp')
})

test('genuinely stacked displacement sources are clamped to exactly the global cap, direction preserved', () => {
  const kvx = new Float64Array(1), kvy = new Float64Array(1)
  // Three strong same-direction pushes (e.g. repeated Vortex suction landing
  // on an enemy already carrying another source's knockback) sum well past
  // MAX_KB_VELOCITY before any clamp — this is the case the global cap exists
  // to bound (spec §5.4: "cannot produce invalid velocity or permanent capture").
  applyKnockback(kvx, kvy, 0, 1, 0, 900, 0)
  applyKnockback(kvx, kvy, 0, 1, 0, 900, 0)
  applyKnockback(kvx, kvy, 0, 1, 0, 900, 0)
  const mag = Math.hypot(kvx[0], kvy[0])
  assert.ok(Math.abs(mag - MAX_KB_VELOCITY) < 1e-9, `unclamped sum (2700) must be clamped to exactly the cap, got ${mag}`)
  assert.ok(kvx[0] > 0 && kvy[0] === 0, 'clamping rescales magnitude only, direction is unchanged')
})

test('Vortex release power is kept at or below the reserved Water Geyser comparison baseline', () => {
  assert.ok(C.releasePower <= 220, 'must stay at or below displacement.js\'s ASSUMED_VORTEX_RELEASE_POWER')
})
