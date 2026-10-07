import sys
import weakref

import pytest

from audio_service.tts import ModelUnavailable, load_engine


def test_chatterbox_loads_v3_and_frees_on_error(fakes, env, monkeypatch):
    with pytest.raises(RuntimeError, match="boom"):
        with load_engine("chatterbox", env.models) as eng:
            kind, (path, device), kw = fakes.loads[-1]
            assert (kind, path, device, kw) == ("chatterbox", str(env.models / "chatterbox"), "cuda", {"t3_model": "v3"})
            wav, sr = eng.synthesize("7 parça", 5, "/ref.wav")
            assert sr == 24000 and wav.ndim == 1  # (1, N) tensors come out flat
            text, gen = fakes.generate_kw[-1]
            assert text == "yedi parça"  # spoken form
            assert gen == {"language_id": "tr", "audio_prompt_path": "/ref.wav",
                           "exaggeration": 0.6, "cfg_weight": 0.4, "temperature": 0.8}
            assert fakes.manual_seeds == [5]
            ref = fakes.refs[-1]
            raise RuntimeError("boom")
    assert ref() is None            # the model is gone
    assert fakes.empty_cache >= 1   # and the CUDA cache was emptied on the error path

    fakes.cuda = False
    with pytest.raises(ModelUnavailable, match="CUDA"):
        with load_engine("chatterbox", env.models):
            pass
    fakes.cuda = True
    fake_torch = sys.modules["torch"]
    monkeypatch.setitem(sys.modules, "torch", None)  # not installed in this venv
    with pytest.raises(ModelUnavailable, match="torch"):
        with load_engine("chatterbox", env.models):
            pass
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    (env.models / "chatterbox" / "s3gen.pt").unlink()
    with pytest.raises(ModelUnavailable, match="s3gen.pt"):
        with load_engine("chatterbox", env.models):
            pass


def test_freya_rejects_clone_and_keeps_sample_rate(fakes, env):
    with load_engine("freya", env.models) as eng:
        assert fakes.loads[-1][0] == "freya" and fakes.loads[-1][2] == {"device": "cuda"}
        wav, sr = eng.synthesize("Merhaba 3 kez", 11, None)
        assert sr == 22050 and wav.ndim == 1  # no resampling inside the engine
        assert fakes.generate_kw[-1] == ("Merhaba üç kez", {"steps": 32})
        with pytest.raises(ValueError, match="klon"):
            eng.synthesize("Merhaba", 11, "/ref.wav")
    assert fakes.empty_cache >= 1
