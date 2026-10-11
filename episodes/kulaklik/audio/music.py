"""Kulaklık videosu için 30 sn'lik müzik: klavye bölümünün müziğinin kendisi (kullanıcı tercihi, 120 BPM Am–F–C–G),
yalnızca bölüm zamanları kulaklık kurgusuna göre (stdlib, kendi üretimimiz → telif yok).

Farklar (ses kuralı): riser yok; hi-hat/clap gürültüsü tek kutuplu alçak geçirgenle yumuşatıldı (enerji ~1,5 kHz altı);
gürültü engelleme anında ("düz çizgi = sessizlik") müzik rampayla kısılıp geri gelir (GATE0–GATE1), tam sessizlik yok.
Her sesin atağı ≥ 2 ms, sonu rampayla kapanır; pad akor değişiminde 50 ms çapraz geçiş.
"""
import math
import random
import struct
import sys
import wave

SR = 48000
DUR = 30.0
N = int(SR * DUR)
BEAT = 0.5
random.seed(7)


def note(n):
    return 440.0 * 2 ** ((n - 69) / 12)


CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [33, 29, 36, 31]

DROP = 96 / 30                       # patlama
DIVE0, DIVE1 = 376 / 30, 424 / 30    # sürücüye dalış: kırılma
MECH0, MECH1 = 596 / 30, 664 / 30    # ses mekanizması: yarım tempo
GATE0, GATE1 = 766 / 30, 796 / 30    # gürültü engelleme: müzik kısılır ("sessizlik")
GATE_LVL = 0.42
END = 850 / 30                       # CTA: final akoru

L = [0.0] * N


def add(i, v):
    if 0 <= i < N:
        L[i] += v


def kick(t0, amp=0.9):
    D = 0.35
    for k in range(int(D * SR)):
        t = k / SR
        ph = 2 * math.pi * (45 * t + 110 * (1 - math.exp(-t * 28)) / 28)
        env = min(1.0, t / 0.002) * math.exp(-t * 7) * min(1.0, (D - t) * 40)
        add(int(t0 * SR) + k, amp * math.sin(ph) * env)


def soft_noise(t0, amp, dec, D, cut):
    """Alçak geçirgenden geçmiş gürültü vuruşu (yumuşak hat/clap)."""
    a = math.exp(-2 * math.pi * cut / SR)
    ys = [0.0] * 4
    for k in range(int(D * SR)):
        t = k / SR
        v = random.uniform(-1, 1)
        for j in range(4):           # 4 kutuplu alçak geçiren (-24 dB/oktav)
            ys[j] = a * ys[j] + (1 - a) * v
            v = ys[j]
        env = min(1.0, t / 0.005) * math.exp(-t * dec) * min(1.0, (D - t) * 60)
        add(int(t0 * SR) + k, amp * 11.0 * v * env)


def hat(t0, amp=0.12):
    soft_noise(t0, amp, 45, 0.08, 1500)


def clap(t0, amp=0.18):
    soft_noise(t0, amp, 20, 0.18, 1100)


def section_of(t):
    if t < DROP:
        return "intro"
    if DIVE0 <= t < DIVE1:
        return "break"
    if MECH0 <= t < MECH1:
        return "half"
    if t >= END:
        return "outro"
    return "full"


b = 0
while b * BEAT < DUR:
    t = b * BEAT
    s = section_of(t)
    if s == "full":
        kick(t, 0.8)
        hat(t + BEAT / 2, 0.14)
        if b % 2 == 1:
            clap(t)
    elif s == "half":
        if b % 4 == 0:
            kick(t, 0.7)
        if b % 4 == 2:
            clap(t, 0.14)
        hat(t + BEAT / 2, 0.08)
    elif s == "intro":
        if b % 2 == 0:
            kick(t, 0.65)
        hat(t + BEAT / 2, 0.09)
    elif s == "break":
        if b % 4 == 0:
            kick(t, 0.5)
        hat(t + BEAT / 2, 0.12)
        hat(t + BEAT / 4 * 3, 0.07)
    b += 1
kick(DROP, 0.55)


def gate(t):
    """GATE0–GATE1 arası rampalı kısma (giriş 0,25 sn, çıkış 0,35 sn)."""
    if t < GATE0 - 0.25 or t > GATE1 + 0.35:
        return 1.0
    if t < GATE0:
        u = (GATE0 - t) / 0.25
        return GATE_LVL + (1 - GATE_LVL) * (0.5 - 0.5 * math.cos(math.pi * u))
    if t <= GATE1:
        return GATE_LVL
    u = (t - GATE1) / 0.35
    return GATE_LVL + (1 - GATE_LVL) * (0.5 - 0.5 * math.cos(math.pi * u))


# davul tamponunu ayrı tut, pad/bas ekle, sonra kapıyı uygula
for i in range(N):
    t = i / SR
    bt = t / 2
    bar = int(bt) % 4
    frac = bt - int(bt)
    xf = min(1.0, frac * 2 / 0.05) if frac * 2 < 0.05 else 1.0   # akor geçişinde 50 ms
    s = section_of(t)
    pad = 0.0
    for chord, w in ((CHORDS[bar], xf), (CHORDS[(bar - 1) % 4], 1 - xf)):
        if w <= 0:
            continue
        for n in chord:
            f = note(n + 12)
            pad += w * (math.sin(2 * math.pi * f * t) + 0.3 * math.sin(4 * math.pi * f * t)
                        + 0.12 * math.sin(6 * math.pi * f * t))
    pad *= 0.022 * (0.8 + 0.2 * math.sin(2 * math.pi * 0.5 * t))
    if s == "intro":
        pad *= 0.9 + 0.1 * t / DROP
    if s == "outro":
        pad *= 1 - 0.55 * min(1.0, (t - END) / (DUR - END))
    bass = 0.0
    if s in ("full", "half", "intro", "break", "outro"):
        ph = (t / (BEAT / 2)) % 1
        env = (1 - math.exp(-ph * 30)) * math.exp(-ph * 2.5) * min(1.0, (1 - ph) * 25)
        f = note(ROOTS[bar])
        bass = (0.16 if s in ("full", "half") else 0.13) * env * (math.sin(2 * math.pi * f * t)
                                                               + 0.25 * math.sin(4 * math.pi * f * t))
        pb = (t % BEAT) / BEAT
        duck = 0.45 + 0.55 * min(1.0, pb * 3, (1 - pb) * 25)
        pad *= duck
    L[i] = (L[i] + pad + bass) * gate(t)
# son 40 ms sönüş
for k in range(int(0.04 * SR)):
    L[N - 1 - k] *= k / (0.04 * SR)

peak = max(abs(v) for v in L)
with wave.open(sys.argv[1], "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", int(32767 * 0.89 * v / peak)) for v in L))
