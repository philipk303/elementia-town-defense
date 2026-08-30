#!/usr/bin/env node
// Sweep ONE balance dial across the scenario matrix and print what happened.
//
// This script deliberately has NO pass criterion and NEVER prints "VERIFIED".
// The version of it in the rejected Phase 8A plan had a detector that could not
// fire on the shape it was written to detect, swept a key that did not exist,
// and printed PHASE 8A VERIFIED. A gate that cannot fail is worse than none.
//
// Usage:
//   npm run probe -- --dial AGGRO.STICKY_MS --values 500,1500,3000,4500,6000
//   npm run probe -- --dial COST_FIELD.WALL_ENTRY_COST.1 --values 5,15,30,45,60
//   npm run probe -- --dial __NULL_DIAL --values 1,2,3   (control: expect NO SIGNAL)
//
// Options:
//   --maxWaves N   stop each match after N cleared waves (default: full 10)
//   --seeds a,b,c  override the seed list
//   --profile M    per-wave ramp table: shipped (default) | all | none
//   --maze A|B     layout: A = shipped near-center lanes, B = flank lanes
//                  (external validity — every 8A number so far is from maze A)

import { BALANCE } from '../../shared/balance.js'
import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveDial, resolveMaze, SEEDS } from './scenarios.js'
import { classify, mean, sd, rankAgreement, roughness } from './stats.js'
import { aggregateWaveProfile } from './profile.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const dialPath = arg('dial')
const valuesRaw = arg('values')
if (!dialPath || !valuesRaw) {
  console.error('usage: npm run probe -- --dial <BALANCE.PATH> --values <v1,v2,...>')
  process.exit(2)
}
const values = valuesRaw.split(',').map(Number)
const maxWaves = arg('maxWaves') ? Number(arg('maxWaves')) : undefined
const seeds = arg('seeds') ? arg('seeds').split(',').map(Number) : SEEDS

// __NULL_DIAL is the control: create it so resolveDial finds it, and assert
// nothing reads it.
if (dialPath === '__NULL_DIAL') BALANCE.__NULL_DIAL = values[0]

const { obj, key } = resolveDial(BALANCE, dialPath)   // throws on a missing dial
const original = obj[key]

const maze = resolveMaze(arg('maze', 'A'))
const scenarios = scenarioMatrix({ seeds, maze, maxWaves })
console.log(`dial:      ${dialPath}`)
console.log(`maze:      ${arg('maze', 'A').toUpperCase()} — wall row ${maze.wallRow}, lanes ${maze.gaps.join('/')}`)
console.log(`values:    ${values.join(', ')}`)
console.log(`scenarios: ${scenarios.length} (${seeds.length} seeds x 2 posts)`)
console.log(`matches:   ${scenarios.length * values.length}`)
console.log('')

// Every metric the sweep tracks, in one place — this is what "generalizing
// the hang-imputation/split-half treatment" (Task 3b) means in practice: a
// metric only needs a `get(m)` accessor here to receive the exact same
// hang-exclusion, worst-case-imputation and split-half-replication treatment
// `score` always had. `score` and `enemySeconds` are the two pre-Task-3b
// metrics (enemySeconds previously got classify() but not the hang/split-half
// checks below — it now gets the full treatment too); the rest are the Task 3
// source-tagged combat instrument (combatStats.js) surfaced through
// matchRunner.js. Their per-match values are already run-level aggregates, so
// each cell here is one number per scenario, same shape as `score`.
const METRICS = [
  { key: 'score', label: 'score', get: m => m.score, decimals: 3 },
  { key: 'enemySeconds', label: 'enemy-sec', get: m => m.enemySeconds, decimals: 1, exploratory: true },
  { key: 'ccSeconds', label: 'cc-sec', get: m => m.combat.ccSeconds, decimals: 1, exploratory: true },
  { key: 'displacement', label: 'displacement', get: m => m.combat.totalDisplacement, decimals: 0, exploratory: true },
  { key: 'structureDamage', label: 'struct-dmg', get: m => m.combat.byCategory.structure.damage, decimals: 1, exploratory: true },
]

const rows = []
const profiles = new Map() // per dial value: the aggregated per-wave ramp
const cells = new Map(METRICS.map(mt => [mt.key, []]))     // per dial value: per-scenario samples
const halfACells = new Map(METRICS.map(mt => [mt.key, []])) // first half of the seeds
const halfBCells = new Map(METRICS.map(mt => [mt.key, []])) // second half — split-half replication
const t0 = Date.now()
let totalHangs = 0
for (const v of values) {
  obj[key] = v
  const rowCells = new Map(METRICS.map(mt => [mt.key, []]))
  const rowHalfA = new Map(METRICS.map(mt => [mt.key, []]))
  const rowHalfB = new Map(METRICS.map(mt => [mt.key, []]))
  const all = []
  let wins = 0, hangs = 0
  scenarios.forEach((s, i) => {
    const m = runMatch(s)
    // The ramp keeps the completed waves of a hung run — waves 1-8 of a run
    // that froze at wave 9 were played honestly. Only the fragment of the wave
    // it froze inside is dropped, by aggregateWaveProfile.
    all.push(m)
    // A hung run (detected stall or a genuine tick-cap overrun) is not an
    // outcome the sim decided — it must never enter the mean/sd/min/max, and
    // it must never be rescored as a loss (that would invent an outcome the
    // sim never produced). Count it, then drop it — for every metric, since
    // the exclusion is a property of the SCENARIO, not of any one metric.
    if (m.timedOut || m.stalled) { hangs++; return }
    for (const mt of METRICS) {
      const val = mt.get(m)
      rowCells.get(mt.key).push(val)
      // Split-half: scenarios are seed-major, so the first half is the first
      // 36 seeds and the second half the last 36. Disjoint seed sets.
      ;(i < scenarios.length / 2 ? rowHalfA : rowHalfB).get(mt.key).push(val)
    }
    if (m.won) wins++
  })
  totalHangs += hangs
  profiles.set(v, aggregateWaveProfile(all))
  for (const mt of METRICS) {
    cells.get(mt.key).push(rowCells.get(mt.key))
    halfACells.get(mt.key).push(rowHalfA.get(mt.key))
    halfBCells.get(mt.key).push(rowHalfB.get(mt.key))
  }
  const scores = rowCells.get('score')
  const enemySecs = rowCells.get('enemySeconds')
  rows.push({
    v,
    mean: mean(scores), sd: sd(scores),
    min: scores.length ? Math.min(...scores) : NaN,
    max: scores.length ? Math.max(...scores) : NaN,
    // Among COMPLETED runs. Dividing by scenarios.length would drop hangs from
    // the numerator while keeping them in the denominator, deflating win% by
    // the hang rate — and since hang rate varies with the dial, deflating it
    // NON-UNIFORMLY across rows. That biases win% and score in OPPOSITE
    // directions within the same printed row.
    winRate: scores.length ? wins / scores.length : NaN,
    enemySec: enemySecs.length ? mean(enemySecs) : NaN,
    hangs, total: scenarios.length,
    scores,
  })
  console.log(
    `${String(v).padStart(10)} | score ${rows.at(-1).mean.toFixed(3)}` +
    ` +/- ${rows.at(-1).sd.toFixed(3)}` +
    ` | range ${rows.at(-1).min.toFixed(2)}-${rows.at(-1).max.toFixed(2)}` +
    ` | win ${(rows.at(-1).winRate * 100).toFixed(0)}%` +
    ` | enemy-s ${rows.at(-1).enemySec.toFixed(0)}` +
    ` | hangs ${hangs}/${scenarios.length}`)
}
obj[key] = original
if (dialPath === '__NULL_DIAL') delete BALANCE.__NULL_DIAL

// Back-compat locals for the sections below that predate the METRICS table.
const scoreCells = cells.get('score')
const enemySecCells = cells.get('enemySeconds')

// --- the difficulty ramp ---
//
// The score is TERMINAL, so it cannot see the shape of the match that produced
// it: an empty first four waves and a tense first four waves score identically
// if the run ends the same way. The table above is the endpoint; this is the
// curve. Printed for the SHIPPED value of the dial (or the first swept value if
// the shipped one is not in the sweep) so the ramp reported is the ramp the
// game currently has; `--profile all` prints every value's curve.
//
// closest = mean over the run of the nearest an enemy ever got to the hall.
// It is the tension metric hall HP cannot supply: hall HP cannot distinguish
// "something nearly got through" from "nothing crossed the wall line", and it
// is flat at 1.000 for the entire early game.
const profileMode = arg('profile', 'shipped')
const refValue = values.includes(original) ? original : values[0]
const shown = profileMode === 'all' ? values : profileMode === 'none' ? [] : [refValue]

for (const v of shown) {
  const p = profiles.get(v)
  console.log('')
  console.log(`ramp @ ${dialPath} = ${v}${v === original ? '  (shipped)' : ''}` +
    `   dead waves: ${p.deadWaves}/${p.waves.length}`)
  console.log('  wave |   n | enemy-s | struct | downs | hallDmg | closest | dead')
  for (const w of p.waves) {
    console.log(
      `  ${String(w.wave).padStart(4)} | ${String(w.n).padStart(3)}` +
      ` | ${w.enemySeconds.toFixed(0).padStart(7)}` +
      ` | ${w.structuresLost.toFixed(2).padStart(6)}` +
      ` | ${w.playerDowns.toFixed(2).padStart(5)}` +
      ` | ${w.hallDamage.toFixed(3).padStart(7)}` +
      ` | ${(Number.isFinite(w.closestApproachPx) ? w.closestApproachPx.toFixed(0) : '-').padStart(7)}` +
      ` | ${w.dead ? 'DEAD' : ''}`)
  }
  console.log('  n shrinks with wave number — every row is conditional on reaching it.')
  console.log('  DEAD = not one run in the cell took a down, a lost structure or hall damage.')
}

// --- interpretation (no pass/fail) ---
//
// Two metrics, both reported, neither privileged by default:
//
//   score        = wavesCleared + hallHpFrac. What a player experiences, but a
//                  coarse near-integer endpoint: ~3 points of range against
//                  ~1.1 of scenario noise.
//   enemy-sec    = integral of living enemy count over fight time. No direct
//                  gameplay meaning, but it integrates the whole match instead
//                  of sampling its last moment, so it resolves far smaller
//                  changes. On the 2026-07-25 calibration run it moved
//                  monotonically while `score` could not resolve anything.
//
// A dial that moves enemy-sec but not score is a real effect too small to
// change the outcome. That is a finding, not a null result — say which.

const scoreC = classify(scoreCells)
const enemyC = classify(enemySecCells)

const report = (label, c, dp) => {
  console.log(`${label.padEnd(11)} effect ${c.effect.toFixed(dp)}` +
    ` | se ${c.se.toFixed(dp)} | t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)}` +
    ` | rho ${c.rho.toFixed(2)}`)
  console.log(`${''.padEnd(11)} ${c.signal}`)
}

console.log('')
console.log(`noise floor (mean within-cell score sd): ${scoreC.noise.toFixed(3)}`)
console.log(`cells per dial value: ${scenarios.length} (minus hangs)`)
console.log('')
report('score', scoreC, 3)
// enemySeconds is EXPLORATORY, not co-primary: it has no declared minimum
// effect and no power calculation, so a null on it does not say what effect was
// excluded. It is also near-circular for an enemy-HP dial (more HP mechanically
// means more enemy-seconds). Print the numbers, withhold the verdict.
console.log(`enemy-sec   effect ${enemyC.effect.toFixed(1)} | se ${enemyC.se.toFixed(1)}` +
  ` | t ${enemyC.t === Infinity ? 'inf' : enemyC.t.toFixed(2)} | rho ${enemyC.rho.toFixed(2)}` +
  '   [exploratory — no declared minimum effect]')
// The Task 3 combat metrics (CC-seconds, displacement, structure damage) are
// exploratory in the same sense as enemy-sec: no declared minimum effect, no
// power calc. They exist so a redesign sweep can say WHY a dial moved score —
// e.g. "score didn't move but CC-seconds did" separates "no effect" from "an
// effect that never reached the win condition."
for (const mt of METRICS) {
  if (mt.key === 'score' || mt.key === 'enemySeconds') continue
  const c = classify(cells.get(mt.key))
  console.log(`${mt.label.padEnd(12)} effect ${c.effect.toFixed(mt.decimals)} | se ${c.se.toFixed(mt.decimals)}` +
    ` | t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)} | rho ${c.rho.toFixed(2)}` +
    '   [exploratory — no declared minimum effect]')
}

// --- hang-exclusion sensitivity + split-half replication, EVERY metric -----
//
// Hangs are dropped from the mean, and hang RATE varies with the dial (at
// BOT.ENGAGE_RANGE_PX 260 it is 0/144, at 650 it is 15/144). That makes the
// exclusion non-random: it removes runs where the horde never resolved, which
// are not runs that were heading for a win. So the exclusion can inflate a
// cell mean in proportion to its hang rate, and a dial-correlated hang rate can
// MANUFACTURE or MASK a trend.
//
// Worst-case bound: re-impute every hung run at its own cell's observed
// minimum. This is deliberately pessimistic — a hang is not necessarily the
// worst outcome — but an effect that survives it is not an artifact of the
// exclusion. An effect that collapses under it is not established.
//
// Split-half: rank the dial values using the first 36 seeds, then again using
// the last 36, and correlate. A real shape replicates across disjoint seed
// sets; noise does not.
//
// Task 3b generalizes both checks from `score`-only to every metric in
// METRICS — a combat metric that moves under a dial sweep but doesn't survive
// hang imputation or split-half is exactly as suspect as `score` would be.
const hangSplit = new Map()
for (const mt of METRICS) {
  const c = cells.get(mt.key)
  const imputed = c.map((cell, i) => {
    if (!cell.length) return cell
    const lo = Math.min(...cell)
    return cell.concat(new Array(rows[i].hangs).fill(lo))
  })
  const impC = classify(imputed)
  const meansA = halfACells.get(mt.key).map(cell => (cell.length ? mean(cell) : null))
  const meansB = halfBCells.get(mt.key).map(cell => (cell.length ? mean(cell) : null))
  const bothLive = meansA.map((a, i) => [a, meansB[i]]).filter(p => p[0] !== null && p[1] !== null)
  const splitRho = rankAgreement(bothLive.map(p => p[0]), bothLive.map(p => p[1]))
  hangSplit.set(mt.key, { impC, splitRho })
}
const { impC, splitRho } = hangSplit.get('score')

console.log('')
console.log(`hang sensitivity (hungs imputed at cell min): effect ${impC.effect.toFixed(3)}` +
  ` | t ${impC.t === Infinity ? 'inf' : impC.t.toFixed(2)} | rho ${impC.rho.toFixed(2)}`)
console.log(`  ${scoreC.t > 2 && impC.t <= 2
  ? 'WARNING: the score signal does NOT survive worst-case hang imputation.'
  : scoreC.t > 2
    ? 'the score signal survives worst-case hang imputation.'
    : 'no score signal to test.'}`)
console.log(`split-half rank agreement (seeds 1-36 vs 37-72): rho ${splitRho.toFixed(2)}`)
console.log(`  ${!Number.isFinite(splitRho)
  ? 'not computable — a shape needs at least two live cells to have an ordering.'
  : splitRho >= 0.9
  ? 'the shape replicates across disjoint seed sets.'
  : splitRho >= 0.5
    ? 'the shape PARTIALLY replicates — treat the ordering as provisional.'
    : 'the shape does NOT replicate — the ordering is not distinguishable from noise.'}`)

console.log('')
console.log('per-metric hang-imputation + split-half (score above; every other metric here):')
for (const mt of METRICS) {
  if (mt.key === 'score') continue
  const c = classify(cells.get(mt.key))
  const hs = hangSplit.get(mt.key)
  console.log(`  ${mt.label.padEnd(12)} t ${c.t === Infinity ? 'inf' : c.t.toFixed(2)}` +
    ` -> imputed-t ${hs.impC.t === Infinity ? 'inf' : hs.impC.t.toFixed(2)}` +
    ` | split-rho ${Number.isFinite(hs.splitRho) ? hs.splitRho.toFixed(2) : 'n/a'}`)
}

// --- the roughness verdict (baseline section 4.1) ---
const rough = roughness(scoreCells, {
  splitRho, survivesImputation: scoreC.t > 2 && impC.t > 2,
})
console.log('')
console.log(`roughness: ${rough.significantSteps} step(s) above 2 SE,` +
  ` ${rough.signChanges} sign change(s), split-half rho ${splitRho.toFixed(2)}`)
console.log(`  ${rough.verdict}`)

// T_CRIT is fixed at 2 (~the two-sided 5% point for n >= 30). Warn rather than
// silently over-claim when a cell is too small for that to hold.
const smallest = Math.min(...scoreCells.map(c => c.length))
if (smallest < 30) {
  console.log(`  NOTE: smallest cell is n=${smallest}; t=2 is permissive below n=30.`)
}

const moved = scoreC.t > 2 || enemyC.t > 2
console.log('')
console.log(`reading: ${
  !rough.comparable
    ? 'ONE value swept — this run measured the ramp, not the dial. ' +
      'No claim about the dial is available from it.'
    : !moved
      ? 'this dial did not measurably move the game on either metric.'
      : scoreC.t > 2
        ? 'this dial moves the outcome players experience.'
        : 'this dial measurably changes the fight but NOT the outcome — ' +
          'a real effect too small to change who wins.'
}`)
console.log(`hangs: ${totalHangs}/${scenarios.length * values.length} cells ` +
  '(excluded from mean/sd/min/max above, not rescored as losses)')
console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
console.log('')
console.log('This script has no pass criterion by design. Read the table.')
