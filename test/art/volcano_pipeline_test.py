import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'tools' / 'art' / 'volcano_pipeline.py'


def load_pipeline():
    spec = importlib.util.spec_from_file_location('volcano_pipeline', PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class VolcanoPipelineTest(unittest.TestCase):
    def test_writes_five_named_128px_state_frames_and_atlas(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            concept = root / 'concept.png'
            image = Image.new('RGB', (256, 256), '#ff00ff')
            ImageDraw.Draw(image).ellipse((24, 24, 232, 232), fill='#b54a2a')
            image.save(concept)
            atlas_png, atlas_json = root / 'magma_trap.png', root / 'magma_trap.json'

            pipeline.write_atlas(concept, root / 'frames', atlas_png, atlas_json)

            metadata = json.loads(atlas_json.read_text(encoding='utf-8'))
            expected = {
                'idle_0.png', 'telegraph_0.png', 'charged_0.png',
                'active_0.png', 'recovery_0.png',
            }
            self.assertEqual(set(metadata['frames']), expected)
            self.assertEqual(metadata['meta']['image'], 'magma_trap.png')
            with Image.open(atlas_png) as atlas:
                self.assertEqual(atlas.size, (648, 128))
            for name in expected:
                with Image.open(root / 'frames' / name) as frame:
                    self.assertEqual(frame.size, (128, 128))
                    self.assertEqual(frame.mode, 'RGBA')
                    self.assertIsNotNone(frame.getchannel('A').getbbox())


if __name__ == '__main__':
    unittest.main()
