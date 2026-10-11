"""PS5 kolu efektleri — saf sinüs, stdlib.

Kural (kullanıcı tercihi): perdesi kayan efekt yok (riser, whoosh, süpürme), ani tiz/yüksek darbe yok.
Her ses **sabit perdeli**, 50–700 Hz bandında, atak ≥ 5 ms, yumuşak sönüş.

Kullanım: python3 sfx.py <anchors.json> <çıkış_klasörü>
  buzz.wav    kanca titreşimi (140 Hz, Blender'daki genlik dalgalanmasıyla aynı desen)
  stamp.wav   "YANLIŞ" damgası: yuvarlak 58 Hz gövde + 175 Hz
  pop.wav     etiket: 523 Hz yumuşak nota
  scan.wav    X-ray: 262 Hz sabit, yavaş açılıp kapanan ton
  cut.wav     kesit bıçağı: 392 Hz kısa nota
  thump.wav   vuruş: 70 Hz yumuşak darbe
  thrum.wav   aktüatör: hareketli kütlenin hızından 95 Hz genlik (30 sn, 0. kareye hizalı)
  motor.wav   tetik motoru: 190 Hz sabit vızıltı
  rewind.wav  geri sarma: 330 Hz kısa notalar (sabit perde)
  unlock.wav  kilit: 523 → 659 Hz iki nota
"""
import json
import math
import os
import struct
import sys
import wave

SR = 48000


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


def mix(*parts):
    n = max(len(p) for _, p in parts)
    out = [0.0] * n
    for off, p in parts:
        o = int(off * SR)
        for i, v in enumerate(p):
            if o + i < n:
                out[o + i] += v
    return out


def buzz():
    D = 1.52
    out = []
    for k in range(int(D * SR)):
        t = k / SR
        f = t * 30 + 1
        amp = (0.55 + 0.45 * abs(math.sin(f * 0.35))) * min(1.0, t * 12) * min(1.0, (D - t) * 30)
        ph = 2 * math.pi * 140 * t
        out.append(amp * (math.sin(ph) + 0.3 * math.sin(2 * ph)))
    return out


def stamp():
    a = tone(58, 0.7, attack=0.01, decay=5.0, h2=0.1, release=0.1)
    b = tone(175, 0.3, attack=0.008, decay=14.0, h2=0.0)
    return mix((0, a), (0, [0.5 * v for v in b]))


def scan():
    D = 2.0
    out = []
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t / 0.35) * min(1.0, (D - t) / 0.45)
        out.append(env * (math.sin(2 * math.pi * 262 * t) + 0.25 * math.sin(2 * math.pi * 392 * t)) * (0.85 + 0.15 * math.sin(2 * math.pi * 3 * t)))
    return out


def motor():
    D = 0.8
    out = []
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t / 0.06) * min(1.0, (D - t) / 0.12)
        ph = 2 * math.pi * 190 * t
        out.append(env * (math.sin(ph) + 0.35 * math.sin(2 * ph) + 0.12 * math.sin(3 * ph)))
    return out


def rewind():
    n = tone(330, 0.16, attack=0.008, decay=12.0)
    return mix(*[(i * 0.3, n) for i in range(5)])


def unlock():
    return mix((0, tone(523, 0.3, decay=9.0)), (0.1, tone(659, 0.3, decay=9.0)))


def thrum(mover):
    vel = [0.0] + [abs(mover[i] - mover[i - 1]) for i in range(1, len(mover))]
    vmax = max(vel) or 1.0
    out = []
    a_s = 0.0
    for k in range(int(30.0 * SR)):
        t = k / SR
        fi = t * 30
        i = int(fi)
        a = vel[i] + (vel[i + 1] - vel[i]) * (fi - i) if i + 1 < len(vel) else 0.0
        a_s += (a / vmax - a_s) * 0.004
        ph = 2 * math.pi * 95 * t
        out.append(a_s * (math.sin(ph) + 0.4 * math.sin(2 * ph)))
    return out


def main():
    anchors, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    mover = json.load(open(anchors))["mover"]
    files = {
        "buzz": buzz(),
        "stamp": stamp(),
        "pop": tone(523, 0.14, decay=18.0),
        "scan": scan(),
        "cut": tone(392, 0.25, decay=10.0),
        "thump": tone(70, 0.4, attack=0.01, decay=8.0, h2=0.1, release=0.08),
        "motor": motor(),
        "rewind": rewind(),
        "unlock": unlock(),
    }
    for name, data in files.items():
        write(os.path.join(outdir, f"{name}.wav"), data)
    write(os.path.join(outdir, "thrum.wav"), thrum(mover), gain=0.7)


main()
