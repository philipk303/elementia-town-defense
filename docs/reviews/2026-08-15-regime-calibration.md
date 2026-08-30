# Regime calibration — diagnosing and fixing the floor-censored instrument

Date: 2026-08-15. Status: EXPLORATORY. No pre-registration, no verdict, no
balance change shipped. Engine `2bed80e`, isolated worktree.

The metric-selection-v1 corpus lost all 2880 runs, so `score` was identically
`wavesCleared` and no metric could be adopted. The v1 result asked for a
27-second knob-turn to move the control arm into a 30–70% success band. It was
not a knob-turn. Ten sweeps, ~9700 runs, ~4 minutes of compute.

Success = reached the horizon with the hall standing. 32–72 seeds x 2 postGaps
x 2 mazes per arm.

**The recommendation, up front:** adopt `spendDown: true` + `maxWaves: 8` on the
existing 12-site pool as the metric-selection-v2 regime, and **replace the
goblin-HP dose ladder with a Watchtower-damage ladder as the positive control.**
Reasoning in §7–8.

---

## 1. The defence is not resource-limited

The scripted policy ends a run with ~300 gold unspent. Raising
`HALL_BASE_INCOME` 10 -> 14 -> 20 changed `wavesCleared` by zero to three
decimal places — byte-identical runs. `spendDown` raised towers 8.2 -> 12.2 and
stopped dead, because 12 is exactly the `isolatedTowerSites` pool (6 rows x 2
gaps). Gold is not a lever because the policy has nowhere to put it.

## 2. It is not wall integrity

Setting the DAMAGED and CRITICAL `COST_FIELD.WALL_ENTRY_COST` bands equal to
HEALTHY — removing wall decay from routing entirely — buys **+0.07 waves** on
maze A. Doubling barricade HP buys +0.35. Both still 0% survival. Hypothesis
refuted before anything was built against it.

## 3. The loss is a cliff at wave 7

One control run, maze A: waves 1–6 take **zero** hall damage, closest approach
425–495 px. Wave 7 — when the third gate (`SIDE_B`) opens — runs 648 fight ticks
against ~240, 407 enemy-seconds against 132, and the hall goes 100% -> 0% inside
that single wave.

## 4. At 12 positions the outcome is insensitive to defence strength

Watchtower damage swept under `spendDown` (12 towers), 10-wave horizon:

| dmg | surv A | surv B | waves B |
|---|---|---|---|
| 3 | 0.0% | 0.0% | 6.95 |
| 12 | 7.8% | 0.0% | 7.97 |
| 24 | 18.8% | 0.0% | 8.08 |
| 48 | 34.4% | **1.6%** | 8.00 |
| 48 + 2x range | 40.6% | **0.0%** | 7.66 |

A **16x damage buff** leaves maze B at 1.6%. Geometry says why: the hall is at
gx 19; maze A's gaps (13, 27) are 6–8 tiles away, maze B's (5, 35) are **14–16**.
Watchtower range is 75 px ≈ 2.3 tiles, so the pinned gap-1 columns cover ~2
tiles of a 15-tile journey.

**The v1 corpus was taken inside this insensitive band.** That is a sufficient
single explanation for its 100% loss rate and for `score` degenerating to
`wavesCleared`.

## 5. Position count and position location interact (two corrections)

This section records two wrong readings and what corrected them, because both
were caught by an equal-capacity control rather than by inspection.

**First reading:** siting the defence on the hall approach fixed everything —
0% -> 14.1% on both mazes at shipped damage, 100% at damage 12. **Wrong**: the
probe bought 47.4 towers against gap siting's 12.2, because its site list is 4x
larger. Capacity, not location.

**Second reading:** therefore location is irrelevant and only count matters.
**Also wrong.** Holding capacity fixed with `defenceCap`:

| pool | cap | surv A | surv B |
|---|---|---|---|
| gap | 12 | 0.0% | 0.0% |
| hallApproach | 12 | 0.0% | 0.0% |
| gapWideDeep | 36 | 0.0% | 0.0% |
| hallApproach | 36 | 9.4% | 7.8% |

At 12 positions neither location helps — both are useless. At 36, location
matters a great deal. They interact: coverage of the hall approach only pays
once there are enough towers to cover with. Note also that magnitude and
coverage are not interchangeable — 12 towers x 48 dmg gives maze B 1.6%, while
46 towers x 6 dmg gives 67.2%, at half the total firepower.

## 6. The hall-approach pool is confounded, and the fix is row-disjointness

`hallApproach` cannot carry a verdict, and the confound is measured, not
theoretical: on maze A it forms the fusion in **39.1%** of runs against 100% in
every other arm. Defence purchases displace the fusion partner's site — exactly
the confound the isolated protocol exists to remove. Its numbers above are
partly measuring "no fusion".

The fix is a **row** invariant, which is stronger and simpler than the existing
column-band scheme: every special/fusion site lives at rows `wallRow+1..+4`, so
any defence pool confined to `wallRow+5` and below is disjoint from the entire
special site space on every maze, with no column reasoning at all. Both pools
built on that invariant (`gapWideDeep`, `hallBand`) hold **100%** fusion
formation. The invariant is validated.

`hallBand` (rows 13–20) nonetheless performs *worse* than the gap control on
maze A — 6.72 vs 7.48 waves, sd rising to 1.81. Forty-odd **blocking** towers
packed near the hall re-route the horde, the routing discontinuity the
`COST_FIELD` header warns about.

## 7. The survival band is the wrong acceptance criterion

A regime can sit at 47% survival and still be insensitive to defence strength —
which is precisely what the 12-site pool does at the 10-wave horizon. The
criterion that matters is whether a **known defence change moves the metric**.
Score response to a clean 2x Watchtower buff (48 seeds, n=96/cell):

| regime | control surv A/B | Δscore A | Δscore B | censoring |
|---|---|---|---|---|
| **R1 gap, w8** | 46.9 / 44.8 | **+0.47** | **+0.54** | none |
| R2 gapWideDeep, w8 | 82.3 / 57.3 | +0.36 | +0.68 | **A ceiling** (x2 arm 100%, sd 0.00) |
| R3 gapWideDeep, w9 | 41.7 / 5.2 | +0.21 | +0.56 | B floor |
| R4 gap, w9 | 20.8 / 3.1 | +0.43 | +0.48 | B floor |

**R1 wins on both mazes, uncensored at both ends — and it uses the original
12-site pool.** The pool expansion is not what fixes the regime; the horizon
plus `spendDown` is. `gapWideDeep`/`hallBand` are validated as sound but are
not required, and should not be shipped unless a later question needs them
(minimum code, nothing speculative).

## 8. The reversal was a saturation artifact and is gone. Goblin HP is unresolvable on maze A.

R1 regime, 72 seeds, n=144/cell, `score`, paired on `seed:postGap`:

| arm | maze A delta | t | sign p | maze B delta | t | sign p |
|---|---|---|---|---|---|---|
| dose-13 | -0.031 | -0.41 | 0.67 | -0.183 | -1.27 | 0.69 |
| dose-15 | -0.067 | -0.78 | 0.29 | -0.374 | -2.43 | 0.24 |
| dose-20 | +0.051 | 0.61 | 0.71 | -0.410 | -2.71 | **0.005** |
| dose-30 | +0.080 | 0.91 | **1.00** | -0.607 | -4.19 | **<0.0001** |

**Maze B is now cleanly monotone and resolvable at the top of the ladder.** The
v1 reversal is gone: dose-13/dose-15 read +0.177/+0.215 in v1 and -0.183/-0.374
here. That confirms the section 4 prediction — the reversal was a saturation
artifact of the floor-censored regime.

**There is no maze-A reversal.** An earlier draft of this document claimed one,
reading a rank ordering off five means. Every maze-A dose is |t| < 1 and
dose-30's sign test is 31 up / 31 down, p = 1.00. Maze A is simply
*unresponsive* to goblin HP, not non-monotone. Note the same maze A responds to
Watchtower damage at +0.47 (section 7), so this is specific to the dial.

**The v1 reversal was never established either.** Re-analysed from the stored
v1 corpus, its strongest cell is maze B dose-15 at t 2.50, sign test 96/58,
p = 0.0027 — nominally suggestive, but against the declared BH family of 64 that
is q ~ 0.17. The v1 report's own table is consistent: `score` recovered no dose.

**The methodological finding is the durable one.** v1's metric-adoption arm
required Spearman rho = 1.0 across the dose ladder and disqualified metrics for
failing it. But that criterion was applied to *point estimates*, with rungs of
0.05-0.2 against a paired SE of roughly 0.1. Ranking five means that are not
pairwise separable is mostly ranking noise. **Metrics were disqualified for
failing to order a ladder whose rungs were never resolved.** Any monotonicity
criterion must first establish that adjacent rungs are separable at the
corrected q.

Goblin HP remains the wrong positive control — not because it reverses, but
because it produces no detectable effect on maze A even at 2.5x. Watchtower
damage is monotone and resolvable on both mazes (section 7).

## 9. What this does NOT establish

- No balance change is implied or shipped. Every dial above was moved to
  diagnose the instrument; `TOWER.WATCHTOWER.damage` and all enemy dials remain
  at shipped values.
- `hallHpAuc` adoption stays provisional. Nothing here re-validates it; that
  needs the re-taken corpus.
- The 2026-08-04 siting ruling is untouched. This says the pool is small and
  the 10-wave horizon saturates it, not that pinning the column was wrong.
- R1 truncates the horizon to 8 waves, so **waves 9 and 10 are never measured**
  — and that is where the elites concentrate (2x eliteGoblin + 2x eliteOrc at
  wave 10). Any structure whose value shows only against late elites is
  invisible in R1. This must be stated in the v2 pre-registration as a scope
  limit, not discovered later.
- Why goblin HP fails to register on maze A is **not known**. The v1
  crowd-jam/plug speculation remains speculation and has not been measured. The
  reversal it was invented to explain no longer needs explaining.

## 10. Next steps, in order

1. Pre-register `metric-selection-v2` on the R1 regime with a
   Watchtower-damage positive control, declaring the wave 9–10 scope limit.
2. Re-take the corpus (~2880 runs, well under a minute) and re-run the metric
   selection, including `hallHpAuc`.
3. Fold the monotonicity-resolvability check into the v2 analysis rather than
   giving it its own corpus. Escalate to a dedicated pre-registered mechanism
   study ONLY if v2 shows a non-monotone rung resolvable at BH-corrected q.
4. WP5 (`competent-v1`) after the above, not before: at 12 positions a more
   competent policy has little to push on, and R1 gives it a sensitive regime
   to be built against.
