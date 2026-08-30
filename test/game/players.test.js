import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TILE_SIZE, tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { CONFIG, ELEMENTS, PLAYER_FLAG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { WEIGHT, SPEED, ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { ELEMENT_KIT } from '../../server/game/elementKits.js'
import { CostField, hpToBand } from '../../server/game/costField.js'
import { EnemyStore, tickEnemies } from '../../server/game/enemies.js'
import { createGameState } from '../../server/game/state.js'
import {
  tickPlayers, damagePlayer, restoreAllPlayers, playerFlags,
} from '../../server/game/players.js'
import { PHASES } from '../../server/game/phaseMachine.js'

const P = BALANCE.PLAYER
const DT = 1000 / 60

function makeRoom(overrides = {}) {
  return {
    players: ELEMENTS.map((el, i) => ({
      id: `p${i}`, element: el, displayName: el, isBot: i > 0,
    })),
    settings: { timingStyle: 'fixed', friendlyFire: false, ...overrides },
  }
}

function makeState(overrides = {}) {
  const state = createGameState(makeRoom(), 42)
  state.phase = PHASES.FIGHT
  Object.assign(state, overrides)
  return state
}

function input(over = {}) {
  return {
    keys: { w: false, a: false, s: false, d: false, ...(over.keys || {}) },
    aimX: over.aimX ?? 1, aimY: over.aimY ?? 0,
    actions: { basic: false, special: false, second: false, ...(over.actions || {}) },
  }
}

function buf(entries) { return new Map(entries) }

// --- element kits ------------------------------------------------------------

test('element kits map spec ranks onto the shared tier scales', () => {
  assert.equal(ELEMENT_KIT.EARTH.weight, WEIGHT.SUPER_HEAVY)
  assert.equal(ELEMENT_KIT.EARTH.speed, SPEED.SLOW)
  assert.equal(ELEMENT_KIT.WIND.weight, WEIGHT.LIGHT)
  assert.equal(ELEMENT_KIT.WIND.speed, SPEED.SUPER_FAST)
  assert.equal(ELEMENT_KIT.FIRE.weight, WEIGHT.MEDIUM)
  assert.equal(ELEMENT_KIT.WATER.weight, WEIGHT.HEAVY)
})

test('players spawn with kit tiers and tier-indexed move speed', () => {
  const s = makeState()
  const earth = s.players[0], wind = s.players[3]
  assert.equal(earth.moveSpeed, P.SPEED_PX[SPEED.SLOW])
  assert.equal(wind.moveSpeed, P.SPEED_PX[SPEED.SUPER_FAST])
  assert.ok(wind.moveSpeed > earth.moveSpeed)
})

// --- movement ----------------------------------------------------------------

test('WASD input moves the player; diagonal is normalized', () => {
  const s = makeState()
  const p = s.players[0]
  const x0 = p.x, y0 = p.y
  tickPlayers(s, buf([[p.id, input({ keys: { d: true } })]]), 1000, DT)
  const straight = p.x - x0
  assert.ok(straight > 0)
  assert.equal(p.y, y0)

  const p2 = s.players[1]
  const x2 = p2.x, y2 = p2.y
  tickPlayers(s, buf([[p2.id, input({ keys: { d: true, s: true } })]]), 1000, DT)
  const dx = p2.x - x2, dy = p2.y - y2
  const dist = Math.hypot(dx, dy)
  assert.ok(Math.abs(dist - p2.moveSpeed * DT / 1000) < 1e-6, 'diagonal speed equals straight speed')
})

test('players are clamped inside the arena', () => {
  const s = makeState()
  const p = s.players[0]
  p.x = 5; p.y = 5
  tickPlayers(s, buf([[p.id, input({ keys: { w: true, a: true } })]]), 1000, DT)
  assert.ok(p.x >= CONFIG.PLAYER_RADIUS)
  assert.ok(p.y >= CONFIG.PLAYER_RADIUS)
})

test('players cannot walk through a wall tile (solid pushout)', () => {
  const s = makeState()
  const p = s.players[0]
  // Wall directly right of the player, on the tile boundary.
  const gx = 10, gy = 10
  s.structures.push({ id: 900, type: 'BARRICADE', gx, gy, w: 1, h: 1, hp: 40, maxHp: 40 })
  s.costField.setWallBand(gx, gy, hpToBand(40, 40))
  s.costField.compute()
  p.x = gx * TILE_SIZE - CONFIG.PLAYER_RADIUS - 1
  p.y = tileToWorldY(gy)
  for (let t = 0; t < 60; t++) {
    tickPlayers(s, buf([[p.id, input({ keys: { d: true } })]]), 1000 + t * DT, DT)
  }
  assert.ok(p.x <= gx * TILE_SIZE - CONFIG.PLAYER_RADIUS + 1e-6, 'stopped at the wall face')
})

test('knockback velocity displaces then decays; downed players cannot move', () => {
  const s = makeState()
  const p = s.players[3] // wind — light
  const x0 = p.x
  p.kvx = 300
  tickPlayers(s, buf(), 1000, DT)
  assert.ok(p.x > x0, 'kb velocity moved the player')
  assert.ok(p.kvx < 300, 'kb decayed')

  const p2 = s.players[0]
  damagePlayer(s, p2, 9999, 1000)
  const x2 = p2.x
  tickPlayers(s, buf([[p2.id, input({ keys: { d: true } })]]), 1001, DT)
  assert.equal(p2.x, x2, 'downed player ignores movement input')
})

// --- down / revive / death / respawn -----------------------------------------

test('lethal damage downs the player (not dead): bleed-out window opens', () => {
  const s = makeState()
  const p = s.players[0]
  damagePlayer(s, p, p.hp + 5, 5000)
  assert.equal(p.life, 'down')
  assert.equal(p.alive, false)
  assert.equal(p.hp, 0)
  assert.equal(p.downUntil, 5000 + P.BLEED_OUT_MS)
  assert.ok(playerFlags(p) & PLAYER_FLAG.DOWNED)
})

test('damage to a downed player is ignored (no double-down)', () => {
  const s = makeState()
  const p = s.players[0]
  damagePlayer(s, p, 9999, 1000)
  const downUntil = p.downUntil
  damagePlayer(s, p, 50, 2000)
  assert.equal(p.downUntil, downUntil)
  assert.equal(p.life, 'down')
})

test('bleed-out expiry → full death with wave-scaled respawn timer', () => {
  const s = makeState()
  s.wave = 6
  // Move everyone away so no revive channel interferes.
  for (const q of s.players) { q.x = 100 + 200 * s.players.indexOf(q); q.y = 100 }
  const p = s.players[0]
  damagePlayer(s, p, 9999, 1000)
  tickPlayers(s, buf(), 1000 + P.BLEED_OUT_MS, DT)
  assert.equal(p.life, 'dead')
  assert.ok(playerFlags(p) & PLAYER_FLAG.DEAD)
  assert.equal(p.respawnAt, 1000 + P.BLEED_OUT_MS + P.RESPAWN_BASE_MS + 5 * P.RESPAWN_PER_WAVE_MS)
})

test('adjacent teammate channel revives at partial HP; leaving resets progress', () => {
  const s = makeState()
  const p = s.players[0], mate = s.players[1]
  p.x = 400; p.y = 400
  mate.x = 400 + P.REVIVE_RANGE_PX - 5; mate.y = 400
  for (const q of s.players) if (q !== p && q !== mate) { q.x = 1000; q.y = 100 }
  damagePlayer(s, p, 9999, 1000)

  // Half the channel, then the mate walks away → progress resets.
  const half = P.REVIVE_CHANNEL_MS / 2
  tickPlayers(s, buf(), 1000 + half, half)
  assert.ok(p.reviveMs > 0)
  assert.ok(playerFlags(p) & PLAYER_FLAG.REVIVING)
  mate.x = 2000
  tickPlayers(s, buf(), 1000 + half + DT, DT)
  assert.equal(p.reviveMs, 0, 'interrupted channel resets')

  // Full channel completes the revive.
  mate.x = 400 + 10
  tickPlayers(s, buf(), 2000, P.REVIVE_CHANNEL_MS + 50)
  assert.equal(p.life, 'up')
  assert.equal(p.alive, true)
  assert.equal(p.hp, Math.round(p.maxHp * P.REVIVE_HP_FRACTION))
})

test('dead player respawns at the hall spawn point at full HP after the timer', () => {
  const s = makeState()
  for (const q of s.players) { q.x = 100 + 200 * s.players.indexOf(q); q.y = 100 }
  const p = s.players[0]
  const spawnX = p.spawnX, spawnY = p.spawnY
  damagePlayer(s, p, 9999, 0)
  tickPlayers(s, buf(), P.BLEED_OUT_MS, DT)          // die
  assert.equal(p.life, 'dead')
  tickPlayers(s, buf(), p.respawnAt + 1, DT)          // respawn
  assert.equal(p.life, 'up')
  assert.equal(p.hp, p.maxHp)
  assert.equal(p.x, spawnX)
  assert.equal(p.y, spawnY)
})

test('restoreAllPlayers (build-phase start) fully restores downed and dead', () => {
  const s = makeState()
  for (const q of s.players) { q.x = 100 + 200 * s.players.indexOf(q); q.y = 100 }
  const down = s.players[0], dead = s.players[1]
  damagePlayer(s, down, 9999, 0)
  damagePlayer(s, dead, 9999, 0)
  dead.life = 'dead'; dead.respawnAt = 99999
  restoreAllPlayers(s)
  for (const p of [down, dead]) {
    assert.equal(p.life, 'up')
    assert.equal(p.alive, true)
    assert.equal(p.hp, p.maxHp)
  }
  assert.equal(dead.x, dead.spawnX, 'dead player restored at the hall spawn')
})

// --- basic attack wiring (class-specific shapes live in basicAttacks.js and
// are unit-tested there — this file just confirms tickPlayers correctly
// dispatches the input action into that module) ------------------------------

test('the basic input action damages the nearest enemy in range and pulls aggro, gated by cooldown', () => {
  const s = makeState()
  const p = s.players[2]  // WATER (single-target, per basicAttacks.js)
  p.x = 400; p.y = 300
  const store = s.enemyStore
  const cfg = BALANCE.PLAYER.BASIC.WATER
  const i = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 400 + 30, y: 300 }, 1000)
  const hp0 = store.hp[i]
  const mult = BALANCE.LEVELING.BASIC_LEVEL_MULT[(s.teamLevel ?? 1) - 1]
  const dmg = Math.round(cfg.damage * mult)
  tickPlayers(s, buf([[p.id, input({ actions: { basic: true } })]]), 1000, DT)
  assert.equal(store.hp[i], hp0 - dmg)
  assert.equal(store.aggro[i].state, 'chase', 'basic hit pulled aggro (byDamage)')
  assert.equal(store.aggro[i].targetId, p.id)
  assert.ok(p.basicReadyAt > 1000, 'cooldown armed')

  // Second press inside the cooldown does nothing.
  tickPlayers(s, buf([[p.id, input({ actions: { basic: true } })]]), 1000 + DT, DT)
  assert.equal(store.hp[i], hp0 - dmg)
})

test('basic damage scales with team level through tickPlayers', () => {
  const s = makeState()
  const p = s.players[2]  // WATER
  p.x = 400; p.y = 300
  const store = s.enemyStore
  const cfg = BALANCE.PLAYER.BASIC.WATER
  const e = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 430, y: 300 }, 1000)
  const hp0 = store.hp[e]
  tickPlayers(s, buf([[p.id, input({ actions: { basic: true } })]]), 1000, DT)
  const l1Dmg = hp0 - store.hp[e]

  s.teamLevel = 4
  const hp1 = store.hp[e]
  tickPlayers(s, buf([[p.id, input({ actions: { basic: true } })]]), 1000 + cfg.cooldownMs, DT)
  const l4Dmg = hp1 - store.hp[e]
  assert.ok(l4Dmg > l1Dmg, 'L4 basic-attack multiplier hits harder than L1')
})

test('basic input action out of range swings without hitting', () => {
  const s = makeState()
  const p = s.players[2]  // WATER
  p.x = 400; p.y = 300
  const store = s.enemyStore
  const i = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 600, y: 300 }, 1000)
  const hp0 = store.hp[i]
  tickPlayers(s, buf([[p.id, input({ actions: { basic: true } })]]), 1000, DT)
  assert.equal(store.hp[i], hp0)
})

// --- enemy → player contact damage (the Phase-3 deferral) --------------------

test('a chasing enemy in contact range damages its target on its cooldown', () => {
  const s = makeState()
  const p = s.players[0]
  p.x = 320; p.y = 320
  // Park the other players far away so the orc's nearest target is p.
  for (const q of s.players) if (q !== p) { q.x = 1200; q.y = 700 }
  const store = s.enemyStore
  const orcRadius = BALANCE.ENEMY.BASE[ENEMY_TYPE.ORC].radius
  const i = store.spawn({
    type: ENEMY_TYPE.ORC, elite: false,
    x: 320 + orcRadius + CONFIG.PLAYER_RADIUS + 2, y: 320,
  }, 1000)
  const hp0 = p.hp
  tickEnemies(s, 1000, DT)
  assert.equal(store.aggro[i].state, 'chase', 'proximity aggro triggered')
  assert.equal(p.hp, hp0 - store.damage[i], 'contact melee landed')
  const hp1 = p.hp
  tickEnemies(s, 1000 + DT, DT)
  assert.equal(p.hp, hp1, 'cooldown gates the next hit')
})

test('enemy melee can down a player; a downed player stops being chased', () => {
  const s = makeState()
  const p = s.players[0]
  p.x = 320; p.y = 320; p.hp = 5
  for (const q of s.players) if (q !== p) { q.x = 1200; q.y = 700 }
  const store = s.enemyStore
  const i = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 340, y: 320 }, 1000)
  tickEnemies(s, 1000, DT)
  assert.equal(p.life, 'down')
  tickEnemies(s, 1000 + DT, DT)
  assert.notEqual(store.aggro[i].targetId, p.id, 'downed player dropped as a target')
})
