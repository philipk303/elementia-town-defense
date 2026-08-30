import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ELEMENTS } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { ENEMY_TYPE, WEIGHT, SPEED } from '../../server/game/enemyTypes.js'
import { createGameState } from '../../server/game/state.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { trySpecial, trySecond } from '../../server/game/abilities.js'

const A = BALANCE.ABILITY
const DT = 1000 / 60

// players: p0=EARTH p1=FIRE p2=WATER p3=WIND
function makeState(settings = {}, teamLevel = 4) {
  const state = createGameState({
    players: ELEMENTS.map((el, i) => ({ id: `p${i}`, element: el, displayName: el, isBot: i > 0 })),
    settings: { timingStyle: 'fixed', friendlyFire: false, ...settings },
  }, 42)
  state.phase = PHASES.FIGHT
  state.teamLevel = teamLevel
  for (const p of state.players) { p.x = 1100; p.y = 100 }  // out of the way
  return state
}

function orcAt(s, x, y) {
  return s.enemyStore.spawn({ type: ENEMY_TYPE.ORC, elite: false, x, y }, 0)
}

// --- Ground Slam (Earth special): AoE damage + weight-scaled shove ----------
// (2026-07-19: slow removed, damage nerfed 26->16 — it read as too strong)

test('Ground Slam damages and shoves enemies in radius; no longer applies slow', () => {
  const s = makeState({}, 1)
  const p = s.players[0]
  p.x = 400; p.y = 400
  const store = s.enemyStore
  const inR = orcAt(s, 400 + A.EARTH.SPECIAL.radiusPx - 10, 400)
  const outR = orcAt(s, 400 + A.EARTH.SPECIAL.radiusPx + 40, 400)
  const hp0 = store.hp[inR]
  trySpecial(s, p, 1000)
  assert.equal(store.hp[inR], hp0 - A.EARTH.SPECIAL.damage)
  assert.equal(store.hp[outR], BALANCE.ENEMY.BASE[ENEMY_TYPE.ORC].hp, 'outside radius untouched')
  assert.equal(store.status[inR].slowMs, 0, 'slow removed from Ground Slam')
  assert.ok(store.kvx[inR] > 0, 'weight-scaled shove still applies')
  assert.equal(store.aggro[inR].targetId, p.id, 'ability damage pulls aggro')
  assert.ok(p.specialReadyAt > 1000, 'cooldown armed')
  // Cooldown gates a second cast.
  const hp1 = store.hp[inR]
  trySpecial(s, p, 1001)
  assert.equal(store.hp[inR], hp1)
})

// --- Fireball (Fire special): spawns a real projectile -----------------------

test('Fireball spawns a projectile along the aim vector', () => {
  const s = makeState({}, 1)
  const p = s.players[1]
  p.x = 300; p.y = 300; p.aimX = 0; p.aimY = 1
  trySpecial(s, p, 1000)
  assert.equal(s.projectiles.length, 1)
  const pr = s.projectiles[0]
  assert.equal(pr.type, 'FIREBALL')
  assert.equal(pr.ownerId, p.id)
  assert.ok(pr.vy > 0 && Math.abs(pr.vx) < 1e-9)
  assert.equal(pr.damage, A.FIRE.SPECIAL.damage)
})

test('L3 boosts the Fire special projectile area AND range, not just damage (CP3 M1)', () => {
  // The amendment defines L3 as "×1.3 damage AND area/range on the L1 specials."
  // Earth/Water/Wind boost both damage and radius/range; the Fireball passed only
  // boosted damage, leaving its AoE/range L1-sized at L3.
  const boost = BALANCE.LEVELING.L3_SPECIAL_BOOST
  const FB = BALANCE.PROJECTILE.FIREBALL
  const s = makeState({}, 3)
  const p = s.players[1]  // FIRE
  p.x = 300; p.y = 300; p.aimX = 1; p.aimY = 0
  trySpecial(s, p, 1000)
  const pr = s.projectiles[0]
  assert.equal(pr.damage, Math.round(A.FIRE.SPECIAL.damage * boost), 'damage boosted')
  assert.ok(Math.abs(pr.aoeRadiusPx - FB.aoeRadiusPx * boost) < 1e-9, 'L3 boosts blast area')
  assert.ok(Math.abs(pr.maxRangePx - FB.maxRangePx * boost) < 1e-9, 'L3 boosts range')
})

// --- Whirlpool (Water special, 2026-07-19 swap): radial pull, diminishing ---
// range, weight-scaled. Uses TROLLs (90 hp, survives the 12-dmg hit) so
// swap-remove never reshuffles the slots the assertions read back.

test('Whirlpool pulls lighter enemies toward the caster harder than heavier ones', () => {
  const s = makeState({}, 1)
  const p = s.players[2]  // WATER
  p.x = 500; p.y = 300
  const store = s.enemyStore
  // ORC (MEDIUM, 30 hp) not GOBLIN (LIGHT, 12 hp) — Whirlpool's 12 damage would
  // exactly kill a goblin, swap-removing it and reshuffling slot indices.
  const orc = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 500 + 80, y: 300 }, 0)
  const troll = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 500 - 80, y: 300 }, 0)  // HEAVY
  trySpecial(s, p, 1000)
  assert.ok(store.kvx[orc] < 0, 'orc pulled toward the caster (negative x)')
  assert.ok(store.kvx[troll] > 0, 'troll pulled toward the caster (positive x) but weaker')
  const oMag = Math.abs(store.kvx[orc]), tMag = Math.abs(store.kvx[troll])
  assert.ok(tMag < oMag, 'heavier troll pulled less than the medium-weight orc')
})

test('Whirlpool is a radial AoE (omnidirectional), not a cone — aim is irrelevant', () => {
  const s = makeState({}, 1)
  const p = s.players[2]
  p.x = 500; p.y = 300; p.aimX = 1; p.aimY = 0   // aiming +x
  const store = s.enemyStore
  const behind = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 500 - 80, y: 300 }, 0)  // opposite the aim
  trySpecial(s, p, 1000)
  assert.ok(store.kvx[behind] !== 0, 'enemy behind the caster is still pulled — radial, not cone')
})

test('Whirlpool honors the diminishing pull-range of much-yanked enemies', () => {
  const s = makeState({}, 1)
  const p = s.players[2]
  p.x = 500; p.y = 300
  const store = s.enemyStore
  const dist = A.WATER.SPECIAL.radiusPx - 15
  const fresh = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 500 + dist, y: 300 }, 0)
  const yanked = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 500 - dist, y: 300 }, 0)
  store.aggro[yanked].pullCount = BALANCE.AGGRO.PULL_DIMINISH_MAX
  trySpecial(s, p, 1000)
  assert.ok(store.kvx[fresh] !== 0, 'fresh enemy inside base radius is pulled')
  assert.equal(store.kvx[yanked], 0, 'much-yanked enemy outside its diminished pull-range resists')
})

// --- Wind Blast (Wind special, 2026-07-19 swap): radial push, weight-scaled -

test('Wind Blast pushes enemies away from the caster, weight-scaled; super-heavy resists most', () => {
  const s = makeState({}, 1)
  const p = s.players[3]  // WIND
  p.x = 300; p.y = 300
  const store = s.enemyStore
  // ORC not GOBLIN — Wind Blast's 12 damage would exactly kill a 12-hp goblin.
  const orc = store.spawn({ type: ENEMY_TYPE.ORC, elite: false, x: 380, y: 300 }, 0)
  const troll = store.spawn({ type: ENEMY_TYPE.TROLL, elite: true, x: 340, y: 300 }, 0)  // super-heavy
  trySpecial(s, p, 1000)
  assert.ok(store.kvx[orc] > 0, 'orc pushed away along +x')
  assert.equal(store.kvx[troll], 0, 'super-heavy elite troll immune to displacement')
  assert.ok(store.hp[troll] < store.maxHp[troll], 'damage still lands on the immune-to-push troll')
})

test('Wind Blast is a radial AoE (omnidirectional), broader than Whirlpool', () => {
  assert.ok(A.WIND.SPECIAL.radiusPx > A.WATER.SPECIAL.radiusPx, 'Wind Blast is the broader-scope effect')
  const s = makeState({}, 1)
  const p = s.players[3]
  p.x = 500; p.y = 300; p.aimX = 1; p.aimY = 0
  const store = s.enemyStore
  const behind = store.spawn({ type: ENEMY_TYPE.TROLL, elite: false, x: 500 - 80, y: 300 }, 0)
  trySpecial(s, p, 1000)
  assert.ok(store.kvx[behind] !== 0, 'enemy behind the caster is still pushed — radial, not cone')
})

// --- FF matrix: FF is displacement-only (2026-07-19) — teammates are shoved,
// never damaged, gated by the room flag. ------------------------------------

test('FF matrix: slam/whirlpool/wind-blast/nova/fissure/tidal shove teammates only with FF on, never damage them', () => {
  for (const ff of [false, true]) {
    const s = makeState({ friendlyFire: ff }, 4)
    const [earth, fire, water, wind] = s.players
    // Cluster everyone with small distinct offsets (never exactly on top of the
    // caster — a zero-distance target has an undefined push direction) so every
    // ability's radius/cone/line still covers the whole group; aim +x for the
    // line/cone L4 seconds.
    earth.x = 400; earth.y = 400
    fire.x = 410;  fire.y = 400
    water.x = 390; water.y = 405
    wind.x = 405;  wind.y = 395
    for (const p of s.players) p.aimX = 1, p.aimY = 0
    const hp0 = { earth: earth.hp, fire: fire.hp, water: water.hp, wind: wind.hp }

    trySpecial(s, earth, 1000)                   // Ground Slam AoE + shove
    if (ff) assert.ok(fire.kvx !== 0 || fire.kvy !== 0, 'FF on: slam shoves teammates')
    else    assert.equal(fire.kvx, 0, 'FF off: no shove')

    trySpecial(s, water, 2000)                   // Whirlpool pull (radial, water is WATER's own cast so unaffected)
    if (ff) assert.ok(fire.kvx !== 0 || fire.kvy !== 0, 'FF on: teammate pulled by whirlpool')

    trySpecial(s, wind, 3000)                    // Wind Blast push
    if (ff) assert.ok(water.kvx !== 0 || water.kvy !== 0, 'FF on: teammate pushed by wind blast')

    trySecond(s, fire, 4000)                     // Flame Nova AoE + ffShove
    if (ff) assert.ok(wind.kvx !== 0 || wind.kvy !== 0, 'FF on: teammate shoved by flame nova')

    trySecond(s, water, 5000)                    // Tidal Wave cone + knockback
    if (ff) assert.ok(wind.kvx !== 0 || wind.kvy !== 0, 'FF on: teammate shoved by tidal wave')

    // The whole point of the rework: no ability ever damages a teammate, FF on or off.
    assert.equal(earth.hp, hp0.earth, 'earth never damaged by any FF interaction')
    assert.equal(fire.hp,  hp0.fire,  'fire never damaged by any FF interaction')
    assert.equal(water.hp, hp0.water, 'water never damaged by any FF interaction')
    assert.equal(wind.hp,  hp0.wind,  'wind never damaged by any FF interaction')
  }
})

test('FF off: no ability shoves teammates at all', () => {
  const s = makeState({ friendlyFire: false }, 4)
  const [earth, fire, water, wind] = s.players
  for (const p of s.players) { p.x = 400; p.y = 400; p.aimX = 1; p.aimY = 0 }
  water.x = 360
  trySpecial(s, earth, 1000)
  trySpecial(s, water, 2000)
  trySpecial(s, wind, 3000)
  trySecond(s, fire, 4000)
  trySecond(s, water, 5000)
  for (const p of [earth, fire, water, wind]) {
    assert.equal(p.kvx, 0, `${p.element}: no FF-off displacement`)
    assert.equal(p.kvy, 0, `${p.element}: no FF-off displacement`)
  }
})

// --- Earth super-heavy FF displacement immunity + Wind flung far -------------

test('under FF, displacement on teammates scales by player weight (Wind flung, Earth immune)', () => {
  const s = makeState({ friendlyFire: true }, 1)
  const water = s.players[2], earth = s.players[0], wind = s.players[3]
  water.x = 300; water.y = 300
  earth.x = 360; earth.y = 300   // within Whirlpool's radiusPx (120)
  wind.x = 360; wind.y = 310
  trySpecial(s, water, 1000)     // Whirlpool: pulls toward water (caster)
  assert.equal(earth.kvx, 0, 'super-heavy Earth immune')
  assert.ok(wind.kvx < 0, 'light Wind pulled hardest toward the caster (negative x, toward water)')
})

// --- L4 seconds: gate + effects ----------------------------------------------

test('second abilities are locked below team level 4', () => {
  const s = makeState({}, 3)
  const p = s.players[0]
  p.x = 400; p.y = 400
  const i = orcAt(s, 460, 400)
  trySecond(s, p, 1000)
  assert.equal(s.enemyStore.hp[i], BALANCE.ENEMY.BASE[ENEMY_TYPE.ORC].hp, 'no effect below L4')
  assert.equal(p.secondReadyAt, 0, 'no cooldown burned')
})

test('Fissure (Earth L4) damages and roots along the aim line', () => {
  const s = makeState({}, 4)
  const p = s.players[0]
  p.x = 300; p.y = 300; p.aimX = 1; p.aimY = 0
  const store = s.enemyStore
  const onLine = orcAt(s, 420, 305)
  const offLine = orcAt(s, 420, 400)
  trySecond(s, p, 1000)
  assert.ok(store.hp[onLine] < store.maxHp[onLine])
  assert.ok(store.status[onLine].rootMs > 0, 'rooted')
  assert.equal(store.hp[offLine], store.maxHp[offLine], 'off the line untouched')
})

test('Flame Nova (Fire L4) burns everything around the caster', () => {
  const s = makeState({}, 4)
  const p = s.players[1]
  p.x = 400; p.y = 400
  const i = orcAt(s, 400 + A.FIRE.SECOND.radiusPx - 10, 400)
  trySecond(s, p, 1000)
  assert.ok(s.enemyStore.hp[i] < s.enemyStore.maxHp[i])
  assert.ok(s.enemyStore.status[i].burnMs > 0)
})

test('Tidal Wave (Water L4) applies Wet + knockback in a wide cone', () => {
  const s = makeState({}, 4)
  const p = s.players[2]
  p.x = 300; p.y = 300; p.aimX = 1; p.aimY = 0
  const store = s.enemyStore
  const i = orcAt(s, 400, 330)
  trySecond(s, p, 1000)
  assert.ok(store.status[i].wetMs > 0, 'Wet applied (Blizzard-combo enabler)')
  assert.ok(store.kvx[i] > 0, 'shoved along the wave')
})

test('Gale Dash (Wind L4) propels the caster and damages enemies along the path', () => {
  const s = makeState({}, 4)
  const p = s.players[3]
  p.x = 300; p.y = 300; p.aimX = 1; p.aimY = 0
  const store = s.enemyStore
  const onPath = orcAt(s, 380, 300)
  const offPath = orcAt(s, 380, 420)
  trySecond(s, p, 1000)
  assert.ok(p.kvx > 0, 'caster launched along the aim')
  assert.ok(store.hp[onPath] < store.maxHp[onPath])
  assert.equal(store.hp[offPath], store.maxHp[offPath])
})

// --- L3 boost ----------------------------------------------------------------

test('L3 boosts special damage and area', () => {
  const boost = BALANCE.LEVELING.L3_SPECIAL_BOOST
  const s1 = makeState({}, 1)
  const s3 = makeState({}, 3)
  for (const s of [s1, s3]) {
    const p = s.players[0]
    p.x = 400; p.y = 400
    // Just beyond base radius + body edge, but inside the boosted radius.
    orcAt(s, 400 + A.EARTH.SPECIAL.radiusPx + BALANCE.ENEMY.BASE[ENEMY_TYPE.ORC].radius + 5, 400)
    trySpecial(s, p, 1000)
  }
  const orcHp = BALANCE.ENEMY.BASE[ENEMY_TYPE.ORC].hp
  assert.equal(s1.enemyStore.hp[0], orcHp, 'L1: outside base radius')
  assert.equal(s3.enemyStore.hp[0], orcHp - Math.round(A.EARTH.SPECIAL.damage * boost),
    'L3: boosted radius catches it, boosted damage lands')
})

// --- Special-cast animation trigger (client/src/render/AnimationController.js
// CHARACTER_STATE.SPECIAL) — every Q/E ability pushes the same shared
// 'SPECIAL_CAST' atk kind so the caster's hero plays its special-cast
// animation, independent of and in addition to the generic ability/ability2
// ring fx already asserted elsewhere. ------------------------------------

test('trySpecial pushes a SPECIAL_CAST atk event for the caster, with a rising per-player seq', () => {
  const s = makeState({}, 1)
  const p = s.players[0]
  p.x = 400; p.y = 400; p.aimX = 1; p.aimY = 0
  trySpecial(s, p, 1000)
  assert.equal(s.atkFx.length, 1)
  assert.deepEqual(s.atkFx[0], { srcId: p.id, kind: 'SPECIAL_CAST', x: p.x, y: p.y, aimX: 1, aimY: 0, seq: 1 })
})

test('trySecond pushes a SPECIAL_CAST atk event too, on the same per-player seq counter as trySpecial', () => {
  const s = makeState({}, 4)
  const p = s.players[0]
  p.x = 500; p.y = 500
  trySpecial(s, p, 1000)
  s.atkFx.length = 0
  p.aimX = 0; p.aimY = 1
  trySecond(s, p, 9000)
  assert.equal(s.atkFx.length, 1)
  assert.deepEqual(s.atkFx[0], { srcId: p.id, kind: 'SPECIAL_CAST', x: p.x, y: p.y, aimX: 0, aimY: 1, seq: 2 },
    'seq continues from trySpecial\'s call rather than resetting, so the client\'s single dedup gate stays monotonic')
})
