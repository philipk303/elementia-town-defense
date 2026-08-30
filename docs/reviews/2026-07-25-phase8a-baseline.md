# Phase 8A baseline — the first honest balance measurement this project has taken

**Date:** 2026-07-25
**Game code measured:** `da03b09`, `server/` and `shared/balance.js` **unmodified**
**Instrument:** `test/harness/{matchRunner,scenarios,probe,stats}.js`
**Suite at time of measurement:** 295 tests / 293 pass / 0 fail / 2 skipped
**Status:** revised after adversarial review — see section 9 for what the review changed

> **Read sections 8 and 9 before quoting any number in this document.** Several dials are
> saturated or structurally dead at their shipped values; one headline result did not
> survive review and has been withdrawn; and this baseline is deliberately taken with two
> known engine soft-locks still live.

---

## 1. What changed in the instrument

Four defects had to be fixed before any number here meant anything. Two were found before
this session. The third was found *during* it, by this document's own first attempt failing
its calibration gate. The fourth was found by the adversarial review of this document's
first draft.

### 1.1 The seed was one bit (fixed, Tasks 1–3)

`rng()` had exactly one call site in all of `server/` — `waves.js` (`resolveGateOrder`).
N "seeds" produced at most **2** distinct simulations, so every multi-seed result this
project has ever printed was really n=2.

| task | commit | what landed |
|---|---|---|
| 1 | `81de01c` | seeded per-spawn jitter, `WAVE_SPAWN.JITTER_MS` 150, wired via `tick.js` |
| 2 | `38c25ed` | `test/game/seedEntropy.test.js` — entropy verified to reach the sim |
| 3 | `8ccc897` | balance surface live: object-ref reads, `WALL_ENTRY_COST` → `BALANCE.COST_FIELD` |

### 1.2 The build phase never ran (fixed, Tasks 4–6)

Both previous acceptance harnesses zeroed `state.phaseClockMs` every tick, but it counts
DOWN and `isBuildComplete` is `phaseClockMs <= 0`. Build lasted **one tick** for all ten
waves — economy, towers, combos and dormancy were inert in every measurement ever taken in
this project. The new runner does not zero it: `buildTicks` ≈ 900 × 10 waves.

| task | commit | what landed |
|---|---|---|
| 4 | `2bf53ca` | `test/harness/matchRunner.js` — real 45 s build phase, continuous score |
| 5 | `8f535da` | `test/harness/matchRunner.test.js` — 8 instrument tests, null-dial control |
| 6 | `a717f8a` | `test/harness/scenarios.js` + `probe.js` — no pass criterion, throws on a dead dial |
| 6.5 | `da03b09` | win-bug fix, stall detection, hangs excluded from mean/sd with a `hangs` column |

### 1.3 The classifier could not fire (fixed this session)

**Found by this baseline's first attempt failing its own calibration gate.**

The probe classified a dial with `effect <= 2 * meanWithinCellSd`. `effect` is a difference
of two cell **means**; `meanWithinCellSd` is the spread of a **single observation**. Those
are not comparable quantities. A difference of means has standard error `sd*sqrt(2/n)`;
dividing by the raw `sd` instead discards every bit of power the sample size buys. The rule
demanded an effect of `2 × 1.13 = 2.27` score points from a metric whose entire observed
range is 8–11 — so `NO SIGNAL` was very nearly the only verdict it could ever print. It was
the mirror image of the "gate that cannot fail" that `probe.js`'s own header warns about.

It duly printed `NO SIGNAL` for a **4× change in goblin HP**, while the same run's `enemy-s`
column rose monotonically. Had calibration been allowed to "pass", this document would have
reported four dials of `NO SIGNAL` as *evidence that the simulation is smooth*.

**What replaced it** (`test/harness/stats.js`): a two-sample **Welch t** on the endpoint
cells, plus **Spearman ρ** over all cell means for direction; `enemySeconds` reported
alongside `score`; and the sample size raised from 12 cells to 144, sized from a minimum
effect **Δ = 0.5 score points (half a cleared wave)** declared in advance, at α = 0.05
two-sided and 80% power. σ was estimated twice — 1.133 from the n=12 matrix (→ 81 cells),
then 1.439 once measured at n=80 (→ 131 cells) — because the larger matrix revealed genuine
scenario variance the small one could not see. Only σ was updated; Δ and the power target
are unchanged. With ~10% hang attrition: **72 seeds × 2 posts = 144 cells.**

### 1.4 The win rate divided by the wrong denominator (fixed after review)

`probe.js` computed `winRate: wins / scenarios.length`, but hung runs `continue` before
`wins++`. Hangs were removed from the numerator and retained in the denominator, deflating
every win rate by the hang rate — and since **hang rate varies with the dial**, deflating it
*non-uniformly across rows*. Score (hangs removed) and win% (hangs retained) were therefore
biased in **opposite directions within the same printed row**.

Every win figure in the first draft of this document was wrong. They are corrected
throughout; win rate is now computed among completed runs.

The review also showed two analyses were missing, and both are now run on every dial:

- **Hang-exclusion sensitivity.** Hangs are excluded non-randomly *and* hang rate correlates
  with the dial, so the exclusion can manufacture or mask a trend. Every table now reports
  the effect re-computed with hung runs imputed at their own cell's observed minimum — a
  deliberately pessimistic bound. An effect that survives it is not an artifact of the
  exclusion; one that collapses under it is **not established**.
- **Split-half replication.** Cell means are recomputed on seeds 1–36 and 37–72 separately
  and their rank orderings correlated. A real shape replicates across disjoint seed sets;
  a sort order decided by sub-standard-error gaps does not. This is the direct test of "is
  this jaggedness real or is it noise", and it is what makes the central question of this
  phase falsifiable at all (section 4).

**The control that guards all of this.** The new test is strictly *more* sensitive than the
one it replaces, so the null-dial control is load-bearing: it proves the added sensitivity
did not come from becoming credulous. Re-run at the final n=144:

```
dial:      __NULL_DIAL
values:    1, 2, 3
scenarios: 144 (72 seeds x 2 posts)
matches:   432

         1 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
         2 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
         3 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144

score       effect 0.000 | se 0.157 | t 0.00 | rho 0.00
            NO SIGNAL (effect 0.000 is 0.00 SE — not resolvable at this sample size)
enemy-sec   effect 0.0 | se 41.6 | t 0.00 | rho 0.00
            NO SIGNAL (effect 0.000 is 0.00 SE — not resolvable at this sample size)

hang sensitivity (hungs imputed at cell min): effect 0.000 | t 0.00 | rho 0.00
  no score signal to test.
split-half rank agreement (seeds 1-36 vs 37-72): rho 0.00

reading: this dial did not measurably move the game on either metric.
```

Three byte-identical rows, `NO SIGNAL` on both metrics. A nonexistent dial path still throws
non-zero.

---

## 2. The dial tables

All runs: 72 seeds × 2 posts = 144 scenarios per dial value, full 10-wave horizon,
`server/` unmodified. Verbatim stdout, trimmed only of the npm banner and trailing footer.

### 2.1 `ENEMY.BASE.0.hp` — calibration

```
         6 | score 9.461 +/- 0.968 | range 6.00-11.00 | win 33% | enemy-s 2060 | hangs 18/144
         9 | score 9.275 +/- 1.325 | range 5.00-11.00 | win 34% | enemy-s 2075 | hangs  8/144
        12 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
        18 | score 8.716 +/- 1.376 | range 5.00-11.00 | win 16% | enemy-s 2179 | hangs 16/144
        24 | score 8.520 +/- 1.465 | range 5.00-11.00 | win 13% | enemy-s 2212 | hangs 28/144

noise floor (mean within-cell score sd): 1.281

score       effect 0.941 | se 0.161 | t 5.84 | rho -1.00
            MONOTONIC (rho -1.00, t 5.84)
enemy-sec   effect 151.6 | se 48.9 | t 3.10 | rho 0.90
            MONOTONIC (rho 0.90, t 3.10)

hang sensitivity (hungs imputed at cell min): effect 1.193 | t 5.93 | rho -0.90
  the score signal survives worst-case hang imputation.
split-half rank agreement (seeds 1-36 vs 37-72): rho 1.00
  the shape replicates across disjoint seed sets.

hangs: 83/720 cells
```

### 2.2 `COST_FIELD.WALL_ENTRY_COST.1` — the plan's range

```
         5 | score 8.954 +/- 1.259 | range 5.00-11.00 | win 20% | enemy-s 2093 | hangs 14/144
        15 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
        30 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
        45 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
        60 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144

score       effect 0.064 | se 0.157 | t 0.41 | rho 0.71
            NO SIGNAL (effect 0.064 is 0.41 SE — not resolvable at this sample size)
enemy-sec   effect 20.6 | se 41.9 | t 0.49 | rho -0.71
            NO SIGNAL

hang sensitivity: effect 0.086 | t 0.43 | rho 0.71 — no score signal to test.
split-half rank agreement: rho -1.00 — the ordering is not distinguishable from noise.

hangs: 66/720 cells
```

**Four of the five values are byte-identical.** The shipped array is `[0, 30, 12, 4]` so
index 1 ships at **30**, and there is no clamp in `costField.js` — the saturation is
behavioural: by cost ~8 the horde already routes around healthy walls entirely and paying
more changes no path. This is a sweep across a dead range, not a null result about the game.

### 2.3 `COST_FIELD.WALL_ENTRY_COST.1` — the live low range ⚠️ degenerate

```
         0 | score 8.470 +/- 1.461 | range 4.00-11.00 | win  8% | enemy-s 2034 | hangs 17/144
         2 | score 8.292 +/- 1.644 | range 4.00-11.00 | win  8% | enemy-s 1863 | hangs 19/144
         4 | score 9.175 +/- 1.339 | range 5.00-11.00 | win 27% | enemy-s 2088 | hangs 18/144
         8 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
        15 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144

score       effect 0.548 | se 0.171 | t 3.21 | rho 0.56
            NON-MONOTONIC (rho 0.56, t 3.21)
enemy-sec   effect 37.6 | se 51.8 | t 0.73 | rho 0.50 — NO SIGNAL

hang sensitivity: effect 0.713 | t 3.29 | rho 0.87 — survives worst-case imputation.
split-half rank agreement: rho 1.00 — the shape replicates.

hangs: 80/720 cells
```

> ⚠️ **This sweep is partly degenerate and must not be read as a gameplay result.** The
> shipped array is `[none 0, healthy 30, damaged 12, critical 4]`. Driving index 1 down to
> 0/2/4 makes a **healthy wall cheaper to enter than a damaged (12) or critical (4) one** —
> a band ordering the game can never produce by play. The measured "step" lands between 2
> and 4, which is exactly where healthy cost crosses `WALL_ENTRY_COST[3] = 4`. The step is
> real and replicates, but it is a property of an inverted cost array, not of the shipped
> game.

### 2.4 `BOT.ENGAGE_RANGE_PX`

```
       260 | score 8.409 +/- 1.231 | range 5.00-11.00 | win  8% | enemy-s 2318 | hangs  0/144
       390 | score 9.448 +/- 1.043 | range 5.00-11.00 | win 32% | enemy-s 2180 | hangs  3/144
       520 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
       650 | score 8.941 +/- 1.339 | range 5.00-11.00 | win 21% | enemy-s 2076 | hangs 15/144
       780 | score 8.975 +/- 1.359 | range 5.00-11.00 | win 24% | enemy-s 2075 | hangs 14/144

score       effect 0.566 | se 0.157 | t 3.60 | rho 0.10
            NON-MONOTONIC (rho 0.10, t 3.60)
enemy-sec   effect 243.1 | se 51.4 | t 4.73 | rho -0.70
            NON-MONOTONIC (rho -0.70, t 4.73)

hang sensitivity: effect 0.179 | t 1.01 | rho 0.10
  WARNING: the score signal does NOT survive worst-case hang imputation.
split-half rank agreement: rho 1.00 — the shape replicates.

hangs: 45/720 cells
```

**The endpoint statistic on this dial is withdrawn.** The 260 cell has a complete sample
(0/144 hangs) and the 780 cell is censored (14/144); comparing them compares a complete
sample against a censored one, and the effect collapses from 0.566 to **0.179** under
worst-case imputation. See 2.5 for the comparison that does hold.

### 2.5 `BOT.ENGAGE_RANGE_PX` — the peak against the shipped value

The endpoint comparison is the wrong one: the peak is at the *second* of five values. Tested
directly:

```
       390 | score 9.448 +/- 1.043 | range 5.00-11.00 | win 32% | enemy-s 2180 | hangs  3/144
       520 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144

score       effect 0.429 | se 0.142 | t 3.03 | rho -1.00 | MONOTONIC
enemy-sec   effect 108.2 | se 36.8 | t 2.94 | rho -1.00 | MONOTONIC

hang sensitivity: effect 0.700 | t 4.06 — survives worst-case imputation.
split-half rank agreement: rho 1.00 — the shape replicates.
```

This comparison **strengthens** under imputation (0.429 → 0.700), because the shipped 520
carries more hangs than 390, so pessimistic imputation penalises the shipped value harder.
Engage range 390 beating the shipped 520 is robust to the exclusion, replicates across
disjoint seed sets, and clears Δ = 0.5 under imputation.

### 2.6 `AGGRO.STICKY_MS` — swept inside its live range

`CHASE_CAP_MS = 4000` force-terminates a chase before a longer sticky can bind
(`aggro.js:57` refreshes `stickyUntilMs` every tick while the target holds), so the plan's
4500 and 6000 were structurally dead. Re-swept within 500–4000:

```
       500 | score 9.220 +/- 1.529 | range 5.00-11.00 | win 30% | enemy-s 2056 | hangs  5/144
      1500 | score 9.142 +/- 1.289 | range 5.00-11.00 | win 26% | enemy-s 2143 | hangs  6/144
      2500 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
      3500 | score 9.112 +/- 1.421 | range 5.00-11.00 | win 30% | enemy-s 2060 | hangs 12/144
      4000 | score 9.043 +/- 1.351 | range 5.00-11.00 | win 24% | enemy-s 2047 | hangs  9/144

score       effect 0.177 | se 0.174 | t 1.02 | rho -0.70 — NO SIGNAL
enemy-sec   effect 8.6 | se 40.0 | t 0.21 | rho -0.40 — NO SIGNAL

hang sensitivity: effect 0.283 | t 1.44 — no score signal to test.
split-half rank agreement: rho -0.50 — the ordering is not distinguishable from noise.

hangs: 45/720 cells
```

Genuinely flat inside its live range, and its ordering does not replicate.

### 2.7 `PLAYER.RESPAWN_BASE_MS`

```
      5000 | score 9.504 +/- 1.385 | range 5.00-11.00 | win 53% | enemy-s 2074 | hangs 13/144
     12000 | score 9.220 +/- 1.334 | range 5.00-11.00 | win 33% | enemy-s 2081 | hangs 14/144
     20000 | score 9.018 +/- 1.273 | range 5.00-11.00 | win 21% | enemy-s 2072 | hangs 13/144
     30000 | score 9.013 +/- 1.280 | range 5.00-11.00 | win 21% | enemy-s 2067 | hangs 12/144
     40000 | score 8.970 +/- 1.265 | range 5.00-11.00 | win 19% | enemy-s 2071 | hangs 13/144

score       effect 0.534 | se 0.164 | t 3.26 | rho -1.00
            MONOTONIC (rho -1.00, t 3.26)
enemy-sec   effect 3.0 | se 40.2 | t 0.08 | rho -0.80 — NO SIGNAL

hang sensitivity: effect 0.485 | t 2.34 | rho -0.90 — survives worst-case imputation.
split-half rank agreement: rho 0.90 — the shape replicates.

hangs: 65/720 cells
```

**ρ = −1.00 overstates this.** The 20000 → 30000 step is **0.005 score points against an SE
of 0.164** — 1/30 of a standard error — and 30000 → 40000 is 0.043. The honest shape is a
real effect from 5000 to 20000, then a **plateau**. Tested directly:

```
      5000 | score 9.504 +/- 1.385 | win 53% | enemy-s 2074 | hangs 13/144
     20000 | score 9.018 +/- 1.273 | win 21% | enemy-s 2072 | hangs 13/144

score       effect 0.485 | se 0.164 | t 2.95 | MONOTONIC
hang sensitivity: effect 0.442 | t 2.12 — survives worst-case imputation.
split-half rank agreement: rho 1.00 — the shape replicates.
```

Note the effect (0.485, and 0.442 imputed) sits just **below** the declared Δ = 0.5. It is
statistically resolvable and reproducible, but at the very edge of what was declared
gameplay-relevant.

### 2.8 Fine-scale probe — `PLAYER.RESPAWN_BASE_MS` at ±10% of shipped

Every sweep above is a 5-point grid with coarse spacing, which cannot by itself distinguish
a smooth curve from a rough one. This probe samples a dial that *does* move, at ±10% around
its shipped value:

```
     18000 | score 9.033 +/- 1.282 | win 21% | enemy-s 2072 | hangs 14/144
     19000 | score 9.043 +/- 1.283 | win 21% | enemy-s 2074 | hangs 13/144
     20000 | score 9.018 +/- 1.273 | win 21% | enemy-s 2072 | hangs 13/144
     21000 | score 9.046 +/- 1.296 | win 22% | enemy-s 2065 | hangs 14/144
     22000 | score 9.023 +/- 1.272 | win 21% | enemy-s 2078 | hangs 14/144

score       effect 0.009 | se 0.158 | t 0.06 | rho -0.10 — NO SIGNAL
enemy-sec   effect 6.4 | se 41.7 | t 0.15 | rho 0.30 — NO SIGNAL

hang sensitivity: effect 0.008 | t 0.04 — no score signal to test.
split-half rank agreement: rho 0.30 — the ordering is not distinguishable from noise.
```

**This is the most direct evidence in the document.** The local ordering
(9.033, 9.043, 9.018, 9.046, 9.023) is *visibly jagged* — up, down, up, down — the exact
"chaotic threshold" signature this project has reported three times. Total spread is 0.028
against an SE of 0.158, and **split-half ρ = 0.30: it does not replicate.** At fine scale,
on a dial that genuinely moves the game at coarse scale, the wiggle is noise and provably
so.

---

## 3. Calibration verdict — **PASS**

`ENEMY.BASE.0.hp` across 0.5×–2× the shipped value:

- **ρ = −1.00**, strictly descending across all five values
- **t = 5.84** on an effect of **0.941 score points** (SE 0.161)
- **Survives worst-case hang imputation**, and in fact strengthens: effect 1.193, t 5.93
- **Split-half ρ = 1.00** — both disjoint halves of the seed set rank the five values identically

Doubling goblin HP makes the game harder, monotonically, reproducibly, and robustly to the
hang exclusion. The instrument can see a change in the game.

**Caveat on the second metric.** `enemy-s` (ρ = +0.90) does **not** independently confirm
this dial. Enemy-seconds is the integral of living enemy count; raising enemy HP
mechanically raises it. For the HP calibrator specifically this is close to circular. It is
a genuinely independent readout for the *other* dials.

### 3.1 What the two sample sizes showed

| n per cell | 6 | 9 | 12 | 18 | 24 | verdict |
|---|---|---|---|---|---|---|
| **12** | 9.615 | 8.799 | 9.125 | 8.636 | 9.030 | jagged, sign-flipping, ρ = −0.50 |
| **144** | 9.461 | 9.275 | 9.018 | 8.716 | 8.520 | clean monotone, ρ = −1.00 |

At n=12 a dial that *must* be monotonic — doubling enemy HP cannot make a tower-defense game
easier — produces exactly the jagged, non-monotonic "chaotic threshold" signature this
project has attributed to its simulation three times. At n=144 it is a clean monotone.

**What this establishes, precisely:** small n on this instrument is *sufficient* to
manufacture the chaotic signature. It is therefore **not necessary to posit chaos in the
simulation to explain the past findings.**

**What it does not establish:** that small n *was* the cause of those findings. The n=12 row
is a nested subset of the n=144 row, not an independent replicate, and the past measurements
differed from this one in three ways at once (one-bit seed, amputated build phase, binary
readout), of which this demonstration models only one. The correct conclusion is that the
past evidence was **inadequate to support its conclusion**, not that its conclusion is
proven false. Section 2.8 is the stronger evidence, because it tests fine-scale roughness
directly rather than by analogy.

---

## 4. Does the chaos exist? — **not at any scale this instrument can resolve**

### 4.1 What would have counted as "rough"

The first draft of this document asserted "the simulation is smooth" without ever declaring
what would have refuted it — and the classifier emits no label meaning "rough", so every
possible output could be read as confirmation. That is unfalsifiable, and it is the same
failure mode in the opposite direction. Operationalised, a dial is **rough** if:

- **(a)** its cell ordering contains **two or more sign changes among first-differences that
  individually exceed 2 SE** (one sign change is a single peak — an optimum, the most
  ordinary shape in game balance; two or more is genuine oscillation); **and**
- **(b)** that ordering **replicates** across disjoint seed halves (split-half ρ ≥ 0.9) —
  otherwise the jaggedness is noise; **and**
- **(c)** it survives worst-case hang imputation.

A dial also counts as rough if **(d)** fine-scale perturbation (±10%) around a shipped value
produces a replicating ordering — i.e. local structure that is not noise.

Reported against those criteria:

| dial | significant sign changes | split-half ρ | survives imputation | rough? |
|---|---|---|---|---|
| `ENEMY.BASE.0.hp` | 0 (monotone) | 1.00 | yes (strengthens) | no |
| `WALL_ENTRY_COST.1` @5–60 | 0 (flat) | −1.00 | n/a | no |
| `WALL_ENTRY_COST.1` @0–15 ⚠️ | 0 (step) | 1.00 | yes | no |
| `BOT.ENGAGE_RANGE_PX` | 1 (single peak) | 1.00 | endpoint no; peak-vs-shipped yes | no |
| `AGGRO.STICKY_MS` | 0 (flat) | −0.50 | n/a | no |
| `PLAYER.RESPAWN_BASE_MS` | 0 (monotone→plateau) | 0.90 | yes | no |
| respawn fine-scale ±10% | 0 (all diffs < 2 SE) | 0.30 | n/a | **no — and this is the direct test** |

**No dial meets the roughness criteria.** The maximum is a single peak (`BOT.ENGAGE_RANGE_PX`,
an inverted U — too short and bots don't help, too long and they overextend). The fine-scale
probe, which is the test that most directly addresses the hypothesis, comes back as noise
that does not replicate.

**Answer to the phase's question:** under a continuous metric, adequate sample size, and at
both coarse (5-point) and fine (±10%) resolution, **no measured dial requires a chaotic
explanation, and local jaggedness is demonstrably non-replicating noise.**

**What this still does not cover:** four dials at 5 points each, one dial at fine scale, one
at a time. This is not a proof of global smoothness and should not be quoted as one. See
section 8.

### 4.2 One observation that cuts the other way

The within-cell sd rises monotonically with the calibration dial: **0.968 → 1.325 → 1.273 →
1.376 → 1.465**. Increasing dispersion as a parameter increases is a recognised signature of
approaching a threshold or bifurcation regime. It may equally be that harder games simply
have more variable outcomes — with more waves lost there is more room to differ. This is not
resolved here, and it is the single strongest counter-indication in the data. Worth a
targeted look in 8C.

### 4.3 The `hangs` column is itself data — with a competing explanation

Hang rate varies systematically with two dials:

- `ENEMY.BASE.0.hp`: 18 → 8 → 13 → 16 → **28** per 144. Broadly rising with enemy HP, though
  the 18 → 8 step is a 55% drop in the wrong direction, so this is a trend, not a clean one.
- `BOT.ENGAGE_RANGE_PX`: **0** → 3 → 13 → 15 → 14 per 144. At engage range 260 the hang rate
  is **exactly zero**.

**The mechanism is not established, and there are two candidates.** The obvious reading is
bug 2 (bot leash with no return path, `bots.js:134-139`): a bot that cannot overextend past
its leash never freezes. But `ENGAGE_RANGE_PX` is *not* the leash — it governs when a bot
decides to chase at all. A shorter engage range keeps bots **parked near the hall**, and bug
1 (the hall-ring cost-field plateau, `enemies.js:154-160`) strands stragglers exactly there.
Bots sitting on the hall ring killing hall-ring stragglers explains 0/144 hangs just as well,
and implicates **bug 1, not bug 2**.

This document's own text contains the tension: engage range 260 is described both as "bots
barely engage" (enemy-s 2318, the highest measured) and as the condition where stragglers get
killed. Those pull opposite ways. **The 0/144 result is a real and striking correlation and a
good reason to investigate; it is not evidence for a specific fix.**

---

## 5. Phase-6 acceptance under a real build phase

The shipped Phase-6 stamp is *"1 human + 3 bots survive waves 1–4"*, measured with the build
loop amputated. Re-run through the real build phase, `maxWaves: 4`:

```
--- the original 6 seeds x 2 posts (directly comparable to the shipped stamp) ---
seed 20260801 post 0 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260801 post 1 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260802 post 0 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260802 post 1 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260803 post 0 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260803 post 1 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260804 post 0 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260804 post 1 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260805 post 0 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260805 post 1 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260806 post 0 | cleared 4/4 | hall 1.00 | lost false | stalled false
seed 20260806 post 1 | cleared 4/4 | hall 1.00 | lost false | stalled false

--- full matrix: 144 scenarios ---
held waves 1-4 : 144/144 (100%)
lost           : 0/144
hung           : 0/144
hall HP frac among holders: min 1.00 p25 1.00 median 1.00 p75 1.00 max 1.00
untouched halls (frac == 1.00): 144/144
```

**Waves 1–4 hold in 144/144 scenarios with the hall taking zero damage in every one.**

**The narrow, earned claim:** under a real build phase, with this harness's scripted build
policy, the Phase-6 acceptance scenario cannot fail. It therefore certifies nothing about
the shipped game, and is not a valid basis for accepting or rejecting a change.

**What this does not show:** that the old flips were meaningless *in their own configuration*.
Those were observed under an amputated build phase, where waves 1–4 were plainly not free —
the old test may well have discriminated, just on a broken game. And no bot remediation was
re-run through this harness; what is shown is that the *unmodified* game passes, not that a
bad build would also pass.

---

## 6. What this means for Phases 4 and 6

### 6.1 The Phase-4 respawn revert should be reopened

The Phase-4 record states that halving `RESPAWN_BASE_MS` 20s → 10s broke the acceptance
control *"via a **non-monotonic** chase-mode/hall-adjacent-respawn interaction (bisected
10/12/15/18/20s — pass/fail wasn't a smooth function of the value, a chaotic threshold effect
of the aggro FSM)"*, and the value was reverted to 20s.

Measured at n=144 on a continuous score, `PLAYER.RESPAWN_BASE_MS` shows a **real, replicating,
censoring-robust effect from 5000 to 20000** (effect 0.485, t 2.95, imputed 0.442, split-half
ρ = 1.00) and a **plateau above 20000**. There is no threshold anywhere in the swept range,
and the fine-scale probe at ±10% around 20000 (2.8) finds nothing but non-replicating noise —
precisely where a "chaotic threshold of the aggro FSM" would have to live if it existed.

The old bisection used a **binary pass/fail readout, on an effectively 2-seed instrument,
with the build phase amputated**. All three defects push the same way: a binary readout of a
noisy quantity looks like a threshold no matter what the underlying function is.

**The honest statement is that the old evidence was inadequate to support the revert, and the
new evidence points the other way** — not that the old conclusion is proven wrong. Shorter
respawn measurably helps, and the effect sits right at the declared relevance threshold.
Reopen it.

### 6.2 The Phase-6 CP3 deferral rests on an instrument that certifies nothing

CP3 deferred *every* bot remediation on the grounds that each *"flips the certified waves-1-4
acceptance chaotically/non-monotonically"*, citing the Phase-4 respawn revert as precedent.

Both supports are now weak:

1. The **precedent** is weakened (6.1) — the respawn dial shows an ordinary monotone-then-
   plateau, not a chaotic threshold.
2. The **instrument** certifies nothing (section 5) — waves 1–4 pass 144/144 with an untouched
   hall, so flipping it is not evidence that a change is dangerous.

And the one bot dial measured here is not chaotic: `BOT.ENGAGE_RANGE_PX` is a single-peaked
optimum whose peak-vs-shipped comparison is robust (2.5). Bot tuning looks tractable.

**It follows that the stamp is not a valid basis for deferring the bot remediations — not
that those remediations are safe.** Each must be re-measured on this instrument. The CP3
findings, headlined by CRIT-1 (*"3 bots + idle human hold flawlessly to wave 8 with NO maze"*,
against spec §4's "supplement, not solo answer"), were never disproven and should be
re-opened.

### 6.3 The game is currently much too hard at the sweep target

At shipped settings the 1-human + 3-bot configuration wins **21%** of completed runs. The
spec's declared sweep target is **40–70%**.

| change | win rate | vs shipped |
|---|---|---|
| shipped | 21% | — |
| `RESPAWN_BASE_MS` 20000 → 5000 | **53%** | inside target |
| `BOT.ENGAGE_RANGE_PX` 520 → 390 | **32%** | halfway |
| both | ? | **untested — do not assume additive** |

**These are single-dial observations and must not be shipped as a balance patch on this
evidence.** Both are candidates for the 8C sweep, which must vary them jointly. But the
direction is now measured rather than guessed, and the largest single lever is the value
Phase 4 reverted.

---

## 7. Recommendation for 8B / 8C

**On the gate's three questions:**

1. **Rough or smooth?** — **No measured dial requires a chaotic explanation at either
   resolution tested**, and fine-scale jaggedness is demonstrably non-replicating noise (2.8,
   4.1). 8C should be planned as a straightforward balance sweep, not a chaos hunt — while
   carrying 4.2 (rising dispersion) as an open question.

2. **Does 8B still ship as planned? — Yes.** Task 9 (cross-wall melee) closes a live exploit
   and never depended on the diagnosis. Task 10 (spawn protection) is a feel fix, now
   measurable.
   **Do not add the bot-leash fix to 8B on this evidence.** The 0/144 hang result (4.3) is a
   striking correlation with two competing mechanisms, one of which implicates the *other*
   soft-lock. The memory's requirement for measured justification is **not** discharged.
   Recommend instead a targeted experiment in 8B: patch each soft-lock separately and read
   the hang rate against this baseline.

3. **What goes in 8C?** Ranked by measured leverage:
   1. Joint `RESPAWN_BASE_MS` × `BOT.ENGAGE_RANGE_PX` sweep toward the 40–70% target (6.3)
   2. Re-derive the Phase-6 acceptance scenario at a horizon that can fail — waves 1–4 are
      free; the interesting region is waves 8–10
   3. Re-open the CP3 bot findings on this instrument (6.2)
   4. Resolve 4.2 — is rising dispersion a threshold signature or just harder games varying more?
   5. **The wall-band quantiser is NOT struck from 8C.** The hypothesis was about the
      *band-crossing discontinuity* — `hpToBand`'s `f > 0.6` threshold at `costField.js:40`,
      where one point of chip damage flips a wall from cost 30 to cost 12 globally. This
      baseline swept the *magnitude* of one band's cost, which is a different quantity. **The
      band-crossing hypothesis remains untested.**

**One process recommendation.** This baseline failed its own calibration gate once (1.3) and
had a headline result withdrawn at review (2.4). Both failures, and all three historical
"chaos" findings, share one root cause: **a readout with less resolution than the effect
being claimed.** Before any 8C conclusion is accepted, ask of its instrument: *what is the
smallest effect this readout can resolve, and is it smaller than the effect being claimed?*

---

## 8. Instrument caveats — what this baseline still cannot see

**Do not quote any number above without reading this section.**

1. **Economy dials are saturated.** The scripted human ends with `goldUnspent: 508` and
   `rebuildsSkippedForGold: 0` — the build policy is never gold-limited. No economy dial was
   swept, and none should be until the policy can run out of money. A flat row for
   `STARTING_GOLD` or structure costs would be a property of the **deliberately-dumb build
   policy**, not of the game.

2. **Resolution.** Each dial is a **5-point grid**; only one dial (2.8) was probed at fine
   scale. Five samples bound a function's coarse envelope; they do not prove smoothness
   between the samples. "No dial we measured, at the resolutions we measured, requires a
   chaotic explanation" is the claim this document supports. It is **not** "the simulation is
   smooth" in general.

3. **Non-independence.** 144 cells are 72 seeds × 2 posts, and the two posts **share a seed**
   (hence gate order and spawn jitter). These are clusters of 2, not 144 independent samples.
   At a plausible ICC of 0.5 every SE inflates ~1.22× and every t deflates ~18%: calibration
   5.84 → ~4.8, wall-low 3.21 → ~2.6, bot 390-vs-520 3.03 → ~2.5, respawn 3.26 → ~2.7. All
   still clear t = 2, but margins roughly halve. **The ICC was not estimated**; the power
   calculation assumed independence and n=144 may therefore be modestly under-powered against
   its own Δ = 0.5.

4. **Multiplicity.** ~14 tests were run at α = 0.05 with no correction (FWER ≈ 50%). At
   Bonferroni (|t| > 2.9) the surviving signals are: calibration score and enemy-sec, wall-low
   score, bot endpoint score and enemy-sec, bot 390-vs-520 score, respawn 5-point score. The
   respawn 5000-vs-20000 comparison (t 2.95) is marginal. Multiplicity inflates false
   *positives*, so it threatens the "this dial moves the game" claims, not the nulls.

5. **`enemySeconds` is exploratory, not co-primary.** It has no declared Δ and no power
   calculation, so a `NO SIGNAL` on it does not say what effect was excluded. It is also
   near-circular for the HP calibrator (3).

6. **Two of the plan's dial ranges were partly outside their dial's live range** —
   `WALL_ENTRY_COST.1` at 5–60 (4/5 saturated) and `AGGRO.STICKY_MS` at 4500/6000 (dead above
   `CHASE_CAP_MS`). Both were re-swept. The wall re-sweep is itself **degenerate** (2.3): it
   inverts the band cost ordering into a configuration the game cannot produce.

7. **Hang rate: 5–8% of cells, excluded from every mean.** Per-dial totals out of 720:
   calibration 83, wall 5–60 66, wall 0–15 80, bot-engage 45, sticky 45, respawn 65. Every
   table now reports a worst-case imputation bound, and **one result (2.4) was withdrawn
   because it failed that bound.** Hung cells are never rescored as losses — that would invent
   an outcome the sim never produced.

8. **The two engine soft-locks are present, unfixed, in every number here** — deliberately, so
   8B's fixes can be read as a delta. They are the hall-ring cost-field zero plateau
   (`enemies.js:154-160`'s stated invariant is false for the 8 hall-ring seed tiles) and the
   bot leash with no return path (`bots.js:134-139`).

9. **One dial at a time.** Nothing here measures interaction, and the two win-rate levers in
   6.3 have not been tested together.

10. **The scripted human never leaves its post.** A real player would kill a stranded
    straggler, so the hang rate here is an upper bound on a live human game and a lower bound
    on an AFK or all-bot game.

11. **`T_CRIT = 2` is hardcoded.** Correct at n≈130 (two-sided 5% ≈ 1.98); slightly permissive
    where `classify` is exercised at small n in the unit tests (n=12 → 2.07).

12. **Working-tree exception.** Task 7 Step 1 requires a clean tree. Three documentation files
    from a separate concurrent track (Phase 8.9 / art integration) were uncommitted when these
    numbers were taken: `docs/plans/2026-07-18-slice1-implementation-plan.md` (modified),
    `docs/plans/2026-07-24-art-asset-generation-pipeline.md` (modified),
    `docs/superpowers/specs/2026-07-25-art-direction-and-runtime-asset-integration.md`
    (untracked). All are documentation and cannot be read by `server/`, `shared/` or the
    harness. Philip was asked and ruled to proceed rather than commit another track's
    in-progress work. `server/` and `shared/balance.js` were unmodified at `da03b09`
    throughout.

---

## 9. What the adversarial review changed

The first draft of this document was reviewed by an independent adversarial agent
(statistics/simulation-engineering brief, single question: *does the printed data support the
classifications claimed, or is "smooth" being over-read?*). Verdict: **PARTIALLY OVER-READ**.
The review verified all 24 published statistics arithmetically and found them to reconcile
exactly; its objections were to interpretation and to two genuine defects. Every finding below
was re-verified against source or by re-running before being applied.

**Accepted and fixed:**

| # | finding | action |
|---|---|---|
| 1 | `winRate` divided by `scenarios.length` while hangs were dropped from the numerator — every win% wrong, biased opposite to the score column | **code fixed** (1.4); all dials re-run; all win figures corrected |
| 2 | Hang exclusion is dial-correlated with no sensitivity analysis; predicted `BOT.ENGAGE_RANGE_PX` would collapse to ~0.180 | **confirmed exactly** (0.179). Sensitivity bound added to the probe; **the endpoint result is withdrawn** (2.4) |
| 3 | Endpoint-only t is the wrong statistic when the peak is interior | 2.5 added — the peak-vs-shipped comparison, which survives and strengthens |
| 4 | "Smooth" was not falsifiable; no advance criterion for "rough" | criteria declared and reported against (4.1); **fine-scale probe added** (2.8) |
| 5 | ρ = −1.00 on respawn hangs on a 0.005 gap; "strictly better at every step" unsupported | corrected to monotone-then-plateau (2.7, 6.1) |
| 6 | "Decided on measurement error" conflates an invalid measurement with a wrong conclusion | softened throughout (3.1, 6.1, 6.2) |
| 7 | Wall low-range sweep inverts the band cost ordering; the band-*crossing* hypothesis was never tested; "the measurement exonerates it" unsupported | claim struck; degeneracy flagged (2.3); **wall quantiser restored to 8C** (7) |
| 8 | Hang-rate mechanism attributed to bug 2 when bug 1 explains it equally | rewritten with both candidates (4.3); **bot-leash fix removed from the 8B recommendation** |
| 9 | Null-dial control block was labelled n=144 but was the n=80 run | **re-run at n=144** (1.4) |
| 10 | `stats.test.js` used paraphrased calibration means, not the observed ones | corrected to the real values |
| 11 | `requiredN` quoted as 80/130; code ceils to 81/131 | corrected |
| 12 | `enemy-s` is near-circular for the HP calibrator; called "co-primary" without a declared Δ | demoted to exploratory (3, 8.5) |
| 13 | Clustering (2 posts share a seed) and multiplicity not addressed | caveats 8.3 and 8.4 added |
| 14 | Rising within-cell sd across the calibration dial — a possible threshold signature — went unremarked | surfaced as 4.2, the strongest counter-indication in the data |

**Not accepted:** the review's own multiplicity analysis showed every claimed signal survives
Bonferroni, which it stated explicitly; that objection is recorded as a caveat rather than a
correction.

**Net effect:** one headline result withdrawn (bot endpoint), one replaced with a stronger
version (peak-vs-shipped), one recommendation reversed (wall quantiser back into 8C), one
recommendation weakened (bot-leash fix out of 8B), the central claim narrowed from "the
simulation is smooth" to a bounded statement about measured resolutions, and one real code
bug fixed. **The calibration result, the respawn finding and the Phase-6 acceptance finding
all survived the attack.**
