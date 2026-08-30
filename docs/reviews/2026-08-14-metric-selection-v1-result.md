# metric-selection-v1 — result

Date: 2026-08-14. Corpus: 2880 runs, engine `1bd2e9b`, clean tree, taken in an
isolated worktree so no uncommitted work could contaminate the records.
Store: `test/harness/store/2026-08-14-metric-selection-v1.jsonl.gz` (committed).
Pre-registration: `test/harness/prereg/metric-selection-v1.json`.

Reproduce any number below without re-running anything:

```bash
node test/harness/bench/analyze.mjs --store test/harness/store/2026-08-14-metric-selection-v1.jsonl.gz
```

## Headline

**Output (1), instrument validation: PARTIAL PASS.** `hallHpAuc` recovers
dose-20 and dose-30 on **both** mazes with all four gates passing. This is the
first time this project has recovered an injected effect of known size under a
pre-registered, multiplicity-corrected protocol. Spec success criterion 3 is met
— at dose ≥ 20 only.

**Output (2), metric adoption: FAIL.** The pre-registration required Spearman
rho = 1.0 across the dose ladder. On maze A three metrics are monotone. On maze
B **none are**, because small doses make the defence measurably *better*.

**The incumbent metric is disqualified.** `score` recovers **nothing** — not
dose-13, not dose-30, a 2.5x goblin-HP increase, on either maze, at any
BH-corrected q. Every balance verdict this project has published was measured
on a statistic that cannot detect a change nobody would dispute is enormous.

## The table

Paired by `seed:postGap`, n = 288 per cell, BH-corrected across the declared
family of 64 (56 tests ran; the shortfall was padded with p = 1).

| metric | MDE@288 | MDE/sd | monotone A | monotone B | doses recovered |
|---|---|---|---|---|---|
| `score` | 0.210 | 0.19 | no | no | **none** |
| `wavesCleared` | 0.210 | 0.19 | no | no | none |
| `hallHpFrac` | 0.000 | — | — | — | none (degenerate, see below) |
| `enemySeconds` | 79.19 | 0.17 | no | no | B:15 only |
| `structuresLostTotal` | 0.467 | 0.17 | **yes** | no | A:30, B:15, B:30 |
| `closestApproachPxMin` | 0.786 | 0.19 | **yes** | no | A:20, A:30 |
| `hallHpAuc` | **0.187** | **0.16** | **yes** | no | **A:20, A:30, B:20, B:30** |

`clearMargin` was declared and is unavailable: the stored data defines no
censoring model. Reported, not silently dropped.

## Three findings that matter more than the metric choice

### 1. Every single run lost. All 2880.

`wavesCleared` spans 3–9 and never reaches 10. `hallHpFrac` is 0.000 in every
record, so **`score` ≡ `wavesCleared` exactly** — its tie-breaker term is a
constant and contributes nothing. That is why `score` resolves nothing: in this
regime it is an integer-valued metric with sd ≈ 1.1.

We spent the pre-registration worrying about ceiling censoring. The instrument
is floor-censored instead. The prereg's remedy still applies with the sign
flipped: change the baseline, not the statistic.

This is **not** an artifact of the WP3 siting change. An exploratory diagnostic
(`siting-diag`, 1152 runs, not pre-registered, reported as exploratory) shows
the legacy siting protocol also loses — 285/288 on maze A, 288/288 on maze B.
The isolated protocol does cost real defensive strength on maze A: 7.219 waves
vs 8.156, and 8.2 Watchtowers purchased vs 9.1, because pinning the tower to the
gap-1 column shrinks the site pool. That cost is the price of removing the
displacement confound and both arms of any A/B pay it equally, but it should be
stated whenever a v2 number is compared to a legacy one.

### 2. Small doses make the defence BETTER on maze B.

`score` +0.177 at dose-13 and +0.215 at dose-15; `hallHpAuc` +0.151 and +0.176.
Tougher goblins, better outcome. Then dose-20 and dose-30 turn sharply negative.

Per the pre-registration's own rule, a metric that does not order the ladder
monotonically "is measuring something other than defence strength". But every
candidate scrambles it the same way on maze B, which points at the ladder rather
than at the metrics: **the monotonicity premise is false**, at least on maze B.

Speculation, flagged as such and not measured: tougher goblins survive longer in
the funnel and act as a plug, delaying the enemies behind them. This project has
already documented a crowd-jam mechanism (2026-08-02 stuck watchdog). Maze B's
lanes sit on the flanks with longer approach paths, which would amplify it.

**No balance verdict should be taken on maze B until this is understood.** A
game where a difficulty increase can improve the outcome is either an
interesting design property or a confound, and we do not currently know which.

### 3. The instrument's real resolution is ~67% goblin HP, not 8%.

Nothing recovers dose-13 or dose-15 on both mazes. The smallest reliably
detectable injection is dose-20 — goblin HP 12 → 20. Any future claim to have
measured an effect smaller than that, on this metric at n = 288, is not
supported by this corpus.

## Recommendation

1. **Adopt `hallHpAuc` as the primary metric** — best MDE (0.187, 0.16 sd), the
   only candidate recovering doses on both mazes, monotone where the ladder
   itself is monotone. Re-register before using it.
2. **Fix the regime before adopting anything as final.** A 100%-loss baseline
   measures "how fast do you lose", and pacing effects are exactly what let a
   difficulty increase read as an improvement. Weaken the horde or strengthen
   the policy until the control arm wins somewhere in the 30–70% band, then
   re-take this corpus. It costs 27 seconds of compute.
3. **Investigate the maze-B non-monotonicity** as its own pre-registered
   question. It is the most interesting thing in this data.
4. **Do not ship any balance change off this corpus.** It validates the
   instrument partially and refutes the metric-adoption arm outright.
