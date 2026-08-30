# Steam Vent retune — result

> **CORRECTION, 2026-08-16.** §2, §3 and §4 of this document attribute the
> retune's +0.267 to the **slow** and recommend reverting the scald doubling as
> inert. **That attribution is wrong and the recommendation is withdrawn.** Two
> registered families with paired arms (36,000 runs, see
> `docs/reviews/2026-08-16-steam-vent-dials.md`) measure the opposite: the scald
> doubling carries **+0.253** on maze B (t 13.20) and the slow moves less than
> half the MDE with **opposite signs on the two mazes** (−0.021 A / +0.041 B).
>
> The error was an invalid instrument, and the reason generalises. §2 isolated
> "the vent's own damage" by zeroing it and differencing **total structure
> damage** — but that quantity is nearly *conserved*: the enemy pool has fixed
> total HP, so if the vent does not remove it the twelve Watchtowers do. The
> measure would have returned ~1.0 for any structure in the defence. **Attribute
> contribution through the outcome metric with paired arms, never through a
> damage ledger the rest of the defence can backfill.**
>
> Everything in §0 and §1 — the verdict, the deltas against the two-ingredient
> control, and the finding that the retune fixes the defect without clearing the
> ingredients — is unaffected and stands.

Date: 2026-08-15. Family `steam-vent-retune`, 18,000 runs, engine `d0d0582`,
clean worktree, **0 hangs, 0 crashes**. Registration `valid`,
`verdictAllowed: true`, 12 tests = the declared `familySize` of 12. Metric
`hallHpAuc`, regime **R2**, n = 3000 per cell, fresh seeds (`20290801 + i`).

**This is the first measurement in this project to ask spec §1's actual question**
— does a fusion outperform *both* the ingredients it consumes — against a
two-ingredient control, in a window that reaches the elite waves.

---

## 0. Verdict: the defect is fixed, the bar is not cleared

| | maze A | | maze B | |
|---|---|---|---|---|
| vs two-ingredient control | Δ | q | Δ | q |
| `vent-old` (pre-retune) | −0.035 | 0.009 | **−0.309** | ~0 |
| `vent-new` (retuned) | −0.018 | 0.18 | −0.042 | 0.062 |

**Per the pre-registered decision rule this is UNRESOLVED on both mazes.** It is
not a PASS — every delta is negative, and PASS required Δ > 0. It is not a FAIL
either — maze B's q of 0.062 does not clear the 0.05 gate.

Reported separately, as the prereg required, `vent-new − vent-old`:

| maze | Δ | t | sign |
|---|---|---|---|
| A | +0.017 | 1.35 | 1251+/1197− |
| B | **+0.267** | **13.83** | 1326+/806− |

**The retune works, and works substantially.** On maze B it removed 86% of the
old vent's deficit (−0.309 → −0.042) and moved it from *resolvably worse than
its ingredients* to *statistically indistinguishable from them*. The structure
that fusion-roster-v2 flagged as the roster's one clean defect is no longer a
defect.

It is also **not yet a success**. Spec §1 asks a fusion to *outperform* its
ingredients, and vent-new does not — it merely stops losing to them. Those are
different claims and the prereg required them reported separately precisely so a
partial fix could not be recorded as a win.

## 1. The old vent was worse than we knew

Against the correct control, `vent-old` on maze B is **−0.309** (t −15.23), more
than double the **−0.137** recorded in fusion-roster-v2.

**Two things changed at once and this family cannot separate them:** the control
gained a second ingredient (the Water Geyser it was never charged for), and the
window extended from 8 waves to 10. Both plausibly deepen the deficit. The
honest statement is that the old vent's harm was *understated* by the old
instrument, not that it was exactly 2.3x understated.

## 2. The pre-registered mechanism is REFUTED

The prereg committed to a specific mechanism — the slow raises dwell time, so
the scald lands more pulses — and to a specific falsifier: *vent-new's structure
damage must exceed twice vent-old's, since twice is what the raw damage doubling
alone would buy.*

Measured by differencing each spec against a zero-damage vent to isolate the
vent's own contribution (n=80 matches per cell, maze B):

| | vent's own damage |
|---|---|
| `vent-old` (scald 4) | 193.3 |
| `vent-new` (scald 8) | 198.0 |
| ratio | **1.02** — bar was > 2.00 |

**Doubling the per-pulse damage produced a 2% increase in damage dealt.** The
mechanism claim is withdrawn, exactly as the prereg required.

The reason is straightforward once measured: the vent already kills what stands
in it. Doubling the damage kills those enemies *sooner*, so fewer subsequent
pulses land on them, and total damage dealt is conserved. **The vent is not
damage-limited.**

So the +0.267 on maze B is **not** the doubled scald. It is the slow — and not
through damage, but through the plainest route available: a slowed enemy
advances toward the hall more slowly, and `hallHpAuc` integrates exactly that.
`slowedSeconds` goes 0.00 → 8.26 per match.

## 3. The consequence: scald 8 is probably wasted

This is the actionable finding, and it points the opposite way from the change
that shipped. The damage doubling bought +2% damage and, on maze A,
`vent-new − vent-old` is +0.017 at t 1.35 — nothing. Both the direct measure and
the outcome measure agree that the damage dial is inert.

**Recommendation: test scald 4 + the slow before shipping scald 8.** If it
matches vent-new, the retune reduces to a single change — replace confusion with
a strong slow — and the vent keeps its original damage profile. That is a
smaller, better-understood change, and it leaves the damage dial free as a lever
that has *not* already been spent. It needs its own pre-registration; nothing
here licenses shipping it.

## 4. What would actually clear the bar

vent-new needs roughly +0.05 to +0.10 on maze B to move from "indistinguishable"
to "resolvably better". Given §2, that will not come from damage. Candidates, in
the order I would test them:

1. **A longer or stronger slow.** It is the component doing all the work and it
   is the only one whose effect is demonstrated. `factor 0.5` is already the
   system maximum, so the lever is `ms`.
2. **A larger cloud** (`cloudMarginPx`). Held fixed in every family so far
   because 15 is a geometric spillover bound, not a balance dial — raising it
   would need the spillover question reopened first, deliberately.
3. **Accept it as a support structure and change the criterion.** A structure
   that matches two ingredients while occupying one 2x2 footprint instead of two
   2x1s is arguably paying its way in *space*, which no metric here measures.

## 5. What this does NOT establish

- **No balance change ships from this family.** The retune in `5759028` stands
  as landed because it is a strict improvement over what preceded it, but
  `vent-new` has **not** cleared A1.4(a) as restated in Amendment D.
- **The maze-A result is nearly a null across the board** (all four deltas within
  ±0.035). Maze A does not discriminate between these arms; every conclusion
  above is a maze-B conclusion.
- **`vent-old` is not exactly the shipped-before spec.** It restores scald 4 and
  disables the slow, but cannot restore confusion — the dispatch flag is gone.
  It is "the old scald without the old confusion", which the decomposition
  measured as worth +0.013 less on maze B. Declared in the prereg, inside the
  noise floor.
- **The cross-policy gate is still empty** (only `scripted-v1`), so this verdict
  is provisional like every other. This is especially live for a slow: a
  stationary policy cannot reposition to exploit dwell time, so a null here is
  weaker evidence against the mechanic than it would be against raw damage.
- Split-half was declared uninformative in advance (3 arms → four possible
  values) and was not used as a gate.

## 6. Method note: two refuted predictions in two families

Both this family and `steam-vent-mechanism` pre-registered a mechanism, and both
were wrong — confusion was predicted to carry the harm (it was inert), and dwell
time was predicted to carry the fix (the damage was flat). In both cases the
prereg's own declared falsifier caught it, and in both cases the truth was
simpler than the prediction.

That is the pre-registration working, not failing. It is worth recording because
the same instinct produced both errors: reaching for the *interesting*
mechanism when the plain one — less damage on the field, slower enemies — was
sufficient.
