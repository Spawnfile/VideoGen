"""Saat bölümü efektleri — saf sinüs, stdlib (ps5-kol/audio/sfx.py kalıbı).

Kural (kullanıcı tercihi): perdesi kayan efekt yok (riser, whoosh, süpürme), ani tiz/yüksek darbe yok.
Her ses **sabit perdeli**, 50–700 Hz, atak ≥ 5 ms, yumuşak sönüş. "Tik-tak" da yumuşak orta frekans sinüs:
tik 680 Hz, tak 620 Hz (+ alt oktav gövde), kısa ve yuvarlak.

Kullanım: python3 sfx.py <anchors.json> <çıkış_klasörü>
  ticks.wav   33 sn: kancada/çıkışta saniye ibresi (8/sn, çok hafif), raunt 1'de eşapman tikleri (yavaş çekim → gerçek hız),
              twist'te üst (8/sn) + alt (6/sn) tikler; etkin olmayan panelin tikleri kısık
  thrum.wav   33 sn: rotor salınımı — rotorun açısal hızından 110 Hz yumuşak uğultu (yalnız raunt 2)
  pop.wav     etiket: 523 Hz yumuşak nota
  thump.wav   geçiş: 70 Hz yumuşak darbe
  unlock.wav  kilit: 523 → 659 Hz iki nota
"""
import json
import math
import os
import struct
import sys
import wave

SR = 48000
DUR = 33.0
FPS = 30


def write(path, data, gain=0.89):
    peak = max(1e-9, max(abs(v) for v in data))
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(32767 * gain * v / peak)) for v in data))


def tone(f, D, attack=0.008, decay=6.0, h2=0.15, release=0.03):
    out = []
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t / attack) * math.exp(-t * decay) * min(1.0, (D - t) / release)
        out.append(env * (math.sin(2 * math.pi * f * t) + h2 * math.sin(4 * math.pi * f * t)))
    return out


def tick(f):
    """Yumuşak tik: sabit perde f + alt oktav gövde, 5 ms atak, ~60 ms."""
    D = 0.07
    out = []
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t / 0.005) * math.exp(-t * 55) * min(1.0, (D - t) / 0.02)
        out.append(env * (math.sin(2 * math.pi * f * t) + 0.5 * math.sin(math.pi * f * t)))
    return out


def place(buf, snd, t0, amp):
    o = int(t0 * SR)
    for i, v in enumerate(snd):
        if 0 <= o + i < len(buf):
            buf[o + i] += amp * v


def gain_at(r, pts):
    """Parçalı doğrusal kazanç (Remotion karesi)."""
    if r <= pts[0][0]:
        return pts[0][1]
    for (a, ga), (b, gb) in zip(pts, pts[1:]):
        if a <= r <= b:
            return ga + (gb - ga) * (r - a) / (b - a)
    return pts[-1][1]


def main():
    anchors, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    d = json.load(open(anchors))
    T = d["timeline"]
    n = int(DUR * SR)
    tk, tk2 = tick(680), tick(620)

    ticks = [0.0] * n
    # saniye ibresi (tam ekran): 8/sn, çok hafif; dalışta ve son kareye doğru söner
    per = FPS / 8
    for side, (a, b) in (("in", (0, T["DIVE"][1])), ("out", (884, 989))):
        k = 0
        r = a
        while r <= b:
            g = 0.22 * gain_at(r, [(0, 0.7), (40, 1.0), (T["DIVE"][1] - 10, 1.0), (T["DIVE"][1], 0.0)] if side == "in"
                               else [(884, 0.0), (912, 0.0), (930, 0.8), (989, 0.7)])
            place(ticks, tk if k % 2 == 0 else tk2, r / FPS, g)
            k += 1
            r += per
    # üst panel (İsviçre) tikleri
    top_g = [(96, 0.0), (T["R1"][0], 0.0), (T["R1"][0] + 6, 1.0), (T["R2"][0] - 6, 1.0), (T["R2"][0] + 6, 0.18),
             (T["SCORE"][1], 0.18), (T["SWAP"] - 4, 0.18), (T["SWAP"] + 4, 0.8), (T["MERGE"][0], 0.8), (T["MERGE"][1], 0.0)]
    for i, t in enumerate(d["ticksTop"]):
        g = gain_at(t, top_g)
        # yavaş çekimde tik daha dolgun, gerçek hızda (8/sn) daha kısık
        g *= 0.85 if t < T["SLOW_END"] else 0.55
        if g > 0.01:
            place(ticks, tk if i % 2 == 0 else tk2, t / FPS, g)
    # alt panel (twist): 6/sn, biraz daha pes
    lo1, lo2 = tick(600), tick(560)
    for i, t in enumerate(d["ticksBot"]):
        g = 0.5 * gain_at(t, [(T["SWAP"], 0.0), (T["SWAP"] + 6, 1.0), (T["MERGE"][0], 1.0), (T["MERGE"][1], 0.0)])
        if g > 0.01:
            place(ticks, lo1 if i % 2 == 0 else lo2, t / FPS, g)
    write(os.path.join(outdir, "ticks.wav"), ticks, gain=0.8)

    # rotor uğultusu: açısal hız → genlik (yumuşatılmış), yalnız raunt 2
    rot = [abs(v) for v in d["rotorDir"]]
    vmax = max(rot[T["R2"][0]:T["R2"][1]]) or 1.0
    out, a_s = [], 0.0
    for k in range(n):
        t = k / SR
        fi = t * FPS
        i = min(int(fi), len(rot) - 2)
        a = rot[i] + (rot[i + 1] - rot[i]) * (fi - i)
        a *= gain_at(fi, [(T["R2"][0], 0.0), (T["R2"][0] + 8, 1.0), (T["R2"][1] - 8, 1.0), (T["R2"][1], 0.0)])
        a_s += (a / vmax - a_s) * 0.003
        ph = 2 * math.pi * 110 * t
        out.append(a_s * (math.sin(ph) + 0.3 * math.sin(2 * ph)))
    write(os.path.join(outdir, "thrum.wav"), out, gain=0.6)

    write(os.path.join(outdir, "pop.wav"), tone(523, 0.14, decay=18.0))
    write(os.path.join(outdir, "thump.wav"), tone(70, 0.4, attack=0.01, decay=8.0, h2=0.1, release=0.08))
    unlock = [0.0] * int(0.45 * SR)
    place(unlock, tone(523, 0.3, decay=9.0), 0, 1)
    place(unlock, tone(659, 0.3, decay=9.0), 0.1, 1)
    write(os.path.join(outdir, "unlock.wav"), unlock)


main()
