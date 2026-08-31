// How a structure's ART is fitted to its GAMEPLAY footprint.
//
// Gameplay footprints stay authoritative: this never changes what a structure
// occupies, only how its picture is drawn over that rectangle.
//
// TWO DEFECTS THIS FIXES.
//
// 1. Aspect crush. The renderer used to call setDisplaySize(footprintW,
//    footprintH), which does not preserve aspect ratio, so art authored taller
//    than its footprint was vertically squashed — Watchtower by 33%, Firepit
//    43%, Water Geyser 114% (drawn at under half its authored height).
//
// 2. Authored margin rendered as blank tile. Structure art carries 3-31% of
//    empty pixels inside its frame. Fitting the FRAME to the footprint draws
//    that margin as empty ground, so the building reads smaller than the tiles
//    it owns — farm filled 69% of its width, hall 78%, watchtower 81%.
//
// THE RULE: scale uniformly so the art's VISIBLE CONTENT fills the footprint's
// width, then pin the content's bottom edge to the footprint's bottom edge.
// Aspect is therefore always preserved, margin never counts toward size, and
// extra height grows upward (a tower rises out of its tile) rather than down
// into the tile in front — which is what a top-down view needs to read right.
//
// Content boxes are MEASURED from the shipped art by
// tools/art/measure_content_boxes.mjs, not hand-maintained: an earlier version
// of this file carried a hand-written BASELINE_Y table, which is exactly the
// kind of table that silently drifts from the art it describes.

import { STRUCTURE_CONTENT_BOX } from './structureContentBoxes.js'

/**
 * @param {string} artKey          texture key, e.g. structureArtKey(type) or 'hall'
 * @param {number} footprintWidth  drawable width of the footprint, px
 * @param {number} footprintHeight drawable height of the footprint, px
 * @param {number} [artWidth]      native frame width, px (omit for fallback shapes)
 * @param {number} [artHeight]     native frame height, px
 * @returns {{width:number, height:number, offsetY:number}} width/height are for
 *   the WHOLE frame (what setDisplaySize takes); offsetY is added to the
 *   footprint's CENTRE y, since these sprites keep Phaser's centred origin.
 */
export function structureDisplayRect(artKey, footprintWidth, footprintHeight, artWidth, artHeight) {
  // No art (placeholder rectangle, or a texture with no frame): the footprint
  // rectangle IS the picture, so there is nothing to fit.
  if (!artWidth || !artHeight) {
    return { width: footprintWidth, height: footprintHeight, offsetY: 0 }
  }
  // Unmeasured art falls back to treating the whole frame as content, which is
  // the aspect-correct fit and never the old crush.
  const box = STRUCTURE_CONTENT_BOX[artKey] ?? { x: 0, y: 0, w: artWidth, h: artHeight }
  // Guard against a box measured against a different-sized frame (art replaced
  // without re-running the measure script): fall back rather than mis-scale.
  const usable = box.w > 0 && box.h > 0 && box.x + box.w <= artWidth && box.y + box.h <= artHeight
  const content = usable ? box : { x: 0, y: 0, w: artWidth, h: artHeight }

  const scale  = footprintWidth / content.w
  const width  = artWidth * scale
  const height = artHeight * scale
  // Distance from the frame's top edge down to the content's bottom edge —
  // the structure's ground line — after scaling.
  const baseline = (content.y + content.h) * scale
  // Place the sprite's centre so that ground line lands on the footprint's
  // bottom edge:  centre - height/2 + baseline === footprintHeight/2
  const offsetY = footprintHeight / 2 + height / 2 - baseline
  return { width, height, offsetY }
}
