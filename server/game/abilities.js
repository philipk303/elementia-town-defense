// Element ability resolution (Phase 4). Server-authoritative: every special
// resolves here on cast, with the two-axis scaling the spec demands —
// displacement (knockback/pull) scales by the target's WEIGHT tier
// (KB_WEIGHT_SCALE; super-heavy immune), slow/root/freeze durations scale by
// its SPEED tier (status.js; super-fast immune). Both scales also apply to
// PLAYERS under friendly fire, via the same tier tables (elementKits maps the
// spec's weight/speed ranks onto them — Earth is super-heavy and shrugs off
// teammate shoves; Wind is light and flies).
//
// Friendly fire (room setting): with FF ON, AoE/cone/pull abilities damage and
// displace teammates caught in them (never the caster); with FF OFF teammates
// are untouched. Players carry no status object in slice 1, so FF transmits
// damage + displacement but not burn/slow/root (spec-amendment decision).
//
// L3 ("global power boost to special attacks") multiplies SPECIAL damage and
// area by LEVELING.L3_SPECIAL_BOOST; the L4 seconds arrive after L3 and ship
// at their designed numbers unboosted. L4 seconds are locked below team
// level 4. Ability damage always pulls aggro toward the caster (attention
// follows damage — same triggerAggro(byDamage) rule as the melee basic).

import { BALANCE } from '../../shared/balance.js'
import { damageEnemy } from './enemies.js'
import { applyKnockback, playerKnockback } from './enemyMove.js'
import { applyRoot, applyBurn, applyWet } from './status.js'
import { triggerAggro, effectivePullRange } from './aggro.js'
import { spawnProjectile } from './projectiles.js'
import { recordAttempt, recordMiss, recordUseful, hitsSoFar, recordDisplacement } from './combatStats.js'

const A = BALANCE.ABILITY

function specialBoost(state) {
  return state.teamLevel >= 3 ? BALANCE.LEVELING.L3_SPECIAL_BOOST : 1
}

// Damage + aggro + combat-text fx for one enemy slot. Returns true if the
// enemy died (slot swap-removed; the caller's loop must revisit index i).
// Takes the caster PLAYER (not just its id) so the combat-accounting instrument
// can label the hit by element — see combatStats.js deathsByClass.
function hitEnemy(state, i, dmg, caster, now) {
  const store = state.enemyStore
  triggerAggro(store.aggro[i], caster.id, store.x[i], store.y[i], now, true)
  state.fx.push({ type: 'dmg', x: store.x[i], y: store.y[i], v: Math.round(dmg) })
  return damageEnemy(state, i, dmg, { category: 'ability', ownerId: caster.id, label: caster.element })
}

// Displacement instrumentation (Task 3b) for the four ability call sites
// below that apply a knockback/pull. Mirrors hitEnemy's meta shape.
function knockback(state, store, i, dx, dy, power, weightTier, caster) {
  const s = applyKnockback(store.kvx, store.kvy, i, dx, dy, power, weightTier)
  recordDisplacement(state, { category: 'ability', ownerId: caster.id, label: caster.element }, s)
}

// Attempt/miss/useful bookkeeping shared by trySpecial and trySecond: an
// activation is "useful" if it landed at least one hit (hitsSoFar increased),
// a "miss" otherwise. attempts === useful + misses by construction.
function markActivation(state, p, hitsBefore) {
  if (hitsSoFar(state, 'ability', p.id) > hitsBefore) recordUseful(state, 'ability', p.id)
  else recordMiss(state, 'ability', p.id)
}

// FF gate: run cb over every living teammate (never the caster) when the
// room's friendly-fire flag is on.
function forFFTeammates(state, caster, cb) {
  if (!state.settings.friendlyFire) return
  for (const p of state.players) {
    if (p === caster || !p.alive) continue
    cb(p)
  }
}

const inRadius = (dx, dy, r) => dx * dx + dy * dy <= r * r

// In-cone test: within range of the caster AND within halfAngle of the aim.
function inCone(dx, dy, aimX, aimY, range, halfAngle) {
  const d = Math.hypot(dx, dy)
  if (d > range) return false
  if (d < 1e-9) return true
  const cos = (dx * aimX + dy * aimY) / d
  return cos >= Math.cos(halfAngle)
}

// On-segment test: projection onto the aim within [0, len], perpendicular
// distance within halfWidth.
function onLine(dx, dy, aimX, aimY, len, halfWidth) {
  const proj = dx * aimX + dy * aimY
  if (proj < 0 || proj > len) return false
  const perp = Math.abs(dx * aimY - dy * aimX)
  return perp <= halfWidth
}

export function trySpecial(state, p, now) {
  const spec = A[p.element].SPECIAL
  if (now < p.specialReadyAt) return
  p.specialReadyAt = now + spec.cooldownMs
  state.fx.push({ type: 'ability', x: p.x, y: p.y })
  // Drives the caster's special-cast animation (client/src/render/
  // AnimationController.js's CHARACTER_STATE.SPECIAL) the same way a basic
  // attack drives CAST — shares the basic's own per-player seq counter since
  // the two channels gate independently on the client (CharacterAnimator has
  // separate lastSeq/lastSpecialSeq), so one shared monotonic source is
  // sufficient and avoids a second per-player counter field.
  p.atkSeq = (p.atkSeq ?? 0) + 1
  state.atkFx.push({
    srcId: p.id, kind: 'SPECIAL_CAST', x: p.x, y: p.y, aimX: p.aimX, aimY: p.aimY, seq: p.atkSeq,
  })
  recordAttempt(state, 'ability', p.id)
  const hitsBefore = hitsSoFar(state, 'ability', p.id)

  const boost = specialBoost(state)
  const store = state.enemyStore

  switch (p.element) {
    case 'EARTH': {  // Ground Slam — AoE damage + a modest weight-scaled
                     // outward shove (2026-07-19: nerfed off the slow effect
                     // and damage 26->16, it read as too strong)
      const r = spec.radiusPx * boost
      const dmg = Math.round(spec.damage * boost)
      for (let i = 0; i < store.count; i++) {
        const dx = store.x[i] - p.x, dy = store.y[i] - p.y
        if (!inRadius(dx, dy, r + store.radius[i])) continue
        knockback(state, store, i, dx, dy, spec.knockback.power, store.weight[i], p)
        if (hitEnemy(state, i, dmg, p, now)) i--
      }
      forFFTeammates(state, p, q => {
        const dx = q.x - p.x, dy = q.y - p.y
        if (inRadius(dx, dy, r)) playerKnockback(q, dx, dy, spec.knockback.power)
      })
      break
    }

    case 'FIRE': {   // Fireball — real projectile (projectiles.js flies/detonates it).
                     // No enemy-facing displacement; FF teammates get the
                     // ability's dedicated ffShove instead of damage.
      // Damage lands later, at detonation (a later tick) — the cast itself
      // cannot know yet whether it hit anything, so unlike the other three
      // cases the useful/miss call is projectiles.js's job, not this
      // function's (see detonate()'s markProjectileActivation).
      spawnProjectile(state, {
        type: 'FIREBALL', ownerId: p.id, label: p.element,
        x: p.x, y: p.y, dirX: p.aimX, dirY: p.aimY,
        damage: Math.round(spec.damage * boost), burn: spec.burn,
        areaBoost: boost,   // L3 scales blast area/range too (parity with the other specials)
        ffShove: spec.ffShove,
      })
      return
    }

    case 'WATER': {  // Whirlpool (2026-07-19: swapped from Wind) — weight-
                     // scaled pull toward the caster, honoring each enemy's
                     // diminishing pull-range (anti-yank)
      const baseR = spec.radiusPx * boost
      const dmg = Math.round(spec.damage * boost)
      for (let i = 0; i < store.count; i++) {
        const dx = store.x[i] - p.x, dy = store.y[i] - p.y
        const effR = Math.min(baseR, effectivePullRange(store.aggro[i], baseR))
        if (!inRadius(dx, dy, effR + store.radius[i])) continue
        knockback(state, store, i, -dx, -dy, spec.pull.power, store.weight[i], p)
        if (hitEnemy(state, i, dmg, p, now)) i--
      }
      forFFTeammates(state, p, q => {
        const dx = q.x - p.x, dy = q.y - p.y
        if (inRadius(dx, dy, baseR)) playerKnockback(q, -dx, -dy, spec.pull.power)
      })
      break
    }

    case 'WIND': {   // Wind Blast (2026-07-19: swapped from Water) — broad
                     // radial, weight-scaled push away from the caster
      const r = spec.radiusPx * boost
      const dmg = Math.round(spec.damage * boost)
      for (let i = 0; i < store.count; i++) {
        const dx = store.x[i] - p.x, dy = store.y[i] - p.y
        if (!inRadius(dx, dy, r + store.radius[i])) continue
        knockback(state, store, i, dx, dy, spec.knockback.power, store.weight[i], p)
        if (hitEnemy(state, i, dmg, p, now)) i--
      }
      forFFTeammates(state, p, q => {
        const dx = q.x - p.x, dy = q.y - p.y
        if (inRadius(dx, dy, r)) playerKnockback(q, dx, dy, spec.knockback.power)
      })
      break
    }
  }
  markActivation(state, p, hitsBefore)
}

export function trySecond(state, p, now) {
  if (state.teamLevel < 4) return   // L4 unlock (spec §2 ladder)
  const spec = A[p.element].SECOND
  if (now < p.secondReadyAt) return
  p.secondReadyAt = now + spec.cooldownMs
  state.fx.push({ type: 'ability2', x: p.x, y: p.y })
  // Same special-cast animation channel as trySpecial above — the L4 second
  // reads on-screen as the same "special cast" beat as the Q ability.
  p.atkSeq = (p.atkSeq ?? 0) + 1
  state.atkFx.push({
    srcId: p.id, kind: 'SPECIAL_CAST', x: p.x, y: p.y, aimX: p.aimX, aimY: p.aimY, seq: p.atkSeq,
  })
  recordAttempt(state, 'ability', p.id)
  const hitsBefore = hitsSoFar(state, 'ability', p.id)

  const store = state.enemyStore

  switch (p.element) {
    case 'EARTH': {  // Fissure — aim-line damage + speed-scaled root. No
                     // enemy-facing displacement, so FF teammates get shoved
                     // along the aim line via ffShove instead of damaged.
      const halfW = spec.widthPx / 2
      for (let i = 0; i < store.count; i++) {
        const dx = store.x[i] - p.x, dy = store.y[i] - p.y
        if (!onLine(dx, dy, p.aimX, p.aimY, spec.rangePx, halfW + store.radius[i])) continue
        const wasRooted = store.status[i].rootMs > 0
        applyRoot(store.status[i], spec.root.ms, store.speed[i])
        if (!wasRooted && store.status[i].rootMs > 0) state.fx.push({ type: 'root', x: store.x[i], y: store.y[i] })
        if (hitEnemy(state, i, spec.damage, p, now)) i--
      }
      forFFTeammates(state, p, q => {
        if (onLine(q.x - p.x, q.y - p.y, p.aimX, p.aimY, spec.rangePx, halfW)) {
          playerKnockback(q, p.aimX, p.aimY, spec.ffShove.power)
        }
      })
      break
    }

    case 'FIRE': {   // Flame Nova — radial burst + strong burn; FF teammates
                     // shoved (ffShove), not damaged.
      for (let i = 0; i < store.count; i++) {
        if (!inRadius(store.x[i] - p.x, store.y[i] - p.y, spec.radiusPx + store.radius[i])) continue
        const wasBurning = store.status[i].burnMs > 0
        applyBurn(store.status[i], spec.burn.dps, spec.burn.ms)
        if (!wasBurning && store.status[i].burnMs > 0) state.fx.push({ type: 'burn', x: store.x[i], y: store.y[i] })
        if (hitEnemy(state, i, spec.damage, p, now)) i--
      }
      forFFTeammates(state, p, q => {
        const dx = q.x - p.x, dy = q.y - p.y
        if (inRadius(dx, dy, spec.radiusPx)) playerKnockback(q, dx, dy, spec.ffShove.power)
      })
      break
    }

    case 'WATER': {  // Tidal Wave — wide cone shove + Wet (the Blizzard
                     // enabler). Unchanged shape (still a push, even though
                     // L1 Water now pulls — see the spec amendment).
      for (let i = 0; i < store.count; i++) {
        const dx = store.x[i] - p.x, dy = store.y[i] - p.y
        if (!inCone(dx, dy, p.aimX, p.aimY, spec.rangePx + store.radius[i], spec.halfAngleRad)) continue
        applyWet(store.status[i], spec.wet.ms)
        knockback(state, store, i, dx, dy, spec.knockback.power, store.weight[i], p)
        if (hitEnemy(state, i, spec.damage, p, now)) i--
      }
      forFFTeammates(state, p, q => {
        const dx = q.x - p.x, dy = q.y - p.y
        if (inCone(dx, dy, p.aimX, p.aimY, spec.rangePx, spec.halfAngleRad)) {
          playerKnockback(q, dx, dy, spec.knockback.power)
        }
      })
      break
    }

    case 'WIND': {   // Gale Dash — self-launch along the aim (velocity-over-
                     // ticks, same clamp/decay as every displacement), damaging
                     // enemies along the projected path. No teammate effects.
      // Total displacement of v0 with per-tick decay k at 60 Hz is
      // v0*(dt)*(1/(1-k)) ⇒ v0 = dashPx * 60 * (1 - KB_DECAY). Launch speed
      // derived from the balance dash distance rather than hand-tuned.
      const v0 = spec.dashPx * 60 * 0.15
      p.kvx += p.aimX * v0
      p.kvy += p.aimY * v0
      for (let i = 0; i < store.count; i++) {
        const dx = store.x[i] - p.x, dy = store.y[i] - p.y
        if (!onLine(dx, dy, p.aimX, p.aimY, spec.dashPx, spec.hitRadiusPx + store.radius[i])) continue
        if (hitEnemy(state, i, spec.damage, p, now)) i--
      }
      break
    }
  }
  markActivation(state, p, hitsBefore)
}
