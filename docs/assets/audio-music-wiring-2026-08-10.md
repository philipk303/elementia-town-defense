# Background music sourcing and wiring — 2026-08-10

Sources, processes, and wires all 9 background-music tracks from
`audio/assets-manifest.json`'s `music` category, which were `not_started` on every
branch/worktree in this repo as of 2026-08-10 (re-verified via `git log --all` and
`git show <branch>:audio/assets-manifest.json` on every asset-production side branch —
no prior session had touched music). Before this pass, `MUSIC_SRC` in
`client/src/audio.js` only had 3 placeholder entries (`menu_theme`, `battle_base`,
`battle_intense`) pointing at files that did not exist.

## Sourcing decision

Per the pipeline plan (`docs/plans/2026-07-26-audio-asset-pipeline.md`), sourcing the
palette/theme is explicitly a user decision, not an autonomous one — this session asked
first rather than generating or downloading anything speculatively.

1. A research pass (general-purpose subagent) searched OpenGameArt, Freesound, and
   itch.io for CC0/CC-BY candidates. It found good single-track fits for `battle_base`,
   `menu_theme`, `victory_final`, and `defeat_final`, but **no viable candidate** for a
   matched 4-tier build set (`build_calm/light/tense/final` sharing melody/tempo across
   escalating arrangements) or a warm-storybook-palette `battle_intense` — no free
   library offers pre-made dynamic-intensity variant sets of one theme.
2. Philip listened to the 4 CC0 candidates in-browser and rejected all of them.
3. Philip provided a Google AI Studio API key (from a separate personal project's Apps
   Script Script Properties, pasted into this repo's `.env` as `GEMINI_API_KEY` —
   confirmed valid via a `models` list call, and confirmed both `lyria-3-clip-preview`
   and `lyria-3-pro-preview` are enabled for the key).
4. All 9 tracks were generated via Lyria 3: the 7 full loop tracks (`build_calm/light/
   tense/final`, `battle_base`, `battle_intense`, `menu_theme`) via `lyria-3-pro-preview`
   (~2min, $0.08/song), the 2 outcome stingers (`victory_final`, `defeat_final`) via
   `lyria-3-clip-preview` (fixed 30s, $0.04/song, then trimmed to a real stinger length
   in processing). Total cost across one test clip + the 9 real generations: ~$0.68.
   Philip listened to all 9 and approved wiring them in.

**Known limitation, stated plainly, not glossed over:** the Gemini API's Lyria
`interactions` endpoint takes only text (and optional image) input — no seed, no
audio-conditioning/continuation input. That means the 4 build-tier tracks are NOT the
single composition the pipeline plan describes, literally re-arranged 4 ways; they are 4
independent generations from consistently-worded prompts (same instrumentation, tempo
language, key phrases), asked to sound like a family. Whether they actually cohere as
one escalating theme is a judgment call for a real listen-through, not something this
pipeline can verify mechanically. Likewise `battle_intense` was generated independently
of `battle_base` (no shared seed), so their crossfade is a stylistic match, not a
guaranteed continuation of the same material.

## Processing

`tools/audio/process_music.py` — new script, ffmpeg/ffprobe, mirrors
`tools/audio/process_sfx.py`'s pattern but with the `docs/plans/2026-07-26-audio-asset-
pipeline.md` `music` profile's differences: stereo (not mono), MP3 (not OGG), and
deliberately **no** aggressive silence-trimming (a loop needs its authored boundaries
intact, not auto-trimmed). Per-track steps: -16 LUFS single-pass loudnorm (same target as
the SFX pipeline, for mix consistency), 15ms click-prevention fades (longer than SFX's
5ms since these are full mixes, not transients), re-encode at 64kbps stereo MP3.

**Bitrate is the load-bearing decision here.** Lyria's raw output is 192kbps stereo MP3;
at that bitrate, 7 tracks averaging ~2 minutes plus 2 stingers would total ~21MB, more
than double the pipeline's 10MB total-shipped-audio budget (`audio/assets-manifest.json`
`budgets.total_shipped_audio_mb_max`) even before counting the ~1.2MB already shipped for
SFX. 64kbps stereo brings the 9 tracks to 6.74MB total — `client/public/audio/` measures
7.8MB overall (music + the existing 44 SFX), safely under the 10MB ceiling. 128kbps was
rejected (would blow the budget); mono was rejected (the pipeline plan explicitly wants
stereo music/stingers, unlike SFX's mono spatial contract).

The two one-shot stingers (`victory_final`, `defeat_final`) are trimmed from Lyria's fixed
30s clip-preview output down to a 12s one-shot cue (`atrim` before the fade/loudnorm
chain) — a 30-second uninterrupted victory/defeat cue would be far too long for a
one-shot music sting per the ledger's own `music_one_shot` settings preset.

`dc_offset_check`: measured (not blindly filtered) via `ffmpeg astats` on every raw file
— all 9 measured ~0.0001–0.0002, negligible, so no DC-correction filter was applied (a
clean AI-generated studio mix, unlike the SFX pass's real-world microphone recordings
that did need it).

`loop_verify`: implemented as a cheap RMS-level delta between the first and last 100ms of
each processed loop track, logged into the ledger's `processing.loop_seam_rms_delta_db`
field — **explicitly not a real perceptual loop-seam check** (no phase alignment, no
zero-crossing analysis). Measured deltas ranged 35.6–67.7 dB across the 7 loop tracks,
which is large — these tracks were not authored with a loop point in mind (Lyria has no
loop-point control), so **expect an audible seam/jump on Howler's loop repeat** until a
real loop-point edit (crossfade-on-repeat, or hand-trimming to a true zero-crossing) is
done as a follow-up. This is flagged in the ledger (`qa_status: "unreviewed"` on every
music entry, never claimed `verified`) rather than papered over.

All 9 processed successfully; see `audio/assets-manifest.json`'s per-asset `processing`
block for exact figures.

## Runtime wiring (`client/src/audio.js`)

`MUSIC_SRC` extended from 3 to all 9 keys (now exported, so `test/assetDelivery.test.js`
can check it the same way it already checks `SFX_NAMES`).

`MusicDirector` redesigned around a single `_activeLoopKey` ("the current bed") instead of
manually juggling `battle_base`/`battle_intense` volumes:

- **`_selectLoop(key, vol, ms)`** — crossfade-swap the active loop bed to `key`, fading
  the previous one out. Used for both the build-tier selection and the battle-tier
  selection, so at most 2 loop keys are ever audible mid-crossfade (the ledger's
  `music_tracks_during_crossfade_max: 2` budget).
- **`buildTierForWave(wave)`** — waves 1-3 `build_calm`, 4-6 `build_light`, 7-9
  `build_tense`, 10+ `build_final`, per the pipeline plan's own wave bands.
- **`BATTLE_INTENSE_FROM_WAVE = 8`** — a judgment call, not specified anywhere: the
  previous code crossfaded to `battle_intense` on *any* fight phase, regardless of wave
  (confirmed by reading the pre-existing `reconcileFromPhase`/`setIntensity` before
  changing them, per this task's own instructions to check rather than assume). The redesign
  ties `battle_intense` to the last 3 waves (8, 9, 10), mirroring where `build_tense`/
  `build_final` start escalating, so late-game pressure reads consistently across both
  the build and fight halves of each wave.
- **`reconcileFromPhase(phase, wave)`** — now takes the wave number (GameScene's
  `PHASE_CHANGE` payload already carried `p.wave`; it just wasn't being passed). Fight
  phase picks a battle tier by wave; build/waveEnd/lobby phases pick a build tier by wave.
  Remembers the last `(phase, wave)` it saw (`_lastPhase`/`_lastWave`) so a `setScene
  ('match')` call — including the late-Howler-ready re-apply in `Audio.init()` — can
  immediately resume the right track instead of staying silent until the next
  `PHASE_CHANGE`.
- **`playOutcome(outcome)`** — new method. Ducks the match loop bed via
  `setScene('postgame')` (unchanged behavior: fades everything but `menu_theme` to 0,
  brings `menu_theme` up quiet), then plays `victory_final`/`defeat_final` once on top at
  a more prominent volume. Distinct from the pre-existing `'victory'`/`'defeat'` one-shot
  SFX (`audio.playFx(...)`, unchanged, still fires alongside).

`GameScene.js` changes (3 call sites): `_onGameStart` now also calls
`audio.music.reconcileFromPhase(p.phase, p.wave)` right after `setScene('match')`; the
`PHASE_CHANGE` handler forwards `p.wave` into `reconcileFromPhase`; the `GAME_END`
handler calls `audio.music.playOutcome(...)` instead of the old direct
`setScene('postgame')` (folded into `playOutcome` itself).

## Ledger

All 9 `audio/assets-manifest.json` music entries updated: `provenance` (model, prompt,
generation date, approval note — no license/attribution fields since this is AI-generated,
not a licensed third-party work), `processing_status: "processed"`,
`integration_status: "wired"`, `qa_status: "unreviewed"` (no human listen-through of the
*processed* output happened in this text-only environment — the pre-processing raw clips
were listened to and approved, but the final 64kbps re-encodes were not re-verified by
ear), and `processing.loop_seam_caveat` documenting the unverified loop points.

## Validation

`npm test`: 677/677 (675 pass, 2 pre-existing skips, 0 failures) — includes:
- `test/client/audioMap.test.js`: rewrote the one test that hardcoded "fight phase always
  means intense" (no longer true), added coverage for wave-driven build-tier selection,
  the scene-guard on `reconcileFromPhase`, and `playOutcome`'s scene-ducking + no-throw
  behavior.
- `test/assetDelivery.test.js`: split the old single "wired implies SFX_NAMES" check into
  a non-music version and a new music version against the now-exported `MUSIC_SRC`;
  added a `MUSIC_SRC`-entries-exist-on-disk check and a total-shipped-audio-budget check
  (currently 7.8MB / 10MB).

`npm run build`: succeeds.

No manual Phaser/Howler runtime smoke test happened (no audio playback available inside
this environment's build/test tooling) — same caveat as the SFX wiring pass. The raw
generated clips (pre-processing) were listened to by Philip outside this pipeline, in a
system media player; the actual shipped 64kbps re-encodes were not re-listened to.
