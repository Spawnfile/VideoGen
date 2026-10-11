"""Sketchfab "Playstation 5 Dualsense" (AHarmlessPotato, CC BY 4.0) modelini sahneye alır.

- Model Y-yukarı: Rz(180°)·Rx(90°) ile üst yüz +Z, tutamaklar −Y, yuvarlak tuşlar +X (sağ).
- Ölçek: 16 cm genişlik (1 birim = 1 cm). Üst yüz +Z, tutamaklar −Y, tetikler +Y.
- Marka temizliği: PS tuşundaki logo geometrisi silinir; dokudaki ✕○△□ sembolleri ve "SONY" yazısı çevre rengiyle boyanır.
- Sağ/sol tetik (L2/R2) gevşek parçaları ayrı objelere ayrılır (pivotta animasyon için).
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
GLB = os.path.join(HERE, "asset_dl", "dualsense.glb")
WIDTH = 16.0
CREDIT = '"Playstation 5 Dualsense" by AHarmlessPotato (Sketchfab), CC BY 4.0'

# doku temizliği: (görsel adı, [(x, y, yarıçap) PNG piksel, sol-üst orijin])
TEX_CLEAN = {
    "Image_4": [(610, 190, 34), (678, 393, 32), (706, 467, 30), (36, 590, 32)],   # ✕ ○ △ □
    "Image_7": [(468, 502, 70)],                                                   # SONY
}


def _clean_texture(im, spots):
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    for cx, cy, r in spots:
        y0, y1 = max(0, h - 1 - cy - r), min(h, h - cy + r)
        x0, x1 = max(0, cx - r), min(w, cx + r)
        reg = px[y0:y1, x0:x1, :3]
        q = np.round(reg * 64).reshape(-1, 3)
        vals, cnt = np.unique(q, axis=0, return_counts=True)
        mode = vals[cnt.argmax()] / 64
        diff = np.abs(reg - mode).max(axis=2) > 0.03
        # 2 px genişlet (kenar yumuşatması kalmasın)
        d = diff.copy()
        for sy, sx in ((1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2)):
            d |= np.roll(np.roll(diff, sy, 0), sx, 1)
        reg[d] = mode
        px[y0:y1, x0:x1, :3] = reg
    im.pixels.foreach_set(px.ravel())
    im.pack()


def _loose_parts(bm):
    seen, parts = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for k in e.link_faces:
                    if k.index not in seen:
                        seen.add(k.index)
                        stack.append(k)
        parts.append(comp)
    return parts


def _bbox(faces):
    vs = [v.co for f in faces for v in f.verts]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])


def _drop_faces(o, idx):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in idx], context="FACES")
    bm.to_mesh(o.data)
    bm.free()


def _keep_faces(o, idx):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in idx], context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    o.data.shade_smooth()


def import_dualsense(parent):
    """Kolu içe aktarır. Döner: {"shell": [objeler], "triggers": {sx: obje}, "materials": [malzemeler]}."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    # yansıma + ölçek: (x, y, z) → (x, z, y); dünya matrisini uygula
    allv = []
    for o in meshes:
        allv += [o.matrix_world @ v.co for v in o.data.vertices]
    width = max(v.x for v in allv) - min(v.x for v in allv)
    k = WIDTH / width
    rot = Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X")  # Y-yukarı → Z-yukarı, tutamak −Y
    for o in meshes:
        me = o.data
        me.transform(Matrix.Scale(k, 4) @ rot @ o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    # merkeze al (x, y), alt yüz z'yi koru
    allv = [v.co for o in meshes for v in o.data.vertices]
    cx = (max(v.x for v in allv) + min(v.x for v in allv)) / 2
    cy = (max(v.y for v in allv) + min(v.y for v in allv)) / 2
    for o in meshes:
        o.data.transform(Matrix.Translation((-cx, -cy, 0)))

    triggers = {}
    for o in list(meshes):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.faces.ensure_lookup_table()
        kill, trig = [], {1: [], -1: []}
        for comp in _loose_parts(bm):
            lo, hi = _bbox(comp)
            c = (lo + hi) / 2
            size = hi - lo
            # PS logosu: tuşun üstünde, merkezde, diskten dar parçalar (hoparlör delikleri c.y≈1'de, korunur)
            if abs(c.x) < 0.5 and abs(c.y) < 0.7 and size.x < 0.95 and size.y < 0.95 and c.z > 1.6:
                kill += [f.index for f in comp]
                print("logo parçası silindi", o.name, len(comp), [round(a, 2) for a in c], [round(a, 2) for a in size])
            elif abs(c.x) < 1.0 and abs(c.y) < 1.5 and c.z > 1.5:
                print("  merkez parça (korundu)", o.name, len(comp), [round(a, 2) for a in c], [round(a, 2) for a in size])
            # tetikler: arka (+y), omuz altında, alçakta, uzun
            elif abs(c.x) > 3.5 and c.y > 3.0 and c.z < 0.0 and size.z > 1.0:
                trig[1 if c.x > 0 else -1] += [f.index for f in comp]
        bm.free()
        for sx, idx in trig.items():
            if not idx:
                continue
            cp = o.copy()
            cp.data = o.data.copy()
            cp.name = f"TetikModel_{sx}"
            bpy.context.scene.collection.objects.link(cp)
            _keep_faces(cp, set(idx))
            triggers[sx] = cp
            kill += idx
        _drop_faces(o, set(kill))
        o.data.shade_smooth()
        o.parent = parent
    for name, spots in TEX_CLEAN.items():
        if name in bpy.data.images:
            _clean_texture(bpy.data.images[name], spots)
    mats = []
    for o in meshes:
        for m in o.data.materials:
            if m and m not in mats:
                mats.append(m)
    for m in mats:  # dokunun alfası BLENDED sıralama hatası yapıyor → opak
        p = m.node_tree.nodes.get("Principled BSDF")
        if p:
            for l in list(p.inputs["Alpha"].links):
                m.node_tree.links.remove(l)
            p.inputs["Alpha"].default_value = 1.0
        m.surface_render_method = "DITHERED"
        m.use_backface_culling = False
    return {"shell": meshes, "triggers": triggers, "materials": mats}


def ray_z(objs, x, y, z0=20.0):
    """(x, y)'de yukarıdan/aşağıdan ilk yüzey z'leri (üst, alt). Yoksa None."""
    dg = bpy.context.evaluated_depsgraph_get()
    top = bot = None
    for o in objs:
        inv = o.matrix_world.inverted()
        for start, d in (((x, y, z0), (0, 0, -1)), ((x, y, -z0), (0, 0, 1))):
            ok, loc, _, _ = o.ray_cast(inv @ Vector(start), inv.to_3x3() @ Vector(d))
            if ok:
                z = (o.matrix_world @ loc).z
                if d[2] < 0:
                    top = z if top is None else max(top, z)
                else:
                    bot = z if bot is None else min(bot, z)
    return top, bot
