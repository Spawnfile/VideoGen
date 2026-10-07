import contextlib
import io
import os
import shutil
import tempfile
import unittest

import bpy

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

    def test_complete_png_rejects_truncated_and_foreign_files(self):
        d = tempfile.mkdtemp(prefix="vgp-")
        try:
            good = os.path.join(d, "a.png")
            img = bpy.data.images.new("vgp", 4, 4, alpha=True)
            img.filepath_raw = good
            img.file_format = "PNG"
            img.save()
            self.assertTrue(render.complete_png(good))
            with open(good, "rb") as f:
                data = f.read()
            cut = os.path.join(d, "b.png")
            with open(cut, "wb") as f:
                f.write(data[: len(data) // 2])
            self.assertFalse(render.complete_png(cut))
            txt = os.path.join(d, "c.png")
            with open(txt, "w") as f:
                f.write("not a png at all, but long enough to have a tail of twelve bytes ......")
            self.assertFalse(render.complete_png(txt))
            self.assertFalse(render.complete_png(os.path.join(d, "missing.png")))
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_final_frames_are_transparent_rgba_and_a_rerun_skips_complete_ones(self):
        d = tempfile.mkdtemp(prefix="vgf-")
        try:
            spec = load("scene-kalem.json")
            blend = os.path.join(d, "product.blend")
            self.assertTrue(build.product_phase(spec, product(), blend)["ok"])
            self.assertTrue(build.build_phase(spec, load("storyboard-kalem.json"), STYLE, blend, os.path.join(d, "out"))["ok"])
            out = os.path.join(d, "frames")
            args = ["--blend", os.path.join(d, "out", "scene.blend"), "--out", out, "--start", "0", "--end", "2", "--scale", "10", "--samples", "4"]
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(render.final_main(args), 0)
            self.assertIn("VG_SKIPPED 0", buf.getvalue())
            self.assertIn("VG_PROGRESS 3 3", buf.getvalue())
            self.assertEqual(sorted(os.listdir(out)), ["f00000.png", "f00001.png", "f00002.png"])
            img = bpy.data.images.load(os.path.join(out, "f00000.png"))
            self.assertEqual(img.channels, 4)
            self.assertEqual((img.size[0], img.size[1]), (108, 192))
            self.assertEqual(img.pixels[3], 0.0)  # bottom-left corner: transparent (the backdrop comes from the style later)
            first = os.path.getmtime(os.path.join(out, "f00000.png"))
            with open(os.path.join(out, "f00001.png"), "r+b") as f:
                f.truncate(40)  # a render killed mid-write
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(render.final_main(args), 0)
            self.assertIn("VG_SKIPPED 2", buf.getvalue())
            self.assertEqual(os.path.getmtime(os.path.join(out, "f00000.png")), first)
            self.assertTrue(render.complete_png(os.path.join(out, "f00001.png")))
        finally:
            shutil.rmtree(d, ignore_errors=True)
