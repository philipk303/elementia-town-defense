# Checkpoint 0 — Adversarial Programmer Review (Phase 0 spike deliverables)

> **REMEDIATION STATUS — 2026-07-18 (same session):** C1, H1, M2, M5, L1, L3, L4 **fixed**; M1 **decided & documented**; H2, M3, M4 **accepted as scope-restatements/follow-ups** (results.md updated; Render-hardware measurement + room-cap enforcement + asset-egress budget tracked as Phase 1 line items); L2 **accepted** (cosmetic one-tick jitter; C1's motion-aware fix removes the dangerous variant); L5 **accepted** (noted as smoke-check only). Suite 26/26 green; both spikes re-run GO after fixes.

**Reviewer:** Fable 5 subagent, senior multiplayer systems programmer, adversarial mandate.
**Subject:** `server/game/{grid,costField,enemyMove,collisionIndex}.js`, `server/net/encode.js`, both spike harnesses, `spikes/results.md`, full test suite.

## Findings

- **C1 (CRITICAL, fixed):** Tile pushout ejected along the shallowest axis, so stacked knockbacks (2×900 px/s ≈ 30 px/tick, inside the 31px clamp) carrying a circle past a wall tile's midline popped it out the **far side** — tunneling through the maze without breaking the wall. Verified by hand before fixing. **Fix:** motion-aware ejection — `resolveTilePushout` now takes the start-of-tick anchor and ejects toward the came-from side. Regression tests: single-shove past midline + 5-second stacked-barrage loop asserting the midline is never crossed (`test/game/collisionIndex.test.js`).
- **H1 (fixed):** hp encoded unquantized; one fractional burn tick would bloat every hp field to an 18-char float (~+55% snapshot size). Now `Math.ceil` on all three hp paths (enemy/player/structure) with a no-floats-on-the-wire test.
- **H2 (accepted, results rescoped):** Spike B measured ~⅓ of the eventual tick (no tower targeting, combat, aggro FSM, full status system, bots, or encode-in-loop) and recycled enemies before chokepoint clumps formed. results.md GO restated as **movement/collision/pathing-subsystem GO**; "no concessions needed" claim withdrawn.
- **M1 (decided):** statics-inclusion keyed per client would force 4× encodes or strand reconnecting clients without statics. Decision documented in `encode.js`: one broadcast encode against server-side `lastBroadcastPv`; joiners/reconnecters get one forced full snapshot.
- **M2 (fixed):** `IndexHeap` overflow guard (silent typed-array OOB → loud throw) + documented edge-count capacity bound.
- **M3 (follow-up):** ×10 dev→0.1-vCPU proxy is asserted, not validated. Phase 1 line item: run spike B once on a real Render free instance before locking tick-rate assumptions.
- **M4 (follow-up):** bandwidth math ignores Socket.io framing, non-snapshot events, and static asset egress; room-cap=2 is unenforced. Phase 1 line items: +15% protocol overhead in the budget, asset egress budgeted separately, room cap enforced in code.
- **M5 (fixed):** `resolveCircles` 3×3 scan silently misses overlaps if any radius > 16 — now throws, invariant documented.
- **L1 (fixed):** stale grid.js comment about orthogonal-first tie-breaking corrected (ties break by tile index).
- **L2 (accepted):** multi-tile pushout scan order can re-embed for one tick in inside corners — cosmetic post-C1-fix.
- **L3 (fixed):** `hpToBand` with maxHp ≤ 0 returned CRITICAL via NaN; now throws.
- **L4 (fixed):** `_solid` promoted to public `solidAt` (two modules depend on it).
- **L5 (accepted):** heap-drift check is a smoke test, not multi-hour proof.

## Verdict (reviewer): conditional GO — architecture adopted; C1/H1/M2 fixed before Phase 1 builds on these files. **Condition met same-session.**
