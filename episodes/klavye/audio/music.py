"""Klavye videosu için 28 sn'lik, kurguya senkron sentez müzik (stdlib, CC0 - kendi üretimimiz).

120 BPM: 1 vuruş = 0.5 sn = 15 kare. Bölümler kare zamanlarına göre ayarlı.
"""
import math, random, struct, wave, sys

SR = 44100
DUR = 28.0
N = int(SR * DUR)
BEAT = 0.5
random.seed(7)

def note(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)

# akorlar (her biri 1 ölçü = 2 sn): Am F C G
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [33, 29, 36, 31]

DROP = 76 / 30            # patlama
DIVE0, DIVE1 = 345 / 30, 405 / 30   # kırılma + riser
MECH0, MECH1 = 590 / 30, 705 / 30   # mekanizma: yarım tempo
END = 800 / 30            # final akoru

L = [0.0] * N

def add(i, v):
    if 0 <= i < N:
        L[i] += v

def kick(t0, amp=0.9):
    for k in range(int(0.35 * SR)):
        t = k / SR
        f = 45 + 110 * math.exp(-t * 28)
        ph = 2 * math.pi * (45 * t + 110 * (1 - math.exp(-t * 28)) / 28)
        add(int(t0 * SR) + k, amp * math.sin(ph) * math.exp(-t * 7))

def hat(t0, amp=0.12, dec=60):
    prev = 0.0
    for k in range(int(0.08 * SR)):
        t = k / SR
        x = random.uniform(-1, 1)
        hp = x - prev; prev = x
        add(int(t0 * SR) + k, amp * hp * math.exp(-t * dec))

def clap(t0, amp=0.18):
    for k in range(int(0.18 * SR)):
        t = k / SR
        env = math.exp(-t * 22) * (1 if t > 0.012 or int(t * 1000) % 4 < 2 else 0.3)
        add(int(t0 * SR) + k, amp * random.uniform(-1, 1) * env)

def section_of(t):
    if t < DROP: return "intro"
    if DIVE0 <= t < DIVE1: return "break"
    if MECH0 <= t < MECH1: return "half"
    if t >= END: return "outro"
    return "full"

# davul
b = 0
while b * BEAT < DUR:
    t = b * BEAT
    s = section_of(t)
    if s == "full":
        kick(t)
        hat(t + BEAT / 2, 0.14)
        if b % 2 == 1: clap(t)
    elif s == "half":
        if b % 4 == 0: kick(t, 0.8)
        if b % 4 == 2: clap(t, 0.14)
        hat(t + BEAT / 2, 0.08)
    elif s == "intro":
        hat(t + BEAT / 2, 0.05)
    elif s == "break":
        hat(t + BEAT / 2, 0.1)
        hat(t + BEAT / 4 * 3, 0.06)
    b += 1
kick(DROP, 1.0)            # drop vuruşu
kick(DIVE1, 1.0)           # dalış sonrası geri giriş
kick(MECH1, 1.0)

# bas + pad
for i in range(N):
    t = i / SR
    bar = int(t / 2) % 4
    s = section_of(t)
    # pad: yumuşak testere yerine birkaç harmonikli sinüs, yavaş tremolo
    pad = 0.0
    for n in CHORDS[bar]:
        f = note(n + 12)
        pad += math.sin(2 * math.pi * f * t) + 0.3 * math.sin(4 * math.pi * f * t) + 0.12 * math.sin(6 * math.pi * f * t)
    pad *= 0.022 * (0.8 + 0.2 * math.sin(2 * math.pi * 0.5 * t))
    if s == "intro":
        pad *= 0.5 + 0.5 * t / DROP
    if s == "outro":
        pad *= max(0.0, 1 - (t - END) / (DUR - END)) ** 0.5
    # bas: sekizlik nabız, sidechain hissi
    bass = 0.0
    if s in ("full", "half"):
        ph = (t / (BEAT / 2)) % 1
        env = (1 - math.exp(-ph * 30)) * math.exp(-ph * 2.5)
        f = note(ROOTS[bar])
        bass = 0.16 * env * (math.sin(2 * math.pi * f * t) + 0.25 * math.sin(4 * math.pi * f * t))
        duck = 0.45 + 0.55 * min(1.0, ((t % BEAT) / BEAT) * 3)
        pad *= duck
    L[i] += pad + bass

# riser'lar: drop ve dalış sonrası
def riser(t0, t1, amp=0.15):
    prev = 0.0
    for i in range(int(t0 * SR), int(t1 * SR)):
        u = (i / SR - t0) / (t1 - t0)
        x = random.uniform(-1, 1)
        hp = x - prev * (0.98 - 0.6 * u); prev = x
        add(i, amp * u * u * hp * 0.5 + amp * 0.4 * u * u * math.sin(2 * math.pi * (300 + 900 * u) * i / SR))
riser(DROP - 1.6, DROP)
riser(DIVE0, DIVE1, 0.3)
riser(MECH1 - 1.2, MECH1, 0.1)

peak = max(abs(v) for v in L)
with wave.open(sys.argv[1], "w") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", int(32767 * 0.89 * v / peak)) for v in L))
