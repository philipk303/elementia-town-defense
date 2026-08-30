// VOLCANO / MAGMA_TRAP (redesign §6.2, Amendment A1.5, Task 14) — the
// ENTRY-COUNT TRIGGER family (spec §3 family 5): a walkable 2x2 fusion whose
// crossing-burn zone is exactly its own footprint (unlike Firepit's
// margin-expanded field). Every outside-to-inside transition burns the
// crossing enemy and — outside recharge — banks one pressure charge; the
// chargeThreshold-th charge fires one immediate eruption: a much larger,
// much harder radial hit plus strong lingering burn, then a medium recharge
// during which crossings still burn but bank no further pressure. Display
// alias only — the shipped type ID stays MAGMA_TRAP.
//
// Occupancy (not damage) drives detection: s.vtInside is the set of stable
// enemy ids currently inside the footprint, rebuilt every tick from a fresh
// scan and diffed against last tick's set — an id dropping out (exit, death,
// swap-removal) is exactly what lets that SAME enemy bank a fresh charge on
// re-entry (spec: "leaving and re-entering counts again"; "remaining inside
// counts once").
//
// Cap eruption at one per simulation update (spec verification): `erupted`
// latches true the instant charge reaches threshold, so any further
// same-tick entrants still burn on entry but their would-be charge is
// discarded, not banked for the next cycle.
//
// State lives on the structure instance itself, so destruction clears it for
// free (a destroyed structure is dropped from state.structures and this tick
// function is simply never called again for it). `charge`/`phase`/
// `phaseDeadline`/`cycleSeq` are the same generic wire-mirror fields Rock
// Trap and Wind Vortex already use (Task 8's encode.js sends them
// unconditionally) — reconnect restores telegraph/recharge state for free
// from the next snapshot without any Volcano-specific wire channel.

import { damageEnemy } from '../enemies.js'
import { applyBurn } from '../status.js'

function ensureVolcanoState(s) {
  if (s.vtInside) return
  s.vtInside = new Set()
  s.vtCharge = 0
  s.vtEruptReadyAt = 0
}

function idxOfId(store, id) {
  for (let i = 0; i < store.count; i++) if (store.id[i] === id) return i
  return -1
}

// Candidate IDs captured up front, then each hit re-resolves its live index
// right before damaging it (mirrors Rock Trap/Firestorm) — a kill
// mid-resolution swap-removes and reorders slots, so a stale index could
// misdirect or skip a later hit.
function doEruption(state, s, spec, now, cx, cy) {
  const store = state.enemyStore
  const r2 = spec.eruption.radiusPx * spec.eruption.radiusPx
  const meta = { category: 'structure', ownerId: s.id, label: s.type }

  const ids = []
  for (let i = 0; i < store.count; i++) {
    const dx = store.x[i] - cx, dy = store.y[i] - cy
    if (dx * dx + dy * dy <= r2) ids.push(store.id[i])
  }
  for (const id of ids) {
    const i = idxOfId(store, id)
    if (i === -1) continue
    if (damageEnemy(state, i, spec.eruption.damage, meta)) continue
    const wasBurning = store.status[i].burnMs > 0
    applyBurn(store.status[i], spec.eruption.burn.dps, spec.eruption.burn.ms)
    if (!wasBurning && store.status[i].burnMs > 0) state.fx.push({ type: 'burn', x: store.x[i], y: store.y[i] })
  }
  s.vtEruptReadyAt = now + spec.eruption.cooldownMs
  s.cycleSeq = (s.cycleSeq | 0) + 1
}

// Called once per tick for a `spec.entryTrigger` structure. `cx`/`cy` is the
// structure's world center (caller-computed); `rect` is its raw (unmargined)
// footprint rectangle in world px, same shape towers.js's areaRect(s, 0)
// produces for Wind Vortex/Water Geyser. `dtMs` is opt-in, same convention
// as towers.js's aoeStats (§8 occupancy) -- absent in the live game, the
// harness supplies it via state.entryTriggerStats.
export function tickEntryTrigger(state, s, spec, now, cx, cy, rect, dtMs) {
  ensureVolcanoState(s)
  const store = state.enemyStore
  const inRecharge = now < s.vtEruptReadyAt
  const stillInside = new Set()
  let erupted = false

  for (let i = 0; i < store.count; i++) {
    const x = store.x[i], y = store.y[i]
    if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) continue
    const id = store.id[i]
    stillInside.add(id)
    if (s.vtInside.has(id)) continue   // already resident: no repeat charge/burn this tick

    const wasBurning = store.status[i].burnMs > 0
    applyBurn(store.status[i], spec.burn.dps, spec.burn.ms)   // fresh crossing: always burns
    if (!wasBurning && store.status[i].burnMs > 0) state.fx.push({ type: 'burn', x: store.x[i], y: store.y[i] })
    if (inRecharge || erupted) continue                        // ...but banks no pressure right now
    s.vtCharge++
    if (s.vtCharge >= spec.chargeThreshold) {
      s.vtCharge = 0
      doEruption(state, s, spec, now, cx, cy)
      erupted = true
    }
  }

  // Opt-in occupancy instrumentation (§8, mirrors towers.js's aoeStats
  // exactly): counts continued residency too, unlike the charge/burn logic
  // above which only fires on fresh crossings -- occupancy asks "is anyone
  // standing here right now," a different question from "did anyone just
  // cross the threshold."
  if (stillInside.size > 0 && state.entryTriggerStats) {
    state.entryTriggerStats.activeTicks++
    state.entryTriggerStats.enemySeconds += stillInside.size * (dtMs / 1000)
  }

  s.vtInside = stillInside
  s.charge = s.vtCharge / spec.chargeThreshold
  s.phase = now < s.vtEruptReadyAt ? 1 : 0
  s.phaseDeadline = s.phase === 1 ? s.vtEruptReadyAt : 0
}
