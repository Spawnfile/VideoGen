"""Voice job CLI (H2): `python -m audio_service.voice_cli --job job.json`. One process per job:
every line is synthesized (TTS loaded, then freed), then transcribed (Whisper loaded, then freed);
lines whose CER misses the gate are re-read with seed + 1000 * attempt, up to max_attempts.

Exit codes: 0 done; 2 invalid job (reason on stderr, Turkish); 3 no GPU / model; 4 CER gate
(some lines in `failed`, result.json still written); 5 unexpected crash (last stderr line
"Ses üretimi başarısız: <Tür>: <ileti>"; CUDA out-of-memory maps to 3 instead); SIGTERM unwinds as
SystemExit(143) so models are freed. stdout: `VG_PROGRESS <done> <total>`,
total = 2 x lines (TTS phase, then alignment phase)."""
import argparse
import hashlib
import json
import os
import re
import shutil
import signal
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import soundfile as sf

from .align import DEFAULT_HF_HOME, WHISPER_REVISION, map_words
from .asr import check_whisper, clean_asr, load_whisper, transcribe
from .metrics import cer
from .normalize_tr import assert_speakable, normalize_tr
from .tts import ENGINES, MODEL_NAMES, PINS, ModelUnavailable, load_engine

EXIT_OK, EXIT_BAD_JOB, EXIT_UNAVAILABLE, EXIT_CER, EXIT_CRASH = 0, 2, 3, 4, 5
DEFAULT_MODELS_DIR = "~/videogen-data/models"
TRIM_DB = -50.0
TRIM_PAD_MS = 15
# Bump when anything that shapes a cached line changes without being in the key: TRIM_DB/TRIM_PAD_MS,
# the engine parameters in tts.py (exaggeration, cfg_weight, temperature, steps), resampling.
CACHE_VERSION = "1"
_SEED_LIMIT = 2**63
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


class JobError(ValueError):
    pass


# ---------------------------------------------------------------- job

def parse_job(path: str) -> dict:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as e:
        raise JobError(f"iş dosyası okunamadı: {e}") from e
    except ValueError as e:
        raise JobError(f"iş dosyası geçerli JSON değil: {e}") from e
    if not isinstance(raw, dict):
        raise JobError("iş dosyası bir nesne olmalı")
    engine = raw.get("engine")
    if engine not in ENGINES:
        raise JobError(f"bilinmeyen motor: {engine!r} (olası: {', '.join(ENGINES)})")
    voice = raw.get("voice")
    if not isinstance(voice, dict) or voice.get("kind") not in ("preset", "clone"):
        raise JobError("voice.kind 'preset' ya da 'clone' olmalı")
    if voice["kind"] == "preset":
        if not isinstance(voice.get("id"), str) or not voice["id"]:
            raise JobError("hazır ses için voice.id gerekli")
        voice_key, ref = voice["id"], None
    else:
        if engine == "freya":
            raise JobError("Freya sesi klonlamayı desteklemez")
        ref = voice.get("ref_wav")
        if not isinstance(ref, str) or not Path(ref).is_file():
            raise JobError(f"klon için referans WAV bulunamadı: {ref!r}")
        voice_key = "sha256:" + hashlib.sha256(Path(ref).read_bytes()).hexdigest()
    lines_raw = raw.get("lines")
    if not isinstance(lines_raw, list) or not lines_raw:
        raise JobError("lines boş olamaz")
    lines, seen = [], set()
    for i, ln in enumerate(lines_raw):
        if not isinstance(ln, dict):
            raise JobError(f"lines[{i}] bir nesne olmalı")
        lid, text, seed = ln.get("id"), ln.get("text"), ln.get("seed")
        if not isinstance(lid, str) or not _ID.match(lid):
            raise JobError(f"lines[{i}].id geçersiz: {lid!r}")
        if lid in seen:
            raise JobError(f"yinelenen satır kimliği: {lid}")
        seen.add(lid)
        if not isinstance(text, str) or not text.strip():
            raise JobError(f"satır {lid}: metin boş")
        if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
            raise JobError(f"satır {lid}: seed negatif olmayan tam sayı olmalı")
        try:
            normalized = normalize_tr(text)
            assert_speakable(normalized)
        except ValueError as e:
            raise JobError(f"satır {lid}: {e}") from e
        lines.append({"id": lid, "text": text, "seed": seed, "normalized": normalized})
    out = {"engine": engine, "voice_key": voice_key, "ref_wav": ref, "lines": lines}
    for key in ("cache_dir", "out_dir"):
        if not isinstance(raw.get(key), str) or not raw[key]:
            raise JobError(f"{key} gerekli")
        out[key] = Path(raw[key])
    out["max_attempts"] = raw.get("max_attempts", 3)
    out["cer_max"] = raw.get("cer_max", 0.05)
    out["sample_rate"] = raw.get("sample_rate", 48000)
    if isinstance(out["max_attempts"], bool) or not isinstance(out["max_attempts"], int) or not 1 <= out["max_attempts"] <= 10:
        raise JobError("max_attempts 1–10 arasında tam sayı olmalı")
    if isinstance(out["cer_max"], bool) or not isinstance(out["cer_max"], (int, float)) or not 0 <= out["cer_max"] <= 1:
        raise JobError("cer_max 0–1 arasında olmalı")
    if isinstance(out["sample_rate"], bool) or not isinstance(out["sample_rate"], int) or not 8000 <= out["sample_rate"] <= 192000:
        raise JobError("sample_rate 8000–192000 arasında tam sayı olmalı")
    if max(ln["seed"] for ln in lines) + 1000 * (out["max_attempts"] - 1) >= _SEED_LIMIT:
        raise JobError("seed + 1000 × (max_attempts − 1) 2^63'ten küçük olmalı")
    return out


# ---------------------------------------------------------------- audio

def trim_silence(x: np.ndarray, sr: int, db: float = TRIM_DB, pad_ms: int = TRIM_PAD_MS) -> np.ndarray:
    """Cut leading/trailing samples below `db` (relative to full scale), keeping `pad_ms` of the
    original around the sound so no onset or decay is clipped. Fully quiet audio -> empty array."""
    loud = np.flatnonzero(np.abs(x) > 10 ** (db / 20))
    if not loud.size:
        return x[:0]
    pad = int(sr * pad_ms / 1000)
    return x[max(0, loud[0] - pad): loud[-1] + 1 + pad]


def resample(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    if sr_in == sr_out or x.size == 0:
        return x
    try:
        import soxr  # pinned transitively (librosa); high-quality polyphase
        return soxr.resample(x, sr_in, sr_out).astype(np.float32)
    except ImportError:  # linear interpolation: only for environments without soxr
        n = int(round(x.size * sr_out / sr_in))
        return np.interp(np.arange(n) * sr_in / sr_out, np.arange(x.size), x).astype(np.float32)


def _atomic(path: Path, write):
    """write(tmp) then rename; the temp file never survives an error."""
    tmp = path.with_name(path.stem + ".tmp" + path.suffix)
    try:
        write(tmp)
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def _atomic_write_bytes(path: Path, data: bytes):
    _atomic(path, lambda tmp: tmp.write_bytes(data))


def save_wav(path: Path, x: np.ndarray, sr: int):
    _atomic(path, lambda tmp: sf.write(tmp, np.clip(x, -1.0, 1.0), sr, subtype="PCM_16"))


# ---------------------------------------------------------------- run

def _key(job: dict, ln: dict, seed: int) -> str:
    # H24 key (normalized, seed, engine, voice, pin) + the written text (it decides the word spellings)
    # and the Whisper revision (the cached CER/words come from it).
    blob = json.dumps([ln["normalized"], ln["text"], seed, job["engine"], job["voice_key"],
                       PINS[job["engine"]], WHISPER_REVISION, job["sample_rate"], CACHE_VERSION,
                       TRIM_DB, TRIM_PAD_MS], ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:32]


def _peak_vram_mb():
    try:
        import torch
        return round(torch.cuda.max_memory_allocated() / 2**20)
    except Exception:
        return None


def _emit(done: int, total: int):
    print(f"VG_PROGRESS {done} {total}", flush=True)


def _tts_phase(job, tasks, models_dir, tick):
    """Synthesize the uncached lines (engine loaded only if there are any, freed when the block ends)."""
    def go(eng):
        for t in tasks:
            if t["new"]:
                wav, sr = eng.synthesize(t["ln"]["text"], t["seed"], job["ref_wav"])
                x = trim_silence(wav, sr)
                if not x.size:
                    print(f"Satır {t['ln']['id']}: ses {TRIM_DB:.0f} dB eşiğinin altında (sessiz çıktı); "
                          "metin okunmadı sayılır", file=sys.stderr)
                save_wav(t["wav"], resample(x, sr, job["sample_rate"]), job["sample_rate"])
            tick()
    if any(t["new"] for t in tasks):
        with load_engine(job["engine"], models_dir) as eng:
            go(eng)
    else:
        go(None)


def _asr_phase(tasks, tick):
    def go(model):
        for t in tasks:
            if t["new"]:
                _align(t, model)
            tick()
    if any(t["new"] for t in tasks):
        with load_whisper() as model:
            go(model)
    else:
        go(None)


def run_job(job: dict, models_dir: str) -> tuple[dict, int]:
    t0 = time.time()
    cache, out = job["cache_dir"], job["out_dir"]
    cache.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "result.json").unlink(missing_ok=True)  # never leave a stale result next to a failed run
    total, done = 2 * len(job["lines"]), 0
    state = {ln["id"]: {**ln, "attempts": 0, "cer": None} for ln in job["lines"]}
    pending = list(job["lines"])
    for attempt in range(job["max_attempts"]):
        if not pending:
            break
        tasks = []
        for ln in pending:
            seed = ln["seed"] + 1000 * attempt
            key = _key(job, ln, seed)
            t = {"ln": ln, "seed": seed, "wav": cache / f"{key}.wav", "meta": cache / f"{key}.json"}
            if t["wav"].exists() != t["meta"].exists():  # half an entry: drop it, make it again
                t["wav"].unlink(missing_ok=True)
                t["meta"].unlink(missing_ok=True)
            t["new"] = not t["wav"].exists()
            tasks.append(t)
        if any(t["new"] for t in tasks):
            check_whisper()  # fail fast (exit 3) before spending GPU time on TTS

        def tick():
            nonlocal done
            if attempt == 0:  # retry rounds are not counted: done never exceeds total
                done += 1
                _emit(done, total)
        _tts_phase(job, tasks, models_dir, tick)
        _asr_phase(tasks, tick)
        nxt = []
        for t in tasks:
            meta = json.loads(t["meta"].read_text(encoding="utf-8"))
            s = state[t["ln"]["id"]]
            s["attempts"] = attempt + 1
            if s["cer"] is None or meta["cer"] < s["cer"]:  # deliver the lowest-CER attempt
                s.update(seed=t["seed"], cer=meta["cer"], asr=meta["asr"], words=meta["words"],
                         duration_ms=meta["duration_ms"], wav=f"{t['ln']['id']}.wav")
                shutil.copyfile(t["wav"], out / s["wav"])
            if meta["cer"] > job["cer_max"]:
                nxt.append(t["ln"])
        pending = nxt
    lines = [{k: state[ln["id"]][k] for k in
              ("id", "wav", "duration_ms", "seed", "attempts", "cer", "normalized", "asr", "words")}
             for ln in job["lines"]]
    result = {"engine": job["engine"], "model": MODEL_NAMES[job["engine"]], "lines": lines,
              "failed": [ln["id"] for ln in pending], "ms": round((time.time() - t0) * 1000),
              "peak_vram_mb": _peak_vram_mb()}
    return result, (EXIT_CER if pending else EXIT_OK)


def _align(t: dict, model):
    """Transcribe one cached WAV, map the words onto the script, score it, then write the sidecar
    (its presence marks the cache entry complete)."""
    ln = t["ln"]
    info = sf.info(t["wav"])
    duration_ms = round(info.frames * 1000 / info.samplerate)
    asr_words = transcribe(str(t["wav"]), model) if info.frames else []
    asr = clean_asr(" ".join(w["text"] for w in asr_words if w["text"]))
    score = cer(ln["normalized"], normalize_tr(asr))
    words = [{"text": w["text"], "start_ms": w["startMs"], "end_ms": w["endMs"]}
             for w in map_words(ln["text"], asr_words)]
    _atomic_write_bytes(t["meta"], json.dumps(
        {"cer": score, "asr": asr, "words": words, "duration_ms": duration_ms, "text": ln["text"],
         "seed": t["seed"]}, ensure_ascii=False).encode("utf-8"))


def _is_oom(e: Exception) -> bool:
    return type(e).__name__ == "OutOfMemoryError" or "out of memory" in str(e).lower()


def _on_sigterm(signum, frame):
    raise SystemExit(143)  # unwinds through the `with` blocks: models are freed


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="audio_service.voice_cli")
    ap.add_argument("--job", required=True)
    args = ap.parse_args(argv)
    # H2: offline, explicit caches (a non-interactive worker does not read the shell profile).
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HOME"] = str(Path(os.environ.get("HF_HOME") or DEFAULT_HF_HOME).expanduser())
    models_dir = str(Path(os.environ.get("VG_MODELS_DIR") or DEFAULT_MODELS_DIR).expanduser())
    os.environ["VG_MODELS_DIR"] = models_dir
    try:
        prev = signal.signal(signal.SIGTERM, _on_sigterm)
    except ValueError:  # not the main thread
        prev = None
    try:
        try:
            job = parse_job(args.job)
        except JobError as e:
            print(f"Geçersiz iş: {e}", file=sys.stderr)
            return EXIT_BAD_JOB
        try:
            result, code = run_job(job, models_dir)
        except ModelUnavailable as e:
            print(f"Ses modeli kullanılamıyor: {e}", file=sys.stderr)
            return EXIT_UNAVAILABLE
        except Exception as e:
            traceback.print_exc()
            if _is_oom(e):
                print(f"Ses modeli kullanılamıyor: GPU belleği yetmedi: {e}", file=sys.stderr)
                return EXIT_UNAVAILABLE
            print(f"Ses üretimi başarısız: {type(e).__name__}: {e}", file=sys.stderr)
            return EXIT_CRASH
        _atomic_write_bytes(job["out_dir"] / "result.json",
                            json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8"))
        if code == EXIT_CER:
            print(f"CER kapısı: {', '.join(result['failed'])} satır(lar)ı eşiği geçemedi", file=sys.stderr)
        return code
    finally:
        if prev is not None:
            signal.signal(signal.SIGTERM, prev)


if __name__ == "__main__":
    sys.exit(main())
