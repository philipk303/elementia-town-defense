# Muddy Bog registered verdict (muddy-bog-r3)

Date: 2026-08-30. Registered family `muddy-bog-r3` (prereg committed 101646a,
after an earlier registeredAt clerical error was caught and corrected --
see "A process note" below). Sweep: 25,600 runs, 0 crashes, store
`test/harness/store/2026-08-30-muddy-bog-r3-v2.jsonl.gz`, JSON export
`docs/reviews/data-muddy-bog-r3.json`.

## Headline

**All three arms clear the Amendment D contribution floor, on BOTH mazes,
on the primary metric (hallHpAuc).** The decision rule only required a
pass on either maze; every cell passed on both. The family was declared
as 18 tests (3 arms x 2 mazes x 3 metrics); on maze B, `score` and
`wavesCleared` turn out to be the same underlying variable (every reached
run there ends at the wave cap, byte-identical mean/sd/sign-count between
the two metrics), so the real breadth of independent evidence is closer to
12 distinct results than 18. This does not change any PASS -- BH under
duplicated tests is conservative, not permissive -- but "18 for 18" would
overstate how much independent confirmation that number represents.

| arm | maze A delta (hallHpAuc) | maze B delta | verdict |
|---|---|---|---|
| muddy-bog (current shipped, no change) | +0.145 (t 10.43) | +0.201 (t 11.57) | PASS/PASS |
| muddy-bog-margin (marginPx 0→15) | +0.169 (t 12.01) | +0.286 (t 16.69) | PASS/PASS |
| muddy-bog-longroot (root ×1.5) | +0.145 (t 10.40) | +0.202 (t 11.59) | PASS/PASS |

All deltas: BH-adjusted q ≈ 0 (correctly computed across all 18 declared
tests, hand-verified), sign test agrees, survives hang-imputation.
n=3200/arm/maze against nRequired 3121. Split-half rho (0.80-1.00) is
reported per the prereg's own template but, per that same prereg, is
declared UNINFORMATIVE and is not a gate -- it is not evidence for these
PASSes, only a record.

hallHpAuc is WAVE-DERIVED (every record here carries
`derivedFromWaves: true`): its value is an integral over the waves a run
actually reached, so later-wave support is conditional on survival, same
caveat analyze.mjs prints on every row. Worth stating plainly rather than
silently, since it is the metric every PASS above rests on.

## What this means

**Muddy Bog was already fixed.** The current shipped configuration --
pulse.damage 28, no margin, root.msByWeight [600,1200,1800,2400], exactly
as it has stood since commit 9ee93ad (2026-08-29) -- clears the floor on
both mazes under a properly powered, registered measurement. The
2026-08-28 verdict ("damage saturates, root saturates, needs a mechanic
review") was accurate when written but described a mechanic (damage gated
on root ownership) that was removed the next day. No mechanic redesign was
needed; re-measuring under registered conditions, as the handoff proposed,
closed the question by itself.

**The margin lever looks like a genuine improvement on top of an
already-passing baseline, but this family cannot register that claim.**
Margin's maze-B delta (+0.286) sits well clear of baseline's (+0.201) --
their 95% CIs, [0.252, 0.319] vs [0.167, 0.235], don't overlap -- which is
suggestive. But margin-minus-baseline was never a declared comparison in
this prereg: the 18 registered tests are all arm-vs-control, not
arm-vs-arm, and the prereg's own scopeLimit clause (4) says directly "this
family CANNOT attribute a PASS between the margin change and the root
change if both happened to pass" -- exactly the situation now. So "margin
beats baseline by ~42%" is a real-looking but UNREGISTERED, exploratory
observation, not a family result, and should not be the basis for a ship
decision without its own registered arm-vs-arm family (cheap to run: same
store, a fourth comparison).

**The longroot lever does essentially nothing**, and this one IS a
registered, both-arms-vs-control finding: baseline and longroot are
statistically indistinguishable from each other (+0.145/+0.202 vs
+0.145/+0.201), and on maze A their raw sign counts are identical
(1355+/1009-) -- meaning per-seed outcomes barely moved at all, not just
the mean. This refutes the mechanism I proposed in conversation (root
duration should extend pulse count, hence damage) -- worth recording as
refuted rather than re-proposing it. The likely explanation: pulse.damage
28 against a goblin's 12 HP (and similar one-shot behavior on most enemy
types) means most enemies are already dead well within the ORIGINAL
600-2400ms root window, so extending it further has nothing left to act
on. A secondary, more speculative possibility -- that knockback can eject
an enemy before its root (and the extra duration) matters -- is plausible
given root/knockback are independent status axes, but is not directly
demonstrated by anything in this sweep and shouldn't be leaned on as an
explanation; the damage-saturation-within-the-existing-window story is
the better-supported one.

## Recommendation

1. **No urgent action required** -- Bog already clears the floor as
   shipped. The stale verdict can be formally retracted.
2. **Do not ship the margin retune yet.** It looks promising but the
   "beats baseline" claim is unregistered (see above); register a small
   arm-vs-arm follow-up family (muddy-bog vs muddy-bog-margin directly,
   same store data can likely be reused) before treating it as a landed
   improvement rather than a lead.
3. **Do not pursue longroot further.** This one IS registered: revert any
   temptation to ship it, it is refuted as a useful lever, not merely
   "not yet proven."
4. **Playtest debt is unchanged and still owed.** pulse.damage 28
   one-shots a full-HP goblin and now also elites via the footprint gate;
   adding a marginPx:15 halo makes the effective threat radius larger
   still. No simulated match judges feel -- flagged, not resolved, by any
   sweep in this document.

## A process note: a registration timestamp bug, caught before it mattered

The prereg was originally committed with `registeredAt: 2026-08-30T18:00:00Z`
-- a guessed placeholder, never checked against the real clock. The first
sweep run (same design, same seeds) actually started at 17:29:23Z, so every
row of that first run read back `EXPLORATORY: registration is
post-registered`. Rather than edit the timestamp after having already seen
the effect sizes -- which would be indistinguishable from gaming the
prereg, even with good intentions -- the first store was parked outside the
repo as an invalidated artifact, the prereg's timestamp was corrected to a
freshly `date -u`-checked real value (17:37:00Z, verified earlier than
this second run's own earliest startedAt), committed as its own commit
(101646a), and the entire 25,600-run sweep was re-run from scratch. The two
runs' point estimates were numerically near-identical (deterministic sim,
same seeds), which is itself a useful cross-check, but only the second run
carries a valid registered verdict.

**New trap for the registered-sweep-mechanics memory**: `registeredAt`
must be a value checked against the real system clock (`date -u`)
immediately before writing it, never composed from memory or guessed as a
round number. This is a fifth gotcha alongside the four already documented.
