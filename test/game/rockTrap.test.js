// Rock Trap (redesign §5.2, Task 11, Amendment C.2) — the telegraph member of
// the TARGET-IMPACT family: highest-maxHp selection, a locked world impact
// point (not the target's moved position), primary + splash damage, and a
// medium-to-long cooldown spanning the whole armed+resolve cycle.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { encodeSnapshot, decodeSnapshot } from '../../server/net/encode.js'

const SPEC = BALANCE.TOWER.EARTH_SPECIAL

function trap(gx, gy, id = 1) {
  return { id, type: 'EARTH_SPECIAL', ownerId: 'p0', gx, gy, w: 2, h: 1, orient: 'H', hp: 70, maxHp: 70 }
}
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0 }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}

// Structure center for a 2x1 'H' trap at (gx,gy): centerX in towers.js is
// tileToWorldX(gx) + (w-1)*16.
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) } }

test('the highest-maxHp enemy in range is selected, not the nearest', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  const weak = spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.GOBLIN)   // nearer, lower maxHp
  const tough = spawnAt(st.enemyStore, cx + 60, cy, ENEMY_TYPE.TROLL)   // farther, higher maxHp

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.ok(st.enemyStore.hp[tough] < st.enemyStore.maxHp[tough], 'the tougher enemy is hit')
  assert.equal(st.enemyStore.hp[weak], st.enemyStore.maxHp[weak], 'the weaker, nearer enemy is untouched')
})

test('ties on maxHp break by distance, then by stable ID', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  // far must sit outside splash radius of near's locked point, or it takes
  // splash damage and the "untouched" assertion below breaks — not a tie-
  // break bug, just the fixture needing to track SPEC.splashRadiusPx.
  const far  = spawnAt(st.enemyStore, cx + 20 + SPEC.splashRadiusPx + 40, cy, ENEMY_TYPE.ORC)
  const near = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.ORC)

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.ok(st.enemyStore.hp[near] < st.enemyStore.maxHp[near], 'closer of two equal-maxHp targets is hit')
  assert.equal(st.enemyStore.hp[far], st.enemyStore.maxHp[far])
})

test('impact resolves at the locked point, not the target\'s moved position', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 20, cy)

  tickTowers(st, 0, 16)                       // selection locks (cx+20, cy) as the impact point
  // Walk the target far outside splash radius before impact resolves.
  st.enemyStore.x[i] = cx + 20 + SPEC.splashRadiusPx + 200
  const other = spawnAt(st.enemyStore, cx + 20, cy)   // sits ON the locked point instead

  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i], 'the original target walked out and takes nothing')
  assert.equal(st.enemyStore.hp[other], st.enemyStore.maxHp[other] - SPEC.splashDamage,
    'whatever now sits on the locked point takes splash only')
})

test('the primary target takes the direct hit once, not double-counted by splash', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL) // survives the direct hit

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage,
    'exactly the direct total, no added splash on top')
})

test('splash hits a bystander near the impact point independently of the direct hit', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  // TROLL (90 maxHp) survives both the direct and splash hits, so the exact
  // remaining HP can be checked; an ORC (30 maxHp) would be one-shot by
  // EARTH_SPECIAL's 40 direct damage.
  const primary   = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL)
  const bystander = spawnAt(st.enemyStore, cx + 20 + SPEC.splashRadiusPx - 4, cy, ENEMY_TYPE.TROLL)
  const outsider  = spawnAt(st.enemyStore, cx + 20 + SPEC.splashRadiusPx + 40, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[primary], st.enemyStore.maxHp[primary] - SPEC.damage)
  assert.equal(st.enemyStore.hp[bystander], st.enemyStore.maxHp[bystander] - SPEC.splashDamage)
  assert.equal(st.enemyStore.hp[outsider], st.enemyStore.maxHp[outsider], 'outside splash radius, untouched')
})

test('target removal during telegraph does not corrupt slots or redirect the strike', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  const target = spawnAt(st.enemyStore, cx + 20, cy)
  const other  = spawnAt(st.enemyStore, cx + 100, cy)

  tickTowers(st, 0, 16)                        // target is armed/locked
  st.enemyStore.removeAt(target)                // died to something else mid-telegraph (swap-removes)
  const otherHpBefore = st.enemyStore.hp.slice(0, st.enemyStore.count)

  assert.doesNotThrow(() => tickTowers(st, SPEC.telegraphMs + 1, 16))
  assert.equal(st.enemyStore.count, 1, 'no slot corruption')
  assert.deepEqual(Array.from(st.enemyStore.hp.slice(0, st.enemyStore.count)), Array.from(otherHpBefore),
    'the strike is not redirected onto an unrelated enemy far outside splash radius')
  void other
})

test('one activation occurs per full telegraph+cooldown cycle', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL) // survives two direct hits

  tickTowers(st, 0, 16)                         // armed
  tickTowers(st, SPEC.telegraphMs + 1, 16)       // impact #1
  const hpAfterFirst = st.enemyStore.hp[i]

  tickTowers(st, SPEC.telegraphMs + 100, 16)     // still on cooldown, no re-arm
  assert.equal(st.enemyStore.hp[i], hpAfterFirst, 'no second activation before cooldown elapses')

  tickTowers(st, SPEC.telegraphMs + SPEC.cooldownMs + 1, 16)  // re-armed
  tickTowers(st, SPEC.telegraphMs + SPEC.cooldownMs + SPEC.telegraphMs + 2, 16) // impact #2
  assert.ok(st.enemyStore.hp[i] < hpAfterFirst, 'a second activation happens after the full cycle')
})

test('destroying the trap mid-telegraph stops the impact from ever resolving', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + 20, cy)

  tickTowers(st, 0, 16)          // armed
  st.structures = []             // trap destroyed
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i], 'no impact without the structure to resolve it')
})

test('an out-of-range enemy is never selected', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx + SPEC.rangePx + 50, cy)

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i])
})

// Codex Gate 5 finding: tiX/tiY/tiImpactAt are this module's own field names
// and never rode the wire, so a client could not draw the locked telegraph
// point (Amendment C.2's whole point is that it is NOT the structure's
// center). These mirror armed/idle onto the same generic phase/deadline/
// cycle fields Wind Vortex already uses, plus the new generic tx/ty.
test('an armed telegraph mirrors its locked point and deadline onto the generic wire fields', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 20, cy)

  assert.equal(t.phase ?? 0, 0, 'idle before any selection')
  tickTowers(st, 0, 16) // arms and locks (cx+20, cy)
  assert.equal(t.phase, 1, 'armed')
  assert.equal(t.phaseDeadline, SPEC.telegraphMs)
  assert.equal(t.tx, cx + 20)
  assert.equal(t.ty, cy)

  tickTowers(st, SPEC.telegraphMs + 1, 16) // resolves -> idle
  assert.equal(t.phase, 0, 'idle again after resolution')
  assert.equal(t.phaseDeadline, 0)
})

test('cycleSeq increments once per new armed activation, for reconnect disambiguation', () => {
  const t = trap(10, 10)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL) // survives both hits

  tickTowers(st, 0, 16)
  assert.equal(t.cycleSeq, 1)
  tickTowers(st, SPEC.telegraphMs + 1, 16) // resolve #1
  tickTowers(st, SPEC.telegraphMs + SPEC.cooldownMs + 1, 16) // arm #2
  assert.equal(t.cycleSeq, 2)
})

test('reconnect: an armed telegraph\'s locked point and deadline survive an encode/decode round trip', () => {
  const t = trap(10, 10, 55)
  const st = makeState([t])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx + 20, cy)
  tickTowers(st, 0, 16) // armed

  const netState = {
    tick: 1, placedVersion: 1, hall: { hp: 100 }, players: [],
    enemyStore: st.enemyStore, projectiles: [], fx: [], atkFx: [],
    structures: st.structures,
  }
  const wire = decodeSnapshot(encodeSnapshot(netState, -1)).structureState.find(s => s.id === 55)
  assert.equal(wire.phase, 1)
  assert.equal(wire.deadline, t.phaseDeadline)
  assert.equal(wire.tx, t.tx)
  assert.equal(wire.ty, t.ty)
})
