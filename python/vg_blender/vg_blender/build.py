"""Headless, render-free scene build (spec §7.3, MCP build_scene): product.py + SceneSpec → .blend, scene.glb, anchors.json,
events.json, camera_track.json and build.json. Motion is keyed on every frame from the SceneSpec (no constraints, no NLA
bake), so Blender, the GLB clips and Three.js agree exactly (M0 spike d, M4b probe P5: 0.00 px)."""
import json
import math
import os
import traceback

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from . import materials, motion, safety, stage
from .api import Vg

ANCHOR_STEP = 5
MAX_TRIANGLES = 400_000


def _meshes(root):
    return [o for o in root.children_recursive if o.type == "MESH"]


def _equivalence_frames(frames):
    return [math.floor(q * frames) for q in (0, 0.25, 0.5, 0.75, 1)]


def animate_parts(spec, roots, fps, frames):
    for p in spec["parts"]:
        root = roots[p["id"]]
        rest = Vector(root.location)
        e = p["explode"]
        f0, f1 = round(e["t_start"] * fps), round(e["t_end"] * fps)
        # A hold key on the last frame: every glTF clip spans the whole video (a finished LoopOnce action would otherwise snap back).
        for f in sorted({0, *range(f0, f1 + 1), frames}):
            root.location = rest + Vector(motion.explode_offset(e, f / fps))
            root.keyframe_insert("location", frame=f)


def add_anchors(spec, roots):
    out = {}
    for p in spec["parts"]:
        a = bpy.data.objects.new(f"anchor_{p['id']}", None)
        a.empty_display_size = 0.2
        bpy.context.scene.collection.objects.link(a)
        a.parent = roots[p["id"]]
        a.location = tuple(p["anchor_local"])
        out[p["id"]] = a
    return out


def camera_rig(spec, fps, frames):
    data = bpy.data.cameras.new("vg_camera")
    data.sensor_width, data.sensor_fit = 36.0, "AUTO"
    data.clip_start, data.clip_end = 0.01, 10_000
    cam = bpy.data.objects.new("vg_camera", data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    cam.rotation_mode = "QUATERNION"
    track = []
    for f in range(frames + 1):
        c = motion.camera_at(spec["camera_keys"], f / fps)
        pos, tgt = Vector(c["position"]), Vector(c["target"])
        cam.location = pos
        cam.rotation_quaternion = (tgt - pos).to_track_quat("-Z", "Y")
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_quaternion", frame=f)
        data.lens = c["lens_mm"]
        data.keyframe_insert("lens", frame=f)
        track.append(motion.yfov(c["lens_mm"], data.sensor_width))
    return cam, {"fps": fps, "sensor_mm": data.sensor_width, "yfov": track}


def _screen_box(scene, cam, objs):
    """Clipped screen box (x0, y0, x1, y1 in 0..1, y down) of the objects' world bounding boxes; None when behind the camera."""
    pts = []
    for o in objs:
        for c in o.bound_box:
            v = world_to_camera_view(scene, cam, o.matrix_world @ Vector(c))
            if v.z > 0:
                pts.append((v.x, 1 - v.y))
    if not pts:
        return None
    clip = lambda v: min(1.0, max(0.0, v))  # noqa: E731
    return clip(min(p[0] for p in pts)), clip(min(p[1] for p in pts)), clip(max(p[0] for p in pts)), clip(max(p[1] for p in pts))


def anchors_manifest(scene, cam, anchors, frames):
    want = sorted(set(range(0, frames + 1, ANCHOR_STEP)) | set(_equivalence_frames(frames)))
    out = {}
    for f in want:
        scene.frame_set(f)
        row = {}
        for pid, a in anchors.items():
            v = world_to_camera_view(scene, cam, a.matrix_world.translation)
            row[pid] = [round(v.x * stage.W, 3), round((1 - v.y) * stage.H, 3)]
        out[str(f)] = row
    return {"width": stage.W, "height": stage.H, "fps": stage.FPS, "step": ANCHOR_STEP, "frames": out}


def events_manifest(spec, storyboard, fps):
    ev = []
    for p in spec["parts"]:
        e = p["explode"]
        if any(abs(v) > 1e-6 for v in e["vector"]):
            ev.append({"id": f"explode_start:{p['id']}", "type": "explode_start", "frame": round(e["t_start"] * fps), "part_id": p["id"]})
            ev.append({"id": f"part_lock:{p['id']}", "type": "part_lock", "frame": round(e["t_end"] * fps), "part_id": p["id"]})
    for b in storyboard["beats"]:
        for pid in b["parts"]:
            ev.append({"id": f"label_in:{b['id']}:{pid}", "type": "label_in", "frame": round(b["t_start"] * fps), "part_id": pid})
    keys = spec["camera_keys"]
    for a, b in zip(keys, keys[1:]):
        da = (Vector(a["position"]) - Vector(a["target"])).length
        db = (Vector(b["position"]) - Vector(b["target"])).length
        if b["lens_mm"] - a["lens_mm"] >= 15 or (da > 0 and db <= 0.7 * da):
            ev.append({"id": f"zoom:{a['t']}", "type": "zoom", "frame": round(a["t"] * fps)})
    ev.sort(key=lambda e: (e["frame"], e["id"]))
    return {"events": ev}


def _world_bvh(obj, dg):
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    verts = [obj.matrix_world @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def checks(spec, storyboard, roots, cam, fps):
    scene = bpy.context.scene
    scene.frame_set(0)
    dg = bpy.context.evaluated_depsgraph_get()
    trees = {pid: [_world_bvh(o, dg) for o in _meshes(r)] for pid, r in roots.items()}
    overlaps = []
    ids = sorted(trees)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if any(ta.overlap(tb) for ta in trees[a] for tb in trees[b]):
                overlaps.append({"a": a, "b": b})
    hero = _screen_box(scene, cam, _meshes(roots[spec["hero_part"]]))
    hero_ratio = round(hero[3] - hero[1], 4) if hero else 0.0
    occlusion = []
    for beat in storyboard["beats"]:
        scene.frame_set(round((beat["t_start"] + beat["t_end"]) / 2 * fps))
        for pid, r in roots.items():
            if pid in beat["parts"]:
                continue
            box = _screen_box(scene, cam, _meshes(r))
            if box and (box[2] - box[0]) * (box[3] - box[1]) > 0.25:
                occlusion.append({"beat_id": beat["id"], "part_id": pid, "ratio": round((box[2] - box[0]) * (box[3] - box[1]), 3)})
    scene.frame_set(0)
    tris = 0
    for r in roots.values():
        for o in _meshes(r):
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            ev.to_mesh_clear()
    return overlaps, hero_ratio, occlusion, tris


def _report(frames):
    return {"ok": False, "errors": [], "parts": [], "missing_parts": [], "extra_parts": [], "overlaps": [], "hero_ratio": 0.0,
            "occlusion": [], "triangles": 0, "frames": frames, "warnings": []}


def _part_roots():
    return {o.name: o for o in bpy.context.scene.objects if o.type == "EMPTY" and o.parent is None}


def product_phase(spec, product_src, out_blend):
    """Phase 1 (sandboxed, untrusted code): run product.py, save the geometry-only .blend. Nothing else is trusted from here."""
    report = _report(spec["frames"])
    stage.reset(spec["frames"])
    vg = Vg()
    try:
        safety.run_product(product_src, vg)
    except safety.ProductError as e:
        report["errors"] = e.problems
        return report
    except Exception as e:  # product.py raised: report the line inside product.py
        tb = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "product.py"]
        where = f"satır {tb[-1].lineno}: " if tb else ""
        report["errors"] = [f"product.py {where}{type(e).__name__}: {e}"]
        return report
    report["parts"] = sorted(vg._parts)
    report["ok"] = True
    bpy.ops.wm.save_as_mainfile(filepath=out_blend, compress=True)
    return report


def build_phase(spec, storyboard, style, product_blend, out):
    """Phase 2 (worker-owned code, autoexec off): open the geometry, keep only part empties and their meshes, then key,
    light, check and export. Every manifest is computed here, so product.py cannot forge anchors or the report."""
    os.makedirs(out, exist_ok=True)
    fps, frames = spec["fps"], spec["frames"]
    report = _report(frames)
    bpy.ops.wm.open_mainfile(filepath=product_blend, load_ui=False)
    stage.configure(frames)
    roots = _part_roots()
    keep = set()
    for r in roots.values():
        keep.add(r)
        keep.update(o for o in r.children_recursive if o.type == "MESH")
    for o in list(bpy.context.scene.objects):
        if o not in keep:
            bpy.data.objects.remove(o)
    for r in roots.values():
        r.animation_data_clear()
        for o in r.children_recursive:
            o.animation_data_clear()
    wanted = [p["id"] for p in spec["parts"]]
    report["parts"] = sorted(roots)
    report["missing_parts"] = [p for p in wanted if p not in roots]
    report["extra_parts"] = sorted(set(roots) - set(wanted))
    if report["missing_parts"]:
        report["errors"].append(f"product.py şu parçaları kurmadı: {', '.join(report['missing_parts'])}")
    if report["extra_parts"]:
        report["errors"].append(f"SceneSpec'te olmayan parçalar: {', '.join(report['extra_parts'])}")
    if report["errors"]:
        return report
    for p in spec["parts"]:
        for o in _meshes(roots[p["id"]]):
            if not o.data.materials:
                o.data.materials.append(materials.material(p["material_preset"]))
    stage.world(style)
    stage.lighting(spec["lighting_preset"])
    animate_parts(spec, roots, fps, frames)
    anchors = add_anchors(spec, roots)
    cam, track = camera_rig(spec, fps, frames)
    report["overlaps"], report["hero_ratio"], report["occlusion"], report["triangles"] = checks(spec, storyboard, roots, cam, fps)
    if report["triangles"] > MAX_TRIANGLES:
        report["errors"].append(f"üçgen sayısı {report['triangles']} > {MAX_TRIANGLES}: taslak ve render için çok ağır")
        return report
    if report["hero_ratio"] < 0.35:
        report["warnings"].append(f"kahraman nesne 0. karede kadraj yüksekliğinin %{round(report['hero_ratio'] * 100)}'i (en az %35)")
    for o in report["occlusion"]:
        report["warnings"].append(f"{o['beat_id']}: konu olmayan {o['part_id']} kadrajın %{round(o['ratio'] * 100)}'ini kaplıyor (en çok %25)")
    for o in report["overlaps"]:
        report["warnings"].append(f"0. karede iç içe geçme: {o['a']} ↔ {o['b']}")
    scene = bpy.context.scene
    with open(os.path.join(out, "anchors.json"), "w") as f:
        json.dump(anchors_manifest(scene, cam, anchors, frames), f)
    with open(os.path.join(out, "events.json"), "w") as f:
        json.dump(events_manifest(spec, storyboard, fps), f)
    with open(os.path.join(out, "camera_track.json"), "w") as f:
        json.dump(track, f)
    scene.frame_set(0)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, "scene.glb"), export_format="GLB", export_cameras=True, export_lights=False,
                              export_animations=True, export_force_sampling=True, export_apply=True, export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "scene.blend"), compress=True)
    report["ok"] = True
    return report


def _load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def main(argv):
    """`product` phase: --spec --product --out-blend --report; `scene` phase: --spec --storyboard --style --blend --out --report."""
    import argparse

    ap = argparse.ArgumentParser(prog="vg_blender.build")
    ap.add_argument("phase", choices=["product", "scene"])
    for a in ("--spec", "--report"):
        ap.add_argument(a, required=True)
    for a in ("--product", "--out-blend", "--storyboard", "--style", "--blend", "--out"):
        ap.add_argument(a)
    a = ap.parse_args(argv)
    spec = _load(a.spec)
    if a.phase == "product":
        with open(a.product, encoding="utf-8") as f:
            report = product_phase(spec, f.read(), a.out_blend)
    else:
        report = build_phase(spec, _load(a.storyboard), _load(a.style), a.blend, a.out)
    with open(a.report, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False)
    print("VG_BUILD", a.phase, "ok" if report["ok"] else "failed", flush=True)
    return 0
