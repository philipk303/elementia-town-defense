import json
import struct
import subprocess
import sys
import unittest
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIRECTORY = ROOT / "art" / "source" / "firestorm"
RUNTIME_PACKAGE = ROOT / "client" / "public" / "art" / "firestorm.png"
ATLAS_PNG = ROOT / "client" / "public" / "art" / "firestorm_fx.png"
ATLAS_JSON = ROOT / "client" / "public" / "art" / "firestorm_fx.json"
PIPELINE = ROOT / "tools" / "art" / "firestorm_pipeline.py"
QA_RECORD = ROOT / "docs" / "assets" / "firestorm-production-qa.md"
HANDOFF = ROOT / "docs" / "handoffs" / "2026-08-09-firestorm-runtime-integration.md"


def read_rgba_png(path):
    """Return the decoded non-interlaced RGBA rows for the delivery package."""
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    offset, ihdr, compressed = 8, None, bytearray()
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        chunk_type = data[offset + 4:offset + 8]
        chunk_data = data[offset + 8:offset + 8 + length]
        offset += 12 + length
        if chunk_type == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    assert ihdr is not None
    width, height, bit_depth, color_type, compression, filter_method, interlace = ihdr
    assert (bit_depth, color_type, compression, filter_method, interlace) == (8, 6, 0, 0, 0)

    stride = width * 4
    raw, rows, previous, offset = zlib.decompress(compressed), [], bytearray(stride), 0
    for _ in range(height):
        filter_type = raw[offset]
        filtered = raw[offset + 1:offset + 1 + stride]
        offset += stride + 1
        row = bytearray(stride)
        for index, value in enumerate(filtered):
            left = row[index - 4] if index >= 4 else 0
            above = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            if filter_type == 0:
                result = value
            elif filter_type == 1:
                result = value + left
            elif filter_type == 2:
                result = value + above
            elif filter_type == 3:
                result = value + ((left + above) // 2)
            elif filter_type == 4:
                p, pa, pb, pc = left + above - upper_left, 0, 0, 0
                pa, pb, pc = abs(p - left), abs(p - above), abs(p - upper_left)
                result = value + (left if pa <= pb and pa <= pc else above if pb <= pc else upper_left)
            else:
                raise AssertionError(f"unsupported PNG filter {filter_type}")
            row[index] = result & 0xFF
        rows.append(row)
        previous = row
    return width, height, rows


class FirestormPipelineTest(unittest.TestCase):
    def test_delivery_package_is_alpha_safe_64px_rgba(self):
        self.assertEqual(
            {path.name for path in SOURCE_DIRECTORY.glob("*.png")},
            {
                "firestorm-concept-draft-v1.png",
                "firestorm-concept-draft-v2.png",
                "firestorm-runtime-chromakey.png",
            },
        )
        width, height, rows = read_rgba_png(RUNTIME_PACKAGE)
        self.assertEqual((width, height), (64, 64))
        self.assertEqual([rows[y][x * 4 + 3] for x, y in ((0, 0), (63, 0), (0, 63), (63, 63))], [0, 0, 0, 0])
        opaque = [(x, y) for y, row in enumerate(rows) for x in range(width) if row[x * 4 + 3] > 0]
        self.assertTrue(opaque)
        left, top = min(x for x, _ in opaque), min(y for _, y in opaque)
        right, bottom = max(x for x, _ in opaque), max(y for _, y in opaque)
        self.assertLessEqual(abs(((left + right) / 2) - 31.5), 4)
        self.assertLessEqual(abs(((top + bottom) / 2) - 31.5), 8)

    def test_activation_atlas_has_named_structure_state_frames(self):
        self.assertEqual(
            {path.name for path in (SOURCE_DIRECTORY / "frames").glob("*.png")},
            {
                "firestorm_idle_source_chromakey.png",
                "firestorm_charge_source_chromakey.png",
                "firestorm_volley_source_chromakey.png",
            },
        )
        self.assertTrue(PIPELINE.is_file())
        self.assertTrue(ATLAS_PNG.is_file())
        metadata = json.loads(ATLAS_JSON.read_text(encoding="utf-8"))
        self.assertEqual(
            list(metadata["frames"]),
            [
                "idle_00.png", "idle_01.png",
                "telegraph_00.png", "telegraph_01.png",
                "charged_00.png", "charged_01.png",
                "active_00.png", "active_01.png",
                "recovery_00.png", "recovery_01.png",
            ],
        )
        width, height, rows = read_rgba_png(ATLAS_PNG)
        self.assertEqual((width, height), (492, 198))
        self.assertEqual([rows[y][x * 4 + 3] for x, y in ((0, 0), (491, 0), (0, 197), (491, 197))], [0, 0, 0, 0])
        self.assertTrue(all(row[x * 4 + 3] == 0 for row in rows for x in (0, 1, 98, 99, 196, 197, 294, 295, 392, 393, 490, 491)))
        self.assertTrue(all(rows[y][x * 4 + 3] == 0 for y in (0, 1, 98, 99, 196, 197) for x in range(width)))
        keyed_opaque = sum(
            1
            for row in rows
            for x in range(width)
            if row[x * 4 + 3] and ((row[x * 4] < 90 and row[x * 4 + 1] > 180 and row[x * 4 + 2] < 90) or (row[x * 4] > 180 and row[x * 4 + 1] < 90 and row[x * 4 + 2] > 180))
        )
        self.assertLess(keyed_opaque, 50)
        for frame in metadata["frames"].values():
            self.assertEqual(frame["frame"]["w"], 96)
            self.assertEqual(frame["frame"]["h"], 96)

    # Inverted from the delivery branch's version of this test. On
    # codex/firestorm-asset-delivery the correct assertion was "conservative":
    # ledger `planned`, inventory saying "not runtime-registered", no
    # manifest.js entry. Integration on the target branch is precisely the act
    # of making those false, so these now pin the integrated state instead.
    # The package assertions above (source lineage, 96x96 frames, named
    # states, deterministic rebuild) are branch-independent and unchanged.
    def test_delivery_records_reflect_target_branch_integration(self):
        manifest = json.loads((ROOT / "art" / "assets-manifest.json").read_text(encoding="utf-8"))
        firestorm = next(asset for asset in manifest["assets"] if asset["id"] == "firestorm")
        self.assertEqual(firestorm["source"]["status"], "production_source_complete")
        self.assertEqual(firestorm["source"]["reference_path"], "art/source/firestorm/firestorm-concept-draft-v2.png")
        self.assertEqual(firestorm["pillow"]["status"], "production_converted")
        self.assertEqual(firestorm["states"], ["idle", "telegraph", "charged", "active", "recovery"])
        self.assertIn("client/public/art/firestorm_fx.png + client/public/art/firestorm_fx.json", firestorm["pillow"]["output"])
        self.assertEqual(firestorm["runtime"]["status"], "gameplay_integrated")
        self.assertEqual(firestorm["runtime"]["atlas_key"], "firestorm")
        self.assertTrue(firestorm["runtime"]["gameplay_integrated"])
        self.assertEqual(firestorm["qa"]["status"], "gameplay_registered")
        self.assertEqual(firestorm["qa"]["evidence"], "docs/assets/firestorm-production-qa.md")

        inventory = (ROOT / "docs" / "assets" / "graphics-inventory.md").read_text(encoding="utf-8")
        self.assertIn("## Firestorm delivery", inventory)
        self.assertIn("client/public/art/firestorm_fx.png", inventory)
        # The static PNG survives as lineage evidence but must never be
        # described as the registered runtime package.
        self.assertIn("unregistered as lineage evidence", inventory)

        qa = QA_RECORD.read_text(encoding="utf-8")
        self.assertIn("Date: 2026-08-12", qa)
        self.assertIn("client/public/art/firestorm.png", qa)
        self.assertIn("client/public/art/firestorm_fx.png", qa)
        self.assertIn("client/public/art/firestorm_fx.json", qa)
        self.assertIn("production_converted", qa)
        self.assertIn("python -m unittest test.art.firestorm_pipeline_test -v", qa)

        handoff = HANDOFF.read_text(encoding="utf-8")
        for line in (
            "- Ledger records: `firestorm`",
            "- Runtime files: `client/public/art/firestorm.png`, `client/public/art/firestorm_fx.png`, `client/public/art/firestorm_fx.json`",
            "- Registration files: `client/src/assets/manifest.js` — `ATLASES` key `firestorm` (replaces static `IMAGES` entry); `client/src/render/sprites.js` — existing fusion renderer",
            "- State on this branch: `production_converted`",
            "- Reason integration is blocked: `Runtime registration and fusion-renderer wiring are owned by Claude on codex/redesign-reconciliation.`",
        ):
            self.assertIn(line, handoff)

    # Also inverted on integration. The delivery branch asserted the key was
    # absent from both tables; the target branch asserts it is present in
    # exactly one of them. The IMAGES half stays an assertNotIn either way:
    # the superseded static firestorm.png must not claim the same key, which
    # would be a duplicate-key collision (test/assetDelivery.test.js) and
    # would race the atlas for the same texture slot.
    def test_runtime_key_is_registered_as_an_atlas_and_not_as_a_static_image(self):
        asset_manifest = (ROOT / "client" / "src" / "assets" / "manifest.js").read_text(encoding="utf-8")
        images = asset_manifest.split("export const IMAGES = [", 1)[1].split("]", 1)[0]
        atlases = asset_manifest.split("export const ATLASES = [", 1)[1].split("]", 1)[0]
        self.assertNotIn("key: 'firestorm'", images)
        self.assertIn(
            "{ key: 'firestorm', png: 'art/firestorm_fx.png', json: 'art/firestorm_fx.json' }",
            atlases,
        )

    def test_pipeline_rebuilds_the_committed_atlas_without_overwriting_the_static_base(self):
        original_base = RUNTIME_PACKAGE.read_bytes()
        subprocess.run(
            ["uv", "run", "--with", "Pillow", "python", str(PIPELINE), "--source", str(SOURCE_DIRECTORY / "frames"), "--png", str(ATLAS_PNG), "--json", str(ATLAS_JSON)],
            check=True,
            cwd=ROOT,
        )
        self.assertEqual(RUNTIME_PACKAGE.read_bytes(), original_base)


if __name__ == "__main__":
    unittest.main()
