import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES } from '../../client/src/assets/manifest.js'

const atlasJson = new URL('../../client/public/art/water_special_fx.json', import.meta.url)
const gameScene = new URL('../../client/src/scenes/GameScene.js', import.meta.url)
const frames = [
  'flight_00.png', 'flight_01.png', 'flight_02.png', 'flight_03.png',
  'impact_00.png', 'impact_01.png', 'impact_02.png',
  'dissipation_00.png', 'dissipation_01.png', 'dissipation_02.png',
]

test('Whirlpool registers its dedicated animated atlas', () => {
  assert.deepEqual(ATLASES.find((atlas) => atlas.key === 'water_special_fx'), {
    key: 'water_special_fx', png: 'art/water_special_fx.png', json: 'art/water_special_fx.json',
  })
})

test('Whirlpool atlas preserves the ten centered FX frames', async () => {
  const atlas = JSON.parse(await readFile(atlasJson, 'utf8'))
  assert.deepEqual(Object.keys(atlas.frames), frames)
  for (const frame of Object.values(atlas.frames)) {
    assert.equal(frame.frame.w, 64)
    assert.equal(frame.frame.h, 64)
    assert.equal(frame.trimmed, false)
    assert.deepEqual(frame.sourceSize, { w: 64, h: 64 })
  }
})

test('Water special casts spawn the centered Whirlpool effect', async () => {
  const source = await readFile(gameScene, 'utf8')
  assert.match(source, /a\.kind === 'SPECIAL_CAST'[\s\S]*?element === 'WATER'[\s\S]*?_spawnAttackFx\('water_special_fx', a\.x, a\.y\)/)
})
