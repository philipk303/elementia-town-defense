// Client entry: boots Phaser (GameScene) and wires the minimal Phase-1 lobby
// overlay (create/join/start) + a build-phase Ready button that drives the
// ready-up timing styles. Full menus, class/element select, and interpolation
// rendering are later phases.

import Phaser from 'phaser'
import net from './network.js'
import Preload from './scenes/Preload.js'
import GameScene from './scenes/GameScene.js'
import { EVENTS, CONFIG } from '../../shared/constants.js'

// --- Phaser game (renders under the lobby overlay until the match starts) ---
const __game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.MAP_WIDTH,
  height: CONFIG.MAP_HEIGHT,
  backgroundColor: '#0a0e14',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Preload, GameScene],
})
if (typeof window !== 'undefined') window.__game = __game

// --- Lobby overlay wiring ---
const $ = id => document.getElementById(id)
const lobby   = $('lobby')
const errorEl = $('error')
const roomInfo = $('roomInfo')

net.connect()

function showError(msg) { errorEl.textContent = msg || '' }

$('createBtn').addEventListener('click', () => {
  showError('')
  net.emit(EVENTS.CREATE_ROOM, {
    displayName: $('name').value,
    settings: { timingStyle: $('timing').value, friendlyFire: $('ff').checked },
  })
})

$('joinBtn').addEventListener('click', () => {
  showError('')
  const roomCode = $('joinCode').value.trim().toUpperCase()
  if (!roomCode) { showError('Enter a room code'); return }
  net.emit(EVENTS.JOIN_ROOM, { roomCode, displayName: $('name').value })
})

$('startBtn').addEventListener('click', () => net.emit(EVENTS.REQUEST_START))

net.on(EVENTS.ROOM_CREATED, ({ roomCode }) => {
  roomInfo.textContent = `Room ${roomCode} — share this code. Waiting for players…`
})

net.on(EVENTS.ROOM_JOINED, (payload) => {
  roomInfo.textContent =
    `Room ${payload.roomCode} — you are ${payload.element}. ` +
    `${payload.players.length} player(s). Style: ${payload.settings?.timingStyle}.`
  // Only the host sees the Start button.
  $('startBtn').style.display = payload.playerId === payload.hostId ? '' : 'none'
})

net.on(EVENTS.ROOM_ERROR, ({ message }) => showError(message))

net.on(EVENTS.PLAYER_JOINED, () => {
  roomInfo.textContent += ' (+1)'
})

// Host migration (CP1 H1): if we became the host, reveal the Start button.
net.on(EVENTS.HOST_CHANGED, ({ hostId }) => {
  $('startBtn').style.display = net.playerId === hostId ? '' : 'none'
  roomInfo.textContent += hostId === net.playerId ? ' — you are now host' : ''
})

// Match start / mid-match join: hide the lobby, reveal the game.
net.on(EVENTS.GAME_START, () => { lobby.classList.add('hidden') })

// The build-phase Ready button moved INTO the build palette (2026-08-22) —
// see client/src/ui/buildPalette.js. It used to be a lone floating DOM button
// at bottom-centre, which is exactly where the palette now docks; two
// unrelated controls fighting for that strip was the reason to absorb it.
