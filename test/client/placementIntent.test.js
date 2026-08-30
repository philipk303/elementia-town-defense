// Tap-to-ghost build confirmation (client/src/input/placementIntent.js).
//
// The hazard this module exists to remove is spending gold on a tap the
// player did not aim — so the tests that matter are the ones proving a
// single tap can never commit, and that a stale armed tile can never commit
// the WRONG structure after the selection changed.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PlacementIntent, selectionSignature, GHOST, COMMIT,
} from '../../client/src/input/placementIntent.js'

const SIG = selectionSignature({ type: 'FARM', orient: 'H', dir: undefined })
const OTHER = selectionSignature({ type: 'WATCHTOWER', orient: 'H', dir: undefined })

test('a first tap arms rather than commits', () => {
  const pi = new PlacementIntent()
  assert.equal(pi.tap(4, 7, SIG), GHOST)
  assert.deepEqual(pi.pending, { gx: 4, gy: 7 })
  assert.ok(pi.isArmedAt(4, 7))
})

test('a second tap on the same tile commits and disarms', () => {
  const pi = new PlacementIntent()
  pi.tap(4, 7, SIG)
  assert.equal(pi.tap(4, 7, SIG), COMMIT)
  assert.equal(pi.pending, null)
})

test('a third tap after a commit arms again rather than double-building', () => {
  const pi = new PlacementIntent()
  pi.tap(4, 7, SIG)
  pi.tap(4, 7, SIG)
  assert.equal(pi.tap(4, 7, SIG), GHOST, 'commit must not leave the tile armed')
})

test('a tap on a different tile moves the ghost and does not commit', () => {
  const pi = new PlacementIntent()
  pi.tap(4, 7, SIG)
  assert.equal(pi.tap(5, 7, SIG), GHOST)
  assert.deepEqual(pi.pending, { gx: 5, gy: 7 })
  assert.equal(pi.isArmedAt(4, 7), false)
  assert.equal(pi.tap(5, 7, SIG), COMMIT, 'the moved tile is the one that confirms')
})

test('reset clears the armed tile so the next tap cannot commit', () => {
  const pi = new PlacementIntent()
  pi.tap(4, 7, SIG)
  pi.reset()
  assert.equal(pi.pending, null)
  assert.equal(pi.tap(4, 7, SIG), GHOST)
})

// The failure the handoff named explicitly: a pending tile surviving a
// structure-type change would silently commit the WRONG structure.
test('changing the selection re-arms instead of committing the old choice', () => {
  const pi = new PlacementIntent()
  pi.tap(4, 7, SIG)
  assert.equal(pi.tap(4, 7, OTHER), GHOST)
  assert.equal(pi.tap(4, 7, OTHER), COMMIT)
})

test('rotation and direction are part of the signature', () => {
  const pi = new PlacementIntent()
  pi.tap(4, 7, selectionSignature({ type: 'FARM', orient: 'H' }))
  assert.equal(pi.tap(4, 7, selectionSignature({ type: 'FARM', orient: 'V' })), GHOST)

  const pi2 = new PlacementIntent()
  pi2.tap(4, 7, selectionSignature({ type: 'SNARE_POST', orient: 'H', dir: 'N' }))
  assert.equal(pi2.tap(4, 7, selectionSignature({ type: 'SNARE_POST', orient: 'H', dir: 'E' })), GHOST)
})

test('signature is stable for equal selections and distinct for different ones', () => {
  assert.equal(selectionSignature({ type: 'FARM', orient: 'H' }),
    selectionSignature({ type: 'FARM', orient: 'H', dir: undefined }))
  assert.notEqual(selectionSignature({ type: 'FARM', orient: 'H' }),
    selectionSignature({ type: 'FARMHOUSE', orient: 'H' }))
})

test('an unarmed reset is harmless', () => {
  const pi = new PlacementIntent()
  pi.reset()
  assert.equal(pi.pending, null)
})

test('pending is a copy, so a caller cannot mutate the armed tile', () => {
  const pi = new PlacementIntent()
  pi.tap(4, 7, SIG)
  const p = pi.pending
  p.gx = 99
  assert.ok(pi.isArmedAt(4, 7))
})
