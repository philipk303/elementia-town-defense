// Task 2 (staged combat redesign program) — named simulation safety budgets.
// BALANCE.LIMITS are frozen headroom figures, not enforced caps: nothing in
// the sim clamps against them yet (that is later runtime work). These tests
// pin the numbers themselves and check that the CURRENT, unenforced design
// already lives comfortably inside the assumed regime — a regression tripwire
// for later tasks, not a behavior change.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BALANCE } from '../../shared/balance.js'
import { FX_CAP_PER_TYPE } from '../../server/net/encode.js'
import { EnemyStore } from '../../server/game/enemies.js'
import { tickTowers } from '../../server/game/towers.js'
import { spawnProjectile, tickProjectiles } from '../../server/game/projectiles.js'
import { tileToWorldX, tileToWorldY, TILES_W, TILES_H } from '../../server/game/grid.js'
import { mulberry32 } from '../../shared/rng.js'

const DT = 1000 / 60

test('BALANCE.LIMITS is the frozen contract Task 2 defines', () => {
  assert.equal(BALANCE.LIMITS.MAX_STRUCTURE_EFFECTS, 64)
  assert.equal(BALANCE.LIMITS.MAX_PROJECTILES, 64)
  assert.equal(BALANCE.LIMITS.MAX_FX_PER_TYPE_PER_TICK, 8)
})

test('the wire encoder\'s FX cap has not silently diverged from BALANCE.LIMITS', () => {
  assert.equal(FX_CAP_PER_TYPE, BALANCE.LIMITS.MAX_FX_PER_TYPE_PER_TICK)
})

// One Fire player is the only source of BALANCE.PROJECTILE entries today
// (FIREBALL). Fire continuously, back-to-back at the ability's own cooldown,
// for well past its flight time, and track the peak number of simultaneously
// in-flight projectiles — the actual concurrency the live game can produce.
test('realistic continuous Fireball fire stays well under the projectile budget', () => {
  const state = { projectiles: [], fx: [], enemyStore: new EnemyStore(), players: [], settings: { friendlyFire: false } }
  const FB = BALANCE.PROJECTILE.FIREBALL
  const cooldownMs = BALANCE.ABILITY.FIRE.SPECIAL.cooldownMs
  const flightMs = (FB.maxRangePx / FB.speedPx) * 1000
  const durationMs = flightMs * 4 + cooldownMs * 4   // several full cast/flight cycles
  let peak = 0
  let nextCastAt = 0
  for (let t = 0; t < durationMs; t += DT) {
    if (t >= nextCastAt) {
      spawnProjectile(state, {
        type: 'FIREBALL', ownerId: 'p1', x: 0, y: 0, dirX: 1, dirY: 0,
        damage: FB.damage, burn: BALANCE.ABILITY.FIRE.SPECIAL.burn,
      })
      nextCastAt = t + cooldownMs
    }
    tickProjectiles(state, t, DT)
    if (state.projectiles.length > peak) peak = state.projectiles.length
  }
  assert.ok(peak < BALANCE.LIMITS.MAX_PROJECTILES,
    `peak concurrent Fireballs (${peak}) must stay under the budget (${BALANCE.LIMITS.MAX_PROJECTILES})`)
})

// Realistic wave-10 peak (~78 enemies, see BALANCE.ENEMY.MAX's comment) spread
// uniformly across the full 40x23 grid, with a single-digit count of Firepits
// (the spec's own "single-digit field count per match" assumption) sited at
// fixed points. Uniform placement understates real funnel clustering at any
// one instant but overstates simultaneous occupancy versus reality (a wave
// queues through a choke over time; it never stacks all 78 at once) — a
// reasonable stand-in absent a full maze-march simulation.
test('a realistic worst-case enemy count against single-digit Firepits stays under the structure-effect budget', () => {
  const FIREPIT_COUNT = 8
  const ENEMY_COUNT = 78
  const rng = mulberry32(0xF12E91)
  const store = new EnemyStore()
  for (let i = 0; i < ENEMY_COUNT; i++) {
    store.spawn({ type: 0, elite: false, x: rng() * TILES_W * 32, y: rng() * TILES_H * 32 }, 0)
  }
  const structures = []
  for (let i = 0; i < FIREPIT_COUNT; i++) {
    const gx = 2 + Math.floor(rng() * (TILES_W - 4))
    const gy = 2 + Math.floor(rng() * (TILES_H - 4))
    structures.push({ id: i, type: 'FIRE_SPECIAL', gx, gy, w: 2, h: 1, hp: 100, maxHp: 100, dormant: false })
  }
  const aoeStats = { activeTicks: 0, enemySeconds: 0 }
  const state = { enemyStore: store, structures, aoeStats, fx: [] }
  tickTowers(state, 1000, DT)
  const held = aoeStats.enemySeconds / (DT / 1000)   // one tick: enemySeconds = held * dtSec exactly
  assert.ok(held <= BALANCE.LIMITS.MAX_STRUCTURE_EFFECTS,
    `${held} enemies simultaneously in a Firepit footprint exceeds the budget (${BALANCE.LIMITS.MAX_STRUCTURE_EFFECTS})`)
})
