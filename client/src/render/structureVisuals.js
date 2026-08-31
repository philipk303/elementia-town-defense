// How a structure's ART is fitted to its GAMEPLAY footprint.
//
// Gameplay footprints stay authoritative: this never changes what a structure
// occupies, only how its picture is drawn over that rectangle.
//
// WHY THIS EXISTS. The renderer used to call setDisplaySize(footprintW,
// footprintH) directly, which does not preserve aspect ratio, so any art
// authored taller than its footprint was vertically crushed:
//
//   WATCHTOWER    48x64 art -> 28x28 box   (+33% skew)
//   FIRE_SPECIAL  96x64 art -> 60x28 box   (+43% skew)
//   WATER_SPECIAL 64x64 art -> 60x28 box  (+114% skew)
//
// The Geyser was drawn at under half its authored height. A previous fix
// force-returned `height: 64` for its ACTIVE state only, which corrected the
// one state someone happened to look at and left idle crushed; that special
// case is gone, replaced by the general rule below.
//
// THE RULE: scale uniformly so the art fills the footprint's WIDTH, then pin
// the art's ground line to the footprint's BOTTOM edge. Extra height therefore
// grows upward (a tower rises out of its tile) and never downward into the
// tile in front, which is what a top-down view needs to read correctly.

// Row, in ART pixels from the top of the frame, that sits on the ground.
// Only needed where a frame reserves empty headroom that is NOT part of the
// building — otherwise the frame's own bottom edge is the ground line.
//
// Both entries here are the same authoring convention: a 2x1 structure drawn
// on a 64x64 canvas, where the bottom 8 rows are empty and the headroom above
// is reserved for the animated state. Measured from the shipped art:
//   water_geyser  idle content y=27..56, plume fills the space above
//   wind_vortex   idle content y= 9..56, column fills the space above
// 56 is the ground line in both. Without it the empty frame bottom would be
// pinned instead and the structure would float ~8px above its own tile.
//
// TODO: the other frames carry 4-7px of ordinary padding below their content
// (firepit 57/64, rock trap 28/32, farm 26/32) which floats them by 4px or
// less. The durable fix is to measure content bottoms in the art pipeline and
// publish them in art/assets-manifest.json — which already has a `baseline_y`
// field for exactly this, populated for some assets and stale for others (it
// says 32 for the geyser, from an earlier 64x32 version of that art) — rather
// than growing this hand-maintained table.
const BASELINE_Y = { WATER_SPECIAL: 56, WIND_SPECIAL: 56 }

/**
 * @param {string} type            structure runtime type
 * @param {number} footprintWidth  drawable width of the footprint, px
 * @param {number} footprintHeight drawable height of the footprint, px
 * @param {number} [artWidth]      native frame width, px (omit for fallback shapes)
 * @param {number} [artHeight]     native frame height, px
 * @returns {{width:number, height:number, offsetY:number}} offsetY is added to
 *   the footprint's CENTRE y, since sprites here keep Phaser's centred origin.
 */
export function structureDisplayRect(type, footprintWidth, footprintHeight, artWidth, artHeight) {
  // No art (placeholder rectangle, or a texture with no frame): the footprint
  // rectangle IS the picture, so there is nothing to preserve.
  if (!artWidth || !artHeight) {
    return { width: footprintWidth, height: footprintHeight, offsetY: 0 }
  }
  const scale  = footprintWidth / artWidth
  const height = artHeight * scale
  // Distance from the art's top edge down to its ground line, after scaling.
  const baseline = (BASELINE_Y[type] ?? artHeight) * scale
  // Place the sprite's centre so that ground line lands on the footprint's
  // bottom edge:  centre - height/2 + baseline === footprintHeight/2
  const offsetY = footprintHeight / 2 + height / 2 - baseline
  return { width: footprintWidth, height, offsetY }
}
