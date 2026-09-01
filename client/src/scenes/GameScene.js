// Phase 4 render scene: interpolation-only rendering through SnapshotBuffer
// (local ~60ms / remote ~100ms behind, never extrapolating), WASD + mouse-aim
// input pipeline, ability keys, down/dead overlays, projectile rendering and
// floating combat text driven by server-capped fx. Placeholder rectangles
// stand in for art (Phase 7).
//
// Input model: the full input state (keys/aim/actions) is sent every Phaser
// update (~60Hz), latest-wins server-side. During the build phase clicks
// build/sell; during fight the mouse button is the melee basic, Q casts the
// element special, E the L4 second ability.

import Phaser from 'phaser'
import net from '../network.js'
import {
  EVENTS, CONFIG, TILE_SIZE, TILES_W, TILES_H, BUILDABLE_TYPES, PLAYER_FLAG,
  DIRECTIONAL_TYPES, STRUCTURE_TYPES, SPECIAL_TYPE_ELEMENT, FUSION_TYPES,
} from '../../../shared/constants.js'
import { decodeSnapshot } from '../../../server/net/encode.js'
import { BALANCE } from '../../../shared/balance.js'
import { FLAG } from '../../../server/game/enemyTypes.js'
import { footprint, isWalkable } from '../../../server/game/structures.js'
import { SnapshotBuffer } from '../net/SnapshotBuffer.js'
import {
  ELEMENT_COLORS, ELEMENT_OUTLINE, STRUCTURE_COLORS, ENEMY_BASE,
  TOUCH_CONTROL_COLORS, TOUCH_ON_ACTIVE_TEXT, TOUCH_LABEL_TEXT,
  PLACEMENT_GHOST_COLORS, PANEL_BG, FUSION_BUTTON_COLORS,
  ABILITY_STATE_COLORS, SELL_CARD_BUTTON_COLORS,
} from '../theme.js'
const { plate: TOUCH_PLATE, edge: TOUCH_EDGE, knob: TOUCH_KNOB, active: TOUCH_ACTIVE } = TOUCH_CONTROL_COLORS
import { PlacementIntent, selectionSignature, COMMIT } from '../input/placementIntent.js'
import { audio } from '../audio.js'
import { entitySprite, styleable, aimRotation } from '../render/sprites.js'
import { abilitySlots, decayRemaining } from '../render/abilityBar.js'
import {
  TouchController, layoutTouchControls, inputHints, prefersTouchFirst,
  TOUCH_MIN_TARGET_CSS_PX,
} from '../input/touchControls.js'
import { CharacterAnimator, StructureAnimator, ATTACK_KIND_ELEMENT } from '../render/AnimationController.js'
import { structureDisplayRect } from '../render/structureVisuals.js'
import { actorDisplayScale } from '../render/actorVisuals.js'
import { EffectPool } from '../render/EffectPool.js'
import { ELEMENT_ATLAS_KEY, structureArtKey, enemyArtKey } from '../assets/manifest.js'
import { createBuildPalette, typeAvailability } from '../ui/buildPalette.js'
import { computeThumbnails } from '../render/buildThumbnails.js'
import { createMenuPanel } from '../ui/menuPanel.js'
import { createWavePreview } from '../ui/wavePreview.js'

// Attack kind (server/net/encode.js ATTACK_KINDS) -> element comes from the
// animation controller (which sizes a cast off the same map); the reverse
// direction is only needed here, for the local input edge's immediate
// cosmetic telegraph (has element via net.element, not a kind).
const ELEMENT_ATTACK_KIND = { EARTH: 'EARTH_CONE', WATER: 'WATER_REACH', FIRE: 'FIRE_REACH', WIND: 'WIND_WINDUP' }
// Angular width of each class's telegraph wedge — Earth's is the real
// server cone angle (read from BALANCE at draw time); Water/Fire have no
// server-side angle (single-target reach scans), so a placeholder width
// distinguishes Water's wide "contact area" from Fire's narrow "reach"
// (a directional thrust) while both still use the class's REAL rangePx.
const ATTACK_HALF_ANGLE_DEG = { WATER_REACH: 75, FIRE_REACH: 20 }

// Unit vectors for the 4 cardinal output directions (Task 9) — used both to
// draw the placement-preview direction arrow and the locked-direction
// indicator on an already-placed Water Geyser / Wind Vortex.
const DIRECTION_VECTOR = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }

// Structure types with a one-shot "it just activated" sfx (2026-08-09
// audio-sourcing pass), keyed off the same cycleSeq-bump signal
// StructureAnimator already uses for its own ACTIVE pulse — see the
// structure render loop's entry.audioCycle tracking. Not every structure
// has a sourced activation sound yet; absent from this table just means no
// sfx plays on activation, same as an atlas-less structure rendering as a
// placeholder shape. EARTH_SPECIAL plays two sounds (fall + impact) since
// its single visual impact_down trigger already covers what those two
// sourced sounds separately depict (a rock literally falling then hitting).
const STRUCTURE_ACTIVATION_SFX = {
  WATCHTOWER: 'watchtower_fire', SNARE_POST: 'snare_pulse',
  EARTH_SPECIAL: ['rock_trap_fall', 'rock_trap_impact'],
  WATER_SPECIAL: 'water_geyser_launch', WIND_SPECIAL: 'wind_vortex_release',
  MAGMA_TRAP: 'volcano_eruption', FIRESTORM: 'firestorm_volley',
  MUDDY_BOG: 'muddy_bog_root', BLIZZARD: 'blizzard_impact',
  FIRE_SPECIAL: 'firepit_flare',
  // Already-processed sfx (audio.js's SFX_NAMES) with no trigger until the
  // Steam Vent cycleSeq bump added alongside this structure's art wiring
  // (structureBehaviors/confusion.js) made this table's existing detection
  // logic actually fire for STEAM_VENT.
  STEAM_VENT: ['steam_vent_pressure', 'steam_vent_confusion'],
  // Crush (damage) and release (survivor ejection) happen inside the same
  // doCrush() call on the same cycleSeq bump (server/game/structureBehaviors/
  // cycle.js) — no distinct server signal exists to separate them, so both
  // play together off this one activation edge.
  GRINDER: ['grinder_crush', 'grinder_release'],
}

// Structure types with a one-shot "it just armed/telegraphed" sfx, keyed
// off the targetImpact family's phase 0->1 edge (StructureAnimator's own
// TELEGRAPH read, same signal) — a locked target about to be hit, distinct
// from the impact itself above. Only the targetImpact family (Rock Trap,
// Blizzard) has this phase semantic; other families' phase means something
// else (cycle's charge ramp, entryTrigger's post-eruption cooldown) and
// isn't a "warning" moment in the same sense.
const STRUCTURE_WARNING_SFX = { EARTH_SPECIAL: 'rock_trap_warning', BLIZZARD: 'blizzard_warning' }

// One-shot target-point IMPACT fx (cycleSeq bump), keyed by structure type —
// a separate sprite anchored at the server's locked target point (ds.tx/
// ds.ty), independent of the structure's own footprint-anchored atlas above.
// _spawnAttackFx chains through `states` in order via 'animationcomplete',
// skipping any state the atlas doesn't have, so Blizzard's two-frame
// spike->shatter burst and Rock Trap's single unified impact_down clip use
// the exact same call shape.
const STRUCTURE_TARGET_FX = {
  EARTH_SPECIAL: { atlasKey: 'rock_trap_fx', states: ['impact_down'] },
  BLIZZARD: { atlasKey: 'blizzard_fx', states: ['spike', 'shatter'] },
}

// One-shot target-point TELEGRAPH fx, keyed off the same phase 0->1 edge as
// STRUCTURE_WARNING_SFX above (its own tracked field, since a structure can
// have the sfx, the visual, both, or neither). Only Blizzard ships a
// dedicated "about to strike" frame today.
const STRUCTURE_TARGET_WARNING_FX = {
  BLIZZARD: { atlasKey: 'blizzard_fx', states: ['warning'] },
}

// Ceilings on SIMULTANEOUSLY live pooled effects (Task 17). Sized off the
// worst realistic overlap: floating text lives 650-900 ms across ~13-18 emits
// at 20 Hz, rings 350 ms across ~7 — well above anything the server's per-emit
// fx cap can produce in that window, so the cap only bites during a genuine
// burst and never during normal play.
// Below structureAuraGfx (-1), which was the previous floor of the scene.
const GROUND_DEPTH = -20
const GRID_DEPTH = -19

const FX_TEXT_CAP = 64
const FX_RING_CAP = 32
const FX_ATTACK_CAP = 24
// How long a structure's activation pulse reads before it falls back to its
// resting state. Client presentation only — the server's phase deadlines are
// untouched by it.
const STRUCTURE_ACTIVE_MS = 260
// Hall HP fraction below which gate_warning fires (once per dip below, reset
// once HP recovers above it — see update()'s _hallWarnedLow edge-detect).
const HALL_WARN_FRAC = 0.3
// Ability bar geometry (bottom-center). Three slots: basic, Q, E.
const ABILITY_SLOT_COUNT_RANGE = [0, 1, 2]
// Ability-bar slot index -> the touch action it doubles as a button for.
// Slot 0 (basic) is undefined on purpose: on touch the aim stick fires it.
const TOUCH_ABILITY_SLOT_KIND = [undefined, 'special', 'second']
const ABILITY_SLOT_W = 74
const ABILITY_SLOT_H = 16
const ABILITY_SLOT_GAP = 8
const ABILITY_BAR_BOTTOM_MARGIN = 26
// Most of the screen width the bottom-centre ability bar may occupy. Beyond
// this the sticks either side have nowhere to go.
const ABILITY_BAR_MAX_WIDTH_FRAC = 0.6
// Width the wave-preview widget occupies at the top right (createWavePreview is
// positioned at MAP_WIDTH - 198). The top-left HUD text wraps before it.
const WAVE_PREVIEW_W = 198
// Fill colors per slotState — ready reads bright, charging accents warm so a
// player can time the cast, cooling stays dim.
// Ready/charging/cooling fill colours now live in theme.js
// (ABILITY_STATE_COLORS) so the contrast gate can see them — they used to be
// a private literal here and were never checked at their real 0.55-0.9 draw
// alpha against the ability bar's own translucent background.
const ABILITY_STATE_COLOR = {
  ready: ABILITY_STATE_COLORS.ready.color,
  charging: ABILITY_STATE_COLORS.charging.color,
  cooling: ABILITY_STATE_COLORS.cooling.color,
}

// HUD scale: every HUD element sits at fixed pixel coords in a 1280x736
// design space under Scale.FIT, so a 13px label renders ~7px on a phone. This
// is a user-controlled multiplier ([ / ] keys, persisted) applied to HUD font
// sizes, bar geometry and line spacing — independent of Phaser's own FIT
// scaling, which shrinks the whole canvas rather than making text legible.
const HUD_SCALE_MIN = 0.75
const HUD_SCALE_MAX = 2.5
const HUD_SCALE_STEP = 0.25
const HUD_SCALE_DEFAULT = 1
const HUD_SCALE_STORAGE_KEY = 'elementia.hudScale'
// Status row (player HP / Hall HP) bar geometry at hudScale 1.
const STATUS_BAR_W = 140
const STATUS_BAR_H = 8

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene')
    this.latest = null          // last decoded snapshot (gameplay/HUD source)
    this.snapBuf = new SnapshotBuffer()
    this.phaseInfo = { phase: 'build', wave: 1, tally: null }
    this.playerGfx = new Map()  // playerId → { dot, label, px, py, hp }
    // playerId → CharacterAnimator. Kept OUT of playerGfx on purpose: an atk
    // event can arrive in the same snapshot that first introduces a player,
    // i.e. before update() has built that player's render entry, and the cast
    // must not be dropped just because its sprite does not exist yet.
    this.playerAnim = new Map()
    this.structureGfx = new Map() // structureId → { rect, hpBar, anim }
    this.structureStateById = new Map() // structureId → latest ds record (hp/phase/deadline/charge/cycle)
    this.enemyGfx = new Map()   // enemyId → { dot }
    this.projectileGfx = new Map() // projectileId → circle
    this.selectedType = BUILDABLE_TYPES[0]
    this.selectedOrient = 'H'
    this.selectedDir = 'N'
    this.rejectMessage = ''
    this.levelBanner = ''
    // Edge-detect state for hover/threshold sfx (see _drawPlacementGhost and
    // update()'s hall-HP bar) — these fire once on the transition, not every
    // frame the condition holds, mirroring StructureAnimator's warnPhase idiom.
    this._placementValidPrev = null
    this._hallWarnedLow = false
    this.hudScale = this._loadHudScale()
    // Raw tick is an internal debug number (server's authoritative frame
    // counter), not player-facing info — shown only with ?debug=1.
    this._debugHud = typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('debug') === '1'
    // Pending fusion proposals (Task 13). A LIST, not a slot: the server
    // allows several independent proposals at once (different ingredient
    // pairs), and a single slot would silently drop the older one's UI until
    // it timed out — a consent soft-lock (Gate 6). Each entry is the server's
    // describeProposal payload plus a locally-counted `remainingMs`; the
    // countdown is display only, the server owns expiry (combos.js).
    this.fusionPrompts = []
    this.fusionMessage = ''
    this.fusionDir = 'N'   // the initiator's pick for a directional fusion
    this._localAtkDown = false   // edge-detects the local basic-attack press for immediate feedback
    // --- input scheme seam (2026-08-22) ---
    // Desktop (keyboard+mouse) and touch (twin virtual sticks) are two SOURCES
    // for one identical PLAYER_INPUT packet; see _sendInput and
    // client/src/input/touchControls.js. Both stay live at once on a hybrid
    // device — this only records which one the player last actually used, and
    // therefore which controls to draw and which hint prose to print.
    this.touch = new TouchController()
    this._inputScheme = prefersTouchFirst() ? 'touch' : 'desktop'
    // Last board position a touch actually landed on, so the build ghost
    // tracks placement intent instead of the thumb driving the move stick.
    this._boardPointer = null
    // TOUCH ONLY: first tap on a board tile arms it, second tap on the same
    // tile builds. Desktop keeps one-click, because hover already previews
    // validity there and touch has no hover -- that asymmetry is what this
    // fixes. See client/src/input/placementIntent.js for why it cannot
    // affect the balance corpus.
    this.placementIntent = new PlacementIntent()
    // Structure selected for inspection / sale (2026-08-22). Selling used to
    // happen on the FIRST click, with no confirmation and no undo, while the
    // placement ghost simultaneously painted the tile RED -- the universal
    // "this will do nothing" signal -- and then destroyed the building.
    // Identical flow on desktop and touch: the action is build-phase only, so
    // there is no combat-speed argument for a desktop fast path.
    this.selectedStructureId = null
    this._structureCardHit = null   // { structureId, x, y, w, h, sell }
  }

  create() {
    const W = CONFIG.MAP_WIDTH, H = CONFIG.MAP_HEIGHT

    this.cameras.main.setBackgroundColor('#0d1420')

    // Ground layer (tools/art/ground_pipeline.py) — one pre-rendered image the
    // exact size of the map, under everything including structureAuraGfx at
    // depth -1. Absent the texture the scene falls back to the old bare grid
    // on the camera's background colour, same fallback discipline as the Hall.
    if (this.textures.exists('ground')) {
      this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(GROUND_DEPTH)
    }

    // Static grid + gates + hall footprint. Over the ground the grid is a
    // placement lattice rather than the surface itself, and it has to change
    // COLOUR rather than alpha: 0x1c2a3a sits at luminance ~40 while the
    // ground averages ~42, so it measured 1.03:1 against the ground at any
    // alpha. Near-black reads as a recessed joint and comes out at 1.44:1 --
    // which is in fact better than the 1.27:1 the same grid had against the
    // old near-black field, so this is not a regression in placement legibility.
    //
    // Grid is its own graphics object (2026-08-15) so it can be shown only in
    // the build phase and hidden in the fight — a placement lattice has no
    // job once building is locked, and hiding it lets the (now brighter)
    // ground read as terrain rather than a lattice during combat. Gate
    // markers live on a separate, always-visible object: they matter most
    // during the fight, when enemies are actually pouring through them.
    const onGround = this.textures.exists('ground')
    this.gridGfx = this.add.graphics()
    this.gridGfx.lineStyle(1, onGround ? 0x000000 : 0x1c2a3a, onGround ? 0.85 : 1)
    for (let x = 0; x <= TILES_W; x++) this.gridGfx.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, H)
    for (let y = 0; y <= TILES_H; y++) this.gridGfx.lineBetween(0, y * TILE_SIZE, W, y * TILE_SIZE)
    this.gridGfx.setDepth(GRID_DEPTH)
    this.gridGfx.setVisible(this.phaseInfo.phase === 'build')

    const gateGfx = this.add.graphics().setDepth(GRID_DEPTH)
    for (const key of Object.keys(CONFIG.GATES)) {
      const gate = CONFIG.GATES[key]
      // Same red family as WATCHTOWER, re-lifted with it 2026-08-15 for the
      // brighter ground (theme.js) — the gate bar is the marker that tells a
      // player where the wave arrives.
      gateGfx.fillStyle(0xe7a9a9, 1)
      gateGfx.fillRect(gate.gx * TILE_SIZE, 0, TILE_SIZE, 6)
      this.add.text(gate.gx * TILE_SIZE + TILE_SIZE / 2, 10, key[0], {
        fontFamily: 'monospace', fontSize: '11px', color: '#c98a8a',
      }).setOrigin(0.5, 0)
    }

    // Hall footprint (2×2) + HP bar. Real art (manifest.js 'hall' key) takes
    // over via entitySprite; the graphics rect + label are the fallback when
    // it isn't loaded, same pattern as placed structures below.
    const hall = CONFIG.HALL
    const hallCx = (hall.gx + hall.w / 2) * TILE_SIZE, hallCy = (hall.gy + hall.h / 2) * TILE_SIZE
    this.hallSprite = entitySprite(this, 'hall', hallCx, hallCy, () => {
      const g = this.add.graphics()
      g.fillStyle(0x2f4b6e, 1)
      g.fillRect(hall.gx * TILE_SIZE, hall.gy * TILE_SIZE, hall.w * TILE_SIZE, hall.h * TILE_SIZE)
      g.lineStyle(2, 0x6fa0d8, 1)
      g.strokeRect(hall.gx * TILE_SIZE, hall.gy * TILE_SIZE, hall.w * TILE_SIZE, hall.h * TILE_SIZE)
      return g
    })
    // The Hall sprite was previously never sized at ALL. That only looked
    // right because hall.png happens to be exactly 2x2 tiles — swap in art of
    // any other resolution and it would silently render at the wrong scale.
    // Size it like placed structures, so its VISIBLE content fills the 2x2 it
    // occupies (the art carries 22% empty margin across its width).
    //
    // Guarded on setDisplaySize rather than styleable(): the Hall's fallback
    // is a Graphics, which — unlike the Rectangle used for structures — has
    // neither setStrokeStyle NOR setDisplaySize, so styleable() cannot tell it
    // apart from a Sprite here.
    if (typeof this.hallSprite.setDisplaySize === 'function' && this.hallSprite.frame) {
      const hallDisp = structureDisplayRect(
        'hall', hall.w * TILE_SIZE, hall.h * TILE_SIZE,
        this.hallSprite.frame.width, this.hallSprite.frame.height,
      )
      this.hallSprite.setDisplaySize(hallDisp.width, hallDisp.height)
      this.hallSprite.setPosition(hallCx, hallCy + hallDisp.offsetY)
    }
    if (!styleable(this.hallSprite)) {
      this.add.text(hallCx, hallCy, 'HALL', {
        fontFamily: 'monospace', fontSize: '12px', color: '#cfe4ff',
      }).setOrigin(0.5)
    }
    this.hallHpBar = this.add.graphics()

    // Structure layer — drawn under players, above the grid.
    this.structureLayer = this.add.container()

    // Pooled transient fx (Task 17). Damage numbers and impact rings are the
    // two effects that fire constantly during a fight; the server's per-emit
    // fx cap bounds how many SPAWN per emit but not how many are alive at
    // once (a 650 ms damage tween spans ~13 emits), so the pool's cap is what
    // actually bounds simultaneous instances. Over the cap the effect is
    // dropped — one missing damage number beats unbounded object churn.
    this.fxTextPool = new EffectPool({
      cap: FX_TEXT_CAP,
      create: () => this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px' })
        .setOrigin(0.5).setDepth(900).setVisible(false),
      reset: (t, { x, y, text, color, size }) => {
        this.tweens.killTweensOf(t)
        t.setText(text).setColor(color).setFontSize(size).setPosition(x, y).setAlpha(1).setVisible(true)
      },
      hide: (t) => t.setVisible(false),
    })
    this.fxRingPool = new EffectPool({
      cap: FX_RING_CAP,
      create: () => this.add.circle(0, 0, 6, 0, 0).setDepth(890).setVisible(false),
      reset: (r, { x, y, color }) => {
        this.tweens.killTweensOf(r)
        r.setPosition(x, y).setRadius(6).setStrokeStyle(2, color).setAlpha(1).setVisible(true)
      },
      hide: (r) => r.setVisible(false),
    })
    // Animation keys are only played if the loaded atlas actually authored
    // them (Preload builds one anim per frame group it finds), so a partial
    // atlas degrades to "that state doesn't animate" instead of throwing.
    this._hasAnim = (key) => this.anims.exists(key)
    // One-shot, non-pooled atlas FX (hero basic-attack bursts, Rock Trap's
    // target-point impact): capped like the other transient effects above,
    // but plain create/destroy rather than EffectPool since these fire far
    // less often (per-cooldown, not per-emit) and each runs a short
    // flight->impact->dissipation animation chain rather than a single tween.
    this.attackFx = new Set()
    this.events.once('shutdown', () => this._teardownRenderState())
    this.events.once('destroy', () => this._teardownRenderState())

    // Placement ghost (Task 9): footprint outline, validity color, chosen
    // direction arrow, and range/area preview — redrawn every frame from the
    // hovered tile while in the build phase.
    this.ghostGfx = this.add.graphics().setDepth(50)
    // Locked output-direction arrows for already-placed directional
    // structures (Task 9) — one shared graphics, cleared/redrawn per frame.
    this.structureDirGfx = this.add.graphics().setDepth(55)
    // Live hitbox aura for already-PLACED range/area structures (2026-08-02):
    // the ghost preview above only exists while hovering to build, so once a
    // Firepit/Watchtower/etc. is on the ground its actual reach was invisible.
    // One shared graphics, same reuse pattern as structureDirGfx. depth -1, NOT
    // a high number: structureLayer/grid/hallRect all sit at Phaser's default
    // depth 0 (only the ghost/dir/fusion graphics opt into high explicit depths
    // to draw ABOVE everything), so this must sort BELOW that default to read
    // as ground glow under structures and bodies rather than an overlay on top
    // of them.
    this.structureAuraGfx = this.add.graphics().setDepth(-1)

    // HUD (fixed to camera).
    this.hud = this.add.text(8, 8, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#e6eef6',
    }).setScrollFactor(0).setDepth(1000)
    this.buildHud = this.add.text(8, 28, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#9fd1e8',
    }).setScrollFactor(0).setDepth(1000)
    // Fusion consent prompt (Task 13) — its own line under the build hint, so
    // a proposal never has to compete with the build/reject text for the slot.
    this.fusionHud = this.add.text(8, 46, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd27a',
    }).setScrollFactor(0).setDepth(1000)
    // Outline of the 2x2 a pending proposal would occupy.
    this.fusionGfx = this.add.graphics().setDepth(56)
    // Centered, unmissable fusion-consent panel (2026-08-22) — see
    // _drawFusionPrompt for layout/hit-testing and _respondFusion/
    // _setFusionDir for the logic it shares with the Y/N/arrow keys.
    this.fusionPanelGfx = this.add.graphics().setScrollFactor(0).setDepth(1002)
    this.fusionPromptText = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffd27a', align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1003)
    const makeFusionBtnLabel = (text) => this.add.text(0, 0, text, {
      fontFamily: 'monospace', fontSize: '13px', color: '#e6eef6',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1004).setVisible(false)
    this.fusionButtonLabels = {
      accept: makeFusionBtnLabel('ACCEPT'), reject: makeFusionBtnLabel('REJECT'),
      N: makeFusionBtnLabel('N'), E: makeFusionBtnLabel('E'),
      S: makeFusionBtnLabel('S'), W: makeFusionBtnLabel('W'),
    }
    this._fusionButtonRects = {}
    this._fusionPanelHit = null // { promptId, x, y, w, h } — see pointerdown handler above

    // Player HP + Hall HP status row (2026-08-22): neither had a HUD readout
    // before — local HP was only ever read to trigger the hurt animation, and
    // Hall HP (the balance program's primary metric, hallHpAuc) lived only in
    // a 5px world-space bar at the hall itself. Bars are redrawn every frame
    // in update() from live snapshot data; the graphics object and labels are
    // created once here. See _layoutHud() for the scale-aware geometry.
    this.statusBarsGfx = this.add.graphics().setScrollFactor(0).setDepth(1000)
    this.playerHpText = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#e6eef6',
    }).setScrollFactor(0).setDepth(1000)
    this.hallHpText = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#e6eef6',
    }).setScrollFactor(0).setDepth(1000)
    this.wavePreview = createWavePreview(this, W - 198, 8)
    // Center-screen status overlay (downed/dead/level-up).
    this.overlay = this.add.text(W / 2, H / 2 - 60, '', {
      fontFamily: 'monospace', fontSize: '22px', color: '#ffd27a', align: 'center',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001)
    this._layoutHud()

    // Ability cooldown/charge bar (bottom-center): one slot per input, filling
    // as its cooldown elapses. Remaining-ms rides the snapshot; _abilityCd
    // holds the last authoritative values and is decayed by local frame time
    // between emits so the fill moves at display rate, not 20 Hz.
    this._abilityCd = { cdBasic: 0, cdSpecial: 0, cdSecond: 0 }
    this.abilityGfx = this.add.graphics().setScrollFactor(0).setDepth(1000)
    this.abilityLabels = ABILITY_SLOT_COUNT_RANGE.map(() =>
      this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '10px', color: '#cfe4ff' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(1001))

    // Twin virtual sticks + REPAIR button (2026-08-22). Drawn UNDER the HUD
    // text (depth 1000) and the fusion panel (1002) so neither is ever
    // obscured by a control. Geometry is recomputed every frame in
    // _drawTouchControls because it depends on this.scale.displayScale, which
    // changes on any window/orientation resize.
    // Structure inspect/sell card. Above the board and the touch controls, but
    // below the fusion panel (1002/1003/1004) — a timed consent prompt
    // outranks a card the player opened themselves and can dismiss.
    this.structureCardGfx = this.add.graphics().setScrollFactor(0).setDepth(1005)
    this.structureCardText = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#e6eef6',
    }).setScrollFactor(0).setDepth(1006).setVisible(false)
    this.structureCardBtn = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#e6eef6',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1006).setVisible(false)
    this.structureCardClose = this.add.text(0, 0, 'X', {
      fontFamily: 'monospace', fontSize: '15px', color: '#e6eef6',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1006).setVisible(false)

    this.touchGfx = this.add.graphics().setScrollFactor(0).setDepth(999)
    this.touchRepairLabel = this.add.text(0, 0, 'REPAIR', {
      fontFamily: 'monospace', fontSize: '13px', color: '#cfe4ff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(999).setVisible(false)
    // Two thumbs on sticks plus a third on an ability/repair button is three
    // simultaneous touches; Phaser only allocates one touch pointer by default.
    this.input.addPointer(3)
    this._layoutTouchControls()
    // The HUD stack is now sized from displayScale (see _uiUnit), which
    // changes on any window resize or orientation change, so its one-time
    // layout has to be recomputed then. The touch controls, ability bar and
    // fusion panel all recompute per frame and need no hook.
    this.scale.on('resize', () => this._layoutHud())

    // Build palette (DOM, bottom-docked). Every callback routes into the SAME
    // handler the keyboard already used, so there is exactly one definition of
    // what selecting a type or rotating means. See client/src/ui/buildPalette.js
    // for why this one widget is DOM rather than Phaser graphics.
    this.palette = createBuildPalette({
      onSelectType: (type) => this._selectBuildType(type),
      onRotate: () => this._rotateSelection(),
      onDir: (dir) => this._setOutputDir(dir),
      onMute: () => { audio.setMuted(!audio.isMuted()); audio.playFx('ui_click') },
      onHudScale: (delta) => { this._adjustHudScale(delta); audio.playFx('ui_click') },
      // The dock reserves screen space via --ep-dock, so Phaser has to re-FIT
      // into the new parent height. Without this the canvas keeps its old size
      // until the next window resize.
      onDockChange: () => { this.scale.refresh(); this._layoutHud() },
      onReady: () => {
        this._readied = !this._readied
        net.emit(EVENTS.SET_READY, { ready: this._readied })
        audio.playFx('ui_click')
      },
      // Both palette doors -- the build-phase MENU button and the action-phase
      // one -- land here. The menu opens over a RUNNING match: the server
      // ticks this room at 60Hz whether we look at it or not, so a
      // client-side freeze would only snap forward on resume. See
      // client/src/ui/menuPanel.js.
      onMenu: (from) => {
        this.menuPanel?.toggle(this._inputScheme, from)
        audio.playFx('ui_click')
      },
    }, computeThumbnails(this))
    this.menuPanel = createMenuPanel({
      // A phase turning over while the menu is open swaps which MENU button
      // exists, so the one that opened it may be gone by the time it closes.
      // Hand focus to whichever door is on screen now.
      focusAfterClose: () => this.palette?.visibleMenuDoor(),
      // Fired only after the player confirms in the menu. The server wipes the
      // room's run and answers with a fresh GAME_START, which _onGameStart
      // already knows how to absorb -- it is the same path a mid-match join
      // and a reconnect take. Anyone in the room may do this (2026-08-31).
      onRestart: () => {
        net.emit(EVENTS.RESTART_MATCH)
        audio.playFx('ui_click')
      },
    })
    this.events.once('shutdown', () => {
      this.palette?.destroy()
      this.menuPanel?.destroy()
    })

    // --- input ---
    const KC = Phaser.Input.Keyboard.KeyCodes
    // enableCapture=false: these letters have no native browser action, but
    // Phaser's default capture calls preventDefault() on them window-wide,
    // which blocks typing w/a/s/d/q/e/f into any HTML input (e.g. the lobby's
    // "Your name" field) even while that field has focus. Disabling capture
    // stops that without affecting in-game key state.
    this.keys = {
      w: this.input.keyboard.addKey(KC.W, false), a: this.input.keyboard.addKey(KC.A, false),
      s: this.input.keyboard.addKey(KC.S, false), d: this.input.keyboard.addKey(KC.D, false),
      special: this.input.keyboard.addKey(KC.Q, false),
      second:  this.input.keyboard.addKey(KC.E, false),
      repair:  this.input.keyboard.addKey(KC.F, false),
    }

    // 1-9 hotbar → BUILDABLE_TYPES (build-phase placeholder UI until Phase 7).
    // R rotates orientation (only meaningful for a non-square footprint);
    // arrow keys pick the independent cardinal direction for the 2
    // DIRECTIONAL_TYPES (Water Geyser / Wind Vortex) — both reset to their
    // defaults whenever the selected type changes.
    this.input.keyboard.on('keydown', (e) => {
      this._unlockAudio()
      // A real keypress means a real keyboard: flip a hybrid device back to
      // the desktop scheme (and drop any half-held stick with it).
      this._noteSchemeUsed('desktop')
      if (e.code === 'KeyM') {
        audio.setMuted(!audio.isMuted())
        audio.playFx('ui_click') // no-ops silently while muted — audible only when turning sound back on
        return
      }
      // [ / ] resize the HUD (font size + bar geometry), independent of
      // Phaser's own canvas FIT scale — the accessibility/small-screen fix
      // (see HUD_SCALE_* constants and _adjustHudScale).
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        this._adjustHudScale(e.code === 'BracketRight' ? 1 : -1)
        audio.playFx('ui_click')
        return
      }
      const digitMatch = /^Digit([1-9])$/.exec(e.code)
      if (digitMatch) {
        const idx = Number(digitMatch[1]) - 1
        if (idx < BUILDABLE_TYPES.length) this._selectBuildType(BUILDABLE_TYPES[idx])
        return
      }
      // Y/N answer the fusion proposal currently being prompted (the oldest one
      // still waiting on this client). Only the players the server listed in
      // requiredIds can answer, so a bystander's keypress is not sent at all
      // rather than being refused server-side. The on-screen accept/reject
      // buttons (_drawFusionPrompt/pointerdown below) call the same
      // _respondFusion helper, so keyboard and touch/mouse stay identical.
      const prompt = this._activeFusionPrompt()
      if (prompt && (e.code === 'KeyY' || e.code === 'KeyN')) {
        this._respondFusion(prompt, e.code === 'KeyY')
        return
      }
      // Arrow keys aim a directional fusion BEFORE accepting it, but only for
      // the initiator — for everyone else the cardinal is already locked.
      if (prompt?.needsDirection && prompt.initiatorId === net.playerId && prompt.dir == null) {
        const fuseDir = { ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' }[e.code]
        if (fuseDir) { this._setFusionDir(fuseDir); return }
      }
      if (this.phaseInfo.phase !== 'build') return
      if (e.code === 'KeyR') { this._rotateSelection(); return }
      const arrowDir = {
        ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W',
      }[e.code]
      if (arrowDir) this._setOutputDir(arrowDir)
    })

    // Build/sell clicks only apply in the build phase; in fight the held
    // button is the melee basic (sent via the per-frame input packet).
    this.input.on('pointerdown', (pointer) => {
      this._unlockAudio()
      // Fusion panel is screen-fixed (pointer.x/y, not worldX/worldY) and
      // answered regardless of build/fight phase, so this check runs before
      // the phase gate below. ANY click inside the panel's own bounds is
      // swallowed here — not just a button hit — so clicking the panel's
      // body/text/gaps can never fall through to build/sell a structure on
      // the (possibly invisible, panel-covered) tile behind it. A button hit
      // only acts if the prompt it was drawn for is STILL the active one:
      // fusionPrompts can expire/resolve server-side between the frame that
      // drew these rects and the click, and re-resolving here would let a
      // stale ACCEPT rect answer a DIFFERENT proposal the player never read
      // (2026-08-22 review, findings 1/2).
      const panel = this._fusionPanelHit
      if (panel && pointer.x >= panel.x && pointer.x <= panel.x + panel.w &&
          pointer.y >= panel.y && pointer.y <= panel.y + panel.h) {
        const hitKey = Object.entries(this._fusionButtonRects).find(([, r]) =>
          pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h)?.[0]
        if (hitKey) {
          const prompt = this._activeFusionPrompt()
          if (prompt && prompt.id === panel.promptId) {
            if (hitKey === 'accept' || hitKey === 'reject') this._respondFusion(prompt, hitKey === 'accept')
            else this._setFusionDir(hitKey)
          }
        }
        return
      }
      // Structure card: same swallow-everything rule as the fusion panel, and
      // the same identity re-check — the SELL button only acts if the card is
      // still showing the structure it was drawn for. A structure can be
      // destroyed by enemies, or sold by a teammate, between the frame that
      // drew the button and the click on it.
      const card = this._structureCardHit
      if (card && pointer.x >= card.x && pointer.x <= card.x + card.w &&
          pointer.y >= card.y && pointer.y <= card.y + card.h) {
        const b = card.sell
        const inRect = (r) => r && pointer.x >= r.x && pointer.x <= r.x + r.w &&
          pointer.y >= r.y && pointer.y <= r.y + r.h
        if (inRect(card.close)) { this._dismissStructureCard(); audio.playFx('ui_click'); return }
        const onSell = inRect(b)
        if (onSell && this.selectedStructureId === card.structureId &&
            (this.structuresCache || []).some(st => st.id === card.structureId)) {
          net.emit(EVENTS.SELL_STRUCTURE, { structureId: card.structureId })
          audio.playFx('sell')
          this._dismissStructureCard()
        } else if (!onSell) {
          this._dismissStructureCard()
        }
        return
      }
      // Scheme flip is checked AFTER the fusion panel so a hybrid user's first
      // touch can still answer a proposal, and BEFORE everything else so the
      // touch controls exist to be hit. The tap that reveals the sticks is
      // swallowed: it landed on a screen that was not showing them yet, and
      // letting it build/sell would be a tap the player never aimed.
      if (this._noteSchemeUsed(pointer.wasTouch ? 'touch' : 'desktop')) return
      // Any touch inside a control's own bounds is consumed here and never
      // falls through to build/sell underneath it (2026-08-22 review lesson).
      if (this._inputScheme === 'touch' && this.touch.pointerDown(pointer.id, pointer.x, pointer.y)) return
      // Reached the board rather than a control, so this is a real placement
      // intent and the ghost should follow it (see _drawPlacementGhost).
      this._boardPointer = { worldX: pointer.worldX, worldY: pointer.worldY }
      if (this.phaseInfo.phase !== 'build') return
      const gx = Math.floor(pointer.worldX / TILE_SIZE)
      const gy = Math.floor(pointer.worldY / TILE_SIZE)
      const hit = (this.structuresCache || []).find(s => this._structureContains(s, gx, gy))
      if (hit) {
        // SELECT, never sell. The sale needs the card's own button — see
        // _drawStructureCard and the card hit-test above.
        this._selectStructure(hit.id)
      } else {
        this._dismissStructureCard()
        // TOUCH: arm-then-confirm. The first tap on a tile only pins the
        // ghost there (the player finally gets to SEE validity before paying,
        // the way desktop hover always has); a second tap on the same tile
        // with the same selection is what spends the gold. Desktop is
        // untouched -- one click still builds.
        //
        // Deliberately NOT gated on _placementValidity: an armed invalid tile
        // still emits on the second tap, so the SERVER stays the one
        // authority on what may be built and the player still gets its real
        // rejection reason. The red dashed ghost + X already warns them
        // before they spend the second tap.
        if (this._inputScheme === 'touch') {
          const sig = selectionSignature({
            type: this.selectedType, orient: this.selectedOrient,
            dir: DIRECTIONAL_TYPES.includes(this.selectedType) ? this.selectedDir : undefined,
          })
          if (this.placementIntent.tap(gx, gy, sig) !== COMMIT) {
            // Distinct from 'build' on purpose: an armed tap that sounded
            // like a build would read as "it built something invisible".
            audio.playFx('ui_click')
            return
          }
        }
        net.emit(EVENTS.BUILD_STRUCTURE, {
          type: this.selectedType, gx, gy, orient: this.selectedOrient,
          dir: DIRECTIONAL_TYPES.includes(this.selectedType) ? this.selectedDir : undefined,
        })
        audio.playFx('build')
      }
    })

    // Stick drags. Only pointers the controller already bound on pointerdown
    // are followed, so a stray finger dragging across the board never grabs a
    // stick it did not start on.
    this.input.on('pointermove', (pointer) => {
      if (this._inputScheme === 'touch') this.touch.pointerMove(pointer.id, pointer.x, pointer.y)
    })
    const release = (pointer) => this.touch.pointerUp(pointer.id)
    this.input.on('pointerup', release)
    this.input.on('pointerupoutside', release)
    // Last-resort safety net: a pointerup swallowed by the browser (an alert,
    // a lost context, a gesture cancel) would otherwise pin movement or an
    // ability ON forever. Every frame, any bound pointer the engine no longer
    // reports as down is released — see _reconcileTouchPointers.
    this.events.once('shutdown', () => this.touch.releaseAll())

    this._wireEvents()

    if (typeof window !== 'undefined') window.__scene = this
  }

  // Footprint-aware: elemental structures are 2x1/1x2 and fusions 2x2, so a
  // click on any tile of the footprint must resolve the structure. w/h ride the
  // snapshot (see server/net/encode.js); absent means 1x1.
  _structureContains(s, gx, gy) {
    const w = s.w ?? 1, h = s.h ?? 1
    return gx >= s.gx && gx < s.gx + w && gy >= s.gy && gy < s.gy + h
  }

  // UX-only preview of server/game/structures.js's placeStructure checks —
  // bounds, hall, occupancy, no-build arc, element-lock, and Marketplace
  // farm-ratio. STRUCTURE_REJECTED remains authoritative; this never blocks
  // a click, it only colors the ghost.
  //
  // Gold affordability IS previewed now (the old KNOWN GAP): the player tuple
  // carries `gold` (server/net/encode.js), so an unaffordable placement colors
  // the ghost red instead of lying green until the server rejects it.
  _placementValidity(type, orient, gx, gy) {
    const { w, h } = footprint(type, orient)
    const hall = CONFIG.HALL
    const hallCx = (hall.gx + hall.w / 2) * TILE_SIZE, hallCy = (hall.gy + hall.h / 2) * TILE_SIZE
    const arcR2 = BALANCE.NO_BUILD_ARC_RADIUS_PX ** 2
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = gx + dx, ty = gy + dy
        if (tx < 0 || ty < 0 || tx >= TILES_W || ty >= TILES_H) return false
        if (tx >= hall.gx && tx < hall.gx + hall.w && ty >= hall.gy && ty < hall.gy + hall.h) return false
        if ((this.structuresCache || []).some(s => this._structureContains(s, tx, ty))) return false
        const cx = tx * TILE_SIZE + TILE_SIZE / 2, cy = ty * TILE_SIZE + TILE_SIZE / 2
        if ((cx - hallCx) ** 2 + (cy - hallCy) ** 2 < arcR2) return false
      }
    }

    // Element lock (mirrors structures.js's canPlaceElement): a human may
    // place their own element's special, or any BOT-controlled element's
    // special, never another human's.
    const lockedEl = SPECIAL_TYPE_ELEMENT[type]
    if (lockedEl && lockedEl !== net.element) {
      const owner = this._roster().find(p => p.element === lockedEl)
      if (!owner?.isBot) return false
    }

    // Marketplace farm-ratio (mirrors structures.js's placeStructure):
    // BALANCE.FARMS_PER_MARKETPLACE standing farms required per marketplace,
    // including the one about to be built.
    if (type === STRUCTURE_TYPES.MARKETPLACE) {
      const cache = this.structuresCache || []
      const farms = cache.filter(s => s.type === STRUCTURE_TYPES.FARM).length
      const marketplaces = cache.filter(s => s.type === STRUCTURE_TYPES.MARKETPLACE).length
      const required = (marketplaces + 1) * BALANCE.FARMS_PER_MARKETPLACE
      if (farms < required) return false
    }

    // Gold (mirrors placeStructure's `insufficient-gold`, checked last there
    // too). Unknown balance (no snapshot yet) does NOT color the ghost red —
    // an unknown wallet is not a known-empty one; the server stays
    // authoritative either way.
    const gold = this._myGold()
    if (gold != null && gold < (BALANCE.STRUCTURES[type]?.cost ?? 0)) return false

    return true
  }

  // Own wallet off the latest snapshot's player tuple. null when no snapshot
  // has arrived yet or the local slot is absent from it.
  _myGold() {
    const me = (this.latest?.players || []).find(pl => pl.id === net.playerId)
    return me ? me.gold : null
  }

  _loadHudScale() {
    try {
      if (typeof localStorage === 'undefined') return HUD_SCALE_DEFAULT
      const raw = Number.parseFloat(localStorage.getItem(HUD_SCALE_STORAGE_KEY))
      if (!Number.isFinite(raw)) return HUD_SCALE_DEFAULT
      return Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, raw))
    } catch { return HUD_SCALE_DEFAULT }
  }

  // [ / ] step the HUD scale and persist it (same guarded-localStorage idiom
  // as audio.js's mute flag). Repositions the top-left text stack immediately
  // so line spacing never overlaps; the bottom-center ability bar and the new
  // status bars read this.hudScale live every frame, so they need no explicit
  // re-layout call here.
  _adjustHudScale(deltaSteps) {
    const next = Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN,
      Math.round((this.hudScale + deltaSteps * HUD_SCALE_STEP) * 100) / 100))
    if (next === this.hudScale) return
    this.hudScale = next
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(HUD_SCALE_STORAGE_KEY, String(next))
    } catch {}
    this._layoutHud()
  }

  // Recomputes font sizes and vertical stacking for the fixed top-left HUD
  // text and the player-HP/Hall-HP status bars from this.hudScale. Margin
  // stays an untouched 8px so the stack always starts in the same corner;
  // only the line spacing, glyph size and bar geometry grow with the scale.
  // The bars themselves are redrawn every frame in update() (they need the
  // live HP fraction anyway); this only fixes where that frame draw reads
  // its origin from — this._statusBarLayout.
  // THE UI UNIT. Every HUD/overlay size in this file is authored in CSS
  // pixels and must be multiplied by this to become logical pixels.
  //
  // hudScale used to be multiplied in directly, which quietly made it do TWO
  // jobs: compensating for the device AND expressing the player's size
  // preference. It cannot do both. Under Phaser.Scale.FIT the surface is a
  // fixed 1280x736 letterboxed into the device, so one logical pixel is about
  // 0.29 CSS pixels on a 375px phone -- and every site that used hudScale
  // alone therefore shipped the wrong physical size. Two reviews on
  // 2026-08-22 measured the damage: 7.6 CSS px ability buttons with their
  // labels off-screen, 8.8 CSS px fusion direction buttons on a timed
  // irreversible decision, a 6.4 CSS px Hall-HP bar on the target tablet.
  //
  // displayScale is the device compensation; hudScale is now a PURE
  // preference multiplier on top. On desktop displayScale is 1, so the
  // authored numbers are unchanged there -- this only fixes smaller devices.
  _uiUnit() {
    const ds = this.scale.displayScale?.x
    return (Number.isFinite(ds) && ds > 0 ? ds : 1) * this.hudScale
  }

  _layoutHud() {
    const s = this._uiUnit()
    const margin = 8
    this.hud.setFontSize(Math.round(15 * s))
    this.buildHud.setFontSize(Math.round(13 * s))
    this.fusionHud.setFontSize(Math.round(13 * s))
    this.playerHpText.setFontSize(Math.round(12 * s))
    this.hallHpText.setFontSize(Math.round(12 * s))
    this.overlay.setFontSize(Math.round(22 * s))
    // Stacked from each line's MEASURED height, not a fixed step: a wrapped
    // line is two or three rows tall and a fixed step would overlap it.
    let y = margin
    const step = (obj, min) => {
      obj.setPosition(margin, y)
      y += Math.max(obj.height, Math.round(min * s)) + Math.round(2 * s)
    }
    step(this.hud, 20)
    step(this.buildHud, 18)
    step(this.fusionHud, 18)
    // Wrapped and clamped. Font size is now displayScale-driven, so on a
    // narrow device these lines got PHYSICALLY larger in logical px and the
    // unwrapped strings ran past the surface -- 2020 logical px of a 1280
    // surface on a phone, clipping the gold readout and the touch hint. The
    // wave preview is pinned at width-198, so that is the usable right edge.
    const textLimit = Math.max(120, this.scale.width - margin - WAVE_PREVIEW_W)
    this.hud.setWordWrapWidth(textLimit)
    this.buildHud.setWordWrapWidth(textLimit)
    this.fusionHud.setWordWrapWidth(textLimit)
    // Bars are clamped too: at a high hudScale on a phone a 140px bar became
    // 1194 of 1280 logical px and pushed its own label off-screen.
    const barW = Math.round(Math.min(STATUS_BAR_W * s, this.scale.width * 0.35))
    const barH = Math.round(STATUS_BAR_H * s)
    const lineH = Math.round(18 * s)
    const textX = margin + barW + 8
    this.playerHpText.setPosition(textX, y)
    this.hallHpText.setPosition(textX, y + lineH)
    this._statusBarLayout = { x: margin, barW, barH, y1: y + Math.round(1 * s), y2: y + lineH + Math.round(1 * s) }
  }

  // Records which input scheme the player just used and returns true only when
  // that flipped desktop -> touch, which the caller treats as "this tap only
  // revealed the controls". Both schemes stay wired at all times: this picks
  // which one _sendInput reads and which controls/hints are shown, nothing
  // more, so a hybrid laptop-tablet can switch back and forth freely.
  _noteSchemeUsed(scheme) {
    if (scheme === this._inputScheme) return false
    this._inputScheme = scheme
    // Anything held under the old scheme is dropped rather than left latched.
    this.touch.releaseAll()
    if (scheme === 'desktop') return false
    this._layoutTouchControls()
    return true
  }

  // Touch geometry in the game's logical pixels. displayScale converts CSS
  // pixels to logical ones — under Scale.FIT the logical surface is a fixed
  // 1280x720 letterboxed into the device, so authoring the 44px touch-target
  // floor in logical units would make it ~13 real pixels on a phone.
  _layoutTouchControls() {
    this.touch.setLayout(layoutTouchControls({
      width: this.scale.width,
      height: this.scale.height,
      displayScale: this._displayScale(),
      hudScale: this.hudScale,
    }))
  }

  // The player roster, preferring what GAME_START delivered but falling back
  // to the copy network.js cached. A client whose GameScene was still in
  // Preload when the host pressed Start never receives GAME_START at all.
  _roster() {
    return (this.players && this.players.length) ? this.players : (net.roster || [])
  }

  _displayScale() {
    const ds = this.scale.displayScale?.x
    return Number.isFinite(ds) && ds > 0 ? ds : 1
  }

  // ONE source of truth for the bottom-centre ability bar's geometry, shared
  // by _drawAbilityBar (which renders it) and _layoutTouchControls (which has
  // to keep the sticks off it). Slot count is always 3 (abilityBar.js), so
  // this is computable before any snapshot exists.
  _abilityBarGeom() {
    const unit = this._displayScale()
    const pref = this.hudScale
    const touchMode = this._inputScheme === 'touch'
    // The floor is the plain 44px minimum on BOTH axes. Three 66px-wide slots
    // plus gaps need 210 CSS px and a 375px phone only has 185 between the two
    // sticks, so square-ish buttons fit and wide ones do not. The label is
    // shortened on touch to suit (see _drawAbilityBar).
    const floorW = touchMode ? TOUCH_MIN_TARGET_CSS_PX : 0
    const floorH = touchMode ? TOUCH_MIN_TARGET_CSS_PX : 0
    const gap = ABILITY_SLOT_GAP * pref * unit
    let slotW = Math.max(ABILITY_SLOT_W * pref, floorW) * unit
    const slotH = Math.max(ABILITY_SLOT_H * pref, floorH) * unit
    // The bar must fit the clear span the sticks left for it (layout.centerBand),
    // so it can never grow into a grab circle. Off touch, or before a layout
    // exists, it is only bounded by a share of the screen.
    const band = touchMode ? this.touch.layout?.centerBand : null
    const maxTotal = Math.min(
      this.scale.width * ABILITY_BAR_MAX_WIDTH_FRAC,
      band && band.w > 0 ? band.w : Infinity,
    )
    const maxSlotW = (maxTotal - 2 * gap) / 3
    // The 44px floor still wins if the two ever conflict on an absurd screen:
    // a cramped button beats an unreachable one. The geometry gate
    // (test/client/touchTargetGeometry.test.js) asserts they do not conflict
    // at any viewport we support.
    if (maxSlotW > 0) slotW = Math.max(Math.min(slotW, maxSlotW), floorW * unit)
    const totalW = 3 * slotW + 2 * gap
    return {
      slotW, slotH, gap, totalW,
      x0: (this.scale.width - totalW) / 2,
      y: this.scale.height - slotH - ABILITY_BAR_BOTTOM_MARGIN * pref * unit,
    }
  }

  // A pointerup the browser never delivered (alert, gesture cancel, lost
  // context) would leave a stick or ability button latched on. Once a frame,
  // drop any binding whose pointer the engine no longer reports as down.
  _reconcileTouchPointers() {
    const ids = this.touch.boundIds()
    if (!ids.length) return
    const pointers = this.input.manager?.pointers || []
    for (const id of ids) {
      const p = pointers.find(pt => pt.id === id)
      if (!p || !p.isDown) this.touch.pointerUp(id)
    }
  }

  // The three build-selection actions, shared by the number/R/arrow keys and
  // by the palette's buttons. One definition each: a touch-only or
  // keyboard-only copy is how the two schemes drift apart.
  _selectBuildType(type) {
    if (!BUILDABLE_TYPES.includes(type)) return
    this.selectedType = type
    this.selectedOrient = 'H'
    this.selectedDir = 'N'
    // A tile armed for the OLD structure must not stay armed, or the next tap
    // builds something the player did not pick. placementIntent's signature
    // check is the second guard on this; this is the first.
    this.placementIntent.reset()
    audio.playFx('ui_click')
  }

  _rotateSelection() {
    const { w, h } = footprint(this.selectedType, 'H')
    if (w === h) return // square footprint — rotation has no visible effect
    this.selectedOrient = this.selectedOrient === 'H' ? 'V' : 'H'
    this.placementIntent.reset()
    audio.playFx('rotate_structure')
  }

  _setOutputDir(dir) {
    if (!DIRECTIONAL_TYPES.includes(this.selectedType)) return
    if (!['N', 'E', 'S', 'W'].includes(dir)) return
    this.selectedDir = dir
    this.placementIntent.reset()
    audio.playFx('change_output_direction')
  }

  // Feeds the DOM palette. Type-level availability comes from the same numbers
  // the placement ghost uses, so a button greys out for exactly the reason the
  // ghost would have turned red — except the player is told which reason.
  _updatePalette() {
    if (!this.palette) return
    const phase = this.phaseInfo.phase
    // Hidden outside build, and hidden while a fusion proposal is waiting on
    // this player: that is a timed, permanent decision and it outranks the
    // palette, which also frees the screen for the panel.
    // Gated on a prompt AWAITING THIS PLAYER, not on any prompt existing.
    // _activeFusionPrompt falls back to fusionPrompts[0] for bystanders, so
    // gating on it hid the palette for every uninvolved player for the whole
    // 30s consent window -- a touch-only loss of build capability, since
    // desktop keeps its keyboard shortcuts throughout.
    const visible = phase === 'build' && !this._fusionAwaitsMe()
    const gold = this._myGold()
    const structures = this.structuresCache || []
    const costs = {}
    const types = {}
    for (const t of BUILDABLE_TYPES) costs[t] = BALANCE.STRUCTURES?.[t]?.cost
    for (const t of BUILDABLE_TYPES) {
      types[t] = typeAvailability(t, {
        gold, element: net.element, players: this._roster(), structures, costs,
        specialElement: SPECIAL_TYPE_ELEMENT,
        farmsPerMarketplace: BALANCE.FARMS_PER_MARKETPLACE,
      })
    }
    const fp = footprint(this.selectedType, 'H')
    this.palette.update({
      visible, gold, types,
      selectedType: this.selectedType,
      orient: this.selectedOrient,
      dir: this.selectedDir,
      showRotate: fp.w !== fp.h,
      showDir: DIRECTIONAL_TYPES.includes(this.selectedType),
      muted: audio.isMuted(),
      hudScale: this.hudScale,
      readied: !!this._readied,
    })
    // The menu reads the SAME scheme the rest of the scene does; a hybrid
    // device that flips mid-match rewrites the open panel in place. Cheap:
    // setScheme re-renders only when the value actually changes.
    this.menuPanel?.setScheme(this._inputScheme)
  }

  _selectStructure(id) {
    if (this.selectedStructureId !== id) audio.playFx('ui_click')
    this.selectedStructureId = id
    // Inspecting a building is not placing one: drop any armed tile so the
    // tap that dismisses this card cannot land as a build confirmation.
    this.placementIntent.reset()
  }

  // GAME_END rewrites phaseInfo.phase without a PHASE_CHANGE, so a card left
  // open there survived into the endgame; a click in that window emitted a
  // sell (server-rejected) and played the completion sound anyway.
  _dismissStructureCard() {
    this.selectedStructureId = null
    this._structureCardHit = null
  }

  // Inspect/sell card for the selected structure. Replaces the old
  // click-to-destroy: the sale now needs a deliberate second action on a
  // button that states the actual refund, and it works the same way on
  // desktop and touch.
  _drawStructureCard() {
    this.structureCardGfx.clear()
    this._structureCardHit = null
    this.structureCardText.setVisible(false)
    this.structureCardBtn.setVisible(false)
    this.structureCardClose.setVisible(false)
    // `== null`, NOT falsiness: structure ids start at 0, so a truthiness
    // check silently refused to ever show a card for the first structure
    // built in a match. Caught live, 2026-08-22.
    if (this.phaseInfo.phase !== 'build' || this.selectedStructureId == null) return
    const st = (this.structuresCache || []).find(x => x.id === this.selectedStructureId)
    // Destroyed by enemies, or sold by a teammate, while the card was open.
    if (!st) { this._dismissStructureCard(); return }

    const u = this._uiUnit()
    const minTarget = TOUCH_MIN_TARGET_CSS_PX * this._displayScale()
    // Stroke widths are in LOGICAL px, so a literal 1 or 2 renders at a third
    // of a CSS pixel on a phone -- a hairline nobody can see. Scale them, with
    // a 1 CSS px floor.
    const stroke = Math.max(2 * this._displayScale(), 1)
    const ds = this.structureStateById.get(st.id)
    const cost = BALANCE.STRUCTURES?.[st.type]?.cost ?? 0
    const refund = Math.ceil(cost * (BALANCE.SELL_REFUND_RATE ?? 0.65))
    // Fusions are permanent server-side (structures.js "unsellable"). Say so
    // on the card rather than letting the emit go and surfacing a reject.
    const sellable = !FUSION_TYPES.includes(st.type)
    const hp = ds?.hp != null ? `${Math.ceil(ds.hp)} HP` : ''
    this.structureCardText
      .setFontSize(Math.round(13 * u))
      .setText([st.type.replace(/_/g, ' '), hp].filter(Boolean).join('   '))
      .setVisible(true)

    const padIn = Math.round(10 * u)
    const btnH = Math.max(Math.round(30 * u), minTarget)
    const btnW = Math.max(Math.round(150 * u), minTarget)
    const w = Math.max(this.structureCardText.width + padIn * 2, btnW + padIn * 2)
    const h = padIn + this.structureCardText.height + Math.round(8 * u) + btnH + padIn

    // Anchored to the structure, then clamped fully on screen. The camera is
    // fixed and shows the whole map, so world and screen coords coincide.
    const { w: fw, h: fh } = footprint(st.type, st.orient || 'H')
    const sx = st.gx * TILE_SIZE + (fw * TILE_SIZE) / 2
    const sy = st.gy * TILE_SIZE + fh * TILE_SIZE
    const x = Math.min(Math.max(sx - w / 2, 4), this.scale.width - w - 4)
    // Prefer below the structure; FLIP above it when there is no room. Clamping
    // downward instead put the card on top of the very building it describes,
    // hiding it and the selection outline that identifies it.
    const gapPx = Math.round(6 * u)
    const below = sy + gapPx
    const y = (below + h + 4 <= this.scale.height)
      ? below
      : Math.max(4, st.gy * TILE_SIZE - gapPx - h)

    this.structureCardGfx.fillStyle(PANEL_BG.sellCard.color, PANEL_BG.sellCard.alpha).fillRect(x, y, w, h)
    this.structureCardGfx.lineStyle(stroke, TOUCH_EDGE, 1).strokeRect(x, y, w, h)
    // Highlight what is actually selected, so the card can never be read as
    // referring to the wrong building.
    this.structureCardGfx.lineStyle(stroke, TOUCH_EDGE, 1)
      .strokeRect(st.gx * TILE_SIZE, st.gy * TILE_SIZE, fw * TILE_SIZE, fh * TILE_SIZE)
    this.structureCardText.setPosition(x + padIn, y + padIn)

    const bx = x + (w - btnW) / 2
    const by = y + h - padIn - btnH
    this.structureCardGfx.fillStyle(
      sellable ? SELL_CARD_BUTTON_COLORS.sell.color : SELL_CARD_BUTTON_COLORS.permanent.color,
      sellable ? SELL_CARD_BUTTON_COLORS.sell.alpha : SELL_CARD_BUTTON_COLORS.permanent.alpha,
    ).fillRect(bx, by, btnW, btnH)
    this.structureCardGfx.lineStyle(stroke, TOUCH_EDGE, 0.9).strokeRect(bx, by, btnW, btnH)
    this.structureCardBtn
      .setFontSize(Math.round(13 * u))
      .setText(sellable ? `SELL  +${refund} gold` : 'PERMANENT')
      .setPosition(bx + btnW / 2, by + btnH / 2)
      .setVisible(true)

    // Explicit close control. Tapping outside the card falls through to the
    // board handler, which BUILDS -- so the intuitive "tap away to dismiss"
    // gesture spends gold and places a structure. This gives it a real target.
    const closeS = Math.max(Math.round(22 * u), minTarget)
    const closeX = x + w - closeS, closeY = y
    this.structureCardGfx.fillStyle(SELL_CARD_BUTTON_COLORS.close.color, SELL_CARD_BUTTON_COLORS.close.alpha).fillRect(closeX, closeY, closeS, closeS)
    this.structureCardGfx.lineStyle(stroke, TOUCH_EDGE, 0.9).strokeRect(closeX, closeY, closeS, closeS)
    this.structureCardClose
      .setFontSize(Math.round(15 * u))
      .setPosition(closeX + closeS / 2, closeY + closeS / 2)
      .setVisible(true)

    this._structureCardHit = {
      structureId: st.id, x, y, w, h,
      sell: sellable ? { x: bx, y: by, w: btnW, h: btnH } : null,
      close: { x: closeX, y: closeY, w: closeS, h: closeS },
    }
  }

  // Twin sticks + REPAIR. The ability buttons are deliberately NOT drawn here:
  // they ARE the bottom-center ability bar (_drawAbilityBar), which already
  // renders live cooldown fill — two widgets for one state would drift.
  _drawTouchControls() {
    this.touchGfx.clear()
    const show = this._inputScheme === 'touch'
    this.touchRepairLabel.setVisible(show)
    if (!show) return
    this._layoutTouchControls()
    const L = this.touch.layout
    // Stroke widths are LOGICAL px: a literal 2 is 0.59 CSS px on a phone, a
    // hairline nobody can see. Scaled, with a 1 CSS px floor.
    const stroke = Math.max(2 * this._displayScale(), 1)
    for (const kind of ['move', 'aim']) {
      const k = this.touch.knob(kind)
      // Opaque. The contrast gate measures these tokens at full opacity, so
      // drawing them at 0.55 alpha shipped 2.06:1 while the gate reported
      // 3.14:1 -- passing a test by measuring something other than what is
      // drawn, which is the same class of mistake as sizing in logical px.
      // 0.94, not 1: the idle plate at 0.92 cleared 3:1 by 0.0002 -- solved
      // for a real margin instead of the bare minimum (2026-08-23 gate
      // generalisation, which is now composite-aware and checks this alpha
      // for real).
      this.touchGfx.fillStyle(TOUCH_PLATE, k.active ? 1 : 0.95).fillCircle(k.baseX, k.baseY, k.radius)
      this.touchGfx.lineStyle(stroke, TOUCH_EDGE, 1).strokeCircle(k.baseX, k.baseY, k.radius)
      // Aim stick: the fire threshold is drawn, so the boundary between
      // "aiming" and "aiming and attacking" is visible rather than a number
      // the player has to discover (two-tier stick, 2026-08-22).
      if (kind === 'aim') {
        // WIDTH carries the state, not alpha: the idle and firing knob colours
        // are 1.08:1 in luminance, i.e. identical in greyscale, and the ring
        // is partly occluded by the thumb driving it.
        this.touchGfx.lineStyle(k.firing ? stroke * 2.5 : stroke, k.firing ? TOUCH_ACTIVE : TOUCH_EDGE, 1)
          .strokeCircle(k.baseX, k.baseY, k.fireRadius)
      }
      // State is carried by SIZE as well as colour: the idle and active knob
      // colours differ by only 1.06:1 in luminance, so colour alone failed
      // WCAG 1.4.1 (2026-08-22 design review).
      const grown = k.knobRadius * (k.firing ? 1.25 : 1)
      this.touchGfx.fillStyle(k.firing ? TOUCH_ACTIVE : TOUCH_KNOB, 1)
        .fillCircle(k.knobX, k.knobY, grown)
      this.touchGfx.lineStyle(stroke, TOUCH_EDGE, 1).strokeCircle(k.knobX, k.knobY, grown)
    }
    const r = L.repair
    const held = this.touch.held('repair')
    this.touchGfx.fillStyle(held ? TOUCH_ACTIVE : TOUCH_PLATE, 1).fillRect(r.x, r.y, r.w, r.h)
    this.touchGfx.lineStyle(held ? stroke * 2 : stroke, TOUCH_EDGE, 1).strokeRect(r.x, r.y, r.w, r.h)
    this.touchRepairLabel
      .setFontSize(Math.round(13 * (L.unit || 1)))
      // The label used to stay pale on the pale held fill (1.32:1), so the
      // word REPAIR became unreadable exactly while the button was engaged.
      .setColor(held ? TOUCH_ON_ACTIVE_TEXT : TOUCH_LABEL_TEXT)
      .setPosition(r.x + r.w / 2, r.y + r.h / 2)
  }

  // Live hitbox aura for an already-placed structure (2026-08-02). Same two
  // shapes the placement ghost already draws (marginPx -> rect around the
  // footprint, rangePx/radiusPx -> circle from center), just persisted for
  // every standing structure instead of only the hovered ghost, and colored
  // by the structure's OWN theme color (STRUCTURE_COLORS) rather than a
  // validity green/red — there is nothing to validate once it's built.
  //
  // Deliberately scoped to PERSISTENT reach, not burst/proc radii: `aoe`
  // (Firepit), `confusion` (Steam Vent's cloudMarginPx), `aura` (Snare Post's
  // radiusPx) and plain `rangePx` (Watchtower, Firestorm's volley) are all
  // standing threats the whole time the structure exists. Magma Trap's
  // eruption.radiusPx and any ability radiusPx are one-shot procs with their
  // own event-driven telegraph (_drawArcTelegraph / _drawWindTelegraph) —
  // drawing those as a static aura would misrepresent a burst as an always-on
  // zone.
  _drawStructureAura(s, cx, cy, w, h) {
    const cfg = BALANCE.TOWER?.[s.type]
    if (!cfg) return
    const color = STRUCTURE_COLORS[s.type] ?? 0x888888
    const dispW = w * TILE_SIZE, dispH = h * TILE_SIZE
    const margin = cfg.marginPx ?? (cfg.scaldField ? cfg.cloudMarginPx : null)
    if (margin != null) {
      this.structureAuraGfx.fillStyle(color, 0.12).fillRect(
        cx - dispW / 2 - margin, cy - dispH / 2 - margin,
        dispW + margin * 2, dispH + margin * 2,
      )
    } else if (cfg.rangePx || (cfg.aura && cfg.radiusPx)) {
      const r = cfg.rangePx ?? cfg.radiusPx
      this.structureAuraGfx.fillStyle(color, 0.10).fillCircle(cx, cy, r)
      this.structureAuraGfx.lineStyle(1, color, 0.4).strokeCircle(cx, cy, r)
    }
  }

  // Placement ghost (Task 9): footprint outline (validity-colored), the
  // chosen direction arrow for a directional type, and a range/area preview
  // — read entirely off the current hover tile and this.selected{Type,
  // Orient,Dir}, so it stays in sync with the rotate/direction controls
  // without any extra state.
  // Dashed rect on ghostGfx: Phaser's Graphics has no native dash support, so
  // this walks the perimeter in short on/off segments. Used ONLY for the
  // invalid placement ghost, so a dashed outline reads as "no" independent of
  // the colour behind it (2026-08-23 contrast review).
  _strokeDashedRect(x, y, w, h, color, lineWidth, dash = 8, gap = 5, alpha = 1) {
    // Full opacity by default: at 0.95 the solved invalid colour dropped back
    // under 3:1 (2.90:1) -- same composite-alpha lesson as the valid outline.
    this.ghostGfx.lineStyle(lineWidth, color, alpha)
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = corners[i], [x2, y2] = corners[i + 1]
      const len = Math.hypot(x2 - x1, y2 - y1)
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len
      let d = 0
      while (d < len) {
        const segEnd = Math.min(d + dash, len)
        this.ghostGfx.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * segEnd, y1 + uy * segEnd)
        d += dash + gap
      }
    }
  }

  _drawPlacementGhost() {
    this.ghostGfx.clear()
    if (this.phaseInfo.phase !== 'build') { this._placementValidPrev = null; return }
    // On touch, activePointer is simply the most RECENTLY active pointer --
    // which, while you are walking, is the thumb on the movement stick. The
    // ghost used to jump to whatever tile sat under that thumb in the bottom
    // corner, and the valid/invalid hover cue fired on every tile it crossed
    // (2026-08-22 design review). Touch therefore tracks the last board
    // position the player actually touched; desktop keeps live mouse hover.
    const pointer = this._inputScheme === 'touch' ? this._boardPointer : this.input.activePointer
    if (!pointer || pointer.worldX == null) { this._placementValidPrev = null; return }
    const gx = Math.floor(pointer.worldX / TILE_SIZE)
    const gy = Math.floor(pointer.worldY / TILE_SIZE)
    if (gx < 0 || gy < 0 || gx >= TILES_W || gy >= TILES_H) { this._placementValidPrev = null; return }

    const type = this.selectedType, orient = this.selectedOrient
    const { w, h } = footprint(type, orient)
    const cx = gx * TILE_SIZE + (w * TILE_SIZE) / 2, cy = gy * TILE_SIZE + (h * TILE_SIZE) / 2
    const dispW = w * TILE_SIZE, dispH = h * TILE_SIZE
    // Hovering an EXISTING structure is not an invalid placement, it is an
    // inspect target. Painting it red said "this will do nothing" and then a
    // click destroyed the building (2026-08-22 design review). Draw the
    // inspect highlight instead and leave the validity cue out of it.
    const over = (this.structuresCache || []).find(st => this._structureContains(st, gx, gy))
    if (over) {
      this._placementValidPrev = null
      const { w: fw, h: fh } = footprint(over.type, over.orient || 'H')
      this.ghostGfx.lineStyle(2, TOUCH_EDGE, 0.9)
        .strokeRect(over.gx * TILE_SIZE, over.gy * TILE_SIZE, fw * TILE_SIZE, fh * TILE_SIZE)
      return
    }
    const valid = this._placementValidity(type, orient, gx, gy)
    if (valid !== this._placementValidPrev) {
      this._placementValidPrev = valid
      audio.playFx(valid ? 'placement_valid' : 'placement_invalid')
    }
    // Colours are lifted to clear 3:1 (see theme.js PLACEMENT_GHOST_COLORS),
    // but at those lightnesses the two land close together — the ground is
    // warm and mid-value, so ANY hue needs real lightness to pass. Colour
    // therefore is NOT the only signal: valid draws a solid outline, invalid
    // a heavier DASHED outline plus a small X at the footprint centre.
    const color = valid ? PLACEMENT_GHOST_COLORS.valid : PLACEMENT_GHOST_COLORS.invalid

    // Range/area preview drawn BEHIND the footprint outline.
    const cfg = BALANCE.TOWER?.[type]
    if (cfg?.aoe && cfg.marginPx) {
      this.ghostGfx.fillStyle(color, 0.12).fillRect(
        cx - dispW / 2 - cfg.marginPx, cy - dispH / 2 - cfg.marginPx,
        dispW + cfg.marginPx * 2, dispH + cfg.marginPx * 2,
      )
    } else if (cfg?.rangePx) {
      this.ghostGfx.fillStyle(color, 0.10).fillCircle(cx, cy, cfg.rangePx)
      this.ghostGfx.lineStyle(1, color, 0.5).strokeCircle(cx, cy, cfg.rangePx)
    }

    const left = cx - dispW / 2, top = cy - dispH / 2
    this.ghostGfx.fillStyle(color, 0.28).fillRect(left, top, dispW, dispH)
    if (valid) {
      // Full opacity: this is the legibility-critical outline, not a wash. At
      // 0.9 alpha the solved colour (theme.js PLACEMENT_GHOST_COLORS) dropped
      // back under 3:1 (2.75:1) -- the same composite-alpha bug the gate
      // generalisation exists to catch, caught here before it shipped.
      this.ghostGfx.lineStyle(2, color, 1).strokeRect(left, top, dispW, dispH)
    } else {
      this._strokeDashedRect(left, top, dispW, dispH, color, 3, 8, 5)
      // Small X at the footprint centre — the ONE mark on the board that
      // reads as "no" independent of colour or line style.
      const half = Math.min(dispW, dispH) * 0.14
      this.ghostGfx.lineStyle(3, color, 1)
        .lineBetween(cx - half, cy - half, cx + half, cy + half)
        .lineBetween(cx - half, cy + half, cx + half, cy - half)
    }

    // ARMED (touch arm-then-confirm): corner brackets around the footprint.
    // Deliberately a shape, not a colour or an alpha change -- the ghost is
    // already carrying valid/invalid in both colour AND line style, so a
    // third meaning stacked onto either of those would be unreadable. The
    // brackets are the same in the valid and invalid case; they answer "is
    // this tile waiting for me", not "may I build here".
    if (this._inputScheme === 'touch' && this.placementIntent.isArmedAt(gx, gy)) {
      const arm = Math.min(dispW, dispH) * 0.3
      const off = 5
      const l = left - off, t = top - off, r = left + dispW + off, b = top + dispH + off
      this.ghostGfx.lineStyle(4, color, 1)
        .lineBetween(l, t, l + arm, t).lineBetween(l, t, l, t + arm)
        .lineBetween(r, t, r - arm, t).lineBetween(r, t, r, t + arm)
        .lineBetween(l, b, l + arm, b).lineBetween(l, b, l, b - arm)
        .lineBetween(r, b, r - arm, b).lineBetween(r, b, r, b - arm)
    }

    if (DIRECTIONAL_TYPES.includes(type)) {
      const [vx, vy] = DIRECTION_VECTOR[this.selectedDir]
      const len = Math.min(dispW, dispH) / 2 + 10
      this.ghostGfx.lineStyle(2, 0xfff2b0, 0.9).lineBetween(cx, cy, cx + vx * len, cy + vy * len)
      this.ghostGfx.fillStyle(0xfff2b0, 0.9).fillCircle(cx + vx * len, cy + vy * len, 3)
    }
  }

  // True while this client is one of the players `p` is still waiting on.
  // Everyone in the room SEES a proposal (it changes the board); only
  // requiredIds can answer it.
  _fusionAwaitsMe(p) {
    return !!p && p.requiredIds.includes(net.playerId) && !p.consentedIds.includes(net.playerId)
  }

  // The proposal the keys act on: the oldest one still waiting on this client,
  // or failing that the oldest pending one (which is display-only).
  _activeFusionPrompt() {
    return this.fusionPrompts.find(p => this._fusionAwaitsMe(p)) || this.fusionPrompts[0] || null
  }

  // Shared by the Y/N keys and the on-screen accept/reject buttons, so
  // keyboard and pointer input can never disagree about what's legal to send.
  _respondFusion(prompt, accept) {
    const initiator = prompt.initiatorId === net.playerId
    // A teammate cannot consent to a directional fusion whose cardinal the
    // proposer has not chosen yet — the server refuses it, so don't send it.
    const dirPending = prompt.needsDirection && prompt.dir == null && !initiator
    if (!this._fusionAwaitsMe(prompt) || dirPending) return
    net.emit(EVENTS.RESPOND_FUSION, {
      proposalId: prompt.id,
      accept,
      // Only the initiator may set a directional fusion's cardinal, and
      // only in their own accept — it locks permanently there.
      dir: accept && prompt.needsDirection && initiator ? this.fusionDir : undefined,
    })
    audio.playFx('ui_click')
  }

  // Shared by the arrow keys and the on-screen direction buttons — sets the
  // LOCAL cardinal the initiator is currently aiming, sent only once they
  // accept (see _respondFusion).
  _setFusionDir(dir) {
    this.fusionDir = dir
    audio.playFx('ui_click')
  }

  // Positions one fusion-panel button's label and records its screen-space
  // hit box in this._fusionButtonRects[key] for the pointerdown handler
  // below. The chrome (fill/stroke rect) is drawn afterwards, once the
  // panel's own bounds are known — see the two-pass layout in
  // _drawFusionPrompt. Shared by ACCEPT/REJECT and the four N/E/S/W
  // direction buttons so touch and mouse click exactly what they see.
  _layoutFusionButton(key, label, x, y, w, h) {
    label.setPosition(x + w / 2, y + h / 2).setVisible(true)
    this._fusionButtonRects[key] = { x, y, w, h }
  }

  _hideFusionButtons() {
    for (const label of Object.values(this.fusionButtonLabels)) label.setVisible(false)
    this._fusionButtonRects = {}
  }

  // Preview + accept/reject/expiry UI for pending fusions (Task 13). EVERY
  // pending proposal's 2x2 is outlined on the board; the prompt line names both
  // ingredients and the resulting fusion — the confirm step Amendment A1.2
  // requires. Permanence is stated in the prompt because it cannot be undone:
  // no sale, no unfuse, and destruction never returns the ingredients.
  //
  // The prompt is TIMED and was previously answerable only via the Y/N keys
  // (docs/handoffs/2026-08-19) — a touch player could not respond to a fusion
  // at all. It now renders as a centered, unmissable panel with clickable
  // ACCEPT/REJECT (and, for a directional fusion's initiator, N/E/S/W)
  // buttons that call the exact same _respondFusion/_setFusionDir helpers
  // the keyboard path uses, so the two input methods can never disagree.
  _drawFusionPrompt() {
    this.fusionGfx.clear()
    this.fusionPanelGfx.clear()
    const active = this._activeFusionPrompt()
    if (!active) {
      this.fusionHud.setText(this.fusionMessage)
      this.fusionPromptText.setText('')
      this._hideFusionButtons()
      this._fusionPanelHit = null
      return
    }

    for (const p of this.fusionPrompts) {
      // Display-only countdown; the server's own expiry is authoritative.
      p.remainingMs = Math.max(0, p.remainingMs - this.game.loop.delta)
      const x = p.gx * TILE_SIZE, y = p.gy * TILE_SIZE, size = 2 * TILE_SIZE
      const alpha = p === active ? 1 : 0.45
      this.fusionGfx.fillStyle(0xffd27a, 0.14 * alpha).fillRect(x, y, size, size)
      this.fusionGfx.lineStyle(2, 0xffd27a, 0.9 * alpha).strokeRect(x, y, size, size)
    }

    const [a, b] = active.ingredients
    const mine = this._fusionAwaitsMe(active)
    const isInitiator = active.initiatorId === net.playerId
    const queued = this.fusionPrompts.length > 1 ? `  (+${this.fusionPrompts.length - 1} more)` : ''

    // Bystanders (not among requiredIds at all — a teammate who can't answer
    // this proposal) get the old compact top-left line only. A full-screen
    // panel with no buttons they can press would just obstruct their own
    // play; the world-space 2x2 outline above already tells everyone a
    // fusion is pending (2026-08-22 review, finding 5).
    const involved = active.requiredIds.includes(net.playerId)
    if (!involved) {
      this.fusionPromptText.setText('')
      this._hideFusionButtons()
      this._fusionPanelHit = null
      this.fusionHud.setText(
        `FUSE ${a.type} + ${b.type} → ${active.comboType}   ` +
        `waiting on ${active.requiredIds.length - active.consentedIds.length} teammate(s)   ` +
        `${Math.ceil(active.remainingMs / 1000)}s${queued}`,
      )
      return
    }
    // The panel supersedes the compact top-left line while a prompt directly
    // concerns this player; the top-left line comes back for the
    // post-decision outcome banner.
    this.fusionHud.setText('')

    // A directional fusion shows the cardinal being agreed to: the initiator
    // aims it (arrow keys or the N/E/S/W buttons), everyone else sees the
    // locked value once the initiator accepts.
    const dirPending = active.needsDirection && active.dir == null && !isInitiator
    const showDirButtons = active.needsDirection && active.dir == null && isInitiator
    const showAcceptReject = mine && !dirPending
    const dirHint = !active.needsDirection ? ''
      : active.dir != null ? `  facing ${active.dir}`
      : isInitiator ? `  facing: ${this.fusionDir} — choose below, then accept`
      : '  facing: awaiting the proposer'
    const action = !mine ? `waiting on ${active.requiredIds.length - active.consentedIds.length} teammate(s)`
      : dirPending ? 'waiting on the proposer to choose a direction' : ''

    const s = this._uiUnit()
    const cx = this.scale.width / 2
    const panelTop = Math.round(80 * s)
    const textTop = panelTop + Math.round(14 * s)
    this.fusionPromptText.setFontSize(Math.round(15 * s))
      .setWordWrapWidth(Math.round(this.scale.width * 0.8))
      .setPosition(cx, textTop)
    this.fusionPromptText.setText(
      `FUSE ${a.type} + ${b.type} → ${active.comboType} (permanent, team-owned)${dirHint}\n` +
      `${action}${action ? '   ' : ''}${Math.ceil(active.remainingMs / 1000)}s${queued}`,
    )

    this._fusionButtonRects = {}
    // Bug fix (2026-08-22 review, finding 3): this must add the SAME 14*s
    // offset the text's own y-position used above, or the button row creeps
    // up under the last text line as hudScale grows.
    let btnY = textTop + this.fusionPromptText.height + Math.round(20 * s)
    if (showDirButtons) {
      const dw = Math.round(30 * s), gap = Math.round(8 * s)
      const dirs = ['N', 'E', 'S', 'W']
      const totalW = dirs.length * dw + (dirs.length - 1) * gap
      let dx = cx - totalW / 2
      for (const d of dirs) {
        this._layoutFusionButton(d, this.fusionButtonLabels[d], dx, btnY, dw, dw)
        dx += dw + gap
      }
      btnY += dw + Math.round(16 * s)
    } else {
      this.fusionButtonLabels.N.setVisible(false)
      this.fusionButtonLabels.E.setVisible(false)
      this.fusionButtonLabels.S.setVisible(false)
      this.fusionButtonLabels.W.setVisible(false)
    }
    if (showAcceptReject) {
      const bw = Math.round(120 * s), bh = Math.round(36 * s), gap = Math.round(16 * s)
      const totalW = bw * 2 + gap
      this._layoutFusionButton('accept', this.fusionButtonLabels.accept, cx - totalW / 2, btnY, bw, bh)
      this._layoutFusionButton('reject', this.fusionButtonLabels.reject, cx + gap / 2, btnY, bw, bh)
      btnY += bh
    } else {
      this.fusionButtonLabels.accept.setVisible(false)
      this.fusionButtonLabels.reject.setVisible(false)
    }
    // Panel background sized after the text/buttons above so it always fully
    // encloses them regardless of hudScale or message length, THEN button
    // chrome drawn on top from the rects just laid out — graphics draw in
    // call order, so the fill must come before anything meant to sit on it.
    const bottomY = btnY + Math.round(10 * s)
    // Clamped to the screen width (2026-08-22 review, finding 4): without
    // this a long wrapped message at a high hudScale could push panelW past
    // the canvas edge and bleed off both sides.
    const panelW = Math.min(
      Math.max(this.fusionPromptText.width + Math.round(40 * s), Math.round(360 * s)),
      this.scale.width - Math.round(16 * s),
    )
    const panelX = cx - panelW / 2, panelYTop = panelTop - Math.round(10 * s)
    this.fusionPanelGfx.fillStyle(PANEL_BG.fusion.color, PANEL_BG.fusion.alpha).fillRect(panelX, panelYTop, panelW, bottomY - panelYTop)
    this.fusionPanelGfx.lineStyle(2, 0xffd27a, 0.9).strokeRect(panelX, panelYTop, panelW, bottomY - panelYTop)
    for (const [key, r] of Object.entries(this._fusionButtonRects)) {
      const label = this.fusionButtonLabels[key]
      const isDir = key.length === 1
      const isActiveDir = isDir && this.fusionDir === key
      this.fusionPanelGfx.fillStyle(
        key === 'accept' ? FUSION_BUTTON_COLORS.accept.color
          : key === 'reject' ? FUSION_BUTTON_COLORS.reject.color
          : isActiveDir ? FUSION_BUTTON_COLORS.dirActive.color : FUSION_BUTTON_COLORS.dirInactive.color,
        isDir && !isActiveDir ? FUSION_BUTTON_COLORS.dirInactive.alpha : FUSION_BUTTON_COLORS.accept.alpha,
      ).fillRect(r.x, r.y, r.w, r.h)
      this.fusionPanelGfx.lineStyle(1, 0xffffff, 0.35).strokeRect(r.x, r.y, r.w, r.h)
      label.setPosition(r.x + r.w / 2, r.y + r.h / 2)
    }
    // See the pointerdown handler above: any click inside these bounds is
    // swallowed, and a button hit only acts if this promptId is still active.
    this._fusionPanelHit = { promptId: active.id, x: panelX, y: panelYTop, w: panelW, h: bottomY - panelYTop }
  }

  // Browsers require a user gesture before audio can play; the first
  // key/click of a session both boots Howler and resumes its AudioContext.
  _unlockAudio() {
    if (this._audioUnlocked) return
    this._audioUnlocked = true
    audio.init()
    audio.unlock()
    // Start the music bed from the phase we are ACTUALLY in, rather than
    // relying on _onGameStart having been the one to set the scene
    // (2026-08-22). A client whose GameScene was still in Preload when the
    // host pressed Start never receives GAME_START, and before this the music
    // then stayed silent until the next PHASE_CHANGE -- often the whole first
    // build phase, sometimes the entire match. This runs on the first gesture,
    // which is the earliest moment any audio can legally play anyway.
    if (this.latest) audio.music.reconcileFromPhase(this.phaseInfo.phase, this.phaseInfo.wave)
  }

  _wireEvents() {
    net.on(EVENTS.GAME_START, (p) => this._onGameStart(p))
    net.on(EVENTS.STATE_UPDATE, (p) => this._onSnapshot(p.snapshot))
    net.on(EVENTS.PHASE_CHANGE, (p) => {
      const prevPhase = this.phaseInfo.phase
      const leavingBuild = prevPhase === 'build' && p.phase !== 'build'
      const enteringFight = prevPhase !== 'fight' && p.phase === 'fight'
      const enteringWaveEnd = prevPhase !== 'waveEnd' && p.phase === 'waveEnd'
      this.phaseInfo = p
      // Ready is a per-build-phase intent, cleared whenever the phase turns
      // over (the behaviour the standalone Ready button used to have). Also
      // drop any structure selection: its card would be stale and selling is
      // build-phase only anyway.
      if (p.phase !== 'build') {
        this._readied = false
        this._dismissStructureCard()
        this.placementIntent.reset()
      }
      this.gridGfx.setVisible(p.phase === 'build')
      audio.music.reconcileFromPhase(p.phase, p.wave)
      if (leavingBuild) audio.playFx('build_locked')
      if (enteringFight) { audio.playFx('wave_start'); audio.playFx('attack_phase_started') }
      if (enteringWaveEnd) audio.playFx('wave_cleared')
    })
    net.on(EVENTS.LEVEL_UP, (p) => this._onLevelUp(p))
    net.on(EVENTS.GAME_END, (p) => {
      this.phaseInfo = { ...this.phaseInfo, phase: p.outcome }
      this._dismissStructureCard()
      this.placementIntent.reset()
      audio.playFx(p.outcome === 'won' ? 'victory' : 'defeat')
      audio.music.playOutcome(p.outcome === 'won' ? 'victory' : 'defeat')
    })
    net.on(EVENTS.FUSION_PROPOSED, (p) => {
      if (this.fusionPrompts.some(q => q.id === p.id)) return
      this.fusionPrompts.push({ ...p })
      this.fusionMessage = ''
      audio.playFx('fusion_proposed')
    })
    net.on(EVENTS.FUSION_UPDATED, (p) => {
      const prompt = this.fusionPrompts.find(q => q.id === p.proposalId)
      if (!prompt) return
      if (!prompt.consentedIds.includes(p.consentedId)) {
        prompt.consentedIds.push(p.consentedId)
        audio.playFx('fusion_accepted')
      }
      if (p.dir != null) prompt.dir = p.dir
    })
    net.on(EVENTS.FUSION_RESOLVED, (p) => {
      const before = this.fusionPrompts.length
      this.fusionPrompts = this.fusionPrompts.filter(q => q.id !== p.proposalId)
      if (this.fusionPrompts.length === before) return   // not one we were showing
      audio.playFx(p.outcome === 'fused' ? 'fusion_created' : 'fusion_rejected_or_expired')
      this.fusionMessage = p.outcome === 'fused'
        ? `${p.comboType} formed — permanent, team-owned`
        : `fusion ${p.outcome}`
      this.time.delayedCall(2500, () => { this.fusionMessage = '' })
    })
    net.on(EVENTS.STRUCTURE_REJECTED, (p) => {
      this.rejectMessage = `${p.action} rejected: ${p.reason}`
      this.time.delayedCall(2500, () => { if (this.rejectMessage === `${p.action} rejected: ${p.reason}`) this.rejectMessage = '' })
    })
  }

  _onGameStart(p) {
    // A GAME_START always means the world on screen is gone and a different
    // one has arrived -- first start, mid-match join, reconnect, and now a
    // RESTART_MATCH. Everything below is scoped to the run that just ended, so
    // carrying it over would show a fusion offer, a rejection message or a
    // ready flag belonging to a match that no longer exists.
    this.fusionPrompts = []
    this.fusionMessage = ''
    this.rejectMessage = ''
    this._readied = false
    this._dismissStructureCard()
    this.placementIntent.reset()
    this.snapBuf.reset()
    this.latest = decodeSnapshot(p.snapshot)
    this.snapBuf.push(this.latest, performance.now())
    this.phaseInfo = { phase: p.phase, wave: p.wave, tally: null }
    this.gridGfx.setVisible(p.phase === 'build')
    this.players = p.players || net.roster || []
    this.structuresCache = this.latest.structures || []
    this._syncStructureState(this.latest.structureState)
    audio.music.setScene('match')
    audio.music.reconcileFromPhase(p.phase, p.wave)
  }

  _onSnapshot(raw) {
    this.latest = decodeSnapshot(raw)
    if (this.latest.structures) this.structuresCache = this.latest.structures
    this._syncStructureState(this.latest.structureState)
    this.snapBuf.push(this.latest, performance.now())
    // fx ride each snapshot exactly once — play them on arrival, not per frame.
    for (const f of this.latest.fx) this._playFx(f)
    audio.consumeServerFx(this.latest.fx)
    // Attack presentation events (Task 7) — authoritative shapes, same
    // arrive-once-per-emit treatment as fx. The local player's own cast
    // already got an immediate cosmetic telegraph in _sendInput; this is
    // what actually happened server-side (and what every OTHER player's
    // cast looks like, since only the caster gets the local prediction).
    for (const a of (this.latest.atk || [])) this._playAtk(a)
  }

  // Dynamic structure state (Task 8) rides every snapshot regardless of
  // placedVersion, so hp/phase/charge/cycle never go stale between static
  // resends — rebuild the map fresh each emit (ds always lists every
  // currently-live structure, so a rebuild is also how a destroyed
  // structure's stale entry disappears).
  _syncStructureState(structureState) {
    this.structureStateById.clear()
    for (const ds of (structureState || [])) this.structureStateById.set(ds.id, ds)
  }

  _onLevelUp({ level }) {
    audio.playFx('level_up')
    this.levelBanner = `LEVEL ${level}!` + (level === 2 ? ' diagonal combos unlocked'
      : level === 3 ? ' specials empowered' : level === 4 ? ' second abilities unlocked' : '')
    this.time.delayedCall(3500, () => { this.levelBanner = '' })
  }

  // Transient fx: floating combat text for damage numbers, small flashes for
  // impacts/casts. Server caps fx per type per emit, so this stays bounded.
  _playFx(f) {
    switch (f.type) {
      case 'dmg': case 'pdmg': {
        const color = f.type === 'pdmg' ? '#ff7a7a' : '#ffe08a'
        this._floatText({ x: f.x, y: f.y - 12, text: `${f.v}`, color, size: 12, rise: 22, duration: 650 })
        break
      }
      case 'boom': case 'ability': case 'ability2': {
        const ring = this.fxRingPool.acquire({
          x: f.x, y: f.y, color: f.type === 'boom' ? 0xff8a3a : 0x9fd1e8,
        })
        if (!ring) break
        this.tweens.add({
          targets: ring, radius: 34, alpha: 0, duration: 350,
          onComplete: () => this.fxRingPool.release(ring),
        })
        break
      }
      case 'downed': case 'revived': case 'respawn': {
        const label = f.type === 'downed' ? 'DOWN!' : f.type === 'revived' ? 'REVIVED' : 'BACK'
        this._floatText({ x: f.x, y: f.y - 24, text: label, color: '#ffb0b0', size: 13, rise: 24, duration: 900 })
        break
      }
      default: break  // swing/projSpawn etc. — audio hooks in Phase 7
    }
  }

  // Pooled rising-and-fading label, shared by damage numbers and the
  // down/revive/respawn callouts. Silently skipped when the pool is at its
  // cap (see FX_TEXT_CAP).
  _floatText({ x, y, text, color, size, rise, duration }) {
    const txt = this.fxTextPool.acquire({ x, y, text, color, size })
    if (!txt) return
    this.tweens.add({
      targets: txt, y: y - rise, alpha: 0, duration,
      onComplete: () => this.fxTextPool.release(txt),
    })
  }

  // Scene teardown: pools own real GameObjects and animators own playback
  // state, so both are released with the scene rather than leaked into a
  // restarted match.
  _teardownRenderState() {
    this.fxTextPool?.destroy()
    this.fxRingPool?.destroy()
    for (const spr of this.attackFx) spr.destroy()
    this.attackFx.clear()
    for (const anim of this.playerAnim.values()) anim.destroy()
    for (const entry of this.structureGfx.values()) entry.anim?.destroy()
    // Sustained sounds are the one piece of audio state that outlives its
    // trigger if nobody stops it — a match left mid-repair would otherwise
    // keep looping into the lobby.
    audio.stopAllLoops()
  }

  // Spawns a one-shot atlas sprite at (x, y) and plays `states` back to back
  // (each `${atlasKey}_${state}` — undirected FX atlases only, per
  // Preload.buildAnimsForAtlas's non-directional frame naming), destroying
  // itself when the chain finishes. A state the atlas never authored is
  // skipped rather than stalling the chain. No-ops when the atlas failed to
  // load (client/src/assets/manifest.js entry present, texture missing) or
  // the concurrent-instance cap is already at its ceiling.
  //
  // `atlasKey` may also name a plain static IMAGES entry with no animation
  // at all (e.g. 'fireball', reused here as Fire's basic-attack FX since no
  // dedicated Fire basic-FX atlas was ever produced) — detected by none of
  // `states` having a built anim, in which case the sprite just holds
  // briefly and fades rather than trying to chain through states that don't
  // exist.
  //
  // `sfxByState` (optional, e.g. `{ impact: 'stone_impact' }`) plays a
  // logical sound the instant that state's animation actually starts —
  // giving the element-specific "impact" sfx real separation from the cast
  // sfx played at the caller's trigger point, rather than firing both at
  // attack-start where Earth/Water/Fire's same-tick resolution (Amendment
  // A6) would stack them on top of the generic 'enemy_hit' sound too.
  _spawnAttackFx(atlasKey, x, y, states = ['flight', 'impact', 'dissipation'], sfxByState = null, rotation = 0) {
    if (!this.textures.exists(atlasKey) || this.attackFx.size >= FX_ATTACK_CAP) return null
    const spr = this.add.sprite(x, y, atlasKey).setDepth(650).setRotation(rotation)
    this.attackFx.add(spr)
    if (!states.some((s) => this._hasAnim(`${atlasKey}_${s}`))) {
      this.tweens.add({
        targets: spr, alpha: 0, delay: 120, duration: 180,
        onComplete: () => { this.attackFx.delete(spr); spr.destroy() },
      })
      return spr
    }
    let i = 0
    const playNext = () => {
      while (i < states.length && !this._hasAnim(`${atlasKey}_${states[i]}`)) i++
      if (i >= states.length) { this.attackFx.delete(spr); spr.destroy(); return }
      spr.play(`${atlasKey}_${states[i]}`)
      if (sfxByState?.[states[i]]) audio.playFx(sfxByState[states[i]])
      i++
    }
    spr.on('animationcomplete', playNext)
    playNext()
    return spr
  }

  // Draws the EXACT class basic-attack shape from an atk event (Task 7):
  // Earth's true 90-degree cone at its true rangePx, Water's wide short-
  // range "contact area", Fire's narrow longer "reach", Wind's wind-up
  // telegraph. Called both for server-authoritative atk events (arrival in
  // _onSnapshot) and, with a synthetic { kind, x, y, aimX, aimY } object,
  // for the local player's own immediate cosmetic feedback (_sendInput).
  // The one CharacterAnimator for a player, created on first sight. The atlas
  // key is the element's baked chibi variant; while the manifest is empty the
  // animator still runs its state machine but drives nothing (placeholder
  // shapes have no .play()), so this costs nothing before art lands.
  _animFor(playerId) {
    let anim = this.playerAnim.get(playerId)
    if (!anim) {
      const element = (this.players || []).find(pp => pp.id === playerId)?.element
      anim = new CharacterAnimator({ atlasKey: ELEMENT_ATLAS_KEY[element] ?? null })
      this.playerAnim.set(playerId, anim)
    }
    return anim
  }

  // One StructureAnimator per placed structure. The behavior family comes
  // from the same BALANCE.TOWER spec the server dispatches on, and the locked
  // cardinal (Water Geyser / Wind Vortex) selects the directional variant.
  _structureAnimator(s) {
    return new StructureAnimator({
      atlasKey: structureArtKey(s.type),
      spec: BALANCE.TOWER[s.type],
      dir: s.dir ?? null,
      activeMs: STRUCTURE_ACTIVE_MS,
    })
  }

  _playAtk(a) {
    // Server-confirmed casts drive the caster's animation; the local player's
    // synthetic feedback object carries no srcId/seq, so the hero's own cast
    // animation stays server-owned even though its telegraph is predicted.
    // SPECIAL_CAST (any element's Q/E, server/game/abilities.js) drives the
    // separate SPECIAL state/timer instead of CAST — see AnimationController
    // .onSpecial. It has no telegraph shape or basic-attack FX of its own
    // (those are drawn below, gated on the basic ATTACK_KIND_ELEMENT map,
    // which SPECIAL_CAST deliberately isn't in), so return right after.
    if (a.srcId != null) {
      if (a.kind === 'SPECIAL_CAST') {
        const element = (this.players || []).find(pp => pp.id === a.srcId)?.element
        if (element === 'WATER') this._spawnAttackFx('water_special_fx', a.x, a.y)
        else if (element === 'WIND') this._spawnAttackFx('wind_special_fx', a.x, a.y)
        this._animFor(a.srcId).onSpecial({ seq: a.seq }, performance.now())
        return
      }
      this._animFor(a.srcId).onAttack({ seq: a.seq, kind: a.kind }, performance.now())
    }
    const element = ATTACK_KIND_ELEMENT[a.kind]
    const cfg = BALANCE.PLAYER.BASIC[element]
    if (!cfg) return
    const color = ELEMENT_COLORS[element] ?? 0xffffff
    const reachPx = cfg.rangePx + CONFIG.PLAYER_RADIUS
    if (a.kind === 'EARTH_CONE') {
      this._drawArcTelegraph(a.x, a.y, a.aimX, a.aimY, reachPx, cfg.coneDeg / 2, color, 180)
    } else if (a.kind === 'WIND_WINDUP') {
      this._drawWindTelegraph(a.x, a.y, a.aimX, a.aimY, cfg.windUpMs, color)
    } else {
      this._drawArcTelegraph(a.x, a.y, a.aimX, a.aimY, reachPx, ATTACK_HALF_ANGLE_DEG[a.kind], color, 160)
    }
    // Water's basic is an instant contact-range hit (no travel time, unlike
    // Wind's fan-blade projectile below), so its FX burst plays in place at
    // the reach point rather than tracking a live projectile. Earth's cone
    // resolves the same way (Amendment A6: no wind-up, same-tick), so its
    // recovered earth_basic_fx atlas gets the identical treatment. Fire's
    // 'fire_saber_extension' atlas gets the same treatment as of its
    // integration; it replaces the earlier static 'fireball' stand-in. The
    // atlas is authored actor-facing right only (meta.authoredDirection),
    // so it's rotated in code to the same 4-way facing CharacterAnimator
    // quantizes to (AnimationController.js's dir logic) rather than shipping
    // 4 baked copies.
    // Cast sfx plays immediately (matches the telegraph draw above); the
    // element's "impact" sfx is deferred to the FX sprite's own impact
    // animation frame via sfxByState, not fired here — Earth/Water resolve
    // damage the same tick as the cast (Amendment A6), so firing both sfx
    // at once here would stack them directly on top of the generic
    // 'enemy_hit' sound already playing from the same hit's 'dmg' fx.
    if (a.kind === 'WATER_REACH') {
      audio.playFx('water_palm')
      this._spawnAttackFx(
        'water_basic_fx', a.x + a.aimX * reachPx * 0.5, a.y + a.aimY * reachPx * 0.5,
        undefined, { impact: 'splash_impact' },
      )
    } else if (a.kind === 'EARTH_CONE') {
      audio.playFx('earth_sweep')
      this._spawnAttackFx(
        'earth_basic_fx', a.x + a.aimX * reachPx * 0.5, a.y + a.aimY * reachPx * 0.5,
        undefined, { impact: 'stone_impact' },
      )
    } else if (a.kind === 'FIRE_REACH') {
      audio.playFx('fire_saber_slash')
      this._spawnAttackFx(
        'fire_saber_extension', a.x + a.aimX * reachPx * 0.5, a.y + a.aimY * reachPx * 0.5,
        ['extend', 'impact'], { impact: 'flame_impact' }, aimRotation(a.aimX, a.aimY),
      )
    }
  }

  // Filled + outlined pie-slice placeholder: origin (x,y), pointed toward
  // (aimX,aimY), true radius rangePx, wedge width halfAngleDeg either side
  // of aim. Fades out — long enough to read, short enough not to obscure
  // the next cast on a fast-cooldown class.
  _drawArcTelegraph(x, y, aimX, aimY, rangePx, halfAngleDeg, color, durationMs) {
    const len = Math.hypot(aimX, aimY) || 1
    const angle = Math.atan2(aimY / len, aimX / len)
    const half = (halfAngleDeg * Math.PI) / 180
    const g = this.add.graphics().setDepth(880)
    g.fillStyle(color, 0.3)
    g.lineStyle(2, color, 0.85)
    g.slice(x, y, rangePx, angle - half, angle + half, false)
    g.fillPath()
    g.strokePath()
    this.tweens.add({ targets: g, alpha: 0, duration: durationMs, onComplete: () => g.destroy() })
  }

  // Wind's wind-up telegraph: an aim-direction tick plus an expanding ring,
  // both fading over exactly windUpMs — the ring finishes right as the
  // fan-blade actually releases, so its timing IS the readable cue (no
  // numbers needed to know when the shot goes out).
  _drawWindTelegraph(x, y, aimX, aimY, windUpMs, color) {
    const len = Math.hypot(aimX, aimY) || 1
    const ux = aimX / len, uy = aimY / len
    const line = this.add.graphics().setDepth(880)
    line.lineStyle(3, color, 0.9)
    line.beginPath()
    line.moveTo(x + ux * 14, y + uy * 14)
    line.lineTo(x + ux * 42, y + uy * 42)
    line.strokePath()
    const ring = this.add.circle(x, y, 10, 0, 0).setStrokeStyle(2, color).setDepth(880)
    const duration = windUpMs + 60
    this.tweens.add({ targets: ring, radius: 26, alpha: 0, duration, onComplete: () => ring.destroy() })
    this.tweens.add({ targets: line, alpha: 0, duration, onComplete: () => line.destroy() })
  }

  _sendInput() {
    if (!net.playerId || !this.latest) return
    const me = this.latest.players.find(pl => pl.id === net.playerId)
    if (!me) return
    const fight = this.phaseInfo.phase === 'fight'
    // THE INPUT SEAM (2026-08-22). Exactly one of these two sources runs per
    // frame, and both produce the identical payload shape below. Nothing
    // downstream of this method knows which one it was: the wire protocol,
    // the server, matchRunner and the balance corpus are all untouched by
    // touch support. Keep it that way — a touch-only tweak here (aim assist,
    // an extra field, a different gate) silently forks the game the corpus
    // measures. See client/src/input/touchControls.js.
    const src = this._inputScheme === 'touch' ? this._readTouchInput(fight) : this._readDesktopInput(fight, me)
    const { keys, aimX, aimY } = src
    const basicDown = src.actions.basic
    // Local-only haptic on the aim stick crossing its fire threshold — never
    // sent to the server, purely a physical cue. src.firingStarted is not a
    // wire field: net.emit below picks only {keys, aimX, aimY, actions}.
    if (src.firingStarted) { try { navigator.vibrate?.(10) } catch {} }
    // Immediate local feedback (Task 7): draw THIS player's own attack
    // shape the instant the button edges down, without waiting for the
    // server round-trip. Purely cosmetic (own player only, on every press
    // regardless of cooldown) — the server's own atk/dmg/fx events in
    // _onSnapshot remain the one authoritative source for what actually
    // landed.
    if (basicDown && !this._localAtkDown) {
      const kind = ELEMENT_ATTACK_KIND[net.element]
      if (kind) this._playAtk({ kind, x: me.x, y: me.y, aimX, aimY })
    }
    this._localAtkDown = basicDown
    net.emit(EVENTS.PLAYER_INPUT, { keys, aimX, aimY, actions: src.actions })
  }

  // Desktop source: keyboard + mouse, byte-for-byte the behaviour that
  // predates the touch seam. aim is the raw world-space delta to the cursor
  // (the server normalizes it, players.js:155), and basic is the held mouse
  // button.
  _readDesktopInput(fight, me) {
    const pointer = this.input.activePointer
    return {
      keys: {
        w: this.keys.w.isDown, a: this.keys.a.isDown,
        s: this.keys.s.isDown, d: this.keys.d.isDown,
      },
      aimX: pointer.worldX - me.x,
      aimY: pointer.worldY - me.y,
      actions: {
        basic:   fight && pointer.isDown,
        special: fight && this.keys.special.isDown,
        second:  fight && this.keys.second.isDown,
        // Deliberately NOT fight-gated, unlike special/second: repairing what
        // the last wave broke is a build/waveEnd activity above all.
        repair:  this.keys.repair.isDown,
      },
    }
  }

  // Touch source: twin virtual sticks. Same four booleans (8-way quantized,
  // which is what WASD gives too), an aim UNIT vector instead of a cursor
  // delta (magnitude is unused server-side — only the normalized direction is
  // kept), and the same fight gating on the same three actions.
  _readTouchInput(fight) {
    this._reconcileTouchPointers()
    return this.touch.read({ fight })
  }

  // `deltaMs` is Phaser's frame time. It is needed because the run/idle test
  // is a SPEED test: the per-frame displacement below only means "moving" once
  // it is divided by the frame time (a raw per-frame pixel threshold read as
  // idle on high-refresh displays — see MOVE_EPSILON_PX_PER_SEC).
  update(_timeMs, deltaMs) {
    if (!this.latest) return
    this._sendInput()

    // Interpolated view for everything that moves; raw latest for HUD/discrete.
    const now = performance.now()
    const view = this.snapBuf.getRenderView(now, net.playerId) || this.latest
    const snap = this.latest
    const me = snap.players.find(pl => pl.id === net.playerId)

    // Hall HP bar (world-space, at the hall itself — a positional read of
    // "how close is the hall" while you're standing near it).
    const hall = CONFIG.HALL
    const hpFrac = snap.hallHp != null ? Math.max(0, Math.min(1, snap.hallHp / BALANCE.HALL_HP)) : 1
    this.hallHpBar.clear()
    const barW = hall.w * TILE_SIZE
    const barX = hall.gx * TILE_SIZE
    const barY = hall.gy * TILE_SIZE - 8
    this.hallHpBar.fillStyle(0x22303f, 1).fillRect(barX, barY, barW, 5)
    this.hallHpBar.fillStyle(0x54c07a, 1).fillRect(barX, barY, barW * hpFrac, 5)
    if (hpFrac <= HALL_WARN_FRAC && !this._hallWarnedLow) {
      this._hallWarnedLow = true
      audio.playFx('gate_warning')
    } else if (hpFrac > HALL_WARN_FRAC) {
      this._hallWarnedLow = false
    }

    // Player HP + Hall HP status row (HUD-fixed, always visible regardless of
    // camera position — the world-space bar above is invisible unless you're
    // standing at the hall). hallHpAuc (the balance program's primary metric)
    // is an integral over exactly this number, so playtest feedback now
    // connects to what the sweeps measure.
    {
      const { x, barW: sbw, barH: sbh, y1, y2 } = this._statusBarLayout
      const myMaxHp = BALANCE.PLAYER.CLASS[net.element]?.maxHp ?? null
      const myHpFrac = me && myMaxHp ? Math.max(0, Math.min(1, me.hp / myMaxHp)) : null
      this.statusBarsGfx.clear()
      this.statusBarsGfx.fillStyle(0x22303f, 1).fillRect(x, y1, sbw, sbh)
      if (myHpFrac != null) {
        const hpColor = myHpFrac <= 0.3 ? 0xe25a4a : 0x8affc0
        this.statusBarsGfx.fillStyle(hpColor, 1).fillRect(x, y1, sbw * myHpFrac, sbh)
      }
      this.statusBarsGfx.fillStyle(0x22303f, 1).fillRect(x, y2, sbw, sbh)
      this.statusBarsGfx.fillStyle(0x54c07a, 1).fillRect(x, y2, sbw * hpFrac, sbh)
      this.playerHpText.setText(myMaxHp != null && me ? `HP ${Math.max(0, Math.round(me.hp))}/${myMaxHp}` : 'HP —')
      this.hallHpText.setText(`HALL HP ${Math.max(0, Math.round(snap.hallHp ?? BALANCE.HALL_HP))}/${BALANCE.HALL_HP}`)
    }

    // Player dots — interpolated positions, downed/dead styling from flags.
    const seen = new Set()
    for (const pl of view.players) {
      seen.add(pl.id)
      const info = (this.players || []).find(pp => pp.id === pl.id)
      const color = ELEMENT_COLORS[info?.element] ?? 0x999999
      let entry = this.playerGfx.get(pl.id)
      if (!entry) {
        const dot = entitySprite(
          this, ELEMENT_ATLAS_KEY[info?.element], pl.x, pl.y,
          () => this.add.circle(pl.x, pl.y, CONFIG.PLAYER_RADIUS, color).setStrokeStyle(2, ELEMENT_OUTLINE),
        )
        const label = this.add.text(pl.x, pl.y - 22, info?.displayName ?? '', {
          fontFamily: 'monospace', fontSize: '11px', color: '#c9d6e2',
        }).setOrigin(0.5)
        // Normalise the art to the collision body. The four chibi atlases were
        // authored at unrelated sizes — idle content 43/38/33/25px wide for
        // earth/fire/wind/water — against ONE shared PLAYER_RADIUS, so Earth
        // rendered 1.7x the width of Water for no gameplay reason. Set once at
        // creation: unlike enemies, nothing else rescales a player sprite.
        if (!styleable(dot)) {
          dot.setScale(actorDisplayScale(ELEMENT_ATLAS_KEY[info?.element], CONFIG.PLAYER_RADIUS * 2))
        }
        entry = { dot, label, px: pl.x, py: pl.y, hp: pl.hp }
        this.playerGfx.set(pl.id, entry)
      }
      entry.dot.setPosition(pl.x, pl.y)
      entry.label.setPosition(pl.x, pl.y - 22)
      const downed = (pl.flags & PLAYER_FLAG.DOWNED) !== 0
      const dead = (pl.flags & PLAYER_FLAG.DEAD) !== 0
      const reviving = (pl.flags & PLAYER_FLAG.REVIVING) !== 0

      // Animation state (Task 17) from authoritative state only: run/idle and
      // facing from the INTERPOLATED displacement (identical on every client,
      // unlike local key state), hurt from the player's own hp dropping, and
      // death/downed from the same flags the tint/alpha below already read.
      const anim = this._animFor(pl.id)
      if (pl.hp < entry.hp) anim.onHurt(now)
      entry.hp = pl.hp
      anim.update({
        nowMs: now, dead, downed,
        dx: pl.x - entry.px, dy: pl.y - entry.py, dtMs: deltaMs,
      })
      entry.px = pl.x; entry.py = pl.y
      anim.syncSprite(entry.dot, this._hasAnim)
      entry.dot.setVisible(!dead)
      entry.label.setVisible(!dead)
      entry.dot.setAlpha(downed ? 0.45 : 1)
      if (styleable(entry.dot)) {
        if (downed) entry.dot.setStrokeStyle(2, reviving ? 0x8affc0 : 0xff5555)
        else entry.dot.setStrokeStyle(2, ELEMENT_OUTLINE)
      } else {
        // Sprites can't stroke an outline; convey the same downed/reviving
        // read via tint instead (element identity lives in the atlas key,
        // not tint, so tint is free for status — spec §6's 4 baked variants).
        if (downed) entry.dot.setTint(reviving ? 0x8affc0 : 0xff5555)
        else entry.dot.clearTint()
      }
    }
    for (const [id, entry] of this.playerGfx) {
      if (!seen.has(id)) {
        entry.dot.destroy(); entry.label.destroy(); this.playerGfx.delete(id)
        this.playerAnim.get(id)?.destroy(); this.playerAnim.delete(id)
      }
    }

    // Structures: static geometry from the change-versioned cache (Phase 2/3),
    // hp from the per-emit dynamic state (Task 8) so damage never waits on a
    // placedVersion bump to show. Center/size are footprint-aware (w/h tiles,
    // not always 1) so 2x1/2x2 structures no longer render pinned to their
    // anchor tile alone (Task 9).
    const seenS = new Set()
    this.structureDirGfx.clear()
    this.structureAuraGfx.clear()
    // Sustained-sound accumulators. Loops are field-wide, not per-structure:
    // one Howl per logical sound means N firepits sound like one, which is
    // the intended mix (N overlapping copies of the same loop just reads as
    // louder). Collected across the loop, applied once after it.
    //
    // firepit/vortex need the STATIC block (s.type), so they ride this loop.
    // Repair does not — it only needs ds.repairMs — so it reads the dynamic
    // map directly, which rides every snapshot unconditionally. That matters:
    // `structures` only rides on a placedVersion bump, so structuresCache can
    // legitimately be empty while structureState is fully populated, and the
    // repair cue must not go silent in that window.
    let anyFirepit = false, anyVortexSuction = false
    let anyRepairing = false
    // Ambience is fight-only; repair deliberately is NOT (it is a build/waveEnd
    // activity above all, same reasoning as its input gate in _sendInput).
    const fightNow = this.phaseInfo.phase === 'fight'
    for (const d of this.structureStateById.values()) {
      if ((d?.repairMs ?? 0) > 0) { anyRepairing = true; break }
    }
    for (const s of this.structuresCache || []) {
      seenS.add(s.id)
      const ds = this.structureStateById.get(s.id)
      const hp = ds?.hp ?? s.hp
      const w = s.w ?? 1, h = s.h ?? 1
      const cx = s.gx * TILE_SIZE + (w * TILE_SIZE) / 2, cy = s.gy * TILE_SIZE + (h * TILE_SIZE) / 2
      const dispW = w * TILE_SIZE - 4, dispH = h * TILE_SIZE - 4
      this._drawStructureAura(s, cx, cy, w, h)
      let entry = this.structureGfx.get(s.id)
      if (!entry) {
        const rect = entitySprite(
          this, structureArtKey(s.type), cx, cy,
          () => this.add.rectangle(cx, cy, dispW, dispH, STRUCTURE_COLORS[s.type] ?? 0x888888).setStrokeStyle(1, 0x0a0e14),
        )
        const hpBar = this.add.graphics()
        this.structureLayer.add([rect, hpBar])
        entry = {
          rect, hpBar, type: s.type, anim: this._structureAnimator(s),
          targetFxCycle: null, audioCycle: null, warnPhase: null, warnFxPhase: null,
        }
        this.structureGfx.set(s.id, entry)
      }
      if (entry.type !== s.type) {
        if (styleable(entry.rect)) entry.rect.setFillStyle(STRUCTURE_COLORS[s.type] ?? 0x888888)
        entry.type = s.type
        // A fusion replaces a structure's type in place under the same id —
        // its behavior family and atlas both change, so the animator does too.
        entry.anim.destroy()
        entry.anim = this._structureAnimator(s)
        entry.targetFxCycle = null
        entry.audioCycle = null
        entry.warnPhase = null
        entry.warnFxPhase = null
      }
      // Per-activation sfx (STRUCTURE_ACTIVATION_SFX) — same cycleSeq-bump
      // detection as Rock Trap's target-point visual below, kept as its own
      // tracked field since a structure can have both (or neither).
      const activationSfx = STRUCTURE_ACTIVATION_SFX[s.type]
      if (activationSfx && ds) {
        const cycle = ds.cycleSeq | 0
        if (entry.audioCycle === null) entry.audioCycle = cycle
        else if (cycle > entry.audioCycle) {
          entry.audioCycle = cycle
          for (const name of Array.isArray(activationSfx) ? activationSfx : [activationSfx]) audio.playFx(name)
        }
      }
      // Per-arm/telegraph sfx (STRUCTURE_WARNING_SFX) — the targetImpact
      // family's phase 0->1 EDGE only (not "while phase===1", which would
      // replay every emit for the whole telegraph window).
      const warningSfx = STRUCTURE_WARNING_SFX[s.type]
      if (warningSfx && ds) {
        const phase = ds.phase | 0
        if (entry.warnPhase === null) entry.warnPhase = phase
        else if (phase === 1 && entry.warnPhase !== 1) audio.playFx(warningSfx)
        entry.warnPhase = phase
      }
      // Per-arm/telegraph VISUAL cue (STRUCTURE_TARGET_WARNING_FX) — same
      // phase 0->1 edge as the sfx above, but its own tracked field since a
      // structure can have the sfx, the visual, both, or neither. Only
      // Blizzard has a dedicated "about to strike" frame today; Rock Trap's
      // warning sfx has no matching visual state (its target-point atlas
      // ships only the unified impact_down clip below).
      const warningFx = STRUCTURE_TARGET_WARNING_FX[s.type]
      if (warningFx && ds) {
        const phase = ds.phase | 0
        if (entry.warnFxPhase === null) entry.warnFxPhase = phase
        else if (phase === 1 && entry.warnFxPhase !== 1) {
          this._spawnAttackFx(warningFx.atlasKey, ds.tx ?? cx, ds.ty ?? cy, warningFx.states)
        }
        entry.warnFxPhase = phase
      }
      // Rock Trap's target-point impact (Task 4 gate: "target-point effect
      // wiring remains"), generalized (STRUCTURE_TARGET_FX) to cover Blizzard
      // too. The launcher/structure atlas above stays anchored on the
      // structure's own footprint; this is a SEPARATE one-shot burst at the
      // locked target point the server already sends on every dynamic-state
      // emit (ds.tx/ds.ty, server/game/structureBehaviors/targetImpact.js),
      // fired once per cycleSeq bump — the same "it just went off" signal
      // StructureAnimator uses for its own ACTIVE pulse.
      const targetFx = STRUCTURE_TARGET_FX[s.type]
      if (targetFx && ds) {
        const cycle = ds.cycleSeq | 0
        if (entry.targetFxCycle === null) entry.targetFxCycle = cycle
        else if (cycle > entry.targetFxCycle) {
          entry.targetFxCycle = cycle
          this._spawnAttackFx(targetFx.atlasKey, ds.tx ?? cx, ds.ty ?? cy, targetFx.states)
        }
      }
      // Presentation state (Task 17) from Task 8's generic dynamic fields —
      // no new wire field, and the phase deadlines stay server-owned.
      entry.anim.update(ds, now)
      entry.anim.syncSprite(entry.rect, this._hasAnim)
      // Fit the art to the footprint WITHOUT crushing its aspect ratio (see
      // structureVisuals.js). `frame` is absent on fallback rectangles, which
      // then keep the plain footprint rect they have always had.
      const frame = entry.rect.frame
      const disp = structureDisplayRect(structureArtKey(s.type), dispW, dispH, frame?.width, frame?.height)
      entry.rect.setPosition(cx, cy + disp.offsetY)
      entry.rect.setDisplaySize(disp.width, disp.height)
      // Painter's order for the overhang: art taller than its footprint rises
      // into the tiles ABOVE it, which are farther from the viewer, so a
      // structure must draw over anything with a smaller gy. Sort by the
      // FOOTPRINT's bottom edge, not the sprite's shifted centre — the centre
      // moves with art height and would order two neighbours backwards.
      entry.rect.sortY = cy + dispH / 2
      entry.hpBar.sortY = entry.rect.sortY + 0.5  // just above its own structure
      // Walkable structures (spec §2: enemies walk over them, they never
      // route-block) read as traversable via reduced opacity; blocking
      // structures (Barricade/Watchtower/eco) stay fully opaque.
      entry.rect.setAlpha(isWalkable(s.type) ? 0.78 : 1)
      entry.hpBar.clear()
      const maxHp = BALANCE.STRUCTURES[s.type]?.hp ?? hp
      const barW = Math.max(28, dispW)
      // Bars sit above whichever is taller, the footprint or the art rising
      // out of it — otherwise aspect-correct tall art (tower, geyser) is drawn
      // straight through its own hp bar.
      const barTop = Math.min(cy - dispH / 2, cy + disp.offsetY - disp.height / 2)
      entry.hpBar.fillStyle(0x22303f, 1).fillRect(cx - barW / 2, barTop - 6, barW, 3)
      entry.hpBar.fillStyle(0xc9a227, 1).fillRect(cx - barW / 2, barTop - 6, barW * Math.min(1, hp / (maxHp || 1)), 3)
      // Repair channel: a second bar directly above the hp bar, drawn only
      // while a channel is live. Server resets repairMs to 0 the tick a
      // channel lapses, so "no bar" needs no client-side timeout of its own.
      const repairMs = ds?.repairMs ?? 0
      // Structure ambience is gated on the FIGHT phase, not merely on the
      // structure existing (2026-08-22). The server only ticks these machines
      // while enemies are live, so during build a Firepit crackles and a Wind
      // Vortex sits pinned in SUCTION -- one continuous, never-ending suction
      // hiss from the moment it is placed until the wave starts. Neither is
      // doing anything then, and nothing was ever going to turn them off.
      if (s.type === 'FIRE_SPECIAL' && fightNow) anyFirepit = true
      // Wind Vortex SUCTION is phase 0 (cycle.js VORTEX_PHASE.SUCTION).
      // `ds?.phase | 0` would read a MISSING dynamic record as 0 and count a
      // just-placed vortex as sucking, so the record has to actually exist.
      if (s.type === 'WIND_SPECIAL' && fightNow && ds && (ds.phase | 0) === 0) anyVortexSuction = true
      if (repairMs > 0) {
        entry.hpBar.fillStyle(0x22303f, 1).fillRect(cx - barW / 2, barTop - 11, barW, 3)
        entry.hpBar.fillStyle(0x5fd0e0, 1).fillRect(cx - barW / 2, barTop - 11,
          barW * Math.min(1, repairMs / (BALANCE.REPAIR?.CHANNEL_MS || 3000)), 3)
      }

      // Locked output direction (Water Geyser / Wind Vortex): a short arrow
      // from the footprint center toward the stored cardinal.
      if (s.dir && DIRECTION_VECTOR[s.dir]) {
        const [vx, vy] = DIRECTION_VECTOR[s.dir]
        const len = Math.min(dispW, dispH) / 2 + 8
        this.structureDirGfx.lineStyle(2, 0xfff2b0, 0.9)
          .lineBetween(cx, cy, cx + vx * len, cy + vy * len)
        this.structureDirGfx.fillStyle(0xfff2b0, 0.9)
          .fillCircle(cx + vx * len, cy + vy * len, 3)
      }
    }
    for (const [id, entry] of this.structureGfx) {
      if (!seenS.has(id)) {
        entry.rect.destroy(); entry.hpBar.destroy(); entry.anim.destroy()
        this.structureGfx.delete(id)
      }
    }
    // Apply the painter's order set above. A Container renders its children in
    // array order and does NOT sort on its own, so without this a structure
    // whose art overhangs upward could be drawn behind a neighbour it should
    // occlude — the order was previously just whatever order structures
    // happened to be created in.
    this.structureLayer.sort('sortY')
    // Sustained sounds, driven off state rather than edges: a destroyed or
    // sold structure simply stops appearing in structuresCache, which drops
    // the flag and stops the loop with no destroy-side hook needed.
    audio.setLoop('repair_start_loop', anyRepairing)
    audio.setLoop('firepit_ambience', anyFirepit)
    audio.setLoop('wind_vortex_suction', anyVortexSuction)

    // Placement ghost + range/area preview (Task 9) — only while the local
    // player is actually choosing where to build.
    this._drawPlacementGhost()

    // Enemies — interpolated greenskin dots (CP2 L4 closed: no more raw snaps).
    const seenE = new Set()
    for (const en of view.enemies) {
      seenE.add(en.id)
      const base = ENEMY_BASE[en.type] || { color: 0x888888, r: 8 }
      const elite = (en.flags & FLAG.ELITE) !== 0
      let entry = this.enemyGfx.get(en.id)
      if (!entry) {
        const dot = entitySprite(
          this, enemyArtKey(en.type), en.x, en.y,
          () => this.add.circle(en.x, en.y, base.r, base.color),
        ).setDepth(500)
        // Dark outline (2026-08-15, ground brightening): the ground no longer
        // stays under every enemy's own luminance, so contrast is a runtime
        // outline instead of a ground-value ceiling. Real-sprite enemies only
        // (preFX is WebGL-only and the fallback circle already gets its own
        // stroke below); guarded because preFX is null under the Canvas
        // renderer fallback.
        if (!styleable(dot) && dot.preFX) dot.preFX.addGlow(0x000000, 3, 0, false)
        entry = { dot }
        this.enemyGfx.set(en.id, entry)
      }
      entry.dot.setPosition(en.x, en.y)
      if (styleable(entry.dot)) {
        entry.dot.setRadius(elite ? base.r + 3 : base.r)
        if (elite) entry.dot.setStrokeStyle(2, 0xffe08a)
        else if (en.flags & FLAG.AGGRO) entry.dot.setStrokeStyle(1.5, 0xff5555)
        else if (en.flags & (FLAG.ROOT | FLAG.FREEZE)) entry.dot.setStrokeStyle(1.5, 0x9fd1e8)
        // Steam Vent confusion (§6.1) reads below root/freeze: both can be
        // active at once (independent axes) and "cannot move" is the more
        // urgent thing for a player to see than "moving the wrong way".
        else if (en.flags & FLAG.CONFUSED) entry.dot.setStrokeStyle(1.5, 0xd9c7f0)
        else if (en.flags & FLAG.BURN) entry.dot.setStrokeStyle(1.5, 0xff8a3d)
        else entry.dot.setStrokeStyle(0)
      } else {
        // Same elite ratio as the shape branch (base.r+3 relative to base.r,
        // not a flat 1.4x) so troll/orc/goblin elites scale consistently
        // whichever render path is active. Aggro/root/freeze convey via tint.
        //
        // Multiplied by the actor's normalising scale: the art was authored at
        // sizes unrelated to base.r, so at native scale goblin/orc/troll drew
        // 22/23/25px for hitboxes of 14/18/24 — a 1.7x gameplay difference
        // rendered as 1.14x, making a troll look barely bigger than a goblin.
        const norm = actorDisplayScale(enemyArtKey(en.type), base.r * 2)
        entry.dot.setScale(norm * (elite ? (base.r + 3) / base.r : 1))
        if (elite) entry.dot.setTint(0xffe08a)
        else if (en.flags & FLAG.AGGRO) entry.dot.setTint(0xff5555)
        else if (en.flags & (FLAG.ROOT | FLAG.FREEZE)) entry.dot.setTint(0x9fd1e8)
        else if (en.flags & FLAG.CONFUSED) entry.dot.setTint(0xd9c7f0)
        else if (en.flags & FLAG.BURN) entry.dot.setTint(0xff8a3d)
        else entry.dot.clearTint()
      }
      entry.dot.setAlpha(en.flags & FLAG.SLOW ? 0.8 : 1)
    }
    for (const [id, entry] of this.enemyGfx) {
      if (!seenE.has(id)) { entry.dot.destroy(); this.enemyGfx.delete(id) }
    }

    // Projectiles — Fireball and Wind's fan-blade both render through the
    // 'fireball'/'wind_basic_fx' keys once loaded; entitySprite falls back to
    // the orange circle / pale ellipse placeholders (Task 7's "must read as
    // different attacks in flight" contract) for any other projectile type
    // or if a key's atlas failed to load.
    const seenP = new Set()
    for (const pr of view.projectiles || []) {
      seenP.add(pr.id)
      let dot = this.projectileGfx.get(pr.id)
      if (!dot) {
        const atlasKey = pr.type === 'FAN_BLADE' ? 'wind_basic_fx' : pr.type === 'FIREBALL' ? 'fireball' : null
        dot = entitySprite(
          this, atlasKey, pr.x, pr.y,
          () => (pr.type === 'FAN_BLADE'
            ? this.add.ellipse(pr.x, pr.y, 14, 6, ELEMENT_COLORS.WIND ?? 0xcfe4ff).setStrokeStyle(1, 0x33506b)
            : this.add.circle(pr.x, pr.y, 5, 0xff8a3a).setStrokeStyle(1, 0x5a2a0a)),
        ).setDepth(600)
        if (dot.texture?.key === 'wind_basic_fx' && this._hasAnim('wind_basic_fx_flight')) {
          dot.play('wind_basic_fx_flight')
        }
        // wind_fan_throw plays once per projectile, right as it becomes
        // visible — unlike Water/Earth/Fire's basic, Wind's fan-blade has
        // real travel time (Task 5's wind-up + flight), so this genuinely
        // precedes the impact sfx below rather than stacking with it.
        if (pr.type === 'FAN_BLADE') audio.playFx('wind_fan_throw')
        this.projectileGfx.set(pr.id, dot)
      }
      dot.setPosition(pr.x, pr.y)
    }
    for (const [id, dot] of this.projectileGfx) {
      if (!seenP.has(id)) {
        // The fan-blade sprite gets to finish its impact/dissipation burst in
        // place at its last known (i.e. hit) position before it disappears;
        // the plain fallback shapes (fireball, or fan-blade before its atlas
        // loaded) still vanish immediately as before.
        if (dot.texture?.key === 'wind_basic_fx' && this._hasAnim('wind_basic_fx_impact')) {
          dot.play('wind_basic_fx_impact')
          audio.playFx('wind_fan_impact')
          dot.once('animationcomplete', () => {
            if (this._hasAnim('wind_basic_fx_dissipation')) {
              dot.play('wind_basic_fx_dissipation')
              dot.once('animationcomplete', () => dot.destroy())
            } else {
              dot.destroy()
            }
          })
        } else {
          dot.destroy()
        }
        this.projectileGfx.delete(id)
      }
    }

    // HUD + self status overlay.
    const { phase, wave } = this.phaseInfo
    const you = net.element ? `  you: ${net.element}` : ''
    const muteHint = audio.isMuted() ? 'muted' : 'sound on'
    const gold = this._myGold()
    const wallet = gold != null ? `   gold ${gold}` : ''
    // Raw server tick is an internal debug number, not player-facing —
    // shown only behind ?debug=1 (see this._debugHud).
    const tickHint = this._debugHud ? `   tick ${snap.tick}` : ''
    // No hudScale readout here (2026-08-22 review, finding 4): this line's
    // width isn't wrapped or clamped, wavePreview sits at a fixed screen
    // position to its right (createWavePreview, W - 198), and this text
    // ALSO grows with hudScale — appending more text was making a line that
    // already isn't overflow-safe worse for no functional gain (pressing
    // [/] is its own instant feedback).
    this.hud.setText(`Wave ${wave}/10   phase: ${phase}   L${snap.teamLevel ?? 1}${you}${wallet}${tickHint}   [M] ${muteHint}`)
    const orientHint = footprint(this.selectedType, 'H').w !== footprint(this.selectedType, 'H').h
      ? `  [R] rotate: ${this.selectedOrient}` : ''
    const dirHint = DIRECTIONAL_TYPES.includes(this.selectedType) ? `  [arrows] direction: ${this.selectedDir}` : ''
    // Hint prose is GENERATED from the active input scheme (inputHints), never
    // forked per platform — one place names each control, so desktop and touch
    // can't drift into describing different games.
    // An armed tile says so IN WORDS. The whole risk of arm-then-confirm is
    // that the first tap reads as "the game ignored me" rather than as "now
    // confirm" -- a bracketed ghost alone leaves that ambiguous, so the hint
    // line names the next action outright. A server rejection still outranks
    // it: that is the more urgent thing to read.
    const armed = this._inputScheme === 'touch' && this.placementIntent.pending
    const armedHint = armed ? 'Tap the same tile again to build  ·  tap elsewhere to move it' : ''
    const hint = this.rejectMessage || armedHint || inputHints(this._inputScheme, {
      phase, selectedType: this.selectedType, orientHint, dirHint,
    })
    // The number-key prefix is keyboard prose, so it is desktop-only; touch
    // gets all of these as real buttons in the DOM build palette
    // (client/src/ui/buildPalette.js).
    const selectHint = this._inputScheme === 'touch' ? '' : `[1-${BUILDABLE_TYPES.length}] select   `
    this.buildHud.setText(`${selectHint}${hint}`)
    this._drawFusionPrompt()
    this.wavePreview.update(this.phaseInfo)

    let overlayText = this.levelBanner
    if (me) {
      if (me.flags & PLAYER_FLAG.DEAD) overlayText = 'YOU DIED — respawning at the hall…'
      else if (me.flags & PLAYER_FLAG.REVIVING) overlayText = 'DOWNED — teammate reviving you!'
      else if (me.flags & PLAYER_FLAG.DOWNED) overlayText = 'DOWNED — a teammate can revive you'
    }
    this.overlay.setText(overlayText)
    // Touch controls FIRST: they recompute the layout whose centerBand the
    // ability bar clamps itself into. Drawing the bar first made it use the
    // previous frame's band, so for one frame after a resize or a palette
    // open/close it could sit inside a stick's grab circle.
    this._drawTouchControls()
    this._drawAbilityBar(me, deltaMs)
    this._drawStructureCard()
    this._updatePalette()
  }

  // Bottom-center cooldown/charge readout for the LOCAL player only. The
  // snapshot's remaining-ms is authoritative; between the 20 Hz emits the
  // held values decay by frame time so the fill moves at display rate.
  // Hidden outside the fight phase and while down/dead — nothing to time.
  _drawAbilityBar(me, deltaMs) {
    const live = me && this.phaseInfo.phase === 'fight' &&
      !(me.flags & (PLAYER_FLAG.DEAD | PLAYER_FLAG.DOWNED))
    this.abilityGfx.clear()
    if (!live) {
      for (const label of this.abilityLabels) label.setVisible(false)
      // Bar gone means its buttons are gone: clearing the rects also releases
      // anything a thumb was holding, so a knockdown can't latch an ability on.
      this.touch.setAbilityRects({})
      return
    }
    // A fresh snapshot replaces the held values outright; otherwise decay
    // what we have. `me` is the raw latest snapshot, so its cd fields step
    // only on emit — tracking the tick tells a new emit from a repeat frame.
    if (this._abilityCdTick !== this.latest?.tick) {
      this._abilityCdTick = this.latest?.tick
      this._abilityCd = { cdBasic: me.cdBasic, cdSpecial: me.cdSpecial, cdSecond: me.cdSecond }
    } else {
      this._abilityCd = {
        cdBasic: decayRemaining(this._abilityCd.cdBasic, deltaMs),
        cdSpecial: decayRemaining(this._abilityCd.cdSpecial, deltaMs),
        cdSecond: decayRemaining(this._abilityCd.cdSecond, deltaMs),
      }
    }
    const slots = abilitySlots(net.element, this._abilityCd)
    if (!slots.length) {
      for (const label of this.abilityLabels) label.setVisible(false)
      this.touch.setAbilityRects({})
      return
    }
    // Geometry comes from _abilityBarGeom so the stick layout reserves this
    // bar's REAL width. Sizes there are authored in CSS pixels and converted
    // once, and the bar is anchored to grow UPWARD from the bottom margin --
    // it used to be positioned by its TOP edge, which put most of an enlarged
    // touch button, and its whole label, below the bottom of the screen
    // (2026-08-22 reviews, measured at 7.6 visible CSS px on a phone).
    const s = this._uiUnit()
    const touchMode = this._inputScheme === 'touch'
    const { slotW, slotH, gap, x0, y } = this._abilityBarGeom()
    const rects = {}
    slots.forEach((slot, i) => {
      const x = x0 + i * (slotW + gap)
      this.abilityGfx.fillStyle(PANEL_BG.abilityBar.color, PANEL_BG.abilityBar.alpha).fillRect(x, y, slotW, slotH)
      this.abilityGfx.fillStyle(ABILITY_STATE_COLOR[slot.state], ABILITY_STATE_COLORS[slot.state].alpha)
        .fillRect(x, y, slotW * slot.fill, slotH)
      this.abilityGfx.lineStyle(1, slot.state === 'ready' ? 0x8affc0 : 0x2f4b6e, 0.9)
        .strokeRect(x, y, slotW, slotH)
      const label = this.abilityLabels[i]
      label.setFontSize(Math.round(10 * s))
        .setVisible(true)
        .setPosition(x + slotW / 2, y + slotH / 2)
        // Key names are desktop prose; on touch the button IS the control, and
        // a 44px-wide slot has no room for "[Q] ". Slot 0 is not a button at
        // all on touch — the aim stick fires the basic — so it says so.
        .setText(touchMode ? (TOUCH_ABILITY_SLOT_KIND[i] ? slot.label : 'STICK') : `[${slot.key}] ${slot.label}`)
      const kind = TOUCH_ABILITY_SLOT_KIND[i]
      if (kind) rects[kind] = { x, y, w: slotW, h: slotH }
    })
    // Slot 0 is the basic attack, which on touch is the aim stick itself, not
    // a button — publishing only Q/E keeps one control per action.
    this.touch.setAbilityRects(touchMode ? rects : {})
  }
}
