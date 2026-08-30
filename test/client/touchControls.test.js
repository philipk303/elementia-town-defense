// Touch input source (client/src/input/touchControls.js).
//
// The tests that matter most here are the PARITY ones: the touch source must
// emit the same payload shape and the same gating the desktop keyboard+mouse
// path does, because the wire protocol is what the whole balance corpus is
// measured through. Anything that lets touch produce a field, a range or a
// gate desktop cannot is a corpus-invalidating divergence, not a UI bug.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TouchController, layoutTouchControls, quantize8, inputHints,
  prefersTouchFirst, isTouchCapable,
  STICK_DEADZONE_FRAC, STICK_FIRE_FRAC, STICK_RELEASE_FRAC, TOUCH_MIN_TARGET_CSS_PX,
} from '../../client/src/input/touchControls.js'

const LAYOUT = layoutTouchControls({ width: 1280, height: 720, displayScale: 1, hudScale: 1 })

function controller(layout = LAYOUT) {
  const c = new TouchController()
  c.setLayout(layout)
  return c
}
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2]

// --- 8-way quantization (movement parity with WASD) -------------------------

test('quantize8 returns all four keys false inside the deadzone', () => {
  for (const [x, y] of [[0, 0], [0.1, 0], [0, -0.2], [0.15, 0.15]]) {
    assert.deepEqual(quantize8(x, y), { w: false, a: false, s: false, d: false })
  }
})

test('quantize8 maps the eight compass directions (screen coords, +y down)', () => {
  const dir = (x, y) => Object.entries(quantize8(x, y)).filter(([, v]) => v).map(([k]) => k).sort().join('')
  assert.equal(dir(1, 0), 'd')      // east
  assert.equal(dir(1, 1), 'ds')     // south-east
  assert.equal(dir(0, 1), 's')      // south
  assert.equal(dir(-1, 1), 'as')    // south-west
  assert.equal(dir(-1, 0), 'a')     // west
  assert.equal(dir(-1, -1), 'aw')   // north-west
  assert.equal(dir(0, -1), 'w')     // north
  assert.equal(dir(1, -1), 'dw')    // north-east
})

test('quantize8 never produces an opposed pair (the WASD-impossible input)', () => {
  for (let deg = 0; deg < 360; deg += 3) {
    const rad = deg * Math.PI / 180
    const k = quantize8(Math.cos(rad), Math.sin(rad))
    assert.ok(!(k.w && k.s), `${deg}deg produced w+s`)
    assert.ok(!(k.a && k.d), `${deg}deg produced a+d`)
    assert.ok(Object.values(k).filter(Boolean).length <= 2, `${deg}deg produced 3+ keys`)
  }
})

// --- payload parity ---------------------------------------------------------

test('read() carries exactly the wire-relevant shape, plus firingStarted', () => {
  const out = controller().read({ fight: true })
  // firingStarted is a LOCAL-ONLY signal (GameScene.js's haptic trigger) --
  // GameScene explicitly destructures {keys, aimX, aimY} and passes
  // src.actions to net.emit, so this extra field never reaches the wire even
  // though read() itself now returns it.
  assert.deepEqual(Object.keys(out).sort(), ['actions', 'aimX', 'aimY', 'firingStarted', 'keys'])
  assert.deepEqual(Object.keys(out.keys).sort(), ['a', 'd', 's', 'w'])
  assert.deepEqual(Object.keys(out.actions).sort(), ['basic', 'repair', 'second', 'special'])
})

test('idle read() is a valid no-input packet with a finite unit aim', () => {
  const out = controller().read({ fight: true })
  assert.deepEqual(out.keys, { w: false, a: false, s: false, d: false })
  assert.deepEqual(out.actions, { basic: false, special: false, second: false, repair: false })
  assert.ok(Number.isFinite(out.aimX) && Number.isFinite(out.aimY))
  assert.ok(Math.abs(Math.hypot(out.aimX, out.aimY) - 1) < 1e-9)
})

test('basic/special/second are fight-gated and repair is not — same as desktop', () => {
  const c = controller()
  c.setAbilityRects({ special: { x: 500, y: 600, w: 100, h: 50 }, second: { x: 620, y: 600, w: 100, h: 50 } })
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy - LAYOUT.aim.radius) // aim stick full north
  c.pointerDown(2, 550, 625)  // special
  c.pointerDown(3, 670, 625)  // second
  c.pointerDown(4, ...center(LAYOUT.repair))
  const build = c.read({ fight: false })
  assert.deepEqual(build.actions, { basic: false, special: false, second: false, repair: true })
  const fight = c.read({ fight: true })
  assert.deepEqual(fight.actions, { basic: true, special: true, second: true, repair: true })
})

test('aim is a unit vector and persists after the stick is released', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx, LAYOUT.aim.cy - LAYOUT.aim.radius * 2) // past the ring, clamps
  const held = c.read({ fight: true })
  assert.ok(Math.abs(Math.hypot(held.aimX, held.aimY) - 1) < 1e-9)
  assert.ok(held.aimY < -0.99)
  c.pointerUp(1)
  const after = c.read({ fight: true })
  assert.equal(after.aimX, held.aimX)
  assert.equal(after.aimY, held.aimY)
  assert.equal(after.actions.basic, false, 'releasing the stick stops the attack')
})

test('an aim stick inside its deadzone aims nowhere new and does not fire', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx, LAYOUT.aim.cy - LAYOUT.aim.radius * (STICK_DEADZONE_FRAC / 2))
  const out = c.read({ fight: true })
  assert.equal(out.actions.basic, false)
  assert.deepEqual([out.aimX, out.aimY], [1, 0], 'unchanged from the initial aim')
})

// TWO-TIER AIM STICK. Deflection used to fire outright, so a touch player
// could not re-point without throwing a basic attack while a desktop player
// could — which on the ranged basics (Wind, Fire) pulled aggro the player
// never intended. Soft deflection now aims only.
test('a softly deflected aim stick re-aims WITHOUT firing', () => {
  const c = controller()
  const mid = (STICK_DEADZONE_FRAC + STICK_FIRE_FRAC) / 2
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx, LAYOUT.aim.cy - LAYOUT.aim.radius * mid)
  const out = c.read({ fight: true })
  assert.equal(out.actions.basic, false, 'soft deflection fired')
  assert.ok(out.aimY < -0.99, 'soft deflection did not re-aim')
  assert.ok(Math.abs(Math.hypot(out.aimX, out.aimY) - 1) < 1e-9)
})

test('pushing the aim stick past the fire ring aims AND fires', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)
  const out = c.read({ fight: true })
  assert.equal(out.actions.basic, true)
  assert.ok(out.aimX > 0.99)
})

test('easing back inside the fire ring stops firing but holds the aim', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)
  assert.equal(c.read({ fight: true }).actions.basic, true)
  const soft = (STICK_DEADZONE_FRAC + STICK_FIRE_FRAC) / 2
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius * soft, LAYOUT.aim.cy)
  const out = c.read({ fight: true })
  assert.equal(out.actions.basic, false)
  assert.ok(out.aimX > 0.99, 'aim was lost on easing off')
})

test('the drawn fire ring matches the threshold that actually fires', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)
  const k = c.knob('aim')
  assert.ok(Math.abs(k.fireRadius - LAYOUT.aim.radius * STICK_FIRE_FRAC) < 1e-9)
  assert.equal(k.firing, true, 'ring says not firing while read() fires')
  assert.equal(c.read({ fight: true }).actions.basic, true)
})

test('the move stick has no fire threshold — it never reports firing', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.move.cx, LAYOUT.move.cy)
  c.pointerMove(1, LAYOUT.move.cx, LAYOUT.move.cy + LAYOUT.move.radius)
  assert.equal(c.knob('move').firing, false)
})

// A single hard threshold chatters when a thumb rests on it. The server is
// level-triggered so combat is unaffected, but GameScene._sendInput's LOCAL
// attack telegraph is edge-triggered and would respawn a graphic and a tween
// every frame the boundary was recrossed. Desktop's held button cannot chatter.
test('the fire threshold has hysteresis and does not chatter on the boundary', () => {
  const c = controller()
  const at = (frac) => {
    c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius * frac, LAYOUT.aim.cy)
    return c.read({ fight: true }).actions.basic
  }
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  const between = (STICK_RELEASE_FRAC + STICK_FIRE_FRAC) / 2
  assert.equal(at(between), false, 'started firing below the fire threshold')
  assert.equal(at(STICK_FIRE_FRAC + 0.01), true)
  // Now inside the band: still firing, because it must fall past RELEASE.
  assert.equal(at(between), true, 'released inside the hysteresis band')
  assert.equal(at(STICK_RELEASE_FRAC - 0.01), false)
  assert.equal(at(between), false, 're-fired inside the band after releasing')
})

test('the release threshold sits below the fire threshold', () => {
  assert.ok(STICK_RELEASE_FRAC < STICK_FIRE_FRAC)
  assert.ok(STICK_RELEASE_FRAC > STICK_DEADZONE_FRAC, 'release must stay outside the deadzone')
})

test('releasing the stick clears the latch so the next grab does not start firing', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)
  assert.equal(c.read({ fight: true }).actions.basic, true)
  c.pointerUp(1)
  c.pointerDown(2, LAYOUT.aim.cx, LAYOUT.aim.cy)
  const between = (STICK_RELEASE_FRAC + STICK_FIRE_FRAC) / 2
  c.pointerMove(2, LAYOUT.aim.cx + LAYOUT.aim.radius * between, LAYOUT.aim.cy)
  assert.equal(c.read({ fight: true }).actions.basic, false, 'latch survived a release')
})

// firingStarted is the edge GameScene uses to trigger a haptic buzz — the
// one cue for the fire threshold that survives a thumb occluding the ring
// and colour blindness (idle vs firing knob colours are 1.08:1 in
// greyscale). It must fire ONCE on the crossing, not every held frame, and
// never at all outside fight — nothing actually fires there either.
test('firingStarted pulses once on the crossing, not every held frame', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  assert.equal(c.read({ fight: true }).firingStarted, false, 'idle stick reported a start edge')
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)
  assert.equal(c.read({ fight: true }).firingStarted, true, 'crossing the threshold did not pulse')
  assert.equal(c.read({ fight: true }).firingStarted, false, 'pulsed again while already firing')
  assert.equal(c.read({ fight: true }).firingStarted, false)
})

test('firingStarted is false outside fight even if the stick crosses the ring', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)
  assert.equal(c.read({ fight: false }).firingStarted, false)
})

test('releasing and re-crossing pulses firingStarted again', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)
  assert.equal(c.read({ fight: true }).firingStarted, true)
  c.pointerMove(1, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.read({ fight: true })
  c.pointerMove(1, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)
  assert.equal(c.read({ fight: true }).firingStarted, true, 're-crossing did not pulse again')
})

// --- hit-testing / swallowing ----------------------------------------------

test('a touch inside a control is consumed; one outside is not', () => {
  const c = controller()
  assert.equal(c.pointerDown(1, LAYOUT.move.cx, LAYOUT.move.cy), true)
  assert.equal(c.pointerDown(2, ...center(LAYOUT.repair)), true)
  assert.equal(c.pointerDown(3, 640, 300), false, 'mid-board tap must reach build/sell')
})

test('the move stick floats to the thumb but its base stays inside its zone', () => {
  const c = controller()
  const z = LAYOUT.move.zone
  c.pointerDown(1, z.x + 2, z.y + 2) // grabbed at the extreme corner
  const k = c.knob('move')
  assert.ok(k.baseX >= z.x + LAYOUT.move.radius - 1e-9)
  assert.ok(k.baseY >= z.y + LAYOUT.move.radius - 1e-9)
  assert.ok(k.baseX + LAYOUT.move.radius <= z.x + z.w + 1e-9)
})

test('the two sticks are independent and never cross-bind', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.move.cx, LAYOUT.move.cy)
  c.pointerDown(2, LAYOUT.aim.cx, LAYOUT.aim.cy)
  c.pointerMove(1, LAYOUT.move.cx, LAYOUT.move.cy + LAYOUT.move.radius)   // south
  c.pointerMove(2, LAYOUT.aim.cx + LAYOUT.aim.radius, LAYOUT.aim.cy)      // east
  const out = c.read({ fight: true })
  assert.deepEqual(out.keys, { w: false, a: false, s: true, d: false })
  assert.ok(out.aimX > 0.99 && Math.abs(out.aimY) < 1e-9)
})

test('an unbound pointer dragging across a stick does not grab it', () => {
  const c = controller()
  assert.equal(c.pointerMove(9, LAYOUT.move.cx, LAYOUT.move.cy), false)
  assert.deepEqual(c.read({ fight: true }).keys, { w: false, a: false, s: false, d: false })
})

test('sliding a held ability button never re-targets a different button', () => {
  const c = controller()
  const special = { x: 500, y: 600, w: 100, h: 50 }
  const second = { x: 620, y: 600, w: 100, h: 50 }
  c.setAbilityRects({ special, second })
  c.pointerDown(1, ...center(special))
  c.pointerMove(1, ...center(second))
  const out = c.read({ fight: true })
  assert.equal(out.actions.special, true)
  assert.equal(out.actions.second, false)
})

// --- latch safety -----------------------------------------------------------

test('an ability button whose bar disappears releases instead of latching on', () => {
  const c = controller()
  const special = { x: 500, y: 600, w: 100, h: 50 }
  c.setAbilityRects({ special })
  c.pointerDown(1, ...center(special))
  assert.equal(c.read({ fight: true }).actions.special, true)
  c.setAbilityRects({}) // player goes down; bar hides
  assert.equal(c.read({ fight: true }).actions.special, false)
})

test('releaseAll drops every held control (scheme flip / scene shutdown)', () => {
  const c = controller()
  c.pointerDown(1, LAYOUT.move.cx, LAYOUT.move.cy + LAYOUT.move.radius)
  c.pointerDown(2, ...center(LAYOUT.repair))
  c.releaseAll()
  const out = c.read({ fight: true })
  assert.deepEqual(out.keys, { w: false, a: false, s: false, d: false })
  assert.equal(out.actions.repair, false)
  assert.deepEqual(c.boundIds(), [])
})

test('boundIds exposes live pointers so a lost pointerup can be reconciled', () => {
  const c = controller()
  c.pointerDown(7, LAYOUT.move.cx, LAYOUT.move.cy)
  assert.deepEqual(c.boundIds(), [7])
  c.pointerUp(7)
  assert.deepEqual(c.boundIds(), [])
})

// --- layout / touch targets -------------------------------------------------

test('controls sit in the empty bottom corners and do not overlap', () => {
  assert.ok(LAYOUT.move.cx < 1280 / 2 && LAYOUT.aim.cx > 1280 / 2)
  assert.ok(LAYOUT.move.cy > 720 / 2 && LAYOUT.aim.cy > 720 / 2)
  assert.ok(LAYOUT.move.zone.x + LAYOUT.move.zone.w < LAYOUT.aim.zone.x, 'stick zones overlap')
  assert.ok(LAYOUT.repair.y + LAYOUT.repair.h <= LAYOUT.aim.zone.y, 'repair overlaps the aim stick')
  assert.ok(LAYOUT.repair.y > 0 && LAYOUT.repair.x > 0)
})

// Under Scale.FIT the logical surface is a fixed 1280x720 letterboxed into the
// device, so on a phone one logical pixel is a fraction of a CSS pixel. Every
// control has to clear 44 CSS px AFTER that conversion — the bug this guards
// against is authoring the floor in logical units and shipping 13px targets.
test('every control clears 44 CSS px on a phone, a tablet and a desktop', () => {
  for (const cssWidth of [375, 768, 1280]) {
    const displayScale = 1280 / cssWidth
    for (const hudScale of [0.75, 1, 2.5]) {
      const L = layoutTouchControls({ width: 1280, height: 720, displayScale, hudScale })
      const cssPx = (logical) => logical / displayScale
      const label = `${cssWidth}px @ hud ${hudScale}`
      assert.ok(cssPx(L.move.radius * 2) >= TOUCH_MIN_TARGET_CSS_PX, `move stick too small: ${label}`)
      assert.ok(cssPx(L.aim.radius * 2) >= TOUCH_MIN_TARGET_CSS_PX, `aim stick too small: ${label}`)
      assert.ok(cssPx(L.repair.w) >= TOUCH_MIN_TARGET_CSS_PX, `repair too narrow: ${label}`)
      assert.ok(cssPx(L.repair.h) >= TOUCH_MIN_TARGET_CSS_PX, `repair too short: ${label}`)
    }
  }
})

test('controls stay on screen at the largest hudScale on a phone', () => {
  const L = layoutTouchControls({ width: 1280, height: 720, displayScale: 1280 / 375, hudScale: 2.5 })
  assert.ok(L.move.zone.x >= 0 && L.move.zone.y >= 0)
  assert.ok(L.aim.zone.x + L.aim.zone.w <= 1280)
  assert.ok(L.aim.zone.y + L.aim.zone.h <= 720)
  assert.ok(L.repair.y >= 0)
  assert.ok(L.move.zone.x + L.move.zone.w < L.aim.zone.x, 'sticks collide at max scale')
})

// A canvas with no laid-out size makes Phaser report displayScale as Infinity
// (gameSize/0). That is the real state on the first frame after boot and for a
// frame during an orientation change — observed live 2026-08-22 — and it used
// to turn every coordinate into Infinity, i.e. controls that silently do not
// exist and hit-tests that never match.
test('a degenerate displayScale falls back instead of producing Infinity', () => {
  for (const bad of [Infinity, 0, NaN, -1, undefined]) {
    const L = layoutTouchControls({ width: 1280, height: 720, displayScale: bad, hudScale: 1 })
    for (const v of [L.unit, L.move.radius, L.move.cx, L.move.cy, L.aim.cx, L.repair.x, L.repair.y, L.repair.w, L.repair.h]) {
      assert.ok(Number.isFinite(v), `displayScale ${bad} produced ${v}`)
    }
    // And it still hit-tests: a touch on the drawn ring must be consumed.
    const c = controller(L)
    assert.equal(c.pointerDown(1, L.move.cx, L.move.cy), true)
  }
})

test('a corrupt hudScale falls back rather than voiding the controls', () => {
  const L = layoutTouchControls({ width: 1280, height: 720, displayScale: 1, hudScale: NaN })
  assert.ok(Number.isFinite(L.move.radius) && L.move.radius > 0)
})

// --- scheme detection & hints ----------------------------------------------

test('touch capability comes from the pointer API, not the user agent', () => {
  assert.equal(isTouchCapable({ maxTouchPoints: 0 }), false)
  assert.equal(isTouchCapable({ maxTouchPoints: 5 }), true)
})

test('a hybrid device with a fine pointer starts on desktop, a phone on touch', () => {
  const fine = { matchMedia: () => ({ matches: true }) }
  const coarse = { matchMedia: () => ({ matches: false }) }
  assert.equal(prefersTouchFirst({ maxTouchPoints: 10 }, fine), false)
  assert.equal(prefersTouchFirst({ maxTouchPoints: 5 }, coarse), true)
  assert.equal(prefersTouchFirst({ maxTouchPoints: 0 }, coarse), false)
})

test('hints name the controls of the active scheme only', () => {
  const build = { phase: 'build', selectedType: 'FIREPIT' }
  assert.match(inputHints('desktop', build), /^click: build FIREPIT/)
  // A tap/click no longer sells — it selects, and the sale needs the card.
  assert.doesNotMatch(inputHints('touch', build), /sell/)
  assert.doesNotMatch(inputHints('desktop', build), /sell existing/)
  assert.match(inputHints('desktop', build), /\[F\] repair/)
  assert.match(inputHints('touch', build), /^tap: build FIREPIT/)
  assert.match(inputHints('touch', build), /REPAIR button/)
  assert.doesNotMatch(inputHints('touch', build), /\[F\]/)
  assert.match(inputHints('desktop', { phase: 'fight' }), /WASD move/)
  assert.match(inputHints('touch', { phase: 'fight' }), /left stick move/)
  assert.doesNotMatch(inputHints('touch', { phase: 'fight' }), /WASD|click/)
})
