import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeStructure } from '../../server/game/structures.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { CONFIG } from '../../shared/constants.js'
import { tileToWorldX, tileToWorldY, TILES_W } from '../../server/game/grid.js'

function makeState() {
  return {
    phase: PHASES.BUILD,
    hall: {
      gx: CONFIG.HALL.gx, gy: CONFIG.HALL.gy, w: CONFIG.HALL.w, h: CONFIG.HALL.h,
      x: tileToWorldX(CONFIG.HALL.gx) + 16, y: tileToWorldY(CONFIG.HALL.gy) + 16,
    },
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

test('an isolated barricade placement carries no reachability warning', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'BARRICADE', 10, 10, 1000)
  assert.equal(res.ok, true)
  assert.equal(res.warning, null)
})

test('a full-width solid wall between the hall and every gate warns self-sealing', () => {
  const s = makeState()
  // Row y=10 sits between the hall (bottom) and all 3 gates (top edge, y=0).
  // A solid, gap-free line across the whole map width hard-blocks the flood
  // fill used for the warning (unlike the real cost field, which never seals).
  let lastRes
  for (let gx = 0; gx < TILES_W; gx++) {
    lastRes = placeStructure(s, s.players[0], 'BARRICADE', gx, 10, 1000 + gx)
    assert.equal(lastRes.ok, true)
  }
  assert.equal(lastRes.warning, 'self-sealing')
})
