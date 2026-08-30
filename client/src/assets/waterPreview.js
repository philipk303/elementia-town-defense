export const WATER_HERO_ATLAS = 'chibi_water'
export const WATER_HERO_PATHS = {
  png: 'art/chibi_water.png',
  json: 'art/chibi_water.json',
}

export const WATER_FX_ATLAS = 'water_basic_fx'
export const WATER_FX_PATHS = {
  png: 'art/water_basic_fx.png',
  json: 'art/water_basic_fx.json',
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

export const WATER_HERO_ANIMATIONS = HERO_DIRECTIONS.flatMap(direction =>
  HERO_STATES.map(({ state, count, frameRate, repeat }) => ({
    key: `${WATER_HERO_ATLAS}_${state}_${direction}`,
    label: `${state} ${direction}`,
    state,
    direction,
    frames: Array.from({ length: count }, (_, index) => `${state}_${direction}_${String(index).padStart(2, '0')}.png`),
    frameRate,
    repeat,
  })),
)

export const WATER_FX_ANIMATIONS = [
  { state: 'release', sourceState: 'flight', count: 4, frameRate: 12, repeat: 0 },
  { state: 'impact', sourceState: 'impact', count: 3, frameRate: 12, repeat: 0 },
  { state: 'dissipation', sourceState: 'dissipation', count: 3, frameRate: 10, repeat: 0 },
].map(({ state, sourceState, count, frameRate, repeat }) => ({
  key: `${WATER_FX_ATLAS}_${state}`,
  label: state,
  state,
  frames: Array.from({ length: count }, (_, index) => `${sourceState}_${String(index).padStart(2, '0')}.png`),
  frameRate,
  repeat,
}))

export function buildWaterHeroMatrix() {
  return WATER_HERO_ANIMATIONS.map(animation => ({
    ...animation,
    x: 90 + HERO_STATES.findIndex(({ state }) => state === animation.state) * 175,
    baselineY: 165 + HERO_DIRECTIONS.indexOf(animation.direction) * 135,
  }))
}

export function buildWaterBasicDemo(direction = 'right') {
  return [
    { phase: 'hero_attack', atlas: WATER_HERO_ATLAS, key: `${WATER_HERO_ATLAS}_attack_${direction}` },
    ...WATER_FX_ANIMATIONS.map(animation => ({
      phase: animation.state,
      atlas: WATER_FX_ATLAS,
      key: animation.key,
    })),
  ]
}
