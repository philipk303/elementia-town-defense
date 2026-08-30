#!/usr/bin/env node
// Clean Blizzard / Steam Vent read with the watchtower-displacement confound
// removed (2026-08-04, Task 20 §0).
//
// sitingConfoundTest.mjs showed the published maze-A siting spread is an
// artifact: the free special's 2-wide footprint decides which `towerSites`
// entry the policy's BLOCKING Watchtower falls back to, and on maze A that
// choice is worth ~0.8-1.2 score points on its own. Priced out of reach, the
// whole spread collapses to noise (inert: +0.014 / -0.046 / -0.060).
//
// This is a DIAGNOSTIC protocol, not the shipped one: removing Watchtowers
// lowers the anchor (maze A none 8.592 -> 7.338) and changes the game. Its
// only job is to read each fusion's own mechanic without the tower confound
// on top. `live - inert` is the mechanic's value; `inert - none` is what the
// body plus the 8-gold partner purchase costs.
//
// Usage: node test/harness/cleanFusionVerdict.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'
import { BALANCE } from '../../shared/balance.js'

const towerCost = BALANCE.STRUCTURES.WATCHTOWER.cost
BALANCE.STRUCTURES.WATCHTOWER.cost = 9999

const CASES = [
  {
    name: 'BLIZZARD', human: 'WATER', partner: 'WIND',
    inert: { damage: 0, freeze: undefined },
  },
  {
    name: 'STEAM_VENT', human: 'FIRE', partner: 'WATER',
    inert: { pulse: { damage: 0, ms: 500 }, confuse: { ms: 0 } },
  },
]

const mean = a => a.reduce((x, v) => x + v, 0) / (a.length || 1)
function d(a, b) {
  const c = classify([a, b])
  const v = c.means[1] - c.means[0]
  return `${v >= 0 ? '+' : ''}${v.toFixed(3)}(t${c.t.toFixed(2)})`
}

for (const cs of CASES) {
  const base = { ...BALANCE.TOWER[cs.name] }
  console.log(`\n=== ${cs.name} (${cs.human}+${cs.partner}) — watchtowers priced out ===`)
  for (const mazeName of ['A', 'B']) {
    const maze = resolveMaze(mazeName)
    const scenarios = scenarioMatrix({ seeds: SEEDS, maze })
    const run = opts => {
      const scores = []
      for (const s of scenarios) {
        const m = runMatch({ ...s, humanElement: cs.human, ...opts })
        if (!(m.timedOut || m.stalled)) scores.push(m.score)
      }
      return scores
    }
    const none = run({ fuse: false, freeSpecial: false })
    console.log(`maze ${mazeName} none ${mean(none).toFixed(3)} (n ${none.length})`)
    for (const siting of [null, 'funnel']) {
      Object.assign(BALANCE.TOWER[cs.name], base)
      const live = run({ fuse: true, fuseWave: 4, fuseWith: cs.partner, freeSpecialSites: siting })
      Object.assign(BALANCE.TOWER[cs.name], base, cs.inert)
      const inert = run({ fuse: true, fuseWave: 4, fuseWith: cs.partner, freeSpecialSites: siting })
      Object.assign(BALANCE.TOWER[cs.name], base)
      console.log(
        `  ${(siting || 'tower').padEnd(6)}`,
        `| live-none ${d(none, live)}`,
        `| inert-none ${d(none, inert)}`,
        `| MECHANIC (live-inert) ${d(inert, live)}`)
    }
  }
  Object.assign(BALANCE.TOWER[cs.name], base)
}
BALANCE.STRUCTURES.WATCHTOWER.cost = towerCost
