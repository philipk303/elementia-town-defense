# Firestorm volley-delivery probe — the flank/funnel magnitude gap

**Date:** 2026-08-04 · **Branch:** `codex/redesign-reconciliation` ·
**Probe:** `test/harness/volleyProbe.mjs` (`node test/harness/volleyProbe.mjs`) ·
**Instrument:** isolated protocol, 72 seeds × 2 posts, wave-4 fuse, both mazes,
both sitings · **Hangs 0/144 in every cell.**

## 0. The question

Firestorm's maze-B score delta reads **+0.93 flank / +0.26 funnel** on the
isolated instrument — a 3.6× gap with no proposed mechanism, and the flank cell
an outlier against three other measurements of the same quantity (0.368, 0.264,
0.257). Direction is established and BH-robust
(`2026-08-04-paired-statistic-retrospective.md` §4); magnitude was not.

Firestorm is `spec.volley` — it hits **every** enemy within `rangePx` once per
cooldown — and is the **only** such structure in `shared/balance.js`. So the
mechanic has exactly one delivery quantity, `hitIds.length` at
`server/game/structureBehaviors/volley.js:45`, and the question reduces to:
does the flank siting put more bodies inside `rangePx` than the funnel siting?

## 1. Result

| maze | siting | volleys fired | hits delivered | bodies/volley |
|---|---|---|---|---|
| A | flank | 5,821 (40.4/run) | 12,381 (86.0/run) | 2.127 |
| A | funnel | 6,254 (43.4/run) | 12,736 (88.4/run) | 2.036 |
| **A** | **flank/funnel** | **0.93×** | **0.97×** | **1.04×** |
| B | flank | 5,353 (37.2/run) | 9,516 (66.1/run) | 1.778 |
| B | funnel | 3,083 (21.4/run) | 5,055 (35.1/run) | 1.640 |
| **B** | **flank/funnel** | **1.74×** | **1.88×** | **1.08×** |

**Validity control:** the wave-4 no-fusion arm was run alongside every cell and
recorded **0 volley activations** in all four — Firestorm is fusion-only, so a
non-zero count there would mean the probe was measuring some other structure and
would void every number above. It is zero.

**Internal control:** maze A, where the score reading is flat at both sitings
(−0.10 to −0.02, nothing significant), delivers **0.97×** — the probe reports no
siting difference exactly where the score reports none. The instrument responds
only where the effect is.

## 2. Reading

**A mechanism exists, and the flank cell is not a pure measurement artifact.**
On maze B the flank-sited Firestorm delivers **1.88× the hits** of the
funnel-sited one. That is a large, real, hang-free difference in what the
structure actually does, and it is in the same direction as the score gap.

**It does not license quoting +0.93.** 1.88× of delivery is not 3.6× of score,
and there is no reason it should be — `score` is `wavesCleared + hallHpFrac`, a
saturating terminal metric, so delivery and score are not on a common scale and
the two ratios cannot be compared as if they were. What the probe establishes is
that *some* of the gap is mechanical; it cannot apportion the rest. **The
handoff's instruction to carry +0.26 forward stands** — it remains the
conservative figure, and it is now known to be conservative for a reason rather
than by assumption.

**The driver is firing opportunity, not clustering.** Bodies-per-volley is
1.04–1.08× at both mazes — essentially identical. The entire maze-B difference
is in **how often the structure fires at all** (1.74×). A funnel-sited Firestorm
spends most of the match with nothing inside `rangePx`.

## 3. What this probe cannot separate

`tickVolley` returns early *without spending cooldown* when nothing is in range,
so `activations` counts only ticks where the structure both existed and had a
target. **A funnel-sited Firestorm that is destroyed earlier would produce the
same reading as one that simply has fewer targets**, and this probe does not
distinguish them. Structure lifetime is not instrumented here.

That alternative is not idle: the funnel siting places the special in the lane,
where it is more exposed. Resolving it needs a structure-lifetime counter, which
is a separate small probe. Until then, "the funnel Firestorm has fewer targets"
is the *likelier* reading but not the established one — what is established is
that it **fires 1.74× less often**, whatever the cause.

## 4. Change footprint

- `server/game/structureBehaviors/volley.js` — a `state.volleyProbe` counter
  behind a state flag, same opt-in convention as `state.aoeStats` and
  `state.tiProbe`. Absent in the shipped server; no behaviour change.
- `test/harness/matchRunner.js` — `volleyProbe` parameter, default `null`.
- `test/harness/volleyProbe.mjs` — new driver. No pass criterion, prints no
  verdict.

Suite 618/620 (0 fail, 2 skipped), `npm run build` clean.
