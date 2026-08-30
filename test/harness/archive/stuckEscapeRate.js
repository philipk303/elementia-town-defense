#!/usr/bin/env node
// How often does the stuck watchdog (enemies.js STUCK_ESCAPE_MS) actually fire?
// A failsafe that fires routinely is a mechanic, and would be silently changing
// barricade attrition in every measurement. Reports firings per run across the
// full 144-cell matrix, per maze, for both defence arms.
//
// Usage: node test/harness/stuckEscapeRate.js

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze } from './scenarios.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  for (const defence of [STRUCTURE_TYPES.WATCHTOWER, STRUCTURE_TYPES.FIRE_SPECIAL]) {
    let total = 0, runsWithAny = 0, runs = 0, worst = 0
    for (const s of scenarioMatrix({ maze })) {
      let fired = 0
      runMatch({
        ...s, fuse: false, freeSpecial: false, spendDown: true, defence,
        onEnd: (state) => { fired = state.stuckEscapes ?? 0 },
      })
      runs++
      total += fired
      if (fired > 0) runsWithAny++
      if (fired > worst) worst = fired
    }
    console.log(`maze ${mazeName} ${defence}: ${total} firings across ${runs} runs — ${runsWithAny} runs affected, worst single run ${worst}`)
  }
}
