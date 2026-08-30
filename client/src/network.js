// Network module: single owner of the Socket.io connection. Ported from
// ez-ctf. Scenes/UI import the singleton and use connect/on/off/emit plus the
// read-only identity fields. Persists reconnectToken in sessionStorage so a
// refresh mid-match resumes the slot via the soft-disconnect window.
//
// Exposes itself as window.__net for headless/text verification.

import { io } from 'socket.io-client'
import { EVENTS } from '../../shared/constants.js'

const TOKEN_KEY = 'elementia.reconnectToken'

class Network {
  constructor() {
    this.socket           = null
    this.isConnected      = false
    this.socketId         = null
    this.playerId         = null
    this.roomCode         = null
    this.element          = null
    this.roster           = []      // [{ id, displayName, element, isBot }]
    this.hostId           = null
    this.lastError        = null
    this.connectionStatus = 'connecting'
    this._statusHandlers  = new Set()
  }

  onStatus(h)  { this._statusHandlers.add(h) }
  offStatus(h) { this._statusHandlers.delete(h) }
  _setStatus(status) {
    if (this.connectionStatus === status) return
    this.connectionStatus = status
    for (const h of this._statusHandlers) h(status)
  }

  get reconnectToken() { return sessionStorage.getItem(TOKEN_KEY) }
  set reconnectToken(v) {
    if (v) sessionStorage.setItem(TOKEN_KEY, v)
    else   sessionStorage.removeItem(TOKEN_KEY)
  }

  connect() {
    if (this.socket) return this.socket
    // Same-origin: vite dev proxies /socket.io → :3000; prod serves both from Express.
    this.socket = io({ autoConnect: true })

    this.socket.on('connect', () => {
      this.isConnected = true
      this.socketId    = this.socket.id
      this._setStatus('connected')
      const token = this.reconnectToken
      if (token) this.socket.emit(EVENTS.RECONNECT_TOKEN, { token })
    })

    this.socket.on('disconnect', () => {
      this.isConnected = false
      this.socketId    = null
      this._setStatus('disconnected')
    })

    this.socket.on('connect_error', (err) => {
      this.lastError = err?.message ?? String(err)
    })

    this.socket.on(EVENTS.ROOM_JOINED, (payload) => {
      // Cached here, at the module that is connected from the very first line
      // of main.js, because ROOM_JOINED and GAME_START can both land BEFORE
      // GameScene has finished Preload and attached its own listeners. A scene
      // that missed them had an empty roster for the whole match, which made
      // every other element's special read "not yours" even when a bot owned
      // it -- and, separately, left the music silent. Anything that needs the
      // roster reads net.roster instead of hoping it caught the event.
      if (Array.isArray(payload?.players)) this.roster = payload.players
      this.roomCode = payload.roomCode ?? null
      this.element  = payload.element  ?? null
      this.playerId = payload.playerId ?? null
      this.hostId   = payload.hostId   ?? null
      if (payload.reconnectToken) this.reconnectToken = payload.reconnectToken
    })

    // GAME_START carries the roster AFTER bots are filled in
    // (server/index.js startGame calls fillBotsIfNeeded before emitting), so
    // it supersedes the ROOM_JOINED copy. That copy is taken at JOIN time and
    // contains no bots at all -- caching only that one made every bot-owned
    // element special read "not yours" for any client that missed GAME_START,
    // which is the very case the cache exists to cover.
    this.socket.on(EVENTS.GAME_START, (payload) => {
      if (Array.isArray(payload?.players)) this.roster = payload.players
    })

    this.socket.on(EVENTS.ROOM_ERROR, (payload) => {
      this.lastError = payload?.message ?? 'unknown room error'
      // Clear a dead reconnect token by explicit code (CP1 L2) — not a brittle
      // message-substring match that missed several reconnect failure strings.
      if (payload?.code === 'RECONNECT_INVALID') this.reconnectToken = null
    })

    this.socket.on(EVENTS.HOST_CHANGED, (payload) => {
      this.hostId = payload?.hostId ?? this.hostId
    })

    return this.socket
  }

  on(event, handler)  { this.socket?.on(event, handler) }
  off(event, handler) { this.socket?.off(event, handler) }
  emit(event, payload) {
    if (!this.socket) throw new Error('network.emit() before connect()')
    this.socket.emit(event, payload)
  }
}

const net = new Network()
if (typeof window !== 'undefined') window.__net = net
export default net
