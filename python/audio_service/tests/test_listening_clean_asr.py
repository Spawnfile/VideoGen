from listening_test import clean_asr


def test_rejoins_whisper_decimal_with_space_before_separator():
    assert clean_asr("Uç 0 ,7 mm") == "Uç 0,7 mm"
    assert clean_asr("0,7") == "0,7"


def test_does_not_join_list_commas():
    assert clean_asr("7, 8 ve 9") == "7, 8 ve 9"
    assert clean_asr("1. 2") == "1. 2"
