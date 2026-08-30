// Phase 6 — AI teammate bots. Unit coverage for the melee-positioning FSM
// (server/game/bots.js): the priority order (retreat > reviveMate > engage >
// hold), the melee approach/kite layer, special/second cast gating, and the
// runBotInputs synthesis contract. A full-loop integration test proves a bot
// walks to a downed teammate and revives them through the real tick path.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { computeBotInput, runBotInputs, attackReachPx } from '../../server/game/bots.js'
import { BALANCE } from '../../shared/balance.js'

function makeMatch() {
  const room = {
    players: [
      { id: 'h0', element: 'EARTH', displayName: 'human-earth', isBot: false },
      { id: 'b1', element: 'FIRE',  displayName: 'fire-bot',    isBot: true },
      { id: 'b2', element: 'WATER', displayName: 'water-bot',   isBot: true },
      { id: 'b3', element: 'WIND',  displayName: 'wind-bot',     isBot: true },
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
  const state = createGameState(room, 20260720)
  startBuildPhase(state, 1)
  return state
}

function bot(state, element) {
  return state.players.find(p => p.element === element)
}

// Drop a living enemy into the SoA store at a fixed spot (dense 0..count-1).
function addEnemy(state, x, y, r = 12) {
  const s = state.enemyStore
  const i = s.count++
  s.x[i] = x; s.y[i] = y; s.radius[i] = r
  s.hp[i] = 50; s.maxHp[i] = 50
  s.id[i] = 9000 + i
  return i
}

// Pin a bot at a known position with a known anchor so movement assertions are
// independent of the hall-derived anchor.
function place(p, x, y, anchorX, anchorY) {
  p.x = x; p.y = y
  p.ai = { retreating: false, anchorX, anchorY }
}

test('engage: a healthy bot with an enemy to the east aims at it and moves toward it, but only swings once in its attack band', () => {
  const state = makeMatch()
  const p = bot(state, 'WATER')          // Water does not retreat/kite, band = 30px
  place(p, 500, 500, 500, 500)           // sitting on its anchor
  addEnemy(state, 700, 500)              // 200px east, within engage range but outside the 30px band
  const far = computeBotInput(state, p, 1000)

  assert.equal(far.keys.d, true, 'moves east toward the enemy')
  assert.equal(far.keys.a, false)
  assert.ok(far.aimX > 0 && Math.abs(far.aimY) < 1e-6, 'aims east')
  assert.equal(far.actions.basic, false, 'does not swing at an enemy still outside its attack band')

  state.enemyStore.count = 0
  addEnemy(state, 520, 500)              // 20px east, inside Water's 30px band
  const close = computeBotInput(state, p, 1000)
  assert.equal(close.actions.basic, true, 'swings once the enemy is inside its attack band')
})

test('engage: per-class attack bands — Fire holds near 65px, Wind holds/kites near 100px', () => {
  const state = makeMatch()

  const fire = bot(state, 'FIRE')
  place(fire, 500, 500, 500, 500)
  addEnemy(state, 500 + BALANCE.BOT.CLASS.FIRE.holdRangePx - 10, 500)   // just inside Fire's band
  assert.equal(computeBotInput(state, fire, 1000).actions.basic, true, 'Fire fires within its own band')
  assert.equal(computeBotInput(state, fire, 1000).keys.d, false, 'Fire does not keep closing once in band')

  state.enemyStore.count = 0
  addEnemy(state, 500 + BALANCE.BOT.CLASS.FIRE.holdRangePx + 200, 500)  // well outside Fire's band AND its true reach
  const fireFar = computeBotInput(state, fire, 1000)
  assert.equal(fireFar.actions.basic, false, 'Fire does not fire outside its own band')
  assert.equal(fireFar.keys.d, true, 'Fire closes the gap toward its band')

  state.enemyStore.count = 0
  const wind = bot(state, 'WIND')
  place(wind, 500, 500, 500, 500)
  addEnemy(state, 500 + BALANCE.BOT.CLASS.WIND.holdRangePx - 10, 500)   // just inside Wind's band
  assert.equal(computeBotInput(state, wind, 1000).actions.basic, true, 'Wind fires within its own 100px band')
})

test('attackReachPx: real swing reach extends past the positioning band, so a bot never withholds a connecting hit', () => {
  // The positioning band (holdRangePx) is deliberately tighter than the
  // server's own edge-distance reach check — this test pins that gap so a
  // future change can't silently collapse the two and reintroduce the DPS
  // loss Task 6 found (gating fire on the band itself missed real hits at
  // the band-to-reach margin).
  const enemyRadius = 12
  assert.ok(attackReachPx('WATER', enemyRadius) > BALANCE.BOT.CLASS.WATER.holdRangePx,
    'Water\'s true reach exceeds its 30px hold band')
  assert.ok(attackReachPx('FIRE', enemyRadius) > BALANCE.BOT.CLASS.FIRE.holdRangePx,
    'Fire\'s true reach exceeds its 65px hold band')
  assert.ok(attackReachPx('WIND', enemyRadius) > BALANCE.BOT.CLASS.WIND.holdRangePx,
    'Wind\'s approximated reach exceeds its 100px hold band')
})

test('engage: kiting steps off at the class\'s own band, not a universal distance', () => {
  const state = makeMatch()
  const fire = bot(state, 'FIRE')        // Fire kites
  place(fire, 500, 500, 500, 500)
  fire.basicReadyAt = 5000               // swing still on cooldown at t=1000
  addEnemy(state, 500 + BALANCE.BOT.CLASS.FIRE.holdRangePx - 10, 500)  // inside Fire's 65px band

  const input = computeBotInput(state, fire, 1000)
  assert.equal(input.keys.a, true, 'steps off (west) while its own band is violated and its swing is cooling')
  assert.equal(input.keys.d, false)
})

test('engage: special fires only when an enemy is inside the special cast range', () => {
  const state = makeMatch()
  const p = bot(state, 'WATER')          // WHIRLPOOL cast range = SPECIAL_CAST_PX.WATER
  const castPx = BALANCE.BOT.SPECIAL_CAST_PX.WATER
  place(p, 500, 500, 500, 500)

  addEnemy(state, 500 + castPx - 10, 500)      // just inside
  assert.equal(computeBotInput(state, p, 1000).actions.special, true)

  state.enemyStore.count = 0
  addEnemy(state, 500 + BALANCE.BOT.ENGAGE_RANGE_PX - 5, 500)  // in engage range but beyond cast range
  assert.equal(computeBotInput(state, p, 1000).actions.special, false)
})

test('second ability only casts at team level 4+', () => {
  const state = makeMatch()
  const p = bot(state, 'WATER')
  place(p, 500, 500, 500, 500)
  addEnemy(state, 520, 500)              // point blank

  state.teamLevel = 1
  assert.equal(computeBotInput(state, p, 1000).actions.second, false)
  state.teamLevel = 4
  assert.equal(computeBotInput(state, p, 1000).actions.second, true)
})

test('retreat: a squishy bot at low HP flees the enemy; a tank at low HP still closes', () => {
  const state = makeMatch()
  const squishy = bot(state, 'FIRE')     // FIRE retreats
  place(squishy, 500, 500, 500, 500)
  squishy.hp = Math.floor(squishy.maxHp * 0.15)
  addEnemy(state, 700, 500)              // east
  const fi = computeBotInput(state, squishy, 1000)
  assert.equal(fi.keys.a, true, 'squishy backs away (west) from the eastern enemy')
  assert.equal(fi.keys.d, false)

  const tank = bot(state, 'WATER')       // WATER does not retreat
  place(tank, 500, 500, 500, 500)
  tank.hp = Math.floor(tank.maxHp * 0.15)
  const wi = computeBotInput(state, tank, 1000)
  assert.equal(wi.keys.d, true, 'tank still closes on the enemy despite low HP')
})

test('reviveMate: a downed teammate outranks engaging — the bot walks to the mate', () => {
  const state = makeMatch()
  const p = bot(state, 'WATER')
  place(p, 500, 500, 500, 500)
  // Downed teammate to the north, within revive-seek range.
  const mate = bot(state, 'WIND')
  mate.life = 'down'; mate.alive = false
  mate.x = 500; mate.y = 500 - (BALANCE.BOT.REVIVE_SEEK_RANGE_PX - 40)
  // An enemy to the east that would otherwise trigger engage.
  addEnemy(state, 640, 500)
  const input = computeBotInput(state, p, 1000)
  assert.equal(input.keys.w, true, 'moves north toward the downed mate')
  assert.equal(input.keys.d, false, 'does not chase the eastern enemy')
})

test('hold: with no enemies and no downed mate, the bot returns to its anchor and then stops', () => {
  const state = makeMatch()
  const p = bot(state, 'WATER')
  place(p, 600, 500, 500, 500)           // 100px east of anchor
  const moving = computeBotInput(state, p, 1000)
  assert.equal(moving.keys.a, true, 'walks back west toward the anchor')
  assert.equal(moving.actions.basic, false, 'no swinging with nothing to hit')

  place(p, 500, 500, 500, 500)           // sitting on the anchor
  const idle = computeBotInput(state, p, 1000)
  assert.equal(idle.keys.a, false)
  assert.equal(idle.keys.d, false)
  assert.equal(idle.keys.w, false)
  assert.equal(idle.keys.s, false)
})

test('runBotInputs fills alive bots only, and never overrides an existing buffer entry', () => {
  const state = makeMatch()
  const dead = bot(state, 'WIND')
  dead.life = 'dead'; dead.alive = false
  const overridden = bot(state, 'WATER')

  const buf = new Map()
  const sentinel = { keys: {}, aimX: 0, aimY: 0, actions: {} }
  buf.set(overridden.id, sentinel)       // pretend a test/human already drove this slot

  runBotInputs(state, buf, 1000, 50)

  assert.ok(buf.has('b1'), 'FIRE bot got a synthesized input')
  assert.equal(buf.get(overridden.id), sentinel, 'existing entry is untouched')
  assert.equal(buf.has('h0'), false, 'the human is not driven by the bot layer')
  assert.equal(buf.has('b3'), false, 'the dead bot is skipped')
})

test('INTEGRATION: a bot walks to a downed teammate and revives them through the tick loop', () => {
  // 'ready' timing is untimed: with no human readied, the run stays in BUILD
  // (no wave, no enemies) so we can observe the revive channel in isolation.
  const room = {
    players: [
      { id: 'h0', element: 'EARTH', displayName: 'human-earth', isBot: false },
      { id: 'b1', element: 'FIRE',  displayName: 'fire-bot',    isBot: true },
      { id: 'b2', element: 'WATER', displayName: 'water-bot',   isBot: true },
      { id: 'b3', element: 'WIND',  displayName: 'wind-bot',     isBot: true },
    ],
    settings: { timingStyle: 'ready', friendlyFire: false },
  }
  const state = createGameState(room, 20260720)
  startBuildPhase(state, 1)
  // Down the human near the hall; the WATER bot is the nearest reviver.
  const downed = bot(state, 'EARTH')
  downed.life = 'down'; downed.alive = false
  downed.downUntil = 1e9; downed.reviveMs = 0
  downed.x = 640; downed.y = 560

  const reviver = bot(state, 'WATER')
  reviver.x = 640 - 150; reviver.y = 560   // 150px away, outside REVIVE_RANGE
  reviver.ai = undefined                    // let the anchor derive naturally

  // Park the other two bots far away so only WATER does the reviving.
  for (const el of ['FIRE', 'WIND']) { const q = bot(state, el); q.x = 100; q.y = 100 }

  let now = 0
  let revived = false
  for (let t = 0; t < 400; t++) {
    now += 50
    tickGame(state, new Map(), now, 50)
    if (downed.life === 'up') { revived = true; break }
  }

  assert.equal(state.phase, PHASES.BUILD, 'stayed in build the whole time')
  assert.ok(revived, 'the downed teammate was revived by the bot')
  const d = Math.hypot(reviver.x - downed.x, reviver.y - downed.y)
  assert.ok(d <= BALANCE.PLAYER.REVIVE_RANGE_PX + 4, 'reviver ended within the revive channel range')
})
