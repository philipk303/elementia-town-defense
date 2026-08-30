import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ATLASES } from '../../client/src/assets/manifest.js'
import { aimRotation } from '../../client/src/render/sprites.js'

const atlasJson = new URL('../../client/public/art/fire_saber_extension.json', import.meta.url)

test('Fire saber extension registers under fire_saber_extension', () => {
  assert.deepEqual(ATLASES.find((a) => a.key === 'fire_saber_extension'), {
    key: 'fire_saber_extension', png: 'art/fire_saber_extension.png', json: 'art/fire_saber_extension.json',
  })
})

test('Fire saber extension atlas packages 6 extend + 4 impact frames, authored actor-facing right', async () => {
  const atlas = JSON.parse(await readFile(atlasJson, 'utf8'))
  const expected = new Set([
    'extend_00.png', 'extend_01.png', 'extend_02.png', 'extend_03.png', 'extend_04.png', 'extend_05.png',
    'impact_00.png', 'impact_01.png', 'impact_02.png', 'impact_03.png',
  ])
  assert.deepEqual(new Set(Object.keys(atlas.frames)), expected)
  assert.equal(atlas.meta.orientation, 'actor_facing')
  assert.equal(atlas.meta.authoredDirection, 'right')
  assert.deepEqual(atlas.meta.directions, ['down', 'up', 'left', 'right'])
  for (const frame of Object.values(atlas.frames)) {
    assert.equal(frame.frame.w, 64)
    assert.equal(frame.frame.h, 64)
    assert.equal(frame.trimmed, false)
    assert.deepEqual(frame.sourceSize, { w: 64, h: 64 })
  }
})

// aimRotation quantizes to the same 4-way facing CharacterAnimator uses
// (render/AnimationController.js) and must rotate the authored-right sprite
// to match each of the atlas's 4 declared directions exactly.
test('aimRotation maps all 4 quantized facings to the correct rotation for an actor-facing-right sprite', () => {
  assert.equal(aimRotation(1, 0), 0, 'right: no rotation needed')
  assert.equal(aimRotation(0, 1), Math.PI / 2, 'down: rotate 90° clockwise')
  assert.equal(aimRotation(-1, 0), Math.PI, 'left: rotate 180°')
  assert.equal(aimRotation(0, -1), -Math.PI / 2, 'up: rotate -90°')
})

test('aimRotation quantizes diagonal aim to the dominant axis, matching CharacterAnimator dir logic', () => {
  assert.equal(aimRotation(0.9, 0.4), 0, 'mostly-right diagonal still reads as right')
  assert.equal(aimRotation(0.2, 0.9), Math.PI / 2, 'mostly-down diagonal still reads as down')
  assert.equal(aimRotation(-0.9, -0.3), Math.PI, 'mostly-left diagonal still reads as left')
  assert.equal(aimRotation(-0.2, -0.9), -Math.PI / 2, 'mostly-up diagonal still reads as up')
})
