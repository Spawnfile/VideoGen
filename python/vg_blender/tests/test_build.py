import math
import json
import os
import shutil
import tempfile
import unittest

from vg_blender import build

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(ROOT))
FX = os.path.join(REPO, "tests", "fixtures", "artifacts")
STYLE = {"id": "yaklasim", "background": {"top": "#1a2546", "bottom": "#070a14"}, "lighting": "yaklasim"}


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
        last = str(self.spec["frames"])  # the 13 s YAKLASIM pen: 390
        self.assertEqual(set(anchors["frames"][last]), {p["id"] for p in self.spec["parts"]})
        for q in ("0", "97", "195", "292", last):
            self.assertIn(q, anchors["frames"])
        with open(os.path.join(out, "camera_track.json")) as f:
            self.assertEqual(len(json.load(f)["yfov"]), self.spec["frames"] + 1)
        with open(os.path.join(out, "events.json")) as f:
            events = json.load(f)["events"]
            types = {e["type"] for e in events}
        self.assertTrue(all(e["frame"] >= 0 for e in events))
        self.assertTrue({"explode_start", "part_lock", "label_in", "zoom"} <= types)
        self.assertGreaterEqual(r["hero_ratio"], 0.35)
        self.assertGreater(r["triangles"], 0)

    def test_parts_reassemble_and_spin_and_lock_when_they_snap_back(self):
        import bpy
        from vg_blender import stage
        stage.reset(300)
        root = bpy.data.objects.new("p_root", None)
        bpy.context.scene.collection.objects.link(root)
        spec = {"parts": [{"id": "p", "explode": {"vector": [6, 0, 0], "t_start": -1, "t_end": 1, "ease": "linear",
                                                   "back": {"t_start": 6, "t_end": 8, "ease": "linear"}},
                           "spin": {"axis": "z", "degrees": 90, "t_start": 2, "t_end": 4, "ease": "linear"}}]}
        build.animate_parts(spec, {"p": root}, 30, 300)
        sc = bpy.context.scene
        sc.frame_set(0)
        self.assertAlmostEqual(root.location.x, 3, places=4)
        sc.frame_set(120)
        self.assertAlmostEqual(root.location.x, 6, places=4)
        self.assertAlmostEqual(root.rotation_euler.z, math.radians(90), places=4)
        sc.frame_set(240)
        self.assertAlmostEqual(root.location.x, 0, places=4)
        ev = build.events_manifest({"parts": spec["parts"], "camera_keys": []}, {"beats": []}, 30)["events"]
        self.assertIn({"id": "part_lock:p", "type": "part_lock", "frame": 240, "part_id": "p"}, ev)
        # A burst already under way at frame 0 (YAKLASIM) starts on frame 0, never before it (events.json frames are ≥ 0).
        self.assertIn({"id": "explode_start:p", "type": "explode_start", "frame": 0, "part_id": "p"}, ev)

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
