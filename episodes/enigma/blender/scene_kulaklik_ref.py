"""Kablosuz kulaklık — "Bu minicik şeyin içine bunlar nasıl sığdı?" (bölüm 7). Anlatım iskeleti: klavye (bölüm 2).

Çalıştırma:
    blender-gpu -b --factory-startup -P scene.py                               # .blend + anchors.json
    blender-gpu -b --factory-startup -P scene.py -- --preview [--frames 1,300]  # ön izleme (%50, 16 örnek)
    blender-gpu -b --factory-startup -P scene.py -- --draft                     # tüm animasyon %25, 4 örnek → out/draft
    blender-gpu -b --factory-startup -P scene.py -- --anchors-only
    blender-gpu -b --factory-startup -P scene.py -- --camtest   (F=kare V="tx,ty,tz,H,elev,azim[,lens];...")
Tam render (.blend'den):
    blender-gpu -b blender/out/kulaklik.blend -o "$PWD/remotion/public/frames/####" -F PNG -a

Tek dünya, 1 birim = 1 cm. Kutu + iki kulaklık Sketchfab modelinden (Jed Falcone, CC BY 4.0); iç parçalar (sürücü,
pil, çip kartı, mikrofonlar, anten, basınç sensörü) kodla, gerçek yerleşime göre: sürücü kulak ucunun hemen arkasında,
düğme pil ve çip başta, anten/basınç sensörü/alt mikrofon sapta, şarj kontakları sapın ucunda.
Kahraman kulaklık yerel çerçevede kurulur: orijin baş merkezi, +Z kulak ucu ekseni, +X sapa doğru.
Kare numaraları: T sözlüğü Remotion karesi; Blender karesi = Remotion + 1 (B()).
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
sys.path.insert(0, HERE)
import bud_assets as A  # noqa: E402

OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

FPS = 30
FRAMES = 900  # 30 sn
W, H = 1080, 1920
FONT_DISPLAY = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"


def B(r):  # Remotion karesi → Blender karesi
    return r + 1


# ---------------------------------------------------------------- zaman çizelgesi (Remotion karesi; tek yer)
T = dict(
    LID=(3, 15),           # kapak "pıt" diye açılır
    LIFT=(8, 64),          # kulaklık mıknatıstan kalkar, kameraya döner
    POSE=(80, 110),        # kulaklık sunum pozuna (kulak ucu yukarı) döner
    EXPLODE=(96, 142),     # katmanlar dalga gecikmeli ayrılır
    CASE_OUT=(80, 114),    # kutu kadrajdan aşağı çekilir
    L1=(146, 346),         # 9 parça etiketi
    BRIDGE=(346, 400),
    DIVE=(376, 420),       # diğer katmanlar çekilir, kamera sürücüye
    HERO_EX=(424, 456),    # sürücü kendi parçalarına ayrılır
    L2=(460, 576),         # 5 alt parça etiketi
    MERGE=(578, 596),      # sürücü birleşir (kesitli)
    MECH=(596, 664),       # sinyal → bobin ileri-geri → diyafram → ses dalgası
    ANC_IN=(664, 704),     # katmanlar geri gelir, kulaklık dik poza döner, X-ray
    ANC=(704, 800),        # gürültü → dış mikrofon → çip → ters dalga → sessizlik
    RETURN=(800, 840),     # kulaklık kutuya uçar
    SEAT=838,              # mıknatısla oturur ("tık")
    RAIN=(804, 850),       # parça yağmuru
    LID_CLOSE=(846, 858),  # kapak kapanır ("pıt")
    CTA=(850, 893),
    END=899,
)

# katman ötelemeleri (kahraman yerel Z, cm)
LAYERS = [  # ad, öteleme, dalga gecikmesi (kare)
    ("Uc", 3.0, 0),
    ("Surucu", 2.1, 4),
    ("IcKabuk", 1.15, 8),
    ("Pil", 0.35, 12),
    ("Cip", -0.6, 16),
    ("DisKabuk", -1.55, 20),
    ("Sap", -2.45, 24),
]
DRV_Z0 = 0.12            # sürücü tabanı (yerel z)
DRV_S = 0.8              # sürücü ölçeği (baş içine sığsın: r 0,4 cm)
DRV_EX = {"Sepet": -0.42, "Miknatis": 0.0, "Bobin": 0.42, "Diyafram": 0.80, "Izgara": 1.18}
BOB_AMP = 0.028          # mekanizmada bobin + diyafram genliği (cm)
HOVER = Vector((0.0, -0.6, 4.4))   # kancada kulaklığın havada durduğu yer (dünya)


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


# ---------------------------------------------------------------- malzemeler

def build_materials():
    M = {}
    M["white"] = material("KutuBeyaz", "#f3f4f7", rough=0.3, coat=0.15)
    M["shell"] = material("KabukBeyaz", "#f6f7f9", rough=0.22, coat=0.6)
    M["shellH"] = material("KabukKahraman", "#f6f7f9", rough=0.22, coat=0.6)
    M["tipH"] = material("UcSilikon", "#e9ecf1", rough=0.55)
    M["tip"] = material("UcSilikonKutu", "#e9ecf1", rough=0.55)
    M["mesh"] = material("MikIzgara", "#2b2f36", metallic=0.6, rough=0.45)
    M["meshH"] = material("MikIzgaraKahraman", "#2b2f36", metallic=0.6, rough=0.45, emission="#ffd23f")
    M["contact"] = material("Kontak", "#e2b55a", metallic=1.0, rough=0.25)
    M["metal"] = material("Mentese", "#b9bec7", metallic=1.0, rough=0.3)
    M["led"] = material("Led", "#34c759", rough=0.4, emission="#34c759", strength=0.8)
    M["dark"] = material("Koyu", "#1b1e24", rough=0.6)
    M["print"] = material("Baski", "#7d8796", rough=0.45, emission="#ffd23f", strength=0.0)
    # iç parçalar
    M["drvFrame"] = material("SurucuCerceve", "#ff7a45", metallic=0.2, rough=0.35, coat=0.4)
    M["steel"] = material("Celik", "#6f7682", metallic=1.0, rough=0.35)
    M["magnet"] = material("Miknatis", "#c9ced6", metallic=1.0, rough=0.18)
    M["copper"] = material("Bakir", "#d9822b", metallic=1.0, rough=0.3, emission="#8fd6ff", strength=0.0)
    M["diaph"] = material("Diyafram", "#bfe3ff", rough=0.15, coat=1.0, alpha=0.82, emission="#8fd6ff")
    M["grille"] = material("SurucuIzgara", "#3a3f48", metallic=0.9, rough=0.35)
    M["battery"] = material("Pil", "#c8ccd3", metallic=1.0, rough=0.22)
    M["batTop"] = material("PilUst", "#3d7bff", rough=0.4)
    M["pcb"] = material("Kart", "#1f6f5a", rough=0.5)
    M["sip"] = material("Cip", "#16181d", rough=0.35, emission="#8fd6ff")
    M["gold"] = material("Altin", "#e8b75a", metallic=1.0, rough=0.25)
    M["flex"] = material("Anten", "#e39b2d", metallic=0.4, rough=0.4)
    M["sensor"] = material("Sensor", "#3d7bff", rough=0.35, emission="#3d7bff", strength=0.3)
    M["mic"] = material("Mikrofon", "#2a2d33", metallic=0.5, rough=0.4, emission="#ffd23f")
    # izgara deliği: voronoi → alfa
    g = M["grille"]
    nt = g.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 16.0
    vor.inputs["Randomness"].default_value = 0.0
    lt = nt.nodes.new("ShaderNodeMath")
    lt.operation = "GREATER_THAN"
    lt.inputs[1].default_value = 0.26
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    nt.links.new(vor.outputs["Distance"], lt.inputs[0])
    nt.links.new(lt.outputs[0], p.inputs["Alpha"])
    return M


# ---------------------------------------------------------------- model

def build_model(M):
    meshes = A.import_jed()
    # orijinal ızgara malzemesinin alfa dokusunu koru, diğerlerini kendi malzemelerimizle değiştir
    grille_src = meshes["Cube_1_2_Speaker Grille_0"].data.materials[0]
    grille_src.surface_render_method = "DITHERED"
    grille_src.use_backface_culling = False

    def setmat(o, m):
        o.data.materials.clear()
        o.data.materials.append(m)

    root = empty("Sahne")
    case = empty("Kutu", root)
    hinge = empty("KapakMentese", case, loc=A.to_world(A.LID_HINGE))
    hinge.location.x = 0.0
    for n, o in meshes.items():
        if n in A.BUD:
            continue
        m = {"Mat.1": M["white"], "Mat.5": M["metal"], "Mat.4": M["led"], "Mat.10": M["dark"]}.get(
            o.data.materials[0].name, M["white"])
        setmat(o, m)
        if n in A.LID:
            o.data.transform(Matrix.Translation(-hinge.location))
            o.parent = hinge
        else:
            o.parent = case
    # kulaklıklar: sağ (x>0) kahraman, sol kutuda kalır
    R = {}
    for n in A.BUD:
        R[n] = A.split_faces(meshes[n], lambda c: c.x > 0, n + "_R")
    L = {n: meshes[n] for n in A.BUD}
    leftmat = {"Cube_2_Mat.1_0": M["shell"], "Cube_1_Mat.3_0": M["mesh"], "Cube_4_Mat.9_0": M["contact"],
               "Cube_Mat.3_0": M["mesh"], "Capsule_Mat.2_0": M["tip"], "Cylinder__0": M["tip"]}
    for n, o in L.items():
        if n in leftmat:
            setmat(o, leftmat[n])
        o.parent = case
    F = A.bud_frame(R["Cube_2_Mat.1_0"], R["Capsule_Mat.2_0"], R["Cube_4_Mat.9_0"])
    Fi = F.inverted()
    hero = empty("KulaklikKok", root)
    hero.rotation_mode = "QUATERNION"
    hero.matrix_world = F
    lay = {}
    for name, _, _ in LAYERS:
        lay[name] = empty(f"Katman_{name}", hero)
    for n, o in R.items():
        o.data.transform(Fi)
        o.matrix_world = Matrix.Identity(4)
    shell = R["Cube_2_Mat.1_0"]
    def cut_copy(name, planes):
        o = shell.copy()
        o.data = shell.data.copy()
        o.name = name
        bpy.context.scene.collection.objects.link(o)
        for co, no in planes:
            A.bisect_keep(o, Vector(co), Vector(no), fill=False)
        setmat(o, M["shellH"])
        return o

    ZS, XS = 0.05, 0.55       # baş kabuğunu kulak ucu tarafı / dış taraf olarak böl (sap dış tarafta kalır)
    inner = cut_copy("IcKabuk", [((0, 0, ZS), (0, 0, 1)), ((XS, 0, 0), (-1, 0, 0))])
    outer_b = cut_copy("DisKabukSap", [((0, 0, ZS), (0, 0, 1)), ((XS, 0, 0), (1, 0, 0))])
    A.bisect_keep(shell, Vector((0, 0, ZS)), Vector((0, 0, -1)), fill=False)
    setmat(shell, M["shellH"])
    shell.name = "DisKabuk"
    inner.parent = lay["IcKabuk"]
    shell.parent = lay["DisKabuk"]
    outer_b.parent = lay["DisKabuk"]
    for n in ("Capsule_Mat.2_0", "Cylinder__0"):
        setmat(R[n], M["tipH"])
        R[n].parent = lay["Uc"]
    R["Capsule_Mat.2_0"].name = "KulakUcu"
    setmat(R["Cube_1_Mat.3_0"], M["meshH"])
    setmat(R["Cube_Mat.3_0"], M["mesh"])
    R["Cube_Mat.3_0"].hide_render = True      # dışarıdan görünmeyen iç plaka; X-ray'de başı kaplıyordu
    for n in ("Cube_1_Mat.3_0", "Cube_Mat.3_0"):
        R[n].parent = lay["DisKabuk"]
    setmat(R["Cube_1_2_Speaker Grille_0"], M["meshH"])
    R["Cube_1_2_Speaker Grille_0"].parent = lay["DisKabuk"]
    R["Cube_1_2_Speaker Grille_0"].name = "DisMikIzgara"
    setmat(R["Cube_4_Mat.9_0"], M["contact"])
    R["Cube_4_Mat.9_0"].parent = lay["Sap"]
    R["Cube_4_Mat.9_0"].name = "SarjKontak"
    # üstteki dış mikrofon ızgarasının merkezi (yerel)
    gv = [v.co for v in R["Cube_1_2_Speaker Grille_0"].data.vertices]
    top = [v for v in gv if v.x < 0.2]
    P = {"case": case, "hinge": hinge, "hero": hero, "lay": lay, "F": F,
         "outermic": A.centroid(top) if top else Vector((-0.6, 0, -0.3)),
         "body": meshes["Boole_2_Mat.1_0"]}
    build_internals(M, P)
    build_print(M, P)
    return P


def build_internals(M, P):
    lay = P["lay"]
    # --- hoparlör sürücüsü (kesitli 270°; boşluk kameraya bakacak şekilde DrvSpin döndürülür)
    drv = empty("Surucu", lay["Surucu"], loc=(0, 0, DRV_Z0))
    drv.scale = (DRV_S, DRV_S, DRV_S)
    spin = empty("DrvSpin", drv)
    parts = {k: empty(f"Drv_{k}", spin) for k in DRV_EX}
    spin_solid("Sepet", [(0.0, 0.0), (0.44, 0.0), (0.46, 0.03), (0.46, 0.27), (0.50, 0.27), (0.50, 0.31),
                         (0.40, 0.31), (0.40, 0.26), (0.31, 0.26), (0.31, 0.05), (0.0, 0.05)],
               M["drvFrame"], parts["Sepet"])
    spin_solid("Miknatis", [(0.0, 0.05), (0.21, 0.05), (0.21, 0.19), (0.0, 0.19)], M["magnet"], parts["Miknatis"])
    spin_solid("KutupPlaka", [(0.0, 0.19), (0.235, 0.19), (0.235, 0.25), (0.0, 0.25)], M["steel"], parts["Miknatis"])
    spin_solid("Bobin", [(0.255, 0.13), (0.29, 0.13), (0.29, 0.33), (0.255, 0.33)], M["copper"], parts["Bobin"],
               smooth_=False)
    # bobin sargısı: ince halkalar
    bm = bmesh.new()
    for i in range(9):
        z = 0.145 + i * 0.021
        g = bmesh.ops.create_circle(bm, cap_ends=False, segments=40, radius=0.294)
        bmesh.ops.translate(bm, verts=g["verts"], vec=(0, 0, z))
    me_wind = mesh_obj("BobinSargi", bm, M["copper"], parts["Bobin"])
    sk = me_wind.modifiers.new("sk", "SKIN")
    me_wind.modifiers.move(0, 0)
    for v in me_wind.data.skin_vertices[0].data:
        v.radius = (0.006, 0.006)
    # diyafram: kubbe + kenar (ince kabuk profili)
    prof = []
    for i in range(13):
        r = 0.29 * i / 12
        prof.append((r, 0.40 - 0.07 * (r / 0.29) ** 2))
    prof += [(0.33, 0.335), (0.37, 0.345), (0.41, 0.335), (0.46, 0.33)]
    inner = [(r, z - 0.014) for r, z in reversed(prof)]
    spin_solid("Diyafram", prof + inner, M["diaph"], parts["Diyafram"])
    spin_solid("Izgara", [(0.0, 0.43), (0.48, 0.43), (0.48, 0.45), (0.0, 0.45)], M["grille"], parts["Izgara"],
               smooth_=False)
    spin_solid("IzgaraHalka", [(0.44, 0.31), (0.50, 0.31), (0.50, 0.45), (0.47, 0.45), (0.47, 0.34), (0.44, 0.34)],
               M["drvFrame"], parts["Izgara"])
    P["drv"], P["drvSpin"], P["drvParts"] = drv, spin, parts

    # --- iç mikrofon (kulak kanalına bakar, uç tarafında)
    bm = bmesh.new()
    cyl_bm(bm, 0.09, 0.0, 0.07, 24)
    o = mesh_obj("IcMikrofon", bm, M["mic"], lay["IcKabuk"], smooth=True)
    o.location = (0.30, -0.36, 0.52)
    o.rotation_euler = (0.5, 0.35, 0)
    bm = bmesh.new()
    cyl_bm(bm, 0.095, 0.07, 0.085, 24)
    mesh_obj("IcMikrofonHalka", bm, M["gold"], o, smooth=True)

    # --- düğme pil (baş içinde)
    bat = empty("PilGrup", lay["Pil"], loc=(0.0, 0.0, -0.33))
    bm = bmesh.new()
    cyl_bm(bm, 0.48, 0.0, 0.38, 48)
    o = mesh_obj("Pil", bm, M["battery"], bat, smooth=True)
    add_bevel(o, 0.03, 3)
    o.modifiers.new("ew", "EDGE_SPLIT").split_angle = math.radians(40)
    bm = bmesh.new()
    cyl_bm(bm, 0.38, 0.38, 0.395, 48)
    mesh_obj("PilUst", bm, M["batTop"], bat, smooth=True)
    bm = bmesh.new()
    box_bm(bm, 0.5, 0.12, 0.02, (0.45, 0, 0.34))
    mesh_obj("PilBant", bm, M["flex"], bat)

    # --- çip kartı (SiP)
    chip = empty("CipGrup", lay["Cip"], loc=(0.0, 0.0, -0.56))
    chip.scale = (0.85, 0.85, 0.85)
    bm = bmesh.new()
    box_bm(bm, 1.1, 0.9, 0.05, (0.05, 0, 0))
    o = mesh_obj("Kart", bm, M["pcb"], chip)
    add_bevel(o, 0.02, 2)
    bm = bmesh.new()
    box_bm(bm, 0.56, 0.48, 0.11, (0.0, 0.0, 0.08))
    o = mesh_obj("Cip", bm, M["sip"], chip)
    add_bevel(o, 0.015, 2)
    bm = bmesh.new()
    for (x, y, sx, sy) in [(0.42, 0.25, 0.14, 0.1), (0.42, -0.22, 0.12, 0.16), (-0.38, 0.3, 0.1, 0.12),
                           (-0.4, -0.28, 0.14, 0.08), (0.45, 0.02, 0.06, 0.06)]:
        box_bm(bm, sx, sy, 0.05, (x, y, 0.05))
    mesh_obj("KartBilesen", bm, M["steel"], chip)
    bm = bmesh.new()
    for i in range(6):
        box_bm(bm, 0.04, 0.04, 0.012, (-0.22 + i * 0.09, -0.36, 0.031))
    mesh_obj("KartPed", bm, M["gold"], chip)

    # --- sap içi: anten, basınç sensörü, alt mikrofon, sap kartı (yerel x 0.7–2.1, merkez çizgisi z ≈ 0.05→0.32)
    sap = lay["Sap"]

    S0, S1 = Vector((0.9, -0.37, -0.32)), Vector((2.1, -0.05, 0.22))   # ölçülen sap merkez çizgisi

    def stem_pt(x):
        return S0.lerp(S1, (x - 0.9) / 1.2)

    ax = (S1 - S0).normalized()
    n1 = ax.cross(Vector((0, 0, 1))).normalized()
    rq = Vector((1, 0, 0)).rotation_difference(ax)
    rot = rq.to_euler()
    bm = bmesh.new()
    box_bm(bm, 1.2, 0.04, 0.14)
    o = mesh_obj("Anten", bm, M["flex"], sap)
    o.location, o.rotation_euler = stem_pt(1.45) + n1 * 0.07, rot
    add_bevel(o, 0.01, 1)
    bm = bmesh.new()
    box_bm(bm, 0.45, 0.04, 0.16)
    o = mesh_obj("BasincSensoru", bm, M["sensor"], sap)
    o.location, o.rotation_euler = stem_pt(1.15) - n1 * 0.1, rot
    add_bevel(o, 0.015, 2)
    bm = bmesh.new()
    box_bm(bm, 1.1, 0.12, 0.03)
    o = mesh_obj("SapKart", bm, M["pcb"], sap)
    o.location, o.rotation_euler = stem_pt(1.5), rot
    bm = bmesh.new()
    cyl_bm(bm, 0.07, -0.03, 0.03, 24)
    o = mesh_obj("AltMikrofon", bm, M["mic"], sap, smooth=True)
    o.location = stem_pt(1.95)
    o.rotation_euler = Vector((0, 0, 1)).rotation_difference(ax).to_euler()


def build_print(M, P):
    """Kutunun ön yüzüne kanal baskısı: WHAT'S INSIDE + @whatsinit.lab (kapak altı, LED'in altında)."""
    objs = []
    for body, size, z in (("WHAT'S INSIDE", 0.46, -1.25), ("@whatsinit.lab", 0.25, -1.72)):
        cu = bpy.data.curves.new("Baski", "FONT")
        cu.body = body
        cu.font = bpy.data.fonts.load(FONT_DISPLAY, check_existing=True)
        cu.size = size
        cu.align_x, cu.align_y = "CENTER", "CENTER"
        cu.extrude = 0.004
        cu.materials.append(M["print"])
        o = link(bpy.data.objects.new("Baski", cu), P["case"])
        o.location = (0.0, -1.3, z)
        o.rotation_euler = (math.pi / 2, 0, 0)
        objs.append(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")
    for o in objs:
        sw = o.modifiers.new("sw", "SHRINKWRAP")
        sw.target = P["body"]
        sw.wrap_method = "PROJECT"
        sw.use_project_z = True              # yerel Z = dünya -Y (yazı X'te 90° döndürüldü) → kutuya doğru
        sw.use_negative_direction = True
        sw.use_positive_direction = False
        sw.offset = 0.002
    P["print"] = objs


# ---------------------------------------------------------------- parça yağmuru (dönüşte)

def build_rain(M, P):
    tip = bpy.data.objects["KulakUcu"]
    bat = bpy.data.objects["Pil"]
    root = empty("Yagmur", bpy.data.objects["Sahne"])
    random.seed(11)
    drops = []
    for i in range(18):
        kind = i % 3
        src = tip if kind < 2 else bat
        o = bpy.data.objects.new(f"Yagmur{i}", src.data)
        link(o, root)
        if src is bat:
            for md in src.modifiers:
                nm = o.modifiers.new(md.name, md.type)
                if md.type == "BEVEL":
                    nm.width, nm.segments, nm.limit_method = md.width, md.segments, md.limit_method
                elif md.type == "EDGE_SPLIT":
                    nm.split_angle = md.split_angle
        s = [0.8, 1.0, 1.2][i % 3] if src is tip else 0.75
        o.scale = (s, s, s)
        o.rotation_mode = "XYZ"
        x = -3.4 + 6.8 * ((i * 7) % 18) / 17 + random.uniform(-0.3, 0.3)
        y = random.uniform(-2.5, 3.0)
        drops.append((o, x, y, s, T["RAIN"][0] + i * 2.2 + random.uniform(-0.8, 0.8)))
    P["rain"] = drops


# ---------------------------------------------------------------- animasyon

def animate(P, M, scene):
    interp("BEZIER")
    case, hinge, hero, lay = P["case"], P["hinge"], P["hero"], P["lay"]
    F = P["F"]
    q_case = F.to_quaternion()
    p_case = F.translation.copy()
    q_hover = Quaternion((0, 0, 1), math.radians(28)) @ Quaternion((1, 0, 0), math.radians(-14)) @ q_case
    q_tip = quat_from_axes((0.96, 0.28, 0.0), (0, 0, 1))          # sunum: kulak ucu yukarı, sap sağa-geriye
    q_up = quat_map((1.2, 0.32, 0.54), (0, 0, 1), (0, 0, -1), (1, 0, 0))   # ANC: sap dik aşağı, kulak ucu sağa
    P.update(q_case=q_case, q_tip=q_tip, q_up=q_up)
    stack_c = 1.0                                                   # patlatılmış yığının yerel z merkezi

    # --- kapak
    for f, a in ((1, 0.0), (B(T["LID"][0]), 0.0), (B(T["LID"][0] + 5), A.LID_OPEN * 0.8),
                 (B(T["LID"][1]), A.LID_OPEN), (B(T["LID_CLOSE"][0]), A.LID_OPEN),
                 (B(T["LID_CLOSE"][1] - 4), -0.06), (B(T["LID_CLOSE"][1]), 0.0), (FRAMES, 0.0)):
        key(hinge, f, rot=(a, 0, 0))

    # --- kutu: kadrajdan aşağı çekilir, dönüşte gelir
    key(case, 1, loc=(0, 0, 0))
    key(case, B(T["CASE_OUT"][0]), loc=(0, 0, 0))
    key(case, B(T["CASE_OUT"][1]), loc=(0, 0, -16))
    key(case, B(T["RETURN"][0] - 6), loc=(0, 0, -16))
    key(case, B(T["RETURN"][0] + 26), loc=(0, 0, 0))
    key(case, FRAMES, loc=(0, 0, 0))

    # --- kahraman kulaklık kökü (konum + quaternion)
    up_c = Vector((0.2, -0.4, 4.4))
    tip_c = HOVER + Vector((0, 0, 0.4))
    seq = [
        (1, p_case, q_case),
        (B(T["LIFT"][0]), p_case, q_case),
        (B(T["LIFT"][0] + 26), p_case + Vector((0, -0.2, 2.6)), q_hover.slerp(q_case, 0.45)),
        (B(T["LIFT"][1]), HOVER, q_hover),
        (B(T["POSE"][0]), HOVER + Vector((0, 0, 0.15)), q_hover),
        (B(T["POSE"][1]), tip_c - Vector((0, 0, stack_c * 0.4)), q_tip),
        (B(T["ANC_IN"][0]), tip_c - Vector((0, 0, stack_c * 0.4)), q_tip),
        (B(T["ANC_IN"][1]), up_c, q_up),
        (B(T["ANC"][1]), up_c + Vector((0, 0, 0.1)), q_up),
        (B(T["RETURN"][0] + 18), p_case + Vector((0, -0.3, 3.2)), q_hover.slerp(q_case, 0.6)),
        (B(T["SEAT"]), p_case, q_case),
        (FRAMES, p_case, q_case),
    ]
    prev = None
    for f, p, q in seq:
        q = q.copy()
        if prev is not None and prev.dot(q) < 0:   # quaternion bileşen ara değerlemesi kısa yoldan gitsin
            q.negate()
        key(hero, f, loc=p, quat=q)
        prev = q

    # --- katmanlar: patlama (dalga), dalış (çekilme), ANC'de birleşme
    e0, e1 = T["EXPLODE"]
    d0, d1 = T["DIVE"]
    for name, dz, delay in LAYERS:
        o = lay[name]
        key(o, 1, loc=(0, 0, 0))
        key(o, B(e0 + delay), loc=(0, 0, 0))
        key(o, B(e0 + delay + 22), loc=(0, 0, dz))
        if name == "Surucu":
            key(o, B(T["ANC_IN"][0]), loc=(0, 0, dz))
        else:
            away = 22.0 if dz > 2.5 else -22.0
            key(o, B(d0 - 8 + abs(delay - 4) // 3), loc=(0, 0, dz))
            key(o, B(d0 - 8 + abs(delay - 4) // 3 + 22), loc=(0, 0, dz + away))
            key(o, B(T["ANC_IN"][0] - 2), loc=(0, 0, dz + away))
        key(o, B(T["ANC_IN"][0] + 4 + delay // 2), loc=(0, 0, dz * 0.5 if name == "Surucu" else dz * 0.6))
        key(o, B(T["ANC_IN"][1] - 6 + delay // 4), loc=(0, 0, 0))
        key(o, FRAMES, loc=(0, 0, 0))

    # --- sürücü alt parçaları: ayrılma, birleşme
    for k, dz in DRV_EX.items():
        o = P["drvParts"][k]
        key(o, 1, loc=(0, 0, 0))
        key(o, B(T["HERO_EX"][0]), loc=(0, 0, 0))
        key(o, B(T["HERO_EX"][1]), loc=(0, 0, dz))
        key(o, B(T["MERGE"][0]), loc=(0, 0, dz))
        key(o, B(T["MERGE"][1]), loc=(0, 0, 0))
        key(o, FRAMES, loc=(0, 0, 0))
    # mekanizma: bobin + diyafram ileri-geri (önce yavaş 3 Hz, sonra 6 Hz), lineer kare kare
    interp("LINEAR")
    m0, m1 = T["MECH"]
    vib = []
    for r in range(m0 + 6, m1 + 1):
        u = r - (m0 + 6)
        fhz = 3.0 if r < m0 + 34 else 6.0
        ph = sum((3.0 if rr < m0 + 34 else 6.0) for rr in range(m0 + 6, r)) / FPS
        amp = BOB_AMP * min(1.0, u / 6) * min(1.0, (m1 - r) / 6)
        z = amp * math.sin(2 * math.pi * ph)
        vib.append(z)
        for k in ("Bobin", "Diyafram"):
            key(P["drvParts"][k], B(r), loc=(0, 0, z))
    P["vib"] = vib
    interp("BEZIER")
    for k in ("Bobin", "Diyafram"):
        key(P["drvParts"][k], B(m0 + 5), loc=(0, 0, 0))
        key(P["drvParts"][k], B(m1 + 1), loc=(0, 0, 0))
    # bobin elektrik parıltısı (sinyal)
    key_input(M["copper"], "Emission Strength", [(B(m0), 0.0), (B(m0 + 6), 1.6), (B(m1 - 4), 1.6), (B(m1 + 2), 0.0)])
    key_input(M["diaph"], "Emission Strength", [(B(m0), 0.0), (B(m0 + 10), 0.35), (B(m1 - 4), 0.35), (B(m1 + 2), 0.0)])

    # --- ANC: X-ray (kabuk + uç saydam), dış mikrofon → çip → sürücü parıltısı
    a0, a1 = T["ANC"]
    i0 = T["ANC_IN"][0]
    for mname in ("shellH", "tipH"):
        lo = 0.16 if mname == "shellH" else 0.28
        key_input(M[mname], "Alpha", [(1, 1.0), (B(i0 + 18), 1.0), (B(i0 + 34), lo), (B(a1 - 2), lo),
                                       (B(a1 + 8), 1.0), (FRAMES, 1.0)])
    key_input(M["meshH"], "Emission Strength", [(B(a0 + 8), 0.0), (B(a0 + 14), 3.0), (B(a0 + 40), 3.0),
                                                 (B(a0 + 50), 0.4), (B(a1), 0.0)])
    key_input(M["mic"], "Emission Strength", [(B(a0 + 8), 0.0), (B(a0 + 14), 2.0), (B(a0 + 40), 2.0),
                                               (B(a1 - 10), 1.2), (B(a1), 0.0)])
    key_input(M["sip"], "Emission Strength", [(B(a0 + 26), 0.0), (B(a0 + 34), 2.5), (B(a1 - 8), 2.5), (B(a1), 0.0)])
    key_input(M["copper"], "Emission Strength", [(B(a0 + 40), 0.0), (B(a0 + 48), 1.6), (B(a1 - 8), 1.6),
                                                  (B(a1), 0.0)])
    # baskı: CTA'da parlar
    key_input(M["print"], "Emission Strength", [(1, 0.0), (B(T["CTA"][0]), 0.0), (B(T["CTA"][0] + 8), 2.2),
                                                 (B(T["CTA"][1] - 8), 2.2), (B(T["END"] - 2), 0.0)])

    # --- parça yağmuru
    interp("LINEAR")
    for o, x, y, s, f0 in P["rain"]:
        fa = int(round(f0))
        fb = fa + 26
        o.hide_render = True
        o.keyframe_insert("hide_render", frame=1)
        o.hide_render = False
        o.keyframe_insert("hide_render", frame=B(fa))
        o.hide_render = True
        o.keyframe_insert("hide_render", frame=B(fb + 1))
        for r in range(fa, fb + 1, 2):
            u = (r - fa) / (fb - fa)
            z = 13.0 - 30.0 * u * (0.55 + 0.45 * u)
            key(o, B(r), loc=(x, y, z), rot=(u * 5.0 + s, u * 3.0, u * 4.0 + x))
    for o, *_ in P["rain"]:
        set_interp(o, "hide_render", "CONSTANT")
    interp("BEZIER")

    # sürücünün kesik kısmı kameraya baksın: sunum pozunda kamera yönünü yerelde hesapla
    return {"q_tip": q_tip}


def drv_face_camera(P, cam_dir_world):
    q = P["q_tip"]
    d = q.inverted() @ Vector(cam_dir_world)
    ang = math.atan2(d.y, d.x)
    # 270° spin 0'dan başlar → boşluk 270°..360° arası, ortası 315°
    P["drvSpin"].rotation_euler = (0, 0, ang - math.radians(315))


# ---------------------------------------------------------------- kamera

def make_cam(name, lens, clip=(0.005, 120)):
    target = empty(f"{name}Hedef")
    rig = empty(f"{name}Rig")
    c = rig.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.clip_start, cd.clip_end = lens, *clip
    cam = link(bpy.data.objects.new(name, cd), rig)

    def shot(frame, t, size, elev=20, azim=0, roll=0.0):
        half = math.atan(18 / cd.lens)
        e, a = math.radians(elev), math.radians(azim)
        direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        d = size / 2 / math.tan(half)
        key(target, frame, loc=Vector(t))
        key(rig, frame, loc=Vector(t) + direction * d)
        key(cam, frame, rot=(0, 0, math.radians(roll)))

    return cam, shot


def cam_dir(elev, azim):
    e, a = math.radians(elev), math.radians(azim)
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


HOOK = dict(t=(0.0, 0.0, 0.25), size=12.6, elev=16, azim=-14)
EXPL = dict(elev=18, azim=-28)


def wpos(scene, objname, frame, local=(0, 0, 0)):
    scene.frame_set(frame)
    o = bpy.data.objects[objname]
    return o.matrix_world @ Vector(local)


def camera_keys(scene, P):
    interp("BEZIER")
    cam, s = make_cam("Kamera", 50)
    s(1, **HOOK)
    s(B(T["LIFT"][0] + 30), (0.0, -0.3, 2.0), 12.4, 14, -16)
    hv = wpos(scene, "KulaklikKok", B(T["LIFT"][1]))
    s(B(T["LIFT"][1] + 8), hv + Vector((0, 0, -0.2)), 7.6, 10, -20)
    # patlatılmış yığın: merkezi sürücü + çip arasında
    st = wpos(scene, "Katman_IcKabuk", B(T["L1"][0]))
    s(B(T["EXPLODE"][1]), st + Vector((0.3, 0, -1.0)), 10.6, EXPL["elev"], EXPL["azim"])
    s(B(T["L1"][1]), st + Vector((0.3, 0, -1.0)), 10.4, EXPL["elev"] + 2, EXPL["azim"] + 10)
    s(B(T["DIVE"][0] - 14), st + Vector((0.3, 0, -0.9)), 10.2, EXPL["elev"] + 2, EXPL["azim"] + 11)
    dv = wpos(scene, "Surucu", B(T["DIVE"][1]), (0, 0, 0.22))
    s(B(T["DIVE"][1]), dv, 2.5, 24, -20)
    dx = wpos(scene, "Surucu", B(T["HERO_EX"][1]), (0, 0, 0.55))
    s(B(T["HERO_EX"][1]), dx, 2.8, 22, -18)
    s(B(T["L2"][1]), dx, 2.7, 22, -12)
    dm = wpos(scene, "Surucu", B(T["MERGE"][1]), (0, 0, 0.3))
    s(B(T["MERGE"][1]), dm + Vector((0, 0, 0.03)), 2.3, 16, -12)
    s(B(T["MECH"][1]), dm + Vector((0, 0, 0.03)), 2.2, 14, -8)
    up = wpos(scene, "KulaklikKok", B(T["ANC"][0]))
    s(B(T["ANC_IN"][1]), up + Vector((0.75, 0, -1.3)), 8.0, 4, 0)
    s(B(T["ANC"][1]), up + Vector((0.75, 0, -1.3)), 7.8, 4, 2)
    s(B(T["RETURN"][0] + 22), (0.0, 0.0, 0.6), 11.8, 15, -10)
    s(B(T["LID_CLOSE"][1] + 4), (0.0, 0.0, -0.2), 10.8, 16, -13)
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

    sun("Ana", (40, 0, -30), 3.4, (1.0, 0.97, 0.92))
    sun("Dolgu", (70, 0, 25), 1.2, (0.9, 0.95, 1.0), angle=20)
    sun("KenarSol", (75, 0, 140), 3.0, (0.55, 0.8, 1.0), angle=3)
    sun("KenarSag", (72, 0, -145), 2.5, (1.0, 0.72, 0.5), angle=3)
    sun("On", (95, 0, 0), 1.2, (1.0, 0.98, 0.95), angle=15)


# ---------------------------------------------------------------- çapalar

def anchor_points(P):
    """(ebeveyn obje adı, yerel nokta)."""
    sp = {
        "tip": ("KulakUcu", None),
        "driver": ("Surucu", (0.0, -0.46, 0.18)),
        "innermic": ("IcMikrofon", (0, 0, 0.04)),
        "battery": ("PilGrup", (0.0, -0.5, 0.2)),
        "chip": ("CipGrup", (0.0, -0.22, 0.13)),
        "outermic": ("DisKabuk", tuple(P["outermic"])),
        "sensor": ("BasincSensoru", (0, -0.03, 0)),
        "antenna": ("Anten", (0.45, 0.03, 0.0)),
        "contacts": ("SarjKontak", None),
        "case": ("Kutu", (-1.6, -1.0, -1.6)),
        "d_grille": ("Izgara", (0.0, -0.33, 0.45)),
        "d_diaph": ("Diyafram", (0.0, -0.2, 0.39)),
        "d_coil": ("Bobin", (0.0, -0.29, 0.25)),
        "d_magnet": ("Miknatis", (0.0, -0.21, 0.13)),
        "d_basket": ("Sepet", (0.0, -0.46, 0.14)),
        "d_center": ("Diyafram", (0.0, 0.0, 0.40)),
        "d_rimx": ("Diyafram", (0.46, 0.0, 0.33)),
        "d_rimy": ("Diyafram", (0.0, 0.46, 0.33)),
        "d_up": ("Diyafram", (0.0, 0.0, 1.4)),
        "tipout": ("KulakUcu", None),
        "drvfront": ("Surucu", (0.0, 0.0, 0.45)),
    }
    return sp


def export_anchors(scene, cam, P, info):
    specs = anchor_points(P)
    E = {}
    scene.frame_set(1)
    for k, (parent, lp) in specs.items():
        po = bpy.data.objects[parent]
        if lp is None:
            vs = [v.co for v in po.data.vertices]
            c = A.centroid(vs)
            if k == "tipout":
                c = Vector((c.x, c.y, max(v.z for v in vs)))
            lp = c
        e = empty(f"Capa_{k}", po)
        e.location = Vector(lp)
        E[k] = e
    data = {"fps": FPS, "frames": FRAMES, "timeline": T, "anchors": {k: [] for k in E}}
    data.update(info)
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        for k, e in E.items():
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            ok = co.z > 0
            data["anchors"][k].append([round(co.x * W, 1), round((1 - co.y) * H, 1)] if ok else [-999, -999])
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


# ---------------------------------------------------------------- ana

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    M = build_materials()
    P = build_model(M)
    build_rain(M, P)
    info = animate(P, M, scene)
    drv_face_camera(P, cam_dir(EXPL["elev"] + 2, EXPL["azim"] + 6))
    cam = camera_keys(scene, P)
    build_world_and_lights()
    info = {"vib": [round(v / BOB_AMP, 3) for v in P["vib"]], "vib0": T["MECH"][0] + 6}
    if "--no-anchors" not in argv:
        export_anchors(scene, cam, P, info)
    if "--anchors-only" in argv:
        return
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kulaklik.blend"))

    if "--camtest" in argv:
        fr = int(os.environ.get("F", "1"))
        scene.frame_set(fr)
        rig, tgt = cam.parent, cam.parent.constraints[0].target
        for o in (rig, tgt):
            o.animation_data_clear()
        scene.render.resolution_percentage = 25
        scene.eevee.taa_render_samples = 8
        for i, v in enumerate(os.environ["V"].split(";")):
            vals = [float(a) for a in v.split(",")]
            tx, ty, tz, ss, el, az = vals[:6]
            half = math.atan(18 / cam.data.lens)
            d = ss / 2 / math.tan(half)
            t = Vector((tx, ty, tz))
            tgt.location = t
            rig.location = t + cam_dir(el, az) * d
            scene.render.filepath = os.path.join(OUT, "ct", f"v{i}.png")
            bpy.ops.render.render(write_still=True)
        return
    if "--preview" in argv:
        frames = [int(a) for a in argv[argv.index("--frames") + 1].split(",")] if "--frames" in argv else \
            [1, 12, 40, 70, 100, 145, 240, 380, 420, 450, 520, 600, 640, 700, 750, 810, 830, 860, 900]
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
