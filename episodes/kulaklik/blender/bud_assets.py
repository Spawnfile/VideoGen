"""Kulaklık bölümünün Sketchfab modeli (CC BY 4.0) ve mesh yardımcıları.

- "AirPods Pro" — Jed Falcone (3f84ddc3d87a4ec0a5e5f379abfecd9c) → şarj kutusu + iki kulaklık (jed.glb)
  Modelde doku/logo yok (yalnız hoparlör ızgarası alfa dokusu). Orijinal C4D animasyonu (kapak + kulaklıklar) silinir,
  kapak menteşesi ve kulaklık hareketi kendi zamanlamamızla yeniden keyframe'lenir.

asma-kilit/lock_assets.py kalıbı: import_glb + bake (kök matris mesh'e), fix_materials, split_faces, bisect_keep.
"""
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, "asset_dl")
CREDITS = ['"AirPods Pro" by Jed Falcone (Sketchfab), CC BY 4.0']

SCALE = 1.15            # model kutusu 5,3 cm → gerçek ~6 cm
CENTER_X = 1.427        # iki kulaklığın simetri ekseni (model birimi)
LID_HINGE = Vector((2.068, 0.851, 0.198))   # orijinal Lid boşu (model birimi)
LID_OPEN = -1.92        # orijinal animasyondaki kapak açısı (rad, X)

BUD = ["Cube_2_Mat.1_0", "Cube_1_2_Speaker Grille_0", "Cube_1_Mat.3_0", "Cube_4_Mat.9_0", "Cube_Mat.3_0",
       "Capsule_Mat.2_0", "Cylinder__0"]
LID = ["Boole_1_Mat.1_0", "Boole_1_2_Mat.1_0", "Boole_Mat.5_0", "Subdivision_Surface_1_Mat.1_0",
       "Subdivision_Surface_3_Mat.5_0"]


def to_world(p):
    """Model biriminden sahne birimine (cm, ortalanmış)."""
    return Matrix.Scale(SCALE, 4) @ Matrix.Translation((-CENTER_X, 0, 0)) @ Vector(p)


def import_jed():
    """jed.glb'yi al, animasyonu sil, dinlenme pozunda tüm mesh'lere dünya matrisini uygula, boşları sil."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(DL, "jed.glb"))
    new = [o for o in bpy.data.objects if o not in before]
    sc = bpy.context.scene
    for o in new:
        if o.animation_data:
            o.animation_data_clear()
    sc.frame_set(1)
    bpy.context.view_layer.update()
    M = Matrix.Scale(SCALE, 4) @ Matrix.Translation((-CENTER_X, 0, 0))
    meshes = {}
    for o in new:
        if o.type != "MESH":
            continue
        mw = o.matrix_world.copy()
        o.parent = None
        o.data = o.data.copy()
        o.data.transform(M @ mw)
        o.matrix_world = Matrix.Identity(4)
        meshes[o.name] = o
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    return meshes


def split_faces(o, pred, name):
    """`pred(yüz merkezi)` doğru olan yüzleri yeni objeye taşı (obje kopyası + yüz silme → UV'ler korunur)."""
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


def verts_world(objs):
    return [o.matrix_world @ v.co for o in objs for v in o.data.vertices]


def centroid(vs):
    s = Vector()
    for v in vs:
        s += v
    return s / max(1, len(vs))


def bud_frame(shell, tip, contacts):
    """Kulaklığın yerel çerçevesi: orijin = baş merkezi, +Z = kulak ucu ekseni (dışa), +X = sapa doğru (Z'ye dik)."""
    vs = verts_world([shell])
    zs = sorted(v.z for v in vs)
    head = [v for v in vs if v.z > zs[0] + 0.48 * (zs[-1] - zs[0])]
    hc = centroid(head)
    tc = centroid(verts_world([tip]))
    sc = centroid(verts_world([contacts]))
    t = (tc - hc).normalized()
    s = sc - hc
    x = (s - s.dot(t) * t).normalized()
    y = t.cross(x)
    F = Matrix.Identity(4)
    for i in range(3):
        F[i][0], F[i][1], F[i][2], F[i][3] = x[i], y[i], t[i], hc[i]
    return F


def bisect_keep(o, co, no, fill=True):
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
