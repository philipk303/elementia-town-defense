// Build-phase wave-preview panel (spec §7 "wave-preview UI"). Shows the
// upcoming wave's composition + elite/gate telegraphs so players can plan
// their maze before the gate opens. Source data (BALANCE.WAVES,
// GATE_OPEN_WAVE) is already client-side — no server change needed.

import { BALANCE } from '../../../shared/balance.js'
import { ENEMY_BASE } from '../theme.js'

const TYPE_LABEL = ['Goblin', 'Orc', 'Troll']
const ELITE_KEYS = ['eliteGoblin', 'eliteOrc', 'eliteTroll']

function panelText(wave) {
  const entry = BALANCE.WAVES[wave - 1]
  if (!entry) return null
  const comp = entry.comp
  // Index-aligned with ENEMY_BASE/swatchRows (0=goblin,1=orc,2=troll) — must
  // stay fixed-length so a comp missing a non-trailing type (e.g. no goblins)
  // doesn't shift a later type's label onto an earlier type's swatch color.
  const counts = [comp.goblin, comp.orc, comp.troll]
  const lines = counts.map((n, i) => (n ? `${TYPE_LABEL[i]} x${n}` : ''))
  const eliteCount = ELITE_KEYS.reduce((sum, k) => sum + (comp[k] || 0), 0)
  const gateOpens = BALANCE.GATE_OPEN_WAVE.SIDE_A === wave || BALANCE.GATE_OPEN_WAVE.SIDE_B === wave
  return { lines, eliteCount, gateOpens, wave }
}

// Creates the panel's Phaser objects once and returns { update(phaseInfo) }
// to call every frame from GameScene.update() — mirrors the HUD text pattern
// already used for this.hud/this.buildHud.
export function createWavePreview(scene, x, y) {
  const container = scene.add.container(x, y).setScrollFactor(0).setDepth(1000)
  const bg = scene.add.rectangle(0, 0, 190, 104, 0x0d1420, 0.85)
    .setOrigin(0, 0).setStrokeStyle(1, 0x2a3a4a)
  const title = scene.add.text(8, 6, '', {
    fontFamily: 'monospace', fontSize: '12px', color: '#ffd27a',
  })
  const swatchRows = [0, 1, 2].map((i) => {
    const swatch = scene.add.rectangle(8, 26 + i * 15, 8, 8, ENEMY_BASE[i].color).setOrigin(0, 0)
    const label = scene.add.text(20, 22 + i * 15, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#c9d6e2',
    })
    return { swatch, label }
  })
  const eliteText = scene.add.text(8, 74, '', {
    fontFamily: 'monospace', fontSize: '11px', color: '#ffe08a',
  })
  const gateText = scene.add.text(8, 88, '', {
    fontFamily: 'monospace', fontSize: '11px', color: '#ff9a5a',
  })
  container.add([bg, title, eliteText, gateText, ...swatchRows.flatMap(r => [r.swatch, r.label])])

  return {
    update(phaseInfo) {
      const visible = phaseInfo.phase === 'build'
      container.setVisible(visible)
      if (!visible) return
      const preview = panelText(phaseInfo.wave)
      if (!preview) { container.setVisible(false); return }
      title.setText(`Next: Wave ${preview.wave}/${BALANCE.WAVES.length}`)
      swatchRows.forEach((row, i) => {
        row.label.setText(preview.lines[i] ?? '')
        row.swatch.setVisible(!!preview.lines[i])
        row.label.setVisible(!!preview.lines[i])
      })
      eliteText.setText(preview.eliteCount > 0 ? `⚠ ${preview.eliteCount} Elite${preview.eliteCount > 1 ? 's' : ''}` : '')
      gateText.setText(preview.gateOpens ? '⚠ new gate opens!' : '')
    },
  }
}
