# Blizzard / Muddy Bog / Steam Vent — does the Rock Trap fix generalize?

**Date:** 2026-08-04 · **Branch:** `codex/redesign-reconciliation` ·
Suite 611/611/2 skipped, `npm run build` clean (unaffected — no code files
touched, only `shared/balance.js` mutated transiently inside throwaway
screening scripts, then restored) · **Script:**
`test/harness/fusionTweakScreen.mjs` (new, throwaway) ·
**Follow-up to:** `docs/reviews/2026-08-04-rock-trap-site-cap-fix-and-
balance-tweak.md`.

Philip asked whether the same class of fix that resolved Rock Trap's
cross-maze contradiction (bigger effect radius / faster cooldown) helps the
three other fusions currently sitting on "no verdict" or "worth nothing":
Muddy Bog, Blizzard, Steam Vent. **Short answer: no, not for Blizzard or
Steam Vent — their problem is a different mechanism (siting/target-
selection geometry, not telegraph-dodge) that a numeric buff doesn't touch.
Muddy Bog's candidate looked promising at screening scale but did not
survive full-sample confirmation. Nothing was changed in `shared/
balance.js` for any of the three.**

## 0. Why these three aren't the same measurement shape as Rock Trap

Unlike `EARTH_SPECIAL`, these three are **fusion-only** (`cost: 0` in
`shared/balance.js` — they replace their two ingredient specials at build
time, never bought standalone). They're measured against a no-fuse control
via `fusionRoster.js`'s paired arms, not against Watchtower. Critically,
they're placed via a **single build call** (the free special + one partner
placement), never the DEFENSE arm's `spendDown` loop — so Rock Trap's actual
defect (a 2-wide footprint self-colliding against a `spendDown` site list)
cannot occur here at all. "Apply the same fix" has to mean "does the same
*kind* of lever help," not literally the same code change.

## 1. Screening method

`fusionTweakScreen.mjs`: 24-seed subset, both mazes, **both sitings**
(`tower`/flank and `funnel`) since Blizzard and Steam Vent's established
problem (`docs/reviews/2026-08-02-fusion-flank-siting-instrument-fix.md`)
is specifically that their sign depends on which siting is used. wave-4
timing only (the project's representative timing).

## 2. Results

### MUDDY_BOG (already concluded "worth approximately nothing" per the
roster sweep) — baseline here trends weakly positive everywhere, none
significant:

| variant | tower-A | tower-B | funnel-A | funnel-B |
|---|---|---|---|---|
| baseline | +0.042 (t0.20) | +0.292 (t0.91) | +0.104 (t0.52) | +0.271 (t0.87) |
| pulse damage 8→14 | +0.232 (t1.15) | +0.583 (t1.96) | +0.083 (t0.43) | **+0.729 (t2.47)** |
| pulse cadence 500→300ms | +0.348 (t1.90) | +0.188 (t0.53) | +0.021 (t0.10) | +0.354 (t1.10) |
| root duration +30% again | +0.083 (t0.41) | +0.250 (t0.78) | +0.042 (t0.21) | +0.313 (t0.98) |

Pulse-damage bump looked like the standout lever at screening scale (2/4
cells crossing t>1.9, funnel-B clearing significance). **Did not survive
full 72-seed confirmation at wave4, default siting:** maze A +0.167
(t 1.40), maze B +0.257 (t 1.47) — neither significant, and maze B's own
split-half **disagrees in sign** (half1 +0.681, half2 −0.167). This is
screening-sample optimism that full sample didn't back up — the kind of
false lead the project's split-half discipline exists to catch. **No
change recommended.** Muddy Bog's "worth approximately nothing" verdict
stands, unchanged from the 2026-08-02 roster sweep.

### BLIZZARD (known funnel/flank sign flip, no verdict) — baseline
reproduces the known contradiction cleanly at this sample:

| variant | tower-A | tower-B | funnel-A | funnel-B |
|---|---|---|---|---|
| baseline | +0.248 (t1.45) | **+1.114 (t3.04)** | **−0.652 (t2.52)** | +0.195 (t0.51) |
| clusterRadiusPx 70→90 | +0.302 (t1.68) | +0.882 (t2.55) | −0.608 (t2.35) | +0.528 (t1.48) |
| cooldownMs 5000→3800 | +0.342 (t2.18) | +1.195 (t3.60) | **−0.769 (t3.14, worse)** | +0.517 (t1.47) |
| both combined | +0.437 (t2.80) | +1.112 (t3.28) | −0.481 (t1.87) | +0.591 (t1.71) |

**None of the tweaks flip or even neutralize funnel-A's significant
negative** — it stays significant-negative in every variant, and the
cooldown cut alone made it *worse* (t 2.52 → 3.14). Rock Trap's fix worked
because its problem was mechanical (a target that walks out of a
too-small, non-tracking splash during the telegraph); Blizzard's problem is
a **selection/siting interaction** — funnel placement changes what
`selectDensestClusterCenter` finds relative to flank placement, in a way a
bigger radius or faster cadence doesn't correct. **No change recommended.**
This confirms rather than resolves the prior review's own top
recommendation: Blizzard needs Philip to declare its intended siting
scenario before any number is trustworthy — a design decision, not a
tuning problem.

### STEAM_VENT (uniformly negative under flank, maze-inconsistent under
funnel per the prior review) — baseline here doesn't clearly reproduce
either published pattern:

| variant | tower-A | tower-B | funnel-A | funnel-B |
|---|---|---|---|---|
| baseline | +0.502 (t1.65) | +0.083 (t0.24) | +0.487 (t1.78) | +0.167 (t0.49) |
| pulse cadence 500→350ms | +0.393 (t1.27) | +0.396 (t1.13) | +0.627 (t2.18) | +0.271 (t0.77) |
| confuse duration 1200→1800ms | +0.451 (t1.48) | +0.021 (t0.06) | +0.508 (t1.83) | +0.104 (t0.30) |
| both combined | +0.369 (t1.18) | +0.396 (t1.13) | +0.579 (t2.06) | +0.208 (t0.60) |

Every cell in every variant is either non-significant or barely crosses
t>2 once (funnel-A under the pulse-cadence tweaks). No clean, consistent
win. **Also worth flagging:** `cloudMarginPx` is already pinned at its
documented safe ceiling (15 — one below the spillover threshold the
Firepit/Steam Vent retune found, `shared/balance.js:411-420`), so the
direct "make the effect area bigger" lever Rock Trap used **isn't available
at all** for Steam Vent without reopening that spillover problem. **No
change recommended.** Same conclusion as Blizzard: this needs a declared
scenario, not a numeric retune, and this session's screen doesn't produce
one.

## 3. Conclusion

The Rock Trap fix worked because its cause was a specific, mechanical,
telegraph-dodge problem that a bigger splash radius directly addresses.
None of the other three share that mechanism:

- **Muddy Bog** isn't contradictory — it's weak, and the lever that looked
  like it might strengthen it (pulse damage) didn't survive full-sample
  confirmation.
- **Blizzard and Steam Vent's actual problem — a siting-dependent sign flip
  — is a scenario-declaration question, not a numbers question.** No
  balance lever screened here touched it. Confirms rather than
  supersedes the prior review's recommendation: Philip needs to declare
  which siting each is meant to be measured in before either number is
  trustworthy.

**Nothing was changed in `shared/balance.js` for Muddy Bog, Blizzard, or
Steam Vent.** All balance mutations in this session's screening were
transient, inside throwaway node scripts, and restored to base values
before exit.

## What was NOT done

- No siting-scenario declaration was made for Blizzard or Steam Vent — that
  is Philip's call per the prior review's ranked recommendation #1-2, not
  something a tuning pass can substitute for.
- No further Muddy Bog levers were tried beyond the three screened
  (root radius/shape, lingerSlow strength) — the pulse-damage result's
  full-sample failure suggested chasing more variants on the same
  reduced-seed screening methodology wasn't a good use of time without a
  different underlying hypothesis.
- `test/harness/fusionTweakScreen.mjs` is an uncommitted throwaway script,
  same convention as `rockTrapTweakScreen.mjs` before it.
