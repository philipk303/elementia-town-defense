# Spec — option-set comparison: replacing the arbitrary control

Date: 2026-08-27. Author: Opus 5. Status: PROPOSED, not implemented.
**Revision 2**, after adversarial review found the first draft unimplementable.
Depends on: `docs/reviews/2026-08-26-hallhpauc-composition.md`.

---

## 0. What revision 1 got wrong

Recorded because the errors constrain the design.

1. **The positive control annihilated the estimator.** Rev 1 put a `wt-x2` arm
   (double Watchtower damage) inside the policy set and required it to be
   selected as the best policy. Since `wt-x2` builds no fusion, it survives every
   "remove fusion X" set, so `contribution(X)` would have been **identically zero
   for every fusion by construction**. Fixed in §2.5: the positive control
   validates the selection *procedure* from outside the set.
2. **`eco-lean` was not a strategy.** `defence: FARM` has no combat entry in
   `BALANCE.STRUCTURES` (`shared/balance.js:34` is `cost`/`hp` only) and FARM is
   absent from `WALKABLE_TYPES` (`shared/constants.js:129`), so it would place 12
   blocking walls that deal no damage while its income had no outlet — the
   `spendDown` loop buys one type and nothing can request a MARKETPLACE. Dropped.
3. **`fuse-flank` was under-specified**, inheriting `fuseWave: 4` and so
   differing from the other fusion policies in two dimensions, not one. Every
   field of every policy is now written out.
4. **The gates did not apply to the estimator.** `contribution` is a
   spike-at-zero mixture and the four standard gates are meaningless on a
   degenerate zero vector. Fixed in §2.6.

---

## 1. The defect this exists to fix

Every balance verdict this project has published has the shape *"arm X beats
control C."* `docs/reviews/2026-08-16-maze-split-mechanism.md` §2 established
what that is worth: the control's own maze swing explains **58–96%** of each
fusion's apparent maze split, and for Magma Trap the implied fusion-side swing is
**−0.015** — essentially zero. The published "maze-situational" reading was a
property of the baseline.

C is one scripted build among many. Choosing it was never registered, never
defended, and every number is conditional on it. More seeds do not help: the
estimate is precise and answering the wrong question.

**The designer's question is not "does X beat C" but "is X ever the right thing
to build."**

---

## 2. The design

### 2.1 A policy is a point in the protocol's existing what/when space

**Load-bearing decision, and what makes this cheap.**

WP5 tried to express a second build policy and failed
(`docs/reviews/2026-08-15-wp5-competent-v1-review.md`): both of its differences
from `scripted-v1` were **siting** differences, and siting cannot express a
policy in the 12-site isolated pool because `isolatedTowerSites`
(`matchRunner.js:231`) is already row-major and therefore lane-alternating.

`matchRunner.js` already accepts a rich what/when vector — `defence`,
`defenceCap`, `spendDown`, `freeSpecial`, `fuse`, `fuseWith`, `fuseWave`,
`partnerSpecial`, `specialSiting` — and the fusion families have only ever varied
two or three fields of it. **No new build-policy code is required.**
`resolveProtocol` validates these, `configHashFor` hashes them, `run.mjs`
dispatches them. Anything not expressible in these fields is out of scope for
v1. That constraint is the difference between this and WP5.

Note the concession this forces: `specialSiting` **is** a siting field, and
`fuse-flank` below is a siting policy. It is admissible only because
`isolatedSpecialSites` genuinely differs by column (`matchRunner.js:243`, `col`
0 vs 2) while the *tower* pool does not. §2.1's argument is about the tower
pool, and the distinction must be stated wherever this policy is read.

### 2.2 The policy set

`P` — seven policies, registered by name and by every field before any run. All
under R2 (`spendDown: true`, `maxWaves: 10`), isolated siting,
`humanElement: EARTH`, `defenceCap: null`, `defence: WATCHTOWER` unless stated.

| id | `freeSpecial` | `fuse` | `fuseWave` | `partnerSpecial` | `specialSiting` | `defence` |
|---|---|---|---|---|---|---|
| `wt-pure` | false | false | — | null | funnel | WATCHTOWER |
| `wt-free` | true | false | — | null | funnel | WATCHTOWER |
| `wt-partner` | true | false | — | *element* | funnel | WATCHTOWER |
| `fuse-early` | true | true | 2 | null | funnel | WATCHTOWER |
| `fuse-mid` | true | true | 4 | null | funnel | WATCHTOWER |
| `fuse-late` | true | true | 7 | null | funnel | WATCHTOWER |
| `fuse-flank` | true | true | 4 | null | **flank** | WATCHTOWER |

`fuse-flank` differs from `fuse-mid` in exactly one field. `snare-lean`
(`defence: SNARE_POST`) is **deliberately excluded**: SNARE_POST is walkable, so
it draws from `walkableDefenceSites` (20 sites, `matchRunner.js:281`) while
WATCHTOWER draws from `isolatedTowerSites` (12) and blocks routes. Any gap
between them conflates damage type, site count and routing, and this spec has no
way to decompose that. It is a good future policy behind its own siting work.

Seven is a registered number. **Adding a policy after seeing results is
prohibited** and invalidates the family: the estimator is a maximum over the set,
so growing the set can only raise it.

### 2.3 The two questions, in priority order

**Q1 (PRIMARY) — dominance.** Publish the full policy × maze value matrix. If one
policy is best on every maze by more than the resolvable margin, that is a
balance finding worth more than any fusion verdict, and it is invisible to every
A/B this project has run. **This deliverable does not depend on the estimator in
§2.4 and cannot be annihilated by it.**

**Q2 (SECONDARY) — contribution.** With `V(O)` the value of the best policy in
option set `O`:

```
contribution(X) = V(P) − V(P \ X)
```

where `P \ X` removes every policy building X (`fuse-early`, `fuse-mid`,
`fuse-late`, `fuse-flank`; `wt-partner` holds ingredients unfused and stays).
X earns its place if `contribution(X) > 0` resolvably.

### 2.4 The estimator and the winner's curse

`max` over noisy means is biased upward, and `P` has more policies to maximise
over than `P \ X`, so a useless X would score positive from noise alone.

**Split-sample selection, registered in advance:**

1. Partition seed-cells into `S1` (selection) and `S2` (evaluation).
2. `p*(O) = argmax over p in O of mean(metric)` on **`S1` only**.
3. `V(O) = mean(metric of p*(O))` on **`S2` only**.
4. `contribution(X) = V(P) − V(P \ X)`, paired over `S2` seed-cells.

The primary split is a **random** balanced draw at a registered seed, not seed
parity — parity is a property of the seed stream and may correlate with it. The
same random-draw procedure then generates 200 further splits for the stability
report in §2.6, so the primary split and the stability distribution come from
one procedure rather than two (rev 1 mixed them).

### 2.5 The positive control lives OUTSIDE the argmax

The procedure is validated by a separate family, `option-set-procedure-check`,
which is **not** part of any contribution measurement: run `P` plus one arm that
is `wt-free` with Watchtower damage doubled via `balanceOverrides`, and require
the selection procedure to pick it on both mazes.

This is the only correct home for it. A `balanceOverrides` arm is not a strategy
a player can choose, so it is not a policy; and any non-fusion arm inside `P`
survives every `P \ X` and forces every contribution to zero (rev 1's fatal
defect). Validate the procedure, then measure with the procedure.

### 2.6 Inference, given that `contribution` has an atom at zero

If `p*(P) = p*(P \ X)` the paired delta vector is **identically zero**. That is
the honest reading "X is not in the best response," and it is a likely outcome,
not a failure. But it is not a statistical result: `pairedT` returns t = 0 on it
(`stats.js:202`), the sign test sees 0 better and 0 worse, and `splitHalfRho` is
`NaN`. **The four standard gates cannot be applied to `contribution` and rev 1
was wrong to invoke them.**

Report instead, in this order:

1. **Selection outcome, categorical.** Is any X-building policy `p*(P)`? On what
   share of the 200 splits? This is the primary answer and needs no inference.
2. **Only if `p*(P) ≠ p*(P \ X)`:** the paired delta between the two selected
   policies on `S2`, with the four gates, which now apply because the vector is a
   genuine paired comparison of two distinct policies.
3. **Selection stability**, as the share of the 200 splits choosing each policy,
   reported as a distribution rather than a threshold.

Rev 1 set a 95%-of-splits bar. That is **withdrawn**: with near-tied policies it
is unachievable, and with well-separated policies it is trivially met, so it
never discriminates. Stability is reported and read, not gated.

### 2.7 Metric

Primary `hallHpAuc`, secondary `wavesCleared`, both on every cell, per the
2026-08-26 composition review. Where the two disagree in sign the effect lives
entirely in the sub-count remainder and the cell may not carry a verdict alone.
Wave-count normalisation is **not** used as a diagnostic — it flags cells the
declared secondary confirms and it rewards dying early with a healthy hall.

---

## 3. Run first a pilot, not the program

The adversarial review's strongest point stands: if no two policies in `P`
separate by more than the selection-side MDE, the design is answered before it
starts, and 120,000 runs would establish only that.

**Pilot: one fusion, 7 policies × 2 mazes × 750 seeds × 2 postGaps = 21,000
runs**, about 10 minutes at 11 workers (`SECONDS_PER_RUN = 0.3`, `run.mjs:28`).
Deliverable is the §2.3 Q1 matrix and the pairwise separations, nothing else.

Power, stated honestly: with 750 seed-cells per split side and the R2 paired
sigma (0.87 on A, 1.41 on B), `mde(sigma/sqrt(2), 750)` is **0.089 (A) /
0.144 (B)** on `hallHpAuc`. Published fusion deltas run 0.04–0.58, so **the
smaller half is not resolvable at this n.** If the pilot shows the policies
separate only at the small end, raise seeds to 1500 (42,000 runs, ~20 min) and
re-declare `nRequired`. **Never** raise power by shrinking the policy set.

The pilot's own outcome is a result. "No policy in a registered seven-strategy
set separates from any other" would be a first-order finding about this game.

---

## 4. Files touched

| file | change |
|---|---|
| `test/harness/bench/specs/option-set-<fusion>.json` | the 7-arm sweep spec; arms are protocol vectors only |
| `test/harness/prereg/option-set-<fusion>.json` | policy set field-by-field, the split rule and its seed, `nRequired`, `sigmaSource`, the §2.6 reporting order |
| `test/harness/bench/analyze.mjs` | `--option-set` mode: select on `S1`, evaluate on `S2`, emit the policy × maze matrix, the selection distribution, and a paired comparison only where the selected policies differ |
| `test/harness/bench/analyze.test.js` | integration: a synthetic corpus where one policy is best by a known margin recovers it; a corpus where `p*(P) = p*(P\X)` reports the categorical answer and **does not** emit gate output; unmatched cells are excluded from every mean; a missing split seed and a mistyped exclusion are both refused rather than defaulted |
| `test/harness/stats.test.js` | the winner-selection bias itself, at the layer where it can be tested honestly — eight pure-noise arms, naive max inflated to +0.070 against a true zero, split-sample evaluation averaging to zero over independent draws. It does **not** belong at the analyser layer: repeated splits of one corpus are highly correlated, so averaging over them converges to a property of that corpus, and a test built that way would look rigorous while proving nothing |
| `docs/reviews/2026-08-27-option-set-pilot-result.md` | the pilot |

**Not touched:** `matchRunner.js`, `protocol.js`, `record.js`, `store.js`. If a
change is needed there, the policy set has left the existing what/when space and
§2.1 has been broken — stop and re-register rather than adding a build policy.

`stats.js` gains the split-sample selection loop, tested against a known-answer
synthetic before any corpus runs.

---

## 5. `whatWouldRefute`

- If **no fusion is ever in the best response**, the fusion system does not pay
  for itself. Registered here as the expected null, before running.
- If the §2.5 procedure check fails to select the doubled-damage arm, the
  selection procedure is broken; publish that and fix it before reading any
  fusion.
- If the pilot shows no two policies separate, the policy set is too narrow to
  answer the question and the next work is a wider set, not a bigger n.

---

## 6. Known limitations

1. **The policy set is hand-authored, and `contribution` is one-sidedly
   sensitive to its composition.** Adding any policy that dominates X drives
   `contribution(X)` to zero; adding weak non-X policies never can. So "X is dead
   weight" is a statement relative to six other rows someone chose. This is a
   real improvement on one unexamined baseline — the set is registered, its
   influence is reported, and Q1 does not depend on the estimator at all — but it
   is not a search over strategies and must never be described as one.
2. **`argmax` conditions on the metric.** A policy best on `hallHpAuc` need not be
   best on `wavesCleared`. Report `p*` under both and say so when they disagree.
3. **The scripted human is still one pilot.** Policy variety is in what gets
   built, not how well it is played.
4. **Viability and dominance only.** Nothing here says whether anything is fun.
5. **The difficulty-scale spec stays parked.**
   `docs/plans/2026-08-26-difficulty-scale-metric-spec.md` would have measured its
   exchange rate on exactly the arbitrary control this spec removes. Units are
   worth fixing only after the comparison they label is sound.
