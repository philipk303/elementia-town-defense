// WATER GEYSER (redesign §5.3, Task 11) — the displacement half of the
// "ready/target/impact/cooldown" family (spec §3 family 2). Unlike Rock Trap
// this member resolves instantly on selection (no telegraph), so it needs no
// state beyond the shared `attackReadyAt` cooldown gate.
//
// Selection is footprint-only: any enemy whose CENTER lies within the
// structure's exact footprint rectangle (no margin — that is Firepit's
// family, not this one) is a candidate; among candidates, the one nearest the
// structure's center wins, ties breaking by ascending stable ID. That is what
// makes "exactly one footprint occupant, deterministic under simultaneous
// entry" (spec verification) hold.
//
// Launch reuses the existing weight-scaled knockback primitive (enemyMove.js)
// rather than teleporting: velocity-over-ticks with the shared per-tick step
// clamp already prevents tunneling through a wall, and existing collision +
// arena clamping stop the enemy exactly like any other displacement source.
// A super-heavy enemy is naturally immune (KB_WEIGHT_SCALE's 0.0 tier) — no
// separate weight check needed here.
//
// Task 12 (Wind Vortex, structureBehaviors/cycle.js) reuses `launchInDirection`
// below for its release step rather than duplicating the applyKnockback +
// recordDisplacement pairing — same primitive, different caller. Vortex's
// real release power (BALANCE.TOWER.WIND_SPECIAL.cycle.releasePower) is kept
// at or below ASSUMED_VORTEX_RELEASE_POWER, the placeholder this module
// reserved during Task 11 specifically so Water Geyser's "substantially
// exceeds Vortex release" spec requirement (§5.3) was testable before Vortex
// existed — see waterGeyser.test.js's comparison test.

import { applyKnockback } from '../enemyMove.js'
import { recordDisplacement } from '../combatStats.js'
import { damageEnemy } from '../enemies.js'

export const DIR_VECTOR = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

// Reserved comparison baseline for Wind Vortex's release power (see module
// note above). Vortex's actual value must stay at or below this.
export const ASSUMED_VORTEX_RELEASE_POWER = 220

// Launch one enemy in a locked cardinal direction, weight-scaled, recording
// the impulse for combat instrumentation. Shared by Water Geyser's instant
// resolution and Wind Vortex's release phase (structureBehaviors/cycle.js).
export function launchInDirection(state, store, idx, dir, power, meta) {
  const [dx, dy] = DIR_VECTOR[dir]
  const mag = applyKnockback(store.kvx, store.kvy, idx, dx, dy, power, store.weight[idx])
  recordDisplacement(state, meta, mag)
  return mag
}

function selectFootprintOccupant(store, rect, cx, cy) {
  let best = -1, bestD2 = Infinity, bestId = Infinity
  for (let i = 0; i < store.count; i++) {
    const x = store.x[i], y = store.y[i]
    if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) continue
    const dx = x - cx, dy = y - cy
    const d2 = dx * dx + dy * dy
    const id = store.id[i]
    if (d2 < bestD2 || (d2 === bestD2 && id < bestId)) { best = i; bestD2 = d2; bestId = id }
  }
  return best
}

// Called once per tick for a `spec.displace` structure. `cx`/`cy` and `rect`
// (the exact footprint rectangle) are caller-computed, same convention as
// aura.js's cx/cy — this module has no grid.js dependency of its own. `dtMs`
// is opt-in, same convention as towers.js's aoeStats (§8 occupancy) --
// absent in the live game, the harness supplies it via state.displaceStats.
export function tickDisplacement(state, s, spec, now, cx, cy, rect, dtMs) {
  const store = state.enemyStore
  // Opt-in occupancy instrumentation (§8, 2026-08-29 audit), checked BEFORE
  // the cooldown gate below -- unlike the selection/launch logic, "is anyone
  // standing here" must not go blind while the structure is on cooldown, or
  // this would undercount exactly like the pre-fix Watchtower reach check.
  if (state.displaceStats) {
    const idxProbe = selectFootprintOccupant(store, rect, cx, cy)
    if (idxProbe !== -1) {
      state.displaceStats.activeTicks++
      state.displaceStats.enemySeconds += (dtMs / 1000)   // footprint-only selection: at most one occupant counted
    }
  }
  if (now < (s.attackReadyAt || 0)) return
  const idx = selectFootprintOccupant(store, rect, cx, cy)
  if (idx === -1) return

  s.attackReadyAt = now + spec.cooldownMs
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  if (spec.damage > 0 && damageEnemy(state, idx, spec.damage, meta)) return // died -> nothing to launch

  launchInDirection(state, store, idx, s.dir, spec.displace.power, meta)
}
