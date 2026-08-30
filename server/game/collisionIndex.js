// Tile-bucketed spatial index + allocation-free pushout (spec §5).
//
// Replaces ez-ctf's linear resolvePlacedCollision scans: entities are bucketed
// by tile each tick (O(n) rebuild via intrusive linked lists over preallocated
// Int32Arrays), and each entity only tests its 3×3 tile neighborhood.
// No object allocation anywhere in the tick path — scratch math is scalar.

import {
  TILE_SIZE, TILES_W, TILES_H, N_TILES, tileIdx, inBounds,
  worldToTileX, worldToTileY,
} from './grid.js'

// Elite sprites scale up but collision radius is capped so a 1-tile corridor
// (32 px) always passes any enemy (2×14 = 28 < 32). Spec §5 hard rule.
export const MAX_COLLISION_RADIUS = 14

export class CollisionIndex {
  constructor(maxEntities) {
    this.head = new Int32Array(N_TILES).fill(-1)
    this.next = new Int32Array(maxEntities).fill(-1)
    this.count = 0
  }

  // Rebuild buckets from entity positions. O(n), allocation-free.
  rebuild(count, xs, ys) {
    this.head.fill(-1)
    this.count = count
    for (let i = 0; i < count; i++) {
      let gx = worldToTileX(xs[i])
      let gy = worldToTileY(ys[i])
      if (gx < 0) gx = 0; else if (gx >= TILES_W) gx = TILES_W - 1
      if (gy < 0) gy = 0; else if (gy >= TILES_H) gy = TILES_H - 1
      const cell = tileIdx(gx, gy)
      this.next[i] = this.head[cell]
      this.head[cell] = i
    }
  }

  // Pairwise circle-circle separation across each entity's 3×3 neighborhood.
  // Symmetric half-push; j > i guard prevents double-resolution.
  //
  // INVARIANT: the 3×3 scan only finds overlaps when both radii <= TILE_SIZE/2
  // (centers of an overlapping pair are then always within one tile). Enforced
  // below — a larger entity would silently miss collisions otherwise.
  resolveCircles(xs, ys, radii) {
    for (let i = 0; i < this.count; i++) {
      if (radii[i] > TILE_SIZE / 2) throw new Error(`collision radius ${radii[i]} exceeds TILE_SIZE/2`)
    }
    for (let i = 0; i < this.count; i++) {
      const gx = worldToTileX(xs[i])
      const gy = worldToTileY(ys[i])
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox, cy = gy + oy
          if (!inBounds(cx, cy)) continue
          for (let j = this.head[tileIdx(cx, cy)]; j !== -1; j = this.next[j]) {
            if (j <= i) continue
            const dx = xs[j] - xs[i]
            const dy = ys[j] - ys[i]
            const rr = radii[i] + radii[j]
            const d2 = dx * dx + dy * dy
            if (d2 >= rr * rr || d2 === 0) continue
            const d = Math.sqrt(d2)
            const push = (rr - d) / d * 0.5
            xs[i] -= dx * push
            ys[i] -= dy * push
            xs[j] += dx * push
            ys[j] += dy * push
          }
        }
      }
    }
  }
}

// Circle-vs-solid-tile pushout for one entity against wall/hall tiles in its
// 3×3 tile neighborhood. `isSolidTile(gx,gy)` decides solidity (walls block
// physically even though the cost field lets paths run through them — enemies
// stop at the wall and attack it). Allocation-free.
//
// MOTION-AWARE (C1 fix): (ax, ay) is the entity's anchor — its position at the
// START of the tick, known to be legally outside solid tiles. When the center
// ends up INSIDE a solid tile (stacked knockbacks or crowd pushes can carry it
// past the midline within the 31px step clamp), we eject toward the anchor's
// side, never along the shallowest axis — otherwise a shove past the midline
// pops the entity out the FAR face and it tunnels through the maze.
export function resolveTilePushout(xs, ys, i, radius, isSolidTile, ax, ay) {
  const gx = worldToTileX(xs[i])
  const gy = worldToTileY(ys[i])
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const tx = gx + ox, ty = gy + oy
      if (!inBounds(tx, ty) || !isSolidTile(tx, ty)) continue
      const minX = tx * TILE_SIZE, minY = ty * TILE_SIZE
      const maxX = minX + TILE_SIZE, maxY = minY + TILE_SIZE
      // Closest point on the AABB to the circle center.
      const px = xs[i] < minX ? minX : xs[i] > maxX ? maxX : xs[i]
      const py = ys[i] < minY ? minY : ys[i] > maxY ? maxY : ys[i]
      let dx = xs[i] - px
      let dy = ys[i] - py
      const d2 = dx * dx + dy * dy
      if (d2 >= radius * radius) continue
      if (d2 > 0) {
        const d = Math.sqrt(d2)
        const push = (radius - d) / d
        xs[i] += dx * push
        ys[i] += dy * push
      } else {
        // Center inside the tile: eject toward the anchor (came-from) side.
        const cx = minX + TILE_SIZE / 2
        const cy = minY + TILE_SIZE / 2
        const adx = ax - cx
        const ady = ay - cy
        if (Math.abs(adx) >= Math.abs(ady)) {
          xs[i] = adx >= 0 ? maxX + radius : minX - radius
        } else {
          ys[i] = ady >= 0 ? maxY + radius : minY - radius
        }
      }
    }
  }
}
