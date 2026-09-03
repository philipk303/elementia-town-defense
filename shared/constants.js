// Single source of truth for shared structural game values (events, map
// geometry, room limits, tick/netcode rates). Client and server both import
// from here. Tunable *balance magnitudes* live in shared/balance.js instead
// (per the standing rule: no inline balance constants).
//
// Map tile dimensions are owned by server/game/grid.js (the adopted Phase-0
// foundation) and re-exported here so there is exactly one definition.

export { TILE_SIZE, TILES_W, TILES_H, N_TILES } from '../server/game/grid.js'
import { TILE_SIZE, TILES_W, TILES_H } from '../server/game/grid.js'

export const EVENTS = {
  // Client → Server
  CREATE_ROOM:     'create_room',
  JOIN_ROOM:       'join_room',
  RECONNECT_TOKEN: 'reconnect_token',
  REQUEST_START:   'request_start',
  SET_READY:       'set_ready',       // build-phase ready-up (timing styles)
  PLAYER_INPUT:    'player_input',
  BUILD_STRUCTURE: 'build_structure',
  SELL_STRUCTURE:  'sell_structure',
  RESPOND_FUSION:  'respond_fusion',  // accept/reject a pending fusion proposal
  RESTART_MATCH:   'restart_match',   // menu: wipe the run and re-enter build wave 1, same room
  SELECT_ELEMENT:  'select_element',  // lobby-only: request a specific element slot

  // Server → Client
  ROOM_CREATED:        'room_created',
  ROOM_JOINED:         'room_joined',
  ROOM_ERROR:          'room_error',
  ELEMENT_CHANGED:     'element_changed', // lobby: a player's element slot changed
  PLAYER_JOINED:       'player_joined',
  PLAYER_LEFT:         'player_left',
  PLAYER_DISCONNECTED: 'player_disconnected',
  PLAYER_RECONNECTED:  'player_reconnected',
  HOST_CHANGED:        'host_changed',   // lobby host migration on host leave
  STRUCTURE_REJECTED:  'structure_rejected', // build/sell request the server refused
  FUSION_PROPOSED:     'fusion_proposed',    // a placement created a pending fusion proposal
  FUSION_UPDATED:      'fusion_updated',     // one required player consented, others outstanding
  FUSION_RESOLVED:     'fusion_resolved',    // fused / rejected / expired / stale / cancelled
  GAME_START:          'game_start',   // full initial snapshot on match start
  STATE_UPDATE:        'state_update', // packed delta/full snapshot (20 Hz)
  PHASE_CHANGE:        'phase_change', // lobby→build→fight→waveEnd→won/lost
  LEVEL_UP:            'level_up',     // synchronized team leveling broadcast (Phase 4)
  GAME_END:            'game_end',
}

// Player wire-flag bits (packed into the per-player `flags` field of the
// snapshot — the counterpart of enemyTypes.FLAG for enemies). DOWNED = bleeding
// out on the spot; REVIVING = a teammate's channel is in progress on them;
// DEAD = full death, waiting on the hall respawn timer.
export const PLAYER_FLAG = {
  DOWNED:   1 << 0,
  DEAD:     1 << 1,
  REVIVING: 1 << 2,
}

// The 4 elemental slots. The team is ALWAYS these 4 (bot-filled); slot order is
// the assignment order for joining humans and the render/token order.
export const ELEMENTS = ['EARTH', 'FIRE', 'WATER', 'WIND']

// Structure catalog (spec §3 + §2). Types are structural (fixed for slice 1);
// their cost/hp magnitudes live in shared/balance.js per the standing rule.
export const STRUCTURE_TYPES = {
  BARRICADE: 'BARRICADE', SNARE_POST: 'SNARE_POST', WATCHTOWER: 'WATCHTOWER',
  FARM: 'FARM', MARKETPLACE: 'MARKETPLACE',
  EARTH_SPECIAL: 'EARTH_SPECIAL', FIRE_SPECIAL: 'FIRE_SPECIAL',
  WATER_SPECIAL: 'WATER_SPECIAL', WIND_SPECIAL: 'WIND_SPECIAL',
  MAGMA_TRAP: 'MAGMA_TRAP', FIRESTORM: 'FIRESTORM', MUDDY_BOG: 'MUDDY_BOG',
  BLIZZARD: 'BLIZZARD', STEAM_VENT: 'STEAM_VENT', GRINDER: 'GRINDER',
}

// Special-structure type per element, and the reverse lookup.
export const ELEMENT_SPECIAL_TYPE = {
  EARTH: 'EARTH_SPECIAL', FIRE: 'FIRE_SPECIAL', WATER: 'WATER_SPECIAL', WIND: 'WIND_SPECIAL',
}
export const SPECIAL_TYPE_ELEMENT = Object.fromEntries(
  Object.entries(ELEMENT_SPECIAL_TYPE).map(([el, t]) => [t, el]),
)

// Types a player may directly request via BUILD_STRUCTURE. Excludes HALL
// (pre-placed only) and the 6 combo types (server-resolved from adjacency,
// never built directly).
export const BUILDABLE_TYPES = [
  STRUCTURE_TYPES.BARRICADE, STRUCTURE_TYPES.SNARE_POST, STRUCTURE_TYPES.WATCHTOWER,
  STRUCTURE_TYPES.FARM, STRUCTURE_TYPES.MARKETPLACE,
  STRUCTURE_TYPES.EARTH_SPECIAL, STRUCTURE_TYPES.FIRE_SPECIAL,
  STRUCTURE_TYPES.WATER_SPECIAL, STRUCTURE_TYPES.WIND_SPECIAL,
]

// Placement orientation (combat-structure redesign §2): every individual
// elemental structure's 2x1 footprint may be placed horizontal or vertical.
export const ORIENTATIONS = ['H', 'V']

// Cardinal output direction (combat-structure redesign §2 "Wind Vortex and
// Water Geyser also receive an independently selected cardinal output
// direction... stored as separate structure properties"). Order matches
// server/net/encode.js's STRUCT_DIRECTIONS wire table (append-only ABI).
export const DIRECTIONS = ['N', 'E', 'S', 'W']

// Types that carry a direction alongside orientation. Every other buildable
// type is direction-less; placeStructure rejects a direction supplied for
// them and requires one for these.
//
// GRINDER is a FUSION (§6: "walkable 2x2 fusion with a locked cardinal output
// direction"), so it is never placed directly — it is not in BUILDABLE_TYPES
// and placeStructure never sees it. Its direction is chosen during the fusion
// confirmation step and permanently locked there (§2 "Fusion permanence",
// server/game/combos.js). Listing it here is what makes that path live rather
// than dormant; its BEHAVIOR is still Task 15.
export const DIRECTIONAL_TYPES = ['WATER_SPECIAL', 'WIND_SPECIAL', 'GRINDER']

// Base footprint per type, in the HORIZONTAL orientation (combat-structure
// redesign §2). Anything absent is 1x1. Vertical placement transposes w/h, so
// only the horizontal form is stored — see structures.js `footprint`.
// Fusions are square, so orientation is meaningless for them.
export const STRUCTURE_SIZE = {
  MARKETPLACE: { w: 2, h: 2 },
  EARTH_SPECIAL: { w: 2, h: 1 }, FIRE_SPECIAL: { w: 2, h: 1 },
  WATER_SPECIAL: { w: 2, h: 1 }, WIND_SPECIAL: { w: 2, h: 1 },
  MAGMA_TRAP: { w: 2, h: 2 }, FIRESTORM: { w: 2, h: 2 }, MUDDY_BOG: { w: 2, h: 2 },
  BLIZZARD: { w: 2, h: 2 }, STEAM_VENT: { w: 2, h: 2 }, GRINDER: { w: 2, h: 2 },
}

// Structures enemies WALK OVER rather than route around (combat-structure
// redesign §2 "shared placement rules"). A walkable structure pushes no band
// onto the cost field, so it never shapes a route and never blocks a diagonal —
// only Barricade, Watchtower and the economy buildings do that. Shared with the
// client because placement preview and rendering need the same answer.
//
// Route-blocking is therefore a deliberate, separately-priced job (Barricade),
// not a side effect of owning a tile.
export const WALKABLE_TYPES = [
  STRUCTURE_TYPES.SNARE_POST,
  STRUCTURE_TYPES.EARTH_SPECIAL, STRUCTURE_TYPES.FIRE_SPECIAL,
  STRUCTURE_TYPES.WATER_SPECIAL, STRUCTURE_TYPES.WIND_SPECIAL,
  STRUCTURE_TYPES.MAGMA_TRAP, STRUCTURE_TYPES.FIRESTORM, STRUCTURE_TYPES.MUDDY_BOG,
  STRUCTURE_TYPES.BLIZZARD, STRUCTURE_TYPES.STEAM_VENT, STRUCTURE_TYPES.GRINDER,
]

// Synergy combo table (spec §2) — sorted-element-pair key -> combo type. All 6
// pairs are server-validated and resolved at build time (Phase 2 scope); which
// pairs are level-gated ("starting" vs "diagonal") is a Phase 4 leveling concern
// layered on top, not enforced here.
export const COMBO_TABLE = {
  'EARTH,FIRE':  'MAGMA_TRAP',
  'FIRE,WIND':   'FIRESTORM',
  'EARTH,WATER': 'MUDDY_BOG',
  'WATER,WIND':  'BLIZZARD',
  'FIRE,WATER':  'STEAM_VENT',
  'EARTH,WIND':  'GRINDER',
}
export function comboKey(elA, elB) {
  return [elA, elB].sort().join(',')
}

// The 6 fusion types, derived from the table so the two can never drift. A
// fusion is team-owned and permanent (combat-structure redesign §2 "Fusion
// permanence"): it cannot be sold, unfused, rotated or redirected, and enemy
// destruction is its only removal path.
export const FUSION_TYPES = Object.values(COMBO_TABLE)


// Build-phase timing styles (room setting, chosen at creation).
export const TIMING_STYLES = ['fixed', 'ready', 'timer-ready']

export const CONFIG = {
  // Server tick — 60 Hz sim (spec §5: NOT a 20 Hz sim).
  TICK_RATE: 60,
  TICK_MS:   1000 / 60,

  // Map — 40×23 @ 32px, whole map visible, no scrolling camera.
  MAP_WIDTH:  TILES_W * TILE_SIZE,  // 1280
  MAP_HEIGHT: TILES_H * TILE_SIZE,  // 736

  // Town hall: 2×2 footprint, bottom-center. Top-left tile of the footprint.
  // Centered horizontally (tiles 19,20) and flush to the bottom two rows (21,22).
  HALL: {
    gx: (TILES_W / 2) - 1,   // 19
    gy: TILES_H - 2,         // 21
    w: 2, h: 2,
  },

  // 3 gates along the top edge (spawn tiles). Gate 1 opens wave 1; gates 2/3
  // (left/right) open at waves 4/7 in randomized order (Phase 3 wires the RNG).
  GATES: {
    CENTER: { gx: TILES_W / 2, gy: 0 },  // {20,0}
    LEFT:   { gx: 2,            gy: 0 },
    RIGHT:  { gx: TILES_W - 3,  gy: 0 },  // {37,0}
  },

  // Room
  MAX_PLAYERS:        4,   // humans + bots always total 4 (one per element)
  ROOM_CODE_LENGTH:   5,
  DISCONNECT_HOLD_MS: 60000,

  // How long a pending fusion proposal waits for the required consents before
  // it expires on its own. A protocol timeout like DISCONNECT_HOLD_MS, not a
  // balance magnitude — nothing about the game's difficulty rides on it.
  // Counted DOWN by the sim's deltaMs (see server/game/combos.js), never
  // against a wall clock: the build handler stamps Date.now() while the loop
  // ticks performance.now(), so a deadline compared across the two would
  // never fire.
  FUSION_CONSENT_MS:  30000,

  // Free-tier concurrency cap (Spike A / CP0 follow-up M4). The measured
  // bandwidth budget fits 2 concurrent rooms with headroom; a 3rd is rejected.
  // Enforced in server/rooms/index.js createRoom.
  MAX_CONCURRENT_ROOMS: 2,

  // Player collision radius (px).
  PLAYER_RADIUS: 14,
}

// Flat list of the 3 gate tiles — used by the placement reachability check
// (Phase 2) to test hall-reachability from every gate regardless of which
// have opened yet (the cost field's correctness doesn't depend on gate state).
export const GATES_LIST = Object.values(CONFIG.GATES)

// Netcode tunables (Spike A protocol). Server imports SNAPSHOT_EVERY_N_TICKS;
// the client interpolation layer (Phase 4) imports the rest.
export const NETCODE = {
  SNAPSHOT_EVERY_N_TICKS: 3,   // emit every 3rd sim tick → 20 Hz broadcast
  INTERP_DELAY_MS:        100, // remote-entity render delay (Phase 4)
  LOCAL_INTERP_DELAY_MS:  60,
  BUFFER_MAX_SNAPSHOTS:   30,
  SNAP_TELEPORT_PX:       96,
  // +15% protocol overhead margin over raw snapshot bytes (CP0 follow-up M4:
  // Socket.io framing + non-snapshot events). Bandwidth budgeting multiplies
  // measured snapshot size by this before comparing to the free-tier ceiling.
  PROTOCOL_OVERHEAD_MARGIN: 1.15,
}
