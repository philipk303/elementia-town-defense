// Phase 8A measurement instrument. One responsibility: run ONE scenario to
// completion and report numbers.
//
// Why this exists. Every balance measurement this project took before Phase 8A
// was made through two broken instruments:
//
//   1. state.rng had exactly one call site (waves.js resolveGateOrder), so N
//      "seeds" produced at most TWO simulations. Task 1 fixed the sim side.
//   2. Both acceptance harnesses set state.phaseClockMs = 0 every tick. The
//      clock counts DOWN and isBuildComplete() under the 'fixed' timing style
//      is `phaseClockMs <= 0`, so the build phase completed in ONE tick, ten
//      times per run. Economy, tower placement, combos and dormancy were inert
//      in every number ever printed.
//
// This runner fixes (2) and reports a CONTINUOUS score. A binary win/loss over
// a threshold-y sim always looks non-monotonic under perturbation regardless of
// the underlying mechanism — which is very likely the whole of the "chaotic
// balance" finding.
//
// NOT a test file (no .test.js suffix) — `npm test` must not run matches.

import { createGameState } from '../../server/game/state.js'
import { startBuildPhase, PHASES } from '../../server/game/phaseMachine.js'
import { tickGame } from '../../server/game/tick.js'
import { hpToBand } from '../../server/game/costField.js'
import { isWalkable, findStructureAt } from '../../server/game/structures.js'
import { buildStructure } from '../../server/game/economy.js'
import { flushPendingBasics } from '../../server/game/basicAttacks.js'
import { attackReachPx } from '../../server/game/bots.js'
import { flushPendingProjectiles } from '../../server/game/projectiles.js'
import { respondToFusion } from '../../server/game/combos.js'
import {
  STRUCTURE_TYPES, TILE_SIZE, ELEMENT_SPECIAL_TYPE, SPECIAL_TYPE_ELEMENT, ELEMENTS,
  DIRECTIONAL_TYPES,
} from '../../shared/constants.js'
import { BALANCE } from '../../shared/balance.js'
import { createCombatStats, snapshotCombatStats, snapshotCategoryDamage } from '../../server/game/combatStats.js'
import { resolveProtocol } from './protocol.js'

export const DT_MS = 50
export const MAX_TICKS = 400_000   // safety net only; a real run resolves far sooner
// A true fixed point (hall-ring cost-field plateau / bot-leash freeze) holds
// state.livingEnemyCount constant for the rest of the run. N=20000 was
// validated against full 400k-tick runs and reproduced the same
// classification without waiting for the tick cap.
export const STALL_TICKS = 20_000

// --- match setup -----------------------------------------------------------

// 1 human EARTH + 3 AI bots — the Phase 6 acceptance shape, which is also the
// target configuration for the Phase 8C sweep.
//
// `humanElement` (opt-in, default EARTH) exists ONLY to make the other fusions
// reachable, and it was added because `fuseWith` alone is not enough. The build
// policy fuses the human's own FREE special (their element) with a bought
// partner, so an EARTH human can only ever produce EARTH pairs: MAGMA_TRAP,
// MUDDY_BOG, GRINDER. STEAM_VENT (FIRE+WATER), FIRESTORM (FIRE+WIND) and
// BLIZZARD (WATER+WIND) contain no EARTH and were unbuildable by this harness
// at any `fuseWith` value — a hang gate run as `fuseWith: 'FIRE'` builds a
// MAGMA_TRAP and proves nothing about Steam Vent. Same harness-blindness class
// `fuseWith` itself (cc47fde) was written to close, one task later.
//
// The element swap keeps the free special free (a player's free placement is
// their own element), so the economy is untouched. What it does change is which
// class the scripted human plays, and therefore its damage profile: a run with
// a non-default humanElement is a HANG / SOFT-LOCK gate, not a balance
// measurement, and its score/win figures are not comparable to any published
// EARTH-human baseline. The bot roster is left alone — swapping a bot out
// would change the defence as well as the human.
// The team still covers all four elements exactly once: the bot that held the
// human's new element takes EARTH in exchange, rather than the room running two
// of one element and none of another (which would change the defence, not just
// the human). At the default this produces the original roster byte for byte.
function makeRoom(humanElement = 'EARTH') {
  const bots = [
    { id: 'b1', element: 'FIRE',  isBot: true },
    { id: 'b2', element: 'WATER', isBot: true },
    { id: 'b3', element: 'WIND',  isBot: true },
  ]
  for (const b of bots) if (b.element === humanElement) b.element = 'EARTH'
  return {
    players: [
      { id: 'h0', element: humanElement, displayName: `human-${humanElement.toLowerCase()}`, isBot: false },
      ...bots.map(b => ({ ...b, displayName: `${b.element.toLowerCase()}-bot` })),
    ],
    settings: { timingStyle: 'fixed', friendlyFire: false },
  }
}

let seedStructureId = 900_000

// The starting maze is script-placed and free — same as phase6Acceptance, so
// the change under measurement is "the build phase is real", not "the human now
// has to afford the opening maze". REBUILDS below are paid, through the real
// buildStructure path.
function placeStartingMaze(state, maze) {
  for (let gx = 1; gx < 39; gx++) {
    if (maze.gaps.includes(gx)) continue
    const cat = BALANCE.STRUCTURES[STRUCTURE_TYPES.BARRICADE]
    const s = {
      id: seedStructureId++, type: STRUCTURE_TYPES.BARRICADE, ownerId: 'script',
      gx, gy: maze.wallRow, w: 1, h: 1,
      hp: cat.hp, maxHp: cat.hp, dormant: false, createdAt: 0, attackReadyAt: 0,
    }
    state.structures.push(s)
    state.costField.setWallBand(gx, maze.wallRow, hpToBand(s.hp, s.maxHp))
    state.placedVersion++
  }
  state.costField.compute()
}

// --- scripted actors -------------------------------------------------------

// The scripted "competent human": hold a post below one gap, aim at the
// nearest enemy, hammer special/second (the server's own gates decide what
// lands — AoE/radial casts have no target-existence precondition). Basic is
// gated on the nearest enemy actually being within real swing reach
// (Task 6, `attackReachPx` — the same edge-distance formula the real bot
// policy uses, not just "an enemy exists somewhere"), so a stationary post
// doesn't spend basic's cooldown swinging at enemies still a screen away:
// that used to record a "real attempt" every tick regardless of distance, an
// artifact of the policy blindly holding the button rather than of the sim.
function humanInputs(state, post) {
  const buf = new Map()
  const st = state.enemyStore
  for (const p of state.players) {
    if (p.isBot || !p.alive) continue
    let aimX = 0, aimY = -1, bd = Infinity, br = 0
    for (let i = 0; i < st.count; i++) {
      const dx = st.x[i] - p.x, dy = st.y[i] - p.y
      const d2 = dx * dx + dy * dy
      if (d2 < bd) { bd = d2; aimX = dx; aimY = dy; br = st.radius[i] }
    }
    const keys = { w: false, a: false, s: false, d: false }
    const tx = post.x - p.x, ty = post.y - p.y
    if (Math.abs(tx) > 8) (tx > 0 ? keys.d = true : keys.a = true)
    if (Math.abs(ty) > 8) (ty > 0 ? keys.s = true : keys.w = true)
    const reach = attackReachPx(p.element, br)
    const basic = bd <= reach * reach
    buf.set(p.id, { keys, aimX, aimY, actions: { basic, special: true, second: true } })
  }
  return buf
}

// Tower sites: tiles flanking each lane on the defended side of the wall,
// nearest row first. Deterministic order — the policy takes the first that
// placeStructure accepts.
// Sites for a WALKABLE defence. A walkable structure pushes no band, so it can
// stand IN the lane the enemies funnel through — which a blocking Watchtower
// cannot do without plugging the gap and changing the maze under the
// measurement. Teaching the policy this is required before a walkable structure
// can be judged against A1.4(a) at all: sited on the flanks, a Firepit measured
// 0.073 targets per pulse, i.e. the declared "packed lane" scenario was never
// delivered and the score measured the policy.
function funnelSites(maze) {
  const sites = []
  for (let dy = 1; dy <= 4; dy++) {
    for (const gap of maze.gaps) sites.push([gap, maze.wallRow + dy])
  }
  return sites
}

function towerSites(maze) {
  const sites = []
  for (let dy = 1; dy <= 3; dy++) {
    for (const gap of maze.gaps) {
      sites.push([gap - 1, maze.wallRow + dy])
      sites.push([gap + 1, maze.wallRow + dy])
    }
  }
  return sites
}

// GENUINELY off-lane sites (2026-08-04, Task 20 §0). `towerSites` was written
// for a 1x1 blocking Watchtower, and its first entry is [gap - 1, ...]. Every
// special is 2 tiles WIDE and anchored top-left (structures.js:48), so a
// special or fusion placed there occupies gap-1 AND gap — i.e. it is standing
// in the one-tile lane, exactly like the "funnel" arm it is supposed to be
// contrasted against. The published flank-vs-funnel A/B is therefore not
// flank-vs-lane at all; on maze A it is "covers columns 12-13" vs "covers
// 13-14", a one-tile shift, with both arms in the lane. These anchors clear
// the gap column in both directions: [gap + 1] covers gap+1/gap+2 and
// [gap - 2] covers gap-2/gap-1.
function offLaneSites(maze) {
  const sites = []
  for (let dy = 1; dy <= 3; dy++) {
    for (const gap of maze.gaps) {
      sites.push([gap + 1, maze.wallRow + dy])
      sites.push([gap - 2, maze.wallRow + dy])
    }
  }
  return sites
}

// ——— THE ISOLATED SITING PROTOCOL (v2, 2026-08-04) ————————————————————————
//
// The defect the two lists above share is not that either one is in the wrong
// place — it is that they OVERLAP, so the 2-wide free special and the 1x1
// blocking Watchtower compete for the same tiles. Whichever tile the special
// takes, the Watchtower falls back to a different one, and on maze A that
// fallback is worth up to ~1.2 score points by itself. The fusion arm makes it
// worse than the control arm it is measured against: the control's special is
// 2x1 and blocks ONE towerSite, while the 2x2 fusion blocks TWO. So the
// protocol's own arms were never equal-capacity, at any siting.
// Measured: maze A flank siting, Blizzard live-vs-none reads +0.314 (t3.49)
// under the shipped policy but +0.074 (t0.47) once Watchtowers are priced out
// of reach. See docs/reviews/2026-08-04-fusion-siting-confound-diagnosis.md.
//
// The fix is DISJOINT COLUMN BANDS, not a better single list. Per gap:
//   Watchtower  gap-1 only              (1x1: occupies exactly gap-1)
//   free special / fusion, 'funnel'  anchor gap    -> covers gap, gap+1
//   free special / fusion, flank     anchor gap+2  -> covers gap+2, gap+3
// No special placement can ever touch gap-1, so the Watchtower column is
// identical in the control arm, in every fusion arm, and at both sitings. The
// A/B then varies the fusion and nothing else.
//
// Why gap-1 for the tower rather than splitting both sides: the finding is
// specifically that WHICH SIDE the tower lands on is load-bearing on maze A
// (col 12 vs col 14 measured 141/43 vs 74/110 across arms, tracking the score
// exactly). A protocol that lets the side vary at all reintroduces the
// confound in a subtler form, so the side is pinned by construction.
//
// Depth is 1..6 rather than 1..3 because pinning the column halves the pool
// (6 sites per maze instead of 12) and the policy buys one Watchtower per
// build phase over ~10 waves; 12 sites keeps the tower budget from being
// capped by geometry, the same failure `walkableDefenceSites` was written to
// fix for 2-wide walkable defences.
//
// Opt-in and additive: `funnelSites`/`towerSites`/`offLaneSites` are all
// untouched, so every legacy measurement stays reproducible byte-for-byte.
function isolatedTowerSites(maze) {
  const sites = []
  for (let dy = 1; dy <= 6; dy++) {
    for (const gap of maze.gaps) sites.push([gap - 1, maze.wallRow + dy])
  }
  return sites
}

function isolatedSpecialSites(maze, siting) {
  if (siting !== 'funnel' && siting !== 'flank') {
    throw new Error(`isolatedSpecialSites: siting must be 'funnel' or 'flank', got ${JSON.stringify(siting)}`)
  }
  const col = siting === 'funnel' ? 0 : 2
  const sites = []
  for (let dy = 1; dy <= 4; dy++) {
    for (const gap of maze.gaps) sites.push([gap + col, maze.wallRow + dy])
  }
  return sites
}

// Site list for the DEFENSE ARM's spendDown loop, walkable defences only
// (2026-08-04, Rock Trap standalone measurement follow-up — see
// docs/reviews/2026-08-04-rock-trap-site-cap-fix.md). `funnelSites`+
// `towerSites` were sized for a single 1x1-or-blocking placement (the free
// special, or Watchtower); EARTH_SPECIAL and FIRE_SPECIAL are BOTH a 2x1
// footprint (`STRUCTURE_SIZE`, shared/constants.js), so a funnel site's
// second tile (gap+1, dy) silently collides with every towerSite at the same
// dy — both the (gap+1) entry (caught by the cheap anchor-only precheck
// below and skipped) and the (gap-1) entry (NOT caught by that precheck,
// since its own anchor tile is free; it fails inside placeStructure's
// footprint check instead, wasting the loop iteration harmlessly). Net
// effect either way: for a 2-wide walkable defence under `spendDown`, all 12
// `towerSites` entries are unusable and the real candidate pool is just the
// 8 `funnelSites` slots — a hard cap independent of gold, confirmed by
// sweeping EARTH_SPECIAL's cost to 0 and seeing wave-1 purchases pinned at
// exactly 8 regardless. Watchtower (1x1, blocking, `towerSites` only, no
// self-collision) never hits this cap, so the "equal gold" defence-arm
// protocol was not actually equal capacity for any 2-wide walkable defence.
// Fix: extend the SAME single-column funnel geometry — no self-collision
// risk, since a 2-wide-1-tall footprint stacked one row at a time never
// overlaps its own neighbours — deep enough to roughly match Watchtower's
// ~20-site nominal pool (10 rows x 2 gaps = 20) rather than inventing new
// geometry. Both gap columns sit far outside NO_BUILD_ARC_RADIUS_PX at every
// row used here (checked against shared/constants.js's HALL position: the
// nearest gap column is ~7 tiles / 224px off the hall's x-center on maze A,
// ~15 tiles on maze B, both already past the 160px arc radius at dy=0).
// Additive and scoped to the defence-arm walkable branch only: `funnelSites`
// itself (used by the legacy 'funnel' site list for a single placement, where
// self-collision never arises) and `towerSites` (Watchtower's own list) are
// both untouched, so every existing published measurement stays comparable.
function walkableDefenceSites(maze) {
  const sites = []
  for (let dy = 1; dy <= 10; dy++) {
    for (const gap of maze.gaps) sites.push([gap, maze.wallRow + dy])
  }
  return sites
}

// Append one placement to the footprint ledger, reading the ACTUAL tile span
// back off the placed structure rather than trusting the anchor the policy
// asked for. That distinction is the whole value of the ledger: every siting
// confound this project has diagnosed came from a 2-wide structure occupying a
// column its anchor did not name.
function recordPlacement(state, m, role, gx, gy) {
  const s = findStructureAt(state, gx, gy)
  if (!s) return
  m.placements.push({
    wave: state.wave, role, type: s.type,
    gx: s.gx, gy: s.gy, w: s.w ?? 1, h: s.h ?? 1,
  })
}

// One scripted build phase. Deliberately dumb: claim the free wave-1 special,
// rebuild what the horde ate, then buy one watchtower. It only has to be
// non-zero — a harness with an amputated build loop cannot see the economy, the
// tower catalog, combos or dormancy.
//
// THE FREE SPECIAL (added 2026-07-25). buildStructure grants every player one
// FREE placement of their own element's special during wave 1 (economy.js). The
// policy never claimed it, so EARTH_SPECIAL appeared in exactly zero measured
// matches while the three BOT elements' specials were auto-placed near the hall
// by seedStartingEconomy. Leaving a free structure unbuilt is a defect in the
// policy, not a difficulty choice: it costs no gold, so it trades off against
// nothing and cannot be defended as "dumb but representative".
//
// NOTE: it does NOT repair. server/game/repair.js has no caller outside its own
// test — no EVENTS entry, no socket handler, no client binding — so channel
// repair does not exist in the shipped game. Scripting it here would measure a
// game nobody can play. Barricades are consumable; that is the real game.
function runBuildPolicy(state, maze, now, m, protocol) {
  const {
    fuse, fuseWave, defence, freeSpecial, spendDown, fuseWith, partnerSpecial,
    legacySiting, specialSiting, legacySpecialSites, defenceCap,
  } = protocol
  const human = state.players.find(p => !p.isBot)
  if (!human) return

  // Free, so it runs BEFORE the paid rebuilds — it competes for a tile, never
  // for gold. Same deterministic site list the watchtower uses, unless
  // `legacySpecialSites` opts into a different one (funnel, for the fusion
  // flank-vs-funnel A/B — see docs/handoffs/2026-08-02-task20-fusion-siting-
  // instrument-fix.md). Every fusion partner builds directly below this
  // anchor tile, so the free special's site list is also the fusion's.
  if (freeSpecial && !human.usedFreeSpecial) {
    const type = ELEMENT_SPECIAL_TYPE[human.element]
    // A directional special (Water Geyser / Wind Vortex) is rejected outright
    // without a cardinal — the same rule the partner placement below already
    // honours. It never mattered while the human was always EARTH; with
    // `humanElement` it silently produced no free special and therefore no
    // fusion at all. 'S' matches the seeded default and the partner's choice.
    const freeDir = DIRECTIONAL_TYPES.includes(type) ? 'S' : undefined
    const siteList = !legacySiting ? isolatedSpecialSites(maze, specialSiting)
      : legacySpecialSites === 'funnel' ? funnelSites(maze)
      : legacySpecialSites === 'offlane' ? offLaneSites(maze)
      : towerSites(maze)
    for (const [gx, gy] of siteList) {
      if (findStructureAt(state, gx, gy)) continue
      const res = buildStructure(state, human, type, gx, gy, now, { orient: 'H', dir: freeDir })
      if (res.ok) { m.freeSpecialPlaced = true; m.freeSpecialAt = [gx, gy]; recordPlacement(state, m, 'freeSpecial', gx, gy); break }
    }
  }

  // THE FUSION. Six combo types exist and not one had ever appeared in a
  // measured match. Buy a partner special directly BELOW the free one — same
  // column, so it can never plug a lane and change the maze under the
  // measurement — then ACCEPT the proposal the placement opens.
  //
  // Task 13 turned fusion into a consent gate: placement no longer fuses
  // anything by itself. The policy therefore has to answer its own proposal.
  // Both ingredients are owned by the same scripted human here (a human may
  // build any BOT element's special), so `requiredIds` is that one player and
  // one accept completes it — the same human-on-behalf-of-bot path Amendment
  // A1.2 spells out. Orientation is now passed explicitly rather than relying
  // on the 'H' default, and a directional partner (Water Geyser / Wind Vortex)
  // gets a cardinal, without which placement is rejected outright.
  //
  // Unlike the free special this is a genuine policy strengthening, not a defect
  // fix: STARTING_GOLD is 8 and a special costs 8, so the fusion spends the
  // entire opening purse and trades directly against the watchtower and two
  // barricades. Deliberately dumb, matching the rest of this policy: it takes
  // the first pairable bot element in catalog order rather than choosing a
  // combo. `comboFormed` records which one actually landed, so a baseline taken
  // here is never secretly a GRINDER baseline.
  //
  // fuseWave defaults to 4, NOT 1, and that default is a measured choice rather
  // than a taste: fusing on wave 1 spends the whole opening purse and costs
  // -0.228 (t -2.23) on maze A and -0.391 (t -2.59) on maze B, while fusing at
  // wave 4 is indistinguishable from not fusing (+0.045 / -0.116). Defaulting to
  // wave 1 would tax every future measurement for a mistake a real player would
  // not make. See docs/reviews/2026-07-25-tower-baseline.md.
  // `partnerSpecial` (opt-in, default null) buys that same partner at that same
  // tile and DELIBERATELY DECLINES the proposal, leaving both 2x1 ingredients
  // standing unfused. It exists because every fusion number this project has
  // taken was measured against a control holding ONE ingredient — the partner
  // is bought inside this branch and nowhere else — while spec §1 asks that a
  // fusion "outperform their two ingredients". That control answered a question
  // the spec does not ask, and it flattered every fusion in the roster. See
  // docs/reviews/2026-08-15-steam-vent-mechanism.md §5.
  //
  // Declining is safe rather than merely untested: Task 13 made fusion a consent
  // gate, so placement fuses nothing by itself and an unanswered proposal is
  // simply never accepted. The arms are otherwise identical — same anchor, same
  // partner element, same tile, same wave, same gold — so the contrast is
  // exactly fused-vs-unfused rather than fused-vs-absent.
  const wantsPartner = fuse || partnerSpecial !== null
  if (wantsPartner && state.wave >= fuseWave && m.freeSpecialAt && !m.partnerPlacedAt) {
    const [fx, fy] = m.freeSpecialAt
    // `fuseWith` (opt-in, default null) pins WHICH partner element is tried,
    // so a gate can exercise a specific fusion. Left unset the policy keeps
    // its original catalog-order scan, which with an EARTH human always lands
    // MAGMA_TRAP — meaning a default run never builds four of the six
    // fusions, and a hang gate taken on the default cannot say anything about
    // the structure it was run for. Default behavior is byte-identical, so
    // every published baseline stays comparable.
    for (const el of (fuse ? (fuseWith ? [fuseWith] : ELEMENTS) : [partnerSpecial])) {
      const partner = ELEMENT_SPECIAL_TYPE[el]
      if (el === human.element) continue
      if ((human.gold ?? 0) < BALANCE.STRUCTURES[partner].cost) break
      if (findStructureAt(state, fx, fy + 1)) break
      const dir = DIRECTIONAL_TYPES.includes(partner) ? 'S' : undefined
      const res = buildStructure(state, human, partner, fx, fy + 1, now, { orient: 'H', dir })
      if (!res.ok) continue
      // Latch BEFORE the fuse/decline split so neither path re-buys a partner
      // that enemies later destroy. The fusion path used to be latched by
      // `comboFormed`, which stays null forever in the decline path.
      m.partnerPlacedAt = [fx, fy + 1]
      if (!fuse) {
        m.partnerSpecialPlaced = true
        recordPlacement(state, m, 'partnerSpecial', fx, fy + 1)
        break
      }
      if (res.fusionProposal) {
        // A directional fusion (Grinder, the only fusion in DIRECTIONAL_TYPES)
        // locks its cardinal at confirmation and the initiator is the only one
        // who may set it. Tried 'N' (toward gates/away from hall) 2026-08-02,
        // Task 20 experiment: it collapsed a strong maze-A funnel-sited signal
        // (+0.493 t4.43 under 'S') down to flat (+0.146 t1.22), and a
        // subsequent damage bump (45->60) barely moved it (t1.50) -- reverted
        // to 'S' to isolate whether direction, not damage, was the deciding
        // factor. 'S' ejects crushed enemies deeper toward the hall.
        const fuseDir = res.fusionProposal.needsDirection ? 'S' : undefined
        respondToFusion(state, human, res.fusionProposal.id, true, now, { dir: fuseDir })
      }
      const made = findStructureAt(state, fx, fy + 1) ?? findStructureAt(state, fx, fy)
      m.comboFormed = made && !SPECIAL_TYPE_ELEMENT[made.type] ? made.type : null
      recordPlacement(state, m, 'fusion', made ? made.gx : fx, made ? made.gy : fy + 1)
      break
    }
  }

  for (let gx = 1; gx < 39; gx++) {
    if (maze.gaps.includes(gx)) continue
    if (findStructureAt(state, gx, maze.wallRow)) continue
    if ((human.gold ?? 0) < BALANCE.STRUCTURES[STRUCTURE_TYPES.BARRICADE].cost) {
      m.rebuildsSkippedForGold++
      continue
    }
    const res = buildStructure(state, human, STRUCTURE_TYPES.BARRICADE, gx, maze.wallRow, now)
    if (res.ok) m.rebuildsPurchased++
  }

  // THE DEFENCE ARM (added 2026-07-25 for A5 step 2). `defence` names the
  // structure type the leftover purse buys, so an A/B differs in exactly one
  // thing: what the same gold, at the same sites, in the same maze, is spent on.
  // It spends DOWN rather than buying one — a single purchase cannot express an
  // equal-gold comparison between a 6-gold Watchtower and an 8-gold Firepit.
  // `spendDown` is OFF by default so the shipped policy — buy exactly one — is
  // untouched and every existing measurement stays comparable. The A/B turns it
  // on for BOTH arms: a single purchase cannot express an equal-gold comparison
  // between a 6-gold Watchtower and an 8-gold Firepit.
  const defCost = BALANCE.STRUCTURES[defence].cost
  // Under the isolated protocol the BLOCKING defence uses the pinned gap-1
  // column too — otherwise the defence arm would reintroduce exactly the
  // collision the protocol exists to remove.
  const defSites = isWalkable(defence) ? walkableDefenceSites(maze)
    : !legacySiting ? isolatedTowerSites(maze)
    : towerSites(maze)
  // `defenceCap` (opt-in, default null = unbounded) caps the CONCURRENT STANDING
  // count of `defence` structures the human owns, checked before each purchase.
  // Standing, not cumulative: a defence lost to the horde frees its slot, so a
  // capped arm still rebuilds back up to N — the cap is "how many towers are up
  // at once", which is the quantity a marginal-value sweep varies. Added
  // 2026-08-04 for the Watchtower marginal-value measurement (does the A1.4
  // 1.0-power-unit anchor saturate, or is it linear and therefore unclearable by
  // construction?). Additive: null reproduces today's spend-down byte for byte,
  // so every existing measurement stays comparable.
  let standing = defenceCap === null ? 0
    : state.structures.filter(s => s.type === defence && s.ownerId === human.id).length
  if ((human.gold ?? 0) >= defCost) {
    for (const [gx, gy] of defSites) {
      if ((human.gold ?? 0) < defCost) break
      if (defenceCap !== null && standing >= defenceCap) break
      if (findStructureAt(state, gx, gy)) continue
      const res = buildStructure(state, human, defence, gx, gy, now)
      if (res.ok) { m.towersPurchased++; standing++; recordPlacement(state, m, 'defence', gx, gy); if (!spendDown) break }
    }
  }

  state.costField.compute()
}

// --- per-wave difficulty profile --------------------------------------------

// The score is terminal, so the difficulty CURVE is invisible to it. These are
// the per-wave leading indicators, in measured order of sensitivity:
// enemySeconds > structuresLost > playerDowns > hallHp. Hall HP is the WORST
// early signal (flat at 1.000 through wave 4 in every scenario measured) and is
// currently the only thing scored on.
function newWaveRecord(wave, hallHpFrac) {
  return {
    wave, complete: false,
    fightTicks: 0, enemySeconds: 0,
    playerDowns: 0, playerDeaths: 0,
    structuresLost: 0,
    hallHpFracStart: hallHpFrac, hallHpFrac, hallDamage: 0,
    closestApproachPx: Infinity,
    damage: { basic: 0, ability: 0, structure: 0 },
  }
}

// `complete` is the honest flag: false marks the wave a run was still inside
// when it was lost, hung or hit the tick cap. Those partial waves must never be
// averaged in with cleared ones.
//
// `waveStartDamage` is the cumulative per-category damage snapshot taken when
// this record was opened (Task 3): the delta against the current cumulative
// total is this wave's share, so summing every wave's damage reproduces the
// run total exactly — the same reconciliation contract as fightTicks/downs/
// deaths above.
function closeWaveRecord(state, rec, waveStartIds, complete, waveStartDamage) {
  if (!rec) return
  rec.complete = complete
  rec.hallHpFrac = Math.max(0, state.hall.hp) / state.hall.maxHp
  rec.hallDamage = Math.max(0, rec.hallHpFracStart - rec.hallHpFrac)
  if (waveStartIds) {
    const alive = new Set(state.structures.map(s => s.id))
    let lost = 0
    for (const id of waveStartIds) if (!alive.has(id)) lost++
    rec.structuresLost = lost
  }
  if (waveStartDamage) {
    const now = snapshotCategoryDamage(state.combatStats)
    rec.damage = {
      basic: now.basic - waveStartDamage.basic,
      ability: now.ability - waveStartDamage.ability,
      structure: now.structure - waveStartDamage.structure,
    }
  }
}

// Sample the tension metric every 4th fight tick (200ms). An enemy at the
// fastest shipped speed covers well under a tile in that window, so the minimum
// is not meaningfully coarsened — and a per-tick O(enemies) scan across 144
// full runs is not free.
const APPROACH_SAMPLE_TICKS = 4

function sampleClosestApproach(state, rec) {
  const st = state.enemyStore
  const hx = state.hall.x, hy = state.hall.y
  let best = rec.closestApproachPx
  for (let i = 0; i < st.count; i++) {
    const dx = st.x[i] - hx, dy = st.y[i] - hy
    const d2 = dx * dx + dy * dy
    if (d2 < best * best) best = Math.sqrt(d2)
  }
  rec.closestApproachPx = best
}

// Cooldown utilization (Task 3b): attempts are already recorded per owner in
// combatStats; theoretical max is derived from the ACTIVE window (players.js:
// tickPlayers, and therefore both tryBasicAttack and trySpecial/trySecond,
// runs in BUILD, FIGHT and WAVE_END phases — not gated to FIGHT — so the
// denominator is total ticks, not fightTicks) and the relevant BALANCE
// cooldown(s), post-processed here rather than through a new engine hook (per
// the design note — attempts already exist, only the ceiling needs
// computing). Using m.ticks slightly overcounts the window on the handful of
// tail ticks where the run ends via WON/LOST (tickPlayers already ran that
// tick, so this is at most a 1-tick error over a run of thousands).
// CAVEATS, both making utilization a conservative (never-inflated) reading:
// (1) it's the run's total active window, not this player's alive time, so a
// player who died mid-run reads as under-utilized rather than as having had
// a smaller window; (2) the 'ability' bucket combines SPECIAL and SECOND
// casts (both tagged by ownerId only, per abilities.js), so its theoretical
// max sums both cooldowns even across waves before SECOND unlocks at team
// level 4 — an overestimate of the ceiling.
function cooldownUtilization(state, m) {
  const activeMs = m.ticks * DT_MS
  const findAttempts = (category, ownerId) =>
    m.combat.byOwner.find(b => b.category === category && b.ownerId === ownerId)?.attempts ?? 0
  const row = (category, ownerId, attempts, theoreticalMax) => ({
    ownerId, category, attempts, theoreticalMax,
    utilization: theoreticalMax > 0 ? attempts / theoreticalMax : 0,
  })
  const out = []
  for (const p of state.players) {
    // Every class has a BASIC entry as of Task 5 (WIND's fan-blade); the
    // guard stays defensive rather than assumed, same pattern as before.
    const basicCfg = BALANCE.PLAYER.BASIC[p.element]
    const basicMax = basicCfg ? Math.floor(activeMs / basicCfg.cooldownMs) : 0
    out.push(row('basic', p.id, findAttempts('basic', p.id), basicMax))

    const kit = BALANCE.ABILITY[p.element]
    const abilityMax = Math.floor(activeMs / kit.SPECIAL.cooldownMs) + Math.floor(activeMs / kit.SECOND.cooldownMs)
    out.push(row('ability', p.id, findAttempts('ability', p.id), abilityMax))
  }
  return out
}

// --- the run ---------------------------------------------------------------

/**
 * Run one scenario to WON / LOST / tick-cap.
 *
 * Takes a PARTIAL protocol and resolves it through protocol.js, which fills
 * every default explicitly, validates, freezes, and throws on any key it does
 * not recognise. See PROTOCOL_DEFAULTS there for the full field list and the
 * reasoning behind each default — deliberately documented in one place rather
 * than duplicated into a JSDoc block that drifts out of date (this one had, and
 * was describing two parameters that no longer exist).
 *
 * Three keys are runtime-only and never enter the config hash, because none of
 * them can change a measurement: `onEnd` (a read-only diagnostic hook called
 * with (state, m) after the loop stops, so a soft-lock investigation can
 * inspect live state without duplicating this loop), `tiProbe` and
 * `volleyProbe` (caller-owned accumulators for target-impact and per-volley
 * hit counts).
 *
 * The returned metrics carry `protocol` — the frozen resolved protocol — and
 * `placements`, the footprint ledger. A number that travels without its
 * configuration is how this project accumulated published results nobody could
 * re-derive.
 *
 * @param {object} partial  any subset of PROTOCOL_DEFAULTS, plus the three hooks
 * @returns {object} metrics
 */
export function runMatch(partial) {
  const { protocol, hooks, maze } = resolveProtocol(partial)
  const { seed, postGap, maxWaves, humanElement } = protocol
  const { onEnd, tiProbe, volleyProbe } = hooks

  const state = createGameState(makeRoom(humanElement), seed)
  state.aoeStats = { activeTicks: 0, enemySeconds: 0, heldNow: 0 }   // §8 area-field occupancy
  // §8 occupancy, same convention, for the two exact-footprint families
  // (2026-08-29 structure-occupancy audit): Muddy Bog (areaEntry) and Magma
  // Trap (entryTrigger). Only Firepit (the aoe family, above) had this.
  state.areaEntryStats = { activeTicks: 0, enemySeconds: 0 }
  state.entryTriggerStats = { activeTicks: 0, enemySeconds: 0 }
  // §8 occupancy, step 3/4: the range/radius families (single "ever in
  // range" check per structure, towers.js's sampleRangeReach) and Grinder's
  // pull-vs-crush landing rate (cycle.js's grinderStats) -- see the audit's
  // step 3/4 in docs/handoffs/2026-08-29-structure-occupancy-audit.md.
  state.rangeStats = new Map()
  state.grinderStats = { cycles: 0, pulled: 0, crushed: 0, pulledAndCrushed: 0 }
  // §8 occupancy, follow-up: Water Geyser (displace) and Steam Vent
  // (scaldField) share Firepit's margin/siting exposure per the audit's own
  // classification table -- same idiom, extended to close that gap.
  state.displaceStats = { activeTicks: 0, enemySeconds: 0 }
  state.scaldFieldStats = { activeTicks: 0, enemySeconds: 0 }
  // Opt-in target-impact instrumentation (2026-08-04, Task 20 §0 siting
  // diagnosis). Same set-it-on-state convention as aoeStats; the caller owns
  // the accumulator so it can total across a whole scenario sweep.
  if (tiProbe) state.tiProbe = tiProbe
  // Same convention, for Firestorm (the only spec.volley structure).
  if (volleyProbe) state.volleyProbe = volleyProbe
  state.combatStats = createCombatStats()   // Task 3 source-tagged combat accounting
  startBuildPhase(state, 1)
  placeStartingMaze(state, maze)

  const post = {
    x: (maze.gaps[postGap] + 0.5) * TILE_SIZE,
    y: (maze.wallRow + 3) * TILE_SIZE,
  }

  const m = {
    // The resolved protocol travels WITH the metrics, always. A number whose
    // configuration has to be reconstructed from the driver that produced it is
    // exactly how this project ended up with published results nobody could
    // re-derive. It is frozen, so a caller cannot edit it after the fact and
    // report a protocol the run did not execute.
    protocol,
    seed, postGap, gaps: maze.gaps.join('/'),
    wavesCleared: 0, won: false, lost: false, timedOut: false, stalled: false, stoppedEarly: false,
    hallHp: state.hall.hp, hallHpFrac: 1, score: 0,
    enemySeconds: 0, playerDowns: 0, playerDeaths: 0,
    rebuildsPurchased: 0, rebuildsSkippedForGold: 0, towersPurchased: 0,
    freeSpecialPlaced: false, freeSpecialAt: null, comboFormed: null,
    // The two-ingredient control's ledger. `partnerPlacedAt` latches BOTH
    // paths (fuse and decline); `partnerSpecialPlaced` is true only where the
    // proposal was declined, so a record can never be mistaken for a fusion.
    partnerPlacedAt: null, partnerSpecialPlaced: false,
    // WP3: the footprint ledger. Every non-barricade placement the policy makes,
    // with the tile span it actually occupies. Three of this project's
    // instrument defects were placements colliding with each other, and not one
    // was visible in any recorded output — the numbers moved and the cause was
    // invisible for weeks. Barricades are excluded deliberately: they sit ON the
    // wall row, never in the tower band below it, so they cannot participate in
    // the collision class this ledger exists to expose, and including ten waves
    // of rebuilds would bury the placements that matter.
    placements: [],
    goldUnspent: 0, buildTicks: 0, fightTicks: 0, ticks: 0,
    waves: [],
    combat: null,   // filled at the end from state.combatStats — see snapshotCombatStats
    // Task 3b peak-active-effects: running max of the SAME live counts
    // simulationBudgets.test.js checks against BALANCE.LIMITS — no new
    // counter design, just observing state.projectiles.length and
    // state.aoeStats.heldNow (towers.js) every tick.
    peakProjectiles: 0, peakStructureEffects: 0,
  }

  let now = 0
  let policyRanForWave = -1
  let stallTicks = 0
  let lastLivingCount = -1

  // The record for the wave currently being played. Opened lazily so a run that
  // ends at a wave boundary does not trail an empty record for a wave that was
  // never played.
  let rec = null
  let recClosed = false
  let lastRecordedWave = 0
  // Barricades standing when the horde arrives. Snapshotting at fight start,
  // not wave start, attributes only real combat losses — the build policy has
  // already rebuilt by then.
  let waveStartIds = null
  let waveStartDamage = snapshotCategoryDamage(state.combatStats)

  for (let t = 0; t < MAX_TICKS; t++) {
    now += DT_MS

    // The scripted build policy fires once per build phase, at its start.
    if (state.phase === PHASES.BUILD && policyRanForWave !== state.wave) {
      policyRanForWave = state.wave
      runBuildPolicy(state, maze, now, m, protocol)
    }

    // THE CHANGE: phaseClockMs is NOT zeroed. The build phase runs its full
    // BALANCE.PHASE.BUILD_TIMER_MS, every wave.
    const event = tickGame(state, humanInputs(state, post), now, DT_MS)

    m.ticks++
    if (state.wave > lastRecordedWave) {
      lastRecordedWave = state.wave
      rec = newWaveRecord(state.wave, m.waves.at(-1)?.hallHpFrac ?? 1)
      recClosed = false
      m.waves.push(rec)
      waveStartDamage = snapshotCategoryDamage(state.combatStats)
    }
    if (state.phase === PHASES.BUILD) m.buildTicks++
    if (state.phase === PHASES.FIGHT) {
      m.fightTicks++
      m.enemySeconds += state.livingEnemyCount * (DT_MS / 1000)
      rec.fightTicks++
      rec.enemySeconds += state.livingEnemyCount * (DT_MS / 1000)
      if (waveStartIds === null) waveStartIds = new Set(state.structures.map(s => s.id))
      if (rec.fightTicks % APPROACH_SAMPLE_TICKS === 0) sampleClosestApproach(state, rec)
    }
    // Sampled every tick, not just FIGHT: tickPlayers casts specials in BUILD
    // and WAVE_END too (same reasoning as cooldownUtilization's denominator),
    // so a projectile fired outside FIGHT would otherwise go unobserved until
    // initFight clears state.projectiles at the next BUILD->FIGHT edge.
    if (state.projectiles.length > m.peakProjectiles) m.peakProjectiles = state.projectiles.length
    if (state.aoeStats.heldNow > m.peakStructureEffects) m.peakStructureEffects = state.aoeStats.heldNow
    for (const fx of state.fx) {
      if (fx.type === 'downed') { m.playerDowns++; rec.playerDowns++ }
      else if (fx.type === 'pdied') { m.playerDeaths++; rec.playerDeaths++ }
    }
    if (event === 'waveEnd') {
      m.wavesCleared++
      closeWaveRecord(state, rec, waveStartIds, true, waveStartDamage)
      // The record stays the accumulation target through the intermission: a
      // player bleeding out during waveEnd was killed by the wave that just
      // ended, and its hall/structure totals are already snapshotted, so a late
      // down cannot rewrite them. `recClosed` stops the end-of-run flush from
      // re-flagging a wave that genuinely cleared.
      recClosed = true
      waveStartIds = null
    }

    // Stall detection only stops the loop earlier; it changes no sim
    // behaviour. Gated to FIGHT so an idle BUILD phase (livingEnemyCount
    // constant at 0 for thousands of ticks by design) never trips it.
    if (state.phase === PHASES.FIGHT) {
      if (state.livingEnemyCount === lastLivingCount) stallTicks++
      else { stallTicks = 0; lastLivingCount = state.livingEnemyCount }
      if (stallTicks >= STALL_TICKS) { m.stalled = true; break }
    } else {
      stallTicks = 0
      lastLivingCount = -1
    }

    if (state.phase === PHASES.WON)  { m.won = true;  break }
    if (state.phase === PHASES.LOST) { m.lost = true; break }
    // Only stop early for a deliberately-shortened test run (maxWaves below
    // the full count). At the full horizon (the default) this used to fire
    // on the SAME tick wavesCleared reached maxWaves — one tick before the
    // phase machine (one transition per tick) ever reaches PHASES.WON — so
    // `won` was structurally always false. Let a full run tick to its own
    // WON/LOST instead of capping on wave count.
    if (maxWaves < BALANCE.WAVE_COUNT && m.wavesCleared >= maxWaves) {
      m.stoppedEarly = true
      break
    }
  }

  if (!recClosed) closeWaveRecord(state, rec, waveStartIds, false, waveStartDamage)

  // Task 5: finalize any attempt this harness stopped mid-resolution (a
  // still-winding-up Wind cast, or any projectile still in flight) so
  // combat-stat totals reconcile for a COMPLETED match — see the flush
  // functions' own doc comments for why this is harness-only, not a sim fix.
  flushPendingBasics(state)
  flushPendingProjectiles(state)

  m.aoeActiveTicks = state.aoeStats.activeTicks
  m.aoeEnemySeconds = state.aoeStats.enemySeconds
  m.areaEntryActiveTicks = state.areaEntryStats.activeTicks
  m.areaEntryEnemySeconds = state.areaEntryStats.enemySeconds
  m.entryTriggerActiveTicks = state.entryTriggerStats.activeTicks
  m.entryTriggerEnemySeconds = state.entryTriggerStats.enemySeconds
  m.rangeReach = [...state.rangeStats.values()]
  m.grinderStats = { ...state.grinderStats }
  m.displaceActiveTicks = state.displaceStats.activeTicks
  m.displaceEnemySeconds = state.displaceStats.enemySeconds
  m.scaldFieldActiveTicks = state.scaldFieldStats.activeTicks
  m.scaldFieldEnemySeconds = state.scaldFieldStats.enemySeconds
  m.combat = snapshotCombatStats(state.combatStats)
  m.cooldownUtilization = cooldownUtilization(state, m)
  if (!m.won && !m.lost && !m.stoppedEarly && !m.stalled) m.timedOut = true
  m.hallHp = Math.max(0, state.hall.hp)
  m.hallHpFrac = m.hallHp / state.hall.maxHp
  m.goldUnspent = state.players.filter(p => !p.isBot).reduce((a, p) => a + (p.gold ?? 0), 0)

  // The continuous outcome metric. Waves cleared dominates; hall HP resolves
  // ties within a wave. Report this, never a win rate alone.
  m.score = m.wavesCleared + m.hallHpFrac
  if (onEnd) onEnd(state, m)
  return m
}
