// Task 17: the reusable combat animation controller.
//
// Animation playback is CLIENT-OWNED. Nothing here is transmitted: the server
// sends game state (life flags, hp, per-caster attack events with a `seq`, and
// the generic structure `phase/deadline/charge/cycleSeq` wire fields), and this
// module decides which animation key should be playing from that state alone.
// No frame numbers, no animation names, and no playback timing ever ride the
// wire — two clients watching the same match derive the same states from the
// same snapshots, and a client that joins late simply starts from whatever the
// current snapshot says.
//
// Deliberately Phaser-free so the whole state machine is testable headless
// (test/client/animationController.test.js). The only thing it knows about a
// sprite is that it has `.play(key)` and `.anims.currentAnim` — placeholder
// shapes (render/sprites.js fallback path) have neither, so syncSprite() is a
// no-op for them and the pre-art render path is completely unaffected.

import { BALANCE } from '../../../shared/balance.js'

// Character states, highest priority first. `downed`/`death` come from the
// authoritative PLAYER_FLAG bits, `hurt` from an hp drop between snapshots,
// `cast` from a server-confirmed basic-attack atk event, `special` from a
// server-confirmed Q/E ability atk event, and `run`/`idle` from the
// interpolated displacement — never from local input.
export const CHARACTER_STATE = {
  DEATH: 'death', DOWNED: 'downed', HURT: 'hurt', SPECIAL: 'special', CAST: 'cast', RUN: 'run', IDLE: 'idle',
}

// The task's declared priority order: death/downed > hurt > attack/cast > run/idle.
// SPECIAL sits above CAST (a Q/E ability reads as the bigger action than a
// basic swing) but below HURT (a hit reaction still wins either way).
export const CHARACTER_PRIORITY = {
  [CHARACTER_STATE.DEATH]: 6,
  [CHARACTER_STATE.DOWNED]: 5,
  [CHARACTER_STATE.HURT]: 4,
  [CHARACTER_STATE.SPECIAL]: 3,
  [CHARACTER_STATE.CAST]: 2,
  [CHARACTER_STATE.RUN]: 1,
  [CHARACTER_STATE.IDLE]: 0,
}

// Logical state -> the atlas animation that renders it. The art contract
// (spec: "Animation contract") authors idle/run/attack/cast/hurt/death, and
// says downed/revive feedback reads through `hurt` — status tint/alpha still
// carry the down-vs-reviving distinction, exactly as they do today.
//
// CAST is driven by basic attacks (see castDurationMs/onAttack below) and
// SPECIAL by Q/E abilities (see onSpecial) — the atlas's `attack_*` frames
// render the special-cast beat, its `cast_*` frames the basic. That mapping
// reads backwards against the frame names, but it is what onAttack's seq/
// duration gating has been contractually tested against since Task 17
// (test/client/animationController.test.js); SPECIAL was added later, once
// Q/E events existed on the wire, onto whichever frame group CAST hadn't
// already claimed.
const STATE_ANIM = {
  [CHARACTER_STATE.DEATH]: 'death',
  [CHARACTER_STATE.DOWNED]: 'hurt',
  [CHARACTER_STATE.HURT]: 'hurt',
  [CHARACTER_STATE.SPECIAL]: 'attack',
  [CHARACTER_STATE.CAST]: 'cast',
  [CHARACTER_STATE.RUN]: 'run',
  [CHARACTER_STATE.IDLE]: 'idle',
}

// Attack kind (server/net/encode.js ATTACK_KINDS) -> element, so a cast's
// visible length can be read off the class's REAL gameplay numbers instead of
// a hand-tuned table that silently drifts when balance changes.
export const ATTACK_KIND_ELEMENT = {
  EARTH_CONE: 'EARTH', WATER_REACH: 'WATER', FIRE_REACH: 'FIRE', WIND_WINDUP: 'WIND',
}

// How long past the authoritative moment a cast stays readable. Wind's event
// fires at wind-up START (the fan blade releases windUpMs later), so its cast
// must cover the wind-up plus the tail; the instant classes resolve on the
// event tick and only need the tail. Capped by the class cooldown so a fast
// class can never queue a cast that outlives its own next attack.
const CAST_TAIL_MS = 120

export function castDurationMs(kind) {
  const element = ATTACK_KIND_ELEMENT[kind]
  const cfg = element && BALANCE.PLAYER.BASIC[element]
  if (!cfg) return 0
  return Math.min(cfg.cooldownMs, (cfg.windUpMs ?? 0) + CAST_TAIL_MS)
}

// How long a special-cast animation reads before falling back to run/idle.
// Unlike castDurationMs, this has no server-side wind-up to derive from —
// every SPECIAL/SECOND ability in shared/balance.js's ABILITY table resolves
// on the same tick it's cast (server/game/abilities.js) — so this is a flat
// client-presentation value, the same reasoning as GameScene's
// STRUCTURE_ACTIVE_MS.
const SPECIAL_ANIM_MS = 300

// Structure presentation states. Derived entirely from Task 8's generic
// dynamic-structure wire fields — no new server field, no per-type table to
// keep in sync (see structureFamily below).
export const STRUCTURE_STATE = {
  IDLE: 'idle', TELEGRAPH: 'telegraph', ACTIVE: 'active',
  RECOVERY: 'recovery', CHARGED: 'charged',
}

// Which behavior family a structure belongs to, read off the SAME
// BALANCE.TOWER spec keys that server/game/towers.js dispatches on. Reading
// the live spec rather than listing structure types means a new fusion picks
// up the right presentation automatically the moment its spec lands.
//
//   targetImpact  phase 1 = a locked target being telegraphed toward
//   cycle/grind   phase 0 = charging (charge 0->1), phase 1 = the pulse + tail
//   entryTrigger  phase 1 = post-eruption cooldown, charge = progress to threshold
//   volley/other  no phase machine; only a cycleSeq bump marks activation
export function structureFamily(spec) {
  if (!spec) return 'static'
  if (spec.targetImpact) return 'targetImpact'
  if (spec.cycle || spec.grind) return 'cycle'
  if (spec.entryTrigger) return 'entryTrigger'
  if (spec.volley) return 'volley'
  return 'static'
}

// Plays `key` on a duck-typed sprite, but only when something actually
// changed — replaying the current key every frame would restart the animation
// on every snapshot (the art spec's "state transitions do not restart every
// snapshot"). `token` forces a legitimate restart of a same-key animation,
// e.g. a second cast inside one cast animation's lifetime.
function applyAnim(sprite, key, token, last) {
  if (!sprite || typeof sprite.play !== 'function' || !key) return null
  if (last.key === key && last.token === token && sprite.anims?.currentAnim?.key === key) return key
  sprite.play(key)
  last.key = key
  last.token = token
  return key
}

// Per-player animation state. One instance per rendered player; destroy() it
// with the sprite so nothing survives a leave/rejoin.
// Below this SPEED the character reads as standing still. It is deliberately a
// px-per-SECOND threshold, not a px-per-frame one: the caller hands us the
// displacement since the previous render frame, so a per-frame epsilon would
// silently scale with refresh rate. The slowest class moves at
// BALANCE.PLAYER.SPEED_PX[0] = 70 px/s, which is 1.17 px at 60 Hz but only
// 0.29 px at 240 Hz — a per-frame epsilon of 0.3 px left a running Earth hero
// stuck in `idle` on a 240 Hz display. 18 px/s keeps a ~4x margin under the
// slowest real movement at every frame rate while still ignoring the sub-pixel
// jitter of the interpolator.
const MOVE_EPSILON_PX_PER_SEC = 18
// Frame time assumed when a caller does not pass one (headless/one-shot use).
const DEFAULT_FRAME_MS = 1000 / 60

export class CharacterAnimator {
  constructor({ atlasKey = null, hurtMs = 220, moveEpsilonPxPerSec = MOVE_EPSILON_PX_PER_SEC } = {}) {
    this.atlasKey = atlasKey
    this.hurtMs = hurtMs
    this.moveEpsilonPxPerSec = moveEpsilonPxPerSec
    this.state = CHARACTER_STATE.IDLE
    this.dir = 'down'
    this.lastSeq = 0        // highest per-caster atk seq applied (staleness gate)
    this.lastSpecialSeq = 0 // same gate, independent channel, for onSpecial
    this.castUntil = 0
    this.specialUntil = 0
    this.hurtUntil = 0
    this.token = 0          // bumps on every accepted event, forces a restart
    this.destroyed = false
    this._last = { key: null, token: -1 }
  }

  // A server-confirmed attack event (snapshot `atk` tuple). Returns whether it
  // was accepted, so a caller can tell a real cast from a dropped duplicate.
  // Rejected when: the animator is gone, the caster is down/dead (the flags
  // outrank and cancel casts anyway), the seq is not newer than the last one
  // applied (duplicate or out-of-order delivery), or the event's whole
  // duration already elapsed in flight.
  //
  // That last gate is INERT in production and is kept only for callers that
  // supply their own `tMs`: GameScene._playAtk passes none, so `startedAt`
  // defaults to `nowMs` and the deadline is never already past. Do NOT "fix"
  // that by feeding it a server-derived timestamp — remote entities render
  // INTERP_DELAY_MS (100ms) behind against 120ms casts, so a truthful wall-clock
  // age would leave ~20ms of a remote cast and reject it entirely under jitter.
  // Making this gate live requires comparing against the render timeline.
  // Duplicates and reordering are already handled by the seq check below.
  onAttack(evt, nowMs) {
    if (this.destroyed || !evt) return false
    if (this.state === CHARACTER_STATE.DEATH || this.state === CHARACTER_STATE.DOWNED) return false
    const seq = evt.seq | 0
    if (seq <= this.lastSeq) return false
    const duration = evt.durationMs ?? castDurationMs(evt.kind)
    if (duration <= 0) return false
    // `tMs` is when the event was observed; default to now for the local
    // player's own immediate feedback. A cast that already ran out never
    // starts — it must not pop a stale animation on arrival.
    const startedAt = evt.tMs ?? nowMs
    const endsAt = startedAt + duration
    if (endsAt <= nowMs) return false
    this.lastSeq = seq
    this.castUntil = endsAt
    this.token++
    return true
  }

  // A server-confirmed Q/E ability event (kind: 'SPECIAL_CAST' on the atk
  // wire, server/net/encode.js). Mirrors onAttack's staleness/death gates on
  // an entirely independent seq/timer pair (lastSpecialSeq/specialUntil), so
  // a basic and a special can be in flight without either one's dedup logic
  // seeing the other's events. Duration has no server-side wind-up to derive
  // from (unlike castDurationMs) — every ability resolves same-tick — so it
  // defaults to the flat SPECIAL_ANIM_MS unless the caller supplies one.
  onSpecial(evt, nowMs) {
    if (this.destroyed || !evt) return false
    if (this.state === CHARACTER_STATE.DEATH || this.state === CHARACTER_STATE.DOWNED) return false
    const seq = evt.seq | 0
    if (seq <= this.lastSpecialSeq) return false
    const duration = evt.durationMs ?? SPECIAL_ANIM_MS
    if (duration <= 0) return false
    const startedAt = evt.tMs ?? nowMs
    const endsAt = startedAt + duration
    if (endsAt <= nowMs) return false
    this.lastSpecialSeq = seq
    this.specialUntil = endsAt
    this.token++
    return true
  }

  // Hit reaction, driven by the player's authoritative hp dropping between
  // snapshots (client-derived, no new wire field).
  onHurt(nowMs) {
    if (this.destroyed) return false
    if (this.state === CHARACTER_STATE.DEATH) return false
    this.hurtUntil = nowMs + this.hurtMs
    this.token++
    return true
  }

  // Resolves the current state from authoritative flags plus this frame's
  // interpolated displacement. dx/dy come from the render view, never from
  // local key state, so remote players animate identically on every client.
  update({ nowMs = 0, dead = false, downed = false, dx = 0, dy = 0, dtMs = DEFAULT_FRAME_MS } = {}) {
    if (this.destroyed) return this.state
    // Facing tracks movement even mid-cast: Wind's basic is a full-body
    // action that does NOT stop the character, and the accepted trade for
    // that (per the task) is limited foot sliding rather than a frozen hero.
    //
    // dx/dy are the displacement since the PREVIOUS render frame, so they are
    // converted to a speed before the threshold test — see
    // MOVE_EPSILON_PX_PER_SEC for why a per-frame epsilon was frame-rate
    // dependent. A non-positive dt (first frame, paused tab) reads as "no
    // measurable movement" rather than dividing by zero.
    const dt = dtMs > 0 ? dtMs : 0
    const speed = dt > 0 ? (Math.hypot(dx, dy) * 1000) / dt : 0
    const moving = speed > this.moveEpsilonPxPerSec
    if (moving) {
      this.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    }
    // death/downed CANCEL timed actions rather than merely outranking them —
    // a cast interrupted by a knockdown must not resume when the player is
    // revived several seconds later.
    if (dead || downed) {
      this.castUntil = 0
      this.specialUntil = 0
      this.hurtUntil = 0
      this.state = dead ? CHARACTER_STATE.DEATH : CHARACTER_STATE.DOWNED
      return this.state
    }
    if (nowMs < this.hurtUntil) this.state = CHARACTER_STATE.HURT
    else if (nowMs < this.specialUntil) this.state = CHARACTER_STATE.SPECIAL
    else if (nowMs < this.castUntil) this.state = CHARACTER_STATE.CAST
    else this.state = moving ? CHARACTER_STATE.RUN : CHARACTER_STATE.IDLE
    return this.state
  }

  // `${atlas}_${anim}_${dir}` — the key convention Preload.buildAnimsForAtlas
  // creates. null while no atlas is loaded (placeholder-shape render path).
  animKey() {
    if (!this.atlasKey || this.destroyed) return null
    return `${this.atlasKey}_${STATE_ANIM[this.state]}_${this.dir}`
  }

  // `hasAnim(key)` lets the caller pass scene.anims.exists — a state whose
  // animation the atlas never authored is skipped instead of throwing.
  syncSprite(sprite, hasAnim) {
    if (this.destroyed) return null
    const key = this.animKey()
    if (!key || (hasAnim && !hasAnim(key))) return null
    return applyAnim(sprite, key, this.token, this._last)
  }

  destroy() {
    this.destroyed = true
    this.castUntil = 0
    this.specialUntil = 0
    this.hurtUntil = 0
    this._last = { key: null, token: -1 }
  }
}

// Fraction of a structure's charge at which it reads as CHARGED ("about to
// fire") rather than still TELEGRAPHing. This must be a value the WIRE can
// actually carry, which rules out ~1.0:
//
//   entryTrigger (MAGMA_TRAP, chargeThreshold 3) sets charge = vtCharge/3 and
//   resets vtCharge to 0 in the same tick it reaches the threshold, so the
//   only charges ever emitted are 0, 0.33 and 0.67 — a >=0.999 gate made
//   CHARGED mathematically unreachable for the whole family.
//
//   cycle (WIND_SPECIAL suction 1400 ms, GRINDER intake 2000 ms) reaches
//   charge 1.0 only on the tick that also flips phase to 1, and phase 1 reads
//   as RECOVERY — so >=0.999 was reachable only if a 20 Hz emit happened to
//   land in the final 7-10 ms of the ramp, i.e. almost never.
//
// 0.65 is the last discrete step before an entryTrigger eruption (0.67) and
// the final third of a cycle's ramp, so CHARGED is a real, readable state in
// both families instead of a state the state machine can name but never enter.
const CHARGED_AT = 0.65

// Per-structure animation state, driven by the per-emit `ds` record.
export class StructureAnimator {
  constructor({ atlasKey = null, spec = null, dir = null, activeMs = 260, chargedAt = CHARGED_AT } = {}) {
    this.atlasKey = atlasKey
    this.family = structureFamily(spec)
    this.dir = dir
    this.activeMs = activeMs
    this.chargedAt = chargedAt
    this.state = STRUCTURE_STATE.IDLE
    this.lastCycle = null
    this.activeUntil = 0
    this.token = 0
    this.destroyed = false
    this._last = { key: null, token: -1 }
  }

  update(ds, nowMs = 0) {
    if (this.destroyed) return this.state
    const phase = ds?.phase | 0
    const charge = ds?.charge ?? 0
    const cycle = ds?.cycle | 0
    // A cycleSeq bump is the one universal "it just went off" signal every
    // behavior family already writes. Only a FORWARD move counts: a stale or
    // reordered packet carrying an older seq must not re-fire the pulse.
    if (this.lastCycle === null) this.lastCycle = cycle
    else if (cycle > this.lastCycle) {
      this.lastCycle = cycle
      this.activeUntil = nowMs + this.activeMs
      this.token++
    }
    if (nowMs < this.activeUntil) { this.state = STRUCTURE_STATE.ACTIVE; return this.state }
    this.state = this._restingState(phase, charge)
    return this.state
  }

  _restingState(phase, charge) {
    switch (this.family) {
      // Armed and tracking a locked impact point.
      case 'targetImpact':
        return phase === 1 ? STRUCTURE_STATE.TELEGRAPH : STRUCTURE_STATE.IDLE
      // Charging while phase 0; phase 1 outlives its own pulse, so whatever
      // is left after the ACTIVE window is the recovery tail.
      case 'cycle':
      case 'entryTrigger':
        if (phase === 1) return STRUCTURE_STATE.RECOVERY
        if (charge >= this.chargedAt) return STRUCTURE_STATE.CHARGED
        return charge > 0 ? STRUCTURE_STATE.TELEGRAPH : STRUCTURE_STATE.IDLE
      default:
        return STRUCTURE_STATE.IDLE
    }
  }

  // Structures may ship directional atlases (Water Geyser / Wind Vortex lock a
  // cardinal at placement); undirected ones use the plain `${atlas}_${state}`.
  animKey() {
    if (!this.atlasKey || this.destroyed) return null
    return this.dir ? `${this.atlasKey}_${this.state}_${this.dir}` : `${this.atlasKey}_${this.state}`
  }

  syncSprite(sprite, hasAnim) {
    if (this.destroyed) return null
    const key = this.animKey()
    if (!key || (hasAnim && !hasAnim(key))) return null
    return applyAnim(sprite, key, this.token, this._last)
  }

  destroy() {
    this.destroyed = true
    this.activeUntil = 0
    this._last = { key: null, token: -1 }
  }
}
