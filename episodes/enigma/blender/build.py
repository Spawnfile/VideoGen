"""Sahne yapısı: Sketchfab Enigma (katmanlara ayrılmış) + kodla iç parçalar (rotor grubu, lambalar, baskı)."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import enigma_assets as A
import rotors as R
from common import FONT, box_bm, cyl_bm, empty, link, mesh_obj

ROTOR_Z = 8.4                      # rotor ekseni yüksekliği (kapak yarıklarından çark görünür)
STACK = {"ETW": -4.4, "R2": -1.6, "R1": 1.4, "R0": 4.2, "UKW": 6.9}   # eksen boyunca (dünya +y)


def build_model(M):
    P = {}
    groups = A.import_enigma()
    root = empty("Enigma")
    lay = {}
    for g in ("Kasa", "Priz", "Taban", "Tuslar", "Lambalar", "Ust", "Rotorlar"):
        lay[g] = empty(f"Katman_{g}", root)
    for g, objs in groups.items():
        for o in objs:
            o.parent = lay[g]
    # kapak (arka, açık) kasa ile gider; baskı kapağın iç yüzünde
    # --- basılan tuşlar (A + ENIGMA) → ayrı obje + basış boşu
    rows = {"top": "M_013", "mid": "M_014", "bot": "M_012"}
    P["keys"] = {}
    for ch in "AENIGM":
        for rn, (kx, kz, ys, letters) in A.KEY_ROWS.items():
            if ch in letters:
                break
        ky = ys[letters.index(ch)]
        src = bpy.data.objects[rows[rn]]
        k = A.split_faces(src, lambda c, ky=ky, kx=kx: abs(c.y - ky) < 1.15 and abs(c.x - kx) < 1.4, f"Tus{ch}")
        piv = empty(f"Tus{ch}_Pivot", lay["Tuslar"], loc=(kx, ky, 0))
        k.parent = piv
        k.matrix_parent_inverse = Matrix.Translation((-kx, -ky, 0))
        P["keys"][ch] = piv
    # --- lamba paneli: 26 ampul + koyu levha (pencerelerin altında)
    bm = bmesh.new()
    box_bm(bm, 8.6, 25.0, 0.3, (0.85, 0.0, 10.4))
    mesh_obj("LambaLevha", bm, M["bakelite"], lay["Lambalar"])
    P["bulbs"] = {}
    for row in A.LAMP_ROWS.values():
        x, z, ys_, lets = row
        for ch, y in zip(lets, ys_):
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.62,
                                      matrix=Matrix.Translation((x, y, 11.35)))
            cyl_bm(bm, 0.4, 10.5, 11.0, seg=12, M=Matrix.Translation((x, y, 0)))
            m = M["bulb"].copy()                      # her lamba ayrı yanar
            m.name = f"Lamba_{ch}"
            P["bulbs"][ch] = mesh_obj(f"Lamba_{ch}", bm, m, lay["Lambalar"], smooth=True)
    # --- rotor grubu: eksen yerel Z (Rx −90° ile dünya +Y), dalışta dikleşir
    grp = empty("RotorGrup", lay["Rotorlar"], loc=(A.ROTOR_X, 0.0, ROTOR_Z))
    grp.rotation_euler = (-math.pi / 2, 0, 0)
    font = bpy.data.fonts.load(FONT)
    P["rot"] = {}
    for k, z in STACK.items():
        slot = empty(f"Yuva_{k}", grp, loc=(0, 0, z))
        P[f"slot_{k}"] = slot
        if k == "ETW":
            P["rot"][k] = R.build_etw("ETW", slot, M)
        elif k == "UKW":
            P["rot"][k] = R.build_reflector("UKW", slot, M)
        else:
            idx = int(k[1])
            P["rot"][k], _ = R.build_rotor(f"Rotor{idx}", R.ORDER[idx], slot, M, font)
    bm = bmesh.new()
    cyl_bm(bm, 0.28, -6.0, 8.2, seg=16)
    mesh_obj("Mil", bm, M["axle"], grp, smooth=True)
    P["grp"] = grp
    # --- kanal baskısı: kapağın iç yüzünde pirinç plaka
    build_print(M, lay["Kasa"], font)
    P["lay"] = lay
    P["root"] = root
    return P


def build_print(M, parent, font):
    x = 17.42                                   # kapak iç yüzü (−X'e bakar)
    pl = empty("Baski", parent, loc=(x, 0.0, 40.2))
    # yerel X → dünya −Y (−X'ten bakanın sağı), yerel Y → dünya Z, normal (yerel Z) → dünya −X
    pl.rotation_euler = Matrix(((0, 0, -1), (-1, 0, 0), (0, 1, 0))).to_euler()
    bm = bmesh.new()
    box_bm(bm, 13.0, 4.6, 0.12, (0, 0, -0.08))
    plate = mesh_obj("BaskiPlaka", bm, M["print"], pl)
    for o in (plate,):
        b = o.modifiers.new("bv", "BEVEL")
        b.width, b.segments = 0.15, 2
    lines = (("WHAT'S INSIDE", 1.35, 0.55), ("@whatsinit.lab", 0.85, -1.15))
    for body, size, y in lines:
        cu = bpy.data.curves.new(body, "FONT")
        cu.body, cu.size, cu.font = body, size, font
        cu.align_x, cu.align_y = "CENTER", "CENTER"
        cu.extrude = 0.02
        t = link(bpy.data.objects.new(f"Baski_{body}", cu), pl)
        t.location = (0, y, 0.03)
        t.data.materials.append(M["ink"])
        bpy.context.view_layer.objects.active = t
        bpy.ops.object.select_all(action="DESELECT")
        t.select_set(True)
        bpy.ops.object.convert(target="MESH")
