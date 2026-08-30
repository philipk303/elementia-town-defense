// Enemy flow-field descent + velocity-based knockback (spec §5).
//
//   - Descent replicates the corner-cut guard (a squeeze the field expansion
//     rejected must also be rejected when an enemy picks its step).
//   - Deterministic tie-break by tile index.
//   - Knockback is ALWAYS velocity-over-ticks, never a positional impulse;
//     per-tick displacement is clamped below one tile so an enemy can never
//     tunnel through a wall in a single tick.
//   - Displacement works in all directions incl. toward the hall (spec: no
//     progress clamp) — only weight scales it (super-heavy = immune).

import {
  TILES_W, tileIdx, inBounds, NEIGHBOR_DX, NEIGHBOR_DY, TILE_SIZE,
} from './grid.js'

// Per-tick displacement clamp: strictly below one tile edge.
export const MAX_STEP_PX = TILE_SIZE - 1 // 31 px/tick (= 1860 px/s at 60Hz)

// Knockback velocity multiplier per weight tier: light, medium, heavy, super-heavy.
export const KB_WEIGHT_SCALE = new Float64Array([1.0, 0.6, 0.3, 0.0])
export const KB_DECAY_PER_TICK = 0.85

// Global displacement-velocity cap (redesign §5.4 Wind Vortex verification:
// "multiple displacement sources cannot produce invalid velocity or permanent
// capture"). Wind Vortex's repeating suction pulses are the first source that
// can stack onto an already-displaced enemy within the same brief window
// (Water Geyser/Grinder fire once per cooldown; Vortex fires every pulseMs).
// 900 px/s is the strongest single realistic hit on a light enemy (see
// enemyMove.test.js); this cap sits well above any one hit but stops repeated
// stacked impulses from growing kb velocity — and therefore its decay-out
// time — without bound.
export const MAX_KB_VELOCITY = 1500

// Pick the descent step for an enemy on tile (gx, gy).
// Returns the neighbor slot 0..7 with the lowest cost that is strictly below
// the current tile's cost and passes the corner-cut guard, or -1 if none
// (enemy is stalled — at a local minimum, typically pressed against a wall
// it should attack). Ties break toward the smaller tile index.
export function chooseStepDir(field, gx, gy) {
  const cur = field.cost[tileIdx(gx, gy)]
  let best = -1
  let bestCost = cur
  let bestIdx = -1
  for (let k = 0; k < 8; k++) {
    const nx = gx + NEIGHBOR_DX[k]
    const ny = gy + NEIGHBOR_DY[k]
    if (!inBounds(nx, ny)) continue
    const v = tileIdx(nx, ny)
    if (field.blocked[v]) continue
    if (k >= 4) { // corner-cut guard, same rule as field expansion
      if (field.solidAt(gx + NEIGHBOR_DX[k], gy)) continue
      if (field.solidAt(gx, gy + NEIGHBOR_DY[k])) continue
    }
    const c = field.cost[v]
    if (c < bestCost - 1e-12 || (Math.abs(c - bestCost) <= 1e-12 && best !== -1 && v < bestIdx)) {
      best = k
      bestCost = c
      bestIdx = v
    }
  }
  return best
}

// Add a knockback impulse to an enemy's kb velocity (px/s), scaled by weight.
// kvx/kvy are Float64Arrays indexed by enemy slot. Returns the weight-scaled
// magnitude actually applied (0 for an immune super-heavy target) — combat
// instrumentation (combatStats.js recordDisplacement) uses this as its
// per-source impulse proxy; callers that don't care can ignore the return.
export function applyKnockback(kvx, kvy, i, dirX, dirY, power, weightTier) {
  const s = KB_WEIGHT_SCALE[weightTier] * power
  const len = Math.hypot(dirX, dirY) || 1
  kvx[i] += (dirX / len) * s
  kvy[i] += (dirY / len) * s
  const mag = Math.hypot(kvx[i], kvy[i])
  if (mag > MAX_KB_VELOCITY) {
    const f = MAX_KB_VELOCITY / mag
    kvx[i] *= f
    kvy[i] *= f
  }
  return s
}

// Weight-scaled displacement for a player body (the object-shaped counterpart
// of applyKnockback's SoA signature above). Lives here, not in players.js or
// abilities.js, so both abilities.js and projectiles.js can import it without
// an import cycle (this module has no game-state-level dependencies).
export function playerKnockback(p, dirX, dirY, power) {
  const s = KB_WEIGHT_SCALE[p.weight] * power
  const len = Math.hypot(dirX, dirY) || 1
  p.kvx += (dirX / len) * s
  p.kvy += (dirY / len) * s
}

// Integrate one tick of movement: desired flow direction * moveSpeed plus kb
// velocity, with the per-tick displacement clamped to MAX_STEP_PX. Decays kb.
// Writes the new position into xs/ys. Returns nothing; allocation-free.
export function integrate(xs, ys, kvx, kvy, i, dirX, dirY, moveSpeed, dt) {
  let dx = dirX * moveSpeed * dt + kvx[i] * dt
  let dy = dirY * moveSpeed * dt + kvy[i] * dt
  const d = Math.hypot(dx, dy)
  if (d > MAX_STEP_PX) {
    const f = MAX_STEP_PX / d
    dx *= f
    dy *= f
  }
  xs[i] += dx
  ys[i] += dy
  kvx[i] *= KB_DECAY_PER_TICK
  kvy[i] *= KB_DECAY_PER_TICK
  if (Math.abs(kvx[i]) < 0.5) kvx[i] = 0
  if (Math.abs(kvy[i]) < 0.5) kvy[i] = 0
}
