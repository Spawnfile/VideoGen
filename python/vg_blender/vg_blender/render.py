"""Blender preview stills (spec §7.5): a few EEVEE frames from the built .blend. Run with --disable-autoexec (the .blend
came from agent-written code) and only on the NVIDIA GPU (gpu.platform.renderer_get must say NVIDIA)."""
import argparse
import os
import sys

import bpy
import gpu


def main(argv):
    ap = argparse.ArgumentParser(prog="vg_blender.render")
    ap.add_argument("--blend", required=True)
    ap.add_argument("--frames", required=True, help="comma separated frame numbers")
    ap.add_argument("--out", required=True)
    ap.add_argument("--scale", type=int, default=50)
    ap.add_argument("--samples", type=int, default=16)
    ap.add_argument("--allow-any-gpu", action="store_true", help="tests only")
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=a.blend, load_ui=False)
    s = bpy.context.scene
    s.render.resolution_percentage = a.scale
    s.eevee.taa_render_samples = a.samples
    # Transparent like the final frames (spec §7.5: RGBA; the backdrop is drawn later in the channel style's exact colours,
    # which the AgX view transform would otherwise shift).
    s.render.film_transparent = True
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    os.makedirs(a.out, exist_ok=True)
    frames = [int(x) for x in a.frames.split(",") if x != ""]
    for i, f in enumerate(frames):
        s.frame_set(f)
        s.render.filepath = os.path.join(a.out, f"f{f:05d}.png")
        bpy.ops.render.render(write_still=True)
        if i == 0:
            # The GPU module initialises with the first render (renderer_get raises before it).
            renderer = gpu.platform.renderer_get()
            print("VG_RENDERER", renderer, flush=True)
            if "NVIDIA" not in renderer and not a.allow_any_gpu:
                print(f"VG_ERROR GPU NVIDIA değil: {renderer}", flush=True)
                return 3
        print(f"VG_PROGRESS {i + 1} {len(frames)}", flush=True)
    return 0
