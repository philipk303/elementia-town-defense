# Handoff — option-set pilot, Phase C (run and read)

Date: 2026-08-27. Written by: Opus 5, at the end of the session that built
Phases A and B. Suite at handoff: **891 pass, 0 fail, 2 skipped.**

---

## READ THIS PARAGRAPH BEFORE ANYTHING ELSE

Two things will otherwise go wrong, and both are the kind of mistake that
invalidates the corpus rather than merely wasting it.

1. **"No two policies separate by more than the resolvable margin" is a
   REGISTERED VALID OUTCOME, not a failure.** It is written into
   `test/harness/prereg/option-set-pilot.json` under `whatWouldRefute` before any
   run. If the matrix comes back flat, publish that. It is a first-order finding
   about this game.
2. **Do not add a policy to the set after seeing results.** The estimator is a
   maximum over the set, so adding a policy can only raise it. Widening the set
   after looking is the single move that turns this family from evidence into
   nothing. If the pilot says the set is too narrow, the next work is a *new*
   registered family with a wider set — not an eighth arm bolted onto this one.

---

## What you are doing

Running the 21,000-run pilot registered in
`docs/plans/2026-08-27-option-set-comparison-spec.md` and writing up the result.
Everything needed is already on disk and tested. This phase adds no new
machinery.

### Step 1 — run the sweep (about 11 minutes)

```bash
node test/harness/bench/run.mjs --spec test/harness/bench/specs/option-set-pilot.json --out test/harness/store/2026-08-27-option-set-pilot.jsonl.gz
```

7 policies x 2 mazes x 750 seeds x 2 postGaps = 21,000 runs. The store is
append-only with exact resume, so an interrupted run is restarted with the same
command and picks up where it stopped. Confirm `Already stored` plus
`Runs remaining: 0` before analysing anything.

**Commit the gzipped store.** Every published review in this project cites its
corpus by path and the corpus must outlive the session.

### Step 2 — pick and register the split seed BEFORE looking at anything

The analyser **refuses to default it** — an unregistered split is a researcher
degree of freedom, and this project has been burned by exactly that class of
flexibility. Write your chosen integer into the review document *before* you run
the analysis, not after.

### Step 3 — read it

```bash
node test/harness/bench/analyze.mjs --store test/harness/store/2026-08-27-option-set-pilot.jsonl.gz --option-set --split-seed <YOUR REGISTERED INTEGER> --exclude fuse-early,fuse-mid,fuse-late,fuse-flank
```

Also run it once with `--metric wavesCleared` (the declared secondary) and once
with no `--exclude` at all (matrix only, no contribution). Add `--json <path>` if
you want the structured result.

### Step 4 — write `docs/reviews/2026-08-27-option-set-pilot-result.md`

Lead with the **policy x maze value matrix**. That is the spec's primary
deliverable (§2.3 Q1) and it does not depend on the selection estimator at all.
Contribution is secondary. Do not open with a p-value.

---

## How to read the output correctly

- **`selection-half MDE`** is printed under the matrix. A winner ahead of the
  runner-up by less than that margin was chosen by noise, and the analyser says
  so itself with `SELECTED BY NOISE`. When that line appears, read the matrix and
  do not report a winner.
- **`NOT IN THE BEST RESPONSE`** means the same policy won with and without the
  fusion, so contribution is exactly 0 by construction and **no gates are
  computed**. That is correct and deliberate: the paired delta vector is
  identically zero there, `pairedT` returns t = 0, the sign test sees 0 better
  and 0 worse, and `splitHalfRho` is `NaN`. Printing gates on that would dress a
  structural zero as a statistical result. Report it as the categorical answer it
  is.
- **`CELL ASYMMETRY`** means some arm holds cells the others do not. Those cells
  are excluded from every mean. Investigate before reading anything else — a
  maximum over arms scored on different scenarios is not a maximum over anything.
- **Selection stability** is reported, never gated. Revision 1 of the spec set a
  95%-of-splits bar and it was withdrawn: near-tied policies can never clear it
  and well-separated ones clear it trivially, so it never discriminated.
- **Report `wavesCleared` on every cell.** It is 57–93% of every published effect
  (`docs/reviews/2026-08-26-hallhpauc-composition.md` §2). Where it disagrees in
  sign with `hallHpAuc`, the effect lives entirely in the sub-count remainder and
  that cell may not carry a verdict alone.

---

## Known weaknesses, stated up front

**Power is marginal and was declared marginal.** With 750 seed-cells per split
side and the R2 paired sigma (0.87 maze A, 1.41 maze B), the MDE is **0.089 (A) /
0.144 (B)** on `hallHpAuc`. Published fusion deltas run 0.04–0.58, so **the
smaller half of them is not resolvable at this n.** If the pilot separates only
at the small end, raise seeds to 1500 (42,000 runs, ~20 min) and re-declare
`nRequired`. **Never** raise power by shrinking the policy set.

**`familySize` is 24 and is deliberately over-padded.** The number came from the
control-vs-arm formula; option-set mode emits at most 4 gated tests. Rather than
narrow it, an amendment dated 2026-08-27 (in the prereg's `notes`, written before
any data existed) declares the option-set comparisons members of that same family
of 24. Over-padding makes every q *harder* to pass, so it cannot manufacture a
positive. The cost is power, on top of the paragraph above. If the pilot lands
just outside significance, that is a known and registered cause — do not
re-narrow the family after seeing it.

**The policy set is hand-authored, and `contribution` is one-sidedly sensitive to
its composition.** Adding any policy that dominates the fusion drives its
contribution to zero; adding weak non-fusion policies never can. "The fusion is
dead weight" is therefore a statement relative to six other rows a human chose.
Say so in the write-up. This is an improvement on one unexamined baseline, not a
search over strategies.

**`snare-lean` and `eco-lean` are deliberately absent.** `eco-lean`
(`defence: FARM`) was cut because FARM has no combat entry in
`BALANCE.STRUCTURES` (`shared/balance.js:34` is cost/hp only) and is not in
`WALKABLE_TYPES` — it would have placed 12 blocking walls that deal no damage
while its income had no outlet. `snare-lean` was cut because SNARE_POST is
walkable and draws from a 20-site pool while WATCHTOWER draws from 12 and blocks
routes, so any gap between them conflates damage type, site count and routing.
Neither is an oversight. Both are noted in spec §2.2.

---

## What was built, and where

| | |
|---|---|
| `test/harness/stats.js` | `splitCells` (balanced seeded split; not parity, order-independent) and `selectBest` (argmax plus runner-up margin) |
| `test/harness/bench/analyze.mjs` | `analyzeOptionSet`, `renderOptionSet`, the `--option-set` CLI mode, and `readStore` extracted so both modes read a store identically |
| `test/harness/bench/specs/option-set-pilot.json` | the 7-arm sweep |
| `test/harness/prereg/option-set-pilot.json` | the registration, with the 2026-08-27 amendment |
| `test/harness/stats.test.js` | the winner-selection bias itself: eight pure-noise arms, naive max inflated to +0.070 against a true zero, split-sample averaging back to zero |
| `test/harness/bench/analyze.test.js` | option-set integration: recovery of a known margin, the structural-zero branch emitting no gates, cell-asymmetry exclusion, refusal of a missing split seed, and a mistyped exclusion being reported |

The estimator was smoke-tested against the real `fusion-r2-magma-trap` corpus and
both branches fired: maze A gave contribution 0.108 with gates (published
fixed-control delta 0.120 — the split-sample estimate is smaller, which is the
winner's-curse bias coming out), and maze B produced the structural zero.

---

## Also landed this session, and worth knowing

`analyze.mjs`'s censoring check was audited. **The ceiling check was correct and
a first draft of this work wrongly called it broken** — `hallHpAuc` is discrete
at its ceiling (an undamaged run scores exactly `waves.length`), so exact
equality was right, and that check is what drove the R1 → R2 regime move. What
was actually broken: there was **no floor share at all**, and the warning bar was
50% while every prereg gates at 10%. Both fixed; the R1 corpus now prints
`CEILING WARNING: hallHpAuc/A control is 33% at the observed maximum (registered
bar 10%)` where it previously printed a clean table. Full story in
`docs/reviews/2026-08-26-hallhpauc-composition.md`, which opens with the
retraction.

`docs/plans/2026-08-26-difficulty-scale-metric-spec.md` is **parked on purpose**.
It would have measured its exchange rate on exactly the arbitrary control this
pilot removes. Do not build it first.

---

## Recommended setup

- **Model: Opus 5.** Reading an instrument's output is where this project keeps
  over-reaching, and the pilot's most likely outcome is a null that has to be
  published rather than rescued.
- **Fresh session, deliberately.** The estimator's author should not also be its
  first reader. That is a judgement call, not a rule, and the counter-argument
  (a cold session re-derives context and makes fresh errors) is real — this
  handoff exists to blunt it.
- **Subagents: none for the run or the read.** One sequential thread: run 11
  minutes, analyse, write.
- **Adversarial review: yes, on the result document, before it is treated as
  settled.** Two adversarial rounds this session each found a FATAL item,
  including a false claim already committed to three source comments. Tell the
  reviewer to recompute the headline numbers independently rather than trusting
  any probe script — that instruction is what caught both.

## Next-session prompt

```
Resume the Elementia balance-harness work at Phase C. Read these first, in order:
  docs/handoffs/2026-08-27-option-set-pilot-phase-c.md   (this file — read the
    first paragraph before anything else)
  docs/plans/2026-08-27-option-set-comparison-spec.md    (the design)
  docs/reviews/2026-08-26-hallhpauc-composition.md       (what the metric is)

Then run the pilot per Step 1, register a split seed per Step 2, analyse per
Step 3, and write docs/reviews/2026-08-27-option-set-pilot-result.md leading with
the policy x maze matrix. A flat matrix is a valid result. Do not add a policy to
the set after seeing the output.
```
