# The R2 fusion roster re-take — five fusions against a two-ingredient control

> **CORRECTION, 2026-08-27 — Muddy Bog's maze-A PASS is withdrawn.**
> `stats.js:signTest` seeded its tail with `Math.pow(0.5, n)`, which underflows
> to exactly 0 for n > 1074, so every sign test on more than 1074 untied pairs
> returned p = 0 and passed the sign gate for free. Fixed 2026-08-27 (log-space
> accumulation, regression-tested). Re-running this corpus under the fix:
> **`hallHpAuc` / maze A / `muddy-bog` (2264 untied pairs) has true sign
> p = 0.303, so its conjunction FAILS.** The table below reports it as
> `+0.051 (t 3.61, q 0.003)` with verdict `PASS (via A)`; the delta and q are
> correct, the verdict is not. Muddy Bog has **no passing maze** under the fixed
> instrument. No other cell in this review's five families changes.
> A full re-read of this review has not been done. See
> `docs/reviews/2026-08-27-option-set-pilot-result.md` §4.


Date: 2026-08-16. Families `fusion-r2-{magma-trap,muddy-bog,grinder,firestorm,
blizzard}`, 12,000 runs each (60,000 total), engine `fc32f6f`, clean worktree,
**0 hangs, 0 crashes** across every family. All five registrations `valid`,
`verdictAllowed: true`. Metric `hallHpAuc`, regime **R2**, n = 3000 per cell,
two-ingredient control (`partnerSpecial`), fresh seeds (`20320801 + i`).

Steam Vent is not re-run here — it already has its own registered R2,
two-ingredient-control family (`steam-vent-retune`, decomposed further in
`steam-vent-scald-dial` / `steam-vent-slow-dial`) and needed nothing this
session. This closes out the roster: all six fusions now have an R2, correct-
control number.

**Correction made before analysis counted:** the first pass through all five
`registeredAt` timestamps was set to a placeholder (15:00 UTC) that postdated
the sweep's actual run time, which made every family EXPLORATORY. The specs
were genuinely committed (`fc32f6f`) before the sweeps ran; only the literal
`registeredAt` field was wrong. Corrected to `05:30:00Z`, 4 minutes before the
earliest recorded run (`05:34:40Z`), and re-analyzed. No data was touched, no
result was seen before the correction — the descriptive numbers are identical
in both passes, only the verdict banner changed from EXPLORATORY to REGISTERED.

---

## 1. Headline: every fusion clears the letter of the rule, and every fusion is resolvably harmful on one maze

| fusion | maze A Δ (hallHpAuc) | maze B Δ | overall |
|---|---|---|---|
| Magma Trap | **+0.120** (t 8.18, q≈0) | **−0.256** (t −13.55, q≈0) | PASS (via A) |
| Muddy Bog | **+0.051** (t 3.61, q 0.003) | **−0.527** (t −22.36, q≈0) | PASS (via A) |
| Grinder | −0.038 (t −2.47, q 0.081, unresolved) | **+0.535** (t 23.21, q≈0) | PASS (via B) |
| Firestorm | **−0.056** (t −3.69, q 0.002) | **+0.141** (t 6.10, q≈0) | PASS (via B) |
| Blizzard | **−0.193** (t −12.63, q≈0) | **+0.389** (t 12.65, q≈0) | PASS (via B) |

Under the pre-registered rule — PASS if EITHER maze clears `delta > 0` at
BH q < 0.05 with sign-test agreement and hang-imputation survival — **all five
fusions pass.** Read no further than that line and the roster looks fixed.

**That is the wrong read.** Every fusion in this table also has a resolvably
**negative** delta on its other maze (Grinder's maze A is the only exception,
and even it is negative, just short of q < 0.05 at q = 0.081). This is not one
outlier fusion with a rough edge — it is the whole roster, in both directions:
Magma Trap and Muddy Bog are good on A and actively harmful on B; Grinder,
Firestorm and Blizzard are the mirror image, harmful (or borderline) on A and
good on B. No fusion is unambiguously positive on both mazes, and no fusion is
unambiguously negative on both. The "pass on either maze" rule was written for
a case where a fusion clears one maze and is merely *unresolved* on the other,
not for a roster where the sign flips and resolves in both directions on every
single arm.

## 2. Full metric table

Paired deltas against the two-ingredient control, hallHpAuc primary, score and
wavesCleared secondary. All cells 0/3000 hangs, ceiling ≤5% everywhere control
or arm is not itself sitting near a floor (Firestorm maze B sits at 18% ceiling
on score/wavesCleared for BOTH arms symmetrically — a shared property of that
cell, not a fusion effect, and score/wavesCleared are secondary only).

| fusion | metric | maze A Δ | maze B Δ |
|---|---|---|---|
| Magma Trap | hallHpAuc | +0.120 | −0.256 |
| | score | +0.106 | −0.250 |
| | wavesCleared | +0.107 | −0.250 |
| Muddy Bog | hallHpAuc | +0.051 | −0.527 |
| | score | +0.036 (unresolved, q 0.106) | −0.465 |
| | wavesCleared | +0.036 (unresolved, q 0.106) | −0.465 |
| Grinder | hallHpAuc | −0.038 (unresolved, q 0.081) | +0.535 |
| | score | −0.073 | +0.483 |
| | wavesCleared | −0.072 | +0.483 |
| Firestorm | hallHpAuc | −0.056 | +0.141 |
| | score | −0.025 (unresolved, q 1.0) | +0.137 |
| | wavesCleared | −0.024 (unresolved, q 1.0) | +0.137 |
| Blizzard | hallHpAuc | −0.193 | +0.389 |
| | score | −0.221 | +0.304 |
| | wavesCleared | −0.220 | +0.304 |

The secondaries agree in sign with the primary everywhere they resolve. Where
they diverge from the primary it is always toward *less* resolvable, never a
sign flip — consistent with `hallHpAuc` being the more sensitive instrument
this project already established in `metric-selection-v2`.

## 3. Against the prediction: numbers moved down, as expected

The handoff for this session predicted every delta would move DOWN relative to
`fusion-roster-v2`, because the control got one whole structure stronger. That
held for every fusion with a directly comparable v1-regime, one-ingredient
number:

| fusion | fusion-roster-v2 (R1, one-ingredient control) | this family (R2, two-ingredient control) |
|---|---|---|
| Magma Trap | not separately reported as harmful | +0.120 / **−0.256** |
| Muddy Bog | "likely harmful" | +0.051 / **−0.527** |
| Grinder | not separately reported as harmful | −0.038 / +0.535 |
| Firestorm | "worthless" | **−0.056** / +0.141 |
| Blizzard | not separately reported as harmful | **−0.193** / +0.389 |
| Steam Vent (for calibration) | −0.137 (v2, one-ingredient) | −0.309 → −0.015 (retuned) |

Firestorm and Muddy Bog's prior "worthless" / "likely harmful" reads are
sharpened, not overturned: both still show a clearly negative, resolvable cell
in this harder instrument (Firestorm on A, Muddy Bog on B — the latter far
larger than anything measured before, −0.527 against an MDE of 0.10).

## 4. What the maze split is actually saying

Grouping by which maze favors which fusion:

- **A-favoring, B-harmful:** Magma Trap, Muddy Bog — both EARTH-family, both
  built around area/dot damage on a chokepoint.
- **B-favoring, A-harmful (or unresolved):** Grinder (also EARTH-family),
  Firestorm, Blizzard.

Grinder breaks the "it's a human-element effect" hypothesis immediately: it
shares `humanElement: EARTH` with Magma Trap and Muddy Bog but sits in the
*opposite* group. The split tracks something about each fusion's own mechanic
and how it interacts with maze A's and maze B's respective site pools and path
geometry, not the player's class. This project's siting work
(`elementia-siting-confound`) already found that maze A and maze B trade
funnel-vs-flank value in a way that moved watchtower-displacement numbers
before; a fusion competing for the same limited site pool as the Watchtowers
its gold would otherwise buy is a plausible mechanism for the same trade to
show up here, but this family cannot distinguish that from five independent
per-fusion tuning accidents. That is a real open question, not a conclusion.

## 5. What this does NOT establish

- **No verdict here is final.** The cross-policy gate is still empty — only
  `scripted-v1` exists — and every number in this family is provisional on it,
  exactly as declared in each prereg's `regime.scopeLimit`.
- **"Passes on either maze" is a roster-wide instrument limit, not a roster-wide
  success.** The rule was adopted on 2026-08-04 to avoid forcing overtuning
  when a fusion is merely unresolved on its harder maze. It was not written
  anticipating that literally every fusion would resolve in *opposite*
  directions on the two mazes. Treating all five as "balanced" on the strength
  of this technical pass would be exactly the kind of over-read this project's
  `elementia-baseline-review-lessons` memory warns against.
- **This family does not identify which fusion, if any, is the best candidate
  for a retune.** It identifies that all five have a real, resolvable,
  maze-dependent liability. Deciding whether to retune, and which lever to
  pull, is a separate, separately-registered decision per fusion — the same
  discipline `steam-vent-retune` followed.
- **familySize was declared as 36** (the full six-fusion roster width: 5
  measured here + Steam Vent's own family), deliberately padding each family's
  BH correction so the roster question is not narrowed by being split across
  five stores. `BH FAMILY-SIZE MISMATCH: ran 6, preregistered 36` fires on
  every family as a result — expected, not a defect.
- **score is floor/ceiling-affected in a few cells** (5% ceiling on Magma
  Trap/B, 18% on Firestorm/B for both arms symmetrically) but was declared
  secondary specifically so a bounded reading on it never overrides hallHpAuc.

## 6. Recommendation

Report this plainly rather than round it up to "the roster passed": **every
fusion in the roster has a resolvable weakness on one of the two mazes**, and
none has an unambiguous win on both. Before spending more tuning budget on any
one fusion, the maze-split mechanism in §4 is worth its own registered family —
if it is a siting/pathing interaction rather than five independent balance
accidents, fixing the mechanism (not the five numbers) is the higher-leverage
move. No balance change ships from this family; it is a measurement, not a
retune.
