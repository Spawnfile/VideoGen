"""PS5 kolu (DualSense benzeri, markasız) — X-ray tarama, kesit bıçağı, bobinli titreşim aktüatörü, tetik motoru.

Çalıştırma:
    blender-gpu -b --factory-startup -P scene.py                          # .blend + anchors.json
    blender-gpu -b --factory-startup -P scene.py -- --preview             # + ön izleme kareleri (%50)
    blender-gpu -b --factory-startup -P scene.py -- --preview --frames 1,300
    blender-gpu -b --factory-startup -P scene.py -- --draft               # tüm animasyon %25
    blender-gpu -b --factory-startup -P scene.py -- --anchors-only

1 birim = 1 cm. Kol ~16 × 10,5 cm. Dış kabuk malzemeleri "X-ray" düğüm ağacı kullanır: köke bağlı `Tarama`
boşunun yerel Y'sinden büyük olan yüzeyler hayalete döner (tarama çizgisi bu sınırda parlar).
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
sys.path.insert(0, HERE)  # dualsense_asset.py
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

FPS = 30
FRAMES = 900  # 30 sn
W, H = 1080, 1920
FONT_DISPLAY = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"
FONT_MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf"

# ---------------------------------------------------------------- zaman çizelgesi (Blender karesi)
# 90 BPM → 1 vuruş = 20 kare.
F_BUZZ = (2, 50)                # kanca: kol titrer
F_STAMP = 51                    # "YANLIŞ" damgası: titreşim donar
F_HOOK_END = 80
F_SCAN = (84, 146)              # X-ray tarama: üstten (arka) alta (tutamaklar)
F_TURN = (150, 330)             # etiketler sırasında hafif dönüş
F_LIFT = (331, 371)             # aktüatör tutamaktan çıkıp kameraya gelir
F_CUT = (383, 399)              # kesit bıçağı boydan geçer
F_SPLIT = (399, 419)            # ön yarım kabuk ayrılır
F_OSC = (486, 616)              # mekanizma: mıknatıs ileri-geri
F_CLOSE = (618, 632)            # kabuk kapanır
F_BACK = (632, 656)             # aktüatör tutamağa döner
F_PRESS1 = (676, 698)           # tetik serbest basış (motor boşta)
F_MOTOR = (704, 724)            # motor döner, kol tetiğe dayanır
F_PRESS2 = (728, 760)           # basış → direnç, geri itme
F_REWIND = (766, 818)           # ⏪ tarama geri: kabuk aşağıdan yukarı kapanır
F_HOME = 836
F_IMU = 240                     # hareket sensörü etiketi (parlama)
SCAN_Y = (6.0, -6.5)
ROOT_TURN = 11.0               # etiketler sırasında kökün Z dönüşü (°)            # tarama boşunun kök-yerel Y başlangıç/bitişi

# kol ölçüleri (Sketchfab modeli: 16 × 10,4 × 6,6 cm; üst yüz ~z 2,5, gövde altı ~z −0,7, tutamaklar x≈±6, y −2,5…−5)
ACT_L, ACT_R = 2.4, 0.55        # aktüatör boy, yarıçap
TRIG_X = 4.9                    # tetik merkez x
TP_Y, TP_Z = 3.0, 2.5           # dokunmatik panel üst yüz (baskı merkezi)
STICK_XY = (2.5, 0.0)

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
    bm = bmesh.new()
    for x, y, z, sx, sy, sz in specs:
        bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(x, y, z, sx, sy, sz))
    return mesh_obj(name, bm, mat, parent)


def cyl_bm(bm, r, length, axis="Z", center=(0, 0, 0), r2=None, seg=32):
    """bmesh'e eksen boyunca silindir/koni ekle."""
    g = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=length)
    rot = {"Z": Matrix.Identity(4), "X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ rot, verts=g["verts"])
    return g


def cylinder(name, r, length, mat, parent=None, loc=(0, 0, 0), axis="Z", seg=32, r2=None, bevel=0.0):
    bm = bmesh.new()
    cyl_bm(bm, r, length, axis, seg=seg, r2=r2)
    o = mesh_obj(name, bm, mat, parent, smooth=True)
    o.location = loc
    if bevel:
        add_bevel(o, bevel, 2)
    return o


def half_tube(name, ro, ri, length, mat, parent, keep_pos, seg=48):
    """X ekseni boyunca boru; z=0 düzleminden ikiye kesilmiş yarısı (keep_pos: +Z yarısı)."""
    bm = bmesh.new()
    cyl_bm(bm, ro, length, axis="X", seg=seg)
    o = mesh_obj(name, bm, mat, None, smooth=True, sharp_deg=50)
    inner = cylinder(name + "_ic", ri, length * 1.2, mat, axis="X", seg=seg)
    boolean(o, inner)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1),
                           clear_inner=keep_pos, clear_outer=not keep_pos)
    bm.to_mesh(o.data)
    bm.free()
    o.parent = parent
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


def helix(name, r, length, turns, wire, mat, parent=None, loc=(0, 0, 0)):
    """X ekseni boyunca 0 → length uzanan yay."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = wire
    cu.bevel_resolution = 3
    sp = cu.splines.new("POLY")
    n = int(turns * 24)
    sp.points.add(n)
    for i in range(n + 1):
        u = i / n
        a = u * turns * 2 * math.pi
        sp.points[i].co = (u * length, r * math.cos(a), r * math.sin(a), 1)
    cu.materials.append(mat)
    o = link(bpy.data.objects.new(name, cu), parent)
    o.location = loc
    return o


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


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


SCAN = {}  # tarama boşu (X-ray malzemeleri buna bakar)


def xray_material(name, color, rough=0.45, metallic=0.0, coat=0.0, emission=None, strength=0.0):
    m = material(name, color, metallic=metallic, rough=rough, coat=coat, emission=emission, strength=strength)
    return xrayify(m)


def xrayify(m):
    """Dış kabuk: tarama boşunun yerel +Y tarafında hayalet (kenar parlaması), sınırda parlak tarama çizgisi.
    Hem kendi malzemelerimize hem içe aktarılan modelin dokulu malzemelerine uygulanır."""
    m.use_transparent_shadow = True
    nt = m.node_tree
    N, Lk = nt.nodes, nt.links
    p = N["Principled BSDF"]
    outn = N["Material Output"]
    tc = N.new("ShaderNodeTexCoord")
    tc.object = SCAN["obj"]
    sep = N.new("ShaderNodeSeparateXYZ")
    Lk.new(tc.outputs["Object"], sep.inputs[0])
    scanned = N.new("ShaderNodeMapRange")          # y>0 → 1 (taranmış)
    scanned.inputs["From Min"].default_value = -0.05
    scanned.inputs["From Max"].default_value = 0.05
    Lk.new(sep.outputs["Y"], scanned.inputs["Value"])
    # hayalet: kenarda camgöbeği parıltı, ortası şeffaf
    lw = N.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    ghost_fac = N.new("ShaderNodeMath")
    ghost_fac.name = "GhostK"
    ghost_fac.operation = "MULTIPLY_ADD"
    ghost_fac.inputs[1].default_value = 0.75
    ghost_fac.inputs[2].default_value = 0.04
    ghost_fac.use_clamp = True
    Lk.new(lw.outputs["Facing"], ghost_fac.inputs[0])
    tr = N.new("ShaderNodeBsdfTransparent")
    ge = N.new("ShaderNodeEmission")
    ge.name = "GhostE"
    ge.inputs["Color"].default_value = (*hex_rgb("#8fd6ff"), 1)
    ge.inputs["Strength"].default_value = 1.1
    ghost = N.new("ShaderNodeMixShader")
    Lk.new(ghost_fac.outputs[0], ghost.inputs[0])
    Lk.new(tr.outputs[0], ghost.inputs[1])
    Lk.new(ge.outputs[0], ghost.inputs[2])
    mix = N.new("ShaderNodeMixShader")
    Lk.new(scanned.outputs[0], mix.inputs[0])
    Lk.new(p.outputs[0], mix.inputs[1])
    Lk.new(ghost.outputs[0], mix.inputs[2])
    # tarama çizgisi: |y| < 0.16 bandında parlak emission
    ab = N.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    Lk.new(sep.outputs["Y"], ab.inputs[0])
    band = N.new("ShaderNodeMapRange")
    band.inputs["From Min"].default_value = 0.0
    band.inputs["From Max"].default_value = 0.16
    band.inputs["To Min"].default_value = 14.0
    band.inputs["To Max"].default_value = 0.0
    Lk.new(ab.outputs[0], band.inputs["Value"])
    be = N.new("ShaderNodeEmission")
    be.inputs["Color"].default_value = (*hex_rgb("#bfe8ff"), 1)
    Lk.new(band.outputs[0], be.inputs["Strength"])
    add = N.new("ShaderNodeAddShader")
    Lk.new(mix.outputs[0], add.inputs[0])
    Lk.new(be.outputs[0], add.inputs[1])
    Lk.new(add.outputs[0], outn.inputs["Surface"])
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
        obj.scale = scale
        obj.keyframe_insert("scale", frame=frame)


def key_input(mat, input_name, pairs):
    inp = mat.node_tree.nodes["Principled BSDF"].inputs[input_name]
    for f, v in pairs:
        inp.default_value = v
        inp.keyframe_insert("default_value", frame=f)


def interp(kind):
    bpy.context.preferences.edit.keyframe_new_interpolation_type = kind


def boolean(target, cutter, op="DIFFERENCE"):
    m = target.modifiers.new("cut", "BOOLEAN")
    m.operation, m.solver, m.object = op, "EXACT", cutter
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter)


def basis_quat(x, z):
    """Yerel X ve Z eksenleri verilen yön (dünya/ebeveyn uzayında) → quaternion."""
    x = Vector(x).normalized()
    z = (Vector(z) - Vector(z).dot(x) * x).normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed().to_quaternion()


# ---------------------------------------------------------------- malzemeler

def build_materials():
    M = {
        # iç parçalar (opak)
        "pcb": material("PCB", hex_rgb("#11563a"), rough=0.38, coat=0.4),
        "pcb_line": material("PCBYol", hex_rgb("#c9a14a"), metallic=1.0, rough=0.3),
        "chip": material("Cip", hex_rgb("#15171d"), metallic=0.4, rough=0.25, coat=0.6),
        "silver": material("Gumus", hex_rgb("#c7ccd4"), metallic=1.0, rough=0.22),
        "steel": material("Celik", hex_rgb("#8a919c"), metallic=1.0, rough=0.3),
        "batt": material("Pil", hex_rgb("#1f3d8a"), rough=0.35, coat=0.5),
        "batt_label": material("PilEtiket", hex_rgb("#e8ecf2"), rough=0.5),
        "batt_text": material("PilYazi", hex_rgb("#1f3d8a"), rough=0.5),
        "rubber": material("Kauçuk", hex_rgb("#16171b"), rough=0.75),
        "plastic_d": material("KoyuPlastik", hex_rgb("#22252c"), rough=0.5),
        "ribbon": material("Serit", hex_rgb("#e3962f"), rough=0.4, emission=hex_rgb("#e3962f"), strength=0.08),
        "wire_r": material("KabloKirmizi", hex_rgb("#d83a2e"), rough=0.4),
        "wire_k": material("KabloSiyah", hex_rgb("#1a1a1e"), rough=0.4),
        "spk_cone": material("HoparlorKoni", hex_rgb("#3a3d46"), rough=0.6),
        "act": material("Aktuator", hex_rgb("#ff7a3d"), rough=0.35, coat=0.6,
                        emission=hex_rgb("#ff7a3d"), strength=0.0),
        "act_hero": material("AktuatorHero", hex_rgb("#ff7a3d"), rough=0.35, coat=0.6,
                             emission=hex_rgb("#ff7a3d"), strength=0.0),
        "act_in": material("AktuatorIc", hex_rgb("#2b2f38"), rough=0.5),
        "coil": material("Bobin", hex_rgb("#c46a2c"), metallic=1.0, rough=0.28,
                         emission=hex_rgb("#ffb347"), strength=0.0),
        "mag_n": material("MiknatisN", hex_rgb("#e0453a"), metallic=0.3, rough=0.3, coat=0.5,
                          emission=hex_rgb("#e0453a"), strength=0.05),
        "mag_s": material("MiknatisS", hex_rgb("#3d7bff"), metallic=0.3, rough=0.3, coat=0.5,
                          emission=hex_rgb("#3d7bff"), strength=0.05),
        "mass": material("Kutle", hex_rgb("#9aa1ad"), metallic=1.0, rough=0.25),
        "spring": material("Yay", hex_rgb("#dfe3ea"), metallic=1.0, rough=0.2,
                           emission=hex_rgb("#ffffff"), strength=0.12),
        "blade": material("Bicak", hex_rgb("#dff4ff"), emission=hex_rgb("#bfe8ff"), strength=0.0),
        "motor": material("Motor", hex_rgb("#c7ccd4"), metallic=1.0, rough=0.25,
                          emission=hex_rgb("#8fd6ff"), strength=0.0),
        "gear": material("Disli", hex_rgb("#f2f2ee"), rough=0.35, emission=hex_rgb("#ffd23f"), strength=0.0),
        "brass": material("Pirinc", hex_rgb("#d8a64a"), metallic=1.0, rough=0.25, emission=hex_rgb("#ffb030"), strength=0.1),
        "trigger": material("Tetik", hex_rgb("#1b1d22"), rough=0.45, coat=0.4),
        "light": material("IsikBar", hex_rgb("#3d7bff"), emission=hex_rgb("#4d9bff"), strength=6.0),
    }
    M["imu"] = material("HareketSensoru", hex_rgb("#1b1e26"), metallic=0.4, rough=0.25, coat=0.6,
                        emission=hex_rgb("#8fd6ff"), strength=0.0)
    # dış kabuktaki kendi parçalarımız (X-ray)
    M["btn"] = xray_material("Tus", hex_rgb("#2a2d35"), rough=0.3, coat=0.6)
    M["print"] = xray_material("Baski", hex_rgb("#d9e8ff"), rough=0.4,
                               emission=hex_rgb("#cfe3ff"), strength=0.5)
    M["tp_print"] = xray_material("PanelBaski", hex_rgb("#1c2232"), rough=0.35,
                                  emission=hex_rgb("#4d9bff"), strength=0.0)
    return M


# ---------------------------------------------------------------- kol

def build_controller(M, root, scan):
    """Dış kabuk = Sketchfab DualSense modeli (CC BY 4.0), malzemeleri X-ray'e sarılır."""
    import dualsense_asset as DA
    P = {"root": root, "scan": scan}
    R = DA.import_dualsense(root)
    # tetikler opak kalsın (tetik sahnesinde mekanizmayla birlikte görünür): X-ray'siz malzeme kopyası
    for t in R["triggers"].values():
        for i, m in enumerate(t.data.materials):
            t.data.materials[i] = m.copy()
    for m in R["materials"]:
        xrayify(m)
    P["shell"] = R["shell"]
    P["model_trig"] = R["triggers"]
    # PS tuşu üstünü kanal logolu kapakla ört (logo geometrisi silindi, iz kalmasın)
    cap = cylinder("KanalTusu", 0.56, 0.1, M["btn"], root, loc=(0, 0.16, 2.17), seg=48, bevel=0.03)
    bm = bmesh.new()
    s_, t_ = 0.42, 0.05
    z = 0.06
    for sx, sy, ox, oy in ((s_, t_, 0, s_ / 2 - t_ / 2), (s_, t_, 0, -s_ / 2 + t_ / 2), (t_, s_, s_ / 2 - t_ / 2, 0), (t_, s_, -s_ / 2 + t_ / 2, 0)):
        bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(ox, oy, z, sx, sy, 0.008))
    bmesh.ops.create_cube(bm, size=1.0, matrix=_mat(0, 0, z, s_ * 0.42, s_ * 0.42, 0.008))
    mesh_obj("TusLogo", bm, M["print"], cap)
    # dokunmatik panele baskı: WHAT'S INSIDE + @whatsinit.lab (yüzeye büzülerek oturur)
    tp = [o for o in R["shell"] if o.name == "defaultMaterial"][0]
    for name, body, size, loc, font in (("Yazi_WhatsInside", "WHAT'S INSIDE", 0.74, (0, TP_Y + 0.15, TP_Z + 0.4), FONT_DISPLAY),
                                        ("Yazi_Kanal", "@whatsinit.lab", 0.32, (0, TP_Y - 0.6, TP_Z + 0.4), FONT_MONO)):
        o = text(name, body, size, M["tp_print"], root, loc, font=font)
        sw = o.modifiers.new("yuzey", "SHRINKWRAP")
        sw.target, sw.wrap_method, sw.use_project_z, sw.use_negative_direction = tp, "PROJECT", True, True
        sw.use_positive_direction = False
        sw.offset = 0.012
    return P


def build_internals(M, P):
    root = P["root"]
    I = {}
    # anakart: dokunmatik panelin altında
    zp = 0.95
    pcb = box("Anakart", (9.0, 2.2, 0.12), (0, 2.3, zp), M["pcb"], root, bevel=0.05)
    I["pcb"] = pcb
    rnd = random.Random(7)
    chips = [(0.0, 2.3, zp + 0.12, 1.1, 1.1, 0.14), (-1.7, 2.6, zp + 0.1, 0.7, 0.5, 0.1), (-3.0, 1.9, zp + 0.1, 0.6, 0.4, 0.1),
             (2.9, 2.75, zp + 0.1, 0.5, 0.5, 0.1)]
    boxes("Cipler", chips, M["chip"], root)
    box("HareketSensoru", (0.55, 0.55, 0.12), (1.6, 1.85, zp + 0.11), M["imu"], root, bevel=0.02)
    lines, caps = [], []
    for i in range(22):
        lines.append((rnd.uniform(-4.0, 3.4), rnd.uniform(1.35, 3.25), zp + 0.065, rnd.uniform(0.4, 1.2), 0.025, 0.006))
    for i in range(30):
        caps.append((rnd.uniform(-4.2, 4.2), rnd.uniform(1.3, 3.3), zp + 0.09, 0.12, 0.07, 0.06))
    boxes("AnakartYollari", lines, M["pcb_line"], root)
    boxes("SMD", caps, M["steel"], root)
    box("USB-C", (0.95, 0.75, 0.32), (0, 3.9, zp + 0.1), M["silver"], root, bevel=0.1)

    # pil: ortada, anakartın önünde-altında
    zb = -0.25
    batt = box("Pil", (3.2, 2.0, 0.75), (0, 0.15, zb), M["batt"], root, bevel=0.12, segments=3)
    I["batt"] = batt
    box("PilEtiketi", (2.4, 1.1, 0.02), (0, 0.15, zb + 0.385), M["batt_label"], root)
    text("PilYazi", "Li-ion  1560 mAh", 0.25, M["batt_text"], root, (0, 0.15, zb + 0.405))
    boxes("PilKablo", [(-0.25, 1.25, zb + 0.3, 0.08, 0.5, 0.08)], M["wire_r"], root)
    boxes("PilKablo2", [(0.0, 1.25, zb + 0.3, 0.08, 0.5, 0.08)], M["wire_k"], root)

    # hoparlör + mikrofon: ön ortada
    spk = empty("Hoparlor", root, loc=(0, -1.3, 0.55))
    cylinder("HoparlorKasa", 0.62, 0.3, M["plastic_d"], spk, seg=48)
    cylinder("HoparlorHalka", 0.55, 0.04, M["silver"], spk, loc=(0, 0, 0.16), seg=48)
    cylinder("HoparlorKoni", 0.46, 0.06, M["spk_cone"], spk, loc=(0, 0, 0.16), r2=0.2, seg=48)
    I["spk"] = spk
    mic = empty("Mikrofon", root, loc=(0.85, -1.15, 0.75))
    cylinder("MikrofonGovde", 0.18, 0.16, M["silver"], mic, seg=24)
    cylinder("MikrofonDelik", 0.07, 0.02, M["chip"], mic, loc=(0, 0, 0.09), seg=16)
    I["mic"] = mic

    # analog modüller (çubukların altında)
    for sx in (-1, 1):
        x, y = sx * STICK_XY[0], STICK_XY[1]
        box(f"CubukModul_{sx}", (1.8, 1.8, 0.95), (x, y, 0.75), M["plastic_d"], root, bevel=0.08)
        box(f"CubukKart_{sx}", (2.2, 2.2, 0.08), (x, y, 0.22), M["pcb"], root)
        boxes(f"CubukPot_{sx}", [(x + sx * 1.0, y, 0.6, 0.25, 0.8, 0.55), (x, y - 1.0, 0.6, 0.8, 0.25, 0.55)], M["batt_label"], root)

    # şerit kablolar: anakarttan tutamaklara ve çubuklara
    boxes("SeritKablolar", [(4.6, -0.9, -0.3, 0.35, 2.6, 0.02), (-4.6, -0.9, -0.3, 0.35, 2.6, 0.02),
                            (0, 1.15, 0.85, 0.6, 0.4, 0.02)], M["ribbon"], root)

    # tetik mekanizmaları (her iki yanda; sağdaki çapalı)
    for sx in (-1, 1):
        I[sx] = build_trigger(M, root, sx, P["model_trig"].get(sx))

    # sol aktüatör (basit)
    q, loc = grip_pose(-1)
    a = empty("AktuatorSol", root, loc=loc)
    a.rotation_mode = "QUATERNION"
    a.rotation_quaternion = q
    cylinder("AktuatorSolGovde", ACT_R, ACT_L, M["act"], a, axis="X", bevel=0.06)
    I["actL"] = a
    return I


def grip_pose(sx):
    """Tutamak ekseni: (±5.75, −1.9, −0.6) → (±6.35, −5.0, −1.9); aktüatör ortada."""
    a, b = Vector((sx * 5.75, -2.0, -0.55)), Vector((sx * 6.3, -4.9, -1.85))
    loc = (a + b) / 2
    return basis_quat(b - a, (0, 0, 1)), loc


TRIG_PIV = (3.35, -0.05)        # model tetiğinin menteşesi (y, z)
GEAR_YZ = (2.75, -0.95)         # sektör dişli merkezi
TRIG_REST, TRIG_FULL, TRIG_STOP = 0.0, -20.0, -7.0   # pivot açıları (°): basınca uç gövdeye (−y) gelir
GEAR_ON = 58.0                  # motor dişliyi bu kadar çevirir → kol tetiğin önüne girer


def build_trigger(M, root, sx, model):
    T = {}
    x = sx * TRIG_X
    xm = x - sx * 0.35
    piv = empty(f"TetikPivot_{sx}", root, loc=(x, *TRIG_PIV))
    if model is not None:  # modelin kendi L2/R2 parçası pivota taşınır
        model.data.transform(Matrix.Translation(-Vector((x, *TRIG_PIV))))
        model.parent = piv
        model.location = (0, 0, 0)
    T["pivot"], T["lever"] = piv, model
    gear = empty(f"SektorDisli_{sx}", root, loc=(xm, *GEAR_YZ))
    bm = bmesh.new()
    cyl_bm(bm, 0.45, 0.16, axis="X", seg=40)
    for k in range(18):
        a = k / 18 * 2 * math.pi
        bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0.5 * math.cos(a), 0.5 * math.sin(a)))
                              @ Matrix.Rotation(a, 4, "X") @ Matrix.Diagonal((0.16, 0.12, 0.1, 1)))
    mesh_obj(f"SektorGovde_{sx}", bm, M["gear"], gear, smooth=True, sharp_deg=30)
    arm = box(f"DirencKol_{sx}", (0.18, 0.24, 1.0), (0, 0, -0.6), M["gear"], gear, bevel=0.06)
    wy = GEAR_YZ[0] - 0.62
    mot = empty(f"Motor_{sx}", root, loc=(xm, wy, GEAR_YZ[1] + 0.4))
    cylinder(f"MotorGovde_{sx}", 0.36, 1.0, M["motor"], mot, loc=(0, 0, 0.45), bevel=0.04)
    cylinder(f"MotorKapak_{sx}", 0.3, 0.12, M["brass"], mot, loc=(0, 0, 1.0))
    worm = empty(f"Sonsuz_{sx}", mot, loc=(0, 0, 0))
    cylinder(f"SonsuzMil_{sx}", 0.06, 1.0, M["steel"], worm, loc=(0, 0, -0.35))
    h = helix(f"SonsuzDis_{sx}", 0.16, 0.7, 5, 0.05, M["brass"], worm, loc=(0, 0, -0.75))
    h.rotation_euler = (0, math.radians(-90), 0)  # X → Z
    T["motor"], T["worm"], T["gear"], T["arm"] = mot, worm, gear, arm
    return T


def build_hero(M, root):
    """Sağ tutamaktaki titreşim aktüatörü: boydan ikiye kesilen kabuk, bobin, mıknatıs + kütle, iki yay."""
    lift = empty("HeroAktuator", root)
    lift.rotation_mode = "QUATERNION"
    q, loc = grip_pose(1)
    lift.location, lift.rotation_quaternion = loc, q
    Hh = {"lift": lift}
    L, R, t = ACT_L, ACT_R, 0.05

    def half_shell(name, keep_pos):
        bm = bmesh.new()
        cyl_bm(bm, R, L, axis="X", seg=48)
        o = mesh_obj(name, bm, M["act_hero"], None, smooth=True, sharp_deg=50)
        inner = cylinder(name + "_ic", R - t, L - 2 * t, M["act_hero"], axis="X", seg=48)
        boolean(o, inner)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(0, 0, 1),
                               clear_inner=keep_pos, clear_outer=not keep_pos)
        bm.to_mesh(o.data)
        bm.free()
        o.data.materials.clear()
        o.data.materials.append(M["act_hero"])
        o.data.materials.append(M["act_in"])
        # iç yüzeyler koyu
        for poly in o.data.polygons:
            c = Vector(poly.center)
            if math.hypot(c.y, c.z) < R - t / 2 and abs(c.x) < L / 2 - t / 2:
                poly.material_index = 1
        return o

    top_e = empty("HeroUstYari", lift)
    Hh["top"] = top_e
    top = half_shell("HeroKabukUst", True)
    top.parent = top_e
    bot = half_shell("HeroKabukAlt", False)
    bot.parent = lift
    Hh["bot"] = bot
    # bobin (sabit, ortada) — kesitte arka yarısı kalır, mıknatıs önünde görünür
    coil = half_tube("Bobin", 0.47, 0.36, 0.95, M["coil"], lift, keep_pos=False)
    rings = bmesh.new()
    for k in range(10):
        g = bmesh.ops.create_cone(rings, cap_ends=False, segments=48, radius1=0.48, radius2=0.48, depth=0.035)
        bmesh.ops.transform(rings, matrix=Matrix.Translation((-0.42 + k * 0.093, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, "Y"), verts=g["verts"])
    bmesh.ops.bisect_plane(rings, geom=rings.verts[:] + rings.edges[:] + rings.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=True)
    mesh_obj("BobinSargi", rings, M["coil"], lift, smooth=True)
    # ön yarım bobin: kabukla birlikte ayrılır
    half_tube("BobinOn", 0.47, 0.36, 0.95, M["coil"], top_e, keep_pos=True)
    Hh["coil"] = coil
    # hareketli grup: mıknatıs (N/S) + kütleler
    mover = empty("Hareketli", lift)
    cylinder("MiknatisN", 0.29, 0.55, M["mag_n"], mover, loc=(0.275, 0, 0), axis="X", seg=40)
    cylinder("MiknatisS", 0.29, 0.55, M["mag_s"], mover, loc=(-0.275, 0, 0), axis="X", seg=40)
    for sx in (-1, 1):
        cylinder(f"Kutle_{sx}", 0.42, 0.26, M["mass"], mover, loc=(sx * 0.73, 0, 0), axis="X", seg=40, bevel=0.03)
    Hh["mover"] = mover
    # yaylar: kabuk iç ucundan kütle yüzüne
    Hh["springs"] = []
    end = L / 2 - t
    for sx in (-1, 1):
        sp = helix(f"Yay_{sx}", 0.27, 0.3, 4, 0.03, M["spring"], lift, loc=(sx * end, 0, 0))
        sp.rotation_euler = (0, 0, 0 if sx < 0 else math.pi)
        Hh["springs"].append((sx, sp))
    # uç bağlantıları
    boxes("HeroPinler", [(-L / 2 - 0.08, 0.15, -0.1, 0.16, 0.1, 0.06), (-L / 2 - 0.08, -0.15, -0.1, 0.16, 0.1, 0.06)], M["brass"], lift)
    # kesit bıçağı
    blade = empty("Bicak", lift, loc=(-L / 2 - 0.4, 0, 0))
    box("BicakIsik", (0.035, 1.7, 0.012), (0, 0, 0), M["blade"], blade)
    Hh["blade"] = blade
    return Hh


# ---------------------------------------------------------------- animasyon

def animate(P, I, Hh, M):
    interp("BEZIER")
    root, scan = P["root"], P["scan"]

    # kanca: titreşim (rastgele sarsıntı, genlik dalgalanır) → damga anında donar
    key(root, 1, loc=(0, 0, 0), rot=(0, 0, 0))
    interp("LINEAR")
    rnd = random.Random(5)
    for f in range(F_BUZZ[0], F_BUZZ[1] + 1):
        u = (f - F_BUZZ[0]) / (F_BUZZ[1] - F_BUZZ[0])
        amp = (0.55 + 0.45 * abs(math.sin(f * 0.35))) * min(1.0, u * 6 + 0.3)
        key(root, f, loc=(rnd.uniform(-1, 1) * 0.06 * amp, rnd.uniform(-1, 1) * 0.06 * amp, rnd.uniform(-1, 1) * 0.04 * amp),
            rot=(rnd.uniform(-1, 1) * math.radians(0.7) * amp, rnd.uniform(-1, 1) * math.radians(0.9) * amp,
                 rnd.uniform(-1, 1) * math.radians(0.6) * amp))
    interp("BEZIER")
    key(root, F_STAMP, loc=(0, 0, 0), rot=(0, 0, 0))
    key(root, F_TURN[0], loc=(0, 0, 0), rot=(0, 0, 0))
    key(root, F_TURN[1], rot=(0, 0, math.radians(ROOT_TURN)))
    key(root, F_REWIND[0], rot=(0, 0, math.radians(ROOT_TURN)))
    key(root, F_REWIND[1], rot=(0, 0, 0))
    key(root, FRAMES, rot=(0, 0, 0))

    # X-ray tarama ve geri sarma
    key(scan, 1, loc=(0, SCAN_Y[0], 0))
    key(scan, F_SCAN[0], loc=(0, SCAN_Y[0], 0))
    key(scan, F_SCAN[1], loc=(0, SCAN_Y[1], 0))
    key(scan, F_REWIND[0] + 6, loc=(0, SCAN_Y[1], 0))
    key(scan, F_REWIND[1] - 4, loc=(0, SCAN_Y[0], 0))

    # aktüatörler etiket anında nabız atar (kahraman)
    key_input(M["act_hero"], "Emission Strength", [(1, 0.0), (296, 0.0), (302, 2.5), (310, 0.4), (316, 2.5), (324, 0.4),
                                                   (F_LIFT[1], 0.15), (F_BACK[1], 0.15), (F_BACK[1] + 10, 0.0)])
    key_input(M["act"], "Emission Strength", [(1, 0.0), (296, 0.0), (302, 2.5), (310, 0.4), (316, 2.5), (324, 0.0)])

    # kahraman: tutamaktan çıkar → kameraya dönük dikey sunum → geri
    lift = Hh["lift"]
    q0, l0 = grip_pose(1)
    rz = Matrix.Rotation(math.radians(-ROOT_TURN), 3, "Z")  # kök dönük → kök uzayına çevir
    cam_dir = Vector((math.sin(math.radians(PRES_AZ)), -math.cos(math.radians(PRES_AZ)), 0))
    q1 = basis_quat(rz @ Vector((0, 0, 1)), rz @ cam_dir)
    l1 = rz @ PRES_LOC
    key(lift, 1, loc=l0, quat=q0)
    key(lift, F_LIFT[0], loc=l0, quat=q0)
    mid = l0.lerp(l1, 0.5) + Vector((0, 0, 1.2))
    key(lift, F_LIFT[0] + 16, loc=mid, quat=q0.slerp(q1, 0.55))
    key(lift, F_LIFT[1], loc=l1, quat=q1)
    key(lift, F_BACK[0], loc=l1, quat=q1)
    key(lift, F_BACK[0] + 12, loc=mid, quat=q0.slerp(q1, 0.45))
    key(lift, F_BACK[1], loc=l0, quat=q0)

    # bıçak boydan geçer (yerel X), sonra ön yarım kabuk (yerel +Z = kameraya) ayrılır
    blade = Hh["blade"]
    key(blade, 1, scale=(0, 0, 0))
    interp("CONSTANT")
    key(blade, F_CUT[0] - 1, scale=(0, 0, 0))
    key(blade, F_CUT[0], scale=(1, 1, 1))
    key(blade, F_CUT[1] + 2, scale=(0, 0, 0))
    interp("LINEAR")
    key(blade, F_CUT[0], loc=(-ACT_L / 2 - 0.3, 0, 0))
    key(blade, F_CUT[1], loc=(ACT_L / 2 + 0.3, 0, 0))
    interp("BEZIER")
    key_input(M["blade"], "Emission Strength", [(1, 0.0), (F_CUT[0] - 1, 0.0), (F_CUT[0], 40.0), (F_CUT[1], 40.0), (F_CUT[1] + 2, 0.0)])
    top = Hh["top"]
    key(top, 1, loc=(0, 0, 0), rot=(0, 0, 0))
    key(top, F_SPLIT[0], loc=(0, 0, 0), rot=(0, 0, 0))
    key(top, F_SPLIT[0] + 8, loc=(0.05, 0.25, 0.7), rot=(math.radians(-10), 0, 0))
    key(top, F_SPLIT[1], loc=(0.4, 2.4, 2.2), rot=(math.radians(-55), math.radians(15), 0))
    key(top, F_CLOSE[0], loc=(0.4, 2.4, 2.2), rot=(math.radians(-55), math.radians(15), 0))
    key(top, F_CLOSE[1], loc=(0, 0, 0), rot=(0, 0, 0))

    # mekanizma: hareketli grup ileri-geri, bobin akım yönüne göre parlar, yaylar sıkışır/uzar
    mover = Hh["mover"]
    coil_m = M["coil"].node_tree.nodes["Principled BSDF"]
    key(mover, 1, loc=(0, 0, 0))
    interp("LINEAR")
    A = 0.13
    phase = 0.0
    prev = None
    for f in range(F_OSC[0], F_OSC[1] + 1):
        # yavaş çekim (periyot 36) → normal (14) → "desenler": kısa darbeler
        if f < 540:
            per = 36
        elif f < 575:
            per = 16
        else:
            per = 10
        phase += 2 * math.pi / per
        env = min(1.0, (f - F_OSC[0]) / 6) * min(1.0, (F_OSC[1] - f) / 6)
        if f >= 575:  # "yağmur damlası": darbe-boşluk
            env *= 1.0 if ((f - 575) // 6) % 2 == 0 else 0.25
        m = A * env * math.sin(phase)
        key(mover, f, loc=(m, 0, 0))
        cur = math.cos(phase) * env  # hız ~ akım
        coil_m.inputs["Emission Strength"].default_value = 1.5 + 5.0 * abs(cur)
        coil_m.inputs["Emission Strength"].keyframe_insert("default_value", frame=f)
        col = hex_rgb("#ffb347") if cur >= 0 else hex_rgb("#5fb8ff")
        coil_m.inputs["Emission Color"].default_value = (*col, 1)
        coil_m.inputs["Emission Color"].keyframe_insert("default_value", frame=f)
        for sx, sp in Hh["springs"]:
            gap = 0.3 - sx * m  # sağ yay (sx=+1): kütle sağa gidince sıkışır
            sp.scale = (gap / 0.3, 1, 1)
            sp.keyframe_insert("scale", frame=f)
    interp("BEZIER")
    key(mover, F_OSC[1] + 2, loc=(0, 0, 0))
    key_input(M["coil"], "Emission Strength", [(1, 0.0), (F_OSC[0] - 1, 0.0), (F_OSC[1] + 3, 0.0)])
    for _, sp in Hh["springs"]:
        key(sp, 1, scale=(1, 1, 1))
        key(sp, F_OSC[0] - 1, scale=(1, 1, 1))
        key(sp, F_OSC[1] + 2, scale=(1, 1, 1))

    # tetik: serbest basış → motor döner, direnç kolu dayanır → basış durur + geri iter
    T = I[1]
    piv, worm, gear = T["pivot"], T["worm"], T["gear"]
    rest, full, stop = math.radians(TRIG_REST), math.radians(TRIG_FULL), math.radians(TRIG_STOP)
    key(piv, 1, rot=(rest, 0, 0))
    key(piv, F_PRESS1[0], rot=(rest, 0, 0))
    key(piv, F_PRESS1[0] + 10, rot=(full, 0, 0))
    key(piv, F_PRESS1[1], rot=(rest, 0, 0))
    key(piv, F_PRESS2[0], rot=(rest, 0, 0))
    key(piv, F_PRESS2[0] + 8, rot=(stop, 0, 0))
    for k, f in enumerate(range(F_PRESS2[0] + 9, F_PRESS2[0] + 21, 2)):
        key(piv, f, rot=(stop + (math.radians(1.6) if k % 2 else -math.radians(0.6)), 0, 0))
    key(piv, F_PRESS2[1] - 4, rot=(stop + math.radians(3), 0, 0))
    key(piv, F_PRESS2[1] + 4, rot=(rest, 0, 0))
    key(worm, 1, rot=(0, 0, 0))
    key(worm, F_MOTOR[0], rot=(0, 0, 0))
    key(worm, F_MOTOR[1], rot=(0, 0, math.radians(360 * 5)))
    key(worm, F_PRESS2[1] + 6, rot=(0, 0, math.radians(360 * 5)))
    key(worm, F_REWIND[0] + 10, rot=(0, 0, 0))
    key(gear, 1, rot=(0, 0, 0))
    key(gear, F_MOTOR[0], rot=(0, 0, 0))
    key(gear, F_MOTOR[1], rot=(math.radians(GEAR_ON), 0, 0))
    key(gear, F_PRESS2[1] + 6, rot=(math.radians(GEAR_ON), 0, 0))
    key(gear, F_REWIND[0] + 10, rot=(0, 0, 0))
    key_input(M["motor"], "Emission Strength", [(1, 0.0), (F_MOTOR[0] - 1, 0.0), (F_MOTOR[0] + 3, 1.6), (F_MOTOR[1], 1.6),
                                                (F_PRESS2[1], 0.6), (F_REWIND[0], 0.0)])
    key_input(M["gear"], "Emission Strength", [(1, 0.0), (F_MOTOR[0], 0.0), (F_MOTOR[1], 0.8), (F_PRESS2[0] + 8, 2.5),
                                               (F_PRESS2[1], 0.6), (F_REWIND[0], 0.0)])
    # tetik sahnesinde hayalet kabuk incelir (mekanizma okunsun)
    for mat in bpy.data.materials:
        if "GhostK" not in mat.node_tree.nodes:
            continue
        gk = mat.node_tree.nodes["GhostK"].inputs[1]
        ge = mat.node_tree.nodes["GhostE"].inputs["Strength"]
        # dalışta kamera kabuğun içinden geçer → hayalet incelir; tetik sahnesine kadar ince kalır
        for f, k, e in ((1, 0.75, 1.1), (F_LIFT[0] + 2, 0.75, 1.1), (F_LIFT[0] + 16, 0.22, 0.45),
                        (F_BACK[0], 0.22, 0.45), (F_BACK[1], 0.12, 0.3), (F_PRESS2[1] + 2, 0.12, 0.3),
                        (F_REWIND[0] + 8, 0.75, 1.1)):
            gk.default_value, ge.default_value = k, e
            gk.keyframe_insert("default_value", frame=f)
            ge.keyframe_insert("default_value", frame=f)
    # DualSense özellik etiketleri: hareket sensörü kısa parlar; CTA'da panel baskısı mavi parlar
    key_input(M["imu"], "Emission Strength", [(1, 0.0), (F_IMU, 0.0), (F_IMU + 6, 3.0), (F_IMU + 30, 0.4), (F_LIFT[0], 0.0)])
    key_input(M["tp_print"], "Emission Strength", [(1, 0.0), (F_REWIND[1], 0.0), (F_REWIND[1] + 8, 3.0), (F_HOME + 20, 0.8),
                                                   (FRAMES - 4, 0.0)])
    # CTA: baskı parlar
    pr = M["print"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
    for f, v in ((1, 0.5), (24, 0.5), (34, 3.0), (60, 0.8), (F_REWIND[1], 0.8), (F_REWIND[1] + 8, 4.0), (F_HOME + 20, 0.8),
                 (FRAMES, 0.5)):
        pr.default_value = v
        pr.keyframe_insert("default_value", frame=f)


# ---------------------------------------------------------------- kamera

PRES_AZ = 18                         # sunum karesi: kamera azimutu
PRES_LOC = Vector((3.4, -7.4, 4.6))  # aktüatörün dünyadaki sunum noktası (kök 6° dönükken)
HOOK = dict(t=(0.4, 0.3, 3.6), height=22.0, elev=52, azim=20, roll=-9)


def build_camera():
    target = empty("KameraHedef")
    rig = empty("KameraRig")
    c = rig.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    cd = bpy.data.cameras.new("Kamera")
    cd.lens, cd.clip_start, cd.clip_end = 55, 0.01, 500
    cam = link(bpy.data.objects.new("Kamera", cd), rig)
    focus = empty("Odak")
    cd.dof.use_dof = True
    cd.dof.focus_object = focus
    cd.dof.aperture_fstop = 32

    def shot(frame, t, height, elev=40, azim=0, roll=0.0, fstop=None):
        half = math.atan(18 / cd.lens)
        e, a = math.radians(elev), math.radians(azim)
        direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        d = height / 2 / math.tan(half)
        key(target, frame, loc=Vector(t))
        key(rig, frame, loc=Vector(t) + direction * d)
        key(cam, frame, rot=(0, 0, math.radians(roll)))
        key(focus, frame, loc=Vector(t))
        if fstop is not None:
            cd.dof.aperture_fstop = fstop
            cd.dof.keyframe_insert("aperture_fstop", frame=frame)

    return cam, shot


def camera_keys(scene, P, I, Hh):
    interp("BEZIER")
    cam, shot = build_camera()

    def w(obj, frame, local=(0, 0, 0)):
        scene.frame_set(frame)
        return obj.matrix_world @ Vector(local)

    hk = dict(HOOK)
    shot(1, **hk, fstop=32)
    shot(F_STAMP - 1, hk["t"], hk["height"] * 0.9, hk["elev"], hk["azim"], hk["roll"] * 1.25)
    shot(F_HOOK_END, hk["t"], hk["height"] * 0.88, hk["elev"], hk["azim"] + 2, hk["roll"] * 1.25)
    OV = dict(t=(0.7, -0.4, -0.7), height=30.0, elev=57, azim=16, roll=0)
    shot(F_SCAN[1] + 4, **OV)
    shot(F_TURN[1], (0.7, -0.4, -0.7), 28.5, elev=53, azim=22)
    # dalış: aktüatörü takip ederek makroya
    lift = Hh["lift"]
    shot(F_LIFT[0] + 14, w(lift, F_LIFT[0] + 14), 14.0, elev=36, azim=PRES_AZ, fstop=6)
    shot(F_LIFT[1], w(lift, F_LIFT[1]), 4.0, elev=10, azim=PRES_AZ, fstop=0.12)
    c = w(lift, F_LIFT[1])
    shot(F_CUT[0], c, 3.9, elev=10, azim=PRES_AZ)
    shot(F_SPLIT[1] + 4, c, 6.0, elev=9, azim=PRES_AZ - 4)
    dn = Vector((0, 0, -0.42))   # aktüatör kadrajda yukarı kayar → altta dalga formu paneli
    shot(F_OSC[0], c + dn, 5.7, elev=9, azim=PRES_AZ - 6)
    shot(F_OSC[1], c + dn, 5.4, elev=8, azim=PRES_AZ - 10, fstop=0.12)
    shot(F_CLOSE[1], c, 4.6, elev=12, azim=PRES_AZ - 8)
    # geri dönüşte aktüatörü takip et, sonra sağ tetiğe kay
    shot(F_BACK[0] + 12, w(lift, F_BACK[0] + 12), 9.0, elev=30, azim=40, fstop=2)
    tg = w(I[1]["gear"], F_BACK[1], (0, 0.85, 0.55))
    shot(F_BACK[1] + 6, tg, 8.8, elev=18, azim=100, fstop=1.2)
    shot(F_PRESS1[0], tg, 8.0, elev=13, azim=94, fstop=1.2)
    shot(F_PRESS2[1], tg, 7.4, elev=11, azim=86, fstop=1.2)
    # ⏪ geri sarma: genel plan → kanca
    shot(F_REWIND[0] + 26, (0.0, -0.4, -0.7), 27.0, elev=52, azim=40, fstop=32)
    shot(F_REWIND[1], hk["t"], hk["height"] * 1.05, hk["elev"], hk["azim"], hk["roll"])
    shot(F_HOME, **hk)
    shot(FRAMES, **hk)
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
    return {
        "gripL": ("Kol", (-6.4, -4.6, -1.6)),
        "gripR": ("Kol", (6.4, -4.6, -1.6)),
        "tpad": ("Kol", (0.9, TP_Y + 0.6, TP_Z)),
        "light": ("Kol", (-3.25, 2.4, 2.35)),
        "batt": ("Pil", (1.0, -0.45, 0.38)),
        "pcb": ("Anakart", (-2.6, -0.5, 0.08)),
        "imu": ("HareketSensoru", (0, 0, 0.06)),
        "mic": ("Mikrofon", (0, 0, 0.1)),
        "spk": ("Hoparlor", (-0.2, -0.2, 0.2)),
        "stick": ("CubukModul_1", (0.4, -0.5, 0.5)),
        "trig": ("Motor_1", (0, 0, 0.6)),
        "act": ("HeroAktuator", (-0.3, 0, ACT_R)),
        "actL": ("AktuatorSol", (-0.3, 0, ACT_R)),
        "blade": ("Bicak", (0, 0, 0)),
        "coil": ("Bobin", (0.2, 0.42, -0.02)),
        "coil2": ("Bobin", (0.2, -0.42, -0.02)),
        "magN": ("MiknatisN", (0.1, 0, 0.29)),
        "magS": ("MiknatisS", (-0.1, 0, 0.29)),
        "mass": ("Kutle_1", (0.05, 0, 0.42)),
        "spring": ("HeroAktuator", (-ACT_L / 2 + 0.2, 0, 0.27)),
        "shell": ("HeroKabukAlt", (0.6, 0.3, -ACT_R)),
        "mover": ("Hareketli", (0, 0, 0)),
        "lift": ("HeroAktuator", (0, 0, 0)),
        "motor": ("Motor_1", (0, 0, 0.9)),
        "worm": ("Sonsuz_1", (0, 0, -0.45)),
        "gear": ("DirencKol_1", (0.1, 0, -1.0)),
        "lever": ("TetikPivot_1", (0.6, 1.4, -1.6)),
    }


def export_anchors(scene):
    anchors = {}
    for label, (parent, local) in anchor_specs().items():
        anchors[label] = empty(f"Capa_{label}", bpy.data.objects[parent], loc=local)
    data = {"fps": FPS, "width": W, "height": H, "frames": FRAMES, "anchors": {k: [] for k in anchors}}
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        cam = scene.camera
        for k, e in anchors.items():
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            ok = co.z > 0
            data["anchors"][k].append([round(co.x * W, 1), round((1 - co.y) * H, 1)] if ok else [-999, -999])
    data["mover"] = []  # mekanizma: hareketli grubun yerel X ötelemesi (dalga formu için)
    mv = bpy.data.objects["Hareketli"]
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        data["mover"].append(round(mv.location.x, 4))
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    # tarama boşu X-ray malzemelerinden önce gerekli → kökü önce kur
    root = empty("Kol")
    scan = empty("Tarama", root, loc=(0, SCAN_Y[0], 0))
    SCAN["obj"] = scan
    M = build_materials()
    P = build_controller(M, root, scan)
    I = build_internals(M, P)
    Hh = build_hero(M, P["root"])
    fonts_ = [o for o in bpy.data.objects if o.type == "FONT"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in fonts_:
        o.select_set(True)
    bpy.context.view_layer.objects.active = fonts_[0]
    bpy.ops.object.convert(target="MESH")
    animate(P, I, Hh, M)
    camera_keys(scene, P, I, Hh)
    build_world_and_lights()
    export_anchors(scene)
    if "--anchors-only" in argv:
        return
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "ps5-kol.blend"))

    frames = [int(a) for a in argv[argv.index("--frames") + 1].split(",")] if "--frames" in argv else \
        [1, 40, 110, 160, 300, 350, 372, 392, 430, 520, 640, 690, 740, 790, 850]
    if "--camtest" in argv:
        # V="tx,ty,tz,H,elev,azim,roll;..." F=kare → out/ct/v*.png (%25)
        fr = int(os.environ.get("F", "1"))
        scene.frame_set(fr)
        rig, tgt, cam = bpy.data.objects["KameraRig"], bpy.data.objects["KameraHedef"], bpy.data.objects["Kamera"]
        for o in (rig, tgt, cam):
            o.animation_data_clear()
        scene.render.resolution_percentage = 25
        scene.eevee.taa_render_samples = 8
        for i, v in enumerate(os.environ["V"].split(";")):
            tx, ty, tz, hh, el, az, ro = [float(a) for a in v.split(",")]
            half = math.atan(18 / cam.data.lens)
            e, a = math.radians(el), math.radians(az)
            d = hh / 2 / math.tan(half)
            t = Vector((tx, ty, tz))
            tgt.location = t
            rig.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * d
            cam.rotation_euler = (0, 0, math.radians(ro))
            scene.render.filepath = os.path.join(OUT, "ct", f"v{i}.png")
            bpy.ops.render.render(write_still=True)
        return
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
