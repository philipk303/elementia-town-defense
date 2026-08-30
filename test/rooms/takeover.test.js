// Phase 6 — mid-run human takeover of a bot slot. A human joining an active
// room inherits the bot's element, position, and live game-state (the same
// player object keeps its x/y/hp), the slot flips to human, its bot AI scratch
// is reset, and that element's special structures re-lock to the new human
// (they were buildable-by-anyone only while the owner was a bot).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import RoomManager from '../../server/rooms/index.js'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase } from '../../server/game/phaseMachine.js'
import { placeStructure } from '../../server/game/structures.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'

let sid = 0
function fakeSocket() {
  return { id: `s${sid++}`, join() {} }
}

// Stand up an active room: 1 human (EARTH host) + 3 bots, with a live game
// state attached the way index.js would on REQUEST_START.
function activeMatch() {
  const rm = new RoomManager()
  const { room } = rm.createRoom(fakeSocket(), 'Alice', { timingStyle: 'ready', friendlyFire: false })
  rm.fillBotsIfNeeded(room)
  room.phase = 'active'
  room.inputBuffer = new Map()
  room.state = createGameState(room, 12345)
  startBuildPhase(room.state, 1)
  return { rm, room }
}

test('takeover inherits the bot slot position/state and flips it to human', () => {
  const { rm, room } = activeMatch()
  const fireSlot = room.players.find(p => p.element === 'FIRE')
  assert.equal(fireSlot.isBot, true)

  // Move the live FIRE game-player somewhere distinctive and give it AI scratch.
  const gpBefore = room.state.players.find(p => p.element === 'FIRE')
  gpBefore.x = 321; gpBefore.y = 654
  gpBefore.hp = 42
  gpBefore.ai = { retreating: true, anchorX: 1, anchorY: 2 }

  const res = rm.joinRoom(fakeSocket(), room.code, 'Newcomer')
  assert.equal(res.mode, 'promoted')
  assert.equal(res.player.element, 'FIRE', 'inherits the first promotable element')
  assert.equal(res.player.isBot, false)

  const gp = room.state.players.find(p => p.element === 'FIRE')
  assert.equal(gp, gpBefore, 'same game-state player object — state is inherited, not recreated')
  assert.equal(gp.isBot, false, 'game-state slot flipped to human')
  assert.equal(gp.x, 321, 'position inherited')
  assert.equal(gp.y, 654)
  assert.equal(gp.hp, 42, 'HP/live state inherited')
  assert.equal(gp.ai, undefined, 'bot AI scratch reset so the human starts clean')
  assert.equal(gp.displayName, 'Newcomer', 'display name updated to the joining human')
})

test('takeover re-locks the element structures: buildable-by-anyone while a bot, element-locked after', () => {
  const { rm, room } = activeMatch()
  const state = room.state
  const host = state.players.find(p => p.element === 'EARTH')  // the human
  host.gold = 999

  // While FIRE is a bot, the EARTH human may build the FIRE special (structure
  // ownership rule: a bot-owned element's specials are open to any human).
  const before = placeStructure(state, host, STRUCTURE_TYPES.FIRE_SPECIAL, 3, 3, 0)
  assert.equal(before.ok, true, 'EARTH could place the FIRE special while FIRE was bot-controlled')

  // A human takes over FIRE.
  rm.joinRoom(fakeSocket(), room.code, 'Newcomer')

  // Now the FIRE special is element-locked to its human — EARTH can no longer build it.
  const after = placeStructure(state, host, STRUCTURE_TYPES.FIRE_SPECIAL, 5, 5, 0)
  assert.equal(after.ok, false)
  assert.equal(after.reason, 'element-locked', 'FIRE special re-locked to the taking-over human')
})
