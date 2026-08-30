# Result — option-set procedure check: FAIL, twice, on the registered rule

Family: `option-set-procedure-check`. Spec: `docs/plans/2026-08-27-option-set-comparison-spec.md` §2.5.
Registration: `test/harness/prereg/option-set-procedure-check.json`, registered at
`f1f74ab` and amended at `85649e3`, both **before** the runs they govern.

| run | seeds | runs | corpus | verdict |
|---|---|---|---|---|
| 1 | 750 | 24,000 | `test/harness/store/2026-08-27-option-set-procedure-check.jsonl.gz` | **FAIL** |
| 2 | 3000 | 96,000 | `test/harness/store/2026-08-27-option-set-procedure-check-n3000.jsonl.gz` | **FAIL** |

Both 0 crashed, 0 hangs, every arm × maze cell exactly at its full count.

This family measures **the instrument, not the game.** Per its registered
`scopeLimit` it issues no balance verdict about any policy, about Magma Trap, or
about Watchtower damage.

---

## 0. Split seed, registered before analysis

**Split seed: `20260827`**, registered in revision 1 of this document before any
analysis of run 1, and unchanged for run 2. No other split seed has been tried on
either corpus.

---

## 1. Verdict: FAIL

The registered rule requires the procedure to select `wt-doubled` on **both**
mazes **and** to clear the runner-up by more than that maze's selection-half MDE.

| | run 1 (750 seeds) | run 2 (3000 seeds) |
|---|---|---|
| selected best, maze A | `wt-doubled` ✓ | `wt-doubled` ✓ |
| selected best, maze B | `wt-doubled` ✓ | `wt-doubled` ✓ |
| **maze A selection margin** | **0.090** | **0.059** |
| **maze A selection-half MDE** | **0.123** | **0.062** |
| `SELECTED BY NOISE`, maze A | **FIRED** | **FIRED** |
| maze B margin / MDE | 0.483 / 0.173 ✓ | 0.440 / 0.086 ✓ |
| selection stability, 200 splits | 100% | 100% |

Quadrupling the seeds halved the resolution limit exactly as the amendment
predicted (0.123 → 0.062 against a predicted 0.0615). The observed margin fell
too, from 0.090 to 0.059, and stayed inside it.

**Registered refutation (4) has fired.** It was added by the `85649e3` amendment
*before* run 2, and it forbids the obvious response:

> if `wt-doubled` is again selected on both mazes but the maze-A margin is again
> inside the selection-half MDE at the new n, that is NOT a further instrument
> defect to be fixed by yet more seeds … not a licence to keep raising n until it
> passes, and not a licence to drop an arm.

**No third run at higher n has been made, and none should be made under this
registration.** §3 explains why that restraint matters more here than usual.

---

## 2. What the corpus actually shows

`hallHpAuc`, mean over all 6000 seed-cells per arm per maze, run 2. Recomputed
from the raw records by an independently written script; all figures matched the
analyser.

### Maze A

| rank | arm | mean | vs `control` |
|---|---|---|---|
| 1 | **`wt-doubled`** | **8.161** | +0.447 |
| 2 | `fuse-flank` | 8.083 | +0.369 |
| 3 | `fuse-mid` | 7.911 | +0.197 |
| 4 | `fuse-early` | 7.898 | +0.184 |
| 5 | `fuse-late` | 7.841 | +0.127 |
| 6 | `wt-partner` | 7.780 | +0.066 |
| 7 | `control` | 7.714 | — |
| 8 | `wt-pure` | 7.563 | −0.151 |

### Maze B

| rank | arm | mean | vs `control` |
|---|---|---|---|
| 1 | **`wt-doubled`** | **7.862** | +0.723 |
| 2 | `wt-partner` | 7.429 | +0.290 |
| 3 | `fuse-late` | 7.221 | +0.082 |
| 4 | `fuse-flank` | 7.194 | +0.055 |
| 5 | `fuse-mid` | 7.166 | +0.027 |
| 6 | `fuse-early` | 7.142 | +0.003 |
| 7 | `control` | 7.139 | — |
| 8 | `wt-pure` | 6.846 | −0.293 |

### The planted effect is real, and the paired comparison resolves it decisively

This is the finding that refutation (4)'s wording did not anticipate, and it must
be stated because it changes what the failure *means* — not what the verdict is.

Paired over all 6000 cells, `hallHpAuc`:

| | delta | 95% CI | t |
|---|---|---|---|
| maze A, `wt-doubled` − `fuse-flank` | **+0.0781** | [0.0568, 0.0994] | **7.19** |
| maze B, `wt-doubled` − `wt-partner` | +0.4323 | [0.4010, 0.4636] | 27.03 |

On maze A the planted arm is better than the runner-up, and it is *not* a close
call as a direct paired test: t 7.19, and the CI excludes zero comfortably. The
procedure also picked the right arm every time — both mazes, both metrics, both
runs, 200/200 stability splits, largest raw mean throughout.

**So the selection is correct. What fails is the registered criterion.**

### Why the criterion failed, quantified

The criterion compares a *realized* selection-half margin against an MDE, which
is a power threshold rather than a test statistic. With the true margin at 0.078,
paired sd 0.841, and a 3000-cell selection half (SE 0.01536), the observed
half-margin falls below the 0.062 bar about **14.7%** of the time. The criterion
had roughly an **85% chance of passing** at this n, and this run landed in the
~15% tail.

That is the honest reading, and it cuts both ways:

- It means refutation (4)'s conclusion — "this option set cannot have its winner
  resolved on maze A at any practical n" — is **too strong** as written. The
  underlying comparison resolves fine at n = 6000. What sits near the edge is the
  *split-half argmax criterion*, because the planted effect is genuinely only
  ~0.078 above the best real policy.
- It also means **a third run would very likely pass**, which is exactly why
  running one is prohibited. Re-rolling a ~15% failure until it comes up the
  other way is not evidence; it is the researcher degree of freedom this whole
  family exists to police. The prohibition was registered before the run for
  precisely this situation, and it binds hardest when it is inconvenient.

---

## 3. Consequences, and what is held

**The pilot's maze-A numbers remain UNREAD.** The `decisionRule` requires it, and
two independent reasons now support it rather than one:

1. The registered rule has failed twice.
2. Even on the reading most favourable to the instrument, run 2 validates the
   procedure only *at 3000 seeds*, and `option-set-pilot` was taken at 750. The
   amendment registered this consequence in advance: a PASS at 3000 would not
   have licensed reading a 750-seed corpus either.

Unaffected, because they do not depend on the selection estimator:
`option-set-pilot` §1's policy × maze matrix, and its maze-B structural zero.

**A methodological defect in the criterion, recorded but NOT applied
retroactively.** Comparing a realized margin to an MDE is not a hypothesis test:
it discards the runner-up's variance and asks a point estimate to clear a power
threshold. A better criterion is a paired test of the selected arm against the
runner-up **on the evaluation half**, which uses the pairing the design already
provides. That observation must not rescue this family — swapping in a criterion
chosen after seeing which one failed is post-hoc selection, and it is the exact
move the pilot's own history warns about. It belongs in a **successor family,
registered before it is run**.

**Verified and unbroken across both runs:**

- 96,000 records, 96,000 unique runIds, one engine signature (`85649e3`), one
  `balanceHash`, 0 crashed, 0 hangs.
- The procedure's ordering agrees with the raw descriptives on both mazes and in
  both runs — refutation (3) never fired.
- In run 1, all 21,000 seed-cells shared with the `option-set-pilot` corpus were
  **bit-identical**, proving per-arm `balanceOverrides` do not leak across forked
  workers and the simulation is deterministic across sweeps.

**An instrument limit found by this corpus, and fixed.** `analyze.mjs` could not
read a 96,000-run store at all: its `readStore` decompressed the whole file into
one JavaScript string, and the decompressed corpus exceeds V8's maximum string
length (0x1fffffe8 chars), so the CLI died with
`Cannot create a string longer than 0x1fffffe8 characters`. A prior comment there
recorded keeping that reader synchronous as a deliberate trade — "a large change
for a small one" — which scale has now retired. It delegates to `store.js`'s
streaming `readRecords`, making the CLI path async and removing the ceiling
rather than raising it. Suite 893 pass / 0 fail / 2 skipped.

---

## 4. Next work

1. **Do not re-run this family at higher n.** Registered and binding.
2. Register a **successor procedure check** whose criterion is a paired test of
   the selected arm against the runner-up on the evaluation half, rather than a
   realized margin against an MDE. Register the criterion before running it.
3. `option-set-pilot`'s maze-A numbers stay held until a procedure check passes
   at the pilot's own n, or the pilot is re-run at whatever n that check
   validates.
4. Unchanged and independent of all of the above: register a new family with a
   fusion-free flank policy, to price the siting effect the pilot's set cannot
   separate from the fusion.
