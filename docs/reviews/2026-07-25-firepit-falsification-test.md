# Firepit vs Watchtower — the A5 step-2 falsification test

**Date:** 2026-07-25
**Plan:** `docs/superpowers/specs/2026-07-25-combat-structure-redesign.md`, Amendment A5 step 2
**Result: FIREPIT FAILS the A1.4(a) niche floor, and the A4 hang gate is violated on maze B.**
Per A5 step 2 this is an explicit stop-and-revise point, not something to tune past.

---

## 1. What was measured

Paired per-cell, 72 seeds x 2 post positions = 144 cells per arm per maze, two mazes.
Arms differ in exactly one thing: what the same purse, at the same sites, in the same
maze, is spent on.

- `freeSpecial: false`, `fuse: false` — nothing else competes for gold.
- `spendDown: true` for BOTH arms. A single purchase cannot express an equal-gold
  comparison between a 6-gold Watchtower and an 8-gold Firepit.
- Walkable defences are sited in the FUNNEL (the gap column, rows 1-4 below the wall);
  blocking defences keep the flank sites. A walkable structure can stand in the lane;
  a blocking one cannot without plugging the gap and changing the maze under the
  measurement. This asymmetry favours the Firepit and is part of its design.

**Declared in advance, per A1.4:** Firepit's intended scenario is massed enemies
funnelled through a choke. Its skill dependency is ZERO — no facing, no direction, no
target selection, no timing — so the scripted policy can express its purpose in full and
this measurement is binding rather than a statement about the policy.

## 2. Results

| | Watchtower | Firepit | paired diff | t |
|---|---|---|---|---|
| maze A | 8.696 | 7.806 | **-0.890** | **-9.88** |
| maze B | 7.604 | 7.110 | **-0.494** | **-3.38** |

Targets per armed pulse: **1.30** on both mazes — the area effect works; the Firepit is
genuinely catching more than one enemy per activation.

**The Firepit is decisively worse than the Watchtower at equal gold, in the scenario it
was designed for, on both mazes.** It does not reach 1.0 power unit. It does not come
close.

## 3. Two instrument defects found on the way, both fixed

Neither of these is the finding; both had to be fixed before the finding could be
trusted, and both would have produced a wrong conclusion.

**3.1 The declared scenario was not being delivered.** The first run sited Firepits on
`towerSites` — the flanks of the gap, which suit a 130px-radius Watchtower. Measured
**0.073 targets per pulse, 93% of pulses landing on nothing.** That number measures the
policy, not the structure (A1.4). Fixed by teaching the policy to site walkable defences
in the lane.

**3.2 The pulse burned its interval on an empty footprint.** The nearest-target family
does NOT consume its cooldown when nothing is in range — it stays ready. The pulse family
did, so a body crossing the footprint in ~1s ate 0 or 1 pulses essentially at random,
depending on phase alignment. Fixed: an empty pulse no longer consumes the interval.
Targets per armed pulse went 0.07 -> 1.30. **The score barely moved** (-0.93 -> -0.89 on
A), which is what makes the verdict trustworthy: the area premise now demonstrably works
and the structure still loses.

## 4. Why it loses — the structural reason

A Watchtower covers a disc of radius 130px, about **53,000 px²**, and never wastes a
shot. A Firepit covers its 2x1 footprint plus a 12px heat margin, about **6,100 px²** —
roughly **one ninth** the area — and only harms bodies physically inside it. At 1.30
targets x 6 damage per 700ms it makes ~11 dps while occupied, against the Watchtower's
flat 10 dps sustained, and it is occupied only a fraction of the time. It also costs
**8 gold against the Watchtower's 6**.

This is an area-and-price mismatch, not a tuning nudge. §5.1's area target ("footprint
expanded by about half a tile") cannot close a 9x area gap through damage numbers alone
without making the Firepit absurd in the hand — and §7's budget as written cannot detect
the problem, which is exactly what the A1.4 anchor was added to catch.

## 5. The hang gate is also violated

A4 requires 0/144 on both mazes. Measured, per arm:

| | maze A | maze B |
|---|---|---|
| Watchtower | 0/144 | 0/144 |
| Firepit | 1/144 | **7/144** |

The hangs are the familiar shape: 2-3 living enemies inert at wave 8 with 48 structures
standing. The Watchtower arm at a comparable structure count hangs zero times, so the
walkable structure in the lane is implicated. **The mechanism is NOT diagnosed** — this
project's history says guessing at a soft-lock mechanism costs a session, and three
distinct mechanisms are already documented. It needs its own investigation.

## 6. Options, for Philip to rule on

Ranked by my preference. Do not treat any of these as decided.

1. **Enlarge the pulse area** — a full-tile margin makes the Firepit ~4x3 tiles
   (~18,000 px²), closing most of the gap, and re-measure. This is the change I would
   make first because it attacks the actual cause.
2. **Cut the Firepit's cost below the Watchtower's.** It is currently 33% more expensive
   than the thing that beats it on every axis — the same shape of error the tower
   baseline found in `EARTH_SPECIAL`.
3. **Raise damage and burn substantially.** Cheapest to try, least likely to be right on
   its own, and the most likely to look like fitting the answer.
4. **Revise A1.4's floor** so a support structure is not required to beat a Watchtower
   solo. Honest option, but it reopens the domination problem the anchor exists to
   prevent, and I would want the no-strict-domination clause strengthened in exchange.

The hang gate has to be resolved regardless of which is chosen — a structure that
reintroduces soft-locks does not ship at any power level.

## 7. What is NOT claimed

- Nothing here says the redesign is wrong. It says **these numbers and this area** are
  wrong, measured on the simplest structure in the roster before nine more were built on
  the same assumption. That is precisely what step 2 was for.
- The win-rate axis is unusable on maze B (2/144 after walkable structures landed). All
  claims above are on score.
- No fusion is involved in any arm.
