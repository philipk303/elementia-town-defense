# Firepit re-verification — paste this into a new session

Branch `codex/redesign-reconciliation`. Suite 611/609/2 skipped, `npm run
build` clean, as of this handoff.

## Why this session exists

On 2026-07-25 the Firepit falsification test
(`docs/reviews/2026-07-25-firepit-falsification-test.md`) found Firepit
**decisively fails** Amendment A1.4's niche floor (score −0.890 t −9.88 on
maze A, −0.494 t −3.38 on maze B, vs a Watchtower at equal gold, funnel-sited,
144 paired cells per maze) **and** violates the hang gate (1/144 maze A,
7/144 maze B, vs Watchtower's 0/144 on both).

Philip's response, recorded as **Amendment B** in
`docs/superpowers/specs/2026-07-25-combat-structure-redesign.md` (~line
792), was a mechanic change: Firepit moved from a fixed-interval pulse to an
**always-on continuous area field** — every enemy in the footprint (+
`marginPx`) takes `dps` scaled by tick delta, every tick, no interval to miss.
This directly targets the failure's stated cause (phase-alignment misses) and
landed in code.

**Nobody has re-run the falsification test against the new mechanic.**
Firepit's status today is genuinely unknown — it may now clear 1.0 power
unit, or it may still fail; the hang violation may or may not still be
present. This session's only job is to find out.

## Why this is worth doing before anything bigger

This is the cheapest, cleanest open item in the balance backlog:
- Firepit is the ONE structure the spec itself certifies as having **zero
  skill dependency** (no facing, no direction, no target selection, no
  timing) — a harness result for it is trustworthy evidence about the
  structure, not the policy, unlike Rock Trap / Water Geyser / Wind Vortex /
  Grinder / Blizzard (see [[elementia-fusion-roster-sweep]] and
  `docs/reviews/2026-08-02-full-fusion-roster-sweep.md` for why those five
  currently have NO honest verdict at all).
- The test method and harness support already exist — nothing new to build.
- It closes a hard-gate failure that's been sitting open in production for
  over a week.

## What to actually run

This was never committed as a script (same as the original tower baseline) —
it's two `runMatch` option sets over `scenarioMatrix()`. Reuse the ORIGINAL
falsification test's exact method, described in
`docs/reviews/2026-07-25-firepit-falsification-test.md` §1, and reproduce it
here rather than reinventing it:

- Arms: `defence: STRUCTURE_TYPES.WATCHTOWER` vs
  `defence: STRUCTURE_TYPES.FIRE_SPECIAL`, both `spendDown: true`,
  `freeSpecial: false`, `fuse: false` — nothing else competes for gold.
- `spendDown: true` on BOTH arms — a single purchase can't express an
  equal-gold comparison between a 6-gold Watchtower and Firepit (check
  `BALANCE.STRUCTURES.FIRE_SPECIAL.cost` still 8 — confirm it wasn't
  touched by Amendment B before assuming the old cost).
- `matchRunner.js`'s own `defSites` logic already sites a walkable defence
  (Firepit is `WALKABLE_TYPES`) in the funnel and a blocking one (Watchtower)
  on the flank — this is the SAME siting fix the original test needed to add;
  it's already in `runBuildPolicy` (~line 281-299), nothing to build.
- 144 paired cells (72 seeds x 2 posts) per maze, both mazes (A and B),
  scored on `m.score` — win rate was unusable on maze B last time (2/144
  after walkable structures landed) and is very unlikely to have improved;
  expect to lead with score again, same as the original.
- Report hangs per arm per maze explicitly (not just an aggregate) — this is
  the metric that was independently violated (7/144 on B) and needs its own
  clean answer, not folded into the score verdict.
- Apply the same hang-imputation + split-half discipline every sweep in this
  project now carries (see [[elementia-baseline-review-lessons]] memory) —
  `test/harness/stats.js`'s `classify()` plus a worst-case impute-at-cell-min
  pass, same pattern `test/harness/fusionRoster.js` used for the six-fusion
  sweep two sessions ago if you want a ready-made pattern to copy from
  (not a fusion test, but the paired-arms + impute + split-half shape is
  identical).

## What NOT to do

- Don't tune Firepit's numbers regardless of the result. Report the verdict
  (clears A1.4(a) / still fails / hang gate resolved or not) with ranked
  options, same as every prior falsification test in this project — no
  unilateral fix.
- Don't touch Rock Trap / Water Geyser / Wind Vortex / Snare Post in this
  session — they need policy or scenario work first (see the fusion sweep
  review's §5 point 4 for the same class of problem) and are explicitly a
  SEPARATE, larger follow-up, not part of this quick re-verification.
- Don't re-derive the two instrument defects the original test found and
  fixed (flank-vs-funnel siting, pulse-consumed-on-empty-footprint) — both
  are already fixed in current code (the second one is structurally moot now
  that Firepit has no interval at all under Amendment B). If the new result
  looks suspicious, re-verify against the CURRENT mechanic, don't assume the
  old defects are back without checking first.

## Output

A dated review doc under `docs/reviews/`, same format as the original
falsification test — result table (score, t, both mazes), hang counts per
arm per maze, targets/enemy-seconds-held sanity check (Amendment B's own
obligation B3 names `aoeStats.enemySeconds` as the metric that replaces
"targets per activation" for this family — use it, the old per-pulse metric
is meaningless for a continuous field), and a plain verdict: does Firepit now
clear A1.4(a) in its declared scenario (packed lane, funnel-sited) or not.
Ranked recommendations only if it still fails, same pattern as every prior
sweep — no unilateral balance change.

## Context you'll need

- `docs/reviews/2026-07-25-firepit-falsification-test.md` — the original
  test this re-runs, read first, reuse its method exactly.
- `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md` Amendment
  B (~line 792) — the mechanic change under test.
- `test/harness/matchRunner.js` ~line 190-302 (`runBuildPolicy`) — `defence`/
  `spendDown`/`freeSpecial` options and the funnel/tower siting split, already
  built, nothing to add.
- `test/harness/fusionRoster.js` — a recent example of the paired-arms +
  hang-imputation + split-half pattern applied outside `probe.js`, if useful
  as a template (this test doesn't need the fusion-specific parts of it).
- [[elementia-fusion-roster-sweep]] memory — why Rock Trap / Water Geyser /
  Wind Vortex / Grinder / Blizzard are explicitly OUT of scope here.

## Output location note

Keep this to the Firepit question only. If the result is clean, this is a
short session — don't expand scope to the other individual specials without
checking with Philip first, same reasoning as the Task 20 step-1 scope
decision earlier in this program.

**Recommended model: Sonnet 5** — this is a same-shape re-run of an existing,
already-designed test using already-built harness support, not new
instrument design. No Opus escalation expected unless the result itself
raises a genuinely ambiguous question the existing lessons don't answer.
