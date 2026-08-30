# Rock Trap (EARTH_SPECIAL) standalone measurement — Amendment A1.4(a)

**Date:** 2026-08-03 · **Branch:** `codex/redesign-reconciliation` · **HEAD at
start:** `a1c8b07` · Suite 611/611/2 skipped, `npm run build` clean ·
**Script:** `test/harness/rockTrapRetest.js` (new — modelled directly on
`test/harness/firepitRetest.js`, not reinvented) · **Raw data:**
`test/harness/.rocktrap-standalone.json` (gitignored scratch output,
reproducible from the script)

Per `docs/handoffs/2026-08-02-rock-trap-standalone-measurement.md`. Rock Trap
ships today as `EARTH_SPECIAL` (`shared/balance.js:253-258`,
`server/game/structureBehaviors/targetImpact.js`, wired at
`server/game/towers.js:124`) — the earlier Task 20 handoffs' claim that it was
unimplemented was wrong, it checked for a key (`ROCK_TRAP`) that was never the
shipped name. Confirmed independently before this session touched anything:
the balance entry, behavior module, tick wiring and `test/game/rockTrap.test.js`
all exist and pass. **Nothing was implemented in this session.**

Rock Trap has been exercised only as a fusion ingredient (half of Magma Trap,
Muddy Bog, Grinder) in every prior sweep. It has never been measured
standalone against the Watchtower anchor. That is the gap this session closes.

## 1. Declared scenario (before measuring)

Per spec §5.2 (`docs/superpowers/specs/2026-07-25-combat-structure-redesign.md:177-206`):
"targets the enemy with the highest maximum HP in range... very high direct
damage... low splash." Confirmed by reading `targetImpact.js`:
`selectHighestMaxHp` picks by maxHp then nearest-then-lowest-id, and resolution
locks a world point at telegraph start (Amendment C.2) rather than
re-tracking the target — a priority-target burst weapon with a telegraph
window, not a positioning/geometry-dependent one like Blizzard or Grinder. No
scripted-policy skill dependency to declare away: the standard equal-gold,
spend-down defence-arm protocol applies directly.

## 2. Siting confirmation

Point 3 of the handoff flagged a risk: does the fusion-siting fix
(`freeSpecialSites`, funnel-vs-flank) accidentally not apply to the defence
arm? Confirmed by reading `matchRunner.js:300`: the **DEFENSE arm's**
`defSites` already tries `funnelSites(maze)` before `towerSites(maze)` for any
walkable defence (`EARTH_SPECIAL` is in `WALKABLE_TYPES`,
`shared/constants.js:130`), and this code path predates and is separate from
the fusion `freeSpecialSites` option added in the fusion-siting session. No
change was needed here — the defence arm was already funnel-aware.

## 3. Method

Same protocol as the tower baseline retake and the Firepit falsification
test/retest: paired per-cell, 72 seeds x 2 post positions = 144 cells per arm
per maze, both mazes. Arms differ in exactly one thing — `defence:
WATCHTOWER` vs `defence: EARTH_SPECIAL` — both `spendDown: true`,
`freeSpecial: false`, `fuse: false`. Hang-imputation + split-half on every
claim per `elementia-baseline-review-lessons`.

A small 8-match manual run (2 seeds x 2 posts x 2 arms) confirmed the
`EARTH_SPECIAL` defence-arm code path builds successfully and produces
sane scores before committing to the full 576-match sweep.

## 4. Results

| | maze A | maze B |
|---|---|---|
| Watchtower | 8.236 | 6.486 |
| Rock Trap | 7.569 | 7.021 |
| diff (t) | **-0.667 (t 8.11)** | **+0.535 (t 3.03)** |
| paired signs | 8 better / 85 worse / 51 tied | 64 better / 34 worse / 46 tied |
| split-half | agree (half1 -0.625, half2 -0.708) | agree (half1 0.194, half2 0.875) |
| hangs | 0/144 | 0/144 |

## 5. Hang gate: PASSES

0/144 on both mazes, both arms (0/576 total matches). A4 holds. No new
soft-lock mechanism surfaced.

## 6. Score effect: contradicts itself across mazes — same failure shape as Blizzard/Steam Vent

Maze A is a **decisive, high-confidence loss** for Rock Trap against
Watchtower (t 8.11, both split halves agree and are individually large).
Maze B is a **decisive, high-confidence win** for Rock Trap (t 3.03, both
split halves agree in sign, though half1 is much weaker than half2 — 0.194 vs
0.875 — a wider spread than any other split-half pair measured in this
program so far).

This is not measurement noise — each maze's own result replicates cleanly
within itself. It is the two mazes disagreeing with each other, in a
scenario the design explicitly does not think is positioning-dependent.
That is exactly the shape `docs/reviews/2026-08-02-fusion-flank-siting-
instrument-fix.md` found for BLIZZARD and STEAM_VENT: a number that flips
sign depending on where/how the harness exercises the structure is a policy
or geometry artifact until proven otherwise, not evidence about the
structure itself.

**A1.4(a) verdict: NO VERDICT.** A niche-floor claim requires a result that
holds in the declared scenario; a sign-flip across the two available mazes
cannot support "Rock Trap clears the floor" or "Rock Trap fails the floor" —
only "the instrument currently produces two mazes' worth of contradictory
answers to the same equal-gold question."

## 7. What was checked before accepting the sign-flip as real, not a bug

Ruled out the Firepit-class defect (declared scenario silently not being
delivered, i.e. the structure sited somewhere with nothing in range):

- **Structure damage lands in both mazes at comparable magnitude.**
  5-seed diagnostic, `combat.byCategory.structure.damage`: maze A avg 1146.1,
  maze B avg 1120.0 for the Rock Trap arm. The structure is not sitting idle
  on either maze.
- **Purchased-count asymmetry, not yet explained.** Rock Trap averages 8.9
  builds/match on maze A vs 12.1 on maze B (5-seed diagnostic), while
  Watchtower averages 12.4 vs 12.2 — nearly flat across mazes for
  Watchtower, but not for Rock Trap. Both defence arms of the same maze run
  through the identical barricade-rebuild loop before the defence-arm
  purchase loop, so the starting gold available for defence purchases should
  not differ between arms of the same maze; the site-list length
  (`funnelSites`+`towerSites`) is geometry-independent (2 gaps on both
  mazes → the same 8+12=20 candidate sites). The likely mechanism is
  seed-dependent collisions with bot-placed structures occupying candidate
  funnel/tower tiles differently per maze (not investigated further — out of
  scope per the handoff's "don't chase a new instrument-defect
  investigation past a small check" framing, and it does not on its own
  explain a sign flip: Watchtower's own `structDmg` also differs sharply
  between mazes, 1300.9 on A vs 784.4 on B, so maze B is plausibly just an
  intrinsically different, harder-for-Watchtower layout).

Neither check found a defect on the scale of Firepit's original "0.073
targets per pulse" instrument bug. This looks like a genuine cross-maze
generalizability failure, not a broken measurement — but it is exactly the
kind of finding this project's own precedent says should not be tuned past
without a decision from Philip.

## 8. What this does NOT say

- Does not say Rock Trap is broken or fine. It says the equal-gold measure
  does not generalize across the two mazes this program uses, so no niche-
  floor claim is honest right now.
- Does not diagnose the purchased-count asymmetry (§7) to a root cause.
- No fusion arm is involved in any measurement here — Rock Trap-as-fusion-
  ingredient numbers (Magma Trap, Muddy Bog, Grinder) are unaffected and
  unchanged by this session.
- Rock Trap's balance numbers were not touched.

## 9. Ranked options, for Philip to rule on — nothing here is decided

1. **Investigate the purchased-count asymmetry (§7) as its own task** before
   trusting either maze's number — the same "declare/measure separately"
   discipline the Firepit siting bug and the fusion funnel-siting session
   both used. This is the option I'd take first: it's a concrete, checkable
   hypothesis (seed-dependent site collisions), not a shot in the dark.
2. **Run a third maze layout**, if one exists or is cheap to add, to see
   whether A or B is the outlier — two mazes can't distinguish "A is wrong"
   from "B is wrong" from "both are right and Rock Trap is genuinely
   maze-sensitive despite its non-positional design."
3. **Accept the contradiction as the finding** and treat Rock Trap as
   currently un-certifiable under A1.4(a) until a scenario-specific
   declaration narrower than "highest-maxHp target in range" is made (e.g.
   "measured only on maze layouts where the gap count/spacing matches X") —
   the same kind of scenario-narrowing GRINDER/BLIZZARD still need.
4. **Do nothing further this session** — report as-is and let this join
   GRINDER/BLIZZARD/STEAM_VENT on the "no verdict yet" list; the hang gate
   result (§5) is still a clean, actionable pass on its own.

I did not act on any of these — this session's scope was measurement, per
the handoff.
