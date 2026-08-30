// Water Geyser (redesign §5.3, Task 11) — the DISPLACEMENT member of the
// TARGET-IMPACT family (spec §3 family 2): footprint-only selection, medium
// damage, then a weight-scaled launch in the structure's locked cardinal
// `dir`. Resolves instantly like Watchtower — no telegraph.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY, TILE_SIZE } from '../../server/game/grid.js'
import { applyKnockback } from '../../server/game/enemyMove.js'
import { ASSUMED_VORTEX_RELEASE_POWER } from '../../server/game/structureBehaviors/displacement.js'

const SPEC = BALANCE.TOWER.WATER_SPECIAL

function geyser(gx, gy, dir, id = 1) {
  return { id, type: 'WATER_SPECIAL', ownerId: 'p0', gx, gy, w: 2, h: 1, orient: 'H', dir, hp: 70, maxHp: 70 }
}
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0 }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}
function centerOf(gx, gy) { return { cx: tileToWorldX(gx) + 16, cy: tileToWorldY(gy) } }
// Exact footprint of a 2x1 'H' structure at (gx,gy): towers.js's areaRect with
// margin 0, i.e. the two tiles' edges with no expansion.
function footprintOf(gx, gy) {
  const x0 = tileToWorldX(gx) - 16, y0 = tileToWorldY(gy) - 16
  return { x0, y0, x1: x0 + 2 * 32, y1: y0 + 32 }
}

test('exactly one enemy overlapping the footprint is selected and hit', () => {
  const g = geyser(10, 10, 'S')
  const st = makeState([g])
  const rect = footprintOf(10, 10)
  const i = spawnAt(st.enemyStore, rect.x0 + 5, rect.y0 + 5)
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage)
})

test('an enemy outside the footprint (but still in general vicinity) is not selected', () => {
  const g = geyser(10, 10, 'S')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy - TILE_SIZE) // one tile above the footprint
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i])
})

test('selection under simultaneous footprint entry is deterministic: nearest center, tie by stable ID', () => {
  const g = geyser(10, 10, 'S')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const rect = footprintOf(10, 10)
  const far  = spawnAt(st.enemyStore, rect.x0 + 2, cy)         // near the left edge, farther from center
  const near = spawnAt(st.enemyStore, cx + 2, cy)              // right at center
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[near], st.enemyStore.maxHp[near] - SPEC.damage, 'nearest to center is picked')
  assert.equal(st.enemyStore.hp[far], st.enemyStore.maxHp[far])
})

test('a tie at equal distance from center breaks by ascending stable ID', () => {
  const g = geyser(10, 10, 'S')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const first  = spawnAt(st.enemyStore, cx - 5, cy)
  const second = spawnAt(st.enemyStore, cx + 5, cy)
  assert.ok(st.enemyStore.id[first] < st.enemyStore.id[second])
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[first], st.enemyStore.maxHp[first] - SPEC.damage, 'lower stable id wins the tie')
  assert.equal(st.enemyStore.hp[second], st.enemyStore.maxHp[second])
})

test('damage and displacement occur exactly once per activation', () => {
  const g = geyser(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy)

  tickTowers(st, 0, 16)
  const hpAfterFirst = st.enemyStore.hp[i]
  const kvxAfterFirst = st.enemyStore.kvx[i]

  tickTowers(st, 10, 16) // still on cooldown
  assert.equal(st.enemyStore.hp[i], hpAfterFirst, 'no second activation before cooldown elapses')
  assert.equal(st.enemyStore.kvx[i], kvxAfterFirst, 'velocity not applied twice')
})

test('the launch direction matches the structure\'s locked cardinal', () => {
  const eastG = geyser(10, 10, 'E', 1)
  const stE = makeState([eastG])
  const { cx: cxE, cy: cyE } = centerOf(10, 10)
  const iE = spawnAt(stE.enemyStore, cxE, cyE)
  tickTowers(stE, 0, 16)
  assert.ok(stE.enemyStore.kvx[iE] > 0, 'east launch is +x')
  assert.equal(stE.enemyStore.kvy[iE], 0)

  const southG = geyser(20, 20, 'S', 2)
  const stS = makeState([southG])
  const { cx: cxS, cy: cyS } = centerOf(20, 20)
  const iS = spawnAt(stS.enemyStore, cxS, cyS)
  tickTowers(stS, 0, 16)
  assert.ok(stS.enemyStore.kvy[iS] > 0, 'south launch is +y')
  assert.equal(stS.enemyStore.kvx[iS], 0)
})

test('launch is velocity, not teleportation: position is unchanged the instant it is applied', () => {
  const g = geyser(10, 10, 'N')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy)
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.x[i], cx, 'x unchanged — collision/integrate applies velocity over ticks')
  assert.equal(st.enemyStore.y[i], cy, 'y unchanged for the same reason')
  assert.ok(st.enemyStore.kvy[i] < 0, 'but the launch velocity is queued')
})

test('a light enemy travels farther than a heavy one at the same power (weight scaling)', () => {
  const makeSingle = (type) => {
    const g = geyser(10, 10, 'E')
    const st = makeState([g])
    const { cx, cy } = centerOf(10, 10)
    const i = spawnAt(st.enemyStore, cx, cy, type)
    tickTowers(st, 0, 16)
    return st.enemyStore.kvx[i]
  }
  const light = makeSingle(ENEMY_TYPE.GOBLIN)
  const heavy = makeSingle(ENEMY_TYPE.TROLL)
  assert.ok(light > heavy, 'lighter enemy gets more launch velocity than a heavier one')
})

test('a super-heavy elite troll takes damage but is not displaced', () => {
  const g = geyser(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.TROLL, true) // super-heavy
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[i], st.enemyStore.maxHp[i] - SPEC.damage, 'damage still lands')
  assert.equal(st.enemyStore.kvx[i], 0, 'but displacement is fully resisted')
})

test('the cooldown is consumed even when the launch damage kills the target', () => {
  const g = geyser(10, 10, 'E')
  const st = makeState([g])
  const { cx, cy } = centerOf(10, 10)
  const i = spawnAt(st.enemyStore, cx, cy, ENEMY_TYPE.GOBLIN)
  st.enemyStore.hp[i] = 1 // below Geyser damage

  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.count, 0, 'target died')

  const other = spawnAt(st.enemyStore, cx, cy)
  tickTowers(st, 10, 16) // still within cooldown window
  assert.equal(st.enemyStore.hp[other], st.enemyStore.maxHp[other], 'no activation until cooldown elapses')
})

test('an empty footprint costs nothing and stays ready', () => {
  const g = geyser(10, 10, 'E')
  const st = makeState([g])
  tickTowers(st, 0, 16)
  const other = spawnAt(st.enemyStore, tileToWorldX(10), tileToWorldY(10))
  tickTowers(st, 10, 16)
  assert.equal(st.enemyStore.hp[other], st.enemyStore.maxHp[other] - SPEC.damage,
    'an empty first tick did not consume the cooldown')
})

test('equal-weight Geyser release exceeds the reserved Wind Vortex release baseline', () => {
  assert.ok(SPEC.displace.power > ASSUMED_VORTEX_RELEASE_POWER,
    'Geyser must substantially exceed Vortex release at equal weight (spec §5.3)')

  const kvx = new Float64Array(1), kvy = new Float64Array(1)
  const geyserMag = applyKnockback(kvx, kvy, 0, 1, 0, SPEC.displace.power, 1 /* medium */)
  kvx[0] = 0
  const vortexMag = applyKnockback(kvx, kvy, 0, 1, 0, ASSUMED_VORTEX_RELEASE_POWER, 1 /* medium */)
  assert.ok(geyserMag > vortexMag, 'at the same weight tier, Geyser produces strictly more launch velocity')
})
