# Elementia Town Defense audio inventory and attribution

This is a manually derived readable snapshot of [`audio/assets-manifest.json`](../../audio/assets-manifest.json). The JSON ledger is authoritative; no attribution-report generator exists yet.

## Current production state and attribution

The 44 SFX (2026-08-02 Freesound sourcing, processed 2026-08-09/10) carry full CC0/CC-BY provenance — see `docs/assets/audio-fx-wiring-2026-08-09.md`. The remaining records are planned or, as of 2026-08-10, the 9 music tracks (see below). No source provenance is invented: source URL, creator, license, attribution text, download date, original filename, and modifications are null until an individual asset page is verified, or (for AI-generated assets) the generation model/prompt/date is recorded instead. Only CC0, public-domain, and CC-BY sources may be approved for library-sourced assets; non-commercial, share-alike, personal-use-only, ambiguous, and missing licenses are rejected.

| Category | Entries | Coverage |
|---|---:|---|
| Music | 9 | Four progressive build mixes, two battle tracks, menu, final victory, final defeat — **all 9 sourced/processed/wired 2026-08-10, see below** |
| Phase and progression | 9 | Build lock, attack start, wave clear, gate, level, and four fusion lifecycle cues |
| UI and construction | 9 | UI, rotate/direction, placement, confirmed build/sell, repair |
| Character and combat | 22 | Four redesigned basics, specials, status, controls, impacts, projectile explosion |
| Structures | 24 | Watchtower, Snare, Firepit, each elemental structure, and every fusion |

### Music (2026-08-10)

All 9 tracks were AI-generated via the Google Gemini API's Lyria 3 models (`lyria-3-pro-preview` for the 7 full loop tracks, `lyria-3-clip-preview` for the two ~30s stinger sources), at the user's explicit direction after a free-library search (OpenGameArt/Freesound/itch.io) found no viable CC0/CC-BY candidates for a matched 4-tier build set or a warm-palette battle_intense companion, and the user separately rejected the 4 free-library candidates that WERE viable (battle_base, menu_theme, victory_final, defeat_final). Total generation cost: ~$0.68 (1 test clip + 9 full generations). No CC license applies — governed by Google's Gemini API Terms of Service; provenance fields record the model and prompt instead of a source URL/license. See `docs/assets/audio-music-wiring-2026-08-10.md` for full detail, including an honest caveat: Lyria has no seed/continuation/audio-conditioning input, so the 4 build-tier tracks are stylistically-consistent independent generations, not a single composition literally re-arranged — and none of the 9 have a verified seamless loop point (the processing pipeline's `loop_verify` step is a rough RMS-delta signal, not a real perceptual check).

The current runtime preserves these legacy IDs where present: `menu_theme`, `battle_base`, `battle_intense`, `ui_click`, `build`, `sell`, `level_up`, `special_cast`, `second_cast`, `enemy_hit`, `player_hurt`, `downed`, `death`, `revive`, `respawn`, and `explosion`. Their source and processing history is not recorded, so the ledger does not label them processed or approved.

## Processing and playback contract

SFX use planned mono OGG output. Music uses the currently exposed compressed-music convention and its existing `battle_base`/`battle_intense` IDs retain MP3 runtime paths; menu retains its existing OGG path. The planned pipeline is FFmpeg/ffprobe based: inspect, trim, remove DC offset when necessary, add click-prevention fades, layer approved sources, normalize by category, measure, and copy only processed output to the runtime bundle.

World SFX use modest pan and capped distance attenuation. UI, phase cues, downed/death/revive/respawn cues, outcomes, and music are centered. Owned loops stop when their source structure is destroyed, and scheduled release cues are cancelled. Build-lock, attack-start, and wave-clear cues duck music; final outcomes do not reuse the ordinary wave-clear cue.

| Budget | Approved ceiling |
|---|---:|
| Initial audio download | 3 MB |
| Total shipped audio | 10 MB |
| Complete initial payload | 8 MB |
| Audible combat voices | 12 |
| Audible structure voices | 4 |
| Music tracks during crossfade | 2 |

## Review gates

Before an entry changes from planned, record its individual source page and full attribution in the JSON ledger, then verify the processed technical metadata and runtime behavior. Release QA must prove logical-event coverage, allowed licenses, rate/voice limits after readiness and mute gates, idempotent phase reconciliation, no reconnect replay, destruction cleanup, and different outcomes for confirmed versus rejected construction.
