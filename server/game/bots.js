// AI teammate bots (Phase 6). Reuses the SHAPE of ez-ctf's player-bot FSM —
// a small priority-ordered set of states, re-evaluated each tick, that
// synthesizes the same `{ keys, aimX, aimY, actions }` input a human socket
// produces — but none of its contents (ez-ctf is CTF: flags/teams/ranged
// bots). Elementia bots are combat-only slot-fillers: they melee, cast their
// element special/second, tank via the same aggro rules as humans (they pull
// aggro by dealing damage, exactly like players — nothing bot-specific in the
// enemy sim), and can revive / be revived. They never build or touch economy
// (economy.js already guards every mutation on !isBot).
//
// The NEW work over the reused FSM is the melee approach/positioning layer:
// ez-ctf bots kite at a ranged bullet's preferred distance, whereas Elementia's
// basic is melee, so bots must close to CONTACT and (for squishies) kite off
// while their swing cools. Priority order (first match wins):
//   Retreat    — squishy + low HP: flee the nearest enemy (self-preservation).
//   ReviveMate — a downed teammate within REVIVE_SEEK: walk into channel range.
//   Engage     — an enemy within ENGAGE_RANGE: aim, swing, cast, close/kite,
//                but never advance past ENGAGE_LEASH_PX from the hold anchor.
//   Hold       — nothing to do: return to the defensive anchor and stand.
//
// Determinism: pure function of state (no rng, no wall-clock branching) so a
// seeded run replays identically. Per-bot scratch is `p.ai` (lazy-init; the
// takeover path in RoomManager resets it to undefined so a promoted slot starts
// clean as a human).

import { CONFIG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { TILE_SIZE } from './grid.js'

const B = BALANCE.BOT

export function emptyBotInput() {
  return {
    keys:   { w: false, a: false, s: false, d: false },
    aimX: 0, aimY: 0,
    actions: { basic: false, special: false, second: false },
  }
}

// Defensive hold anchor: the bot's hall-front spawn, pushed a few tiles toward
// the gates (−y) so the line sits in the open ground the enemy funnel crosses
// on its way to the hall. If that forward tile is solid (a wall right in front
// of the hall), fall back to the spawn so the bot never anchors inside geometry.
function ensureAnchor(state, p) {
  if (p.ai && p.ai.anchorX !== undefined) return
  let ax = p.spawnX
  let ay = p.spawnY - B.HOLD_FORWARD_TILES * TILE_SIZE
  const gx = Math.floor(ax / TILE_SIZE), gy = Math.floor(ay / TILE_SIZE)
  if (state.costField.solidAt(gx, gy)) { ax = p.spawnX; ay = p.spawnY }
  p.ai = { retreating: false, anchorX: ax, anchorY: ay }
}

// Nearest living enemy to the bot: { i, d, dx, dy, radius } (dx/dy point
// bot→enemy) or null if none within ENGAGE_RANGE_PX. Living enemies are dense
// 0..count-1.
function nearestEnemy(state, p) {
  const s = state.enemyStore
  let best = -1, bestD2 = Infinity, bdx = 0, bdy = 0
  const maxD2 = B.ENGAGE_RANGE_PX * B.ENGAGE_RANGE_PX
  for (let i = 0; i < s.count; i++) {
    const dx = s.x[i] - p.x, dy = s.y[i] - p.y
    const d2 = dx * dx + dy * dy
    if (d2 <= maxD2 && d2 < bestD2) { bestD2 = d2; best = i; bdx = dx; bdy = dy }
  }
  if (best === -1) return null
  return { i: best, d: Math.sqrt(bestD2), dx: bdx, dy: bdy, radius: s.radius[best] }
}

// The real center-distance at which pressing basic can land, given the
// target's radius — mirrors the server's own edge-distance reach check
// (basicAttacks.js: rangePx + attacker radius + target radius) so the AI
// never withholds a swing that would actually connect. `holdRangePx` above is
// a deliberately TIGHTER positioning target (Task 6's per-class bands); this
// is the separate, more generous threshold that gates whether pressing basic
// is even worth attempting. WIND has no static rangePx (its basic is a
// FAN_BLADE projectile whose real hit test depends on flight path/aim, not a
// simple player-to-enemy distance) — approximated with the blade's own
// maxRangePx + hitRadiusPx, which is a heuristic, not exact.
export function attackReachPx(element, enemyRadius) {
  const basic = BALANCE.PLAYER.BASIC[element]
  if (basic && basic.rangePx != null) return basic.rangePx + CONFIG.PLAYER_RADIUS + enemyRadius
  const fan = BALANCE.PROJECTILE.FAN_BLADE
  return fan.maxRangePx + fan.hitRadiusPx + enemyRadius
}

// Nearest downed teammate within REVIVE_SEEK_RANGE_PX: { p, dx, dy, d } or null.
function nearestDownedMate(state, p) {
  let best = null, bestD2 = B.REVIVE_SEEK_RANGE_PX * B.REVIVE_SEEK_RANGE_PX
  for (const q of state.players) {
    if (q === p || q.life !== 'down') continue
    const dx = q.x - p.x, dy = q.y - p.y
    const d2 = dx * dx + dy * dy
    if (d2 < bestD2) { bestD2 = d2; best = { p: q, dx, dy, d: Math.sqrt(d2) } }
  }
  return best
}

// Write WASD toward a desired direction vector, with a deadband so a bot that
// has effectively arrived stops instead of jittering across the axis.
function steer(input, ddx, ddy, dead = B.ARRIVE_PX) {
  if      (ddx >  dead) input.keys.d = true
  else if (ddx < -dead) input.keys.a = true
  if      (ddy >  dead) input.keys.s = true
  else if (ddy < -dead) input.keys.w = true
}

// Produce one bot's input for this tick. Caller guarantees p is a living bot.
export function computeBotInput(state, p, now) {
  ensureAnchor(state, p)
  const input = emptyBotInput()
  const enemy = nearestEnemy(state, p)

  // Retreat hysteresis (squishy classes only): drop below RETREAT_HP_FRACTION
  // to start fleeing, recover past RETREAT_UNTIL_HP_FRACTION to stop.
  const cls = B.CLASS[p.element]
  if (cls.retreats) {
    const frac = p.hp / p.maxHp
    if (p.ai.retreating) { if (frac >= B.RETREAT_UNTIL_HP_FRACTION) p.ai.retreating = false }
    else if (frac <= B.RETREAT_HP_FRACTION) p.ai.retreating = true
  } else {
    p.ai.retreating = false
  }

  // 1) Retreat — flee the nearest enemy while still facing/swinging at it.
  if (p.ai.retreating && enemy) {
    input.aimX = enemy.dx; input.aimY = enemy.dy
    input.actions.basic = true
    steer(input, -enemy.dx, -enemy.dy)
    return input
  }

  // 2) ReviveMate — walk into the downed teammate's channel range. The channel
  // itself is automatic (players.tickLifecycle accrues while any living mate is
  // within REVIVE_RANGE_PX), so the bot only has to arrive and stay.
  const mate = nearestDownedMate(state, p)
  if (mate) {
    const stop = BALANCE.PLAYER.REVIVE_RANGE_PX * 0.75
    if (mate.d > stop) steer(input, mate.dx, mate.dy)
    return input
  }

  // 3) Engage — aim, swing, cast, and manage attack distance. `band` is this
  // class's preferred basic-attack distance (Task 6) — basic only fires
  // inside it, so a bot 500px out no longer spends its cooldown on the air
  // while it closes in.
  if (enemy) {
    input.aimX = enemy.dx; input.aimY = enemy.dy
    const band = cls.holdRangePx
    input.actions.basic = enemy.d <= attackReachPx(p.element, enemy.radius)
    if (enemy.d <= B.SPECIAL_CAST_PX[p.element]) input.actions.special = true
    if (state.teamLevel >= 4 && enemy.d <= B.SECOND_CAST_PX[p.element]) input.actions.second = true

    const kiting = cls.kites && now < p.basicReadyAt && enemy.d < band
    if (kiting) {
      steer(input, -enemy.dx, -enemy.dy)          // back off between swings
    } else if (enemy.d > band) {
      const adx = p.x - p.ai.anchorX, ady = p.y - p.ai.anchorY
      const fromAnchor = Math.hypot(adx, ady)
      if (fromAnchor < B.ENGAGE_LEASH_PX) steer(input, enemy.dx, enemy.dy)  // close in, leashed
      // at the leash edge: hold the line and let the enemy come to us
    }
    return input
  }

  // 4) Hold — return to the anchor and stand.
  steer(input, p.ai.anchorX - p.x, p.ai.anchorY - p.y)
  return input
}

// Fill inputBuffer with a synthesized input for every living bot that doesn't
// already have one (a human/test override for that id wins — this is what lets
// tests drive a specific bot, and mirrors ez-ctf's runBotInputs). Called once
// per tick, before tickPlayers reads the buffer.
export function runBotInputs(state, inputBuffer, now, dtMs) {
  if (!inputBuffer || !inputBuffer.set) return
  for (const p of state.players) {
    if (!p.isBot || !p.alive) continue
    if (inputBuffer.has(p.id)) continue
    inputBuffer.set(p.id, computeBotInput(state, p, now))
  }
}
