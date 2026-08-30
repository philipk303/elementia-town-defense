// Structure lifecycle — place / sell / damage / destroy — ported from ez-ctf's
// placed.js with the 3 spec'd fixes (spec §5 "Placement (tile-snapped)"):
//   - Caps REJECT, not evict (an occupied tile is a hard reject).
//   - Repair range is edge-distance (see repair.js, not this file).
//   - placement/destruction bump placedVersion (the field-recompute + static-
//     resend hook); hp mutation does NOT — it rides the per-emit dynamic `ds`
//     wire channel instead (server/net/encode.js, Task 8), so nonlethal
//     damage never forces a full static resend.
//
// Element-lock (spec §2): a human may build their own element's special
// structure, or any bot-controlled element's special structure, never another
// human's. Marketplace build-time farm-ratio gate mirrors the dormancy rule in
// dormancy.js (2 standing farms per marketplace, FIFO priority to the oldest).

import {
  CONFIG, STRUCTURE_TYPES, SPECIAL_TYPE_ELEMENT, GATES_LIST, BUILDABLE_TYPES, WALKABLE_TYPES,
  STRUCTURE_SIZE, ORIENTATIONS, DIRECTIONS, DIRECTIONAL_TYPES, FUSION_TYPES,
} from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { inBounds, tileIdx, TILES_W, TILES_H } from './grid.js'
import { PHASES } from './phaseMachine.js'
import { recomputeDormancy } from './dormancy.js'
import { proposeFusion, invalidateProposalsForStructure } from './combos.js'
import { hpToBand, BAND_NONE } from './costField.js'

// Per-state ID space (Gate 1 finding 2.1: a module-global counter handed out
// colliding IDs across two concurrently-live rooms, since each room's
// createGameState only ever reset it back to 0). Lives on the state object
// itself so each room's structures are independent no matter how many rooms
// are live at once.
function allocStructureId(state) {
  const id = state.nextStructureId ?? 0
  state.nextStructureId = id + 1
  return id
}

// Footprint in tiles. `orient` is 'H' (default) or 'V'; vertical simply
// transposes, so only the horizontal form lives in the table. A 1x1 or square
// type is orientation-invariant and transposes to itself.
export function footprint(type, orient = 'H') {
  if (type === STRUCTURE_TYPES.HALL) return { w: CONFIG.HALL.w, h: CONFIG.HALL.h }
  const base = STRUCTURE_SIZE[type] || { w: 1, h: 1 }
  return orient === 'V' ? { w: base.h, h: base.w } : { w: base.w, h: base.h }
}

function tilesOf(gx, gy, w, h) {
  const tiles = []
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) tiles.push([gx + dx, gy + dy])
  return tiles
}

// Tiles a PLACED structure occupies — reads its stored w/h, so it stays correct
// for either orientation without re-deriving it.
function tilesOfStructure(s) {
  return tilesOf(s.gx, s.gy, s.w ?? 1, s.h ?? 1)
}

// Any tile of `type`'s footprint at (gx,gy) that overlaps the hall or an
// existing structure. Used both to reject builds and to look up a structure
// a click landed on.
export function findStructureAt(state, gx, gy) {
  for (const s of state.structures) {
    for (const [tx, ty] of tilesOfStructure(s)) {
      if (tx === gx && ty === gy) return s
    }
  }
  return null
}

function overlapsHall(state, gx, gy) {
  const { gx: hgx, gy: hgy, w, h } = state.hall
  return gx >= hgx && gx < hgx + w && gy >= hgy && gy < hgy + h
}

function inNoBuildArc(state, gx, gy) {
  const cx = gx * 32 + 16, cy = gy * 32 + 16
  const dx = cx - state.hall.x, dy = cy - state.hall.y
  return dx * dx + dy * dy < BALANCE.NO_BUILD_ARC_RADIUS_PX ** 2
}

function canPlaceElement(state, player, type) {
  const el = SPECIAL_TYPE_ELEMENT[type]
  if (!el) return true // not an element-locked type
  if (player.element === el) return true
  const owner = state.players.find(p => p.element === el)
  return !!owner?.isBot
}

function livingFarmCount(state) {
  return state.structures.filter(s => s.type === STRUCTURE_TYPES.FARM).length
}

function livingMarketplaceCount(state) {
  return state.structures.filter(s => s.type === STRUCTURE_TYPES.MARKETPLACE).length
}

// Pushes a structure's HP band onto the cost field (spec §5: structures are
// traversable-at-a-cost like walls, not hard obstacles — HP band drives entry
// cost; a structure's own tiles are also where the hpToBand quantization
// bites). No-op when the caller's state carries no cost field (unit tests).
export function isWalkable(type) { return WALKABLE_TYPES.includes(type) }

function syncFieldBand(state, structure, band) {
  if (!state.costField) return
  if (isWalkable(structure.type)) return   // walkable: never on the field at all
  for (const [tx, ty] of tilesOfStructure(structure)) {
    state.costField.setWallBand(tx, ty, band)
  }
}

// Re-push a structure's own band after its geometry or HP changed under it —
// used by fusion completion (combos.js), which cannot reach the private helper
// above and must not duplicate the walkable/no-field rules.
export function refreshFieldBand(state, structure) {
  syncFieldBand(state, structure, hpToBand(structure.hp, structure.maxHp))
}

// UX-only reachability check (spec §5: "downgraded from a correctness pillar
// to a UX warning"). Deliberately independent of the live cost field: that
// field treats every structure as traversable-at-a-cost, so it is ALWAYS
// finite everywhere and can never actually flag a seal ("no wall-off
// exploit" is the point of that design). This is a separate hard-block
// flood fill from the hall (structures + hall footprint are solid) purely to
// catch an accidental maze-in-a-corner and warn the player — never a block.
function checkReachabilityWarning(state) {
  const blocked = new Uint8Array(TILES_W * TILES_H)
  for (const s of state.structures) {
    for (const [tx, ty] of tilesOfStructure(s)) blocked[tileIdx(tx, ty)] = 1
  }

  const visited = new Uint8Array(TILES_W * TILES_H)
  const queue = []
  const enqueue = (gx, gy) => {
    if (!inBounds(gx, gy)) return
    const i = tileIdx(gx, gy)
    if (blocked[i] || visited[i]) return
    visited[i] = 1
    queue.push(i)
  }
  for (const [hx, hy] of tilesOf(state.hall.gx, state.hall.gy, CONFIG.HALL.w, CONFIG.HALL.h)) {
    enqueue(hx + 1, hy); enqueue(hx - 1, hy); enqueue(hx, hy + 1); enqueue(hx, hy - 1)
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const cy = (queue[qi] / TILES_W) | 0, cx = queue[qi] - cy * TILES_W
    enqueue(cx + 1, cy); enqueue(cx - 1, cy); enqueue(cx, cy + 1); enqueue(cx, cy - 1)
  }

  for (const gate of GATES_LIST) {
    if (!visited[tileIdx(gate.gx, gate.gy)]) return 'self-sealing'
  }
  return null
}

// Orientation is chosen at placement for the 2x1 elemental structures; 1x1
// and square types transpose to themselves, so an unspecified orient safely
// defaults to 'H'. An explicit-but-bogus value ('diagonal', etc.) is rejected
// rather than silently coerced. Direction is a separate, independently
// selected cardinal (combat-structure redesign §2) required by exactly
// DIRECTIONAL_TYPES and forbidden for everything else — supplying one for a
// non-directional type, or omitting/garbling it for a directional type, is
// an invalid combination and is rejected, not coerced.
function resolveOrientAndDirection(type, opts) {
  if (opts.orient !== undefined && !ORIENTATIONS.includes(opts.orient)) {
    return { ok: false, reason: 'invalid-orientation' }
  }
  const orient = opts.orient === 'V' ? 'V' : 'H'

  const needsDirection = DIRECTIONAL_TYPES.includes(type)
  const dirRaw = opts.dir ?? null
  if (needsDirection ? !DIRECTIONS.includes(dirRaw) : dirRaw !== null) {
    return { ok: false, reason: 'invalid-direction' }
  }
  return { ok: true, orient, dir: needsDirection ? dirRaw : null }
}

export function placeStructure(state, player, type, gx, gy, now, opts = {}) {
  if (!BUILDABLE_TYPES.includes(type)) return { ok: false, reason: 'invalid-type' }
  if (!Number.isInteger(gx) || !Number.isInteger(gy)) return { ok: false, reason: 'invalid-tile' }
  if (state.phase !== PHASES.BUILD) return { ok: false, reason: 'wrong-phase' }

  const resolved = resolveOrientAndDirection(type, opts)
  if (!resolved.ok) return resolved
  const { orient, dir } = resolved
  const { w, h } = footprint(type, orient)
  const tiles = tilesOf(gx, gy, w, h)
  for (const [tx, ty] of tiles) {
    if (!inBounds(tx, ty)) return { ok: false, reason: 'out-of-bounds' }
  }
  for (const [tx, ty] of tiles) {
    if (overlapsHall(state, tx, ty) || findStructureAt(state, tx, ty)) {
      return { ok: false, reason: 'occupied' }
    }
  }
  for (const [tx, ty] of tiles) {
    if (inNoBuildArc(state, tx, ty)) return { ok: false, reason: 'no-build-arc' }
  }
  if (!canPlaceElement(state, player, type)) return { ok: false, reason: 'element-locked' }
  if (type === STRUCTURE_TYPES.MARKETPLACE) {
    const required = (livingMarketplaceCount(state) + 1) * BALANCE.FARMS_PER_MARKETPLACE
    if (livingFarmCount(state) < required) return { ok: false, reason: 'farm-shortage' }
  }

  const catalog = BALANCE.STRUCTURES[type]
  const free = !!opts.free
  if (!free && (player.gold ?? 0) < catalog.cost) return { ok: false, reason: 'insufficient-gold' }

  const structure = {
    id: allocStructureId(state),
    type,
    ownerId: player.id,
    gx, gy, w, h, orient, dir,
    hp: catalog.hp, maxHp: catalog.hp,
    dormant: false,
    createdAt: now,
  }
  state.structures.push(structure)
  state.placedVersion = (state.placedVersion || 0) + 1
  syncFieldBand(state, structure, hpToBand(structure.hp, structure.maxHp))
  if (!free) player.gold -= catalog.cost

  recomputeDormancy(state)
  // Placing a partner no longer fuses anything on the spot (Task 13): it opens
  // a proposal both ingredients' owners must accept. Until then this placement
  // is an ordinary elemental structure, doing its own job.
  const fusionProposal = proposeFusion(state, structure, player, now)

  const warning = checkReachabilityWarning(state)
  return { ok: true, structure, warning, fusionProposal }
}

export function sellStructure(state, player, structureId) {
  if (state.phase !== PHASES.BUILD) return { ok: false, reason: 'wrong-phase' }
  const structure = state.structures.find(s => s.id === structureId)
  if (!structure) return { ok: false, reason: 'not-found' }
  // Fusions are permanent (§2 "Fusion permanence", Amendment A1.1): team-owned,
  // never sold, unfused, rotated or redirected. Enemy destruction is the only
  // removal path, and it never restores the consumed ingredients.
  if (FUSION_TYPES.includes(structure.type)) return { ok: false, reason: 'unsellable' }

  const cost = BALANCE.STRUCTURES[structure.type].cost
  const refund = Math.ceil(cost * BALANCE.SELL_REFUND_RATE)
  destroyStructure(state, structure)
  if (player) player.gold = (player.gold ?? 0) + refund
  return { ok: true, refund }
}

// Direct (unvalidated) structure construction for server-seeded content: the
// pre-built starting economy (spec §3 "Starting state") and bot-element free
// specials (spec §3 "Each player also places 1 free special structure").
// Trusted caller only — skips phase/cost/geometry checks, still syncs the
// cost field and dormancy like a normal placement.
export function placeSeedStructure(state, type, gx, gy, now, ownerId = null, orient = 'H', dir = null) {
  const catalog = BALANCE.STRUCTURES[type]
  const { w, h } = footprint(type, orient)
  // Directional types always carry a direction on the wire; a seeded one
  // that didn't get an explicit dir still needs a deterministic default.
  const resolvedDir = DIRECTIONAL_TYPES.includes(type) ? (dir ?? 'S') : null
  const structure = {
    id: allocStructureId(state),
    type, ownerId, gx, gy, w, h, orient, dir: resolvedDir,
    hp: catalog.hp, maxHp: catalog.hp,
    dormant: false,
    createdAt: now,
  }
  state.structures.push(structure)
  state.placedVersion = (state.placedVersion || 0) + 1
  syncFieldBand(state, structure, hpToBand(structure.hp, structure.maxHp))
  recomputeDormancy(state)
  return structure
}

// Returns true iff the structure was destroyed by this damage call.
export function damageStructure(state, structure, amount) {
  structure.hp -= amount
  if (structure.hp <= 0) {
    structure.hp = 0
    destroyStructure(state, structure)
    return true
  }
  syncFieldBand(state, structure, hpToBand(structure.hp, structure.maxHp))
  return false
}

// Muddy Bog (§6.4 "destruction ends Bog-owned roots immediately") owns roots
// via status.js's `rootSourceId` (Amendment A2.2). A one-shot scan here, at
// the single removal funnel, is simpler than every Bog carrying a per-tick
// "am I still alive" check purely for this. The already-applied lingering
// slow from an earlier natural expiry is untouched — only the live root ends.
function clearBogOwnedRoots(state, structureId) {
  const store = state.enemyStore
  if (!store) return
  for (let i = 0; i < store.count; i++) {
    const status = store.status[i]
    if (status.rootSourceId === structureId && status.rootMs > 0) status.rootMs = 0
  }
}

export function destroyStructure(state, structure) {
  const idx = state.structures.indexOf(structure)
  if (idx < 0) return
  state.structures.splice(idx, 1)
  state.placedVersion = (state.placedVersion || 0) + 1
  syncFieldBand(state, structure, BAND_NONE)
  recomputeDormancy(state)
  if (structure.type === 'MUDDY_BOG') clearBogOwnedRoots(state, structure.id)
  // Every removal path funnels through here, so no pending proposal can outlive
  // one of its own ingredients.
  invalidateProposalsForStructure(state, structure.id)
}
