# Grinder contact damage — mechanic added, effect NOT resolvable

Date: 2026-08-29. Requested by Philip: "anytime the grinder has enemies in it
they get damaged, in addition to its vortex effect of pulling enemies in and
spitting them out." Motivated by the occupancy audit's one surviving finding
(`docs/reviews/2026-08-29-structure-occupancy-step3-4.md`): the outer pull
lands only 11.3% (maze A) / 40.1% (maze B) of what it grabs into the crush
zone, so most of the pull's work paid nothing.

**Headline: the mechanic is built, tested and behaves exactly as specified,
but it does NOT produce a resolvable improvement at n=144. Do not treat the
shipped `contactDps: 20` as a validated value.**

## What was built

`grind.contactDps` (shared/balance.js) — continuous, time-scaled damage to
every enemy inside the contact zone, every tick, in BOTH phases, entirely
independent of the crush. Implemented as `doContactDamage` in
`server/game/structureBehaviors/cycle.js`.

Design decisions, all deliberate:

- **Continuous, not pulsed.** A pulsed field makes output depend on how the
  cadence lines up with enemy transit — the Firepit phase-alignment defect
  named in towers.js's own header and scaldField.js's ARMED-ONLY note. Since
  the entire point here is to reward dwell time, dwell time must be what it
  reads. Time-scaling gives that by construction.
- **Position-gated only**, exactly like Muddy Bog's pulse and Steam Vent's
  scald. Deliberately NOT gated on `grImmune`: that map is recapture
  immunity, a rule about what the PULL may grab, not a claim the enemy is
  intangible. An ejected enemy that lands back inside is inside.
- **Runs in both phases**, so the crush's 1500ms recovery tail is no longer
  dead time for anything standing in the machine.
- **§7's safeguard is untouched.** The crush is still position-gated, still
  once per cycle, still escapable. This adds a floor; it does not remove the
  ceiling the spec asks for.
- `contactRadiusPx` — a SEPARATE dial defaulting to `innerRadiusPx`, added
  after the dose ladder below made it necessary to test radius independently
  of damage. Left unset in the shipped config.

Six new tests in `test/game/grinder.test.js` cover: damage during INTAKE
before any crush; time-scaling (2x dt = 2x damage); the position gate
(pulled-but-outside takes nothing); continuation through the CRUSH phase
without a second crush; combat-stat attribution; and `contactDps: 0` as a
clean off switch. Six pre-existing crush tests were wrapped in a new
`crushOnly()` helper that zeroes the dial — they assert exact
`maxHp - SPEC.damage` values and would otherwise be asserting the fixture's
tick count. The off-switch test guards that isolation, so it cannot quietly
stop isolating. Suite 904/0/2.

## Measurement 1 — dose ladder vs the two-ingredient control

`test/harness/archive/grinderContactProbe.js`, 72 seeds x 2 postGaps x 2
mazes, hallHpAuc, paired, Grinder vs `partnerSpecial` (both ingredients
standing unfused):

| maze | dps 0 | dps 10 | dps 20 | dps 40 |
|---|---|---|---|---|
| A | -0.039 (t 0.49) | -0.008 (t 0.10) | +0.032 (t 0.41) | -0.009 (t 0.12) |
| B | **+0.532 (t 3.36)** | +0.694 (t 4.37) | +0.650 (t 4.07) | +0.692 (t 4.30) |

Two things fall out of this, and the second is the important one.

**(a) An incidental correction to the audit's own framing.** At dps 0 — the
unchanged, pre-existing Grinder — maze B already reads +0.532 (t 3.36)
against its two ingredients. Grinder was NOT failing to beat its ingredients
there. The 11.3%/40.1% landing rate is a real inefficiency, but calling
Grinder "broken" on the strength of it overstated the case; it is neutral on
maze A and already decisively positive on maze B.

**(b) The dose-response is flat.** 10 -> 20 -> 40 gives +0.694 / +0.650 /
+0.692 on maze B and noise on maze A. A 4x increase in damage rate producing
no response means **damage rate is not the binding constraint.** The obvious
candidate is dwell time: enemies are simply not inside a 55px circle long
enough for DPS to matter.

## Measurement 2 — the dial against ITSELF (the contrast that decides)

Measurement 1 compares each dose to the control, which cannot say whether one
dose beats another — two overlapping vs-control readings are not a
comparison. `test/harness/archive/grinderContactDirect.js` runs the Grinder
against itself, paired, same seeds:

| maze | dps 0 | dps 20 | diff | paired signs (better/worse/tied) |
|---|---|---|---|---|
| A | 7.803 | 7.875 | +0.072 (**t 0.91**) | 58 / 41 / 45 |
| B | 7.184 | 7.303 | +0.119 (**t 0.88**) | 48 / 38 / 58 |

**Not resolvable.** Consistently positive in sign on both mazes, but well
inside noise.

## Measurement 3 — radius sweep (testing the dwell-time diagnosis)

`test/harness/archive/grinderContactRadius.js`, 20 dps, paired vs contact
OFF:

| radius | maze A | maze B |
|---|---|---|
| 55px (inner zone, shipped default) | +0.072 (t 0.91) | +0.119 (t 0.88) |
| 80px | +0.046 (t 0.57) | +0.267 (t 2.03) |
| 110px | +0.141 (t 1.63) | +0.200 (t 1.53) |
| 160px (outer pull radius) | +0.146 (t 1.28) | +0.207 (t 1.66) |

**The dwell-time diagnosis holds directionally**: widening the radius roughly
doubles the effect size where quadrupling the damage did nothing. Every cell
is positive, and sign counts favour "on" everywhere (maze A at 160px is
77 better / 51 worse / 16 tied).

**But nothing here is a result.** Exactly one of eight cells crosses t=2
(maze B, 80px, t 2.03), and one marginal hit out of eight tested cells is
what multiplicity produces by chance — this project has already retired 21 of
55 Welch cells for exactly this reason
(`elementia-paired-retrospective`). Nothing in this table is safe to tune on,
and the 80px cell in particular must not be cherry-picked as "the answer."

## Status and what would settle it

- **Shipped:** the mechanic, at `contactDps: 20`, `contactRadiusPx` unset
  (= the 55px inner zone, i.e. literally "in it" as requested). Conservative
  and faithful to the request; NOT a validated magnitude.
- **Not claimed:** any A1.4(a) verdict, any improvement to the pull-landing
  rate, any tuned value.
- **A note on the landing-rate figure:** it now READS lower with contact
  damage on (maze A 11.3% -> 5.9%) purely because contact damage kills some
  enemies inside the zone before the crush resolves, and the dead do not
  count as landed. The metric is confounded by the change and should not be
  compared across doses.
- **To settle it:** a registered sweep (prereg + bench spec, the normal
  protocol) at substantially larger n on the radius dial specifically, since
  radius is where the gradient is. An ad-hoc probe at n=144 cannot resolve an
  effect this size, and running more ad-hoc probes until one crosses t=2 is
  the exact failure mode the option-set procedure check already found twice
  (`elementia-harness-next-work-option-set`).
