// Shared client palette (spec §6: reserved color tokens). Single source for
// element/enemy/structure colors so art (Phase 7 sprites) and placeholder
// shapes render identically and stay in sync.
//
// Wind is off-white/pale-cyan and MUST carry a dark outline — never bare
// #FFF (poor contrast on light UI). The outline pairing is baked into
// elementTint() below, not left to callers.

// Contrast note (2026-08-14, when the ground layer landed): these tokens are
// no longer drawn on a near-black field. Every one is measured against the
// three bands of client/public/art/ground.png and must clear 3:1 against the
// worst of them — see test/themeContrast.test.js. Six tokens were under that
// and were lifted along their own hue (a uniform RGB scale, so the colour
// identity is unchanged) rather than re-picked.
//
// Re-lifted 2026-08-15 when the ground brightened (mean ~42 -> ~97, see
// tools/art/ground_pipeline.py's SCALE): darkening was tried first and
// rejected -- every token had to go nearly to black to clear 3:1 against a
// mid-luminance ground, which erased hue identity entirely. Lightening
// toward white (blend toward 0xffffff along each token's own hue) clears the
// same bar at 30-55% blend and keeps every token recognizably itself. None of
// these render as a persistent hero tint today (elementTint() is unused) --
// they're attack-telegraph lines, fx colors and the wind projectile fallback
// (GameScene.js), so the paler result is a minor, mostly-transient change.
export const ELEMENT_COLORS = {
  EARTH: 0xcebea5,   // was 0x96743f (lifted 2026-08-14 from 0x8a6a3a)
  FIRE:  0xf1b37b,   // was 0xe8862e
  WATER: 0x9dc3f4,   // was 0x3a86e8
  WIND:  0xdff2f0,   // unchanged -- already light enough (5.07:1)
}

export const ELEMENT_OUTLINE = 0x0a0e14

// Placeholder fill per structure type (real art swaps this via the sprite
// manifest — see client/src/render/sprites.js). Also the live per-structure
// hitbox aura color (GameScene.js _drawStructureAura), which DOES render at
// all times regardless of whether real art is loaded, just at ~10-12% alpha.
export const STRUCTURE_COLORS = {
  // Re-lifted 2026-08-15 alongside ELEMENT_COLORS (see its comment) for the
  // brighter ground — same lighten-toward-white technique.
  BARRICADE: 0xbdc0c8, SNARE_POST: 0xa1c8b5, WATCHTOWER: 0xe9b2b2,
  FARM: 0xb3c792, MARKETPLACE: 0xd9bd66,
  EARTH_SPECIAL: ELEMENT_COLORS.EARTH, FIRE_SPECIAL: ELEMENT_COLORS.FIRE,
  WATER_SPECIAL: ELEMENT_COLORS.WATER, WIND_SPECIAL: ELEMENT_COLORS.WIND,
  MAGMA_TRAP: 0xe9b4a3, FIRESTORM: 0xf1b37b,
  MUDDY_BOG: 0xc9bfa6,
  BLIZZARD: 0x9fd1e8, STEAM_VENT: 0xb9c6cf, GRINDER: 0xd6bbaa,
}

// Placeholder greenskin dots by base type (Phase 7 sprites replace via manifest).
// Re-lifted 2026-08-15 for the brighter ground (see ELEMENT_COLORS comment).
// Real enemy art is wired for all three types, so this fallback rarely shows.
export const ENEMY_BASE = [
  { color: 0x91d07a, r: 7 },   // goblin — was 0x6abf4b
  { color: 0xa3c9a3, r: 9 },   // orc — was 0x3f8f3f
  { color: 0xb7c5a3, r: 12 },  // troll — was 0x5f7d33
]

// Numeric tint for an element, used both as placeholder rect fill and as the
// setTint() color once real sprites land (ez-ctf convention: neutral-grey art
// + one whole-sprite tint, not baked-in recolors).
export function elementTint(element) {
  return ELEMENT_COLORS[element] ?? 0x999999
}

// --- Touch control palette (2026-08-22) ---------------------------------
// These were hard-coded literals in GameScene and were never brought under
// test/themeContrast.test.js, so they were the only UI drawn on the ground
// that nobody had measured. The design review found the idle stick ring at
// 1.38:1 and the idle knob at 2.54:1 against the courtyard band — the sticks
// were effectively invisible on the ground they sit on, and a player had to
// remember where they were.
//
// Kept as a named group so the contrast gate covers them the same way it
// covers structures and enemies. TOUCH_ON_ACTIVE_TEXT is the label colour
// used ON TOP of TOUCH_ACTIVE, not against the ground, so it is measured
// against that fill rather than the map.
export const TOUCH_CONTROL_COLORS = {
  plate:  0x080d14,   // stick ring / button fill
  edge:   0xb4c9e0,   // ring and button outline
  knob:   0xe8f2ff,   // idle knob
  active: 0x8affc0,   // engaged / firing / held
}
// Dark, because TOUCH_CONTROL_COLORS.active is a BRIGHT fill — it has to be,
// to clear 3:1 against the ground it is drawn on. A pale label on it was the
// original bug (1.32:1).
export const TOUCH_ON_ACTIVE_TEXT = '#06130c'
export const TOUCH_LABEL_TEXT = '#e8f2ff'

// --- Placement ghost (2026-08-23) ---------------------------------------
// The build-phase valid/invalid ghost predates every contrast fix in this
// project. Measured against the real ground: valid 0x54c07a was 2.58:1,
// invalid 0xd15a5a was 1.49:1 -- failing WORSE than the 1.38:1 idle stick
// ring that started the whole contrast workstream -- and the two were
// 1.73:1 against EACH OTHER, i.e. effectively colour-only on the single most
// decision-critical pair of colours in the build phase. Solved numerically
// against test/helpers/decodeRgbPng.js for the lowest-lightness tone that
// still clears 3:1 against all three ground bands. Both land near the same
// lightness (~0.5-0.76): the ground is warm and mid-value, so any hue needs
// real lightness to clear 3:1, which is WHY the two read close together and
// why colour alone is not relied on below.
//
// Colour alone is still not relied on: _drawPlacementGhost pairs VALID with a
// solid outline and INVALID with a heavier DASHED outline plus a small X at
// the footprint centre, so the distinction survives colour blindness too.
export const PLACEMENT_GHOST_COLORS = {
  valid:   0x64d22d,
  invalid: 0xedab97,
}

// --- Panel backgrounds and in-panel state colours (2026-08-23) -----------
// The contrast gate only ever checked colours drawn DIRECTLY on the ground,
// and only at full opacity. Everything below sits on a semi-transparent
// panel instead (the fusion prompt, the sell card, the ability bar), and
// several are themselves drawn translucent — the gate could not see any of
// it, and this session found the SAME class of bug it exists to catch: a
// contrast check that measures a token at full opacity while the shipped
// pixel is 0.55-0.9 alpha reports a false pass (test/themeContrast.test.js
// caught this for TOUCH_CONTROL_COLORS on 2026-08-23; these were never
// checked at all). All alpha values here are the ACTUAL draw alpha from
// GameScene.js, kept in sync by hand — see that file's fillStyle/lineStyle
// calls for the panel this token belongs to.
export const PANEL_BG = {
  fusion: { color: 0x0d1420, alpha: 0.85 },
  sellCard: { color: 0x0d1420, alpha: 0.94 },
  abilityBar: { color: 0x16202c, alpha: 0.85 },
}
// Colours below were re-solved 2026-08-23 against the panel they ACTUALLY
// draw on (composited over the ground, since every panel here is itself
// translucent), at their real draw alpha, with a real safety margin
// (>=3.15:1, not the bare 3.0 minimum). The ORIGINAL literals were picked by
// eye before the gate could see them at all and several failed once checked
// properly: accept was 2.89:1, reject/sell/cooling were worse.
export const FUSION_BUTTON_COLORS = {
  accept:      { color: 0x6caf4b, alpha: 0.9 },   // was 0x2f7d4f (2.89:1)
  reject:      { color: 0xcf4b17, alpha: 0.9 },   // was 0x8a2f2f
  dirActive:   { color: 0x54c07a, alpha: 0.9 },
  // Re-hued from 0x2f4b6e (1.37:1, essentially invisible) to a lighter
  // blue-grey at the same alpha -- kept dim relative to dirActive, but now
  // actually readable as a button before it is chosen.
  dirInactive: { color: 0x96b5c0, alpha: 0.55 },   // was 0x2f4b6e (1.37:1)
}
export const ABILITY_STATE_COLORS = {
  ready:    { color: 0x8affc0, alpha: 0.9 },
  charging: { color: 0xffd27a, alpha: 0.9 },
  // A blue-grey hue at 0x4a6b8a could not clear 3:1 on this panel at ANY
  // alpha (2.60:1 even fully opaque) -- the hue itself was the problem, not
  // just the 0.55 dimming alpha. Re-hued lighter/cooler; still the dimmest
  // of the three states (alpha 0.6) so it keeps reading as "less prominent"
  // than ready/charging.
  cooling:  { color: 0x98acb3, alpha: 0.6 },      // was 0x4a6b8a (2.60:1 even at alpha 1)
}
export const SELL_CARD_BUTTON_COLORS = {
  sell:      { color: 0xd42811, alpha: 0.95 },    // was 0x8a2f2f (2.03:1)
  // Re-hued from 0x22303f (1.29:1 -- did not read as a control at all, just
  // blended into the card). PERMANENT specifically needed this; close reuses
  // the same tone now for consistency (it also passed before, at 0x22303f).
  permanent: { color: 0x5e7073, alpha: 0.95 },     // was 0x22303f (1.29:1)
  close:     { color: 0x5e7073, alpha: 0.95 },
}
