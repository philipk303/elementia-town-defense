// Sprite-with-fallback render helper (Phase 7). Real art drops in via
// client/src/assets/manifest.js with no other code change: if a texture key
// is loaded, render a sprite (element identity comes from WHICH atlas key —
// spec §6's 4 baked chibi variants — leaving setTint() free for per-frame
// status color, applied by callers via styleable()'s Sprite branch below);
// otherwise fall back to today's placeholder shape (colored circle/rect).
//
// Returns the created game object either way, so callers can .setPosition()/
// .destroy() it identically regardless of which path was taken. Fallback
// shapes (Phaser.GameObjects.Arc/Rectangle) support setStrokeStyle/setRadius/
// setFillStyle; Sprites don't — per-frame styling call sites use styleable()
// below to skip those calls once real art is active, with zero behavior
// change while the manifest stays empty (fallback is always taken).
export function entitySprite(scene, key, x, y, fallback) {
  if (key && scene.textures.exists(key)) return scene.add.sprite(x, y, key)
  return fallback()
}

// Duck-types whether a render object supports shape-styling methods
// (placeholder Arc/Rectangle) vs. being a real Sprite (art-backed).
export function styleable(obj) {
  return typeof obj.setStrokeStyle === 'function'
}

// Quantizes an aim vector to the same 4-way facing CharacterAnimator uses
// (render/AnimationController.js's `this.dir = ...` update logic) and
// returns the Phaser rotation (radians) that turns an actor-facing-right-
// authored sprite (e.g. fire_saber_extension) to face it: right=0,
// down=+90° (Phaser's +y is down, so clockwise), left=180°, up=-90°.
export function aimRotation(aimX, aimY) {
  const dir = Math.abs(aimX) > Math.abs(aimY) ? (aimX > 0 ? 'right' : 'left') : (aimY > 0 ? 'down' : 'up')
  return { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir]
}
