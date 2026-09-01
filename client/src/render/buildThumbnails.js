// Computes the on-sheet rectangle for each buildable's idle-pose art, once
// per scene, so the DOM build palette can slice the shipped sheets in CSS —
// see docs/plans/2026-08-30-playtest-ui-specs.md §2. No build step, no new
// asset files: this reads Phaser's texture manager (already loaded by the
// time GameScene creates the palette) plus the generated CONTENT_BOX table.
//
// Deliberately Phaser-only on this side of the boundary. buildPalette.js
// stays DOM-and-plain-numbers, per its own header comment, so this module
// hands it a Map of plain rects rather than exporting anything Phaser-shaped.
import { BUILDABLE_TYPES } from '../../../shared/constants.js'
import { structureArtKey, ATLASES, IMAGES } from '../assets/manifest.js'
import { CONTENT_BOX } from './contentBoxes.js'

const PNG_BY_KEY = new Map([...ATLASES, ...IMAGES].map(e => [e.key, e.png]))

// First frame whose name starts with 'idle', preferring an 'idle_S*' variant
// when one exists so directional structures face the viewer instead of away.
// Same resting-pose rule measure_content_boxes.mjs applies for the same
// reason: an active/telegraph frame sizes a structure by its loudest moment.
function pickIdleFrame(names) {
  const idle = names.filter(n => /^idle/.test(n))
  return idle.find(n => /^idle_S/.test(n)) || idle[0] || null
}

// Largest on-screen dimension a thumbnail is allowed to reach. Comfortably
// under the button's 44px floor so text below it still fits.
const THUMB_MAX_PX = 40

export function computeThumbnails(scene) {
  const out = new Map()
  for (const type of BUILDABLE_TYPES) {
    const key = structureArtKey(type)
    const box = CONTENT_BOX[key]
    const png = PNG_BY_KEY.get(key)
    if (!box || !png || !scene.textures.exists(key)) continue
    const texture = scene.textures.get(key)
    const frameNames = texture.getFrameNames()
    let cutX = 0
    let cutY = 0
    if (frameNames.length) {
      const frameName = pickIdleFrame(frameNames)
      if (!frameName) continue
      const frame = texture.get(frameName)
      cutX = frame.cutX
      cutY = frame.cutY
    }
    const source = texture.source[0]
    const scale = THUMB_MAX_PX / Math.max(box.w, box.h)
    out.set(type, {
      src: png,
      w: Math.round(box.w * scale),
      h: Math.round(box.h * scale),
      bgW: source.width * scale,
      bgH: source.height * scale,
      bgX: (cutX + box.x) * scale,
      bgY: (cutY + box.y) * scale,
    })
  }
  return out
}
