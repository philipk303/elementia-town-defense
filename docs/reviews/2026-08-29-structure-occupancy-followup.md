# Structure occupancy audit — follow-up (Water Geyser, Steam Vent)

**SUPERSEDED for the Water Geyser finding — see
`docs/reviews/2026-08-29-structure-occupancy-CORRECTION.md`.** This doc's
Water Geyser test was built via a different placement mechanism
(`defence`+spendDown, many copies, 10 rows deep) than the fusions it was
compared against (single anchor placement, 4 rows deep) — not the same
experiment, despite the framing below. Water Geyser, tested at its real
anchor site, is not broken. The Steam Vent finding is unaffected and still
holds.

Date: 2026-08-29. Follow-up to `docs/reviews/2026-08-29-structure-occupancy-step1-2.md`
and `-step3-4.md`. Prompted by Philip asking whether the pattern found so far
justified testing more structures — the answer given was: not "more fusions"
broadly, but specifically Water Geyser and Steam Vent, since the handoff's
own classification table flags both as sharing Firepit's exposure
(footprint + margin, non-crossing target selection) and neither had been
measured.

## Instrumentation added

Same `activeTicks`/`enemySeconds` idiom as every prior step, opt-in via
`state.displaceStats` (Water Geyser, `server/game/structureBehaviors/displacement.js`)
and `state.scaldFieldStats` (Steam Vent, `structureBehaviors/scaldField.js`).
One correction needed for Water Geyser specifically: its own occupancy scan
was gated behind the same cooldown check as its attack logic
(`if (now < s.attackReadyAt) return`), which would have undercounted
occupancy while on cooldown — moved the occupancy probe ahead of that gate,
same fix Watchtower's `sampleRangeReach` needed in step 3. Full suite
897/0/2 after the change.

## Result

Measured with `test/harness/archive/occupancyCheck2.js`, 72 seeds x 2
postGaps x 2 mazes = 144 runs per structure per maze:

| structure | maze | fraction fight-ticks occupied | fraction enemy-seconds in field | zero-occupancy matches |
|---|---|---|---|---|
| Water Geyser | A | 0.0069 | 0.0007 | 53/144 (36.8%) |
| Water Geyser | B | 0.0021 | 0.0003 | 100/144 (69.4%) |
| Steam Vent | A | 0.0312 | 0.0032 | 0/144 (0.0%) |
| Steam Vent | B | 0.0446 | 0.0044 | 4/144 (2.8%) |

**Verdict: the prediction split exactly as expected, and for the reason
predicted.** Water Geyser is broken the same way Firepit is — a free
special placed by the build policy, with no guarantee its footprint sits on
the enemy's actual path. On maze B, 69% of matches never see a single
enemy in its footprint at all; every Water Geyser balance number this
project has ever published shares Firepit's problem. Steam Vent, despite
having a margin like Firepit's, is clean — 0-2.8% zero-occupancy, in the
same range as Bog and Magma Trap. The difference is siting mechanism, not
margin size: Steam Vent is a FUSION, built at the human element's own
structure site (which the build policy already placed in-lane for its own
reasons), not a free-special site chosen independently. This confirms the
distinction drawn when deciding to test these two: the risk factor is
**how the structure got sited**, not fusion-ness, not margin size, and not
family alone.

## Audit status: complete for the roster's known-uncertain structures

| structure | verdict |
|---|---|
| Firepit | broken — 34-61% never touched (step 1) |
| Muddy Bog, Magma Trap | clean — 98.6-100% crossed (step 2) |
| Watchtower, Rock Trap, Snare Post, Firestorm, Blizzard | clean — ~100% reached (step 3) |
| Wind Vortex | clean on maze A, 89.6% on maze B (step 3) |
| Grinder | broken — 11.3-40.1% pull-to-crush landing rate (step 4) |
| Water Geyser | **broken — 36.8-69.4% never touched (this follow-up)** |
| Steam Vent | **clean — 0-2.8% never touched (this follow-up)** |

Three structures are now confirmed to be measuring against a
frequently-inert mechanism: **Firepit, Water Geyser, and Grinder**. Any
future balance work on these three should treat every historical number as
suspect until re-measured with the siting problem fixed (or at minimum,
re-measured with occupancy reported alongside the score so a bad cell can be
distinguished from a genuinely weak structure). This instrumentation is
reusable for that re-measurement — no more one-off scripts needed to check
"did it work this time."
