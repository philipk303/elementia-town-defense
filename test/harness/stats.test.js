// Tests for the dial-probe classifier (Phase 8A, Task 7 remediation).
//
// The classifier this replaces compared a DIFFERENCE OF MEANS against twice a
// SINGLE-OBSERVATION spread (`effect <= 2 * meanWithinCellSd`). That is not a
// significance test, and on this instrument it demanded an effect of ~2.3 score
// points from a metric whose entire observed range is 8-11 — so `NO SIGNAL` was
// very nearly the only verdict it could ever print. It duly printed it for the
// calibration dial (4x goblin HP), which would have been written up as evidence
// that the simulation is smooth.
//
// The guard that matters in this file is the pair
// `a null dial reads NO SIGNAL` / `a real underpowered effect reads NO SIGNAL at
// n=12 and MONOTONIC at n=80`. The first proves the new test did not become
// credulous; the second proves it became sensitive for the right reason.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  benjaminiHochberg, bootstrapCI, classify, mde, pairedDeltas, pairedT,
  rankAgreement, requiredN, roughness, sd, signTest, spearman, splitHalfRho,
  mean, selectBest, splitCells, T_CRIT,
} from './stats.js'
import { mulberry32 } from '../../shared/rng.js'

// Build k cells of n samples each, cell i centred exactly on centres[i] with a
// sample sd of exactly `spread`. Deterministic — no rng, these tests must not
// flake — and normalised so the t values below are the ones you get by hand.
function cells(centres, n, spread) {
  const raw = []
  for (let i = 0; i < n; i++) raw.push(Math.sin((i + 1) * 2.399963))
  const m = raw.reduce((a, b) => a + b, 0) / n
  const dev = raw.map(v => v - m)
  const s = Math.sqrt(dev.reduce((a, v) => a + v * v, 0) / (n - 1))
  const unit = s === 0 ? dev : dev.map(v => v / s)
  return centres.map(c => unit.map(v => c + spread * v))
}

test('STATS: mean and sd match textbook values', () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5)
  assert.equal(sd([2, 2, 2]), 0)
  // sample sd (n-1) of [1,2,3,4] = sqrt(5/3)
  assert.ok(Math.abs(sd([1, 2, 3, 4]) - Math.sqrt(5 / 3)) < 1e-12)
})

test('STATS: spearman is +1 ascending, -1 descending, 0 on a flat series', () => {
  assert.equal(spearman([1, 2, 3, 4, 5]), 1)
  assert.equal(spearman([5, 4, 3, 2, 1]), -1)
  assert.equal(spearman([7, 7, 7, 7, 7]), 0)
})

// --- the control: this must NOT become sensitive ---

test('STATS: a null dial (byte-identical cells) reads NO SIGNAL', () => {
  const r = classify(cells([9, 9, 9, 9, 9], 80, 0))
  assert.equal(r.effect, 0)
  assert.equal(r.t, 0)
  assert.match(r.signal, /NO SIGNAL/)
})

test('STATS: pure scenario noise with no trend reads NO SIGNAL', () => {
  // every cell drawn around the same centre, generous spread
  const r = classify(cells([9, 9, 9, 9, 9], 80, 1.13))
  assert.match(r.signal, /NO SIGNAL/)
})

// --- sensitivity: the reason for the change ---

test('STATS: the calibration effect is underpowered at n=12 and resolved at n=80', () => {
  // The ACTUAL cell means from the 2026-07-25 n=12 calibration run: a 0.585
  // score-point difference against a within-cell sd of 1.133.
  const observed = [9.615, 8.799, 9.125, 8.636, 9.030]
  const small = classify(cells(observed, 12, 1.133))
  assert.match(small.signal, /NO SIGNAL/,
    'at n=12 this effect is genuinely not resolvable — reporting it as signal would be worse')

  const powered = classify(cells(observed, 80, 1.133))
  assert.ok(powered.t > T_CRIT,
    `n=80 should resolve a 0.585 effect at sd 1.13, got t=${powered.t.toFixed(2)}`)
})

test('STATS: the OLD rule could not fire on any realistic dial effect', () => {
  // Documents the defect. effect 0.585 vs 2*sd 2.27 -> the old rule said no.
  const effect = 0.585
  const noise = 1.133
  assert.ok(effect <= 2 * noise, 'old rule: NO SIGNAL')
  // The new rule, at the powered n, says otherwise.
  const r = classify(cells([9.615, 8.799, 9.125, 8.636, 9.030], 80, noise))
  assert.ok(r.t > T_CRIT)
})

// --- direction ---

test('STATS: a strong descending effect reads MONOTONIC', () => {
  const r = classify(cells([12, 11, 10, 9, 8], 80, 1.13))
  assert.match(r.signal, /MONOTONIC/)
  assert.ok(!/NON-MONOTONIC/.test(r.signal))
  assert.ok(r.rho <= -0.9)
})

test('STATS: a large but directionless effect reads NON-MONOTONIC', () => {
  const r = classify(cells([10, 4, 9, 5, 2], 80, 0.5))
  assert.match(r.signal, /NON-MONOTONIC/)
})

// --- degenerate shapes the old code got wrong ---

test('STATS: a deterministic difference with zero spread is a signal, not a divide-by-zero', () => {
  const r = classify(cells([10, 9.5, 9, 8.5, 8], 80, 0))
  assert.equal(r.se, 0)
  assert.ok(Number.isFinite(r.t) === false || r.t > T_CRIT,
    'zero-variance cells with different means must not classify as NO SIGNAL')
  assert.match(r.signal, /MONOTONIC/)
})

// Added after the 2026-07-25 adversarial review of the baseline. The reviewer's
// sharpest hit: hangs are excluded non-randomly AND hang rate correlates with
// the dial, so the exclusion can manufacture or mask a trend. These two tests
// lock in the checks that were missing.

test('STATS: rankAgreement is 1 on a replicating shape and ~0 on a scrambled one', () => {
  assert.equal(rankAgreement([9.4, 9.0, 8.7, 8.5], [9.3, 9.1, 8.8, 8.4]), 1)
  assert.equal(rankAgreement([1, 2, 3, 4], [4, 3, 2, 1]), -1)
  // a shape that does not replicate at all
  assert.ok(Math.abs(rankAgreement([1, 2, 3, 4], [3, 1, 4, 2])) < 0.5)
})

test('STATS: a dial-correlated hang rate can manufacture an effect', () => {
  // Two cells with the SAME true distribution, but the second has its worst
  // runs removed as hangs. Excluding them invents a difference that is not
  // there — this is the bias the sensitivity bound exists to catch.
  const trueLow = [5, 6, 7, 8, 9, 10, 11]
  const censored = [7, 8, 9, 10, 11]          // the two worst "hung"
  const naive = classify([trueLow.concat(trueLow), censored.concat(censored)])
  assert.ok(naive.effect > 0.9,
    'the exclusion alone should produce an apparent effect — that is the hazard')

  // Imputing the dropped runs at the cell minimum removes the artifact.
  const repaired = classify([
    trueLow.concat(trueLow),
    censored.concat(censored, [7, 7, 7, 7]),
  ])
  assert.ok(repaired.effect < naive.effect,
    'worst-case imputation must shrink an exclusion-manufactured effect')
})

// The roughness verdict is the falsifiability guard: without it, "smooth" is a
// claim no output of this tool could contradict. The FIRST test here is the one
// that matters — the instrument must be able to say ROUGH.

test('ROUGHNESS: a genuinely oscillating, replicating dial is labelled ROUGH', () => {
  // big alternating steps, tight cells -> every step clears 2 SE
  const r = roughness(cells([12, 8, 12, 8, 12], 80, 0.3),
    { splitRho: 1.0, survivesImputation: true })
  assert.ok(r.signChanges >= 2, `expected oscillation, got ${r.signChanges} sign changes`)
  assert.equal(r.rough, true)
  assert.match(r.verdict, /^ROUGH/)
})

test('ROUGHNESS: oscillation that does not replicate is NOT rough', () => {
  const r = roughness(cells([12, 8, 12, 8, 12], 80, 0.3),
    { splitRho: 0.3, survivesImputation: true })
  assert.equal(r.rough, false)
  assert.match(r.verdict, /does not replicate/)
})

test('ROUGHNESS: oscillation that dies under hang imputation is NOT rough', () => {
  const r = roughness(cells([12, 8, 12, 8, 12], 80, 0.3),
    { splitRho: 1.0, survivesImputation: false })
  assert.equal(r.rough, false)
})

test('ROUGHNESS: a single peak is SINGLE-PEAKED, not rough', () => {
  // the shape of BOT.ENGAGE_RANGE_PX: worst, best, then a shallow plateau
  const r = roughness(cells([8.409, 9.448, 9.018, 8.941, 8.975], 130, 1.25),
    { splitRho: 1.0, survivesImputation: true })
  assert.equal(r.signChanges, 1)
  assert.equal(r.rough, false)
  assert.match(r.verdict, /SINGLE-PEAKED/)
})

test('ROUGHNESS: a monotone dial is MONOTONE OR FLAT', () => {
  const r = roughness(cells([9.461, 9.275, 9.018, 8.716, 8.520], 130, 1.28),
    { splitRho: 1.0, survivesImputation: true })
  assert.equal(r.signChanges, 0)
  assert.match(r.verdict, /MONOTONE OR FLAT/)
})

test('ROUGHNESS: sub-SE wiggle is not counted as a step', () => {
  // the fine-scale respawn probe: jagged ordering, spread far below SE
  const r = roughness(cells([9.033, 9.043, 9.018, 9.046, 9.023], 130, 1.28),
    { splitRho: 0.30, survivesImputation: false })
  assert.equal(r.significantSteps, 0,
    'differences smaller than 2 SE must not count as structure')
  assert.equal(r.rough, false)
})

// A single-value run is a RAMP measurement, not a sweep: there is nothing to
// compare. The first version of this printed "MONOTONE OR FLAT" from zero
// comparisons — a verdict manufactured out of an empty set, which is the same
// class of defect as every other one Phase 8A has found: a readout claiming
// more than its input can support.
test('ROUGHNESS: fewer than two live cells is NOT A SWEEP, not a flat verdict', () => {
  const one = roughness(cells([9.018], 130, 1.28), { splitRho: NaN, survivesImputation: false })
  assert.equal(one.comparable, false)
  assert.match(one.verdict, /NOT A SWEEP/)
  assert.doesNotMatch(one.verdict, /MONOTONE|FLAT|ROUGH/)

  const allHung = cells([9.0, 9.1], 130, 1.28)
  allHung[1] = []
  assert.equal(roughness(allHung, { splitRho: NaN, survivesImputation: false }).comparable, false)
})

test('ROUGHNESS: two live cells are comparable', () => {
  const r = roughness(cells([9.4, 8.5], 130, 1.28), { splitRho: 1.0, survivesImputation: true })
  assert.equal(r.comparable, true)
})

test('STATS: cells emptied by hangs do not crash the classifier', () => {
  const c = cells([10, 9, 8, 7, 6], 80, 1.0)
  c[2] = []          // every scenario in this cell hung
  const r = classify(c)
  assert.ok(Number.isFinite(r.effect), 'endpoints still present, effect must compute')
  assert.equal(r.means[2], null, 'an all-hung cell reports null, never 0 or NaN')
})

// ——— PAIRED STATISTICS (2026-08-04) ————————————————————————————————————————
//
// `classify` computes an UNPAIRED Welch SE on arms this harness always runs
// over the same seeds. These tests pin the additive paired alternatives, and
// the first one is the load-bearing case: it demonstrates the power loss on
// data shaped like the real thing (mostly ties, small consistent shift), which
// is the reason the fusion sweep kept reading "flat".

test('PAIRED: on mostly-tied arms the unpaired t misses what the paired t resolves', () => {
  // 144 seeds. The seeds themselves differ a lot — real control scores run
  // 5..11 — and the fuse arm TRACKS its own seed almost exactly: 100 cells
  // identical, 34 worse by one wave, 10 better. That between-seed spread is
  // what the unpaired SE has to divide by; the paired test never sees it.
  const control = [], arm = []
  const seedScore = i => 5 + (i * 3) % 7        // 5..11, deterministic
  for (let i = 0; i < 100; i++) { control.push(seedScore(i)); arm.push(seedScore(i)) }
  for (let i = 100; i < 134; i++) { control.push(seedScore(i)); arm.push(seedScore(i) - 1) }
  for (let i = 134; i < 144; i++) { control.push(seedScore(i)); arm.push(seedScore(i) + 1) }

  const unpaired = classify([control, arm])
  const deltas = arm.map((v, i) => v - control[i])
  const paired = pairedT(deltas)

  assert.ok(!(unpaired.t > T_CRIT), `unpaired t ${unpaired.t.toFixed(2)} should MISS this effect`)
  assert.ok(paired.t < -T_CRIT, `paired t ${paired.t.toFixed(2)} should resolve it, and negative`)
})

test('PAIRED: pairedT keeps the sign, unlike classify effect', () => {
  const worse = pairedT([-1, -1, -1, -1, 0, -1, -1, 0])
  assert.ok(worse.mean < 0 && worse.t < 0, 'a regression must report negative, not magnitude')
})

test('PAIRED: pairedDeltas only pairs keys present in BOTH arms', () => {
  const c = new Map([['a', 8], ['b', 8], ['c', 8]])
  const a = new Map([['a', 9], ['c', 7]])              // 'b' hung in the fuse arm
  assert.deepEqual(pairedDeltas(c, a).sort(), [-1, 1])
})

test('PAIRED: a null dial stays null and a deterministic one is not a divide-by-zero', () => {
  assert.equal(pairedT([0, 0, 0, 0]).t, 0, 'no difference must not be promoted to a signal')
  assert.equal(pairedT([2, 2, 2, 2]).t, Infinity, 'zero-spread real difference is deterministic')
})

test('SIGNTEST: matches known exact binomial values', () => {
  assert.equal(signTest(0, 0).p, 1, 'nothing moved')
  // n=10, k=1 -> 2 * (1 + 10)/1024
  assert.ok(Math.abs(signTest(9, 1).p - 2 * 11 / 1024) < 1e-12)
  assert.equal(signTest(5, 5).p, 1, 'a perfect split is p = 1, never > 1')
})

test('SIGNTEST: n=144 does not overflow and excludes ties', () => {
  const r = signTest(24, 43)                 // MAGMA_TRAP maze B flank, wave 4
  assert.equal(r.n, 67, 'ties are excluded from n')
  assert.ok(r.p > 0 && r.p < 0.05, `p ${r.p} should resolve where the unpaired t read t1.37`)
  assert.ok(Number.isFinite(signTest(72, 72).p), 'n=144 must not overflow')
})

test('SIGNTEST: n past the 0.5^n underflow point still returns a real p, not a free PASS', () => {
  // 0.5**1170 === 0 in doubles (anything past n=1074 does), so the natural
  // recurrence seeded on it summed to exactly zero and reported p = 0 --
  // an automatic sign-gate PASS. This is the cell that exposed it:
  // hallHpAuc / maze A / wt-pure in the 2026-08-27 option-set pilot.
  assert.equal(Math.pow(0.5, 1170), 0, 'the underflow this guards is real')
  const r = signTest(552, 618)
  assert.equal(r.n, 1170)
  assert.ok(Math.abs(r.p - 0.057348) < 1e-5, `p ${r.p} must be the exact 0.0573, not 0`)
  assert.ok(r.p > 0.05, 'and it must FAIL the 0.05 sign gate it previously passed')
  // a far-out tail at the same n must stay finite, positive and tiny
  const far = signTest(817, 413)
  assert.ok(far.p > 0 && far.p < 1e-30, `p ${far.p} should be ~4.3e-31`)
})

// ——— MULTIPLICITY, INTERVALS AND POWER (WP2, 2026-08-14) —————————————

test('BH: adjusted q values match a hand-computed four-test family', () => {
  // Sorted p: .002, .01, .03, .04 -> raw adjusted: .008, .02, .04, .04.
  // The reverse cumulative minimum changes nothing, then input order is restored.
  assert.deepEqual(
    benjaminiHochberg([0.01, 0.04, 0.03, 0.002]),
    [0.02, 0.04, 0.04, 0.008],
  )
})

test('BOOTSTRAP: a constant paired effect has the hand-computed point interval', () => {
  assert.deepEqual(bootstrapCI([2, 2, 2], { iters: 100, seed: 17 }), { lo: 2, hi: 2 })
})

test('BOOTSTRAP: the same seed reproduces the same non-degenerate interval', () => {
  const options = { iters: 500, seed: 20260814 }
  assert.deepEqual(bootstrapCI([-2, -1, 0, 2, 4], options), bootstrapCI([-2, -1, 0, 2, 4], options))
})

test('MDE: default formula matches a hand calculation and round-trips requiredN', () => {
  // sqrt(2 * 2^2 * (1.959964 + 0.841621)^2 / 32) = 2.801585 / 2.
  const observed = mde(2, 32)
  assert.ok(Math.abs(observed - 1.4007925) < 1e-12)
  assert.equal(requiredN(2, observed), 32,
    'the inverse and existing sample-size formula must never drift apart')
})

test('SPLIT HALF: archived probe mean-ranking logic has known +1 and -1 answers', () => {
  const first = [[1, 1], [2, 2], [3, 3]]
  assert.equal(splitHalfRho({ first, second: [[10, 10], [20, 20], [30, 30]] }), 1)
  assert.equal(splitHalfRho({ first, second: [[30, 30], [20, 20], [10, 10]] }), -1)
})

test('splitCells is balanced, disjoint, exhaustive and deterministic in its seed', () => {
  const keys = Array.from({ length: 101 }, (_, i) => `${i}:0`)
  const { s1, s2 } = splitCells(keys, { seed: 7 })
  assert.equal(s1.size + s2.size, 101)
  assert.equal(s1.size, 51, 'an odd count gives the extra cell to the selection half')
  assert.ok([...s1].every(key => !s2.has(key)), 'halves must be disjoint')
  const repeat = splitCells(keys, { seed: 7 })
  assert.deepEqual([...repeat.s1].sort(), [...s1].sort())
  const different = splitCells(keys, { seed: 8 })
  assert.notDeepEqual([...different.s1].sort(), [...s1].sort())
})

// Record order in a JSONL store is a function of worker scheduling, so a split
// that depended on it would not be reproducible from the same corpus.
test('splitCells does not depend on the order keys arrive in', () => {
  const keys = Array.from({ length: 40 }, (_, i) => `${i}:0`)
  const forward = splitCells(keys, { seed: 3 })
  const backward = splitCells([...keys].reverse(), { seed: 3 })
  assert.deepEqual([...backward.s1].sort(), [...forward.s1].sort())
})

test('selectBest picks the highest mean and reports the runner-up margin', () => {
  const byArm = new Map([
    ['a', new Map([['1:0', 1], ['2:0', 1]])],
    ['b', new Map([['1:0', 3], ['2:0', 3]])],
    ['c', new Map([['1:0', 2], ['2:0', 2]])],
  ])
  const best = selectBest(byArm, new Set(['1:0', '2:0']))
  assert.equal(best.armId, 'b')
  assert.equal(best.mean, 3)
  assert.equal(best.margin, 1, 'margin is against the runner-up, not the field')
  assert.equal(best.n, 2)
})

test('selectBest breaks exact ties by armId rather than by insertion order', () => {
  const cells = new Set(['1:0'])
  const zFirst = new Map([['z', new Map([['1:0', 5]])], ['a', new Map([['1:0', 5]])]])
  const aFirst = new Map([['a', new Map([['1:0', 5]])], ['z', new Map([['1:0', 5]])]])
  assert.equal(selectBest(zFirst, cells).armId, 'a')
  assert.equal(selectBest(aFirst, cells).armId, 'a')
  assert.equal(selectBest(zFirst, cells).margin, 0, 'a tied selection must show a zero margin, not a winner')
})

// The whole reason split-sample selection exists. Eight arms of PURE NOISE with
// identical true means. Selecting and evaluating on the same cells reports the
// winner's inflated mean; selecting on one half and evaluating on the other
// returns to zero. If this test ever goes quiet, the option-set estimator is
// manufacturing effects from noise.
//
// Thresholds are anchored to theory, not to observed output. With n = 400 and
// sd 1 the standard error of an arm mean is 0.05, and the expected maximum of
// eight standard normals is about 1.42 SE, so the naive max should land near
// +0.071. A SINGLE split's evaluation half is itself noisy (SE 1/sqrt(200) =
// 0.071), which is why the honest side is averaged over 200 splits — the claim
// is that the estimator is unbiased, not that any one split lands on zero.
test('splitCells removes the winner-selection bias that same-sample max carries', () => {
  const rng = mulberry32(20260827)
  const cells = Array.from({ length: 400 }, (_, i) => `${i}:0`)
  const byArm = new Map()
  for (let arm = 0; arm < 8; arm++) {
    const byCell = new Map()
    // Box-Muller from the shared rng: mean 0, sd 1, no real effect anywhere.
    for (const key of cells) {
      const u = Math.max(rng(), 1e-12), v = rng()
      byCell.set(key, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))
    }
    byArm.set(`arm${arm}`, byCell)
  }

  const naive = selectBest(byArm, new Set(cells)).mean
  assert.ok(naive > 0.04,
    `same-sample max must be visibly inflated above the true zero, got ${naive.toFixed(4)}`)

  const honestMeans = []
  for (let split = 0; split < 200; split++) {
    const { s1, s2 } = splitCells(cells, { seed: 1000 + split })
    const chosen = selectBest(byArm, s1).armId
    honestMeans.push(mean([...s2].map(key => byArm.get(chosen).get(key))))
  }
  const honest = mean(honestMeans)
  assert.ok(Math.abs(honest) < 0.02,
    `split-sample evaluation must average to the true zero, got ${honest.toFixed(4)}`)
  assert.ok(Math.abs(honest) < naive,
    `split-sample evaluation must beat the naive max (naive ${naive.toFixed(4)}, split ${honest.toFixed(4)})`)
})
