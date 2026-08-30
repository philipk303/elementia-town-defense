// Enemy aggro state machine (spec §4). Pure functions over a per-enemy aggro
// object (preallocated per store slot, reset on spawn). Players AND bots are
// valid targets and never block the flow field (the sim simply never treats a
// player as a solid tile), so aggro only redirects an enemy's steering — the
// underlying march is always the cost-field descent toward the hall.
//
// States:
//   march  — follow the flow field (default; also the "beeline the hall" state).
//   chase  — locked onto a target, steering at it, within a sticky window.
//   commit — anti-kite lockout: ignore all new aggro and march the hall for a
//            brief window, with a diminishing pull-range on repeated yanks.
//
// Triggers: proximity OR damage. Sticky threat holds the lock ~2-3s (refreshed
// by continued hits); a hit can retarget mid-window (attention follows damage)
// but mere proximity of another player cannot steal a locked enemy. Leaving the
// leash radius (measured from where the chase began) or exceeding the chase
// time cap reverts to marching AND enters commit — you can peel an enemy off a
// wall, but you can't kite the horde in a circle forever.

import { BALANCE } from '../../shared/balance.js'

// Object ref, not a destructure: destructuring to primitives at import makes
// every one of these keys DEAD to a runtime balance sweep (Phase 8A).
const A = BALANCE.AGGRO

export const AGGRO_MODE = { MARCH: 0, CHASE: 1 }

export function makeAggro() {
  return {
    state: 'march', targetId: -1,
    stickyUntilMs: 0, chaseStartMs: 0, committedUntilMs: 0,
    anchorX: 0, anchorY: 0, pullCount: 0,
  }
}

export function resetAggro(a) {
  a.state = 'march'; a.targetId = -1
  a.stickyUntilMs = 0; a.chaseStartMs = 0; a.committedUntilMs = 0
  a.anchorX = 0; a.anchorY = 0; a.pullCount = 0
  return a
}

function enterCommit(a, now) {
  a.state = 'commit'
  a.committedUntilMs = now + A.COMMIT_MS
  a.targetId = -1
  a.pullCount++
}

// Attempt to (re)aggro onto targetId. Returns true if the lock changed/refreshed.
//
// null/structure path (Amendment A3.3/C.1, 2026-08-01): a team-owned
// structure's damage (Firestorm's volley, and any future structure-owned
// effect) has no live player id to redirect attention to — `ownerId` is null
// after fusion (combos.js). A null targetId is a no-op rather than a "chase
// nobody": without this guard it would bypass the sticky-lock check below
// (byDamage=true always can) and overwrite a real, live chase with a target
// no enemy-loop lookup can ever resolve, dropping the enemy back to marching
// a tick early for no reason.
export function triggerAggro(a, targetId, ex, ey, now, byDamage) {
  if (targetId == null) return false
  if (a.state === 'commit') {
    if (now < a.committedUntilMs) return false   // committed: ignore all aggro
    a.state = 'march'                            // commit lapsed
  }
  if (a.state === 'chase') {
    if (targetId === a.targetId) { a.stickyUntilMs = now + A.STICKY_MS; return true } // refresh
    if (now < a.stickyUntilMs && !byDamage) return false  // sticky lock vs. proximity
  }
  // Start a fresh chase (from march, a lapsed sticky, or a damage-retarget).
  a.state = 'chase'
  a.targetId = targetId
  a.stickyUntilMs = now + A.STICKY_MS
  a.chaseStartMs = now
  a.anchorX = ex
  a.anchorY = ey
  return true
}

// Per-tick resolution for one enemy. `target` is the locked player's live
// position ({id,x,y}) or null if it's gone; `inProximity` is whether that
// target is still within the aggro radius. Mutates state; returns the steering
// mode (MARCH = descend the flow field, CHASE = steer at target.x/y).
export function updateAggro(a, ex, ey, target, inProximity, now) {
  if (a.state === 'commit') {
    if (now >= a.committedUntilMs) a.state = 'march'
    return AGGRO_MODE.MARCH
  }
  if (a.state === 'chase') {
    if (!target) { a.state = 'march'; a.targetId = -1; return AGGRO_MODE.MARCH }
    const dxA = ex - a.anchorX, dyA = ey - a.anchorY
    if (dxA * dxA + dyA * dyA > A.LEASH_PX * A.LEASH_PX) { enterCommit(a, now); return AGGRO_MODE.MARCH }
    if (now - a.chaseStartMs > A.CHASE_CAP_MS) { enterCommit(a, now); return AGGRO_MODE.MARCH }
    if (now >= a.stickyUntilMs && !inProximity) { a.state = 'march'; a.targetId = -1; return AGGRO_MODE.MARCH }
    return AGGRO_MODE.CHASE
  }
  return AGGRO_MODE.MARCH
}

// Diminishing pull-range after repeated yanks (consumed by Phase-4 pull
// abilities; the FSM tracks the count via each commit). The stack count is
// capped (CP2 M2) so the range floors above zero — a much-yanked enemy stays
// pullable rather than becoming permanently immune.
export function effectivePullRange(a, baseRange) {
  return baseRange * A.PULL_DIMINISH ** Math.min(a.pullCount, A.PULL_DIMINISH_MAX)
}
