// The measurement protocol: one frozen, fully-resolved object describing
// everything about a run except the game code itself.
//
// WHY THIS EXISTS (Balance Harness v2, WP3). runBuildPolicy took thirteen
// positional parameters, four of them opt-in flags added one at a time as
// confounds were discovered. Every one of those flags had a default, and every
// default was invisible in the output. That is the exact mechanism behind the
// three instrument defects this project has had to diagnose after the fact:
//
//   * the free special displacing the policy's Watchtower (worth ~1.2 score
//     points on maze A, larger than the effects being measured)
//   * a 2-wide walkable defence silently capped at 8 sites regardless of gold
//   * "flank vs funnel" being a one-tile shift with both arms in the lane
//
// None of them were visible in any recorded output, because the site lists and
// the flags that chose between them were never written down next to the
// numbers. So: resolveProtocol writes EVERY field explicitly, throws on any key
// it does not recognise, and freezes the result. The run store persists the
// whole thing verbatim. A future confound is then one diff away from visible.
//
// See docs/plans/2026-08-14-balance-harness-v2-spec.md sections 2 and 4.

import { STRUCTURE_TYPES, ELEMENTS } from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { resolveMaze, MAZE } from './scenarios.js'

// Fields that describe the EXPERIMENT and therefore belong in the config hash.
// Anything not listed here is either a hook (below) or unknown (an error).
export const PROTOCOL_DEFAULTS = Object.freeze({
  // --- scenario ---
  seed: null,                 // required
  mazeName: 'A',
  postGap: 0,
  maxWaves: BALANCE.WAVE_COUNT,

  // --- who is playing ---
  humanElement: 'EARTH',
  buildPolicy: 'scripted-v1', // WP5 adds 'competent-v1'

  // --- siting ---
  // THE DEFAULT IS NOW 'isolated'. Legacy overlapping site lists are reachable
  // only via legacySiting: true, and exist only so the pinned tests can keep
  // reproducing historical measurements byte for byte. No new measurement may
  // use them: every pre-2026-08-04 number taken on maze A is confounded by
  // Watchtower displacement, so legacy output is not comparable with v2 output
  // and must never be pooled with it.
  legacySiting: false,
  // Under the isolated protocol: 'funnel' anchors the special at the gap
  // column, 'flank' at gap+2. The Watchtower's column (gap-1) is untouchable in
  // both, which is the whole point.
  specialSiting: 'funnel',
  // Only read when legacySiting is true. null = the old towerSites-only
  // default, matching every baseline taken before 2026-08-02.
  legacySpecialSites: null,   // null | 'funnel' | 'offlane'

  // --- what the human builds ---
  freeSpecial: true,
  fuse: true,
  fuseWave: 4,
  fuseWith: null,             // null = catalog-order scan; an element pins it
  // THE TWO-INGREDIENT CONTROL. Buys the named partner special at the fusion's
  // own tile and then DECLINES the proposal, leaving both 2x1 ingredients
  // standing. Requires fuse:false — it is the control arm for a fusion, not a
  // variant of one. Without it a "no fusion" control holds only the ONE free
  // special, which is the baseline every fusion number in this project has been
  // graded against even though spec §1 asks a fusion to beat BOTH ingredients.
  partnerSpecial: null,       // null = no partner; an element buys it unfused
  defence: STRUCTURE_TYPES.WATCHTOWER,
  spendDown: false,
  defenceCap: null,           // null = unbounded
})

// Runtime-only. Never hashed, never persisted: a diagnostic callback cannot
// change a measurement (onEnd runs after the loop) and a probe accumulator is
// owned by the caller. Keeping them out of the canonical form is what lets two
// runs that differ only in instrumentation share a configHash.
const HOOK_KEYS = Object.freeze(['onEnd', 'tiProbe', 'volleyProbe'])

const SITINGS = ['funnel', 'flank']
// The build policies matchRunner.js will actually dispatch on. Validated for
// the same reason every other field is — an unknown value must fail loudly,
// not silently fall through to whichever policy matchRunner treats as the
// default, which would let a typo'd buildPolicy run scripted-v1 while a
// corpus's metadata claims otherwise.
//
// WP5's `competent-v1` is deliberately NOT listed. A first attempt was built
// and reverted 2026-08-15: both of its differences from scripted-v1 were
// SITING differences, and siting cannot express a policy in the 12-site
// isolated pool — `isolatedTowerSites` is already row-major (lane-alternating)
// by construction, so the "reposition between lanes" rule reproduced
// scripted-v1's order exactly, and barricade scan order never binds
// (rebuildsSkippedForGold is identically 0 across all 2880 v2 runs). Adding
// the name back here before a policy that genuinely diverges exists would make
// the cross-policy gate decorative. See
// docs/reviews/2026-08-15-wp5-competent-v1-review.md.
const BUILD_POLICIES = ['scripted-v1']
const LEGACY_SITE_LISTS = [null, 'funnel', 'offlane', 'tower']

function fail(msg) {
  throw new Error(`protocol: ${msg}`)
}

/**
 * Resolve a partial protocol into a frozen, fully-populated one.
 *
 * Throws on an unknown key rather than ignoring it. A typo'd flag that
 * silently does nothing is the same failure class as an unstated default: the
 * run reports a protocol it did not actually execute. `fuseWith: 'FIER'` must
 * be an error, not a catalog-order scan wearing a pinned-partner label.
 *
 * @param {object} partial  any subset of PROTOCOL_DEFAULTS, plus hooks
 * @returns {{protocol: object, hooks: object, maze: object}}
 */
export function resolveProtocol(partial = {}) {
  const known = new Set([...Object.keys(PROTOCOL_DEFAULTS), ...HOOK_KEYS, 'maze'])
  for (const k of Object.keys(partial)) {
    if (!known.has(k)) {
      fail(`unknown key "${k}". Known: ${[...known].sort().join(', ')}`)
    }
  }

  // `maze` accepts the object form (what every existing caller passes) or a
  // name. The protocol records the NAME, because an inline object is not
  // comparable across runs and not meaningfully hashable.
  let maze, mazeName
  if (partial.maze && typeof partial.maze === 'object') {
    maze = partial.maze
    mazeName = nameForMaze(maze)
  } else {
    mazeName = String(partial.mazeName ?? partial.maze ?? PROTOCOL_DEFAULTS.mazeName).toUpperCase()
    maze = resolveMaze(mazeName)
  }

  const p = { ...PROTOCOL_DEFAULTS }
  for (const k of Object.keys(PROTOCOL_DEFAULTS)) {
    if (k in partial && partial[k] !== undefined) p[k] = partial[k]
  }
  p.mazeName = mazeName

  if (!Number.isInteger(p.seed)) fail(`seed must be an integer, got ${JSON.stringify(p.seed)}`)
  if (!Number.isInteger(p.postGap) || p.postGap < 0 || p.postGap >= maze.gaps.length) {
    fail(`postGap ${p.postGap} is not an index into maze ${mazeName}'s ${maze.gaps.length} gaps`)
  }
  if (!ELEMENTS.includes(p.humanElement)) fail(`humanElement "${p.humanElement}" is not an element`)
  if (p.fuseWith !== null && !ELEMENTS.includes(p.fuseWith)) {
    fail(`fuseWith "${p.fuseWith}" is not an element (use null for the catalog-order scan)`)
  }
  if (p.fuseWith !== null && p.fuseWith === p.humanElement) {
    fail(`fuseWith equals humanElement ("${p.fuseWith}") — a special cannot fuse with itself, so this arm would never form a combo`)
  }
  if (p.partnerSpecial !== null) {
    if (!ELEMENTS.includes(p.partnerSpecial)) {
      fail(`partnerSpecial "${p.partnerSpecial}" is not an element (use null for no partner)`)
    }
    if (p.partnerSpecial === p.humanElement) {
      fail(`partnerSpecial equals humanElement ("${p.partnerSpecial}") — the human already owns that special, so this arm would buy nothing`)
    }
    // Both set is genuinely ambiguous: fuse says "accept the proposal",
    // partnerSpecial says "decline it". Silently letting one win is exactly the
    // unstated-default failure class this module exists to prevent.
    if (p.fuse) {
      fail(`partnerSpecial is set with fuse:true — partnerSpecial IS the declined-proposal control, so it requires fuse:false. Set fuseWith instead to pin a fusion partner.`)
    }
    if (!p.freeSpecial) {
      fail(`partnerSpecial is set with freeSpecial:false — the partner is placed relative to the free special's anchor, so without one no partner is ever bought`)
    }
  }
  if (!(p.defence in BALANCE.STRUCTURES)) fail(`defence "${p.defence}" is not a structure type`)
  if (p.defenceCap !== null && (!Number.isInteger(p.defenceCap) || p.defenceCap < 0)) {
    fail(`defenceCap must be null or a non-negative integer, got ${JSON.stringify(p.defenceCap)}`)
  }
  if (!Number.isInteger(p.maxWaves) || p.maxWaves < 1) fail(`maxWaves must be a positive integer`)
  if (!BUILD_POLICIES.includes(p.buildPolicy)) {
    fail(`buildPolicy "${p.buildPolicy}" unknown; expected ${BUILD_POLICIES.join(' or ')}`)
  }

  if (p.legacySiting) {
    if (!LEGACY_SITE_LISTS.includes(p.legacySpecialSites)) {
      fail(`legacySpecialSites "${p.legacySpecialSites}" unknown; expected one of ${LEGACY_SITE_LISTS.map(String).join(', ')}`)
    }
  } else {
    if (!SITINGS.includes(p.specialSiting)) {
      fail(`specialSiting "${p.specialSiting}" unknown; expected ${SITINGS.join(' or ')}`)
    }
    if (p.legacySpecialSites !== null) {
      fail(`legacySpecialSites is set but legacySiting is false — under the isolated protocol the site list is chosen by specialSiting. Setting both is how an arm ends up running a protocol nobody declared.`)
    }
  }

  const hooks = {}
  for (const k of HOOK_KEYS) hooks[k] = partial[k] ?? null

  return { protocol: Object.freeze(p), hooks: Object.freeze(hooks), maze }
}

// Reverse-lookup so an object-form maze still records a stable name. Compares
// by shape rather than identity: the tests construct their own maze literals.
function nameForMaze(maze) {
  for (const name of ['A', 'B']) {
    const known = resolveMaze(name)
    if (known.wallRow === maze.wallRow && String(known.gaps) === String(maze.gaps)) return name
  }
  // An ad-hoc maze is legal for a diagnostic but must not masquerade as A or B
  // in the store, where it would silently pool with real measurements.
  return `custom:${maze.wallRow}:${maze.gaps.join('-')}`
}

/**
 * The hashable form: keys sorted, hooks and the maze object excluded. Two runs
 * with the same canonical protocol, engine version and balance hash are the
 * same experiment and their records are poolable. That is the store's
 * idempotency contract — see spec section 2.
 */
export function canonicalProtocol(protocol) {
  const out = {}
  for (const k of Object.keys(protocol).sort()) out[k] = protocol[k]
  return out
}

export { MAZE }
