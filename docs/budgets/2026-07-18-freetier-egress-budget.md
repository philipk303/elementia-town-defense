# Free-tier egress budget — Phase 1 follow-ups (CP0 M3/M4)

**Date:** 2026-07-18 · **Owner phase:** 1 · **Source measurement:** [`../../spikes/results.md`](../../spikes/results.md)

Closes three of the four Phase-1 line items from the Checkpoint-0 review. The
fourth (room-cap=2) is enforced in code (`server/rooms/index.js`
`MAX_CONCURRENT_ROOMS`) with a regression test (`test/rooms/rooms.test.js`).

## 1. Snapshot bandwidth with +15% protocol overhead (M4)

Spike A measured the packed **delta** snapshot at **3,189 B**. The raw number
ignored Socket.io framing + non-snapshot events, so we now apply
`NETCODE.PROTOCOL_OVERHEAD_MARGIN = 1.15` (defined in `shared/constants.js`) to
every budget figure:

| Figure | Raw (Spike A) | ×1.15 margin |
|---|---|---|
| bytes / delta snapshot | 3,189 B | 3,667 B |
| room MB/s (20 Hz × 4 clients) | 0.255 | **0.293** |
| GB / 100 room-hours (constant wave-10) | 92 | **~106** |

**Realistic average** — a real 10-wave run sits far below 120 enemies most of
the time (early waves + near-idle build phases), roughly ⅓–½ of worst case:
**~35–53 GB per 100 room-hours** with the margin applied.

**Monthly fit (Render free = 100 GB/mo, shared with asset egress below):**
2 concurrent rooms at plausible pre-launch usage (≤ 2–3 hrs/day total room-hours
≈ 60–90 room-hours/mo) → **~21–48 GB/mo** of snapshot egress. Fits with
headroom. Revisit if concurrent usage grows past the 2-room cap.

**Wrapper note (CP1 L5):** Spike A's 3,189 B is the *inner* packed JSON string.
On the wire it rides inside `{ snapshot: "<string>" }`, which Socket.io
stringifies again, escaping the inner quotes (~2–3 % extra bytes). This sits
comfortably inside the 1.15 margin above, so it is accounted for rather than
re-plumbed; if a future profile shows it mattering, emit the object and let
Socket.io serialize once.

## 2. Static-asset egress (M4 — budgeted separately)

The client bundle is served by the **same** Render web service as the game
sockets, so it shares the 100 GB budget (the wake shell is a separate always-on
static service with its own tiny egress).

Current production build (gzip over the wire):

| Asset | gzip |
|---|---|
| index.html | ~1.2 KB |
| index.js (game logic) | ~16 KB |
| phaser chunk | ~340 KB (cached after first load) |
| **cold load total** | **~357 KB** |

At even 1,000 cold unique loads/mo → **~0.35 GB/mo**. Negligible today.

⚠️ **Re-budget at Phase 7:** real art (spritesheets/atlases) + audio (Howler,
real files) will dominate asset egress and could be MB-per-cold-load. When those
land, remeasure and subtract from the 100 GB before re-checking the snapshot fit.

## 3. Render-hardware Spike-B run (M3) — DEFERRED, pre-Phase-8 gate

The ×10 dev→0.1-vCPU proxy in `results.md` is asserted, not validated. This
must be measured on a real Render free instance **before Phase 8 locks tick-rate
assumptions** (Phase 1 has no deploy access, so it cannot close here).

**Ready-to-run:** `npm run spike:b` is headless + `--expose-gc`-driven and has
zero runtime deps. To validate: deploy the web service, open a Render shell on
the instance, run `npm run spike:b`, and compare avg/p99 tick µs against the
dev-proxy figures in `results.md`. Record the real-hardware numbers there.

**Status:** open. Tracked into Phase 8 (deploy) where the instance exists.
