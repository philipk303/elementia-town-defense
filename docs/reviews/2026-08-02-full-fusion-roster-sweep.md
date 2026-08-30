# Full six-fusion hang gate + tower-baseline extension — Task 20 step 1

**Date:** 2026-08-02 · **Extends:** `docs/reviews/2026-08-01-tower-baseline-retake.md`
(MAGMA_TRAP only) · **Script:** `test/harness/fusionRoster.js` (new, not a
`.test.js`, same convention as `probe.js`) · **Raw data:**
`test/harness/.fusion-roster-output.json` (gitignored scratch output, not
committed — reproducible from the script)

Every prior fusion measurement in this project — the 2026-07-25 tower
baseline and its 2026-08-01 retake — used a harness where the human is
hardcoded EARTH, so the build policy could only ever reach EARTH+FIRE
(`MAGMA_TRAP`). `humanElement` (added for the Task 16 Steam Vent gate) and
`fuseWith` (added earlier) together make all six pairs reachable, but until
this session nothing had driven them across the **full roster in one
consistent sweep**. This is that sweep: the same paired-arms method the two
prior baselines used — `{fuse:false}` control vs `{fuse:true,fuseWave:1}` vs
`{fuse:true,fuseWave:4}`, 144 cells (72 seeds x 2 posts) per arm per fusion
per maze — generalized to all six combos, with the project's existing
Welch-t + hang-imputation + split-half machinery (`stats.js`), not a new
statistic invented for this doc.

## 0. Declared before measuring (per Amendment A1.4, spec line ~615-637)

The spec requires the scenario and skill dependency to be declared **before**
seeing numbers, precisely because the scripted human never re-sites, sells or
repairs. Reading `shared/balance.js`'s per-fusion comments and the redesign
spec:

| fusion | family | cast/target mechanic | skill dependency |
|---|---|---|---|
| `MAGMA_TRAP` | entryTrigger | passive, crossing-triggered | **zero** — same class as Firepit |
| `FIRESTORM` | volley | passive, radial AoE, no targeting | **zero** |
| `MUDDY_BOG` | areaEntry | passive, crossing-triggered | **zero** |
| `STEAM_VENT` | confusion | passive, proximity cloud | **zero** |
| `BLIZZARD` | targetImpact | auto dense-cluster select, but value depends on **where the locked point falls** | **spec explicitly names it**: "Blizzard (cluster timing)... a sub-1.0 harness number is evidence about the POLICY, not the structure" |
| `GRINDER` | cycle (timed phase machine) | auto pull/crush/eject, but value depends on **site relative to lane geometry** | **spec explicitly names it**: "...and Grinder all have value that a dumb policy cannot express" |

**Consequence declared in advance, per the spec's own instruction**: `MAGMA_TRAP`,
`FIRESTORM`, `MUDDY_BOG` and `STEAM_VENT` numbers below are honest floor-test
evidence, the same status Firepit's falsification test had. `BLIZZARD` and
`GRINDER` numbers are **not** — a low or flat number for either is not
evidence the structure is weak, only that this policy cannot express its
placement-dependent value. This matches the spec's own explicit naming, not
an inference made after seeing results.

**A second, previously undocumented instrument caveat, also declared before
reading the table below**: every fusion in this harness is built at
`towerSites` (the flank sites `runBuildPolicy` uses for the free special and
partner), never at `funnelSites` (the in-lane sites the `defence`/`spendDown`
arm uses for a walkable structure, added for the Firepit falsification test).
All six fusions are `WALKABLE_TYPES`, so — exactly like the pre-fix Firepit —
their true crossing/proximity exposure at this site is unverified here.
`MAGMA_TRAP`'s numbers below reproduce the published retake closely (see §3),
which is reassuring but does not by itself prove exposure is representative;
it only proves this run is consistent with the last one. **This applies
equally to all six fusions and is not fixed in this step** — flagged, not
patched, per the "measurement only" scope for this session.

## 1. Hang-gate regression, full roster — PASSES, 0/5,184

| | control | wave1 | wave4 |
|---|---|---|---|
| every fusion, both mazes | **0/144** | **0/144** | **0/144** |

**Every one of the 5,184 matches this sweep ran (6 fusions x 2 mazes x 3 arms
x 144 cells) completed without a hang or stall.** Per-fusion, per-maze, per-arm
breakdown (all zero, no aggregate hiding a non-zero cell — the exact failure
mode `elementia-spawn-grid-artifact` warns about):

MAGMA_TRAP, MUDDY_BOG, GRINDER, STEAM_VENT, FIRESTORM, BLIZZARD — 0/144 on
maze A and 0/144 on maze B, in all three arms, every one. The A4 hard gate
holds for the complete six-fusion roster, not just the one combo every prior
gate exercised.

`comboFormed` was checked on every non-control match: **144/144 built the
intended combo in every one of the 12 fuse-arm x maze cells** (0 mismatches
anywhere) — the instrument is reaching the fusion it claims to, the same
defect class the Task 16 handoff caught (`fuseWith:'FIRE'` silently building
`MAGMA_TRAP` instead of `STEAM_VENT`) did not recur here.

## 2. Score effect, paired per-cell, both timings, both mazes

Welch t on the 144-cell arrays (same method `classify()` already uses
elsewhere in this harness), hang-imputed (moot here — 0 hangs, imputed
figures are numerically identical to raw), and split-half agreement (does the
sign of the effect match between seeds 1-36 and seeds 37-72).

**Read within a row only.** The control mean differs by scripted-human class
(EARTH baseline ~8.4/7.0, FIRE ~9.1/7.7, WATER ~8.9/7.8) — that's the class,
not the fusion. Only the paired delta inside one fusion's own row is a
fusion effect.

### Maze A (wall row 8, lanes 13/27)

| fusion | wave1 Δ | wave1 t | wave4 Δ | wave4 t | split-half agree (w1 / w4) |
|---|---|---|---|---|---|
| MAGMA_TRAP | +0.100 | 1.51 | +0.113 | 1.50 | true / true |
| MUDDY_BOG | −0.018 | 0.27 | +0.063 | 0.96 | false / true |
| GRINDER | **−0.160** | **2.05** | +0.020 | 0.31 | true / true |
| STEAM_VENT | −0.186 | 1.80 | −0.176 | 1.57 | true / true |
| FIRESTORM | **+0.299** | **2.64** | **+0.454** | **3.94** | true / true |
| BLIZZARD | +0.139 | 1.39 | **+0.219** | **2.11** | false / true |

### Maze B (wall row 8, lanes 5/35)

| fusion | wave1 Δ | wave1 t | wave4 Δ | wave4 t | split-half agree (w1 / w4) |
|---|---|---|---|---|---|
| MAGMA_TRAP | −0.041 | 0.25 | +0.174 | 1.11 | false / true |
| MUDDY_BOG | −0.014 | 0.08 | −0.021 | 0.13 | false / true |
| GRINDER | −0.313 | 1.76 | +0.139 | 0.87 | true / true |
| STEAM_VENT | −0.215 | 1.15 | −0.132 | 0.73 | true / false |
| FIRESTORM | +0.132 | 0.77 | **+0.368** | **2.38** | true / true |
| BLIZZARD | −0.055 | 0.28 | +0.122 | 0.65 | false / true |

Bold = clears t > 2 (the project's `T_CRIT`, ~95% two-sided at this n).

## 3. Reading the table, structure by structure

**MAGMA_TRAP replicates the published retake closely.** Wave-4 effect
+0.113/+0.174 here vs the retake's published +0.064/+0.104 — same sign, same
order of magnitude, both inside noise (t < 2 on both mazes then and now).
This is the useful consistency check: extending the harness with
`humanElement` did not silently change the one fusion already trusted.
**Verdict unchanged: worth approximately nothing, neither trap nor gain, and
that is now confirmed on a second independent run.**

**FIRESTORM is the one structure with a real, replicating effect.**
Wave-4 clears t > 2 on **both** mazes (t 3.94 / 2.38), split-half agrees on
both, and even wave-1 clears significance on maze A (t 2.64) — the timing
penalty every other fusion shows some trace of does not appear here. Skill
dependency is zero (radial volley, no targeting), so per A1.4 this is
trustworthy floor-test evidence, not a policy artifact. **This is a genuine
positive fusion result, the first one this harness has produced for any
combo.**

**STEAM_VENT is negative in all four cells measured (both mazes, both
timings)** — −0.186/−0.176 on A, −0.215/−0.132 on B — and never once turns
positive. No single cell clears t > 2, so this is **not yet an established
effect**, but the total absence of a positive reading anywhere, for a
zero-skill-dependency structure, is the kind of consistent-direction signal
worth a follow-up measurement rather than dismissing as noise. Flagged, not
concluded.

**MUDDY_BOG is flat everywhere** (|Δ| ≤ 0.06 except one 0.02 cell), t < 1 in
every cell, split-half frequently disagrees (expected for an effect this
close to zero — the sign is coin-flip noise around nothing). Zero skill
dependency, so this is a trustworthy verdict: **another "worth nothing"
fusion**, same class as MAGMA_TRAP.

**GRINDER repeats the wave-1-is-a-trap pattern** seen in the original
MAGMA_TRAP baseline (−0.160 t 2.05 on A, −0.313 t 1.76 on B — A just clears
significance, B doesn't quite) but goes flat/mildly-positive by wave 4 (+0.020
/ +0.139, neither significant). **This is explicitly a policy-confounded
structure per §0 — no verdict on GRINDER's actual power is available from
this harness.** The wave-1 pattern is at least consistent with the
established "don't fuse on wave 1" finding, which is itself a timing
statement, not a power statement.

**BLIZZARD is mixed and inconsistent between mazes**: wave-4 clears
significance on A (+0.219, t 2.11) but not on B (+0.122, t 0.65), and
wave-1 doesn't clear on either. **Also explicitly policy-confounded per
§0.** The A result is suggestive but, per spec, cannot be read as a floor-test
verdict — Blizzard's real value depends on cluster-timing siting this policy
never attempts.

## 4. What this step does NOT establish

- No claim here is a balance change. This is measurement only, per the
  session's scope.
- BLIZZARD and GRINDER have **no honest A1.4(a) niche-floor verdict** from
  this or any harness run to date — that requires either a policy taught to
  exploit their positioning, or a hand-placed scenario, neither of which
  exists yet.
- The flank-siting caveat in §0 applies to all six numbers equally and is
  unresolved. If a future session wants to test whether in-lane siting
  changes any of these (especially STEAM_VENT's consistent negative or
  FIRESTORM's positive), that is new instrument work, not a re-read of this
  data.
- Win rate is not reported here — as established since the walkable-structure
  work (session 7 of `elementia-phase8-plan`), win% on this maze/policy
  combination is too thin to read; all claims are on score, matching every
  fusion baseline before this one.
- This is one sweep, not a replication across independent runs (beyond the
  built-in split-half check). The MAGMA_TRAP consistency check in §3 is the
  only cross-run replication available.

## 5. Ranked recommendations, for Philip to rule on — nothing here is decided

1. **No action needed on MAGMA_TRAP or MUDDY_BOG.** Both replicate as
   "approximately nothing," consistent with prior findings and each other.
2. **FIRESTORM's positive, replicating, zero-skill-dependency result is worth
   noting as a genuine outlier** — it is the only fusion with a real
   measured effect. Whether that's a good thing (the redesign finally
   produced one fusion worth building) or something to watch (is it now
   *too* good relative to a Watchtower trade) is a judgment call, not
   something this data resolves alone — no comparison against the
   Watchtower-solo A1.4 anchor was run for FIRESTORM specifically.
3. **STEAM_VENT's uniformly-negative-but-not-significant pattern deserves a
   dedicated re-measurement** (larger n, or the in-lane siting fix) before
   being called either a real effect or noise — right now it's neither
   confirmed nor ruled out.
4. **GRINDER and BLIZZARD need policy or scenario work before their power
   level can be judged at all**, per the spec's own explicit naming. Building
   that (a build-policy extension that re-sites for cluster targeting /
   pull-eject geometry, or a hand-placed scenario harness) is real scope, not
   a quick follow-up.
5. **The flank-vs-funnel siting question (§0) is a candidate root cause for
   #3 and #4 simultaneously** and might be the highest-leverage single fix if
   Task 20 continues — but confirming that needs its own controlled A/B (site
   flank vs site funnel, everything else held constant), not an assumption.

Nothing above is a ruling. If nothing here needs fixing before Task 20
continues, that's a legitimate reading of this data — FIRESTORM is the only
structure asking for attention, and even that is "note it," not "change it."
