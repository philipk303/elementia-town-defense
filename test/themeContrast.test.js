// Theme tokens must stay legible against the ground layer.
//
// Before the ground landed, every one of these colours was drawn on a flat
// near-black field (#0d1420, luminance ~19) and nothing could be illegible.
// The ground averages luminance ~42 and is warm brown at the Hall end, which
// quietly put six tokens under the WCAG 3:1 graphical-object threshold —
// notably the Earth palette, which is brown on brown. They were lifted along
// their own hue when the ground landed (client/src/theme.js).
//
// This gate exists because that failure mode is invisible in a diff: someone
// retunes the ground, or picks a new structure colour by eye, and a placement
// ghost or a fallback fill silently stops reading. Measuring is cheap.
//
// GENERALIZED 2026-08-23. The gate used to check every colour at FULL
// OPACITY, which is a measurement bug of exactly the same shape as sizing a
// touch target in logical pixels: it checks something other than what ships.
// The touch controls were measured at 3.14:1 by this file while the actual
// drawn pixels — at their real 0.55-0.92 alpha — were 2.06:1. `check()` now
// takes the alpha a colour is ACTUALLY drawn at and composites it over its
// real backdrop (a ground band, or the panel fill it sits on) before
// measuring. Every UI surface that draws translucent is registered below,
// not just the touch controls.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ELEMENT_COLORS, STRUCTURE_COLORS, ENEMY_BASE,
  TOUCH_CONTROL_COLORS, TOUCH_ON_ACTIVE_TEXT,
  PLACEMENT_GHOST_COLORS, PANEL_BG, FUSION_BUTTON_COLORS,
  ABILITY_STATE_COLORS, SELL_CARD_BUTTON_COLORS,
} from '../client/src/theme.js'
import { decodeRgbPng, contrastRatio, bandMean } from './helpers/decodeRgbPng.js'

const MIN_CONTRAST = 3.0

const ground = decodeRgbPng('client/public/art/ground.png')

// The three bands a player actually sees things standing on: grass outskirts
// at the gates, the transition, and packed earth around the Hall.
const BANDS = {
  outskirts: bandMean(ground, 0, 0.30),
  midfield: bandMean(ground, 0.30, 0.62),
  courtyard: bandMean(ground, 0.62, 1),
}

function rgb(hex) {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
}

// Standard "over" alpha compositing: what a viewer's eye actually receives
// when a translucent fill sits on top of an opaque backdrop.
function compositeOver(fgHex, alpha, backdropRgb) {
  const fg = rgb(fgHex)
  return fg.map((c, i) => Math.round(c * alpha + backdropRgb[i] * (1 - alpha)))
}

function worstBandComposite(hex, alpha) {
  let worst = { ratio: Infinity, band: null }
  for (const [band, mean] of Object.entries(BANDS)) {
    const composited = compositeOver(hex, alpha, mean)
    const ratio = contrastRatio(composited, mean)
    if (ratio < worst.ratio) worst = { ratio, band }
  }
  return worst
}

// label: what to print on failure.
// hex: the fill/stroke colour as drawn (a 0xRRGGBB literal).
// alpha: the ACTUAL alpha Phaser draws it at — read this off the real
//   fillStyle/lineStyle call in GameScene.js, never assume 1.
// backdrop: either 'ground' (composite over each of the three bands) or an
//   [r,g,b] array (composite over a specific panel fill — see checkOnPanel).
function check(label, hex, alpha = 1) {
  const { ratio, band } = worstBandComposite(hex, alpha)
  assert.ok(
    ratio >= MIN_CONTRAST,
    `${label} (0x${hex.toString(16).padStart(6, '0')} @ alpha ${alpha}) is ${ratio.toFixed(2)}:1 ` +
    `against the ${band} ground, under the ${MIN_CONTRAST}:1 minimum`,
  )
}

// A colour that sits ON a panel, not directly on the ground: the panel's own
// fill is itself translucent over the ground, so the true backdrop is that
// composited colour, not the raw ground band. Checked against the WORST
// (lowest-luminance-shift) ground band the panel could be sitting on.
function checkOnPanel(label, hex, alpha, panel) {
  let worst = { ratio: Infinity, band: null }
  for (const [band, mean] of Object.entries(BANDS)) {
    const panelBackdrop = compositeOver(panel.color, panel.alpha, mean)
    const composited = compositeOver(hex, alpha, panelBackdrop)
    const ratio = contrastRatio(composited, panelBackdrop)
    if (ratio < worst.ratio) worst = { ratio, band }
  }
  assert.ok(
    worst.ratio >= MIN_CONTRAST,
    `${label} (0x${hex.toString(16).padStart(6, '0')} @ alpha ${alpha}, on its panel) is ` +
    `${worst.ratio.toFixed(2)}:1 on ${worst.band}, under the ${MIN_CONTRAST}:1 minimum`,
  )
}

test('every element colour reads against the ground', () => {
  for (const [name, hex] of Object.entries(ELEMENT_COLORS)) check(`ELEMENT_COLORS.${name}`, hex)
})

test('every structure colour reads against the ground', () => {
  for (const [name, hex] of Object.entries(STRUCTURE_COLORS)) check(`STRUCTURE_COLORS.${name}`, hex)
})

test('every enemy placeholder colour reads against the ground', () => {
  ENEMY_BASE.forEach((e, i) => check(`ENEMY_BASE[${i}]`, e.color))
})

test('the gate marker reads against the grass it sits on', () => {
  // Drawn as a literal in GameScene.create(); it is the marker that tells a
  // player where a wave arrives, and it sits in the top few rows of the map.
  const scene = readFileSync('client/src/scenes/GameScene.js', 'utf8')
  const hex = Number.parseInt(
    /\w+\.fillStyle\((0x[0-9a-f]{6}), 1\)\s*\n\s*\w+\.fillRect\(gate\.gx/.exec(scene)[1], 16,
  )
  const top = bandMean(ground, 0, 0.05)
  const ratio = contrastRatio(rgb(hex), top)
  assert.ok(ratio >= MIN_CONTRAST, `gate marker is ${ratio.toFixed(2)}:1 against the top of the map`)
})

// The touch controls sit ON the map, unlike every other HUD element, which
// either has a backing plate or lives in the letterbox. They were hard-coded
// literals in GameScene and escaped this gate entirely until 2026-08-22, when
// a design review measured the idle stick ring at 1.38:1 and the idle knob at
// 2.54:1 against the courtyard — i.e. invisible on the ground they sit on.
// As of 2026-08-23 they draw at ~full opacity (0.92-1) after the alpha bug
// below was found; the alphas here are the REAL current draw values.
test('every touch control colour reads against the ground at its real draw alpha', () => {
  const alphaByToken = { plate: 0.95, edge: 1, knob: 1, active: 1 }
  for (const [name, hex] of Object.entries(TOUCH_CONTROL_COLORS)) {
    check(`TOUCH_CONTROL_COLORS.${name}`, hex, alphaByToken[name] ?? 1)
  }
})

// The REPAIR label is drawn ON the active fill, not on the map, so it is
// measured against that fill. It used to stay pale on a pale held fill
// (1.32:1), so the word became unreadable exactly while the button was held.
test('the held-button label reads against the active fill it sits on', () => {
  const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const ratio = contrastRatio(hexToRgb(TOUCH_ON_ACTIVE_TEXT), rgb(TOUCH_CONTROL_COLORS.active))
  assert.ok(ratio >= 4.5, `label on active fill is ${ratio.toFixed(2)}:1, needs 4.5:1`)
})

// Placement ghost (2026-08-23): the fill wash (0.28 alpha) is a deliberate
// translucent preview, not something meant to read as an icon on its own —
// it is NOT checked at 3:1 here. The STROKES (solid for valid, dashed for
// invalid) and the invalid X mark are the legibility-critical parts, drawn
// at 0.9-0.95, and are what this checks.
test('the placement ghost outline/X colours read against the ground at their real alpha', () => {
  // Both draw at full opacity (0.9-0.95 alpha versions were tried first and
  // FAILED the composite-aware check -- see theme.js for the numbers).
  check('PLACEMENT_GHOST_COLORS.valid (outline)', PLACEMENT_GHOST_COLORS.valid, 1)
  check('PLACEMENT_GHOST_COLORS.invalid (dashed outline + X)', PLACEMENT_GHOST_COLORS.invalid, 1)
})

// Fusion panel (2026-08-23): background is translucent over the ground;
// ACCEPT/REJECT/direction buttons sit ON that background, not the ground
// directly, and the inactive direction buttons draw at only 0.55 alpha.
test('the fusion panel background reads against the ground', () => {
  // The panel background itself just needs to visually separate from the
  // ground, not carry text at 3:1 -- but check it against the STRONGEST case
  // (lowest source contrast) so a future retune cannot make it invisible.
  const { color, alpha } = PANEL_BG.fusion
  const composited = compositeOver(color, alpha, BANDS.courtyard)
  const ratio = contrastRatio(composited, BANDS.courtyard)
  assert.ok(ratio >= 1.5, `fusion panel background is only ${ratio.toFixed(2)}:1 over courtyard, barely separates from the map`)
})

test('every fusion panel button colour reads on the fusion panel', () => {
  for (const [name, { color, alpha }] of Object.entries(FUSION_BUTTON_COLORS)) {
    checkOnPanel(`FUSION_BUTTON_COLORS.${name}`, color, alpha, PANEL_BG.fusion)
  }
})

// Ability bar (2026-08-23): state fills fully replaced the private
// ABILITY_STATE_COLOR literal in GameScene.js — see theme.js
// ABILITY_STATE_COLORS, which is now the single source both draw from.
test('every ability-bar state colour reads on the ability bar background', () => {
  for (const [state, { color, alpha }] of Object.entries(ABILITY_STATE_COLORS)) {
    checkOnPanel(`ABILITY_STATE_COLORS.${state}`, color, alpha, PANEL_BG.abilityBar)
  }
})

// Sell card (2026-08-23): SELL/PERMANENT/close-button fills sit on the card's
// own translucent background, not the ground.
test('every sell-card button colour reads on the sell card background', () => {
  for (const [name, { color, alpha }] of Object.entries(SELL_CARD_BUTTON_COLORS)) {
    checkOnPanel(`SELL_CARD_BUTTON_COLORS.${name}`, color, alpha, PANEL_BG.sellCard)
  }
})
