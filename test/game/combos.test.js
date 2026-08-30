import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placeStructure, sellStructure, destroyStructure, findStructureAt } from '../../server/game/structures.js'
import {
  respondToFusion, tickFusionProposals, invalidateProposalsForPlayer,
  drainFusionEvents, fusionCandidateFor, describeProposal,
} from '../../server/game/combos.js'
import { tryChannelRepair } from '../../server/game/repair.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { BALANCE } from '../../shared/balance.js'
import { CONFIG, SPECIAL_TYPE_ELEMENT, DIRECTIONAL_TYPES } from '../../shared/constants.js'

function makeState() {
  return {
    phase: PHASES.BUILD,
    teamLevel: 2,   // L2+ — all 6 pairs unlocked (Phase 4 gates the diagonals below L2)
    hall: { gx: CONFIG.HALL.gx, gy: CONFIG.HALL.gy, w: CONFIG.HALL.w, h: CONFIG.HALL.h, x: 0, y: 0 },
    players: [
      { id: 'p0', element: 'EARTH', isBot: false, gold: 9999 },
      { id: 'p1', element: 'FIRE',  isBot: false, gold: 9999 },
      { id: 'p2', element: 'WATER', isBot: false, gold: 9999 },
      { id: 'p3', element: 'WIND',  isBot: false, gold: 9999 },
    ],
    structures: [],
    placedVersion: 0,
  }
}

// Each special is element-locked to its owning player (spec §2), so combo
// tests must place through the matching human, not an arbitrary one.
function ownerFor(state, specialType) {
  const el = SPECIAL_TYPE_ELEMENT[specialType]
  return state.players.find(p => p.element === el)
}

// Water Geyser / Wind Vortex now require an independently chosen cardinal
// direction (Task 9); every other type stays direction-less. 'N' is an
// arbitrary but valid choice — these tests don't exercise direction itself.
function place(state, type, gx, gy, now, orient) {
  const dir = DIRECTIONAL_TYPES.includes(type) ? 'N' : undefined
  return placeStructure(state, ownerFor(state, type), type, gx, gy, now, { orient, dir })
}

const PAIRS = [
  ['EARTH_SPECIAL', 'FIRE_SPECIAL',  'MAGMA_TRAP'],
  ['FIRE_SPECIAL',  'WIND_SPECIAL',  'FIRESTORM'],
  ['EARTH_SPECIAL', 'WATER_SPECIAL', 'MUDDY_BOG'],
  ['WATER_SPECIAL', 'WIND_SPECIAL',  'BLIZZARD'],
  ['FIRE_SPECIAL',  'WATER_SPECIAL', 'STEAM_VENT'],
  ['EARTH_SPECIAL', 'WIND_SPECIAL',  'GRINDER'],
]

// GEOMETRY CHANGED (combat-structure redesign §2, landed with 2x1 footprints):
// fusion is no longer 8-connected adjacency between two 1x1 tiles. Two 2x1
// elemental structures fuse ONLY when their four tiles form a complete 2x2 —
// parallel and side-by-side. End-to-end, perpendicular and corner-only
// arrangements do not qualify.
//
// Placement no longer fuses (Task 13): it opens a proposal every required
// owner must accept. `accept` below is the consent step these geometry tests
// need to reach the finished fusion at all.
function accept(state, proposal, player, now = 2000, opts = {}) {
  return respondToFusion(state, player, proposal.id, true, now, opts)
}

// Every required owner accepts, in order. The geometry tests below place their
// two ingredients through two DIFFERENT element-locked humans, so both are
// required — that path is exercised on its own in the consent tests further
// down; here it is just how you reach the finished fusion.
// A directional fusion (Grinder) takes its cardinal from the INITIATOR's own
// accept and from nobody else's — see the directional tests at the bottom.
function acceptAll(state, proposal, now = 2000, dir = 'N') {
  let out = null
  for (const id of [...proposal.requiredIds]) {
    const opts = proposal.needsDirection && id === proposal.initiatorId ? { dir } : {}
    out = accept(state, proposal, state.players.find(p => p.id === id), now, opts)
  }
  return out
}

for (const [typeA, typeB, comboType] of PAIRS) {
  test(`two stacked horizontal 2x1s (${typeA} + ${typeB}) fuse into ${comboType} once accepted`, () => {
    const s = makeState()
    place(s, typeA, 10, 10, 1000, 'H')
    const res = place(s, typeB, 10, 11, 1001, 'H')
    assert.equal(res.ok, true)
    assert.equal(res.structure.type, typeB, 'the placement itself stays an ingredient')
    assert.ok(res.fusionProposal, 'a proposal is opened')
    assert.equal(res.fusionProposal.comboType, comboType)

    const out = acceptAll(s, res.fusionProposal)
    assert.equal(out.status, 'fused')
    assert.equal(out.structure.type, comboType)
    assert.equal(out.structure.hp, BALANCE.STRUCTURES[comboType].hp)
    assert.equal(out.structure.w, 2)
    assert.equal(out.structure.h, 2)
    assert.equal(s.structures.length, 1, 'both ingredients are consumed')
  })
}

// Gate 4 finding: fusion must not inherit `dir` from whichever ingredient
// happened to trigger resolution — a non-directional fusion (Steam Vent
// isn't in DIRECTIONAL_TYPES) must never carry a leftover Water Geyser
// direction, regardless of placement order.
test('fusion clears direction, regardless of which directional ingredient triggers it', () => {
  const s1 = makeState()
  place(s1, 'FIRE_SPECIAL', 10, 10, 1000, 'H')
  const res1 = place(s1, 'WATER_SPECIAL', 10, 11, 1001, 'H') // WATER_SPECIAL is the trigger, dir 'N'
  const out1 = acceptAll(s1, res1.fusionProposal)
  assert.equal(out1.structure.type, 'STEAM_VENT')
  assert.equal(out1.structure.dir, null)

  const s2 = makeState()
  place(s2, 'WATER_SPECIAL', 10, 10, 1000, 'H') // placed first, not the trigger
  const res2 = place(s2, 'FIRE_SPECIAL', 10, 11, 1001, 'H')
  const out2 = acceptAll(s2, res2.fusionProposal)
  assert.equal(out2.structure.type, 'STEAM_VENT')
  assert.equal(out2.structure.dir, null)
})

test('two side-by-side vertical 1x2s fuse, anchored at the top-left tile', () => {
  const s = makeState()
  place(s, 'FIRE_SPECIAL', 10, 10, 1000, 'V')
  const res = place(s, 'WATER_SPECIAL', 11, 10, 1001, 'V')
  const out = acceptAll(s, res.fusionProposal)
  assert.equal(out.structure.type, 'STEAM_VENT')
  assert.equal(out.structure.gx, 10)
  assert.equal(out.structure.gy, 10)
})

test('the fusion anchors to the top-left tile even when the SECOND piece is above', () => {
  const s = makeState()
  place(s, 'FIRE_SPECIAL', 10, 11, 1000, 'H')
  const res = place(s, 'WATER_SPECIAL', 10, 10, 1001, 'H')
  const out = acceptAll(s, res.fusionProposal)
  assert.equal(out.structure.type, 'STEAM_VENT')
  assert.equal(out.structure.gy, 10, 'anchored to the upper row, not the placement order')
})

// The negative geometry cases now assert the stronger property: no PROPOSAL is
// even offered, so there is nothing a player could accept their way past.
for (const [label, gx, gy, orient] of [
  ['end-to-end 2x1s (a 4x1 bar is not a 2x2 square)', 12, 10, 'H'],
  ['perpendicular 2x1s', 10, 11, 'V'],
  ['offset (corner-touching) 2x1s', 11, 11, 'H'],
  ['non-adjacent specials', 15, 15, 'H'],
]) {
  test(`${label} do NOT propose a fusion`, () => {
    const s = makeState()
    place(s, 'FIRE_SPECIAL', 10, 10, 1000, 'H')
    const res = place(s, 'WATER_SPECIAL', gx, gy, 1001, orient)
    assert.equal(res.structure.type, 'WATER_SPECIAL')
    assert.equal(res.fusionProposal, null)
    assert.equal(s.structures.length, 2)
  })
}

test('stacked specials of the SAME element do not propose a fusion', () => {
  const s = makeState()
  place(s, 'FIRE_SPECIAL', 10, 10, 1000, 'H')
  const res = place(s, 'FIRE_SPECIAL', 10, 11, 1001, 'H')
  assert.equal(res.structure.type, 'FIRE_SPECIAL')
  assert.equal(res.fusionProposal, null)
  assert.equal(s.structures.length, 2)
})

test('generic towers never trigger fusion resolution', () => {
  const s = makeState()
  placeStructure(s, s.players[0], 'BARRICADE', 10, 10, 1000)
  const res = placeStructure(s, s.players[0], 'WATCHTOWER', 11, 10, 1001)
  assert.equal(res.structure.type, 'WATCHTOWER')
  assert.equal(res.fusionProposal, null)
  assert.equal(s.structures.length, 2)
})

// --- consent, lifecycle and permanence (Task 13) ----------------------------
//
// Closes Gate 1 finding 2.2: until now placing the second ingredient destroyed
// its neighbour on the spot, with no consent, no ownership and (post-A1.1) no
// way back. These tests pin the state machine that replaced it.

// Same fixture, but WIND is a bot — the A1.2 "human confirms on the bot's
// behalf" path needs an ingredient with no human owner. The seeded bot
// specials are placed ownerless (economy.js seedStartingEconomy), so the
// ownerless case is the real shipped one and is covered separately below.
function makeStateWithBot() {
  const s = makeState()
  s.players.find(p => p.element === 'WIND').isBot = true
  return s
}

function propose(state, typeA, typeB) {
  place(state, typeA, 10, 10, 1000, 'H')
  const res = place(state, typeB, 10, 11, 1001, 'H')
  assert.ok(res.fusionProposal, 'expected a pending proposal')
  return res.fusionProposal
}

test('a proposal mutates nothing — both ingredients stand until it completes', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  assert.equal(s.structures.length, 2, 'no ingredient consumed')
  assert.deepEqual(s.structures.map(x => x.type), ['FIRE_SPECIAL', 'WATER_SPECIAL'])
  assert.equal(s.structures[0].hp, BALANCE.STRUCTURES.FIRE_SPECIAL.hp)
  assert.equal(p.comboType, 'STEAM_VENT')
  assert.deepEqual(p.consentedIds, [])
})

test('two humans must both consent; one accept alone leaves it pending', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  const fireP = ownerFor(s, 'FIRE_SPECIAL'), waterP = ownerFor(s, 'WATER_SPECIAL')
  assert.deepEqual([...p.requiredIds].sort(), [fireP.id, waterP.id].sort())

  const first = respondToFusion(s, waterP, p.id, true, 2000)
  assert.equal(first.status, 'pending')
  assert.equal(s.structures.length, 2, 'still nothing consumed on a partial consent')

  const second = respondToFusion(s, fireP, p.id, true, 2001)
  assert.equal(second.status, 'fused')
  assert.equal(s.structures.length, 1)
  assert.equal(s.structures[0].type, 'STEAM_VENT')
})

test('a human confirms alone on a bot-owned ingredient (A1.2)', () => {
  const s = makeStateWithBot()
  // `place` builds through the element owner, so the WIND ingredient is owned
  // by the bot player itself — the strictest form of the case.
  const p = propose(s, 'WIND_SPECIAL', 'FIRE_SPECIAL')
  assert.deepEqual(p.requiredIds, [ownerFor(s, 'FIRE_SPECIAL').id])
  const out = respondToFusion(s, ownerFor(s, 'FIRE_SPECIAL'), p.id, true, 2000)
  assert.equal(out.status, 'fused')
  assert.equal(out.structure.type, 'FIRESTORM')
})

test('an ownerless ingredient (a seeded bot special) requires nobody but the initiator', () => {
  const s = makeState()
  place(s, 'FIRE_SPECIAL', 10, 10, 1000, 'H')
  s.structures[0].ownerId = null                     // as placeSeedStructure leaves it
  const res = place(s, 'WATER_SPECIAL', 10, 11, 1001, 'H')
  assert.deepEqual(res.fusionProposal.requiredIds, [ownerFor(s, 'WATER_SPECIAL').id])
})

test('a rejection ends the proposal and leaves both ingredients standing', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  const out = respondToFusion(s, ownerFor(s, 'FIRE_SPECIAL'), p.id, false, 2000)
  assert.equal(out.status, 'rejected')
  assert.equal(s.structures.length, 2)
  assert.equal(s.fusionProposals.length, 0)
  const [ev] = drainFusionEvents(s)
  assert.equal(ev.outcome, 'rejected')
  assert.equal(ev.byId, ownerFor(s, 'FIRE_SPECIAL').id)
  // The other player answering afterwards has nothing to answer.
  assert.deepEqual(respondToFusion(s, ownerFor(s, 'WATER_SPECIAL'), p.id, true, 2001),
    { ok: false, reason: 'no-proposal' })
})

test('a proposal expires on its own after CONFIG.FUSION_CONSENT_MS', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  tickFusionProposals(s, CONFIG.FUSION_CONSENT_MS - 1)
  assert.equal(s.fusionProposals.length, 1, 'still live one ms short of the window')
  tickFusionProposals(s, 1)
  assert.equal(s.fusionProposals.length, 0)
  assert.equal(s.structures.length, 2, 'expiry consumes nothing')
  const [ev] = drainFusionEvents(s)
  assert.equal(ev.outcome, 'expired')
  assert.equal(ev.proposalId, p.id)
})

test('a required player disconnecting cancels the proposal', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  invalidateProposalsForPlayer(s, ownerFor(s, 'FIRE_SPECIAL').id)
  assert.equal(s.fusionProposals.length, 0)
  assert.equal(s.structures.length, 2)
  const [ev] = drainFusionEvents(s)
  assert.equal(ev.outcome, 'cancelled')
  assert.equal(ev.proposalId, p.id)
})

test('an ingredient destroyed while pending makes the proposal stale', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  destroyStructure(s, findStructureAt(s, 10, 10))
  assert.equal(s.fusionProposals.length, 0)
  const [ev] = drainFusionEvents(s)
  assert.equal(ev.outcome, 'stale')
  assert.equal(ev.proposalId, p.id)
  assert.deepEqual(respondToFusion(s, ownerFor(s, 'WATER_SPECIAL'), p.id, true, 2000),
    { ok: false, reason: 'no-proposal' })
})

test('a stale ingredient is caught at completion even if the proposal survived', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  respondToFusion(s, ownerFor(s, 'WATER_SPECIAL'), p.id, true, 2000)
  // Simulate the ingredient vanishing by a path that did NOT invalidate — the
  // completion-time re-check is the backstop, not the only guard.
  s.structures = s.structures.filter(x => x.type !== 'FIRE_SPECIAL')
  const out = respondToFusion(s, ownerFor(s, 'FIRE_SPECIAL'), p.id, true, 2001)
  assert.equal(out.status, 'stale')
  assert.equal(s.structures.length, 1, 'the survivor is untouched')
  assert.equal(s.structures[0].type, 'WATER_SPECIAL')
})

test('a duplicate response cannot satisfy a two-human proposal alone', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  const waterP = ownerFor(s, 'WATER_SPECIAL')
  assert.equal(respondToFusion(s, waterP, p.id, true, 2000).status, 'pending')
  assert.deepEqual(respondToFusion(s, waterP, p.id, true, 2001),
    { ok: false, reason: 'duplicate-response' })
  assert.equal(s.structures.length, 2, 'still unfused')
})

test('a non-participant cannot consent', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  assert.deepEqual(respondToFusion(s, ownerFor(s, 'WIND_SPECIAL'), p.id, true, 2000),
    { ok: false, reason: 'not-a-participant' })
})

test('a second proposal over an already-pending ingredient is refused', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')   // occupies (10,10)-(11,11)
  // EARTH placed directly under the WATER ingredient would form its own 2x2
  // with it — but that ingredient is already spoken for.
  const res = place(s, 'EARTH_SPECIAL', 10, 12, 1002, 'H')
  assert.equal(res.ok, true)
  assert.equal(res.fusionProposal, null, 'no second proposal over a pending ingredient')
  assert.equal(s.fusionProposals.length, 1)
  assert.equal(s.fusionProposals[0].id, p.id)
})

test('a direction supplied for a non-directional fusion is refused', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  assert.equal(p.needsDirection, false)
  assert.deepEqual(respondToFusion(s, ownerFor(s, 'WATER_SPECIAL'), p.id, true, 2000, { dir: 'N' }),
    { ok: false, reason: 'invalid-direction' })
  assert.equal(s.fusionProposals.length, 1, 'the proposal survives a refused answer')
})

// Grinder is the one fusion that takes a cardinal (§6), chosen at confirmation
// and locked permanently (§2). The rules below are what make that an agreement
// rather than a race: only the proposer sets it, once, and nobody else can
// consent to a direction that has not been chosen yet.
test('a directional fusion requires the INITIATOR to choose its cardinal', () => {
  const s = makeState()
  const p = propose(s, 'EARTH_SPECIAL', 'WIND_SPECIAL')   // → GRINDER
  assert.equal(p.comboType, 'GRINDER')
  assert.equal(p.needsDirection, true)
  const windP = ownerFor(s, 'WIND_SPECIAL'), earthP = ownerFor(s, 'EARTH_SPECIAL')
  assert.equal(p.initiatorId, windP.id)

  // The initiator must supply one.
  assert.deepEqual(respondToFusion(s, windP, p.id, true, 2000),
    { ok: false, reason: 'direction-required' })
  // A teammate cannot consent before it exists, and cannot supply it either.
  assert.deepEqual(respondToFusion(s, earthP, p.id, true, 2000),
    { ok: false, reason: 'direction-pending' })
  assert.deepEqual(respondToFusion(s, earthP, p.id, true, 2000, { dir: 'E' }),
    { ok: false, reason: 'not-your-direction' })

  assert.equal(respondToFusion(s, windP, p.id, true, 2000, { dir: 'E' }).status, 'pending')
  assert.equal(respondToFusion(s, earthP, p.id, true, 2001).status, 'fused')
  assert.equal(s.structures[0].type, 'GRINDER')
  assert.equal(s.structures[0].dir, 'E', 'the confirmed cardinal is locked onto the fusion')
})

test('a later responder cannot overwrite the direction already consented to', () => {
  const s = makeState()
  const p = propose(s, 'EARTH_SPECIAL', 'WIND_SPECIAL')
  const windP = ownerFor(s, 'WIND_SPECIAL'), earthP = ownerFor(s, 'EARTH_SPECIAL')
  respondToFusion(s, windP, p.id, true, 2000, { dir: 'N' })
  assert.deepEqual(respondToFusion(s, earthP, p.id, true, 2001, { dir: 'S' }),
    { ok: false, reason: 'not-your-direction' })
  assert.equal(respondToFusion(s, earthP, p.id, true, 2002).status, 'fused')
  assert.equal(s.structures[0].dir, 'N', 'still the cardinal both players saw')
})

test('a piece whose first partner is spoken for still proposes with a free one', () => {
  // EARTH(10,9) + FIRE(10,10) are pending. WIND placed at (10,11) forms a 2x2
  // with FIRE (spoken for) AND nothing else — so give it a free partner below
  // by pairing against WATER instead: the point is that a busy FIRST candidate
  // must not suppress a valid second one (Gate 6, non-blocking finding).
  const s = makeState()
  place(s, 'EARTH_SPECIAL', 10, 9, 1000, 'H')
  const first = place(s, 'FIRE_SPECIAL', 10, 10, 1001, 'H')   // pending MAGMA_TRAP
  assert.ok(first.fusionProposal)
  place(s, 'WATER_SPECIAL', 10, 12, 1002, 'H')
  // WIND at (10,11) touches FIRE above (pending) and WATER below (free).
  const res = place(s, 'WIND_SPECIAL', 10, 11, 1003, 'H')
  assert.ok(res.fusionProposal, 'the free partner is found instead of refusing outright')
  assert.equal(res.fusionProposal.comboType, 'BLIZZARD', 'paired with WATER, not the busy FIRE')
  assert.equal(s.fusionProposals.length, 2, 'two independent proposals stand at once')
})

test('the completed fusion is team-owned and carries no ingredient state', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  // Dirty the surviving ingredient with behaviour state a fusion must not inherit.
  const survivor = s.structures.find(x => x.type === 'WATER_SPECIAL')
  survivor.attackReadyAt = 999999
  survivor.repairMs = 1234
  survivor.phase = 3
  const out = acceptAll(s, p, 2000)
  assert.equal(out.structure.ownerId, null)
  assert.equal(out.structure.teamOwned, true)
  assert.equal(out.structure.attackReadyAt, undefined)
  assert.equal(out.structure.repairMs, undefined)
  assert.equal(out.structure.phase, undefined)
  assert.equal(out.structure.createdAt, 2000)
})

test('a fusion cannot be sold', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  const fusion = acceptAll(s, p).structure
  const seller = ownerFor(s, 'FIRE_SPECIAL')
  const goldBefore = seller.gold
  assert.deepEqual(sellStructure(s, seller, fusion.id), { ok: false, reason: 'unsellable' })
  assert.equal(s.structures.length, 1, 'still standing')
  assert.equal(seller.gold, goldBefore, 'no refund')
})

test('any teammate may repair a team-owned fusion', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  const fusion = acceptAll(s, p).structure
  fusion.hp = 1
  // A player who owned NEITHER ingredient, standing on the fusion.
  const bystander = { ...ownerFor(s, 'WIND_SPECIAL'), x: fusion.gx * 32, y: fusion.gy * 32 }
  const res = tryChannelRepair(fusion, bystander, BALANCE.REPAIR.CHANNEL_MS)
  assert.equal(res.state, 'repaired')
  assert.equal(fusion.hp, fusion.maxHp)
})

test('destruction removes the fusion and never restores the ingredients', () => {
  const s = makeState()
  const p = propose(s, 'FIRE_SPECIAL', 'WATER_SPECIAL')
  const fusion = acceptAll(s, p).structure
  destroyStructure(s, fusion)
  assert.equal(s.structures.length, 0, 'nothing comes back')
})

test('fusionCandidateFor and describeProposal agree on the pair being offered', () => {
  const s = makeState()
  place(s, 'FIRE_SPECIAL', 10, 10, 1000, 'H')
  const res = place(s, 'WATER_SPECIAL', 10, 11, 1001, 'H')
  const cand = fusionCandidateFor(s, findStructureAt(s, 10, 11))
  const wire = describeProposal(res.fusionProposal)
  assert.equal(cand.comboType, wire.comboType)
  assert.deepEqual([cand.gx, cand.gy], [wire.gx, wire.gy])
  assert.deepEqual(wire.ingredients.map(i => i.type).sort(), ['FIRE_SPECIAL', 'WATER_SPECIAL'])
  assert.equal(wire.remainingMs, CONFIG.FUSION_CONSENT_MS)
})
