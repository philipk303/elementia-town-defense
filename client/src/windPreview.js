import Phaser from 'phaser'
import { CONFIG, TILE_SIZE, TILES_H, TILES_W } from '../../shared/constants.js'
import {
  WIND_FX_ANIMATIONS,
  WIND_FX_ATLAS,
  WIND_FX_PATHS,
  WIND_HERO_ANIMATIONS,
  WIND_HERO_ATLAS,
  WIND_HERO_PATHS,
  buildWindBasicSequence,
  buildWindHeroMatrixLayout,
} from './assets/windPreview.js'

const TEXT_STYLE = { fontFamily: 'monospace', fontSize: '13px', color: '#dfe8f0' }
const MUTED_STYLE = { ...TEXT_STYLE, fontSize: '11px', color: '#8db5c9' }

class WindPreviewScene extends Phaser.Scene {
  constructor() {
    super('WindPreview')
    this.viewObjects = []
    this.viewTimers = []
    this.viewToken = 0
  }

  preload() {
    this.load.atlas(WIND_HERO_ATLAS, WIND_HERO_PATHS.png, WIND_HERO_PATHS.json)
    this.load.atlas(WIND_FX_ATLAS, WIND_FX_PATHS.png, WIND_FX_PATHS.json)
  }

  create() {
    this.cameras.main.setBackgroundColor('#0d1420')
    const grid = this.add.graphics().lineStyle(1, 0x1c2a3a, 1)
    for (let x = 0; x <= TILES_W; x++) grid.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, CONFIG.MAP_HEIGHT)
    for (let y = 0; y <= TILES_H; y++) grid.lineBetween(0, y * TILE_SIZE, CONFIG.MAP_WIDTH, y * TILE_SIZE)

    this.registerAnimations()
    this.add.text(24, 18, 'Wind production preview — 80 hero frames + 10 shared FX frames', {
      ...TEXT_STYLE,
      fontSize: '18px',
    })
    this.add.text(24, 46, 'Nearest-neighbor rendering. Matrix is actual 1×; selected inspection and lower FX lane are 3×.', MUTED_STYLE)
    this.addButton(900, 28, 'Hero Matrix', () => this.showHeroMatrix())
    this.addButton(1065, 28, 'Basic FX', () => this.showBasicFx())
    this.showHeroMatrix()
  }

  registerAnimations() {
    for (const animation of [...WIND_HERO_ANIMATIONS, ...WIND_FX_ANIMATIONS]) {
      const atlas = animation.state && ['flight', 'impact', 'dissipation'].includes(animation.state)
        ? WIND_FX_ATLAS
        : WIND_HERO_ATLAS
      this.anims.create({
        key: animation.key,
        frames: animation.frames.map(frame => ({ key: atlas, frame })),
        frameRate: animation.frameRate,
        repeat: animation.repeat,
      })
    }
  }

  addButton(x, y, label, callback) {
    this.add.text(x, y, label, { ...TEXT_STYLE, backgroundColor: '#173149', padding: { x: 10, y: 6 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', callback)
  }

  track(object) {
    this.viewObjects.push(object)
    return object
  }

  clearView() {
    this.viewToken += 1
    for (const timer of this.viewTimers) timer.remove(false)
    this.viewTimers = []
    for (const object of this.viewObjects) {
      this.tweens.killTweensOf(object)
      object.destroy()
    }
    this.viewObjects = []
  }

  replayOneShot(sprite, animation) {
    sprite.play(animation.key)
    if (animation.repeat === 0) {
      const duration = animation.frames.length * (1000 / animation.frameRate) + 900
      this.viewTimers.push(this.time.addEvent({
        delay: duration,
        loop: true,
        callback: () => { if (sprite.active) sprite.play(animation.key) },
      }))
    }
  }

  showHeroMatrix() {
    this.clearView()
    this.track(this.add.text(24, 78, 'Hero Matrix — click any cell to update the 3× inspector', TEXT_STYLE))
    const layout = buildWindHeroMatrixLayout()
    for (const state of ['idle', 'run', 'attack', 'cast', 'hurt', 'death']) {
      const item = layout.find(entry => entry.state === state)
      this.track(this.add.text(item.x, 104, state.toUpperCase(), MUTED_STYLE).setOrigin(0.5))
    }
    for (const direction of ['down', 'up', 'left', 'right']) {
      const item = layout.find(entry => entry.direction === direction)
      this.track(this.add.text(10, item.baselineY - 8, direction.toUpperCase(), MUTED_STYLE))
    }

    for (const item of layout) {
      this.track(this.add.line(item.x - 38, item.baselineY, item.x + 38, item.baselineY, 0x6fa0d8, 0.65))
      const sprite = this.track(this.add.sprite(item.x, item.baselineY, WIND_HERO_ATLAS, item.frames[0])
        .setOrigin(0.5, 56 / 64)
        .setScale(1)
        .setInteractive({ useHandCursor: true }))
      sprite.on('pointerdown', () => this.showInspector(item))
      this.replayOneShot(sprite, item)
    }
    this.showInspector(layout[0])
  }

  showInspector(animation) {
    for (const object of this.viewObjects.filter(object => object.getData?.('inspector'))) object.destroy()
    this.viewObjects = this.viewObjects.filter(object => !object.getData?.('inspector'))
    const mark = object => this.track(object.setData('inspector', true))
    mark(this.add.rectangle(1160, 382, 220, 520, 0x101d2b, 0.92).setStrokeStyle(1, 0x416987))
    mark(this.add.text(1160, 138, '3× INSPECTOR', MUTED_STYLE).setOrigin(0.5))
    mark(this.add.line(1068, 410, 1252, 410, 0x6fa0d8, 0.8))
    const sprite = mark(this.add.sprite(1160, 410, WIND_HERO_ATLAS, animation.frames[0])
      .setOrigin(0.5, 56 / 64)
      .setScale(3))
    mark(this.add.text(1160, 520, `${animation.state} / ${animation.direction}`, TEXT_STYLE).setOrigin(0.5))
    this.replayOneShot(sprite, animation)
  }

  showBasicFx() {
    this.clearView()
    const sequence = buildWindBasicSequence('right')
    this.track(this.add.text(24, 78, `Basic sequence: ${sequence.map(step => step.phase).join(' → ')}`, TEXT_STYLE))
    this.track(this.add.text(24, 106, 'Flight alone rotates/aligns to velocity; impact and dissipation keep the terminal center.', MUTED_STYLE))
    this.startBasicLane({ y: 245, scale: 1, label: 'ACTUAL 1× GAMEPLAY SCALE' })
    this.startBasicLane({ y: 555, scale: 3, label: '3× PIXEL / IDENTITY INSPECTION' })
  }

  startBasicLane({ y, scale, label }) {
    const token = this.viewToken
    this.track(this.add.text(24, y - 110, label, MUTED_STYLE))
    this.track(this.add.line(80, y, 1200, y, 0x6fa0d8, 0.55))
    const hero = this.track(this.add.sprite(240, y, WIND_HERO_ATLAS, 'attack_right_00.png')
      .setOrigin(0.5, 56 / 64)
      .setScale(scale))
    const fx = this.track(this.add.sprite(340, y - 28 * scale, WIND_FX_ATLAS, 'flight_00.png')
      .setOrigin(0.5)
      .setScale(scale)
      .setVisible(false))

    const run = () => {
      if (token !== this.viewToken || !hero.active) return
      hero.play('chibi_wind_attack_right')
      hero.once('animationcomplete', () => {
        if (token !== this.viewToken || !fx.active) return
        fx.setPosition(340, y - 28 * scale).setRotation(0).setVisible(true).play('wind_basic_fx_flight')
        this.tweens.add({
          targets: fx,
          x: 980,
          duration: 950,
          ease: 'Linear',
          onComplete: () => {
            if (token !== this.viewToken || !fx.active) return
            fx.stop().setRotation(0).play('wind_basic_fx_impact')
            fx.once('animationcomplete', () => {
              fx.play('wind_basic_fx_dissipation')
              fx.once('animationcomplete', () => {
                fx.setVisible(false)
                const timer = this.time.delayedCall(650, run)
                this.viewTimers.push(timer)
              })
            })
          },
        })
      })
    }
    run()
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'preview',
  width: CONFIG.MAP_WIDTH,
  height: CONFIG.MAP_HEIGHT,
  render: { pixelArt: true, antialias: false, roundPixels: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [WindPreviewScene],
})
