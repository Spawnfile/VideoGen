"""blender -b --factory-startup --python-exit-code 1 -P python/vg_blender/build_cli.py -- --spec … --storyboard … --style … --product … --out …"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vg_blender import build  # noqa: E402

sys.exit(build.main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
