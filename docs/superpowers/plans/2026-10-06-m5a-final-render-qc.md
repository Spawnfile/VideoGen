# M5a — Final görüntü, ses ve otomatik kalite kapıları (Blender final, Remotion birleştirme, SFX + müzik + mastering, iki varyant, qc_probe, varlık defteri) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Taslak incelemesinden geçen bir üründe pipeline üç adım daha koşsun:
- **`final_render`:** Blender EEVEE (64 örnek, raytracing, AgX Punchy) ile 1080×1920 RGBA PNG kareleri. GPU kilidi ve §6.4 kapısından geçer; yeniden başlatmada kaldığı kareden devam eder; çöküşte bir kez 32 örnekle yeniden dener.
- **`compose`:** Remotion `Final3D` bileşeni kareleri kanal stilinin arka planına bindirir ve taslaktaki metin/etiket katmanını aynı kodla çizer. Görüntü bir kez teslim biçiminde kodlanır. Ses: `events.json` ve storyboard'dan deterministik SFX, varlık defterinden lisanslı müzik, iki geçişli loudnorm (−14 LUFS, −1 dBTP). İki varyant: `final_music.mp4` ve `final_tiktok.mp4` (`-c:v copy`).
- **`qc`:** qc_probe (ffprobe + ebur128 + silence/black/freeze + flaş + döngü SSIM + güvenli alan) rubriğin otomatik kapılarını (G1, G5 flaş, G6) ve otomatik boyutlarını (D6 Ses, D7 Teknik cila) puanlar. Kalem pilotunun 7 bilinen hatasını yakalar.

Stüdyo "Final" sekmesinde iki varyantı oynatsın; otomatik kontrol kartı kapıları ve ölçümleri göstersin; kütüphane final kapağını ve süresini göstersin. Kapanışta M4c'den bekleyen ilk gerçek ürün (K12) bu kez finale kadar tek koşuda koşulsun; video başına kullanım ölçülsün; kalem pilotu qc_probe ile kalibre edilsin; `main`'e birleştirilsin.

**Architecture:**
- **Tek geometri ve hareket kaynağı (K7, K23):** Blender `.blend`'i final kareleri üretir. Remotion katmanı (metin, etiketler) taslakla **aynı** bileşenden (`Overlay`) gelir; etiket çapaları yine GLB + `camera_track` matematiğiyle (`packages/scene3d`) hesaplanır, WebGL çizimi yoktur.
- **Render (K22):**
  - `final_render` GPU adımıdır: orchestrator'ın tek kapısı (`ResourceLocks` + §6.4 ön kontrolü, `extraDiskMb` 2000). Blender bwrap içinde, `final_cli.py` ile; ilerleme gerçek kare sayısıdır.
  - `compose` `heavy_cpu` adımıdır: Remotion çocuk süreci (`render-cli --composition final`), kareler ve GLB tek seferlik jetonlu 127.0.0.1 yolundan sunulur.
- **Ses (K24, §7.6):** Remotion sessiz render eder; SFX zaman çizelgesi, müzik yatağı ve mastering ffmpeg'dedir. Seslendirme (VO) M5c'dedir; bu planda yalnızca seslendirmesiz mod.
- **Kalite (§8.1–§8.2):** Rubrik `packages/shared/src/rubric.ts`'te (sürüm `final@1`). Otomatik kontroller deterministik ve kimlikleri sabittir; LLM reviewer'lar M5b'dedir. Bir kapı düşerse run gerekçeli `needs_human` olur (fixer M5b'de).
- **Varlıklar (§9):** `assets` tablosu (migration 0007) + lisans kapısı. SFX kütüphanesi ffmpeg ile prosedürel üretilir (CC0, kendimiz); müzik `bin/assets.mjs` ile içe aktarılır. İzinli olmayan varlık render'a giremez.

**Tech Stack:**
- Mevcut: Node 24.18, TypeScript 7, zod 4.6.5, Fastify 5, pg 8.23.1, drizzle-kit, React 19.3, Vite 8.3.2, Tailwind 4.3.3, TanStack Query 5.104.1, vitest 5.0.3, @playwright/test 1.63.0, `remotion`/`@remotion/*` 4.0.533, three 0.186.1, r3f 9.8.1, Blender 5.2 (`bin/blender-gpu`), bubblewrap, ffmpeg/ffprobe ≥ 7.
- **Yeni bağımlılık yok.**

**Spec:** `docs/superpowers/specs/2026-10-06-videogen-design.md`:
- §4: K7, K8, K9, K22, K23, K24; §6.4 (GPU ön kontrolü, disk); §7.1 adım 7–9; §7.4 (manifestler: `layout.json`); §7.5 (Blender final, Remotion, kodlama); §7.6 (SFX, mastering, varyantlar, disk); §8.1–§8.2 (rubrik, AUTO/MANIFEST sırası, boyut sahipliği); §8.3 (kalibrasyon, bayat artefakt); §9 (SFX, müzik, lisans kapısı); §11.1 (`assets`); §13.1 (Final sekmesi); §14 (GPU belleği yetmedi: düşük ayarla bir kez); §16.2 S2; §17 M5; §18.

Önceki taşlar: `docs/m4/report.md` (§4 bekleyen gerçek ürün, §8 ertelenenler, §9 M5 notları), `docs/m4/real-check.md` (M4c), `docs/m1/decision.md` (K17: M5c).

## Kapsam ve bölme

M5 (spec §17: Blender final, ses, compose ve varyantlar, qc_probe, reviewer'lar, düzeltme döngüsü, kalem pilotuyla kalibrasyon; çıkış: rubrik pilotun 7 hatasını yakalıyor + gerçek bir ürün "yayına hazır") 12 göreve sığmıyor. M4 gibi üçe bölündü:

| Plan | İçerik | Çıkış |
|---|---|---|
| **M5a (bu plan, 12 görev)** | Rubrik `final@1` + QC sözleşmesi, varlık defteri + lisans kapısı + prosedürel SFX (0007), Blender final render (devam, düşük ayarla yeniden deneme), `final_render` adımı + kare temizliği, `Overlay` + `Final3D` + `layout.json`, final Remotion render'ı, SFX/müzik/mastering/varyantlar, `compose` adımı, qc_probe, `qc` adımı, Final sekmesi + QC kartı + kütüphane, smoke S2 final, kapanış (gerçek ürün finale kadar, pilot kalibrasyonu) | Seslendirmesiz bir ürün finale ve otomatik kapılara kadar; **rubrik pilotun 7 hatasını yakalıyor**; ilk gerçek ürün + video başına kullanım (M4'ten devir) |
| **M5b** (`plans/2026-10-06-m5b-review-fix.md`, yazılacak) | `reviews`/`findings` tabloları, final `Review` (`final@1`, 3 reviewer, boyut sahipliği, K13 puanı), `review` adımı (paralel 3 oturum, `run_qc`, sınırda ikinci görsel review), fixer + `FixReport` + yeniden render kapsamı, ≤ 3 tur, regresyon ve salınım, en iyi sürüm, `finalize` → "Yayına hazır", inceleme kartları | Smoke S2 tam sürüm ("Yayına hazır"); gerçek ürün "yayına hazır" (seslendirmesiz) |
| **M5c** (`plans/2026-10-06-m5c-voice.md`, yazılacak) | Ses servisi (Chatterbox + Whisper, GPU kilidi altında yükle/boşalt), `voice` adımı + audio_director + `AudioPlan`, storyboard'un yeniden zamanlanması, altyazı, ducking, VO'lu compose, G4, M5 raporu | Seslendirmeli ürün "yayına hazır"; M5 çıkışı |

Her plan bitince `main`'e birleştirilir (kullanıcı tercihi: M4c'de doğrudan `main`).

## M4'ten gelen gerçek arayüzler (`main`, HEAD `91b6c5d`)

İmzalar repodaki koddan okunmuştur.

- **Adım yürütücüsü** (`apps/worker/src/pipeline/types.ts`): `StepContext { runId, stepId, key, attempt, round, videoId, productId, productName, audioMode, versionId, runDir, signal, progress(pct, source), status(s, note?), session(id) }`; `StepOutcome = done{note?} | needs_human{reason} | failed{error, retry?} | cancelled | rewind{to, reason}`; `StepExecutor { key; resource; extraDiskMb?; inputHash(ctx); reuse?(ctx, hash); run(ctx, hash) }`.
- **Orchestrator** (`orchestrator.ts`):
  - `execute()`: `reuse` kilitten önce; `resource !== 'claude'` ve `locks` varsa `gated()` → `withResource(locks, resource, {onWait → waiting_gpu/waiting_disk + not, extraDiskMb})`. `heavy_cpu` da bu yoldan kilitlenir (kapasite 1).
  - `finish(runId, status, reason?)`: plan `finalize` içermiyorsa `done` → video `needs_human` + `PIPELINE_INCOMPLETE_NOTE(last)`; `DONE_NOTE`/`NOT_YET` tabloları.
  - `cancel(runId)`; `claimQueuedRun`; `rewindForReview`.
- **Adımlar** (`steps.ts`):
  - `StepDeps { pool, dataDir, manager, fakeScript?, scene?: SceneDeps, reviews? }`; `SceneDeps { pool, render, locks, probe, ffmpeg, capability(), waitMs? }`.
  - Yardımcılar: `sha(v)`, `fenced`, `failure`, `record(deps, ctx, {kind, file, inputHash, content?, meta?, media?})` (dosya → blob → artifact → audit; dışa aktarılmıyor), `draftSource(deps, runId) → {hash, glbSha, glbPath, specHash, props}`.
  - Artefakt türleri: `scene`, `scene_glb`, `scene_blend`, `scene_anchors`, `scene_events`, `camera_track`, `build_report`, `preview_sheet`, `product_py`, `draft_video`, `draft_cover`, `review_sheet`, `draft_review`.
  - `pipelineExecutors(deps)`: research, storyboard, build, draft_render, draft_review.
- **Render katmanı** (`apps/worker/src/render/`):
  - `RenderDriver { kind; capabilities(); build(); stills(); draft() }`; `BlenderRenderDriver` (`sandboxed({runDir, owner, signal, gpu, timeoutMs, onLine}, cmd)`, `blenderArgs(script, rest)`), `FakeRenderDriver({ffmpeg, delayMs?, fixtures?})`; `RenderError(kind)`; `REMOTION_CLI`.
  - `runProcess` alt süreç ağacını ölçer ve öldürür (M4c son review I2).
  - `ffmpeg.ts`: `run` (yerel), `SAFE_AREA_FILTER`, `gradientSource`, `contactSheet`, `testStill`, `fakeDraft`, `ffprobeOf`, `probeVideo → VideoProbe`, `draftProbeErrors`, `extractFrame`.
- **Remotion** (`packages/remotion`):
  - `props.ts`: `DraftProps` (tip takma adı), `draftProps(...)`, `activeBeat`, `safeRect`, `draftLayout`, `placeLabels`, `MAX_LABELS`, `DRAFT_COMPOSITION`, `DRAFT_FPS`.
  - `Draft3D.tsx`: `useGltf(url)` (delayRender), `Stage`, metin/etiket katmanı **bileşenin içinde** (henüz ayrılmadı).
  - `render.ts`: `CHROME` (`VG_CHROME`, `VG_REMOTION_GL`), `ensureBundle(cacheRoot)`, `renderDraftVideo(o)`; `render-cli.ts` protokolü `VG_STAGE/VG_PROGRESS/VG_DONE/VG_ERROR`, çıkış 0/1/2/3.
  - `hash.ts`: `bundleHash()` (kaynaklar + bağımlılıklar; `NODE_ONLY` hariç), `DRAFT_RENDER`.
- **Blender** (`python/vg_blender`): `render.py main(argv)` önizleme kareleri (`--blend --frames --out --scale --samples --allow-any-gpu`, `VG_RENDERER`, `VG_PROGRESS`, NVIDIA değilse 3); `stage.configure` EEVEE 64 örnek, raytracing, AgX Punchy (final ayarı zaten `.blend`'de); `render_cli.py`.
- **Paylaşılan:** `STEP_KEYS`, `STEP_WEIGHTS` (final_render 26, compose 10, qc 2), `STEP_DEFAULT_S`, `IMPLEMENTED_STEPS` (5 adım), `producePlan`, `VideoView.draft`, `CHANNEL_STYLES`, `SceneEventsSchema` (`explode_start | part_lock | label_in | zoom`), `Storyboard.beats[].sfx_cues` (≤ 4, serbest metin).
- **DB:** `insertArtifact` (`duration_ms/width/height/codec` yazar), `findArtifact`, `latestArtifact`, `listArtifacts`, `getBlob`, `insertBlob`; `VIDEO_SQL` LATERAL'ları (`draft_video`, `draft_cover`); varsayılan yetkiler yeni tabloları `videogen_app`'e açar (0001).
- **Medya:** `putBlob(pool, dataDir, absPath)`; MIME `.mp4 .wav .flac .png .json`; `GET /api/blobs/:sha` (Range).
- **Web:** `DraftTabs` ("Taslak MP4" varsayılan, "Taslak" canlı), `pickDraft`, `ReviewCard`, `ProductionPanel`, `Library` (`library-cover`, `library-duration`), `setActivePlayer`.
- **Testler:** `npm test` 312, `test:blender` 17, `test:render` 7 (Blender 4 + taslak 3), smoke 17 / 9.

## Plan öncesi sondaj (2026-10-06)

| # | Ne | Sonuç |
|---|---|---|
| P9 | ffmpeg 7.0.2'de QC ve ses filtreleri | `ebur128` (peak=true), `loudnorm` (print_format=json), `silencedetect`, `blackdetect`, `freezedetect`, `signalstats`, `ssim`, `edgedetect`, `scdet`, `aevalsrc`, `anoisesrc`, `adelay`, `amix`, `afade`, `sidechaincompress` var. loudnorm JSON'u `input_i/input_tp/input_lra/input_thresh/target_offset` verir. **Not:** 3 sn'lik sabit tonda ebur128 LRA 20 LU gösterdi: LRA kısa kliplerde güvenilmez → LRA kontrolü yalnızca ≥ 10 sn içerikte uygulanır (E4) |

Gerçek render ve Remotion sondajları M4'ten (P3, P7, P8; M4c gerçek taslak: 1351 kare). Başka sondaj yapılmadı (planlama sırasında uygulama yok).

## Karar kaydı

Her karar spec ile tutarlıdır; spec'teki bir K kararını değiştiren yoktur. Spec metninden sapan uygulama ayrıntıları "Spec notu" ile işaretlidir ve T12'de spec'e işlenir.

| # | Karar | Neden | Yanlışsa maliyeti |
|---|---|---|---|
| E1 | M5 → M5a / M5b / M5c (yukarıdaki tablo). M5a seslendirmesiz modda finale ve otomatik kapılara kadar gider; LLM review ve fixer M5b, VO M5c | 12 görev sınırı; bağımlılık sırası (review final videoyu ister, VO compose'u değiştirir) | Bölmede kalan bağımlılık: M5b `finalize` ve kare temizliğinin yerini değiştirir (E6) |
| E2 | Rubrik **`packages/shared/src/rubric.ts`** (zod + sabitler), sürüm `final@1`; spec'teki `rubric.yaml` yerine. Kapı/boyut tabloları, QC kontrol kimlikleri ve eşikler tek yerde | Tipli, testli, yeni bağımlılık (YAML ayrıştırıcı) yok; reviewer istemleri (M5b) aynı kaynaktan üretilir. Spec notu §8.1 | YAML'ı elle düzenlemek isteyen kullanıcı için daha az erişilebilir; kalibrasyon kod değişikliği ister |
| E3 | QC kontrol kimlikleri sabittir (`QC_CHECKS`), her biri bir kapıya ya da boyuta bağlıdır. **Puanlı:** D6 (12 puan: loudness 4, true peak 2, LRA 1, ilk ses 2, sessizlik 3), D7 (5: GOP 2, bitrate 1, faststart 1, kapak 1). **Kapı:** G1 (7 kontrol), G5 flaş, G6 (`g6_layout` manifest; `g6_edges` görsel tarama yalnızca manifest yoksa). **Puansız ölçüm** (M5b reviewer'ına girdi, §8.2 "otomatik kontroller sahibine girdi"): `d2_black`, `d3_freeze`, `d8_loop` | §8.2 boyut sahipliği: D6/D7 orchestrator'ın; D2/D3/D8 reviewer'ların | D6 alt puanları türetilmiştir (spec puan dağılımı vermiyor); M5b kalibrasyonunda gözden geçirilir |
| E4 | Eşikler (`QC_LIMITS`): 1080×1920, `30/1`, h264 High, `yuv420p`/tv/bt709, AAC 48 kHz, 35–55 sn, < 64 MB; −14 ± 1 LUFS; TP ≤ −1 dBTP; **LRA ≤ 11 LU** (yalnızca ≥ 10 sn; kanal konvansiyonu, pilot 20,6); ilk ses ≤ 0,15 sn (−50 dBFS); ilk sesten sonra > 0,3 sn sessizlik yok; siyah ≥ 0,1 sn yok; donma > 0,5 sn yok; flaş: herhangi 1 sn'de ≤ 3 (kareler arası parlaklık sıçraması ≥ 20/255 ve geri dönüş); döngü SSIM ≥ 0,90; GOP ≤ 60 kare; video bitrate 3–11 Mbps; `moov` `mdat`'tan önce | Spec §8.1 (D6, D7, D8, G1, G5); LRA eşiği spec'te yok → konvansiyon; P9 | Folklor etiketli eşikler (LRA, bitrate) ilk 10 yayından sonra revize (§8.4) |
| E5 | **Final render:** `python/vg_blender/final_cli.py` → `render.final_main`: `.blend`'in kendi ayarlarıyla (EEVEE 64, raytracing, AgX Punchy), `film_transparent`, RGBA PNG `f%05d.png`, `--start/--end`. **Devam:** geçerli PNG'si (imza + IEND) olan kare atlanır (`VG_SKIPPED n`). İlerleme `VG_PROGRESS done total` (atlananlar dahil). NVIDIA değilse çıkış 3. Sürücü: zaman aşımı 2 sa, RSS 6 GB; çökme (kod ≠ 0, durdurma değil) → bir kez `--samples 32` ile (spec §14); ikinci çökme `RenderError('gpu')` | ~23 dk'lık render yeniden başlatmaya dayanıklı olmalı (K11); spec §14 | Bozuk ama imzası geçerli PNG yakalanmaz: ffmpeg compose'da düşer (C16 gibi) |
| E6 | Kareler blob deposuna girmez: `runs/<runId>/final/<hash16>/frames/`. Artefakt `final_frames` (blob yok; içerik `{dir (run'a göre), frames, samples, renderer, skipped}`). **Temizlik:** run terminal duruma geçince (`done`, `needs_human`, `failed`, `cancelled`) orchestrator `runs/<id>/final/*/frames` siler (`frames.deleted` audit). M5b'de fixer turları kareleri yeniden kullanacağı için temizlik `finalize`'a taşınır | Spec §7.6 disk (~1,6 GB/video); 15 GB boş disk | M5a'da compose-kapsamlı bir yeniden deneme kareleri yeniden render eder (M5a'da düzeltme turu yok) |
| E7 | **`Overlay`** (metin + etiket katmanı) `Draft3D`'den ayrılır; `Draft3D` ve yeni **`Final3D`** aynı bileşeni kullanır. `Final3D`: CSS stil gradyanı + kare PNG'si (`<Img>`, Remotion yüklenmesini bekler) + `Overlay`. Etiket çapaları GLB + `SceneClock.seek` + `applyFrameFov` + `projectAnchor` ile (WebGL yok). Kompozisyon 1080×1920, `frames + 1` | K7/K23: taslak ve finalde metin aynı; çapa matematiği eşdeğerlik testindekiyle aynı (≤ 8 px) | Remotion `<Img>` 1351 × ~3 MB PNG'yi yükler: render süresi uzar (T6 ölçer) |
| E8 | **Kodlama zinciri:** Remotion → `master.mp4` (CRF 14, `fast`, yuv420p, bt709, sessiz) → **tek** ffmpeg teslim kodlaması `video.mp4` (`libx264 -profile:v high -crf 17 -preset slow -g 60 -keyint_min 30 -sc_threshold 0 -pix_fmt yuv420p -color_range tv` + bt709 etiketleri, `-movflags +faststart`, `-an`) → iki varyant `-c:v copy` + ses. Spec notu §7.5 | Remotion'da GOP ve profil ayarı yok; teslim biçimi tek yerde (G1, D7); varyantlar aynı görüntüyü paylaşır (qc görüntüyü bir kez ölçer) | İkinci kodlama küçük kalite kaybı (CRF 14 → 17); süre +~1 dk |
| E9 | **`layout.json`** (§7.4 manifest): her 5 karede bir + vuruş sınırlarında, ekrandaki metin kutuları (`hook`, `beat`, `label`; px) Node'da `Overlay`'in kullandığı saf fonksiyonlarla (`overlayBoxes`) hesaplanır. G6 = `g6_layout` (manifest). `g6_edges` (güvenli alan bantlarında kenar yoğunluğu) yalnızca manifest olmayan videolarda (pilot) kapıdır; bizim videolarımızda kahraman nesne üst banda taşabilir ve bu yasak değil (yalnızca metin yasak) | §8.2 MANIFEST katmanı; nesne ≠ metin | Tarayıcıdaki gerçek metin genişliği tahminden geniş olursa manifest yanılır: T5 `test:render` ve T11 ekranları kutuyu ölçer, tahmin cömerttir (0,66 em) |
| E10 | **SFX (seslendirmesiz mod):** prosedürel CC0 kütüphane (ffmpeg: `whoosh`, `click`, `snap`, `tick`, `swoosh`, `thud`; 48 kHz mono WAV, deterministik), `ensureSfxLibrary` ilk kullanımda üretir ve defterde kaydeder. Eşleme: `explode_start→whoosh`, `part_lock→click`, `label_in→tick`, `zoom→swoosh`; storyboard `sfx_cues` kelimeleri kütüphane adlarıyla eşleşirse vuruş başına; 0. ms'de kanca `whoosh`'u her zaman; aynı ses 10 sn'de ≤ 3; aynı 2 kare içinde tek cue | Spec §7.6, §9 (Kenney CC0 ya da prosedürel); ağ bağımlılığı yok, lisans kendimiz | Prosedürel SFX "ucuz" duyulabilir: M5b reviewer'ı ve kullanıcı dinler; Kenney paketi `bin/assets.mjs` ile içe aktarılırsa adı eşleşen öncelikli (E13) |
| E11 | **Müzik:** yalnızca defterde `allowed` müzik; video kimliğinin hash'iyle deterministik seçim. Yatak −18 dB, 1 sn giriş / 2 sn çıkış fade. **Müzik yoksa** müzikli varyant SFX'ten ibaret olur; `d6_silence` büyük olasılıkla düşer ve qc notu "müzik defterinde izinli parça yok (`bin/assets.mjs add`)" der. Ducking yok (VO M5c) | Spec §9: kürasyon elle; uydurma "pad" müzik slop riski | İlk kurulumda kullanıcı müzik eklemeden "yayına hazır" olunamaz (bilinçli) |
| E12 | **Mastering:** iki geçişli `loudnorm` (I −14, TP −1, LRA 11, `linear=true`, ölçülen değerlerle), 48 kHz; sonuç qc'de `ebur128` ile ölçülür. TikTok varyantı (SFX) da aynı zincirden geçer; qc onda yalnızca G1 ve true peak'e bakar (ses uygulamada eklenir, §7.6) | §7.6 | SFX-only sinyalde loudnorm doğrusal kalmazsa dinamik moda düşer: TP yine kontrol edilir |
| E13 | **Varlık defteri:** migration 0007 `assets` (§11.1 sütunları + `tags`, `duration_ms`); lisans kapısı: `CC0-1.0`, `CC-BY-4.0` (atıf zorunlu), `LicenseRef-Pixabay`; diğerleri `allowed=false` + audit `asset.rejected`. Lisans metninin anlık görüntüsü blob olarak. `bin/assets.mjs add --kind --file --title --license --author --source [--attribution] --license-text`. Arayüz kürasyonu M7. SceneSpec `asset_ref` (3D varlık) kapsam dışı kalır | Spec §9, §11.1 | Pixabay lisansı SPDX değil → `LicenseRef-` adı |
| E14 | **qc_probe** iki ffmpeg geçişi + ffprobe: (1) görüntü: `signalstats` (YAVG) + `blackdetect` + `freezedetect` + (manifest yoksa) bant kenar taraması, tek geçişte `split`; (2) ses: `ebur128=peak=true` + `silencedetect=noise=-50dB:d=0.3`; ffprobe: akış etiketleri, profil, bit hızı, anahtar kare aralığı (`-skip_frame nokey`); `moov`/`mdat` sırası dosya başından okunur; döngü SSIM ilk/son kare. Ayrıştırıcılar saf fonksiyonlardır (kayıtlı çıktılarla testli); `evaluateQc` saftır | §8.2 AUTO ~2 sn hedefi (bizde ~10 sn: 1351 kare 1080p çözme); testlenebilirlik | Yavaş makinede qc süresi uzar (heavy_cpu kilidi altında) |
| E15 | **`qc` adımı** `heavy_cpu`; `qc_report` artefaktı (iki varyant + puanlar + kapılar). Kapı düşerse `needs_human` ("Otomatik kontrol geçmedi: Güvenli alan: 1 kutu dışarıda (3,0 sn)."); geçerse `done`, not "G1 ✓ G5 ✓ G6 ✓ · D6 12/12 · D7 5/5". Plan `qc`'de biter → K13: video `needs_human`, not "Final video hazır ve otomatik kontrolden geçti. İnceleme ve "yayına hazır" kararı M5b'de." | §8.2 (AUTO kapısı düşerse LLM reviewer çalışmaz → fixer; fixer M5b) | M5a'da hiçbir video "yayına hazır" olamaz (bilinçli, K13) |
| E16 | **Bayat artefakt (§8.3):** `final_render` hash'i = `.blend` sha + sahne spec hash'i + stil + `FINAL_RENDER`; `compose` hash'i = `final_frames` hash'i + GLB sha + final props sha + `bundleHash` + `FINAL_ENCODE` + ses planı sha'sı (SFX kütüphanesi + müzik kimliği); `qc` hash'i = iki varyantın blob sha'sı + `RUBRIC_VERSION`. `compose` `final_frames`'in hash'i güncel kaynaktan farklıysa `failed` ("kareler güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)") | §8.3 | — |
| E17 | **Fake:** `FakeRenderDriver.final` 54×96 RGBA PNG'leri tek ffmpeg komutuyla (`frames+1` adet); `.compose` 1080×1920 `ultrafast` sakin görüntü (gece mavisi, sabit hızla kayan geniş çubuk: donma yok); teslim kodlaması, ses ve qc **gerçek** ffmpeg ile (smoke `VG_ENCODE_PRESET=ultrafast`). Düz içerik yüzünden fake'te `d7_bitrate` düşer (puan 4/5; kapı değil, beklenen). Kapı düşüşü yolu (`needs_human`) birim testinde saplı bir `layout` ile sınanır; ürün adı tetiği yok (metin katmanı yapı gereği güvenli alanda, fake bunu bozamaz). Smoke yığını prosedürel bir CC0 test müziği kaydeder | §16.1; smoke < 3 dk | Fake 1080p kodlama + qc çözme smoke'a ~30–40 sn ekler (T11 ölçer) |
| E18 | **Arayüz:** `VideoView.final = {musicSha, tiktokSha, coverSha, durationS} \| null`. Oynatıcı sekmeleri: "Final" (varsayılan, final varsa; "Müzikli/Müziksiz" çipi) · "Taslak MP4" · "Taslak". `QcCard` kapılar ve ölçümler (değer / sınır). Kütüphane kapak ve süreyi önce finalden alır. a11y: `data-testid="final-video"`, `"variant-chip"`, `"qc-card"` | Spec §13.1 | — |
| E19 | **Kapanış gerçek doğrulaması** (GPU'lu makinede): M4c'den bekleyen ilk gerçek ürün bu kez **finale kadar tek koşu** (K12 rolleri, "tükenmez kalem", seslendirmesiz, geçici DB); başlama koşulu 5 sa < %25, 7 gün < %70; koşuda 5 sa > %80 → dur. Ayrıca kalem pilotu `qc-cli` ile: 7 hata yakalanmalı. `test:blender`, `test:render` (Blender + taslak + final) | Kullanıcı yönergesi (M4c), §17 M5 çıkışı | Opus build + reviewer + final render tek koşuda 5 sa payını zorlar: durdurma kuralı var |
| E20 | Sayı zinciri (`npm test`): 312 → T1 318 → T2 323 → T4 327 → T5 331 → T6 333 → T7 338 → T8 341 → T9 347 → T10 351 → T11 355. `test:blender` 17 → 19 (T3). `test:render` 7 → 10 (T4 +1 Blender final, T6 +2 final compose). Smoke 17/9 → T11 19/11 | Plan testlerinin `it` sayısı | Sapma ledger'a `Ruling:` |

## Kapsam dışı (gerekçeli)

| Madde | Nereye | Neden |
|---|---|---|
| reviewer_visual/facts/retention final review'u, puan, K13 kararı, `reviews`/`findings` | M5b | E1 |
| fixer, `FixReport`, yeniden render kapsamı, ≤ 3 tur, regresyon/salınım, `finalize`, "Yayına hazır" | M5b | E1 |
| `voice`, TTS, Whisper hizalama, altyazı, ducking, VO hızı (D6 hece/sn), G4 | M5c | K17 onayı bekliyor; E1 |
| Kenney paketlerinin otomatik indirilmesi | — | Ağ bağımlılığı; `bin/assets.mjs` ile elle içe aktarılır |
| İçe aktarılan SFX'in (ör. Kenney) ses planına girmesi | M5b | M5a'da `planSfx` yalnızca prosedürel kütüphaneyi (`ensureSfxLibrary`) kullanır; içe aktarılan `sfx` varlıkları defterde durur ama eşlemeye girmez (deterministik ve test edilmiş tek kaynak) |
| 3D varlık (`asset_ref`, `needs_asset`) | M7 | §7.3 sıra 2–5; lisans kapısı bu planda müzik/SFX için |
| Varlık defteri arayüzü, sürüm karşılaştırma | M7 | Yol haritası |
| Final ve TikTok varyantının indirilmesi / Shorts dışa aktarımı | M6 | Yol haritası |
| `run_qc` MCP aracı | M5b | Reviewer'lar kullanır |
| M4c ertelenen minorlar (rewind false, değişmeyen düzeltme kilit içinde, kısayol Shift/tekrar, kapak LATERAL eşleşmesi) | M5b / M7 | Kapsam; M4c minor 8 (kapak eşleşmesi) T11'de final kapağı için doğru kurulur |

## Global Constraints

- **Ücretli API yok;** testlerde gerçek Claude yok. Gerçek Claude çağrısı yalnızca T12 Step 2'de, K12 rolleriyle, tek ürünle.
- **Chrome / Blender:** `npm test` Chrome, Blender, bwrap ve GPU gerektirmez. Gerçek render'lar yalnızca `npm run test:render`, `npm run test:blender` ve T12'de. Chrome her zaman sistem Chrome'u (`VG_CHROME`), `chrome-for-testing`, GL `VG_REMOTION_GL` (varsayılan `angle`; Final3D WebGL kullanmaz).
- **Teslim biçimi:** `yuv420p` + tv + bt709 olmayan bir final ya da varyant kaydedilmez (§7.5).
- **Lisans:** defterde olmayan ya da `allowed=false` bir varlık ses planına giremez (birim testi).
- **Arayüz:** Türkçe metin; font ağırlıkları 400/500; tek vurgu teal `#016a71`; yeşil `#3d7a5a` / kırmızı `#a3412f` yalnızca başarı/hata, kısık. Mevcut a11y sözleşmesi korunur; yenileri E18.
- **Migration:** yalnızca `0007_assets`, `drizzle-kit generate` ile.
- **Güvenilmeyen veri:** varlık başlığı/yazarı/atfı arayüzde React ile kaçışlanır; ffmpeg argümanlarına yalnızca dosya yolları (bizim ürettiğimiz) ve sayılar girer.
- **Commit:** yazar env ile (`GIT_AUTHOR_NAME="Alper Ekmekci" … alper.ekmekci54@gmail.com`); mesajın son satırı `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; görev başına bir commit; düzeltmeler `--fixup`.
- **Doğrulama:** her görevde `npm run typecheck && npm test`; render görevlerinde `npm run test:render` (GPU'suz makinede `VG_REMOTION_GL=swangle`, Blender testleri yalnızca GPU'lu makinede); Blender görevinde `npm run test:blender`; arayüz/smoke görevlerinde `npm run test:smoke`.
- **Süreçler:** başlatılan her sunucu PID ile durdurulur; `pkill -f` yok; Playwright yalnızca `channel:'chrome'`.
- **Disk:** işe başlamadan `df -h /` ≥ 10 GB; final render ~1,6 GB geçici kare.

## Review Focus

1. **Final render sırasında yeniden başlatma, iptal ya da GPU çökmesi.** Beklenen: yeniden başlayan adım geçerli kareleri yeniden render etmez (`VG_SKIPPED`), yarım PNG yeniden yazılır; iptal Blender'ı süreç grubuyla öldürür; çökme bir kez 32 örnekle denenir, ikinci çökme gerekçeli `failed`. Testler: T3 `test_final_frames_are_transparent_rgba_and_a_rerun_skips_complete_ones`, T4 "a crash is retried once with 32 samples…", T4 "records the frames … and resumes after a restart".
2. **Bayat ya da eksik kareler.** Beklenen: sahne değiştiyse eski kareler birleştirilmez; eksik kare compose'u gerekçeyle düşürür; terminal durumda kareler silinir, başka run'ın karelerine dokunulmaz. Testler: T8 "never composes stale frames…", T4 "deletes only this run's frames…".
3. **Lisans kapısı ve ses planı.** Beklenen: izinsiz müzik hiçbir koşulda miks'e girmez; CC-BY atıfsız reddedilir; SFX sıklık sınırı ve 0. ms kancası; mastering sonrası −14 ± 1 LUFS, TP ≤ −1. Testler: T2 "allows CC0, Pixabay and CC-BY-4.0 with attribution; rejects …" ve "imports a CC-BY track … a non-commercial track is stored as rejected", T7 "picks music … and refuses any disallowed asset in the plan", T7 "masters a quiet mix to −14 LUFS ±1…".
4. **QC doğruluğu.** Beklenen: pilot benzeri video 7 hatanın hepsiyle düşer; iyi video tüm kapılardan geçer; manifest varken nesnenin üst banda taşması G6'yı düşürmez, metin taşması düşürür. Testler: T1 "the pilot's seven…" ve "G6 from the layout manifest…", T9 "catches the pilot's seven errors…" ve "passes a clean, mastered 36 s final…", T10 "a failed gate stops the run for a human…".
5. **Final metin katmanı = taslak metin katmanı.** Beklenen: `Draft3D` ile `Final3D` aynı `Overlay`'i ve aynı `labelsAt`'ı kullanır (etiket kutuları yapı gereği manifesttekiyle aynı); kanca ve vuruş kutuları cömert tahmindir ve gerçek render'da plaka tahmin edilen kutunun içinde çizilir; `layout.json` kutuları güvenli alanda. Testler: T5 "places the hook… / layout.json of the pen…", T6 `test:render` "draws the hook plate where layout.json says it is".

---
## Başlarken (yürütücü)

```bash
cd ~/gpu-server/VideoGen
git switch -c m5a-final-render-qc main && git status --short && git log --oneline -1   # temiz; main 91b6c5d + bu planın commit'i
df -h / | tail -1 && free -h | sed -n 2,3p && ls -l /usr/bin/google-chrome && ffmpeg -version | head -1 && bin/blender-gpu --version | head -1
npm run typecheck && npm test 2>&1 | grep -E "Tests "   # 312 passed
```

- **Ledger:** `.superpowers/sdd/2026-10-06-m5a-final-render-qc/progress.md` (ilk satır plan yolu), `Ruling:` satırları M4 biçiminde.
- **Planın kodu** planlama sırasında çalıştırılmadı (token ekonomisi kuralı). Diff'ler HEAD `91b6c5d`'ye göre yazıldı; bir hunk tutmazsa değişikliği elle uygula ve `Ruling:` yaz.
- **GPU'suz ortamda** (bulut konteyneri) yürütülürse: Blender görevleri (T3 testleri, T4 Blender int testi) koşulamaz; `Ruling:` ile belirt, T12'de GPU'lu makinede koş.

---
### Task 1: Rubrik `final@1` ve QC sözleşmesi — `GATES`, `DIMENSIONS`, `QC_CHECKS`, `QC_LIMITS`, `evaluateQc`, `QcReport`

**Files:**
- Create: `packages/shared/src/rubric.ts`, `packages/shared/src/qc.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/browser.ts`
- Test: `packages/shared/test/rubric.test.ts`

**Interfaces:**
- Produces:
  - `RUBRIC_VERSION = 'final@1'`; `GATE_IDS`, `type GateId`, `GATES: Record<GateId, {label_tr, owner}>`; `DIMENSION_IDS`, `type DimensionId`, `DIMENSIONS: Record<DimensionId, {label_tr, weight, owner}>`; `type RubricOwner`.
  - `QC_LIMITS` (E4), `QC_CHECK_IDS` (22), `type QcCheckId`, `QC_CHECKS: Record<QcCheckId, {label_tr, gate?, dimension?, points, variants}>`, `type QcVariant = 'music' | 'tiktok'`.
  - `interface QcMeasure` (qc_probe'un ham ölçümleri), `interface LayoutIssue`, `interface QcCheckResult { id; pass; value; limit; at? }`.
  - `evaluateQc(m, {variant, layoutIssues?, coverOk?}): QcCheckResult[]` (saf), `qcScores(results) → {D6, D7}`, `qcGates(results) → {G1, G5, G6}`.
  - `QcReportSchema`, `type QcReport`, `buildQcReport(music, tiktok): QcReport`, `qcFailures(report): string[]` (Türkçe gerekçeler).

- [ ] **Step 1: Başarısız testi yaz**

`packages/shared/test/rubric.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildQcReport, DIMENSIONS, evaluateQc, GATES, QC_CHECK_IDS, QC_CHECKS, qcFailures, QcReportSchema, qcScores, RUBRIC_VERSION, type QcMeasure,
} from '../src/index.ts';

/** What qc_probe measures on a well made 45 s final (music variant). */
const good = (): QcMeasure => ({
  video: {
    codec: 'h264', profile: 'High', width: 1080, height: 1920, fps: '30/1', pixFmt: 'yuv420p', colorRange: 'tv', colorSpace: 'bt709', colorPrimaries: 'bt709',
    colorTransfer: 'bt709', frames: 1351, durationS: 45.03, bitrateKbps: 6200, maxGopFrames: 60, faststart: true,
  },
  audio: { codec: 'aac', sampleRate: 48000 },
  bytes: 36 * 1024 * 1024,
  loudness: { i: -14.2, tp: -1.4, lra: 6.1 },
  firstAudioS: 0, silences: [], blacks: [], freezes: [], flashMaxPerS: 0, flashAt: null, loopSsim: 0.93, edgeBands: { maxDensity: 0.004, at: null },
});
/** The pen pilot (spec §8.3): −23.4 LUFS, LRA 20.6, first sound at 0.79 s, silences, freezes, wrong colour tags, text in the unsafe area. */
const pilot = (): QcMeasure => {
  const m = good();
  return {
    ...m,
    video: { ...m.video, pixFmt: 'yuvj420p', colorRange: 'pc', colorSpace: null, colorPrimaries: null, colorTransfer: null },
    loudness: { i: -23.4, tp: -3.1, lra: 20.6 }, firstAudioS: 0.79, silences: [{ start: 12.1, end: 13.4 }], freezes: [{ start: 20, end: 21.2 }],
    edgeBands: { maxDensity: 0.061, at: 3.5 },
  };
};
const failed = (r: { id: string; pass: boolean }[]) => r.filter((c) => !c.pass).map((c) => c.id).sort();

describe('rubric final@1 and the QC contract', () => {
  it('has the spec weights, one owner per dimension, and QC points only on the orchestrator-owned D6 (12) and D7 (5)', () => {
    expect(RUBRIC_VERSION).toBe('final@1');
    expect(Object.values(DIMENSIONS).reduce((a, d) => a + d.weight, 0)).toBe(100);
    expect(DIMENSIONS.D6).toMatchObject({ weight: 12, owner: 'orchestrator' });
    expect(GATES.G6.owner).toBe('orchestrator');
    const points = (d: string) => QC_CHECK_IDS.filter((id) => QC_CHECKS[id].dimension === d).reduce((a, id) => a + QC_CHECKS[id].points, 0);
    expect([points('D6'), points('D7'), points('D2'), points('D3'), points('D8')]).toEqual([12, 5, 0, 0, 0]);
  });

  it('passes a well made final: every gate and full D6/D7', () => {
    const r = evaluateQc(good(), { variant: 'music', layoutIssues: [], coverOk: true });
    expect(failed(r)).toEqual([]);
    expect(qcScores(r)).toEqual({ D6: 12, D7: 5 });
    expect(r.map((c) => c.id)).toContain('g6_layout');
    expect(r.map((c) => c.id)).not.toContain('g6_edges');
  });

  it('the pilot\'s seven known errors all fail (spec §8.3 calibration)', () => {
    const r = evaluateQc(pilot(), { variant: 'music', layoutIssues: null, coverOk: true });
    expect(failed(r)).toEqual(['d3_freeze', 'd6_first_audio', 'd6_loudness', 'd6_lra', 'd6_silence', 'g1_color', 'g6_edges']);
    expect(r.find((c) => c.id === 'd6_loudness')).toMatchObject({ value: '-23,4 LUFS', limit: '−14 ±1 LUFS' });
    expect(r.find((c) => c.id === 'd6_silence')).toMatchObject({ at: 12.1 });
    expect(qcScores(r).D6).toBe(2); // only the true peak (−3,1 dBTP) passes
  });

  it('checks only delivery and true peak on the TikTok variant (its sound is added in the app); LRA only on ≥ 10 s', () => {
    const t = evaluateQc({ ...good(), loudness: { i: -30, tp: -2, lra: 30 }, firstAudioS: 2, silences: [{ start: 3, end: 9 }] }, { variant: 'tiktok' });
    expect(t.map((c) => c.id).sort()).toEqual(['d6_true_peak', 'g1_audio', 'g1_bytes', 'g1_color', 'g1_duration', 'g1_fps', 'g1_size', 'g1_video']);
    expect(failed(t)).toEqual([]);
    const short = evaluateQc({ ...good(), video: { ...good().video, durationS: 8 }, loudness: { i: -14, tp: -2, lra: 25 } }, { variant: 'music', layoutIssues: [] });
    expect(short.map((c) => c.id)).not.toContain('d6_lra');
  });

  it('G6 from the layout manifest: a text box outside the safe area fails with its frame; no manifest → the visual edge scan', () => {
    const r = evaluateQc(good(), { variant: 'music', layoutIssues: [{ frame: 90, kind: 'beat', box: [24, 1500, 900, 1580] }], coverOk: true });
    expect(r.find((c) => c.id === 'g6_layout')).toMatchObject({ pass: false, value: '1 kutu dışarıda', at: 3 });
    const e = evaluateQc(good(), { variant: 'music', layoutIssues: null, coverOk: true });
    expect(e.find((c) => c.id === 'g6_edges')).toMatchObject({ pass: true });
  });

  it('builds a report: gates from both variants, scores from the music variant, Turkish reasons for failed gates', () => {
    const music = evaluateQc(good(), { variant: 'music', layoutIssues: [{ frame: 90, kind: 'label', id: 'yay', box: [900, 600, 1060, 650] }], coverOk: true });
    const tiktok = evaluateQc({ ...good(), video: { ...good().video, pixFmt: 'yuvj420p', colorRange: 'pc' } }, { variant: 'tiktok' });
    const rep = buildQcReport(music, tiktok);
    expect(QcReportSchema.safeParse(rep).success).toBe(true);
    expect(rep).toMatchObject({ rubric_version: 'final@1', gates: { G1: false, G5: true, G6: false }, scores: { D6: 12, D7: 5 }, pass: false });
    expect(qcFailures(rep)).toEqual(['Teslim (müziksiz): Renk etiketleri yuvj420p/pc/bt709/bt709/bt709 (yuv420p/tv/bt709)', 'Güvenli alan: 1 kutu dışarıda (3,0 sn)']);
  });
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run packages/shared/test/rubric.test.ts`
Expected: FAIL — `does not provide an export named 'buildQcReport'`.

- [ ] **Step 3: Uygula**

`packages/shared/src/rubric.ts`:

```ts
/** Spec §8.1, versioned (plan E2: a typed module instead of rubric.yaml). A calibration change bumps the version. */
export const RUBRIC_VERSION = 'final@1';

export type RubricOwner = 'orchestrator' | 'reviewer_visual' | 'reviewer_facts' | 'reviewer_retention' | 'rule';

export const GATE_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
export type GateId = (typeof GATE_IDS)[number];
/** Spec §8.2 ownership. G5 is split: the flash count is automatic (qc), "CG presented as real" is reviewer_visual's. */
export const GATES: Record<GateId, { label_tr: string; owner: RubricOwner }> = {
  G1: { label_tr: 'Teslim', owner: 'orchestrator' },
  G2: { label_tr: 'Doğruluk', owner: 'reviewer_facts' },
  G3: { label_tr: 'Haklar', owner: 'reviewer_visual' },
  G4: { label_tr: 'Beyan', owner: 'rule' },
  G5: { label_tr: 'Güvenlik', owner: 'reviewer_visual' },
  G6: { label_tr: 'Güvenli alan', owner: 'orchestrator' },
};

export const DIMENSION_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'] as const;
export type DimensionId = (typeof DIMENSION_IDS)[number];
export const DIMENSIONS: Record<DimensionId, { label_tr: string; weight: number; owner: RubricOwner }> = {
  D1: { label_tr: 'Kanca', weight: 15, owner: 'reviewer_retention' },
  D2: { label_tr: 'Görsel zanaat', weight: 15, owner: 'reviewer_visual' },
  D3: { label_tr: 'Hareket ve tempo', weight: 12, owner: 'reviewer_visual' },
  D4: { label_tr: 'Bilgi ve doğruluk', weight: 15, owner: 'reviewer_facts' },
  D5: { label_tr: 'Tipografi ve etiketler', weight: 10, owner: 'reviewer_visual' },
  D6: { label_tr: 'Ses', weight: 12, owner: 'orchestrator' },
  D7: { label_tr: 'Teknik cila', weight: 5, owner: 'orchestrator' },
  D8: { label_tr: 'Döngü ve izlenme', weight: 8, owner: 'reviewer_retention' },
  D9: { label_tr: 'Özgünlük', weight: 8, owner: 'reviewer_visual' },
};
```

`packages/shared/src/qc.ts`:

```ts
import { z } from 'zod';
import { GATES, RUBRIC_VERSION, type DimensionId, type GateId } from './rubric.ts';

/** Plan E4. Folklore-tagged limits (LRA, bitrate) are revised after the first ten posts (spec §8.4). */
export const QC_LIMITS = {
  width: 1080, height: 1920, fps: '30/1', minS: 35, maxS: 55, maxBytes: 64 * 1024 * 1024,
  lufs: -14, lufsTol: 1, truePeak: -1, lra: 11, lraMinS: 10, firstAudioS: 0.15, silenceS: 0.3, silenceDb: -50,
  blackS: 0.1, freezeS: 0.5, flashDelta: 20, flashPerS: 3, loopSsim: 0.9, gopFrames: 60, minKbps: 3000, maxKbps: 11000, edgeDensity: 0.02,
} as const;

export type QcVariant = 'music' | 'tiktok';
export const QC_CHECK_IDS = [
  'g1_video', 'g1_size', 'g1_fps', 'g1_color', 'g1_audio', 'g1_duration', 'g1_bytes', 'g5_flash', 'g6_layout', 'g6_edges',
  'd6_loudness', 'd6_true_peak', 'd6_lra', 'd6_first_audio', 'd6_silence', 'd7_gop', 'd7_bitrate', 'd7_faststart', 'd7_cover',
  'd2_black', 'd3_freeze', 'd8_loop',
] as const;
export type QcCheckId = (typeof QC_CHECK_IDS)[number];
export interface QcCheckDef { label_tr: string; gate?: GateId; dimension?: DimensionId; points: number; variants: readonly QcVariant[] }

const BOTH: readonly QcVariant[] = ['music', 'tiktok'];
const MUSIC: readonly QcVariant[] = ['music'];
/**
 * Plan E3: stable ids. Points only for the dimensions the orchestrator owns (D6 12, D7 5); D2/D3/D8 measurements carry no points
 * here, they are inputs for their reviewer (M5b). The TikTok variant (sound added in the app) is checked for delivery and peak only.
 */
export const QC_CHECKS: Record<QcCheckId, QcCheckDef> = {
  g1_video: { label_tr: 'Kodek', gate: 'G1', points: 0, variants: BOTH },
  g1_size: { label_tr: 'Boyut', gate: 'G1', points: 0, variants: BOTH },
  g1_fps: { label_tr: 'Kare hızı', gate: 'G1', points: 0, variants: BOTH },
  g1_color: { label_tr: 'Renk etiketleri', gate: 'G1', points: 0, variants: BOTH },
  g1_audio: { label_tr: 'Ses kodeği', gate: 'G1', points: 0, variants: BOTH },
  g1_duration: { label_tr: 'Süre', gate: 'G1', points: 0, variants: BOTH },
  g1_bytes: { label_tr: 'Dosya boyutu', gate: 'G1', points: 0, variants: BOTH },
  g5_flash: { label_tr: 'Flaş', gate: 'G5', points: 0, variants: MUSIC },
  g6_layout: { label_tr: 'Metin güvenli alanda', gate: 'G6', points: 0, variants: MUSIC },
  g6_edges: { label_tr: 'Güvenli alanda metin izi', gate: 'G6', points: 0, variants: MUSIC },
  d6_loudness: { label_tr: 'Yüksek ses', dimension: 'D6', points: 4, variants: MUSIC },
  d6_true_peak: { label_tr: 'Gerçek tepe', dimension: 'D6', points: 2, variants: BOTH },
  d6_lra: { label_tr: 'Dinamik aralık', dimension: 'D6', points: 1, variants: MUSIC },
  d6_first_audio: { label_tr: 'İlk ses', dimension: 'D6', points: 2, variants: MUSIC },
  d6_silence: { label_tr: 'Sessizlik', dimension: 'D6', points: 3, variants: MUSIC },
  d7_gop: { label_tr: 'Anahtar kare aralığı', dimension: 'D7', points: 2, variants: MUSIC },
  d7_bitrate: { label_tr: 'Bit hızı', dimension: 'D7', points: 1, variants: MUSIC },
  d7_faststart: { label_tr: 'Hızlı başlatma', dimension: 'D7', points: 1, variants: MUSIC },
  d7_cover: { label_tr: 'Kapak', dimension: 'D7', points: 1, variants: MUSIC },
  d2_black: { label_tr: 'Siyah bölüm', dimension: 'D2', points: 0, variants: MUSIC },
  d3_freeze: { label_tr: 'Donma', dimension: 'D3', points: 0, variants: MUSIC },
  d8_loop: { label_tr: 'Döngü benzerliği', dimension: 'D8', points: 0, variants: MUSIC },
};

export interface Span { start: number; end: number }
/** Raw qc_probe measurements of one file (apps/worker/src/render/qc.ts). Times in seconds. */
export interface QcMeasure {
  video: {
    codec: string; profile: string | null; width: number; height: number; fps: string; pixFmt: string; colorRange: string | null; colorSpace: string | null;
    colorPrimaries: string | null; colorTransfer: string | null; frames: number; durationS: number; bitrateKbps: number; maxGopFrames: number; faststart: boolean;
  };
  audio: { codec: string; sampleRate: number } | null;
  bytes: number;
  loudness: { i: number; tp: number; lra: number } | null;
  /** End of the leading silence; null when the file is silent throughout. */
  firstAudioS: number | null;
  /** Silences (−50 dBFS, ≥ 0.3 s) after the first audio. */
  silences: Span[];
  blacks: Span[];
  freezes: Span[];
  flashMaxPerS: number;
  flashAt: number | null;
  /** SSIM of the last frame against the first (D8 loop). */
  loopSsim: number | null;
  /** Edge density in the G6 bands (0..1), only measured without a layout manifest. */
  edgeBands: { maxDensity: number; at: number | null };
}
/** A text box of layout.json outside the safe area (G6 manifest check). Box: [x0, y0, x1, y1] px at 1080×1920. */
export interface LayoutIssue { frame: number; kind: 'hook' | 'beat' | 'label'; id?: string; box: [number, number, number, number] }

export const QcCheckResultSchema = z.object({ id: z.enum(QC_CHECK_IDS), pass: z.boolean(), value: z.string(), limit: z.string(), at: z.number().min(0).optional() });
export type QcCheckResult = z.infer<typeof QcCheckResultSchema>;

const n1 = (x: number) => x.toFixed(1).replace('.', ',');

/** Plan E3/E4: deterministic, one result per applicable check id. */
export function evaluateQc(m: QcMeasure, o: { variant: QcVariant; layoutIssues?: LayoutIssue[] | null; coverOk?: boolean }): QcCheckResult[] {
  const L = QC_LIMITS;
  const v = m.video;
  const out: QcCheckResult[] = [];
  const add = (id: QcCheckId, pass: boolean, value: string, limit: string, at?: number | null) => {
    if (QC_CHECKS[id].variants.includes(o.variant)) out.push({ id, pass, value, limit, ...(at === undefined || at === null ? {} : { at: Math.round(at * 100) / 100 }) });
  };
  add('g1_video', v.codec === 'h264' && v.profile === 'High', `${v.codec} ${v.profile ?? '?'}`, 'h264 High');
  add('g1_size', v.width === L.width && v.height === L.height, `${v.width}×${v.height}`, `${L.width}×${L.height}`);
  add('g1_fps', v.fps === L.fps, v.fps, L.fps);
  const color = [v.pixFmt, v.colorRange, v.colorSpace, v.colorPrimaries, v.colorTransfer];
  add('g1_color', v.pixFmt === 'yuv420p' && v.colorRange === 'tv' && [v.colorSpace, v.colorPrimaries, v.colorTransfer].every((x) => x === 'bt709'),
    color.map((x) => x ?? 'yok').join('/'), 'yuv420p/tv/bt709');
  add('g1_audio', m.audio?.codec === 'aac' && m.audio.sampleRate === 48000, m.audio ? `${m.audio.codec} ${m.audio.sampleRate} Hz` : 'ses yok', 'aac 48000 Hz');
  add('g1_duration', v.durationS >= L.minS && v.durationS <= L.maxS, `${n1(v.durationS)} sn`, '35–55 sn');
  add('g1_bytes', m.bytes < L.maxBytes, `${n1(m.bytes / 1048576)} MB`, '< 64 MB');
  add('g5_flash', m.flashMaxPerS <= L.flashPerS, `${m.flashMaxPerS}/sn`, '≤ 3/sn', m.flashAt);
  if (o.layoutIssues) add('g6_layout', o.layoutIssues.length === 0, `${o.layoutIssues.length} kutu dışarıda`, '0', o.layoutIssues[0] ? o.layoutIssues[0].frame / 30 : null);
  else add('g6_edges', m.edgeBands.maxDensity <= L.edgeDensity, m.edgeBands.maxDensity.toFixed(3), `≤ ${L.edgeDensity}`, m.edgeBands.at);
  const ld = m.loudness;
  add('d6_loudness', !!ld && Math.abs(ld.i - L.lufs) <= L.lufsTol, ld ? `${n1(ld.i)} LUFS` : 'ölçülemedi', '−14 ±1 LUFS');
  add('d6_true_peak', !!ld && ld.tp <= L.truePeak, ld ? `${n1(ld.tp)} dBTP` : 'ölçülemedi', '≤ −1 dBTP');
  if (v.durationS >= L.lraMinS) add('d6_lra', !!ld && ld.lra <= L.lra, ld ? `${n1(ld.lra)} LU` : 'ölçülemedi', '≤ 11 LU');
  add('d6_first_audio', m.firstAudioS !== null && m.firstAudioS <= L.firstAudioS, m.firstAudioS === null ? 'ses yok' : `${m.firstAudioS.toFixed(2).replace('.', ',')} sn`, '≤ 0,15 sn');
  const gap = m.silences.find((s) => s.end - s.start > L.silenceS);
  add('d6_silence', m.firstAudioS !== null && !gap, gap ? `${n1(gap.end - gap.start)} sn` : 'yok', '≤ 0,3 sn', gap?.start);
  add('d7_gop', v.maxGopFrames <= L.gopFrames, `${v.maxGopFrames} kare`, `≤ ${L.gopFrames} kare`);
  add('d7_bitrate', v.bitrateKbps >= L.minKbps && v.bitrateKbps <= L.maxKbps, `${n1(v.bitrateKbps / 1000)} Mbps`, '3–11 Mbps');
  add('d7_faststart', v.faststart, v.faststart ? 'var' : 'yok', 'moov başta');
  add('d7_cover', o.coverOk === true, o.coverOk ? 'var' : 'yok', 'var');
  const black = m.blacks.find((s) => s.end - s.start >= L.blackS);
  add('d2_black', !black, black ? `${n1(black.end - black.start)} sn` : 'yok', '< 0,1 sn', black?.start);
  const freeze = m.freezes.find((s) => s.end - s.start > L.freezeS);
  add('d3_freeze', !freeze, freeze ? `${n1(freeze.end - freeze.start)} sn` : 'yok', '≤ 0,5 sn', freeze?.start);
  add('d8_loop', m.loopSsim !== null && m.loopSsim >= L.loopSsim, m.loopSsim === null ? 'ölçülemedi' : m.loopSsim.toFixed(2).replace('.', ','), '≥ 0,90');
  return out;
}

export function qcScores(results: QcCheckResult[]): { D6: number; D7: number } {
  const sum = (d: DimensionId) => results.filter((c) => c.pass && QC_CHECKS[c.id].dimension === d).reduce((a, c) => a + QC_CHECKS[c.id].points, 0);
  return { D6: sum('D6'), D7: sum('D7') };
}

export function qcGates(results: QcCheckResult[]): { G1: boolean; G5: boolean; G6: boolean } {
  const ok = (g: GateId) => results.filter((c) => QC_CHECKS[c.id].gate === g).every((c) => c.pass);
  return { G1: ok('G1'), G5: ok('G5'), G6: ok('G6') };
}

export const QcReportSchema = z.object({
  rubric_version: z.literal(RUBRIC_VERSION),
  music: z.array(QcCheckResultSchema),
  tiktok: z.array(QcCheckResultSchema),
  scores: z.object({ D6: z.number().min(0).max(12), D7: z.number().min(0).max(5) }),
  gates: z.object({ G1: z.boolean(), G5: z.boolean(), G6: z.boolean() }),
  pass: z.boolean(),
});
export type QcReport = z.infer<typeof QcReportSchema>;

/** Gates from both variants; D6/D7 scores from the music variant (the reviewed one, spec §7.1 step 10). */
export function buildQcReport(music: QcCheckResult[], tiktok: QcCheckResult[]): QcReport {
  const gates = qcGates([...music, ...tiktok]);
  return { rubric_version: RUBRIC_VERSION, music, tiktok, scores: qcScores(music), gates, pass: gates.G1 && gates.G5 && gates.G6 };
}

/** Failed gate checks as Turkish reasons ("Güvenli alan: 1 kutu dışarıda (3,0 sn)"). */
export function qcFailures(r: QcReport): string[] {
  const line = (c: QcCheckResult, variant: QcVariant) => {
    const gate = QC_CHECKS[c.id].gate!;
    const head = `${GATES[gate].label_tr}${variant === 'tiktok' ? ' (müziksiz)' : ''}`;
    const body = gate === 'G6' ? c.value : `${QC_CHECKS[c.id].label_tr} ${c.value} (${c.limit})`;
    return `${head}: ${body}${c.at !== undefined ? ` (${n1(c.at)} sn)` : ''}`;
  };
  return [
    ...r.tiktok.filter((c) => !c.pass && QC_CHECKS[c.id].gate).map((c) => line(c, 'tiktok')),
    ...r.music.filter((c) => !c.pass && QC_CHECKS[c.id].gate).map((c) => line(c, 'music')),
  ];
}
```

Diff (`git apply`):

```diff
--- a/packages/shared/src/index.ts
+++ b/packages/shared/src/index.ts
@@ -8,6 +8,8 @@
 export * from './artifacts.ts';
 export * from './pipeline.ts';
 export * from './progress.ts';
+export * from './qc.ts';
 export * from './review.ts';
+export * from './rubric.ts';
 export * from './scene.ts';
 export * from './styles.ts';
--- a/packages/shared/src/browser.ts
+++ b/packages/shared/src/browser.ts
@@ -5,6 +5,8 @@
 export * from './artifacts.ts';
 export * from './pipeline.ts';
 export * from './progress.ts';
+export * from './qc.ts';
 export * from './review.ts';
+export * from './rubric.ts';
 export * from './scene.ts';
 export * from './styles.ts';
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run packages/shared/test/rubric.test.ts && npm run typecheck && npm test`
Expected: `6 passed`; tam paket `Tests  318 passed (318)`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/rubric.ts packages/shared/src/qc.ts packages/shared/src/index.ts packages/shared/src/browser.ts packages/shared/test/rubric.test.ts
git commit -m "feat(rubric): final@1 rubric, QC check ids and limits, deterministic QC evaluation and report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Commit'ler Global Constraints'teki yazar env'iyle yapılır; aşağıdaki görevlerde de.)

---
### Task 2: Varlık defteri — migration 0007 `assets`, lisans kapısı, içe aktarma CLI'ı, prosedürel CC0 SFX kütüphanesi

**Files:**
- Create: `packages/shared/src/assets.ts`, `packages/db/src/assets.ts`, `apps/worker/src/assets.ts`, `bin/assets.mjs`, `packages/db/drizzle/0007_assets.sql` + `meta/0007_snapshot.json` + `_journal.json` girdisi (drizzle-kit üretir)
- Modify: `packages/db/src/schema.ts` (`assets`), `packages/db/src/index.ts`, `packages/shared/src/index.ts`, `packages/shared/src/browser.ts`
- Test: `packages/shared/test/assets.test.ts`, `packages/db/test/assets.test.ts`, `apps/worker/test/assets.test.ts`

**Interfaces:**
- Produces:
  - `ASSET_KINDS = ['music','sfx','model3d','hdri','font','voice_ref']`, `type AssetKind`; `ALLOWED_LICENSES = ['CC0-1.0','CC-BY-4.0','LicenseRef-Pixabay']`; `licenseVerdict({spdx, attribution?}) → {allowed, reason_tr}`.
  - DB: `insertAsset(db, NewAsset) → AssetRecord | null` (aynı blob+tür ikinci kez `null`), `findAssetByBlob(db, kind, sha)`, `listAssets(db, {kind?, allowedOnly?}) → AssetRecord[]` (eskiden yeniye), `getAsset(db, id)`. `AssetRecord { id, kind, title, blobSha, licenseSpdx, sourceUrl, author, attribution, licenseSnapshotSha, allowed, tags, durationMs, createdAt }`.
  - Worker: `importAsset(pool, dataDir, ffmpeg, ImportAssetInput) → AssetRecord` (audit `asset.imported` / `asset.rejected`); `SFX_NAMES = ['whoosh','swoosh','click','snap','tick','thud']`; `ensureSfxLibrary(pool, dataDir, ffmpeg) → Record<SfxName, AssetRecord>`; `parseAddArgs(argv) → ImportAssetInput & {licenseTextFile}`; `audioDurationMs(ffmpeg, file)`.
  - CLI: `node bin/assets.mjs add --kind music --file … --title … --license CC0-1.0 --author … [--source URL] [--attribution …] --license-text lisans.txt [--tags a,b]` · `node bin/assets.mjs list`.

- [ ] **Step 1: Başarısız testleri yaz**

`packages/shared/test/assets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ALLOWED_LICENSES, licenseVerdict } from '../src/index.ts';

describe('license gate (spec §9)', () => {
  it('allows CC0, Pixabay and CC-BY-4.0 with attribution; rejects NC/ND/SA, unknown and CC-BY without attribution', () => {
    expect(ALLOWED_LICENSES).toEqual(['CC0-1.0', 'CC-BY-4.0', 'LicenseRef-Pixabay']);
    expect(licenseVerdict({ spdx: 'CC0-1.0' })).toEqual({ allowed: true, reason_tr: null });
    expect(licenseVerdict({ spdx: 'LicenseRef-Pixabay' }).allowed).toBe(true);
    expect(licenseVerdict({ spdx: 'CC-BY-4.0', attribution: 'Müzik: Ada Yazar (CC BY 4.0)' }).allowed).toBe(true);
    expect(licenseVerdict({ spdx: 'CC-BY-4.0' })).toEqual({ allowed: false, reason_tr: 'CC-BY-4.0 atıf metni olmadan kullanılamaz' });
    expect(licenseVerdict({ spdx: 'CC-BY-NC-4.0' })).toEqual({ allowed: false, reason_tr: 'lisans izinli değil: CC-BY-NC-4.0 (izinli: CC0-1.0, CC-BY-4.0, LicenseRef-Pixabay)' });
    expect(licenseVerdict({ spdx: 'LicenseRef-YouTube-Audio-Library' }).allowed).toBe(false);
  });
});
```

`packages/db/test/assets.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAsset, insertAsset, insertBlob, listAssets } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const blob = async (c: string) => { const sha256 = c.repeat(64); await insertBlob(t.pool, { sha256, path: `media/${sha256}.wav`, bytes: 10, mime: 'audio/wav' }); return sha256; };

describe('assets table (migration 0007)', () => {
  it('stores allowed and rejected assets, lists allowed ones by kind, and keeps one row per blob and kind', async () => {
    const a = (await insertAsset(t.pool, { kind: 'music', title: 'Sakin', blobSha: await blob('a'), licenseSpdx: 'CC0-1.0', author: 'A', allowed: true, tags: ['sakin'], durationMs: 60_000 }))!;
    await insertAsset(t.pool, { kind: 'music', title: 'NC parça', blobSha: await blob('b'), licenseSpdx: 'CC-BY-NC-4.0', author: 'B', allowed: false });
    await insertAsset(t.pool, { kind: 'sfx', title: 'whoosh', blobSha: await blob('c'), licenseSpdx: 'CC0-1.0', author: 'VideoGen (prosedürel)', allowed: true, tags: ['whoosh'] });
    expect(await insertAsset(t.pool, { kind: 'music', title: 'Aynı', blobSha: a.blobSha, licenseSpdx: 'CC0-1.0', author: 'A', allowed: true })).toBeNull();
    expect((await listAssets(t.pool, { kind: 'music', allowedOnly: true })).map((x) => x.title)).toEqual(['Sakin']);
    expect((await listAssets(t.pool, { kind: 'music' })).map((x) => x.title)).toEqual(['Sakin', 'NC parça']);
    expect(await getAsset(t.pool, a.id)).toMatchObject({ kind: 'music', allowed: true, tags: ['sakin'], durationMs: 60_000, attribution: null });
  });
});
```

`apps/worker/test/assets.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getBlob, listAssets } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { ensureSfxLibrary, importAsset, parseAddArgs, SFX_NAMES } from '../src/assets.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const tmp = () => mkdtempSync(join(tmpdir(), 'vg-assets-'));
const actions = async () => (await t.pool.query("SELECT action, data FROM audit_log WHERE action LIKE 'asset.%' ORDER BY seq")).rows as { action: string; data: Record<string, unknown> }[];

describe('asset import and the procedural SFX library', () => {
  it('imports a CC-BY track with its attribution and license snapshot; a non-commercial track is stored as rejected and audited', async () => {
    const data = tmp();
    const wav = join(data, 'bed.wav');
    const { execFileSync } = await import('node:child_process');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=220:d=3:sample_rate=48000', wav]);
    const lic = join(data, 'license.txt');
    writeFileSync(lic, 'Creative Commons Attribution 4.0 International');
    const ok = await importAsset(t.pool, data, FFMPEG, { kind: 'music', file: wav, title: 'Yatak', spdx: 'CC-BY-4.0', author: 'Ada', attribution: 'Müzik: Ada (CC BY 4.0)', licenseTextFile: lic, sourceUrl: 'https://example.org/yatak' });
    expect(ok).toMatchObject({ allowed: true, kind: 'music', attribution: 'Müzik: Ada (CC BY 4.0)' });
    expect(Math.round(ok.durationMs! / 100)).toBe(30);
    expect((await getBlob(t.pool, ok.licenseSnapshotSha!))!.mime).toBe('text/plain');
    const no = await importAsset(t.pool, data, FFMPEG, { kind: 'music', file: lic, title: 'NC', spdx: 'CC-BY-NC-4.0', author: 'B', licenseTextFile: lic });
    expect(no.allowed).toBe(false);
    expect((await actions()).map((a) => a.action)).toEqual(['asset.imported', 'asset.rejected']);
    expect((await actions())[1]!.data).toMatchObject({ reason: expect.stringContaining('CC-BY-NC-4.0') });
  });

  it('generates six deterministic CC0 sound effects once and registers them as allowed', async () => {
    const lib = await ensureSfxLibrary(t.pool, tmp(), FFMPEG);
    expect(Object.keys(lib).sort()).toEqual([...SFX_NAMES].sort());
    expect(Object.values(lib).every((a) => a.allowed && a.licenseSpdx === 'CC0-1.0' && a.durationMs! > 0 && a.durationMs! <= 700)).toBe(true);
    const again = await ensureSfxLibrary(t.pool, tmp(), FFMPEG); // another data dir: same bytes → same blobs → no new rows
    expect(again.whoosh.blobSha).toBe(lib.whoosh.blobSha);
    expect((await listAssets(t.pool, { kind: 'sfx' })).length).toBe(6);
  });

  it('parses the CLI add command and refuses missing license fields', () => {
    expect(parseAddArgs(['--kind', 'music', '--file', 'a.mp3', '--title', 'Sakin', '--license', 'CC0-1.0', '--author', 'A', '--license-text', 'l.txt', '--tags', 'sakin,ambient']))
      .toEqual({ kind: 'music', file: 'a.mp3', title: 'Sakin', spdx: 'CC0-1.0', author: 'A', licenseTextFile: 'l.txt', tags: ['sakin', 'ambient'] });
    expect(() => parseAddArgs(['--kind', 'music', '--file', 'a.mp3'])).toThrow('eksik: --title, --license, --author, --license-text');
    expect(() => parseAddArgs(['--kind', 'video', '--file', 'a', '--title', 't', '--license', 'CC0-1.0', '--author', 'a', '--license-text', 'l'])).toThrow('--kind');
  });
});
```

- [ ] **Step 2: Testlerin düştüğünü gör**

Run: `npx vitest run packages/shared/test/assets.test.ts packages/db/test/assets.test.ts apps/worker/test/assets.test.ts`
Expected: FAIL — `licenseVerdict` / `insertAsset` export'u yok, `../src/assets.ts` yok.

- [ ] **Step 3: Uygula**

`packages/shared/src/assets.ts`:

```ts
/** Spec §11.1 assets.kind. M5a uses music and sfx; the others are reserved (fonts, HDRIs, 3D models: M7; voice references: M5c). */
export const ASSET_KINDS = ['music', 'sfx', 'model3d', 'hdri', 'font', 'voice_ref'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Spec §9: only these may reach a render. NC, ND, SA and the YouTube Audio Library standard license are blocked. */
export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'LicenseRef-Pixabay'] as const;

export function licenseVerdict(a: { spdx: string; attribution?: string | null }): { allowed: boolean; reason_tr: string | null } {
  if (!(ALLOWED_LICENSES as readonly string[]).includes(a.spdx)) return { allowed: false, reason_tr: `lisans izinli değil: ${a.spdx} (izinli: ${ALLOWED_LICENSES.join(', ')})` };
  if (a.spdx === 'CC-BY-4.0' && !a.attribution?.trim()) return { allowed: false, reason_tr: 'CC-BY-4.0 atıf metni olmadan kullanılamaz' };
  return { allowed: true, reason_tr: null };
}
```

`packages/db/src/assets.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { AssetKind } from '@videogen/shared';
import type { Queryable } from './client.ts';

export interface NewAsset {
  kind: AssetKind; title: string; blobSha: string; licenseSpdx: string; author: string; allowed: boolean;
  sourceUrl?: string | null; attribution?: string | null; licenseSnapshotSha?: string | null; tags?: string[]; durationMs?: number | null;
}
export interface AssetRecord extends Required<Omit<NewAsset, 'tags'>> { id: string; tags: string[]; createdAt: string }

const toAsset = (r: Record<string, any>): AssetRecord => ({
  id: r.id, kind: r.kind, title: r.title, blobSha: r.blob_sha, licenseSpdx: r.license_spdx, sourceUrl: r.source_url, author: r.author, attribution: r.attribution,
  licenseSnapshotSha: r.license_snapshot_sha, allowed: r.allowed, tags: r.tags ?? [], durationMs: r.duration_ms, createdAt: new Date(r.created_at).toISOString(),
});

/** Null when this blob is already registered for this kind (content addressed: one row per file and kind). */
export async function insertAsset(db: Queryable, a: NewAsset): Promise<AssetRecord | null> {
  const { rows } = await db.query(
    `INSERT INTO assets (id, kind, title, blob_sha, license_spdx, source_url, author, attribution, license_snapshot_sha, allowed, tags, duration_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, clock_timestamp()) ON CONFLICT (blob_sha, kind) DO NOTHING RETURNING *`,
    [randomUUID(), a.kind, a.title, a.blobSha, a.licenseSpdx, a.sourceUrl ?? null, a.author, a.attribution ?? null, a.licenseSnapshotSha ?? null, a.allowed, JSON.stringify(a.tags ?? []), a.durationMs ?? null],
  );
  return rows[0] ? toAsset(rows[0]) : null;
}

export async function listAssets(db: Queryable, o: { kind?: AssetKind; allowedOnly?: boolean } = {}): Promise<AssetRecord[]> {
  const { rows } = await db.query(
    'SELECT * FROM assets WHERE ($1::text IS NULL OR kind = $1) AND (NOT $2::boolean OR allowed) ORDER BY created_at, id',
    [o.kind ?? null, o.allowedOnly ?? false],
  );
  return rows.map(toAsset);
}

export async function getAsset(db: Queryable, id: string): Promise<AssetRecord | null> {
  const { rows } = await db.query('SELECT * FROM assets WHERE id = $1', [id]);
  return rows[0] ? toAsset(rows[0]) : null;
}

export async function findAssetByBlob(db: Queryable, kind: AssetKind, blobSha: string): Promise<AssetRecord | null> {
  const { rows } = await db.query('SELECT * FROM assets WHERE kind = $1 AND blob_sha = $2', [kind, blobSha]);
  return rows[0] ? toAsset(rows[0]) : null;
}
```

`apps/worker/src/assets.ts`:

```ts
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { ASSET_KINDS, licenseVerdict, type AssetKind } from '@videogen/shared';
import { appendAudit, findAssetByBlob, insertAsset, type AssetRecord } from '@videogen/db';
import { putBlob } from './media.ts';
import { ffprobeOf } from './render/ffmpeg.ts';

export interface ImportAssetInput {
  kind: AssetKind; file: string; title: string; spdx: string; author: string; licenseTextFile: string;
  sourceUrl?: string; attribution?: string; tags?: string[];
}

/** Duration of an audio file (ms, ffprobe); null when it is not audio. */
export function audioDurationMs(ffmpeg: string, file: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(ffprobeOf(ffmpeg), ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 15_000 }, (err, out) => {
      const s = Number(String(out).trim());
      resolve(err || !Number.isFinite(s) || s <= 0 ? null : Math.round(s * 1000));
    });
  });
}

/** Spec §9 license gate at the door: every import is recorded (rejected ones with allowed=false) and audited. */
export async function importAsset(pool: pg.Pool, dataDir: string, ffmpeg: string, i: ImportAssetInput): Promise<AssetRecord> {
  const verdict = licenseVerdict({ spdx: i.spdx, attribution: i.attribution });
  const blob = await putBlob(pool, dataDir, i.file);
  const license = await putBlob(pool, dataDir, i.licenseTextFile);
  const durationMs = i.kind === 'music' || i.kind === 'sfx' ? await audioDurationMs(ffmpeg, i.file) : null;
  const row = (await insertAsset(pool, {
    kind: i.kind, title: i.title, blobSha: blob.sha256, licenseSpdx: i.spdx, author: i.author, allowed: verdict.allowed, sourceUrl: i.sourceUrl ?? null,
    attribution: i.attribution ?? null, licenseSnapshotSha: license.sha256, tags: i.tags ?? [], durationMs,
  })) ?? (await findAssetByBlob(pool, i.kind, blob.sha256))!;
  await appendAudit(pool, {
    actorType: 'user', action: verdict.allowed ? 'asset.imported' : 'asset.rejected', subjectType: 'asset', subjectId: row.id,
    data: { kind: i.kind, title: i.title, license: i.spdx, sha256: blob.sha256, ...(verdict.reason_tr ? { reason: verdict.reason_tr } : {}) },
  });
  return row;
}

export const SFX_NAMES = ['whoosh', 'swoosh', 'click', 'snap', 'tick', 'thud'] as const;
export type SfxName = (typeof SFX_NAMES)[number];
/** Plan E10: procedural, deterministic (fixed noise seed), 48 kHz mono. CC0 by construction (made here with ffmpeg). */
const SFX_RECIPES: Record<SfxName, string> = {
  whoosh: 'anoisesrc=d=0.6:c=pink:r=48000:a=0.5:seed=7,highpass=f=300,lowpass=f=4000,afade=t=in:d=0.25,afade=t=out:st=0.3:d=0.3',
  swoosh: 'anoisesrc=d=0.4:c=white:r=48000:a=0.35:seed=11,bandpass=f=1800:width_type=h:w=1200,afade=t=in:d=0.1,afade=t=out:st=0.15:d=0.25',
  click: "aevalsrc='0.8*sin(2*PI*2400*t)*exp(-t*90)':d=0.06:s=48000",
  snap: "aevalsrc='0.9*(sin(2*PI*1200*t)+0.5*sin(2*PI*3100*t))*exp(-t*60)':d=0.12:s=48000",
  tick: "aevalsrc='0.5*sin(2*PI*3600*t)*exp(-t*140)':d=0.04:s=48000",
  thud: "aevalsrc='0.9*sin(2*PI*90*t)*exp(-t*18)':d=0.35:s=48000",
};
const SFX_LICENSE = 'CC0 1.0 Universal. VideoGen bu sesi ffmpeg ile kendisi üretir (prosedürel; üçüncü taraf kaynak yok).\n';

const run = (ffmpeg: string, args: string[]) => new Promise<void>((resolve, reject) => {
  execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 30_000 }, (err, _o, e) => (err ? reject(new Error(`ffmpeg: ${String(e).trim().split('\n').at(-1)}`)) : resolve()));
});

/** Generates the library under <dataDir>/cache/sfx once and registers it (idempotent: same bytes → same blob → existing row). */
export async function ensureSfxLibrary(pool: pg.Pool, dataDir: string, ffmpeg: string): Promise<Record<SfxName, AssetRecord>> {
  const dir = join(dataDir, 'cache', 'sfx');
  await mkdir(dir, { recursive: true });
  const lic = join(dir, 'LICENSE.txt');
  await writeFile(lic, SFX_LICENSE);
  const out = {} as Record<SfxName, AssetRecord>;
  for (const name of SFX_NAMES) {
    const file = join(dir, `${name}.wav`);
    if (!existsSync(file)) await run(ffmpeg, ['-f', 'lavfi', '-i', SFX_RECIPES[name], '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', '-fflags', '+bitexact', '-flags:a', '+bitexact', file]);
    const blob = await putBlob(pool, dataDir, file);
    const existing = await findAssetByBlob(pool, 'sfx', blob.sha256);
    out[name] = existing ?? await importAsset(pool, dataDir, ffmpeg, { kind: 'sfx', file, title: name, spdx: 'CC0-1.0', author: 'VideoGen (prosedürel)', licenseTextFile: lic, tags: [name] });
  }
  return out;
}

/** `bin/assets.mjs add …` arguments (plan E13). */
export function parseAddArgs(argv: string[]): ImportAssetInput {
  const v: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) if (argv[i]?.startsWith('--') && argv[i + 1] !== undefined) v[argv[i]!.slice(2)] = argv[i + 1]!;
  if (!(ASSET_KINDS as readonly string[]).includes(v.kind ?? '')) throw new Error(`--kind şunlardan biri olmalı: ${ASSET_KINDS.join(', ')}`);
  const missing = ['file', 'title', 'license', 'author', 'license-text'].filter((k) => !v[k]);
  if (missing.length) throw new Error(`eksik: ${missing.map((k) => `--${k}`).join(', ')}`);
  return {
    kind: v.kind as AssetKind, file: v.file!, title: v.title!, spdx: v.license!, author: v.author!, licenseTextFile: v['license-text']!,
    ...(v.source ? { sourceUrl: v.source } : {}), ...(v.attribution ? { attribution: v.attribution } : {}), ...(v.tags ? { tags: v.tags.split(',').map((x) => x.trim()).filter(Boolean) } : {}),
  };
}
```

`bin/assets.mjs`:

```js
#!/usr/bin/env node
// Asset ledger (spec §9, plan E13): `node bin/assets.mjs add --kind music --file … --title … --license CC0-1.0 --author … --license-text …` · `node bin/assets.mjs list`
import { resolve } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const root = resolve(import.meta.dirname, '..');
const { loadConfig } = await import('../packages/shared/src/config.ts');
const { createPool, listAssets } = await import('../packages/db/src/index.ts');
const { importAsset, parseAddArgs } = await import('../apps/worker/src/assets.ts');
const [cmd, ...rest] = process.argv.slice(2);
const config = loadConfig();
const pool = createPool(config.adminDatabaseUrl);
try {
  if (cmd === 'add') {
    const i = parseAddArgs(rest);
    const a = await importAsset(pool, config.dataDir, config.render.ffmpeg, { ...i, file: resolve(i.file), licenseTextFile: resolve(i.licenseTextFile) });
    console.log(a.allowed ? `eklendi: ${a.title} (${a.licenseSpdx}) ${a.id}` : `REDDEDİLDİ (izinsiz lisans, kaydedildi): ${a.title} (${a.licenseSpdx})`);
    process.exitCode = a.allowed ? 0 : 3;
  } else if (cmd === 'list') {
    for (const a of await listAssets(pool)) console.log(`${a.allowed ? '✓' : '✗'} ${a.kind}\t${a.licenseSpdx}\t${a.title}\t${a.author}`);
  } else {
    console.error('kullanım: node bin/assets.mjs add --kind music|sfx --file F --title T --license SPDX --author A --license-text L [--source URL] [--attribution M] [--tags a,b] | list');
    process.exitCode = 2;
  }
} finally {
  await pool.end();
}
void root;
```

Diff (`git apply`):

```diff
--- a/packages/db/src/schema.ts
+++ b/packages/db/src/schema.ts
@@ -1,4 +1,4 @@
-import { type AnyPgColumn, bigint, bigserial, doublePrecision, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
+import { type AnyPgColumn, bigint, bigserial, boolean, doublePrecision, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
 import { sql } from 'drizzle-orm';
 
 export const auditLog = pgTable(
--- a/packages/db/src/index.ts
+++ b/packages/db/src/index.ts
@@ -11,3 +11,4 @@
 export * from './jobs.ts';
 export * from './channel.ts';
 export * from './steps-sessions.ts';
+export * from './assets.ts';
--- a/packages/shared/src/index.ts
+++ b/packages/shared/src/index.ts
@@ -6,5 +6,6 @@
+export * from './assets.ts';
 export * from './artifacts.ts';
--- a/packages/shared/src/browser.ts
+++ b/packages/shared/src/browser.ts
@@ -3,5 +3,6 @@
+export * from './assets.ts';
 export * from './artifacts.ts';
```

(`index.ts`/`browser.ts` hunk'ları satır numarasına bağlı değil: `export * from './artifacts.ts';` satırının hemen üstüne ekle.)

`packages/db/src/schema.ts` sonuna (artifacts tablosundan sonra):

```ts
/** Spec §9 / §11.1 asset ledger (migration 0007, plan E13). `allowed` is the license gate's verdict at import time. */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    blobSha: text('blob_sha').notNull().references(() => blobs.sha256),
    licenseSpdx: text('license_spdx').notNull(),
    sourceUrl: text('source_url'),
    author: text('author').notNull(),
    attribution: text('attribution'),
    licenseSnapshotSha: text('license_snapshot_sha').references(() => blobs.sha256),
    allowed: boolean('allowed').notNull(),
    platforms: jsonb('platforms').notNull().default([]),
    tags: jsonb('tags').notNull().default([]),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 6 }).notNull().defaultNow(),
  },
  (t) => [index('assets_kind_idx').on(t.kind, t.allowed), uniqueIndex('assets_blob_kind_uq').on(t.blobSha, t.kind)],
);
```

Migration'ı üret:

Run: `cd packages/db && npx drizzle-kit generate --name assets && cd ../.. && cat packages/db/drizzle/0007_assets.sql`
Expected: `CREATE TABLE "assets" (…)`, iki FK (`blobs`), `assets_kind_idx`, `assets_blob_kind_uq`. Uygulama rolünün yetkisi 0001'in varsayılan yetkilerinden gelir (ek GRANT yok).

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run packages/shared/test/assets.test.ts packages/db/test/assets.test.ts apps/worker/test/assets.test.ts && npm run typecheck && npm test`
Expected: `5 passed`; tam paket `Tests  323 passed (323)`.

- [ ] **Step 5: Commit** — `feat(assets): asset ledger (migration 0007), license gate, import CLI and a procedural CC0 sound library`

---
### Task 3: `vg_blender` final render — `final_cli.py`, devam eden RGBA PNG kareleri, ilerleme ve GPU denetimi

**Files:**
- Create: `python/vg_blender/final_cli.py`
- Modify: `python/vg_blender/vg_blender/render.py` (`complete_png`, `final_main`)
- Test: `python/vg_blender/tests/test_render.py` (+2)

**Interfaces:**
- Produces: `render.final_main(argv) -> int` (`--blend --out --start --end [--samples] [--scale] [--allow-any-gpu]`); stdout `VG_SKIPPED n`, `VG_RENDERER <ad>`, `VG_PROGRESS done total` (atlananlar dahil), `VG_SAMPLES n`, `VG_ERROR …`; çıkış 0 / 3 (NVIDIA değil). `render.complete_png(path) -> bool`. Kare adı `f%05d.png`; geçici yazım `.fNNNNN.tmp.png` + `os.replace` (atomik).

- [ ] **Step 1: Başarısız testi yaz**

`python/vg_blender/tests/test_render.py` sonuna:

```python
    def test_complete_png_rejects_truncated_and_foreign_files(self):
        d = tempfile.mkdtemp(prefix="vgp-")
        try:
            good = os.path.join(d, "a.png")
            img = bpy.data.images.new("vgp", 4, 4, alpha=True)
            img.filepath_raw = good
            img.file_format = "PNG"
            img.save()
            self.assertTrue(render.complete_png(good))
            with open(good, "rb") as f:
                data = f.read()
            cut = os.path.join(d, "b.png")
            with open(cut, "wb") as f:
                f.write(data[: len(data) // 2])
            self.assertFalse(render.complete_png(cut))
            txt = os.path.join(d, "c.png")
            with open(txt, "w") as f:
                f.write("not a png at all, but long enough to have a tail of twelve bytes ......")
            self.assertFalse(render.complete_png(txt))
            self.assertFalse(render.complete_png(os.path.join(d, "missing.png")))
        finally:
            shutil.rmtree(d, ignore_errors=True)

    def test_final_frames_are_transparent_rgba_and_a_rerun_skips_complete_ones(self):
        d = tempfile.mkdtemp(prefix="vgf-")
        try:
            spec = load("scene-kalem.json")
            blend = os.path.join(d, "product.blend")
            self.assertTrue(build.product_phase(spec, product(), blend)["ok"])
            self.assertTrue(build.build_phase(spec, load("storyboard-kalem.json"), STYLE, blend, os.path.join(d, "out"))["ok"])
            out = os.path.join(d, "frames")
            args = ["--blend", os.path.join(d, "out", "scene.blend"), "--out", out, "--start", "0", "--end", "2", "--scale", "10", "--samples", "4"]
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(render.final_main(args), 0)
            self.assertIn("VG_SKIPPED 0", buf.getvalue())
            self.assertIn("VG_PROGRESS 3 3", buf.getvalue())
            self.assertEqual(sorted(os.listdir(out)), ["f00000.png", "f00001.png", "f00002.png"])
            img = bpy.data.images.load(os.path.join(out, "f00000.png"))
            self.assertEqual(img.channels, 4)
            self.assertEqual((img.size[0], img.size[1]), (108, 192))
            self.assertEqual(img.pixels[3], 0.0)  # bottom-left corner: transparent (the backdrop comes from the style later)
            first = os.path.getmtime(os.path.join(out, "f00000.png"))
            with open(os.path.join(out, "f00001.png"), "r+b") as f:
                f.truncate(40)  # a render killed mid-write
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                self.assertEqual(render.final_main(args), 0)
            self.assertIn("VG_SKIPPED 2", buf.getvalue())
            self.assertEqual(os.path.getmtime(os.path.join(out, "f00000.png")), first)
            self.assertTrue(render.complete_png(os.path.join(out, "f00001.png")))
        finally:
            shutil.rmtree(d, ignore_errors=True)
```

ve dosyanın başındaki import'lara `import contextlib`, `import io`, `import bpy` ekle.

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npm run test:blender`
Expected: FAIL — `AttributeError: module 'vg_blender.render' has no attribute 'complete_png'` (2 hata), diğer 17 test geçer.

- [ ] **Step 3: Uygula**

`python/vg_blender/vg_blender/render.py` sonuna:

```python
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def complete_png(path):
    """A PNG written to the end: the signature at the start and the IEND chunk at the tail (plan E5: resume skips only these)."""
    try:
        if os.path.getsize(path) < 57:
            return False
        with open(path, "rb") as f:
            head = f.read(8)
            f.seek(-12, os.SEEK_END)
            tail = f.read(12)
        return head == PNG_SIGNATURE and tail[4:8] == b"IEND"
    except OSError:
        return False


def final_main(argv):
    """Spec §7.5 Blender final: the .blend's own EEVEE settings (64 samples, raytracing, AgX Punchy), transparent RGBA PNGs.
    Frames that already have a complete PNG are skipped (a restarted worker continues, plan E5); each frame is written to a
    temporary name and renamed, so a killed render never leaves a complete-looking file."""
    ap = argparse.ArgumentParser(prog="vg_blender.final")
    ap.add_argument("--blend", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--end", type=int, required=True)
    ap.add_argument("--samples", type=int, default=0, help="0: the .blend's own (64); 32 on the low-memory retry (spec §14)")
    ap.add_argument("--scale", type=int, default=100, help="tests only")
    ap.add_argument("--allow-any-gpu", action="store_true", help="tests only")
    a = ap.parse_args(argv)
    frames = list(range(a.start, a.end + 1))
    os.makedirs(a.out, exist_ok=True)
    path = lambda f: os.path.join(a.out, f"f{f:05d}.png")  # noqa: E731
    todo = [f for f in frames if not complete_png(path(f))]
    done = len(frames) - len(todo)
    print(f"VG_SKIPPED {done}", flush=True)
    if todo:
        bpy.ops.wm.open_mainfile(filepath=a.blend, load_ui=False)
        s = bpy.context.scene
        s.render.resolution_percentage = a.scale
        if a.samples:
            s.eevee.taa_render_samples = a.samples
        s.render.film_transparent = True
        s.render.image_settings.file_format = "PNG"
        s.render.image_settings.color_mode = "RGBA"
        s.render.image_settings.color_depth = "8"
        s.render.image_settings.compression = 15
        for i, f in enumerate(todo):
            s.frame_set(f)
            tmp = os.path.join(a.out, f".f{f:05d}.tmp.png")
            s.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            if i == 0:
                renderer = gpu.platform.renderer_get()
                print("VG_RENDERER", renderer, flush=True)
                if "NVIDIA" not in renderer and not a.allow_any_gpu:
                    os.remove(tmp)
                    print(f"VG_ERROR GPU NVIDIA değil: {renderer}", flush=True)
                    return 3
            os.replace(tmp, path(f))
            done += 1
            print(f"VG_PROGRESS {done} {len(frames)}", flush=True)
        print(f"VG_SAMPLES {s.eevee.taa_render_samples}", flush=True)
    return 0
```

`python/vg_blender/final_cli.py`:

```python
"""blender -b --factory-startup --disable-autoexec --python-exit-code 1 -P python/vg_blender/final_cli.py -- --blend … --out … --end 1350"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vg_blender import render  # noqa: E402

sys.exit(render.final_main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []))
```

Not: testler `--allow-any-gpu` vermez; `npm run test:blender` `bin/blender-gpu` ile NVIDIA'da koşar (önizleme testi gibi).

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npm run test:blender`
Expected: `Ran 19 tests … OK`.

- [ ] **Step 5: Commit** — `feat(vg_blender): final render CLI with resumable transparent RGBA frames, GPU check and progress`

---
### Task 4: `RenderDriver.final` (gerçek + Fake), `final_render` adımı, terminal durumda kare temizliği

**Files:**
- Create: `apps/worker/src/render/frames.ts`, `apps/worker/src/pipeline/final-steps.ts`, `apps/worker/test-render/final.int.test.ts`
- Modify: `apps/worker/src/render/driver.ts` (`FinalInput/Output`, `RenderDriver.final`, gerçek ve Fake, `retryFinal`, `sandboxed` için `maxRssMb`), `apps/worker/src/render/ffmpeg.ts` (`fakeFrames`), `apps/worker/src/pipeline/steps.ts` (`record` ve `sha` dışa aktarılır), `apps/worker/src/pipeline/orchestrator.ts` (kare temizliği)
- Test: `apps/worker/test/final-render.test.ts`

**Interfaces:**
- Consumes: T3 CLI protokolü; `withResource` (orchestrator), `record`, `latestArtifact`, `findArtifact`, `getBlob`.
- Produces:
  - `FinalInput { runDir; blendPath; outDir; lastFrame; owner; samples?; signal?; onProgress?(done, total) }`, `FinalOutput { dir; frames; skipped; samples; renderer; ms }`, `RenderDriver.final(i)`; `BlenderDriverOptions.finalTimeoutMs? (7 200 000) / finalMaxRssMb? (6144)`; `retryFinal(once) → FinalOutput` (önce varsayılan, çökmede 32 örnek; iki çökme `RenderError('gpu')`).
  - `frames.ts`: `framePath(dir, f)`, `isCompletePng(file)`, `missingFrames(dir, lastFrame) → number[]`, `removeRunFrames(dataDir, runId) → string[]` (silinen dizinler, run'a göre).
  - `final-steps.ts`: `FINAL_RENDER` (sabitler), `FinalFramesMeta { dir; frames; skipped; samples; renderer; renderMs }`, `finalSource(deps, runId) → {hash, blendPath, blendSha, specHash, lastFrame} | null`, `finalRenderExecutor(deps)`.
  - Orchestrator: run terminal olunca (`finish`, `cancel` + son çalışan iş bittiğinde) `removeRunFrames`; audit `frames.deleted {dirs}`.

- [ ] **Step 1: Başarısız testleri yaz**

`apps/worker/test/final-render.test.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, findArtifact, insertArtifact, listRunSteps, updateRun } from '@videogen/db';
import { FakeClaudeDriver, SpecStore } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { finalRenderExecutor, type FinalFramesMeta } from '../src/pipeline/final-steps.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { Orchestrator } from '../src/pipeline/orchestrator.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver, RenderError, retryFinal, type FinalOutput } from '../src/render/driver.ts';
import { framePath, missingFrames, removeRunFrames } from '../src/render/frames.ts';
import { ResourceLocks } from '../src/render/locks.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

function setup() {
  const dataDir = tmp('vg-final-');
  const render = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
  const scene: SceneDeps = { pool: t.pool, render, locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10 };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver: new FakeClaudeDriver({ speed: 0 }), pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene };
  return { dataDir, deps, render };
}
async function built(deps: StepDeps, name = 'Tükenmez kalem') {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const steps = await listRunSteps(t.pool, r.runId);
  const progress: number[] = [];
  const ctx = (key: 'build' | 'final_render', attempt = 1): StepContext => ({
    runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt, round: 0, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
    versionId: r.versionId, runDir, signal: new AbortController().signal, progress: (p) => { if (key === 'final_render') progress.push(p); }, status: () => {}, session: () => {},
  });
  const b = buildExecutor(deps);
  expect(await b.run(ctx('build'), await b.inputHash(ctx('build')))).toMatchObject({ status: 'done' });
  return { r, ctx, runDir, progress };
}

describe('final render: driver, step and frame cleanup', () => {
  it('the fake driver writes frames 0…last as PNGs and a second call skips them all', async () => {
    const dir = join(tmp('vg-ff-'), 'frames');
    const d = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
    const seen: number[] = [];
    const a = await d.final({ runDir: dir, blendPath: '/x.blend', outDir: dir, lastFrame: 59, owner: 'o', onProgress: (n) => seen.push(n) });
    expect(a).toMatchObject({ frames: 60, skipped: 0, samples: 64, renderer: 'fake' });
    expect(readdirSync(dir).length).toBe(60);
    expect(missingFrames(dir, 59)).toEqual([]);
    expect(seen.at(-1)).toBe(60);
    expect((await d.final({ runDir: dir, blendPath: '/x.blend', outDir: dir, lastFrame: 59, owner: 'o' })).skipped).toBe(60);
  });

  it('a crash is retried once with 32 samples; a second crash is a GPU error (spec §14)', async () => {
    const out: FinalOutput = { dir: '/d', frames: 3, skipped: 1, samples: 32, renderer: 'NVIDIA', ms: 5 };
    const calls: (number | null)[] = [];
    expect(await retryFinal(async (s) => { calls.push(s); return calls.length === 1 ? null : out; })).toBe(out);
    expect(calls).toEqual([null, 32]);
    await expect(retryFinal(async () => null)).rejects.toSatisfy((e: unknown) => e instanceof RenderError && e.kind === 'gpu' && /iki kez/.test(e.message));
  });

  it('records the frames (no blob), reports real frame progress, reuses only a complete set and resumes after a restart', async () => {
    const { deps } = setup();
    const { r, ctx, runDir, progress } = await built(deps);
    const ex = finalRenderExecutor(deps);
    const hash = await ex.inputHash(ctx('final_render'));
    expect(await ex.run(ctx('final_render'), hash)).toEqual({ status: 'done', note: '1351 kare · EEVEE 64 örnek · 0 dk' });
    const a = (await findArtifact(t.pool, { runId: r.runId, kind: 'final_frames', inputHash: hash }))!;
    const meta = a.meta as FinalFramesMeta;
    expect(a.blobSha).toBeNull();
    expect(meta).toMatchObject({ dir: `final/${hash.slice(0, 16)}/frames`, frames: 1351, skipped: 0 });
    expect(progress.at(-1)).toBeGreaterThan(90);
    expect(await ex.reuse!(ctx('final_render'), hash)).toBe(true);
    truncateSync(framePath(join(runDir, meta.dir), 700), 20);
    expect(await ex.reuse!(ctx('final_render'), hash)).toBe(false);
    expect(await ex.run(ctx('final_render', 2), hash)).toEqual({ status: 'done', note: '1351 kare · EEVEE 64 örnek · 0 dk · 1350 kare önceden hazırdı' });
  });

  it('deletes only this run\'s frames when the run ends (done or cancelled), never its scene files or another run\'s frames', async () => {
    const dataDir = tmp('vg-clean-');
    const mk = (run: string) => { const d = join(dataDir, 'runs', run, 'final', 'abc', 'frames'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'f00000.png'), 'x'); mkdirSync(join(dataDir, 'runs', run, 'scene'), { recursive: true }); return d; };
    const a = mk('run-a');
    const b = mk('run-b');
    expect(removeRunFrames(dataDir, 'run-a')).toEqual(['runs/run-a/final/abc/frames']);
    expect([existsSync(a), existsSync(join(dataDir, 'runs', 'run-a', 'scene')), existsSync(b)]).toEqual([false, true, true]);
    expect(removeRunFrames(dataDir, 'run-a')).toEqual([]);

    const o = new Orchestrator({ pool: t.pool, dataDir, executors: {}, tickMs: 20 });
    cleanups.push(() => o.stop());
    const run = await createProduceRun(t.pool, { productName: 'Kalem temizlik', audioMode: 'silent', plan: [{ key: 'research', weight: 100 }] });
    const d = mk(run.runId);
    await updateRun(t.pool, run.runId, { status: 'running' });
    await o.cancel(run.runId);
    expect(existsSync(d)).toBe(false);
    expect((await t.pool.query("SELECT data FROM audit_log WHERE action = 'frames.deleted' AND run_id = $1", [run.runId])).rows[0].data).toEqual({ dirs: [`runs/${run.runId}/final/abc/frames`] });
  });
});
```

`apps/worker/test-render/final.int.test.ts` (gerçek Blender, `npm run test:render`; kalem `blender.int.test.ts`'teki gibi gerçek ev klasörü altında, sandbox'lı build ile kurulur):

```ts
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHANNEL_STYLES } from '@videogen/shared';
import { BlenderRenderDriver, PYTHON_DIR } from '../src/render/driver.ts';
import { missingFrames } from '../src/render/frames.ts';

const BLENDER = process.env.VG_BLENDER ?? join(homedir(), 'apps/blender-5.2.2-linux-x64/blender');
const FX = resolve(import.meta.dirname, '../../../tests/fixtures/artifacts');
// Under the real home like ~/videogen-data/runs: the sandbox hides $HOME and re-binds only the run directory.
const DATA = mkdtempSync(join(homedir(), '.vg-render-test-'));
afterAll(() => rmSync(DATA, { recursive: true, force: true }));

describe('Blender final render (real GPU)', () => {
  it('renders frames 0–4 of the built pen at full size as RGBA PNGs on NVIDIA and resumes', async () => {
    const run = mkdtempSync(join(DATA, 'run-'));
    mkdirSync(join(run, 'scene'), { recursive: true });
    copyFileSync(join(FX, 'scene-kalem.json'), join(run, 'scene', 'spec.json'));
    copyFileSync(join(FX, 'storyboard-kalem.json'), join(run, 'scene', 'storyboard.json'));
    copyFileSync(join(PYTHON_DIR, 'examples/kalem/product.py'), join(run, 'scene', 'product.py'));
    const d = new BlenderRenderDriver({ blender: BLENDER, bwrap: process.env.VG_BWRAP ?? '/usr/bin/bwrap', dataDir: DATA, home: homedir() });
    const b = await d.build({
      runDir: run, specPath: join(run, 'scene/spec.json'), storyboardPath: join(run, 'scene/storyboard.json'), productPath: join(run, 'scene/product.py'),
      outDir: join(run, 'scene/build'), style: CHANNEL_STYLES.gece_mavisi, owner: 'int',
    });
    expect(b.report.ok).toBe(true);
    const out = join(run, 'final', 'frames');
    const r = await d.final({ runDir: run, blendPath: b.files!.blend, outDir: out, lastFrame: 4, owner: 'int' });
    expect(r).toMatchObject({ frames: 5, skipped: 0, samples: 64 });
    expect(r.renderer).toContain('NVIDIA');
    expect(missingFrames(out, 4)).toEqual([]);
    const png = readFileSync(join(out, 'f00000.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20), png[25]]).toEqual([1080, 1920, 6]); // IHDR: width, height, colour type 6 = RGBA
    expect((await d.final({ runDir: run, blendPath: b.files!.blend, outDir: out, lastFrame: 4, owner: 'int' })).skipped).toBe(5);
    console.log(`final render: 5 kare ${r.ms} ms`);
  }, 600_000);
});
```

- [ ] **Step 2: Testlerin düştüğünü gör**

Run: `npx vitest run apps/worker/test/final-render.test.ts`
Expected: FAIL — `../src/pipeline/final-steps.ts` ve `../src/render/frames.ts` yok.

- [ ] **Step 3: Uygula**

`apps/worker/src/render/frames.ts`:

```ts
import { closeSync, existsSync, fstatSync, openSync, readdirSync, readSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

export const framePath = (dir: string, f: number) => join(dir, `f${String(f).padStart(5, '0')}.png`);

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Same rule as vg_blender render.complete_png: PNG signature + IEND at the tail (a killed write leaves neither). */
export function isCompletePng(file: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(file, 'r');
    const size = fstatSync(fd).size;
    if (size < 57) return false;
    const head = Buffer.alloc(8);
    const tail = Buffer.alloc(12);
    readSync(fd, head, 0, 8, 0);
    readSync(fd, tail, 0, 12, size - 12);
    return head.equals(SIG) && tail.subarray(4, 8).toString('latin1') === 'IEND';
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export function missingFrames(dir: string, lastFrame: number): number[] {
  const out: number[] = [];
  for (let f = 0; f <= lastFrame; f++) if (!isCompletePng(framePath(dir, f))) out.push(f);
  return out;
}

/** Plan E6: the PNG frame directories of a finished run (runs/<id>/final/<hash>/frames); paths relative to dataDir. */
export function removeRunFrames(dataDir: string, runId: string): string[] {
  const root = join(dataDir, 'runs', runId, 'final');
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  for (const h of readdirSync(root)) {
    const dir = join(root, h, 'frames');
    if (!existsSync(dir)) continue;
    rmSync(dir, { recursive: true, force: true });
    removed.push(relative(dataDir, dir));
  }
  return removed;
}
```

`apps/worker/src/render/ffmpeg.ts` sonuna:

```ts
/** Fake final render (plan E17): `count` tiny transparent RGBA PNGs f00000.png… in one ffmpeg call. */
export function fakeFrames(ffmpeg: string, dir: string, count: number, signal?: AbortSignal): Promise<void> {
  return run(ffmpeg, ['-f', 'lavfi', '-i', 'color=c=black@0.0:s=54x96:r=30,format=rgba', '-frames:v', String(count), '-start_number', '0', join(dir, 'f%05d.png')], signal);
}
```

(`ffmpeg.ts` başına `import { join } from 'node:path';` eklenir.)

`apps/worker/src/render/driver.ts` değişiklikleri:

1. Arayüzler (`DraftOutput`'tan sonra):

```ts
export interface FinalInput {
  runDir: string;
  /** Inside runDir (the sandbox sees only the run directory): the step copies the scene .blend there. */
  blendPath: string;
  outDir: string;
  lastFrame: number;
  owner: string;
  /** Default: the .blend's own (64). */
  samples?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}
export interface FinalOutput { dir: string; frames: number; skipped: number; samples: number; renderer: string; ms: number }

/** Spec §14 (plan E5): the default samples first; after a crash the remaining frames once more with 32 (frames already done are kept). */
export async function retryFinal(once: (samples: number | null) => Promise<FinalOutput | null>, samples?: number): Promise<FinalOutput> {
  const out = (await once(samples ?? null)) ?? (await once(32));
  if (!out) throw new RenderError('gpu', 'final render iki kez çöktü (varsayılan ve 32 örnek)');
  return out;
}
```

2. `RenderDriver` arayüzüne:

```ts
  /** Spec §7.1 step 7: Blender EEVEE RGBA PNG frames 0…lastFrame, resumable. GPU (the caller holds the lock). */
  final(i: FinalInput): Promise<FinalOutput>;
```

3. `BlenderDriverOptions`'a `finalTimeoutMs?: number; finalMaxRssMb?: number;`.

4. `sandboxed`'ın `i` tipine `maxRssMb?: number` ve `runProcess` çağrısında `maxRssMb: i.maxRssMb ?? this.o.maxRssMb ?? 4096`.

5. `BlenderRenderDriver`'a:

```ts
  async final(i: FinalInput): Promise<FinalOutput> {
    await mkdir(i.outDir, { recursive: true });
    return retryFinal(async (samples) => {
      let renderer = '';
      let skipped = 0;
      let used = 0;
      let gpuError = '';
      const r = await this.sandboxed({
        runDir: i.runDir, owner: i.owner, signal: i.signal, gpu: true, timeoutMs: this.o.finalTimeoutMs ?? 7_200_000, maxRssMb: this.o.finalMaxRssMb ?? 6144,
        onLine: (l) => {
          const p = /^VG_PROGRESS (\d+) (\d+)$/.exec(l);
          if (p) i.onProgress?.(Number(p[1]), Number(p[2]));
          if (l.startsWith('VG_RENDERER ')) renderer = l.slice(12).trim();
          if (l.startsWith('VG_SKIPPED ')) skipped = Number(l.slice(11));
          if (l.startsWith('VG_SAMPLES ')) used = Number(l.slice(11));
          if (l.startsWith('VG_ERROR ')) gpuError = l.slice(9).trim();
        },
      }, this.blenderArgs('final_cli.py', ['--blend', i.blendPath, '--out', i.outDir, '--start', '0', '--end', String(i.lastFrame), ...(samples ? ['--samples', String(samples)] : [])]));
      await this.o.audit?.('render.final', { ms: r.ms, code: r.code, stopped: r.stopped, samples: samples ?? 'blend', skipped, renderer });
      const stop = stoppedError(r, 'final render');
      if (stop) throw stop;
      if (r.code === 3) throw new RenderError('gpu', gpuError || 'GPU NVIDIA değil');
      if (r.code !== 0) return null;
      return { dir: i.outDir, frames: i.lastFrame + 1, skipped, samples: used || samples || 64, renderer, ms: r.ms };
    }, i.samples);
  }
```

6. `FakeRenderDriver`'a:

```ts
  /** Spec §16.1: tiny transparent frames; frames already present are counted as skipped (like the real resume). */
  async final(i: FinalInput): Promise<FinalOutput> {
    const t0 = Date.now();
    await mkdir(i.outDir, { recursive: true });
    await this.wait(i.signal);
    const total = i.lastFrame + 1;
    const skipped = total - missingFrames(i.outDir, i.lastFrame).length;
    if (skipped < total) await fakeFrames(this.o.ffmpeg, i.outDir, total, i.signal);
    if (i.signal?.aborted) throw new RenderError('aborted', 'durduruldu');
    i.onProgress?.(total, total);
    return { dir: i.outDir, frames: total, skipped, samples: i.samples ?? 64, renderer: 'fake', ms: Date.now() - t0 };
  }
```

(import'lar: `fakeFrames` (`./ffmpeg.ts`), `missingFrames` (`./frames.ts`).)

`apps/worker/src/pipeline/steps.ts`: `const sha = …` → `export const sha = …`; `async function record(` → `export async function record(`; `const failure = …` → `export const failure = …`.

`apps/worker/src/pipeline/final-steps.ts`:

```ts
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateArtifact } from '@videogen/shared';
import { appendAudit, findArtifact, getBlob, insertArtifact, latestArtifact } from '@videogen/db';
import { RenderError } from '../render/driver.ts';
import { missingFrames } from '../render/frames.ts';
import { sha, type StepDeps } from './steps.ts';
import type { StepExecutor } from './types.ts';

/** Fixed final render parameters (spec §7.5; part of the §8.3 input hash). The .blend carries the EEVEE settings (stage.configure). */
export const FINAL_RENDER = { engine: 'BLENDER_EEVEE', samples: 64, raytracing: true, view: 'AgX Punchy', width: 1080, height: 1920, fps: 30, frames: 'png-rgba8' } as const;

/** `final_frames` artifact meta (plan E6): the frames stay in the run directory, never in the blob store. */
export interface FinalFramesMeta { dir: string; frames: number; skipped: number; samples: number; renderer: string; renderMs: number }

/** Plan E16: the latest scene .blend and spec of the run, and the final render's input hash. */
export async function finalSource(deps: Pick<StepDeps, 'pool' | 'dataDir'>, runId: string): Promise<{ hash: string; blendPath: string; blendSha: string; specHash: string; lastFrame: number } | null> {
  const [blend, scene] = await Promise.all(['scene_blend', 'scene'].map((k) => latestArtifact(deps.pool, runId, k)));
  const s = scene ? validateArtifact('SceneSpec', scene.content) : null;
  const blob = blend?.blobSha ? await getBlob(deps.pool, blend.blobSha) : null;
  if (!s?.ok || !blob) return null;
  const specHash = sha(s.value);
  return { hash: sha({ step: 'final_render', blend: blob.sha256, spec: specHash, style: s.value.style_id, render: FINAL_RENDER }), blendPath: join(deps.dataDir, blob.path), blendSha: blob.sha256, specHash, lastFrame: s.value.frames };
}

/** Spec §7.1 step 7: Blender final frames. GPU: the orchestrator holds the lock and checks §6.4 with the frames' disk estimate. */
export function finalRenderExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'final_render',
    resource: 'gpu',
    extraDiskMb: 2000,
    async inputHash(ctx) {
      return (await finalSource(deps, ctx.runId))?.hash ?? sha({ step: 'final_render', missing: true });
    },
    async reuse(ctx, hash) {
      const a = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'final_frames', inputHash: hash });
      const m = a?.meta as FinalFramesMeta | undefined;
      return !!m && missingFrames(join(ctx.runDir, m.dir), m.frames - 1).length === 0;
    },
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const src = await finalSource(deps, ctx.runId);
      if (!src) return { status: 'failed', error: "sahne çıktısı yok (.blend ya da sahne spec'i)", retry: false };
      const rel = join('final', hash.slice(0, 16));
      const work = join(ctx.runDir, rel);
      await mkdir(work, { recursive: true });
      const blend = join(work, 'scene.blend');
      await copyFile(src.blendPath, blend);
      try {
        const r = await scene.render.final({
          runDir: ctx.runDir, blendPath: blend, outDir: join(work, 'frames'), lastFrame: src.lastFrame, owner: ctx.stepId, signal: ctx.signal,
          onProgress: (done, total) => ctx.progress(Math.min(99, (done / total) * 100), 'render'),
        });
        const meta: FinalFramesMeta = { dir: join(rel, 'frames'), frames: r.frames, skipped: r.skipped, samples: r.samples, renderer: r.renderer, renderMs: r.ms };
        const a = await insertArtifact(deps.pool, { runId: ctx.runId, stepId: ctx.stepId, versionId: ctx.versionId, kind: 'final_frames', inputHash: hash, meta });
        await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: ctx.runId, stepId: ctx.stepId, subjectType: 'artifact', subjectId: a.id, data: { kind: 'final_frames', frames: r.frames, skipped: r.skipped } });
        return { status: 'done', note: `${r.frames} kare · EEVEE ${r.samples} örnek · ${Math.round(r.ms / 60_000)} dk${r.skipped ? ` · ${r.skipped} kare önceden hazırdı` : ''}` };
      } catch (e) {
        if (e instanceof RenderError && e.kind !== 'aborted') return { status: 'failed', error: e.message, retry: false };
        throw e;
      }
    },
  };
}
```

`apps/worker/src/pipeline/orchestrator.ts`:
- import: `import { removeRunFrames } from '../render/frames.ts';`
- sınıfa:

```ts
  /** Plan E6: a terminal run's PNG frames go; only when none of its jobs is still running (a cancelled render may still be writing). */
  private async cleanupFrames(runId: string): Promise<void> {
    if ([...this.running.values()].some((r) => r.runId === runId)) return;
    const dirs = removeRunFrames(this.d.dataDir, runId);
    if (dirs.length) await this.audit('frames.deleted', runId, { data: { dirs } });
  }
```
- `finish()` sonunda (`await this.publish(runId);`'dan önce) `await this.cleanupFrames(runId);`
- `cancel()` sonunda (`await this.publish(runId);`'dan önce) `await this.cleanupFrames(runId);`
- Çalışan bir iş bittiğinde `this.running.delete(job…)`'un hemen ardından: run terminal ise (`TERMINAL.includes((await getRun(pool, runId))!.status)`) `await this.cleanupFrames(runId)`.

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/final-render.test.ts && npm run typecheck && npm test`
Expected: `4 passed`; tam paket `Tests  327 passed (327)`.

Run (GPU'lu makinede): `npm run test:render`
Expected: `Tests  8 passed (8)` (Blender 4 + taslak 3 + final 1); konsolda `final render: 5 kare … ms`.

- [ ] **Step 5: Commit** — `feat(render): resumable Blender final render step with a low-sample retry and frame cleanup on terminal runs`

---
### Task 5: `packages/remotion` III — ortak `Overlay`, `Final3D`, `labelsAt`, `overlayBoxes`, `layout.json`

**Files:**
- Create: `packages/remotion/src/gltf.ts` (`useGltf`, `Draft3D`'den taşınır), `packages/remotion/src/Overlay.tsx`, `packages/remotion/src/Final3D.tsx`, `packages/remotion/src/layout.ts`
- Modify: `packages/remotion/src/Draft3D.tsx` (tam dosya aşağıda), `packages/remotion/src/props.ts` (`FINAL_COMPOSITION`, `FinalProps`, `finalProps`, `frameUrl`, `TextBox`, `wrapLines`, `overlayBoxes`), `packages/remotion/src/Root.tsx`, `packages/remotion/src/index.ts`, `packages/remotion/package.json` (`./layout` export)
- Test: `packages/remotion/test/final.test.ts`

**Interfaces:**
- Produces:
  - `FINAL_COMPOSITION = 'Final3D'`; `type FinalProps = DraftProps & { framesUrl: string }`; `finalProps({glbUrl, framesUrl, yfov, scene, storyboard, style}) → FinalProps` (1080×1920); `frameUrl(base, frame) → "<base>/f00012.png"`.
  - `interface TextBox { kind: 'hook'|'beat'|'label'; id?; box: [x0,y0,x1,y1] }`; `wrapLines(text, font, maxWidth) → string[]`; `overlayBoxes(p, frame, labels) → TextBox[]`.
  - `labelsAt(gltf, clock, cam, p, frame) → LabelBox[]` (seek + lens + projeksiyon + yerleşim; Draft3D, Final3D ve manifest aynı fonksiyonu kullanır).
  - `LayoutManifest { width; height; fps; frames: {frame, boxes}[] }`, `layoutFrames(p) → number[]` (her 5 kare + vuruş başları ve +6), `layoutManifest(p, gltf)`, `layoutIssues(m) → LayoutIssue[]` (`@videogen/remotion/layout`).
  - `Overlay({p, frame, labels})` (React), `Final3D` (React), `useGltf(url)`.

- [ ] **Step 1: Başarısız testi yaz**

`packages/remotion/test/final.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { parseGlb } from '@videogen/scene3d';
import { layoutFrames, layoutIssues, layoutManifest } from '../src/layout.ts';
import { finalProps, frameUrl, MAX_LABELS, overlayBoxes, safeRect, wrapLines } from '../src/props.ts';

const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const json = <T>(p: string) => JSON.parse(readFileSync(resolve(FX, p), 'utf8')) as T;
const props = () => finalProps({
  glbUrl: '/g', framesUrl: 'http://127.0.0.1:1/tok/frames', yfov: json<{ yfov: number[] }>('scene/kalem/camera_track.json').yfov,
  scene: json<SceneSpec>('artifacts/scene-kalem.json'), storyboard: json<Storyboard>('artifacts/storyboard-kalem.json'), style: CHANNEL_STYLES.gece_mavisi,
});
const inside = (b: [number, number, number, number], r = safeRect(1080, 1920)) => b[0] >= r.left && b[1] >= r.top && b[2] <= r.right && b[3] <= r.bottom;

describe('Final3D props, overlay boxes and layout.json (plan E7, E9)', () => {
  it('is the draft composition at 1080×1920 plus the frame sequence URL', () => {
    const p = props();
    expect(p).toMatchObject({ width: 1080, height: 1920, frames: 1350, framesUrl: 'http://127.0.0.1:1/tok/frames', hook: "0,7 mm'lik bir bilye her şeyi yazıyor" });
    expect(frameUrl(p.framesUrl, 12)).toBe('http://127.0.0.1:1/tok/frames/f00012.png');
  });

  it('places the hook at the top and the beat line at the bottom of the safe area, wrapping long text', () => {
    const p = props();
    const hook = overlayBoxes(p, 0, []);
    expect(hook.map((b) => b.kind)).toEqual(['hook']);
    expect(inside(hook[0]!.box)).toBe(true);
    const beat = overlayBoxes(p, 120, []);
    expect(beat.map((b) => b.kind)).toEqual(['beat']);
    expect(beat[0]!.box[3]).toBeLessThanOrEqual(safeRect(1080, 1920).bottom);
    expect(wrapLines('Bilye dönerken mürekkebi taşır ve kağıda bırakır, her yazışta binlerce kez', 52, 880)).toEqual(['Bilye dönerken mürekkebi', 'taşır ve kağıda bırakır,', 'her yazışta binlerce kez']);
    const long = overlayBoxes({ ...p, hook: 'Ç'.repeat(60) }, 0, []);
    expect(inside(long[0]!.box)).toBe(true);
  });

  it('layout.json of the pen: sampled every 5 frames and at every beat start, labels ≤ 6, every box inside the safe area', async () => {
    const p = props();
    const gltf = await parseGlb(readFileSync(resolve(FX, 'scene/kalem/scene.glb')));
    const frames = layoutFrames(p);
    expect(frames.slice(0, 3)).toEqual([0, 5, 6]);
    for (const b of json<Storyboard>('artifacts/storyboard-kalem.json').beats) expect(frames).toContain(Math.round(b.t_start * 30));
    const m = layoutManifest(p, gltf);
    expect(m.frames.length).toBe(frames.length);
    expect(Math.max(...m.frames.map((f) => f.boxes.filter((b) => b.kind === 'label').length))).toBeLessThanOrEqual(MAX_LABELS);
    expect(m.frames.some((f) => f.boxes.some((b) => b.kind === 'label'))).toBe(true);
    expect(layoutIssues(m)).toEqual([]);
  });

  it('layoutIssues names the frame, kind and box of text outside the safe area', () => {
    const m = { width: 1080, height: 1920, fps: 30, frames: [{ frame: 90, boxes: [{ kind: 'beat' as const, box: [24, 1480, 900, 1560] as [number, number, number, number] }, { kind: 'label' as const, id: 'yay', box: [100, 600, 400, 650] as [number, number, number, number] }] }] };
    expect(layoutIssues(m)).toEqual([{ frame: 90, kind: 'beat', box: [24, 1480, 900, 1560] }]);
  });
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run packages/remotion/test/final.test.ts`
Expected: FAIL — `../src/layout.ts` yok; `finalProps` export'u yok.

- [ ] **Step 3: Uygula**

`packages/remotion/src/props.ts` sonuna:

```ts
/** Remotion composition id of the final layer (spec §7.1 step 8, plan E7). */
export const FINAL_COMPOSITION = 'Final3D';
/** The draft props at 1080×1920 plus the URL base of the Blender PNG frames (served once, like the GLB). */
export type FinalProps = DraftProps & { framesUrl: string };

export function finalProps(o: Omit<Parameters<typeof draftProps>[0], 'width' | 'height'> & { framesUrl: string }): FinalProps {
  return { ...draftProps({ ...o, width: 1080, height: 1920 }), framesUrl: o.framesUrl };
}
export const frameUrl = (base: string, frame: number) => `${base}/f${String(frame).padStart(5, '0')}.png`;

/** A text box on screen (px), as Overlay draws it; layout.json lists them (spec §7.4, plan E9). */
export interface TextBox { kind: 'hook' | 'beat' | 'label'; id?: string; box: [number, number, number, number] }

/** The generous per-character width of placeLabels (M4c ruling: 0.66 em; Inter / DejaVu with Turkish diacritics ≈ 0.6). */
const textWidth = (text: string, font: number) => text.length * font * 0.66;

/** Greedy word wrap with the same width estimate (the browser wraps at least as early as this). */
export function wrapLines(text: string, font: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, font) > maxWidth) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Plan E9: where Overlay draws text at `frame`. Label boxes are exact (Overlay positions them absolutely); the hook and beat boxes
 * are estimates with the same generous width and the line heights Overlay uses, plus the plate padding.
 */
export function overlayBoxes(p: Pick<DraftProps, 'width' | 'height' | 'hook' | 'beats'>, frame: number, labels: LabelBox[]): TextBox[] {
  const L = draftLayout(p.width, p.height);
  const s = p.width / 1080;
  const padX = 14 * s;
  const padY = 6 * s;
  const maxW = L.safe.right - L.safe.left;
  const r = (b: [number, number, number, number]) => b.map((v) => Math.round(v)) as [number, number, number, number];
  const boxes: TextBox[] = labels.map((b) => ({ kind: 'label', id: b.id, box: r([b.x, b.y, b.x + b.w, b.y + b.h]) }));
  const beat = activeBeat(p.beats, frame / DRAFT_FPS);
  const block = (text: string, font: number, lineH: number) => {
    const lines = wrapLines(text, font, maxW - 2 * padX);
    return { w: Math.min(maxW, Math.max(...lines.map((l) => textWidth(l, font))) + 2 * padX), h: lines.length * font * lineH };
  };
  if (beat?.index === 0) {
    const b = block(p.hook, L.hookFont, 1.15);
    boxes.push({ kind: 'hook', box: r([L.safe.left, L.hookTop - padY, L.safe.left + b.w, L.hookTop + b.h + padY]) });
  } else if (beat) {
    const b = block(beat.beat.text, L.lineFont, 1.25);
    const bottom = p.height - L.lineBottom;
    boxes.push({ kind: 'beat', box: r([L.safe.left, bottom - b.h - padY, L.safe.left + b.w, bottom + padY]) });
  }
  return boxes;
}
```

`packages/remotion/src/gltf.ts`:

```ts
import { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender } from 'remotion';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { parseGlb } from '@videogen/scene3d';

/** The GLB once per URL; Remotion waits for it (delayRender) and fails the render loudly if it cannot load. */
export function useGltf(url: string): GLTF | null {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [handle] = useState(() => delayRender('GLB yükleniyor'));
  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`GLB ${r.status}`); return r.arrayBuffer(); })
      .then(parseGlb)
      .then((g) => { if (live) setGltf(g); continueRender(handle); }, (e: unknown) => cancelRender(e));
    return () => { live = false; };
  }, [url, handle]);
  return gltf;
}
```

`packages/remotion/src/layout.ts`:

```ts
import type * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyFrameFov, projectAnchor, sceneCamera, SceneClock } from '@videogen/scene3d';
import type { LayoutIssue } from '@videogen/shared/browser';
import { activeBeat, DRAFT_FPS, draftLayout, overlayBoxes, placeLabels, safeRect, type DraftProps, type LabelBox, type TextBox } from './props.ts';

type LabelProps = Pick<DraftProps, 'width' | 'height' | 'yfov' | 'beats' | 'labels'>;

/** One source for Draft3D, Final3D and layout.json: seek the clips, apply the frame's lens, project and place the beat's labels. */
export function labelsAt(gltf: GLTF, clock: SceneClock, cam: THREE.PerspectiveCamera, p: LabelProps, frame: number): LabelBox[] {
  const t = frame / DRAFT_FPS;
  clock.seek(t);
  applyFrameFov(cam, { fps: DRAFT_FPS, yfov: p.yfov }, frame, p.width, p.height);
  const beat = activeBeat(p.beats, t);
  const anchors = (beat?.beat.parts ?? []).map((id) => ({ id, text: p.labels[id] ?? id, at: projectAnchor(gltf, cam, id, p.width, p.height) }));
  return placeLabels(anchors, p.width, p.height, draftLayout(p.width, p.height).labelArea);
}

export interface LayoutManifest { width: number; height: number; fps: number; frames: { frame: number; boxes: TextBox[] }[] }

/** Every 5th frame plus each beat start and the end of its 6-frame fade (spec §7.4 layout.json). */
export function layoutFrames(p: Pick<DraftProps, 'frames' | 'beats'>): number[] {
  const set = new Set<number>();
  for (let f = 0; f <= p.frames; f += 5) set.add(f);
  for (const b of p.beats) for (const f of [Math.round(b.t_start * DRAFT_FPS), Math.round(b.t_start * DRAFT_FPS) + 6]) if (f <= p.frames) set.add(f);
  return [...set].sort((a, b) => a - b);
}

export function layoutManifest(p: LabelProps & Pick<DraftProps, 'frames' | 'hook'>, gltf: GLTF): LayoutManifest {
  const clock = new SceneClock(gltf);
  const cam = sceneCamera(gltf);
  return { width: p.width, height: p.height, fps: DRAFT_FPS, frames: layoutFrames(p).map((frame) => ({ frame, boxes: overlayBoxes(p, frame, labelsAt(gltf, clock, cam, p, frame)) })) };
}

/** G6 manifest check (plan E9): text boxes outside the safe area, 1 px tolerance for rounding. */
export function layoutIssues(m: LayoutManifest): LayoutIssue[] {
  const r = safeRect(m.width, m.height);
  return m.frames.flatMap((f) => f.boxes
    .filter((b) => b.box[0] < r.left - 1 || b.box[1] < r.top - 1 || b.box[2] > r.right + 1 || b.box[3] > r.bottom + 1)
    .map((b) => ({ frame: f.frame, kind: b.kind, ...(b.id ? { id: b.id } : {}), box: b.box })));
}
```

`packages/remotion/src/Overlay.tsx`:

```tsx
import React from 'react';
import { interpolate } from 'remotion';
import { activeBeat, DRAFT_FPS, draftLayout, type DraftProps, type LabelBox } from './props.ts';

/** The text layer shared by Draft3D and Final3D (plan E7): label lines and plates, the hook on beat 0, then the fading beat line. */
export const Overlay: React.FC<{ p: Pick<DraftProps, 'width' | 'height' | 'hook' | 'beats' | 'text'>; frame: number; labels: LabelBox[] }> = ({ p, frame, labels }) => {
  const s = p.width / 1080;
  const L = draftLayout(p.width, p.height);
  const beat = activeBeat(p.beats, frame / DRAFT_FPS);
  const fade = beat ? interpolate(frame - Math.round(beat.beat.t_start * DRAFT_FPS), [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  const plate = { background: p.text.plate, padding: `${6 * s}px ${14 * s}px`, borderRadius: 10 * s, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' } as const;
  return (
    <>
      <svg width={p.width} height={p.height} style={{ position: 'absolute', inset: 0 }}>
        {labels.map((b) => (
          <g key={b.id}>
            <line x1={b.ax} y1={b.ay} x2={b.x > b.ax ? b.x : b.x + b.w} y2={b.y + b.h / 2} stroke={p.text.line} strokeWidth={2 * s} />
            <circle cx={b.ax} cy={b.ay} r={4 * s} fill={p.text.line} />
          </g>
        ))}
      </svg>
      {labels.map((b) => (
        <div key={b.id} data-label={b.id} style={{
          position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, boxSizing: 'border-box', padding: `0 ${Math.round(12 * s)}px`,
          fontSize: b.font, lineHeight: `${b.h}px`, color: p.text.color, background: p.text.plate, borderRadius: 8 * s,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{b.text}</div>
      ))}
      {beat?.index === 0 ? (
        <div data-text="hook" style={{ position: 'absolute', left: L.safe.left, top: L.hookTop, width: L.safe.right - L.safe.left, fontSize: L.hookFont, fontWeight: 500, lineHeight: 1.15, color: p.text.color }}>
          <span style={plate}>{p.hook}</span>
        </div>
      ) : beat ? (
        <div data-text="beat" style={{ position: 'absolute', left: L.safe.left, bottom: L.lineBottom, width: L.safe.right - L.safe.left, opacity: fade, fontSize: L.lineFont, fontWeight: 500, lineHeight: 1.25, color: p.text.color }}>
          <span style={plate}>{beat.beat.text}</span>
        </div>
      ) : null}
    </>
  );
};
```

`packages/remotion/src/Final3D.tsx`:

```tsx
import React, { useMemo } from 'react';
import { AbsoluteFill, Img, useCurrentFrame } from 'remotion';
import { sceneCamera, SceneClock } from '@videogen/scene3d';
import { useGltf } from './gltf.ts';
import { labelsAt } from './layout.ts';
import { Overlay } from './Overlay.tsx';
import { frameUrl, type FinalProps, type LabelBox } from './props.ts';

/**
 * Spec §7.1 step 8 / plan E7: the Blender frame (transparent RGBA) on the channel style's backdrop, under the same text layer as
 * the draft. The GLB is only used for the label anchors (no WebGL here).
 */
export const Final3D: React.FC<FinalProps> = (p) => {
  const frame = useCurrentFrame();
  const gltf = useGltf(p.glbUrl);
  const rig = useMemo(() => (gltf ? { clock: new SceneClock(gltf), cam: sceneCamera(gltf) } : null), [gltf]);
  const labels: LabelBox[] = gltf && rig ? labelsAt(gltf, rig.clock, rig.cam, p, frame) : [];
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${p.background.top}, ${p.background.bottom})`, fontFamily: 'Inter, "DejaVu Sans", sans-serif' }}>
      <Img src={frameUrl(p.framesUrl, frame)} style={{ position: 'absolute', left: 0, top: 0, width: p.width, height: p.height }} />
      <Overlay p={p} frame={frame} labels={labels} />
    </AbsoluteFill>
  );
};
```

`packages/remotion/src/Draft3D.tsx` (tam dosya; davranış aynı, metin katmanı `Overlay`'e, çapa hesabı `labelsAt`'a, GLB yüklemesi `useGltf`'e taşındı):

```tsx
import React, { useLayoutEffect, useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sceneCamera, SceneClock } from '@videogen/scene3d';
import { useGltf } from './gltf.ts';
import { labelsAt } from './layout.ts';
import { Overlay } from './Overlay.tsx';
import type { DraftProps, LabelBox } from './props.ts';

type Vec = [number, number, number];
/** Draft approximations of the vg_blender studio presets (y-up glTF space). The environment map gives metals something to reflect (M4b §8). */
const LIGHTS: Record<DraftProps['lighting'], { ambient: number; key: { pos: Vec; color: string; i: number }; rim: { pos: Vec; color: string; i: number } }> = {
  key_rim_warm: { ambient: 0.35, key: { pos: [60, 90, 80], color: '#ffe2bf', i: 2.4 }, rim: { pos: [-80, 60, -60], color: '#ffd28a', i: 1.6 } },
  key_rim_cool: { ambient: 0.35, key: { pos: [60, 90, 80], color: '#eaf2ff', i: 2.4 }, rim: { pos: [-80, 60, -60], color: '#5cc8ff', i: 1.8 } },
  soft_box: { ambient: 0.8, key: { pos: [0, 120, 100], color: '#ffffff', i: 1.8 }, rim: { pos: [0, 80, -100], color: '#ffffff', i: 0.8 } },
};

function Stage({ gltf, cam, lighting }: { gltf: GLTF; cam: THREE.PerspectiveCamera; lighting: DraftProps['lighting'] }) {
  const set = useThree((s) => s.set);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // The GLB camera drives the view; its fov/aspect come from camera_track (applyFrameFov), so r3f must not resize it.
  useLayoutEffect(() => { Object.assign(cam, { manual: true }); set({ camera: cam }); }, [cam, set]);
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  const L = LIGHTS[lighting];
  return (
    <>
      <ambientLight intensity={L.ambient} />
      <directionalLight position={L.key.pos} color={L.key.color} intensity={L.key.i} />
      <directionalLight position={L.rim.pos} color={L.rim.color} intensity={L.rim.i} />
      <primitive object={gltf.scene} />
    </>
  );
}

/**
 * Spec §7.1 step 5 / K7: the Three.js draft of the scene Blender built (K23: the GLB is the only geometry and motion source).
 * Transparent canvas (r3f default sRGB output, not `linear`: grilling C29) over the channel style's backdrop, and the shared text
 * layer (Overlay) with labels anchored by the same math as the equivalence check (labelsAt).
 */
export const Draft3D: React.FC<DraftProps> = (p) => {
  const frame = useCurrentFrame();
  const gltf = useGltf(p.glbUrl);
  const rig = useMemo(() => (gltf ? { clock: new SceneClock(gltf), cam: sceneCamera(gltf) } : null), [gltf]);
  // labelsAt seeks the clips and applies this frame's lens before the canvas renders the frame (probe P6).
  const labels: LabelBox[] = gltf && rig ? labelsAt(gltf, rig.clock, rig.cam, p, frame) : [];
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${p.background.top}, ${p.background.bottom})`, fontFamily: 'Inter, "DejaVu Sans", sans-serif' }}>
      {gltf && rig ? (
        <ThreeCanvas width={p.width} height={p.height}>
          <Stage gltf={gltf} cam={rig.cam} lighting={p.lighting} />
        </ThreeCanvas>
      ) : null}
      <Overlay p={p} frame={frame} labels={labels} />
    </AbsoluteFill>
  );
};
```

`packages/remotion/src/Root.tsx` (tam dosya):

```tsx
import React from 'react';
import { Composition } from 'remotion';
import { Draft3D } from './Draft3D.tsx';
import { Final3D } from './Final3D.tsx';
import { DRAFT_COMPOSITION, DRAFT_FPS, FINAL_COMPOSITION, type DraftProps, type FinalProps } from './props.ts';

/** Placeholder props; the renderer and the Player always pass real ones (calculateMetadata sizes the composition from them). */
export const EMPTY_DRAFT: DraftProps = {
  glbUrl: '', yfov: [0.5, 0.5], frames: 1, width: 540, height: 960,
  background: { top: '#16203a', bottom: '#070a14' }, text: { color: '#eef3ff', plate: 'rgba(8,12,24,0.72)', line: '#5cc8ff', accent: '#5cc8ff' },
  lighting: 'key_rim_cool', hook: '', beats: [], labels: {},
};
const EMPTY_FINAL: FinalProps = { ...EMPTY_DRAFT, width: 1080, height: 1920, framesUrl: '' };

export const Root: React.FC = () => (
  <>
    <Composition id={DRAFT_COMPOSITION} component={Draft3D} fps={DRAFT_FPS} width={540} height={960} durationInFrames={2} defaultProps={EMPTY_DRAFT}
      calculateMetadata={({ props }) => ({ durationInFrames: props.frames + 1, width: props.width, height: props.height })} />
    <Composition id={FINAL_COMPOSITION} component={Final3D} fps={DRAFT_FPS} width={1080} height={1920} durationInFrames={2} defaultProps={EMPTY_FINAL}
      calculateMetadata={({ props }) => ({ durationInFrames: props.frames + 1, width: props.width, height: props.height })} />
  </>
);
```

`packages/remotion/src/index.ts` sonuna: `export { Final3D } from './Final3D.tsx';` ve `export { Overlay } from './Overlay.tsx';`. `packages/remotion/package.json` `exports`'a `"./layout": "./src/layout.ts"`.

Not: `bundleHash()` yeni dosyaları kendiliğinden kapsar (M4c `NODE_ONLY` dışındaki tüm `.ts/.tsx`); taslakların hash'i değişir. Çalışan bir run varsa bayat taslak kuralı devreye girer (runbook §7).

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run packages/remotion && npm run typecheck && npm test`
Expected: yeni `4 passed`; M4c props testleri değişmeden geçer; tam paket `Tests  331 passed (331)`.

Run (taslak değişmedi mi?): `VG_REMOTION_GL=swangle npx vitest run -c vitest.render.config.ts apps/worker/test-render/draft.int.test.ts` → `2 passed`.

- [ ] **Step 5: Commit** — `feat(remotion): shared Overlay, Final3D over Blender frames, labelsAt and the layout.json manifest`

---
### Task 6: Final Remotion render — jetonlu kare sunucusu, `renderFinalVideo`, `render-cli --composition final`, `RenderDriver.compose` (gerçek + Fake)

**Files:**
- Modify: `apps/worker/test/fixtures/fake-remotion-cli.mjs` (`--composition` ve `--frames-dir` seçeneklerini kabul eder; davranışı değişmez), `packages/remotion/src/render.ts` (`serveOnce`, `renderDraftVideo` onu kullanır, `renderFinalVideo`), `packages/remotion/src/render-cli.ts` (`--composition`, `--frames-dir`), `packages/remotion/src/hash.ts` (`FINAL_MASTER`), `apps/worker/src/render/driver.ts` (`ComposeInput/Output`, `RenderDriver.compose`, ortak `remotion()` çocuğu, Fake), `apps/worker/src/render/ffmpeg.ts` (`fakeFinal`), `packages/shared/src/config.ts` (`render.encodePreset`, `VG_ENCODE_PRESET`)
- Test: `apps/worker/test/final-compose.test.ts`, `apps/worker/test-render/final-compose.int.test.ts`

**Interfaces:**
- Produces:
  - `serveOnce({glbPath, framesDir?}) → Promise<{ base: string; close(): void }>`: `GET <base>/scene.glb`, `GET <base>/frames/fNNNNN.png` (tam eşleşme `^f\d{5}\.png$`); gerisi 404 (`@videogen/remotion/render`).
  - `FINAL_MASTER = { width: 1080, height: 1920, fps: 30, codec: 'h264', crf: 14, x264Preset: 'fast', pixelFormat: 'yuv420p', colorSpace: 'bt709' }` (`@videogen/remotion/hash`).
  - `renderFinalVideo({props, glbPath, framesDir, out, cacheRoot, concurrency?, frameRange?, signal?, onProgress?, onStage?}) → {frames, ms}`.
  - `render-cli`: `--composition draft|final` (varsayılan `draft`), `--frames-dir` (final için zorunlu); protokol aynı.
  - `ComposeInput { runDir; props: Omit<FinalProps,'glbUrl'|'framesUrl'>; glbPath; framesDir; outPath; owner; signal?; onProgress?; onStage?; frameRange? }`, `ComposeOutput { file; frames; ms; concurrency }`, `RenderDriver.compose(i)`; `BlenderDriverOptions.composeTimeoutMs?` (1 800 000).
  - `fakeFinal(ffmpeg, out, {frames, signal?})`; `config.render.encodePreset` (`VG_ENCODE_PRESET`, varsayılan `slow`; smoke `ultrafast`).

- [ ] **Step 1: Başarısız testleri yaz**

`apps/worker/test/final-compose.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { serveOnce } from '@videogen/remotion/render';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const tmp = () => mkdtempSync(join(tmpdir(), 'vg-compose-'));

describe('final compose: frame server and the fake compose', () => {
  it('serves the GLB and exact frame names under one random token; everything else is 404', async () => {
    const d = tmp();
    mkdirSync(join(d, 'frames'));
    writeFileSync(join(d, 'scene.glb'), 'glb');
    writeFileSync(join(d, 'frames', 'f00003.png'), 'png');
    writeFileSync(join(d, 'secret.txt'), 'no');
    const s = await serveOnce({ glbPath: join(d, 'scene.glb'), framesDir: join(d, 'frames') });
    try {
      expect(s.base).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/);
      const get = async (path: string, method = 'GET') => { const r = await fetch(`${s.base}${path}`, { method }); return [r.status, r.status === 200 ? await r.text() : ''] as const; };
      expect(await get('/scene.glb')).toEqual([200, 'glb']);
      expect(await get('/frames/f00003.png')).toEqual([200, 'png']);
      expect((await fetch(`${s.base}/frames/f00003.png`)).headers.get('content-type')).toBe('image/png');
      for (const bad of ['/frames/f3.png', '/frames/f00004.png', '/frames/..%2Fsecret.txt', '/frames/../secret.txt', '/secret.txt']) expect((await get(bad))[0]).toBe(404);
      expect((await get('/scene.glb', 'POST'))[0]).toBe(404);
      expect((await fetch(s.base.replace(/[0-9a-f]{32}$/, '0'.repeat(32)) + '/scene.glb')).status).toBe(404);
    } finally {
      s.close();
    }
  });

  it('the fake compose writes a 1080×1920 30 fps master with frames + 1 frames', async () => {
    const out = join(tmp(), 'master.mp4');
    const seen: number[] = [];
    const r = await new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }).compose({
      runDir: tmp(), props: { frames: 89 } as never, glbPath: '/x.glb', framesDir: '/x', outPath: out, owner: 'o', onProgress: (n) => seen.push(n),
    });
    expect(r).toMatchObject({ file: out, frames: 90 });
    const p = await probeVideo(FFMPEG, out);
    expect([p.width, p.height, p.fps, p.frames, p.codec, p.pixFmt]).toEqual([1080, 1920, '30/1', 90, 'h264', 'yuv420p']);
    expect(seen.at(-1)).toBe(90);
  });
});
```

`apps/worker/test-render/final-compose.int.test.ts` (gerçek Chrome; GPU gerekmez — Final3D WebGL kullanmaz):

```ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { finalProps, overlayBoxes } from '@videogen/remotion/props';
import { BlenderRenderDriver } from '../src/render/driver.ts';
import { probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const DATA = mkdtempSync(join(tmpdir(), 'vg-final-compose-int-'));
afterAll(() => rmSync(DATA, { recursive: true, force: true }));
const json = <T>(p: string) => JSON.parse(readFileSync(join(FX, p), 'utf8')) as T;
const style = CHANNEL_STYLES.gece_mavisi;
const { glbUrl: _g, framesUrl: _f, ...props } = finalProps({
  glbUrl: '', framesUrl: '', yfov: json<{ yfov: number[] }>('scene/kalem/camera_track.json').yfov,
  scene: json<SceneSpec>('artifacts/scene-kalem.json'), storyboard: json<Storyboard>('artifacts/storyboard-kalem.json'), style,
});
/** Mean RGB of a w×h region of frame n. */
const region = (file: string, n: number, x: number, y: number, w: number, h: number) =>
  [...execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n}),crop=${w}:${h}:${x}:${y},scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

describe('Final3D (real system Chrome)', () => {
  const frames = join(DATA, 'frames');
  const out = join(DATA, 'master.mp4');
  it('draws each Blender frame over the style backdrop: 1080×1920, the frame\'s pixels, the backdrop where the frame is transparent', async () => {
    mkdirSync(frames, { recursive: true });
    // 30 transparent RGBA frames with an opaque red square in the middle (a stand-in for Blender's output).
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920:r=30,format=rgba,drawbox=x=440:y=860:w=200:h=200:color=red@1:t=fill', '-frames:v', '30', '-start_number', '0', join(frames, 'f%05d.png')]);
    const d = new BlenderRenderDriver({ blender: '/nonexistent', bwrap: '/nonexistent', dataDir: DATA, home: DATA });
    const r = await d.compose({ runDir: DATA, props, glbPath: join(FX, 'scene/kalem/scene.glb'), framesDir: frames, outPath: out, owner: 'int', frameRange: [0, 29] });
    expect(r.frames).toBe(30);
    const p = await probeVideo(FFMPEG, out);
    expect([p.width, p.height, p.frames, p.pixFmt, p.colorSpace]).toEqual([1080, 1920, 30, 'yuv420p', 'bt709']);
    const red = region(out, 10, 500, 920, 80, 80);
    expect(red[0]!).toBeGreaterThan(200);
    expect(red[1]! + red[2]!).toBeLessThan(80);
    region(out, 10, 2, 2, 4, 4).forEach((c, i) => expect(Math.abs(c - hex(style.background.top)[i]!)).toBeLessThanOrEqual(8));
    console.log(`final compose: 30 kare ${r.ms} ms`);
  }, 300_000);

  it('draws the hook plate where layout.json says it is (frame 0)', () => {
    const hook = overlayBoxes(props, 0, []).find((b) => b.kind === 'hook')!.box;
    const [x0, y0, x1, y1] = hook;
    const inside = region(out, 0, x0 + 8, y0 + 8, Math.min(200, x1 - x0 - 16), Math.max(8, y1 - y0 - 16));
    const back = hex(style.background.top);
    expect(inside.reduce((a, c, i) => a + Math.abs(c - back[i]!), 0)).toBeGreaterThan(24);
  });
});
```

- [ ] **Step 2: Testlerin düştüğünü gör**

Run: `npx vitest run apps/worker/test/final-compose.test.ts`
Expected: FAIL — `serveOnce` export'u yok; `compose is not a function`.

- [ ] **Step 3: Uygula**

`packages/remotion/src/hash.ts` sonuna:

```ts
/** Fixed parameters of the Remotion master of the final (plan E8): a near-lossless intermediate; the delivery encode is ffmpeg's. */
export const FINAL_MASTER = { width: 1080, height: 1920, fps: 30, codec: 'h264', crf: 14, x264Preset: 'fast', pixelFormat: 'yuv420p', colorSpace: 'bt709' } as const;
```

`packages/remotion/src/render.ts`: GLB sunucusunu `serveOnce`'a çıkar, `renderDraftVideo`'yu ona bağla, `renderFinalVideo` ekle. Dosyanın `export interface DraftRenderOptions` satırından sonuna kadarki kısmı şununla değiştir:

```ts
/**
 * Plan C14 / E7: one random 32-hex token path on 127.0.0.1 serving the GLB and (final) the frame PNGs by exact name; GET only,
 * everything else 404, CORS open for the bundle's own origin. Closed by the caller when the render ends.
 */
export async function serveOnce(o: { glbPath: string; framesDir?: string }): Promise<{ base: string; close: () => void }> {
  const glb = await readFile(o.glbPath);
  const token = randomBytes(16).toString('hex');
  const frame = new RegExp(`^/${token}/frames/(f\\d{5}\\.png)$`);
  const server = createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*' };
    if (req.method === 'GET' && req.url === `/${token}/scene.glb`) {
      res.writeHead(200, { ...cors, 'content-type': 'model/gltf-binary', 'content-length': glb.length });
      res.end(glb);
      return;
    }
    const m = req.method === 'GET' && o.framesDir ? frame.exec(req.url ?? '') : null;
    if (m) {
      readFile(join(o.framesDir!, m[1]!)).then(
        (png) => { res.writeHead(200, { ...cors, 'content-type': 'image/png', 'content-length': png.length }); res.end(png); },
        () => res.writeHead(404).end(),
      );
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${token}`, close: () => server.close() };
}

interface RenderRun { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; onStage?: (stage: 'bundle' | 'browser' | 'frames') => void; frameRange?: [number, number]; concurrency?: number }
type Params = { codec: 'h264'; crf: number; x264Preset: string; pixelFormat: string; colorSpace: string };

/** One Remotion render: the cached bundle, system Chrome, the composition sized by its props, silent, cancellable. */
async function renderComposition(id: string, inputProps: Record<string, unknown>, params: Params, cacheRoot: string, out: string, o: RenderRun): Promise<{ frames: number; ms: number }> {
  o.onStage?.('bundle');
  const serveUrl = await ensureBundle(cacheRoot);
  const { cancelSignal, cancel } = makeCancelSignal();
  const onAbort = () => cancel();
  o.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const common = { serveUrl, inputProps, browserExecutable: CHROME.browserExecutable, chromeMode: CHROME.chromeMode, chromiumOptions: { gl: CHROME.gl } };
    o.onStage?.('browser');
    const composition = await selectComposition({ ...common, id });
    const total = o.frameRange ? o.frameRange[1] - o.frameRange[0] + 1 : composition.durationInFrames;
    o.onStage?.('frames');
    const t0 = Date.now();
    await renderMedia({
      ...common, composition, codec: params.codec, crf: params.crf, x264Preset: params.x264Preset as 'fast', pixelFormat: params.pixelFormat as 'yuv420p',
      colorSpace: params.colorSpace as 'bt709', muted: true, outputLocation: out, concurrency: o.concurrency ?? 2, frameRange: o.frameRange ?? null, cancelSignal,
      onProgress: ({ renderedFrames }) => o.onProgress?.(renderedFrames, total),
    });
    return { frames: total, ms: Date.now() - t0 };
  } finally {
    o.signal?.removeEventListener('abort', onAbort);
  }
}

export interface DraftRenderOptions extends RenderRun { props: Omit<DraftProps, 'glbUrl'>; glbPath: string; out: string; cacheRoot: string }

/** Spec §7.5 / plan C12–C14: the draft MP4 (h264, yuv420p, bt709, silent). */
export async function renderDraftVideo(o: DraftRenderOptions): Promise<{ frames: number; ms: number }> {
  const s = await serveOnce({ glbPath: o.glbPath });
  try {
    return await renderComposition(DRAFT_COMPOSITION, { ...o.props, glbUrl: `${s.base}/scene.glb` }, DRAFT_RENDER, o.cacheRoot, o.out, o);
  } finally {
    s.close();
  }
}

export interface FinalRenderOptions extends RenderRun { props: Omit<FinalProps, 'glbUrl' | 'framesUrl'>; glbPath: string; framesDir: string; out: string; cacheRoot: string }

/** Spec §7.1 step 8 / plan E7–E8: Final3D over the Blender frames → the silent master (CRF 14); the delivery encode follows in ffmpeg. */
export async function renderFinalVideo(o: FinalRenderOptions): Promise<{ frames: number; ms: number }> {
  const s = await serveOnce({ glbPath: o.glbPath, framesDir: o.framesDir });
  try {
    return await renderComposition(FINAL_COMPOSITION, { ...o.props, glbUrl: `${s.base}/scene.glb`, framesUrl: `${s.base}/frames` }, FINAL_MASTER, o.cacheRoot, o.out, o);
  } finally {
    s.close();
  }
}
```

ve import'ları güncelle: `import { bundleHash, DRAFT_RENDER, FINAL_MASTER } from './hash.ts';`, `import { DRAFT_COMPOSITION, FINAL_COMPOSITION, type DraftProps, type FinalProps } from './props.ts';`.

`packages/remotion/src/render-cli.ts`: `parseArgs` seçeneklerine `composition: { type: 'string' }`, `'frames-dir': { type: 'string' }`; çağrıyı şöyle seç:

```ts
const final = a.composition === 'final';
if (final && !a['frames-dir']) {
  process.stdout.write('VG_ERROR eksik argüman: --frames-dir\n');
  process.exit(2);
}
const common = {
  glbPath: a.glb, out: a.out, cacheRoot: a.cache, concurrency: Number(a.concurrency ?? 2), frameRange: range, signal: ac.signal,
  onStage: (s: string) => process.stdout.write(`VG_STAGE ${s}\n`),
  onProgress: (done: number, total: number) => { if (done !== last) { last = done; process.stdout.write(`VG_PROGRESS ${done} ${total}\n`); } },
};
const props = JSON.parse(readFileSync(a.props, 'utf8'));
const r = final ? await renderFinalVideo({ ...common, props, framesDir: a['frames-dir']! }) : await renderDraftVideo({ ...common, props });
```

(`try` bloğunun içinde; `VG_DONE`/`VG_ERROR`/çıkış kodları aynı.)

`apps/worker/src/render/driver.ts`:

```ts
export interface ComposeInput {
  runDir: string;
  props: Omit<FinalProps, 'glbUrl' | 'framesUrl'>;
  glbPath: string;
  framesDir: string;
  outPath: string;
  owner: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  onStage?: (stage: string) => void;
  frameRange?: [number, number];
}
export interface ComposeOutput { file: string; frames: number; ms: number; concurrency: number }
```

`RenderDriver`'a `compose(i: ComposeInput): Promise<ComposeOutput>;` (yorum: "Spec §7.1 step 8: Final3D over the frames → the silent master. heavy_cpu (the caller holds the lock)"). `BlenderDriverOptions`'a `composeTimeoutMs?: number`.

`BlenderRenderDriver.draft`'ın gövdesindeki çocuk süreç kısmını ortak bir özel yönteme çıkar ve `compose`'u ekle:

```ts
  /** Plan C13/C17: the Remotion child under the process-group guard; a Chrome/WebGL failure (exit 3) is retried once with concurrency 1. */
  private async remotion(kind: 'draft' | 'final', extra: string[], i: { outPath: string; owner: string; signal?: AbortSignal; onProgress?: (d: number, t: number) => void; onStage?: (s: string) => void; frameRange?: [number, number]; props: unknown }, timeoutMs: number): Promise<{ file: string; frames: number; ms: number; concurrency: number }> {
    await mkdir(resolve(i.outPath, '..'), { recursive: true });
    const propsPath = `${i.outPath}.props.json`;
    await writeFile(propsPath, JSON.stringify(i.props));
    const once = async (concurrency: number) => {
      let done: { frames: number; ms: number } | null = null;
      let error = '';
      const r = await runProcess(process.execPath, [
        '--import', 'tsx', this.o.remotionCli ?? REMOTION_CLI, '--composition', kind, '--props', propsPath, ...extra, '--out', i.outPath,
        '--cache', join(this.o.dataDir, 'cache', 'remotion'), '--concurrency', String(concurrency), ...(i.frameRange ? ['--frames', i.frameRange.join('-')] : []),
      ], {
        cwd: REPO_ROOT, dataDir: this.o.dataDir, owner: i.owner, signal: i.signal, env: draftEnv(), timeoutMs, maxRssMb: this.o.draftMaxRssMb ?? 6144,
        onLine: (l) => {
          const p = /^VG_PROGRESS (\d+) (\d+)$/.exec(l);
          if (p) i.onProgress?.(Number(p[1]), Number(p[2]));
          if (l.startsWith('VG_STAGE ')) i.onStage?.(l.slice(9).trim());
          if (l.startsWith('VG_DONE ')) done = JSON.parse(l.slice(8)) as { frames: number; ms: number };
          if (l.startsWith('VG_ERROR ')) error = l.slice(9).trim();
        },
      });
      await this.o.audit?.(`render.${kind === 'draft' ? 'draft' : 'compose'}`, { ms: r.ms, code: r.code, stopped: r.stopped, concurrency, frames: (done as { frames: number } | null)?.frames ?? null });
      const what = kind === 'draft' ? 'taslak render' : 'final birleştirme';
      const stop = stoppedError(r, what);
      if (stop) throw stop;
      if (r.code === 3) return null;
      if (r.code !== 0 || !done) throw new RenderError('crash', `${what} başarısız (kod ${r.code ?? r.signal})${error ? `: ${error}` : ''}`);
      return { file: i.outPath, ...(done as { frames: number; ms: number }), concurrency };
    };
    const out = (await once(2)) ?? (await once(1));
    if (!out) throw new RenderError('gpu', `${kind === 'draft' ? 'taslak render' : 'final birleştirme'} Chrome hatasıyla iki kez düştü`);
    return out;
  }

  draft(i: DraftInput): Promise<DraftOutput> {
    return this.remotion('draft', ['--glb', i.glbPath], i, this.o.draftTimeoutMs ?? 600_000);
  }

  compose(i: ComposeInput): Promise<ComposeOutput> {
    return this.remotion('final', ['--glb', i.glbPath, '--frames-dir', i.framesDir], i, this.o.composeTimeoutMs ?? 1_800_000);
  }
```

(Not: M4c taslak hata metni "taslak render GPU/WebGL hatasıyla iki kez düştü" → "taslak render Chrome hatasıyla iki kez düştü" olur; M4c `draft-render.test.ts`'teki beklenen metni güncelle ve runbook §7 satırını T12'de düzelt. `render-cli` taslakta `--composition draft` alır; eski çağrı biçimi (seçeneksiz) de taslaktır.)

`FakeRenderDriver`'a:

```ts
  /** Spec §16.1: the calm stand-in at the real size (1080×1920, 30 fps, frames + 1), for the real delivery encode, sound and qc. */
  async compose(i: ComposeInput): Promise<ComposeOutput> {
    const t0 = Date.now();
    await mkdir(resolve(i.outPath, '..'), { recursive: true });
    await this.wait(i.signal);
    const frames = i.frameRange ? i.frameRange[1] - i.frameRange[0] + 1 : i.props.frames + 1;
    i.onStage?.('frames');
    await fakeFinal(this.o.ffmpeg, i.outPath, { frames, signal: i.signal });
    if (i.signal?.aborted) throw new RenderError('aborted', 'durduruldu');
    i.onProgress?.(frames, frames);
    return { file: i.outPath, frames, ms: Date.now() - t0, concurrency: 1 };
  }
```

`apps/worker/src/render/ffmpeg.ts` sonuna:

```ts
/** Fake final master (plan E17): a calm stand-in at 1080×1920 (night blue, a wide bar sliding at a constant 8 px/frame: no freeze), ultrafast. */
export function fakeFinal(ffmpeg: string, out: string, o: { frames: number; signal?: AbortSignal }): Promise<void> {
  return run(ffmpeg, [
    '-f', 'lavfi', '-i', 'color=c=0x16203a:s=1080x1920:r=30',
    '-vf', "drawbox=x='216+mod(t*240,648)':y=346:w=216:h=1100:color=0x2f6bd8:t=fill",
    '-frames:v', String(o.frames), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14',
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', out,
  ], o.signal);
}
```

`packages/shared/src/config.ts`: `render` tipine `encodePreset: string` ve değerine `encodePreset: env.VG_ENCODE_PRESET ?? 'slow'`.

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/final-compose.test.ts apps/worker/test/draft-render.test.ts && npm run typecheck && npm test`
Expected: yeni `2 passed`; tam paket `Tests  333 passed (333)`.

Run: `npm run test:render` (GPU'suz makinede `VG_REMOTION_GL=swangle` ve yalnızca taslak/final-compose dosyaları)
Expected: `Tests  10 passed (10)`; konsolda `final compose: 30 kare … ms`. 1351 kare için süre tahmini bu ölçümden ×45 (rapor).

- [ ] **Step 5: Commit** — `feat(render): Final3D render over Blender frames with a token frame server, shared Remotion child for draft and final`

---
### Task 7: Ses ve teslim — `planSfx`, `pickMusic`, `soundPlan` (lisans kapısı), `mixTrack`, iki geçişli `masterAudio`, `encodeDelivery`, `muxVariant`

**Files:**
- Create: `apps/worker/src/pipeline/sound.ts` (saf), `apps/worker/src/render/audio.ts` (ffmpeg)
- Modify: `apps/worker/src/render/ffmpeg.ts` (`run`'a `timeoutMs`; `capture`; `FINAL_ENCODE`, `encodeDelivery`, `muxVariant`)
- Test: `apps/worker/test/sound.test.ts`

**Interfaces:**
- Consumes: `SFX_NAMES`, `type SfxName` (T2), `AssetRecord` (T2), `fakeFinal` (T6).
- Produces:
  - `sound.ts`: `SFX_FOR_EVENT`, `SFX_GAIN_DB`, `matchSfx(word) → SfxName | null`, `interface SfxCue { atMs; name; source }`, `planSfx({events, beats, fps, durationS}) → SfxCue[]`, `pickMusic(assets, seed) → asset | null`, `class LicenseError`, `interface SoundPlan { cues: {atMs, name, source, assetId, gainDb}[]; music: {assetId, title, license, attribution, gainDb} | null }`, `soundPlan(cues, library, music) → SoundPlan` (izinsiz varlıkta `LicenseError`).
  - `audio.ts`: `mixTrack(ffmpeg, {cues: {atMs, file, gainDb}[], music?, durationS, out, signal?})`, `interface Loudnorm { i; tp; lra; thresh; offset }`, `parseLoudnormJson(stderr) → Loudnorm | null`, `measureLoudnorm(ffmpeg, file) → Loudnorm | null`, `masterAudio(ffmpeg, input, out, signal?) → { before: Loudnorm | null }`.
  - `ffmpeg.ts`: `FINAL_ENCODE`, `encodeDelivery(ffmpeg, master, out, {preset, signal?})`, `muxVariant(ffmpeg, video, audio, out, signal?)`, `capture(ffmpeg, args, signal?) → stderr`.

- [ ] **Step 1: Başarısız testi yaz**

`apps/worker/test/sound.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AssetRecord } from '@videogen/db';
import { LicenseError, matchSfx, pickMusic, planSfx, soundPlan, type SfxCue } from '../src/pipeline/sound.ts';
import { masterAudio, measureLoudnorm, mixTrack, parseLoudnormJson } from '../src/render/audio.ts';
import { encodeDelivery, fakeFinal, muxVariant } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const FFPROBE = FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const tmp = () => mkdtempSync(join(tmpdir(), 'vg-sound-'));
const asset = (o: Partial<AssetRecord>): AssetRecord => ({
  id: 'a', kind: 'sfx', title: 't', blobSha: 'x', licenseSpdx: 'CC0-1.0', sourceUrl: null, author: 'a', attribution: null, licenseSnapshotSha: null, allowed: true, tags: [], durationMs: 100, createdAt: '', ...o,
});
const lib = Object.fromEntries(['whoosh', 'swoosh', 'click', 'snap', 'tick', 'thud'].map((n) => [n, asset({ id: `sfx-${n}`, title: n })])) as Record<SfxCue['name'], AssetRecord>;

describe('sound plan, mix, mastering and the two variants', () => {
  it('plans SFX from scene events and storyboard cues: the hook whoosh at 0 ms, one cue per 2 frames, ≤ 3 of one sound per 10 s', () => {
    const events = (JSON.parse(readFileSync(join(FX, 'scene/kalem/events.json'), 'utf8')) as { events: { id: string; type: 'explode_start' | 'part_lock' | 'label_in' | 'zoom'; frame: number }[] }).events;
    const beats = (JSON.parse(readFileSync(join(FX, 'artifacts/storyboard-kalem.json'), 'utf8')) as { beats: { id: string; t_start: number; sfx_cues: string[] }[] }).beats;
    const cues = planSfx({ events, beats, fps: 30, durationS: 45 });
    expect(cues[0]).toEqual({ atMs: 0, name: 'whoosh', source: 'hook' });
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.atMs - cues[i - 1]!.atMs).toBeGreaterThanOrEqual(66);
    for (const c of cues) expect(cues.filter((k) => k.name === c.name && k.atMs <= c.atMs && c.atMs - k.atMs < 10_000).length).toBeLessThanOrEqual(3);
    expect(cues.some((c) => c.source.startsWith('event:explode_start') && c.name === 'whoosh')).toBe(true);
    const locks = planSfx({ events: [1, 2, 3, 4, 5].map((s) => ({ id: `l${s}`, type: 'part_lock' as const, frame: s * 30 })), beats: [], fps: 30, durationS: 40 });
    expect(locks.filter((c) => c.name === 'click').map((c) => c.atMs)).toEqual([1000, 2000, 3000]);
    expect([matchSfx('Whoosh'), matchSfx('kapak çıt sesi'), matchSfx('tık'), matchSfx('müzik')]).toEqual(['whoosh', 'snap', 'click', null]);
  });

  it('picks music deterministically among allowed tracks only, and refuses any disallowed asset in the plan (spec §9 license gate)', () => {
    const tracks = [asset({ id: 'm1', kind: 'music', title: 'A' }), asset({ id: 'm2', kind: 'music', title: 'B' }), asset({ id: 'm3', kind: 'music', allowed: false, licenseSpdx: 'CC-BY-NC-4.0' }), asset({ id: 's', kind: 'sfx' })];
    const a = pickMusic(tracks, 'video-1');
    expect(['m1', 'm2']).toContain(a!.id);
    expect(pickMusic(tracks, 'video-1')!.id).toBe(a!.id);
    expect(pickMusic([tracks[2]!, tracks[3]!], 'video-1')).toBeNull();
    const cues: SfxCue[] = [{ atMs: 0, name: 'whoosh', source: 'hook' }];
    expect(soundPlan(cues, lib, tracks[0]!)).toEqual({ cues: [{ atMs: 0, name: 'whoosh', source: 'hook', assetId: 'sfx-whoosh', gainDb: -6 }], music: { assetId: 'm1', title: 'A', license: 'CC0-1.0', attribution: null, gainDb: -18 } });
    expect(() => soundPlan(cues, lib, tracks[2]!)).toThrow(LicenseError);
    expect(() => soundPlan(cues, { ...lib, whoosh: asset({ allowed: false }) }, null)).toThrow('izinsiz ses: whoosh');
  });

  it('parses loudnorm measurements, including a silent input', () => {
    const out = 'x\n[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-23.41",\n\t"input_tp" : "-3.10",\n\t"input_lra" : "20.60",\n\t"input_thresh" : "-33.80",\n\t"output_i" : "-14.0",\n\t"target_offset" : "0.05"\n}\n';
    expect(parseLoudnormJson(out)).toEqual({ i: -23.41, tp: -3.1, lra: 20.6, thresh: -33.8, offset: 0.05 });
    expect(parseLoudnormJson('{\n "input_i" : "-inf",\n "input_tp" : "-inf",\n "input_lra" : "0.00",\n "input_thresh" : "-70.00",\n "target_offset" : "inf"\n}')!.i).toBeNaN();
    expect(parseLoudnormJson('no json here')).toBeNull();
  });

  it('masters a quiet mix to −14 LUFS ±1 with a true peak ≤ −1 dBTP', async () => {
    const d = tmp();
    const quiet = join(d, 'quiet.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=12:c=pink:r=48000:a=0.05:seed=3', '-f', 'lavfi', '-i', 'sine=f=330:d=12:sample_rate=48000', '-filter_complex', '[0][1]amix=inputs=2,volume=-12dB', '-ac', '2', quiet]);
    const out = join(d, 'master.wav');
    const r = await masterAudio(FFMPEG, quiet, out);
    expect(r.before!.i).toBeLessThan(-20);
    const after = (await measureLoudnorm(FFMPEG, out))!;
    expect(Math.abs(after.i + 14)).toBeLessThanOrEqual(1);
    expect(after.tp).toBeLessThanOrEqual(-1);
  });

  it('mixes cues into a 48 kHz track and muxes it next to a stream-copied delivery video (AAC 48 kHz, High profile, faststart)', async () => {
    const d = tmp();
    const master = join(d, 'master.mp4');
    await fakeFinal(FFMPEG, master, { frames: 90 });
    const video = join(d, 'video.mp4');
    await encodeDelivery(FFMPEG, master, video, { preset: 'ultrafast' });
    const cue = join(d, 'click.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*2400*t)*exp(-t*90)':d=0.06:s=48000", cue]);
    const mix = join(d, 'mix.wav');
    await mixTrack(FFMPEG, { cues: [{ atMs: 0, file: cue, gainDb: -6 }, { atMs: 1500, file: cue, gainDb: -6 }], durationS: 3, out: mix });
    const out = join(d, 'final.mp4');
    await muxVariant(FFMPEG, video, mix, out);
    const probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,sample_rate,channels', '-of', 'json', out]).toString()) as { streams: Record<string, string | number>[] };
    expect(probe.streams.find((s) => s.codec_type === 'video')).toMatchObject({ codec_name: 'h264', profile: 'High' });
    expect(probe.streams.find((s) => s.codec_type === 'audio')).toMatchObject({ codec_name: 'aac', sample_rate: '48000', channels: 2 });
    const md5 = (f: string) => execFileSync(FFMPEG, ['-v', 'error', '-i', f, '-map', '0:v', '-c', 'copy', '-f', 'md5', '-']).toString();
    expect(md5(out)).toBe(md5(video));
    const head = readFileSync(out).subarray(0, 64).toString('latin1');
    expect(head.indexOf('moov')).toBeGreaterThan(-1);
  });
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run apps/worker/test/sound.test.ts`
Expected: FAIL — `../src/pipeline/sound.ts` yok.

- [ ] **Step 3: Uygula**

`apps/worker/src/render/ffmpeg.ts` değişiklikleri:

```ts
// run: the time limit becomes a parameter (delivery encodes take minutes)
const run = (ffmpeg: string, args: string[], signal?: AbortSignal, timeoutMs = 60_000) => new Promise<void>((resolve, reject) => {
  execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: timeoutMs, signal, maxBuffer: 16 * 1024 * 1024 }, (err, _o, stderr) => {
    if (err) reject(new Error(`ffmpeg: ${String(stderr).split('\n').filter(Boolean).at(-1) ?? (err as Error).message}`));
    else resolve();
  });
});

/** ffmpeg at info level for analysis filters (loudnorm JSON, ebur128, *detect); resolves with stderr. */
export function capture(ffmpeg: string, args: string[], signal?: AbortSignal, timeoutMs = 600_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, ['-hide_banner', '-nostats', ...args], { timeout: timeoutMs, signal, maxBuffer: 64 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) reject(new Error(`ffmpeg: ${String(stderr).split('\n').filter(Boolean).at(-1) ?? (err as Error).message}`));
      else resolve(String(stderr));
    });
  });
}

/** Spec §7.5 delivery (plan E8): H.264 High, CRF 17, GOP 60 (2 s), yuv420p tv bt709, faststart; the variants copy this stream. */
export const FINAL_ENCODE = { codec: 'libx264', profile: 'high', crf: 17, gop: 60, keyintMin: 30, pixFmt: 'yuv420p', color: 'bt709/tv', faststart: true } as const;

export function encodeDelivery(ffmpeg: string, master: string, out: string, o: { preset: string; signal?: AbortSignal }): Promise<void> {
  return run(ffmpeg, [
    '-i', master, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-preset', o.preset, '-crf', String(FINAL_ENCODE.crf), '-g', String(FINAL_ENCODE.gop),
    '-keyint_min', String(FINAL_ENCODE.keyintMin), '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709',
    '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out,
  ], o.signal, 1_800_000);
}

/** Spec §7.6 variants: the same video stream (-c:v copy) with AAC 48 kHz stereo; faststart. */
export function muxVariant(ffmpeg: string, video: string, audio: string, out: string, signal?: AbortSignal): Promise<void> {
  return run(ffmpeg, ['-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out], signal, 300_000);
}
```

`apps/worker/src/pipeline/sound.ts`:

```ts
import { createHash } from 'node:crypto';
import type { AssetRecord } from '@videogen/db';
import type { SfxName } from '../assets.ts';

/** Plan E10: scene events → sounds (spec §7.6: explode_start → whoosh, part_lock → click/snap). */
export const SFX_FOR_EVENT = { explode_start: 'whoosh', part_lock: 'click', label_in: 'tick', zoom: 'swoosh' } as const satisfies Record<string, SfxName>;
export const SFX_GAIN_DB: Record<SfxName, number> = { whoosh: -6, swoosh: -8, click: -10, snap: -8, tick: -16, thud: -6 };
export const MUSIC_GAIN_DB = -18;
/** Storyboard sfx_cues are free text (≤ 40 chars): Turkish and English words that name a library sound. */
const SYNONYMS: [string, SfxName][] = [
  ['whoosh', 'whoosh'], ['vuş', 'whoosh'], ['vınn', 'whoosh'], ['swoosh', 'swoosh'], ['vızz', 'swoosh'], ['click', 'click'], ['klik', 'click'], ['tık', 'click'],
  ['snap', 'snap'], ['çıt', 'snap'], ['tick', 'tick'], ['thud', 'thud'], ['güm', 'thud'], ['tok', 'thud'],
];
export function matchSfx(word: string): SfxName | null {
  const w = word.toLocaleLowerCase('tr');
  return SYNONYMS.find(([k]) => w.includes(k))?.[1] ?? null;
}

export interface SfxCue { atMs: number; name: SfxName; source: string }
type EventType = keyof typeof SFX_FOR_EVENT;
const PRIORITY = (source: string) => (source === 'hook' ? 0 : source.startsWith('beat:') ? 1 : 2);

/** Deterministic cue list: the hook whoosh at 0 ms (spec §8.1 D1/D6: sound ≤ 0.15 s), one cue per 2 frames, ≤ 3 of a sound per 10 s. */
export function planSfx(o: { events: { id: string; type: EventType; frame: number }[]; beats: { id: string; t_start: number; sfx_cues: string[] }[]; fps: number; durationS: number }): SfxCue[] {
  const end = Math.max(0, Math.round(o.durationS * 1000) - 50);
  const raw: SfxCue[] = [{ atMs: 0, name: 'whoosh', source: 'hook' }];
  for (const b of o.beats) for (const c of b.sfx_cues) { const n = matchSfx(c); if (n) raw.push({ atMs: Math.round(b.t_start * 1000), name: n, source: `beat:${b.id}` }); }
  for (const e of o.events) raw.push({ atMs: Math.round((e.frame / o.fps) * 1000), name: SFX_FOR_EVENT[e.type], source: `event:${e.id}` });
  const sorted = raw.map((c) => ({ ...c, atMs: Math.min(Math.max(0, c.atMs), end) })).sort((a, b) => a.atMs - b.atMs || PRIORITY(a.source) - PRIORITY(b.source));
  const gap = Math.round(2000 / o.fps);
  const kept: SfxCue[] = [];
  for (const c of sorted) {
    if (kept.some((k) => Math.abs(k.atMs - c.atMs) < gap)) continue;
    if (kept.filter((k) => k.name === c.name && c.atMs - k.atMs < 10_000).length >= 3) continue;
    kept.push(c);
  }
  return kept;
}

/** Plan E11: an allowed music track chosen by the video id's hash (stable across reruns of the same video). */
export function pickMusic<A extends Pick<AssetRecord, 'id' | 'kind' | 'allowed'>>(assets: A[], seed: string): A | null {
  const ok = assets.filter((a) => a.kind === 'music' && a.allowed).sort((a, b) => a.id.localeCompare(b.id));
  if (!ok.length) return null;
  return ok[parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) % ok.length]!;
}

export class LicenseError extends Error {
  constructor(message: string) { super(message); this.name = 'LicenseError'; }
}
export interface SoundPlan {
  cues: (SfxCue & { assetId: string; gainDb: number })[];
  music: { assetId: string; title: string; license: string; attribution: string | null; gainDb: number } | null;
}

/** Spec §9: the render refuses an asset that is not in the ledger or not allowed (checked again here, at use). */
export function soundPlan(cues: SfxCue[], library: Record<SfxName, AssetRecord>, music: AssetRecord | null): SoundPlan {
  const out = cues.map((c) => {
    const a = library[c.name];
    if (!a?.allowed || a.kind !== 'sfx') throw new LicenseError(`izinsiz ses: ${c.name}`);
    return { ...c, assetId: a.id, gainDb: SFX_GAIN_DB[c.name] };
  });
  if (music && (!music.allowed || music.kind !== 'music')) throw new LicenseError(`izinsiz müzik: ${music.title} (${music.licenseSpdx})`);
  return { cues: out, music: music ? { assetId: music.id, title: music.title, license: music.licenseSpdx, attribution: music.attribution, gainDb: MUSIC_GAIN_DB } : null };
}
```

`apps/worker/src/render/audio.ts`:

```ts
import { copyFile } from 'node:fs/promises';
import { capture } from './ffmpeg.ts';
import { execFile } from 'node:child_process';

const run = (ffmpeg: string, args: string[], signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeout: 300_000, signal, maxBuffer: 16 * 1024 * 1024 }, (err, _o, e) => (err ? reject(new Error(`ffmpeg: ${String(e).trim().split('\n').at(-1)}`)) : resolve()));
});

/** Spec §7.6: SFX cues (adelay) and the music bed (looped, faded) over a silent stereo base of the video's length; no normalisation in amix. */
export function mixTrack(ffmpeg: string, o: { cues: { atMs: number; file: string; gainDb: number }[]; music?: { file: string; gainDb: number } | null; durationS: number; out: string; signal?: AbortSignal }): Promise<void> {
  const d = o.durationS;
  const args = ['-f', 'lavfi', '-t', String(d), '-i', 'anullsrc=r=48000:cl=stereo'];
  for (const c of o.cues) args.push('-i', c.file);
  if (o.music) args.push('-stream_loop', '-1', '-i', o.music.file);
  const parts: string[] = [];
  const labels = ['[0:a]'];
  o.cues.forEach((c, i) => {
    parts.push(`[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${c.atMs}|${c.atMs},volume=${c.gainDb}dB[c${i}]`);
    labels.push(`[c${i}]`);
  });
  if (o.music) {
    parts.push(`[${o.cues.length + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${d},afade=t=in:d=1,afade=t=out:st=${Math.max(0, d - 2)}:d=2,volume=${o.music.gainDb}dB[m]`);
    labels.push('[m]');
  }
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first,atrim=0:${d}[out]`);
  return run(ffmpeg, [...args, '-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', o.out], o.signal);
}

export interface Loudnorm { i: number; tp: number; lra: number; thresh: number; offset: number }
/** The JSON block loudnorm prints with print_format=json ("-inf" for silence → NaN). */
export function parseLoudnormJson(stderr: string): Loudnorm | null {
  const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
  if (!m) return null;
  const j = JSON.parse(m[0]) as Record<string, string>;
  const n = (k: string) => Number(j[k]);
  return { i: n('input_i'), tp: n('input_tp'), lra: n('input_lra'), thresh: n('input_thresh'), offset: n('target_offset') };
}

const LOUDNORM = 'loudnorm=I=-14:TP=-1:LRA=11';
export async function measureLoudnorm(ffmpeg: string, file: string, signal?: AbortSignal): Promise<Loudnorm | null> {
  return parseLoudnormJson(await capture(ffmpeg, ['-i', file, '-af', `${LOUDNORM}:print_format=json`, '-f', 'null', '-'], signal));
}

/** Plan E12: two-pass loudnorm (−14 LUFS, −1 dBTP, LRA 11) with the measured values, linear when possible; a silent input is copied. */
export async function masterAudio(ffmpeg: string, input: string, out: string, signal?: AbortSignal): Promise<{ before: Loudnorm | null }> {
  const m = await measureLoudnorm(ffmpeg, input, signal);
  if (!m || !Number.isFinite(m.i) || !Number.isFinite(m.tp) || !Number.isFinite(m.offset)) {
    await copyFile(input, out);
    return { before: null };
  }
  const second = `${LOUDNORM}:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true,aresample=48000`;
  await run(ffmpeg, ['-i', input, '-af', second, '-ar', '48000', '-c:a', 'pcm_s16le', out], signal);
  return { before: m };
}
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/sound.test.ts && npm run typecheck && npm test`
Expected: `5 passed`; tam paket `Tests  338 passed (338)`. Mastering testinde ölçülen değerleri ledger'a yaz (doğrusal mi dinamik mi kaldı).

- [ ] **Step 5: Commit** — `feat(sound): deterministic SFX plan, licensed music pick, two-pass loudness mastering, delivery encode and variant mux`

---
### Task 8: `compose` adımı — `layout.json`, Remotion master, teslim kodlaması, ses planı ve iki varyant, kapak

**Files:**
- Modify: `apps/worker/src/pipeline/final-steps.ts` (`composeSource`, `composeExecutor`), `apps/worker/src/pipeline/scene-tools.ts` (`SceneDeps.encodePreset?`), `apps/worker/src/main.ts` (`encodePreset: config.render.encodePreset` iki `scene` nesnesine)
- Test: `apps/worker/test/compose-step.test.ts`

**Interfaces:**
- Consumes: `finalSource`, `FinalFramesMeta` (T4); `finalProps`, `layoutManifest` (T5); `RenderDriver.compose`, `FINAL_MASTER` (T6); `planSfx`, `pickMusic`, `soundPlan`, `mixTrack`, `masterAudio`, `encodeDelivery`, `muxVariant`, `FINAL_ENCODE` (T7); `ensureSfxLibrary`, `listAssets`, `getAsset` (T2); `record`, `sha`, `draftProbeErrors`, `probeVideo`, `extractFrame`.
- Produces:
  - `ComposeSource { hash; framesHash; currentFramesHash; framesDir (run'a göre); glbPath; props; durationS; sound: SoundPlan; files: Map<assetId, path> } | { error: string } | null`, `composeSource(deps, runId, videoId)`.
  - `composeExecutor(deps)`: `heavy_cpu`, `extraDiskMb` 600; artefaktlar `layout` (içerik), `audio_plan` (içerik), `final_video_music`, `final_video_tiktok` (medya sütunları + meta `{music}`), `final_cover` (540×960).

- [ ] **Step 1: Başarısız testi yaz**

`apps/worker/test/compose-step.test.ts` (kurulum T4'teki `final-render.test.ts` ile aynı: `setup()`, `built()`; `scene.encodePreset = 'ultrafast'`):

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, getBlob, insertArtifact, latestArtifact, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore } from '@videogen/claude';
import { layoutIssues, type LayoutManifest } from '@videogen/remotion/layout';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { importAsset } from '../src/assets.ts';
import { composeExecutor, finalRenderExecutor, type FinalFramesMeta } from '../src/pipeline/final-steps.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { framePath } from '../src/render/frames.ts';
import { ResourceLocks } from '../src/render/locks.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-compose-step-'));
  const scene: SceneDeps = { pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10, encodePreset: 'ultrafast' };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver: new FakeClaudeDriver({ speed: 0 }), pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  cleanups.push(() => manager.stop());
  return { dataDir, deps: { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene } as StepDeps };
}
/** research + storyboard + fake build + fake final frames of one run. */
async function framed(deps: StepDeps, name = 'Tükenmez kalem') {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const steps = await listRunSteps(t.pool, r.runId);
  const ctx = (key: 'build' | 'final_render' | 'compose'): StepContext => ({
    runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt: 1, round: 0, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
    versionId: r.versionId, runDir, signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
  });
  for (const ex of [buildExecutor(deps), finalRenderExecutor(deps)]) expect(await ex.run(ctx(ex.key as 'build'), await ex.inputHash(ctx(ex.key as 'build')))).toMatchObject({ status: 'done' });
  return { r, ctx, runDir };
}

describe('compose step', () => {
  it('without an allowed music track the music variant is SFX only and the plan says so', async () => {
    const { deps } = setup();
    const { r, ctx } = await framed(deps);
    const ex = composeExecutor(deps);
    const out = await ex.run(ctx('compose'), await ex.inputHash(ctx('compose')));
    expect(out).toMatchObject({ status: 'done', note: expect.stringMatching(/^1080×1920 · 0:45 · \d+ efekt · müzik: yok$/) });
    expect((await latestArtifact(t.pool, r.runId, 'audio_plan'))!.content).toMatchObject({ music: null });
  }, 180_000);

  it('records the layout, the sound plan, both variants sharing one video stream, and the cover', async () => {
    const { deps, dataDir } = setup();
    const bed = join(dataDir, 'bed.wav');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=20:c=brown:r=48000:a=0.3:seed=5', '-ac', '2', bed]);
    const lic = join(dataDir, 'lic.txt');
    writeFileSync(lic, 'CC0 1.0 (test)');
    await importAsset(t.pool, dataDir, FFMPEG, { kind: 'music', file: bed, title: 'Test yatağı', spdx: 'CC0-1.0', author: 'VideoGen test', licenseTextFile: lic });
    const { r, ctx } = await framed(deps);
    const ex = composeExecutor(deps);
    const hash = await ex.inputHash(ctx('compose'));
    expect(await ex.run(ctx('compose'), hash)).toMatchObject({ status: 'done', note: expect.stringMatching(/^1080×1920 · 0:45 · \d+ efekt · müzik: Test yatağı$/) });
    const kinds = (await t.pool.query('SELECT kind FROM artifacts WHERE run_id = $1 AND input_hash = $2 ORDER BY kind', [r.runId, hash])).rows.map((x) => x.kind);
    expect(kinds).toEqual(['audio_plan', 'final_cover', 'final_video_music', 'final_video_tiktok', 'layout']);
    const music = (await latestArtifact(t.pool, r.runId, 'final_video_music'))!;
    const tiktok = (await latestArtifact(t.pool, r.runId, 'final_video_tiktok'))!;
    expect((await t.pool.query('SELECT width, height, codec, duration_ms FROM artifacts WHERE id = $1', [music.id])).rows[0]).toMatchObject({ width: 1080, height: 1920, codec: 'h264', duration_ms: 45033 });
    const file = async (sha: string) => join(dataDir, (await getBlob(t.pool, sha))!.path);
    const md5 = (f: string) => execFileSync(FFMPEG, ['-v', 'error', '-i', f, '-map', '0:v', '-c', 'copy', '-f', 'md5', '-']).toString();
    expect(md5(await file(music.blobSha!))).toBe(md5(await file(tiktok.blobSha!)));
    const layout = (await latestArtifact(t.pool, r.runId, 'layout'))!.content as LayoutManifest;
    expect(layout.frames.length).toBeGreaterThan(270);
    expect(layoutIssues(layout)).toEqual([]);
    expect(await ex.reuse!(ctx('compose'), hash)).toBe(true);
  }, 180_000);

  it('never composes stale frames (spec §8.3) or a frame set with a hole', async () => {
    const { deps } = setup();
    const a = await framed(deps, 'Kalem bayat');
    const scene = fx('scene-kalem');
    await insertArtifact(t.pool, { runId: a.r.runId, kind: 'scene', content: { ...scene, camera_keys: scene.camera_keys.map((k: { lens_mm: number }, i: number) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 } : k)) } });
    const ex = composeExecutor(deps);
    expect(await ex.run(a.ctx('compose'), await ex.inputHash(a.ctx('compose')))).toEqual({ status: 'failed', error: 'final kareler güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    const b = await framed(deps, 'Kalem eksik');
    const meta = (await latestArtifact(t.pool, b.r.runId, 'final_frames'))!.meta as FinalFramesMeta;
    truncateSync(framePath(join(b.runDir, meta.dir), 700), 10);
    expect(await ex.run(b.ctx('compose'), await ex.inputHash(b.ctx('compose')))).toEqual({ status: 'failed', error: 'eksik final kare: 1 (ilk: f00700)', retry: false });
  }, 180_000);
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run apps/worker/test/compose-step.test.ts`
Expected: FAIL — `composeExecutor` export'u yok.

- [ ] **Step 3: Uygula**

`apps/worker/src/pipeline/scene-tools.ts`: `SceneDeps`'e `/** Delivery encode preset (spec §7.5 slow; smoke ultrafast). */ encodePreset?: string;`.

`apps/worker/src/main.ts`: iki `scene`/`sceneToolHost` nesnesine `encodePreset: config.render.encodePreset`.

`apps/worker/src/pipeline/final-steps.ts` import'ları ve ekleri:

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { CHANNEL_STYLES, formatClock, SceneEventsSchema, validateArtifact } from '@videogen/shared';
import { getAsset, listAssets } from '@videogen/db';
import { parseGlb } from '@videogen/scene3d';
import { bundleHash, FINAL_MASTER } from '@videogen/remotion/hash';
import { finalProps, type FinalProps } from '@videogen/remotion/props';
import { layoutManifest } from '@videogen/remotion/layout';
import { ensureSfxLibrary } from '../assets.ts';
import { masterAudio, mixTrack } from '../render/audio.ts';
import { draftProbeErrors, encodeDelivery, extractFrame, FINAL_ENCODE, muxVariant, probeVideo } from '../render/ffmpeg.ts';
import { LicenseError, pickMusic, planSfx, soundPlan, type SoundPlan } from './sound.ts';
import { record } from './steps.ts';

export interface ComposeSource {
  hash: string;
  /** final_frames' input hash vs. the hash of the current scene (plan E16: stale frames are never composed). */
  framesHash: string;
  currentFramesHash: string;
  framesDir: string;
  glbPath: string;
  props: Omit<FinalProps, 'glbUrl' | 'framesUrl'>;
  durationS: number;
  sound: SoundPlan;
  files: Map<string, string>;
}

/** Plan E16: everything compose reads, and its input hash (frames, GLB, overlay props, template, master/encode settings, sound plan). */
export async function composeSource(deps: StepDeps, runId: string, videoId: string): Promise<ComposeSource | { error: string } | null> {
  const ffmpeg = deps.scene?.ffmpeg ?? 'ffmpeg';
  const [frames, glb, scene, board, track, events] = await Promise.all(['final_frames', 'scene_glb', 'scene', 'storyboard', 'camera_track', 'scene_events'].map((k) => latestArtifact(deps.pool, runId, k)));
  const current = await finalSource(deps, runId);
  const s = scene ? validateArtifact('SceneSpec', scene.content) : null;
  const b = board ? validateArtifact('Storyboard', board.content) : null;
  const ev = events ? SceneEventsSchema.safeParse(events.content) : null;
  const yfov = (track?.content as { yfov?: number[] } | null)?.yfov;
  const glbBlob = glb?.blobSha ? await getBlob(deps.pool, glb.blobSha) : null;
  const meta = frames?.meta as FinalFramesMeta | undefined;
  if (!frames?.inputHash || !meta || !current || !s?.ok || !b?.ok || !ev?.success || !yfov || !glbBlob) return null;
  const { glbUrl: _g, framesUrl: _f, ...props } = finalProps({ glbUrl: '', framesUrl: '', yfov, scene: s.value, storyboard: b.value, style: CHANNEL_STYLES[s.value.style_id] });
  const durationS = (props.frames + 1) / 30;
  const library = await ensureSfxLibrary(deps.pool, deps.dataDir, ffmpeg);
  const music = pickMusic(await listAssets(deps.pool, { kind: 'music', allowedOnly: true }), videoId);
  let sound: SoundPlan;
  try {
    sound = soundPlan(planSfx({ events: ev.data.events, beats: b.value.beats, fps: 30, durationS }), library, music);
  } catch (e) {
    if (e instanceof LicenseError) return { error: `lisans kapısı: ${e.message}` };
    throw e;
  }
  const files = new Map<string, string>();
  for (const a of [...Object.values(library), ...(music ? [music] : [])]) files.set(a.id, join(deps.dataDir, (await getBlob(deps.pool, a.blobSha))!.path));
  const hash = sha({ step: 'compose', frames: frames.inputHash, glb: glbBlob.sha256, props: sha(props), bundle: bundleHash(), master: FINAL_MASTER, encode: FINAL_ENCODE, preset: deps.scene?.encodePreset ?? 'slow', sound: sha(sound) });
  return { hash, framesHash: frames.inputHash, currentFramesHash: current.hash, framesDir: meta.dir, glbPath: join(deps.dataDir, glbBlob.path), props, durationS, sound, files };
}

/** Spec §7.1 step 8: Final3D over the frames → delivery encode → SFX + music + mastering → the two variants (plan E7–E12). heavy_cpu. */
export function composeExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'compose',
    resource: 'heavy_cpu',
    extraDiskMb: 600,
    async inputHash(ctx) {
      const src = await composeSource(deps, ctx.runId, ctx.videoId);
      return src && 'hash' in src ? src.hash : sha({ step: 'compose', missing: true, error: src && 'error' in src ? src.error : null });
    },
    async reuse(ctx, hash) {
      const a = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'final_video_tiktok', inputHash: hash });
      const blob = a?.blobSha ? await getBlob(deps.pool, a.blobSha) : null;
      return !!blob && existsSync(join(deps.dataDir, blob.path));
    },
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const src = await composeSource(deps, ctx.runId, ctx.videoId);
      if (!src) return { status: 'failed', error: 'final kareleri ya da sahne çıktısı yok', retry: false };
      if ('error' in src) return { status: 'failed', error: src.error, retry: false };
      if (src.framesHash !== src.currentFramesHash) return { status: 'failed', error: 'final kareler güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false };
      const framesDir = join(ctx.runDir, src.framesDir);
      const missing = missingFrames(framesDir, src.props.frames);
      if (missing.length) return { status: 'failed', error: `eksik final kare: ${missing.length} (ilk: f${String(missing[0]).padStart(5, '0')})`, retry: false };
      const dir = join(ctx.runDir, 'final', 'compose', hash.slice(0, 16));
      await mkdir(dir, { recursive: true });
      const layout = layoutManifest(src.props, await parseGlb(await readFile(src.glbPath)));
      const layoutFile = join(dir, 'layout.json');
      await writeFile(layoutFile, JSON.stringify(layout));
      try {
        ctx.status('running', 'birleştirme hazırlanıyor (bundle, Chrome)');
        const r = await scene.render.compose({
          runDir: ctx.runDir, props: src.props, glbPath: src.glbPath, framesDir, outPath: join(dir, 'master.mp4'), owner: ctx.stepId, signal: ctx.signal,
          onStage: (st) => { if (st === 'frames') ctx.status('running', null); },
          onProgress: (done, total) => ctx.progress(Math.min(80, (done / total) * 80), 'render'),
        });
        ctx.status('running', 'teslim kodlaması');
        const video = join(dir, 'video.mp4');
        await encodeDelivery(scene.ffmpeg, r.file, video, { preset: scene.encodePreset ?? 'slow', signal: ctx.signal });
        const probe = await probeVideo(scene.ffmpeg, video, ctx.signal);
        const errors = draftProbeErrors(probe, { width: 1080, height: 1920, frames: src.props.frames + 1 });
        if (errors.length) {
          await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'render.final_rejected', runId: ctx.runId, stepId: ctx.stepId, data: { errors } });
          return { status: 'failed', error: `final video doğrulamadan geçmedi: ${errors.join('; ')}`, retry: false };
        }
        ctx.progress(85, 'render');
        ctx.status('running', 'ses: efektler, müzik, mastering');
        const cues = src.sound.cues.map((c) => ({ atMs: c.atMs, gainDb: c.gainDb, file: src.files.get(c.assetId)! }));
        const music = src.sound.music ? { file: src.files.get(src.sound.music.assetId)!, gainDb: src.sound.music.gainDb } : null;
        const out: Record<'music' | 'tiktok', string> = { music: join(dir, 'final_music.mp4'), tiktok: join(dir, 'final_tiktok.mp4') };
        for (const v of ['music', 'tiktok'] as const) {
          await mixTrack(scene.ffmpeg, { cues, music: v === 'music' ? music : null, durationS: src.durationS, out: join(dir, `mix-${v}.wav`), signal: ctx.signal });
          await masterAudio(scene.ffmpeg, join(dir, `mix-${v}.wav`), join(dir, `${v}.wav`), ctx.signal);
          await muxVariant(scene.ffmpeg, video, join(dir, `${v}.wav`), out[v], ctx.signal);
        }
        ctx.status('running', null);
        ctx.progress(95, 'render');
        const cover = join(dir, 'cover.png');
        await extractFrame(scene.ffmpeg, video, cover, { t: 0, width: 540, signal: ctx.signal });
        const planFile = join(dir, 'audio_plan.json');
        await writeFile(planFile, JSON.stringify(src.sound, null, 2));
        const media = { durationMs: Math.round(probe.durationS * 1000), width: probe.width, height: probe.height, codec: probe.codec };
        await record(deps, ctx, { kind: 'layout', file: layoutFile, content: layout, inputHash: hash });
        await record(deps, ctx, { kind: 'audio_plan', file: planFile, content: src.sound, inputHash: hash });
        await record(deps, ctx, { kind: 'final_video_music', file: out.music, inputHash: hash, media, meta: { music: src.sound.music?.title ?? null } });
        await record(deps, ctx, { kind: 'final_video_tiktok', file: out.tiktok, inputHash: hash, media, meta: { music: null } });
        await record(deps, ctx, { kind: 'final_cover', file: cover, inputHash: hash });
        return { status: 'done', note: `1080×1920 · ${formatClock(probe.durationS)} · ${src.sound.cues.length} efekt · müzik: ${src.sound.music?.title ?? 'yok'}` };
      } catch (e) {
        if (e instanceof RenderError && e.kind !== 'aborted') return { status: 'failed', error: e.message, retry: false };
        throw e;
      }
    },
  };
}
```

(Ek import'lar: `existsSync` (`node:fs`), `mkdir` zaten var; `getBlob`, `findArtifact`, `appendAudit`, `latestArtifact` (`@videogen/db`); `getAsset` kullanılmıyorsa çıkar.)

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/compose-step.test.ts && npm run typecheck && npm test`
Expected: `3 passed` (her biri ~20–40 sn: 1351 karelik 1080p ultrafast kodlama); tam paket `Tests  341 passed (341)`. Süreleri ledger'a yaz; tam paket süresi > 3 dk olursa bu dosyayı `test:render`'a taşıma kararı `Ruling:` ile.

- [ ] **Step 5: Commit** — `feat(worker): compose step — layout manifest, Final3D master, delivery encode, mastered SFX/music variants, cover`

---
### Task 9: qc_probe — ölçümler (ffprobe + ebur128 + silence/black/freeze + flaş + SSIM + kenar bantları), saf ayrıştırıcılar, `qc-cli`

**Files:**
- Create: `apps/worker/src/render/qc.ts`, `apps/worker/src/render/qc-cli.ts`
- Test: `apps/worker/test/qc.test.ts`

**Interfaces:**
- Consumes: `QcMeasure`, `evaluateQc`, `QC_LIMITS` (T1); `capture`, `extractFrame`, `ffprobeOf` (T7, M4c).
- Produces:
  - Saf: `parseEbur128(stderr) → {i, lra, tp} | null`, `parseSpans(stderr, kind: 'silence'|'black'|'freeze', durationS) → Span[]`, `firstAudio(leading: Span[], durationS) → number | null`, `parseYavg(text) → number[]`, `flashStats(yavg, fps) → {maxPerS, at}`, `edgeMax(series[], fps) → {maxDensity, at}`, `mp4TopBoxes(buf) → string[]`.
  - `probeQc(ffmpeg, file, {video?: boolean = true, edges?: boolean = false, signal?}) → QcMeasure` (video `false`: görüntü analizleri atlanır, değerler nötr; müziksiz varyant için).
  - `qc-cli.ts <video> [--layout layout.json]`: müzikli varyant gibi değerlendirir; JSON + Türkçe başarısızlık listesi basar; kapı düşerse çıkış 3.

- [ ] **Step 1: Başarısız testi yaz**

`apps/worker/test/qc.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { evaluateQc } from '@videogen/shared';
import { masterAudio } from '../src/render/audio.ts';
import { encodeDelivery, fakeFinal, muxVariant } from '../src/render/ffmpeg.ts';
import { edgeMax, firstAudio, flashStats, mp4TopBoxes, parseEbur128, parseSpans, parseYavg, probeQc } from '../src/render/qc.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const D = mkdtempSync(join(tmpdir(), 'vg-qc-'));
const ff = (...args: string[]) => execFileSync(FFMPEG, ['-v', 'error', '-y', ...args]);
const failed = (r: { id: string; pass: boolean }[]) => r.filter((c) => !c.pass).map((c) => c.id).sort();
/**
 * A pilot-like clip (spec §8.3): 14 s, yuvj420p/pc tags, text-like stripes in the top unsafe band at 2–4 s, a 1.2 s freeze at 6 s,
 * silence until 0.8 s and again 7–8.3 s, loud/quiet alternation (high LRA) around −24 LUFS.
 */
const PILOT = join(D, 'pilot.mp4');

beforeAll(() => {
  const stripes = [8, 14, 20, 26].map((y) => `drawbox=x=20:y=${y}:w=230:h=2:color=white:t=fill:enable='between(t,2,4)'`).join(',');
  ff('-f', 'lavfi', '-i', 'color=c=0x203040:s=270x480:r=30:d=14',
    '-f', 'lavfi', '-i', 'anoisesrc=d=14:c=pink:r=48000:a=1:seed=9',
    '-filter_complex', `[0:v]drawbox=x='mod(if(between(t,6,7.2),360,t*60),200)':y=200:w=40:h=40:color=red:t=fill,${stripes}[v];[1:a]volume='if(lt(t,0.8)+between(t,7,8.3),0,if(lt(mod(t,4),2),0.02,0.2))':eval=frame[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuvj420p', '-color_range', 'pc', '-c:a', 'aac', '-ar', '48000', PILOT);
}, 60_000);

describe('qc_probe', () => {
  it('parses ebur128, silence/black/freeze spans and the first audible moment', () => {
    const eb = 'Summary:\n\n  Integrated loudness:\n    I:         -23.4 LUFS\n    Threshold: -33.9 LUFS\n\n  Loudness range:\n    LRA:        20.6 LU\n\n  True peak:\n    Peak:       -3.1 dBFS';
    expect(parseEbur128(eb)).toEqual({ i: -23.4, lra: 20.6, tp: -3.1 });
    expect(parseEbur128('nothing')).toBeNull();
    const sil = '[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 0.8 | silence_duration: 0.8\n[silencedetect @ 0x1] silence_start: 12.1\n[silencedetect @ 0x1] silence_end: 13.4 | silence_duration: 1.3\n[silencedetect @ 0x1] silence_start: 44.5';
    expect(parseSpans(sil, 'silence', 45)).toEqual([{ start: 0, end: 0.8 }, { start: 12.1, end: 13.4 }, { start: 44.5, end: 45 }]);
    expect(parseSpans('[blackdetect @ 0x2] black_start:20 black_end:21.2 black_duration:1.2', 'black', 45)).toEqual([{ start: 20, end: 21.2 }]);
    expect(parseSpans('[freezedetect @ 0x3] lavfi.freezedetect.freeze_start: 6.03\n[freezedetect @ 0x3] lavfi.freezedetect.freeze_duration: 1.2\n[freezedetect @ 0x3] lavfi.freezedetect.freeze_end: 7.23', 'freeze', 14)).toEqual([{ start: 6.03, end: 7.23 }]);
    expect([firstAudio([{ start: 0, end: 0.79 }], 45), firstAudio([], 45), firstAudio([{ start: 0, end: 45 }], 45)]).toEqual([0.79, 0, null]);
  });

  it('counts flashes per second from frame brightness and finds edge density in the unsafe bands', () => {
    const steady = Array.from({ length: 90 }, () => 60);
    const flashy = steady.map((y, i) => (i >= 30 && i < 60 && i % 6 === 0 ? 200 : y));
    expect(flashStats(steady, 30)).toEqual({ maxPerS: 0, at: null });
    expect(flashStats(flashy, 30)).toEqual({ maxPerS: 5, at: 1 });
    expect(flashStats(steady.map((y, i) => (i >= 45 ? 180 : y)), 30).maxPerS).toBe(0); // a cut is not a flash
    expect(parseYavg('frame:0    pts:0       pts_time:0\nlavfi.signalstats.YAVG=23.5\nframe:1    pts:1       pts_time:0.0333\nlavfi.signalstats.YAVG=24\n')).toEqual([23.5, 24]);
    expect(edgeMax([[0, 2.55, 0], [0, 0, 25.5]], 2)).toEqual({ maxDensity: 0.1, at: 1 });
  });

  it('reads the top-level MP4 box order (faststart: moov before mdat)', () => {
    const a = join(D, 'fs.mp4');
    const b = join(D, 'nofs.mp4');
    ff('-f', 'lavfi', '-i', 'color=s=64x64:d=1', '-c:v', 'libx264', '-movflags', '+faststart', a);
    ff('-f', 'lavfi', '-i', 'color=s=64x64:d=1', '-c:v', 'libx264', b);
    const order = (f: string) => mp4TopBoxes(readFileSync(f).subarray(0, 65536)).filter((x) => x === 'moov' || x === 'mdat');
    expect(order(a)).toEqual(['moov', 'mdat']);
    expect(order(b)[0]).toBe('mdat');
  });

  it('catches the pilot\'s seven errors on a pilot-like clip (spec §8.3 calibration)', async () => {
    const m = await probeQc(FFMPEG, PILOT, { edges: true });
    expect(m.firstAudioS!).toBeGreaterThan(0.6);
    expect(m.freezes.length).toBeGreaterThan(0);
    expect(m.edgeBands.maxDensity).toBeGreaterThan(0.02);
    const f = failed(evaluateQc(m, { variant: 'music', layoutIssues: null, coverOk: true }));
    for (const id of ['g1_color', 'g6_edges', 'd6_loudness', 'd6_lra', 'd6_first_audio', 'd6_silence', 'd3_freeze']) expect(f).toContain(id);
  }, 120_000);

  it('passes a clean, mastered 36 s final on every check it can judge here (D7 bitrate and the loop are content dependent)', async () => {
    const master = join(D, 'm.mp4');
    const video = join(D, 'v.mp4');
    await fakeFinal(FFMPEG, master, { frames: 1081 });
    await encodeDelivery(FFMPEG, master, video, { preset: 'ultrafast' });
    const raw = join(D, 'raw.wav');
    ff('-f', 'lavfi', '-i', 'anoisesrc=d=36.1:c=pink:r=48000:a=0.2:seed=4', '-ac', '2', raw);
    const wav = join(D, 'mastered.wav');
    await masterAudio(FFMPEG, raw, wav);
    const final = join(D, 'final.mp4');
    await muxVariant(FFMPEG, video, wav, final);
    const m = await probeQc(FFMPEG, final, {});
    expect(m.edgeBands).toEqual({ maxDensity: 0, at: null });
    const f = failed(evaluateQc(m, { variant: 'music', layoutIssues: [], coverOk: true })).filter((id) => id !== 'd7_bitrate' && id !== 'd8_loop');
    expect(f).toEqual([]);
  }, 180_000);

  it('skips the picture analyses for the TikTok variant (same stream as the music variant)', async () => {
    const m = await probeQc(FFMPEG, PILOT, { video: false });
    expect([m.freezes, m.blacks, m.flashMaxPerS, m.loopSsim]).toEqual([[], [], 0, null]);
    expect(m.video.pixFmt).toBe('yuvj420p');
  }, 60_000);
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run apps/worker/test/qc.test.ts`
Expected: FAIL — `../src/render/qc.ts` yok.

- [ ] **Step 3: Uygula**

`apps/worker/src/render/qc.ts`:

```ts
import { execFile } from 'node:child_process';
import { mkdtemp, open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QC_LIMITS, type QcMeasure, type Span } from '@videogen/shared';
import { capture, extractFrame, ffprobeOf } from './ffmpeg.ts';

const num = (s: string) => (s === '-inf' ? Number.NEGATIVE_INFINITY : Number(s));

/** ebur128 summary (peak=true): integrated loudness, loudness range, true peak. */
export function parseEbur128(stderr: string): { i: number; lra: number; tp: number } | null {
  const i = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf) LUFS/.exec(stderr);
  const lra = /Loudness range:\s*\n\s*LRA:\s*([\d.]+) LU/.exec(stderr);
  const tp = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf) dBFS/.exec(stderr);
  return i && lra && tp ? { i: num(i[1]!), lra: Number(lra[1]), tp: num(tp[1]!) } : null;
}

const SPAN = {
  silence: [/silence_start: (-?[\d.]+)/g, /silence_end: (-?[\d.]+)/g],
  black: [/black_start:(-?[\d.]+)/g, /black_end:(-?[\d.]+)/g],
  freeze: [/freeze_start: (-?[\d.]+)/g, /freeze_end: (-?[\d.]+)/g],
} as const;

/** start/end pairs in log order; a start without an end runs to the end of the file. */
export function parseSpans(stderr: string, kind: keyof typeof SPAN, durationS: number): Span[] {
  const [s, e] = SPAN[kind];
  const starts = [...stderr.matchAll(s)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...stderr.matchAll(e)].map((m) => Number(m[1]));
  return starts.map((start, i) => ({ start, end: ends[i] ?? durationS }));
}

/** End of a leading silence (≤ 10 ms from 0); null when the silence covers the whole file. */
export function firstAudio(leading: Span[], durationS: number): number | null {
  const lead = leading.find((x) => x.start <= 0.01);
  if (!lead) return 0;
  return lead.end >= durationS - 0.01 ? null : Math.round(lead.end * 1000) / 1000;
}

export function parseYavg(text: string): number[] {
  return [...text.matchAll(/lavfi\.signalstats\.YAVG=(-?[\d.]+)/g)].map((m) => Number(m[1]));
}

/** Spec §8.1 G5: a flash is a brightness jump ≥ 20/255 that reverses within 3 frames; the most flashes in any 1 s window. */
export function flashStats(yavg: number[], fps: number): { maxPerS: number; at: number | null } {
  const d = QC_LIMITS.flashDelta;
  const flashes: number[] = [];
  for (let i = 1; i < yavg.length; i++) {
    const up = yavg[i]! - yavg[i - 1]!;
    if (Math.abs(up) < d) continue;
    for (let j = i + 1; j <= Math.min(yavg.length - 1, i + 3); j++) {
      const back = yavg[j]! - yavg[j - 1]!;
      if (Math.abs(back) >= d && Math.sign(back) !== Math.sign(up)) { flashes.push(i); break; }
    }
  }
  let best = 0;
  let at: number | null = null;
  for (const f of flashes) {
    const n = flashes.filter((g) => g >= f && g < f + fps).length;
    if (n > best) { best = n; at = Math.round((f / fps) * 100) / 100; }
  }
  return { maxPerS: best, at };
}

/** Edge density (0..1) per band series sampled at `fps`; the worst band and time. */
export function edgeMax(series: number[][], fps: number): { maxDensity: number; at: number | null } {
  let maxDensity = 0;
  let at: number | null = null;
  for (const s of series) s.forEach((y, i) => { const v = Math.round((y / 255) * 1000) / 1000; if (v > maxDensity) { maxDensity = v; at = i / fps; } });
  return { maxDensity, at };
}

/** Top-level MP4 boxes from the head of a file (size 1 = 64-bit size, 0 = to the end). */
export function mp4TopBoxes(buf: Buffer): string[] {
  const out: string[] = [];
  let off = 0;
  while (off + 8 <= buf.length) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    out.push(type);
    if (size === 1) { if (off + 16 > buf.length) break; size = Number(buf.readBigUInt64BE(off + 8)); }
    if (size === 0 || size < 8) break;
    off += size;
  }
  return out;
}

const probeJson = (ffmpeg: string, args: string[], signal?: AbortSignal) => new Promise<string>((resolve, reject) => {
  execFile(ffprobeOf(ffmpeg), ['-v', 'error', ...args], { timeout: 120_000, signal, maxBuffer: 32 * 1024 * 1024 }, (err, out) => (err ? reject(new Error(`ffprobe: ${(err as Error).message.split('\n')[0]}`)) : resolve(String(out))));
});

/** Plan E14: everything evaluateQc needs, in a handful of ffmpeg/ffprobe passes. */
export async function probeQc(ffmpeg: string, file: string, o: { video?: boolean; edges?: boolean; signal?: AbortSignal }): Promise<QcMeasure> {
  const sig = o.signal;
  const j = JSON.parse(await probeJson(ffmpeg, ['-show_entries', 'stream=codec_type,codec_name,profile,width,height,r_frame_rate,pix_fmt,color_range,color_space,color_primaries,color_transfer,nb_frames,bit_rate,sample_rate:format=duration,size,bit_rate', '-of', 'json', file], sig)) as { streams: Record<string, string | number>[]; format: Record<string, string> };
  const v = j.streams.find((s) => s.codec_type === 'video') ?? {};
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const str = (x: unknown) => (x === undefined || x === 'unknown' ? null : String(x));
  const durationS = Number(j.format.duration ?? 0);
  const fps = (() => { const [n, d] = String(v.r_frame_rate ?? '30/1').split('/').map(Number); return d ? n! / d : 30; })();
  const keys = (await probeJson(ffmpeg, ['-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file], sig)).split('\n').map(Number).filter((x) => Number.isFinite(x));
  const gaps = keys.map((k, i) => (i ? k - keys[i - 1]! : k)).concat(keys.length ? [durationS - keys.at(-1)!] : [durationS]);
  const fh = await open(file, 'r');
  const head = Buffer.alloc(65536);
  const { bytesRead } = await fh.read(head, 0, head.length, 0);
  await fh.close();
  const boxes = mp4TopBoxes(head.subarray(0, bytesRead));
  const tmp = await mkdtemp(join(tmpdir(), 'vg-qc-'));
  try {
    let yavg: number[] = [];
    let blacks: Span[] = [];
    let freezes: Span[] = [];
    let loopSsim: number | null = null;
    if (o.video !== false) {
      const yfile = join(tmp, 'yavg.txt');
      const err = await capture(ffmpeg, ['-i', file, '-an', '-vf', `signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=${yfile},blackdetect=d=${QC_LIMITS.blackS}:pix_th=0.10,freezedetect=n=0.001:d=${QC_LIMITS.freezeS}`, '-f', 'null', '-'], sig);
      yavg = parseYavg(await readFile(yfile, 'utf8').catch(() => ''));
      blacks = parseSpans(err, 'black', durationS);
      freezes = parseSpans(err, 'freeze', durationS);
      const first = join(tmp, 'first.png');
      const last = join(tmp, 'last.png');
      await extractFrame(ffmpeg, file, first, { t: 0, width: 540, signal: sig });
      await extractFrame(ffmpeg, file, last, { t: Math.max(0, durationS - 1.5 / fps), width: 540, signal: sig });
      const s = /All:([\d.]+)/.exec(await capture(ffmpeg, ['-i', last, '-i', first, '-lavfi', 'ssim', '-f', 'null', '-'], sig));
      loopSsim = s ? Number(s[1]) : null;
    }
    let edgeBands = { maxDensity: 0, at: null as number | null };
    if (o.edges) {
      const bands = ['iw:ih*150/1920:0:0', 'iw:ih-ih*1510/1920:0:ih*1510/1920', 'iw*130/1080:ih:iw-iw*130/1080:0'];
      const series: number[][] = [];
      for (const [k, crop] of bands.entries()) {
        const f = join(tmp, `edge${k}.txt`);
        await capture(ffmpeg, ['-i', file, '-an', '-vf', `fps=2,crop=${crop},edgedetect=low=0.1:high=0.3,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=${f}`, '-f', 'null', '-'], sig);
        series.push(parseYavg(await readFile(f, 'utf8').catch(() => '')));
      }
      edgeBands = edgeMax(series, 2);
    }
    let loudness: QcMeasure['loudness'] = null;
    let silences: Span[] = [];
    let firstAudioS: number | null = null;
    if (a) {
      const err = await capture(ffmpeg, ['-i', file, '-vn', '-af', `ebur128=peak=true:framelog=quiet,silencedetect=noise=${QC_LIMITS.silenceDb}dB:d=${QC_LIMITS.silenceS}`, '-f', 'null', '-'], sig);
      loudness = parseEbur128(err);
      const lead = await capture(ffmpeg, ['-t', '3', '-i', file, '-vn', '-af', `silencedetect=noise=${QC_LIMITS.silenceDb}dB:d=0.02`, '-f', 'null', '-'], sig);
      firstAudioS = firstAudio(parseSpans(lead, 'silence', Math.min(3, durationS)), Math.min(3, durationS) >= durationS ? durationS : Number.POSITIVE_INFINITY);
      silences = parseSpans(err, 'silence', durationS).filter((x) => firstAudioS !== null && x.start >= firstAudioS - 0.01);
    }
    const flash = o.video !== false ? flashStats(yavg, fps) : { maxPerS: 0, at: null };
    return {
      video: {
        codec: String(v.codec_name ?? ''), profile: str(v.profile), width: Number(v.width ?? 0), height: Number(v.height ?? 0), fps: String(v.r_frame_rate ?? ''), pixFmt: String(v.pix_fmt ?? ''),
        colorRange: str(v.color_range), colorSpace: str(v.color_space), colorPrimaries: str(v.color_primaries), colorTransfer: str(v.color_transfer),
        frames: Number(v.nb_frames ?? 0), durationS, bitrateKbps: Math.round(Number(v.bit_rate ?? j.format.bit_rate ?? 0) / 1000),
        maxGopFrames: Math.round(Math.max(...gaps) * fps), faststart: boxes.indexOf('moov') > -1 && (boxes.indexOf('mdat') === -1 || boxes.indexOf('moov') < boxes.indexOf('mdat')),
      },
      audio: a ? { codec: String(a.codec_name), sampleRate: Number(a.sample_rate) } : null,
      bytes: Number(j.format.size ?? (await stat(file)).size),
      loudness, firstAudioS, silences, blacks, freezes, flashMaxPerS: flash.maxPerS, flashAt: flash.at, loopSsim, edgeBands,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
```

(`firstAudio`'ya ikinci argüman: önde 3 sn tarandığı için, dosya 3 sn'den uzunsa "tamamı sessiz" ancak dosya ≤ 3 sn ise mümkündür; `POSITIVE_INFINITY` bunu sağlar. `ebur128` `framelog=quiet` ffmpeg ≥ 6'da var; özet info düzeyinde basılır.)

`apps/worker/src/render/qc-cli.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { evaluateQc, QC_CHECKS } from '@videogen/shared';
import { layoutIssues, type LayoutManifest } from '@videogen/remotion/layout';
import { probeQc } from './qc.ts';

/** Calibration and manual checks (spec §8.3): node --import tsx apps/worker/src/render/qc-cli.ts <video> [--layout layout.json] */
const { values, positionals } = parseArgs({ allowPositionals: true, options: { layout: { type: 'string' } } });
const file = positionals[0];
if (!file) { console.error('kullanım: qc-cli <video> [--layout layout.json]'); process.exit(2); }
const layout = values.layout ? layoutIssues(JSON.parse(readFileSync(values.layout, 'utf8')) as LayoutManifest) : null;
const m = await probeQc(process.env.VG_FFMPEG ?? 'ffmpeg', file, { edges: !layout });
const r = evaluateQc(m, { variant: 'music', layoutIssues: layout, coverOk: true });
console.log(JSON.stringify({ measure: m, checks: r }, null, 2));
const bad = r.filter((c) => !c.pass);
for (const c of bad) console.log(`✗ ${c.id} ${QC_CHECKS[c.id].label_tr}: ${c.value} (${c.limit})${c.at !== undefined ? ` @ ${c.at} sn` : ''}`);
process.exit(bad.some((c) => QC_CHECKS[c.id].gate) ? 3 : 0);
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/qc.test.ts && npm run typecheck && npm test`
Expected: `6 passed`; tam paket `Tests  347 passed (347)`. Pilot benzeri klipte ölçülen değerleri (I, LRA, TP, ilk ses, kenar yoğunluğu) ledger'a yaz: T12'de gerçek pilotla karşılaştırılır.

- [ ] **Step 5: Commit** — `feat(qc): qc_probe measurements with pure parsers, calibrated on a pilot-like clip, and a qc CLI`

---
### Task 10: `qc` adımı, üretim planı (final_render → compose → qc), K13 notu, geliştirici `until` seçeneği, uçtan uca

**Files:**
- Modify: `apps/worker/src/pipeline/final-steps.ts` (`qcExecutor`, `decideQc`), `apps/worker/src/pipeline/steps.ts` (`pipelineExecutors`), `packages/shared/src/pipeline.ts` (`IMPLEMENTED_STEPS`), `apps/worker/src/pipeline/orchestrator.ts` (`DONE_NOTE.qc`, `NOT_YET`), `apps/api/src/routes/videos.ts` + `apps/api/src/app.ts` (`until`, yalnızca `VG_DEV_ENDPOINTS=1`), `tests/smoke/helpers.ts` (`produceVia(…, until?)`), `tests/smoke/stack.mjs` (`VG_ENCODE_PRESET: 'ultrafast'`), `tests/smoke/{s2-produce,s2b-build,s2c-draft}.spec.ts`, `tests/smoke/screens.spec.ts` (M4c ekranlarında `produceVia(…, 'draft_review')`), `packages/shared/test/pipeline.test.ts`, `apps/api/test/videos.test.ts`, `apps/worker/test/{build-step,draft-review-step}.test.ts`
- Test: `apps/worker/test/qc-step.test.ts`

**Interfaces:**
- Consumes: `probeQc` (T9), `evaluateQc`, `buildQcReport`, `qcFailures`, `QcReportSchema`, `RUBRIC_VERSION` (T1), `layoutIssues` (T5), `composeSource` (T8).
- Produces:
  - `qcExecutor(deps)`: `heavy_cpu`; artefakt `qc_report` (içerik `QcReport`, meta `{pass}`); kayıtlı rapor aynı hash'le varsa yeniden ölçmeden karar verir.
  - `decideQc(report, musicTitle) → StepOutcome`: geçerse `done` + "G1 ✓ G5 ✓ G6 ✓ · D6 x/12 · D7 y/5[ · <puan kaybettiren kontroller>][ · müzik defterinde izinli parça yok (bin/assets.mjs add)]"; kapı düşerse `needs_human` + "Otomatik kontrol geçmedi: …".
  - `IMPLEMENTED_STEPS = ['research','storyboard','build','draft_render','draft_review','final_render','compose','qc']`.
  - `PIPELINE_INCOMPLETE_NOTE('qc') = 'Final video hazır ve otomatik kontrolden geçti. İnceleme ve "yayına hazır" kararı M5b\'de.'`.
  - `POST /api/videos {…, until?: StepKey}` (yalnızca geliştirici uçları açıkken; plan `until`'de biter, ağırlıklar yeniden ölçeklenir).

- [ ] **Step 1: Başarısız testi yaz**

`apps/worker/test/qc-step.test.ts` (kurulum `compose-step.test.ts`'teki `setup()`/`framed()` ile aynı; `ctx` anahtarlarına `'compose' | 'qc'` eklenir; ortak kurulum `apps/worker/test/final-helpers.ts`'e taşınır ve iki dosya onu kullanır):

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QcReportSchema, producePlan } from '@videogen/shared';
import { createProduceRun, getRunView, getVideoView, insertArtifact, latestArtifact } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { composeExecutor, decideQc, qcExecutor } from '../src/pipeline/final-steps.ts';
import { Orchestrator, PIPELINE_INCOMPLETE_NOTE } from '../src/pipeline/orchestrator.ts';
import { pipelineExecutors } from '../src/pipeline/steps.ts';
import { finalHarness } from './final-helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

describe('qc step and the M5a plan', () => {
  it('measures both variants and records the report; the note carries gates and the D6/D7 scores', async () => {
    const h = finalHarness(t);
    const { r, ctx } = await h.composed('Tükenmez kalem');
    const ex = qcExecutor(h.deps);
    const out = await ex.run(ctx('qc'), await ex.inputHash(ctx('qc')));
    expect(out).toMatchObject({ status: 'done', note: expect.stringMatching(/^G1 ✓ G5 ✓ G6 ✓ · D6 \d+\/12 · D7 \d\/5/) });
    const rep = (await latestArtifact(t.pool, r.runId, 'qc_report'))!;
    expect(QcReportSchema.safeParse(rep.content).success).toBe(true);
    expect((rep.content as { tiktok: { id: string }[] }).tiktok.map((c) => c.id)).toContain('g1_color');
    await h.stop();
  }, 240_000);

  it('a failed gate stops the run for a human with the Turkish reason (layout text outside the safe area)', async () => {
    const h = finalHarness(t);
    const { r, ctx } = await h.composed('Kalem taşma');
    await insertArtifact(t.pool, { runId: r.runId, kind: 'layout', content: { width: 1080, height: 1920, fps: 30, frames: [{ frame: 90, boxes: [{ kind: 'beat', box: [24, 1480, 900, 1560] }] }] } });
    const ex = qcExecutor(h.deps);
    expect(await ex.run(ctx('qc'), await ex.inputHash(ctx('qc')))).toEqual({ status: 'needs_human', reason: 'Otomatik kontrol geçmedi: Güvenli alan: 1 kutu dışarıda (3,0 sn).' });
    expect(decideQc({ ...(await latestArtifact(t.pool, r.runId, 'qc_report'))!.content as never }, null)).toMatchObject({ status: 'needs_human' });
    await h.stop();
  }, 240_000);

  it('never checks a final made from an older scene (spec §8.3)', async () => {
    const h = finalHarness(t);
    const { r, ctx } = await h.composed('Kalem bayat qc');
    const scene = fx('scene-kalem');
    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene', content: { ...scene, camera_keys: scene.camera_keys.map((k: { lens_mm: number }, i: number) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 } : k)) } });
    const ex = qcExecutor(h.deps);
    expect(await ex.run(ctx('qc'), await ex.inputHash(ctx('qc')))).toEqual({ status: 'failed', error: 'final video güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    await h.stop();
  }, 240_000);

  it('end to end (orchestrator, fake drivers): produce → … → qc; the video waits for M5b with the qc note; frames are deleted; progress is monotone', async () => {
    const h = finalHarness(t);
    expect(producePlan('silent').map((s) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render', 'draft_review', 'final_render', 'compose', 'qc']);
    const o = new Orchestrator({ pool: t.pool, dataDir: h.dataDir, executors: pipelineExecutors(h.deps), tickMs: 20, retryDelayMs: 10, waitDelayMs: 40, timeTickMs: 30 });
    o.start();
    const run = await createProduceRun(t.pool, { productName: 'Tükenmez kalem uçtan uca', audioMode: 'silent', plan: producePlan('silent') });
    await o.startRun(run.runId);
    await vi.waitFor(async () => expect((await getRunView(t.pool, run.runId))!.status).toBe('done'), { timeout: 200_000, interval: 500 });
    o.stop();
    expect(await getVideoView(t.pool, run.videoId)).toMatchObject({ status: 'needs_human', statusNote: PIPELINE_INCOMPLETE_NOTE('qc') });
    expect(PIPELINE_INCOMPLETE_NOTE('qc')).toBe('Final video hazır ve otomatik kontrolden geçti. İnceleme ve "yayına hazır" kararı M5b\'de.');
    const steps = (await getRunView(t.pool, run.runId))!.steps;
    expect(steps.map((s) => [s.key, s.status])).toEqual(steps.map((s) => [s.key, 'done']));
    expect((await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'frames.deleted' AND run_id = $1", [run.runId])).rows[0].n).toBe(1);
    const series = (await t.pool.query("SELECT payload FROM ui_events WHERE topic = 'runs' AND type = 'run.updated' AND payload->>'id' = $1 ORDER BY id", [run.runId])).rows.map((x) => x.payload.progress as number);
    expect(series).toEqual([...series].sort((a, b) => a - b));
    await h.stop();
  }, 240_000);
});
```

`apps/worker/test/final-helpers.ts` (T8'deki `setup()`/`framed()`'ın ortak hali; `compose-step.test.ts` de bunu kullanacak şekilde güncellenir):

```ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';
import type pg from 'pg';
import { producePlan, type StepKey } from '@videogen/shared';
import { createProduceRun, insertArtifact, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore } from '@videogen/claude';
import { SessionManager } from '../src/agents/manager.ts';
import { composeExecutor, finalRenderExecutor } from '../src/pipeline/final-steps.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { ResourceLocks } from '../src/render/locks.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8'));

/** Fake Claude + fake render, real ffmpeg (delivery encode ultrafast), for the final steps' tests. */
export function finalHarness(t: { pool: pg.Pool }) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-final-h-'));
  const scene: SceneDeps = { pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10, encodePreset: 'ultrafast' };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver: new FakeClaudeDriver({ speed: 0 }), pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30,
    validator: ARTIFACT_VALIDATOR, memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene };
  async function run(name: string, through: StepKey[]) {
    const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
    const runDir = join(dataDir, 'runs', r.runId);
    const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
    for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
      await store.write(kind, fx(f));
      await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
    }
    const steps = await listRunSteps(t.pool, r.runId);
    const ctx = (key: StepKey): StepContext => ({
      runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt: 1, round: 0, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent',
      versionId: r.versionId, runDir, signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
    });
    const ex = { build: buildExecutor(deps), final_render: finalRenderExecutor(deps), compose: composeExecutor(deps) } as const;
    for (const k of through) { const e = ex[k as keyof typeof ex]; expect(await e.run(ctx(k), await e.inputHash(ctx(k)))).toMatchObject({ status: 'done' }); }
    return { r, ctx, runDir };
  }
  return {
    dataDir, deps,
    framed: (name: string) => run(name, ['build', 'final_render']),
    composed: (name: string) => run(name, ['build', 'final_render', 'compose']),
    stop: () => manager.stop(),
  };
}
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run apps/worker/test/qc-step.test.ts`
Expected: FAIL — `qcExecutor` export'u yok.

- [ ] **Step 3: Uygula**

`apps/worker/src/pipeline/final-steps.ts`'e:

```ts
import { buildQcReport, evaluateQc, QC_CHECKS, qcFailures, QcReportSchema, RUBRIC_VERSION, type QcReport } from '@videogen/shared';
import { layoutIssues, type LayoutManifest } from '@videogen/remotion/layout';
import { probeQc } from '../render/qc.ts';
import type { StepOutcome } from './types.ts';

/** Plan E15: gates decide (needs_human until the fixer of M5b); the D6/D7 checks that cost points go into the note. */
export function decideQc(r: QcReport, musicTitle: string | null): StepOutcome {
  if (!r.pass) return { status: 'needs_human', reason: `Otomatik kontrol geçmedi: ${qcFailures(r).join('; ')}.` };
  const soft = r.music.filter((c) => !c.pass && QC_CHECKS[c.id].points > 0).map((c) => `${QC_CHECKS[c.id].label_tr} ${c.value}`);
  return {
    status: 'done',
    note: `G1 ✓ G5 ✓ G6 ✓ · D6 ${r.scores.D6}/12 · D7 ${r.scores.D7}/5${soft.length ? ` · ${soft.join(', ')}` : ''}${musicTitle ? '' : ' · müzik defterinde izinli parça yok (bin/assets.mjs add)'}`,
  };
}

/** Spec §7.1 step 9 / §8.2 AUTO + MANIFEST: qc_probe on both variants, layout.json for G6, the report and the decision. heavy_cpu. */
export function qcExecutor(deps: StepDeps): StepExecutor {
  return {
    key: 'qc',
    resource: 'heavy_cpu',
    async inputHash(ctx) {
      const [m, t] = await Promise.all(['final_video_music', 'final_video_tiktok'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
      return sha({ step: 'qc', music: m?.blobSha ?? null, tiktok: t?.blobSha ?? null, rubric: RUBRIC_VERSION });
    },
    async run(ctx, hash) {
      const scene = deps.scene;
      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
      const [music, tiktok, cover, layout] = await Promise.all(['final_video_music', 'final_video_tiktok', 'final_cover', 'layout'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
      if (!music?.blobSha || !tiktok?.blobSha) return { status: 'failed', error: 'denetlenecek final video yok', retry: false };
      const src = await composeSource(deps, ctx.runId, ctx.videoId);
      if (!src || 'error' in src || src.framesHash !== src.currentFramesHash || music.inputHash !== src.hash) return { status: 'failed', error: 'final video güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false };
      const musicTitle = (music.meta as { music?: string | null } | null)?.music ?? null;
      const stored = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'qc_report', inputHash: hash });
      const replay = stored ? QcReportSchema.safeParse(stored.content) : null;
      if (replay?.success) return decideQc(replay.data, musicTitle);
      const file = async (s: string) => join(deps.dataDir, (await getBlob(deps.pool, s))!.path);
      ctx.status('running', 'ölçülüyor: görüntü ve ses');
      const m = await probeQc(scene.ffmpeg, await file(music.blobSha), { signal: ctx.signal });
      ctx.progress(60, 'deterministic');
      const t = await probeQc(scene.ffmpeg, await file(tiktok.blobSha), { video: false, signal: ctx.signal });
      ctx.status('running', null);
      const issues = layout ? layoutIssues(layout.content as LayoutManifest) : null;
      const report = buildQcReport(evaluateQc(m, { variant: 'music', layoutIssues: issues, coverOk: !!cover?.blobSha }), evaluateQc(t, { variant: 'tiktok' }));
      const dir = join(ctx.runDir, 'final', 'qc', hash.slice(0, 16));
      await mkdir(dir, { recursive: true });
      const qcFile = join(dir, 'qc.json');
      await writeFile(qcFile, JSON.stringify({ report, measure: { music: m, tiktok: t } }, null, 2));
      await record(deps, ctx, { kind: 'qc_report', file: qcFile, content: report, inputHash: hash, meta: { pass: report.pass } });
      return decideQc(report, musicTitle);
    },
  };
}
```

`steps.ts` `pipelineExecutors`: `final_render: finalRenderExecutor(deps), compose: composeExecutor(deps), qc: qcExecutor(deps)` (import `./final-steps.ts`; `final-steps.ts` `steps.ts`'ten yalnızca `sha`, `record`, `StepDeps` alır: döngüsel import tip + fonksiyon düzeyinde güvenli, çünkü kullanım çağrı anında).

`packages/shared/src/pipeline.ts`:

```ts
/** Steps with an executor in this build. M4a: research → storyboard; M4b: + build; M4c: + draft_render, draft_review; M5a: + final_render, compose, qc. */
export const IMPLEMENTED_STEPS: readonly StepKey[] = ['research', 'storyboard', 'build', 'draft_render', 'draft_review', 'final_render', 'compose', 'qc'];
```

`orchestrator.ts`:

```ts
const NOT_YET: Partial<Record<StepKey, string>> = {
  research: 'Storyboard, sahne kurulumu ve taslak render bu sürümde henüz yok.',
  storyboard: 'Sahne kurulumu ve taslak render bu sürümde henüz yok.',
  build: 'Taslak render bu sürümde henüz yok.',
  draft_render: 'Taslak incelemesi bu sürümde henüz yok.',
  final_render: 'Birleştirme ve otomatik kontrol bu sürümde henüz yok.',
  compose: 'Otomatik kontrol bu sürümde henüz yok.',
};
/** M5a ends with the automatic gates (K13: "yayına hazır" needs the M5b review); a dev run may end at the draft review. */
const DONE_NOTE: Partial<Record<StepKey, string>> = {
  draft_review: 'Taslak hazır ve incelendi. Final render bu sürümde henüz yok.',
  qc: 'Final video hazır ve otomatik kontrolden geçti. İnceleme ve "yayına hazır" kararı M5b\'de.',
};
```

`apps/api/src/routes/videos.ts`:

```ts
const Produce = z.object({
  productName: z.string().trim().min(2, 'ürün adı en az 2 karakter olmalı').max(80, 'ürün adı en çok 80 karakter olabilir')
    .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'ürün adında kontrol karakteri olamaz'),
  audioMode: z.enum(AUDIO_MODES, { error: 'ses modu vo ya da silent olmalı' }),
  /** Dev only (VG_DEV_ENDPOINTS=1): end the plan at this step (smoke scenarios of earlier milestones). */
  until: z.enum(STEP_KEYS).optional(),
});

export function registerVideoRoutes(app: FastifyInstance, deps: { pool: pg.Pool; devEndpoints?: boolean }): void {
  const { pool } = deps;
  const id = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.post('/api/videos', async (req, reply) => {
    const b = Produce.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: b.error.issues[0]?.message ?? 'geçersiz istek' });
    if (b.data.until && !deps.devEndpoints) return reply.code(400).send({ error: 'until yalnızca geliştirici kipinde' });
    const upTo = b.data.until && IMPLEMENTED_STEPS.includes(b.data.until) ? IMPLEMENTED_STEPS.slice(0, IMPLEMENTED_STEPS.indexOf(b.data.until) + 1) : IMPLEMENTED_STEPS;
    const created = await createProduceRun(pool, { productName: b.data.productName, audioMode: b.data.audioMode, plan: producePlan(b.data.audioMode, upTo) });
    await publishRunAndVideo(pool, created.runId);
    await sendCommand(pool, { type: 'run.start', runId: created.runId });
    return reply.code(202).send({ videoId: created.videoId, runId: created.runId });
  });
```

(Dosyanın geri kalanı değişmez.) (import: `IMPLEMENTED_STEPS, STEP_KEYS`; `apps/api/src/app.ts:69` `registerVideoRoutes(app, { pool: deps.pool, devEndpoints: deps.config.devEndpoints })`, `registerRoleRoutes` gibi.)

`tests/smoke/helpers.ts`: `produceVia(request, productName, audioMode, until?: string)` → `data: { productName, audioMode, ...(until ? { until } : {}) }`.

Smoke güncellemeleri:
- `stack.mjs` env'ine `VG_ENCODE_PRESET: 'ultrafast'` (teslim kodlaması smoke'ta saniyeler sürer; plan E17).
- `s2b-build.spec.ts`, `s2c-draft.spec.ts` ve `screens.spec.ts`'in M4c ekranları: her `produceVia(request, ad, 'silent')` çağrısı `produceVia(request, ad, 'silent', 'draft_review')` olur (konuları taslak; M4 notlarını korurlar).
- `s2-produce.spec.ts` S2a (arayüzden "Üret", tam plan): `needs_human` beklemesi 120 sn, test 180 sn; beklenen not `'Final video hazır ve otomatik kontrolden geçti.'`; diğer S2a senaryoları (`İmkansız…`, `Zımba`) değişmez.

Mevcut birim testleri:
- `packages/shared/test/pipeline.test.ts`: `producePlan('silent')` anahtarları 8 adım; ağırlıklar `STEP_WEIGHTS`'ten yeniden ölçeklenmiş (toplam 100).
- `apps/api/test/videos.test.ts`: plan anahtarları; `until` dev kapalıyken 400, açıkken plan `draft_review`'da biter.
- `apps/worker/test/build-step.test.ts`, `draft-review-step.test.ts` uçtan uca testleri: `producePlan('silent', M4_STEPS)` (`const M4_STEPS = IMPLEMENTED_STEPS.slice(0, 5)`): konuları taslak döngüsüdür; notları M4 notu kalır.

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/qc-step.test.ts apps/worker/test/compose-step.test.ts && npm run typecheck && npm test`
Expected: `4 passed` + `3 passed`; tam paket `Tests  351 passed (351)` (`videos.test.ts`'e eklenen `until` assert'leri mevcut `it` içinde). Tam paket süresini ledger'a yaz.

Run: `npm run test:smoke`
Expected: `17 passed`, `9 skipped`; süre ledger'a (S2a artık finale kadar koşar).

- [ ] **Step 5: Commit** — `feat(pipeline): qc step and the M5a plan through final_render, compose and qc; dev-only plan end for older smoke scenarios`

---
### Task 11: Stüdyo "Final" sekmesi (müzikli / müziksiz), otomatik kontrol kartı, kütüphanede final kapağı ve süresi, smoke S2 final

Arayüz işi `frontend-design:frontend-design` yüklü yapılır (skill yoksa M4c'nin tasarım dili: `rounded-card`, `border-line/60`, `bg-paper`, `shadow-subtle`; çipler `rounded-full`; seçili sekme/çip teal). Görünür her değişiklikten sonra ekran alınır ve Read ile incelenir; kötü görünürse düzeltilir ve `Ruling:` yazılır.

**Files:**
- Create: `apps/web/src/components/production/QcCard.tsx`, `tests/smoke/s2d-final.spec.ts`
- Modify:
  - `packages/shared/src/pipeline.ts` (`VideoFinal`, `VideoView.final`), `packages/db/src/pipeline.ts` (`VIDEO_SQL` final LATERAL'ları aynı `input_hash` ile eşlenir, `toVideo`);
  - `apps/web/src/lib/production-view.ts` (`FinalPick`, `pickFinal`, `playerTabs`, `qcLines`);
  - `apps/web/src/components/production/DraftTabs.tsx` ("Final" sekmesi + varyant çipi), `ProductionPanel.tsx` (`final`, `QcCard`), `apps/web/src/routes/Library.tsx` (kapak/süre önce finalden);
  - `tests/smoke/stack.mjs` (CC0 test müziği kaydı), `tests/smoke/screens.spec.ts` (M5a ekranları).
- Test: `apps/web/test/final-view.test.ts`, `packages/db/test/video-final.test.ts`

**Interfaces:**
- Produces:
  - `VideoFinal { musicSha; tiktokSha; coverSha; durationS }`, `VideoView.final: VideoFinal | null` (en yeni müzikli final + aynı `input_hash`'li müziksiz varyant ve kapak).
  - `FinalPick { musicSha; tiktokSha; coverSha; qcId }`, `pickFinal(list, runId)`; `playerTabs({final, draft}) → {tabs: ['final'|'mp4'|'live', string][]; initial}`; `qcLines(report) → { gates: string; scores: string; failures: string[] }`.
  - `QcCard({artifactId})` (`data-testid="qc-card"`, `aria-label="Otomatik kontrol"`); oynatıcıda `data-testid="final-video"`, `"variant-chip"` (`aria-pressed`).

- [ ] **Step 1: Başarısız testleri yaz**

`apps/web/test/final-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildQcReport, evaluateQc, type ArtifactMeta, type QcMeasure } from '@videogen/shared/browser';
import { pickFinal, playerTabs, qcLines } from '../src/lib/production-view.ts';

const a = (kind: string, runId: string, i: number): ArtifactMeta => ({ id: `${kind}-${runId}-${i}`, runId, stepId: null, versionId: null, kind, blobSha: `${kind}-sha-${i}`, createdAt: '' });

describe('final player and QC card helpers', () => {
  it('picks the run\'s newest final variants, cover and QC report', () => {
    const list = [a('final_video_music', 'r1', 2), a('final_video_tiktok', 'r1', 2), a('final_cover', 'r1', 2), a('qc_report', 'r1', 1), a('final_video_music', 'r0', 1)];
    expect(pickFinal(list, 'r1')).toEqual({ musicSha: 'final_video_music-sha-2', tiktokSha: 'final_video_tiktok-sha-2', coverSha: 'final_cover-sha-2', qcId: 'qc_report-r1-1' });
    expect(pickFinal([], 'r1').musicSha).toBeNull();
  });

  it('opens on "Final" when a final exists, otherwise on the draft MP4; no tabs without media', () => {
    expect(playerTabs({ final: true, draft: true })).toEqual({ tabs: [['final', 'Final'], ['mp4', 'Taslak MP4'], ['live', 'Taslak']], initial: 'final' });
    expect(playerTabs({ final: false, draft: true })).toEqual({ tabs: [['mp4', 'Taslak MP4'], ['live', 'Taslak']], initial: 'mp4' });
    expect(playerTabs({ final: false, draft: false }).tabs).toEqual([]);
  });

  it('words a QC report for the card: gates, scores and every failed check with its value and limit', () => {
    const m: QcMeasure = {
      video: { codec: 'h264', profile: 'High', width: 1080, height: 1920, fps: '30/1', pixFmt: 'yuv420p', colorRange: 'tv', colorSpace: 'bt709', colorPrimaries: 'bt709', colorTransfer: 'bt709', frames: 1351, durationS: 45.03, bitrateKbps: 1200, maxGopFrames: 60, faststart: true },
      audio: { codec: 'aac', sampleRate: 48000 }, bytes: 8e6, loudness: { i: -14.1, tp: -1.5, lra: 5 }, firstAudioS: 0, silences: [{ start: 12, end: 13.3 }], blacks: [], freezes: [], flashMaxPerS: 0, flashAt: null, loopSsim: 0.95, edgeBands: { maxDensity: 0, at: null },
    };
    const rep = buildQcReport(evaluateQc(m, { variant: 'music', layoutIssues: [], coverOk: true }), evaluateQc(m, { variant: 'tiktok' }));
    expect(qcLines(rep)).toEqual({
      gates: 'Teslim ✓ · Güvenlik ✓ · Güvenli alan ✓',
      scores: 'Ses 9/12 · Teknik cila 4/5',
      failures: ['Sessizlik: 1,3 sn (≤ 0,3 sn) · 0:12', 'Bit hızı: 1,2 Mbps (3–11 Mbps)'],
    });
  });
});
```

`packages/db/test/video-final.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, getVideoView, insertArtifact, insertBlob } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('VideoView.final', () => {
  it('pairs the newest music variant with the TikTok variant and cover of the same compose (same input hash)', async () => {
    const r = await createProduceRun(t.pool, { productName: 'Kalem final', audioMode: 'silent', plan: [{ key: 'research', weight: 100 }] });
    expect((await getVideoView(t.pool, r.videoId))!.final).toBeNull();
    const add = async (c: string, kind: string, hash: string, ms?: number) => {
      const sha = c.repeat(64);
      await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
      await insertArtifact(t.pool, { runId: r.runId, kind, blobSha: sha, inputHash: hash, ...(ms ? { durationMs: ms, width: 1080, height: 1920, codec: 'h264' } : {}) });
    };
    await add('a', 'final_video_music', 'h1', 45_033);
    await add('b', 'final_video_tiktok', 'h1', 45_033);
    await add('c', 'final_cover', 'h1');
    await add('d', 'final_video_music', 'h2', 44_000);
    await add('e', 'final_cover', 'h1'); // a later cover of the older compose must not be paired with h2
    expect((await getVideoView(t.pool, r.videoId))!.final).toEqual({ musicSha: 'd'.repeat(64), tiktokSha: null, coverSha: null, durationS: 44 });
    await add('f', 'final_video_tiktok', 'h2', 44_000);
    await add('0', 'final_cover', 'h2');
    expect((await getVideoView(t.pool, r.videoId))!.final).toEqual({ musicSha: 'd'.repeat(64), tiktokSha: 'f'.repeat(64), coverSha: '0'.repeat(64), durationS: 44 });
  });
});
```

`tests/smoke/s2d-final.spec.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { produceVia, SMOKE_DIR } from './helpers.ts';

test('S2 (M5a): product → … → final → automatic gates; the final plays from the library in both variants; the QC card shows gates and scores', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { videoId, runId } = await produceVia(request, 'Tükenmez kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 200_000 });
  await expect(header).toContainText('Final video hazır ve otomatik kontrolden geçti.');
  await expect(page.locator('[data-testid="step"][data-key="final_render"]')).toContainText('1351 kare');
  await expect(page.locator('[data-testid="step"][data-key="compose"]')).toContainText('1080×1920 · 0:45');
  await expect(page.locator('[data-testid="step"][data-key="qc"]')).toContainText('G1 ✓ G5 ✓ G6 ✓');
  const qc = page.getByTestId('qc-card');
  await expect(qc).toContainText('Teslim ✓ · Güvenlik ✓ · Güvenli alan ✓');
  await expect(qc).toContainText('Ses');

  await page.getByRole('link', { name: 'Kütüphane' }).click();
  const item = page.getByTestId('library-item').filter({ hasText: 'Tükenmez kalem' }).first();
  await expect(item.getByTestId('library-duration')).toHaveText(' · 0:45');
  await expect.poll(() => item.getByTestId('library-cover').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(540);
  await item.click();
  const video = page.getByTestId('final-video');
  await expect(page.getByRole('tab', { name: 'Final', exact: true })).toHaveAttribute('aria-selected', 'true');
  const music = (await video.getAttribute('src'))!;
  const ranged = await request.get(music, { headers: { range: 'bytes=0-11' } });
  expect([ranged.status(), ranged.headers()['content-type']]).toEqual([206, 'video/mp4']);
  await page.locator('body').focus();
  await page.keyboard.press('Space');
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime), { timeout: 10_000 }).toBeGreaterThan(0.3);
  await page.getByTestId('variant-chip').filter({ hasText: 'Müziksiz' }).click();
  await expect(video).not.toHaveAttribute('src', music);

  // Plan E6: the PNG frames of a finished run are gone; the composed files stay.
  const final = join(SMOKE_DIR, 'data', 'runs', runId, 'final');
  expect(readdirSync(final).filter((d) => d !== 'compose' && d !== 'qc').every((h) => !existsSync(join(final, h, 'frames')))).toBe(true);
});

test('S2 (M5a): the Studio shows the final steps\' live progress and the library prefers the final over the draft', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { videoId } = await produceVia(request, 'Kalem final ilerleme', 'silent');
  await page.goto(`/?video=${videoId}`);
  await expect(page.locator('[data-testid="step"][data-key="compose"]')).toHaveAttribute('data-status', /running|done/, { timeout: 200_000 });
  const bar = page.getByTestId('video-header').getByRole('progressbar', { name: 'Genel ilerleme' });
  const before = Number(await bar.getAttribute('aria-valuenow'));
  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'needs_human', { timeout: 200_000 });
  expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(before);
  const v = (await (await request.get(`/api/videos/${videoId}`)).json()) as { video: { final: { coverSha: string } | null; draft: { coverSha: string } | null } };
  expect(v.video.final!.coverSha).not.toBe(v.video.draft!.coverSha);
});
```

- [ ] **Step 2: Testlerin düştüğünü gör**

Run: `npx vitest run apps/web/test/final-view.test.ts packages/db/test/video-final.test.ts`
Expected: FAIL — `pickFinal` export'u yok; `final` `undefined`.

- [ ] **Step 3: Uygula**

`packages/shared/src/pipeline.ts`:

```ts
/** The newest final of a video (spec §13.1 library, plan E18): the music variant with the TikTok variant and cover of the same compose. */
export interface VideoFinal { musicSha: string; tiktokSha: string | null; coverSha: string | null; durationS: number }
```

ve `VideoView`'a `final: VideoFinal | null;`.

`packages/db/src/pipeline.ts` `VIDEO_SQL`: SELECT listesine `fm.blob_sha AS final_sha, fm.duration_ms AS final_ms, ft.blob_sha AS tiktok_sha, fc.blob_sha AS final_cover_sha`; `dc` LATERAL'ından sonra:

```sql
  LEFT JOIN LATERAL (SELECT a.blob_sha, a.duration_ms, a.input_hash, a.run_id FROM artifacts a JOIN runs r ON r.id = a.run_id
    WHERE r.video_id = v.id AND a.kind = 'final_video_music' ORDER BY a.created_at DESC LIMIT 1) fm ON true
  LEFT JOIN LATERAL (SELECT a.blob_sha FROM artifacts a
    WHERE a.run_id = fm.run_id AND a.kind = 'final_video_tiktok' AND a.input_hash = fm.input_hash ORDER BY a.created_at DESC LIMIT 1) ft ON true
  LEFT JOIN LATERAL (SELECT a.blob_sha FROM artifacts a
    WHERE a.run_id = fm.run_id AND a.kind = 'final_cover' AND a.input_hash = fm.input_hash ORDER BY a.created_at DESC LIMIT 1) fc ON true
```

`toVideo`'ya: `final: r.final_sha ? { musicSha: r.final_sha, tiktokSha: r.tiktok_sha ?? null, coverSha: r.final_cover_sha ?? null, durationS: Math.round(Number(r.final_ms ?? 0) / 100) / 10 } : null,` (`final_ms` 44 000 → 44; 45 033 → 45).

`apps/web/src/lib/production-view.ts` sonuna:

```ts
/** The latest final artifacts of a run (spec §13.1 Final tab, plan E18). */
export interface FinalPick { musicSha: string | null; tiktokSha: string | null; coverSha: string | null; qcId: string | null }
export function pickFinal(list: ArtifactMeta[], runId: string | null): FinalPick {
  const find = (kind: string) => list.find((a) => a.kind === kind && (!runId || a.runId === runId)) ?? null;
  return { musicSha: find('final_video_music')?.blobSha ?? null, tiktokSha: find('final_video_tiktok')?.blobSha ?? null, coverSha: find('final_cover')?.blobSha ?? null, qcId: find('qc_report')?.id ?? null };
}

export type PlayerTab = 'final' | 'mp4' | 'live';
/** Final first when it exists (spec §13.1); the draft tabs stay (C26: the live draft only mounts when opened). */
export function playerTabs(o: { final: boolean; draft: boolean }): { tabs: [PlayerTab, string][]; initial: PlayerTab } {
  const tabs: [PlayerTab, string][] = [...(o.final ? [['final', 'Final'] as [PlayerTab, string]] : []), ...(o.draft ? [['mp4', 'Taslak MP4'], ['live', 'Taslak']] as [PlayerTab, string][] : [])];
  return { tabs, initial: o.final ? 'final' : 'mp4' };
}

/** The QC card's lines: gate marks, the D6/D7 scores, every failed check (value, limit, time). */
export function qcLines(r: QcReport): { gates: string; scores: string; failures: string[] } {
  const mark = (b: boolean) => (b ? '✓' : '✗');
  const failures = [...r.music, ...r.tiktok.filter((c) => !r.music.some((m) => m.id === c.id))]
    .filter((c) => !c.pass)
    .map((c) => `${QC_CHECKS[c.id].label_tr}: ${c.value} (${c.limit})${c.at !== undefined ? ` · ${formatClock(c.at)}` : ''}`);
  return {
    gates: `${GATES.G1.label_tr} ${mark(r.gates.G1)} · ${GATES.G5.label_tr} ${mark(r.gates.G5)} · ${GATES.G6.label_tr} ${mark(r.gates.G6)}`,
    scores: `${DIMENSIONS.D6.label_tr} ${r.scores.D6}/12 · ${DIMENSIONS.D7.label_tr} ${r.scores.D7}/5`,
    failures,
  };
}
```

(import: `DIMENSIONS, GATES, QC_CHECKS, type QcReport` `@videogen/shared/browser`'dan. Not: tekrar eden kimliklerden müzikli varyantınki gösterilir; `d8_loop` gibi puansız kontroller de listede olur — kullanıcı için bilgi.)

`apps/web/src/components/production/QcCard.tsx`:

```tsx
import type { QcReport } from '@videogen/shared/browser';
import { qcLines } from '../../lib/production-view.ts';
import { useContent } from './ArtifactCards.tsx';

const card = 'rounded-card border border-line/60 bg-paper px-4 py-3 shadow-subtle';

/** Spec §8.2 AUTO/MANIFEST result (plan E15): gates, the orchestrator's D6/D7 scores, failed checks with values. */
export function QcCard({ artifactId }: { artifactId: string | null }) {
  const { data: r } = useContent<QcReport>(artifactId);
  if (!r) return null;
  const l = qcLines(r);
  return (
    <section data-testid="qc-card" aria-label="Otomatik kontrol" className={card}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[14px] font-medium">Otomatik kontrol</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${r.pass ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>{r.pass ? 'geçti' : 'geçmedi'}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{l.gates}</p>
      <p className="text-[13px] tabular-nums text-ink-2">{l.scores}</p>
      {l.failures.length > 0 && (
        <ul aria-label="Kontrol bulguları" className="mt-2 flex flex-col gap-1 text-[12.5px] tabular-nums text-ink-2">
          {l.failures.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
    </section>
  );
}
```

(`ArtifactCards.tsx`'te `useContent` dışa aktarılır: `export function useContent…`. `bg-red/10 text-red` tema belirteçleri yoksa M4c'nin hata tonu sınıfları kullanılır; Global Constraints: kısık kırmızı yalnızca hata için.)

`apps/web/src/components/production/DraftTabs.tsx` değişiklikleri:
- `Mp4` bileşeni `testId` ve `poster` alır (`data-testid={testId}`), `useEffect` bağımlılığı `[sha]` kalır (varyant değişince yeni kaynak + oynatıcı kaydı).
- Bileşen imzası `DraftTabs({ pick, final }: { pick: DraftPick; final: FinalPick })`; sekmeler `playerTabs({ final: !!final.musicSha, draft: !!pick.videoSha })`; `useState(initial)`.
- `tab === 'final'` paneli:

```tsx
function FinalPanel({ final }: { final: FinalPick }) {
  const [variant, setVariant] = useState<'music' | 'tiktok'>('music');
  const sha = variant === 'music' ? final.musicSha! : (final.tiktokSha ?? final.musicSha!);
  return (
    <div className="flex flex-col gap-2">
      <Mp4 key={sha} sha={sha} cover={final.coverSha} testId="final-video" />
      <div className="flex justify-center gap-1" aria-label="Varyant">
        {([['music', 'Müzikli'], ['tiktok', 'Müziksiz']] as const).map(([id, label]) => (
          <button key={id} type="button" data-testid="variant-chip" aria-pressed={variant === id} disabled={id === 'tiktok' && !final.tiktokSha} onClick={() => setVariant(id)}
            className={`rounded-full px-3 py-1 text-[12px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${variant === id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- `if (!pick.videoSha && !final.musicSha) return null;` (eskiden yalnızca taslak); `region "Taslak oynatıcı"` aria-label'ı "Oynatıcı" olur — **a11y sözleşmesi değişikliği**: mevcut smoke/ekran testlerinde `region "Taslak oynatıcı"` kullanılmıyor (yalnızca `data-testid="draft-tabs"`); yine de ad korunur ve final varken de "Taslak oynatıcı" kalır (sözleşme değişmez).

`ProductionPanel.tsx`: `const final = pickFinal(list, run?.id ?? null)` (`latest`'e ekle); `<DraftTabs key={`${latest.final.musicSha ?? ''}${latest.draft.videoSha ?? 'none'}`} pick={latest.draft} final={latest.final} />`; `ReviewCard`'dan sonra `<QcCard artifactId={latest.final.qcId} />`.

`Library.tsx`: kapak `const cover = v.final?.coverSha ?? v.draft?.coverSha`, süre `const len = v.final?.durationS ?? v.draft?.durationS`; test kimlikleri aynı.

`tests/smoke/stack.mjs` (`VG_ENCODE_PRESET` T10'da eklendi); migration'dan sonra:

```js
// M5a: an allowed CC0 test bed in the asset ledger (plan E17), so the smoke final has music.
const bed = join(SMOKE_DIR, 'bed.wav');
run(env.VG_FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=20:c=brown:r=48000:a=0.3:seed=5', '-ac', '2', bed]);
writeFileSync(join(SMOKE_DIR, 'bed.txt'), 'CC0 1.0 (VideoGen smoke test bed)');
run('node', ['bin/assets.mjs', 'add', '--kind', 'music', '--file', bed, '--title', 'Smoke yatağı', '--license', 'CC0-1.0', '--author', 'VideoGen', '--license-text', join(SMOKE_DIR, 'bed.txt')], { env });
```

`tests/smoke/screens.spec.ts`'e yeni ekranlar (elle, `VG_SCREENSHOTS=1`):

```ts
test('M5a screen: studio final tab and the QC card', async ({ page, request }) => {
  test.setTimeout(240_000);
  const { videoId } = await produceVia(request, 'Tükenmez kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  await expect(page.getByTestId('qc-card')).toBeVisible({ timeout: 200_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot('studio-final.png', 'm5'), fullPage: true });
});

test('M5a screen: library with final covers', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByTestId('library-cover').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('library-final.png', 'm5') });
});
```

(`shot(name, dir)` `docs/<dir>/` altına yazar; `docs/m5/` yoksa oluşturur.)

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/web/test/final-view.test.ts packages/db/test/video-final.test.ts && npm run typecheck && npm test`
Expected: `4 passed`; tam paket `Tests  355 passed (355)`.

Run: `npm run build && npm run test:smoke`
Expected: `19 passed`, `11 skipped`; süre ledger'a (hedef < 3 dk; aşarsa en uzun senaryo ve neden `Ruling:`; senaryo kısaltılmaz).

Run: `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens -g M5a`
Expected: `2 passed`; `docs/m5/studio-final.png`, `docs/m5/library-final.png` Read ile incelenir: Final sekmesi seçili ve teal; varyant çipleri hizalı; QC kartında kapılar ✓ ve puanlar; kütüphanede final kapağı (9:16) ve "· 0:45".

- [ ] **Step 5: Commit** — `feat(web): Final tab with music/no-music variants, QC card, final covers in the library; smoke S2 through the final`

---
### Task 12: M5a kapanışı — tam doğrulama, ilk gerçek ürün finale kadar (K12, M4'ten devir), pilot kalibrasyonu, son review, rapor, `main`

**Files:**
- Create: `docs/m5/m5a-summary.md`, `docs/m5/real-check.md`, `docs/m5/real-final-sheet.png`, `docs/m5/real-studio-m5a.png`
- Modify: `docs/m4/real-check.md` (M4c §4: bekleyen ölçüm bu koşudan), `docs/superpowers/checklist.md` (M4 kalan maddeler + M5 bölümü + karar tablosu), `docs/superpowers/runbook.md` (§1, §2, §6, §7), `docs/superpowers/plans/2026-10-06-videogen-roadmap.md`, `README.md`, `docs/superpowers/specs/2026-10-06-videogen-design.md` (yalnızca kanıtla: §6.2 notu, §7.4 `layout.json`, §7.5 E8, §7.6 E10–E12, §8.1 E2–E4, §8.3 kalibrasyon sonucu, §9 varlık defteri, §11.1 `assets`, §13.1 Final sekmesi, §16.2 S2 M5a biçimi, §18 video başına kullanım)

**Interfaces:** Yok.

- [ ] **Step 1: Tam doğrulama (GPU'lu makinede)**

Run: `npm run typecheck && npm test && npm run test:blender && npm run test:render && npm run test:smoke`
Expected: `npm test` 355; `test:blender` `Ran 19 tests … OK`; `test:render` `10 passed`; smoke `19 passed`, `11 skipped`. Sonrasında `/tmp/videogen-smoke`, `~/.vg-render-test-*` yok; 5173/5180/5190 boş; `render-cli`, `blender`, `chrome-for-testing` süreci yok.

- [ ] **Step 2: Kalem pilotu kalibrasyonu (spec §8.3)**

```bash
node --import tsx apps/worker/src/render/qc-cli.ts ~/icinde-ne-var/pilot-kalem/remotion/out/icinde-ne-var-kalem.mp4 > /tmp/pilot-qc.json; echo "çıkış $?"
grep '^✗' /tmp/pilot-qc.json || true
```

Expected: çıkış 3; `✗` satırları en az şu 7 kimliği içerir: `d6_loudness` (−23,4), `d6_lra` (20,6), `d6_first_audio` (0,79), `d6_silence`, `d3_freeze`, `g1_color`, `g6_edges`. Biri eksikse rubrik hatalıdır (spec §8.3): eşiği **gerekçeyle** ayarla (`QC_LIMITS`), `RUBRIC_VERSION`'ı `final@2` yap, T1/T9 testlerini güncelle, `Ruling:` yaz. Ölçülen değerleri `docs/m5/real-check.md` §1'e yaz.

- [ ] **Step 3: İlk gerçek ürün — finale kadar tek koşu (K12, geçici DB)**

M4c raporu §4 ve `docs/m4/real-check.md` M4c §3'teki tarif; farkları:
- veritabanı `videogen_m5a_check`, klasör `/tmp/videogen-m5a-check`;
- plan `producePlan('silent')` (8 adım: finale ve qc'ye kadar);
- müzik: koşudan önce bir izinli müzik eklenir (`node bin/assets.mjs add --kind music … --license CC0-1.0 …`, kullanıcının kendi CC0/Pixabay parçası; yoksa koşu müziksiz yapılır ve rapora yazılır);
- bekleme döngüsü 4 sa (1440 × 10 sn);
- kayıt: rol başına tur/token/maliyet eşdeğeri/süre; taslak turları ve kararları; `final_render` süresi (`render.final` audit'i) ve örnek sayısı; `compose` süresi; qc raporu; **video başına kullanım** (toplam token, oturum, `fiveHourDelta`, toplam süre) → `docs/m5/real-check.md` §2 ve `docs/m4/real-check.md` M4c §4 (M4 çıkış maddesi).
- `docs/m5/real-final-sheet.png`: final müzikli varyanttan 12 karelik kontakt sayfası (`contactSheet`), `docs/m5/real-studio-m5a.png`: Stüdyo ekranı.

Kapı: başlama koşulu 5 sa < %25 ve 7 gün < %70; koşuda 5 sa > %80 → iptal; `failed` olursa tekrar yok, hata ve son artefaktlar rapora.

Gözle inceleme (M5b kalibrasyonuna girdi): kahraman 0. karede; metaller (EEVEE + AgX); etiket çizgileri doğru parçaya; SFX zamanlaması; müzik seviyesi; LUFS ölçümü.

- [ ] **Step 4: Son review (tek bağımsız reviewer)**

Tek bir `general-purpose` alt ajan, model `fable`, salt okunur; girdiler: `git diff main...HEAD`, bu plan, spec, Review Focus (aynen), ledger `Ruling:` satırları, `docs/m5/real-check.md`. Özellikle: final render devamı ve çökme yeniden denemesi; kare temizliği yarışı (iptal + çalışan render); jetonlu kare sunucusunun sızıntı yüzeyi; lisans kapısının atlanabileceği yollar; qc ayrıştırıcılarının ffmpeg sürümüne bağımlılığı; ses planının sınır durumları. Critical/Important → RED→GREEN + `--fixup`; Minor → `docs/m5/m5a-summary.md` "Ertelenenler".

- [ ] **Step 5: Autosquash, rapor, dokümanlar**

```bash
BEFORE=$(git rev-parse HEAD^{tree})
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash --autostash $(git merge-base main HEAD)
[ "$BEFORE" = "$(git rev-parse HEAD^{tree})" ] && echo "AĞAÇ AYNI"
```

Bir fixup çakışırsa: `git rebase --abort`, düzeltmeyi dayandığı kodun girdiği görev commit'ine taşı, `Ruling:` yaz (M4c'de T7 fixup'ı T8 koduna dokunduğu için böyle oldu).

`docs/m5/m5a-summary.md` (Türkçe, M4b özeti biçiminde): başlık tablosu; §1 ne çalışıyor; §2 görevler (commit, test plan → gerçek); §3 doğrulama (komut çıktıları); §4 pilot kalibrasyonu; §5 gerçek ürün ve video başına kullanım; §6 ekranlar; §7 sapmalar (`Ruling:`); §8 son review; §9 ertelenenler; §10 M5b için notlar (reviewer'lara giden otomatik ölçümler, D6 alt puanları, fixer kapsamları ve kare temizliğinin `finalize`'a taşınması, prosedürel SFX'in kalitesi, müzik kürasyonu); §11 bilinen sınırlar.

Checklist: M5 maddelerinden "Blender final render", "compose…", "İçerik adresli medya deposu, kare temizliği, disk muhafızı", "qc_probe otomatik kapıları", "Kalibrasyon: rubrik kalem pilotunun 7 hatasını yakalıyor" (Step 2 geçtiyse) işaretlenir (`· commit <hash> · <tarih> · M5a`); M4'ün "Video başına kullanım" ve "ilk gerçek ürün" maddeleri Step 3 sonucuyla kapanır. Karar tablosu: M5 bölme (E1), rubrik modülü (E2), LRA eşiği (E4), kare temizliği (E6), kodlama zinciri (E8), müzik yoksa davranış (E11), pilot kalibrasyonu, gerçek doğrulama, son review, `main`'e birleştirme.

Runbook §6: final ve varyantlar, `bin/assets.mjs`, `VG_ENCODE_PRESET`, `qc-cli`; §7: "final render iki kez çöktü", "final kareler güncel sahneyle uyuşmuyor", "eksik final kare", "final video doğrulamadan geçmedi", "Otomatik kontrol geçmedi: …", "müzik defterinde izinli parça yok", "lisans kapısı: …", "taslak render Chrome hatasıyla iki kez düştü" (M4c metni değişti).

```bash
git add docs README.md
git commit -m "docs(m5a): M5a summary, pilot calibration, first real product through the final, checklist, runbook, roadmap and spec notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: `main`'e birleştirme**

```bash
git switch main && git pull --ff-only
git merge --no-ff m5a-final-render-qc -m "merge: M5a final render, sound and automatic quality gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run typecheck && npm test && git push origin main
```

Expected: çakışmasız; `Tests  355 passed`. Rapordaki hash'ler birleştirme sonrası değerlerle düzeltilir (ayrı `docs` commit'i).

- [ ] **Step 7: Kullanıcıya Türkçe rapor** — Maddeler / Doğrulama / Bilmen gerekenler; "Rulings I made", "Deferred minors"; pilot kalibrasyonu; video başına kullanım; açık kararlar (K17, K19, müzik kürasyonu); M5b planını önerip dur.

---
## Self-review notları (plan yazarı)

**1. Spec kapsamı (M5a payı, §17 M5 satırı ve checklist M5 maddeleri):**

| Spec / checklist maddesi | Görev | Durum |
|---|---|---|
| §7.1 adım 7 `final_render` (EEVEE 64, RGBA PNG, `Fra:` yerine kare sayısı ilerlemesi, NVIDIA doğrulaması) | T3, T4 | Var. `Fra:` satırı yerine kendi `VG_PROGRESS`'imiz (kare başına, devam edenler dahil) — aynı bilgi, test edilebilir |
| §14 GPU belleği yetmedi → düşük ayarla bir kez | T4 (`retryFinal` 32 örnek), T6 (Remotion concurrency 2→1, M4c'den) | Var |
| §7.1 adım 8 `compose` (kareler + Remotion katmanı → sessiz video; SFX cue'ları; mastering; iki varyant) | T5–T8 | Var (seslendirmesiz). VO miksajı ve ducking M5c |
| §7.4 `layout.json` | T5 (üretim), T8 (kayıt), T10 (G6) | Var. `provenance.json` M5c/M6'ya kaldı (varlık listesi `audio_plan`'da) |
| §7.5 kodlama (High, CRF 16–18, slow, GOP ≤ 2 sn, faststart, AAC 48 kHz; yuvj/pc red) | T7 (`encodeDelivery`, `muxVariant`), T8 (ffprobe reddi) | Var; E8 iki aşamalı zincir spec notu |
| §7.6 SFX (events → cue, ±1 kare, 10 sn'de ≤ 3), mastering (−14 / −1, ebur128 doğrulaması), varyantlar, disk (kareler terminalde silinir) | T7, T8, T4 (temizlik), T9 (ölçüm) | Var. "±1 kare": cue zamanı kare/fps'ten ms'ye yuvarlanır (≤ 17 ms) |
| §8.1 rubrik sürümlü; §8.2 AUTO + MANIFEST sırası ve boyut sahipliği | T1, T9, T10 | Var (`final@1`); VISION/WEB/Retention M5b |
| §8.3 kalibrasyon (pilot 7 hata) | T1 (saf), T9 (sentetik klip), T12 Step 2 (gerçek pilot) | Var. Gerçek pilot dosyası repoda değil; GPU'lu makinede |
| §8.3 bayat artefakt | T4/T8/T10 hash'leri ve kontrolleri (E16) | Var |
| §9 SFX/müzik/lisans kapısı, atıf | T2, T7 | Var. "CC-BY atıfları açıklama metnine otomatik eklenir" → açıklama metni M6'da; atıf `audio_plan`'da saklanır |
| §11.1 `assets` | T2 (0007) | Var. `claims`, `reviews/findings`, `publications` diğer planlarda |
| §11.3 içerik adresli depo | M4b'den (`putBlob`); final dosyaları oraya | Var |
| §13.1 Final sekmesi, kütüphane kapak/süre | T11 | Var. Karşılaştır sekmesi M7 |
| §16.2 S2 (M5a biçimi: final + otomatik kapılar) | T10 (S2a), T11 (S2d) | Var. "Yayına hazır" M5b |
| §17 M5 çıkışı "rubrik pilotun 7 hatasını yakalıyor" | T12 Step 2 | Bu planda kapanır |
| §17 M5 çıkışı "gerçek ürün yayına hazır" | — | M5b (bilinçli, E15) |
| M4 açık maddesi: ilk gerçek ürün + video başına kullanım | T12 Step 3 | Bu planda kapanır (tek koşu, finale kadar) |

**2. Yer tutucu taraması:** `TBD`, "benzer şekilde", "…" araması yapıldı. Kalan "…" yalnızca (a) komut satırı örneklerinde kullanıcı argümanı (`--file …`), (b) test adlarına atıfta, (c) Türkçe metin içinde. Üç yerde tam dosya yerine kesin talimat + kod parçası var (bilinçli; hunk'ları HEAD'e bağlamak kırılgan olurdu): T4 `driver.ts`/`orchestrator.ts` eklemeleri (yöntem gövdeleri tam), T6 `render-cli.ts` seçim bloğu (tam), T11 `DraftTabs.tsx` (`FinalPanel` tam, sekme seçimi `playerTabs` ile). Bunlar uygulayıcıya karar bırakmaz.

**3. Tip ve ad tutarlılığı (çapraz kontrol):**
- `QcMeasure`/`evaluateQc`/`buildQcReport`/`qcFailures` (T1) ↔ `probeQc` (T9) ↔ `qcExecutor`/`decideQc` (T10) ↔ `qcLines` (T11): alan adları aynı (`firstAudioS`, `edgeBands`, `flashMaxPerS`, `loopSsim`).
- `FinalFramesMeta.dir` run'a göre (`final/<hash16>/frames`) — T4 yazar, T8 `join(ctx.runDir, meta.dir)` ile okur, `removeRunFrames` aynı yapıyı siler.
- `SceneDeps.encodePreset` T8'de eklenir; T7 testleri `encodeDelivery`'ye doğrudan `preset` verir; T10 `finalHarness` `encodePreset: 'ultrafast'`.
- `record`, `sha`, `failure` T4'te `steps.ts`'ten dışa aktarılır; `final-steps.ts` ↔ `steps.ts` döngüsel import'u yalnızca çağrı anında kullanılan bağlar içerir (ESM'de güvenli).
- `FinalProps = DraftProps & {framesUrl}` (T5) ↔ `ComposeInput.props: Omit<FinalProps,'glbUrl'|'framesUrl'>` (T6) ↔ `composeSource.props` (T8).
- `LayoutIssue` (T1, shared) ↔ `layoutIssues()` (T5) ↔ `evaluateQc({layoutIssues})` (T1/T10).
- `SfxName` (T2) ↔ `planSfx`/`soundPlan` (T7) ↔ `ensureSfxLibrary` (T2) kayıt kimlikleri.
- `VideoView.final` (T11) yeni zorunlu alan: `toVideo` her zaman doldurur; web tarafındaki test yardımcıları (`production-view.test.ts` `video()` varsa) `final: null` alır — T11'de ilgili yardımcılar güncellenir.

**4. Review Focus eşlemesi:** 5 maddenin her biri en az bir teste bağlı (Review Focus bölümünde test adlarıyla).

**5. Sayılar:** `npm test` zinciri `it` blokları sayılarak düzeltildi (T7 5 test: 339 → 338; zincir 355'te aynı yere varır). `test:blender` +2 (T3), `test:render` +3 (T4 1, T6 2), smoke +2 geçen / +2 atlanan (T11).

**6. Bilinen riskler (uygulamada ölçülecek):**
- `npm test` süresi: T8/T9/T10'daki 1080p ultrafast kodlamalar paketi ~2–3 dk uzatır. Eşik: tam paket > 6 dk → bu üç dosyayı `test:render`'a taşı (`Ruling:`).
- Smoke süresi: S2a ve S2d finale kadar koşar; hedef < 3 dk aşılabilir. Senaryo kısaltılmaz; süre rapora.
- Remotion `<Img>` ile 1351 × ~3 MB PNG: final birleştirme süresi bilinmiyor (T6 30 kare ölçümü × 45 tahmin; T12 gerçek).
- `freezedetect n=0.001` yavaş CG hareketinde yanlış donma işaretleyebilir (puansız ölçüm; M5b kalibrasyonu).
- Prosedürel SFX'in kalitesi (slop riski): M5b reviewer'ı ve kullanıcı dinler. İçe aktarılan SFX'in eşlemeye girmesi M5b'de (Kapsam dışı tablosu); M5a'da tek kaynak prosedürel kütüphane.

## Plan inceleme geçmişi

| Tur | Kim | Bulgu | Sonuç |
|---|---|---|---|
| 1 | Yazar (self-review) | T1 pilot testinde `d6_true_peak` başarısız beklenmişti; pilotun −3,1 dBTP'si sınırı (≤ −1) geçer | Beklenen liste 7 kimliğe indirildi; D6 puanı 2 |
| 1 | Yazar | T4 testinde ESM'de `require` kullanılmıştı; `formatClock` kullanılmayan import | `readFileSync` import'u; import kaldırıldı |
| 1 | Yazar | T4 Blender int testi `tmpdir` altındaydı; sandbox ev klasörünü gizlediği için M4b gibi gerçek ev altında olmalı ve var olmayan yardımcılara (`buildPen`) dayanıyordu | Test kendi kurulumunu M4b desenine göre yapar; yardımcı taşıma yok |
| 1 | Yazar | T5 `wrapLines` beklentisi yanlıştı (3 satır) | Beklenen satırlar açıkça yazıldı |
| 1 | Yazar | Fake final'de gürültü: 1080p CRF 17'de dosya 64 MB'ı aşıp G1'i düşürebilir; sinüs hareketi tepe noktalarında yanlış donma üretir | Fake gürültüsüz, sabit hızla kayan geniş çubuk; `freezedetect n=0.001`; fake'te `d7_bitrate` düşüşü beklenen |
| 1 | Yazar | Pilot benzeri klipte sessiz bölümler −58 dBFS'te kalıp LRA ölçümünden göreli kapıyla düşüyordu (LRA küçük çıkardı) | Genlikler 0,02 / 0,2 (−44 / −24 dB) |
| 1 | Yazar | "taşan" fake tetiği gerçekleştirilemezdi (metin katmanı yapı gereği güvenli alanda) | Tetik kaldırıldı; kapı düşüşü yolu T10'da saplı `layout` ile; E17 ve RF4 güncellendi |
| 1 | Yazar | T10 plan değişikliği eski smoke senaryolarını (S2b/S2c, M4c ekranları) finale kadar koşturup notlarını bozardı; smoke'ta teslim kodlaması `slow` kalırdı | Geliştirici `until` seçeneği; `VG_ENCODE_PRESET` T10'a taşındı |
| 1 | Yazar | `registerVideoRoutes` `main.ts`'te değil `app.ts`'te çağrılıyor | Talimat düzeltildi |
| 1 | Yazar | T6 `render-cli`'ye yeni seçenekler M4c'nin sahte CLI fixture'ını bozar | Fixture güncellemesi Files'a eklendi |
| 1 | Yazar | Aynı ada iki SFX varlığı (prosedürel + içe aktarılan) olursa hangisinin çalınacağı açıktı | M5a'da yalnızca prosedürel kütüphane; içe aktarılanlar M5b (Kapsam dışı) |
| 1 | Yazar | `qc` bayatlık kontrolü yalnızca compose hash'ine bakarsa sahne değişikliğini kaçırır (props sahne lensinden etkilenmez) | `framesHash !== currentFramesHash` da kontrol edilir |
| — | Bağımsız inceleme | Yapılmadı (kullanıcı yalnızca self-review istedi) | Uygulamadan önce isteğe bağlı: tek `fable` reviewer, spec + gerçek kod karşısında |
