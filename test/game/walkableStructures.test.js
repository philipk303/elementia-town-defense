// Walkable structures (combat-structure-redesign Amendment A3.1 / A5 step 1).
//
// Every structure placed before this phase pushed an HP band onto the cost
// field, so "walkable" did not exist: a Snare Post shaped routes exactly like a
// Barricade. These tests pin the two halves of the new property —
//   (1) a walkable structure is invisible to the cost field, and
//   (2) an enemy standing on one can still attack it
// — the second of which is load-bearing under Amendment A1.1: enemy destruction
// is the only removal path for a permanent fusion, and the only enemy→structure
// damage paths in enemies.js are gated on a wall band a walkable structure does
// not have.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeStructure, isWalkable } from '../../server/game/structures.js'
import { CostField, BAND_NONE, hpToBand } from '../../server/game/costField.js'
import { EnemyStore, tickEnemies } from '../../server/game/enemies.js'
import { ENEMY_TYPE } from '../../server/game/enemyTypes.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { BALANCE } from '../../shared/balance.js'
import { tileIdx, tileToWorldX, tileToWorldY, worldToTileX, worldToTileY, TILE_SIZE } from '../../server/game/grid.js'
import { CONFIG, STRUCTURE_TYPES } from '../../shared/constants.js'

function makeState() {
  const hallGx = CONFIG.HALL.gx, hallGy = CONFIG.HALL.gy
  const costField = new CostField()
  costField.setHall(hallGx, hallGy)
  costField.compute()
  return {
    phase: PHASES.BUILD,
    hall: {
      gx: hallGx, gy: hallGy, w: CONFIG.HALL.w, h: CONFIG.HALL.h,
      x: tileToWorldX(hallGx) + CONFIG.HALL.w / 2 * 32 - 16,
      y: tileToWorldY(hallGy),
      hp: BALANCE.HALL_HP, maxHp: BALANCE.HALL_HP,
    },
    players: [
      { id: 'p0', element: 'EARTH', isBot: false, gold: 9999 },
      { id: 'p1', element: 'FIRE',  isBot: true },
      { id: 'p2', element: 'WATER', isBot: true },
      { id: 'p3', element: 'WIND',  isBot: true },
    ],
    structures: [],
    placedVersion: 0,
    costField,
  }
}

// Sim-side state: like enemies.test.js's makeSimState, except it honours
// isWalkable — a walkable structure is deliberately NOT banded, which is the
// whole condition under test.
function makeSimState({ structures = [], players = [], hallGx = 19, hallGy = 19 } = {}) {
  const cf = new CostField()
  cf.setHall(hallGx, hallGy)
  for (const s of structures) {
    if (!isWalkable(s.type)) cf.setWallBand(s.gx, s.gy, hpToBand(s.hp, s.maxHp))
  }
  cf.compute()
  return {
    enemyStore: new EnemyStore(),
    costField: cf,
    structures,
    players,
    hall: {
      gx: hallGx, gy: hallGy, w: 2, h: 2,
      x: (hallGx + 1) * TILE_SIZE, y: (hallGy + 1) * TILE_SIZE, hp: 1000, maxHp: 1000,
    },
    placedVersion: 0,
    livingEnemyCount: 0,
    waveBounty: 0,
  }
}

function structAt(type, gx, gy) {
  const cat = BALANCE.STRUCTURES[type]
  return { id: 1, type, ownerId: 'p0', gx, gy, w: 1, h: 1, hp: cat.hp, maxHp: cat.hp }
}

// tileToWorld* already returns the tile CENTRE — no half-tile offset here.
// `dy` nudges the body within its tile: hall melee is edge-distance <= 6 px +
// radius, so a tile centre is not automatically in contact with the hall.
function spawnAtTile(store, spec, gx, gy, dy = 0) {
  return store.spawn({ ...spec, x: tileToWorldX(gx), y: tileToWorldY(gy) + dy }, 0)
}

test('placing a walkable structure leaves its tile unbanded on the cost field', () => {
  const s = makeState()
  const res = placeStructure(s, s.players[0], STRUCTURE_TYPES.SNARE_POST, 5, 5, 1000)
  assert.equal(res.ok, true)
  assert.equal(s.costField.wallBand[tileIdx(5, 5)], BAND_NONE)
})

// --- the load-bearing rule (Amendment A1.1 / A3.1) --------------------------
//
// The only enemy→structure damage paths in enemies.js are gated on
// `wallBand !== BAND_NONE` — the march-bulldoze and the chase-blocked bash. A
// walkable structure has no band, so before this rule NOTHING could attack one.
// With fusions permanent and enemy-destroyable-only, that made them immortal.

test('an enemy standing on a walkable structure attacks it', () => {
  const post = structAt(STRUCTURE_TYPES.SNARE_POST, 5, 5)
  const st = makeSimState({ structures: [post] })
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.GOBLIN, elite: false }, 5, 5)

  tickEnemies(st, 0, 16.67)

  assert.ok(post.hp < post.maxHp, 'the structure underfoot took damage')
})

// Priority guard. This one pins the ORDER rather than new behavior: the
// walkable branch sets attackStruct only, and melee resolution keeps
// player > hall > structure. Putting the new branch above the hall would let an
// enemy chew a Snare Post while standing on the hall's doorstep.
test('the hall still outranks a walkable structure underfoot', () => {
  const post = structAt(STRUCTURE_TYPES.SNARE_POST, 19, 18)  // ring tile, hall at 19,19
  const st = makeSimState({ structures: [post] })
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.GOBLIN, elite: false }, 19, 18, 12)

  tickEnemies(st, 0, 16.67)

  assert.ok(st.hall.hp < 1000, 'the hall took the hit')
  assert.equal(post.hp, post.maxHp, 'the structure underfoot was not attacked instead')
})

// The anti-stall property, and the reason the new branch does not touch
// steering: a walkable structure must never become a stopping point the way a
// wall does. The enemy chews it in passing and keeps marching.
test('a walkable structure does not stall the march across it', () => {
  const post = structAt(STRUCTURE_TYPES.SNARE_POST, 5, 5)
  const st = makeSimState({ structures: [post] })
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.GOBLIN, elite: false }, 5, 5)

  for (let t = 0; t < 90; t++) tickEnemies(st, t * 16.67, 16.67)

  const gx = worldToTileX(st.enemyStore.x[0]), gy = worldToTileY(st.enemyStore.y[0])
  assert.ok(gx !== 5 || gy !== 5, 'the enemy walked off the structure instead of camping on it')
})

test('a walkable structure can be destroyed and leaves no band behind', () => {
  const post = structAt(STRUCTURE_TYPES.SNARE_POST, 5, 5)
  const st = makeSimState({ structures: [post] })
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.TROLL, elite: false }, 5, 5)

  for (let t = 0; t < 400 && st.structures.length > 0; t++) tickEnemies(st, t * 200, 16.67)

  assert.equal(st.structures.length, 0, 'the structure was destroyed by enemy damage')
  assert.equal(st.costField.wallBand[tileIdx(5, 5)], BAND_NONE)
})

// Regression (found by the A5 step-2 sim, not by a unit test): tileStruct is
// built ONCE at the top of the tick, but destroyStructure splices
// state.structures mid-loop — so by the time a later enemy reads its index, the
// index can be out of range or point at a DIFFERENT structure. The first cut of
// the walkable branch dereferenced it blind and crashed the match.
test('a walkable structure destroyed mid-tick does not corrupt later enemies', () => {
  const a = { ...structAt(STRUCTURE_TYPES.SNARE_POST, 5, 5), id: 1 }
  const b = { ...structAt(STRUCTURE_TYPES.SNARE_POST, 7, 5), id: 2 }
  a.hp = 1                                     // dies on the first hit
  const st = makeSimState({ structures: [a, b] })
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.TROLL, elite: false }, 5, 5)
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.TROLL, elite: false }, 7, 5)

  tickEnemies(st, 0, 16.67)                    // must not throw

  assert.equal(st.structures.length, 1, 'the 1-hp structure died')
  assert.equal(st.structures[0].id, 2, 'the survivor is the one that was not attacked to death')
  assert.equal(st.structures[0].hp, st.structures[0].maxHp,
    'the survivor was NOT hit through a stale index pointing at the wrong structure')

  // The stale index costs the second enemy one tick of damage — the same benign
  // miss the wall-bulldoze path already takes when its index falls out of range.
  // What matters is that it recovers on the next tick rather than making the
  // structure permanently unattackable.
  tickEnemies(st, 2000, 16.67)
  assert.ok(st.structures[0].hp < st.structures[0].maxHp, 'it is attacked again once the index is rebuilt')
})
