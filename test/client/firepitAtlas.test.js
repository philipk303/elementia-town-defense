import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES } from '../../client/src/assets/manifest.js'

const atlasJson = new URL('../../client/public/art/fire_special.json', import.meta.url)

test('Firepit registers under the fire_special runtime key', () => {
  assert.deepEqual(ATLASES.find((a) => a.key === 'fire_special'), {
    key: 'fire_special', png: 'art/fire_special.png', json: 'art/fire_special.json',
  })
})

test('Firepit atlas packages idle and active on untrimmed 96x64 cells', async () => {
  const atlas = JSON.parse(await readFile(atlasJson, 'utf8'))
  const expected = new Set([
    'idle_00.png', 'idle_01.png', 'idle_02.png', 'idle_03.png',
    'active_00.png', 'active_01.png', 'active_02.png', 'active_03.png',
  ])

  assert.deepEqual(new Set(Object.keys(atlas.frames)), expected)
  for (const frame of Object.values(atlas.frames)) {
    assert.equal(frame.frame.w, 96)
    assert.equal(frame.frame.h, 64)
    assert.equal(frame.trimmed, false)
    assert.deepEqual(frame.sourceSize, { w: 96, h: 64 })
  }
})
