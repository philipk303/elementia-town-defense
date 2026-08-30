# Volcano cadence retune — how a fusion stopped being worse than its ingredients

Date: 2026-08-27. **EXPLORATORY — no registered family, no prereg, no verdict
gates.** Five sweeps, 81,000 runs total, all 0 crashed. Every figure is a plain
paired contrast against `wt-partner` (an unfused Rock Trap + Firepit, the two
structures the fusion consumes), recomputed from raw records.

Landed: `chargeThreshold` 3 → 1 and `eruption.cooldownMs` 6000 → **1300**
(`shared/balance.js`). Suite 894 pass / 0 fail / 2 skipped.

| corpus | runs | what it tested |
|---|---|---|
| `2026-08-27-volcano-constant-probe.jsonl.gz` | 9,000 | the first, everything-at-once attempt |
| `2026-08-27-volcano-lever-probe.jsonl.gz` | 18,000 | field vs cadence, separated |
| `2026-08-27-volcano-cooldown-ladder.jsonl.gz` | 21,000 | the cooldown curve, threshold isolated |
| `2026-08-27-volcano-threshold2-probe.jsonl.gz` | 18,000 | whether threshold 2 preserves the telegraph |
| `2026-08-27-volcano-cd1300-probe.jsonl.gz` | 15,000 | the cliff between 1500 and 1000 |

---

## 1. The defect

Fused Volcano was **worse than not fusing at all** on maze B: −0.216 hallHpAuc
against the two ingredients held separate (t −8.2). Building the fusion there was
a mistake. On maze A it was only +0.097, barely past that maze's 0.089 margin.

The structural reason is in the balance file's own §7 invariant: Volcano's
passive output is deliberately held *below* Firepit's (crossing burn 6 dps versus
Firepit's 15 dps field plus 9 burn). The fusion knowingly gives away the strongest
sustained damage source in the pair and is supposed to earn it back on a periodic
eruption. It wasn't earning it back.

## 2. A wrong hypothesis, corrected by measurement

The first attempt gave Volcano a continuous Firepit-grade field **and** an
eruption every 750ms, and it worked: maze B went −0.216 → +0.479. From that, the
field was credited with the fix, on the reasoning that the fusion was losing the
Firepit.

**That was wrong, and separating the levers proved it:**

| maze B, vs unfused | |
|---|---|
| control (old Volcano) | −0.216 |
| **field only** (dps 8, eruption untouched) | **−0.151** |
| **cadence only** (no field, threshold 1, 750ms) | **+0.434** |
| both | +0.479 |

The field is worth about +0.065 and the cadence about +0.650. Attributing the fix
to the field was a story told over a two-variable change — exactly the error this
harness exists to catch, committed by the person operating it.

**Consequence: the field was dropped entirely.** That also reverted a
`server/game/towers.js` change (letting one structure run both a field and an
entry trigger), so the dispatcher keeps its one-behaviour-per-structure rule, and
it restores the §7 invariant the field had broken.

## 3. Both cadence dials are load-bearing

Neither dial works alone. The charge threshold gates the eruption on *crossings*;
the cooldown gates it on *time*. Leaving either at its old value blocks the fix:

| maze B, vs unfused | threshold 3 | threshold 1 |
|---|---|---|
| cooldown 6000 | −0.216 | — |
| cooldown 3000 | — | −0.033 |
| cooldown 2250 | — | +0.099 |
| **cooldown 1500** | — | **+0.246** |
| cooldown 750 | **−0.052** | +0.434 |

A fast recharge with the threshold still at 3 recovers almost nothing (−0.052):
the eruption sits waiting for three separate crossings regardless of how quickly
it could re-arm.

## 4. Why 1300 — a cliff, not a slope

The first pass shipped 1500 on the grounds that it balanced the two mazes. A
follow-up probe at 1300 showed that 1500 sits on the edge of a sharp
non-linearity. Maze-B gain per millisecond shaved is wildly uneven:

| segment | span | maze-B gain |
|---|---|---|
| 2250 → 1500 | 750ms | +0.147 |
| **1500 → 1300** | **200ms** | **+0.135** |
| 1300 → 1000 | 300ms | +0.058 |
| 1000 → 750 | 250ms | −0.005 |

Nearly as much value moves in the 200ms from 1500 to 1300 as in the 750ms before
it. Something in the arrival cadence lands right there: at 1500 the eruption
misses a group of arrivals that 1300 catches. **1500 was therefore the fragile
choice** — a later change to enemy speed or spawn pacing would swing its value
hard. 1300 is past the steep part.

Full curve, both mazes, against the unfused ingredients:

| cooldown (threshold 1) | maze A | maze B | gap |
|---|---|---|---|
| control (thresh 3, 6000) | +0.097 | −0.216 | 0.313 |
| 2250 | +0.285 | +0.099 | 0.186 |
| 1500 | +0.288 | +0.246 | 0.042 |
| **1300 (shipped)** | **+0.291** (t 12.1) | **+0.381** (t 15.6) | 0.090 |
| 1000 | +0.296 | +0.439 | 0.143 |
| 750 | +0.296 | +0.434 | 0.138 |

Paired directly against the previously-shipped 1500: **maze A +0.003 (t 0.8),
indistinguishable; maze B +0.135 (t 8.8)**. So 1300 costs maze A nothing and buys
maze B a lot.

The trade accepted: maze B pulls ahead of maze A again (gap 0.090 versus 0.042 at
1500). That is a real loss of the "not maze-situational" property the 1500 setting
had, and it is still far inside the 0.313 gap the original design carried. 1000
would buy only +0.058 more on maze B while widening the gap to 0.143.

## 5. The cost: Volcano loses its charge-up telegraph

`vtCharge` resets in the same tick it reaches the threshold, so at threshold 1 the
only charge the structure can ever put on the wire is 0. **The CHARGED animation
state is now unreachable for MAGMA_TRAP.** The player gets no "about to erupt"
tell.

Threshold 2 was measured specifically to buy the telegraph back, and it does not
work — maze B collapses to nothing at every cooldown tried:

| maze B, vs unfused | |
|---|---|
| threshold 2, 1500ms | +0.004 (t 0.2) |
| threshold 2, 750ms | +0.019 (t 0.9) |
| threshold 2, 400ms | +0.021 (t 1.0) |

Even a 400ms recharge cannot rescue it: on maze B enemies simply do not cross the
footprint twice often enough. **Threshold 1 is required, so the telegraph loss is
the price of the fix, not an oversight.** What remains readable is the phase
rhythm: erupt → RECOVERY for 1300ms → idle. `test/client/animationController.test.js`
now pins CHARGED as unreachable here rather than asserting the reverse.

## 5b. Does this clear A1.4(a)? No — not yet, and here is exactly what is missing

Amendment D (`docs/superpowers/specs/2026-07-25-combat-structure-redesign.md`
§D2) restates the bar as: a **positive, resolvable contribution ... declared in
advance before measurement**, where "resolvable" means clearing the v2 verdict
gates on the pre-registered primary metric.

This probe fails that bar on procedure, not on numbers:

| Amendment D requires | this probe |
|---|---|
| declared in advance | **no** — exploratory, written after the fact |
| clears the v2 verdict gates | **not computed** — no BH q, no sign test, no split-half rho, no hang imputation |
| pre-registered primary metric | `hallHpAuc` used, but not registered for this family |
| matched control | `wt-partner`, the two ingredients — the *harder* bar, not the no-structure one |

What the numbers do say, descriptively: the fusion is positive against the two
structures it consumes on **both** mazes, at t 12.1 and t 15.6, reproduced across
five independent corpora and 81,000 runs, with the sign stable across every
cooldown from 2250 down. That is strong evidence and it clears the harder of the
two comparisons — but strong evidence gathered after the fact is precisely what
this project has repeatedly had to retract. **Magma Trap is not validated until a
registered family says so.**

The concrete next step is a registered `fusion-r3-magma-trap` family: declare
`hallHpAuc`, the `wt-partner` control, the gates and the MDE in advance, then run
it once and read it. The corpora here would be the pilot that motivated it, not
the evidence for it.

## 6. What this does NOT show

- **No verdict.** Unregistered family, no prereg, no BH correction, no gates. The
  contrasts are large and consistent across four independent corpora, but they
  carry no registered claim.
- **Only Magma Trap**, only `scripted-v1`, only `fuseWith: FIRE`. The other five
  fusions are untouched and unmeasured; the same defect may or may not apply.
- **Nothing about difficulty.** Every arm still loses nearly every run. The best
  setting wins 0/1500 on maze B. The retune makes the fusion worth building; it
  does not make the game winnable, and the loss rate remains a property of the
  scripted bot rather than a readout on enemy tuning.
- **Nothing about the siting effect.** `specialSiting` was held at `funnel` in
  every arm, deliberately, so the placement effect documented in
  `docs/reviews/2026-08-27-option-set-pilot-result.md` §2 cannot leak in. Pricing
  siting still needs its own registered family with a fusion-free flank policy.

## 7. Tests updated, and why

Nine tests encoded the old contract. None were relaxed to pass:

- `test/game/volcano.test.js` — the charge-ACCOUNTING mechanics (residency banks
  nothing, re-entry banks again, partial charge renders fractionally) are
  threshold-independent but only *observable* while a charge can sit un-fired, so
  they now run under a local `withThreshold(3)` helper that always restores. A new
  test pins the shipped cadence itself. Pinning mechanics to whatever the dial
  happens to be is what made this file break when the dial moved.
- `test/client/animationController.test.js` — inverted to assert CHARGED is
  unreachable for this structure, with the reason, per §5.
- `test/harness/matchRunner.test.js` — three pins re-anchored following the file's
  documented seed-swap convention: the 10-wave-win seed 20260838 → 20260839 (six
  other winning seeds exist in range, so wins are not scarce); `enemySeconds`
  1653.0 → 1481.1 (enemies die sooner, and `wavesCleared` moved 7 → 8 alongside);
  and the basic-attack coverage guard moved to postGap 1, because this seed's
  postGap-0 run is one of **5 in 80** where the lane clears before the human
  swings. 75 of 80 still record attempts, so that is a property of one run, not a
  systemic loss of player agency.

## 8. Reproducing

The two field probes (`volcano-constant-probe`, `volcano-lever-probe`) override
`TOWER.MAGMA_TRAP.aoe` / `.dps`, which no longer exist after the field was
dropped. **Those two specs will not re-run against current `shared/balance.js`.**
Their corpora are the permanent record. The cooldown ladder and threshold-2 probe
override only `chargeThreshold` and `eruption.cooldownMs` and re-run as written.
