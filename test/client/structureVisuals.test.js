import { test } from 'node:test'
import assert from 'node:assert/strict'

import { structureDisplaySize } from '../../client/src/render/structureVisuals.js'

test('Water Geyser active art keeps its footprint width while reserving plume overhang', () => {
  assert.deepEqual(
    structureDisplaySize('WATER_SPECIAL', 60, 28, 'idle'),
    { width: 60, height: 28 },
  )
  assert.deepEqual(
    structureDisplaySize('WATER_SPECIAL', 60, 28, 'active'),
    { width: 60, height: 64 },
  )
})
