// Netcode smoke: two headless socket.io clients join one room, the host starts
// the match, and both receive coherent PACKED snapshots (GAME_START full +
// STATE_UPDATE broadcasts). Also exercises the phase-cycling wiring: with the
// 'ready' timing style, both humans readying up drives build → fight and both
// clients see the PHASE_CHANGE.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { io as ioClient } from 'socket.io-client'
import { listen, io as serverIo, httpServer } from '../../server/index.js'
import { EVENTS } from '../../shared/constants.js'
import { decodeSnapshot } from '../../server/net/encode.js'

// Wait for `event` on `socket`, rejecting if it doesn't arrive in `ms`.
function waitFor(socket, event, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`timeout waiting for "${event}"`))
    }, ms)
    function handler(payload) {
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(payload)
    }
    socket.on(event, handler)
  })
}

test('two clients join a room and receive coherent packed snapshots', async () => {
  const port = await listen(0)
  const url = `http://localhost:${port}`
  const clientA = ioClient(url, { forceNew: true, transports: ['websocket'] })
  const clientB = ioClient(url, { forceNew: true, transports: ['websocket'] })

  try {
    // Host creates a 'ready'-style room; second client joins.
    clientA.emit(EVENTS.CREATE_ROOM, {
      displayName: 'Alice',
      settings: { timingStyle: 'ready', friendlyFire: false },
    })
    const created = await waitFor(clientA, EVENTS.ROOM_JOINED)
    assert.equal(created.players.length, 1)
    assert.ok(created.settings.timingStyle === 'ready')
    const roomCode = created.roomCode

    clientB.emit(EVENTS.JOIN_ROOM, { roomCode, displayName: 'Bob' })
    const joinedB = await waitFor(clientB, EVENTS.ROOM_JOINED)
    assert.equal(joinedB.roomCode, roomCode)
    // Two humans get distinct elements.
    assert.notEqual(created.element, joinedB.element)

    // Host starts the match; both clients receive the full initial snapshot.
    const startA = waitFor(clientA, EVENTS.GAME_START)
    const startB = waitFor(clientB, EVENTS.GAME_START)
    clientA.emit(EVENTS.REQUEST_START)
    const [gsA, gsB] = await Promise.all([startA, startB])

    // GAME_START carries a FULL packed snapshot: structures present, 4 players
    // (2 humans + 2 bot-filled elements), no enemies yet, pv=0.
    for (const gs of [gsA, gsB]) {
      const snap = decodeSnapshot(gs.snapshot)
      assert.equal(typeof snap.tick, 'number')
      assert.equal(snap.players.length, 4, 'team is always 4 (bot-filled)')
      assert.deepEqual(snap.enemies, [], 'no enemies in Phase 1')
      assert.ok(Array.isArray(snap.structures), 'full snapshot includes statics')
      // Phase 5: the pre-built starting economy (2 Farms + 1 Marketplace) plus
      // an auto-placed special per bot-controlled element are seeded at
      // createGameState, so placedVersion/structures are non-empty from the start.
      assert.ok(snap.placedVersion > 0)
      assert.ok(snap.structures.length > 0)
      assert.equal(gs.phase, 'build')
    }
    assert.equal(gsA.players.length, 4)

    // Both clients receive gated 20 Hz STATE_UPDATE broadcasts that decode
    // coherently.
    const suA = decodeSnapshot((await waitFor(clientA, EVENTS.STATE_UPDATE)).snapshot)
    assert.equal(typeof suA.tick, 'number')
    assert.ok(suA.tick >= 1)
    assert.equal(suA.players.length, 4)

    // Task 9: orientation + independent cardinal direction round-trip end to
    // end over the wire — build a vertical, east-facing Water Geyser and
    // confirm the next full-carrying broadcast decodes both fields.
    const built = waitFor(clientA, EVENTS.STATE_UPDATE)
    clientA.emit(EVENTS.BUILD_STRUCTURE, {
      type: 'WATER_SPECIAL', gx: 5, gy: 5, orient: 'V', dir: 'E',
    })
    const afterBuild = decodeSnapshot((await built).snapshot)
    const geyser = afterBuild.structures?.find(s => s.gx === 5 && s.gy === 5)
    assert.ok(geyser, 'the new structure rides the next static resend')
    assert.equal(geyser.orient, 'V')
    assert.equal(geyser.dir, 'E')

    // Task 13: the fusion consent gate, end to end over real sockets. Alice
    // (EARTH) and Bob (FIRE) each place their own element's special so their
    // four tiles form one 2x2 — which now opens a PROPOSAL rather than fusing.
    // Both are human-owned, so this is the two-human path: one accept leaves it
    // pending, the second completes it, and the resolution reaches BOTH clients
    // through the loop's drain.
    const proposedA = waitFor(clientA, EVENTS.FUSION_PROPOSED)
    const proposedB = waitFor(clientB, EVENTS.FUSION_PROPOSED)
    clientA.emit(EVENTS.BUILD_STRUCTURE, { type: 'EARTH_SPECIAL', gx: 5, gy: 9, orient: 'H' })
    clientB.emit(EVENTS.BUILD_STRUCTURE, { type: 'FIRE_SPECIAL', gx: 5, gy: 10, orient: 'H' })
    const [propA, propB] = await Promise.all([proposedA, proposedB])
    assert.equal(propA.comboType, 'MAGMA_TRAP')
    assert.equal(propA.id, propB.id, 'one proposal, broadcast to the room')
    assert.equal(propA.requiredIds.length, 2, 'both human owners must consent')

    // Bob answers first: still pending, nothing consumed.
    const updated = waitFor(clientA, EVENTS.FUSION_UPDATED)
    clientB.emit(EVENTS.RESPOND_FUSION, { proposalId: propA.id, accept: true })
    assert.equal((await updated).proposalId, propA.id)

    const resolvedA = waitFor(clientA, EVENTS.FUSION_RESOLVED)
    const resolvedB = waitFor(clientB, EVENTS.FUSION_RESOLVED)
    clientA.emit(EVENTS.RESPOND_FUSION, { proposalId: propA.id, accept: true })
    const [resA, resB] = await Promise.all([resolvedA, resolvedB])
    assert.equal(resA.outcome, 'fused')
    assert.equal(resB.outcome, 'fused')

    // The fused 2x2 rides the next static resend, and the ingredients are gone.
    const afterFuse = decodeSnapshot((await waitFor(clientA, EVENTS.STATE_UPDATE)).snapshot)
    if (afterFuse.structures) {
      const fusion = afterFuse.structures.find(s => s.id === resA.structureId)
      assert.ok(fusion, 'the fusion is present in the static payload')
      assert.equal(fusion.type, 'MAGMA_TRAP')
      assert.equal(fusion.w, 2)
      assert.equal(fusion.h, 2)
      assert.equal(afterFuse.structures.filter(s => s.type === 'FIRE_SPECIAL').length, 0)
    }

    // Phase cycling: both humans ready up → build completes → PHASE_CHANGE fight.
    const pcA = waitFor(clientA, EVENTS.PHASE_CHANGE)
    const pcB = waitFor(clientB, EVENTS.PHASE_CHANGE)
    clientA.emit(EVENTS.SET_READY, { ready: true })
    clientB.emit(EVENTS.SET_READY, { ready: true })
    const [phaseA, phaseB] = await Promise.all([pcA, pcB])
    assert.equal(phaseA.phase, 'fight')
    assert.equal(phaseB.phase, 'fight')
    assert.equal(phaseA.wave, 1)
  } finally {
    clientA.close()
    clientB.close()
    serverIo.close()
    await new Promise(r => httpServer.close(r))
  }
})
