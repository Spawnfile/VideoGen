"""Mekanik klavye — katman katman patlatılmış görünüm + Enter switch'ine dalış.

Çalıştırma:
    blender-gpu -b --factory-startup -P scene.py              # sahneyi kur, .blend + anchors.json yaz
    blender-gpu -b --factory-startup -P scene.py -- --preview # ayrıca ön izleme karelerini render et

Birim: 1 Blender birimi = 1 cm. Klavye yerel XY düzleminde, Z yukarı.
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
FRAMES = 840  # 28 sn
W, H = 1080, 1920
U = 1.905  # 1 tuş birimi (cm)
FONT = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"

# ---------------------------------------------------------------- zaman çizelgesi (kare)
TYPED = ["İ", "Ç", "İ", "N", "D", "E", "Space", "N", "E", "Space", "V", "A", "R"]
F_TYPE0, F_TYPE_STEP = 8, 4          # 13 basış: 8, 12, ... 56
F_ENTER = 64                         # büyük Enter basışı
F_EXPLODE = (76, 128)                # katmanlar ayrılır
F_DIVE = (345, 400)                  # katmanlar çekilir, kamera Enter switch'ine dalar
F_HERO_EX = (405, 445)               # switch parçalarına ayrılır
F_HERO_IN = (560, 590)               # switch yeniden birleşir
F_PRESS = (606, 642, 672)            # kontak basışları
F_RETURN = 705                       # katmanlar geri gelir
F_RAIN = 748                         # tuş kapakları yağar
F_HOME = 800                         # kamera başlangıç kadrajında

# katmanların patlatılmış Z ötelemeleri (cm)
LAYER_DZ = {"case": 0.0, "foam": 4.2, "pcb": 8.4, "plate": 12.6, "switch": 16.8}
KEYCAP_DZ = 22.0
LAYER_DELAY = {"case": 0, "foam": 6, "pcb": 10, "plate": 14, "switch": 18}

# Enter switch'inin patlatılmış ötelemeleri (switch tabanına göre)
HERO_DZ = {"bottom": 0.0, "leaves": 1.15, "spring": 2.25, "stem": 3.45, "top": 4.75}
HERO_CAP_DZ = 6.25  # tuş kapağı tabanı

# ---------------------------------------------------------------- düzen (Türkçe Q, %60, 61 tuş)
# (etiket, genişlik[u], renk) ; renk: a=alfa (krem), m=modifiye (antrasit), x=vurgu (turuncu)
ROWS = [
    [("Esc", 1, "x")] + [(c, 1, "a") for c in "1234567890*-"] + [("⌫", 2, "m")],
    [("Tab", 1.5, "m")] + [(c, 1, "a") for c in "QWERTYUIOPĞÜ"] + [(",", 1.5, "m")],
    [("Caps", 1.75, "m")] + [(c, 1, "a") for c in "ASDFGHJKLŞİ"] + [("Enter", 2.25, "x")],
    [("Shift", 2.25, "m")] + [(c, 1, "a") for c in "ZXCVBNMÖÇ."] + [("Shift", 2.75, "m")],
    [("Ctrl", 1.25, "m"), ("Win", 1.25, "m"), ("Alt", 1.25, "m"), ("Space", 6.25, "a"),
     ("AltGr", 1.25, "m"), ("Fn", 1.25, "m"), ("Menu", 1.25, "m"), ("Ctrl", 1.25, "m")],
]
SW_BASE = 0.96      # switch tabanı (PCB üstü)
CAP_BASE = SW_BASE + 1.25
TRAVEL = 0.4


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


def mesh_obj(name, bm, mat, parent=None, smooth=True, sharp_deg=35):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    if isinstance(mat, (list, tuple)):
        for m in mat:
            me.materials.append(m)
    else:
        me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), parent)


def frustum(bm, x0, y0, x1, y1, z0, z1, inset_x=0.0, inset_y=0.0, ox=0.0, oy=0.0):
    """Tabanı (x0..x1, y0..y1) olan, üstü içe daralan kesik piramit (kapalı kutu)."""
    b = [bm.verts.new((x, y, z0)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    t = [bm.verts.new((x + ox, y + oy, z1)) for x, y in (
        (x0 + inset_x, y0 + inset_y), (x1 - inset_x, y0 + inset_y),
        (x1 - inset_x, y1 - inset_y), (x0 + inset_x, y1 - inset_y))]
    faces = [bm.faces.new(b[::-1]), bm.faces.new(t)]
    for i in range(4):
        j = (i + 1) % 4
        faces.append(bm.faces.new((b[i], b[j], t[j], t[i])))
    return faces


def box(name, size, loc, mat, parent=None, rot=(0, 0, 0), bevel=0.01, segments=3):
    bm = bmesh.new()
    sx, sy, sz = size
    frustum(bm, -sx / 2, -sy / 2, sx / 2, sy / 2, -sz / 2, sz / 2)
    o = mesh_obj(name, bm, mat, parent)
    o.location, o.rotation_euler = loc, rot
    if bevel:
        add_bevel(o, bevel, segments)
    return o


def add_bevel(o, width, segments=3):
    m = o.modifiers.new("bevel", "BEVEL")
    m.width, m.segments = width, segments
    m.limit_method = "ANGLE"
    m.harden_normals = True
    return m


def cylinder(name, r, z0, z1, mat, parent=None, loc=(0, 0, 0), seg=32):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, (z0 + z1) / 2))
    o = mesh_obj(name, bm, mat, parent)
    o.location = loc
    return o


def helix(name, r, z0, z1, turns, wire, mat, parent=None):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth, curve.bevel_resolution = wire, 4
    spl = curve.splines.new("POLY")
    n = int(turns * 32)
    spl.points.add(n)
    for i in range(n + 1):
        t = i / n
        a = t * turns * math.tau
        spl.points[i].co = (r * math.cos(a), r * math.sin(a), z0 + (z1 - z0) * t, 1)
    curve.materials.append(mat)
    return link(bpy.data.objects.new(name, curve), parent)


def text(name, body, size, mat, parent, loc):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.size = size
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    cu.materials.append(mat)
    o = link(bpy.data.objects.new(name, cu), parent)
    o.location = loc
    return o


def material(name, color, metallic=0.0, rough=0.4, alpha=1.0, coat=0.0, emission=None, strength=1.0):
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
        p.inputs["Emission Strength"].default_value = strength
    return m


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def key(obj, frame, loc=None, rot=None, scale=None):
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert("location", frame=frame)
    if rot is not None:
        obj.rotation_euler = rot
        obj.keyframe_insert("rotation_euler", frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert("scale", frame=frame)


def interp(kind):
    bpy.context.preferences.edit.keyframe_new_interpolation_type = kind


def boolean_diff(target, cutter):
    m = target.modifiers.new("cut", "BOOLEAN")
    m.operation, m.solver, m.object = "DIFFERENCE", "EXACT", cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter)


# ---------------------------------------------------------------- malzemeler

def build_materials():
    foam = material("Köpük", hex_rgb("#e7ddd6"), rough=1.0)
    nt = foam.node_tree
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 90.0
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], nt.nodes["Principled BSDF"].inputs["Normal"])

    return {
        "cap_a": material("KapakKrem", hex_rgb("#efe7d6"), rough=0.45),
        "cap_m": material("KapakAntrasit", hex_rgb("#4a505c"), rough=0.45),
        "cap_x": material("KapakTuruncu", hex_rgb("#ff6a2b"), rough=0.42),
        "leg_dark": material("YaziKoyu", hex_rgb("#2b2f38"), rough=0.5),
        "leg_light": material("YaziAcik", hex_rgb("#f4efe6"), rough=0.5),
        "case": material("Kasa", hex_rgb("#b9c0cc"), metallic=0.9, rough=0.32),
        "plate": material("Plaka", hex_rgb("#e3b55a"), metallic=1.0, rough=0.22),
        "pcb": material("PCB", hex_rgb("#0f6b45"), rough=0.35, coat=0.4),
        "trace": material("Yol", hex_rgb("#1f9a62"), rough=0.3),
        "pad": material("Ped", hex_rgb("#f0c060"), metallic=1.0, rough=0.2),
        "chip": material("Cip", hex_rgb("#15171c"), rough=0.4),
        "silver": material("Gumus", hex_rgb("#d8dce2"), metallic=1.0, rough=0.15),
        "foam": foam,
        "housing": material("SwitchGovde", hex_rgb("#eef4fb"), rough=0.05, alpha=0.42, coat=1.0),
        "stem": material("Sap", hex_rgb("#e8252e"), rough=0.3),
        "spring": material("Yay", hex_rgb("#e6c27a"), metallic=1.0, rough=0.2),
        "copper": material("Bakir", hex_rgb("#f19a5a"), metallic=1.0, rough=0.18),
        "post": material("Direk", hex_rgb("#2a2d33"), rough=0.4),
        "leaf": material("Yaprak", hex_rgb("#ffcf5a"), metallic=1.0, rough=0.12, emission=hex_rgb("#ffb030"), strength=0.25),
        "hero_housing": material("HeroGovde", hex_rgb("#eef4fb"), rough=0.05, alpha=0.42, coat=1.0),
        "spark": material("Kivilcim", hex_rgb("#bfe6ff"), emission=hex_rgb("#7fd0ff"), strength=0.0),
    }


# ---------------------------------------------------------------- klavye

def key_positions():
    """Her tuş için (satır, etiket, genişlik, renk, merkez x, merkez y)."""
    out = []
    for r, row in enumerate(ROWS):
        x = -7.5 * U
        y = (2 - r) * U
        for label, w, col in row:
            out.append((r, label, w, col, x + w * U / 2, y))
            x += w * U
    return out


_cap_meshes = {}


def keycap(name, w, mat, legend, legend_mat, parent):
    if w not in _cap_meshes:
        bm = bmesh.new()
        bx, by = w * U / 2 - 0.05, U / 2 - 0.05
        frustum(bm, -bx, -by, bx, by, 0.0, 0.85, inset_x=0.27, inset_y=0.3, oy=0.05)
        me = bpy.data.meshes.new(f"Kapak{w}")
        bm.to_mesh(me)
        bm.free()
        me.shade_smooth()
        _cap_meshes[w] = me
    me = _cap_meshes[w].copy()
    me.materials.append(mat)
    o = link(bpy.data.objects.new(name, me), parent)
    add_bevel(o, 0.14, 4)
    if legend:
        size = 0.62 if len(legend) == 1 else 0.36
        if legend == "Space":
            legend = ""
        if legend:
            t = text(f"{name}_yazi", legend, size, legend_mat, o, (0, 0.05, 0.858))
            t.data.offset = 0
    return o


_sw_mesh = None


def simple_switch(name, M, parent, loc):
    """Dizideki switch'ler: tek mesh, üç malzeme (gövde, sap, direk); ortak veri."""
    global _sw_mesh
    if _sw_mesh is None:
        bm = bmesh.new()
        frustum(bm, -0.7, -0.7, 0.7, 0.7, 0.0, 0.5)
        frustum(bm, -0.7, -0.7, 0.7, 0.7, 0.5, 1.12, inset_x=0.17, inset_y=0.17)
        n_house = len(bm.faces)
        frustum(bm, -0.205, -0.065, 0.205, 0.065, 1.12, 1.55)
        frustum(bm, -0.065, -0.205, 0.065, 0.205, 1.12, 1.55)
        for i, f in enumerate(bm.faces):
            f.material_index = 0 if i < n_house else 1
        _sw_mesh = bpy.data.meshes.new("Switch")
        bm.to_mesh(_sw_mesh)
        bm.free()
        _sw_mesh.materials.append(M["housing"])
        _sw_mesh.materials.append(M["stem"])
    o = link(bpy.data.objects.new(name, _sw_mesh), parent)
    o.location = loc
    return o


def build_keyboard(M, root):
    L = {}
    for name in LAYER_DZ:
        L[name] = empty(f"Katman_{name}", root)

    # kasa: tepsi
    cw, cd = 15 * U + 1.0, 5 * U + 1.0
    case = box("Kasa", (cw, cd, 1.85), (0, 0, 0.925), M["case"], L["case"], bevel=0)
    cut = box("KasaKesici", (cw - 0.8, cd - 0.8, 2.0), (0, 0, 1.4), M["case"], bevel=0)
    boolean_diff(case, cut)
    add_bevel(case, 0.12, 4)
    box("USBC", (0.9, 0.5, 0.32), (4.5, cd / 2 - 0.05, 1.0), M["chip"], L["case"], bevel=0.12)
    for sx in (-1, 1):  # lastik ayaklar
        box(f"Ayak{sx}", (2.0, 0.8, 0.12), (sx * 11.5, 3.6, -0.06), M["chip"], L["case"], bevel=0.05)

    # köpük
    box("Kopuk", (cw - 0.95, cd - 0.95, 0.35), (0, 0, 0.575), M["foam"], L["foam"], bevel=0.03)

    # PCB: kart + satır/sütun yolları + pedler + diyotlar + çip
    pcb = box("PCB", (15 * U - 0.1, 5 * U - 0.1, 0.16), (0, 0, 0.88), M["pcb"], L["pcb"], bevel=0.02)
    bm = bmesh.new()
    for r in range(5):  # satır yolları
        y = (2 - r) * U - 0.55
        bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(0, y, 0.965, 15 * U - 0.6, 0.06, 0.01))
    for c in range(15):  # sütun yolları
        x = (-7 + c) * U + 0.55
        bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(x, 0, 0.965, 0.06, 5 * U - 0.6, 0.01))
    mesh_obj("PCBYollari", bm, M["trace"], L["pcb"], smooth=False)

    bm_pad, bm_dio = bmesh.new(), bmesh.new()
    for r, label, w, col, x, y in key_positions():
        for px, py in ((-0.38, 0.25), (0.25, 0.5)):
            bmesh.ops.create_cone(bm_pad, cap_ends=True, segments=16, radius1=0.12, radius2=0.12,
                                  depth=0.02, matrix=_mat(x + px, y + py, 0.97, 1, 1, 1))
        bmesh.ops.create_cube(bm_dio, size=1.0, matrix=_mat(x + 0.55, y - 0.55, 1.0, 0.18, 0.38, 0.08))
    mesh_obj("Pedler", bm_pad, M["pad"], L["pcb"])
    mesh_obj("Diyotlar", bm_dio, M["chip"], L["pcb"], smooth=False)
    chip = box("Mikrodenetleyici", (1.1, 1.1, 0.14), (4.5, 3.3, 1.03), M["chip"], L["pcb"], bevel=0.03)
    bm = bmesh.new()
    for i in range(8):
        for sgn in (-1, 1):
            o = -0.42 + i * 0.12
            bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(4.5 + o, 3.3 + sgn * 0.62, 0.975, 0.05, 0.16, 0.02))
            bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(4.5 + sgn * 0.62, 3.3 + o, 0.975, 0.16, 0.05, 0.02))
    mesh_obj("CipBacaklari", bm, M["silver"], L["pcb"], smooth=False)
    box("PCB_USBC", (0.9, 0.7, 0.32), (4.5, 4.45, 1.12), M["silver"], L["pcb"], bevel=0.1)

    # plaka: kesikli pirinç levha
    plate = box("Plaka", (15 * U - 0.05, 5 * U - 0.05, 0.15), (0, 0, 1.535), M["plate"], L["plate"], bevel=0)
    bm = bmesh.new()
    for r, label, w, col, x, y in key_positions():
        bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(x, y, 1.535, 1.4, 1.4, 0.5))
    cutter = mesh_obj("PlakaKesici", bm, M["plate"], smooth=False)
    boolean_diff(plate, cutter)
    add_bevel(plate, 0.02, 2)

    # switch'ler ve tuş kapakları
    keycaps, hero = [], None
    for i, (r, label, w, col, x, y) in enumerate(key_positions()):
        is_hero = label == "Enter"
        if not is_hero:
            simple_switch(f"Switch_{i}", M, L["switch"], (x, y, SW_BASE))
        slot = empty(f"KapakYuva_{i}", root, loc=(x, y, CAP_BASE))
        legend_mat = M["leg_dark"] if col == "a" else M["leg_light"]
        cap = keycap(f"Kapak_{i}", w, M[f"cap_{col}"], label, legend_mat, slot)
        keycaps.append({"label": label, "x": x, "y": y, "slot": slot, "cap": cap, "hero": is_hero})
        if is_hero:
            hero = (x, y)
    return L, keycaps, hero


def _mat(x, y, z, sx, sy, sz):
    from mathutils import Matrix
    return Matrix.Translation((x, y, z)) @ Matrix.Diagonal((sx, sy, sz, 1))


# ---------------------------------------------------------------- Enter'ın switch'i (detaylı)

def build_hero_switch(M, root, hx, hy):
    slot = empty("HeroYuva", root, loc=(hx, hy, SW_BASE))
    P, S = {}, {}
    for name in HERO_DZ:
        S[name] = empty(f"HeroParca_{name}", slot)

    # alt gövde + orta direk + pinler
    bm = bmesh.new()
    frustum(bm, -0.7, -0.7, 0.7, 0.7, 0.0, 0.5)
    P["bottom"] = mesh_obj("AltGovde", bm, M["hero_housing"], S["bottom"], smooth=False)
    add_bevel(P["bottom"], 0.04, 2)
    cylinder("OrtaDirek", 0.2, -0.33, 0.45, M["post"], S["bottom"])
    for px, py in ((-0.38, 0.25), (0.25, 0.5)):
        cylinder(f"Pin{px}", 0.05, -0.33, 0.2, M["copper"], S["bottom"], loc=(px, py, 0), seg=12)

    # metal yapraklar: sabit + hareketli (alt ucundan menteşeli)
    leaves = empty("Yapraklar", S["bottom"])
    leaves.parent = S["leaves"]
    box("SabitYaprak", (0.06, 0.34, 0.6), (-0.13, -0.46, 0.45), M["leaf"], leaves, bevel=0.008)
    hinge = empty("YaprakMentese", leaves, loc=(0.06, -0.46, 0.15))
    box("HareketliYaprak", (0.06, 0.34, 0.6), (0, 0, 0.3), M["leaf"], hinge, bevel=0.008)
    spark = cylinder("Kivilcim", 0.06, -0.05, 0.05, M["spark"], leaves, loc=(-0.09, -0.46, 0.72), seg=24)
    spark.rotation_euler = (math.pi / 2, 0, 0)
    P["leaves"], P["hinge"], P["spark"] = leaves, hinge, spark

    P["spring"] = helix("HeroYay", 0.24, 0.0, 0.85, 6, 0.028, M["spring"], S["spring"])
    P["spring"].location = (0, 0, 0.1)

    stem = empty("SapKok", S["stem"])
    box("SapGovde", (0.6, 0.6, 0.55), (0, 0, 0.85), M["stem"], stem, bevel=0.03)
    box("SapArti1", (0.41, 0.13, 0.43), (0, 0, 1.335), M["stem"], stem, bevel=0.015)
    box("SapArti2", (0.13, 0.41, 0.43), (0, 0, 1.335), M["stem"], stem, bevel=0.015)
    box("SapBacak", (0.12, 0.1, 0.45), (0.05, -0.36, 0.5), M["stem"], stem, bevel=0.01)
    P["stem"] = stem

    bm = bmesh.new()
    frustum(bm, -0.7, -0.7, 0.7, 0.7, 0.5, 1.12, inset_x=0.17, inset_y=0.17)
    P["top"] = mesh_obj("UstGovde", bm, M["hero_housing"], S["top"], smooth=False)
    add_bevel(P["top"], 0.04, 2)
    return slot, S, P


# ---------------------------------------------------------------- animasyon

def animate(L, keycaps, hero_slot, HS, HP, root):
    interp("BEZIER")
    xs = [k["x"] for k in keycaps]
    xmin, xmax = min(xs), max(xs)

    def wave(k, span=18):
        return round((k["x"] - xmin) / (xmax - xmin) * span)

    # 1) kanca: harfler yazılır + Enter
    press = {}
    for i, label in enumerate(TYPED):
        press.setdefault(label, []).append(F_TYPE0 + i * F_TYPE_STEP)
    press.setdefault("Enter", []).append(F_ENTER)
    for k in keycaps:
        for f in press.get(k["label"], []):
            if k["label"] == "Space" and k["hero"]:
                continue
            c = k["cap"]
            key(c, f - 1, loc=(0, 0, 0))
            key(c, f + 1, loc=(0, 0, -TRAVEL))
            key(c, f + 4, loc=(0, 0, 0))

    # 2) katmanlar patlar, 3) dalışta çekilir, 4) geri döner
    for name, e in L.items():
        d = LAYER_DELAY[name]
        dz = LAYER_DZ[name]
        key(e, 1, loc=(0, 0, 0))
        key(e, F_EXPLODE[0] + d, loc=(0, 0, 0))
        key(e, F_EXPLODE[1] + d, loc=(0, 0, dz))
        key(e, F_DIVE[0] + d // 2, loc=(0, 0, dz))
        key(e, F_DIVE[0] + 30 + d // 2, loc=(0, 0, dz - 45))
        rd = LAYER_DELAY["switch"] - d  # dönüşte kasa önce gelir
        key(e, F_RETURN - 4 + rd, loc=(0, 0, -45))
        key(e, F_RETURN - 4 + rd + 22, loc=(0, 0, 0))

    for k in keycaps:
        s = k["slot"]
        w = wave(k)
        home = Vector((k["x"], k["y"], CAP_BASE))
        up = home + Vector((0, 0, KEYCAP_DZ))
        key(s, 1, loc=home)
        key(s, F_EXPLODE[0] + w, loc=home)
        key(s, F_EXPLODE[0] + w + 30, loc=up)
        if k["hero"]:
            continue
        key(s, F_DIVE[0] + w, loc=up)
        key(s, F_DIVE[0] + w + 26, loc=up + Vector((0, 0, 45)))
        key(s, F_RAIN + w, loc=home + Vector((0, 0, 30)))
        key(s, F_RAIN + w + 14, loc=home)

    # Enter switch'i: kendi katmanıyla patlar, dalışta yerinde kalır
    hx, hy = hero_slot.location.x, hero_slot.location.y
    base = Vector((hx, hy, SW_BASE))
    hz = LAYER_DZ["switch"]
    key(hero_slot, 1, loc=base)
    key(hero_slot, F_EXPLODE[0] + LAYER_DELAY["switch"], loc=base)
    key(hero_slot, F_EXPLODE[1] + LAYER_DELAY["switch"], loc=base + Vector((0, 0, hz)))
    key(hero_slot, F_RETURN + 8, loc=base + Vector((0, 0, hz)))
    key(hero_slot, F_RETURN + 36, loc=base)

    # Enter kapağı: dalışta switch'in üstüne iner, sonra parçalarla yükselir
    hk = next(k for k in keycaps if k["hero"])
    s = hk["slot"]
    cap_on_hero = base + Vector((0, 0, hz + 1.25 + 1.6))
    key(s, F_DIVE[0] + 5, loc=Vector((hx, hy, CAP_BASE + KEYCAP_DZ)))
    key(s, F_DIVE[1], loc=cap_on_hero)
    key(s, F_HERO_EX[0], loc=cap_on_hero)
    key(s, F_HERO_EX[1] + 12, loc=base + Vector((0, 0, hz + HERO_CAP_DZ)))
    key(s, F_HERO_IN[0], loc=base + Vector((0, 0, hz + HERO_CAP_DZ)))
    key(s, F_HERO_IN[1], loc=base + Vector((0, 0, hz + 14)))   # mekanizmada kadraj dışı
    key(s, F_RETURN + 14, loc=base + Vector((0, 0, hz + 14)))
    key(s, F_RETURN + 44, loc=Vector((hx, hy, CAP_BASE)))

    # switch parçaları
    order = ["bottom", "leaves", "spring", "stem", "top"]
    for i, name in enumerate(order):
        e = HS[name]
        d = i * 3
        key(e, F_HERO_EX[0] + d, loc=(0, 0, 0))
        key(e, F_HERO_EX[1] + d, loc=(0, 0, HERO_DZ[name]))
        key(e, F_HERO_IN[0] + (4 - i) * 3, loc=(0, 0, HERO_DZ[name]))
        key(e, F_HERO_IN[1] + (4 - i) * 2, loc=(0, 0, 0))

    # mekanizma: sap iner, yay sıkışır, hareketli yaprak sabit olana değer, kıvılcım
    stem, spring, hinge, spark = HP["stem"], HP["spring"], HP["hinge"], HP["spark"]
    REST, TOUCH = 0.2, -0.27
    key(stem, 1, loc=(0, 0, 0))
    key(spring, 1, scale=(1, 1, 1))
    key(hinge, 1, rot=(0, REST, 0))
    key(spark, 1, scale=(0, 0, 0))
    em = spark.active_material.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    em.default_value = 0.0
    em.keyframe_insert("default_value", frame=1)
    for f in F_PRESS:
        key(stem, f - 1, loc=(0, 0, 0))
        key(stem, f + 4, loc=(0, 0, -TRAVEL))
        key(stem, f + 16, loc=(0, 0, -TRAVEL))
        key(stem, f + 22, loc=(0, 0, 0))
        key(spring, f - 1, scale=(1, 1, 1))
        key(spring, f + 4, scale=(1, 1, 0.55))
        key(spring, f + 16, scale=(1, 1, 0.55))
        key(spring, f + 22, scale=(1, 1, 1))
        key(hinge, f + 1, rot=(0, REST, 0))
        key(hinge, f + 4, rot=(0, TOUCH, 0))
        key(hinge, f + 17, rot=(0, TOUCH, 0))
        key(hinge, f + 20, rot=(0, REST, 0))
        key(spark, f + 3, scale=(0, 0, 0))
        key(spark, f + 5, scale=(1.6, 1.6, 1.6))
        key(spark, f + 14, scale=(1, 1, 1))
        key(spark, f + 18, scale=(0, 0, 0))
        for ff, v in ((f + 3, 0.0), (f + 5, 60.0), (f + 14, 20.0), (f + 18, 0.0)):
            em.default_value = v
            em.keyframe_insert("default_value", frame=ff)

    # mekanizma sırasında gövde neredeyse şeffaf olur (iç parçalar okunsun)
    hal = HP["bottom"].active_material.node_tree.nodes["Principled BSDF"].inputs["Alpha"]
    for f, v in ((1, 0.42), (F_HERO_IN[1], 0.42), (F_HERO_IN[1] + 12, 0.14),
                 (F_RETURN, 0.14), (F_RETURN + 20, 0.42)):
        hal.default_value = v
        hal.keyframe_insert("default_value", frame=f)

    # kök: etiket bölümünde yavaş dönüş (paralaks), başa döner
    th0 = math.radians(-32)
    key(root, 1, rot=(0, 0, th0))
    key(root, F_EXPLODE[0], rot=(0, 0, th0))
    key(root, F_DIVE[0], rot=(0, 0, th0 + math.radians(14)))
    key(root, F_DIVE[1], rot=(0, 0, th0 + math.radians(20)))
    key(root, F_HERO_IN[1], rot=(0, 0, th0 + math.radians(20)))
    key(root, F_HOME, rot=(0, 0, th0))


def build_camera(root, hero_slot):
    target = empty("KameraHedefi")
    cam_data = bpy.data.cameras.new("Kamera")
    cam_data.lens = 70
    cam_data.clip_start = 0.01
    cam_data.clip_end = 1000
    cam = link(bpy.data.objects.new("Kamera", cam_data))
    c = cam.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    bpy.context.scene.camera = cam
    half_fov = math.atan(18 / cam_data.lens)

    def shot(frame, t, height, elev=38, azim=0):
        e, a = math.radians(elev), math.radians(azim)
        direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        d = height / 2 / math.tan(half_fov)
        key(target, frame, loc=Vector(t))
        key(cam, frame, loc=Vector(t) + direction * d)

    interp("BEZIER")
    hero_world = lambda dz: hero_slot.location + Vector((0, 0, dz))  # noqa: E731 (kök dönüşü yok sayılır)
    # dünya konumları kök dönüşüne bağlı; hedefleri sahne kurulduktan sonra hesapla
    return cam, target, shot


def camera_keys(shot, scene, hero_slot):
    def hero_w(frame, dz):
        scene.frame_set(frame)
        return hero_slot.matrix_world @ Vector((0, 0, dz))

    AZ = 35
    HOOK = dict(elev=40, azim=AZ)
    shot(1, (3.0, 0, 2.0), 24, **HOOK)
    shot(F_ENTER, (3.0, 0, 2.0), 22, **HOOK)
    shot(F_EXPLODE[1] + 30, (2.9, 2.0, 7.6), 49, elev=22, azim=AZ)
    shot(F_DIVE[0], (2.9, 2.0, 7.6), 47, elev=22, azim=AZ)
    shot(F_DIVE[1], hero_w(F_DIVE[1], 1.8), 7.5, elev=24, azim=-8)
    shot(F_HERO_EX[0], hero_w(F_HERO_EX[0], 1.8), 7.5, elev=24, azim=-8)
    shot(F_HERO_EX[1] + 15, hero_w(F_HERO_EX[1], 3.6), 11.5, elev=18, azim=-8)
    shot(F_HERO_IN[0] - 10, hero_w(F_HERO_IN[0], 3.6), 11.0, elev=18, azim=-8)
    shot(F_HERO_IN[1] + 6, hero_w(F_HERO_IN[1], 0.55), 3.3, elev=14, azim=-10)
    shot(F_PRESS[-1] + 24, hero_w(F_PRESS[-1], 0.55), 3.0, elev=14, azim=-10)
    shot(F_RETURN + 6, hero_w(F_RETURN + 6, 0.6), 5.0, elev=18, azim=0)
    shot(F_RETURN + 38, hero_w(F_RETURN + 38, 0.6), 15.0, elev=34, azim=25)
    shot(F_HOME, (3.0, 0, 2.0), 24, **HOOK)
    shot(FRAMES, (3.0, 0, 2.0), 24, **HOOK)


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
    remap = nt.nodes.new("ShaderNodeMath")
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = remap.inputs[2].default_value = 0.5
    nt.links.new(sep.outputs["Z"], remap.inputs[0])
    nt.links.new(remap.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 0.9

    def sun(name, rot, energy, color, angle=8):
        Lt = bpy.data.lights.new(name, "SUN")
        Lt.energy, Lt.color, Lt.angle = energy, color, math.radians(angle)
        o = link(bpy.data.objects.new(name, Lt))
        o.rotation_euler = [math.radians(a) for a in rot]

    sun("Ana", (45, 0, -35), 4.0, (1.0, 0.97, 0.92))
    sun("Dolgu", (70, 0, 20), 1.2, (0.9, 0.95, 1.0), angle=20)
    sun("KenarSol", (75, 0, 150), 3.0, (0.55, 0.8, 1.0), angle=3)
    sun("KenarSag", (70, 0, -150), 2.5, (1.0, 0.72, 0.5), angle=3)


# etiket çapaları: (ebeveyn adı, yerel nokta)
def anchor_specs(hx, hy):
    return {
        # katmanlar (yerel klavye koordinatları; ön-sol / ön-sağ kenarlar)
        "keycaps": ("KapakYuva_58", (0, -0.75, 0.55)),    # Fn tuşunun ön yüzü
        "switch": ("Katman_switch", (8.33, -3.81, SW_BASE + 1.55)),
        "plate": ("Katman_plate", (9.0, -4.76, 1.61)),
        "pcb": ("Katman_pcb", (9.0, -4.73, 0.96)),
        "foam": ("Katman_foam", (9.0, -4.8, 0.75)),
        "case": ("Katman_case", (9.0, -5.27, 1.0)),
        # Enter switch'i
        "h_cap": ("KapakYuva_40", (1.9, 0, 0.5)),
        "h_top": ("HeroParca_top", (0.55, 0, 0.9)),
        "h_stem": ("SapKok", (0, 0, 1.4)),
        "h_spring": ("HeroParca_spring", (0.24, 0, 0.6)),
        "h_leaves": ("Yapraklar", (-0.12, -0.46, 0.6)),
        "h_bottom": ("HeroParca_bottom", (-0.6, 0, 0.25)),
        "h_contact": ("Yapraklar", (-0.1, -0.46, 0.72)),
    }


def export_anchors(scene, cam, hx, hy):
    specs = anchor_specs(hx, hy)
    anchors = {}
    for label, (parent, local) in specs.items():
        anchors[label] = empty(f"Capa_{label}", bpy.data.objects[parent], loc=local)
    data = {"fps": FPS, "width": W, "height": H, "frames": FRAMES, "anchors": {k: [] for k in anchors}}
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        for k, e in anchors.items():
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            data["anchors"][k].append([round(co.x * W, 1), round((1 - co.y) * H, 1)])
    data["typed"] = [F_TYPE0 + i * F_TYPE_STEP for i in range(len(TYPED))]
    data["enter"] = F_ENTER
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    M = build_materials()
    root = empty("Klavye")
    L, keycaps, (hx, hy) = build_keyboard(M, root)
    hero_slot, HS, HP = build_hero_switch(M, root, hx, hy)
    # yazılar her karede yeniden hesaplanmasın: metni mesh'e çevir
    bpy.ops.object.select_all(action="DESELECT")
    fonts_ = [o for o in bpy.data.objects if o.type == "FONT"]
    for o in fonts_:
        o.select_set(True)
    bpy.context.view_layer.objects.active = fonts_[0]
    bpy.ops.object.convert(target="MESH")
    animate(L, keycaps, hero_slot, HS, HP, root)
    cam, target, shot = build_camera(root, hero_slot)
    camera_keys(shot, scene, hero_slot)
    build_world_and_lights()
    export_anchors(scene, cam, hx, hy)
    if "--anchors-only" in argv:
        return
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "klavye.blend"))

    frames = [int(a) for a in argv[argv.index("--frames") + 1].split(",")] if "--frames" in argv else \
        [1, 48, 150, 300, 390, 480, 615, 760]
    if "--draft" in argv:
        scene.render.resolution_percentage = 25
        scene.eevee.taa_render_samples = 4
        scene.eevee.use_raytracing = False
        scene.render.filepath = os.path.join(OUT, "draft", "")
        bpy.ops.render.render(animation=True)
    if "--preview" in argv:
        scene.render.resolution_percentage = 50
        scene.eevee.taa_render_samples = 16
        for f in frames:
            scene.frame_set(f)
            scene.render.filepath = os.path.join(OUT, "preview", f"f{f:04d}.png")
            bpy.ops.render.render(write_still=True)


main()
