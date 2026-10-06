import bpy, json, sys
from pathlib import Path
from bpy_extras.object_utils import world_to_camera_view

out = Path(sys.argv[sys.argv.index("--") + 1])
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.fps = 1080, 1920, 30
sc.frame_start, sc.frame_end = 0, 60

bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=12, location=(0, 0, 0))
bpy.ops.mesh.primitive_cube_add(size=1.5, location=(0, 0, 7))
anchors = {}
for name, loc in {"tip": (0, 0, -6), "cap": (0, 0, 7.75), "side": (0.5, 0, 2)}.items():
    e = bpy.data.objects.new(f"anchor_{name}", None)
    e.location = loc
    sc.collection.objects.link(e)
    anchors[name] = e

target = bpy.data.objects.new("target", None)
sc.collection.objects.link(target)
cam_data = bpy.data.cameras.new("cam")
cam_data.lens, cam_data.sensor_width, cam_data.sensor_fit = 85, 36, "AUTO"
cam = bpy.data.objects.new("cam", cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
c = cam.constraints.new("TRACK_TO")
c.target, c.track_axis, c.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
for f, loc in [(0, (40, -40, 10)), (30, (0, -60, 20)), (60, (-40, -40, 5))]:
    cam.location = loc
    cam.keyframe_insert("location", frame=f)

frames = [0, 15, 30, 45, 60]
data = {"width": 1080, "height": 1920, "frames": {}}
for f in frames:
    sc.frame_set(f)
    row = {}
    for name, e in anchors.items():
        v = world_to_camera_view(sc, cam, e.matrix_world.translation)
        row[name] = [v.x * 1080, (1 - v.y) * 1920]
    data["frames"][str(f)] = row
(out / "anchors.json").write_text(json.dumps(data, indent=1))

bpy.ops.object.select_all(action="SELECT")
bpy.ops.nla.bake(frame_start=0, frame_end=60, only_selected=True, visual_keying=True, clear_constraints=True, bake_types={"OBJECT"})
bpy.ops.export_scene.gltf(filepath=str(out / "scene.glb"), export_format="GLB", export_cameras=True, export_animations=True, export_extras=True)
print("WROTE", out)
