// Phase 6 acceptance (plan §"Phase 6 — Acceptance"): 1 human + 3 AI bots
// survive waves 1–4 behind a reasonable maze. One scripted human (EARTH) holds
// the choke and fights; the FIRE/WATER/WIND slots are AI teammate bots driven
// by the real FSM through the live tick path (runBotInputs → tickPlayers). The
// run must clear waves 1–4 with the hall standing.
//
// The control proves the bots are load-bearing (the CP2-H3 lesson): the SAME
// maze with the three bots neutralized (fed idle inputs so their AI is bypassed)
// loses — so the pass is the bots' doing, not the maze/towers alone.
//
// ---------------------------------------------------------------------------
// PHASE 8A — BOTH TESTS ARE SKIPPED. Read this before re-enabling either one.
//
// This pair is an acceptance STAMP, not a balance measurement, and Phase 8A
// established that it does not measure what its name claims.
//
// 1. It sets state.phaseClockMs = 0 every tick. The clock counts DOWN and
//    isBuildComplete('fixed') is `phaseClockMs <= 0`, so the build phase
//    completed in ONE tick for every wave. Economy, tower placement, combos and
//    dormancy were inert in every number this file ever produced.
//
// 2. The CONTROL was measuring spawn-grid synchronization, not bot
//    contribution. With no spawn jitter every spawn lands on an exact
//    INTERVAL_MS multiple with a fixed GATE_STAGGER_MS offset, so both gate
//    streams arrive as synchronized clumps (hall low-water 36.8 %). Task 1 of
//    Phase 8A added seeded per-spawn jitter (WAVE_SPAWN.JITTER_MS), and the
//    clumps de-cohere. Measured against WAVE_SPAWN.JITTER_MS:
//
//      JITTER_MS | acceptance | control ("3 bots neutralized ⇒ the maze falls")
//      ----------+------------+------------------------------------------------
//      0         | pass       | pass
//      10/25/50/100 | pass    | FAIL — the botless maze survives untouched
//      150       | FAIL       | —
//      75/300    | pass       | pass
//
//    So the bots were load-bearing only against perfectly quantized spawn
//    timing. Any argument of the form "the bots are load-bearing because the
//    control fails" is void until re-derived on the new instrument.
//
// JITTER_MS stays 150. Restoring green by picking 75 or 300 because they happen
// to pass is tuning-to-pass — the exact failure mode Phase 8 exists to end.
//
// These are skipped rather than deleted because the scenario is still the
// Phase 8C sweep target. It is re-derived, with a real build phase and a
// continuous score, through test/harness/matchRunner.js; the re-measured result
// is reported in docs/reviews/2026-07-25-phase8a-baseline.md. Re-enable only if
// that baseline justifies it — not to make the suite green.
// ---------------------------------------------------------------------------

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { hpToBand } from '../../server/game/costField.js'
import { STRUCTURE_TYPES, TILE_SIZE } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

function makeMatch() {
  const room = {
    players: [
      { id: 'h0', element: 'EARTH', displayName: 'human-earth', isBot: false },
      { id: 'b1', element: 'FIRE',  displayName: 'fire-bot',    isBot: true },
      { id: 'b2', element: 'WATER', displayName: 'water-bot',   isBot: true },
      { id: 'b3', element: 'WIND',  displayName: 'wind-bot',     isBot: true },
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, 20260720)
  startBuildPhase(state, 1)
  return state
}

let sid = 30_000
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

// A reasonable maze: full-width barricade wall with TWO gaps (two lanes). One
// human can plug one lane at the choke; the other lane's stream is the bots'
// job. A single-gap wall would funnel the whole horde onto the lone human and
// hide the bots' contribution — two lanes force the division of labor the
// control checks for.
function buildMaze(state) {
  const WALL_ROW = 8, GAP_A = 13, GAP_B = 27
  for (let gx = 1; gx < 39; gx++) {
    if (gx === GAP_A || gx === GAP_B) continue
    addStructure(state, STRUCTURE_TYPES.BARRICADE, gx, WALL_ROW)
  }
  state.costField.compute()
  return { WALL_ROW, GAP_A, GAP_B }
}

// Scripted "competent human" input for the single human: hold a post below the
// gap, aim at the nearest enemy, hammer every action (server gates decide).
function humanInputs(state, post) {
  const buf = new Map()
  const st = state.enemyStore
  for (const p of state.players) {
    if (p.isBot || !p.alive) continue
    let aimX = 0, aimY = -1, bd = Infinity
    for (let i = 0; i < st.count; i++) {
      const dx = st.x[i] - p.x, dy = st.y[i] - p.y
      const d2 = dx * dx + dy * dy
      if (d2 < bd) { bd = d2; aimX = dx; aimY = dy }
    }
    const keys = { w: false, a: false, s: false, d: false }
    const tx = post.x - p.x, ty = post.y - p.y
    if (Math.abs(tx) > 8) (tx > 0 ? keys.d = true : keys.a = true)
    if (Math.abs(ty) > 8) (ty > 0 ? keys.s = true : keys.w = true)
    buf.set(p.id, { keys, aimX, aimY, actions: { basic: true, special: true, second: true } })
  }
  return buf
}

const IDLE = { keys: { w: false, a: false, s: false, d: false }, aimX: 0, aimY: -1,
               actions: { basic: false, special: false, second: false } }

test.skip('ACCEPTANCE: 1 human + 3 AI bots survive waves 1-4 behind a reasonable maze', () => {
  const state = makeMatch()
  const { WALL_ROW, GAP_A } = buildMaze(state)
  const post = { x: (GAP_A + 0.5) * TILE_SIZE, y: (WALL_ROW + 3) * TILE_SIZE }

  let now = 0
  const dt = 50
  let timeout = true
  for (let t = 0; t < 160_000; t++) {
    now += dt
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    tickGame(state, humanInputs(state, post), now, dt)
    if (state.phase === PHASES.LOST || state.wave >= 5) { timeout = false; break }
  }

  assert.equal(timeout, false, 'the run resolved')
  assert.notEqual(state.phase, PHASES.LOST, 'the town survived waves 1-4')
  assert.ok(state.wave >= 5, 'reached the wave-5 build ⇒ waves 1-4 each cleared')
  assert.ok(state.hall.hp > 0)
})

test.skip('control: with the 3 bots neutralized (idle), the same maze falls', () => {
  const state = makeMatch()
  const { WALL_ROW, GAP_A } = buildMaze(state)
  const post = { x: (GAP_A + 0.5) * TILE_SIZE, y: (WALL_ROW + 3) * TILE_SIZE }

  let now = 0
  let resolved = false
  for (let t = 0; t < 160_000; t++) {
    now += 50
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    const buf = humanInputs(state, post)          // the human still fights
    for (const p of state.players) if (p.isBot) buf.set(p.id, IDLE)  // ...but the bots don't
    tickGame(state, buf, now, 50)
    if (state.phase === PHASES.LOST || state.wave >= 5) { resolved = true; break }
  }
  assert.ok(resolved)
  assert.equal(state.phase, PHASES.LOST, 'one human alone behind this maze cannot hold — the bots are load-bearing')
})
