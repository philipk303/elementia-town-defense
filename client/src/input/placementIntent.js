// Tap-to-ghost build confirmation for TOUCH ONLY (2026-08-23, item 3 of the
// 2026-08-23 review remainder).
//
// WHY THIS EXISTS: on desktop, hovering a tile previews placement validity
// before you commit — the ghost colours itself via _placementValidity and a
// click is a deliberate second action after you have already seen the answer.
// Touch has no hover, so the first thing a finger does IS the commit. That
// asymmetry got worse when 2c0cabb made "tap outside the card" the natural
// way to dismiss the sell card: the dismissing tap falls through to the board
// handler and spends gold. A close button (cdfda15) was a stopgap; this is
// the fix. First tap arms a tile (ghost pinned, validity visible), second tap
// on the SAME tile with the SAME selection commits.
//
// NOT A WIRE CHANGE. This module is only ever consulted from GameScene's
// `pointerdown` handler, which feeds nothing but the ghost's draw position
// (`_boardPointer`) and the BUILD_STRUCTURE emit. The per-frame PLAYER_INPUT
// packet is built in _sendInput from _readTouchInput/_readDesktopInput, and
// neither reads any state in this file. The 17,000+-run balance corpus
// measures that packet, so it cannot fork on this. Verified by grep, not
// assumed (see the handoff's load-bearing constraint).
//
// Pure: no Phaser, no DOM, no audio. Tested in
// test/client/placementIntent.test.js.

export const GHOST = 'ghost'
export const COMMIT = 'commit'

// The selection signature guards against the failure the handoff called out
// explicitly: a pending tile that survives a structure-type change would
// silently commit the WRONG structure on the next tap. GameScene also resets
// on every such change, so this is the second of two independent guards —
// if a reset call is ever missed, the mismatch still degrades to a harmless
// re-arm rather than to building something the player did not choose.
export function selectionSignature({ type, orient, dir } = {}) {
  return `${type ?? ''}|${orient ?? ''}|${dir ?? ''}`
}

export class PlacementIntent {
  constructor() {
    this._pending = null // { gx, gy, sig }
  }

  // The armed tile, or null. GameScene reads this to decide whether to draw
  // the "tap again" affordance on the ghost.
  get pending() {
    return this._pending ? { gx: this._pending.gx, gy: this._pending.gy } : null
  }

  isArmedAt(gx, gy) {
    return !!this._pending && this._pending.gx === gx && this._pending.gy === gy
  }

  // Returns COMMIT when this tap confirms the armed tile, GHOST otherwise.
  // A tap on a different tile — or on the same tile after the player changed
  // what they are building — re-arms rather than committing.
  tap(gx, gy, sig) {
    if (this._pending && this._pending.gx === gx && this._pending.gy === gy &&
        this._pending.sig === sig) {
      this._pending = null
      return COMMIT
    }
    this._pending = { gx, gy, sig }
    return GHOST
  }

  reset() {
    this._pending = null
  }
}
