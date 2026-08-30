# Wind Vortex production QA

- Approved direction: broad pale-cyan cyclone contained in a glowing rune ring.
- Runtime footprint: 2x1, walkable; the stored cardinal direction selects the
  directional atlas frame independently of horizontal/vertical placement.
- Readability: idle is low and broad, telegraph/charged are stronger suction,
  active rises and bends toward the selected direction, recovery returns idle.
- Package: 20 untrimmed 64x64 RGBA frames with 2px atlas gutters, registered
  as `wind_vortex`.
- Verification: focused Python packer and client manifest tests pass; Vite
  build requires installing the project Node dependencies in this worktree.
