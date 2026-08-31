import { test } from 'node:test'
import assert from 'node:assert/strict'

import { actorDisplayScale, ACTOR_VISUAL_SCALE } from '../../client/src/render/actorVisuals.js'
import { CONTENT_BOX } from '../../client/src/render/contentBoxes.js'

// Gameplay bodies these actors are simulated with. Mirrors ENEMY_BASE[].r in
// client/src/theme.js and CONFIG.PLAYER_RADIUS in shared/constants.js — if
// either moves, these numbers should move with them.
const ENEMY_DIAMETER  = { goblin: 14, orc: 18, troll: 24 }
const PLAYER_DIAMETER = 28
const PLAYERS = ['chibi_earth', 'chibi_fire', 'chibi_water', 'chibi_wind']

// What the art actually measures on screen once scaled.
const drawnWidth = (key, diameter) => CONTENT_BOX[key].w * actorDisplayScale(key, diameter)

test('unmeasured or invalid art renders exactly as before, at scale 1', () => {
  assert.equal(actorDisplayScale('not_a_real_key', 28), 1)
  assert.equal(actorDisplayScale('goblin', 0), 1)
  assert.equal(actorDisplayScale(undefined, 28), 1)
})

test('every actor draws at the same multiple of its own gameplay body', () => {
  for (const [key, d] of Object.entries(ENEMY_DIAMETER)) {
    assert.ok(Math.abs(drawnWidth(key, d) - ACTOR_VISUAL_SCALE * d) < 1e-9, key)
  }
  for (const key of PLAYERS) {
    assert.ok(Math.abs(drawnWidth(key, PLAYER_DIAMETER) - ACTOR_VISUAL_SCALE * PLAYER_DIAMETER) < 1e-9, key)
  }
})

test('enemy size ordering matches threat, instead of being flattened', () => {
  const g = drawnWidth('goblin', ENEMY_DIAMETER.goblin)
  const o = drawnWidth('orc',    ENEMY_DIAMETER.orc)
  const t = drawnWidth('troll',  ENEMY_DIAMETER.troll)
  assert.ok(g < o && o < t, 'goblin < orc < troll on screen')

  // The defect: at native scale these drew 22/23/25px — a 1.14x spread for a
  // 1.7x spread in gameplay body, so a troll looked barely bigger than a
  // goblin. The drawn spread must now match the gameplay spread.
  const drawnSpread    = t / g
  const gameplaySpread = ENEMY_DIAMETER.troll / ENEMY_DIAMETER.goblin
  assert.ok(Math.abs(drawnSpread - gameplaySpread) < 1e-9)
  assert.ok(drawnSpread > 1.5, 'sanity: the spread is visible, not the old 1.14x')
})

test('all four elements draw at one size, since they share one body', () => {
  const widths = PLAYERS.map(k => drawnWidth(k, PLAYER_DIAMETER))
  for (const w of widths) assert.ok(Math.abs(w - widths[0]) < 1e-9)

  // The defect: native idle content was 43/38/33/25px for one 28px body, so
  // Earth rendered ~1.7x the width of Water.
  const native = PLAYERS.map(k => CONTENT_BOX[k].w)
  assert.ok(Math.max(...native) / Math.min(...native) > 1.5, 'sanity: the art really is that uneven')
})

test('art reads a little larger than the body it collides with, but not wildly', () => {
  // Below 1.0 a body looks smaller than what it actually collides with; far
  // above it, attacks look like they connect and miss.
  assert.ok(ACTOR_VISUAL_SCALE > 1.0 && ACTOR_VISUAL_SCALE < 1.5)
})

test('overall on-screen scale is roughly preserved, not a global size jump', () => {
  // 1.3 was chosen near the ratio the art already averaged, so this change
  // reads as consistency rather than "everything suddenly grew". No actor
  // should move by more than half again its previous size.
  const before = { goblin: 22, orc: 23, troll: 25, chibi_earth: 43, chibi_fire: 38, chibi_water: 25, chibi_wind: 33 }
  for (const [key, was] of Object.entries(before)) {
    const d = ENEMY_DIAMETER[key] ?? PLAYER_DIAMETER
    const ratio = drawnWidth(key, d) / was
    assert.ok(ratio > 0.66 && ratio < 1.5, `${key} moved ${ratio.toFixed(2)}x, too far`)
  }
})
