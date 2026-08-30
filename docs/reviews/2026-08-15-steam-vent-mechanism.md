# Steam Vent decomposition — result

> **CORRECTION, 2026-08-15, same day.** The first version of this document
> attributed the `vent-inert` deficit to a **blocking 2x2 fusion body
> re-routing the horde**. That is wrong, and it was wrong in the commit message
> and the memory too. **All six fusion types are in `WALKABLE_TYPES`**
> (`shared/constants.js:133`), and a walkable structure is *"never on the field
> at all"* (`server/game/structures.js:105`) — no cost-field band, no route
> shaping, no diagonal blocking. **Fusions do not block and there is no routing
> tax.** The claim was inherited from fusion-roster-v2 §4.5's *hypothesis* and
> repeated without checking the constant.
>
> The measured numbers are unchanged; what they mean is not. §2 and §5 below are
> rewritten. The corrected reading is **sharper**, not weaker: `vent-inert −
> control` is the **foregone output of the Firepit the fusion consumed**, and
> Steam Vent's total output is worth less than that single ingredient.

Date: 2026-08-15. Family `steam-vent-mechanism`, 7,200 runs, engine `744b318`,
clean worktree, **0 hangs, 0 crashes**, 100% combo formation in all three fusion
arms and 0% in control. Registration `valid`, `verdictAllowed: true`, 30 tests =
the declared `familySize` of 30. Metric `hallHpAuc`, n = 900 per cell, achieved
MDE 0.067 (A) / 0.099 (B) against the declared 0.10.

Plus an unregistered fresh-seed replication (`steam-vent-replication`, 3,600
runs) — see §4.

---

## 0. Headline: the pre-registered prediction is REFUTED, and the refuting alternative is what happened

I pre-registered that **confusion** carries Steam Vent's maze-B harm, via the
named mechanism "confusion suspends target acquisition, so enemies stop bashing
structures in the kill zone and wander onward". That prediction is refuted on
both of its declared tests.

**Confusion contributes essentially nothing to the outcome.** The scald pulse
does nearly all of the structure's work, and what actually hurts is that the
fusion **consumes a working Firepit and gives back less than it took**.

The prereg named the observation that would redirect the retune — "`vent-inert`
is itself resolvably negative on maze B at a magnitude comparable to
`vent-full`'s" — and it occurred at **3.6x** vent-full's magnitude.

## 1. The ladder

Paired delta vs the same `control` (fuse:false) on `hallHpAuc`.

| arm | components | Δ maze A | t | q | Δ maze B | t | q |
|---|---|---|---|---|---|---|---|
| `vent-inert` | body only | **−0.186** | −7.80 | ~0 | **−0.487** | −12.15 | ~0 |
| `vent-scald` | body + scald | −0.034 | −2.84 | 0.007 | **−0.150** | −5.45 | ~0 |
| `vent-full` | body + scald + confusion | +0.011 | 1.11 | 0.32 | **−0.137** | −4.95 | ~0 |

Adjacent-rung differences — the component attributions. All four arms run the
same seed set, so these are valid paired contrasts:

| component | maze A | maze B |
|---|---|---|
| body (inert − control) | **−0.186** | **−0.487** |
| scald (scald − inert) | **+0.152** | **+0.337** |
| confusion (full − scald) | +0.045 | **+0.013** |

**Confusion is worth +0.013 hallHpAuc on the maze where the structure is
broken** — an eighth of the declared MDE, and it points the *wrong way* for the
harm it was hypothesised to cause. On maze A it is +0.045, also inside the noise
floor. Steam Vent's signature mechanic is, on this instrument, doing nothing.

The scald pulse is carrying the entire structure: +0.337 on maze B, recovering
69% of the body's cost — but not all of it, which is exactly why the shipped
structure lands at −0.137.

## 2. What is clean here, and what is confounded

**Clean (confound-free):** the two within-fusion contrasts. `vent-scald` and
`vent-full` differ *only* in `confuse.ms`; `vent-inert` and `vent-scald` differ
*only* in `pulse.damage`. Every other property — type, hp 90, footprint, cost 0,
fusion formation, cloud rect — is identical. The scald and confusion
attributions above are therefore exact.

**Mis-registered, and corrected here:** the prereg calls `vent-inert − control`
"the cost of the BODY", on the assumption that the fusion blocks. It does not
(see the correction note at the top). The arm's actual content is:

- **control** keeps its one 2x1 walkable `FIRE_SPECIAL` — a working Firepit —
  alive and pulsing for all 8 waves.
- **the fusion arms** consume that Firepit at `fuseWave` 4 and replace it with
  the fusion. `vent-inert`'s replacement deals no damage and applies no status.

So `vent-inert − control` is, dominantly, **the Firepit's own contribution over
waves 4–8**: −0.186 (A) / −0.487 (B). There is no routing component to separate
out, because a walkable structure never enters the cost field.

One second-order term remains and this family cannot isolate it: a walkable
structure is still **attackable** (`server/game/enemies.js:431`), so the inert
2x2 acts as a 90 hp speed bump that soaks some attacks. That works *against*
the measured deficit — the true foregone-Firepit value is if anything slightly
larger than −0.487.

`closestApproachPxMin` is consistent and needs no routing story: enemies get
**19–22 px closer to the hall** in `vent-inert` on both mazes (B: −19.4,
t −10.23), the scald recovers most of it (−5.7), and `vent-full` is back to
baseline (+0.78, ns). Less damage on the field lets enemies press closer. That
is all it says.

## 3. The named mechanism is refuted twice over

The prereg committed: if confusion harm is real, `structuresLostTotal` must
**fall** in `vent-full` relative to `vent-scald`.

It **rose**, by +0.349 on maze B (`vent-scald` −0.353 vs `vent-full` −0.004
against control) and +0.247 on maze A. Confusion causes *more* structures to be
lost, while costing nothing in `hallHpAuc`. Both halves of the prediction fail:
wrong component, and wrong sign on the diagnostic.

## 4. The positive control — a correction to my own registration

The prereg claims `vent-full` replicates fusion-roster-v2's −0.137 "on
independent seeds". **That claim was wrong.** Seeds are deterministic
(`20260801 + i`, `test/harness/bench/run.mjs:77`), so at `seeds: 450` this arm
re-ran fire-v2's *exact* seed set. It reproduced −0.137 / score −0.210 /
wavesCleared −0.171 to three decimals on all three metrics — which is a
**determinism and construction check**, not evidence of replication.

A genuine replication was run afterwards on 450 **fresh** seeds
(`20270801 + i`, family `steam-vent-replication`, 3,600 runs):

| | maze A | maze B |
|---|---|---|
| original (fire-v2) | +0.011, t 1.11 | **−0.137, t −4.95** |
| fresh seeds | −0.007, t −0.69 | **−0.141, t −4.98** |

**The finding replicates.** Steam Vent's maze-B harm is real and stable, and its
maze-A null is stable too.

Two caveats on that replication, both declared rather than discovered: it is
**EXPLORATORY — no preregistration file**, so it carries no verdict; and its
records are stamped `dirty: true` because the spec file was untracked in the
bench worktree when it ran. No game code differs — the dirt is one untracked
JSON spec — but the records are not poolable with the registered corpus and must
not be merged into it.

## 5. What this means — the fusion does not pay for what it eats

**Do not touch confusion as a balance dial.** It is not the defect, and turning
it would repeat the 2026-08-02 error of tuning a component the evidence never
implicated. At +0.013 on the maze where the structure is broken, it is not
under-tuned — it is *inert*, while the spec calls it the structure's signature
mechanic. That is a design finding, not a tuning one.

The real result, stated as a balance sheet for waves 4–8 on maze B:

| | |
|---|---|
| given up: the Firepit it consumes | **−0.487** |
| gained: scald | +0.337 |
| gained: confusion | +0.013 |
| **net** | **−0.137** |

**Steam Vent is worth less than ONE of the two structures it consumes.** Spec §1
requires that "fusion structures outperform their two ingredients when well
placed". It does not outperform one.

This reframes fusion-roster-v2's table. Those deltas are not "the fusion's
value" — they are **the fusion's value minus the ingredient it ate**. Every
fusion in that corpus is measured net of one consumed special, which is why so
many sit near or below zero.

**And the bar is stricter than anything yet measured.** The control buys only
the free special; the partner is purchased inside the fuse branch
(`test/harness/matchRunner.js:390-396`), so it is never held unfused. Every
number in this project's fusion corpus is therefore graded against **one**
ingredient where the spec asks for **two**. Fusions currently look *better* than
their own criterion would rate them. Fixing that needs a protocol flag that buys
the partner special without fusing — an instrument change, and a prerequisite to
any fusion verdict.

**The other prerequisite is scope.** R1 stops at wave 8; the elites concentrate
at 9–10. A mechanic that converts two structures into one permanent, higher-
ceiling piece is exactly the kind whose payoff arrives late, and right now
"fusions do not pay" and "we stop measuring before they would" are
indistinguishable.

**Recommendation:** fix both instrument problems before sizing any retune.
Buffing Steam Vent's scald against the current baseline would be tuning to clear
a bar that is set at the wrong height, in a window that may end before the
structure's value arrives.

## 6. What this does NOT establish

- **No retune ships from this family.** It selects the dial; it does not size
  the move. That was declared in the prereg's `scopeLimit` and holds.
- The −0.487 is **not** cleanly separated from the inert body's attackable-speed-
  bump effect (§2), though that term works against the deficit rather than
  inflating it.
- **Nothing here measures the fusion against BOTH its ingredients**, which is
  the spec's actual bar (§5).
- R1 never measures **waves 9–10**, where elites concentrate. A confusion effect
  that only matters against late elites is invisible here, and "confusion does
  nothing" must be read as "does nothing in waves 1–8".
- Maze A sits near the `hallHpAuc` ceiling (19% of control runs at the observed
  max), so maze-A magnitudes are compressed.
- **The cross-policy gate is still empty** (only `scripted-v1`). Every reading
  here is provisional on it. This is especially live for confusion: a soft CC
  that steers enemies may well have value a stationary scripted policy cannot
  express, and §5's "do not touch confusion" is a statement about the *defect*,
  not a claim that the mechanic is worthless.
- Split-half rho was declared uninformative in advance and was not used as a
  gate, per the fusion-roster-v2 finding.
