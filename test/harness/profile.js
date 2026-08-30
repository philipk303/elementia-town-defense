// Aggregate the per-wave difficulty profile across a cell of matches.
//
// Why this is separate from stats.js: nothing here is inferential. These are
// descriptive per-wave means with their own n, and the n SHRINKS with wave
// number because later waves are only reached by runs that survived that far.
// Every number below is conditional on reaching the wave — read the n column
// before reading anything else.
//
// Completed waves from a run that later hung are kept. Waves 1-8 of a run that
// froze at wave 9 were played honestly; discarding them would throw away the
// early-ramp evidence this profile exists to collect. Only the fragment of the
// wave the run died inside is dropped.

const HAPPENED = w => w.playerDowns > 0 || w.structuresLost > 0 || w.hallDamage > 0

/**
 * @param {object[]} matches  runMatch results (each with a `waves` array)
 * @returns {{waves: object[], deadWaves: number}}
 */
export function aggregateWaveProfile(matches) {
  const byWave = new Map()

  for (const m of matches) {
    for (const w of m.waves ?? []) {
      if (!byWave.has(w.wave)) byWave.set(w.wave, { complete: [], incomplete: 0 })
      const bucket = byWave.get(w.wave)
      if (w.complete) bucket.complete.push(w)
      else bucket.incomplete++
    }
  }

  const waves = []
  for (const wave of [...byWave.keys()].sort((a, b) => a - b)) {
    const { complete: rs, incomplete } = byWave.get(wave)
    if (!rs.length) continue
    const avg = k => rs.reduce((a, r) => a + r[k], 0) / rs.length
    // A wave with no sampled fight tick has no approach measurement. Averaging
    // its Infinity in would report the tension metric as infinite for the whole
    // cell — a readout losing its own resolution, the failure mode this
    // instrument was rebuilt to stop repeating.
    const approaches = rs.map(r => r.closestApproachPx).filter(Number.isFinite)
    waves.push({
      wave, n: rs.length, incomplete,
      enemySeconds: avg('enemySeconds'),
      structuresLost: avg('structuresLost'),
      playerDowns: avg('playerDowns'),
      hallDamage: avg('hallDamage'),
      hallHpFrac: avg('hallHpFrac'),
      approachN: approaches.length,
      closestApproachPx: approaches.length
        ? approaches.reduce((a, b) => a + b, 0) / approaches.length
        : Infinity,
      // Observational, no threshold: not one run in the cell recorded a down, a
      // lost structure or a point of hall damage. Nothing happened, provably.
      dead: !rs.some(HAPPENED),
    })
  }

  return { waves, deadWaves: waves.filter(w => w.dead).length }
}
