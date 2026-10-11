"""Ortak yardımcılar (kulaklik/blender/scene.py'den) + zaman çizelgesi (timeline.json / captions.json) + malzemeler.

Zaman çizelgesini seslendirme belirler: tts/say.py → ../timeline.json (cümle kareleri) + ../captions.json (kelime
kareleri). Kare numaraları Remotion karesi; Blender karesi = Remotion + 1 (B()).
"""
import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)
TL = json.load(open(os.path.join(ROOT, "timeline.json")))
CAPS = json.load(open(os.path.join(ROOT, "captions.json")))
FPS = 30
FRAMES = TL["frames"]
W, H = 1080, 1920
FONT = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"


def B(r):  # Remotion karesi → Blender karesi
    return int(round(r)) + 1


def word(sid, text, nth=0):
    """Cümledeki kelimenin başlangıç karesi (Remotion). text: kelimenin başı (büyük/küçük harf duyarsız)."""
    hits = [w for w in CAPS if w["id"] == sid and w["text"].lower().startswith(text.lower())]
    return hits[nth]["start"]


def clip(sid):
    c = next(c for c in TL["clips"] if c["id"] == sid)
    return c["start"], c["end"]


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
    return s


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.2
    e.location = loc
    return link(e, parent)


def mesh_obj(name, bm, mat, parent=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), parent)


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def material(name, color, metallic=0.0, rough=0.4, coat=0.0, emission=None, strength=0.0, alpha=1.0, blend=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*hex_rgb(color), 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = rough
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Emission Color"].default_value = (*hex_rgb(emission or color), 1)
    p.inputs["Emission Strength"].default_value = strength
    p.inputs["Alpha"].default_value = alpha
    m.surface_render_method = "BLENDED" if blend else "DITHERED"
    m.use_transparent_shadow = True
    return m


def key(obj, frame, loc=None, rot=None, scale=None, quat=None):
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert("location", frame=frame)
    if rot is not None:
        obj.rotation_euler = rot
        obj.keyframe_insert("rotation_euler", frame=frame)
    if quat is not None:
        obj.rotation_quaternion = quat
        obj.keyframe_insert("rotation_quaternion", frame=frame)
    if scale is not None:
        obj.scale = scale if hasattr(scale, "__len__") else (scale, scale, scale)
        obj.keyframe_insert("scale", frame=frame)


def key_input(mat, input_name, pairs):
    inp = mat.node_tree.nodes["Principled BSDF"].inputs[input_name]
    for f, v in pairs:
        inp.default_value = v
        inp.keyframe_insert("default_value", frame=f)


def interp(kind):
    bpy.context.preferences.edit.keyframe_new_interpolation_type = kind


def fcurves(idb):
    ad = idb.animation_data
    if not ad or not ad.action:
        return []
    out = []
    for layer in ad.action.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out += list(cb.fcurves)
    return out


def set_interp(idb, path_part, kind):
    """Arka plan modunda tercih soket keyframe'lerine uygulanmıyor → interpolasyonu doğrudan ayarla."""
    for fc in fcurves(idb):
        if path_part in fc.data_path:
            for k in fc.keyframe_points:
                k.interpolation = kind


def smooth(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


def ease(r, a, b):
    return smooth((r - a) / (b - a)) if b > a else float(r >= a)


def spin_solid(name, prof, mat, parent, angle=math.radians(270), steps=40, start=0.0, smooth_=True):
    """(r, z) kapalı profilini Z ekseni etrafında `angle` kadar döndür (kesitli/cutaway katı)."""
    bm = bmesh.new()
    vs = [bm.verts.new((r * math.cos(start), r * math.sin(start), z)) for r, z in prof]
    f = bm.faces.new(vs)
    res = bmesh.ops.spin(bm, geom=[f] + vs + list(f.edges), angle=angle, steps=steps, axis=(0, 0, 1), cent=(0, 0, 0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, mat, parent, smooth=smooth_)
    if smooth_:
        o.modifiers.new("ew", "EDGE_SPLIT").split_angle = math.radians(35)
    return o


def box_bm(bm, sx, sy, sz, c=(0, 0, 0)):
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(c) @ Matrix.Diagonal((sx, sy, sz, 1)))


def add_bevel(o, w=0.02, seg=2):
    b = o.modifiers.new("bv", "BEVEL")
    b.width, b.segments = w, seg
    b.limit_method = "ANGLE"
    return b


def cyl_bm(bm, r, z0, z1, seg=32, M=Matrix.Identity(4)):
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0,
                          matrix=M @ Matrix.Translation((0, 0, (z0 + z1) / 2)))


def quat_map(a, b, A_, B_):
    """Yerel a → dünya A_, yerel b (a'ya dikleştirilir) → dünya B_."""
    a, A_ = Vector(a).normalized(), Vector(A_).normalized()
    b = (Vector(b) - Vector(b).dot(a) * a).normalized()
    B_ = (Vector(B_) - Vector(B_).dot(A_) * A_).normalized()
    ml = Matrix((a, b, a.cross(b))).transposed()
    mw = Matrix((A_, B_, A_.cross(B_))).transposed()
    return (mw @ ml.transposed()).to_quaternion()


def quat_from_axes(x, z):
    """Yerel X → x, yerel Z → z eşleyen dönüş."""
    x, z = Vector(x).normalized(), Vector(z).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed()
    return m.to_quaternion()



def hide_keys(o, pairs):
    """[(remotion_karesi, gizli_mi), ...] → hide_render CONSTANT keyframe'leri."""
    for f, h in pairs:
        o.hide_render = h
        o.keyframe_insert("hide_render", frame=B(f) if f > 0 else 1)
    set_interp(o, "hide_render", "CONSTANT")


def build_materials():
    M = {}
    M["bakelite"] = material("Bakalit", "#1c1a19", rough=0.35, coat=0.3)
    M["bakeliteH"] = material("BakalitKahraman", "#22201e", rough=0.3, coat=0.4)   # X-ray alfa
    M["tyre"] = material("AlfabeHalkasi", "#e9e4d6", rough=0.35)
    M["ink"] = material("Murekkep", "#141414", rough=0.5)
    M["thumb"] = material("Cark", "#2a2826", metallic=0.3, rough=0.4)
    M["alu"] = material("Aluminyum", "#c4c8ce", metallic=1.0, rough=0.28)
    M["brass"] = material("Pirinc", "#d6a64a", metallic=1.0, rough=0.25)
    M["copper"] = material("BakirTel", "#c8742e", metallic=0.8, rough=0.35)
    M["signal"] = material("SinyalTel", "#ffb31a", rough=0.3, emission="#ffb31a", strength=4.0)
    M["ukw"] = material("Reflektor", "#3d7bff", metallic=0.2, rough=0.3, coat=0.6, emission="#3d7bff")
    M["bulb"] = material("Lamba", "#fff1c2", rough=0.2, emission="#ffd23f", strength=0.0)
    M["bulbs"] = material("LambaKapali", "#d8d2c0", rough=0.25, coat=0.5, alpha=0.9)
    M["print"] = material("Baski", "#c9a24a", metallic=0.9, rough=0.3, emission="#ffd23f", strength=0.0)
    M["axle"] = material("Mil", "#9aa1ab", metallic=1.0, rough=0.3)
    return M
