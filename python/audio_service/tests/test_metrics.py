from audio_service.metrics import cer, tr_lower


def test_identical_is_zero():
    assert cer("Bilye uç döner.", "bilye uç döner") == 0.0


def test_turkish_lowercase():
    assert tr_lower("IŞIK İĞNE") == "ışık iğne"


def test_one_substitution():
    assert abs(cer("abcd", "abxd") - 0.25) < 1e-9


def test_empty_reference():
    assert cer("", "") == 0.0


def test_spaced_punctuation_is_not_an_error():
    assert cer("a — b", "a b") == 0.0
    assert cer("x ... y", "x y") == 0.0
    assert cer("a,b", "a b") == 0.0


def test_apostrophe_inside_word_is_joined():
    assert cer("İstanbul'da", "istanbulda") == 0.0
