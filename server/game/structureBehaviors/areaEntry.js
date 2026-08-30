// MUDDY BOG / MUDDY_BOG (redesign §6.4, Amendment A2.2, Task 15) — the
// PERSISTENT AREA STATUS family (spec §3 family 4): a walkable, always-active
// 2x2 fusion. Every outside-to-inside transition starts one weight-scaled
// root cycle for that enemy — light short, medium standard, heavy long,
// super-heavy longest-bounded (spec: "one root per Bog per crossing...
// remaining inside cannot refresh"). Root is pure crowd control; damage is
// pure footprint occupancy. Fixed damage pulses fire on ANY enemy standing in
// the footprint, rooted by this Bog or not — 2026-08-28's roster-worth retune
// found total damage was `root uptime x tick damage` with both factors
// saturating (docs/reviews/2026-08-28-fusion-roster-worth-retune.md), and the
// 2026-08-28 mechanic review (docs/handoffs/2026-08-28-muddy-bog-decouple.md)
// removed that multiplicative ceiling by decoupling the two.
//
// Damage still respects a POSITION gate, not a root gate. Root and knockback
// are INDEPENDENT CC axes (status.js header): root zeroes locomotion but not
// knockback velocity, so Water Geyser, Wind Vortex release, Grinder eject and
// several player abilities can shove a rooted enemy clean out of the mud.
// Without the position gate the Bog would damage it at unbounded range. The
// root itself keeps running while the enemy is outside — it is a status with
// its own duration, unaffected by the enemy's position — but the mud cannot
// hurt what is not standing in it.
//
// Occupancy diffing mirrors entryTrigger.js's Volcano pattern exactly:
// `s.bgInside` is the crossing-detector set, rebuilt every tick and diffed
// against last tick's set, so leaving and re-entering is what re-arms both a
// fresh root cycle AND the pulse clock, never mere continued residency.
//
// `s.bgPulse` (stable enemy id -> nextPulseAt) is this Bog's damage clock,
// keyed on FOOTPRINT PRESENCE alone. It gains an entry on every fresh
// crossing (pulsing immediately, so even a light enemy with a short root
// still takes at least one hit) and loses it the instant the enemy is no
// longer standing in the footprint — walked out, knocked out, or dead —
// which also means a knockback-displaced-and-returned enemy resumes pulses
// at once rather than resuming a frozen clock, since re-entry re-arms it from
// `now` same as any other fresh crossing.
//
// `s.bgRooted` (a Set of enemy ids) is now ONLY the bookkeeping for the
// lingering slow, entirely separate from damage: an id sits in it exactly
// while this Bog owns the enemy's active root. The moment ownership is lost —
// either the root naturally expired, or a longer root from another source
// took it over — the enemy is paid its lingering slow and dropped. BOTH exits
// pay out: a superseded cycle still happened from the Bog's side, and
// dropping it silently meant an Earth player casting Fissure into a friendly
// Bog downgraded it (Gate 6 review).
//
// Destruction cleanup lives in structures.js (`destroyStructure`), not here:
// zeroing `rootMs` for every enemy whose `rootSourceId` matches this Bog is a
// one-shot scan done once, at the removal funnel, rather than a per-tick
// condition every Bog would otherwise have to carry.

import { damageEnemy } from '../enemies.js'
import { applyRoot, applySlow } from '../status.js'
import { WEIGHT } from '../enemyTypes.js'

function ensureBogState(s) {
  if (s.bgInside) return
  s.bgInside = new Set()
  s.bgRooted = new Set()
  s.bgPulse = new Map()
}

// Called once per tick for a `spec.areaEntry` structure. `rect` is the
// footprint rectangle in world px, expanded by `spec.marginPx` on every side
// (towers.js's areaRect(s, spec.marginPx || 0)) -- same margin mechanism as
// Firepit's tickArea and Steam Vent's tickScaldField, added 2026-08-30 as a
// registered dial (MUDDY_BOG ships marginPx: 0, i.e. unmargined, until a
// sweep says otherwise). `dtMs` is opt-in, same convention as towers.js's
// aoeStats (§8 occupancy) -- absent in the live game, the harness supplies
// it via state.areaEntryStats.
export function tickAreaEntry(state, s, spec, now, rect, dtMs) {
  ensureBogState(s)
  const store = state.enemyStore
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  const stillInside = new Set()

  for (let i = 0; i < store.count; i++) {
    const x = store.x[i], y = store.y[i]
    if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) continue
    const id = store.id[i]
    stillInside.add(id)
    if (s.bgInside.has(id)) continue          // still resident: no fresh cycle

    // Bump the same generic cycleSeq field every other family uses to mark
    // "just activated" (StructureAnimator's cycleSeq-bump ACTIVE window) --
    // 'areaEntry' is absent from structureFamily()'s switch, same as 'aura'
    // and 'confusion' were before their own fixes, so without this the
    // animator never left idle. One bump per crossing, not per pulse: this
    // is the entry cue, not the recurring damage tick.
    s.cycleSeq = (s.cycleSeq + 1) | 0

    const status = store.status[i]
    const speedTier = store.speed[i]
    const weightTier = store.weight[i] ?? WEIGHT.LIGHT
    const baseMs = spec.root.msByWeight[weightTier]
    const wasRooted = status.rootMs > 0
    applyRoot(status, baseMs, speedTier, s.id)
    if (!wasRooted && status.rootMs > 0) state.fx.push({ type: 'root', x, y })
    if (status.rootSourceId === s.id && status.rootMs > 0) {
      s.bgRooted.add(id)   // ownership bookkeeping only -- see header
    }
    s.bgPulse.set(id, now)   // pulse immediately: even a short-fused light root must still land at least one hit
  }

  // Damage: gated on footprint PRESENCE only, independent of root ownership.
  for (const [id, nextPulseAt] of s.bgPulse) {
    let idx = -1
    for (let i = 0; i < store.count; i++) if (store.id[i] === id) { idx = i; break }
    if (idx === -1) { s.bgPulse.delete(id); continue }   // dead or otherwise gone
    if (!stillInside.has(id)) { s.bgPulse.delete(id); continue }   // left the footprint -- re-entry re-arms from `now`
    if (now < nextPulseAt) continue
    if (damageEnemy(state, idx, spec.pulse.damage, meta)) { s.bgPulse.delete(id); continue }
    s.bgPulse.set(id, now + spec.pulse.ms)
  }

  // Root ownership: gated on the shared status object, independent of
  // footprint presence -- a rooted enemy keeps its root while knocked outside.
  // Only the lingering-slow payout lives here now.
  for (const id of s.bgRooted) {
    let idx = -1
    for (let i = 0; i < store.count; i++) if (store.id[i] === id) { idx = i; break }
    if (idx === -1) { s.bgRooted.delete(id); continue }   // dead or otherwise gone

    const status = store.status[idx]
    // Cycle over, either way — ownership lost to a longer root elsewhere, or
    // this Bog's own root ran out. Both pay the lingering slow (see header).
    if (status.rootSourceId !== s.id || status.rootMs <= 0) {
      applySlow(status, spec.lingerSlow.factor, spec.lingerSlow.ms, store.speed[idx])
      s.bgRooted.delete(id)
    }
  }

  // Opt-in occupancy instrumentation (§8, mirrors towers.js's aoeStats
  // exactly): ENEMY-SECONDS is the meaningful unit here too, for the same
  // reason -- "crossings per activation" is just a function of tick rate.
  if (stillInside.size > 0 && state.areaEntryStats) {
    state.areaEntryStats.activeTicks++
    state.areaEntryStats.enemySeconds += stillInside.size * (dtMs / 1000)
  }

  s.bgInside = stillInside
}
