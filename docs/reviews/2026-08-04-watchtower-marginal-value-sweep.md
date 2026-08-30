# Watchtower marginal value — is the A1.4 "1.0 power unit" anchor linear or saturating?

Date: 2026-08-04
Instrument: `test/harness/watchtowerMarginal.js` (new), `defenceCap` option added to `test/harness/matchRunner.js`
Per-cell data: `test/harness/watchtower-marginal-2026-08-04.json` (committed — see §8)

> ## Verdict: **NO VERDICT** — see §6
>
> The pre-declared rule ("first usable step vs last usable step") left two
> degrees of freedom it never named, and the answer flips on both. Applied
> literally it says LINEAR (0 of 10 decline rows negative). Applied with the top
> step excluded — which this review independently argues is a different regime —
> it says **SATURATING**, with the strongest statistics in the dataset (paired t
> up to **-9.70**, 132 of 143 untied cells declining). Those are opposite spec
> conclusions, so neither may be claimed. Separately, the score axis — the axis
> A1.4 is written in — is **underpowered by 1.4-3.9x** and could not have
> detected total saturation.
>
> **Established under every reading:** hang gate 0/144 in all 14 arms; every
> per-wave damage step is significantly positive; and the A1.4 power unit
> `score(1) - score(0)` is **+0.090 on maze A (indistinguishable from zero)** and
> +0.257 on maze B, against a per-cell standard error of 0.10-0.14 — i.e. the
> unit of the balance currency is about one standard error of the instrument
> meant to measure it. That is a spec problem independent of the saturation
> question, and it is the one actionable finding here.
>
> **Nothing was tuned.** `shared/balance.js` and `stats.js` are untouched.

---

## 1. The question, and why it is not a balance question

Amendment A1.4 (`docs/superpowers/specs/2026-07-25-combat-structure-redesign.md`
lines 585-613) defines the bar every elemental fusion must clear:

> 1.0 power unit = the measured score contribution of one WATCHTOWER at its
> shipped cost, in the same maze and placement.

A fusion costs ~15-16 gold (two specials) against a Watchtower's 6. At equal
gold, a fusion must therefore out-perform ~2.7 Watchtowers from a single
footprint.

That bar is fair only if Watchtower value **saturates** with count. If N
Watchtowers deliver ~N times the value of one, then on any linearly-scaling
axis the cheap structure wins at equal gold *by construction*, and no amount of
tuning can make the fusion tier clear A1.4(a). Nobody had measured the shape of
that curve. This session measures it.

This is a measurement of the **measurement premise**, not of the game. Nothing
in `shared/balance.js` was touched and no structure was tuned. Per the
`probe.js` convention the driver prints no pass/fail verdict on the game.

---

## 2. Pre-declared decision rule

**Written into this file before any full-sweep number existed** (the pilot run
that sized `maxWaves` is described in §3; it produced no step statistics). The
thresholds below were not revised after seeing results.

```
marginal(N) = score(N) - score(N-1), PAIRED per seed (same seed/post pair
              across the two N values).

LINEAR      = marginal(N) does not decline significantly across the usable range
              (compare the first available step against the last available step
              under paired t AND exact sign test, BH-corrected within-file).

SATURATING  = marginal(N) declines significantly (first step vs last step).

LINEAR     -> A1.4(a) is likely unclearable by construction for the fusion tier.
              Report that as a SPEC problem. Do not tune anything.
SATURATING -> the anchor is fair. Proceed to the Muddy Bog anchoring session
              (not this session's job — just say so).
```

**Ceiling guard, also pre-declared.** `score = wavesCleared + hallHpFrac`
ceilings at `maxWaves + 1`. Any N whose **win rate exceeds 90%** or whose **mean
score exceeds 10.0** is EXCLUDED from the linearity fit, because at the ceiling
a flat marginal curve is a property of the scoring function, not of the game.

**Statistics.** Every claim reports Welch t, paired t and exact sign p, with
worst-case hang imputation, a split-half check, and Benjamini-Hochberg
correction at q=0.05 within-file (family = every N-step comparison in this
review). This is the house standard set by
`docs/reviews/2026-08-04-paired-statistic-retrospective.md` §2 and §5. Where the
paired t clears BH but the sign test does not, both are reported.

---

## 3. Instrument

`defenceCap: N` was added to `runMatch`/`runBuildPolicy` in
`test/harness/matchRunner.js`. It caps the **concurrent standing count** of the
`defence` structure type owned by the scripted human, checked before each
purchase in the defence arm's spend-down loop. Standing, not cumulative: a
defence lost to the horde frees its slot and can be rebuilt. `null` (the
default) reproduces today's unbounded spend-down byte for byte, so every
existing measurement stays comparable. `npm test` is green before and after.

Sweep configuration (`test/harness/watchtowerMarginal.js`):

| | |
|---|---|
| defence | `WATCHTOWER` (cost 6), `spendDown: true`, `defenceCap: N` |
| N | 0, 1, 2, 3, 4, 5, 6 |
| siting | `sitingProtocol: 'isolated'` — Watchtower pinned to the `gap-1` column, 12 sites, so N=6 is well inside the pool and the cap, not geometry, binds |
| isolation | `fuse: false`, `freeSpecial: false` — the Watchtower count is the only thing that varies (same shape as the Rock Trap / Firepit standalone measurements) |
| cells | 144 per N per maze (72 seeds x 2 posts), both mazes |
| maxWaves | **10 (fixed, identical on every arm)** |
| total | 7 N x 144 x 2 mazes = **2016 matches** |

**`maxWaves` choice.** A pilot (4 seeds x 2 posts x both mazes, N=1..6) was run
before the full sweep and produced only arm-level win rates and means, no step
statistics. It showed a **0% win rate at every N including N=6**, with mean
score 7.9 (maze A) / 6.1 (maze B) against a ceiling of 11. Shortening
`maxWaves` would only lower the ceiling and make the trap worse, so the full
10-wave horizon was kept. At that horizon `runMatch`'s early-stop clause never
fires, so every arm faces the identical full wave schedule and ends on its own
WON/LOST.

**Two instrument choices the pilot forced, both recorded here so they are not
mistaken for post-hoc tuning:**

1. *Duration control.* A loss still truncates a match, and higher N survives
   *longer* (7.63 -> 8.23 waves played on maze A), so raw enemy-seconds and raw
   structure damage are confounded with match length — guard 2's concern with
   the sign reversed. A fixed wave PREFIX was tried first and **rejected**: all
   six Watchtowers are standing by the wave-2 build phase in every arm (in wave
   1 gold, not the cap, binds — starting gold is 8 and a tower costs 6), but
   structure damage over waves 1-4 is only ~28 of a 194-654 match total, so the
   prefix controls duration by discarding essentially all of the signal. The
   `...PerWave` metrics divide by waves actually played instead. **This is a
   partial control, not a clean one, and the first draft of this review
   overstated it.** Within an arm, `corr(wavesPlayed, structDmg/wave)` is
   0.50-0.81 on maze A and 0.48-0.97 on maze B — later waves are denser, so a
   longer match has a higher per-wave rate as well as more waves. Dividing by
   wave count dents the confound; it does not remove it. Since higher N survives
   longer, residual duration inflation pushes the high-N per-wave rates *up*,
   i.e. against finding saturation. Raw totals are reported alongside.
2. *N=0.* The first sweep ran N=1..6 only. A1.4 defines the power unit as the
   score contribution of **one** Watchtower, which N>=1 cannot measure at all —
   there was no zero-tower arm. N=0 was added and the sweep re-run. This extends
   the range the pre-declared rule's own wording ("first available step")
   operates over; **no threshold was changed**. But the extension is **not
   verdict-neutral**, and an earlier draft of this review wrongly claimed it
   "could only ever make the decline test more likely to find saturation". It
   does the opposite on maze A's headline axis: the structDmg/wave `declared`
   decline test reads +0.908 (t 0.59, sign 64/79 — a declining majority, null)
   with N=1..6, and +4.081 (t 2.18, sign 75/69) once N=0 is prepended. The
   original N=1..6 range's own first-vs-last test is reported in full on **all
   five metrics** as reading C (`parityEven`, 1->2 vs 5->6) in §5.3 — it is the
   same comparison — rather than only on the metric where the two ranges agree.

---

## 4. Arm-level results and the ceiling guard

Hangs: **0/144 in all 14 arms.** Win rate: **0.0% in all 14 arms.**

### Maze A (lanes 13/27, near-center)

| N | win% | score | sd | waves | enemySec | structDmg | enemySec/wave | structDmg/wave | goldUnspent | bought |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 6.625 | 1.423 | 6.63 | 1244.8 | 34 | 158.2 | 4.0 | 345.8 | 0.00 |
| 1 | 0.0 | 6.715 | 1.432 | 6.72 | 1284.2 | 141 | 160.9 | 16.8 | 347.9 | 1.00 |
| 2 | 0.0 | 6.785 | 1.269 | 6.78 | 1280.2 | 265 | 160.1 | 32.7 | 344.1 | 2.00 |
| 3 | 0.0 | 6.806 | 1.253 | 6.81 | 1282.7 | 319 | 160.1 | 39.0 | 339.5 | 3.00 |
| 4 | 0.0 | 6.764 | 1.240 | 6.76 | 1260.6 | 418 | 157.8 | 51.8 | 330.9 | 4.00 |
| 5 | 0.0 | 6.792 | 1.211 | 6.79 | 1262.5 | 441 | 157.9 | 54.5 | 326.1 | 5.00 |
| 6 | 0.0 | 7.229 | 0.825 | 7.23 | 1365.1 | 598 | 163.7 | 71.4 | 351.0 | 6.25 |

### Maze B (lanes 5/35, flank — the more informative maze, guard 3)

| N | win% | score | sd | waves | enemySec | structDmg | enemySec/wave | structDmg/wave | goldUnspent | bought |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0.0 | 5.299 | 1.574 | 5.30 | 933.1 | 6 | 138.5 | 0.8 | 254.2 | 0.00 |
| 1 | 0.0 | 5.556 | 1.513 | 5.56 | 997.4 | 96 | 143.0 | 13.4 | 264.4 | 1.00 |
| 2 | 0.0 | 5.542 | 1.477 | 5.54 | 987.5 | 181 | 142.1 | 25.2 | 256.4 | 2.00 |
| 3 | 0.0 | 5.660 | 1.614 | 5.66 | 1020.5 | 273 | 142.7 | 37.2 | 261.1 | 3.00 |
| 4 | 0.0 | 5.840 | 1.590 | 5.84 | 1074.3 | 372 | 146.8 | 49.6 | 266.9 | 4.00 |
| 5 | 0.0 | 5.910 | 1.532 | 5.91 | 1086.5 | 438 | 147.7 | 58.6 | 264.8 | 5.00 |
| 6 | 0.0 | 6.208 | 1.642 | 6.21 | 1187.8 | 575 | 154.5 | 73.4 | 281.0 | 6.22 |

**Guard 1 — ceiling.** The pre-declared exclusion rule (win rate > 90% OR mean
score > 10.0) **excluded nothing**. No arm on either maze won a single match,
and the highest arm mean is 7.229 against a ceiling of 11. The score-ceiling
trap did not fire in this measurement.

**But the guard's non-firing is not the reassurance the first draft claimed it
was, and this is the most important correction in this review.** The reason the
ceiling was never approached is that **all 2016 matches were LOST** — and
`hallHpFrac` is therefore **exactly 0.000 in every one of the 2016 cells**.
Since `score = wavesCleared + hallHpFrac`, the score in this measurement is
**identically the integer wave count**, with no sub-wave resolution whatsoever
(the arm table's score and waves columns are the same number: 6.625/6.63,
5.299/5.30). Consequences the pre-declared guard could not have caught:

- Every score effect reported below is composed purely of a handful of cells
  flipping one whole wave. That is why 63-130 of 144 cells **tie** on every
  score step.
- Paired-t normality is badly violated on the score axis: 6 distinct values,
  ~44-90% ties.
- The same 0% win rate that spared the ceiling is what destroyed the score's
  continuous component. The guard traded one degeneracy for another.

**Floor censoring — a mirror-image confound the rule never declared.** The
minimum score is **exactly 4** in all 2016 cells, a structural floor. Cells
pinned on it:

| maze | N=0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| A | 22 | 20 | 13 | 10 | 7 | 7 | 2 |
| B | **74 (51%)** | 54 | 52 | 57 | 44 | 36 | 35 |

Half of maze B's N=0 arm sits on the floor. Censoring compresses the **first**
step and not the last, biasing the decline test toward "increase" — the exact
opposite direction from the ceiling trap the rule was written to guard against.
The pre-declared guard covered only the ceiling; this was never declared and is
reported here as an uncontrolled confound on the score axis.

**Guard 3 — maze A vs maze B.** Maze A did *not* saturate or flatten early
relative to maze B; if anything maze A is the one with the sharper N=6 jump.
Both are reported separately below. Neither maze approached its ceiling, so the
"read maze B, distrust maze A" caution does not bind here — but maze B remains
the cleaner read for the linearity of the damage axis (§5.2).

**Guard 4 — leftover gold.** `goldUnspent` is 326-351 (maze A) and 254-281
(maze B) and is **flat in N** — buying six Watchtowers (36 gold) barely dents a
~350-gold surplus. `rebuildsSkippedForGold` is **0.00 at every N on both
mazes**: the barricade rebuild loop, which runs *before* the defence arm and
therefore has first claim on gold, is never gold-limited in any arm.
`server/game/repair.js` has no caller outside its own test (no EVENTS entry, no
socket handler, no client binding — see the `runBuildPolicy` header in
`matchRunner.js`), so leftover gold does nothing else in this codebase.
**A low-N arm is a clean control**: it is not secretly buying something else
with the gold it did not spend on towers.

**One arm-level anomaly, flagged now and analysed in §6.** `bought` exceeds N
only at N=6 (6.25 on maze A, 6.22 on maze B) — Watchtowers are destroyed and
rebuilt in 28/144 maze-A cells and 13/144 maze-B cells at N=6, and in **zero
cells at every N <= 5**. Maze A's score sd also collapses from ~1.2 to 0.825 at
N=6 alone. Something changes in kind, not degree, at the sixth tower.

---

## 5. The marginal curve

All statistics are paired per seed/post cell. BH is applied at q=0.05 with the
family = every comparison in this file (60 step tests + 10 decline tests = 70).
`Y` = survives BH.

### 5.1 Score — the metric A1.4 is written in

| step | maze A meanΔ | pairT (q, BH) | Welch t (q, BH) | b/w/t | sign p (q, BH) |
|---|---|---|---|---|---|
| 0->1 | +0.090 | 1.05 (0.416, .) | 0.54 (0.853, .) | 25/23/96 | 0.8854 (0.938, .) |
| 1->2 | +0.069 | 0.83 (0.523, .) | 0.44 (0.905, .) | 28/23/93 | 0.5758 (0.730, .) |
| 2->3 | +0.021 | 0.24 (0.864, .) | 0.14 (0.994, .) | 20/20/104 | 1.0000 (1.000, .) |
| 3->4 | -0.042 | -0.56 (0.686, .) | 0.28 (0.994, .) | 24/28/92 | 0.6778 (0.792, .) |
| 4->5 | +0.028 | 0.85 (0.516, .) | 0.19 (0.994, .) | 8/6/130 | 0.7905 (0.870, .) |
| 5->6 | **+0.438** | **5.24 (0.000, Y)** | **3.58 (0.001, Y)** | 37/8/99 | **0.0000 (0.000, Y)** |

| step | maze B meanΔ | pairT (q, BH) | Welch t (q, BH) | b/w/t | sign p (q, BH) |
|---|---|---|---|---|---|
| 0->1 | **+0.257** | **2.87 (0.012, Y)** | 1.41 (0.341, .) | 31/15/98 | 0.0259 (0.055, .) |
| 1->2 | -0.014 | -0.19 (0.904, .) | 0.08 (0.994, .) | 18/22/104 | 0.6358 (0.764, .) |
| 2->3 | +0.118 | 1.38 (0.273, .) | 0.65 (0.796, .) | 35/25/84 | 0.2451 (0.368, .) |
| 3->4 | +0.181 | 2.26 (0.052, .) | 0.96 (0.617, .) | 33/16/95 | 0.0213 (0.052, .) |
| 4->5 | +0.069 | 0.95 (0.467, .) | 0.38 (0.942, .) | 25/14/105 | 0.1081 (0.191, .) |
| 5->6 | **+0.299** | **3.62 (0.001, Y)** | 1.60 (0.258, .) | 29/9/106 | **0.0017 (0.004, Y)** |

Read the *shape* of these columns, not just the significant rows: score is flat
within noise for every step below the top one, on both mazes. Only 5->6 moves,
and §6 argues at length that 5->6 is not a marginal effect.

Cells where the statistics disagree, reported per the retrospective's §4
standard rather than resolved by picking one:

- **maze B 0->1** (the A1.4 anchor step itself): paired t clears BH (q 0.012),
  the sign test does **not** (p 0.0259, q 0.055 — a hair over), and Welch is
  null (q 0.341). The effect is real-ish but not robustly so.
- **maze B 3->4**: nothing clears BH — paired t q 0.052 and sign q 0.052 both
  miss by a hair, Welch is null. (An earlier draft of this review reported the
  sign test here as BH-clearing at q 0.048; that q came from the 70-comparison
  family of the first run, and the family is now 90 comparisons because the two
  extra decline readings of §5.3 were added. It no longer clears. This is the
  BH family growing, not a number changing.)
- **maze A 5->6 vs maze B 5->6**: both clear on paired t and sign, but Welch
  clears only on maze A (q 0.001 vs 0.258) — the unpaired statistic is throwing
  away the pairing on maze B, exactly the retrospective's §2 point.

### 5.2 Structure damage per wave — the non-ceilinged, partially duration-controlled axis

| step | maze A meanΔ | pairT | sign b/w/t | maze B meanΔ | pairT | sign b/w/t |
|---|---|---|---|---|---|---|
| 0->1 | +12.790 | 17.17 Y | 143/1/0 Y | +12.554 | 15.77 Y | 134/1/9 Y |
| 1->2 | +15.964 | 16.89 Y | 136/4/4 Y | +11.820 | 12.06 Y | 102/1/41 Y |
| 2->3 | +6.293 | 8.18 Y | 121/22/1 Y | +12.005 | 11.24 Y | 124/10/10 Y |
| 3->4 | +12.794 | 11.36 Y | 120/21/3 Y | +12.392 | 8.75 Y | 98/11/35 Y |
| 4->5 | **+2.716** | 4.15 Y | 116/18/10 Y | **+8.965** | 7.59 Y | 110/14/20 Y |
| 5->6 | +16.871 | 11.66 Y | 130/11/3 Y | +14.785 | 8.84 Y | 105/7/32 Y |

Every one of these 12 steps is significantly **positive** on paired t, sign test
and (10 of 12) Welch t, all surviving BH — each additional Watchtower does add
damage. Raw (undivided) structure damage agrees: maze A 34 -> 598 across
N=0..6 (17.6x), maze B 6 -> 575 (96x).

**But the steps are not equal, and the pattern is not random.** Read the column
in isolation and maze B looks flat (+12.55, +11.82, +12.01, +12.39, +8.97,
+14.79). Read it by **step parity** and a different structure appears:

| | to ODD N (0->1, 2->3, 4->5) | to EVEN N (1->2, 3->4, 5->6) |
|---|---|---|
| maze A | 12.79 -> 6.29 -> **2.72** (-79%) | 15.96 -> 12.79 -> 16.87 (flat) |
| maze B | 12.55 -> 12.01 -> **8.97** (-29%) | 11.82 -> 12.39 -> 14.79 (rising) |

`isolatedTowerSites` (`matchRunner.js:230-236`) is **row-major over both gaps**,
so it alternates lanes: it fills `(gap0-1, row1), (gap1-1, row1), (gap0-1,
row2), ...`. Even N is therefore lane-symmetric and odd N is not, and
consecutive steps are **not like-for-like** — a step to odd N adds a tower to
the lane that is already better covered. The odd-N sequence saturates on both
mazes; the even-N sequence does not. This confound was not anticipated by the
pre-declared rule and it is the second of the two degrees of freedom that decide
the verdict (§5.3).

Enemy-seconds (raw and per-wave) is the weakest axis: mostly null, and it moves
*upward* with N, which is the duration effect (more towers -> survive longer ->
more enemy-seconds) rather than a defence effect. It carries no weight here.

### 5.3 The decline test — and the two degrees of freedom the rule left open

A **negative** `diff` is saturation. The usable range is all of N=0..6 on both
mazes, since the ceiling guard excluded nothing.

The declared rule says "first available step vs last available step". Applying
that literally requires two choices the rule never named:

- **(i) Is the top step in range?** §6 argues on three independent, data-backed
  grounds that N=5->6 is a change of regime rather than a marginal effect. The
  rule pre-declared exactly one exclusion criterion — the ceiling guard — and no
  topology criterion. So dropping the top step is a *reading*, not the rule.
- **(ii) Which steps are comparable?** The declared comparison (0->1 vs 5->6)
  pits an even->odd step against an odd->even step, which §5.2 shows are not the
  same kind of step.

All three readings are computed by the driver and reported here. `MDE80` is the
smallest decline the row could detect at 80% power, two-sided 0.05.

**Reading A — `declared` (0->1 vs 5->6), literally the rule**

| maze | metric | first | last | diff | MDE80 | pairT (q, BH) | sign b/w/t, p (q, BH) | split |
|---|---|---|---|---|---|---|---|---|
| A | score | +0.090 | +0.438 | +0.347 | 0.349 | **2.78 (0.014, Y)** | 51/30/63, 0.0257 (0.055, .) | agree |
| A | enemySeconds | +39.4 | +102.6 | +63.2 | 121.9 | 1.45 (0.244, .) | 76/68/0, 0.5598 (0.720, .) | agree |
| A | structureDamage | +107.5 | +157.5 | +50.0 | 54.2 | **2.58 (0.023, Y)** | 77/67/0, 0.4534 (0.600, .) | agree |
| A | enemySec/wave | +2.78 | +5.76 | +2.98 | 8.86 | 0.94 (0.467, .) | 76/68/0, 0.5598 (0.720, .) | agree |
| A | structDmg/wave | +12.79 | +16.87 | +4.08 | 5.24 | 2.18 (0.060, .) | 75/69/0, 0.6771 (0.792, .) | agree |
| B | score | +0.257 | +0.299 | +0.042 | 0.364 | 0.32 (0.822, .) | 40/37/67, 0.8199 (0.878, .) | **FLIP** |
| B | enemySeconds | +64.3 | +101.2 | +36.9 | 127.2 | 0.81 (0.529, .) | 74/70/0, 0.8027 (0.870, .) | **FLIP** |
| B | structureDamage | +89.8 | +136.6 | +46.9 | 59.1 | 2.22 (0.056, .) | 66/78/0 **(discordant)**, 0.3594 (0.505, .) | agree |
| B | enemySec/wave | +4.54 | +6.88 | +2.34 | 9.15 | 0.72 (0.586, .) | 74/70/0, 0.8027 (0.870, .) | **FLIP** |
| B | structDmg/wave | +12.55 | +14.79 | +2.23 | 5.82 | 1.07 (0.413, .) | 66/78/0 **(discordant)**, 0.3594 (0.505, .) | agree |

Zero of ten negative; two significantly positive after BH. **-> LINEAR.**

**Reading B — `dropTop` (0->1 vs 4->5), top step excluded, parity-matched "to odd"**

| maze | metric | first | last | diff | MDE80 | pairT (q, BH) | sign b/w/t, p (q, BH) | split |
|---|---|---|---|---|---|---|---|---|
| A | score | +0.090 | +0.028 | **-0.063** | 0.264 | -0.66 (0.618, .) | 28/25/91 **(discordant)**, 0.7838 (0.870, .) | **FLIP** |
| A | enemySeconds | +39.4 | +2.0 | **-37.5** | 111.2 | -0.94 (0.467, .) | 80/58/6 **(discordant)**, 0.0735 (0.135, .) | agree |
| A | structureDamage | +107.5 | +23.1 | **-84.4** | 30.2 | **-7.83 (0.000, Y)** | 14/128/2, **0.0000 (0.000, Y)** | agree |
| A | enemySec/wave | +2.78 | +0.10 | **-2.68** | 8.38 | -0.90 (0.492, .) | 81/57/6 **(discordant)**, 0.0498 (0.098, .) | agree |
| A | structDmg/wave | +12.79 | +2.72 | **-10.07** | 2.91 | **-9.70 (0.000, Y)** | 11/132/1, **0.0000 (0.000, Y)** | agree |
| B | score | +0.257 | +0.069 | **-0.188** | 0.328 | -1.60 (0.185, .) | 32/37/75, 0.6305 (0.764, .) | **FLIP** |
| B | enemySeconds | +64.3 | +12.2 | **-52.1** | 111.8 | -1.30 (0.307, .) | 55/80/9, 0.0385 (0.079, .) | **FLIP** |
| B | structureDamage | +89.8 | +66.3 | **-23.5** | 36.9 | -1.78 (0.133, .) | 40/93/11, **0.0000 (0.000, Y)** | agree |
| B | enemySec/wave | +4.54 | +0.87 | **-3.67** | 8.20 | -1.25 (0.330, .) | 53/82/9, **0.0156 (0.039, Y)** | **FLIP** |
| B | structDmg/wave | +12.55 | +8.97 | **-3.59** | 3.33 | **-3.02 (0.008, Y)** | 39/99/6, **0.0000 (0.000, Y)** | agree |

**Ten of ten negative.** Five clear BH on at least one statistic, including the
two largest |t| values anywhere in this file (A structDmg/wave t **-9.70** with
132 of 143 untied cells declining; A structureDamage t **-7.83**). **->
SATURATING.**

**Reading C — `parityEven` (1->2 vs 5->6), parity-matched "to even"**

| maze | metric | diff | pairT (q, BH) | sign b/w/t, p (q, BH) |
|---|---|---|---|---|
| A | score | +0.368 | **3.30 (0.004, Y)** | 42/23/79, 0.0248 (0.055, .) |
| A | enemySeconds | +106.6 | **2.83 (0.013, Y)** | 71/72/1 **(discordant)**, 1.0000 (1.000, .) |
| A | structureDamage | +33.5 | 1.98 (0.090, .) | 66/77/1 **(discordant)**, 0.4031 (0.541, .) |
| A | enemySec/wave | +6.62 | **2.34 (0.043, Y)** | 74/69/1, 0.7381 (0.841, .) |
| A | structDmg/wave | +0.91 | 0.59 (0.664, .) | 64/79/1 **(discordant)**, 0.2416 (0.368, .) |
| B | score | +0.313 | **3.06 (0.007, Y)** | 40/16/88, **0.0018 (0.005, Y)** |
| B | enemySeconds | +111.2 | **2.81 (0.013, Y)** | 63/49/32, 0.2191 (0.340, .) |
| B | structureDamage | +51.7 | **3.03 (0.008, Y)** | 63/49/32, 0.2191 (0.340, .) |
| B | enemySec/wave | +7.83 | **2.63 (0.021, Y)** | 65/47/32, 0.1078 (0.191, .) |
| B | structDmg/wave | +2.97 | 2.08 (0.073, .) | 63/49/32, 0.2191 (0.340, .) |

Zero of ten negative; six significantly positive. **-> LINEAR.**

**Mean/sign discordance** (mean and majority-of-cells point opposite ways) is
flagged inline above and occurs on 11 rows. It is a diagnostic the first draft
reported for two cells and silently passed over elsewhere; on reading A's maze-B
damage rows the mean is positive while **78 of 144 cells decline**.

**Split-half.** Nine of thirty rows FLIP, concentrated on maze B and on the
score/enemy-seconds axes. Note that on a *null* row a split-half sign match is
close to a coin flip and is **not** evidence of robustness — only the "agree"
marks on rows that resolve (the reading-B damage rows) carry weight, and those
do all agree.

---

## 6. VERDICT

# NO VERDICT

**The pre-declared rule does not determine an answer on this data.** It fixes
the usable range with a single criterion (the ceiling guard, which excluded
nothing) and then says "first step vs last step". That leaves two degrees of
freedom the rule never named, and **the answer flips depending on both**:

| reading | permitted by the rule? | rows negative | verdict |
|---|---|---|---|
| A `declared` — 0->1 vs 5->6 | yes, literally | 0 of 10 | LINEAR |
| B `dropTop` — 0->1 vs 4->5 | only if §6's topology argument is accepted | **10 of 10**, 5 BH-significant, \|t\| up to 9.70 | **SATURATING** |
| C `parityEven` — 1->2 vs 5->6 | parity-matched alternative | 0 of 10 | LINEAR |

The literal reading gives LINEAR. The reading that drops the one step this
review independently argues is a different regime gives **SATURATING, with the
strongest statistics in the entire dataset**. Those are opposite spec
conclusions for A1.4.

**Why this is NO VERDICT and not a choice between them.** The rule was declared
up front precisely so that the answer could not be selected after seeing the
data. Retrofitting it now — either by adding a topology exclusion that
conveniently yields SATURATING, or by insisting on the literal reading and
suppressing the fact that it rests entirely on a step this document argues is an
artifact — is the exact failure the up-front declaration exists to prevent. The
honest report is that **the measurement was not designed to resolve this**, and
LINEAR or SATURATING may only be claimed if it holds under *every* reading the
declared rule permits. It does not.

An earlier draft of this review called **LINEAR** and asserted that "the decline
test is null or positive under every subrange examined". **That claim was false**
— the subrange excluding the top step had not been examined, and it is strongly
negative. The claim was caught by adversarial review and is corrected here.

### The score axis is separately unpowered — NO VERDICT there regardless

The rule is written in **score**. On that axis the test cannot detect even
*total* saturation:

| maze | first-step mean (the largest decline physically possible) | MDE80 |
|---|---|---|
| A | +0.090 | 0.349 (**3.9x short**) |
| B | +0.257 | 0.364 (**1.4x short**) |

Marginal value could fall to exactly zero at the last step and every score row
would still return null. The rule declared no minimum effect size, so "does not
decline significantly" on score is **unfalsifiable by construction** — absence
of evidence, not evidence of absence. Add the two uncontrolled degeneracies from
§4 (score is an integer wave count because `hallHpFrac` is 0 in all 2016 cells;
22-74 cells per arm are pinned on the score floor of 4) and the score axis
cannot support any linearity verdict at this sample size.

Only the two damage axes are adequately powered (MDE80 2.9-5.8 against observed
effects of 3.6-10.1), and those are the axes where reading B resolves.

### What was and was not established

**Established, and not in dispute under any reading:**

- Hang gate **0/144 in all 14 arms**; 0% win rate; the ceiling never approached.
- Every single one of the 12 per-wave damage steps is significantly **positive**
  — each added Watchtower does contribute damage. There is no dead zone.
- Leftover gold is inert (guard 4, below), so low-N is a clean control.
- The A1.4 anchor itself, `score(1) - score(0)`, is **+0.090 on maze A and not
  distinguishable from zero** (pairT 1.05, q 0.416; sign 25/23, p 0.885), and
  **+0.257 on maze B** (pairT clears BH at q 0.012; sign test does not, p 0.0259,
  q 0.055). Per-cell score sd is 1.21-1.64, so the standard error at n=144 is
  0.10-0.14: **"1.0 power unit" is approximately one standard error of the
  instrument that has to measure it.** Two fusions a whole power unit apart
  cannot be ranked against each other on the score axis. This holds under every
  reading and is independent of the linearity question.

**Not established:** whether Watchtower value saturates. That was the question.

### Guard 4 — leftover gold (unchanged, and clean)

`goldUnspent` is 326-351 (maze A) and 254-281 (maze B) and is **flat in N** —
six Watchtowers (36 gold) barely dent a ~350-gold surplus.
`rebuildsSkippedForGold` is **0.00 at every N on both mazes**: the barricade
rebuild loop, which runs *before* the defence arm and has first claim on gold,
is never gold-limited in any arm. `server/game/repair.js` has no caller outside
its own test, so leftover gold does nothing else in this codebase. A low-N arm
is not secretly buying something else.

### Guard 5 — score vs the companion metrics

Guard 5 anticipated "score saturates but damage keeps rising -> the correct
finding is that score cannot see it". What actually happened is worse for the
score axis: across N=0..6 on maze A, structure damage rises **17.6x** while
score rises **9%**, and the score axis turns out to be an integer wave count
that is both floor-censored and underpowered by 1.4-3.9x. The right statement is
**"the damage axes can see the curve and disagree about it depending on which
steps you compare; score cannot see the curve at all."**

### The N=5 -> N=6 discontinuity — the step the whole disagreement turns on

Score is flat within noise for N=1..5 (+0.069, +0.021, -0.042, +0.028 on maze A)
and then jumps +0.438 at 5->6 on maze A and +0.299 on maze B. Three independent,
data-backed signs say this is a **change of regime**:

1. Structure damage per wave does **not** jump at 5->6 relative to other steps
   (+16.87 vs +15.96 at 1->2, +12.79 at 3->4). The combat output of the sixth
   tower is unremarkable; only the score is.
2. Towers are destroyed and rebuilt in **28/144 (A) and 13/144 (B) cells at
   N=6, and in zero cells at every N <= 5**. Maze A's score sd also collapses
   from ~1.2 to 0.825 at N=6 alone.
3. N=6 is the first fully lane-symmetric configuration at depth 3 (§5.2's parity
   structure), so it is the point at which the even-N sequence completes.

*A correction to the first draft's stated mechanism:* it claimed
`isolatedTowerSites` fills depth-first and that "both lanes are walled three rows
deep". Both are wrong. The fill is **row-major/lane-alternating**
(`matchRunner.js:230-236`), and the towers sit at `gap-1`, **beside** the lane —
the lane column `gap` is never occupied, so nothing is "walled". The parity
account in §5.2 is the better-evidenced description; the rebuild counts in point
2 remain the strongest direct evidence that something changes in kind at N=6.

**This step is exactly what the verdict hinges on, and that is why there is no
verdict.** Including it gives LINEAR; excluding it gives SATURATING with t up to
-9.70.

### What a future run would need to PRE-DECLARE to get a real verdict

Not tuning — instrument design. In declaration order:

1. **A minimum detectable effect on the decision axis.** `scenarios.js` sized
   its own sample from a declared delta=0.5; the decline test declared nothing.
   Declare the smallest marginal-value decline worth calling saturation and size
   n from it, or accept a NO VERDICT in advance.
2. **A decision axis the instrument can resolve.** Structure damage per wave has
   t-statistics of 4-17 where score has 0.2-3.6, and gives a stable ~12/tower/
   wave unit. If A1.4's power unit stays on score, it needs either a scoring
   function with sub-wave resolution in a 0%-win regime or a much larger n.
3. **A parity-matched step definition.** Declare *which* steps are comparable
   given that `isolatedTowerSites` alternates lanes — or change the site order
   so consecutive steps are like-for-like.
4. **A topology exclusion criterion, declared up front**, alongside the ceiling
   guard: e.g. "exclude any N at which the standing-structure loss rate departs
   from the N-1 arm", which would have caught N=6 before the data was seen
   rather than after.
5. **A floor guard** mirroring the ceiling guard, and a check that `hallHpFrac`
   is not degenerate.
6. **A wider N range and/or a non-blocking anchor.** The site pool holds 12;
   N=7..12 is unrun. A blocking anchor confounds DPS with pathing at every step.

### Next step

**Neither branch of the pre-declared rule is taken.** The SATURATING branch
(proceed to the Muddy Bog anchoring session) is *not* authorised, and the LINEAR
branch (declare A1.4(a) unclearable and escalate as a spec problem) is *not*
authorised either. The next action is a decision only the repo owner can make:
whether to re-run this measurement under a tightened pre-declaration (list
above), or to act on the one finding that *is* established under every reading —
that the A1.4 power unit is ~1 standard error of the instrument meant to measure
it, which is a spec problem independent of the saturation question.

**Nothing was tuned. `shared/balance.js` is untouched. `stats.js`'s `classify()`
is untouched.**

---

## 7. What this measurement does not establish

- **Whether Watchtower value saturates.** The headline gap; see §6.
- **Beyond N=6.** The isolated site pool holds 12; N=7..12 was not run. The
  N=5->6 regime change is direct evidence the curve has structure this sweep has
  only partly mapped.
- **A duration-free damage reading.** `...PerWave` is a partial control only:
  `corr(wavesPlayed, structDmg/wave)` within an arm is 0.48-0.97, so longer
  matches inflate the per-wave rate as well as the total. Residual inflation
  pushes high-N rates up, i.e. *against* the reading-B saturation finding — so
  reading B is conservative on this axis, but the size of its effect is not
  clean.
- **Across footprint classes.** The anchor here is a blocking 1x1 in a pinned
  column; fusions are 2x2 in a different column band. `sitingProtocol:
  'isolated'` holds that still, it does not resolve it.
- **Other defences.** Only `WATCHTOWER` was swept. `defenceCap` works for any
  `defence` type; nothing else was measured.
- **One policy, one roster.** EARTH human + FIRE/WATER/WIND bots, the shipped
  scripted build policy, `fuse: false`, `freeSpecial: false`.
- **Standing-vs-cumulative cap semantics below N=6.** No tower is destroyed in
  any cell at N <= 5, so the distinction only ever bites in the one arm the
  verdict cannot lean on.

### Statistical caveats

- **BH is applied per statistic, not as one pooled family**: three families
  (paired-t 90, sign 90, Welch 60). A row therefore has three chances to clear,
  so any claim resting on whichever statistic happened to pass is weaker than
  its q-value suggests. All three columns are printed for every row rather than
  the best one. Nested comparisons also share arms, so independence/PRDS is not
  guaranteed.
- **The Welch column carries no direction.** `classify` computes `t` on
  `|effect|` (`stats.js:138`), so e.g. maze A 3->4 score shows Welch +0.28
  against a paired mean of -0.042. Read signs off `meanDelta`. Its p also uses
  the pooled df (286) rather than Welch-Satterthwaite; immaterial at n=144 with
  near-equal sd, but it is a Welch statistic with a Student df.
- **Hang imputation is a provable no-op here** (0 hangs, no metric can go
  missing), retained only for comparability with the other drivers.
- **Paired-t normality is violated on the score axis** (6 distinct values,
  44-90% ties), which is why the exact sign test is reported alongside and why
  disagreements are reported rather than resolved.

---

## 8. Reproduction and artifacts

```
node test/harness/watchtowerMarginal.js --caps 0,1,2,3,4,5,6 \
     --out test/harness/watchtower-marginal-2026-08-04.json
```

~95 s for 2016 matches. The run is deterministic: the arm table reproduces
byte-for-byte across runs.

`test/harness/watchtower-marginal-2026-08-04.json` (~1.4 MB) **is committed**,
deliberately breaking with the untracked `.{name}-*.json` scratch convention
used by e.g. `.rocktrap-standalone.json`. Remediation item 3 of the paired-
statistic retrospective is explicit that two of this project's most consequential
runs exist only as prose and that one of them caused a verdict-changing error;
its §6 further records that `probe.js` persists nothing, so the entire
2026-07-25 Phase 8A baseline cannot be re-read at all. **This review is itself a
case in point**: its first-draft LINEAR verdict was overturned by a subrange test
recomputed from this file without re-running a single match. The file carries
every per-cell observation (2016 records: score, waves played, hall HP,
win/loss/hang flags, enemy-seconds, structure damage, per-wave rates, gold
unspent, towers purchased, rebuilds skipped for gold) plus all 90 step and
decline statistics with their BH q-values and MDE80s.

### Acceptance criteria status

| criterion | status |
|---|---|
| Hang gate 0/144 per cell | **0/144 in all 14 arms** (`stalled`/`timedOut`, STALL_TICKS) |
| `npm test` green | 622 pass / 0 fail / 2 skipped, after the matchRunner change and at the end |
| `npm run build` clean | clean |
| Welch t + paired t + exact sign p, hang-imputation, split-half, BH within-file | all reported for all 90 comparisons; imputation is a no-op (0 hangs) |
| per-cell output persisted via `--out` | committed, see above |
| explicit LINEAR / SATURATING / NO VERDICT call | **NO VERDICT** (§6), with what a real verdict would have required |

### Adversarial review

One adversarial reviewer was run against the review, the driver and the
`matchRunner.js` diff, per this project's standing convention. It returned 13
findings, 3 of them verdict-changing; all 3 were independently re-verified
against the per-cell JSON before being accepted, and every finding is folded in
above (the subrange test, the parity confound, the MDE/power analysis, the
`hallHpFrac` degeneracy, the floor census, the N=0 non-neutrality, the
mean/sign discordance flags, the duration-control overstatement, the BH family
description, the Welch |t|/df note, the corrected N=6 mechanism, the split-half
caveat, and a stale driver comment). It confirmed guardrails clean, `defenceCap`
semantically correct (verified `N=0` produces exactly zero Watchtowers in all
288 cells), and reproduced the review's tabulated numbers from the JSON.
