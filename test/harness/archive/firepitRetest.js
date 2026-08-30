#!/usr/bin/env node
// Firepit re-verification (2026-08-02) — re-run of the 2026-07-25 A1.4
// falsification test (docs/reviews/2026-07-25-firepit-falsification-test.md)
// against Amendment B's continuous-DPS area field (replacing the pulsed
// model). See docs/handoffs/2026-08-02-firepit-retest.md for the full brief.
//
// Same method as the original test, reproduced here (never committed as a
// script the first time either): Watchtower vs Firepit, both spendDown:true,
// freeSpecial:false, fuse:false, 144 paired cells (72 seeds x 2 posts) per
// maze, both mazes. Hang-imputation + split-half discipline per
// elementia-baseline-review-lessons, same pattern fusionRoster.js used.
//
// NOT a test file (no .test.js suffix) — same convention as probe.js /
// fusionRoster.js.
//
// Usage: node test/harness/firepitRetest.js [--maze A|B|both] [--out path.json]

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze } from './scenarios.js'
import { classify, mean } from './stats.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import fs from 'node:fs'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const mazeArg = arg('maze', 'both')
const mazes = mazeArg === 'both' ? ['A', 'B'] : [mazeArg.toUpperCase()]
const outPath = arg('out', null)

console.log(`Firepit cost: ${BALANCE.STRUCTURES.FIRE_SPECIAL.cost} (original test measured against 8)`)
console.log(`Watchtower cost: ${BALANCE.STRUCTURES.WATCHTOWER.cost} (original test measured against 6)`)

// Same worst-case imputation rule as fusionRoster.js: a hung run's score is
// imputed at the observed minimum of its OWN arm's live cells for this maze.
function imputeHangs(liveScores, hangCount) {
  if (!liveScores.length) return liveScores
  const lo = Math.min(...liveScores)
  return liveScores.concat(new Array(hangCount).fill(lo))
}

function pairedSignCounts(controlByCell, armByCell) {
  let better = 0, worse = 0, tied = 0
  for (const [k, cScore] of controlByCell) {
    if (!armByCell.has(k)) continue
    const aScore = armByCell.get(k)
    if (aScore > cScore) better++
    else if (aScore < cScore) worse++
    else tied++
  }
  return { better, worse, tied }
}

const results = { generatedAt: new Date().toISOString(), mazes: {} }

for (const mazeName of mazes) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ maze })
  const half = Math.floor(scenarios.length / 2)
  console.log(`\n=== MAZE ${mazeName} — wall row ${maze.wallRow}, lanes ${maze.gaps.join('/')} ===`)

  const arms = { watchtower: [], firepit: [] }
  const armCells = { watchtower: new Map(), firepit: new Map() }
  const hangs = { watchtower: 0, firepit: 0 }
  let firepitTargetSeconds = 0, firepitActiveTicks = 0

  const t0 = Date.now()
  scenarios.forEach(s => {
    const key = `${s.seed}:${s.postGap}`
    const common = { ...s, fuse: false, freeSpecial: false, spendDown: true }

    const mTower = runMatch({ ...common, defence: STRUCTURE_TYPES.WATCHTOWER })
    const mFire = runMatch({ ...common, defence: STRUCTURE_TYPES.FIRE_SPECIAL })

    if (mTower.timedOut || mTower.stalled) hangs.watchtower++
    else { arms.watchtower.push(mTower.score); armCells.watchtower.set(key, mTower.score) }

    if (mFire.timedOut || mFire.stalled) hangs.firepit++
    else {
      arms.firepit.push(mFire.score); armCells.firepit.set(key, mFire.score)
      firepitTargetSeconds += mFire.aoeEnemySeconds ?? 0
      firepitActiveTicks += mFire.aoeActiveTicks ?? 0
    }
  })

  const cw = classify([arms.watchtower, arms.firepit])
  const impTower = imputeHangs(arms.watchtower, hangs.watchtower)
  const impFire = imputeHangs(arms.firepit, hangs.firepit)
  const cwImp = classify([impTower, impFire])

  const firstHalfKeys = new Set(scenarios.slice(0, half).map(s => `${s.seed}:${s.postGap}`))
  const splitArm = (cellMap) => {
    const a = [], b = []
    for (const [k, v] of cellMap) (firstHalfKeys.has(k) ? a : b).push(v)
    return [a, b]
  }
  const [twA, twB] = splitArm(armCells.watchtower)
  const [fiA, fiB] = splitArm(armCells.firepit)
  const split = { half1: classify([twA, fiA]), half2: classify([twB, fiB]) }
  const agree = Math.sign(split.half1.means[1] - split.half1.means[0]) ===
    Math.sign(split.half2.means[1] - split.half2.means[0])

  const signs = pairedSignCounts(armCells.watchtower, armCells.firepit)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`[${elapsed}s]`)
  console.log(`  hangs: watchtower ${hangs.watchtower}/144  firepit ${hangs.firepit}/144`)
  console.log(`  score: watchtower ${cw.means[0].toFixed(3)}  firepit ${cw.means[1].toFixed(3)}`)
  console.log(`  diff: ${(cw.means[1] - cw.means[0]).toFixed(3)} (t ${cw.t === Infinity ? 'inf' : cw.t.toFixed(2)}) — ${signs.better} better / ${signs.worse} worse / ${signs.tied} tied`)
  console.log(`  imputed diff: ${(cwImp.means[1] - cwImp.means[0]).toFixed(3)} (t ${cwImp.t === Infinity ? 'inf' : cwImp.t.toFixed(2)})`)
  console.log(`  split-half agree: ${agree} (half1 ${(split.half1.means[1] - split.half1.means[0]).toFixed(3)}, half2 ${(split.half2.means[1] - split.half2.means[0]).toFixed(3)})`)
  console.log(`  firepit aoeEnemySeconds total: ${firepitTargetSeconds.toFixed(1)}  activeTicks total: ${firepitActiveTicks}`)

  results.mazes[mazeName] = {
    hangs,
    watchtowerMean: mean(arms.watchtower), firepitMean: mean(arms.firepit),
    diff: cw.means[1] - cw.means[0], t: cw.t, signs,
    imputed: { diff: cwImp.means[1] - cwImp.means[0], t: cwImp.t },
    splitHalf: { half1: split.half1.means[1] - split.half1.means[0], half2: split.half2.means[1] - split.half2.means[0], agree },
    firepitAoeEnemySeconds: firepitTargetSeconds, firepitAoeActiveTicks: firepitActiveTicks,
  }
}

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nwritten: ${outPath}`)
}
