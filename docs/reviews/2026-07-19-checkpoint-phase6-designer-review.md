Reviewer: Opus 4.8 (Fable 5 unavailable this session), senior-game-designer adversarial profile, CP3 / Phase 6

# CP3 / Phase 6 — AI teammate bots: adversarial design review

**VERDICT: CONDITIONAL GO** — the bot FSM is correct, deterministic, and load-bearing (the acceptance control is honest that bots *do* work), but the bots are tuned so strongly that they trivialize the game's entire core loop (combat *and* maze-building) for 80% of a run. Slice-1 acceptance can ship on the current 248/248 suite, but the acceptance *bar itself* is dishonest about difficulty and the "supplement, not solo answer" design pillar (spec §4) is currently violated. The two must-fix items below are design/tuning acceptance concerns, not code correctness — nothing here is a programmer-pass bug except one borderline item (F2).

All findings are grounded in headless sims run against the real tick path (`runBotInputs → tickPlayers`), seed 20260720, using the acceptance test's own maze/driver helpers. Sim scenarios are named in each finding.

---

## Findings by severity

### CRIT-1 — Three bots are a complete solo answer through wave 8; the human is decorative and the maze is unnecessary
**Scenario (sims `idle10`, `nomaze10`):** 1 human fed *pure idle input* (a statue — never moves, attacks, or builds) + 3 AI bots:
- With the acceptance two-lane maze: hall stays at a **flawless 1000/1000 through waves 1–8**, first loses in **wave 9**.
- With **no maze at all** (open field): identical — hall untouched through wave 8, loses wave 9.

**Why it degrades play.** The spec's combat pillar (§4) is explicit: *"Player DPS is tuned as a supplement, not a solo answer — towers + maze must remain necessary."* Three bots violate this outright. Because all enemies funnel to the single hall destination (bottom-center cost field) and every bot anchors at hall-center-front, the bot line auto-intercepts the *entire* horde at the one tile everything must cross. The consequences for the explicitly-supported 1-human-3-bot solo config (Phase-1 amendment) are severe:
- The human has **nothing they must do for 8 of 10 waves** — not fight, not build. This is the "solo human = statue-bots" prior concern, now measured: it's worse than feared (8 waves, not a couple).
- **Maze-building — a core advertised mechanic ("players shape the enemy path themselves") — is inert.** No maze and a full maze produce the identical flawless result through wave 8. The build phase, tower catalog, and economy are all decorative for the majority of a solo run.
- In multiplayer this bleeds into a passivity incentive: since bots tank flawlessly and building is the only human-only verb (and it's unneeded early), the optimal early-game human action is to do nothing.

**Suggested direction.** This is a bot-*strength* problem, not a wave-strength problem (Phase-3 established an undefended town falls wave 1 at ~178s). Do **not** fix it by buffing waves — that would punish the legitimately-engaged human. Instead, weaken the bots' *tanking sufficiency* so they degrade the hall slowly without human/tower help: lower bot melee output and/or HP so 3 bots leak chip damage to the hall from ~wave 4 onward, making the human's fighting and the maze *necessary* to reach the flawless line. Target the spec §4 intent directly: 3 bots alone should be *losing* the hall's HP by mid-game, not holding it at 1000. This is the single most important dial for the Phase-8 sweep and should be called out as the headline bot-tuning target.

---

### HIGH-1 — Bots never spatially distribute; they clump into one central blob and cover flanks only reactively/late
**Scenario (sim `flank`, no maze, wave 4 / gate-2 opens):** all three bots sit on the **same tile (x≈21, hall center)** for the first ~8s while the newly-opened right flank builds to 10 enemies. They only drift right once that stream marches within `ENGAGE_RANGE` (520px ≈ 16 tiles) of the central clump; one bot never leaves center at all.

**Root cause (design, not bug).** Every player spawns clustered within 3 tiles of hall center (`state.js`: `x = hallCenterX + (index−1.5)·TILE`), and each bot's hold anchor is just that spawn pushed 3 tiles forward (`ensureAnchor`). All bots therefore anchor within ~64px of each other. They are a single reactive melee blob, not a distributed line. They have no notion of "cover a different gate/lane than my teammate."

**Why it degrades play.** It holds today only because the open field lets flankers converge back to center where the blob waits — but it's exactly the mechanism that breaks at wave 9 (CRIT-1) and it makes the wave-10 finale (all 3 gates simultaneously) structurally unwinnable-by-bots: a central blob can only be in one place while three separated streams reach the hall. For a human watching, three teammates piling onto one tile while a flank streams in unopposed reads as broken AI. It also means the two-lane acceptance maze's "division of labor" is partly illusory — the bots don't split to cover GAP_B, they cluster wherever the nearest enemy currently is.

**Suggested direction.** Give bots distinct anchors: spread the N bot anchors across the buildable frontage (e.g. bias each bot's anchor toward a different open gate / lane, or fan them across the hall-front arc) so at rest they pre-cover the field rather than stacking one tile. Even a simple "index-spread the anchor x across the arc" would materially improve flank coverage and the visual read. Phase-8 fodder for the magnitudes, but the *mechanism* (shared anchor) is a Phase-6 design gap worth flagging now.

---

### HIGH-2 — A low-HP squishy bot flees the entire map and never returns for the rest of the wave (unleashed retreat)
**Scenario (sim `retreatlock`):** Fire bot dropped to 20% HP → `retreating=true` → flees from (608,366) to (751,476) and keeps going toward the map edge. Because there is **no HP recovery during a fight** and hysteresis only clears retreat above 50% HP, the bot retreats for the **entire remainder of the wave**. The Retreat branch (`bots.js` step 1) steers directly away from the nearest enemy with **no leash/anchor bound at all** (unlike Engage), so the bot abandons the line and runs laps in a corner, contributing near-zero (it face-swings while backpedaling, usually out of melee range).

**Why it degrades play.** Under heavy fire — precisely when a squishy drops low — the team silently loses a defender for the rest of the wave, and the player watches a teammate sprint away from the fight to the edge of the map and stay there. It's both a real DPS/tanking loss at the worst moment and terrible combat feel ("why is my Wind teammate cowering in the corner the whole wave?"). The self-preservation intent is sound (don't feed the bot into death), but "flee unbounded to the map edge forever" is the wrong expression of it.

**Suggested direction.** Bound retreat to fall back **toward the hold anchor / hall** rather than *away from the nearest enemy into open space* — a fighting retreat to the safe line, not a rout off the map. Optionally let a retreating bot re-engage once it has put a safe gap between itself and the nearest enemy (distance-based, not HP-based) so it rejoins instead of permanently benching itself. This keeps the "don't die" behavior while stopping the corner-camping. Design fix in `bots.js` Retreat branch; magnitudes sweep-flagged.

---

### MED-1 — ReviveMate outranks Engage with no cap and no hall-safety check → synchronized full-team peel
**Scenario (sim `abandon`):** when a teammate goes down inside the central blob, **every bot within `REVIVE_SEEK_RANGE_PX` (360px) simultaneously abandons the line** to walk into channel range. In the light wave-2 stream tested, 2 bots peeled, the revive finished in ~3s, and the hall survived — but because all bots cluster (HIGH-1) and 360px comfortably covers the whole blob, a down during a heavy stream (wave 9-10) can peel the *entire* melee line at once, leaving the hall with zero defenders for the ~3s channel. Only one bot is ever needed to complete a proximity-driven channel (`players.tickLifecycle` accrues on *any* one living mate in range), so N-1 of the peels are pure waste that also opens the hall.

**Why it degrades play.** It converts one downed teammate into a whole-team defensive collapse at exactly the moments the game is supposed to be hardest — a feels-bad cascade (one death → everyone leaves → hall breach → more deaths).

**Suggested direction.** Cap revive-seek to **one** bot per downed body (nearest eligible bot claims the revive; others keep holding), and/or suppress the peel while a heavy stream is within the bot's engage range (defend-first when the line would collapse). One reviver is mechanically sufficient, so this is nearly free. Design fix in `bots.js`; Phase-8 can tune the "how heavy a stream suppresses revive" threshold.

---

### MED-2 — Bots dump AoE specials on a single trash mob the instant it enters cast range
**Scenario (code path, `bots.js` step 3 + `abilities.js` trySpecial):** the bot sets `actions.special` whenever the *nearest single enemy* is within `SPECIAL_CAST_PX`, and `trySpecial` fires immediately on cooldown with **no check on how many enemies the AoE would actually hit**. So a bot detonates Ground Slam / Whirlpool / Wind Blast / Flame Nova on one lone lead goblin, then the ability is on cooldown when the actual cluster arrives a second later.

**Why it degrades play.** Wasted cooldowns and no combat rhythm — the AoE specials that should feel impactful against a pack get spent on trash. It barely dents outcomes today only because the bots are already overpowered (CRIT-1); once bots are tuned down, this inefficiency will start to bite, and it always reads as dumb AI to a watching player.

**Suggested direction.** Gate a bot's *radial* special on a minimum enemy count inside its AoE radius (e.g. ≥2–3 enemies within `radiusPx`) rather than "one enemy within cast range." Fireball (single-target projectile) stays as-is. Cheap perception change in `bots.js`; thresholds sweep-flagged. Bundle with the CRIT-1 nerf so specials matter once tanking is no longer trivial.

---

### LOW-1 — Wall-jam residual risk (as flagged in the amendment) — confirmed low, not observed in normal play
**Scenario (sim `walljam`):** in the two-lane maze, bots correctly pressed *into the gap* (y≈302, just below the wall's bottom face at the open lane), not into a solid segment — the leash + "closest same-side target is in front" assumption held. The amendment's flagged residual (a bot presses into a wall if the *nearest* enemy sits directly behind a solid segment) did not manifest, consistent with the amendment's own reasoning that live waves always put a closer same-side target in front.

**Why it's LOW.** Cosmetic at worst and self-correcting; the amendment already documents and accepts it. No action for slice-1. Left as Phase-8/full-bot-pathing fodder, as scoped.

---

## Is the acceptance test an honest bar?

**No — it is honest about *one* thing and dishonest about another.**
- **Honest:** the control (idle bots → loss) genuinely proves the bots are *load-bearing* behind that specific maze. Good test hygiene; the CP2-H3 lesson was applied.
- **Dishonest about difficulty / what it certifies:** "1 human + 3 bots survive waves 1–4" is cleared by **3 bots and a statue human with no maze at all** (sims `idle10`/`nomaze10` hold to wave 8). The test therefore certifies nothing about the human's contribution, the maze, the economy, or the build phase across waves 1–4 — all of which are inert in that window (CRIT-1). It is a bot-liveness test wearing a difficulty-test's clothes. The pass is real but the bar hides the fact that the entire early-game core loop is skippable.

**Recommendation:** keep the current test as a bot-liveness/load-bearing check, but add (or re-frame for Phase 8) a bar that actually binds the human and the maze — e.g. "3 bots + idle human + no maze must *lose* by wave K", the inverse control that would catch CRIT-1 regressions.

---

## Triage

**Must-fix for a defensible slice-1 (design-acceptance, not test-breaking):**
- **CRIT-1** — bot tanking sufficiency. Even a coarse first cut (lower bot melee/HP so 3 bots leak hall HP from mid-game) is needed before slice-1 can claim its own "supplement, not solo answer" pillar. This is the one item that changes whether the game has a core loop for the majority of a solo run.

**Phase-8 balance-sweep fodder (structure is fine, magnitudes/behaviors tune later):**
- HIGH-1 (bot anchor spread / flank coverage) — mechanism gap worth a small Phase-6-ish fix, magnitudes swept.
- HIGH-2 (unleashed retreat → corner camping) — small `bots.js` behavior fix, then swept.
- MED-1 (revive mass-peel) — one-reviver cap, then swept.
- MED-2 (special dumped on lone trash) — min-cluster gate, then swept.
- LOW-1 — as already scoped (full bot pathing deferred).

**Correctness bugs for a programmer pass:** none outright. The closest is **HIGH-2** — the Retreat branch's total omission of the leash/anchor bound that Engage carefully respects is arguably an implementation oversight rather than an intended design (the other three states are anchor-aware; Retreat alone is not). Recommend a programmer confirm whether the unbounded retreat was intentional; if not, it's a one-branch fix. Everything else is deliberate design/tuning.

## Note on the FSM itself (credit where due)
The FSM is clean, deterministic (no rng, pure function of state), correctly reuses the human input/tick/aggro path so bots are true players for aggro and revive, and the priority order is sensible. The problems above are all about *tuning strength* and *two behavioral gaps* (shared anchor, unleashed retreat), not the architecture. The Phase-6 scope call ("leashed hold-line, no pathfinding") is sound and the leash does its job — the leash isn't the problem; the bots being individually/collectively too strong is.

---

## REMEDIATION STAMP — 2026-07-21, executor Opus 4.8 (Fable 5 unavailable)

**Verdict accepted: CONDITIONAL GO. Outcome: ALL findings (CRIT-1, HIGH-1, HIGH-2, MED-1, MED-2, LOW-1) DEFERRED to the Phase-8 balance sweep. Certified baseline (commit `2f8c06e`) ships unchanged; suite 248/248 green.**

This is a deliberate deferral grounded in a hard empirical finding, not an oversight or a punt. Every attempted remediation was implemented and measured; each one **flips the certified waves-1–4 acceptance in a chaotic, non-monotonic way**, which is the same failure class the Phase-4 respawn investigation already documented and chose not to gamble on.

**What was measured (headless sims through the real `runBotInputs → tickPlayers` path, 8–15 seeds each):**
- **Baseline is honest and robust.** Committed bots are load-bearing: the acceptance survives waves 1–4 on **10/10** seeds, and the bots-off control **loses on 8/10** ("both good" 8/10) — bots demonstrably matter.
- **The bot-strength dial is chaotically non-monotonic.** A bot-only melee multiplier gave: mult 0.7 → survive to wave 9; mult 0.85 → lose wave 4; mult 1.0 → lose wave 4. *Lower* bot strength surviving *longer* than higher — a chaotic threshold of the chase-mode aggro FSM + hall-adjacent respawn, not a smooth function. Precisely the Phase-4 pathology.
- **Even the two "safe" behavioral fixes flip it.** Leashed retreat (HIGH-2) and the one-reviver cap (MED-1) were kept while all balance magnitudes were reverted — the acceptance still collapsed to the bots-off level (ACC ≡ CTL, "both good" **0/15**). Isolating further: the revive cap *alone* (retreat reverted) still gave 0/8. Mechanistically the cap should *help* (2 bots keep fighting instead of peeling to revive), yet it reshuffles bot positions at the wave-4 spike and flips the chaotic outcome. There is no "more correct" outcome to land on here by tuning — the acceptance is chaotically sensitive to *any* bot behavior change.
- **The anchor spread (HIGH-1) specifically regresses the early game.** Fanning bots across the frontage stops them concentrating on the funnel behind a light maze; acceptance dropped from 10/10 to ~5/15. The late-game flank/wave-10 benefit it targets is out of slice-1 scope (acceptance is waves 1–4).

**Decision rationale.** Per the team's established policy from the Phase-4 respawn revert — *do not ship a value/behavior that merely happens to clear a chaotic-threshold acceptance today, because the next tweak breaks it* — the honest move is to keep the certified baseline and fold all of Phase-6's bot tuning **and** the two behavioral polish items into the Phase-8 balance sweep, which must tackle them **together with the shared root cause**: chase-mode enemies (and, in player form, non-pathfinding bots) beelining with no cost-field routing, plus the hall-adjacent respawn timing. Until that root chaos is addressed, per-parameter bot tuning cannot be validated. CRIT-1 (bots over-tank a solo run) is real and remains the headline Phase-8 bot dial — but it is a mid/late-game balance concern (bots hold *flawlessly to wave 8*; the slice-1 acceptance is waves 1–4, where the early-game curve is intentionally gentle), so deferring it does not compromise the slice-1 acceptance the plan defines.

**No correctness bug shipped.** The review found none outright; HIGH-2's unbounded retreat was investigated per its recommendation — bounding it is behaviorally reasonable but flips the chaotic acceptance, so it is deferred with the rest rather than applied as a "fix."

**Phase-8 sweep intake (carried forward):** CRIT-1 bot tanking sufficiency (headline dial) · HIGH-1 distributed anchors / flank coverage · HIGH-2 fighting-retreat to the line · MED-1 one-reviver cap + hall-safety · MED-2 min-cluster special gate · LOW-1 full bot pathing — all to be tuned *after/with* the chase-mode-routing + respawn root-cause fix, against an acceptance harness hardened per this review's recommendation (add the inverse control: "3 bots + idle human + no maze must lose by wave K").
