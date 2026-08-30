#!/usr/bin/env node
// Task 20 step 1 — full six-fusion hang gate + tower-baseline-retake, extended.
//
// The published tower baseline (2026-07-25) and its retake (2026-08-01) both
// measured MAGMA_TRAP only: the harness human is hardcoded EARTH, and the
// build policy fuses the human's own free special with the first pairable bot
// element, so an EARTH human can only ever reach EARTH,FIRE. `humanElement`
// (added for the Task 16 Steam Vent gate) and `fuseWith` (added earlier, see
// matchRunner.js ~line 241) together make all six pairs reachable — this
// script is the first time they have been driven across the FULL roster in
// one paired-arms sweep, on both mazes, with the SAME method the two prior
// baselines used: {fuse:false} vs {fuse:true,fuseWave:1} vs
// {fuse:true,fuseWave:4}, paired per-cell (144 = 72 seeds x 2 posts),
// analyzed with the project's existing Welch-t + hang-imputation + split-half
// machinery (stats.js), not a new statistic invented for this script.
//
// NOT a test file (no .test.js suffix) — same convention as probe.js.
//
// Usage: node test/harness/fusionRoster.js [--maze A|B|both] [--out path.json]

import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify, mean, pairedDeltas, pairedT, signTest, T_CRIT } from './stats.js'
import fs from 'node:fs'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

// element pair -> { human, partner } needed to reach it. The free special is
// always the human's own element (economy.js); `fuseWith` names the bought
// partner. Two of the three ways to reach each pair are equivalent (order of
// human/partner doesn't change which combo forms — comboKey sorts), so one
// arbitrary assignment per fusion is enough.
const FUSIONS = [
  { name: 'MAGMA_TRAP', human: 'EARTH', partner: 'FIRE' },
  { name: 'MUDDY_BOG',  human: 'EARTH', partner: 'WATER' },
  { name: 'GRINDER',    human: 'EARTH', partner: 'WIND' },
  { name: 'STEAM_VENT', human: 'FIRE',  partner: 'WATER' },
  { name: 'FIRESTORM',  human: 'FIRE',  partner: 'WIND' },
  { name: 'BLIZZARD',   human: 'WATER', partner: 'WIND' },
]

const mazeArg = arg('maze', 'both')
const mazes = mazeArg === 'both' ? ['A', 'B'] : [mazeArg.toUpperCase()]
const outPath = arg('out', null)
// Task 20 flank-siting instrument fix: where the human's free special (and
// therefore every fusion, built directly on top of it) is sited. 'tower'
// (default) reproduces every number in the 2026-08-02 sweep byte-for-byte;
// 'funnel' is the A/B arm — see docs/handoffs/2026-08-02-task20-fusion-
// siting-instrument-fix.md.
const sitingArg = arg('siting', 'tower')
const freeSpecialSites = sitingArg === 'funnel' ? 'funnel' : null
// `--protocol isolated` switches to the disjoint-column-band site lists
// (matchRunner.js). The legacy default is kept so the 2026-08-02 sweep stays
// reproducible, but it is NOT trustworthy on maze A: under it the free
// special's 2-wide footprint decides which towerSite the policy's blocking
// Watchtower falls back to, worth up to ~1.2 score points on its own, and the
// 2x2 fusion arm displaces one more tower than its own 2x1 control arm. Any
// NEW measurement should pass --protocol isolated. See
// docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md.
const sitingProtocol = arg('protocol', null) === 'isolated' ? 'isolated' : null
const onlyArg = arg('only', null)
const activeFusions = onlyArg ? FUSIONS.filter(f => f.name === onlyArg.toUpperCase()) : FUSIONS

// Impute a hung run's score at the observed minimum of its OWN arm's live
// cells for this fusion+maze — same worst-case rule probe.js applies per dial
// value (elementia-baseline-review-lessons: an effect that collapses under
// this is not established).
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

const results = { generatedAt: new Date().toISOString(), siting: sitingArg, protocol: sitingProtocol || 'legacy', mazes: {} }

for (const mazeName of mazes) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ maze })
  const half = Math.floor(scenarios.length / 2)
  console.log(`\n=== MAZE ${mazeName} — wall row ${maze.wallRow}, lanes ${maze.gaps.join('/')} — siting=${sitingArg} ===`)
  results.mazes[mazeName] = {}

  for (const f of activeFusions) {
    const t0 = Date.now()
    const arms = { control: [], wave1: [], wave4: [] }
    const armCells = { control: new Map(), wave1: new Map(), wave4: new Map() }
    const hangs = { control: 0, wave1: 0, wave4: 0 }
    let wave1Mismatch = 0, wave4Mismatch = 0
    let wave1Built = 0, wave4Built = 0

    scenarios.forEach((s, i) => {
      const key = `${s.seed}:${s.postGap}`
      const mControl = runMatch({ ...s, fuse: false, humanElement: f.human, freeSpecialSites, sitingProtocol })
      const mWave1 = runMatch({ ...s, fuse: true, fuseWave: 1, humanElement: f.human, fuseWith: f.partner, freeSpecialSites, sitingProtocol })
      const mWave4 = runMatch({ ...s, fuse: true, fuseWave: 4, humanElement: f.human, fuseWith: f.partner, freeSpecialSites, sitingProtocol })

      if (mControl.timedOut || mControl.stalled) hangs.control++
      else { arms.control.push(mControl.score); armCells.control.set(key, mControl.score) }

      if (mWave1.timedOut || mWave1.stalled) hangs.wave1++
      else {
        arms.wave1.push(mWave1.score); armCells.wave1.set(key, mWave1.score)
        if (mWave1.comboFormed) { wave1Built++; if (mWave1.comboFormed !== f.name) wave1Mismatch++ }
      }

      if (mWave4.timedOut || mWave4.stalled) hangs.wave4++
      else {
        arms.wave4.push(mWave4.score); armCells.wave4.set(key, mWave4.score)
        if (mWave4.comboFormed) { wave4Built++; if (mWave4.comboFormed !== f.name) wave4Mismatch++ }
      }
    })

    const cw1 = classify([arms.control, arms.wave1])
    const cw4 = classify([arms.control, arms.wave4])

    const impControl1 = imputeHangs(arms.control, hangs.control)
    const impWave1 = imputeHangs(arms.wave1, hangs.wave1)
    const impWave4 = imputeHangs(arms.wave4, hangs.wave4)
    const cw1Imp = classify([impControl1, impWave1])
    const cw4Imp = classify([impControl1, impWave4])

    // Split-half: same comparison recomputed on disjoint seed halves. No rank
    // agreement is meaningful over a 2-point series, so report both halves'
    // sign/t directly and call it replicated iff both halves agree in sign
    // AND neither flips the other's t>2 significance call outright.
    const firstHalfKeys = new Set(scenarios.slice(0, half).map(s => `${s.seed}:${s.postGap}`))
    const splitArm = (cellMap) => {
      const a = [], b = []
      for (const [k, v] of cellMap) (firstHalfKeys.has(k) ? a : b).push(v)
      return [a, b]
    }
    const [c1a, c1b] = splitArm(armCells.control)
    const [w1a, w1b] = splitArm(armCells.wave1)
    const [w4a, w4b] = splitArm(armCells.wave4)
    const splitW1 = { half1: classify([c1a, w1a]), half2: classify([c1b, w1b]) }
    const splitW4 = { half1: classify([c1a, w4a]), half2: classify([c1b, w4b]) }
    const agree = (s) => Math.sign(s.half1.means[1] - s.half1.means[0]) === Math.sign(s.half2.means[1] - s.half2.means[0])

    const signsW1 = pairedSignCounts(armCells.control, armCells.wave1)
    const signsW4 = pairedSignCounts(armCells.control, armCells.wave4)

    // The arms above are run over the SAME scenario keys, so the Welch t in
    // `classify` is throwing the pairing away (see stats.js's header). Report
    // the paired t and the exact sign test alongside it rather than replacing
    // it: every published baseline in this project used the unpaired form, and
    // silently redefining it would change what those numbers mean without
    // re-running any of them. `disagree` flags the cells where the choice of
    // statistic actually changes the verdict — those are the ones to read
    // before tuning anything.
    const pairW1 = pairedT(pairedDeltas(armCells.control, armCells.wave1))
    const pairW4 = pairedT(pairedDeltas(armCells.control, armCells.wave4))
    const stW1 = signTest(signsW1.better, signsW1.worse)
    const stW4 = signTest(signsW4.better, signsW4.worse)
    const verdicts = (welchT, paired, st) =>
      [welchT > T_CRIT, Math.abs(paired.t) > T_CRIT, st.p < 0.05]
    const disagree = (welchT, paired, st) => new Set(verdicts(welchT, paired, st)).size > 1
    const dW1 = disagree(cw1.t, pairW1, stW1)
    const dW4 = disagree(cw4.t, pairW4, stW4)

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`\n-- ${f.name} (${f.human}+${f.partner}, human=${f.human}) [${elapsed}s] --`)
    console.log(`  hangs: control ${hangs.control}/144  wave1 ${hangs.wave1}/144  wave4 ${hangs.wave4}/144`)
    console.log(`  combo check: wave1 built ${wave1Built}, mismatched ${wave1Mismatch} | wave4 built ${wave4Built}, mismatched ${wave4Mismatch}`)
    console.log(`  wave1: ${cw1.means[1] - cw1.means[0] >= 0 ? '+' : ''}${(cw1.means[1] - cw1.means[0]).toFixed(3)} (t ${cw1.t === Infinity ? 'inf' : cw1.t.toFixed(2)}) — ${signsW1.better} better / ${signsW1.worse} worse / ${signsW1.tied} tied`)
    console.log(`    imputed: ${(cw1Imp.means[1] - cw1Imp.means[0]).toFixed(3)} (t ${cw1Imp.t === Infinity ? 'inf' : cw1Imp.t.toFixed(2)}) | split-half agree: ${agree(splitW1)}`)
    console.log(`    paired t ${pairW1.t.toFixed(2)} | sign test p ${stW1.p.toFixed(4)} (n ${stW1.n})${dW1 ? '  <-- STATISTICS DISAGREE' : ''}`)
    console.log(`  wave4: ${cw4.means[1] - cw4.means[0] >= 0 ? '+' : ''}${(cw4.means[1] - cw4.means[0]).toFixed(3)} (t ${cw4.t === Infinity ? 'inf' : cw4.t.toFixed(2)}) — ${signsW4.better} better / ${signsW4.worse} worse / ${signsW4.tied} tied`)
    console.log(`    imputed: ${(cw4Imp.means[1] - cw4Imp.means[0]).toFixed(3)} (t ${cw4Imp.t === Infinity ? 'inf' : cw4Imp.t.toFixed(2)}) | split-half agree: ${agree(splitW4)}`)
    console.log(`    paired t ${pairW4.t.toFixed(2)} | sign test p ${stW4.p.toFixed(4)} (n ${stW4.n})${dW4 ? '  <-- STATISTICS DISAGREE' : ''}`)

    results.mazes[mazeName][f.name] = {
      human: f.human, partner: f.partner,
      hangs,
      combo: { wave1Built, wave1Mismatch, wave4Built, wave4Mismatch },
      wave1: { effect: cw1.means[1] - cw1.means[0], t: cw1.t, signs: signsW1,
        pairedT: pairW1.t, signTestP: stW1.p, signTestN: stW1.n, statsDisagree: dW1,
        imputed: { effect: cw1Imp.means[1] - cw1Imp.means[0], t: cw1Imp.t },
        splitHalf: { half1: splitW1.half1.means[1] - splitW1.half1.means[0], half2: splitW1.half2.means[1] - splitW1.half2.means[0], agree: agree(splitW1) } },
      wave4: { effect: cw4.means[1] - cw4.means[0], t: cw4.t, signs: signsW4,
        pairedT: pairW4.t, signTestP: stW4.p, signTestN: stW4.n, statsDisagree: dW4,
        imputed: { effect: cw4Imp.means[1] - cw4Imp.means[0], t: cw4Imp.t },
        splitHalf: { half1: splitW4.half1.means[1] - splitW4.half1.means[0], half2: splitW4.half2.means[1] - splitW4.half2.means[0], agree: agree(splitW4) } },
      controlMean: mean(arms.control), wave1Mean: mean(arms.wave1), wave4Mean: mean(arms.wave4),
    }
  }
}

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nwritten: ${outPath}`)
}
