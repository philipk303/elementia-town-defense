# WP5 `competent-v1` — code review

Date: 2026-08-15. Reviewer: Opus 5. Subject: uncommitted working-tree changes to
`test/harness/matchRunner.js`, `test/harness/protocol.js`,
`test/harness/matchRunner.test.js`.

**Status: INCOMPLETE and NOT fit to serve the cross-policy gate. Do not commit.**
The build agent hit a session limit mid-write. Its own load-bearing test fails,
and it fails for the right reason: `competent-v1` currently makes **byte-identical
build decisions** to `scripted-v1` under the default isolated protocol.

`test/harness/matchRunner.test.js` — 37 tests, 36 pass, **1 fail**.

---

## 1. The failing test is correct and should not be "fixed" by weakening it

`WP5: competent-v1 genuinely behaves differently from scripted-v1 on the same
seed` (matchRunner.test.js:703) asserts `notDeepEqual` on the WP3 placement
ledger and fails with actual === expected:

```
wave1 defence WATCHTOWER gx12 · wave2 gx26 · wave3 gx12 · wave4 gx26 · wave5 gx12
```

Both policies alternate between the two gap-1 columns in exactly the same order.
The agent wrote precisely the right test, and it caught precisely the right
defect. **The test is the most valuable artifact in this changeset.**

The remainder of that test is a half-written fragment — `barricadeCols` is
declared with a no-op `.concat()` and never used, and `rebuiltCols` is
unfinished. That is where the session ended.

## 2. Root cause: the baseline was mischaracterised

`competentBuildPolicy`'s "DIFFERENCE 2" comment claims scripted-v1

> always tries the earliest-listed gap's earliest-listed row first, regardless of
> how the lanes' standing defences are actually distributed.

**That is false.** `isolatedTowerSites` (matchRunner.js:231) iterates **row-major**:

```js
for (let dy = 1; dy <= 6; dy++) {
  for (const gap of maze.gaps) sites.push([gap - 1, maze.wallRow + dy])
}
```

so the static list is already `[gap0,r1], [gap1,r1], [gap0,r2], [gap1,r2], …` —
**lane-balanced by construction.** scripted-v1 alternates lanes for free.

`competent-v1` builds `sitesByGap` **gap-major** (all six rows of gap0, then all
six of gap1) and then re-ranks by fewest-standing-first, which reconstructs
exactly the alternation the row-major list already had. With two gaps the
"fewest standing" counter goes 0/0 → 1/0 → 1/1 → 2/1 → …, which is strict
alternation. Difference 2 is not merely undetected on this seed; it is
**provably a no-op for any two-gap maze under the isolated protocol.**

## 3. Difference 1 is real in code but a no-op in R1, on corpus evidence

Rebuild ordering genuinely differs (scripted: columns 1→38 left-to-right;
competent: sorted by distance-to-nearest-gap). It changes nothing measurable,
for two independent reasons:

1. **It is never gold-constrained.** Across all 2880 runs of the
   metric-selection-v2 corpus, `rebuildsSkippedForGold` is `0.000` with
   `sd 0.000` and a 100% ceiling share in **every** arm on **both** mazes. Scan
   order only decides outcomes when the budget runs out mid-scan. It never does.
   So both policies rebuild the identical *set* of columns; only intra-phase
   order differs, and every rebuild completes inside the same build phase before
   the wave starts — so the order is unobservable.
2. **It is invisible to the ledger anyway.** The barricade loop never calls
   `recordPlacement`, so `placements` cannot express this difference even when
   it exists. Any future test of difference 1 must read final structure state,
   which is what the unfinished `rebuiltCols` helper was reaching for.

## 4. The deeper problem — this pool cannot express a *siting* policy at all

Section 5 of `docs/reviews/2026-08-15-regime-calibration.md` already established
that **at 12 positions neither location helps** — `gap` and `hallApproach` pools
both give 0.0%/0.0% at equal capacity, and location only starts to matter at 36
positions. A second build policy that differs only in *where* it puts towers is
therefore constrained by the same geometry finding that motivated R1: with 12
sites and `spendDown: true`, every policy converges on the same fully-built pool,
and the only freedom is the order it fills it in — which is unobservable because
it all happens inside one build phase.

**Both of this changeset's differences are siting differences. Neither can
diverge in R1.** This is not a coding slip to patch; the work package's premise
needs re-scoping. The levers with actual headroom are:

- **What** it buys (structure mix), not where — magnitude and coverage are
  demonstrably not interchangeable (regime doc §5: 46 towers x 6 dmg = 67.2% on
  maze B vs 12 towers x 48 dmg = 1.6%).
- **When** it buys (hold gold for a fusion vs. spend immediately) — note the
  scripted policy ends runs with ~300 gold unspent.
- **"Does not blindly hold every button"** — the third behaviour the spec names,
  and the only one untouched here. It is combat/ability usage rather than
  building, so it is not subject to the 12-site geometry limit at all.

My recommendation: build `competent-v1` around the third behaviour, and treat a
siting difference as explicitly out of scope with the geometry finding cited as
the reason.

## 5. What is good and should be kept

- **`protocol.js` (lines 73–78, 138–140) is correct and well-reasoned.** Unknown
  `buildPolicy` values fail loudly rather than falling through to whichever
  branch the dispatch treats as default. The comment states exactly that risk.
  Its test passes.
- **`competentBuildPolicy` is a fully separate function** rather than a shared
  refactored core, so `scripted-v1` is provably untouched and every pinned
  measurement stays reproducible. That is the right call and the comment
  defending it is the right defence.
- **The dispatch (matchRunner.js:840) is additive.**
- **Determinism looks sound** and its test passes: no `Math.random`/`Date.now`,
  no rng draws, and every ordering is a total order over arrays
  (`sort(... || a - b)`; `Array#sort` is spec-stable). Map iteration never drives
  a decision.
- The duplicated free-special/fusion block is correctly identified as
  intentional duplication rather than drift.

## 6. One latent inconsistency to fix whenever this is rebuilt

`rebuildsSkippedForGold` is incremented with `continue` in both policies, so it
counts every unaffordable column — but competent-v1 iterates a *different*
column order over the *same* set, so the two policies' counts would diverge in
meaning if the budget ever did bind. It never binds today (§3), so this is
latent, not live. Worth a comment if the metric is ever used cross-policy.

## 7. Recommended next step

Do not commit this tree. Either revert the `matchRunner.js` policy body and keep
`protocol.js` + the three tests as the WP5 skeleton, or re-dispatch WP5 with the
scope corrected per §4. The failing test should stay failing until a policy
genuinely diverges — it is the gate, and a green suite bought by deleting it
would be the exact failure mode WP5 exists to prevent.
