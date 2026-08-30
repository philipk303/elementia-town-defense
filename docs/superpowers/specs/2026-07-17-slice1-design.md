# Elementia Town Defense — Slice 1 Design

**Status:** Complete draft, ready for user review. All sections decided through a brainstorming pass
plus a two-reviewer Fable 5 adversarial review (see
[`2026-07-17-adversarial-review.md`](2026-07-17-adversarial-review.md)); every review finding has
been folded in. Next step after user sign-off: `superpowers:writing-plans` to produce the slice-1
implementation plan. **Do not begin implementation until the user has reviewed this spec.**

**Core design assumption (applies throughout):** slice 1 targets **co-op with friends in private
rooms, not public matchmaking.** This justifies the high-trust design choices below (free
displacement that can "feed the base," personal wallets with no hard spend policing, etc.). Public
matchmaking and anti-grief hardening are explicitly out of scope.

---

## Section 1: Core Concept & Phases

**Elementia Town Defense** — 2–4 human players (online, cross-platform **desktop / tablet / mobile in
landscape**), each picks one of 4 elements (Earth, Fire, Water, Wind), co-op defends a town across a
fixed **10-wave run** against an AI-controlled greenskin horde with escalating variety. Mobile is
supported natively by the wide landscape map (Section 3) with no scrolling camera and no separate
mobile layout.

**The team is always 4 elemental characters:** any element slot not taken by a human is filled by an
**AI teammate bot** (see Section 2, *AI teammates*). So all 4 elements — and thus all 6 combos — are
always present, and the game is **always balanced for a 4-defender team** regardless of how many
humans are in the room.

Each wave alternates two phases:

- **Build phase** — room creator chooses timing style at room creation: fixed timer / ready-up /
  timer-with-early-start-if-all-ready. Players place towers and defenses on an **open buildable grid**
  (players shape the enemy path themselves via maze-building, not fixed lanes; see the cost-field
  architecture in Section 5). A **wave preview** shows the next wave's rough composition and which
  gate opens next.
- **Fight phase** — hard lockout on new builds. Players directly control their chibi elemental
  characters: movement, shared basic attack, and element-specific special attack, and can pull/fight
  enemies directly (Section 4 aggro). Damaged structures can be **repaired** (not rebuilt) by
  channeling next to them for a few seconds at reduced cost vs. a fresh build — a stay-and-defend vs.
  keep-fighting tension. Selling is disabled during fight phase.

**Room settings (chosen by room creator):**
- Build-phase timing style (fixed timer / ready-up / timer + early-start).
- **Friendly fire on/off** — when on, player abilities (AoE damage, knockback, pulls) affect
  teammates; when off, these ignore other players. (FF governs *teammate* effects only — it does not
  govern enemy repositioning; see Section 4.) All AoE/knockback/pull effects must check this flag.

**Loss condition:** the **town hall** falls. A princess NPC resident in the town hall is "captured"
when it falls — narrative weight on top of the destructible-town-hall mechanic, not a separate
system. She narratively "grants" abilities/boosts as players level up (flavor framing for the
leveling ladder in Section 2).

**Win condition:** survive all 10 waves. **Final score = town integrity (town hall HP remaining) +
citizens still alive.** (The earlier undefined "animals" term is removed.)

---

## Section 2: Characters, Combos & Progression

### Base kits

| Element | Weight | Speed | Special Attack | Special Structure |
|---|---|---|---|---|
| Earth | 4 (heaviest) | 1 (slowest) | Ground Slam — slows & damages an area | Rock Trap — collapses on enemies, blocks path |
| Fire | 2 | 3 | **Fireball** — thrown projectile, medium-high damage | **Ember Trap** (placeholder name) — ignites enemies, burn-over-time |
| Water | 3 | 2 | **Hydro Blast** — narrow AoE, weight-scaled knockback (long push on light enemies), **modest damage** (value is positioning control, not damage) | Wet Moat — smaller area, slows + damages, applies "Wet" status |
| Wind | 1 (lightest) | 4 (fastest) | Whirlwind — weight-scaled *pull*, clusters enemies (heavy resist) | Blowing Fan — broad AoE, light damage, weight-scaled *push* |

Every player also has a shared **melee basic attack** (all classes — you must close to contact range
to use it, which naturally pulls aggro; see Section 4) and access to generic towers all classes can
build (Section 3). Each player also places **one free special structure** at the first build phase
(Section 3, start agency).

**Structure ownership (element identity):** a human builds **their own** element's special
structures (element-locked). But because empty slots are bot-filled (below), **bot-controlled
elements' special structures are buildable by any human** — so all 4 structure types are always
placeable and all 6 combos are always accessible, while per-player structure identity is preserved in
all-human games.

### Crowd-control taxonomy — the two-axis counter-triangle

CC splits into three families that scale on **two different stats**, which makes each unit's identity
double as its counter:

- **Displacement (push / pull)** scales by **WEIGHT.** Light = flung far; heavy = barely nudged;
  **super-heavy = fully immune.**
- **Slow** and **Root / Freeze** scale by **SPEED.** Slow units are easily slowed/rooted; fast units
  resist; **super-fast = fully immune to slow/root.**

Weight tiers: light / medium / heavy / **super-heavy** (displacement-immune). Speed tiers include a
**super-fast** tier (slow/root-immune). This yields a clean counter-triangle among the Elite units
(Section 4): the Elite Troll (super-heavy) can't be displaced but is slow → root and burst it; the
Elite Goblin (super-fast) can't be slowed/rooted but is only medium weight → displace it; the Elite
Orc is heavy **and** fast — immune to neither, resistant to both — so it has no clean counter and is
the hardest elite. One sentence teaches each.

**Interaction rules (decided):**
- **Root and displacement are independent** — a rooted/frozen enemy **can** still be pushed/pulled
  (enables intentional pull-into-trap combos). Accepted tradeoff: this keeps the anti-synergy risk
  (a careless pull yanks enemies out of a teammate's trap) as a coordination skill test.
- **No progress clamp** — displacement works in *all* directions, including toward the town hall.
  Maximum skill ceiling; the "pull the horde into your own base" misplay is a real, accepted cost
  (justified by the friends-not-matchmaking assumption).

### Synergy combos (tower adjacency, build-phase only, deterministic / server-validated)

| Pair | Combo | Effect |
|---|---|---|
| Earth + Fire | Magma Trap | Wide-area trap, massive damage |
| Fire + Wind | Firestorm | Structure lobs a broad volley of fireballs across an area |
| Water + Earth | Muddy Bog | Wide quicksand trap — enemies rooted for a duration, damage over that time |
| Wind + Water | Blizzard | Freezes drenched ("Wet") enemies in place |
| Fire + Water | **Steam Vent** | **Working combo in slice 1** — a steam cloud: brief blind/slow + light damage |
| Wind + Earth | Grinder | Clusters enemies (Whirlwind-style pull) then crushes them with sustained damage |

**All 6 pairs are usable in slice 1.** The earlier "Steam Vent starts as a conflict/penalty and L8
upgrades it" arc is **deferred to the full game** (it depended on L8, which is out of slice-1 scope,
and it left the common 2-player Fire+Water duo with zero usable combos). In the full game, Steam Vent
becomes conflict-by-default that L8 upgrades into a stronger controlled burst/blind structure.

Live **ability-layering combos** (real-time overlap during fight phase) remain **deferred to slice
2+**. Slice 1 does tower-adjacency combos resolved at build time only.

### Progression ladder — synchronized wave-based leveling

Everyone levels up together at fixed wave milestones, regardless of individual kill count. Keeps the
power curve balanced and the team identity clean.

- **L1 (wave 1):** base kit + free special structure + starting adjacency combos.
- **L2 (wave 3):** a new synergy pair unlocks for everyone simultaneously (the diagonal combos).
- **L3 (wave 6):** global power boost to special attacks (damage/area).
- **L4 (wave 8):** new individual special ability (per class).
- **L5–L9:** *deferred past slice 1* — L5 building-ability boost, L6 individual building ability, L7
  team-building boost, L8 team-building unlock (Steam Vent mastery lives here), L9 individual ability.

**Slice 1 scope: L1–L4 only.** Milestones are pinned to **waves 1 / 3 / 6 / 8** so the last new
ability is learned *before* the finale (see the Section 4 beat sheet). Active/synchronized team
*attack* abilities were dropped from scope (too much netcode/timing cost for the value).

### AI teammates (slot-filling bots)

Any element slot not taken by a human is filled by an **AI teammate bot**, so the team is always 4
elemental characters (all 4 elements / 6 combos always present; game always balanced for 4 — see
Section 1).

- **Combat-only.** Bots move, use the **melee basic attack** and their element's special attack,
  follow the exact same **aggro rules as players** (bots are valid aggro targets *and* pull aggro by
  attacking — they participate in the tank/DPS dynamic), and **can revive and be revived.** Bots do
  **not** build or manage economy.
- **Humans build everything.** Bot-controlled elements' special structures are buildable by any human
  (see *Structure ownership* above), so combos stay fully accessible. **Free starting structures:**
  all 4 elements each get one — human elements placed by their human, **bot elements auto-placed by
  the bot near the hall** (humans may sell/relocate).
- **Economy:** income splits among **humans only**; ownership dividends go to human builders (Section
  3). Bots neither earn nor spend.
- **Mid-run human takeover:** a human joining mid-run takes over a bot's element, inheriting its
  position/state; that element's structures become element-locked to the new human, and
  already-built structures persist.
- **Implementation note:** reuses ez-ctf's player-bot FSM (target selection, state transitions) —
  but ez-ctf bots have **ranged** basic attacks, whereas Elementia's basic attack is **melee**, so
  the bot's approach/positioning behavior (closing to contact range) is new work on top of the reused
  FSM shape (see Section 5).
- **Balance-flagged:** bot skill/aggression (how well they use specials, how proactively they tank
  and revive) is a tuning target.

### Art style

**Chibi pixel-art humans with elemental flair** — ordinary humans (big-head chibi proportions), not
anthropomorphic animals and not fully elemental beings. Element shows through as **hair color + small
accents** (Fire ember trim, Water droplet/flow, Earth stone-fleck, Wind wisps). Built as a **single
shared chibi human base rig** recolored/accessorized four ways, keeping cost near ez-ctf's proven
single-base-sprite pipeline. See Section 6.

### Engine/audio stack

Reuse **ez-ctf's proven stack** (see Section 5 for the corrected specifics): Express + Socket.io,
Phaser 3.87 + Howler.js (real audio files), Vite, Render free Web Service + always-on static wake
shell. Supersedes the draft `2026-07-08-adversarial-code-review.md` wherever they conflict.

---

## Section 3: Map, Economy, Town & Buildings

### Map & gates — wide landscape, 3 gates

- **40 × 23 tile grid** (32px tiles) — ez-ctf's *exact* proven map dimensions, so its camera,
  viewport scaling, and rendering pipeline are reused as-is (this also de-risks the horde-rendering
  unknown from the review). Wide landscape format: fits a landscape phone and a 16:9 desktop with
  minimal letterboxing, whole map visible, **no scrolling camera**.
- **Town hall (2×2)** sits **bottom-center**. A **no-build arc** (semicircle) behind/around the hall
  keeps the immediate approach clear so the hall is always reachable/attackable and tight
  hall-hugging spirals are impossible; maze-building happens in the open field above it.
- **3 gates along the top edge:** **Gate 1 = top-center (opens wave 1)**; **Gates 2 & 3 =
  top-left and top-right**, opening at waves 4 and 7 in **randomized order** (which side opens next is
  random per run). The **next gate to open is telegraphed one wave in advance** during build phase, so
  players can adapt rather than being blindly punished. Enemies funnel *down* the field toward the
  hall.

### Generic tower catalog (slice 1)

Buildable by all classes, in addition to element special structures and combos. First-pass costs
(cheap by design, so eco spend still leaves a defensive baseline — see start agency):

| Tower | Cost | Attacks? | Role |
|---|---|---|---|
| Barricade | 2 gold | No | Cheap HP wall for shaping the maze |
| Snare Post | 4 gold | No | Minor slow aura, no damage |
| Watchtower | 6 gold | Yes — auto-attack, flat damage | Baseline damage / gold sink |

### Economy — even-split personal wallets + ownership dividend

**No shared wallet.** At **each wave end**, that wave's total team income splits **evenly among the
human players** into each one's **personal wallet**; each human spends their own gold independently
during the next build phase. **AI teammate bots neither earn nor spend** (they're combat-only —
Section 2), so income divides by human count, not by 4. This structurally eliminates shared-wallet
spend-griefing (there is no pool to drain).

Total wave income (before the even split) = **town hall 10 gold/wave** + **citizen headcount (1 gold
per living citizen)** + **per-kill bounties**. Income is **farm-leaning** (~60–70% from town hall +
citizens, ~30–40% bounties). First-pass bounties: **Goblin 1 / Orc 2 / Troll 3 gold**, **Elites ~3×**.

**Ownership dividend** (solves the freeloader problem of personal wallets — a shared building is paid
for by one player but benefits all): whoever personally **paid to build** a standing economic
structure earns extra personal gold each wave it survives, as **new gold that does not reduce anyone
else's split share**: **Farm owner +2 gold/wave, Marketplace owner +3 gold/wave.** Destroyed → the
dividend stops. (Pre-built starting buildings have no player owner and pay no dividend.) This also
raises the personal stakes on the building-as-maze-wall gamble (Section 4).

**Funding shared builds:** any single player can pay a structure's full cost alone; the structure
benefits the whole team once built. No pooling/contribution UI. Gold carries over between waves, so a
player can save toward a bigger item. Teams coordinate informally ("I've got the Farm, you take
towers").

### Population buildings & the supporting-Farms rule

| Building | Cost | Houses | Role |
|---|---|---|---|
| Farm | 10 gold | 2 citizens | Enables Marketplaces; +2 gold/wave to its owner |
| Marketplace | 10 gold | 4 citizens | Income/population engine; +3 gold/wave to its owner |

Population is governed by a **structural dependency, not a numeric food sim** (simplified from the
earlier food-accounting design):

- **A Marketplace requires 2 standing Farms to build** (the 2:1 ratio throttles population — and thus
  income — so it climbs gradually instead of exploding).
- If a supporting **Farm is destroyed**, its dependent **Marketplace goes dormant** (0 output/income,
  still occupies its tile) until food capacity is restored by rebuilding a Farm, at which point it
  reactivates.
- New buildings are at **full population immediately** (next income tally) — keeps eco payback
  predictable and build decisions legible.

**Eco payback ~4 waves** (was ~1.4 in the pre-review design): the 2 Farms + 1 Marketplace unit costs
30 gold and yields 8 citizens (8 gold/wave headcount), plus owner dividends. This slower payback +
the food-gate is the **entire anti-snowball mechanism** — no diminishing-returns or rubber-band
system needed.

### Sell / refund

During **build phase only**, a player may sell/reclaim a structure for a **partial refund (~60–70%
of cost)** to reconfigure the maze as gates open. Selling is disabled during fight phase (no
mid-breach cash-out). Special and eco structures are refundable too.

### Destructible buildings (combat, separate from dormancy)

Enemies that breach the maze **permanently destroy** any Farm/Marketplace/tower by depleting HP.
Combat destruction is worse than Farm-loss dormancy: the building is removed and must be **rebuilt at
full gold cost** (and the owner's dividend is gone). The **repair mechanic** (channel adjacent at
reduced cost) applies to all structures including the town hall.

### Starting state (before wave 1)

Pre-built town: **town hall + 2 Farms + 1 Marketplace = 8 citizens** (the 2 Farms satisfy the
Marketplace's supporting requirement). Starting income ≈ 10 (hall) + 8 (headcount) = 18/wave pooled,
plus wave-1 bounties, split evenly per player. **Starting per-player gold: first-pass ~8 gold**
(flagged for balance) — enough for a couple cheap defenses or to save toward a shared building. Each
player also places **1 free special structure** (their element) at the first build phase — immediate
defensive agency and element expression that scales with team size and doesn't touch the gold
economy.

### Balance note (flagged for the balance sweep — none locked)

Reuse ez-ctf's `balance_sweep.js` pattern. First-pass, tunable: per-player starting gold, all tower
costs/damage/range, town hall & building HP, per-kill bounties, ownership-dividend amounts,
Farm/Marketplace cost, and the ~4-wave payback target. The decided *structure* (even-split personal
wallets, ownership dividend, farm-leaning income, 2-Farms-per-Marketplace dependency, ~4-wave
payback, cheap basics + free starting structure) is fixed; magnitudes are tuning targets.

### Deferred (full-game vision)

Expanded building catalog (Armory and other tech-unlock buildings, house/farm variants, anything tied
to L5–L9). Slice 1 ships exactly: town hall, Farm, Marketplace, the 3 generic towers, each element's
special structure, and the 6 combos.

---

## Section 4: Enemies & Run Structure

### Enemy roster (greenskin horde — green, distinct from all player colors)

| Unit | Weight | Speed | Profile |
|---|---|---|---|
| **Goblin** | light | fast | runner; low HP; flung far by displacement, resists slow/root somewhat |
| **Orc** | medium | medium | baseline soldier; moderate everything |
| **Troll** | heavy | slow | high HP; resists displacement, very susceptible to slow/root |

### Enemy targeting, pathing & aggro

Enemies **flow down the cost field toward the town hall** (the single destination — Section 5) and
**attack whatever is on their cheapest path** (a wall/building/tower in the way is bulldozed if that
route is cheaper than detouring — Section 5). This makes "attack path-blockers" fall out of the
pathing itself.

**Player aggro** (so players are genuinely threatened and the down/revive system has a reason to
exist — otherwise off-path ranged players take zero risk). Throughout this section, **"player"
includes AI teammate bots** — they are valid aggro targets, pull aggro by attacking, and can be
downed/revived exactly like humans (Section 2):

- **Trigger:** an enemy aggros onto a player who is within proximity **or** who deals it damage (even
  at range).
- **Sticky threat:** on aggro it locks onto that player for ~2–3s (refreshed by continued hits) before
  re-evaluating (last-hitter / nearest). Prevents firing-line target-thrash; lets Earth reliably tank.
- **Leash:** it chases only within a bounded distance from its position on the cost-field path;
  exceed the leash and it reverts to marching on the town hall.
- **Commit (anti-kite):** after chasing past a time cap, or after reverting off a leash, it enters a
  brief **committed** state — ignores new aggro and beelines the hall — with **diminishing pull-range
  on repeated yanks**. You can peel an enemy off a weak wall or the hall, but you can't kite the horde
  in circles forever. The horde's gravity is always back toward the town/princess.
- **Players do not block the flow field** (no living-wall exploit).

This shifts the game toward **action hero-defense** (Orcs Must Die / Dungeon Defenders family), which
matches the direct-control design. Player DPS is tuned as a **supplement**, not a solo answer —
towers + maze must remain necessary.

### Elite (oversized) modifier

A reusable modifier on any base unit: **scaled-up sprite + buffed stats, same AI** — boss variety
with **no new art or AI**. Elites bump **weight up one tier** and gain identity-leaning buffs (all
also get substantially higher HP). Their tier bumps interact with the CC counter-triangle (Section 2):

| Base | Elite weight | Elite speed | CC result | Buffs (beyond HP) |
|---|---|---|---|---|
| Goblin | medium | **super-fast** | **immune to slow/root**, displaceable | even faster |
| Orc | **heavy** | fast | resists both, immune to neither → **hardest** | harder-hitting + faster |
| Troll | **super-heavy** | slow | **immune to displacement**, rootable | harder-hitting |

The Elite Troll is a natural **siege unit** (super-heavy, hard-hitting → smashes weakened walls to
open shortcuts, per the bulldoze rule).

### Run structure — the 10-wave beat sheet

Discrete escalation events (gate opens, enemy-type intros, level-ups) are a **fixed beat sheet**;
enemy **counts** scale via a data-driven rule on top, tuned against a **full 4-defender team** (the
team is always 4 via bot-fill — Section 1/2), so wave difficulty does not vary with human count.
Victory = survive all 10 waves.

| Wave | Gate | Enemies | Level |
|---|---|---|---|
| 1 | Gate 1 (top-center) | Goblins + a few Orcs | L1 |
| 2 | — | Orc packs, more Goblins | — |
| 3 | — | Orc-heavy horde | **L2 — combo unlock** |
| 4 | Gate 2 opens | Two-front pressure | — |
| 5 | — | **Trolls introduced** | — |
| 6 | — | **First Elite** (1 leading a horde) | **L3 — special boost** |
| 7 | Gate 3 opens (final) | Heavy mixed horde | — |
| 8 | — | Elite + horde | **L4 — new ability** |
| 9 | — | All-gate intensity peak + elites | — |
| 10 | — (no new gate) | **Finale: Elite of all 3 types + massive horde, all 3 gates** | — |

Properties: gates at **1/4/7** (last gate 3 waves before the finale), levels at **1/3/6/8** (L4
learned against a known threat before the finale), no wave stacks two new challenges, and **wave 10
adds no new system** — pure volume + intensity mastery test.

### Death & revive

- **HP → 0** in fight phase = **downed / bleed-out** on the spot (can't act or move) for ~15s.
- A **teammate channels ~3s adjacent** to **revive** at partial HP.
- **Not revived → full death → respawn at the town hall** on a ~20s timer (scaling longer on late
  waves), **mid-wave** — the player runs back in.
- **Team wipe is not an instant loss** (all respawn on their timers), but the town hall is undefended
  in the gap. **Downed/dead players are fully restored at the start of the next build phase.**

### Balance note (flagged — none locked)

All enemy base stats (HP/speed/damage), elite multipliers, per-wave counts and the scaling rule, the
aggro leash distance / sticky-threat window / commit timing, bleed-out (~15s), revive channel (~3s)
and partial-HP amount, respawn timer (~20s + scaling), and the CC scaling curves. The *structure*
(roster + weight/speed mapping, CC counter-triangle, aggro model, elite rule, 10-wave beat sheet,
down→revive→death→respawn flow) is decided.

---

## Section 5: Technical Architecture

### Stack (reuse ez-ctf, with corrected specifics)

Express 4 + Socket.io 4 backend, Phaser 3.87 + Howler 2.2 frontend, Vite 5 build, Playwright e2e.
Deploy as a Render free Web Service + always-on static "wake shell" (`render.yaml` pattern) to mask
cold starts. Reuse `mulberry32` RNG, room/reconnect-token plumbing, the Howler/`AudioManager` audio
pipeline + `test:audio` tooling, the Playwright harness, and the `balance_sweep.js` pattern as-is.

**Corrected from the pre-review draft (these were factual errors about ez-ctf):**
- **60Hz sim / 20Hz broadcast** (ez-ctf's `TICK_MS = 1000/60`, `SNAPSHOT_EVERY_N_TICKS = 3`), **not**
  a 20Hz sim. Keep this — a 20Hz sim would break movement/melee/projectile timing and `SnapshotBuffer`
  timeline math.
- **Client = interpolation, not prediction.** ez-ctf has no client-side prediction/reconciliation;
  it interpolates (local ~60ms, remote ~100ms, never extrapolates). Ship that. A useful consequence:
  **server-side path/direction reversals do not rubber-band** (pure interpolation replays authoritative
  positions on a delay), so the mid-fight field recompute below is safe on the client.

### Map & rendering

40×23 tiles @ 32px, town hall 2×2 bottom-center, whole map visible, no scrolling camera; reuse
ez-ctf's camera/viewport/scaling at these exact dimensions. Client renders a much larger scene than
ez-ctf's ≤4 characters (100+ enemies + towers + combo FX + floating combat text + status overlays,
including on mobile) — this is **new load ez-ctf does not prove**; see spike #2 and cap server-side
`fx` per type per emit.

### Pathing — cost-weighted Dijkstra field (the keystone redesign)

A single **cost field** flows out from the town hall; every enemy reads it O(1)/tick and steps
"downhill." This replaces both ez-ctf's per-bot A*-to-moving-goal and the pre-review "hard-blocked
BFS flow field."

- **Dijkstra with octile weights** (diagonal = √2), **not plain BFS** — BFS measures hop-count
  (Chebyshev), producing ~40%-longer zigzag paths and ambiguous descent on hop-equal plateaus. Reuse
  ez-ctf's `MinHeap` from `pathing.js`.
- **Seed** from the ring of tiles adjacent to the town-hall footprint (the hall's own tiles are
  blocked and won't expand).
- **Walls are traversable at a cost, not impassable.** Wall-entry cost is a function of remaining HP,
  **quantized into bands** (Healthy / Damaged / Critical). Enemies take the cheapest total route, so
  they **bulldoze a weak wall when the detour around is long enough** (repair keeps walls out of the
  cheap band → the repair mechanic gains real weight; Elite Trolls are natural siege units). When a
  gate opens behind a fully-walled region, enemies simply path through it — **no undefined state, no
  wall-off exploit.**
- **Corner-cut guard** replicated in **both** field expansion and per-enemy descent (units must not
  squeeze diagonally through a 1-tile gap between two walls). Deterministic tie-break by tile index.
- **Recompute** is dirty-flagged on band-cross / build / destroy / gate-open and **throttled to ≤1 per
  ~0.25s** (a full-grid Dijkstra on ~900 cells is sub-ms; the throttle bounds cost under heavy chip
  damage). Correct the old claim: the field **does** recompute mid-fight (walls die during combat) —
  the mid-fight interpolation consequence above makes this safe. ("repair-to-full" is *not* a topology
  trigger — damaged walls still block.)
- **Reachability check** downgraded from a correctness pillar to a **UX warning** (prevent players
  accidentally self-sealing); the cost field is correct in every case regardless.
- **`PathProvider` interface:** the genuinely reusable surface from ez-ctf is ~40 lines of grid
  primitives (`tileToWorld`/`worldToTile`/`inBounds`, the corner-cut idiom, `MinHeap`). The movement
  *consumer* is new end-to-end (there are no bots/FSM/waypoint-lists to swap into).

### Enemy entity system — NEW code, budgeted as such

ez-ctf's "AI" is 4 bots that are *players* (synthesize WASD through the same input pipeline);
`MAX_PLAYERS = 4` and the proven simultaneous scale is ~4 characters + bullets + ≤~12 placed objects.
**The enemy entity, its flow-field movement integrator, melee-vs-structure combat, the status-effect
system (burn/wet/slow/root/freeze), the aggro state machine, spawners, and the build↔fight↔wave-
end↔dormancy phase machine are all new** — "reuse the tick loop" means reusing its *shape*
(`tickGame(state,…)`, the `loop.js` interval, the invariants harness), not its contents.

- **Collision must be tile-indexed, not linear.** ez-ctf's `resolvePlacedCollision`/`isFreeForPlayer`
  scan all placed objects per entity per tick and allocate fresh vectors — at wave-10 scale (≈100
  enemies × ≈150 structures × 60Hz) that's GC-churning and CPU-bound on a 0.1-vCPU instance. Use the
  grid for O(1) neighbor lookup and allocation-free pushout.
- **Do not reuse `stuck.js` teleport-recovery for enemies** — it would teleport a jammed Troll
  *through* the maze. Flow-field followers need a different failsafe.

**Allied AI teammates ARE largely reuse (unlike enemies).** ez-ctf's "AI is bots that are players,"
so the friendly bot FSM (target selection, state transitions, revive) is directly reusable for the
slot-filling AI teammates (Section 2) — a real win the enemy system doesn't get. **One caveat:**
ez-ctf bots use **ranged** basic attacks; Elementia's basic attack is **melee**, so the bot's
approach/positioning logic (close to contact range, melee kiting) is new behavior layered on the
reused FSM. Bots run through the same input/movement pipeline as human players (they are players for
sim, aggro, and revive purposes), so they cost roughly one extra player-entity each, not a new entity
class.
- **Elite collision radius capped at ≤14** regardless of sprite scale, or a scaled-up Elite can't
  traverse a 1-tile corridor the field says is open (test this).
- **Knockback / pull = velocity-over-ticks, never a positional impulse.** An instant displacement can
  exceed `SNAP_TELEPORT_PX` (client teleport-pop) or tunnel an enemy *through* a wall server-side
  (`pushCircleFromAabb` only resolves overlap at the final position).

### Placement (tile-snapped) & `placed.js` reuse

Tile-snapped placement reuses `placed.js` (HP/destroy) and `repair.js`, with fixes:
- **Caps REJECT, not evict.** Every ez-ctf call site (`walls.js`) evicts the oldest at cap — in a TD
  that silently deletes a load-bearing wall (and could unseal a gate). Reject at cap instead.
- **Repair range = edge-distance** for multi-tile structures (a player adjacent to the 2×2 town hall
  is 16–32px farther from its center than its edge); the new "channel N seconds next to any damaged
  structure" model is new code over `placed.js`'s SP-for-HP math.
- `damagePlaced`/`destroyPlaced` already bump `placedVersion` — that's the dirty-flag hook for the
  field recompute and the change-versioned static snapshot below.

### Network protocol — optimized from day one

JSON over Socket.io, but **not** ez-ctf's naive full-state snapshot (which re-sends all static
obstacles at full float precision 20×/s — ~1–3 MB/s at wave 10, ~10–30 hrs of late-game 4-player play
per month on Render's 100GB, plus `JSON.stringify` cost on 0.1 vCPU). From the start:
- **Quantize coordinates to integers.**
- **Pack enemies as flat arrays** (`[id,type,x,y,hp,flags]`), not keyed objects.
- **Change-versioned static data** — send the structure list only when `placedVersion` bumps.
- **Cap `fx` server-side** per type per emit.
- New event types beyond ez-ctf: build / repair / sell, combo resolution, synchronized leveling
  broadcasts, FF-flagged AoE/knockback/pull, and aggro. Weight-scaled displacement and speed-scaled
  slow/root resolved server-side.

### Two de-risking spikes (before committing to the architecture)

1. **Wave-10 free-tier budget** — headless-simulate wave 10 and measure snapshot bytes + tick CPU
   with packed/quantized encoding vs. naive JSON. Go/no-go on the protocol and on room concurrency
   (likely cap free-tier rooms at 1–2).
2. **Enemy entity scale** — 120 flow-field enemies + 150 structures through tile-indexed collision at
   60Hz, allocation-free, with velocity-based knockback and an Elite-radius corridor test. This is the
   largest block of net-new code and is currently the biggest scope/perf unknown.

---

## Section 6: Art & Audio Pipeline

- **Characters:** single shared **chibi human base rig** (big-head), recolored/accessorized per
  element — hair color + small accents (Fire ember trim, Water droplet/flow, Earth stone-fleck, Wind
  wisps). Reuse ez-ctf's PNG spritesheet + JSON atlas convention; generate via an AI art tool +
  pixelation/atlas pipeline sized for the chibi rig.
- **Reserved player color tokens** (used consistently across hair, health bars, ability/combo FX,
  floating combat text, and ownership/contribution indicators):
  - Water = **blue**, Fire = **orange**, Earth = **brown**.
  - Wind = **off-white / pale-cyan-white** (⚠️ *not* pure `#FFF` — poor contrast on light UI; pair
    with a dark outline/badge). Bake this into the token.
  - (No minimap — the whole-map-visible layout makes one redundant; removed.)
- **Enemy color:** greenskins are **green**, distinct from all 4 player colors (free readability win).
- **Building/structure art:** town hall/castle (with visible princess), Farm, Marketplace, the 3
  generic towers, each element's special structure.
- **Enemy sprites:** Goblin / Orc / Troll, each with a **scaled-up Elite variant** (no new rig).
- **Audio:** reuse ez-ctf's Howler.js + `AudioManager` pipeline and `test:audio`/`test:audio:e2e`
  tooling as-is (real audio files, not synthesis).

---

## Section 7: Slice-1 Scope Recap & Build Strategy

### In slice 1
L1–L4 synchronized leveling; 3 enemy types + the Elite modifier; all 6 synergy combos; 4 element kits
(melee basic + special attack + special structure each); **2–4 humans with AI teammates filling empty
slots so the team is always 4 (always balanced for 4)**; the 40×23 wide 3-gate map with cost-field
maze-building; even-split personal-wallet economy (humans only) + ownership dividend; Farm +
Marketplace (supporting-Farms dependency) + 3 generic towers; the aggro action-defense combat model;
the two-axis CC counter-triangle; desktop/tablet/mobile-landscape.

### Deferred (north star, not built now)
L5–L9; live ability-layering combos; the Steam Vent conflict→mastery arc; expanded building catalog;
persistent progression/accounts; endless mode; additional maps; public matchmaking + anti-grief
hardening.

### Build strategy (model usage)
**Fable 5** writes the full spec (this doc) and the slice-1 implementation plan, and performs
adversarial spec/code review at checkpoints (the two-reviewer pass in
[`2026-07-17-adversarial-review.md`](2026-07-17-adversarial-review.md) is the pattern). A **cheaper
model executes** the plan step by step against that spec, with Fable 5 reviewing at the checkpoints.
The two de-risking spikes (Section 5) should run **before** committing to the full architecture.

---

## Reference: ez-ctf project (proven architecture being reused)

Location: `C:\dev\ez-ctf`.
- `package.json`: Express 4, Socket.io 4, Phaser 3.87, Howler 2.2, Vite 5, Playwright e2e.
- `render.yaml`: two services — `ez-ctf` (web, Node, free, healthcheck `/healthz`) and `ez-ctf-shell`
  (always-on static wake shell polling `/healthz`).
- `server/ai/pathing.js`: A* with octile costs + `MinHeap` + corner-cut guard (reuse the primitives).
- `server/game/`: `placed.js` (HP/caps/destroy, `placedVersion`), `walls.js` (evict-at-cap — change
  to reject), `tick.js`/`loop.js` (60Hz sim, 20Hz emit via `emitGate.js`), `repair.js`, `stuck.js`
  (teleport recovery — do not reuse for enemies).
- `client/src/net/SnapshotBuffer.js`, `network.js`: interpolation (no prediction), `SNAP_TELEPORT_PX`.
- `client/public/art`: PNG + JSON atlas per character.
- Test scripts: `test:audio`, `test:audio:e2e`, `test:netcode`, `balance` (`balance_sweep.js`).

## Reference: draft architecture doc in this repo
`2026-07-08-adversarial-code-review.md` — **superseded.** Its audio-as-code and compressed-string
protocol were rejected (Howler.js + optimized-JSON instead); it assumed fixed 1D-path lanes (this
design uses the open cost-field maze). Retained only as historical context.

---

## Amendments

Dated deviations from the sections above, per the standing execution rule
("any deviation discovered mid-build gets written back into the spec").

- **2026-07-18 (Phase 1, CP1 M3) — human count is 1–4, not 2–4.** Section 1
  frames the mode as "2–4 human players", but the always-4-via-bot-fill design
  (Section 1/2) makes a room "always balanced for a 4-defender team **regardless
  of how many humans are in the room**." A lone host + 3 bots is therefore a
  valid, in-design configuration and is explicitly allowed to start (needed for
  solo dev/testing and single-player runs). **Amended rule: 1–4 humans; the
  remaining element slots are always bot-filled to a team of 4.** No minimum-
  human gate on match start.

- **2026-07-18 (Phase 2) — combo adjacency, reachability warning, and
  first-pass structure magnitudes.** Filling gaps the spec left open for
  Phase 2 scope:
  - **Combo adjacency is 8-connected (any of the 8 neighbor tiles), uniformly
    for all 6 pairs**, resolved unconditionally at build time. The L1
    "starting" vs. L2 "diagonal" combo split (§2 progression ladder) is a
    Phase-4 leveling gate layered on top of this mechanism, not enforced by
    Phase 2 (levels don't exist yet). When resolved, the combo occupies the
    just-placed structure's tile; the paired neighbor is destroyed and its
    tile freed — combos have no defined "un-combo" on sell (selling just
    removes the combo structure).
  - **Reachability UX warning is a separate hard-block flood fill**, not a
    query against the live cost-weighted field. The real field (spec §5) is
    walls-traversable-at-a-cost by design and therefore *never* reports a
    tile as truly unreachable ("no wall-off exploit" is the point) — so a
    warning built on it could never fire. `checkReachabilityWarning` in
    `server/game/structures.js` instead runs its own BFS treating every
    structure + the hall as a hard blocker, purely to flag an accidental
    self-sealing maze. It does not affect the authoritative cost field.
  - **Marketplace's 2-Farms requirement is a global ratio, not a per-pair
    binding**: build-time gate = `(existing marketplaces + 1) * 2 <=
    living farms`; dormancy on Farm loss recomputes the same ratio with FIFO
    priority to the oldest Marketplace (`server/game/dormancy.js`).
  - **Element-special and combo cost/HP magnitudes** (`shared/balance.js
    STRUCTURES`) are first-pass placeholders — the spec gives costs for the 3
    generic towers and Farm/Marketplace only, not specials/combos. Flagged
    for the Phase 8 balance sweep like every other magnitude in that file.
  - **Channel-repair is not phase-gated** (usable in both `build` and
    `fight`) — the spec never restricts it to build phase (unlike sell,
    which is explicitly build-only), and mid-fight repair is the mechanic
    that keeps the pathing field's wall-band recompute meaningful under
    combat damage.

- **2026-07-18 (Phase 3) — enemies, waves, status, aggro & combat.** Filling
  gaps the spec left open for Phase 3 scope:
  - **Move speed is a pure function of the SPEED tier**, not a second per-type
    table. `BALANCE.ENEMY.SPEED_PX` maps slow/medium/fast/super-fast → px/s, so
    the Elite modifier's tier re-point (§4) *also* moves speed for free — Elite
    Goblin (super-fast) is faster, Elite Troll (still slow) is not — matching
    the "even faster / faster / not faster" prose without extra data.
  - **Wave composition is an explicit per-wave TABLE** (`BALANCE.WAVES[].comp`,
    total counts distributed across the open gates by `server/game/waves.js`)
    rather than a scaling formula on top of the beat sheet. Same table-driven
    testability the spec's "data-driven rule" wanted, and the Phase 8 sweep can
    move counts directly. Elites lead each wave; the base body is round-robin
    interleaved by type; gates stream in on a cadence (`WAVE_SPAWN`).
  - **Gate 2/3 order** (`SIDE_A` wave 4 / `SIDE_B` wave 7) resolves to the
    physical LEFT/RIGHT tiles once per run via a single seeded-RNG draw at match
    start (`resolveGateOrder`); the next gate is telegraphed one wave ahead
    (`nextGateToOpen`). Gates open cumulatively (1 / 4 / 7).
  - **Two-axis CC scaling is split across two modules by its scaling axis.**
    Displacement (push/pull) scales by WEIGHT and stays in `enemyMove.js`
    (super-heavy = immune, `KB_WEIGHT_SCALE[3]=0`). Slow/root/freeze scale by
    SPEED in `status.js` (`CC_*_SCALE`, super-fast index → 0 = full immunity).
    The two are **independent**: a rooted enemy has move-speed 0 but its
    knockback velocity still integrates (root ⊥ displacement). Burn is pure DoT
    with no tier scaling. Wet is a tag + mild slow (the Blizzard "freeze wet"
    combo-targeting is a Phase-4 ability concern; the tag exists now).
  - **Tower/trap OFFENSE is Phase 3**, not spelled out as a separate bullet but
    required by the acceptance ("a scripted maze kills wave 1–3 with towers
    alone"). `server/game/towers.js` fires each offensive structure at the
    nearest in-range enemy on its own cooldown (`BALANCE.TOWER`, first-pass
    magnitudes). Walls/eco/hall have no entry and never fire. Target search is a
    per-ready-tower linear scan (flagged for the sweep to bucket if profiling
    calls for it).
  - **Enemy → player damage is deferred to Phase 4.** The aggro FSM (steer a
    chase, sticky/leash/commit anti-kite) is built and tested now, but the
    *consequence* of a caught player (the down → revive → death flow, §4) lands
    with player characters in Phase 4. Phase-3 melee is enemy → structure/hall
    only; the bulldoze falls out of the cost field (a downhill step into a wall
    tile = attack it).
  - **Enemy store is Structure-of-Arrays** (`EnemyStore`, preallocated typed
    arrays, capacity `BALANCE.ENEMY.MAX=256`), replacing the Phase-1 `enemies`
    object array, so the movement/collision hot paths never allocate and feed
    the typed-array foundation modules directly. The packed encoder reads the
    store's dense slots; the wire format is unchanged. Hall HP now rides every
    snapshot (`hh`) so the client can draw town integrity and the loss.
  - **First-pass balance:** a realistic undefended town (the 4 bot-players
    present, as a match creates them) falls in wave 1 at ~178 s; a scripted
    watchtower funnel clears waves 1–3 (and, densely towered, all 10) with the
    hall intact. All enemy stats, CC curves, aggro windows, tower magnitudes and
    wave counts are first-pass, flagged for the Phase 8 sweep.

- **2026-07-18 (Phase 3, CP2 remediation).** Two adversarial subagent reviews
  (`docs/reviews/2026-07-18-checkpoint2-{programmer,designer}-review.md`) ran at
  the Phase-3 gate; findings triaged and remediated (TDD, suite 162/162). Fixed:
  the **wave-6 out-of-bounds soft-lock** (enemies are now clamped into the arena
  each tick — the flow-field stuck failsafe spec §5 mandated; an in-bounds
  non-hall tile always has a descent step, so no enemy can strand); the discarded
  **wall-pushout anchor** (pushout runs with the pre-move came-from position, so a
  Phase-4 knockback can't tunnel a body through the maze); **per-tick hot-loop
  allocation** (nearest-player search inlined, no object churn); **chasing enemies
  dealing no hall damage** (hall melee now fires in any steering mode, so a parked
  player can't perfectly shield the hall); **anti-kite** (COMMIT_MS ≥ CHASE_CAP_MS);
  **unbounded pull-diminish** (capped); the **elite-intro order** (the counterable
  Elite Troll now teaches first, not the no-counter Orc); and the **inert WEIGHT
  axis** (the Grinder combo applies its spec'd weight-scaled pull). Deferred to the
  Phase 8 sweep: funnel-meta difficulty shape, Water-special DPS / the Wet status's
  consumer (a Phase-4 ability interaction), Snare-Post tuning, and elite-HP shaping.

- **2026-07-19 (Phase 4) — player characters, abilities, lifecycle, and
  netcode gap-fills.** Decisions taken where the spec left Phase-4 specifics
  open (all magnitudes are first-pass in `shared/balance.js`, sweep-flagged):
  - **Element ranks map onto the enemy tier scales** (`elementKits.js`): the
    §2 table's weight/speed ranks 1–4 become tiers 0–3, so Earth (weight 4) is
    SUPER-HEAVY (displacement-immune under FF) and Wind (speed 4) is
    SUPER-FAST. One displacement rule and one CC rule serve enemies and
    players alike.
  - **L4 second abilities** (spec: "new individual special ability (per
    class)", specifics undefined) — designed against each element's identity
    and the CC counter-triangle: **Earth: Fissure** (aim-line damage + root —
    the anti-fast tool the slow tank lacks), **Fire: Flame Nova** (radial
    burst + strong burn — Fire doubles down on damage), **Water: Tidal Wave**
    (wide-cone shove + **Wet** — a positioning/setup tool that feeds the
    Blizzard freeze combo), **Wind: Gale Dash** (self-launch along the aim
    damaging enemies on the path — mobility as the fast element's payoff,
    implemented as velocity-over-ticks like every displacement).
  - **Friendly fire transmits damage + displacement, not statuses.** Players
    carry no status object in slice 1, so FF-on AoE hits teammates with
    damage and weight-scaled knockback/pull but never burn/slow/root. The
    caster is always excluded from their own ability.
  - **Projectiles fly over structures.** Fireball (and future projectile
    abilities) collide with enemies, expire at max range or the map edge
    (detonating in place), and never hit walls/towers — thrown arcs, and a
    player's own maze should not eat their support fire. Flight is
    velocity-per-tick with the same `MAX_STEP_PX` clamp as knockback (no
    tunneling class of bug).
  - **Revive channel is proximity-driven**: progress accrues while ≥1 living
    teammate stands within `REVIVE_RANGE_PX` of the downed body and RESETS to
    zero if everyone steps away (interrupted channels restart); the reviving
    teammate can still act while adjacent. Downed players are not aggro
    targets and take no further damage; enemy melee priority is chased player
    > hall > structure. Death respawns at the hall spawn point at FULL HP
    after `20s + 1s × (wave-1)`.
  - **L2 retro-resolves diagonal combos**: Steam Vent / Grinder pairs built
    adjacent before L2 combine automatically the moment the milestone lands
    (no sell-and-rebuild tax). L3's "global power boost to special attacks"
    is ×1.3 damage AND area/range on the L1 specials only — the L4 seconds
    arrive post-L3 at their designed numbers.
  - **Player–player body collision is omitted** in slice 1 (players collide
    with tiles/hall and the arena only), matching ez-ctf.
  - **Input model**: full input state (WASD + aim vector + 3 action bits)
    sent every client frame, latest-wins per tick server-side, sanitized at
    the socket (non-finite aim rejected) — ez-ctf's model with Elementia
    actions.

- **2026-07-19 (Phase 4 extension, post-CP3) — player DPS-share target,
  class differentiation, ability retunes, FF rework.** Design decisions made
  in response to CP3 designer finding C2 (the certified acceptance strategy
  lost at wave 6 on 2/3 seeds because leveling's combat beats were cosmetic —
  L3's ×1.3-on-specials was ~+8% player output against a +53% wave-6 HP
  step). All magnitudes are first-pass in `shared/balance.js`, sweep-flagged.
  - **Declared design intent: players own 25–35% of late-wave (6–10) kill
    throughput**, matching §4's "supplement, not solo answer" framing. This
    is the target the Phase 8 sweep tunes toward; it is not itself a single
    number change but the reason for every change below.
  - **Shared melee now scales with team LEVEL (L1/L2/L3/L4), not raw wave** —
    `BALANCE.LEVELING.MELEE_LEVEL_MULT` — so the leveling milestones become a
    felt combat power spike (the mechanism C2 found missing), reusing the
    existing L1/3/6/8 broadcast instead of a second, uncoordinated curve.
  - **Classes are no longer stat-identical.** `BALANCE.PLAYER.CLASS[element]`
    replaces the flat `MAX_HP` + `MELEE.DAMAGE`: Earth is the tank (highest
    HP + melee), Wind the glass-cannon (lowest HP + melee, fastest), Fire and
    Water in between — matching each element's existing weight/speed
    identity instead of contradicting it (previously every class was
    identically 100 HP / 10 melee regardless of being SUPER_HEAVY or LIGHT).
  - **Player speed brought down toward the enemy band.** Previously every
    class (even slowest Earth at 115 px/s) outran the fastest enemy
    (120 px/s), so nothing but the Elite Goblin could ever threaten a player
    in the open — the down/revive lifecycle's risk premise didn't bind
    (CP3 designer H3). `SPEED_PX` retuned to `[70, 90, 100, 130]` against the
    enemy band `[40, 65, 90, 120]`: Earth and Water are now catchable by
    medium/fast/super-fast enemies, Fire only by super-fast, and Wind remains
    the sole class that can outrun everything — but by 10 px/s, not a
    blowout. Class speed ordering (Earth slowest → Wind fastest) is
    unchanged.
  - **Water and Wind specials swap verbs.** Wind's Whirlwind (pull) was
    numerically the weakest kit; rather than just raising its numbers, its
    *effect* moved to Water (thematically a better fit — water sucks things
    in) and Wind gets Water's displacement-away effect at a broader radius,
    rebranded **Wind Blast** (radial push, matching "broad scope" rather than
    Hydro Blast's narrow cone). Water's L1 special is renamed **Whirlpool**
    (radial pull, inherits the diminishing-pull-range anti-yank logic
    unchanged). Both are now full radial AoEs (no cone), matching Ground
    Slam's shape; only radius differs. The L4 seconds (Tidal Wave push,
    Gale Dash self-mobility) are unchanged — a known thematic wrinkle (L1
    Water now pulls, L4 Water still pushes) accepted rather than
    re-designing L4 in the same pass.
  - **Earth's Ground Slam gains a modest weight-scaled outward shove**
    alongside its existing damage + slow, giving Earth's kit a displacement
    verb too (previously only Water/Wind could move anything). Radius
    lowered 100→90 px (a genuine AoE, not a blast-everything radius) with
    damage raised 18→26 to keep it a real threat at the tighter footprint.
    Fire's Fireball damage is nerfed 22→16 (Fire was strictly dominant per
    CP3 designer H3: longest range, best DPS, outruns everything) with no
    added displacement — Fire stays the pure-damage/no-utility kit by design.
  - **Friendly fire reworked to displacement-only: teammates can be shoved
    by FF, never damaged.** Supersedes the prior "FF transmits damage +
    displacement" amendment. Every ability's FF-teammate path drops
    `damagePlayer`; abilities with no enemy-facing displacement effect
    (Earth's Fissure, Fire's Fireball and Flame Nova) gain a small FF-only
    `ffShove` used solely against teammates, ranked deliberately below the
    abilities that already displace enemies (approx. Wind/Water strongest,
    Earth medium, Fire weakest). Burn/slow/root still never apply to players
    (unchanged from the prior amendment).
  - **Respawn timer shortening attempted, then reverted — a real finding, not
    a triviality.** Halving `RESPAWN_BASE_MS` 20s→10s (to ease the early-game
    death sit-out the CP3 designer review flagged) broke the
    `phase4Acceptance.test.js` "control: idle humans lose" regression test:
    with players respawning at the hall-adjacent spawn point that fast,
    chase-mode enemies (which beeline straight at their target, ignoring the
    hall as an obstacle — an existing gap, not new this pass) never run out
    of fresh local targets and the hall stops taking sustained damage,
    stalling indefinitely (confirmed to >400k sim ticks with no resolution,
    vs. the ~89k-tick baseline). Bisecting `RESPAWN_BASE_MS` (10s/12s/15s/18s/
    20s) found the pass/fail boundary is **non-monotonic** — a chaotic
    threshold effect of the aggro FSM's timing, not a smooth function of the
    respawn value — so no number found this way could be trusted to hold up
    under the next balance tweak. **Reverted to the original 20s** rather
    than gamble on a value that merely happens to work today. **Flagged for
    Phase 6**: the root cause (chase mode beelines straight at its target
    with no hall-obstacle awareness, unlike march mode's cost-field routing)
    is a latent gap that a stationary AFK player — or an under-designed bot —
    could reproduce in live play, independent of the respawn timer.
  - **No new L4 actives added.** Considered and declined — each class keeps
    exactly one special (L1) and one second (L4); the existing four of each
    get deepened via the changes above rather than diluted by a fifth button.
  - **Combo tower facing/direction — considered and declined.** Combo and
    special towers stay omnidirectional auto-targeting circles; no `facing`
    field, no build-time direction UI. Out of scope for this pass.

- **2026-07-19 (same-day follow-up) — Ground Slam nerfed again; slow removed.**
  Playtesting the batch above found Earth's Ground Slam (damage 26 + slow +
  shove, all on a 5s cooldown) still read as too strong. **Slow removed
  entirely**; **damage cut 26→16** (below Fissure's unboosted 20, so Earth's
  burst comes from the shared melee-scaling change, not the special). The
  weight-scaled shove is unchanged. Earth's kit is now damage + displacement
  only, no crowd control — Fissure (L4) remains Earth's only CC tool (root).

- **2026-07-19 (Phase 5) — economy: split remainder, dividend/dormancy
  interaction, starting-structure placement, and free-special scope.** Filling
  gaps the spec left open for Phase 5 (`server/game/economy.js`, wired into
  `structures.js`/`state.js`/`phaseMachine.js`/`index.js`):
  - **Even-split remainder goes to the first N players in player order**
    (`splitEvenly`), not lost to rounding — needed so total gold minted each
    wave exactly matches `pooled`, which the acceptance test (money round-trips
    across a full run) depends on.
  - **A dormant Marketplace pays no dividend**, not just no citizen headcount.
    The spec's dormancy prose ("0 output/income") is read as covering the
    owner dividend too, not only the population contribution — a destroyed
    supporting Farm shouldn't let the Marketplace's owner keep collecting
    while the building itself produces nothing. Farm dividends are unaffected
    (Farms never go dormant).
  - **Pre-built starting structures (2 Farms + 1 Marketplace) get `ownerId:
    null`** and pay no dividend, per spec ("Pre-built starting buildings have
    no player owner and pay no dividend"). They're placed at fixed safe tiles
    above the hall (outside the no-build arc), constructed directly via a new
    `placeSeedStructure` helper that bypasses phase/cost/geometry checks
    (trusted server-seeded content, not a player action) but still syncs the
    cost field and dormancy exactly like a normal placement.
  - **The free own-element special (spec §3 "each player also places 1 free
    special structure... at the first build phase") is a per-player grant**,
    consumed the first time that player builds their own element's special
    during wave 1's build phase (`buildStructure` in economy.js checks
    `wave === 1 && !usedFreeSpecial`), tile chosen by the player through the
    normal BUILD_STRUCTURE flow — not a server auto-placement. **Bot-controlled
    elements' specials ARE auto-placed** (near the hall, via
    `placeSeedStructure`, `ownerId: null`) at game-state creation, since bots
    have no AI yet (Phase 6) to send a build action; `sellStructure` already
    has no ownership restriction (a Phase 2 decision, unchanged), which is
    what makes them "sellable by humans" without extra plumbing.
  - **No wire/HUD changes in this phase.** `player.gold` and `lastWaveTally`
    stay server-side only; the eco HUD (wallet display, wave-income breakdown)
    is Phase 7 (Art, audio & UI polish) scope, not re-litigated here.
  - **Balance magnitudes** (`BALANCE.ECONOMY.STARTING_GOLD/HALL_BASE_INCOME/
    CITIZEN_INCOME`) are first-pass, flagged for the Phase 8 sweep like
    everything else in `shared/balance.js`.

- **2026-07-19 (Phase 6) — AI teammate bots: FSM shape, the melee-positioning
  layer, and the "no pathfinding" scope call.** New `server/game/bots.js`
  (`BALANCE.BOT` config block), wired into `tickGame` via `runBotInputs` just
  before `tickPlayers`. Filling the gaps the spec left for Phase 6:
  - **Reused the SHAPE of ez-ctf's player-bot FSM, none of its contents.**
    ez-ctf is CTF (flags/teams/ranged bots); Elementia bots are combat-only
    slot-fillers. What ports is the pattern: a small priority-ordered set of
    states, re-evaluated per tick, synthesizing the same
    `{ keys, aimX, aimY, actions }` input a human socket produces, so bots run
    the identical `tickPlayers` path (movement, melee, abilities, aggro,
    revive) — nothing bot-specific in the enemy/aggro sim. **Departure from
    ez-ctf:** dropped its 10 Hz FSM-eval throttle and re-decide every tick.
    Elementia's perception is a trivial nearest-enemy scan the sim already
    pays for, and per-tick decisions are more responsive and trivially
    deterministic (no eval-cadence timing to reproduce). Bot decisions consume
    **no rng** — a seeded run replays identically.
  - **Priority order: Retreat > ReviveMate > Engage > Hold**, with per-class
    temperament (`BALANCE.BOT.CLASS`). Tanks (Earth/Water) hold the line and
    never retreat; squishies (Fire/Wind) retreat below 25% HP (hysteresis up to
    50%) and kite — step off between swings while the basic is on cooldown.
    **ReviveMate outranks Engage**: a bot leaves the line to walk into a downed
    teammate's channel range (the channel itself is automatic in
    `players.tickLifecycle`), gated to `REVIVE_SEEK_RANGE_PX` so it won't cross
    the map. This is the spec's "bots can revive."
  - **The new melee-positioning layer = a leashed hold line, not pathfinding.**
    ez-ctf bots kite at a ranged bullet's preferred distance; Elementia's basic
    is melee, so bots close to `CONTACT_PX`. Bots anchor a few tiles in front
    of the hall (their spawn pushed toward the gates; the enemy funnel always
    converges on the hall, so enemies come to them) and, while engaging, may
    advance at most `ENGAGE_LEASH_PX` from that anchor. **The leash is the
    deliberate answer to the Phase-4-flagged chase-into-obstacle gap, in player
    form:** bots do **not** run A*/cost-field pathing (out of scope for slice
    1), so a naive "beeline the nearest enemy" would let a bot jam itself
    against a far maze wall exactly as a chase-mode enemy beelines the hall
    through a wall. The leash caps how far a bot strays, so it holds a line and
    lets enemies arrive rather than pathfinding to them. **Residual, flagged
    for Phase 8:** if the *nearest* enemy sits directly behind a wall on the
    bot's side, the bot can still press into that wall until a same-side enemy
    becomes nearer; acceptable because a live wave always puts closer same-side
    targets in front of it. Full bot pathing is deferred.
  - **Specials/seconds fire on range gates** (`SPECIAL_CAST_PX`/`SECOND_CAST_PX`,
    per element): the bot sets the action flag when the nearest enemy is within
    the ability's effective reach (radial ≈ AoE radius; Fireball reaches past
    its blast as a forward projectile), and `abilities.js` gates the actual cast
    on cooldown/level exactly as for humans. Seconds only from team level 4.
  - **Mid-run human takeover needed no new code** beyond what RoomManager
    already had: `_promoteBotSlot` + `_syncSlotToState` flip the *same*
    game-state player object to `isBot=false` (inheriting its position/HP/state)
    and reset its `ai` scratch, and structure re-lock falls out for free because
    `structures.canPlaceElement` keys on the owner's live `isBot`. Certified by
    `test/rooms/takeover.test.js`, not re-implemented.
  - **Bots still neither build nor earn/spend** (unchanged from Phase 5;
    economy.js guards every mutation on `!isBot`). The Phase-5 auto-placement of
    bot-element specials near the hall stands — bots do not build.
  - **Acceptance uses a two-lane maze** so the labor split is real: one human
    plugs one gap, the bots must cover the other. A single-gap wall funnels the
    whole horde onto the lone human and would hide the bots' contribution; the
    control (bots fed idle inputs) loses, proving them load-bearing. Bumped
    `ENGAGE_LEASH_PX` 180→300 during tuning so bots reach a choke lane, not just
    hall-front leakers. All `BALANCE.BOT` magnitudes are first-pass, flagged for
    the Phase 8 sweep.

- **2026-07-21 (Phase 6, CP3) — designer review CONDITIONAL GO; all findings
  deferred to Phase 8 on a reproduced chaotic-sensitivity finding.** CP3
  adversarial senior-game-designer review (Opus 4.8; Fable 5 unavailable this
  session) on the played bot build — full doc + remediation stamp in
  `docs/reviews/2026-07-19-checkpoint-phase6-designer-review.md`. Verdict:
  CONDITIONAL GO. Findings: **CRIT-1** (3 bots + an idle "statue" human hold the
  hall flawlessly through wave 8 with no maze → bots over-tank a solo run,
  violating spec §4's "supplement, not solo answer"); **HIGH-1** (bots share a
  hall-center anchor and never spatially distribute → weak flank coverage,
  structurally breaks the wave-9/10 multi-gate finale); **HIGH-2** (the Retreat
  branch has no anchor leash, so a low-HP squishy can flee unbounded to the map
  edge for the rest of a wave); **MED-1** (revive-seek peels every nearby bot at
  once, no one-reviver cap); **MED-2** (bots dump AoE specials on a single lead
  trash mob); **LOW-1** (wall-jam residual, confirmed low, already scoped).
  - **Outcome: certified baseline (commit `2f8c06e`) ships unchanged; every
    finding is folded into the Phase-8 balance sweep.** Each remediation was
    implemented and measured, and **each one flips the certified waves-1–4
    acceptance in a chaotic, non-monotonic way** — the same failure class as the
    Phase-4 respawn revert (chase-mode aggro FSM + hall-adjacent respawn). Key
    measurements (headless sims through the real tick path, 8–15 seeds): baseline
    is load-bearing and robust (acceptance survives 1–4 on 10/10 seeds, bots-off
    control loses on 8/10); a bot-only melee nerf is non-monotonic (mult 0.7 →
    survive wave 9, mult 1.0 → lose wave 4 — *weaker* bots surviving *longer*);
    even the two low-risk behavioral fixes (leashed retreat, one-reviver cap),
    with all balance magnitudes reverted, collapse the acceptance to the bots-off
    level ("both good" 0/15). The one-reviver cap *should* help (more bots keep
    fighting) yet reshuffles positions at the wave-4 spike and flips the outcome —
    proof the acceptance is chaotically sensitive to *any* bot behavior change,
    with no "more correct" value to tune toward until the shared root cause is
    fixed.
  - **Root cause the Phase-8 sweep must fix first/with the bot tuning:**
    chase-mode enemies (and, in player form, the non-pathfinding bots) beeline
    with no cost-field routing, plus hall-adjacent respawn timing. Per the
    Phase-4 precedent — never ship a value/behavior that merely clears a chaotic
    acceptance today — no per-parameter bot tuning is validated here. CRIT-1 is
    real and remains the **headline Phase-8 bot dial**, but it is a mid/late-game
    concern (flawless hold shows at wave 8; slice-1's acceptance is waves 1–4,
    where the difficulty curve is intentionally gentle), so the deferral does not
    compromise the slice-1 acceptance the plan defines. No correctness bug
    shipped (HIGH-2's unbounded retreat was investigated per the review; bounding
    it also flips the chaotic acceptance, so it defers with the rest).
  - **Acceptance-harness hardening carried into Phase 8:** add the inverse
    control the review recommends — "3 bots + idle human + no maze must LOSE by
    wave K" — to bind the human/maze contribution and catch CRIT-1 regressions,
    once the root-cause chaos is resolved enough to make it non-flaky.
