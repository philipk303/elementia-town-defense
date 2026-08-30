// Element base kits (spec §2 table): each element's WEIGHT and SPEED rank
// mapped onto the same tier scales the enemies use, so one displacement rule
// (KB_WEIGHT_SCALE) and one CC rule (CC_*_SCALE) cover players under friendly
// fire too. Ranks in the spec table are 1..4; tiers are 0..3.
//
//   Earth  weight 4 (heaviest → SUPER_HEAVY, FF-displacement-immune), speed 1
//   Fire   weight 2, speed 3
//   Water  weight 3, speed 2
//   Wind   weight 1 (LIGHT — flung far under FF), speed 4 (SUPER_FAST)

import { WEIGHT, SPEED } from './enemyTypes.js'

export const ELEMENT_KIT = {
  EARTH: { weight: WEIGHT.SUPER_HEAVY, speed: SPEED.SLOW },
  FIRE:  { weight: WEIGHT.MEDIUM,      speed: SPEED.FAST },
  WATER: { weight: WEIGHT.HEAVY,       speed: SPEED.MEDIUM },
  WIND:  { weight: WEIGHT.LIGHT,       speed: SPEED.SUPER_FAST },
}
