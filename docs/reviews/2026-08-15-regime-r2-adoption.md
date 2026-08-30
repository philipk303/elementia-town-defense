# R2 regime adoption — result

Date: 2026-08-15. Family `regime-r2-adoption`, 24,000 runs, engine `5307535`,
clean worktree, **0 hangs, 0 crashes**. Registration `valid`,
`verdictAllowed: true`, 18 tests = the declared `familySize` of 18. Metric
`hallHpAuc`, n = 3000 per cell, fresh seeds (`20280801 + i`).

**R2 = {`spendDown: true`, `maxWaves: 10`, `fuse: false`} is ADOPTED. All four
declared criteria are met, 18/18 gates PASS.**

---

## 1. The ladder

Paired delta vs control on `hallHpAuc`. Watchtower damage: 2 / **3 (shipped)** /
4 / 6.

| maze | arm | Δ | t | q | sign | gates |
|---|---|---|---|---|---|---|
| A | wt-x0.67 | **−0.357** | −24.41 | ~0 | 717+/2078− | 4/4 |
| A | wt-x1.33 | **+0.207** | 15.22 | ~0 | 1784+/907− | 4/4 |
| A | wt-x2 | **+0.713** | 44.60 | ~0 | 2343+/430− | 4/4 |
| B | wt-x0.67 | **−0.466** | −18.95 | ~0 | 801+/1680− | 4/4 |
| B | wt-x1.33 | **+0.444** | 19.13 | ~0 | 1648+/834− | 4/4 |
| B | wt-x2 | **+0.796** | 31.61 | ~0 | 2032+/558− | 4/4 |

Monotone on both mazes (A: 7.859 < 8.216 < 8.423 < 8.930; B: 7.204 < 7.670 <
8.114 < 8.465), resolvable in **both directions**, with both declared
secondaries agreeing in sign on every cell.

## 2. Against the four adoption criteria

1. **Monotone on both mazes** — yes, no inversions at any rung.
2. **Every rung resolvable at BH q < 0.05 with the sign test agreeing** — yes,
   18/18 including all three secondaries.
3. **Uncensored** — **0% of control runs sit at the observed `hallHpAuc`
   maximum on either maze**, against a declared bar of under 10%.
4. **Hang-imputation survives** — yes, 18/18, on 0 hangs.

## 3. Why this matters: R1 was blind at the end that matters

R1 was correctly adopted — it was uncensored and sensitive *at wave 8*. But it
carried two limits that this project has been declaring on every family since,
and R2 removes both:

**The scope limit.** R1 stops at wave 8 and the elites concentrate at 9–10
(2x eliteGoblin + 2x eliteOrc at wave 10; eliteOrc/eliteTroll at wave 9). Every
fusion verdict has been provisional on that. In R2 the control reaches wave 9 in
68–84% of runs and wave 10 in 22–41%.

**The ceiling, which is the more serious one.** In R1, 19% (A) and 34% (B) of
control runs sat at the observed `hallHpAuc` maximum, and metric-selection-v2
recorded the top ladder rung moving maze A by **+0.0011** — statistically
invisible. R1 could see a defence getting *worse* and was nearly blind to it
getting *better*. That is precisely the wrong instrument for grading structures
whose job is to improve the defence.

| | R1 (maxWaves 8) | R2 (maxWaves 10) |
|---|---|---|
| control at ceiling, A / B | 19% / 34% | **0% / 0%** |
| wt-x2 effect, maze A | +0.0011 | **+0.713 (t 44.6)** |
| paired sd, A / B | 0.455 / 1.059 | ~0.87 / ~1.41 |
| nRequired at MDE 0.10 | 880 | 2990 |

**The trade is variance for reach and sight, and it was declared before the
run.** R2 costs ~3.4x the per-cell sample size. At ~7 minutes for 24,000 runs
that is not a real constraint.

## 4. What R2 must NOT be used for

Declared in the prereg's `scopeLimit`, and confirmed by the corpus: **R2 trades
terminal survival for reach.** Only 0–7% of runs end with the hall alive.

**`hallHpFrac`, win rate, and every other TERMINAL outcome measure are
floor-censored in R2 and are barred as primary or secondary.** `hallHpAuc` is
exempt because it is an integral over the waves actually played rather than an
end state — which is why it spans 5.76–9.50 (A) and 4.50–9.45 (B) with nothing
at either boundary. This is the strongest argument yet for `hallHpAuc`
specifically over the metrics it beat in metric-selection-v2.

`wavesCleared` is declared secondary despite being closer to a terminal measure;
any reading on it must be checked against its own ceiling share first.

## 5. What this does NOT establish

- **Adoption is not replacement.** R1 and R2 are both valid and answer different
  questions: R1 has lower variance and a clean terminal-survival band; R2
  reaches the elite waves and is not ceiling-blind. **Nothing measured in R1 is
  retracted.** Fusion measurement moves to R2 because the fusion question
  specifically concerns late-game value.
- **This family says nothing about whether fusions have late-game value.** It
  establishes only that the window in which that could be measured is a valid
  window. Reading it as evidence for fusions would be the same error as reading
  fusion-roster-v2's `spendDown` design as an equal-gold contrast.
- **The cross-policy gate is still empty** (only `scripted-v1`). Every verdict
  taken in R2 remains provisional on it, exactly as in R1.
- R2 does **not** make the scripted policy competent at late waves. It stops
  truncating the match before those waves happen; it does not teach the policy
  to survive them.

## 6. Consequence for the fusion roster

The two instrument defects blocking a real fusion verdict are now both fixed:

1. **The one-ingredient control** — fixed by `partnerSpecial` (commit `79bba51`).
2. **The wave 9–10 blind spot, and the maze-A ceiling** — fixed by R2.

A fusion re-measurement on R2 with a two-ingredient control would be the first
time this project asks spec §1's actual question — *does a fusion outperform its
two ingredients* — in a window that can see the answer. Every number in
fusion-roster-v2 was taken against the wrong baseline in a ceiling-blind window
that ended before the elites arrived.
