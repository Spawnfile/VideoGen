"""Saat bölümünün Sketchfab modelleri (hepsi CC BY 4.0):

- "FREDERIQUE CONSTANT AUTOMATIC MOVEMENT - FC-0050" — Not.3D   → ortak kasa (fc0050.glb, tek mesh + cam)
- "Swiss lever escapement mechanism" — C. Yamahata (cyamahat)    → İsviçre kahraman (swiss.glb, animasyonlu)
- "Seiko Magic Lever" — C. Yamahata (cyamahat)                    → Japon kahraman (seiko.glb, animasyonlu)

Animasyonlu modellerde içe aktarılan action'lar örneklenir (`sample_anim`), sonra kendi zaman eğrimize göre
(`retime`) yeniden keyframe'lenir: kaynak döngü sonsuz tekrarlanır, tek eksende dönen parçaların (eşapman çarkı,
cırcır) her döngüde biriken dönüşü korunur → yavaş çekim ↔ gerçek hız serbestçe.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, "asset_dl")
CREDITS = [
    '"FREDERIQUE CONSTANT AUTOMATIC MOVEMENT - FC-0050" by Not.3D (Sketchfab), CC BY 4.0',
    '"Swiss lever escapement mechanism" by C. Yamahata (Sketchfab), CC BY 4.0',
    '"Seiko Magic Lever" by C. Yamahata (Sketchfab), CC BY 4.0',
]


def import_glb(name, root, scale=1.0, rot=None):
    """GLB'yi içe al, en üst düğümü `root` boşuna bağla (dünya dönüşümü korunur), root'a ölçek/dönüş ver."""
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=os.path.join(DL, name))
    new = [o for o in bpy.data.objects if o not in before]
    tops = [o for o in new if o.parent is None]
    for o in tops:
        mw = o.matrix_world.copy()
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()
        o.matrix_world = mw
    root.scale = (scale, scale, scale)
    if rot is not None:
        root.rotation_euler = rot
    bpy.context.view_layer.update()
    acts = [a for a in bpy.data.actions if a not in acts_before]
    for o in new:  # gizli lambalar/ışıklar ve boş kameralar kalmasın
        if o.type in ("LIGHT", "CAMERA"):
            bpy.data.objects.remove(o)
    new = [o for o in new if o.name in bpy.data.objects]
    return new, acts


def fix_materials(objs):
    """BLENDED + alfa bağlı dokular sıralama hatası yapar → alfayı kopar, DITHERED (cam hariç)."""
    mats = []
    for o in objs:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            if m and m not in mats:
                mats.append(m)
    for m in mats:
        if "glass" in m.name.lower():
            continue
        p = m.node_tree.nodes.get("Principled BSDF")
        if p:
            for l in list(p.inputs["Alpha"].links):
                m.node_tree.links.remove(l)
            p.inputs["Alpha"].default_value = 1.0
        m.surface_render_method = "DITHERED"
        m.use_backface_culling = False
    return mats


# ---------------------------------------------------------------- animasyon örnekleme / yeniden zamanlama

def animated(objs):
    return [o for o in objs if o.animation_data and o.animation_data.action]


def sample_anim(objs, start, end, step=0.25):
    """Her animasyonlu objenin yerel (matrix_basis) konum + quaternion'unu [start, end] aralığında örnekle."""
    scene = bpy.context.scene
    objs = animated(objs)
    n = int(round((end - start) / step)) + 1
    S = {o.name: {"loc": [], "q": []} for o in objs}
    for i in range(n):
        t = start + i * step
        fi = math.floor(t)
        scene.frame_set(fi, subframe=t - fi)
        for o in objs:
            mb = o.matrix_basis
            S[o.name]["loc"].append(mb.to_translation())
            S[o.name]["q"].append(mb.to_quaternion())
    for o in objs:  # kuaterniyon işaret sürekliliği
        qs = S[o.name]["q"]
        for i in range(1, len(qs)):
            if qs[i].dot(qs[i - 1]) < 0:
                qs[i] = -qs[i]
        S[o.name]["delta"] = qs[-1] @ qs[0].inverted()  # bir döngüde biriken dönüş
    return {"start": start, "end": end, "step": step, "objs": S}


def pose_at(S, name, u):
    """u: döngü cinsinden zaman (0..1 bir döngü; 2.3 = iki döngü + 0.3). Döner: (loc, quat)."""
    d = S["objs"][name]
    k = math.floor(u)
    fr = u - k
    n = len(d["q"]) - 1
    x = fr * n
    i = min(int(x), n - 1)
    w = x - i
    loc = d["loc"][i].lerp(d["loc"][i + 1], w)
    q = d["q"][i].slerp(d["q"][i + 1], w)
    if k:
        dq = d["delta"]
        acc = Quaternion()
        for _ in range(abs(k)):
            acc = (dq if k > 0 else dq.inverted()) @ acc
        q = acc @ q
    return loc, q


def retime(objs, S, u_of_frame, frames):
    """Kendi zaman eğrimiz: her kare için u(f) → keyframe (LINEAR)."""
    objs = animated(objs)
    for o in objs:
        o.animation_data_clear()
        o.rotation_mode = "QUATERNION"
    prefs = bpy.context.preferences.edit
    old = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = "LINEAR"
    prev = {}
    for f in frames:
        u = u_of_frame(f)
        for o in objs:
            loc, q = pose_at(S, o.name, u)
            if o.name in prev and q.dot(prev[o.name]) < 0:
                q = -q
            prev[o.name] = q
            o.location = loc
            o.rotation_quaternion = q
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("rotation_quaternion", frame=f)
    prefs.keyframe_new_interpolation_type = old


def action_range(acts):
    lo = min(a.frame_range[0] for a in acts)
    hi = max(a.frame_range[1] for a in acts)
    return lo, hi


# ---------------------------------------------------------------- marka temizliği (saat dokusu)

def _paint(px, h, rect=None, ring=None, tol=0.05, color=None):
    """rect=(x0,y0,x1,y1) veya ring=(cx,cy,r_in,r_out) PNG pikseli (sol-üst orijin) içindeki, baskın renkten
    farklı pikselleri (yazı) baskın renge boya."""
    if rect:
        x0, y0, x1, y1 = rect
        ys, ye = h - y1, h - y0
        reg = px[ys:ye, x0:x1, :3]
        mask = np.ones(reg.shape[:2], bool)
    else:
        cx, cy, ri, ro = ring
        x0, x1 = cx - ro, cx + ro
        ys, ye = h - (cy + ro), h - (cy - ro)
        reg = px[ys:ye, x0:x1, :3]
        yy, xx = np.mgrid[ys:ye, x0:x1]
        rr = np.hypot(xx - cx, (h - 1 - yy) - cy)
        mask = (rr >= ri) & (rr <= ro)
    if color is None:
        q = np.round(reg[mask] * 64)
        vals, cnt = np.unique(q, axis=0, return_counts=True)
        color = vals[cnt.argmax()] / 64
    diff = (np.abs(reg - color).max(axis=2) > tol) & mask
    d = diff.copy()
    for sy, sx in ((1, 0), (-1, 0), (0, 1), (0, -1), (2, 0), (-2, 0), (0, 2), (0, -2)):
        d |= np.roll(np.roll(diff, sy, 0), sx, 1)
    d &= mask
    reg[d] = color
    px[ys:ye, x0:x1, :3] = reg


# Image_2 (1024², taban renk): kadran yazısı + "SWISS MADE", arka kapak halkası ve mekanizma baskısı
CLEAN = {
    "Image_2": [dict(rect=(140, 640, 370, 712)), dict(rect=(165, 970, 212, 1000)), dict(rect=(312, 970, 360, 1000)),
                dict(ring=(724, 731, 146, 196))],
    "Image_3": [dict(ring=(724, 731, 146, 196))],
}


def clean_watch_textures():
    for name, ops in CLEAN.items():
        im = bpy.data.images.get(name)
        if im is None:
            continue
        w, h = im.size
        px = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(px)
        px = px.reshape(h, w, 4)
        for op in ops:
            _paint(px, h, **op)
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
