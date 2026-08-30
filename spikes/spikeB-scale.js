// Spike B — enemy entity system at wave-10 scale.
//
// 120 flow-field enemies + 150 structures (as wall-band tiles forming a real
// serpentine maze) through tile-indexed collision at 60 Hz for 60 simulated
// seconds, with knockback pulses and chip damage driving band changes +
// throttled field recomputes (the worst realistic tick load).
//
// Measures per-tick wall time (avg/p95/p99) and heap growth after warmup.
//
// GO thresholds (plan Phase 0 / Spike B):
//   avg tick <= 1.2 ms, p99 <= 3 ms on dev machine (x10 = 0.1-vCPU proxy)
//   ~zero heap growth after warmup (allocation-free tick path)
//   (Elite corridor correctness lives in test/game/collisionIndex.test.js)
//
// Run: npm run spike:b   (uses --expose-gc)

import { mulberry32 } from '../shared/rng.js'
import {
  TILE_SIZE, TILES_W, TILES_H, tileIdx, NEIGHBOR_DX, NEIGHBOR_DY,
} from '../server/game/grid.js'
import { CostField, BAND_HEALTHY, hpToBand } from '../server/game/costField.js'
import { chooseStepDir, integrate, applyKnockback } from '../server/game/enemyMove.js'
import { CollisionIndex, resolveTilePushout, MAX_COLLISION_RADIUS } from '../server/game/collisionIndex.js'

const N_ENEMIES = 120
const N_TICKS = 60 * 60 // 60 simulated seconds
const DT = 1 / 60
const rng = mulberry32(0xB0B)

// --- world: serpentine maze of ~150 wall tiles --------------------------------
const field = new CostField()
field.setHall(19, 19)
const wallHp = new Float64Array(TILES_W * TILES_H)
const WALL_MAX_HP = 200
let wallCount = 0
// Three staggered horizontal wall rows with alternating gaps → real maze flow.
function placeWall(gx, gy) {
  if (wallCount >= 150 || field.wallBand[tileIdx(gx, gy)] !== 0) return
  field.setWallBand(gx, gy, BAND_HEALTHY)
  wallHp[tileIdx(gx, gy)] = WALL_MAX_HP
  wallCount++
}
for (const [row, gapSide] of [[4, 'left'], [8, 'right'], [12, 'left'], [16, 'right']]) {
  for (let gx = 2; gx < TILES_W - 2; gx++) {
    if (gapSide === 'right' && gx > TILES_W - 6) continue
    if (gapSide === 'left' && gx < 6) continue
    placeWall(gx, row)
  }
}
// Vertical baffles between the rows until we hit the full 150-structure load.
for (const gx of [10, 20, 30, 15, 25]) {
  for (const gy of [5, 6, 7, 13, 14, 15]) placeWall(gx, gy)
}
field.compute()
console.log(`maze walls placed: ${wallCount}`)

const isSolid = (gx, gy) =>
  field.blocked[tileIdx(gx, gy)] === 1 || field.wallBand[tileIdx(gx, gy)] !== 0

// --- enemies: SoA, spawned across the 3 gate mouths ---------------------------
const xs = new Float64Array(N_ENEMIES)
const ys = new Float64Array(N_ENEMIES)
const kvx = new Float64Array(N_ENEMIES)
const kvy = new Float64Array(N_ENEMIES)
const radii = new Float64Array(N_ENEMIES)
const speed = new Float64Array(N_ENEMIES)
const weight = new Uint8Array(N_ENEMIES)
const statusT = new Float64Array(N_ENEMIES) // one decaying status timer each
const axs = new Float64Array(N_ENEMIES) // start-of-tick anchors (pushout)
const ays = new Float64Array(N_ENEMIES)
const GATES = [19, 3, 36]
for (let i = 0; i < N_ENEMIES; i++) {
  xs[i] = GATES[i % 3] * TILE_SIZE + 16 + (rng() - 0.5) * 24
  ys[i] = 16 + rng() * 48
  radii[i] = i % 10 === 0 ? MAX_COLLISION_RADIUS : 8 + (i % 3) * 2 // some elites
  speed[i] = 60 + (i % 4) * 20
  weight[i] = i % 4
  statusT[i] = rng() * 5
}

const ci = new CollisionIndex(N_ENEMIES)

// --- tick loop with instrumentation -------------------------------------------
const tickUs = new Float64Array(N_TICKS)
const WARMUP_TICKS = 300
if (global.gc) global.gc()
let heapAfterWarmup = 0

let nowMs = 0
for (let t = 0; t < N_TICKS; t++) {
  const t0 = process.hrtime.bigint()
  nowMs += 1000 / 60

  // Knockback pulse: every 2s, blast 20 enemies (a Hydro Blast / Whirlwind volley).
  if (t % 120 === 0) {
    for (let n = 0; n < 20; n++) {
      const i = (t / 120 * 20 + n) % N_ENEMIES
      applyKnockback(kvx, kvy, i, rng() - 0.5, rng() - 0.5, 700, weight[i])
    }
  }

  // Chip damage: every 30 ticks, 3 random walls take damage → band changes → dirty.
  if (t % 30 === 0) {
    for (let n = 0; n < 3; n++) {
      const gx = 2 + Math.floor(rng() * (TILES_W - 4))
      for (const row of [6, 11, 16]) {
        const wi = tileIdx(gx, row)
        if (field.wallBand[wi] !== 0 && wallHp[wi] > 0) {
          wallHp[wi] = Math.max(1, wallHp[wi] - 25) // chip but never destroy (keep 150 walls)
          field.setWallBand(gx, row, hpToBand(wallHp[wi], WALL_MAX_HP))
          break
        }
      }
    }
  }

  field.maybeRecompute(nowMs)

  // Movement: descent + integration. Anchors = start-of-tick positions (for
  // motion-aware wall pushout).
  axs.set(xs)
  ays.set(ys)
  for (let i = 0; i < N_ENEMIES; i++) {
    let gx = Math.floor(xs[i] / TILE_SIZE)
    let gy = Math.floor(ys[i] / TILE_SIZE)
    if (gx < 0) gx = 0; else if (gx >= TILES_W) gx = TILES_W - 1
    if (gy < 0) gy = 0; else if (gy >= TILES_H) gy = TILES_H - 1
    const k = chooseStepDir(field, gx, gy)
    if (k !== -1) {
      const txc = (gx + NEIGHBOR_DX[k]) * TILE_SIZE + 16
      const tyc = (gy + NEIGHBOR_DY[k]) * TILE_SIZE + 16
      const dx = txc - xs[i], dy = tyc - ys[i]
      const d = Math.hypot(dx, dy) || 1
      integrate(xs, ys, kvx, kvy, i, dx / d, dy / d, speed[i], DT)
    } else {
      integrate(xs, ys, kvx, kvy, i, 0, 0, 0, DT) // at minimum / attacking: kb still applies
    }
    // Status tick (burn/slow timer decay stand-in).
    if (statusT[i] > 0) statusT[i] -= DT; else statusT[i] = rng() * 5
  }

  // Collision: rebuild buckets, enemy-enemy separation, wall/hall pushout.
  ci.rebuild(N_ENEMIES, xs, ys)
  ci.resolveCircles(xs, ys, radii)
  for (let i = 0; i < N_ENEMIES; i++) resolveTilePushout(xs, ys, i, radii[i], isSolid, axs[i], ays[i])

  // Reaching the hall ring teleports the enemy back to a gate (endless pressure).
  for (let i = 0; i < N_ENEMIES; i++) {
    const gx = Math.max(0, Math.min(TILES_W - 1, Math.floor(xs[i] / TILE_SIZE)))
    const gy = Math.max(0, Math.min(TILES_H - 1, Math.floor(ys[i] / TILE_SIZE)))
    if (field.cost[tileIdx(gx, gy)] === 0) {
      xs[i] = GATES[i % 3] * TILE_SIZE + 16
      ys[i] = 16
    }
  }

  tickUs[t] = Number(process.hrtime.bigint() - t0) / 1000

  if (t === WARMUP_TICKS) {
    if (global.gc) global.gc()
    heapAfterWarmup = process.memoryUsage().heapUsed
  }
}

if (global.gc) global.gc()
const heapAtEnd = process.memoryUsage().heapUsed
const heapGrowthKb = (heapAtEnd - heapAfterWarmup) / 1024

const measured = Array.from(tickUs.slice(WARMUP_TICKS)).sort((a, b) => a - b)
const avg = measured.reduce((s, v) => s + v, 0) / measured.length
const p = q => measured[Math.min(measured.length - 1, Math.floor(q * measured.length))]

console.log(`\nSpike B — ${N_ENEMIES} enemies / ${wallCount} wall structures / 60Hz x ${N_TICKS / 60}s`)
console.log(`field recomputes: ${field.computeCount} (throttled)`)
console.log(`tick avg : ${(avg / 1000).toFixed(3)} ms   (0.1-vCPU proxy ≈ ${(avg / 100).toFixed(2)} ms)`)
console.log(`tick p95 : ${(p(0.95) / 1000).toFixed(3)} ms`)
console.log(`tick p99 : ${(p(0.99) / 1000).toFixed(3)} ms  (proxy ≈ ${(p(0.99) / 100).toFixed(2)} ms vs 16.7 ms budget)`)
console.log(`heap growth after warmup: ${heapGrowthKb.toFixed(1)} KB`)

const goAvg = avg <= 1200
const goP99 = p(0.99) <= 3000
const goHeap = Math.abs(heapGrowthKb) < 512
console.log(`\nGO check — avg <= 1.2 ms: ${goAvg ? 'PASS' : 'FAIL'}`)
console.log(`GO check — p99 <= 3 ms: ${goP99 ? 'PASS' : 'FAIL'}`)
console.log(`GO check — heap stable (<512 KB drift): ${goHeap ? 'PASS' : 'FAIL'}`)
console.log(`\nVERDICT: ${goAvg && goP99 && goHeap ? 'GO' : 'NO-GO'}`)
