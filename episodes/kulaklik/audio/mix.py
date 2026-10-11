"""Remotion <Audio> yerleşimini taklit eden ölçüm miksi (render öncesi ebur128 + spektrum için).
Kullanım: python3 audio/mix.py remotion/public/sfx out.wav"""
import struct, sys, wave
D, OUT = sys.argv[1], sys.argv[2]
SR, N = 48000, 48000 * 30
def load(n):
    w = wave.open(f"{D}/{n}")
    assert w.getframerate() == SR, n
    raw = w.readframes(w.getnframes())
    return [v / 32768 for v in struct.unpack(f"<{len(raw)//2}h", raw)]
buf = [0.0] * N
def put(n, frame, vol):
    o = int(frame / 30 * SR)
    for i, v in enumerate(load(n)):
        if 0 <= o + i < N:
            buf[o + i] += v * vol
put("music.wav", 0, 0.42); put("drive.wav", 0, 0.2)
for i in range(9): put("pop.wav", 152 + 20 * i, 0.32)
for i in range(5): put("pop.wav", 460 + 18 * i, 0.32)
put("thump.wav", 378, 0.35); put("thump.wav", 424, 0.3)
for i in range(8): put("tap.wav", 814 + 4 * i, 0.22 + (i % 3) * 0.05)
put("seat.wav", 838, 0.42); put("lid.wav", 855, 0.42); put("cta.wav", 852, 0.28)
with wave.open(OUT, "w") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(v * 32767)))) for v in buf))
