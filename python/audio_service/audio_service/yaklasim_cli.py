"""YAKLASIM audio (spec Y14/Y15): python -m audio_service.yaklasim_cli --job job.json

job: {"kind": "music", "duration_s": 13.5, "sparse": [[3.5, 5.5]], "seed": 7, "out": "/abs/music.wav"}
  → a 48 kHz stereo WAV of exactly the video's length, RMS −18 dBFS with the peak held at −1 dBFS (as music_cli: same mix gains).
job: {"kind": "sfx", "out_dir": "/abs/dir"} → snap.wav, tap.wav, land.wav (48 kHz mono).
Exit codes: 0 done (last stdout line is the JSON result), 2 invalid job, 1 crash.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from audio_service import yaklasim_audio as ya

EXIT_CRASH, EXIT_BAD_JOB = 1, 2
RMS_DBFS, PEAK_DBFS = -18.0, -1.0


def music_job(job: dict) -> dict:
    d = float(job["duration_s"])
    if not 10 <= d <= 60:
        raise ValueError("duration_s 10–60")
    sparse = [(float(a), float(b)) for a, b in job.get("sparse", [])]
    x = ya.music(d, sparse, int(job.get("seed", 7)))
    rms = float(np.sqrt(np.mean(x ** 2))) or 1e-9
    x = x * (10 ** (RMS_DBFS / 20) / rms)
    peak = float(np.abs(x).max())
    if peak > 10 ** (PEAK_DBFS / 20):
        x = x * (10 ** (PEAK_DBFS / 20) / peak)
    out = Path(job["out"])
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".part.wav")
    sf.write(tmp, np.stack([x, x], axis=1), ya.SR, subtype="PCM_16")
    os.replace(tmp, out)
    return {"ok": True, "duration_s": round(len(x) / ya.SR, 3), "sparse": [list(s) for s in sparse]}


def sfx_job(job: dict) -> dict:
    d = Path(job["out_dir"])
    d.mkdir(parents=True, exist_ok=True)
    files = {}
    for kind in ("snap", "tap", "land"):
        p = d / f"{kind}.wav"
        ya.write_wav(str(p), ya.sfx(kind))
        files[kind] = str(p)
    return {"ok": True, "files": files}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="audio_service.yaklasim_cli")
    ap.add_argument("--job", required=True)
    args = ap.parse_args(argv)
    try:
        job = json.loads(Path(args.job).read_text(encoding="utf-8"))
        kind = job["kind"]
        if kind not in ("music", "sfx"):
            raise ValueError(f"unknown kind {kind}")
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(json.dumps({"ok": False, "error": f"invalid job: {e}"}))
        return EXIT_BAD_JOB
    try:
        print(json.dumps(music_job(job) if kind == "music" else sfx_job(job)))
        return 0
    except (ValueError, KeyError, TypeError) as e:
        print(json.dumps({"ok": False, "error": f"invalid job: {e}"}))
        return EXIT_BAD_JOB
    except Exception as e:  # noqa: BLE001 — the worker reads the JSON line
        print(json.dumps({"ok": False, "error": str(e)}))
        return EXIT_CRASH


if __name__ == "__main__":
    sys.exit(main())
