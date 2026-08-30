// Fusion proposal, consent and lifecycle (combat-structure redesign §2
// "Fusion creation" / "Fusion permanence", Amendment A1.1-A1.3) — build-time,
// deterministic, server-validated.
//
// GEOMETRY (changed when the elemental structures became 2x1): two elemental
// structures of different, pairable elements fuse only when their four occupied
// tiles form a COMPLETE 2x2 SQUARE — i.e. they are parallel and side-by-side.
// End-to-end (a 4x1 bar), perpendicular, L-shaped and corner-only arrangements
// do not qualify. The resulting 2x2 fusion is anchored at the top-left tile of
// that square, which is not necessarily either ingredient's anchor.
//
// CONSENT (Task 13, closing Gate 1 finding 2.2). Placing the second ingredient
// no longer fuses anything. It creates a PENDING PROPOSAL and mutates nothing:
// both structures stay standing, individually owned, doing their own jobs,
// until every required player accepts. Required = the initiator plus the human
// owner of each ingredient; a bot-owned or ownerless ingredient (the seeded bot
// specials are ownerless) requires nobody, so the initiating human confirms on
// its behalf in one step (Amendment A1.2) and fusion stays solo-reachable —
// which is also what keeps the measurement harness able to build fusions.
//
// A proposal ends exactly once, in exactly one of five ways: fused, rejected,
// expired, stale (an ingredient stopped existing or stopped forming the
// square), or cancelled (a required player left). Every ending pushes one
// event onto state.fusionEvents, which the room loop drains and broadcasts —
// the same drain idiom state.pendingLevelUp already uses.
//
// PERMANENCE (A1.1): the completed fusion is team-owned, unsellable (enforced
// in structures.js), teammate-repairable, and destruction never restores the
// ingredients. Fusing is deliberately a one-way trade.
//
// The L2 "diagonal combo" gate is GONE (Amendment A1.3): all six fusions are
// available from the start. Automatic retro-resolution on level-up could not be
// reconciled with a consent gate, and under permanence it would have handed
// players a structure they never agreed to.

import {
  SPECIAL_TYPE_ELEMENT, COMBO_TABLE, comboKey, CONFIG, DIRECTIONAL_TYPES, DIRECTIONS,
} from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { destroyStructure, refreshFieldBand } from './structures.js'

// The 2x2 square two ingredients form, or null if they do not form one.
// Parallel is enforced by requiring identical w/h; the exact-square test is the
// bounding box being 2x2, which their four tiles can only fill without overlap.
function fusionSquare(a, b) {
  if (a.w !== b.w || a.h !== b.h) return null
  const gx = Math.min(a.gx, b.gx), gy = Math.min(a.gy, b.gy)
  const maxX = Math.max(a.gx + a.w, b.gx + b.w)
  const maxY = Math.max(a.gy + a.h, b.gy + b.h)
  if (maxX - gx !== 2 || maxY - gy !== 2) return null
  return { gx, gy }
}

// The fusion `structure` would form with a standing partner, or null. Pure —
// this is what the placement preview and proposeFusion both read, so the
// client's "this will make a Steam Vent" hint and the server's proposal can
// never disagree. Iterates state.structures in placement order, so the partner
// chosen when a piece qualifies with two neighbours is deterministic.
//
// `accepts` lets a caller skip partners it cannot use. proposeFusion passes
// "not already spoken for": without it, a piece whose FIRST candidate is tied
// up in another pending proposal would be refused outright even though a
// second, free partner was sitting right there (Gate 6, non-blocking).
export function fusionCandidateFor(state, structure, accepts = null) {
  const el = SPECIAL_TYPE_ELEMENT[structure.type]
  if (!el) return null

  for (const neighbor of state.structures) {
    if (neighbor === structure) continue
    const neighborEl = SPECIAL_TYPE_ELEMENT[neighbor.type]
    if (!neighborEl || neighborEl === el) continue

    const comboType = COMBO_TABLE[comboKey(el, neighborEl)]
    if (!comboType) continue

    const square = fusionSquare(structure, neighbor)
    if (!square) continue
    if (accepts && !accepts(neighbor)) continue

    return { neighbor, comboType, gx: square.gx, gy: square.gy }
  }
  return null
}

function proposalsOf(state) {
  if (!state.fusionProposals) state.fusionProposals = []
  return state.fusionProposals
}

// Per-state id space, same reasoning as structures.js's allocStructureId: a
// module-global counter would hand out colliding proposal ids across two
// concurrently-live rooms.
function allocProposalId(state) {
  const id = state.nextFusionProposalId ?? 1
  state.nextFusionProposalId = id + 1
  return id
}

export function pendingProposalFor(state, structureId) {
  return proposalsOf(state).find(p => p.aId === structureId || p.bId === structureId) || null
}

function isHumanOwner(state, ownerId) {
  if (ownerId == null) return false
  const owner = (state.players || []).find(p => p.id === ownerId)
  return !!owner && !owner.isBot
}

// Initiator plus each ingredient's HUMAN owner. A bot-owned or ownerless
// ingredient contributes nobody (A1.2).
function requiredConsenters(state, a, b, initiator) {
  const ids = []
  const add = id => { if (id != null && !ids.includes(id)) ids.push(id) }
  if (initiator && !initiator.isBot) add(initiator.id)
  for (const s of [a, b]) if (isHumanOwner(state, s.ownerId)) add(s.ownerId)
  return ids
}

// Public, wire-safe view of a proposal (never hands the caller the live object).
export function describeProposal(p) {
  return {
    id: p.id, comboType: p.comboType, gx: p.gx, gy: p.gy,
    ingredients: [
      { id: p.aId, type: p.aType, ownerId: p.aOwnerId },
      { id: p.bId, type: p.bType, ownerId: p.bOwnerId },
    ],
    initiatorId: p.initiatorId,
    requiredIds: [...p.requiredIds],
    consentedIds: [...p.consentedIds],
    needsDirection: p.needsDirection,
    dir: p.dir,
    remainingMs: p.remainingMs,
  }
}

// Creates a pending proposal for a just-placed structure, or returns null when
// no partner qualifies. MUTATES NOTHING about either structure — that is the
// whole point of the consent gate.
export function proposeFusion(state, structure, initiator, now) {
  // One pending proposal per ingredient. A structure already spoken for is
  // skipped rather than blocking: both proposals could otherwise complete, and
  // the loser would silently consume a structure that no longer exists.
  if (pendingProposalFor(state, structure.id)) return null
  const cand = fusionCandidateFor(state, structure, n => !pendingProposalFor(state, n.id))
  if (!cand) return null

  const proposal = {
    id: allocProposalId(state),
    comboType: cand.comboType,
    gx: cand.gx, gy: cand.gy,
    aId: structure.id, aType: structure.type, aOwnerId: structure.ownerId ?? null,
    bId: cand.neighbor.id, bType: cand.neighbor.type, bOwnerId: cand.neighbor.ownerId ?? null,
    initiatorId: initiator?.id ?? null,
    requiredIds: requiredConsenters(state, structure, cand.neighbor, initiator),
    consentedIds: [],
    needsDirection: DIRECTIONAL_TYPES.includes(cand.comboType),
    dir: null,
    remainingMs: CONFIG.FUSION_CONSENT_MS,
    createdAt: now,
  }
  proposalsOf(state).push(proposal)
  return proposal
}

function pushEvent(state, event) {
  if (!state.fusionEvents) state.fusionEvents = []
  state.fusionEvents.push(event)
  return event
}

// Ends a proposal exactly once: off the pending list FIRST (so anything the
// ending triggers — notably destroyStructure during completion — can no longer
// see it and re-resolve it), then one event.
function resolveProposal(state, proposal, outcome, extra = {}) {
  const list = proposalsOf(state)
  const idx = list.indexOf(proposal)
  if (idx < 0) return null
  list.splice(idx, 1)
  return pushEvent(state, {
    proposalId: proposal.id, comboType: proposal.comboType, outcome, ...extra,
  })
}

// Both ingredients must still exist, still be the types the proposal was
// created for, and still form the same square. Re-checked at completion because
// a proposal outlives the tick that created it: an ingredient can be destroyed
// by enemies, or fused away by a proposal on its other side, in between.
function ingredientsStillValid(state, proposal) {
  const a = state.structures.find(s => s.id === proposal.aId)
  const b = state.structures.find(s => s.id === proposal.bId)
  if (!a || !b) return null
  if (a.type !== proposal.aType || b.type !== proposal.bType) return null
  const square = fusionSquare(a, b)
  if (!square || square.gx !== proposal.gx || square.gy !== proposal.gy) return null
  return { a, b }
}

// The ingredient that survives as the fusion keeps only its identity. Every
// other field is rebuilt from the fusion catalog, so no per-behavior state can
// leak across the transformation — a Wind Vortex's cycle bookkeeping
// (vxTracked/vxImmune/phase), a Rock Trap's locked telegraph point (ti*/tx/ty),
// a half-finished repair channel (repairMs) or a cooldown (attackReadyAt) would
// all otherwise ride into a structure with completely different behavior.
const FUSION_KEEPS = ['id']

function completeFusion(state, proposal, valid, now) {
  const { a, b } = valid
  destroyStructure(state, b)

  for (const key of Object.keys(a)) {
    if (!FUSION_KEEPS.includes(key)) delete a[key]
  }
  const catalog = BALANCE.STRUCTURES[proposal.comboType]
  a.type = proposal.comboType
  a.ownerId = null        // team-owned (§2): no personal owner, no dividend, no sale
  a.teamOwned = true
  a.gx = proposal.gx
  a.gy = proposal.gy
  a.w = 2
  a.h = 2
  a.orient = 'H'          // square: orientation is meaningless
  // Direction is NEVER inherited from whichever ingredient triggered this
  // (Gate 4 finding) — a leftover Water Geyser / Wind Vortex `dir` would draw a
  // false locked-direction arrow on, e.g., a Steam Vent. A directional fusion
  // gets its direction from the confirmation step instead (§2: "Any direction
  // required by the fusion is selected during confirmation and permanently
  // locked"), which is what proposal.dir carries.
  a.dir = proposal.needsDirection ? proposal.dir : null
  a.hp = catalog.hp
  a.maxHp = catalog.hp
  a.dormant = false
  a.createdAt = now

  state.placedVersion = (state.placedVersion || 0) + 1
  refreshFieldBand(state, a)
  return a
}

/**
 * A required player's answer to a pending proposal.
 *
 * @returns {{ok:true, status:'pending'|'fused'|'rejected'|'stale', structure?:object}}
 *          | {{ok:false, reason:string}}
 */
export function respondToFusion(state, player, proposalId, accept, now, opts = {}) {
  const proposal = proposalsOf(state).find(p => p.id === proposalId)
  if (!proposal) return { ok: false, reason: 'no-proposal' }
  if (!player || !proposal.requiredIds.includes(player.id)) {
    return { ok: false, reason: 'not-a-participant' }
  }
  // One answer per player. Without this a single client could accept twice and
  // satisfy a two-human proposal on its own.
  if (proposal.consentedIds.includes(player.id)) return { ok: false, reason: 'duplicate-response' }

  if (!accept) {
    resolveProposal(state, proposal, 'rejected', { byId: player.id })
    return { ok: true, status: 'rejected' }
  }

  // Direction is chosen during confirmation and permanently locked (§2). Two
  // rules keep that an actual agreement rather than a race (Gate 6):
  //   - only the INITIATOR may set it, and only once. Otherwise the last
  //     responder could swap a cardinal the others had already consented to.
  //   - nobody else may consent until it IS set, so no teammate is ever asked
  //     to approve a Grinder pointing in an unspecified direction.
  // Supplying a direction for a fusion that takes none is an invalid
  // combination, not something to silently drop — same contract as placement's
  // resolveOrientAndDirection.
  const dirRaw = opts.dir ?? null
  if (!proposal.needsDirection) {
    if (dirRaw !== null) return { ok: false, reason: 'invalid-direction' }
  } else if (player.id === proposal.initiatorId) {
    if (!DIRECTIONS.includes(dirRaw)) return { ok: false, reason: 'direction-required' }
    proposal.dir = dirRaw
  } else {
    if (dirRaw !== null) return { ok: false, reason: 'not-your-direction' }
    if (proposal.dir === null) return { ok: false, reason: 'direction-pending' }
  }

  proposal.consentedIds.push(player.id)
  if (proposal.requiredIds.some(id => !proposal.consentedIds.includes(id))) {
    return { ok: true, status: 'pending', dir: proposal.dir }
  }

  const valid = ingredientsStillValid(state, proposal)
  if (!valid) {
    resolveProposal(state, proposal, 'stale')
    return { ok: true, status: 'stale' }
  }
  resolveProposal(state, proposal, 'fused', { structureId: proposal.aId })
  const structure = completeFusion(state, proposal, valid, now)
  return { ok: true, status: 'fused', structure }
}

// Counted DOWN by the sim's own deltaMs rather than against a stored deadline
// — see CONFIG.FUSION_CONSENT_MS for why a deadline would never fire here.
export function tickFusionProposals(state, deltaMs) {
  const list = state.fusionProposals
  if (!list || list.length === 0) return
  for (const proposal of [...list]) {
    proposal.remainingMs -= deltaMs
    if (proposal.remainingMs <= 0) resolveProposal(state, proposal, 'expired')
  }
}

// A structure involved in a pending proposal stopped existing (sold, or eaten
// by the horde). Called from destroyStructure, so no removal path can leave a
// proposal pointing at a corpse.
export function invalidateProposalsForStructure(state, structureId) {
  const list = state.fusionProposals
  if (!list || list.length === 0) return
  for (const proposal of [...list]) {
    if (proposal.aId === structureId || proposal.bId === structureId) {
      resolveProposal(state, proposal, 'stale')
    }
  }
}

// A required player disconnected: nobody left to give that consent, so the
// proposal ends now instead of sitting until its timeout.
export function invalidateProposalsForPlayer(state, playerId) {
  const list = state.fusionProposals
  if (!list || list.length === 0) return
  for (const proposal of [...list]) {
    if (proposal.requiredIds.includes(playerId)) {
      resolveProposal(state, proposal, 'cancelled', { byId: playerId })
    }
  }
}

// Drain for the room loop (same pattern as state.pendingLevelUp).
export function drainFusionEvents(state) {
  const events = state.fusionEvents
  if (!events || events.length === 0) return []
  state.fusionEvents = []
  return events
}
