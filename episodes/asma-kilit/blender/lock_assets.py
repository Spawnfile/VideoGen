"""Asma kilit bölümünün Sketchfab modelleri (hepsi CC BY 4.0) ve mesh yardımcıları.

- "Small Padlock and Key" — Miljan Bojovic (91827ac5…)       → dış asma kilit + anahtar (padlock_small.glb)
- "3December 2020 - Cylinder Lock" — Jack Kelly (d18aedad…)  → kahraman pimli silindir (cylinder.glb; maymuncuk aracı SİLİNİR)
- "First Person hands rigged" — David Fischer (547a4553…)    → POV el (hands_fp.glb)

saat/watch_assets.py kalıbı: import_glb (kök boşa bağla), fix_materials (alfa kopar → DITHERED), _paint (dokudaki
marka yazısını numpy ile bölgenin baskın rengine boya), ray_hit. Ek: split_faces (yüz yüklemiyle obje kopyası ayırma),
bisect_keep (kesit: düzlemin bir yanını sil + kesiti kapat).
"""
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, "asset_dl")
CREDITS = [
    '"Small Padlock and Key" by Miljan Bojovic (Sketchfab), CC BY 4.0',
    '"3December 2020 - Cylinder Lock" by Jack Kelly (Sketchfab), CC BY 4.0',
    '"First Person hands rigged" by David Fischer (Sketchfab), CC BY 4.0',
]


def import_glb(name, root, scale=1.0, rot=None):
    """GLB'yi içe al, en üst düğümü `root` boşuna bağla (dünya dönüşümü korunur), root'a ölçek/dönüş ver."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(DL, name))
    new = [o for o in bpy.data.objects if o not in before]
    for o in [o for o in new if o.parent is None]:
        mw = o.matrix_world.copy()
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()
        o.matrix_world = mw
    root.scale = (scale, scale, scale)
    if rot is not None:
        root.rotation_euler = rot
    bpy.context.view_layer.update()
    for o in new:
        if o.type in ("LIGHT", "CAMERA"):
            bpy.data.objects.remove(o)
    return [o for o in new if o.name in bpy.data.objects]


def fix_materials(objs, keep_blend=()):
    mats = []
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if m and m not in mats:
                mats.append(m)
    for m in mats:
        if any(k in m.name.lower() for k in keep_blend):
            continue
        p = m.node_tree.nodes.get("Principled BSDF")
        if p:
            for l in list(p.inputs["Alpha"].links):
                m.node_tree.links.remove(l)
            p.inputs["Alpha"].default_value = 1.0
        m.surface_render_method = "DITHERED"
        m.use_backface_culling = False
    return mats


def bake_world(o):
    """Objenin dünya matrisini mesh'e uygula, ebeveynden ayır (kökü sonra kendimiz kurarız)."""
    mw = o.matrix_world.copy()
    o.parent = None
    o.data = o.data.copy()
    o.data.transform(mw)
    o.matrix_world = o.matrix_world.Identity(4)
    return o


def split_faces(o, pred, name):
    """`pred(yüz merkezi, dünya)` doğru olan yüzleri yeni objeye taşı (obje kopyası + yüz silme → UV'ler korunur)."""
    new = o.copy()
    new.data = o.data.copy()
    new.name = name
    for c in o.users_collection:
        c.objects.link(new)
    for ob, keep in ((o, False), (new, True)):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        kill = [f for f in bm.faces if pred(ob.matrix_world @ f.calc_center_median()) != keep]
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.to_mesh(ob.data)
        bm.free()
    return new


def bisect_keep(o, co, no, fill=True):
    """Yerel düzlemin (co, no) normal yönündeki yarısını tut, öbürünü sil, kesiti kapat."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    r = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_inner=True)
    if fill:
        edges = [e for e in r["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
        if edges:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bm.to_mesh(o.data)
    bm.free()


def _paint(px, h, rect, tol=0.06, color=None):
    """rect=(x0,y0,x1,y1) PNG pikseli (sol-üst orijin): baskın renkten farklı pikselleri (yazı) baskın renge boya."""
    x0, y0, x1, y1 = rect
    ys, ye = h - y1, h - y0
    reg = px[ys:ye, x0:x1, :3]
    if color is None:
        q = np.round(reg.reshape(-1, 3) * 48)
        vals, cnt = np.unique(q, axis=0, return_counts=True)
        color = vals[cnt.argmax()] / 48
    diff = np.abs(reg - color).max(axis=2) > tol
    d = diff.copy()
    for sy, sx in ((1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2), (3, 0), (-3, 0), (0, 3), (0, -3)):
        d |= np.roll(np.roll(diff, sy, 0), sx, 1)
    reg[d] = color
    px[ys:ye, x0:x1, :3] = reg


# 1024² dokular: gövde yüzlerindeki "X-KEY" ovalleri (renk + ORM), anahtar başlarındaki yazı (ORM)
CLEAN = {
    "Image_0": [(330, 60, 525, 360), (40, 385, 240, 690)],
    "Image_1": [(330, 60, 525, 360), (40, 385, 240, 690), (691, 0, 896, 222), (631, 631, 836, 836)],
}


def clean_textures(names=CLEAN):
    for name, rects in names.items():
        im = bpy.data.images.get(name)
        if im is None:
            continue
        w, h = im.size
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        px = px.reshape(h, w, 4)
        for r in rects:
            _paint(px, h, r)
        im.pixels.foreach_set(px.ravel())
        im.pack()


def ray_hit(objs, origin, direction):
    best = None
    for o in objs:
        if o.type != "MESH":
            continue
        inv = o.matrix_world.inverted()
        ok, loc, nrm, _ = o.ray_cast(inv @ Vector(origin), (inv.to_3x3() @ Vector(direction)).normalized())
        if ok:
            p = o.matrix_world @ loc
            dd = (p - Vector(origin)).length
            if best is None or dd < best[0]:
                best = (dd, p, o)
    return best


def world_bbox(objs):
    vs = [o.matrix_world @ v.co for o in objs if o.type == "MESH" for v in o.data.vertices]
    lo = Vector([min(v[i] for v in vs) for i in range(3)])
    hi = Vector([max(v[i] for v in vs) for i in range(3)])
    return lo, hi
