# What `hallHpAuc` actually measures, and the two halves of the censoring check that were missing

Date: 2026-08-26 (findings), revised 2026-08-27 after adversarial review.
Author: Opus 5. Type: **descriptive re-read of committed corpora. No new runs.
No verdict retracted.**

Sources: the five `2026-08-16-fusion-r2-*` stores (12,000 runs each, engine
`fc32f6f`), `2026-08-16-maze-split-mechanism` (36,000 runs, engine `5005dc1`),
and the R1-regime `2026-08-15-metric-selection-v2` / `income-calibration`
stores. The probe is descriptive and imports nothing from `matchRunner.js`.

---

## 0. RETRACTION — the first draft of this document was wrong

The 2026-08-26 draft claimed the censoring check was "vacuous," "pinned at 1/n
by construction," that it "could not fail, and it never did," and that every
published "0% at the ceiling" line was an artifact. **All of that is false, and
it was committed to three source comments before being caught.**

The error was assuming `hallHpAuc` is continuous at its bounds. It is not. A run
that is never damaged scores **exactly `waves.length`** — an integer — so the
ceiling is an **atom**, and exact equality against the observed maximum measures
precisely the right quantity. Recomputed, the old check's share equals the
undamaged-run share to the digit:

| corpus / maze | old `ceilingShare` | share of runs never damaged |
|---|---|---|
| metric-selection-v2 / A | 37.78% | 37.78% |
| metric-selection-v2 / B | 20.90% | 20.90% |
| income-calibration / A | 26.74% | 26.74% |
| income-calibration / B | 15.28% | 15.28% |

The check also demonstrably fired and changed the project's course:
`docs/reviews/2026-08-15-regime-r2-adoption.md:50` — *"In R1, 19% (A) and 34% (B)
of control runs sat at the observed `hallHpAuc` maximum"* — is the primary
published evidence for adopting R2. That number came from this check. R2's
subsequent 0% is not an artifact either: the undamaged share under R2 is
0.00–0.20%.

A range-relative tolerance band was written to replace exact equality and has
been **reverted**. It measures mode tightness, not proximity to a bound: on a
clean bimodal distribution with nothing censored it reports 31% at both ends.

---

## 1. What was actually broken, and is now fixed

Two real defects, neither of them the one first claimed.

**(a) There was no floor share at all.** `describe()` took a ceiling and nothing
else. Under R2, **98.8–100% of runs end with the hall dead** in every cell — a
control measured entirely below its own failure point is as unreadable as one at
its ceiling, and nothing in the analyser would have said so.

**(b) The warning bar was 50% while every prereg gates at 10%.**
`CEILING_WARNING_SHARE = 0.5` against `regime-r2-adoption.json` gate 3, which
asks for the control to be under 10% at the maximum. A control failing the
registered gate by nearly 4x printed a clean table. **This is the defect that
mattered**, and it is why the R1 ceiling problem had to be found by a human
reading numbers rather than by the tool saying so.

Fixed in `analyze.mjs`: exact equality retained and its rationale documented, a
symmetric `floorShare` added and rendered, the bar lowered to the registered
`BOUND_WARNING_SHARE = 0.10`, and `describe(controlRecords, …)` collapsed from
three scans per comparison to one.

Verified against the R1 corpus the fix exists for. `metric-selection-v2` now
prints, where it previously printed nothing:

```
CEILING WARNING: hallHpAuc/A control is 33% at the observed maximum (registered bar 10%)
CEILING WARNING: hallHpAuc/B control is 18% at the observed maximum (registered bar 10%)
CEILING WARNING: wavesCleared/A control is 50% at the observed maximum (registered bar 10%)
```

Three tests added, two verified red-green against the pre-fix code (the ceiling
warning at a 20% share, and the floor share's existence). The third — a
degenerate all-identical cell reporting total censoring — is a **guard, not a
red-green**: the old code answered it correctly too, and it is there so a future
tolerance-band rewrite cannot silently turn a zero-width range into `NaN`.

**No published R2 conclusion changes.** Re-running the corrected analyser over
the fusion-r2 stores gives `hallHpAuc` 0% at the ceiling and 0.00–4.07% at the
floor across all corpora, against the declared 10% bar. Note the R2 adoption
family's own store is **not committed**, so its gate 3 cannot be re-checked
directly; the above is the same regime and metric on adjacent families, not the
adoption family itself.

---

## 2. `hallHpAuc` is mostly a wave count

`analyze.mjs:227` sums one trapezoid per wave record and **never divides by the
number of waves**. The upper limit of the sum is itself the outcome. Under R2,
`maxWaves` is 10 and `BALANCE.WAVE_COUNT` is 10, so the `stoppedEarly` break at
`matchRunner.js:773` never fires and every run terminates at WON or LOST.

The decomposition that matters is on the **paired delta**, because every
published verdict is a paired delta — not on the cross-seed level. Share of
each corpus's arm-vs-control delta explained by the `wavesCleared` delta alone:

| corpus | maze A | maze B | hall dead at end (A / B) |
|---|---|---|---|
| fusion-r2-firestorm | **0.573** | 0.923 | 98.8% / 100% |
| fusion-r2-muddy-bog | 0.840 | 0.927 | 100% / 100% |
| fusion-r2-grinder | 0.841 | 0.921 | 99.9% / 100% |
| fusion-r2-magma-trap | 0.868 | 0.914 | 99.9% / 100% |
| fusion-r2-blizzard | 0.892 | 0.888 | 98.9% / 99.4% |

**57–93% of every published effect is the wave count.** The remaining share is
the pre-death damage trajectory, not surviving hall HP — there is essentially no
surviving hall HP in R2.

The R2 adoption review justified the metric this way:

> "`hallHpAuc` is exempt because it is an integral over the waves actually played
> rather than an end state" (`2026-08-15-regime-r2-adoption.md:76`)

It is not an integral — it is an un-normalised sum, better read as
`waves × (mean hall health per wave)`, a product. The first draft of this
document called the non-count part a "sub-unit remainder" and drew an analogy to
`score`. **That was also wrong:** `hallHpAuc − wavesCleared` spans −1.50..+0.50
on maze A and as wide as **−3.55..+0.50** on maze B, up to four times the
metric's own sd. The remainder is large, not sub-unit, and the `score` analogy
does not hold.

**None of this disqualifies `hallHpAuc`.** It resolves effects `wavesCleared`
alone does not (firestorm/A: t 6.10 vs 5.33; blizzard/B: 12.65 vs 8.75), and its
R1 ceiling behaviour is what correctly drove the move to R2. What is being
corrected is the *description*, and the confidence that travelled with it.

---

## 3. Normalising by waves played is a worse metric, and the check for it was wrong too

Because the sum is un-normalised, "divide by waves played" looks like a
defensible alternative. It is not, and the first draft of this document was
wrong to raise it as an alarm.

Dividing by waves played converts the metric into *mean hall health while
alive*, which **rewards dying early with a healthy hall**: a run that collapses
in wave 4 with the hall untouched scores 1.0. Three cells change sign under it —
`grinder/A`, `blizzard/A`, `earth-wind/B`. On all three, the declared secondary
`wavesCleared` **agrees with the raw metric and disagrees with the normalised
one**:

| cell | raw Δ (t) | normalised Δ (t) | `wavesCleared` Δ (t) |
|---|---|---|---|
| grinder / A | −0.038 (−2.47) | +0.0033 (4.85) | **−0.072 (−4.40)** |
| blizzard / A | −0.193 (−12.63) | +0.0009 (1.68) | **−0.220 (−12.46)** |
| earth-wind / B | −0.164 (−6.02) | +0.0074 (6.67) | **−0.217 (−7.05)** |

`earth-wind/B` clears **fewer** waves and still scores positive normalised. That
is the pathology, observed directly. The normalised metric is the outlier here,
not the raw one, and no published cell is in doubt on this evidence.

(`blizzard/A`'s normalised reading is t 1.68 — unresolvable. Calling that a
"sign flip" was itself an overstatement.)

### What follows

1. **Keep `hallHpAuc` raw.** Adopted, registered, not disqualified.
2. **Describe it correctly:** "waves survived, refined by the pre-death damage
   trajectory." Never "an integral of hall health."
3. **Report `wavesCleared` alongside it on every cell.** It is already a declared
   secondary and it is 57–93% of every published effect. **Where the two disagree
   in sign, the effect lives entirely in the remainder and the cell should not
   support a verdict alone.** No currently published cell is in that state.
4. **Do not use normalisation as a diagnostic.** The first draft proposed it as
   a fragility filter; it flags cells the declared secondary confirms, and it
   has a known pathology in the direction of the flags it raises.

---

## 4. What this does not touch

The arbitrary-control problem (`2026-08-16-maze-split-mechanism` §2: the
control's own maze swing explains 58–96% of each fusion's apparent split) is a
comparison-design defect and is untouched by anything here. It remains the
largest open item.
