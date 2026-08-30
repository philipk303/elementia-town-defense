import test from 'node:test'
import assert from 'node:assert/strict'

import * as windPreview from '../../client/src/assets/windPreview.js'

test('Wind preview declarations cover the generated down-facing calibration slice', () => {
  const frames = windPreview.WIND_PREVIEW_ANIMATIONS.flatMap(animation => animation.frames)

  assert.deepEqual(frames, [
    'idle_down_00.png', 'idle_down_01.png',
    'run_down_00.png', 'run_down_01.png', 'run_down_02.png', 'run_down_03.png',
    'attack_down_00.png', 'attack_down_01.png', 'attack_down_02.png', 'attack_down_03.png',
    'cast_down_00.png', 'cast_down_01.png', 'cast_down_02.png', 'cast_down_03.png',
  ])
  assert.equal(windPreview.WIND_PREVIEW_ANIMATIONS[0].repeat, -1)
  assert.equal(windPreview.WIND_PREVIEW_ANIMATIONS[2].repeat, 0)
})

test('Wind hero declarations cover 80 unique frames across every state and direction', () => {
  const animations = windPreview.WIND_HERO_ANIMATIONS ?? []
  const frames = animations.flatMap(animation => animation.frames)
  const counts = Object.fromEntries(animations.map(animation => [animation.state, animation.frames.length]))

  assert.equal(animations.length, 24)
  assert.equal(frames.length, 80)
  assert.equal(new Set(frames).size, 80)
  assert.deepEqual([...new Set(animations.map(animation => animation.direction))], ['down', 'up', 'left', 'right'])
  assert.deepEqual([...new Set(animations.map(animation => animation.state))], ['idle', 'run', 'attack', 'cast', 'hurt', 'death'])
  assert.deepEqual(counts, { idle: 2, run: 4, attack: 4, cast: 4, hurt: 2, death: 4 })
  assert.ok(frames.every(frame => /^(idle|run|attack|cast|hurt|death)_(down|up|left|right)_\d{2}\.png$/.test(frame)))
  assert.equal(frames[0], 'idle_down_00.png')
  assert.equal(frames.at(-1), 'death_right_03.png')
})

test('Wind hero playback loops only idle and run', () => {
  const animations = windPreview.WIND_HERO_ANIMATIONS ?? []
  const repeatByState = Object.fromEntries(animations.map(animation => [animation.state, animation.repeat]))

  assert.deepEqual(repeatByState, { idle: -1, run: -1, attack: 0, cast: 0, hurt: 0, death: 0 })
})

test('Wind FX declarations share ten unique frames and loop only flight', () => {
  const animations = windPreview.WIND_FX_ANIMATIONS ?? []
  const frames = animations.flatMap(animation => animation.frames)

  assert.equal(animations.length, 3)
  assert.deepEqual(animations.map(animation => animation.frames.length), [4, 3, 3])
  assert.equal(new Set(frames).size, 10)
  assert.deepEqual(animations.map(animation => animation.repeat), [-1, 0, 0])
  assert.equal(frames[0], 'flight_00.png')
  assert.equal(frames.at(-1), 'dissipation_02.png')
})

test('Wind production hero and FX atlases use distinct runtime paths and keys', () => {
  assert.equal(windPreview.WIND_HERO_ATLAS, 'chibi_wind')
  assert.deepEqual(windPreview.WIND_HERO_PATHS, {
    png: 'art/chibi_wind.png',
    json: 'art/chibi_wind.json',
  })
  assert.equal(windPreview.WIND_FX_ATLAS, 'wind_basic_fx')
  assert.deepEqual(windPreview.WIND_FX_PATHS, {
    png: 'art/wind_basic_fx.png',
    json: 'art/wind_basic_fx.json',
  })
})

test('Wind hero matrix layout places all 24 animations once across shared row baselines', () => {
  const layout = windPreview.buildWindHeroMatrixLayout()

  assert.equal(layout.length, 24)
  assert.equal(new Set(layout.map(item => item.key)).size, 24)
  assert.equal(new Set(layout.map(item => item.x)).size, 6)
  assert.equal(new Set(layout.map(item => item.baselineY)).size, 4)
  for (const direction of ['down', 'up', 'left', 'right']) {
    assert.equal(new Set(layout.filter(item => item.direction === direction).map(item => item.baselineY)).size, 1)
  }
})

test('Wind basic demo orders hero attack before centered flight, impact, and dissipation', () => {
  const sequence = windPreview.buildWindBasicSequence('right')

  assert.deepEqual(sequence.map(step => step.phase), ['hero_attack', 'flight', 'impact', 'dissipation'])
  assert.equal(sequence[0].key, 'chibi_wind_attack_right')
  assert.deepEqual(sequence.slice(1).map(step => step.key), [
    'wind_basic_fx_flight',
    'wind_basic_fx_impact',
    'wind_basic_fx_dissipation',
  ])
})
