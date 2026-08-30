# Elemental particle library integration handoff

- Source branch: `codex/particle-library-package`
- Source commits: `2e59866190056dcee03c72c18e4fb72d43549019` (asset package); subsequent documentation-only correction is the branch tip
- Target branch: `master`
- Ledger records: `elemental_particle_library` (`elemental_particles` / `elemental_particles`)
- Runtime files: `client/public/art/elemental_particles.png`, `client/public/art/elemental_particles.json`
- Registration files: `client/src/assets/manifest.js` (`ATLASES` key `elemental_particles`); `client/src/scenes/Preload.js` must consume the declared loader entry
- Overlap or conflict files: none expected — this branch only edits `art/manifest/elemental_particle_library.json`; Claude will regenerate the aggregate ledger at merge time
- Required target-branch commands:
  - `python -m unittest test.art.elemental_particles_pipeline_test`
  - `npm test`
  - `npm run build`
- State on this branch: `production_converted`
- Reason integration is blocked: this delivery intentionally leaves runtime key registration, pooled emitter consumption, performance QA, and aggregate-manifest generation to Claude Code on `master`. This checkout has no configured Git remote, so the committed branch cannot be pushed from this session.
