import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPEED } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import {
  makeStatus, resetStatus,
  scaledDurationMs, effectiveSlowFactor,
  applyBurn, applyWet, applySlow, applyRoot, applyFreeze,
  speedMultiplier, isRooted, tickStatus,
} from '../../server/game/status.js'

// --- two-axis scaling of DURATION and STRENGTH by SPEED tier -----------------

test('slow/root DURATION scales down as speed rises; super-fast is zero', () => {
  assert.equal(scaledDurationMs(2000, SPEED.SLOW), 2000)
  assert.equal(scaledDurationMs(2000, SPEED.MEDIUM), 1500)
  assert.equal(scaledDurationMs(2000, SPEED.FAST), 1000)
  assert.equal(scaledDurationMs(2000, SPEED.SUPER_FAST), 0)
})

test('slow STRENGTH is resisted by speed; super-fast keeps full speed', () => {
  // factor 0.5 = target half-speed at full effect.
  assert.equal(effectiveSlowFactor(0.5, SPEED.SLOW), 0.5)
  assert.equal(effectiveSlowFactor(0.5, SPEED.FAST), 0.75)
  assert.equal(effectiveSlowFactor(0.5, SPEED.SUPER_FAST), 1.0)
})

// --- root / freeze (spec: super-fast immune; independent of displacement) ----

test('root stops a slow enemy but a super-fast enemy is immune', () => {
  const slow = makeStatus()
  applyRoot(slow, 1500, SPEED.SLOW)
  assert.ok(slow.rootMs > 0)
  assert.equal(isRooted(slow), true)
  assert.equal(speedMultiplier(slow), 0, 'rooted enemy cannot move')

  const fast = makeStatus()
  applyRoot(fast, 1500, SPEED.SUPER_FAST)
  assert.equal(fast.rootMs, 0, 'super-fast is root-immune')
  assert.equal(isRooted(fast), false)
  assert.equal(speedMultiplier(fast), 1)
})

test('freeze halts movement and is speed-immune for super-fast', () => {
  const s = makeStatus()
  applyFreeze(s, 2000, SPEED.MEDIUM)
  assert.ok(s.freezeMs > 0)
  assert.equal(speedMultiplier(s), 0)

  const sf = makeStatus()
  applyFreeze(sf, 2000, SPEED.SUPER_FAST)
  assert.equal(sf.freezeMs, 0)
  assert.equal(speedMultiplier(sf), 1)
})

// --- slow (spec: multiplies movement, resisted by speed) ---------------------

test('slow multiplies speed for a slow enemy and is ignored by super-fast', () => {
  const s = makeStatus()
  applySlow(s, 0.5, 2000, SPEED.SLOW)
  assert.equal(speedMultiplier(s), 0.5)

  const sf = makeStatus()
  applySlow(sf, 0.5, 2000, SPEED.SUPER_FAST)
  assert.equal(sf.slowMs, 0)
  assert.equal(speedMultiplier(sf), 1, 'super-fast ignores slow')
})

test('the strongest concurrent slow wins and duration refreshes', () => {
  const s = makeStatus()
  applySlow(s, 0.7, 1000, SPEED.SLOW)   // mild
  applySlow(s, 0.4, 500, SPEED.SLOW)    // stronger, shorter
  assert.equal(speedMultiplier(s), 0.4, 'keeps the stronger slow')
  assert.equal(s.slowMs, 1000, 'keeps the longer remaining duration')
})

// --- burn (pure DoT — no tier scaling) ---------------------------------------

test('burn deals damage-over-time each tick until it expires; strongest wins', () => {
  const s = makeStatus()
  applyBurn(s, 6, 1000)
  applyBurn(s, 10, 500)                  // stronger dps
  assert.equal(s.burnDps, 10)
  // one 100ms tick → 10 dps * 0.1s = 1 damage.
  assert.equal(tickStatus(s, 100), 1)
  // burn does not scale by speed and is unaffected by root immunity.
})

test('burn stops dealing damage after its duration elapses', () => {
  const s = makeStatus()
  applyBurn(s, 6, 200)
  let total = 0
  for (let i = 0; i < 5; i++) total += tickStatus(s, 100) // 500ms of ticks
  // Only the first 200ms burns: 6 dps * 0.2s = 1.2 damage.
  assert.ok(Math.abs(total - 1.2) < 1e-9, `burned ${total}, expected 1.2`)
  assert.equal(s.burnMs, 0)
})

// --- wet (tag + mild slow) ---------------------------------------------------

test('wet applies a mild slow while active and clears when it expires', () => {
  const s = makeStatus()
  applyWet(s, 1000)
  assert.equal(speedMultiplier(s), BALANCE.STATUS.WET.slowFactor)
  tickStatus(s, 1000)
  assert.equal(s.wetMs, 0)
  assert.equal(speedMultiplier(s), 1)
})

// --- decay / reset -----------------------------------------------------------

test('tickStatus decays all timers and restores full speed once slow expires', () => {
  const s = makeStatus()
  applySlow(s, 0.5, 300, SPEED.SLOW)
  tickStatus(s, 100)
  assert.equal(speedMultiplier(s), 0.5)
  tickStatus(s, 300)                     // over-shoots the remaining 200ms
  assert.equal(s.slowMs, 0)
  assert.equal(speedMultiplier(s), 1, 'speed restored after slow lapses')
})

test('resetStatus clears everything back to no-effect', () => {
  const s = makeStatus()
  applyBurn(s, 6, 1000); applyRoot(s, 1000, SPEED.SLOW); applySlow(s, 0.3, 1000, SPEED.SLOW)
  resetStatus(s)
  assert.equal(speedMultiplier(s), 1)
  assert.equal(s.burnMs, 0)
  assert.equal(s.rootMs, 0)
  assert.equal(isRooted(s), false)
})

test('root and slow together: root dominates movement (0), independent of slow', () => {
  const s = makeStatus()
  applySlow(s, 0.5, 1000, SPEED.SLOW)
  applyRoot(s, 1000, SPEED.SLOW)
  assert.equal(speedMultiplier(s), 0, 'rooted overrides slow')
})
