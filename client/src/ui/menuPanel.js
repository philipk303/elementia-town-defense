// The in-game menu: what the buttons do, and how to start the run over.
//
// WHY DOM, NOT PHASER. Same receipts as client/src/ui/buildPalette.js: three
// of the four Phaser-drawn UI surfaces sized their touch targets in LOGICAL
// pixels, which under Scale.FIT is a fraction of a real pixel, shipping 7.6px
// ability buttons. DOM is authored in real CSS pixels, so a 44px target is 44
// real pixels everywhere and the browser does the hit-testing.
//
// WHY THERE IS NO PAUSE. The sim is server-authoritative at 60Hz
// (server/game/loop.js) and a room always holds four slots with bots filling
// every empty seat (server/rooms/index.js), so there is no offline mode and a
// client-side freeze would only make the client snap forward on resume. The
// menu opens OVER a running match. Pause was dropped from the playtest backlog
// on 2026-08-31 in favour of exactly this: read the controls, or start over.
//
// Pure-ish: controlsFor() decides WHAT is written and is testable without a
// browser; createMenuPanel() owns DOM and nothing else.

const MIN_TARGET_PX = 44

// One row = one thing the player can do. Written per scheme rather than
// per platform-forked prose, so a control is named once. The keyboard column
// is the verified binding set from client/src/scenes/GameScene.js -- re-verify
// there, not here, if a binding moves. test/client/menuPanel.test.js reads
// that file and fails if the two drift apart.
const KEYBOARD_GROUPS = [
  {
    title: 'Move and fight',
    rows: [
      ['Move', 'W A S D'],
      ['Basic attack', 'Hold mouse button'],
      ['Special ability', 'Q'],
      ['Second ability (level 4)', 'E'],
      ['Repair a structure', 'F'],
    ],
  },
  {
    title: 'Build phase',
    rows: [
      ['Pick what to build', '1 - 9'],
      ['Build or inspect a tile', 'Click the tile'],
      ['Rotate the footprint', 'R'],
      ['Set output direction', 'Arrow keys'],
      ['Ready up', 'READY button'],
    ],
  },
  {
    title: 'Everything else',
    rows: [
      ['Accept a fusion offer', 'Y'],
      ['Decline a fusion offer', 'N'],
      ['Aim a fusion before accepting', 'Arrow keys'],
      ['Mute and unmute', 'M'],
      ['Shrink or grow the HUD', '[ and ]'],
    ],
  },
]

// Touch has no keys at all, so naming one would send a player hunting for a
// control they do not have -- the same reasoning that stripped key prose out
// of inputHints() for touch (client/src/input/touchControls.js:377).
const TOUCH_GROUPS = [
  {
    title: 'Move and fight',
    rows: [
      ['Move', 'Left stick'],
      ['Aim and attack', 'Right stick'],
      ['Special ability', 'Q button'],
      ['Second ability (level 4)', 'E button'],
      ['Repair a structure', 'REPAIR button'],
    ],
  },
  {
    title: 'Build phase',
    rows: [
      ['Pick what to build', 'BUILD palette'],
      ['Place it', 'Tap the tile, then tap again to confirm'],
      ['Rotate the footprint', 'ROTATE button'],
      ['Set output direction', 'N E S W buttons'],
      ['Ready up', 'READY button'],
    ],
  },
  {
    title: 'Everything else',
    rows: [
      ['Answer a fusion offer', 'On-screen accept or decline'],
      ['Mute and unmute', 'SOUND button'],
      ['Shrink or grow the HUD', 'HUD minus and HUD plus buttons'],
    ],
  },
]

// scheme comes from GameScene._inputScheme, which prefersTouchFirst() seeds
// and _noteSchemeUsed() flips on the first real keypress. Do NOT add a second
// notion of input mode here.
export function controlsFor(scheme) {
  return scheme === 'touch' ? TOUCH_GROUPS : KEYBOARD_GROUPS
}

const CSS = `
.ec-scrim {
  position: fixed; top: 0; left: 0; right: 0; bottom: var(--ep-dock, 0px);
  z-index: 200; background: rgba(4, 8, 13, 0.82);
  display: none; align-items: center; justify-content: center; padding: 12px;
  touch-action: manipulation;
}
.ec-scrim.ec-open { display: flex; }
.ec-panel {
  font-family: monospace; color: #e8f2ff;
  background: #0d141d; border: 1px solid #b4c9e0; border-radius: 8px;
  max-width: 560px; width: 100%; max-height: 100%;
  overflow-y: auto; padding: 12px 14px;
}
.ec-panel:focus { outline: 3px solid #8affc0; outline-offset: -3px; }
.ec-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.ec-title { font-size: 17px; font-weight: bold; flex: 1 1 auto; }
.ec-note { font-size: 12px; color: #ffd27a; margin: 0 0 10px; }
.ec-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  padding-bottom: 10px; border-bottom: 1px solid #2f4b6e; }
.ec-warn { font-size: 12px; color: #ffd27a; flex-basis: 100%; margin: 0; }
.ec-group { font-size: 14px; font-weight: bold; color: #8affc0; margin: 12px 0 4px; }
.ec-list { margin: 0; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; }
.ec-list dt { font-size: 13px; }
.ec-list dd { margin: 0; font-size: 13px; color: #ffd27a; text-align: right; }
.ec-btn {
  min-height: ${MIN_TARGET_PX}px; min-width: ${MIN_TARGET_PX}px;
  padding: 4px 12px; font-family: monospace; font-size: 13px;
  background: #16202c; color: #e8f2ff; border: 1px solid #b4c9e0;
  border-radius: 6px; cursor: pointer; touch-action: manipulation;
}
/* The confirm step is the destructive one, so it is the one that looks it.
   Carried by border weight and background as well as hue -- a colour-only
   state fails WCAG 1.4.1, which the design review found elsewhere in the HUD. */
.ec-danger { background: #3a1e1e; border: 2px solid #ff9c9c; color: #ffe3e3; font-weight: bold; }
`

// An element can only take focus if it still has a layout box. Checked with
// getClientRects rather than offsetParent, which is null for position:fixed
// elements even when they are perfectly visible -- and both doors into this
// panel are position:fixed.
function focusable(el) {
  return !!el && el.isConnected && el.getClientRects().length > 0
}

// onRestart: fired only after the player confirms. Restart wipes the run for
// EVERYONE in the room -- anyone in the room may press it (product decision,
// 2026-08-31) -- so the confirm step is what stands between a misclick and
// four people losing their progress.
//
// focusAfterClose: called when the button that OPENED the menu is gone by the
// time it closes. That is not a corner case here -- the build-phase door and
// the action-phase door swap on every phase change, and a phase can turn over
// while the menu is open, which it did in live verification on 2026-08-31.
// Without it a keyboard or screen-reader user is dropped at the top of the
// document with no way back.
export function createMenuPanel({ onClose, onRestart, focusAfterClose } = {}) {
  if (typeof document === 'undefined') return null
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const scrim = document.createElement('div')
  scrim.className = 'ec-scrim'
  const panel = document.createElement('div')
  panel.className = 'ec-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-labelledby', 'ec-title')
  // Focused on open so a screen reader lands inside the dialog rather than
  // being left wherever the opener was; -1 keeps it out of the tab order.
  panel.tabIndex = -1

  const head = document.createElement('div')
  head.className = 'ec-head'
  const title = document.createElement('span')
  title.className = 'ec-title'
  title.id = 'ec-title'
  title.textContent = 'MENU'
  const closeBtn = document.createElement('button')
  closeBtn.className = 'ec-btn'
  closeBtn.textContent = 'CLOSE X'
  head.append(title, closeBtn)

  const note = document.createElement('p')
  note.className = 'ec-note'
  note.textContent = 'The match keeps running while this is open.'

  // --- restart, behind a confirm ---
  const actions = document.createElement('div')
  actions.className = 'ec-actions'
  // The confirm swaps the buttons in place, so a screen reader has to be told
  // the row changed under it rather than being left announcing a stale label.
  actions.setAttribute('aria-live', 'polite')
  const restartBtn = document.createElement('button')
  restartBtn.className = 'ec-btn'
  restartBtn.textContent = 'RESTART MATCH'
  const confirmBtn = document.createElement('button')
  confirmBtn.className = 'ec-btn ec-danger'
  confirmBtn.textContent = 'YES, RESTART'
  const cancelBtn = document.createElement('button')
  cancelBtn.className = 'ec-btn'
  cancelBtn.textContent = 'CANCEL'
  const warn = document.createElement('p')
  warn.className = 'ec-warn'
  actions.append(restartBtn, confirmBtn, cancelBtn, warn)

  const body = document.createElement('div')
  panel.append(head, note, actions, body)
  scrim.append(panel)
  document.body.append(scrim)

  let open = false
  let scheme = null
  let opener = null
  let confirming = false

  function renderActions() {
    restartBtn.style.display = confirming ? 'none' : ''
    confirmBtn.style.display = confirming ? '' : 'none'
    cancelBtn.style.display = confirming ? '' : 'none'
    warn.textContent = confirming
      ? 'Starts over at wave 1. Everyone in the room loses this run.'
      : ''
  }

  function renderBody() {
    body.textContent = ''
    for (const group of controlsFor(scheme)) {
      const h = document.createElement('div')
      h.className = 'ec-group'
      h.textContent = group.title
      const dl = document.createElement('dl')
      dl.className = 'ec-list'
      for (const [action, keys] of group.rows) {
        const dt = document.createElement('dt')
        dt.textContent = action
        const dd = document.createElement('dd')
        dd.textContent = keys
        dl.append(dt, dd)
      }
      body.append(h, dl)
    }
  }

  function setScheme(nextScheme) {
    const want = nextScheme === 'touch' ? 'touch' : 'desktop'
    if (want === scheme) return
    scheme = want
    renderBody()
  }

  function close() {
    if (!open) return
    open = false
    // Never leave the menu armed: reopening it must not present a live
    // one-press destructive button the player does not expect.
    confirming = false
    renderActions()
    scrim.classList.remove('ec-open')
    // Return focus where it came from; if that door has since been hidden by a
    // phase change, fall back to whichever door is on screen now.
    const back = focusable(opener) ? opener : focusAfterClose?.()
    if (focusable(back)) back.focus()
    opener = null
    onClose?.()
  }

  function show(nextScheme, from) {
    setScheme(nextScheme)
    if (open) return
    open = true
    opener = from || document.activeElement
    scrim.classList.add('ec-open')
    panel.focus()
  }

  restartBtn.addEventListener('click', (e) => {
    e.preventDefault()
    confirming = true
    renderActions()
    // Focus follows the button that replaced the one just pressed, or a
    // keyboard user is left focused on a now-hidden element.
    confirmBtn.focus()
  })
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault()
    confirming = false
    renderActions()
    restartBtn.focus()
  })
  confirmBtn.addEventListener('click', (e) => {
    e.preventDefault()
    onRestart?.()
    // The server answers with a fresh GAME_START; there is nothing left in
    // here worth reading, so get out of the player's way.
    close()
  })

  closeBtn.addEventListener('click', (e) => { e.preventDefault(); close() })
  // Tapping the dark surround closes, the standard dismissal for an overlay.
  // Only the scrim itself -- a click that bubbled up from inside the panel
  // must not count as a click outside it.
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close() })
  // Escape is handled on the panel, not the window: Phaser owns window-level
  // keys and this must not become a second global listener to reason about.
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      // Escape backs out of the confirm first. Arming a destructive action and
      // then hitting Escape means "no", not "close the whole menu".
      if (confirming) { confirming = false; renderActions(); restartBtn.focus(); return }
      close()
      return
    }
    // aria-modal claims focus is trapped, so it has to actually be trapped, or
    // a keyboard user tabs out into a game they cannot see behind the scrim.
    // Only the buttons currently SHOWN count -- the restart row hides half of
    // itself depending on whether the confirm is armed.
    if (e.key !== 'Tab') return
    const stops = [...panel.querySelectorAll('button')].filter(focusable)
    if (!stops.length) return
    const i = stops.indexOf(document.activeElement)
    e.preventDefault()
    if (i === -1) { stops[0].focus(); return }
    const next = e.shiftKey ? (i - 1 + stops.length) % stops.length : (i + 1) % stops.length
    stops[next].focus()
  })

  setScheme('desktop')
  renderActions()

  return {
    open(nextScheme, from) { show(nextScheme, from) },
    close,
    toggle(nextScheme, from) { if (open) close(); else show(nextScheme, from) },
    isOpen() { return open },
    isConfirmingRestart() { return confirming },
    // Called per frame by GameScene; re-renders only when the scheme actually
    // flips, so a hybrid device that switches mid-match updates in place.
    setScheme,
    destroy() { scrim.remove(); style.remove() },
  }
}

export { MIN_TARGET_PX }
