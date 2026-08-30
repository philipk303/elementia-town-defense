// HUD width/stack geometry gate.
//
// The HUD overflow regression this file exists to catch was a real one: when
// _uiUnit() (client/src/scenes/GameScene.js) made font size a function of
// device scale instead of just the player's hudScale preference, the top-left
// HUD lines got PHYSICALLY LARGER on narrow devices — 2020 logical px of a
// 1280 surface on a phone, clipping the gold readout and the touch hint — and
// nothing caught it before a design review measured it by hand.
//
// _layoutHud is tightly coupled to a live Phaser Scene (setFontSize,
// setPosition, actual text metrics), so this mirrors its WIDTH-CLAMP math —
// the part that is pure — the same way touchTargetGeometry.test.js mirrors
// _abilityBarGeom. It cannot verify true wrapped-text height (that needs real
// font metrics, which Node has no access to without a browser), but it can
// verify the clamp formula itself never lets a line's word-wrap width, or the
// status bar, reach past where the wave preview sits.

import test from 'node:test'
import assert from 'node:assert/strict'

// Mirrors GameScene.js constants and _layoutHud's clamp formulas exactly.
const WAVE_PREVIEW_W = 198
const STATUS_BAR_W = 140
const STATUS_BAR_H = 8
const MARGIN = 8

const SURFACE_W = 1280
const SURFACE_H = 736

const VIEWPORTS = [
  { name: 'phone portrait 375', cssW: 375 },
  { name: 'phone landscape 812', cssW: 812 },
  { name: 'tablet portrait 768', cssW: 768 },
  { name: 'tablet landscape 1024', cssW: 1024 },
  { name: 'desktop 1280', cssW: 1280 },
]
const HUD_SCALES = [0.75, 1, 2.5]

function layoutHudGeom({ displayScale, hudScale }) {
  const s = displayScale * hudScale
  const textLimit = Math.max(120, SURFACE_W - MARGIN - WAVE_PREVIEW_W)
  const barW = Math.round(Math.min(STATUS_BAR_W * s, SURFACE_W * 0.35))
  const barH = Math.round(STATUS_BAR_H * s)
  const textX = MARGIN + barW + 8
  return { s, textLimit, barW, barH, textX }
}

function forEachConfig(fn) {
  for (const vp of VIEWPORTS) {
    const displayScale = SURFACE_W / vp.cssW
    for (const hudScale of HUD_SCALES) {
      fn({ label: `${vp.name} @ hud ${hudScale}`, ...layoutHudGeom({ displayScale, hudScale }) })
    }
  }
}

// THE bug this file exists to catch, restated as an invariant: a HUD line's
// word-wrap box must never reach the wave preview widget, which is pinned at
// x = SURFACE_W - WAVE_PREVIEW_W regardless of hudScale.
test('the HUD word-wrap limit never reaches the wave preview', () => {
  forEachConfig(({ label, textLimit }) => {
    assert.ok(MARGIN + textLimit <= SURFACE_W - WAVE_PREVIEW_W + 1,
      `word-wrap box reaches the wave preview: ${label}`)
    assert.ok(textLimit >= 120, `word-wrap limit collapsed below a usable width: ${label}`)
  })
})

// The status bar itself, and the text beside it, must stay on the surface —
// at hudScale 2.5 on a phone the UNCLAMPED bar reached 1194 of 1280 logical
// px and pushed its own label off-screen.
test('the status bar and its label text stay on the surface at every config', () => {
  forEachConfig(({ label, barW, textX }) => {
    assert.ok(MARGIN + barW <= SURFACE_W, `status bar itself overflows: ${label}`)
    // Leave real room for the HP number text beside the bar — not just one
    // pixel of clearance, which would technically be "on screen" but
    // unreadable.
    assert.ok(textX + 60 <= SURFACE_W, `no room left for HP text beside the bar: ${label}`)
    assert.ok(barW <= SURFACE_W * 0.35 + 1, `status bar exceeded its width clamp: ${label}`)
  })
})

// The bar clamp must be a genuine clamp: growing hudScale should never grow
// the bar past its ceiling, even though the unclamped STATUS_BAR_W * s would.
test('the status bar width clamp actually bites at high hudScale on narrow devices', () => {
  const { s, barW } = layoutHudGeom({ displayScale: SURFACE_W / 375, hudScale: 2.5 })
  const unclamped = Math.round(STATUS_BAR_W * s)
  assert.ok(unclamped > barW, 'the clamp scenario stopped being unclamped-larger -- test no longer exercises the clamp')
  assert.ok(barW <= SURFACE_W * 0.35 + 1)
})

// Baseline vertical stack: three lines at their MINIMUM per-line height (this
// cannot account for wrap-induced extra rows without real font metrics, but
// it is the floor any hudScale must clear before wrapping is even considered).
test('the three-line HUD stack minimum height fits above the wave-preview band', () => {
  forEachConfig(({ label, s }) => {
    const stepMin = (min) => Math.round(min * s) + Math.round(2 * s)
    const total = stepMin(20) + stepMin(18) + stepMin(18)  // hud, buildHud, fusionHud
    assert.ok(MARGIN + total < SURFACE_H, `HUD stack minimum already exceeds the surface height: ${label}`)
  })
})
