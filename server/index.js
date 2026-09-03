import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'

import { EVENTS } from '../shared/constants.js'
import RoomManager from './rooms/index.js'
import { createGameState } from './game/state.js'
import { startLoop, stopLoop } from './game/loop.js'
import { startBuildPhase } from './game/phaseMachine.js'
import { buildFullSnapshot } from './game/emitGate.js'
import { sellStructure } from './game/structures.js'
import { buildStructure } from './game/economy.js'
import {
  describeProposal, respondToFusion, invalidateProposalsForPlayer,
} from './game/combos.js'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  // Inputs are <1 KB; the 1 MB default is a free memory-abuse surface.
  maxHttpBufferSize: 10_000,
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.use(express.static(path.join(__dirname, '../client/dist')))

const rooms = new RoomManager()

function serializePlayer(p) {
  return { id: p.id, displayName: p.displayName, element: p.element, isBot: p.isBot }
}

function roomJoinedPayload(room, player, includeToken) {
  const payload = {
    roomCode: room.code,
    phase:    room.phase,
    element:  player.element,
    playerId: player.id,
    hostId:   room.hostId,
    settings: room.settings,
    players:  room.players.map(serializePlayer),
  }
  if (includeToken && player.reconnectToken) payload.reconnectToken = player.reconnectToken
  return payload
}

// How long a finished room is kept alive so its players can press RESTART on
// the end screen. Before restart existed, loop.js onEnd destroyed the room the
// instant a run ended, which made a restart button at the exact moment a
// player most wants one impossible. The room costs nothing while it waits --
// its loop is stopped -- and the ordinary disconnect paths still reap it early
// when everyone leaves. This timer is only the backstop for a room nobody
// comes back to.
const ENDED_ROOM_GRACE_MS = 5 * 60 * 1000

// Minimum gap between restarts of one room. Restart is open to anyone in the
// room (product decision, 2026-08-31), and each one rebuilds the whole state
// and pushes a full snapshot to four clients, so a held-down button is a free
// amplification. This bounds the rate without gating who may press it.
const RESTART_COOLDOWN_MS = 3000

// Fill bots, build the authoritative state, enter build wave 1, start the loop,
// and tell the room. Shared by the host's first start and by RESTART_MATCH,
// so a restarted match is byte-for-byte the same kind of match as a fresh one
// -- a new seed included.
function beginMatch(room) {
  rooms.fillBotsIfNeeded(room)

  room.phase       = 'active'
  room.inputBuffer = new Map()
  room.state       = createGameState(room)
  startBuildPhase(room.state, 1)

  const onEnd = () => scheduleEndedRoomCleanup(room)
  room.suspendLoop = () => stopLoop(room)
  room.resumeLoop  = () => startLoop(room, io, onEnd)

  startLoop(room, io, onEnd)

  io.to(room.code).emit(EVENTS.GAME_START, {
    snapshot: buildFullSnapshot(room.state),
    phase:    room.state.phase,
    wave:     room.state.wave,
    players:  room.players.map(serializePlayer),
    settings: room.settings,
  })
}

// A run ended. Keep the room so RESTART works from the end screen, and destroy
// it later if nobody uses it. unref so a waiting room never holds the process
// open on its own -- same reasoning as the reconnect hold timers.
function scheduleEndedRoomCleanup(room) {
  clearTimeout(room.endedTimer)
  room.endedTimer = setTimeout(() => {
    room.endedTimer = null
    rooms.destroyRoom(room.code)
  }, ENDED_ROOM_GRACE_MS)
  room.endedTimer.unref?.()
}

// Host-initiated match start.
function startGame(room) {
  if (room.phase !== 'lobby') return
  beginMatch(room)
  console.log(`[${room.code}] match start, seed=${room.state.seed}`)
}

// Anyone in the room may restart it, including from the end screen. This
// deliberately lets one player wipe another's run: the alternative rules were
// weighed and open access was chosen (2026-08-31). The client asks for
// confirmation before sending this, so an accident takes two presses.
function restartMatch(room) {
  clearTimeout(room.endedTimer)
  room.endedTimer = null
  // The old loop must die before a new state replaces the one it is reading,
  // or two loops tick the same room.
  stopLoop(room)
  room.suspended = false
  beginMatch(room)
  console.log(`[${room.code}] match restart, seed=${room.state.seed}`)
}

io.on('connection', socket => {
  console.log('client connected:', socket.id)

  socket.on(EVENTS.CREATE_ROOM, ({ displayName, settings } = {}) => {
    const result = rooms.createRoom(socket, displayName, settings)
    if (result.error) {
      socket.emit(EVENTS.ROOM_ERROR, { message: result.error })
      return
    }
    const { room, player } = result
    socket.emit(EVENTS.ROOM_CREATED, { roomCode: room.code })
    socket.emit(EVENTS.ROOM_JOINED, roomJoinedPayload(room, player, true))
  })

  socket.on(EVENTS.JOIN_ROOM, ({ roomCode, displayName } = {}) => {
    const result = rooms.joinRoom(socket, roomCode, displayName)
    if (result.error) {
      socket.emit(EVENTS.ROOM_ERROR, { message: result.error })
      return
    }
    const { room, player } = result
    socket.emit(EVENTS.ROOM_JOINED, roomJoinedPayload(room, player, true))
    socket.to(room.code).emit(EVENTS.PLAYER_JOINED, {
      playerId:    player.id,
      displayName: player.displayName,
      element:     player.element,
    })
    // A client that joins an in-progress match needs the current state now.
    if (room.phase === 'active' && room.state) {
      socket.emit(EVENTS.GAME_START, {
        snapshot: buildFullSnapshot(room.state),
        phase:    room.state.phase,
        wave:     room.state.wave,
        players:  room.players.map(serializePlayer),
        settings: room.settings,
      })
    }
  })

  socket.on(EVENTS.RECONNECT_TOKEN, ({ token } = {}) => {
    const result = rooms.reconnect(socket, token)
    if (result.error) {
      // CP1 L2: any failure of a reconnect attempt means the held token is
      // unusable — tag it with a code so the client clears it (message-substring
      // matching missed 'Room no longer exists' / 'Player slot released').
      socket.emit(EVENTS.ROOM_ERROR, { message: result.error, code: 'RECONNECT_INVALID' })
      return
    }
    const { room, player, oldSocketId } = result
    // CP1 H3: kick the zombie socket the token was stolen from (duplicated tab /
    // restored session) so it stops drawing snapshot egress.
    if (oldSocketId) io.sockets.sockets.get(oldSocketId)?.disconnect(true)
    socket.emit(EVENTS.ROOM_JOINED, roomJoinedPayload(room, player, false))
    socket.to(room.code).emit(EVENTS.PLAYER_RECONNECTED, { playerId: player.id })
    if (room.phase === 'active' && room.state) {
      socket.emit(EVENTS.GAME_START, {
        snapshot: buildFullSnapshot(room.state),
        phase:    room.state.phase,
        wave:     room.state.wave,
        players:  room.players.map(serializePlayer),
        settings: room.settings,
      })
    }
  })

  socket.on(EVENTS.REQUEST_START, () => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.phase !== 'lobby') return
    const caller = room.players.find(p => p.socketId === socket.id)
    if (!caller || caller.id !== room.hostId) return
    startGame(room)
  })

  socket.on(EVENTS.RESTART_MATCH, () => {
    const room = rooms.getRoomBySocket(socket.id)
    // A started room, in play or finished. A lobby has nothing to restart --
    // that is what REQUEST_START is for.
    if (!room || room.phase !== 'active' || !room.state) return
    // Must actually be in the room. Anyone in it qualifies; a socket that is
    // not a seated player does not.
    if (!room.players.some(p => p.socketId === socket.id)) return
    const t = Date.now()
    if (room.lastRestartAt && t - room.lastRestartAt < RESTART_COOLDOWN_MS) return
    room.lastRestartAt = t
    restartMatch(room)
  })

  socket.on(EVENTS.SELECT_ELEMENT, ({ element } = {}) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room) return
    const caller = room.players.find(p => p.socketId === socket.id)
    if (!caller) return
    const result = rooms.selectElement(room, caller.id, element)
    if (result.error) {
      socket.emit(EVENTS.ROOM_ERROR, { message: result.error })
      return
    }
    io.to(room.code).emit(EVENTS.ELEMENT_CHANGED, {
      playerId: result.player.id,
      element:  result.player.element,
    })
  })

  socket.on(EVENTS.SET_READY, ({ ready } = {}) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.phase !== 'active' || !room.state) return
    const roomPlayer = room.players.find(p => p.socketId === socket.id)
    if (!roomPlayer) return
    const gp = room.state.players.find(p => p.id === roomPlayer.id)
    if (gp) gp.ready = !!ready
  })

  socket.on(EVENTS.PLAYER_INPUT, (input = {}) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.phase !== 'active' || !room.inputBuffer) return
    const roomPlayer = room.players.find(p => p.socketId === socket.id)
    if (!roomPlayer) return
    // Sanitize: booleans coerced, aim rejected unless finite (a NaN aim would
    // poison ability cones and projectile velocity — same rule as ez-ctf's
    // mouseAngle guard). Latest-wins per tick; the loop clears the buffer.
    const aimX = Number(input.aimX), aimY = Number(input.aimY)
    room.inputBuffer.set(roomPlayer.id, {
      keys: {
        w: !!input.keys?.w, a: !!input.keys?.a,
        s: !!input.keys?.s, d: !!input.keys?.d,
      },
      aimX: Number.isFinite(aimX) ? aimX : 1,
      aimY: Number.isFinite(aimY) ? aimY : 0,
      actions: {
        basic:   !!input.actions?.basic,
        special: !!input.actions?.special,
        second:  !!input.actions?.second,
        repair:  !!input.actions?.repair,
      },
    })
  })

  socket.on(EVENTS.BUILD_STRUCTURE, ({ type, gx, gy, orient, dir } = {}) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.phase !== 'active' || !room.state) return
    const roomPlayer = room.players.find(p => p.socketId === socket.id)
    if (!roomPlayer) return
    const gp = room.state.players.find(p => p.id === roomPlayer.id)
    if (!gp) return
    const res = buildStructure(room.state, gp, type, gx, gy, Date.now(), { orient, dir })
    if (!res.ok) {
      socket.emit(EVENTS.STRUCTURE_REJECTED, { action: 'build', reason: res.reason })
      return
    }
    // A placement that completes a 2x2 with a pairable partner opens a consent
    // gate rather than fusing (combos.js). Broadcast it: every client draws the
    // preview, and the ones in requiredIds are the ones that must answer.
    if (res.fusionProposal) {
      io.to(room.code).emit(EVENTS.FUSION_PROPOSED, describeProposal(res.fusionProposal))
    }
  })

  socket.on(EVENTS.RESPOND_FUSION, ({ proposalId, accept, dir } = {}) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.phase !== 'active' || !room.state) return
    const roomPlayer = room.players.find(p => p.socketId === socket.id)
    if (!roomPlayer) return
    const gp = room.state.players.find(p => p.id === roomPlayer.id)
    if (!gp) return
    const res = respondToFusion(room.state, gp, proposalId, !!accept, Date.now(), { dir })
    if (!res.ok) {
      socket.emit(EVENTS.STRUCTURE_REJECTED, { action: 'fusion', reason: res.reason })
      return
    }
    // Only the still-waiting case is emitted here; every ENDING (fused,
    // rejected, stale) already queued a fusionEvent that the loop drains and
    // broadcasts, so there is exactly one resolution path.
    if (res.status === 'pending') {
      // `dir` rides along because the initiator's accept is where a directional
      // fusion's cardinal is chosen — the teammates who answer next must see
      // what they are agreeing to.
      io.to(room.code).emit(EVENTS.FUSION_UPDATED, { proposalId, consentedId: gp.id, dir: res.dir })
    }
  })

  socket.on(EVENTS.SELL_STRUCTURE, ({ structureId } = {}) => {
    const room = rooms.getRoomBySocket(socket.id)
    if (!room || room.phase !== 'active' || !room.state) return
    const roomPlayer = room.players.find(p => p.socketId === socket.id)
    if (!roomPlayer) return
    const gp = room.state.players.find(p => p.id === roomPlayer.id)
    if (!gp) return
    const res = sellStructure(room.state, gp, structureId)
    if (!res.ok) socket.emit(EVENTS.STRUCTURE_REJECTED, { action: 'sell', reason: res.reason })
  })

  socket.on('disconnect', () => {
    console.log('client disconnected:', socket.id)
    const result = rooms.leaveRoom(socket.id)
    if (!result) return
    const { room, player, mode } = result

    // Either way the player is no longer answering: a proposal that needs their
    // consent ends now (the loop broadcasts the queued 'cancelled' event)
    // instead of stalling until its timeout. A reconnect does not revive it:
    // both ingredients are still standing and still doing their own jobs, and
    // re-opening a proposal means re-placing one of them (placement is the only
    // trigger — see combos.js).
    if (room.state) invalidateProposalsForPlayer(room.state, player.id)

    if (mode === 'left') {
      io.to(room.code).emit(EVENTS.PLAYER_LEFT, { playerId: player.id })
      // CP1 H1: if the host left the lobby, the room migrated host to a
      // remaining human — tell clients so the new host's Start button appears.
      if (result.newHostId) {
        io.to(room.code).emit(EVENTS.HOST_CHANGED, { hostId: result.newHostId })
      }
      if (!rooms.getRoomByCode(room.code)) stopLoop(room)
    } else if (mode === 'disconnected') {
      io.to(room.code).emit(EVENTS.PLAYER_DISCONNECTED, {
        playerId:          player.id,
        reconnectWindowMs: 60000,
      })
    }
  })
})

// CORS on this route only — the always-on wake shell polls it cross-origin
// while the free-tier service cold-starts. No data worth protecting here.
app.get('/healthz', (_req, res) =>
  res.set('Access-Control-Allow-Origin', '*').json({ ok: true }))

// Start listening. Resolves with the bound port (pass 0 for an ephemeral port
// in tests). Auto-invoked below only when this file is the process entrypoint.
export function listen(port = process.env.PORT || 3000) {
  return new Promise(resolve =>
    httpServer.listen(port, () => resolve(httpServer.address().port)))
}

const isMain = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  listen().then(port => console.log(`Server running on :${port}`))
}

export { app, io, httpServer, rooms }
