# Firepit re-verification against Amendment B — the continuous-DPS field did not fix A1.4

**Date:** 2026-08-02
**Re-runs:** `docs/reviews/2026-07-25-firepit-falsification-test.md` (2026-07-25 falsification)
**Change under test:** Amendment B, `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md` (~line 792) —
Firepit moved from a fixed-interval pulse to an always-on continuous area field.
**Script:** `test/harness/firepitRetest.js` (new, not committed as a test — same convention as `probe.js`/`fusionRoster.js`)

**Result: MIXED, and worse than expected. Firepit still decisively FAILS A1.4(a) on maze A — by a
WIDER margin than the original pulsed mechanic. On maze B the score gap has closed to NO SIGNAL, but
the A4 hang-gate violation (7/144) is completely unchanged.** Amendment B did not close the finding
that prompted it.

---

## 1. What was measured

Reused the original test's exact method (`docs/reviews/2026-07-25-firepit-falsification-test.md` §1),
reproduced as a script rather than ad-hoc runs this time:

- Arms: `defence: WATCHTOWER` vs `defence: FIRE_SPECIAL`, both `spendDown: true`,
  `freeSpecial: false`, `fuse: false`.
- Firepit cost confirmed still 8 (`BALANCE.STRUCTURES.FIRE_SPECIAL.cost`), Watchtower still 6 —
  Amendment B did not touch pricing.
- 144 paired cells (72 seeds x 2 posts) per maze, both mazes, scored on `m.score`.
- Hang-imputation (worst-case, at-cell-min) + split-half discipline applied per
  `docs/reviews/...baseline-review-lessons` convention, same shape `fusionRoster.js` used.

## 2. Results

| | Watchtower | Firepit | diff | t | better/worse/tied | hangs (Firepit) |
|---|---|---|---|---|---|---|
| maze A | 8.744 | 7.653 | **-1.091** | **13.06** | 5 / 106 / 33 | 0/144 |
| maze B | 7.382 | 7.409 | **+0.027** | 0.17 | 41 / 51 / 45 | **7/144** |

Split-half: maze A agrees (half1 -1.039, half2 -1.144, same sign, both decisive) — maze A's verdict
is solid. Maze B does **not** replicate (half1 -0.018, half2 +0.069, sign flips) — its near-zero
diff is exactly what a genuinely flat effect looks like under this instrument, not a fluke pointing
either direction.

Imputed maze B diff (worst-case, hangs scored at their arm's observed min): -0.139, t 0.82 — still
below the t>2 signal threshold. The hang gate doesn't change this verdict, it just makes the true
number slightly worse than the excluded-hangs number, as expected.

`aoeStats.enemySeconds` (Amendment B's own obligation B3 metric, replacing "targets per pulse" now
that there's no pulse) confirms the area effect is genuinely working: averaging `enemySeconds /
(activeTicks * 0.05s)` gives **~1.40 enemies held concurrently whenever the field is active**, on
both mazes — comparable to the original pulsed mechanic's 1.30 targets/pulse. The area premise was
never the problem, on either version of the mechanic.

## 3. Why maze A got WORSE, not better

This is the surprising part, and worth being honest about rather than filing it as an ambiguous
non-improvement. The original pulsed Firepit did ~11 dps *while occupied* (1.30 targets x 6 dmg per
700ms) but only intermittently, phase-dependent on the pulse timer. The continuous field always
applies `dps: 9` per BALANCE.STRUCTURES.FIRE_SPECIAL, scaled by held-count and tick delta — it never
misses a tick, but its **per-tick rate (9 dps flat, split across however many bodies are in the
footprint) is lower than the old pulse's burst rate when only 1-2 targets are present**, which is the
common case in a footprint covering ~1/9 the Watchtower's area. Amendment B fixed the "misses phase
alignment" defect the original test diagnosed, but the field's base DPS was tuned against pulse-burst
math, not continuous math, and continuous delivery of a modest DPS number is worse in aggregate than
an intermittent burst of a higher one when the footprint is this small. The structural problem named
in the original test (§4: ~1/9 the Watchtower's area, and 8 gold vs 6) is untouched by this change
and now compounds with a DPS number that wasn't re-tuned for the new delivery model.

## 4. The hang gate is still violated, identically

A4 requires 0/144 on both mazes. Firepit still hangs 7/144 on maze B — the exact count from the
original test, unchanged by Amendment B. The mechanism was never diagnosed in the original test
either (§5: "2-3 living enemies inert at wave 8... NOT diagnosed"), and this re-run doesn't change
that: whatever produces the soft-lock is not touched by the pulse-to-continuous mechanic swap. This
alone is a shipping blocker independent of the score verdict on either maze.

## 4a. Hang-gate diagnostic (quick pass, not a full root-cause)

Reproduced 3 of the 7 maze-B hangs directly (`runMatch`'s `onEnd` hook, same diagnostic pattern the
hall-ring and crowd-jam soft-locks used — see `elementia-hall-ring-softlock` /
`elementia-crowd-jam-softlock` memories). Findings:

- **Not caused by proximity to a Firepit.** In every reproduced case the 2 living enemies are stuck
  at tile **(28.1-28.8, 6.0-6.1)** — mid-lane, well above the wall row (8), and 7-13 tiles from the
  nearest actual Firepit (the funnel/flank ones sit at gx 5 and 35). No Firepit's footprint+margin
  reaches that tile.
- **The exact same tile pair recurs across different seeds** (20260808 and 20260810 both stall at
  essentially identical coordinates, different waves — 4 and 7 respectively). That is a geometric
  fixed point of this maze/build-policy combination, not a per-seed coincidence.
- **Confirmed Firepit-specific**: re-running the same three seeds with `defence: WATCHTOWER` instead
  produces zero stalls (all clear to wave 6-8). Something about the SET of structures the Firepit arm
  places (many walkable structures stacked in both lanes' funnel + flank rows) reshapes the flow
  field enough to jam traffic at the dead-center point between the two gaps — a location neither arm's
  build touches directly.

This looks like the **same class of mechanism as [[elementia-crowd-jam-softlock]]** (flow-field
attraction vs. crowd-separation limit cycle at a wall-adjacent tile), not a new one — but it is
happening at **7/144 (4.9%)** here versus that bug's previously measured **1/2400 (0.04%)** baseline
rate. Whatever the Firepit arm's structure placement changes about the flow field is making a rare
mechanism common. This was NOT chased to a full root cause in this pass — per this project's own
lesson ("guessing at a soft-lock mechanism costs a session," recorded when crowd-jam was first found),
a proper fix needs its own dedicated session, not a bolt-on to this measurement pass. Recorded here so
that session starts from "same mechanism, why does Firepit's siting amplify it 100x" rather than from
zero.

## 5. Verdict against A1.4(a)

**Firepit does not clear A1.4(a).** Maze A fails more decisively than before Amendment B. Maze B has
moved from a decisive fail to a genuine non-replicating null — that maze no longer supports calling
Firepit a loser, but it does not support calling it a winner either, and the hang gate on that same
maze is untouched. Per A5 step 2, this remains a stop-and-revise point, not something to tune past.

## 6. Options, for Philip to rule on

Ranked by preference, none decided:

1. **Re-tune the continuous field's DPS against continuous math, not the old pulse-burst math.**
   The area premise works (~1.40 held); the rate per body is what's under-delivering relative to a
   Watchtower's flat, unwasted 10 dps over a 9x larger area. This is the same lever option 1/3 in the
   original test named, now correctly scoped to "the number was never re-derived for the new
   delivery model" rather than "raise damage and hope."
2. **Enlarge the footprint**, as the original test's option 1 proposed — still unaddressed by
   Amendment B, and the area-vs-Watchtower gap is the structural cause §4 named and this re-run
   confirms is still present.
3. **Cut Firepit's cost below Watchtower's**, as originally proposed — also untouched.
4. **Diagnose and fix the maze-B hang gate** — mandatory regardless of which balance lever is chosen;
   a structure that reintroduces soft-locks does not ship at any power level. Not started in either
   test.

## 7. What is NOT claimed

- This does not say Amendment B was the wrong fix in kind — it correctly closed the "misses phase
  alignment" defect the original test diagnosed and the area effect is confirmed genuinely working
  (~1.40 held both mazes). It says the DPS number carried over unchanged from the pulsed model,
  and that alone is not enough to clear A1.4(a).
- Win-rate is not reported — same instrument limitation the original test noted (unusable on maze B).
  All claims above are on score, same as the original.
- No fusion is involved in either arm, same as the original test.
- Rock Trap / Water Geyser / Wind Vortex / Snare Post remain untouched and out of scope for this
  session, per the handoff.
