// Multi-tile footprints (combat-structure-redesign §2 "shared placement rules").
//
// Until now footprint() answered HALL-or-1x1, so every buildable structure owned
// exactly one tile. The elemental structures are 2x1 or 1x2 with the ORIENTATION
// chosen at placement, and fusions are 2x2 — which makes footprint a function of
// (type, orient), and makes occupancy a multi-tile question everywhere.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeStructure, footprint, findStructureAt } from '../../server/game/structures.js'
import { CostField } from '../../server/game/costField.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { CONFIG, STRUCTURE_TYPES } from '../../shared/constants.js'

function makeState() {
  const hallGx = CONFIG.HALL.gx, hallGy = CONFIG.HALL.gy
  const costField = new CostField()
  costField.setHall(hallGx, hallGy)
  costField.compute()
  return {
    phase: PHASES.BUILD,
    hall: {
      gx: hallGx, gy: hallGy, w: CONFIG.HALL.w, h: CONFIG.HALL.h,
      x: tileToWorldX(hallGx) + CONFIG.HALL.w / 2 * 32 - 16,
      y: tileToWorldY(hallGy),
      hp: BALANCE.HALL_HP, maxHp: BALANCE.HALL_HP,
    },
    players: [
      { id: 'p0', element: 'FIRE', isBot: false, gold: 9999 },
      { id: 'p1', element: 'EARTH', isBot: true },
      { id: 'p2', element: 'WATER', isBot: true },
      { id: 'p3', element: 'WIND',  isBot: true },
    ],
    structures: [],
    placedVersion: 0,
    costField,
  }
}

test('a Firepit is 2x1 horizontal and 1x2 vertical', () => {
  assert.deepEqual(footprint(STRUCTURE_TYPES.FIRE_SPECIAL, 'H'), { w: 2, h: 1 })
  assert.deepEqual(footprint(STRUCTURE_TYPES.FIRE_SPECIAL, 'V'), { w: 1, h: 2 })
})

test('a 1x1 structure ignores orientation', () => {
  assert.deepEqual(footprint(STRUCTURE_TYPES.BARRICADE, 'V'), { w: 1, h: 1 })
})

test('placing a 2x1 structure occupies BOTH tiles', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], STRUCTURE_TYPES.FIRE_SPECIAL, 5, 5, 1000, { orient: 'H' })
  assert.equal(res.ok, true)
  assert.equal(res.structure.w, 2)
  assert.ok(findStructureAt(s, 5, 5), 'anchor tile is occupied')
  assert.ok(findStructureAt(s, 6, 5), 'the second tile is occupied too')
})

test('a second structure cannot be placed on a 2x1 structure\'s far tile', () => {
  const s = makeState()
  placeStructure(s, s.players[0], STRUCTURE_TYPES.FIRE_SPECIAL, 5, 5, 1000, { orient: 'H' })
  const res = placeStructure(s, s.players[0], STRUCTURE_TYPES.BARRICADE, 6, 5, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'occupied')
})

test('a vertical Firepit occupies the tile BELOW its anchor, not beside it', () => {
  const s = makeState()
  placeStructure(s, s.players[0], STRUCTURE_TYPES.FIRE_SPECIAL, 5, 5, 1000, { orient: 'V' })
  assert.ok(findStructureAt(s, 5, 6), 'the tile below is occupied')
  assert.equal(findStructureAt(s, 6, 5), null, 'the tile beside is free')
})

test('a 2x1 placement that runs off the map edge is rejected', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], STRUCTURE_TYPES.FIRE_SPECIAL, 39, 5, 1000, { orient: 'H' })
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'out-of-bounds')
})
