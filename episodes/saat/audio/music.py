"""Saat videosu (bölüm 5) için 33 sn'lik (ps5-kol müziğinin kendisi, bölüm zamanları yeni kurguya göre) chill lo-fi altlık (stdlib, kendi üretimimiz → telif yok).

90 BPM (1 vuruş = 2/3 sn = 20 kare). CPU/klavye ailesi: Rhodes akorları, yumuşak pad, sinüs bas, yumuşak kick,
tahta blok, sinüs tık, çan arpeji. **Gürültü kaynağı yok.** Kullanıcı kuralı: riser/kabarma/süpürme yok, tiz ani ses yok
(çanlar orta oktavda, tık 1,4 kHz yumuşak, pad genliği sabit). Bu bölümün farkı: damgadan önce 0,2 sn sessizlik
+ yumuşak darbe, hafif swing.
Kullanım: python3 music.py out.wav
"""
import math
import struct
import sys
import wave

SR = 48000
DUR = 33.0
N = int(SR * DUR)
BEAT = 2 / 3
BAR = 4 * BEAT
SWING = 0.06  # sekizlik swing (sn)


def fr(f):  # Remotion karesi → sn
    return f / 30


def note(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# Dm9 – Bbmaj7 – Fmaj7 – C6 (CPU'daki Am7–F–C–G'nin kardeşi)
CHORDS = [[62, 65, 69, 72, 76], [58, 62, 65, 69], [53, 57, 60, 64], [60, 64, 67, 69]]
ROOTS = [38, 34, 41, 36]

GAP0, HIT = fr(97), fr(104)          # dalış: kısa nefes → ekran bölünür
BREAK0, BREAK1 = fr(752), fr(790)    # yalnız "kalbi ne?" sorusu: davul çekilir
CALM0, CALM1 = fr(120), fr(296)      # yavaş çekim tik anatomisi: hafif
REW0, REW1 = fr(890), fr(912)        # paneller kapanır
OUTRO = fr(914)

L = [0.0] * N


def add(i, v):
    if 0 <= i < N:
        L[i] += v


def section(t):
    if t < GAP0:
        return "intro"
    if t < HIT:
        return "gap"
    if BREAK0 <= t < BREAK1:
        return "break"
    if CALM0 <= t < CALM1:
        return "calm"
    if REW0 <= t < REW1:
        return "rewind"
    if t >= OUTRO:
        return "outro"
    return "full"


def kick(t0, amp=0.5):
    D = 0.32
    for k in range(int(D * SR)):
        t = k / SR
        ph = 2 * math.pi * (48 * t + 70 * (1 - math.exp(-t * 22)) / 22)
        env = min(1.0, t * 250) * math.exp(-t * 10) * min(1.0, (D - t) * 40)
        add(int(t0 * SR) + k, amp * math.sin(ph) * env)


def block(t0, amp=0.07):
    D = 0.07
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t * 500) * math.exp(-t * 60) * min(1.0, (D - t) * 40)
        add(int(t0 * SR) + k, amp * env * (math.sin(2 * math.pi * 760 * t) + 0.6 * math.sin(2 * math.pi * 1240 * t)))


def tick(t0, amp=0.02):
    D = 0.045
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t * 250) * math.exp(-t * 90) * min(1.0, (D - t) * 40)
        add(int(t0 * SR) + k, amp * env * math.sin(2 * math.pi * 1400 * t))


def epiano(t0, midis, dur=1.4, amp=0.05, reverse=False):
    """Rhodes benzeri; reverse=True → zarf ters (yavaşça kabarır, aniden değil yumuşakça biter)."""
    for n in midis:
        f = note(n)
        for k in range(int(dur * SR)):
            t = k / SR
            if reverse:
                tt = dur - t
                env = min(1.0, t * 30) * math.exp(-tt * 2.2) * min(1.0, tt * 25)
            else:
                env = min(1.0, t * 60) * math.exp(-t * 1.8) * min(1.0, (dur - t) * 8)
            v = math.sin(2 * math.pi * f * t) + 0.18 * math.sin(4 * math.pi * f * t) * (0.5 if reverse else math.exp(-t * 6))
            v *= 0.85 + 0.15 * math.sin(2 * math.pi * 4.0 * t)
            add(int(t0 * SR) + k, amp * env * v)


def bell(t0, midi, amp=0.03):
    f = note(midi)
    D = 0.6
    for k in range(int(D * SR)):
        t = k / SR
        env = min(1.0, t * 300) * math.exp(-t * 6) * min(1.0, (D - t) * 40)
        add(int(t0 * SR) + k, amp * env * math.sin(2 * math.pi * f * t))


def bass(t0, midi, dur, amp=0.16):
    f = note(midi)
    for k in range(int(dur * SR)):
        t = k / SR
        env = min(1.0, t * 40) * min(1.0, (dur - t) * 20) * math.exp(-t * 0.6)
        add(int(t0 * SR) + k, amp * env * (math.sin(2 * math.pi * f * t) + 0.12 * math.sin(4 * math.pi * f * t)))


# ---------------------------------------------------------------- vuruş vuruş
b = 0
while b * BEAT < DUR:
    t = b * BEAT
    s = section(t)
    bar = int(t / BAR) % 4
    bib = b % 4
    ch = CHORDS[bar]
    off = BEAT / 2 + SWING
    if s == "gap":
        b += 1
        continue
    if bib == 0:
        epiano(t, ch, dur=2.2, amp=0.042 if s != "break" else 0.034)
        bass(t, ROOTS[bar], BEAT * 1.9, amp=0.16 if s in ("full", "intro", "calm") else 0.1)
    if bib == 2 and s in ("full", "outro"):
        bass(t, ROOTS[bar] + (7 if bar % 2 else 12), BEAT * 1.9, amp=0.12)
    if bib == 1 and s == "full":
        epiano(t + off, ch[1:4], dur=1.0, amp=0.028)   # senkop
    if s == "full":
        if bib in (0, 2):
            kick(t)
        if bib == 2:
            kick(t + off, 0.3)
        if bib in (1, 3):
            block(t)
        tick(t + off, 0.024)
        tick(t + BEAT / 4, 0.012)
    elif s == "intro":
        tick(t + off, 0.02)
        if bib == 0:
            kick(t, 0.3)
    elif s in ("calm", "rewind"):
        if bib == 0:
            kick(t, 0.34)
        if bib == 2:
            block(t, 0.04)
        tick(t + off, 0.018)
    elif s == "outro":
        if bib == 0:
            kick(t, 0.34)
    if s in ("full", "intro", "break", "calm", "rewind"):
        for q in range(2):
            idx = (b * 2 + q) % len(ch)
            bell(t + q * off, ch[idx], 0.022)
    b += 1


# ---------------------------------------------------------------- pad
def pad_at(t, chord):
    v = 0.0
    for n in chord[:3]:
        f = note(n)
        v += math.sin(2 * math.pi * f * t) + 0.25 * math.sin(4 * math.pi * f * t)
        v += 0.6 * math.sin(2 * math.pi * f * 1.004 * t)
    return v


amp_s = 0.0
XF = 0.05
for i in range(N):
    t = i / SR
    bar = int(t / BAR) % 4
    s = section(t)
    amp = 0.009
    if s == "outro":
        amp = 0.012 * max(0.3, 1 - (t - OUTRO) / (DUR - OUTRO))
    amp_s += (amp - amp_s) * 0.0005
    pad = pad_at(t, CHORDS[bar])
    u = t % BAR
    if u < XF and t > XF:
        w = u / XF
        pad = w * pad + (1 - w) * pad_at(t, CHORDS[(bar - 1) % 4])
    L[i] += amp_s * pad

# sessizlik kapısı (30 ms rampalar, klik yok) — damgadan önce tam sessizlik
g0, g1 = int(GAP0 * SR), int(HIT * SR)
R = int(0.03 * SR)
for i in range(g0 - R, g1):
    if i < g0:
        L[i] *= (g0 - i) / R
    else:
        L[i] = 0.0

# vurgu anları
kick(HIT, 0.36)
bass(HIT, ROOTS[0] - 12 + 12, 1.6, 0.2)
epiano(HIT, CHORDS[0], dur=2.4, amp=0.05)
kick(BREAK1, 0.38)
bass(BREAK1, 34, 1.4, 0.16)
kick(REW1, 0.4)
bass(REW1, 38, 2.0, 0.18)
epiano(REW1, CHORDS[0], dur=3.0, amp=0.05)

peak = max(abs(v) for v in L)
with wave.open(sys.argv[1], "w") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b"".join(struct.pack("<h", int(32767 * 0.89 * v / peak)) for v in L))
