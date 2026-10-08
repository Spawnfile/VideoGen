# M5c — Seslendirme (VO), ducking, G4: özet

| | |
|---|---|
| Tarih | 2026-10-08 |
| Dal | `claude/elegant-keller-bgsue7` (M5c planı `eaa47fc`'den sonra 13 commit); kullanıcı kararıyla `main` bu dala **fast-forward** edildi (PR yok) |
| Plan | `docs/superpowers/plans/2026-10-07-m5c-voice.md` (12 görev). T1–T11 uygulandı; T12 **kısmi** (son review düzeltmeleri + bu özet) |
| Ortam | Bulut konteyneri: GPU, Blender, gerçek TTS/Whisper ve gerçek Claude yok. Node 24, ffmpeg 7.0.2, Postgres 16 (5433) |
| Durum | Seslendirmeli bir ürün Fake sürücülerle arayüzden "Yayına hazır"a gidiyor (smoke S2a). **Bekleyen (GPU'lu makine):** T12 Step 1–5 ve 6'nın tam hâli — `test:blender`, `test:render`, ses servisi pytest'i, kalem pilotu kalibrasyonu, ses ölçümü (RTF, VRAM, CER), iki gerçek "tükenmez kalem" koşusu (seslendirmesiz + seslendirmeli), video başına kullanım, K17 dinleme onayı |
| Kanıt | Bu dosya, `docs/m5/studio-voice.png`, ledger `.superpowers/sdd/2026-10-07-m5c-voice/progress.md`, git geçmişi |

## 1. Ne çalışıyor

- **Sözleşmeler** (`packages/shared/src/voice.ts`): `AudioPlan`, `voice_track`, anlatıcı sesi ayarı, G4 (AI beyanı) kuralı, VO metin muhafızı, satır yerleşimi ve yeniden zamanlama, altyazı sayfaları.
- **Ses CLI'ı** (`python/audio_service`): iş başına tek GPU süreci (TTS → boşalt → Whisper → boşalt), CER kapısı ve yeniden tohumlama, 48 kHz kırpılmış satırlar. Sürücü (`apps/worker/src/audio/driver.ts`) çağıranın GPU kilidi altında boş env ile çalıştırır.
- **`voice` adımı**: storyboard VO'ya göre yeniden zamanlanır; `voice_track` + stem artefaktları; storyboard adımında VO muhafızı.
- **compose**: VO stem, deterministik ducking (12 dB), saklanan/lisanslı ses planı, iki varyantta VO; Remotion altyazı bandı (`layout.json` + G6).
- **Düzeltme döngüsü**: `voice` kapsamı — süreler korunursa sahne yeniden kullanılır, değişirse builder devam eder; ses planı yalnız compose'u koşturur.
- **Reviewer'lar**: sözlü iddialar, sözlü kanca, altyazı bandı; G4 orkestratör kuralı (klon ses → AI etiketi zorunlu).
- **Arayüz**: Stüdyo'da Seslendirme kartı (stem oynatıcı, satır CER'leri, "GEÇİCİ (K17)"), Ayarlar'da anlatıcı sesi.

## 2. Görevler

| # | Görev | Commit |
|---|---|---|
| — | İki yavaş testin `test:render`'a taşınması | `25a9d8b` |
| T1 | Ses sözleşmeleri | `1244008` |
| T2 | Döngü mantığında `voice` ve `audio` | `7a7a7ce` |
| T3 | Python ses CLI'ı | `0d1189a` |
| T4 | Ses sürücüsü, anlatıcı ayarı, ön kontrol | `425cc6a` |
| T5 | `voice` adımı | `62203a7` |
| T6 | Altyazı bandı | `0f7592b` |
| T7 | compose: VO, ducking, `AudioPlan` | `c4e241d` |
| T8 | `voice` kapsamlı düzeltme turu | `3d7343e` |
| T9 | VO'lu reviewer'lar, G4, uçtan uca | `e4f40a7` |
| T10 | API ve Stüdyo | `8945b0c` |
| T11 | Smoke S2a seslendirmeli | `1041e9e` |
| T12 (kısmi) | Son review düzeltmeleri | `006e876` |

## 3. Son review düzeltmeleri (`006e876`)

- Ajan Bash'i: `python3 -I -m py_compile` zorunlu (yalıtılmış kip; aksi hâlde çalışma klasöründeki sahte `py_compile.py` içe aktarılabilirdi). Guard, rol istemleri, builder/fixer ajan metinleri ve spec §6.3 güncellendi.
- Fixer'ın yazma kapsamı `writeDirs: null` → `['scene']` (`review/`, `final/`, `voice/` altına yazamaz).
- Ses sürücüsü: iş dosyası mutlak yol, `PYTHONSAFEPATH=1`, cwd = çıktı klasörü.
- `voKey` vuruş kimliğini içerir (aynı metinli iki vuruş çakışmaz).
- `review` adımı replay'de `loop.stop` audit'ini tekrarlamaz.

## 4. Doğrulama (bu ortamda)

`npm run typecheck` temiz; paket bazında vitest: shared 66, db 43, claude 48, api 33, web 41 geçti; worker paketinden yalnızca değişen dosyaların testleri (audio-driver, review-step, voice-step) koşuldu ve geçti. Tam worker suiti kullanıcı kararıyla iptal edildi (tek komutla `npm test` bu konteynerde bellek/süre sınırına takıldı). `test:blender`, `test:render`, ses servisi pytest'i ve smoke bu turda yeniden koşulmadı (smoke T11'de 19/14).

## 4b. İkinci oturum (2026-10-08, yine bulut konteyneri)

T12'yi GPU'lu makinede kapatmak için açılan oturum **GPU'suz bir bulut konteynerinde** çalıştı. Konteynerde GPU yok (`nvidia-smi` ve `/dev/nvidia*` yok), Blender, ses venv'i ve modeller de yok. Bu nedenle Step 1'in GPU kısmı ve Step 2–5 burada yapılamadı. Ölçüm uydurulmadı. Yapılanlar:

- **Tam worker suiti ilk kez koşuldu:** `npm run typecheck` temiz. `npm test` düzeltmelerden önce 88 dosya, **427/427** geçti (328 sn). Plandaki sayı 428'di. Fark atlanan bir test değil, plan aritmetiğinden geliyor; atlanan test yok. Düzeltmelerden sonra **430/430** (+3 test: rewind, guard, `runProcess`).
- **Ses servisi pytest'i: 50/50** geçti. Model yüklemeyen hafif bir venv kullanıldı (Python 3.12, faster-whisper 1.2.1, av 16.1.0, numpy, soundfile, pytest). Testler modelleri taklit ediyor; torch/Chatterbox ile tam venv kurulmadı.
- **`test:render`** (Blender'sız, `VG_REMOTION_GL=swangle`): 16 testin **11'i geçti** (VO'lu compose, M5c uçtan uca `voice`, tam kalem taslağı, qc, rötuş …). Kalan **5 test Blender gerektiriyor** (`blender.int` 4, `final.int` 1) ve atlama koşulları olmadığı için başarısız; GPU'lu makinede koşulacak. `swangle` verilmeden yapılan ilk deneme 24 dakika boyunca CPU kullanmadan bekledi ve durduruldu; README'deki GPU'suz makine notu bu yüzden zorunlu.
- **Bağımsız son review** (`2bd3f7a..HEAD`, M5b + M5c birlikte, Step 6 odak listesi): §8.

## 5. Bekleyenler (GPU'lu makine, plan T12)

1. Tam doğrulama: `test:blender` ve `test:render` Blender ile (15). Ses servisi pytest'i torch/Chatterbox'lı gerçek venv ile. Smoke. (`npm test` 430 ve hafif venv'de pytest 50 bulutta geçti, §4b.)
2. Kalem pilotu kalibrasyonu (`docs/m5/real-check.md` §1), gerekirse `final@2`.
3. Ses servisi gerçek ölçümü (model yükleme, `rtf_gen`, tepe VRAM/RSS, CER dağılımı, altyazı hizası).
4. İki gerçek koşu (A seslendirmesiz, B seslendirmeli) "yayına hazır"a; video başına kullanım, reviewer isabeti, ekran görüntüleri.
5. K17 dinleme onayı (karar kullanıcının).
6. Spec notları (Step 7, yalnızca gerçek koşu kanıtıyla) ve runbook §6 ölçüm satırları. Son review yapıldı (§8).

## 8. Son review (bağımsız, salt okunur, 2026-10-08)

Kapsam `git diff 2bd3f7a..HEAD` (164 dosya), plan T12 Step 6 odak listesi. Her bulgu kodda izlendi.

| # | Önem | Bulgu | Sonuç |
|---|---|---|---|
| 1 | Critical | Final döngüsünde geri sarma her adımın `fix_round`'unu kendi değerinden +1 artırıyordu. Dar bir turdan (compose) sonra gelen geniş bir tur (build) build…final_render'ı 1'de, compose…review'ı 2'de bırakıyordu. Adımlar nedenlerini `roundCause(fixRound)` ile okuduğu için build önceki turun nedenini görüyordu: fixer'ın sahnesi atılıyor ve opus builder baştan yazıyordu (~35 dk opus). | Düzeltildi: aralıktaki her adım `review'un turu + 1` alıyor (`packages/db/src/pipeline.ts`). RED → GREEN: `rewind.test.ts` "a wider round after a narrower one…" |
| 2 | Important | Web araçlı roller (researcher, reviewer_facts) run dizini dışındaki gizli olmayan dosyaları `Read` ile okuyabiliyordu; düşmanca bir sayfa Read → WebFetch sızdırmasına yönlendirebilirdi. | Düzeltildi: web aracı olan rollerin `Read`'i run dizini ve `~/.claude/skills` ile sınırlı (`guard.ts`). Rol istemleri dışarıyı okumayı istemiyor. RED → GREEN: `guard.test.ts` |
| 2b | Important → ertelendi | reviewer_facts'in serbest metin `fix_hint`'i çitli veri olarak fixer'a gidiyor. | Ertelendi (§9): aynı yüzey researcher → storyboard yolunda da var. Düzeltme turu yeniden incelemeden geçiyor ve M6'da yayın insan onaylı. Hint'i kaldırmak fixer'ın hangi iddiayı düzelteceğini bilmesini engeller. |
| 6 | Minor → düzeltildi | `runProcess` başlatılamayan bir ikili için (örn. ön kontrolden sonra silinen venv) yakalanmamış `'error'` ile worker'ı düşürüyordu. | Düzeltildi: başarısız sonuç döner (`code: null`, kuyrukta `spawn failed: ENOENT`), sürücü bunu `crash` hatasına çevirir. RED → GREEN: `render.test.ts` |

Doğrulanıp sorunsuz bulunanlar: fan-out replay (benzersiz indeks + `ON CONFLICT DO NOTHING`), fixer replay (`pendingOf`), tek transaction'da rewind ve sürüm satırı sırası, kapsam hesabı (VO metni, zamanlama, `audio`), fixer `writeDirs: ['scene']` + `python3 -I -m py_compile`, ses CLI'ının boş env'i/süreç grubu/sonuç yolu kontrolü, `loop.stop` tekrarsızlığı. Whisper transkripti kendi TTS'imizden geliyor, 600 karakterle kesiliyor ve çitleniyor; ek yüzey yok.

## 9. Ertelenenler

- **(2b) `reviewer_facts` `fix_hint` → fixer:** M6'da yayın öncesi insan onayı varken kabul edilebilir. Kalıcı çözüm: claims kontrollerinde ipucunu kontrol ve iddia kimliğinden şablonla üretmek, WebFetch'i `targets` URL'leriyle sınırlamak.
- **(3) G4 durdurma notu:** `voice_track` yokken not "klon ses için AI etiketi gerekli" diyor. Doğru ifade "seslendirme izi bulunamadı" olur.
- **(4) Fixer'ın VO'lu videoda vuruş kimliğini değiştirmesi:** compose "bayat artefakt" ile düşer. Aynı oturumda reddedilmeli (`voKey` eşitliği).
- **(5) voice replay retime → keep:** Yetim kalan yeniden zamanlanmış storyboard compose'u "bayat" ile düşürebilir. Yalnızca çökme + deterministik olmayan TTS ile olur.
- **(7) Ses CLI'ı sınırları** (`maxRssMb` 6000, `timeoutMs` 900 sn): ölçülmedi, GPU'lu makinede ölçülüp config'e alınmalı.
- **(8) `review` bayatlık kontrolü** yalnızca kareler ve `musicSha` üzerinden. `voKey` kontrolü compose'da var; boru hattı sırası bayat durumu engelliyor.

