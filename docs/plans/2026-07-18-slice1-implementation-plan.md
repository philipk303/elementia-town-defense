# Elementia Town Defense — Slice 1 Implementation Plan

> **Phase 0 status (2026-07-18): both spikes GO.** Spike A: packed delta snapshot 3.2 KB (6.1× under naive), encode 9.5 µs — protocol adopted, free-tier room cap 2. Spike B: avg tick 0.037 ms / p99 0.151 ms dev (32× margin on the proxy budget), zero heap drift, elite-corridor test green. Full numbers: [`../../spikes/results.md`](../../spikes/results.md). Spike modules in `server/` are the adopted Phase 1+ foundation. Proceed to Phase 1.

**Date:** 2026-07-18
**Spec:** [`../superpowers/specs/2026-07-17-slice1-design.md`](../superpowers/specs/2026-07-17-slice1-design.md) (review-hardened, user signed off 2026-07-18)
**Executor:** Fable 5 builds and executes directly (no subagent-per-task ceremony). Adversarial subagent reviews (game designer + systems programmer) run at the checkpoints marked ⭑, per the spec's build strategy.

**Goal:** Ship slice 1 — 2–4 humans + bot-filled 4-element team, 10-wave co-op town defense on the 40×23 cost-field maze map, deployed to Render free tier.

**Architecture:** Server-authoritative Node sim (60Hz tick / 20Hz packed-snapshot broadcast, interpolation-only clients) reusing ez-ctf's scaffolding (`C:\dev\ez-ctf`); the enemy entity system, cost-field pathing, and economy are net-new and gated by the two Phase 0 spikes.

**Tech stack:** Express 4, Socket.io 4, Phaser 3.87, Howler 2.2, Vite 5, Playwright e2e, `node --test` for server unit tests. Deploy: Render free Web Service + static wake shell.

## Current program status (2026-07-26)

Phases 0–7, Phase 8A, and the Phase 8B tower baseline are complete in committed history. Current HEAD `2c220e3` is the clean accepted baseline. The working tree contains an uncommitted combat-structure candidate slice and calibration art; it is not accepted progress until redesign Gate 1 reviews and classifies it.

Detailed status and accepted SHAs live in `docs/plans/2026-07-26-slice1-status-ledger.md`. The following approved subplans extend this master roadmap:

- Combat redesign: `docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md`.
- Graphics: `docs/plans/2026-07-24-art-asset-generation-pipeline.md`.
- Audio: `docs/plans/2026-07-26-audio-asset-pipeline.md`.

Where the redesign conflicts with completed original-phase prose, the dated redesign amendments win. Completed foundations remain; only the named mechanics are superseded.

---

## Phase 0 — De-risking spikes (GO/NO-GO gate; nothing else starts until both pass)

Both spikes are headless Node scripts + unit tests in `spikes/`, zero runtime dependencies, committed with their measured results. The spike code for the cost field and collision index is written to production quality in `server/` paths from the start — if the spikes pass, it *is* the foundation (no throwaway).

### Spike A — Wave-10 free-tier snapshot budget

**Question:** Can a wave-10 snapshot (≈120 enemies, ≈150 structures, 4 players, capped fx) fit Render free tier (100 GB/mo egress, 0.1 vCPU) at 20Hz × 4 clients?

**Files:**
- `server/net/encode.js` — packed encoder: enemies as flat int arrays `[id,type,x,y,hp,flags,…]`, coords quantized to ints, structures sent only on `placedVersion` bump, fx capped per type per emit.
- `spikes/spikeA-budget.js` — builds a synthetic worst-case wave-10 state; measures for both **naive keyed-object JSON** (ez-ctf `buildEmitSnapshot` style) and the packed encoder: bytes/snapshot, MB/s at 20Hz×4 clients, GB per 100 hours, and `JSON.stringify`+encode CPU per emit (µs, then ×10 as the 0.1-vCPU proxy).
- `spikes/results.md` — measured numbers + verdict.

**Tasks:**
1. Write `test/net/encode.test.js`: round-trip decode equals input; coords quantized; statics omitted when `placedVersion` unchanged and included when bumped; fx capped at N per type. Implement `encode.js` to green.
2. Write the synthetic state generator (deterministic via ez-ctf's `mulberry32`): 120 enemies mixed Goblin/Orc/Troll + 3 elites, 150 structures, 4 players, 40 fx events.
3. Measure both encodings over ≥1000 emits (warmed up). Record in `spikes/results.md`.
4. **Thresholds (GO if all hold for the packed encoder):**
   - ≤ 8 KB per delta snapshot (statics unchanged) → ≤ 0.64 MB/s room total at 20Hz×4 → ≥ ~43 hrs of worst-case play per GB.
   - ≥ 30 GB/mo headroom at 2 concurrent rooms with plausible usage (compute from measurement; show the arithmetic).
   - Encode CPU ≤ 150 µs/emit on the dev machine (≈1.5 ms on 0.1 vCPU, inside the 50 ms emit interval with room to spare).
5. **NO-GO path:** if naive fails but packed passes → adopt packed (expected). If packed also fails → escalate to binary encoding (e.g. ArrayBuffer over Socket.io) as a spec amendment before Phase 1.

### Spike B — Enemy entity system at scale

**Question:** Can 120 flow-field enemies + 150 structures run collision + descent + status ticks at 60Hz allocation-free on a 0.1-vCPU budget?

**Files:**
- `server/game/grid.js` — grid primitives ported from ez-ctf `pathing.js` (`tileToWorld`/`worldToTile`/`inBounds`, `TILES_W=40`/`TILES_H=23`, `MinHeap` verbatim — it's deterministic-tie-break correct as-is).
- `server/game/costField.js` — Dijkstra cost field: octile weights (diag √2), seeded from the ring of tiles adjacent to the 2×2 hall footprint, walls traversable at HP-band cost (Healthy/Damaged/Critical), corner-cut guard in expansion, dirty-flag + ≤1-per-0.25s throttled recompute. Flat `Float32Array(920)`, no per-recompute allocation after init.
- `server/game/enemyMove.js` — per-enemy downhill descent (corner-cut guard replicated here; deterministic tie-break by tile index), velocity-over-ticks knockback integrator (never positional impulse), flow-field-follower stall failsafe (NOT ez-ctf `stuck.js` teleport).
- `server/game/collisionIndex.js` — tile-bucketed spatial index, O(1) neighbor lookup, allocation-free circle-vs-circle and circle-vs-AABB pushout (scratch vectors module-scoped, no `new` in the tick path).
- `spikes/spikeB-scale.js` — harness: 120 enemies descending a real maze layout + 150 structures, velocity knockback pulses, 60 simulated seconds at 60Hz; report avg/p95/p99 tick µs and GC stats (`--expose-gc`, `process.memoryUsage` deltas).

**Tasks (TDD each module before the harness):**
1. `test/game/costField.test.js` — field correctness on hand-built fixtures: (a) open field = octile distance; (b) cheap route through a Critical wall beats a long detour, and vice-versa when the wall is Healthy; (c) a gate sealed behind walls still gets a finite cost everywhere (no undefined state); (d) corner-cut: diagonal between two blocked orthogonals is never the descent direction; (e) recompute throttle honors the 0.25 s window; (f) hall's own 2×2 tiles never expand.
2. `test/game/enemyMove.test.js` — descent follows strictly decreasing cost; deterministic tie-break; knockback applied as velocity decays over ticks and **cannot cross a wall tile in one tick** (tunneling test: max per-tick displacement < tile size under the strongest Hydro Blast values); pushed enemy displaced *toward* the hall still resolves (no-progress-clamp rule honored).
3. `test/game/collisionIndex.test.js` — insert/move/remove bucket integrity; pushout resolves overlap without allocation (assert via before/after heap sample in the harness, not the unit test); **Elite corridor test:** collision radius capped at 14 regardless of sprite scale — a scaled Elite Troll traverses a 1-tile corridor the field marks open.
4. Build `spikes/spikeB-scale.js`, run, record in `spikes/results.md`.
5. **Thresholds (GO if all hold):**
   - avg tick ≤ 1.2 ms, p99 ≤ 3 ms on the dev machine (×10 proxy ⇒ avg ≤ 12 ms, p99 ≤ 30 ms on 0.1 vCPU against the 16.7 ms tick budget — p99 overruns absorbed by ez-ctf's accumulator loop).
   - Zero heap growth across the 60-sim-seconds run after warmup (allocation-free confirmed).
   - Elite corridor test passes.
6. **NO-GO path:** first lever is sim-side (enemy cap 120→90, or collision at 30Hz interleaved while movement stays 60Hz) — *not* dropping the 60Hz sim, which the spec forbids. Amend spec if a cap changes wave-10 composition.

### ⭑ Checkpoint 0 — commit spikes + results; adversarial programmer subagent reviews `spikes/results.md` + the four `server/game`/`server/net` modules. GO/NO-GO recorded at the top of this plan. Phases 1+ may be re-planned in detail here, informed by measured numbers.

---

## Phase 1 — Scaffold & server foundation

- Port ez-ctf scaffolding: `package.json` (Express 4/Socket.io 4/Phaser 3.87/Howler 2.2/Vite 5/Playwright), `render.yaml` two-service pattern (web + wake shell, `/healthz`), room + reconnect-token plumbing, `mulberry32`, 60Hz `loop.js`/`tickGame` shape, `emitGate.js` at `SNAPSHOT_EVERY_N_TICKS=3` wired to Spike A's packed encoder.
- New **phase machine**: lobby → build (3 timing styles from room settings) → fight → wave-end (income tally) → next build → … → win/loss. Room settings: timing style + friendly-fire flag.
- Tests: phase-transition unit tests incl. all 3 build-timing styles; netcode smoke test (2 headless clients receive coherent packed snapshots).
- **Acceptance:** two browser clients join a room, see the 40×23 map + hall, phases cycle on a stub wave.

## Phase 2 — Placement, structures & repair

- Tile-snapped placement over ported `placed.js`/`repair.js` with the three spec'd fixes: caps **reject** (never evict), repair range = **edge-distance**, `placedVersion` bump drives both field dirty-flag and static-snapshot resend.
- Structure catalog: Barricade/Snare Post/Watchtower, Farm, Marketplace, town hall (2×2, bottom-center), 4 element special structures; no-build arc behind the hall; build-phase-only sell at 60–70% refund; fight-phase build/sell lockout; channel-repair (≈3 s adjacent, reduced cost) for all structures incl. hall.
- Adjacency **combo resolution at build time** (server-validated, all 6 pairs) producing combo structures with their effects as data.
- Reachability **UX warning** (not a block) on self-sealing placements.
- Tests: reject-at-cap, refund math, dormancy trigger (Farm destroyed → dependent Marketplace dormant → rebuild reactivates), combo adjacency detection incl. element-lock rules (human-owned vs bot-element structures).
- **Acceptance:** full build phase playable by hand: place, sell, combo, repair.

## Phase 3 — Enemies, waves & aggro

- Enemy entities on the Spike B foundation: Goblin/Orc/Troll stat blocks (weight/speed tiers), Elite modifier (stats + weight-tier bump + radius cap 14), spawners at 3 gates, the 10-wave beat sheet as data (`waves.js`), gate telegraphy one wave ahead, randomized gate 2/3 order via seeded RNG.
- Status system: burn / Wet / slow / root / freeze with the two-axis scaling rules (displacement×weight incl. super-heavy immunity; slow-root×speed incl. super-fast immunity; root ⊥ displacement).
- Aggro state machine: proximity + damage trigger, 2–3 s sticky threat, leash, commit/anti-kite with diminishing pull-range; players (and bots) never block the flow field.
- Melee-vs-structure combat via the bulldoze-cheapest-path rule (falls out of the cost field; verify with a targeted test).
- Tests: beat-sheet table-driven wave composition; each CC×tier interaction; aggro FSM transitions (trigger/sticky/leash/commit) as pure-function tests.
- **Acceptance:** full 10-wave run vs. an undefended town ends in loss at the expected pace; a scripted maze layout kills wave 1–3 with towers alone.

## Phase 4 — Player characters & elements

- 4 element kits: shared melee basic (contact range → natural aggro pull), specials (Ground Slam / Fireball / Hydro Blast / Whirlwind) with server-side weight/speed-scaled resolution and the FF flag gating teammate effects; movement through ez-ctf's input pipeline.
- Down (~15 s bleed-out) → revive (~3 s channel, partial HP) → death → hall respawn (~20 s, scaling); full restore at build-phase start.
- Synchronized leveling L1–L4 at waves 1/3/6/8 (L2 combo unlock, L3 special boost, L4 per-class second ability) as broadcast events.
- Client: interpolation-only rendering (port `SnapshotBuffer`), chibi placeholder sprites (colored rects OK until Phase 7), floating combat text + status overlays with server-capped fx.
- Tests: FF on/off for every AoE/knockback/pull; down/revive/respawn timeline; level-milestone broadcasts.
- **Acceptance:** 2 humans play waves 1–5 end-to-end with real abilities.

## Phase 5 — Economy

- Even-split personal wallets (humans only), wave-end tally: hall 10 + 1/citizen + bounties (G1/O2/T3, elites ×3); ownership dividend (Farm +2, Marketplace +3, new gold, stops on destruction, none for pre-built); 2-Farms-per-Marketplace gate + dormancy; starting state (hall + 2 Farms + 1 Marketplace, 8 citizens, ~8 gold/player); one free special structure per element at first build (bot elements auto-placed near hall, sellable by humans).
- Tests: split math at 1–4 humans; dividend lifecycle; dormancy income; payback ≈ 4 waves under the first-pass numbers (assert with a scripted eco run).
- **Acceptance:** money round-trips correctly across a full run with 2 humans.

## Phase 6 — AI teammate bots

- Port ez-ctf player-bot FSM; new melee approach/positioning layer (close to contact, melee kiting); bots use specials, tank via the same aggro rules, revive and are revivable; no build/economy participation; mid-run human takeover inherits position/state and re-locks that element's structures.
- Tests: bot fills empty slots so team is always 4; takeover handoff; bot revive behavior.
- **Acceptance:** 1 human + 3 bots survives waves 1–4 with a reasonable maze.

## Phase 7 — Art, audio & UI polish

- Chibi shared base rig recolored 4 ways (AI-art → pixelation → PNG+JSON atlas, ez-ctf convention); greenskin sprites + scaled elites; structure art; reserved color tokens (Wind = off-white **with dark outline**, never `#FFF` bare); wave-preview UI; Howler `AudioManager` + `test:audio` ported as-is.
- **Acceptance:** `test:audio` green; mobile-landscape viewport renders wave 10 legibly on a real phone.

## Phase 8 — Balance, e2e & deploy

- `balance_sweep.js`-pattern headless sweeps over the flagged tunables (Sections 3/4 balance notes); Playwright e2e: create room → 2 clients → win a short seeded run; deploy to Render + wake shell; live 4-human playtest.
- **Acceptance:** win rate for a competent scripted team lands 40–70% across sweep seeds; deployed build survives a full 4-human run.

### ⭑ Checkpoint final — two adversarial subagent reviews (senior game designer on the played build + balance data; senior systems programmer on the full diff vs. spec), findings triaged and remediated, review stamped per the remediation-stamp convention.

---

## Amendment (2026-07-25): art direction and Phase 8.9

**Art-direction authority:** `docs/superpowers/specs/2026-07-25-art-direction-and-runtime-asset-integration.md`. Phase 7's art pass uses a cozy feudal-Japan/China storybook direction with friendly village-life warmth, readable pixel art, and baked chibi-anime variants. Fire is the saturated-orange-haired/topknot male in orange armor with a long saber; Wind is the pale-cyan-haired female in a flowing robe with compact fans. The unchanged `Goblin`/`Orc`/`Troll` runtime slots are visually authored as a dirty-mustard Karasu-tengu runner, burnt-saffron Oni ashigaru bruiser, and deep-ochre Mountain-oni heavy. These are aesthetic replacements only: no enemy role, stat, speed, weight, collision, pathing, wave, or network contract changes.

## Phase 8.9 — Animated Art Integration & Asset Pass

- Treat Phaser's **1280 x 736 (40 x 23, 32 px tiles)** playfield as authoritative. Run the engine-faithful asset-scale spike inside Phaser with the real grid, world positions, HUD/depth order, and landscape-phone presentation; do not use AI-generated scene mockups as runtime previews.
- Produce four hero atlases using `<state>_<dir>_<idx>.png` with `idle`, `run`, `attack`, `cast`, `hurt`, and `death`; register the manifest-driven redesigned inventory through the GPT Image→Pillow pipeline. Preserve pixel-perfect scaling, fixed foot baselines, atlas padding, and missing-asset fallbacks.
- Integrate sprite state from authoritative/interpolated runtime state: dead > downed/hurt > server-confirmed cast > run from displacement > idle, retaining last non-zero facing. Keep status tint/alpha, interpolation, depth, and gameplay collision/pathing independent of visual scale.
- Validate Fire's topknot/saber, Wind's hair/robe/fans, and the Karasu-tengu/Oni ashigaru/Mountain-oni silhouette, palette, gear, and weapon distinction in motion through the unchanged Goblin/Orc/Troll asset keys. Verify that elites remain visually readable without violating the existing 14 px radius cap or one-tile corridor behavior.
- **Locked calibration set:** Fire/Wind hero frames (64 x 64 canvas, 28-32 px wide by 40-46 px tall opaque target); Goblin/Orc/Troll (24 x 24 / 28 x 28 / 32 x 32); Barricade and Farm (32 x 32); Watchtower (32 x 48 visual over a 1 x 1 base); and existing Town Hall (64 x 64 / 2 x 2). GPT Image is the primary source generator; Nano Banana is optional for concept/reference variants; Pillow produces validated RGBA runtime output.
- **Footprint boundary:** art follows authoritative gameplay footprints: Barricade/Watchtower 1x1 blocking, Snare Post 1x1 walkable, element structures 2x1/1x2 walkable, fusions 2x2 walkable, and Hall 2x2. Visual overhang never changes collision or placement.
- **Theme boundary:** feudal Japanese/Chinese clothing, yokai, architecture, props, and palettes are source-art decisions only. Do not rename runtime entity types or modify gameplay code, balance, collision, pathing, placement, footprints, waves, or networking to fit the aesthetic.
- **Acceptance:** recorded spike result passes at actual desktop and landscape-phone game scale; no crop/anchor jitter/atlas bleed; animation transitions do not restart per snapshot; build grid, feet, health bars, and hall remain readable; failed asset loads retain the placeholder path.

## Amendment (2026-07-26): cohesive redesign continuation

The original slice is now continued through these phases:

- **Phase 8C — Contract and WIP reconciliation:** approve exact combat rulings; inventory the working-tree delta from `2c220e3`; classify accepted foundation/rework/superseded/unrelated changes; run Codex Sol Gate 1; commit only accepted foundations.
- **Phase 8D — Character redesign:** measurement extensions, four class basics, Wind fan, Fireball retune, class-range bots, and accurate placeholder presentation. Ends at Terra Gate 3.
- **Phase 8E — Structure substrate and individuals:** dynamic structure state, orientation/direction UX, Watchtower preservation, Snare Post, Rock Trap, Water Geyser, and Wind Vortex. Ends at Sol Gates 4–5 and required maze hang checks.
- **Phase 8F — Fusion lifecycle and behaviors:** consent, team ownership, permanence, repair, six real fusion behaviors, and Steam Vent last. Ends at Gates 6–7.
- **Phase 8G — Graphics, animation, and audio production:** execute the approved GPT Image→Pillow graphics pipeline and free-library→FFmpeg→Howler audio pipeline after accurate placeholders pass. The user approves calibration and production batches.
- **Phase 8H — Integrated balance and profiling:** run source-attributed balance matrices, server/network/client/audio budgets, hang gates, and manual readability/playability sessions.
- **Phase 8.9 — Final asset integration:** final atlases, manifests, anchors, animation/audio QA, mobile-landscape validation, attribution, and fallbacks. It no longer imposes obsolete 1x1 gameplay footprints.
- **Phase 9 — E2E and deployment:** two-client automation, four-human/reconnect run, measured Render CPU/egress, production smoke, and final release review.

### Superseded original requirements

- Phase 2 automatic adjacent 1x1 elemental fusion → oriented 2x1/1x2 ingredients, exact 2x2 geometry, consent, team ownership, and permanence.
- Phase 4 shared melee → four class-specific basic attacks.
- Phase 4 L2 combo gate → all six fusions available from L1.
- Phase 6 universal melee positioning → class-specific preferred combat ranges.
- Phase 7 generic combat presentation → explicit attack and structure presentation states.
- Phase 8.9 all-buildables-1x1 boundary → Barricade/Watchtower blocking 1x1; Snare walkable 1x1; element structures walkable 2x1/1x2; fusions walkable 2x2; Hall 2x2.
- Phase 8.9 five-state hero atlases → `{idle, run, attack, cast, hurt, death}`; `attack` is class-specific and `cast` is initially shared by both specials.
- Original Phase 8 final tuning/deploy → Phase 8H evidence first, then Phase 9 deployment.

### Graphics and audio authority

Graphics inventory is manifest-driven rather than fixed at 20 static images. GPT Image creates source art; Pillow normalizes RGBA, scale, palette, baselines, atlases, and Phaser metadata. Wind basic, Rock Trap, and Wind Vortex are the calibration slices before batch production.

Audio uses individually verified CC0/public-domain or CC-BY free-library sources with generated attribution. FFmpeg/ffprobe performs repeatable conversion and validation; Howler owns runtime playback. Build music scales across `build_calm`, `build_light`, `build_tense`, and `build_final`, with distinct build-lock, attack-start, and wave-clear stingers. Hard ceilings are 3 MB initial audio, 10 MB total audio, 8 MB complete initial payload, 12 combat voices, 4 structure voices, and 2 music tracks during crossfade.

### Lean model and review strategy (supersedes the historical strategy below)

- **Claude Sonnet 5** is the default executor for straightforward TDD, UI, known behavior families, pipeline tooling, conversion, manifests, tests, harness runs, and precise remediation.
- **Claude Opus 5 if selectable, otherwise the current `opus` alias** executes WIP reconciliation, instrumentation architecture, Wind projectile work, dynamic structure networking, Vortex, fusion consent/lifecycle, Grinder, Steam Vent, difficult animation-controller integration, and final balance interpretation.
- **Codex GPT-5.6 Terra** reviews measurement, character, fusion-batch, graphics-pipeline, and audio-pipeline gates.
- **Codex GPT-5.6 Sol** reviews WIP reconciliation, dynamic wire/placement, Vortex/individual-structure integration, Steam Vent/complete simulation, and final release evidence.
- Use eight scheduled combat review gates from the redesign plan, not one review per task. Add a review only for specified risk triggers. Review packets contain the relevant plan/spec excerpts, actual bounded diff, SHAs, focused evidence, and known gaps.
- Run those reviews from the executor's Claude Code session through OpenAI's official `openai/codex-plugin-cc`: `/codex:review` for normal Terra gates and one focused `/codex:adversarial-review` for Sol architecture/soft-lock gates. Run jobs in the background and preserve the returned job/session ID in the status ledger.
- Keep the plugin's automatic Stop-hook review gate disabled. Manual phase gates provide cross-model independence without creating token-draining Claude↔Codex review loops.
- The user owns gameplay, scope, visual, audio, and disputed-review decisions.

The older model assignments and handoff prompts below are retained as project history but do not govern Phases 8C–9.

## Historical model, review & handoff strategy (superseded for Phases 8C–9)

**Principle (spec §7 + Philip's model-tiering rule), revised 2026-07-19:** the original rule
("Fable 5 plans and reviews; cheaper models execute — never routine execution") was set before
Fable 5's own documentation was checked. A Haiku research pass against Anthropic's official docs
(`platform.claude.com/docs/.../introducing-claude-fable-5-and-claude-mythos-5`,
`.../prompt-engineering/prompting-claude-fable-5`, `.../models/overview`) found Fable 5 is
positioned as *"Anthropic's most capable widely released model, built for the most demanding
reasoning and long-horizon agentic work,"* with *"first-shot correctness on complex, well-specified
problems"* — i.e. genuinely suited to EXECUTING the hardest, most interacting-systems phases, not
just reviewing them. Tradeoff: 2× Opus 4.8's price ($10/$50 vs $5/$25 per MTok) and slower latency
(high-effort requests can run minutes). Revised rule: **match model to phase difficulty, not to a
fixed plan/review-only role for Fable.** Sonnet 5 still takes well-specified porting/data-driven
work; Opus 4.8 takes moderately-novel systems; **Fable 5 is now also available as executor for the
phases with the highest interacting-system complexity**, spending its premium only where first-shot
correctness on a hard, foundational build is worth more than the cost/speed delta.

**Reviewer independence is preserved regardless of executor model.** Adversarial checkpoint reviews
are always dispatched as an `Agent`-tool subagent, which starts with a fresh context and no memory
of how the code was written or by which model — independence comes from the subagent boundary, not
from the executor/reviewer being different models. So Fable-as-executor does not compromise CP3;
the CP3 review subagent is still adversarial and blind to the build session. (Belt-and-suspenders:
CP3 for a Fable-executed phase adds an Opus 4.8 cross-check pass alongside the Fable review subagent,
to catch anything a same-model reviewer might structurally share a blind spot on.)

### Per-phase assignments

| Phase | Executor model | Why | Review gate at end? |
|---|---|---|---|
| 0 — Spikes | Fable 5 ✅ done | Architecture-defining, risk-bearing | ⭑ **CP0 done** — programmer review, remediated |
| 1 — Scaffold & server foundation | Opus 4.8 ✅ done | Netcode wiring + new phase machine; subtle, but ez-ctf gives a strong template | ⭑ **CP1 done** — programmer review, remediated |
| 2 — Placement & structures | Sonnet 5 ✅ done | Well-specified port with 3 enumerated fixes; combo rules are data | no (folded into CP2) |
| 3 — Enemies, waves & aggro | Opus 4.8 ✅ done | Aggro FSM × status system × CC scaling × cost field — most interacting new logic in the project at the time | ⭑ **CP2 done** — programmer + designer review, remediated |
| 4 — Player characters & elements | **Fable 5** (revised 2026-07-19, was Opus 4.8) | Projectile subsystem + 8 abilities (4 L1 specials + 4 L4 second abilities) × FF-flag matrix × weight/speed-scaled resolution × down/revive/death/respawn lifecycle × client interpolation port — now the single most interacting-systems-heavy phase in the project; Fable's first-shot correctness on complex well-specified builds is worth the premium on this foundational phase | no dedicated gate; playable build reviewed at CP3 (independent Fable subagent + Opus 4.8 cross-check, per reviewer-independence note above) |
| 5 — Economy | **Sonnet 5** | Pure arithmetic + lifecycle rules, fully specified, heavily testable | no |
| 6 — AI teammate bots | **Opus 4.8** | Behavior tuning on reused FSM; melee positioning is new | ⭑ **CP3: designer review of the played build** (bots + combat feel; programmer only if CP2/Phase-4-cross-check flagged debt) |
| 7 — Art, audio & UI | **Sonnet 5** | Pipeline port + asset integration, low logic risk | no |
| 8 — Balance, e2e & deploy | **Opus 4.8** | Sweep interpretation + deploy debugging | ⭑ **CP-final: designer (balance data + played build) ∥ programmer (full diff vs spec)** |

**Escalate mid-phase** (switch session or dispatch a subagent) when: a spike assumption breaks (perf
wall, protocol limit), a spec redesign is needed, or a bug survives two systematic debugging attempts.
For a phase executed on Opus/Sonnet, escalate to Fable 5. For Phase 4 itself (already on Fable 5),
escalation means a fresh Fable 5 session with a narrower, more specified sub-task — not a model change.
Log the escalation in the phase's commit message.

### Adversarial review protocol (all checkpoints)

- Reviews are **Fable 5 subagents** with an adversarial mandate ("find what breaks; do not validate"), the pattern proven at CP0 — it caught a real tunneling critical that 23 green tests missed.
- **Profiles:** *senior multiplayer systems programmer* (correctness, perf, netcode, API traps — reads the actual diff + tests) and *senior game designer* (degenerate strategies, feel, difficulty curve — plays/reasons from the spec + build, not the code). Use the profile the phase's risk calls for; CP-final runs both **in parallel** (independent subagents, no shared state).
- Every review gets a written findings doc in `docs/reviews/`, and remediation is stamped at the top of that doc in the fixing session (per the standing remediation-stamp convention).

### Session handoffs & parallelism

- **Next session (Phase 4): start on Fable 5** (revised 2026-07-19 — see the per-phase table above), paste the Phase 4 handoff prompt below.
- **One phase per session** is the default (context stays sharp; the plan header + results.md carry state). If a session finishes a phase with ample room, it may start the next phase *only if the same model is assigned*; otherwise stop and hand off.
- **Subagent parallel builds** — use sparingly, only where file sets are disjoint:
  - **Phase 5 (Sonnet) ∥ Phase 7 asset-pipeline prep (Sonnet):** economy touches `server/game/economy*` + tests; art/audio touches `client/public/art`, audio tooling. Zero overlap → safe to run as two parallel subagents from one coordinating session (or two sessions).
  - **Within Phase 4:** server ability resolution vs client interpolation/rendering are separable tracks; two subagents acceptable if the snapshot schema is frozen first (it is — `encode.js`).
  - **Do NOT parallelize** Phases 1↔2↔3: they build on each other's server/game files sequentially.
  - CP-final's two reviewers always run in parallel (read-only, independent).
- **Executor sessions do not self-review.** They run tests + the phase's acceptance check, commit, and stop. Review subagents are dispatched at checkpoints only — either from the executor session (dispatching a Fable subagent) or as a separate Fable session.

### Handoff prompt for the Phase 1 session (paste verbatim into a new Opus 4.8 session)

```
Continue the Elementia Town Defense build (repo: C:\dev\Elementia-Town-Defense, git initialized, all work committed).

You are the Phase 1 EXECUTOR, running on Opus 4.8 per the plan's model strategy. Read, in order:
1. docs/plans/2026-07-18-slice1-implementation-plan.md — status header says Phase 0 is GO; execute "Phase 1 — Scaffold & server foundation" exactly as scoped, honoring "Standing rules for execution" and the model/review strategy section.
2. docs/superpowers/specs/2026-07-17-slice1-design.md — Sections 1 and 5 minimum (authoritative spec).
3. spikes/results.md — adopted protocol + the four Phase-1 follow-up line items (Render-hardware spike run, +15% protocol overhead margin, asset-egress budget, room-cap=2 enforced in code). These follow-ups are part of Phase 1.
4. docs/reviews/2026-07-18-checkpoint0-review.md — remediation stamp; do not re-verify fixed findings.

Reference implementation to port from: C:\dev\ez-ctf (Express/Socket.io scaffold, render.yaml wake-shell, room/reconnect plumbing, 60Hz loop.js/tick shape, emitGate at SNAPSHOT_EVERY_N_TICKS=3). The packed encoder (server/net/encode.js) and the game modules in server/game/ are adopted foundation — build on them, don't rewrite.

Rules: TDD all server logic (node --test); commit at every green boundary; never commit red; spec deviations get a dated amendment in the spec file. Do NOT self-review and do NOT start Phase 2 (it's assigned to Sonnet 5). Escalate to Fable 5 only if a spike assumption breaks or a bug survives two systematic debugging attempts.

When Phase 1's acceptance criterion passes (two browser clients join a room, see the 40×23 map + hall, phases cycle on a stub wave), commit, then dispatch checkpoint CP1: a Fable 5 subagent, senior-multiplayer-systems-programmer profile, adversarial mandate, reviewing the Phase 1 diff + tests; write findings to docs/reviews/, remediate criticals/highs, stamp the review doc, commit. Then STOP and report: Phase 2 hands off to a Sonnet 5 session.
```

### Handoff prompt for the Phase 4 session (paste verbatim into a new Fable 5 session)

```
Continue the Elementia Town Defense build (repo: C:\dev\Elementia-Town-Defense, git initialized, all
work committed on master; last commit 4cfb1e2, suite 162/162 green, no production code for Phase 4
written yet — this is a clean start).

You are the Phase 4 EXECUTOR, running on Fable 5 per the plan's revised model strategy (2026-07-19 —
see "Model, review & handoff strategy" above: Fable 5 executes this phase because it is now the
single most interacting-systems-heavy phase in the project — projectiles × 8 abilities × FF matrix ×
weight/speed-scaled resolution × down/revive/respawn lifecycle × client interpolation). Read, in order:
1. This file's "Phase 4 — Player characters & elements" section (scope) and "Standing rules for
   execution" below.
2. docs/superpowers/specs/2026-07-17-slice1-design.md — Section 2 (base kits table, CC counter-
   triangle, combos, leveling ladder), Section 4 ("Death & revive"), Section 5 (netcode: 60Hz sim/20Hz
   broadcast, client = interpolation ONLY — never prediction/extrapolation; knockback/pull = velocity-
   over-ticks never a positional impulse — reuse this pattern, don't reinvent it).
3. docs/reviews/2026-07-18-checkpoint2-{programmer,designer}-review.md — remediation stamps; do not
   re-verify fixed findings, but do read what CP2 flagged as deferred (funnel-meta shape, Water-special
   DPS, elite-HP shaping — Phase 8 sweep territory, not yours to fix).

**Two scope decisions already locked by Philip (2026-07-19), do not re-litigate:**
- **Real projectile subsystem** for Fireball and any other projectile-style special/L4 ability: spawned
  entities, per-tick flight (velocity-based, same tunneling-safety discipline as enemyMove.js
  knockback), collision vs enemies, wire encoding, client interpolation. Not an instant aim-resolved
  AoE shortcut.
- **Full L4 second abilities**, all 4 per-class, designed and implemented now (not stubbed) — even
  though the phase's own acceptance test only exercises waves 1-5. The 10-wave beat sheet and L1-L4
  milestones (waves 1/3/6/8) are already fully built by Phase 3; Phase 4's acceptance window is a
  verification checkpoint, not a content cap.

**Reuse, don't rebuild:** server/game/status.js (burn/wet/slow/root/freeze + two-axis CC scaling),
server/game/enemyMove.js (applyKnockback + integrate — velocity-based, MAX_STEP_PX clamp; the exact
pattern your player abilities' knockback/pull must follow), server/game/aggro.js (triggerAggro for
the melee-basic's aggro pull), server/game/towers.js (the effect-application pattern: damage → status
→ knockback, and the BALANCE.TOWER-style per-type spec table — your BALANCE.ABILITY/PLAYER blocks
should follow the same shape), server/game/collisionIndex.js (resolveTilePushout for projectile/player
collision), server/net/encode.js (frozen wire schema — EXTEND it: player DOWNED/DEAD/REVIVING flags,
team level `lv`, a projectiles array, following the existing flat-array/quantized-int conventions;
do not break existing decode tests). server/game/enemies.js tickEnemies is where enemy→player melee
damage plugs in (the explicit Phase-3 deferral — "Enemy → player damage ... is Phase 4").

**Balance magnitudes** go in shared/balance.js only (never inline) — new PLAYER/ABILITY/PROJECTILE/
LEVELING blocks, following the existing BALANCE.TOWER/BALANCE.STATUS/BALANCE.AGGRO shape (first-pass
numbers, comment-flagged for the Phase 8 sweep like everything else there).

**Suggested task breakdown** (roughly the order dependencies allow; TDD each):
1. Balance blocks (PLAYER/PROJECTILE/LEVELING/ABILITY) — added incrementally as tests demand, not
   all up front.
2. Player entity: input pipeline (PLAYER_INPUT → buffer → tick) + movement (interpolation-only on the
   client per spec; players never block the flow field on the server).
3. Down/revive/death/respawn timeline (bleed-out ~15s, revive channel ~3s at partial HP, death →
   hall respawn ~20s + late-wave scaling, full restore at build-phase start).
4. Enemy → player melee damage (closes the Phase-3 deferral; needed before down/revive means anything).
5. Shared melee basic attack (contact range, pulls aggro via triggerAggro(byDamage=true)).
6. Projectile subsystem.
7. 4 element specials (Ground Slam / Fireball / Hydro Blast / Whirlwind) — weight/speed-scaled,
   FF-gated, L3 boost scalar.
8. Synchronized leveling L1-L4 (milestone broadcasts at waves 1/3/6/8; L2 gates the diagonal combos,
   L3 boosts specials, L4 unlocks the second abilities).
9. L4 second abilities, all 4 per-class (design them — the spec doesn't prescribe specifics beyond
   "new individual special ability (per class)"; pick something that reads clearly against each
   element's identity and the CC counter-triangle, document the design choice in the spec amendment).
10. encode.js wire extensions + decode test coverage.
11. tick.js/index.js integration (PLAYER_INPUT socket handler, leveling broadcast event).
12. Client: port SnapshotBuffer (local ~60ms / remote ~100ms interpolation delay per NETCODE consts,
    never extrapolate), input capture, down/dead overlays, projectile rendering, ability/level FX,
    floating combat text (server-capped fx per the existing fx-cap pattern).
13. Acceptance test + live verification + spec amendment + commit.

Rules: TDD all server logic (node --test); commit at every green boundary; never commit red; any gap-
filling design decision (L4 ability specifics, projectile tuning, etc.) gets a dated amendment in the
spec file, same convention as Phases 2 and 3. Do NOT self-review and do NOT start Phase 5 (assigned to
Sonnet 5).

**Acceptance:** 2 humans play waves 1-5 end-to-end with real abilities — verify live via the dev
server (Browser pane or equivalent), not just green tests.

When acceptance passes, commit, then report to Philip that Phase 4 is ready for **CP3**: per the
reviewer-independence note in the model strategy section, dispatch an independent Fable 5 subagent
(senior-multiplayer-systems-programmer profile, adversarial mandate) reviewing the Phase 4 diff, PLUS
an Opus 4.8 cross-check pass (belt-and-suspenders, since the executor and primary reviewer are both
Fable 5 this phase) — plus the senior-game-designer profile on the played build (combat feel, FF
matrix sanity, ability identity). Write findings to docs/reviews/, remediate criticals/highs, stamp
the review docs, commit. Then STOP and report: Phase 5 hands off to a Sonnet 5 session.
```

---

## Standing rules for execution

- TDD on all server logic; `node --test` unit tests live in `test/` mirroring `server/`; Playwright only for e2e.
- Commit at every green-test boundary; never commit red.
- Any deviation from the spec discovered mid-build gets written back into the spec file (dated amendment), not silently absorbed.
- Balance magnitudes are tunable data in one config module (`shared/balance.js`) from day one — never inline constants.
