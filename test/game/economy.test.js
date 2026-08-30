import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  splitEvenly, citizenCount, applyWaveEndIncome, seedStartingEconomy, buildStructure,
} from '../../server/game/economy.js'
import { sellStructure, damageStructure } from '../../server/game/structures.js'
import { recomputeDormancy } from '../../server/game/dormancy.js'
import { PHASES } from '../../server/game/phaseMachine.js'
import { BALANCE } from '../../shared/balance.js'
import { CONFIG } from '../../shared/constants.js'
import { tileToWorldX, tileToWorldY } from '../../server/game/grid.js'

function makeState({ humans = 2, bots = 2, phase = PHASES.BUILD, wave = 1 } = {}) {
  const elements = ['EARTH', 'FIRE', 'WATER', 'WIND']
  const players = []
  let i = 0
  for (let h = 0; h < humans; h++) players.push({ id: `p${i}`, element: elements[i], isBot: false, gold: 0, usedFreeSpecial: false }), i++
  for (let b = 0; b < bots; b++) players.push({ id: `b${i}`, element: elements[i], isBot: true }), i++

  const hallGx = CONFIG.HALL.gx, hallGy = CONFIG.HALL.gy
  const hallCenterX = tileToWorldX(hallGx) + CONFIG.HALL.w / 2 * 32 - 32 / 2
  return {
    phase, wave,
    hall: {
      gx: hallGx, gy: hallGy, w: CONFIG.HALL.w, h: CONFIG.HALL.h,
      x: hallCenterX, y: tileToWorldY(hallGy),
      hp: BALANCE.HALL_HP, maxHp: BALANCE.HALL_HP,
    },
    players,
    structures: [],
    placedVersion: 0,
    waveBounty: 0,
  }
}

test('splitEvenly divides evenly with remainder going to the first N players', () => {
  assert.deepEqual(splitEvenly(10, 1), [10])
  assert.deepEqual(splitEvenly(10, 2), [5, 5])
  assert.deepEqual(splitEvenly(10, 3), [4, 3, 3])
  assert.deepEqual(splitEvenly(10, 4), [3, 3, 2, 2])
})

test('splitEvenly with zero humans returns an empty array (no divide-by-zero)', () => {
  assert.deepEqual(splitEvenly(10, 0), [])
})

test('citizenCount sums farm+marketplace houses, excluding a dormant marketplace', () => {
  const s = makeState()
  seedStartingEconomy(s, 0) // 2 farms + 1 marketplace pre-built = 8 citizens
  assert.equal(citizenCount(s), BALANCE.FARM_HOUSES * 2 + BALANCE.MARKETPLACE_HOUSES)

  const marketplace = s.structures.find(st => st.type === 'MARKETPLACE')
  marketplace.dormant = true
  assert.equal(citizenCount(s), BALANCE.FARM_HOUSES * 2)
})

test('applyWaveEndIncome splits hall+citizen+bounty income evenly among humans only', () => {
  const s = makeState({ humans: 2, bots: 2 })
  s.waveBounty = 4
  const tally = applyWaveEndIncome(s)
  // No structures beyond the bare hall in this test -> 0 citizens.
  const pooled = BALANCE.ECONOMY.HALL_BASE_INCOME + 0 + 4
  assert.equal(tally.pooled, pooled)
  const [p0, p1] = s.players
  assert.equal(p0.gold + p1.gold, pooled)
  assert.equal(p0.gold, Math.ceil(pooled / 2))
  // Bots never earn gold.
  assert.equal(s.players[2].gold, undefined)
})

test('ownership dividend pays the human owner extra gold while the structure stands, stops on destruction', () => {
  const s = makeState({ humans: 1, bots: 3 })
  const owner = s.players[0]
  owner.gold = 100
  const farm = buildStructure(s, owner, 'FARM', 5, 5, 1000).structure

  applyWaveEndIncome(s)
  const afterOneWave = owner.gold
  assert.ok(afterOneWave >= BALANCE.FARM_DIVIDEND) // dividend included in the tally

  damageStructure(s, farm, 9999) // destroy it
  const goldBeforeSecondTally = owner.gold
  applyWaveEndIncome(s)
  const gained = owner.gold - goldBeforeSecondTally
  // Only the base wave-income share now, no farm dividend and no farm headcount.
  assert.equal(gained, BALANCE.ECONOMY.HALL_BASE_INCOME)
})

test('marketplace dividend stops while dormant, resumes when farm capacity is restored', () => {
  const s = makeState({ humans: 1, bots: 3 })
  const owner = s.players[0]
  owner.gold = 100
  const f1 = buildStructure(s, owner, 'FARM', 5, 5, 1000).structure
  buildStructure(s, owner, 'FARM', 6, 5, 1001)
  const mp = buildStructure(s, owner, 'MARKETPLACE', 7, 5, 1002).structure
  assert.equal(mp.dormant, false)

  damageStructure(s, f1, 9999) // -> marketplace goes dormant
  assert.equal(mp.dormant, true)

  const before = owner.gold
  applyWaveEndIncome(s)
  const gained = owner.gold - before
  // Base hall income + surviving farm's headcount(2) & dividend(2); no
  // marketplace headcount/dividend while dormant.
  const expected = BALANCE.ECONOMY.HALL_BASE_INCOME + BALANCE.FARM_HOUSES * BALANCE.ECONOMY.CITIZEN_INCOME + BALANCE.FARM_DIVIDEND
  assert.equal(gained, expected)
})

test('seedStartingEconomy pre-builds 2 farms + 1 marketplace (8 citizens) with no owner, and grants starting gold to humans only', () => {
  const s = makeState({ humans: 2, bots: 2 })
  seedStartingEconomy(s, 0)

  assert.equal(s.structures.filter(st => st.type === 'FARM').length, 2)
  assert.equal(s.structures.filter(st => st.type === 'MARKETPLACE').length, 1)
  for (const st of s.structures) assert.equal(st.ownerId, null)
  assert.equal(citizenCount(s), 8)

  assert.equal(s.players[0].gold, BALANCE.ECONOMY.STARTING_GOLD)
  assert.equal(s.players[1].gold, BALANCE.ECONOMY.STARTING_GOLD)
  assert.equal(s.players[2].gold, undefined) // bot
})

test('seedStartingEconomy auto-places a special structure for every bot-controlled element, ownerless and sellable', () => {
  const s = makeState({ humans: 1, bots: 3 })
  seedStartingEconomy(s, 0)

  const botElements = s.players.filter(p => p.isBot).map(p => p.element)
  const specials = s.structures.filter(st => st.type.endsWith('_SPECIAL'))
  assert.equal(specials.length, botElements.length)
  for (const sp of specials) assert.equal(sp.ownerId, null)

  // Any human can sell one — refund lands in the selling player's wallet.
  const human = s.players[0]
  human.gold = 0
  const res = sellStructure(s, human, specials[0].id)
  assert.equal(res.ok, true)
  assert.equal(human.gold, res.refund)
})

test('buildStructure lets a player place their own element special for free at wave-1 build, once only', () => {
  const s = makeState({ humans: 1, bots: 3, wave: 1 })
  const player = s.players[0] // EARTH
  player.gold = 0

  const res = buildStructure(s, player, 'EARTH_SPECIAL', 5, 5, 1000)
  assert.equal(res.ok, true)
  assert.equal(player.gold, 0) // untouched — free grant
  assert.equal(player.usedFreeSpecial, true)

  // Second one is no longer free. Placed clear of the first — a special is 2x1
  // now, so (6,5) is the first one's OTHER tile and would reject as occupied
  // before the gold check ever ran.
  const res2 = buildStructure(s, player, 'EARTH_SPECIAL', 10, 10, 1001)
  assert.equal(res2.ok, false)
  assert.equal(res2.reason, 'insufficient-gold')
})

test('buildStructure charges gold normally for non-special structures and later waves', () => {
  const s = makeState({ humans: 1, bots: 3, wave: 2 })
  const player = s.players[0]
  player.gold = 1
  const res = buildStructure(s, player, 'BARRICADE', 5, 5, 1000)
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'insufficient-gold')

  player.gold = BALANCE.STRUCTURES.BARRICADE.cost
  const res2 = buildStructure(s, player, 'BARRICADE', 5, 5, 1001)
  assert.equal(res2.ok, true)
  assert.equal(player.gold, 0)
})

test('eco payback: 2 Farms + 1 Marketplace (30 gold) pays itself back in about 4 waves', () => {
  // Full 4-human team, per the spec's own worked example: the citizen-income
  // share is split across the whole team, only the dividend is owner-exclusive.
  const s = makeState({ humans: 4, bots: 0 })
  const owner = s.players[0]
  owner.gold = 30
  buildStructure(s, owner, 'FARM', 5, 5, 1000)
  buildStructure(s, owner, 'FARM', 6, 5, 1001)
  buildStructure(s, owner, 'MARKETPLACE', 7, 5, 1002)
  assert.equal(owner.gold, 0)

  let waves = 0
  while (owner.gold < 30 && waves < 10) {
    applyWaveEndIncome(s)
    waves++
  }
  assert.ok(waves >= 3 && waves <= 5, `expected payback in ~4 waves, got ${waves}`)
})

test('acceptance: money round-trips correctly across a full run with 2 humans', () => {
  const s = makeState({ humans: 2, bots: 2 })
  seedStartingEconomy(s, 0)
  const [a, b] = s.players
  const startingTotal = a.gold + b.gold

  let totalIncome = 0, totalSpent = 0, totalRefunded = 0

  const build1 = buildStructure(s, a, 'BARRICADE', 5, 5, 0)
  assert.equal(build1.ok, true)
  totalSpent += BALANCE.STRUCTURES.BARRICADE.cost
  const build2 = buildStructure(s, b, 'WATCHTOWER', 6, 5, 0)
  assert.equal(build2.ok, true)
  totalSpent += BALANCE.STRUCTURES.WATCHTOWER.cost

  for (let wave = 1; wave <= 5; wave++) {
    s.wave = wave
    s.waveBounty = wave * 2 // some per-wave bounty accrual
    const tally = applyWaveEndIncome(s)
    totalIncome += tally.pooled
    for (const d of Object.values(tally.dividends)) totalIncome += d
  }

  const sellRes = sellStructure(s, b, build2.structure.id)
  assert.equal(sellRes.ok, true)
  totalRefunded += sellRes.refund

  const finalTotal = a.gold + b.gold
  assert.equal(finalTotal, startingTotal + totalIncome + totalRefunded - totalSpent)
  assert.ok(a.gold >= 0 && b.gold >= 0)
})
