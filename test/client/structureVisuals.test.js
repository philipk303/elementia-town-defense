import { test } from 'node:test'
import assert from 'node:assert/strict'

import { structureDisplayRect } from '../../client/src/render/structureVisuals.js'

// The footprint's bottom edge, given the returned rect. Sprites keep Phaser's
// centred origin, so this is centre + offsetY + height/2 measured from the
// footprint centre. Every case below asserts the art's ground line lands there.
const groundLine = (fpH, r, baselineY, artH) =>
  r.offsetY - r.height / 2 + (baselineY ?? artH) * (r.height / artH)

test('art with no frame data keeps the plain footprint rectangle', () => {
  assert.deepEqual(
    structureDisplayRect('BARRICADE', 28, 28, undefined, undefined),
    { width: 28, height: 28, offsetY: 0 },
  )
})

test('square art in a square footprint is unchanged', () => {
  const r = structureDisplayRect('MARKETPLACE', 60, 60, 64, 64)
  assert.equal(r.width, 60)
  assert.equal(r.height, 60)
  assert.equal(r.offsetY, 0)
})

test('tall art keeps its aspect ratio instead of being crushed', () => {
  // WATCHTOWER: 48x64 art in a 28x28 footprint. The old code drew it 28x28,
  // squashing it 33%.
  const r = structureDisplayRect('WATCHTOWER', 28, 28, 48, 64)
  assert.equal(r.width, 28)
  assert.ok(Math.abs(r.height - 28 * 64 / 48) < 1e-9) // ~37.3, taller than the tile
  assert.ok(r.height > 28, 'must be taller than the footprint, not crushed into it')
  // Aspect preserved to within floating-point noise.
  assert.ok(Math.abs(r.width / r.height - 48 / 64) < 1e-9)
})

test('overhang grows upward only — the footprint bottom edge stays pinned', () => {
  const fpH = 28
  const r = structureDisplayRect('WATCHTOWER', 28, fpH, 48, 64)
  // No declared baseline, so the frame's own bottom edge is the ground line.
  assert.ok(Math.abs(groundLine(fpH, r, undefined, 64) - fpH / 2) < 1e-9)
  // And it really does extend above the footprint's top edge.
  assert.ok(r.offsetY - r.height / 2 < -fpH / 2)
})

test('Firepit is no longer squashed into its 2x1 footprint', () => {
  const r = structureDisplayRect('FIRE_SPECIAL', 60, 28, 96, 64)
  assert.equal(r.width, 60)
  assert.ok(Math.abs(r.height - 40) < 1e-9)         // 64 * (60/96)
  assert.ok(Math.abs(groundLine(28, r, undefined, 64) - 14) < 1e-9)
})

test('Water Geyser pins its waterline, not its empty frame bottom, to the ground', () => {
  const fpH = 28
  const r = structureDisplayRect('WATER_SPECIAL', 60, fpH, 64, 64)
  assert.equal(r.width, 60)
  assert.ok(Math.abs(r.height - 60) < 1e-9)         // was drawn 28 tall: a 114% skew
  // BASELINE_Y=56: the pool's waterline, not the frame bottom, sits on the
  // footprint's bottom edge, so the reserved plume headroom hangs above.
  assert.ok(Math.abs(groundLine(fpH, r, 56, 64) - fpH / 2) < 1e-9)
  // Sanity: using the frame bottom instead would float the pool above the tile.
  assert.ok(groundLine(fpH, r, undefined, 64) > fpH / 2)
})

test('Wind Vortex uses the same reserved-headroom convention as the Geyser', () => {
  // Same authoring: a 2x1 structure on a 64x64 canvas whose content ends at
  // y=56, with the space above reserved for the animated column. Without a
  // declared baseline the empty frame bottom would be pinned and the vortex
  // would float ~8px above its tile.
  const fpH = 28
  const r = structureDisplayRect('WIND_SPECIAL', 60, fpH, 64, 64)
  assert.ok(Math.abs(r.height - 60) < 1e-9)
  assert.ok(Math.abs(groundLine(fpH, r, 56, 64) - fpH / 2) < 1e-9)
})

test('the geyser no longer changes size between idle and active', () => {
  // The old code returned height 64 for `active` only, which is why idle
  // stayed crushed. State is not an input any more.
  const a = structureDisplayRect('WATER_SPECIAL', 60, 28, 64, 64)
  const b = structureDisplayRect('WATER_SPECIAL', 60, 28, 64, 64)
  assert.deepEqual(a, b)
})
