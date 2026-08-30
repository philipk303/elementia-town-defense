// Player character sim (Phase 4): input → movement (with structure/hall
// collision), knockback integration, class-specific basic attacks
// (basicAttacks.js), and the down → revive → death → respawn lifecycle
// (spec §4 "Death & revive").
//
// Players never block the flow field (spec §4) — they are simply not tiles;
// only their bodies collide with solid tiles, same pushout as enemies, with
// the same pre-move anchor discipline (CP2 H1: the came-from side is what
// keeps a knockback into a wall from popping out the far face).
//
// `alive` is the single targeting predicate the enemy sim reads: true only
// while life === 'up'. Downed/dead players can't act, move, or hold aggro.

import { CONFIG, PLAYER_FLAG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { MAX_STEP_PX, KB_DECAY_PER_TICK } from './enemyMove.js'
import { resolveTilePushout } from './collisionIndex.js'
import { trySpecial, trySecond } from './abilities.js'
import { tryBasicAttack, tickPendingBasics } from './basicAttacks.js'

const P = BALANCE.PLAYER
const R = CONFIG.PLAYER_RADIUS

// Scratch pair for resolveTilePushout's array-indexed signature — players are
// plain objects, not SoA. Module-scoped: no allocation in the tick path.
const _sx = new Float64Array(1)
const _sy = new Float64Array(1)

let _solidField = null, _solidFn = null
function solidFn(field) {
  if (_solidField !== field) { _solidField = field; _solidFn = (gx, gy) => field.solidAt(gx, gy) }
  return _solidFn
}

export function playerFlags(p) {
  let f = 0
  if (p.life === 'down') f |= PLAYER_FLAG.DOWNED
  if (p.life === 'dead') f |= PLAYER_FLAG.DEAD
  if (p.life === 'down' && p.reviveMs > 0) f |= PLAYER_FLAG.REVIVING
  return f
}

// Deal damage to a player (enemy melee now; FF ability effects too). Lethal
// damage DOWNS the player on the spot (bleed-out), never kills outright.
// Damage to an already-downed/dead player is ignored (spec: downed players
// are out of the fight until revived or bled out).
export function damagePlayer(state, p, amount, now) {
  if (p.life !== 'up') return false
  p.hp -= amount
  state.fx.push({ type: 'pdmg', x: p.x, y: p.y, v: Math.round(amount) })
  if (p.hp > 0) return false
  p.hp = 0
  p.life = 'down'
  p.alive = false
  p.downUntil = now + P.BLEED_OUT_MS
  p.reviveMs = 0
  p.kvx = 0; p.kvy = 0
  state.fx.push({ type: 'downed', x: p.x, y: p.y })
  return true
}

function die(state, p, now) {
  p.life = 'dead'
  p.alive = false
  p.reviveMs = 0
  p.respawnAt = now + P.RESPAWN_BASE_MS + Math.max(0, (state.wave - 1)) * P.RESPAWN_PER_WAVE_MS
  state.fx.push({ type: 'pdied', x: p.x, y: p.y })
}

function respawn(state, p) {
  p.life = 'up'
  p.alive = true
  p.hp = p.maxHp
  p.x = p.spawnX
  p.y = p.spawnY
  p.kvx = 0; p.kvy = 0
  p.reviveMs = 0
  state.fx.push({ type: 'respawn', x: p.x, y: p.y })
}

function revive(state, p) {
  p.life = 'up'
  p.alive = true
  p.hp = Math.round(p.maxHp * P.REVIVE_HP_FRACTION)
  p.reviveMs = 0
  p.kvx = 0; p.kvy = 0
  state.fx.push({ type: 'revived', x: p.x, y: p.y })
}

// Down/dead timers + the adjacent revive channel. The channel is proximity-
// driven: progress accrues while ≥1 living teammate is within REVIVE_RANGE_PX
// and resets if everyone steps away (interrupted channels restart — design
// decision recorded in the Phase-4 spec amendment).
function tickLifecycle(state, p, now, dtMs) {
  if (p.life === 'down') {
    if (now >= p.downUntil) { die(state, p, now); return }
    let mateNear = false
    for (const q of state.players) {
      if (q === p || !q.alive) continue
      const dx = q.x - p.x, dy = q.y - p.y
      if (dx * dx + dy * dy <= P.REVIVE_RANGE_PX * P.REVIVE_RANGE_PX) { mateNear = true; break }
    }
    if (mateNear) {
      p.reviveMs += dtMs
      if (p.reviveMs >= P.REVIVE_CHANNEL_MS) revive(state, p)
    } else {
      p.reviveMs = 0
    }
    return
  }
  if (p.life === 'dead' && now >= p.respawnAt) respawn(state, p)
}

function moveAndCollide(state, p, dirX, dirY, dtMs) {
  const dtSec = dtMs / 1000
  let dx = dirX * p.moveSpeed * dtSec + p.kvx * dtSec
  let dy = dirY * p.moveSpeed * dtSec + p.kvy * dtSec
  const d = Math.hypot(dx, dy)
  if (d > MAX_STEP_PX) { const f = MAX_STEP_PX / d; dx *= f; dy *= f }

  const ax = p.x, ay = p.y   // pre-move anchor (CP2 H1 discipline)
  _sx[0] = p.x + dx
  _sy[0] = p.y + dy
  resolveTilePushout(_sx, _sy, 0, R, solidFn(state.costField), ax, ay)
  p.x = Math.min(Math.max(_sx[0], R), CONFIG.MAP_WIDTH - R)
  p.y = Math.min(Math.max(_sy[0], R), CONFIG.MAP_HEIGHT - R)

  p.kvx *= KB_DECAY_PER_TICK
  p.kvy *= KB_DECAY_PER_TICK
  if (Math.abs(p.kvx) < 0.5) p.kvx = 0
  if (Math.abs(p.kvy) < 0.5) p.kvy = 0
}

// One tick for all players: lifecycle first (a revive this tick lets the
// player act next tick, not this one), then input-driven movement + actions.
// Runs in build, fight and waveEnd phases; abilities only matter when enemies
// exist but are not phase-gated server-side (harmless, and lets players warm
// up during build).
export function tickPlayers(state, inputBuffer, now, dtMs) {
  tickPendingBasics(state, now)
  for (const p of state.players) {
    tickLifecycle(state, p, now, dtMs)
    if (p.life !== 'up') { p.flags = playerFlags(p); continue }

    const input = inputBuffer && inputBuffer.get ? inputBuffer.get(p.id) : null
    let dirX = 0, dirY = 0
    if (input) {
      const k = input.keys
      if (k.w) dirY -= 1
      if (k.s) dirY += 1
      if (k.a) dirX -= 1
      if (k.d) dirX += 1
      const len = Math.hypot(dirX, dirY)
      if (len > 0) { dirX /= len; dirY /= len }
      const alen = Math.hypot(input.aimX, input.aimY)
      if (alen > 1e-9) { p.aimX = input.aimX / alen; p.aimY = input.aimY / alen }
    }

    moveAndCollide(state, p, dirX, dirY, dtMs)

    if (input) {
      if (input.actions.basic) tryBasicAttack(state, p, now)
      if (input.actions.special) trySpecial(state, p, now)
      if (input.actions.second) trySecond(state, p, now)
    }
    p.flags = playerFlags(p)
  }
}

// Build-phase start (spec §4): everyone is fully restored — downed players
// stand up in place, dead players return at the hall spawn.
export function restoreAllPlayers(state) {
  for (const p of state.players) {
    if (p.life === 'dead') { p.x = p.spawnX; p.y = p.spawnY }
    p.life = 'up'
    p.alive = true
    p.hp = p.maxHp
    p.kvx = 0; p.kvy = 0
    p.reviveMs = 0
    p.flags = 0
  }
}
