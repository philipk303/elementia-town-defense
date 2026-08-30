// Phase machine — lobby → build → fight → waveEnd → (next build | won | lost).
//
// Pure state transitions over fields the game state carries; no wall-clock, no
// sockets. The loop feeds it deltaMs via tickPhaseClock and emits PHASE_CHANGE
// on any non-null stepPhase result. This is the contract Phase 3 builds on:
// the fight→waveEnd trigger reads spawnComplete + livingEnemyCount, which real
// spawners/enemy-deaths will drive (Phase 1 drives them from a stub, see
// tick.js advanceStubWave).

import { BALANCE } from '../../shared/balance.js'
import { restoreAllPlayers } from './players.js'
import { applyWaveEndIncome } from './economy.js'

export const PHASES = {
  LOBBY:    'lobby',
  BUILD:    'build',
  FIGHT:    'fight',
  WAVE_END: 'waveEnd',
  WON:      'won',
  LOST:     'lost',
}

// Enter the build phase for `wave`. Called on host start (wave 1) and after
// each waveEnd intermission (wave+1). Resets ready flags and the wave counters.
export function startBuildPhase(state, wave) {
  state.phase           = PHASES.BUILD
  state.wave            = wave
  state.wavePlan        = BALANCE.WAVES[wave - 1] ?? null
  state.spawnComplete   = false
  state.livingEnemyCount = 0
  state.fightClockMs    = 0
  for (const p of state.players) p.ready = false   // players is an array

  // Phase 4: build-phase start fully restores downed/dead players (spec §4)
  // and applies the synchronized leveling milestone for this wave (spec §2
  // ladder — waves 1/3/6/8). pendingLevelUp latches the LEVEL_UP broadcast
  // for the loop; starting at L1 is the baseline, not a level-up.
  restoreAllPlayers(state)
  const milestone = state.wavePlan?.level
  if (milestone && milestone > (state.teamLevel ?? 1)) {
    state.teamLevel = milestone
    if (milestone > 1) state.pendingLevelUp = milestone
  }

  // 'ready' style is untimed; the timer styles get the build clock.
  state.phaseClockMs = state.settings.timingStyle === 'ready'
    ? 0
    : BALANCE.PHASE.BUILD_TIMER_MS
}

// Decrement the active phase timer. Fight timing is stub/enemy-driven
// (fightClockMs / livingEnemyCount), not a phase-machine clock.
export function tickPhaseClock(state, deltaMs) {
  if (state.phase === PHASES.WAVE_END) {
    state.phaseClockMs = Math.max(0, state.phaseClockMs - deltaMs)
  } else if (state.phase === PHASES.BUILD && state.settings.timingStyle !== 'ready') {
    state.phaseClockMs = Math.max(0, state.phaseClockMs - deltaMs)
  }
}

function humansAllReady(state) {
  const humans = state.players.filter(p => !p.isBot)
  return humans.length > 0 && humans.every(p => p.ready)
}

export function isBuildComplete(state) {
  switch (state.settings.timingStyle) {
    case 'ready':        return humansAllReady(state)
    case 'timer-ready':  return state.phaseClockMs <= 0 || humansAllReady(state)
    case 'fixed':
    default:             return state.phaseClockMs <= 0
  }
}

export function isWaveCleared(state) {
  return state.spawnComplete && state.livingEnemyCount <= 0
}

function enterFight(state) {
  state.phase         = PHASES.FIGHT
  state.spawnComplete = false
  state.livingEnemyCount = 0
  state.fightClockMs  = BALANCE.PHASE.FIGHT_STUB_MS
}

function enterWaveEnd(state) {
  state.phase        = PHASES.WAVE_END
  state.phaseClockMs = BALANCE.PHASE.WAVE_END_MS
  applyWaveEndIncome(state)
}

// Evaluate transitions for the current phase; mutate state and return an event
// label ('fight' | 'waveEnd' | 'build' | 'won' | 'lost') or null if unchanged.
export function stepPhase(state) {
  // Lobby and terminal phases never transition here.
  if (state.phase === PHASES.LOBBY ||
      state.phase === PHASES.WON ||
      state.phase === PHASES.LOST) return null

  // Loss dominates: the hall falling ends the run from any active phase.
  if (state.hall.hp <= 0) {
    state.phase = PHASES.LOST
    return 'lost'
  }

  switch (state.phase) {
    case PHASES.BUILD:
      if (isBuildComplete(state)) { enterFight(state); return 'fight' }
      return null

    case PHASES.FIGHT:
      if (isWaveCleared(state)) { enterWaveEnd(state); return 'waveEnd' }
      return null

    case PHASES.WAVE_END:
      if (state.phaseClockMs <= 0) {
        if (state.wave >= BALANCE.WAVE_COUNT) { state.phase = PHASES.WON; return 'won' }
        startBuildPhase(state, state.wave + 1)
        return 'build'
      }
      return null
  }
  return null
}
