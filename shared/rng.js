// Seedable PRNG (mulberry32) — ported verbatim from ez-ctf shared/rng.js.
// Deterministic given a seed: same seed → same sequence. NOT cryptographic.

export function mulberry32(seed) {
  let state = seed >>> 0
  return function rng() {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
