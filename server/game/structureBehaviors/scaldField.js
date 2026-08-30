// STEAM VENT / STEAM_VENT (redesign §6.1, Amendment A2.2, Task 16; retuned
// 2026-08-15) — the SCALD half of the PERSISTENT AREA STATUS family (spec §3
// family 4), the sibling of areaEntry.js's Muddy Bog. A walkable, always-active
// 2x2 fusion wrapped in a ~3x3 steam cloud: everything standing in the cloud
// takes a scald pulse on the vent's cadence and has a strong slow refreshed.
//
// WHY SLOW AND NOT CONFUSION (2026-08-15). This module applied confusion until
// the steam-vent-mechanism decomposition measured what confusion was worth:
// +0.013 hallHpAuc on maze B and +0.045 on maze A, at n=900/cell — an eighth of
// the declared MDE, on the maze where the structure was resolvably harmful. It
// was not under-tuned, it was INERT, while being the structure's signature
// mechanic. See docs/reviews/2026-08-15-steam-vent-mechanism.md.
//
// The slow is not a generic CC bolted on in its place. Its job is SELF-SYNERGY:
// a slowed enemy spends longer inside the cloud, so the scald lands more pulses
// on it. That is what earns the higher per-pulse damage, and it is also what
// keeps the vent distinct from Muddy Bog, whose root is a hard stop paired with
// low chip damage (terrain denial). Vent keeps you in the pain; Bog stops you
// dead. A1.4(b) forbids either being strictly dominated by the other.
//
// Everything that BOUNDS the slow lives in status.js, not here. This module only
// asks "is this enemy in my cloud right now"; applySlow decides whether that
// request turns into a slow, and the speed-tier resistance there is what keeps
// super-fast enemies immune and stops overlapping vents from stacking
// multipliers. Putting that on this side would have meant every future slow
// source re-deriving it.
//
// No per-enemy state, unlike the Bog. The Bog needs a per-enemy map because its
// damage is owned (only the Bog that owns the active root may pulse it); a vent
// has nothing to own, so a single structure-wide clock is the whole cadence.
// That clock is ARMED-ONLY: it advances only on a tick that actually found an
// occupant, so an empty vent stays ready instead of burning its interval on
// empty air. That is the Firepit phase-alignment defect
// (docs/reviews/2026-07-25-firepit-falsification-test.md) — a pulse family whose
// output depends on how its cadence happens to line up with enemy transit is
// measuring the alignment, not the structure.
//
// The rectangle test doubles as the damage POSITION GATE, and that matters: an
// enemy displaced out of the cloud while still slowed keeps its slow (it is a
// status with its own duration) but must stop taking scald damage immediately.
// Status and displacement are INDEPENDENT axes (status.js header) — a Water
// Geyser, Wind Vortex release or Grinder eject can shove a slowed enemy clean
// out of the steam. This is the same defect the Gate 6 review found in Muddy
// Bog, and it is a position check, not an invariant.

import { damageEnemy } from '../enemies.js'
import { applySlow } from '../status.js'

// Called once per tick for a `spec.scaldField` structure. `rect` is the cloud in
// world px — the footprint expanded by spec.cloudMarginPx (towers.js). `dtMs`
// is opt-in, same convention as towers.js's aoeStats (§8 occupancy) --
// absent in the live game, the harness supplies it via state.scaldFieldStats.
export function tickScaldField(state, s, spec, now, rect, dtMs) {
  const store = state.enemyStore
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  const ready = now >= (s.svPulseAt || 0)
  const damage = ready ? spec.pulse.damage : 0
  let occupied = false
  let heldThisTick = 0

  for (let i = 0; i < store.count; i++) {
    const x = store.x[i], y = store.y[i]
    if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) continue
    occupied = true
    heldThisTick++
    const wasSlowed = store.status[i].slowMs > 0
    applySlow(store.status[i], spec.slow.factor, spec.slow.ms, store.speed[i])
    if (!wasSlowed && store.status[i].slowMs > 0) state.fx.push({ type: 'scald', x, y })
    if (damage > 0 && damageEnemy(state, i, damage, meta)) i--   // died → slot reused
  }

  // Opt-in occupancy instrumentation (§8, mirrors towers.js's aoeStats
  // exactly): the cloud has a margin like Firepit's field (this audit's
  // whole reason to check it), so ENEMY-SECONDS is the same meaningful unit.
  if (occupied && state.scaldFieldStats) {
    state.scaldFieldStats.activeTicks++
    state.scaldFieldStats.enemySeconds += heldThisTick * (dtMs / 1000)
  }

  // Bump the same generic cycleSeq field every other family uses to mark
  // "just activated" (StructureAnimator's cycleSeq-bump ACTIVE window, and
  // GameScene's STRUCTURE_ACTIVATION_SFX) -- this family has no phase machine
  // of its own, but a pulse that actually found an occupant is exactly that
  // signal. Deliberately gated on the same ready-AND-occupied condition as
  // the pulse itself, not "every tick", per this file's own ARMED-ONLY note.
  if (ready && occupied) { s.svPulseAt = now + spec.pulse.ms; s.cycleSeq = (s.cycleSeq + 1) | 0 }
}
