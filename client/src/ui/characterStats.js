// Display-only summary of each element's stats for the character-select
// screen. Pulls every number from shared/balance.js (the single source of
// truth for balance magnitudes) rather than restating them here, so this
// screen can never drift out of sync with a future retune.
import { ELEMENTS } from '../../../shared/constants.js'
import { BALANCE } from '../../../shared/balance.js'

function titleCase(name) {
  return name.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
}

export function characterSummary(element) {
  const hp     = BALANCE.PLAYER.CLASS[element]?.maxHp
  const basic  = BALANCE.PLAYER.BASIC[element]
  const special = BALANCE.ABILITY[element]?.SPECIAL
  const second  = BALANCE.ABILITY[element]?.SECOND
  return {
    element,
    label: titleCase(element),
    hp,
    basicDamage: basic?.damage,
    specialName: special ? titleCase(special.name.replace(/_/g, ' ')) : null,
    specialDamage: special?.damage,
    secondName: second ? titleCase(second.name.replace(/_/g, ' ')) : null,
  }
}

export function allCharacterSummaries() {
  return ELEMENTS.map(characterSummary)
}
