import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TILE_SIZE, tileIdx } from '../../server/game/grid.js'
import { CollisionIndex, resolveTilePushout, MAX_COLLISION_RADIUS } from '../../server/game/collisionIndex.js'
import { CostField, BAND_HEALTHY } from '../../server/game/costField.js'
import { chooseStepDir, integrate } from '../../server/game/enemyMove.js'
import { NEIGHBOR_DX, NEIGHBOR_DY } from '../../server/game/grid.js'

test('rebuild buckets entities by tile; off-map positions clamp into bounds', () => {
  const ci = new CollisionIndex(8)
  const xs = new Float64Array([16, 48, 40, -100, 5000])
  const ys = new Float64Array([16, 16, 20, -50, 5000])
  ci.rebuild(5, xs, ys)
  // Tile (1,0) holds entities 1 and 2; tile (0,0) holds 0 plus the negative
  // off-map entity 3 (clamped in); tile (39,22) holds the far off-map entity 4.
  const members = cell => {
    const out = []
    for (let j = ci.head[cell]; j !== -1; j = ci.next[j]) out.push(j)
    return out.sort((a, b) => a - b)
  }
  assert.deepEqual(members(tileIdx(1, 0)), [1, 2])
  assert.deepEqual(members(tileIdx(0, 0)), [0, 3])
  assert.deepEqual(members(tileIdx(39, 22)), [4])
})

test('overlapping circles separate; distant pairs untouched', () => {
  const ci = new CollisionIndex(4)
  const xs = new Float64Array([100, 110, 300, 400])
  const ys = new Float64Array([100, 100, 300, 300])
  const radii = new Float64Array([10, 10, 10, 10])
  ci.rebuild(4, xs, ys)
  ci.resolveCircles(xs, ys, radii)
  const gap = Math.hypot(xs[1] - xs[0], ys[1] - ys[0])
  assert.ok(gap >= 19.9, `overlap resolved, gap=${gap}`)
  assert.equal(xs[2], 300)
  assert.equal(xs[3], 400)
})

test('tile pushout keeps a circle out of a solid tile (both from outside and from inside)', () => {
  const solid = (gx, gy) => gx === 5 && gy === 5
  // Overlapping from the left edge of tile (5,5) [x: 160..192].
  const xs = new Float64Array([158]), ys = new Float64Array([176])
  resolveTilePushout(xs, ys, 0, 10, solid, 140, 176)
  assert.ok(xs[0] <= 160 - 10 + 1e-9, `pushed clear of the wall face, x=${xs[0]}`)
  // Center fully inside the tile, anchor on the left → ejected LEFT.
  const xs2 = new Float64Array([170]), ys2 = new Float64Array([176])
  resolveTilePushout(xs2, ys2, 0, 10, solid, 140, 176)
  assert.ok(xs2[0] <= 160 - 10 + 1e-9, `ejected toward the anchor side, x=${xs2[0]}`)
})

test('C1 REGRESSION: stacked knockback into a wall never tunnels — ejection is anchor-side, not far-side', () => {
  const solid = (gx, gy) => gx === 5 && gy === 5 // wall tile x∈[160,192]
  // Enemy flush against the left wall face, shoved PAST the tile midline
  // (x=183 > 176) by two stacked Hydro Blasts within the 31px step clamp.
  const xs = new Float64Array([183]), ys = new Float64Array([176])
  const anchorX = 152 // start-of-tick position: legally outside, left of the wall
  resolveTilePushout(xs, ys, 0, 8, solid, anchorX, 176)
  assert.ok(xs[0] <= 160 - 8 + 1e-9,
    `must eject back to the LEFT (came-from) side, got x=${xs[0]} — far-side ejection = tunneling`)

  // Sustained barrage: blast every 10 ticks for 5s; enemy must NEVER end a tick
  // on the far side of the wall column.
  const bx = new Float64Array([152]), by = new Float64Array([176])
  const kvx = new Float64Array(1), kvy = new Float64Array(1)
  for (let t = 0; t < 300; t++) {
    const ax = bx[0], ay = by[0]
    if (t % 10 === 0) { kvx[0] += 900 } // stacking, no decay reliance
    integrate(bx, by, kvx, kvy, 0, 1, 0, 60, 1 / 60)
    resolveTilePushout(bx, by, 0, 8, solid, ax, ay)
    assert.ok(bx[0] < 176, `tick ${t}: crossed the wall midline to x=${bx[0]}`)
  }
})

test('oversized radius in resolveCircles throws instead of silently missing overlaps', () => {
  const ci = new CollisionIndex(2)
  const xs = new Float64Array([100, 120]), ys = new Float64Array([100, 100])
  const radii = new Float64Array([17, 10]) // > TILE_SIZE/2
  ci.rebuild(2, xs, ys)
  assert.throws(() => ci.resolveCircles(xs, ys, radii), /radius/)
})

test('ELITE CORRIDOR: radius-14 elite traverses a 1-tile corridor the field says is open', () => {
  assert.equal(MAX_COLLISION_RADIUS, 14)
  const f = new CostField()
  f.setHall(19, 19)
  // Corridor along row gy=10 from gx=5..30: walls above (gy=9) and below (gy=11),
  // with an opening at the right end leading toward the hall.
  for (let gx = 5; gx <= 30; gx++) {
    f.setWallBand(gx, 9, BAND_HEALTHY)
    if (gx < 30) f.setWallBand(gx, 11, BAND_HEALTHY) // gap at (30,11) exits downward
  }
  f.compute()
  const isSolid = (gx, gy) => f.blocked[tileIdx(gx, gy)] === 1 || f.wallBand[tileIdx(gx, gy)] !== 0

  // Elite starts at the left mouth of the corridor, centered in the corridor row.
  const xs = new Float64Array([5 * TILE_SIZE + 16])
  const ys = new Float64Array([10 * TILE_SIZE + 16])
  const kvx = new Float64Array(1), kvy = new Float64Array(1)
  const dt = 1 / 60, speed = 90
  let lastCost = Infinity
  for (let t = 0; t < 60 * 30; t++) {
    const ax = xs[0], ay = ys[0]
    const gx = Math.floor(xs[0] / TILE_SIZE), gy = Math.floor(ys[0] / TILE_SIZE)
    const k = chooseStepDir(f, gx, gy)
    if (k !== -1) {
      // steer toward the chosen neighbor tile center
      const txc = (gx + NEIGHBOR_DX[k]) * TILE_SIZE + 16
      const tyc = (gy + NEIGHBOR_DY[k]) * TILE_SIZE + 16
      const dx = txc - xs[0], dy = tyc - ys[0]
      const d = Math.hypot(dx, dy) || 1
      integrate(xs, ys, kvx, kvy, 0, dx / d, dy / d, speed, dt)
    }
    resolveTilePushout(xs, ys, 0, MAX_COLLISION_RADIUS, isSolid, ax, ay)
    lastCost = f.cost[tileIdx(
      Math.max(0, Math.min(39, Math.floor(xs[0] / TILE_SIZE))),
      Math.max(0, Math.min(22, Math.floor(ys[0] / TILE_SIZE))))]
    if (lastCost === 0) break
  }
  assert.equal(lastCost, 0, `elite must reach the hall ring through the corridor (final cost ${lastCost})`)
})
