// Phase 3 acceptance (plan §"Phase 3 — Acceptance"), reworked after the CP2
// reviews:
//   1. A REALISTIC undefended run (the 4 bot-players actually present, as a
//      match creates them) ends in a LOSS, and the aggro chase state is exercised
//      in-sim — closes the CP2-H3 gap where the old test set players=[] and never
//      entered `chase`.
//   2. A scripted maze + towers alone clears waves 1–3 with the hall intact.
//   3. A full 10-wave defended run always RESOLVES (won or lost) — never hangs.
//      This is the CP2-C1 regression: an enemy shoved off-grid used to soft-lock
//      the wave forever; the whole run must terminate.
// All drive the real tickGame machinery; the only affordance is fast-forwarding
// the untimed build/waveEnd intermissions.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { hpToBand } from '../../server/game/costField.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

function makeMatch({ players = 'keep' } = {}) {
  const room = {
    players: ['EARTH', 'FIRE', 'WATER', 'WIND'].map((element, i) => ({
      id: `bot${i}`, element, displayName: element, isBot: true,
    })),
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, 12345)
  if (players === 'none') state.players = []
  startBuildPhase(state, 1)
  return state
}

let sid = 10_000
function addStructure(state, type, gx, gy) {
  const cat = BALANCE.STRUCTURES[type]
  const s = {
    id: sid++, type, ownerId: 'script', gx, gy, w: 1, h: 1,
    hp: cat.hp, maxHp: cat.hp, dormant: false, createdAt: 0, attackReadyAt: 0,
  }
  state.structures.push(s)
  state.costField.setWallBand(gx, gy, hpToBand(s.hp, s.maxHp))
  state.placedVersion++
  return s
}

// Drive the sim; fast-forward the untimed build/waveEnd phases. `onTick` observes
// each step. Stops when `until(state)` holds or the cap is hit.
function drive(state, until, { dt = 100, maxTicks = 60_000, onTick } = {}) {
  let now = 0
  for (let t = 0; t < maxTicks; t++) {
    now += dt
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    tickGame(state, null, now, dt)
    if (onTick) onTick(state)
    if (until(state)) return { ticks: t, simMs: now, timeout: false }
  }
  return { ticks: maxTicks, simMs: now, timeout: true }
}

// Build the scripted maze used by tests 2 & 3: a full-width barricade wall with a
// single gap at column 20, and watchtowers lining the corridor below it.
function buildMaze(state, { towerRows }) {
  const WALL_ROW = 8, GAP = 20
  for (let gx = 1; gx < 39; gx++) {
    if (gx === GAP) continue
    addStructure(state, STRUCTURE_TYPES.BARRICADE, gx, WALL_ROW)
  }
  for (let gy = WALL_ROW + 1; gy <= WALL_ROW + towerRows; gy++) {
    addStructure(state, STRUCTURE_TYPES.WATCHTOWER, GAP - 2, gy)
    addStructure(state, STRUCTURE_TYPES.WATCHTOWER, GAP + 2, gy)
    addStructure(state, STRUCTURE_TYPES.WATCHTOWER, GAP - 3, gy)
    addStructure(state, STRUCTURE_TYPES.WATCHTOWER, GAP + 3, gy)
  }
  state.costField.compute()
}

test('a realistic undefended town (players present) falls, exercising the aggro chase', () => {
  const state = makeMatch({ players: 'keep' })   // the 4 bot-players a match creates
  let sawChase = false
  const res = drive(state, s => s.phase === PHASES.LOST, {
    onTick: s => {
      const st = s.enemyStore
      for (let i = 0; i < st.count; i++) if (st.aggro[i].state === 'chase') { sawChase = true; break }
    },
  })
  assert.equal(res.timeout, false, 'the run must resolve, not hang')
  assert.equal(state.phase, PHASES.LOST)
  assert.ok(state.hall.hp <= 0, 'the hall was destroyed')
  assert.ok(sawChase, 'enemies actually entered the chase state in-sim (CP2-H3 coverage)')
})

test('a scripted maze of towers clears waves 1–3 with the hall intact', () => {
  const state = makeMatch({ players: 'none' })   // "towers alone"
  buildMaze(state, { towerRows: 10 })
  const res = drive(state, s => s.phase === PHASES.LOST || s.wave >= 4 || s.phase === PHASES.WON)
  assert.equal(res.timeout, false, 'the early game must resolve')
  assert.notEqual(state.phase, PHASES.LOST, 'towers alone should survive waves 1–3')
  assert.ok(state.wave >= 4, 'reached wave 4 build ⇒ waves 1–3 were each cleared')
  assert.ok(state.hall.hp > 0, 'the hall survived the first three waves')
})

test('a full 10-wave defended run always resolves — never soft-locks (CP2-C1)', () => {
  // A strong maze so the run reaches the deep waves where the off-grid soft-lock
  // used to strike. Whatever the outcome, the run must terminate.
  const state = makeMatch({ players: 'keep' })
  buildMaze(state, { towerRows: 13 })
  const res = drive(state, s => s.phase === PHASES.WON || s.phase === PHASES.LOST)
  assert.equal(res.timeout, false, 'the run terminated (no enemy stuck off-grid hanging the wave)')
  assert.ok([PHASES.WON, PHASES.LOST].includes(state.phase))
})
