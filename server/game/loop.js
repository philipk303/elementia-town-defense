// 60 Hz authoritative game loop. Sim ticks every TICK_MS; broadcasts are gated
// to 20 Hz by emitGate.
//
// CP1 H2/M1: driven by a drift-compensating setTimeout chain off a MONOTONIC
// clock (performance.now()), not setInterval off Date.now(). Rationale:
//   - setInterval(16) is coarse on some hosts (Windows dev measured ~35 Hz);
//     aiming each wake-up at the next 60 Hz boundary keeps the long-run tick
//     COUNT aligned to wall time, so the 20 Hz emit gate and tick-derived
//     physics margins hold their intended cadence on the Linux target.
//   - Date.now() is non-monotonic (NTP/VM slew): a backward step used to
//     INFLATE phase clocks and a forward jump skipped whole phases. deltaMs is
//     now monotonic and clamped to [0, MAX_DELTA_MS].
// The achieved tick rate is measured and logged once per run so Phase 3/4 tune
// against observed cadence, not the constant (the real-hardware validation is
// the CP0 M3 item, gated into Phase 8).

import { EVENTS, CONFIG } from '../../shared/constants.js'
import { shouldEmit, buildBroadcastSnapshot } from './emitGate.js'
import { tickGame } from './tick.js'
import { PHASES } from './phaseMachine.js'
import { drainFusionEvents } from './combos.js'

const now = () => performance.now()

// Clamp per-tick delta: a suspended laptop / instance migration delivers one
// enormous delta; without a ceiling it would collapse whole phases into a
// single tick. 250 ms tolerates a few dropped frames without warping time.
const MAX_DELTA_MS = 250

// If the loop falls further behind than this, resync the target instead of
// firing a catch-up burst (prevents a death spiral on a slow instance).
const RESYNC_LAG_MS = 500

// Log the achieved cadence once, after this many ticks of warmup.
const CADENCE_SAMPLE_TICKS = 180

function isTerminal(state) {
  return state.phase === PHASES.WON || state.phase === PHASES.LOST
}

// onEnd: optional callback fired once after GAME_END + stopLoop (index.js uses
// it to destroy the room).
export function startLoop(room, io, onEnd) {
  stopLoop(room)  // clear any prior timer/flag
  room.loopStopped = false

  // fx raised on non-emit ticks accumulate here and ride the next emitted
  // snapshot. Reset on every (re)start so pre-suspension fx aren't replayed.
  room.pendingFx = []
  room.pendingAtkFx = []   // same accumulation pattern, for atkFx (Task 7)

  let lastTickAt   = now()
  let nextTickAt   = lastTickAt + CONFIG.TICK_MS
  let ticksElapsed = 0
  const runStartAt = lastTickAt

  const step = () => {
    if (room.loopStopped) return
    const state = room.state
    if (!state) return
    if (isTerminal(state)) return  // safety: should already be stopped

    const t = now()
    let deltaMs = t - lastTickAt
    lastTickAt = t
    if (deltaMs < 0) deltaMs = 0
    else if (deltaMs > MAX_DELTA_MS) deltaMs = MAX_DELTA_MS

    state.tick++

    const event = tickGame(state, room.inputBuffer, t, deltaMs)
    room.inputBuffer.clear()

    if (event) {
      io.to(room.code).emit(EVENTS.PHASE_CHANGE, {
        phase: state.phase,
        wave:  state.wave,
        tally: state.lastWaveTally,
      })
    }

    // Synchronized leveling broadcast (Phase 4): drained once per milestone,
    // latched by startBuildPhase at waves 3/6/8.
    if (state.pendingLevelUp) {
      io.to(room.code).emit(EVENTS.LEVEL_UP, {
        level: state.pendingLevelUp,
        wave:  state.wave,
      })
      state.pendingLevelUp = null
    }

    // Fusion proposals that ended without a client asking (expiry, an
    // ingredient destroyed, a required player leaving) surface here — same
    // drain idiom as pendingLevelUp. Consent-driven endings queue an event
    // too, so every ending reaches the room through exactly one path.
    for (const ev of drainFusionEvents(state)) {
      io.to(room.code).emit(EVENTS.FUSION_RESOLVED, ev)
    }

    const ended = isTerminal(state)

    // Merge this tick's fx into the pending list, then emit on gated ticks.
    room.pendingFx.push(...state.fx)
    room.pendingAtkFx.push(...state.atkFx)
    if (shouldEmit(state.tick, ended)) {
      // Encode with the accumulated fx in place of the single-tick fx, then
      // restore (ez-ctf buildEmitSnapshot pattern, adapted for packed encode).
      const savedFx = state.fx
      const savedAtkFx = state.atkFx
      state.fx = room.pendingFx
      state.atkFx = room.pendingAtkFx
      const payload = buildBroadcastSnapshot(state)
      state.fx = savedFx
      state.atkFx = savedAtkFx

      io.to(room.code).emit(EVENTS.STATE_UPDATE, { snapshot: payload })
      room.pendingFx = []
      room.pendingAtkFx = []
    }

    // One-time cadence report (achieved Hz vs the 60 Hz target).
    if (++ticksElapsed === CADENCE_SAMPLE_TICKS) {
      const hz = (ticksElapsed / (now() - runStartAt)) * 1000
      room.measuredHz = hz
      console.log(`[${room.code}] loop cadence ~${hz.toFixed(1)} Hz over ${ticksElapsed} ticks`)
    }

    if (ended) {
      io.to(room.code).emit(EVENTS.GAME_END, buildEndPayload(state))
      stopLoop(room)
      if (onEnd) onEnd()
      return
    }

    // Drift-compensating schedule: aim at the next 60 Hz boundary; resync if we
    // have fallen too far behind rather than bursting to catch up.
    nextTickAt += CONFIG.TICK_MS
    const ahead = nextTickAt - now()
    if (ahead < -RESYNC_LAG_MS) nextTickAt = now()
    room.loopInterval = setTimeout(step, Math.max(0, nextTickAt - now()))
  }

  room.loopInterval = setTimeout(step, 0)
  return room.loopInterval
}

export function stopLoop(room) {
  room.loopStopped = true
  if (room.loopInterval) {
    clearTimeout(room.loopInterval)
    room.loopInterval = null
  }
}

function buildEndPayload(state) {
  return {
    outcome: state.phase === PHASES.WON ? 'won' : 'lost',
    wave:    state.wave,
    hallHp:  Math.max(0, Math.ceil(state.hall.hp)),  // never report negative HP (CP1 L1)
  }
}
