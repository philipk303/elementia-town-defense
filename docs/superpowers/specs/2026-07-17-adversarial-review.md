# Elementia Town Defense — Slice 1 Adversarial Review (Fable 5)

**Date:** 2026-07-17
**Reviewers:** Two Fable 5 subagents — a senior game designer and a senior multiplayer systems programmer — each given an adversarial mandate (find what breaks, do not validate).
**Subject:** `2026-07-17-slice1-design.md` Sections 1–4 (decided) + proposed Section 5 (technical, not yet written to the spec).
**Programmer grounding:** read actual ez-ctf source — `pathing.js`, `walls.js`, `placed.js`, `tick.js`, `loop.js`, `repair.js`, `stuck.js`, `emitGate.js`, `SnapshotBuffer.js`, `network.js`, `gameConfig.js`, `constants.js`, `rng.js`, `render.yaml`, `ai/index.js`, `ai/states/movement.js`.

---

## Synthesis — the load-bearing conclusions

### A. Both reviewers independently hit the SAME #1 issue: the gate-opening reachability hole

The reachability check only constrains *currently-open* gates, and gates open progressively in random order. So a legal maze can leave a newly-opened gate with **no path to the town hall** — a state the flow field has no answer for (no stored direction, undefined enemy behavior) and which players can deliberately exploit (wall off all closed gates for a free win / stationary-mob farm).

**The fix both reviews point to (independently):** make the field a **cost-weighted Dijkstra field where blocking structures are traversable at a cost derived from their HP**, instead of a hard-blocked BFS. Then:
- Enemies *always* have a direction (no undefined state when a gate opens behind walls).
- "Enemies attack what blocks their path" (Section 4) falls out for free — the cheapest route runs through a wall, so they chew through it.
- Walling off a future gate becomes a *legitimate, costed* strategy (enemies grind through) instead of an exploit or a crash.
- The placement-time reachability check downgrades from a correctness pillar to a UX nicety (stop accidental self-sealing).

This single redesign resolves the designer's #1 (gate/maze interaction) AND the programmer's R1 (undefined state) AND R3 (wrong algorithm — Dijkstra+octile replaces BFS). It is the highest-leverage change in the whole review.

### B. My proposed Section 5 contains factual errors about ez-ctf — corrected before anything is written

| I claimed | ez-ctf actually does (cited) | Consequence |
|---|---|---|
| 20Hz authoritative tick | **60Hz sim** (`CONFIG.TICK_MS = 1000/60`), 20Hz *broadcast* (`SNAPSHOT_EVERY_N_TICKS = 3`, `emitGate.js`) | Building a 20Hz sim silently changes movement/melee/projectile timing and breaks `SnapshotBuffer` timeline math. Keep 60Hz sim / 20Hz emit. |
| "client prediction + lerp" | **No prediction exists.** Pure interpolation; local player at 60ms delay, remote at 100ms; "never extrapolates" (`SnapshotBuffer.js`) | "Reuse prediction" promises a feature that isn't there. Either say "interpolation" or budget prediction+reconciliation as net-new. Good news: pure interpolation means server-side path/direction reversals do NOT rubber-band. |
| Single **BFS** flow field | A* uses **octile costs** (diag = √2) precisely because uniform-cost 8-connected search is metrically wrong | BFS = Chebyshev distance → enemies zigzag, take ~41%-worse routes, oscillate on hop-equal plateaus. Use **Dijkstra + octile weights** (the existing `MinHeap` in `pathing.js` is directly reusable). |
| "Reuse the tick loop / entity sim" | ez-ctf's "AI" is **4 bots that are players** (synthesize WASD inputs). `MAX_PLAYERS = 4`. Proven scale = 4 characters + bullets + ≤~12 placed objects | The enemy entity, flow-field movement integrator, melee-vs-structure combat, and status-effect system are **all new**. Wave 10 (dozens–100+ enemies, 100+ structures) exceeds proven scale 10–30×. Budget as "new sim on proven scaffolding." |
| "JSON over Socket.io as-is" | `buildEmitSnapshot` sends the **entire state** (incl. static obstacles, full-precision floats) 20×/s to every client | At wave 10: est. 1–3 MB/s outbound → ~10–30 hrs of late-game 4p play per month on Render's 100GB. Plus `JSON.stringify` of 30KB 20×/s on a **0.1-vCPU** shared instance. Needs quantization + packed arrays + change-versioned static data. **Spike before committing.** |

### C. Two design-level "which game is this?" forks that must be answered before code

1. **Can enemies threaten players?** As specced, enemies only attack path-blockers → a ranged player off-path takes zero risk → the entire down/bleed-out/revive/respawn system never fires unless someone voluntarily body-blocks. Either add proximity/retaliation aggro, or **cut the revive system from slice 1**. (Building a rescue system for a danger that doesn't exist is pure scope waste.)
2. **Define "CC" as a taxonomy.** "Super-heavy = immune to push/pull" says nothing about *slows/roots* (Muddy Bog, Blizzard, Snare). That ambiguity is what actually decides the "Orc is the hardest elite" claim — and the claim is probably false if roots work on the slow Elite Troll. Need displacement vs. slow vs. root, with an explicit per-weight-tier rule.

---

## Game Designer findings (prioritized)

1. **Random gate order + centered town hall selects FOR a degenerate central spiral and AGAINST the maze fantasy.** A concentric spiral around the hall serves all 4 gates at once; random gates only punish gate-specific mazes. No sell/refund exists anywhere, so a gate opening behind your maze = unrecoverable dead gold. Gate-opens-into-walled-state is undefined. Fixes: no-build ring around the hall (kills tight spirals), telegraph next gate one wave early, define the blocked-gate-open behavior, add sell/refund ~70%.
2. **Economy snowballs; opening "choice" doesn't exist.** Eco package payback ~1.4 waves in a 10-wave game → greedy-eco strictly dominates, mid-waves trivial, all difficulty on wave 10. And starting state is 8 food/8 citizens = **zero spare food**, so build-gating makes a Marketplace illegal at start and 3 gold can't afford a 4-gold Farm — the "one more Farm or Marketplace" opening choice is impossible as written. Fix: ~4–5 wave payback, set bounty:headcount ratio deliberately, fix the opening state.
3. **"CC" undefined → Orc-vs-Troll claim unresolvable and probably false.** (See Synthesis C2.) Enemies never chase players, so "can't be kited" is vestigial reasoning anyway.
4. **2-player Fire+Water has zero usable combos.** Their only pair is Steam Vent, which in slice 1 (no L8) is *permanently* the conflict/penalty state. The synchronized-unlock fairness rationale only holds at exactly 4 players. Fix: gate element selection, give Steam Vent a weak-positive slice-1 form, or guarantee ≥1 buildable pair for present elements in 2–3p games. Correct the recap: slice 1 ships **5** usable combos, not 6.
5. **Enemies ignore players → fight phase has no threat, revive system may never fire.** (See Synthesis C1.) Also undefined: do players block the flow field / can Earth be a living barricade?
6. **Universal weight-scaled displacement is an anti-synergy engine.** Push/pull yanks enemies out of trap combos (Magma Trap, Muddy Bog, Grinder); Wind's pull can drag enemies *toward* the objective; radial knockback can shove enemies onto shorter routes. FF-off doesn't help (FF governs teammate effects, not enemy repositioning) → griefing vector with no friendly fire needed. Fixes: rooted/frozen enemies are displacement-immune; clamp displacement so it can never reduce flow-field distance-to-hall.
7. **Leveling milestones unspecified; known spikes stack.** No wave numbers for L1–L4 → no evaluable power curve. Gate formula puts gates at 4/7/10; Trolls ~4–5; wave 10 stacks gate #4 + triple elites + max horde; waves 8–9 add nothing. Fix: pin milestones (suggest L2@w3, L3@w6, L4@w8 — new toy *before* finale), move gate #4 to wave 9.
8. **Shared wallet has no spend rules.** One player can drain the team wallet. #1 griefing vector in non-premade groups. Fix: per-player spend budget / vote-to-refund / room-creator veto — decide before netcode (shapes the build-event protocol).
9. **Food system is over-engineered for the decision it produces.** Vacation ordering, spillover, vacancy, auto-repopulate, build-gating all enforce what is functionally "a Marketplace requires 2 Farms." Fix: keep the destructible/maze-wall tradeoff, replace the machinery with "Marketplace needs 2 supporting Farms; lose a Farm → its Marketplace goes dormant." Same strategy, 1/5 the code.
10. **Smaller holes:** income timing (before build / after fight?); new buildings populate instantly or 1/wave?; kill-bounty magnitude vs headcount; no wave-preview UI (genre-core); minimap markers (S6) contradict no-scroll whole-map (S5) — kill the minimap; mobile at 30×30 = ~12px/tile is not credible for chibi sprites + precision placement (drop mobile OR the no-scroll decision); "animals" in the score formula are never defined — delete or define.

**Kept as genuinely good:** the elite modifier system (variety at ~0 art/AI cost), buildings-as-optional-maze-walls emergent tradeoff, vacation-never-Farms anti-death-spiral logic.

---

## Systems Programmer findings (prioritized)

- **R1 — Gate-opening reachability hole is a game-breaking exploit AND undefined behavior (WILL BREAK).** See Synthesis A. Redesign to cost-weighted Dijkstra with wall-HP traversal cost.
- **R2 — ez-ctf has NO NPC entity system; proven scale is 4 (WILL EXCEED PROVEN SCOPE 10–30×).** Bots are players synthesizing WASD. Enemy entity + flow-field integrator + melee-vs-structure + status system are all new. Hidden costs: `resolvePlacedCollision`/`isFreeForPlayer` do linear per-entity-per-tick scans over all placed objects (100 enemies × 150 structures × 60Hz ≈ 900k tests/s, allocating fresh objects → GC churn on shared CPU) → needs tile-indexed lookup + allocation-free pushout. **Do NOT reuse `stuck.js` teleport-recovery for enemies** — it would teleport a jammed Troll *through* the maze.
- **R3 — Plain BFS is the wrong algorithm (WILL PRODUCE WRONG/UGLY PATHS).** Hop-count ≠ octile distance. Use Dijkstra + octile weights (reuse `MinHeap`), replicate the corner-cut guard in BOTH field-expansion and per-enemy descent, deterministic tile-index tie-break. Seed from the ring adjacent to the town-hall footprint (the hall's own tiles are blocked and won't expand).
- **R4 — Netcode claims factually wrong (60Hz sim/20Hz emit; interpolation not prediction).** See Synthesis B. Critical constraint: **knockback/pull must be velocity-over-ticks, not positional impulse** — `SNAP_TELEPORT_PX = 96` means a long Hydro Blast push applied as an instant impulse either reads as a client teleport-pop OR (worse) tunnels the enemy *through a maze wall* server-side (`pushCircleFromAabb` only resolves overlap at the final position). Write this into Section 5.
- **R5 — Full-state JSON at horde scale: bandwidth is the first hard wall, serialization+GC the CPU wall (SPIKE, pessimistic prior).** See Synthesis B. Mitigations: quantize coords to ints; enemies as packed flat arrays not keyed objects; stop re-sending static data (hook `placedVersion`, already exists); cap concurrent rooms at 1–2 on free tier. Headless-sim wave 10 and measure before committing.
- **R6 — "Swap in a PathProvider" understates it: reused surface is ~40 lines of grid primitives; the movement consumer is new end-to-end.** No bots/FSM to swap into. Also: `buildBlockedGrid` corridor math works for radius-14 enemies, but **Elite sprites are scaled up** — cap *collision* radius at ≤14 regardless of sprite scale, and test an Elite Troll in a 1-wide corridor.
- **R7 — Tile-snapped placement vs `placed.js`: mostly compatible, 3 real breaks.** (1) **Caps must REJECT, not evict** — every existing call site evicts oldest (`walls.js:26-29`), which in a TD silently deletes a load-bearing wall and can even seal a gate without a reachability check. Opposite of proven code → will be copy-pasted wrong. (2) Repair range is center-to-center; against a 2×2 town hall an adjacent player is 16–32px farther → use edge-distance or the new channel mechanic. (3) `damagePlaced`/`destroyPlaced` bump `placedVersion` — good, that's the dirty-flag hook. Correct the spec: "zero cost during combat" is false (walls die mid-fight → field must recompute mid-fight); and "repair-to-full" is NOT a topology trigger (damaged walls still block) — delete it.
- **R8 — Silently-exceeded scope needing explicit line items:** client rendering of 100+ animated sprites + FX + combat text on mobile (ez-ctf proves ≤4); server-side `fx` volume fattening every snapshot (cap fx per type per emit); placement round-trip UX (request→validate→confirm/reject is new protocol + client state machine + rejection feedback); new build↔fight↔wave-end↔starvation phase machine (`checkPhaseTransitions` is CTF-specific). **Verified genuinely reusable:** Howler/AudioManager, `mulberry32` RNG, render.yaml wake-shell, Playwright harness, `balance_sweep.js` pattern, room/reconnect plumbing.

---

## Recommended next actions (before Section 5 is written or any code starts)

**Must redesign in the spec:**
1. Flow field → **cost-weighted Dijkstra with wall-HP traversal costs** (fixes gate hole + BFS + "attack blockers" in one). [Synthesis A; R1/R3]
2. Correct all Section 5 netcode language: 60Hz sim / 20Hz emit / interpolation (not prediction); knockback = velocity-over-ticks; caps reject-not-evict. [Synthesis B; R4/R7]
3. Answer the two "which game" forks: enemy→player threat (or cut revive); CC taxonomy (displacement/slow/root per weight tier). [Synthesis C]
4. Economy rebalance to ~4–5 wave payback + fix opening state + set bounty:headcount ratio + add sell/refund. [Designer 2, 1]
5. Add wallet spend-governance and pin leveling milestones. [Designer 8, 7]
6. Resolve the 2-player Fire+Water dead-combo case; correct "6 combos" → "5 usable in slice 1." [Designer 4]
7. Decide mobile vs. no-scroll-whole-map (30×30 ≈ 12px/tile is not credible for both). [Designer 10]

**Must spike before committing to the architecture:**
1. **Wave-10 free-tier budget** — headless sim, measure snapshot bytes + tick CPU, packed/quantized vs naive JSON. Go/no-go on "JSON as-is." [R5]
2. **Enemy entity system at scale** — 120 flow-field enemies + 150 structures through tile-indexed collision at 60Hz, allocation-free, velocity-based knockback, Elite-radius corridor test. Largest block of net-new code. [R2/R4/R6]

**Consider simplifying (YAGNI):** the food subsystem → "Marketplace needs 2 Farms" slot rule. [Designer 9]
