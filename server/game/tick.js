// Authoritative simulation tick. Phase 3 replaces the Phase-1 enemy-less stub
// with the real fight sim: spawners stream a wave in from the beat sheet, the
// horde marches the cost field and bulldozes/attacks, towers fire, and the
// wave-clear signals (spawnComplete / livingEnemyCount) feed the unchanged
// phase-machine contract. Build/waveEnd/lobby ticks stay thin.

import { tickPhaseClock, stepPhase, PHASES } from './phaseMachine.js'
import { buildSpawnSchedule } from './waves.js'
import { spawnDueEnemies, tickEnemies } from './enemies.js'
import { tickTowers } from './towers.js'
import { tickPlayers } from './players.js'
import { tickProjectiles, flushPendingProjectiles } from './projectiles.js'
import { runBotInputs } from './bots.js'
import { tickFusionProposals } from './combos.js'
import { tickRepairChannels } from './repair.js'

// Entering the fight for state.wave: build the spawn schedule for the open
// gates and reset the streaming counters. The horde store is already empty (the
// prior wave cleared to 0 before waveEnd), reset defensively.
function initFight(state) {
  state.spawnSchedule = buildSpawnSchedule(state.wave, state.gateOrder, state.rng)
  state.spawnIndex = 0
  state.fightElapsedMs = 0
  state.waveBounty = 0
  state.enemyStore.count = 0
  // No stale shots carry across fights. tickProjectiles only runs during
  // FIGHT (see runFightSim below), so a projectile cast right as a wave
  // clears is frozen mid-flight through BUILD/WAVE_END and would otherwise
  // be silently dropped here without ever resolving its attempt as a hit or
  // a miss — flush it first (a no-op outside the harness: combatStats is
  // opt-in and every record* call below is already a no-op without it).
  flushPendingProjectiles(state)   // also empties state.projectiles
}

// One fight-phase step: advance the spawn clock, stream due enemies, sim the
// horde and towers, then update the wave-clear signals the phase machine reads.
//
// Task 2 — frozen simulation order, tested (test/game/tickIntegration.test.js):
// players, then enemies, then projectiles, then structures, then the phase
// transition. Every future runtime task must preserve this order rather than
// reordering ad hoc.
function runFightSim(state, now, deltaMs) {
  state.fightElapsedMs += deltaMs
  spawnDueEnemies(state, now)
  tickEnemies(state, now, deltaMs)
  if (state.tickOrderLog) state.tickOrderLog.push('enemies')
  tickProjectiles(state, now, deltaMs)
  if (state.tickOrderLog) state.tickOrderLog.push('projectiles')
  tickTowers(state, now, deltaMs)
  if (state.tickOrderLog) state.tickOrderLog.push('structures')
  state.livingEnemyCount = state.enemyStore.count
  if (state.spawnIndex >= state.spawnSchedule.length) state.spawnComplete = true
}

// Returns the phase-machine event ('fight' | 'waveEnd' | 'build' | 'won' |
// 'lost') or null. The loop emits PHASE_CHANGE on a non-null result.
export function tickGame(state, inputBuffer, now, deltaMs) {
  state.fx = []      // transient per-tick visual/audio cues; reset each tick
  state.atkFx = []   // transient per-tick attack presentation events; reset each tick

  tickPhaseClock(state, deltaMs)
  // Pending fusion proposals age out on the sim clock, in every phase — a
  // proposal opened at the end of a build phase must not survive the wave it
  // was never answered in.
  tickFusionProposals(state, deltaMs)
  // Players act in every non-terminal active phase (walk during build/waveEnd;
  // full combat during fight). Runs BEFORE the enemy sim so chases read fresh
  // positions and ability casts land this tick.
  if (state.phase === PHASES.BUILD || state.phase === PHASES.FIGHT ||
      state.phase === PHASES.WAVE_END) {
    // Bots synthesize inputs into the same buffer just before players read it;
    // ids already present (human sockets / test overrides) are left untouched.
    runBotInputs(state, inputBuffer, now, deltaMs)
    tickPlayers(state, inputBuffer, now, deltaMs)
    // AFTER tickPlayers so the range check reads this tick's post-move
    // positions — a player who walks out of range this frame must not bank
    // another tick of progress on the position they already left.
    tickRepairChannels(state, inputBuffer, deltaMs)
    if (state.tickOrderLog) state.tickOrderLog.push('players')
  }
  if (state.phase === PHASES.FIGHT) runFightSim(state, now, deltaMs)

  const event = stepPhase(state)
  if (event && state.tickOrderLog) state.tickOrderLog.push('phase')
  if (event === 'fight') initFight(state)   // just crossed build → fight
  return event
}
