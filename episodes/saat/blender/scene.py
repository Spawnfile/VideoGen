"""Saat — İsviçre mi Japon mu? (bölüm 5): ortak kasa + iki kahraman mekanizma, bölünmüş ekran.

Çalıştırma:
    blender-gpu -b --factory-startup -P scene.py                              # .blend + anchors.json
    blender-gpu -b --factory-startup -P scene.py -- --preview [--frames 1,200] # ön izleme (%50; panel kareleri ayrı)
    blender-gpu -b --factory-startup -P scene.py -- --draft                    # tüm geçişler %25 (full/top/bot)
    blender-gpu -b --factory-startup -P scene.py -- --anchors-only
    blender-gpu -b --factory-startup -P scene.py -- --camtest   (CAM=full|top|bot F=kare V="tx,ty,tz,S,elev,azim;...")
Tam render (üç geçiş, .blend'den):
    blender-gpu -b blender/out/saat.blend -P blender/render_pass.py -- full|top|bot [--draft]

Üç ayrı "dünya" aynı sahnede, birbirinden 100 birim uzakta; her kamera yalnız kendi dünyasını görür:
  Saat (0,0,0)       → KameraTam  1080×1920  (kanca, kadrana uçuş, geri uçuş)
  İsviçre (100,0,0)  → KameraUst  1080×960   (üst panel)
  Japon (200,0,0)    → KameraAlt  1080×960   (alt panel; twist'te İsviçre kopyasına (300,0,0) geçer)
Kare numaraları Blender karesidir (Remotion karesi = Blender − 1).
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
import watch_assets as WA  # noqa: E402

OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

FPS = 30
FRAMES = 990  # 33 sn
W, H = 1080, 1920
PW, PH = 1080, 960  # panel
FONT_DISPLAY = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"
FONT_MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf"


def B(r):  # Remotion karesi → Blender karesi
    return r + 1


# ---------------------------------------------------------------- zaman çizelgesi (Remotion karesi; tek yer)
T = dict(
    DIVE=(64, 104),       # kamera kadrana dalar
    SPLIT=(100, 118),     # paneller kayar
    R1=(120, 380),        # raunt 1: kalp (İsviçre eşapmanı)
    SLOW_END=290,         # yavaş çekim biter
    REAL=315,             # gerçek hız (4 Hz)
    R2=(380, 630),        # raunt 2: motor (Magic Lever)
    SCORE=(630, 750),     # skor tabelası
    SWAP=790,             # alt panel İsviçre kopyasına geçer (twist)
    MERGE=(890, 912),     # paneller kapanır
    OUT=(892, 950),       # geri uçuş
    END=989,
)
PANEL_RANGE = (96, 912)   # panel geçişlerinin render aralığı (Remotion)
FULL_RANGES = ((0, 112), (884, 989))
SLOW_RATE = 1 / 28        # yavaş çekim: 28 karede 1 tik
TOP_HZ, BOT_HZ = 4.0, 3.0  # 28.800 / 21.600 titreşim/saat → saniyede 8 / 6 tik

WORLD = {"saat": Vector((0, 0, 0)), "isvicre": Vector((100, 0, 0)), "japon": Vector((200, 0, 0)),
         "isvicre2": Vector((300, 0, 0))}


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


def material(name, color, metallic=0.0, rough=0.4, coat=0.0, emission=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = rough
    p.inputs["Coat Weight"].default_value = coat
    if emission:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = strength
    return m


def recolor(m, color=None, metallic=None, rough=None, emission=None, strength=None):
    p = m.node_tree.nodes["Principled BSDF"]
    if color is not None:
        for l in list(p.inputs["Base Color"].links):
            m.node_tree.links.remove(l)
        p.inputs["Base Color"].default_value = (*color, 1)
    if metallic is not None:
        for l in list(p.inputs["Metallic"].links):
            m.node_tree.links.remove(l)
        p.inputs["Metallic"].default_value = metallic
    if rough is not None:
        for l in list(p.inputs["Roughness"].links):
            m.node_tree.links.remove(l)
        p.inputs["Roughness"].default_value = rough
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


def world_bbox(objs):
    vs = [o.matrix_world @ v.co for o in objs if o.type == "MESH" for v in o.data.vertices]
    lo = Vector([min(v[i] for v in vs) for i in range(3)])
    hi = Vector([max(v[i] for v in vs) for i in range(3)])
    return lo, hi


def center_root(root, objs, anchor):
    """Kökü, modelin bbox merkezi `anchor`'a gelecek şekilde ötele."""
    bpy.context.view_layer.update()
    lo, hi = world_bbox(objs)
    root.location += anchor - (lo + hi) / 2
    bpy.context.view_layer.update()
    return world_bbox(objs)


# ---------------------------------------------------------------- dünyalar

def build_watch():
    """Ortak kasa: FC-0050 modeli (kadran −Y'ye bakar, saat 12 +Z). Marka yazısı dokudan silinir, yerine kanal baskısı."""
    root = empty("Saat")
    objs, _ = WA.import_glb("fc0050.glb", root, scale=100.0)
    WA.fix_materials(objs)
    WA.clean_watch_textures()
    lo, hi = center_root(root, objs, WORLD["saat"])
    meshes = [o for o in objs if o.type == "MESH"]
    glass = [o for o in meshes if any(m and "glass" in m.name.lower() for m in o.data.materials)]
    body = [o for o in meshes if o not in glass]
    glo, ghi = world_bbox(glass)
    gc = (glo + ghi) / 2
    # kadran yüzeyi: camın merkezinden +Y yönünde ışın (cam hariç) → ilk çarpma = ibre göbeği / kadran
    hit = WA.ray_hit(body, (gc.x + 0.6, glo.y - 5, gc.z - 0.6), (0, 1, 0))
    dial_y = hit[1].y if hit else gc.y
    R = (ghi.x - glo.x) / 2
    print("SAAT bbox", [round(a, 2) for a in lo], [round(a, 2) for a in hi], "cam merkez", [round(a, 3) for a in gc],
          "kadran y", round(dial_y, 3), "R", round(R, 3))
    D = {"root": root, "objs": objs, "center": Vector((gc.x, dial_y, gc.z)), "R": R, "glass_front": glo.y,
         "glass": glass}
    # kanal baskısı (kadran yüzeyinden hafif önde, ibrelerin altında)
    ink = material("KadranBaski", hex_rgb("#e9eef7"), rough=0.35, emission=hex_rgb("#ffffff"), strength=0.25)
    ink_y = material("KadranBaskiSari", hex_rgb("#ffd23f"), rough=0.35, emission=hex_rgb("#ffd23f"), strength=0.6)
    D["ink"] = ink
    h2 = WA.ray_hit(body, (gc.x + 0.32 * R, glo.y - 5, gc.z - 0.05 * R), (0, 1, 0))
    D["dial_y"] = h2[1].y if h2 else dial_y
    print("kadran (boş bölge) y", round(D["dial_y"], 3))
    rot = (math.radians(90), 0, 0)  # yazı +Z normalinden −Y'ye
    cy = dial_y - 0.004
    text("Baski_WhatsInside", "WHAT'S INSIDE", R * 0.13, ink, None, (gc.x, cy, gc.z + R * 0.36), rot)
    text("Baski_Kanal", "@whatsinit.lab", R * 0.075, ink_y, None, (gc.x, cy, gc.z + R * 0.22), rot, font=FONT_MONO)
    # saniye ibresi: merkezde, ibrelerin önünde; saniyede 8 adım (gerçek mekanik "süpürme")
    piv = empty("SaniyePivot", None, loc=(gc.x, dial_y - 0.06, gc.z))
    piv.rotation_mode = "XYZ"
    hand_m = material("SaniyeIbre", hex_rgb("#ffd23f"), metallic=0.6, rough=0.25, emission=hex_rgb("#ffd23f"),
                      strength=0.8)
    bm = bmesh.new()
    L = R * 0.86
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0, L / 2 - R * 0.12)) @ Matrix.Diagonal((0.025, 0.01, L + R * 0.24, 1)))
    g = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.07, radius2=0.07, depth=0.02)
    bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.pi / 2, 4, "X"), verts=g["verts"])
    g = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.05, radius2=0.05, depth=0.02)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0, -R * 0.12)) @ Matrix.Rotation(math.pi / 2, 4, "X"), verts=g["verts"])
    mesh_obj("SaniyeIbresi", bm, hand_m, piv)
    D["sec"] = piv
    return D


def tint_swiss(objs, tag):
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if not m:
                continue
            n = m.name.lower()
            if "escape_wheel" in n:
                recolor(m, hex_rgb("#c9ced8"), metallic=1.0, rough=0.22)
            elif n.startswith("escapement"):
                recolor(m, hex_rgb("#3d6fd8"), metallic=0.85, rough=0.25)   # mavi çelik çatal
            elif "ruby" in n:
                m.surface_render_method = "DITHERED"
                recolor(m, hex_rgb("#e0243f"), metallic=0.0, rough=0.08, emission=hex_rgb("#ff2d55"), strength=0.4)
            elif "hairspring" in n:
                recolor(m, hex_rgb("#e9edf3"), metallic=1.0, rough=0.15, emission=hex_rgb("#ffffff"), strength=0.15)
            elif "fixture" in n or n == "material" or n.startswith("material"):
                recolor(m, hex_rgb("#8a919c"), metallic=1.0, rough=0.3)


def build_swiss(name, anchor):
    root = empty(f"Kok_{name}")
    objs, acts = WA.import_glb("swiss.glb", root, scale=1.0)
    for o in objs:
        o.name = f"{name}:{o.name}"
    WA.fix_materials(objs)
    tint_swiss(objs, name)
    lo, hi = center_root(root, objs, anchor)
    print(name, "bbox", [round(a, 2) for a in lo], [round(a, 2) for a in hi], "acts", [a.name for a in acts],
          WA.action_range(acts))
    return {"root": root, "objs": objs, "acts": acts, "range": WA.action_range(acts)}


def build_seiko(anchor):
    root = empty("Kok_japon")
    objs, acts = WA.import_glb("seiko.glb", root, scale=10.0, rot=(math.pi, 0, 0))
    for o in objs:
        o.name = f"japon:{o.name}"
    mats = WA.fix_materials(objs)
    for m in mats:
        n = m.name.lower()
        if "magic_lever" in n:
            recolor(m, hex_rgb("#ff9f3d"), metallic=0.6, rough=0.25, emission=hex_rgb("#ff9f3d"), strength=0.0)
        elif "ratchet" in n:
            recolor(m, hex_rgb("#3d6fd8"), metallic=0.85, rough=0.25, emission=hex_rgb("#4d9bff"), strength=0.0)
        elif "rotor_mass" in n:
            recolor(m, hex_rgb("#c9ced8"), metallic=1.0, rough=0.2)
        elif "rotor_center" in n:  # rotorun saydam orta plakası (modelde de yarı saydam): dişliler görünsün
            recolor(m, hex_rgb("#bfe8ff"), metallic=0.0, rough=0.05)
            p = m.node_tree.nodes["Principled BSDF"]
            for l in list(p.inputs["Alpha"].links):
                m.node_tree.links.remove(l)
            p.inputs["Alpha"].default_value = 0.16
            m.surface_render_method = "BLENDED"
            m.use_backface_culling = True
        elif n == "gear" or n.startswith("gear"):
            recolor(m, hex_rgb("#d8a64a"), metallic=1.0, rough=0.25)
        elif "excentric" in n:
            recolor(m, hex_rgb("#e0243f"), metallic=0.3, rough=0.2)
        elif "ball" in n or "bearing" in n or "cage" in n:
            recolor(m, hex_rgb("#dfe3ea"), metallic=1.0, rough=0.2)
    lo, hi = center_root(root, objs, anchor)
    print("japon bbox", [round(a, 2) for a in lo], [round(a, 2) for a in hi], WA.action_range(acts))
    return {"root": root, "objs": objs, "acts": acts, "range": WA.action_range(acts), "mats": mats}


# ---------------------------------------------------------------- zaman eğrileri

def integrate(rate_fn, r0=0, r1=FRAMES):
    """Remotion karesi başına hız → kümülatif değer dizisi (indeks = Remotion karesi)."""
    acc, out = 0.0, []
    for r in range(r0, r1 + 1):
        out.append(acc)
        acc += rate_fn(r)
    return out


def swiss_rate(r):
    """Üst panel (İsviçre): tik/kare. Yavaş çekim → speed-ramp → gerçek 4 Hz (8 tik/sn)."""
    real = 2 * TOP_HZ / FPS
    if r < T["SLOW_END"]:
        return SLOW_RATE
    if r < T["REAL"]:
        u = (r - T["SLOW_END"]) / (T["REAL"] - T["SLOW_END"])
        u = u * u * (3 - 2 * u)
        return SLOW_RATE + (real - SLOW_RATE) * u
    return real


def swiss2_rate(r):
    return 2 * BOT_HZ / FPS  # 6 tik/sn


def seiko_rate(r):
    """Japon rotoru: döngü/kare. Raunt 2'de bir tam kaynak döngüsü (rotor 4 kez sallanır) ~245 karede."""
    if T["R2"][0] - 10 <= r < T["R2"][1]:
        return 0.93 / (T["R2"][1] - T["R2"][0])
    return 0.0012


def tick_phases(S, esc_name, ticks_per_cycle=8):
    """Eşapman çarkının açısal hız tepeleri = tik anları (döngü içi faz, 0..1)."""
    qs = S["objs"][esc_name]["q"]
    ang = [abs(qs[i + 1].rotation_difference(qs[i]).angle) for i in range(len(qs) - 1)]
    n = len(ang)
    peaks = []
    win = n // (ticks_per_cycle * 2)
    for i in range(n):
        lo, hi = max(0, i - win), min(n, i + win + 1)
        if ang[i] > 1e-4 and ang[i] == max(ang[lo:hi]):
            peaks.append(i / n)
    # aynı tepenin komşu örneklerini birleştir
    out = []
    for p in peaks:
        if not out or p - out[-1] > 0.5 / ticks_per_cycle:
            out.append(p)
    return out


def tick_frames(cum_ticks, phases, ticks_per_cycle, r0, r1):
    """cum_ticks: Remotion karesi başına kümülatif tik (döngü = ticks_per_cycle). Döner: tik karesi listesi."""
    res = []
    for r in range(max(r0, 1), min(r1, len(cum_ticks) - 1) + 1):
        a, b = cum_ticks[r - 1] / ticks_per_cycle, cum_ticks[r] / ticks_per_cycle
        for k in range(math.floor(a), math.floor(b) + 1):
            for p in phases:
                t = k + p
                if a < t <= b:
                    res.append(round(r - 1 + (t - a) / (b - a), 2))
    return res


# ---------------------------------------------------------------- animasyon

def animate(Wt, Sw, Sw2, Js):
    scene = bpy.context.scene
    frames = list(range(1, FRAMES + 1))
    info = {}

    # İsviçre (üst): kaynak döngü = 8 tik
    S = WA.sample_anim(Sw["objs"], *Sw["range"])
    esc = [o.name for o in WA.animated(Sw["objs"]) if "escape wheel" in o.name][0]
    phases = tick_phases(S, esc)
    print("İsviçre tik fazları", [round(p, 3) for p in phases])
    tpc = len(phases)
    cum = integrate(swiss_rate)
    WA.retime(Sw["objs"], S, lambda f: cum[f - 1] / tpc, frames)
    info["ticksTop"] = tick_frames(cum, phases, tpc, *PANEL_RANGE)
    info["rateTop"] = [round(swiss_rate(r) * FPS, 2) for r in range(FRAMES)]

    # İsviçre kopyası (alt, twist): 6 tik/sn
    S2 = WA.sample_anim(Sw2["objs"], *Sw2["range"])
    cum2 = integrate(swiss2_rate)
    WA.retime(Sw2["objs"], S2, lambda f: cum2[f - 1] / tpc, frames)
    info["ticksBot"] = tick_frames(cum2, phases, tpc, T["SWAP"], PANEL_RANGE[1])

    # Japon (alt): rotor sallanır, cırcır biriktirir
    SJ = WA.sample_anim(Js["objs"], *Js["range"])
    cumj = integrate(seiko_rate)
    WA.retime(Js["objs"], SJ, lambda f: cumj[f - 1] + 0.04, frames)
    # rotor yönü (Remotion'da ok): rotor kütlesinin açısal hızı işareti
    rot_name = [o.name for o in WA.animated(Js["objs"]) if o.name.endswith("rotor_mass")][0]
    rat_name = [o.name for o in WA.animated(Js["objs"]) if o.name.endswith(":ratchet")][0]
    rot_o, rat_o = bpy.data.objects[rot_name], bpy.data.objects[rat_name]
    info["rotorDir"], info["ratchetDir"] = [], []
    prev_r = prev_c = None
    for f in frames:
        scene.frame_set(f)
        qr, qc = rot_o.matrix_basis.to_quaternion(), rat_o.matrix_basis.to_quaternion()
        dr = dc = 0.0
        if prev_r is not None:
            d = (prev_r.inverted() @ qr)
            dr = d.to_axis_angle()[1] * (1 if d.to_axis_angle()[0].y >= 0 else -1)
            d = (prev_c.inverted() @ qc)
            dc = d.to_axis_angle()[1] * (1 if d.to_axis_angle()[0].y >= 0 else -1)
        info["rotorDir"].append(round(math.degrees(dr), 2))
        info["ratchetDir"].append(round(math.degrees(dc), 3))
        prev_r, prev_c = qr, qc

    # Japon parçaları sırası gelince parlar
    for m in Js["mats"]:
        n = m.name.lower()
        if "magic_lever" in n:
            key_input(m, "Emission Strength", [(1, 0.0), (B(430), 0.0), (B(438), 4.0), (B(470), 1.2), (B(630), 0.35), (B(640), 0.0)])
        elif "ratchet" in n:
            key_input(m, "Emission Strength", [(1, 0.0), (B(480), 0.0), (B(488), 1.4), (B(520), 0.3), (B(630), 0.3), (B(640), 0.0)])

    # saniye ibresi: saniyede 8 adım (6°/sn, adım 0,75°); gizliyken başa sarılır → son kare = ilk kare
    sec = Wt["sec"]
    interp("CONSTANT")
    a0 = math.radians(-40)
    step = math.radians(0.75)
    per = FPS / 8  # 3,75 kare/adım
    for f in range(1, B(FULL_RANGES[0][1]) + 1):
        n = math.floor((f - 1) / per)
        key(sec, f, rot=(0, a0 + n * step, 0))
    back = (FRAMES - B(FULL_RANGES[1][0]))
    for f in range(B(FULL_RANGES[1][0]), FRAMES + 1):
        n = math.floor((f - FRAMES) / per)
        key(sec, f, rot=(0, a0 + n * step, 0))
    interp("BEZIER")
    for g in Wt["glass"]:
        interp("CONSTANT")
        for f, h in ((1, False), (B(T["DIVE"][0] + 16), True), (B(T["OUT"][1] - 12), False)):
            g.hide_render = h
            g.keyframe_insert("hide_render", frame=f)
        interp("BEZIER")
    # baskı CTA'da parlar
    key_input(Wt["ink"], "Emission Strength", [(1, 0.25), (B(912), 0.25), (B(925), 2.2), (B(960), 0.25), (FRAMES, 0.25)])
    return info


# ---------------------------------------------------------------- kameralar

def make_cam(name, lens, res):
    target = empty(f"{name}Hedef")
    rig = empty(f"{name}Rig")
    c = rig.constraints.new("TRACK_TO")
    c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    cd = bpy.data.cameras.new(name)
    cd.lens, cd.clip_start, cd.clip_end = lens, 0.005, 80
    cam = link(bpy.data.objects.new(name, cd), rig)
    cam["res"] = res
    portrait = res[1] > res[0]

    def shot(frame, t, size, elev=30, azim=0, roll=0.0, shift_y=None):
        """size: portrede görünen yükseklik, panelde (yatay sığdırma) görünen genişlik."""
        half = math.atan(18 / cd.lens)
        e, a = math.radians(elev), math.radians(azim)
        direction = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        d = size / 2 / math.tan(half)
        key(target, frame, loc=Vector(t))
        key(rig, frame, loc=Vector(t) + direction * d)
        key(cam, frame, rot=(0, 0, math.radians(roll)))
        if shift_y is not None:
            cd.shift_y = shift_y
            cd.keyframe_insert("shift_y", frame=frame)

    return cam, shot, portrait


def camera_keys(scene, Wt, Sw, Sw2, Js):
    interp("BEZIER")
    cams = {}
    # --- tam ekran: kanca → kadrana dalış → (gizli) → geri uçuş → kanca
    cam, shot, _ = make_cam("KameraTam", 50, (W, H))
    c = Wt["center"]
    hk = dict(t=(c.x + 0.1, c.y, c.z + 0.95), size=8.6, elev=12, azim=16, roll=-4)
    shot(1, **hk)
    shot(B(T["DIVE"][0]), hk["t"], hk["size"] * 0.9, hk["elev"], hk["azim"], hk["roll"])
    # dalış: hedef kadran merkezi, kamera merkeze doğru (cam ve ibrelerin arasından)
    R = Wt["R"]
    dv = Vector((c.x + 0.32 * R, Wt["dial_y"] + 0.01, c.z - 0.05 * R))  # merkez ile III arası koyu kadran
    shot(B(T["DIVE"][0] + 22), dv, 2.2, 6, 6, 0)
    shot(B(T["DIVE"][1] + 6), dv, 0.1, 2, 2, 0)
    interp("CONSTANT")
    shot(B(T["DIVE"][1] + 7), dv, 0.1, 2, 2, 0)
    interp("BEZIER")
    shot(B(FULL_RANGES[1][0]), dv, 0.12, 2, -4, 0)
    shot(B(T["OUT"][0] + 26), (c.x + 0.3, c.y, c.z - 0.1), 3.4, 8, 10, -2)
    shot(B(T["OUT"][1]), hk["t"], hk["size"] * 0.95, hk["elev"], hk["azim"], hk["roll"])
    shot(FRAMES, **hk)
    cams["full"] = cam

    # --- üst panel: İsviçre eşapmanı (yatay sığdırma: size = görünen genişlik)
    cam, shot, _ = make_cam("KameraUst", 50, (PW, PH))
    o = WORLD["isvicre"]
    sy = 0.11
    whole = o + Vector((2.4, 0.4, 0))      # mekanizma sola kayar → sağda etiket alanı
    fork = o + Vector((1.9, 0.9, 0))
    shot(1, whole, 28, 62, 18, 0, shift_y=sy)
    shot(B(T["R1"][0]), whole, 27.5, 58, 14, 0, shift_y=sy)
    shot(B(T["R1"][0] + 90), fork, 25.5, 55, 4, 0, shift_y=sy)
    shot(B(T["SLOW_END"]), fork, 25, 53, -4, 0, shift_y=sy)
    shot(B(T["R1"][1]), whole, 27, 56, -10, 0, shift_y=sy)
    shot(B(T["SCORE"][1]), whole, 27.5, 58, 6, 0, shift_y=sy)
    shot(B(PANEL_RANGE[1]), whole, 27, 56, 16, 0, shift_y=sy)
    cams["top"] = cam

    # --- alt panel: Japon (Magic Lever) → twist'te İsviçre kopyası
    cam, shot, _ = make_cam("KameraAlt", 50, (PW, PH))
    j = WORLD["japon"]
    sy = -0.17
    gears = j + Vector((0.0, -2.2, 0))
    shot(1, j + Vector((0, -1.0, 0)), 18, 60, -10, 0, shift_y=sy)
    shot(B(T["R2"][0]), j + Vector((0, -1.0, 0)), 17, 58, -6, 0, shift_y=sy)
    shot(B(T["R2"][0] + 60), gears, 12.5, 55, 4, 0, shift_y=sy)
    shot(B(T["R2"][1] - 20), gears, 11.5, 52, 14, 0, shift_y=sy)
    shot(B(T["SWAP"] - 1), j + Vector((0, -1.0, 0)), 17, 56, 16, 0, shift_y=sy)
    o2 = WORLD["isvicre2"] + Vector((-0.4, 0.5, 0))
    interp("CONSTANT")
    shot(B(T["SWAP"]), o2, 23, 58, -14, 0, shift_y=sy)
    interp("BEZIER")
    shot(B(PANEL_RANGE[1]), o2, 22, 55, -24, 0, shift_y=sy)
    cams["bot"] = cam
    scene.camera = cams["full"]
    return cams


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
    sun("On", (95, 0, 0), 1.6, (1.0, 0.98, 0.95), angle=15)  # kadranı önden aydınlatır


# ---------------------------------------------------------------- çapalar

def anchor_points(Wt, Sw, Sw2, Js):
    """(kamera, ebeveyn obje adı, dünya noktası kare 1'de). Yerel noktaya çevrilir, ebeveynle hareket eder."""
    bpy.context.scene.frame_set(1)

    def mesh(prefix, key_):
        return [o for o in bpy.data.objects if o.name.startswith(prefix) and key_ in o.name and o.type == "MESH"][0]

    def ctr(o, off=(0, 0, 0)):
        lo, hi = world_bbox([o])
        return (lo + hi) / 2 + Vector(off)

    def top_(o, off=(0, 0, 0)):
        lo, hi = world_bbox([o])
        c = (lo + hi) / 2
        return Vector((c.x, c.y, hi.z)) + Vector(off)

    sp = {}
    c = Wt["center"]
    sp["dial"] = ("full", "Saat", c)
    sp["secTip"] = ("full", "SaniyeIbresi", c + Vector((0, -0.06, Wt["R"] * 0.7)))
    for tag, cam in (("isvicre", "top"), ("isvicre2", "bot")):
        bw = mesh(tag + ":", "Balance Wheel_0")
        hs = mesh(tag + ":", "Hsp0_0")
        esc = mesh(tag + ":", "escape wheel_0")
        fork = mesh(tag + ":", "escapement_0")
        pin = mesh(tag + ":", "Impulse Pin_0")
        pal = mesh(tag + ":", "Pallets_0")
        lo, hi = world_bbox([bw])
        bc = (lo + hi) / 2
        k = "" if tag == "isvicre" else "2"
        sp["balance" + k] = (cam, f"Kok_{tag}", Vector((hi.x - (hi.x - lo.x) * 0.03, bc.y - (hi.y - lo.y) * 0.1, hi.z)))
        hlo, hhi = world_bbox([hs])
        sp["balanceT" + k] = (cam, f"Kok_{tag}", Vector((bc.x, hi.y - (hi.y - lo.y) * 0.03, hi.z)))
        sp["balanceL" + k] = (cam, f"Kok_{tag}", Vector((lo.x + (hi.x - lo.x) * 0.06, bc.y - (hi.y - lo.y) * 0.2, hi.z)))
        sp["spring" + k] = (cam, hs.name, Vector(((hlo.x + hhi.x) / 2 - (hhi.x - hlo.x) * 0.28, (hlo.y + hhi.y) / 2, hhi.z)))
        sp["escwheel" + k] = (cam, esc.parent.name, top_(esc))
        sp["fork" + k] = (cam, fork.parent.name, ctr(fork))
        sp["pin" + k] = (cam, pin.parent.name, ctr(pin))
        sp["pallet" + k] = (cam, pal.parent.name, ctr(pal))
    rm = [o for o in bpy.data.objects if o.name.endswith("rotor_mass_0")][0]
    ml = [o for o in bpy.data.objects if o.name.endswith("magic_lever_01_normal_0")][0]
    ra = [o for o in bpy.data.objects if o.name.endswith("ratchet_0")][0]
    ex = [o for o in bpy.data.objects if o.name.endswith("excentric_0")][0]
    rc = [o for o in bpy.data.objects if o.name.endswith("rotor_center_0")][0]
    rg = [o for o in bpy.data.objects if o.name.endswith("rotor_gear_0")][0]
    sp["rotor"] = ("bot", rm.name, ctr(rm))
    sp["rotorHub"] = ("bot", "Kok_japon", ctr(rg))
    sp["lever"] = ("bot", ml.name, ctr(ml))
    sp["ratchet"] = ("bot", "Kok_japon", ctr(ra))
    sp["excentric"] = ("bot", "Kok_japon", ctr(ex))
    return sp


def export_anchors(scene, cams, Wt, Sw, Sw2, Js, info):
    specs = anchor_points(Wt, Sw, Sw2, Js)
    E = {}
    for k, (cam, parent, wp) in specs.items():
        po = bpy.data.objects[parent]
        e = empty(f"Capa_{k}", po)
        e.location = po.matrix_world.inverted() @ wp
        E[k] = (cam, e)
    data = {"fps": FPS, "frames": FRAMES, "timeline": T, "anchors": {k: [] for k in E}}
    data.update(info)
    r = scene.render
    for f in range(1, FRAMES + 1):
        scene.frame_set(f)
        for k, (cname, e) in E.items():
            cam = cams[cname]
            r.resolution_x, r.resolution_y = cam["res"]
            co = world_to_camera_view(scene, cam, e.matrix_world.translation)
            rw, rh = cam["res"]
            data["anchors"][k].append([round(co.x * rw, 1), round((1 - co.y) * rh, 1)] if co.z > 0 else [-999, -999])
    r.resolution_x, r.resolution_y = W, H
    with open(os.path.join(OUT, "anchors.json"), "w") as fh:
        json.dump(data, fh)


# ---------------------------------------------------------------- render geçişleri

def set_pass(scene, cams, name):
    cam = cams[name]
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = cam["res"]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene = reset_scene()
    Wt = build_watch()
    Sw = build_swiss("isvicre", WORLD["isvicre"])
    Sw2 = build_swiss("isvicre2", WORLD["isvicre2"])
    Js = build_seiko(WORLD["japon"])
    fonts_ = [o for o in bpy.data.objects if o.type == "FONT"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in fonts_:
        o.select_set(True)
    bpy.context.view_layer.objects.active = fonts_[0]
    bpy.ops.object.convert(target="MESH")
    info = animate(Wt, Sw, Sw2, Js)
    cams = camera_keys(scene, Wt, Sw, Sw2, Js)
    build_world_and_lights()
    export_anchors(scene, cams, Wt, Sw, Sw2, Js, info)
    if "--anchors-only" in argv:
        return
    set_pass(scene, cams, "full")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "saat.blend"))

    if "--camtest" in argv:
        cname = os.environ.get("CAM", "full")
        fr = int(os.environ.get("F", "1"))
        scene.frame_set(fr)
        set_pass(scene, cams, cname)
        cam = cams[cname]
        rig, tgt = cam.parent, cam.parent.constraints[0].target
        for o in (rig, tgt):
            o.animation_data_clear()
        scene.render.resolution_percentage = 25
        scene.eevee.taa_render_samples = 8
        for i, v in enumerate(os.environ["V"].split(";")):
            tx, ty, tz, ss, el, az = [float(a) for a in v.split(",")]
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
            [1, 60, 90, 104, 150, 250, 330, 420, 520, 600, 700, 800, 860, 900, 940, 990]
        scene.render.resolution_percentage = 50
        scene.eevee.taa_render_samples = 16
        for f in frames:
            scene.frame_set(f)
            r = f - 1
            passes = []
            if any(a <= r <= b for a, b in FULL_RANGES):
                passes.append("full")
            if PANEL_RANGE[0] <= r <= PANEL_RANGE[1]:
                passes += ["top", "bot"]
            for p in passes:
                set_pass(scene, cams, p)
                scene.render.filepath = os.path.join(OUT, "preview", f"f{f:04d}_{p}.png")
                bpy.ops.render.render(write_still=True)


main()
