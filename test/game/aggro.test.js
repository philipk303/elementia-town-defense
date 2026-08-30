import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BALANCE } from '../../shared/balance.js'
import {
  makeAggro, triggerAggro, updateAggro, effectivePullRange, AGGRO_MODE,
} from '../../server/game/aggro.js'

const { STICKY_MS, LEASH_PX, CHASE_CAP_MS, COMMIT_MS, PULL_DIMINISH } = BALANCE.AGGRO

// A target helper: the currently-locked player's live position.
const T = (id, x, y) => ({ id, x, y })

test('a fresh enemy is marching with no target', () => {
  const a = makeAggro()
  assert.equal(a.state, 'march')
  assert.equal(a.targetId, -1)
})

test('proximity trigger starts a chase, sets sticky window and leash anchor', () => {
  const a = makeAggro()
  const ok = triggerAggro(a, 7, 100, 100, 1000, false)
  assert.equal(ok, true)
  assert.equal(a.state, 'chase')
  assert.equal(a.targetId, 7)
  assert.equal(a.stickyUntilMs, 1000 + STICKY_MS)
  assert.deepEqual([a.anchorX, a.anchorY], [100, 100])
})

test('sticky threat: a different player in proximity cannot steal aggro mid-window', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  const stole = triggerAggro(a, 9, 100, 100, 1500, false) // still within sticky
  assert.equal(stole, false)
  assert.equal(a.targetId, 7, 'stays locked on the original target')
})

test('taking damage retargets even inside the sticky window', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  const ok = triggerAggro(a, 9, 100, 100, 1500, true) // byDamage
  assert.equal(ok, true)
  assert.equal(a.targetId, 9, 'a hit pulls attention to the attacker')
})

test('continued hits refresh the sticky window', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  triggerAggro(a, 7, 100, 100, 2000, true)
  assert.equal(a.stickyUntilMs, 2000 + STICKY_MS)
})

test('chasing steers at the target while inside leash and proximity', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  const mode = updateAggro(a, 110, 100, T(7, 140, 100), true, 1100)
  assert.equal(mode, AGGRO_MODE.CHASE)
})

test('leash break reverts to marching AND commits (anti-kite), bumping pull count', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  // dragged well past the leash from the anchor at (100,100).
  const mode = updateAggro(a, 100 + LEASH_PX + 50, 100, T(7, 999, 100), true, 1100)
  assert.equal(mode, AGGRO_MODE.MARCH)
  assert.equal(a.state, 'commit')
  assert.equal(a.pullCount, 1)
  assert.equal(a.committedUntilMs, 1100 + COMMIT_MS)
})

test('a committed enemy ignores new aggro until the commit lapses', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  updateAggro(a, 100 + LEASH_PX + 50, 100, T(7, 999, 100), true, 1100) // → commit until 1100+COMMIT
  const ok = triggerAggro(a, 9, 100, 100, 1100 + COMMIT_MS - 1, true)  // even a hit is ignored
  assert.equal(ok, false)
  assert.equal(a.state, 'commit')
})

test('after the commit lapses the enemy can aggro again', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  updateAggro(a, 100 + LEASH_PX + 50, 100, T(7, 999, 100), true, 1100)
  const ok = triggerAggro(a, 9, 100, 100, 1100 + COMMIT_MS + 1, false)
  assert.equal(ok, true)
  assert.equal(a.targetId, 9)
})

test('chasing longer than the time cap forces a commit (anti-kite)', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  const mode = updateAggro(a, 105, 100, T(7, 130, 100), true, 1000 + CHASE_CAP_MS + 1)
  assert.equal(mode, AGGRO_MODE.MARCH)
  assert.equal(a.state, 'commit')
})

test('once sticky lapses and the target leaves proximity, it releases to marching', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  const mode = updateAggro(a, 105, 100, T(7, 400, 100), false, 1000 + STICKY_MS + 1)
  assert.equal(mode, AGGRO_MODE.MARCH)
  assert.equal(a.state, 'march')
  assert.equal(a.targetId, -1)
})

test('after sticky lapses but the target is still close, the chase continues', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  const mode = updateAggro(a, 105, 100, T(7, 120, 100), true, 1000 + STICKY_MS + 1)
  assert.equal(mode, AGGRO_MODE.CHASE)
})

test('a vanished target (disconnect) drops the enemy back to marching', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)
  const mode = updateAggro(a, 105, 100, null, false, 1100)
  assert.equal(mode, AGGRO_MODE.MARCH)
  assert.equal(a.state, 'march')
})

test('a null targetId (structure-owned damage) is a no-op, not a "chase nobody"', () => {
  const a = makeAggro()
  triggerAggro(a, 7, 100, 100, 1000, false)               // real chase locked on player 7
  const ok = triggerAggro(a, null, 100, 100, 1500, true)  // e.g. Firestorm's volley, byDamage
  assert.equal(ok, false)
  assert.equal(a.state, 'chase')
  assert.equal(a.targetId, 7, 'a team-owned structure hit cannot steal or clear a real chase')
})

test('pull range diminishes geometrically with repeated yanks', () => {
  const a = makeAggro()
  assert.equal(effectivePullRange(a, 200), 200)
  a.pullCount = 1
  assert.ok(Math.abs(effectivePullRange(a, 200) - 200 * PULL_DIMINISH) < 1e-9)
  a.pullCount = 2
  assert.ok(Math.abs(effectivePullRange(a, 200) - 200 * PULL_DIMINISH ** 2) < 1e-9)
})

test('pull-range diminishing is capped so it can never collapse to zero (CP2 M2)', () => {
  const a = makeAggro()
  a.pullCount = 999                       // an enemy yanked all game
  const floored = effectivePullRange(a, 200)
  assert.ok(floored > 0, 'pull range floors above zero — Phase-4 pulls never become useless')
  assert.ok(
    Math.abs(floored - 200 * PULL_DIMINISH ** BALANCE.AGGRO.PULL_DIMINISH_MAX) < 1e-9,
    'diminishing saturates at PULL_DIMINISH_MAX stacks',
  )
})

test('commit window is at least as long as the chase cap (CP2 H3/M3 anti-kite)', () => {
  // Otherwise a parked player perpetually brakes the horde: chase cap forces a
  // commit, but a shorter commit re-aggros before the enemy makes hall progress.
  assert.ok(BALANCE.AGGRO.COMMIT_MS >= BALANCE.AGGRO.CHASE_CAP_MS)
})
