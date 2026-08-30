// Enemy entity system — SoA store + spawner + per-tick sim (spec §4/§5). NEW
// code (ez-ctf's "AI" was 4 player-bots, not a horde). Plugs into the Phase-0
// foundation: the cost field for descent, enemyMove for the integrator +
// knockback, collisionIndex for allocation-free separation and wall pushout.
//
// Representation: Structure-of-Arrays over preallocated typed arrays (capacity
// BALANCE.ENEMY.MAX), so the movement/collision hot paths never allocate and
// feed the typed-array modules directly. Per-slot status/aggro objects live for
// the slot's lifetime (reset on spawn) — not per-tick allocation. Slots are
// dense-packed 0..count-1; death is a swap-remove.
//
// Combat in Phase 3 is enemy → structure/hall only (the bulldoze falls out of
// the cost field). Enemy → player damage (and the down/revive consequence of a
// caught player) is Phase 4; the aggro FSM that steers a chase is built now.

import {
  N_TILES, tileIdx, inBounds, TILE_SIZE,
  NEIGHBOR_DX, NEIGHBOR_DY,
  tileToWorldX, tileToWorldY, worldToTileX, worldToTileY,
} from './grid.js'
import { CONFIG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { baseProfile, eliteProfile, statusFlags, ENEMY_TYPE } from './enemyTypes.js'
import { BAND_NONE } from './costField.js'
import { chooseStepDir, integrate } from './enemyMove.js'
import { CollisionIndex, resolveTilePushout } from './collisionIndex.js'
import { makeStatus, resetStatus, speedMultiplier, tickStatus, isConfused } from './status.js'
import { makeAggro, resetAggro, triggerAggro, updateAggro, AGGRO_MODE } from './aggro.js'
import { damageStructure, isWalkable } from './structures.js'
import { damagePlayer } from './players.js'
import { recordDamage, recordKill, recordCC, recordConfusion, recordSlow } from './combatStats.js'

// Object refs, not destructures (Phase 8A liveness — see aggro.js).
const E = BALANCE.ENEMY
const AG = BALANCE.AGGRO

export class EnemyStore {
  constructor(cap = BALANCE.ENEMY.MAX) {
    this.cap = cap
    this.count = 0
    this.nextId = 0
    this.id        = new Int32Array(cap)
    this.type      = new Uint8Array(cap)
    this.elite     = new Uint8Array(cap)
    this.weight    = new Uint8Array(cap)
    this.speed     = new Uint8Array(cap)
    this.x         = new Float64Array(cap)
    this.y         = new Float64Array(cap)
    this.hp        = new Float64Array(cap)
    this.maxHp     = new Float64Array(cap)
    this.damage    = new Float64Array(cap)
    this.attackCdMs      = new Float64Array(cap)
    this.attackReadyAt   = new Float64Array(cap)
    this.bounty    = new Int32Array(cap)
    this.radius    = new Float64Array(cap)
    this.kvx       = new Float64Array(cap)
    this.kvy       = new Float64Array(cap)
    this.moveSpeed = new Float64Array(cap)
    this.flags     = new Int32Array(cap)
    // Stuck watchdog (see the STUCK_MS block in tickEnemies). `stuckCost` is the
    // cost-field value this body last sat on; `stuckMs` is how long it has held
    // that exact value while neither descending nor attacking anything.
    this.stuckCost = new Float64Array(cap)
    this.stuckMs   = new Float64Array(cap)
    // Per-slot effect state (preallocated, reset on spawn — not per-tick alloc).
    this.status = Array.from({ length: cap }, makeStatus)
    this.aggro  = Array.from({ length: cap }, makeAggro)
    // Reusable spatial index + per-tick tile→structure-index scratch.
    this.collision = new CollisionIndex(cap)
    this.tileStruct = new Int32Array(N_TILES)
  }

  spawn({ type, elite, x, y }, now) {
    if (this.count >= this.cap) return -1
    const i = this.count++
    const prof = elite ? eliteProfile(type) : baseProfile(type)
    const cat = E.BASE[type]
    this.id[i] = this.nextId++
    this.type[i] = type
    this.elite[i] = elite ? 1 : 0
    this.weight[i] = prof.weight
    this.speed[i] = prof.speed
    this.x[i] = x; this.y[i] = y
    this.hp[i] = this.maxHp[i] = cat.hp * (elite ? E.ELITE.hpMult : 1)
    this.damage[i] = cat.damage * (elite ? E.ELITE.damageMult : 1)
    this.attackCdMs[i] = cat.attackCooldownMs
    this.attackReadyAt[i] = now
    this.bounty[i] = cat.bounty * (elite ? E.ELITE.bountyMult : 1)
    this.radius[i] = elite ? Math.min(cat.radius * E.ELITE.radiusMult, E.ELITE.radiusCap) : cat.radius
    this.kvx[i] = 0; this.kvy[i] = 0
    this.stuckCost[i] = Infinity; this.stuckMs[i] = 0
    this.moveSpeed[i] = E.SPEED_PX[prof.speed]
    resetStatus(this.status[i])
    resetAggro(this.aggro[i])
    this.flags[i] = statusFlags({ elite: !!elite })
    return i
  }

  // Swap-remove: last slot fills the hole, so slots stay dense 0..count-1. The
  // status/aggro OBJECTS are swapped (not copied) so identity follows the slot.
  removeAt(i) {
    const last = --this.count
    if (i !== last) {
      this.id[i] = this.id[last]; this.type[i] = this.type[last]; this.elite[i] = this.elite[last]
      this.weight[i] = this.weight[last]; this.speed[i] = this.speed[last]
      this.x[i] = this.x[last]; this.y[i] = this.y[last]
      this.hp[i] = this.hp[last]; this.maxHp[i] = this.maxHp[last]
      this.damage[i] = this.damage[last]
      this.attackCdMs[i] = this.attackCdMs[last]; this.attackReadyAt[i] = this.attackReadyAt[last]
      this.bounty[i] = this.bounty[last]; this.radius[i] = this.radius[last]
      this.kvx[i] = this.kvx[last]; this.kvy[i] = this.kvy[last]
      this.stuckCost[i] = this.stuckCost[last]; this.stuckMs[i] = this.stuckMs[last]
      this.moveSpeed[i] = this.moveSpeed[last]; this.flags[i] = this.flags[last]
      const st = this.status[i]; this.status[i] = this.status[last]; this.status[last] = st
      const ag = this.aggro[i];  this.aggro[i] = this.aggro[last];   this.aggro[last] = ag
    }
  }
}

// Spawn every scheduled enemy whose time has come (fightElapsedMs). Advances
// state.spawnIndex; the caller flips spawnComplete once it reaches the end.
export function spawnDueEnemies(state, now) {
  const sched = state.spawnSchedule
  while (state.spawnIndex < sched.length && sched[state.spawnIndex].atMs <= state.fightElapsedMs) {
    const ev = sched[state.spawnIndex++]
    const gate = CONFIG.GATES[ev.gate]
    state.enemyStore.spawn(
      { type: ev.type, elite: ev.elite, x: tileToWorldX(gate.gx), y: tileToWorldY(gate.gy) },
      now,
    )
  }
}

// Hall AABB edge-distance from a point (0 when inside). O(1) — the hall is a
// single known footprint, unlike the many structures (those use the tile index).
function hallEdgeDist(hall, px, py) {
  const minX = hall.gx * TILE_SIZE, minY = hall.gy * TILE_SIZE
  const maxX = minX + hall.w * TILE_SIZE, maxY = minY + hall.h * TILE_SIZE
  const dx = px < minX ? minX - px : px > maxX ? px - maxX : 0
  const dy = py < minY ? minY - py : py > maxY ? py - maxY : 0
  return Math.hypot(dx, dy)
}

// Unit vector from a point toward the nearest point on the hall AABB (0,0 when
// already inside it). The flow field is TILE-resolution and terminates on the
// ring of tiles around the hall — all seeded at cost 0, so none of them has a
// strictly-lower neighbour and chooseStepDir correctly reports "no step left".
// The last sub-tile leg to the goal is therefore the caller's job, not the
// field's; see the k === -1 branch in tickEnemies.
function hallSeekDir(hall, px, py) {
  const minX = hall.gx * TILE_SIZE, minY = hall.gy * TILE_SIZE
  const maxX = minX + hall.w * TILE_SIZE, maxY = minY + hall.h * TILE_SIZE
  const cx = px < minX ? minX : px > maxX ? maxX : px
  const cy = py < minY ? minY : py > maxY ? maxY : py
  const dx = cx - px, dy = cy - py
  const d = Math.hypot(dx, dy)
  return d > 0 ? [dx / d, dy / d] : [0, 0]
}

// Build the per-tick tile→structure-index lookup (O(structures), no alloc) so an
// enemy at a wall resolves the structure it's attacking in O(1) instead of the
// linear scan the spec warns against.
function indexStructures(state) {
  const idx = state.enemyStore.tileStruct
  idx.fill(-1)
  const structs = state.structures
  for (let s = 0; s < structs.length; s++) {
    const st = structs[s]
    for (let dy = 0; dy < st.h; dy++) {
      for (let dx = 0; dx < st.w; dx++) {
        const tx = st.gx + dx, ty = st.gy + dy
        if (inBounds(tx, ty)) idx[tileIdx(tx, ty)] = s
      }
    }
  }
}

// Resolve the structure covering a tile to an OBJECT, or null.
//
// `tileStruct` is built once per tick (indexStructures) but destroyStructure
// splices `state.structures` mid-loop, so a stored INDEX can be out of range —
// or, worse, silently point at a different structure — by the time a later
// enemy in the same tick reads it. An enemy would then bash a structure it is
// nowhere near. Resolving to the object immediately and re-verifying that it
// still covers the tile it was indexed under closes both, since nothing
// downstream can be shifted out from under an object reference.
//
// The walkable-underfoot branch has carried this guard since Amendment A3.1
// while the two wall-bash producers did not. Task 16's confusion probe would
// have been a third unguarded producer; one shared resolver beats a fourth copy
// of the check (Task 16 review, finding F3).
function structAtTile(state, store, tx, ty) {
  const si = store.tileStruct[tileIdx(tx, ty)]
  const s = si >= 0 && si < state.structures.length ? state.structures[si] : null
  if (!s) return null
  return tx >= s.gx && tx < s.gx + s.w && ty >= s.gy && ty < s.gy + s.h ? s : null
}

// How long a body may hold one cost-field value, attacking nothing, before the
// watchdog in tickEnemies lets it bash its way out.
//
// 30 s, and that number was measured rather than picked. A real lock lasts
// forever, so ANY threshold breaks it and the only thing the threshold buys is
// how many NON-locks get caught with it. At 10 s the watchdog fired in 21-33% of
// runs across the 576-cell matrix — those are genuine transient jams that would
// have cleared on their own, and letting them chew barricades is a balance
// change nobody asked for. At 30 s it fires in 1.4-4.2% of runs (2, 3, 2 and 6
// runs per 144-cell arm), never more than once in a run, while every permanent
// lock still resolves an order of magnitude inside the harness's own 1000 s
// stall detector. See docs/reviews/2026-08-02-firepit-hang-fix.md.
export const STUCK_ESCAPE_MS = 30_000

// The solid tile a stuck body is physically pressed against, as a structure, or
// null. Same 3x3 neighbourhood and same circle-vs-AABB test resolveTilePushout
// uses — this asks "what is pushing me out", which is exactly what the watchdog
// wants to hit. Nearest overlap wins; the scan order breaks ties deterministically.
function overlappedWall(state, store, i) {
  const x = store.x[i], y = store.y[i], r = store.radius[i]
  const gx = worldToTileX(x), gy = worldToTileY(y)
  let best = null, bestD2 = Infinity
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const tx = gx + ox, ty = gy + oy
      if (!inBounds(tx, ty)) continue
      if (state.costField.wallBand[tileIdx(tx, ty)] === BAND_NONE) continue
      const minX = tx * TILE_SIZE, minY = ty * TILE_SIZE
      const px = x < minX ? minX : x > minX + TILE_SIZE ? minX + TILE_SIZE : x
      const py = y < minY ? minY : y > minY + TILE_SIZE ? minY + TILE_SIZE : y
      const dx = x - px, dy = y - py
      const d2 = dx * dx + dy * dy
      if (d2 > r * r || d2 >= bestD2) continue
      const s = structAtTile(state, store, tx, ty)
      if (s) { best = s; bestD2 = d2 }
    }
  }
  return best
}

// Clamp an enemy's body inside the arena. THE flow-field stuck failsafe (spec
// §5): pushout/collision can carry a body past the map edge onto an off-grid
// tile where the cost field has no descent (chooseStepDir returns -1) and the
// enemy hangs forever — the CP2 wave-6 soft-lock. Keeping every enemy on a valid
// in-bounds tile is necessary but NOT sufficient, and the invariant this comment
// used to claim ("every in-bounds non-hall tile has a strictly-lower-cost
// neighbour") is false: the tiles seeded around the hall are all cost 0, so each
// of them is a terminal local minimum. (12 tiles in general; 8 for the SHIPPED
// hall, whose footprint sits on the bottom map edge so setHall's outer row is
// out of bounds.) They are the ONLY terminal minima — every other tile's
// Dijkstra predecessor is a strictly-lower legal neighbour, since every edge
// weight is >= 1 and the corner-cut guard is symmetric between expansion and
// descent. That is by construction, not a
// defect in the field — it is where the field is supposed to end. The enemy-side
// consequence (no move, no attack, ~30 px short of the hall) was the hall-ring
// soft-lock, and it is handled by the k === -1 seek branch in tickEnemies.
function clampToArena(store, i) {
  const r = store.radius[i]
  if (store.x[i] < r) store.x[i] = r
  else if (store.x[i] > CONFIG.MAP_WIDTH - r) store.x[i] = CONFIG.MAP_WIDTH - r
  if (store.y[i] < r) store.y[i] = r
  else if (store.y[i] > CONFIG.MAP_HEIGHT - r) store.y[i] = CONFIG.MAP_HEIGHT - r
}

// One simulation tick for the whole horde. Mutates the store, damages
// structures/hall, and updates state.livingEnemyCount + state.waveBounty.
export function tickEnemies(state, now, dtMs) {
  const store = state.enemyStore
  const { costField, players, hall } = state
  const dtSec = dtMs / 1000
  const prox2 = AG.PROXIMITY_PX * AG.PROXIMITY_PX
  const np = players.length

  indexStructures(state)

  for (let i = 0; i < store.count; i++) {
    // 1) Status: decay + burn DoT. A lethal burn removes the enemy in place.
    // CC-seconds (Task 3b): read root/freeze BEFORE tickStatus decrements
    // them, so the tick a status expires on still counts toward ccSeconds —
    // this reports the nominal applied CC duration, not the movement-gated
    // duration (speedMultiplier reads the post-decrement value, so the enemy
    // is actually unrooted and moving for the final counted tick).
    const st = store.status[i]
    const wasHardCC = st.rootMs > 0 || st.freezeMs > 0
    const burn = tickStatus(st, dtMs)
    const wasSlowed = st.slowMs > 0
    if (wasHardCC) recordCC(state, dtSec)
    if (wasSlowed) recordSlow(state, dtSec)
    if (burn > 0 && damageEnemy(state, i, burn)) { i--; continue }

    clampToArena(store, i)                 // a body carried off-grid last tick
    const ex = store.x[i], ey = store.y[i]

    // 2) Aggro: nearest alive player in proximity triggers a chase (players/bots
    //    are valid targets). Searched inline with index loops — the hot path
    //    must not allocate per enemy per tick (spec §5).
    //    Steam Vent confusion (§6.1) suspends TARGET ACQUISITION: a confused
    //    enemy never picks up a new chase. The FSM itself keeps ticking below,
    //    so an existing chase ages out normally instead of being frozen mid-
    //    state and resuming stale when confusion lifts.
    const confused = isConfused(st)
    if (confused) recordConfusion(state, dtSec)
    const ag = store.aggro[i]
    let nearP = null, nearD2 = Infinity
    for (let pi = 0; pi < np; pi++) {
      const p = players[pi]
      if (p.alive === false) continue
      const dx = p.x - ex, dy = p.y - ey
      const d2 = dx * dx + dy * dy
      if (d2 < nearD2) { nearD2 = d2; nearP = p }
    }
    if (!confused && nearP && nearD2 <= prox2) triggerAggro(ag, nearP.id, ex, ey, now, false)

    let target = null
    if (ag.state === 'chase') {
      for (let pi = 0; pi < np; pi++) {
        const p = players[pi]
        if (p.id === ag.targetId && p.alive !== false) { target = p; break }
      }
    }
    const inProx = !!target && sq(target.x - ex) + sq(target.y - ey) <= prox2
    const mode = updateAggro(ag, ex, ey, target, inProx, now)

    // 3) Melee target — computed in EVERY steering mode. A chasing enemy pressed
    //    against the hall still bashes it (M1/H3 fix): a stationary player can no
    //    longer perfectly shield the hall by holding aggro. Structure bulldoze
    //    stays march-only (attack the wall on your cheapest path, not every wall
    //    you pass). 4) then picks the direction.
    let dirX = 0, dirY = 0
    let attackStruct = null
    let attackWalkable = null
    let attackPlayer = null
    const attackHall = hallEdgeDist(hall, ex, ey) <= E.MELEE_RANGE_PX + store.radius[i]
    if (confused) {
      // CONFUSION (§6.1): "normal hall-march and player-chase steering are
      // suspended" — the enemy walks the seeded wander heading status.js chose
      // for it, re-picked on a fixed interval rather than every tick. Only the
      // steering CHOICE is overridden: the cost field is never modified, and
      // pushout + clampToArena still run below, so confusion can never carry a
      // body through a wall or off the map.
      //
      // Contact attacks survive, which is what keeps this out of hall-ring
      // soft-lock territory (Amendment A4 names confusion as that bug's exact
      // signature). `attackHall` above is pure edge distance and is computed in
      // every mode, so a confused enemy in contact with the hall keeps bashing
      // it and the wave still resolves. Same for the walkable-underfoot branch
      // further down. For walls, the probe is the heading direction rather than
      // the cheapest path: a confused enemy bashes what it blunders into, so it
      // cannot stand inert against a wall for the length of an episode.
      //
      // Deliberately NOT included: melee against a player. `attackPlayer` is
      // only ever set inside the chase branch, and chasing is exactly what §6.1
      // suspends — contact melee is part of the chase. Letting a confused enemy
      // hit any adjacent player would make confusion offensively stronger,
      // which no part of the spec asks for.
      dirX = st.confuseHx; dirY = st.confuseHy
      if (dirX !== 0 || dirY !== 0) {
        const tx = worldToTileX(ex + dirX * (store.radius[i] + 1))
        const ty = worldToTileY(ey + dirY * (store.radius[i] + 1))
        if (inBounds(tx, ty) && costField.wallBand[tileIdx(tx, ty)] !== BAND_NONE) {
          attackStruct = structAtTile(state, store, tx, ty)
        }
      }
    } else if (mode === AGGRO_MODE.CHASE && target) {
      const dx = target.x - ex, dy = target.y - ey
      const d = Math.hypot(dx, dy) || 1
      dirX = dx / d; dirY = dy / d
      // Contact melee vs the chased player (the Phase-3 deferral closed):
      // edge-to-edge within melee reach.
      if (d <= store.radius[i] + CONFIG.PLAYER_RADIUS + E.MELEE_RANGE_PX) attackPlayer = target
      else {
        // Chase blocked by a wall (CP3 C1): a player holding aggro across a
        // structure used to freeze the chaser against it forever (bulldoze was
        // march-only) while meleeing it safely through the wall. Bash the wall
        // in the way — the structure analog of the unconditional attackHall rule.
        const tx = worldToTileX(ex + dirX * (store.radius[i] + 1))
        const ty = worldToTileY(ey + dirY * (store.radius[i] + 1))
        if (inBounds(tx, ty) && costField.wallBand[tileIdx(tx, ty)] !== BAND_NONE) {
          attackStruct = structAtTile(state, store, tx, ty)
        }
      }
    } else {
      const gx = worldToTileX(ex), gy = worldToTileY(ey)
      const k = chooseStepDir(costField, gx, gy)
      if (k !== -1) {
        const tx = gx + NEIGHBOR_DX[k], ty = gy + NEIGHBOR_DY[k]
        if (costField.wallBand[tileIdx(tx, ty)] !== BAND_NONE) {
          attackStruct = structAtTile(state, store, tx, ty)  // bulldoze the wall on the path
        } else {
          // Steer at the CENTRE of the tile the field chose, not along the raw
          // compass axis to it. The field is tile-resolution and knows nothing
          // about body radius; a pure-axis heading carries whatever lateral
          // offset the body already had straight into the shoulder of a 1-tile
          // lane gap. MAX_COLLISION_RADIUS guarantees a 28px body FITS a 32px
          // gap, but only inside a 4px lateral window, and nothing used to steer
          // the body into that window: an off-centre marcher pressed on the
          // barricade corner, pushout ejected it back, and — because the wall it
          // touched was not its chosen step tile — it had no attack either. No
          // move and no attack is the hall-ring soft-lock signature, and it is
          // what produced the Firepit maze-B stalls
          // (docs/reviews/2026-08-02-firepit-hang-fix.md). Aiming at the tile
          // centre is what "descend to that tile" already meant; it also gives
          // the crowd-separation limit cycle a restoring force to fight, instead
          // of a heading that is indifferent to being shoved sideways.
          const ddx = tileToWorldX(tx) - ex, ddy = tileToWorldY(ty) - ey
          const dd = Math.hypot(ddx, ddy) || 1
          dirX = ddx / dd; dirY = ddy / dd
        }
      } else if (!attackHall) {
        // Terminal tile: the field has no downhill step left. Close the last
        // sub-tile leg on the goal directly. Without this an enemy that entered
        // a ring tile at its far edge had NO move and NO attack — inert forever,
        // holding the wave open: the hall-ring soft-lock. Pushout still runs
        // below, so seeking cannot carry a body into the hall or through a wall.
        //
        // Also the general failsafe for any k === -1 the field invariant above
        // clampToArena did not anticipate: walking at the goal beats standing
        // still, and if the enemy is genuinely walled in it bulldozes on the
        // next tick that gives it a step.
        ;[dirX, dirY] = hallSeekDir(hall, ex, ey)
      }
    }

    // Walkable structures push no band onto the cost field, so NEITHER bulldoze
    // path above can ever resolve one — before this branch nothing in the game
    // could damage a Snare Post, a special or a fusion. With fusions permanent
    // and enemy-destruction their only removal path, that made them immortal
    // (redesign Amendment A1.1/A3.1). An enemy whose body is over a walkable
    // structure attacks it, at LOWEST priority: a wall on the path, the hall and
    // a chased player all still come first, and steering is untouched — the
    // enemy keeps marching while it chews, so an attrition tile can never become
    // a stopping point the way a wall does.
    if (!attackStruct) {
      const cand = structAtTile(state, store, worldToTileX(ex), worldToTileY(ey))
      if (cand && isWalkable(cand.type)) attackWalkable = cand
    }

    // THE STUCK WATCHDOG. "No move and no attack" is this project's soft-lock
    // signature — the CP2 off-grid hang, the hall ring, the crowd-separation
    // limit cycle and the lane-gap shoulder wedge are four different geometries
    // producing that same terminal state, and each was found by a full session of
    // measurement. Each previous fix closed exactly one of them; nothing
    // guaranteed there was not a fifth. This is that guarantee, and it is a
    // failsafe rather than a mechanic: a body that has held ONE cost-field value,
    // while attacking nothing at all, for STUCK_ESCAPE_MS is not queueing or
    // fighting — it is locked, because any real progress changes its tile's cost
    // and any real engagement sets an attack target. It then bashes whatever wall
    // its body is actually pressed against, which is both the physically obvious
    // reading and a guaranteed terminator: the wall has finite HP, so the jam
    // opens.
    //
    // Deliberately NOT a steering change: steering is what the gap-centre fix
    // above corrects, and a second steering rule would perturb every measured
    // baseline. It is also NOT free — see STUCK_ESCAPE_MS for the measured
    // firing rate and why the threshold is where it is.
    //
    // Once armed the body keeps swinging for as long as it stays locked, gated by
    // its normal attack cooldown, rather than re-arming a fresh 30 s timer per
    // swing: a 40 HP barricade would otherwise take minutes to fall. The counter
    // below therefore counts LOCKS ENTERED, not swings.
    const curCost = costField.cost[tileIdx(worldToTileX(ex), worldToTileY(ey))]
    if (attackPlayer || attackHall || attackStruct || attackWalkable || curCost !== store.stuckCost[i]) {
      store.stuckCost[i] = curCost
      store.stuckMs[i] = 0
    } else {
      const was = store.stuckMs[i]
      store.stuckMs[i] = was + dtMs
      if (store.stuckMs[i] >= STUCK_ESCAPE_MS) {
        const wall = overlappedWall(state, store, i)
        if (wall) attackStruct = wall
        // Counted, not just done: a failsafe nobody can see the firing rate of
        // is indistinguishable from a mechanic quietly carrying the game.
        if (was < STUCK_ESCAPE_MS) state.stuckEscapes = (state.stuckEscapes ?? 0) + 1
      }
    }

    // 4) Integrate movement (flow/chase × slow) + knockback. Root/freeze zero the
    //    move speed but NOT the knockback velocity — displacement is independent.
    //    Pushout runs HERE with the pre-move anchor (ax,ay) — the CP0 motion-aware
    //    eject needs the came-from side to avoid popping a body through a wall.
    const moveSpeed = store.moveSpeed[i] * speedMultiplier(st)
    const ax = ex, ay = ey
    integrate(store.x, store.y, store.kvx, store.kvy, i, dirX, dirY, moveSpeed, dtSec)
    resolveTilePushout(store.x, store.y, i, store.radius[i], solidFn(costField), ax, ay)
    clampToArena(store, i)

    // 5) Melee resolution (enemy → player/structure/hall) on the attack
    //    cooldown. A chased player in contact takes priority (the enemy is
    //    aggro'd on them); otherwise hall over structure.
    if (now >= store.attackReadyAt[i]) {
      if (attackPlayer) {
        damagePlayer(state, attackPlayer, store.damage[i], now)
        store.attackReadyAt[i] = now + store.attackCdMs[i]
      } else if (attackHall) {
        hall.hp -= store.damage[i]
        store.attackReadyAt[i] = now + store.attackCdMs[i]
      } else if (attackStruct) {
        damageStructure(state, attackStruct, store.damage[i])
        store.attackReadyAt[i] = now + store.attackCdMs[i]
      } else if (attackWalkable) {
        damageStructure(state, attackWalkable, store.damage[i])
        store.attackReadyAt[i] = now + store.attackCdMs[i]
      }
    }

    // 6) Refresh wire flags for the client status overlays.
    store.flags[i] = statusFlags({
      elite: store.elite[i] === 1,
      burn: st.burnMs > 0, wet: st.wetMs > 0,
      slow: st.slowMs > 0, root: st.rootMs > 0, freeze: st.freezeMs > 0,
      aggro: ag.state === 'chase',
      confused: st.confusedMs > 0,
    })
  }

  // 7) Enemy-enemy separation (allocation-free, tile-indexed), then re-clamp:
  //    the crowd half-push can carry an edge body back off the grid.
  store.collision.rebuild(store.count, store.x, store.y)
  store.collision.resolveCircles(store.x, store.y, store.radius)
  for (let i = 0; i < store.count; i++) clampToArena(store, i)

  // Keep the field fresh after this tick's melee: walls that dropped a band or
  // were bulldozed dirty-flag it; the recompute is throttled to <=1 per 0.25s.
  costField.maybeRecompute(now)

  state.livingEnemyCount = store.count
}

// solidAt bound to a field — a single closure per tick (not per enemy), reused
// across the loop, so the hot path stays allocation-free per enemy.
let _solidField = null, _solidFn = null
function solidFn(field) {
  if (_solidField !== field) { _solidField = field; _solidFn = (gx, gy) => field.solidAt(gx, gy) }
  return _solidFn
}

export function killEnemy(state, i) {
  state.waveBounty = (state.waveBounty || 0) + state.enemyStore.bounty[i]
  state.enemyStore.removeAt(i)
}

// Deal `amount` to enemy slot i; swap-removes and accrues bounty if it dies.
// Returns true if the enemy died (its slot now holds a different enemy — the
// caller must re-visit index i). Shared by burn DoT and tower offense.
//
// `meta` is optional source attribution ({ category, ownerId, label }) for the
// Phase 8C combat-accounting instrument (combatStats.js). Every damage source
// in the game passes through this one function, so it is the only place a hit
// or a kill is ever recorded — callers with no meta (burn DoT) still deal
// damage as before, just uncounted. recordDamage/recordKill no-op when
// state.combatStats is absent (normal play, every other test).
export function damageEnemy(state, i, amount, meta = null) {
  const id = state.enemyStore.id[i]
  state.enemyStore.hp[i] -= amount
  if (meta) recordDamage(state, meta, amount, id)
  if (state.enemyStore.hp[i] <= 0) {
    if (meta) recordKill(state, meta)
    killEnemy(state, i)
    return true
  }
  return false
}

const sq = v => v * v
