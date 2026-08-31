// How an ACTOR's art (players, enemies) is sized against its gameplay body.
//
// WHY THIS EXISTS. Actor sprites rendered at NATIVE pixel size — nothing ever
// related the art to the collision circle the server actually simulates. The
// art was authored at unrelated sizes, so two things were wrong on screen
// (measured 2026-08-30, art content width vs gameplay diameter 2r):
//
//   goblin 22px / 14   orc 23px / 18   troll 25px / 24
//   -> radii 7/9/12 are a 1.7x spread, drawn as a 1.14x spread. A troll
//      looked barely bigger than a goblin despite being a far bigger threat.
//
//   earth 43px   fire 38px   wind 33px   water 25px   — all for ONE 28px body
//   -> the four elements are identical in gameplay but Earth drew 1.7x the
//      width of Water.
//
// Now every actor's visible content is scaled to the same multiple of its own
// gameplay diameter, so size means the same thing everywhere: bigger sprite =
// bigger body = bigger threat.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not touch PLAYER_RADIUS or
// ENEMY_BASE[].r. Those are collision/balance constants the server simulates
// against; the whole point is to make the ART agree with them, never the
// reverse.

import { CONTENT_BOX } from './contentBoxes.js'

// How wide an actor's art reads relative to its gameplay body.
//
// 1.3 is deliberate, not arbitrary: it is close to the average ratio the art
// already happened to have (enemies averaged 1.30, players 1.24), so overall
// scale on screen is roughly PRESERVED and this change reads as consistency
// and correct ordering rather than as "everything suddenly got bigger".
//
// Slightly above 1.0 because a body that renders exactly its collision circle
// looks undersized, and comfortably below 1.5 because the further art gets
// from its hitbox the more often an attack LOOKS like it connects and misses.
// This is the single dial: raising it enlarges every actor consistently.
export const ACTOR_VISUAL_SCALE = 1.3

/**
 * Scale factor to pass to Phaser's setScale for an actor sprite.
 *
 * @param {string} artKey            texture key ('goblin', 'chibi_fire', ...)
 * @param {number} gameplayDiameter  2 * the actor's collision radius, px
 * @returns {number} 1 when the art is unmeasured, so an unknown sprite renders
 *   exactly as it does today rather than vanishing or exploding.
 */
export function actorDisplayScale(artKey, gameplayDiameter) {
  const box = CONTENT_BOX[artKey]
  if (!box || !(box.w > 0) || !(gameplayDiameter > 0)) return 1
  return (ACTOR_VISUAL_SCALE * gameplayDiameter) / box.w
}
