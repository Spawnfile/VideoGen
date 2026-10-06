import os
import shutil
import tempfile
import unittest

from tests.test_build import FX, STYLE, load, product
from vg_blender import build, render


class RenderTest(unittest.TestCase):
    def test_preview_stills_render_on_the_nvidia_gpu(self):
        d = tempfile.mkdtemp(prefix="vgr-")
        try:
            spec = load("scene-kalem.json")
            blend = os.path.join(d, "product.blend")
            self.assertTrue(build.product_phase(spec, product(), blend)["ok"])
            self.assertTrue(build.build_phase(spec, load("storyboard-kalem.json"), STYLE, blend, os.path.join(d, "out"))["ok"])
            code = render.main(["--blend", os.path.join(d, "out", "scene.blend"), "--frames", "0,675", "--out", os.path.join(d, "stills"), "--scale", "25", "--samples", "4"])
            self.assertEqual(code, 0)
            self.assertEqual(sorted(os.listdir(os.path.join(d, "stills"))), ["f00000.png", "f00675.png"])
        finally:
            shutil.rmtree(d, ignore_errors=True)
