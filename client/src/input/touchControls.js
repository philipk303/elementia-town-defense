// Touch input source for GameScene: twin virtual sticks plus tap buttons.
//
// THE LOAD-BEARING CONSTRAINT (2026-08-19 decision, restated in every handoff
// since): this file must never change the wire protocol. read() returns the
// exact same { keys{w,a,s,d}, aimX, aimY, actions{basic,special,second,repair} }
// shape the desktop keyboard+mouse path builds, so server, matchRunner and the
// 17,000+-run balance corpus all keep measuring ONE game. In particular:
//   - Movement is BOOLEAN, quantized to 8 directions. Desktop's WASD is 8-way
//     too, so this is parity, not a downgrade. Lifting it means a protocol
//     change AND a re-take of the corpus.
//   - No aim assist, no auto-aim, no touch-only cooldown or range tweak. Input
//     parity is a standing rule.
//
// Pure: no Phaser, no DOM. GameScene owns the graphics objects and feeds this
// pointer coordinates already in Phaser's logical/game space. Tested in
// test/client/touchControls.test.js.

// Geometry is authored in CSS pixels and converted to the game's logical
// pixels by the caller-supplied displayScale, NOT used raw. Under
// Phaser.Scale.FIT the canvas is a fixed 1280-wide logical surface letterboxed
// into whatever the device gives us: on a 375px-wide phone one logical pixel
// is ~0.29 CSS px, so a "44px" control authored in logical units would render
// at ~13 physical px and fail the 44px touch-target floor.
export const TOUCH_MIN_TARGET_CSS_PX = 44
export const STICK_RADIUS_CSS_PX = 56
export const STICK_KNOB_RADIUS_CSS_PX = 22
export const STICK_MARGIN_CSS_PX = 22
export const BUTTON_H_CSS_PX = 48
export const BUTTON_W_CSS_PX = 92
// Clear space between REPAIR and the aim stick below it. It used to be half a
// margin -- 11 CSS px on the target tablet -- so a grab 11px high of the aim
// stick started a repair channel instead of attacking, mid-fight, because
// repair is not fight-gated (2026-08-22 design review).
export const BUTTON_SEPARATION_CSS_PX = 24
// Fraction of the stick radius that reads as "centered". Below it the stick
// contributes nothing: no movement keys, and the aim stick does not fire.
export const STICK_DEADZONE_FRAC = 0.25
// TWO-TIER AIM STICK (approved 2026-08-22). Below this fraction of the radius
// the aim stick AIMS ONLY; past it, it aims and fires. Deflection used to be
// firing outright, so a touch player could not re-point without throwing a
// basic attack while a desktop player could -- which on Wind and Fire (ranged
// basics that call triggerAggro) pulled aggro the player never intended, and
// gave touch a systematically different basic-miss profile than desktop.
// The boundary is DRAWN as an outer ring; an invisible threshold would just
// move the confusion rather than remove it.
export const STICK_FIRE_FRAC = 0.6
// Release threshold, below the fire threshold. Without this band a thumb
// resting exactly at the boundary crosses it every frame, and while the server
// is level-triggered (so combat is unaffected), GameScene._sendInput's local
// attack telegraph is EDGE-triggered -- it would spawn a fresh graphic and
// tween on every recrossing. Desktop's held mouse button cannot chatter.
export const STICK_RELEASE_FRAC = 0.55

// Touch capability, from the pointer API rather than the user agent, so a
// hybrid laptop/tablet keeps BOTH input paths live instead of being forced
// into one by a UA sniff.
export function isTouchCapable(nav = globalThis.navigator) {
  if (!nav) return false
  return (nav.maxTouchPoints || 0) > 0 || 'ontouchstart' in (globalThis.window || {})
}

// Should the touch controls be showing before the player has touched anything?
// Yes on a pure-touch device (no fine pointer), no on a hybrid — there the
// first actual touch flips the scheme over (GameScene tracks that).
export function prefersTouchFirst(nav = globalThis.navigator, win = globalThis.window) {
  if (!isTouchCapable(nav)) return false
  const fine = win && win.matchMedia && win.matchMedia('(pointer: fine)')
  return !(fine && fine.matches)
}

// Stick vector -> the same four booleans WASD produces, snapped to the nearest
// of 8 compass directions. Screen coordinates, so +y is DOWN (south).
const NO_KEYS = { w: false, a: false, s: false, d: false }
const SECTOR_KEYS = [
  { d: true },            // E
  { s: true, d: true },   // SE
  { s: true },            // S
  { a: true, s: true },   // SW
  { a: true },            // W
  { a: true, w: true },   // NW
  { w: true },            // N
  { w: true, d: true },   // NE
]
export function quantize8(dx, dy, deadzone = STICK_DEADZONE_FRAC) {
  const mag = Math.hypot(dx, dy)
  if (!(mag > deadzone)) return { ...NO_KEYS }
  // Sector index 0..7 clockwise from east, each 45 degrees wide.
  const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8
  return { ...NO_KEYS, ...SECTOR_KEYS[sector] }
}

// Screen-space geometry for every touch control, in the game's logical pixels.
// displayScale is Phaser's gameSize/displaySize ratio (this.scale.displayScale.x):
// logical = css * displayScale. hudScale is the player's own accessibility
// size knob and multiplies on top — but the 44px floor is enforced against
// displayScale alone, so shrinking the HUD can never shrink a control below
// the minimum touch target.
// Most of the width ONE stick (ring plus grab pad plus edge margin) may take.
// This is what makes the bottom strip allocatable in one direction: the sticks
// claim their corners first, and whatever is left in the middle is handed to
// the ability bar as `centerBand`. The dependency used to run the other way --
// the bar's width was fed in as a reserve -- which was circular, because the
// bar's own maximum width depended on how much room the sticks left.
const STICK_MAX_WIDTH_FRAC = 0.28

export function layoutTouchControls({ width, height, displayScale = 1, hudScale = 1 }) {
  // displayScale is gameSize/displaySize, so it is Infinity for as long as the
  // canvas has no laid-out size — which is genuinely the case on the first
  // frame after boot, and again for a frame during an orientation change or a
  // resize that momentarily reports 0. Ungarded, every coordinate below
  // becomes Infinity and the controls silently stop existing. Observed live,
  // 2026-08-22.
  const sane = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback)
  displayScale = sane(displayScale, 1)
  hudScale = sane(hudScale, 1)
  width = sane(width, 1280)
  height = sane(height, 720)
  // NOTE: there is deliberately no bottom-inset parameter. The DOM build
  // palette reserves its own space by shrinking the canvas container
  // (--ep-dock in index.html), so the canvas never extends under it and this
  // layout has nothing to compensate for. An inset was tried and was wrong:
  // the palette is fixed to the VIEWPORT while the canvas is letterboxed
  // inside it, so its height is not its overlap -- on a phone in portrait the
  // overlap is zero and subtracting the height anyway pinned REPAIR to y=0.
  const unit = displayScale * hudScale
  const minTarget = TOUCH_MIN_TARGET_CSS_PX * displayScale
  // Both scale factors multiply, so on a phone at hudScale 2.5 the requested
  // geometry is ~8.5x the authored CSS size — far larger than the surface.
  // Everything below is therefore clamped to actually FIT, with the 44px
  // touch-target floor applied last so a fit clamp can never shrink a control
  // below the minimum (the two only conflict on absurdly small screens).
  const margin = Math.min(STICK_MARGIN_CSS_PX * unit, width * 0.03, height * 0.05)
  const pad = margin / 2               // zone padding around each ring
  const btnH = Math.max(Math.min(BUTTON_H_CSS_PX * unit, height * 0.15), minTarget)
  // Widest a stick can be and still leave the centre band for the ability bar.
  // Derived from the stick's whole horizontal footprint -- margin, ring, and
  // grab pad -- because that footprint, not the ring alone, is what must not
  // reach the bar.
  const fitW = (width * STICK_MAX_WIDTH_FRAC - margin) / 2 - pad
  const sep = BUTTON_SEPARATION_CSS_PX * displayScale
  // The stick radius is clamped so REPAIR always FITS above the aim stick with
  // real clearance. Previously repair was positioned by chaining off the zone
  // geometry, so as the stick grew the button climbed the screen -- at phone
  // scale it reached y=0, overlapping the wave preview and completely out of
  // thumb reach (2026-08-22 design review, measured at 1% down the screen).
  const fitH = (height - 2 * margin - btnH - sep) / 2
  const radius = Math.max(Math.min(STICK_RADIUS_CSS_PX * unit, fitW, fitH), minTarget / 2)
  const knobRadius = Math.min(STICK_KNOB_RADIUS_CSS_PX * unit, radius * 0.55)
  const btnW = Math.max(Math.min(BUTTON_W_CSS_PX * unit, (radius + pad) * 2), minTarget)
  const cy = height - margin - radius
  const stick = (cx) => ({
    cx, cy, radius, knobRadius,
    // Grabs are hit-tested as a CIRCLE of this radius, not as the square
    // `zone` below. The square enclosed the ring's bounding box and swallowed
    // up to 37% of the buildable board on a phone -- and the bottom corners
    // are not spare HUD space, they are the final defensive ring either side
    // of the Hall (2026-08-22 design review).
    hitRadius: radius + pad,
    // Grab zone: the square that encloses the ring. A touch anywhere inside
    // re-centers the stick under the thumb (floating stick) rather than
    // demanding the player hit the drawn ring — and, per the 2026-08-22
    // review lesson, any touch inside these bounds is SWALLOWED so it can
    // never fall through to a build/sell on the tile underneath.
    zone: {
      x: cx - radius - pad, y: cy - radius - pad,
      w: (radius + pad) * 2, h: (radius + pad) * 2,
    },
  })
  const move = stick(margin + radius)
  const aim = stick(width - margin - radius)
  // The clear span between the two sticks' grab circles. The ability bar (and
  // anything else bottom-centre) must fit inside this.
  // A gutter each side so the bar never sits flush against a grab circle:
  // flush means a thumb aiming at the outermost button edge is one pixel from
  // grabbing the stick instead.
  const bandX = move.cx + radius + pad + pad
  const centerBand = { x: bandX, w: Math.max(0, (aim.cx - radius - pad - pad) - bandX) }
  return {
    unit, minTarget, move, aim, centerBand,
    // Repair sits above the AIM stick: repair is a held channel that is not
    // fight-gated, so the thumb holding it should be the one that is idle
    // during the build phase, leaving the left thumb free to walk.
    // Right-aligned with the aim stick, one clear separation above it. The
    // clamp above guarantees this stays on screen; the max() is belt and
    // braces for a viewport too small for any sane layout.
    repair: {
      x: Math.max(0, aim.cx + radius + pad - btnW),
      y: Math.max(0, cy - radius - pad - sep - btnH),
      w: btnW, h: btnH,
    },
  }
}

function inRect(x, y, r) {
  return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

// One live touch-control state machine. GameScene forwards raw pointer
// down/move/up into it and calls read() once per frame from _sendInput.
export class TouchController {
  constructor() {
    this.layout = null
    // Ability-button rects come from the ability BAR (bottom-center), which
    // doubles as the touch buttons rather than a second widget drawing the
    // same cooldown state twice. Null whenever the bar is not live.
    this.abilityRects = { special: null, second: null }
    // pointerId -> { kind, baseX, baseY, dx, dy }  (dx/dy only for sticks)
    this.bindings = new Map()
    // Last non-zero aim, so releasing the aim stick leaves the character
    // facing where it was rather than snapping. Matches desktop, where the
    // mouse position (and therefore the aim) persists after the click.
    this.lastAim = { x: 1, y: 0 }
    this._firing = false   // hysteresis latch for the fire threshold
  }

  setLayout(layout) { this.layout = layout }

  // rects is { special, second } or nulls when the ability bar is hidden
  // (out of fight, downed, dead). A held button whose rect just disappeared
  // is released, so a vanishing bar can never leave an action stuck true.
  setAbilityRects(rects = {}) {
    this.abilityRects = { special: rects.special || null, second: rects.second || null }
    for (const [id, b] of this.bindings) {
      if ((b.kind === 'special' || b.kind === 'second') && !this.abilityRects[b.kind]) this.bindings.delete(id)
    }
  }

  // Returns true if this pointer landed on a control and was consumed — the
  // caller must then NOT treat it as a world tap (build/sell).
  pointerDown(id, x, y) {
    const L = this.layout
    if (!L) return false
    // BUTTONS ARE TESTED BEFORE STICKS. The ability bar draws ON TOP of the
    // sticks (depth 1000 vs 999), so testing sticks first meant the thing you
    // could see was not the thing that received your tap. With the center
    // reserve now derived from the bar's real width the two should not
    // overlap at all, but hit order must still match draw order.
    for (const kind of ['repair', 'special', 'second']) {
      const rect = kind === 'repair' ? L.repair : this.abilityRects[kind]
      if (inRect(x, y, rect)) { this.bindings.set(id, { kind }); return true }
    }
    const inStick = (k) => Math.hypot(x - L[k].cx, y - L[k].cy) <= L[k].hitRadius
    const stickKind = inStick('move') ? 'move' : inStick('aim') ? 'aim' : null
    if (stickKind) {
      // Floating base, clamped to stay inside its own zone so the knob can
      // always be pushed to full deflection in every direction.
      const z = L[stickKind].zone
      const r = L[stickKind].radius
      const baseX = Math.min(Math.max(x, z.x + r), z.x + z.w - r)
      const baseY = Math.min(Math.max(y, z.y + r), z.y + z.h - r)
      this.bindings.set(id, { kind: stickKind, baseX, baseY, dx: 0, dy: 0 })
      this._applyStick(id, x, y)
      return true
    }
    return false
  }

  pointerMove(id, x, y) {
    const b = this.bindings.get(id)
    if (!b) return false
    if (b.kind === 'move' || b.kind === 'aim') this._applyStick(id, x, y)
    // A held button keeps its pointer even if the thumb slides off: sliding
    // must never silently re-target a DIFFERENT button mid-hold (the 2026-08-22
    // review's identity lesson).
    return true
  }

  pointerUp(id) {
    const b = this.bindings.get(id)
    if (b?.kind === 'aim') this._firing = false
    return this.bindings.delete(id)
  }

  // Every binding dropped — used when the scheme flips back to desktop, on
  // scene teardown, and by GameScene's per-frame reconcile against Phaser's
  // real pointer list so a lost pointerup can never pin an input on.
  releaseAll() { this._firing = false; this.bindings.clear() }

  // Ids currently bound to a control, so the caller can reconcile them against
  // the pointers the engine still reports as down.
  boundIds() { return [...this.bindings.keys()] }

  _applyStick(id, x, y) {
    const b = this.bindings.get(id)
    const L = this.layout
    if (!b || !L) return
    const r = L[b.kind].radius
    let dx = (x - b.baseX) / r
    let dy = (y - b.baseY) / r
    const mag = Math.hypot(dx, dy)
    if (mag > 1) { dx /= mag; dy /= mag }
    b.dx = dx; b.dy = dy
  }

  _stick(kind) {
    for (const b of this.bindings.values()) if (b.kind === kind) return b
    return null
  }

  held(kind) {
    for (const b of this.bindings.values()) if (b.kind === kind) return true
    return false
  }

  // Render state for one stick: where to draw the ring and the knob, and
  // whether it is currently grabbed.
  knob(kind) {
    const L = this.layout
    if (!L) return null
    const b = this._stick(kind)
    const baseX = b ? b.baseX : L[kind].cx
    const baseY = b ? b.baseY : L[kind].cy
    const dx = b ? b.dx : 0, dy = b ? b.dy : 0
    const mag = Math.hypot(dx, dy)
    return {
      active: !!b, baseX, baseY, radius: L[kind].radius, knobRadius: L[kind].knobRadius,
      knobX: baseX + dx * L[kind].radius, knobY: baseY + dy * L[kind].radius,
      // Aim stick only: where the fire threshold sits, and whether it is
      // currently crossed, so the ring can be drawn and lit.
      fireRadius: L[kind].radius * STICK_FIRE_FRAC,
      firing: kind === 'aim' && (this._firing ? mag >= STICK_RELEASE_FRAC : mag >= STICK_FIRE_FRAC),
      engaged: mag > STICK_DEADZONE_FRAC,
    }
  }

  // The PLAYER_INPUT payload fields, identical in shape to the desktop path.
  // fight gates exactly the same three actions desktop gates (basic, special,
  // second) and leaves repair ungated, exactly as desktop does.
  read({ fight = false } = {}) {
    const mv = this._stick('move')
    const aim = this._stick('aim')
    const keys = mv ? quantize8(mv.dx, mv.dy) : { ...NO_KEYS }
    let aimX = this.lastAim.x, aimY = this.lastAim.y
    let aiming = false
    if (aim) {
      const mag = Math.hypot(aim.dx, aim.dy)
      // Past the deadzone the stick re-points the character; only past the
      // FIRE threshold does it also attack.
      if (mag > STICK_DEADZONE_FRAC) {
        aimX = aim.dx / mag; aimY = aim.dy / mag
        this.lastAim = { x: aimX, y: aimY }
        // Schmitt trigger: cross STICK_FIRE_FRAC to start firing, fall below
        // STICK_RELEASE_FRAC to stop. The drawn ring marks the START edge.
        aiming = this._firing
          ? mag >= STICK_RELEASE_FRAC
          : mag >= STICK_FIRE_FRAC
      }
    }
    // Edge-detected so the caller (GameScene) can trigger a haptic buzz on
    // the not-firing -> firing transition only, never every held frame. Idle
    // vs firing knob colours are 1.08:1 in greyscale -- identical -- and the
    // knob sits under the thumb driving it, so a short vibration is the one
    // cue for this state that survives both occlusion and colour blindness.
    // Gated on fight: outside combat the stick can still reach the fire
    // threshold (the ring is drawn in every phase), but nothing actually
    // fires there, so nothing should buzz either.
    const firingStarted = fight && aiming && !this._firing
    this._firing = aiming
    return {
      keys,
      aimX, aimY,
      firingStarted,
      actions: {
        // Holding the aim stick out IS the attack, the same way holding the
        // mouse button down is on desktop.
        basic: fight && aiming,
        special: fight && this.held('special'),
        second: fight && this.held('second'),
        repair: this.held('repair'),
      },
    }
  }
}

// Hint prose generated FROM the active scheme rather than forked per platform,
// so there is exactly one place a control's name is written down.
export function inputHints(scheme, { phase, selectedType, orientHint = '', dirHint = '' } = {}) {
  const touch = scheme === 'touch'
  if (phase === 'build') {
    const verb = touch ? 'tap' : 'click'
    const repair = touch ? 'REPAIR button' : '[F] repair'
    // "sell existing" is stale: a tap/click now SELECTS a structure and the
    // sale needs the card's own button. And orient/dir hints are keyboard
    // prose ("[R] rotate"), so they are desktop-only now that touch has real
    // ROTATE and N/E/S/W buttons -- telling a touch player to press keys they
    // do not have, while the buttons sit right below, is worse than silence.
    const context = touch ? '' : `${orientHint}${dirHint}`
    return `${verb}: build ${selectedType} / select to inspect${context}  ${repair}`
  }
  return touch
    ? 'left stick move · right stick aim + attack · Q/E buttons · REPAIR button'
    : 'WASD move · click melee · Q special · E second (L4) · F repair'
}
