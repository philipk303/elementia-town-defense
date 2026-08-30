import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'tools' / 'art' / 'grinder_pipeline.py'


def load_pipeline():
    spec = importlib.util.spec_from_file_location('grinder_pipeline', PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GrinderPipelineTest(unittest.TestCase):
    def test_writes_four_named_128px_state_frames_and_atlas(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            concept = root / 'concept.png'
            image = Image.new('RGB', (256, 256), '#ff00ff')
            ImageDraw.Draw(image).ellipse((32, 32, 224, 224), fill='#7ea982')
            image.save(concept)
            atlas_png, atlas_json = root / 'grinder.png', root / 'grinder.json'
            pipeline.write_atlas(concept, root / 'frames', atlas_png, atlas_json)
            metadata = json.loads(atlas_json.read_text(encoding='utf-8'))
            expected = {'idle_0.png', 'intake_0.png', 'crush_0.png', 'release_0.png'}
            self.assertEqual(set(metadata['frames']), expected)
            self.assertEqual(metadata['meta']['image'], 'grinder.png')
            with Image.open(atlas_png) as atlas:
                self.assertEqual(atlas.size, (518, 128))
            for name in expected:
                with Image.open(root / 'frames' / name) as frame:
                    self.assertEqual(frame.size, (128, 128))
                    self.assertEqual(frame.mode, 'RGBA')
                    self.assertIsNotNone(frame.getchannel('A').getbbox())


if __name__ == '__main__':
    unittest.main()
