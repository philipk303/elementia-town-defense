import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  placeStructure, sellStructure, damageStructure, findStructureAt,
} from '../../server/game/structures.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { BALANCE } from '../../shared/balance.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'
import { CONFIG } from '../../shared/constants.js'

// Minimal state factory — only the fields structures.js reads. Hall matches
// server/game/state.js's real placement (2x2, bottom-center) so no-build-arc
// and bounds checks exercise realistic geometry.
function makeState({ phase = PHASES.BUILD } = {}) {
  const hallGx = CONFIG.HALL.gx, hallGy = CONFIG.HALL.gy
  const hallCenterX = tileToWorldX(hallGx) + CONFIG.HALL.w / 2 * 32 - 32 / 2
  return {
    phase,
    hall: {
      gx: hallGx, gy: hallGy, w: CONFIG.HALL.w, h: CONFIG.HALL.h,
      x: hallCenterX, y: tileToWorldY(hallGy),
      hp: BALANCE.HALL_HP, maxHp: BALANCE.HALL_HP,
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

test('places a generic tower on an empty tile during build phase', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'BARRICADE', 5, 5, 1000)
  assert.equal(res.ok, true)
  assert.equal(res.structure.type, 'BARRICADE')
  assert.equal(res.structure.gx, 5)
  assert.equal(res.structure.hp, BALANCE.STRUCTURES.BARRICADE.hp)
  assert.equal(s.structures.length, 1)
  assert.equal(s.placedVersion, 1)
})

test('rejects placement outside build phase', () => {
  const s = makeState({ phase: PHASES.FIGHT })
  const res = placeStructure(s, s.players[0], 'BARRICADE', 5, 5, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'wrong-phase')
  assert.equal(s.structures.length, 0)
})

test('rejects placement on an already-occupied tile instead of evicting it', () => {
  const s = makeState()
  const first = placeStructure(s, s.players[0], 'BARRICADE', 5, 5, 1000)
  const second = placeStructure(s, s.players[0], 'WATCHTOWER', 5, 5, 1001)
  assert.equal(second.ok, false)
  assert.equal(second.reason, 'occupied')
  // The first structure must still be there — reject, not evict.
  assert.equal(s.structures.length, 1)
  assert.equal(s.structures[0].id, first.structure.id)
})

test('rejects placement on the hall footprint', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'BARRICADE', s.hall.gx, s.hall.gy, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'occupied')
})

test('rejects placement inside the no-build arc behind the hall', () => {
  const s = makeState()
  // One tile above the hall's top-left corner is well within the 160px radius.
  const res = placeStructure(s, s.players[0], 'BARRICADE', s.hall.gx, s.hall.gy - 1, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'no-build-arc')
})

test('rejects out-of-bounds placement', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'BARRICADE', 999, 999, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'out-of-bounds')
})

test('a human may place their own element special structure', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'EARTH_SPECIAL', 5, 5, 1000)
  assert.equal(res.ok, true)
})

test('a human may place a bot-controlled element special structure', () => {
  const s = makeState()
  // p1 is a bot on FIRE; any human may place FIRE_SPECIAL.
  const res = placeStructure(s, s.players[0], 'FIRE_SPECIAL', 5, 5, 1000)
  assert.equal(res.ok, true)
})

test('a human may NOT place another human element special structure', () => {
  const s = makeState()
  s.players[1].isBot = false // p1 (FIRE) is now human-controlled too
  const res = placeStructure(s, s.players[0], 'FIRE_SPECIAL', 5, 5, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'element-locked')
})

test('marketplace build rejects when fewer than 2 standing farms support it', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'MARKETPLACE', 5, 5, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'farm-shortage')
})

test('marketplace builds once 2 farms stand', () => {
  const s = makeState()
  placeStructure(s, s.players[0], 'FARM', 5, 5, 1000)
  placeStructure(s, s.players[0], 'FARM', 6, 5, 1001)
  const res = placeStructure(s, s.players[0], 'MARKETPLACE', 7, 5, 1002)
  assert.equal(res.ok, true)
  assert.equal(res.structure.dormant, false)
})

test('marketplace occupies its approved 2x2 market-square footprint', () => {
  const s = makeState()
  placeStructure(s, s.players[0], 'FARM', 5, 5, 1000)
  placeStructure(s, s.players[0], 'FARM', 6, 5, 1001)
  const { structure } = placeStructure(s, s.players[0], 'MARKETPLACE', 7, 5, 1002)

  assert.deepEqual({ w: structure.w, h: structure.h }, { w: 2, h: 2 })
  assert.equal(findStructureAt(s, 8, 6)?.id, structure.id)
})

test('sellStructure refunds ~65% of cost and removes the structure, build phase only', () => {
  const s = makeState()
  const { structure } = placeStructure(s, s.players[0], 'WATCHTOWER', 5, 5, 1000)
  const res = sellStructure(s, s.players[0], structure.id)
  assert.equal(res.ok, true)
  assert.equal(res.refund, Math.ceil(BALANCE.STRUCTURES.WATCHTOWER.cost * BALANCE.SELL_REFUND_RATE))
  assert.equal(s.structures.length, 0)
  assert.equal(findStructureAt(s, 5, 5), null)
})

test('sellStructure rejects during fight phase', () => {
  const s = makeState()
  const { structure } = placeStructure(s, s.players[0], 'WATCHTOWER', 5, 5, 1000)
  s.phase = PHASES.FIGHT
  const res = sellStructure(s, s.players[0], structure.id)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'wrong-phase')
  assert.equal(s.structures.length, 1)
})

test('rejects an unknown or non-buildable type (e.g. HALL, a combo type, garbage)', () => {
  const s = makeState()
  for (const type of ['HALL', 'MAGMA_TRAP', 'nonsense', undefined]) {
    const res = placeStructure(s, s.players[0], type, 5, 5, 1000)
    assert.equal(res.ok, false)
    assert.equal(res.reason, 'invalid-type')
  }
})

test('rejects non-integer tile coordinates', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'BARRICADE', 5.5, NaN, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'invalid-tile')
})

test('damageStructure destroys the structure at 0 hp and bumps placedVersion', () => {
  const s = makeState()
  const { structure } = placeStructure(s, s.players[0], 'BARRICADE', 5, 5, 1000)
  const pvBefore = s.placedVersion
  const destroyed = damageStructure(s, structure, 9999)
  assert.equal(destroyed, true)
  assert.equal(s.structures.length, 0)
  assert.ok(s.placedVersion > pvBefore)
})

test('rejects a multi-tile placement whose far tile enters the no-build arc even though the anchor does not (Gate 1 finding 2.8)', () => {
  const s = makeState()
  // Anchor tile (14, hall.gy) sits just outside the 160px arc; EARTH_SPECIAL's
  // second tile (15, hall.gy) — required by its 2x1 footprint — falls inside it.
  const res = placeStructure(s, s.players[0], 'EARTH_SPECIAL', 14, s.hall.gy, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'no-build-arc')
})

test('rejects an invalid orientation value', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'EARTH_SPECIAL', 5, 5, 1000, { orient: 'diagonal' })
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'invalid-orientation')
})

test('vertical orientation transposes the footprint', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'EARTH_SPECIAL', 5, 5, 1000, { orient: 'V' })
  assert.equal(res.ok, true)
  assert.equal(res.structure.orient, 'V')
  assert.equal(res.structure.w, 1)
  assert.equal(res.structure.h, 2)
})

test('a directional type (Water Geyser) requires a cardinal direction', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'WATER_SPECIAL', 5, 5, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'invalid-direction')
})

test('a directional type rejects a garbage direction value', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'WATER_SPECIAL', 5, 5, 1000, { dir: 'UP' })
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'invalid-direction')
})

test('a directional type (Wind Vortex) accepts a valid cardinal direction and stores it', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'WIND_SPECIAL', 5, 5, 1000, { dir: 'E' })
  assert.equal(res.ok, true)
  assert.equal(res.structure.dir, 'E')
})

test('a non-directional type stores no direction by default', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'BARRICADE', 5, 5, 1000)
  assert.equal(res.ok, true)
  assert.equal(res.structure.dir, null)
})

test('a non-directional type rejects a direction supplied anyway (invalid combination)', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], 'BARRICADE', 5, 5, 1000, { dir: 'N' })
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'invalid-direction')
})

test('structure IDs are allocated per game state, not from a shared global counter (Gate 1 finding 2.1)', () => {
  const stateA = makeState()
  placeStructure(stateA, stateA.players[0], 'BARRICADE', 5, 5, 1000)
  placeStructure(stateA, stateA.players[0], 'BARRICADE', 6, 5, 1000)

  // A brand-new game state (a second concurrently-live room) must not inherit
  // stateA's ID counter, even though stateA has already allocated IDs 0 and 1.
  const stateB = makeState()
  const res = placeStructure(stateB, stateB.players[0], 'BARRICADE', 5, 5, 1000)
  assert.equal(res.structure.id, 0)
})
