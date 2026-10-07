# M5a — Final görüntü, ses ve otomatik kalite kapıları: özet

| | |
|---|---|
| Tarih | 2026-10-07 |
| Dal | `claude/elegant-keller-bgsue7` (plan commit'i `f9d9c52` üstünde); kullanıcı kararıyla `main` bu dala **fast-forward** edildi (PR yok) |
| Plan | `docs/superpowers/plans/2026-10-06-m5a-final-render-qc.md` (12 görev). T1–T11 uygulandı (inline yürütme, her görevden sonra self-review); T12 kısmi |
| Ortam | Bulut konteyneri: GPU, Blender ve kalem pilotu dosyası yok. Node 24.21, ffmpeg 7.0.2 (ffprobe 6.1.1), Postgres 16 (5433) |
| Durum | Seslendirmesiz bir ürün Fake sürücülerle finale ve otomatik kapılara kadar koşuyor. **Bekleyen:** `test:blender`, Blender final int testi, gerçek pilot kalibrasyonu, ilk gerçek ürün (`docs/m5/real-check.md`) |
| Kanıt | Bu dosya, `docs/m5/*.png`, `.superpowers/sdd/2026-10-06-m5a-final-render-qc/progress.md` (ledger), git geçmişi |

## 1. Ne çalışıyor

Taslak incelemesinden sonra plan üç adım daha koşuyor:
- **`final_render`** (GPU kilidi + §6.4, 2 GB disk payı): Blender `.blend`'in kendi ayarlarıyla şeffaf RGBA PNG kareleri yazar. Yeniden başlatmada tam kareler atlanır, yarım kare yeniden yazılır; çökme bir kez 32 örnekle denenir.
- **`compose`** (heavy_cpu): `layout.json`, Remotion `Final3D` (kareler stil arka planı üstünde, taslakla aynı `Overlay`/`labelsAt`), tek ffmpeg teslim kodlaması (High, CRF 17, GOP 60, yuv420p/tv/bt709, faststart), prosedürel CC0 SFX + defterden izinli müzik + iki geçişli loudnorm, `final_music.mp4` ve `final_tiktok.mp4` (`-c:v copy`), kapak.
- **`qc`** (heavy_cpu): qc_probe her iki varyantı ölçer; rubrik `final@1` kapıları (G1 teslim, G5 flaş, G6 manifestten güvenli alan) ve puanları (D6 12, D7 5). Kapı düşerse video `insan gerekli` + Türkçe gerekçe; geçerse not "Final video hazır ve otomatik kontrolden geçti. İnceleme ve "yayına hazır" kararı M5b'de."

Stüdyo'da "Final" sekmesi (varsayılan; Müzikli/Müziksiz çipi) ve "Otomatik kontrol" kartı; kütüphane kapak ve süreyi finalden alır. Varlık defteri (migration 0007) ve `bin/assets.mjs`; `qc-cli`. Terminal run'ın kareleri ve `.blend` kopyası silinir; compose ara dosyaları kayıttan sonra silinir.

## 2. Görevler

| # | Görev | Commit | `npm test` (plan → gerçek) |
|---|---|---|---|
| T1 | Rubrik `final@1`, QC sözleşmesi | `cfbd989` | 318 → 318 |
| T2 | Varlık defteri, lisans kapısı, CLI, prosedürel SFX | `597a3ca` | 323 → 323 |
| T3 | `vg_blender` final render | `3fd5cbe` | Blender 19 → koşulamadı (sahte `bpy` ile sınandı) |
| T4 | `final_render` adımı, kare temizliği | `3978e64` | 327 → 327 |
| T5 | `Overlay`, `Final3D`, `layout.json` | `2f6e7bd` | 331 → 331 |
| T6 | Jetonlu kare sunucusu, final Remotion render'ı | `172a897` | 333 → 333 · render (Blender'sız) 5 |
| T7 | Ses planı, mastering, teslim kodlaması, varyantlar | `a6c12c9` | 338 → 338 |
| T8 | `compose` adımı | `50e8b73` | 341 → 341 |
| T9 | qc_probe, `qc-cli` | `fb3e5c8` | 347 → 347 |
| T10 | `qc` adımı, M5a planı, `until` | `c2748f4` | 351 → 351 · smoke 17/9 |
| T11 | Final sekmesi, QC kartı, kütüphane, smoke S2 final | `a574a1a` | 355 → 355 · smoke 19/11 |
| T12 | Doğrulama (kısmi), son review, dokümanlar | `eb5dde2` + bu dosya | — |

## 3. Doğrulama (bu ortamda)

- `npm run typecheck` temiz; `npm test` **355 geçti** (4 dk 42 sn).
- `npm run test:smoke` **19 geçti / 11 atlandı** (3,8 dk; hedef 3 dk aşıldı: S2a, S2d ve M5a ekran testi finale kadar koşar, senaryo kısaltılmadı).
- `test:render` Blender'sız dosyalar (gerçek sistem Chrome, `VG_REMOTION_GL=swangle`): taslak 2 + taslak adımı 1 + final compose 2 = **5 geçti**.
- Yapılamayan: `test:blender` (19), Blender final int testi (1), Blender test:render (4). GPU'lu makinede `docs/m5/real-check.md` §0.

## 4. Pilot kalibrasyonu

Gerçek pilot dosyası bu ortamda yok (§1 bekliyor). Pilot benzeri sentetik klip (14 sn): I −29,3 LUFS, LRA 16,9 LU, ilk ses 0,81 sn, 1,3 sn sessizlik, 1,3 sn donma, yuvj420p/pc, üst bantta metin izi → **7 hatanın hepsi** ve G1 yakalandı. Temiz 36 sn final yalnızca içeriğe bağlı `d7_bitrate` (düz fake görüntü) ve `d8_loop`'ta düşer.

## 5. Gerçek ürün ve video başına kullanım

Koşulmadı (GPU + gerçek Claude gerekir). Tarif ve kayıt tablosu `docs/m5/real-check.md` §2; M4'ün "ilk gerçek ürün" ve "video başına kullanım" maddeleri açık kalır.

## 6. Ekranlar

`docs/m5/studio-final.png` (Final sekmesi seçili, teal), `docs/m5/studio-player.png` (oynatıcı + ortalı varyant çipleri), `docs/m5/studio-qc.png` (QC kartı: kapılar ✓, Ses 12/12, Teknik cila 4/5), `docs/m5/library-final.png` (final kapağı 9:16, "· 0:45").

## 7. Sapmalar (ledger `Ruling:` satırları, özet)

- Dal adı oturumun dalı; ortam (Node 24, ffmpeg 7 statik, yerel Postgres, smoke için `docker` shim'i ve `/usr/local/bin/ffmpeg`).
- **Bulunan hatalar:** `ultrafast` x264 `-profile:v high`'a rağmen Constrained Baseline işaretliyordu (`-x264-params cabac=1:8x8dct=1`); `drawbox` hareket edemez (fake final ve pilot klibi donuktu → `overlay`); qc anahtar kare ayrıştırması sondaki boş satırı 0 sayıyordu; AAC kodlaması mastering sınırlayıcısını 0,6–1,1 dB taşırıyordu (−0,4 dBTP) → −2 dBTP hedefi + teslim dosyası ölçülüp gerekirse sınırlayıcı indirilerek yeniden mastering (smoke: −14,6 LUFS, Ses 12/12).
- **Plan düzeltmeleri:** `IMPLEMENTED_STEPS` T10'a kadar genişlemediği için T4/T8 testlerinde geçici plan; test sabitinde `drawbox` alfa yazmıyordu (`replace=1`); pilot klibinde LRA için 4 sn dönemler; `as never` yayılımı; S2a iptalinde 8 adım; hand-written `RenderDriver` nesnelerine `final`/`compose`.
- **Performans:** qc görüntü geçişi 540 px'te (16,1 → 5,6 sn, aynı sonuç); final adım testleri kapsam için `npm test`'te kaldı (4,7 dk).
- loudnorm sabit test sinyalinde (LRA 0) dinamik moda düşer; LRA > 0 içerikte doğrusal kalır (ölçüldü).

## 8. Son review (tek bağımsız reviewer, salt okunur)

Critical yok. Review Focus'un beş maddesi doğrulandı.
- **Düzeltildi:** I1 compose ara dosyaları (~150–250 MB/run) hiç silinmiyordu → kayıttan sonra silinir, `.blend` kopyası terminalde; I2 ledger compose sırasında değişirse hash kayıyor ve qc "bayat" diyordu → `run` tek kaynak kullanır, qc bayatlığı müzikli finalin `framesHash`'iyle sahnenin güncel hash'ini karşılaştırır; M3 kullanımda lisans politikası da denetlenir; M4 TP düzeltmesi ≤ 3 tur; M5 `measureLoudnorm` `-vn`; M6 qc layout'u ve varyantı aynı compose hash'iyle seçer, manifest yoksa kenar taraması açılır; M7 bölünmeyen uzun kelime (`overflow-wrap: anywhere` + `wrapLines` parçalar); M8 aynı dosyanın yeniden içe aktarılması `asset.exists` audit'i yazar, eski kararı korur. Her biri için test eklendi.
- **Ertelendi (M5b):** M9 çökme sonrası devamda 64/32 örnekli karelerin karışması (E5 kabul; bölünme karesi not/audit'e yazılmalı); M10 `failed` run'da karelerin silinmesi (E6; temizlik `finalize`'a taşınınca çözülür).

## 9. Ertelenenler

- Yukarıdaki M9, M10. İçe aktarılan SFX'in ses planına girmesi, `run_qc` MCP aracı, reviewer'lar, fixer, "yayına hazır" (M5b). VO, ducking, G4 (M5c). Varlık defteri arayüzü (M7).

## 10. M5b için notlar

- Reviewer'lara giden otomatik ölçümler: `qc_report` (D2 siyah, D3 donma, D8 döngü puansız). D6 alt puanları türetilmiştir, kalibrasyonda gözden geçirilmeli.
- Fixer kapsamları: compose kapsamlı tur kareleri yeniden kullanmalı → kare temizliği `finalize`'a taşınmalı (şu an terminal run'da).
- Prosedürel SFX'in kalitesi (slop riski) dinlenmeli; müzik kürasyonu elle (`bin/assets.mjs`).
- `freezedetect n=0.001` yavaş CG hareketinde yanlış donma verebilir (540 px'te ölçülüyor).

## 11. Bilinen sınırlar

- Smoke 3,8 dk (> 3 dk hedefi). `npm test` 4,7 dk.
- Gerçek Blender final render bu ortamda hiç koşmadı; Remotion `<Img>` ile 1351 tam boy PNG'nin birleştirme süresi ölçülmedi (30 karede ölçüm `test:render`'da).
- TikTok varyantı (yalnız SFX) loudness'ı denetlenmez (−15 civarı); yalnızca G1 ve gerçek tepe.
