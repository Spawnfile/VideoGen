# M1 — Ses Servisi Temeli ve TTS Dinleme Testi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Yerel ve ücretsiz Türkçe TTS adaylarını (Chatterbox Multilingual V3, FreyaTTS-small) aynı metinle üretip ölçmek; kullanıcının kulağıyla motor ve anlatıcı sesi kararını (K17) almak; bu sırada `audio_service`'in kalıcı parçalarını (Türkçe normalizasyon, CER ölçümü, Whisper hizalama) testli olarak kurmak.

**Architecture:** `python/audio_service/` altında tek bir uv venv (Python 3.12). Kalıcı modüller: `normalize_tr.py` (TTS öncesi metin), `metrics.py` (CER), `align.py` (faster-whisper ile kelime zamanları). Motor denemeleri `listening_test.py` içinde kalır. Model ağırlıkları `~/videogen-data/models/` altına iner, repoya girmez. Çıktı, tarayıcıda açılan bir dinleme sayfası ve ölçüm tablosudur.

**Tech Stack:** uv 0.11, Python 3.12, PyTorch (CUDA, motorun istediği sürüm), chatterbox-tts (GitHub, sabitlenmiş commit), FreyaTTS (GitHub, sabitlenmiş commit), faster-whisper 1.2.1, pytest. (Sayı okuma kendi kodumuzla; `num2words` Türkçe sayıları bitişik yazdığı için kullanılmaz.)

**Spec:** `docs/superpowers/specs/2026-10-06-videogen-design.md` (§7.6, §9, K17, §18)

## Global Constraints

- Ücretli API yok. Edge-TTS dahil hiçbir çevrimiçi TTS kullanılmaz.
- Önkoşul: M0 Task 1 tamam, boş disk ≥ 30 GB. Bu görev ~8 GB indirir (venv + ağırlıklar).
- GPU işi tek başına çalışır. Başlamadan önce `ollama ps` boş ve `nvidia-smi` boş VRAM ≥ 4 GB olmalı.
- Ses klonu yalnızca kullanıcının **kendi sesinden**, onun sağladığı kayıtla yapılır. Klon seçilirse AI etiketi zorunludur (G4); bu, rapora yazılır.
- Sabitleme: Git kaynaklı paketler commit SHA'sıyla kurulur; SHA'lar `python/audio_service/PINS.md` dosyasına yazılır.
- Commit yazarı ve `Co-Authored-By` satırı M0 planındaki gibi.

## Review Focus

1. **Türkçe büyük/küçük harf ve noktalı İ:** Normalizer `str.lower()`/`upper()` kullanırsa "İ" ve "ı" bozulur (video-use'ta görülen hata). Task 2 testleri "İstanbul", "IŞIK" ve "ılık" örnekleriyle bunu sabitler.
2. **Ondalık virgül ve birimler:** "0,7 mm" metni "sıfır nokta yedi em em" diye okunursa video amatör görünür. Task 2 bunu test eder.
3. **VRAM taşması:** Chatterbox fp32'de 5,67 GB'ı aşabilir. Task 4 tepe VRAM'i ölçer ve OOM'u hata olarak raporlar; süreci çökertip ekranı kilitlemez.
4. **Halüsinasyonlu devam (TTS'in metinde olmayan sözcükler üretmesi):** Task 3'teki CER kapısı (> %5 → yeniden üret) ve süre/karakter oranı sapması (> %35) bunu yakalar.
5. **Whisper çıktısının senaryoyla eşleşmemesi:** Hizalama, Whisper'ın yazımını değil **senaryonun yazımını** korumalı (altyazıda "0,7" yerine "sıfır virgül yedi" görünmemeli). Task 3 bunu test eder.

---

### Task 1: Ses venv'i ve sabitlenmiş kaynaklar

**Files:**
- Create: `python/audio_service/pyproject.toml`
- Create: `python/audio_service/PINS.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `python/audio_service/.venv` (Python 3.12, torch CUDA, chatterbox-tts, faster-whisper, pytest)

- [ ] **Step 1: Önkoşulları doğrula**

```bash
df -BG / | awk 'NR==2 {print "free:", $4}'
ollama ps
nvidia-smi --query-gpu=memory.used,memory.total --format=csv
```

Beklenen: boş ≥ 30G; `ollama ps` başlık dışında boş; kullanılan VRAM < 1,5 GB.

- [ ] **Step 2: Commit SHA'larını sabitle**

```bash
CB_SHA=$(git ls-remote https://github.com/resemble-ai/chatterbox HEAD | cut -f1)
FREYA_SHA=$(git ls-remote https://github.com/freyavoiceai/FreyaTTS HEAD | cut -f1)
printf '# Sabitlenmiş kaynaklar (%s)\n\n| Paket | Kaynak | Commit |\n|---|---|---|\n| chatterbox-tts | github.com/resemble-ai/chatterbox | %s |\n| FreyaTTS | github.com/freyavoiceai/FreyaTTS | %s |\n' "$(date -I)" "$CB_SHA" "$FREYA_SHA" > python/audio_service/PINS.md
cat python/audio_service/PINS.md
```

- [ ] **Step 3: pyproject**

`python/audio_service/pyproject.toml`:

```toml
[project]
name = "videogen-audio-service"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
  "faster-whisper==1.2.1",
  "soundfile>=0.12",
  "numpy>=1.26",
]

[dependency-groups]
dev = ["pytest>=8"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 4: venv ve kurulum**

```bash
cd python/audio_service
uv venv .venv -p 3.12
uv pip install --python .venv -e . --group dev
CB_SHA=$(sed -n 's/.*chatterbox | \([0-9a-f]\{40\}\).*/\1/p' PINS.md)
uv pip install --python .venv "chatterbox-tts @ git+https://github.com/resemble-ai/chatterbox@$CB_SHA"
.venv/bin/python -c "import torch, chatterbox; print(torch.__version__, torch.cuda.is_available())"
cd -
```

Beklenen: torch sürümü yazılır ve `True` (CUDA görünüyor). `False` ise torch'un CUDA tekerleği gelmemiştir: `uv pip install --python .venv torch --index-url https://download.pytorch.org/whl/cu128` ile yeniden kur, ardından kontrolü tekrarla.

- [ ] **Step 5: `.gitignore` ve commit**

```bash
printf 'python/audio_service/.venv/\npython/**/__pycache__/\n' >> .gitignore
git add .gitignore python/audio_service/pyproject.toml python/audio_service/PINS.md
git commit -m "build(m1): audio service venv with pinned chatterbox and faster-whisper"
```

---

### Task 2: Türkçe metin normalizasyonu (TDD)

**Files:**
- Create: `python/audio_service/audio_service/__init__.py` (boş)
- Create: `python/audio_service/audio_service/normalize_tr.py`
- Test: `python/audio_service/tests/test_normalize_tr.py`

**Interfaces:**
- Produces: `normalize_tr(text: str) -> str`: TTS'e gidecek okunuş metni. Sayılar, ondalık virgül, birimler, yüzde ve kısaltmalar yazıya çevrilir; Türkçe harfler korunur. Ayrıca `say_int(n: int) -> str` (TDK ayrı yazımı).

- [ ] **Step 1: Başarısız testleri yaz**

`python/audio_service/tests/test_normalize_tr.py`:

```python
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
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını gör**

Run: `cd python/audio_service && .venv/bin/pytest tests/test_normalize_tr.py -q; cd -`
Beklenen: FAIL, `ModuleNotFoundError: No module named 'audio_service.normalize_tr'`

- [ ] **Step 3: Uygulamayı yaz**

`python/audio_service/audio_service/normalize_tr.py`:

```python
"""Turkish text normalization for TTS input. Script spelling stays in captions;
only the spoken form is produced here. Numbers are spelled by our own TDK-style
speller (separate words: "bin beş yüz"), because num2words joins Turkish words."""
import re

ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
UNITS = {
    "mm": "milimetre", "cm": "santimetre", "m": "metre", "km": "kilometre",
    "mg": "miligram", "g": "gram", "kg": "kilogram",
    "ml": "mililitre", "l": "litre",
    "mAh": "miliamper saat", "mA": "miliamper", "A": "amper", "V": "volt", "W": "vat",
    "kW": "kilovat", "Hz": "hertz", "kHz": "kilohertz", "MHz": "megahertz", "GHz": "gigahertz",
    "°C": "santigrat derece", "sn": "saniye", "dk": "dakika",
}
ABBREVIATIONS = {"vb.": "ve benzeri", "vs.": "vesaire", "örn.": "örneğin", "yak.": "yaklaşık"}

_unit_alt = "|".join(sorted((re.escape(u) for u in UNITS), key=len, reverse=True))
_NUMBER = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?"
_NUM_UNIT = re.compile(rf"({_NUMBER})\s?({_unit_alt})(?![\wçğıöşüÇĞİÖŞÜ])")
_PERCENT = re.compile(rf"%\s?({_NUMBER})")
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
    words = []
    for value, name in ((10**9, "milyar"), (10**6, "milyon"), (1000, "bin")):
        q, n = divmod(n, value)
        if q:
            words.append(name if (q == 1 and name == "bin") else f"{_three(q)} {name}")
    if n:
        words.append(_three(n))
    return " ".join(words)


def _say(num: str) -> str:
    num = num.replace(".", "")
    if "," not in num:
        return say_int(int(num))
    whole, frac = num.split(",", 1)
    zeros = len(frac) - len(frac.lstrip("0"))
    tail = " ".join(["sıfır"] * zeros + ([say_int(int(frac))] if frac.strip("0") else []))
    return f"{say_int(int(whole))} virgül {tail}"


def normalize_tr(text: str) -> str:
    for abbr, full in ABBREVIATIONS.items():
        text = re.sub(rf"(?<![\w]){re.escape(abbr)}", full, text)
    text = _NUM_UNIT.sub(lambda m: f"{_say(m.group(1))} {UNITS[m.group(2)]}", text)
    text = _PERCENT.sub(lambda m: f"yüzde {_say(m.group(1))}", text)
    text = _NUM.sub(lambda m: _say(m.group(1)), text)
    return text
```

- [ ] **Step 4: Testleri çalıştır**

Run: `cd python/audio_service && .venv/bin/pytest tests/test_normalize_tr.py -q; cd -`
Beklenen: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add python/audio_service/audio_service/ python/audio_service/tests/test_normalize_tr.py
git commit -m "feat(audio): Turkish TTS text normalization"
```

---

### Task 3: CER ölçümü ve senaryoya sadık kelime hizalama (TDD)

**Files:**
- Create: `python/audio_service/audio_service/metrics.py`
- Create: `python/audio_service/audio_service/align.py`
- Test: `python/audio_service/tests/test_metrics.py`
- Test: `python/audio_service/tests/test_align.py`

**Interfaces:**
- Consumes: `normalize_tr`
- Produces:
  - `cer(reference: str, hypothesis: str) -> float`: Türkçe-duyarlı küçük harf, noktalama yok sayılır.
  - `map_words(script: str, asr_words: list[dict]) -> list[dict]`: `asr_words` öğeleri `{"text": str, "start": float, "end": float}`; dönüş öğeleri `{"text": <senaryodaki yazım>, "startMs": int, "endMs": int}`, senaryodaki her kelime için bir tane.
  - `transcribe_words(wav_path: str, model_size: str = "large-v3-turbo") -> list[dict]` (faster-whisper; GPU varsa `int8_float16`, yoksa `int8`).

- [ ] **Step 1: Başarısız testleri yaz**

`python/audio_service/tests/test_metrics.py`:

```python
from audio_service.metrics import cer, tr_lower


def test_identical_is_zero():
    assert cer("Bilye uç döner.", "bilye uç döner") == 0.0


def test_turkish_lowercase():
    assert tr_lower("IŞIK İĞNE") == "ışık iğne"


def test_one_substitution():
    assert abs(cer("abcd", "abxd") - 0.25) < 1e-9


def test_empty_reference():
    assert cer("", "") == 0.0
```

`python/audio_service/tests/test_align.py`:

```python
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
```

- [ ] **Step 2: Testleri çalıştır, başarısız olduklarını gör**

Run: `cd python/audio_service && .venv/bin/pytest tests/test_metrics.py tests/test_align.py -q; cd -`
Beklenen: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: `metrics.py`**

```python
import re

_TR_LOWER = str.maketrans({"I": "ı", "İ": "i"})


def tr_lower(s: str) -> str:
    return s.translate(_TR_LOWER).lower()


def _clean(s: str) -> str:
    return re.sub(r"[^\wçğıöşü ]+", "", re.sub(r"\s+", " ", tr_lower(s))).strip()


def cer(reference: str, hypothesis: str) -> float:
    ref, hyp = _clean(reference), _clean(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    prev = list(range(len(hyp) + 1))
    for i, rc in enumerate(ref, 1):
        cur = [i]
        for j, hc in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rc != hc)))
        prev = cur
    return prev[-1] / len(ref)
```

- [ ] **Step 4: `align.py`**

```python
"""Map ASR word timings back onto the script's own spelling. Each script word is
expanded to its spoken form (normalize_tr); spoken tokens are matched to ASR
tokens with difflib; script words get the span of their matched spoken tokens.
Unmatched words are interpolated between neighbours so output stays complete
and monotonic."""
from difflib import SequenceMatcher

from .metrics import tr_lower
from .normalize_tr import normalize_tr


def _norm(tok: str) -> str:
    return "".join(ch for ch in tr_lower(tok) if ch.isalnum())


def map_words(script: str, asr_words: list[dict]) -> list[dict]:
    script_words = script.split()
    spoken: list[tuple[int, str]] = []
    for idx, w in enumerate(script_words):
        for tok in normalize_tr(w).split():
            spoken.append((idx, _norm(tok)))
    asr_norm = [_norm(a["text"]) for a in asr_words]
    sm = SequenceMatcher(a=[s for _, s in spoken], b=asr_norm, autojunk=False)
    spans: dict[int, list[float]] = {}
    for block in sm.get_matching_blocks():
        for k in range(block.size):
            widx = spoken[block.a + k][0]
            a = asr_words[block.b + k]
            lo, hi = spans.get(widx, [a["start"], a["end"]])
            spans[widx] = [min(lo, a["start"]), max(hi, a["end"])]
    out: list[dict] = []
    for idx, word in enumerate(script_words):
        if idx in spans:
            start, end = spans[idx]
        else:
            prev_end = out[-1]["endMs"] / 1000 if out else 0.0
            nxt = next((spans[j][0] for j in range(idx + 1, len(script_words)) if j in spans), None)
            nxt = nxt if nxt is not None else (asr_words[-1]["end"] if asr_words else prev_end)
            start, end = prev_end, max(prev_end, nxt)
        out.append({"text": word, "startMs": round(start * 1000), "endMs": round(end * 1000)})
    return out


def transcribe_words(wav_path: str, model_size: str = "large-v3-turbo") -> list[dict]:
    import torch
    from faster_whisper import WhisperModel

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = WhisperModel(model_size, device=device, compute_type="int8_float16" if device == "cuda" else "int8")
    segments, _ = model.transcribe(wav_path, language="tr", word_timestamps=True, vad_filter=False)
    words = [{"text": w.word.strip(), "start": w.start, "end": w.end} for s in segments for w in (s.words or [])]
    del model
    if device == "cuda":
        torch.cuda.empty_cache()
    return words
```

- [ ] **Step 5: Testleri çalıştır**

Run: `cd python/audio_service && .venv/bin/pytest -q; cd -`
Beklenen: tüm testler PASS (`normalize_tr` 11 + `metrics` 4 + `align` 2).

- [ ] **Step 6: Commit**

```bash
git add python/audio_service/audio_service/metrics.py python/audio_service/audio_service/align.py python/audio_service/tests/
git commit -m "feat(audio): Turkish-aware CER and script-faithful word alignment"
```

---

### Task 4: Dinleme testi üretimi ve ölçümü

**Files:**
- Create: `python/audio_service/listening_test.py`
- Create: `python/audio_service/listening_page.py`

**Interfaces:**
- Consumes: `normalize_tr`, `cer`, `transcribe_words`
- Produces: `~/videogen-data/m1/listening/` içinde motor/ses başına WAV dosyaları ve `results.json` (`[{engine, voice, wav, seconds, rtf, peak_vram_mb, cer, error}]`) + `index.html`

- [ ] **Step 1: Ağırlıkları indir**

```bash
M=~/videogen-data/models
mkdir -p $M/chatterbox
~/ai-dev/.venv/bin/hf download ResembleAI/chatterbox ve.pt t3_mtl23ls_v3.safetensors s3gen.pt \
  grapheme_mtl_merged_expanded_v1.json mtl_tokenizer.json tokenizer.json conds.pt Cangjie5_TC.json \
  --local-dir $M/chatterbox
du -sh $M/chatterbox
```

Beklenen: ~3,2 GB. Boyutları HF API ile karşılaştır (bayt doğrulaması; yarım inen dosyalar yüklenirken anlaşılmaz hatalar verir):

```bash
curl -s "https://huggingface.co/api/models/ResembleAI/chatterbox?blobs=true" | python3 -c "
import json,sys,os
d=json.load(sys.stdin); base=os.path.expanduser('~/videogen-data/models/chatterbox')
for s in d['siblings']:
    p=os.path.join(base,s['rfilename'])
    if os.path.exists(p): print('OK ' if os.path.getsize(p)==s['size'] else 'BAD', s['rfilename'])"
```

Beklenen: her satır `OK`.

- [ ] **Step 2: Chatterbox API'sini doğrula**

```bash
python/audio_service/.venv/bin/python - <<'EOF'
import inspect
from chatterbox.mtl_tts import ChatterboxMultilingualTTS as T
print([n for n in dir(T) if not n.startswith('_')])
print(inspect.signature(T.from_local)); print(inspect.signature(T.generate))
EOF
```

Beklenen: `from_local(ckpt_dir, device, ...)` ve `generate(text, language_id, audio_prompt_path=..., exaggeration=..., cfg_weight=..., temperature=...)`. İmza farklıysa Step 3'teki `synth_chatterbox` çağrısını görülen imzaya göre uyarla ve farkı rapora yaz.

- [ ] **Step 3: Üretim script'i**

`python/audio_service/listening_test.py`:

```python
"""Generates the same Turkish script with each candidate TTS, measuring speed,
peak VRAM and CER. Usage:
  .venv/bin/python listening_test.py [--clone /path/to/own_voice_10s.wav]"""
import argparse, json, os, subprocess, threading, time, traceback
from pathlib import Path

import soundfile as sf

from audio_service.metrics import cer
from audio_service.normalize_tr import normalize_tr
from audio_service.align import transcribe_words

SCRIPT = [
    "Bu kalemin içinde tam 7 parça var.",
    "Bilye uç yalnızca 0,7 mm genişliğinde ve her yazışta binlerce kez döner.",
    "Yay ise her tıklamada mekanizmayı geri iter; o çıt sesi tam burada doğar.",
]
OUT = Path.home() / "videogen-data/m1/listening"
MODELS = Path.home() / "videogen-data/models"


class VramPeak:
    def __init__(self):
        self.peak, self._stop = 0, threading.Event()

    def _run(self):
        while not self._stop.is_set():
            mb = subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                                capture_output=True, text=True).stdout.strip().splitlines()[0]
            self.peak = max(self.peak, int(mb))
            time.sleep(0.25)

    def __enter__(self):
        self._t = threading.Thread(target=self._run, daemon=True)
        self._t.start()
        return self

    def __exit__(self, *a):
        self._stop.set()
        self._t.join()


def synth_chatterbox(lines, prompt_wav):
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    m = ChatterboxMultilingualTTS.from_local(str(MODELS / "chatterbox"), "cuda")
    wavs = [m.generate(normalize_tr(t), language_id="tr", audio_prompt_path=prompt_wav,
                       exaggeration=0.6, cfg_weight=0.4, temperature=0.8) for t in lines]
    sr = m.sr
    del m
    torch.cuda.empty_cache()
    return wavs, sr


def synth_freya(lines, _prompt):
    import torch
    from freyatts import FreyaTTS
    m = FreyaTTS.from_pretrained("freyavoice/freya-tts", device="cuda")
    wavs = [m.synthesize(normalize_tr(t), steps=32) for t in lines]
    sr = getattr(m, "sample_rate", 24000)
    del m
    torch.cuda.empty_cache()
    return wavs, sr


def run(engine, voice, fn, prompt):
    import numpy as np
    rec = {"engine": engine, "voice": voice}
    try:
        t0 = time.time()
        with VramPeak() as vp:
            wavs, sr = fn(SCRIPT, prompt)
        audio = np.concatenate([np.asarray(w).reshape(-1) for w in wavs] + [np.zeros(int(sr * 0.2))])
        path = OUT / f"{engine}-{voice}.wav"
        sf.write(path, audio, sr)
        seconds = len(audio) / sr
        hyp = " ".join(w["text"] for w in transcribe_words(str(path)))
        rec.update(wav=path.name, seconds=round(seconds, 2), rtf=round((time.time() - t0) / seconds, 2),
                   peak_vram_mb=vp.peak, cer=round(cer(normalize_tr(" ".join(SCRIPT)), hyp), 4), asr=hyp, error=None)
    except Exception as e:
        rec.update(error=f"{type(e).__name__}: {e}", trace=traceback.format_exc()[-1500:])
    print(json.dumps(rec, ensure_ascii=False))
    return rec


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--clone", help="10-15 s WAV of the user's own voice")
    ap.add_argument("--only", choices=["chatterbox", "freya"])
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    if a.only in (None, "chatterbox"):
        results.append(run("chatterbox", "hazir", synth_chatterbox, None))
        if a.clone:
            results.append(run("chatterbox", "klon", synth_chatterbox, a.clone))
    if a.only in (None, "freya"):
        results.append(run("freya", "leyla", synth_freya, None))
    (OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
```

- [ ] **Step 4: Chatterbox'ı çalıştır**

```bash
cd python/audio_service && .venv/bin/python listening_test.py --only chatterbox; cd -
```

Beklenen: `chatterbox-hazir` için JSON satırı. `error` null, `cer` < 0.05, `peak_vram_mb` < 5800.
`CUDA out of memory` görülürse `error` alanı doludur. Script çökmez; bu bir **ölçüm sonucudur**, rapora girer. Freya'ya geç.

- [ ] **Step 5: FreyaTTS'i ayrı ortamda dene**

FreyaTTS'in bağımlılıkları Chatterbox'ınkilerle çakışabilir. Bu yüzden ayrı bir geçici venv'e kurulur:

```bash
FREYA_SHA=$(sed -n 's/.*FreyaTTS | \([0-9a-f]\{40\}\).*/\1/p' python/audio_service/PINS.md)
git clone https://github.com/freyavoiceai/FreyaTTS ~/videogen-data/src/FreyaTTS && git -C ~/videogen-data/src/FreyaTTS checkout "$FREYA_SHA"
uv venv ~/videogen-data/venvs/freya -p 3.12
uv pip install --python ~/videogen-data/venvs/freya torch einops soundfile librosa huggingface_hub safetensors faster-whisper==1.2.1 numpy
uv pip install --python ~/videogen-data/venvs/freya voxcpm==2.0.3 --no-deps
uv pip install --python ~/videogen-data/venvs/freya -e ~/videogen-data/src/FreyaTTS -e python/audio_service
cd python/audio_service && ~/videogen-data/venvs/freya/bin/python listening_test.py --only freya; cd -
```

Beklenen: `freya-leyla` JSON satırı. Paket adı `freyatts` değilse README'deki import yolunu kullan ve `synth_freya`'yı uyarla.

- [ ] **Step 6: Kullanıcının kendi sesiyle klon (isteğe bağlı)**

Kullanıcıdan 10–15 sn'lik, sessiz ortamda okunmuş bir WAV iste. Örnek kayıt komutu (kullanıcı kendisi çalıştırır):

`! arecord -f S16_LE -r 24000 -c 1 -d 15 ~/videogen-data/m1/own_voice.wav`

Kayıt varsa:

```bash
cd python/audio_service && .venv/bin/python listening_test.py --only chatterbox --clone ~/videogen-data/m1/own_voice.wav; cd -
```

Kayıt yoksa bu adım atlanır ve raporda "klon test edilmedi" yazılır.

- [ ] **Step 7: Dinleme sayfası**

`python/audio_service/listening_page.py`:

```python
import json
from html import escape
from pathlib import Path

OUT = Path.home() / "videogen-data/m1/listening"
rows = json.loads((OUT / "results.json").read_text())
cards = []
for i, r in enumerate(rows, 1):
    label = f"Örnek {chr(64 + i)}"
    body = (f'<audio controls src="{escape(r["wav"])}"></audio>' if not r.get("error")
            else f'<p class="err">Üretilemedi: {escape(r["error"])}</p>')
    cards.append(f'<section><h2>{label}</h2>{body}<details><summary>Ölçümler</summary>'
                 f'<pre>{escape(json.dumps({k: r.get(k) for k in ("engine","voice","seconds","rtf","peak_vram_mb","cer")}, ensure_ascii=False, indent=1))}</pre>'
                 f'</details></section>')
(OUT / "index.html").write_text(f"""<!doctype html><meta charset="utf-8"><title>VideoGen · TTS dinleme testi</title>
<style>body{{background:#faf8f5;color:#27251e;font:16px/1.5 Inter,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px}}
section{{background:#fdfbfa;border-radius:16px;padding:16px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,.08)}}
audio{{width:100%}}.err{{color:#a3412f}}summary{{color:#72706b;cursor:pointer}}</style>
<h1>TTS dinleme testi</h1><p>Önce ölçümlere bakmadan dinleyin: hangisi doğal, hangisi "robot"?
Sonra ölçümleri açıp motoru ve sesi seçin.</p>{''.join(cards)}""")
print(OUT / "index.html")
```

```bash
cd python/audio_service && .venv/bin/python listening_page.py; cd -
```

Örnekler kör dinleme için harf ile etiketlenir; motor adları "Ölçümler" altında kapalı durur.

- [ ] **Step 8: Commit (kod; ses dosyaları repoya girmez)**

```bash
git add python/audio_service/listening_test.py python/audio_service/listening_page.py
git commit -m "feat(m1): TTS listening test generator with VRAM, RTF and CER measurements"
```

---

### Task 5: Kullanıcı kararı ve kayıt

**Files:**
- Create: `docs/m1/decision.md`
- Modify: `docs/superpowers/specs/2026-10-06-videogen-design.md` (K17, §9 TTS satırı, §18 Chatterbox VRAM satırı)

- [ ] **Step 1: Kullanıcıya sayfayı aç ve kararını iste**

`xdg-open ~/videogen-data/m1/listening/index.html` çalıştır. Kullanıcıya iki soru sor:
1. Hangi örnek en doğal?
2. Varsayılan anlatıcı sesi ne olsun: hazır ses mi, klon mu? Klon seçilirse her seslendirmeli videoda AI etiketi zorunlu olacağını hatırlat.

- [ ] **Step 2: Kararı ve ölçümleri yaz**

`docs/m1/decision.md` şunları içerir:
- `results.json` tablosu (motor, ses, süre, RTF, tepe VRAM, CER)
- kullanıcının seçtiği örnek ve verdiği gerekçe (kendi sözleriyle)
- varsayılan motor + yedek motor
- anlatıcı sesi ve AIGC sonucu
- seçilen motorun sabitlenmiş commit'i

- [ ] **Step 3: Spec'i güncelle ve commit**

K17 satırına kararı, §9 TTS satırına seçilen motoru, §18 Chatterbox VRAM satırına ölçülen tepe değeri yaz.

```bash
git add docs/m1/decision.md docs/superpowers/specs/2026-10-06-videogen-design.md
git commit -m "docs(m1): TTS engine and narrator voice decision"
```

Kullanıcıya Türkçe özet ver: **Maddeler / Doğrulama / Bilmen gerekenler**.
