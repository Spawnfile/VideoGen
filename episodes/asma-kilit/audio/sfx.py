"""Asma kilit bölümü efektleri — saf sinüs, stdlib (saat/ps5-kol sfx.py kalıbı).

Kural (kullanıcı tercihi): perdesi kayan efekt yok (riser, whoosh, süpürme, tape-stop), ani tiz/yüksek darbe yok
(ding, metal çarpma, 2 kHz+ tık yok). Her ses **sabit perdeli**, 50–700 Hz, atak ≥ 5 ms, yumuşak sönüş.
Kilit "klik"i ve pim sesleri de yumuşak orta frekans sinüs.

Kullanım: python3 sfx.py <anchors.json> <çıkış_klasörü>
  pins.wav    33 sn: anahtar kayarken pim her diş tepesinden çentiğe düştüğünde yumuşak 300 Hz "tık" (anchors.json pinB)
  pop.wav     etiket: 523 Hz yumuşak nota
  thump.wav   geçiş: 70 Hz yumuşak darbe
  check.wav   pim hizalandı ✓: 587 Hz kısa nota
  fail.wav    pim takıldı ✕: 196 Hz iki boğuk vuruş
  click.wav   silindir döner "klik": 440 Hz + 220 Hz gövde, 8 ms atak, kısa
  unlock.wav  U kol açılır: 523 → 659 Hz iki nota
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
    # pim tıkları: pim alt ucu bir karede ≥0,35 mm düşerse (diş tepesinden çentiğe) tık; aynı karede birden çoksa tek
    tap = tone(300, 0.07, attack=0.005, decay=45.0, h2=0.1, release=0.02, sub=0.5)
    pins = [0.0] * n
    r0 = d["pinB0"]
    events = {}
    for i, track in enumerate(d["pinB"]):
        for j in range(1, len(track)):
            drop = track[j - 1] - track[j]
            if drop >= 0.35:
                r = r0 + j
                events[r] = max(events.get(r, 0), min(1.0, 0.5 + drop / 3))
    last = -9
    for r in sorted(events):
        if r - last < 2:
            continue
        place(pins, tap, r / FPS, events[r])
        last = r
    write(os.path.join(outdir, "pins.wav"), pins, gain=0.7)
    write(os.path.join(outdir, "pop.wav"), tone(523, 0.14, decay=18.0))
    write(os.path.join(outdir, "thump.wav"), tone(70, 0.4, attack=0.01, decay=8.0, h2=0.1, release=0.08))
    write(os.path.join(outdir, "check.wav"), tone(587, 0.16, decay=16.0, h2=0.1))
    fail = [0.0] * int(0.4 * SR)
    place(fail, tone(196, 0.16, attack=0.01, decay=14.0, h2=0.2, sub=0.3), 0, 1)
    place(fail, tone(185, 0.2, attack=0.01, decay=12.0, h2=0.2, sub=0.3), 0.15, 1)
    write(os.path.join(outdir, "fail.wav"), fail)
    write(os.path.join(outdir, "click.wav"), tone(440, 0.09, attack=0.008, decay=40.0, h2=0.1, release=0.02, sub=0.6))
    unlock = [0.0] * int(0.45 * SR)
    place(unlock, tone(523, 0.3, decay=9.0), 0, 1)
    place(unlock, tone(659, 0.3, decay=9.0), 0.1, 1)
    write(os.path.join(outdir, "unlock.wav"), unlock)
    print("pim tıkları:", len(events))


main()
