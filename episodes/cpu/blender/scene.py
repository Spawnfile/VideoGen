"""PC işlemcisi (CPU) — lazerle kapağı kes, katmanları soy, mikro ölçeğe küçülüp transistöre in.

Çalıştırma:
    blender-gpu -b --factory-startup -P scene.py                          # .blend + anchors.json
    blender-gpu -b --factory-startup -P scene.py -- --preview             # + ön izleme kareleri (%50)
    blender-gpu -b --factory-startup -P scene.py -- --preview --frames 1,300
    blender-gpu -b --factory-startup -P scene.py -- --draft               # tüm animasyon %25
    blender-gpu -b --factory-startup -P scene.py -- --anchors-only

İki "dünya" var:
  A) Paket dünyası (orijin), 1 birim = 1 cm. CPU 4,5 × 3,75 cm (masaüstü LGA boyutu).
  C) Mikro dünya (OC ötelemesinde), 1 birim ≈ birkaç nm: bakır yol katmanları + transistörler.
Her dünyanın kendi kamerası var; sahne kamerası zaman çizelgesi işaretleriyle (marker) değişir.
"""
import json
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

FPS = 30
FRAMES = 900  # 30 sn
W, H = 1080, 1920
FONT_DISPLAY = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"
FONT_MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf"
OC = Vector((500.0, 0.0, 0.0))  # mikro dünyanın konumu

# ---------------------------------------------------------------- zaman çizelgesi (Blender karesi)
# 150 BPM → 1 vuruş = 12 kare. Kesmeler vuruşlara oturur.
F_HOOK_END = 84                 # kanca: tarama + tahmin şıkları
F_LASER = (85, 109)             # lazer kapağın çevresini keser
F_LID_UP = (109, 125)           # kapak kalkar, havada asılı kalır
F_LID_AWAY = (181, 197)         # kapak yukarı uçar
F_TIM = (181, 193, 211)         # termal lehim: parlar → erir
F_FLIP = (265, 289)             # CPU ters döner (altın pedler)
F_UNFLIP = (337, 361)           # geri döner
F_DIVE = (361, 397)             # asansör inişi: çipin üstüne
F_CUT_IN = 451                  # zoom-punch: mikro dünyaya
F_MICRO_BOTTOM = 541            # transistör katına inildi
F_GATE = [(613, 649), (673, 695)]   # kapı açık aralıkları (elektron akar)
F_STROBE = (697, 721)           # "5 GHz" — hızlı aç/kapa
F_CUT_OUT = 737                 # mikro dünyadan çık: çipe dön
F_LID_BACK = (771, 807)         # kapak geri uçar, oturur (darbe 807)
F_HOME = 841                    # kamera kanca kadrajında
F_CHIP_ZOOMOUT = (737, 771)

# paket ölçüleri (cm)
SUB = (4.5, 3.75, 0.12)
IHS_FL = (3.3, 3.1, 0.18)       # kapak kenarı (flanş)
IHS_TOP = (2.8, 2.6, 0.12)      # yükseltilmiş üst plaka
DIE = (2.2, 1.0, 0.08)
TIM_T = 0.03
Z_SUB = SUB[2]
Z_DIE = Z_SUB + DIE[2]
Z_TIM = Z_DIE + TIM_T
Z_IHS_TOP = Z_SUB + IHS_FL[2] + IHS_TOP[2]


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
    e.empty_display_size = 0.2
    e.location = loc
    return link(e, parent)


def mesh_obj(name, bm, mat, parent=None, smooth=False, sharp_deg=35):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    for m in (mat if isinstance(mat, (list, tuple)) else [mat]):
        me.materials.append(m)
    return link(bpy.data.objects.new(name, me), parent)


def _mat(x, y, z, sx, sy, sz):
    return Matrix.Translation((x, y, z)) @ Matrix.Diagonal((sx, sy, sz, 1))


def add_bevel(o, width, segments=2):
    m = o.modifiers.new("bevel", "BEVEL")
    m.width, m.segments = width, segments
    m.limit_method = "ANGLE"
    m.harden_normals = True
    return m


def box(name, size, loc, mat, parent=None, bevel=0.0, segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(0, 0, 0, *size))
    o = mesh_obj(name, bm, mat, parent)
    o.location = loc
    if bevel:
        add_bevel(o, bevel, segments)
    return o


def boxes(name, specs, mat, parent=None):
    """Tek mesh içinde çok sayıda kutu: specs = [(x, y, z, sx, sy, sz), ...]."""
    bm = bmesh.new()
    for x, y, z, sx, sy, sz in specs:
        bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(x, y, z, sx, sy, sz))
    return mesh_obj(name, bm, mat, parent)


def cylinder(name, r, z0, z1, mat, parent=None, loc=(0, 0, 0), seg=24):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, (z0 + z1) / 2))
    o = mesh_obj(name, bm, mat, parent, smooth=True)
    o.location = loc
    return o


def sphere(name, r, mat, parent=None, loc=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r)
    o = mesh_obj(name, bm, mat, parent, smooth=True, sharp_deg=180)
    o.location = loc
    return o


def text(name, body, size, mat, parent, loc, font=FONT_DISPLAY, align="CENTER"):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(font, check_existing=True)
    cu.size = size
    cu.align_x, cu.align_y = align, "CENTER"
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


def key_input(mat, input_name, pairs):
    """Malzeme girdisini (Emission Strength, Alpha…) kare/değer çiftleriyle anahtarla."""
    inp = mat.node_tree.nodes["Principled BSDF"].inputs[input_name]
    for f, v in pairs:
        inp.default_value = v
        inp.keyframe_insert("default_value", frame=f)


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
    return {
        "nickel": material("Nikel", hex_rgb("#c9cdd4"), metallic=1.0, rough=0.2),
        "etch": material("Kazima", hex_rgb("#3a3f48"), metallic=0.6, rough=0.6,
                         emission=hex_rgb("#ffc93f"), strength=0.0),
        "sub": material("Substrat", hex_rgb("#0f3d2e"), rough=0.38, coat=0.35),
        "sub_line": material("SubstratYol", hex_rgb("#1d6b4c"), rough=0.4),
        "gold": material("Altin", hex_rgb("#f2c45a"), metallic=1.0, rough=0.18,
                         emission=hex_rgb("#ffb030"), strength=0.08),
        "cap_body": material("KondBody", hex_rgb("#a8743d"), rough=0.45),
        "cap_end": material("KondUc", hex_rgb("#d9dde3"), metallic=1.0, rough=0.2),
        "die": material("Silikon", hex_rgb("#191b2c"), metallic=0.7, rough=0.08, coat=1.0),
        "die_glow": material("CipDevre", hex_rgb("#0b1a33"), metallic=0.3, rough=0.25,
                             emission=hex_rgb("#3d8bff"), strength=0.0),
        "die_glow2": material("CipDevre2", hex_rgb("#2a1f08"), metallic=0.3, rough=0.25,
                              emission=hex_rgb("#ffc23f"), strength=0.0),
        "core_hero": material("CekirdekHero", hex_rgb("#1d2a4a"), metallic=0.3, rough=0.25,
                              emission=hex_rgb("#8fd6ff"), strength=0.0),
        "tim": material("TermalLehim", hex_rgb("#b5bac3"), metallic=1.0, rough=0.35,
                        emission=hex_rgb("#ff7a1a"), strength=0.0),
        "laser": material("Lazer", hex_rgb("#ff5a2a"), emission=hex_rgb("#ff5a2a"), strength=0.0),
        "black": material("Siyah", hex_rgb("#101218"), rough=0.5),
        # mikro dünya
        "si": material("SilikonTaban", hex_rgb("#141a2c"), rough=0.55),
        "fin": material("Fin", hex_rgb("#4a6bd0"), rough=0.35),
        "channel": material("Kanal", hex_rgb("#4a6bd0"), rough=0.35,
                            emission=hex_rgb("#8fd6ff"), strength=0.0),
        "gate": material("Kapi", hex_rgb("#8c95aa"), metallic=0.8, rough=0.3),
        "gate_hero": material("KapiHero", hex_rgb("#9aa6c0"), metallic=0.6, rough=0.25, alpha=0.999,
                              emission=hex_rgb("#8fd6ff"), strength=0.0),
        "sd": material("KaynakAkac", hex_rgb("#ff6a2b"), rough=0.4,
                       emission=hex_rgb("#ff6a2b"), strength=0.08),
        "w": material("Tungsten", hex_rgb("#a7adb8"), metallic=1.0, rough=0.3),
        "cu": material("Bakir", hex_rgb("#b8642c"), metallic=1.0, rough=0.32,
                       emission=hex_rgb("#ff6a1a"), strength=0.05),
        "cu_sig": material("BakirSinyal", hex_rgb("#e08a4a"), metallic=1.0, rough=0.25,
                           emission=hex_rgb("#8fd6ff"), strength=2.0),
        "electron": material("Elektron", hex_rgb("#d8f0ff"), emission=hex_rgb("#8fd6ff"), strength=30.0),
    }


# ---------------------------------------------------------------- A) paket

def build_package(M):
    root = empty("CPU")
    P = {"root": root}

    # substrat + üst yüzey yolları + pin-1 üçgeni
    sub = box("Substrat", SUB, (0, 0, Z_SUB / 2), M["sub"], root, bevel=0.015)
    P["sub"] = sub
    rnd = random.Random(3)
    lines = []
    for i in range(26):  # kapak dışında kalan kenar bandında ince yollar
        side = i % 2
        y = rnd.uniform(-1.7, 1.7)
        x0 = 1.72 if side == 0 else -2.2
        lines.append((x0 + 0.24, y, Z_SUB + 0.002, rnd.uniform(0.2, 0.45), 0.012, 0.004))
    boxes("SubstratYollari", lines, M["sub_line"], root)
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in ((-2.18, 1.80, Z_SUB + 0.003), (-1.90, 1.80, Z_SUB + 0.003), (-2.18, 1.52, Z_SUB + 0.003))]
    bm.faces.new(v)
    mesh_obj("Pin1", bm, M["gold"], root)

    # SMD kondansatörler: kapağın iki yanında sıra sıra
    bodies, ends = [], []
    for sx in (-1, 1):
        for row in range(2):
            for j in range(9):
                x = sx * (1.87 + row * 0.2)
                y = -1.45 + j * 0.36
                bodies.append((x, y, Z_SUB + 0.03, 0.09, 0.15, 0.06))
                ends.append((x, y - 0.085, Z_SUB + 0.03, 0.095, 0.03, 0.062))
                ends.append((x, y + 0.085, Z_SUB + 0.03, 0.095, 0.03, 0.062))
    P["caps"] = boxes("Kondansatorler", bodies, M["cap_body"], root)
    boxes("KondansatorUclari", ends, M["cap_end"], root)

    # alt yüz: ~1700 altın ped (48×40 ızgara, ortası boş) + orta kondansatörler
    pads = []
    nx, ny = 48, 40
    for i in range(nx):
        for j in range(ny):
            if 17 <= i < 31 and 14 <= j < 26:
                continue
            x = (i - (nx - 1) / 2) * 0.09
            y = (j - (ny - 1) / 2) * 0.09
            pads.append((x, y, -0.003, 0.055, 0.055, 0.008))
    P["pads"] = boxes("AltinPedler", pads, M["gold"], root)
    P["n_pads"] = len(pads)
    under = []
    for i in range(6):
        for j in range(4):
            under.append((-0.5 + i * 0.2, -0.3 + j * 0.2, -0.03, 0.09, 0.15, 0.05))
    boxes("AltKondansatorler", under, M["cap_body"], root)

    # çip (die): silikon + üstte "die shot" bloklar (dalışta parlar)
    die = box("Cip", DIE, (0, 0, Z_SUB + DIE[2] / 2), M["die"], root, bevel=0.006)
    P["die"] = die
    blocks, blocks2 = [], []
    zt = DIE[2] / 2 + 0.0015
    cores = []
    for r in range(2):                       # 8 çekirdek (2 sıra × 4)
        for c in range(4):
            cx = -0.95 + c * 0.32
            cy = 0.22 if r == 0 else -0.22
            cores.append((cx, cy))
    hero_core = cores[5]
    for (cx, cy) in cores:
        if (cx, cy) == hero_core:
            continue
        blocks.append((cx, cy, zt, 0.28, 0.36, 0.002))
    for k in range(6):                       # önbellek: ince şeritler (ortada)
        blocks2.append((0.38, -0.4 + k * 0.16, zt, 0.22, 0.12, 0.002))
    blocks.append((0.82, 0.0, zt, 0.3, 0.86, 0.002))      # grafik
    blocks2.append((-0.16 + 0.0, 0.0, zt, 1.62, 0.04, 0.002))  # halka yol
    boxes("CipBloklari", blocks, M["die_glow"], die)
    P["cache"] = boxes("Onbellek", blocks2, M["die_glow2"], die)
    P["core"] = box("HeroCekirdek", (0.28, 0.36, 0.002), (hero_core[0], hero_core[1], zt), M["core_hero"], die)
    # çekirdek içi ince hücre deseni (yakın planda doku)
    cells = []
    for (cx, cy) in cores:
        for a in range(5):
            for b in range(6):
                cells.append((cx - 0.11 + a * 0.055, cy - 0.15 + b * 0.06, zt + 0.0012, 0.04, 0.045, 0.001))
    boxes("CekirdekHucreleri", cells, M["die_glow2"], die)

    # termal lehim (TIM)
    P["tim"] = box("TermalLehim", (DIE[0] - 0.04, DIE[1] - 0.04, TIM_T), (0, 0, Z_DIE + TIM_T / 2), M["tim"], root, bevel=0.004)

    # kapak (IHS): flanş + üst plaka, içi boşaltılmış; üstünde kazınmış logo
    lid = empty("Kapak", root, loc=(0, 0, 0))
    fl = box("KapakFlans", IHS_FL, (0, 0, Z_SUB + IHS_FL[2] / 2), M["nickel"], bevel=0)
    cav = box("KapakBosluk", (DIE[0] + 0.15, DIE[1] + 0.15, 0.24), (0, 0, Z_SUB + 0.05), M["nickel"])
    boolean_diff(fl, cav)
    fl.parent = lid
    add_bevel(fl, 0.03, 3)
    top = box("KapakUst", IHS_TOP, (0, 0, Z_SUB + IHS_FL[2] + IHS_TOP[2] / 2), M["nickel"], lid, bevel=0.04, segments=3)
    P["lid"], P["lid_top"] = lid, top
    build_engraving(M, lid)
    return P


def build_engraving(M, lid):
    """Kanal reklamı: kapak üstünde lazerle kazınmış logo + yazılar (gerçek marka yok)."""
    z = Z_IHS_TOP + 0.009
    E = M["etch"]
    # logo: iç içe kareler ("içinde ne var") + dört yanda minik pinler
    bm = bmesh.new()
    lx, ly, s = 0.0, 0.78, 0.46
    for (w, t) in ((s, 0.035), (s * 0.5, 0.0)):
        if t:
            for sx, sy, ox, oy in ((w, t, 0, w / 2 - t / 2), (w, t, 0, -w / 2 + t / 2),
                                   (t, w, w / 2 - t / 2, 0), (t, w, -w / 2 + t / 2, 0)):
                bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(lx + ox, ly + oy, z, sx, sy, 0.004))
        else:
            bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(lx, ly, z, w, w, 0.004))
    for k in range(3):
        o = -0.12 + k * 0.12
        for sx, sy, ox, oy in ((0.03, 0.08, o, s / 2 + 0.05), (0.03, 0.08, o, -s / 2 - 0.05),
                               (0.08, 0.03, s / 2 + 0.05, o), (0.08, 0.03, -s / 2 - 0.05, o)):
            bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(lx + ox, ly + oy, z, sx, sy, 0.004))
    mesh_obj("Logo", bm, E, lid)
    text("Yazi_WhatsInside", "WHAT'S INSIDE", 0.36, E, lid, (0, 0.2, z))
    text("Yazi_Kanal", "@whatsinit.lab", 0.17, E, lid, (0, -0.2, z), font=FONT_MONO)
    text("Yazi_Kod", "WI-01  ·  İÇİNDE NE VAR?", 0.11, E, lid, (0, -0.55, z), font=FONT_MONO)
    text("Yazi_Seri", "X3 2026   5.0 GHz   ◆ 20B", 0.1, E, lid, (0, -0.8, z), font=FONT_MONO)


def build_laser(M):
    beam = empty("LazerUc", None, loc=(1.65, -1.55, Z_SUB + 0.02))
    cylinder("LazerIsin", 0.012, 0.0, 30.0, M["laser"], beam, seg=12)
    sphere("LazerNokta", 0.05, M["laser"], beam)
    return beam


# ---------------------------------------------------------------- C) mikro dünya

FIN_H, FIN_W = 3.0, 0.9
GATE_W, GATE_H = 1.6, 5.4
GATE_PITCH = 6.0
FIN_PITCH = 4.0
SHAFT = (0.0, 3.0, 6.0)  # dalış bacası: merkez x, y, yarı genişlik


def build_micro(M):
    root = empty("Mikro", None, loc=OC)
    P = {"root": root}
    box("SilikonTaban", (90, 90, 2), (0, 20, -1), M["si"], root)
    xs = [i * GATE_PITCH for i in range(-6, 7)]
    fins_y = [j * FIN_PITCH for j in range(0, 10)]  # kahraman fin y=0, öndeki
    # finler (kahraman finin kapı altı ayrı malzeme)
    fins = []
    for y in fins_y:
        if y == 0:
            fins.append((-21.0, y, FIN_H / 2, 40.0 - 0.0, FIN_W, FIN_H))
        else:
            fins.append((0, y, FIN_H / 2, 78, FIN_W, FIN_H))
    P["fins"] = boxes("Finler", fins, M["fin"], root)
    boxes("HeroFinSag", [(21.0, 0, FIN_H / 2, 40.0, FIN_W, FIN_H)], M["fin"], root)
    P["channel"] = box("Kanal", (2.0, FIN_W + 0.02, FIN_H + 0.01), (0, 0, FIN_H / 2), M["channel"], root)
    # kapılar
    gates = []
    for x in xs:
        if x == 0:
            continue
        gates.append((x, 17.5, GATE_H / 2, GATE_W, 39.0, GATE_H))
    boxes("Kapilar", gates, M["gate"], root)
    P["gate"] = box("HeroKapi", (GATE_W, 3.0, GATE_H), (0, 0, GATE_H / 2), M["gate_hero"], root, bevel=0.08)
    boxes("KapiDevam", [(0, 19.25, GATE_H / 2, GATE_W, 35.5, GATE_H)], M["gate"], root)
    # kaynak / akaç (epitaksiyel bloklar) + kontaklar
    sd, contacts = [], []
    for y in fins_y:
        for x in xs[:-1]:
            cx = x + GATE_PITCH / 2
            if y == 0 and cx in (-3.0, 3.0):
                continue
            sd.append((cx, y, FIN_H * 0.62, 2.6, 1.7, FIN_H * 1.25))
            contacts.append((cx, y, FIN_H * 1.25 + 1.5, 0.9, 0.9, 3.0))
    boxes("KaynakAkaclar", sd, M["sd"], root)
    P["source"] = box("Kaynak", (2.6, 1.7, FIN_H * 1.25), (-3.0, 0, FIN_H * 0.62), M["sd"], root, bevel=0.15)
    P["drain"] = box("Akac", (2.6, 1.7, FIN_H * 1.25), (3.0, 0, FIN_H * 0.62), M["sd"], root, bevel=0.15)
    for cx in (-3.0, 3.0):
        contacts.append((cx, 0, FIN_H * 1.25 + 1.5, 0.9, 0.9, 3.0))
    boxes("Kontaklar", contacts, M["w"], root)

    # bakır yol katmanları: aşağıda ince/sık, yukarıda kalın/seyrek; ortada dalış bacası
    rnd = random.Random(11)
    layers = [(7.5, 1.0, 0.5, 0.7), (10.0, 1.0, 0.5, 0.7), (13.0, 2.0, 0.9, 1.0), (16.5, 2.0, 0.9, 1.0),
              (21.0, 4.0, 1.6, 1.6), (26.0, 4.0, 1.6, 1.6), (33.0, 8.0, 3.2, 2.6), (41.0, 8.0, 3.2, 2.6)]
    cu, sig, vias = [], [], []
    sx0, sy0, sh = SHAFT
    for li, (z, pitch, width, th) in enumerate(layers):
        along_x = li % 2 == 0
        n = int(90 / pitch)
        for k in range(n):
            c = -45 + (k + 0.5) * pitch
            if along_x:
                y = c + 20
                if y < -3:
                    continue
                segs = [(-45, 45)]
                if abs(y - sy0) < sh and li >= 2:
                    segs = [(-45, sx0 - sh), (sx0 + sh, 45)]
                for a, b in segs:
                    if b - a < 0.5:
                        continue
                    spec = ((a + b) / 2, y, z, b - a, width, th)
                    (sig if rnd.random() < 0.07 else cu).append(spec)
            else:
                x = c
                segs = [(-3, 65)]
                if abs(x - sx0) < sh and li >= 2:
                    segs = [(-3, sy0 - sh), (sy0 + sh, 65)]
                for a, b in segs:
                    if b - a < 0.5:
                        continue
                    spec = (x, (a + b) / 2, z, width, b - a, th)
                    (sig if rnd.random() < 0.07 else cu).append(spec)
        if li + 1 < len(layers):
            z1 = layers[li + 1][0]
            for _ in range(60 if li < 4 else 30):
                vx, vy = rnd.uniform(-40, 40), rnd.uniform(-2, 60)
                if abs(vx - sx0) < sh and abs(vy - sy0) < sh:
                    continue
                vias.append((vx, vy, (z + z1) / 2, width * 0.8, width * 0.8, z1 - z))
    boxes("BakirYollar", cu, M["cu"], root)
    boxes("SinyalYollari", sig, M["cu_sig"], root)
    boxes("Vialar", vias, M["cu"], root)

    # elektronlar: kahraman finin üst kısmında kaynaktan akaca
    P["electrons"] = [sphere(f"Elektron_{i}", 0.42, M["electron"], root, loc=(-4.0, 0, FIN_H * 0.75)) for i in range(18)]
    return P


# ---------------------------------------------------------------- animasyon

def animate(PA, beam, PC, M):
    interp("BEZIER")
    root, lid = PA["root"], PA["lid"]

    # kanca: hafif salınım + kazıma parlar (tarama geçerken)
    key(root, 1, loc=(0, 0, 0), rot=(0, 0, math.radians(-4)))
    key(root, F_HOOK_END, rot=(0, 0, math.radians(3)))
    key(root, F_LASER[1], rot=(0, 0, 0))
    key_input(M["etch"], "Emission Strength", [(1, 0.0), (22, 0.0), (34, 6.0), (60, 1.6), (F_LASER[0], 1.6),
                                               (F_LID_UP[1], 0.0), (F_LID_BACK[1] - 1, 0.0),
                                               (F_LID_BACK[1] + 2, 8.0), (F_LID_BACK[1] + 30, 1.6),
                                               (FRAMES - 8, 0.0)])

    # lazer kapağın çevresini dolaşır
    hx, hy = IHS_FL[0] / 2 + 0.03, IHS_FL[1] / 2 + 0.03
    path = [(hx, -hy), (hx, hy), (-hx, hy), (-hx, -hy), (hx, -hy)]
    per = [abs(path[i + 1][0] - path[i][0]) + abs(path[i + 1][1] - path[i][1]) for i in range(4)]
    tot = sum(per)
    interp("LINEAR")
    n = F_LASER[1] - F_LASER[0]
    for k in range(n + 1):
        d = tot * k / n
        i = 0
        while i < 3 and d > per[i]:
            d -= per[i]
            i += 1
        (x0, y0), (x1, y1) = path[i], path[i + 1]
        u = min(1.0, d / per[i])
        key(beam, F_LASER[0] + k, loc=(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, Z_SUB + 0.02))
    interp("CONSTANT")
    key(beam, 1, scale=(0, 0, 0))
    key(beam, F_LASER[0] - 1, scale=(0, 0, 0))
    key(beam, F_LASER[0], scale=(1, 1, 1))
    key(beam, F_LASER[1] + 1, scale=(0, 0, 0))
    interp("BEZIER")
    key_input(M["laser"], "Emission Strength", [(1, 0.0), (F_LASER[0] - 1, 0.0), (F_LASER[0] + 2, 40.0),
                                                (F_LASER[1], 40.0), (F_LASER[1] + 1, 0.0)])

    # kapak: kalkar → asılı → uçar → (dönüşte) iner ve oturur
    hover = Vector((0, 0.2, 2.1))
    key(lid, 1, loc=(0, 0, 0), rot=(0, 0, 0))
    key(lid, F_LID_UP[0], loc=(0, 0, 0), rot=(0, 0, 0))
    key(lid, F_LID_UP[1], loc=hover, rot=(math.radians(30), 0, math.radians(-6)))
    key(lid, F_LID_AWAY[0], loc=hover + Vector((0, -0.1, 0.25)), rot=(math.radians(34), 0, math.radians(-8)))
    key(lid, F_LID_AWAY[1], loc=(0, 3, 16), rot=(math.radians(-80), 0, math.radians(30)))
    key(lid, F_LID_BACK[0], loc=(0, 0, 14), rot=(math.radians(20), 0, math.radians(-40)))
    key(lid, F_LID_BACK[1] - 6, loc=(0, 0, 0.6), rot=(0, 0, math.radians(-3)))
    interp("LINEAR")
    key(lid, F_LID_BACK[1], loc=(0, 0, 0), rot=(0, 0, 0))
    interp("BEZIER")

    # termal lehim: parlar (ısı) → incelip kaybolur; dönüşte geri gelir
    tim = PA["tim"]
    key(tim, 1, scale=(1, 1, 1))
    key(tim, F_TIM[1], scale=(1, 1, 1))
    key(tim, F_TIM[2], scale=(0.9, 0.9, 0.02))
    key(tim, F_CHIP_ZOOMOUT[1], scale=(0.9, 0.9, 0.02))
    for f, hide in ((1, False), (F_TIM[2] + 1, True), (F_CHIP_ZOOMOUT[1] + 1, False)):
        tim.hide_render = hide
        tim.keyframe_insert("hide_render", frame=f)
    key(tim, F_LID_BACK[0] + 10, scale=(1, 1, 1))
    key_input(M["tim"], "Emission Strength", [(1, 0.0), (F_TIM[0], 0.0), (F_TIM[1], 12.0), (F_TIM[2], 4.0)])

    # ters dön (altın pedler) → geri
    key(root, F_FLIP[0], loc=(0, 0, 0), rot=(0, 0, 0))
    key(root, F_FLIP[1], loc=(0, 0, 0.6), rot=(math.pi, 0, math.radians(-12)))
    key(root, F_UNFLIP[0], loc=(0, 0, 0.6), rot=(math.pi, 0, math.radians(-18)))
    key(root, F_UNFLIP[1], loc=(0, 0, 0), rot=(0, 0, 0))
    key(root, FRAMES - 60, loc=(0, 0, 0), rot=(0, 0, 0))
    key(root, FRAMES, rot=(0, 0, math.radians(-4)))

    # çip devresi dalışta parlar (X-ray), çekirdek nabız atar; dönüşte söner
    key_input(M["die_glow"], "Emission Strength", [(1, 0.0), (F_DIVE[0], 0.0), (F_DIVE[1], 0.9),
                                                    (F_CUT_IN, 0.9), (F_CUT_OUT, 0.9), (F_CHIP_ZOOMOUT[1], 0.0)])
    key_input(M["die_glow2"], "Emission Strength", [(1, 0.0), (F_DIVE[0] + 8, 0.0), (F_DIVE[1] + 4, 1.1),
                                                     (F_CUT_OUT, 1.1), (F_CHIP_ZOOMOUT[1], 0.0)])
    key_input(M["core_hero"], "Emission Strength", [(1, 0.0), (F_DIVE[0], 0.0), (F_DIVE[1], 0.9),
                                                     (425, 0.9), (431, 5.0), (437, 1.5), (443, 7.0),
                                                     (F_CUT_IN, 9.0), (F_CUT_OUT, 4.0), (F_CHIP_ZOOMOUT[1], 0.0)])

    # mikro: kapı aç/kapa, kanal parlar, elektronlar akar
    gate_pairs = [(1, 0.0)]
    for a, b in F_GATE:
        gate_pairs += [(a - 1, 0.0), (a + 3, 3.0), (b - 3, 3.0), (b + 1, 0.0)]
    key_input(M["gate_hero"], "Emission Strength", gate_pairs + [(F_STROBE[0] - 1, 0.0)])
    key_input(M["channel"], "Emission Strength", [(f, v * 1.6) for f, v in gate_pairs] + [(F_STROBE[0] - 1, 0.0)])
    # strobe: 5 GHz — her 2 karede bir aç/kapa (sabit interpolasyon)
    interp("CONSTANT")
    on = True
    for f in range(F_STROBE[0], F_STROBE[1] + 1, 2):
        key_input(M["gate_hero"], "Emission Strength", [(f, 8.0 if on else 0.0)])
        key_input(M["channel"], "Emission Strength", [(f, 9.0 if on else 0.0)])
        on = not on
    key_input(M["gate_hero"], "Emission Strength", [(F_STROBE[1] + 1, 0.0)])
    key_input(M["channel"], "Emission Strength", [(F_STROBE[1] + 1, 0.0)])
    interp("BEZIER")
    key_input(M["gate_hero"], "Alpha", [(1, 0.999), (F_MICRO_BOTTOM + 60, 0.999), (F_GATE[0][0] - 6, 0.22),
                                        (F_CUT_OUT - 1, 0.22), (F_CUT_OUT, 0.999)])

    def is_on(f):
        if any(a + 2 <= f <= b for a, b in F_GATE):
            return True
        if F_STROBE[0] <= f <= F_STROBE[1]:
            return ((f - F_STROBE[0]) // 2) % 2 == 0
        return False

    interp("LINEAR")
    L0, L1, PERIOD = -4.2, 4.2, 20
    for i, e in enumerate(PC["electrons"]):
        phase = i / len(PC["electrons"])
        dy = ((i * 37) % 7 - 3) * 0.08
        dz = ((i * 53) % 5 - 2) * 0.22
        for f in range(F_GATE[0][0] - 2, F_STROBE[1] + 3):
            u = ((f - F_GATE[0][0]) / PERIOD + phase) % 1.0
            e.location = (L0 + (L1 - L0) * u, dy, FIN_H * 0.72 + dz)
            e.keyframe_insert("location", frame=f)
            s = 1.0 if is_on(f) else 0.0
            if 0.0 < u < 0.08 or u > 0.92:
                s *= 0.5
            e.scale = (s, s, s)
            e.keyframe_insert("scale", frame=f)
        e.scale = (0, 0, 0)
        e.keyframe_insert("scale", frame=1)
    interp("BEZIER")


# ---------------------------------------------------------------- kameralar

def make_camera(name, lens, clip_end):
    target = empty(f"{name}Hedef")
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.clip_start, cd.clip_end = lens, 0.005, clip_end
    cam = link(bpy.data.objects.new(name, cd))
    c = cam.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"

    def shot(frame, t, height, elev=38, azim=0, lens=None):
        if lens:
            cd.lens = lens
            cd.keyframe_insert("lens", frame=frame)
        half = math.atan(18 / (lens or cd.lens))
        e, a = math.radians(elev), math.radians(azim)
        direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        d = height / 2 / math.tan(half)
        key(target, frame, loc=Vector(t))
        key(cam, frame, loc=Vector(t) + direction * d)

    return cam, shot


HOOK = dict(t=(0.07, 0.07, 1.35), height=12.0, elev=45, azim=45)


def camera_keys(scene, PA):
    interp("BEZIER")
    camA, shotA = make_camera("KameraA", 60, 500)
    camC, shotC = make_camera("KameraC", 24, 300)

    def die_w(frame, local=(0, 0, 0)):
        scene.frame_set(frame)
        return PA["die"].matrix_world @ Vector(local)

    hk = dict(HOOK)
    shotA(1, **hk)
    shotA(F_HOOK_END, hk["t"], 11.0, elev=45, azim=45)
    shotA(F_LASER[1], (0.2, 0.2, 1.0), 8.6, elev=40, azim=36)
    shotA(F_LID_UP[1] + 6, (0, 0.1, 1.9), 9.4, elev=26, azim=14)
    shotA(F_LID_AWAY[0], (0, 0.1, 1.9), 9.0, elev=28, azim=8)
    shotA(F_TIM[2] + 4, (0, -0.2, 0.9), 8.0, elev=44, azim=0)
    shotA(F_FLIP[0], (0, -0.2, 0.9), 8.0, elev=42, azim=-6)
    shotA(F_FLIP[1] + 8, (0, -0.1, 1.0), 7.4, elev=38, azim=-14)
    shotA(F_UNFLIP[0], (0, -0.1, 1.0), 7.2, elev=40, azim=-18)
    shotA(F_DIVE[0], (0, 0, 0.5), 6.0, elev=52, azim=0)
    core = PA["core"]
    core_loc = Vector(core.location)
    shotA(F_DIVE[1], die_w(F_DIVE[1], (0, 0, 0)), 2.6, elev=86, azim=90)
    shotA(422, die_w(422, (core_loc.x * 0.5, core_loc.y * 0.5, 0)), 2.2, elev=86, azim=96)
    shotA(F_CUT_IN - 1, die_w(F_CUT_IN - 1, core_loc), 0.35, elev=88, azim=100)
    # mikro dünya: bacadan aşağı asansör
    sx, sy, _ = SHAFT
    shotC(F_CUT_IN, OC + Vector((sx, sy, 30)), 60, elev=87, azim=100, lens=24)
    shotC(F_CUT_IN + 30, OC + Vector((sx, sy, 16)), 34, elev=86, azim=96, lens=24)
    shotC(F_MICRO_BOTTOM - 10, OC + Vector((0, 2.0, 3.0)), 16, elev=55, azim=30, lens=35)
    shotC(F_MICRO_BOTTOM + 10, OC + Vector((0.4, 0.0, 3.3)), 19.5, elev=20, azim=10, lens=50)
    shotC(F_GATE[0][0], OC + Vector((0.4, 0.0, 3.1)), 18.5, elev=18, azim=6, lens=50)
    shotC(F_STROBE[1], OC + Vector((0.4, 0.0, 3.0)), 18.0, elev=16, azim=2, lens=50)
    shotC(F_CUT_OUT - 1, OC + Vector((sx, sy, 22)), 50, elev=86, azim=60, lens=24)
    # çipten geri çıkış → CPU → kanca kadrajı
    shotA(F_CUT_OUT, die_w(F_CUT_OUT, core_loc), 0.5, elev=88, azim=100)
    shotA(F_CHIP_ZOOMOUT[1], (0, 0, 0.6), 7.5, elev=50, azim=40)
    shotA(F_LID_BACK[1], (0.07, 0.07, 1.3), 11.0, elev=44, azim=43)
    shotA(F_HOME, **hk)
    shotA(FRAMES, **hk)

    # kamera geçişleri (zaman çizelgesi işaretleri)
    for f, cam in ((1, camA), (F_CUT_IN, camC), (F_CUT_OUT, camA)):
        m = scene.timeline_markers.new(f"cam{f}", frame=f)
        m.camera = cam
    scene.camera = camA
    return camA, camC


def build_world_and_lights():
    w = bpy.data.worlds.new("NeonStudyo")
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

    sun("Ana", (40, 0, -30), 4.0, (1.0, 0.97, 0.92))
    sun("Dolgu", (70, 0, 25), 1.2, (0.9, 0.95, 1.0), angle=20)
    sun("KenarSol", (75, 0, 140), 3.0, (0.55, 0.8, 1.0), angle=3)
    sun("KenarSag", (72, 0, -145), 2.5, (1.0, 0.72, 0.5), angle=3)


# ---------------------------------------------------------------- çapalar

def anchor_specs():
    zt = DIE[2] / 2
    return {
        "laser": ("LazerUc", (0, 0, 0)),
        "ihs": ("KapakUst", (IHS_TOP[0] / 2 - 0.05, -IHS_TOP[1] / 2 + 0.05, IHS_TOP[2] / 2)),
        "tim": ("Cip", (DIE[0] / 2 - 0.15, -DIE[1] / 2 + 0.1, zt + TIM_T)),
        "die": ("Cip", (-DIE[0] / 2 + 0.2, -DIE[1] / 2 + 0.08, zt)),
        "caps": ("Kondansatorler", (-1.87, -1.09, Z_SUB + 0.06)),
        "pads": ("CPU", (-1.2, 1.2, -0.01)),
        "core": ("HeroCekirdek", (0, 0, 0)),
        "cache": ("Onbellek", (0.38, -0.32, DIE[2] / 2)),
        "gpu": ("Cip", (0.82, 0.3, zt)),
        "gate": ("HeroKapi", (0, -0.6, GATE_H / 2)),
        "source": ("Kaynak", (-0.6, -0.85, 0.6)),
        "drain": ("Akac", (0.6, -0.85, 0.6)),
        "channel": ("Kanal", (0, -0.47, 0.2)),
        "wires": ("Mikro", (SHAFT[0] + 7.5, SHAFT[1] - 7.5, 16.5)),
    }


def export_anchors(scene):
    anchors = {}
    for label, (parent, local) in anchor_specs().items():
        anchors[label] = empty(f"Capa_{label}", bpy.data.objects[parent], loc=local)
    data = {"fps": FPS, "width": W, "height": H, "frames": FRAMES, "anchors": {k: [] for k in anchors}}
    cams = []
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        cam = scene.camera
        cams.append(cam.name)
        for k, e in anchors.items():
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            ok = co.z > 0
            data["anchors"][k].append([round(co.x * W, 1), round((1 - co.y) * H, 1)] if ok else [-999, -999])
    data["cuts"] = [F_CUT_IN - 1, F_CUT_OUT - 1]  # Remotion karesi
    print("kamera değişimleri:", [(i + 1, c) for i, c in enumerate(cams) if i == 0 or cams[i - 1] != c])
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    M = build_materials()
    PA = build_package(M)
    beam = build_laser(M)
    PC = build_micro(M)
    print("altın ped sayısı:", PA["n_pads"])
    fonts_ = [o for o in bpy.data.objects if o.type == "FONT"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in fonts_:
        o.select_set(True)
    bpy.context.view_layer.objects.active = fonts_[0]
    bpy.ops.object.convert(target="MESH")
    animate(PA, beam, PC, M)
    camera_keys(scene, PA)
    build_world_and_lights()
    export_anchors(scene)
    if "--anchors-only" in argv:
        return
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "cpu.blend"))

    frames = [int(a) for a in argv[argv.index("--frames") + 1].split(",")] if "--frames" in argv else \
        [1, 60, 100, 150, 200, 300, 380, 420, 445, 470, 520, 560, 630, 760, 800]
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
