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

## 5. Bekleyenler (GPU'lu makine, plan T12)

1. Tam doğrulama: pytest 50, `npm test` 428, `test:blender`, `test:render`, smoke.
2. Kalem pilotu kalibrasyonu (`docs/m5/real-check.md` §1), gerekirse `final@2`.
3. Ses servisi gerçek ölçümü (model yükleme, `rtf_gen`, tepe VRAM/RSS, CER dağılımı, altyazı hizası).
4. İki gerçek koşu (A seslendirmesiz, B seslendirmeli) "yayına hazır"a; video başına kullanım, reviewer isabeti, ekran görüntüleri.
5. K17 dinleme onayı (karar kullanıcının).
6. Bağımsız son review'un tam hâli (`2bd3f7a..HEAD`) ve spec/runbook/checklist notları.
