import math
import unittest

from vg_blender import motion


class MotionTest(unittest.TestCase):
    def test_eases_start_at_zero_end_at_one_and_clamp(self):
        for kind in motion.EASES:
            self.assertAlmostEqual(motion.ease(kind, 0), 0, places=9)
            self.assertAlmostEqual(motion.ease(kind, 1), 1, places=9)
            self.assertAlmostEqual(motion.ease(kind, 2), 1, places=9)
        self.assertGreater(max(motion.ease("back_out", x / 100) for x in range(101)), 1.0)  # overshoot
        with self.assertRaises(ValueError):
            motion.ease("bounce", 0.5)

    def test_explode_offset_holds_before_and_after(self):
        e = {"vector": [3, 0, -2], "t_start": 2, "t_end": 4, "ease": "linear"}
        self.assertEqual(motion.explode_offset(e, 1), (0, 0, 0))
        self.assertEqual(motion.explode_offset(e, 3), (1.5, 0, -1))
        self.assertEqual(motion.explode_offset(e, 9), (3, 0, -2))

    def test_explode_back_returns_home_and_a_negative_start_is_mid_burst_at_zero(self):
        e = {"vector": [4, 0, 0], "t_start": -1, "t_end": 1, "ease": "linear", "back": {"t_start": 5, "t_end": 7, "ease": "linear"}}
        self.assertEqual(motion.explode_offset(e, 0), (2, 0, 0))  # YAKLASIM spec Y12: frame 0 already bursting
        self.assertEqual(motion.explode_offset(e, 3), (4, 0, 0))
        self.assertEqual(motion.explode_offset(e, 6), (2, 0, 0))
        self.assertEqual(motion.explode_offset(e, 7), (0, 0, 0))
        self.assertEqual(motion.explode_offset(e, 12), (0, 0, 0))

    def test_spin_angle_holds_before_and_after(self):
        s = {"axis": "z", "degrees": 90, "t_start": 2, "t_end": 4, "ease": "linear"}
        self.assertEqual(motion.spin_angle(s, 1), 0)
        self.assertEqual(motion.spin_angle(s, 3), 45)
        self.assertEqual(motion.spin_angle(s, 9), 90)
        self.assertEqual(motion.spin_angle(None, 3), 0)

    def test_camera_interpolates_segments_with_the_starting_keys_ease(self):
        keys = [
            {"t": 0, "position": [0, -10, 0], "target": [0, 0, 0], "lens_mm": 50, "ease": "linear"},
            {"t": 10, "position": [10, -10, 0], "target": [0, 0, 0], "lens_mm": 100, "ease": "linear"},
        ]
        c = motion.camera_at(keys, 5)
        self.assertEqual(c["position"], (5, -10, 0))
        self.assertEqual(c["lens_mm"], 75)
        self.assertEqual(motion.camera_at(keys, 20)["position"], (10, -10, 0))

    def test_vertical_fov_of_a_portrait_frame(self):
        self.assertAlmostEqual(motion.yfov(36), 2 * math.atan(0.5), places=12)
