# Steam Vent dials — scald and slow, decomposed with paired arms

Date: 2026-08-16. Families `steam-vent-scald-dial` and `steam-vent-slow-dial`,
18,000 runs each (36,000 total), engines `e3f6145` / `c56c5a1`, clean
worktrees, **0 hangs, 0 crashes**. Both registrations `valid`,
`verdictAllowed: true`, 12 tests each. Metric `hallHpAuc`, regime **R2**,
n = 3000 per cell, two-ingredient control, fresh disjoint seed sets.

---

## 0. Headline: I had the attribution exactly backwards

`steam-vent-retune` concluded that the retune's +0.267 came from the **slow**,
and recommended reverting the scald doubling as inert. **Both halves of that are
wrong.** Two registered families with paired arms say the opposite:

| component | maze A | maze B |
|---|---|---|
| **scald 4 → 8** (slow held on) | **+0.031** (t 2.72) | **+0.253** (t 13.20) |
| **slow off → on** (scald held at 8) | −0.021 (t −1.97) | +0.041 (t 2.78) |

**The doubled scald carries essentially the entire retune.** The slow moves less
than half the declared MDE on either maze and *changes sign between them*.

I predicted the reverse in both preregs — and in the scald family I predicted it
explicitly enough to be refuted by my own declared falsifier.

## 1. Why the earlier attribution was wrong: a bad instrument

`steam-vent-retune` §2 isolated "the vent's own damage" by zeroing the vent's
damage and differencing total structure damage. It gave 193.3 vs 198.0 — a ratio
of 1.02 — and I read that as the damage dial being inert.

**That measure is invalid, and the reason generalises.** Total structure damage
is a nearly *conserved* quantity: the enemy pool has a fixed total HP, and if the
vent does not remove it, the twelve Watchtowers do. Differencing it therefore
measures almost nothing about which structure did the work. It would have
returned ~1.0 for *any* structure in the defence.

The lesson to carry: **attribute contribution through the outcome metric with
paired arms, never through a damage ledger that the rest of the defence can
backfill.** The outcome metric is the only one that knows the counterfactual.

## 2. The scald dial — KEEP 8

`scald-8 − scald-4`, paired, slow held on in both:

| maze | Δ | 95% CI | t | sign |
|---|---|---|---|---|
| A | +0.031 | [0.009, 0.054] | 2.72 | 1184+/1065− |
| B | **+0.253** | [0.215, 0.290] | **13.20** | 1254+/800− |

Resolvably positive on both mazes. The pre-registered rule put the burden of
proof on the larger number and it cleared it comfortably. **Scald 8 stays** —
which is what already shipped in `5759028`, so no code change follows.

Against the two-ingredient control the two arms stand at:

| | maze A | maze B |
|---|---|---|
| `scald-4` | −0.035 (q 0.012) | −0.302 (t −14.79) |
| `scald-8` | −0.003 (q 0.89) | −0.050 (q 0.015) |

## 3. The slow dial — the rule fires for DROP, and I recommend not acting on it yet

`slow-on − slow-off`, paired, scald held at 8 in both:

| maze | Δ | 95% CI | t |
|---|---|---|---|
| A | **−0.021** | [−0.041, −0.000] | −1.97 |
| B | **+0.041** | [0.012, 0.069] | 2.78 |

Against the pre-registered rule:

- **(b) is clearly satisfied.** Both CIs lie entirely inside ±0.10. Whatever the
  slow does, it does *less than the smallest difference this project has
  declared worth caring about*. This is a genuine equivalence result, not an
  absence of evidence.
- **(a) is satisfied too, on the declared correction.** Maze B's raw p is 0.0055;
  BH across the declared family of 12 puts it at ~0.066, short of the 0.05 gate.
  And maze A points the *other way*.

**So the registered rule says DROP the slow.** I am reporting that plainly
because I wrote the rule before seeing the data.

**I nevertheless recommend keeping it for now, and the reason was declared in
advance rather than invented here.** The prereg's `scopeLimit` states: *"the
cross-policy gate is empty and every verdict is provisional on it — this is MORE
live here than anywhere else in the Steam Vent work, because a stationary
scripted policy cannot reposition to exploit a slow, so a null is weaker
evidence against a slow than against damage."* That caveat was written into the
registration precisely so it could not be produced afterwards to rescue a result.

Dropping the slow is also not a dial revert — it leaves Steam Vent as a pure
damage pulse with **no second mechanic at all**, which is a change to the
structure's identity and a design call rather than a measurement one.

**The honest state: the slow is not earning its place on the current policy, and
it trades maze A for maze B.** That is a real problem, just not one the current
instrument can close.

## 4. Where Steam Vent now stands against spec §1

Against the two ingredients it consumes, on `hallHpAuc` in R2:

| arm | maze A | maze B |
|---|---|---|
| pre-retune vent | −0.035 | −0.309 |
| shipped vent (scald 8 + slow) | −0.022 | −0.015 |
| scald 8, no slow | −0.001 | −0.056 |

**The defect is fixed.** From −0.309 to −0.015 on maze B is the whole of the
original problem removed. **It still does not outperform its ingredients** —
every cell above is negative, and none is resolvably positive. Spec §1 is not
met; A1.4(a) as restated in Amendment D is not cleared.

The vent is now, on the best available reading, *approximately break-even with
the two structures it eats*. That is a far better place than it started and it
is not a success.

## 5. What this does NOT establish

- **No code change follows from either family.** Scald 8 already shipped; the
  slow is retained pending the recommendation in §3.
- **Nothing here says the slow MAGNITUDES are wrong.** Both families vary one
  dial. `factor` is already at the system maximum (0.5), so the untested lever is
  `ms`; a longer slow is a different question from whether this slow works.
- **The maze split is unresolved and real.** The slow helps B and hurts A, both
  sub-MDE. A structure whose only non-damage mechanic has opposite signs on the
  two mazes has a design problem worth understanding before more tuning.
- **The cross-policy gate remains empty** (only `scripted-v1`). Every number here
  is provisional on it, and §3 explains why that bites hardest on the slow.
- R2's terminal-measure ban still applies; `hallHpFrac` and win rate are
  floor-censored and were not used.

## 6. Method note: three predictions, three refutations

`steam-vent-mechanism` predicted confusion carried the harm — it was inert.
`steam-vent-retune` predicted dwell time carried the fix — the damage did.
`steam-vent-scald-dial` predicted the scald was inert — it carried +0.253.

Every one was caught by a falsifier written into its own registration, and the
last one also exposed the bad damage-ledger instrument that produced the
previous error. The pattern across all three is the same: **I reached for the
mechanism that was interesting over the one that was sufficient.** Damage
killing things is sufficient.
