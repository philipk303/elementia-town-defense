import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES } from '../../client/src/assets/manifest.js'

const atlasJson = new URL('../../client/public/art/wind_vortex.json', import.meta.url)

test('Wind Vortex registers under the wind_special runtime key, matching structureArtKey(\'WIND_SPECIAL\')', () => {
  assert.deepEqual(ATLASES.find((a) => a.key === 'wind_special'), {
    key: 'wind_special', png: 'art/wind_vortex.png', json: 'art/wind_vortex.json',
  })
})

test('Wind Vortex atlas packages every directional structure state on fixed frames', async () => {
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
