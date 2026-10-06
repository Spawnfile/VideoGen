import json
import os
import shutil
import tempfile
import unittest

from vg_blender import build

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(ROOT))
FX = os.path.join(REPO, "tests", "fixtures", "artifacts")
STYLE = {"id": "gece_mavisi", "background": {"top": "#16203a", "bottom": "#070a14"}, "lighting": "key_rim_cool"}


def load(name):
    with open(os.path.join(FX, name), encoding="utf-8") as f:
        return json.load(f)


def product():
    with open(os.path.join(ROOT, "examples", "kalem", "product.py"), encoding="utf-8") as f:
        return f.read()


class BuildTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="vgb-")
        self.spec, self.board = load("scene-kalem.json"), load("storyboard-kalem.json")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def two_phases(self, src):
        blend = os.path.join(self.dir, "product.blend")
        p = build.product_phase(self.spec, src, blend)
        if not p["ok"]:
            return p
        return build.build_phase(self.spec, self.board, STYLE, blend, os.path.join(self.dir, "out"))

    def test_the_example_pen_builds_with_manifests_and_glb(self):
        r = self.two_phases(product())
        self.assertTrue(r["ok"], r["errors"])
        out = os.path.join(self.dir, "out")
        for f in ("scene.glb", "scene.blend", "anchors.json", "events.json", "camera_track.json"):
            self.assertGreater(os.path.getsize(os.path.join(out, f)), 0, f)
        with open(os.path.join(out, "anchors.json")) as f:
            anchors = json.load(f)
        self.assertEqual(set(anchors["frames"]["1350"]), {p["id"] for p in self.spec["parts"]})
        for q in ("0", "337", "675", "1012", "1350"):
            self.assertIn(q, anchors["frames"])
        with open(os.path.join(out, "camera_track.json")) as f:
            self.assertEqual(len(json.load(f)["yfov"]), 1351)
        with open(os.path.join(out, "events.json")) as f:
            types = {e["type"] for e in json.load(f)["events"]}
        self.assertTrue({"explode_start", "part_lock", "label_in", "zoom"} <= types)
        self.assertGreaterEqual(r["hero_ratio"], 0.35)
        self.assertGreater(r["triangles"], 0)

    def test_missing_and_extra_parts_fail_the_build(self):
        src = product().replace('vg.part("yay", vg.spring(0.18, 0.02, 12, 1.8).move(z=1.2))', 'vg.part("kapak", vg.box((1, 1, 1)))')
        r = self.two_phases(src)
        self.assertFalse(r["ok"])
        self.assertEqual(r["missing_parts"], ["yay"])
        self.assertEqual(r["extra_parts"], ["kapak"])

    def test_product_errors_point_at_the_line_and_unsafe_code_never_runs(self):
        r = self.two_phases("def build(vg):\n    vg.part('govde', vg.box((1, 1)))\n")
        self.assertFalse(r["ok"])
        self.assertIn("satır 2", r["errors"][0])
        r = self.two_phases("import os\n\ndef build(vg):\n    os.system('touch /tmp/x')\n")
        self.assertIn("satır 1", r["errors"][0])

    def test_phase_two_ignores_anything_phase_one_adds_besides_parts(self):
        blend = os.path.join(self.dir, "product.blend")
        self.assertTrue(build.product_phase(self.spec, product(), blend)["ok"])
        import bpy

        bpy.ops.wm.open_mainfile(filepath=blend, load_ui=False)
        cam = bpy.data.objects.new("rogue_cam", bpy.data.cameras.new("rogue_cam"))
        bpy.context.scene.collection.objects.link(cam)
        bpy.ops.wm.save_as_mainfile(filepath=blend)
        r = build.build_phase(self.spec, self.board, STYLE, blend, os.path.join(self.dir, "out"))
        self.assertTrue(r["ok"], r["errors"])
        self.assertNotIn("rogue_cam", [o.name for o in bpy.context.scene.objects])
        self.assertEqual(bpy.context.scene.camera.name, "vg_camera")
