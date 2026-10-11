"""Enigma bölümü efektleri — saf sinüs, stdlib (kulaklik/audio/sfx.py kalıbı).

Kural: perdesi kayan efekt yok (riser, whoosh, süpürme), ani tiz darbe yok, gerçek gürültü yok. Her ses sabit perdeli,
50–700 Hz, atak ≥ 5 ms. İlk 2 sn efekt yok (yalnız ses + müzik).
  key.wav    tuş basışı: 180 Hz + 90 Hz kısa gövde
  lamp.wav   lamba yanar: 392 Hz yumuşak nota
  step.wav   rotor bir adım: 294 Hz kısa "tık"
  pop.wav    etiket: 523 Hz
  thump.wav  patlatma / dalış: 70 Hz
  no.wav     ✕ damgası: 196 Hz
  yes.wav    ✓: 587 Hz
  cta.wav    CTA: 523 → 659 Hz
"""
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


out = sys.argv[1]
os.makedirs(out, exist_ok=True)
write(os.path.join(out, "key.wav"), tone(180, 0.12, attack=0.006, decay=34.0, h2=0.1, release=0.02, sub=0.6))
write(os.path.join(out, "lamp.wav"), tone(392, 0.22, attack=0.01, decay=12.0))
write(os.path.join(out, "step.wav"), tone(294, 0.07, attack=0.005, decay=50.0, h2=0.1, release=0.015))
write(os.path.join(out, "pop.wav"), tone(523, 0.14, decay=18.0))
write(os.path.join(out, "thump.wav"), tone(70, 0.4, attack=0.01, decay=8.0, h2=0.1, release=0.08))
write(os.path.join(out, "no.wav"), tone(196, 0.25, attack=0.008, decay=10.0, h2=0.2, release=0.04))
write(os.path.join(out, "yes.wav"), tone(587, 0.25, attack=0.008, decay=10.0))
cta = [0.0] * int(0.45 * SR)
place(cta, tone(523, 0.3, decay=9.0), 0, 1)
place(cta, tone(659, 0.3, decay=9.0), 0.1, 1)
write(os.path.join(out, "cta.wav"), cta)
