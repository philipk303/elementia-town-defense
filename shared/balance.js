// Tunable balance magnitudes — the ONE home for numbers the balance sweep
// (Phase 8) may move. Nothing here is structural; structural values (map
// geometry, events, tick rate) live in shared/constants.js.
//
// Phase 1 uses the phase-timing and wave-count values plus the beat-sheet
// scaffold. Enemy stats / economy numbers are added by their owning phases
// (3 and 5) — kept here as empty scaffolds so later phases extend, not inline.

export const BALANCE = {
  // Town hall integrity (loss = hall falls). Placeholder magnitude; sweep-tunable.
  HALL_HP: 1000,

  // Phase durations (ms). Build-phase timer applies to the 'fixed' and
  // 'timer-ready' styles; 'ready' style is untimed (ends on all-ready).
  PHASE: {
    BUILD_TIMER_MS: 45_000,   // fixed / timer-ready build-phase length
    WAVE_END_MS:     8_000,   // income-tally intermission before next build
    // Phase-1 stub only: how long the (enemy-less) fight phase runs before the
    // stub driver marks the wave cleared. Phase 3 replaces the stub with real
    // spawners + enemy deaths driving spawnComplete / livingEnemyCount.
    FIGHT_STUB_MS:   5_000,
  },

  // No-build arc behind/around the hall (radius in px from hall center) — keeps
  // the hall approach clear. Enforced at placement (Phase 2); defined here now.
  NO_BUILD_ARC_RADIUS_PX: 160,

  // Structure catalog (spec §3 tower table + §2 specials/combos). First-pass
  // magnitudes, flagged for the Phase 8 balance sweep like everything else here.
  STRUCTURES: {
    BARRICADE:      { cost: 2,  hp: 40 },
    SNARE_POST:     { cost: 4,  hp: 30 },
    WATCHTOWER:     { cost: 6,  hp: 50 },
    FARM:           { cost: 10, hp: 60 },
    MARKETPLACE:    { cost: 10, hp: 80 },
    EARTH_SPECIAL:  { cost: 8,  hp: 70 },
    // cost 8 -> 7 2026-08-02, last lever of the Firepit A1.4(a) retune — see
    // docs/reviews/2026-08-02-firepit-dps-retune.md §4c. Cost is a coverage
    // lever (how many the spendDown policy can afford), distinct from the
    // dps/margin/burn rate levers already tuned.
    FIRE_SPECIAL:   { cost: 7,  hp: 70 },
    WATER_SPECIAL:  { cost: 8,  hp: 70 },
    WIND_SPECIAL:   { cost: 8,  hp: 70 },
    // Combos replace their two components at build time — no extra gold cost.
    MAGMA_TRAP:     { cost: 0,  hp: 90 },
    FIRESTORM:      { cost: 0,  hp: 90 },
    // hp REVERTED to the spec-original 90 on 2026-08-04. The 2026-08-02 Task 20
    // hp buffs on MUDDY_BOG (->150), BLIZZARD (->180->135), STEAM_VENT (->160)
    // and GRINDER (->160) were all chosen from maze-A fusion score readings
    // that are now known to be an instrument artifact: the free special's
    // 2-wide footprint decided which `towerSites` entry the harness policy's
    // BLOCKING Watchtower fell back to, and on maze A that choice alone was
    // worth up to ~1.2 score points -- larger than any effect those readings
    // reported. See docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md.
    //
    // hp is the worst dial to have tuned against that artifact: a
    // longer-surviving fusion body keeps the Watchtower displaced for longer,
    // so raising hp partly tuned the confound itself.
    MUDDY_BOG:      { cost: 0,  hp: 90 },
    BLIZZARD:       { cost: 0,  hp: 90 },
    STEAM_VENT:     { cost: 0,  hp: 90 },
    GRINDER:        { cost: 0,  hp: 90 },
  },

  // Population/eco structural rule (spec §3): a Marketplace requires 2 standing
  // Farms; owner dividends paid while the structure survives and (for
  // Marketplace) is not dormant.
  FARM_HOUSES: 2,
  MARKETPLACE_HOUSES: 4,
  FARMS_PER_MARKETPLACE: 2,
  FARM_DIVIDEND: 2,
  MARKETPLACE_DIVIDEND: 3,

  // Sell/refund (spec §3: "partial refund ~60-70% of cost"). Build-phase only.
  SELL_REFUND_RATE: 0.65,

  // Wave-end income tally (spec §3 "Economy"). Pooled income = hall base +
  // 1 gold/living-citizen + that wave's bounty accrual, split evenly across
  // human players only (bots neither earn nor spend). Ownership dividends
  // (FARM_DIVIDEND/MARKETPLACE_DIVIDEND above) are new gold on top, paid only
  // to the human who personally built the structure.
  ECONOMY: {
    STARTING_GOLD:     8,   // spec: "first-pass ~8 gold" per player
    HALL_BASE_INCOME:  10,  // town hall's flat per-wave contribution
    CITIZEN_INCOME:    1,   // gold/wave per living citizen (farm+marketplace houses)
  },

  // Channel-repair (spec §5: "channel N seconds next to any damaged structure").
  REPAIR: {
    RANGE_PX:      40,     // edge-distance from structure footprint AABB
    CHANNEL_MS:    3000,   // ~3s per spec
    COST_FRACTION: 0.5,    // reduced cost vs. full rebuild (Phase 5 wires the charge)
  },

  // Cost-field routing (spec §5). Extra cost to ENTER a wall tile, indexed by
  // the hpToBand band: [NONE, HEALTHY, DAMAGED, CRITICAL]. Lived in
  // costField.js as a module constant until Phase 8A; moved here because it is
  // the single most consequential routing dial in the game and was therefore
  // the one dial a balance sweep could not reach. Note the discontinuity this
  // creates: one point of chip damage can flip a band, which re-routes the
  // WHOLE horde on the next throttled recompute (<=1 per 250ms). That is the
  // leading suspect for any genuine sensitive dependence in this sim.
  COST_FIELD: {
    WALL_ENTRY_COST: [0, 30, 12, 4],
  },

  // 10-wave beat sheet (spec §4). Discrete escalation events (gate opens,
  // enemy-type intros, level-ups) are the fixed beats; `comp` is the per-wave
  // enemy composition (TOTAL counts, distributed across the currently-open
  // gates by waves.js). Phase-3 decision (amendment): an explicit composition
  // table rather than a scaling formula — same table-driven testability, easier
  // for the Phase 8 sweep to move directly. `gate` marks the wave a NEW gate
  // opens ('SIDE_A'/'SIDE_B' resolve to LEFT/RIGHT per-run via seeded RNG);
  // `level` marks a leveling beat (Phase 4 consumes it). Counts are first-pass.
  WAVE_COUNT: 10,
  WAVES: [
    { wave: 1,  gate: 'CENTER', level: 1,    comp: { goblin: 6,  orc: 2 } },
    { wave: 2,  gate: null,     level: null, comp: { goblin: 8,  orc: 5 } },
    { wave: 3,  gate: null,     level: 2,    comp: { goblin: 6,  orc: 10 } },
    { wave: 4,  gate: 'SIDE_A', level: null, comp: { goblin: 10, orc: 12 } },
    { wave: 5,  gate: null,     level: null, comp: { goblin: 8,  orc: 10, troll: 3 } },
    // Elite introduction order (CP2 designer H1): the first elite is the Elite
    // TROLL — rootable/freezable, so towers can counter it (a clean teaching
    // moment). The CC-immune Elite Goblin (wave 8) and the no-clean-counter
    // Elite Orc (wave 9) follow once the lesson has landed.
    { wave: 6,  gate: null,     level: 3,    comp: { goblin: 10, orc: 12, troll: 3, eliteTroll: 1 } },
    { wave: 7,  gate: 'SIDE_B', level: null, comp: { goblin: 14, orc: 16, troll: 5 } },
    { wave: 8,  gate: null,     level: 4,    comp: { goblin: 14, orc: 16, troll: 6, eliteGoblin: 1 } },
    { wave: 9,  gate: null,     level: null, comp: { goblin: 20, orc: 22, troll: 8, eliteOrc: 2, eliteTroll: 1 } },
    { wave: 10, gate: null,     level: null, comp: { goblin: 30, orc: 30, troll: 12, eliteGoblin: 2, eliteOrc: 2, eliteTroll: 2 } },
  ],

  // Which wave each gate first opens (spec §4: 1 / 4 / 7). SIDE_A/SIDE_B are
  // logical labels; the physical LEFT/RIGHT assignment is randomized per run.
  GATE_OPEN_WAVE: { CENTER: 1, SIDE_A: 4, SIDE_B: 7 },

  // Spawn scheduling within a fight (waves.js). Enemies stream in rather than
  // appearing all at once; gates are staggered so multi-gate waves interleave.
  // Per-spawn timing jitter drawn from the seeded RNG (Phase 8A). This is the
  // sim's only genuine per-run entropy beyond the gate-order coin flip: before
  // it, every "seed" produced one of exactly two simulations, which is why
  // every multi-seed result this project ever printed was really n=2. It is
  // also a deliberate sensitivity probe — if outcomes barely move under +/-
  // JITTER_MS, the sim is stable and the "chaos" was the instrument.
  WAVE_SPAWN: { INTERVAL_MS: 500, GATE_STAGGER_MS: 200, JITTER_MS: 150 },

  // Enemy roster magnitudes (spec §4). Weight/speed TIERS are structural
  // (server/game/enemyTypes.js); these are the tunable numbers. moveSpeed is a
  // pure function of the speed tier (SPEED_PX indexed by tier) so the elite
  // tier bump also moves speed — Elite Goblin super-fast is faster, Elite Troll
  // stays slow — without a second per-type speed table.
  ENEMY: {
    MAX: 256,               // preallocated store capacity (wave-10 peak ~78 < cap)
    SPEED_PX: [40, 65, 90, 120],  // indexed by SPEED tier (slow/med/fast/super-fast)
    MELEE_RANGE_PX: 6,      // edge-distance to a structure/hall AABB to melee it
    BASE: {
      // type index → {hp, damage, attackCooldownMs, bounty, radius(px, <= 14)}
      0: { hp: 12, damage: 4,  attackCooldownMs: 700,  bounty: 1, radius: 9  }, // GOBLIN
      1: { hp: 30, damage: 8,  attackCooldownMs: 900,  bounty: 2, radius: 11 }, // ORC
      2: { hp: 90, damage: 20, attackCooldownMs: 1200, bounty: 3, radius: 14 }, // TROLL
    },
    ELITE: { hpMult: 3, damageMult: 1.5, bountyMult: 3, radiusMult: 1.4, radiusCap: 14 },
  },

  // Status / CC system (spec §2/§4 two-axis scaling). Displacement scales by
  // WEIGHT and lives in enemyMove.js (super-heavy immune). Slow/root/freeze
  // scale by SPEED here (super-fast immune). Root is independent of displacement.
  STATUS: {
    // slow/root/freeze DURATION and slow STRENGTH are resisted by speed tier;
    // both indexed by SPEED tier. super-fast (index 3) = 0 → full immunity.
    CC_DURATION_SCALE: [1.0, 0.75, 0.5, 0.0],
    CC_STRENGTH_SCALE: [1.0, 0.75, 0.5, 0.0],
    BURN:   { defaultMs: 3000, defaultDps: 6 },  // pure DoT — no tier scaling
    WET:    { defaultMs: 4000, slowFactor: 0.85 }, // tag + mild slow; enables freeze
    SLOW:   { defaultMs: 2000, factor: 0.5 },     // 0.5 = half speed at full effect
    ROOT:   { defaultMs: 1500 },
    FREEZE: { defaultMs: 2000 },
    // Steam Vent confusion (§6.1, Amendment A2.2). These three are SYSTEM
    // properties, not vent properties — a second confusion source would share
    // them — so they live beside the other status defaults while the applied
    // duration comes from the structure's own spec (TOWER.STEAM_VENT.confuse).
    //
    // maxEpisodeMs is the hard bound that makes "cannot create permanent
    // wandering" true by construction: one episode can never outlast it no
    // matter how many vents refresh it. It is speed-tier scaled like every
    // other CC duration, so a fast enemy's ceiling is lower too. immunityMs is
    // deliberately FLAT: scaling it by tier would hand fast enemies a shorter
    // immunity to go with their shorter confusion, raising their confused
    // fraction — the opposite of "faster enemies recover sooner".
    CONFUSE: { maxEpisodeMs: 2500, immunityMs: 1500, turnMs: 400 },
  },

  // Aggro FSM (spec §4). Players/bots are valid targets and never block the
  // flow field. First-pass magnitudes flagged for the sweep.
  AGGRO: {
    PROXIMITY_PX:  90,     // enemy aggros a player within this range
    STICKY_MS:     2500,   // ~2-3s sticky threat, refreshed by continued hits
    LEASH_PX:      220,    // chase only within this of the path anchor
    // CP2 H3/M3 anti-kite: COMMIT_MS >= CHASE_CAP_MS so a forced commit makes at
    // least as much hall progress as the chase that triggered it — a parked
    // player can no longer perpetually brake the whole horde. (Raised COMMIT to
    // meet the cap rather than lowering the cap below STICKY_MS, which would kill
    // the 2.5–4s sticky-lapse window.)
    CHASE_CAP_MS:  4000,   // max continuous chase before forced commit
    COMMIT_MS:     4000,   // committed: ignore aggro, beeline hall
    PULL_DIMINISH: 0.6,    // each repeated yank multiplies effective pull-range
    PULL_DIMINISH_MAX: 4,  // CP2 M2: cap the stacks so pull-range never hits 0
  },

  // Tower/trap OFFENSE (spec §3/§2). Only entries listed here attack; walls
  // (barricade), eco (farm/marketplace) and the hall have no entry. Combos and
  // specials apply their signature status alongside light damage. First-pass.
  TOWER: {
    // Range and damage CUT 2026-07-26 (Philip): the Watchtower dominated the
    // element line on every axis at once, and its 130px disc (~53,000 px²) was
    // ~9x any footprint field's area. 130 -> 100 px cuts the disc ~41%.
    // dps cut 5/600ms (8.33) -> 4/750ms (5.33) -> 3/750ms (4.00) 2026-08-02, as
    // part of the Firepit A1.4(a) retune — see
    // docs/reviews/2026-08-02-firepit-dps-retune.md.
    //
    // rangePx 100 -> 75 (25% cut), NOT the 50% cut (rangePx 50) that was tried
    // and REVERTED. At 50, `phase3Acceptance.test.js`'s "a scripted maze of
    // towers clears waves 1-3" — a NO-PLAYER, 40-Watchtower maze that must
    // survive the easiest three waves on tower fire alone — failed outright
    // (hall destroyed in wave 1). That maze sites towers 2-3 tiles (64-96px)
    // off the lane centreline; a 50px range is SHORTER than that offset, so
    // every one of the 40 towers was farther from the lane than its own range
    // reached — a total functional collapse, not a balance nuance. Isolated
    // and confirmed range-only (not the dps cut) via a direct sim run: range
    // 75/dmg 3 clears the same maze cleanly, range 50/dmg 3 does not.
    // 75 was already measured safe (passes this acceptance test) and gives a
    // real, replicating effect against Firepit under spendDown on maze A
    // (diff -0.151, t 2.28); see the retune review for the isolated
    // range-only measurement (`test/harness/watchtowerRangeProbe.js`).
    WATCHTOWER:    { rangePx: 75, damage: 3, cooldownMs: 750 },
    // SNARE_POST (redesign §4.2, true-aura per Task 10) — the bounded-cadence
    // AURA family, distinct from Firepit's always-on field (Amendment B applies
    // only to family 1; Snare Post keeps a fixed-interval pulse per §4.2 and the
    // 2026-07-26 review). No target search, no damage: every enemy within
    // radiusPx is slowed on each cadenceMs refresh. radiusPx cut from the old
    // 80px single-target range to match "small circular aura" (§7); exact
    // numbers are a first-pass placeholder for the balance sweep.
    SNARE_POST:    { aura: true, radiusPx: 40, cadenceMs: 220, slow: { factor: 0.6, ms: 800 } },
    // ROCK TRAP (redesign §5.2, Task 11) — the TARGET-IMPACT family: targets
    // the highest-maxHp enemy in a large acquisition circle, telegraphs, then
    // resolves a high direct hit + low splash at the LOCKED world point
    // (Amendment C.2), not the target's moved position. Medium-to-long
    // cooldown; first-pass magnitudes for the Phase 8 sweep like everything
    // else here.
    // splashRadiusPx 32 -> 48, cooldownMs 4000 -> 3000 (2026-08-04, A1.4(a)
    // standalone retune) — see docs/reviews/2026-08-04-rock-trap-site-cap-
    // fix-and-balance-tweak.md. The locked-point resolution (Amendment C.2)
    // never re-tracks its target, so a fast enemy walking >32px during the
    // 500ms telegraph escaped the splash entirely; 48px gives more dodge
    // tolerance. Confirmed at full 72-seed sample against Watchtower: takes
    // maze A from a decisive loss (t 6.41) to statistically neutral (t 1.16)
    // and strengthens maze B's already-decisive win (t 4.92 -> 8.73). Hang
    // gate clean (0/144) both mazes at these values. Cost (8) was screened
    // and dropped — zero measurable effect, already gold-limited below where
    // a price cut matters.
    EARTH_SPECIAL: {
      targetImpact: true,
      rangePx: 140, telegraphMs: 500,
      damage: 40, splashDamage: 6, splashRadiusPx: 48,
      cooldownMs: 3000,
    },
    // FIREPIT (redesign §5.1) — the FOOTPRINT PULSE family, not a tower. No
    // range, no target search: it damages and burns everything standing in its
    // 2x1 footprint expanded by `marginPx` of radiated heat. First-pass
    // magnitudes; §11 defers exact numbers to the balance matrix.
    // FIREPIT (redesign §5.1) — an ALWAYS-ON area field, not a pulse (Philip,
    // 2026-07-26). No range, no target search, no cadence: everything standing
    // in the 2x1 footprint expanded by `marginPx` takes `dps` continuously and
    // has its burn refreshed. Continuous removes the defect the pulse had, where
    // output depended on phase alignment with enemy transit.
    // field dps 9 -> 12 -> 15, burn 8/3000ms -> 9/4000ms, 2026-08-02,
    // continuous-delivery retune against A1.4(a) — see
    // docs/reviews/2026-08-02-firepit-dps-retune.md.
    //
    // marginPx 12 -> 24 was tried and REVERTED. 24 let a 1-tile-wide oriented
    // pit's field reach past the neighbour lane's centerline: the field's
    // short-axis half-width is `16 + marginPx`, and the neighbouring tile's
    // centre sits exactly 32px away, so ANY margin >= 16 puts a Firepit's
    // field into the ADJACENT column/row it does not occupy — not just the
    // pit's own lane. `firepit.test.js`'s "a vertical Firepit heats the tile
    // BELOW its anchor" test exists to guard exactly this, and caught it.
    // 15 is the largest integer margin that keeps the neighbour's centreline
    // strictly outside the field (tickArea's bound check is `x > r.x1`
    // inclusive at x1, so margin=16 already reaches it).
    FIRE_SPECIAL:  { aoe: true, dps: 15, marginPx: 15, burn: { dps: 9, ms: 4000 } },
    // WATER GEYSER (redesign §5.3, Task 11) — the DISPLACEMENT family:
    // footprint-only selection (nearest to center, tie by stable ID), medium
    // damage, then a long weight-scaled launch in the structure's locked
    // `dir`. displace.power is deliberately well above
    // structureBehaviors/displacement.js's ASSUMED_VORTEX_RELEASE_POWER — the
    // spec (§5.3) requires Geyser's release to substantially exceed Wind
    // Vortex's at equal weight.
    WATER_SPECIAL: {
      displace: { power: 480 },
      damage: 6, cooldownMs: 2500,
    },
    // WIND VORTEX (redesign §5.4, Task 12) — the TIMED PHASE MACHINE family:
    // no target search, no cooldown gate, no damage. A repeating SUCTION
    // phase of fixed pulses (never per-tick force) gathers eligible enemies
    // toward center; RELEASE then ejects the whole gathered group once, in
    // the structure's locked `dir`, before the next SUCTION begins.
    // releasePower is kept strictly below displacement.js's
    // ASSUMED_VORTEX_RELEASE_POWER (220) — Water Geyser's launch must
    // substantially exceed it (spec §5.3; see waterGeyser.test.js). pulseMs
    // (200) is well short of KB_DECAY_PER_TICK's ~12-tick half-life at 60Hz,
    // so successive pulses on the same enemy mostly re-add onto an
    // already-decaying push rather than stacking unboundedly — the
    // MAX_KB_VELOCITY cap in enemyMove.js is the hard backstop regardless.
    // First-pass magnitudes, flagged for the Phase 8 sweep like the rest of
    // this table.
    WIND_SPECIAL: {
      cycle: {
        suctionMs: 1400, pulseMs: 200, suctionPower: 90,
        releaseMs: 400, releasePower: 200, immunityMs: 900,
      },
      radiusPx: 150,
    },
    // MAGMA_TRAP / display "Volcano" (redesign §6.2, Amendment A1.5, Task 14)
    // — the ENTRY-COUNT TRIGGER family: passive crossing burn across the
    // whole 2x2 footprint, dps kept below Firepit's 9 (§7: "Firepit passive
    // output exceeds Volcano passive output; Volcano earns its power through
    // eruption"). Three outside-to-inside transitions bank one eruption — a
    // much larger, much harder radial hit with strong lingering burn — then
    // a medium recharge during which crossings still burn but bank no
    // further pressure. eruption.radiusPx is deliberately larger than Steam
    // Vent's (still pre-redesign) 100px rangePx, matching the spec's
    // "explicitly larger than Steam Vent's cloud". First-pass magnitudes,
    // flagged for the Phase 8 sweep like everything else here.
    // REVERTED 2026-08-04 to the spec-original burn 6/2500 and eruption
    // 50 dmg / 14 dps / 140px. The 2026-08-02 buff (15/3000, 75/30/160) was
    // chosen from a "worth approximately nothing" reading now known to be an
    // instrument artifact -- see docs/reviews/2026-08-04-fusion-siting-
    // confound-diagnosis.md. It also broke this block's own §7 invariant:
    // passive burn 15 exceeded Firepit's 9, when the spec requires Firepit's
    // passive output to exceed Volcano's. 6 restores it.
    // ERUPTION CADENCE RETUNE, 2026-08-27. chargeThreshold 3 -> 1 and
    // eruption.cooldownMs 6000 -> 1500. Measured, exploratory (unregistered
    // family), corpora and full reasoning in
    // docs/reviews/2026-08-27-volcano-cadence-probe.md.
    //
    // The defect: fused Volcano was WORSE than the two structures it eats
    // (-0.216 hallHpAuc vs an unfused Rock Trap + Firepit on maze B, t -8.2),
    // so building the fusion was a mistake there. It is now +0.246 (t 10.4) on
    // maze B and +0.288 (t 12.1) on maze A -- positive on both, and the two
    // mazes agree to within 0.04, so the fusion stops being maze-situational.
    //
    // BOTH dials are load-bearing and neither works alone: at cooldown 750 with
    // the threshold still 3 maze B is -0.052, i.e. a fast recharge buys nothing
    // while the eruption still waits for three separate crossings. A first
    // attempt instead gave Volcano a continuous Firepit-grade field, which was
    // measured and REJECTED: the field alone moved maze B only -0.216 -> -0.151
    // while the cadence alone did the whole job. That attempt also broke the §7
    // invariant three comments above; dropping it restores that invariant, and
    // Volcano needs no `aoe` field, so towers.js keeps its one-behaviour-per-
    // structure dispatch.
    //
    // 1300 rather than 1500 or 750, and the reason is a CLIFF. The maze-B gain
    // per ms shaved is wildly uneven: 2250->1500 buys +0.147 over 750ms,
    // 1500->1300 buys +0.135 over just 200ms, 1300->1000 buys +0.058, and
    // 1000->750 buys nothing (-0.005). Something in the arrival cadence lands
    // right there -- at 1500 the eruption misses a group that 1300 catches.
    // 1500 therefore sat on the edge of that cliff, which is the fragile place
    // to sit: a later nudge to enemy speed or spawn pacing would swing its value
    // hard. 1300 is past the steep part and costs maze A nothing (+0.291 vs
    // +0.288, t 0.8 -- indistinguishable). The price is that maze B (+0.381)
    // pulls ahead of maze A again, a 0.090 gap vs 0.042 at 1500; still far
    // inside the 0.313 gap the original design had.
    MAGMA_TRAP: {
      entryTrigger: true,
      burn: { dps: 6, ms: 2500 },
      chargeThreshold: 1,
      eruption: { damage: 50, burn: { dps: 14, ms: 5000 }, radiusPx: 140, cooldownMs: 1300 },
    },
    // FIRESTORM (redesign §6.3, Amendment C.1, Task 14) — the RADIAL VOLLEY
    // family: one authoritative AoE resolution per activation against every
    // enemy within rangePx of center, once, on a medium-fast cadence. Same
    // damage/burn/cooldown magnitudes as the pre-redesign generic-tower spec
    // this replaces — Task 14 is a mechanic replatform, not a rebalance.
    //
    // 2026-08-04 (projectile conversion, Phase 1): the volley now spawns
    // `volleyBolts` real FIRESTORM_BOLT projectiles on a rotating fan instead
    // of resolving an instantaneous radius scan — bolts can MISS. cooldownMs,
    // burn and rangePx are UNCHANGED so the measurement isolates "missable +
    // variance" from "weaker" (spec §4). `damage` is the one exception,
    // per spec §4f.4: the mechanism swap alone dropped maze-B bodies/volley
    // (volleyProbe.mjs, isolated protocol) from 1.778/1.640 (flank/funnel) to
    // 0.966/1.089 — a ~40% output cut, outside the ~15% parity band — so
    // damage was recalibrated 8 -> 13 using damage_new = damage_old *
    // (hits_old / hits_new) averaged over the two maze-B sitings (ratio
    // 1.664). That brings both maze-B cells back inside the band (flank
    // -11.7%, funnel +7.9%). Maze A's bodies/volley moved further off (it was
    // never the calibration target — maze A carries no score effect under
    // either mechanism, only maze B does) and was not used to fit this value.
    //
    // 2026-08-04 (projectile conversion, Phase 2, spec §5) — the deliberate
    // nerf, applied on top of the Phase-1 output-parity baseline: cooldownMs
    // 700->900 ("slower refresh") and rangePx 100->88 ("shorter range", a
    // mild trim per spec §1a rather than the 150-225 a naive reading of
    // "half/75% of a Fireball" would give — Firestorm's rangePx was already
    // a third of Fireball's maxRangePx). rangePx here MUST track
    // PROJECTILE.FIRESTORM_BOLT.maxRangePx below — it gates tickVolley's
    // in-range check, and if the two diverge the tower fires at enemies its
    // own bolts can never physically reach. aoeRadiusPx (miss chance) moved
    // alongside on the FIRESTORM_BOLT entry. damage is untouched per spec
    // §5's table — only dropped if the three geometry/cadence levers above
    // are not enough, which is measured, not assumed, in the Phase 2 review.
    // 2026-08-28 fusion-worth retune: cooldownMs 900->450 and damage 13->26,
    // taking it from -0.068 / +0.155 against its two ingredients to +0.009 /
    // +0.321. Chosen over a 4x rate (225ms) which scored the same on maze A and
    // slightly worse on B while doubling the projectile load for nothing.
    FIRESTORM:     { volley: true, rangePx: 88, damage: 26, cooldownMs: 450, burn: { dps: 10, ms: 4000 },
                     volleyBolts: 8, boltType: 'FIRESTORM_BOLT' },
    // MUDDY BOG (redesign §6.4, Amendment A2.2, Task 15) — the PERSISTENT AREA
    // STATUS family (structureBehaviors/areaEntry.js): one root cycle per
    // crossing, weight-scaled duration (light/medium/heavy/super-heavy,
    // indexed by enemyTypes.WEIGHT), fixed damage pulses while an enemy
    // stands in the footprint (2026-08-28 decouple: gated on presence, NOT on
    // whether this Bog owns the enemy's root), lingering slow on natural root
    // expiry. Same per-pulse cadence as the pre-redesign generic-tower spec
    // this replaces — Task 15 is a mechanic replatform, not a rebalance.
    // First-pass root-duration magnitudes, flagged for the Phase 8 sweep like
    // everything else here.
    // REVERTED 2026-08-04 to the spec-original root durations and pulse
    // damage 3. The 2026-08-02 buff (root +30%, pulse 3->8) was chosen from
    // the same contaminated maze-A fusion readings as the hp change above --
    // see docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md.
    //
    // ONE finding from the 2026-08-04 pass was mechanical rather than
    // score-derived: pulse damage 12 exactly one-shot a full-HP Goblin (hp 12)
    // on the first pulse, which fired immediately on entry -- root/slow WERE
    // still applied that same tick (applyRoot ran before the pulse), but the
    // goblin died before the player could observe the CC doing anything -- and
    // the note at the time said any future candidate should stay under 12 for
    // that reason. The 2026-08-28 decouple below (see MUDDY_BOG entry)
    // overrides that note deliberately, not silently: it no longer holds,
    // because it was reasoning about the symptom (a goblin dying too fast to
    // see the mechanic) rather than the cause (damage was gated on root
    // ownership, so a low number was the only lever available). The cause is
    // gone but the symptom is WORSE: a goblin now dies to the first pulse at
    // ANY pulse.damage >= 12, decoupled from root or not, and 28 was the
    // smallest measured value that actually clears the roster-worth bar (see
    // MUDDY_BOG's own comment). Overriding a documented "stay under 12" note
    // without human playtest is a real risk, flagged and not hidden -- see
    // docs/reviews/2026-08-28-muddy-bog-decouple.md.
    MUDDY_BOG: {
      areaEntry: true,
      // 2026-08-28 mechanic decouple + retune (docs/handoffs/2026-08-28-muddy-bog-decouple.md,
      // docs/reviews/2026-08-28-muddy-bog-decouple.md, independently reviewed).
      // The 2026-08-28 roster-worth retune (pulse damage 3->12) still measured
      // -0.147 (t -5.3) on maze B against the two structures Bog consumes,
      // because damage was gated on THIS structure's own root ownership: with
      // root disabled the bog dealt literally zero damage (measured: 3000
      // cells bit-identical at damage 3 and 12 when root was 0), so total
      // damage was root uptime x tick damage, and both factors saturated.
      //
      // Fix: areaEntry.js now gates damage on FOOTPRINT PRESENCE, not root
      // ownership -- root is pure crowd control, and an elite Goblin (root-
      // immune) or an enemy rooted by a DIFFERENT source now takes this Bog's
      // damage too, which it never did before. BUT the follow-up review found
      // this mechanism fix contributed close to nothing to the headline
      // number in the tested range: a control sweep at pulse.damage 28 under
      // the OLD root-gated code (3000 runs, same seeds) measured maze A +0.115
      // (t 5.79) / maze B +0.201 (t 8.01) -- statistically indistinguishable
      // from the NEW decoupled code's own +0.123/+0.201. The number that
      // actually cleared the bar was raising the damage, not decoupling it;
      // decoupling is kept anyway because it fixes a real edge case (root=0 ->
      // literally zero damage, independent of how rarely that edge is hit at
      // damage 28) and because the cross-source/root-immune behaviour is
      // intended design, not a side effect to route around.
      //
      // The dial itself: paired contrast (fused minus bog-unfused, 750 seeds x
      // 2 mazes x 2 postGaps, hallHpAuc) does NOT hold flat from 12 to 26 --
      // it oscillates within about +-0.11 on maze B the whole way (e.g. 8->12
      // +0.114 t4.6, 12->16 -0.108 t-4.5, 16->20 +0.128 t5.4, all resolvable at
      // n=1500), never clearing the OLD -0.147 bar with real margin anywhere
      // in that range, and then jumps sharply between 26 (-0.013, t -0.52) and
      // 27 (+0.203, t 8.08) -- a genuine discrete threshold in the raw means
      // (7.302 -> 7.518), replicated across disjoint seed halves (t 7.36 /
      // 9.27), not sampling noise. 28 is one step past that threshold. It is
      // ALSO not uniform across the scenario grid: the maze-B win is almost
      // entirely postGap 1 (+0.350, t 9.15); postGap 0 alone is a non-
      // significant +0.053 (t 1.66), and at damage 26 postGap 0 is actively
      // negative (t -2.68). "Building Bog is no longer a mistake on maze B" is
      // therefore true on average but not uniformly true across every gate.
      // Full arm sweep (damage 1-32, 16 arms, 48000 runs) in
      // test/harness/store/2026-08-28-bog-decouple-retune.jsonl; the old-gate
      // control check in test/harness/store/2026-08-28-bog-oldgate-dmg28-check.jsonl.
      //
      // pulse.damage 28 is well past the "one-shots a full-HP Goblin" line
      // (hp 12) that the 2026-08-04 note above flagged as a feel concern, and
      // it now ALSO one-shots even root-immune elites via the same footprint
      // gate. This still needs a human playtest before anyone trusts the feel
      // of it -- no simulated match can judge that.
      // marginPx: 0 -- the footprint is the bare 2x2 with no halo, unlike
      // Firepit's marginPx:15 or Steam Vent's cloudMarginPx:15 (both above).
      // Kept at 0 pending a registered sweep (fusion-r3-muddy-bog, 2026-08-30);
      // see towers.js's areaRect call site for the mechanism this now uses.
      marginPx: 0,
      root: { msByWeight: [600, 1200, 1800, 2400] },
      pulse: { damage: 28, ms: 500 },
      lingerSlow: { factor: 0.7, ms: 2000 },
    },
    // BLIZZARD (redesign §6.5, Amendment C.3, Task 14) — joins the
    // TARGET-IMPACT family (structureBehaviors/targetImpact.js) with
    // densest-cluster selection and a uniform (no primary/splash split)
    // impact: every enemy within clusterRadiusPx of the locked point takes
    // the same damage and a short freeze. rangePx (acquisition) is larger
    // than Rock Trap's 140px (spec: "larger circular acquisition area than
    // Rock Trap"). damage is deliberately conservative (§8: "automatic
    // dense-cluster targeting and freeze already provide large value").
    // First-pass magnitudes, flagged for the Phase 8 sweep like everything
    // else here.
    // damage REVERTED 2026-08-04 to the spec-original 12. The 2026-08-02
    // 12 -> 18 buff was the "damage, not hp" half of a retune whose evidence
    // was the maze-A siting artifact -- see docs/reviews/2026-08-04-fusion-
    // siting-confound-diagnosis.md. Philip's ruling that Blizzard is a burst
    // weapon rather than a wall still stands and still makes damage the right
    // lever; only the magnitude is un-derived, and it is re-derived from the
    // clean sweep rather than carried forward.
    BLIZZARD: {
      targetImpact: true, select: 'denseCluster', resolve: 'uniform',
      // 2026-08-28 fusion-worth retune: rangePx 180->250 and damage 12->48.
      // Was -0.219 / +0.300 against its two ingredients; now -0.064 / +0.801,
      // i.e. no longer resolvably harmful on maze A and strongly positive on B.
      // Its freeze was tested for being the culprit and is NOT: removing it cut
      // maze B from +0.300 to +0.185 while barely helping A. Firing FASTER also
      // made maze A worse (-0.332 at half cooldown), so the cooldown is left alone.
      rangePx: 250, clusterRadiusPx: 70, telegraphMs: 400,
      damage: 48, freeze: { ms: 1200 }, cooldownMs: 5000,
    },
    // STEAM VENT (redesign §6.1, Amendment A2.2, Task 16) — the other half of
    // the PERSISTENT AREA STATUS family alongside Muddy Bog
    // (structureBehaviors/confusion.js): a ~3x3 steam cloud around the 2x2
    // footprint that scalds on a fixed cadence and keeps refreshing a short,
    // episode-bounded confusion. cloudMarginPx 16 is exactly half a tile, which
    // turns the 2x2 (64px) footprint into a 96px square = 3x3 tiles.
    //
    // Same per-pulse damage and cadence as the pre-redesign generic-tower spec
    // this replaces (damage 4 / 500ms) — Task 16 is a mechanic replatform, not
    // a rebalance. The old spec's `slow` is GONE: confusion is what the vent
    // applies now, and stacking a slow on top would have been a silent buff.
    // First-pass confusion magnitudes, flagged for the Phase 8 sweep like
    // everything else here.
    // hp and pulse damage REVERTED 2026-08-04 to spec-original 90 / 4: the
    // 2026-08-02 buffs to both were chosen from the maze-A siting artifact
    // (docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md).
    //
    // cloudMarginPx 16 -> 15 is KEPT. It is not a balance choice at all — it
    // is a spillover BUG FIX with a purely geometric justification that has
    // nothing to do with any score reading:
    // "Maximize the aura" per areaRect's geometry
    // (towers.js): footprint edge sits exactly 16px short of the NEXT tile's
    // center regardless of footprint width (32px tile pitch, tile centers
    // 16px in from their own edges) -- so margin >= 16 always reaches into
    // the neighboring column/lane, the same spillover class the Firepit
    // marginPx 24 revert caught (see docs/reviews/2026-08-02-firepit-dps-
    // retune.md §4c). 15 is the largest safe integer, same cap as Firepit's,
    // not a bigger number just because this footprint is 2x2. The prior 16
    // was already 1px past this line.
    // RETUNED 2026-08-15 — confusion is GONE, replaced by a strong slow, and
    // the scald roughly doubles. Ruled by Philip on the decomposition in
    // docs/reviews/2026-08-15-steam-vent-mechanism.md, which measured what each
    // component was actually worth on hallHpAuc at n=900/cell:
    //
    //   given up: the Firepit the fusion consumes   -0.487 (maze B)
    //   gained:   scald                             +0.337
    //   gained:   confusion                         +0.013   <-- inert
    //   net                                         -0.137
    //
    // Confusion was not under-tuned, it was doing NOTHING measurable while
    // being the structure's signature mechanic, and it made structuresLost
    // WORSE (+0.349 vs the no-confusion arm) for no outcome gain. The mechanic
    // is retired rather than re-tuned.
    //
    // WHY SLOW, AND WHY IT IS NOT MUDDY BOG. The slow's job here is SELF-
    // SYNERGY, not generic CC: a slowed enemy dwells longer in the cloud, so
    // the scald lands more pulses on the same target. That is what earns the
    // damage increase. Muddy Bog stays the terrain-denial structure (hard root
    // by weight, chip damage 3); the vent is the damage structure whose status
    // exists to feed its own damage. A1.4(b) forbids either dominating the
    // other, and this is the axis that keeps them apart.
    //
    // MAGNITUDES, sized against the measurement rather than by feel. The
    // structure must clear +0.487 on maze B to beat the single ingredient it
    // eats, and more to clear BOTH (the two-ingredient control, commit 79bba51,
    // measures that for the first time). Scald 4 -> 8 per pulse doubles the
    // component that was already carrying the structure (+0.337), and the slow
    // multiplies dwell time on top. factor 0.5 is the system's strongest
    // (STATUS.SLOW.factor) and is speed-tier resisted like every other slow, so
    // super-fast stays immune. ms 1500 outlasts the 500ms cadence so a target
    // crossing the cloud stays slowed between pulses without lingering long
    // enough to act as a free field-wide snare.
    //
    // These are FIRST-PASS magnitudes for the registered retune sweep, not a
    // shipped balance claim. cloudMarginPx 15 is deliberately UNCHANGED: it is
    // a geometric spillover bug fix (see below), not a balance dial.
    // 2026-08-28 fusion-worth retune. Vent was worth NOTHING against the two
    // structures it eats (+0.007 maze A / -0.052 maze B). pulse 500->250ms and
    // damage 8->16 makes it +0.061 / +0.409. Both levers measured separately
    // first: cadence and damage each worked alone here, and combining them was
    // additive. See docs/reviews/2026-08-28-fusion-roster-worth-retune.md.
    STEAM_VENT: {
      scaldField: true,
      cloudMarginPx: 15,
      pulse: { damage: 16, ms: 250 },
      slow: { factor: 0.5, ms: 1500 },
    },
    // GRINDER (redesign §6.6, Task 15) — the TIMED PHASE MACHINE family
    // alongside Wind Vortex (spec §3 family 3), sharing
    // structureBehaviors/cycle.js. INTAKE runs fixed pull pulses over the
    // OUTER radius; at intake's end one CRUSH resolves high group damage
    // against the smaller INNER zone only, then ejects the survivors in the
    // locked `dir`. Enemies the pull failed to drag inside take nothing —
    // §7's safeguard ("outer pull cannot guarantee inner-zone arrival") is a
    // live property of position-gated crush selection, not a tuning promise.
    //
    // The full cycle (intakeMs + crushMs = 3500) is deliberately among the
    // longest in the table (Vortex's is 1800) per the same §7 safeguard.
    // `damage` is correspondingly high per activation: this replaces a
    // 700ms-cooldown 10-damage machine gun, so a like-for-like replatform
    // would have gutted it. ejectPower sits above Vortex's release (200) and
    // well below Water Geyser's launch (480), which §5.3 requires to stay
    // dominant. First-pass magnitudes, flagged for the Phase 8 sweep like
    // everything else here.
    GRINDER: {
      grind: {
        intakeMs: 2000, pulseMs: 250, pullPower: 110,
        // immunityMs MUST exceed crushMs or the "brief post-release immunity"
        // §6.6 asks for is decorative: the crush phase's own recovery tail
        // already leaves a just-ejected enemy unpulled for crushMs, so an
        // immunity shorter than that expires before the next intake ever
        // starts and can never skip a single pulse. 1800 covers the tail plus
        // the first ~300ms of the following intake.
        crushMs: 1500, ejectPower: 320, immunityMs: 1800,
        // CONTACT DPS (2026-08-29). Continuous, time-scaled damage to
        // anything standing in the INNER zone, in both phases, independent
        // of the crush — see structureBehaviors/cycle.js's doContactDamage
        // header for why this exists. The 2026-08-29 occupancy audit
        // measured the outer pull landing only 11.3% (maze A) / 40.1%
        // (maze B) of what it grabs into the crush zone, so the pull was
        // doing most of its work for nothing; this pays it for dwell time
        // without weakening §7's escapable-crush safeguard.
        //
        // 20 is a FIRST-PASS magnitude, deliberately near Firepit's
        // continuous 15 (the only other always-on damage field in the
        // table) and nudged up because a fusion eats two structures. NOT
        // yet validated against A1.4(a) — measure before trusting it, and
        // note the standing warning above about Grinder numbers being
        // policy-confounded still applies to any sweep taken on it.
        contactDps: 20,
        // TUNED 2026-08-29 from 55 (the inner/crush zone) to 160 (the full
        // suction radius). With root capture in place the radius sweep is
        // monotonic and steep — 55/80/110/160 gives +0.007/+0.043/+0.310/
        // +0.774 hallHpAuc on maze B (t 0.05/0.29/2.27/5.72) and
        // +0.060/+0.020/+0.171/+0.253 on maze A. Before root the same sweep
        // was flat noise, which is the mechanism check: the radius only
        // matters once enemies are held long enough to be inside it.
        // Coherent with the crush staying at innerRadiusPx — the suction
        // field grinds you, the crush is the burst at the core.
        contactRadiusPx: 160,
        // ROOT CAPTURE (2026-08-29). Crossing into the SUCTION radius roots
        // the enemy for this long, in addition to the pull — see cycle.js's
        // doRootCapture header. This is the dwell-time fix the contactDps
        // dose ladder called for: root zeroes locomotion but not knockback,
        // so a rooted enemy stops walking out while the pull keeps dragging
        // it in, which is the only way contact damage gets time to matter.
        // Released at the eject, so "held, then spat out" holds literally.
        // Weight-agnostic and speed-scaled by applyRoot (super-fast enemies
        // are root-immune by construction, same as every other root source).
        //
        // This dial's safety depends on rootRadiusPx below — read both.
        // At the SUCTION EDGE (the first cut, rootRadiusPx 160) root without
        // contact damage measured resolvably HARMFUL: -0.262 (t 2.83) maze A,
        // and worse than base on maze B, because a frozen enemy is parked
        // wherever it was caught and the pull (110) is weaker than walking,
        // so it never arrives. Moving the root to the CORE removed that
        // failure entirely — root alone now reads -0.045 (t 0.56) maze A and
        // +0.601 (t 3.79) maze B, i.e. neutral-to-positive on its own, and
        // the two dials are roughly additive rather than co-dependent.
        // See docs/reviews/2026-08-29-grinder-root-position.md.
        //
        // 2000 is the REQUESTED value (Philip, "2 sec"), never swept. A
        // registered sweep on it is the obvious next measurement.
        rootMs: 2000,
        // WHERE the root lands. 55 == innerRadiusPx, i.e. the crush zone:
        // enemies stay walkable while the suction draws them in and only lock
        // down once they have ARRIVED at the core — "sucked to the centre,
        // held there, then spat out". Swept 2026-08-29
        // (docs/reviews/2026-08-29-grinder-root-position.md):
        //
        //   rootRadius   maze A            maze B            pullLanding A/B
        //   55  (core)   +0.201 (t 1.73)   +0.786 (t 5.22)   11.0% / 43.8%
        //   80           +0.164 (t 1.38)   +1.090 (t 7.15)    9.3% / 42.6%
        //   110          +0.163 (t 1.37)   +1.207 (t 7.79)    6.0% / 40.9%
        //   160 (edge)   -0.009 (t 0.06)   +1.182 (t 7.76)    7.1% / 37.2%
        //
        // The mazes DISAGREE about the optimum and that is not noise: maze A
        // wants the root tight, maze B wants it wide. 55 is chosen anyway,
        // for three reasons that outrank maze B's larger number: it is the
        // only setting resolvably positive on BOTH mazes, it roughly HALVES
        // the maze split (0.585 vs 1.19 at the edge) so the structure is far
        // less maze-situational, and it maximises the pull-landing rate on
        // both mazes — the mechanism doing what it says on the tin.
        // The cost is ~0.4 hallHpAuc of maze-B upside, deliberately given up.
        rootRadiusPx: 55,
      },
      // damage REVERTED 2026-08-04 to the spec-original 45, with hp (above)
      // back to 90. The 2026-08-02 60/160 pairing was chasing a "flat"
      // reading taken through the contaminated maze-A instrument -- see
      // docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md.
      //
      // Grinder additionally has a SECOND, unrelated problem the clean sweep
      // will not fix: the redesign spec itself names it policy-confounded
      // (the scripted human never repositions to catch a pull-and-crush
      // cycle), so a sub-1.0 Grinder number measures the policy, not the
      // structure. Do not tune Grinder off the re-taken sweep either.
      outerRadiusPx: 160, innerRadiusPx: 55, damage: 45,
    },
  },

  // ——— Phase 4: player characters & elements ———————————————————————————————
  // First-pass magnitudes, all flagged for the Phase 8 sweep.

  // Player entity (spec §2 base kits + §4 death & revive). SPEED_PX is indexed
  // by the element's SPEED tier (same tier convention as enemies — Wind is
  // still the sole class that can outrun every enemy, but narrowly post the
  // 2026-07-19 speed retune; see the spec amendment).
  PLAYER: {
    // Per-class HP (2026-07-19 amendment: classes were previously
    // stat-identical, contradicting their weight/speed identity). Earth =
    // tank, Wind = glass-cannon, Fire/Water between.
    CLASS: {
      EARTH: { maxHp: 140 },
      WATER: { maxHp: 100 },
      FIRE:  { maxHp: 80  },
      WIND:  { maxHp: 70  },
    },
    SPEED_PX: [70, 90, 100, 130],   // indexed by SPEED tier
    // Class-specific basic attacks (Character Class Attack Redesign spec §3,
    // approved as initial test baselines by Amendment A/A9 — not final
    // balance, Phase 8H evidence decides that). Earth/Water/Fire resolve
    // instantly server-side (Amendment A, A6); range is edge-distance
    // (attacker radius + target radius), universally (A7). WIND's fan-blade
    // projectile (Task 5, Amendment A1-A3): 125 ms wind-up (cooldown consumed
    // at wind-up start, cancelled only by down/death — A2), then a FAN_BLADE
    // projectile spawns using PROJECTILE.FAN_BLADE's flight constants below.
    // damage/cooldownMs here are the basic's own numbers (spec §3.4); flight
    // lives in PROJECTILE, same split as Fireball.
    BASIC: {
      EARTH: { damage: 8,  cooldownMs: 750, rangePx: 34, coneDeg: 90, maxTargets: 3 },
      WATER: { damage: 10, cooldownMs: 500, rangePx: 34 },
      FIRE:  { damage: 12, cooldownMs: 700, rangePx: 65 },
      WIND:  { damage: 11, cooldownMs: 500, windUpMs: 125 },
    },
    // Down → revive → death → respawn (spec §4 "Death & revive").
    BLEED_OUT_MS:      15_000,  // downed window before full death
    REVIVE_CHANNEL_MS:  3_000,  // teammate adjacent-channel to revive
    REVIVE_RANGE_PX:       48,  // "adjacent": edge-ish distance for the channel
    REVIVE_HP_FRACTION:   0.4,  // partial HP on revive
    RESPAWN_BASE_MS:   20_000,  // hall respawn timer at wave 1...
    RESPAWN_PER_WAVE_MS: 1_000, // ...scaling longer per wave beyond the first
  },

  // Projectile flight params (server/game/projectiles.js). Velocity-based,
  // per-tick step clamped below one tile (same tunneling-safety discipline as
  // enemyMove knockback). Ability damage lives in ABILITY; flight lives here.
  PROJECTILE: {
    // 2026-07-31 retune (Amendment: Fireball retune, program-plan Task 5):
    // range 380->300 alongside the cooldown/damage/burn cuts in ABILITY.FIRE
    // below — explosion radius (aoeRadiusPx) is explicitly UNCHANGED so
    // Fireball keeps its group-hit identity.
    FIREBALL: { speedPx: 420, maxRangePx: 300, hitRadiusPx: 12, aoeRadiusPx: 44 },
    // Wind's fan-blade (A3): single-target, no pierce (aoeRadiusPx: 0 — see
    // projectiles.js detonate, which branches to a single-hit path instead of
    // the AoE radius scan when aoeRadiusPx is 0). lifetimeMs is a FAILSAFE
    // only per A3 — maxRangePx (100px) terminates first in every normal case.
    FAN_BLADE: { speedPx: 500, maxRangePx: 100, hitRadiusPx: 8, aoeRadiusPx: 0, lifetimeMs: 400 },
    // Firestorm's bolt (2026-08-04 projectile conversion). The SMALL AoE is
    // the knob that makes a bolt missable: at Fireball's 44px the eight
    // detonation points around the 100px rim overlap and cover it completely,
    // which would reproduce the un-missable instantaneous scan it replaces.
    // maxRangePx matches TOWER.FIRESTORM.rangePx (footprint unchanged).
    //
    // Phase 2 (spec §5): maxRangePx 100->88 tracking TOWER.FIRESTORM.rangePx
    // (see that entry's comment — the two must move together or the tower
    // fires at range its own bolts can't reach) and aoeRadiusPx 16->12,
    // raising the miss chance further per "AoE reduced on impact".
    FIRESTORM_BOLT: { speedPx: 420, maxRangePx: 88, hitRadiusPx: 8, aoeRadiusPx: 12 },
  },

  // Element ability kits (spec §2 base kits + the Phase-4 L4 second abilities;
  // L4 specifics are a Phase-4 design decision recorded in the spec amendment).
  // Displacement (knockback/pull) is weight-scaled via applyKnockback; slow/
  // root/freeze are speed-scaled via status.js. FF flag gates teammate effects.
  // 2026-07-19 amendment: Ground Slam gains a modest weight-scaled shove
  // (Earth's kit previously had zero displacement); Fireball nerfed (Fire was
  // strictly dominant); Water/Wind swap verbs — Whirlpool (was Wind's pull,
  // renamed onto Water) and Wind Blast (was Water's cone push, now a broader
  // radial on Wind). `ffShove` is FF-teammate-only displacement for abilities
  // with no enemy-facing knockback/pull (Fissure, Fireball, Flame Nova) —
  // FF no longer damages teammates at all, only displaces (see PLAYER note).
  ABILITY: {
    EARTH: {
      SPECIAL: { name: 'GROUND_SLAM', cooldownMs: 5000, radiusPx: 90, damage: 16,
                 knockback: { power: 150 } },
      SECOND:  { name: 'FISSURE', cooldownMs: 8000, rangePx: 180, widthPx: 44, damage: 20,
                 root: { ms: 1500 }, ffShove: { power: 190 } },
    },
    FIRE: {
      // 2026-07-31 retune (program-plan Task 5): cooldown 3500->5000,
      // damage 16->12, burn 6dps->5dps (duration unchanged) — Fire was
      // dominant on every axis (movement, range, frequency, damage, AoE,
      // burn) simultaneously; see the retune's rationale in the spec's
      // "Approved Fireball retune" section. Explosion radius stays 44px
      // (PROJECTILE.FIREBALL.aoeRadiusPx, unchanged).
      SPECIAL: { name: 'FIREBALL', cooldownMs: 5000, damage: 12,
                 burn: { dps: 5, ms: 2500 }, ffShove: { power: 70 } },
      SECOND:  { name: 'FLAME_NOVA', cooldownMs: 9000, radiusPx: 130, damage: 26,
                 burn: { dps: 10, ms: 3000 }, ffShove: { power: 90 } },
    },
    WATER: {
      SPECIAL: { name: 'WHIRLPOOL', cooldownMs: 4500, radiusPx: 120,
                 damage: 12, pull: { power: 340 } },
      SECOND:  { name: 'TIDAL_WAVE', cooldownMs: 9000, rangePx: 170, halfAngleRad: 0.6,
                 damage: 10, knockback: { power: 500 }, wet: { ms: 4000 } },
    },
    WIND: {
      SPECIAL: { name: 'WIND_BLAST', cooldownMs: 5000, radiusPx: 150,
                 damage: 12, knockback: { power: 400 } },
      SECOND:  { name: 'GALE_DASH', cooldownMs: 7000, dashPx: 150, damage: 14,
                 hitRadiusPx: 40 },
    },
  },

  // Synchronized leveling (spec §2 ladder, slice-1 scope L1-L4). Milestone
  // waves live on the WAVES beat sheet (`level` fields — 1/3/6/8). L3 boosts
  // special damage AND radius/range; L4 unlocks the SECOND abilities; L2
  // unlocks the diagonal combos (STEAM_VENT, GRINDER).
  LEVELING: {
    L3_SPECIAL_BOOST: 1.3,
    // 2026-07-19 amendment (post-CP3 C2): the basic attack scales with team
    // level too, indexed [teamLevel-1], so leveling milestones are a felt
    // combat power spike and not just a specials-only boost that arrives too
    // late to matter (L3's special-only boost was ~+8% of total player
    // output). Renamed from MELEE_LEVEL_MULT (Amendment A, A10) — pure
    // rename, values unchanged, so class identities stay stable.
    BASIC_LEVEL_MULT: [1.0, 1.15, 1.35, 1.6],
  },

  // AI teammate bots (Phase 6). Combat-only slot-fillers reusing ez-ctf's
  // player-bot FSM shape with a new melee approach/positioning layer. All
  // magnitudes are first-pass, flagged for the Phase 8 sweep. Bots hold a
  // defensive line a few tiles in front of the hall (the enemy funnel always
  // converges on the hall) and engage what enters; ENGAGE_LEASH_PX caps how
  // far they stray from that anchor, which is also what stops a beelining
  // melee bot from jamming itself against a far maze wall (the Phase-4-flagged
  // chase-into-obstacle failure mode, in player form).
  BOT: {
    ENGAGE_RANGE_PX:  520,   // enemies within this of the bot are engage candidates
    ENGAGE_LEASH_PX:  300,   // max advance from the hold anchor while engaging
    HOLD_FORWARD_TILES: 3,   // anchor this many tiles toward the gates from the hall-front spawn
    ARRIVE_PX:          8,   // WASD deadband; also the "arrived at anchor" radius
    RETREAT_HP_FRACTION:       0.25,  // squishy drops to Retreat below this HP fraction...
    RETREAT_UNTIL_HP_FRACTION: 0.50,  // ...and stays retreating until it recovers past this (hysteresis)
    REVIVE_SEEK_RANGE_PX: 360,  // will leave the line to revive a downed mate within this
    // Per-class temperament AND preferred basic-attack distance (Task 6,
    // staged combat redesign program — replaces the old universal
    // CONTACT_PX/KITE_BACKOFF_PX pair, which closed every class to the same
    // 30px melee contact regardless of its actual reach). `holdRangePx` is
    // both the distance a bot closes to before it stops advancing AND the
    // gate on pressing basic at all — center-distance heuristic, same style
    // as SPECIAL_CAST_PX/SECOND_CAST_PX below, not the server's exact edge-
    // distance reach check, so it stays conservative (never fires beyond the
    // real range). Earth/Water close to melee contact (their basic's
    // rangePx is 34); Fire holds near its own basic's 65px reach instead of
    // overshooting into contact; Wind holds/kites near its fan-blade's
    // 100px maxRangePx (PROJECTILE.FAN_BLADE). Tanks (Earth/Water) never
    // back off; squishies (Fire/Wind) retreat when low and step off between
    // swings while inside their own band (kites).
    CLASS: {
      EARTH: { retreats: false, kites: false, holdRangePx:  30 },
      WATER: { retreats: false, kites: false, holdRangePx:  30 },
      FIRE:  { retreats: true,  kites: true,  holdRangePx:  65 },
      WIND:  { retreats: true,  kites: true,  holdRangePx: 100 },
    },
    // Cast when the nearest enemy is within this of the bot. Radial specials
    // ≈ their AoE radius; FIREBALL is a forward projectile so it reaches well
    // past its blast. SECOND ranges ≈ each ability's own reach.
    SPECIAL_CAST_PX: { EARTH: 90,  FIRE: 320, WATER: 120, WIND: 150 },
    SECOND_CAST_PX:  { EARTH: 180, FIRE: 130, WATER: 170, WIND: 150 },
  },

  // Task 2 — named simulation safety budgets (staged combat redesign program,
  // Task 2). Frozen headroom figures, not enforced caps: nothing in the sim
  // reads these yet (that is later runtime work). Their purpose is to give
  // later tasks a named number to consume instead of inventing a new magic
  // constant, and to give the budget tests in simulationBudgets.test.js a
  // fixed target so a future regression that blows past the assumed regime
  // (enemy cap 256, realistic wave-10 peak ~78, single-digit structures per
  // match) is caught rather than silently absorbed.
  LIMITS: {
    MAX_STRUCTURE_EFFECTS: 64,   // concurrent enemy-carried statuses attributable to a structure
    MAX_PROJECTILES: 64,         // concurrent in-flight projectiles across the match
    MAX_FX_PER_TYPE_PER_TICK: 8, // must match server/net/encode.js's FX_CAP_PER_TYPE
  },
}
