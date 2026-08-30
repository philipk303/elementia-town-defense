import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "tools" / "art" / "elemental_particles_pipeline.py"


def load_pipeline():
    spec = importlib.util.spec_from_file_location("elemental_particles_pipeline", PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ElementalParticlesPipelineTest(unittest.TestCase):
    def test_writes_seven_named_64px_frames_with_two_pixel_gutters(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = root / "sources"
            sources.mkdir()
            for state in pipeline.STATES:
                image = Image.new("RGB", (96, 96), "#ff00ff")
                ImageDraw.Draw(image).ellipse((20, 20, 76, 76), fill="#57c7ff")
                image.save(sources / f"{state}.png")
            png, metadata_path = root / "elemental_particles.png", root / "elemental_particles.json"
            pipeline.write_atlas(sources, root / "frames", png, metadata_path)
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.assertEqual(set(metadata["frames"]), {f"{state}_0.png" for state in pipeline.STATES})
            with Image.open(png) as atlas:
                self.assertEqual(atlas.size, (460, 64))
                self.assertEqual(atlas.mode, "RGBA")
                for x in (64, 65, 130, 131, 196, 197, 262, 263, 328, 329, 394, 395):
                    self.assertTrue(all(atlas.getpixel((x, y))[3] == 0 for y in range(64)))
            for state in pipeline.STATES:
                with Image.open(root / "frames" / f"{state}_0.png") as frame:
                    self.assertEqual(frame.size, (64, 64))
                    self.assertIsNotNone(frame.getchannel("A").getbbox())


if __name__ == "__main__":
    unittest.main()
