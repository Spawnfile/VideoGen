import json
import shutil
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from audio_service import music, music_cli

SF2 = Path("/usr/share/sounds/sf2/FluidR3_GM.sf2")
needs_synth = pytest.mark.skipif(not (shutil.which("fluidsynth") and SF2.exists()), reason="fluidsynth/FluidR3 yok")


def score(**o):
    s = {
        "version": 1, "bpm": 96, "key": {"root": "A", "mode": "minor"}, "duration_s": 12.0,
        "intent_tr": "deneme",
        "sections": [
            {"id": "giris", "t_start": 0, "t_end": 5, "chords": ["Am", "F"], "energy": 0.3,
             "layers": [{"instrument": "pad", "pattern": "swell", "level": 0.6}, {"instrument": "bell", "pattern": "accents", "level": 0.4}]},
            {"id": "odul", "t_start": 5, "t_end": 12, "chords": ["C", "G7"], "energy": 0.8,
             "layers": [{"instrument": "bass", "pattern": "pulse", "level": 0.6}, {"instrument": "arp", "pattern": "updown", "level": 0.5},
                        {"instrument": "drums", "pattern": "pulse", "level": 0.5}, {"instrument": "pluck", "pattern": "offbeat", "level": 0.4}]},
        ],
        "accents": [{"t": 0, "kind": "hit"}, {"t": 5, "kind": "drop"}, {"t": 4.5, "kind": "riser"}],
        "motif": {"instrument": "bell", "notes": [{"beat": 0, "pitch": "E5", "len_beats": 1}, {"beat": 1.5, "pitch": "A5", "len_beats": 0.5}],
                  "every_bars": 1, "sections": ["odul"], "level": 0.5},
    }
    s.update(o)
    return s


def test_chords_voice_to_the_right_pitch_classes():
    assert music.chord_pcs("Am") == [9, 0, 4]
    assert music.chord_pcs("G7") == [7, 11, 2, 5]
    assert music.chord_pcs("F#maj7") == [6, 10, 1, 5]
    assert music.chord_pcs("Bbsus4") == [10, 3, 5]
    assert music.note_number("A4") == 69 and music.note_number("Eb3") == 51
    with pytest.raises(ValueError):
        music.chord_pcs("H7")


def test_events_cover_every_layer_stay_inside_the_video_and_are_deterministic():
    ev1 = music.score_events(score())
    ev2 = music.score_events(score())
    assert ev1 == ev2
    chans = {e.channel for e in ev1}
    assert {music.CHANNELS[i] for i in ("pad", "bell", "bass", "arp", "drums", "pluck")} <= chans
    assert all(0 <= e.start_s < 12.0 and e.start_s + e.dur_s <= 12.0 + 1e-6 for e in ev1)
    # the bass pulse plays chord roots of the "odul" section only (C then G)
    bass = [e for e in ev1 if e.channel == music.CHANNELS["bass"]]
    assert bass and all(e.start_s >= 5 - 1e-9 for e in bass) and {e.note % 12 for e in bass} <= {0, 7}
    # a hit accent puts a crash at 0 s
    assert any(e.channel == music.DRUM_CHANNEL and e.note == music.CRASH and abs(e.start_s) < 1e-9 for e in ev1)


def test_midi_file_is_a_valid_smf_with_tempo():
    data = music.to_midi(music.score_events(score()), bpm=96)
    assert data[:4] == b"MThd" and b"MTrk" in data
    assert b"\xff\x51\x03" in data  # tempo meta


@needs_synth
def test_cli_renders_a_48k_stereo_wav_of_exactly_the_video_length(tmp_path, capsys):
    job = tmp_path / "job.json"
    out = tmp_path / "music.wav"
    job.write_text(json.dumps({"score": score(), "out": str(out), "soundfont": str(SF2)}), encoding="utf-8")
    assert music_cli.main(["--job", str(job)]) == 0
    data, sr = sf.read(out)
    assert sr == 48000 and data.ndim == 2 and data.shape[1] == 2
    assert data.shape[0] == 12 * 48000
    assert np.abs(data).max() <= 10 ** (-1 / 20) + 1e-3  # peak ≤ -1 dBFS
    assert np.sqrt(np.mean(data[:48000] ** 2)) > 1e-4  # sound from the first second (the hook)
    res = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert res["ok"] and res["duration_s"] == 12.0
    # same score, same bytes
    out2 = tmp_path / "music2.wav"
    job.write_text(json.dumps({"score": score(), "out": str(out2), "soundfont": str(SF2)}), encoding="utf-8")
    assert music_cli.main(["--job", str(job)]) == 0
    assert out.read_bytes() == out2.read_bytes()


def test_cli_exit_codes(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"score": {"bpm": 96}, "out": str(tmp_path / "x.wav"), "soundfont": str(SF2)}), encoding="utf-8")
    assert music_cli.main(["--job", str(bad)]) == music_cli.EXIT_BAD_JOB
    nosf = tmp_path / "nosf.json"
    nosf.write_text(json.dumps({"score": score(), "out": str(tmp_path / "y.wav"), "soundfont": str(tmp_path / "yok.sf2")}), encoding="utf-8")
    assert music_cli.main(["--job", str(nosf)]) == music_cli.EXIT_UNAVAILABLE
