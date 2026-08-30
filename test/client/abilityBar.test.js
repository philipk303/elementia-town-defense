import { test } from 'node:test'
import assert from 'node:assert/strict'

import { abilitySlots, slotState, slotFill, decayRemaining } from '../../client/src/render/abilityBar.js'
import { BALANCE } from '../../shared/balance.js'

test('slotState reads ready at zero remaining and cooling right after a cast', () => {
  assert.equal(slotState(0, 5000), 'ready')
  assert.equal(slotState(-10, 5000), 'ready', 'a negative remaining is still ready, not cooling')
  assert.equal(slotState(5000, 5000), 'cooling')
  assert.equal(slotState(2000, 5000), 'cooling')
})

test('slotState reads charging only in the final quarter of the cooldown', () => {
  assert.equal(slotState(1251, 5000), 'cooling', 'just outside the charge window')
  assert.equal(slotState(1250, 5000), 'charging', 'exactly at the window edge')
  assert.equal(slotState(100, 5000), 'charging')
})

test('slotFill goes 0 -> 1 across the cooldown and clamps outside it', () => {
  assert.equal(slotFill(5000, 5000), 0, 'just cast: empty')
  assert.equal(slotFill(2500, 5000), 0.5)
  assert.equal(slotFill(0, 5000), 1, 'ready: full')
  assert.equal(slotFill(9999, 5000), 0, 'a remaining beyond the cooldown clamps to empty')
  assert.equal(slotFill(-500, 5000), 1, 'a negative remaining clamps to full')
})

test('slotFill draws full rather than empty when an ability has no cooldown', () => {
  assert.equal(slotFill(0, 0), 1)
  assert.equal(slotFill(0, undefined), 1)
  assert.equal(slotState(0, 0), 'ready')
})

// The bar must not be what takes the scene down if an element is missing.
test('abilitySlots returns an empty list for an unknown element instead of throwing', () => {
  assert.deepEqual(abilitySlots(undefined, {}), [])
  assert.deepEqual(abilitySlots('NOT_AN_ELEMENT', {}), [])
})

test('abilitySlots resolves all three inputs in order against BALANCE for every element', () => {
  for (const element of ['EARTH', 'FIRE', 'WATER', 'WIND']) {
    const slots = abilitySlots(element, {})
    assert.equal(slots.length, 3, `${element} should have basic + Q + E`)
    assert.deepEqual(slots.map(s => s.key), ['LMB', 'Q', 'E'])
    assert.equal(slots[0].cooldownMs, BALANCE.PLAYER.BASIC[element].cooldownMs)
    assert.equal(slots[1].cooldownMs, BALANCE.ABILITY[element].SPECIAL.cooldownMs)
    assert.equal(slots[2].cooldownMs, BALANCE.ABILITY[element].SECOND.cooldownMs)
    assert.equal(slots[1].label, BALANCE.ABILITY[element].SPECIAL.name)
    assert.equal(slots[2].label, BALANCE.ABILITY[element].SECOND.name)
  }
})

test('abilitySlots defaults every missing cooldown field to ready, not NaN', () => {
  for (const slot of abilitySlots('FIRE', {})) {
    assert.equal(slot.remainingMs, 0)
    assert.equal(slot.state, 'ready')
    assert.equal(slot.fill, 1)
  }
})

test('abilitySlots maps each wire field to its own slot, not a shared one', () => {
  const slots = abilitySlots('FIRE', { cdBasic: 700, cdSpecial: 0, cdSecond: 9000 })
  assert.equal(slots[0].state, 'cooling', 'basic just fired')
  assert.equal(slots[1].state, 'ready', 'Q is up')
  assert.equal(slots[2].state, 'cooling', 'E just fired')
  assert.equal(slots[1].fill, 1)
  assert.equal(slots[2].fill, 0)
})

test('decayRemaining counts down by frame time and floors at ready', () => {
  assert.equal(decayRemaining(1000, 16), 984)
  assert.equal(decayRemaining(10, 16), 0, 'never goes negative')
  assert.equal(decayRemaining(0, 16), 0)
})

test('decayRemaining never re-inflates on a missing or negative frame time', () => {
  assert.equal(decayRemaining(1000, 0), 1000)
  assert.equal(decayRemaining(1000, undefined), 1000)
  assert.equal(decayRemaining(1000, -50), 1000, 'a negative dt must not add time back')
})
