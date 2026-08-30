# Grinder root capture + contact radius tune — and the trap in the result

Date: 2026-08-29. Follows `docs/reviews/2026-08-29-grinder-contact-damage.md`,
which shipped contact damage but could not resolve any effect and diagnosed
dwell time (not damage rate) as the binding constraint. Philip's follow-up:
tune the radius, and root the enemy for 2s before spitting them out, applied
across the suction radius rather than only the crush zone.

**Headline: the combination is a decisive, mechanistically-confirmed win on
maze B (+1.182, t 7.76) and neutral on maze A. But ROOT ALONE IS RESOLVABLY
HARMFUL (-0.262, t 2.83 on maze A). The two dials must never be tuned
independently, and root must never ship without contact damage.**

## What was built

`grind.rootMs: 2000` — crossing INTO the suction radius roots the enemy for
2s, in addition to the pull. `doRootCapture` in
`server/game/structureBehaviors/cycle.js`.

- **Rooted at the SUCTION radius (160px), not the crush zone**, per the
  request. This works because root and knockback are independent axes
  (status.js): root zeroes locomotion, the intake pull IS knockback, so a
  rooted enemy stops walking away while the pull keeps dragging it inward.
  The two compose rather than cancel.
- **One root per crossing, never refreshed while resident** — the same rule
  areaEntry.js's Bog uses. Refreshing every tick would be a permanent
  lockdown for anything that cannot leave the radius, and this project has
  three documented soft-lock classes.
- **Respects `grImmune`**, for the same reason the pull does.
- **Released at the eject** — the contract is "held, THEN spat out", so an
  enemy leaving the machine leaves free. Only this Grinder's own root is
  cleared; a longer root owned by another source (a friendly Bog, an Earth
  Fissure) survives, matching areaEntry.js's ownership rule.

`grind.contactRadiusPx: 55 -> 160` (tuned, see below).

Seven new root tests plus a retargeted position-gate test. One incidental
fixture fix: `makeState` in grinder.test.js omitted `fx`, which is part of
the real state shape — root capture is the first Grinder behaviour to emit an
effect, so it was the first to notice. Suite 912/0/2.

## The radius tune

`grinderContactRadius.js`, 20 dps, paired vs contact OFF, 144 cells/maze:

| radius | maze A (before root) | maze A (with root) | maze B (before root) | maze B (with root) |
|---|---|---|---|---|
| 55px | +0.072 (t 0.91) | +0.060 (t 0.57) | +0.119 (t 0.88) | +0.007 (t 0.05) |
| 80px | +0.046 (t 0.57) | +0.020 (t 0.18) | +0.267 (t 2.03) | +0.043 (t 0.29) |
| 110px | +0.141 (t 1.63) | +0.171 (t 1.44) | +0.200 (t 1.53) | +0.310 (t 2.27) |
| 160px | +0.146 (t 1.28) | +0.253 (t 1.80) | +0.207 (t 1.66) | **+0.774 (t 5.72)** |

**This is the mechanism check, and it passes.** Before root, the sweep was
flat noise with no ordering. With root, it is monotonic and steep on maze B,
reaching t 5.72 — a gradient that only appears once enemies are held long
enough to actually be inside the radius. That is the dwell-time hypothesis
confirmed by a manipulation, not by a correlation. Radius tuned to 160.

Zero hangs in every cell (sign counts sum to 144 everywhere), which was the
explicit safety check — rooting enemies in a lane is the exact shape of this
project's past soft-locks.

## The decomposition — and why it matters

Shipping two dials on one joint reading is how Steam Vent carried an inert
confusion mechanic for weeks (`docs/reviews/2026-08-15-steam-vent-mechanism.md`).
`grinderMechanismDecompose.js` runs four arms against the same
two-ingredient control:

| arm | maze A | maze B |
|---|---|---|
| base (pre-2026-08-29) | -0.039 (t 0.49) | +0.532 (t 3.36) |
| root only | **-0.262 (t 2.83)** | +0.407 (t 2.45) |
| contact only @160 | +0.107 (t 0.93) | +0.738 (t 4.88) |
| **both (shipped)** | -0.009 (t 0.06) | **+1.182 (t 7.76)** |

**Root on its own makes the Grinder resolvably WORSE on maze A, and worse
than base on maze B.** The mechanism is coherent once seen: with nothing in
the field to hurt them, rooted enemies are *parked safely* at whatever
distance they were caught — and since the pull (110 power) is far weaker
than walking, freezing them actually REDUCES how many reach the crush zone.
Root alone makes the original problem worse.

Add contact damage across the whole field and the sign flips hard, because
being frozen anywhere in the field is now lethal. On maze B the pair is worth
+1.182 where the parts sum to about +0.613 — a large positive interaction,
which is exactly what the mechanism predicts.

**The operational consequence: these two dials are not separable.** Anyone
later tuning `rootMs` down toward 0 while leaving `contactDps` alone will
find the structure degrading gracefully; anyone tuning `contactDps` toward 0
while leaving `rootMs` at 2000 will make the Grinder actively bad. That
asymmetry is written into the balance.js comments.

## Status — what is and is not claimed

- **Shipped:** `rootMs: 2000`, `contactDps: 20`, `contactRadiusPx: 160`.
  Better than base on both mazes (maze A -0.039 -> -0.009, maze B +0.532 ->
  +1.182), zero hangs, 912/0/2.
- **Not claimed:** an A1.4(a) verdict. The radius was chosen off a 4-cell
  sweep and the decomposition is a single n=144 read; both are ad-hoc probes,
  not a registered sweep. The t 7.76 on maze B is far too large to be a
  multiplicity artifact, but "this is decisively positive on maze B" is a
  different claim from "this is correctly tuned."
- **Flagged for review:** +1.182 on maze B is a big number, and this is now a
  strong maze split (neutral A, strongly positive B). Per
  `elementia-maze-split-is-the-control` the split is usually the CONTROL's
  swing — the control here reads 7.843 on A against 6.652 on B — so the split
  should not be read as the Grinder being maze-situational without checking
  that first.
- **Next, if pursued:** a registered prereg + bench spec on `rootMs`
  specifically (2000 was the requested value, never swept), and a check on
  whether the maze-B magnitude overshoots what A1.4 wants from a fusion.
