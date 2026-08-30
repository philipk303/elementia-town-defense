#!/usr/bin/env node
// Blizzard siting sign-flip, step 2 (2026-08-04, Task 20 §0).
//
// sitingDecompose.mjs falsified the "the control arm moved, not the fusion"
// explanation: the WATER_SPECIAL ingredient barely moves with siting
// (maze A +0.012 -> -0.169) while the FUSION arm swings 1.08 score points
// (+0.260 -> -0.822 vs the no-free-special anchor, t3.47). Same structure,
// same gold, different tile -> significantly WORSE than building nothing.
//
// Damage cannot hurt the defence, so the harm has to come from one of:
//   freeze  — 1200ms root on every enemy in a 70px circle, applied inside a
//             lane choke where bodies collide
//   body    — the 2x2 walkable footprint sitting in the lane at all, plus the
//             8 gold the fusion arm spends on the partner
// This isolates them by neutering Blizzard's payload:
//   baseline  damage 18, freeze 1200
//   noFreeze  damage 18, freeze off      -> if this recovers, freeze is the cause
//   noDamage  damage 0,  freeze 1200
//   inert     damage 0,  freeze off      -> pure body+gold cost of the placement
// Every arm is compared against the SAME siting-independent `none` anchor
// (freeSpecial:false, fuse:false) so the numbers are absolute, not relative to
// a control that also moves.
//
// 24-seed screen, same subset/machinery as fusionTweakScreen.mjs.
//
// Usage: node test/harness/blizzardComponents.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify } from './stats.js'
import { BALANCE } from '../../shared/balance.js'

const screenSeeds = SEEDS.slice(0, 24)
const base = { ...BALANCE.TOWER.BLIZZARD }

const VARIANTS = {
  baseline: {},
  noFreeze: { freeze: undefined },
  noDamage: { damage: 0 },
  inert: { damage: 0, freeze: undefined },
}

function runArm(scenarios, opts) {
  const scores = []
  let hangs = 0
  for (const s of scenarios) {
    const m = runMatch({ ...s, ...opts })
    if (m.timedOut || m.stalled) hangs++
    else scores.push(m.score)
  }
  return { scores, hangs }
}

function diff(a, b) {
  const c = classify([a.scores, b.scores])
  const d = c.means[1] - c.means[0]
  return `${d >= 0 ? '+' : ''}${d.toFixed(3)}(t${c.t.toFixed(2)})`
}

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds: screenSeeds, maze })
  const none = runArm(scenarios, { fuse: false, freeSpecial: false, humanElement: 'WATER' })
  const anchor = none.scores.reduce((s, v) => s + v, 0) / none.scores.length
  console.log(`\n### maze ${mazeName} — no-free-special anchor ${anchor.toFixed(3)} (hangs ${none.hangs})`)

  for (const [vname, v] of Object.entries(VARIANTS)) {
    Object.assign(BALANCE.TOWER.BLIZZARD, base, v)
    const cells = []
    for (const siting of ['tower', 'funnel']) {
      const freeSpecialSites = siting === 'funnel' ? 'funnel' : null
      const fus = runArm(scenarios, {
        fuse: true, fuseWave: 4, humanElement: 'WATER', fuseWith: 'WIND', freeSpecialSites,
      })
      cells.push(`${siting} ${diff(none, fus)} h${fus.hangs}`)
    }
    console.log(vname.padEnd(10), cells.join('   '))
  }
  Object.assign(BALANCE.TOWER.BLIZZARD, base)
}
