// Character-select screen (lobby, after ROOM_JOINED, before match start).
// Spec §5: pick an element, see its art and real stats. Functional pass only
// -- the full visual theme (§6) is a later, separate task; this just needs to
// be correctly structured so that pass can slot in without a rewrite.
//
// Pure-ish like buildPalette.js: owns DOM and layout only, holds no network
// state. main.js pushes { mine, players } in via render() and gets a
// callback out when a card is clicked.
import { ELEMENTS } from '../../../shared/constants.js'
import { allCharacterSummaries } from './characterStats.js'

// Pure card-state rule, split out so it's unit-testable without a DOM (same
// convention as buildPalette.js's typeAvailability). A bot-held slot is
// always swappable -- bots only backfill on match start, never before -- so
// only another HUMAN's own pick blocks a card.
export function elementCardState(element, players, myPlayerId) {
  const occupant = players.find(p => p.element === element)
  const isMine = occupant?.id === myPlayerId
  const blockedByHuman = !!occupant && !occupant.isBot && !isMine
  const ownerLabel = isMine ? 'You' : (occupant && !occupant.isBot ? occupant.displayName : '')
  return { isMine, blockedByHuman, ownerLabel }
}

const CSS = `
.cs-root {
  position: fixed; inset: 0; z-index: 120; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 18px;
  background: #0a0e14; font-family: monospace; color: #dfe8f0;
}
.cs-root.hidden { display: none; }
.cs-title { font-size: 20px; letter-spacing: 1px; color: #e0b34c; }
.cs-grid { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; max-width: 920px; }
.cs-card {
  width: 190px; display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 12px; background: #16202c; border: 2px solid #2b3a4a; border-radius: 8px;
  cursor: pointer; text-align: center;
}
.cs-card:hover { background: #1e2c3a; }
.cs-card.cs-mine { border-color: #8affc0; }
.cs-card.cs-taken { opacity: 0.45; cursor: not-allowed; }
.cs-art {
  width: 96px; height: 96px; display: flex; align-items: flex-end; justify-content: center;
}
.cs-art span { display: block; background-repeat: no-repeat; image-rendering: pixelated; }
.cs-name { font-size: 15px; font-weight: bold; }
.cs-owner { font-size: 12px; color: #6b7d8f; min-height: 15px; }
.cs-stats { font-size: 12px; color: #b8c8d8; line-height: 1.5; }
.cs-abilities { font-size: 11px; color: #8fa0b0; }
.cs-continue { margin-top: 6px; }
.cs-error { color: #e05c5c; min-height: 18px; font-size: 13px; }
`

export function createCharacterSelect(handlers = {}) {
  if (typeof document === 'undefined') return null
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.className = 'cs-root hidden'

  const title = document.createElement('div')
  title.className = 'cs-title'
  title.textContent = 'Choose your element'

  const grid = document.createElement('div')
  grid.className = 'cs-grid'
  root.append(title, grid)
  document.body.append(root)

  const cards = new Map()
  for (const summary of allCharacterSummaries()) {
    const card = document.createElement('div')
    card.className = 'cs-card'
    card.setAttribute('role', 'button')
    card.setAttribute('tabindex', '0')

    const art = document.createElement('div')
    art.className = 'cs-art'
    art.setAttribute('aria-hidden', 'true')

    const name = document.createElement('div')
    name.className = 'cs-name'
    name.textContent = summary.label

    const owner = document.createElement('div')
    owner.className = 'cs-owner'

    const stats = document.createElement('div')
    stats.className = 'cs-stats'
    stats.textContent = `HP ${summary.hp ?? '?'} · Attack ${summary.basicDamage ?? '?'}`

    const abilities = document.createElement('div')
    abilities.className = 'cs-abilities'
    const parts = [summary.specialName, summary.secondName].filter(Boolean)
    abilities.textContent = parts.length ? parts.join(' · ') : ''

    const select = () => {
      if (card.classList.contains('cs-taken')) return
      handlers.onSelect?.(summary.element)
    }
    card.addEventListener('click', select)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select() }
    })

    card.append(art, name, owner, stats, abilities)
    grid.append(card)
    cards.set(summary.element, { card, art, owner })
  }

  const continueRow = document.createElement('div')
  const startBtn = document.createElement('button')
  startBtn.className = 'cs-continue'
  startBtn.textContent = 'Start match'
  startBtn.style.display = 'none'
  startBtn.addEventListener('click', (e) => { e.preventDefault(); handlers.onStart?.() })
  continueRow.append(startBtn)
  root.append(continueRow)

  const info = document.createElement('div')
  info.className = 'cs-owner'
  const error = document.createElement('div')
  error.className = 'cs-error'
  root.append(info, error)

  return {
    root,
    show()  { root.classList.remove('hidden') },
    hide()  { root.classList.add('hidden') },
    showStartButton(show) { startBtn.style.display = show ? '' : 'none' },
    setInfo(text) { info.textContent = text || '' },
    setError(text) { error.textContent = text || '' },

    // thumbnails: Map<element, rect> from computeElementThumbnails(). Called
    // once the fetch resolves -- may land after the first render().
    setThumbnails(thumbnails) {
      for (const [element, rect] of thumbnails) {
        const entry = cards.get(element)
        if (!entry || !rect) continue
        entry.art.innerHTML = ''
        const img = document.createElement('span')
        img.style.width = `${rect.w}px`
        img.style.height = `${rect.h}px`
        img.style.backgroundImage = `url(${rect.src})`
        img.style.backgroundSize = `${rect.bgW}px ${rect.bgH}px`
        img.style.backgroundPosition = `-${rect.bgX}px -${rect.bgY}px`
        entry.art.append(img)
      }
    },

    // players: the room's current roster [{ id, element, displayName, isBot }].
    // myPlayerId: whose card gets the "mine" highlight.
    render(players, myPlayerId) {
      for (const element of ELEMENTS) {
        const entry = cards.get(element)
        if (!entry) continue
        const { isMine, blockedByHuman, ownerLabel } = elementCardState(element, players, myPlayerId)
        entry.card.classList.toggle('cs-mine', isMine)
        entry.card.classList.toggle('cs-taken', blockedByHuman)
        entry.owner.textContent = ownerLabel
      }
    },
  }
}
