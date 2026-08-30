// WIND VORTEX (redesign §5.4, Task 12) — the TIMED PHASE MACHINE family (spec
// §3 family 3). A fast repeating cycle, not a target/cooldown loop: a SUCTION
// phase of fixed pulses (never per-tick force) gathers eligible enemies
// toward the structure's center, then one RELEASE pulse ejects the whole
// gathered group in the structure's locked cardinal direction, then the cycle
// repeats. Release reuses displacement.js's `launchInDirection` — same
// weight-scaled launch primitive Water Geyser uses, different caller.
//
// Deadline/sequence-based, not accumulator-based, so a slow tick or a
// reconnect gap never produces a catch-up storm: every check is "has
// `now` passed the stored deadline yet", which fires AT MOST one phase
// transition and AT MOST one suction pulse per tickCycle call, regardless of
// how far behind schedule `now` is. `s.phase`/`s.phaseDeadline`/`s.charge`/
// `s.cycleSeq` are the exact generic dynamic-structure wire fields Task 8's
// encode.js already sends unconditionally every emit — no wire change is
// needed here, and reconnect gets phase/timing for free from the next
// snapshot.
//
// Cycle-tracking and post-release immunity live on the structure instance
// itself (`s.vxTracked` / `s.vxImmune`), not on the enemy or in any shared
// store — so "destruction during suction cancels release and clears cycle
// tracking" (spec verification) holds for free: a destroyed structure is
// dropped from state.structures and tickCycle is simply never called again
// for it, taking its tracking Maps with it.

// GRINDER (redesign §6.6, Task 15) joins this module as family 3's second
// member (spec §3: "Timed phase machine: Wind Vortex and Grinder"), sharing
// the deadline-driven phase skeleton, the pulse cadence idiom, and the
// per-structure recapture-immunity map — see tickGrinder at the bottom for
// the one structural difference between the two machines.

import { applyKnockback } from '../enemyMove.js'
import { recordDisplacement } from '../combatStats.js'
import { damageEnemy } from '../enemies.js'
import { applyRoot } from '../status.js'
import { launchInDirection } from './displacement.js'

export const VORTEX_PHASE = { SUCTION: 0, RELEASE: 1 }
export const GRINDER_PHASE = { INTAKE: 0, CRUSH: 1 }

function ensureVortexState(s, now, spec) {
  if (s.phase != null) return
  s.phase = VORTEX_PHASE.SUCTION
  s.phaseDeadline = now + spec.cycle.suctionMs
  s.charge = 0
  s.cycleSeq = 0
  s.vxNextPulseAt = now
  s.vxReleased = false
  s.vxTracked = new Map()  // stable enemy id -> true, this cycle's suction catch
  s.vxImmune = new Map()   // stable enemy id -> immune-until timestamp (this source only)
}

// Lazy prune: the map only ever holds recently-released ids for this one
// structure, so a linear pass each suction pulse is cheap and keeps it from
// growing unbounded over a long match.
function pruneImmunity(map, now) {
  for (const [id, until] of map) if (until <= now) map.delete(id)
}

function doSuctionPulse(state, s, spec, now, store, cx, cy) {
  const r2 = spec.radiusPx * spec.radiusPx
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  for (let i = 0; i < store.count; i++) {
    const id = store.id[i]
    const immuneUntil = s.vxImmune.get(id)
    if (immuneUntil != null && immuneUntil > now) continue
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy > r2) continue
    // Toward the center, weight-scaled; super-heavy (KB_WEIGHT_SCALE[3] = 0)
    // is naturally immune, same as every other displacement source. Recorded
    // the same way release/Water Geyser are (Codex Gate 5 finding: suction
    // was the one displacement call site in the codebase that discarded its
    // impulse instead of feeding combatStats, silently undercounting Vortex's
    // defining effect in balance telemetry).
    const mag = applyKnockback(store.kvx, store.kvy, i, cx - store.x[i], cy - store.y[i], spec.cycle.suctionPower, store.weight[i])
    recordDisplacement(state, meta, mag)
    s.vxTracked.set(id, true)
  }
}

function idxOfId(store, id) {
  for (let i = 0; i < store.count; i++) if (store.id[i] === id) return i
  return -1
}

function doRelease(state, s, spec, now, store) {
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  for (const id of s.vxTracked.keys()) {
    const i = idxOfId(store, id)
    s.vxImmune.set(id, now + spec.cycle.immunityMs) // set even if the enemy died mid-cycle: id reuse is not a concern (stable ids are never reused)
    if (i === -1) continue
    launchInDirection(state, store, i, s.dir, spec.cycle.releasePower, meta)
  }
  s.vxTracked.clear()
}

// Called once per tick for a `spec.cycle` structure. `cx`/`cy` is the
// structure's world center (caller-computed, same convention as aura.js).
export function tickCycle(state, s, spec, now, cx, cy) {
  ensureVortexState(s, now, spec)
  const store = state.enemyStore
  pruneImmunity(s.vxImmune, now)

  if (s.phase === VORTEX_PHASE.SUCTION) {
    if (now >= s.vxNextPulseAt) {
      doSuctionPulse(state, s, spec, now, store, cx, cy)
      s.vxNextPulseAt = now + spec.cycle.pulseMs
    }
    s.charge = Math.min(1, Math.max(0, 1 - (s.phaseDeadline - now) / spec.cycle.suctionMs))
    if (now >= s.phaseDeadline) {
      s.phase = VORTEX_PHASE.RELEASE
      s.phaseDeadline = now + spec.cycle.releaseMs
    }
    return
  }

  // RELEASE: fires exactly once on entry (spec: "release each eligible
  // tracked enemy at most once"), then the phase just runs out its deadline
  // before the next cycle's suction begins.
  if (!s.vxReleased) {
    doRelease(state, s, spec, now, store)
    s.vxReleased = true
  }
  if (now >= s.phaseDeadline) {
    s.phase = VORTEX_PHASE.SUCTION
    s.phaseDeadline = now + spec.cycle.suctionMs
    s.charge = 0
    s.vxNextPulseAt = now
    s.vxReleased = false
    s.cycleSeq = (s.cycleSeq + 1) | 0
  }
}

// --- GRINDER (redesign §6.6, Task 15) ---------------------------------------
//
// Same deadline-driven skeleton as Wind Vortex above, with ONE structural
// difference that is the whole point of the structure: Vortex releases its
// TRACKED SET (everyone suction ever caught this cycle, wherever they ended
// up), whereas Grinder crushes by POSITION AT CRUSH TIME — only what is
// inside the smaller inner radius when intake ends. That is what makes
// "enemies that do not reach the inner zone avoid crush damage" (§6.6) and
// §7's "outer pull cannot guarantee inner-zone arrival" real properties of
// the mechanic rather than tuning promises, and it is why Grinder needs no
// tracked-set map at all — only the recapture-immunity one.
//
// Damage is NOT weight-gated; only displacement is. A super-heavy enemy
// (KB_WEIGHT_SCALE[3] = 0) is therefore never dragged in by intake and never
// ejected by the crush, but takes the full crush hit if it happened to be
// standing in the inner zone already — spec §6.6 verification states exactly
// this case. The global MAX_KB_VELOCITY cap the spec asks for is enforced
// inside applyKnockback itself, so both the pull and the eject get it free.
//
// "Destruction during intake cancels the crush" holds for the same reason it
// does for Vortex and Volcano: all state lives on the structure instance, and
// a destroyed structure is dropped from state.structures, so this function is
// simply never called again for it.

function ensureGrinderState(s, now, spec) {
  if (s.phase != null) return
  s.phase = GRINDER_PHASE.INTAKE
  s.phaseDeadline = now + spec.grind.intakeMs
  s.charge = 0
  s.cycleSeq = 0
  s.grNextPulseAt = now
  s.grCrushed = false
  s.grImmune = new Map()   // stable enemy id -> immune-until timestamp (this source only)
  s.grPulledThisCycle = new Set()   // §8 occupancy: ids pulled during the CURRENT intake phase
  s.grInside = new Set()   // crossing detector for the root capture — see doRootCapture
}

// ROOT CAPTURE (2026-08-29). Every enemy crossing INTO the suction radius is
// rooted for `grind.rootMs`, in addition to — not instead of — the pull.
//
// This is the direct fix for what the contactDps dose ladder diagnosed: a 4x
// damage increase moved nothing, so damage rate was never the binding
// constraint, DWELL TIME was (docs/reviews/2026-08-29-grinder-contact-damage.md).
// A machine that grabs you and then lets you stroll out cannot be fixed by
// sharpening the blades.
//
// Root and knockback are INDEPENDENT axes (status.js header): root zeroes
// LOCOMOTION but leaves knockback velocity alone, and the intake pull IS
// knockback. So a rooted enemy stops walking away while the pull keeps
// dragging it inward — the two effects compose rather than cancel, which is
// what makes rooting at the OUTER radius correct rather than merely wider.
//
// ONE root per crossing, never refreshed while resident — the same rule
// areaEntry.js's Bog uses ("remaining inside cannot refresh"). Refreshing
// every tick would be a permanent lockdown for anything that cannot escape
// the radius, and this project has three documented soft-lock classes already.
// `s.grInside` is the crossing detector, rebuilt every tick and diffed.
//
// Respects `grImmune` for the same reason the pull does: a just-ejected enemy
// must not be re-grabbed the instant it lands. Being ejected far enough to
// leave the radius is what re-arms a fresh root on the way back in.
function doRootCapture(state, s, spec, store, now, cx, cy) {
  const rootMs = spec.grind.rootMs
  if (!(rootMs > 0)) { s.grInside.clear(); return }
  // WHERE the root lands is a separate question from whether it happens, and
  // the 2026-08-29 decomposition is what forced it into its own dial. Rooting
  // at the SUCTION edge measured HARMFUL on its own (-0.262, t 2.83) because
  // a frozen enemy is parked wherever it was caught, and the pull (110) is
  // weaker than walking — so freezing at the edge REDUCES arrivals at the
  // core. The intended mechanic is "sucked to the centre, held THERE, then
  // spat out", which is a smaller root radius: enemies stay walkable while
  // the suction draws them in, and only lock down once they have arrived.
  const rootRadius = spec.grind.rootRadiusPx ?? spec.outerRadiusPx
  const r2 = rootRadius * rootRadius
  const stillInside = new Set()

  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy > r2) continue
    const id = store.id[i]
    stillInside.add(id)
    if (s.grInside.has(id)) continue                        // still resident: no fresh root
    const immuneUntil = s.grImmune.get(id)
    if (immuneUntil != null && immuneUntil > now) continue   // just ejected: no instant recapture

    const status = store.status[i]
    const wasRooted = status.rootMs > 0
    applyRoot(status, rootMs, store.speed[i], s.id)
    if (!wasRooted && status.rootMs > 0) state.fx.push({ type: 'root', x: store.x[i], y: store.y[i] })
  }

  s.grInside = stillInside
}

function doIntakePulse(state, s, spec, now, store, cx, cy) {
  const r2 = spec.outerRadiusPx * spec.outerRadiusPx
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  for (let i = 0; i < store.count; i++) {
    const id = store.id[i]
    const immuneUntil = s.grImmune.get(id)
    if (immuneUntil != null && immuneUntil > now) continue   // just ejected: no instant recapture
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy > r2) continue
    // Toward the center as an IMPULSE, never a snap to the centre coordinate
    // (§6.6: "do not force enemies to an identical center coordinate").
    const mag = applyKnockback(store.kvx, store.kvy, i, cx - store.x[i], cy - store.y[i], spec.grind.pullPower, store.weight[i])
    recordDisplacement(state, meta, mag)
    // Opt-in occupancy instrumentation (§8, 2026-08-29 audit): does the pull
    // that touched this enemy actually land it in the crush zone? Answered
    // at CRUSH entry below, against this same set.
    if (state.grinderStats) s.grPulledThisCycle.add(id)
  }
}

// Candidate IDs captured up front, then each hit re-resolves its live index
// right before damaging it (§6.6: "carefully handle enemy swap-removal during
// group damage") — the same pattern Volcano's eruption and Firestorm's volley
// use, because a kill mid-resolution swap-removes and reorders slots.
function doCrush(state, s, spec, now, store, cx, cy) {
  const r2 = spec.innerRadiusPx * spec.innerRadiusPx
  const meta = { category: 'structure', ownerId: s.id, label: s.type }

  const ids = []
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy <= r2) ids.push(store.id[i])
  }
  for (const id of ids) {
    const i = idxOfId(store, id)
    if (i === -1) continue
    // Immunity is set for every crushed enemy, survivor or not — id reuse is
    // not a concern (stable ids are never reused), and it keeps the map's
    // semantics "this cycle's output" rather than "this cycle's survivors".
    s.grImmune.set(id, now + spec.grind.immunityMs)
    // A false return means this enemy did NOT die, and damageEnemy only ever
    // removes the slot it was handed — so `i` is still this enemy's live
    // index here and needs no second lookup before the eject.
    if (damageEnemy(state, i, spec.damage, meta)) continue   // died in the grinder: nothing to eject
    // RELEASE before the eject: the contract is "held, THEN spat out", so an
    // enemy leaving the machine leaves free. Only this Grinder's own root is
    // cleared — a longer root from another source (a friendly Bog, an Earth
    // player's Fissure) owns the status and must not be downgraded here, the
    // same ownership rule areaEntry.js applies. Knockback ignores root anyway,
    // so this changes where the enemy ends up AFTER landing, not whether the
    // eject lands.
    const status = store.status[i]
    if (status.rootSourceId === s.id && status.rootMs > 0) status.rootMs = 0
    launchInDirection(state, store, i, s.dir, spec.grind.ejectPower, meta)
  }
  // Opt-in occupancy instrumentation (§8, 2026-08-29 audit): the balance.js
  // GRINDER comment names this exact question -- "enemies the pull failed to
  // drag inside take nothing." `ids` is who's actually in the inner zone
  // right now (about to take damage); `s.grPulledThisCycle` is everyone the
  // outer pull touched since the last crush. Comparing the two, over many
  // cycles, is the pull's real landing rate.
  if (state.grinderStats) {
    state.grinderStats.cycles++
    state.grinderStats.pulled += s.grPulledThisCycle.size
    state.grinderStats.crushed += ids.length
    let landed = 0
    for (const id of ids) if (s.grPulledThisCycle.has(id)) landed++
    state.grinderStats.pulledAndCrushed += landed
    s.grPulledThisCycle.clear()
  }
  s.cycleSeq = (s.cycleSeq + 1) | 0
}

// CONTACT DAMAGE (2026-08-29). Every enemy standing in the INNER zone takes
// time-scaled damage every tick, in BOTH phases, entirely independent of the
// crush. This exists because the 2026-08-29 occupancy audit measured what
// §7's safeguard costs in practice: only 11.3% (maze A) / 40.1% (maze B) of
// the enemies the outer pull grabs are still in the inner zone when the crush
// resolves (docs/reviews/2026-08-29-structure-occupancy-step3-4.md). The pull
// was doing most of its work for nothing. Contact damage pays the pull for
// the time an enemy actually spends inside the machine rather than only for
// being there at one instant, without touching the safeguard itself — the
// crush is still position-gated, still once per cycle, still escapable.
//
// CONTINUOUS, not pulsed, and that is not a style preference: a pulse makes a
// structure's output depend on how its cadence lines up with enemy transit
// (towers.js's own header, and scaldField.js's ARMED-ONLY note, both name
// this as the Firepit phase-alignment defect). Time-scaling removes it by
// construction, which matters here more than anywhere — the whole point is to
// reward dwell time, so dwell time must be what it reads.
//
// Gated on POSITION only, exactly like Muddy Bog's pulse and Steam Vent's
// scald. Deliberately NOT gated on `grImmune`: that map is recapture
// immunity, a rule about what the PULL may grab, not a claim that the enemy
// is intangible. An ejected enemy that lands back inside is inside.
// `contactRadiusPx` defaults to innerRadiusPx (the crush zone) but is a
// SEPARATE dial on purpose: "what the blades touch" and "what the crush hits"
// are different questions, and the 2026-08-29 dose ladder showed why it has
// to be separate. Sweeping contactDps 10 -> 40 barely moved hallHpAuc
// (+0.694 / +0.650 / +0.692 on maze B), and a 4x damage increase producing no
// response means damage rate is NOT the binding constraint -- dwell time in a
// 55px circle is. Only a radius dial can test that; a damage dial cannot.
function doContactDamage(state, s, spec, store, cx, cy, dtMs) {
  const dps = spec.grind.contactDps
  if (!(dps > 0)) return
  const radius = spec.grind.contactRadiusPx ?? spec.innerRadiusPx
  const r2 = radius * radius
  const damage = dps * (dtMs / 1000)
  const meta = { category: 'structure', ownerId: s.id, label: s.type }
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy > r2) continue
    if (damageEnemy(state, i, damage, meta)) i--   // died → slot reused
  }
}

// Called once per tick for a `spec.grind` structure. `cx`/`cy` is the
// structure's world center (caller-computed, same convention as tickCycle).
export function tickGrinder(state, s, spec, now, cx, cy, dtMs) {
  ensureGrinderState(s, now, spec)
  const store = state.enemyStore
  pruneImmunity(s.grImmune, now)
  // Both run before the phase branch: the root capture and contact damage are
  // phase-independent by design, and INTAKE returns early below.
  doRootCapture(state, s, spec, store, now, cx, cy)
  doContactDamage(state, s, spec, store, cx, cy, dtMs)

  if (s.phase === GRINDER_PHASE.INTAKE) {
    if (now >= s.grNextPulseAt) {
      doIntakePulse(state, s, spec, now, store, cx, cy)
      s.grNextPulseAt = now + spec.grind.pulseMs
    }
    s.charge = Math.min(1, Math.max(0, 1 - (s.phaseDeadline - now) / spec.grind.intakeMs))
    if (now >= s.phaseDeadline) {
      s.phase = GRINDER_PHASE.CRUSH
      s.phaseDeadline = now + spec.grind.crushMs
    }
    return
  }

  // CRUSH: resolves exactly once on entry (§6.6: inner-zone enemies take the
  // group damage ONCE), then the phase runs out its deadline as the recovery
  // tail that makes this one of the longest full cycles (§7 safeguard).
  if (!s.grCrushed) {
    doCrush(state, s, spec, now, store, cx, cy)
    s.grCrushed = true
  }
  if (now >= s.phaseDeadline) {
    s.phase = GRINDER_PHASE.INTAKE
    s.phaseDeadline = now + spec.grind.intakeMs
    s.charge = 0
    s.grNextPulseAt = now
    s.grCrushed = false
  }
}
