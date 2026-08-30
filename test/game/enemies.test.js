import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tileIdx, tileToWorldX, tileToWorldY, worldToTileX, worldToTileY, TILE_SIZE, inBounds } from '../../server/game/grid.js'
import { CONFIG } from '../../shared/constants.js'
import { CostField, hpToBand } from '../../server/game/costField.js'
import { ENEMY_TYPE, WEIGHT, SPEED, FLAG } from '../../server/game/enemyTypes.js'
import { BALANCE } from '../../shared/balance.js'
import { applyBurn, applyRoot } from '../../server/game/status.js'
import { EnemyStore, tickEnemies, spawnDueEnemies } from '../../server/game/enemies.js'
import { buildSpawnSchedule } from '../../server/game/waves.js'

const { BASE, ELITE, SPEED_PX } = BALANCE.ENEMY

let sid = 0
function struct(gx, gy, type = 'BARRICADE', hp = 40) {
  return { id: sid++, type, ownerId: 'x', gx, gy, w: 1, h: 1, hp, maxHp: hp, dormant: false, createdAt: 0 }
}

function makeSimState({ structures = [], players = [], hallGx = 19, hallGy = 19 } = {}) {
  const cf = new CostField()
  cf.setHall(hallGx, hallGy)
  for (const s of structures) cf.setWallBand(s.gx, s.gy, hpToBand(s.hp, s.maxHp))
  cf.compute()
  return {
    enemyStore: new EnemyStore(),
    costField: cf,
    structures,
    players,
    hall: { gx: hallGx, gy: hallGy, w: 2, h: 2, x: (hallGx + 1) * TILE_SIZE, y: (hallGy + 1) * TILE_SIZE, hp: 1000, maxHp: 1000 },
    placedVersion: 0,
    livingEnemyCount: 0,
    waveBounty: 0,
  }
}

function spawnAtTile(store, spec, gx, gy) {
  return store.spawn({ ...spec, x: tileToWorldX(gx), y: tileToWorldY(gy) }, 0)
}

// --- store construction / spawn stats ----------------------------------------

test('spawning a base goblin sets tiers, hp, speed and radius from the catalog', () => {
  const s = new EnemyStore()
  const i = s.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false, x: 100, y: 100 }, 0)
  assert.equal(s.count, 1)
  assert.equal(s.type[i], ENEMY_TYPE.GOBLIN)
  assert.equal(s.elite[i], 0)
  assert.equal(s.weight[i], WEIGHT.LIGHT)
  assert.equal(s.speed[i], SPEED.FAST)
  assert.equal(s.hp[i], BASE[0].hp)
  assert.equal(s.maxHp[i], BASE[0].hp)
  assert.equal(s.moveSpeed[i], SPEED_PX[SPEED.FAST])
  assert.equal(s.radius[i], BASE[0].radius)
  assert.equal(s.flags[i] & FLAG.ELITE, 0)
  assert.ok(s.id[i] >= 0)
})

test('an elite troll gets weight-bumped tiers, boosted stats, and a capped radius', () => {
  const s = new EnemyStore()
  const i = s.spawn({ type: ENEMY_TYPE.TROLL, elite: true, x: 0, y: 0 }, 0)
  assert.equal(s.weight[i], WEIGHT.SUPER_HEAVY)     // heavy → super-heavy
  assert.equal(s.speed[i], SPEED.SLOW)
  assert.equal(s.hp[i], BASE[2].hp * ELITE.hpMult)
  assert.equal(s.bounty[i], BASE[2].bounty * ELITE.bountyMult)
  assert.ok(Math.abs(s.damage[i] - BASE[2].damage * ELITE.damageMult) < 1e-9)
  assert.ok(s.radius[i] <= ELITE.radiusCap, 'radius capped so a 1-tile corridor always passes')
  assert.equal(s.flags[i] & FLAG.ELITE, FLAG.ELITE)
})

test('elite goblin is super-fast (faster than a base goblin)', () => {
  const s = new EnemyStore()
  const i = s.spawn({ type: ENEMY_TYPE.GOBLIN, elite: true, x: 0, y: 0 }, 0)
  assert.equal(s.speed[i], SPEED.SUPER_FAST)
  assert.equal(s.moveSpeed[i], SPEED_PX[SPEED.SUPER_FAST])
})

test('unique ids increase across spawns; removeAt keeps the array dense', () => {
  const s = new EnemyStore()
  const a = s.spawn({ type: ENEMY_TYPE.GOBLIN, elite: false, x: 1, y: 1 }, 0)
  const b = s.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 2, y: 2 }, 0)
  const c = s.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 3, y: 3 }, 0)
  assert.equal(s.count, 3)
  const idB = s.id[b]
  s.removeAt(a)                       // swap-remove: last (c) fills slot a
  assert.equal(s.count, 2)
  const ids = new Set([s.id[0], s.id[1]])
  assert.ok(ids.has(idB), 'surviving enemies keep their identity after a swap-remove')
})

// --- flow-field movement -----------------------------------------------------

test('a marching enemy descends the cost field toward the hall', () => {
  const st = makeSimState()
  const i = spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.GOBLIN, elite: false }, 5, 5)
  const startCost = st.costField.cost[tileIdx(5, 5)]
  for (let t = 0; t < 90; t++) tickEnemies(st, t * 16.67, 16.67)
  const gx = worldToTileX(st.enemyStore.x[i]), gy = worldToTileY(st.enemyStore.y[i])
  assert.ok(st.costField.cost[tileIdx(gx, gy)] < startCost, 'enemy moved to a lower-cost (closer) tile')
})

// --- burn kills ------------------------------------------------------------

test('a lethal burn kills and removes the enemy, dropping the living count', () => {
  const st = makeSimState()
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.GOBLIN, elite: false }, 5, 5) // 12 hp
  applyBurn(st.enemyStore.status[0], 100, 1000)  // 100 dps
  tickEnemies(st, 0, 200)                          // 100*0.2 = 20 dmg > 12
  assert.equal(st.enemyStore.count, 0)
  assert.equal(st.livingEnemyCount, 0)
})

// --- root ⊥ displacement -----------------------------------------------------

test('a rooted enemy cannot march but is still moved by knockback', () => {
  const st = makeSimState()
  const i = spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.GOBLIN, elite: false }, 5, 5)
  applyRoot(st.enemyStore.status[i], 2000, SPEED.SLOW)
  st.enemyStore.kvx[i] = 600   // an existing knockback impulse
  const x0 = st.enemyStore.x[i]
  tickEnemies(st, 0, 16.67)
  assert.ok(st.enemyStore.x[i] > x0, 'knockback displaces a rooted enemy (root ⊥ displacement)')
})

// --- melee vs structure (bulldoze) ------------------------------------------

test('an enemy pressed against a wall on its cheapest path bulldozes it', () => {
  // Box the enemy's tile so every finite-cost downhill neighbor is a barricade;
  // the enemy has no open descent and must attack a wall (the bulldoze rule).
  const structures = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx || dy) structures.push(struct(5 + dx, 5 + dy))
  }
  const st = makeSimState({ structures })
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.ORC, elite: false }, 5, 5)
  const hpBefore = structures.reduce((a, s) => a + s.hp, 0)
  for (let t = 0; t < 120; t++) tickEnemies(st, t * 200, 200) // 200ms ticks clear the 900ms cd
  const hpAfter = st.structures.reduce((a, s) => a + s.hp, 0)
  assert.ok(hpAfter < hpBefore, 'the boxed-in enemy damaged the surrounding walls')
})

test('bulldozing a blocking wall removes it and opens the path (field recomputes)', () => {
  // Box the enemy in a fully walled 1-tile cell (low hp). It must break out by
  // destroying a wall; once a wall is gone the recomputed field lets it descend.
  const structures = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx || dy) structures.push(struct(5 + dx, 5 + dy, 'BARRICADE', 8)) // 1-hit for an elite troll
  }
  const st = makeSimState({ structures })
  const i = spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.TROLL, elite: true }, 5, 5) // 30 dmg/hit
  const startCost = st.costField.cost[tileIdx(5, 5)]
  for (let t = 0; t < 300; t++) tickEnemies(st, t * 200, 200)
  assert.ok(st.structures.length < 8, 'at least one blocking wall was bulldozed and removed')
  const gx = worldToTileX(st.enemyStore.x[i]), gy = worldToTileY(st.enemyStore.y[i])
  assert.ok(st.costField.cost[tileIdx(gx, gy)] < startCost, 'enemy broke out and descended toward the hall')
})

test('a chase-mode enemy blocked by a wall bashes through it, not stalling (CP3 C1)', () => {
  // A player holding aggro across an intact 1-tile wall used to freeze the chaser
  // against the wall forever — only MARCH mode bulldozed, chase never did — while
  // safely meleeing it through the wall (player reach 34+14 > enemy reach 6+14
  // across a 40px tile). A blocked chaser must now attack the obstruction, the
  // structure analog of the unconditional attackHall rule.
  const wall = struct(10, 10, 'BARRICADE', 40)
  const player = { id: 'p1', x: tileToWorldX(11), y: tileToWorldY(10), alive: true, isBot: false }
  const st = makeSimState({ structures: [wall], players: [player] })
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.ORC, elite: false }, 9, 10) // left of the wall
  const hp0 = wall.hp
  for (let t = 0; t < 20; t++) tickEnemies(st, t * 200, 200) // within CHASE_CAP_MS (4000)
  assert.equal(st.enemyStore.aggro[0].state, 'chase', 'enemy is chasing the player across the wall')
  assert.ok(wall.hp < hp0, 'the chase-blocked enemy bashed the wall instead of stalling against it')
})

// --- melee vs hall (loss driver) --------------------------------------------

test('an enemy at the hall damages it on its attack cooldown', () => {
  const st = makeSimState()
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.ORC, elite: false }, 19, 18) // hall ring tile
  const hp0 = st.hall.hp
  for (let t = 0; t < 30; t++) tickEnemies(st, t * 100, 100)
  assert.ok(st.hall.hp < hp0, 'the hall takes damage from an adjacent enemy')
})

// The test above spawns on the ring tile's CENTRE, which is already inside
// melee reach. A marching enemy never arrives there: it enters the ring tile at
// the FAR edge and the cost field has nothing left to say — every ring tile is
// seeded at WALL_ENTRY_COST[BAND_NONE] = 0, so chooseStepDir finds no strictly
// lower neighbour and returns -1. That left the enemy with no move and no
// attack, ~30 px short of the hall AABB, inert forever: the hall-ring soft-lock
// (100% of stalled harness runs, 9% of maze A / 18% of maze B).
//
// The field is tile-resolution; the last sub-tile step to the goal is the
// caller's job.
test('a LONE enemy marching in from outside the ring closes on the hall', () => {
  const st = makeSimState()
  // Two tiles out, so it must descend into the ring under its own steering. No
  // crowd: a crowd hid this bug by shoving bodies into reach via separation.
  spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.ORC, elite: false }, 19, 17)
  const hp0 = st.hall.hp
  for (let t = 0; t < 120; t++) tickEnemies(st, t * 100, 100)
  assert.equal(st.enemyStore.count, 1, 'the enemy is still alive (nothing kills it here)')
  assert.ok(st.hall.hp < hp0, 'a lone marching enemy reaches the hall and attacks it')
})

// --- aggro integration -------------------------------------------------------

test('an enemy near a player chases it, steering away from the hall path', () => {
  // Enemy at (10,5); hall at (19,19) → downhill is +x. A player up-left within
  // proximity should pull the enemy the other way (-x).
  const ex = tileToWorldX(10), ey = tileToWorldY(5)
  const player = { id: 'p1', x: ex - 40, y: ey - 40, alive: true, isBot: false }
  const st = makeSimState({ players: [player] })
  const i = spawnAtTile(st.enemyStore, { type: ENEMY_TYPE.GOBLIN, elite: false }, 10, 5)
  const x0 = st.enemyStore.x[i]
  for (let t = 0; t < 20; t++) tickEnemies(st, t * 16.67, 16.67)
  assert.equal(st.enemyStore.aggro[i].state, 'chase')
  assert.ok(st.enemyStore.x[i] < x0, 'enemy moved toward the player, opposite the hall descent')
  assert.equal(st.enemyStore.flags[i] & FLAG.AGGRO, FLAG.AGGRO)
})

// --- the lane-gap shoulder wedge (Firepit maze-B soft-lock) -------------------
//
// MAX_COLLISION_RADIUS pins a 28px body against a 32px lane so "a 1-tile
// corridor always passes any enemy" — but only inside a 4px lateral window, and
// the cost field is tile-resolution, so nothing used to steer a body INTO that
// window. A marcher approaching the gap off-centre took a pure-axis heading
// straight down, pressed its shoulder on the barricade corner beside the gap,
// and pushout ejected it back. It had no attack either: the wall it was touching
// was not the tile its descent step had chosen, and bulldoze is march-path-only.
// No move and no attack is the hall-ring signature, and it is what produced the
// 7/144 Firepit maze-B stalls (docs/reviews/2026-08-02-firepit-hang-fix.md).
//
// This pins the STEERING PROPERTY, not the field-observed lock. The lock itself
// is not reproducible from a snapshot — re-instantiating the two bodies found
// stalled in the real match lets them walk away, because what held them there
// was the crowd that had since died. What IS testable, and is exactly what the
// fix changed, is that a marcher closes its lateral offset from the gap it is
// descending into: under the old pure-axis heading dirX was identically 0, so a
// body arrived at the gap carrying whatever offset it happened to have.
test('a marcher approaching a lane gap centres itself on it', () => {
  const wall = []
  for (let gx = 14; gx <= 24; gx++) if (gx !== 19) wall.push(struct(gx, 8))
  const st = makeSimState({ structures: wall })

  // Gap column 19 spans x 608..640, centre 624. The body must stay well clear of
  // the wall row for the whole window: wall-corner pushout ALSO nudges a body
  // laterally, and an earlier draft of this test measured that instead of the
  // steering — it passed with the fix reverted. Starting at row 5 and stopping
  // after 10 ticks keeps the body's edge ~40px above the wall throughout, so the
  // only thing that can move it sideways is the heading.
  const GAP_CENTRE = 624
  const i = st.enemyStore.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 611, y: 180 }, 0)
  assert.equal(st.enemyStore.radius[i], 14, 'a max-radius body: 28px in a 32px lane')
  const off0 = Math.abs(st.enemyStore.x[i] - GAP_CENTRE)

  for (let t = 0; t < 10; t++) tickEnemies(st, t * 50, 50)

  const off1 = Math.abs(st.enemyStore.x[i] - GAP_CENTRE)
  assert.ok(st.enemyStore.y[i] + st.enemyStore.radius[i] < 8 * TILE_SIZE - 20,
    'body never came near the wall row, so pushout cannot be what moved it')
  assert.ok(off1 < off0 - 1,
    `lateral offset from the lane centre did not close: ${off0.toFixed(1)} -> ${off1.toFixed(1)}px`)
})

// The symmetric residue of the fix above, and why the watchdog exists. Once both
// bodies steer at the gap CENTRE, two max-radius bodies can converge on the same
// 32px gap that only admits one of them: separation's symmetric half-push holds
// them 28px apart, each on an opposite shoulder, each pulled back to centre by
// the field. Neither yields, and neither has an attack. Steering cannot break a
// tie it created; STUCK_ESCAPE_MS does, by letting a body that has held one
// cost-field value while attacking nothing bash the wall it is pressed against.
test('two max-radius bodies converging on the same gap escape via the stuck watchdog', () => {
  const wall = []
  for (let gx = 14; gx <= 24; gx++) if (gx !== 19) wall.push(struct(gx, 8))
  const st = makeSimState({ structures: wall })
  // Straddling the gap centre (624), 28px apart — the post-separation rest state.
  const i0 = st.enemyStore.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 610, y: 243 }, 0)
  const i1 = st.enemyStore.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 638, y: 243 }, 0)
  const wallHp0 = wall.reduce((a, s) => a + s.hp, 0)

  // Long enough to cross STUCK_ESCAPE_MS (30 s) and chew through: 60 s.
  for (let t = 0; t < 1200; t++) tickEnemies(st, t * 50, 50)

  assert.ok(st.stuckEscapes > 0, 'the watchdog recognised the lock')
  assert.ok(wall.reduce((a, s) => a + s.hp, 0) < wallHp0, 'a wedged body bashed the wall it was pressed against')
  const through = [i0, i1].some(i => worldToTileY(st.enemyStore.y[i]) > 8)
  assert.ok(through, 'at least one body broke the deadlock and cleared the wall row')
})

// --- spawn scheduling --------------------------------------------------------

test('spawnDueEnemies streams a wave in by schedule time and reports completion', () => {
  const st = makeSimState()
  const order = { SIDE_A: 'LEFT', SIDE_B: 'RIGHT' }
  st.spawnSchedule = buildSpawnSchedule(1, order)
  st.spawnIndex = 0
  st.fightElapsedMs = 0

  spawnDueEnemies(st, 0)                        // only atMs<=0 entries
  const early = st.enemyStore.count
  assert.ok(early >= 1 && early < st.spawnSchedule.length, 'a wave streams in, not all at once')

  st.fightElapsedMs = st.spawnSchedule.at(-1).atMs + 1
  spawnDueEnemies(st, 1000)
  assert.equal(st.enemyStore.count, st.spawnSchedule.length, 'all scheduled enemies spawned')
  assert.equal(st.spawnIndex, st.spawnSchedule.length)
})

// --- C1 (CP2 designer CRIT): no enemy may end a tick off the grid -------------

test('an enemy shoved off the grid is clamped back into the arena, not frozen', () => {
  // Pushout/collision can carry a body past the map edge (tile x=40 on a 40-wide
  // grid); there the cost field has no downhill, chooseStepDir returns -1, and
  // the enemy hangs forever — livingEnemyCount never reaches 0 and the wave
  // soft-locks (the reproduced wave-6 hang). One tick must clamp it back onto a
  // valid tile and it must resume descending.
  const st = makeSimState()
  const i = st.enemyStore.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 100, y: 100 }, 0)
  // Simulate the post-pushout off-grid position on all four edges in turn.
  for (const [ox, oy] of [[CONFIG.MAP_WIDTH + 13, 300], [-13, 300], [640, CONFIG.MAP_HEIGHT + 13], [640, -13]]) {
    st.enemyStore.x[i] = ox; st.enemyStore.y[i] = oy
    tickEnemies(st, 0, 16.67)
    const gx = worldToTileX(st.enemyStore.x[i]), gy = worldToTileY(st.enemyStore.y[i])
    assert.ok(inBounds(gx, gy), `off-grid (${ox},${oy}) not clamped — landed on invalid tile (${gx},${gy})`)
  }
})

test('spawned enemies appear at their gate tile', () => {
  const st = makeSimState()
  st.spawnSchedule = [{ atMs: 0, gate: 'CENTER', type: ENEMY_TYPE.GOBLIN, elite: false }]
  st.spawnIndex = 0
  st.fightElapsedMs = 0
  spawnDueEnemies(st, 0)
  const gate = BALANCE.WAVES // sanity that import works
  assert.ok(gate)
  assert.equal(st.enemyStore.count, 1)
  assert.equal(worldToTileX(st.enemyStore.x[0]), 20) // CONFIG.GATES.CENTER.gx
  assert.equal(worldToTileY(st.enemyStore.y[0]), 0)
})
