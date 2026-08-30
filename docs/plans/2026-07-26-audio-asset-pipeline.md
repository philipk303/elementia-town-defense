# Audio Asset Pipeline — Free Libraries to Howler

**Status:** Approved design; implementation not started.

**Goal:** Build a licensed, reproducible, free-tier-safe pipeline that turns free-library source audio into validated runtime SFX, stingers, and temporary music for Howler.

**Authority:** This plan governs audio sourcing, processing, inventory, attribution, runtime loading, mixing, spatial playback, and asset budgets. Gameplay event timing remains authoritative in the combat specifications.

## Source and licensing policy

- Prefer CC0 and public-domain assets.
- Permit CC-BY assets when attribution is retained.
- Reject non-commercial, share-alike, personal-use-only, ambiguous, or missing licenses.
- Verify the individual asset page; do not infer permission from a library-wide reputation.
- Keep downloaded originals outside the shipped runtime bundle.
- Record source URL, creator, license, attribution text, download date, original filename, modifications, final filename, and approval state in `audio/assets-manifest.json`.
- Generate a human-readable attribution report from the manifest.

## Sound direction

Use a warm storybook-combat palette: softened impacts, wood, bamboo, stone, cloth, water, wind, restrained fire, and readable elemental layers. Avoid harsh realistic violence and constant oversized magic. Fusion payoffs, player danger, phase transitions, and important telegraphs sit above routine tower output in the mix.

Use East Asian-inspired instrumental color respectfully for music and UI accents. Do not attach culturally specific ceremonial sounds to generic fantasy actions without a deliberate creative reason.

## Authoritative inventory

`audio/assets-manifest.json` is the production ledger. Each entry records:

- Logical name and runtime filename.
- Gameplay event and semantic family.
- Priority, base volume, voice cap, and same-family rate limit.
- Spatial/non-spatial behavior and attenuation range.
- Loop, ducking, and stop/cancellation rules.
- Source/license/provenance fields.
- Processing recipe and measured output metadata.
- Source-approved, processed, integrated, and QA status.

### Music

- `build_calm` — waves 1–3.
- `build_light` — waves 4–6; same composition with light percussion.
- `build_tense` — waves 7–9; stronger percussion and harmonic tension.
- `build_final` — wave 10; fullest build arrangement, still calmer than battle.
- `battle_base`.
- `battle_intense`.
- Temporary `menu_theme`.
- `victory_final` and `defeat_final`.

The four build mixes share melody, tempo, duration, and loop points. Export complete mixes rather than independently encoded synchronized stems; Howler crossfades between wave bands.

### Phase and progression stingers

- Build locked in.
- Attack phase starts.
- Wave cleared.
- Gate warning.
- Level up.
- Fusion proposed, accepted, rejected/expired, and created.
- Final victory and defeat.

Build-lock, attack-start, and wave-clear cues temporarily duck music. They are centered and non-spatial.

### UI and construction

- UI click.
- Rotate structure.
- Change output direction.
- Valid placement and invalid placement.
- Build confirmed and sell confirmed.
- Repair start/loop and repair completed.

Successful build/sell sounds follow server confirmation. Rejected actions never play success cues.

### Character attacks and combat

- Earth sweep and stone impact.
- Water palm and splash impact.
- Fire saber slash and flame impact.
- Wind fan throw, flight, and impact/dissipation.
- Shared elemental special-cast families for first and second specials initially.
- Enemy hit variations, player hurt, downed, death, revive, and respawn.
- Root, freeze, burn onset, heavy impact, and projectile explosion.

Group attacks emit one aggregated impact voice at the event center, not one voice per target.

### Structures

- Watchtower fire.
- Snare pulse.
- Firepit ambience/flare.
- Rock Trap warning, fall, and impact.
- Water Geyser charge and launch.
- Wind Vortex suction and release.
- Steam Vent pressure/confusion.
- Volcano charge and eruption.
- Firestorm charge and volley.
- Muddy Bog entry/root.
- Blizzard warning and impact.
- Grinder intake, crush, and release.

Build these from reusable wood, stone, wind, water, fire, ice, pressure, and magical-transient families where possible. Do not create a unique file for every state when layering and controlled pitch/volume variation provide the identity.

## Processing pipeline

Create an FFmpeg/ffprobe-driven pipeline under `tools/audio/`. Audacity may assist selection and manual layering, but every shipped output passes through the scripted pipeline.

1. Ingest and verify manifest/provenance fields.
2. Decode and inspect channel count, sample rate, duration, peak, and loudness.
3. Trim silence/unwanted tails and remove DC offset where needed.
4. Apply short click-prevention fades.
5. Layer approved sources and normalize by category.
6. Export mono spatial SFX; retain stereo only when width is meaningful.
7. Export stereo music/stingers with verified seamless loops where applicable.
8. Measure final metadata and reject outputs outside category or size limits.
9. Copy only processed outputs into `client/public/audio/`.
10. Generate inventory and attribution reports.

Use OGG for the current SFX contract and the currently supported compressed music format. Add fallback encodings only if real target-device testing proves they are necessary; do not double the bundle speculatively.

## Runtime architecture

- Howler remains the single audio owner in `client/src/audio.js`.
- Load essential UI/phase cues after browser audio unlock.
- Load current-phase music on demand.
- Load core combat families before the first fight.
- Load fusion-specific families only when fusion gameplay can use them.
- Cache loaded assets for the session.
- Fail silently into gameplay while recording a diagnostic.
- Never replay historical events after reconnect.
- Stop owned loops and scheduled release cues when the source structure is destroyed.

### Music state

- Wave number selects the build mix.
- Build lock ducks build music under its stinger.
- Attack start crossfades to battle music under a distinct cue.
- Later waves crossfade from battle base toward intense.
- Wave clear ducks the battle tail under its stinger, then restores the appropriate build mix.
- Final victory and defeat do not reuse the ordinary wave-clear cue.

### Spatial sound

- Structures, projectiles, impacts, and environmental combat effects use modest horizontal panning and capped distance attenuation.
- Local-player actions remain prominent and close to center.
- UI, phase cues, downed alerts, victory/defeat, and music remain centered and non-spatial.
- Off-screen routine sounds attenuate heavily.

## Free-tier and client budgets

- Initial audio download: at most 3 MB.
- Total shipped audio: at most 10 MB.
- Complete initial game payload, including code, art, and initial audio: at most 8 MB.
- At most 12 audible combat voices.
- At most 4 audible structure voices.
- At most 2 music tracks during a crossfade.
- Routine repeated sounds use semantic-family rate limits.
- No audio payloads beyond compact existing/new gameplay event identifiers.

At 1,000 fully uncached loads, 10 MB of audio is approximately 10 GB against the shared 100 GB monthly Render egress allowance. Measure the built deploy artifact and actual caching before release; this arithmetic is a planning ceiling, not proof.

## Verification

Automated checks must prove:

- Every emitted runtime audio event maps to a declared logical sound.
- Every logical sound has a processed runtime file or deliberate fallback.
- Every source has complete allowed-license and attribution fields.
- Runtime files satisfy size, duration, channel, and encoding contracts.
- Audible rate/voice limits work after readiness and mute gates, not only in the intent log.
- Phase transitions and music reconciliation are idempotent.
- Reconnect does not replay audio.
- Destruction stops owned loops/scheduled cues.
- Confirmed and rejected construction actions sound different.

Manual QA covers desktop and landscape phone, mute/unmute startup, slow loading, worst-case wave combat, simultaneous structures, phase ducking/crossfades, clipping, fatigue, and local-player readability.

## Model and review assignment

- **Claude Sonnet 5:** manifest tooling, FFmpeg pipeline, processing/validation, attribution generation, Howler integration, and routine tests.
- **Claude Opus 5 if selectable, otherwise the current `opus` alias:** difficult browser synchronization, mix-state architecture, or defects surviving two disciplined Sonnet attempts.
- **Codex GPT-5.6 Terra:** one batched review after pipeline tooling and one after runtime integration.
- **User:** approves the source palette, build-theme mixes, phase stingers, and final mix.
- **Codex Sol:** only if the audio work exposes a memory, deployment, or architecture-budget failure.

## Acceptance

- The inventory and generated attribution report are complete.
- All processed assets meet licensing and technical contracts.
- Phase cues and progressive build music are distinct and readable.
- Combat remains intelligible at the maximum voice budget.
- Spatial playback improves location awareness without weakening critical centered cues.
- Audio stays within the 3 MB initial, 10 MB total, and 8 MB complete-initial-load budgets.
- `npm run test:audio`, the full test suite, production build, and real-device manual QA pass.
