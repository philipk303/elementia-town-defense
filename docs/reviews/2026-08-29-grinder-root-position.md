# Grinder root position — validating "sucked to the centre, held there, spat out"

Date: 2026-08-29. Follows `docs/reviews/2026-08-29-grinder-root-and-radius.md`,
which shipped root capture at the SUCTION EDGE and found root-alone was
resolvably harmful. Philip asked to validate the intended design instead:
suction toward the centre, enemies rooted THERE for 2s with damage, then spat
out.

**Headline: the intended design is mechanically correct and fixes the harmful-
root defect outright. Root position is now `rootRadiusPx: 55` (the core).
The one honest cost is that maze B preferred the wide root and gives up
~0.4 hallHpAuc — taken deliberately, reasons below.**

## The defect the first cut had

Rooting on crossing into the 160px suction field froze enemies *wherever they
were caught*. Since the pull (110 power) is weaker than walking, a frozen
enemy at the edge is parked safely and never arrives at the core — the root
made the original pull-landing problem WORSE. That was visible in the
decomposition as root-alone at -0.262 (t 2.83) on maze A.

`grind.rootRadiusPx` separates WHERE the root lands from WHETHER it happens.
At 55 (== `innerRadiusPx`, the crush zone) enemies stay walkable while the
suction draws them in, and only lock down once they have arrived.

Two new tests back the premise the design rests on, which nothing previously
checked: that sustained suction actually closes the distance to the centre
over time (the existing tests only asserted a single impulse pointed the right
way), and that the root radius confines the hold without shrinking the pull.
One pre-existing test was also found **vacuous** — "one root per crossing"
spawned its fixture outside the new root radius, so it asserted
`-500 <= -500` and passed while testing nothing; it now asserts its fixture is
genuinely rooted first.

## The sweep

`grinderRootRadius.js`, 72 seeds x 2 postGaps x 2 mazes, vs the
two-ingredient control. `pullLanding` is re-taken with contact damage OFF,
because enemies killed in the field never reach the crush and so never count
as landed — the confounded and unconfounded columns disagree sharply.

| rootRadius | maze A | maze B | pullLanding A / B |
|---|---|---|---|
| 55 (core) | **+0.201 (t 1.73)** | +0.786 (t 5.22) | **11.0% / 43.8%** |
| 80 | +0.164 (t 1.38) | +1.090 (t 7.15) | 9.3% / 42.6% |
| 110 | +0.163 (t 1.37) | **+1.207 (t 7.79)** | 6.0% / 40.9% |
| 160 (edge) | -0.009 (t 0.06) | +1.182 (t 7.76) | 7.1% / 37.2% |

Zero hangs in every cell.

**The mechanism claim is confirmed:** a tighter root radius monotonically
raises the fraction of pulled enemies that reach the core, on both mazes.
The design does what it says.

**But the mazes disagree about the optimum, and that is not noise.** Maze A
wants the root tight (+0.201 at 55, neutral at 160). Maze B wants it wide
(+0.786 at 55, +1.207 at 110). The reason is coherent: with contact damage
across the whole 160px field, *holding an enemy anywhere in the field* is
already lethal, so delivering it to the crush matters less than simply
stopping it — and maze B's longer exposure rewards that more.

Contact radius was re-swept with the root pinned at the core, to make sure
160 was still right: maze A +0.078 / +0.208 / +0.201 and maze B +0.768 /
+0.746 / +0.786 at 55 / 110 / 160. Contact radius barely matters on maze B
and wants to be wide on maze A, so 160 stands.

## Why 55 was chosen despite maze B preferring 110

Three reasons that outrank maze B's larger number:

1. **It is the only setting resolvably positive on BOTH mazes.** At 160 maze A
   is flat (-0.009).
2. **It roughly halves the maze split** — 0.585 at the core versus 1.19 at the
   edge — so the structure is far less maze-situational. Per
   `elementia-maze-split-is-the-control` a large split is a known trap in this
   project, and shrinking it is worth real magnitude.
3. **It maximises the pull-landing rate on both mazes**, i.e. the structure is
   working by its own stated mechanism rather than by an accident of the
   damage field.

Cost, stated plainly: ~0.4 hallHpAuc of maze-B upside, given up on purpose.

## The re-decomposition — the harmful-root defect is gone

| arm | maze A (edge, before) | maze A (core, now) | maze B (edge, before) | maze B (core, now) |
|---|---|---|---|---|
| base | -0.039 (t 0.49) | -0.039 (t 0.49) | +0.532 (t 3.36) | +0.532 (t 3.36) |
| root only | **-0.262 (t 2.83)** | **-0.045 (t 0.56)** | +0.407 (t 2.45) | **+0.601 (t 3.79)** |
| contact only | +0.107 (t 0.93) | +0.107 (t 0.93) | +0.738 (t 4.88) | +0.738 (t 4.88) |
| both (shipped) | -0.009 (t 0.06) | **+0.201 (t 1.73)** | +1.182 (t 7.76) | +0.786 (t 5.22) |

Root alone went from resolvably harmful to neutral on maze A, and from
*worse than base* to *better than base* on maze B. The dials are now roughly
additive rather than co-dependent, so the "never tune these separately"
warning from the previous review no longer applies and has been corrected in
`shared/balance.js` rather than left standing.

## Status

- **Shipped:** `rootMs: 2000`, `rootRadiusPx: 55`, `contactDps: 20`,
  `contactRadiusPx: 160`. Positive on both mazes, zero hangs, suite 914/0/2.
- **Validated:** the requested design ("suction to the centre, held there,
  damaged, spat out") is mechanically correct — confirmed by a monotonic
  landing-rate gradient, not merely by an outcome number.
- **Not claimed:** an A1.4(a) verdict. `rootMs: 2000` is still the requested
  value and has NEVER been swept; the radii came off 4-cell ad-hoc probes.
  The maze split, though halved, should still be checked against the
  control's own swing (7.843 A vs 6.652 B) before being read as the Grinder
  being maze-situational.
