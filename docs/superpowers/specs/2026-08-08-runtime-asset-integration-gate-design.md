# Runtime Asset Integration Gate Design

## Purpose

Prevent graphics and audio packages from becoming stranded on a side branch or being recorded as complete when the running game cannot load them. This is a delivery-control change only; it does not change art direction, audio direction, gameplay, or runtime behavior.

## Authority and scope

`art/assets-manifest.json` remains the authoritative graphics ledger and `audio/assets-manifest.json` remains the authoritative audio ledger. The graphics and audio pipeline plans gain the same integration-gate policy. `docs/assets/graphics-inventory.md` and the audio attribution/inventory output remain readable derivatives, not independent sources of truth.

The gate applies to every newly shipped or changed graphics atlas/image and every newly shipped or changed audio file. It does not require planned assets to exist.

## Asset states and evidence

An asset may be `planned`, source-complete, processed/converted, runtime-registered, gameplay-integrated, or QA-verified. A state may advance only when its evidence exists in the same branch:

| State | Required evidence |
| --- | --- |
| Source-complete | source path and provenance in the authoritative ledger |
| Processed/converted | packaged runtime output exists under `client/public/art/` or `client/public/audio/` |
| Runtime-registered | graphics key exists in `client/src/assets/manifest.js`, or audio logical name/path exists in the client audio map/loader |
| Gameplay-integrated | runtime consumer has a focused test proving the declared loader or event path |
| QA-verified | ledger cites a QA record with the exact commands and observed result |

The validation must reject a ledger entry that claims a state without the applicable evidence. It must not require output, registration, or QA for `planned` entries.

## Delivery contract

Every asset-producing branch must contain one atomic delivery unit per asset group:

1. editable source and provenance;
2. deterministic processed/runtime output;
3. authoritative ledger update;
4. runtime registration when the asset is intended to load;
5. focused validation and QA evidence; and
6. an integration target, recorded in the PR/commit handoff as the target branch and the expected integration commit.

An asset branch is not complete merely because a preview works or a package exists. It is complete only after its target branch contains the delivery unit and validation passes there.

If integration cannot happen immediately, the asset remains `processed/converted` rather than `runtime-registered` or `gameplay-integrated`. The branch must add a short dated handoff under `docs/handoffs/` naming the source branch, exact commits, target branch, conflicting files, and the commands needed to validate after integration.

## Validation design

Add a repository-owned Node test that reads both ledgers and validates their delivery claims against the checked-out tree.

- Graphics checks validate each claimed runtime image/atlas output and the declared `ATLASES` or `IMAGES` registration key. Atlas entries require both PNG and JSON.
- Audio checks validate each claimed processed/runtime filename beneath `client/public/audio/` and its logical registration in the audio loader/map.
- The test validates only explicit runtime claims, so source-only and planned inventory can evolve without false failures.
- Existing focused renderer and audio-map tests remain responsible for behavior. The new test proves delivery consistency, not playback quality.

Expose the test as `npm run test:asset-delivery` and include it in the ordinary `npm test` suite so asset-state drift is caught locally and in CI.

## Operational workflow

1. Create the asset in an isolated branch/worktree.
2. Package and validate it locally.
3. Commit the complete delivery unit.
4. Integrate it into the named target branch before reporting completion.
5. Run the delivery test, focused graphics/audio tests, and client build on the target branch.
6. Only then advance the ledger to `runtime-registered` or `gameplay-integrated`.

For a side-branch recovery, inspect the source branch with `git show`, bring over only the complete delivery unit, resolve ledger/manifest overlap on the target branch, and rerun the target-branch checks. Never regenerate art or audio merely because it is absent from the current checkout.

## Success criteria

- A package cannot be marked runtime-ready when its files or loader registration are missing.
- A graphics or audio branch cannot be reported complete without a named target-branch integration result or an explicit blocked handoff.
- The current stranded Earth, Fire, Fireball, Firepit, Wind Vortex, and enemy assets can be recovered using the same contract.
- The policy is durable in repository documentation and enforced by automated validation, not agent memory.
