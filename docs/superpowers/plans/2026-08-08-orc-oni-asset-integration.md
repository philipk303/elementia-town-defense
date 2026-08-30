# Orc Oni Asset Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved oni reinterpretation as the static Orc enemy image.

**Architecture:** Convert the approved high-resolution source to a fixed 28 x 28 RGBA runtime PNG, then add the existing manifest-shaped entry that Phaser Preload already consumes. A focused Node test verifies the asset contract without starting Phaser.

**Tech Stack:** Pillow, PNG RGBA, Node.js built-in test runner, Phaser manifest.

## Global Constraints

- Ship only `client/public/art/orc.png`; source art remains outside `client/public/art/`.
- Keep the final image 28 x 28 RGBA, with transparent background and a centered, foot-aligned silhouette.
- Add only the existing `IMAGES` manifest entry; do not alter rendering, collision, enemy behavior, or elite handling.
- The Goblin/Orc/Troll Phaser scale spike is deferred until all three independent enemy sessions land their assets.

---

### Task 1: Add the failing runtime asset-contract test

**Files:**
- Create: `test/client/assetsManifest.test.js`
- Test: `test/client/assetsManifest.test.js`

**Interfaces:**
- Consumes: `IMAGES` and `enemyArtKey()` from `client/src/assets/manifest.js`.
- Produces: test coverage for the Orc static asset's manifest key and PNG properties.

- [x] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { IMAGES, enemyArtKey } from '../../client/src/assets/manifest.js'

test('orc image is registered as a 28px RGBA runtime asset', async () => {
  const image = IMAGES.find(entry => entry.key === 'orc')
  assert.deepEqual(image, { key: 'orc', png: 'art/orc.png' })
  assert.equal(enemyArtKey(1), 'orc')
  const png = await readFile(new URL('../../client/public/art/orc.png', import.meta.url))
  assert.equal(png.readUInt32BE(16), 28)
  assert.equal(png.readUInt32BE(20), 28)
  assert.equal(png[25], 6)
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test test/client/assetsManifest.test.js`

Expected: FAIL because `IMAGES` has no Orc entry and `orc.png` is absent.

### Task 2: Create the normalized runtime asset and register it

**Files:**
- Create: `client/public/art/orc.png`
- Modify: `client/src/assets/manifest.js:39`
- Modify: `test/client/assetsManifest.test.js`

**Interfaces:**
- Consumes: `C:\dev\Elementia-Town-Defense\art\source\orc-oni\orc-oni-source-v5-rgba.png`.
- Produces: `{ key: 'orc', png: 'art/orc.png' }` in `IMAGES` and a 28 x 28 RGBA PNG at its declared path.

- [x] **Step 1: Generate the runtime PNG**

Run the approved Pillow normalization with `Image.Resampling.LANCZOS`, scale the opaque source bounding box to fit inside 26 x 26 pixels, horizontally center it, and position its bottom at y=27. Save it as `client/public/art/orc.png`.

- [x] **Step 2: Add the manifest record**

```js
export const IMAGES = [
  { key: 'orc', png: 'art/orc.png' },
]
```

- [x] **Step 3: Complete the alpha checks**

Use Pillow to assert that the runtime file is `RGBA`, has a transparent
upper-left pixel, and has a non-empty alpha bounding box. This keeps the
Node asset-contract test dependency-free.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `node --test test/client/assetsManifest.test.js`

Expected: PASS with one asset-contract test.

### Task 3: Verify and commit the Orc integration

**Files:**
- Create: `client/public/art/orc.png`
- Modify: `client/src/assets/manifest.js`
- Create: `test/client/assetsManifest.test.js`

**Interfaces:**
- Consumes: the registered Orc static asset.
- Produces: a build-validated and committed runtime-art integration.

- [x] **Step 1: Run the full verification suite**

Run: `npm test && npm run build`

Expected: all Node tests pass and Vite builds the client without errors.

- [x] **Step 2: Inspect asset facts independently**

Run a Pillow probe that reports `RGBA`, `28x28`, a transparent `(0, 0)` pixel, and a non-empty alpha bounding box for `client/public/art/orc.png`.

- [x] **Step 3: Commit the implementation**

```bash
git add client/public/art/orc.png client/src/assets/manifest.js test/client/assetsManifest.test.js docs/superpowers/plans/2026-08-08-orc-oni-asset-integration.md
git commit -m "feat: integrate orc oni enemy art"
```
