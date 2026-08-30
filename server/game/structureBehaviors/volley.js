// FIRESTORM (redesign §6.3, Amendment C.1 2026-07-29, Task 14; converted to
// real projectiles 2026-08-04 per docs/plans/2026-08-04-firestorm-projectile-
// conversion-spec.md Phase 1) — the RADIAL VOLLEY family: an in-range gate
// followed by eight real, untargeted `FIRESTORM_BOLT` projectiles fired on
// world-fixed headings. Unlike the old instantaneous scan, a bolt can MISS —
// that miss chance is a spec knob (PROJECTILE.FIRESTORM_BOLT.aoeRadiusPx),
// not a side effect of using projectiles.
//
// The fan is rotated by 22.5° per volley, deterministic from `cycleSeq`.
// Without the rotation the eight gaps between bolts are fixed in world space
// and a stationary enemy parked in a gap is never hit — a pathological
// exploit and a source of siting variance the harness would read as noise.
//
// Aggro: every bolt spawns with `ownerId: null` (team-owned, same convention
// combos.js uses post-fusion) so its detonation's triggerAggro call takes the
// null/no-op path (aggro.js). This is a BEHAVIOUR CHANGE from the old scan,
// which pulled aggro to `s.ownerId` once per volley — after this conversion
// it pulls none. That is the correct semantic for a team-owned structure, and
// per the spec it must be measured, not assumed neutral.

import { spawnProjectile } from '../projectiles.js'

// Called once per tick for a `spec.volley` structure. `cx`/`cy` is the
// structure's world center (caller-computed, same convention as aura.js).
export function tickVolley(state, s, spec, now, cx, cy) {
  if (now < (s.attackReadyAt || 0)) return
  const store = state.enemyStore
  const r2 = spec.rangePx * spec.rangePx

  // In-range gate only — no hit resolution here. This stops the tower firing
  // into empty space (keeps concurrency down, keeps `activations` comparable
  // pre/post-conversion) but does not guarantee any bolt actually connects;
  // a bolt can still miss the very enemy that opened the gate.
  let anyInRange = false
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy <= r2) { anyInRange = true; break }
  }
  if (!anyInRange) return   // nothing in range: stays ready, no cooldown spent

  s.attackReadyAt = now + spec.cooldownMs
  // Single wire-visible trigger for the tower's cast animation/FX cue — one
  // bump regardless of how many bolts land, and the source of the fan's
  // per-volley rotation below.
  s.cycleSeq = (s.cycleSeq | 0) + 1

  // Opt-in harness instrumentation (state.volleyProbe), same convention as
  // state.aoeStats/state.tiProbe: absent in the shipped server. `activations`
  // is volleys that actually fired; `boltsSpawned`/`boltsRefused` account for
  // the MAX_PROJECTILES cap; `boltsHit`/`hits` are filled in by
  // projectiles.js's detonateAoe when a structure-owned bolt lands, so the
  // probe reports hits/volley on a like-for-like basis with the pre-
  // conversion instrument.
  if (state.volleyProbe) state.volleyProbe.activations++

  const boltCount = spec.volleyBolts
  const baseAngle = ((s.cycleSeq * 22.5) * Math.PI) / 180
  for (let b = 0; b < boltCount; b++) {
    const angle = baseAngle + (b * 2 * Math.PI) / boltCount
    const pr = spawnProjectile(state, {
      type: spec.boltType,
      ownerId: null,
      x: cx, y: cy,
      dirX: Math.cos(angle), dirY: Math.sin(angle),
      damage: spec.damage,
      burn: spec.burn ?? null,
      category: 'structure',
      label: s.type,
    })
    if (state.volleyProbe) {
      if (pr) state.volleyProbe.boltsSpawned = (state.volleyProbe.boltsSpawned || 0) + 1
      else state.volleyProbe.boltsRefused = (state.volleyProbe.boltsRefused || 0) + 1
    }
  }
}
