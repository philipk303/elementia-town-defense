// Build palette thumbnail rects (client/src/render/buildThumbnails.js).
//
// The DOM/Phaser-texture-manager half needs a browser and is verified live
// (see docs/handoffs/2026-09-01-character-select.md's predecessor session);
// what is tested here is the part a mocked Phaser texture manager can drive:
// which sheet rectangle each buildable resolves to, and that every buildable
// resolves through the manifest rather than a guessed filename -- the exact
// mistake that once measured a stale wind_special.png instead of the real
// wind_vortex.png (see windVortexAtlas.test.js for that guard on the manifest
// side; this is the equivalent guard on the thumbnail side).

import test from 'node:test'
import assert from 'node:assert/strict'
import { computeThumbnails, pickIdleFrame } from '../../client/src/render/buildThumbnails.js'
import { structureArtKey } from '../../client/src/assets/manifest.js'
import { CONTENT_BOX } from '../../client/src/render/contentBoxes.js'
import { BUILDABLE_TYPES } from '../../shared/constants.js'

test('pickIdleFrame prefers a south-facing idle in either naming convention this codebase uses', () => {
  // Cardinal convention (Water Geyser / Wind Vortex).
  assert.equal(
    pickIdleFrame(['idle_N_0.png', 'idle_E_0.png', 'idle_S_0.png', 'idle_W_0.png']),
    'idle_S_0.png',
  )
  // down/up/left/right convention (heroes, and EARTH_SPECIAL today).
  assert.equal(
    pickIdleFrame(['idle_up_0.png', 'idle_down_0.png']),
    'idle_down_0.png',
  )
})

test('pickIdleFrame falls back to the first idle frame when no south variant exists', () => {
  assert.equal(pickIdleFrame(['idle_0.png', 'active_0.png']), 'idle_0.png')
})

test('pickIdleFrame returns null rather than undefined when there is no idle frame at all', () => {
  assert.equal(pickIdleFrame(['active_0.png', 'recovery_0.png']), null)
})

// Minimal fake of the Phaser texture-manager surface computeThumbnails reads:
// exists(), get(key).getFrameNames(), get(key).get(frameName).cutX/cutY, and
// get(key).source[0].width/height.
function fakeScene(entries) {
  const textures = new Map(Object.entries(entries))
  return {
    textures: {
      exists: (key) => textures.has(key),
      get: (key) => textures.get(key),
    },
  }
}

function fakeAtlasTexture(frameNames, cuts, sourceW, sourceH) {
  return {
    getFrameNames: () => frameNames,
    get: (name) => cuts[name],
    source: [{ width: sourceW, height: sourceH }],
  }
}

function fakeImageTexture(sourceW, sourceH) {
  return {
    getFrameNames: () => [],
    get: () => ({ cutX: 0, cutY: 0 }),
    source: [{ width: sourceW, height: sourceH }],
  }
}

test('every buildable resolves a thumbnail when its texture is loaded, through the manifest -- never a guessed filename', () => {
  // Build a fake texture for each of the 9 buildables' real content-box key,
  // packed on an arbitrary large sheet so cutX/cutY don't collide with box
  // bounds. This exercises the actual structureArtKey()/manifest resolution
  // path computeThumbnails uses, not a re-implementation of it.
  const entries = {}
  for (const type of BUILDABLE_TYPES) {
    const key = structureArtKey(type)
    const box = CONTENT_BOX[key]
    entries[key] = fakeAtlasTexture(
      ['idle_S_0.png'],
      { 'idle_S_0.png': { cutX: 200, cutY: 300 } },
      1000, 1000,
    )
    void box
  }
  const scene = fakeScene(entries)
  const thumbs = computeThumbnails(scene)

  assert.equal(thumbs.size, BUILDABLE_TYPES.length,
    `expected a thumbnail for every buildable, got ${[...thumbs.keys()]}`)
  for (const type of BUILDABLE_TYPES) {
    const rect = thumbs.get(type)
    assert.ok(rect, `${type} produced no thumbnail rect`)
    assert.ok(rect.w > 0 && rect.h > 0, `${type} thumbnail has non-positive size`)
    assert.ok(rect.src.startsWith('art/'), `${type} thumbnail src looks wrong: ${rect.src}`)
  }
})

test('WIND_SPECIAL resolves to the real wind_vortex.png, not a guessed wind_special.png', () => {
  const key = structureArtKey('WIND_SPECIAL')
  assert.equal(key, 'wind_special') // the runtime key
  const scene = fakeScene({
    [key]: fakeAtlasTexture(['idle_S_0.png'], { 'idle_S_0.png': { cutX: 132, cutY: 0 } }, 512, 512),
  })
  const rect = computeThumbnails(scene).get('WIND_SPECIAL')
  assert.equal(rect.src, 'art/wind_vortex.png')
})

test('an image-kind buildable (no atlas frames) offsets from the file origin, not a nonexistent cut rect', () => {
  const key = structureArtKey('BARRICADE')
  const box = CONTENT_BOX[key]
  const scene = fakeScene({ [key]: fakeImageTexture(32, 32) })
  const rect = computeThumbnails(scene).get('BARRICADE')
  const scale = rect.w / box.w
  assert.equal(rect.bgX, box.x * scale)
  assert.equal(rect.bgY, box.y * scale)
})

test('an atlas-kind buildable adds the frame\'s sheet position to the content-box offset', () => {
  const key = structureArtKey('WATCHTOWER')
  const box = CONTENT_BOX[key]
  const scene = fakeScene({
    [key]: fakeAtlasTexture(['idle_0.png'], { 'idle_0.png': { cutX: 50, cutY: 10 } }, 400, 400),
  })
  const rect = computeThumbnails(scene).get('WATCHTOWER')
  const scale = Math.max(rect.w, rect.h) / Math.max(box.w, box.h)
  assert.equal(rect.bgX, (50 + box.x) * scale)
  assert.equal(rect.bgY, (10 + box.y) * scale)
})

test('a buildable with no matching texture loaded is skipped, not crashed on', () => {
  const scene = fakeScene({}) // nothing loaded
  const thumbs = computeThumbnails(scene)
  assert.equal(thumbs.size, 0)
})
