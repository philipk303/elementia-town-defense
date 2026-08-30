import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ELEMENTS } from '../../shared/constants.js'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'

const DT = 1000 / 60

function makeState() {
  return createGameState({
    players: ELEMENTS.map((el, i) => ({ id: `p${i}`, element: el, displayName: el, isBot: i > 0 })),
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }, 42)
}

function input(over = {}) {
  return {
    keys: { w: false, a: false, s: false, d: false, ...(over.keys || {}) },
    aimX: over.aimX ?? 1, aimY: over.aimY ?? 0,
    actions: { basic: false, special: false, second: false, ...(over.actions || {}) },
  }
}

test('tickGame moves an input-driven player during the build phase', () => {
  const s = makeState()
  startBuildPhase(s, 1)
  const p = s.players[0]
  const x0 = p.x
  const buf = new Map([[p.id, input({ keys: { d: true } })]])
  tickGame(s, buf, 1000, DT)
  assert.ok(p.x > x0, 'player moved while building')
})

test('tickGame during fight: a fire special press flies a projectile next tick', () => {
  const s = makeState()
  startBuildPhase(s, 1)
  s.phase = PHASES.FIGHT
  // A far-future spawn keeps the fight open (an empty schedule wave-clears
  // instantly) without ever actually spawning an enemy.
  s.spawnSchedule = [{ atMs: 1e9, gate: 'CENTER', type: 0, elite: false }]
  s.spawnIndex = 0
  const fire = s.players[1]
  const buf = new Map([[fire.id, input({ actions: { special: true } })]])
  tickGame(s, buf, 1000, DT)
  assert.equal(s.projectiles.length, 1)
  const x1 = s.projectiles[0].x
  tickGame(s, new Map(), 1000 + DT, DT)
  assert.ok(s.projectiles.length === 0 || s.projectiles[0].x > x1, 'projectile advanced')
})

test('projectiles are cleared when a new fight starts', () => {
  const s = makeState()
  startBuildPhase(s, 1)
  s.phase = PHASES.FIGHT
  s.projectiles.push({ id: 99, type: 'FIREBALL', x: 1, y: 1, vx: 0, vy: 0, traveled: 0, maxRangePx: 10, hitRadiusPx: 1, aoeRadiusPx: 1, damage: 0, burn: null })
  s.phase = PHASES.BUILD
  s.phaseClockMs = 0                        // build timer expires → fight
  const ev = tickGame(s, new Map(), 1000, DT)
  assert.equal(ev, 'fight')
  assert.equal(s.projectiles.length, 0)
})

// Task 2 — freeze the simulation order as a tested contract. Opt-in
// instrumentation (same pattern as towers.js's state.aoeStats): tickGame
// pushes a stage label into state.tickOrderLog when the array is present,
// and is a no-op otherwise, so this never touches the live game.
test('a fight tick resolves players, then enemies, then projectiles, then structures, then the phase transition', () => {
  const s = makeState()
  startBuildPhase(s, 1)
  s.phase = PHASES.FIGHT
  s.spawnSchedule = [{ atMs: 1e9, gate: 'CENTER', type: 0, elite: false }] // never actually spawns
  s.spawnIndex = 0
  s.tickOrderLog = []
  tickGame(s, new Map(), 1000, DT)
  assert.deepEqual(s.tickOrderLog, ['players', 'enemies', 'projectiles', 'structures'])
})

test('the phase transition is resolved after the fight sim, not before', () => {
  const s = makeState()
  startBuildPhase(s, 1)
  s.phase = PHASES.BUILD
  s.phaseClockMs = 0   // build timer expires this tick → fight
  s.tickOrderLog = []
  const ev = tickGame(s, new Map(), 1000, DT)
  assert.equal(ev, 'fight')
  // The tick that CROSSES into fight runs no fight-sim stages (it was still
  // BUILD when runFightSim's phase check ran) — only the player stage, then
  // the phase transition, land in the log.
  assert.deepEqual(s.tickOrderLog, ['players', 'phase'])
})
