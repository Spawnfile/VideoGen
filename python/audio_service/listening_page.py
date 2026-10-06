"""Builds the blind listening page from results.json.
Samples are copied to neutral names (a.wav, b.wav, ...), loudness-matched (RMS), and shown in a seeded shuffle
that never equals the natural (alphabetical engine/voice) order. The mapping lives only inside each card's
hidden <details> and in key.json."""
import json
import random
from html import escape
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio.functional as AF

OUT = Path.home() / "videogen-data/m1/listening"
rows = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
rows.sort(key=lambda r: (r["engine"], r["voice"]))  # natural order
natural = [(r["engine"], r["voice"]) for r in rows]
seed = 1
while True:  # lowest seed whose shuffle differs from the natural order (only possible with >= 2 rows)
    order = list(rows)
    random.Random(seed).shuffle(order)
    if len(rows) < 2 or [(r["engine"], r["voice"]) for r in order] != natural:
        break
    seed += 1
rows = order

# Resample copies to one rate, then loudness match: common RMS target, limited by the clip that hits the peak ceiling first.
TARGET_DBFS, PEAK, BLIND_SR = -23.0, 0.97, 48000
clips = {}
for r in rows:
    if not r.get("error"):
        x, sr = sf.read(OUT / r["wav"], dtype="float32")
        if x.ndim > 1:
            x = x.mean(axis=1)
        if sr != BLIND_SR:  # common sample rate so rate/file size cannot reveal the engine
            x = AF.resample(torch.from_numpy(x), sr, BLIND_SR).numpy()
        clips[r["wav"]] = (x, BLIND_SR)
rms = {k: float(np.sqrt(np.mean(x ** 2))) or 1e-9 for k, (x, _) in clips.items()}
pk = {k: float(np.max(np.abs(x))) or 1e-9 for k, (x, _) in clips.items()}
target = min([10 ** (TARGET_DBFS / 20)] + [rms[k] * PEAK / pk[k] for k in clips])

cards, key = [], {}
for i, r in enumerate(rows):
    letter = chr(97 + i)
    label = f"Örnek {letter.upper()}"
    if r.get("error"):
        body = '<p class="err">Üretilemedi (ayrıntı "Ölçümler" içinde).</p>'
    else:
        x, sr = clips[r["wav"]]
        sf.write(OUT / f"{letter}.wav", np.clip(x * (target / rms[r["wav"]]), -1, 1), sr, subtype="PCM_16")
        body = f'<audio controls preload="metadata" src="{letter}.wav"></audio>'
    key[label] = {"engine": r["engine"], "voice": r["voice"], "raw_wav": r.get("wav")}
    fields = ("engine", "voice", "sample_rate", "seconds", "rtf", "rtf_incl_load", "rtf_gen", "peak_vram_mb",
              "torch_peak_alloc_mb", "cer", "cer_raw", "cer_written", "cer_over_5pct", "chars_per_sec",
              "drift_vs_median_pct", "error")
    cards.append(f'<section><h2>{label}</h2>{body}<details><summary>Ölçümler</summary>'
                 f'<pre>{escape(json.dumps({k: r.get(k) for k in fields}, ensure_ascii=False, indent=1))}</pre>'
                 f'</details></section>')
(OUT / "key.json").write_text(json.dumps({"shuffle_seed": seed, "key": key}, ensure_ascii=False, indent=1), encoding="utf-8")
(OUT / "index.html").write_text(f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VideoGen · TTS dinleme testi</title>
<style>body{{background:#faf8f5;color:#27251e;font:16px/1.5 Inter,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px}}
section{{background:#fdfbfa;border-radius:16px;padding:16px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,.08)}}
audio{{width:100%}}.err{{color:#a3412f}}summary{{color:#72706b;cursor:pointer}}.note{{color:#72706b;font-size:14px}}</style>
<h1>TTS dinleme testi</h1><p>Önce ölçümlere bakmadan dinleyin: hangisi doğal, hangisi "robot"?
Sonra ölçümleri açıp motoru ve sesi seçin.</p>
<p class="note"><strong>Klon sesi test edilmedi (kayıt yok).</strong></p>{''.join(cards)}
<p class="note">Örneklerin ses seviyesi eşitlendi (RMS); kopyalar ortak 48 kHz'e örneklendi (özgün dosyalar raw/ altında kendi hızında; hız "Ölçümler" içinde).
Konuşma hızı sapması (drift) ve CER &gt; %5 bayrakları yalnızca bilgilendiricidir; %35 sapma kapısı M5 hattının işidir.
<code>cer</code> sayı biçimini dikkate alan adil ölçümdür; <code>cer_raw</code> eski plan ölçümüdür (rakam biçimi yüzünden şişer).</p>""", encoding="utf-8")
print(OUT / "index.html")
