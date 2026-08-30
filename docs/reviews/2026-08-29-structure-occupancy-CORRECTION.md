# CORRECTION — structure occupancy audit, Firepit and Water Geyser findings

Date: 2026-08-29. This supersedes the Firepit and Water Geyser conclusions in
`docs/reviews/2026-08-29-structure-occupancy-step1-2.md` and
`-followup.md`. Triggered by Philip asking whether a "more of the same
tower" test would be more valid than the fusion-vs-free-special comparison
this audit had drawn — checking that question surfaced two real measurement
bugs. **Do not cite the Firepit or Water Geyser numbers in the earlier two
docs; use this one instead.** The Grinder finding and the Steam Vent
finding are unaffected — see "what still stands" below.

## Bug 1: step 1's Firepit read mixed fused and unfused records

The four archives read in step 1 each contain multiple `armId` arms — some
where Firepit exists as a standalone/unfused structure (`comboFormed ===
null`), others where the Fire+Earth (or Fire+Wind, Fire+Water) pairing
fused into Magma Trap / Firestorm / Steam Vent instead — meaning **no
Firepit exists in those records at all**. `aoeActiveTicks` is trivially ~0
in a fused record, not because enemies avoided it but because there is
nothing there to avoid. Step 1's script summed both kinds of record
together without checking `comboFormed`, which inflated the apparent
miss rate.

Splitting `2026-08-16-fusion-r2-magma-trap.jsonl.gz` by arm confirms it:

| arm | n | comboFormed | zero-occupancy |
|---|---|---|---|
| control (Firepit genuinely built) | 6000 | always null | 169/6000 = **2.8%** |
| magma-trap (fused away, no Firepit) | 6000 | always MAGMA_TRAP | 3910/6000 = 65.2% (meaningless — nothing to occupy) |

The real, corrected Firepit occupancy — freshly measured at its actual
anchor site (`freeSpecial:true, humanElement:'FIRE'`, 72 seeds x 2 mazes x
2 postGaps via `test/harness/archive/firepitSitingIsolate.js`):

| maze | zero-occupancy |
|---|---|
| A | 0/144 = **0.0%** |
| B | 4/144 = **2.8%** |

**Firepit is not broken.** The original "34-61% never touched" claim was a
data-filtering bug, not a property of the structure or its siting.

## Bug 2: the Water Geyser follow-up used a different placement mechanism than the thing it was compared against

The follow-up built Water Geyser via `defence:'WATER_SPECIAL', spendDown:true`
— the walkable-defence loop, which places as many copies as gold allows
across a 10-row-deep site column. Muddy Bog and the other fusions it was
being compared against are placed via the anchor/free-special mechanism —
one placement, 4 rows deep, directly below the human's own special. These
are genuinely different site pools, not the same test run twice, so the
"fusion vs free-special" framing built on top of that comparison was never
apples-to-apples.

Re-measured with `test/harness/archive/sameSiteFuseCheck.js`, which holds
the site fixed (same seed, same anchor tile — verified 144/144) and varies
only fused-vs-not, using the codebase's own two-ingredient control
(`freeSpecial:true, partnerSpecial:X, fuse:false`):

| pair | unfused (2 ingredients, same site) | fused |
|---|---|---|
| EARTH+FIRE (Magma Trap) maze A | 0.7% miss | 0.0% miss |
| EARTH+FIRE (Magma Trap) maze B | 1.4% miss | 1.4% miss |
| EARTH+WATER (Muddy Bog) maze A | 6.3% miss | 0.0% miss |
| EARTH+WATER (Muddy Bog) maze B | 2.8% miss | 1.4% miss |

**Water Geyser, sited the same way Bog/Magma Trap are sited, is not
broken either.** Both fused and unfused sit in the single low digits.
There is no fusion-vs-free-special divide here — Philip's original
question ("wouldn't the fusion also miss if it were sited like Firepit")
was the right question, and the honest answer is: when tested at the
*same* site, neither one misses much. My original claim that fusion
status explains the difference does not hold up; it was an artifact of
testing the two conditions through different site-selection code.

One real (much smaller) distinction did survive: retested Firepit and
Water Geyser both through the `defence`+spendDown mechanism, same
protocol, same 72 seeds (`test/harness/archive/firepitSitingIsolate.js`):

| structure via defence+spendDown | maze A occTicks | maze B occTicks | zero-occupancy |
|---|---|---|---|
| Firepit (has a margin buffer) | 0.361 | 0.536 | 0.0% both mazes |
| Water Geyser (exact footprint, no margin) | (from the earlier followup doc) 0.007 | 0.002 | 36.8% / 69.4% |

Firepit's `marginPx` field genuinely helps it get touched even at a
site-pool this deep; Water Geyser's zero-margin exact-footprint selection
does not get that same buffer. That is a real, narrower finding than the
original one — a margin vs. no-margin difference under a specific,
deep, multi-copy siting mechanism, not a general "Water Geyser is broken"
claim, and not something with practical relevance to how Water Geyser is
actually built in the shipped game (one placement, at its own site, not
ten rows of spend-down copies).

## What still stands, unaffected

- **Grinder's pull-to-crush landing rate (11.3-40.1%)** — measured this
  session with fresh instrumentation (`state.grinderStats`), not read from
  old archives, and does not depend on which siting mechanism was used.
  This is a real, confirmed finding.
- **Steam Vent's clean result (0-2.8% miss)** — was always tested via
  `fuse:true` (the correct anchor mechanism) from the start, so it was
  never exposed to either bug.
- **Bog and Magma Trap's step-2 result (98.6-100% crossed)** — was always
  a single, self-consistent `fuse:true` run, never mixed with fused/unfused
  archive data. Confirmed again by this correction's own re-test.
- **Step 3's range/radius reach checks** (Watchtower, Rock Trap, Snare
  Post, Firestorm, Blizzard, Wind Vortex) used the same `defence`+spendDown
  mechanism as the flawed Water Geyser test — worth flagging as a
  methodological note, not a retraction: those numbers describe "does at
  least one of several built copies ever get touched," which is a
  reasonable question on its own, but is not the same question as "does a
  single instance at its own site get touched." Given how forgiving a
  75-160px radius already is, this is unlikely to change the verdict, but
  it was not re-verified with a single-instance test the way Firepit was
  here.

## Corrected roster status

| structure | corrected verdict |
|---|---|
| Firepit | **clean** (was: broken — correction) |
| Water Geyser | **clean at its real site** (was: broken — correction); a narrower margin-vs-no-margin gap survives only under the deep multi-copy defence mechanism, which isn't how it's actually built in play |
| Muddy Bog, Magma Trap | clean (unchanged) |
| Steam Vent | clean (unchanged) |
| Watchtower, Rock Trap, Snare Post, Firestorm, Blizzard | clean (unchanged, caveat above) |
| Wind Vortex | clean on maze A, 89.6% on maze B (unchanged, same caveat) |
| Grinder | **broken — 11.3-40.1% pull-to-crush landing rate (unchanged, the one real finding)** |

The audit's actual yield, after correction, is narrower than first
reported: **one confirmed structural problem (Grinder), not three.** That
is a smaller result than the original write-up claimed, but it is the
correct one.
