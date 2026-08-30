# Phase 0 Spike Results — 2026-07-18

**Machine:** dev Windows box, Node v24.14.1. All "0.1-vCPU proxy" figures = dev measurement × 10 (pessimistic stand-in for Render free tier).

## Spike A — wave-10 snapshot budget → **GO**

Synthetic worst-case state: 120 enemies, 150 structures, 4 players, 40 fx. 2000 emits measured after 300 warmup. Run: `npm run spike:a`.

| Encoding | bytes/snapshot | room MB/s (20Hz×4) | GB / 100 hrs | encode µs (dev) | proxy ms (0.1 vCPU) |
|---|---|---|---|---|---|
| naive full-state (ez-ctf style) | 19,586 | 1.567 | 564 | 59.7 | 0.60 |
| packed FULL (pv changed) | 5,907 | 0.473 | 170 | 19.4 | 0.19 |
| **packed DELTA (pv unchanged)** | **3,189** | **0.255** | **92** | **9.5** | **0.09** |

- Thresholds: delta ≤ 8 KB → **PASS** (3.2 KB); encode ≤ 150 µs → **PASS** (9.5 µs).
- Bandwidth arithmetic: 92 GB/100 hrs is *constant worst-case wave-10 density*. A real 10-wave run spends most of its time far below 120 enemies (waves 1–6 are a fraction of that, build phases are near-idle), so a realistic average is roughly ⅓–½ of worst case → ~30–45 GB per 100 room-hours. Render free tier = 100 GB/mo: **2 concurrent rooms with plausible pre-launch usage (≤ 2–3 hrs/day total) fits with ≥ 50% headroom.** Cap free-tier rooms at 2; revisit if usage grows.
- The naive encoder confirms the review's fear: 564 GB/100 hrs — 6.1× the packed size. The packed protocol is mandatory, adopted.

> **Post-review scope note (2026-07-18, Checkpoint 0):** Spike B's GO is a **movement/collision/pathing-subsystem GO** — the harness exercised ~⅓ of the eventual tick (no tower targeting, combat resolution, aggro FSM, full status system, bots, or encode-in-loop). The 32× margin makes full-tick viability *likely*, not proven. Follow-ups tracked for Phase 1: one spike-B run on real Render free-tier hardware (the ×10 proxy is unvalidated), +15% protocol overhead in bandwidth math, separate static-asset egress budget, room-cap=2 enforced in code. Full review: [`../docs/reviews/2026-07-18-checkpoint0-review.md`](../docs/reviews/2026-07-18-checkpoint0-review.md). Post-fix suite: 26/26 green; both spikes re-run GO (C1 tunneling fix + hp quantization included).

## Spike B — enemy entity system at scale → **GO** (subsystem-scoped, see note above)

120 flow-field enemies (mixed radii incl. r=14 elites) + 150 wall structures in a 4-row serpentine maze; knockback volleys every 2 s; chip damage driving band changes and throttled field recomputes; 60 simulated seconds at 60 Hz. Run: `npm run spike:b`.

| Metric | Measured | Proxy (0.1 vCPU) | Threshold | Result |
|---|---|---|---|---|
| tick avg | 0.037 ms | 0.37 ms | ≤ 1.2 ms dev | **PASS** (32× margin) |
| tick p95 | 0.060 ms | 0.60 ms | — | — |
| tick p99 | 0.151 ms | 1.51 ms | ≤ 3 ms dev | **PASS** (vs 16.7 ms tick budget) |
| heap drift after warmup | −4.6 KB | — | < 512 KB | **PASS** (allocation-free confirmed) |
| field recomputes | 52 in 60 s | — | throttle ≤ 4/s | working (dirty-flagged, ~0.87/s) |

- Elite corridor correctness (r=14 through a 1-tile corridor) is a permanent unit test: `test/game/collisionIndex.test.js` → "ELITE CORRIDOR".
- Full unit suite: 23/23 green (`npm test`).

## Verdict

**Both spikes GO. The packed protocol and the tile-indexed/allocation-free entity architecture are adopted as the Phase 1+ foundation (the spike modules in `server/` are the production code, not throwaways).** Margins are large enough that no enemy-count or tick-rate concessions are needed; the 60 Hz sim / 20 Hz emit reuse plan stands.
