import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ELEMENTS } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { placeStructure } from '../../server/game/structures.js'
import { respondToFusion } from '../../server/game/combos.js'
import { damagePlayer } from '../../server/game/players.js'

// Phase 5's createGameState seeds a pre-built starting economy (2 Farms + 1
// Marketplace); strip those out to isolate what a test placed itself.
function nonEcoTypes(state) {
  return state.structures.filter(s => s.type !== 'FARM' && s.type !== 'MARKETPLACE')
    .map(s => s.type).sort()
}

function makeState() {
  const state = createGameState({
    players: ELEMENTS.map((el, i) => ({ id: `p${i}`, element: el, displayName: el, isBot: false, gold: 9999 })),
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }, 42)
  return state
}

test('team level follows the beat-sheet milestones (waves 1/3/6/8) and never downgrades', () => {
  const s = makeState()
  startBuildPhase(s, 1)
  assert.equal(s.teamLevel, 1)
  assert.equal(s.pendingLevelUp, null, 'starting at L1 is not a level-up broadcast')
  startBuildPhase(s, 2)
  assert.equal(s.teamLevel, 1)
  startBuildPhase(s, 3)
  assert.equal(s.teamLevel, 2)
  assert.equal(s.pendingLevelUp, 2, 'L2 milestone latched for the broadcast')
  s.pendingLevelUp = null
  startBuildPhase(s, 6)
  assert.equal(s.teamLevel, 3)
  startBuildPhase(s, 8)
  assert.equal(s.teamLevel, 4)
})

test('build-phase start fully restores downed and dead players (spec §4)', () => {
  const s = makeState()
  s.phase = PHASES.FIGHT
  const p = s.players[0]
  for (const q of s.players) if (q !== p) { q.x = 1200; q.y = 100 }
  damagePlayer(s, p, 9999, 1000)
  assert.equal(p.life, 'down')
  startBuildPhase(s, 2)
  assert.equal(p.life, 'up')
  assert.equal(p.hp, p.maxHp)
})

// The L2 diagonal-combo gate was REMOVED (redesign Amendment A1.3): all six
// fusions are available from the start. The three tests that lived here pinned
// the gate and its retro-resolution on level-up — automatic retro-fusion could
// not be reconciled with the two-player consent gate, and under permanence it
// would have handed players a structure they never agreed to. Fusion geometry
// is now covered by test/game/combos.test.js.

test('all six fusions are available at L1 (the diagonal gate is gone)', () => {
  const s = makeState()
  s.phase = PHASES.BUILD
  s.teamLevel = 1
  const fire = s.players[1], water = s.players[2]
  placeStructure(s, fire, 'FIRE_SPECIAL', 5, 5, 0, { orient: 'H' })
  const res = placeStructure(s, water, 'WATER_SPECIAL', 5, 6, 0, { orient: 'H', dir: 'N' })
  // Task 13: availability is now "a proposal is OFFERED at L1", not "it fuses
  // on placement" — the consent step is what completes it (combos.test.js).
  assert.equal(res.fusionProposal?.comboType, 'STEAM_VENT', 'Steam Vent is offered at L1')
  respondToFusion(s, water, res.fusionProposal.id, true, 0)
  respondToFusion(s, fire, res.fusionProposal.id, true, 0)
  assert.deepEqual(nonEcoTypes(s), ['STEAM_VENT'], 'Steam Vent fuses at L1')
})
