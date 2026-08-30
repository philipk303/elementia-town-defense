#!/usr/bin/env node
// Which maze-B cells still stall in the Firepit arm? Prints seed/postGap for
// every stalled cell so the diagnostic can be pointed at them directly.
// Usage: node test/harness/firepitHangScan.js [--maze B] [--defence FIRE_SPECIAL]

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze } from './scenarios.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const maze = resolveMaze(arg('maze', 'B'))
const defence = STRUCTURE_TYPES[arg('defence', 'FIRE_SPECIAL')]

for (const s of scenarioMatrix({ maze })) {
  const m = runMatch({ ...s, fuse: false, freeSpecial: false, spendDown: true, defence })
  if (m.stalled || m.timedOut) {
    console.log(`STALL seed=${s.seed} postGap=${s.postGap} stalled=${m.stalled} timedOut=${m.timedOut} waves=${m.wavesCleared} ticks=${m.ticks}`)
  }
}
console.log('scan complete')
