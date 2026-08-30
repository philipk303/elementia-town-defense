// The map ground layer's readability contract (tools/art/ground_pipeline.py).
//
// The ground is the one asset that sits under every other sprite in the game,
// so the thing worth gating is not "does the file exist" -- assetDelivery.test
// already covers that -- but "is it still inside the agreed brightness band".
//
// Through 2026-08-14 that band was a dusk ceiling, because every sprite was
// authored dark and a brighter ground would erase their silhouettes. Philip
// found dusk too dark/murky in play; as of 2026-08-15 enemy contrast is a
// runtime outline (GameScene.js, black preFX glow on enemy sprites) instead
// of a ground-luminance cap, so the ground moved to a brighter agreed band
// (SCALE in the pipeline). These numbers mirror what the pipeline asserts at
// generation time -- duplicating them here is deliberate: it catches a
// ground.png that was hand-edited, regenerated from a modified script, or
// replaced wholesale.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TILE_SIZE, TILES_W, TILES_H } from '../shared/constants.js'
import { IMAGES } from '../client/src/assets/manifest.js'
import { decodeRgbPng } from './helpers/decodeRgbPng.js'

const GROUND_PNG = 'client/public/art/ground.png'

const ground = decodeRgbPng(GROUND_PNG)

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// One pass over ~940k pixels. Accumulated rather than collected into an array
// so nothing here spreads a million-element list into a call frame.
let peak = 0
let sum = 0
let overLine = 0
let count = 0
for (let i = 0; i < ground.data.length; i += 3) {
  const l = luminance(ground.data[i], ground.data[i + 1], ground.data[i + 2])
  if (l > peak) peak = l
  if (l > 140) overLine++
  sum += l
  count++
}

test('ground.png covers the map exactly, at map resolution', () => {
  assert.equal(ground.width, TILES_W * TILE_SIZE)
  assert.equal(ground.height, TILES_H * TILE_SIZE)
})

test('no ground pixel exceeds the agreed brightness ceiling', () => {
  assert.ok(peak <= 165, `brightest ground pixel is luminance ${peak.toFixed(1)}, over the 165 ceiling`)
})

test('ground mean luminance stays inside the agreed brighter band', () => {
  const mean = sum / count
  assert.ok(mean >= 85 && mean <= 130, `ground mean luminance ${mean.toFixed(1)} is outside [85, 130]`)
})

test('the brightest pixels stay a small minority of the field', () => {
  const frac = overLine / count
  assert.ok(frac <= 0.03, `${(frac * 100).toFixed(2)}% of ground pixels exceed luminance 140, over the 3% budget`)
})

test('the ground is registered and drawn beneath every other scene layer', () => {
  assert.ok(IMAGES.some((i) => i.key === 'ground' && i.png === 'art/ground.png'))

  const scene = readFileSync('client/src/scenes/GameScene.js', 'utf8')
  const groundDepth = Number(/const GROUND_DEPTH = (-?\d+)/.exec(scene)[1])
  const gridDepth = Number(/const GRID_DEPTH = (-?\d+)/.exec(scene)[1])
  // structureAuraGfx sits at -1 and was the previous floor of the scene.
  assert.ok(groundDepth < gridDepth, 'ground must sit below the placement grid')
  assert.ok(gridDepth < -1, 'the grid must sit below structureAuraGfx (-1)')
})
