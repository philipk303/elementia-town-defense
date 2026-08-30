# Asset Production Delivery Contract

Use this document at the start of every session that generates, edits, packages, or validates graphics or audio for Elementia Town Defense.

This contract implements the [runtime asset integration gate](../superpowers/specs/2026-08-08-runtime-asset-integration-gate-design.md). The graphics and audio ledgers remain authoritative:

- Graphics: [`art/assets-manifest.json`](../../art/assets-manifest.json)
- Audio: [`audio/assets-manifest.json`](../../audio/assets-manifest.json)

For recovery and runtime wiring after this production work, use the [Asset Runtime Integration Playbook](asset-runtime-integration-playbook.md).

## Completion boundary

Generating a source file is not completion. Packaging a PNG, OGG, or preview page is not completion. Committing files on an asset branch is not completion.

An asset group is complete only when its named target branch contains every required delivery item, the appropriate validation passes on that target branch, and the ledger state matches that evidence. If another session owns integration, leave the status below `runtime-registered` and create the blocked-integration handoff described below.

## Start every asset session

1. Name the target branch before creating output. For normal game assets, the target is the active gameplay branch, not the asset-production branch.
2. Read the relevant ledger entries. Preserve their runtime IDs, asset keys, source paths, state names, and QA fields unless the approved design changes them.
3. Inspect the runtime consumer before choosing file format or key:
   - graphics registration: `client/src/assets/manifest.js`; loading: `client/src/scenes/Preload.js`;
   - audio logical-name map and playback: `client/src/audio.js`.
4. Work in an isolated branch or worktree. State the target branch and expected integration method in the first handoff/commit message.
5. Do not generate a replacement merely because the current checkout lacks an existing asset. Search branch history and source directories first.

## Graphics delivery unit

For every graphics asset group, commit or hand off all applicable items together:

| Requirement | Location / evidence |
| --- | --- |
| Editable source and lineage | `art/source/<asset>/` and the asset record in `art/assets-manifest.json` |
| Packaged runtime image | `client/public/art/<key>.png` |
| Atlas metadata, when animated | `client/public/art/<key>.json`, paired with its PNG |
| Runtime registration | `ATLASES` or `IMAGES` in `client/src/assets/manifest.js` |
| Runtime consumption | Existing `Preload.js`, renderer, or scene path recognizes the exact declared key |
| Ledger and readable inventory | `art/assets-manifest.json` plus `docs/assets/graphics-inventory.md` agree |
| QA evidence | A dated asset QA record with commands and observed outcome |
| Focused validation | Test proves files, registration, and declared state are consistent |

Use an atlas only when the asset is animated or requires named frames. A Phaser atlas needs both the PNG and JSON. Static art uses an `IMAGES` entry. Do not make an image claim `gameplay-integrated` until the target-branch renderer or event path has a focused test.

## Audio delivery unit

For every audio asset group, commit or hand off all applicable items together:

| Requirement | Location / evidence |
| --- | --- |
| Preserved original and provenance | Source location and complete provenance/license fields in `audio/assets-manifest.json` |
| Processed runtime output | `client/public/audio/<runtime filename>` |
| Logical runtime registration | Matching logical name/path in `client/src/audio.js` |
| Runtime consumption | The declared gameplay event maps to the logical name without inventing a new event contract |
| Ledger and attribution/inventory | `audio/assets-manifest.json` records processing, runtime file, integration state, and attribution fields |
| QA evidence | A dated audio QA record with conversion/playback checks and observed outcome |
| Focused validation | Test proves the file and audio-map entry exist and agree |

Never substitute an unlicensed or ambiguously licensed source. Do not mark an audio entry integrated just because the OGG exists; its logical name and runtime path must be wired in the client audio map.

## Ledger states

Use the most conservative state supported by the target branch:

- `planned`: no approved usable source or package; no runtime file is required.
- `production_source_complete`: source and lineage are present; no runtime package claim yet.
- `production_converted` / `processed`: runtime package exists, but it is not necessarily registered.
- `runtime-registered`: package exists and the exact key/path is registered in the correct loader/map.
- `gameplay_integrated`: a real gameplay/render/audio event consumes the registered asset and focused validation proves it.
- `production_validated` / `gameplay_registered`: only use the project’s existing terms when the record includes matching QA evidence.

Never advance a ledger state on the basis of a side branch. The state describes the branch containing the ledger file.

## Target-branch integration checklist

Before reporting success, check the target branch—not only the asset branch:

```powershell
git status --short
npm test
npm run build
```

Also run the focused graphics or audio validation named by the changed asset’s QA record. Confirm that:

- source/provenance, output, registration, ledger, inventory, and tests are in the same target branch;
- a graphics atlas has both PNG and JSON files;
- an audio map entry points to an actual processed public audio file;
- the runtime key/logical name exactly matches the ledger record; and
- no unrelated working-tree changes were staged or committed.

## Blocked integration handoff

When the target branch cannot be updated in the session, add a dated file under `docs/handoffs/` with this exact information:

```markdown
# <Asset group> integration handoff

- Source branch: `<branch>`
- Source commits: `<full or short commit hashes>`
- Target branch: `<branch>`
- Ledger records: `<asset IDs>`
- Runtime files: `<exact client/public/art or client/public/audio paths>`
- Registration files: `<exact source files and keys/logical names>`
- Overlap or conflict files: `<paths, or none>`
- Required target-branch commands:
  - `<focused test command>`
  - `npm test`
  - `npm run build`
- State on this branch: `<source-complete / converted / processed>`
- Reason integration is blocked: `<specific reason>`
```

Do not say “complete” in the handoff. Say “ready for integration” and record the conservative ledger state.

## Related authority

- [Graphics generation pipeline](../plans/2026-07-24-art-asset-generation-pipeline.md)
- [Audio asset pipeline](../plans/2026-07-26-audio-asset-pipeline.md)
- [Runtime asset integration gate design](../superpowers/specs/2026-08-08-runtime-asset-integration-gate-design.md)
- [Asset Runtime Integration Playbook](asset-runtime-integration-playbook.md)
