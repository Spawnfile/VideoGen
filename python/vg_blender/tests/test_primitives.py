import unittest

import bpy
from mathutils import Vector

from vg_blender import materials, stage
from vg_blender.api import Shape, Vg


def size(shape):
    o = shape._obj
    bpy.context.view_layer.update()
    xs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return tuple(round(max(v[i] for v in xs) - min(v[i] for v in xs), 3) for i in range(3))


class PrimitivesTest(unittest.TestCase):
    def setUp(self):
        stage.reset(60)
        self.vg = Vg()

    def test_every_builder_makes_a_closed_mesh_with_the_requested_size(self):
        vg = self.vg
        shapes = {
            "lathe": vg.lathe([(0.0, 0.0), (1.0, 0.0), (1.0, 4.0), (0.0, 4.0)]),
            "box": vg.box((2, 3, 4), bevel=0.1),
            "cylinder": vg.cylinder(1.0, 5.0),
            "sphere": vg.sphere(0.5),
            "tube": vg.tube(1.0, 0.8, 3.0),
            "spring": vg.spring(0.5, 0.05, 6, 3.0),
            "gear": vg.gear(12, 2.0, 0.5, 0.3, bore=0.4),
            "screw": vg.screw(0.3, 2.0, 0.2, 0.08, head_radius=0.5, head_height=0.2),
            "extrude": vg.extrude([(0, 0), (2, 0), (1, 2)], 0.5),
            "pcb": vg.pcb((4, 3), components=[(0, 0, 1, 1, 0.3)]),
            "wire": vg.wire([(0, 0, 0), (1, 0, 1), (2, 0, 1)], 0.05),
            "mesh": vg.mesh([(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)], [(0, 2, 1), (0, 1, 3), (1, 2, 3), (0, 3, 2)]),
        }
        for name, s in shapes.items():
            self.assertIsInstance(s, Shape, name)
            self.assertGreater(len(s._obj.data.polygons), 0, name)
        self.assertEqual(size(shapes["lathe"])[2], 4.0)
        self.assertEqual(size(shapes["sphere"]), (1.0, 1.0, 1.0))
        self.assertEqual(size(shapes["cylinder"])[2], 5.0)
        self.assertAlmostEqual(size(shapes["spring"])[2], 3.1, places=1)

    def test_parts_group_shapes_under_a_named_empty_and_reject_duplicates(self):
        a = self.vg.box((1, 1, 1)).move(z=2).material("brass")
        b = self.vg.sphere(0.2).copy()
        self.vg.part("govde", a, b)
        root = self.vg._parts["govde"]
        self.assertEqual(root.type, "EMPTY")
        self.assertEqual(sorted(c.name for c in root.children), ["govde__m0", "govde__m1"])
        self.assertEqual(a._obj.data.materials[0].name, "vg_brass")
        with self.assertRaises(ValueError):
            self.vg.part("govde", self.vg.box((1, 1, 1)))
        with self.assertRaises(ValueError):
            self.vg.part("bos")

    def test_material_presets_are_shared_and_unknown_ones_fail(self):
        self.assertIs(materials.material("chrome"), materials.material("chrome"))
        self.assertLess(materials.material("pc_clear").node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value, 1)
        with self.assertRaises(ValueError):
            materials.material("gold_leaf")


class StageTest(unittest.TestCase):
    def test_studio_world_and_three_suns_per_preset(self):
        stage.reset(1350)
        s = bpy.context.scene
        self.assertEqual((s.frame_start, s.frame_end, s.render.fps, s.render.engine), (0, 1350, 30, "BLENDER_EEVEE"))
        stage.world({"background": {"top": "#16203a", "bottom": "#070a14"}})
        self.assertIn("ShaderNodeValToRGB", [n.bl_idname for n in s.world.node_tree.nodes])
        for preset in stage.LIGHTING:
            stage.reset(30)
            self.assertEqual(len(stage.lighting(preset)), 3)
        with self.assertRaises(ValueError):
            stage.lighting("disco")
