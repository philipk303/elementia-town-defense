# metric-selection-v2 — result

Date: 2026-08-15. Status: **GATED VERDICT**. Family `metric-selection-v2`,
2880 runs, engine `2bed80e`, balance `89888d25`, clean, no hangs (0/2880).
Registration `valid`, `verdictAllowed: true`, actual tests 56 = declared
`familySize` 56.

**Verdict, up front: `hallHpAuc` is CONFIRMED and adopted as the primary
outcome metric.** It is the only metric that recovers every rung of the
Watchtower ladder on both mazes through all four gates, it is monotone on both
mazes, and it has the largest paired effect size in all 8 of the cells where it
competes with the other qualifying metrics. Adopting it over `score` buys
roughly a **40% reduction in required n** for the same power.

This is also the first time this harness has recovered an injected balance
change at a corrected q. The instrument works.

---

## 0. The corpus was not analysable as committed

The first run of the pre-registered command emitted descriptives under
`!!! EXPLORATORY — NO VERDICT: preregistration is schema-invalid !!!` and
computed **zero** comparisons. The cause was not the data. `analyze.mjs:532`
passes a schema-invalid registration to `analyzeBand` as `undefined`, and
`analyze.mjs:410` skips all comparison work when there is no prereg — so the
family silently degraded to a descriptives dump.

The four validation errors were all field-shape, none statistical:
`$.regime`, `$.amendedAt`, `$.amendmentNote` not allowed, and
`$.positiveControl.expectedEffect` required where the prereg declared
`expectedDirection`.

**The fix was applied to the reader, not to the record.**
`test/harness/prereg/metric-selection-v2.json` is byte-identical to its
committed form; editing a pre-registration after its corpus has run is exactly
what pre-registration exists to prevent, and no reader could later distinguish
a renamed field from a moved gate. Instead `_schema.json` gained `regime`,
`amendedAt`, `amendmentNote`, and `positiveControl.expectedDirection`.

The one substantive question inside that fix: `expectedEffect` is a *number*,
and the schema required it. That field encodes a real commitment — how big an
effect the injected change should produce, declared before looking. v2 declared
a direction instead. That is legitimate **for a ladder control specifically**:
five arms spanning 0.67x–2x have no single expected effect, and "monotone
increasing on both mazes" is the stronger and more falsifiable commitment.
So the schema now accepts either form, and because the hand-rolled validator has
no `anyOf`, `loadRegistration` enforces that **exactly one** of the two is
present. A positive control committing to neither size nor ordering makes no
falsifiable prediction and is still rejected.

`positiveControl` is read by nothing in `analyze.mjs`; it is documentation. The
gate that was restored is the whole comparison layer, not that field.

---

## 1. Instrument validation

Gates, all required: BH-adjusted q<0.05 across the family of 56; exact sign test
agreeing in direction; split-half rho > 0.5; survival of hang-imputation at the
cell minimum. n = 288 paired cells in every comparison.

Smallest Watchtower change recovered **on both mazes**:

| metric | smallest dose recovered | cells passing 4/4 |
|---|---|---|
| **hallHpAuc** | **±33% (x0.67 and x1.33)** | **8 / 8** |
| score | ±33% | 8 / 8 |
| wavesCleared | ±33% | 8 / 8 |
| hallHpFrac | −33% only (B x1.33 fails, q=0.12) | 7 / 8 |
| closestApproachPxMin | −33% only (B x1.33 fails, q=0.20) | 7 / 8 |
| enemySeconds | ±67% (x1.67) | 5 / 8 |
| structuresLostTotal | **none on maze B** | 3 / 8 |

`structuresLostTotal` is **disqualified**: it recovers no dose at all on maze B
(all four |t| < 1.4). `enemySeconds` survives but only at the 67% rung, twice
the resolution of the leaders.

The downward rung earned its place. Every qualifying metric recovers `wt-x0.67`
as well as the buffs, which is what distinguishes a metric that tracks defence
strength from one that merely saturates upward.

## 2. Monotonicity, under the v2 rule

Ladder means (x0.67 → control → x1.33 → x1.67 → x2) are monotone in the
expected direction for `score`, `wavesCleared`, `hallHpFrac`, `hallHpAuc` and
`closestApproachPxMin` on **both** mazes. Spearman rho = 1.0.

Two metrics invert, both only on maze B:

- `enemySeconds` B: inverts at x0.67→control (Δ +8.27, q = 0.60) and
  control→x1.33 (Δ +13.40, q = 0.25).
- `structuresLostTotal` B: inverts at three adjacent pairs, none resolvable
  (q = 0.21, 0.62/0.58, 0.58/0.19).

**Neither is disqualified for non-monotonicity.** Every offending adjacent pair
is unresolvable at BH-adjusted q, so under the v2 rule both are reported as
*unresolved ordering*, not as failures to order. This is the rule doing exactly
the work it was written for: under v1's method both would have been struck for
"non-monotonicity" on the basis of unseparated means. They are instead struck —
`structuresLostTotal` fully, `enemySeconds` partially — for the correct reason,
which is failing to recover doses.

**No metric in this family was disqualified for non-monotonicity.**

## 3. Metric adoption

Three metrics pass gate (1) fully and preserve ordering: `hallHpAuc`, `score`,
`wavesCleared`. Because all comparisons share n = 288, paired |d| =
|Δ| / sd(Δ) is directly comparable, and a larger |d| means a smaller detectable
dose.

| cell | hallHpAuc | score | wavesCleared |
|---|---|---|---|
| A x0.67 | **0.279** | 0.204 | 0.163 |
| A x1.33 | **0.289** | 0.231 | 0.235 |
| A x1.67 | **0.402** | 0.298 | 0.297 |
| A x2 | **0.387** | 0.354 | 0.329 |
| B x0.67 | **0.351** | 0.285 | 0.296 |
| B x1.33 | **0.343** | 0.233 | 0.271 |
| B x1.67 | **0.396** | 0.299 | 0.302 |
| B x2 | **0.544** | 0.427 | 0.430 |

`hallHpAuc` wins **8 of 8**, by a mean ratio of about 1.29 over `score`. Since
required n scales as 1/d², that is a **~40% reduction in runs for equal power**
— and the margin is widest at the small rungs (B x1.33: 1.47x), which is
precisely where a balance verdict lives.

`hallHpAuc` is adopted. `score` stands as the declared secondary.

## 4. Caveats that travel with the adoption

1. **`hallHpAuc` has a hard ceiling at 8.0 in R1** (8 waves x max HP fraction).
   Maze A is already close to it: the x1.67→x2 rung moves the mean by **+0.0011**
   (7.7497 → 7.7508) and 46% of x2 runs sit at the observed maximum. Ordering is
   preserved, so this is not a disqualification, but **maze A has effectively no
   headroom above a 2x Watchtower buff**. A fusion stronger than that may
   saturate the metric on maze A. Re-check the ceiling share before reading any
   large positive effect there.

2. **Split-half rho is 0.70 on maze A**, against 0.90 for `score` and
   `wavesCleared`. It clears the >0.5 gate but is the weakest of the three on
   that gate. `hallHpAuc` buys its sensitivity partly with a noisier
   within-cell signal.

3. `wavesCleared` shows a 64% ceiling share on maze A at x2 — above the
   harness's own 50% warning threshold. It is the most ceiling-bound of the
   three and should not be preferred on maze A regardless of the adoption result.

4. **The R1 scope limit stands unchanged**: `maxWaves 8` means waves 9 and 10 —
   where the elites concentrate — are never measured. No verdict from this
   corpus generalises to the full 10-wave game.

## 5. What this does NOT establish

- No balance change is implied or shipped. Every Watchtower value here is an
  injected instrument dose; `TOWER.WATCHTOWER.damage` remains at its shipped
  value of 3.
- Nothing here re-opens the retired goblin-HP dose ladder or the 2026-08-04
  siting ruling.
- The maze-B position-cap saturation remains unfixed. R1 works around it by
  shortening the horizon.
- Cross-policy agreement is **not** yet tested — there is still only one build
  policy. That gate is empty until WP5 lands, and every verdict from this
  instrument is provisional on it.

## 6. Next

1. WP5 (`competent-v1` build policy), with a code review — a subtly broken
   second policy silently invalidates the cross-policy gate protecting every
   future verdict.
2. The balance pass (fusion roster vs A1.4(a)) re-measured on v2 with
   `hallHpAuc`, honouring caveat 1 on maze A.
