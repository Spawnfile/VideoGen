"""blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P python/vg_blender/render_cli.py -- --blend … --frames 0,30 --out …"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vg_blender import render  # noqa: E402

sys.exit(render.main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
