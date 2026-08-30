// Phase 8A instrument test. Before the spawn jitter, state.rng had exactly one
// call site (waves.js resolveGateOrder), so two seeds differed only in which
// physical side gate was SIDE_A. This test deliberately picks two seeds with
// the SAME gate order — under the old one-bit entropy their fights were
// bit-identical, so this test could not have passed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32 } from '../../shared/rng.js'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { resolveGateOrder } from '../../server/game/waves.js'

// Two seeds that land on the same physical gate assignment.
function sameGateOrderSeeds() {
  const first = resolveGateOrder(mulberry32(1)).SIDE_A
  for (let s = 2; s < 200; s++) {
    if (resolveGateOrder(mulberry32(s)).SIDE_A === first) return [1, s]
  }
  throw new Error('no same-gate-order seed pair below 200 — investigate mulberry32')
}

const IDLE = { keys: { w: false, a: false, s: false, d: false }, aimX: 0, aimY: -1,
               actions: { basic: false, special: false, second: false } }

function room() {
  return {
    players: [{ id: 'h0', element: 'EARTH', displayName: 'h', isBot: false }],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
}

// Run wave 1's fight for `ticks` steps and fingerprint the horde's positions.
function fingerprint(seed, ticks) {
  const state = createGameState(room(), seed)
  startBuildPhase(state, 1)
  const buf = new Map([['h0', IDLE]])
  let now = 0
  for (let t = 0; t < ticks; t++) {
    now += 50
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    tickGame(state, buf, now, 50)
  }
  const st = state.enemyStore
  let h = ''
  for (let i = 0; i < st.count; i++) h += `${st.x[i].toFixed(3)},${st.y[i].toFixed(3)};`
  return { h, count: st.count }
}

test('two seeds with the SAME gate order now produce different fights', () => {
  const [a, b] = sameGateOrderSeeds()
  assert.equal(resolveGateOrder(mulberry32(a)).SIDE_A, resolveGateOrder(mulberry32(b)).SIDE_A,
    'precondition: the two seeds share a gate order')
  const fa = fingerprint(a, 120)
  const fb = fingerprint(b, 120)
  assert.ok(fa.count > 0 && fb.count > 0, 'both runs actually spawned enemies')
  assert.notEqual(fa.h, fb.h, 'the horde state diverges — seed entropy reaches the sim')
})

test('the same seed still replays identically', () => {
  const [a] = sameGateOrderSeeds()
  assert.equal(fingerprint(a, 120).h, fingerprint(a, 120).h)
})
