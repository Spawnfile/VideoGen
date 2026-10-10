"""Agent music design A2: render one MusicScore to a 48 kHz stereo WAV of exactly the video's length.

python -m audio_service.music_cli --job job.json   (job: {"score": {...}, "out": "/abs/music.wav", "soundfont": "/abs/FluidR3_GM.sf2"})
Exit codes: 0 done (last stdout line is the JSON result), 2 invalid job, 3 synthesizer or soundfont unavailable, 1 crash.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from audio_service import music

EXIT_CRASH, EXIT_BAD_JOB, EXIT_UNAVAILABLE = 1, 2, 3
SR = 48_000
FADE_IN_S, FADE_OUT_S = 0.02, 1.5
PEAK_DBFS, RMS_DBFS = -1.0, -18.0


class JobError(Exception):
    pass


def parse_job(path: str) -> dict:
    try:
        job = json.loads(Path(path).read_text(encoding="utf-8"))
        s = job["score"]
        for k in ("bpm", "duration_s", "sections"):
            if k not in s:
                raise JobError(f"partisyonda {k} yok")
        if not s["sections"]:
            raise JobError("bölüm yok")
        if not str(job["out"]).endswith(".wav"):
            raise JobError("çıktı .wav olmalı")
        return job
    except JobError:
        raise
    except Exception as e:  # noqa: BLE001
        raise JobError(f"{type(e).__name__}: {e}") from e


def master(data: np.ndarray, n: int) -> np.ndarray:
    """Exactly n samples, short fades, RMS to -18 dBFS with the peak held at -1 dBFS (the mix sets the final level)."""
    if data.ndim == 1:
        data = np.stack([data, data], 1)
    data = data[:n] if data.shape[0] >= n else np.concatenate([data, np.zeros((n - data.shape[0], 2))])
    fi, fo = int(FADE_IN_S * SR), min(n, int(FADE_OUT_S * SR))
    data[:fi] *= np.linspace(0, 1, fi)[:, None]
    data[n - fo:] *= np.linspace(1, 0, fo)[:, None]
    rms = float(np.sqrt(np.mean(data ** 2))) or 1e-9
    data = data * (10 ** (RMS_DBFS / 20) / rms)
    peak = float(np.abs(data).max()) or 1e-9
    limit = 10 ** (PEAK_DBFS / 20)
    if peak > limit:
        data = data * (limit / peak)
    return data


def render(job: dict) -> dict:
    sf2 = Path(job["soundfont"])
    if not shutil.which("fluidsynth") or not sf2.exists():
        raise FileNotFoundError(f"fluidsynth ya da soundfont yok ({sf2})")
    score = job["score"]
    events = music.score_events(score)
    out = Path(job["out"])
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vg-music-") as tmp:
        mid, raw = Path(tmp) / "score.mid", Path(tmp) / "raw.wav"
        mid.write_bytes(music.to_midi(events, score["bpm"]))
        r = subprocess.run(["fluidsynth", "-ni", "-q", "-g", "0.5", "-r", str(SR), "-F", str(raw), str(sf2), str(mid)],
                           capture_output=True, timeout=120, check=False, env={"PATH": os.environ.get("PATH", "/usr/bin:/bin")})
        if r.returncode != 0 or not raw.exists():
            raise RuntimeError(f"fluidsynth başarısız (kod {r.returncode})")
        data, sr = sf.read(raw, always_2d=True, dtype="float64")
    if sr != SR:
        raise RuntimeError(f"fluidsynth {sr} Hz verdi")
    n = round(float(score["duration_s"]) * SR)
    data = master(data, n)
    tmp_out = out.with_suffix(".part.wav")
    sf.write(tmp_out, data, SR, subtype="PCM_16")
    os.replace(tmp_out, out)
    peak = float(np.abs(data).max())
    return {"ok": True, "duration_s": round(n / SR, 3), "notes": len(events), "peak_db": round(20 * np.log10(peak or 1e-9), 2)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="audio_service.music_cli")
    ap.add_argument("--job", required=True)
    args = ap.parse_args(argv)
    try:
        job = parse_job(args.job)
    except JobError as e:
        print(f"Geçersiz iş: {e}", file=sys.stderr)
        return EXIT_BAD_JOB
    try:
        result = render(job)
    except FileNotFoundError as e:
        print(f"Müzik sentezleyici kullanılamıyor: {e}", file=sys.stderr)
        return EXIT_UNAVAILABLE
    except Exception as e:  # noqa: BLE001
        print(f"Müzik üretimi başarısız: {type(e).__name__}: {e}", file=sys.stderr)
        return EXIT_CRASH
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
