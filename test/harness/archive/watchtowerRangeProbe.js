#!/usr/bin/env node
// Isolated range-cut check for Watchtower under the SAME spendDown/no-fuse
// controlled setup firepitRetest.js uses (not probe.js's default single-tower
// shipped policy) — several Watchtowers can end up covering overlapping
// ground under spendDown, which a single-purchase policy never exercises.
// Self-comparison: rangePx --from vs --to, damage/cooldown held fixed at
// whatever shared/balance.js currently has.
//
// Usage: node test/harness/watchtowerRangeProbe.js [--maze A|B|both] [--from 100] [--to 75]

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze } from './scenarios.js'
import { classify } from './stats.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}
const mazeArg = arg('maze', 'both')
const mazes = mazeArg === 'both' ? ['A', 'B'] : [mazeArg.toUpperCase()]
const from = Number(arg('from', 100))
const to = Number(arg('to', 75))
const dial = BALANCE.TOWER.WATCHTOWER
const original = dial.rangePx
console.log(`damage ${dial.damage} / cooldown ${dial.cooldownMs}ms (dps ${(dial.damage / (dial.cooldownMs / 1000)).toFixed(2)}) held fixed`)
console.log(`rangePx: ${from} vs ${to}`)

for (const mazeName of mazes) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ maze })
  const arms = { from: [], to: [] }
  const hangs = { from: 0, to: 0 }
  for (const s of scenarios) {
    const common = { ...s, fuse: false, freeSpecial: false, spendDown: true, defence: STRUCTURE_TYPES.WATCHTOWER }
    dial.rangePx = from
    const mFrom = runMatch(common)
    dial.rangePx = to
    const mTo = runMatch(common)
    if (mFrom.stalled || mFrom.timedOut) hangs.from++; else arms.from.push(mFrom.score)
    if (mTo.stalled || mTo.timedOut) hangs.to++; else arms.to.push(mTo.score)
  }
  dial.rangePx = original
  const c = classify([arms.from, arms.to])
  console.log(`maze ${mazeName}: range${from} ${c.means[0].toFixed(3)}  range${to} ${c.means[1].toFixed(3)}` +
    `  diff ${(c.means[1] - c.means[0]).toFixed(3)} (t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)})` +
    `  hangs ${hangs.from}/${hangs.to} of ${scenarios.length}`)
}
