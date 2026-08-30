// SNARE POST (redesign §4.2, Task 10) — the true-aura family. A bounded-cadence
// circular slow field, distinct from Firepit's always-on area field (Amendment
// B applies only to that family): every `cadenceMs`, every enemy within
// `radiusPx` of the structure's centre has its slow refreshed. No damage, no
// target search, no projectile.
//
// The cadence must stay tight enough that no enemy fully crosses the aura
// between refreshes (§4.2 implementation note) — that is a placement/speed
// relationship the balance sweep verifies, not something enforced here.
//
// Destruction stops refreshes but does not cleanse an existing slow: tickTowers
// simply stops calling this for a removed structure, and applySlow's own
// countdown (status.js) carries the remaining duration — the "lingers briefly
// after exit" behavior falls out of that countdown for free.

import { applySlow } from '../status.js'

export function tickAura(state, s, spec, now, cx, cy) {
  if (now < (s.auraReadyAt || 0)) return
  s.auraReadyAt = now + spec.cadenceMs
  // Bump the same generic cycleSeq field every other family uses to mark
  // "just activated" (StructureAnimator's cycleSeq-bump ACTIVE window, and
  // GameScene's STRUCTURE_ACTIVATION_SFX) — the aura has no phase machine of
  // its own, but it does pulse on a fixed cadence, which is exactly that
  // signal. Unconditional per cadence tick, independent of whether any
  // enemy was actually in range this pulse.
  s.cycleSeq = (s.cycleSeq + 1) | 0
  const store = state.enemyStore
  const r2 = spec.radiusPx * spec.radiusPx
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy > r2) continue
    applySlow(store.status[i], spec.slow.factor, spec.slow.ms, store.speed[i])
  }
}
