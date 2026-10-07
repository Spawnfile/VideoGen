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

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def complete_png(path):
    """A PNG written to the end: the signature at the start and the IEND chunk at the tail (plan E5: resume skips only these)."""
    try:
        if os.path.getsize(path) < 57:
            return False
        with open(path, "rb") as f:
            head = f.read(8)
            f.seek(-12, os.SEEK_END)
            tail = f.read(12)
        return head == PNG_SIGNATURE and tail[4:8] == b"IEND"
    except OSError:
        return False


def final_main(argv):
    """Spec §7.5 Blender final: the .blend's own EEVEE settings (64 samples, raytracing, AgX Punchy), transparent RGBA PNGs.
    Frames that already have a complete PNG are skipped (a restarted worker continues, plan E5); each frame is written to a
    temporary name and renamed, so a killed render never leaves a complete-looking file."""
    ap = argparse.ArgumentParser(prog="vg_blender.final")
    ap.add_argument("--blend", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--end", type=int, required=True)
    ap.add_argument("--samples", type=int, default=0, help="0: the .blend's own (64); 32 on the low-memory retry (spec §14)")
    ap.add_argument("--scale", type=int, default=100, help="tests only")
    ap.add_argument("--allow-any-gpu", action="store_true", help="tests only")
    a = ap.parse_args(argv)
    frames = list(range(a.start, a.end + 1))
    os.makedirs(a.out, exist_ok=True)
    path = lambda f: os.path.join(a.out, f"f{f:05d}.png")  # noqa: E731
    todo = [f for f in frames if not complete_png(path(f))]
    done = len(frames) - len(todo)
    print(f"VG_SKIPPED {done}", flush=True)
    if todo:
        bpy.ops.wm.open_mainfile(filepath=a.blend, load_ui=False)
        s = bpy.context.scene
        s.render.resolution_percentage = a.scale
        if a.samples:
            s.eevee.taa_render_samples = a.samples
        s.render.film_transparent = True
        s.render.image_settings.file_format = "PNG"
        s.render.image_settings.color_mode = "RGBA"
        s.render.image_settings.color_depth = "8"
        s.render.image_settings.compression = 15
        for i, f in enumerate(todo):
            s.frame_set(f)
            tmp = os.path.join(a.out, f".f{f:05d}.tmp.png")
            s.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            if i == 0:
                renderer = gpu.platform.renderer_get()
                print("VG_RENDERER", renderer, flush=True)
                if "NVIDIA" not in renderer and not a.allow_any_gpu:
                    os.remove(tmp)
                    print(f"VG_ERROR GPU NVIDIA değil: {renderer}", flush=True)
                    return 3
            os.replace(tmp, path(f))
            done += 1
            print(f"VG_PROGRESS {done} {len(frames)}", flush=True)
        print(f"VG_SAMPLES {s.eevee.taa_render_samples}", flush=True)
    return 0
