import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tileIdx, NEIGHBOR_DX, NEIGHBOR_DY, TILE_SIZE } from '../../server/game/grid.js'
import { CostField, BAND_HEALTHY } from '../../server/game/costField.js'
import {
  chooseStepDir, applyKnockback, integrate,
  MAX_STEP_PX, KB_WEIGHT_SCALE, KB_DECAY_PER_TICK,
} from '../../server/game/enemyMove.js'

function makeField() {
  const f = new CostField()
  f.setHall(19, 19)
  f.compute()
  return f
}

test('descent always strictly decreases field cost until the hall ring', () => {
  const f = makeField()
  let gx = 5, gy = 2 // far corner-ish start
  let prev = f.cost[tileIdx(gx, gy)]
  for (let steps = 0; steps < 100; steps++) {
    const k = chooseStepDir(f, gx, gy)
    if (k === -1) break
    gx += NEIGHBOR_DX[k]
    gy += NEIGHBOR_DY[k]
    const c = f.cost[tileIdx(gx, gy)]
    assert.ok(c < prev, `cost must strictly decrease (step ${steps}: ${prev} → ${c})`)
    prev = c
  }
  assert.equal(prev, 0, 'descent must terminate on the hall ring (cost 0)')
})

test('descent rejects the diagonal squeeze between two walls', () => {
  const f = new CostField()
  f.setHall(19, 19)
  f.setWallBand(18, 17, BAND_HEALTHY)
  f.setWallBand(19, 16, BAND_HEALTHY)
  f.compute()
  // Standing at (19,17): diagonal toward (18,16) squeezes between the two walls.
  const k = chooseStepDir(f, 19, 17)
  assert.ok(k !== -1)
  const nx = 19 + NEIGHBOR_DX[k], ny = 17 + NEIGHBOR_DY[k]
  assert.ok(!(nx === 18 && ny === 16), 'must not pick the corner-cut diagonal')
})

test('at the field minimum (hall ring) descent returns -1; boxed-in enemy heads into a wall (= attack it)', () => {
  const f = makeField()
  // Hall ring tile has cost 0 — nothing strictly lower → -1 (terminal, attack hall).
  assert.equal(chooseStepDir(f, 19, 18), -1)

  // Boxed in by walls: the chosen step points INTO a wall tile. The physical
  // tile pushout stops the body there and the combat layer reads "next tile is
  // a wall" as attack-the-wall. This is the designed failsafe — never a
  // stuck.js-style teleport.
  const g = new CostField()
  g.setHall(19, 19)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) g.setWallBand(5 + dx, 5 + dy, BAND_HEALTHY)
    }
  }
  g.compute()
  const k = chooseStepDir(g, 5, 5)
  assert.ok(k !== -1, 'boxed-in enemy still has a downhill direction (through a wall)')
  const nx = 5 + NEIGHBOR_DX[k], ny = 5 + NEIGHBOR_DY[k]
  assert.ok(g.wallBand[tileIdx(nx, ny)] !== 0, 'the downhill step targets a wall tile → attack it')
})

test('knockback scales by weight tier; super-heavy immune', () => {
  const kvx = new Float64Array(4), kvy = new Float64Array(4)
  for (let tier = 0; tier < 4; tier++) applyKnockback(kvx, kvy, tier, 1, 0, 600, tier)
  assert.equal(kvx[0], 600)                      // light ×1.0
  assert.ok(Math.abs(kvx[1] - 360) < 1e-9)       // medium ×0.6
  assert.ok(Math.abs(kvx[2] - 180) < 1e-9)       // heavy ×0.3
  assert.equal(kvx[3], 0)                        // super-heavy immune
  assert.equal(KB_WEIGHT_SCALE.length, 4)
})

test('per-tick displacement is clamped below one tile even at absurd knockback', () => {
  const xs = new Float64Array([100]), ys = new Float64Array([100])
  const kvx = new Float64Array([50000]), kvy = new Float64Array([0])
  integrate(xs, ys, kvx, kvy, 0, 1, 0, 120, 1 / 60)
  const moved = xs[0] - 100
  assert.ok(moved <= MAX_STEP_PX, `moved ${moved}px, must be <= ${MAX_STEP_PX}`)
  assert.ok(moved < TILE_SIZE, 'can never cross a full tile in one tick (no tunneling)')
})

test('strongest realistic Hydro Blast on a light enemy stays under the clamp naturally', () => {
  // First-pass strongest displacement: 900 px/s on a light (×1.0) enemy.
  const xs = new Float64Array([100]), ys = new Float64Array([100])
  const kvx = new Float64Array(1), kvy = new Float64Array(1)
  applyKnockback(kvx, kvy, 0, 1, 0, 900, 0)
  integrate(xs, ys, kvx, kvy, 0, 0, 0, 0, 1 / 60)
  const moved = xs[0] - 100
  assert.ok(moved < TILE_SIZE / 2, `realistic kb tick-step ${moved}px should be well under a tile`)
})

test('knockback decays over ticks and zeroes out', () => {
  const xs = new Float64Array([100]), ys = new Float64Array([100])
  const kvx = new Float64Array([600]), kvy = new Float64Array(1)
  integrate(xs, ys, kvx, kvy, 0, 0, 0, 0, 1 / 60)
  assert.ok(Math.abs(kvx[0] - 600 * KB_DECAY_PER_TICK) < 1e-9)
  for (let t = 0; t < 300; t++) integrate(xs, ys, kvx, kvy, 0, 0, 0, 0, 1 / 60)
  assert.equal(kvx[0], 0, 'kb velocity must fully decay to zero')
})

test('displacement toward the hall is allowed (no progress clamp, per spec)', () => {
  const f = makeField()
  const xs = new Float64Array([19 * 32 + 16]), ys = new Float64Array([5 * 32 + 16])
  const kvx = new Float64Array(1), kvy = new Float64Array(1)
  applyKnockback(kvx, kvy, 0, 0, 1, 600, 0) // push straight down toward the hall
  const y0 = ys[0]
  integrate(xs, ys, kvx, kvy, 0, 0, 0, 0, 1 / 60)
  assert.ok(ys[0] > y0, 'enemy moved toward the hall — displacement is direction-agnostic')
})
