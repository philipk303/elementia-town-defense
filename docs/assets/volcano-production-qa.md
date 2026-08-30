# Volcano production QA — 2026-08-12

- Asset: `MAGMA_TRAP` / `magma_trap`, Fire + Earth, walkable 2 x 2 fusion structure.
- Source: `art/source/volcano/volcano-magma-trap-crater-draft-v3.png`, `volcano-magma-trap-charge-source-v1.png`, and `volcano-magma-trap-eruption-source-v1.png`; derived frames are in `art/source/volcano/frames/`.
- Runtime package: `client/public/art/magma_trap.png` and `client/public/art/magma_trap.json`.
- Focused validation: `C:\Users\phili\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m unittest test.art.volcano_pipeline_test` and `npm run test:asset-delivery`.
- Observed package: five named non-empty, untrimmed 128 x 128 RGBA frames with 2 px gutters: `idle`, `telegraph`, `charged`, `active`, and `recovery`.
- Visual review: the broad cracked-basalt lava crater occupies the 2 x 2 silhouette; four distinct cardinal timber-and-tile shrine gates remain legible through idle, charge, and eruption.
- Runtime state on this asset branch: `runtime-registered`; it is registered in `ATLASES` as `{ key: 'magma_trap', png: 'art/magma_trap.png', json: 'art/magma_trap.json' }`. Target-branch gameplay integration and manual Phaser verification remain open.
