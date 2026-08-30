# Firepit follow-up — paste this into a new session

Branch `codex/redesign-reconciliation`. Suite 611/609/2 skipped, `npm run
build` clean, as of this handoff.

## Context

The 2026-08-02 Firepit re-verification (`docs/reviews/2026-08-02-firepit-retest.md`)
found Amendment B (pulsed -> continuous-DPS area field) did NOT close the
2026-07-25 A1.4 falsification: Firepit fails maze A even more decisively than
before (-1.091, t 13.06), maze B is now a non-replicating null (+0.027, t
0.17), and the A4 hang gate on maze B is unchanged (7/144, identical count to
the original test). Two open items came out of that session, in priority
order:

## 1. Diagnose and fix the maze-B hang (do this first — it's a shipping blocker)

`docs/reviews/2026-08-02-firepit-retest.md` §4a has the diagnostic already
done: the 7/144 stalls are NOT proximity to a Firepit (stuck enemies sit at
tile ~(28, 6), 7-13 tiles from the nearest Firepit) and the SAME seeds run
clean under Watchtower. This is very likely the SAME mechanism as
`elementia-crowd-jam-softlock` (flow-field attraction vs. crowd-separation
limit cycle), just amplified ~100x (7/144 = 4.9% here vs. its 1/2400 = 0.04%
baseline) by whatever the Firepit arm's stacked walkable structures (funnel +
flank rows, both lanes) do to the flow field.

Do NOT re-derive the reproduction — reuse it:
- `runMatch({ seed: 20260808, maze: resolveMaze('B'), postGap: 0, fuse: false,
  freeSpecial: false, spendDown: true, defence: STRUCTURE_TYPES.FIRE_SPECIAL })`
  stalls at wave 4/5. Seed 20260810 stalls at wave 7/8. Both reproduce the
  same tile pair.
- Use `runMatch`'s `onEnd(state, m)` hook to inspect live state at the stall
  point — same pattern the hall-ring and crowd-jam investigations used.
- Confirm whether the mechanism is truly identical to crowd-jam (a genuine
  limit cycle: `livingEnemyCount` constant while positions still move) or a
  distinct fourth mechanism before assuming which fix applies.
- The fix, once diagnosed, should not reintroduce the hall-ring regression —
  check against that fix's own test coverage if one exists.

## 2. Re-tune Firepit's continuous DPS (do this after, or independently — it's a balance call, not diagnosis)

Amendment B's area effect is confirmed working (`aoeStats.enemySeconds` shows
~1.40 enemies held concurrently while active, both mazes — comparable to the
old pulsed mechanic's 1.30 targets/pulse). The area premise was never the
problem. What's under-tuned is the flat `dps: 9` in
`BALANCE.STRUCTURES.FIRE_SPECIAL` (`shared/balance.js` ~line 231) — it was
carried over unchanged from numbers tuned against the OLD pulse-burst
delivery, and a flat rate split continuously across ~1.4 bodies in a
footprint ~1/9 the Watchtower's area underperforms the old intermittent burst
in aggregate (see §3 of the retest review for the full argument).

- Re-tune `dps` (and re-check `burn.dps`/`burn.ms` if raising the base rate
  makes burn stacking disproportionate) with continuous-delivery math, not a
  guess-and-check bump.
- Re-measure with `test/harness/firepitRetest.js` (already built, same method
  both prior tests used — `node test/harness/firepitRetest.js --maze both`)
  after any change. Don't hand-wave a fix as working without re-running it.
- Maze A needs roughly a full score point of improvement to clear A1.4(a)
  (Watchtower 8.744 vs Firepit 7.653) — that's the bar, not "moves in the
  right direction".
- Cost (8 vs Watchtower's 6) and footprint size are the two other levers
  named in the review's ranked options if a DPS retune alone can't close
  maze A's gap — try DPS first since it's the most surgical given the area
  premise is confirmed fine, but don't force it if the numbers don't want to
  cooperate.

## What NOT to do

- Don't touch Rock Trap / Water Geyser / Wind Vortex / Snare Post — still a
  separate, larger follow-up (policy/scenario work needed first, see the
  fusion roster sweep review).
- Don't ship a DPS retune without the hang gate also resolved — a structure
  that reintroduces soft-locks doesn't ship at any power level, regardless of
  how the score numbers look.
- Don't guess at the hang mechanism without reproducing it first — this
  project's history is that guessing here costs a session; the repro steps
  above are already known-good.

## Output

Two candidate outputs, not necessarily one session:
- A dated review/fix doc for the hang mechanism (root cause + fix + hang
  count before/after, same format as `2026-07-25-hall-ring-softlock-fix.md`).
- A dated review doc for the DPS retune (old vs new numbers, re-run of
  `firepitRetest.js`, verdict against A1.4(a) on both mazes).

## Context you'll need

- `docs/reviews/2026-08-02-firepit-retest.md` — full retest result and the
  hang diagnostic (§4a), read first.
- `docs/reviews/2026-07-25-firepit-falsification-test.md` — original
  falsification test.
- `test/harness/firepitRetest.js` — the measurement script, reuse it.
- `elementia-crowd-jam-softlock` memory — the prior instance of the likely
  same hang mechanism, and `elementia-hall-ring-softlock` for the fix pattern
  and the regression it must not reintroduce.
- `shared/balance.js` ~line 231 — `FIRE_SPECIAL` dps/burn numbers.

**Recommended model: Opus 5** for the hang diagnosis (root-causing a
limit-cycle mechanism is exactly the class of task that's cost a full session
each of the three times this project has done it before). Sonnet 5 is fine
for the DPS retune once the target math is decided — it's re-running an
existing instrument against a chosen number, not open-ended investigation.
