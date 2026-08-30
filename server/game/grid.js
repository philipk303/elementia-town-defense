// Grid primitives — ported from ez-ctf server/ai/pathing.js (40×23 @ 32px),
// plus an allocation-free indexed binary min-heap for the cost-field Dijkstra.

export const TILE_SIZE = 32
export const TILES_W = 40
export const TILES_H = 23
export const N_TILES = TILES_W * TILES_H // 920

export const tileToWorldX = gx => gx * TILE_SIZE + TILE_SIZE / 2
export const tileToWorldY = gy => gy * TILE_SIZE + TILE_SIZE / 2
export const worldToTileX = x => Math.floor(x / TILE_SIZE)
export const worldToTileY = y => Math.floor(y / TILE_SIZE)
export const inBounds = (gx, gy) => gx >= 0 && gx < TILES_W && gy >= 0 && gy < TILES_H
export const tileIdx = (gx, gy) => gy * TILES_W + gx

// 8-connected neighbor deltas + step cost (octile: diagonal = √2).
// Orthogonals listed first (cosmetic iteration order only — cost ties in the
// field and in descent are broken deterministically by tile index, not slot).
export const NEIGHBOR_DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1])
export const NEIGHBOR_DY = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1])
export const NEIGHBOR_COST = new Float64Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2])

// Binary min-heap over tile indices with Float64 keys, fully preallocated.
// Ties broken by smaller tile index → deterministic expansion order.
// Duplicate pushes allowed (lazy deletion — caller skips stale pops).
export class IndexHeap {
  constructor(cap) {
    this.hIdx = new Int32Array(cap)
    this.hKey = new Float64Array(cap)
    this.n = 0
  }
  clear() { this.n = 0 }
  get size() { return this.n }
  _less(a, b) {
    return this.hKey[a] === this.hKey[b] ? this.hIdx[a] < this.hIdx[b] : this.hKey[a] < this.hKey[b]
  }
  _swap(a, b) {
    const i = this.hIdx[a]; this.hIdx[a] = this.hIdx[b]; this.hIdx[b] = i
    const k = this.hKey[a]; this.hKey[a] = this.hKey[b]; this.hKey[b] = k
  }
  // Capacity bound (why N_TILES*8 is safe for the cost field): pushes require a
  // strict cost decrease and stale entries are lazily skipped, so total pushes
  // <= directed edges + seeds (~7,000 on the 40×23 grid) < N_TILES*8 = 7,360.
  // The guard below turns any future misuse (re-push policies, A* variants)
  // into a loud error instead of silent typed-array OOB corruption.
  push(idx, key) {
    if (this.n >= this.hIdx.length) throw new Error('IndexHeap overflow — capacity bound violated')
    let i = this.n++
    this.hIdx[i] = idx
    this.hKey[i] = key
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this._less(i, p)) { this._swap(i, p); i = p } else break
    }
  }
  // Returns the tile index with the smallest key, or -1 when empty.
  // The popped key is left in this.poppedKey.
  pop() {
    if (this.n === 0) return -1
    const top = this.hIdx[0]
    this.poppedKey = this.hKey[0]
    this.n--
    if (this.n > 0) {
      this.hIdx[0] = this.hIdx[this.n]
      this.hKey[0] = this.hKey[this.n]
      let i = 0
      for (;;) {
        const l = i * 2 + 1, r = l + 1
        let s = i
        if (l < this.n && this._less(l, s)) s = l
        if (r < this.n && this._less(r, s)) s = r
        if (s === i) break
        this._swap(i, s)
        i = s
      }
    }
    return top
  }
}
