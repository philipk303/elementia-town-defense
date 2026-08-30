// Status-effect system (spec §2/§4 two-axis CC scaling). Pure functions over a
// per-enemy status object (preallocated once per store slot, reset on spawn —
// no per-tick allocation). The other CC axis, displacement (push/pull), scales
// by WEIGHT and lives in enemyMove.js; the two are INDEPENDENT — a rooted enemy
// can still be knocked back (root gates movement speed, not the kb velocity).
//
// Scaling: slow/root/freeze DURATION and slow STRENGTH are resisted by the
// enemy's SPEED tier (CC_*_SCALE, super-fast tier → 0 = full immunity). Burn is
// pure damage-over-time with no tier scaling.

import { BALANCE } from '../../shared/balance.js'
import { SPEED } from './enemyTypes.js'

// Object ref, not a destructure (Phase 8A liveness — see aggro.js).
const S = BALANCE.STATUS

// "No source owns this root." Deliberately NOT 0: structure ids are allocated
// from 0 upward (structures.js), and a fusion inherits an ingredient's id, so
// a 0 sentinel could collide with a real Muddy Bog. If it ever did, that Bog's
// destruction would zero EVERY unowned root on the field. Today the collision
// is unreachable only by accident (the seeded farm takes id 0 first), which is
// too thin a thread to hang it on — Gate 6 review.
export const NO_ROOT_SOURCE = -1

export function makeStatus() {
  return {
    burnMs: 0, burnDps: 0, wetMs: 0, slowMs: 0, slowFactor: 1, rootMs: 0, freezeMs: 0,
    rootSourceId: NO_ROOT_SOURCE,
    // Steam Vent confusion (§6.1, Amendment A2.2) — a THIRD independent CC axis.
    // It gates the enemy's steering CHOICE, not its locomotion speed (root) and
    // not its knockback velocity (displacement). Preallocated here so the hot
    // loop never allocates; see applyConfusion for what each field means.
    confusedMs: 0, confuseCapMs: 0, confuseImmuneMs: 0,
    confuseTurnMs: 0, confuseTurn: 0, confuseSeed: 0,
    confuseHx: 0, confuseHy: 0,
  }
}

export function resetStatus(s) {
  s.burnMs = 0; s.burnDps = 0; s.wetMs = 0
  s.slowMs = 0; s.slowFactor = 1; s.rootMs = 0; s.freezeMs = 0; s.rootSourceId = NO_ROOT_SOURCE
  s.confusedMs = 0; s.confuseCapMs = 0; s.confuseImmuneMs = 0
  s.confuseTurnMs = 0; s.confuseTurn = 0; s.confuseSeed = 0
  s.confuseHx = 0; s.confuseHy = 0
  return s
}

// Duration after speed-tier resistance. super-fast (index 3) → 0.
export function scaledDurationMs(baseMs, speedTier) {
  return baseMs * S.CC_DURATION_SCALE[speedTier]
}

// A slow's target speed FRACTION after resistance. baseFactor is the full-effect
// fraction (0.5 = half speed); resistance shrinks the (1-baseFactor) slowdown.
// super-fast → 1 (no slow at all).
export function effectiveSlowFactor(baseFactor, speedTier) {
  return 1 - (1 - baseFactor) * S.CC_STRENGTH_SCALE[speedTier]
}

// Burn: pure DoT, no tier scaling. Strongest dps wins; duration refreshes.
export function applyBurn(s, dps, ms) {
  if (dps > s.burnDps) s.burnDps = dps
  if (ms > s.burnMs)   s.burnMs = ms
}

export function applyWet(s, ms) {
  if (ms > s.wetMs) s.wetMs = ms
}

// Slow stacking (single-slot model, CP2 M3): the STRONGEST factor persists for
// the LONGEST remaining duration among applied slows. This slightly favors the
// player when a strong-short slow overlaps a weak-long one (the strong factor
// rides the long tail) — accepted for slice 1 (no per-slow stack), flagged for
// the Phase 8 sweep. NOT strict "strongest single slow wins".
export function applySlow(s, baseFactor, baseMs, speedTier) {
  const ms = scaledDurationMs(baseMs, speedTier)
  if (ms <= 0) return                       // fully resisted (super-fast)
  const f = effectiveSlowFactor(baseFactor, speedTier)
  if (ms > s.slowMs) s.slowMs = ms          // keep the longer remaining time
  if (f < s.slowFactor) s.slowFactor = f    // keep the stronger slow
}

// `sourceId` (Amendment A2.2) lets Muddy Bog associate the active root with
// the specific Bog that applied it, so that Bog's destruction can end only
// the root it owns (§6.4). Defaults to NO_ROOT_SOURCE for every other caller —
// a root that outlives its owner's destruction (e.g. the Earth root ability)
// is untouched by this ownership tracking.
export function applyRoot(s, baseMs, speedTier, sourceId = NO_ROOT_SOURCE) {
  const ms = scaledDurationMs(baseMs, speedTier)
  if (ms <= 0) return                       // super-fast is root-immune
  if (ms > s.rootMs) { s.rootMs = ms; s.rootSourceId = sourceId }
}

export function applyFreeze(s, baseMs, speedTier) {
  const ms = scaledDurationMs(baseMs, speedTier)
  if (ms <= 0) return                       // super-fast is freeze-immune
  if (ms > s.freezeMs) s.freezeMs = ms
}

// --- Steam Vent confusion (§6.1, Amendment A2.2) -----------------------------
//
// "Deterministic seeded wander heading" is satisfied by a HASH of (enemy id,
// turn index), deliberately NOT by a draw off `state.rng`. That stream also
// feeds the gate order and the spawn schedule, so consuming from it here would
// silently move every seeded measurement ever published for this project.
// A hash is reproducible, order-independent, and free of that coupling.
//
// 16 compass directions rather than a continuous angle: the heading is a
// steering input, and a coarse set keeps a wandering crowd's directions
// legible on screen without changing anything mechanically.
const WANDER_DIRS = 16
export function wanderHeading(enemyId, turn) {
  let h = (Math.imul(enemyId | 0, 0x9E3779B1) ^ Math.imul(turn | 0, 0x85EBCA77)) >>> 0
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0; h ^= h >>> 13
  const a = (h % WANDER_DIRS) / WANDER_DIRS * Math.PI * 2
  return [Math.cos(a), Math.sin(a)]
}

function pickHeading(s) {
  const [hx, hy] = wanderHeading(s.confuseSeed, s.confuseTurn)
  s.confuseHx = hx; s.confuseHy = hy
}

// Confuse `s` for `baseMs` (speed-tier resisted, so super-fast is immune and
// "faster enemies recover sooner" falls out of the same scale root/freeze use).
//
// The bound §6.1 asks for — "recovery grants brief confusion immunity so
// persistent occupation or overlapping Vents cannot create permanent
// wandering" — is enforced by an EPISODE BUDGET, not by capping a single
// application. `confuseCapMs` is set once when an episode begins and decays
// with it; every refresh, from this source or any other, is clamped to what is
// left of that budget. So N overlapping vents refreshing every tick still buy
// exactly one episode, and an enemy parked in a cloud forever still recovers
// on schedule and then sits out the immunity window. That makes the confused
// fraction of a permanent occupant provably <= cap/(cap+immunity) < 1.
export function applyConfusion(s, baseMs, speedTier, enemyId) {
  if (s.confuseImmuneMs > 0) return          // recovering: nothing re-applies
  const ms = scaledDurationMs(baseMs, speedTier)
  if (ms <= 0) return                        // super-fast is confusion-immune
  if (s.confusedMs <= 0) {                   // a NEW episode
    s.confuseCapMs = scaledDurationMs(S.CONFUSE.maxEpisodeMs, speedTier)
    s.confuseSeed = enemyId | 0
    s.confuseTurn = 0
    s.confuseTurnMs = S.CONFUSE.turnMs
    pickHeading(s)                           // a heading exists on the FIRST tick
  }
  const want = ms > s.confusedMs ? ms : s.confusedMs
  s.confusedMs = want < s.confuseCapMs ? want : s.confuseCapMs
}

export function isConfused(s) { return s.confusedMs > 0 }

export function isRooted(s) { return s.rootMs > 0 || s.freezeMs > 0 }

// Movement-speed multiplier this tick: 0 if rooted/frozen, else the strongest
// active slow (explicit slow and wet's mild slow both apply; stronger wins).
export function speedMultiplier(s) {
  if (s.rootMs > 0 || s.freezeMs > 0) return 0
  let m = 1
  if (s.slowMs > 0 && s.slowFactor < m) m = s.slowFactor
  if (s.wetMs > 0 && S.WET.slowFactor < m) m = S.WET.slowFactor
  return m
}

// Advance all timers by dtMs and return the burn damage dealt this tick.
// Restores slowFactor to 1 when the slow lapses so a stale factor never lingers.
export function tickStatus(s, dtMs) {
  let burn = 0
  if (s.burnMs > 0) {
    const active = Math.min(s.burnMs, dtMs)
    burn = s.burnDps * (active / 1000)
    s.burnMs -= dtMs
    if (s.burnMs <= 0) { s.burnMs = 0; s.burnDps = 0 }
  }
  if (s.wetMs > 0)    s.wetMs = Math.max(0, s.wetMs - dtMs)
  if (s.rootMs > 0)   s.rootMs = Math.max(0, s.rootMs - dtMs)
  if (s.freezeMs > 0) s.freezeMs = Math.max(0, s.freezeMs - dtMs)
  if (s.slowMs > 0) {
    s.slowMs -= dtMs
    if (s.slowMs <= 0) { s.slowMs = 0; s.slowFactor = 1 }
  }
  // Immunity decays first, so an episode ending THIS tick still gets its full
  // fresh window rather than one dt short of it.
  if (s.confuseImmuneMs > 0) s.confuseImmuneMs = Math.max(0, s.confuseImmuneMs - dtMs)
  if (s.confusedMs > 0) {
    s.confusedMs -= dtMs
    s.confuseCapMs -= dtMs
    if (s.confusedMs <= 0 || s.confuseCapMs <= 0) {
      // Either the applied duration ran out or the episode budget did. Both are
      // a recovery and both owe the immunity window. The heading is zeroed so a
      // stale one can never steer anything on a later tick.
      s.confusedMs = 0; s.confuseCapMs = 0
      s.confuseImmuneMs = S.CONFUSE.immunityMs
      s.confuseHx = 0; s.confuseHy = 0
    } else {
      s.confuseTurnMs -= dtMs
      if (s.confuseTurnMs <= 0) {
        s.confuseTurn++
        s.confuseTurnMs += S.CONFUSE.turnMs
        pickHeading(s)
      }
    }
  }
  return burn
}
