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


def test_percent_trailing():
    assert normalize_tr("%50 indirim") == "yüzde elli indirim"
    assert normalize_tr("50% indirim") == "yüzde elli indirim"
    assert normalize_tr("2,5 % artış") == "yüzde iki virgül beş artış"


def test_currency():
    assert normalize_tr("15 TL") == "on beş lira"
    assert normalize_tr("₺15") == "on beş lira"
    assert normalize_tr("3,5 TL") == "üç virgül beş lira"


def test_data_sizes():
    assert normalize_tr("256 GB") == "iki yüz elli altı gigabayt"
    assert normalize_tr("4GB bellek") == "dört gigabayt bellek"
    assert normalize_tr("512 MB") == "beş yüz on iki megabayt"


def test_clock():
    assert normalize_tr("Saat 14.30 gibi") == "Saat on dört otuz gibi"
    assert normalize_tr("14:05") == "on dört sıfır beş"
    assert normalize_tr("09.00") == "dokuz"
    # a short decimal is still a decimal, a price with a unit is not a clock
    assert normalize_tr("1.5 mm") == "bir virgül beş milimetre"
    assert normalize_tr("12.50 TL") == "on iki virgül elli lira"
    # a percent next to a clock-shaped number is a percent decimal
    assert normalize_tr("%12.30") == "yüzde on iki virgül otuz"
    assert normalize_tr("12.30%") == "yüzde on iki virgül otuz"


def test_simple_fraction():
    assert normalize_tr("1/2 bardak") == "bir bölü iki bardak"


def test_assert_speakable_rejects_leftovers():
    import pytest
    from audio_service.normalize_tr import assert_speakable

    assert_speakable(normalize_tr("Bu kalemde 7 parça var, %50 ucuz; 14.30'da, ₺15!"))
    assert assert_speakable("İstanbul'da “şık” (ılık) — tamam…") is None
    for bad in ("x2", "@", "a_b", "çok 😀", "12/05/2024"):
        with pytest.raises(ValueError):
            assert_speakable(normalize_tr(bad))
    with pytest.raises(ValueError, match="rakam"):
        assert_speakable("sıfır 3 beş")  # a digit that reached the TTS input
