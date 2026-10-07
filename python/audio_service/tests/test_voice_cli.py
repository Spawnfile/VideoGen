import json
import os
import signal
from pathlib import Path

import pytest
import soundfile as sf

from audio_service import voice_cli
from audio_service.align import WHISPER_REVISION
from audio_service.metrics import cer
from audio_service.normalize_tr import normalize_tr
from conftest import write_job


def run_cli(job_path):
    return voice_cli.main(["--job", str(job_path)])


def progress(out):
    return [ln for ln in out.splitlines() if ln.startswith("VG_PROGRESS")]


def result(env, out="out"):
    return json.loads((env.root / out / "result.json").read_text(encoding="utf-8"))


def test_bad_job_exits_2(fakes, env, capsys):
    bad = {
        "empty lines": dict(lines=[]),
        "empty text": dict(lines=[{"id": "a", "text": "  ", "seed": 1}]),
        "digit+letter": dict(lines=[{"id": "a", "text": "Tam x2 güç", "seed": 1}]),
        "symbol": dict(lines=[{"id": "a", "text": "mail@örnek", "seed": 1}]),
        "duplicate id": dict(lines=[{"id": "a", "text": "bir", "seed": 1}, {"id": "a", "text": "iki", "seed": 2}]),
        "path id": dict(lines=[{"id": "../a", "text": "bir", "seed": 1}]),
        "unknown engine": dict(engine="x"),
        "freya clone": dict(engine="freya", voice={"kind": "clone", "ref_wav": __file__}),
        "missing ref": dict(voice={"kind": "clone", "ref_wav": "/yok.wav"}),
        "seed too large": dict(lines=[{"id": "a", "text": "bir", "seed": 2**63 - 1500}], max_attempts=3),
    }
    for name, over in bad.items():
        assert run_cli(write_job(env, **over)) == 2, name
        assert capsys.readouterr().err.strip(), name  # Turkish reason on stderr
    (env.root / "broken.json").write_text("{nope")
    assert run_cli(env.root / "broken.json") == 2
    assert run_cli(env.root / "yok.json") == 2
    assert fakes.loads == []  # nothing was loaded for an invalid job
    assert not (env.root / "out" / "result.json").exists()


def test_run_writes_48k_mono_trimmed_wavs_result_and_progress(fakes, env, capsys):
    job = write_job(env)
    assert run_cli(job) == 0
    out = capsys.readouterr().out
    assert progress(out) == [f"VG_PROGRESS {i} 4" for i in (1, 2, 3, 4)]
    res = result(env)
    assert res["engine"] == "chatterbox" and res["model"].startswith("chatterbox")
    assert res["failed"] == [] and res["peak_vram_mb"] == 3000 and res["ms"] >= 0
    assert fakes.manual_seeds == [7, 9]
    assert [ln["id"] for ln in res["lines"]] == ["b1", "b2"]
    for k, ln in enumerate(res["lines"]):
        info = sf.info(env.root / "out" / ln["wav"])
        assert (info.samplerate, info.channels) == (48000, 1)
        # sine of 400 + 20 k ms; the 300 ms / 200 ms of -60 dB lead and tail noise are cut at -50 dB,
        # leaving ~15 ms of padding on each side
        assert abs(info.duration * 1000 - (430 + 20 * k)) < 10
        assert abs(ln["duration_ms"] - (430 + 20 * k)) < 10
        assert ln["cer"] == 0 and ln["attempts"] == 1 and ln["seed"] in (7, 9)
        starts = [w["start_ms"] for w in ln["words"]]
        ends = [w["end_ms"] for w in ln["words"]]
        assert starts == sorted(starts) and all(s <= e for s, e in zip(starts, ends))
    assert res["lines"][0]["normalized"] == "Bu kalemde yedi parça var."
    assert [w["text"] for w in res["lines"][0]["words"]] == ["Bu", "kalemde", "7", "parça", "var."]
    assert fakes.transcribe_kw[0]["condition_on_previous_text"] is False and fakes.transcribe_kw[0]["vad_filter"] is False
    # engine and Whisper never live at once: one load each, sequential
    assert [k for k, *_ in fakes.loads] == ["chatterbox", "whisper"]
    assert fakes.alive_at_load == [("chatterbox", 0), ("whisper", 0)]
    # line cache (H24): the same job again synthesizes and transcribes nothing
    n_synth, n_loads = len(fakes.synth), len(fakes.loads)
    capsys.readouterr()
    assert run_cli(job) == 0
    assert (len(fakes.synth), len(fakes.loads)) == (n_synth, n_loads)
    res2 = result(env)
    assert [(l["id"], l["cer"], l["asr"], l["duration_ms"]) for l in res2["lines"]] == \
           [(l["id"], l["cer"], l["asr"], l["duration_ms"]) for l in res["lines"]]
    assert progress(capsys.readouterr().out) == [f"VG_PROGRESS {i} 4" for i in (1, 2, 3, 4)]

    # every part of the cache key matters: each change re-synthesizes exactly the lines it touches
    def resynth(n, **over):
        before = len(fakes.synth)
        assert run_cli(write_job(env, **over)) == 0
        assert len(fakes.synth) - before == n, over
    lines = json.loads(job.read_text(encoding="utf-8"))["lines"]
    resynth(2, voice={"kind": "preset", "id": "baska"})                       # voice id
    resynth(1, lines=[dict(lines[0], text="Bu kalemde yedi parça var."), lines[1]])  # written text only (same spoken form)
    resynth(1, lines=[dict(lines[0], seed=8), lines[1]])                      # seed
    resynth(2, sample_rate=24000)                                             # output sample rate
    assert sf.info(env.root / "out" / "b1.wav").samplerate == 24000
    resynth(2, engine="freya")                                                # engine
    monkey_version = voice_cli.CACHE_VERSION
    voice_cli.CACHE_VERSION = monkey_version + "-x"                           # trim / engine parameters changed
    try:
        resynth(2)
    finally:
        voice_cli.CACHE_VERSION = monkey_version
    # clone: reference bytes are part of the key, the path is passed through to the engine
    ref = env.root / "ref.wav"
    ref.write_bytes(b"one")
    clone = dict(voice={"kind": "clone", "ref_wav": str(ref)})
    resynth(2, **clone)
    assert {s[3] for s in fakes.synth[-2:]} == {str(ref)}
    resynth(0, **clone)
    ref.write_bytes(b"two")
    resynth(2, **clone)
    # a cache entry counts only with both files; orphans are dropped and re-made
    orph = env.root / "cache_orph"
    resynth(2, cache_dir=str(orph))
    wavs = sorted(orph.glob("*.wav"))
    wavs[0].unlink()                      # a json without its wav
    wavs[1].with_suffix(".json").unlink()  # a wav without its json
    resynth(2, cache_dir=str(orph))
    assert len(list(orph.glob("*.wav"))) == len(list(orph.glob("*.json"))) == 2


def test_cer_retry_with_new_seed_then_pass(fakes, env, capsys):
    fakes.garble = lambda text, seed: seed == 7  # the first reading of b1 is wrong
    assert run_cli(write_job(env)) == 0
    res = result(env)
    b1, b2 = res["lines"]
    assert (b1["attempts"], b1["seed"]) == (2, 1007) and b1["cer"] == 0
    assert (b2["attempts"], b2["seed"]) == (1, 9)
    assert fakes.manual_seeds == [7, 9, 1007]
    assert res["failed"] == []
    # engine and Whisper are reloaded for the retry; progress still counts 2 x lines once
    assert [k for k, *_ in fakes.loads] == ["chatterbox", "whisper", "chatterbox", "whisper"]
    # the previous model is gone before the next one loads (weakrefs), also after the retry round
    assert fakes.alive_at_load == [("chatterbox", 0), ("whisper", 0), ("chatterbox", 0), ("whisper", 0)]
    assert progress(capsys.readouterr().out) == [f"VG_PROGRESS {i} 4" for i in (1, 2, 3, 4)]


def test_cer_still_failing_exits_4_with_result(fakes, env, capsys):
    partial = "Yay mekanizmayı geri"
    # b2: the first reading is half right, every retry is worse -> the best attempt is delivered, not the last
    fakes.garble = lambda text, seed: (partial if seed == 9 else True) if seed % 1000 == 9 else False
    assert run_cli(write_job(env)) == 4
    res = result(env)
    assert res["failed"] == ["b2"]
    b1, b2 = res["lines"]
    assert b1["cer"] == 0 and b2["attempts"] == 3
    assert [s for s in fakes.manual_seeds if s % 1000 == 9] == [9, 1009, 2009]
    assert b2["seed"] == 9 and 0.05 < b2["cer"] < 1 and b2["asr"] == partial  # lowest CER, not the last attempt
    assert (env.root / "out" / b2["wav"]).exists()
    capsys.readouterr()
    # max_attempts is honoured
    fakes.manual_seeds.clear()
    assert run_cli(write_job(env, max_attempts=1, cache_dir=str(env.root / "cache2"))) == 4
    assert fakes.manual_seeds == [7, 9]
    # the gate is `cer <= cer_max`: exactly at the limit passes, a hair below fails
    c = cer(normalize_tr("Yay mekanizmayı geri iter."), partial)
    assert run_cli(write_job(env, max_attempts=1, cer_max=c, cache_dir=str(env.root / "cache3"))) == 0
    assert run_cli(write_job(env, max_attempts=1, cer_max=c * 0.999, cache_dir=str(env.root / "cache4"))) == 4
    # a reading quieter than -50 dB is empty audio: CER 1, a clear Turkish reason, the retry/exit 4 path
    fakes.garble = lambda text, seed: False
    fakes.amp = lambda seed: 0.002 if seed == 9 else 0.5
    capsys.readouterr()
    assert run_cli(write_job(env, max_attempts=1, cache_dir=str(env.root / "cache5"))) == 4
    assert "sessiz" in capsys.readouterr().err
    quiet = result(env)["lines"][1]
    assert quiet["cer"] == 1.0 and quiet["duration_ms"] == 0


def test_env_offline_and_download_root(fakes, env, capsys, monkeypatch):
    assert run_cli(write_job(env)) == 0
    assert os.environ["HF_HUB_OFFLINE"] == "1"
    kw = fakes.whisper_kw[0]
    assert kw["download_root"] == str(env.hf / "hub") and kw["revision"] == WHISPER_REVISION
    # missing weights or CUDA -> 3, no result (and a stale one from an earlier run is removed)
    fakes.cuda = False
    stale = env.root / "o3" / "result.json"
    stale.parent.mkdir()
    stale.write_text("{}")
    assert run_cli(write_job(env, cache_dir=str(env.root / "c3"), out_dir=str(env.root / "o3"))) == 3
    assert not stale.exists()
    fakes.cuda = True
    whisper_dir = env.hf / "hub" / "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo"
    whisper_dir.rmdir()
    loads = len(fakes.loads)
    assert run_cli(write_job(env, cache_dir=str(env.root / "c4"), out_dir=str(env.root / "o4"))) == 3
    assert len(fakes.loads) == loads  # failed fast: the TTS engine was not even loaded
    whisper_dir.mkdir()
    # packages missing from this venv name themselves
    import sys
    fw = sys.modules["faster_whisper"]
    monkeypatch.setitem(sys.modules, "faster_whisper", None)
    capsys.readouterr()
    assert run_cli(write_job(env, cache_dir=str(env.root / "c5"), out_dir=str(env.root / "o5"))) == 3
    assert "faster_whisper" in capsys.readouterr().err
    monkeypatch.setitem(sys.modules, "faster_whisper", fw)
    # unexpected errors: exit 5 with a last Turkish stderr line; the model is freed on the way out
    def boom():
        raise RuntimeError("kaboom")
    fakes.hook = boom
    empty = fakes.empty_cache
    assert run_cli(write_job(env, cache_dir=str(env.root / "c6"))) == 5
    assert capsys.readouterr().err.strip().splitlines()[-1] == "Ses üretimi başarısız: RuntimeError: kaboom"
    assert fakes.empty_cache > empty and fakes.refs[-1]() is None  # the model is freed on a crash
    assert not list((env.root / "cache").glob("*.tmp*"))
    fakes.hook = lambda: (_ for _ in ()).throw(RuntimeError("CUDA out of memory. Tried to allocate 2 GiB"))
    assert run_cli(write_job(env, cache_dir=str(env.root / "c7"))) == 3
    assert "belleği" in capsys.readouterr().err
    # SIGTERM (a cancel or timeout from the driver) unwinds through the cleanup
    before = signal.getsignal(signal.SIGTERM)
    fakes.hook = lambda: os.kill(os.getpid(), signal.SIGTERM)
    empty = fakes.empty_cache
    with pytest.raises(SystemExit) as e:
        run_cli(write_job(env, cache_dir=str(env.root / "c8")))
    code = e.value.code
    del e  # the exception's traceback frames hold the fake model's `self`
    import gc
    gc.collect()
    assert code == 143 and fakes.empty_cache > empty and fakes.refs[-1]() is None
    assert signal.getsignal(signal.SIGTERM) == before
