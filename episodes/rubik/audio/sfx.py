"""Rubik bölümü efektleri — saf sinüs, stdlib (kulaklik/audio/sfx.py kalıbı).

Kural: sabit perdeli, 50–700 Hz, atak ≥ 5 ms; riser/whoosh/tiz darbe yok. İlk 5 sn efekt yok (yalnız müzik).
  snap.wav  parça kenetlenir "şak": 330 Hz + 165 Hz gövde, kısa
  tap.wav   karıştırmada katman dönüşü: 294 Hz yumuşak dokunuş
  land.wav  final kenetlenme: 70 Hz darbe + 220/440 Hz "tık"
Kullanım: python3 audio/sfx.py <çıkış_klasörü>
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


def tone(parts, D, attack=0.006, decay=14.0, release=0.02):
    out = []
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t / attack) * math.exp(-t * decay) * min(1.0, (D - t) / release)
        out.append(env * sum(a * math.sin(2 * math.pi * f * t) for f, a in parts))
    return out


out = sys.argv[1]
os.makedirs(out, exist_ok=True)
write(os.path.join(out, "snap.wav"), tone([(330, 1.0), (165, 0.6), (660, 0.12)], 0.14, decay=22))
write(os.path.join(out, "tap.wav"), tone([(294, 1.0), (147, 0.4)], 0.12, attack=0.008, decay=20))
land = tone([(70, 1.0), (140, 0.3)], 0.5, attack=0.006, decay=8)
click = tone([(440, 0.45), (220, 0.6)], 0.16, decay=18)
write(os.path.join(out, "land.wav"), [a + (click[i] if i < len(click) else 0) for i, a in enumerate(land)])
