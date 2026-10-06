# M1 Kararı: TTS motoru ve anlatıcı sesi (K17)

| | |
|---|---|
| Tarih | 2026-10-06 |
| Durum | **GEÇİCİ — kullanıcının dinleyip onaylaması bekleniyor.** Karar kullanıcınındır (K17, 🚦 kapı). Kullanıcı bu milestone'da ulaşılamazdı ve otonom yürütme istedi; bu yüzden aşağıdaki varsayılan **ölçümlerden** çıkarıldı. Kullanıcı dinledikten sonra onaylar ya da değiştirir (bkz. §7) |
| Kaynaklar | `~/videogen-data/m1/listening/results.json`, `key.json`, `index.html`; `python/audio_service/PINS.md`; `.superpowers/sdd/2026-10-06-m1-audio-listening/task-4-report.md` |

## 1. Özet

| | Karar (geçici) |
|---|---|
| Varsayılan motor | **Chatterbox Multilingual V3** (MIT), `language_id="tr"` |
| Yedek motor | **FreyaTTS** (Apache-2.0), yalnızca VRAM baskısı zorunlu kılarsa; bugünkü hâliyle Türkçe CER kapısını geçmiyor |
| Anlatıcı sesi | **Hazır ses** (Chatterbox'ın varsayılan koşullandırması `conds.pt`) |
| AIGC (G4) | Ses için **AI etiketi gerekmez** (Blender CG + hazır TTS sesi). Klon **test edilmedi** |
| Kullanıcının seçtiği örnek ve gerekçesi | **Henüz yok** — kullanıcı `~/videogen-data/m1/listening/index.html` sayfasını dinleyip karar verecek (A/B kör; anahtar `key.json`) |

## 2. Ölçümler (`results.json`)

Metin (3 cümle, motor başına tek koşu, örnekleme tohumu 1234):

> Bu kalemin içinde tam 7 parça var. Bilye uç yalnızca 0,7 mm genişliğinde ve her yazışta binlerce kez döner. Yay ise her tıklamada mekanizmayı geri iter; o çıt sesi tam burada doğar.

| Alan | Chatterbox ML V3 · hazır | FreyaTTS · Leyla |
|---|---|---|
| Kör sayfadaki etiket | Örnek **B** | Örnek **A** |
| Örnekleme hızı (ham) | 24 kHz | 48 kHz |
| Süre | 13,40 sn | 14,52 sn |
| `rtf_gen` (yalnızca `generate`/`synthesize`) | **0,63** | 0,30 |
| `rtf_incl_load` (model yükleme + üretim) | 1,81 | 0,66 |
| `rtf` (uçtan uca, Whisper dahil) | 2,05 | 0,90 |
| Tepe VRAM, nvidia-smi (tüm GPU, 0,25 sn örnekleme) | **3611 MB** | 1811 MB |
| Tepe VRAM, torch `max_memory_allocated` | 3251 MB | 1443 MB |
| `cer` (adil, §3) | **%0,5** | **%17,9** |
| `cer_raw` (plan metriği: ham ASR) | %13,9 | %27,9 |
| `cer_written` (yazılı metne karşı) | %0,56 | %20,3 |
| CER > %5 | hayır | **evet** |
| Konuşma hızı / medyandan sapma | 15,3 kar/sn / +%4 | 14,1 kar/sn / −%4 |
| `error` | yok | yok |

ASR (faster-whisper large-v3-turbo) çıktıları:

- **Chatterbox:** "Bu kalemin içinde tam 7 parça var. Bilye uç yalnızca 0 ,7 mm genişliğinde ve her yazışta binlerce kez döner. Yay ise her tıplamada mekanizmayı geri iter. O çıt sesi tam burada doğar." Tek hata "tıklamada → tıplamada".
- **Freya:** "Bu kalemin içinde tam 7 parça var. Bili uç yalnızca 0 ,7 mm gilmedi meşeğinde her yazışta binlerce ek kez döner. Yani ise her tıklamada mekanizmada mekanizmayı geri iter. O çıtlit tam burada doğar." Yanlış telaffuzlar (Bilye → Bili, genişliğinde → gilmedi meşeğinde, Yay → Yani, çıt sesi → çıtlit), fazladan hece ("ek") ve bir **tekrar** ("mekanizmada mekanizmayı"). Kısa tek cümlelik kontrolde Freya doğru çalışıyor (CER 0,0 ve 0,03); hata uzun, sayılı ikinci cümlede yoğunlaşıyor. Kurulum hatası yok (cuda:0, fp32, 48 kHz).

## 3. CER neden iki türlü

`cer_raw` plan metriğidir: `cer(normalize_tr(betik), ham_asr)`. Whisper sayıları **rakamla** yazar ("7", "0,7 mm"), `normalize_tr` ise betiği sözle açar ("yedi", "sıfır virgül yedi milimetre"). Bu yüzden doğru okunmuş bir cümle bile %13,9 ceza alır. Kapı için kullanılan **adil CER** iki tarafı da aynı normalizasyondan geçirir:

`cer = cer(normalize_tr(betik), normalize_tr(clean_asr(asr)))` (`clean_asr`: Whisper'ın "0 ,7" boşluğunu "0,7" yapar)

Spec §7.6'daki CER > %5 kapısı bu tanımla uygulanır (spec'e not düşüldü).

## 4. Varsayılan ve yedek motor

**Varsayılan: Chatterbox Multilingual V3.** Gerekçe:

- Adil CER %0,5: §7.6 kapısını (%5) rahat geçiyor. Freya %17,9 ile geçmiyor.
- Tepe VRAM 3611 MB (nvidia-smi) / 3251 MB (torch): §18'deki 5,67 GB sınırının altında; spec'in tahmini "4–6 GB"dan düşük. GPU kilidi altında yüklenip iş bitince boşaltılır (K22); Blender ile aynı anda çalışmaz.
- Hız yeterli: `rtf_gen` 0,63. 45 sn'lik bir anlatım ≈ 28 sn üretim + ~15 sn model yükleme; `voice` adımının 3–6 dk bütçesine sığar.
- Lisans MIT. Çıktıya Perth görünmez filigranı eklenir (`mtl_tts.py`, `apply_watermark`); G4 kararını değiştirmez.

**Yedek: FreyaTTS**, yalnızca VRAM baskısı Chatterbox'ı engellerse (tepe 1811 MB, `rtf_gen` 0,30, yani ~2× hızlı). Bugünkü hâliyle yedek **zayıf**: CER %17,9 sistematik yanlış telaffuzdan geliyor; §7.6'daki "yeni seed ile yeniden üret" adımı bunu düzeltmeyebilir. GPU işleri zaten sırayla çalıştığı için (K14, K22) VRAM baskısı beklenmiyor.

## 5. Anlatıcı sesi ve AIGC

- **Seçim: hazır ses** (Chatterbox'ın paketle gelen varsayılan koşullandırması, `conds.pt`; ses istemi verilmedi).
- **G4: ses için AI etiketi gerekmez.** Spec §8.1 G4 kuralı: Blender CG ve hazır TTS sesi → gerekmez; klon ses → zorunlu.
- **Klon: test edilmedi.** Kullanıcının kendi kaydı yok; kural gereği klon yalnızca kullanıcının **kendi** sesinden yapılır. Kullanıcı ileride kendi sesini kaydetmek isterse bu **yeni bir dinleme turudur** (plan Task 4 Step 6: `arecord -f S16_LE -r 24000 -c 1 -d 15 ~/videogen-data/m1/own_voice.wav`, ardından `listening_test.py --only chatterbox --clone …`). Klon varsayılan olursa her seslendirmeli videoda AI etiketi zorunlu olur (K17, G4) ve bitirme kartı bunu hatırlatır.

## 6. Sabitlenmiş sürümler

| Bileşen | Sabitleme |
|---|---|
| chatterbox-tts kaynağı | `github.com/resemble-ai/chatterbox` @ `5de7a54aa4e5e2baadb0182dde554908b48b85c2` (paket 0.1.7) |
| Chatterbox ağırlıkları | HF `ResembleAI/chatterbox` @ `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`, `~/videogen-data/models/chatterbox/` |
| İndirilen dosyalar | `t3_mtl23ls_v3.safetensors` (2.143.989.928 bayt, sha256 `5abca8321ede76f8e61f1cc0d19aea6c946b28871017ce8726f8a69203f05953`), `s3gen.pt` (1.057.165.844, `9b9ff07e…9dd0151d2a3`), `ve.pt` (5.698.626, `4b16d836…a372879f1`), `conds.pt` (107.374, `6552d705…ee9d87f4e`), `mtl_tokenizer.json`, `tokenizer.json`, `grapheme_mtl_merged_expanded_v1.json`, `Cangjie5_TC.json` |
| Yükleme | `ChatterboxMultilingualTTS.from_local(dir, "cuda", t3_model="v3")`. Kütüphane varsayılanı v2'dir; yalnız v3 indirildiği için `t3_model="v3"` **zorunlu** |
| FreyaTTS (yedek) | `github.com/freyavoiceai/FreyaTTS` @ `146d36c1cb6660646be57d31339db4eed9315de3`; ağırlıklar HF `freyavoice/freya-tts` @ `d124e074…`, `openbmb/VoxCPM2` @ `32279eff…` (yalnız `audiovae.pth`) |
| ASR | `mobiuslabsgmbh/faster-whisper-large-v3-turbo` @ `0a363e91…`, faster-whisper 1.2.1, `av==16.1.0` |
| Ortam | Python 3.12.13, torch 2.6.0+cu124; tam liste `python/audio_service/requirements.freeze.txt` |

sha256 değerleri HF indirme metadata'sındaki ETag'ten; `conds.pt` ve `ve.pt` için `sha256sum` ile yerelde teyit edildi.

## 7. Kullanıcı nasıl onaylar ya da değiştirir

1. `xdg-open ~/videogen-data/m1/listening/index.html` → Örnek A ve Örnek B'yi **kör** dinle (motor adları yalnızca kartların kapalı "Ölçümler" bölümünde ve `key.json`'da; önce açma).
2. Claude'a söyle: hangi örnek daha doğal ve neden (kendi sözlerinle); varsayılan anlatıcı hazır ses mi, klon mu.
3. Claude `docs/m1/decision.md`'yi günceller: "GEÇİCİ" kaldırılır, §1'deki "Kullanıcının seçtiği örnek ve gerekçesi" kullanıcının sözleriyle yazılır; spec K17 ve §9 TTS satırı buna göre güncellenir.

Olası sonuçlar:

- **B (Chatterbox) seçilirse:** karar olduğu gibi kesinleşir.
- **A (Freya) seçilirse:** varsayılan Freya olur; ama CER kapısı (%17,9 > %5) M5'te çözülmesi gereken açık bir risk olarak kaydedilir (normalizasyon/cümle bölme denemesi ya da Chatterbox'a düşüş).
- **Klon istenirse:** kullanıcı kendi sesini kaydeder, yeni dinleme turu yapılır; klon seçilirse AI etiketi zorunlu.

## 8. Uyarılar

- **İstatistiksel olarak zayıf:** tek 3 cümlelik metin, motor başına tek tohum. Chatterbox'ın tohumsuz ilk koşusunda ASR "Bilye"yi "Birliğe" duydu (`cer_raw` %14,9); örnekleme rastgeleliği gerçek. M5'te çok cümleli, çok tohumlu ölçüm yapılmalı.
- **Kör testte kalan ipuçları:** kör kopyalar ortak 48 kHz'e yeniden örneklendi ve RMS −23 dBFS'e eşitlendi; dosya adları nötr (`a.wav`, `b.wav`), sıralama tohumla karıştırıldı. Yine de Chatterbox içeriği 24 kHz kaynaklı olduğu için ~12 kHz üstü boş (bant sınırı duyulabilir) ve süreler farklı (13,4 / 14,5 sn).
- **Normalizasyon boşlukları** (saatler "14.30", sürümler/bölümler "17.2", sondaki %, kesme işaretli ekler, kesirler/sıra sayıları/m², tarihler) → M5 `voice` adımı.
- RTF ve VRAM tek koşudan; VRAM örnekleyicisi 0,25 sn aralıklı, çok kısa tepeleri kaçırabilir (torch değeri çapraz kontrol).
