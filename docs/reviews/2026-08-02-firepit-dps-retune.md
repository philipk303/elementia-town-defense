# Firepit continuous-DPS retune — maze B decisively won, maze A no longer a decisive loss

**Date:** 2026-08-02
**Follows:** `docs/reviews/2026-08-02-firepit-hang-fix.md` (item 1 of the same handoff)
**Handoff item 2 executed:** `docs/handoffs/2026-08-02-firepit-hang-and-dps-retune.md`
**Scripts:** `test/harness/firepitRetest.js` (reused, unmodified),
`test/harness/watchtowerRangeProbe.js` (new, isolated Watchtower range
self-comparison under the same spendDown/no-fuse method)

**Result, FINAL numbers (Watchtower 3dmg/750ms/75px range, Firepit
dps15/margin15/burn9-4000ms): maze B is a large, decisive, replicating
Firepit win. Maze A is no longer a decisive loss — a genuine small residual
disadvantage that does not clear the t>2 significance bar.** Whether this
formally satisfies A1.4(a)'s "≥1.0 power unit at equal gold in the intended
scenario" bar (`combat-structure-redesign.md:585-593`) is NOT claimed either
way in this review — that requires knowing which maze is Firepit's formally
declared intended scenario, which isn't recorded in this session's context.
This is reported as the most defensible measured state reached, not as a
pass/fail verdict.

This review supersedes its own earlier draft's numbers twice over — the
Watchtower side kept moving after the initial dps/margin/burn pass, see §5.

---

## 1. What changed, in order, and why the order matters

Three separate tuning passes happened in this session, and the balance.js
history in `shared/balance.js` records the exact sequence because a couple of
early moves were reverted or replaced — they are NOT presented here as if a
single clean set of numbers was chosen up front.

| pass | Watchtower | Firepit dps | Firepit marginPx | Firepit burn |
|---|---|---|---|---|
| baseline (pre-session) | 5dmg/600ms (8.33 dps) | 9 | 12 | 8dps/3000ms |
| 1 | **4dmg/750ms (5.33 dps)** | **12** | 12 | 8dps/3000ms |
| 2 (reverted) | 5.33 dps | **15** | **24** | 8dps/3000ms |
| **final (shipped)** | 5.33 dps | 15 | **15** | **9dps/4000ms** |

Pass 2's `marginPx: 24` was reverted before shipping — see §2. The final
row is what's in `shared/balance.js` now.

## 2. The margin-24 detour, and why it matters beyond just reverting it

`marginPx: 24` was tried as a second, independent lever alongside the dps
bump. It broke a real geometric invariant: Firepit's field extends
`16 + marginPx` px from center on its SHORT axis (a 1-wide vertical pit, or a
1-tall horizontal one). The neighbouring tile's centre sits exactly 32px away,
so **any margin >= 16 lets the field reach into the adjacent lane/column**,
not just the pit's own footprint. `test/game/enemies.test.js`'s pre-existing
`firepit.test.js` test "a vertical Firepit heats the tile BELOW its anchor"
exists to guard exactly this and caught it immediately — it wasn't a stale
pinned literal, it was a real regression.

**This also gives a concrete mechanism for a symptom that showed up in the
measurement itself.** At `marginPx: 24` maze A's split-half DISAGREED in sign
(half1 +0.009, half2 -0.281) — a genuinely noisy, non-replicating result. A
field that can spill into whichever lane happens to sit next to a given
Firepit placement behaves differently seed-by-seed depending on what's
adjacent (empty space vs. another lane's traffic vs. a wall), which is exactly
the kind of seed-dependent variance that produces a sign flip between split
halves instead of a stable effect. This is offered as a plausible
explanation, not a proven one — it was not separately isolated — but it lines
up with both the geometry and the data.

**Max safe margin, derived precisely, not guessed:** `tickArea`'s inclusion
test is `x > r.x1` (inclusive at the boundary), so the field stays clear of
the neighbour tile's centreline exactly while `margin < 16`. **15 is the
largest integer margin that preserves lane isolation**, and is what shipped.

## 3. Final numbers and rationale

- **Watchtower: 5dmg/600ms (8.33 dps) -> 4dmg/750ms (5.33 dps).** Chosen
  directly (damage held to a round number, cooldown solved to hit the target
  rate).
- **Firepit dps: 9 -> 12 -> 15.** Two +3 steps, the same increment both times
  — not re-derived from new math on the second step, reusing the only
  calibration point available (the first step's measured effect, itself
  confounded with the simultaneous Watchtower cut — see §4).
- **Firepit marginPx: 12 -> 24 (reverted) -> 15.** Net effect: a modest
  increase from baseline, capped at the geometric ceiling in §2 rather than
  the originally-proposed doubling.
- **Firepit burn: 8dps/3000ms -> 9dps/4000ms.** A modest bump to both dps and
  duration, independent of every other structure's burn spec (each is its own
  object literal in `balance.js` — Fireball, Flame Nova, Firestorm and Magma
  Trap's burns are untouched by this).

## 4. Measured result (final numbers, `firepitRetest.js --maze both`)

| | Watchtower | Firepit | diff | t | split-half |
|---|---|---|---|---|---|
| maze A (baseline) | 8.744 | 7.653 | -1.091 | 13.06 | agreed (decisive fail) |
| **maze A (final)** | **8.354** | **8.079** | **-0.275** | **3.14** | **agrees** (-0.176 / -0.375) |
| maze B (baseline) | 7.382 | 7.409 | +0.027 | 0.17 | null, non-replicating |
| **maze B (final)** | **7.007** | **7.750** | **+0.743** | **4.80** | **agrees** (0.569 / 0.917) |

Hang gate: **0/144 on every arm/maze combination**, confirmed unaffected by
this pass (marginPx changes damage-application geometry only, never
`costField`/collision — see the hang-fix review for why that separation
holds).

At this point in the session (Firepit numbers only, Watchtower still at
4dmg/750ms/100px range): maze B was a decisive, replicating win. Maze A was
still a decisive loss (t 3.14) — smaller than the original -1.091 by about
75%, but not closed. **This was not the end state** — see §4b, which moved
Watchtower's own numbers further and changed maze A's verdict again.

**Confound, stated plainly:** dps and margin moved together in the same pass
(baseline->final), and Watchtower's own cut happened alongside Firepit's
first dps bump. The result above is the NET effect of all changes together;
individual lever contributions are not separated. If a future session wants
to know which lever did how much work, that needs isolated single-variable
runs — not attempted here, in keeping with getting to a measured, replicating
end state within this session rather than a fully decomposed one.

## 4b. Further Watchtower cuts — damage 4->3, and a range cut that broke a real acceptance test

A follow-up in the same session cut Watchtower further: **damage 4->3**
(cooldown unchanged, dps 5.33->4.00), then investigated a **range** cut.

**The range investigation used the existing single-dial sweep tool
(`probe.js`) first**, sweeping `TOWER.WATCHTOWER.rangePx` 100 vs 75 (a 25%
cut) under the SHIPPED default policy (one Watchtower purchase). Result: NO
SIGNAL on either maze (t 0.28 maze A, t 0.70 maze B) — a 25% range cut does
not move the outcome when only one tower is bought.

That check doesn't match the context this whole retune has actually been
measured in, though (`spendDown`, several Watchtowers covering overlapping
ground) — several towers can lose COVERAGE OVERLAP from a range cut in a way
a single tower never exercises. Re-measured with a new script,
`watchtowerRangeProbe.js` (self-comparison, same spendDown/no-fuse method as
`firepitRetest.js`): a 25% cut (100 vs 75) DID move maze A — diff -0.151, t
2.28, a real if modest effect, no effect on maze B (t 0.36). This is the
correct context to trust: it's the same method the whole Firepit-vs-Watchtower
comparison has used throughout.

**A 50% cut (rangePx 50) was tried next and REVERTED — it broke a real
functional guarantee, not just a balance number.**
`phase3Acceptance.test.js`'s "a scripted maze of towers clears waves 1-3" — a
NO-PLAYER, 40-Watchtower maze that must survive the three easiest waves on
tower fire alone — failed outright at rangePx 50 (hall destroyed in wave 1).
Isolated via a direct sim run (holding damage fixed at 3, varying only
range): range 75 clears the maze cleanly, range 50 does not. The cause is
geometric: that acceptance maze sites towers 2-3 tiles (64-96px) off the lane
centreline, and a 50px range is SHORTER than that offset — every one of the
40 towers was farther from the lane than its own range reached, so NONE of
them could ever fire on anything marching down the gap. Not a balance
nuance — a total functional collapse for that siting pattern, and very
likely a meaningful share of why the earlier Firepit-comparison numbers at
range 50 swung so hard (Watchtower's OWN placements going partially inert in
the spendDown matrix too, not just "Firepit looks relatively better").

**Shipped: rangePx 75** — already measured safe (passes the acceptance test)
and gives the real, replicating -0.151/t 2.28 effect against Firepit on maze
A under `spendDown`.

**Final measured result (Watchtower 3dmg/750ms/75px, Firepit
dps15/margin15/burn9-4000ms), `firepitRetest.js --maze both`:**

| | Watchtower | Firepit | diff | t | split-half |
|---|---|---|---|---|---|
| maze A | 8.236 | 8.079 | **-0.157** | **1.85** | agrees (-0.065 / -0.250, same sign) |
| maze B | 6.486 | 7.750 | **+1.264** | **7.98** | agrees (0.986 / 1.542) |

Hang gate: still 0/144 on every arm/maze combination.

**Maze A is no longer a decisive loss** (t 1.85, below the t>2 bar) — and
unlike the reverted range-50 attempt, this reading is trustworthy: split-half
agrees in SIGN this time (both halves negative), which is what a real small
residual effect looks like, not the large-magnitude sign flip
(+0.009/-0.281) the range-24-margin and range-50 detours both produced when
something was actually broken underneath a near-zero headline number. Maze B
is now an even larger, still cleanly-replicating win than the Firepit-only
pass produced (+1.264 vs +0.743).

**This is the state left at end of session.** Whether it formally satisfies
A1.4(a) is not claimed (see the top of this doc) — reported as the most
defensible measured state, not a verdict.

## 5. Regression coverage

No new tests were needed for the numeric retune itself (existing
`firepit.test.js`/`towers.test.js` assertions are parametric on
`spec().dps`/`spec().marginPx`/`spec().burn`, confirmed still green). The one
test that WAS sensitive to a raw margin value — the vertical-orientation
lane-isolation test — is what caught the margin-24 regression in the first
place; no changes were needed to it since the final `marginPx: 15` respects
its invariant.

Two pinned-literal tests in `matchRunner.test.js` moved repeatedly across
this session's three Watchtower/Firepit passes and were updated with reasons
each time, per their own stated rule. Final state:
- The 10-wave-clear seed swapped three times in one session: `20260809/1` ->
  `20260852/0` (Firepit-only pass) -> **`20260813/1`** (final, after §4b's
  further Watchtower cuts), hallHpFrac 0.964 — a comfortable margin, unlike
  the prior two thin-margin swaps.
- Default `20260801/0`: this is the first pass in the whole 2026-08-02 series
  where the OUTCOME itself moved, not just `enemySeconds` — `score`/
  `wavesCleared` went 8->**9** (a weaker Watchtower on this seed's leftover
  purse means the horde survives long enough to tip one more wave into
  clearing). `enemySeconds`: 1348.1 -> 1393.4 (hang fix) -> 1425.8
  (Firepit-only retune) -> **2139.3** (this pass) — the much larger jump here
  is because the run now integrates over 9 cleared waves instead of 8, not
  just "enemies live marginally longer" as the first two steps were.

## 6. Client: live hitbox aura (separate, adjacent change)

Alongside the retune, a persistent visual aura was added so a PLACED
structure's actual reach is visible during play — previously only the
placement-time hover ghost (`_drawPlacementGhost`) showed this, so a
structure's live hitbox was invisible once built. Implementation:
`GameScene.js`'s new `structureAuraGfx` (one shared Graphics, same
reuse pattern as the existing `structureDirGfx`) and `_drawStructureAura()`,
drawn every frame alongside the existing structure-render loop.

Scoped to PERSISTENT reach only (`aoe`/`marginPx`, `confusion`/
`cloudMarginPx`, `aura`/`radiusPx`, plain `rangePx`) — deliberately excludes
burst/proc radii (Magma Trap's `eruption.radiusPx`, ability radii), which
already have their own event-driven telegraph and would misrepresent a
one-shot burst as an always-on zone if drawn as a static aura. Colored by
each structure's own `STRUCTURE_COLORS` entry, not a new palette.

**Verified live**, not just by inspection: the game server serves a
PREBUILT `client/dist` (`express.static`, not a dev server), so a stale build
from earlier in the session initially showed the OLD `marginPx: 24` geometry
in the browser even after the source was reverted to 15 — caught by directly
reading the live Phaser scene's `structureAuraGfx.commandBuffer` via
`window.__scene`/`window.__net` (both already exposed for headless
verification) and finding the drawn rect matched 24's math, not 15's, byte
for byte. Rebuilding (`npm run build`) and re-verifying in a fresh tab
confirmed the aura now draws `(497,497,94x62)` / `(305,241,94x62)` — exact
match for `marginPx: 15` at both placed Firepits' coordinates, correct
`0xE8862E` fire color, and correctly ABSENT for structure types with no
persistent-reach config (Farm/Marketplace/Water/Wind Special all placed in
the same session, zero aura draw calls for any of them). The circle branch
(Watchtower/Firestorm/Snare Post) was not live-tested (ran out of test gold
mid-session) but reuses the exact branch logic the pre-existing, already-
shipped placement ghost has used since Task 9.

## 7. What is NOT claimed

- **A1.4(a) is not declared cleared or failed.** Maze A no longer decisively
  loses (§4b); whether that satisfies the spec's literal "≥1.0 power unit at
  equal gold in the intended scenario" bar depends on which maze is Firepit's
  formally declared intended scenario, which this session's context does not
  record. Reported as the measured state, not a verdict.
- Individual dps/margin/burn/damage/range contributions are not decomposed
  across the full session — only the range cut was isolated on its own (§4b);
  the earlier Firepit dps+margin move was confounded with Watchtower's first
  cut (§4).
- Firepit's cost (8 vs Watchtower's 6) is untouched — still an available
  lever per the original retest review's ranked options if maze A's residual
  disadvantage needs closing further.
- Rock Trap / Water Geyser / Wind Vortex / Snare Post remain untouched and
  out of scope, per the original handoff.
- The live aura's circle-shape branch (Watchtower/Firestorm/Snare Post) was
  code-reviewed but not live-browser-verified this session (§6).

## 8. Verification

- `npm test` — 613 tests, 611 pass, 0 fail, 2 skipped (final state, after §4b).
- `npm run build` — clean, and confirmed to be the build actually served
  (stale-bundle issue in §6 found and fixed within this session).
- `firepitRetest.js --maze both` — final numbers in §4b, hang gate 0/144 both
  mazes, both arms.
- `watchtowerRangeProbe.js` — isolated range-cut effect, both the reverted
  50% attempt and the shipped 25% cut (§4b).
- A direct, uncommitted sim script confirmed `phase3Acceptance.test.js`'s
  40-tower maze fails at rangePx 50 and passes at 75, with damage held fixed
  — isolating the acceptance-test break to range, not damage (§4b).
- Live browser session (`window.__scene`/`window.__net` introspection,
  `window.__game.loop.step()` manual-ticked since the automation pane runs
  the tab backgrounded and `requestAnimationFrame` is throttled) — aura
  geometry confirmed pixel-exact against the shipped `marginPx: 15`.
