"""Turkish text normalization for TTS input. Script spelling stays in captions;
only the spoken form is produced here. Numbers are spelled by our own TDK-style
speller (separate words: "bin beş yüz"), because num2words joins Turkish words."""
import re

ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
UNITS = {
    "mm": "milimetre", "cm": "santimetre", "m": "metre", "km": "kilometre",
    "mg": "miligram", "g": "gram", "kg": "kilogram",
    "ml": "mililitre", "l": "litre", "L": "litre",
    "mAh": "miliamper saat", "mA": "miliamper", "A": "amper", "V": "volt", "W": "vat",
    "kW": "kilovat", "Hz": "hertz", "kHz": "kilohertz", "MHz": "megahertz", "GHz": "gigahertz",
    "°C": "santigrat derece", "sn": "saniye", "dk": "dakika",
    "KB": "kilobayt", "MB": "megabayt", "GB": "gigabayt", "TB": "terabayt", "TL": "lira",
}
ABBREVIATIONS = {"vb.": "ve benzeri", "vs.": "vesaire", "örn.": "örneğin", "yak.": "yaklaşık"}

_unit_alt = "|".join(sorted((re.escape(u) for u in UNITS), key=len, reverse=True))
# Sıra önemli: binlik noktası (1.500) > noktalı ondalık (1.5 / 3.25; 1-2 hane, ardından
# rakam ya da ".rakam" yok: sürüm/tarih değil) > virgüllü ondalık/tam sayı.
_NUMBER = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\.\d{1,2}(?!\d|\.\d)|\d+(?:,\d+)?"
_DOT_DECIMAL = re.compile(r"\d+\.\d{1,2}")
# Eksi: yalnızca satır başında veya boşluk/açılış noktalamasından sonra ve hemen rakam önünde ("2-3" aralığı bozulmaz).
_MINUS = re.compile(r"(?:^|(?<=[\s(\[{\"'“‘]))-(?=\d)", re.MULTILINE)
_NUM_UNIT = re.compile(rf"({_NUMBER})\s?({_unit_alt})(?![\wçğıöşüÇĞİÖŞÜ])")
_PERCENT = re.compile(rf"%\s?({_NUMBER})")
_PERCENT_TRAIL = re.compile(rf"(?<![\w,.])({_NUMBER})\s?%")
_LIRA_SIGN = re.compile(rf"₺\s?({_NUMBER})")
# Saat: iki haneli saat + ".": "14.30" (tek haneli "1.50" ondalıktır); ":" ile tek haneli saat de olur.
# Birim/TL ardından gelirse ("12.50 TL") saat değil ondalıktır; tarih/sürüm ("12.05.2024") saat değildir.
_CLOCK = re.compile(
    rf"(?<![\d.,:/])(?:([01]\d|2[0-3])\.|([01]?\d|2[0-3]):)([0-5]\d)(?!\d|[.,:/]\d)(?!\s?(?:{_unit_alt})(?![\wçğıöşüÇĞİÖŞÜ]))")
_FRACTION = re.compile(r"(?<![\w/.,])(\d{1,3})/(\d{1,3})(?![\w/])")
_NUM = re.compile(rf"(?<![\w,.])({_NUMBER})(?![\w])")


def _three(n: int) -> str:
    h, r = divmod(n, 100)
    t, o = divmod(r, 10)
    parts = []
    if h:
        parts.append("yüz" if h == 1 else f"{ONES[h]} yüz")
    if t:
        parts.append(TENS[t])
    if o:
        parts.append(ONES[o])
    return " ".join(parts)


def say_int(n: int) -> str:
    if n == 0:
        return "sıfır"
    if n >= 10**12:  # milyar üstü gruplar tanımsız: rakam rakam oku
        return " ".join("sıfır" if d == "0" else ONES[int(d)] for d in str(n))
    words = []
    for value, name in ((10**9, "milyar"), (10**6, "milyon"), (1000, "bin")):
        q, n = divmod(n, value)
        if q:
            words.append(name if (q == 1 and name == "bin") else f"{_three(q)} {name}")
    if n:
        words.append(_three(n))
    return " ".join(words)


def _say(num: str) -> str:
    if _DOT_DECIMAL.fullmatch(num):
        num = num.replace(".", ",")
    num = num.replace(".", "")
    if "," not in num:
        return say_int(int(num))
    whole, frac = num.split(",", 1)
    zeros = len(frac) - len(frac.lstrip("0"))
    tail = " ".join(["sıfır"] * zeros + ([say_int(int(frac))] if frac.strip("0") else []))
    return f"{say_int(int(whole))} virgül {tail}"


def _say_clock(m: re.Match) -> str:
    hour, minute = int(m.group(1) or m.group(2)), m.group(3)
    tail = "" if minute == "00" else ("sıfır " + ONES[int(minute)] if minute[0] == "0" else say_int(int(minute)))
    return f"{say_int(hour)} {tail}".strip()


def normalize_tr(text: str) -> str:
    for abbr, full in ABBREVIATIONS.items():
        text = re.sub(rf"(?<![\w]){re.escape(abbr)}", full, text)
    text = _MINUS.sub("eksi ", text)
    # percent first: "%12.30" / "12.30%" are percent decimals, never a clock
    text = _PERCENT.sub(lambda m: f"yüzde {_say(m.group(1))}", text)
    text = _PERCENT_TRAIL.sub(lambda m: f"yüzde {_say(m.group(1))}", text)
    text = _CLOCK.sub(_say_clock, text)
    text = _FRACTION.sub(lambda m: f"{say_int(int(m.group(1)))} bölü {say_int(int(m.group(2)))}", text)
    text = _LIRA_SIGN.sub(lambda m: f"{_say(m.group(1))} lira", text)
    text = _NUM_UNIT.sub(lambda m: f"{_say(m.group(1))} {UNITS[m.group(2)]}", text)
    text = _NUM.sub(lambda m: _say(m.group(1)), text)
    return text


_SPEAKABLE_PUNCT = set(" .,;:!?'\"’‘“”()-–—…")


def assert_speakable(spoken: str) -> None:
    """Guard on normalize_tr's OUTPUT (H21): no digit or symbol the TTS front end cannot read may
    reach the engine. Raises ValueError (Turkish reason) naming the leftovers."""
    digits = re.search(r"\S*\d\S*", spoken)
    if digits:
        raise ValueError(f"okunamayan rakam kaldı: {digits.group(0)}")
    bad = sorted({c for c in spoken if not (c.isalpha() or c.isspace() or c in _SPEAKABLE_PUNCT)})
    if bad:
        raise ValueError(f"okunamayan karakter: {' '.join(bad)}")
