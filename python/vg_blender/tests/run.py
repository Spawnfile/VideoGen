"""Blender-side test runner: blender -b --factory-startup --python-exit-code 1 -P python/vg_blender/tests/run.py"""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
suite = unittest.defaultTestLoader.discover(HERE, pattern="test_*.py", top_level_dir=os.path.dirname(HERE))
result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(0 if result.wasSuccessful() else 1)
