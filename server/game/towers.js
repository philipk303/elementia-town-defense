// Tower / trap OFFENSE (spec §3 tower table + §2 combos). Each structure with a
// BALANCE.TOWER entry fires on its own cooldown at the nearest in-range enemy,
// dealing damage and/or applying its signature status. Walls (barricade), eco
// (farm/marketplace) and the hall have no entry and never fire.
//
// This is what makes the "a scripted maze kills wave 1–3 with towers alone"
// acceptance real — the maze shapes the path (cost field), towers kill along it.
//
// Target search is a per-ready-tower linear scan over the live enemy slots
// (<= a couple hundred, and only when off cooldown). First-pass; flagged for the
// Phase 8 sweep to swap for a bucketed query if profiling calls for it.

import { tileToWorldX, tileToWorldY } from './grid.js'
import { BALANCE } from '../../shared/balance.js'
import { damageEnemy } from './enemies.js'
import { applyBurn, applyWet, applySlow, applyRoot, applyFreeze } from './status.js'
import { tickAura } from './structureBehaviors/aura.js'
import { tickTargetImpact } from './structureBehaviors/targetImpact.js'
import { tickDisplacement } from './structureBehaviors/displacement.js'
import { tickCycle, tickGrinder } from './structureBehaviors/cycle.js'
import { tickVolley } from './structureBehaviors/volley.js'
import { tickEntryTrigger } from './structureBehaviors/entryTrigger.js'
import { tickAreaEntry } from './structureBehaviors/areaEntry.js'
import { tickScaldField } from './structureBehaviors/scaldField.js'

// Structure center in world px (1×1 for every offensive type in slice 1).
function centerX(s) { return tileToWorldX(s.gx) + (s.w - 1) * 16 }
function centerY(s) { return tileToWorldY(s.gy) + (s.h - 1) * 16 }

// Nearest enemy slot within `range` of (cx,cy), or -1. Ties break by ascending
// stable enemy ID (same convention as basicAttacks.js's Earth cone) rather than
// live array index, which reorders on every kill via swap-removal and would
// otherwise make a tied pick depend on unrelated deaths elsewhere in the tick.
// Dormant structures (a dormant Marketplace) still aren't offensive types, so
// no dormancy check here.
function nearestInRange(store, cx, cy, range) {
  const r2 = range * range
  let best = -1, bestD2 = Infinity, bestId = Infinity
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    const d2 = dx * dx + dy * dy
    if (d2 > r2) continue
    const id = store.id[i]
    if (d2 < bestD2 || (d2 === bestD2 && id < bestId)) { bestD2 = d2; bestId = id; best = i }
  }
  return best
}

// Task 15 removed this function's `spec.pull` branch along with its only
// consumer: GRINDER's pre-redesign generic-tower form. Grinder's pull is now
// its INTAKE phase (structureBehaviors/cycle.js), which records displacement
// through the same shared primitive.
function applyEffects(state, store, i, spec) {
  const speedTier = store.speed[i]
  const s = store.status[i]
  if (spec.burn) {
    const was = s.burnMs > 0
    applyBurn(s, spec.burn.dps, spec.burn.ms)
    if (!was && s.burnMs > 0) state.fx.push({ type: 'burn', x: store.x[i], y: store.y[i] })
  }
  if (spec.wet)    applyWet(s, spec.wet.ms)
  if (spec.slow)   applySlow(s, spec.slow.factor, spec.slow.ms, speedTier)
  if (spec.root) {
    const was = s.rootMs > 0
    applyRoot(s, spec.root.ms, speedTier)
    if (!was && s.rootMs > 0) state.fx.push({ type: 'root', x: store.x[i], y: store.y[i] })
  }
  if (spec.freeze) {
    const was = s.freezeMs > 0
    applyFreeze(s, spec.freeze.ms, speedTier)
    if (!was && s.freezeMs > 0) state.fx.push({ type: 'freeze', x: store.x[i], y: store.y[i] })
  }
}

// --- always-on area field (redesign §3 family 1) ----------------------------
//
// Firepit, the family's only member. No range, no target search, no
// projectile, and no cadence: everything standing inside the structure's
// footprint expanded by `marginPx` takes `dps` continuously, scaled by the tick
// delta, and has its burn refreshed. One rectangle test per enemy per tick, so
// a body straddling the seam between the two footprint tiles is charged once.
//
// The Snare Post is a SEPARATE family (structureBehaviors/aura.js) — a bounded
// fixed-cadence circular slow, not continuous. Amendment B's always-on contract
// binds only family 1; §4.2 keeps Snare Post on a pulse deliberately.
//
// Continuous rather than pulsed (Philip, 2026-07-26). A pulse made a
// structure's output depend on phase alignment with enemy transit — a body
// crossing in ~1s ate 0 or 1 pulses essentially at random. Time-scaled damage
// removes that by construction and makes the field's value a clean function of
// the enemy-seconds it holds.

// The structure's footprint in world px, expanded by `margin` on every side.
// tileToWorld* returns tile CENTRES, hence the half-tile back off to the edge.
function areaRect(s, margin) {
  const x0 = tileToWorldX(s.gx) - 16 - margin
  const y0 = tileToWorldY(s.gy) - 16 - margin
  return { x0, y0, x1: x0 + s.w * 32 + margin * 2, y1: y0 + s.h * 32 + margin * 2 }
}

function tickArea(state, s, spec, dtMs) {
  const store = state.enemyStore
  const r = areaRect(s, spec.marginPx)
  const dtSec = dtMs / 1000
  const damage = spec.dps * dtSec
  let held = 0
  for (let i = 0; i < store.count; i++) {
    const x = store.x[i], y = store.y[i]
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue
    held++
    if (spec.burn) {
      const was = store.status[i].burnMs > 0
      applyBurn(store.status[i], spec.burn.dps, spec.burn.ms)
      if (!was && store.status[i].burnMs > 0) state.fx.push({ type: 'burn', x, y })
    }
    if (damage > 0 && damageEnemy(state, i, damage, { category: 'structure', ownerId: s.id, label: s.type })) i--   // died → slot reused
  }
  // Opt-in instrumentation (§8 occupancy). Absent in the live game; the harness
  // attaches it. ENEMY-SECONDS is the meaningful unit for an always-on field —
  // "targets per activation" would just be a function of the tick rate.
  if (held > 0 && state.aoeStats) {
    state.aoeStats.activeTicks++
    state.aoeStats.enemySeconds += held * dtSec
  }
  // Peak-active-effects (Task 3b): instantaneous concurrent-enemy count this
  // tick, summed across every AoE structure — the same figure
  // simulationBudgets.test.js checks against BALANCE.LIMITS.MAX_STRUCTURE_EFFECTS.
  // Reset once per tick in tickTowers below, since multiple structures each
  // add to it within the same tick.
  if (state.aoeStats) state.aoeStats.heldNow += held
}

// Opt-in "ever came within reach" instrumentation (§8, 2026-08-29 audit,
// step 3): a single per-tick distance check, not a per-tick accumulator like
// aoeStats -- the step 3 question is "did anyone ever get close enough," not
// occupied-time, for the range/radius families (more forgiving than an exact
// footprint, but per the Grinder precedent, "more forgiving" isn't "safe").
// Once true for a structure it stops scanning that structure -- the answer
// can only flip from false to true, never back.
function sampleRangeReach(state, s, reachPx) {
  if (!state.rangeStats || reachPx == null) return
  let stat = state.rangeStats.get(s.id)
  if (!stat) { stat = { structureType: s.type, everInRange: false }; state.rangeStats.set(s.id, stat) }
  if (stat.everInRange) return
  const store = state.enemyStore
  const cx = centerX(s), cy = centerY(s)
  const r2 = reachPx * reachPx
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy <= r2) { stat.everInRange = true; return }
  }
}

export function tickTowers(state, now, dtMs) {
  const store = state.enemyStore
  if (state.aoeStats) state.aoeStats.heldNow = 0
  for (const s of state.structures) {
    const spec = BALANCE.TOWER[s.type]
    if (!spec) continue                               // not an offensive structure
    if (spec.aoe) { tickArea(state, s, spec, dtMs); continue }
    if (spec.aura) { sampleRangeReach(state, s, spec.radiusPx); tickAura(state, s, spec, now, centerX(s), centerY(s)); continue }
    if (spec.targetImpact) { sampleRangeReach(state, s, spec.rangePx); tickTargetImpact(state, s, spec, now, centerX(s), centerY(s)); continue }
    if (spec.displace) { tickDisplacement(state, s, spec, now, centerX(s), centerY(s), areaRect(s, 0), dtMs); continue }
    if (spec.cycle) { sampleRangeReach(state, s, spec.radiusPx); tickCycle(state, s, spec, now, centerX(s), centerY(s)); continue }
    if (spec.grind) { tickGrinder(state, s, spec, now, centerX(s), centerY(s), dtMs); continue }
    if (spec.volley) { sampleRangeReach(state, s, spec.rangePx); tickVolley(state, s, spec, now, centerX(s), centerY(s)); continue }
    if (spec.entryTrigger) { tickEntryTrigger(state, s, spec, now, centerX(s), centerY(s), areaRect(s, 0), dtMs); continue }
    if (spec.areaEntry) { tickAreaEntry(state, s, spec, now, areaRect(s, spec.marginPx || 0), dtMs); continue }
    if (spec.scaldField) { tickScaldField(state, s, spec, now, areaRect(s, spec.cloudMarginPx), dtMs); continue }
    sampleRangeReach(state, s, spec.rangePx)
    if (now < (s.attackReadyAt || 0)) continue        // on cooldown
    const cx = centerX(s), cy = centerY(s)
    const target = nearestInRange(store, cx, cy, spec.rangePx)
    if (target === -1) continue                       // nothing to shoot (stays ready)
    s.attackReadyAt = now + spec.cooldownMs
    // Bump the same generic cycleSeq field every named family uses to mark
    // "just activated" -- this default (no-family) branch never did, so the
    // already-wired watchtower_fire activation SFX (GameScene.js's
    // STRUCTURE_ACTIVATION_SFX, which watches the same field) and the
    // Watchtower atlas's ACTIVE frame (StructureAnimator's generic
    // cycleSeq-bump window) were both dead until this fix. Watchtower is
    // this branch's only occupant (every other offensive type is dispatched
    // to a named family above), so this cannot affect anything else.
    s.cycleSeq = (s.cycleSeq + 1) | 0
    if (spec.damage > 0) {
      const meta = { category: 'structure', ownerId: s.id, label: s.type }
      if (damageEnemy(state, target, spec.damage, meta)) continue // died → slot reused; skip effects
    }
    applyEffects(state, store, target, spec)
  }
}
