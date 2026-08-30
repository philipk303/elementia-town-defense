# Rock Trap production QA

- Source: `art/source/rock-trap/`
- Runtime atlases: `client/public/art/earth_special.*` and `client/public/art/rock_trap_fx.*`
- Packaging validation: `python tools/art/generate_rock_trap.py` followed by `node --test test/client/rockTrapAtlas.test.js`.
- Scope: atlas registration only; target-point effect playback is intentionally not claimed as gameplay-integrated.
