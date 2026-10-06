"""Örnek ürün: tükenmez kalem (5 parça). vg_blender API'sinin referans kullanımı; K19 seçenek görselleri ve test fixture'ları bundan üretilir."""
import math


def build(vg):
    # Gövde: alt uçta konik, üstte kapalı ince lathe (1 birim = 1 cm, Z boyunca).
    body = vg.lathe([(0.20, 0.9), (0.42, 2.2), (0.42, 13.6), (0.30, 14.0), (0.0, 14.05)], steps=6, sharp_deg=20)
    grip = vg.tube(0.46, 0.42, 3.0).move(z=3.8).material("rubber")
    vg.part("govde", body, grip)

    tube = vg.tube(0.15, 0.11, 11.0, steps=32).move(z=6.6)
    ink = vg.cylinder(0.105, 7.5, steps=32).move(z=4.85).material("ink")
    vg.part("murekkep-haznesi", tube, ink)

    tip = vg.lathe([(0.0, 0.0), (0.06, 0.05), (0.11, 0.6), (0.11, 1.1), (0.0, 1.1)], steps=48)
    vg.part("uc-yuvasi", tip)

    vg.part("bilye", vg.sphere(0.035, segments=24))

    vg.part("yay", vg.spring(0.18, 0.02, 12, 1.8).move(z=1.2))
    _ = math.pi
