"""Müziği konuşmanın altında sidechain ile kıs (atak 80 ms, bırakma 250 ms, −10 dB).
Kullanım: ../tts/run.sh audio/duck.py remotion/public/sfx/music.wav remotion/public/vo/vo.wav remotion/public/sfx/music_duck.wav"""
import sys
import wave

import numpy as np

SR = 48000
DUCK_DB = -10.0


def read(p):
    with wave.open(p) as w:
        assert w.getframerate() == SR, p
        return np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float64) / 32767


music, vo = read(sys.argv[1]), read(sys.argv[2])
n = len(music)
vo = np.pad(vo, (0, max(0, n - len(vo))))[:n]
# konuşma var/yok: 10 ms pencerelerde RMS > −40 dBFS
win = SR // 100
rms = np.sqrt(np.convolve(vo ** 2, np.ones(win) / win, mode="same"))
active = (rms > 10 ** (-40 / 20)).astype(np.float64)
env = np.zeros(n)
a_att = np.exp(-1 / (0.080 * SR))
a_rel = np.exp(-1 / (0.250 * SR))
e = 0.0
for i in range(n):        # tek kutuplu izleyici (atak/bırakma ayrı)
    x = active[i]
    a = a_att if x > e else a_rel
    e = a * e + (1 - a) * x
    env[i] = e
gain = 1 - (1 - 10 ** (DUCK_DB / 20)) * env
out = music * gain
with wave.open(sys.argv[3], "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
print(f"duck: konuşmalı oran {active.mean():.2f}, min kazanç {20 * np.log10(gain.min()):.1f} dB")
