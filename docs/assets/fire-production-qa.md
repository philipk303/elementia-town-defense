# Fire hero production QA

- Scope: 80-frame Fire hero atlas only; no Fire attack FX, gameplay, audio, or server changes.
- Source lineage: accepted `art/source/calibration/fire.png`; 14 generated right-facing frames; 20 `*_left_*` files are horizontal mirrors of the matching `*_right_*` source.
- Converter: `tools/art/wind_pipeline.py` hero profile, fixed scale `0.0402`, baseline `56`, nearest-neighbor, 2px gutters.
- Automated evidence: source contract validates 80 files; independent atlas builds matched SHA-256 for both PNG and JSON; focused Fire declarations passed.
- Preservation: Fire calibration and versioned reference images were copied byte-for-byte from the saved source worktree.
- Art-direction review: accepted by the user for this isolated-preview package; no additional desktop or 844x390 screenshot artifact is required.
- Follow-up gate: gameplay atlas registration and animation-state wiring remain; Fire attack FX remain out of scope. No gameplay or FX claim is made here.
