import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ELEMENTS, CONFIG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { createGameState } from '../../server/game/state.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { MAX_STEP_PX } from '../../server/game/enemyMove.js'
import { spawnProjectile, tickProjectiles } from '../../server/game/projectiles.js'

const FB = BALANCE.PROJECTILE.FIREBALL
const DT = 1000 / 60

function makeState(settings = {}) {
  const state = createGameState({
    players: ELEMENTS.map((el, i) => ({ id: `p${i}`, element: el, displayName: el, isBot: i > 0 })),
    settings: { timingStyle: 'fixed', friendlyFire: false, ...settings },
  }, 42)
  state.phase = PHASES.FIGHT
  for (const p of state.players) { p.x = 1200; p.y = 700 }  // out of the way
  return state
}

function fireball(state, over = {}) {
  return spawnProjectile(state, {
    type: 'FIREBALL', ownerId: 'p1',
    x: 200, y: 200, dirX: 1, dirY: 0,
    damage: 22, burn: { dps: 6, ms: 2500 },
    ffShove: BALANCE.ABILITY.FIRE.SPECIAL.ffShove,   // matches how trySpecial calls this in production
    ...over,
  })
}

test('projectile flies along its direction at the balance speed, step-clamped', () => {
  const s = makeState()
  const pr = fireball(s)
  tickProjectiles(s, 1000, DT)
  const step = FB.speedPx * DT / 1000
  assert.ok(Math.abs(pr.x - (200 + step)) < 1e-9)
  assert.equal(pr.y, 200)
  assert.ok(step < MAX_STEP_PX, 'per-tick flight stays under the tunneling clamp')
})

test('projectile detonates on the first enemy hit: AoE damage + burn + aggro to owner', () => {
  const s = makeState()
  const store = s.enemyStore
  const hit = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 240, y: 200 }, 0)
  // Detonation lands at the contact point ~(hitRadius + orc radius) BEFORE the
  // first enemy's center — place the aoe probe relative to that, not to 240.
  const near = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 240 + 18, y: 200 }, 0)
  const far = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 240 + FB.aoeRadiusPx + 60, y: 200 }, 0)
  const hp0 = store.hp[hit]
  fireball(s)
  for (let t = 0; t < 30 && s.projectiles.length; t++) tickProjectiles(s, 1000 + t * DT, DT)
  assert.equal(s.projectiles.length, 0, 'consumed on impact')
  assert.equal(store.hp[hit], hp0 - 22)
  assert.equal(store.hp[near], hp0 - 22, 'aoe caught the nearby enemy')
  assert.equal(store.hp[far], hp0, 'outside the aoe untouched')
  assert.ok(store.status[hit].burnMs > 0, 'burn applied')
  assert.equal(store.aggro[hit].targetId, 'p1', 'damage aggro pulls toward the owner')
})

test('projectile expiring at max range still detonates its AoE there', () => {
  const s = makeState()
  const store = s.enemyStore
  const atRange = store.spawn({
    type: ENEMY_TYPE.TROLL, elite: false,
    x: 200 + FB.maxRangePx + 10, y: 200 + FB.aoeRadiusPx - 6,
  }, 0)
  const hp0 = store.hp[atRange]
  fireball(s)
  for (let t = 0; t < 120 && s.projectiles.length; t++) tickProjectiles(s, 1000 + t * DT, DT)
  assert.equal(s.projectiles.length, 0, 'expired at max range')
  assert.ok(store.hp[atRange] < hp0, 'expiry detonation caught the enemy near the landing point')
})

test('FF off: teammates in the blast are untouched; FF on: shoved (never damaged — 2026-07-19 amendment)', () => {
  for (const ff of [false, true]) {
    const s = makeState({ friendlyFire: ff })
    const mate = s.players[2]
    mate.x = 260; mate.y = 200
    const store = s.enemyStore
    store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 250, y: 200 }, 0)
    const hp0 = mate.hp
    fireball(s)
    for (let t = 0; t < 30 && s.projectiles.length; t++) tickProjectiles(s, 1000 + t * DT, DT)
    assert.equal(mate.hp, hp0, 'FF never damages teammates, on or off')
    if (ff) assert.ok(mate.kvx !== 0 || mate.kvy !== 0, 'FF on: teammate shoved by the ffShove component')
    else    assert.equal(mate.kvx, 0, 'FF off: no displacement')
  }
})

test('FF on: the caster is never hit by their own projectile blast (CP3 H1)', () => {
  // The owner stands inside their own Fireball's splash. Every DIRECT ability
  // excludes the caster (abilities.js forFFTeammates); the projectile detonation
  // must honor the same invariant — it excluded only dead players, never the owner.
  const s = makeState({ friendlyFire: true })
  const owner = s.players.find(p => p.id === 'p1')
  owner.x = 260; owner.y = 200
  s.enemyStore.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 250, y: 200 }, 0)
  const hp0 = owner.hp
  fireball(s)   // ownerId: 'p1'
  for (let t = 0; t < 30 && s.projectiles.length; t++) tickProjectiles(s, 1000 + t * DT, DT)
  assert.equal(s.projectiles.length, 0, 'detonated in the owner\'s splash')
  assert.equal(owner.hp, hp0, 'caster excluded from their own blast under FF')
  assert.equal(owner.kvx, 0, 'caster excluded from their own blast\'s ffShove too')
  assert.equal(owner.kvy, 0)
})

test('projectile leaving the map detonates at the edge and is removed', () => {
  const s = makeState()
  fireball(s, { x: CONFIG.MAP_WIDTH - 20, y: 200, dirX: 1, dirY: 0 })
  for (let t = 0; t < 60 && s.projectiles.length; t++) tickProjectiles(s, 1000 + t * DT, DT)
  assert.equal(s.projectiles.length, 0)
})

test('swap-remove keeps the projectile list dense with multiple in flight', () => {
  const s = makeState()
  const store = s.enemyStore
  store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 230, y: 200 }, 0)  // kills #1 fast
  fireball(s)                                     // will impact immediately
  fireball(s, { y: 500 })                         // flies free
  fireball(s, { y: 600 })                         // flies free
  tickProjectiles(s, 1000, DT)
  assert.equal(s.projectiles.length, 2)
  const ids = s.projectiles.map(p => p.id)
  assert.equal(new Set(ids).size, 2, 'distinct survivors, dense array')
})

// --- FAN_BLADE (Wind basic, Task 5): single-target, no pierce, no AoE ------

const FAN = BALANCE.PROJECTILE.FAN_BLADE

function fanBlade(state, over = {}) {
  return spawnProjectile(state, {
    type: 'FAN_BLADE', ownerId: 'p3', category: 'basic', label: 'WIND',
    x: 200, y: 200, dirX: 1, dirY: 0, damage: 11,
    ...over,
  })
}

test('FAN_BLADE flies at its own speed, single-hit, no AoE splash to a nearby second enemy', () => {
  const s = makeState()
  const store = s.enemyStore
  const hit = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 200 + FAN.hitRadiusPx + 12, y: 200 }, 0)
  const near = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 200 + FAN.hitRadiusPx + 12 + 10, y: 200 }, 0)
  const hp0Hit = store.hp[hit], hp0Near = store.hp[near]
  const pr = fanBlade(s)
  for (let t = 0; t < 10 && s.projectiles.length; t++) tickProjectiles(s, 1000 + t * DT, DT)
  assert.equal(s.projectiles.length, 0, 'consumed on the single hit')
  assert.equal(store.hp[hit], hp0Hit - 11, 'the one enemy it overlapped took the hit')
  assert.equal(store.hp[near], hp0Near, 'no AoE — the adjacent enemy is untouched (no pierce)')
  assert.equal(store.aggro[hit].targetId, 'p3', 'hit pulls aggro to the owner')
  void pr
})

test('FAN_BLADE expiring at max range detonates nothing — no miss splash, no aggro pull', () => {
  const s = makeState()
  const store = s.enemyStore
  // Placed just past max range so it never overlaps in flight.
  const untouched = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 200 + FAN.maxRangePx + 30, y: 200 }, 0)
  const hp0 = store.hp[untouched]
  fanBlade(s)
  for (let t = 0; t < 30 && s.projectiles.length; t++) tickProjectiles(s, 1000 + t * DT, DT)
  assert.equal(s.projectiles.length, 0, 'expired at max range')
  assert.equal(store.hp[untouched], hp0, 'no miss detonation — nothing outside the hit radius takes damage')
  assert.equal(store.aggro[untouched].state, 'march', 'a miss never pulls aggro')
})

test('FAN_BLADE bounded by its lifetime failsafe even if range math were wrong', () => {
  const s = makeState()
  // No enemies at all — nothing to hit, range (100px @ 500px/s) expires well
  // before the 400ms failsafe, but the failsafe must still be live and finite.
  fanBlade(s)
  let ticks = 0
  for (; ticks < 200 && s.projectiles.length; ticks++) tickProjectiles(s, 1000 + ticks * DT, DT)
  assert.equal(s.projectiles.length, 0, 'terminated (by range, in the normal case)')
  const elapsedMs = ticks * DT
  assert.ok(elapsedMs <= FAN.lifetimeMs + DT, `terminated within the lifetime failsafe (took ${elapsedMs}ms, cap ${FAN.lifetimeMs}ms)`)
})

test('FAN_BLADE terminates on leaving map bounds with no detonation effect', () => {
  const s = makeState()
  const store = s.enemyStore
  const bystander = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: CONFIG.MAP_WIDTH - 5, y: 400 }, 0)  // off the flight line
  const hp0 = store.hp[bystander]
  fanBlade(s, { x: CONFIG.MAP_WIDTH - 20, y: 260, dirX: 1, dirY: 0 })
  for (let t = 0; t < 10 && s.projectiles.length; t++) tickProjectiles(s, 1000 + t * DT, DT)
  assert.equal(s.projectiles.length, 0)
  assert.equal(store.hp[bystander], hp0, 'leaving bounds is not a hit')
})
