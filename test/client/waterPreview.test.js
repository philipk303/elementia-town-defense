import test from 'node:test'
import assert from 'node:assert/strict'

import * as waterPreview from '../../client/src/assets/waterPreview.js'

test('Water hero declarations cover the exact 80-frame production matrix', () => {
  const animations = waterPreview.WATER_HERO_ANIMATIONS ?? []
  const frames = animations.flatMap(animation => animation.frames)
  const counts = Object.fromEntries(animations.map(animation => [animation.state, animation.frames.length]))

  assert.equal(animations.length, 24)
  assert.equal(frames.length, 80)
  assert.equal(new Set(frames).size, 80)
  assert.deepEqual([...new Set(animations.map(animation => animation.direction))], ['down', 'up', 'left', 'right'])
  assert.deepEqual([...new Set(animations.map(animation => animation.state))], ['idle', 'run', 'attack', 'cast', 'hurt', 'death'])
  assert.deepEqual(counts, { idle: 2, run: 4, attack: 4, cast: 4, hurt: 2, death: 4 })
  assert.equal(frames[0], 'idle_down_00.png')
  assert.equal(frames.at(-1), 'death_right_03.png')
})

test('Water hero playback loops only idle and run', () => {
  const repeatByState = Object.fromEntries(
    waterPreview.WATER_HERO_ANIMATIONS.map(animation => [animation.state, animation.repeat]),
  )

  assert.deepEqual(repeatByState, { idle: -1, run: -1, attack: 0, cast: 0, hurt: 0, death: 0 })
})

test('Water Palm FX declarations contain release, impact, and dissipation', () => {
  const animations = waterPreview.WATER_FX_ANIMATIONS ?? []
  const frames = animations.flatMap(animation => animation.frames)

  assert.deepEqual(animations.map(animation => animation.state), ['release', 'impact', 'dissipation'])
  assert.deepEqual(animations.map(animation => animation.frames.length), [4, 3, 3])
  assert.equal(new Set(frames).size, 10)
  assert.deepEqual(animations.map(animation => animation.repeat), [0, 0, 0])
  assert.equal(frames[0], 'flight_00.png')
  assert.equal(frames.at(-1), 'dissipation_02.png')
})

test('Water production atlases use distinct paths and keys', () => {
  assert.equal(waterPreview.WATER_HERO_ATLAS, 'chibi_water')
  assert.deepEqual(waterPreview.WATER_HERO_PATHS, {
    png: 'art/chibi_water.png',
    json: 'art/chibi_water.json',
  })
  assert.equal(waterPreview.WATER_FX_ATLAS, 'water_basic_fx')
  assert.deepEqual(waterPreview.WATER_FX_PATHS, {
    png: 'art/water_basic_fx.png',
    json: 'art/water_basic_fx.json',
  })
})

test('Water matrix and basic demo preserve the preview contracts', () => {
  const layout = waterPreview.buildWaterHeroMatrix()
  const sequence = waterPreview.buildWaterBasicDemo('right')

  assert.equal(layout.length, 24)
  assert.equal(new Set(layout.map(item => item.key)).size, 24)
  assert.equal(new Set(layout.map(item => item.x)).size, 6)
  assert.equal(new Set(layout.map(item => item.baselineY)).size, 4)
  assert.deepEqual(sequence.map(step => step.phase), ['hero_attack', 'release', 'impact', 'dissipation'])
  assert.equal(sequence[0].key, 'chibi_water_attack_right')
  assert.deepEqual(sequence.slice(1).map(step => step.key), [
    'water_basic_fx_release',
    'water_basic_fx_impact',
    'water_basic_fx_dissipation',
  ])
})
