// Computes the on-sheet rectangle for each element's idle portrait, so the
// DOM character-select screen (main.js) can slice the shipped chibi_* sheets
// in CSS -- same technique as buildThumbnails.js for the build palette, but
// fetches the atlas JSON directly instead of going through Phaser's texture
// manager. That decoupling matters here: character select must be usable the
// instant ROOM_JOINED arrives, before Preload has necessarily finished
// loading into Phaser.
import { ELEMENT_ATLAS_KEY, ATLASES } from '../assets/manifest.js'
import { CONTENT_BOX } from './contentBoxes.js'
import { pickIdleFrame } from './buildThumbnails.js'

const PNG_BY_KEY = new Map(ATLASES.map(e => [e.key, e.png]))
const JSON_BY_KEY = new Map(ATLASES.map(e => [e.key, e.json]))

// Largest on-screen dimension a card portrait is allowed to reach.
const CARD_ART_MAX_PX = 96

export async function computeElementThumbnails() {
  const out = new Map()
  await Promise.all(Object.entries(ELEMENT_ATLAS_KEY).map(async ([element, key]) => {
    const box = CONTENT_BOX[key]
    const png = PNG_BY_KEY.get(key)
    const json = JSON_BY_KEY.get(key)
    if (!box || !png || !json) return
    let atlas
    try {
      const res = await fetch(json)
      if (!res.ok) return
      atlas = await res.json()
    } catch {
      return // offline/asset-missing: card falls back to no art, not a crash
    }
    const names = Object.keys(atlas.frames || {})
    const frameName = pickIdleFrame(names)
    const frame = frameName && atlas.frames[frameName]?.frame
    if (!frame) return
    const scale = CARD_ART_MAX_PX / Math.max(box.w, box.h)
    out.set(element, {
      src: png,
      w: Math.round(box.w * scale),
      h: Math.round(box.h * scale),
      bgW: atlas.meta.size.w * scale,
      bgH: atlas.meta.size.h * scale,
      bgX: (frame.x + box.x) * scale,
      bgY: (frame.y + box.y) * scale,
    })
  }))
  return out
}
