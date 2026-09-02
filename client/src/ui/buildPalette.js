// Build-phase control palette: structure selection, rotate, output direction,
// mute, HUD scale, and ready-up.
//
// WHY THIS IS DOM AND NOT PHASER GRAPHICS. Every one of these controls existed
// only as a keydown before 2026-08-22 (Digit1-9, R, arrows, M, [ ]), so a
// touch player was locked to BUILDABLE_TYPES[0] in orientation H facing north,
// forever -- able to fight, unable to manage a build phase at all.
//
// The obvious fix was to draw buttons in Phaser like the rest of the HUD. Two
// reviews that day argued against it with receipts: three of the four
// Phaser-drawn UI surfaces had sized their touch targets in LOGICAL pixels,
// which under Scale.FIT is a fraction of a real pixel (about 0.29 on a 375px
// phone), shipping 7.6px ability buttons and 8.8px fusion buttons. DOM is
// authored in real CSS pixels, so that entire bug class cannot occur here: a
// 44px button is 44 real pixels on every device, text renders at true size,
// and the browser does the hit-testing, so a tap can never fall through to
// build or sell the tile underneath. `readyBtn` in main.js already set the
// precedent; this absorbs it.
//
// Pure-ish: this module owns DOM and layout only. It holds no game state and
// makes no decisions -- GameScene pushes a state object in and gets callbacks
// out, so what a button MEANS stays in one place.

import { BUILDABLE_TYPES, DIRECTIONAL_TYPES, STRUCTURE_TYPES } from '../../../shared/constants.js'

// Real CSS pixels, the whole point of the module. 44 is the WCAG 2.5.5 /
// platform-HIG minimum touch target.
const MIN_TARGET_PX = 44

const CSS = `
.ep-root {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 150;
  font-family: monospace; color: #e8f2ff;
  background: rgba(8, 13, 20, 0.94);
  border-top: 1px solid #b4c9e0;
  display: none; flex-direction: column; gap: 6px; padding: 6px 8px;
  touch-action: manipulation;
  /* syncDock() below reserves at most 40% of viewport height for this strip
     (window.innerHeight * 0.4) and used to rely on that JS cap ALONE to keep
     the palette off the board -- there was no matching CSS bound, so nine
     buttons that each grew a thumbnail (spec §2) could in principle render
     taller than the reservation and visually overlap the canvas on a short
     phone, with no way to reach the overflow content. 40vh here is the same
     40% expressed in CSS, and overflow-y makes exceeding it a scroll instead
     of a silent overlap -- belt-and-suspenders with the JS cap, not a
     replacement for it. */
  max-height: 40vh; overflow-y: auto;
}
.ep-root.ep-open { display: flex; }
.ep-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
/* Nine types WRAP rather than scroll. At 375px they shrink to the 44px floor
   and need 444px of row, so two of them -- both directional, the ones whose
   selection then widens the control row -- sat off the right edge behind a
   scrollbar that is invisible at rest on touch. Wrapping shows all nine. */
.ep-types { overflow: hidden; }
.ep-btn {
  min-height: ${MIN_TARGET_PX}px; min-width: ${MIN_TARGET_PX}px;
  padding: 4px 10px; font-family: monospace; font-size: 13px; line-height: 1.2;
  background: #16202c; color: #e8f2ff; border: 1px solid #b4c9e0;
  border-radius: 6px; cursor: pointer; white-space: nowrap;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  touch-action: manipulation;
  /* Labels are wider than a 44px button at phone widths and used to spill
     across the gap onto their neighbours. */
  overflow: hidden;
}
/* Disabled is an explicit dimmed PALETTE, not an opacity multiplier. Opacity
   compounded with .ep-why's own 0.8 to put the reason text -- the entire point
   of the feature -- at 2.67:1, the least legible thing on the panel.
   aria-disabled, NOT the native disabled attribute (2026-08-23): a natively
   disabled button drops out of the tab order and, in several screen readers,
   out of the accessible name tree entirely -- so a keyboard/SR user could
   never REACH the reason text that explains the refusal. aria-disabled keeps
   it focusable and announced; the click handler checks it and no-ops. */
.ep-btn[aria-disabled="true"] {
  cursor: not-allowed; color: #8c99a8; background: #10171f; border-color: #3a4a5c;
}
.ep-btn[aria-disabled="true"] .ep-cost { color: #8c99a8; }
/* Decorative, sliced from the shipped sheets in CSS (spec §2) -- width/height/
   background-size/background-position are per-type numbers set inline by
   GameScene (client/src/render/buildThumbnails.js), never in this stylesheet.
   Dimmed with a filter, NOT opacity: opacity on this element would stack with
   the button's own dimming exactly the way it already did for .ep-why once
   (see the aria-disabled comment above). */
.ep-thumb {
  display: block; background-repeat: no-repeat; image-rendering: pixelated;
  margin-bottom: 2px; flex: none;
}
.ep-btn[aria-disabled="true"] .ep-thumb { filter: grayscale(0.7) brightness(0.6); }
/* Selection is carried by BORDER WEIGHT and a background shift, not by hue
   alone -- the design review found several colour-only states failing WCAG
   1.4.1 elsewhere in the HUD. */
.ep-btn.ep-on { background: #2a5a3a; border: 3px solid #8affc0; font-weight: bold; }
.ep-cost { font-size: 11px; opacity: 0.85; }
/* Full opacity and a readable size: this is the text that tells the player
   why they cannot build the thing they just tapped. */
.ep-why { font-size: 11px; color: #ffd27a; }
.ep-gold { font-size: 15px; font-weight: bold; padding: 0 8px; white-space: nowrap; }
.ep-spacer { flex: 1 1 auto; }
/* READY is pinned to the end of its row and can never be pushed off-screen.
   Absorbing it from main.js made it the ONLY way to ready up -- there is no
   keyboard shortcut -- and with a directional type selected the row's natural
   width ran 207px past a 375px viewport, which in ready-up timing mode is a
   hard stall with no recovery. */
.ep-ready { background: #1e3a2a; border-color: #3a6a4a; margin-left: auto; }
.ep-ready.ep-on { background: #2a5a3a; }
.ep-tab {
  position: fixed; right: 8px; z-index: 151;
  min-height: ${MIN_TARGET_PX}px; padding: 4px 12px;
  font-family: monospace; font-size: 13px;
  background: rgba(8, 13, 20, 0.94); color: #e8f2ff;
  border: 1px solid #b4c9e0; border-radius: 6px 6px 0 0; cursor: pointer;
  display: none; touch-action: manipulation;
}
.ep-tab.ep-show { display: block; }
/* The action-phase door to the menu. It lives in the SAME bottom
   dock as the palette rather than floating over the board, because every
   corner of the canvas is already spoken for: HUD text and status bars top
   left, the wave preview pinned at width-198 top right, and on touch the two
   sticks bottom left and right with the ability bar between them and REPAIR
   above the aim stick. Docking reserves its height through --ep-dock, so
   overlap is impossible by construction rather than by measurement. */
.ep-help {
  position: fixed; left: 8px; bottom: 0; z-index: 151;
  min-height: ${MIN_TARGET_PX}px; padding: 4px 12px;
  font-family: monospace; font-size: 13px;
  background: rgba(8, 13, 20, 0.94); color: #e8f2ff;
  border: 1px solid #b4c9e0; border-radius: 6px 6px 0 0; cursor: pointer;
  display: none; touch-action: manipulation;
}
.ep-help.ep-show { display: block; }
`

// Short labels: the full constant names do not fit a 44px-tall button on a
// phone, and "EARTH SPECIAL" tells a player less than "ROCK TRAP" does.
const SHORT_LABEL = {
  BARRICADE: 'BARRICADE', SNARE_POST: 'SNARE', WATCHTOWER: 'TOWER',
  FARM: 'FARM', MARKETPLACE: 'MARKET',
  EARTH_SPECIAL: 'ROCK TRAP', FIRE_SPECIAL: 'FIREPIT',
  WATER_SPECIAL: 'GEYSER', WIND_SPECIAL: 'VORTEX',
}

export function shortLabel(type) {
  return SHORT_LABEL[type] || type.replace(/_/g, ' ')
}

// Reason codes -> the terse thing to print under a disabled button. The point
// is that the player is told WHY now: before this, the only signal was the
// placement ghost turning red once they already tried.
const REASON_TEXT = {
  gold: 'no gold',
  element: 'not yours',
  farms: 'needs farms',
}

export function reasonText(reason) {
  return REASON_TEXT[reason] || ''
}

export function createBuildPalette(handlers = {}, thumbnails = new Map()) {
  if (typeof document === 'undefined') return null
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.className = 'ep-root'
  const tab = document.createElement('button')
  tab.className = 'ep-tab'
  tab.textContent = 'BUILD ▲'
  // Second door to the menu, for the action phase where the palette itself is
  // hidden. The first door is the MENU button in ctrlRow below. Both call the
  // same handler so there is one definition of what it opens.
  const help = document.createElement('button')
  help.className = 'ep-help'
  help.textContent = 'MENU'
  help.setAttribute('aria-label', 'Open the menu: controls and restart')
  help.addEventListener('click', (e) => { e.preventDefault(); handlers.onMenu?.(help) })
  document.body.append(root, tab, help)

  const typeRow = document.createElement('div')
  typeRow.className = 'ep-row ep-types'
  const ctrlRow = document.createElement('div')
  ctrlRow.className = 'ep-row'
  root.append(typeRow, ctrlRow)

  const mkBtn = (cls, text, onClick) => {
    const b = document.createElement('button')
    b.className = `ep-btn ${cls}`.trim()
    b.textContent = text
    b.addEventListener('click', (e) => { e.preventDefault(); onClick() })
    return b
  }

  // --- type buttons, one per buildable ---
  const typeBtns = new Map()
  for (const type of BUILDABLE_TYPES) {
    const b = document.createElement('button')
    b.className = 'ep-btn'
    b.setAttribute('aria-disabled', 'false')
    b.addEventListener('click', (e) => {
      e.preventDefault()
      // aria-disabled blocks the ACTION, not native disabled -- see the CSS
      // comment above. A disabled button stays reachable so a keyboard/SR
      // user can hear why, but a click must still no-op.
      if (b.getAttribute('aria-disabled') === 'true') return
      handlers.onSelectType?.(type)
    })
    const name = document.createElement('span')
    const cost = document.createElement('span')
    cost.className = 'ep-cost'
    const why = document.createElement('span')
    why.className = 'ep-why'
    name.textContent = shortLabel(type)
    // Decorative only -- aria-label below already carries name, cost and any
    // refusal reason, and a screen reader double-reading the image would be
    // worse than no image (spec §2).
    const rect = thumbnails.get(type)
    if (rect) {
      const thumb = document.createElement('span')
      thumb.className = 'ep-thumb'
      thumb.setAttribute('aria-hidden', 'true')
      thumb.style.width = `${rect.w}px`
      thumb.style.height = `${rect.h}px`
      thumb.style.backgroundImage = `url(${rect.src})`
      thumb.style.backgroundSize = `${rect.bgW}px ${rect.bgH}px`
      thumb.style.backgroundPosition = `-${rect.bgX}px -${rect.bgY}px`
      b.append(thumb)
    }
    b.append(name, cost, why)
    typeRow.append(b)
    typeBtns.set(type, { b, cost, why })
  }

  // --- context + global controls ---
  const gold = document.createElement('span')
  gold.className = 'ep-gold'
  // Wallet changes with every build/sell; a screen-reader user should hear
  // the new total without having to re-focus the element.
  gold.setAttribute('aria-live', 'polite')
  const rotate = mkBtn('', 'ROTATE', () => handlers.onRotate?.())
  const dirBtns = ['N', 'E', 'S', 'W'].map(d => ({ d, b: mkBtn('', d, () => handlers.onDir?.(d)) }))
  const mute = mkBtn('', 'SOUND', () => handlers.onMute?.())
  const hudDown = mkBtn('', 'HUD −', () => handlers.onHudScale?.(-1))
  const hudLabel = document.createElement('span')
  hudLabel.className = 'ep-cost'
  const hudUp = mkBtn('', 'HUD +', () => handlers.onHudScale?.(1))
  const spacer = document.createElement('span')
  spacer.className = 'ep-spacer'
  const menu = mkBtn('', 'MENU', () => handlers.onMenu?.(menu))
  menu.setAttribute('aria-label', 'Open the menu: controls and restart')
  const ready = mkBtn('ep-ready', 'READY ✓', () => handlers.onReady?.())
  ctrlRow.append(gold, rotate, ...dirBtns.map(x => x.b), mute, hudDown, hudLabel, hudUp, menu, spacer, ready)

  let open = true
  tab.addEventListener('click', (e) => {
    e.preventDefault()
    open = !open
    tab.textContent = open ? 'BUILD ▼' : 'BUILD ▲'
    render()
  })

  let state = null

  let dock = 0
  // offsetHeight forces a synchronous layout, and render() runs every frame
  // by design (see the update() comment below). Caching it and invalidating
  // only on the inputs that can actually change wrapped-row height -- open,
  // visible, viewport width, and which contextual buttons are shown -- keeps
  // the per-frame cost to a style read, not a forced reflow, without
  // resurrecting the whole-state diff that caused a real stale-UI bug
  // earlier this project (see update() below).
  let cachedHeight = 0
  let heightInputsKey = ''
  // Read ONLY after every layout-affecting DOM write for this frame has
  // landed (rotate/direction visibility can change wrapped-row count), and
  // only re-measure (forcing a reflow) when an input that could change
  // height actually changed. Previously this read offsetHeight at the TOP of
  // render(), before THIS frame's rotate/dir visibility was written -- a
  // one-frame-stale measurement on top of being an unconditional reflow.
  function measuredHeight() {
    const key = [
      state?.visible, open, state?.showRotate, state?.showDir, window.innerWidth,
    ].join('|')
    if (key !== heightInputsKey) {
      heightInputsKey = key
      // When the palette is hidden the dock still reserves the help
      // button's height -- it is the only control on screen in the action
      // phase, and floating it over the canvas is what the docking exists to
      // avoid.
      if (!state?.visible) cachedHeight = help.offsetHeight
      else cachedHeight = open ? root.offsetHeight : tab.offsetHeight
    }
    return cachedHeight
  }

  // Height of screen the palette (or, collapsed, just its tab) occupies at the
  // bottom. Published as the --ep-dock CSS variable, which #game subtracts from
  // its own height: the canvas is then FIT into the space ABOVE this strip and
  // the palette cannot overlap the board at all.
  //
  // The earlier approach measured this height and subtracted it from the
  // CANVAS layout instead. That was wrong, because the palette is fixed to the
  // VIEWPORT while the canvas is letterboxed inside it — on a phone in
  // portrait the palette sits entirely in the black bar below the canvas, real
  // overlap zero, and subtracting its height anyway pushed the REPAIR button
  // back to the top of the screen. Reserving the space is both simpler and
  // correct on every device.
  function syncDock() {
    // Capped so a tall palette on a short screen cannot squeeze the canvas to
    // nothing; the strip scrolls internally rather than eating the game.
    const want = Math.min(measuredHeight(), window.innerHeight * 0.4)
    if (Math.abs(want - dock) < 0.5) return
    dock = want
    document.documentElement.style.setProperty('--ep-dock', `${dock}px`)
    handlers.onDockChange?.(dock)
  }

  function render() {
    if (!state) return
    root.classList.toggle('ep-open', state.visible && open)
    tab.classList.toggle('ep-show', state.visible)
    // Exactly one menu door is on screen at a time: the ctrlRow button while
    // the palette is up, this one while it is not.
    help.classList.toggle('ep-show', !state.visible)
    if (!state.visible) { tab.style.bottom = '0px'; syncDock(); return }

    gold.textContent = state.gold == null ? '' : `${state.gold} gold`
    for (const [type, { b, cost, why }] of typeBtns) {
      const info = state.types?.[type] || {}
      const disabled = info.ok === false
      b.classList.toggle('ep-on', type === state.selectedType)
      b.setAttribute('aria-disabled', disabled ? 'true' : 'false')
      cost.textContent = `${info.cost ?? '?'}g`
      why.textContent = disabled ? reasonText(info.reason) : ''
      // One accessible name carrying everything the sighted layout shows
      // across three separate <span>s: the type, its cost, and (if refused)
      // why -- so a screen reader gets the whole picture in one announcement.
      const label = `${shortLabel(type)}, ${info.cost ?? '?'} gold` +
        (disabled ? `, unavailable: ${reasonText(info.reason)}` : '') +
        (type === state.selectedType ? ', selected' : '')
      b.setAttribute('aria-label', label)
    }
    // Contextual controls appear only when they DO something: rotate returns
    // early for a square footprint, and only two buildables are directional,
    // so a permanently dead button would be worse than no button.
    rotate.style.display = state.showRotate ? '' : 'none'
    rotate.textContent = `ROTATE ${state.orient || ''}`.trim()
    for (const { d, b } of dirBtns) {
      b.style.display = state.showDir ? '' : 'none'
      b.classList.toggle('ep-on', state.showDir && d === state.dir)
    }
    mute.textContent = state.muted ? 'SOUND OFF' : 'SOUND ON'
    hudLabel.textContent = `${(state.hudScale ?? 1).toFixed(2)}x`
    ready.classList.toggle('ep-on', !!state.readied)
    ready.textContent = state.readied ? 'READY ✓ (waiting…)' : 'READY ✓'

    // Measured LAST, after every write above that can affect wrapped-row
    // height (rotate/direction visibility). syncDock feeds the canvas its
    // reserved height; tab.style.bottom keeps the collapse tab flush with
    // whichever edge is currently showing.
    tab.style.bottom = (open ? measuredHeight() : 0) + 'px'
    syncDock()
  }

  return {
    // Called every frame by GameScene, and it renders every frame.
    //
    // This deliberately does NOT diff the state and skip unchanged frames. The
    // first version did, and it left the DOM showing a previous selection's
    // contextual controls — the rotate and direction buttons stayed hidden
    // after picking a directional structure, even though the state pushed in
    // was correct. Caught live, 2026-08-22. Eighteen elements at display rate
    // is not a cost worth risking correctness for; if it ever becomes one,
    // diff per-element rather than skipping the whole render.
    update(next) {
      state = next
      render()
    },
    // CSS px of screen this dock occupies. The canvas is sized to exclude it,
    // so callers do NOT need to inset their own layouts by it.
    dockPx() { return dock },
    // Whichever MENU door is currently on screen. The two swap on every phase
    // change, so the menu asks for this when returning focus rather than
    // assuming the button that opened it still exists.
    visibleMenuDoor() {
      return state?.visible ? (open ? menu : null) : help
    },
    destroy() {
      document.documentElement.style.removeProperty('--ep-dock')
      root.remove(); tab.remove(); help.remove(); style.remove()
    },
  }
}

// Which type-level checks fail, independent of any particular tile. Pure so it
// can be tested without Phaser; GameScene supplies the numbers it already has.
// Tile-level checks (bounds, overlap, the no-build arc) stay in
// _placementValidity, because they depend on where the player is pointing.
export function typeAvailability(type, {
  gold, element, players = [], structures = [], costs = {}, specialElement = {},
  farmsPerMarketplace = 2,
} = {}) {
  const lockedEl = specialElement[type]
  if (lockedEl && lockedEl !== element) {
    const owner = players.find(p => p.element === lockedEl)
    if (!owner?.isBot) return { ok: false, reason: 'element', cost: costs[type] }
  }
  if (type === STRUCTURE_TYPES.MARKETPLACE) {
    const farms = structures.filter(s => s.type === STRUCTURE_TYPES.FARM).length
    const markets = structures.filter(s => s.type === STRUCTURE_TYPES.MARKETPLACE).length
    if (farms < (markets + 1) * farmsPerMarketplace) {
      return { ok: false, reason: 'farms', cost: costs[type] }
    }
  }
  const cost = costs[type]
  // An UNKNOWN wallet is not a known-empty one — same rule the placement ghost
  // uses. The server stays authoritative either way.
  if (gold != null && cost != null && gold < cost) return { ok: false, reason: 'gold', cost }
  return { ok: true, cost }
}

export { MIN_TARGET_PX, DIRECTIONAL_TYPES }
