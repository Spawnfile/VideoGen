"""Geometry builders (spec §7.3). Units: 1 Blender unit = 1 cm; parts stand along local Z. Every builder returns a mesh object."""
import math

import bmesh
import bpy
from mathutils import Vector


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _object(name, bm, smooth=True, sharp_deg=35.0):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    return _link(bpy.data.objects.new(name, me))


def lathe(name, profile, steps=96, sharp_deg=35.0):
    """(r, z) profile spun around Z. A profile that does not touch the axis at both ends is closed into a ring (wall thickness)."""
    if len(profile) < 2:
        raise ValueError("lathe profili en az 2 nokta olmalı")
    bm = bmesh.new()
    verts = [bm.verts.new((max(0.0, r), 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    if profile[0][0] > 0 and profile[-1][0] > 0 and len(verts) > 2:
        edges.append(bm.edges.new((verts[-1], verts[0])))
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, sharp_deg=sharp_deg)


def box(name, size, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    o = _object(name, bm, smooth=bevel > 0)
    if bevel > 0:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width, m.segments, m.harden_normals = bevel, 3, True
    return o


def cylinder(name, radius, depth, steps=64):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=steps, radius1=radius, radius2=radius, depth=depth)
    return _object(name, bm)


def sphere(name, radius, segments=32):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=max(8, segments // 2), radius=radius)
    return _object(name, bm, sharp_deg=180.0)


def tube(name, outer_radius, inner_radius, depth, steps=64):
    if not 0 <= inner_radius < outer_radius:
        raise ValueError("tube: 0 ≤ inner_radius < outer_radius olmalı")
    h = depth / 2
    if inner_radius == 0:
        return cylinder(name, outer_radius, depth, steps)
    return lathe(name, [(inner_radius, -h), (outer_radius, -h), (outer_radius, h), (inner_radius, h)], steps=steps, sharp_deg=30)


def _sweep(name, points, radius, sides=12, closed_caps=True):
    """A round tube along a polyline (wire, spring, thread)."""
    if len(points) < 2:
        raise ValueError("en az 2 nokta gerekli")
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.99 else Vector((1, 0, 0))
        a = d.cross(up).normalized()
        b = d.cross(a).normalized()
        rings.append([bm.verts.new(p + radius * (math.cos(2 * math.pi * k / sides) * a + math.sin(2 * math.pi * k / sides) * b)) for k in range(sides)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
    if closed_caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, sharp_deg=60)


def wire(name, points, radius):
    return _sweep(name, points, radius)


def spring(name, radius, wire_radius, turns, length, steps_per_turn=24):
    """Helical spring along Z from 0 to length; ends are closed (spec §7.3 pilot lesson: capped spring ends)."""
    n = max(2, int(turns * steps_per_turn))
    pts = [(radius * math.cos(2 * math.pi * turns * i / n), radius * math.sin(2 * math.pi * turns * i / n), length * i / n) for i in range(n + 1)]
    return _sweep(name, pts, wire_radius, sides=10)


def extrude(name, outline, depth):
    """2D polygon (x, y) in the XY plane, extruded along +Z by depth."""
    if len(outline) < 3:
        raise ValueError("extrude: en az 3 köşe gerekli")
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((x, y, 0)) for x, y in outline])
    r = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]:
        v.co.z += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm, sharp_deg=30)


def gear(name, teeth, radius, thickness, tooth_depth, bore=0.0):
    if teeth < 4:
        raise ValueError("gear: en az 4 diş")
    outline = []
    for i in range(teeth * 4):
        a = 2 * math.pi * i / (teeth * 4)
        r = radius if (i % 4) in (1, 2) else radius - tooth_depth
        outline.append((r * math.cos(a), r * math.sin(a)))
    o = extrude(name, outline, thickness)
    if bore > 0:
        hole = cylinder(f"{name}_bore", bore, thickness * 3)
        hole.location.z = thickness / 2
        m = o.modifiers.new("bore", "BOOLEAN")
        m.object, m.operation = hole, "DIFFERENCE"
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        o.modifiers.clear()
        o.data = me
        bpy.data.objects.remove(hole)
    return o


def screw(name, radius, length, pitch, thread_depth, head_radius=0.0, head_height=0.0):
    core = cylinder(f"{name}_core", radius - thread_depth / 2, length)
    core.location.z = length / 2
    turns = length / pitch
    n = max(2, int(turns * 24))
    pts = [((radius - thread_depth / 4) * math.cos(2 * math.pi * turns * i / n), (radius - thread_depth / 4) * math.sin(2 * math.pi * turns * i / n), length * i / n) for i in range(n + 1)]
    thread = _sweep(f"{name}_thread", pts, thread_depth / 2, sides=6)
    objs = [core, thread]
    if head_radius > 0 and head_height > 0:
        head = cylinder(f"{name}_head", head_radius, head_height)
        head.location.z = length + head_height / 2
        objs.append(head)
    return join(name, objs)


def pcb(name, size, thickness=0.16, components=()):
    """Board (w, d) with simple box components (x, y, w, d, h) on top."""
    objs = [box(f"{name}_board", (size[0], size[1], thickness), bevel=0.01)]
    objs[0].location.z = thickness / 2
    for i, (x, y, w, d, h) in enumerate(components):
        c = box(f"{name}_c{i}", (w, d, h), bevel=min(w, d, h) * 0.08)
        c.location = (x, y, thickness + h / 2)
        objs.append(c)
    return join(name, objs)


def mesh(name, verts, faces):
    if not verts or not faces:
        raise ValueError("mesh: köşe ve yüz gerekli")
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _object(name, bm)


def join(name, objs):
    """Bakes modifiers and transforms of several meshes into one object named `name`."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    for o in objs:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    mats = [s.material for o in objs for s in o.material_slots if s.material]
    for o in objs:
        bpy.data.objects.remove(o)
    out = _object(name, bm, smooth=False)
    for m in dict.fromkeys(mats):
        out.data.materials.append(m)
    return out
