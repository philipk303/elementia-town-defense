# Firestorm projectile conversion — Phase 2 acceptance

**Date:** 2026-08-04 · **Spec:** `docs/plans/2026-08-04-firestorm-projectile-conversion-spec.md` §5
**Scope:** the deliberate nerf, on top of the Phase-1 output-parity baseline
(`docs/reviews/2026-08-04-firestorm-projectile-conversion-phase1.md`).

## What changed

`shared/balance.js`, geometry/cadence only — `damage` (13, Phase-1 calibrated)
untouched, per the spec's own table (damage is a last-resort lever, "only if
the three above are not enough"):

| lever | from (Phase 1) | to (Phase 2) | rationale |
|---|---|---|---|
| `TOWER.FIRESTORM.cooldownMs` | 700 | 900 | "slower refresh" |
| `TOWER.FIRESTORM.rangePx` | 100 | 88 | "shorter range" — a mild trim per spec §1a, not the 150–225 a naive reading would give |
| `PROJECTILE.FIRESTORM_BOLT.maxRangePx` | 100 | 88 | moved with `rangePx` — the two must track each other or the in-range gate fires at range the bolts can't physically reach |
| `PROJECTILE.FIRESTORM_BOLT.aoeRadiusPx` | 16 | 12 | "AoE reduced on impact" — raises miss chance further |

`test/game/firestorm.test.js`'s `bolt0Target` fixture distance was
re-brute-forced (17px, was 43px) because it depends on the exact interaction
between the tick-quantized flight step, the enemy hit-trigger radius, and
`aoeRadiusPx` — the same geometry Phase 2 deliberately moved. No test logic
changed, only the calibration constant.

## Acceptance criteria (spec §4f, minus criterion 4 per §5 — output parity is
not the target here, the point is to move it)

**1. Hang gate — PASS.** `fusionRoster.js --only FIRESTORM --protocol
isolated`, both mazes, both sitings (`tower`="flank", `funnel`): 0/144 in
every cell (control, wave1, wave4). No regression from the reduced range/AoE
or the slower cadence.

**2. Concurrency/cap — PASS.** `volleyProbe.mjs`: `boltsRefused: 0` in every
cell, both mazes, both sitings (22k–31k bolts spawned per maze/siting
combination across the 72-seed run, nowhere near the 64-projectile budget).
The longer cooldown only widens this margin versus Phase 1.

**3. Suite/build — PASS.** 622/624 (2 pre-existing skips), `npm run build`
clean.

**5. Verdict re-read — matches the spec's stated expectation.** The four
maze-B cells, isolated protocol:

| cell | Δ score (Phase 2) | Welch t | paired t | sign p (n) | Δ score (Phase 1 baseline) |
|---|---|---|---|---|---|
| flank w1  | +0.424 | 1.85 | 2.78 | 0.3261 (84) — DISAGREE | +0.694 |
| flank w4  | +0.389 | 1.64 | 2.83 | 0.2529 (62) — DISAGREE | +0.799 |
| funnel w1 | +0.049 | 0.24 | 0.39 | 1.0000 (81) | +0.132 |
| funnel w4 | -0.035 | 0.16 | -0.34 | 1.0000 (53) | +0.208 |

**Read, not adjudicated:** every cell weakened relative to the Phase-1
baseline, and disagreement between Welch/paired/sign widened rather than
narrowed. Flank — the only siting that was unambiguously significant post-
Phase-1 (paired t 4.08/5.07) — is now Welch-non-significant on both windows
(t 1.85/1.64) with a sign test that no longer clears 0.05 (p 0.33/0.25),
while its paired t (2.78/2.83) still nominally clears the conventional
threshold: the same three-statistic disagreement pattern the spec flagged as
a possible instrument artifact (risk #3) now appears on both flank cells, not
just funnel w4. Funnel, already the weaker siting after Phase 1, is now
indistinguishable from noise on both windows (Δ ~0.05, ~-0.04; sign p 1.0 on
both).

This is the outcome the spec named as most likely (§5): "not resolvable...
which would leave the roster with zero passing fusions against the A1.4(a)
bar." Per the six-fusion isolated retake
(`docs/reviews/2026-08-04-fusion-sweep-isolated-retake.md`), Firestorm was
the only fusion passing A1.4(a) before this change. **No fusion in the
roster currently passes A1.4(a) after Phase 2.** This is a legitimate design
outcome per the spec — Philip's requested nerf was applied and measured
faithfully — but it is a status change worth surfacing explicitly rather than
letting it sit implicit in a table.

## Change footprint

`shared/balance.js` (`TOWER.FIRESTORM.cooldownMs`/`rangePx`,
`PROJECTILE.FIRESTORM_BOLT.maxRangePx`/`aoeRadiusPx`), `test/game/
firestorm.test.js` (`bolt0Target` fixture distance recalibrated, comment
updated — no test logic changed).

One commit, separate from both Phase 1 commits, per the spec's attribution
requirement (§8).

**No client changes.**
