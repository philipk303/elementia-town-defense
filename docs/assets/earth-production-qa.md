# Earth production QA

Recovered from `C:\Users\phili\.codex\worktrees\4580\Elementia-Town-Defense` on 2026-08-07 without modifying that worktree.

- Source-to-atlas matrix: 80 Earth hero frames and 10 Earth FX frames match their atlas JSON order; all frames are untrimmed 64x64 RGBA.
- Converter provenance validation regenerated and byte-matched all four accepted public files with the recovery worktree's Earth-capable converter: hero PNG `bc80a74e4a7b7bdab60edfada117c2ebff2b996534fb6b60164fa0d8e0e7c414`, hero JSON `60d9567bf4f221e223bd2371adfc664ef91d39b739b0e02b41acb64b820f9c01`, FX PNG `71711a39ee939e4839ddaff9697f0feb7a5cf97e760a22348095c935e397b094`, and FX JSON `87a331012c208a1df49678c213a388b3ee0b2fe5e4b5a7e53e517ed19d82b952`.
- Visual evidence retained: `earth-production-preview-desktop.png` (1280x720), `earth-production-preview-844x390.png` (844x390), and `earth-production-preview-attack-right.png` (1280x720).
- Package status: source complete, converted, isolated-preview loaded, visually reviewed. Gameplay integration is explicitly not performed.

The integration checkout's older shared converter does not center FX and therefore cannot regenerate the accepted FX PNG. The recovered final FX atlas is accepted and byte-verified against the recovery worktree's converter; reconciling that shared converter is outside this isolated-preview asset package.
