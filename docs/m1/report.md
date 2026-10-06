# M1 Ses Servisi ve TTS Dinleme Testi Raporu

| | |
|---|---|
| Tarih | 2026-10-06 |
| Dal | `m1-audio` (main `e896a41`'den; M0 + M2 birleşmiş hâli) |
| Durum | Tamamlandı, **K17 kararı GEÇİCİ.** 5 görev; ses servisi testleri 29/29 geçti. Varsayılan Chatterbox ML V3 + hazır ses ölçümlerden seçildi; kullanıcının dinleyip onaylaması bekleniyor (`docs/m1/decision.md`). Spec'te yalnızca K17 geçici olarak işaretlendi, başka K kararı değişmedi |
| Kanıt kaynakları | `.superpowers/sdd/2026-10-06-m1-audio-listening/task-*-report.md`, `fix-env-report.md`, `progress.md` (controller defteri), `~/videogen-data/m1/listening/{results.json,key.json,index.html}`, `python/audio_service/PINS.md` |

Bu rapor spec §18'deki "Chatterbox 5,67 GB VRAM'e sığıyor" varsayımını kapatır ve K17 (TTS motoru + anlatıcı sesi) için ölçüme dayalı geçici kararı kaydeder. Her bölüm için: **Varsayım · Sonuç · Kanıt · Spec'e etkisi.** Spec ve runbook bu rapora göre güncellendi.

## 1. Özet

| Konu | Varsayım | Sonuç |
|---|---|---|
| VRAM | Chatterbox Multilingual V3 6 GB'lık GPU'da (5,67 GB kullanılabilir) çalışır | **geçti** (tepe 3611 MB nvidia-smi / 3251 MB torch) |
| Türkçe doğruluk | Ticari lisanslı yerel bir motor Türkçe'de CER ≤ %5 tutturur | **Chatterbox geçti** (adil CER %0,5); **Freya geçmedi** (%17,9; yanlış telaffuz + tekrar) |
| Hız | `voice` adımı 3–6 dk bütçesine sığar | **geçti** (Chatterbox `rtf_gen` 0,63; 45 sn anlatım ≈ 28 sn üretim + ~15 sn yükleme) |
| Normalizasyon + hizalama | `normalize_tr` + Whisper kelime zamanları betik yazımıyla eşlenir | **geçti, sınırlı** (29 birim test; gerçek WAV'da çalıştı; açıklar M5'e) |
| Anlatıcı sesi | Hazır ses ve klon yan yana dinlenir | **kısmen**: klon **test edilmedi** (kullanıcı kaydı yok) |
| K17 kararı | Kullanıcı dinleyip seçer | **bekliyor**: geçici varsayılan ölçümlerden; dinleme sayfası hazır |

🚦 Kapılar: disk (29,5 GiB = 31,7 GB ile geçildi; indirmelerde taban 10 GiB, en düşük 17 GiB görüldü) · klon (kayıt yok → atlandı) · K17 (kullanıcıya ulaşılamadı, otonom yürütme → geçici karar).

## 2. Tamamlanan görevler

Her görev tek commit; düzeltme turları `--fixup` ile ilgili commit'e katlandı. Aşağıdaki SHA'lar autosquash **öncesi** `m1-audio` dalındaki görev commit'leridir; birleştirmeden sonra main'de her görev tek commit olur ve SHA'lar değişir.

| Görev | Commit (squash öncesi) | Test | Notlar |
|---|---|---|---|
| T1 `build(m1): audio service venv with pinned chatterbox and faster-whisper` | `25543d3` + fixup `d8a61ad`, `588fa8c`, `0611236` | — | Freeze dosyası, paketleme (build-system), `av==16.1.0`, HF anlık görüntüleri (bkz. §7) |
| T2 `feat(audio): Turkish TTS text normalization` | `0a7082c` + fixup `7e9f1cf` | normalize 17 (plan 11) | 4 gerçek hata düzeltildi (≥10¹², noktalı ondalık, `L`, eksi) |
| T3 `feat(audio): Turkish-aware CER and script-faithful word alignment` | `9dd10c7` + fixup `f464f50`, `74b97f6` | metrics 6 (plan 4), align 6 (plan 2) | Noktalama, Whisper rakamları, boşluk paylaştırma |
| T4 `feat(m1): TTS listening test generator with VRAM, RTF and CER measurements` | `1ca2e4b` + fixup `4dd6d99`, `06631b0` | (GPU; elle koşu) | Ölçümler, kör dinleme sayfası; iki düzeltme turu |
| T5 `docs(m1): TTS engine and narrator voice decision` | bu commit | — | `docs/m1/decision.md`, bu rapor, spec, runbook |

## 3. Test sonuçları

Koşu: `cd python/audio_service && .venv/bin/pytest -q` (2026-10-06 06:34, T4'ün son düzeltme turundan sonra; GPU gerekmez):
```
.............................                                            [100%]
29 passed in 0.02s
```

| Dosya | Test | Plan | Not |
|---|---|---|---|
| `tests/test_normalize_tr.py` | 17 | 11 | +6: 10¹² ve üstü çökmez, noktalı ondalık (+birim; binlik ayrımı korunur), `L` → litre, baştaki eksi, aralık tiresine dokunulmaz |
| `tests/test_metrics.py` | 6 | 4 | +2: boşluklu noktalama hata sayılmaz, kelime içi kesme işareti birleşir ("İstanbul'da" = "istanbulda") |
| `tests/test_align.py` | 6 | 2 | +4: Whisper rakamları açılıp süresi eşit bölünür, rakam+birim karışık ASR, ardışık eşleşmeyen kelimeler boşluğu paylaşır, çıplak birim kelimesi |
| **Toplam** | **29** | 17 | 12 ek test, hepsi controller onaylı düzeltme turlarından |

Ortam doğrulaması (bu commit öncesi): `uv pip freeze --python .venv/bin/python | grep -v '^-e' | diff - requirements.freeze.txt` boş; `torch 2.6.0+cu124`, `av 16.1.0`; GPU 16 MiB kullanımda, artık süreç yok.

## 4. Varsayım: Chatterbox 6 GB GPU'ya sığar

**Varsayım.** Spec §18: "Chatterbox 5,67 GB VRAM'e sığıyor"; §9: "4–6 GB VRAM tutuyor".

**Sonuç: geçti.** Tepe 3611 MB (nvidia-smi, tüm GPU, taban 16 MiB) / 3251 MB (torch `max_memory_allocated`). Freya 1811 / 1443 MB.

**Kanıt.** `results.json` (`peak_vram_mb`, `torch_peak_alloc_mb`, `vram_sampler_error: false`). Örnekleyici 0,25 sn aralıklı; torch değeri çapraz kontrol. Model `try/finally` ile boşaltılıyor, hata yolunda da (sahte modelle `weakref` denemesi, T4 düzeltme turu 2).

**Spec'e etkisi.** §18 satırı "M1: doğrulandı". §9 "TTS çalışma şekli" kanıtı 4–6 GB yerine **3,3–3,6 GB**.

## 5. Varsayım: Türkçe doğruluk ve hız

**Varsayım.** Chatterbox ML V3 ve FreyaTTS aynı Türkçe metni CER ≤ %5 ile okur; seçim kulakla yapılır.

**Sonuç.** Chatterbox **geçti** (adil CER %0,5; tek hata "tıklamada → tıplamada"). Freya **geçmedi** (%17,9): "Bilye → Bili", "genişliğinde → gilmedi meşeğinde", "Yay → Yani", "çıt sesi → çıtlit", fazladan "ek" ve "mekanizmada mekanizmayı" tekrarı. Freya kısa tek cümlede doğru (CER 0,0 / 0,03); hata uzun, sayılı cümlede yoğunlaşıyor. Hız: `rtf_gen` Chatterbox 0,63, Freya 0,30.

**Kanıt.** Tam tablo `docs/m1/decision.md` §2. Metin 3 cümle, motor başına tek koşu, tohum 1234. Adil CER = `cer(normalize_tr(betik), normalize_tr(clean_asr(asr)))`; plan metriği `cer_raw` (Chatterbox %13,9) Whisper'ın rakam yazmasını hata sayıyordu (bkz. §7).

**Spec'e etkisi.** §9 TTS satırına seçilen motor (geçici) ve ölçümler; §7.6'ya "CER iki tarafa da `normalize_tr` uygulanarak" notu; K17 geçici karar.

## 6. Varsayım: normalizasyon ve hizalama

**Varsayım.** `normalize_tr` sayı/birim/kısaltmaları sözle açar; Whisper kelime zamanları betiğin yazımıyla (rakamlı, birimli) eşleştirilip altyazıya verilebilir.

**Sonuç: geçti, sınırlı.** Birim testleri ve gerçek WAV'larda çalıştı. ASR token'ları da `normalize_tr`'den geçiyor ("0,7" → "sıfır virgül yedi", süre alt token'lara eşit bölünüyor); eşleşmeyen ardışık kelimeler boşluğu karakter uzunluğuna göre paylaşıyor (3000 örnekli rastgele denemede sıra bozulması/örtüşme 0). Açıklar §8–9'da.

**Kanıt.** `python/audio_service/audio_service/{normalize_tr,metrics,align}.py`, testler (§3), `task-3-report.md` ve `fix-env-report.md` RED/GREEN çıktıları.

**Spec'e etkisi.** §7.6 CER notu. Normalizasyon boşlukları ve hizalama sertleştirmesi M5 `voice` adımına (§9).

## 7. Plandan sapmalar

Biçim: görev · ne · neden. Hiçbiri spec kararını (§4 K-tablosu) değiştirmedi; K17 kullanıcı kararı olduğu için **geçici** işaretlendi.

**Ortam ve paketleme**
- T1 · `pyproject.toml`'a `[build-system]` (setuptools ≥ 68), `[tool.setuptools] packages=["audio_service"]`, pytest `pythonpath=["."]`; kurulum `uv pip install --python .venv --no-deps -e .` (planda `-e . --group dev`) · Paket yapılandırması yoktu: `.venv/bin/pytest` `audio_service`'i içe aktaramıyordu, yalnızca `python -m pytest` çalışıyordu. T3'ün eklediği `tests/conftest.py` `sys.path` yaması kaldırıldı.
- T1 · `requirements.freeze.txt` (133 satır, `uv pip freeze`; git kaynaklılar `@SHA`: chatterbox-tts, resemble-perth) + PINS.md "Yeniden kurulum" bölümü · Plan yalnızca chatterbox SHA'sını sabitliyordu; torch/transformers/numpy/ctranslate2 geçişli bağımlılıkları kilitsizdi.
- T4→T1 · **`av==16.1.0`** sabitlendi (freeze'de `av` 19.0.1 idi) · faster-whisper 1.2.1 `av.open(..., metadata_errors=...)` çağırıyor; av 19'da `TypeError`, `transcribe_words` gerçek WAV'da hiç çalışmıyordu (T3 testleri sentetik olduğu için görmedi).
- T3 · **`uv sync` olayı:** uygulayıcı ajan yasak `uv sync` çalıştırdı; pyproject chatterbox/torch'u listelemediği için sync torch, chatterbox ve bağımlılıklarını **sildi** ve izlenmeyen bir `uv.lock` üretti. Onarım (ayrı düzeltici): `uv.lock` silindi, `uv pip install --python .venv -r requirements.freeze.txt` ile uv önbelleğinden yeniden kuruldu, freeze diff boş, `torch 2.6.0+cu124 True`. Kural PINS.md ve runbook §7'ye yazıldı: **`uv sync` asla**.

**Normalizasyon (T2)**
- `say_int` 10¹² ve üstünde `IndexError` → rakam rakam okuma · Çökme.
- Noktalı ondalık "1.5 mm" → "bir virgül beş milimetre" (`\d+\.\d{1,2}`; "1.500" binlik kalır, "1.2.3" eşleşmez) · "bir.beş" okunuyordu.
- `UNITS["L"] = "litre"`; satır başında ya da boşluktan sonra rakam önündeki eksi → "eksi" · Eksik birim; "-5" okunmuyordu.
- Kapsam dışı bırakılanlar M5'e (§9).

**CER ve hizalama (T3)**
- CER temizliği: kesme işareti silinir, diğer noktalama **boşluğa** çevrilir, boşluklar tekilleştirilir · "a — b" ile "a b" %25 hata veriyordu; " — " içeren bir betik %6,7 ile kapıyı yanlış düşürürdü.
- Whisper rakamları: ASR token'ları da `normalize_tr`'den geçer ve süreleri alt token'lara eşit bölünür; çıplak birim (`mm`) iki tarafta da birim adına eşlenir · "0,7" hiç eşleşmiyor, altyazı kelimeleri sıfır süre alıyordu.
- Boşluk paylaştırma: ardışık eşleşmeyen kelimeler aradaki boşluğu karakter uzunluğuna göre paylaşır (kelime başı en az 10 ms) · Tüm boşluk ilk kelimeye veriliyordu.

**Dinleme testi (T4)**
- **Adil CER tanımı:** `cer` alanı `cer(normalize_tr(betik), normalize_tr(clean_asr(asr)))`; plan metriği `cer_raw`, yazılı metne karşı `cer_written` ek alan · Plan metriği doğru okunan Chatterbox'a %13,9 veriyordu (Whisper rakam yazar).
- **`t3_model="v3"`:** `from_local` varsayılanı `t3_mtl23ls_v2.safetensors`; planın indirdiği yalnızca v3 · Aksi hâlde dosya bulunamazdı; spec zaten V3 diyor.
- Ek alanlar: `rtf_gen` (yalnız üretim, `cuda.synchronize`'lı), `rtf_incl_load`, `torch_peak_alloc_mb`, `vram_sampler_error`, `cer_over_5pct`, `chars_per_sec`, `drift_vs_median_pct`; tam şemalı hata kaydı, OOM'da da VRAM yazılır; `torch.manual_seed(1234)` · Plan `rtf`'i model yüklemesi ve Whisper ile birlikte ölçüyordu (Chatterbox 2,05; salt üretim 0,63).
- **Freya ayrı venv** (`~/videogen-data/venvs/freya`, planlandığı gibi) ama `-e FreyaTTS` yerine `.pth` (repoda pyproject/setup yok); `voxcpm --no-deps`'in eksik bıraktığı import zinciri için küçük paketler eklendi; torch 2.6.0 (uv önbelleğinden hardlink).
- **`HF_HOME`** bu makinede kullanıcının `/home/alper/gpu-server/hf-cache` dizini (`~/.bashrc`): Freya, VoxCPM2 `audiovae.pth` ve Whisper turbo `~/videogen-data/models` yerine orada · Plan tüm ağırlıkları `~/videogen-data/models`'e koyuyordu; yeniden indirmemek için önbellekte bırakıldı, anlık görüntü SHA'ları PINS.md'de.
- `results.json` `(engine, voice)` anahtarıyla birleştirilir (`--only` koşuları birbirini silmez), `encoding="utf-8"` açık · Freya venv'inde `UnicodeDecodeError`.
- **Kör sayfa:** nötr dosya adları (`a.wav`, `b.wav`; ham dosyalar `raw/` altında, sayfadan bağlantısız), tohumlu karıştırma (seed 1 → A = Freya, B = Chatterbox; doğal sırayla aynı değil, doğrulandı), RMS −23 dBFS eşitleme (tepe ≤ 0,97), ortak **48 kHz**'e yeniden örnekleme; motor adı yalnızca kapalı "Ölçümler" bölümünde ve `key.json`'da · Planın sayfası motoru dosya adıyla ele veriyordu, karıştırma etkisizdi, örnekleme hızı farkı kaliteyi ele verebilirdi.

**Kapılar**
- 🚦 Disk: brief ≥ 30 GB istiyordu; `~/.npm` yeniden temizlendikten sonra 29,5 GiB (31,7 GB) → devam; indirmeler için sert taban 10 GiB (en düşük 17 GiB görüldü).
- 🚦 Klon (T4 Step 6): kullanıcı kaydı yok, otonom yürütmede soru sorulamıyordu → atlandı, "klon test edilmedi".
- 🚦 K17 (T5 Step 1–2): kullanıcıya sorulamadı → geçici karar; plan "kullanıcının seçtiği örnek ve gerekçesi"ni istiyordu, `decision.md`'de "Henüz yok" yazıyor.

**Test sayısı değişiklikleri (plan → son):** normalize 11 → 17, metrics 4 → 6, align 2 → 6; toplam 17 → **29** (controller onaylı).

**Süreç notları**
- T3 uygulayıcısının `uv sync`'i sonrası T1–T3 düzeltmeleri ayrı bir düzeltici ajana verildi; ortam önbellekten geri geldi (ek indirme yok).
- T4 iki düzeltme turu gördü (tur 1: şişkin CER, OOM yolunda model sızıntısı, sessizce ölebilen VRAM örnekleyicisi, eksik bayraklar, kör sayfa; tur 2: `gen` kapanışının modeli tutması, ortak 48 kHz).

## 8. Bilinen sınırlar

- **K17 geçici.** Kullanıcı henüz dinlemedi. M5 `voice` adımı bu karara dayanmadan önce onay alınmalı.
- **İstatistiksel olarak zayıf:** tek 3 cümlelik metin, motor başına tek tohum. Chatterbox'ın tohumsuz ilk koşusunda ASR "Bilye"yi "Birliğe" duydu (`cer_raw` %14,9); örnekleme rastgeleliği gerçek.
- **Kör testte kalan ipuçları:** Chatterbox içeriği 24 kHz kaynaklı; 48 kHz'e çıkarılsa da ~12 kHz üstü boş (bant sınırı duyulabilir). Süreler farklı (13,4 / 14,5 sn). Dikkatli bir dinleyici motoru tahmin edebilir.
- **Klon test edilmedi.** Klon kalitesi ve ses istemiyle VRAM ölçülmedi.
- **Freya yedeği zayıf:** CER kapısını geçmiyor; VRAM baskısında devreye girerse sistematik yanlış telaffuz "yeni seed" ile düzelmeyebilir.
- **Normalizasyon açıkları:** saatler ("14.30"), sürümler/bölümler ("17.2" ondalık okunur), sondaki %, boşlukla başlayan aralık tiresi eksi okunabilir, kesme işaretli ekler ("5'te"), kesirler/sıra sayıları/m², tarihler ("12.05.2024" → "on iki.05.2024").
- **Hizalama:** çıplak birim harfleri (`A`, `m`, `g`) sayıdan sonra gelmeseler de açılır; örtüşen ASR zaman damgaları kırpılmıyor; sondaki sessizlik son kelimeye eklenebiliyor; Whisper `condition_on_previous_text` varsayılanda.
- **Sapma (drift) kapısı** yok: `drift_vs_median_pct` yalnızca bilgilendirici (2 motorda medyan = ortalama).
- Ölçümler tek koşudan; VRAM örnekleyicisi çok kısa tepeleri kaçırabilir.
- Chatterbox çıktısına Perth görünmez filigranı eklenir (`mtl_tts.py`); G4 kararını değiştirmez, bilgin olsun.

## 9. M5'e devredilenler

| Madde | Neden M5'te |
|---|---|
| Normalizasyon: saat, sürüm/bölüm, sondaki %, aralık tiresi, kesme işaretli ekler, kesir/sıra sayısı/m², tarih | `voice` adımı gerçek senaryo metinleriyle çalışınca ortaya çıkar; her biri test ister |
| Hizalama sertleştirme: örtüşen ASR zaman damgalarını kırpma, `condition_on_previous_text=False`, sondaki sessizliği kırpma, boş token koruması | Altyazı senkronu (rubrik P7, ±0,5 sn) |
| Çıplak birim harflerini yalnızca sayıdan sonra açma (ASR tarafında da) | "A" ve "m" sıradan kelime olabilir |
| `cer` referans sözleşmesi: referans her zaman `normalize_tr(betik)` | §7.6 kapısının adil kalması |
| Sapma (drift) kapısı (önerilen eşik %35) | Cümle bazında konuşma hızı sapması `voice` adımının işi |
| Çok cümleli, çok tohumlu ölçüm; motor başına CER dağılımı | Tek örnek istatistiksel olarak zayıf |
| Kör test ipuçları (bant sınırı, süre) | Kullanıcı ikinci bir tur isterse; ör. iki motoru da 24 kHz'e indirmek |
| Klon turu (kullanıcı kendi sesini kaydederse) | K17; klon seçilirse AI etiketi zorunlu |

## 10. Disk

| Ne | Boyut | Not |
|---|---|---|
| `df -h /` (şimdi) | `/dev/nvme0n1p5  141G  117G   17G  88% /` | M1 başında 29,5 GiB boştu → M1 ~12,5 GiB kullandı |
| `~/videogen-data/models` | 3,0 GB | Yalnız Chatterbox (`chatterbox/`) |
| `python/audio_service/.venv` | 6,3 GB (görünen) | torch + CUDA kütüphaneleri |
| `~/videogen-data/venvs/freya` | 6,0 GB (görünen) | Aynı torch, hardlink |
| `~/.cache/uv` | 6,7 GB (görünen) | Hardlink kaynağı. **Üçü birlikte gerçekte 6,9 GB** (`du -shc`); `uv cache clean` yalnızca ~0,3 GB kazandırır |
| `HF_HOME` (`/home/alper/gpu-server/hf-cache`) | 3,4 GB toplam | M1'in payı: Whisper turbo 1,6 GB, Freya 699 MB, VoxCPM2 `audiovae.pth` 360 MB. Kalanı kullanıcının önceki önbelleği |
| `~/.pkuseg` | 91 MB | Chatterbox'ın indirdiği sözlük |
| `~/videogen-data/src/FreyaTTS` | 456 KB | |
| `~/videogen-data/m1/listening` | 4,6 MB | WAV'lar, sayfa, `results.json`, `key.json` (repoya girmez) |

Freya yedeği hiç kullanılmayacaksa: Freya venv'ine özgü kısım ~90 MB (uv önbelleği de temizlenirse ~320 MB) + Freya/VoxCPM2 ağırlıkları ~1,06 GB → toplam ~1,1–1,4 GB açılır. Silme kullanıcı onayıyla yapılır.

Sıradaki: kullanıcının dinleyip K17'yi onaylaması (`docs/m1/decision.md` §7), ardından **M3**.
