"""YAKLASIM music and SFX (spec Y14/Y15): deterministic, music at full energy from 0 s, sparse drums in macro beats, low sine snaps."""
import numpy as np

from audio_service import yaklasim_audio as ya


def test_music_length_peak_and_energy_from_the_first_frame():
    m = ya.music(13.5, sparse=[(3.5, 5.5)])
    assert abs(len(m) - round(13.5 * ya.SR)) <= 1
    assert float(np.max(np.abs(m))) <= 0.89 + 1e-6
    assert float(np.sqrt(np.mean(m[: ya.SR // 10] ** 2))) > 0.01


def test_sparse_windows_thin_the_drums():
    m = ya.music(13.5, sparse=[(3.5, 5.5)])
    hi = np.diff(m)  # first difference ≈ high-pass: kicks/hats dominate
    rms = lambda a, b: float(np.sqrt(np.mean(hi[int(a * ya.SR):int(b * ya.SR)] ** 2)))  # noqa: E731
    assert rms(3.6, 5.4) < 0.6 * rms(6.0, 8.0)


def test_same_seed_same_music_and_no_sparse_window_is_fine():
    assert np.array_equal(ya.music(12.0, sparse=[]), ya.music(12.0, sparse=[]))


def test_sfx_are_low_sines():
    for kind in ("snap", "tap", "land"):
        s = ya.sfx(kind)
        assert len(s) > 0
        spec = np.abs(np.fft.rfft(s, n=1 << 14)) ** 2
        freqs = np.fft.rfftfreq(1 << 14, 1 / ya.SR)
        assert spec[freqs > 800].sum() < 0.05 * spec.sum(), kind


def test_wav_round_trip(tmp_path):
    import soundfile as sf
    p = tmp_path / "m.wav"
    ya.write_wav(str(p), ya.music(12.0, sparse=[]))
    data, sr = sf.read(str(p))
    assert sr == 48000 and data.ndim == 1 and abs(len(data) - 12 * 48000) <= 1


def test_cli_music_and_sfx(tmp_path, capsys):
    import json
    import soundfile as sf
    from audio_service import yaklasim_cli
    job = tmp_path / "job.json"
    job.write_text(json.dumps({"kind": "music", "duration_s": 12.5, "sparse": [[3.5, 5.5]], "out": str(tmp_path / "m.wav")}))
    assert yaklasim_cli.main(["--job", str(job)]) == 0
    assert json.loads(capsys.readouterr().out.strip().splitlines()[-1])["duration_s"] == 12.5
    data, sr = sf.read(str(tmp_path / "m.wav"), always_2d=True)
    assert sr == 48000 and data.shape == (600000, 2) and float(np.abs(data).max()) <= 10 ** (-1 / 20) + 1e-3
    job.write_text(json.dumps({"kind": "sfx", "out_dir": str(tmp_path / "sfx")}))
    assert yaklasim_cli.main(["--job", str(job)]) == 0
    assert sorted(p.name for p in (tmp_path / "sfx").iterdir()) == ["land.wav", "snap.wav", "tap.wav"]
    job.write_text(json.dumps({"kind": "music", "duration_s": 3, "out": str(tmp_path / "x.wav")}))
    assert yaklasim_cli.main(["--job", str(job)]) == 2


def test_no_voice_modules_remain():
    """Spec Z1: the audio service is only the YAKLASIM generator; the TTS/ASR modules are gone (the source tree, not an editable install)."""
    from pathlib import Path

    pkg = Path(__file__).resolve().parent.parent / "audio_service"
    assert sorted(p.name for p in pkg.glob("*.py")) == ["__init__.py", "yaklasim_audio.py", "yaklasim_cli.py"]
