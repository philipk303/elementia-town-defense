// Room lifecycle: create, join, leave, bot-fill, lookups, reconnect tokens.
// Ported from ez-ctf's RoomManager with three Elementia changes:
//   - Slots carry an ELEMENT (Earth/Fire/Water/Wind), not a red/blue team; the
//     team is always all 4 elements (humans first, bots fill the rest).
//   - Rooms carry creator settings (build-timing style + friendly-fire flag).
//   - createRoom enforces MAX_CONCURRENT_ROOMS (free-tier bandwidth cap; CP0
//     follow-up M4 — reject a 3rd concurrent room).
//
// Slot taxonomy (single rule: reconnectToken === null ⇔ slot is promotable):
//   - Human:               isBot=false, socketId!=null, reconnectToken!=null
//   - Disconnected (held): isBot=true,  socketId=null,  reconnectToken!=null
//   - Bot (orig/expired):  isBot=true,  socketId=null,  reconnectToken=null

import { randomBytes } from 'crypto'
import { CONFIG, ELEMENTS, TIMING_STYLES } from '../../shared/constants.js'
import { stopLoop } from '../game/loop.js'
import sanitizeName from './sanitizeName.js'

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // omit confusing 0/O/1/I

function generateRoomCode() {
  let code = ''
  for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return code
}

function generateId(prefix) {
  return `${prefix}_${randomBytes(4).toString('hex')}`
}

function liveHumanCount(room) {
  return room.players.filter(p => !p.isBot && p.socketId).length
}

function openHoldCount(room) {
  return room.players.filter(p => p.reconnectToken && !p.socketId).length
}

// First element (in canonical order) not yet assigned to any slot in the room.
function firstFreeElement(room) {
  const used = new Set(room.players.map(p => p.element))
  return ELEMENTS.find(e => !used.has(e)) ?? null
}

// Normalize creator-supplied room settings to valid values.
export function normalizeSettings(raw = {}) {
  const timingStyle = TIMING_STYLES.includes(raw.timingStyle) ? raw.timingStyle : 'timer-ready'
  return { timingStyle, friendlyFire: !!raw.friendlyFire }
}

export default class RoomManager {
  constructor() {
    this.rooms         = new Map() // roomCode → room
    this.socketToRoom  = new Map() // socketId → roomCode
    this.tokenToPlayer = new Map() // reconnectToken → { roomCode, playerId }
  }

  createRoom(socket, displayName, settings) {
    // CP1 C1: a socket already in a room must not create another — otherwise
    // socketToRoom.set overwrites the mapping and the first room leaks a
    // phantom human forever, permanently consuming a concurrency slot.
    if (this.socketToRoom.has(socket.id)) return { error: 'Already in a room' }

    // Free-tier concurrency cap (CP0 M4). Count only live rooms.
    if (this.rooms.size >= CONFIG.MAX_CONCURRENT_ROOMS) {
      return { error: 'Server at capacity — try again shortly' }
    }

    let code
    do { code = generateRoomCode() } while (this.rooms.has(code))

    const room = {
      code,
      players:      [],
      state:        null,
      loopInterval: null,
      phase:        'lobby',        // RoomManager status: 'lobby' | 'active' | 'ended'
      settings:     normalizeSettings(settings),
      suspended:    false,
      suspendLoop:  null,
      resumeLoop:   null,
    }
    this.rooms.set(code, room)

    const player = this._addPlayer(room, socket, displayName)
    room.hostId = player.id
    return { room, player }
  }

  joinRoom(socket, roomCode, displayName) {
    // CP1 C1: same guard — a socket already in a room cannot join another (nor
    // self-join, which would duplicate its slot and steal a second element).
    if (this.socketToRoom.has(socket.id)) return { error: 'Already in a room' }

    const room = this.rooms.get(roomCode)
    if (!room) return { error: 'Room not found' }

    if (room.phase === 'lobby') {
      const humanCount = room.players.filter(p => !p.isBot).length
      if (humanCount >= CONFIG.MAX_PLAYERS) return { error: 'Room is full' }
      const player = this._addPlayer(room, socket, displayName)
      return { room, player, mode: 'joined' }
    }

    if (room.phase === 'active') {
      // Mid-match promotion of a bot slot (inherits that slot's element).
      const target = this._pickPromotableSlot(room)
      if (!target) return { error: 'Room is full' }
      this._promoteBotSlot(room, target, socket, displayName)
      if (room.suspended && room.resumeLoop) {
        room.suspended = false
        room.resumeLoop()
      }
      return { room, player: target, mode: 'promoted' }
    }

    return { error: 'Room is in progress' }
  }

  _pickPromotableSlot(room) {
    const promotable = room.players.filter(p => p.isBot && !p.reconnectToken)
    return promotable[0] ?? null   // element order is the deterministic pick
  }

  _promoteBotSlot(room, slot, socket, displayName) {
    const reconnectToken = randomBytes(16).toString('hex')
    slot.isBot          = false
    slot.socketId       = socket.id
    slot.reconnectToken = reconnectToken
    const cleanName = sanitizeName(displayName)
    if (cleanName) slot.displayName = cleanName

    this.socketToRoom.set(socket.id, room.code)
    this.tokenToPlayer.set(reconnectToken, { roomCode: room.code, playerId: slot.id })
    socket.join(room.code)

    this._syncSlotToState(room, slot)
  }

  // Mirror a room slot's identity onto its game-state player so the tick's bot
  // driver (Phase 6) drives/stops driving it, matching displayName.
  _syncSlotToState(room, slot) {
    const gp = room.state?.players.find(p => p.id === slot.id)
    if (!gp) return
    gp.isBot       = slot.isBot
    gp.displayName = slot.displayName
    gp.ai          = undefined
  }

  _addPlayer(room, socket, displayName) {
    const element = firstFreeElement(room)
    const reconnectToken = randomBytes(16).toString('hex')

    const player = {
      id:             generateId('p'),
      socketId:       socket.id,
      displayName:    sanitizeName(displayName) || `Player${room.players.length + 1}`,
      element,
      isBot:          false,
      reconnectToken,
      disconnectedAt: null,
      holdTimer:      null,
    }
    room.players.push(player)
    this.socketToRoom.set(socket.id, room.code)
    this.tokenToPlayer.set(reconnectToken, { roomCode: room.code, playerId: player.id })
    socket.join(room.code)
    return player
  }

  // Lobby-only: a human requests a specific element slot (character select).
  // Never fails the caller out of the room -- an unavailable element is just a
  // no-op (the caller keeps whatever they had), same "never fail the join"
  // spirit as firstFreeElement. Only a human's own slot can be changed, and
  // only while the room is still in 'lobby' (bots/active-match slots are
  // reassigned by fillBotsIfNeeded / promotion, not this path).
  selectElement(room, playerId, element) {
    if (room.phase !== 'lobby') return { error: 'Match already started' }
    if (!ELEMENTS.includes(element)) return { error: 'Unknown element' }
    const player = room.players.find(p => p.id === playerId)
    if (!player) return { error: 'Not in this room' }
    if (player.element === element) return { room, player }
    const holder = room.players.find(p => p.element === element)
    if (holder) return { error: 'Element taken' }
    player.element = element
    return { room, player }
  }

  // Fill remaining element slots with bots so the team is always all 4 elements.
  fillBotsIfNeeded(room) {
    while (room.players.length < CONFIG.MAX_PLAYERS) {
      const element = firstFreeElement(room)
      room.players.push({
        id:             generateId('bot'),
        socketId:       null,
        displayName:    `${element[0]}${element.slice(1).toLowerCase()} Bot`,
        element,
        isBot:          true,
        reconnectToken: null,
        disconnectedAt: null,
        holdTimer:      null,
      })
    }
  }

  // Returns { room, player, mode }: 'left' (lobby: slot removed, maybe host
  // migrated) or 'disconnected' (active: slot soft-held, bot takes over). null
  // if unknown. There is no post-game room state — a finished run's room is
  // destroyed by loop.js onEnd, so 'ended' never appears here.
  leaveRoom(socketId) {
    const code = this.socketToRoom.get(socketId)
    if (!code) return null
    // CP1 H3: clear the reverse map as soon as the code resolves, before any
    // early return — a hijacked/zombie socket (no matching player) would
    // otherwise leave a permanent stale socketToRoom entry.
    this.socketToRoom.delete(socketId)

    const room = this.rooms.get(code)
    if (!room) return null

    const player = room.players.find(p => p.socketId === socketId)
    if (!player) return null

    if (room.phase === 'lobby') {
      const idx = room.players.indexOf(player)
      room.players.splice(idx, 1)
      if (player.reconnectToken) this.tokenToPlayer.delete(player.reconnectToken)

      const humansLeft = room.players.some(p => !p.isBot)
      if (!humansLeft) {
        stopLoop(room)
        if (room.endedTimer) { clearTimeout(room.endedTimer); room.endedTimer = null }
        this.rooms.delete(code)
        return { room, player, mode: 'left' }
      }

      // CP1 H1: if the host left, migrate host to the earliest remaining human
      // so the lobby can still be started. Signalled back to index.js to broadcast.
      let newHostId = null
      if (player.id === room.hostId) {
        const nextHost = room.players.find(p => !p.isBot)
        room.hostId = nextHost ? nextHost.id : null
        newHostId = room.hostId
      }
      return { room, player, mode: 'left', newHostId }
    }

    // Active phase: soft-disconnect.
    player.isBot          = true
    player.socketId       = null
    player.disconnectedAt = Date.now()
    if (room.inputBuffer) room.inputBuffer.delete(player.id)

    this._syncSlotToState(room, player)

    player.holdTimer = setTimeout(() => this._expireHold(room, player), CONFIG.DISCONNECT_HOLD_MS)
    // A reconnect-hold timer must never be the sole thing keeping the process
    // alive (the listening socket + active loops already do). Lets tests and an
    // idle server exit cleanly; still fires normally while the server is up.
    player.holdTimer.unref?.()

    if (liveHumanCount(room) === 0 && !room.suspended && room.suspendLoop) {
      room.suspended = true
      room.suspendLoop()
    }

    return { room, player, mode: 'disconnected' }
  }

  _expireHold(room, player) {
    if (!this.rooms.has(room.code)) return
    if (player.holdTimer === null) return

    player.holdTimer = null
    if (player.reconnectToken) {
      this.tokenToPlayer.delete(player.reconnectToken)
      player.reconnectToken = null
    }
    player.disconnectedAt = null

    if (room.suspended && liveHumanCount(room) === 0 && openHoldCount(room) === 0) {
      stopLoop(room)
      if (room.endedTimer) { clearTimeout(room.endedTimer); room.endedTimer = null }
      for (const p of room.players) {
        if (p.socketId)       this.socketToRoom.delete(p.socketId)
        if (p.reconnectToken) this.tokenToPlayer.delete(p.reconnectToken)
        if (p.holdTimer)      { clearTimeout(p.holdTimer); p.holdTimer = null }
      }
      this.rooms.delete(room.code)
    }
  }

  getRoomBySocket(socketId) {
    const code = this.socketToRoom.get(socketId)
    return code ? this.rooms.get(code) : null
  }

  getRoomByCode(roomCode) {
    return this.rooms.get(roomCode) || null
  }

  // Hard wipe — used by loop.js onEnd when a run ends. Clears socket/token maps
  // for ALL players, stops the loop, removes the room. Sockets stay connected
  // and can read GAME_END; later events are unrouted until they re-create/join.
  destroyRoom(roomCode) {
    const room = this.rooms.get(roomCode)
    if (!room) return
    stopLoop(room)
    // A finished room holds a grace timer that would destroy it later (see
    // scheduleEndedRoomCleanup in server/index.js). Room codes are reusable,
    // so a timer left running past this point could destroy a DIFFERENT room
    // that happened to be issued the same code.
    if (room.endedTimer) { clearTimeout(room.endedTimer); room.endedTimer = null }
    for (const player of room.players) {
      if (player.socketId)       this.socketToRoom.delete(player.socketId)
      if (player.reconnectToken) this.tokenToPlayer.delete(player.reconnectToken)
      if (player.holdTimer)      { clearTimeout(player.holdTimer); player.holdTimer = null }
    }
    this.rooms.delete(roomCode)
  }

  reconnect(socket, token) {
    const ref = this.tokenToPlayer.get(token)
    if (!ref) return { error: 'Invalid reconnect token' }
    const room = this.rooms.get(ref.roomCode)
    if (!room) return { error: 'Room no longer exists' }
    const player = room.players.find(p => p.id === ref.playerId)
    if (!player) return { error: 'Player slot released' }

    if (player.disconnectedAt &&
        Date.now() - player.disconnectedAt > CONFIG.DISCONNECT_HOLD_MS) {
      return { error: 'Reconnect window expired' }
    }

    if (player.holdTimer) {
      clearTimeout(player.holdTimer)
      player.holdTimer = null
    }

    // CP1 H3: if the slot is still bound to a live socket (e.g. the token was
    // replayed by a duplicated tab / restored session), unbind the old socket
    // first so it doesn't linger as a zombie that still draws snapshot egress
    // and leaks a socketToRoom entry. index.js force-disconnects it via the
    // returned oldSocketId.
    let oldSocketId = null
    if (player.socketId && player.socketId !== socket.id) {
      oldSocketId = player.socketId
      this.socketToRoom.delete(oldSocketId)
    }

    player.socketId       = socket.id
    player.isBot          = false
    player.disconnectedAt = null

    this.socketToRoom.set(socket.id, room.code)
    socket.join(room.code)

    this._syncSlotToState(room, player)

    if (room.suspended && room.resumeLoop) {
      room.suspended = false
      room.resumeLoop()
    }

    return { room, player, oldSocketId }
  }
}
