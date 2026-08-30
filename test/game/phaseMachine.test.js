import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHASES, startBuildPhase, tickPhaseClock, stepPhase,
  isBuildComplete, isWaveCleared,
} from '../../server/game/phaseMachine.js'
import { BALANCE } from '../../shared/balance.js'

// Minimal state factory for phase-machine unit tests — only the fields the
// machine reads. `players` is an ARRAY, matching createGameState (server/game/
// state.js). Getting this shape wrong would let tests pass on a shape the
// machine never sees in production.
function makeState({ timingStyle = 'fixed', friendlyFire = false, humans = 1, bots = 3 } = {}) {
  const players = []
  let i = 0
  for (let h = 0; h < humans; h++) players.push({ id: `p${i++}`, isBot: false, ready: false })
  for (let b = 0; b < bots;  b++) players.push({ id: `b${i++}`, isBot: true,  ready: true })
  return {
    phase: PHASES.LOBBY,
    wave: 0,
    phaseClockMs: 0,
    fightClockMs: 0,
    spawnComplete: false,
    livingEnemyCount: 0,
    settings: { timingStyle, friendlyFire },
    hall: { hp: BALANCE.HALL_HP, maxHp: BALANCE.HALL_HP },
    players,
    lastWaveTally: null,
  }
}

// Drive the enemy-less Phase-1 stub fight to completion (mirrors tick.js's
// advanceStubWave without importing the whole tick).
function runStubFight(s) {
  s.fightClockMs = Math.max(0, s.fightClockMs - BALANCE.PHASE.FIGHT_STUB_MS)
  if (s.fightClockMs <= 0) s.spawnComplete = true
}

test('startBuildPhase enters build at the given wave with the fixed-timer clock', () => {
  const s = makeState({ timingStyle: 'fixed' })
  startBuildPhase(s, 1)
  assert.equal(s.phase, PHASES.BUILD)
  assert.equal(s.wave, 1)
  assert.equal(s.phaseClockMs, BALANCE.PHASE.BUILD_TIMER_MS)
  assert.equal(s.wavePlan.wave, 1)
})

test('fixed style: build completes only when the timer expires', () => {
  const s = makeState({ timingStyle: 'fixed' })
  startBuildPhase(s, 1)
  assert.equal(isBuildComplete(s), false)
  // All humans ready must NOT short-circuit a fixed timer.
  for (const id in s.players) s.players[id].ready = true
  assert.equal(isBuildComplete(s), false)
  tickPhaseClock(s, BALANCE.PHASE.BUILD_TIMER_MS)
  assert.equal(isBuildComplete(s), true)
  assert.equal(stepPhase(s), 'fight')
  assert.equal(s.phase, PHASES.FIGHT)
})

test('ready style: untimed, completes when all humans ready (bots never block)', () => {
  const s = makeState({ timingStyle: 'ready', humans: 2, bots: 2 })
  startBuildPhase(s, 1)
  assert.equal(s.phaseClockMs, 0)          // untimed
  assert.equal(isBuildComplete(s), false)  // no human readied yet
  const humanIds = Object.keys(s.players).filter(id => !s.players[id].isBot)
  s.players[humanIds[0]].ready = true
  assert.equal(isBuildComplete(s), false)  // one human still not ready
  s.players[humanIds[1]].ready = true
  assert.equal(isBuildComplete(s), true)   // all humans ready → done
})

test('timer-ready style: completes early on all-ready OR on timer expiry', () => {
  // Early path
  const early = makeState({ timingStyle: 'timer-ready', humans: 1 })
  startBuildPhase(early, 1)
  assert.equal(isBuildComplete(early), false)
  for (const id in early.players) early.players[id].ready = true
  assert.equal(isBuildComplete(early), true)

  // Timer path (nobody readied)
  const timed = makeState({ timingStyle: 'timer-ready', humans: 1 })
  startBuildPhase(timed, 1)
  tickPhaseClock(timed, BALANCE.PHASE.BUILD_TIMER_MS)
  assert.equal(isBuildComplete(timed), true)
})

test('fight → waveEnd only once the wave is cleared', () => {
  const s = makeState()
  startBuildPhase(s, 1)
  tickPhaseClock(s, BALANCE.PHASE.BUILD_TIMER_MS)
  stepPhase(s)                       // → fight
  assert.equal(s.phase, PHASES.FIGHT)
  assert.equal(isWaveCleared(s), false)
  assert.equal(stepPhase(s), null)   // fight ongoing
  runStubFight(s)                    // stub marks spawnComplete, 0 enemies
  assert.equal(isWaveCleared(s), true)
  assert.equal(stepPhase(s), 'waveEnd')
  assert.equal(s.phase, PHASES.WAVE_END)
  assert.equal(s.phaseClockMs, BALANCE.PHASE.WAVE_END_MS)
  // No structures/waveBounty on this minimal state -> 0 citizens, 0 bounty.
  assert.equal(s.lastWaveTally.wave, 1)
  assert.equal(s.lastWaveTally.pooled, BALANCE.ECONOMY.HALL_BASE_INCOME)
})

test('a living enemy keeps the wave uncleared even after spawnComplete', () => {
  const s = makeState()
  s.phase = PHASES.FIGHT
  s.spawnComplete = true
  s.livingEnemyCount = 1
  assert.equal(isWaveCleared(s), false)
  s.livingEnemyCount = 0
  assert.equal(isWaveCleared(s), true)
})

test('waveEnd advances to the next build after the intermission, resetting ready', () => {
  const s = makeState({ humans: 2 })
  startBuildPhase(s, 1)
  for (const id in s.players) s.players[id].ready = true
  // Jump to waveEnd of wave 1.
  s.phase = PHASES.WAVE_END
  s.wave = 1
  s.phaseClockMs = BALANCE.PHASE.WAVE_END_MS
  assert.equal(stepPhase(s), null)  // intermission running
  tickPhaseClock(s, BALANCE.PHASE.WAVE_END_MS)
  assert.equal(stepPhase(s), 'build')
  assert.equal(s.phase, PHASES.BUILD)
  assert.equal(s.wave, 2)
  for (const id in s.players) assert.equal(s.players[id].ready, false)
})

test('waveEnd of the final wave wins the run', () => {
  const s = makeState()
  s.phase = PHASES.WAVE_END
  s.wave = BALANCE.WAVE_COUNT
  s.phaseClockMs = 0
  assert.equal(stepPhase(s), 'won')
  assert.equal(s.phase, PHASES.WON)
})

test('hall falling during fight loses the run immediately', () => {
  const s = makeState()
  s.phase = PHASES.FIGHT
  s.hall.hp = 0
  assert.equal(stepPhase(s), 'lost')
  assert.equal(s.phase, PHASES.LOST)
})

test('stepPhase is a no-op in lobby and terminal phases', () => {
  for (const phase of [PHASES.LOBBY, PHASES.WON, PHASES.LOST]) {
    const s = makeState()
    s.phase = phase
    s.hall.hp = 0  // even with a dead hall, terminal/lobby do not transition
    assert.equal(stepPhase(s), null)
    assert.equal(s.phase, phase)
  }
})
