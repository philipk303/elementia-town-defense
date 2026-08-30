import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tileToWorldX, tileToWorldY, TILE_SIZE } from '../../server/game/grid.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { EnemyStore } from '../../server/game/enemies.js'
import { speedMultiplier } from '../../server/game/status.js'
import { tickTowers } from '../../server/game/towers.js'

const TOWER = BALANCE.TOWER

let sid = 0
function tower(type, gx, gy) {
  return { id: sid++, type, ownerId: 'x', gx, gy, w: 1, h: 1, hp: 100, maxHp: 100, dormant: false, createdAt: 0, attackReadyAt: 0 }
}
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0, fx: [] }
}
// Spawn an enemy `pxAway` px to the right of the tower at (gx,gy).
function spawnNear(store, gx, gy, pxAway, spec) {
  return store.spawn({ ...spec, x: tileToWorldX(gx) + pxAway, y: tileToWorldY(gy) }, 0)
}

test('a watchtower damages the nearest in-range enemy on its cooldown', () => {
  const t = tower('WATCHTOWER', 10, 10)
  const st = makeState([t])
  const i = spawnNear(st.enemyStore, 10, 10, 20, { type: ENEMY_TYPE.ORC, elite: false })
  const hp0 = st.enemyStore.hp[i]
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[i], hp0 - TOWER.WATCHTOWER.damage)
})

test('an out-of-range enemy is never hit', () => {
  const t = tower('WATCHTOWER', 10, 10)
  const st = makeState([t])
  const i = spawnNear(st.enemyStore, 10, 10, TOWER.WATCHTOWER.rangePx + TILE_SIZE, { type: ENEMY_TYPE.ORC, elite: false })
  const hp0 = st.enemyStore.hp[i]
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[i], hp0, 'nothing in range → no shot')
})

test('the tower respects its cooldown between shots', () => {
  const t = tower('WATCHTOWER', 10, 10)
  const st = makeState([t])
  const i = spawnNear(st.enemyStore, 10, 10, 20, { type: ENEMY_TYPE.ORC, elite: false })
  tickTowers(st, 0, 16)
  const hpAfterOne = st.enemyStore.hp[i]
  tickTowers(st, 10, 16)                                   // still on cooldown
  assert.equal(st.enemyStore.hp[i], hpAfterOne, 'no second shot before cooldown')
  tickTowers(st, TOWER.WATCHTOWER.cooldownMs + 1, 16)      // cooldown elapsed
  assert.equal(st.enemyStore.hp[i], hpAfterOne - TOWER.WATCHTOWER.damage)
})

test('a lethal shot removes the enemy and accrues its bounty', () => {
  const t = tower('WATCHTOWER', 10, 10)
  const st = makeState([t])
  const i = spawnNear(st.enemyStore, 10, 10, 20, { type: ENEMY_TYPE.GOBLIN, elite: false })
  st.enemyStore.hp[i] = 3                                  // below watchtower damage (6)
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.count, 0)
  assert.equal(st.waveBounty, BALANCE.ENEMY.BASE[0].bounty)
})

test('the nearest of several in-range enemies is targeted', () => {
  const t = tower('WATCHTOWER', 10, 10)
  const st = makeState([t])
  const far  = spawnNear(st.enemyStore, 10, 10, 100, { type: ENEMY_TYPE.ORC, elite: false })
  const near = spawnNear(st.enemyStore, 10, 10, 20,  { type: ENEMY_TYPE.ORC, elite: false })
  const farHp0 = st.enemyStore.hp[far], nearHp0 = st.enemyStore.hp[near]
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[far], farHp0, 'the far enemy is untouched')
  assert.equal(st.enemyStore.hp[near], nearHp0 - TOWER.WATCHTOWER.damage)
})

test('among equidistant in-range enemies, the watchtower targets the lower stable ID', () => {
  // Both enemies sit at the same distance so raw scan order alone cannot
  // disambiguate them; only the id[] tie-break (Task 10) makes this
  // deterministic across swap-removal reordering elsewhere in the tick.
  const t = tower('WATCHTOWER', 10, 10)
  const st = makeState([t])
  const cx = tileToWorldX(10), cy = tileToWorldY(10)
  const first  = st.enemyStore.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: cx, y: cy - 20 }, 0)
  const second = st.enemyStore.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: cx, y: cy + 20 }, 0)
  assert.ok(st.enemyStore.id[first] < st.enemyStore.id[second], 'first spawned has the lower id')
  const firstHp0 = st.enemyStore.hp[first], secondHp0 = st.enemyStore.hp[second]

  tickTowers(st, 0, 16)

  assert.equal(st.enemyStore.hp[first], firstHp0 - TOWER.WATCHTOWER.damage, 'lower stable id is hit')
  assert.equal(st.enemyStore.hp[second], secondHp0, 'higher stable id is spared on a tie')
})

test('a snare post applies a slow without dealing damage', () => {
  const t = tower('SNARE_POST', 10, 10)
  const st = makeState([t])
  const i = spawnNear(st.enemyStore, 10, 10, 20, { type: ENEMY_TYPE.ORC, elite: false })
  const hp0 = st.enemyStore.hp[i]
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[i], hp0, 'snare post does no damage')
  assert.ok(speedMultiplier(st.enemyStore.status[i]) < 1, 'the enemy is slowed')
})

test('a fire special ignites the target (burn)', () => {
  const t = tower('FIRE_SPECIAL', 10, 10)
  const st = makeState([t])
  const i = spawnNear(st.enemyStore, 10, 10, 20, { type: ENEMY_TYPE.ORC, elite: false })
  tickTowers(st, 0, 16)
  assert.ok(st.enemyStore.status[i].burnMs > 0, 'target is burning')
})

// MUDDY_BOG and GRINDER left this file in Task 15 when they moved onto their
// own runtime families (structureBehaviors/areaEntry.js and .../cycle.js).
// Their generic nearest-target tests here described mechanics that no longer
// exist — a per-tick "one shot" cadence and a standalone pull — and passed
// only coincidentally. Coverage now lives in muddyBog.test.js and
// grinder.test.js. Same precedent as Rock Trap, Water Geyser, Wind Vortex and
// Blizzard leaving this file for dedicated suites.

test('non-offensive structures (walls, farms) never fire', () => {
  const st = makeState([tower('BARRICADE', 10, 10), tower('FARM', 11, 10)])
  const i = spawnNear(st.enemyStore, 10, 10, 15, { type: ENEMY_TYPE.GOBLIN, elite: false })
  const hp0 = st.enemyStore.hp[i]
  tickTowers(st, 0, 16)
  assert.equal(st.enemyStore.hp[i], hp0)
  assert.equal(st.enemyStore.status[i].slowMs, 0)
})
