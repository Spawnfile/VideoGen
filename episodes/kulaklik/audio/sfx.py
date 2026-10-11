"""Kulaklık bölümü efektleri — saf sinüs, stdlib (asma-kilit/audio/sfx.py kalıbı).

Kural (kullanıcı tercihi): perdesi kayan efekt yok (riser, whoosh, süpürme, tape-stop), ani tiz/yüksek darbe yok
(ding, metal çarpma, 2 kHz+ tık yok), gerçek gürültü yok. Her ses **sabit perdeli**, 50–700 Hz, atak ≥ 5 ms.
İlk 5 sn efekt yok (yalnız müzik) → kancadaki kapak açılışı sessiz; kapanış "pıt"ı sonda.

Kullanım: python3 sfx.py <anchors.json> <çıkış_klasörü>
  pop.wav     etiket: 523 Hz yumuşak nota
  thump.wav   geçiş (dalış, sürücü ayrılması): 70 Hz yumuşak darbe
  drive.wav   30 sn: mekanizmada diyafram hareketine birebir senkron 196 Hz "ses" (genlik = |hız|, anchors.json vib)
  seat.wav    kulaklık mıknatısla yuvaya oturur: 330 Hz + 165 Hz kısa "tık"
  lid.wav     kapak kapanır "pıt": 440 Hz + 220 Hz gövde, 8 ms atak
  tap.wav     parça yağmuru: 294 Hz yumuşak dokunuş
  cta.wav     CTA: 523 → 659 Hz iki nota
"""
import json
import math
import os
import struct
import sys
import wave

SR = 48000
DUR = 30.0
FPS = 30


def write(path, data, gain=0.89):
    peak = max(1e-9, max(abs(v) for v in data))
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(32767 * gain * v / peak)) for v in data))


def tone(f, D, attack=0.008, decay=6.0, h2=0.15, release=0.03, sub=0.0):
    out = []
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t / attack) * math.exp(-t * decay) * min(1.0, (D - t) / release)
        out.append(env * (math.sin(2 * math.pi * f * t) + h2 * math.sin(4 * math.pi * f * t)
                          + sub * math.sin(math.pi * f * t)))
    return out


def place(buf, snd, t0, amp):
    o = int(t0 * SR)
    for i, v in enumerate(snd):
        if 0 <= o + i < len(buf):
            buf[o + i] += amp * v


def main():
    anchors, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    d = json.load(open(anchors))
    n = int(DUR * SR)
    # mekanizma: diyaframın her kare konumundan hız → 196 Hz sinüs genliği (yumuşatılmış)
    vib, v0 = d["vib"], d["vib0"]
    speed = [0.0] + [abs(vib[i] - vib[i - 1]) for i in range(1, len(vib))]
    mx = max(speed) or 1
    drive = [0.0] * n
    env = 0.0
    a = math.exp(-1 / (0.012 * SR))
    for k in range(int((v0 - 2) / FPS * SR), min(n, int((v0 + len(vib) + 4) / FPS * SR))):
        t = k / SR
        fr = t * FPS - v0
        j = int(fr)
        target = (speed[j] / mx) if 0 <= j < len(speed) else 0.0
        env = a * env + (1 - a) * target
        drive[k] = env * (math.sin(2 * math.pi * 196 * t) + 0.2 * math.sin(2 * math.pi * 392 * t))
    write(os.path.join(outdir, "drive.wav"), drive, gain=0.7)
    write(os.path.join(outdir, "pop.wav"), tone(523, 0.14, decay=18.0))
    write(os.path.join(outdir, "thump.wav"), tone(70, 0.4, attack=0.01, decay=8.0, h2=0.1, release=0.08))
    seat = [0.0] * int(0.2 * SR)
    place(seat, tone(330, 0.12, attack=0.006, decay=30.0, h2=0.1, release=0.02, sub=0.6), 0, 1)
    write(os.path.join(outdir, "seat.wav"), seat)
    write(os.path.join(outdir, "lid.wav"), tone(440, 0.1, attack=0.008, decay=38.0, h2=0.1, release=0.02, sub=0.7))
    write(os.path.join(outdir, "tap.wav"), tone(294, 0.09, attack=0.006, decay=40.0, h2=0.1, release=0.02, sub=0.4))
    cta = [0.0] * int(0.45 * SR)
    place(cta, tone(523, 0.3, decay=9.0), 0, 1)
    place(cta, tone(659, 0.3, decay=9.0), 0.1, 1)
    write(os.path.join(outdir, "cta.wav"), cta)


main()
