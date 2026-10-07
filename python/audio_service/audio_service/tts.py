"""TTS engine adapters for the voice CLI. Heavy imports (torch, chatterbox, freyatts) happen inside
the loaders so importing this module (and the tests) needs no GPU stack. Each engine is a context
manager: leaving it deletes the model and empties the CUDA cache, on the error path too."""
import gc
from contextlib import contextmanager
from pathlib import Path

import numpy as np

from .align import whisper_model_args
from .normalize_tr import normalize_tr

# Commits recorded in PINS.md; part of the line-cache key (H24).
PINS = {
    "chatterbox": "5de7a54aa4e5e2baadb0182dde554908b48b85c2",
    "freya": "146d36c1cb6660646be57d31339db4eed9315de3",
}
MODEL_NAMES = {
    "chatterbox": "chatterbox-multilingual-v3@" + PINS["chatterbox"][:8],
    "freya": "freya-tts@" + PINS["freya"][:8],
}
CHATTERBOX_FILES = ("t3_mtl23ls_v3.safetensors", "s3gen.pt", "ve.pt", "conds.pt")
FREYA_REPO = "freyavoice/freya-tts"
ENGINES = tuple(PINS)


class ModelUnavailable(RuntimeError):
    """No CUDA, a missing weight file or a missing engine package (CLI exit 3)."""


def _free_gpu():
    gc.collect()
    try:
        import torch
        torch.cuda.empty_cache()
    except Exception:
        pass


def _flat(wav) -> np.ndarray:
    """Engine output (torch tensor (1, N) or ndarray) -> float32 mono ndarray."""
    if hasattr(wav, "detach"):
        wav = wav.detach().cpu().numpy()
    return np.asarray(wav, dtype=np.float32).reshape(-1)


def _require_cuda():
    try:
        import torch
    except ImportError as e:
        raise ModelUnavailable(f"torch bu ortamda kurulu değil: {e}") from e
    if not torch.cuda.is_available():
        raise ModelUnavailable("CUDA yok: ses motoru GPU olmadan çalıştırılmaz")
    return torch


class Engine:
    name = ""
    model = ""

    def __init__(self, impl):
        self._impl = impl

    def synthesize(self, text: str, seed: int, ref_wav: str | None):
        raise NotImplementedError

    def close(self):
        self._impl = None
        _free_gpu()


class ChatterboxEngine(Engine):
    name, model = "chatterbox", MODEL_NAMES["chatterbox"]

    def synthesize(self, text, seed, ref_wav):
        import torch
        torch.manual_seed(seed)
        # M1 values (listening test): exaggeration 0.6, cfg 0.4, temperature 0.8.
        wav = self._impl.generate(normalize_tr(text), language_id="tr", audio_prompt_path=ref_wav,
                                  exaggeration=0.6, cfg_weight=0.4, temperature=0.8)
        return _flat(wav), int(self._impl.sr)


class FreyaEngine(Engine):
    name, model = "freya", MODEL_NAMES["freya"]

    def synthesize(self, text, seed, ref_wav):
        if ref_wav:
            raise ValueError("Freya sesi klonlamayı desteklemez")
        import torch
        torch.manual_seed(seed)
        wav = self._impl.synthesize(normalize_tr(text), steps=32)
        return _flat(wav), int(self._impl.sample_rate)  # no fallback: a wrong rate would pitch-shift


def _load_chatterbox(models_dir) -> Engine:
    _require_cuda()
    root = Path(models_dir) / "chatterbox"
    missing = [f for f in CHATTERBOX_FILES if not (root / f).is_file()]
    if missing:
        raise ModelUnavailable(f"Chatterbox ağırlıkları yok ({root}): {', '.join(missing)}")
    try:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    except ImportError as e:
        raise ModelUnavailable(f"chatterbox bu ortamda kurulu değil: {e}") from e
    # t3_model="v3": only the v3 T3 weights are used; the library default is v2.
    return ChatterboxEngine(ChatterboxMultilingualTTS.from_local(str(root), "cuda", t3_model="v3"))


def _load_freya() -> Engine:  # weights live in the HF cache, not in models_dir
    _require_cuda()
    snap = Path(whisper_model_args()["download_root"]) / "models--freyavoice--freya-tts"
    if not snap.is_dir():
        raise ModelUnavailable(f"Freya ağırlıkları yok: {snap}")
    try:
        from freyatts import FreyaTTS
    except ImportError as e:
        raise ModelUnavailable(f"freyatts bu ortamda kurulu değil: {e}") from e
    return FreyaEngine(FreyaTTS.from_pretrained(FREYA_REPO, device="cuda"))


_LOADERS = {"chatterbox": _load_chatterbox, "freya": lambda _models_dir: _load_freya()}


@contextmanager
def load_engine(engine: str, models_dir):
    eng = None
    try:
        eng = _LOADERS[engine](Path(models_dir))
        yield eng
    finally:
        if eng is not None:
            eng.close()
        else:
            _free_gpu()
