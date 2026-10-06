"""Material presets (spec §7.3): physically plausible, with subtle wear (noise bump) so CG does not look plastic-perfect."""
import bpy


def hex_linear(h: str) -> tuple:
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


# name: (base hex, metallic, roughness, coat, alpha, bump strength, emission hex or None)
PRESETS = {
    "brass": ("#d9a441", 1.0, 0.22, 0.0, 1.0, 0.05, None),
    "chrome": ("#e6e8ec", 1.0, 0.08, 0.0, 1.0, 0.0, None),
    "steel": ("#b8bec7", 1.0, 0.28, 0.0, 1.0, 0.08, None),
    "aluminum": ("#c9ccd1", 1.0, 0.35, 0.0, 1.0, 0.12, None),
    "copper": ("#c46a3b", 1.0, 0.25, 0.0, 1.0, 0.05, None),
    "abs_matte": ("#2a2d34", 0.0, 0.7, 0.0, 1.0, 0.1, None),
    "abs_gloss": ("#1f6bff", 0.0, 0.28, 0.6, 1.0, 0.02, None),
    "pc_clear": ("#eef3f8", 0.0, 0.08, 0.0, 0.2, 0.0, None),
    "rubber": ("#1c1d20", 0.0, 0.85, 0.0, 1.0, 0.15, None),
    "pcb_green": ("#1f5e3a", 0.0, 0.45, 0.3, 1.0, 0.05, None),
    "ink": ("#2350e8", 0.0, 0.2, 0.0, 1.0, 0.0, "#08144f"),
    "paper": ("#f1ede4", 0.0, 0.9, 0.0, 1.0, 0.1, None),
    "ceramic": ("#f4f2ee", 0.0, 0.3, 0.4, 1.0, 0.02, None),
}


def material(preset: str) -> bpy.types.Material:
    """One shared datablock per preset (named vg_<preset>)."""
    if preset not in PRESETS:
        raise ValueError(f"bilinmeyen malzeme: {preset} (seçenekler: {', '.join(sorted(PRESETS))})")
    name = f"vg_{preset}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    base, metallic, rough, coat, alpha, bump, emission = PRESETS[preset]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*hex_linear(base), 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = rough
    p.inputs["Coat Weight"].default_value = coat
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = True
    if emission:
        p.inputs["Emission Color"].default_value = (*hex_linear(emission), 1)
        p.inputs["Emission Strength"].default_value = 1.0
    if bump > 0:
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 180.0
        b = nt.nodes.new("ShaderNodeBump")
        b.inputs["Strength"].default_value = bump
        nt.links.new(noise.outputs["Fac"], b.inputs["Height"])
        nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    return m
