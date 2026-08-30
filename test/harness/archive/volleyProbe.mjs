#!/usr/bin/env node
// Firestorm volley-delivery probe (2026-08-04).
//
// THE QUESTION. On the isolated instrument, Firestorm's maze-B score delta
// reads +0.93 on the flank siting and +0.26 on the funnel siting — a 3.6x gap
// with no proposed mechanism, and the flank cell is an outlier against three
// other measurements of the same quantity (0.368, 0.264, 0.257). Direction is
// established (paired-significant in all four maze-B cells, and BH-robust per
// docs/reviews/2026-08-04-paired-statistic-retrospective.md section 4);
// magnitude is not.
//
// Firestorm is `spec.volley` — it hits EVERY enemy within rangePx once per
// cooldown — and is the only such structure in BALANCE. So the mechanic has
// exactly one delivery quantity, `hitIds.length` at volley.js:45, and the
// siting question reduces to: does the flank siting put more bodies inside
// rangePx per volley than the funnel siting does?
//
// WHAT THE ANSWERS MEAN.
//   flank delivers ~3.6x the funnel's hits/run  -> mechanism found; the score
//       gap is a real delivery difference and +0.93 is not an outlier
//   flank delivers about the SAME as funnel     -> the score gap is NOT a
//       volley-delivery effect, and +0.93 needs another explanation or is
//       noise. Quote +0.26.
//   in between                                  -> partial; report the ratio
//       and do not attribute the remainder.
//
// This probe answers a MECHANICAL question, so it is not a significance test
// and prints no verdict. It reports the per-run and per-activation delivery at
// each siting; the reader compares them to the 3.6x the score gap implies.
//
// The wave-4 CONTROL arm (no fusion) is run too. Firestorm is fusion-only, so
// the control has no volley structure at all and must report zero activations
// — if it does not, the probe is measuring something other than Firestorm and
// every number here is void.
//
// Usage: node test/harness/volleyProbe.mjs [--seeds N]

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i === -1 || i === process.argv.length - 1 ? d : process.argv[i + 1]
}
const seeds = SEEDS.slice(0, Number(arg('seeds', SEEDS.length)))

console.log(`Firestorm (FIRE+WIND) volley delivery — isolated protocol, ${seeds.length} seeds x 2 posts, wave-4 fuse`)
console.log('')

for (const mazeName of ['A', 'B']) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds, maze })
  const perSiting = {}
  for (const siting of ['tower', 'funnel']) {
    const freeSpecialSites = siting === 'funnel' ? 'funnel' : null
    const armed = { activations: 0, hits: 0, boltsSpawned: 0, boltsHit: 0, boltsRefused: 0 }
    const control = { activations: 0, hits: 0, boltsSpawned: 0, boltsHit: 0, boltsRefused: 0 }
    let runs = 0, hangs = 0
    for (const s of scenarios) {
      const mC = runMatch({ ...s, fuse: false, humanElement: 'FIRE',
        freeSpecialSites, sitingProtocol: 'isolated', volleyProbe: control })
      const mA = runMatch({ ...s, fuse: true, fuseWave: 4, humanElement: 'FIRE', fuseWith: 'WIND',
        freeSpecialSites, sitingProtocol: 'isolated', volleyProbe: armed })
      if (mC.timedOut || mC.stalled || mA.timedOut || mA.stalled) hangs++
      runs++
    }
    perSiting[siting] = armed
    console.log(
      `maze ${mazeName} ${siting === 'tower' ? 'flank ' : 'funnel'}` +
      ` | volleys ${String(armed.activations).padStart(6)} (${(armed.activations / runs).toFixed(1)}/run)` +
      ` | hits ${String(armed.hits).padStart(7)} (${(armed.hits / runs).toFixed(1)}/run)` +
      ` | bodies/volley ${(armed.activations ? armed.hits / armed.activations : 0).toFixed(3)}` +
      ` | bolts spawned ${armed.boltsSpawned} hit ${armed.boltsHit} refused ${armed.boltsRefused}` +
      ` (${armed.boltsSpawned ? (armed.boltsHit / armed.boltsSpawned * 100).toFixed(1) : '0.0'}% connect)` +
      ` | control volleys ${control.activations}${control.activations ? '  <-- PROBE INVALID' : ''}` +
      ` | hangs ${hangs}/${runs}`)
  }
  const f = perSiting.tower, n = perSiting.funnel
  const ratio = x => (n[x] ? f[x] / n[x] : NaN)
  console.log(
    `maze ${mazeName} flank/funnel ratio` +
    ` | volleys ${ratio('activations').toFixed(2)}x` +
    ` | hits ${ratio('hits').toFixed(2)}x` +
    ` | bodies/volley ${((f.hits / f.activations) / (n.hits / n.activations)).toFixed(2)}x` +
    '   (the maze-B score gap implies 3.6x)')
  console.log('')
}
console.log('No verdict by design — this is a mechanical measurement. Read the ratios.')
