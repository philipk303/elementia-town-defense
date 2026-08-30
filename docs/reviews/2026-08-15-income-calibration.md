# Income calibration — can gold be made to bind?

Date: 2026-08-15. Status: EXPLORATORY (no pre-registration, no verdict, no
balance change shipped). 4032 runs, engine `b240a84`, clean worktree, 0 hangs.
Control arm only (`fuse: false`), R1 regime, `HALL_BASE_INCOME` swept 10 → 0.

**Result: REFUTED. No income knob can make gold bind. The defence is
site-limited, not gold-limited.** The recommendation this test was built to
check — cut `HALL_BASE_INCOME` until gold binds, so A1.4(a)'s equal-gold bar
becomes measurable — does not work, and the reason is structural rather than a
matter of finding the right value.

---

## 1. The ladder

| `HALL_BASE_INCOME` | towersPurchased A | goldUnspent A | hallHpAuc A | hallHpAuc B |
|---|---|---|---|---|
| 10 (shipped) | 12.142 | 318.6 | 7.484 | 7.009 |
| 7 | 12.142 | 296.8 | 7.484 | 7.023 |
| 5 | 12.142 | 282.2 | 7.484 | 7.023 |
| 3 | 12.142 | 267.7 | 7.484 | 7.023 |
| 2 | 12.142 | 260.4 | 7.484 | 7.023 |
| 1 | 12.142 | 253.2 | 7.484 | 7.023 |
| **0** | **12.142** | **245.9** | **7.484** | **7.023** |

`towersPurchased` is identical to three decimals — same mean, same sd (0.397) —
at every rung including zero. `hallHpAuc` is likewise identical at every rung.
`rebuildsSkippedForGold` stays identically 0.000 with a 100% ceiling share
throughout. The only quantity that moves is `goldUnspent`, and it moves by
exactly the arithmetic amount removed.

**Removing the hall's entire income contribution changes no build decision and
no outcome.**

## 2. Why — the arithmetic

At `HALL_BASE_INCOME: 0`, maze A, n=288:

- towers bought 12.14, costing **73 gold**
- barricade rebuilds 2.08, costing **4 gold**
- gold left over: **246**
- total gold available: **~323**

The 12-site pool absorbs 73 gold out of 323. **The leftover alone is 3.4x the
cost of filling the entire pool.** Hall income is only ~77 of that 323; the rest
is starting gold plus citizen income, which the scripted policy earns regardless.

To make gold bind at a 12-site pool you would have to remove roughly **78% of
total income**. That is an economy redesign, not a calibration knob — and it
would change the game being measured far more than the fusion under test.

## 3. What this means for A1.4(a)

A1.4(a) asks whether a fusion is worth at least the Watchtowers its gold would
otherwise have bought. **In the shipped economy that question has no content:
the gold would not have bought anything, because the pool is already full and
the purse is still 3.4x over.** Fusions genuinely are free.

This is not a measurement artifact to be engineered away. It is a fact about the
game as currently balanced, and it now has a direct measurement behind it rather
than an inference.

The remaining ways to give the comparison an opportunity cost, and why each is
worse than restating the criterion:

1. **Expand the defence site pool** so gold has somewhere to go. Requires
   shipping `test/harness/archive/2026-08-15-defence-pool-probe.patch`, which is
   validated but deliberately unshipped. The regime calibration already measured
   the two candidate pools: `gapWideDeep` at 8 waves **ceiling-censors maze A**
   (the 2x arm hits 100% with sd 0.00) and at 9 waves **floor-censors maze B**.
   Both destroy the sensitivity R1 was selected for.
2. **Cut total income ~78%.** Changes the game more than the thing being
   measured.
3. **Restate A1.4(a).** If gold is structurally non-scarce, "worth its gold" is
   the wrong design criterion, and "contributes positively at all" — which the
   fusion-roster-v2 corpus already measures at n=900/cell — is the honest
   replacement.

**Recommendation: (3).** Options 1 and 2 both change the game to preserve a
criterion whose premise the game does not satisfy.

## 4. What this does NOT establish

- It does not say the economy is *well* balanced. "Gold is not scarce" may
  itself be a design problem worth fixing for play reasons — it just cannot be
  fixed *in order to* measure A1.4(a) without changing what is being measured.
- It says nothing about waves 9–10 (R1 never measures them), where a longer game
  might drain the purse.
- It was run on the control arm only. Fusion arms spend ~7–8 more gold, which is
  immaterial against a 246-gold surplus but was not separately swept.
