# The hall-ring soft-lock: root cause, fix, and what it cost in difficulty

**Date:** 2026-07-25 · **Follows:** `2026-07-25-difficulty-ramp-and-maze-b.md` · **Change:** one steering branch in `server/game/enemies.js`

The ramp review closed with two candidate next steps. The soft-lock was chosen
over the `WAVES` reshape for one reason: 18% of maze-B runs never resolved, the
hang rate moved *with* the dial on every sweep, and the reshape's own predicted
side effect (more enemies, earlier gates, more leak paths) is *more hangs*. Any
reshape measured on that substrate would have come back with an imputation
asterisk, and a hang-rate change would have been indistinguishable from a
difficulty change. Fix the substrate first.

## 1. Root cause

`CostField.setHall` seeds the tiles ringing the hall footprint at
`WALL_ENTRY_COST[BAND_NONE]`, which is **0** (`costField.js:107`). `chooseStepDir`
requires a **strictly** lower-cost neighbour (`enemyMove.js:44`). Nothing is
lower than 0, so **every ring tile is a terminal local minimum** and the descent
correctly reports "no step left". (That is 12 tiles in general and **8** for the
shipped hall, whose footprint sits on the bottom map edge so `setHall`'s outer
row falls out of bounds. Both numbers are correct for their hall; measure with
`CONFIG.HALL`, not the mid-map hall the unit-test helper uses.)

Adversarial review established the stronger form of this: the ring seeds are the
**only** terminal minima anywhere on the field. Every edge weight is ≥ 1 and the
corner-cut guard is symmetric between expansion and descent, so every non-seed
tile's Dijkstra predecessor is a strictly-lower legal neighbour. Confirmed
empirically — a histogram of the tile cost at every `k === -1` over 120,798
enemy-ticks is **100% cost 0**.

That part is by construction — it is where the field is *supposed* to end. The
defect is what the enemy did next. In the non-chase march branch, `k === -1`
left `dirX = dirY = 0`. So an enemy that entered a ring tile **at its far edge**
— which is exactly how a marching enemy arrives — stopped 20–45 px from the hall
AABB, while `attackHall` needs `MELEE_RANGE_PX (6) + radius (9…14)` = 15–20 px.

**No move and no attack. Permanently inert, with the wave held open behind it.**

The field is tile-resolution; the last sub-tile leg to the goal was nobody's job.

Two things had hidden this for eight phases:

- **A crowd supplies the missing 15 px.** `resolveCircles` separation shoves
  bodies off the plateau into melee reach. The hall has only ever been damaged
  by crowd pressure, never by an enemy walking up to it. Lone stragglers — 1 to
  4 enemies, late in a chewed maze — have no crowd, and lock.
- **The comment above `clampToArena` asserted the opposite invariant** (every
  in-bounds non-hall tile has a strictly-lower neighbour). It is false for the 8
  seed tiles, and it is the reason the CP2 out-of-bounds soft-lock fix was
  believed to be complete. Corrected in place.

### The evidence, not the reasoning

A diagnostic ran the maze-B matrix and dumped live state at every stall. In
**6 of 6** stalled runs, **every living enemy**:

- was on a ring tile (`cost = 0`), `chooseStepDir = -1`, `aggro = march`
- sat 20–45 px from the hall AABB against a 15–20 px melee need
- moved **exactly 0.00 px over 400 further ticks**

Stall waves were 5, 8, 8, 9, 9, 9 — confirming the earlier finding that this is
not wave-9-specific. Bots were 350–550 px away in every case; the known bot-leash
freeze is why nobody comes to clean up, **not** what forms the lock.

## 2. The fix

One branch. When the field has no step left and the enemy is not already in
melee range, steer at the nearest point on the hall AABB. Pushout still runs
immediately afterward, so seeking cannot carry a body into the hall or through a
wall — the enemy presses against the hall and attacks it, which is what a player
would expect to see. It doubles as the general failsafe for any `k === -1` the
CP2 clamp did not anticipate: walking at the goal beats standing still.

**The bot-leash bug was NOT bundled**, per the standing ruling. The per-bug
experiment it called for is the diagnostic above, and it returned a clean answer:
the leash is not part of this mechanism, and fixing the ring alone takes hangs to
zero. The leash remains open as a bot-quality issue, now measurable on its own.

## 3. What it did to the hang rate

| | maze A | maze B |
|---|---|---|
| hangs before | 13/144 (9%) | 26/144 (18%) |
| hangs after | **0/144** | **0/144** |

288 of 288 matches resolve, on two independent layouts.

## 4. What it cost in difficulty — measured paired, not as two aggregates

The aggregate drop confounds two different things: formerly-hung runs now
resolving (badly), and real runs genuinely getting harder. Separating them
required a paired comparison against a pre-fix worktree, restricted to cells that
hung in **neither** build.

| | maze A | maze B |
|---|---|---|
| paired Δ score, never-hung cells | −0.2483 (sd 0.614, **t −4.63**, n=131) | −0.3831 (sd 0.764, **t −5.45**, n=118) |
| cells changed at all | 28 of 131 | 34 of 118 |
| …of which **improved** | **0** | **0** |
| wins among those cells | 27 → 16 | 18 → 7 |
| formerly-hung cells, resolved | 13/13 lost (scored 8.788 as hangs → 7.846) | 26/26 lost (8.231 → 7.231) |

**The strictly one-directional change is the confirmation that matters.** Not one
cell in 249 got easier. That is the signature of removing a mechanism that was
making enemies harmless, and nothing else.

The plateau is **not** rare: adversarial re-instrumentation of the pre-fix build
found an enemy inert for ≥100 ticks in 123 of 131 clean maze-A cells (94%) and
113 of 118 maze-B cells. It fired in almost every run and **changed the outcome**
in ~22% — elsewhere the stranded enemies were killed anyway, or the result did
not hinge on them. (An earlier draft of this section said the plateau "mattered
in only ~22% of runs"; that was wrong, and wrong in the direction that
under-sells the bug.)

### Aggregate — like-for-like, on the same cells

The obvious aggregate comparison is invalid and was caught at review: `probe.js`
**excludes hangs from the pre-fix mean** but the post-fix mean has no hangs to
exclude, so the naive delta silently changes denominator (131/118 → 144). Both
columns below are restricted to the cells that were live in **both** builds.

| | maze A | maze B |
|---|---|---|
| score (n=131 / n=118) | 9.018 → **8.770** (−0.248) | 8.714 → **8.331** (−0.383) |
| win rate (same cells) | 20.6% → **12.2%** | 15.3% → **5.9%** |
| hangs (all 144 cells) | 13/144 → 0/144 | 26/144 → 0/144 |

For the record, the invalid figures are `9.018 → 8.687` and `8.714 → 8.132`,
`21% → 11%` and `15% → 5%`. They **overstate the score drop by 33% (A) and 52%
(B)**, because the 39 formerly-hung cells enter the post-fix mean as the losses
they always were. Do not quote them against the published baseline tables.

**This is still a difficulty increase shipped by a bug fix, and it should be read
as one.** Under the standing ruling (keep the game HARD in sim; the scripted
human is a stationary turret, so the win rate is a FLOOR) 12.2% and 5.9% are
acceptable and must not be tuned back up against this proxy. But maze B at 5.9%
is thin enough that **win rate is no longer a usable readout there** — score,
which has healthy spread (±1.52), is the metric to sweep on.

## 5. The ramp, post-fix

Maze A (compare against §1 of the ramp review):

| wave | n | enemy-s | struct | downs | hallDmg | closest |
|---|---|---|---|---|---|---|
| 1 | 144 | 27 | 0.00 | 0.00 | 0.000 | 472 **DEAD** |
| 2 | 144 | 43 | 0.01 | 0.00 | 0.000 | 485 |
| 3 | 144 | 64 | 0.69 | 0.00 | 0.000 | 475 |
| 4 | 144 | 101 | 0.14 | 0.00 | 0.000 | 471 |
| 5 | 144 | 140 | 0.92 | 0.01 | 0.000 | 362 |
| 6 | 139 | 162 | 1.60 | 0.02 | 0.002 | 328 |
| 7 | 132 | 202 | 1.11 | 0.00 | 0.001 | 385 |
| 8 | 131 | 223 | 0.85 | 0.00 | 0.000 | 412 |
| 9 | 101 | 340 | 2.18 | 0.76 | 0.050 | 336 |
| 10 | 16 | 543 | 2.63 | 0.88 | 0.223 | 162 |

Maze B:

| wave | n | enemy-s | struct | downs | hallDmg | closest |
|---|---|---|---|---|---|---|
| 1 | 144 | 31 | 0.00 | 0.00 | 0.000 | 471 **DEAD** |
| 2 | 144 | 48 | 0.63 | 0.00 | 0.000 | 461 |
| 3 | 144 | 65 | 1.06 | 0.00 | 0.000 | 434 |
| 4 | 144 | 80 | 0.90 | 0.00 | 0.000 | 447 |
| 5 | 136 | 121 | 1.58 | 0.01 | 0.002 | 326 |
| 6 | 128 | 141 | 1.51 | 0.02 | 0.007 | 271 |
| 7 | 126 | 154 | 1.36 | 0.01 | 0.000 | 381 |
| 8 | 121 | 190 | 0.69 | 0.04 | 0.004 | 408 |
| 9 | 71 | 267 | 2.30 | 0.42 | 0.070 | 323 |
| 10 | 7 | 404 | 3.00 | 0.71 | 0.134 | 228 |

**Every ramp finding survives.** Eight dead waves. Hall damage still effectively
zero before wave 9 (the new 0.001–0.007 cells at waves 5–8 are the fix letting
stragglers land a hit, and are negligible). The tension rebound at waves 7–8 is
unchanged on both mazes. The 9→10 cliff is **steeper**, not gentler: `n` at wave
9 falls 112→101 (A) and 91→71 (B).

The soft-lock was never the ramp problem. It was the reason the ramp could not be
measured cleanly. That substrate is now clean.

## 6. Instrument changes, and one lesson

- `runMatch` gained an optional `onEnd(state, m)` diagnostic hook, called after
  the loop returns. It cannot affect a measurement; it exists so a soft-lock
  investigation can inspect live state instead of duplicating the run loop.
- **Two instrument tests used the live bug as their fixture** and went red the
  moment it was fixed. `an unfinished wave is flushed and flagged` re-anchored to
  the same seed, which now *loses* at wave 9 and exercises the same flush path.
  `a genuine stall is detected` was rebuilt on a **synthetic** stall (immortal +
  immobile horde via the live balance surface, try/finally restore) — a detector
  test must not depend on a defect existing.
- Added `the seeds that used to hang now resolve`, which spot-checks three
  formerly-hanging scenarios on both mazes in `npm test`, so a regression is
  caught in 2 seconds instead of a 10-minute probe run.

**Lesson worth carrying:** a test whose fixture is a live defect stops being a
test the moment the defect is fixed, and it fails *as though the fix were wrong*.
Both of these read as "the fix broke the instrument". Neither did.

Suite: **320 tests, 318 pass, 0 fail, 2 skipped** (the 2 skips pre-date this work).

## 7. Adversarial review

Mandatory pre-gate review, run independently against its own worktrees and its
own instrumented builds. It reproduced every headline number exactly, found the
denominator error corrected in §4, and produced three pieces of evidence
*stronger* than the ones this fix was originally justified on:

- **The lock is not merely moved.** `resolveTilePushout` leaves a body at exactly
  `radius` from a solid AABB and `attackHall` triggers at `radius + 6`, so
  seeking converges into melee range *by construction*. Across 288 matches the
  maximum consecutive zero-displacement run for any seeking enemy was **0 ticks**.
  A purpose-built ring stress (12 ring tiles × 3 types × elite × 4 wall
  geometries, lone enemy at each tile's far corner, including a fully-walled
  hall) goes **24/288 → 288/288**.
- **The fix did not just make runs die before a lock could form** — the most
  dangerous alternative explanation, since locks formed at waves 5–9 and the game
  got harder. Refuted: all **39** formerly-hung cells terminate at the *identical
  wave with identical `wavesCleared`*, with `hallHpFrac` going 0.942→0.000 (A)
  and 1.000→0.000 (B). Same point in the run; it resolves instead of freezing.
  All 144 post-fix cells still reach the hang-forming waves.
- **Zero improving cells is a real signature, not a broken comparison.**
  `state.rng` has exactly one consumer (`tick.js:19`, the wave-start schedule),
  keyed on wave number, so enemy positions never perturb the RNG stream and there
  is no chaotic re-seeding to scramble a paired comparison. And 28/28 (A) and
  33/34 (B) of the score-changed cells provably contained a pre-fix inert enemy.

Verdicts: root cause **CONFIRMED**; fix eliminates rather than masks the
soft-lock **CONFIRMED**; difficulty change real **CONFIRMED for the paired
analysis**, with the aggregate table **PARTIALLY OVER-READ** — corrected in §4.

**Residual risk it flagged, accepted without new code:** the fix converts
*provably* inert into *empirically* not inert. `hallSeekDir` guarantees a
non-zero desired direction; arrival is guaranteed by pushout geometry, with no
assertion or watchdog. Three enemies across 288 matches entered the branch and
never reached melee range within their run — none frozen, so no lock. A future
change to the hall footprint or wall geometry could reintroduce a non-arriving
state that only the harness stall detector would catch. Adding a watchdog now
would be speculative; the ring stress and the `seeds that used to hang` test are
the regression guards.

## 8. What this does not say

- Nothing here is a claim about a **dial**. Both matrices are single-value runs.
- The paired comparison is against `HEAD` (`944ea63`) only. It isolates this
  change, not the accumulated difference from any earlier baseline.
- ~78% of cells had their outcome unaffected, so this fix does not explain most
  of the variance in the matrix — it removes an exclusion, not a noise source.
- The bot-leash freeze (`bots.js` Engage branch emits no steer past
  `ENGAGE_LEASH_PX`) is **untouched and still live**. It did not cause the lock,
  but it is why three bots stood 350–550 px away while the hall was besieged.
- Maze B's win rate (5%) is now too low to read. Sweep on score.
