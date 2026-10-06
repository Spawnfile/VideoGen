"""The `vg` object product.py receives. It exposes geometry only: no bpy handles leak (attributes starting with '_' are
forbidden by safety.py), so product.py cannot reach Blender's file, script or network APIs."""
import math

import bpy

from . import materials, primitives

MAX_SHAPES = 400


class Shape:
    """A mesh handle with chainable transforms."""

    __slots__ = ("_obj",)

    def __init__(self, obj):
        self._obj = obj

    def move(self, x=0.0, y=0.0, z=0.0):
        self._obj.location = (self._obj.location.x + x, self._obj.location.y + y, self._obj.location.z + z)
        return self

    def rotate(self, x=0.0, y=0.0, z=0.0):
        """Degrees, applied in X, Y, Z order on top of the current rotation."""
        r = self._obj.rotation_euler
        self._obj.rotation_euler = (r.x + math.radians(x), r.y + math.radians(y), r.z + math.radians(z))
        return self

    def scale(self, x=1.0, y=None, z=None):
        self._obj.scale = (x, x if y is None else y, x if z is None else z)
        return self

    def material(self, preset):
        self._obj.data.materials.clear()
        self._obj.data.materials.append(materials.material(preset))
        return self

    def bevel(self, width, segments=3):
        m = self._obj.modifiers.new("bevel", "BEVEL")
        m.width, m.segments, m.harden_normals = width, segments, True
        return self

    def copy(self):
        o = self._obj.copy()
        o.data = self._obj.data.copy()
        bpy.context.scene.collection.objects.link(o)
        return Shape(o)


class Vg:
    """Builder API. Shapes are grouped into parts with part(id, *shapes); part ids must match SceneSpec parts."""

    def __init__(self):
        self._shapes = 0
        self._parts = {}

    def _new(self, fn, *a, **k):
        self._shapes += 1
        if self._shapes > MAX_SHAPES:
            raise ValueError(f"en çok {MAX_SHAPES} şekil kurulabilir")
        return Shape(fn(f"s{self._shapes:03d}", *a, **k))

    def lathe(self, profile, steps=96, sharp_deg=35.0):
        return self._new(primitives.lathe, [tuple(p) for p in profile], steps=steps, sharp_deg=sharp_deg)

    def box(self, size, bevel=0.0):
        return self._new(primitives.box, tuple(size), bevel=bevel)

    def cylinder(self, radius, depth, steps=64):
        return self._new(primitives.cylinder, radius, depth, steps=steps)

    def sphere(self, radius, segments=32):
        return self._new(primitives.sphere, radius, segments=segments)

    def tube(self, outer_radius, inner_radius, depth, steps=64):
        return self._new(primitives.tube, outer_radius, inner_radius, depth, steps=steps)

    def spring(self, radius, wire_radius, turns, length, steps_per_turn=24):
        return self._new(primitives.spring, radius, wire_radius, turns, length, steps_per_turn=steps_per_turn)

    def gear(self, teeth, radius, thickness, tooth_depth, bore=0.0):
        return self._new(primitives.gear, teeth, radius, thickness, tooth_depth, bore=bore)

    def screw(self, radius, length, pitch, thread_depth, head_radius=0.0, head_height=0.0):
        return self._new(primitives.screw, radius, length, pitch, thread_depth, head_radius=head_radius, head_height=head_height)

    def extrude(self, outline, depth):
        return self._new(primitives.extrude, [tuple(p) for p in outline], depth)

    def pcb(self, size, thickness=0.16, components=()):
        return self._new(primitives.pcb, tuple(size), thickness=thickness, components=[tuple(c) for c in components])

    def wire(self, points, radius):
        return self._new(primitives.wire, [tuple(p) for p in points], radius)

    def mesh(self, verts, faces):
        return self._new(primitives.mesh, [tuple(v) for v in verts], [tuple(f) for f in faces])

    def part(self, part_id, *shapes):
        """Groups shapes under an empty named after the part (the explode animation moves the empty)."""
        if part_id in self._parts:
            raise ValueError(f"parça iki kez tanımlandı: {part_id}")
        if not shapes:
            raise ValueError(f"parça boş: {part_id}")
        root = bpy.data.objects.new(part_id, None)
        root.empty_display_size = 0.5
        bpy.context.scene.collection.objects.link(root)
        for i, s in enumerate(shapes):
            if not isinstance(s, Shape):
                raise TypeError(f"{part_id}: part() yalnızca vg şekillerini alır")
            s._obj.name = f"{part_id}__m{i}"
            s._obj.parent = root
        self._parts[part_id] = root
