// RoomManager unit tests — the Elementia-specific changes over the ez-ctf port:
// element slot assignment, bot-fill by element, room settings normalization,
// and the free-tier MAX_CONCURRENT_ROOMS cap (CP0 follow-up M4).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import RoomManager, { normalizeSettings } from '../../server/rooms/index.js'
import { CONFIG, ELEMENTS } from '../../shared/constants.js'

let sid = 0
function fakeSocket() {
  return { id: `s${sid++}`, join() {}, }
}

test('createRoom assigns EARTH to the host and stores normalized settings', () => {
  const rm = new RoomManager()
  const { room, player } = rm.createRoom(fakeSocket(), 'Alice', { timingStyle: 'ready', friendlyFire: true })
  assert.equal(player.element, 'EARTH')
  assert.equal(room.hostId, player.id)
  assert.deepEqual(room.settings, { timingStyle: 'ready', friendlyFire: true })
})

test('joining humans take distinct elements in canonical order', () => {
  const rm = new RoomManager()
  const { room } = rm.createRoom(fakeSocket(), 'Alice')
  const b = rm.joinRoom(fakeSocket(), room.code, 'Bob')
  const c = rm.joinRoom(fakeSocket(), room.code, 'Cara')
  assert.equal(b.player.element, 'FIRE')
  assert.equal(c.player.element, 'WATER')
})

test('fillBotsIfNeeded completes the team to all 4 elements', () => {
  const rm = new RoomManager()
  const { room } = rm.createRoom(fakeSocket(), 'Alice')
  rm.joinRoom(fakeSocket(), room.code, 'Bob')
  rm.fillBotsIfNeeded(room)
  assert.equal(room.players.length, CONFIG.MAX_PLAYERS)
  assert.deepEqual(room.players.map(p => p.element).sort(), [...ELEMENTS].sort())
  const bots = room.players.filter(p => p.isBot)
  assert.equal(bots.length, 2)
  assert.deepEqual(bots.map(b => b.element).sort(), ['WATER', 'WIND'])
})

test('a 5th human cannot join a full lobby', () => {
  const rm = new RoomManager()
  const { room } = rm.createRoom(fakeSocket(), 'A')
  rm.joinRoom(fakeSocket(), room.code, 'B')
  rm.joinRoom(fakeSocket(), room.code, 'C')
  rm.joinRoom(fakeSocket(), room.code, 'D')
  const fifth = rm.joinRoom(fakeSocket(), room.code, 'E')
  assert.equal(fifth.error, 'Room is full')
})

test('MAX_CONCURRENT_ROOMS caps live rooms (free-tier bandwidth guard, M4)', () => {
  const rm = new RoomManager()
  assert.equal(CONFIG.MAX_CONCURRENT_ROOMS, 2)
  const r1 = rm.createRoom(fakeSocket(), 'A')
  const r2 = rm.createRoom(fakeSocket(), 'B')
  assert.ok(!r1.error && !r2.error)
  const r3 = rm.createRoom(fakeSocket(), 'C')
  assert.ok(r3.error, 'third concurrent room must be rejected')
  assert.equal(rm.rooms.size, 2)

  // Freeing a room (all humans leave in lobby) reopens a slot.
  rm.leaveRoom([...rm.rooms.get(r1.room.code).players][0].socketId)
  const r4 = rm.createRoom(fakeSocket(), 'D')
  assert.ok(!r4.error, 'a slot frees once a room is destroyed')
})

test('CP1 C1: a socket already in a room cannot create or join another', () => {
  const rm = new RoomManager()
  const sock = fakeSocket()
  const { room } = rm.createRoom(sock, 'Alice')
  // Same socket creating a second room is rejected (no room-slot leak).
  const dup = rm.createRoom(sock, 'Alice again')
  assert.equal(dup.error, 'Already in a room')
  assert.equal(rm.rooms.size, 1)
  // Same socket self-joining its own room is rejected (no duplicate slot).
  const selfJoin = rm.joinRoom(sock, room.code, 'Alice yet again')
  assert.equal(selfJoin.error, 'Already in a room')
  assert.equal(room.players.length, 1)
})

test('selectElement swaps a lobby player onto a free element', () => {
  const rm = new RoomManager()
  const { room, player } = rm.createRoom(fakeSocket(), 'Alice') // starts EARTH
  const res = rm.selectElement(room, player.id, 'WIND')
  assert.equal(res.error, undefined)
  assert.equal(res.player.element, 'WIND')
  assert.equal(player.element, 'WIND')
})

test('selectElement rejects an element already held by another player', () => {
  const rm = new RoomManager()
  const { room, player: alice } = rm.createRoom(fakeSocket(), 'Alice') // EARTH
  const bob = rm.joinRoom(fakeSocket(), room.code, 'Bob').player // FIRE
  const res = rm.selectElement(room, bob.id, 'EARTH')
  assert.equal(res.error, 'Element taken')
  assert.equal(bob.element, 'FIRE', 'a rejected pick leaves the caller where they were')
  assert.equal(alice.element, 'EARTH')
})

test('selectElement re-picking your own current element is a no-op success', () => {
  const rm = new RoomManager()
  const { room, player } = rm.createRoom(fakeSocket(), 'Alice')
  const res = rm.selectElement(room, player.id, 'EARTH')
  assert.equal(res.error, undefined)
  assert.equal(res.player.element, 'EARTH')
})

test('selectElement rejects an unknown element and a started match', () => {
  const rm = new RoomManager()
  const { room, player } = rm.createRoom(fakeSocket(), 'Alice')
  assert.equal(rm.selectElement(room, player.id, 'PLASMA').error, 'Unknown element')
  room.phase = 'active'
  assert.equal(rm.selectElement(room, player.id, 'WIND').error, 'Match already started')
})

test('CP1 H1: host leaving the lobby migrates host to the next human', () => {
  const rm = new RoomManager()
  const hostSock = fakeSocket()
  const { room, player: host } = rm.createRoom(hostSock, 'Alice')
  const bob = rm.joinRoom(fakeSocket(), room.code, 'Bob').player
  assert.equal(room.hostId, host.id)

  const res = rm.leaveRoom(hostSock.id)
  assert.equal(res.mode, 'left')
  assert.equal(res.newHostId, bob.id, 'host migrates to the remaining human')
  assert.equal(room.hostId, bob.id)
  assert.ok(rm.rooms.has(room.code), 'room survives host leaving')
})

test('CP1 H1: last human leaving destroys the room (no dangling host)', () => {
  const rm = new RoomManager()
  const sock = fakeSocket()
  const { room } = rm.createRoom(sock, 'Solo')
  const res = rm.leaveRoom(sock.id)
  assert.equal(res.mode, 'left')
  assert.equal(res.newHostId, undefined)
  assert.equal(rm.rooms.has(room.code), false)
})

test('CP1 H3: reconnecting a still-connected slot unbinds the old socket', () => {
  const rm = new RoomManager()
  const sock1 = fakeSocket()
  const { room, player } = rm.createRoom(sock1, 'Alice')
  const token = player.reconnectToken
  assert.equal(player.socketId, sock1.id)

  // A duplicated tab replays the token on a new socket while sock1 is still live.
  const sock2 = fakeSocket()
  const res = rm.reconnect(sock2, token)
  assert.equal(res.oldSocketId, sock1.id, 'old socket surfaced for force-disconnect')
  assert.equal(res.player.socketId, sock2.id, 'slot rebound to the new socket')
  assert.equal(rm.socketToRoom.has(sock1.id), false, 'old reverse-map entry removed')
  assert.equal(rm.socketToRoom.get(sock2.id), room.code)
})

test('CP1 H3: leaveRoom always clears the socketToRoom entry (zombie cleanup)', () => {
  const rm = new RoomManager()
  const sock = fakeSocket()
  const { room } = rm.createRoom(sock, 'Alice')
  // Simulate a zombie: the reverse map points at a room but no player matches
  // the socket id (e.g. after a hijack rebind).
  room.players[0].socketId = 'other-socket'
  const res = rm.leaveRoom(sock.id)
  assert.equal(res, null, 'no player matches the stale socket')
  assert.equal(rm.socketToRoom.has(sock.id), false, 'stale reverse-map entry is cleaned')
})

test('normalizeSettings defaults invalid input to timer-ready / FF off', () => {
  assert.deepEqual(normalizeSettings({ timingStyle: 'bogus' }), { timingStyle: 'timer-ready', friendlyFire: false })
  assert.deepEqual(normalizeSettings(), { timingStyle: 'timer-ready', friendlyFire: false })
  assert.deepEqual(normalizeSettings({ timingStyle: 'fixed', friendlyFire: 1 }), { timingStyle: 'fixed', friendlyFire: true })
})
