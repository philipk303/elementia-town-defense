// Retrospective paired re-read of the on-disk harness baselines (2026-08-04).
//
// Regenerates every number in
// docs/reviews/2026-08-04-paired-statistic-retrospective.md:
//
//   node test/harness/pairedReread.mjs [--tsv out.tsv]
//
// WHAT IS AND IS NOT RECOVERABLE
//
// The per-cell score arrays are NOT on disk in ANY file — every driver stores
// only per-comparison aggregates. So:
//
//   sign test  EXACT. `signs.better`/`signs.worse` are already true paired
//              counts (fusionRoster.js:77 compares arms scenario-key by
//              scenario-key), so signTest() reproduces them with no assumption
//              at all. Validated here against the 48 `signTestP` values the two
//              post-fix files happen to carry.
//   paired t   NOT RECOVERABLE. It needs sd(deltas); the files store only the
//              mean delta, the tie count and the unpaired SE. What this script
//              reports for pre-fix cells is an EXTRAPOLATION: paired|t| =
//              welch t x ratio, with the ratio's range taken from the 47 cells
//              where both statistics exist. That is a bracket, not a
//              measurement, and it is printed as `lo..hi` (never `N*`) so the
//              two can never be confused. Only values printed with a trailing
//              `*` are real.
//
// probe.js — the driver behind every DIAL SWEEP in this project, including the
// whole 2026-07-25 Phase 8A baseline — persists nothing and computes no sign
// counts. None of that work can be re-read at all. See section 6 of the review.
//
// MULTIPLICITY is applied symmetrically (Benjamini-Hochberg, q=0.05, family =
// one output file). Correcting only the cells that MOVE would hold the new
// readings to a stricter standard than the published ones, which is its own
// bias; the same correction is therefore also reported against the originally
// significant Welch cells.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { signTest } from './stats.js'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT = DIR
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json'))

// ---------- normalise every schema into a flat cell list ----------
const cells = []
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))
  const siting = j.siting ?? '(unrecorded)'
  const protocol = j.protocol ?? 'legacy'
  for (const [maze, mv] of Object.entries(j.mazes)) {
    if ('signs' in mv) {
      cells.push({
        file: f, protocol, siting, maze, arm: 'vs-Watchtower', subject: 'ROCK_TRAP',
        effect: mv.diff, welchT: mv.t, signs: mv.signs, pairedT: null, storedSignP: null,
        imputedEffect: mv.imputed?.diff, imputedT: mv.imputed?.t,
        split: mv.splitHalf, hangs: mv.hangs,
      })
      continue
    }
    for (const [subject, sv] of Object.entries(mv)) {
      for (const arm of ['wave1', 'wave4']) {
        const c = sv[arm]
        if (!c) continue
        cells.push({
          file: f, protocol, siting, maze, arm, subject,
          effect: c.effect, welchT: c.t, signs: c.signs,
          pairedT: c.pairedT ?? null, storedSignP: c.signTestP ?? null,
          imputedEffect: c.imputed?.effect, imputedT: c.imputed?.t,
          split: c.splitHalf, hangs: sv.hangs,
        })
      }
    }
  }
}

// Firepit retest (2026-08-02): the driver supports --out but was run without
// it, so the numbers exist only in docs/reviews/2026-08-02-firepit-retest.md
// section 2. Hand-transcribed; flagged as such.
cells.push(
  { file: 'firepit-retest(review-transcribed)', protocol: 'standalone', siting: 'n/a', maze: 'A', arm: 'vs-Watchtower', subject: 'FIREPIT', effect: -1.091, welchT: 13.06, signs: { better: 5, worse: 106, tied: 33 }, pairedT: null, storedSignP: null, imputedEffect: -1.091, imputedT: 13.06, split: { agree: true }, hangs: { firepit: 0 } },
  { file: 'firepit-retest(review-transcribed)', protocol: 'standalone', siting: 'n/a', maze: 'B', arm: 'vs-Watchtower', subject: 'FIREPIT', effect: 0.027, welchT: 0.17, signs: { better: 41, worse: 51, tied: 45 }, pairedT: null, storedSignP: null, imputedEffect: -0.139, imputedT: 0.82, split: { agree: false }, hangs: { firepit: 7 } },
  // Tower baseline retake (2026-08-01), review section table. Fusion arms only;
  // the tie count is not recorded, so `tied` is derived and unused by signTest.
  { file: 'tower-baseline-retake(review-transcribed)', protocol: 'legacy', siting: '(unrecorded)', maze: 'A', arm: 'wave1', subject: 'FUSION(generic)', effect: 0.012, welchT: 0.23, signs: { better: 23, worse: 23, tied: NaN }, pairedT: null, storedSignP: null, split: null, hangs: null },
  { file: 'tower-baseline-retake(review-transcribed)', protocol: 'legacy', siting: '(unrecorded)', maze: 'A', arm: 'wave4', subject: 'FUSION(generic)', effect: 0.064, welchT: 1.16, signs: { better: 31, worse: 24, tied: NaN }, pairedT: null, storedSignP: null, split: null, hangs: null },
  { file: 'tower-baseline-retake(review-transcribed)', protocol: 'legacy', siting: '(unrecorded)', maze: 'B', arm: 'wave1', subject: 'FUSION(generic)', effect: 0.056, welchT: 0.57, signs: { better: 28, worse: 26, tied: NaN }, pairedT: null, storedSignP: null, split: null, hangs: null },
  { file: 'tower-baseline-retake(review-transcribed)', protocol: 'legacy', siting: '(unrecorded)', maze: 'B', arm: 'wave4', subject: 'FUSION(generic)', effect: 0.104, welchT: 0.79, signs: { better: 35, worse: 35, tied: NaN }, pairedT: null, storedSignP: null, split: null, hangs: null },
  // Rock Trap, the LANDED retune (splashRadiusPx 48 / cooldownMs 3000). Neither
  // on-disk JSON contains it: `.rocktrap-standalone.json` is pre-site-cap-fix and
  // `-sitefix.json` is the fix alone with no balance change. The confirmation run
  // is table 5 of docs/reviews/2026-08-04-rock-trap-site-cap-fix-and-balance-
  // tweak.md. Reading either JSON as "the landed retune" reverses maze A's sign.
  { file: 'rocktrap-LANDED-retune(review-transcribed)', protocol: 'standalone', siting: 'n/a', maze: 'A', arm: 'vs-Watchtower', subject: 'ROCK_TRAP', effect: 0.122, welchT: 1.16, signs: { better: 48, worse: 49, tied: 47 }, pairedT: null, storedSignP: null, imputedEffect: 0.122, imputedT: 1.16, split: { agree: true }, hangs: { rockTrap: 0 } },
  { file: 'rocktrap-LANDED-retune(review-transcribed)', protocol: 'standalone', siting: 'n/a', maze: 'B', arm: 'vs-Watchtower', subject: 'ROCK_TRAP', effect: 1.382, welchT: 8.73, signs: { better: 89, worse: 16, tied: 39 }, pairedT: null, storedSignP: null, imputedEffect: 1.382, imputedT: 8.73, split: { agree: true }, hangs: { rockTrap: 0 } },
  // Original tower baseline (2026-07-25), section "2a free special".
  { file: 'tower-baseline-2026-07-25(review-transcribed)', protocol: 'legacy', siting: '(unrecorded)', maze: 'A', arm: 'free-special', subject: 'SPECIAL(generic)', effect: 0.132, welchT: 1.32, signs: { better: 38, worse: 24, tied: NaN }, pairedT: null, storedSignP: null, split: null, hangs: null },
  { file: 'tower-baseline-2026-07-25(review-transcribed)', protocol: 'legacy', siting: '(unrecorded)', maze: 'B', arm: 'free-special', subject: 'SPECIAL(generic)', effect: -0.002, welchT: 0.01, signs: { better: 30, worse: 34, tied: NaN }, pairedT: null, storedSignP: null, split: null, hangs: null },
)

// ---------- validate the sign-test recomputation against stored values ----------
let checked = 0
for (const c of cells) {
  if (c.storedSignP === null) continue
  const mine = signTest(c.signs.better, c.signs.worse).p
  if (Math.abs(mine - c.storedSignP) > 1e-12) {
    console.error(`SIGN TEST MISMATCH ${c.file} ${c.maze} ${c.subject} ${c.arm}: mine ${mine} stored ${c.storedSignP}`)
    process.exit(1)
  }
  checked++
}
console.log(`sign-test recomputation validated against ${checked} stored values`)

// ---------- calibration: paired |t| / unpaired t, where both exist ----------
const cal = cells.filter(c => c.pairedT !== null && c.welchT > 0)
  .map(c => ({ ratio: Math.abs(c.pairedT) / c.welchT, tie: c.signs.tied / (c.signs.better + c.signs.worse + c.signs.tied) }))
const ratios = cal.map(c => c.ratio).sort((a, b) => a - b)
const q = p => ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))]
const RMIN = ratios[0], RMAX = ratios.at(-1)
const R10 = q(0.10), R90 = q(0.90), RMED = q(0.5)

const n = cal.length
const mx = cal.reduce((s, c) => s + c.tie, 0) / n
const my = cal.reduce((s, c) => s + c.ratio, 0) / n
let sxy = 0, sxx = 0, syy = 0
for (const c of cal) { sxy += (c.tie - mx) * (c.ratio - my); sxx += (c.tie - mx) ** 2; syy += (c.ratio - my) ** 2 }
const b = sxy / sxx, a = my - b * mx
const r2 = (sxy * sxy) / (sxx * syy)
const resid = cal.map(c => c.ratio - (a + b * c.tie))
const rsd = Math.sqrt(resid.reduce((s, v) => s + v * v, 0) / (n - 2))

console.log(`CALIBRATION  n=${n}  ratio min ${RMIN.toFixed(3)} p10 ${R10.toFixed(3)} med ${RMED.toFixed(3)} p90 ${R90.toFixed(3)} max ${RMAX.toFixed(3)}`)
console.log(`  fit ratio = ${a.toFixed(3)} + ${b.toFixed(3)}*tieFrac   R2 ${r2.toFixed(3)}  residual sd ${rsd.toFixed(3)}`)
console.log('')

// ---------- two-sided p from a t statistic (regularised incomplete beta) ----------
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
const tTwoSided = (t, df) => ibeta(df / 2, 0.5, df / (df + t * t))

// ---------- per-cell re-read ----------
const T_CRIT = 2
const POSTFIX = f => /roster-isolated/.test(f)

// Why a cell cannot support a balance conclusion, in the order the gates bind.
// The FIRST draft of this script used one blanket rule ("legacy siting => dead")
// and got it wrong in both directions: it blocked maze-B cells the confound
// diagnosis explicitly calls sound (2026-08-04-fusion-siting-confound-
// diagnosis.md section 5: "maze B shows no meaningful spread, so maze B numbers
// are likely sound; maze A fusion numbers should be treated as unverified"),
// and it EXEMPTED Firepit and the tower baselines, which run through the same
// harness and are named by that same section. These are the real gates:
//
//   reverted     the run measures a balance value that 4937f2a reverted, or a
//                screening candidate that never landed. The structure it
//                describes does not exist. Airtight and maze-independent.
//   superseded   the same quantity was re-measured on the isolated instrument
//                on 2026-08-04. The later reading governs; the earlier one is
//                evidence about the old instrument, not about the structure.
//   siting-A     maze A only: the ~1.2-point Watchtower-displacement artifact.
//                Does NOT transfer to maze B, per the diagnosis above and the
//                isolated retake's own protocol comparison ("the two protocols
//                agree on maze B, 5 of 6 within +/-0.16").
//   instrument   2-wide-footprint site-cap defect, un-remediated for this run.
//   ok           no structural gate; the statistical gates still apply.
const REVERTED = /blizzard-hp|grinder-v|magma-v2|muddybog-v|steamvent-v2|roster-legacy-currentvalues/
const SUPERSEDED = /fusion-roster-output|fusion-roster-funnel/
function structuralGate(f, maze) {
  if (POSTFIX(f)) return 'ok'
  if (/rocktrap-LANDED/.test(f)) return 'ok'
  // Pre-site-cap-fix Rock Trap and the fix-only run are superseded by the
  // landed-retune confirmation transcribed above; Firepit shares the 2-wide
  // site-cap defect and was never re-measured under the fix
  // (2026-08-04-rock-trap-site-cap-fix-and-balance-tweak.md section 1).
  if (/rocktrap-standalone/.test(f)) return 'superseded'
  if (/firepit/.test(f)) return 'instrument'
  if (REVERTED.test(f)) return 'reverted'
  if (SUPERSEDED.test(f)) return 'superseded'
  if (/tower-baseline/.test(f)) return maze === 'A' ? 'siting-A' : 'ok'
  return 'siting-A'
}

const rows = []
for (const c of cells) {
  const { better, worse } = c.signs
  const st = signTest(better, worse)
  const lo = c.welchT * RMIN, hi = c.welchT * RMAX
  const lo10 = c.welchT * R10, hi90 = c.welchT * R90

  const welchSig = c.welchT > T_CRIT
  const signSig = st.p < 0.05
  const pairBand = c.pairedT !== null
    ? (Math.abs(c.pairedT) > T_CRIT ? 'SIG*' : 'NULL*')
    : lo > T_CRIT ? 'SIG' : hi < T_CRIT ? 'NULL' : lo10 > T_CRIT ? 'lean-SIG' : hi90 < T_CRIT ? 'lean-NULL' : 'INDET'
  const pairSig = pairBand === 'SIG*' || pairBand === 'SIG'

  const df = (c.signs.better + c.signs.worse + (Number.isNaN(c.signs.tied) ? 0 : c.signs.tied)) - 1
  const pairedP = c.pairedT !== null ? tTwoSided(Math.abs(c.pairedT), df) : null
  const welchP = tTwoSided(c.welchT, 2 * (df + 1) - 2)

  rows.push({
    ...c, st, lo, hi, lo10, hi90, welchSig, signSig, pairBand, pairSig, pairedP, welchP, df,
    dirEffect: Math.sign(c.effect), dirSigns: Math.sign(better - worse),
    era: POSTFIX(c.file) ? 'post-fix' : 'pre-2026-08-04',
    confound: structuralGate(c.file, c.maze),
  })
}

// ---------- multiplicity: Benjamini-Hochberg FDR on the sign-test p-values ----------
// 168 cells at alpha 0.05 expects ~8 false positives among true nulls. Without
// this the re-read manufactures exactly the over-reading the more sensitive
// statistic makes easier. Applied globally (most conservative family) and
// within each file (the family a single run's reader actually looks at).
// Marks `<key>BH` (pass/fail at q=0.05) and `<key>Q` (adjusted q) on each row.
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
for (const r of rows) r.signP = r.st.p
bhMark(rows, 'signP')                      // global family, reported as a sanity bound
for (const r of rows) { r.qGlobal = r.signPQ; r.bhGlobal = r.signPBH }
for (const f of new Set(rows.map(r => r.file))) {
  const grp = rows.filter(r => r.file === f)
  bhMark(grp, 'signP')
  for (const r of grp) r.bhFile = r.signPBH
}

const fmt = v => (v === undefined || v === null || Number.isNaN(v)) ? '-' : (v >= 0 ? '+' : '') + v.toFixed(3)
const pt = r => r.pairedT !== null ? r.pairedT.toFixed(2) + '*' : `${r.lo.toFixed(2)}..${r.hi.toFixed(2)}`
const out = [['file', 'era', 'confound', 'proto', 'siting', 'mz', 'arm', 'subject', 'effect', 'welchT', 'welch', 'b/w/t', 'signP', 'sign', 'pairT', 'band', 'split', 'hangs'].join('\t')]
for (const r of rows) out.push([
  r.file.replace(/^\./, '').replace(/\.json$/, ''), r.era, r.confound, r.protocol, r.siting, r.maze, r.arm, r.subject,
  fmt(r.effect), r.welchT.toFixed(2), r.welchSig ? 'SIG' : 'null',
  `${r.signs.better}/${r.signs.worse}/${Number.isNaN(r.signs.tied) ? '?' : r.signs.tied}`,
  r.st.p.toFixed(4), r.signSig ? 'SIG' : 'null', pt(r), r.pairBand,
  r.split ? (r.split.agree ? 'agree' : 'FLIP') : '-',
  r.hangs ? Object.values(r.hangs).reduce((x, y) => x + y, 0) : '-',
].join('\t'))
const tsvArg = process.argv.indexOf('--tsv')
if (tsvArg !== -1 && tsvArg + 1 < process.argv.length) {
  fs.writeFileSync(process.argv[tsvArg + 1], out.join('\n'))
  console.log(`wrote ${rows.length} cells to ${process.argv[tsvArg + 1]}`)
} else {
  console.log(`${rows.length} cells read (pass --tsv <path> to dump the full table)`)
}

const show = r => `  [${r.confound.padEnd(10)}] ${r.file.replace(/^\./, '').replace(/\.json$/, '').padEnd(40)} ${r.maze} ${r.subject.padEnd(12)} ${r.arm.padEnd(13)} eff ${fmt(r.effect)} | welchT ${r.welchT.toFixed(2)} | signP ${r.st.p.toFixed(4)} q${r.qGlobal.toFixed(3)}${r.bhGlobal ? 'BH' : '  '}${r.bhFile ? '/f' : '  '} (${r.signs.better}/${r.signs.worse}) | pairT ${pt(r)} ${r.pairBand} | split ${r.split ? (r.split.agree ? 'agree' : 'FLIP') : '-'} | hangs ${r.hangs ? Object.values(r.hangs).reduce((x, y) => x + y, 0) : '-'}`

const bucket = (label, pred) => {
  const g = rows.filter(pred)
  console.log(`\n=== ${label}: ${g.length} ===`)
  for (const r of g) console.log(show(r))
  return g
}

bucket('A. PROMOTED — Welch null, BOTH paired-band and sign test say signal (strongest)',
  r => !r.welchSig && r.pairSig && r.signSig)
bucket('B. PROMOTED by sign test only — Welch null, sign SIG, paired band not conclusive',
  r => !r.welchSig && r.signSig && !r.pairSig)
bucket('C. PROMOTED by paired band only — Welch null, band SIG, sign test NOT significant',
  r => !r.welchSig && r.pairSig && !r.signSig)
bucket('D. STATISTICS DISAGREE at an already-significant cell — Welch SIG but sign test null',
  r => r.welchSig && !r.signSig)
bucket('E. CONFIRMED — Welch SIG and sign SIG (unchanged)', r => r.welchSig && r.signSig)
bucket('F. DIRECTION CONFLICT — mean and sign counts point opposite ways',
  r => r.dirEffect !== 0 && r.dirSigns !== 0 && r.dirEffect !== r.dirSigns)
bucket('G. INDETERMINATE — Welch null, sign null, paired band cannot rule either way',
  r => !r.welchSig && !r.signSig && !r.pairSig && !/NULL/.test(r.pairBand))
const g = rows.filter(r => !r.welchSig && !r.signSig && /NULL/.test(r.pairBand))
console.log(`\n=== H. UNCHANGED NULL — all three agree on no signal: ${g.length} ===`)

// ---------- multiplicity, applied SYMMETRICALLY -------------------------------
// The published baselines read every cell at an uncorrected t>2. Gating only the
// NEW promotions with an FDR correction would apply a stricter standard to the
// findings that move than to the ones that stay, which is its own bias. So BH is
// run on all three statistics, within each file (the family a reader of one run
// actually scans), and reported for the old verdicts as well as the new ones.
for (const f of new Set(rows.map(r => r.file))) {
  const grp = rows.filter(r => r.file === f)
  bhMark(grp, 'welchP'); bhMark(grp, 'pairedP')
}
for (const r of rows) r.signPBH = r.bhFile

console.log(`\n=== MULTIPLICITY, within-file BH at q=0.05 ===`)
console.log(`  Welch  t>2 uncorrected: ${rows.filter(r => r.welchSig).length}/${rows.length}   BH-surviving: ${rows.filter(r => r.welchPBH).length}`)
console.log(`  sign   p<.05 uncorrected: ${rows.filter(r => r.signSig).length}/${rows.length}   BH-surviving: ${rows.filter(r => r.signPBH).length}`)
const withPaired = rows.filter(r => r.pairedP !== null)
console.log(`  paired |t|>2 uncorrected: ${withPaired.filter(r => Math.abs(r.pairedT) > 2).length}/${withPaired.length}   BH-surviving: ${withPaired.filter(r => r.pairedPBH).length}   (only the 2 post-fix files carry a real paired t)`)

// ---------- survival filter on the promotions ----------
const promoted = rows.filter(r => !r.welchSig && (r.pairSig || r.signSig))
console.log(`\n=== SURVIVAL of the ${promoted.length} promotions (BH within-file + split-half + hangs + confound) ===`)
const hangCount = r => r.hangs ? Object.values(r.hangs).reduce((x, y) => x + y, 0) : 0
for (const r of promoted) {
  const gates = []
  const statOK = (r.signSig && r.signPBH) || (r.pairedP !== null && r.pairedPBH) ||
    (r.pairedP === null && r.pairBand === 'SIG' && r.signSig && r.signPBH)
  if (!statOK) gates.push('no statistic survives within-file BH')
  if (r.split && !r.split.agree) gates.push('split-half FLIP')
  if (hangCount(r) > 0) gates.push(`hangs ${hangCount(r)}`)
  if (r.confound !== 'ok') gates.push(r.confound)
  console.log(`  ${gates.length === 0 ? 'SURVIVES ' : 'blocked  '} ${r.file.replace(/^\./, '').replace(/\.json$/, '').padEnd(38)} ${r.maze} ${r.subject.padEnd(12)} ${r.arm.padEnd(13)} ${gates.join(', ') || '(all gates clear)'}`)
}

// how many ORIGINAL Welch verdicts survive the same treatment
const oldSig = rows.filter(r => r.welchSig)
const oldSurvive = oldSig.filter(r => r.welchPBH && (!r.split || r.split.agree) && hangCount(r) === 0)
console.log(`\n=== SAME TREATMENT applied to the ${oldSig.length} originally-significant Welch cells ===`)
console.log(`  survive BH-within-file + split-half + zero hangs: ${oldSurvive.length}`)
console.log(`  of those, with no structural gate: ${oldSurvive.filter(r => r.confound === 'ok').length}`)
for (const r of oldSig.filter(r => !oldSurvive.includes(r))) {
  const why = [!r.welchPBH && 'fails BH', r.split && !r.split.agree && 'split FLIP', hangCount(r) > 0 && `hangs ${hangCount(r)}`].filter(Boolean)
  console.log(`  RETIRED  ${r.file.replace(/^\./, '').replace(/\.json$/, '').padEnd(38)} ${r.maze} ${r.subject.padEnd(12)} ${r.arm.padEnd(13)} welchT ${r.welchT.toFixed(2)} — ${why.join(', ')}`)
}

// ---------- focused view: the post-fix isolated instrument, all three stats ----------
console.log('\n=== POST-FIX ISOLATED INSTRUMENT — per-statistic, uncorrected vs within-file BH ===')
console.log('file          mz subject      arm    effect   welchT welchQ  BH | pairedT pairedQ BH | signP  signQ  BH | split')
for (const r of rows.filter(r => /roster-isolated/.test(r.file)).sort((x, y) => (x.subject + x.maze + x.arm).localeCompare(y.subject + y.maze + y.arm))) {
  console.log([
    (/funnel/.test(r.file) ? 'funnel' : 'flank ').padEnd(7), r.maze, r.subject.padEnd(11), r.arm.padEnd(6),
    (r.effect >= 0 ? '+' : '') + r.effect.toFixed(3),
    r.welchT.toFixed(2).padStart(6), r.welchPQ.toFixed(3).padStart(6), (r.welchPBH ? 'Y' : '.').padStart(2), '|',
    r.pairedT.toFixed(2).padStart(7), r.pairedPQ.toFixed(3).padStart(6), (r.pairedPBH ? 'Y' : '.').padStart(2), '|',
    r.st.p.toFixed(4).padStart(6), r.signPQ.toFixed(3).padStart(6), (r.signPBH ? 'Y' : '.').padStart(2), '|',
    r.split.agree ? 'agree' : 'FLIP',
  ].join(' '))
}
