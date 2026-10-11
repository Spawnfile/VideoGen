"""Tükenmez kalem — patlatılmış görünüm sahnesi.

Çalıştırma:
    blender-gpu -b --factory-startup -P scene.py              # sahneyi kur, .blend + anchors.json yaz
    blender-gpu -b --factory-startup -P scene.py -- --preview # ayrıca ön izleme karelerini render et

Birim: 1 Blender birimi = 1 cm. Kalem yerel Z ekseni boyunca durur.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

FPS = 30
FRAMES = 720  # 24 sn
W, H = 1080, 1920
TILT = math.radians(-12)  # kalemi kadrajda çaprazlar

# Zaman çizelgesi (kare)
F_CLICK = (18, 24, 30)
F_EXPLODE = (70, 140)
F_ZOOM_IN = (430, 520)
F_ZOOM_OUT = (600, 650)
F_ASSEMBLE = (615, 685)


# ---------------------------------------------------------------- yardımcılar

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.fps = FPS
    s.frame_start, s.frame_end = 1, FRAMES
    s.render.resolution_x, s.render.resolution_y = W, H
    s.render.engine = "BLENDER_EEVEE"
    s.eevee.taa_render_samples = 64
    s.eevee.use_raytracing = True
    s.render.film_transparent = True
    s.view_settings.view_transform = "AgX"
    for look in ("AgX - Punchy", "Punchy"):
        try:
            s.view_settings.look = look
            break
        except TypeError:
            pass
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGBA"
    s.render.filepath = os.path.join(OUT, "frames", "")
    return s


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.5
    e.location = loc
    return link(e, parent)


def lathe(name, profile, mat, parent=None, steps=96, sharp_deg=35):
    """(r, z) profilini Z ekseni etrafında döndürüp kapalı bir gövde üretir."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    if profile[0][0] > 0 and profile[-1][0] > 0:  # eksene değmiyorsa halkayı kapat
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                   angle=2 * math.pi, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), parent)


def box(name, size, loc, mat, parent=None, rot=(0, 0, 0), bevel=0.01):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = link(bpy.data.objects.new(name, me), parent)
    o.location, o.rotation_euler = loc, rot
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments = bevel, 3
        me.shade_smooth()
        m.harden_normals = True
    return o


def material(name, color, metallic=0.0, rough=0.4, alpha=1.0, coat=0.0, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = rough
    p.inputs["Coat Weight"].default_value = coat
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = True
    if emission:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = 1.0
    return m


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def key(obj, frame, loc=None, rot=None):
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert("location", frame=frame)
    if rot is not None:
        obj.rotation_euler = rot
        obj.keyframe_insert("rotation_euler", frame=frame)


def interp(kind):
    bpy.context.preferences.edit.keyframe_new_interpolation_type = kind


# ---------------------------------------------------------------- malzemeler

def build_materials():
    ball = material("Bilye", hex_rgb("#d9dde3"), metallic=1.0, rough=0.08)
    # bilyenin döndüğü görünsün diye üzerinde mürekkep lekeleri
    nt = ball.node_tree
    p = nt.nodes["Principled BSDF"]
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 60.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.58
    ramp.color_ramp.elements[0].color = (*hex_rgb("#d9dde3"), 1)
    ramp.color_ramp.elements[1].position = 0.62
    ramp.color_ramp.elements[1].color = (*hex_rgb("#12308f"), 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])

    return {
        "body": material("Gövde", hex_rgb("#1f6bff"), rough=0.28, coat=0.6),
        "grip": material("Lastik", hex_rgb("#2a2d34"), rough=0.75),
        "chrome": material("Krom", hex_rgb("#e6e8ec"), metallic=1.0, rough=0.12),
        "cam": material("Mekanizma", hex_rgb("#f2efe8"), rough=0.35),
        "steel": material("Çelik", hex_rgb("#b8bec7"), metallic=1.0, rough=0.25),
        "tube": material("Hazne", hex_rgb("#eef3f8"), rough=0.1, alpha=0.18),
        "ink": material("Mürekkep", hex_rgb("#2350e8"), rough=0.2, emission=(0.03, 0.08, 0.35)),
        "brass": material("Pirinç", hex_rgb("#e8b85c"), metallic=1.0, rough=0.18),
        "ball": ball,
    }


# ---------------------------------------------------------------- parçalar

def build_pen(M, root):
    parts = {}

    lower = lathe("AltGovde", [
        (0.17, 0.60), (0.26, 0.60), (0.42, 1.60), (0.50, 2.20), (0.52, 2.30),
        (0.52, 5.50), (0.555, 5.60), (0.555, 6.00), (0.50, 6.05), (0.50, 6.60),
        (0.44, 6.60), (0.44, 2.40), (0.30, 1.70), (0.17, 0.75),
    ], M["body"], root)
    grip = [(0.52, 2.45)]
    z = 2.55
    while z < 5.25:
        grip += [(0.575, z), (0.575, z + 0.12), (0.555, z + 0.18)]
        z += 0.25
    grip += [(0.52, 5.35)]
    lathe("Lastik", grip, M["grip"], lower)
    parts["lower"] = lower

    upper = lathe("UstGovde", [
        (0.50, 6.00), (0.56, 6.00), (0.58, 9.00), (0.56, 12.10), (0.48, 12.40),
        (0.37, 12.40), (0.37, 12.20), (0.46, 12.10), (0.46, 6.70), (0.50, 6.60),
    ], M["body"], root)
    # klips: üstte halka + aşağı inen yaprak + uçta tümsek
    lathe("KlipsHalka", [(0.565, 11.55), (0.62, 11.55), (0.62, 12.05), (0.565, 12.05)],
          M["chrome"], upper)
    box("KlipsYaprak", (0.16, 0.06, 3.9), (0, -0.70, 9.95), M["chrome"], upper, bevel=0.02)
    box("KlipsKopru", (0.16, 0.12, 0.25), (0, -0.66, 11.85), M["chrome"], upper, bevel=0.02)
    tip = box("KlipsUc", (0.16, 0.14, 0.22), (0, -0.66, 8.05), M["chrome"], upper, bevel=0.05)
    parts["upper"] = upper

    button = lathe("Buton", [
        (0.0, 14.05), (0.18, 14.02), (0.29, 13.90), (0.32, 13.65), (0.32, 12.55),
        (0.28, 12.45), (0.22, 12.40), (0.22, 11.88), (0.0, 11.88),
    ], M["body"], root)
    parts["button"] = button

    cam = lathe("Mekanizma", [(0.0, 11.55), (0.29, 11.55), (0.29, 11.86), (0.0, 11.86)],
                M["cam"], root)
    for i in range(8):  # yan kanatçıklar + üst testere dişleri
        a = i * math.tau / 8
        box(f"Kanat{i}", (0.06, 0.07, 0.28), (0.31 * math.cos(a), 0.31 * math.sin(a), 11.70),
            M["cam"], cam, rot=(0, 0, a), bevel=0.01)
        box(f"Dis{i}", (0.10, 0.12, 0.10), (0.20 * math.cos(a), 0.20 * math.sin(a), 11.90),
            M["cam"], cam, rot=(math.radians(35), 0, a + math.pi / 2), bevel=0.01)
    parts["cam"] = cam

    refill = lathe("Hazne", [(0.11, 1.02), (0.14, 1.02), (0.14, 11.50), (0.11, 11.50)],
                   M["tube"], root)
    lathe("Murekkep", [(0.0, 1.05), (0.105, 1.05), (0.105, 8.80), (0.0, 8.80)], M["ink"], refill)
    lathe("PirincUc", [
        (0.0, 0.30), (0.045, 0.28), (0.10, 0.50), (0.10, 0.75), (0.155, 0.85),
        (0.155, 1.10), (0.0, 1.10),
    ], M["brass"], refill)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=(0, 0, 0.25), segments=48, ring_count=24)
    ball = bpy.context.active_object
    ball.name = "Bilye"
    ball.data.materials.append(M["ball"])
    ball.data.shade_smooth()
    ball.parent = refill
    parts["refill"], parts["ball"] = refill, ball

    # yay: tel kesitli sarmal eğri
    curve = bpy.data.curves.new("Yay", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth, curve.bevel_resolution = 0.022, 4
    spl = curve.splines.new("POLY")
    turns, z0, z1, r, n = 9, 1.15, 3.40, 0.19, 9 * 32
    spl.points.add(n)
    for i in range(n + 1):
        t = i / n
        a = t * turns * math.tau
        spl.points[i].co = (r * math.cos(a), r * math.sin(a), z0 + (z1 - z0) * t, 1)
    curve.materials.append(M["steel"])
    parts["spring"] = link(bpy.data.objects.new("Yay", curve), root)

    return parts


# patlatılmış hâldeki ötelemeler (yerel x, z)
EXPLODE = {
    "lower": (2.1, 2.0),
    "upper": (-2.1, 0.6),
    "button": (0.0, 3.6),
    "cam": (0.0, 2.1),
    "spring": (0.0, -3.3),
    "refill": (0.0, 0.0),
}

# etiket çapaları: parça üzerindeki yerel nokta (eksen üstü)
ANCHORS = {
    "button": ("button", (0, 0, 13.3)),
    "cam": ("cam", (0, 0, 11.75)),
    "upper": ("upper", (0, 0, 10.5)),
    "lower": ("lower", (0, 0, 4.0)),
    "refill": ("refill", (0, 0, 7.0)),
    "spring": ("spring", (0, 0, 2.3)),
    "ball": ("ball", (0, 0, 0.25)),
}


def animate(parts, tilt):
    slots = {}
    for name in EXPLODE:
        slots[name] = empty(f"Yuva_{name}", tilt)
        parts[name].parent = slots[name]

    # her parça kendi ekseninde döner; toplu hâlde tek nesne gibi görünür
    interp("LINEAR")
    for name in EXPLODE:
        key(parts[name], 1, rot=(0, 0, 0))
        key(parts[name], FRAMES + 1, rot=(0, 0, 2 * math.tau))  # 2 tam tur → döngüye uygun

    interp("BEZIER")
    for name, obj in slots.items():
        dx, dz = EXPLODE[name]
        home = Vector((0, 0, 0))
        out = Vector((dx, 0, dz))
        for f in (1, F_EXPLODE[0]):
            key(obj, f, loc=home)
        key(obj, F_EXPLODE[1], loc=out)
        key(obj, F_ASSEMBLE[0], loc=out)
        key(obj, F_ASSEMBLE[1], loc=home)

    # açılıştaki "klik"
    b = parts["button"]
    key(b, F_CLICK[0], loc=(0, 0, 0))
    key(b, F_CLICK[1], loc=(0, 0, -0.35))
    key(b, F_CLICK[2], loc=(0, 0, 0))

    # yakın çekimde bilye döner
    ball = parts["ball"]
    key(ball, F_ZOOM_IN[0], rot=(0, 0, 0))
    key(ball, F_ZOOM_OUT[0], rot=(4 * math.tau, 0, 0))


def axis_point(z):
    """Eğik kalemin yerel ekseninde z yüksekliğindeki noktanın dünya konumu."""
    return Vector((z * math.sin(TILT), 0, z * math.cos(TILT)))


def build_camera():
    target = empty("KameraHedefi")
    cam_data = bpy.data.cameras.new("Kamera")
    cam_data.lens = 85
    cam_data.clip_start = 0.01
    cam_data.clip_end = 500
    cam = link(bpy.data.objects.new("Kamera", cam_data))
    c = cam.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    bpy.context.scene.camera = cam

    direction = Vector((0.18, -1.0, 0.22)).normalized()
    half_fov = math.atan(18 / cam_data.lens)

    def shot(frame, z, height):
        """Yerel eksende z'ye bakan ve dikeyde `height` cm gösteren kamera."""
        t = axis_point(z)
        d = height / 2 / math.tan(half_fov)
        key(target, frame, loc=t)
        key(cam, frame, loc=t + direction * d)

    interp("BEZIER")
    # TikTok güvenli alanı: içerik ~150–1510 px arasında, merkezi ~830 px
    shot(1, 5.9, 18.5)
    shot(F_EXPLODE[0], 6.0, 17.5)
    shot(F_EXPLODE[1] + 10, 5.85, 28.0)
    shot(F_ZOOM_IN[0], 5.85, 26.5)
    shot(F_ZOOM_IN[1], 0.40, 1.7)
    shot(F_ZOOM_OUT[0], 0.38, 1.5)
    shot(F_ZOOM_OUT[1] + 30, 5.9, 18.5)
    shot(FRAMES, 5.9, 18.5)
    return cam


def build_world_and_lights():
    w = bpy.data.worlds.new("Stüdyo")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.04, 0.045, 0.06, 1)
    mid = ramp.color_ramp.elements.new(0.5)
    mid.color = (0.25, 0.27, 0.32, 1)
    ramp.color_ramp.elements[2].position = 0.85
    ramp.color_ramp.elements[2].color = (1.6, 1.65, 1.8, 1)
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    remap = nt.nodes.new("ShaderNodeMath")  # yön z'si [-1, 1] → [0, 1]
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = remap.inputs[2].default_value = 0.5
    nt.links.new(sep.outputs["Z"], remap.inputs[0])
    nt.links.new(remap.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.9

    def sun(name, rot, energy, color, angle=8):
        L = bpy.data.lights.new(name, "SUN")
        L.energy, L.color, L.angle = energy, color, math.radians(angle)
        o = link(bpy.data.objects.new(name, L))
        o.rotation_euler = [math.radians(a) for a in rot]

    sun("Ana", (55, 0, -35), 4.5, (1.0, 0.97, 0.92))
    sun("Dolgu", (80, 0, 20), 1.2, (0.9, 0.95, 1.0), angle=20)
    sun("KenarSol", (75, 0, 150), 3.0, (0.55, 0.8, 1.0), angle=3)
    sun("KenarSag", (70, 0, -150), 2.5, (1.0, 0.72, 0.5), angle=3)


def export_anchors(scene, cam, parts):
    anchors = {}
    for label, (part, local) in ANCHORS.items():
        anchors[label] = empty(f"Capa_{label}", parts[part] if part != "ball" else parts["refill"],
                               loc=local)
    data = {"fps": FPS, "width": W, "height": H, "frames": FRAMES, "anchors": {k: [] for k in anchors}}
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        for k, e in anchors.items():
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            data["anchors"][k].append([round(co.x * W, 1), round((1 - co.y) * H, 1)])
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    M = build_materials()
    tilt = empty("Egim")
    tilt.rotation_euler = (0, TILT, 0)
    parts = build_pen(M, tilt)
    animate(parts, tilt)
    cam = build_camera()
    build_world_and_lights()
    export_anchors(scene, cam, parts)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kalem.blend"))

    if "--preview" in argv:
        scene.render.resolution_percentage = 50
        scene.eevee.taa_render_samples = 16
        for f in (1, 24, 105, 160, 300, 480, 540, 640):
            scene.frame_set(f)
            scene.render.filepath = os.path.join(OUT, "preview", f"f{f:04d}.png")
            bpy.ops.render.render(write_still=True)


main()
