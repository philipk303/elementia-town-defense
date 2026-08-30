// Farm -> Marketplace dependency (spec §3 "Population buildings"). A
// Marketplace requires 2 standing Farms; losing a supporting Farm sends a
// Marketplace dormant (0 output/income, tile still occupied) until Farm
// capacity is restored. Not a per-pair assignment — a single global ratio,
// FIFO priority to the oldest Marketplace (deterministic, matches the
// build-time gate in structures.js which reserves capacity in build order).

import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

export function recomputeDormancy(state) {
  const farmCount = state.structures.filter(s => s.type === STRUCTURE_TYPES.FARM).length
  const marketplaces = state.structures
    .filter(s => s.type === STRUCTURE_TYPES.MARKETPLACE)
    .sort((a, b) => a.createdAt - b.createdAt)

  let required = 0
  for (const m of marketplaces) {
    required += BALANCE.FARMS_PER_MARKETPLACE
    m.dormant = required > farmCount
  }
}
