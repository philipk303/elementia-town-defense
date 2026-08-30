import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TILES_W, TILES_H, tileIdx } from '../../server/game/grid.js'
import {
  CostField, BAND_NONE, BAND_HEALTHY, BAND_CRITICAL,
  WALL_ENTRY_COST, RECOMPUTE_MIN_MS, hpToBand,
} from '../../server/game/costField.js'

// Standard fixture: hall 2×2 at (19,19) — bottom-center, like the real map.
function makeField() {
  const f = new CostField()
  f.setHall(19, 19)
  f.compute()
  return f
}

test('open field matches octile distance from the hall ring', () => {
  const f = makeField()
  // Tile straight above the hall ring: (19,17) is 1 orthogonal step from ring tile (19,18).
  assert.equal(f.cost[tileIdx(19, 18)], 0) // ring seed
  assert.equal(f.cost[tileIdx(19, 17)], 1)
  // Diagonal step from ring corner (18,18): (17,17) costs √2.
  assert.ok(Math.abs(f.cost[tileIdx(17, 17)] - Math.SQRT2) < 1e-9)
})

test('hall footprint tiles never expand (stay Infinity)', () => {
  const f = makeField()
  for (const [x, y] of [[19, 19], [20, 19], [19, 20], [20, 20]]) {
    assert.equal(f.cost[tileIdx(x, y)], Infinity)
  }
})

test('critical wall is bulldozed when the detour is long; healthy wall is detoured', () => {
  const f = new CostField()
  f.setHall(19, 19)
  // Wall the full row gy=10 except a gap at gx=0 → detour goes far left.
  for (let gx = 0; gx < TILES_W; gx++) if (gx !== 0) f.setWallBand(gx, 10, BAND_CRITICAL)
  f.compute()
  const above = f.cost[tileIdx(20, 9)] // just above the wall, near center
  const at = f.cost[tileIdx(20, 10)]
  // Through the critical wall: cost above ≈ cost at wall tile + 1 step.
  assert.ok(above - at <= 1 + 1e-9, `expected bulldoze-through, got above=${above} at=${at}`)
  // The through-wall route must beat the 20-tile detour to the gx=0 gap:
  // detour would cost >= 2*19 extra; bulldoze adds only WALL_ENTRY_COST critical (4).
  assert.ok(above < f.cost[tileIdx(0, 10)] + 25, 'center should not route via the far-left gap')

  // Same layout with HEALTHY band (entry 30): now the gap wins for tiles near it,
  // and the center-above cost must include either 30 (through) or the detour.
  const g = new CostField()
  g.setHall(19, 19)
  for (let gx = 0; gx < TILES_W; gx++) if (gx !== 0) g.setWallBand(gx, 10, BAND_HEALTHY)
  g.compute()
  const aboveGap = g.cost[tileIdx(1, 9)]
  const aboveGapThrough = g.cost[tileIdx(1, 10)] + 1 + WALL_ENTRY_COST[BAND_HEALTHY]
  assert.ok(aboveGap < aboveGapThrough, 'near the gap, detouring through the gap must beat entering a healthy wall')
})

test('fully sealed region still gets finite costs (gate-behind-walls has no undefined state)', () => {
  const f = new CostField()
  f.setHall(19, 19)
  // Seal the entire map horizontally with a healthy wall — no gaps at all.
  for (let gx = 0; gx < TILES_W; gx++) f.setWallBand(gx, 10, BAND_HEALTHY)
  f.compute()
  // A "gate" tile at the very top must still have a finite cost.
  for (let gx = 0; gx < TILES_W; gx++) {
    assert.ok(Number.isFinite(f.cost[tileIdx(gx, 0)]), `top row gx=${gx} must be reachable-at-a-cost`)
  }
})

test('corner-cut: no diagonal squeeze between two wall tiles', () => {
  const f = new CostField()
  f.setHall(19, 19)
  // Two walls diagonal-adjacent forming a 0-width diagonal gap near the hall ring:
  // wall at (18,17) and (19,16). The diagonal (19,17)→(18,16) squeezes between them.
  f.setWallBand(18, 17, BAND_HEALTHY)
  f.setWallBand(19, 16, BAND_HEALTHY)
  f.compute()
  // (18,16)'s cheapest legal route must NOT be the diagonal from (19,17):
  // legal alternatives go around; its cost must exceed cost[(19,17)] + √2.
  const viaDiag = f.cost[tileIdx(19, 17)] + Math.SQRT2
  assert.ok(f.cost[tileIdx(18, 16)] > viaDiag + 1e-9, 'diagonal between two walls must be rejected')
})

test('recompute throttle honors RECOMPUTE_MIN_MS window', () => {
  const f = makeField()
  f.lastComputeAt = 1000
  f.setWallBand(5, 5, BAND_CRITICAL)
  assert.equal(f.maybeRecompute(1000 + RECOMPUTE_MIN_MS - 1), false, 'inside window: no recompute')
  assert.equal(f.maybeRecompute(1000 + RECOMPUTE_MIN_MS), true, 'window elapsed: recompute runs')
  assert.equal(f.maybeRecompute(1000 + RECOMPUTE_MIN_MS + 1), false, 'clean field: no recompute')
})

test('hpToBand quantization', () => {
  assert.equal(hpToBand(100, 100), BAND_HEALTHY)
  assert.equal(hpToBand(61, 100), BAND_HEALTHY)
  assert.equal(hpToBand(60, 100), 2)
  assert.equal(hpToBand(26, 100), 2)
  assert.equal(hpToBand(25, 100), BAND_CRITICAL)
  assert.equal(hpToBand(1, 100), BAND_CRITICAL)
  assert.equal(hpToBand(0, 100), BAND_NONE)
})
