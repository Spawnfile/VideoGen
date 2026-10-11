"""YAKLASIM music and SFX (spec 2026-10-11-yaklasim-approach Y14/Y15): the parametrised port of episodes/rubik/audio/music.py and sfx.py.

Music: 120 BPM, Am–F–C–G (one chord per bar of two beats), full energy from frame 0 (no intro), no outro (the video loops); inside the
sparse windows (the macro beats) only the drums thin out. Mono 48 kHz, peak-normalised to 0.89. Deterministic for a seed.
SFX: fixed-pitch sines between 50 and 700 Hz with soft attacks — snap (a part locks), tap (a flash cut), land (the final lock).
"""
import math
import wave

import numpy as np

SR = 48000
BEAT = 0.5
CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOTS = [33, 29, 36, 31]
PEAK = 0.89


def _note(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def _kick(buf, t0, amp):
    d = 0.35
    t = np.arange(int(d * SR)) / SR
    ph = 2 * np.pi * (45 * t + 110 * (1 - np.exp(-t * 28)) / 28)
    env = np.minimum(1.0, t / 0.002) * np.exp(-t * 7) * np.minimum(1.0, (d - t) * 40)
    _add(buf, t0, amp * np.sin(ph) * env)


def _soft_noise(buf, rng, t0, amp, dec, d, cut):
    """Low-passed noise hit (4 one-pole stages, about −24 dB/oct): the soft hat and clap of the episode."""
    a = math.exp(-2 * math.pi * cut / SR)
    v = rng.uniform(-1, 1, int(d * SR))
    for _ in range(4):
        y = np.empty_like(v)
        acc = 0.0
        for i, x in enumerate(v):
            acc = a * acc + (1 - a) * x
            y[i] = acc
        v = y
    t = np.arange(len(v)) / SR
    env = np.minimum(1.0, t / 0.005) * np.exp(-t * dec) * np.minimum(1.0, (d - t) * 60)
    _add(buf, t0, amp * 11.0 * v * env)


def _add(buf, t0, x):
    i0 = int(round(t0 * SR))
    if i0 >= len(buf):
        return
    n = min(len(x), len(buf) - i0)
    buf[i0:i0 + n] += x[:n]


def music(duration_s, sparse, seed=7):
    """The music bed for a `duration_s` video; `sparse` = [(t0, t1), ...] seconds where only the drums thin out."""
    rng = np.random.default_rng(seed)
    n = int(round(duration_s * SR))
    drums = np.zeros(n)
    in_sparse = lambda t: any(a <= t < b for a, b in sparse)  # noqa: E731
    b = 0
    while b * BEAT < duration_s:
        t = b * BEAT
        if in_sparse(t):
            if b % 4 == 0:
                _kick(drums, t, 0.5)
            _soft_noise(drums, rng, t + BEAT / 2, 0.12, 45, 0.08, 1500)
        else:
            _kick(drums, t, 0.8)
            _soft_noise(drums, rng, t + BEAT / 2, 0.14, 45, 0.08, 1500)
            if b % 2 == 1:
                _soft_noise(drums, rng, t, 0.18, 20, 0.18, 1100)
        b += 1
    for a, e in sparse:  # the drums come back with a kick when the macro beat ends
        if e < duration_s:
            _kick(drums, e, 0.9)

    t = np.arange(n) / SR
    bt = t / 2
    bar = bt.astype(int) % 4
    frac = bt - np.floor(bt)
    xf = np.where(frac * 2 < 0.05, np.minimum(1.0, frac * 2 / 0.05), 1.0)  # 50 ms crossfade at a chord change
    pad = np.zeros(n)
    for k in range(4):
        cur = (bar == k) * xf + (bar == (k + 1) % 4) * (1 - xf)  # chord k sounds in its bar and fades out at the next
        tone = np.zeros(n)
        for note in CHORDS[k]:
            f = _note(note + 12)
            tone += np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
        pad += cur * tone
    pad *= 0.022 * (0.8 + 0.2 * np.sin(2 * np.pi * 0.5 * t))
    ph = (t / (BEAT / 2)) % 1
    env = (1 - np.exp(-ph * 30)) * np.exp(-ph * 2.5) * np.minimum(1.0, (1 - ph) * 25)
    roots = np.array([_note(r) for r in ROOTS])[bar]
    bass = 0.16 * env * (np.sin(2 * np.pi * roots * t) + 0.25 * np.sin(4 * np.pi * roots * t))
    pb = (t % BEAT) / BEAT
    pad *= 0.45 + 0.55 * np.minimum(1.0, np.minimum(pb * 3, (1 - pb) * 25))
    out = drums + pad + bass
    fade = int(0.04 * SR)
    out[-fade:] *= np.linspace(1.0, 0.0, fade)
    return PEAK * out / max(1e-9, float(np.max(np.abs(out))))


def _tone(parts, d, attack=0.006, decay=14.0, release=0.02):
    t = np.arange(int(d * SR)) / SR
    env = np.minimum(1.0, t / attack) * np.exp(-t * decay) * np.minimum(1.0, (d - t) / release)
    return env * sum(a * np.sin(2 * np.pi * f * t) for f, a in parts)


def sfx(kind):
    if kind == "snap":
        x = _tone([(330, 1.0), (165, 0.6), (660, 0.12)], 0.14, decay=22)
    elif kind == "tap":
        x = _tone([(294, 1.0), (147, 0.4)], 0.12, attack=0.008, decay=20)
    elif kind == "land":
        x = _tone([(70, 1.0), (140, 0.3)], 0.5, decay=8)
        click = _tone([(440, 0.45), (220, 0.6)], 0.16, decay=18)
        x[: len(click)] += click
    else:
        raise ValueError(f"unknown sfx: {kind}")
    return PEAK * x / max(1e-9, float(np.max(np.abs(x))))


def write_wav(path, samples):
    pcm = np.clip(np.round(np.asarray(samples) * 32767), -32768, 32767).astype("<i2")
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
