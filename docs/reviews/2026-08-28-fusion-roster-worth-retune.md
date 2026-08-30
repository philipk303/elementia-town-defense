# Making the fusions worth the two structures they eat

Date: 2026-08-28. **EXPLORATORY — no registered family, no prereg, no verdict
gates.** Six sweeps, 219,000 runs, 0 crashed. Every figure is a plain paired
contrast, on identical seeds, of **the fused structure minus the two specials it
consumes** — the question "is fusing better than not fusing?".

Landed in `shared/balance.js`: Steam Vent, Firestorm, Blizzard and Muddy Bog
retuned; Grinder deliberately unchanged. Magma Trap was retuned the previous day
(`docs/reviews/2026-08-27-volcano-cadence-probe.md`). Suite 895 pass / 0 fail /
2 skipped.

| corpus | runs | question |
|---|---|---|
| `2026-08-27-fusion-roster-baseline` | 36,000 | where all six stood |
| `2026-08-27-fusion-lever-split` | 60,000 | cadence vs damage, separated, 2x each |
| `2026-08-28-fusion-coverage-and-push` | 45,000 | coverage lever, and harder pushes |
| `2026-08-28-fusion-control-effects` | 24,000 | are freeze and root the problem? |
| `2026-08-28-bog-root-blizzard-damage` | 24,000 | root duration; heavy Blizzard damage |
| `2026-08-28-fusion-roster-confirm` | 36,000 | confirmation at shipped values |

---

## 1. Before and after

| fusion | before (A / B) | after (A / B) | change |
|---|---|---|---|
| Magma Trap | +0.097 / −0.216 | **+0.291 / +0.381** | (2026-08-27) threshold 3→1, cooldown 6000→1300 |
| Steam Vent | +0.007 / −0.052 | **+0.061 / +0.409** | pulse 500→250ms, damage 8→16 |
| Firestorm | −0.068 / +0.155 | **+0.009 / +0.321** | cooldown 900→450ms, damage 13→26 |
| Blizzard | −0.219 / +0.300 | **−0.064 / +0.801** | rangePx 180→250, damage 12→48 |
| Grinder | −0.035 / +0.546 | −0.035 / +0.546 | **unchanged, deliberately** |
| Muddy Bog | +0.028 / −0.473 | +0.079 / **−0.147** | pulse damage 3→12 |

Before, four of six were worth building on at most one maze and were a *penalty*
on the other. After, every fusion is strongly positive on its own maze, and its
weak maze is between −0.064 and +0.291 — except Muddy Bog.

The confirmation sweep reproduced every per-fusion probe to three decimals, so
the four changes do not interact (expected: one fusion exists per run).

## 2. Five hypotheses, all refuted by measurement

This is the useful part of the record. Each was plausible and each was wrong.

1. **"Fusions lose a continuous damage field."** Refuted on Magma Trap the day
   before: adding a Firepit-grade field moved maze B by +0.065 while the eruption
   cadence moved it +0.650.
2. **"Double the throughput."** The single most natural fix, tested as cadence
   and damage separately at 2x each on all five. It fixed Steam Vent, half-fixed
   Firestorm, and **did nothing at all** for Grinder (maze A −0.035 → −0.001 at
   double damage). For **Blizzard it went backwards**: doubling the fire rate
   took maze A from −0.219 to −0.332.
3. **"It is coverage — one structure cannot be in two places."** Tested by
   widening reach. Refuted hardest of all: Grinder's outer radius 160 → 220 made
   maze A **worse** (−0.035 → −0.136), and adding damage on top made it worse
   again (−0.175). Grinder pulls enemies in; reaching further pulls in more than
   it can process.
4. **"The crowd-control effects are dead weight"** — the Steam Vent precedent,
   where confusion was measured inert and retired. Refuted: removing Blizzard's
   freeze cut maze B from +0.300 to +0.185 while barely helping maze A. The
   freeze is earning its place.
5. **"The 2x2 footprint costs tower sites."** The defence is site-limited, so
   this was the best structural candidate. Refuted from data already collected:
   `towersPurchased` differs by at most 0.10 out of ~12.2 between fused and
   unfused arms on every fusion and both mazes, and `goldUnspent` sits near 300
   throughout. Fusing costs no sites.

## 3. The one real find came from reading the code

**Muddy Bog's damage is entirely gated behind its own root.**
`server/game/structureBehaviors/areaEntry.js` only adds an enemy to the pulse
list if `applyRoot` actually rooted it (`status.rootSourceId === s.id &&
status.rootMs > 0`). Set `root.msByWeight` to zeros and `bgRooted` stays empty
forever, so **the bog deals literally no damage**.

Measured, not inferred: the `bog-root0` and `bog-dmg12root0` arms — identical
except that one quadruples pulse damage — produced **bit-identical results in all
3000 cells**, on differing config hashes. Quadrupling the damage of a structure
changed nothing, because with root disabled the damage code never runs.

That said total damage is capped by root *duration*, not damage per pulse. So
root duration was the obvious next lever — and it **also saturates**: 2x and 3x
root give maze B −0.184 and −0.183, indistinguishable from each other and from
the damage-only result. Bog resists both of its own levers.

## 4. Per-fusion notes

**Steam Vent** — the clean success. Both levers worked alone and combined
additively; it went from worth nothing anywhere to solidly worth building.

**Firestorm** — cadence was the lever (2x cadence beat 2x damage on both mazes).
Shipped at 450ms + damage 26 rather than the 225ms variant, which scored the same
on maze A, slightly worse on maze B, and doubled the projectile load for nothing.
Maze A ends at +0.009 (t 0.5) — **statistically indistinguishable from zero**, so
the honest claim is "no longer a penalty on maze A", not "worth building there".

**Blizzard** — needed 4x damage plus a 39% range increase to bring maze A from
−0.219 to −0.064, while maze B went to +0.801. Its cooldown is deliberately left
at 5000ms because shortening it made maze A worse. −0.064 (t −2.4) is a real but
small deficit.

**Grinder — changed nothing, and that is the finding.** Its maze-A deficit is
−0.035 at t −1.6, not distinguishable from zero, and *every* intervention made it
worse. The correct action was no action.

**Muddy Bog — not fixed.** −0.473 → −0.147 on maze B is real progress and it is
still a penalty there. Damage saturates, root saturates, removing the lingering
slow bought 0.014. **This needs a mechanic review, not another dial.**

**A consequence worth a playtest:** Bog's pulse damage is now 12, which is exactly
a goblin's HP. The basic enemy now dies to the bog's first pulse. That is a large
change in feel — from a slow grinder to an instant-kill zone for light enemies —
and no metric here can say whether it is good.

## 5. What this does NOT show

- **No verdict.** Unregistered, no prereg, no BH correction, no gates, no
  split-half, no hang imputation. Consistent across 219,000 runs and reproduced in
  a confirmation sweep, but carrying no registered claim.
- **One policy, one regime, funnel siting only.** `scripted-v1`, R2, and
  `specialSiting: funnel` throughout — deliberately, so the placement effect from
  `docs/reviews/2026-08-27-option-set-pilot-result.md` §2 cannot leak in.
- **Nothing about difficulty.** Every arm still loses nearly every run.
- **Two mazes is the whole population.** "Maze A" and "maze B" are two layouts,
  not a sample of layouts, so "situational by maze" cannot be generalised.

## 6. Is "positive on both mazes" even the right target?

Probably not, and this work was aimed at it for too long. Amendment D
(`docs/superpowers/specs/2026-07-25-combat-structure-redesign.md` §D2) says:

> **Failing to contribute in other scenarios is expected and desired** — that is
> what makes the roster distinct.

The registered bar is a positive contribution **in the scenario the structure was
designed for**. By that standard every fusion now clears it, and Blizzard's
−0.064 / +0.801 is arguably the *ideal* shape: neutral where it does not fit,
excellent where it does.

The open question is one no sweep can answer: is a fusion that is mildly negative
on the wrong maze acceptable design (a real choice with a real cost) or a trap
that punishes the player for building it? That is a playtest question.

## 7. Next

1. **Playtest.** Six fusions changed materially; the bog now one-shots goblins.
   Nothing in this document tells you how any of it feels.
2. **Muddy Bog mechanic review** — the one fusion no dial reaches.
3. If a registered claim is wanted, register `fusion-r3` **before** running it,
   with these corpora as the pilot that motivated it rather than the evidence.
