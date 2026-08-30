# The shipped difficulty ramp, and whether any of it is just the maze

**Date:** 2026-07-25 · **Follows:** `2026-07-25-phase8a-baseline.md` · **Instrument:** unchanged sim, additive instrumentation only

The baseline measured where matches *end*. It could not see the shape of the
match that produced the ending: the score is terminal (`wavesCleared +
hallHpFrac`), so a match that is empty for eight waves and a match that is tense
throughout score identically if they finish the same way. This run measures the
curve, and then asks whether the curve is a property of the game or of the one
maze every 8A number was taken on.

Two runs, each 72 seeds × 2 posts = 144 matches, shipped balance untouched.

## 1. The ramp — maze A (shipped lanes, gx 13/27)

| wave | n | enemy-s | struct lost | downs | hall dmg | closest approach |
|---|---|---|---|---|---|---|
| 1 | 144 | 27 | 0.00 | 0.00 | 0.000 | 472 **DEAD** |
| 2 | 144 | 43 | 0.01 | 0.00 | 0.000 | 485 |
| 3 | 144 | 64 | 0.69 | 0.00 | 0.000 | 475 |
| 4 | 144 | 101 | 0.14 | 0.00 | 0.000 | 471 |
| 5 | 144 | 140 | 0.92 | 0.01 | 0.000 | 362 |
| 6 | 139 | 162 | 1.60 | 0.02 | 0.000 | 330 |
| 7 | 133 | 202 | 1.11 | 0.00 | 0.000 | 385 |
| 8 | 132 | 224 | 0.83 | 0.00 | 0.000 | 412 |
| 9 | 112 | 369 | 2.21 | 0.96 | 0.054 | 309 |
| 10 | 27 | 637 | 2.41 | 1.52 | 0.222 | 133 |

`n` shrinks with wave number: every row is conditional on reaching that wave.
`closest approach` is the mean over runs of the nearest an enemy ever got to the
hall, in px. **DEAD** = not one run in 144 recorded a down, a lost structure or
a point of hall damage.

## 2. The ramp — maze B (flank lanes, gx 5/35)

| wave | n | enemy-s | struct lost | downs | hall dmg | closest approach |
|---|---|---|---|---|---|---|
| 1 | 144 | 31 | 0.00 | 0.00 | 0.000 | 471 **DEAD** |
| 2 | 144 | 48 | 0.63 | 0.00 | 0.000 | 461 |
| 3 | 144 | 65 | 1.06 | 0.00 | 0.000 | 434 |
| 4 | 144 | 80 | 0.90 | 0.00 | 0.000 | 447 |
| 5 | 136 | 121 | 1.58 | 0.01 | 0.000 | 328 |
| 6 | 130 | 143 | 1.54 | 0.05 | 0.005 | 273 |
| 7 | 130 | 154 | 1.38 | 0.01 | 0.000 | 379 |
| 8 | 124 | 190 | 0.66 | 0.04 | 0.000 | 408 |
| 9 | 91 | 326 | 2.37 | 0.84 | 0.073 | 272 |
| 10 | 18 | 676 | 2.28 | 1.33 | 0.371 | 119 |

## 3. What replicates across both mazes

1. **The hall is never in danger before wave 9.** Hall damage is 0.000 for eight
   waves on both layouts (one 0.005 cell on B). The one quantity the score is
   built from carries *no information at all* about the first 80% of the match.
2. **Nobody goes down before wave 9.** Downs are ≤0.05 through wave 8 on both,
   then 0.84–0.96 at wave 9 and 1.33–1.52 at wave 10.
3. **The tension curve is non-monotonic in the same place on both mazes.**
   Closest approach falls through waves 5–6 (A: 362→330, B: 328→273) and then
   **rises again at waves 7–8** (A: 385→412, B: 379→408). Waves 7 and 8 are
   *less* threatening than waves 5 and 6, on two independent layouts. That is a
   property of the `WAVES` beat sheet, not of a maze — and it matches the known
   shape of the count curve (8, 13, 16, 22, 21, 26, 35, 37, 53, 78 — wave 5
   *dips below* wave 4, and wave 8 is +2 over wave 7).
4. **The difficulty is a cliff, not a ramp.** Everything happens between waves 9
   and 10: enemy-seconds nearly doubles, downs appear, hall damage appears, and
   `n` collapses (A: 112→27, B: 91→18).

**Reading:** the game has one wave of content spread over ten waves of
scheduling. Waves 1–8 are a queue; wave 9 is the game. This is not a tuning
nudge — the beat sheet delivers 131 of its 309 enemies (42%) in the last two
waves, and `GATE_OPEN_WAVE` holds the third lane shut until wave 7.

## 4. What maze B changes

| | maze A | maze B |
|---|---|---|
| score | 9.018 ± 1.273 | 8.714 ± 1.483 |
| win rate | 21% | 15% |
| enemy-seconds | 2072 | 1860 |
| **hangs** | **13/144 (9%)** | **26/144 (18%)** |

Flank lanes are harder and, more importantly, **double the soft-lock rate**.
18% of matches on maze B never resolve. Whatever the hall-ring / bot-leash
mechanism is, lane position drives it hard — a fact no single-maze measurement
could have produced.

## 5. Does the instrument still calibrate on a new layout?

`ENEMY.BASE.0.hp` swept 20 / 40 / 80 on maze B (shipped value is 12):

```
20 | score 8.444 +/- 0.975 | win 1% | hangs 63/144
40 | score 7.538 +/- 1.366 | win 1% | hangs 52/144
80 | score 5.284 +/- 2.190 | win 0% | hangs 28/144

score  effect 3.160 | se 0.230 | t 13.72 | rho -1.00   MONOTONIC
hang sensitivity (imputed at cell min): effect 2.097 | t 8.81 | rho -1.00
split-half rank agreement: rho 1.00
```

Calibration passes on maze B, more strongly than on maze A (t 13.72 vs 5.84).
The instrument measures the game, not the layout.

**But note the hang rate moves the other way from the dial:** 63 → 52 → 28 as
goblin HP rises. Tougher goblins break the wall and the lock does not form. This
is the non-random exclusion the baseline flagged, and it is larger here than
anywhere in the baseline — a third of all cells on this sweep. The effect
survives worst-case imputation (t 8.81), so the *conclusion* stands, but any
maze-B result whose hang rate varies with the dial needs the imputation check
before it is believed.

## 6. What this does not say

- Nothing here is a claim about a **dial**. Sections 1, 2 and 4 are single-value
  runs; the probe now refuses to print a sweep verdict for them.
- The scripted human is a stationary turret with a fixed shopping list. A dead
  early game is *worse* for a real player, not better — skill widens the dead
  zone rather than filling it, because there is nothing there to be skilful at.
- Per-wave means are conditional on reaching the wave. Wave 10's row describes
  the 27 (A) and 18 (B) runs that got there, which are the *easiest* seeds.
- Maze B varies lane **position** only. Lane count, wall row and hall position
  are unchanged, so this is one step of external validity, not a general claim.

## 7. Recommended next measurements

1. **Reshape the `WAVES` count curve** and re-run both ramps. The 7–8 tension
   rebound and the 9→10 cliff are now measurable, so the fix is falsifiable —
   which it was not before this run.
2. **Attack the soft-lock before any balance sweep on maze B.** 18% unresolved
   is too high to sweep against, and it is dial-correlated.
3. Gate timing (open gate 2 earlier) is the largest single measured factor and
   is untested against the ramp.
