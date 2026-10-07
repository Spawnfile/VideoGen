"""blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P python/vg_blender/final_cli.py -- --blend … --out … --end 1350"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vg_blender import render  # noqa: E402

sys.exit(render.final_main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
