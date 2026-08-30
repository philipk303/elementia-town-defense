# Session handoff — Balance Harness v2

Date: 2026-08-15. Session spanned 2026-08-14 into 2026-08-15; commits carry both
dates and a few filenames were stamped 08-14 an hour early. Harmless, noted so
nobody hunts for a missing day.

Commits: `93ac4c5`, `29c3a49`, `f7481c6`, `e44a781`, `8cc7512`, `1bd2e9b`,
`f059d8f`. Suite 793 tests, 791 pass, 2 skipped, 0 fail. Build clean.

## Why this session happened

Philip's framing: "we have been spinning wheels and not getting closer to a good
harness for balance testing", plus "can we outsource to Codex to save tokens".

**The token framing was wrong and I said so.** The bottleneck was never compute
or context cost — the sim is headless and a full 2880-run corpus takes 27
seconds. It was that measurements kept being *invalidated*: the siting confound
killed every maze-A number, the unpaired-t bug under-powered every pre-fix
baseline, a later Benjamini-Hochberg pass retired 21 of 55 Welch-significant
cells, and Firestorm's verdict moved three times in one session. Running more
sweeps faster would have produced more invalid numbers faster. Codex was the
right tool for the plumbing, not for the judgement.

## What was built

Verdict on reuse: **build off existing work.** About 40% was load-bearing and
correct, and it was the expensive 40% — `matchRunner.js`'s run loop encodes the
phaseClockMs and single-rng-call-site fixes, stall detection, per-wave records
and combat-stat reconciliation. `stats.js`, `scenarios.js`, `profile.js` kept
too. The failures were never in those.

Four layers, strictly separated. The hard rule is that **analysis never invokes
measurement**: `analyze.mjs` imports nothing from `matchRunner.js`, so analysis
is free and infinitely repeatable while measurement happens once.

| | |
|---|---|
| `test/harness/protocol.js` | `resolveProtocol` freezes, validates, **throws on unknown keys** — including the old vocabulary, so a copy-paste out of an archived driver fails loudly rather than quietly running a different experiment. **The isolated siting protocol is now the default**; legacy lists survive only behind `legacySiting: true` for the pinned tests. |
| `test/harness/bench/record.js` | The run-record contract. Written before dispatching, because the runner and analyser were built independently and a prose schema would have let them drift. `configHash` is a CELL identity; `runId` is a run identity. |
| `test/harness/bench/store.js` | Append-only JSONL, gzip, exact resume, line-numbered validation. |
| `test/harness/bench/run.mjs` | Sweep CLI. Forks child **processes**, not worker threads: `BALANCE` is a module-level mutable singleton, so process isolation is a correctness requirement, not a performance choice. |
| `test/harness/bench/analyze.mjs` | Store-only. No prereg, no verdict. Raw p beside BH-adjusted q, always. |
| `test/harness/prereg/` | Schema + the registered family. |
| `test/harness/archive/` | The 14 retired one-off drivers, kept because published reviews cite them by name. |

Also new: `metrics.placements`, a footprint ledger reading the **actual** tile
span off each placed structure rather than the anchor requested. Every siting
confound in this project came from a 2-wide structure occupying a column its
anchor did not name, and not one was visible in any recorded output.

## The result — read `docs/reviews/2026-08-14-metric-selection-v1-result.md`

Corpus: 2880 runs, engine `1bd2e9b`, clean worktree, committed gzipped at
`test/harness/store/2026-08-14-metric-selection-v1.jsonl.gz`.

**The positive control fired** — the first time in this project's history that an
injected effect of known size was recovered under a pre-registered,
multiplicity-corrected protocol. `hallHpAuc` recovers dose-20 and dose-30 on both
mazes with all four gates. Spec success criterion 3 is met at dose >= 20.

Three findings constrain what may be claimed from it:

1. **`score` is disqualified.** It recovers nothing — not dose-30, a 2.5x
   goblin-HP increase — on either maze at any corrected q.
2. **All 2880 runs lost.** `hallHpFrac` is 0.000 everywhere, so `score` is
   identically `wavesCleared`, an integer with sd 1.1. We pre-registered a worry
   about ceiling censoring and got floor censoring. Confirmed **not** caused by
   the WP3 siting change: legacy siting also loses 285/288 on maze A.
3. **On maze B small doses make the defence better** (score +0.18 at dose-13),
   reversing at dose-20. Every candidate metric scrambles identically, so the
   ladder's monotonicity premise is false, not the metrics. Metric adoption
   therefore FAILS its own pre-registered rule.

Instrument resolution is a ~67% goblin-HP change, not the 8% of the smallest
rung. WP3's isolated siting costs real strength on maze A (7.22 vs 8.16 waves,
8.2 vs 9.1 towers, because the pinned column shrinks the tower site pool) — both
arms of an A/B pay it equally, but say so whenever a v2 number meets a legacy one.

## Lessons worth keeping

**Parallel agents drift at the boundary nobody owns.** Three interface gaps, none
catchable by either agent's own tests, all found only by running the two halves
together: `protocol.maze` vs `mazeName` (which silently downgraded every cell to
EXPLORATORY — a verdict layer quietly declining to issue verdicts), a hand-rolled
fixture that never matched a real record, and gzip supported in the store but not
the analyser. A shared contract file caught less than expected; running the
integration caught everything.

**A fixture that only agrees with itself validates nothing.** WP2's 20 tests
passed against a protocol shape real records never have. Fixed by building the
fixture from `PROTOCOL_DEFAULTS` and pinning it to `resolveProtocol` with a
conformance test, verified red-green. This is the project's recurring failure
reproduced inside the tool built to stop it.

**Codex `exec` needs an authorization header.** `~/.codex/AGENTS.md:99` carries a
check-in-before-large-tasks rule; both agents obeyed it, produced a design, and
exited without touching a file — 82k tokens, zero output. Philip declined editing
the global config (the rule is right for interactive use), so the remedy is
`tools/codex/dispatch.sh`, which prepends the preamble mechanically and prints
the resume command. **Resume a stopped agent, never re-dispatch**: WP2 resumed and
its design survived (it is where the BH-padding rule came from); WP1 was
restarted and its 21k tokens were lost.

## Recommended setup for next session

- **Model: Opus 5.** The next step is a judgement call about measurement regime,
  not implementation, and a wrong call re-invalidates the program. Fable 5 if you
  want maximum reasoning on the maze-B reversal specifically.
- **Subagents: none for the regime fix** — one sequential thread (tune, re-run
  27s, read). Spawn **Sonnet for WP5** in parallel once the regime is settled.
- **Review: on WP5, not on the harness.** The harness was verified by running it
  end to end. A subtly broken second build policy would silently invalidate the
  cross-policy gate protecting every future verdict. Engineer/code reviewer at
  Opus 5.

## Next-session prompt

```
Resume the Elementia balance-harness work. Read these two first, in order:

  C:\dev\Elementia-Town-Defense\docs\reviews\2026-08-14-metric-selection-v1-result.md
  C:\dev\Elementia-Town-Defense\docs\plans\2026-08-14-balance-harness-v2-spec.md

WHERE WE ARE. Balance Harness v2 is built and partially validated. Four layers,
strictly separated: matchRunner (sim) -> append-only JSONL run store -> bench/run.mjs
-> bench/analyze.mjs, which never runs the sim. Pre-registration is mandatory and
enforced; no prereg, no verdict. A 2880-run corpus is committed gzipped and every
number is re-derivable without re-running anything:

  node test/harness/bench/analyze.mjs --store test/harness/store/2026-08-14-metric-selection-v1.jsonl.gz

WHAT THE CORPUS SAID. The positive control fired for the first time in this
project's history: hallHpAuc recovers dose-20 and dose-30 on both mazes with all
four gates. But three things constrain what you may claim:

  1. score is DISQUALIFIED. It recovers nothing, not even a 2.5x goblin-HP
     increase, on either maze at any BH-corrected q. Every balance verdict in
     project history was measured on it.
  2. All 2880 runs LOST. hallHpFrac is 0.000 everywhere, so score is identically
     wavesCleared. Floor censoring, not the ceiling censoring we pre-registered.
  3. On maze B, SMALL DOSES MAKE THE DEFENCE BETTER (score +0.18 at dose-13),
     then reverse at dose-20. Every candidate metric scrambles identically, so
     the dose ladder's monotonicity premise is false, not the metrics.

THE NEXT CONCRETE STEP. Fix the measurement regime before adopting any metric.
A 100%-loss baseline measures "how fast do you lose", and pacing effects are
exactly what let a difficulty increase read as an improvement — finding 3 may be
an artifact of finding 2. Weaken the horde or strengthen the scripted policy
until the control arm wins somewhere in the 30-70% band, re-register
metric-selection-v2, and re-take the corpus. It costs 27 seconds of compute.

Run big sweeps in a throwaway worktree at HEAD:
  git worktree add .worktrees/bench-x HEAD --detach
Otherwise records carry dirty:true and the analyser refuses to pool them.

OPEN DECISIONS.
  - hallHpAuc adoption is provisional, pending the regime fix.
  - The maze-B reversal deserves its own pre-registered question. It is the most
    interesting thing in the data and may be a real game mechanism.
  - WP5 (a second build policy, competent-v1) is unstarted. The rule it enforces:
    no verdict ships unless it holds under both policies, because at least one
    past published verdict was a measurement of the policy, not the game.
  - WP3's isolated siting costs real strength on maze A (7.22 vs 8.16 waves, 8.2
    vs 9.1 towers — the pinned column shrinks the tower site pool). Both arms of
    an A/B pay it equally, but say so whenever a v2 number meets a legacy one.

DO NOT ship any balance change off the existing corpus. It validates the
instrument partially and refutes its own metric-adoption arm.

Dispatch any Codex work through tools/codex/dispatch.sh — a bare `codex exec`
stops to ask for confirmation it can never receive, and burned 82k tokens doing
exactly that this session.

RECOMMENDED SETUP.
  Model: Opus 5. The first step is a judgement call about measurement regime,
  not implementation, and a wrong call re-invalidates the program. Use Fable 5
  instead if you want maximum reasoning on the maze-B reversal specifically.
  Subagents: none for the regime fix — it is one sequential thread (tune, re-run
  27s, read). Once the regime is settled, spawn Sonnet for WP5 in parallel.
  Review: warranted on WP5, not on the harness. The harness was verified by
  running it end to end; a subtly broken second build policy would silently
  invalidate the cross-policy gate that protects every future verdict. Use an
  engineer/code reviewer at Opus 5.
```
