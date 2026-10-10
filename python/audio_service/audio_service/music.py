"""Agent music design A1/A2: a MusicScore (packages/shared/src/music.ts) as note events and a Standard MIDI File for FluidSynth.

Pure and deterministic: the same score gives the same events and the same bytes. The composer picks instruments, patterns, chords and
levels; the generators here turn them into notes on the video's timeline (seconds).
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

TPQ = 480
NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
QUALITY = {
    "": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10],
    "sus2": [0, 2, 7], "sus4": [0, 5, 7], "dim": [0, 3, 6], "add9": [0, 4, 7, 14],
}
# General MIDI programs (0-based) of FluidR3 GM, one channel per instrument; drums on channel 10 (index 9).
PROGRAMS = {"pad": 89, "bass": 33, "arp": 4, "pluck": 46, "bell": 9, "motif": 9, "fx": 119}
CHANNELS = {"pad": 0, "bass": 1, "arp": 2, "pluck": 3, "bell": 4, "motif": 5, "fx": 6, "drums": 9}
DRUM_CHANNEL = 9
KICK, SNARE, HAT, CRASH = 36, 38, 42, 49


@dataclass(frozen=True)
class NoteEvent:
    start_s: float
    dur_s: float
    channel: int
    note: int
    velocity: int


def chord_pcs(symbol: str) -> list[int]:
    """Pitch classes of a chord symbol, root first ('Am' → [9, 0, 4])."""
    if not symbol or symbol[0] not in NOTE_PC:
        raise ValueError(f"akor anlaşılmadı: {symbol}")
    root = NOTE_PC[symbol[0]]
    rest = symbol[1:]
    if rest[:1] == "#":
        root, rest = root + 1, rest[1:]
    elif rest[:1] == "b":
        root, rest = root - 1, rest[1:]
    if rest not in QUALITY:
        raise ValueError(f"akor anlaşılmadı: {symbol}")
    return [(root + i) % 12 for i in QUALITY[rest]]


def note_number(pitch: str) -> int:
    """'A4' → 69, 'Eb3' → 51 (scientific pitch, C4 = 60)."""
    acc = 1 if pitch[1:2] == "#" else -1 if pitch[1:2] == "b" else 0
    octave = int(pitch[2:] if acc else pitch[1:])
    return 12 * (octave + 1) + NOTE_PC[pitch[0]] + acc


def _voice(pcs: list[int], low: int) -> list[int]:
    """Each pitch class at its first MIDI number at or above `low` (a close, rising voicing)."""
    out = []
    for pc in pcs:
        n = low + ((pc - low) % 12)
        while out and n <= out[-1]:
            n += 12
        out.append(n)
    return out


def _vel(level: float, energy: float, scale: float = 1.0) -> int:
    return max(1, min(127, round((28 + 92 * level * (0.55 + 0.45 * energy)) * scale)))


def score_events(score: dict) -> list[NoteEvent]:
    bpm = float(score["bpm"])
    beat = 60.0 / bpm
    bar = 4 * beat
    end = float(score["duration_s"])
    ev: list[NoteEvent] = []

    def add(start: float, dur: float, ch: int, note: int, vel: int, limit: float) -> None:
        if start >= limit - 1e-9 or start < 0:
            return
        ev.append(NoteEvent(round(start, 6), round(min(dur, limit - start), 6), ch, int(note), int(vel)))

    for sec in score["sections"]:
        t0, t1, energy = float(sec["t_start"]), float(sec["t_end"]), float(sec["energy"])
        chords = sec["chords"]
        n_bars = max(1, int((t1 - t0) / bar + 0.999))
        for b in range(n_bars):
            bs = t0 + b * bar
            if bs >= t1 - 1e-9:
                break
            pcs = chord_pcs(chords[b % len(chords)])
            for layer in sec["layers"]:
                inst, pat, lvl = layer["instrument"], layer["pattern"], float(layer["level"])
                ch = CHANNELS[inst]
                if inst == "pad":
                    scale = (0.55 + 0.45 * (b % 2)) if pat == "swell" else 1.0
                    for n in _voice(pcs, 55):
                        add(bs, bar, ch, n, _vel(lvl, energy, 0.85 * scale), t1)
                elif inst == "bass":
                    root = _voice(pcs[:1], 36)[0]
                    if pat == "root":
                        add(bs, bar * 0.95, ch, root, _vel(lvl, energy), t1)
                    else:
                        for k in range(8):
                            n = root + 12 if pat == "octave" and k % 2 else root
                            add(bs + k * beat / 2, beat / 2 * 0.9, ch, n, _vel(lvl, energy, 0.9 if k % 2 else 1.0), t1)
                elif inst == "arp":
                    tones = _voice(pcs, 64)
                    seq = tones if pat == "up" else tones[::-1] if pat == "down" else tones + tones[-2:0:-1]
                    for k in range(8):
                        add(bs + k * beat / 2, beat / 2 * 0.85, ch, seq[k % len(seq)], _vel(lvl, energy, 0.8), t1)
                elif inst == "pluck":
                    tones = _voice(pcs, 60)
                    for k in range(8):
                        if pat == "offbeat" and k % 2 == 0:
                            continue
                        for n in (tones if pat == "offbeat" else tones[k % len(tones):k % len(tones) + 1]):
                            add(bs + k * beat / 2, beat * 0.4, ch, n, _vel(lvl, energy, 0.75), t1)
                elif inst == "bell":
                    top = _voice(pcs, 72)[-1]
                    if pat == "accents":
                        add(bs, beat * 2, ch, top, _vel(lvl, energy, 0.8), t1)
                    elif b % 2 == 0:
                        add(bs, beat * 2, ch, top, _vel(lvl, energy, 0.7), t1)
                        add(bs + 2 * beat, beat * 2, ch, _voice(pcs, 72)[0], _vel(lvl, energy, 0.6), t1)
                elif inst == "drums":
                    v = lambda s: _vel(lvl, energy, s)  # noqa: E731
                    for k in range(8):
                        at = bs + k * beat / 2
                        add(at, 0.1, DRUM_CHANNEL, HAT, v(0.55 if k % 2 else 0.7), t1)
                    kicks = {"light": [0], "pulse": [0, 2], "four": [0, 1, 2, 3], "half": [0]}[pat]
                    for k in kicks:
                        add(bs + k * beat, 0.2, DRUM_CHANNEL, KICK, v(1.0), t1)
                    snares = {"light": [], "pulse": [1, 3], "four": [1, 3], "half": [2]}[pat]
                    for k in snares:
                        add(bs + k * beat, 0.15, DRUM_CHANNEL, SNARE, v(0.75), t1)

    motif = score.get("motif")
    if motif:
        mch = CHANNELS["motif"]
        for sec in score["sections"]:
            if sec["id"] not in motif["sections"]:
                continue
            t0, t1 = float(sec["t_start"]), float(sec["t_end"])
            start = t0
            while start < t1 - 1e-9:
                for n in motif["notes"]:
                    add(start + float(n["beat"]) * beat, float(n["len_beats"]) * beat, mch, note_number(n["pitch"]), _vel(float(motif["level"]), float(sec["energy"]), 0.8), t1)
                start += int(motif["every_bars"]) * bar

    for a in score.get("accents", []):
        t = float(a["t"])
        if a["kind"] in ("hit", "drop"):
            add(t, 1.5, DRUM_CHANNEL, CRASH, 100 if a["kind"] == "hit" else 112, end)
            add(t, 0.3, DRUM_CHANNEL, KICK, 110, end)
        else:  # riser: a reverse cymbal that peaks at t
            lead = min(2.0, t)
            if lead > 0.2:
                add(t - lead, lead, CHANNELS["fx"], 60, 90, end)
    ev.sort(key=lambda e: (e.start_s, e.channel, e.note, e.dur_s, e.velocity))
    return ev


def _vlq(n: int) -> bytes:
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def to_midi(events: list[NoteEvent], bpm: int | float) -> bytes:
    """One-track SMF (format 0): tempo, a program per channel, note on/off. Ticks from seconds at the score's tempo."""
    tick = lambda s: round(s * float(bpm) / 60.0 * TPQ)  # noqa: E731
    msgs: list[tuple[int, int, bytes]] = []  # (tick, order, data): offs before ons at the same tick
    us = round(60_000_000 / float(bpm))
    msgs.append((0, 0, b"\xff\x51\x03" + us.to_bytes(3, "big")))
    used = sorted({e.channel for e in events})
    prog_of = {ch: name for name, ch in CHANNELS.items()}
    for ch in used:
        if ch == DRUM_CHANNEL:
            continue
        msgs.append((0, 1, bytes([0xC0 | ch, PROGRAMS.get(prog_of[ch], 0)])))
        msgs.append((0, 1, bytes([0xB0 | ch, 91, 50])))  # reverb send
    for e in events:
        on, off = tick(e.start_s), max(tick(e.start_s) + 1, tick(e.start_s + e.dur_s))
        msgs.append((on, 3, bytes([0x90 | e.channel, e.note, e.velocity])))
        msgs.append((off, 2, bytes([0x80 | e.channel, e.note, 0])))
    msgs.sort(key=lambda m: (m[0], m[1], m[2]))
    body = bytearray()
    last = 0
    for t, _o, data in msgs:
        body += _vlq(t - last) + data
        last = t
    body += _vlq(0) + b"\xff\x2f\x00"
    return b"MThd" + struct.pack(">IHHH", 6, 0, 1, TPQ) + b"MTrk" + struct.pack(">I", len(body)) + bytes(body)
