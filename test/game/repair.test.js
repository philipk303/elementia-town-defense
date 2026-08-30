import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tryChannelRepair, tickRepairChannels } from '../../server/game/repair.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'

// Structure footprint AABB in world px, matching structures.js's 1-tile
// (32px) and hall's 2x2 (64px) footprints.
function makeStructure({ gx = 5, gy = 5, w = 1, h = 1, hp = 50, maxHp = 100 } = {}) {
  return { gx, gy, w, h, hp, maxHp }
}

test('repairing from outside range makes no progress', () => {
  const structure = makeStructure()
  const player = { x: tileToWorldX(5) + 1000, y: tileToWorldY(5) }
  const res = tryChannelRepair(structure, player, BALANCE.REPAIR.CHANNEL_MS)
  assert.equal(res.state, 'out-of-range')
  assert.equal(structure.hp, 50)
})

test('channeling adjacent to a full-hp structure is a noop', () => {
  const structure = makeStructure({ hp: 100, maxHp: 100 })
  const player = { x: tileToWorldX(6), y: tileToWorldY(5) } // adjacent tile
  const res = tryChannelRepair(structure, player, BALANCE.REPAIR.CHANNEL_MS)
  assert.equal(res.state, 'noop')
})

test('a full ~3s channel adjacent to a damaged structure restores it to full HP', () => {
  const structure = makeStructure({ hp: 50, maxHp: 100 })
  const player = { x: tileToWorldX(6), y: tileToWorldY(5) }
  const res = tryChannelRepair(structure, player, BALANCE.REPAIR.CHANNEL_MS)
  assert.equal(res.state, 'repaired')
  assert.equal(structure.hp, 100)
})

test('partial channel progress accumulates across calls without repairing early', () => {
  const structure = makeStructure({ hp: 50, maxHp: 100 })
  const player = { x: tileToWorldX(6), y: tileToWorldY(5) }
  const half = BALANCE.REPAIR.CHANNEL_MS / 2
  let res = tryChannelRepair(structure, player, half)
  assert.equal(res.state, 'channeling')
  assert.equal(structure.hp, 50) // no HP restored until the channel completes
  res = tryChannelRepair(structure, player, half)
  assert.equal(res.state, 'repaired')
  assert.equal(structure.hp, 100)
})

test('a full channel deducts COST_FRACTION of the structure\'s build cost from the player', () => {
  const structure = { ...makeStructure({ hp: 50, maxHp: 100 }), type: 'WATCHTOWER' } // cost 6
  const player = { x: tileToWorldX(6), y: tileToWorldY(5), gold: 10 }
  const res = tryChannelRepair(structure, player, BALANCE.REPAIR.CHANNEL_MS)
  assert.equal(res.state, 'repaired')
  assert.equal(player.gold, 10 - 3) // round(6 * 0.5)
})

test('channeling without enough gold is blocked and makes no progress', () => {
  const structure = { ...makeStructure({ hp: 50, maxHp: 100 }), type: 'WATCHTOWER' } // cost 6, repair cost 3
  const player = { x: tileToWorldX(6), y: tileToWorldY(5), gold: 2 }
  const res = tryChannelRepair(structure, player, BALANCE.REPAIR.CHANNEL_MS)
  assert.equal(res.state, 'insufficient-gold')
  assert.equal(structure.hp, 50)
  assert.ok(!structure.repairMs)
  assert.equal(player.gold, 2)
})

test('range uses edge-distance, not center-distance, for multi-tile structures', () => {
  // A 2x2 hall footprint at (0,0): edge is at world x=64. A player just past
  // that edge (within REPAIR.RANGE_PX) is in range even though the footprint
  // center is much farther away than RANGE_PX.
  const hall = makeStructure({ gx: 0, gy: 0, w: 2, h: 2, hp: 50, maxHp: 100 })
  const edgeX = 2 * 32 // right edge of the 2x2 footprint in world px
  const player = { x: edgeX + BALANCE.REPAIR.RANGE_PX - 1, y: 32 }
  const res = tryChannelRepair(hall, player, BALANCE.REPAIR.CHANNEL_MS)
  assert.equal(res.state, 'repaired')
})

// --- channel orchestration (tickRepairChannels) ---
// The pure function above is per-call; these cover what the caller owns:
// target selection, the lapse reset, co-op stacking and the completion fx.

function makeRepairState(structures, players) {
  return { structures, players, fx: [] }
}

function bufferOf(map) {
  return { get: id => map[id] ?? null }
}

const HOLD = { actions: { repair: true } }
const IDLE = { actions: { repair: false } }

test('a held repair channel advances the nearest damaged structure in range', () => {
  const s = { id: 1, ...makeStructure({ gx: 5, gy: 5, hp: 50, maxHp: 100 }) }
  const p = { id: 'p1', life: 'up', x: tileToWorldX(6), y: tileToWorldY(5) }
  const state = makeRepairState([s], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 500)
  assert.equal(s.repairMs, 500)
  assert.equal(s.hp, 50)
})

test('a lapsed channel RESETS progress rather than banking it (revive precedent)', () => {
  const s = { id: 1, ...makeStructure({ gx: 5, gy: 5, hp: 50, maxHp: 100 }) }
  const p = { id: 'p1', life: 'up', x: tileToWorldX(6), y: tileToWorldY(5) }
  const state = makeRepairState([s], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 1000)
  assert.equal(s.repairMs, 1000)
  tickRepairChannels(state, bufferOf({ p1: IDLE }), 1000) // released the key
  assert.equal(s.repairMs, 0)
})

test('walking out of range mid-channel also resets progress', () => {
  const s = { id: 1, ...makeStructure({ gx: 5, gy: 5, hp: 50, maxHp: 100 }) }
  const p = { id: 'p1', life: 'up', x: tileToWorldX(6), y: tileToWorldY(5) }
  const state = makeRepairState([s], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 1000)
  assert.equal(s.repairMs, 1000)
  p.x = tileToWorldX(5) + 1000 // still holding the key, but far away
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 1000)
  assert.equal(s.repairMs, 0)
})

test('a player without enough gold makes no progress on a channel', () => {
  const s = { id: 1, ...makeStructure({ gx: 5, gy: 5, hp: 50, maxHp: 100 }), type: 'WATCHTOWER' }
  const p = { id: 'p1', life: 'up', x: tileToWorldX(6), y: tileToWorldY(5), gold: 0 }
  const state = makeRepairState([s], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 1000)
  assert.ok(!s.repairMs)
})

test('a downed player does not channel', () => {
  const s = { id: 1, ...makeStructure({ gx: 5, gy: 5, hp: 50, maxHp: 100 }) }
  const p = { id: 'p1', life: 'down', x: tileToWorldX(6), y: tileToWorldY(5) }
  const state = makeRepairState([s], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 1000)
  assert.ok(!s.repairMs)
})

test('the NEAREST damaged structure wins when two are in range', () => {
  const near = { id: 1, ...makeStructure({ gx: 6, gy: 5, hp: 50, maxHp: 100 }) }
  const far  = { id: 2, ...makeStructure({ gx: 4, gy: 5, hp: 50, maxHp: 100 }) }
  // Player sits just right of the near structure's footprint; `far` is listed
  // first so a first-match implementation would pick the wrong one.
  const p = { id: 'p1', life: 'up', x: tileToWorldX(7) + 4, y: tileToWorldY(5) + 16 }
  const state = makeRepairState([far, near], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 500)
  assert.equal(near.repairMs, 500)
  assert.ok(!far.repairMs)
})

test('a full-hp structure is skipped in favour of a damaged one in range', () => {
  const healthy = { id: 1, ...makeStructure({ gx: 6, gy: 5, hp: 100, maxHp: 100 }) }
  const damaged = { id: 2, ...makeStructure({ gx: 5, gy: 5, hp: 50, maxHp: 100 }) }
  const p = { id: 'p1', life: 'up', x: tileToWorldX(6), y: tileToWorldY(5) }
  const state = makeRepairState([healthy, damaged], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 500)
  assert.equal(damaged.repairMs, 500)
})

test('two players channelling the same structure stack progress (co-op speedup)', () => {
  const s = { id: 1, ...makeStructure({ gx: 5, gy: 5, hp: 50, maxHp: 100 }) }
  const p1 = { id: 'p1', life: 'up', x: tileToWorldX(6), y: tileToWorldY(5) }
  const p2 = { id: 'p2', life: 'up', x: tileToWorldX(6), y: tileToWorldY(5) + 8 }
  const state = makeRepairState([s], [p1, p2])
  tickRepairChannels(state, bufferOf({ p1: HOLD, p2: HOLD }), 500)
  assert.equal(s.repairMs, 1000) // both contributed their own delta
})

test('completing a channel restores hp and pushes the repair_done fx', () => {
  const s = { id: 1, ...makeStructure({ gx: 5, gy: 5, hp: 50, maxHp: 100 }) }
  const p = { id: 'p1', life: 'up', x: tileToWorldX(6), y: tileToWorldY(5) }
  const state = makeRepairState([s], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), BALANCE.REPAIR.CHANNEL_MS)
  assert.equal(s.hp, 100)
  assert.equal(s.repairMs, 0)
  assert.equal(state.fx.length, 1)
  assert.equal(state.fx[0].type, 'repair_done')
})

test('no fx and no progress when nothing damaged is in range', () => {
  const s = { id: 1, ...makeStructure({ gx: 40, gy: 40, hp: 50, maxHp: 100 }) }
  const p = { id: 'p1', life: 'up', x: tileToWorldX(1), y: tileToWorldY(1) }
  const state = makeRepairState([s], [p])
  tickRepairChannels(state, bufferOf({ p1: HOLD }), 1000)
  assert.equal(state.fx.length, 0)
  assert.ok(!s.repairMs)
})
