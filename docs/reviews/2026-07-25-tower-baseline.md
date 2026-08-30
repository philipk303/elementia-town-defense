# The tower baseline: what the element specials and fusions are actually worth

**Date:** 2026-07-25 · **Follows:** `2026-07-25-hall-ring-softlock-fix.md` · **Change:** build policy only, no engine change

Written to give the special-tower redesign a measured *before* instead of an
argued one. Nothing in the game changed here; only the scripted build policy.

## 1. The instrument had never seen the feature

A tally of every structure standing at the end of 8 matches, on the committed
build:

```
BARRICADE 270 · WATCHTOWER 74 · FARM 16 · MARKETPLACE 8
FIRE_SPECIAL 8 · WATER_SPECIAL 8 · WIND_SPECIAL 8
```

`EARTH_SPECIAL`: **zero**. All six combo types: **zero**.

The three specials that appear are the bot elements', auto-placed near the hall
by `seedStartingEconomy` and never chosen by anyone. The human's own special is
**free** in wave 1 (`economy.js` grant) and the policy simply never claimed it.

So every Phase 8 number to date — baseline, both ramps, both mazes, the
soft-lock fix — describes a defence of *a wall plus one watchtower*. **No fused
tower has ever existed in any measurement this project has taken.**

## 2. Two changes, measured separately on purpose

- **2a — claim the free wave-1 special.** A defect fix, not a strengthening: it
  costs no gold, so it trades off against nothing.
- **2b — buy a partner special adjacent to it and fuse.** A genuine
  strengthening. `STARTING_GOLD` is 8 and a special costs 8, so an early fusion
  spends the entire opening purse against the watchtower and two barricades.

Split because two changes pushing the same direction inside one measurement is
how this project produced its "chaotic balance" finding in the first place.

Partner placement is the tile directly *below* the free special — same column, so
it can never plug a lane and move the maze under the measurement. The policy takes
the first pairable bot element in catalog order rather than choosing a combo;
`comboFormed` records what landed. In every run it was **MAGMA_TRAP** (EARTH+FIRE),
144/144. This is not secretly a GRINDER baseline.

## 3. Result: the whole system is worth approximately nothing

Paired per-cell against the committed build, 144 cells per maze.

| | maze A | maze B |
|---|---|---|
| **2a** free special | +0.132 (t 1.32) — 38 better / 24 worse | −0.002 (t −0.01) — 30 better / 34 worse |
| **2b** fusion at wave 1 | **−0.228 (t −2.23)** — 18 / 34 | **−0.391 (t −2.59)** — 27 / 45 |
| **2b** fusion at wave 4 | +0.045 (t 0.58) — 22 / 20 | −0.116 (t −1.12) — 27 / 36 |

**A free element special is worth nothing measurable**, on two independent
layouts. It perturbs ~43% of cells in *both directions* with no net effect — the
signature of a threshold-y sim being jostled, not of a mechanism. Compare the
hall-ring fix, where 28 cells changed and every one moved the same way.

**Fusing early is a real, replicated loss.** Both mazes, both significant. Fusing
once it is affordable is back to nothing. The timing was a genuine confound and
the first cut of this measurement would have reported "fusion is bad" — it is
narrower than that: *fusing on wave 1 is bad, fusing later is neutral.*

### Why, from the catalog

| | dps | range | cost |
|---|---|---|---|
| WATCHTOWER | **10.0** | **130** | **6** |
| EARTH_SPECIAL | 8.0 | 90 | 8 |
| WIND_SPECIAL | 3.75 | 90 | 8 |
| FIRE_SPECIAL | 5.0 + burn 6/3s | 90 | 8 |
| WATER_SPECIAL | 2.5 + wet 4s | 90 | 8 |
| MAGMA_TRAP | 8.6 + burn 8/3s | 100 | (16 + 2 tiles → 1) |

**`EARTH_SPECIAL` and `WIND_SPECIAL` are strictly dominated by the basic
watchtower on every axis at once** — less damage, shorter range, *and* more
expensive, with no status effect to compensate. `WIND_SPECIAL` has no status
effect at all. That is the most likely reason 2a measured as nothing.

And fusion trades **two towers for one**: `EARTH_SPECIAL` + a watchtower is
18 dps across two tiles and two range bands; `MAGMA_TRAP` is one tile at ~8.6 dps
plus burn. The mechanic has to beat *two* towers to be worth using, and it does
not.

**For the redesign, the measured statement is: the element-special and fusion
system currently has no positive effect on outcomes at any timing tested.**

## 4. A THIRD soft-lock mechanism, found in passing

The fusion configuration produced **1 stall in 800 matches** (seed 20260870,
postGap 0, maze B). It is **not** the hall ring and **not** a regression of that
fix:

- Three trolls at `(19,7)`, `(18,6)`, `(18,7)` — *above* the wall row, 429–453 px
  from the hall, each with a **valid lower-cost descent step** to a non-wall tile.
- No status effects, full move speed, zero knockback velocity, no phantom wall
  bands anywhere on the field.
- Positions repeat on a ~3-tick period indefinitely: **a limit cycle**. The flow
  field pushes the cluster together, `resolveCircles` separation pushes it apart,
  and at troll radius 14 in a wall breach the two balance exactly.
- The bots are again leash-frozen 276 px away instead of coming to kill them.

Scan rates, 200 seeds × 2 posts × 2 mazes each:

| build | stalls |
|---|---|
| committed HEAD | **0/800** |
| 2a, free special only | **0/800** |
| 2b, fusion at wave 4 | **1/800** |

One event is **not** statistically distinguishable from zero (if the true rate
matched HEAD's upper bound, P(≥1 in 800) is not small), and there is no causal
story connecting a lane-flank fusion to a crowd jam 10 tiles away — the policy
change perturbed the sim into a trajectory that hits a pre-existing mechanism.
**Not bundled with a fix**, per the standing per-bug rule. It needs its own
experiment, and the honest current statement is "a rare crowd-separation limit
cycle exists; observed once in 2,400 matches."

## 5. Instrument changes

- `runBuildPolicy` claims the free wave-1 special (`freeSpecialPlaced`,
  `freeSpecialAt`) and optionally fuses (`comboFormed`).
- `runMatch` gains `fuse` (default true) and `fuseWave` (default **4**). The
  wave-4 default is a *measured* choice, not taste: defaulting to wave 1 would
  tax every future measurement for a mistake a real player would not make.
- New test `the build policy exercises specials and fusion` guards both paths, so
  a regression is caught by `npm test` rather than by noticing a baseline was
  taken on a defence nobody plays.

Suite: **321 tests, 319 pass, 0 fail, 2 skipped**.

## 6. What this does not say

- **One combo, one placement, one dumb policy.** MAGMA_TRAP at a lane flank. It
  does not show all six fusions are worthless — `GRINDER` (14.3 dps + pull) and
  `FIRESTORM` (11.4 + burn 10/4s) are much stronger on paper and untested.
- The scripted human never re-sites, sells, or repairs, and never builds more
  than one special. A real player with a plan may extract more.
- The three bot specials sit near the hall in every run and are unchanged
  throughout — "specials" were never wholly absent, only the human's.
- Win rates (11% / 4%) are too thin on maze B to read. All claims here are on
  score.
- These numbers are **not comparable to the published 8A baseline**: the scripted
  human is now meaningfully stronger. That break is deliberate and was accepted
  in advance.
