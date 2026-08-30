// Build palette's pure logic (client/src/ui/buildPalette.js).
//
// The DOM half needs a browser and is verified live; what is tested here is
// the part that decides whether a button is usable and what it says when it is
// not. That decision has to mirror the server's own placement rules, because a
// palette that offers a build the server will refuse is worse than no palette.

import test from 'node:test'
import assert from 'node:assert/strict'
import { typeAvailability, shortLabel, reasonText } from '../../client/src/ui/buildPalette.js'
import { BUILDABLE_TYPES, STRUCTURE_TYPES, SPECIAL_TYPE_ELEMENT } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

const COSTS = Object.fromEntries(BUILDABLE_TYPES.map(t => [t, BALANCE.STRUCTURES[t].cost]))
const base = (over = {}) => ({
  gold: 999, element: 'EARTH', players: [], structures: [],
  costs: COSTS, specialElement: SPECIAL_TYPE_ELEMENT,
  farmsPerMarketplace: BALANCE.FARMS_PER_MARKETPLACE,
  ...over,
})

test('a plain buildable is available and carries its real cost', () => {
  const r = typeAvailability(STRUCTURE_TYPES.BARRICADE, base())
  assert.equal(r.ok, true)
  assert.equal(r.cost, BALANCE.STRUCTURES.BARRICADE.cost)
})

test('every buildable type has a cost and a label to show', () => {
  for (const t of BUILDABLE_TYPES) {
    assert.ok(COSTS[t] != null, `${t} has no cost`)
    assert.ok(shortLabel(t).length > 0 && shortLabel(t).length <= 12, `${t} label unusable on a button`)
  }
})

test('too little gold disables the button and says why', () => {
  const cost = BALANCE.STRUCTURES.WATCHTOWER.cost
  const r = typeAvailability(STRUCTURE_TYPES.WATCHTOWER, base({ gold: cost - 1 }))
  assert.equal(r.ok, false)
  assert.equal(r.reason, 'gold')
  assert.equal(reasonText(r.reason), 'no gold')
  assert.equal(typeAvailability(STRUCTURE_TYPES.WATCHTOWER, base({ gold: cost })).ok, true,
    'exactly enough gold must be enough')
})

// An unknown wallet is not a known-empty one — the same rule the placement
// ghost uses, so the palette does not grey everything out before the first
// snapshot arrives.
test('an unknown gold balance does not disable anything', () => {
  assert.equal(typeAvailability(STRUCTURE_TYPES.WATCHTOWER, base({ gold: null })).ok, true)
})

test("another human's element special is locked, a bot's is not", () => {
  const fireType = Object.entries(SPECIAL_TYPE_ELEMENT).find(([, el]) => el === 'FIRE')?.[0]
  assert.ok(fireType, 'no FIRE special in SPECIAL_TYPE_ELEMENT')
  const human = typeAvailability(fireType, base({ players: [{ element: 'FIRE', isBot: false }] }))
  assert.equal(human.ok, false)
  assert.equal(human.reason, 'element')
  assert.equal(reasonText(human.reason), 'not yours')
  assert.equal(typeAvailability(fireType, base({ players: [{ element: 'FIRE', isBot: true }] })).ok, true)
})

test('your own element special is always yours to place', () => {
  const earthType = Object.entries(SPECIAL_TYPE_ELEMENT).find(([, el]) => el === 'EARTH')?.[0]
  assert.equal(typeAvailability(earthType, base({ element: 'EARTH' })).ok, true)
})

// Mirrors structures.js placeStructure: (marketplaces + 1) * FARMS_PER_MARKETPLACE
// farms must already be standing.
test('the marketplace farm ratio gates the button exactly as the server does', () => {
  const need = BALANCE.FARMS_PER_MARKETPLACE
  const farms = (n) => Array.from({ length: n }, () => ({ type: STRUCTURE_TYPES.FARM }))
  const short = typeAvailability(STRUCTURE_TYPES.MARKETPLACE, base({ structures: farms(need - 1) }))
  assert.equal(short.ok, false)
  assert.equal(short.reason, 'farms')
  assert.equal(reasonText(short.reason), 'needs farms')
  assert.equal(typeAvailability(STRUCTURE_TYPES.MARKETPLACE, base({ structures: farms(need) })).ok, true)
  // A second marketplace needs double the farms.
  const withOne = [...farms(need), { type: STRUCTURE_TYPES.MARKETPLACE }]
  assert.equal(typeAvailability(STRUCTURE_TYPES.MARKETPLACE, base({ structures: withOne })).ok, false)
  assert.equal(typeAvailability(STRUCTURE_TYPES.MARKETPLACE,
    base({ structures: [...farms(need * 2), { type: STRUCTURE_TYPES.MARKETPLACE }] })).ok, true)
})

// Order matters for the message: being told "no gold" when the real problem is
// that the structure belongs to another player sends you off to farm for
// nothing.
test('an element lock is reported ahead of a gold shortfall', () => {
  const fireType = Object.entries(SPECIAL_TYPE_ELEMENT).find(([, el]) => el === 'FIRE')?.[0]
  const r = typeAvailability(fireType, base({ gold: 0, players: [{ element: 'FIRE', isBot: false }] }))
  assert.equal(r.reason, 'element')
})

test('every reason code a check can emit has printable text', () => {
  for (const reason of ['gold', 'element', 'farms']) {
    assert.ok(reasonText(reason).length > 0, `${reason} has no text`)
  }
  assert.equal(reasonText(undefined), '')
})
