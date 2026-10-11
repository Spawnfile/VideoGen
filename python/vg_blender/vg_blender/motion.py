"""Pure timing math shared by the build (no bpy): easing, explode offsets, camera interpolation, lens → vertical FOV."""
import math

EASES = ("linear", "ease_in", "ease_out", "ease_in_out", "back_out")


def ease(kind: str, x: float) -> float:
    x = min(1.0, max(0.0, x))
    if kind == "linear":
        return x
    if kind == "ease_in":
        return x * x * x
    if kind == "ease_out":
        return 1 - (1 - x) ** 3
    if kind == "ease_in_out":
        return 4 * x * x * x if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2
    if kind == "back_out":
        c1 = 1.70158
        c3 = c1 + 1
        return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
    raise ValueError(f"bilinmeyen ease: {kind}")


def _progress(seg: dict, t: float) -> float:
    if t <= seg["t_start"]:
        return 0.0
    if t >= seg["t_end"]:
        return 1.0
    return ease(seg["ease"], (t - seg["t_start"]) / (seg["t_end"] - seg["t_start"]))


def explode_offset(explode: dict, t: float) -> tuple:
    """Offset (cm) of a part at time t (s): 0 before t_start, the full vector after t_end; with `back` it returns to 0 across
    back.t_start..t_end (YAKLASIM spec Y12: the snap). A negative t_start means the burst is already under way at frame 0."""
    k = _progress(explode, t)
    back = explode.get("back")
    if back:
        k *= 1.0 - _progress(back, t)
    return tuple(v * k for v in explode["vector"])


def spin_angle(spin, t: float) -> float:
    """Degrees a part has turned about its local axis at time t (YAKLASIM spec Y12: the mechanism's real motion)."""
    if not spin:
        return 0.0
    return spin["degrees"] * _progress(spin, t)


def _lerp(a, b, k):
    return tuple(x + (y - x) * k for x, y in zip(a, b))


def camera_at(keys: list, t: float) -> dict:
    """Position, target and lens at time t; the easing of key i shapes the segment i → i+1."""
    if t <= keys[0]["t"]:
        k0 = keys[0]
        return {"position": tuple(k0["position"]), "target": tuple(k0["target"]), "lens_mm": k0["lens_mm"]}
    for a, b in zip(keys, keys[1:]):
        if t <= b["t"]:
            k = ease(a["ease"], (t - a["t"]) / (b["t"] - a["t"]))
            return {"position": _lerp(a["position"], b["position"], k), "target": _lerp(a["target"], b["target"], k), "lens_mm": a["lens_mm"] + (b["lens_mm"] - a["lens_mm"]) * k}
    kl = keys[-1]
    return {"position": tuple(kl["position"]), "target": tuple(kl["target"]), "lens_mm": kl["lens_mm"]}


def yfov(lens_mm: float, sensor_mm: float = 36.0) -> float:
    """Portrait frame, sensor_fit AUTO: the sensor spans the vertical side (matches packages/shared yfovFromLens)."""
    return 2 * math.atan(sensor_mm / 2 / lens_mm)
