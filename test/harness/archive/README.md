# Archived harness drivers (retired 2026-08-14)

These are the one-off sweep drivers from Phase 8A through Task 20. They are kept
for provenance — several published reviews cite them by name — and they still
run, but **nothing new should be built on them and their output should not be
compared against Balance Harness v2 output.**

See `docs/plans/2026-08-14-balance-harness-v2-spec.md` for why they were retired.
The short version: each script re-implemented the sweep loop, the statistics and
the reporting inline, so a fix to one never reached the others; and none of them
persisted per-run records, so every question required a full re-measurement on a
subtly different instrument. Replaced by `test/harness/bench/run.mjs` (measure,
once, into an append-only store) and `test/harness/bench/analyze.mjs` (read the
store, as often as you like).

## Still live, deliberately not archived

`matchRunner.js`, `scenarios.js`, `stats.js`, `profile.js` and their tests. The
sim adapter and the statistics primitives were never the problem.

## legacy-results/

The 17 JSON summaries that were sitting untracked and dot-prefixed in
`test/harness/`. They are **aggregated cell summaries, not per-run records** —
no per-cell score arrays exist anywhere in project history, which is exactly the
gap v2's run store closes. They are committed here so the aggregates survive,
but they cannot be re-analysed at run level and cannot be pooled with v2 data.

`watchtower-marginal-2026-08-04.json` is the one such file that was already
tracked; it moved here alongside its driver.
