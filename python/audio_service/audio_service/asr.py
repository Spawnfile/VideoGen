"""Whisper side of the voice CLI: ASR text cleanup, word timings, load/free."""
import gc
import re
from contextlib import contextmanager
from pathlib import Path

from .align import WHISPER_SIZE, whisper_model_args
from .tts import ModelUnavailable, _free_gpu

WHISPER_SNAPSHOT_DIR = "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo"


def clean_asr(text):
    """Whisper writes '0 ,7' for decimals; rejoin so normalize_tr can read the number. Only a space
    BEFORE the separator is removed, so list commas ('7, 8 ve 9') stay intact."""
    return re.sub(r"(\d)\s+([.,])(\d)", r"\1\2\3", text)


def transcribe(wav: str, model) -> list[dict]:
    """Word timings in seconds. No conditioning on the previous text (a hallucination loop cannot
    carry over) and no VAD (the clip is already trimmed; VAD would drop quiet starts)."""
    segments, _ = model.transcribe(str(wav), language="tr", word_timestamps=True, vad_filter=False,
                                   condition_on_previous_text=False)
    return [{"text": w.word.strip(), "start": w.start, "end": w.end} for s in segments for w in (s.words or [])]


def check_whisper(download_root: str | None = None) -> dict:
    """Fail fast (CLI exit 3) before any TTS work: CUDA, the pinned snapshot and the packages are there.
    Returns the WhisperModel kwargs."""
    try:
        import torch
    except ImportError as e:
        raise ModelUnavailable(f"torch bu ortamda kurulu değil: {e}") from e
    if not torch.cuda.is_available():
        raise ModelUnavailable("CUDA yok: Whisper GPU olmadan çalıştırılmaz")
    args = whisper_model_args(WHISPER_SIZE, download_root)
    snap = Path(args["download_root"]) / WHISPER_SNAPSHOT_DIR
    if not snap.is_dir():
        raise ModelUnavailable(f"Whisper ağırlıkları yok: {snap}")
    try:
        import faster_whisper  # noqa: F401
    except ImportError as e:
        raise ModelUnavailable(f"faster_whisper bu ortamda kurulu değil: {e}") from e
    return args


@contextmanager
def load_whisper(download_root: str | None = None):
    """The pinned large-v3-turbo snapshot from the local hub cache (offline); frees VRAM on exit."""
    model = None
    try:
        args = check_whisper(download_root)
        from faster_whisper import WhisperModel
        model = WhisperModel(WHISPER_SIZE, device="cuda", compute_type="int8_float16", **args)
        yield model
    finally:
        del model
        gc.collect()
        _free_gpu()
