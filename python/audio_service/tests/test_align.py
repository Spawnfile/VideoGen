from audio_service.align import map_words


def test_keeps_script_spelling_for_numbers():
    script = "Uç 0,7 mm kalınlıkta."
    asr = [
        {"text": "Uç", "start": 0.00, "end": 0.20},
        {"text": "sıfır", "start": 0.20, "end": 0.45},
        {"text": "virgül", "start": 0.45, "end": 0.70},
        {"text": "yedi", "start": 0.70, "end": 0.90},
        {"text": "milimetre", "start": 0.90, "end": 1.40},
        {"text": "kalınlıkta.", "start": 1.40, "end": 2.00},
    ]
    out = map_words(script, asr)
    assert [w["text"] for w in out] == ["Uç", "0,7", "mm", "kalınlıkta."]
    assert out[1]["startMs"] == 200 and out[1]["endMs"] == 900
    assert out[2]["startMs"] == 900 and out[2]["endMs"] == 1400


def test_monotonic_and_complete_when_asr_drops_a_word():
    script = "Yay mekanizmayı geri iter."
    asr = [
        {"text": "Yay", "start": 0.0, "end": 0.3},
        {"text": "geri", "start": 1.0, "end": 1.3},
        {"text": "iter", "start": 1.3, "end": 1.7},
    ]
    out = map_words(script, asr)
    assert [w["text"] for w in out] == ["Yay", "mekanizmayı", "geri", "iter."]
    starts = [w["startMs"] for w in out]
    assert starts == sorted(starts)
    assert out[1]["startMs"] >= 300 and out[1]["endMs"] <= 1000


def test_asr_digits_are_expanded_and_split_evenly():
    script = "Uç 0,7 mm kalınlıkta."
    asr = [
        {"text": "Uç", "start": 0.0, "end": 0.2},
        {"text": "0,7", "start": 0.2, "end": 0.9},
        {"text": "milimetre", "start": 0.9, "end": 1.4},
        {"text": "kalınlıkta.", "start": 1.4, "end": 2.0},
    ]
    out = map_words(script, asr)
    assert [w["text"] for w in out] == ["Uç", "0,7", "mm", "kalınlıkta."]
    assert (out[1]["startMs"], out[1]["endMs"]) == (200, 900)
    assert (out[2]["startMs"], out[2]["endMs"]) == (900, 1400)
    assert out[3]["startMs"] == 1400


def test_mixed_spoken_digit_and_unit_asr():
    asr = [
        {"text": "sıfır", "start": 0.0, "end": 0.3},
        {"text": "virgül", "start": 0.3, "end": 0.6},
        {"text": "7", "start": 0.6, "end": 0.9},
        {"text": "mm", "start": 0.9, "end": 1.4},
    ]
    out = map_words("0,7 mm", asr)
    assert [(w["text"], w["startMs"], w["endMs"]) for w in out] == [
        ("0,7", 0, 900),
        ("mm", 900, 1400),
    ]


def test_bare_unit_script_word_matches_spoken_unit():
    asr = [
        {"text": "iki", "start": 0.0, "end": 0.4},
        {"text": "milimetre", "start": 0.4, "end": 1.0},
        {"text": "boy", "start": 1.0, "end": 1.3},
    ]
    out = map_words("iki mm boy", asr)
    assert (out[1]["text"], out[1]["startMs"], out[1]["endMs"]) == ("mm", 400, 1000)


def test_consecutive_unmatched_words_share_the_gap():
    script = "Yay şu uzun mekanizmayı geri iter."
    asr = [
        {"text": "Yay", "start": 0.0, "end": 0.3},
        {"text": "geri", "start": 1.3, "end": 1.6},
        {"text": "iter", "start": 1.6, "end": 2.0},
    ]
    out = map_words(script, asr)
    mid = out[1:4]
    assert [w["text"] for w in mid] == ["şu", "uzun", "mekanizmayı"]
    assert all(w["endMs"] > w["startMs"] for w in mid)
    assert mid[0]["startMs"] == 300 and mid[-1]["endMs"] == 1300
    # longer word gets the longer share; no overlap
    assert (mid[2]["endMs"] - mid[2]["startMs"]) > (mid[0]["endMs"] - mid[0]["startMs"])
    for a, b in zip(out, out[1:]):
        assert a["endMs"] <= b["startMs"]
