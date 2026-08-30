# The Firepit maze-B soft-lock: root cause and fix — a lane-gap shoulder wedge, not a Firepit bug

**Date:** 2026-08-02
**Closes:** the A4 hang-gate violation left open by `docs/reviews/2026-08-02-firepit-retest.md` §4/§4a
**Handoff executed:** `docs/handoffs/2026-08-02-firepit-hang-and-dps-retune.md` item 1
**Scripts:** `test/harness/firepitHangDiag.js`, `firepitHangScan.js`, `stuckEscapeRate.js` (all new,
none committed as tests — same convention as `probe.js` / `firepitRetest.js`)

**Result: hang gate CLEAN. Firepit maze-B stalls 7/144 → 0/144, and 0/144 on every other
arm/maze cell in the 576-cell matrix. Two defects, both in `server/game/enemies.js`, neither of
them anything to do with Firepit.** Item 2 of the handoff (the DPS retune) is NOT started —
see §7.

---

## 1. What the previous session got wrong

`2026-08-02-firepit-retest.md` §4a reported the stuck enemies sat "at tile (28.1-28.8, 6.0-6.1),
mid-lane, 7-13 tiles from the nearest actual Firepit". That located the bug nowhere near anything,
which is why it concluded "same class as the crowd-jam mechanism, not root-caused".

Reproducing the two named seeds under `runMatch`'s `onEnd` hook and dumping tile coordinates
directly gives a different and much more specific answer. On **both** repro seeds (20260808 wave 5,
20260810 wave 8) the two surviving enemies sit at tiles **(35,7) and (36,7)** — the mouth of maze B's
right-hand lane gap (gaps are 5 and 35), one row above the wall row, three tiles from the Firepits at
(35,10)/(35,11). Not mid-lane, not far from anything: wedged *in the gap itself*.

The §4a coordinates appear to have been read in the wrong units. The rest of that section's
reasoning (same seeds run clean under Watchtower; same tile pair across different seeds; a geometric
fixed point rather than a per-seed coincidence) was correct and was what made this findable.

## 2. Defect 1 — the lane-gap shoulder wedge

`collisionIndex.js` caps enemy collision radius at 14 with the stated guarantee that "a 1-tile
corridor (32 px) always passes any enemy (2×14 = 28 < 32)". True, but a 28px body in a 32px gap has
a **4px lateral window**, and nothing steered a body into it: `chooseStepDir` returns a compass
neighbour, and `tickEnemies` converted that to a pure-axis heading. A marcher that arrived at the gap
off-centre kept its offset, drove straight down, and pressed its shoulder onto the barricade corner
beside the gap. `resolveTilePushout` ejected it back up. It had no attack either — bulldoze only
fires on the tile the descent step chose, and the wall it was touching was the tile *next* to that.

**No move and no attack** is this project's soft-lock signature, the same terminal state as the CP2
off-grid hang and the hall ring. A lone body escapes on its own (the corner push has a lateral
component that slides it clear); the lock needs a second body arriving laterally — its own diagonal
into the gap refused by the corner-cut guard, so it can only step sideways — to hold the first one
on the corner.

**Fix:** steer at the **centre of the tile the field chose**, not along the raw compass axis to it.
That is what "descend to that tile" already meant; the field is tile-resolution and knows nothing
about body radius, so the sub-tile aim is the caller's job — exactly the same division of
responsibility the hall-ring fix established for the last leg to the goal.

Result: **7/144 → 3/144.**

## 3. Defect 2 — the symmetric residue, and why a second steering rule was the wrong answer

The three survivors (seeds 20260834 / 20260845 / 20260866, all postGap 0) are the *same tile* and a
different sub-case. With both bodies now steering at the gap centre, two radius-14 trolls can
converge on a gap that admits one of them. Separation's symmetric half-push holds them 28px apart,
straddling the centre, each wedged on an opposite shoulder, each pulled back toward the middle by
the field. Neither yields; neither has an attack.

Steering cannot break a tie that steering created, and a second steering rule would perturb every
measured baseline in the project. The fix is a **failsafe** instead:

> A body that has held ONE cost-field value, while attacking nothing at all, for `STUCK_ESCAPE_MS`
> bashes whatever wall its body is physically pressed against.

Any real progress changes the body's tile cost; any real engagement sets an attack target. So the
condition fires only on the terminal state itself, and it terminates by construction — the wall has
finite HP, so the jam opens. It closes the whole failure *class*, not one geometry: four different
soft-locks (CP2 off-grid, hall ring, crowd-jam limit cycle, gap wedge) have now produced this same
terminal state, each costing a full session to find, and nothing previously guaranteed there was
not a fifth.

Result: **3/144 → 0/144.**

## 4. The threshold was measured, not picked

A permanent lock lasts forever, so *any* threshold breaks it. The only thing the threshold buys is
how many non-locks get caught with it — and those chewing barricades would be a silent balance
change. `stuckEscapeRate.js` counts locks entered across the full 576-cell matrix:

| threshold | maze A tower | maze A firepit | maze B tower | maze B firepit |
|---|---|---|---|---|
| 10 s | 31/144 runs | 48/144 | 30/144 | 37/144 |
| **30 s (shipped)** | **2/144** | **3/144** | **2/144** | **6/144** |

At 10 s it fires in 21-33% of runs — those are genuine transient jams that would have cleared on
their own. At 30 s it fires in 1.4-4.2%, never more than once in a run, and every permanent lock
still resolves an order of magnitude inside the harness's own 1000 s stall detector. `state.stuckEscapes`
counts locks entered (not swings) so the firing rate stays visible: a failsafe nobody can see the
rate of is indistinguishable from a mechanic quietly carrying the game.

Once armed the body keeps swinging while still locked, gated by its normal attack cooldown, rather
than re-arming a fresh 30 s timer per swing — a 40 HP barricade would otherwise take minutes.

## 5. Balance impact — small, and reported rather than assumed

Both fixes change how the horde flows through a 1-tile gap, so they move numbers. Full
`firepitRetest.js` re-run, before vs after:

| | Watchtower | Firepit | diff | t | hangs (Firepit) |
|---|---|---|---|---|---|
| maze A before | 8.744 | 7.653 | -1.091 | 13.06 | 0/144 |
| **maze A after** | **8.783** | **7.701** | **-1.082** | **12.71** | **0/144** |
| maze B before | 7.382 | 7.409 | +0.027 | 0.17 | **7/144** |
| **maze B after** | **7.354** | **7.313** | **-0.041** | **0.24** | **0/144** |

Split-half agrees on both mazes after the fix (A: -1.090 / -1.074; B: -0.056 / -0.026). The
maze-A verdict is unchanged in size, sign and decisiveness. Maze B's diff moves from +0.027 to
-0.041 — both are non-signals (t 0.17 and 0.24), and with the hangs gone the imputed and raw
figures are now the same number, which is the point of clearing the gate.

Two pinned-literal tests in `matchRunner.test.js` moved and were updated in the fixing commit with
the reason, per those tests' own stated rule:

- `20260872/postGap 1` no longer clears 10/10 (now 8). Swapped to `20260809/postGap 1`, a fresh
  10/10 at hallHpFrac 1.000 — same brute-force seed-swap convention as the six before it.
- Default `20260801/0` `enemySeconds` 1348.1 → 1393.4. Its other three pins (combo, score 8, hallHp
  0) are **unmoved**, so the change is enemies spending marginally longer alive in transit, not a
  different outcome.

## 6. Regression coverage

Two tests added to `test/game/enemies.test.js`, **both verified to fail with their fix reverted** —
which is not a formality here:

- *"a marcher approaching a lane gap centres itself on it"* pins the steering property. An earlier
  draft of this test asserted the wedge itself and **passed with the fix reverted**, because
  wall-corner pushout also nudges a body laterally and the test window was long enough to measure
  that instead. It now starts two rows higher and stops after 10 ticks, so nothing but the heading
  can move the body sideways.
- *"two max-radius bodies converging on the same gap escape via the stuck watchdog"* pins the
  failsafe.

**What is deliberately NOT claimed:** neither test reproduces the field-observed lock. It is not
reproducible from a snapshot — re-instantiating the exact two bodies found stalled in the real match
lets them walk away, because what held them there was the crowd that had since died. The seed-level
evidence is the 0/144 gate, not a unit test.

## 7. What this does NOT close

- **Firepit still fails A1.4(a).** This session fixed a hang, not a balance problem. Maze A remains
  -1.082 (t 12.71) against Watchtower — essentially unchanged. Handoff item 2, the continuous-DPS
  retune of `BALANCE.STRUCTURES.FIRE_SPECIAL` (`shared/balance.js` ~line 231), is **not started**;
  the retest review's ranked options stand as written.
- **The crowd-jam soft-lock** (`elementia-crowd-jam-softlock`, 1/2400) was never separately
  reproduced here. The watchdog should cover it — it is the same terminal state — but that is an
  expectation, not a measurement.
- Rock Trap / Water Geyser / Wind Vortex / Snare Post untouched, per the handoff.

## 8. Verification

- `npm test` — 613 tests, 611 pass, 0 fail, 2 skipped (was 611/609/0/2; +2 new tests).
- `npm run build` — clean.
- `firepitRetest.js --maze both` — 0/144 hangs on all four arm/maze combinations.
- `firepitHangScan.js --maze B` — no stalled cells.
