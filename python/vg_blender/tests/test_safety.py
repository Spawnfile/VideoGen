import os
import unittest

from vg_blender import safety

EXAMPLE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "examples", "kalem", "product.py")


class SafetyTest(unittest.TestCase):
    def test_example_product_passes(self):
        with open(EXAMPLE, encoding="utf-8") as f:
            self.assertEqual(safety.check_product_source(f.read()), [])

    def test_rejects_imports_files_dunders_and_format_with_line_numbers(self):
        src = "import os\nfrom subprocess import run\n\ndef build(vg):\n    open('/etc/passwd')\n    x = vg.__class__\n    y = '{0.a}'.format(vg)\n    getattr(vg, 'box')\n"
        problems = "\n".join(safety.check_product_source(src))
        for needle in ("satır 1: yalnızca 'math'", "satır 2:", "satır 5: 'open'", "satır 6: '.__class__'", "satır 7: '.format'", "satır 8: 'getattr'"):
            self.assertIn(needle, problems)

    def test_requires_build_and_valid_syntax(self):
        self.assertIn("build(vg)", safety.check_product_source("x = 1\n")[0])
        self.assertIn("sözdizimi", safety.check_product_source("def build(vg)\n  pass\n")[0])
        self.assertTrue(safety.check_product_source("class A:\n    pass\ndef build(vg):\n    pass\n"))

    def test_runs_with_math_but_without_dangerous_builtins(self):
        seen = {}

        class Probe:
            def note(self, v):
                seen["v"] = v

        safety.run_product("import math\n\ndef build(vg):\n    vg.note(round(math.pi, 2))\n", Probe())
        self.assertEqual(seen["v"], 3.14)
        self.assertNotIn("open", safety.safe_globals()["__builtins__"])
        with self.assertRaises(safety.ProductError):
            safety.run_product("import os\n\ndef build(vg):\n    pass\n", Probe())
