"""Bir render geçişi: blender-gpu -b out/saat.blend -P render_pass.py -- full|top|bot [--draft] [--range a,b]

full → KameraTam 1080×1920, FULL_RANGES ; top/bot → KameraUst/KameraAlt 1080×960, PANEL_RANGE.
Çıkış: remotion/public/frames/<geçiş>/####.png (Blender kare numarası) ; --draft → blender/out/draft/<geçiş>/ (%25).
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:]
name = argv[0]
draft = "--draft" in argv
FULL_RANGES = ((0, 112), (884, 989))
PANEL_RANGE = (96, 912)
CAM = {"full": "KameraTam", "top": "KameraUst", "bot": "KameraAlt"}

s = bpy.context.scene
cam = bpy.data.objects[CAM[name]]
s.camera = cam
s.render.resolution_x, s.render.resolution_y = (1080, 1920) if name == "full" else (1080, 960)
if draft:
    s.render.resolution_percentage = 25
    s.eevee.taa_render_samples = 4
    s.eevee.use_raytracing = False
    out = os.path.join(HERE, "out", "draft", name, "")
else:
    out = os.path.join(HERE, "..", "remotion", "public", "frames", name, "")
s.render.filepath = os.path.abspath(out) + "/"
if "--range" in argv:
    a, b = [int(x) for x in argv[argv.index("--range") + 1].split(",")]
    ranges = ((a, b),)
else:
    ranges = FULL_RANGES if name == "full" else (PANEL_RANGE,)
for a, b in ranges:
    s.frame_start, s.frame_end = a + 1, b + 1
    bpy.ops.render.render(animation=True)
