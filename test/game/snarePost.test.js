// Snare Post (redesign §4.2, Task 10) — the true-aura family. A bounded
// fixed-cadence circular slow, distinct from Firepit's always-on field
// (Amendment B binds only that family): every `cadenceMs`, every enemy inside
// `radiusPx` of the post's centre gets its slow refreshed. No damage, no
// target search.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { SPEED } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { speedMultiplier, tickStatus, effectiveSlowFactor, scaledDurationMs } from '../../server/game/status.js'

const SPEC = BALANCE.TOWER.SNARE_POST

function post(gx, gy, id = 1) {
  return { id, type: 'SNARE_POST', ownerId: 'p0', gx, gy, w: 1, h: 1, hp: 30, maxHp: 30 }
}
function makeState(structures) {
  return { structures, enemyStore: new EnemyStore(), waveBounty: 0 }
}
function spawnAt(store, x, y, type = ENEMY_TYPE.ORC, elite = false) {
  return store.spawn({ type, elite, x, y }, 0)
}

test('every enemy inside the aura is slowed, none outside', () => {
  const p = post(10, 10)
  const st = makeState([p])
  const inside = spawnAt(st.enemyStore, tileToWorldX(10), tileToWorldY(10))
  const outside = spawnAt(st.enemyStore, tileToWorldX(10) + SPEC.radiusPx + 20, tileToWorldY(10))

  tickTowers(st, 0, 16)

  assert.ok(speedMultiplier(st.enemyStore.status[inside]) < 1, 'inside is slowed')
  assert.equal(speedMultiplier(st.enemyStore.status[outside]), 1, 'outside is untouched')
})

test('a snare post never deals damage, even over many ticks', () => {
  const p = post(10, 10)
  const st = makeState([p])
  const i = spawnAt(st.enemyStore, tileToWorldX(10), tileToWorldY(10))
  const hp0 = st.enemyStore.hp[i]

  let now = 0
  for (let k = 0; k < 20; k++) { tickTowers(st, now, 50); now += 50 }

  assert.equal(st.enemyStore.hp[i], hp0)
})

test('the slow lingers briefly after the enemy leaves the aura', () => {
  const p = post(10, 10)
  const st = makeState([p])
  const i = spawnAt(st.enemyStore, tileToWorldX(10), tileToWorldY(10))

  tickTowers(st, 0, 16)                                    // refreshed while inside
  assert.ok(speedMultiplier(st.enemyStore.status[i]) < 1)

  st.enemyStore.x[i] = tileToWorldX(10) + SPEC.radiusPx + 100  // teleport well outside
  tickTowers(st, 16, 16)                                    // no refresh this tick

  assert.ok(speedMultiplier(st.enemyStore.status[i]) < 1, 'still slowed just after leaving')
})

test('a super-fast elite resists the slow like any other slow source', () => {
  const p = post(10, 10)
  const st = makeState([p])
  const i = spawnAt(st.enemyStore, tileToWorldX(10), tileToWorldY(10), ENEMY_TYPE.GOBLIN, true) // super-fast

  tickTowers(st, 0, 16)

  assert.equal(speedMultiplier(st.enemyStore.status[i]), 1, 'super-fast is immune')
})

test('two overlapping posts refresh the strongest slow, not stacked multipliers', () => {
  const p1 = post(10, 10, 1)
  const p2 = post(11, 10, 2) // adjacent tile — footprints overlap in reach
  const st = makeState([p1, p2])
  const i = spawnAt(st.enemyStore, tileToWorldX(10) + 16, tileToWorldY(10)) // between the two

  tickTowers(st, 0, 16)

  const expected = effectiveSlowFactor(SPEC.slow.factor, SPEED.MEDIUM)   // ORC's tier
  const factorAfterBoth = st.enemyStore.status[i].slowFactor
  assert.ok(Math.abs(factorAfterBoth - expected) < 1e-9,
    'the single configured slow factor wins as-is')
  assert.notEqual(factorAfterBoth, expected * expected,
    'two posts must not multiply their factors together')
})

test('destroying the post stops refreshes without cleansing the existing slow', () => {
  const p = post(10, 10)
  const st = makeState([p])
  const i = spawnAt(st.enemyStore, tileToWorldX(10), tileToWorldY(10))

  tickTowers(st, 0, 16)
  assert.ok(speedMultiplier(st.enemyStore.status[i]) < 1, 'slowed while the post lives')

  st.structures = []                                        // post destroyed
  tickTowers(st, 16, 16)                                    // no-op: nothing left to refresh
  assert.ok(speedMultiplier(st.enemyStore.status[i]) < 1, 'slow still active immediately after destruction')

  // tickTowers never advances status timers itself (that's tickEnemies's job);
  // drive the countdown directly to prove the lapse comes from the slow's own
  // duration, not from anything the post is still doing.
  const remainingMs = scaledDurationMs(SPEC.slow.ms, SPEED.MEDIUM)       // ORC's tier
  tickStatus(st.enemyStore.status[i], remainingMs + 1)
  assert.equal(speedMultiplier(st.enemyStore.status[i]), 1, 'slow eventually lapses with no refresh source')
})

test('the aura respects its own cadence, not every-tick refresh', () => {
  const p = post(10, 10)
  const st = makeState([p])
  const i = spawnAt(st.enemyStore, tileToWorldX(10), tileToWorldY(10))

  tickTowers(st, 0, 16)
  const readyAfterFirst = p.auraReadyAt
  tickTowers(st, 16, 16)                                    // well inside the cadence window
  assert.equal(p.auraReadyAt, readyAfterFirst, 'no second refresh scheduled before cadenceMs elapses')
})
