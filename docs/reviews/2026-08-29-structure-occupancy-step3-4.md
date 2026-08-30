# Structure occupancy audit — steps 3 & 4 result

Date: 2026-08-29. Follow-up to `docs/handoffs/2026-08-29-structure-occupancy-audit.md`
and `docs/reviews/2026-08-29-structure-occupancy-step1-2.md` (steps 1/2:
Firepit confirmed broken, Bog/Magma Trap cleared).

## Step 3 — range/radius structures (single "ever in range" check)

Added `sampleRangeReach` to `server/game/towers.js`: a single per-tick
distance check against each structure's own reach field (`radiusPx` for the
aura/cycle families, `rangePx` for targetImpact/volley/plain-ranged), opt-in
via `state.rangeStats` (a Map keyed by structure id), latching `true` the
first time any enemy is found within reach and never re-scanning that
structure again. Cheap by design, per the handoff's own instruction — this
tier doesn't need per-tick occupancy accounting, just a boolean. Wired
through `matchRunner.js` as `m.rangeReach` (array of `{structureType,
everInRange}`).

Measured with `test/harness/archive/rangeReachCheck.js`, 72 seeds x 2
postGaps x 2 mazes = 144 runs per structure per maze:

| structure | maze A | maze B |
|---|---|---|
| Watchtower | 144/144 (100.0%) | 144/144 (100.0%) |
| Rock Trap (EARTH_SPECIAL) | 144/144 (100.0%) | 144/144 (100.0%) |
| Snare Post | 144/144 (100.0%) | 144/144 (100.0%) |
| Wind Vortex (WIND_SPECIAL) | 144/144 (100.0%) | 129/144 (89.6%) |
| Firestorm (FIRE+WIND) | 144/144 (100.0%) | 144/144 (100.0%) |
| Blizzard (WATER+WIND) | 144/144 (100.0%) | 144/144 (100.0%) |

**Verdict: cleared, with one exception.** Every range/radius structure
checked gets at least one enemy within reach in effectively every match —
confirming the handoff's own prediction that radii of 75-150px are far more
forgiving than a 1-2 tile exact footprint. The one exception is Wind Vortex
on maze B, where roughly 1 in 10 matches never get an enemy within its
150px suction radius at all — small enough that it isn't the roster-wide
problem Firepit is, but real enough that it's worth a note if Wind Vortex's
own numbers are ever in a close call on maze B specifically.

## Step 4 — Grinder (pull-vs-crush landing rate)

This was not a "should we check" — `shared/balance.js`'s GRINDER comment
already names the exact question: does the outer pull reliably land enemies
in the inner crush zone, or does a real fraction of what it grabs escape
before the crush resolves? Added tracking to
`server/game/structureBehaviors/cycle.js`: `s.grPulledThisCycle` (a Set,
built during the INTAKE phase's pull pulses) compared against `doCrush`'s
own candidate list at CRUSH-phase entry, accumulated into
`state.grinderStats` (opt-in, same convention as the others) as `cycles`,
`pulled`, `crushed`, `pulledAndCrushed`.

Measured with the same script, same 72-seed sample, summed across all
cycles in all matches:

| maze | cycles | total pulled | total crushed | pulled → landed in crush zone | crushed had been pulled this cycle |
|---|---|---|---|---|---|
| A | 2049 | 5754 | 651 | **11.3%** | 100.0% |
| B | 1658 | 1712 | 687 | **40.1%** | 100.0% |

**Verdict: confirmed, and worse than the comment implied.** On maze A,
nearly 9 out of every 10 enemies the outer pull touches are gone by the time
the crush resolves — pulled toward the center, then walking, knocked, or
dying their way back out of the 55px inner zone before the cycle's crush
fires. Maze B is meaningfully better (40% land) but still means most pulled
enemies escape. The "crushed had been pulled" column confirms the
mechanism is behaving as designed in the sense that nothing gets crushed
without first being pulled (100% in both mazes) — this is not a bug in the
crush trigger, it's the outer-pull-to-inner-zone conversion that's weak.
This directly explains why Grinder's `-0.035` maze-A result was never
trusted: on maze A specifically, the pull is doing most of its work for
nothing.

This number does not by itself say what to change (pull power, outer/inner
radius ratio, pulse cadence, intake duration) — that's a retune decision,
not an audit finding. It does mean any future Grinder retune should treat
this landing rate as the thing to move, and should re-measure it after any
change the same way (the instrumentation is reusable, not a one-off script).

## Audit status: all four planned steps complete

| step | structure(s) | verdict |
|---|---|---|
| 1 | Firepit | confirmed broken — 0.2% occupied time, 34-61% of matches never touched |
| 2 | Muddy Bog, Magma Trap | cleared — 98.6-100% of matches crossed at least once |
| 3 | Watchtower, Rock Trap, Snare Post, Wind Vortex, Firestorm, Blizzard | cleared, except Wind Vortex maze B at 89.6% |
| 4 | Grinder | confirmed broken, worse than suspected — 11.3-40.1% pull-to-crush landing rate |

**Not covered, and worth flagging for a future session:** Water Geyser and
Steam Vent share Firepit's exposure (footprint + margin, non-crossing
target/damage selection) per the handoff's own classification table, and
were never separately measured here — this audit ran the free Firepit read
(step 1), then extended the SAME instrumentation idiom to the structures the
handoff's sequence named next (steps 2-4). Water Geyser and Steam Vent were
lower priority in the handoff and still are, but they are the two remaining
unknowns in the roster's occupancy picture.
