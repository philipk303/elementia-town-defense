#!/usr/bin/env node
// Why does a WALKABLE body in the lane cost score? (2026-08-04, Task 20 §0)
//
// blizzardComponents.mjs showed a fully INERT Blizzard (damage 0, freeze off)
// still costs -0.463 (t2.01) on maze A when sited in the funnel, and ~0 on the
// flanks. blizzardProbe.mjs showed the mechanic itself performs the SAME in
// both sitings (selected 4.06 vs 3.79, resolved 4.00 vs 4.00, kills higher in
// the funnel). So the cost is the placement, not the payload.
//
// Candidate mechanism, enemies.js:429-471: an enemy whose body is over a
// walkable structure sets `attackWalkable`, and `attackWalkable` is one of the
// terms that RESETS the stuck watchdog (line 458). The watchdog is this
// project's guarantee that a jam terminates. Dropping a walkable 2x2 into the
// lane choke — precisely where bodies jam — therefore suppresses that
// guarantee for every jammed body standing on it.
//
// This splits the score into its two components and adds the jam telemetry:
//   wavesCleared  falls if enemies stop DYING (slow clears / bodies parked)
//   hallHpFrac    falls if enemies get THROUGH instead
//   stuckEscapes  the watchdog's own firing count
//
// Usage: node test/harness/funnelBodyProbe.mjs

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { BALANCE } from '../../shared/balance.js'

const screenSeeds = SEEDS.slice(0, 24)
const base = { ...BALANCE.TOWER.BLIZZARD }
// Inert: isolate the body from the payload.
Object.assign(BALANCE.TOWER.BLIZZARD, base, { damage: 0, freeze: undefined })

const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1)

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds: screenSeeds, maze })

  const arms = [
    ['none  ', { fuse: false, freeSpecial: false }],
    ['tower ', { fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: null }],
    ['funnel', { fuse: true, fuseWave: 4, fuseWith: 'WIND', freeSpecialSites: 'funnel' }],
  ]

  for (const [label, opts] of arms) {
    const waves = [], hall = [], ticks = [], esc = [], fight = []
    for (const s of scenarios) {
      let escapes = 0
      const m = runMatch({
        ...s, humanElement: 'WATER', ...opts,
        onEnd: (state) => { escapes = state.stuckEscapes ?? 0 },
      })
      if (m.timedOut || m.stalled) continue
      waves.push(m.wavesCleared); hall.push(m.hallHpFrac)
      ticks.push(m.ticks); fight.push(m.fightTicks); esc.push(escapes)
    }
    console.log(
      `maze ${mazeName} inert ${label}`,
      `| waves ${mean(waves).toFixed(3)}`,
      `| hallFrac ${mean(hall).toFixed(3)}`,
      `| ticks ${mean(ticks).toFixed(0)}`,
      `| fightTicks ${mean(fight).toFixed(0)}`,
      `| stuckEscapes ${mean(esc).toFixed(2)}`)
  }
}

Object.assign(BALANCE.TOWER.BLIZZARD, base)
