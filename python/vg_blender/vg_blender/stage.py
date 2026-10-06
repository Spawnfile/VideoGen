"""Scene, world, light and render settings (spec §7.3 studio light, §7.5 render settings)."""
import math

import bpy

from .materials import hex_linear

W, H, FPS = 1080, 1920, 30


def reset(frames: int):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return configure(frames)


def configure(frames: int):
    """Render and timing settings; applied again after opening the phase-1 .blend (its own settings are not trusted)."""
    s = bpy.context.scene
    s.render.fps = FPS
    s.frame_start, s.frame_end = 0, frames
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = W, H, 100
    s.render.engine = "BLENDER_EEVEE"
    s.eevee.taa_render_samples = 64
    s.eevee.use_raytracing = True
    s.view_settings.view_transform = "AgX"
    for look in ("AgX - Punchy", "Punchy"):
        try:
            s.view_settings.look = look
            break
        except TypeError:
            pass
    # Blender 5: layered actions have no action.fcurves; the interpolation of new keys is a preference.
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    return s


def world(style: dict):
    """Vertical studio gradient from the channel style (Generated Z → ColorRamp); without it chrome renders black."""
    w = bpy.data.worlds.new("vg_world")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    span = nt.nodes.new("ShaderNodeMapRange")  # direction z −1…1 → 0…1
    span.inputs["From Min"].default_value, span.inputs["From Max"].default_value = -1.0, 1.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*hex_linear(style["background"]["bottom"]), 1)
    ramp.color_ramp.elements[1].color = (*hex_linear(style["background"]["top"]), 1)
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], span.inputs["Value"])
    nt.links.new(span.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0


def _sun(name, rot_deg, energy, color):
    d = bpy.data.lights.new(name, "SUN")
    d.energy = energy
    d.color = color
    o = bpy.data.objects.new(name, d)
    o.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    bpy.context.scene.collection.objects.link(o)
    return o


LIGHTING = {
    # Suns are scale-independent (product size varies from 1 mm to 30 cm).
    "key_rim_warm": [("key", (50, 10, 30), 4.5, (1.0, 0.95, 0.88)), ("rim", (110, 0, 200), 3.0, (1.0, 0.62, 0.3)), ("fill", (60, 0, -60), 0.8, (0.9, 0.92, 1.0))],
    "key_rim_cool": [("key", (50, 10, 30), 4.5, (0.96, 0.97, 1.0)), ("rim", (110, 0, 200), 3.0, (0.35, 0.6, 1.0)), ("fill", (60, 0, -60), 0.8, (1.0, 0.9, 0.8))],
    "soft_box": [("key", (40, 0, 20), 3.2, (1.0, 1.0, 1.0)), ("top", (5, 0, 0), 1.6, (1.0, 1.0, 1.0)), ("fill", (70, 0, -70), 1.2, (1.0, 1.0, 1.0))],
}


def lighting(preset: str):
    if preset not in LIGHTING:
        raise ValueError(f"bilinmeyen ışık: {preset}")
    return [_sun(f"vg_light_{n}", r, e, c) for n, r, e, c in LIGHTING[preset]]
