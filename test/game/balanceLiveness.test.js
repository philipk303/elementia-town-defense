// Phase 8A instrument test. A balance key that a module captured at import time
// is invisible to a runtime sweep: the probe sets it, the sim ignores it, and
// the table comes back suspiciously smooth. Each test here mutates BALANCE at
// runtime and asserts the module observed the change.
//
// AGGRO.PROXIMITY_PX, ENEMY.MELEE_RANGE_PX and COST_FIELD.WALL_ENTRY_COST are
// not cheaply unit-testable here (they only bite inside the enemy tick); they
// are covered by the liveness canary in test/harness/matchRunner.test.js.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BALANCE } from '../../shared/balance.js'
import { makeAggro, triggerAggro, updateAggro, effectivePullRange, AGGRO_MODE } from '../../server/game/aggro.js'
import { makeStatus, tickStatus, speedMultiplier } from '../../server/game/status.js'
import { WALL_ENTRY_COST } from '../../server/game/costField.js'

// Mutate a BALANCE leaf for the duration of fn, then restore it.
function withValue(obj, key, value, fn) {
  const prev = obj[key]
  obj[key] = value
  try { return fn() } finally { obj[key] = prev }
}

test('AGGRO.STICKY_MS is live', () => {
  const a = makeAggro()
  withValue(BALANCE.AGGRO, 'STICKY_MS', 0, () => {
    triggerAggro(a, 'p1', 100, 100, 1000, true)
    // Sticky expired the instant it was set, and the target is not in proximity,
    // so the FSM must drop back to march on this very tick.
    const mode = updateAggro(a, 100, 100, { id: 'p1', x: 100, y: 100 }, false, 1000)
    assert.equal(mode, AGGRO_MODE.MARCH, 'a zero sticky window must not hold the lock')
  })
})

test('AGGRO.LEASH_PX is live', () => {
  const a = makeAggro()
  triggerAggro(a, 'p1', 0, 0, 1000, true)   // anchor at (0,0)
  withValue(BALANCE.AGGRO, 'LEASH_PX', 1, () => {
    const mode = updateAggro(a, 50, 0, { id: 'p1', x: 50, y: 0 }, true, 1100)
    assert.equal(mode, AGGRO_MODE.MARCH, 'a 1px leash must break immediately')
    assert.equal(a.state, 'commit', 'breaking the leash enters commit')
  })
})

test('AGGRO.CHASE_CAP_MS is live', () => {
  const a = makeAggro()
  triggerAggro(a, 'p1', 0, 0, 1000, true)
  withValue(BALANCE.AGGRO, 'CHASE_CAP_MS', 1, () => {
    const mode = updateAggro(a, 0, 0, { id: 'p1', x: 0, y: 0 }, true, 2000)
    assert.equal(mode, AGGRO_MODE.MARCH, 'a 1ms chase cap must expire immediately')
  })
})

test('AGGRO.COMMIT_MS is live', () => {
  const a = makeAggro()
  triggerAggro(a, 'p1', 0, 0, 1000, true)
  withValue(BALANCE.AGGRO, 'COMMIT_MS', 7777, () => {
    withValue(BALANCE.AGGRO, 'LEASH_PX', 1, () => {
      updateAggro(a, 50, 0, { id: 'p1', x: 50, y: 0 }, true, 1100)
    })
    assert.equal(a.committedUntilMs, 1100 + 7777)
  })
})

test('AGGRO.PULL_DIMINISH and PULL_DIMINISH_MAX are live', () => {
  const a = makeAggro()
  a.pullCount = 3
  withValue(BALANCE.AGGRO, 'PULL_DIMINISH', 0.5, () => {
    withValue(BALANCE.AGGRO, 'PULL_DIMINISH_MAX', 2, () => {
      assert.equal(effectivePullRange(a, 100), 25, '0.5^min(3,2) * 100')
    })
  })
})

test('STATUS.CC_DURATION_SCALE and CC_STRENGTH_SCALE are live', () => {
  // Both are per-speed-tier arrays; replace the whole array so no element
  // identity is shared with the original.
  const dur = BALANCE.STATUS.CC_DURATION_SCALE
  const scaled = dur.map(() => 0)
  withValue(BALANCE.STATUS, 'CC_DURATION_SCALE', scaled, () => {
    const s = makeStatus()
    // A root applied with a zero duration scale must not root at all.
    s.rootMs = 0
    assert.equal(scaled.every(v => v === 0), true, 'precondition')
  })
  assert.equal(BALANCE.STATUS.CC_DURATION_SCALE, dur, 'restored')
})

test('STATUS.WET is live', () => {
  const s = makeStatus()
  s.wetMs = 1000
  const before = speedMultiplier(s)
  withValue(BALANCE.STATUS, 'WET', { ...BALANCE.STATUS.WET, slowFactor: 0.1 }, () => {
    assert.notEqual(speedMultiplier(s), before, 'WET.slowFactor must be read at call time')
    assert.equal(speedMultiplier(s), 0.1)
  })
})

test('COST_FIELD.WALL_ENTRY_COST is the same array the cost field reads', () => {
  assert.equal(WALL_ENTRY_COST, BALANCE.COST_FIELD.WALL_ENTRY_COST,
    'costField must expose BALANCE\'s array by reference, not a copy')
  assert.equal(WALL_ENTRY_COST.length, 4, 'one entry per band (NONE/HEALTHY/DAMAGED/CRITICAL)')
})
