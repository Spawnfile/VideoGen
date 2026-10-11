"""Enigma bölümünün Sketchfab modeli (CC BY 4.0) ve içe alma yardımcıları.

- "Enigma Machine" — ASHISH / Ashish0096 (30b85c037a164174a109ad6f002b9c47) → ahşap kasa + kapak + klavye + lamba paneli
  + rotor kapağı + priz paneli (kablolarıyla). Modelde rotor/lamba/kablo içi yok → kahraman parçalar (rotorlar, reflektör,
  giriş tekerleği, lambalar) scene.py'de kodla. Dokularda amblem/logo yok (yalnız harfler ve seri plakası).
Model metre, +Z yukarı, ön (klavye/priz paneli) −X, kapak arkada (+X). Sahneye ×100 (1 birim = 1 cm) alınır.
"""
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, "asset_dl")
CREDITS = ['"Enigma Machine" by ASHISH (Ashish0096, Sketchfab), CC BY 4.0']
SCALE = 100.0
ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# parça numarası → katman (ident render'ı ile belirlendi)
GROUPS = {
    "Kasa": "002 003 007 019 023 024 025 026 027 028 035 036 037 038 039 040 041 042 043 044 056 066 068 069 070 071 "
            "077 078 079 080 081 082 083 084 085 000",
    "Priz": "054 060 086 076 020 008",
    "Tuslar": "012 013 014",
    "Taban": "004 006 067 075",
    # geri kalan her şey: lamba paneli + rotor kapağı plakası
}
LID = "035 036 037 038 039 040 041 042 043 044 056 077 078 003".split()

# ölçülen konumlar (cm, sahne)
KEY_ROWS = {  # (x, z_üst, ilk y, harfler soldan sağa operatör bakışıyla = +y'den −y'ye)
    "top": (-4.99, 13.1, [9.28 - 2.4725 * k for k in range(9)], "QWERTZUIO"),
    "mid": (-7.75, 12.7, [8.21 - 2.4725 * k for k in range(8)], "ASDFGHJK"),
    "bot": (-10.43, 12.2, [9.84 - 2.4725 * k for k in range(9)], "PYXCVBNML"),
}
LAMP_ROWS = {  # lamba pencereleri (x, z) — aynı düzen
    "top": (3.21, 12.25, [9.28 - 2.4725 * k for k in range(9)], "QWERTZUIO"),
    "mid": (0.86, 12.25, [8.23 - 2.4725 * k for k in range(8)], "ASDFGHJK"),
    "bot": (-1.48, 12.25, [9.83 - 2.4725 * k for k in range(9)], "PYXCVBNML"),
}
PLUG_Y = [10.74, 8.05, 5.37, 2.56, 0.1, -2.7, -5.4, -8.08, -10.77]   # priz soketi sütunları (üst sıra z 9,0)
ROTOR_X = 9.5          # rotor ekseni x (rotor kapağı yarıkları altında)
SLOT_Y = [4.2, 1.4, -1.6]  # sol / orta / sağ rotor (kapak yarıkları)


def letter_pos(table, ch):
    for row in table.values():
        x, z, ys, letters = row
        if ch in letters:
            return Vector((x, ys[letters.index(ch)], z))
    raise KeyError(ch)


def part_no(o):
    n = o.name.split("_")[0]
    return "000" if n == "part" else n.replace("part.", "")


def import_enigma():
    """GLB'yi al, kök matrisi mesh'e uygula (×100), boşları sil, malzemeleri düzelt → {grup: [obj]}."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(DL, "enigma.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    S = Matrix.Scale(SCALE, 4)
    lut = {p: g for g, s in GROUPS.items() for p in s.split()}
    groups = {g: [] for g in list(GROUPS) + ["Ust"]}
    for o in new:
        if o.type != "MESH":
            continue
        mw = o.matrix_world.copy()
        o.parent = None
        o.data = o.data.copy()
        o.data.transform(S @ mw)
        o.matrix_world = Matrix.Identity(4)
        pn = part_no(o)
        o.name = "M_" + pn
        groups[lut.get(pn, "Ust")].append(o)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        m.surface_render_method = "DITHERED"
        p = m.node_tree.nodes.get("Principled BSDF")
        if p and m.name != "glass":
            for l in list(p.inputs["Alpha"].links):
                m.node_tree.links.remove(l)
            p.inputs["Alpha"].default_value = 1.0
    return groups


def split_faces(obj, pred, name):
    """Obje kopyası + yüz silme (UV korunur): pred(yüz merkezi) doğru olan yüzler yeni objeye."""
    new = obj.copy()
    new.data = obj.data.copy()
    new.name = name
    bpy.context.scene.collection.objects.link(new)
    for o, keep in ((new, True), (obj, False)):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        kill = [f for f in bm.faces if bool(pred(f.calc_center_median())) != keep]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(o.data)
        bm.free()
    return new


def centroid(vs):
    vs = list(vs)
    return sum((Vector(v) for v in vs), Vector()) / max(1, len(vs))
