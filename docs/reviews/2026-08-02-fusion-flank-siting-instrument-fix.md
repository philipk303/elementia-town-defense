# Task 20 — fusion flank-vs-funnel siting A/B

**Branch:** `codex/redesign-reconciliation` · **HEAD at start:** `ca4a76e` ·
Suite 611/611/2 skipped, `npm run build` clean · **Script:**
`test/harness/fusionRoster.js` (extended, not reinvented) · **Raw data:**
`test/harness/.fusion-roster-funnel.json` (gitignored scratch output, not
committed — reproducible from the script)

Supersedes nothing published; extends
`docs/reviews/2026-08-02-full-fusion-roster-sweep.md` (the "flank" baseline
below), which flagged in its own §0 that every fusion had only ever been
measured flank-sited (`towerSites`), never funnel-sited (`funnelSites`), and
named that as the highest-leverage next fix.

## 0. What changed

`runBuildPolicy` in `test/harness/matchRunner.js` placed the human's free
special — the anchor tile every fusion partner then builds directly below —
using only `towerSites(maze)`. The DEFENSE arm's site list already tried
funnel sites first for a walkable structure; the free-special loop never got
the same treatment. Since every fusion is built on the free special's anchor
tile, this one site list decided where every fusion in the game had ever been
measured.

Fix: `runMatch`/`runBuildPolicy` gained an opt-in `freeSpecialSites` option
(`null`/`'tower'` = unchanged default, `'funnel'` = `funnelSites(maze)`).
Default behavior is byte-identical — confirmed by re-running MAGMA_TRAP under
the default and reproducing the published `+0.100 (t 1.51)` maze-A wave-1
figure exactly. `fusionRoster.js` gained a `--siting flank|funnel` CLI flag
that threads the option through; everything else in the script (seeds,
mazes, arms, stats machinery) is untouched.

## 1. Hang gate — funnel siting, full roster

Same as flank: **0/144 on every arm, every fusion, both mazes** (0/5,184
total). A funnel-sited fusion does sit directly in the lane's flow-field
geometry — the class of change that has produced soft-locks before in this
project — but no hang appeared.

One non-hang anomaly worth flagging: **BLIZZARD, maze B, wave-4 arm built
the combo in 141/144 runs, not 144.** The 3 misses aren't hangs and aren't
mismatched partners — the free special simply failed to find an open funnel
site in those 3 seed/post-gap cells, so those 3 cells silently behaved like
the control arm while still being counted in the wave-4 average. This dilutes
BLIZZARD's maze-B funnel number very slightly toward zero (3/144 ≈ 2% of the
sample); it does not change any sign or significance call below, but it's a
real, small confound the flank siting didn't have (144/144 build success on
every fusion/maze under flank, per the prior review).

## 2. Score effect, flank vs funnel, paired per-cell, wave-4 timing

Flank numbers are the published values from
`2026-08-02-full-fusion-roster-sweep.md` §2. Both are the same seeds, same
mazes, same paired-cell method; only the free-special site list differs.

### Maze A

| fusion | flank Δ (t) | funnel Δ (t) | verdict change |
|---|---|---|---|
| MAGMA_TRAP | +0.113 (1.50) | −0.069 (0.57) | sign flips, neither significant — no change |
| MUDDY_BOG | +0.063 (0.96) | −0.139 (1.13) | sign flips, neither significant — no change |
| GRINDER | +0.020 (0.31) | **+0.493 (4.43)** | flat → strong significant positive |
| STEAM_VENT | −0.176 (1.57) | **+0.368 (2.29)** | negative trend → significant positive (sign flip) |
| FIRESTORM | **+0.454 (3.94)** | +0.429 (2.44) | stays significant positive, magnitude similar |
| BLIZZARD | **+0.219 (2.11)** | **−0.403 (2.77)** | significant positive → significant negative (full reversal) |

### Maze B

| fusion | flank Δ (t) | funnel Δ (t) | verdict change |
|---|---|---|---|
| MAGMA_TRAP | +0.174 (1.11) | +0.313 (1.69) | same sign, neither significant — no change |
| MUDDY_BOG | −0.021 (0.13) | −0.125 (0.62) | same sign, neither significant — no change |
| GRINDER | +0.139 (0.87) | +0.236 (1.26) | same sign, neither significant — no clean verdict yet |
| STEAM_VENT | −0.132 (0.73) | −0.243 (1.15) | same sign, neither significant — no change |
| FIRESTORM | **+0.368 (2.38)** | +0.160 (0.77) | significant positive → not significant (loses replication) |
| BLIZZARD | +0.122 (0.65) | +0.113 (0.44) | same sign, neither significant — no change |

(Wave-1 tables and split-half detail are in
`test/harness/.fusion-roster-funnel.log`, same format as the flank review;
omitted here since wave-4 is the timing this project treats as
representative — see the "fusing at wave 1 is a trap" note in
`matchRunner.js`.)

## 3. Per-fusion read

**BLIZZARD is the headline finding.** Flank siting measured a significant
*positive* on maze A (+0.219, t 2.11); funnel siting measures a significant
*negative* on the same maze, same seeds (−0.403, t 2.77) — the two sitings
don't just disagree, they disagree in a way that would have supported
opposite balance conclusions. This is exactly the FIREPIT-class failure this
project has hit before: a number that reverses depending on where the
instrument sites the structure is a policy artifact, not evidence about the
structure. Maze B stays flat and non-significant under both sitings, so
there still isn't a clean cross-maze verdict — funnel siting didn't resolve
BLIZZARD's ambiguity, it relocated the disagreement from "no signal" to
"contradictory signal."

**STEAM_VENT** moves from "uniformly negative, not individually significant"
(flank) to maze-inconsistent (funnel: significant positive on A, negative
trend on B). Same conclusion as BLIZZARD: siting is a real confound here, not
a minor one, and there is still no honest A1.4(a) verdict.

**GRINDER** picks up a strong, significant positive on maze A under funnel
siting (+0.493, t 4.43) that wasn't there under flank (+0.020, t 0.31), but
stays flat on maze B both ways (+0.139 → +0.236, neither significant). One
maze moving from null to strongly positive while the other stays null is
progress toward a usable reading, not a verdict — GRINDER still needs an
explicit single-maze niche-floor declaration (per Amendment A1.4(a)'s "in its
designed scenario, declared in advance") before maze A's funnel number can be
called anything more than suggestive.

**FIRESTORM**, the one fusion with a clean cross-maze positive under flank
siting, *weakens* under funnel: maze A stays significant (+0.429, t 2.44 vs
+0.454, t 3.94) but maze B loses significance entirely (+0.160, t 0.77 vs
+0.368, t 2.38). Sign stays positive on both mazes at both timings, so
FIRESTORM is still net-positive, zero-skill-dependency evidence — but the
"replicates cleanly across both mazes" claim from the prior review no longer
holds under funnel siting and should be softened.

**MAGMA_TRAP and MUDDY_BOG** stay "approximately nothing" under funnel siting
too — small, sign-flipping, never-significant deltas on both mazes, same as
under flank. This is the strongest kind of confirmation available: an
instrument change that could plausibly have moved these numbers didn't, which
is consistent with them being genuinely inert rather than flank-flattered.

## 4. Conclusion

**Siting is not a minor confound for this class of structure — it is
load-bearing.** At minimum BLIZZARD's number, and to a lesser extent
STEAM_VENT's, flip sign between flank and funnel siting on the same maze,
same seeds. This confirms the prior review's own prediction (§0: "a candidate
root cause for STEAM_VENT's ambiguous negative AND for GRINDER/BLIZZARD's
no-verdict status") rather than ruling it out. No fusion's *balance* was
changed in this session — every number above is a re-measurement of the
existing structures, not a tuning pass.

## 5. Ranked recommendations, for Philip to rule on — nothing here is decided

1. **Declare BLIZZARD's intended scenario before trusting either number.**
   Per Amendment A1.4(a), a niche-floor reading only counts "in its designed
   scenario, declared in advance." If Blizzard's cluster-timing mechanic is
   meant to fire in-lane (funnel), the relevant number is currently a
   significant −0.403 on maze A and needs attention. If flank siting is
   actually representative of how players use it, the original +0.219 stands
   and this session's funnel number is the artifact, not the flank one. This
   project has no record of which the design intends — that has to be
   answered before either number is actionable.
2. **Same declare-before-measuring step for STEAM_VENT and GRINDER.** Funnel
   siting didn't give either a clean verdict — it moved where the ambiguity
   sits. Both remain policy-confounded per the original spec's own framing
   until a scenario is declared and (likely) target-selection/cluster-timing
   policy work happens, which is explicitly out of scope for a siting A/B.
3. **Soften the FIRESTORM "clean positive" claim** in any future summary —
   it's real and net-positive but no longer double-significant across both
   mazes under funnel siting. Treat it as "net positive, single-maze
   significant, zero skill dependency" rather than "established."
4. **No action needed on MAGMA_TRAP or MUDDY_BOG** — both replicate as
   inert under a second, materially different siting policy, which is
   stronger evidence than the original flank-only measurement alone.
5. **This A/B still doesn't resolve GRINDER/BLIZZARD** on its own — it only
   isolates siting as a real, confirmed confound. The remaining
   target-selection/cluster-timing policy gaps the original spec names are a
   separate, larger task, not folded into this session per its own scope
   limits.

## What this session did NOT do

- No balance numbers were tuned. This was instrument correctness work only.
- Wave-1 timing tables and split-half detail were not reproduced in full
  here (available in `test/harness/.fusion-roster-funnel.log`) — wave-4 is
  the project's representative timing per existing convention.
- Did not extend to Water Geyser / Wind Vortex standalone (non-fused)
  measurement or to Rock Trap (not implemented) — out of scope per the
  session's own handoff.
- Did not declare BLIZZARD/STEAM_VENT/GRINDER's intended scenarios — that's
  recommendation 1-2 above, a decision for Philip, not this session.
