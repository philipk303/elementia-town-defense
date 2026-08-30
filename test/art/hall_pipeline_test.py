import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / 'tools' / 'art' / 'hall_pipeline.py'


def load_pipeline():
    spec = importlib.util.spec_from_file_location('hall_pipeline', PIPELINE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HallPipelineTest(unittest.TestCase):
    def test_writes_non_empty_64px_rgba_static_image_with_transparency(self):
        pipeline = load_pipeline()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.png'
            image = Image.new('RGB', (256, 256), '#ff00ff')
            ImageDraw.Draw(image).rectangle((48, 24, 208, 232), fill='#9a4f28')
            image.save(source)

            output = root / 'hall.png'
            pipeline.write_hall(source, output)

            with Image.open(output) as packaged:
                self.assertEqual(packaged.size, (64, 64))
                self.assertEqual(packaged.mode, 'RGBA')
                alpha = packaged.getchannel('A')
                self.assertIsNotNone(alpha.getbbox())
                self.assertEqual(alpha.getpixel((0, 0)), 0)


if __name__ == '__main__':
    unittest.main()
