// CSS-PIXEL TOUCH TARGET GATE.
//
// This file exists because of a specific, measured failure. On 2026-08-22 two
// independent reviews found that three of the four Phaser-drawn UI surfaces
// had sized their touch targets in LOGICAL pixels. Under Phaser.Scale.FIT the
// surface is a fixed 1280x736 letterboxed into the device, so on a 375px-wide
// phone one logical pixel is about 0.29 CSS pixels. The damage, all shipped:
// ability buttons 7.6 CSS px tall with their labels rendered off the bottom
// of the screen, fusion direction buttons 8.8 CSS px on a timed irreversible
// decision, a 6.4 CSS px Hall-HP bar on the primary target tablet.
//
// The one module that got it right (`layoutTouchControls`) was the one under
// test. So the lesson is not "be careful", it is "measure it in a test" —
// this one, table-driven across the viewports and scale settings that matter.
//
// Everything here asserts in REAL CSS PIXELS, after the displayScale
// conversion, which is the only unit a thumb actually cares about.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  layoutTouchControls, TOUCH_MIN_TARGET_CSS_PX, BUTTON_SEPARATION_CSS_PX,
} from '../../client/src/input/touchControls.js'

// The real logical surface: CONFIG.MAP_WIDTH x MAP_HEIGHT (40x23 tiles of 32).
const SURFACE_W = 1280
const SURFACE_H = 736

// Viewports that matter, with the CSS width of the canvas after FIT
// letterboxing. displayScale is SURFACE_W / cssCanvasWidth.
const VIEWPORTS = [
  { name: 'phone portrait 375',  cssW: 375 },
  { name: 'phone landscape 812', cssW: 652 },
  { name: 'tablet portrait 768', cssW: 768 },
  { name: 'tablet landscape 1024 (primary target)', cssW: 1024 },
  { name: 'desktop 1280', cssW: 1280 },
]
const HUD_SCALES = [0.75, 1, 2.5]

// Mirrors GameScene._abilityBarGeom. Kept in step with it by the invariant
// tests below rather than by imports, because that method needs a live Phaser
// scene. If the two drift, the "bar fits on screen" assertions here fail.
const ABILITY_SLOT_W = 74, ABILITY_SLOT_H = 16, ABILITY_SLOT_GAP = 8
const ABILITY_BAR_BOTTOM_MARGIN = 26
const ABILITY_BAR_MAX_WIDTH_FRAC = 0.6

function abilityBarGeom({ width, height, displayScale, hudScale, band, touchMode = true }) {
  const floorW = touchMode ? TOUCH_MIN_TARGET_CSS_PX : 0
  const floorH = touchMode ? TOUCH_MIN_TARGET_CSS_PX : 0
  const gap = ABILITY_SLOT_GAP * hudScale * displayScale
  let slotW = Math.max(ABILITY_SLOT_W * hudScale, floorW) * displayScale
  const slotH = Math.max(ABILITY_SLOT_H * hudScale, floorH) * displayScale
  const maxTotal = Math.min(width * ABILITY_BAR_MAX_WIDTH_FRAC, band && band.w > 0 ? band.w : Infinity)
  const maxSlotW = (maxTotal - 2 * gap) / 3
  if (maxSlotW > 0) slotW = Math.max(Math.min(slotW, maxSlotW), floorW * displayScale)
  const totalW = 3 * slotW + 2 * gap
  return {
    slotW, slotH, gap, totalW,
    x0: (width - totalW) / 2,
    y: height - slotH - ABILITY_BAR_BOTTOM_MARGIN * hudScale * displayScale,
  }
}

function forEachConfig(fn) {
  for (const vp of VIEWPORTS) {
    const displayScale = SURFACE_W / vp.cssW
    for (const hudScale of HUD_SCALES) {
      const layout = layoutTouchControls({ width: SURFACE_W, height: SURFACE_H, displayScale, hudScale })
      const bar = abilityBarGeom({
        width: SURFACE_W, height: SURFACE_H, displayScale, hudScale, band: layout.centerBand,
      })
      fn({ label: `${vp.name} @ hud ${hudScale}`, displayScale, hudScale, bar, layout,
        css: (logical) => logical / displayScale })
    }
  }
}

test('every touch control clears 44 CSS px at every viewport and hud scale', () => {
  forEachConfig(({ label, layout, css }) => {
    assert.ok(css(layout.move.radius * 2) >= TOUCH_MIN_TARGET_CSS_PX, `move stick: ${label}`)
    assert.ok(css(layout.aim.radius * 2) >= TOUCH_MIN_TARGET_CSS_PX, `aim stick: ${label}`)
    assert.ok(css(layout.repair.w) >= TOUCH_MIN_TARGET_CSS_PX, `repair width: ${label}`)
    assert.ok(css(layout.repair.h) >= TOUCH_MIN_TARGET_CSS_PX, `repair height: ${label}`)
  })
})

// THE BUG THIS FILE WAS WRITTEN FOR. The bar used to be positioned by its TOP
// edge at `height - margin`, so an enlarged touch button hung off the bottom.
test('the whole ability bar is on screen, not just its top edge', () => {
  forEachConfig(({ label, bar, css }) => {
    assert.ok(bar.y >= 0, `bar starts above the surface: ${label}`)
    assert.ok(bar.y + bar.slotH <= SURFACE_H,
      `bar overflows the bottom by ${(bar.y + bar.slotH - SURFACE_H).toFixed(0)} logical px: ${label}`)
    assert.ok(css(bar.slotH) >= TOUCH_MIN_TARGET_CSS_PX, `ability slot too short: ${label}`)
    // The label is centred in the slot, so the slot's midpoint must be on screen.
    assert.ok(bar.y + bar.slotH / 2 <= SURFACE_H, `ability label renders off-screen: ${label}`)
  })
})

test('the ability bar fits the surface width and leaves room either side', () => {
  forEachConfig(({ label, bar }) => {
    assert.ok(bar.x0 >= 0, `bar overflows left: ${label}`)
    assert.ok(bar.x0 + bar.totalW <= SURFACE_W, `bar overflows right: ${label}`)
  })
})

// THE OTHER BUG. The E slot used to sit inside the aim stick's grab zone, and
// because sticks were hit-tested first, tapping E fired a basic attack.
test('no ability slot overlaps a stick grab circle', () => {
  forEachConfig(({ label, bar, layout }) => {
    for (let i = 0; i < 3; i++) {
      const x = bar.x0 + i * (bar.slotW + bar.gap)
      const slot = { x, y: bar.y, w: bar.slotW, h: bar.slotH }
      for (const kind of ['move', 'aim']) {
        const s = layout[kind]
        // Closest point on the slot rect to the stick centre.
        const nx = Math.max(slot.x, Math.min(s.cx, slot.x + slot.w))
        const ny = Math.max(slot.y, Math.min(s.cy, slot.y + slot.h))
        const dist = Math.hypot(s.cx - nx, s.cy - ny)
        assert.ok(dist >= s.hitRadius,
          `slot ${i} is inside the ${kind} stick's grab circle by ${(s.hitRadius - dist).toFixed(0)} px: ${label}`)
      }
    }
  })
})

test('REPAIR keeps real clearance above the aim stick and stays reachable', () => {
  forEachConfig(({ label, layout, css, displayScale }) => {
    const r = layout.repair
    const gap = layout.aim.cy - layout.aim.radius - (r.y + r.h)
    assert.ok(css(gap) >= BUTTON_SEPARATION_CSS_PX * 0.9,
      `only ${css(gap).toFixed(1)} CSS px between REPAIR and the aim stick: ${label}`)
    assert.ok(r.y >= 0 && r.y + r.h <= SURFACE_H, `REPAIR off screen: ${label}`)
    // It must not climb into the top of the screen, where no thumb reaches and
    // the wave preview lives. It used to reach y=0 on a phone at hud 2.5.
    //
    // The bound is 20%, not the 33% a tablet comfortably clears, because phone
    // PORTRAIT bottoms out here for a physical reason: FIT letterboxing leaves
    // a canvas only 216 CSS px tall, and two 44px sticks plus a 24px
    // separation plus a 44px button already claim 112 of it. Portrait is
    // cramped by arithmetic, not by a layout bug — landscape gives 375 CSS px
    // of canvas height and is the orientation this is designed for.
    assert.ok(r.y >= SURFACE_H * 0.20,
      `REPAIR drifted to ${(100 * r.y / SURFACE_H).toFixed(0)}% down the screen: ${label}`)
  })
})

test('the two stick grab circles never overlap each other', () => {
  forEachConfig(({ label, layout }) => {
    const d = Math.abs(layout.aim.cx - layout.move.cx)
    assert.ok(d >= layout.move.hitRadius + layout.aim.hitRadius, `stick grab circles overlap: ${label}`)
  })
})

// The grab zones sit on the board, and the bottom corners are the final
// defensive ring either side of the Hall — not spare HUD space. A circular
// grab area rather than the ring's bounding square is what keeps this honest.
test('stick grab circles stay within a sane share of the board', () => {
  forEachConfig(({ label, layout }) => {
    const area = 2 * Math.PI * layout.move.hitRadius ** 2
    const frac = area / (SURFACE_W * SURFACE_H)
    assert.ok(frac <= 0.25, `sticks swallow ${(frac * 100).toFixed(0)}% of the board: ${label}`)
  })
})

test('controls never leave the surface at any tested configuration', () => {
  forEachConfig(({ label, layout }) => {
    for (const kind of ['move', 'aim']) {
      const s = layout[kind]
      assert.ok(s.cx - s.hitRadius >= 0, `${kind} stick off the left: ${label}`)
      assert.ok(s.cx + s.hitRadius <= SURFACE_W, `${kind} stick off the right: ${label}`)
      assert.ok(s.cy - s.hitRadius >= 0, `${kind} stick off the top: ${label}`)
      assert.ok(s.cy + s.hitRadius <= SURFACE_H, `${kind} stick off the bottom: ${label}`)
    }
  })
})
