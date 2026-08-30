// Class-specific basic attacks (Task 4, staged combat redesign program).
// Replaces the old single shared melee (players.js) with per-class shapes
// from the Character Class Attack Redesign spec §3 + Amendment A. Earth and
// Water/Fire resolve on the same instant, server-side, no-wind-up contract
// as the old shared melee (A6) — only the shape/range/damage/cooldown differ
// per class. Range is edge-distance (attacker radius + target radius),
// universally (A7); a miss still consumes cooldown (A8).
//
// WIND (Task 5, Amendment A1-A3): a 125 ms wind-up, then a FAN_BLADE
// projectile (projectiles.js). Full commitment semantics per A2 — cooldown
// consumed at wind-up START (below, same tryBasicAttack gate as every other
// class), movement/aim unaffected throughout, cancelled ONLY by down/death,
// NOT by input release or a repeated basic press (already a no-op: the
// cooldown gate above rejects it, same as any other class mid-cooldown), no
// refund on cancel. The fan-blade spawns at the player's LIVE position/aim at
// release, not the cast-start position — "movement unaffected" means the
// player kept moving/aiming during the wind-up, so a stale spawn point would
// contradict that.

import { CONFIG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { damageEnemy } from './enemies.js'
import { triggerAggro } from './aggro.js'
import { recordAttempt, recordMiss, recordUseful } from './combatStats.js'
import { spawnProjectile } from './projectiles.js'

const B = BALANCE.PLAYER.BASIC
const R = CONFIG.PLAYER_RADIUS

function levelMult(state) {
  return BALANCE.LEVELING.BASIC_LEVEL_MULT[(state.teamLevel ?? 1) - 1]
}

// Damage + aggro pull + combat-text fx for one enemy slot (mirrors
// abilities.js's hitEnemy — the basic's hit always pulls aggro by damage,
// same "attention follows damage" rule).
function hitEnemy(state, i, dmg, p, now) {
  const store = state.enemyStore
  const ex = store.x[i], ey = store.y[i]
  triggerAggro(store.aggro[i], p.id, ex, ey, now, true)
  state.fx.push({ type: 'dmg', x: ex, y: ey, v: dmg })
  damageEnemy(state, i, dmg, { category: 'basic', ownerId: p.id, label: p.element })
}

// Water/Fire: single-target, nearest living enemy whose edge is within
// cfg.rangePx of the player's edge (contact range → hit pulls aggro).
function trySingleTarget(state, p, now, cfg) {
  const store = state.enemyStore
  let best = -1, bestD2 = Infinity
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - p.x, dy = store.y[i] - p.y
    const reach = cfg.rangePx + R + store.radius[i]
    const d2 = dx * dx + dy * dy
    if (d2 <= reach * reach && d2 < bestD2) { bestD2 = d2; best = i }
  }
  if (best === -1) { recordMiss(state, 'basic', p.id); return }
  const dmg = Math.round(cfg.damage * levelMult(state))
  hitEnemy(state, best, dmg, p, now)
  recordUseful(state, 'basic', p.id)
}

function idxOfId(store, id) {
  for (let i = 0; i < store.count; i++) if (store.id[i] === id) return i
  return -1
}

// Earth: cfg.coneDeg cone in the aim direction, cap cfg.maxTargets, ordered
// by distance then stable enemy ID (Amendment A, A4 — dense array index is
// unsafe: a kill inside the loop swap-removes and reorders slots). Selection
// captures each candidate's stable ID up front, sorts, caps, THEN re-resolves
// each ID's live index right before hitting it, so an earlier kill in the
// same cast can never misdirect or skip a later hit.
function tryEarthCone(state, p, now, cfg) {
  const store = state.enemyStore
  const halfAngle = (cfg.coneDeg * Math.PI / 180) / 2
  const cosHalf = Math.cos(halfAngle)

  const candidates = []
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - p.x, dy = store.y[i] - p.y
    const reach = cfg.rangePx + R + store.radius[i]
    const d2 = dx * dx + dy * dy
    if (d2 > reach * reach) continue
    if (d2 > 1e-9) {
      const dist = Math.sqrt(d2)
      const cos = (dx * p.aimX + dy * p.aimY) / dist
      if (cos < cosHalf) continue
    }
    candidates.push({ id: store.id[i], d2 })
  }
  if (candidates.length === 0) { recordMiss(state, 'basic', p.id); return }
  candidates.sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id))

  const dmg = Math.round(cfg.damage * levelMult(state))
  for (const c of candidates.slice(0, cfg.maxTargets)) {
    const idx = idxOfId(store, c.id)
    if (idx !== -1) hitEnemy(state, idx, dmg, p, now)
  }
  recordUseful(state, 'basic', p.id)
}

// Wind: cooldown is already consumed by the caller (A2 — spent at wind-up
// start). Just record the pending cast; tickPendingBasics does the release.
function tryWindFan(state, p, now, cfg) {
  p.pendingBasic = { releaseAt: now + cfg.windUpMs }
}

// Element -> attack presentation kind (server/net/encode.js ATTACK_KINDS).
// One entry per class shape the client must draw exactly (Task 7): Earth's
// cone, Water's contact area, Fire's reach, Wind's wind-up telegraph.
const ATTACK_KIND = { EARTH: 'EARTH_CONE', WATER: 'WATER_REACH', FIRE: 'FIRE_REACH', WIND: 'WIND_WINDUP' }

export function tryBasicAttack(state, p, now) {
  const cfg = B[p.element]
  if (!cfg) return
  if (now < p.basicReadyAt) return
  p.basicReadyAt = now + cfg.cooldownMs
  state.fx.push({ type: 'swing', x: p.x, y: p.y })
  // Per-caster sequence so the client can tell two casts from the same
  // player apart even inside one 20 Hz emit window (rare but possible under
  // Wind's 500ms cooldown at a slow client frame rate).
  p.atkSeq = (p.atkSeq ?? 0) + 1
  state.atkFx.push({
    srcId: p.id, kind: ATTACK_KIND[p.element], x: p.x, y: p.y,
    aimX: p.aimX, aimY: p.aimY, seq: p.atkSeq,
  })
  recordAttempt(state, 'basic', p.id)

  if (p.element === 'EARTH') tryEarthCone(state, p, now, cfg)
  else if (p.element === 'WIND') tryWindFan(state, p, now, cfg)
  else trySingleTarget(state, p, now, cfg)
}

// Advances any basic attack still in flight after its wind-up (Wind's
// fan-blade, Task 5). Earth/Water/Fire resolve on the same tick they are
// cast (A6) — p.pendingBasic is only ever set for Wind.
export function tickPendingBasics(state, now) {
  for (const p of state.players) {
    const pend = p.pendingBasic
    if (!pend) continue
    // A2: cancelled only by down/death, no refund. The attempt was already
    // recorded at wind-up start (tryBasicAttack) and never lands — count it
    // as a miss so basic's attempts === useful + misses invariant holds.
    if (p.life !== 'up') { p.pendingBasic = null; recordMiss(state, 'basic', p.id); continue }
    if (now < pend.releaseAt) continue
    p.pendingBasic = null
    const cfg = B[p.element]
    const dmg = Math.round(cfg.damage * levelMult(state))
    spawnProjectile(state, {
      type: 'FAN_BLADE', ownerId: p.id, label: p.element, category: 'basic',
      x: p.x, y: p.y, dirX: p.aimX, dirY: p.aimY, damage: dmg,
    })
  }
}

// Instrumentation-only accounting flush for a harness that stops ticking a
// completed match (matchRunner.js) — NOT part of the live simulation. A
// still-winding-up Wind cast already recorded its attempt (at wind-up start,
// tryBasicAttack) but the harness's last tick landed before its 125ms
// wind-up elapsed, so it never released. Real play never needs this: ticks
// keep running every frame until the cast resolves on its own; only an
// instrument that deliberately stops at an arbitrary tick can catch one
// mid-wind-up. Resolve it as a miss so basic's attempts === useful + misses
// invariant holds for a COMPLETED match.
export function flushPendingBasics(state) {
  for (const p of state.players) {
    if (!p.pendingBasic) continue
    p.pendingBasic = null
    recordMiss(state, 'basic', p.id)
  }
}
