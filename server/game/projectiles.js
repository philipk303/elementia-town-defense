// Projectile subsystem (Phase 4 — a locked scope decision: real spawned
// entities with per-tick velocity flight, not aim-resolved instant AoE).
//
//   - Flight is velocity-over-ticks with the same per-tick step clamp as
//     enemy knockback (MAX_STEP_PX < one tile) — a projectile can never skip
//     a body-width in a single tick at balance speeds.
//   - Collision is projectile-vs-ENEMY only. Projectiles are thrown/lobbed
//     and fly OVER structures and walls (design decision in the Phase-4 spec
//     amendment) — the maze shapes enemies, not friendly fire support.
//   - Detonation applies AoE damage + the payload status (burn for Fireball)
//     and pulls aggro toward the owner (attention follows damage). With the
//     room's friendly-fire flag on, players inside the blast take the damage
//     too (weight/displacement effects on players ride the same FF gate in
//     abilities.js).
//   - Dense array + swap-remove; a handful of projectiles exist at once, so
//     plain objects are fine (they are NOT per-enemy-per-tick allocations).

import { CONFIG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { MAX_STEP_PX, playerKnockback } from './enemyMove.js'
import { damageEnemy } from './enemies.js'
import { triggerAggro } from './aggro.js'
import { applyBurn } from './status.js'
import { recordMiss, recordUseful, hitsSoFar } from './combatStats.js'

// `areaBoost` scales the blast area and range (not the projectile's own hit
// body) so L3 boosts the Fireball's AoE/range the same way it boosts the other
// specials' radius/range — damage is pre-boosted by the caller.
//
// `category`/`label` are combat-accounting attribution (default 'ability'
// since Fireball is the only projectile today; a Task 5 basic-attack
// projectile passes category: 'basic'). The cast that spawns a projectile
// already recorded its ATTEMPT synchronously (abilities.js); the projectile
// records its own useful/miss at detonation, once it actually knows whether
// anything was hit — see detonate() below.
// Refuses the spawn (returns null, no state mutation) once the concurrent
// budget (BALANCE.LIMITS.MAX_PROJECTILES) is full. REFUSE, never drop-oldest —
// dropping would silently delete a player's in-flight Fireball to make room
// for a structure bolt, which is a worse failure than the structure losing
// one. Callers already tolerate a null return (Wind's fan-blade cast checks
// nothing today, and Firestorm's volley — the caller this exists for — counts
// refusals via state.volleyProbe rather than assuming success).
//
// `category === 'structure'` bolts emit no per-bolt `projSpawn` FX (spec §2b):
// eight simultaneous spawns from one Firestorm volley would sit at
// FX_CAP_PER_TYPE and silently crowd out a second tower's spawn FX on the
// same tick. One muzzle event per volley at the tower is the correct visual
// anyway; the projectile itself is still a real replicated entity (encode.js
// ships it every tick regardless of this flag).
export function spawnProjectile(state, { type, ownerId, x, y, dirX, dirY, damage, burn = null, areaBoost = 1, ffShove = null, category = 'ability', label = null }) {
  if (state.projectiles.length >= BALANCE.LIMITS.MAX_PROJECTILES) return null
  const spec = BALANCE.PROJECTILE[type]
  const len = Math.hypot(dirX, dirY) || 1
  const pr = {
    id: state.nextProjectileId++,
    type, ownerId, category, label,
    x, y,
    vx: (dirX / len) * spec.speedPx,
    vy: (dirY / len) * spec.speedPx,
    traveled: 0,
    ageMs: 0,
    lifetimeMs: spec.lifetimeMs ?? null,
    maxRangePx: spec.maxRangePx * areaBoost,
    hitRadiusPx: spec.hitRadiusPx,
    aoeRadiusPx: spec.aoeRadiusPx * areaBoost,
    damage, burn, ffShove,
  }
  state.projectiles.push(pr)
  if (category !== 'structure') state.fx.push({ type: 'projSpawn', x, y })
  return pr
}

// AoE detonation (Fireball): damage + payload status to every enemy within
// aoeRadius of (x, y); FF-gated shove to players in the same radius. Enemy
// scan is over the dense store (projectile count is tiny; not a hot path).
function detonateAoe(state, pr, now) {
  const store = state.enemyStore
  const r2 = pr.aoeRadiusPx * pr.aoeRadiusPx
  const meta = { category: pr.category, ownerId: pr.ownerId, label: pr.label }
  const hitsBefore = hitsSoFar(state, pr.category, pr.ownerId)
  let bodiesHit = 0
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - pr.x, dy = store.y[i] - pr.y
    if (dx * dx + dy * dy > r2) continue
    if (pr.burn) {
      const wasBurning = store.status[i].burnMs > 0
      applyBurn(store.status[i], pr.burn.dps, pr.burn.ms)
      if (!wasBurning && store.status[i].burnMs > 0) state.fx.push({ type: 'burn', x: store.x[i], y: store.y[i] })
    }
    triggerAggro(store.aggro[i], pr.ownerId, store.x[i], store.y[i], now, true)
    state.fx.push({ type: 'dmg', x: store.x[i], y: store.y[i], v: Math.round(pr.damage) })
    bodiesHit++
    if (damageEnemy(state, i, pr.damage, meta)) i--
  }
  if (hitsSoFar(state, pr.category, pr.ownerId) > hitsBefore) recordUseful(state, pr.category, pr.ownerId)
  else recordMiss(state, pr.category, pr.ownerId)
  // Firestorm volley-delivery instrumentation (state.volleyProbe, opt-in —
  // see volley.js). `category: 'structure'` is exclusively Firestorm bolts
  // today (the only structure-owned projectile spawner); `hits` accumulates
  // bodies-hit so the probe's hits/volley figure is like-for-like with the
  // pre-conversion instantaneous-scan reading.
  if (state.volleyProbe && pr.category === 'structure' && bodiesHit > 0) {
    state.volleyProbe.boltsHit = (state.volleyProbe.boltsHit || 0) + 1
    state.volleyProbe.hits = (state.volleyProbe.hits || 0) + bodiesHit
  }
  if (state.settings.friendlyFire && pr.ffShove) {
    for (const p of state.players) {
      if (!p.alive || p.id === pr.ownerId) continue   // caster always excluded (matches direct-ability FF)
      const dx = p.x - pr.x, dy = p.y - pr.y
      if (dx * dx + dy * dy > r2) continue
      playerKnockback(p, dx, dy, pr.ffShove.power)   // displacement only, never damage (2026-07-19 amendment)
    }
  }
  state.fx.push({ type: 'boom', x: pr.x, y: pr.y })
}

// Single-target detonation (Wind's FAN_BLADE, Task 5): damage the ONE enemy
// slot the collision check already selected — no radius rescan, no pierce.
// If nothing was overlapping (range/lifetime/bounds termination), this is a
// true miss: no fx, no aggro, no damage. "No miss detonation" (A3) means
// exactly that — an expired fan-blade is silent, unlike Fireball's AoE which
// always lands something at its landing point.
function detonateSingle(state, pr, now, hitIdx) {
  if (hitIdx === -1) { recordMiss(state, pr.category, pr.ownerId); return }
  const store = state.enemyStore
  const meta = { category: pr.category, ownerId: pr.ownerId, label: pr.label }
  triggerAggro(store.aggro[hitIdx], pr.ownerId, store.x[hitIdx], store.y[hitIdx], now, true)
  state.fx.push({ type: 'dmg', x: store.x[hitIdx], y: store.y[hitIdx], v: Math.round(pr.damage) })
  damageEnemy(state, hitIdx, pr.damage, meta)
  recordUseful(state, pr.category, pr.ownerId)
}

function detonate(state, pr, now, hitIdx) {
  if (pr.aoeRadiusPx > 0) detonateAoe(state, pr, now)
  else detonateSingle(state, pr, now, hitIdx)
}

// The enemy slot (if any) whose body overlaps the projectile at its current
// position — refactored (Task 5) to return the selected slot for immediate
// single-target use, rather than only a hit/no-hit boolean. Whoever calls
// this must use the index THIS tick only; it is not safe to hold across a
// removal (same discipline as basicAttacks.js's Earth cone).
function selectHitEnemy(store, pr) {
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - pr.x, dy = store.y[i] - pr.y
    const rr = store.radius[i] + pr.hitRadiusPx
    if (dx * dx + dy * dy <= rr * rr) return i
  }
  return -1
}

export function tickProjectiles(state, now, dtMs) {
  const dtSec = dtMs / 1000
  const list = state.projectiles
  for (let k = 0; k < list.length; k++) {
    const pr = list[k]
    let dx = pr.vx * dtSec, dy = pr.vy * dtSec
    const d = Math.hypot(dx, dy)
    if (d > MAX_STEP_PX) { const f = MAX_STEP_PX / d; dx *= f; dy *= f }
    pr.x += dx
    pr.y += dy
    pr.traveled += Math.hypot(dx, dy)
    pr.ageMs += dtMs

    const offMap = pr.x < 0 || pr.x > CONFIG.MAP_WIDTH || pr.y < 0 || pr.y > CONFIG.MAP_HEIGHT
    if (offMap) {
      pr.x = Math.min(Math.max(pr.x, 0), CONFIG.MAP_WIDTH)
      pr.y = Math.min(Math.max(pr.y, 0), CONFIG.MAP_HEIGHT)
    }

    const hitIdx = selectHitEnemy(state.enemyStore, pr)
    const expiredLifetime = pr.lifetimeMs != null && pr.ageMs >= pr.lifetimeMs
    if (hitIdx !== -1 || pr.traveled >= pr.maxRangePx || offMap || expiredLifetime) {
      detonate(state, pr, now, hitIdx)
      list[k] = list[list.length - 1]   // swap-remove, revisit slot k
      list.pop()
      k--
    }
  }
}

// Resolve every projectile still in flight as a miss (accounting only — a
// no-op on damage/hp) and empty the list. Two call sites, real bug found via
// Task 5's reconciliation test:
//   - tick.js's initFight(): tickProjectiles only runs during FIGHT, so a
//     projectile cast right as a wave clears is frozen mid-flight through
//     BUILD/WAVE_END, then silently dropped when the NEXT fight clears the
//     list — without this, its attempt (already recorded at cast time) never
//     resolves as useful or a miss. This existed for Fireball before Task 5
//     too; Wind's much shorter 500ms-cooldown/400ms-lifetime cast just made
//     it common enough to actually observe in a 10-wave match.
//   - matchRunner.js, once at match end, for the rare case a projectile is
//     still in flight when the harness's last tick lands.
// Harmless outside the harness: state.combatStats is opt-in and every
// record* call below already no-ops without it.
export function flushPendingProjectiles(state) {
  for (const pr of state.projectiles) recordMiss(state, pr.category, pr.ownerId)
  state.projectiles.length = 0
}
