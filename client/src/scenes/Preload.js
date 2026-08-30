// Phase 7: art-loading scene, ported from ez-ctf's Preload/classArt pattern
// (C:\dev\ez-ctf\client\src\scenes\Preload.js, classArt.js). Loads whatever is
// listed in client/src/assets/manifest.js — empty today, so this scene loads
// nothing and starts GameScene immediately. Filling the manifest with real
// PNG+JSON atlases is the only change needed to bring sprites online; the
// render helper (client/src/render/sprites.js) falls back to placeholder
// shapes for any texture key that isn't loaded.

import Phaser from 'phaser'
import { ATLASES, IMAGES } from '../assets/manifest.js'

// Character states (art spec's animation contract) plus the structure states
// the animation controller resolves (render/AnimationController.js:
// idle/telegraph/active/recovery/charged). Looping states are the ones a
// structure can sit in indefinitely; telegraph/active/recovery are bounded by
// the server's own phase deadlines, so they play once and hold.
const ANIM_RATE   = { idle: 5, run: 9, cast: 10, hurt: 6, death: 6, telegraph: 8, active: 12, recovery: 6, charged: 6, flight: 10, impact: 10, dissipation: 8 }
const ANIM_REPEAT = { idle: -1, run: -1, cast: 0, hurt: 0, death: 0, telegraph: -1, active: 0, recovery: 0, charged: -1, flight: -1, impact: 0, dissipation: 0 }
// Direction is optional: heroes are authored 4-directional
// (`run_down_0.png`), structures are mostly undirected (`active_0.png`) and
// only the direction-locked ones (Water Geyser / Wind Vortex) carry a cardinal.
const FRAME_RE    = /^([a-z]+)(?:_(down|up|right|left|[NESW]))?_(\d+)\.png$/

// Scans an already-loaded atlas's own frame names and builds
// `${atlasKey}_${anim}_${dir}` Phaser animations — avoids hand-writing every
// anim def and stays correct if frame counts change.
export function buildAnimsForAtlas(scene, atlasKey) {
  const tex = scene.textures.get(atlasKey)
  const groups = new Map() // `${anim}_${dir}` -> [{idx, frame}]
  for (const n of tex.getFrameNames()) {
    const m = FRAME_RE.exec(n)
    if (!m) continue
    const key = m[2] ? `${m[1]}_${m[2]}` : m[1]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ idx: Number(m[3]), frame: n })
  }
  for (const [key, frames] of groups) {
    frames.sort((a, b) => a.idx - b.idx)
    const anim = key.split('_')[0]
    scene.anims.create({
      key: `${atlasKey}_${key}`,
      frames: frames.map(f => ({ key: atlasKey, frame: f.frame })),
      frameRate: ANIM_RATE[anim] ?? 6,
      repeat: ANIM_REPEAT[anim] ?? -1,
    })
  }
}

export default class Preload extends Phaser.Scene {
  constructor() { super('Preload') }

  preload() {
    this._failedKeys = new Set()
    this.load.on('loaderror', (file) => this._failedKeys.add(file.key))
    for (const { key, png, json } of ATLASES) this.load.atlas(key, png, json)
    for (const { key, png } of IMAGES) this.load.image(key, png)
  }

  create() {
    for (const { key } of ATLASES) {
      if (this._failedKeys.has(key)) continue
      buildAnimsForAtlas(this, key)
    }
    if (typeof window !== 'undefined') window.__assetLoadFailures = [...this._failedKeys]
    this.scene.start('GameScene')
  }
}
