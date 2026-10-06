# M4 — Dikey dilim: rapor (M4a + M4b + M4c)

| | |
|---|---|
| Tarih | 2026-10-06 |
| Planlar | `plans/2026-10-06-m4a-pipeline-core.md`, `plans/2026-10-06-m4b-scene-core.md`, `plans/2026-10-06-m4c-draft-review-player.md` (11 görev) |
| Dal | M4c: `claude/elegant-keller-bgsue7` (`main` `8379279` üstünde), `main`'e `--no-ff` birleştirildi |
| Durum | **Uygulandı.** S2 taslakla yeşil. Açık tek çıkış maddesi: K12 modelleriyle ilk gerçek ürün ve video başına kullanım (GPU + abonelik gereken makinede, §4) |
| Kanıt | Bu dosya, `docs/m4/real-check.md` (M4c bölümü), `docs/m4/studio-draft*.png`, `docs/m4/library-draft.png`, `docs/m4/real-draft-sheet.png`, git geçmişi |

M4a ve M4b ayrıntıları: `docs/m4/m4a-summary.md`, `docs/m4/m4b-summary.md`. Bu rapor M4c'yi ve M4'ün bütününü anlatır.

## 1. Ne çalışıyor (kullanıcı gözüyle)

Ürün adı → **research → storyboard → build → draft_render → draft_review**.

- **Taslak render:** Blender'ın GLB'si ve kamera izi, `packages/remotion`'daki `Draft3D` bileşeniyle (Three.js-in-Remotion) 540×960, 30 fps, sessiz h264 taslağa çevrilir. Arka plan kanal stilinin gradyanı; kanca, vuruş metni ve en çok 6 etiket güvenli alanda, çakışmasız ve yalnızca kadrajdaki parçalara. Render worker'da değil çocuk süreçte; GPU kilidi ve §6.4 ön kontrolünden geçer; ffprobe ile §7.5'e göre doğrulanır.
- **Taslak incelemesi:** reviewer_visual 12 karelik kontakt sayfasına ve en çok 12 tek kareye (`extract_frames`) bakarak 8 sabit kontrolü yanıtlar. Karar deterministiktir (önem kontrol kimliğinden gelir). `revise` → build…draft_review yeni tura alınır, builder kendi oturumunda yalnızca başarısız kontrolleri düzeltir; en çok 2 geri dönüş, sonra "insan gerekli". Değişmeyen düzeltme ve bayat taslak incelenmez.
- **Stüdyo:** başlıkta "Taslak turu k/2 · %N"; "Taslak MP4" (varsayılan, HTML5 + Range) ve canlı "Taslak" (`@remotion/player`, yalnızca sekme açıkken) sekmeleri; inceleme kartı bulguları ve kareleri gösterir. Kısayollar Space, J, K, L, N.
- **Kütüphane:** satırda kapak (9:16) ve süre; satır Stüdyo'da açılır ve oynar.
- **Kullanım kapısı:** muhafız kapalıyken "Üret" run'ı `queued` bırakır ("Kullanım sınırı yakın: … (açılış SS:DD)."); muhafız açılınca kendiliğinden başlar; worker yeniden başlasa da kapı korunur.

## 2. Görevler (M4c)

| # | Görev | Commit | `npm test` (plan → gerçek) |
|---|---|---|---|
| T1 | `Review` sözleşmesi, `DRAFT_CHECKS`, `draftDecision`, `reviewRefErrors` | `87baf97` | 276 → 276 |
| T2 | Migration 0006 `steps.round`, `rewindForReview`, `draftRound` | `8a64d97` | 279 → 279 |
| T3 | Orchestrator: rewind, GPU tek kapı, kullanım kapısı, koşullu kurtarma (+ son review I1, M5) | `9358150` | 284 → 284 (+2 review) |
| T4 | `packages/remotion` I: Draft3D, props, yerleşim, `bundleHash` (+ kadraj dışı etiket) | `eab4113` | 287 → 287 (+1) |
| T5 | Render katmanı: `render-cli`, `RenderDriver.draft`, ffprobe, Fake taslak, PID (+ son review I2) | `5551c5d` | 291 → 291 (+1) · render +2 |
| T6 | `draft_render` adımı, builder düzeltme turu | `40d2b49` | 295 → 295 |
| T7 | `extract_frames` MCP aracı | `d55b119` | 299 → 299 |
| T8 | `draft_review` adımı, Fake senaryolar (+ son review M3) | `eb098de` | 305 → 305 |
| T9 | Player, tur başlığı, inceleme kartı, kütüphane, kısayollar | `39ec763` | 308 → 308 · smoke 15/9 |
| T10 | Smoke S2 (taslak) | `2559530` | 308 · smoke 17/9 |
| T11 | Gerçek sürücüyle adım testi; dokümanlar | `9dc3603`, docs | **312** · render +1 |

## 3. Doğrulama

| Komut | Sonuç |
|---|---|
| `npm run typecheck` | temiz |
| `npm test` | `Test Files 62 passed`, `Tests 312 passed (312)` |
| `VG_REMOTION_GL=swangle npx vitest run -c vitest.render.config.ts apps/worker/test-render/draft*.int.test.ts` | `3 passed` (252 sn): 60 karelik taslak + bundle önbelleği + 0. kare arka plan rengi ±8; iptal Chrome'u öldürür; 1351 karelik tam taslak adımlardan geçer |
| `npm run test:smoke` | `17 passed`, `9 skipped`, 1,9 dk (< 3 dk); sonrasında `/tmp/videogen-smoke` yok, süreç yok |
| `VG_SCREENSHOTS=1 … screens -g M4c` | `2 passed`; 4 ekran |
| Launcher (`bin/videogen.mjs`) uçtan uca, geçici DB | run `done`, Range 206, audit zinciri `ok`, temiz kapanış (`real-check.md` M4c §1) |
| `npm run test:blender`, Blender'lı `test:render` (4) | **Bu ortamda koşulamadı** (Blender/bwrap/GPU yok); M4c bu kodlara dokunmadı (`python/`, `sandbox.ts` değişmedi) |

**S2 RED kanıtı (geçici mutasyonlar, geri alındı):**
1. `main.tsx`'te `addEventListener('keydown', on)` yorumda → "library" senaryosu düştü (`currentTime` 0'da kaldı).
2. Orchestrator'da `rewindForReview` çağrısı `false` → "flawed" senaryosu düştü ("Taslak turu 1/2" hiç görünmedi).

Son review düzeltmelerinin her biri önce başarısız testle (RED → GREEN) geldi.

## 4. Gerçek ürün ve video başına kullanım

**Koşulmadı.** M4c bulut konteynerinde uygulandı: GPU, Blender, bubblewrap ve Claude aboneliği oturumu yok. Gerçek Claude çağrısı yalnızca kullanıcının makinesinde ve kullanım kapısıyla yapılır (plan C30, spec §6.4); bu ortamda taklit etmek ölçümü anlamsızlaştırırdı.

Yerine yapılan gerçek-araç doğrulaması (`real-check.md` M4c):
- Blender'ın kalem GLB'sinden tam 45 sn taslak (1351 kare) gerçek Remotion + Chrome ile render edildi ve adımlardan, ffprobe doğrulamasından, kontakt sayfasından geçti.
- Render süresi: 194 sn yazılımsal GL'de (4 CPU); GPU'da P3 ölçümü ≈ 95 sn.
- Bellek: render ağacı tepe 2,1 GB.

**Yapılacak (kullanıcı makinesinde):** plan T11 Step 2 betiği; sonuç `real-check.md`'ye "M4c §4" olarak. Tahmini kullanım: üç opus oturumu (storyboard, build, reviewer) + sonnet research; düzeltme turu olursa builder oturumu sürdürülür. M4a'da yalnız research+storyboard haiku ile 5 sa ≈ %2 idi; opus build ve inceleme ile tek ürünün 5 sa payı belirgin biçimde yüksek olacak (başlama koşulu 5 sa < %25, koşu içinde > %80 → dur).

## 5. Ekranlar

- `docs/m4/studio-draft-round.png` — düzeltme turu: başlıkta teal "Taslak turu 1/2 · %0", adım notlarında düzeltilecek bulgu.
- `docs/m4/studio-draft.png` — "Taslak MP4" sekmesi (Fake taslak: sakin gece mavisi + kayan çubuk), kısayol ipucu.
- `docs/m4/studio-draft-live.png` — canlı "Taslak" sekmesi: kalemin 3D görüntüsü, plakalı kanca, "Gövde" etiketi.
- `docs/m4/library-draft.png` — kütüphane satırında kapak ve "· 0:02".
- `docs/m4/real-draft-sheet.png` — gerçek 45 sn taslaktan 4×3 kontakt sayfası (güvenli alan kırmızı).

## 6. Plandan sapmalar (Ruling)

| Konu | Karar | Neden |
|---|---|---|
| Ortam | Node 24.21, ffmpeg 7.0.2 (statik), Postgres 17 (dockerd), Chrome for Testing 141 (`/usr/bin/google-chrome`), `nvidia-smi` taklidi (yalnızca konteyner) | Sistem ffmpeg 6.1 `gradients speed=0`'ı reddediyor (prod ffmpeg ≥ 7); Playwright Chromium'da h264 yok |
| T3 | GPU kapısı `WaitInfo`'ya `status` eklendi; eski render testi güncellendi | Plan bu çağıranı atlamıştı |
| T5 | `VG_REMOTION_GL` (varsayılan `angle`) | GPU'suz makinede `swangle`; laptop davranışı değişmedi |
| T5 | Etiket genişliği 0,56 → 0,66 em/karakter; kanca plakalı | İlk gerçek taslakta etiket kesiliyor, kanca kahramana biniyordu |
| T4 (T11'de) | `placeLabels` kadraj dışı çapaları etiketlemez | Gerçek taslakta kadraj dışına giden etiket çizgileri |
| T6 | "reap" testi exec sonrasını bekler | Bash'in exec öncesi komut satırı da "render-cli" içeriyordu: yük altında execve ile yarış (aynı mekanizma eski Blender reap testinde de vardı; o da düzeltildi — handoff'taki "adı yakalanamamış kırılgan test" büyük olasılıkla buydu) |
| T9 | Fake taslak `testsrc2` yerine sakin kayan çubuk | Yüksek kontrastlı test deseni Stüdyo'da ve kütüphane kapağında görünüyordu (M4b'nin `testStill` ilkesi) |
| T11 | Gerçek ürün yerine gerçek-araç doğrulaması + yeni `draft-step.int.test.ts` | §4 |
| T11 | Son review'un 2 Important + 2 Minor'ı düzeltildi; ilgili görev commit'lerine fixup + autosquash (ağaç aynı) | Plan |

## 7. Son review (tek bağımsız reviewer, Claude Fable 5.1)

Sonuç: **Critical yok, 2 Important, 6 Minor.** Doğrulanmış sağlam bulunanlar: rewind atomikliği ve tekrar/iptal, kilit bekleyicisinin iptalde temizlenmesi, kayıtlı kararın oturumsuz yeniden verilmesi, bayat taslak koruması ve aynı tur `reuse`, geçici GLB sunucusu, `extract_frames` girdi sınırları, çitli veri, player'ın boşta CPU'su, PID regex'i.

| # | Bulgu | Durum |
|---|---|---|
| I1 | Worker yeniden başlayınca muhafız ilk kullanım okumasına kadar açık → `queued` run kapıyı aşıp başlıyordu | **Düzeltildi:** `UsageGuard.restore()` geçerli kayıtlı engeli `orchestrator.recover()`'dan önce yükler (test) |
| I2 | RSS sınırı Chrome'u ölçmüyordu (Remotion Chrome'u ayrı süreç grubunda başlatır) | **Düzeltildi:** `runProcess` alt süreç ağacını ölçer, ayrılmış grupları `render` PID dosyasına yazar, durdurma/kapanışta öldürür (test; gerçek render 2,1 GB) |
| M3 | Aynı turda yeniden denemede kare bütçesi sıfırlanıyordu | **Düzeltildi:** bütçe adım+tur anahtarında (test) |
| M5 | `startRun` eşzamanlı çağrılarda çift `run.started`; ayrıca arada gelen iptali geri alabiliyordu | **Düzeltildi:** `claimQueuedRun` koşullu UPDATE (test) |
| M4, M6, M7, M8 | §8 | Ertelendi |

## 8. Ertelenenler

- **M4** `rewind()` `rewindForReview` false dönerse ve run hâlâ `running`'se run işsiz kalabilir (gerçekçi bir sıralama kurulamadı). Sertleştirme: false'ta yeniden oku, `settle(failed)`.
- **M6** Değişmeyen düzeltme kontrolü GPU kilidinin içinde; "inatçı" tur gereksiz yere GPU sırası bekleyebilir.
- **M7** Kısayollarda Shift, tuş tekrarı ve IME (`isComposing`) süzülmüyor.
- **M8** Kütüphanede kapak ve video ayrı "en yeni" LATERAL'ları; kapak yazımı düşerse farklı taslaklardan gelebilir.
- Önceki taşlardan: M4a minor 1–3, 5–11; M3 minor 1, 2, 7, 9–11 (M5/M7).

## 9. M5 için notlar

- **Reviewer isabeti:** gerçek üründe henüz ölçülmedi (§4). İlk gerçek koşuda reviewer kararları ile göz incelemesi karşılaştırılmalı.
- **`no_intersection` minor (C3):** 540p'de z-fighting gürültülü; final reviewer'ı yakalar. Gerçek üründe gözlem sonrası yeniden değerlendir.
- **Draft3D görünüşü:** RoomEnvironment ile metaller okunuyor; 0. karede kahraman kadrajdan taşıyor (Blender kamerasının işi; `hero_frame0` sorusu yakalamalı). Inter yazı tipi, DOF ve hareket bulanıklığı final katmanında.
- **Swap eşiği (§6.4)** değişmedi; **K19** kullanıcı seçimi hâlâ bekleniyor (`gece_mavisi` GEÇİCİ); **K17** ses M5'te.

## 10. Bilinen sınırlar

- Taslak render GPU'da ≈ 95 sn, yazılımsal GL'de ≈ 3,3 dk (45 sn video).
- Player'ın "Taslak MP4" sekmesi h264 ister: Google Chrome gerekir (Chromium'da tescilli codec yok).
- Canlı "Taslak" sekmesi açıkken r3f sürekli çizer (sekme kapanınca durur).
- Bundle önbelleği ≈ 50 MB × 2; `packages/remotion/src` değişince çalışan run bayat taslak nedeniyle düşer (beklenen, runbook §7).
