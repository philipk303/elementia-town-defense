import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'tools' / 'art' / 'muddy_bog_pipeline.py'


def load_pipeline():
    spec = importlib.util.spec_from_file_location('muddy_bog_pipeline', PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MuddyBogPipelineTest(unittest.TestCase):
    def test_writes_three_state_phaser_atlas_from_state_sources(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for index, state in enumerate(('idle', 'entry', 'root')):
                image = Image.new('RGB', (256, 256), '#ff00ff')
                draw = ImageDraw.Draw(image)
                draw.rectangle((30, 55, 225, 225), fill=('#6c4a27', '#785026', '#4d351f')[index])
                image.save(root / f'{state}_0.png')

            atlas_png, atlas_json = root / 'muddy_bog.png', root / 'muddy_bog.json'
            pipeline.write_atlas(root, root / 'frames', atlas_png, atlas_json)

            metadata = json.loads(atlas_json.read_text(encoding='utf-8'))
            self.assertEqual(set(metadata['frames']), {'idle_0.png', 'entry_0.png', 'root_0.png'})
            with Image.open(atlas_png) as atlas:
                self.assertEqual(atlas.size, (196, 64))
            self.assertTrue(all((root / 'frames' / name).exists() for name in metadata['frames']))


if __name__ == '__main__':
    unittest.main()
