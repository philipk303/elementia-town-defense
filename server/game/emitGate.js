// Snapshot emit gate. The sim runs every tick at 60 Hz; broadcasts happen at
// 20 Hz (every SNAPSHOT_EVERY_N_TICKS). Wired to Spike A's packed encoder.
// Pure/near-pure so the divider and the packed payload are unit-testable
// without a loop or socket.

import { NETCODE } from '../../shared/constants.js'
import { encodeSnapshot } from '../net/encode.js'

// Emit on: every Nth tick, tick 1 (clients get initial state without waiting up
// to N ticks — state.tick is pre-incremented so the first loop runs at tick 1),
// and the match-end tick (the final snapshot must never be split from GAME_END).
export function shouldEmit(tick, ended) {
  if (ended) return true
  if (tick === 1) return true
  return tick % NETCODE.SNAPSHOT_EVERY_N_TICKS === 0
}

// Encode the room broadcast once (CP0 M1 decision): statics ride only when
// placedVersion changed since the last broadcast, tracked on the state itself.
// Advances state.lastBroadcastPv. Returns the JSON string ready for socket emit.
export function buildBroadcastSnapshot(state) {
  const payload = encodeSnapshot(state, state.lastBroadcastPv)
  state.lastBroadcastPv = state.placedVersion
  return payload
}

// One forced FULL snapshot for a joining/reconnecting client (statics always
// included). Does NOT touch lastBroadcastPv — it's a direct unicast, not the
// room broadcast.
export function buildFullSnapshot(state) {
  return encodeSnapshot(state, -1)
}
