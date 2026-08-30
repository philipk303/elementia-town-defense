// Authoritative game-state factory. Phase 1 carries the phase-machine fields,
// the town hall, the 4 element players, and the (empty) enemy/structure/fx
// collections the packed encoder reads. Enemies (Phase 3), structures (Phase 2),
// and player movement/abilities (Phase 4) fill these in later.

import { mulberry32 } from '../../shared/rng.js'
import { CONFIG } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { PHASES } from './phaseMachine.js'
import { TILE_SIZE } from './grid.js'
import { CostField } from './costField.js'
import { EnemyStore } from './enemies.js'
import { resolveGateOrder } from './waves.js'
import { ELEMENT_KIT } from './elementKits.js'
import { seedStartingEconomy } from './economy.js'

const hallCenterX = (CONFIG.HALL.gx + CONFIG.HALL.w / 2) * TILE_SIZE  // 640
const hallTopY    = CONFIG.HALL.gy * TILE_SIZE                        // 672

// Player entity (Phase 4). `alive` is the aggro/targeting predicate the enemy
// sim reads — true only while life === 'up' (downed/dead players can't be
// chased or hit). Weight/speed tiers come from the element kit and reuse the
// enemy tier scales (FF displacement scales by weight; movement by speed).
function makePlayer(roomPlayer, index) {
  const kit = ELEMENT_KIT[roomPlayer.element]
  const cls = BALANCE.PLAYER.CLASS[roomPlayer.element]
  return {
    id:          roomPlayer.id,
    element:     roomPlayer.element,
    displayName: roomPlayer.displayName,
    isBot:       roomPlayer.isBot,

    // Cluster in front of the hall (also the hall-respawn point).
    x: hallCenterX + (index - 1.5) * TILE_SIZE,
    y: hallTopY - TILE_SIZE * 2,
    spawnX: hallCenterX + (index - 1.5) * TILE_SIZE,
    spawnY: hallTopY - TILE_SIZE * 2,
    flags: 0,

    weight:    kit.weight,
    speed:     kit.speed,
    moveSpeed: BALANCE.PLAYER.SPEED_PX[kit.speed],
    kvx: 0, kvy: 0,          // knockback velocity (velocity-over-ticks, decays)
    aimX: 1, aimY: 0,        // last aim unit vector from input

    hp: cls.maxHp, maxHp: cls.maxHp,
    alive: true,
    life: 'up',              // 'up' | 'down' | 'dead'
    downUntil: 0,            // bleed-out deadline while down
    reviveMs: 0,             // accumulated adjacent-channel progress while down
    respawnAt: 0,            // hall-respawn time while dead
    basicReadyAt: 0, specialReadyAt: 0, secondReadyAt: 0,

    ready: false,   // build-phase ready-up (timing styles)

    // Economy (Phase 5): personal wallet, humans only (bots never earn/spend
    // — economy.js guards every mutation on !isBot). usedFreeSpecial gates
    // the one free own-element special grant at wave 1's build phase.
    gold: 0,
    usedFreeSpecial: false,
  }
}

export function createGameState(room, seed = Date.now()) {
  const players = room.players.map(makePlayer)

  const costField = new CostField()
  costField.setHall(CONFIG.HALL.gx, CONFIG.HALL.gy)

  const rng = mulberry32(seed)
  // Which physical side gate is SIDE_A (opens wave 4) vs SIDE_B (wave 7),
  // randomized once per run (spec §4). One draw off the seeded stream.
  const gateOrder = resolveGateOrder(rng)

  const state = {
    seed,
    rng,
    gateOrder,

    tick: 0,

    // Phase machine (see phaseMachine.js). Starts in lobby; the host's
    // REQUEST_START moves it to build wave 1.
    phase:            PHASES.LOBBY,
    wave:             0,
    phaseClockMs:     0,
    fightClockMs:     0,
    spawnComplete:    false,
    livingEnemyCount: 0,
    wavePlan:         null,
    lastWaveTally:    null,
    settings: {
      timingStyle:  room.settings.timingStyle,
      friendlyFire: room.settings.friendlyFire,
    },

    // Town hall — loss condition. 2×2 footprint, bottom-center.
    hall: {
      gx: CONFIG.HALL.gx, gy: CONFIG.HALL.gy,
      w:  CONFIG.HALL.w,  h:  CONFIG.HALL.h,
      x:  hallCenterX,    y:  hallTopY + TILE_SIZE,  // footprint center
      hp: BALANCE.HALL_HP, maxHp: BALANCE.HALL_HP,
    },

    players,
    // Synchronized team level (Phase 4). L1 from wave 1; milestones on the
    // WAVES beat sheet bump it in startBuildPhase. pendingLevelUp is the
    // broadcast latch the loop drains into a LEVEL_UP emit.
    teamLevel: 1,
    pendingLevelUp: null,
    // Live projectiles (Phase 4) — small dense array, swap-removed on death.
    projectiles: [],
    nextProjectileId: 0,
    // Enemy horde — SoA store (Phase 3). Spawn schedule is (re)built per fight
    // by tick.js; fightElapsedMs drives the streamed spawns and spawnComplete.
    enemyStore:    new EnemyStore(),
    spawnSchedule: [],
    spawnIndex:    0,
    fightElapsedMs: 0,
    waveBounty:    0,    // per-wave bounty accrual (Phase 5 economy consumes it)
    structures:    [],   // Phase 2
    placedVersion: 0,    // bumped on structure add/remove; drives static resend
    costField,           // Phase 2: structures push their HP band onto this
    fx:            [],   // transient per-tick cues (reset each tick)
    atkFx:         [],   // transient per-tick attack presentation events (Task 7)

    // Encode broadcast tracking (CP0 M1 decision): one broadcast encode per
    // emit against this pv; statics ride only when placedVersion changed.
    lastBroadcastPv: -1,

    endPayload: null,
  }

  // Phase 5: pre-built starting town (2 Farms + 1 Marketplace) + starting
  // gold for humans + auto-placed specials for bot-controlled elements.
  seedStartingEconomy(state, Date.now())
  return state
}
