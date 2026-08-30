#!/usr/bin/env node
// WATCHTOWER MARGINAL VALUE — does the A1.4 "1.0 power unit" anchor saturate?
//
// WHY THIS EXISTS
//
// Amendment A1.4 (docs/superpowers/specs/2026-07-25-combat-structure-redesign.md
// lines 585-613) prices every elemental fusion against a WATCHTOWER: "1.0 power
// unit = the measured score contribution of one WATCHTOWER at its shipped cost,
// in the same maze and placement". A fusion costs ~15-16 gold (two specials)
// against a Watchtower's 6, so at equal gold it must beat ~2.7 Watchtowers out
// of a single footprint.
//
// That bar is only FAIR if Watchtower value per unit SATURATES as the count
// rises. If N Watchtowers deliver ~N times the value of one, then on any
// linearly-scaling axis the cheap structure wins at equal gold by construction,
// and no amount of tuning can ever make the fusion tier clear A1.4(a). Nobody
// has measured the shape of that curve. This script measures it.
//
// It sweeps `defenceCap` (matchRunner.js, added with this script) from 1 to 6
// with `defence: WATCHTOWER, spendDown: true, sitingProtocol: 'isolated'`, over
// the full 72-seed x 2-post matrix on both mazes.
//
// NO PASS CRITERION ON THE GAME. Per the probe.js convention this script never
// prints VERIFIED and passes no judgement on the game's balance. It reports
// numbers that support one call about the MEASUREMENT PREMISE (is the anchor
// linear or saturating), nothing more.
//
// PROTOCOL NOTES
//   fuse: false, freeSpecial: false   the Watchtower must be the only thing that
//         varies. A fusion in the arm competes for the same gold and adds a
//         second structure whose value is exactly what A1.4 is trying to price.
//         Same shape as the Rock Trap / Firepit standalone measurements.
//   sitingProtocol: 'isolated'  pins the Watchtower column (gap-1, depth 1..6 =
//         12 sites), so N=6 is well inside the site pool on both mazes and the
//         cap, not geometry, is what binds.
//   maxWaves is FIXED across every N arm, so no arm faces a different amount of
//         content than another.
//
// NOT a test file (no .test.js suffix) — it runs matches; `npm test` must not.
//
// Usage:
//   node test/harness/watchtowerMarginal.js [--maze A|B|both] [--caps 1,2,3,4,5,6]
//                                           [--seeds a,b,c] [--maxWaves N]
//                                           [--out path.json]

import fs from 'node:fs'
import { runMatch } from './matchRunner.js'
import { scenarioMatrix, resolveMaze, SEEDS } from './scenarios.js'
import { classify, mean, sd, pairedT, signTest } from './stats.js'
import { STRUCTURE_TYPES } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const mazeArg = arg('maze', 'both')
const mazes = mazeArg === 'both' ? ['A', 'B'] : [mazeArg.toUpperCase()]
const caps = (arg('caps', '1,2,3,4,5,6')).split(',').map(Number)
const seeds = arg('seeds') ? arg('seeds').split(',').map(Number) : SEEDS
const maxWaves = Number(arg('maxWaves', String(BALANCE.WAVE_COUNT)))
const outPath = arg('out', null)

// --- statistics not already in stats.js --------------------------------------
// Two-sided p from a t statistic (regularised incomplete beta). Lifted verbatim
// from pairedReread.mjs rather than re-derived; stats.js is deliberately left
// untouched because every published baseline was taken against it as-is.
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]
  let y = x, tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) ser += c[j] / ++y
  return -tmp + Math.log(2.5066282746310005 * ser / x)
}
function betacf(a, bb, x) {
  const FPMIN = 1e-300, EPS = 3e-14
  const qab = a + bb, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - qab * x / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m
    let aa = m * (bb - m) * x / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d; h *= d * c
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}
function ibeta(a, bb, x) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(logGamma(a + bb) - logGamma(a) - logGamma(bb) + a * Math.log(x) + bb * Math.log(1 - x))
  return x < (a + 1) / (a + bb + 2) ? bt * betacf(a, bb, x) / a : 1 - bt * betacf(bb, a, 1 - x) / bb
}
const tTwoSided = (t, df) => (!Number.isFinite(t) ? (t === 0 ? 1 : 0)
  : df <= 0 ? NaN : ibeta(df / 2, 0.5, df / (df + t * t)))

// Benjamini-Hochberg, q=0.05, family = one output file. Same implementation as
// pairedReread.mjs. Marks `<key>BH` and `<key>Q` on each row.
function bhMark(list, key, alpha = 0.05) {
  const g = list.filter(r => Number.isFinite(r[key]))
  if (!g.length) return
  const ord = [...g].sort((x, y) => x[key] - y[key])
  const m = ord.length
  let kMax = -1
  for (let k = 0; k < m; k++) if (ord[k][key] <= ((k + 1) / m) * alpha) kMax = k
  ord.forEach((r, k) => { r[key + 'BH'] = k <= kMax })
  let prev = 1
  for (let k = m - 1; k >= 0; k--) { prev = Math.min(prev, ord[k][key] * m / (k + 1)); ord[k][key + 'Q'] = prev }
}

// Worst-case hang imputation: a hung cell scores at the observed minimum of its
// OWN arm's live cells. Same rule as fusionRoster.js / rockTrapRetest.js.
function imputeHangs(live, hangCount) {
  if (!live.length) return live
  const lo = Math.min(...live)
  return live.concat(new Array(hangCount).fill(lo))
}

function pairedSignCounts(loMap, hiMap) {
  let better = 0, worse = 0, tied = 0
  for (const [k, a] of loMap) {
    if (!hiMap.has(k)) continue
    const b = hiMap.get(k)
    if (b > a) better++
    else if (b < a) worse++
    else tied++
  }
  return { better, worse, tied }
}

function deltasOver(loMap, hiMap, keys) {
  const out = []
  for (const k of keys) {
    if (!loMap.has(k) || !hiMap.has(k)) continue
    out.push({ key: k, d: hiMap.get(k) - loMap.get(k) })
  }
  return out
}

// --- the sweep ---------------------------------------------------------------

// DURATION CONTROL. `maxWaves` is fixed across every N arm, but a LOSS still
// truncates a match, and (measured, see the review) higher N survives LONGER —
// so raw enemy-seconds and raw structure damage are confounded with match
// duration in exactly the way guard 2 warns about, with the sign reversed
// (more towers -> later loss -> more content, rather than earlier win -> less).
//
// A fixed wave PREFIX was tried first and rejected: all six Watchtowers are
// standing by the wave-2 build phase in every arm (gold, not the cap, binds in
// wave 1), but structure damage over waves 1-4 is only ~28 of a ~194-654 match
// total, so the prefix controls duration by discarding essentially all of the
// signal. The `...PerWave` metrics divide by waves actually played instead:
// same duration control, no data discarded.
const METRICS = ['score', 'enemySeconds', 'structureDamage', 'enemySecondsPerWave', 'structureDamagePerWave']
const results = {
  generatedAt: new Date().toISOString(),
  protocol: 'isolated', defence: 'WATCHTOWER', spendDown: true,
  fuse: false, freeSpecial: false, maxWaves, caps, seedCount: seeds.length,
  watchtowerCost: BALANCE.STRUCTURES[STRUCTURE_TYPES.WATCHTOWER].cost,
  mazes: {},
}
const rows = []   // every comparison, for the BH family

console.log(`Watchtower cost ${results.watchtowerCost}   maxWaves ${maxWaves}   caps ${caps.join(',')}   seeds ${seeds.length}`)

for (const mazeName of mazes) {
  const maze = resolveMaze(mazeName)
  const scenarios = scenarioMatrix({ seeds, maze })
  const keys = scenarios.map(s => `${s.seed}:${s.postGap}`)
  const half = Math.floor(keys.length / 2)
  const halfA = new Set(keys.slice(0, half))
  console.log(`\n=== MAZE ${mazeName} — wall row ${maze.wallRow}, lanes ${maze.gaps.join('/')} — ${keys.length} cells per N ===`)

  // arms[N] = { cells: {metric: Map}, hangs, wins, live, perCell: [] }
  const arms = new Map()

  for (const N of caps) {
    const t0 = Date.now()
    const cellMaps = Object.fromEntries(METRICS.map(m => [m, new Map()]))
    const perCell = []
    let hangs = 0, wins = 0, live = 0
    let goldUnspent = 0, towersPurchased = 0, wavesCleared = 0

    for (const s of scenarios) {
      const key = `${s.seed}:${s.postGap}`
      const m = runMatch({
        seed: s.seed, maze, postGap: s.postGap, maxWaves,
        fuse: false, freeSpecial: false, spendDown: true,
        defence: STRUCTURE_TYPES.WATCHTOWER, sitingProtocol: 'isolated',
        defenceCap: N,
      })
      const hung = m.timedOut || m.stalled
      const structureDamage = m.combat?.byCategory?.structure?.damage ?? 0
      const wavesPlayed = m.waves.length || 1
      const enemySecondsPerWave = m.enemySeconds / wavesPlayed
      const structureDamagePerWave = structureDamage / wavesPlayed
      perCell.push({
        key, seed: s.seed, postGap: s.postGap, N,
        score: m.score, wavesCleared: m.wavesCleared, hallHpFrac: m.hallHpFrac,
        won: m.won, lost: m.lost, stalled: m.stalled, timedOut: m.timedOut,
        enemySeconds: m.enemySeconds, structureDamage,
        wavesPlayed, enemySecondsPerWave, structureDamagePerWave,
        goldUnspent: m.goldUnspent, towersPurchased: m.towersPurchased,
        rebuildsSkippedForGold: m.rebuildsSkippedForGold,
      })
      if (hung) { hangs++; continue }
      live++
      if (m.won) wins++
      goldUnspent += m.goldUnspent
      towersPurchased += m.towersPurchased
      wavesCleared += m.wavesCleared
      cellMaps.score.set(key, m.score)
      cellMaps.enemySeconds.set(key, m.enemySeconds)
      cellMaps.structureDamage.set(key, structureDamage)
      cellMaps.enemySecondsPerWave.set(key, enemySecondsPerWave)
      cellMaps.structureDamagePerWave.set(key, structureDamagePerWave)
    }

    const scores = [...cellMaps.score.values()]
    const arm = {
      N, hangs, live, wins,
      winRate: live ? wins / live : NaN,
      meanScore: live ? mean(scores) : NaN,
      sdScore: live ? sd(scores) : NaN,
      meanWavesCleared: live ? wavesCleared / live : NaN,
      meanEnemySeconds: live ? mean([...cellMaps.enemySeconds.values()]) : NaN,
      meanStructureDamage: live ? mean([...cellMaps.structureDamage.values()]) : NaN,
      meanEnemySecondsPerWave: live ? mean([...cellMaps.enemySecondsPerWave.values()]) : NaN,
      meanStructureDamagePerWave: live ? mean([...cellMaps.structureDamagePerWave.values()]) : NaN,
      meanGoldUnspent: live ? goldUnspent / live : NaN,
      meanTowersPurchased: live ? towersPurchased / live : NaN,
      cellMaps, perCell,
    }
    arms.set(N, arm)
    console.log(`  N=${N} [${((Date.now() - t0) / 1000).toFixed(1)}s]  hangs ${hangs}/${keys.length}  ` +
      `win ${(arm.winRate * 100).toFixed(1)}%  score ${arm.meanScore.toFixed(3)}  ` +
      `waves ${arm.meanWavesCleared.toFixed(2)}  enemySec ${arm.meanEnemySeconds.toFixed(1)}  ` +
      `structDmg ${arm.meanStructureDamage.toFixed(0)}  goldUnspent ${arm.meanGoldUnspent.toFixed(2)}  ` +
      `bought ${arm.meanTowersPurchased.toFixed(2)}  |  per-wave: enemySec ${arm.meanEnemySecondsPerWave.toFixed(1)} ` +
      `structDmg ${arm.meanStructureDamagePerWave.toFixed(1)}`)
  }

  // --- CEILING GUARD ---------------------------------------------------------
  // Declared before the run: score = wavesCleared + hallHpFrac ceilings at
  // maxWaves+1. Any N whose win rate exceeds 90% or whose mean score exceeds
  // 10.0 is EXCLUDED from the linearity fit, because at the ceiling a flat
  // marginal curve is a property of the scoring function, not of the game.
  const usable = caps.filter(N => {
    const a = arms.get(N)
    return a.live > 0 && a.winRate <= 0.90 && a.meanScore <= 10.0
  })
  const excluded = caps.filter(N => !usable.includes(N))
  console.log(`  ceiling guard: usable N = [${usable.join(',')}]` +
    (excluded.length ? `   EXCLUDED (win>90% or score>10) = [${excluded.join(',')}]` : '   (none excluded)'))

  // --- marginal steps --------------------------------------------------------
  const steps = {}
  for (const metric of METRICS) {
    steps[metric] = []
    for (let i = 1; i < caps.length; i++) {
      const lo = arms.get(caps[i - 1]), hi = arms.get(caps[i])
      const ds = deltasOver(lo.cellMaps[metric], hi.cellMaps[metric], keys)
      const pt = pairedT(ds.map(x => x.d))
      const sc = pairedSignCounts(lo.cellMaps[metric], hi.cellMaps[metric])
      const st = signTest(sc.better, sc.worse)
      const loArr = [...lo.cellMaps[metric].values()], hiArr = [...hi.cellMaps[metric].values()]
      // NOTE `classify`'s `t` is computed on |effect| (stats.js:138), so the
      // Welch column carries NO DIRECTION — read the sign off `meanDelta`, not
      // off `welchT`. Its p also uses the pooled df below rather than
      // Welch-Satterthwaite; immaterial at n=144 with near-equal sd, but it is
      // a Welch statistic with a Student df and is labelled as such in the
      // review. `classify` is deliberately not modified: every published
      // baseline in this project was taken against it as-is.
      const cw = classify([loArr, hiArr])
      // Worst-case imputation counts every missing cell. It is a provable
      // no-op in this sweep (hangs are 0/144 in every arm and no metric can go
      // missing for any other reason), and is kept only so the row stays
      // comparable with the other drivers' output.
      const cwImp = classify([
        imputeHangs(loArr, keys.length - loArr.length),
        imputeHangs(hiArr, keys.length - hiArr.length),
      ])
      const row = {
        maze: mazeName, metric, kind: 'step', label: `${caps[i - 1]}->${caps[i]}`,
        loN: caps[i - 1], hiN: caps[i],
        n: pt.n, meanDelta: pt.mean, sdDelta: pt.sd, pairedTStat: pt.t,
        pairedP: tTwoSided(Math.abs(pt.t), pt.n - 1),
        welchT: cw.t, welchP: tTwoSided(cw.t, loArr.length + hiArr.length - 2),
        welchDiff: cw.means[1] - cw.means[0],
        imputedDiff: cwImp.means[1] - cwImp.means[0], imputedT: cwImp.t,
        signs: sc, signP: st.p, signN: st.n,
        usable: usable.includes(caps[i - 1]) && usable.includes(caps[i]),
        deltas: ds,
      }
      steps[metric].push(row)
      rows.push(row)
    }
  }

  // --- THE PRE-DECLARED DECISION TEST, AND THE TWO READINGS IT LEFT OPEN -----
  //
  // The declared rule: marginal(N) = score(N) - score(N-1), PAIRED per seed/post
  // cell; compare the FIRST available step against the LAST available step in
  // the usable range, under paired t AND exact sign test, BH-corrected
  // within-file. Declines significantly -> SATURATING. Does not -> LINEAR.
  //
  // The rule fixes the usable range with ONE criterion (the ceiling guard) and
  // otherwise says "first vs last". It turns out that leaves two degrees of
  // freedom the rule never named, and the answer depends on both. Rather than
  // pick the reading that gives a clean answer — which is precisely the
  // retrofit the up-front declaration exists to prevent — all three readings
  // are computed here and reported side by side:
  //
  //   declared     first usable step vs last usable step. Literally what the
  //                rule says.
  //   dropTop      first vs SECOND-TO-LAST. The review's own §6 argues on three
  //                independent grounds that the top step is a change of regime,
  //                not a marginal effect. If that argument is accepted, this is
  //                the test the rule intends. The rule did not pre-declare a
  //                topology exclusion, so this is a READING, not the rule.
  //   parityEven   second step vs last step. `isolatedTowerSites` is ROW-MAJOR
  //                over both gaps, so it alternates lanes: even N is
  //                lane-symmetric, odd N is not, and consecutive steps are not
  //                like-for-like. `declared` compares an even->odd step against
  //                an odd->even step. This row and `dropTop` are the two
  //                parity-matched comparisons (`dropTop` is 0->1 vs 4->5, both
  //                "to odd"; `parityEven` is 1->2 vs 5->6, both "to even").
  //
  // MDE80 is the smallest decline this cell could detect at 80% power, two-
  // sided 0.05 (2.80 * se). The declared rule set no minimum effect size, so
  // without this column a null row cannot be distinguished from an unpowered
  // one — and on the score axis most of them are unpowered.
  const DECLINE_READINGS = [
    { name: 'declared', first: 0, last: -1 },
    { name: 'dropTop', first: 0, last: -2 },
    { name: 'parityEven', first: 1, last: -1 },
  ]
  const decline = {}
  for (const metric of METRICS) {
    const usableSteps = steps[metric].filter(r => r.usable)
    decline[metric] = {}
    for (const reading of DECLINE_READINGS) {
      const fi = reading.first < 0 ? usableSteps.length + reading.first : reading.first
      const li = reading.last < 0 ? usableSteps.length + reading.last : reading.last
      if (!(fi >= 0 && li >= 0 && fi < li && li < usableSteps.length)) {
        decline[metric][reading.name] = { available: false, reason: `range too short for reading "${reading.name}" (${usableSteps.length} usable steps)` }
        continue
      }
      const first = usableSteps[fi], last = usableSteps[li]
      const fMap = new Map(first.deltas.map(x => [x.key, x.d]))
      const lMap = new Map(last.deltas.map(x => [x.key, x.d]))
      const paired = []
      for (const k of keys) if (fMap.has(k) && lMap.has(k)) paired.push({ key: k, d: lMap.get(k) - fMap.get(k) })
      const pt = pairedT(paired.map(x => x.d))
      const sc = pairedSignCounts(fMap, lMap)
      const st = signTest(sc.better, sc.worse)
      // split-half: does the sign of (last - first) replicate on disjoint seed
      // halves? NOTE this is only informative on a row that resolves at all —
      // on a null row the sign of each half is close to a coin flip, so
      // `agree` there is not evidence of robustness.
      const h1 = paired.filter(x => halfA.has(x.key)).map(x => x.d)
      const h2 = paired.filter(x => !halfA.has(x.key)).map(x => x.d)
      const row = {
        maze: mazeName, metric, kind: 'decline', reading: reading.name,
        label: `${first.label} vs ${last.label}`,
        firstStep: first.label, lastStep: last.label,
        firstMean: first.meanDelta, lastMean: last.meanDelta,
        n: pt.n, meanDelta: pt.mean, sdDelta: pt.sd, pairedTStat: pt.t,
        se: pt.se, mde80: 2.80 * pt.se,
        pairedP: tTwoSided(Math.abs(pt.t), pt.n - 1),
        welchT: NaN, welchP: NaN,
        signs: sc, signP: st.p, signN: st.n,
        // The mean and the sign counts can point opposite ways. That
        // discordance is a diagnostic in its own right for a saturation
        // question, so it is computed rather than left for a reader to spot.
        meanSignDiscordant: Math.sign(pt.mean) !== 0 && Math.sign(sc.better - sc.worse) !== 0 &&
          Math.sign(pt.mean) !== Math.sign(sc.better - sc.worse),
        splitHalf: {
          half1: h1.length ? mean(h1) : NaN, half2: h2.length ? mean(h2) : NaN,
          agree: h1.length && h2.length ? Math.sign(mean(h1)) === Math.sign(mean(h2)) : false,
        },
        usable: true, available: true,
      }
      decline[metric][reading.name] = row
      rows.push(row)
    }
  }

  // --- FLOOR / DEGENERACY CENSUS --------------------------------------------
  // The pre-declared guard covered the score CEILING only. The mirror-image
  // floor was never declared and is checked here: `scoreAtFloor` counts cells
  // pinned at the lowest score observed anywhere in this maze. Censoring at the
  // floor compresses the FIRST step and not the last, which biases the decline
  // test toward "increase" — the opposite direction from the ceiling trap.
  // `nonzeroHallHpFrac` is the degeneracy check: score = wavesCleared +
  // hallHpFrac, so if no match is ever won or survives, hallHpFrac is 0 and the
  // "continuous" score collapses to an integer wave count with no sub-wave
  // resolution at all.
  const allScores = caps.flatMap(N => arms.get(N).perCell.map(c => c.score))
  const scoreFloor = Math.min(...allScores)
  // Pearson correlation between waves played and the per-wave rate, within an
  // arm. The `...PerWave` divisor is meant to control duration; if this is
  // large the control is not working, because later waves are denser and a
  // longer match therefore has a higher rate as well as more waves.
  const corrWithin = (pc, field) => {
    const xs = pc.map(c => c.wavesPlayed), ys = pc.map(c => c[field])
    const mx = mean(xs), my = mean(ys)
    let n = 0, dx = 0, dy = 0
    for (let i = 0; i < xs.length; i++) { n += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2 }
    return dx === 0 || dy === 0 ? 0 : n / Math.sqrt(dx * dy)
  }
  console.log(`  floor census (score floor ${scoreFloor}): ` +
    caps.map(N => `N${N} ${arms.get(N).perCell.filter(c => c.score === scoreFloor).length}`).join('  '))
  console.log(`  nonzero hallHpFrac cells: ` +
    caps.map(N => `N${N} ${arms.get(N).perCell.filter(c => c.hallHpFrac !== 0).length}`).join('  ') +
    `   (0 everywhere => score is an integer wave count, no sub-wave resolution)`)
  console.log(`  corr(wavesPlayed, structDmg/wave) within arm: ` +
    caps.map(N => `N${N} ${corrWithin(arms.get(N).perCell, 'structureDamagePerWave').toFixed(2)}`).join('  '))

  results.mazes[mazeName] = {
    lanes: maze.gaps, usableN: usable, excludedN: excluded, scoreFloor,
    arms: Object.fromEntries(caps.map(N => {
      const a = arms.get(N)
      return [N, {
        hangs: a.hangs, live: a.live, wins: a.wins, winRate: a.winRate,
        scoreAtFloor: a.perCell.filter(c => c.score === scoreFloor).length,
        nonzeroHallHpFrac: a.perCell.filter(c => c.hallHpFrac !== 0).length,
        towersLostAndRebuilt: a.perCell.filter(c => c.towersPurchased > N).length,
        corrWavesPlayedStructDmgPerWave: corrWithin(a.perCell, 'structureDamagePerWave'),
        meanScore: a.meanScore, sdScore: a.sdScore, meanWavesCleared: a.meanWavesCleared,
        meanEnemySeconds: a.meanEnemySeconds, meanStructureDamage: a.meanStructureDamage,
        meanEnemySecondsPerWave: a.meanEnemySecondsPerWave, meanStructureDamagePerWave: a.meanStructureDamagePerWave,
        meanGoldUnspent: a.meanGoldUnspent, meanTowersPurchased: a.meanTowersPurchased,
      }]
    })),
    steps: Object.fromEntries(METRICS.map(m => [m, steps[m].map(({ deltas, ...r }) => r)])),
    decline: Object.fromEntries(METRICS.map(m => [m, decline[m]])),
    perCell: Object.fromEntries(caps.map(N => [N, arms.get(N).perCell])),
  }
}

// --- multiplicity: BH within-file over every comparison in this run ----------
// PER-STATISTIC families, not one pooled family: BH is run separately over the
// paired-t p-values, the sign p-values and the Welch p-values. That is the same
// shape pairedReread.mjs uses, and it is what makes a "paired clears BH, sign
// does not" row meaningful. It does mean a cell has three chances to pass, so a
// claim resting on whichever statistic happened to clear is weaker than its
// q-value suggests — the review states this and reports all three columns for
// every row rather than quoting the best one.
bhMark(rows, 'pairedP')
bhMark(rows, 'signP')
bhMark(rows, 'welchP')

const fmt = v => !Number.isFinite(v) ? '  -   ' : ((v >= 0 ? '+' : '') + v.toFixed(3)).padStart(8)
const tf = v => !Number.isFinite(v) ? (v === Infinity ? '   inf' : '     -') : v.toFixed(2).padStart(6)

console.log('\n=== MARGINAL STEPS — paired per cell (BH q=0.05, family = every comparison in this file) ===')
console.log('mz metric          step        n   meanD    pairT  pairQ BH |  welchT welchQ BH |  b/w/t        signP  signQ BH | use')
for (const r of rows.filter(r => r.kind === 'step')) {
  console.log([
    r.maze, r.metric.padEnd(15), r.label.padEnd(8), String(r.n).padStart(4),
    fmt(r.meanDelta), tf(r.pairedTStat), (r.pairedPQ ?? NaN).toFixed(3).padStart(6), (r.pairedPBH ? 'Y' : '.'), '|',
    tf(r.welchT), (r.welchPQ ?? NaN).toFixed(3).padStart(6), (r.welchPBH ? 'Y' : '.'), '|',
    `${r.signs.better}/${r.signs.worse}/${r.signs.tied}`.padEnd(12),
    r.signP.toFixed(4).padStart(7), (r.signPQ ?? NaN).toFixed(3).padStart(6), (r.signPBH ? 'Y' : '.'), '|',
    r.usable ? 'yes' : 'NO',
  ].join(' '))
}

// A NEGATIVE diff is saturation. `mde80` is the smallest decline this row could
// have detected at 80% power — a null row whose |diff| ceiling is below its own
// MDE is UNPOWERED, not evidence of linearity.
console.log('\n=== DECLINE TESTS — the declared rule and the two readings it left open ===')
console.log('  declared   = first usable step vs last usable step (literally the rule)')
console.log('  dropTop    = first vs SECOND-TO-LAST (drops the top step, parity-matched "to odd")')
console.log('  parityEven = second vs last (parity-matched "to even")')
for (const r of rows.filter(r => r.kind === 'decline')) {
  console.log([
    r.maze, r.reading.padEnd(11), r.metric.padEnd(23), r.label.padEnd(16),
    `first ${fmt(r.firstMean)} last ${fmt(r.lastMean)} diff ${fmt(r.meanDelta)}`,
    `mde80 ${r.mde80.toFixed(3).padStart(8)}`,
    `pairT ${tf(r.pairedTStat)} q${(r.pairedPQ ?? NaN).toFixed(3)}${r.pairedPBH ? 'BH' : '  '}`,
    `sign ${r.signs.better}/${r.signs.worse}/${r.signs.tied} p${r.signP.toFixed(4)} q${(r.signPQ ?? NaN).toFixed(3)}${r.signPBH ? 'BH' : '  '}`,
    r.meanSignDiscordant ? 'MEAN/SIGN DISCORDANT' : '                    ',
    `split ${r.splitHalf.agree ? 'agree' : 'FLIP '}`,
  ].join('  '))
}
for (const [mz, mv] of Object.entries(results.mazes)) {
  for (const [metric, byReading] of Object.entries(mv.decline)) {
    for (const [name, d] of Object.entries(byReading)) {
      if (d && d.available === false) console.log(`${mz} ${metric.padEnd(23)} ${name.padEnd(11)} NO TEST — ${d.reason}`)
    }
  }
}

// Write BH results back into the persisted object.
for (const [mz, mv] of Object.entries(results.mazes)) {
  for (const metric of METRICS) {
    for (const r of mv.steps[metric]) {
      const src = rows.find(x => x.kind === 'step' && x.maze === mz && x.metric === metric && x.label === r.label)
      Object.assign(r, { pairedQ: src.pairedPQ, pairedBH: !!src.pairedPBH, signQ: src.signPQ, signBH: !!src.signPBH, welchQ: src.welchPQ, welchBH: !!src.welchPBH })
    }
    for (const [name, d] of Object.entries(mv.decline[metric])) {
      if (!d || d.available === false) continue
      const src = rows.find(x => x.kind === 'decline' && x.maze === mz && x.metric === metric && x.reading === name)
      Object.assign(d, { pairedQ: src.pairedPQ, pairedBH: !!src.pairedPBH, signQ: src.signPQ, signBH: !!src.signPBH })
    }
  }
}

if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nwritten: ${outPath}`)
} else {
  console.log('\n(no --out given — per-cell results NOT persisted)')
}
