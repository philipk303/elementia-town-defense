# Combat Structure Redesign

**Date:** 2026-07-25  
**Status:** Approved concept; implementation handoff for Claude  
**Scope:** Generic combat structures, four individual elemental structures, six two-element fusion structures, shared placement rules, runtime strategy, balance targets, and verification. Economy buildings are unchanged.

## 1. Purpose and success criteria

The current offensive structures all use essentially the same behavior: find the nearest enemy, deal single-target damage, and optionally apply a status. Wind and Earth therefore overlap the Watchtower, while Water overlaps the Snare Post.

This redesign gives every structure an independently useful and visibly distinct job. A successful implementation must satisfy all of the following:

- No elemental structure is a weaker elemental Watchtower.
- Every individual elemental structure is useful without a fusion.
- Fusion structures outperform their two ingredients when well placed, but do not dominate every layout.
- Structure geometry, attack area, state, and direction are readable before placement and during combat.
- Effects remain server-authoritative and deterministic.
- New behavior does not require a new pathfinding subsystem.
- Recurring work uses fixed pulses or phase transitions rather than per-tick area processing.

## 2. Shared placement and ownership rules

### Generic structures

- Watchtower and Barricade occupy one blocking tile.
- Snare Post occupies one walkable tile.

### Individual elemental structures

- Every individual elemental structure occupies a walkable 2x1 or 1x2 footprint.
- The player chooses horizontal or vertical orientation during placement.
- Wind Vortex and Water Geyser also receive an independently selected cardinal output direction.
- Orientation and output direction are stored as separate structure properties.
- Elemental structures do not replace Barricades as route-blocking pieces.

### Fusion creation

- Two compatible 2x1 elemental structures fuse only when their occupied tiles form a complete 2x2 square.
- The two ingredients must be parallel and side-by-side. End-to-end, perpendicular, L-shaped, and corner-only arrangements do not qualify.
- Placement preview for the second ingredient identifies the resulting fusion before confirmation.
- Both contributing players must confirm the fusion.
- There is no additional fusion fee; the two consumed elemental structures are the full economic cost.
- Fusion replaces both ingredients and their original behaviors with one 2x2 fusion structure.

### Fusion permanence

- Fusion structures are team-owned.
- They cannot be sold, unfused, rotated, or redirected.
- Any direction required by the fusion is selected during confirmation and permanently locked.
- Any permitted teammate may repair a fusion structure.
- Enemies can damage and destroy fusion structures.
- Destruction never restores the consumed ingredients.

## 3. Shared runtime architecture

The present nearest-target tower loop is insufficient for this roster. Implement behavior by explicit structure family rather than extending a single specification object with many unrelated optional fields.

Recommended runtime families:

1. **Footprint pulse:** Firepit and Snare Post.
2. **Ready/target/impact/cooldown:** Watchtower, Rock Trap, Water Geyser, Blizzard.
3. **Timed phase machine:** Wind Vortex and Grinder.
4. **Persistent area status:** Steam Vent and Muddy Bog.
5. **Entry-count trigger:** Volcano.
6. **Radial projectile volley:** Firestorm.

Shared requirements:

- The server owns target selection, damage, statuses, displacement, phase timing, and structure destruction.
- Clients receive compact state and discrete effect events; particles and decorative projectiles remain client-only.
- Use stable enemy IDs for tracking. Never retain typed-array indices across updates because enemy removal swaps slots.
- Use the seeded match RNG for any gameplay randomness.
- Bound all displacement velocity and preserve existing collision and arena clamping.
- Recurring area structures pulse at fixed intervals; they do not scan every simulation tick.
- Status refresh preserves the strongest potency and refreshes duration. It does not create unbounded stacks.
- Destroying a structure stops new applications immediately. Already-applied ordinary burn, slow, or freeze expires normally unless a structure-specific rule below says otherwise.

## 4. Generic structures

### 4.1 Watchtower

**Role:** Reliable ranged single-target damage.  
**Difficulty:** Low.

Behavior:

- Blocking 1x1 structure.
- Long range, moderate damage, fast cadence.
- Targets the nearest enemy in range.
- No splash, status, displacement, or conditional trigger.
- Damage resolves immediately on the server; an arrow or bolt is client-only presentation.

Verification:

- Nearest eligible target is selected deterministically.
- Range and cooldown are respected.
- One attack damages exactly one enemy.
- Destruction stops attacks.
- Visual arrows do not create simulated projectile load.

### 4.2 Snare Post

**Role:** Cheap generic damage amplification through mild group slow.  
**Difficulty:** Low to moderate.

Behavior:

- Walkable 1x1 structure with lower durability than a Barricade.
- Emits a small circular slow aura on fixed pulses.
- Slows every enemy in the aura and deals no damage.
- Slow lingers briefly after exit and uses the existing speed-resistance rules.
- Multiple Posts refresh the strongest slow rather than stacking multipliers.

Implementation notes:

- Replace the current nearest-enemy application with a true small-radius pulse.
- Pulse frequently enough that an enemy cannot cross the entire aura between checks.
- Existing slow flags are sufficient for networking.

Verification:

- Every enemy inside is slowed; enemies outside are not.
- Damage is always zero.
- Slow persists briefly after exit.
- Super-fast resistance remains effective.
- Destroying the Post stops refreshes without cleansing existing slow.

### 4.3 Barricade

**Role:** Route shaping and damage absorption.  
**Difficulty:** Low.

Behavior:

- Blocking 1x1 structure and cheapest defensive building.
- Deals no damage and applies no status.
- Enemies may attack through it when that route is cheaper than a long detour.
- Repair and build-phase selling retain existing rules.

Verification:

- Intact Barricades block movement.
- Destruction reopens the tile and updates routing.
- Cost-field behavior remains finite and prevents invalid wall-off states.
- It never damages, slows, or displaces enemies.

## 5. Individual elemental structures

### 5.1 Firepit

**Role:** Reliable group attrition and lingering damage.  
**Difficulty:** Low.

Behavior:

- Walkable 2x1 structure with no facing direction.
- Emits fixed damage pulses in an area larger than its footprint.
- Initial area target: approximately 3x2 when horizontal or 2x3 when vertical, implemented as the footprint bounds expanded by about half a tile on each side.
- Every enemy in the pulse area takes meaningful direct damage and receives or refreshes a substantial burn.
- Burn continues after exit.

Implementation notes:

- Store `nextPulseAt`.
- Perform one expanded axis-aligned rectangle check per pulse.
- An enemy overlapping both physical tiles is affected once per pulse.
- Burn refreshes duration and preserves the strongest potency; it never accumulates an unbounded list.

Verification:

- Enemies on the footprint and in the outer heat margin are hit once.
- Enemies just outside the expanded area are not hit.
- Burn persists after exit.
- Destruction stops pulses but does not cleanse existing burn.
- Firepit passive output exceeds Volcano passive output; Volcano earns its power through eruption.

### 5.2 Rock Trap

**Role:** Infrequent priority-target burst with minor collateral damage.  
**Difficulty:** Low to moderate.

Behavior:

- Walkable 2x1 structure with a large circular acquisition area.
- When ready, targets the enemy with the highest maximum HP in range. Break ties by distance and then stable enemy ID.
- Deals very high direct damage to the selected target.
- Deals low splash damage in a small radius around the impact.
- Uses a medium-to-long cooldown.
- Damage is numerical, not an execution; sufficiently durable elites and bosses survive naturally.

Implementation notes:

- A brief target shadow telegraphs impact.
- Lock the target ID during telegraph.
- ~~Resolve the strike at the target's impact-time position so the expensive activation does not routinely miss.~~ **[SUPERSEDED — Amendment C.2: also lock a world impact point at telegraph start; resolve there, not at the target's moved position.]**
- The primary target receives the intended direct total once and is not accidentally double-counted by splash.
- A falling rock is client presentation, not a simulated projectile.

Verification:

- Highest-HP targeting is deterministic.
- Direct and splash damage are independently correct.
- The primary target is not double-hit.
- One activation occurs per cooldown.
- Target removal during telegraph does not corrupt enemy slots or redirect the strike.

### 5.3 Water Geyser

**Role:** Long-distance single-target displacement with medium damage.  
**Difficulty:** Low to moderate.

Behavior:

- Walkable 2x1 structure.
- Orientation and cardinal launch direction are chosen independently during placement.
- When ready, selects one enemy overlapping its exact footprint.
- Deals medium damage and launches the survivor a substantially longer distance than Wind Vortex release.
- Uses a medium cooldown.
- Light enemies travel farthest; heavy enemies travel less; super-heavy enemies take damage with little or no displacement.

Implementation notes:

- Select the enemy nearest the structure center, breaking ties by stable enemy ID.
- Use existing velocity, collision, and arena clamping rather than teleportation.
- Do not add an airborne simulation state. The client may draw an arc over server-authoritative ground displacement.
- If the intended velocity risks tunneling, increase displacement duration instead of velocity.
- The cooldown is consumed even when the damage kills the target.

Verification:

- Exactly one footprint occupant is selected.
- Selection is deterministic under simultaneous entry.
- Damage and displacement occur once.
- Walls and arena bounds safely stop movement.
- Equal-weight Geyser displacement exceeds Wind Vortex release displacement.

### 5.4 Wind Vortex

**Role:** Fast, large-area crowd gathering and directional redistribution.  
**Difficulty:** Moderate.

Behavior:

- Walkable 2x1 structure.
- Orientation and cardinal ejection direction are chosen independently during placement.
- Projects a large circular AoE beyond its footprint.
- A fast repeating cycle pulls all eligible enemies inward, then ejects the gathered group in the locked direction.
- Deals no meaningful damage.
- Weight reduces suction and release displacement; super-heavy enemies are immune.

Implementation notes:

- Store direction, phase, next phase time, and cycle sequence.
- Use fixed suction pulses, not per-tick force.
- Track affected stable enemy IDs for the current cycle.
- Release each eligible tracked enemy at most once.
- Limit suction so enemies gather near the center without being forced onto one identical coordinate.
- Apply a brief post-release Vortex immunity and a global displacement-velocity cap.
- Destruction during suction cancels release and clears cycle tracking.

Verification:

- The server radius matches visual placement and combat indicators.
- All eligible enemies are pulled; outsiders are unaffected.
- Release occurs once in the stored direction.
- Weight scaling and super-heavy immunity work.
- Multiple displacement sources cannot produce invalid velocity or permanent capture.
- Reconnection restores phase and timing.

## 6. Fusion structures

### 6.1 Fire + Water: Steam Vent

**Role:** Persistent medium-area damage and navigational confusion.  
**Difficulty:** Moderate.

Behavior:

- Walkable 2x2 fusion surrounded by an approximately 3x3 steam cloud.
- Enemies inside take fixed scald-damage pulses and receive a refreshed short confusion status.
- Confusion persists briefly after exit.
- While confused, normal hall-march and player-chase steering are suspended.
- Each enemy chooses a deterministic seeded wander heading on initial confusion and at fixed intervals, not every tick.
- Collision and arena clamping remain active.
- An enemy already touching a structure may continue attacking it; confusion interrupts navigation and target acquisition, not contact attacks.
- Faster enemies recover sooner.
- Recovery grants brief confusion immunity so persistent occupation or overlapping Vents cannot create permanent wandering.

Implementation notes:

- Add confusion timing and heading fields to the per-enemy status state.
- Override only steering choice; do not modify the cost field.
- Serialize a confusion flag, not internal heading and timers.
- Bound overlapping-source duration and refresh.

Verification:

- Entry, exit persistence, deterministic heading changes, collision, speed resistance, overlap caps, destruction, and reconnection are covered.
- Confusion never permits wall traversal or off-map movement.
- Contact attacks are not silently converted into a full stun.

### 6.2 Earth + Fire: Volcano

**Role:** Conditional large-area devastation.  
**Difficulty:** Moderate.

Behavior:

- Walkable 2x2 fusion.
- Its passive trigger and crossing-burn zone is exactly the 2x2 footprint.
- Every outside-to-inside transition applies moderate burn and adds one pressure charge.
- The third unique entry causes one immediate eruption.
- Eruption deals massive AoE damage and strong lingering burn in an approximately 5x5 radial area, explicitly larger than Steam Vent's cloud.
- Eruption enters a medium recharge. Passive crossing burn remains active during recharge, but no new pressure is counted.
- Additional same-update entrants after the trigger receive crossing burn but do not cause or bank another eruption.

Implementation notes:

- Store charge count, eruption-ready time, and stable IDs currently inside.
- Count entry transitions, not occupancy ticks.
- Cap eruption at one per simulation update.
- Clear stale occupancy on exit, death, and removal.
- Telegraph one and two charges visually; darken the volcano during eruption recharge.

Verification:

- Remaining inside counts once; leaving and re-entering counts again.
- Three valid entries cause exactly one eruption.
- Eruption affects an enemy outside Steam Vent range but inside Volcano range.
- Destruction clears stored pressure.
- Reconnection restores charge and recharge state.

### 6.3 Fire + Wind: Firestorm

**[SUPERSEDED — see Amendment C.1 (2026-07-29). The behavior and implementation
notes below describe eight independent server projectiles; that model is
replaced by one authoritative volley resolution. Kept here struck-through for
history, not as current contract.]**

**Role:** Frequent omnidirectional ranged saturation.  
**Difficulty:** Low to moderate.

~~Behavior:~~

- ~~Walkable 2x2 fusion.~~ (unchanged, still current)
- ~~Fires eight fireballs per volley: four cardinal and four diagonal.~~
- ~~Each projectile travels independently, explodes on first valid enemy collision or maximum range, deals moderate AoE damage, and applies burn.~~
- ~~Uses a medium-fast volley cadence and short-to-medium projectile range.~~ (cadence/range still current, per-projectile framing superseded)
- ~~Fusion discards Wind's original selected direction.~~ (unchanged, still current)

~~Implementation notes:~~

- ~~Reuse the existing server-authoritative Fireball projectile and detonation path.~~
- ~~Use fixed normalized direction vectors.~~ (unchanged — now defines cosmetic directions)
- ~~Every projectile has explicit speed, collision radius, maximum range, and failsafe lifetime.~~
- ~~Remove a projectile on collision/detonation, maximum range, maximum lifetime, or leaving arena bounds.~~
- ~~Enforce global and per-source active-projectile caps. Skip excess new projectiles rather than deleting existing ones.~~
- ~~Prevent overlapping explosions from multiplying damage without limit: an enemy takes at most one full Firestorm explosion per volley; subsequent same-volley hits are ignored or sharply reduced.~~ (still true, now trivially true — one resolution, one explosion)
- Decorative trails and particles remain client-only. (unchanged, still current)

~~Verification:~~

- ~~Eight deterministic directions spawn when capacity permits.~~ (now: eight deterministic cosmetic directions)
- ~~Every termination condition removes projectiles.~~ (moot — no server projectiles)
- Range prevents map-wide coverage. (unchanged, still current)
- Per-volley hit protection works. (unchanged, still current — see Amendment C.1)
- ~~Volley cadence and caps bound projectile load.~~ (caps moot — see Amendment C.1)
- Reconnection and destruction cannot leave orphaned projectiles or emit future volleys. (unchanged, still current)

### 6.4 Water + Earth: Muddy Bog

**Role:** Persistent footprint rooting that punishes heavy enemies.  
**Difficulty:** Moderate.

Behavior:

- Walkable 2x2 fusion that is always active.
- An enemy entering becomes rooted for a weight-scaled duration and takes fixed damage pulses while rooted.
- Light enemies receive a short root; medium standard; heavy long; super-heavy the longest bounded root.
- Root expiration applies a lingering slow and allows the enemy to continue.
- One Bog triggers one root cycle per enemy crossing. Remaining inside cannot refresh the same root.
- The enemy becomes eligible for that Bog only after leaving and re-entering.

Implementation notes:

- Muddy Bog intentionally uses weight-based duration instead of changing the global speed-based root rules.
- Track entry and exit by Bog and stable enemy ID.
- Associate the active root with its source Bog for cleanup.
- Destruction ends Bog-owned roots immediately; the already-applied lingering slow expires normally.
- Root duration and overlapping slow both have hard caps.

Verification:

- Heavy enemies remain rooted longer than light enemies.
- Damage pulses stop when the Bog root ends.
- Root does not refresh before exit.
- Re-entry starts a new cycle.
- Multiple Bogs track crossings independently without unlimited duration.
- Destruction cannot leave an orphaned root.

### 6.5 Water + Wind: Blizzard

**Role:** Long-range group damage and short hard control.  
**Difficulty:** Low to moderate.

Behavior:

- Walkable 2x2 fusion.
- Has a larger circular acquisition area than Rock Trap.
- When ready, selects the enemy at the center of the densest hittable cluster.
- After a brief telegraph, a wide AoE of ice spikes deals medium damage and applies short freeze to every enemy in the impact circle.
- Uses a medium-to-long cooldown.
- There is no exposure, Chill buildup, persistent storm, or thaw-immunity subsystem.

Implementation notes:

- For each candidate in acquisition range, count enemies within the impact radius. Choose the largest cluster; break ties by distance and stable ID.
- ~~Lock the target ID during telegraph and center impact on its impact-time position if still valid.~~ **[SUPERSEDED — Amendment C.3: lock a world impact point at telegraph start, matching Rock Trap. Impact always resolves at that point; there is no "if still valid" tracked-target case.]**
- Resolve the spikes as one server AoE. Individual spikes are cosmetic and have no collision entities.
- Retain existing speed-based freeze resistance unless separately redesigned.

Verification:

- Acquisition radius exceeds Rock Trap's.
- Dense-cluster targeting is deterministic.
- Every enemy inside impact takes medium damage and one freeze application.
- Visual spike overlap cannot multiply hits.
- Target death, destruction during telegraph, and reconnection are safe.

### 6.6 Wind + Earth: Grinder

**Role:** Gather, crush, and directionally eject a group.  
**Difficulty:** Moderate.

Behavior:

- Walkable 2x2 fusion with a locked cardinal output direction.
- Fixed intake pulses pull eligible enemies within a moderate outer radius toward the center.
- At the end of intake, enemies inside a smaller central zone take high group damage once.
- Survivors are ejected a moderate distance in the locked direction.
- Uses a medium-to-long complete cycle.
- Enemies that do not reach the inner zone avoid crush damage.

Implementation notes:

- Reuse the Wind Vortex phase machinery where practical.
- Store phase, direction, phase deadline, and cycle sequence.
- Do not force enemies to an identical center coordinate.
- Carefully handle enemy swap-removal during group damage.
- Apply brief post-release Grinder immunity and the global velocity cap.
- Destruction during intake cancels the crush.

Verification:

- Outer-radius enemies are pulled; only inner-radius enemies are damaged.
- Every inner enemy takes damage once.
- Survivors eject in the locked direction with weight scaling.
- Super-heavy enemies resist displacement but take damage if already in the crush zone.
- Phase state survives snapshots and reconnection.

## 7. Power budget and tuning requirements

There is no additional fusion fee. A fusion consumes two independently useful elemental structures, requires two players and exact placement, becomes permanent, and loses the ingredients' flexibility.

Use these relative targets:

- One individual elemental structure: **1.0 power unit**.
- Two separate individual structures: **2.0 combined units**.
- Fusion in ordinary useful placement: **2.3-2.5 units**.
- Fusion under ideal conditions: **2.75-3.0 units**.

A fusion must not deliver peak value constantly. Its superior payoff depends on clustering, timing, routing, or enemy composition. Two separate structures should remain preferable when two lanes need independent coverage.

Mandatory tuning safeguards:

- **Steam Vent:** cap confusion refresh and grant post-confusion immunity.
- **Volcano:** passive burn remains below Firepit output; eruption is the primary value.
- **Firestorm:** limit range and active projectile count; protect enemies from unlimited same-volley overlap.
- **Muddy Bog:** one root per Bog per crossing and a hard root-duration cap.
- **Blizzard:** conservative medium damage because automatic dense-cluster targeting and freeze already provide large value.
- **Grinder:** outer pull cannot guarantee inner-zone arrival; use one of the longest full cycles.
- **Wind Vortex:** no meaningful damage, modest release distance, and recapture immunity.
- **Snare Post:** small radius and mild slow because it amplifies every nearby damage source.

## 8. Balance instrumentation

Do not balance on raw DPS alone. Capture at least:

- Direct damage and status damage per structure per wave.
- Unique enemies affected.
- Enemy-seconds of slow, root, freeze, and confusion.
- Net path progress removed or added through displacement.
- Useful-hit percentage and wasted activations.
- Cooldown utilization.
- Average targets per activation.
- Projectile counts, peak active projectiles, and cap-skipped volleys.
- Outcome comparisons among one ingredient, two separate ingredients, and their fusion in the same maze.

Run comparisons across open lanes, a single choke, split lanes, light swarms, heavy groups, and mixed elites. A well-placed fusion should clearly outperform its ingredients in its intended scenario without winning every scenario.

## 9. Recommended implementation order

1. Add shared 2x1 orientation, walkability, placement preview, and independent cardinal direction data.
2. Refactor tower processing into explicit behavior families while preserving Watchtower behavior.
3. Implement and verify the low-risk base structures: Firepit, Rock Trap, Water Geyser, and true-aura Snare Post.
4. Add shared bounded displacement and per-source/cycle immunity support.
5. Implement Wind Vortex and verify multi-source collision behavior.
6. Add 2x2 fusion placement, two-player confirmation, team ownership, permanence, repair, and destruction.
7. Implement Firestorm by reusing limited-range Fireball projectiles.
8. Implement Volcano entry tracking and charge state.
9. Implement Blizzard cluster targeting and cosmetic spike event.
10. Implement Steam Vent confusion and deterministic steering override.
11. Implement Muddy Bog source-owned weight-scaled rooting.
12. Implement Grinder using the proven Vortex phase machinery.
13. Add instrumentation and run the balance matrix before final numeric tuning.

Each step should land with focused tests. Do not implement all structures behind one unverified generic configuration abstraction.

## 10. Cross-system acceptance checklist

- Placement and pathing support 1x1 blocking, 1x1 walkable, 2x1 walkable, and 2x2 walkable structures.
- Horizontal/vertical footprint and independent cardinal direction serialize and reconnect correctly.
- Fusion eligibility accepts only exact 2x2 parallel pairs.
- Both players confirm, and fusion has no extra fee.
- Fusion is permanent for players, team-repairable, and destructible by enemies.
- Structure state remains deterministic under enemy swap-removal.
- All periodic effects use fixed pulses or phases.
- Displacement cannot tunnel through walls, escape the arena, or grow without a velocity cap.
- Long-lived projectiles have collision, range, lifetime, arena-bound, and cap termination.
- Destroyed structures leave no orphaned timers, ownership links, status sources, or future attacks.
- Reconnecting clients receive enough state to render direction, charge, cooldown, phase, and statuses.
- Combat VFX match server hit areas and never obscure essential silhouettes, health, or path geometry.
- Automated simulations demonstrate the intended fusion power band without universal fusion dominance.

## 11. Explicitly deferred

- Exact costs and numeric damage, duration, range, and cooldown values beyond the relative constraints above.
- True airborne enemy simulation for Water Geyser.
- Free-angle structure aiming.
- Individual simulated Blizzard ice spikes or Watchtower arrows.
- New boss-specific immunity rules.
- Farm and Marketplace redesign.
- Spatial indexing unless profiling demonstrates that fixed-pulse linear scans are a bottleneck.

---

# Amendment A — rulings and re-scope (2026-07-25)

Added after review against the tower baseline (`2c220e3`) and the code at HEAD.
Review: `docs/reviews/2026-07-25-combat-structure-redesign-review.md`.
Sections 1-11 above are unchanged and remain authoritative except where this
amendment overrides them. Where they conflict, this amendment wins.

## A1. Rulings (Philip, 2026-07-25)

**A1.1 Permanence — confirmed as written.** Fusion structures are permanent.
They cannot be sold, unfused, rotated, or redirected. **Enemy destruction is the
only removal path.**

> Consequence, and it is load-bearing: today no walkable structure can be
> attacked by anything. The only enemy→structure damage paths are the wall-band
> tests in `enemies.js` (chase-blocked and march-bulldoze), both gated on
> `costField.wallBand[...] !== BAND_NONE`, which a walkable structure will not
> have. Without the new rule in A3.1 a fusion is permanent **and immortal**.
> That rule is not a nicety; it is the only thing that makes A1.1 survivable.

**A1.2 Bot-owned ingredients — the human initiator confirms alone.** §2's
"both contributing players must confirm" applies between two humans. When an
ingredient is bot-owned, the initiating human confirms on the bot's behalf via a
single confirm step that names both ingredients and the resulting fusion. Fusion
therefore remains solo-reachable (1 human + 3 bots reaches all six combos), which
also keeps the measurement harness able to build fusions at all.

**A1.3 The L2 diagonal gate is dropped.** All six fusions are available from the
start. Remove `DIAGONAL_COMBO_TYPES` from `constants.js`, its check in
`combos.js`, and `rescanCombos` together with its `phaseMachine.js` call site.
Automatic retro-fusion on level-up cannot satisfy a consent gate and, under
A1.1, would hand players a permanent structure they never agreed to.

> Note for the leveling ladder: after this, teamLevel 2 carries only its melee
> damage step (`MELEE_LEVEL_MULT`, indexed per level). L3 (special boost) and L4
> (second ability) are untouched. If L2 needs its own beat back, that is a
> leveling question, not a structure question.

**A1.4 Power unit anchored to the Watchtower — in the structure's intended
scenario.** §7's budget is redefined:

> **1.0 power unit = the measured score contribution of one `WATCHTOWER` at its
> shipped cost, in the same maze and placement.**
>
> An individual elemental structure must satisfy **both**:
>
> **(a) Niche floor.** ≥ 1.0 at equal gold **in the scenario it was designed
> for**, declared in advance before measurement. Scoring below 1.0 in other
> scenarios is expected and desired — that is what makes the roster distinct.
>
> **SUPERSEDED 2026-08-15 — see Amendment D.** The "at equal gold" premise is
> measured false of the shipped game: gold is not scarce, so there is no
> opportunity cost to price a structure against. (b) stands unchanged.
>
> **(b) No strict domination.** It must never be worse than the `WATCHTOWER` on
> every axis at once (damage, range, cost, status/effect), in any scenario.

This replaces the self-referential definition, under which the entire budget
could be satisfied while the element line stayed dominated exactly as the
baseline measured it. All other §7 relative targets and every mandatory tuning
safeguard stand as written.

Clause (b) is the actual defect the baseline found, and it is worth stating
precisely, because it is easy to mis-read as "elemental structures must be as
good as a Watchtower." They must not. `EARTH_SPECIAL` is 8 dps / 90 px / **8
gold** with no status against the Watchtower's 10 dps / 130 px / **6 gold** —
less damage, less range, more expensive, no compensating effect. It does not
lose on average; it loses **everywhere**, so no placement, wave or enemy
composition makes it the correct buy. A structure that trades single-target
damage for area attrition and wins in a packed lane while losing in an open one
is a success, not a failure.

**Measurement conditions for (a) — these are load-bearing, not caveats:**

- **Measure inside a defence, never solo.** `SNARE_POST` is worth approximately
  nothing on its own by design; its entire value is amplifying other damage
  sources. Any anchor applied to an isolated structure will fail the support
  roster for doing its job correctly.
- **Declare each structure's skill dependency before measuring it.** The
  scripted human is a stationary turret with a fixed shopping list that never
  re-sites, sells or repairs. A Watchtower needs *zero* placement skill to earn
  its gold. Water Geyser (locked launch direction), Wind Vortex (locked ejection
  direction), Rock Trap (priority targeting), Blizzard (cluster timing) and
  Grinder all have value that a dumb policy cannot express. **For those, a
  sub-1.0 harness number is evidence about the POLICY, not the structure**, and
  must not be treated as a verdict. They require either a policy taught to use
  the structure, or a hand-placed scenario, before (a) is assessed at all.
- This is a real limit on the instrument, not a hedge. Acting on an unqualified
  harness number here would buff structures that are already fine.

> Corollary, and the reason A5 step 2 is what it is: **Firepit's skill
> dependency is zero** — no facing, no direction, no target selection, no
> timing. The harness measures it fairly. A Firepit failure is therefore
> trustworthy evidence about the design; a Wind Vortex failure, measured under
> today's policy, would not be.

> Open, to be settled by data rather than argument: the review argued the
> 2.3-2.5 ordinary band is likely too low, because a fusion also surrenders the
> two-tile / two-range-band coverage its ingredients had. Left at 2.3-2.5 for
> now. Revisit at the §8 balance matrix, where the question to answer is not
> "is the fusion strong?" but **"would a rational policy ever choose to fuse?"**

**A1.5 Naming — display aliases, not renames.** Shipped type IDs are unchanged:
`FIRE_SPECIAL` (Firepit), `EARTH_SPECIAL` (Rock Trap), `WATER_SPECIAL` (Water
Geyser), `WIND_SPECIAL` (Wind Vortex), `MAGMA_TRAP` (Volcano). The plan's names
become display strings only. Every published measurement stays greppable against
the identifiers it was recorded under.

## A2. Corrections to §3

**A2.1 The status-refresh rule is scoped to NEW statuses only.** §3's "status
refresh preserves the strongest potency and refreshes duration" does not apply to
the shipped slow. `applySlow` deliberately implements a different model — the
strongest factor persists for the longest remaining duration among applied slows,
documented in `status.js` and already flagged for the Phase 8 sweep. Changing it
here would move a live balance number underneath the baseline. If the slow model
is to change, it changes as its own separately-measured item.

**A2.2 Muddy Bog's source-owned root needs a new field.** The per-slot status
object has no owner concept. Add `rootSourceId` (and the Steam Vent confusion
timing/heading/immunity fields) to the preallocated per-slot object — no
hot-path allocation. `statusFlags` is an `Int32` bitfield; confusion needs a new
bit.

**A2.3 Naming.** §3 family 3 "timed phase machine" collides with
`phaseMachine.js`, which is the match BUILD/FIGHT machine. Call it a **structure
cycle machine**.

## A3. Work the plan did not name

**A3.1 Walkable structures do not exist yet.** Every structure today pushes an
HP band onto the cost field via `syncFieldBand`. "Walkable" requires:

- a `walkable` flag on the structure record, excluded from `syncFieldBand`;
- consistent exclusion from all three band consumers — `solidAt`, the Dijkstra
  corner-cut guard, and `resolveTilePushout`;
- **a new enemy-vs-walkable attack rule** (see A1.1), with its own priority
  ordering against the existing player > hall > structure ladder.

The new rule opens a new soft-lock shape — an enemy that stops to chew a
walkable Firepit under its feet instead of marching. It also sits in the same
code as the hall-ring fix (`95c69b3`), so landing it re-opens that fix for
measurement.

**A3.2 No dynamic per-structure state channel exists.** Structures are encoded
as `[id, type, gx, gy, hp]` and resent only when `placedVersion` changes.
Orientation and direction can ride that array. Phase, phase deadline, charge
count and cooldown cannot — bumping `placedVersion` per phase transition would
resend every structure several times a second. Add a separate compact
dynamic-structure array to the snapshot.

**A3.3 Firestorm has two integration defects.** ~~Reusing the Fireball path is
correct and the path already handles flight, step clamping, range, off-map
termination, AoE and burn payload.~~ **[SUPERSEDED — Amendment C.1 (2026-07-29):
Firestorm no longer reuses the Fireball server-projectile path at all.]** But:

- `detonate` pulls aggro toward `pr.ownerId`. Eight fireballs per volley from a
  **team-owned** structure would repeatedly yank the horde onto whichever player
  id is on the record. `ownerId` needs a null/structure path through
  `triggerAggro`. **This point survives Amendment C.1 unchanged** — the single
  authoritative volley still needs the same null/structure path.
- ~~Each spawn pushes a `projSpawn` fx and each detonation a `boom` plus a `dmg`
  per enemy hit. §6.3 caps projectiles but not fx; cap fx too.~~ **[MOOT under
  Amendment C.1 — one volley resolution emits one fx event, not eight.]**

**A3.4 The client build UI is a placeholder.** Hotbar 1-9, click to place, no
ghost or preview, and `_structureContains` is hardcoded to 1x1. Orientation
selection, cardinal direction selection, the fusion confirm preview, charge /
phase / cooldown indicators, and §10's "VFX match server hit areas" are all
net-new UI. Budget it.

**A3.5 Footprints.** `footprint()` is HALL-or-1x1. 2x1/2x2 touches placement
validation, `findStructureAt`, sell, repair edge-distance, dormancy, the client
renderer and the placement preview. `indexStructures` already loops `w`/`h`
correctly, so the melee lookup is free.

## A4. Soft-lock gates (replaces the single §10 checklist line)

Three soft-lock mechanisms are documented in this project, and two of this
plan's structures are deliberate versions of two of them: Vortex/Grinder suction
*is* the crowd-jam compression mechanism, and Steam Vent confusion — suspended
navigation and suspended target acquisition — is the hall-ring soft-lock's exact
signature. The substrate is currently 288/288 clean, which makes hang rate the
cheapest unambiguous canary available.

**Hard gate: the match harness must resolve 0/144 on BOTH maze A and maze B
before each of the following is considered landed** — the walkable-structure
phase (A5 step 1), Wind Vortex, Steam Vent, and Grinder. A hang regression
blocks the step; it is not a caveat to record and move past.

## A5. Revised implementation order (replaces §9)

§9's ordering principle is kept — preserve Watchtower behavior through the
refactor, verify low-risk structures first, and **do not implement all
structures behind one unverified generic configuration abstraction**. What
changes is granularity: §9 steps 1, 6 and 13 are each a phase, not a step, and
the measurement apparatus has to stay alive throughout.

1. **Walkable + footprints + enemy-vs-walkable attack rule.** No new structures.
   Gate: 0/144 hangs, both mazes.
2. **Firepit alone.** Measure head-to-head against a Watchtower at equal gold on
   both mazes, **inside a defence**, in Firepit's declared scenario (a packed
   lane — massed low-HP enemies crossing a choke). **This is the falsification
   test for the whole plan**, and it is valid precisely because Firepit's skill
   dependency is zero (A1.4), so the scripted policy can express its purpose in
   full. If the simplest structure in the roster — no facing, no phase, no
   target selection — cannot clear 1.0 power unit in the scenario it was built
   for, stop and revise §7 before building nine more.
3. **Rock Trap, Water Geyser**, then **Snare Post's true aura separately** (it
   changes a shipped, measured tower; it does not get bundled).
4. **Shared bounded displacement + per-source immunity, then Wind Vortex.**
   Gate: 0/144 hangs.
5. **Fusion geometry, the confirmation protocol (A1.2), team ownership,
   permanence (A1.1), repair, destruction — then RE-TAKE the tower baseline.**
   Every existing fusion number is void the moment this lands; that is expected,
   not a defect.
6. **The six fusions** in §9's original order (Firestorm, Volcano, Blizzard,
   Steam Vent, Muddy Bog, Grinder). Gates after Steam Vent and Grinder.
7. **§8 instrumentation and the balance matrix**, then numeric tuning.

## A6. Instrument work required, to be scheduled — not inferred

- **The harness build policy breaks at step 5.** It places one special adjacent
  to a partner and lets `combos.js` fuse them. New geometry (2x1 parallel forming
  an exact 2x2), orientation, direction and confirmation all invalidate it.
- **The published baseline covered one combo, one placement, one dumb policy** —
  `MAGMA_TRAP` only, lane flank only, a policy that never re-sites, sells or
  repairs. `GRINDER` and `FIRESTORM` were never measured at all.
- **§8's metrics do not exist in `profile.js`** — enemy-seconds of CC, net path
  progress from displacement, useful-hit percentage, wasted activations,
  cooldown utilization, peak active projectiles. §8's "do not balance on raw DPS
  alone" is right, and it is real work.
- **Every sweep run against this plan needs hang-imputation and split-half
  checks.** The first cut of the tower baseline would have reported the wrong
  conclusion without separating the timing confound.
- **Each structure needs a declared intended scenario and a declared skill
  dependency BEFORE it is measured** (A1.4). Declaring the scenario after seeing
  the result is how a specialist gets retro-fitted into whatever scenario it
  happened to win. Declaring the skill dependency after the result is how a
  policy limitation gets mistaken for a weak structure.
- **The policy must be taught to use directional and target-selecting
  structures** — launch/ejection direction, priority targeting, cluster timing —
  before Water Geyser, Wind Vortex, Rock Trap, Blizzard or Grinder can be
  assessed against A1.4(a) at all. Until then their harness numbers measure the
  policy. This is scheduled work, not an inference to make from existing runs.


---

# Amendment B — the area field is CONTINUOUS, not pulsed (2026-07-26)

Ruled by Philip, 2026-07-26, and confirmed at Gate 1 after Codex correctly
flagged the code and this specification as being in conflict
(`docs/reviews/2026-07-26-gate1-wip-reconciliation.md`, finding 2.3).

**This amendment supersedes the fixed-pulse language wherever it describes the
Firepit / area-field family.** Sections 1-11 and Amendment A remain authoritative
everywhere else.

## B1. What changes

**Superseded text:**

- §3 runtime family 1, "**Footprint pulse:** Firepit and Snare Post."
- §3 shared requirement, "Recurring area structures pulse at fixed intervals;
  they do not scan every simulation tick."
- §5.1 Firepit behavior, "Emits fixed damage pulses in an area larger than its
  footprint" and "Every enemy in the pulse area takes meaningful direct damage".
- §5.1 implementation note, "Store `nextPulseAt`" and "Perform one expanded
  axis-aligned rectangle check per pulse."
- §1 success criterion, "Recurring work uses fixed pulses or phase transitions
  rather than per-tick area processing" — **as it applies to the area-field
  family only.** It still binds every other family (cycles, entry triggers,
  volleys, telegraphs), which must remain bounded and event-driven.

**Replacement contract — the ALWAYS-ON AREA FIELD:**

- Family 1 is renamed **always-on area field**. Firepit is its first member; the
  true-aura Snare Post is expected to follow.
- There is no cadence and no `nextPulseAt`. Every enemy inside the structure's
  footprint expanded by `marginPx` takes `dps` **scaled by the tick delta**,
  continuously, and has its burn refreshed.
- One axis-aligned rectangle test per enemy per tick. A body straddling the seam
  between the two footprint tiles is charged exactly once.
- An empty footprint costs nothing beyond the rectangle test and records no
  occupancy.

## B2. Why — this is not a preference, it fixes a measured defect

The pulse model made a structure's output depend on **phase alignment with enemy
transit**. A body crossing the footprint in ~1 s ate 0 or 1 pulses essentially at
random depending on where the interval happened to land.

Measured, on both mazes (`docs/reviews/2026-07-25-firepit-falsification-test.md`):

- Pulsed, sited on the flanks: **0.073 targets per activation** — 93% of pulses
  landed on empty air.
- After ready-on-empty and funnel siting: **1.30 targets per armed pulse.**
- Continuous removes the phase-alignment term entirely, and makes the field's
  value a clean function of the **enemy-seconds it holds** — which is also the
  §8 occupancy metric the balance matrix needs.

## B3. Obligations this amendment carries

- **Instrumentation unit changes.** §8's "average targets per activation" is
  meaningless for a field with no activations. For this family the required
  metric is **enemy-seconds held** (`aoeStats.enemySeconds`), plus active ticks.
- **Performance must be profiled, not assumed.** Continuous processing is
  `O(structures x enemies)` per tick. In this project's regime (enemy cap ~200,
  single-digit field count per match) that is small, but Gate 1 flagged it as
  unprofiled and it stays unprofiled until Task 2's tick-order/limits work
  measures it. **If a worst-case profile shows it material, revisit this
  amendment rather than quietly capping the scan.**
- **Bounded-work constraint still binds every other family.** Nothing here
  licenses per-tick area processing for cycles, entry counting, volleys or
  telegraphs.
- **Tests must assert the contract, not the old vocabulary.** Assertions named
  for pulses that now verify continuous behavior are misleading even when green;
  they are renamed as the family's tests are touched.

## B4. Process note, recorded deliberately

The always-on behavior was implemented from a direct instruction during the
2026-07-25/26 session, but **the specification was not amended at the time**.
That inverted the program plan's global constraint — *"Claude Code may not modify
a specification to accommodate its implementation. Proposed design or scope
changes return to the user before code changes continue."* The code and the spec
then disagreed until Gate 1 caught it.

The lesson is not "the instruction was wrong" — it was Philip's call and it was
the right call on the measurement. The lesson is that **a ruling that contradicts
an authoritative document is not landed until the document says so.** Write the
amendment in the same session the ruling is given.

# Amendment C — Task 1 combat contract rulings (2026-07-29)

Philip ruled on all 19 rows of `docs/plans/2026-07-26-task1-decision-sheet.md`
in chat on 2026-07-29. Sections 1-11 and Amendments A-B remain authoritative
except where this amendment overrides them. This amendment closes Task 1's
structure-side rulings.

## C1. Firestorm — one authoritative volley, not eight server projectiles

**Supersedes §6.3** (behavior and implementation notes, struck above) **and the
projectile-caps half of Amendment A3.3.**

Firestorm resolves as **one authoritative server-side AoE volley** per
activation, not eight independent server projectiles:

- The eight fixed cardinal/diagonal direction vectors still define the
  volley's shape and are used only to place **cosmetic client projectiles** —
  no server collision entities, no flight simulation, no per-projectile speed
  or lifetime.
- On activation, the server directly computes which enemies fall within the
  volley's effective range/radius and applies moderate AoE damage and burn to
  each, once, in a single resolution.
- One volley = one `triggerAggro` call, through the null/structure path (see
  below) — not up to eight.
- No global or per-source active-projectile caps are needed; there is nothing
  to cap. The existing "at most one full explosion per enemy per volley" rule
  is retained but is now trivially satisfied by construction (one resolution
  can only hit an enemy once).
- Decorative trails/particles for the eight cosmetic projectiles remain
  client-only, exactly as before.

**Carried forward from Amendment A3.3, unchanged:** a structure-owned effect
still needs a null/structure path through `triggerAggro` — `ownerId` cannot
always resolve to a live player id for a team-owned structure. This applies to
Firestorm's volley and to any other team-owned structure damage.

## C2. Rock Trap — lock a world impact point, not the target's moved position

**Supersedes the resolution-position half of §5.2's implementation notes**
(struck above). "Lock the target ID during telegraph" is unchanged.

- At telegraph start: lock the selected target's ID (for highest-HP
  selection bookkeeping and primary-hit identification) **and** lock its
  current world position as the impact point.
- At impact: if the locked target ID is still within splash radius of the
  locked point, it receives the primary direct hit; splash resolves at the
  locked point regardless. If the target has left the splash radius (or been
  removed), only splash applies to whatever remains in range — the activation
  is not wasted, but it can no longer home in on a target that walked out of
  the telegraph.
- This is deliberately worse at guaranteeing the primary hit than "resolve at
  the target's impact-time position" was — that is the intended trade named in
  the decision sheet: a telegraph a fast enemy can actually walk out of.

## C3. Blizzard — lock a world impact point, matching Rock Trap

**Supersedes §6.5's implementation notes** (struck above).

- Dense-cluster selection at telegraph start is unchanged: choose the
  candidate with the most enemies within impact radius, breaking ties by
  distance then stable ID.
- Instead of locking that enemy's ID and re-centering on its impact-time
  position, lock the **cluster-center world point** at telegraph start.
- Impact always resolves at the locked point. This removes the "target death
  or invalidation during telegraph" edge case entirely — there is no tracked
  target to lose, only a committed point.

## C4. Wind-up scope note

A6 of the decision sheet also produced a ruling that touches the **character**
spec, not this one — see `Character Class Attack Redesign.md` Amendment A,
§A6. Recorded here only as a cross-reference: it does not change any structure
behavior.

## C5. Confirmed unchanged (Task 1 checkbox only, no text change)

- **B5 — fusion consent, permanence, team ownership, destruction-only
  removal:** reaffirmed, matches Amendment A1.1/A1.2. Gate 1 finding 2.2
  (`combos.js` destroys the neighbor without a consent gate) remains open,
  tracked remediation — not resolved by this amendment.
- **B6 — Steam Vent confusion stays last:** reaffirmed, no substitution.

## C6. Test baseline reconciled

The program plan's stated baseline (346 tests, 344 pass) is superseded by the
actual tree: **347 tests, 345 pass, 0 fail, 2 skipped**, confirmed by `npm
test` on 2026-07-29 against `a69a82c`. The delta traces to an edit to
`test/game/firepit.test.js` made outside the redesign changes. This is the
number Gate 2 should treat as authoritative.

---

# Amendment D — A1.4(a) restated: contribution, not equal gold (2026-08-15)

Ruled by Philip, 2026-08-15, on measurement rather than inference.

## D1. The premise A1.4(a) rested on is false

A1.4(a) priced a structure "at equal gold" against the Watchtower. That
comparison requires gold to be scarce. It is not, and this is now measured on a
validated instrument (`hallHpAuc`, regime R1, see
`docs/reviews/2026-08-15-metric-selection-v2-result.md`):

- **The pool saturates in every arm.** Across 16,200 runs of
  `fusion-roster-{earth,fire,water}-v2`, `towersPurchased` is 12.07–12.40 in
  *every* arm of *every* family on *both* mazes, and `goldUnspent` is ~300
  everywhere. The control cannot convert its surplus into Watchtowers because
  there is nowhere to put them.
- **The income lever is refuted.** 4,032 runs sweeping `HALL_BASE_INCOME`
  10 → 0 (`docs/reviews/2026-08-15-income-calibration.md`) leave
  `towersPurchased` identical to three decimals (12.142, sd 0.397) and
  `hallHpAuc` identical at every rung. At **zero** hall income the policy still
  ends 246 gold spare — 3.4x the cost of filling the entire 12-site pool.
- **Expanding the pool is ruled out too.** Both validated larger pools censor:
  `gapWideDeep` ceilings maze A at wave 8 and floors maze B at wave 9.

The defence is **site-limited, not gold-limited**. No knob in the shipped
economy creates the opportunity cost A1.4(a) assumed.

## D2. The ruling

**A1.4(a) is restated:**

> **(a) Contribution floor.** An individual elemental structure must make a
> **positive, resolvable contribution to the defence** in the scenario it was
> designed for, declared in advance before measurement. "Resolvable" means it
> clears the v2 verdict gates on the pre-registered primary metric against a
> matched no-structure control. Failing to contribute in *other* scenarios is
> expected and desired — that is what makes the roster distinct.

The Watchtower anchor survives as the **unit of magnitude** (1.0 power unit is
still one shipped Watchtower's contribution, and the ladder that calibrates it
is still the validated positive control). It is no longer a **purchase
alternative**, because the game never forces that choice.

(b) — no strict domination — is unaffected and remains the sharper of the two
clauses.

## D3. What this changes about the standing corpus

`fusion-roster-v2` measured exactly the restated bar (contribution at zero
opportunity cost) at n = 900/cell. Its results are therefore **verdicts under
A1.4(a) as amended**, not the "weaker-than-A1.4(a)" readings its §0 recorded.
The three positives (Grinder A +0.092, Magma Trap A +0.055, Blizzard B +0.242,
all 4/4 gates) **clear the contribution floor**; Steam Vent B (−0.137, 4/4
gates) **fails it**, and fails it in the worst way — negative while free.

Every verdict remains provisional on the empty cross-policy gate, and R1's
wave 9–10 scope limit still applies. Neither is changed by this amendment.

## D4. What this deliberately does NOT do

"Gold is not scarce" is very likely a **play** problem: a resource the player
never has to ration is a dead decision surface. That is a real design issue and
is logged as one. This amendment does not fix it, and must not be read as
declaring it fine. The rule is the reverse of what was almost done here: **fix
the economy for play reasons if and when it deserves fixing — never to rescue a
measurement.**

## D5. Standing procedure

Before designing any equal-cost comparison in this project, check
`towersPurchased` and `goldUnspent` in the target regime **first**. The
fusion-roster-v2 design failed to, and burned 16,200 runs on a contrast the
regime could not express.
