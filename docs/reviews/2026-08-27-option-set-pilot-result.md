# Result — option-set pilot (7 policies × 2 mazes)

Family: `option-set-pilot`. Spec: `docs/plans/2026-08-27-option-set-comparison-spec.md`.
Registration: `test/harness/prereg/option-set-pilot.json`.
Corpus: `test/harness/store/2026-08-27-option-set-pilot.jsonl.gz` — 21,000 runs
(7 policies × 2 mazes × 750 seeds × 2 postGaps), 0 crashed, 0 hangs, resume
confirms `Already stored: 21000 / Runs remaining: 0`.

> **STATUS, 2026-08-27 — the maze-A numbers below are UNREAD.**
> The positive control this family registered as refutation condition (2),
> `option-set-procedure-check`, has now been run and **FAILED** its registered
> rule: on maze A the planted effect (doubled Watchtower damage) beat the
> runner-up by only 0.080, inside the selection-half MDE of 0.123, and the
> analyser flagged `SELECTED BY NOISE`. That family's `decisionRule`, registered
> before any data existed, requires that every option-set result be treated as
> unread until the procedure is fixed and re-run — so **§2's maze-A estimator
> output (+0.272) is held, not withdrawn**.
> **CORRECTED 2026-08-27:** an earlier version of this notice also held the
> fusion-only decomposition (+0.097 fusion, +0.176 siting). That was an
> over-application and is withdrawn. Those are direct paired contrasts between
> two named arms (`fuse-mid` − `wt-partner`, `fuse-flank` − `fuse-mid`); they are
> not produced by the selection procedure and do not depend on it, exactly like
> §1's matrix and the maze-B structural zero, which were never held. Holding a
> plain paired contrast while exempting the matrix was inconsistent. **The
> decomposition stands. Only the argmax estimator output is held.** The check was then re-run at 3000 seeds (96,000 runs) and **failed
> again**: the resolution limit halved as predicted but the margin fell with it
> (0.059 against 0.062). Registered refutation (4) forbids a third run at higher
> n. The hold therefore stands, and is now supported by a second, independent
> reason: even a PASS at 3000 seeds would validate the procedure at 3000 seeds
> only, and this pilot was taken at 750. The procedure selected the right
> arm on both mazes and on 200/200 splits; what it could not do at this n is
> resolve it from the runner-up. **§1's policy × maze matrix and the maze-B
> structural zero do not depend on the estimator and are unaffected.**
> See `docs/reviews/2026-08-27-option-set-procedure-check-result.md`.

**Revision 2, 2026-08-27, after adversarial review.** Revision 1 led with
"contribution +0.272" as the fusion's value. That was wrong: `fuse-flank` differs
from the selected alternative in **two** fields, and roughly two thirds of the
+0.272 is a siting change, not the fusion. Revision 1 also inherited a
`signTest` underflow that reported one gate as PASS when it fails. Both are
corrected below, and §4 lists every change. The instrument defect is fixed in
`test/harness/stats.js` and **retroactively affects two published reviews** —
see §4.

---

## 0. Split seed, registered before analysis

**Split seed: `20260827`.**

Chosen and written into this file after the sweep was launched and **before any
analysis command was run** — no descriptive, no matrix, no contribution number
had been seen. It is the family's date, picked for being arbitrary and unrelated
to any outcome. `analyze.mjs --option-set` refuses to default this value exactly
so it cannot be chosen after the fact; this section is the record that it was
not. Every number below comes from that one split. No other split seed was tried.

---

## 1. Policy × maze value matrix (PRIMARY deliverable, spec §2.3 Q1)

Mean over all 1500 seed-cells per policy per maze. `hallHpAuc` primary,
`wavesCleared` secondary. Every cell holds exactly 1500 runs, and each arm's set
of `seed:postGap` keys is identical to control's on both mazes — genuinely
paired, **no cell asymmetry**. Every figure was recomputed from the raw records
twice, by two independently written scripts, and matched to three decimals.

### Maze A

| rank | policy | builds fusion? | siting | hallHpAuc | wavesCleared |
|---|---|---|---|---|---|
| 1 | `fuse-flank` | yes | **flank** | **8.070** | **7.694** |
| 2 | `fuse-mid` | yes | funnel | 7.895 | 7.498 |
| 3 | `fuse-early` | yes | funnel | 7.874 | 7.480 |
| 4 | `fuse-late` | yes | funnel | 7.831 | 7.459 |
| 5 | `wt-partner` | no | funnel | 7.798 | 7.405 |
| 6 | `control` (wt-free) | no | funnel | 7.718 | 7.336 |
| 7 | `wt-pure` | no | funnel | 7.572 | 7.244 |

### Maze B

| rank | policy | builds fusion? | siting | hallHpAuc | wavesCleared |
|---|---|---|---|---|---|
| 1 | `wt-partner` | no | funnel | **7.417** | **7.098** |
| 2 | `fuse-late` | yes | funnel | 7.243 | 6.925 |
| 3 | `fuse-mid` | yes | funnel | 7.202 | 6.898 |
| 4 | `fuse-flank` | yes | **flank** | 7.200 | 6.839 |
| 5= | `fuse-early` | yes | funnel | 7.1688 | 6.871 |
| 5= | `control` (wt-free) | no | funnel | 7.1685 | 6.879 |
| 7 | `wt-pure` | no | funnel | 6.890 | 6.737 |

`fuse-early` and `control` are separated by 0.00027 on `hallHpAuc` — noise
against any margin in this family, and `wavesCleared` ranks them the other way
round. They are shown tied.

**The `siting` column is load-bearing and is why revision 1 was wrong.**
`fuse-flank` is the only policy in the set that sites its special on the flank.
Per spec §2.1, `specialSiting` is a siting field and `fuse-flank` is a *siting*
policy as much as a fusion policy; that distinction must be stated wherever this
policy is read, and revision 1 failed to state it.

**The matrix is not flat.** The registered "no two policies separate" outcome did
**not** occur: the spread from best to worst is 0.499 (maze A) and 0.528 (maze B)
on `hallHpAuc`, against registered margins of 0.089 (A) and 0.144 (B).

**No policy dominates on both mazes.** The maze-A winner `fuse-flank` ranks 4th
on maze B; the maze-B winner `wt-partner` ranks 5th on maze A. This is the direct
answer to Q1, and it does not depend on the §2.4 estimator at all.

Two orderings hold on **both** mazes:

- `wt-pure` is last everywhere (−0.146 A, −0.279 B against control). The maze-B
  cell is gated PASS; the maze-A cell **fails** its sign test (p 0.057) and is
  not resolvable — see §4, item 2.
- `wt-partner` beats `control` everywhere (+0.080 A, +0.249 B). The maze-A figure
  is **below** that maze's 0.089 registered margin, so only maze B's resolves.

### Registered pairwise gates (arm vs `control`, family of 24, BH-adjusted)

A pair is RESOLVABLY SEPARATED only when q < 0.05 **and** the sign test agrees
**and** |delta| exceeds the maze's registered margin (0.089 A / 0.144 B).

| metric | maze | arm vs control | delta | BH q | sign p | conjunction | resolvable? |
|---|---|---|---|---|---|---|---|
| hallHpAuc | A | wt-pure | −0.146 | 0.000 | **0.057** | **FAIL** | **no** |
| hallHpAuc | A | wt-partner | +0.080 | 0.000 | <1e-7 | PASS | no — under margin |
| hallHpAuc | A | fuse-early | +0.156 | 0.000 | 2.1e-9 | PASS | yes |
| hallHpAuc | A | fuse-mid | +0.177 | 0.000 | 9.7e-12 | PASS | yes |
| hallHpAuc | A | fuse-late | +0.113 | 0.000 | 2.4e-12 | PASS | yes |
| hallHpAuc | A | fuse-flank | +0.353 | 0.000 | 4.3e-31 | PASS | yes |
| hallHpAuc | B | wt-pure | −0.279 | 0.000 | <1e-5 | PASS | yes (worse) |
| hallHpAuc | B | wt-partner | +0.249 | 0.000 | <1e-5 | PASS | yes |
| hallHpAuc | B | fuse-early | +0.0003 | 0.990 | 0.011 | FAIL | no |
| hallHpAuc | B | fuse-mid | +0.033 | 0.233 | <1e-5 | FAIL | no |
| hallHpAuc | B | fuse-late | +0.075 | 0.000 | <1e-5 | PASS | no — under margin |
| hallHpAuc | B | fuse-flank | +0.031 | 0.332 | <1e-5 | FAIL | no |

**Registered margin vs achieved precision.** 0.089 / 0.144 are the prereg's
planning values, computed from historical sigma at n = 750 (the split-half size).
The prereg calls them "achieved", and applying them is what was registered, so
they are applied. But these gate comparisons run on n = 1500, where the analyser's
own achieved MDE is **0.031–0.095** — 2.4× to 4.6× finer. The registered rule is
therefore conservative here, and the two "under margin" calls above (maze A
`wt-partner`, maze B `fuse-late`) are suppressed by the planning bar, not by the
data's precision. Reported both ways; the registered bar is the one that governs.

**Metric agreement.** `wavesCleared` agrees in sign with `hallHpAuc` on **10 of
these 12** cells. The two disagreements are maze B / `fuse-flank`
(+0.031 vs −0.040) and maze B / `fuse-early` (+0.0003 vs −0.0073). Neither is
resolvable, and per spec §2.7 neither cell can carry a verdict alone. Across all
21 arm-pairs × 2 mazes there is a third such cell (B, `fuse-flank` vs
`fuse-early`), also unresolvable.

**Censoring.** Exact maxima across all 28 arm × maze × metric cells: ceiling
**5.20%** (`wavesCleared` / B / `fuse-late`), floor **3.47%** (A / `wt-pure`),
both under the registered 10% bar; no warning fired. `hallHpAuc`'s own ceiling
share is ≤0.47% — the ~5% figures are `wavesCleared`'s, and the two bounds are
not the same thing. 0 hangs in 21,000 runs, so hang imputation equals the raw
delta everywhere. Split-half rho is 1.00 / 0.82 (`hallHpAuc` A/B) and
0.99 / 0.89 (`wavesCleared` A/B) — no gate was hidden there.

**An outcome-level floor the metric hides.** 20,982 of 21,000 runs (99.91%) end
with the hall at zero HP; only 9 runs finish undamaged. `hallHpAuc` integrates
the *trajectory*, so its own floor share stays small, but every policy in this
regime loses — they differ in how long they delay it. That is exactly the concern
`docs/reviews/2026-08-26-hallhpauc-composition.md` §1(a) raised about measuring
entirely below the failure point. The comparisons remain valid as
"which policy survives longest"; they are not evidence any policy holds.

---

## 2. Contribution of the fusion (SECONDARY, spec §2.3 Q2)

Split-sample selection at seed `20260827`: 750 cells select, 750 evaluate.
`P \ X` removes `fuse-early`, `fuse-mid`, `fuse-late`, `fuse-flank`.

### Maze A — the estimator returns +0.272, and about two thirds of it is siting

Best in `P` is `fuse-flank` (selection margin 0.202, above the 0.127
selection-half MDE — **not** flagged SELECTED BY NOISE). Best in `P \ X` is
`wt-partner`.

| | hallHpAuc | wavesCleared |
|---|---|---|
| estimator output (eval half, n 750) | +0.272 | +0.299 |
| 95% CI | [0.212, 0.331] | [0.233, 0.363] |
| t | 9.00 | 8.85 |
| BH q (family of 24) | 0.000 | 0.000 |
| sign exact p | 6.2e-6 (371+/257−) | <1e-5 (282+/110−) |
| achieved MDE | 0.085 | 0.094 |
| selection stability (200 splits) | 200/200 both sets | same |

The arithmetic reproduces exactly under independent recomputation, including on
the full 1500 cells (+0.2727, t 12.71, 771+/452−). **The interpretation in
revision 1 did not.**

`fuse-flank` differs from `wt-partner` in two protocol fields: `fuse: true` and
`specialSiting: "flank"`. `P \ X` removes all four fusion policies, and those are
the only policies carrying flank siting — so the exclusion removes the siting
change along with the fusion, and the estimator absorbs both. Decomposed, maze A,
paired over all 1500 cells, `hallHpAuc`:

| contrast | fields differing | delta | t |
|---|---|---|---|
| `fuse-mid` − `wt-partner` | `fuse` only (both funnel, both wave 4) | **+0.097** | 4.82 |
| `fuse-flank` − `fuse-mid` | `specialSiting` only | **+0.176** | 8.45 |
| `fuse-flank` − `wt-partner` | both — what the estimator returns | +0.273 | 12.71 |

**The fusion itself is worth +0.097 on maze A**, against a registered margin of
0.089 — barely resolvable. The flank siting is worth nearly twice as much, and
the option set contains **no fusion-free flank policy**, so the two cannot be
separated within this family. The correct headline is: the best *policy* in the
set beats the best fusion-free policy by 0.272; the fusion's own share of that is
about a third of it.

Each fusion timing against `wt-partner` (the correct two-ingredient baseline) on
maze A, `hallHpAuc`, all 1500 paired cells:

| arm − `wt-partner` (maze A) | delta | t | clears the 0.089 registered margin? |
|---|---|---|---|
| `fuse-early` | +0.076 | 3.68 | **no** |
| `fuse-mid` | +0.097 | 4.82 | yes |
| `fuse-late` | +0.033 | 2.01 | **no** |
| `fuse-flank` | +0.273 | 12.71 | yes — but see the decomposition above |

Two of the four timings do not clear the margin against the two-ingredient
baseline. Revision 1 showed this comparison on maze B, where it is negative, and
never on maze A. That asymmetry is corrected here. These pairs are EXPLORATORY —
the registered family of 24 compares arms to `control`, not to `wt-partner` — so
they carry no q and issue no verdict.

### Maze B — the estimator returns exactly 0, by construction

`wt-partner` is the best policy **with and without** the fusion policies, on both
metrics, on 200/200 splits. The paired delta vector is identically zero, so no
gates are computed — correct and deliberate, not a suppressed result. The
categorical answer: **on maze B the fusion is not in the best response.**

Head-to-head against `wt-partner` on maze B (EXPLORATORY, unadjusted, no q):

| maze B, vs `wt-partner` | delta (hallHpAuc) | t |
|---|---|---|
| `fuse-early` | −0.249 | −8.50 |
| `fuse-mid` | −0.216 | −8.21 |
| `fuse-late` | −0.174 | −6.95 |
| `fuse-flank` | −0.218 | −7.38 |

All four exceed maze B's 0.144 registered margin in magnitude. **But the choice
of comparator does most of the work here.** On the same maze `control` sits
−0.249 below `wt-partner` (t −10.21) — as low as or lower than every fusion arm —
and three of the four fusion policies are *above* `control` (§1: +0.033, +0.075,
+0.031). "Fusing is worse than not fusing" is true only against `wt-partner`
specifically. Picking the one comparator that makes fusion look worst is the same
arbitrary-baseline error this family exists to remove, run in the other
direction. The defensible statement is narrower: **on maze B, holding the two
ingredients unfused beats fusing them, and the fusion arms are otherwise
indistinguishable from the one-ingredient control.**

### A timing arm that often never fuses

`fuse-late` forms its combo in only **2152 of 3000** runs (71.7%); the other
three fusion arms fuse in 3000/3000. In 28% of `fuse-late` runs the match ends
before wave 7 and no fusion is ever built, so that arm is a ~72/28 mixture of
"fused late" and "never fused" and is biased toward `control` by construction.
Every `fuse-late` number above should be read as that mixture, not as a clean
late-fusion policy.

---

## 3. What this says, and what it does not

**The headline.** Magma Trap is maze-situational. On maze A the fusion is worth
about **+0.097** on `hallHpAuc` over holding the same two ingredients unfused —
positive, but only just past the registered 0.089 margin. The best *policy* in
the set beats the best fusion-free policy by +0.272, and roughly two thirds of
that gap is flank siting that this policy set cannot price separately. On maze B
the fusion is not in the best response: holding the ingredients unfused beats
every fusion timing, though the fusion arms are not distinguishable from the
one-ingredient control.

**On novelty.** The alternative the procedure selected on maze A, `wt-partner`,
is the *same* two-ingredient control `fusion-r2-magma-trap` already used, and
that family published +0.120 (t 8.18, q≈0) for Magma Trap on maze A against it
(`docs/reviews/2026-08-16-fusion-roster-r2-result.md:30`). So the selection
procedure did not find a new comparator — it re-found the existing one. This is
the prior result re-derived without a fixed baseline, and the +0.097 fusion-only
figure here is *smaller* than the prior +0.120, which is the winner's-curse
correction working as designed. Revision 1's claim that this was "the first
positive, MDE-clearing fusion contribution measured against a selected
alternative" overstated the novelty and is withdrawn.

**On the earlier maze-split criticism.** `docs/reviews/2026-08-16-maze-split-mechanism.md`
showed that most of each fusion's apparent maze split was the *control's* own
maze swing. That criticism does not defeat this result: `wt-partner` is a real
alternative policy rather than a fixed control, and the fusion-only contrast
still swings +0.097 (A) to −0.216 (B). `fuse-flank`'s own A−B swing (0.871) is
far larger than `wt-partner`'s (0.381).

**Registered outcomes, checked.** Of the three `whatWouldRefute` conditions:
(1) is **not** met — `fuse-flank` is the best policy on maze A; (3) is **not**
met — the matrix separates well above the resolvable margin. (2) is untested: the
`option-set-procedure-check` positive control is a separate family and **has not
been run**. Until it has, the selection procedure is validated only by unit tests
and a smoke test, not by a live planted effect.

**Limits, stated plainly.**

- **The fusion and its siting are confounded in the winning policy**, and the set
  contains no fusion-free flank arm to separate them. This is the single largest
  limitation of the maze-A number. A fusion-free flank policy would resolve it —
  in a **new** registered family, never by extending this one.
- **The policy set is hand-authored, and the estimator is one-sidedly sensitive
  to it.** Adding any policy that dominates the fusion drives contribution toward
  zero; adding weak non-fusion policies never can. Every number here is relative
  to six other rows a human chose. **The set was not extended after seeing this
  output, and must not be.**
- **One fusion, one build policy.** Magma Trap (EARTH human / FIRE partner),
  `scripted-v1`. Says nothing about any other fusion or a non-scripted human.
- **`snare-lean` and `eco-lean` are deliberately absent** for the reasons in spec
  §2.2 (FARM has no combat entry and is not walkable; SNARE_POST draws from a
  different-sized, non-blocking site pool). Registered, not an oversight.
- **Every policy loses.** 99.91% of runs end with the hall destroyed; this regime
  measures delay, not survival.
- **`hallHpAuc` adds nothing over `wavesCleared` in this corpus.** The maze-A
  contribution is +0.272 on the primary and +0.299 on the secondary, so the wave
  count over-explains the whole effect and the sub-count remainder is negative.
  The composition review's "57–93% of every published effect is the wave count"
  is ~100% here.
- **BH is applied twice at width 24, not once across 28 tests.** `analyze.mjs`
  corrects the 24 arm-vs-control p-values in one pass and the option-set p-values
  (padded to 24) in a separate pass. The amendment declares them one family of
  24; what was computed is two families each padded to 24. Both passes are
  conservative and no live q is near the boundary (all are <1e-8 or >0.2), so
  nothing changes — but it is not what the amendment describes.
- **The corpus was produced by a `dirty` working tree** (`e1b1f39` plus
  uncommitted changes). What establishes comparability is **not** the shared
  engine signature — a tree edited mid-sweep would produce the identical
  signature on both sides. It is that all 21,000 `startedAt` values fall in one
  continuous 3m 21s window (18:32:36.817Z → 18:35:57.277Z, largest inter-run gap
  340 ms, none over 5 s), so there was no pause in which an edit could land. The
  uncommitted delta was the `store.js` gzip-resume fix, its test, and art assets
  — none touching simulation. **Future sweeps should be launched from a clean
  tree.**

**Next work, in order.**

1. Run `option-set-procedure-check` (the doubled-Watchtower-damage positive
   control, spec §2.5). Registered condition (2) is still open, and a selection
   procedure never shown to find a planted effect is the weakest link here.
2. Register a **new** family with a fusion-free flank policy, to price the siting
   effect that §2 cannot separate from the fusion.
3. Only then decide whether the maze split is a design result to keep or a
   balance defect to fix.

---

## 4. Revision 2 changes, and a retroactive instrument defect

Revision 1 was adversarially reviewed on 2026-08-27. Every finding was
independently re-verified against the raw corpus before being accepted. Changes:

1. **FATAL — the siting confound.** Revision 1 reported +0.272 as the fusion's
   contribution without noting that `fuse-flank` also changes siting, and that
   `P \ X` removes the only flank policy. Decomposed in §2: fusion +0.097,
   siting +0.176. The headline in §3 is rewritten.
2. **MAJOR — a gate PASS that was a floating-point underflow.** `signTest` seeded
   its tail with `Math.pow(0.5, n)`, which is exactly 0 for n > 1074, so any sign
   test on more than 1074 untied pairs returned p = 0 and passed the gate for
   free. `hallHpAuc / A / wt-pure` (552+/618−) has true p **0.057** and now
   **FAILS**. Fixed in `test/harness/stats.js` (log-space accumulation), pinned
   by a regression test. **This defect retroactively affects two published
   reviews** — see below.
3. **MAJOR — metric disagreement miscounted.** 10 of 12 cells agree, not 11;
   maze B / `fuse-early` also disagrees in sign and was hidden by rounding
   "+0.000".
4. **MAJOR — "resolvably worse than not fusing" was rhetoric.** "Resolvable" is a
   defined term requiring a q in the registered family; the maze-B head-to-heads
   have neither. The comparator was also selected to be unflattering while the
   mirror comparison on maze A was omitted. Both corrected in §2.
5. **MAJOR — the maze-A two-ingredient comparison was missing.** Added: two of
   four fusion timings do not clear the registered margin against `wt-partner`.
6. **MAJOR — novelty overstated.** `wt-partner` is the comparator
   `fusion-r2-magma-trap` already used. Claim withdrawn in §3.
7. **MINOR** — `fuse-late` fuses in only 71.7% of runs; "achieved MDE" mislabelled
   (registered planning value vs actual 0.031–0.095); censoring maxima are 5.20%
   and 3.47%, not "0–5%" and "0–3%"; the 99.91% outcome floor was unreported;
   the primary metric adds nothing over the secondary here; the dirty-tree
   reassurance rested on invalid reasoning (corrected to the continuous-window
   argument); maze B ranks 5 and 6 differ by 0.0003 and are shown tied; BH is
   applied twice at width 24.

**Survived review unchanged:** all 28 matrix cells (reproduced to 3 decimals by
two independent implementations); the metric definition against the composition
review; corpus integrity (21,000 unique runIds, one engine and balance
signature, one configHash per arm×maze, 0 stalled/timedOut/stoppedEarly); exact
pairing on both seed and postGap; all 12 gate deltas and BH q values; the
`splitCells` implementation, its 750/750 balance, its postGap balance
(387/363), and its independence from outcomes; the estimator arithmetic and
200/200 selection stability; the maze-B structural zero as genuinely structural;
`wt-partner` genuinely being the two-ingredient control (3000/3000
`partnerSpecialPlaced`, matched anchor/tile/wave/element/gold, near-identical
towers purchased and gold unspent across all seven arms); registration
chronology (registered ~18.5 h before the first run); and the honesty of the
`whatWouldRefute` bookkeeping.

### Retroactive impact of the `signTest` defect

Any published cell with more than 1074 untied pairs had its sign gate pass for
free. Re-running every stored corpus under the fixed `signTest`, **eight cells
change from CONJUNCTION PASS to FAIL** — one in this family and seven in two
already-published reviews:

| corpus | metric | maze | arm | n | true sign p |
|---|---|---|---|---|---|
| `2026-08-16-fusion-r2-muddy-bog` | hallHpAuc | A | muddy-bog | 2264 | 0.303 |
| `2026-08-16-maze-split-mechanism` | hallHpAuc | A | earth-only | 2370 | 0.169 |
| `2026-08-16-maze-split-mechanism` | hallHpAuc | A | earth-water | 2348 | 0.095 |
| `2026-08-16-maze-split-mechanism` | score | A | earth-only | 1294 | 0.559 |
| `2026-08-16-maze-split-mechanism` | score | A | earth-water | 1275 | 0.867 |
| `2026-08-16-maze-split-mechanism` | wavesCleared | A | earth-only | 1294 | 0.559 |
| `2026-08-16-maze-split-mechanism` | wavesCleared | A | earth-water | 1275 | 0.867 |
| `2026-08-27-option-set-pilot` | hallHpAuc | A | wt-pure | 1170 | 0.057 |

The most consequential is **Muddy Bog's maze-A verdict**, published as
"PASS (via A)" with +0.051 — its sign test is p 0.303 and the conjunction fails,
so that arm has no passing maze. Correction notices have been added to both
affected reviews. Their full re-reads are **not** done here and remain open work.
