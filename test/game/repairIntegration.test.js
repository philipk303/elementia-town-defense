// End-to-end repair: a real PLAYER_INPUT-shaped action, through the real
// tickGame loop, out through the real snapshot encoder. The unit tests in
// repair.test.js cover tickRepairChannels directly; this one proves the
// wiring around it (tick order, input plumbing, wire ABI) actually connects.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { encodeSnapshot, decodeSnapshot } from '../../server/net/encode.js'
import { TILE_SIZE } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

function makeMatch() {
  const room = {
    players: [
      { id: 'h0', element: 'EARTH', displayName: 'human-earth', isBot: false },
      { id: 'h1', element: 'FIRE',  displayName: 'human-fire',  isBot: false },
      { id: 'b2', element: 'WATER', displayName: 'bot-water',   isBot: true },
      { id: 'b3', element: 'WIND',  displayName: 'bot-wind',    isBot: true },
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, 20260815)
  startBuildPhase(state, 1)
  return state
}

// Input in the exact shape server/index.js writes into the inputBuffer.
function inputs(state, { repair }) {
  const buf = new Map()
  for (const p of state.players) {
    buf.set(p.id, {
      keys: { w: false, a: false, s: false, d: false },
      aimX: 1, aimY: 0,
      actions: { basic: false, special: false, second: false, repair },
    })
  }
  return buf
}

// Park every player on top of a damaged structure so the range check passes
// regardless of where the match happened to spawn them.
function damagedStructureAt(state) {
  const s = state.structures[0]
  assert.ok(s, 'the match starts with at least one structure (the hall)')
  s.hp = Math.max(1, Math.floor(s.maxHp / 2))
  for (const p of state.players) {
    p.x = (s.gx + s.w / 2) * TILE_SIZE
    p.y = (s.gy + s.h / 2) * TILE_SIZE
    p.life = 'up'; p.alive = true
  }
  return s
}

test('holding repair through tickGame restores a damaged structure and emits repair_done', () => {
  const state = makeMatch()
  const s = damagedStructureAt(state)
  const startHp = s.hp

  let now = 0, sawFx = false, sawProgress = false
  for (let t = 0; t < 200; t++) {
    now += 50
    state.phaseClockMs = 0                     // hold the build phase open
    tickGame(state, inputs(state, { repair: true }), now, 50)
    if (s.repairMs > 0) sawProgress = true
    if (state.fx.some(f => f.type === 'repair_done')) { sawFx = true; break }
  }

  assert.ok(sawProgress, 'channel progress accrued on the structure')
  assert.ok(sawFx, 'a repair_done fx reached state.fx through the real tick loop')
  assert.equal(s.hp, s.maxHp, 'the structure came back to full hp')
  assert.ok(s.hp > startHp)
})

test('releasing the repair key mid-channel drops the banked progress', () => {
  const state = makeMatch()
  const s = damagedStructureAt(state)

  let now = 0
  for (let t = 0; t < 10; t++) {          // ~500ms of channel, short of CHANNEL_MS
    now += 50
    state.phaseClockMs = 0
    tickGame(state, inputs(state, { repair: true }), now, 50)
  }
  assert.ok(s.repairMs > 0 && s.repairMs < BALANCE.REPAIR.CHANNEL_MS, 'mid-channel')
  assert.ok(s.hp < s.maxHp, 'not repaired yet')

  now += 50
  state.phaseClockMs = 0
  tickGame(state, inputs(state, { repair: false }), now, 50)
  assert.equal(s.repairMs, 0, 'progress reset rather than banked')
  assert.ok(s.hp < s.maxHp, 'and no hp was granted')
})

test('repair progress round-trips to the client over the snapshot wire', () => {
  const state = makeMatch()
  const s = damagedStructureAt(state)

  let now = 0
  for (let t = 0; t < 5; t++) {
    now += 50
    state.phaseClockMs = 0
    tickGame(state, inputs(state, { repair: true }), now, 50)
  }

  const decoded = decodeSnapshot(encodeSnapshot(state, -1))
  const ds = decoded.structureState.find(d => d.id === s.id)
  assert.ok(ds, 'the structure rides the dynamic-state block')
  assert.ok(ds.repairMs > 0, 'the client can see live channel progress')
  assert.equal(ds.repairMs, Math.round(s.repairMs), 'quantized, not dropped')
})

test('an idle match never accrues repair progress (control)', () => {
  const state = makeMatch()
  const s = damagedStructureAt(state)
  let now = 0
  for (let t = 0; t < 100; t++) {
    now += 50
    state.phaseClockMs = 0
    tickGame(state, inputs(state, { repair: false }), now, 50)
  }
  assert.ok(!s.repairMs)
  assert.ok(s.hp < s.maxHp, 'nothing repaired itself')
})
