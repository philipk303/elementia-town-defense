# Audio FX wiring — 2026-08-09/10

Wires the 44 sourced Freesound raw downloads (`audio/raw/*.ogg`, gathered 2026-08-02, tracked
in `audio/assets-manifest.json` with full provenance/license per file) into the running game.
Before this pass, `client/public/audio/` was empty and nothing in `client/src/audio.js`
referenced a file that actually existed — every sound in the game was silently failing to
load (Howler's documented "fail silently into gameplay" behavior).

**Approval note:** every sourced entry still carries `approval_status: not_started` from the
sourcing pass — nobody had done a formal listen-through. Philip explicitly approved treating
his go-ahead to wire these as the approval (2026-08-10), rather than gating on a separate
listen pass first, given nothing here is irreversible — a bad pick can be swapped later
without re-plumbing anything, same as the Fire/fireball visual substitute pattern from the
graphics recovery work this week.

## Processing

`tools/audio/process_sfx.py` — ffmpeg/ffprobe pipeline per `docs/plans/2026-07-26-audio-
asset-pipeline.md`'s `sfx` profile (mono OGG, `client/public/audio/sfx/`): trim near-silence,
short click-prevention fades, single-pass loudnorm to -16 LUFS / -1.5 dBTP, ffprobe
measurement. The silence-trim threshold is deliberately conservative (-60dB, not the -40dB a
naive reading of "trim silence" suggests) — verified by hand on `earth_sweep_fs475133.ogg`
(0.88s raw): -40dB cut it to 0.29s, -50dB to 0.39s, -60dB to 0.59s. These are un-normalized
raw downloads at wildly different native loudness (one measured mean -46dB, another -14.7dB),
so a shallow threshold reads real quiet attack/decay as "silence" and cuts it.

All 44 processed successfully. Total output: 1.2 MB (well inside the pipeline's 3 MB
initial-audio / 10 MB total-shipped budgets). No clipping on manual spot-check (`volumedetect`
on `earth_sweep`, `volcano_eruption`, `blizzard_warning`, `muddy_bog_entry` — all safely under
0 dB peak).

## Wired (29 of 44) — has a real client trigger

| Sound | Trigger |
|---|---|
| `special_cast`, `second_cast` | `FX_MAP.ability` / `.ability2` (existing generic channel) |
| `enemy_hit`, `player_hurt`, `downed`, `death`, `revive`, `respawn` | `FX_MAP` (existing generic channel — these SFX_NAMES/FX_MAP entries pre-date this pass; they just had no file until now) |
| `projectile_explosion` | `FX_MAP.boom` (replaces the never-shipped placeholder name `explosion`) |
| `earth_sweep`, `water_palm`, `fire_saber_slash` | `GameScene._playAtk`, cast moment (same trigger as this week's visual FX) |
| `stone_impact`, `splash_impact` | `GameScene._spawnAttackFx`'s new `sfxByState` param — fires when the FX sprite's `impact` animation frame actually starts, not at cast time, so it doesn't stack directly on top of `enemy_hit` at the same instant |
| `wind_fan_throw`, `wind_fan_impact` | Projectile render loop, FAN_BLADE spawn / impact — Wind's fan-blade has real travel time, so these ARE genuinely separated in time (unlike Earth/Water/Fire's same-tick resolution) |
| `watchtower_fire`, `snare_pulse`, `rock_trap_fall`+`rock_trap_impact`, `water_geyser_launch`, `wind_vortex_release`, `volcano_eruption`, `firestorm_volley`, `muddy_bog_root`, `blizzard_impact`, `firepit_flare` | New `STRUCTURE_ACTIVATION_SFX` table, keyed off the same `cycleSeq`-bump signal `StructureAnimator` already uses for its own ACTIVE pulse — no new wire data needed |
| `rock_trap_warning`, `blizzard_warning` | New `STRUCTURE_WARNING_SFX` table, the `targetImpact` family's phase 0->1 edge (armed/telegraphing) — Rock Trap and Blizzard are the only two `targetImpact` structures |

`FX_MAP.swing` was **removed** (not merely left unmapped) — the generic per-tick `swing` fx
carries no element, so it could never sound different per class. `_playAtk` now plays the
caster's real element-specific sound off the richer `atk` channel instead, which does carry
kind/element. `test/client/audioMap.test.js` was updated with an explicit
`DELIBERATELY_UNMAPPED_FX_TYPES` allowlist rather than just deleting the assertions that used
to cover `swing`, so a *different* future unmapped fx type still fails the suite.

## Processed but not wired (15 of 44)

Declared in `SFX_NAMES` (so Howler preloads them — harmless at this file size) but no trigger
calls `playFx` on them yet:

- **`flame_impact`** — Fire's basic FX is the static `fireball` substitute sprite (no impact
  animation state to hook a timed sfx off of, unlike Earth/Water's real atlases).
- **`wind_fan_flight`** — would need a sustained sound that tracks a moving projectile;
  genuinely different mechanics from a one-shot `playFx`, not attempted this pass.
- **`root`, `freeze`, `burn_onset`, `steam_vent_confusion`** — status application has **no
  server-side fx event at all**. `server/game/status.js`'s `applyRoot`/`applyFreeze`/
  `applyBurn` take only the status object (`s`), not `state`/`x`/`y` — adding a dispatch point
  means touching every call site across `abilities.js` and the structure-behavior files, a
  real server combat-code change, not audio wiring. Left for a dedicated follow-up.
- **`heavy_impact`** — ledger event is just "heavy impact" / family `heavy_payoff`; no single
  unambiguous trigger identified without guessing.
- **`firepit_ambience`, `water_geyser_charge`, `wind_vortex_suction`, `volcano_charge`,
  `firestorm_charge`, `steam_vent_pressure`** — sustained/looping sounds (ambience, charge-up,
  pressure-hiss), not one-shot events. A looping ambience in particular needs a start/stop
  lifecycle tied to structure placement/destruction (and the pipeline plan's
  `structure_voices_max: 4` budget), a different code shape from everything wired above.
- **`muddy_bog_entry`** — a per-enemy trigger (an enemy stepping into the bog), not a
  per-structure `cycleSeq` event; Muddy Bog's `entry` state isn't the same signal as its
  `root` payoff.
- **`grinder_intake`** — Grinder's `cycle`/`grind` phase semantics for what "intake" should
  trigger off weren't investigated this pass.

## Validation

`npm test`: 667/669 pass (2 pre-existing skips, 0 failures) — includes updating
`test/client/audioMap.test.js`'s three assertions that hardcoded the retired `swing`/
`melee_swing`/`explosion` names. `npm run build` succeeds.

No manual listen-through happened (no audio playback available in this environment); no
Phaser/Howler runtime smoke test either — verification here is static (file existence,
loudness/clipping checks via `ffmpeg -af volumedetect`, and the automated test suite), same
caveat as this week's graphics recovery work.
