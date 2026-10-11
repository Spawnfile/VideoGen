"""Rubik küpü — "Why doesn't it FALL APART?" (bölüm 9, ~12,5 sn).

Çalıştırma:
    blender-gpu -b --factory-startup -P scene.py -- --preview [--frames 1,60,...]
    blender-gpu -b --factory-startup -P scene.py -- --anchors-only

Birim: 1 Blender birimi = 1 cm. Küp merkezi orijinde, Z yukarı, ön yüz -Y.
Tüm parça/kamera hareketi Python'da kare kare hesaplanıp keyframe'lenir (bake), böylece
karıştırma (katman dönüşleri) ve döngü (son kare → ilk kare) kesin olur.
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

FPS = 30
FRAMES = 375  # 12,5 sn
W, H = 1080, 1920
P = 1.9        # parça aralığı (cm)
HALF = 0.93    # parça yarı boyu
R_CAV = 1.75   # kenar/köşe parçalarının iç küresel oyuğu
FONT = "/usr/share/fonts/opentype/inter/Inter-Bold.otf"

# ---------------------------------------------------------------- zaman çizelgesi (kare, 1 tabanlı)
S2 = 46        # iskelete yakınlaşma
CAP_OFF = (60, 70)
CAP_ON = (90, 100)
S3 = 106       # sert kesme: kahraman kenar parçası + gizli ayak
S4 = 166       # sert kesme: parçalar kenetlenir
XRAY = (200, 210, 236, 244)
TURN_X = (212, 230)   # x-ray altında üst katman 90°
S5 = 245       # karıştırma
S6 = 316       # patlat → çözülmüş birleş
LAND = 368

HERO = (0, -1, 1)  # ön-üst kenar (yeşil + beyaz)

# standart renk şeması: U beyaz, D sarı, F yeşil, B mavi, R kırmızı, L turuncu
FACE_COL = {
    (0, 0, 1): "#f2f2ee", (0, 0, -1): "#ffd400",
    (0, -1, 0): "#00a35c", (0, 1, 0): "#0b5fd6",
    (1, 0, 0): "#d8202f", (-1, 0, 0): "#ff6a10",
}


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
    return s


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.3
    e.location = loc
    return link(e, parent)


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def bm_obj(name, bm, mats, smooth=True, sharp_deg=40):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
        me.materials.append(m)
    return link(bpy.data.objects.new(name, me))


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def bevel(o, width, seg=3):
    m = o.modifiers.new("bevel", "BEVEL")
    m.width, m.segments, m.limit_method = width, seg, "ANGLE"
    m.harden_normals = True


def box_obj(name, size, center, mat, bev=0.1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    o = bm_obj(name, bm, mat, smooth=True)
    if bev:
        bevel(o, bev, 3)
    return o


def cyl_obj(name, r, z0, z1, mat, seg=48):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(bm, vec=(0, 0, (z0 + z1) / 2), verts=bm.verts)
    return bm_obj(name, bm, mat, smooth=True, sharp_deg=50)


def sphere_obj(name, r, center, mat, seg=48):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=r)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    return bm_obj(name, bm, mat, smooth=True, sharp_deg=180)


def capsule_obj(name, a, b, r, mat):
    """a → b doğrultusunda yarım küre uçlu çubuk (ayak)."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=r, radius2=r, depth=L)
    for z in (-L / 2, L / 2):
        s = bmesh.new()
        bmesh.ops.create_uvsphere(s, u_segments=32, v_segments=16, radius=r)
        bmesh.ops.translate(s, vec=(0, 0, z), verts=s.verts)
        me = bpy.data.meshes.new("tmp")
        s.to_mesh(me)
        s.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    rot = (b - a).normalized().to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=bm.verts)
    return bm_obj(name, bm, mat, smooth=True, sharp_deg=180)


def rounded_slab(name, w, rad, t, mat):
    """Köşeleri yuvarlatılmış kare plaka (çıkartma)."""
    bm = bmesh.new()
    pts = []
    c = w / 2 - rad
    for cx, cy, a0 in ((c, c, 0), (-c, c, 90), (-c, -c, 180), (c, -c, 270)):
        for k in range(7):
            a = math.radians(a0 + k * 15)
            pts.append((cx + rad * math.cos(a), cy + rad * math.sin(a)))
    bot = [bm.verts.new((x, y, 0)) for x, y in pts]
    top = [bm.verts.new((x, y, t)) for x, y in pts]
    bm.faces.new(bot[::-1])
    bm.faces.new(top)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    o = bm_obj(name, bm, mat, smooth=True, sharp_deg=30)
    bevel(o, 0.018, 2)
    return o


def diff(target, cutter):
    m = target.modifiers.new("cut", "BOOLEAN")
    m.operation, m.solver, m.object = "DIFFERENCE", "EXACT", cutter
    apply_mods(target)
    bpy.data.objects.remove(cutter)


def join(objs, name):
    for o in objs:
        apply_mods(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = objs[0]
    o.name = o.data.name = name
    return o


def axis_matrix(axis):
    """Yerel +Z'yi verilen eksene çeviren dönüş."""
    return Vector(axis).to_track_quat("Z", "Y").to_matrix().to_4x4()


# ---------------------------------------------------------------- malzemeler

def ghost_material(name, color, rough=0.35, coat=0.3, metallic=0.0):
    """Principled + 'Ghost' değeriyle karışan X-ray hayaleti (Fresnel camgöbeği kenar)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Metallic"].default_value = metallic
    out = nt.nodes["Material Output"]
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*hex_rgb("#8fd6ff"), 1)
    em.inputs["Strength"].default_value = 1.6
    rim = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lw.outputs["Facing"], rim.inputs[0])
    nt.links.new(tr.outputs[0], rim.inputs[1])
    nt.links.new(em.outputs[0], rim.inputs[2])
    g = nt.nodes.new("ShaderNodeValue")
    g.name = g.label = "Ghost"
    g.outputs[0].default_value = 0.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(g.outputs[0], mix.inputs[0])
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(rim.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    m.use_transparent_shadow = True
    return m


def glow_material(name, color, glow, rough=0.35, metallic=0.0):
    """'Glow' değeriyle emission'ı açılan malzeme."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Emission Color"].default_value = (*glow, 1)
    g = nt.nodes.new("ShaderNodeValue")
    g.name = g.label = "Glow"
    g.outputs[0].default_value = 0.0
    nt.links.new(g.outputs[0], p.inputs["Emission Strength"])
    return m


def build_materials():
    M = {
        "body": ghost_material("Govde", hex_rgb("#141519"), rough=0.32, coat=0.4),
        "core": glow_material("Iskelet", hex_rgb("#c9ced8"), hex_rgb("#ffd23f"), rough=0.3),
        "foot": glow_material("Ayak", hex_rgb("#3a3e48"), hex_rgb("#ffd23f"), rough=0.35),
        "hero_foot": glow_material("KahramanAyak", hex_rgb("#3a3e48"), hex_rgb("#ffd23f"), rough=0.35),
        "screw": glow_material("Vida", hex_rgb("#dfe3ea"), hex_rgb("#ffffff"), rough=0.18, metallic=1.0),
        "spring": glow_material("Yay", hex_rgb("#e6c27a"), hex_rgb("#ffd23f"), rough=0.2, metallic=1.0),
        "print": glow_material("Baski", hex_rgb("#3b4150"), hex_rgb("#3d7bff"), rough=0.5),
    }
    for ax, col in FACE_COL.items():
        M[ax] = ghost_material(f"Etiket{ax}", hex_rgb(col), rough=0.22, coat=0.6)
    return M


def set_value(mat, node, value, frame):
    n = mat.node_tree.nodes[node]
    n.outputs[0].default_value = value
    n.outputs[0].keyframe_insert("default_value", frame=frame)


# ---------------------------------------------------------------- küp

AXES = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]


def sticker(M, h, ax, name):
    n = Vector(ax)
    s = rounded_slab(name, 1.62, 0.2, 0.05, M[tuple(ax)])
    s.data.transform(Matrix.Translation(Vector(h) * P + n * HALF) @ axis_matrix(ax))
    return s


def build_cube(M, root):
    pieces = {}
    for x in (-1, 0, 1):
        for y in (-1, 0, 1):
            for z in (-1, 0, 1):
                h = (x, y, z)
                k = sum(abs(c) for c in h)
                if k == 0:
                    continue
                if k == 1:
                    pieces[h] = build_center(M, h)
                else:
                    pieces[h] = build_cornerish(M, h, k)
    for o in pieces.values():
        o.parent = root
        o.rotation_mode = "QUATERNION"
    return pieces


def build_cornerish(M, h, k):
    name = f"Parca_{h[0]}{h[1]}{h[2]}"
    hv = Vector(h)
    blk = box_obj(name, (2 * HALF,) * 3, hv * P, M["body"], bev=0.14)
    apply_mods(blk)
    diff(blk, sphere_obj("oyuk", R_CAV, (0, 0, 0), M["body"], seg=64))
    d = hv.normalized()
    hero = h == HERO
    fmat = M["hero_foot"] if hero else M["foot"]
    if k == 2:   # kenar: merkezlerin altına uzanan geniş ayak
        foot = capsule_obj(name + "_ayak", d * 1.25, d * 1.95, 0.38, fmat)
    else:        # köşe: kenar ayaklarının üstüne oturan küçük ayak
        foot = capsule_obj(name + "_ayak", d * 1.42, d * 2.05, 0.3, fmat)
    parts = [blk, foot]
    for i, c in enumerate(h):
        if c:
            ax = [0, 0, 0]
            ax[i] = c
            parts.append(sticker(M, h, ax, f"{name}_e{i}"))
    return join(parts, name)


def build_center(M, h):
    """Merkez: silindirik kök (vida + yay içinde) + delikli blok; kapak ayrı nesne (build_caps)."""
    name = f"Merkez_{h[0]}{h[1]}{h[2]}"
    tube = cyl_obj(name, 0.5, 1.05, 1.62, M["body"])
    diff(tube, cyl_obj("ic", 0.38, 1.15, 1.7, M["body"]))
    blk = box_obj(name + "_blok", (2 * HALF, 2 * HALF, 1.0), (0, 0, 2.1), M["body"], bev=0.12)
    apply_mods(blk)
    diff(blk, cyl_obj("delik", 0.42, 1.0, 2.7, M["body"]))
    o = join([tube, blk], name)
    o.data.transform(axis_matrix(h))
    return o


def build_caps(M, root):
    caps = {}
    for ax in AXES:
        name = f"Kapak_{ax[0]}{ax[1]}{ax[2]}"
        c = box_obj(name, (2 * HALF, 2 * HALF, 0.23), (0, 0, 2.715), M["body"], bev=0.08)
        parts = [c]
        s = rounded_slab(name + "_e", 1.62, 0.2, 0.05, M[ax])
        s.location = (0, 0, 2.83)
        apply_mods(s)
        s.data.transform(Matrix.Translation((0, 0, 2.83)))
        s.location = (0, 0, 0)
        parts.append(s)
        if ax == (0, 0, 1):   # kanal reklamı: beyaz merkezde baskı
            for txt, y, size in (("WHAT'S", -0.17, 0.27), ("INSIDE", 0.17, 0.27)):
                cu = bpy.data.curves.new(name + txt, "FONT")
                cu.body = txt
                cu.font = bpy.data.fonts.load(FONT, check_existing=True)
                cu.size = size
                cu.align_x, cu.align_y = "CENTER", "CENTER"
                cu.extrude = 0.008
                cu.materials.append(M["print"])
                t = link(bpy.data.objects.new(name + txt, cu))
                t.location = (0, y, 2.885)
                bpy.ops.object.select_all(action="DESELECT")
                t.select_set(True)
                bpy.context.view_layer.objects.active = t
                bpy.ops.object.convert(target="MESH")
                t.data.transform(Matrix.Translation(t.location) @ Matrix.Rotation(math.pi, 4, "Z"))
                t.location = (0, 0, 0)
                parts.append(t)
        o = join(parts, name)
        o.data.transform(axis_matrix(ax))
        o.parent = root
        o.rotation_mode = "QUATERNION"
        caps[ax] = o
    return caps


def build_core(M, root):
    parts = [sphere_obj("Iskelet", 0.62, (0, 0, 0), M["core"])]
    for ax in AXES:
        arm = cyl_obj("kol", 0.28, 0.3, 1.05, M["core"])
        arm.data.transform(axis_matrix(ax))
        parts.append(arm)
    core = join(parts, "Iskelet")
    core.parent = root
    hw = []
    for ax in AXES:
        sh = cyl_obj(f"Vida_{ax}", 0.1, 0.5, 2.25, M["screw"], seg=24)
        hd = cyl_obj(f"VidaBas_{ax}", 0.34, 2.25, 2.37, M["screw"])
        sc = join([sh, hd], f"Vida_{ax}")
        sc.data.transform(axis_matrix(ax))
        sc.parent = root
        cu = bpy.data.curves.new(f"Yay_{ax}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth, cu.bevel_resolution = 0.045, 3
        spl = cu.splines.new("POLY")
        turns, n = 6, 6 * 24
        spl.points.add(n)
        for i in range(n + 1):
            t = i / n
            a = t * turns * math.tau
            spl.points[i].co = (0.27 * math.cos(a), 0.27 * math.sin(a), 1.2 + 1.0 * t, 1)
        cu.materials.append(M["spring"])
        sp = link(bpy.data.objects.new(f"Yay_{ax}", cu), root)
        sp.matrix_basis = axis_matrix(ax)
        hw += [sc, sp]
    return core, hw


# ---------------------------------------------------------------- hareket (kare kare)

def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t, p=3):
    t = min(1.0, max(0.0, t))
    return 1 - (1 - t) ** p


def ease_in(t, p=3):
    t = min(1.0, max(0.0, t))
    return t ** p


def seg(f, a, b):
    return (f - a) / (b - a)


def make_scramble():
    rnd = random.Random(11)
    moves, last = [], None
    for _ in range(11):
        while True:
            a = rnd.randrange(3)
            if a != last:
                break
        last = a
        moves.append((a, rnd.choice((-1, 1)), rnd.choice((-1, 1))))
    return moves


SCR_MOVES = make_scramble()
SCR_T0, SCR_STEP, SCR_DUR = 247, 6, 7


def rot_axis(a, ang):
    v = [0, 0, 0]
    v[a] = 1
    return Quaternion(Vector(v), ang)


def build_rotation_track(homes):
    """Her parça için kare → dönüş quaternion'u (katman dönüşleri). Hem x-ray dönüşü hem karıştırma."""
    turns = [(TURN_X[0], TURN_X[1] - TURN_X[0], (2, 1, -1))]
    for i, mv in enumerate(SCR_MOVES):
        turns.append((SCR_T0 + i * SCR_STEP, SCR_DUR, mv))
    track = {h: [None] * (FRAMES + 2) for h in homes}
    cur = {h: Quaternion() for h in homes}
    ti = 0
    active = None
    for f in range(1, FRAMES + 2):
        # biten dönüşü kalıcı yap
        if active and f >= active[0] + active[1]:
            t0, d, (a, s, sgn), layer = active
            for h in layer:
                cur[h] = rot_axis(a, sgn * math.pi / 2) @ cur[h]
            active = None
        if active is None and ti < len(turns) and f >= turns[ti][0]:
            t0, d, mv = turns[ti]
            a, s, sgn = mv
            layer = [h for h in homes if round((cur[h] @ (Vector(h) * P))[a] / P) == s]
            active = (t0, d, mv, layer)
            ti += 1
        for h in homes:
            q = cur[h]
            if active and h in active[3]:
                t0, d, (a, s, sgn), _ = active
                q = rot_axis(a, sgn * math.pi / 2 * smooth(seg(f, t0, t0 + d))) @ q
            track[h][f] = q.copy()
    return track


def explode_amount(f, i, n):
    """Parça başına patlama miktarı (0 = birleşik)."""
    if f <= 45:
        return 0.35 + 0.65 * ease_out(seg(f, 1, 45), 3)
    if f < S4:
        return 1.0 + 0.7 * smooth(seg(f, S2, 72))
    if f < S6:
        st = S4 + 2 + i * 1.4
        return 1.7 * (1 - ease_in(seg(f, st, st + 9), 2))
    if f < 345:
        return 1.25 * ease_out(seg(f, S6, S6 + 14), 3)
    return 1.25 * (1 - ease_in(seg(f, 345, LAND), 2.4))


def yaw_deg(f):
    keys = [(1, 0), (45, 22), (105, 34), (165, 40), (245, 58), (316, 120), (375, 360)]
    if f >= S6:  # finalde tam tur: hızlı başla, ilk karedeki hıza (≈0,5°/kare) yavaşla
        u = seg(f, S6, 376)
        return 120 + 240 * (1 - (1 - u) ** 2.2) if f <= 375 else 360
    for (a, va), (b, vb) in zip(keys, keys[1:]):
        if a <= f <= b:
            return va + (vb - va) * seg(f, a, b)
    return 0


def animate(pieces, caps, core, hw, M, root):
    homes = list(pieces)
    rng = random.Random(5)
    tumble_axis = {h: Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
                   for h in homes}
    order = sorted([h for h in homes if sum(map(abs, h)) > 1],
                   key=lambda h: (sum(map(abs, h)), h[2], h[0], h[1]))
    idx = {h: i for i, h in enumerate(order)}
    track = build_rotation_track(homes)
    scr_end = {h: track[h][S6] for h in homes}
    dist = {2: 3.2, 3: 4.0}

    root.rotation_mode = "XYZ"
    prev_q = {}
    for f in range(1, FRAMES + 1):
        root.rotation_euler = (0, 0, math.radians(yaw_deg(f)))
        root.keyframe_insert("rotation_euler", frame=f)
        for h in homes:
            k = sum(map(abs, h))
            q = track[h][f]
            if f >= S6 + 12:   # parçalar havada "doğru" yerlerine döner
                u = smooth(seg(f, S6 + 12, 352))
                q = scr_end[h].slerp(Quaternion(), u)
            hp = Vector(h) * P
            c = q @ hp
            if k == 1:
                M_ = Matrix.Translation(c - c) @ q.to_matrix().to_4x4()
            else:
                e = explode_amount(f, idx[h], len(order))
                d = (q @ Vector(h)).normalized()
                off = d * e * dist[k]
                tq = Quaternion(tumble_axis[h], math.radians(55) * min(e, 1.3))
                if h == HERO and S2 <= f < S4 + 2:
                    tq = Quaternion()
                if h == HERO and S3 <= f < S4:    # kahraman yavaşça döner, ayağı görünsün
                    tq = Quaternion(Vector(HERO).normalized(), math.radians(-50 * smooth(seg(f, S3, S4))))
                M_ = (Matrix.Translation(c + off) @ tq.to_matrix().to_4x4()
                      @ Matrix.Translation(-c) @ q.to_matrix().to_4x4())
            o = pieces[h]
            o.matrix_basis = M_
            qq = o.rotation_quaternion.copy()
            if h in prev_q and qq.dot(prev_q[h]) < 0:
                qq.negate()
                o.rotation_quaternion = qq
            prev_q[h] = qq.copy()
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("rotation_quaternion", frame=f)
        # kapaklar: merkezleriyle döner, iskelet sahnesinde fırlayıp geri oturur
        for ax, cobj in caps.items():
            q = track[ax][f] if f < S6 + 12 else scr_end[ax].slerp(Quaternion(), smooth(seg(f, S6 + 12, 352)))
            lift = 0.0
            if False:
                lift = 1.5 * ease_out(seg(f, *CAP_OFF), 3) * (1 - ease_in(seg(f, *CAP_ON), 3))
            spin = Quaternion(Vector(ax), math.radians(40) * lift / 1.5)
            cobj.matrix_basis = Matrix.Translation(q @ Vector(ax) * lift) @ (q @ spin).to_matrix().to_4x4()
            qq = cobj.rotation_quaternion.copy()
            key_ = ("cap", ax)
            if key_ in prev_q and qq.dot(prev_q[key_]) < 0:
                qq.negate()
                cobj.rotation_quaternion = qq
            prev_q[key_] = qq.copy()
            cobj.keyframe_insert("location", frame=f)
            cobj.keyframe_insert("rotation_quaternion", frame=f)

    for fc in _fcurves(root) + [fc for o in list(pieces.values()) + list(caps.values()) for fc in _fcurves(o)]:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"

    # parlamalar / x-ray
    for f, v in ((1, 0), (CAP_OFF[0] - 4, 0), (CAP_OFF[0] + 4, 4.0), (S3 - 1, 3.0), (S3, 0)):
        set_value(M["core"], "Glow", v, f)
    for f, v in ((1, 0), (CAP_OFF[0], 0), (CAP_OFF[1], 2.0), (S3 - 1, 2.0), (S3, 0)):
        set_value(M["spring"], "Glow", v, f)
    for f, v in ((1, 0), (S3 + 6, 0), (S3 + 14, 6.0), (S4 - 1, 6.0), (S4, 0), (XRAY[0], 0), (XRAY[1], 4.0),
                 (XRAY[2], 4.0), (XRAY[3], 0)):
        set_value(M["hero_foot"], "Glow", v, f)
    for f, v in ((1, 0), (XRAY[0], 0), (XRAY[1], 2.2), (XRAY[2], 2.2), (XRAY[3], 0)):
        set_value(M["foot"], "Glow", v, f)
    ghosts = [M["body"]] + [M[ax] for ax in AXES]
    for m in ghosts:
        for f, v in ((1, 0), (CAP_OFF[0] - 6, 0), (CAP_OFF[0] + 2, 0.82), (S3 - 1, 0.82), (S3, 0),
                     (XRAY[0], 0), (XRAY[1], 0.86), (XRAY[2], 0.86), (XRAY[3], 0)):
            set_value(m, "Ghost", v, f)
    for f, v in ((1, 0.6), (S6 - 1, 0.6), (LAND - 2, 0.6), (LAND + 1, 2.5), (375, 0.6)):
        set_value(M["print"], "Glow", v, f)


def _fcurves(o):
    ad = o.animation_data
    if not ad or not ad.action:
        return []
    act = ad.action
    if hasattr(act, "fcurves") and len(getattr(act, "fcurves", [])):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in layer.strips:
            for cb in strip.channelbags:
                out += list(cb.fcurves)
    return out


# ---------------------------------------------------------------- kamera

def build_camera():
    target = empty("KameraHedefi")
    cd = bpy.data.cameras.new("Kamera")
    cd.lens = 70
    cd.clip_start = 0.05
    cd.clip_end = 1000
    cam = link(bpy.data.objects.new("Kamera", cd))
    c = cam.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    bpy.context.scene.camera = cam
    focus = empty("Odak")
    cd.dof.use_dof = True
    cd.dof.focus_object = focus
    return cam, target, focus


def cam_params(f, hero_world):
    """(hedef, yükseklik[cm], elev, azim, f-stop) — segment içinde yumuşak, segmentler arası sert kesme."""
    if f < S2:      # kanca: patlama, hafif geri çekilme
        u = ease_out(seg(f, 1, S2), 2)
        return Vector((0, 0, 1.1)), 22.0 + 5.0 * u, 30, 35, 40
    if f < S3:      # iskelete hızlı yakınlaşma
        u = ease_out(seg(f, S2, S2 + 12), 3)
        H_ = 26 - 13.0 * u - 1.0 * seg(f, S2, S3)
        return Vector((0, 0, 0.9)), H_ + 1.5, 34 + 6 * u, 62 + 12 * seg(f, S2, S3), 40
    if f < S4:      # kahraman parça makro (yandan), hafif itiş
        u = seg(f, S3, S4)
        return hero_world + Vector((0, 0, 1.1)), 7.6 - 1.2 * u, 10, 90 - 15 * u, 0.6
    if f < S5:      # kenetlenme + x-ray
        u = smooth(seg(f, S4, S5))
        return Vector((0, 0, 1.0)), 16.5 - 2.0 * u, 30, 20 + 15 * u, 40
    if f < S6:      # karıştırma: yörünge
        u = seg(f, S5, S6)
        return Vector((0, 0, 1.0)), 14.5 + 1.5 * u, 30 + 8 * math.sin(u * math.pi), 35 - 25 * math.sin(u * math.pi), 40
    u = seg(f, S6, 376)
    bump = math.sin(min(1.0, u * 1.25) * math.pi)
    return Vector((0, 0, 1.1)), 22.0 + 6.0 * bump, 30, 35, 40


def camera_keys(cam, target, focus, scene, pieces, root):
    half_fov = math.atan(18 / cam.data.lens)
    hero = pieces[HERO]
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        hero_world = hero.matrix_world @ (Vector(HERO).normalized() * 2.05)
        t, Hh, elev, azim, fstop = cam_params(f, hero_world)
        e, a = math.radians(elev), math.radians(azim)
        direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        if S3 <= f < S4:   # kahraman: ayağa dik, önü boş doğrultu (yerel arka-üst)
            direction = (root.matrix_world.to_3x3() @ Vector((0.3, 1, 1.15))).normalized()
        d = Hh / 2 / math.tan(half_fov)
        target.location = t
        cam.location = t + direction * d
        focus.location = t
        cam.data.dof.aperture_fstop = fstop
        for o, path in ((target, "location"), (cam, "location"), (focus, "location")):
            o.keyframe_insert(path, frame=f)
        cam.data.dof.keyframe_insert("aperture_fstop", frame=f)
    for o in (target, cam, focus):
        for fc in _fcurves(o):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


# ---------------------------------------------------------------- dünya + ışık (klavye ile aynı)

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


# ---------------------------------------------------------------- çapalar

def export_anchors(scene, cam, pieces):
    hero = pieces[HERO]
    foot = empty("Capa_ayak", hero, loc=Vector(HERO).normalized() * 1.5)
    core = empty("Capa_iskelet", hero.parent, loc=(0, 0, 0))
    data = {"fps": FPS, "frames": FRAMES, "anchors": {"foot": [], "core": []}}
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        for k, e in (("foot", foot), ("core", core)):
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            data["anchors"][k].append([round(co.x * W, 1), round((1 - co.y) * H, 1)] if co.z > 0 else [-999, -999])
    data["scramble"] = [SCR_T0 + i * SCR_STEP for i in range(len(SCR_MOVES))]
    data["snaps"] = [round(S4 + 2 + i * 1.4 + 9) for i in range(20)]
    data["marks"] = {"S2": S2, "capOff": CAP_OFF[0], "capOn": CAP_ON[1], "S3": S3, "S4": S4,
                     "turn": TURN_X[1], "S5": S5, "S6": S6, "land": LAND}
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    M = build_materials()
    root = empty("Kup")
    pieces = build_cube(M, root)
    caps = build_caps(M, root)
    core, hw = build_core(M, root)
    animate(pieces, caps, core, hw, M, root)
    cam, target, focus = build_camera()
    camera_keys(cam, target, focus, scene, pieces, root)
    build_world_and_lights()
    export_anchors(scene, cam, pieces)
    if "--anchors-only" in argv:
        return
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "rubik.blend"))

    frames = [int(a) for a in argv[argv.index("--frames") + 1].split(",")] if "--frames" in argv else [1]
    if "--preview" in argv:
        pct = int(argv[argv.index("--pct") + 1]) if "--pct" in argv else 50
        scene.render.resolution_percentage = pct
        scene.eevee.taa_render_samples = 32
        for f in frames:
            scene.frame_set(f)
            scene.render.filepath = os.path.join(OUT, "preview", f"f{f:04d}.png")
            bpy.ops.render.render(write_still=True)


main()
