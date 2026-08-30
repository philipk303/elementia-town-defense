import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const atlasJson = new URL('../../client/public/art/water_special.json', import.meta.url)

test('Water Geyser atlas packages every directional structure state on fixed frames', async () => {
  const atlas = JSON.parse(await readFile(atlasJson, 'utf8'))
  const states = ['idle', 'telegraph', 'active', 'recovery', 'charged']
  const directions = ['N', 'E', 'S', 'W']
  const expected = new Set(
    states.flatMap((state) => directions.map((direction) => `${state}_${direction}_0.png`)),
  )

  assert.deepEqual(new Set(Object.keys(atlas.frames)), expected)
  for (const frame of Object.values(atlas.frames)) {
    assert.equal(frame.frame.w, 64)
    assert.equal(frame.frame.h, 64)
    assert.equal(frame.trimmed, false)
    assert.deepEqual(frame.sourceSize, { w: 64, h: 64 })
  }
})
