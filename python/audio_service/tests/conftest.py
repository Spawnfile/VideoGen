"""Fake torch / chatterbox / freyatts / faster_whisper for the TTS and CLI tests: no GPU, no model.

The fake engines emit a sine of unique length (400 ms + 20 ms * call number) between 300 ms of lead and
200 ms of tail noise (-60 dB); fake Whisper recognises the call number from the length of the (trimmed) WAV, so
a test decides what an attempt "sounded like" through `garble(text, seed)`."""
import json
import sys
import weakref
import types
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf


class Fakes:
    def __init__(self):
        self.cuda = True
        self.counter = 0
        self.seed = None
        self.garble = lambda text, seed: False
        self.synth = []          # (engine, text, seed, ref)
        self.loads = []          # ("chatterbox"|"freya"|"whisper", args, kwargs)
        self.spoken = {}         # call number -> what the engine "said"
        self.empty_cache = 0
        self.manual_seeds = []
        self.generate_kw = []
        self.refs = []           # weakrefs to every loaded model (none may outlive its `with` block)
        self.alive_at_load = []  # (kind, how many earlier models were still alive when this one loaded)
        self.hook = None         # called inside generate(): raise / kill to simulate a crash
        self.amp = lambda seed: 0.5
        self.whisper_kw = []
        self.transcribe_kw = []

    def track(self, kind, inst):
        self.alive_at_load.append((kind, sum(1 for r in self.refs if r() is not None)))
        self.refs.append(weakref.ref(inst))

    def audio(self, engine, text, sr):
        g = self.garble(text, self.seed)
        spoken = g if isinstance(g, str) else ("bla bla" if g else text)
        if self.hook:
            self.hook()
        self.spoken[self.counter] = spoken
        self.synth.append((engine, text, self.seed, None))
        ms = 400 + 20 * self.counter
        self.counter += 1
        t = np.arange(int(sr * ms / 1000)) / sr
        core = self.amp(self.seed) * np.sin(2 * np.pi * 440 * t)
        rng = np.random.default_rng(0)  # lead/tail are low-level noise (-60 dB), not digital zero
        lead = rng.uniform(-0.001, 0.001, int(sr * 0.3))
        tail = rng.uniform(-0.001, 0.001, int(sr * 0.2))
        return np.concatenate([lead, core, tail])


def install(monkeypatch, fakes):
    def manual_seed(s):
        fakes.seed = s
        fakes.manual_seeds.append(s)

    cuda = types.SimpleNamespace(
        is_available=lambda: fakes.cuda,
        empty_cache=lambda: setattr(fakes, "empty_cache", fakes.empty_cache + 1),
        max_memory_allocated=lambda: 3000 * 2**20,
    )
    monkeypatch.setitem(sys.modules, "torch", types.SimpleNamespace(manual_seed=manual_seed, cuda=cuda))

    class FakeChatterbox:
        sr = 24000

        @classmethod
        def from_local(cls, path, device, **kw):
            fakes.loads.append(("chatterbox", (path, device), kw))
            inst = cls()
            fakes.track("chatterbox", inst)
            return inst

        def generate(self, text, **kw):
            fakes.generate_kw.append((text, kw))
            wav = fakes.audio("chatterbox", text, self.sr)
            fakes.synth[-1] = ("chatterbox", text, fakes.seed, kw.get("audio_prompt_path"))
            return wav.reshape(1, -1)

    class FakeFreya:
        sample_rate = 22050

        @classmethod
        def from_pretrained(cls, repo, **kw):
            fakes.loads.append(("freya", (repo,), kw))
            inst = cls()
            fakes.track("freya", inst)
            return inst

        def synthesize(self, text, **kw):
            fakes.generate_kw.append((text, kw))
            return fakes.audio("freya", text, self.sample_rate)

    pkg = types.ModuleType("chatterbox")
    mtl = types.ModuleType("chatterbox.mtl_tts")
    mtl.ChatterboxMultilingualTTS = FakeChatterbox
    pkg.mtl_tts = mtl
    monkeypatch.setitem(sys.modules, "chatterbox", pkg)
    monkeypatch.setitem(sys.modules, "chatterbox.mtl_tts", mtl)
    monkeypatch.setitem(sys.modules, "freyatts", types.SimpleNamespace(FreyaTTS=FakeFreya))

    class FakeWhisper:
        def __init__(self, size, **kw):
            fakes.loads.append(("whisper", (size,), kw))
            fakes.whisper_kw.append(kw)
            fakes.track("whisper", self)

        def transcribe(self, path, **kw):
            fakes.transcribe_kw.append(kw)
            info = sf.info(path)
            n = round((info.duration * 1000 - 430) / 20)  # 400 ms + 20 ms * call, plus 2 x 15 ms trim padding
            words = fakes.spoken[n].split()
            step = info.duration / max(len(words), 1)
            segs = [types.SimpleNamespace(words=[
                types.SimpleNamespace(word=f" {w}", start=i * step, end=(i + 1) * step)
                for i, w in enumerate(words)])]
            return iter(segs), None

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=FakeWhisper))


@pytest.fixture
def fakes(monkeypatch):
    f = Fakes()
    install(monkeypatch, f)
    return f


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Model directories as the driver provides them (H2): VG_MODELS_DIR and HF_HOME."""
    models, hf = tmp_path / "models", tmp_path / "hf"
    cb = models / "chatterbox"
    cb.mkdir(parents=True)
    for name in ("t3_mtl23ls_v3.safetensors", "s3gen.pt", "ve.pt", "conds.pt"):
        (cb / name).write_bytes(b"x")
    for repo in ("mobiuslabsgmbh--faster-whisper-large-v3-turbo", "freyavoice--freya-tts"):
        (hf / "hub" / f"models--{repo}").mkdir(parents=True)
    monkeypatch.setenv("VG_MODELS_DIR", str(models))
    monkeypatch.setenv("HF_HOME", str(hf))
    monkeypatch.setenv("HF_HUB_OFFLINE", "0")  # restored by monkeypatch; the CLI must force "1"
    return types.SimpleNamespace(root=tmp_path, models=models, hf=hf)


def write_job(env, **over):
    job = {
        "engine": "chatterbox",
        "voice": {"kind": "preset", "id": "hazir"},
        "lines": [
            {"id": "b1", "text": "Bu kalemde 7 parça var.", "seed": 7},
            {"id": "b2", "text": "Yay mekanizmayı geri iter.", "seed": 9},
        ],
        "cache_dir": str(env.root / "cache"),
        "out_dir": str(env.root / "out"),
        "max_attempts": 3,
        "cer_max": 0.05,
        "sample_rate": 48000,
    }
    job.update(over)
    path = env.root / "job.json"
    path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
    return path
