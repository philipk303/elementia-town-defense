# Checkpoint 3 — Adversarial Designer / Balance Review (Phase 4: player characters, element kits, leveling, down/revive)

<!-- REMEDIATION STAMP -->
> **REMEDIATION — 2026-07-19 (auto-applied, Opus 4.8 executor; TDD, suite 220/220 green).**
> - **C1 (cross-wall combat pacifism) — FIXED (the correctness half).** Chase-mode enemies blocked by a
>   structure now bash it — the structure analog of the unconditional `attackHall` rule
>   (`server/game/enemies.js`, CHASE branch; regression test in `test/game/enemies.test.js`). The
>   perpetual risk-free stall collapses: the blocking wall is now actively destroyed, the chaser reaches
>   the player, damage flows. The **player-melee-line-of-sight half** (a player can still chip an enemy
>   through a wall for the seconds before it breaks) is left as intended wall-timing behavior, NOT true
>   raycast LoS — reclassified Phase 8 feel-tuning, since the exploit (infinite stall) is closed.
> - **H1 (FF Fireball self-hit) — FIXED.** Owner excluded in `detonate`. Regression test added.
> - **C2 (certified acceptance strategy loses at wave 6 on 2/3 seeds; L3 ×1.3 ≈ +8% output into +53%
>   wave-HP) — NOT a code fix; ESCALATED to Philip as a balance decision.** Needs a declared player-DPS-share
>   target before the Phase 8 sweep can tune to it. Left for that decision, not silently re-tuned.
> - **M1-Fire (L3 skipped Fireball's area/range) — FIXED** alongside the programmer/crosscheck M1.
> - **H2 (displacement counter ~0.25s), H3 (Fire dominant / Earth no tank / no enemy catches players),
>   H4/M1-solo (solo = statue bots; bots subsidize the 2-human acceptance), and the Mediums
>   (dying-as-healing, waves 4–5 dead zone, Wind low DPS, FF-on no positive use)** — all balance / Phase-6
>   sequencing; carried to the Phase 8 sweep and Phase 6 bot re-baseline. Not addressed this session.


**Date:** 2026-07-19
**Reviewer:** Senior game designer, adversarial mandate. Companion profile to the CP2 pair
([`2026-07-18-checkpoint2-designer-review.md`](2026-07-18-checkpoint2-designer-review.md)); this pass
judges the **combat design as it actually plays**, gathered by driving the real sim headless
(`server/game/{state,tick,phaseMachine}.js` probes) plus reading the balance surface — not a code review.

**Subject:** commit `8416bbd` (Phase 4 complete, 217/217 green). Balance surface:
`shared/balance.js` (PLAYER / PROJECTILE / ABILITY / LEVELING) consumed by
`server/game/{players,abilities,projectiles,elementKits,aggro,enemies,status}.js`; the Phase-4
amendment block of `docs/superpowers/specs/2026-07-17-slice1-design.md` treated as review target, not given.

**Scope caveat honored:** economy/gold (Phase 5) and AI-teammate bot behavior (Phase 6) do not exist
yet and are not faulted for absence — but where their absence *invalidates a Phase-4 acceptance claim*
(inert bot statues, see M1) it is flagged.

**Verdict: CONDITIONAL GO** for Phase 5. Two findings are **fix-now** (C1 cross-wall combat
pacifism, H1 FF self-hit spec violation) because they invalidate the combat model Phase 4 exists to
ship and will contaminate every later playtest; everything else is Phase-6 sequencing or Phase-8
sweep material. Phase 5 (economy) does not build on the broken surfaces and may start in parallel
with the C1/H1 remediation.

---

## Summary

The structural skeleton is again right: the four kits are mechanically distinct (AoE-slow / projectile
/ cone-shove / pull — genuinely different verbs, not four radii with different numbers), the L4
seconds each extend the element fantasy coherently, leveling milestones land at build-phase start as
spec'd, the two-axis scaling correctly covers players under FF (Earth shrug, Wind flung), and the
down→revive→death→respawn ladder matches §4 exactly.

But the **threat model that justifies the whole action-hero layer does not bind**. Probed live:
a player can stand on the safe side of an intact barricade and **melee enemies to death through the
wall** while the aggro'd enemy — which never attacks structures in chase mode — does *literally
nothing* (probe: troll killed through a 40/40 untouched barricade, player at 100/100 HP). Layer on the
speed table (fastest enemy 120 px/s vs slowest player 115 px/s — nothing but the Elite Goblin can ever
catch anyone in open field, and Fire outranges everything at 380 px) and Phase 4's "you must close to
contact range, which naturally pulls aggro" risk premise is currently a fiction. Meanwhile the same
scripted-competent-human run the acceptance certified for waves 1–5 **loses at wave 6 on 2 of 3
seeds** — so the leveling ladder's combat beats (L3 = +8% total player output into a +53% wave-HP
step) are cosmetic exactly where the curve needs them.

---

## CRITICAL

### C1 — Cross-wall melee + chase-mode structure pacifism = risk-free combat and a free horde stall — **fix now**

**The degenerate line of play:** stand pressed against the safe side of any 1-tile wall on the enemy
path. Melee reach is `34 + 14 (player r) + enemy r` = 57–62 px; two bodies pressed on opposite faces
of a 32-px tile are 55–60 px apart — **every enemy type is meleeable through an intact wall**. The hit
pulls aggro; a chasing enemy steers at the player, humps the wall, and — because `enemies.js` only
sets `attackStruct` in the march branch — **attacks nothing at all for the 4 s chase cap**, then
commits for 4 s (bashing the wall it should have been bashing all along), then instantly re-aggros
(the player is inside the 90 px proximity through the wall). Enemy melee reach is only
`6 + r_e + 14` = 29–34 px — it can **never** hit back through the tile.

**Evidence (headless probe, this commit):** troll spawned pressed to the north face of a barricade,
Earth human pressed to the south face, basic-attack held: *"melee'd troll through wall: true; troll
dead: true; player took damage: false; player hp: 100; wall hp: 40/40"*. The wall took zero damage —
being attacked through a wall *protects* the wall, because chase mode suppresses the bulldoze.

**Why it's critical, not tuning:** it simultaneously breaks (a) the melee risk premise ("contact
range → natural aggro" — aggro pulled this way is harmless), (b) the anti-kite FSM (a stationary
player stalls any number of enemies at a 50% duty cycle forever, at zero cost — one AoE Fireball
aggro-tags an entire blast group), and (c) the repair economy (walls under "attack" don't degrade).
It will be the dominant strategy the first time a player discovers it, and every acceptance run after
Phase 5 will silently rest on it.

**Recommended change (two independent halves, both needed):**
1. **Chase-blocked enemies attack the obstruction.** In chase mode, if the step toward the target is
   into a solid wall band, set `attackStruct` to that tile's structure (the "bash what blocks you"
   rule). This alone kills the stall: the wall now dies under the camper.
2. **Melee requires no solid tile between attacker and target** (a 1-sample midpoint `solidAt` check
   between edges is sufficient at these ranges), applied to *both* player basic and enemy contact
   melee, or simply drop `MELEE.RANGE_PX` below `TILE_SIZE − 2r ≈ 4`+radii geometry (34 → ~20 keeps
   in-lane melee but no longer spans a tile + both radii).

### C2 — The played build still cannot survive its own mid-game; leveling's combat beats don't move the curve — **fix-now decision, Phase-8 magnitudes**

**Evidence (probe, 3 seeds, the exact acceptance scenario extended past wave 5):** the certified
"2 scripted competent humans + light maze" run goes **LOST at wave 6, wave 6, wave 9**
(seeds 1 / 42 / 20260719). The acceptance bar was waves 1–5 by plan, so this is not a failed
criterion — but it means **no played configuration has ever cleared waves 6–10 except the CP2
"dense towers alone" run**, i.e. the winning answer to the mid-game is still *more towers, fewer
players fighting* (CP2's deferred funnel-meta concern, now with the player layer shipped and still
unable to matter).

**The design-level number underneath:** wave 5→6 total enemy HP steps 666 → 1,020 (+53%, the elite
intro). L3, the milestone that lands that same wave, multiplies **special** damage/area ×1.3 — on
kits where specials are 1.2–10.6 DPS against a shared 20 DPS melee, that is roughly **+3–8% total
player output**. L1→L4 combined, player combat throughput grows maybe +30% across a run whose wave
HP grows ~10×. The ladder's fantasy beats ("global power boost", "new ability") are real as *toys*
but not as *curve answers*; all real scaling is deferred to Phase-5 gold → towers.

**Recommendation:** decide **now, as design intent** (not sweep trivia), what share of late-wave
kill throughput players are supposed to own (spec says "supplement, not solo answer" — pick a number,
e.g. 25–35%), and have the Phase 8 sweep tune L3/L4 and base-kit magnitudes to hit it. If the answer
stays "players are ~10% chip", say so in the spec and accept that waves 6–10 are a tower game with
action-figure garnish — but that contradicts §4's action-hero framing and should be a conscious call.

---

## HIGH

### H1 — FF-on Fireball damages its caster — recorded spec decision violated — **fix now**

The Phase-4 amendment states: *"The caster is always excluded from their own ability."*
`abilities.js` honors it (`forFFTeammates` skips the caster) but `projectiles.js:detonate` does not —
the FF player loop hits **every** alive player in the blast, owner included.

**Evidence (probe):** FF-on room, enemy at point-blank in the aim line, one Fireball:
caster 100 → **78 HP**. Point-blank detonation is routine (panic-cast at a closing goblin), and at
wave 8+ Flame Nova + self-Fireball chip will down Fire players in ways no one can read. One-line
fix: skip `p.id === pr.ownerId` in the detonate player loop. Fix now — it is a direct contradiction
of a written design decision, and cheap.

### H2 — The WEIGHT/displacement leg of the counter-triangle is numerically nonexistent vs the unit it is supposed to counter

The wave-8 teaching moment is the Elite Goblin: slow/root/freeze-**immune** (super-fast), and the
§2 lesson is "displace it" (medium weight). Total displacement of a knockback at 60 Hz with 0.85/tick
decay is `power × weightScale / 9` px:

| Tool | vs light | vs medium (Elite Goblin) | Time it buys vs 120 px/s |
|---|---|---|---|
| Hydro Blast (420) | 47 px | 28 px | **0.23 s** per 4.5 s cooldown |
| Tidal Wave (500) | 56 px | 33 px | **0.28 s** per 9 s cooldown |
| Whirlwind pull (300) | 33 px | 20 px | 0.17 s per 5 s cooldown |

Meanwhile the SPEED leg buys 1.5–2.0 s of full stop against the Elite Troll. The triangle's two legs
differ by ~7× in delivered value; the wave-8 elite teaches players that its designated counter does
nothing. Water's entire identity ("value is positioning control, not damage" — and its damage is 8)
rests on this axis. **Phase 8 sweep material** for the exact number (displacement needs to be worth
roughly a tile or two per cast to read at all — think 3–5× current, or make knockback also interrupt
the attack cooldown / apply a brief stagger so the shove has non-positional value). The *decision*
that displacement must be a real counter should be re-affirmed now so the sweep has a target.

### H3 — Element risk/reward is inverted: Fire strictly dominant, Earth pays tank costs with no tank stats

- **All four elements have identical 100 HP, identical melee, no damage resists.** Weight tiers do
  nothing outside FF (no enemy displaces players), so Earth's "super-heavy" is inert in FF-off rooms
  — Earth's entire statline is then *the slowest speed in the game* (115 px/s) with a 3.6 DPS slam.
  The §2 fantasy ("lets Earth reliably tank") is carried solely by the universal sticky-aggro rule,
  which every melee element uses equally well. Earth has no way to take a hit better than Wind.
- **Fire:** 380 px range (4× aggro proximity), 10.6 sustained AoE DPS (best in class), 155 px/s
  (outruns every enemy including the Elite Goblin's 120), and projectiles fly over walls. Fire never
  needs to enter any enemy's threat range for any reason — top damage at provably zero risk. Its L4
  (Flame Nova, radius 130 self-burst) is the one thing asking Fire to close, and nothing forces the
  question.
- Speed-table note: max enemy speed 120 < min player speed 115 except the single Elite Goblin vs
  Earth. **No enemy can catch any player who holds a movement key.** Player damage intake is 100%
  voluntary (facetanking while meleeing). The down/revive system's reason-to-exist (§4: "otherwise
  off-path ranged players take zero risk") is currently satisfied for nobody, least of all Fire.

**Recommendation:** differentiate survivability — per-element MAX_HP (e.g. Earth 140 / Water 115 /
Fire 90 / Wind 80) is the cheapest lever and directly funds the tank fantasy; consider enemy lunge
or a short on-hit slow on players so contact matters. Magnitudes Phase 8; the *decision* that
elements differ on a survivability axis should be taken now (it changes what the sweep tunes).

### H4 — Solo (1-human) configuration is currently three invulnerable-ish respawning statues and no revive

The 2026-07-18 amendment makes 1-human rooms an in-design configuration *now*, but bot behavior is
Phase 6. Today a solo run is: three inert bots clustered at the hall spawn acting as **infinitely
respawning aggro sponges** (enemies within 90 px lock on, spend chase cycles beating a 100 HP statue
that bleeds out untargetable for 15 s, dies, respawns at full HP 20 s later, forever) — a hall shield
the design never priced — while the human, if downed once, is **guaranteed** the full 15 s bleed +
20–29 s respawn (no one can ever revive them). Solo is simultaneously artificially shielded and
artificially punishing, and nothing about it has been acceptance-tested. **Not a Phase-4 defect**
(sequencing), but it must be an explicit Phase-6 acceptance criterion (the plan's "1 human + 3 bots
survives waves 1–4" covers it) — and until then the 1-human room allowed by the amendment ships a
known-degenerate mode. Consider gating solo behind Phase 6 or noting it as dev-only in the lobby.

---

## MEDIUM

### M1 — Phase-4 acceptance is quietly subsidized by the two idle bot statues
The certified waves 1–5 run contains two idle bots at the hall approach soaking chase cycles exactly
as in H4 (each statue diverts ~50% of an aggro'd enemy's duty cycle at the hall). The control test
(idle humans lose) shares the subsidy, so the delta is real, but the *absolute* bar ("hall survives
waves 1–5") is softer than it looks, and Phase 6 replacing statues with mobile bots will invalidate
the calibration in the *easier* direction. Re-baseline the acceptance at Phase 6, and in the interim
run the headless acceptance variant with `players` filtered to humans-only as a sanity control.

### M2 — Death economics: down/revive/respawn is also the game's only healing system
There is no mid-wave healing. Consequences at current numbers: (a) a player below 40 HP is *better
off* going down next to a teammate — 3 s channel returns them to 40 HP, downed state is untargetable
and un-damageable, and their aggro dumps to the hall; (b) full-HP hall respawn means a late-wave
death at 15 HP is arguably a favorable trade (27–29 s out for 100 HP and a spawn point where the
finale happens anyway). Neither is game-breaking (the hall pays the bill), but "dying on purpose is
healing" is a smell that gets worse the moment magnitudes tighten. Options: revive at
`min(40%, downed player's pre-down HP + X)`, respawn at partial HP, or add a slow out-of-combat
regen so living isn't strictly lossy. Phase 8 sweep material, decision now.

### M3 — Waves 4–5 and 9–10 combat dead zones; L2 gives combat players nothing
The ladder's beats at 3/6/8 are builder (L2), +8% (L3), new button (L4). Between: wave 4 opens a
second front *and* wave 5 introduces trolls with no new player tool (the spec's "no wave stacks two
new challenges" holds per-wave but the 4–5 *pair* is the run's largest relative difficulty ramp with
zero player-side progression — and probe C2 shows the collapse lands immediately after, at 6). This
is spec-level (milestones are §2-decided), so: no change requested to the beat waves, but the Phase 8
sweep should treat wave 5–6 as the tuning fulcrum, and L2's announcement should at least *read* as a
combat beat (the retro-resolve rescan firing visibly helps).

### M4 — L3 boost skips Fireball's area and range
Amendment: L3 is "×1.3 damage AND area/range on the L1 specials." `abilities.js` boosts Ground
Slam radius, Hydro Blast range, Whirlwind radius — but Fireball gets damage only
(`PROJECTILE.FIREBALL.{maxRangePx,aoeRadiusPx}` unboosted). Ironically this shorts the already-
dominant element, but it is a written-decision inconsistency; either boost the AoE radius or amend
the amendment. Cheap fix, low stakes given H3.

### M5 — Wind's combat contribution is a rounding error and its payoff is teammate-dependent
Whirlwind 6 dmg / 5 s (1.2 DPS) and Gale Dash 14 / 7 s; Wind's design payoff — clustering for AoE —
requires a Fire/Earth AoE follow-up or a Grinder, i.e. a teammate or a structure. With inert bots
(until Phase 6) a Wind human in a duo is a fast melee unit with a self-endangering cluster button
(pulled enemies proximity-aggro the puller). Acceptable as a support identity in the always-4 design,
but the sweep needs a solo-value floor (e.g. Whirlwind grants brief slow on pulled enemies, or Gale
Dash damage worth its cooldown). Phase 8 material; watch it at the Phase-6 review when bots can
actually convert the clusters.

### M6 — FF-on has zero positive play
FF governs teammate damage + displacement only (no statuses, caster excluded). Turning it on adds
exactly: ways to hurt friends. There is no FF-enabled tech (no shove-a-mate-out-of-danger worth
47 px, no combo). That's defensible as a "hard mode for trust groups" per §1's framing, but it means
the toggle's only emergent use is griefing latitude, and every FF code path (and its test surface) is
maintenance for a mode with no reason to be on. Either give displacement-on-teammates one intentional
use (e.g. FF shoves on teammates carry no damage but 2× power — a rescue tool) or accept and document
"FF = challenge mode". LOW-cost decision, flag for the spec.

---

## LOW

### L1 — Late-wave death is a sit-out, and that's (just barely) fine
Respawn at wave 8 = 27 s, wave 10 = 29 s, plus up to 15 s bleed-out if unrevived: worst case ~44 s
out on wave lengths that probe at ~60–120 s. That is a harsh but defensible co-op punishment *because*
the respawn point is the hall — the finale's fight comes to you. Watch it at Phase 7 playtests; if it
reads as "go make tea", scale RESPAWN_PER_WAVE_MS down, not BLEED_OUT.

### L2 — Revive channel resets to zero on any gap
A 2.9 s channel broken by a 48 px twitch restarts from scratch, and the range is tight against
interpolation delay (a reviver dancing on the edge at 100 ms render delay will drop channels they
visually held). Consider decaying progress instead of zeroing, or widening REVIVE_RANGE_PX to ~64.
Feel-tuning; verify in the live 2-client build.

### L3 — Enemy contact melee has no wind-up
Chase-contact damage lands on a cooldown tick with no telegraph; with 100 ms interpolation a melee
player reads damage as arriving from a sprite that isn't touching them yet. A 200–300 ms wind-up
flag (fx before damage) would buy readability for free and give the (currently unbeatable) dodge
game a reason to exist. Pairs with H3's threat-model work.

### L4 — Projectile quirks
Fireball detonates on the first enemy in store slot order at overlap (not nearest along the flight
path) and detonates at max range / map edge regardless — both fine at 12 px hit radius, both worth a
comment so Phase 8 doesn't "fix" them into different behavior. No action.

---

## Classification recap

| Finding | Class | When |
|---|---|---|
| C1 cross-wall melee / chase pacifism | Degenerate strategy | **Fix now** |
| C2 mid-game unclearable, leveling ≈ cosmetic vs curve | Curve | Decision now, magnitudes Phase 8 |
| H1 FF Fireball self-hit | Spec violation | **Fix now** (one line) |
| H2 displacement leg toothless | Curve / counter-triangle | Decision now, magnitudes Phase 8 |
| H3 Fire dominant / Earth no tank stats / no enemy catches players | Balance structure | Decision now, magnitudes Phase 8 |
| H4 solo = statues, no revive | Sequencing risk | Phase 6 acceptance gate |
| M1 acceptance subsidized by statues | Test validity | Phase 6 re-baseline |
| M2 dying-as-healing | Degenerate-adjacent | Phase 8 |
| M3 waves 4–5 dead zone | Curve | Phase 8 fulcrum |
| M4 Fireball L3 area unboosted | Consistency | Cheap fix anytime |
| M5 Wind solo-value floor | Balance | Phase 8 / CP-Phase-6 |
| M6 FF-on purposeless | Design decision | Spec note |
| L1–L4 | Feel/readability | Phase 7/8 |

**Probes used (scratchpad, no repo files touched):** waves-1–10 extension of the acceptance scenario
(3 seeds), cross-wall melee reproduction, FF point-blank Fireball self-hit. All run against `8416bbd`.
