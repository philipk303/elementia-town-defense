# Character Asset Pipeline Reconciliation Design

## Goal

Package the completed Wind, Water, and Earth character production slices and complete then package Fire. The deliverable is production-validated source lineage, deterministic atlases, isolated previews, manifest/inventory evidence, and tests. Gameplay atlas registration, animation-state wiring, combat behavior, audio, and balance remain out of scope.

## Boundaries

- Wind and Water are recovered from the main workspace without regeneration.
- Earth is recovered from its Codex worktree, where its 80-frame hero and 10-frame effect outputs already exist.
- Fire resumes from its saved partial source matrix in its Codex worktree, completes the 80-frame hero matrix, and does not add Fire attack FX.
- Build/debug intermediates are excluded from packaged production inputs unless an existing QA record explicitly requires them.

## Delivery Structure

Use a clean integration worktree and make one validated commit per element. Each element commit includes accepted source frames and prompt lineage, final public atlas PNG/JSON, isolated preview declaration, manifest and readable inventory updates, QA evidence, and focused validator/preview tests. A final reconciliation commit verifies all four manifest entries use the same achieved-status vocabulary and reference extant files.

## Verification

For each element, run the existing Pillow/Numpy contract validation and its preview test. Verify the atlas frame count, 64x64 untrimmed RGBA cells, fixed hero baseline/scale where applicable, JSON frame references, and preview load. Run the reconciliation test after all four slices are present.

## Failure Handling

Do not overwrite any accepted source. If copied worktree output differs from its declared manifest or QA evidence, stop that element's packaging task, retain the source, and report the discrepancy rather than silently normalizing or regenerating it.
