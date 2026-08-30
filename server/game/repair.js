// Channel-repair (spec §5): channel ~3s adjacent to a damaged structure
// (edge-distance, not center-distance — a player next to the 2x2 town hall
// is 16-32px farther from its center than its edge) to restore it to full HP
// at a reduced gold cost (BALANCE.REPAIR.COST_FRACTION of the structure's own
// build cost, deducted from the channeling player on completion).
//
// Progress is accumulated on the structure itself (structure.repairMs) so
// multiple partial channels (e.g. across ticks) sum toward completion. A
// structure at full HP is a silent noop — no progress, no channel started.
//
// OWNERSHIP: there is none, deliberately. Any player may repair any structure,
// which is what satisfies "any permitted teammate may repair a fusion
// structure" (combat-structure redesign §2 "Fusion permanence") without a
// special case — a team-owned fusion carries `ownerId: null` / `teamOwned:
// true` (combos.js) and reads here exactly like every other structure. Adding
// an owner gate would have to exempt fusions again; not adding one is the
// simpler contract. Repair progress does NOT survive fusion: completion
// rebuilds the surviving ingredient's fields from the catalog, so a
// half-channelled ingredient never hands its `repairMs` to a structure with a
// different maxHp.

import { BALANCE } from '../../shared/balance.js'
import { TILE_SIZE } from './grid.js'

function edgeDistance(structure, player) {
  const left   = structure.gx * TILE_SIZE
  const top    = structure.gy * TILE_SIZE
  const right  = left + structure.w * TILE_SIZE
  const bottom = top + structure.h * TILE_SIZE

  const dx = Math.max(left - player.x, 0, player.x - right)
  const dy = Math.max(top - player.y, 0, player.y - bottom)
  return Math.sqrt(dx * dx + dy * dy)
}

// Gold cost of fully repairing `structure`: COST_FRACTION of its own build
// cost (fusions cost 0 to build, so they cost 0 to repair — no special case
// needed for "Fusion permanence").
export function repairCost(structure) {
  const catalog = BALANCE.STRUCTURES[structure.type]
  return Math.round((catalog?.cost ?? 0) * BALANCE.REPAIR.COST_FRACTION)
}

// Returns { state: 'out-of-range' | 'noop' | 'insufficient-gold' | 'channeling' | 'repaired' }.
export function tryChannelRepair(structure, player, deltaMs) {
  if (edgeDistance(structure, player) > BALANCE.REPAIR.RANGE_PX) {
    return { state: 'out-of-range' }
  }
  if (structure.hp >= structure.maxHp) return { state: 'noop' }

  const cost = repairCost(structure)
  if ((player.gold ?? 0) < cost) return { state: 'insufficient-gold' }

  structure.repairMs = (structure.repairMs || 0) + deltaMs
  if (structure.repairMs < BALANCE.REPAIR.CHANNEL_MS) return { state: 'channeling' }

  structure.repairMs = 0
  structure.hp = structure.maxHp
  player.gold -= cost
  return { state: 'repaired' }
}

// The damaged structure a channeling player acts on: nearest by edge-distance
// within RANGE_PX. Nearest (not first-found) matters because footprints can
// overlap the same 40px radius — a player wedged between a damaged wall and a
// damaged tower would otherwise repair whichever happens to sit earlier in
// state.structures, which is placement order and reads as random.
export function findRepairTarget(state, player) {
  let best = null, bestD = Infinity
  for (const s of state.structures) {
    if (s.hp >= s.maxHp) continue
    const d = edgeDistance(s, player)
    if (d <= BALANCE.REPAIR.RANGE_PX && d < bestD) { best = s; bestD = d }
  }
  return best
}

// Per-tick orchestration for every player holding the repair action.
//
// INTERRUPT SEMANTICS: progress RESETS when a channel lapses, it does not
// pause. This follows the revive channel (players.js tickLifecycle) rather
// than inventing a second convention — the Phase-4 spec amendment recorded
// "interrupted channels restart" as a deliberate design decision, and a
// repair that silently banked partial progress across a whole wave would
// read very differently from a revive that doesn't. The reset lives here, in
// the caller, because tryChannelRepair is deliberately a pure per-call
// function that cannot see whether a lapse happened.
//
// CONCURRENT CHANNELS: two players on the same structure each add their own
// deltaMs, so a co-op repair genuinely completes twice as fast. That is kept
// as a feature, not guarded against — it rewards coordination and matches
// the "any player may repair any structure" ownership rule above.
export function tickRepairChannels(state, inputBuffer, dtMs) {
  const channeling = new Set()

  for (const p of state.players) {
    if (p.life !== 'up') continue
    const input = inputBuffer && inputBuffer.get ? inputBuffer.get(p.id) : null
    if (!input || !input.actions || !input.actions.repair) continue

    const target = findRepairTarget(state, p)
    if (!target) continue

    const result = tryChannelRepair(target, p, dtMs)
    if (result.state === 'channeling') {
      channeling.add(target.id)
    } else if (result.state === 'repaired') {
      state.fx.push({
        type: 'repair_done',
        x: (target.gx + target.w / 2) * TILE_SIZE,
        y: (target.gy + target.h / 2) * TILE_SIZE,
      })
    }
  }

  // Lapse sweep: anything carrying progress that nobody advanced this tick
  // loses it. Runs over structures (not players) so a channel dropped by
  // disconnect, death or the structure being destroyed resets identically.
  for (const s of state.structures) {
    if (s.repairMs && !channeling.has(s.id)) s.repairMs = 0
  }
}
