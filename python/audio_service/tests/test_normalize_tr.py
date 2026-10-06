from audio_service.normalize_tr import normalize_tr


def test_integer():
    assert normalize_tr("Bu kalemde 7 parça var.") == "Bu kalemde yedi parça var."


def test_decimal_comma_and_unit():
    assert normalize_tr("Bilye uç 0,7 mm.") == "Bilye uç sıfır virgül yedi milimetre."


def test_multi_digit_decimal():
    assert normalize_tr("Kalınlık 1,25 cm") == "Kalınlık bir virgül yirmi beş santimetre"


def test_percent():
    assert normalize_tr("%30 daha hafif") == "yüzde otuz daha hafif"


def test_thousands_dot():
    assert normalize_tr("1.500 tıklama") == "bin beş yüz tıklama"


def test_units_after_number_only():
    assert normalize_tr("mm cinsinden 2 mm") == "mm cinsinden iki milimetre"


def test_turkish_letters_preserved():
    text = "İstanbul'da IŞIK ılık"
    assert normalize_tr(text) == text


def test_abbreviation():
    assert normalize_tr("vb. parçalar") == "ve benzeri parçalar"


def test_temperature():
    assert normalize_tr("120 °C sıcaklık") == "yüz yirmi santigrat derece sıcaklık"


def test_leading_zero_fraction():
    assert normalize_tr("0,05 mm") == "sıfır virgül sıfır beş milimetre"


def test_large_numbers_tdk_spacing():
    from audio_service.normalize_tr import say_int
    assert say_int(1000) == "bin"
    assert say_int(2_350_017) == "iki milyon üç yüz elli bin on yedi"


def test_say_int_huge_does_not_crash():
    from audio_service.normalize_tr import say_int
    assert say_int(10**12) == " ".join(["bir"] + ["sıfır"] * 12)
    assert say_int(10**12 - 1).startswith("dokuz yüz doksan dokuz milyar")


def test_dot_decimal_with_unit():
    assert normalize_tr("1.5 mm") == "bir virgül beş milimetre"
    assert normalize_tr("3.5 V") == "üç virgül beş volt"


def test_dot_decimal_two_digits_and_thousands_unchanged():
    assert normalize_tr("2.25 cm") == "iki virgül yirmi beş santimetre"
    assert normalize_tr("1.500 tıklama") == "bin beş yüz tıklama"
    assert normalize_tr("Fiyat 5.5.") == "Fiyat beş virgül beş."


def test_unit_liter_uppercase():
    assert normalize_tr("2 L su") == "iki litre su"
    assert normalize_tr("2 l su") == "iki litre su"


def test_leading_minus():
    assert normalize_tr("-5 °C") == "eksi beş santigrat derece"
    assert normalize_tr("Sıcaklık -5 °C oldu") == "Sıcaklık eksi beş santigrat derece oldu"
    assert normalize_tr("(-3) derece") == "(eksi üç) derece"


def test_minus_in_range_untouched():
    assert normalize_tr("2-3 gün") == "iki-üç gün"
