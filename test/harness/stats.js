// Statistics for the dial probe (Phase 8A, Task 7 remediation, 2026-07-25).
//
// WHY THIS FILE EXISTS
//
// The probe's original classifier was:
//
//     if (effect <= 2 * meanWithinCellSd) -> 'NO SIGNAL'
//
// where `effect` is a difference of two cell MEANS and `meanWithinCellSd` is the
// spread of a SINGLE observation. Those are not comparable quantities. A
// difference of means has standard error sd*sqrt(2/n); dividing by the raw sd
// instead throws away every bit of power the sample size buys, so the rule
// demanded an effect of 2*1.13 = 2.27 score points from a metric whose entire
// observed range is 8-11. Essentially no single balance dial can move a 10-wave
// outcome by two and a third waves, so `NO SIGNAL` was very nearly the only
// verdict the probe could print — the mirror image of the "gate that cannot
// fail" the probe's own header warns about.
//
// It printed exactly that for the calibration dial (goblin HP 6 -> 24, a 4x
// change) on 2026-07-25, while the same run's enemy-seconds column rose
// monotonically 2043 -> 2342. The sim was responding; the readout could not see
// it. Under this classifier that run is correctly reported as UNDERPOWERED
// rather than absent.
//
// WHAT REPLACES IT
//
// A two-sample Welch t on the endpoint cells, plus Spearman rho over all cell
// means for direction. `t` answers "is there an effect at all", `rho` answers
// "does it point one way". Both are needed: a dial can move the game hard and
// still be non-monotonic, and that distinction is the entire question of Phase
// 8A.
//
// This test is strictly MORE sensitive than the one it replaces, so the null
// dial control in stats.test.js is load-bearing: it proves the gain in
// sensitivity did not come from becoming credulous.
//
// WHAT IT STILL GETS WRONG, AND WHAT `pairedT`/`signTest` BELOW ARE FOR
//
// `classify` computes an UNPAIRED Welch SE (sqrt(sdA^2/nA + sdB^2/nB)). Every
// driver in this harness runs its arms over the SAME seeds, so the arms are
// paired — and heavily correlated, because a fusion changes nothing at all in
// most matches: 51 to 100 of 144 cells are typically TIED. Discarding the
// pairing throws away most of the power the design already bought, in exactly
// the spirit of the original defect this file was written to fix, one level up.
//
// The failure mode this produces is specifically bad for TUNING: a real effect
// reads as "not resolvable", so the dial gets pushed further to make it show
// up, and the structure ends up overtuned. That is the most likely explanation
// for the hp buffs reverted on 2026-08-04 (see docs/reviews/2026-08-04-fusion-
// roster-retake-isolated-instrument.md section 2a) — Muddy Bog and Steam Vent
// both kept reading flat and both kept getting pushed.
//
// `classify` is deliberately NOT changed. Every published baseline in this
// project was taken with it, and silently re-defining it would change what
// those numbers mean without re-running any of them. The two functions below
// are additive second opinions, reported alongside it. Where they disagree,
// say so rather than picking one.

import { mulberry32 } from '../../shared/rng.js'

export const T_CRIT = 2          // ~95% two-sided at these sample sizes
export const MONOTONIC_RHO = 0.9

export const mean = a => a.reduce((x, y) => x + y, 0) / a.length

export const sd = a => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1))
}

/** Midranks of an array (ties share their average rank). */
export function ranks(ys) {
  const n = ys.length
  const idx = ys.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const rank = new Array(n)
  for (let i = 0; i < n; i++) {
    let j = i
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) rank[idx[k][1]] = r
    i = j
  }
  return rank
}

/** Pearson correlation. Returns 0 when either series is constant. */
function corr(xs, ys) {
  const mx = mean(xs), my = mean(ys)
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx, b = ys[i] - my
    num += a * b; dx2 += a * a; dy2 += b * b
  }
  return dx2 === 0 || dy2 === 0 ? 0 : num / Math.sqrt(dx2 * dy2)
}

/**
 * Spearman rank correlation between position (1..k) and value.
 * Ties share the midrank. Returns 0 when every value is tied (no direction).
 */
export function spearman(ys) {
  if (ys.length < 2) return 0
  return corr(ys.map((_, i) => i + 1), ranks(ys))
}

/**
 * Spearman correlation between two paired series — used for split-half
 * replication: does the second half of the seeds rank the dial values the same
 * way the first half did? A real shape replicates; a sort order decided by
 * sub-standard-error gaps does not.
 */
export function rankAgreement(xs, ys) {
  if (xs.length < 2 || xs.length !== ys.length) return NaN
  return corr(ranks(xs), ranks(ys))
}

/**
 * Classify one metric swept across dial values.
 *
 * @param {number[][]} cells  one array of per-scenario samples per dial value,
 *                            in dial order. A cell emptied by hangs is allowed
 *                            and reports a null mean rather than 0 or NaN.
 * @returns {{means, sds, ns, effect, noise, se, t, rho, signal}}
 */
export function classify(cells) {
  const means = cells.map(c => (c.length ? mean(c) : null))
  const sds = cells.map(c => (c.length ? sd(c) : null))
  const ns = cells.map(c => c.length)

  // Endpoints: the first and last dial values that actually produced data.
  const live = means.map((m, i) => (m === null ? -1 : i)).filter(i => i >= 0)
  const lo = live[0], hi = live.at(-1)

  if (lo === undefined || lo === hi) {
    return { means, sds, ns, effect: NaN, noise: NaN, se: NaN, t: NaN, rho: 0,
      signal: 'NO SIGNAL (not enough live cells to compare)' }
  }

  const effect = Math.abs(means[hi] - means[lo])
  const se = Math.sqrt(sds[lo] ** 2 / ns[lo] + sds[hi] ** 2 / ns[hi])

  // se === 0 with a real difference is a deterministic effect, not a
  // divide-by-zero: t is infinite and it is unambiguously a signal. se === 0
  // with no difference (the null dial) must stay NO SIGNAL, so 0/0 -> 0.
  const t = se === 0 ? (effect === 0 ? 0 : Infinity) : effect / se

  const noise = mean(sds.filter(s => s !== null))
  const rho = spearman(means.filter(m => m !== null))

  let signal
  if (!(t > T_CRIT)) {
    signal = `NO SIGNAL (effect ${effect.toFixed(3)} is ${t.toFixed(2)} SE — ` +
      'not resolvable at this sample size)'
  } else if (Math.abs(rho) >= MONOTONIC_RHO) {
    signal = `MONOTONIC (rho ${rho.toFixed(2)}, t ${t === Infinity ? 'inf' : t.toFixed(2)})`
  } else {
    signal = `NON-MONOTONIC (rho ${rho.toFixed(2)}, t ${t === Infinity ? 'inf' : t.toFixed(2)}) — ` +
      'the dial moves the game, but not in one direction'
  }

  return { means, sds, ns, effect, noise, se, t, rho, signal }
}

/**
 * Per-cell deltas for two arms that were run over the same scenario keys.
 * Only keys present in BOTH maps contribute — a cell lost to a hang in one arm
 * cannot be paired, and silently pairing it against a different scenario is
 * worse than dropping it.
 *
 * @param {Map<string, number>} controlByCell
 * @param {Map<string, number>} armByCell
 * @returns {number[]} arm − control, one per shared key
 */
export function pairedDeltas(controlByCell, armByCell) {
  const out = []
  for (const [k, c] of controlByCell) {
    if (!armByCell.has(k)) continue
    out.push(armByCell.get(k) - c)
  }
  return out
}

/**
 * Paired t on the per-cell deltas. Signed, unlike `classify`'s `effect`, which
 * takes an absolute value — the direction is the whole point for a balance
 * dial, and losing it is how a regression gets reported as an improvement.
 *
 * The se === 0 convention matches `classify`: a deterministic difference is
 * t = Infinity, and no difference at all is t = 0, so a null dial cannot be
 * promoted to a signal by a divide-by-zero.
 *
 * @param {number[]} deltas
 * @returns {{n, mean, sd, se, t}}
 */
export function pairedT(deltas) {
  const n = deltas.length
  if (n < 2) return { n, mean: n ? deltas[0] : NaN, sd: NaN, se: NaN, t: NaN }
  const m = mean(deltas)
  const s = sd(deltas)
  const se = s / Math.sqrt(n)
  const t = se === 0 ? (m === 0 ? 0 : Infinity) : m / se
  return { n, mean: m, sd: s, se, t }
}

/**
 * Exact two-sided sign test on paired better/worse counts. Ties are excluded,
 * which is the standard treatment and is also the conservative one here: with
 * most cells tied, `n` collapses to the pairs that actually moved.
 *
 * This is distribution-free, so unlike `pairedT` it cannot be fooled by the
 * score metric's discreteness (scores are wave counts — a handful of integers,
 * not a smooth continuum). It is the more trustworthy of the two on this data;
 * it is also strictly less powerful when the t's assumptions do hold, which is
 * why both are reported.
 *
 * Probabilities are built up iteratively (P(i) = P(i-1) * (n-i+1)/i) rather
 * than from factorials, so n = 144 does not overflow.
 *
 * @returns {{n, p}} n = untied pairs. p = 1 when nothing moved.
 */
export function signTest(better, worse) {
  const n = better + worse
  if (n === 0) return { n: 0, p: 1 }
  const k = Math.min(better, worse)
  // Accumulated in log space on purpose. The natural form seeds the tail with
  // Math.pow(0.5, n), which underflows to exactly 0 for n > 1074, and every
  // term after it is that zero times a ratio -- so a sign test on more than
  // 1074 untied pairs returned p = 0 and passed the sign gate for free. That
  // defect reported hallHpAuc/A/wt-pure (552+/618-, true p 0.057) as a PASS in
  // the 2026-08-27 option-set pilot.
  const logTerms = new Float64Array(k + 1)
  let logTerm = n * Math.log(0.5)   // log P(0)
  logTerms[0] = logTerm
  let maxLog = logTerm
  for (let i = 1; i <= k; i++) {
    logTerm += Math.log(n - i + 1) - Math.log(i)
    logTerms[i] = logTerm
    if (logTerm > maxLog) maxLog = logTerm
  }
  let sum = 0
  for (let i = 0; i <= k; i++) sum += Math.exp(logTerms[i] - maxLog)
  return { n, p: Math.min(1, 2 * Math.exp(maxLog + Math.log(sum))) }
}

/**
 * Roughness verdict — the operational definition of the question Phase 8A
 * exists to answer, from section 4.1 of the 2026-07-25 baseline.
 *
 * The first draft of that baseline asserted "the simulation is smooth" with no
 * declared criterion for what would have refuted it, and the classifier emits
 * no label meaning "rough" — so every possible output could be read as
 * confirmation. This function makes the claim falsifiable, and computes it so
 * a later phase cannot quietly re-derive it by eye.
 *
 * A dial is ROUGH only if all three hold:
 *   (a) >= 2 sign changes among first-differences that individually exceed
 *       2 SE. One sign change is a single peak — an optimum, the most ordinary
 *       shape in game balance. Two or more is genuine oscillation.
 *   (b) the ordering REPLICATES across disjoint seed halves (split-half
 *       rho >= 0.9). Otherwise the jaggedness is noise — see the fine-scale
 *       probe in baseline section 2.8, which is visibly jagged and scores 0.30.
 *   (c) it survives worst-case hang imputation.
 */
export function roughness(cells, { splitRho, survivesImputation }) {
  const live = cells.map((c, i) => ({ c, i })).filter(x => x.c.length > 1)
  const steps = []
  for (let k = 0; k < live.length - 1; k++) {
    const A = live[k].c, B = live[k + 1].c
    const d = mean(B) - mean(A)
    const seD = Math.sqrt(sd(A) ** 2 / A.length + sd(B) ** 2 / B.length)
    if (seD === 0 ? d !== 0 : Math.abs(d) > 2 * seD) steps.push(Math.sign(d))
  }
  let signChanges = 0
  for (let k = 1; k < steps.length; k++) if (steps[k] !== steps[k - 1]) signChanges++

  // A single live cell is a RAMP measurement, not a sweep: nothing is being
  // compared, so every shape verdict below would be manufactured out of an
  // empty set of steps. Say that instead of printing "MONOTONE OR FLAT".
  const comparable = live.length >= 2
  const replicates = splitRho >= MONOTONIC_RHO
  const rough = comparable && signChanges >= 2 && replicates && survivesImputation
  const verdict = !comparable
    ? `NOT A SWEEP — ${live.length} live cell(s); nothing to compare`
    : rough
    ? 'ROUGH (>=2 replicating significant sign changes)'
    : signChanges >= 2
      ? 'NOT ROUGH (oscillates, but the ordering does not replicate or does not survive imputation)'
      : signChanges === 1
        ? 'SINGLE-PEAKED (one optimum — an ordinary balance shape, not chaos)'
        : 'MONOTONE OR FLAT'
  return { significantSteps: steps.length, signChanges, replicates, rough, comparable, verdict }
}

/**
 * Cells needed per dial value to resolve `delta` at 80% power, two-sided 0.05.
 * Recorded so the scenario count in scenarios.js can be justified from a
 * declared minimum effect size rather than reverse-engineered from a result
 * that looked good.
 */
export function requiredN(sigma, delta) {
  return Math.ceil((2 * sigma ** 2 * (1.959964 + 0.841621) ** 2) / delta ** 2)
}

/**
 * Benjamini-Hochberg false-discovery-rate adjustment in input order.
 * The reverse cumulative minimum is load-bearing: without it, a larger raw p
 * can receive a smaller q solely because of its sorted position.
 */
export function benjaminiHochberg(pValues) {
  const m = pValues.length
  if (!m) return []
  for (const p of pValues) {
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('p values must be finite numbers in [0, 1]')
  }
  const sorted = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p)
  const adjusted = new Array(m)
  let running = 1
  for (let i = m - 1; i >= 0; i--) {
    running = Math.min(running, sorted[i].p * m / (i + 1))
    adjusted[sorted[i].index] = Math.min(1, running)
  }
  return adjusted
}

const percentile = (sorted, p) => {
  const index = p * (sorted.length - 1)
  const lo = Math.floor(index), hi = Math.ceil(index)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo)
}

/**
 * Percentile bootstrap interval for a paired mean. The required seed prevents
 * a repeated analysis of one immutable store from moving its own interval.
 */
export function bootstrapCI(deltas, { iters = 10000, alpha = 0.05, seed } = {}) {
  if (!deltas.length || deltas.some(v => !Number.isFinite(v))) {
    throw new RangeError('bootstrap deltas must be a non-empty array of finite numbers')
  }
  if (!Number.isInteger(iters) || iters < 1) throw new RangeError('bootstrap iters must be a positive integer')
  if (!(alpha > 0 && alpha < 1)) throw new RangeError('bootstrap alpha must be between 0 and 1')
  if (!Number.isInteger(seed)) throw new RangeError('bootstrap seed must be an integer')

  const rng = mulberry32(seed)
  const means = new Array(iters)
  for (let i = 0; i < iters; i++) {
    let total = 0
    for (let j = 0; j < deltas.length; j++) total += deltas[Math.floor(rng() * deltas.length)]
    means[i] = total / deltas.length
  }
  means.sort((a, b) => a - b)
  return { lo: percentile(means, alpha / 2), hi: percentile(means, 1 - alpha / 2) }
}

// Peter J. Acklam's inverse-normal approximation. Non-default alpha/power
// values need their own quantiles; the default constants below stay identical
// to requiredN so the two public power calculations cannot drift.
function inverseNormal(p) {
  if (!(p > 0 && p < 1)) throw new RangeError('normal probability must be between 0 and 1')
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687,
    138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416]
  const low = 0.02425, high = 1 - low
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > high) return -inverseNormal(1 - p)
  const q = p - 0.5, r = q * q
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/**
 * Minimum detectable effect under the same two-sample normal approximation as
 * requiredN. Defaults deliberately reuse requiredN's exact constants.
 */
export function mde(sigma, n, { alpha = 0.05, power = 0.8 } = {}) {
  if (!(Number.isFinite(sigma) && sigma >= 0)) throw new RangeError('sigma must be a finite non-negative number')
  if (!(Number.isFinite(n) && n > 0)) throw new RangeError('n must be a positive number')
  if (!(alpha > 0 && alpha < 1) || !(power > 0 && power < 1)) {
    throw new RangeError('alpha and power must be between 0 and 1')
  }
  const zAlpha = alpha === 0.05 ? 1.959964 : inverseNormal(1 - alpha / 2)
  const zPower = power === 0.8 ? 0.841621 : inverseNormal(power)
  return Math.sqrt(2 * sigma ** 2 * (zAlpha + zPower) ** 2 / n)
}

/**
 * Split-half replication correlation lifted from archive/probe.js:268-272:
 * mean each dial/arm cell independently in both disjoint seed halves, retain
 * cells live in both halves, then compare their rank orders.
 */
export function splitHalfRho({ first, second }) {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) return NaN
  const live = []
  for (let i = 0; i < first.length; i++) {
    if (!first[i]?.length || !second[i]?.length) continue
    live.push([mean(first[i]), mean(second[i])])
  }
  return rankAgreement(live.map(pair => pair[0]), live.map(pair => pair[1]))
}

/**
 * Balanced random split of scenario cells into a selection half and an
 * evaluation half. Deterministic in `seed`.
 *
 * WHY THIS EXISTS. `max` over several noisy arm means is biased upward: taking
 * the best of k sample means and reporting its own mean manufactures an effect
 * from noise alone, and the bias grows with k. An option-set comparison asks
 * exactly that question — "how good is the best available strategy" — and it
 * asks it of two sets of DIFFERENT sizes (with and without the structure under
 * test), so the larger set wins by construction unless the bias is removed.
 *
 * Selecting on `s1` and evaluating on `s2` removes it: the evaluation mean is
 * over cells that took no part in choosing the arm, so it is unbiased for that
 * arm conditional on the selection. The cost is halved n on each side, which
 * the caller must budget for.
 *
 * NOT seed parity. Parity is a property of the seed stream, not a random draw,
 * and a stream whose scenarios alternate would hand the two halves systematically
 * different cells. `cellKey`s are sorted before shuffling so the split depends on
 * the seed and the cell set, never on record order in the store.
 *
 * @param {string[]} keys  scenario cell keys (`seed:postGap`)
 * @param {{seed: number}} options
 * @returns {{s1: Set<string>, s2: Set<string>}}
 */
export function splitCells(keys, { seed } = {}) {
  if (!Array.isArray(keys)) throw new TypeError('splitCells needs an array of cell keys')
  if (!Number.isInteger(seed)) throw new RangeError('splitCells seed must be an integer')
  const unique = [...new Set(keys)].sort()
  const rng = mulberry32(seed)
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[unique[i], unique[j]] = [unique[j], unique[i]]
  }
  // An odd count gives s1 the extra cell. Selection tolerates one more cell
  // more happily than evaluation does: evaluation is the half that is reported.
  const cut = Math.ceil(unique.length / 2)
  return { s1: new Set(unique.slice(0, cut)), s2: new Set(unique.slice(cut)) }
}

/**
 * Pick the arm with the highest mean over `cells`, and report the runner-up
 * margin. Ties are broken by armId so a tied selection is reproducible rather
 * than dependent on Map insertion order.
 *
 * `margin` is the quantity that decides whether the selection means anything: a
 * winner ahead by less than the selection-side MDE was chosen by noise, and the
 * caller must say so rather than reporting the winner alone.
 *
 * @param {Map<string, Map<string, number>>} valuesByArm  armId -> (cellKey -> value)
 * @param {Set<string>} cells
 * @returns {{armId: string|null, mean: number, margin: number, n: number}}
 */
export function selectBest(valuesByArm, cells) {
  const scored = []
  for (const [armId, byCell] of valuesByArm) {
    const values = []
    for (const key of cells) {
      const value = byCell.get(key)
      if (Number.isFinite(value)) values.push(value)
    }
    if (values.length) scored.push({ armId, mean: mean(values), n: values.length })
  }
  if (!scored.length) return { armId: null, mean: NaN, margin: NaN, n: 0 }
  scored.sort((a, b) => (b.mean - a.mean) || a.armId.localeCompare(b.armId))
  return {
    armId: scored[0].armId,
    mean: scored[0].mean,
    n: scored[0].n,
    margin: scored.length > 1 ? scored[0].mean - scored[1].mean : Infinity,
  }
}
