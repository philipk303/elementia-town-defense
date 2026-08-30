# Firestorm projectile conversion — Phase 1 acceptance

**Date:** 2026-08-04 · **Spec:** `docs/plans/2026-08-04-firestorm-projectile-conversion-spec.md`
**Scope:** mechanism conversion only (spec §4). Phase 2's deliberate nerf
(smaller AoE, slower cooldown, shorter range) is NOT in this change.

## What changed

`tickVolley` no longer resolves an instantaneous, un-missable radius scan. It
now: gates on any enemy being in range (unchanged), then fires eight real
`FIRESTORM_BOLT` projectiles on a fan that rotates 22.5° per volley
(deterministic from `cycleSeq`), each with `ownerId: null` (team-owned, no
aggro pull — a real behaviour change from the old scan) and
`category: 'structure'` (no per-bolt `projSpawn` FX, per spec §2b).
`spawnProjectile` now enforces `MAX_PROJECTILES` at spawn (refuse, never
drop-oldest). `damage`, `cooldownMs`, `burn`, and `rangePx` were intended to
stay fixed, but see the calibration below — `damage` moved once, per spec.

## Acceptance criteria (spec §4f)

**1. Hang gate — PASS.** `fusionRoster.js --only FIRESTORM --protocol isolated`,
both mazes, both sitings, both before and after the damage calibration below:
0/144 in every cell (control, wave1, wave4). No soft-lock from the `ownerId:
null` aggro change.

**2. Concurrency/cap — PASS.** `volleyProbe.mjs`: `boltsRefused: 0` in every
cell across both mazes/sitings (44k–48k bolts spawned per maze without ever
touching the 64-projectile budget).

**3. Suite/build — PASS.** 622/624 (2 pre-existing skips), `npm run build`
clean, both before and after calibration.

**4. Output parity — required a calibration.** At unchanged `damage: 8`, the
mechanism swap alone cut maze-B `bodies/volley` (the probe's delivery metric)
from the pre-change baseline:

| siting | pre-change bodies/volley | post-conversion (damage 8) |
|---|---|---|
| flank  | 1.778 | 0.966 |
| funnel | 1.640 | 1.089 |

~40% average reduction — well outside the ~15% band. Calibrated
`damage: 8 → 13` using `damage_new = damage_old × (hits_old / hits_new)`
averaged over the two maze-B sitings (ratio 1.664). Recheck at `damage: 13`:
flank −11.7%, funnel +7.9% of `hits/volley × damage` parity — both inside the
band. (Maze A was not used to fit this: it carries no score effect either
mechanism, so it was never the calibration target, and its own bodies/volley
figures land further outside the band at this damage value — expected, not a
problem.)

**5. Verdict re-read — STOP, do not adjudicate.** Per the spec's own risk #3
("added variance lowers resolution... a post-change 'no verdict' may be the
instrument, not the change") and the standing instruction to stop rather than
adjudicate a marginal or disagreeing read, here are the four maze-B cells,
isolated protocol, post-calibration (`damage: 13`):

| cell | Δ score | Welch t | paired t | sign test p (n) |
|---|---|---|---|---|
| flank w1  | +0.694 | 3.07 | 4.08 | 0.0280 (92) |
| flank w4  | +0.799 | 3.49 | 5.07 | 0.0041 (71) |
| funnel w1 | +0.132 | 0.66 | 1.09 | 0.9099 (78) |
| funnel w4 | +0.208 | 1.00 | 2.09 | 0.0674 (59) — flagged STATISTICS DISAGREE |

Pre-change baseline (isolated protocol, quoted in the build brief) was flank
w1 +0.926 (paired t 4.93), flank w4 +0.931 (paired t 5.75), funnel w1 +0.313
(paired t 2.45), funnel w4 +0.257 (paired t 2.55) — all four cells
significant.

**Read, not adjudicated:** flank stays clearly significant on both windows
(paired t 4.08/5.07), attenuated ~14–25% in magnitude from baseline. Funnel
moved further: w1 lost significance entirely (paired t 1.09, sign p 0.91 —
essentially null, versus a paired-significant +0.313 pre-change); w4 is
marginal and the harness flags Welch/paired/sign-test disagreement on it
(Welch t 1.00 not significant, paired t 2.09 borderline, sign p 0.0674 misses
the conventional 0.05 line). This is a real movement on the funnel siting,
not just added noise around the same estimate — but whether that movement is
the projectile mechanism itself, the parity calibration's imprecision, or
harness resolution at Firestorm's already-small effect size (spec risk #3)
is not adjudicated here per the standing instruction. Flank's persistence
through both windows argues for a real, siting-independent effect surviving
the conversion; funnel's loss of significance is the open question for the
next session.

## Change footprint

`shared/balance.js` (`PROJECTILE.FIRESTORM_BOLT`, `TOWER.FIRESTORM` gains
`volleyBolts`/`boltType`, `damage` 8→13), `server/net/encode.js`
(`PROJECTILE_TYPES` append), `server/game/projectiles.js` (cap enforcement,
FX suppression for structure-owned bolts, `volleyProbe` bolt accounting),
`server/game/structureBehaviors/volley.js` (full rewrite), `test/game/
firestorm.test.js` (full rewrite — flight-based, not instant-hit), `test/net/
encode.test.js`, `test/harness/volleyProbe.mjs` (bolt counters).

Two commits: the mechanism conversion at unchanged numbers, then the damage
calibration, so the two are separately attributable if the calibration needs
revisiting.

**No client changes** — projectiles replicate as entities already; per spec
§3 the eight bolts render with zero new client code.

Phase 2 (the deliberate nerf) is untouched and not started.
