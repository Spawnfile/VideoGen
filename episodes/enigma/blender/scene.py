"""Enigma — "Bu makinenin minicik bir zaafı vardı" (bölüm 8: nesne + hikâye + yapay zekâ seslendirme).

Çalıştırma (proje kökünden):
    blender-gpu -b --factory-startup -P blender/scene.py                               # .blend + anchors.json
    blender-gpu -b --factory-startup -P blender/scene.py -- --preview [--frames 1,300]  # ön izleme (%50, 16 örnek)
    blender-gpu -b --factory-startup -P blender/scene.py -- --draft                     # tüm animasyon %25 → out/draft
    blender-gpu -b --factory-startup -P blender/scene.py -- --anchors-only
Tek dünya, 1 birim = 1 cm. Zaman çizelgesini seslendirme belirler (timeline.json/captions.json → animate.T).
"""
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import enigma_assets as A  # noqa: E402
import animate as AN  # noqa: E402
import build  # noqa: E402
from common import B, FRAMES, H, OUT, W, build_materials, empty, interp, key, link, reset_scene  # noqa: E402

T = AN.T


def make_cam(name, lens, clip=(0.05, 400)):
    target = empty(f"{name}Hedef")
    rig = empty(f"{name}Rig")
    c = rig.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.clip_start, cd.clip_end = lens, *clip
    cam = link(bpy.data.objects.new(name, cd), rig)

    def shot(frame, t, size, elev=20, azim=0):
        half = math.atan(18 / cd.lens)
        d = size / 2 / math.tan(half)
        key(target, frame, loc=Vector(t))
        key(rig, frame, loc=Vector(t) + cam_dir(elev, azim) * d)

    return cam, shot


def cam_dir(elev, azim):
    """azim 0 → kamera −Y'de; −90 → önde (−X); −120 → ön-sol (operatörün solu)."""
    e, a = math.radians(elev), math.radians(azim)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


HOOK = dict(t=(-1.0, 0.0, 16.0), size=64.0, elev=36, azim=-104)


def wpos(scene, objname, frame, local=(0, 0, 0)):
    scene.frame_set(frame)
    return bpy.data.objects[objname].matrix_world @ Vector(local)


def camera_keys(scene, P):
    interp("BEZIER")
    cam, s = make_cam("Kamera", 50)
    s(1, **HOOK)
    b0 = AN.word("s03", "İkinci")
    s(B(b0), (-1.0, 0.0, 16.0), 68.0, 32, -110)
    k0 = AN.word("s04", "Ayarlar")
    s(B(k0 + 24), (7.0, 0.0, 13.0), 36.0, 46, -112)
    s(B(T["EXPLODE"][0] - 16), (7.0, 0.0, 13.0), 32.0, 48, -104)
    s(B(T["EXPLODE"][0]), (0.0, 0.0, 16.0), 70.0, 30, -112)
    s(B(T["EXPLODE"][1]), (0.0, 0.0, 19.0), 98.0, 22, -118)
    s(B(T["DIVE"][0] - 4), (0.0, 0.0, 19.0), 96.0, 22, -124)
    gc = wpos(scene, "RotorGrup", B(T["SPREAD"][1]))
    s(B(T["DIVE"][1]), gc + Vector((0, 0, 4.0)), 30.0, 16, -120)
    s(B(T["SPREAD"][1]), gc + Vector((0, 0, 5.0)), 31.0, 14, -112)
    s(B(T["PRESSES"][-1] + 8), gc + Vector((0, 0, 5.0)), 30.0, 14, -104)
    uk = wpos(scene, "UKW", B(T["AHA"][0] + 10))
    s(B(T["AHA"][0] + 12), uk + Vector((0, 0, -2.0)), 30.0, 22, -100)
    s(B(T["AHA"][1]), uk + Vector((0, 0, -2.0)), 28.0, 24, -96)
    s(B(T["SOLVE_IN"][1]), (2.0, 0.0, 10.0), 58.0, 50, -108)
    s(B(T["BOMBE"][1]), (3.0, 0.0, 10.0), 52.0, 54, -100)
    s(B(T["CLOSE"][1] + 10), (-1.0, 0.0, 16.0), 68.0, 30, -96)
    s(B(T["CTA"][0]), (-1.0, 0.0, 16.0), 66.0, 34, -108)
    s(FRAMES - 6, **HOOK)
    s(FRAMES, **HOOK)
    scene.camera = cam
    return cam


def build_world_and_lights():
    w = bpy.data.worlds.new("Studyo")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.04, 0.045, 0.06, 1)
    ramp.color_ramp.elements.new(0.5).color = (0.25, 0.27, 0.32, 1)
    ramp.color_ramp.elements[2].position = 0.85
    ramp.color_ramp.elements[2].color = (1.6, 1.65, 1.8, 1)
    remap = nt.nodes.new("ShaderNodeMath")
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = remap.inputs[2].default_value = 0.5
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], remap.inputs[0])
    nt.links.new(remap.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0

    def sun(name, rot, energy, color, angle=8):
        Lt = bpy.data.lights.new(name, "SUN")
        Lt.energy, Lt.color, Lt.angle = energy, color, math.radians(angle)
        o = link(bpy.data.objects.new(name, Lt))
        o.rotation_euler = [math.radians(a) for a in rot]

    sun("Ana", (40, 0, -150), 4.0, (1.0, 0.96, 0.9))          # ön-sol üstten
    sun("Dolgu", (65, 0, -60), 1.4, (0.9, 0.95, 1.0), angle=20)
    sun("KenarSol", (75, 0, 40), 3.0, (0.55, 0.8, 1.0), angle=3)
    sun("KenarSag", (72, 0, 150), 2.4, (1.0, 0.72, 0.5), angle=3)
    sun("Ust", (5, 0, 0), 1.6, (1.0, 0.98, 0.95), angle=15)


# ---------------------------------------------------------------- çapalar

def anchor_specs(P):
    lamp = {ch: A.letter_pos(A.LAMP_ROWS, ch) for ch in A.ALPHA}
    rc = 2.3
    sp = {
        "keyA": ("TusA_Pivot", (0, 0, 13.0)),
        "rotorcover": ("Katman_Ust", (9.5, 1.4, 13.2)),
        "keys": ("Katman_Tuslar", (-5.0, -4.0, 13.2)),
        "plug": ("Katman_Priz", (-15.0, 0.1, 9.0)),
        "plugA": ("Katman_Priz", (-15.0, 8.05, 9.0)),
        "lampboard": ("Katman_Lambalar", (0.9, -6.0, 11.8)),
        "rotors": ("Yuva_R1", (0, -3.3, 0)),
        "etw": ("Yuva_ETW", (0, -2.3, 0)),
        "r2": ("Yuva_R2", (0, -2.3, 0)),
        "r1": ("Yuva_R1", (0, -2.3, 0)),
        "r0": ("Yuva_R0", (0, -2.3, 0)),
        "ukw": ("Yuva_UKW", (0, -2.3, 0)),
        "etw_c": ("Yuva_ETW", (rc, 0, 0)),
        "r2_c": ("Yuva_R2", (rc, 0, 0)),
        "r1_c": ("Yuva_R1", (rc, 0, 0)),
        "r0_c": ("Yuva_R0", (rc, 0, 0)),
        "ukw_c": ("Yuva_UKW", (rc, 0, 0)),
        "ukw_rim": ("Yuva_UKW", (0, -3.4, 0.3)),
        "print": ("Baski", (0, 0, 0.1)),
        "machine": ("Katman_Ust", (2.0, 0.0, 13.0)),
    }
    for ch, p in lamp.items():
        sp[f"lamp{ch}"] = ("Katman_Lambalar", tuple(p + Vector((0, 0, 1.0))))
    return sp


def export_anchors(scene, cam, P, windows):
    specs = anchor_specs(P)
    E = {}
    scene.frame_set(1)
    for k, (parent, lp) in specs.items():
        e = empty(f"Capa_{k}", bpy.data.objects[parent])
        e.location = Vector(lp)
        E[k] = e
    events = [{k: v for k, v in ev.items() if k != "path"} for ev in AN.EVENTS]
    data = {"fps": 30, "frames": FRAMES, "timeline": T, "events": events, "signalWindows": windows,
            "anchors": {k: [] for k in E}}
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        for k, e in E.items():
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            data["anchors"][k].append([round(co.x * W, 1), round((1 - co.y) * H, 1)] if co.z > 0 else [-999, -999])
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    scene.frame_end = FRAMES
    M = build_materials()
    P = build.build_model(M)
    AN.animate(P, M, scene)
    windows = AN.signal_wires(P, M)
    cam = camera_keys(scene, P)
    build_world_and_lights()
    if "--no-anchors" not in argv:
        export_anchors(scene, cam, P, windows)
    if "--anchors-only" in argv:
        return
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "enigma.blend"))
    if "--preview" in argv:
        frames = [int(a) for a in argv[argv.index("--frames") + 1].split(",")] if "--frames" in argv else \
            [1, 20, 200, 430, 470, 520, 600, 690, 720, 800, 880, 960, 1240, 1350, 1480, FRAMES]
        scene.render.resolution_percentage = 50
        scene.eevee.taa_render_samples = 16
        for f in frames:
            scene.frame_set(f)
            scene.render.filepath = os.path.join(OUT, "preview", f"f{f:04d}.png")
            bpy.ops.render.render(write_still=True)
    if "--draft" in argv:
        scene.render.resolution_percentage = 25
        scene.eevee.taa_render_samples = 4
        scene.eevee.use_raytracing = False
        scene.render.filepath = os.path.join(OUT, "draft", "")
        bpy.ops.render.render(animation=True)


main()
