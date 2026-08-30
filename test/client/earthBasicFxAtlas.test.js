import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES } from '../../client/src/assets/manifest.js'

const atlasJson = new URL('../../client/public/art/earth_basic_fx.json', import.meta.url)

test('Earth basic FX registers under earth_basic_fx, same as water_basic_fx/wind_basic_fx', () => {
  assert.deepEqual(ATLASES.find((a) => a.key === 'earth_basic_fx'), {
    key: 'earth_basic_fx', png: 'art/earth_basic_fx.png', json: 'art/earth_basic_fx.json',
  })
})

test('Earth basic FX atlas packages the same flight/impact/dissipation contract as Water/Wind', async () => {
  const atlas = JSON.parse(await readFile(atlasJson, 'utf8'))
  const expected = new Set([
    'flight_00.png', 'flight_01.png', 'flight_02.png', 'flight_03.png',
    'impact_00.png', 'impact_01.png', 'impact_02.png',
    'dissipation_00.png', 'dissipation_01.png', 'dissipation_02.png',
  ])

  assert.deepEqual(new Set(Object.keys(atlas.frames)), expected)
  for (const frame of Object.values(atlas.frames)) {
    assert.equal(frame.frame.w, 64)
    assert.equal(frame.frame.h, 64)
    assert.equal(frame.trimmed, false)
    assert.deepEqual(frame.sourceSize, { w: 64, h: 64 })
  }
})
