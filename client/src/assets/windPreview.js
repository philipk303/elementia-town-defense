export const WIND_PREVIEW_ATLAS = 'wind_preview'
export const WIND_PREVIEW_PATHS = {
  png: 'art/calibration/wind/wind_preview.png',
  json: 'art/calibration/wind/wind_preview.json',
}

export const WIND_PREVIEW_ANIMATIONS = [
  { key: 'wind_idle_down', label: 'Idle', frames: ['idle_down_00.png', 'idle_down_01.png'], frameRate: 3, repeat: -1 },
  { key: 'wind_run_down', label: 'Run', frames: ['run_down_00.png', 'run_down_01.png', 'run_down_02.png', 'run_down_03.png'], frameRate: 9, repeat: -1 },
  { key: 'wind_attack_down', label: 'Attack', frames: ['attack_down_00.png', 'attack_down_01.png', 'attack_down_02.png', 'attack_down_03.png'], frameRate: 10, repeat: 0 },
  { key: 'wind_cast_down', label: 'Cast', frames: ['cast_down_00.png', 'cast_down_01.png', 'cast_down_02.png', 'cast_down_03.png'], frameRate: 10, repeat: 0 },
]

export const WIND_HERO_ATLAS = 'chibi_wind'
export const WIND_HERO_PATHS = {
  png: 'art/chibi_wind.png',
  json: 'art/chibi_wind.json',
}

export const WIND_FX_ATLAS = 'wind_basic_fx'
export const WIND_FX_PATHS = {
  png: 'art/wind_basic_fx.png',
  json: 'art/wind_basic_fx.json',
}

const HERO_DIRECTIONS = ['down', 'up', 'left', 'right']
const HERO_STATES = [
  { state: 'idle', count: 2, frameRate: 5, repeat: -1 },
  { state: 'run', count: 4, frameRate: 9, repeat: -1 },
  { state: 'attack', count: 4, frameRate: 10, repeat: 0 },
  { state: 'cast', count: 4, frameRate: 10, repeat: 0 },
  { state: 'hurt', count: 2, frameRate: 6, repeat: 0 },
  { state: 'death', count: 4, frameRate: 6, repeat: 0 },
]

export const WIND_HERO_ANIMATIONS = HERO_DIRECTIONS.flatMap(direction =>
  HERO_STATES.map(({ state, count, frameRate, repeat }) => ({
    key: `${WIND_HERO_ATLAS}_${state}_${direction}`,
    label: `${state} ${direction}`,
    state,
    direction,
    frames: Array.from({ length: count }, (_, index) => `${state}_${direction}_${String(index).padStart(2, '0')}.png`),
    frameRate,
    repeat,
  })),
)

export const WIND_FX_ANIMATIONS = [
  { state: 'flight', count: 4, frameRate: 12, repeat: -1 },
  { state: 'impact', count: 3, frameRate: 12, repeat: 0 },
  { state: 'dissipation', count: 3, frameRate: 10, repeat: 0 },
].map(({ state, count, frameRate, repeat }) => ({
  key: `${WIND_FX_ATLAS}_${state}`,
  label: state,
  state,
  frames: Array.from({ length: count }, (_, index) => `${state}_${String(index).padStart(2, '0')}.png`),
  frameRate,
  repeat,
}))

export function buildWindHeroMatrixLayout() {
  return WIND_HERO_ANIMATIONS.map(animation => ({
    ...animation,
    x: 90 + HERO_STATES.findIndex(({ state }) => state === animation.state) * 175,
    baselineY: 165 + HERO_DIRECTIONS.indexOf(animation.direction) * 135,
  }))
}

export function buildWindBasicSequence(direction = 'right') {
  return [
    { phase: 'hero_attack', atlas: WIND_HERO_ATLAS, key: `${WIND_HERO_ATLAS}_attack_${direction}` },
    ...WIND_FX_ANIMATIONS.map(animation => ({
      phase: animation.state,
      atlas: WIND_FX_ATLAS,
      key: animation.key,
    })),
  ]
}
