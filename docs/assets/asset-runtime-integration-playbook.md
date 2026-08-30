# Asset Runtime Integration Playbook

Use this document when Claude Code or another integration session must find already-generated graphics or audio and wire them into Elementia Town Defense. It is intentionally conservative: recover existing packages before generating replacements.

This playbook implements the [runtime asset integration gate](../superpowers/specs/2026-08-08-runtime-asset-integration-gate-design.md) and enforces the [Asset Production Delivery Contract](asset-production-delivery-contract.md).

## Safety rules

- Preserve the target branch’s uncommitted work.
- Do not use `git reset`, `git checkout --`, `git clean`, `git stash`, force-push, or broad branch merges.
- Do not regenerate artwork or audio merely because the current checkout lacks it.
- Inspect the source commit first, then selectively integrate the complete delivery unit.
- Resolve overlap in ledger and loader files on the target branch. Do not overwrite a newer integrated package with an older side-branch copy.

## Runtime ownership map

| Asset kind | Ledger | Runtime package root | Registration / consumer |
| --- | --- | --- | --- |
| Phaser atlas | `art/assets-manifest.json` | `client/public/art/<key>.png` + `.json` | `client/src/assets/manifest.js` → `ATLASES` → `client/src/scenes/Preload.js` |
| Static graphic | `art/assets-manifest.json` | `client/public/art/<key>.png` | `client/src/assets/manifest.js` → `IMAGES` → `client/src/scenes/Preload.js` |
| Audio | `audio/assets-manifest.json` | `client/public/audio/<file>` | `client/src/audio.js` logical sound map and playback methods |

The `art` and `audio` JSON files are authoritative status ledgers. `docs/assets/graphics-inventory.md` and audio attribution/inventory documents explain their contents but do not override them.

## Inventory before modifying anything

Run these commands from the target checkout:

```powershell
git status --short
git branch --all
git log --all --oneline -- art client/public/art audio client/public/audio client/src/assets client/src/audio.js
Get-ChildItem client/public/art -File
Get-ChildItem client/public/audio -File
```

Then search asset history by runtime key, file name, or asset ID:

```powershell
git log --all --oneline -- client/public/art/chibi_fire.png client/public/art/fireball.png
git log --all --oneline -- client/public/audio/<runtime-file>.ogg
git show --name-status <candidate-commit>
git show <candidate-commit>:art/assets-manifest.json
git show <candidate-commit>:audio/assets-manifest.json
```

Interpret results carefully:

- A file in `client/public/*` without a corresponding registration is packaged but not runtime-loadable.
- A registration key without its package falls back or load-fails; do not mark it integrated.
- A package on a side branch is recoverable, not yet present on the target branch.
- A `planned` ledger state on the target branch does not prove the asset was never generated; inspect all branches before generating again.

## Integrate one asset group at a time

For each candidate commit, inventory the complete delivery unit before copying anything:

```powershell
git show --name-status <candidate-commit> -- art/source client/public/art client/public/audio art/assets-manifest.json audio/assets-manifest.json client/src/assets/manifest.js client/src/audio.js docs/assets test
git diff --name-status HEAD...<source-branch> -- client/public/art client/public/audio client/src/assets/manifest.js client/src/audio.js art/assets-manifest.json audio/assets-manifest.json
```

Bring over only the source/provenance, processed output, registration, ledger/inventory evidence, and focused test files that form one asset group. If a selective cherry-pick conflicts, abort it and apply the individual intended changes manually; do not merge an entire historical branch just to recover one image or sound.

### Graphics wiring

1. Put final PNG files under `client/public/art/`.
2. For animation, include its matching Phaser atlas JSON and add `{ key, png, json }` to `ATLASES` in `client/src/assets/manifest.js`.
3. For static art, add `{ key, png }` to `IMAGES` in that manifest.
4. Preserve the existing `Preload.js` loader path. Only update a renderer/controller when the existing runtime key cannot select the completed package.
5. Update the graphics ledger with exact source directory, output paths, frame count, registration key, integration state, and QA evidence.
6. Update `docs/assets/graphics-inventory.md` to match the ledger.

### Audio wiring

1. Put processed runtime files under `client/public/audio/`; preserve source/provenance outside the shipped runtime directory according to the audio ledger.
2. Add or repair the exact logical-name/path mapping in `client/src/audio.js`.
3. Reuse the existing gameplay event mapping; do not alter gameplay timing, combat events, or audio semantics to make a file fit.
4. Update `audio/assets-manifest.json` with source/license, processing metadata, final path, logical name, runtime state, and QA evidence.
5. Regenerate or update the readable attribution/inventory output if the audio pipeline provides it.

## Verify on the target branch

Run the narrowest relevant test first, then the project checks:

```powershell
npm run test:audio
npm test
npm run build
```

For graphics, run the focused asset/renderer test supplied with the package in addition to `npm test` and the build. Confirm atlas JSON and PNG files exist together, their keys occur once in `ATLASES` or `IMAGES`, and the ledger claim is no stronger than the evidence.

For audio, confirm each logical sound name resolves to an existing file under `client/public/audio/`, then run `npm run test:audio`, `npm test`, and the build.

## Current recovery example — re-inventory before use

As of the initial recovery audit, the target branch already contained Water/Wind heroes, Water/Wind basic effects, Rock Trap, and Water Geyser. Side branches contained recoverable packages for Earth/Fire heroes, Earth basic effects, Fireball, Firepit, Wind Vortex, Goblin, Orc, and Troll. `codex/asset-wiring-prep` was the consolidated recovery branch, with Fireball at `5a47aa0`, remaining runtime art at `3aa7be2`, and an approved Wind Vortex correction at `55c7f33`.

This is an example, not an instruction to overwrite current work. Re-run the inventory commands and use the current ledger/branch state before taking action.

## Final report format

Report one row per asset group:

| Asset group | Source commit/path | Runtime output | Key or logical name | Ledger state | Validation |
| --- | --- | --- | --- | --- | --- |
| `<name>` | `<commit and source>` | `<public paths>` | `<runtime key/name>` | `<state>` | `<commands and result>` |

If no usable source package exists, do not fabricate a completion. Leave the ledger state conservative and create the blocked-integration handoff described in the [Asset Production Delivery Contract](asset-production-delivery-contract.md).

## Related authority

- [Asset Production Delivery Contract](asset-production-delivery-contract.md)
- [Graphics generation pipeline](../plans/2026-07-24-art-asset-generation-pipeline.md)
- [Audio asset pipeline](../plans/2026-07-26-audio-asset-pipeline.md)
- [Runtime asset integration gate design](../superpowers/specs/2026-08-08-runtime-asset-integration-gate-design.md)
