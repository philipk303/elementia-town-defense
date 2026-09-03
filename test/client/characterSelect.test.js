// Character-select screen's pure logic (client/src/ui/characterSelect.js,
// client/src/ui/characterStats.js). The DOM half is verified live, same
// convention as buildPalette.test.js -- what's tested here is what decides
// whether a card is pickable and what stats it shows, since those decisions
// must mirror the server's own rules and shared/balance.js's real numbers.

import test from 'node:test'
import assert from 'node:assert/strict'
import { elementCardState } from '../../client/src/ui/characterSelect.js'
import { characterSummary, allCharacterSummaries } from '../../client/src/ui/characterStats.js'
import { ELEMENTS } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

test('a free element is pickable and unowned', () => {
  const r = elementCardState('WIND', [{ id: 'p1', element: 'EARTH', isBot: false }], 'p1')
  assert.equal(r.blockedByHuman, false)
  assert.equal(r.isMine, false)
  assert.equal(r.ownerLabel, '')
})

test('your own element reads as mine, not blocked', () => {
  const players = [{ id: 'p1', element: 'FIRE', isBot: false }]
  const r = elementCardState('FIRE', players, 'p1')
  assert.equal(r.isMine, true)
  assert.equal(r.blockedByHuman, false)
  assert.equal(r.ownerLabel, 'You')
})

test("another human's element is blocked and shows their name", () => {
  const players = [{ id: 'p2', element: 'WATER', isBot: false, displayName: 'Bob' }]
  const r = elementCardState('WATER', players, 'p1')
  assert.equal(r.blockedByHuman, true)
  assert.equal(r.ownerLabel, 'Bob')
})

test('a bot-held element is never blocked (bots only backfill at match start)', () => {
  const players = [{ id: 'bot_1', element: 'EARTH', isBot: true }]
  const r = elementCardState('EARTH', players, 'p1')
  assert.equal(r.blockedByHuman, false)
  assert.equal(r.isMine, false)
  assert.equal(r.ownerLabel, '')
})

test('every element has a real stat summary sourced from BALANCE', () => {
  for (const element of ELEMENTS) {
    const s = characterSummary(element)
    assert.equal(s.hp, BALANCE.PLAYER.CLASS[element].maxHp)
    assert.equal(s.basicDamage, BALANCE.PLAYER.BASIC[element].damage)
    assert.ok(s.specialName, `${element} has no special ability name`)
  }
  assert.equal(allCharacterSummaries().length, ELEMENTS.length)
})
