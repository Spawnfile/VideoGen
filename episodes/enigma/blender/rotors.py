"""Kahraman parçalar (kodla): üç rotor, reflektör (UKW-B), giriş tekerleği (ETW), lambalar + Enigma I simülatörü.

Rotor yerel çerçevesi: eksen yerel +Z (sahnede +Z → dünya +Y, yani operatörün soluna). Kontaklar r=RC yarıçapında,
i. kontak açısı θ_i = 2π·i/26. Sağ yüz (−Z, ETW tarafı) yaylı pimler, sol yüz (+Z) düz pullar; içte gerçek
Enigma I kablolaması (I, II, III). Gövde malzemesi ayrı (X-ray için alfa keyframe'lenir); her telin malzemesi
ayrı tutulmaz — sinyalin geçtiği tel için ayrı "SinyalTel" kopyası üretilir (vurgu).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
WIRING = {
    "I": "EKMFLGDQVZNTOWYHXUSPAIBRCJ",
    "II": "AJDKSIRUXBLHWTMCQGZNPYFVOE",
    "III": "BDFHJLCPRTXVZNYEIWGAKMUSQO",
}
NOTCH = {"I": "Q", "II": "E", "III": "V"}
UKW_B = "YRUHQSLDPXNGOKMIEBFZCWVJAT"
ORDER = ["I", "II", "III"]   # sol, orta, sağ

R_BODY = 3.3
RC = 2.3        # kontak yarıçapı
HALF = 0.75     # gövde yarı genişliği (z)


# ---------------------------------------------------------------- simülatör

def encipher(key, pos):
    """pos = [sol, orta, sağ] konumlar (0..25). Basıştan önce adım atılır (çift adım dahil).
    Dönüş: (çıkış harfi, yeni pos, yol) — yol: her rotorun girişte/çıkışta *yerel* kontak indisleri."""
    L, M, R = pos
    if M == ALPHA.index(NOTCH[ORDER[1]]):
        L, M = (L + 1) % 26, (M + 1) % 26
    elif R == ALPHA.index(NOTCH[ORDER[2]]):
        M = (M + 1) % 26
    R = (R + 1) % 26
    p = [L, M, R]
    c = ALPHA.index(key)
    path = {"etw_in": c}
    for i in (2, 1, 0):                       # sağ → sol
        w = WIRING[ORDER[i]]
        loc_in = (c + p[i]) % 26
        loc_out = ALPHA.index(w[loc_in])
        path[f"r{i}_fwd"] = (loc_in, loc_out)
        c = (loc_out - p[i]) % 26
    path["ukw_in"] = c
    c = ALPHA.index(UKW_B[c])
    path["ukw_out"] = c
    for i in (0, 1, 2):                       # sol → sağ
        w = WIRING[ORDER[i]]
        loc_in = (c + p[i]) % 26
        loc_out = w.index(ALPHA[loc_in])
        path[f"r{i}_back"] = (loc_in, loc_out)
        c = (loc_out - p[i]) % 26
    path["etw_out"] = c
    return ALPHA[c], p, path


# ---------------------------------------------------------------- geometri yardımcıları

def link(o, parent=None):
    bpy.context.scene.collection.objects.link(o)
    if parent:
        o.parent = parent
    return o


def mesh_from_bm(name, bm, mat, parent, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), parent)


def cyl(bm, r, z0, z1, seg=48, M=Matrix.Identity(4)):
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=z1 - z0,
                          matrix=M @ Matrix.Translation((0, 0, (z0 + z1) / 2)))


def ring(bm, r0, r1, z0, z1, seg=64, teeth=0, tooth=0.0):
    """Halka (r0 iç, r1 dış). teeth>0 → dış kenar tırtıllı (başparmak çarkı)."""
    n = seg if not teeth else teeth * 4
    outer, inner = [], []
    for z in (z0, z1):
        o_, i_ = [], []
        for k in range(n):
            a = 2 * math.pi * k / n
            rr = r1 if not teeth else (r1 if (k % 4) in (0, 1) else r1 - tooth)
            o_.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), z)))
            i_.append(bm.verts.new((r0 * math.cos(a), r0 * math.sin(a), z)))
        outer.append(o_)
        inner.append(i_)
    for k in range(n):
        k2 = (k + 1) % n
        bm.faces.new((outer[0][k], outer[0][k2], outer[1][k2], outer[1][k]))
        bm.faces.new((inner[0][k2], inner[0][k], inner[1][k], inner[1][k2]))
        bm.faces.new((outer[0][k2], outer[0][k], inner[0][k], inner[0][k2]))
        bm.faces.new((outer[1][k], outer[1][k2], inner[1][k2], inner[1][k]))


def ang(i):
    return 2 * math.pi * i / 26


def contact_pt(i, z, r=RC):
    return Vector((r * math.cos(ang(i)), r * math.sin(ang(i)), z))


def wire_curve(name, pts, mat, parent, bevel=0.045):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = bevel
    cu.bevel_resolution = 2
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (*q, 1)
    sp.use_endpoint_u = True
    sp.order_u = 3
    sp.resolution_u = 10
    cu.materials.append(mat)
    return link(bpy.data.objects.new(name, cu), parent)


def letters_on_ring(name, parent, mat, r, font):
    """Alfabe halkası: 26 harf silindir yüzeyinde (dışa bakar), mesh'e çevrilir."""
    objs = []
    for i, ch in enumerate(ALPHA):
        cu = bpy.data.curves.new(f"{name}_{ch}", "FONT")
        cu.body = ch
        cu.size = 0.42
        cu.align_x, cu.align_y = "CENTER", "CENTER"
        cu.extrude = 0.01
        if font:
            cu.font = font
        o = link(bpy.data.objects.new(f"{name}_{ch}", cu))
        a = ang(i)
        # yazı düzlemi XY → silindire teğet; harf yukarısı = eksen (+Z)
        o.matrix_world = (Matrix.Translation((r * math.cos(a), r * math.sin(a), 0))
                          @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "Y")
                          @ Matrix.Rotation(-math.pi / 2, 4, "Z"))
        o.data.materials.append(mat)
        objs.append(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name
    j.data.transform(j.matrix_world)          # harfler rotor yerel koordinatında
    j.matrix_world = Matrix.Identity(4)
    j.parent = parent
    j.matrix_parent_inverse = Matrix.Identity(4)
    j.matrix_basis = Matrix.Identity(4)
    return j


# ---------------------------------------------------------------- parçalar

def build_rotor(name, kind, parent, M, font):
    """Bir rotor: kök boş (dönen, yerel Z ekseni) altında gövde, alfabe halkası, çark, pimler, pullar, teller."""
    root = link(bpy.data.objects.new(name, None), parent)
    root.empty_display_size = 1
    bm = bmesh.new()
    cyl(bm, R_BODY, -HALF, HALF)
    body = mesh_from_bm(f"{name}_Govde", bm, M["bakeliteH"], root, smooth=False)
    bm = bmesh.new()
    ring(bm, R_BODY - 0.05, R_BODY + 0.32, -0.55, 0.45)
    tyre = mesh_from_bm(f"{name}_Halka", bm, M["tyre"], root)
    letters_on_ring(f"{name}_Harfler", root, M["ink"], R_BODY + 0.33, font)
    bm = bmesh.new()
    ring(bm, 2.9, 4.05, HALF - 0.05, HALF + 0.38, teeth=26 * 2, tooth=0.16)
    mesh_from_bm(f"{name}_Cark", bm, M["thumb"], root)
    bm = bmesh.new()
    cyl(bm, 0.55, -HALF - 0.2, HALF + 0.45, seg=24)
    mesh_from_bm(f"{name}_Gobek", bm, M["alu"], root, smooth=True)
    # çentik halkası (sağ tarafta, ince alüminyum)
    bm = bmesh.new()
    ring(bm, 2.75, 3.05, -HALF - 0.08, -HALF + 0.02)
    mesh_from_bm(f"{name}_Centik", bm, M["alu"], root)
    # pimler (sağ yüz) + pullar (sol yüz)
    bm = bmesh.new()
    for i in range(26):
        cyl(bm, 0.13, -HALF - 0.28, -HALF + 0.01, seg=10, M=Matrix.Translation(contact_pt(i, 0)))
    mesh_from_bm(f"{name}_Pimler", bm, M["brass"], root, smooth=True)
    bm = bmesh.new()
    for i in range(26):
        cyl(bm, 0.2, HALF - 0.01, HALF + 0.04, seg=12, M=Matrix.Translation(contact_pt(i, 0)))
    mesh_from_bm(f"{name}_Pullar", bm, M["brass"], root, smooth=True)
    # teller: sağ pim i → sol pul w(i)
    w = WIRING[kind]
    for i in range(26):
        j = ALPHA.index(w[i])
        a0, a1 = ang(i), ang(j)
        mid = (a0 + a1) / 2 if abs(a1 - a0) < math.pi else (a0 + a1) / 2 + math.pi
        rm = 1.05 + 0.03 * (i % 7)
        pts = [contact_pt(i, -HALF + 0.02), contact_pt(i, -HALF + 0.35, RC * 0.85),
               Vector((rm * math.cos(mid), rm * math.sin(mid), 0.0)),
               contact_pt(j, HALF - 0.35, RC * 0.85), contact_pt(j, HALF - 0.02)]
        wire_curve(f"{name}_Tel{i:02d}", pts, M["copper"], root)
    return root, body


def build_reflector(name, parent, M):
    root = link(bpy.data.objects.new(name, None), parent)
    bm = bmesh.new()
    ring(bm, R_BODY - 0.45, R_BODY + 0.1, -0.5, 0.5)     # açık halka: içteki U-teller görünsün
    ring(bm, 0.0001, 0.5, -0.5, 0.5, seg=24)              # göbek
    mesh_from_bm(f"{name}_Govde", bm, M["ukw"], root)
    bm = bmesh.new()
    for i in range(26):
        cyl(bm, 0.2, -0.56, -0.49, seg=12, M=Matrix.Translation(contact_pt(i, 0)))
    mesh_from_bm(f"{name}_Pullar", bm, M["brass"], root, smooth=True)
    for i in range(26):
        j = ALPHA.index(UKW_B[i])
        if j < i:
            continue
        a0, a1 = ang(i), ang(j)
        mid = (a0 + a1) / 2 if abs(a1 - a0) < math.pi else (a0 + a1) / 2 + math.pi
        pts = [contact_pt(i, -0.5), contact_pt(i, -0.1, RC * 0.8),
               Vector((0.9 * math.cos(mid), 0.9 * math.sin(mid), 0.15)), contact_pt(j, -0.1, RC * 0.8),
               contact_pt(j, -0.5)]
        wire_curve(f"{name}_Tel{i:02d}", pts, M["copper"], root)
    return root


def build_etw(name, parent, M):
    root = link(bpy.data.objects.new(name, None), parent)
    bm = bmesh.new()
    cyl(bm, R_BODY - 0.2, -0.45, 0.45)
    mesh_from_bm(f"{name}_Govde", bm, M["bakelite"], root)
    bm = bmesh.new()
    for i in range(26):
        cyl(bm, 0.2, 0.44, 0.5, seg=12, M=Matrix.Translation(contact_pt(i, 0)))
    mesh_from_bm(f"{name}_Pullar", bm, M["brass"], root, smooth=True)
    return root


def highlight_wire(root_name, idx, M, name):
    """Belirli bir telin parlak kopyası (sinyal yolu). Görünürlüğü scene.py keyframe'ler."""
    src = bpy.data.objects[f"{root_name}_Tel{idx:02d}"]
    o = src.copy()
    o.data = src.data.copy()
    o.data.bevel_depth = 0.07
    o.data.materials.clear()
    o.data.materials.append(M["signal"])
    o.name = name
    bpy.context.scene.collection.objects.link(o)
    o.parent = src.parent
    o.matrix_parent_inverse = src.matrix_parent_inverse.copy()
    return o
