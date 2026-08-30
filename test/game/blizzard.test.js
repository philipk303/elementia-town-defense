// Blizzard (redesign §6.5, Amendment C.3, Task 14) — joins the TARGET-IMPACT
// family (structureBehaviors/targetImpact.js) with densest-cluster
// selection and a uniform (no primary/splash split) locked-point AoE.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { encodeSnapshot, decodeSnapshot } from '../../server/net/encode.js'

const SPEC = BALANCE.TOWER.BLIZZARD
const ROCK_TRAP_SPEC = BALANCE.TOWER.EARTH_SPECIAL

function blizzard(gx, gy, id = 1) {
  return { id, type: 'BLIZZARD', ownerId: null, gx, gy, w: 2, h: 2, orient: 'H', hp: 90, maxHp: 90 }
}
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0, fx: [] }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) + 16 } }

test('acquisition radius exceeds Rock Trap\'s', () => {
  assert.ok(SPEC.rangePx > ROCK_TRAP_SPEC.rangePx, 'spec: "larger circular acquisition area than Rock Trap"')
})

test('the densest cluster is selected over a lone, closer enemy', () => {
  const b = blizzard(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  // A lone enemy sits close to center; a tight trio of three sits farther out.
  const lone = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL)
  const c1 = spawnAt(st.enemyStore, cx + 100, cy, ENEMY_TYPE.TROLL)
  const c2 = spawnAt(st.enemyStore, cx + 100 + 10, cy, ENEMY_TYPE.TROLL)
  const c3 = spawnAt(st.enemyStore, cx + 100, cy + 10, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[lone], st.enemyStore.maxHp[lone], 'the lone, closer enemy is untouched')
  for (const i of [c1, c2, c3]) {
    assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage, 'the dense trio is hit')
  }
})

test('dense-cluster targeting is deterministic: ties break by distance then stable ID', () => {
  const b = blizzard(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  // Two isolated singleton "clusters" (size 1 each) at different distances:
  // ties on cluster size break by distance to center.
  const near = spawnAt(st.enemyStore, cx + 20, cy, ENEMY_TYPE.TROLL)
  const far  = spawnAt(st.enemyStore, cx + 150, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[near], st.enemyStore.maxHp[near] - SPEC.damage, 'closer singleton wins the tie')
  assert.equal(st.enemyStore.hp[far], st.enemyStore.maxHp[far])
})

test('every enemy inside the impact circle takes damage and one freeze application', () => {
  const b = blizzard(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const a = spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)
  const b2 = spawnAt(st.enemyStore, cx - 10, cy, ENEMY_TYPE.TROLL)
  const outsider = spawnAt(st.enemyStore, cx + SPEC.clusterRadiusPx + 50, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  for (const i of [a, b2]) {
    assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage)
    assert.ok(st.enemyStore.status[i].freezeMs > 0, 'freeze applied')
  }
  assert.equal(st.enemyStore.hp[outsider], st.enemyStore.maxHp[outsider], 'outside the impact circle, untouched')
})

test('visual spike overlap cannot multiply hits: one resolution, one hit per enemy', () => {
  const b = blizzard(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage, 'exactly one hit, not stacked per spike')
})

test('a locked world point, not a tracked target: the selected enemy walking away before impact does not save it', () => {
  const b = blizzard(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)                          // locks the cluster-center point at (cx, cy)
  st.enemyStore.x[i] = cx + SPEC.clusterRadiusPx + 200   // walks well outside before impact
  const other = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)  // now sits on the locked point

  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i], 'the original pick walked out and takes nothing')
  assert.equal(st.enemyStore.hp[other], st.enemyStore.maxHp[other] - SPEC.damage,
    'whatever now sits on the locked point is hit instead — there is no tracked target to lose')
})

test('target death during telegraph does not corrupt slots or waste the activation', () => {
  const b = blizzard(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const picked = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  const bystander = spawnAt(st.enemyStore, cx + 10, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)
  st.enemyStore.removeAt(picked)   // died to something else mid-telegraph (swap-removes)

  assert.doesNotThrow(() => tickTowers(st, SPEC.telegraphMs + 1, 16))
  assert.equal(st.enemyStore.count, 1, 'no slot corruption')
  assert.equal(st.enemyStore.hp[0], st.enemyStore.maxHp[0] - SPEC.damage, 'the point still resolves against whatever remains in range')
  void bystander
})

test('destruction during telegraph stops the impact from ever resolving', () => {
  const b = blizzard(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)

  tickTowers(st, 0, 16)     // armed
  st.structures = []        // destroyed
  tickTowers(st, SPEC.telegraphMs + 1, 16)

  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i], 'no impact without the structure to resolve it')
})

test('one activation occurs per full telegraph+cooldown cycle', () => {
  const b = blizzard(10, 10)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL) // survives repeated hits

  tickTowers(st, 0, 16)
  tickTowers(st, SPEC.telegraphMs + 1, 16)
  const hpAfterFirst = st.enemyStore.hp[i]

  tickTowers(st, SPEC.telegraphMs + 100, 16)   // still on cooldown
  assert.equal(st.enemyStore.hp[i], hpAfterFirst, 'no second activation before cooldown elapses')

  tickTowers(st, SPEC.telegraphMs + SPEC.cooldownMs + 1, 16)
  tickTowers(st, SPEC.telegraphMs + SPEC.cooldownMs + SPEC.telegraphMs + 2, 16)
  assert.ok(st.enemyStore.hp[i] < hpAfterFirst, 'a second activation happens after the full cycle')
})

test('reconnect: an armed telegraph\'s locked point and deadline survive an encode/decode round trip', () => {
  const b = blizzard(10, 10, 66)
  const st = makeState([b])
  const { cx, cy } = centerOf(10, 10)
  spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL)
  tickTowers(st, 0, 16) // armed

  const netState = {
    tick: 1, placedVersion: 1, hall: { hp: 100 }, players: [],
    enemyStore: st.enemyStore, projectiles: [], fx: [], atkFx: [],
    structures: st.structures,
  }
  const wire = decodeSnapshot(encodeSnapshot(netState, -1)).structureState.find(s => s.id === 66)
  assert.equal(wire.phase, 1)
  assert.equal(wire.deadline, b.phaseDeadline)
  assert.equal(wire.tx, b.tiX)
  assert.equal(wire.ty, b.tiY)
})
