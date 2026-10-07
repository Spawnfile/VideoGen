"""Generates the same Turkish script with each candidate TTS, measuring speed,
peak VRAM and CER. Usage:
  .venv/bin/python listening_test.py [--clone /path/to/own_voice_10s.wav]

Record fields (all keys always present; null when not measured):
  seconds        audio duration (incl. 0.2 s trailing pad)
  rtf            end-to-end wall time (load + generate + Whisper) / audio seconds  (plan's metric; unfair to slow-loading ASR)
  rtf_incl_load  (model load + generate) / audio seconds, excludes Whisper
  rtf_gen        time spent only inside generate()/synthesize() / audio seconds
  peak_vram_mb   peak of nvidia-smi memory.used (whole GPU, 0.25 s sampling; includes baseline of other processes)
  torch_peak_alloc_mb  torch.cuda.max_memory_allocated() cross-check (this process, tensors only)
  cer            fair, number-aware CER: normalize_tr(script) vs normalize_tr(cleaned ASR)
  cer_raw        plan's original metric: normalize_tr(script) vs raw ASR text (inflated by digit formatting)
  cer_written    written script vs raw ASR text
  cer_over_5pct, chars_per_sec, drift_vs_median_pct   informational flags (the >35 % drift gate belongs to the M5 pipeline)
"""
import argparse, gc, json, statistics, subprocess, threading, time, traceback
from pathlib import Path

import soundfile as sf

from audio_service.metrics import cer
from audio_service.normalize_tr import normalize_tr
from audio_service.align import transcribe_words
from audio_service.asr import clean_asr  # moved into the package (M5c)

SCRIPT = [
    "Bu kalemin içinde tam 7 parça var.",
    "Bilye uç yalnızca 0,7 mm genişliğinde ve her yazışta binlerce kez döner.",
    "Yay ise her tıklamada mekanizmayı geri iter; o çıt sesi tam burada doğar.",
]
OUT = Path.home() / "videogen-data/m1/listening"
RAW = OUT / "raw"
MODELS = Path.home() / "videogen-data/models"
KEYS = ("engine", "voice", "wav", "sample_rate", "seconds", "rtf", "rtf_incl_load", "rtf_gen", "peak_vram_mb",
        "torch_peak_alloc_mb", "vram_sampler_error", "cer", "cer_raw", "cer_written", "cer_over_5pct",
        "chars_per_sec", "drift_vs_median_pct", "asr", "error", "trace")


class VramPeak:
    def __init__(self):
        self.peak, self.sampler_error, self._stop = 0, False, threading.Event()

    def _sample(self):
        try:
            out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                                 capture_output=True, text=True, timeout=5).stdout.strip().splitlines()[0]
            self.peak = max(self.peak, int(out))
        except Exception:
            self.sampler_error = True

    def _run(self):
        while not self._stop.is_set():
            self._sample()
            time.sleep(0.25)

    def __enter__(self):
        self._t = threading.Thread(target=self._run, daemon=True)
        self._t.start()
        return self

    def __exit__(self, *a):
        self._stop.set()
        self._t.join()
        self._sample()  # one last sample at exit


def _free_gpu():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _timed(fn, timing):
    """Wraps fn so wall time spent inside it (GPU-synchronized) accumulates in timing['gen']."""
    import torch

    def wrapped(*a, **k):
        torch.cuda.synchronize()
        t = time.time()
        r = fn(*a, **k)
        torch.cuda.synchronize()
        timing["gen"] += time.time() - t
        return r
    return wrapped


def synth_chatterbox(lines, prompt_wav, timing):
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    m = gen = None
    try:
        # t3_model="v3": only the v3 T3 weights are downloaded; the library default is v2.
        m = ChatterboxMultilingualTTS.from_local(str(MODELS / "chatterbox"), "cuda", t3_model="v3")
        gen = _timed(m.generate, timing)
        wavs = [gen(normalize_tr(t), language_id="tr", audio_prompt_path=prompt_wav,
                    exaggeration=0.6, cfg_weight=0.4, temperature=0.8) for t in lines]
        sr = m.sr
        return wavs, sr
    finally:
        del gen, m  # gen closes over the bound method; drop both before freeing
        _free_gpu()


def synth_freya(lines, _prompt, timing):
    from freyatts import FreyaTTS
    m = gen = None
    try:
        m = FreyaTTS.from_pretrained("freyavoice/freya-tts", device="cuda")
        gen = _timed(m.synthesize, timing)
        wavs = [gen(normalize_tr(t), steps=32) for t in lines]
        sr = m.sample_rate  # no fallback: a wrong rate would silently pitch-shift the audio
        return wavs, sr
    finally:
        del gen, m  # gen closes over the bound method; drop both before freeing
        _free_gpu()


def run(engine, voice, fn, prompt):
    import numpy as np
    rec = {k: None for k in KEYS}
    rec.update(engine=engine, voice=voice)
    vp, timing = VramPeak(), {"gen": 0.0}
    failed = False
    try:
        import torch
        torch.manual_seed(1234)  # same sampling seed per engine -> reruns comparable (CUDA kernels may still differ)
        torch.cuda.reset_peak_memory_stats()
        t0 = time.time()
        try:
            with vp:
                wavs, sr = fn(SCRIPT, prompt, timing)
        finally:
            rec["peak_vram_mb"] = vp.peak
            rec["vram_sampler_error"] = vp.sampler_error
            rec["torch_peak_alloc_mb"] = round(torch.cuda.max_memory_allocated() / 2**20)
        synth_wall = time.time() - t0  # model load + generation, excludes Whisper
        audio = np.concatenate([np.asarray(w).reshape(-1) for w in wavs] + [np.zeros(int(sr * 0.2))])
        RAW.mkdir(parents=True, exist_ok=True)
        path = RAW / f"{engine}-{voice}.wav"
        sf.write(path, audio, sr)
        seconds = len(audio) / sr
        hyp = " ".join(w["text"] for w in transcribe_words(str(path)))
        ref = normalize_tr(" ".join(SCRIPT))
        fair = cer(ref, normalize_tr(clean_asr(hyp)))
        rec.update(wav=f"raw/{path.name}", sample_rate=sr, seconds=round(seconds, 2),
                   rtf=round((time.time() - t0) / seconds, 2), rtf_incl_load=round(synth_wall / seconds, 2),
                   rtf_gen=round(timing["gen"] / seconds, 2),
                   cer=round(fair, 4), cer_raw=round(cer(ref, hyp), 4),
                   # Whisper writes digits while normalize_tr spells them out, so cer_raw is inflated;
                   # cer_written compares the written script against the raw ASR text.
                   cer_written=round(cer(" ".join(SCRIPT), hyp), 4), cer_over_5pct=fair > 0.05,
                   chars_per_sec=round(len(ref) / seconds, 2), asr=hyp)
    except Exception as e:
        rec.update(error=f"{type(e).__name__}: {e}", trace=traceback.format_exc()[-1500:])
        failed = True
    if failed:
        _free_gpu()  # after the except block: the exception (and its traceback frames) no longer pins the model
    print(json.dumps(rec, ensure_ascii=False))
    return rec


def add_drift(records):
    """drift_vs_median_pct: speaking-rate (chars/s) deviation from the median over successful engines.
    Informational here; the >35 % drift gate is a pipeline (M5) concern."""
    ok = [r for r in records if r.get("chars_per_sec")]
    med = statistics.median(r["chars_per_sec"] for r in ok) if ok else None
    for r in records:
        r["drift_vs_median_pct"] = round((r["chars_per_sec"] / med - 1) * 100, 1) if r.get("chars_per_sec") and med else None
    return records


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--clone", help="10-15 s WAV of the user's own voice")
    ap.add_argument("--only", choices=["chatterbox", "freya"])
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    if a.only in (None, "chatterbox"):
        results.append(run("chatterbox", "hazir", synth_chatterbox, None))
        if a.clone:
            results.append(run("chatterbox", "klon", synth_chatterbox, a.clone))
    if a.only in (None, "freya"):
        results.append(run("freya", "leyla", synth_freya, None))
    # --only runs must not clobber each other's results: merge by (engine, voice).
    rp = OUT / "results.json"
    old = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else []
    keys = {(r["engine"], r["voice"]) for r in results}
    merged = add_drift([r for r in old if (r["engine"], r["voice"]) not in keys] + results)
    rp.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
