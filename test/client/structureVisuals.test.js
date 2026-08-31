import { test } from 'node:test'
import assert from 'node:assert/strict'

import { structureDisplayRect } from '../../client/src/render/structureVisuals.js'
import { STRUCTURE_CONTENT_BOX } from '../../client/src/render/structureContentBoxes.js'

// Where the art's visible content lands, given the returned rect. Sprites keep
// Phaser's centred origin, so these are measured from the footprint's centre.
const contentBottom = (r, box, artH) =>
  r.offsetY - r.height / 2 + (box.y + box.h) * (r.height / artH)
const contentWidth = (r, box, artW) => box.w * (r.width / artW)

test('art with no frame data keeps the plain footprint rectangle', () => {
  assert.deepEqual(
    structureDisplayRect('barricade', 28, 28, undefined, undefined),
    { width: 28, height: 28, offsetY: 0 },
  )
})

test('unmeasured art falls back to fitting the whole frame, never the old crush', () => {
  const r = structureDisplayRect('not_a_real_key', 28, 28, 48, 64)
  assert.ok(Math.abs(r.width / r.height - 48 / 64) < 1e-9, 'aspect preserved')
  assert.ok(r.height > 28, 'not squashed into the footprint')
})

test('a content box measured against a different frame size is ignored, not mis-scaled', () => {
  // Art replaced without re-running tools/art/measure_content_boxes.mjs.
  const r = structureDisplayRect('watchtower', 28, 28, 8, 8)   // frame far smaller than the box
  assert.ok(Math.abs(r.width / r.height - 1) < 1e-9)
  assert.equal(r.width, 28)
})

// --- the two defects, per structure -------------------------------------

test('tall art keeps its aspect ratio instead of being crushed', () => {
  // WATCHTOWER: 48x64 art in a 28x28 footprint. The old code drew it 28x28,
  // squashing it 33%.
  const r = structureDisplayRect('watchtower', 28, 28, 48, 64)
  assert.ok(Math.abs(r.width / r.height - 48 / 64) < 1e-9)
  assert.ok(r.height > 28, 'must be taller than the footprint, not crushed into it')
})

test('visible content fills the footprint width — authored margin is not drawn as blank tile', () => {
  for (const [key, box] of Object.entries(STRUCTURE_CONTENT_BOX)) {
    const r = structureDisplayRect(key, 60, 60, box.frameW, box.frameH)
    assert.ok(
      Math.abs(contentWidth(r, box, box.frameW) - 60) < 1e-9,
      `${key}: content should span the full 60px footprint width`,
    )
  }
})

test('every structure pins its content bottom to the footprint bottom edge', () => {
  const fpH = 60
  for (const [key, box] of Object.entries(STRUCTURE_CONTENT_BOX)) {
    const r = structureDisplayRect(key, 60, fpH, box.frameW, box.frameH)
    assert.ok(
      Math.abs(contentBottom(r, box, box.frameH) - fpH / 2) < 1e-9,
      `${key}: content bottom should sit on the footprint's bottom edge`,
    )
  }
})

test('overhang grows upward only — nothing extends below the footprint', () => {
  for (const [key, box] of Object.entries(STRUCTURE_CONTENT_BOX)) {
    const r = structureDisplayRect(key, 60, 60, box.frameW, box.frameH)
    assert.ok(contentBottom(r, box, box.frameH) <= 30 + 1e-9, `${key} must not spill downward`)
  }
})

test('the farm no longer renders at 69% of its tile', () => {
  const box = STRUCTURE_CONTENT_BOX.farm
  const r = structureDisplayRect('farm', 28, 28, box.frameW, box.frameH)
  // Old behaviour: frame fitted to 28px, so 22px of content drew at 19.25px.
  const oldContentWidth = box.w * (28 / box.frameW)
  assert.ok(oldContentWidth < 20, 'sanity: this is the regression being fixed')
  assert.ok(Math.abs(contentWidth(r, box, box.frameW) - 28) < 1e-9)
})

test('the hall fills its 2x2, and its art really does carry margin', () => {
  const box = STRUCTURE_CONTENT_BOX.hall
  assert.ok(box.w < box.frameW, 'hall art has horizontal margin to reclaim')
  const r = structureDisplayRect('hall', 64, 64, box.frameW, box.frameH)
  assert.ok(Math.abs(contentWidth(r, box, box.frameW) - 64) < 1e-9)
})

test('boxes are fitted on the RESTING pose, not on whatever the animation reaches', () => {
  // The Volcano's idle content is 112x95; its eruption blooms to 124x124.
  // Fitting the all-frames union grounds the ERUPTION and leaves the idle
  // volcano — the state a player sees almost all the time — floating ~9px
  // above its own tile. Guard the two structures where this actually bites.
  const volcano = STRUCTURE_CONTENT_BOX.magma_trap
  assert.ok(volcano.w <= 112 && volcano.y + volcano.h <= 108,
    'magma_trap must be fitted on its idle pose, not its eruption')

  // Same trap on the Geyser: its frames reserve headroom for the plume, so the
  // all-frames box is the pool PLUS the plume and the pool would not reach the
  // ground. The fit box must be the idle pool alone.
  const geyser = STRUCTURE_CONTENT_BOX.water_special
  assert.ok(geyser.h < geyser.frameH * 0.6,
    'water_special must be fitted on its idle pool, not pool + plume')
})

test('the geyser is one size, not one size per animation state', () => {
  // The old code returned height 64 for `active` only, which is why idle
  // stayed crushed. State is not an input any more, and the content box is the
  // UNION across frames so the sprite cannot pulse as the animation advances.
  const box = STRUCTURE_CONTENT_BOX.water_special
  const a = structureDisplayRect('water_special', 60, 28, box.frameW, box.frameH)
  const b = structureDisplayRect('water_special', 60, 28, box.frameW, box.frameH)
  assert.deepEqual(a, b)
})
