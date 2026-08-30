// Local player's ability cooldown/charge readout (charge_indicator +
// cooldown_indicator in the graphics ledger, both speced as "procedural
// client geometry" — no art asset). Pure: takes the decoded snapshot's
// per-player remaining-cooldown fields and the element's balance numbers,
// returns what to draw. GameScene owns the Phaser objects.

import { BALANCE } from '../../../shared/balance.js'

// Cooling is a distinct state from charging so the two ledger fragments stay
// distinguishable: `cooling` is the flat post-cast lockout every ability has,
// `charging` is the final approach to ready, which the bar accents so a
// player can time a cast without reading numbers. CHARGE_FRAC is the tail of
// the cooldown that reads as "about to come up".
const CHARGE_FRAC = 0.25

// A slot's presentation state. `ready` maps to the ledger's `charged` /
// `ready`; `cooling` and `charging` split the ledger's `uncharged` /
// `cooling` window by how close the ability is to firing again.
export function slotState(remainingMs, cooldownMs) {
  if (!(cooldownMs > 0) || remainingMs <= 0) return 'ready'
  return remainingMs <= cooldownMs * CHARGE_FRAC ? 'charging' : 'cooling'
}

// Fraction of the cooldown already elapsed, 0..1 — the bar's fill. Always 1
// when ready, so a missing/zero cooldownMs draws full rather than empty.
export function slotFill(remainingMs, cooldownMs) {
  if (!(cooldownMs > 0)) return 1
  const elapsed = cooldownMs - Math.max(0, remainingMs)
  return Math.max(0, Math.min(1, elapsed / cooldownMs))
}

// The three slots for an element, in input order (basic / Q / E), resolved
// against BALANCE. Returns [] for an unknown element rather than throwing —
// the HUD must never be what takes the scene down.
export function abilitySlots(element, { cdBasic = 0, cdSpecial = 0, cdSecond = 0 } = {}) {
  const basic = BALANCE.PLAYER?.BASIC?.[element]
  const ability = BALANCE.ABILITY?.[element]
  if (!basic || !ability) return []
  return [
    { key: 'LMB', label: 'BASIC', cooldownMs: basic.cooldownMs, remainingMs: cdBasic },
    { key: 'Q', label: ability.SPECIAL.name, cooldownMs: ability.SPECIAL.cooldownMs, remainingMs: cdSpecial },
    { key: 'E', label: ability.SECOND.name, cooldownMs: ability.SECOND.cooldownMs, remainingMs: cdSecond },
  ].map(s => ({
    ...s,
    state: slotState(s.remainingMs, s.cooldownMs),
    fill: slotFill(s.remainingMs, s.cooldownMs),
  }))
}

// Counts a snapshot's remaining-ms down by local frame time, so the bar moves
// smoothly at display rate instead of stepping at the 20 Hz emit. Never below
// 0, and never re-inflates — the next snapshot is authoritative.
export function decayRemaining(remainingMs, dtMs) {
  return Math.max(0, (remainingMs || 0) - Math.max(0, dtMs || 0))
}
