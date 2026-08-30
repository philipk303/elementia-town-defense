// Firepit (combat-structure redesign §5.1 as revised by Amendment B) — the
// ALWAYS-ON AREA FIELD family.
//
// The first structure in the redesign, and the falsification test for the whole
// plan (Amendment A5 step 2): its skill dependency is ZERO — no facing, no
// direction, no target selection, no timing — so the scripted policy can express
// its purpose in full and a measurement against it is trustworthy.
//
// Behavior: a walkable 2x1 that continuously damages + burns EVERY enemy inside
// its footprint expanded by a heat margin, scaled by the tick delta. No
// nearest-target search, no projectile, no cadence. Amendment B supersedes the
// original fixed-pulse contract; these names must describe the CONTINUOUS
// behavior, because an assertion named for a pulse that verifies a field is
// misleading even when green.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'

const FIREPIT = STRUCTURE_TYPES.FIRE_SPECIAL

function firepitAt(gx, gy, orient = 'H') {
  const cat = BALANCE.STRUCTURES[FIREPIT]
  const w = orient === 'V' ? 1 : 2, h = orient === 'V' ? 2 : 1
  return { id: 1, type: FIREPIT, ownerId: 'p0', gx, gy, w, h, orient, hp: cat.hp, maxHp: cat.hp }
}

function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), livingEnemyCount: 0, waveBounty: 0, fx: [] }
}

// Spawn at an absolute world position so a test can sit an enemy just inside or
// just outside the heat margin.
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC) {
  return store.spawn({ type, elite: false, x, y }, 0)
}

const spec = () => BALANCE.TOWER[FIREPIT]

test('a Firepit damages EVERY enemy standing on its footprint, not just one', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  spawnAt(st.enemyStore, tileToWorldX(5), tileToWorldY(5))
  spawnAt(st.enemyStore, tileToWorldX(6), tileToWorldY(5))

  tickTowers(st, 0, 16.67)

  assert.ok(st.enemyStore.hp[0] < st.enemyStore.maxHp[0], 'first enemy burned')
  assert.ok(st.enemyStore.hp[1] < st.enemyStore.maxHp[1], 'second enemy burned too')
})

test('a Firepit applies burn that outlives contact', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  spawnAt(st.enemyStore, tileToWorldX(5), tileToWorldY(5))

  tickTowers(st, 0, 16.67)

  const status = st.enemyStore.status[0]
  assert.ok(status.burnMs > 0, 'burn applied')
  assert.equal(status.burnDps, spec().burn.dps)
})

test('the heat margin reaches beyond the footprint but not a whole tile', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  // Just outside the footprint's left edge, inside the margin.
  spawnAt(st.enemyStore, tileToWorldX(5) - 16 - spec().marginPx + 1, tileToWorldY(5))
  // A full tile clear of the footprint — must be untouched.
  spawnAt(st.enemyStore, tileToWorldX(3), tileToWorldY(5))

  tickTowers(st, 0, 16.67)

  assert.ok(st.enemyStore.hp[0] < st.enemyStore.maxHp[0], 'enemy in the heat margin is hit')
  assert.equal(st.enemyStore.hp[1], st.enemyStore.maxHp[1], 'enemy a tile away is not')
})

test('a Firepit burns continuously — every tick damages, there is no cadence gap', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  spawnAt(st.enemyStore, tileToWorldX(5), tileToWorldY(5))

  tickTowers(st, 0, 100)
  const afterFirst = st.enemyStore.hp[0]
  assert.ok(afterFirst < st.enemyStore.maxHp[0], 'damaged on the first tick')

  tickTowers(st, 100, 100)
  assert.ok(st.enemyStore.hp[0] < afterFirst, 'and again on the very next tick — always on')
})

test('continuous damage scales with elapsed time, not tick count', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  spawnAt(st.enemyStore, tileToWorldX(5), tileToWorldY(5))

  tickTowers(st, 0, 1000)          // one full second

  const dealt = st.enemyStore.maxHp[0] - st.enemyStore.hp[0]
  assert.ok(Math.abs(dealt - spec().dps) < 1e-9, `one second deals dps (${dealt} vs ${spec().dps})`)
})

test('an enemy overlapping BOTH footprint tiles is charged once per tick, not twice', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  // Straddling the seam between tiles 5 and 6.
  spawnAt(st.enemyStore, tileToWorldX(5) + 16, tileToWorldY(5))
  const before = st.enemyStore.hp[0]

  tickTowers(st, 0, 100)

  assert.ok(Math.abs((before - st.enemyStore.hp[0]) - spec().dps * 0.1) < 1e-9,
    'one tick of dps, not two — the seam does not double-dip')
})

test('a vertical Firepit heats the tile BELOW its anchor', () => {
  const pit = firepitAt(5, 5, 'V')
  const st = makeState([pit])
  spawnAt(st.enemyStore, tileToWorldX(5), tileToWorldY(6))
  spawnAt(st.enemyStore, tileToWorldX(6), tileToWorldY(5))

  tickTowers(st, 0, 16.67)

  assert.ok(st.enemyStore.hp[0] < st.enemyStore.maxHp[0], 'the tile below is inside the pit')
  assert.equal(st.enemyStore.hp[1], st.enemyStore.maxHp[1], 'the tile beside it is not')
})

test('a Firepit has no nearest-target reach — an enemy at watchtower range is safe', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  spawnAt(st.enemyStore, tileToWorldX(5) + 100, tileToWorldY(5))

  tickTowers(st, 0, 16.67)

  assert.equal(st.enemyStore.hp[0], st.enemyStore.maxHp[0])
})

// §8 requires occupancy instrumentation. For an always-on field the meaningful
// unit is ENEMY-SECONDS spent in it, not "targets per activation" — without it a
// weak score cannot be told apart from a field nothing ever walked into, which
// are different problems with different fixes. (Sited on a Watchtower's flank
// list, the pulse version measured 0.073 targets per activation: the declared
// "packed lane" scenario was simply never delivered.)
test('the field records the enemy-seconds it actually held', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  st.aoeStats = { activeTicks: 0, enemySeconds: 0 }
  spawnAt(st.enemyStore, tileToWorldX(5), tileToWorldY(5))
  spawnAt(st.enemyStore, tileToWorldX(6), tileToWorldY(5))

  tickTowers(st, 0, 500)

  assert.equal(st.aoeStats.activeTicks, 1)
  assert.ok(Math.abs(st.aoeStats.enemySeconds - 1.0) < 1e-9, '2 enemies x 0.5 s')
})

// Always-on replaced the pulse cadence entirely (Philip, 2026-07-26), so
// "ready-on-empty" no longer has meaning: an empty footprint costs nothing
// because there is no interval to consume. The defect it was fixing — output
// depending on phase alignment with enemy transit — is gone by construction.

test('an empty footprint costs nothing and does not disturb the field', () => {
  const pit = firepitAt(5, 5)
  const st = makeState([pit])
  st.aoeStats = { activeTicks: 0, enemySeconds: 0 }

  tickTowers(st, 0, 100)

  assert.equal(st.aoeStats.activeTicks, 0)
  assert.equal(st.aoeStats.enemySeconds, 0)
})
