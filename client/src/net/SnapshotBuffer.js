// Client interpolation buffer — ported from ez-ctf's SnapshotBuffer (spec §5:
// client = interpolation ONLY, never prediction/extrapolation) and adapted to
// Elementia's packed-snapshot shape (arrays of players/enemies/projectiles
// keyed by id, not keyed objects).
//
// Pure JS: no Phaser, no DOM, no clock reads — callers inject nowMs
// (performance.now() in GameScene; literals in tests). Snapshots sit on a
// server-tick timeline (tick * TICK_MS); a smoothed arrival offset (EMA) maps
// wall clock → server time. Two render times per frame: remote entities at
// INTERP_DELAY_MS in the past, the local player at LOCAL_INTERP_DELAY_MS.
// Past the newest snapshot everything clamps to newest (a stall freezes the
// world rather than inventing motion).

import { NETCODE, CONFIG, PLAYER_FLAG } from '../../../shared/constants.js'

const EMA_KEEP = 0.9   // offsetEma = old*0.9 + sample*0.1

const serverTime = snap => snap.tick * CONFIG.TICK_MS
const lerp = (a, b, t) => a + (b - a) * t

export class SnapshotBuffer {
  constructor() { this.reset() }

  // Clears snapshots, the offset EMA, AND the newest-tick watermark (a new
  // match restarts tick near 0; a stale watermark would freeze the world).
  reset() {
    this._snaps = []
    this._offsetEma = null
    this._watermark = -Infinity
  }

  get size() { return this._snaps.length }

  push(snapshot, nowMs) {
    if (snapshot.tick <= this._watermark) return   // out-of-order / duplicate
    this._watermark = snapshot.tick
    this._snaps.push(snapshot)
    if (this._snaps.length > NETCODE.BUFFER_MAX_SNAPSHOTS) this._snaps.shift()
    const offset = nowMs - serverTime(snapshot)
    this._offsetEma = this._offsetEma === null
      ? offset
      : this._offsetEma * EMA_KEEP + offset * (1 - EMA_KEEP)
  }

  getLatest() { return this._snaps[this._snaps.length - 1] ?? null }

  // Snapshot-shaped composite for RENDERING only (HUD/gameplay reads the raw
  // latest snapshot). Entries are shallow copies — sources never mutated.
  getRenderView(nowMs, localPlayerId) {
    const latest = this.getLatest()
    if (!latest) return null

    const remote = this._bracket(nowMs - this._offsetEma - NETCODE.INTERP_DELAY_MS)
    const local  = this._bracket(nowMs - this._offsetEma - NETCODE.LOCAL_INTERP_DELAY_MS)

    const players = latest.players.map(lp => {
      const bracket = lp.id === localPlayerId ? local : remote
      return interpById(bracket, 'players', lp.id, playerSnapRule) ?? { ...lp }
    })

    return {
      ...latest,
      players,
      enemies: interpList(remote, 'enemies'),
      projectiles: interpList(remote, 'projectiles'),
    }
  }

  // Bracket for one render time: consecutive snapshots from/to with
  // serverTime(from) <= rt <= serverTime(to), t clamped to [0,1]. Degenerate
  // cases clamp to oldest/newest (never extrapolates).
  _bracket(rt) {
    const snaps = this._snaps
    const newest = snaps[snaps.length - 1]
    if (snaps.length < 2 || rt >= serverTime(newest)) return { from: newest, to: newest, t: 1 }
    if (rt <= serverTime(snaps[0]))                   return { from: snaps[0], to: snaps[0], t: 0 }
    for (let i = snaps.length - 2; i >= 0; i--) {
      if (serverTime(snaps[i]) <= rt) {
        const from = snaps[i], to = snaps[i + 1]
        const span = serverTime(to) - serverTime(from)
        const t = span > 0 ? Math.min(1, Math.max(0, (rt - serverTime(from)) / span)) : 1
        return { from, to, t }
      }
    }
    return { from: newest, to: newest, t: 1 }  // unreachable; defensive
  }
}

// Snap (skip the lerp) across a respawn edge — DEAD in `from`, alive in `to`
// — or a teleport-sized jump. Discrete fields (hp/flags) come from `to`.
function playerSnapRule(fp, tp) {
  const respawned = (fp.flags & PLAYER_FLAG.DEAD) && !(tp.flags & PLAYER_FLAG.DEAD)
  const teleported = Math.hypot(tp.x - fp.x, tp.y - fp.y) > NETCODE.SNAP_TELEPORT_PX
  return respawned || teleported
}

// One entity from a bracket by id: base = `to` entry (discrete fields read
// from the later snapshot), positions lerped from→to when both exist.
function interpById(bracket, key, id, snapRule) {
  const tp = bracket.to[key].find(e => e.id === id)
  if (!tp) {
    const fp = bracket.from[key].find(e => e.id === id)
    return fp ? { ...fp } : null           // despawned by `to`: render at from
  }
  const fp = bracket.from === bracket.to ? tp : bracket.from[key].find(e => e.id === id)
  if (!fp || fp === tp) return { ...tp }   // newly present / degenerate clamp
  if (snapRule && snapRule(fp, tp)) return { ...tp }
  return { ...tp, x: lerp(fp.x, tp.x, bracket.t), y: lerp(fp.y, tp.y, bracket.t) }
}

// A whole list (enemies/projectiles): iterate `to` — an entity gone by `to`
// disappears ≤50ms early rather than sliding while dead (ez-ctf rule).
function interpList(bracket, key) {
  const from = bracket.from[key], to = bracket.to[key]
  if (bracket.from === bracket.to) return to.map(e => ({ ...e }))
  const fromById = new Map(from.map(e => [e.id, e]))
  return to.map(tp => {
    const fp = fromById.get(tp.id)
    if (!fp) return { ...tp }
    return { ...tp, x: lerp(fp.x, tp.x, bracket.t), y: lerp(fp.y, tp.y, bracket.t) }
  })
}
