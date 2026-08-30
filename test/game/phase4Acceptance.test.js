// Phase 4 acceptance (plan §"Phase 4 — Acceptance"): 2 humans play waves 1–5
// end-to-end with real abilities. Headless variant: two scripted humans
// (EARTH + FIRE) hold the maze chokepoint, aim at the nearest enemy, and spam
// melee/special/second through the real input pipeline while two idle bot
// players stand in (Phase 6 gives bots behavior). A LIGHT tower set keeps the
// scripted players load-bearing rather than decorative. The run must clear
// waves 1–5 with the hall standing, hitting the L2 milestone on the way, with
// projectiles flying and player damage landing in-sim.
//
// (The live 2-browser verification is run against the dev server at the phase
// boundary; this test is the repeatable regression form of the criterion.)

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
      { id: 'h1', element: 'FIRE',  displayName: 'human-fire',  isBot: false },
      { id: 'b2', element: 'WATER', displayName: 'bot-water',   isBot: true },
      { id: 'b3', element: 'WIND',  displayName: 'bot-wind',    isBot: true },
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, 20260719)
  startBuildPhase(state, 1)
  return state
}

let sid = 20_000
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

// A light defense: the full-width wall with one gap, but only TWO watchtowers —
// far below the phase-3 "towers alone" bar, so the humans' damage matters.
function buildLightMaze(state) {
  const WALL_ROW = 8, GAP = 20
  for (let gx = 1; gx < 39; gx++) {
    if (gx === GAP) continue
    addStructure(state, STRUCTURE_TYPES.BARRICADE, gx, WALL_ROW)
  }
  addStructure(state, STRUCTURE_TYPES.WATCHTOWER, GAP - 2, WALL_ROW + 2)
  addStructure(state, STRUCTURE_TYPES.WATCHTOWER, GAP + 2, WALL_ROW + 2)
  state.costField.compute()
  return { WALL_ROW, GAP }
}

// Scripted "competent human" input: hold a post just below the gap, aim at the
// nearest enemy, hammer every action (server cooldowns/level gates decide).
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
    buf.set(p.id, {
      keys, aimX, aimY,
      actions: { basic: true, special: true, second: true },
    })
  }
  return buf
}

test('ACCEPTANCE: 2 scripted humans with real abilities clear waves 1-5 behind a light maze', () => {
  const state = makeMatch()
  const { WALL_ROW, GAP } = buildLightMaze(state)
  const post = { x: (GAP + 0.5) * TILE_SIZE, y: (WALL_ROW + 3) * TILE_SIZE }

  let sawProjectile = false
  let sawPlayerDamage = false
  let l2At = 0

  let now = 0
  const dt = 50
  let timeout = true
  for (let t = 0; t < 120_000; t++) {
    now += dt
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    tickGame(state, humanInputs(state, post), now, dt)
    if (state.projectiles.length > 0) sawProjectile = true
    if (state.fx.some(f => f.type === 'dmg')) sawPlayerDamage = true
    if (!l2At && state.teamLevel >= 2) l2At = state.wave
    if (state.phase === PHASES.LOST || state.wave >= 6) { timeout = false; break }
  }

  assert.equal(timeout, false, 'the run resolved')
  assert.notEqual(state.phase, PHASES.LOST, 'the town survived waves 1-5')
  assert.ok(state.wave >= 6, 'reached the wave-6 build ⇒ waves 1-5 each cleared')
  assert.ok(state.hall.hp > 0)
  assert.equal(l2At, 3, 'L2 milestone landed at wave 3')
  assert.ok(sawProjectile, 'Fireballs actually flew (real projectile subsystem in the loop)')
  assert.ok(sawPlayerDamage, 'player melee/ability damage landed in-sim')
})

// Control (the CP2-H3 lesson: the acceptance must not hide its subsystem):
// the SAME light maze with NOBODY fighting loses — so the pass above is the
// players' doing, not the towers'. Phase 6 note: the two bot slots are now
// AI-driven, so "idle" means idling the bots too — we pre-fill empty inputs
// for the bot ids each tick (runBotInputs leaves present entries untouched).
const IDLE = { keys: { w: false, a: false, s: false, d: false }, aimX: 0, aimY: -1,
               actions: { basic: false, special: false, second: false } }
test('control: the same light maze with idle players is lost', () => {
  const state = makeMatch()
  buildLightMaze(state)
  let now = 0
  let resolved = false
  for (let t = 0; t < 120_000; t++) {
    now += 50
    if (state.phase === PHASES.BUILD || state.phase === PHASES.WAVE_END) state.phaseClockMs = 0
    const buf = new Map()
    for (const p of state.players) if (p.isBot) buf.set(p.id, IDLE)  // neutralize the AI bots too
    tickGame(state, buf, now, 50)
    if (state.phase === PHASES.LOST || state.wave >= 6) { resolved = true; break }
  }
  assert.ok(resolved)
  assert.equal(state.phase, PHASES.LOST, 'with nobody fighting, the light maze falls')
})
