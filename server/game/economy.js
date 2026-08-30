// Economy — even-split personal wallets + ownership dividend (spec §3).
// No shared wallet: each wave's pooled income (hall base + citizen headcount
// + that wave's bounty accrual) splits evenly across HUMAN players only, into
// personal wallets. AI teammate bots neither earn nor spend (Section 2).
// Ownership dividends are new gold on top, paid only to the human who
// personally built a standing Farm/Marketplace, and stop while it's
// destroyed or (Marketplace only) dormant.

import { STRUCTURE_TYPES, ELEMENT_SPECIAL_TYPE, ELEMENTS } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { placeStructure, placeSeedStructure } from './structures.js'

// Split `amount` gold across `count` players as evenly as possible. Integer
// division with the remainder going to the first N players (deterministic,
// no gold lost to rounding — the spec's acceptance test requires round-trip
// correctness).
export function splitEvenly(amount, count) {
  if (count <= 0) return []
  const base = Math.floor(amount / count)
  const remainder = amount - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

// Living citizen headcount: Farm + non-dormant Marketplace houses (spec §3
// "Population buildings"). A dormant Marketplace contributes 0 (its Farm
// support was destroyed) but still occupies its tile.
export function citizenCount(state) {
  let n = 0
  for (const s of state.structures || []) {
    if (s.type === STRUCTURE_TYPES.FARM) n += BALANCE.FARM_HOUSES
    else if (s.type === STRUCTURE_TYPES.MARKETPLACE && !s.dormant) n += BALANCE.MARKETPLACE_HOUSES
  }
  return n
}

// Wave-end tally (spec §3): pooled income splits evenly among humans, then
// ownership dividends add new gold on top for whoever built the standing
// eco structure. Mutates player.gold in place and records state.lastWaveTally
// for the HUD (Phase 7).
export function applyWaveEndIncome(state) {
  const humans = state.players.filter(p => !p.isBot)
  const citizens = citizenCount(state)
  const bounty = state.waveBounty || 0
  const pooled = BALANCE.ECONOMY.HALL_BASE_INCOME + citizens * BALANCE.ECONOMY.CITIZEN_INCOME + bounty
  const shares = splitEvenly(pooled, humans.length)
  humans.forEach((p, i) => { p.gold = (p.gold ?? 0) + shares[i] })

  const dividends = {}
  for (const s of state.structures || []) {
    if (!s.ownerId) continue
    let amount = 0
    if (s.type === STRUCTURE_TYPES.FARM) amount = BALANCE.FARM_DIVIDEND
    else if (s.type === STRUCTURE_TYPES.MARKETPLACE && !s.dormant) amount = BALANCE.MARKETPLACE_DIVIDEND
    if (amount <= 0) continue
    const owner = humans.find(p => p.id === s.ownerId)
    if (!owner) continue
    owner.gold += amount
    dividends[s.ownerId] = (dividends[s.ownerId] || 0) + amount
  }

  state.lastWaveTally = {
    wave: state.wave, pooled, citizens, bounty,
    shares: humans.map((p, i) => ({ id: p.id, share: shares[i] })),
    dividends,
  }
  return state.lastWaveTally
}

// Pre-built starting town (spec §3 "Starting state"): town hall + 2 Farms +
// 1 Marketplace = 8 citizens, no player owner (no dividend). Each human
// starts with ECONOMY.STARTING_GOLD. Each bot-controlled element's special
// structure is auto-placed near the hall too (bots never send BUILD_STRUCTURE
// themselves) — ownerless, so any human may sell it (sellStructure has no
// ownership restriction). Human-controlled elements get their free special
// via buildStructure's wave-1 grant instead, placed where the player chooses.
export function seedStartingEconomy(state, now = 0) {
  for (const p of state.players) {
    if (!p.isBot) p.gold = (p.gold ?? 0) + BALANCE.ECONOMY.STARTING_GOLD
  }

  const hallGx = state.hall.gx
  const farmRowGy = state.hall.gy - 7
  placeSeedStructure(state, STRUCTURE_TYPES.FARM, hallGx - 2, farmRowGy, now)
  placeSeedStructure(state, STRUCTURE_TYPES.FARM, hallGx, farmRowGy, now)
  placeSeedStructure(state, STRUCTURE_TYPES.MARKETPLACE, hallGx + 2, farmRowGy, now)

  const specialRowGy = state.hall.gy - 5
  let slot = 0
  for (const el of ELEMENTS) {
    const owner = state.players.find(p => p.element === el)
    if (!owner?.isBot) continue
    placeSeedStructure(state, ELEMENT_SPECIAL_TYPE[el], hallGx - 3 + slot * 2, specialRowGy, now)
    slot++
  }
}

// BUILD_STRUCTURE entry point (wraps structures.placeStructure): grants each
// player one free placement of their OWN element's special structure during
// wave 1's build phase (spec §3 "doesn't touch the gold economy"), then
// falls through to normal paid placement for everything else.
export function buildStructure(state, player, type, gx, gy, now, opts = {}) {
  const free = ELEMENT_SPECIAL_TYPE[player.element] === type &&
    !player.usedFreeSpecial && state.wave === 1
  const res = placeStructure(state, player, type, gx, gy, now, { free, orient: opts.orient, dir: opts.dir })
  if (res.ok && free) player.usedFreeSpecial = true
  return res
}
