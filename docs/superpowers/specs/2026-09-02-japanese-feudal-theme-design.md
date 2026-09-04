# Japanese feudal theme pass — design

Date: 2026-09-02

## Goal

Retheme every player-facing screen (lobby/"title", character select, build
palette, menu panel, in-canvas HUD) to a feudal-Japan aesthetic: ink-and-lacquer
palette, brush-style display typography, torii-inspired framing. Visuals only —
no game-text renaming, no new generated art, no mechanics changes.

## Non-goals

- No renaming of structures, the Hall, fusions, or any other game term.
  (One text-only exception below: fixing "FIREPIT" to "FIRE PIT".)
- No new generated art (backgrounds, icons, sprites). This pass is CSS +
  Phaser draw-call colors/fonts on top of existing art.
- No changes to the four elemental gameplay colors (fire/water/earth/wind) or
  any other token already tuned against `test/themeContrast.test.js`
  (touch controls, placement ghost, ability-state colors, panel-composited
  button colors). These are load-bearing accessibility values with documented
  histories of failing contrast checks when re-picked casually — this pass
  reads them, never rewrites them.

## Visual language

- **Palette (neutral chrome only):**
  - Sumi black `#1a1712` — dark panel backgrounds, replacing `#0a0e14`/`#16202c`.
  - Washi cream `#ede4d3` — light text/backgrounds where the current theme
    uses off-white (`#dfe8f0`, `#e8f2ff`).
  - Shu-red `#b23a2f` — primary accent (was blue-grey `#2b3a4a`/`#b4c9e0`
    borders and highlight states).
  - Aged gold `#c9a227` — secondary accent, rule lines, corner brackets.
- **Typography:**
  - Display/headers: a brush-style Google Font (candidates: "Yuji Syuku",
    "Shippori Mincho B1" — final pick made by checking legibility at actual
    UI sizes before committing).
  - Dense HUD numerals (HP, gold, cooldown timers) and anywhere text must
    stay small (12-13px): keep the existing monospace. Brush fonts are
    unreadable at that size.
- **Framing:** thin gold-on-black rule lines and simple square corner
  brackets (torii-inspired right angles) replacing the current rounded
  blue-bordered boxes, applied consistently across every panel.

## Scope by surface

| Surface | File(s) | Mechanism |
|---|---|---|
| Lobby ("title") screen | `client/index.html` | CSS only |
| Character select | `client/src/ui/characterSelect.js` | CSS only (DOM-based) |
| Build palette | `client/src/ui/buildPalette.js` | CSS only (DOM-based) |
| Menu panel | `client/src/ui/menuPanel.js` | CSS only (DOM-based) |
| In-canvas HUD (HALL label, HP bars, status row, fusion prompt, sell card, ability bar) | `client/src/scenes/GameScene.js`, `client/src/theme.js` | JS: font-family + neutral-color literals only |
| Build-palette typo fix | `client/src/ui/buildPalette.js` (`SHORT_LABEL`) | `FIREPIT` → `FIRE PIT` |

`theme.js` gains new neutral-chrome tokens (panel background, border, plain
text) alongside the existing gameplay tokens, clearly separated by comment so
future edits don't conflate the two groups.

## Accessibility / verification

- Every new or changed color that renders text or a UI control on top of
  another surface gets checked against `test/themeContrast.test.js`'s method
  before landing — same standard the project already holds itself to.
- The four elemental colors, touch-control colors, placement-ghost colors,
  and panel-composited button/ability colors in `theme.js` are left
  byte-for-byte unchanged.
- Manual check in the browser preview: lobby screen, character select, build
  palette (open + closed), and an in-match HUD screenshot, in both the
  existing dark-only rendering (this game has no light/dark toggle) to
  confirm legibility.

## Out of scope / explicitly deferred

- New generated art (backgrounds, structure icons, panel textures) via the
  Nano Banana pipeline — a separate future project if wanted.
- Any renaming of game terms.
