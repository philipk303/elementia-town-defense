# Character and Tower Redesign — Implementation Gap Review

Date: 2026-07-26

## Scope and baseline

No file named `tower-redesig.md` exists. This review treats
`docs/superpowers/specs/2026-07-25-combat-structure-redesign.md`, including its
authoritative Amendment A, as the requested tower redesign.

The working tree contains a substantial uncommitted partial tower implementation.
This review assesses that working tree, not only commit `2c220e3`.

Baseline verification:

- `npm test`: 346 tests, 344 passed, 0 failed, 2 skipped.
- Passing tests prove the partial implementation is internally consistent; they
  do not prove either redesign is complete.

## Executive assessment

The character redesign is not a constant-only rebalance. It replaces one shared
melee resolver with four attack families, adds a second projectile type and
wind-up state, changes bot positioning, expands client effects, and requires new
balance instrumentation. With placeholder graphics, budget roughly 5–8
engineering days plus 1–2 days for instrumentation and tuning.

The tower redesign is much larger. Approximately 25–35% of its foundation exists:
multi-tile footprints, walkable structures, enemy attacks against walkables,
exact 2x2 fusion geometry, and footprint serialization. Firepit is the only
structure whose runtime substantially resembles the redesign. The remaining
structures are legacy nearest-target placeholders. Full implementation is an XL
effort: roughly 35–55 additional engineer-days from the current working tree,
excluding production art/audio and elapsed playtest time.

Together, a realistic solo estimate is 8–12 focused engineering weeks from the
current working tree. A defensible playable milestone containing redesigned
characters, protocol/UI foundations, and the first few redesigned structures is
closer to 3–5 weeks.

## Decisions required before coding

The character specification explicitly leaves these authoritative details open:

- Wind wind-up duration within 100–150 ms.
- Earth cone angle and deterministic target order.
- Water and Fire hit/animation timing.
- Whether range values mean edge distance, as current melee does, or center
  distance.

Additional decisions exposed by the code:

- Define what Wind “attack commitment” means while retaining full movement:
  cancellation on downing, special use, input release, or a repeated basic.
- Define Wind projectile speed, hit radius, lifetime, and wall/structure
  collision.
- Define whether a missed basic consumes cooldown. Current melee consumes it
  before target acquisition.
- Define “increased aggro” for Earth. Current aggro accepts a boolean damage
  trigger, not an intensity or threat value.

The tower document and working tree also disagree about Firepit cadence. The
written design requires fixed pulses, while `server/game/towers.js:48-90` and
tests intentionally implement continuous elapsed-time DPS. This needs an explicit
spec amendment or a code reversal before further tuning.

## Character attack changes

### Server and shared model

1. Replace shared melee configuration in `shared/balance.js:223-236` with
   per-class basic profiles: damage, cooldown, shape, range, target cap,
   projectile settings, and optional aggro behavior.
2. Rename `meleeDamage`, `MELEE`, and `MELEE_LEVEL_MULT` to basic-attack
   terminology in `shared/balance.js:301` and `server/game/state.js:41`, retaining
   the current progression multipliers.
3. Split `tryBasicAttack` in `server/game/players.js:114-136` into bounded
   resolvers:
   - Earth: aim cone, deterministic distance/stable-ID ordering, cap three,
     8 damage, 750 ms.
   - Water: single nearest target, 34 px, 10 damage, 500 ms.
   - Fire: single target, 65 px, 12 damage, 700 ms.
   - Wind: pending wind-up followed by one fan projectile, 100 px, 11 damage,
     500 ms.
4. Extend `server/game/aggro.js:43-71` only after Earth’s enhanced-aggro rule is
   defined. Do not invent a general threat system without a concrete need.
5. Generalize `server/game/projectiles.js:28-107`. Fireball detonates on every
   termination path; the fan must hit exactly one enemy and disappear harmlessly
   on miss/range/lifetime/arena exit. Collision lookup must return a target, not
   only a boolean.
6. Add `FAN_BLADE` append-only to `PROJECTILE_TYPES` in
   `server/net/encode.js:29`.
7. Apply the approved Fireball values in `shared/balance.js:250-278`: 5,000 ms
   cooldown, 300 px range, 12 direct damage, 5 DPS for 2.5 seconds, unchanged
   44 px explosion radius.
8. Replace the universal 30 px bot approach in
   `server/game/bots.js:124-147` / `shared/balance.js:315` with class-specific
   preferred ranges and kiting/holding behavior.

### Client, animation, and audio

- Replace the generic `swing` cue with an attack event carrying attacker ID,
  element/type, aim/facing, and timing. Player snapshots currently omit enough
  information to reconstruct remote attacks reliably.
- Render projectiles by type in `client/src/scenes/GameScene.js:386-401`;
  currently all are orange dots.
- Add Earth sweep, Water palm, Fire extended saber slash, Wind pre-throw/fan,
  and distinct hit effects.
- Decide whether attacks reuse the existing generic `cast` atlas animation or
  add attack-specific animation names. Gameplay currently does not drive the
  loaded character animation set.
- Add or deliberately reuse audio cues. Current audio communicates generic
  melee/projectile/enemy-hit only.
- `client/src/assets/manifest.js:21-39` registers no production atlases or
  images, so final visual work is not an asset-hookup-only task.

### Character tests and balance

- Replace shared-melee assertions in `test/game/players.test.js:216-254` with
  exact per-class range, cooldown, damage, shape, and miss semantics.
- Earth: cone orientation, cap three, stable tie-break, multi-kill swap removal,
  and enhanced aggro.
- Wind: wind-up cancellation rules, full-speed movement, one hit/no pierce,
  harmless expiration, lifetime, bounds, interpolation, and attribution.
- Preserve Fireball AoE, burn, friendly-fire, range-boost, and aggro regressions.
- Add bot tests showing each class uses its intended range.
- Extend the harness with damage by class/source, attempts, hits, misses,
  cooldown utilization, deaths, control-seconds, and Fireball useful-hit rate.
- Measure single-target and clustered fights, all enemy speed tiers for Wind,
  and full ten-wave human-plus-bot runs. Test Water at 10 damage first; 9 is the
  specified fallback if Whirlpool produces excessive uptime.

## Tower redesign: already implemented in the working tree

- Elemental 2x1 / 1x2 and fusion 2x2 footprints:
  `shared/constants.js:83-92`, `server/game/structures.js:26-56`.
- Walkable type classification and cost-field exclusion:
  `shared/constants.js:94-108`, `server/game/structures.js:90-96`.
- Footprint-aware placement and occupancy:
  `server/game/structures.js:136-176`.
- Exact parallel-pair 2x2 fusion geometry:
  `server/game/combos.js:24-64`.
- Enemy attacks against walkable structures:
  `server/game/enemies.js`.
- Footprint fields on the wire and footprint-aware client hit testing:
  `server/net/encode.js:82-84,117`,
  `client/src/scenes/GameScene.js:135-140`.
- A real multi-target Firepit area implementation:
  `server/game/towers.js:48-90`.

These foundations have focused tests in `test/game/footprint.test.js`,
`test/game/walkableStructures.test.js`, `test/game/combos.test.js`, and
`test/game/firepit.test.js`.

## Tower redesign: required code changes

### Placement, protocol, and ownership

1. Forward and validate orientation and independent output direction through
   `client/src/scenes/GameScene.js:115-126`, `server/index.js:179-186`, and
   `server/game/economy.js:101-104`.
2. Add placement ghost, footprint/range preview, rotation/direction controls,
   server rejection feedback, and fusion-result preview.
3. Replace immediate auto-fusion in `server/game/combos.js:37-64` with a pending,
   idempotent confirmation protocol. Handle two humans, human-plus-bot,
   disconnects, stale structures, concurrent attempts, rejection, and timeout.
4. Make fusions explicitly team-owned and unsellable. Current
   `sellStructure` at `server/game/structures.js:187-196` permits any player to
   sell a structure and receive the refund.
5. Connect `tryChannelRepair` to shipped input/tick behavior; it currently has
   tests but no runtime caller.

### Runtime architecture

Do not extend `BALANCE.TOWER` into a universal optional-field DSL. Keep stable
numbers in data and dispatch to small explicit behavior families:

- Footprint/aura processing: Firepit and Snare Post.
- Ready → target → telegraph → impact → cooldown: Watchtower, Rock Trap,
  Water Geyser, Blizzard.
- Structure cycle machines: Wind Vortex and Grinder.
- Persistent entry/area statuses: Steam Vent and Muddy Bog.
- Entry-count trigger: Volcano.
- Radial projectile volley: Firestorm.

The current `server/game/towers.js:92-107` still applies nearest-target behavior
to nearly every structure, so existing Rock Trap, Geyser, Vortex, and all six
fusion implementations are functional placeholders, not redesign progress.

### Per-structure behavior gaps

- Watchtower: preserve behavior; add explicit distance then stable-ID tie-break.
- Snare Post: replace one-target slow with a true bounded group aura and linger.
- Rock Trap: max-HP → distance → stable-ID selection, target lock, telegraph,
  impact-time position, direct plus splash without double-hit.
- Water Geyser: footprint-only selection, direction, damage, weight-scaled
  displacement, collision-safe travel.
- Wind Vortex: suction/release cycle, tracked stable IDs, direction, weight
  scaling, per-source immunity, destruction cancellation, reconnect state.
- Steam Vent: persistent occupancy, bounded confusion/heading/immunity, status
  flag and navigation/targeting integration.
- Volcano: per-enemy entry counting, charge state, eruption, passive-vs-burst
  split, destruction cleanup.
- Firestorm: bounded radial volley, structure-owned projectile attribution,
  per-volley hit protection, range/lifetime/cap/skip rules, FX budget.
- Muddy Bog: per-Bog crossing state, source-owned root, weight durations, damage
  only during owned root, lingering slow, cleanup on destruction.
- Blizzard: densest-cluster deterministic target, telegraph, one AoE resolution,
  damage plus freeze.
- Grinder: intake/crush/eject cycle, inner/outer zones, one damage application,
  immunity, direction, destruction cancellation.

### Dynamic state and networking

Static structures are only resent when `placedVersion` changes and currently
carry `[id,type,gx,gy,hp,w,h]` in `server/net/encode.js:76-84`. Add:

- Orientation and output direction to static placement records.
- A compact per-update dynamic structure channel keyed by stable structure ID for
  phase, deadline, cooldown/charge, and cycle sequence.
- Backward-compatible defaults and round-trip/reconnect tests.
- A solution for stale nonlethal structure HP; today damage does not bump
  `placedVersion`.

Do not bump `placedVersion` for every phase change; that would resend the full
structure roster repeatedly.

### Status, lifecycle, performance, and tick ordering

- Add preallocated confusion fields and a flag bit. Add `rootSourceId` and
  bounded per-source immunity/cycle fields without hot-path allocation.
- Track stable enemy IDs, never dense typed-array slots, across telegraphs and
  cycles. Resolve the ID at impact and handle swap removal.
- Destruction must cancel scheduled activations, tracked memberships, future
  structure-owned projectiles, and source-owned roots where specified.
- Preserve one documented tick-order contract. Players currently resolve before
  enemies/projectiles/towers; structure displacement therefore influences
  ordinary movement on the next tick.
- Use fixed cadence/deadlines and bounded projectile/FX caps. Profile before
  introducing a spatial index.
- Ensure structure-owned Firestorm damage does not pull aggro toward an arbitrary
  player owner.

### Client graphics and UX

`GameScene.js:320-342` positions a structure by its anchor and draws a one-tile
object even when `w/h` are larger. Required work includes:

- Correct multi-tile center, footprint size, orientation, and direction.
- Placement ghosts, validity and fusion preview, consent dialog/state.
- Range/footprint/hit-area indicators that match server geometry.
- Rock shadow/fall/impact; Geyser arc; Vortex suction/release; Volcano charge and
  eruption; Firestorm volley; Blizzard spikes; Grinder intake/crush/eject;
  fusion creation/destruction.
- Phase, cooldown, or charge indicators where gameplay readability needs them.
- Logical SFX, assets, mappings, and audio-map tests for activation phases and
  fusion UX.

This is a meaningful client feature set, not final polish.

## Test and balance implications

### Correctness suites

Add family-level tests rather than only one test per structure:

- Deterministic selection and stable-ID resolution after swap removal.
- Telegraph target death, destruction during phase, reconnect/full snapshot.
- Entry/exit/re-entry, overlapping sources, immunity, and cleanup.
- Wall, corner, arena-bound, velocity-cap, and tunnel prevention.
- No duplicate direct/splash/volley damage.
- Fusion consent, bot delegation, ownership, permanence, repair, and stale
  confirmation.
- Visual effect caps and projectile caps under worst-case volleys.

### Soft-lock gates

Retain the amendment’s hard requirement of zero hangs in 144 runs on both maze A
and maze B before accepting walkability changes, Wind Vortex, Steam Vent, or
Grinder. Add focused adversarial tests for hall-ring behavior, crowd compression,
confused navigation, overlapping displacement, and destruction mid-cycle.

### Instrumentation before tuning

The current harness lacks most required measurements. Add per-structure:

- Direct and status damage.
- Unique enemies affected and targets per activation.
- CC-seconds by effect/source.
- Net path progress caused by displacement.
- Attempts, useful activations, wasted activations, and cooldown utilization.
- Occupancy and entry counts.
- Active/peak/skipped projectiles.
- Ingredient-versus-fusion contribution.

Teach policies to place orientation- and direction-dependent structures before
judging their power. Declare each structure’s intended scenario and skill
dependency before running results.

Use the Watchtower-at-equal-gold anchor inside a defense. Test open lanes, packed
chokes, split lanes, and light/heavy/mixed elite compositions. Rebaseline after
fusion consent/team ownership because the current auto-fusion numbers will be
invalid.

## Recommended implementation order

1. Reconcile the Firepit cadence conflict and settle character open decisions.
2. Add instrumentation primitives and a versioned dynamic-structure wire format.
3. Implement character basics, Fireball retune, bots, placeholder VFX, and
   regressions.
4. Finish orientation/direction protocol and client placement/rendering.
5. Preserve Watchtower; implement true Snare Post, Rock Trap, and Geyser.
6. Add bounded displacement/immunity primitives; implement Vortex and run hard
   hang gates.
7. Implement consent, team ownership, permanence, repair, and rebaseline.
8. Implement fusions one family at a time: Firestorm, Volcano, Blizzard, Steam
   Vent, Muddy Bog, Grinder, with required gates.
9. Run the full balance matrix, tune numbers, then produce final art/audio and
   presentation polish.

## Effort and complexity

Approximate remaining engineering effort from the current working tree, for one
experienced engineer:

| Workstream | Effort | Complexity |
|---|---:|---|
| Decisions, spec reconciliation, protocol design | 2–3 days | Medium |
| Harness metrics and policy foundations | 4–6 days | High |
| Character basics, Fireball, bots, placeholder client work | 5–8 days | Medium-high |
| Orientation/direction UI and dynamic structure wire state | 5–8 days | High |
| Snare, Rock Trap, Geyser, Vortex | 6–10 days | High |
| Fusion consent, ownership, permanence, repair | 4–6 days | High |
| Six fusion behaviors | 10–16 days | Very high |
| Balance matrix, profiling, reconnect/VFX QA | 6–10 days | High |

Expected total: approximately 42–67 engineer-days. Some work can overlap across
server, client, and assets with multiple people, but balance iteration and
soft-lock gates remain sequential. Production art, animation, sound creation,
and elapsed playtest time are additional.

## Primary architecture concerns

1. A universal tower configuration object would become an unsafe behavior DSL.
2. Static/dynamic snapshot separation is a wire-compatibility and reconnect risk.
3. Dense enemy swap removal makes retained indices corrupt targeting.
4. Destruction cleanup spans statuses, cycles, projectiles, and client effects.
5. Fusion consent changes UI, server protocol, ownership, economy, and harness
   atomically.
6. Displacement/confusion can reproduce known soft-lock signatures.
7. Current passing tests pin several legacy placeholder behaviors and must be
   deliberately replaced, not treated as proof of design completion.

