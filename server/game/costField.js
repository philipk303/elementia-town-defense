// Cost-weighted Dijkstra field — the keystone pathing structure (spec §5).
//
// A single field flows out from the town hall; every enemy reads it O(1)/tick
// and steps downhill. Walls are traversable at a cost derived from remaining
// HP, quantized into bands (Healthy/Damaged/Critical), so enemies bulldoze a
// weak wall when the detour is long enough and a gate opened behind a walled
// region always has a defined (finite) cost everywhere.
//
// Invariants:
//   - Octile weights (diag = √2), NOT hop-count BFS.
//   - Seeded from the ring of tiles adjacent to the hall footprint; the hall's
//     own tiles are hard-blocked and never expand.
//   - Corner-cut guard in expansion: no diagonal between two solid-ish tiles
//     (solid = hall-blocked OR any wall band) — walls block diagonal squeezes
//     even though they are traversable head-on.
//   - Recompute is dirty-flagged and throttled to <= 1 per RECOMPUTE_MIN_MS.
//   - No allocation after construction (typed arrays + IndexHeap).

import {
  TILES_W, TILES_H, N_TILES, tileIdx, inBounds,
  NEIGHBOR_DX, NEIGHBOR_DY, NEIGHBOR_COST, IndexHeap,
} from './grid.js'
import { BALANCE } from '../../shared/balance.js'

export const BAND_NONE = 0
export const BAND_HEALTHY = 1
export const BAND_DAMAGED = 2
export const BAND_CRITICAL = 3
// Extra cost to ENTER a wall tile, per band. Re-exported by reference from
// BALANCE (Phase 8A) so a sweep can move it; the array identity never changes,
// so existing importers and the Dijkstra inner loop are unaffected.
export const WALL_ENTRY_COST = BALANCE.COST_FIELD.WALL_ENTRY_COST

export const RECOMPUTE_MIN_MS = 250

export function hpToBand(hp, maxHp) {
  if (!(maxHp > 0)) throw new Error(`hpToBand: invalid maxHp ${maxHp}`)
  if (hp <= 0) return BAND_NONE
  const f = hp / maxHp
  if (f > 0.6) return BAND_HEALTHY
  if (f > 0.25) return BAND_DAMAGED
  return BAND_CRITICAL
}

export class CostField {
  constructor() {
    this.cost = new Float64Array(N_TILES).fill(Infinity)
    this.wallBand = new Uint8Array(N_TILES) // BAND_* per tile
    this.blocked = new Uint8Array(N_TILES)  // 1 = hall footprint (never expands)
    this.seeds = new Int32Array(16)         // ring around the hall
    this.seedCount = 0
    this.heap = new IndexHeap(N_TILES * 8)
    this.dirty = true
    this.lastComputeAt = -Infinity
    this.computeCount = 0
  }

  // Hall is 2×2 with top-left tile at (gx, gy). Blocks its tiles and collects
  // the surrounding ring (8-neighborhood of the footprint) as Dijkstra seeds.
  setHall(gx, gy) {
    this.blocked.fill(0)
    this.seedCount = 0
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) this.blocked[tileIdx(gx + dx, gy + dy)] = 1
    }
    for (let y = gy - 1; y <= gy + 2; y++) {
      for (let x = gx - 1; x <= gx + 2; x++) {
        if (!inBounds(x, y)) continue
        const i = tileIdx(x, y)
        if (!this.blocked[i]) this.seeds[this.seedCount++] = i
      }
    }
    this.dirty = true
  }

  setWallBand(gx, gy, band) {
    const i = tileIdx(gx, gy)
    if (this.wallBand[i] !== band) {
      this.wallBand[i] = band
      this.dirty = true
    }
  }

  markDirty() { this.dirty = true }

  // Solid for corner-cut purposes: hall tiles and any wall tile.
  solidAt(gx, gy) {
    if (!inBounds(gx, gy)) return true
    const i = tileIdx(gx, gy)
    return this.blocked[i] === 1 || this.wallBand[i] !== BAND_NONE
  }

  // Throttled recompute. Returns true if a compute actually ran.
  maybeRecompute(nowMs) {
    if (!this.dirty || nowMs - this.lastComputeAt < RECOMPUTE_MIN_MS) return false
    this.compute()
    this.lastComputeAt = nowMs
    return true
  }

  compute() {
    const { cost, wallBand, blocked, heap } = this
    cost.fill(Infinity)
    heap.clear()
    for (let s = 0; s < this.seedCount; s++) {
      const i = this.seeds[s]
      const c = WALL_ENTRY_COST[wallBand[i]] // seed on a wall tile costs its entry
      if (c < cost[i]) { cost[i] = c; heap.push(i, c) }
    }
    while (heap.size > 0) {
      const u = heap.pop()
      const uKey = heap.poppedKey
      if (uKey > cost[u]) continue // stale entry (lazy deletion)
      const ugy = (u / TILES_W) | 0
      const ugx = u - ugy * TILES_W
      for (let k = 0; k < 8; k++) {
        const nx = ugx + NEIGHBOR_DX[k]
        const ny = ugy + NEIGHBOR_DY[k]
        if (!inBounds(nx, ny)) continue
        const v = tileIdx(nx, ny)
        if (blocked[v]) continue
        // Corner-cut guard (diagonals are entries 4..7).
        if (k >= 4) {
          if (this.solidAt(ugx + NEIGHBOR_DX[k], ugy)) continue
          if (this.solidAt(ugx, ugy + NEIGHBOR_DY[k])) continue
        }
        const nc = uKey + NEIGHBOR_COST[k] + WALL_ENTRY_COST[wallBand[v]]
        if (nc < cost[v]) {
          cost[v] = nc
          heap.push(v, nc)
        }
      }
    }
    this.dirty = false
    this.computeCount++
  }
}
