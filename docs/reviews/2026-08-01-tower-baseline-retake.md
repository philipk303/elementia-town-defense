# Tower baseline retake — after consensual fusion (Task 13)

**Date:** 2026-08-01 · **Supersedes §3 of:** `2026-07-25-tower-baseline.md` ·
**Change under measurement:** fusion is now a consent-gated proposal, on top of
Tasks 8-12's rebuilt individual structures.

A5 step 5 requires this: *"every existing fusion number is void the moment this
lands; that is expected, not a defect."* Same design as the original — paired
per-cell against a no-fusion control, 144 cells (72 seeds x 2 posts) per maze,
arms differing in exactly one thing.

## Result

| | maze A | maze B |
|---|---|---|
| control, no fusion | score 8.384 ± 0.574, win 0.7% | score 7.049 ± 1.366, win 0.0% |
| fusion @ wave 1 | **+0.012 (t 0.23)** — 23 better / 23 worse | **+0.056 (t 0.57)** — 28 / 26 |
| fusion @ wave 4 | **+0.064 (t 1.16)** — 31 better / 24 worse | **+0.104 (t 0.79)** — 35 / 35 |

144/144 cells fused in both fusion arms, on both mazes. `MAGMA_TRAP` in every
one — same single combo as the original baseline, so this is still not secretly
a GRINDER number.

Hangs **0/144 on both mazes in all three arms** (432 matches per maze). The A4
hard gate holds.

## What changed since 2026-07-25

The headline movement is not fusion's value going up. It is **the wave-1
penalty disappearing**:

| | old (2026-07-25) | now |
|---|---|---|
| fusion @ wave 1, maze A | −0.228 (t −2.23) | +0.012 (t 0.23) |
| fusion @ wave 1, maze B | −0.391 (t −2.59) | +0.056 (t 0.57) |
| fusion @ wave 4, maze A | +0.045 (t 0.58) | +0.064 (t 1.16) |
| fusion @ wave 4, maze B | −0.116 (t −1.12) | +0.104 (t 0.79) |

Early fusion used to be a real, replicated loss on both layouts. It no longer
is. The most likely cause is not this task: Tasks 9-12 replaced all four
individual elemental structures (Snare Post aura, Rock Trap telegraph, Water
Geyser launch, Wind Vortex cycle) and the walkable/footprint work changed what
the opening purse buys. The consent gate itself adds no cost — the scripted
policy answers its own proposal in the same build phase it opens it.

**The finding that framed the redesign still stands, in its corrected form:
fusion is worth approximately nothing.** It is no longer a bad *trade* at any
timing tested, but it is not yet a good one either — every arm is inside noise.
Nothing here should be read as fusion having been fixed; the six fusion
BEHAVIORS are still Task 14-15 work, and `MAGMA_TRAP` is measured with its
pre-redesign spec.

## What this does not say

Unchanged caveats from the original, all still live: one combo, one placement,
one dumb policy; the scripted human never re-sites, sells or repairs; and only
one special is ever built.

**New caveat specific to this task.** The harness exercises the *solo* consent
path only. Both ingredients are placed by the same scripted human (a human may
build any bot element's special), so `requiredIds` is one player and one accept
completes the proposal — Amendment A1.2's human-on-behalf-of-bot case. The
two-human consent path, rejection, timeout, disconnect, stale ingredient,
duplicate response and concurrent proposal are covered by
`test/game/combos.test.js` and end-to-end over real sockets in
`test/net/smoke.test.js`, not by any measurement here.

## Reproduction

Not committed as a script — the paired arms are three `runMatch` option sets
over `scenarioMatrix()`, the same shape the original baseline used:
`{fuse:false}`, `{fuse:true,fuseWave:1}`, `{fuse:true,fuseWave:4}`, scored on
`m.score`, cells where either arm hung excluded from the pairing (none did).
