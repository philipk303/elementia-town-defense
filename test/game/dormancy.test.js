import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeStructure, damageStructure } from '../../server/game/structures.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { CONFIG } from '../../shared/constants.js'

function makeState() {
  return {
    phase: PHASES.BUILD,
    hall: { gx: CONFIG.HALL.gx, gy: CONFIG.HALL.gy, w: CONFIG.HALL.w, h: CONFIG.HALL.h, x: 0, y: 0 },
    players: [
      { id: 'p0', element: 'EARTH', isBot: false, gold: 9999 },
      { id: 'p1', element: 'FIRE',  isBot: true },
      { id: 'p2', element: 'WATER', isBot: true },
      { id: 'p3', element: 'WIND',  isBot: true },
    ],
    structures: [],
    placedVersion: 0,
  }
}

test('destroying a supporting farm sends the dependent marketplace dormant, rebuilding reactivates it', () => {
  const s = makeState()
  const f1 = placeStructure(s, s.players[0], 'FARM', 5, 5, 1000).structure
  placeStructure(s, s.players[0], 'FARM', 6, 5, 1001)
  const mp = placeStructure(s, s.players[0], 'MARKETPLACE', 8, 5, 1002).structure
  assert.equal(mp.dormant, false)

  damageStructure(s, f1, 9999) // destroy one of the two supporting farms
  assert.equal(mp.dormant, true)

  placeStructure(s, s.players[0], 'FARM', 5, 6, 1003) // rebuild outside the 2x2 marketplace
  assert.equal(mp.dormant, false)
})

test('a second marketplace goes dormant first (FIFO) when farms fall short', () => {
  const s = makeState()
  const f1 = placeStructure(s, s.players[0], 'FARM', 1, 5, 1000).structure
  placeStructure(s, s.players[0], 'FARM', 2, 5, 1001)
  const mp1 = placeStructure(s, s.players[0], 'MARKETPLACE', 4, 5, 1002).structure
  placeStructure(s, s.players[0], 'FARM', 1, 7, 1003)
  placeStructure(s, s.players[0], 'FARM', 2, 7, 1004)
  const mp2 = placeStructure(s, s.players[0], 'MARKETPLACE', 4, 7, 1005).structure
  assert.equal(mp1.dormant, false)
  assert.equal(mp2.dormant, false)

  damageStructure(s, f1, 9999) // now only 3 farms stand, need 4 for both marketplaces
  assert.equal(mp1.dormant, false) // oldest keeps priority
  assert.equal(mp2.dormant, true)
})
