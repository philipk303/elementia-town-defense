# Steam Vent confusion — adversarial test matrix (Task 16, written before any code)

Required by the program plan's own ordering
(`docs/superpowers/plans/2026-07-26-staged-combat-redesign-program.md:496`):
*"Before coding, write an adversarial test matrix for navigation suspension,
target acquisition, heading changes, immunity, overlapping vents, hall ring,
destruction, and reconnect."*

Authority: redesign spec §6.1 (`docs/superpowers/specs/2026-07-25-combat-structure-redesign.md:272-300`),
Amendment A2.2 (preallocated per-slot status fields, new `statusFlags` bit),
Amendment A4 (hard 0/144 hang gate on both mazes).

---

## 0. Why this matrix exists at all

Amendment A4 names Steam Vent explicitly: *"Steam Vent confusion — suspended
navigation and suspended target acquisition — is the hall-ring soft-lock's exact
signature."* The hall-ring soft-lock (`docs/reviews/2026-07-25-hall-ring-softlock-fix.md`,
`95c69b3`) was an enemy with **no move and no attack**, inert forever, holding
the wave open. Confusion deliberately removes the move decision. Every row below
that says "still attacks" or "recovers" is guarding that exact failure.

Second guard, from the Gate 6 review of Muddy Bog: **do not assert an invariant
a file already contradicts.** Root and displacement are independent axes
(`status.js` header). Confusion is a *third* independent axis: it gates the
enemy's steering CHOICE, not its locomotion speed and not its knockback
velocity. A confused enemy can simultaneously be rooted (speed 0), slowed,
burning, and mid-knockback. No test below may assume confusion implies any of
those, or vice versa.

## 1. Invariants the implementation must not break

| # | Invariant | Enforced where |
|---|---|---|
| I1 | Confusion is time-bounded per episode, regardless of how many sources refresh it | `confuseCapMs` episode budget in `status.js` |
| I2 | An episode's end always grants immunity, so occupancy cannot re-confuse instantly | `tickStatus` transition confused→immune |
| I3 | Confusion never moves an enemy through a wall or off-map | steering supplies direction only; `resolveTilePushout` + `clampToArena` still run |
| I4 | A confused enemy in contact with the hall still attacks it | `attackHall` is distance-derived, computed outside the steering branch |
| I5 | Confusion never allocates per tick | preallocated per-slot fields; structure-wide pulse clock, no per-enemy map |
| I6 | Wire carries a flag only, never heading/timers | new `FLAG.CONFUSED` bit; `ENEMY_STRIDE` unchanged |
| I7 | Super-fast enemies are confusion-immune (same tier scaling as root/freeze) | `scaledDurationMs` → 0 |

## 2. The matrix

Legend — **G** = guards a soft-lock/hang, **S** = spec bullet, **A** = adversarial
(a case the naive implementation gets wrong).

### A. Navigation suspension

| id | case | expectation | kind |
|---|---|---|---|
| N1 | Unconfused enemy on a downhill tile | steps along the cost field (control) | S |
| N2 | Same enemy confused | steps along its wander heading, not the field's | S |
| N3 | Confused enemy heading into a wall | body does not cross the wall; ends the tick outside solid tiles | S/G |
| N4 | Confused enemy heading at the map edge | stays inside the arena (`clampToArena`) | S/G |
| N5 | Confused **and rooted** | does not move at all (speed 0) but confusion still ticks down | A |
| N6 | Confused **and knocked back** | knockback displacement still applies at full magnitude | A |
| N7 | Confusion expires mid-march | the very next tick resumes cost-field steering with no stale heading | G |
| N8 | Cost field never touched | `costField.wallBand` / tile costs identical before and after a confusion episode | S |

### B. Target acquisition

| id | case | expectation | kind |
|---|---|---|---|
| T1 | Player walks into proximity of a confused enemy | no chase is acquired (`aggro.state` stays non-chase) | S |
| T2 | Enemy already chasing, then confused | steering stops following the player | S |
| T3 | T2 continued, confusion ends while player still in proximity | chase resumes normally (aggro FSM was not corrupted) | G |
| T4 | Confused enemy standing on a walkable structure | still attacks it (contact, lowest priority) | S |
| T5 | Confused enemy touching the hall | still attacks it on cooldown | S/G |
| T6 | Confused enemy pressed against a wall in its heading direction | still bashes that wall | S |
| T7 | Confusion is not a stun | across a full episode T4/T5/T6 land ≥1 hit each — the explicit §6.1 verification bullet | S/G |

### C. Heading changes

| id | case | expectation | kind |
|---|---|---|---|
| H1 | Initial confusion | a heading is chosen immediately, that same tick | S |
| H2 | Within one turn interval | heading is byte-identical across ticks (not re-rolled per tick) | S |
| H3 | Across a turn interval | heading changes | S |
| H4 | Determinism | two enemies with the same id and episode index get the same heading; replaying the same episode reproduces the sequence | S |
| H5 | Two different enemy ids, same tick | headings differ (not a global heading) | A |
| H6 | Heading is a unit vector | `hypot(hx,hy) ≈ 1` — a zero or >1 heading would stall or teleport | A/G |
| H7 | No consumption of `state.rng` | the seeded spawn-schedule stream is not advanced by confusion (otherwise every published baseline shifts) | A |

### D. Immunity and refresh bounding

| id | case | expectation | kind |
|---|---|---|---|
| M1 | Enemy parked inside the cloud forever | confusion **ends** at the episode cap while still inside | S/G |
| M2 | M1 continued | immunity is granted on that recovery | S |
| M3 | Re-application during immunity | is a no-op (`confusedMs` stays 0) | S/G |
| M4 | Immunity expiry inside the cloud | a fresh episode may start, with a fresh full cap | S |
| M5 | Steady-state occupancy | confused fraction of time ≤ cap/(cap+immunity) < 1 over a long residency — the formal statement of "cannot create permanent wandering" | G |
| M6 | Faster enemies recover sooner | FAST tier's episode is strictly shorter than SLOW tier's | S |
| M7 | Super-fast (elite goblin) | never becomes confused at all | S |

### E. Overlapping vents

| id | case | expectation | kind |
|---|---|---|---|
| O1 | Two vents whose clouds overlap, enemy in both | one episode, not two; cap is the single-episode cap, not doubled | S/G |
| O2 | O1 continued | scald pulses come from **both** vents (damage stacks; confusion does not) | A |
| O3 | Vent B refreshes while vent A's episode is running | the refresh cannot extend past A's original episode cap | S/G |
| O4 | Enemy exits A's cloud but stays in B's | confusion persists, still under one cap | S |

### F. Exit persistence

| id | case | expectation | kind |
|---|---|---|---|
| X1 | Enemy leaves the cloud mid-episode | stays confused for the remaining episode time | S |
| X2 | X1 continued | scald pulses stop immediately on exit (position-gated) — **the Muddy Bog Gate 6 defect, transplanted**: a displaced-but-still-confused enemy must not keep taking damage at unbounded range | A/G |
| X3 | Enemy re-enters after the episode ended and immunity lapsed | new episode | S |

### G. Hall ring (the named soft-lock)

| id | case | expectation | kind |
|---|---|---|---|
| R1 | Confused enemy on a hall-ring terminal tile (`chooseStepDir` → -1) inside melee range | attacks the hall every cooldown; hall hp strictly decreases | G |
| R2 | Same, just outside melee range | recovers within the episode cap and then closes on the hall (`hallSeekDir` branch reachable again) | G |
| R3 | A vent sited adjacent to the hall ring, enemies fed in continuously | wave still resolves — no enemy inert for longer than cap+immunity | G |
| R4 | Whole-match check | the 288-match gate below | G |

### H. Destruction

| id | case | expectation | kind |
|---|---|---|---|
| D1 | Vent destroyed while enemies are confused | pulses stop immediately | S |
| D2 | D1 continued | already-applied confusion runs out naturally and then clears — no orphaned permanent confusion | S/G |
| D3 | Vent destroyed with enemies inside, then a new episode is due | nothing re-applies (structure is gone from `state.structures`) | S |
| D4 | Structure-record state (`s.svReadyAt`) is not leaked into other structures | destroying one vent leaves a second vent's clock untouched | A |

### I. Reconnect / serialization

| id | case | expectation | kind |
|---|---|---|---|
| C1 | Snapshot of a confused enemy | carries `FLAG.CONFUSED`, and nothing else new | S |
| C2 | `ENEMY_STRIDE` and the decode round-trip | unchanged / lossless | S |
| C3 | Heading and timers | absent from the wire entirely | S |
| C4 | Reconnecting client | reads the flag on the next snapshot with no server-side per-connection state | S |
| C5 | Existing flag bits | ELITE..AGGRO keep their current bit positions (wire ABI) | A |

## 3. Hard gate (Amendment A4, program plan line 501)

Not optional, and not passable by a run that never built the structure:

1. 144 matches, maze A, **asserting `comboFormed === 'STEAM_VENT'` in every cell**.
2. 144 matches, maze B, same assertion.
3. 0 hangs across all 288. Any hang blocks the commit.
4. Plus the R1-R3 hall-ring cases above, as unit tests, since 288 matches sample
   the ring incidentally rather than deliberately.

**Harness gap found while writing this matrix — must be fixed before the gate
can run.** The handoff says to use `fuseWith: 'FIRE'`, but the harness human is
hardcoded `EARTH` (`test/harness/matchRunner.js:54`) and the build policy fuses
the human's own free special with a partner. `EARTH + FIRE = MAGMA_TRAP`.
Steam Vent is `FIRE + WATER`, so **it is unreachable with today's harness** —
as are FIRESTORM (FIRE+WIND) and BLIZZARD (WATER+WIND). `fuseWith` alone cannot
build it. A run taken on `fuseWith: 'FIRE'` would pass a gate for MAGMA_TRAP and
prove nothing about Steam Vent — exactly the harness-blindness failure `cc47fde`
was written to close, recurring one task later in a different disguise.

Fix: add a `humanElement` param (default `'EARTH'`, so every published baseline
stays byte-identical) that overrides the roster's human element. The gate then
runs `humanElement: 'FIRE', fuseWith: 'WATER'` and asserts `STEAM_VENT`.
Declared caveat: that run is a **hang/soft-lock gate, not a balance
measurement** — the human plays a different class, so its score/win numbers are
not comparable to any EARTH-human baseline. That is acceptable for this gate's
purpose and must not be quoted as a balance figure.

## 3b. What the gate actually measured (filled in after the run)

Both mazes: **0/144 hangs**, `comboFormed === 'STEAM_VENT'` in all 288 cells.

Coverage, added after the adversarial review pointed out that a built vent is
not an exercised vent (finding F4): the harness now reports
`combat.confusedSeconds`. Maze A confused enemies in **144/144** cells
(2044 enemy-seconds); maze B in **139/144** (1923 enemy-seconds). The five
maze-B cells where the vent formed but nothing ever entered its cloud carry no
information about confusion, and their 0-hang result must not be counted as
evidence for it. 283 of 288 cells do.

## 4. Explicit design decisions this matrix pins down

1. **Confusion does not attack players.** `attackPlayer` is only set inside the
   CHASE steering branch, which confusion suspends. Confused enemies keep hall,
   wall and walkable-structure contact attacks (T4-T7) but do not melee players.
   Rationale: contact melee vs the chased player *is* part of the chase, and
   §6.1 only promises structure contact attacks survive. Making confused enemies
   hit any adjacent player would make confusion offensively *stronger*, which no
   part of the spec asks for.
2. **Heading is hashed, not drawn from `state.rng`.** "Deterministic seeded" is
   satisfied by a pure hash of (enemy id, episode turn index). Drawing from the
   shared run stream would advance the same generator the spawn schedule uses,
   silently shifting every seeded measurement in the project (H7).
3. **Immunity is flat, not speed-scaled.** Scaling it by speed tier would give
   fast enemies both shorter confusion *and* shorter immunity, raising their
   confused fraction — the opposite of "faster enemies recover sooner" (M6).
4. **The scald pulse uses a structure-wide clock that only advances when the
   cloud is occupied** — the Firepit phase-alignment lesson
   (`docs/reviews/2026-07-25-firepit-falsification-test.md`). A per-enemy pulse
   map would be the Muddy Bog shape, but Steam Vent has no per-enemy ownership
   to track, so a map would be cleanup burden for nothing (I5, D4).
