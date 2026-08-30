# Checkpoint 2 — Adversarial Designer / Balance Review (Phase 3: enemies, waves, status, aggro, tower offense)

**Reviewer:** Senior game designer, adversarial mandate. Companion to the same-day
[`2026-07-18-checkpoint2-programmer-review.md`](2026-07-18-checkpoint2-programmer-review.md)
(code/correctness) — this pass judges the **design and balance as it actually plays**, gathered by
driving the real sim headless (`server/game/{state,tick,phaseMachine}.js`) rather than reading numbers.
Where a finding overlaps the programmer review it says so and does not re-litigate the code fix.

**Subject:** commit `712f1b9`. Balance surface: `shared/balance.js` (ENEMY / STATUS / AGGRO / TOWER /
WAVES) consumed by `server/game/{enemyTypes,waves,status,aggro,enemies,enemyMove,towers}.js`.

**Scope caveat honored:** player abilities (Phase 4), economy/gold (Phase 5) and AI-teammate bots
(Phase 6) do not exist yet and are **not** faulted for absence. Findings flag where a Phase-3 balance
choice will *constrain* those phases.

---

## Summary

The structural bones are right. The enemy roster maps cleanly to the two-axis counter-triangle
(verified below: exactly one elite is displacement-immune, exactly one is slow/root-immune, the Elite
Orc is immune to neither), the 10-wave HP curve escalates smoothly (≈1.3× per wave with a deliberate
1.7× finale spike), gate telegraphy fires one wave ahead, and elites correctly lead each wave. The CC
two-axis scaling and burn/slow/root magnitudes are sane first-pass values.

But **the played build does not survive its own mid-game**, and for a reason that is a design failure,
not just a number: **every defended run deadlocks at wave 6** — an enemy gets pushed a few pixels
outside the 40-wide map, lands where the cost field offers no downhill step, and the wave-clear
condition (`spawnComplete && livingEnemyCount<=0`) can then never be satisfied. The run hangs forever
— not a loss, not a win, a soft-lock. Spec §5 explicitly required a stuck failsafe for flow-field
followers ("Do not reuse `stuck.js`… Flow-field followers need a different failsafe") and none was
built. The programmer review flagged the *mechanism* as a **LOW, "not reproduced"** hypothetical
(their L3); driving the actual acceptance-style maze, it reproduces on **6/6 seeds at wave 6**. That
single defect means **waves 6–10 cannot be balance-tested defended at all**, and it would brick a real
match. Everything downstream of it in the difficulty curve is currently unmeasurable in a real maze.

A second theme: **half the counter-triangle is inert in the phase that ships the enemies.** All
displacement (push/pull) is a player ability (Phase 4); no tower applies it. So in Phase 3 the entire
WEIGHT axis does nothing, and the "towers alone" acceptance path has *no answer whatsoever* to an
Elite Goblin (slow/root-immune, and its only counter — displacement — doesn't exist yet). Compounding
this, the **first elite the player ever meets (wave 6) is the Elite Orc — the one the spec calls "the
hardest… no clean counter."** The counter-triangle is introduced in the order least likely to teach it.

Verdict up front: **the balance *structure* is a sound foundation for Phase 4; the *build* is not
shippable to a Phase-4 integration test until the wave-6 deadlock is fixed**, because Phase 4 will be
tuned against waves it currently cannot reach.

---

## Balance data measured (real sim, headless)

Undefended = `players:[]`, no structures. Defended = the acceptance funnel (full-width barricade row,
single center gap) with watchtower flanks. "Peak" = max concurrent living enemies. Times are sim-clock.

| Wave | Total | Elites | Gates | Enemy HP into field | Peak concur. (defended) | Defended clear | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 8 | 0 | 1 | 132 | 6–7 | 5.5 s | Goblins + 2 Orcs |
| 2 | 13 | 0 | 1 | 246 | 6–7 | 8.2 s | |
| 3 | 16 | 0 | 1 | 372 | 6–7 | 11.0 s | Orc-heavy |
| 4 | 22 | 0 | 2 | 480 | **18** | ~19 s | Gate 2 opens — concurrency ~3× |
| 5 | 21 | 0 | 2 | 666 | 18 | ~22 s | Trolls introduced (count *dips* 22→21) |
| 6 | 26 | 1 (eliteOrc) | 2 | 840 | 20 | **never — DEADLOCK** | first elite = the counterless one |
| 7 | 35 | 0 | 3 | 1098 | — | (unreachable) | Gate 3 opens |
| 8 | 38 | 2 | 3 | 1494 | — | (unreachable) | eliteGoblin + eliteTroll together |
| 9 | 53 | 3 | 3 | 1836 | — | (unreachable) | |
| 10 | 78 | 6 | 3 | 3132 | — | (unreachable) | finale: 1.7× HP spike, 2 elite trolls |

Undefended run (`players:[]`): hall falls **mid-wave-1 at t≈97.7 s** — generous grace, plenty of room
to learn. (The programmer review shows that with the *real* static bot-players present this becomes
≈783 s due to the aggro stall — their H3; see M3 here.)

**Counter-triangle verification** (profiles + immunity thresholds, from the live sim):

| Unit | Weight | Speed (px/s) | HP | Displacement-immune | Slow/Root-immune | CC-duration scale |
|---|---|---|---|---|---|---|
| Goblin | light | fast (90) | 12 | no | no | 0.5 |
| Elite Goblin | medium | **super-fast (120)** | 36 | no | **yes** | 0.0 |
| Orc | medium | medium (65) | 30 | no | no | 0.75 |
| Elite Orc | **heavy** | fast (90) | 90 | no | no | 0.5 |
| Troll | heavy | slow (40) | 90 | no | no | 1.0 |
| Elite Troll | **super-heavy** | slow (40) | 270 | **yes** | no | 1.0 |

The thresholds are reachable and correct: Elite Goblin is the lone slow/root-immune unit (displace
it), Elite Troll the lone displacement-immune unit (root/burst it), Elite Orc immune to neither. Good.

**Tower first-pass DPS** (raw, status aside): Watchtower 10.0 (cost 6), Earth 8.0, Fire 5.0 + 6 dps
burn (18 total), Water **2.5**, Wind 3.8; combos Grinder 14.3, Firestorm 11.4 + 40 burn, Magma 8.6 + 24
burn, Steam 8.0, Muddy/Blizzard 6.0. Snare **0 damage** (slow-only).

---

## CRITICAL

- **C1 — every defended run soft-locks at wave 6: an enemy pushed out of bounds strands where the cost
  field has no downhill, and the wave can never clear. The whole back half of the difficulty curve is
  unplayable and unmeasurable.** Reproduced on 6/6 seeds (1, 2, 3, 42, 12345, 99999) with the
  acceptance-style funnel: wave 6 kills down to `livingEnemyCount = 1`, then hangs indefinitely
  (hall stays at 1000, `spawnComplete` is true, the wave never ends). The stranded enemy is a Troll at
  world `(1293, 321)` → tile `(40, 10)`, **outside the 40-wide grid** (map width 1280 px; valid tile x
  is 0–39). Mechanism: crowd separation (`resolveCircles`) + wall pushout at the funnel shove an
  enemy's center a few px past the map edge (measured overshoot ~13 px); there is **no world-boundary
  clamp** on enemy position, and off-grid `chooseStepDir` returns −1 (no downhill), so the enemy
  neither steps, nor attacks (it is not adjacent to the hall or a wall), nor can be reached by towers
  (541 px from the nearest). `isWaveCleared` (`phaseMachine.js:61`) requires `livingEnemyCount<=0`,
  which never happens → the phase machine is wedged for the rest of the match. This is the failure the
  programmer review hypothesized as **L3 ("not reproduced… LOW")** and is the same no-downhill family as
  their **H1** pushout-anchor tunnel bug — but from the played-build angle it is CRITICAL, not low:
  spec §5 *mandated* a flow-field stuck failsafe and none exists, so any enemy that reaches a
  no-progress tile (off-grid, or a corner-cut local minimum) deadlocks the entire run — worse than a
  loss, because there is no resolution at all. It also **blocks this very review**: waves 6–10 defended
  cannot be measured, so Phase 4 would be tuned against a curve whose second half has never run.
  **Recommendation (design-level, leave the code to the programmer track):** (a) clamp enemy positions
  to the play-field AABB every tick; (b) add the mandated failsafe — an enemy that spends N ms with
  `chooseStepDir === -1` and no attackable neighbor is nudged toward the lowest-cost in-bounds tile (or,
  as a last resort, culled) so a wave always terminates; (c) add an acceptance test that drives a
  *full 10-wave* defended run and asserts every wave reaches `waveEnd` — the current acceptance stops
  at "wave ≥ 4," which is exactly why this was never caught.

---

## HIGH

- **H1 — the elite-introduction order teaches the counter-triangle backwards.** The counter-triangle
  is the headline mechanical identity of the roster (spec §2/§4: "one sentence teaches each"). But the
  **first elite a player ever sees is wave 6's Elite Orc — the unit the spec explicitly designates
  "the hardest… immune to neither, resistant to both → no clean counter."** Teaching a mechanic by
  first presenting the exception that breaks it is backwards: the player learns "elites are just tankier
  and there's nothing clever to do," which is the opposite of the intended lesson. Worse, the two
  *counterable* elites never get a clean solo introduction either — Elite Goblin (displace it) and
  Elite Troll (root it) both first appear at **wave 8, together, inside a 38-enemy 3-gate horde**, where
  no player can isolate the "oh, THAT's the counter" moment. **Recommendation:** reorder the elite
  intros so the first elite is a *counterable* one that showcases the axis (e.g., wave 6 = one Elite
  Troll leading — "root and burst it," the cleanest single-sentence lesson, and thematically the siege
  unit the spec already calls out), introduce the Elite Goblin next in a context sparse enough to notice
  it needs displacement, and save the counterless Elite Orc for later as the "now you know the rules,
  here's the one that breaks them" escalation. This is pure sequencing in `BALANCE.WAVES[].comp` — no
  new systems.

- **H2 — the entire WEIGHT axis of the counter-triangle is inert in Phase 3, so "towers alone" has no
  answer to the Elite Goblin, and half the CC design can't be felt or validated until Phase 4.** Every
  displacement source (push/pull) is a *player* ability (Phase 4); **no tower or trap applies knockback**
  — `enemyMove.applyKnockback` is never called in the Phase-3 sim (confirmed: towers apply
  damage/burn/slow/root/freeze only). Consequence chain: (1) the weight tiers, `KB_WEIGHT_SCALE`, and
  super-heavy immunity do literally nothing this phase; (2) the Elite Goblin is slow/root/freeze-immune
  (super-fast) **and** its only counter is displacement, so in the "a scripted maze holds with towers
  alone" acceptance frame it is *uncounterable* — it walks through every trap taking only raw
  chip-damage; (3) the counter-triangle, the roster's core teaching device, is 50% absent in the exact
  phase that ships the enemies. None of this is *wrong* (players are Phase 4 by plan), but it means the
  Phase-3 balance claim is really "half a balance," and it interacts badly with H1 (the first elite is
  counterless, the *next* new elite is displacement-only against a phase with zero displacement). **Recommendation:**
  make this explicit in the plan — the Phase-3 acceptance should state that towers-alone is expected to
  fail against super-fast elites by design, and Phase 4 must land player displacement *before* the
  elite waves can be called balanced. Consider whether at least one *tower/combo* should carry a light
  displacement (e.g., Grinder's "cluster then crush" pull, per spec §2) so the weight axis isn't 100%
  player-gated — otherwise a 4-bot / solo-human team leans entirely on bot AI to ever displace anything.

---

## MEDIUM

- **M1 — the funnel meta produces binary difficulty (0 % leak or total collapse), with no graceful
  chip-tension, and the hall's only recoverable-durability mechanic is player-side.** Across every
  defended wave measured, hall damage was **exactly 0** until the wave-6 deadlock — the single-chokepoint
  funnel either kills everything before the hall or (absent the C1 hang) would saturate and dump the
  whole horde through at once. There is no middle band where a few leak, chip the hall, and create
  "we're bleeding, hold the line" tension. The hall is a **single 1000-HP accumulating resource with no
  regen** except the player channel-repair mechanic (Phase 4/5). So the intended failure texture —
  gradual attrition the team fights to stabilize — currently can't emerge from towers; it's all-or-nothing.
  This is partly downstream of C1 masking the leak band and partly the funnel design, but it's worth a
  design eye: verify (once C1 is fixed) that there's a tuning region where towers-alone leaks *some* and
  players/repair are what close the gap, rather than a cliff from perfect-hold to wipe.

- **M2 — the Water special structure is a near-dead tower in Phase 3: 2.5 DPS and its only real payload
  (Wet) has no consumer.** `WATER_SPECIAL` deals 2 damage/hit (2.5 DPS, lowest in the catalog by far)
  and applies Wet — a 4 s tag + a mild 15 % slow (`slowFactor 0.85`). Wet's designed pay-off is the
  Blizzard "freeze the Wet enemies" combo, but that combo-gating is deferred (amendment) and the shipped
  `BLIZZARD` tower **freezes unconditionally**, ignoring Wet entirely. So Wet currently does nothing but
  a 15 % slow, and Water's tower identity (the wet-setup enabler) has zero payoff. A player who builds
  the Water special in Phase 3 gets the weakest structure in the game with no synergy to justify it.
  **Recommendation:** either give Wet an interim mechanical effect that matters now (e.g., a Wet target
  takes bonus damage from Fire/burn, or a larger slow), or explicitly document Water-special as
  intentionally back-loaded to the Phase-4 Blizzard/ability wiring so it isn't mistaken for a balanced
  first-pass number.

- **M3 — anti-kite `commit` barely asserts against a stationary body-block; a parked player can hold the
  whole horde.** (Overlaps the programmer review's H3, from the design angle.) A single static player
  parked on the center path pulled **all 8/8** wave-1 enemies into `chase` and held them. The lever is
  mistuned relationally: `COMMIT_MS = 2000` < `STICKY_MS = 2500` < `CHASE_CAP_MS = 4000`, and after a
  2 s commit the enemy re-aggros immediately if the player is still within `PROXIMITY_PX = 90`. So the
  "horde's gravity is always back to the town" (spec §4) is weak — ~2 s of beeline for every ~4 s stalled
  on a body-block. Anti-kite is designed against *movement* (running in circles), but the dominant
  Phase-4 exploit will be a tanky Earth player *standing still* on the chokepoint, which commit doesn't
  meaningfully break. In Phase 3 this is inert (players take no damage), but it directly shapes Phase-4
  feel. **Recommendation:** revisit the commit/sticky/proximity relationship so a stationary target
  can't perpetually hold — e.g., make `COMMIT_MS ≥ CHASE_CAP_MS`, or suppress re-aggro onto the same
  target for a cooldown after a commit, or decay effective aggro on a target that deals no damage. Tune
  against real Phase-4 player HP/down-timers, not in isolation.

- **M4 — Snare Post is a marginal knob that will struggle to justify its cost against the economy.** At
  4 gold it deals **0 damage** and applies a `factor 0.6` slow that, after speed-tier resistance,
  degrades to **0.7–0.8 effective (20–30 % slow) for 0.4–0.6 s** on the common Orc/Goblin body (full
  0.6/0.8 s only on the slow-tier Troll, which is already the easiest to handle). Against the fast units
  that most need slowing it does least. For 4 gold vs a 6-gold Watchtower (10 DPS), few players will
  choose pure soft-slow with no damage. This is a first-pass magnitude, but the *relational* problem —
  a no-damage utility tower priced two-thirds of the baseline damage tower while delivering a sub-30 %
  brief slow — will fight the Phase-5 economy's build choices. **Recommendation:** either strengthen the
  slow (lower factor or longer duration) or drop the cost so it reads as a cheap tempo tool, and confirm
  its role once Snare-aura stacking with combos is decided.

---

## LOW

- **L1 — Slow and Root/Freeze share the identical `CC_*_SCALE` speed curve, so no unit resists one but
  not the other.** Spec §2 frames CC as "three families" with Slow separate from Root/Freeze, but both
  scale on the same `[1.0, 0.75, 0.5, 0.0]` speed table, so a unit vulnerable to root is *equally*
  vulnerable to slow and vice-versa. The slow-vs-root choice is therefore only a magnitude/duration
  decision, never a counter distinction (e.g., there is no "slow-resistant but rootable" unit). Fine per
  the amendment (both on the speed axis), but flag it so no one designs an enemy expecting the two to
  diverge without adding a second scale.

- **L2 — wave 4→5 enemy *count* dips (22→21) while difficulty rises (Trolls introduced, +186 HP).**
  Count is a poor difficulty signal here — the preview HUD (spec §1 "rough composition") should lead with
  type/threat, not a raw number that goes *down* on the wave that adds the tanky new unit, or players
  will misread wave 5 as a breather.

- **L3 — elite HP is a flat 3× with no per-type shaping, making the Elite Troll (270 HP, super-heavy,
  slow) a pure DPS-check answerable only by burst/root.** One Watchtower (10 DPS) solos it in 27 s; it's
  fine with a 4-defender multi-tower team, but the flat multiplier + displacement immunity means the
  design *requires* Phase-4 burst/root to exist and land before wave 8 (two elite trolls at wave 10).
  Confirm the L4 (wave-8) ability actually provides that answer, per the spec's "L4 learned against a
  known threat before the finale" intent.

---

## Verdict

**The balance structure is a sound foundation for Phase 4; the current build is not yet ready for a
Phase-4 integration pass.** The roster→counter-triangle mapping, the wave HP curve, gate cadence, and
CC scaling are all structurally correct and sanely valued for a first pass — genuinely good bones. But
**C1 (the wave-6 out-of-bounds soft-lock) is a hard blocker**: it makes waves 6–10 unplayable and
un-tunable in a real maze, so Phase 4 would be built against a difficulty curve whose entire back half
has never executed. It must be fixed (with the spec-mandated failsafe + a full-10-wave defended
acceptance test) before Phase-3 balance can be called validated. **H1 and H2 are cheap, high-value
design fixes to make before elites are tuned**: reorder the elite intros so the first one teaches the
counter-triangle instead of breaking it, and decide whether any tower carries displacement so the
weight axis isn't fully player-gated. The MEDIUM findings (binary difficulty, dead Water tower, weak
commit, marginal Snare) are the right things for the Phase-8 sweep to chew on — but M3's anti-kite
relationship and M2's Wet-has-no-consumer are the two that will actively shape Phase-4 feel, so settle
their *intent* now even if the magnitudes move later.

---

## Remediation — 2026-07-18 (auto-applied, TDD; suite 162/162 green)

- **C1 (wave-6 out-of-bounds soft-lock) — FIXED.** `server/game/enemies.js` clamps
  every enemy body into the arena each tick (`clampToArena`, applied after
  integrate/pushout and again after crowd separation). By the Dijkstra field's
  construction an in-bounds non-hall tile always has a descent step, so a clamped
  enemy can never strand where `chooseStepDir` returns -1. Regression: a direct
  off-grid clamp unit test (`enemies.test.js`) plus a **full 10-wave defended run
  that must resolve** (`phase3Acceptance.test.js`) — previously hung 6/6 seeds,
  now wins/loses cleanly (measured: defended funnel wins wave 10, ~159 s).
- **H1 (elite intro order backwards) — FIXED.** `BALANCE.WAVES` resequenced so the
  first elite (wave 6) is the **Elite Troll** (rootable/freezable — towers CAN
  counter it, a clean teaching moment). The CC-immune Elite Goblin follows at wave 8,
  the no-clean-counter Elite Orc at wave 9. Guarded by a new `waves.test.js`
  assertion that the counterable Troll precedes the Orc.
- **H2 (WEIGHT axis inert) — FIXED.** The Grinder combo now applies its spec'd
  Whirlwind-style **pull** (`TOWER.GRINDER.pull`, weight-scaled via `applyKnockback`,
  super-heavy immune) — the one tower-side displacement source in slice 1, so the
  WEIGHT half of the counter-triangle is live before Phase-4 abilities. Two new
  `towers.test.js` cases cover the pull and super-heavy immunity.
- **M3 (anti-kite commit weak) — FIXED.** `COMMIT_MS>=CHASE_CAP_MS` (both 4000) plus
  the chase-melee fix (programmer M1): a parked player at the hall no longer brakes
  the horde — chasing enemies at the hall now damage it, and a forced commit makes
  at least as much hall progress as the chase that triggered it.
- **M1 (funnel binary difficulty), M2 (Water special DPS / Wet consumer),
  M4 (Snare Post marginal), L1 (Slow/Root share CC curve), L2 (wave 4→5 count dip),
  L3 (flat 3× elite HP) — DEFERRED to the Phase 8 balance sweep.** These are
  first-pass magnitude / systemic-tuning items, not structural defects; the roster
  → triangle mapping, wave HP curve, gate cadence and CC scaling the review found
  sound are unchanged. M2's Wet-has-no-consumer resolves when Phase 4 wires the
  Blizzard "freeze wet" ability interaction; noted for that phase.
