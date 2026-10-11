"""Asma kilit — "Bu anahtar neden açıyor da yanlışı açmıyor?" (bölüm 6): POV kanca + ölçek şoku + yanlış/doğru anahtar.

Çalıştırma:
    blender-gpu -b --factory-startup -P scene.py                               # .blend + anchors.json
    blender-gpu -b --factory-startup -P scene.py -- --preview [--frames 1,300]  # ön izleme (%50, 16 örnek)
    blender-gpu -b --factory-startup -P scene.py -- --draft                     # tüm animasyon %25, 4 örnek → out/draft
    blender-gpu -b --factory-startup -P scene.py -- --anchors-only
    blender-gpu -b --factory-startup -P scene.py -- --camtest   (CAM=k1|k2 F=kare V="tx,ty,tz,H,elev,azim[,lens];...")
Tam render (.blend'den, tek geçiş; kamera marker'larla değişir):
    blender-gpu -b blender/out/kilit.blend -o "$PWD/remotion/public/frames/####" -F PNG -a

İki "dünya" aynı sahnede (CPU bölümü dersi — ölçek farkı):
  Dünya 1 (0,0,0)    asma kilit, 1 birim = 1 cm  → Kamera1 (kanca, kapak, etiketler, anahtar deliğine dalış, açılış, final)
  Dünya 2 (500,0,0)  dev pimli silindir, 1 birim = 1 mm (kesit) → Kamera2 (ölçek şoku, pimler, yanlış/doğru anahtar)
Kare numaraları: T sözlüğü Remotion karesi; Blender karesi = Remotion + 1 (B()).
"""
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lock_assets as LA  # noqa: E402

OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

FPS = 30
FRAMES = 990  # 33 sn
W, H = 1080, 1920
FONT_DISPLAY = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"
FONT_MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf"


def B(r):  # Remotion karesi → Blender karesi
    return r + 1


# ---------------------------------------------------------------- zaman çizelgesi (Remotion karesi; tek yer)
T = dict(
    APPROACH=(0, 62),      # POV: el anahtarı deliğe yaklaştırır
    OPEN=(66, 104),        # ön kapak menteşeden açılır
    L1=(108, 236),         # asma kilit parçaları (gövde, U kol, silindir, bilyeler)
    FLY=(236, 290),        # kamera anahtar deliğine dalar
    W2=291,                # dünya 2 (dev pimler)
    SCALE=(291, 372),      # ölçek şoku: anahtar yolundan yukarı → yana çekil
    L2=(372, 508),         # silindir, anahtar pimi, üst pim, yay, kesme çizgisi
    WRONG_IN=(514, 556),
    WRONG_CHECK=(560, 600),
    JAM=(600, 628),
    WRONG_OUT=(632, 654),
    RIGHT_IN=(658, 702),
    CHECK=(708, 753),      # 5 pim × 9 kare
    TURN=(756, 776),
    BACK=777,              # dünya 1'e dönüş
    KEY_IN=(780, 798),
    TURN1=(802, 816),
    POP=(814, 824),
    FACT1=(836, 892),
    FACT2=(892, 940),
    SHACKLE_DOWN=(898, 912),
    DOOR_CLOSE=(904, 934),
    KEY_OUT=(912, 950),
    CTA=(934, 984),
    END=989,
)

W1 = Vector((0, 0, 0))
W2 = Vector((500, 0, 0))

# ---- dünya 2 silindir geometrisi (mm, modelin kendi ekseni: silindir ekseni X, pimler +Z, yüz x=-12.5)
PLUG_Z, PLUG_R, SHEAR = 8.0, 6.0, 14.0
PIN_X = [-9.0, -5.0, -1.0, 3.0, 7.0]          # yüzden içeri: pim 1..5
PIN_L = [3.2, 5.0, 3.8, 6.0, 4.4]             # anahtar pimi boyları
DRIVER_L = 4.0
CHAMBER_TOP = 22.0
B_REST = 6.4                                   # anahtarsız: pim alt ucu anahtar yoluna düşer
CUTS_RIGHT = [SHEAR - l for l in PIN_L]        # doğru anahtar: her pim ayrımı tam kesme çizgisinde
CUTS_WRONG = list(CUTS_RIGHT)
CUTS_WRONG[2] = CUTS_RIGHT[2] - 1.6            # yanlış anahtar: 3. pim fazla derin → üst pim çizgiyi keser
WRONG_PIN = 2
KEY_TIP = 10.0
D_OUT = 36.0                                   # anahtar tamamen dışarıda (uç yüzün 14 mm önünde)


# ---------------------------------------------------------------- yardımcılar (saat/scene.py kalıbı)

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


def material(name, color, metallic=0.0, rough=0.4, coat=0.0, emission=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = rough
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Emission Color"].default_value = (*(emission or color), 1)
    p.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = True
    return m


def recolor(m, color=None, metallic=None, rough=None, emission=None, strength=None):
    p = m.node_tree.nodes["Principled BSDF"]
    for name, val in (("Base Color", None if color is None else (*color, 1)), ("Metallic", metallic),
                      ("Roughness", rough)):
        if val is None:
            continue
        for l in list(p.inputs[name].links):
            m.node_tree.links.remove(l)
        p.inputs[name].default_value = val
    if emission is not None:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = strength or 0.0


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
    inp = mat.node_tree.nodes["Principled BSDF"].inputs[input_name]
    for f, v in pairs:
        inp.default_value = v
        inp.keyframe_insert("default_value", frame=f)


def interp(kind):
    bpy.context.preferences.edit.keyframe_new_interpolation_type = kind


def fcurves(idb):
    """Blender 5 katmanlı action'ından tüm F-eğrileri."""
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


def text(name, body, size, mat, parent, loc, rot=(0, 0, 0), font=FONT_DISPLAY):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(font, check_existing=True)
    cu.size = size
    cu.align_x, cu.align_y = "CENTER", "CENTER"
    cu.materials.append(mat)
    o = link(bpy.data.objects.new(name, cu), parent)
    o.location, o.rotation_euler = loc, rot
    return o


def smooth(u):
    u = max(0.0, min(1.0, u))
    return u * u * (3 - 2 * u)


def ease(r, a, b):
    return smooth((r - a) / (b - a)) if b > a else float(r >= a)


def cylinder_bm(bm, r, z0, z1, seg=32, mat=Matrix.Identity(4)):
    g = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0,
                              matrix=mat @ Matrix.Translation((0, 0, (z0 + z1) / 2)))
    return g


# ---------------------------------------------------------------- POV el (David Fischer, CC BY): anahtarı tutan sağ el

HAND_LEN = 11.0                                   # bilek → orta parmak ucu (cm; stilize, kilidi örtmesin)
HAND_DIR = Vector((-0.62, 0.22, 0.75))            # bilek → çimdik (sağ-alttan gelir)
PINCH_AT = Vector((0.25, 0.0, -1.05))             # anahtar başının alt yarısı (anahtar yerel)
POSE = {  # kemik adı parçası → (x, y, z) derece
    "f_middle.01.R": (62, 0, 0), "f_middle.02.R": (80, 0, 0), "f_middle.03.R": (55, 0, 0),
    "f_ring.01.R": (70, 0, 0), "f_ring.02.R": (85, 0, 0), "f_ring.03.R": (55, 0, 0),
    "f_pinky.01.R": (75, 0, 0), "f_pinky.02.R": (85, 0, 0), "f_pinky.03.R": (55, 0, 0),
    "f_index.01.R": (30, 0, 0), "f_index.02.R": (35, 0, 0), "f_index.03.R": (20, 0, 0),
    "thumb.01.R": (0, 0, 0), "thumb.02.R": (20, 0, 0), "thumb.03.R": (15, 0, 0),
}


def build_hand(P):
    imp = empty("ElKok")
    objs = LA.import_glb("hands_fp.glb", imp)
    names_ = [o.name for o in objs]
    for n in names_:
        if n.startswith("Icosphere"):
            bpy.data.objects.remove(bpy.data.objects[n])
    objs = [bpy.data.objects[n] for n in names_ if n in bpy.data.objects]
    arm = [o for o in objs if o.type == "ARMATURE"][0]
    meshes = [o for o in objs if o.type == "MESH"]
    skin = material("Ten", hex_rgb("#d9a184"), rough=0.55, coat=0.0)
    skin.node_tree.nodes["Principled BSDF"].inputs["Subsurface Weight"].default_value = 0.15
    for o in meshes:  # sol kolu sil (vertex grubunda ağırlığı en büyük kemik .L)
        names = {g.index: g.name for g in o.vertex_groups}
        bm = bmesh.new()
        bm.from_mesh(o.data)
        dl = bm.verts.layers.deform.active
        kill = []
        if dl is not None:
            for v in bm.verts:
                w = v[dl]
                if w:
                    gi = max(w.keys(), key=lambda k: w[k])
                    if ".L" in names.get(gi, ""):
                        kill.append(v)
        bmesh.ops.delete(bm, geom=kill, context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
        o.data.materials.clear()
        o.data.materials.append(skin)
        for poly in o.data.polygons:
            poly.use_smooth = True
    for pb in arm.pose.bones:
        for k, r in POSE.items():
            if pb.name.startswith(k):
                pb.rotation_mode = "XYZ"
                pb.rotation_euler = [math.radians(a) for a in r]
    bpy.context.view_layer.update()

    skin_o = max(meshes, key=lambda o: len(o.data.vertices))
    dg = bpy.context.evaluated_depsgraph_get()
    ev = skin_o.evaluated_get(dg)
    em = ev.to_mesh()
    gidx = {g.name: g.index for g in skin_o.vertex_groups}

    def grp(prefix):
        """Deforme mesh'te o kemik grubuna en çok bağlı köşelerin ağırlık merkezi (dünya)."""
        gi = [i for n, i in gidx.items() if n.startswith(prefix)][0]
        acc, wsum = Vector(), 0.0
        for v in skin_o.data.vertices:
            for g in v.groups:
                if g.group == gi and g.weight > 0.5:
                    acc += (ev.matrix_world @ em.vertices[v.index].co) * g.weight
                    wsum += g.weight
        return acc / wsum

    it, tt, wr = grp("f_index.03.R"), grp("thumb.03.R"), grp("hand.R")
    mid = grp("f_middle.03.R")
    ev.to_mesh_clear()
    pinch = (it + tt) / 2
    f = (pinch - wr).normalized()
    sv = (tt - it)
    sv = (sv - f * sv.dot(f)).normalized()
    Rr = Matrix((f, sv, f.cross(sv))).transposed()          # yerel → dünya (sütunlar)
    ft = HAND_DIR.normalized()
    st = Vector((0, -1, 0))
    st = (st - ft * st.dot(ft)).normalized()
    Rt = Matrix((ft, st, ft.cross(st))).transposed()
    rot = (Rt @ Rr.inverted()).to_4x4()
    k = HAND_LEN / ((mid - wr).length * 1.25)
    print("EL olcek", round(k, 4), "bilek-cimdik", round((pinch - wr).length, 3))
    rig = empty("ElRig", P["key_rot"])
    M = Matrix.Translation(PINCH_AT) @ rot @ Matrix.Scale(k, 4) @ Matrix.Translation(-pinch)
    imp.parent = rig
    imp.matrix_basis = M @ imp.matrix_basis
    return {"rig": rig, "arm": arm, "meshes": meshes}


# ---------------------------------------------------------------- dünya 1: asma kilit (cm)

def build_padlock():
    tmp = empty("tmp_kilit")
    objs = LA.import_glb("padlock_small.glb", tmp)
    LA.clean_textures()
    meshes = [o for o in objs if o.type == "MESH"]
    M = Matrix.Translation(W1) @ Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Scale(0.04, 4)
    for o in meshes:
        LA.bake_world(o)
        o.data.transform(M)
    for o in objs:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    bpy.data.objects.remove(tmp)
    by = {o.name: o for o in meshes}
    mats = LA.fix_materials(meshes)
    for m in mats:  # pirinç biraz daha sıcak/parlak, kabuk okunur kalsın
        m.node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 0.25

    root = empty("Kilit")
    # Object_3'teki U kol kovanı bacaklarla aynı yarıçapta → z-fighting (siyah/gri titreme). U kol yüzeyine
    # 0,03 cm'den yakın yüzleri BVH ile bul (köşe değil yüzey mesafesi; uzun düz bacakta köşe yalnız uçlarda).
    from mathutils.bvhtree import BVHTree
    sh = by["Object_8"]
    bsh = bmesh.new()
    bsh.from_mesh(sh.data)
    bsh.transform(sh.matrix_world)
    tree = BVHTree.FromBMesh(bsh)
    bsh.free()

    def near(co):
        hit = tree.find_nearest(co)
        return hit[3] if hit[0] is not None else 9.0

    bm = bmesh.new()
    bm.from_mesh(by["Object_3"].data)
    sleeve = [f for f in bm.faces if near(f.calc_center_median()) < 0.03 and all(near(v.co) < 0.04 for v in f.verts)]
    # Çakışan yüzler (sol bacakta temiz halka, sağda U kol çentiğiyle çakışan düz yüzler de var) silinir; yerine
    # U kola değmeyen kendi kovanlarımız konur (aşağıda). Normal/radyal itme denendi: U kolun yüz normalleri
    # tutarsız, düz çentik yüzleri radyal itmeyle ayrılmıyor → titreme sürdü.
    print("U kol kovanı: silinen yüz", len(sleeve))
    bmesh.ops.delete(bm, geom=sleeve, context="FACES")
    bm.to_mesh(by["Object_3"].data)
    bm.free()
    bore_m = material("UKolYuvasi", hex_rgb("#6b4a22"), metallic=1.0, rough=0.38)
    bore_m.use_backface_culling = False
    for sx, z0 in ((-1, -0.47), (1, 0.84)):
        bmb = bmesh.new()
        g = bmesh.ops.create_cone(bmb, cap_ends=False, segments=48, radius1=0.385, radius2=0.385, depth=1.575 - z0,
                                  matrix=Matrix.Translation((sx * 1.397, 0, (z0 + 1.575) / 2)))
        mesh_obj(f"UKolYuvasi{'L' if sx < 0 else 'R'}", bmb, bore_m, None, smooth=True)
    # anahtar: x < -3 olan parçalar (Object_3/4/7)
    key_parts = []
    for n in ("Object_3", "Object_4", "Object_7"):
        k = LA.split_faces(by[n], lambda c: c.x < -3.0, f"Anahtar1_{n}")
        key_parts.append(k)
    # anahtar yerel koordinatı: bıçak ekseni orijinde, başın üstü (bıçak başlangıcı) z=0, ölçek 0.7
    KEYS = 0.7
    Mk = Matrix.Scale(KEYS, 4) @ Matrix.Translation((5.89, -0.065, -0.68))
    key_rig = empty("AnahtarRig1", root)
    key_rot = empty("AnahtarDon1", key_rig)  # döndürme (anahtar çevrilir)
    for k in key_parts:
        k.data.transform(Mk)
        k.parent = key_rot
    # kapak: Object_6'nın ön yüzü (y < -0.43), menteşe sol ön kenarda
    door = LA.split_faces(by["Object_6"], lambda c: c.y < -0.43, "Kapak")
    # Object_3: ön plakanın iç katmanı kapağa katılır; silindiri saran iç tüp (r 0,61) silinir (bizim silindirimizi örter)
    inner = LA.split_faces(by["Object_3"], lambda c: c.y < -0.66 or (c.y < -0.44 and abs(c.x) > 0.7), "KapakIc")
    tube = LA.split_faces(by["Object_3"], lambda c: abs(c.x) < 0.63 and abs(c.y) < 0.63 and c.z > -1.9, "IcTup")
    bpy.data.objects.remove(tube)
    inner.data.transform(Matrix.Translation(-Vector((-1.99, -0.62, 0))))
    hinge = empty("Mentese", root, loc=(-1.99, -0.62, 0))
    door.data.transform(Matrix.Translation(-hinge.location))
    door.parent = hinge
    inner.parent = hinge
    # U kol
    shackle_rig = empty("UKolRig", root)
    by["Object_8"].name = "UKol"
    by["Object_8"].parent = shackle_rig
    body = [by[n] for n in ("Object_3", "Object_4", "Object_5", "Object_6")]
    for o in body:
        o.parent = root
    by["Object_6"].name = "Govde"
    # kanal kazıması kapağın ön yüzüne (Shrinkwrap ile kavisli yüzeye oturur)
    ink = material("Kazima", hex_rgb("#1d1406"), metallic=0.4, rough=0.45, emission=hex_rgb("#ffd23f"), strength=0.0)
    ink_y = material("KazimaSari", hex_rgb("#2a1d05"), metallic=0.4, rough=0.45, emission=hex_rgb("#ffd23f"),
                     strength=0.0)
    lo, hi = LA.world_bbox([door])
    rot = (math.radians(90), 0, 0)
    t1 = text("Kazima_WhatsInside", "WHAT'S\nINSIDE", 0.62, ink, hinge,
              Vector((0.0, -0.9, 0.05)) - hinge.location, rot)
    t1.data.space_line = 0.85
    t2 = text("Kazima_Kanal", "@whatsinit.lab", 0.3, ink_y, hinge, Vector((0.0, -0.9, -0.95)) - hinge.location, rot,
              font=FONT_MONO)
    for t in (t1, t2):
        sw = t.modifiers.new("sw", "SHRINKWRAP")
        sw.wrap_method = "PROJECT"
        sw.use_project_y = True
        sw.use_negative_direction = True
        sw.use_positive_direction = True
        sw.target = door
        sw.offset = 0.006
    return {"root": root, "key_rig": key_rig, "key_rot": key_rot, "key_parts": key_parts, "door": door,
            "hinge": hinge, "shackle": shackle_rig, "ink": (ink, ink_y), "body": body, "texts": (t1, t2)}


def import_cylinder(tag, M):
    """Jack Kelly silindiri: maymuncuk aracı ve yerinden çıkmış akrilik yarım SİLİNİR; dönüşüm mesh'e uygulanır."""
    tmp = empty(f"tmp_{tag}")
    objs = LA.import_glb("cylinder.glb", tmp)
    meshes = [o for o in objs if o.type == "MESH"]
    others = [o.name for o in objs if o.type != "MESH"]
    out = {"pins": [], "springs": []}
    for o in meshes:
        n = o.name
        if "Tool" in n or n.startswith("Acrylic-material.001"):
            bpy.data.objects.remove(o)
            continue
        LA.bake_world(o)
        o.data.transform(M)
        o.name = f"{tag}:{n}"
        if n.startswith("Steel-material"):
            out["pins"].append(o)
        elif n.startswith("Spring-material"):
            out["springs"].append(o)
        elif n.startswith("Brass"):
            out["plug"] = o
        elif n.startswith("Acrylic"):
            out["housing"] = o
    for n in others:
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    bpy.data.objects.remove(tmp)
    return out


def build_cylinder1(P):
    """Asma kilidin içindeki silindir (dünya 1): aynı model küçük ölçekte, ekseni dikey, yüzü anahtar deliğinde."""
    # model (m) → mm → yüz merkezi orijine → eksen x→z, pimler +z→+x → 0,1 cm/mm → kilidin dibine
    R = Matrix(((0, 0, 1, 0), (0, -1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1)))
    M = (Matrix.Translation(W1 + Vector((0, 0, -1.93))) @ Matrix.Scale(0.1, 4) @ R
         @ Matrix.Translation((12.5, 0, -PLUG_Z)) @ Matrix.Scale(1000, 4))
    C = import_cylinder("k1", M)
    LA.fix_materials([C["plug"], C["housing"]] + C["pins"] + C["springs"])
    hm = C["housing"].data.materials[0]
    recolor(hm, hex_rgb("#9aa3b2"), metallic=1.0, rough=0.3)
    plug_rig = empty("Silindir1Don", P["root"], loc=W1)
    C["plug"].parent = plug_rig
    for o in [C["housing"]] + C["pins"] + C["springs"]:
        o.parent = P["root"]
    # kam: silindirin arka ucundan çıkan şaft + yassı dil (bilyeleri dışarı iter)
    steel = material("KamCelik", hex_rgb("#5b6372"), metallic=1.0, rough=0.28)
    bm = bmesh.new()
    cylinder_bm(bm, 0.13, 0.5, 1.05)
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, 0, 1.17)) @ Matrix.Diagonal((1.36, 0.3, 0.26, 1)))
    cam = mesh_obj("Kam", bm, steel, plug_rig)
    # bilyeler (kilitleme bilyeleri) — U kol bacaklarının çentiklerine girer
    ballm = material("Bilye", hex_rgb("#dfe4ec"), metallic=1.0, rough=0.12, emission=hex_rgb("#4d9bff"), strength=0.0)
    balls = []
    for sx in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.22)
        b = mesh_obj(f"Bilye{'L' if sx < 0 else 'R'}", bm, ballm, P["root"], smooth=True)
        b.location = (sx * 0.9, 0, 1.17)
        balls.append(b)
    C.update(plug_rig=plug_rig, cam=cam, balls=balls, ballm=ballm)
    return C


# ---------------------------------------------------------------- dünya 2: dev silindir (mm, kesit)

def build_cylinder2():
    M = Matrix.Translation(W2) @ Matrix.Scale(1000, 4)
    C = import_cylinder("k2", M)
    LA.fix_materials([C["plug"]] + C["pins"] + C["springs"])
    # akrilik gövde: önde, çok saydam cam (pimler arkasından okunur)
    hm = C["housing"].data.materials[0]
    p = hm.node_tree.nodes["Principled BSDF"]
    for l in list(p.inputs["Alpha"].links):
        hm.node_tree.links.remove(l)
    p.inputs["Alpha"].default_value = 0.08
    recolor(hm, hex_rgb("#cfe9ff"), metallic=0.0, rough=0.06)
    hm.surface_render_method = "BLENDED"
    hm.use_backface_culling = True
    # silindir (plug) kesiti: önü (y<0) kesilir → pim yuvaları görünür
    LA.bisect_keep(C["plug"], W2, Vector((0, 1, 0)))
    plug_rig = empty("Silindir2Don", None, loc=W2 + Vector((0, 0, PLUG_Z)))
    C["plug"].data.transform(Matrix.Translation(-plug_rig.location))
    C["plug"].parent = plug_rig
    # anahtar pimleri (modelin çelik pimleri): x'e göre sırala, boyu PIN_L'ye ölçekle, orijin alt uçta
    pinm = material("AnahtarPimi", hex_rgb("#e9edf3"), metallic=1.0, rough=0.18, emission=hex_rgb("#ffffff"),
                    strength=0.0)
    pins = sorted(C["pins"], key=lambda o: LA.world_bbox([o])[0].x)
    springs = sorted(C["springs"], key=lambda o: LA.world_bbox([o])[0].x)
    keypins, drivers, sprs, dmats = [], [], [], []
    for i, (o, sp) in enumerate(zip(pins, springs)):
        lo, hi = LA.world_bbox([o])
        c = (lo + hi) / 2
        o.data.transform(Matrix.Translation((-c.x, -c.y, -lo.z)))
        o.data.transform(Matrix.Diagonal((1, 1, PIN_L[i] / (hi.z - lo.z), 1)))
        o.data.materials[0] = pinm
        piv = empty(f"AnahtarPimi{i + 1}", plug_rig)
        piv.location = Vector((c.x, 0, B_REST)) + W2 - plug_rig.location
        o.parent = piv
        o.location = (0, 0, 0)
        o.name = f"k2:AnahtarPimi{i + 1}"
        keypins.append(piv)
        # üst (sürücü) pim: kodla, mavi çelik; malzemesi pim başına (kontrol taramasında yeşil/kırmızı parlar)
        dm = material(f"UstPim{i + 1}", hex_rgb("#3d6fd8"), metallic=0.85, rough=0.22, emission=hex_rgb("#4be08a"),
                      strength=0.0)
        bm = bmesh.new()
        cylinder_bm(bm, 0.8, 0.0, DRIVER_L, seg=32)
        d = mesh_obj(f"UstPim{i + 1}", bm, dm, None, smooth=False)
        d.location = Vector((c.x, 0, B_REST + PIN_L[i])) + W2
        drivers.append(d)
        dmats.append(dm)
        # yay: orijin üstte (CHAMBER_TOP), z ölçeği sürücü pimin üstüne kadar
        slo, shi = LA.world_bbox([sp])
        sc = (slo + shi) / 2
        sp.data.transform(Matrix.Translation((-sc.x, -sc.y, -shi.z)))
        sp["L0"] = shi.z - slo.z
        sp.location = Vector((sc.x, sc.y, shi.z))
        sp.name = f"k2:Yay{i + 1}"
        sprs.append(sp)
    for m in C["springs"][0].data.materials:
        recolor(m, hex_rgb("#cfd6e0"), metallic=1.0, rough=0.2)
    # kesme çizgisi: silindir ile gövde arasındaki ayrım (z=14), pimlerin önünde ince ışıklı şerit
    shear_m = material("KesmeCizgisi", hex_rgb("#ffd23f"), emission=hex_rgb("#ffd23f"), strength=0.0, alpha=1.0)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(W2 + Vector((-1.25, -1.0, SHEAR)))
                          @ Matrix.Diagonal((24.5, 0.12, 0.22, 1)))
    shear = mesh_obj("KesmeCizgisi", bm, shear_m)
    C.update(plug_rig=plug_rig, keypins=keypins, drivers=drivers, springs=sprs, dmats=dmats, shear=shear,
             shear_m=shear_m, pinm=pinm)
    return C


def key_profile(cuts, s):
    """Anahtar sırtı yüksekliği (mm), s = tam takılıyken silindir koordinatı. Uçtan öte → None."""
    if s > KEY_TIP:
        return None
    h = 11.4
    for x, c in zip(PIN_X, cuts):
        h = min(h, c + max(0.0, abs(s - x) - 0.45) * 1.05)
    return min(h, 5.4 + (KEY_TIP - s) * 1.3)


def pin_bottom(cuts, d, i):
    """d: anahtarın tam takılı konumdan geri çekilme miktarı (mm). Pim ucu (±0,55 mm) sırta oturur."""
    best = B_REST
    for u in (-0.55, -0.3, 0.0, 0.3, 0.55):
        h = key_profile(cuts, PIN_X[i] + d + u)
        if h is not None:
            best = max(best, h)
    return best


def build_key2(name, cuts, color, metallic, rough, emission=None, strength=0.0):
    """Kodla anahtar (dünya 2): sırt profili + bıçak + baş. Orijin = tam takılı konum (silindir koordinatı)."""
    m = material(f"Anahtar{name}", hex_rgb(color), metallic=metallic, rough=rough,
                 emission=hex_rgb(emission) if emission else None, strength=strength)
    xs = [KEY_TIP - i * 0.25 for i in range(int((KEY_TIP + 14.0) / 0.25) + 1)]
    top = [(x, key_profile(cuts, x)) for x in xs]
    bot_z = 2.9
    pts = [(x, z) for x, z in top] + [(-14.0, bot_z), (KEY_TIP, bot_z)]
    bm = bmesh.new()
    th = 0.75
    vf = [bm.verts.new((x, -th, z)) for x, z in pts]
    vb = [bm.verts.new((x, th, z)) for x, z in pts]
    n = len(pts)
    bm.faces.new(vf[::-1])
    bm.faces.new(vb)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vf[i], vf[j], vb[j], vb[i]))
    # baş (bow): yuvarlatılmış levha, ortasında delik hissi için halka
    g = bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((-24.0, 0, 7.2)) @ Matrix.Diagonal((20, 2.2, 20, 1)))
    bmesh.ops.bevel(bm, geom=[e for e in g["verts"]], offset=6.0, segments=8, affect="VERTICES")
    obj = mesh_obj(f"Anahtar2_{name}", bm, m, None)
    bev = obj.modifiers.new("b", "BEVEL")
    bev.width, bev.segments, bev.limit_method = 0.18, 2, "ANGLE"
    return obj, m


# ---------------------------------------------------------------- animasyon

def animate(P, C1, C2, K2):
    scene = bpy.context.scene
    info = {}
    kr, kd = P["key_rig"], P["key_rot"]
    face = -1.966
    # --- dünya 1 anahtar: P0 (aşağıda, kameraya doğru) → P1 (deliğin hemen altı) ; içeri ; çevir ; çıkar
    P0 = Vector((0.0, 0.0, face - 4.2))
    P1 = Vector((0.0, 0.0, face - 2.62))  # anahtar ucu deliğin hemen altında
    PIN_ = Vector((0.0, 0.0, face - 0.03))
    interp("BEZIER")
    key(kr, 1, loc=P0)
    PARK = Vector((4.5, -4.5, face - 7.5))  # orta bölümde el + anahtar kenarda (dalış yolunu kapatmasın)
    key(kr, B(T["APPROACH"][1]), loc=P1)
    key(kr, B(T["OPEN"][1]), loc=PARK)
    key(kr, B(T["SCALE"][1]), loc=PARK)
    key(kr, B(T["TURN"][0]), loc=P1)
    key(kr, B(T["KEY_IN"][0]), loc=P1)
    key(kr, B(T["KEY_IN"][1]), loc=PIN_)
    key(kr, B(T["KEY_OUT"][0]), loc=PIN_)
    key(kr, B(T["KEY_OUT"][0] + 16), loc=P1)
    key(kr, FRAMES, loc=P0)
    key(kd, 1, rot=(0, 0, 0))
    key(kd, B(T["TURN1"][0]), rot=(0, 0, 0))
    key(kd, B(T["TURN1"][1]), rot=(0, 0, math.radians(90)))
    key(kd, B(T["KEY_OUT"][0] - 6), rot=(0, 0, math.radians(90)))
    key(kd, B(T["KEY_OUT"][0]), rot=(0, 0, 0))
    pr = C1["plug_rig"]
    for f, a in ((1, 0), (B(T["TURN1"][0]), 0), (B(T["TURN1"][1]), 90), (B(T["KEY_OUT"][0] - 6), 90),
                 (B(T["KEY_OUT"][0]), 0)):
        key(pr, f, rot=(0, 0, math.radians(a)))
    # bilyeler: kam dönünce içe çekilir; U kol fırlar ; finalde geri
    for b in C1["balls"]:
        sx = 1 if b.location.x > 0 else -1
        for f, x in ((1, 0.9), (B(T["TURN1"][0] + 6), 0.9), (B(T["TURN1"][1]), 0.62), (B(T["SHACKLE_DOWN"][1]), 0.62),
                     (B(T["SHACKLE_DOWN"][1] + 6), 0.9)):
            key(b, f, loc=(sx * x, 0, 1.17))
    sh = P["shackle"]
    key(sh, 1, loc=(0, 0, 0))
    key(sh, B(T["POP"][0]), loc=(0, 0, 0))
    interp("BEZIER")
    key(sh, B(T["POP"][1]), loc=(0, 0, 0.95))
    key(sh, B(T["SHACKLE_DOWN"][0]), loc=(0, 0, 0.95))
    key(sh, B(T["SHACKLE_DOWN"][1]), loc=(0, 0, 0))
    hg = P["hinge"]
    for f, a in ((1, 0), (B(T["OPEN"][0]), 0), (B(T["OPEN"][1]), -118), (B(T["DOOR_CLOSE"][0]), -118),
                 (B(T["DOOR_CLOSE"][1]), 0)):
        key(hg, f, rot=(0, 0, math.radians(a)))
    key_input(C1["ballm"], "Emission Strength", [(1, 0.0), (B(196), 0.0), (B(202), 2.5), (B(232), 0.0),
                                                  (B(T["TURN1"][0]), 0.0), (B(T["TURN1"][1]), 2.0),
                                                  (B(T["TURN1"][1] + 20), 0.0)])
    for m in P["ink"]:
        key_input(m, "Emission Strength", [(1, 0.0), (B(T["CTA"][0]), 0.0), (B(T["CTA"][0] + 12), 1.6),
                                           (B(T["CTA"][0] + 40), 0.0)])

    # --- dünya 2: anahtar konumları (geri çekilme d, mm) her kare
    def d_wrong(r):
        a, b = T["WRONG_IN"]
        c, e = T["WRONG_OUT"]
        if r < a or r > e:
            return D_OUT
        if r <= b:
            return D_OUT * (1 - ease(r, a, b))
        if r < c:
            return 0.0
        return D_OUT * ease(r, c, e)

    def d_right(r):
        a, b = T["RIGHT_IN"]
        if r < a:
            return D_OUT
        return D_OUT * (1 - ease(r, a, b))

    w0, w1 = B(T["W2"]) - 4, B(T["BACK"]) + 4
    plug2 = C2["plug_rig"]
    kw, kc = K2["wrong"][0], K2["right"][0]
    for o in (kw, kc):
        o.parent = plug2
    interp("LINEAR")
    info["pinB"] = [[] for _ in PIN_X]
    info["pinB0"] = w0 - 1  # pinB[i][j] → Remotion karesi pinB0 + j
    info["keyD"] = []
    for f in range(w0, w1 + 1):
        r = f - 1
        dw, dr = d_wrong(r), d_right(r)
        # plug dönüşü: sıkışma (yanlış) / dönüş (doğru)
        ang = 0.0
        if T["JAM"][0] <= r <= T["JAM"][1]:
            u = (r - T["JAM"][0]) / (T["JAM"][1] - T["JAM"][0])
            ang = 4.0 * math.sin(u * math.pi * 3) * (1 - u)
        if r >= T["TURN"][0]:
            ang = -40.0 * ease(r, *T["TURN"])
        key(plug2, f, rot=(math.radians(ang), 0, 0))
        key(kw, f, loc=Vector((-dw, 0, -PLUG_Z)))
        key(kc, f, loc=Vector((-dr, 0, -PLUG_Z)))
        cuts, d = (CUTS_WRONG, dw) if dw < D_OUT - 1e-6 else (CUTS_RIGHT, dr)
        info["keyD"].append(round(min(dw, dr), 2))
        for i, (kp, dv, sp) in enumerate(zip(C2["keypins"], C2["drivers"], C2["springs"])):
            b = pin_bottom(cuts, d, i)
            key(kp, f, loc=Vector((PIN_X[i], 0, b - PLUG_Z)))
            # sürücü pim: silindir dönerken gövdede kalır; pim ayrımının üstünde
            top = b + PIN_L[i]
            if r >= T["TURN"][0]:
                top = SHEAR
            key(dv, f, loc=W2 + Vector((PIN_X[i], 0, top)))
            sl = (CHAMBER_TOP - (top + DRIVER_L)) / sp["L0"]
            key(sp, f, scale=(1, 1, max(0.15, sl)))
            info["pinB"][i].append(round(b, 2))
    interp("BEZIER")
    for o in (kw, kc):  # dışarıdayken gizli (dünya 1'de görünmesin diye zaten uzak; kesitte uç görünmesin)
        o.hide_render = True
        o.keyframe_insert("hide_render", frame=1)
    interp("CONSTANT")
    for o, (a, e) in ((kw, (T["WRONG_IN"][0], T["WRONG_OUT"][1])), (kc, (T["RIGHT_IN"][0], FRAMES))):
        o.hide_render = False
        o.keyframe_insert("hide_render", frame=B(a))
        o.hide_render = True
        o.keyframe_insert("hide_render", frame=B(e) + 1)
    interp("BEZIER")
    # kontrol taraması: yanlışta 1,2 ✓ 3 ✕ 4,5 ✓ ; doğruda 1..5 ✓ (yeşil); kesme çizgisi parlar
    wc0, wc1 = T["WRONG_CHECK"]
    rc0, rc1 = T["CHECK"]
    step_w = (wc1 - wc0) / 5
    step_r = (rc1 - rc0) / 5
    info["checkWrong"] = [round(wc0 + i * step_w) for i in range(5)]
    info["checkRight"] = [round(rc0 + i * step_r) for i in range(5)]
    for i, dm in enumerate(C2["dmats"]):
        tw, tr = info["checkWrong"][i], info["checkRight"][i]
        bad = i == WRONG_PIN
        col = hex_rgb("#ff4d5e") if bad else hex_rgb("#4be08a")
        inp = dm.node_tree.nodes["Principled BSDF"].inputs["Emission Color"]
        interp("CONSTANT")
        inp.default_value = (*col, 1)
        inp.keyframe_insert("default_value", frame=1)
        inp.default_value = (*hex_rgb("#4be08a"), 1)
        inp.keyframe_insert("default_value", frame=B(T["WRONG_OUT"][1]))
        interp("BEZIER")
        set_interp(dm.node_tree, "inputs[28]", "CONSTANT")
        key_input(dm, "Emission Strength", [(1, 0.0), (B(tw), 0.0), (B(tw + 3), 3.0 if bad else 1.6),
                                            (B(T["WRONG_OUT"][0]), 3.0 if bad else 1.2), (B(T["WRONG_OUT"][1]), 0.0),
                                            (B(tr), 0.0), (B(tr + 3), 2.2), (B(T["TURN"][1] + 4), 1.4)])
    sm = C2["shear_m"]
    key_input(sm, "Emission Strength", [(1, 0.0), (B(470), 0.0), (B(476), 4.0), (B(T["L2"][1]), 2.0),
                                        (B(T["WRONG_IN"][0]), 1.6), (B(T["TURN"][0]), 1.6), (B(T["TURN"][0] + 4), 5.0),
                                        (B(T["BACK"]), 3.0)])
    inp = sm.node_tree.nodes["Principled BSDF"].inputs["Emission Color"]
    interp("CONSTANT")
    for f, c in ((1, "#ffd23f"), (B(T["JAM"][0]), "#ff4d5e"), (B(T["WRONG_OUT"][1]), "#ffd23f"),
                 (B(rc1), "#4be08a")):
        inp.default_value = (*hex_rgb(c), 1)
        inp.keyframe_insert("default_value", frame=f)
    set_interp(sm.node_tree, "inputs[28]", "CONSTANT")
    interp("BEZIER")
    return info


# ---------------------------------------------------------------- kameralar

def make_cam(name, lens, clip=(0.01, 60)):
    target = empty(f"{name}Hedef")
    rig = empty(f"{name}Rig")
    c = rig.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.clip_start, cd.clip_end = lens, *clip
    cam = link(bpy.data.objects.new(name, cd), rig)

    def shot(frame, t, size, elev=20, azim=0, roll=0.0, lens=None):
        """size: portrede görünen yükseklik. lens verilirse keyframe'lenir ve mesafe ona göre."""
        if lens is not None:
            cd.lens = lens
            cd.keyframe_insert("lens", frame=frame)
        half = math.atan(18 / cd.lens)
        e, a = math.radians(elev), math.radians(azim)
        direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        d = size / 2 / math.tan(half)
        key(target, frame, loc=Vector(t))
        key(rig, frame, loc=Vector(t) + direction * d)
        key(cam, frame, rot=(0, 0, math.radians(roll)))

    return cam, shot


HOOK = dict(t=(0.0, 0.0, 0.85), size=13.0, elev=-22, azim=22, roll=-3, lens=50)


def camera_keys(scene):
    interp("BEZIER")
    cam1, s1 = make_cam("Kamera1", 50, clip=(0.01, 60))
    s1(1, **HOOK)
    s1(B(T["APPROACH"][1]), (0.0, 0.0, 0.55), 11.6, -20, 18, -2, lens=50)
    inside = dict(t=(0.15, 0.0, 0.65), size=9.6, elev=8, azim=10, roll=0)
    s1(B(T["OPEN"][1]), **inside)
    s1(B(T["L1"][1] - 30), (0.1, 0.0, 0.55), 9.0, 6, -6, 0)
    # dalış: kilidin altına in, anahtar deliğine yukarı doğru bak, gir
    s1(B(T["FLY"][0] + 18), (0.0, 0.0, -1.97), 3.2, -80, -6, 0)
    s1(B(T["FLY"][1]), (0.0, 0.0, -1.80), 0.05, -88, -6, 0)
    s1(B(T["BACK"]), (0.1, 0.0, 1.3), 9.4, 8, 6, 0)
    s1(B(T["POP"][1] + 8), (0.1, 0.0, 1.75), 10.4, 10, 12, 0)
    s1(B(T["FACT2"][1]), (0.1, 0.0, 1.45), 10.8, 12, 18, 0)
    s1(B(T["KEY_OUT"][1]), (0.0, 0.0, 0.8), 12.6, -20, 22, -2)
    s1(FRAMES, **HOOK)

    cam2, s2 = make_cam("Kamera2", 16, clip=(0.05, 120))
    w = W2
    # ölçek şoku: anahtar yolunun içinden (yüzün önünde, alçakta) dev pim sütunlarına bak → yana çekil
    s2(B(T["W2"]), w + Vector((-2.0, 0.0, 12.0)), 30, 18, -62, 0, lens=14)
    s2(B(T["W2"] + 36), w + Vector((-1.5, 0.0, 12.5)), 34, 12, -40, 0, lens=18)
    side = dict(t=w + Vector((-1.0, 0.0, 9.5)), size=46, elev=6, azim=0, roll=0, lens=35)
    s2(B(T["SCALE"][1]), **side)
    s2(B(T["L2"][1]), w + Vector((-1.0, 0.0, 9.5)), 44, 5, 6, 0)
    s2(B(T["WRONG_IN"][0]), w + Vector((-3.0, 0.0, 9.5)), 46, 5, 0, 0)
    s2(B(T["JAM"][1]), w + Vector((-1.0, 0.0, 10.0)), 40, 5, 4, 0)
    s2(B(T["RIGHT_IN"][1]), w + Vector((-1.0, 0.0, 9.5)), 44, 5, -2, 0)
    s2(B(T["CHECK"][1]), w + Vector((-1.0, 0.0, 10.5)), 40, 6, 4, 0)
    s2(B(T["BACK"]), w + Vector((2.0, 0.0, 9.0)), 52, 14, 14, 0)
    for f, cam in ((1, cam1), (B(T["W2"]), cam2), (B(T["BACK"]), cam1)):
        mk = scene.timeline_markers.new(f"cam{f}", frame=f)
        mk.camera = cam
    scene.camera = cam1
    return {"k1": cam1, "k2": cam2}


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
    sun("On", (95, 0, 0), 1.4, (1.0, 0.98, 0.95), angle=15)
    sun("Alt", (-120, 0, 10), 1.6, (0.9, 0.95, 1.0), angle=20)  # kancada kilidin altı (anahtar deliği) okunsun


# ---------------------------------------------------------------- çapalar

def anchor_points(P, C1, C2, K2):
    """(dünya, ebeveyn obje adı, dünya noktası kare 1'de)."""
    bpy.context.scene.frame_set(1)
    sp = {}
    lo, hi = LA.world_bbox(P["body"])
    sp["body"] = (1, "Govde", Vector((1.55, 0.3, -1.2)))
    sp["shackle"] = (1, "UKol", Vector((0.0, 0.0, 4.32)))
    sp["shackleL"] = (1, "UKol", Vector((-1.39, 0.0, 2.6)))
    sp["cyl1"] = (1, C1["plug"].name, Vector((-0.55, -0.1, -1.2)))
    sp["ballL"] = (1, "BilyeL", Vector((-0.9, -0.15, 1.17)))
    sp["ballR"] = (1, "BilyeR", Vector((0.9, -0.15, 1.17)))
    sp["cam"] = (1, "Kam", Vector((0.0, -0.15, 1.17)))
    sp["keyhole"] = (1, "Govde", Vector((0.0, 0.0, -1.97)))
    sp["key1"] = (1, "AnahtarDon1", Vector((0.0, 0.0, -0.6)))
    w = W2
    sp["plug"] = (2, C2["plug"].name, w + Vector((-6.0, -0.5, 4.0)))
    for i in range(5):
        sp[f"keypin{i + 1}"] = (2, f"AnahtarPimi{i + 1}", w + Vector((PIN_X[i], -0.8, B_REST + PIN_L[i] * 0.5)))
        sp[f"driver{i + 1}"] = (2, f"UstPim{i + 1}", w + Vector((PIN_X[i], -0.8, B_REST + PIN_L[i] + DRIVER_L * 0.5)))
        sp[f"spring{i + 1}"] = (2, f"k2:Yay{i + 1}", w + Vector((PIN_X[i], -0.8, 20.0)))
        sp[f"gap{i + 1}"] = (2, f"AnahtarPimi{i + 1}", w + Vector((PIN_X[i], -0.8, B_REST + PIN_L[i])))
    sp["shearL"] = (2, "KesmeCizgisi", w + Vector((-13.0, -1.0, SHEAR)))
    sp["shearR"] = (2, "KesmeCizgisi", w + Vector((10.5, -1.0, SHEAR)))
    sp["key2"] = (2, K2["right"][0].name, w + Vector((-16.0, 0.0, 7.0)))
    sp["key2w"] = (2, K2["wrong"][0].name, w + Vector((-16.0, 0.0, 7.0)))
    return sp


def export_anchors(scene, cams, P, C1, C2, K2, info):
    specs = anchor_points(P, C1, C2, K2)
    E = {}
    for k, (wi, parent, wp) in specs.items():
        po = bpy.data.objects[parent]
        e = empty(f"Capa_{k}", po)
        e.location = po.matrix_world.inverted() @ wp
        E[k] = (wi, e)
    data = {"fps": FPS, "frames": FRAMES, "timeline": T, "anchors": {k: [] for k in E}}
    data.update(info)
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        cam = scene.camera
        wi_active = 1 if cam == cams["k1"] else 2
        for k, (wi, e) in E.items():
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            ok = wi == wi_active and co.z > 0
            data["anchors"][k].append([round(co.x * W, 1), round((1 - co.y) * H, 1)] if ok else [-999, -999])
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


# ---------------------------------------------------------------- ana

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    P = build_padlock()
    C1 = build_cylinder1(P)
    build_hand(P)
    C2 = build_cylinder2()
    K2 = {"right": build_key2("Dogru", CUTS_RIGHT, "#f2c14e", 1.0, 0.22, "#ffd23f", 0.15),
          "wrong": build_key2("Yanlis", CUTS_WRONG, "#6b7280", 0.9, 0.3, "#ff4d5e", 0.25)}
    fonts_ = [o for o in bpy.data.objects if o.type == "FONT"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in fonts_:
        o.select_set(True)
    bpy.context.view_layer.objects.active = fonts_[0]
    bpy.ops.object.convert(target="MESH")
    info = animate(P, C1, C2, K2)
    cams = camera_keys(scene)
    build_world_and_lights()
    if "--no-anchors" not in argv:
        export_anchors(scene, cams, P, C1, C2, K2, info)
    if "--anchors-only" in argv:
        return
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kilit.blend"))

    if "--camtest" in argv:
        cname = os.environ.get("CAM", "k1")
        fr = int(os.environ.get("F", "1"))
        for mk in list(scene.timeline_markers):
            scene.timeline_markers.remove(mk)
        cam = cams[cname]
        scene.camera = cam
        scene.frame_set(fr)
        rig, tgt = cam.parent, cam.parent.constraints[0].target
        for o in (rig, tgt):
            o.animation_data_clear()
        scene.render.resolution_percentage = 25
        scene.eevee.taa_render_samples = 8
        for i, v in enumerate(os.environ["V"].split(";")):
            vals = [float(a) for a in v.split(",")]
            tx, ty, tz, ss, el, az = vals[:6]
            if len(vals) > 6:
                cam.data.animation_data_clear()
                cam.data.lens = vals[6]
            half = math.atan(18 / cam.data.lens)
            e, a = math.radians(el), math.radians(az)
            d = ss / 2 / math.tan(half)
            t = Vector((tx, ty, tz))
            tgt.location = t
            rig.location = t + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * d
            scene.render.filepath = os.path.join(OUT, "ct", f"{cname}_v{i}.png")
            bpy.ops.render.render(write_still=True)
        return
    if "--preview" in argv:
        frames = [int(a) for a in argv[argv.index("--frames") + 1].split(",")] if "--frames" in argv else \
            [1, 40, 90, 150, 230, 270, 292, 330, 420, 540, 615, 690, 740, 770, 800, 830, 900, 960, 990]
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
