# Character Class Attack Redesign

**Status:** Design handoff; no gameplay code changed  
**Purpose:** Consolidate the current implemented character combat values and the proposed class-attack redesign discussed after the combat-structure redesign. This document distinguishes authoritative current behavior from proposed tuning and flags decisions that remain open.

## 1. Design goal

The four classes currently share identical basic-melee behavior and differ only in health, movement speed, weight, and basic damage. This contradicts the intended roles: Earth is both the safest and strongest basic attacker, while Wind is the most fragile and weakest despite being described as a glass cannon.

The redesign should make each basic attack complement the class's complete kit:

- **Earth:** tank and close-range group controller.
- **Water:** durable control generalist that pulls enemies into close range.
- **Fire:** ability-driven burst attacker with safer reach between cooldowns.
- **Wind:** fragile, sustained ranged damage dealer whose specials emphasize movement and displacement.

Basic attacks must be tuned with first and second specials included. Damage numbers alone are insufficient; reach, target count, cadence, safety, control, mobility, HP, and movement speed all consume the same power budget.

## 2. Current implemented values

Authoritative source: `shared/balance.js`.

### 2.1 Class durability, movement, and shared basic behavior

| Class | Max HP | Movement speed | Current basic damage | Current basic DPS |
|---|---:|---:|---:|---:|
| Earth | 140 | 70 px/s | 13 | 26 |
| Water | 100 | 90 px/s | 11 | 22 |
| Fire | 80 | 100 px/s | 9 | 18 |
| Wind | 70 | 130 px/s | 8 | 16 |

All four current basics use exactly the same mechanics:

- 34 px range.
- 500 ms cooldown.
- Single target.
- Select the nearest living enemy in range.
- Same attack and hit behavior.
- Same team-level damage multipliers.

Current basic multipliers are 1.0 at L1, 1.15 at L2, 1.35 at L3, and 1.6 at L4.

### 2.2 Current first specials

| Class | Ability | Cooldown | Direct damage | Area/range | Additional effect |
|---|---|---:|---:|---|---|
| Earth | Ground Slam | 5.0 s | 16 | 90 px radius | 150-power outward knockback |
| Fire | Fireball | 3.5 s | 16 | 380 px max range; 44 px explosion | 6 DPS burn for 2.5 s; 31 maximum total damage |
| Water | Whirlpool | 4.5 s | 12 | 120 px radius | 340-power pull |
| Wind | Wind Blast | 5.0 s | 12 | 150 px radius | 400-power outward knockback |

At L3, the current plan applies a 1.3 multiplier to first-special damage and area/range. The second abilities do not receive this L3 boost.

Important correction: Fireball currently does not push enemy targets. Its `ffShove` displaces teammates only when friendly fire is enabled. Adding enemy knockback would be a separate redesign and is not recommended here.

### 2.3 Current L4 second specials

| Class | Ability | Cooldown | Direct damage | Area/range | Additional effect |
|---|---|---:|---:|---|---|
| Earth | Fissure | 8.0 s | 20 | 180 px long, 44 px wide | 1.5 s root |
| Fire | Flame Nova | 9.0 s | 26 | 130 px radius | 10 DPS burn for 3 s; 56 maximum total damage |
| Water | Tidal Wave | 9.0 s | 10 | 170 px cone | 500-power knockback and 4 s Wet |
| Wind | Gale Dash | 7.0 s | 14 | 150 px dash; 40 px hit radius | Self-mobility through the attack path |

### 2.4 Current full-kit pressure

The following DPS-equivalent figures divide potential single-target damage by cooldown. They expose the broad balance shape but do not represent actual match DPS or account for multi-target hits.

| Class | Current basic DPS | First-special DPS-equivalent | Second-special DPS-equivalent | Primary non-damage value |
|---|---:|---:|---:|---|
| Earth | 26 | 3.2 | 2.5 | Knockback, root, highest durability |
| Water | 22 | 2.7 | 1.1 | Strong pull/push and Wet |
| Fire | 18 | 8.9 | 6.2 | Ranged and radial AoE burn |
| Wind | 16 | 2.4 | 2.0 | Broad knockback, mobility, highest speed |

The implemented distribution makes Earth over-rewarded and Wind under-rewarded. Fire's specials already carry substantially more damage than the other classes, so Fire should not also receive the strongest basic attack.

## 3. Proposed basic-attack redesign

These values are the approved initial test baselines. They remain subject to instrumented simulation and playtesting rather than being treated as final shipped balance.

| Class | Proposed basic | Damage | Cooldown | Approx. single-target DPS | Proposed reach/shape |
|---|---|---:|---:|---:|---|
| Earth | Heavy stone sweep | 8 | 750 ms | 10.7 | Short cone; up to three enemies |
| Water | Flowing palm strike | 10 | 500 ms | 20.0 | 34 px; one target |
| Fire | Long saber/flame slash | 12 | 700 ms | 17.1 | 65 px; one target |
| Wind | Fan-blade projectile | 11 | 500 ms | 22.0 | 100 px; one target |

The existing shared melee multiplier should become a shared **basic-attack multiplier**, because Wind would no longer use melee. Retain the current level multipliers initially so relative class identities remain stable.

### 3.1 Earth: tank/controller

- Lowest single-target basic damage.
- Slow, broad melee sweep hitting at most three nearby enemies.
- Increased aggro generation is preferred over additional damage.
- The sweep generates increased aggro but does not add a defensive damage-reduction window in the initial baseline.
- Earth retains 140 HP, 70 px/s speed, Ground Slam, and Fissure.

Earth's total output rises when surrounded, but it no longer deletes priority targets. Its reward is safely occupying the choke and controlling a group.

### 3.2 Water: close-range control generalist

- Fast, close-range flowing-palm or water-enhanced strike.
- One target initially; an earlier two-target piercing suggestion was superseded because Whirlpool and Tidal Wave already provide strong group control.
- The close basic deliberately synergizes with Whirlpool pulling enemies toward Water.
- Do not add default slow or Wet to every basic hit; that would dilute the special abilities and structures.
- Start at exactly 34 px range. If instrumented testing shows that Whirlpool enables near-perfect basic-attack uptime and makes Water dominant, reduce the basic to 9 damage (18 DPS) before weakening its control identity.
- Water retains 100 HP and 90 px/s speed.

Water has 25% more HP than Fire but moves 10 px/s more slowly.

### 3.3 Fire: ability-driven ranged/skirmishing burst

- Slower, longer-reaching single-target saber or flame slash.
- Preserve Fire's established long-saber art; exchange Water and Fire's tactical basic profiles, not their visual weapons.
- Reach remains substantially below Wind's fan projectile.
- Do not add basic-attack burn. Fireball, Flame Nova, Firepit, and Fire fusions already provide extensive burn.
- Fire retains 80 HP and 100 px/s speed.

Fire's basic is deliberately modest because Fireball and Flame Nova supply the damaging peaks.

### 3.4 Wind: sustained ranged glass cannon

- Compact, 100 px fan-blade projectile.
- Highest sustained basic damage.
- Single target with no pierce.
- Projectile terminates on collision, maximum range, maximum lifetime, or arena exit.
- Wind retains full movement speed while attacking. A brief 100-150 ms pre-throw wind-up provides visual telegraphing but does not slow or stop movement.
- Wind retains 70 HP and 130 px/s speed, making it both the fastest and least durable class.

Wind is already faster than every enemy. Reducing the projectile to 100 px, 11 damage, and a 500 ms cooldown constrains its former combination of speed, range, and damage. Practical hit rate and kiting effectiveness must still be measured rather than relying only on theoretical DPS.

## 4. Approved Fireball retune

The Fireball nerf was explicitly accepted in conversation.

| Attribute | Current implemented | Approved proposed value |
|---|---:|---:|
| Cooldown | 3.5 s | 5.0 s |
| Maximum range | 380 px | 300 px |
| Direct damage | 16 | 12 |
| Burn | 6 DPS for 2.5 s | 5 DPS for 2.5 s |
| Maximum total damage | 31 | 24.5 |
| Explosion radius | 44 px | 44 px unchanged |

Rationale:

- Fire currently combines strong movement, long range, high special frequency, direct damage, AoE, and burn.
- Reducing cooldown, range, and damage pressure prevents Fire from dominating simultaneously on every axis.
- The explosion radius remains unchanged so Fireball retains a satisfying group identity.
- Enemy knockback should not be added; it creates trap anti-synergy and adds power Fire does not need.

## 5. Proposed full-kit outcome

Using the latest proposed basic values, the approved Fireball retune, and unchanged second specials gives this approximate single-target damage pressure before multi-target value and utility:

| Class | Proposed basic DPS | First-special DPS-equivalent | Second-special DPS-equivalent | Approx. combined pressure |
|---|---:|---:|---:|---:|
| Earth | 10.7 | 3.2 | 2.5 | 16.4 plus cleave/control/tanking |
| Water | 20.0 | 2.7 | 1.1 | 23.8 plus strong displacement |
| Fire | 17.1 | 4.9 | 6.2 | 28.2 plus burst/AoE burn |
| Wind | 22.0 | 2.4 | 2.0 | 26.4 plus range/mobility/control |

These are not final balance targets. They show the intended ordering:

- Earth trades damage for durability, aggro, cleave, and control.
- Water provides moderate dependable damage and the deepest positioning toolkit.
- Fire delivers ability-driven burst and AoE damage.
- Wind delivers the highest sustained basic pressure but has the least HP and requires attack commitment.

The practical Fire/Wind comparison must account for Wind's missed projectiles and wind-up, Fire's AoE and burn uptime, and both classes' ability to avoid damage.

## 6. Superseded proposals

Do not implement these older exploratory values:

- Initial Water proposal: 10 damage every 600 ms with medium reach and possible two-target piercing. It was replaced by the faster close-range Water basic after the Fire/Water tactical-profile exchange.
- Initial Fire proposal: 12 damage every 450 ms as the strongest dependable melee DPS. It was rejected because Fire's specials already dominate damage.
- Initial generic Wind proposals: 14 damage every 550 ms and later every 475 ms at 110-140 px range. They were replaced by 11 damage every 500 ms at 100 px with full-speed movement and a brief visual wind-up.
- Fireball enemy push. The current code never pushes enemies, and adding it is not recommended.
- Removing every dimension of Fireball power. Explosion radius remains 44 px to preserve identity.

## 7. First-slice scope decision

The authoritative slice-one design and implementation plan include both ability tiers:

- L1 at wave 1: first special.
- L2 at wave 3: diagonal fusion-combo unlock.
- L3 at wave 6: 1.3 first-special damage and area/range boost.
- L4 at wave 8: second special.

All four second specials—Fissure, Flame Nova, Tidal Wave, and Gale Dash—are already implemented and tested. The user questioned whether they belonged in the first build, but the plan was checked and shown to include them explicitly. No subsequent decision removed them.

Therefore the current handoff decision is:

- **Second specials remain in slice one.**
- Removing them would be a new scope change, would erase the wave-eight progression reward, and would save little engineering work because the systems already exist.

## 8. Required implementation planning and verification

No gameplay implementation is authorized by this document alone. A follow-up implementation plan should address:

1. Per-class basic specifications instead of one shared melee shape.
2. Server-authoritative fan projectile lifecycle and wind-up/attack commitment.
3. Earth cone targeting with a strict target cap and deterministic ordering.
4. Water and Fire range checks and class-specific animation events.
5. Renaming shared melee-level scaling to basic-attack scaling without changing progression behavior.
6. Approved Fireball constant changes.
7. Bot range gates and behavior for the four new basic attack profiles.
8. Client animation and hit-VFX support that matches established character silhouettes.
9. Regression coverage for aggro, friendly fire, enemy swap-removal, downed/dead states, and L1-L4 progression.

Balance verification should report:

- Damage dealt by basics, first specials, and second specials separately for each class.
- Single-target and clustered-group output.
- Attack uptime and miss rate.
- Damage taken and deaths by class.
- Enemy-seconds controlled through knockback, pull, root, and Wet interactions.
- Wind kiting effectiveness against every enemy speed tier.
- Fireball useful-hit rate before and after the range/cooldown reduction.
- One-human-plus-bots and all-human results across the full ten-wave slice.

## 9. Open decisions before coding

**Resolved by Amendment A (2026-07-29) — see that section for full text:**

- ~~Exact Wind fan wind-up duration within the approved 100-150 ms visual-telegraph range.~~ Resolved: 125 ms (Amendment A, A1).
- ~~Exact Earth cone angle and deterministic three-target ordering.~~ Resolved: 90 degrees, distance then stable enemy ID (Amendment A, A4).
- ~~Exact animation/hit timing for Water's palm strike and Fire's extended saber slash.~~ Resolved for basics: instant, no server wind-up (Amendment A, A6). Specials are a separate, new ruling — see Amendment A, A6.

**Still open:**

- Whether the approved initial basic constants survive instrumented simulation unchanged. Evidence answers this at Phase 8H (Amendment A, A9), not before.
- Exact millisecond wind-up values for each first/second special (Amendment A, A6 fixes only the ordering and a 300 ms cap).

The approved Fireball values and continued inclusion of L4 second specials are not open decisions.

# Amendment A — Task 1 combat contract rulings (2026-07-29)

Philip ruled on all 19 rows of `docs/plans/2026-07-26-task1-decision-sheet.md`
in chat on 2026-07-29. Sections 1-9 above remain authoritative except where
this amendment overrides them. This is this spec's first amendment.

## A1. Wind wind-up duration — 125 ms

Wind's basic fan-projectile wind-up is **125 ms**, the midpoint of §9's
approved 100-150 ms range.

## A2. Wind attack-commitment semantics

The full rule, replacing the previously-undefined "commitment":

- Cooldown is consumed at wind-up **start**.
- Movement is unaffected for the whole wind-up.
- Cancelled **only** by down or death.
- **Not** cancelled by input release, casting either special, or pressing
  basic again — a repeated basic during wind-up is ignored (it is on cooldown
  regardless).
- No cooldown refund on cancel; the cooldown was spent at wind-up start.

## A3. Wind fan projectile constants

| Attribute | Value |
|---|---:|
| `speedPx` | 500 |
| `hitRadiusPx` | 8 |
| `maxRangePx` | 100 |
| `lifetimeMs` | 400 (failsafe only — range terminates first in every normal case) |

Enemy-only collision; no wall or structure collision in v1. Termination on
collision, max range, max lifetime, or leaving arena bounds — the same
termination pattern as the existing Fireball.

## A4. Earth cone

90-degree cone, cap 3 targets, ordered by distance then **stable enemy ID**
(not dense array index — swap-removal reorders slots within a tick).

## A5. Earth aggro

Multi-target contact only: the sweep calls `triggerAggro(byDamage=true)` on up
to three enemies, where every other class pulls one. No threat-intensity
subsystem — explicitly deferred.

## A6. Water/Fire basic hit timing, and a new special-ability wind-up

**Basic attacks (§9's original question): resolved as recommended, unchanged.**
Water's and Fire's basic attacks remain **instant, server-side, no wind-up** —
resolved exactly like the current shared melee. The client animation's hit
frame is cosmetic and must never gate server damage. Wind's basic remains the
only class with a telegraphed basic attack.

**New, ruled at the same sitting but outside §9's original scope: every first
and second special, across all four classes, gets a small server-side
wind-up.** This is a net-new mechanic — no special currently has one — and
requires its own implementation planning (a state machine and cancel rules)
before coding; A2's Wind-basic-specific commitment rule does not automatically
extend to it.

- No special wind-up exceeds **300 ms**.
- Ordering, fastest to slowest: Wind's basic (125 ms, fixed, for reference) <
  Water's first special (Whirlpool) < Fire's first special (Fireball) <
  Wind's specials (Wind Blast, Gale Dash).
- Earth's specials (Ground Slam, Fissure) share Water's first-special
  (Whirlpool) wind-up duration.
- Water's second special (Tidal Wave) and Fire's second special (Flame Nova)
  are constrained only by the 300 ms cap; their relative ordering against the
  above was not ruled and is not implied.
- **Exact millisecond values are not pinned by this ruling.** They are picked
  during instrumented tuning, the same treatment §3/A9 give the basic-attack
  constants. The ordering and the 300 ms cap are the contractual constraint;
  the numbers are not.

## A7. Range semantics

Edge distance (attacker radius + target radius) for every basic, universally —
matches `players.js:126`'s existing `reach` computation. Applies to Earth's
cone origin and Wind's projectile spawn as well.

## A8. Missed basics consume cooldown

Yes, for every class. For Wind this resolves at wind-up start (A2), not at
projectile expiry.

## A9. Basic-attack constants

§3's table is adopted as **initial test baselines**, explicitly not final
balance. Whether they survive instrumented simulation is answered with
evidence at Phase 8H, not now.

## A10. Shared multiplier rename

`MELEE_LEVEL_MULT` becomes `BASIC_LEVEL_MULT`. Pure rename; current per-level
values are retained unchanged so class identities stay stable. Touches
`BALANCE.LEVELING`, `players.js:132`, `leveling.test.js`.
