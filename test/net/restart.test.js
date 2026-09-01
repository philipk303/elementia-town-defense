// RESTART_MATCH end-to-end: two headless clients in one room, the match driven
// forward into the fight, then restarted by the client that is NOT the host.
//
// Restart is open to anyone in the room -- a product decision taken on
// 2026-08-31 with the griefing tradeoff stated and accepted -- so "the
// non-host can do it" is the behaviour under test, not an oversight. The
// client asks for confirmation before sending this; the server does not.
//
// It also pins the rate limit, because restart rebuilds the whole state and
// pushes a full snapshot to four clients, which makes a held-down button a
// free amplification if nothing bounds it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { io as ioClient } from 'socket.io-client'
import { listen, io as serverIo, httpServer, rooms } from '../../server/index.js'
import { EVENTS } from '../../shared/constants.js'

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

// Resolves null if the event does NOT arrive, which is the assertion for a
// refused restart -- a rejection carries no reply of its own.
function expectSilence(socket, event, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socket.off(event, handler); resolve(null) }, ms)
    function handler(payload) {
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(payload)
    }
    socket.on(event, handler)
  })
}

test('any player in the room can restart it, and the run starts over in place', async () => {
  const port = await listen(0)
  const url = `http://localhost:${port}`
  const clientA = ioClient(url, { forceNew: true, transports: ['websocket'] })
  const clientB = ioClient(url, { forceNew: true, transports: ['websocket'] })

  try {
    clientA.emit(EVENTS.CREATE_ROOM, {
      displayName: 'Alice',
      settings: { timingStyle: 'ready', friendlyFire: false },
    })
    const created = await waitFor(clientA, EVENTS.ROOM_JOINED)
    const roomCode = created.roomCode

    clientB.emit(EVENTS.JOIN_ROOM, { roomCode, displayName: 'Bob' })
    await waitFor(clientB, EVENTS.ROOM_JOINED)

    const firstStartA = waitFor(clientA, EVENTS.GAME_START)
    const firstStartB = waitFor(clientB, EVENTS.GAME_START)
    clientA.emit(EVENTS.REQUEST_START)
    await Promise.all([firstStartA, firstStartB])

    // Drive the run somewhere a restart can be told apart from a no-op.
    const pcA = waitFor(clientA, EVENTS.PHASE_CHANGE)
    clientA.emit(EVENTS.SET_READY, { ready: true })
    clientB.emit(EVENTS.SET_READY, { ready: true })
    assert.equal((await pcA).phase, 'fight')

    const roomBefore = rooms.getRoomByCode(roomCode)
    const seedBefore = roomBefore.state.seed
    const stateBefore = roomBefore.state

    // Bob is NOT the host. He restarts anyway; both clients are told.
    const againA = waitFor(clientA, EVENTS.GAME_START)
    const againB = waitFor(clientB, EVENTS.GAME_START)
    clientB.emit(EVENTS.RESTART_MATCH)
    const [restartA, restartB] = await Promise.all([againA, againB])

    for (const payload of [restartA, restartB]) {
      assert.equal(payload.phase, 'build', 'a restart lands in the build phase')
      assert.equal(payload.wave, 1, 'a restart goes back to wave 1')
      assert.equal(payload.players.length, 4, 'bots still fill the empty seats')
    }
    // Same room, same people -- this is a restart, not a new lobby.
    const roomAfter = rooms.getRoomByCode(roomCode)
    assert.ok(roomAfter, 'the room survives its own restart')
    assert.equal(roomAfter.phase, 'active')
    assert.equal(roomAfter.state.wave, 1)
    // Identity, not tick count: the new loop starts ticking immediately, so
    // asserting tick === 0 is a race that only passes on a fast machine.
    assert.notEqual(roomAfter.state, stateBefore, 'the old game state was replaced, not rewound')
    assert.notEqual(roomAfter.state.seed, seedBefore, 'a restart is a genuinely new match')
    const names = roomAfter.players.filter(p => !p.isBot).map(p => p.displayName).sort()
    assert.deepEqual(names, ['Alice', 'Bob'])
    // Ready flags belonged to the run that just ended.
    assert.equal(roomAfter.state.players.some(p => p.ready), false)

    // The cooldown refuses a second restart pressed straight away, so a held
    // button cannot make the server rebuild the world over and over.
    const spam = expectSilence(clientA, EVENTS.GAME_START, 600)
    clientB.emit(EVENTS.RESTART_MATCH)
    assert.equal(await spam, null, 'a restart inside the cooldown is ignored')
  } finally {
    clientA.close()
    clientB.close()
    serverIo.close()
    await new Promise(r => httpServer.close(r))
  }
})

test('a socket that is not in a room cannot restart anything', async () => {
  const port = await listen(0)
  const url = `http://localhost:${port}`
  const stranger = ioClient(url, { forceNew: true, transports: ['websocket'] })
  try {
    await waitFor(stranger, 'connect', 3000).catch(() => {})
    // No room, no state: this must be a silent no-op rather than a throw that
    // takes the connection handler down with it.
    stranger.emit(EVENTS.RESTART_MATCH)
    assert.equal(await expectSilence(stranger, EVENTS.GAME_START, 300), null)
    assert.equal(stranger.connected, true, 'the server survived the request')
  } finally {
    stranger.close()
    serverIo.close()
    await new Promise(r => httpServer.close(r))
  }
})

test('a finished run leaves the room standing so it can be restarted', async () => {
  // Before restart existed, loop.js onEnd destroyed the room the instant a run
  // ended, which made a restart button useless at the exact moment a player
  // most wants one. The room now waits out a grace window instead.
  const port = await listen(0)
  const url = `http://localhost:${port}`
  const client = ioClient(url, { forceNew: true, transports: ['websocket'] })

  try {
    client.emit(EVENTS.CREATE_ROOM, {
      displayName: 'Alice',
      settings: { timingStyle: 'ready', friendlyFire: false },
    })
    const created = await waitFor(client, EVENTS.ROOM_JOINED)
    const roomCode = created.roomCode

    const started = waitFor(client, EVENTS.GAME_START)
    client.emit(EVENTS.REQUEST_START)
    await started

    // Kill the hall directly rather than playing a losing run: the loop's own
    // terminal check is what is under test, not the combat that reaches it.
    const ended = waitFor(client, EVENTS.GAME_END)
    rooms.getRoomByCode(roomCode).state.hall.hp = 0
    const endPayload = await ended
    assert.equal(endPayload.outcome, 'lost')

    const room = rooms.getRoomByCode(roomCode)
    assert.ok(room, 'the room outlives the run that ended in it')
    assert.ok(room.endedTimer, 'and is scheduled for cleanup rather than leaked')

    // Restart from the end screen.
    const again = waitFor(client, EVENTS.GAME_START)
    client.emit(EVENTS.RESTART_MATCH)
    const payload = await again
    assert.equal(payload.phase, 'build')
    assert.equal(payload.wave, 1)

    const restarted = rooms.getRoomByCode(roomCode)
    assert.equal(restarted.endedTimer, null, 'restarting cancels the cleanup timer')
    assert.ok(restarted.state.hall.hp > 0, 'the hall is whole again')
  } finally {
    client.close()
    serverIo.close()
    await new Promise(r => httpServer.close(r))
  }
})
