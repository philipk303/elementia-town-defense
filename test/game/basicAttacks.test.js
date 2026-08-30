import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { createGameState } from '../../server/game/state.js'
import { tryBasicAttack, tickPendingBasics } from '../../server/game/basicAttacks.js'
import { PHASES } from '../../server/game/phaseMachine.js'

const B = BALANCE.PLAYER.BASIC
const R = CONFIG.PLAYER_RADIUS

function makeRoom() {
  return {
    players: ['EARTH', 'FIRE', 'WATER', 'WIND'].map((el, i) => ({
      id: `p${i}`, element: el, displayName: el, isBot: i > 0,
    })),
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
}

function makeState() {
  const state = createGameState(makeRoom(), 42)
  state.phase = PHASES.FIGHT
  return state
}

function levelMult(state) {
  return BALANCE.LEVELING.BASIC_LEVEL_MULT[(state.teamLevel ?? 1) - 1]
}

function idxOfId(store, id) {
  for (let i = 0; i < store.count; i++) if (store.id[i] === id) return i
  return -1
}

// --- Water: single-target, close range -------------------------------------

test('Water basic hits the nearest enemy in range for the class damage/cooldown', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'WATER')
  p.x = 400; p.y = 300
  const store = s.enemyStore
  const cfg = B.WATER
  const i = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + cfg.rangePx + R, y: 300 }, 1000)
  const hp0 = store.hp[i]
  const dmg = Math.round(cfg.damage * levelMult(s))
  tryBasicAttack(s, p, 1000)
  assert.equal(store.hp[i], hp0 - dmg)
  assert.equal(store.aggro[i].state, 'chase', 'basic hit pulled aggro (byDamage)')
  assert.equal(p.basicReadyAt, 1000 + cfg.cooldownMs)

  // Inside the cooldown, a second press does nothing.
  tryBasicAttack(s, p, 1000 + 1)
  assert.equal(store.hp[i], hp0 - dmg)
})

test('Water basic out of range swings without hitting and still consumes cooldown', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'WATER')
  p.x = 400; p.y = 300
  const store = s.enemyStore
  const cfg = B.WATER
  const i = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + cfg.rangePx + R + 50, y: 300 }, 1000)
  const hp0 = store.hp[i]
  tryBasicAttack(s, p, 1000)
  assert.equal(store.hp[i], hp0)
  assert.equal(p.basicReadyAt, 1000 + cfg.cooldownMs, 'a miss still consumes cooldown (A8)')
})

// --- Fire: single-target, longer range --------------------------------------

test('Fire basic reaches further than Water at the class damage/cooldown', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'FIRE')
  p.x = 400; p.y = 300
  const store = s.enemyStore
  const cfg = B.FIRE
  assert.ok(cfg.rangePx > B.WATER.rangePx, 'Fire basic outreaches Water basic (spec sec3)')
  // Placed beyond Water's range but inside Fire's.
  const i = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + cfg.rangePx + R, y: 300 }, 1000)
  const hp0 = store.hp[i]
  const dmg = Math.round(cfg.damage * levelMult(s))
  tryBasicAttack(s, p, 1000)
  assert.equal(store.hp[i], hp0 - dmg)
  assert.equal(p.basicReadyAt, 1000 + cfg.cooldownMs)
})

// --- Earth: 90-degree cone, cap 3, distance-then-stable-ID ordering --------

test('Earth basic hits an enemy in front of the aim but not one directly behind', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'EARTH')
  p.x = 400; p.y = 300
  p.aimX = 1; p.aimY = 0   // aiming +x
  const store = s.enemyStore
  const cfg = B.EARTH
  const front = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + cfg.rangePx + R, y: 300 }, 1000)
  const behind = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 - cfg.rangePx - R, y: 300 }, 1000)
  const hp0Front = store.hp[front], hp0Behind = store.hp[behind]
  tryBasicAttack(s, p, 1000)
  assert.ok(store.hp[front] < hp0Front, 'enemy in the cone was hit')
  assert.equal(store.hp[behind], hp0Behind, 'enemy behind the 90-degree cone untouched')
})

test('Earth basic caps at three targets, closest first, and pulls aggro on each hit', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'EARTH')
  p.x = 400; p.y = 300
  p.aimX = 1; p.aimY = 0
  const store = s.enemyStore
  const cfg = B.EARTH
  const reach = cfg.rangePx + R
  // Four TROLLs in the cone at increasing distance (survive the hit — 90 hp
  // vs an 8-dmg basic — so the ordering assertion isn't confounded by death).
  const ids = [10, 25, 40, 55].map(dx =>
    store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + Math.min(dx, reach - 1), y: 300 }, 1000))
  const hp0 = ids.map(i => store.hp[i])
  tryBasicAttack(s, p, 1000)
  const dmg = Math.round(cfg.damage * levelMult(s))
  assert.equal(store.hp[ids[0]], hp0[0] - dmg, 'closest hit')
  assert.equal(store.hp[ids[1]], hp0[1] - dmg, '2nd closest hit')
  assert.equal(store.hp[ids[2]], hp0[2] - dmg, '3rd closest hit')
  assert.equal(store.hp[ids[3]], hp0[3], '4th enemy beyond the cap-3 untouched')
  for (const i of ids.slice(0, 3)) assert.equal(store.aggro[i].state, 'chase')
  assert.equal(store.aggro[ids[3]].state, 'march', 'uncapped enemy never aggro-pulled')
})

test('Earth basic orders equidistant targets by stable enemy ID, not spawn/array index', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'EARTH')
  p.x = 400; p.y = 300
  p.aimX = 1; p.aimY = 0
  const store = s.enemyStore
  const cfg = B.EARTH
  const d = cfg.rangePx + R - 5
  // Same distance, spread across the cone width, spawned in reverse ID order
  // relative to angular position so array-index ordering would disagree with
  // stable-ID ordering if the implementation used the wrong tiebreak.
  const wide = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + d * Math.cos(0.3), y: 300 + d * Math.sin(0.3) }, 1000)
  const narrow = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + d * Math.cos(-0.1), y: 300 + d * Math.sin(-0.1) }, 1000)
  assert.ok(store.id[wide] < store.id[narrow], 'wide-angle enemy has the lower stable ID')
  const hp0Wide = store.hp[wide], hp0Narrow = store.hp[narrow]
  tryBasicAttack(s, p, 1000)
  const dmg = Math.round(cfg.damage * levelMult(s))
  assert.equal(store.hp[wide], hp0Wide - dmg, 'lower stable ID hit despite equal distance')
  assert.equal(store.hp[narrow], hp0Narrow - dmg, 'higher stable ID also within cap 3, also hit')
})

test('Earth basic with nothing in the cone still consumes cooldown (a miss)', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'EARTH')
  p.x = 400; p.y = 300
  p.aimX = 1; p.aimY = 0
  tryBasicAttack(s, p, 1000)
  assert.equal(p.basicReadyAt, 1000 + B.EARTH.cooldownMs, 'a miss still consumes cooldown (A8)')
})

test('Earth basic swap-removal safety: killing the closest target does not misdirect hits on the others', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'EARTH')
  p.x = 400; p.y = 300
  p.aimX = 1; p.aimY = 0
  const store = s.enemyStore
  const cfg = B.EARTH
  const reach = cfg.rangePx + R
  // Spawned in ascending distance order (so array index === selection order),
  // closest one set to lethal HP: killing it swap-removes and moves the LAST
  // spawned enemy (the farthest, 3rd) into the closest one's freed slot.
  const closest = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + 10, y: 300 }, 1000)
  const middle = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + 25, y: 300 }, 1000)
  const farthest = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 400 + Math.min(40, reach - 1), y: 300 }, 1000)
  store.hp[closest] = 1   // dies on the first hit -> swap-removed
  const middleId = store.id[middle], farthestId = store.id[farthest]
  const hp0Middle = store.hp[middle], hp0Farthest = store.hp[farthest]
  tryBasicAttack(s, p, 1000)
  assert.equal(store.count, 2, 'closest enemy died and was swap-removed')
  const middleIdx = idxOfId(store, middleId)
  const farthestIdx = idxOfId(store, farthestId)
  assert.ok(middleIdx !== -1 && farthestIdx !== -1, 'both survivors still present')
  const dmg = Math.round(cfg.damage * levelMult(s))
  assert.equal(store.hp[middleIdx], hp0Middle - dmg, 'middle enemy hit correctly despite the reshuffle')
  assert.equal(store.hp[farthestIdx], hp0Farthest - dmg, 'farthest enemy (swapped into the freed slot) hit correctly, not double-hit or skipped')
})

// --- Wind: 125ms wind-up, then a FAN_BLADE projectile (Task 5, A1-A3) ------

test('Wind basic consumes cooldown at wind-up start, spawns nothing yet', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'WIND')
  p.x = 400; p.y = 300; p.aimX = 1; p.aimY = 0
  const cfg = B.WIND
  tryBasicAttack(s, p, 1000)
  assert.equal(p.basicReadyAt, 1000 + cfg.cooldownMs, 'cooldown consumed at wind-up start (A2)')
  assert.equal(s.projectiles.length, 0, 'no projectile until the wind-up elapses')
  assert.ok(p.pendingBasic, 'a pending cast is recorded')
})

test('Wind basic releases the fan-blade projectile once the wind-up elapses, not before', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'WIND')
  p.x = 400; p.y = 300; p.aimX = 1; p.aimY = 0
  const cfg = B.WIND
  tryBasicAttack(s, p, 1000)
  tickPendingBasics(s, 1000 + cfg.windUpMs - 1)
  assert.equal(s.projectiles.length, 0, 'still winding up 1ms before release')
  tickPendingBasics(s, 1000 + cfg.windUpMs)
  assert.equal(s.projectiles.length, 1, 'released exactly at the wind-up deadline')
  const pr = s.projectiles[0]
  assert.equal(pr.type, 'FAN_BLADE')
  assert.equal(pr.ownerId, p.id)
  assert.equal(pr.category, 'basic')
  assert.ok(pr.vx > 0 && Math.abs(pr.vy) < 1e-9, 'flies along the release-time aim vector')
  const dmg = Math.round(cfg.damage * levelMult(s))
  assert.equal(pr.damage, dmg)
})

test('Wind basic keeps full movement — the player position at cast start does not pin the release', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'WIND')
  p.x = 400; p.y = 300; p.aimX = 1; p.aimY = 0
  const cfg = B.WIND
  tryBasicAttack(s, p, 1000)
  p.x = 460; p.y = 350   // player kept moving during the wind-up (A2: unaffected)
  tickPendingBasics(s, 1000 + cfg.windUpMs)
  const pr = s.projectiles[0]
  assert.equal(pr.x, 460, 'fan-blade spawns at the live position, not the cast-start position')
  assert.equal(pr.y, 350)
})

test('Wind basic during wind-up ignores a repeated press (still on cooldown, A2)', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'WIND')
  p.x = 400; p.y = 300; p.aimX = 1; p.aimY = 0
  const cfg = B.WIND
  tryBasicAttack(s, p, 1000)
  tryBasicAttack(s, p, 1000 + 50)   // mid wind-up
  tickPendingBasics(s, 1000 + cfg.windUpMs)
  assert.equal(s.projectiles.length, 1, 'exactly one release, the repeated press was a no-op')
})

test('Wind basic wind-up is cancelled by death, no refund, no release', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'WIND')
  p.x = 400; p.y = 300; p.aimX = 1; p.aimY = 0
  const cfg = B.WIND
  tryBasicAttack(s, p, 1000)
  p.life = 'dead'
  tickPendingBasics(s, 1000 + cfg.windUpMs)
  assert.equal(s.projectiles.length, 0, 'cancelled — no fan-blade released')
  assert.equal(p.basicReadyAt, 1000 + cfg.cooldownMs, 'no cooldown refund on cancel (A2)')
})

test('Wind basic with nothing to hit still consumes cooldown once released (a miss)', () => {
  const s = makeState()
  const p = s.players.find(pl => pl.element === 'WIND')
  p.x = 400; p.y = 300; p.aimX = 1; p.aimY = 0
  const cfg = B.WIND
  tryBasicAttack(s, p, 1000)
  tickPendingBasics(s, 1000 + cfg.windUpMs)
  assert.equal(p.basicReadyAt, 1000 + cfg.cooldownMs, 'cooldown was already consumed at wind-up start, unaffected by the miss')
})

test('tickPendingBasics is a callable no-op for Earth/Water/Fire (they resolve instantly)', () => {
  const s = makeState()
  assert.doesNotThrow(() => tickPendingBasics(s, 1000))
})
