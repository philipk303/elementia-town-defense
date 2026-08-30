# Farm integration handoff

- Source branch: `codex/farm-package`
- Source commits: `90a6f842824b832599f330bcf337649e10b394db` (`feat(art): package Farm structure`) plus the subsequent correction commit that switches packaging to the brief-mandated nearest-neighbor resampling and completes delivery metadata.
- Target branch: `master`
- Ledger record: `farm`
- Runtime file: `client/public/art/farm.png`
- Registration file: `client/src/assets/manifest.js`; add `{ key: 'farm', path: 'art/farm.png' }` to `IMAGES` using the target branch's current static-image shape.
- Aggregated ledger: run `npm run build:manifest` on the target branch after merge; this producer branch intentionally does not touch `art/assets-manifest.json`.
- Required target-branch commands:
  - `uv run --with pillow python -m unittest test/art/farm_pipeline_test.py`
  - `npm run build:manifest`
  - `npm test`
  - `npm run build`
- State on this branch: `production_converted`
- Producer validation: focused unittest passed; `npm run build` passed; `npm test` had 688 passes, 1 expected aggregate-drift failure, and 2 skips.
- Reason integration is blocked: the dispatch reserves runtime registration, Preload verification, aggregated-ledger regeneration, and live Phaser scale validation for the target-branch integrator.
- Delivery caveat: this repository has no configured Git remote, so the branch and commit cannot be pushed from this worktree.

Do not describe Farm as runtime-registered or gameplay-integrated until target-branch registration and the manual Phaser scale/readability gate are complete.
