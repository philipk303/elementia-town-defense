# Next session: close out Task 20 — Blizzard/Steam Vent siting decision + Grinder

Branch `codex/redesign-reconciliation`. Suite 611/611/2 skipped, `npm run
build` clean as of this handoff. Rock Trap's standalone balance retune is
already landed (`shared/balance.js:253-258`, `splashRadiusPx: 48`,
`cooldownMs: 3000`) — do not re-open that, it's done.

## Why this session exists

Philip chose "close out Task 20 balance work" for next session, over
checking Task 18 (real art) readiness or continuing audio sourcing. Three
sub-items remain open, in this order:

0. **Diagnose WHY the siting sign-flip happens, before asking Philip to
   rule on a scenario** — added 2026-08-04, after Philip asked whether an
   Opus pass analyzing the actual mechanism would be worthwhile. See §0
   below. **Do this first.** If it turns out to be a real instrument
   defect (Firepit-class), fixing it may make §1's scenario question moot
   for whichever structure it affects.
1. **Declare Blizzard and Steam Vent's intended siting scenario** — a
   design decision, not a measurement one, IF §0 doesn't resolve it first.
   Asked directly this session; Philip wanted more context before ruling,
   which this handoff provides.
2. **Take a real Grinder measurement pass** — Grinder currently has *no*
   A1.4(a) verdict at all, for a different reason than Blizzard/Steam Vent
   (see below).

## 0. Diagnose the mechanism first (recommend Opus — do this before §1)

**The result is counterintuitive in a way that smells like a bug, not a
design ambiguity.** Blizzard funnel-sited sits directly in the choke point
where the horde is forced to bunch up single-file to get through the gap —
the naive expectation for a densest-cluster weapon is that it should do
BETTER there, not worse. Instead funnel-A measures a significant LOSS
(t 2.52) while flank-A (off to the side, farther from the actual
bottleneck) measures a non-significant gain. That's backwards from what
the mechanic's own stated intent predicts. When a result runs opposite to
what the mechanic is supposed to reward, that's the same shape as the
Firepit falsification test's original defect (0.073 targets per pulse
because of where it got sited) — not proof of a bug here, but similar
enough to rule out before asking Philip to make a judgment call on a
number that might not mean what it appears to.

**Philip's explicit instruction: let Opus figure this out, including
designing its own instrumentation or a different test entirely if it finds
a better angle than the ones below.** The following are starting hypotheses
to investigate, not a prescribed checklist — treat them as a floor, not a
scope limit:
- Actual cluster size found per Blizzard activation
  (`selectDensestClusterCenter`'s `bestSize`,
  `server/game/structureBehaviors/targetImpact.js:109-128`) — split by
  siting. If funnel-sited Blizzard is finding genuinely SMALLER clusters,
  the mechanic has less to work with there and the loss is real, not a
  bug — that's useful evidence FOR a scenario declaration either way.
- Enemies actually hit/frozen per activation (primary + splash-equivalent
  count for the uniform-resolve path) — split by siting. If cluster size
  is comparable but hits/damage-applied is lower, something downstream of
  selection is losing value (e.g. enemies dying to something else before
  Blizzard fires, cooldown/telegraph timing interacting badly with lane
  transit speed, or the freeze fully wasted because enemies are already
  dead by resolution).
- For Steam Vent, the equivalent check: `confusedSeconds`
  (already tracked, `m.combat.confusedSeconds` per
  `test/harness/matchRunner.test.js:564`) and whether confusion in the
  lane redirects enemies somewhere that actually costs them progress, vs
  in the flank where a confused enemy may already be off the productive
  path and confusing it further changes little.
- If none of the above cleanly explains the flip, consider whether the
  confound is upstream of either structure entirely — e.g. something about
  how `funnelSites`/the fusion partner's own placement interacts with the
  cost field or enemy pathing near the gap that has nothing to do with
  Blizzard/Steam Vent's own mechanics. Rock Trap's site-cap defect (this
  session) was found by chasing an unexplained number to its literal
  mechanical cause rather than accepting the first plausible story — the
  same discipline applies here.

**Why Opus for this pass specifically:** this is open-ended mechanistic
diagnosis — read the actual selection/resolution code, form a hypothesis,
instrument it, and interpret a genuinely ambiguous result — closer to the
Firepit investigation (which needed two rounds of defect-hunting before
the verdict could be trusted) than to a well-specified port. This
project's own model-tiering pattern puts that class of work at Opus, not
Sonnet.

**If §0 finds a real defect and fixes it:** re-measure with the same
paired-arms protocol this session used, and only fall through to §1's
scenario question if the sign-flip survives the fix. **If §0 finds no
defect** — cluster sizes/hit rates are genuinely different by siting and
that fully explains the score difference — that finding itself is useful
context for Philip's §1 ruling, not a dead end.

## 1. The siting decision, with full context

**The problem, in one sentence:** both structures measure a significantly
*different* score depending on whether the harness sites the human's free
special (and therefore the fusion built on top of it) on the flanks
(`towerSites`, the original/default) or in the lane
(`funnelSites`/`freeSpecialSites: 'funnel'`, added 2026-08-02). Neither
number can be called a verdict until Philip says which siting represents
how the structure is actually meant to be used.

### Blizzard (Water+Wind) — §6.5 of the redesign spec

> **Role:** Long-range group damage and short hard control.
> Has a larger circular acquisition area than Rock Trap. When ready,
> selects the enemy at the center of the densest hittable cluster. After a
> brief telegraph, a wide AoE of ice spikes deals medium damage and applies
> short freeze to every enemy in the impact circle.

Current spec: `rangePx: 180` (acquisition), `clusterRadiusPx: 70` (impact),
`telegraphMs: 400`, `damage: 18`, `cooldownMs: 5000`,
`freeze: {ms: 1200}`.

Measured this session (wave4 timing, 24-seed screen, paired vs no-fuse
control):

| | tower (flank) siting | funnel (in-lane) siting |
|---|---|---|
| maze A | +0.248 (t 1.45, not sig) | **−0.652 (t 2.52, significant loss)** |
| maze B | **+1.114 (t 3.04, significant win)** | +0.195 (t 0.51, not sig) |

Full-scale (144-seed) numbers exist from the 2026-08-02 siting-fix review
and roughly match this shape: flank maze A +0.219 (t 2.11, significant
win), funnel maze A −0.403 (t 2.77, significant loss) — a full sign
reversal on the same maze, same seeds, changing only where the fusion is
placed. This session additionally confirmed that bigger cluster radius /
faster cooldown do **not** resolve the flip (see
`docs/reviews/2026-08-04-blizzard-muddybog-steamvent-tweak-screen.md`) — it
isn't a numbers problem.

**The actual question for Philip:** does "densest hittable cluster" mean
Blizzard is meant to fire where a defender has FORCED enemies together (a
lane choke — funnel), or where enemies naturally clump on their own before
reaching a choke (which the flank sites are closer to representing,
since they don't touch the lane geometry at all)? The spec's own framing
("group damage and short hard control") doesn't obviously pick one — it
could be read as "this is a lane-choke nuke" or "this saves you when a
pack forms wherever it forms."

### Steam Vent (Fire+Water) — §6.1 of the redesign spec

> **Role:** Persistent medium-area damage and navigational confusion.
> Enemies inside take fixed scald-damage pulses and receive a refreshed
> short confusion status... While confused, normal hall-march and
> player-chase steering are suspended.

Current spec: `cloudMarginPx: 15` (already pinned at its documented safe
ceiling — one more and the cloud spills into the neighboring lane, a
previously-found bug class), `pulse: {damage: 25, ms: 500}`,
`confuse: {ms: 1200}`.

Measured this session (wave4, 24-seed screen):

| | tower (flank) siting | funnel (in-lane) siting |
|---|---|---|
| maze A | +0.502 (t 1.65, not sig) | +0.487 (t 1.78, not sig) |
| maze B | +0.083 (t 0.24, not sig) | +0.167 (t 0.49, not sig) |

Unlike Blizzard, **nothing here is significant in either siting** — this
screen didn't even clearly reproduce the previously-published pattern
(flank: "uniformly negative, never significant"; funnel: "maze-
inconsistent" — significant positive on A, negative trend on B, per the
2026-08-02 review). That prior review's numbers are the ones to trust
(144-seed, not this session's 24-seed screen); this session's role was
just to confirm that pulse-cadence/confuse-duration tweaks don't produce a
clean win either way (see the same tweak-screen review).

**The actual question for Philip:** confusion's whole value is disrupting
steering — that arguably matters more *in the lane* (redirecting an
enemy that's already about to reach the hall) than on the flanks
(redirecting an enemy that wasn't threatening yet). But the spec doesn't
say this explicitly either.

### What I'd suggest reviewing before ruling

- §6.1 and §6.5 in full: `docs/superpowers/specs/2026-07-25-combat-
  structure-redesign.md` (Steam Vent starts line 272, Blizzard line 401).
- The original siting-fix finding: `docs/reviews/2026-08-02-fusion-flank-
  siting-instrument-fix.md` §3 (per-fusion read) — lays out both
  structures' full-sample numbers and why siting turned out to be
  load-bearing.
- This session's tweak screen: `docs/reviews/2026-08-04-blizzard-
  muddybog-steamvent-tweak-screen.md` — confirms the sign flip isn't a
  numbers problem for either structure.

Once Philip rules (funnel / flank / something else — e.g. "measure both
and report the worse one" is a legitimate answer too), the next session
can take a clean, full 144-cell measurement and either confirm a real
A1.4(a) verdict or make an informed tuning pass, the same way Rock Trap's
splash-radius fix came out of a resolved question.

## 2. Grinder — no verdict, different cause, not addressed this session

Per `elementia-fusion-roster-sweep` memory: the redesign spec **itself**
names Grinder as policy-confounded — "Grinder... all have value a dumb
policy cannot express" (spec line ~625-637). The scripted harness human
holds a fixed post and never repositions to catch a pull-and-crush combo
mid-cycle, so a sub-1.0 Grinder number measures the policy, not the
structure (this is explicitly the A1.4 caveat about skill-dependency,
not the flank/funnel siting confound Blizzard/Steam Vent have). Grinder
also repeats the "wave-1-is-a-trap" pattern seen elsewhere.

**This is a different, larger problem than Blizzard/Steam Vent's** — it
needs either a smarter scripted policy (nontrivial harness work: teaching
the policy to actually stand near a Grinder's pull radius and time its own
positioning around the intake/crush cycle) or an explicit acknowledgment
that Grinder can't be verified by this harness at all and needs playtest
data instead. Not investigated this session — flagged here so next
session doesn't have to re-derive it. **Recommend deciding which of those
two paths before spending harness-engineering time on it** — teaching the
policy to time a pull-and-crush cycle is a real feature, not a quick
patch, and might not be worth building just to get one more balance
number.

## What NOT to do

- Don't re-tune Blizzard/Steam Vent's numbers before the siting question
  is answered — this session already showed the obvious levers (bigger
  radius, faster cooldown) don't fix the sign flip, so guessing at more
  numbers without the scenario question resolved would repeat the mistake
  A1.4 exists to prevent.
- Don't assume Grinder's fix is "teach the policy" without confirming
  Philip wants that scope — it could also be ruled out-of-reach for this
  harness entirely.

## Recommended model

**Sonnet 5** for the siting-decision conversation and any resulting
144-cell confirmation measurement (same tier as every other Task 20
session). If Philip chooses the "teach the harness policy to play Grinder
well" path, that's meaningfully harder harness-design work — flag for
Opus 5 at that point rather than guessing through it on Sonnet.
