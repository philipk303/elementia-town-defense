# Audio sourcing session — start here

Date: 2026-08-02
Branch: `codex/redesign-reconciliation`

## Why this session exists

Task 18 (animation/VFX vertical slices) needs Rock Trap and Wind Vortex source
art that doesn't exist yet (see `art/assets-manifest.json` — both `planned`,
`reference_path: null`). Rather than block on art generation, this session
runs audio sourcing in parallel. Audio is fully unstarted: every entry in
`audio/assets-manifest.json` has `provenance.status: "not_started"` (73 assets
total: 9 music, 9 phase/progression, 9 UI/construction, 22 character/combat,
24 structure).

## Approach (hybrid — confirmed with Philip 2026-08-02)

- **One-shot SFX** (impacts, UI clicks, stingers, releases — most of
  `character_and_combat` and `structure` categories): generate with an
  AI audio tool (e.g. ElevenLabs SFX). Faster than library search, and license
  is clean by construction.
- **Music beds and ambience loops** (the `music` category: build_calm/light/
  tense/final, battle_base/intense, menu_theme, victory_final, defeat_final;
  plus loop-type structure sfx like `firepit_ambience`, `wind_vortex_suction`,
  `grinder_intake`, `steam_vent_pressure`): source from open libraries —
  Freesound, OpenGameArt, Kenney.nl. Library quality beats generation here.

## Hard constraint — license policy

`audio/assets-manifest.json` → `source_policy`:
- Allowed: `CC0`, `public_domain`, `CC-BY`
- Rejected: non-commercial, share-alike, personal-use-only, ambiguous, or
  missing license
- Every sourced asset must fill in `planned_provenance`: source_url, creator,
  license, attribution_text, download_date, original_filename, modifications.
  Don't skip this — it's the compliance record.

## Processing pipeline (already specified, not yet built)

From the manifest's `processing_profiles`:
- `music`: mp3, stereo, steps = ffprobe → trim → dc_offset_check →
  click_fades → category_normalize → loop_verify → measure. Output to
  `client/public/audio/music/`.
- `sfx` / `stinger`: ogg, mono (sfx) or stereo (stinger), similar chain minus
  loop_verify, plus `layer` for sfx. Output to `client/public/audio/sfx/`.

No conversion/normalization tooling exists yet for audio (unlike art's Pillow
pipeline) — building the ffmpeg-based processing script is part of this
session's scope, not a prerequisite.

## Priority order

Rock Trap and Wind Vortex structure sfx map directly onto Task 18's two
blocked slices — do those first:
- `rock_trap_warning`, `rock_trap_fall`, `rock_trap_impact`
- `wind_vortex_suction`, `wind_vortex_release`

Then work outward: character_and_combat (Wind is highest priority — it's the
only fully-art-complete character), then remaining structure, then UI/phase,
then music last (biggest single-file assets, least urgent for Task 18).

## Runtime integration

`audio.js` (Howler-based) is the stated runtime owner
(`audio/assets-manifest.json` → `runtime_owner`). Several ids are marked
`integration_status: "existing_runtime_id"` — meaning the runtime already has
a hook expecting that id (ui_click, build, sell, special_cast, second_cast,
enemy_hit, player_hurt, downed, death, revive, respawn, explosion,
level_up, battle_base, battle_intense, menu_theme, watchtower recoil sfx —
check `client/src/audio.js` for the authoritative list). Wiring those first
gets audio live in gameplay fastest; the rest (`integration_status: "planned"`)
need both the sound and the call site added.

## Out of scope for this session

- Rock Trap / Wind Vortex / Fire / Earth *visual* art generation — that's
  Task 18 / the art pipeline, tracked separately in
  `art/assets-manifest.json`.
- Don't `git add -A` — tree still carries unrelated uncommitted WIP
  (`art/`, `audio/` new files, `client/public/`, preview files). Stage by
  name.

## Recommended model

Sonnet is fine for this — audio search/license-vetting/ffmpeg scripting is
routine work, not the demanding-reasoning tier that art visual-approval or
combat-balance work needs.
