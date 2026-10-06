# M4c — Taslak, İnceleme ve Player (Remotion taslağı, taslak incelemesi ≤ 2 tur, GPU kapısı, kullanım kapısı, player, S2, ilk gerçek ürün, M4 kapanışı) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build'i biten bir üründe pipeline iki adım daha koşsun:
- **`draft_render`:** Three.js-in-Remotion taslak MP4'ü (540×960, h264, yuv420p, bt709) ve kapağı üretir. GPU kilidi ve §6.4 kapısından geçer; çocuk süreçte çalışır ve ffprobe ile doğrulanır.
- **`draft_review`:** reviewer_visual taslağı 12 karelik kontakt sayfası ve en çok 12 tek kareyle (`extract_frames`) inceler. Karar deterministiktir: en çok 2 kez build'e geri gönderir, sonra "insan gerekli".

Stüdyo taslağı iki sekmede oynatsın: "Taslak" (`@remotion/player`) ve "Taslak MP4" (HTML5 + HTTP Range). Kütüphane kapak ve süre göstersin; Space, J/K/L ve N kısayolları çalışsın. Run başlatma kullanım kapısına uysun. Smoke S2 taslakla tam yeşil olsun. Kapanışta ilk gerçek ürün K12 modelleriyle koşulsun, video başına kullanım ölçülsün, M4 raporu yazılsın ve `main`'e birleştirilsin.

**Architecture:**
- **Taslağın kaynağı (K7, K23):** Blender'ın GLB'si ve `camera_track.json`'dur.
  - `packages/remotion` paketindeki `Draft3D` bileşeni GLB'yi `@videogen/scene3d`'nin `SceneClock.seek` / `applyFrameFov` / `projectAnchor` yardımcılarıyla oynatır. Bunlar eşdeğerlik testindeki matematiğin aynısıdır.
  - Arka plan stilin CSS gradyanıdır; canvas şeffaftır.
  - Kanca, vuruş metni ve etiketler güvenli alana yapıları gereği yerleşir. Etiketler en çok 6 tanedir ve çakışmaz.
  - Aynı bileşen hem render'da hem Player'da kullanılır.
- **Render (K22, B8):**
  - `draft_render` adımı orchestrator'ın `execute()`'unda MCP araçlarıyla aynı `ResourceLocks` kilidine ve §6.4 ön kontrolüne girer (tek kapı).
  - Remotion render'ı worker içinde değil, `packages/remotion/src/render-cli.ts` çocuk sürecinde yapılır. Süreç grubu ve `render` türlü PID dosyası sayesinde iptal, zaman aşımı ve yeniden başlatma Chrome'u da öldürür.
  - GLB 127.0.0.1'de tek seferlik jetonlu bir yoldan sunulur. Bundle şablon hash'iyle önbelleğe alınır.
- **İnceleme (D5, D6):**
  - `Review` sözleşmesi `packages/shared`'dedir. Önem derecesi kontrol kimliğine bağlıdır; karar `draftDecision`'ın işidir, puan karara girmez.
  - Geri dönüş yeni bir `StepOutcome` (`rewind`) ile yapılır. Orchestrator `build…draft_review` adımlarını tek bir koşullu transaction'da yeni tura (`steps.round`, migration 0006) alır; tur başına `attempt` sıfırlanır.
  - Düzeltme turunda build adımı builder'ın kendi oturumunu yalnızca başarısız kontrollerle sürdürür.
  - Bayat taslak (§8.3) ve değişmeyen düzeltme incelenmez.

**Tech Stack:**
- Mevcut: Node 24.18, TypeScript 7, zod 4.6.5, Fastify 5, pg 8.23.1, drizzle-kit (migration üretimi), React 19.3, Vite 8.3.2, Tailwind 4.3.3, TanStack Query 5.104.1, vitest 5.0.3, @playwright/test 1.63.0 (`channel:'chrome'`), ffmpeg/ffprobe (sistem), three 0.186.1.
- **Yeni (tam sürüm):** `remotion`, `@remotion/three`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/player` 4.0.533; `@react-three/fiber` 9.8.1. Sistem Chrome `/usr/bin/google-chrome` (`chrome-for-testing`, `gl:'angle'`; tarayıcı indirilmez).

**Spec:** `docs/superpowers/specs/2026-10-06-videogen-design.md`. İlgili bölümler:
- §4: K7, K12, K13, K19, K22, K23, K27.
- §6.2 (reviewer_visual), §6.3 (`extract_frames`), §6.4 (GPU ön kontrolü, kullanım muhafızı).
- §7.1 adım 5–6, §7.2, §7.4 (`Review`), §7.5.
- §8.1–§8.3 (rubrik, reviewer_visual'ın boyutları, kendi kendini onaylamaya karşı önlemler, bayat artefakt).
- §11.1, §12.1–§12.4, §13.1, §13.4, §14, §16.1–§16.2 (S2), §17 (M4 satırı), §18.

Önceki taşlar:
- `docs/m4/m4b-summary.md`: §6–§8 (M4c notları).
- `docs/m4/m4a-summary.md`: §7 (minor 4: run başlatmada kullanım kapısı).
- `docs/m3/report.md`: §7, §9.

## Kapsam

| Plan | İçerik | Çıkış |
|---|---|---|
| M4a (tamam) | Pipeline omurgası, research, storyboard, Stüdyo, Kütüphane listesi, S2a | `main` |
| M4b (tamam) | `vg_blender`, sandbox'lı build, eşdeğerlik, önizleme, build adımı, medya ucu, K19, S2b | `main` |
| **M4c (bu plan, 11 görev)** | `Review` + `DRAFT_CHECKS`, migration 0006 (`steps.round`), orchestrator (geri dönüş, GPU kapısı, kullanım kapısı), `packages/remotion` (Draft3D + render), `draft_render`, `extract_frames`, `draft_review` (≤ 2 tur), player + kütüphane + kısayollar, smoke S2, kapanış | **M4 çıkışı:** S2 (taslakla); ilk gerçek ürün (K12); video başına kullanım; `main`'e birleştirme |

Görevler:

| # | Görev | Bağımlı olduğu |
|---|---|---|
| T1 | `Review` sözleşmesi, `DRAFT_CHECKS`, `draftDecision`, `reviewRefErrors`, fixture'lar | — |
| T2 | Migration 0006 `steps.round`, `rewindForReview` (tek transaction), `StepView.round`, `draftRound` | — |
| T3 | Orchestrator: `rewind` sonucu, GPU adımları `ResourceLocks` + §6.4 kapısında, run başlatmada kullanım kapısı, koşullu kurtarma | T2 |
| T4 | `packages/remotion` I: `Draft3D`, `draftProps`, güvenli alan yerleşimi, `bundleHash` (Chrome'suz birim testleri) | — |
| T5 | `packages/remotion` II + render katmanı: `renderDraftVideo`, `render-cli`, `RenderDriver.draft` (gerçek + Fake), ffprobe doğrulaması, kare çıkarma, PID regex'i, `test:render` | T4 |
| T6 | `draft_render` adımı + builder düzeltme turu (`draftFixPrompt`, oturum sürdürme) | T1, T3, T5 |
| T7 | `extract_frames` MCP aracı (reviewer_visual, adım+tur kare bütçesi) | T5 |
| T8 | `draft_review` adımı, Fake senaryolar (kusurlu / umutsuz / inatçı), plan `draft_review`'u içerir | T1–T7 |
| T9 | Stüdyo player (Taslak / Taslak MP4), tur başlığı, inceleme kartı, kütüphane kapak + süre, kısayollar | T8 |
| T10 | Smoke S2 (taslak + kütüphaneden oynatma + düzeltme turu) | T9 |
| T11 | Kapanış: tam doğrulama, K12 gerçek ürün, kullanım ölçümü, son review, rapor ve dokümanlar, `main`'e `--no-ff` | T1–T10 |

## M4b'den gelen gerçek arayüzler (`main`, HEAD `8379279`)

İmzalar repodaki koddan okunmuştur.

- **Adım yürütücüsü** (`apps/worker/src/pipeline/types.ts`):
  - `StepContext { runId, stepId, key, attempt, videoId, productId, productName, audioMode, versionId, runDir, signal, progress(pct, source), status(s, note?), session(id) }`.
  - `StepOutcome = done{note?} | needs_human{reason} | failed{error, retry?} | cancelled`.
  - `StepExecutor { key; resource; inputHash(ctx); reuse?(ctx, hash); run(ctx, hash) }`.
- **Orchestrator** (`apps/worker/src/pipeline/orchestrator.ts`):
  - `execute()` önce `inputHash`, sonra `reuse`, sonra `run` çağırır (`orchestrator.ts:220-222`).
  - `launch()` kaynak `claude` değilse `precheck(ex.resource, snapshot)`'ı **kilitsiz** çağırır (`:181-191`).
  - `settle()`: `done`/`needs_human` → `finishJob` + `updateStep`. `failed` → `attempt < maxAttempts (2)` ise yeniden kuyruğa alır.
  - `recover()` kiralı adımı **koşulsuz** `queued` yapar (`:91`).
  - `startRun()` kullanım kapısına bakmaz (M4a minor 4).
  - `PIPELINE_INCOMPLETE_NOTE(last)`.
- **Yapılandırılmış agent çıktısı** (`agent-step.ts`): `runStructured<T>({ manager, ctx, role, prompt, schema, check?, checkAsync?, initialResume?, fakeScript?, maxFixes? })`.
  - Şema/kontrol hatası aynı oturuma `fixPrompt` ile gider (≤ 2).
  - Çökmede 1 `resume`; limit reddinde aynı oturumu sürdürür.
  - `outputJsonSchema(name)` + `validateArtifact(name, v)` `ARTIFACT_SCHEMAS`'tan gelir (`packages/shared/src/artifacts.ts:144`).
- **Build adımı** (`steps.ts`):
  - `buildExecutor`: `prior = ctx.attempt > 1 ? latestStepSession(...)` (`:177`).
  - Kendi `put` yardımcısıyla `scene_glb`, `camera_track` (içerik `{fps, sensor_mm, yfov[]}`), `build_report` ve `preview_sheet` artefaktlarını yazar.
  - `StepDeps { pool, dataDir, manager, fakeScript?, scene? }`; `PipelineRole = 'researcher' | 'storyboarder' | 'builder'`.
- **Render katmanı** (`apps/worker/src/render/`):
  - `ResourceLocks.acquire(r, owner, {signal, onQueue})`.
  - `withResource(locks, r, {owner, signal, probe, extraDiskMb, waitMs, onWait({position?, reason?}), onRun}, fn)`; ön kontrol kilit alındıktan sonra döngüdedir.
  - `runProcess(file, args, {cwd, dataDir, owner, env (varsayılan {}), signal, timeoutMs, maxRssMb, onLine, killGraceMs})`: süreç grubu + `render` PID dosyası.
  - `RenderDriver { kind; capabilities(); build(); stills() }`; `RenderError(kind)`.
  - `contactSheet(ffmpeg, dir, out, {background?, cols?, rows?, safeArea?})` (`f*.png` glob).
  - `SAFE_AREA_FILTER`.
- **PID kaydı** (`apps/worker/src/agents/pids.ts:22`): `LEADER.render = /bwrap|blender|ffmpeg|chrome/` — `node … render-cli.ts` lideri bununla **eşleşmez**.
- **Ajan katmanı:**
  - `ToolHost { ports(s: ToolSession): Pick<McpPorts, 'buildScene' | 'previewStills'> }`; `ToolSession { sessionId, role, runId, stepId, runDir, signal, gpuWait }`.
  - Manager pipeline oturumlarını kullanım muhafızı kapalıyken `waiting_limit`'te bekletir (`manager.ts:222`). Reviewer fan-out'u zaten bu yoldan kapıya uyar.
  - `UsageGate { allowsNewPipeline(); resumeAt(); observeRateLimit(); onClear(fn) }`.
- **MCP ve roller** (`packages/claude/src/{mcp,roles}.ts`):
  - `IMPLEMENTED_MCP` 7 araç; `extract_frames` yok.
  - `ROLES.reviewer_visual` (opus/high, 25 tur, Read/Glob/Grep, MCP `extract_frames, run_qc, get_context`, `outputSchema: 'Review'`).
  - `videogenTools` araçları yalnızca port verildiyse sunar (`supplied`).
  - Read koruması yalnızca gizli yolları reddeder; reviewer run klasöründeki PNG'leri okuyabilir.
- **Paylaşılan:**
  - `STEP_WEIGHTS` (draft_render 4, draft_review 5); `IMPLEMENTED_STEPS = ['research','storyboard','build']`.
  - `producePlan`, `StepView` (`round` yok), `VideoView` (`draft` yok).
  - `overallPercent(steps, previous)` monotondur; `runs.progress` DB'de `GREATEST` ile yükselir.
  - `CHANNEL_STYLES[*].{background, text, lighting}`.
  - `SceneSpec { frames = round(duration_s×30), hero_part, parts[{id, name_tr}], style_id }`.
- **DB:**
  - `insertArtifact` `duration_ms/width/height/codec` sütunlarını yazmaz; `ArtifactRecord`'da `meta` yok.
  - `findArtifact({runId, kind, inputHash})`, `latestArtifact(runId, kind)`, `getBlob(sha) → {sha256, path, bytes, mime}`.
  - `artifacts` tablosunda `duration_ms, width, height, codec, meta` sütunları **var** (migration 0005).
- **Medya ucu:** `GET /api/blobs/:sha` (Range, immutable). MIME tablosunda `.mp4` → `video/mp4`, `.glb` → `model/gltf-binary` (`apps/worker/src/media.ts:9-11`).
- **Fake senaryolar** (`fake-scripts.ts`): "imkansız", "bozuk sahne", "yavaş". `FakeRenderDriver.build` her zaman aynı kalem fixture'ını kopyalar; GLB sha'sı turlar arasında değişmez.
- **Web:**
  - `ProductionPanel` → `VideoHeader`, `StepList`, `ResearchCard`, `StoryboardCard`, `BuildCard`.
  - `Library` satırı `data-testid="library-item"`. Kısayol olarak yalnızca `/` var (`ChatPanel`).
  - `blobUrl(sha)`.
- **Testler:** `npm test` 271, `test:blender` 17, `test:render` 4, smoke 15 passed / 7 skipped.

## Plan öncesi sondaj (2026-10-06)

| # | Ne | Sonuç |
|---|---|---|
| P3 (M4b) | Remotion 4.0.533 + `@remotion/three` + three 0.186.1 + r3f 9.8.1, sistem Chrome | 1080×1920 61 kare 3,9 sn; 45 sn 540×960 ≈ 95 sn. `pixelFormat:'yuv420p', colorSpace:'bt709'` (varsayılan `yuvj420p`/pc, §7.5 reddeder). Tarayıcı indirilmez |
| P7 | `@remotion/player` + `@remotion/three` + r3f + three'nin Vite 8.3.2 (rolldown) derlemesi (`spikes/m4c/`) | Derlendi (475 ms). Tek parça **1.454,97 kB** (gzip 410 kB) → "Taslak" sekmesi `React.lazy` ayrı parça ve yalnızca sekme açılınca yüklenir (§13.4 ilk yükleme < 2 sn) |
| P8 | `@remotion/bundler` symlink'li workspace paketinin TS kaynağını (`exports` → `.ts`, `.ts` uzantılı göreli import) derliyor mu? (`spikes/m4c/bundle.mjs`) | Derledi: ilk 6,6 sn, önbellekli 1,3 sn. `lib/src/util.ts` kodu bundle'da. esbuild install script'i engelliyken de çalıştı (platform paketi) → `npm install-scripts approve esbuild` gerekmiyor |

Sondaj betikleri `spikes/m4c/` altında commit'li; `node_modules` silindi.

## Karar kaydı (grilling: yazar + bağımsız inceleme)

Her karar spec ile tutarlıdır. Spec'teki bir K kararını ya da mimariyi değiştiren karar yoktur. Devralınan bağlayıcı kararlar (D5, D6, değişmeyen düzeltme, kare bütçesi, §8.3 hash'i) **uygulanır**, yeniden tartışılmaz. Bağımsız grilling'in (Claude Fable 5.1) CHANGE önerilerinden alınanlar "Plan inceleme geçmişi"nde listelidir.

| # | Karar | Neden | Yanlışsa maliyeti |
|---|---|---|---|
| C1 | 11 görev. `packages/remotion` ikiye bölündü (T4 bileşen + saf yerleşim, T5 render + çocuk süreç). Arayüz tek görev (T9). Builder düzeltme turu T6'da | En riskli parça ayrı test döngüsü alır; UI parçaları aynı veriyi kullanır | Bir görev büyük kalırsa reviewer'ı yorar |
| C2 | `Review` = `{rubric_version 'draft@1', reviewer_role 'reviewer_visual', checks[{id, pass, score 0–1, evidence?{frame, timecode (sn), crop?}, fix_hint?}], dimension_scores{D2,D3,D5,D9}, gate_results{G3,G5}, summary_tr}`.<br>Her kontrol tam bir kez; `pass:false` → kanıt ve `fix_hint` zorunlu.<br>`reviewRefErrors`: kare taslağın **ffprobe** kare sayısının içinde, `|frame/30 − timecode| ≤ 0,5`.<br>`round` agent çıktısında yok (artefakt meta'sında) | D6; açık özellikli nesneler (`z.record(enum)` yok); grilling C2: Fake taslak 60 kare | Reviewer kanıtsız "geçmedi" diyemez; sözleşme hatası aynı oturumda ≤ 2 düzeltme |
| C3 | `DRAFT_CHECKS` (önem kimliğe bağlı):<br>• `hero_frame0` blocker<br>• `mechanism_shot`, `parts_visible`, `labels_correct` major<br>• `no_intersection`, `text_readable`, `motion_flow`, `no_slop` minor<br>Reviewer'a sorulmayanlar: güvenli alan (G6), "≤ 6 etiket" (Draft3D yapı gereği), BVH çakışması (`build.json`) | Grilling C3: 540p'de z-fighting yargısı gürültülü; major olsa her gerçek üründe fazladan bir opus build turu (15–35 dk + 5 sa payı) | Gerçek bir iç içe geçme "küçük bulgu" olarak kalır; M5 final reviewer'ı yakalar |
| C4 | Karar `draftDecision`: başarısız blocker/major ya da başarısız kapı → `revise`; minor'lar yalnızca notta. Puan karara girmez | D6 | Puan ile karar ayrışabilir; kalibrasyon M5 |
| C5 | `reviews`/`findings` tabloları M5'te. M4c'de Review `artifacts` (`kind 'draft_review'`, jsonb + meta `{round, verdict, draftArtifactId}`) | Tek migration (0006) | M5'te tabloya taşıma |
| C6 | `StepOutcome += rewind{to, reason}`. Orchestrator `rewindForReview` ile **tek transaction**'da şunları yapar: inceleme adımı hâlâ `running` ve aynı `round`'daysa ve run `running`'se `to…bu adım` aralığı `pending`, `round+1`, `attempt 0`, `progress 0`, `input_hash/session_id/error/started/ended NULL` olur; iş `done` kapanır. `round ≥ DRAFT_MAX_RETURNS (2)` iken gelen rewind `needs_human` olur. `recover()` yalnızca aktif adımı `queued`'a alır, bayat kirayı kapatır | Grilling C6: iki ayrı UPDATE arasında çökme çift tur ya da sonsuza dek `running` run üretiyordu | — |
| C7 | `draft_review`'da `reuse` yok. `run()` önce aynı hash'li (hash'te `round` var) kayıtlı Review'u arar; varsa yeni oturum açmadan aynı kararı verir | `reuse` true → `done` olurdu: "revise" kaybolurdu | — |
| C8 | Düzeltme turu (`ctx.round ≥ 1`):<br>• Build son `draft_review`'dan yalnızca başarısız kontrolleri (id, önem, kare, zaman, ipucu) çitli veri olarak verir.<br>• Adımın son builder oturumunu `initialResume` ile sürdürür; `attempt > 1`'de `RESUME_PROMPT` + düzeltme listesi.<br>• Oturum yoksa taze istem + düzeltme listesi.<br>• Build `inputHash`'i `round` ve review kimliğini içerir | 60 turluk opus oturumu `product.py`'yi zaten biliyor; spec §7.2 "yalnızca başarısız kontrol" | Oturum bağlamı uzarsa token artar (cache okuma) |
| C9 | Değişmeyen düzeltme: tur ≥ 1'de `draft_render`, son taslağın meta'sındaki GLB sha + sahne spec hash'i aynıysa render etmez, `needs_human` döner ("Düzeltme turu sahneyi değiştirmedi; taslak yeniden incelenmedi. Açık bulgular: …"). Fake'te GLB fixture'dan kopyalanır; karşılaştırma fiilen spec hash'iyle yürür (testler bunu kullanır) | Devralınan kural | — |
| C10 | 2. geri dönüşten sonraki inceleme de `revise` ise `needs_human`: "2 taslak turundan sonra açık bulgu: …" | D5 | — |
| C11 | Başlıkta "Taslak turu k/2 · %N": k = döngü adımlarının `round`'u, N = build + draft_render + draft_review'un kendi turundaki ağırlıklı ilerlemesi (`draftRound`). Run yüzdesi monoton kalır (`GREATEST`). Rewind sonrası ETA dürüstçe büyür | D5, spec §12.1 | — |
| C12 | Taslak: 540×960 (reviewer ≥ 540×960, §8.2), 30 fps, `durationInFrames = frames + 1`, h264 CRF 18 `veryfast`, `yuv420p`, `bt709`, sessiz (`muted`), `concurrency 2`. Kapak 0. kare 270×480. Reviewer istemi "%50 ölçek; eşikleri orana göre yargıla" der | P3 ölçümü (~95 sn); final M5 | Taslakta küçük metin yargısı zorlaşır (`text_readable` minor) |
| C13 | Gerçek render **çocuk süreçte** (`node --import tsx packages/remotion/src/render-cli.ts`), `runProcess` altında:<br>• açık env (PATH, HOME, TMPDIR, LANG, isteğe bağlı VG_CHROME);<br>• zaman aşımı 600 sn, RSS 6 GB;<br>• PID regex'ine `render-cli` eklenir.<br>bwrap yok | Grilling C13: boş env'de `node`/Chrome bulunmaz; regex eşleşmezse yetim Chrome yeniden başlatmada ölmez. Girdi güvenilir kodumuz + Blender GLB'si; metin React'le kaçışlanır | RSS ölçümü Chrome paylaşımlı belleğini çift sayabilir: `test:render` süreyi ve sonucu raporlar, eşik gerekirse ledger'a `Ruling:` ile değişir |
| C14 | Geçici HTTP sunucusu çocuk süreçte: `127.0.0.1:0`, yol `/<32 hex>/scene.glb`, yalnızca GET, gerisi 404, `access-control-allow-origin: *`; render bitince kapanır. Diğer veri `inputProps` ile satır içi | Devralınan; grilling C14 (bundle sunucusu farklı origin) | — |
| C15 | Bundle önbelleği `<dataDir>/cache/remotion/<bundleHash>`. Yoksa `<hash>.tmp-…`'ya derlenir ve `rename` edilir; en yeni diğer bundle dışındakiler silinir. `bundleHash` = paket ve `packages/scene3d` kaynakları (yalnızca Node'da çalışan `hash/render/render-cli.ts` hariç) + bağımlılık sürümleri | Devralınan; yarım bundle sunulmaz | Önbellek ≈ 50 MB × 2 |
| C16 | ffprobe doğrulaması (`draftProbeErrors`): h264, `yuv420p`, `color_range tv`, `color_space/primaries/transfer bt709`, istenen boyut, `30/1`, `nb_frames` = sürücünün bildirdiği. Uymazsa `failed` (retry yok) + audit `render.draft_rejected` | §7.5 | — |
| C17 | §14 GPU hatası: render-cli bilinen Chrome/WebGL hatalarını çıkış kodu 3'e eşler. Sürücü bir kez `concurrency 1` ile yeniden dener; iki kez düşerse `RenderError('gpu')` | §14 | — |
| C18 | Fake sürücü: ffmpeg `testsrc2` istenen boyutta 60 kare (2 sn), aynı renk etiketleriyle; aynı ffprobe doğrulamasından geçer. `npm test` Chrome gerektirmez; gerçek render `npm run test:render`'da | §16.1, B19 | — |
| C19 | `draft_render` `inputHash` = sha(GLB sha, sahne spec içerik sha'sı, kompozisyon props sha'sı, `bundleHash`, `DRAFT_RENDER`). `reuse` yalnızca **aynı turun** (`meta.round === ctx.round`) taslağını kabul eder | §8.3; grilling C19: `reuse` `run()`'dan önce çağrılır; tur filtresi olmasa değişmeyen düzeltme hiç yakalanmazdı | — |
| C20 | Bayat taslak koruması: `draft_review.run()` taslağın `input_hash`'ini güncel `draftSource` hash'iyle karşılaştırır; uyuşmazsa `failed` ("taslak güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)") | §8.3 | Geliştirme sırasında `packages/remotion/src` değişirse çalışan run düşer: runbook'a yazılır |
| C21 | Orchestrator GPU kapısı: `execute()` `resource !== 'claude'` adımları `withResource(locks, …)` içinde koşar (`onWait` → `waiting_gpu`/`waiting_disk` + gerekçe ya da "GPU sırası bekleniyor (sırada N)"). `reuse` kilitten önce. `locks` varken `launch()` ön kontrolü kalkar. Adım durum yayınları sıralanır. `gpu` kapasitesi 1 kalır | K22, B8; tek kapı | — |
| C22 | `extract_frames({times[1–12], crop?})`: yalnızca reviewer_visual ve kayıtlı taslağı olan bir `draft_review` adımının oturumu (`ReviewTargets`).<br>• Bütçe **adım+tur** başına 12 kare; düzeltme ya da çökme oturumları paylaşır.<br>• Kırpma 2× büyütülür; zamanlar son kareye sıkıştırılır.<br>• Kilitsiz. | Grilling C22: oturum başına bütçe 3 oturumla 36 kareye çıkıyordu | — |
| C23 | Reviewer istemi:<br>• çitli storyboard (vuruşlar, metinler) ve sahne özeti (kahraman, parçalar, build uyarıları);<br>• kontakt sayfası yolu ve zamanları; vuruş sınırları;<br>• `DRAFT_CHECKS` soruları ve kurallar.<br>Builder'ın akıl yürütmesi verilmez (§8.3). `attempt > 1`'de reviewer kendi oturumunu sürdürür | §6.6, §8.3; grilling eksik karar 2 | — |
| C24 | Fake ürün tetikleri: "kusurlu" (ilk inceleme `revise`), "umutsuz" (her inceleme `revise`, builder her turda spec'i değiştirir), "inatçı" (her inceleme `revise`, builder değiştirmez). Smoke'ta yalnızca "kusurlu"; diğer ikisi vitest'te | Grilling C24: smoke < 3 dk bütçesi | — |
| C25 | Run başlatma kullanım kapısı (§6.4, M4a minor 4):<br>• `startRun` muhafız kapalıysa run'ı `queued` bırakır;<br>• video notu "Kullanım sınırı yakın: üretim sınır açılınca kendiliğinden başlar (açılış SS:DD).";<br>• not aynıysa audit tekrar yazılmaz (yeniden başlatmaya dayanıklı);<br>• `guard.onClear` → `orchestrator.startQueued()`. | Spec §6.4 | — |
| C26 | Player sekmeleri "Taslak" (`@remotion/player`, lazy, yalnızca sekme açıkken mount) · "Taslak MP4" (HTML5 `<video>`, Range). **Varsayılan "Taslak MP4"**. Final ve Karşılaştır M5/M7'de | Grilling C26: ilk yükte 1,45 MB parça ve WebGL yok; boşta CPU | Canlı sekme açıkken r3f sürekli çizebilir: sekme kapatılınca durur |
| C27 | Kütüphane satırında kapak (27×48, 9:16) ve süre ("· 0:45"). `VideoView.draft = {videoSha, coverSha, durationS} \| null` (videonun en yeni taslağı). Satıra tıklama Stüdyo'yu açar, video orada oynar (S2'nin "kütüphanede oynar" adımı bu yoldan) | Spec §13.1; detay sekmeleri M7 | — |
| C28 | Kısayollar: Space oynat/durdur, J −5 sn, K durdur, L +5 sn (görünen player), N → Stüdyo'da ürün adı kutusu. Yazı alanında, değiştirici tuşla ve odaktaki düğme/video üzerinde Space'te devre dışı. `?` yardım paneli M7 | §13.4 | — |
| C29 | Draft3D:<br>• r3f varsayılan sRGB çıkış (`linear` yok), şeffaf canvas + CSS stil gradyanı;<br>• RoomEnvironment (PMREM) + stile yakın anahtar/kenar ışıkları;<br>• kanca 68 px, vuruş metni 52 px, etiket 44 px (@1080);<br>• yazı tipi sistem sans-serif (Inter M5 final katmanında).<br>0. kare arka plan rengi `test:render`'da ±8 ile doğrulanır | Grilling C29: `linear` çıktı ile sRGB CSS renkleri uyuşmuyordu; M4b §8 "metaller düz" | Görünüş kalitesi gerçek üründe yargılanır (T11) |
| C30 | Gerçek doğrulama (T11):<br>• geçici DB `videogen_m4c_check`, `/tmp/videogen-m4c-check`;<br>• K12 varsayılan roller (override yok);<br>• "tükenmez kalem", seslendirmesiz;<br>• başlama koşulu 5 sa < %25 ve 7 gün < %70; koşu sırasında 5 sa > %80 → dur;<br>• başarısızlıkta tekrar yok. | Kullanıcı yönergesi; K12 | Üç opus build turu 5 sa payını zorlar (durdurma kuralı var) |
| C31 | Sayı zinciri (`npm test`): 271 → T1 276 → T2 279 → T3 284 → T4 287 → T5 291 → T6 295 → T7 299 → T8 305 → T9 308 → T10 308. `test:render` 4 → 6 (T5). Smoke 15/7 → T9 15/9 → T10 17/9 | Plan testlerinin `it` sayısından | Sapma ledger'a `Ruling:` |
| C32 | Ertelenen eski minorlardan yalnızca M4a minor 4 (kullanım kapısı) alındı; diğerleri kapsam dışı | Kapsam | — |

## Kapsam dışı (gerekçeli)

| Madde | Nereye | Neden |
|---|---|---|
| `reviews` / `findings` tabloları, regresyon/salınım takibi | M5 | Final review döngüsüyle birlikte (C5) |
| `final_render`, `compose`, `qc`, 3 reviewer, fixer, `FixReport`, `run_qc` | M5 | Yol haritası |
| `voice` adımı, ses, müzik | M5 | K17 onayı bekliyor |
| Player "Final" ve "Karşılaştır" sekmeleri, chat'ten yeni sürüm (S5 kalanı) | M5 / M7 | Final video ve sürüm karşılaştırma yok |
| Builder'ın `render_draft` MCP aracı | — | B7: taslağı `draft_render` adımı üretir |
| Kısayol `?` yardım paneli, Esc dışı genel kısayollar | M7 | §13.4'ün kalanı |
| Taslakta Inter yazı tipi, DOF ve hareket bulanıklığı | M5 | Final katmanı |
| Sınırdaki puanlarda ikinci görsel review (§8.3) | M5 | Taslakta puan karar vermez (C4) |
| `layout.json`, `provenance.json` | M5 | Metin kutuları taslakta yapı gereği güvenli alanda (C3) |
| Gerçek smoke profili (`test:smoke:real`) | M7 | Yol haritası |
| M4a minor 1–3, 5–11, M3 minor 1, 2, 7, 9–11 | M5 / M7 | Kapsam (C32) |

## Global Constraints

- **Ücretli API:**
  - Ücretli API anahtarı yok; `--bare` ve `bypassPermissions` yok.
  - Testlerde gerçek Claude yok (Fake sürücü).
  - Gerçek Claude çağrısı yalnızca T11 Step 2'de, K12 rol modelleriyle ve tek ürünle yapılır. Ek gerçek koşu kullanıcı onayı ister.
- **Chrome:**
  - `npm test` Chrome, Blender ya da bwrap gerektirmez. Gerçek Remotion render'ı yalnızca `npm run test:render` ve T11'de.
  - Chrome her zaman sistem Chrome'udur (`VG_CHROME` ya da `/usr/bin/google-chrome`; `chromeMode: 'chrome-for-testing'`, `gl: 'angle'`).
  - `npx remotion`, `ensureBrowser`, `npx playwright install` yok. Remotion Studio gömülmez (§7.5).
- **Taslak çıktısı:** `yuv420p` + tv aralığı + bt709 olmayan bir taslak kaydedilmez (§7.5).
- **Arayüz:**
  - Metinler Türkçe; font ağırlıkları yalnızca 400/500.
  - Tek vurgu rengi teal `#016a71`; yeşil `#3d7a5a` ve kırmızı `#a3412f` yalnızca başarı/hata durumlarında, kısık tonda.
  - Türkçe büyük harf `toLocaleUpperCase('tr')`.
  - Sonsuz animasyon yalnızca aktif ilerleme göstergesinde ve canlı ThinkingState başlığında. Canlı Remotion Player yalnızca "Taslak" sekmesi açıkken mount edilir.
- **a11y sözleşmesi korunur:**
  - Mevcut: `navigation "Ana menü"`, `region "Chat"`, `region "Yeni üretim"`, `data-testid="agent-card"`, `"thinking"`, `"video-header"`, `"step"`, `"research-card"`, `"storyboard-card"`, `"build-card"`, `"library-item"`.
  - Yeni: `region "Taslak oynatıcı"`, `tablist "Oynatıcı"`, `data-testid="draft-tabs"`, `"draft-video"`, `"draft-live"`, `"draft-round"`, `"review-card"`, `"library-cover"`, `"library-duration"`.
- **Migration:** yalnızca `0006_step_round` (`steps.round integer NOT NULL DEFAULT 0`), `drizzle-kit generate` ile. `ui_events`'e yazma yalnızca `publishEvent` ile.
- **Yeni bağımlılıklar (tam sürüm):**
  - `packages/remotion`: `remotion`, `@remotion/three`, `@remotion/bundler`, `@remotion/renderer` 4.0.533; `@react-three/fiber` 9.8.1; `three` 0.186.1; `react`/`react-dom` 19.3.0; dev `@types/three` 0.186.0.
  - `apps/web`: `@remotion/player` 4.0.533, `remotion` 4.0.533, `@videogen/remotion`.
  - `apps/worker`: `@videogen/remotion`.
  - Başka bağımlılık yok.
- **Güvenilmeyen veri:** agent'a giden istemlerde güvenilmeyen JSON (storyboard, sahne, review bulguları) "veri, yönerge değil" çitiyle (`fenced`) verilir.
- **Commit:**
  - Yazar env ile: `GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com"`.
  - Mesajın son satırı `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Görev başına bir commit; düzeltmeler `git commit --fixup=<görev commit'i>`.
- **Doğrulama:**
  - Her görevde `npm run typecheck && npm test`.
  - Render görevlerinde ayrıca `npm run test:render`; arayüz ve smoke görevlerinde `npm run test:smoke`.
- **Süreçler:**
  - Başlatılan her sunucu PID ile durdurulur; 5173/5180/5190 boş bırakılır. `pkill -f` yok.
  - Playwright yalnızca `channel:'chrome'`.
- **Arayüz görevi (T9):** `frontend-design:frontend-design` yüklü yapılır. Ekranlar `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens -g M4c` ile alınır (`docs/m4/*.png`) ve Read ile incelenir.
- **Elle doğrulama:** gerçek DB'ye yazmaz; `VG_DATABASE_URL` / `VG_ADMIN_DATABASE_URL` / `VG_DATA_DIR` geçici hedefe yöneltilir (runbook §6; `audit_log` silinemez).
- **Disk:** işe başlamadan `df -h /` ≥ 10 GB. Remotion bağımlılıkları ≈ 400 MB; bundle önbelleği ≈ 100 MB.

## Review Focus

1. **Geri dönüş sırasında çökme, iptal ya da yeniden başlatma.** Durum: inceleme adımı `rewind` dönerken worker ölür, "Üretimi durdur" gelir ya da worker yeniden başlar. Beklenen:
   - Tur bir kez artar (çift tur yok); run asılı kalmaz.
   - İptal edilmiş run yeni tura geçmez.
   - Yeniden başlayan inceleme kayıtlı kararı yeni oturum açmadan yeniden verir.
   - Bitmiş adımdaki bayat kira kapatılır.
   - Testler: T2 `rewind.test.ts` (tekrar ve iptal), T3 "on restart a lease left…", T8 "a restart in the same round replays…".
2. **Bayat ya da değişmeyen taslak.** Durum: build'den sonra sahne değişir ya da düzeltme turu hiçbir şey değiştirmez. Beklenen:
   - Bayat taslak hiç incelenmez.
   - Değişmeyen düzeltme yeniden render edilmez ve incelenmez; açık bulgularla `needs_human` olur.
   - Testler: T8 "never reviews a stale draft", T6 "a fix round that changed neither…", T8 uçtan uca "inatçı".
3. **GPU çekişmesi ve render sırasında iptal.** Durum: builder önizleme render ederken taslak sırası gelir; kullanıcı render sırasında durdurur; worker ölür. Beklenen:
   - Taslak adımı "GPU sırası bekleniyor (sırada 1)" ile bekler.
   - Beklerken iptal kilit kuyruğunda iz bırakmaz.
   - Render sırasında iptal Chrome'u süreç grubuyla öldürür; yeniden başlatma yetim `render-cli` grubunu toplar.
   - Testler: T3 "a GPU step waits…", T5 "startup recovery reaps…", T5 `test:render` "a cancelled draft render kills Chrome…".
4. **Kullanım sınırı.** Durum: 5 sa ≥ %80 iken "Üret". Beklenen:
   - Run başlamaz; video gerekçeli notla `queued` kalır.
   - Audit bir kez yazılır; muhafız açılınca run kendiliğinden başlar.
   - Testler: T3 "usage gate…".
5. **Reviewer sözleşmeyi bozar ya da uydurur.** Durum: kanıtsız "geçmedi", olmayan kare, tutarsız zaman kodu, kendi önem derecesini yazma, kare bütçesini aşma. Beklenen:
   - Aynı oturuma en çok 2 düzeltme isteği gider, sonra adım gerekçeli `failed` olur.
   - Önem derecesi her zaman `DRAFT_CHECKS`'ten gelir.
   - Bütçe aşımı araç hatası olarak döner.
   - Testler: T1 "rejects a missing…", "cross-checks evidence…"; T7 bütçe; T8 "a review that breaks the contract…".

---
## Başlarken (yürütücü)

```bash
cd ~/gpu-server/VideoGen
git switch m4c-draft-review-player && git status --short && git log --oneline -2   # temiz; HEAD bu planın commit'i, altında main 8379279
df -h / | tail -1 && free -h | sed -n 2,3p && ls -l /usr/bin/google-chrome && ffprobe -version | head -1
```

- **Ledger:** `.superpowers/sdd/2026-10-06-m4c-draft-review-player/progress.md` (ilk satır plan yolu). `Ruling:` satırları M3/M4 biçiminde tutulur.
- **Sayı zinciri:** C31.
- **Planın kodu:** Kullanıcı yönergesiyle planlama sırasında **çalıştırılmadı**. Bunun yerine:
  - Değişen dosyaların `diff` blokları yazım sırasında HEAD'in (`8379279`) bir arşiv kopyasına **sırayla `git apply` ile uygulandı**; hepsi temiz uygulandı. Sonuç, planın yeni dosyalarıyla birlikte yazarın çalışma kopyasıyla birebir aynı.
  - Sayılar planın `it` bloklarından hesaplandı.
- **Sapma olursa:** İlk typecheck ya da test sapmasında düzelt ve ledger'a `Ruling:` yaz. Bir hunk tutmazsa (önceki görevdeki bir sapma yüzünden) değişikliği elle uygula ve `Ruling:` yaz.

---
### Task 1: `Review` sözleşmesi — `DRAFT_CHECKS`, `draftDecision`, `reviewRefErrors`, fixture'lar

**Files:**
- Create: `packages/shared/src/review.ts`, `tests/fixtures/artifacts/review-pass.json`, `tests/fixtures/artifacts/review-revise.json`
- Modify: `packages/shared/src/artifacts.ts` (`ARTIFACT_SCHEMAS.Review`), `packages/shared/src/index.ts`, `packages/shared/src/browser.ts`
- Test: `packages/shared/test/review.test.ts`

**Interfaces:**
- Consumes: `validateArtifact`, `outputJsonSchema` (`artifacts.ts`).
- Produces:
  - `DRAFT_CHECK_IDS` (8 kimlik), `type DraftCheckId`, `DRAFT_CHECKS: Record<DraftCheckId, { severity: DraftSeverity; dimension: DraftDimension; label_tr; ask_tr }>`, `type DraftSeverity = 'blocker' | 'major' | 'minor'`.
  - `DRAFT_DIMENSIONS = { D2: 15, D3: 12, D5: 10, D9: 8 }`, `DRAFT_GATES = ['G3', 'G5']`, `DRAFT_RUBRIC_VERSION = 'draft@1'`, `DRAFT_MAX_RETURNS = 2`.
  - `ReviewSchema`, `type Review`, `type ReviewCheck`.
  - `reviewRefErrors(r: Review, draft: { frames: number; fps: number }): string[]`.
  - `draftDecision(r: Review): { verdict: 'pass' | 'revise'; blocking: DraftCheckId[]; minor: DraftCheckId[]; gates: DraftGate[] }`.
  - `validateArtifact('Review', v)`, `outputJsonSchema('Review')`.
  - Fixture'lar: `review-pass` (yalnızca `text_readable` küçük bulgu, kare 12) ve `review-revise` (`mechanism_shot` major kare 30, `motion_flow` minor kare 45). Kare numaraları Fake taslağın 60 karesinin içinde.

- [ ] **Step 1: Başarısız testi yaz**

`packages/shared/test/review.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAFT_CHECK_IDS, DRAFT_CHECKS, draftDecision, outputJsonSchema, reviewRefErrors, validateArtifact, type Review } from '../src/index.ts';

const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8')) as Review;
const errorsOf = (v: unknown) => { const r = validateArtifact('Review', v); return r.ok ? [] : r.errors; };

describe('Review contract (draft review)', () => {
  it('accepts both fixtures; every check id appears exactly once and severities are fixed by id', () => {
    expect(errorsOf(fx('review-pass'))).toEqual([]);
    expect(errorsOf(fx('review-revise'))).toEqual([]);
    expect(Object.keys(DRAFT_CHECKS).sort()).toEqual([...DRAFT_CHECK_IDS].sort());
    expect(DRAFT_CHECKS.hero_frame0.severity).toBe('blocker');
    expect(DRAFT_CHECK_IDS.filter((id) => DRAFT_CHECKS[id].severity === 'minor')).toEqual(['no_intersection', 'text_readable', 'motion_flow', 'no_slop']);
  });

  it('rejects a missing or repeated check, a failure without evidence or fix hint, and a severity field from the reviewer', () => {
    const r = fx('review-revise');
    expect(errorsOf({ ...r, checks: r.checks.slice(1) }).join(' ')).toContain('checks');
    expect(errorsOf({ ...r, checks: [...r.checks.slice(1), r.checks[1]] })).toEqual(expect.arrayContaining([expect.stringContaining('tekrarlanan kontrol: mechanism_shot'), expect.stringContaining('eksik kontrol: hero_frame0')]));
    const bare = r.checks.map((c) => (c.id === 'mechanism_shot' ? { id: c.id, pass: false, score: 0.2 } : c));
    expect(errorsOf({ ...r, checks: bare })).toEqual(expect.arrayContaining([expect.stringContaining('kanıt'), expect.stringContaining('düzeltme ipucu')]));
    // zod strips unknown keys: a reviewer-supplied severity never reaches the decision.
    const sneaky = { ...r, checks: r.checks.map((c) => ({ ...c, severity: 'minor' })) };
    const v = validateArtifact('Review', sneaky);
    expect(v.ok && draftDecision(v.value).verdict).toBe('revise');
  });

  it('cross-checks evidence against the reviewed draft: frame inside the video, timecode agrees with the frame', () => {
    const r = fx('review-revise');
    expect(reviewRefErrors(r, { frames: 60, fps: 30 })).toEqual([]);
    expect(reviewRefErrors(r, { frames: 40, fps: 30 })).toEqual([expect.stringContaining('checks.6.evidence.frame')]);
    const off = { ...r, checks: r.checks.map((c) => (c.id === 'mechanism_shot' ? { ...c, evidence: { frame: 30, timecode: 9 } } : c)) };
    expect(reviewRefErrors(off, { frames: 60, fps: 30 })).toEqual([expect.stringContaining('checks.1.evidence.timecode')]);
  });

  it('decides deterministically: blocker/major failures or a failed gate revise, minor failures only annotate', () => {
    expect(draftDecision(fx('review-pass'))).toEqual({ verdict: 'pass', blocking: [], minor: ['text_readable'], gates: [] });
    expect(draftDecision(fx('review-revise'))).toEqual({ verdict: 'revise', blocking: ['mechanism_shot'], minor: ['motion_flow'], gates: [] });
    const gate = { ...fx('review-pass'), gate_results: { G3: false, G5: true } };
    expect(draftDecision(gate)).toMatchObject({ verdict: 'revise', gates: ['G3'] });
    // Scores never decide: a perfect pass list with zero scores still passes.
    const zero = { ...fx('review-pass'), checks: fx('review-pass').checks.map((c) => ({ ...c, pass: true, score: 0 })) };
    expect(draftDecision(zero).verdict).toBe('pass');
  });

  it('gives the CLI a JSON schema with explicit dimension and gate properties (no propertyNames)', () => {
    const s = outputJsonSchema('Review') as { properties: Record<string, { required?: string[]; propertyNames?: unknown }> };
    expect(s.properties.dimension_scores!.required).toEqual(['D2', 'D3', 'D5', 'D9']);
    expect(s.properties.gate_results!.required).toEqual(['G3', 'G5']);
    expect(JSON.stringify(s)).not.toContain('propertyNames');
  });
});
```

Fixture'lar (testin girdisi; T8'de Fake reviewer de kullanır):

`tests/fixtures/artifacts/review-pass.json`:

```json
{
  "rubric_version": "draft@1",
  "reviewer_role": "reviewer_visual",
  "checks": [
    { "id": "hero_frame0", "pass": true, "score": 0.9 },
    { "id": "mechanism_shot", "pass": true, "score": 0.8 },
    { "id": "parts_visible", "pass": true, "score": 0.85 },
    { "id": "no_intersection", "pass": true, "score": 0.9 },
    { "id": "labels_correct", "pass": true, "score": 0.8 },
    { "id": "text_readable", "pass": false, "score": 0.5, "evidence": { "frame": 12, "timecode": 0.4 }, "fix_hint": "Alt yazının plakası koyu arka planda zayıf kalıyor; plaka opaklığını artır." },
    { "id": "motion_flow", "pass": true, "score": 0.8 },
    { "id": "no_slop", "pass": true, "score": 0.9 }
  ],
  "dimension_scores": { "D2": 12.5, "D3": 9.5, "D5": 7, "D9": 7 },
  "gate_results": { "G3": true, "G5": true },
  "summary_tr": "Kahraman ilk karede net, patlatma ve mekanizma anlaşılır; yalnızca alt yazı kontrastı zayıf."
}
```

`tests/fixtures/artifacts/review-revise.json`:

```json
{
  "rubric_version": "draft@1",
  "reviewer_role": "reviewer_visual",
  "checks": [
    { "id": "hero_frame0", "pass": true, "score": 0.85 },
    { "id": "mechanism_shot", "pass": false, "score": 0.3, "evidence": { "frame": 30, "timecode": 1.0, "crop": { "x": 0.3, "y": 0.35, "w": 0.4, "h": 0.25 } }, "fix_hint": "Mekanizma vuruşunda kamera bilyeye yaklaşmıyor; 24–32 sn arasında bilye ve uç yuvasına 120 mm lensle yakın çekim ekle." },
    { "id": "parts_visible", "pass": true, "score": 0.8 },
    { "id": "no_intersection", "pass": true, "score": 0.9 },
    { "id": "labels_correct", "pass": true, "score": 0.75 },
    { "id": "text_readable", "pass": true, "score": 0.8 },
    { "id": "motion_flow", "pass": false, "score": 0.5, "evidence": { "frame": 45, "timecode": 1.5 }, "fix_hint": "Hazne vuruşunda 2 sn'den uzun olaysız bölüm var; haznenin dönüşünü erkene al." },
    { "id": "no_slop", "pass": true, "score": 0.9 }
  ],
  "dimension_scores": { "D2": 9, "D3": 7, "D5": 8, "D9": 7 },
  "gate_results": { "G3": true, "G5": true },
  "summary_tr": "Patlatma okunuyor ama mekanizma vuruşu uzak kalıyor; hazne vuruşunda hareket duruyor."
}
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run packages/shared/test/review.test.ts`
Expected: FAIL — `DRAFT_CHECK_IDS` / `draftDecision` export'u yok (`SyntaxError: The requested module '../src/index.ts' does not provide an export named 'DRAFT_CHECK_IDS'`).

- [ ] **Step 3: Uygula**

`packages/shared/src/review.ts`:

```ts
import { z } from 'zod';

/** Spec §8.2: the dimensions reviewer_visual owns in the draft review, with their §8.1 weights (the score ceiling). */
export const DRAFT_DIMENSIONS = { D2: 15, D3: 12, D5: 10, D9: 8 } as const;
export type DraftDimension = keyof typeof DRAFT_DIMENSIONS;
/** Gates reviewer_visual judges on the frames (spec §8.2: G3 visual part, G5 "CG presented as real"). */
export const DRAFT_GATES = ['G3', 'G5'] as const;
export type DraftGate = (typeof DRAFT_GATES)[number];

export type DraftSeverity = 'blocker' | 'major' | 'minor';
export interface DraftCheck { severity: DraftSeverity; dimension: DraftDimension; label_tr: string; ask_tr: string }

export const DRAFT_CHECK_IDS = ['hero_frame0', 'mechanism_shot', 'parts_visible', 'no_intersection', 'labels_correct', 'text_readable', 'motion_flow', 'no_slop'] as const;
export type DraftCheckId = (typeof DRAFT_CHECK_IDS)[number];

/**
 * Plan C3 (inherited D6): the severity belongs to the check id, never to the reviewer. Not asked, because deterministic: safe-area
 * text (G6) and the ≤ 6 label limit (Draft3D places labels by construction, packages/remotion placeLabels), BVH overlaps
 * (build.json). `no_intersection` is minor: z-fighting at 540×960 is a noisy call and a major would buy a whole opus build round.
 */
export const DRAFT_CHECKS: Record<DraftCheckId, DraftCheck> = {
  hero_frame0: { severity: 'blocker', dimension: 'D2', label_tr: 'Kahraman ilk karede', ask_tr: '0. karede kahraman nesne büyük (kadraj yüksekliğinin yaklaşık %35\'i ya da fazlası), net ve tanınır mı?' },
  mechanism_shot: { severity: 'major', dimension: 'D2', label_tr: 'Mekanizma çekimi', ask_tr: 'Mekanizma vuruşunda mekanizmanın çalıştığı yer yakın planda ve anlaşılır görünüyor mu?' },
  parts_visible: { severity: 'major', dimension: 'D2', label_tr: 'Parçalar görünür', ask_tr: 'Her vuruşun konusu olan parça kadrajda, seçilebilir ve başka parçanın arkasında kalmıyor mu?' },
  no_intersection: { severity: 'minor', dimension: 'D2', label_tr: 'İç içe geçme yok', ask_tr: 'Parçalar birbirinin içinden geçmiyor; z-fighting, titreme ya da kopuk parça yok mu?' },
  labels_correct: { severity: 'major', dimension: 'D5', label_tr: 'Etiketler doğru', ask_tr: 'Her etiket çizgisi adını taşıdığı parçaya mı bitiyor?' },
  text_readable: { severity: 'minor', dimension: 'D5', label_tr: 'Yazılar okunur', ask_tr: 'Ekran yazıları ve etiketler arka planla yeterli kontrastta ve okunur boyutta mı?' },
  motion_flow: { severity: 'minor', dimension: 'D3', label_tr: 'Hareket akışı', ask_tr: '0,5 sn\'den uzun donma yok ve yaklaşık her 2 sn\'de bir görsel olay var mı?' },
  no_slop: { severity: 'minor', dimension: 'D9', label_tr: 'Özgünlük', ask_tr: 'Ekranda emoji ya da kalıp (slop) ifade yok ve CG gerçek çekim gibi sunulmuyor mu?' },
};
export const DRAFT_RUBRIC_VERSION = 'draft@1';
/** Inherited D5: at most two returns to build (three reviews); the third failing review stops the run (needs_human). */
export const DRAFT_MAX_RETURNS = 2;

const unit = z.number().min(0).max(1);
const tr = (max: number) => z.string().trim().min(1).max(max);
const EvidenceSchema = z.object({
  /** Frame number of the draft video (0-based). */
  frame: z.number().int().min(0),
  /** Seconds; must agree with frame / 30 within 0.5 s (reviewRefErrors). */
  timecode: z.number().min(0),
  /** Optional region, fractions of the frame. */
  crop: z.object({ x: unit, y: unit, w: unit, h: unit }).optional(),
});
const ReviewCheckSchema = z.object({
  id: z.enum(DRAFT_CHECK_IDS),
  pass: z.boolean(),
  score: unit,
  evidence: EvidenceSchema.optional(),
  fix_hint: tr(300).optional(),
});
/** Explicit properties, not z.record(enum): zod 4 would make every key required anyway and the CLI schema check of propertyNames is unverified (D6). */
const DimensionScoresSchema = z.object({
  D2: z.number().min(0).max(DRAFT_DIMENSIONS.D2),
  D3: z.number().min(0).max(DRAFT_DIMENSIONS.D3),
  D5: z.number().min(0).max(DRAFT_DIMENSIONS.D5),
  D9: z.number().min(0).max(DRAFT_DIMENSIONS.D9),
});
const GateResultsSchema = z.object({ G3: z.boolean(), G5: z.boolean() });

const ReviewBase = z.object({
  rubric_version: z.literal(DRAFT_RUBRIC_VERSION),
  reviewer_role: z.literal('reviewer_visual'),
  checks: z.array(ReviewCheckSchema).length(DRAFT_CHECK_IDS.length),
  dimension_scores: DimensionScoresSchema,
  gate_results: GateResultsSchema,
  summary_tr: tr(400),
});
export type Review = z.infer<typeof ReviewBase>;
export type ReviewCheck = Review['checks'][number];

export const ReviewSchema = ReviewBase.superRefine((r, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const seen = new Set<string>();
  r.checks.forEach((c, i) => {
    if (seen.has(c.id)) issue(['checks', i, 'id'], `tekrarlanan kontrol: ${c.id}`);
    seen.add(c.id);
    if (!c.pass && !c.evidence) issue(['checks', i, 'evidence'], 'başarısız kontrolde kanıt (kare ve zaman kodu) zorunlu');
    if (!c.pass && !c.fix_hint) issue(['checks', i, 'fix_hint'], 'başarısız kontrolde düzeltme ipucu zorunlu');
  });
  for (const id of DRAFT_CHECK_IDS) if (!seen.has(id)) issue(['checks'], `eksik kontrol: ${id}`);
});

/** Cross-checks against the draft that was actually reviewed (same-session fix requests, like storyboardRefErrors). */
export function reviewRefErrors(r: Review, draft: { frames: number; fps: number }): string[] {
  const out: string[] = [];
  r.checks.forEach((c, i) => {
    if (!c.evidence) return;
    if (c.evidence.frame >= draft.frames) out.push(`checks.${i}.evidence.frame: taslakta ${draft.frames} kare var (0–${draft.frames - 1})`);
    if (Math.abs(c.evidence.frame / draft.fps - c.evidence.timecode) > 0.5) out.push(`checks.${i}.evidence.timecode: kare ${c.evidence.frame} ≈ ${(c.evidence.frame / draft.fps).toFixed(2)} sn olmalı`);
  });
  return out;
}

export interface DraftDecision { verdict: 'pass' | 'revise'; blocking: DraftCheckId[]; minor: DraftCheckId[]; gates: DraftGate[] }

/** Deterministic (D6): a failed blocker or major check, or a failed gate, sends the draft back; minor failures only go to the note. Scores never decide. */
export function draftDecision(r: Review): DraftDecision {
  const failed = r.checks.filter((c) => !c.pass);
  const blocking = failed.filter((c) => DRAFT_CHECKS[c.id].severity !== 'minor').map((c) => c.id);
  const minor = failed.filter((c) => DRAFT_CHECKS[c.id].severity === 'minor').map((c) => c.id);
  const gates = DRAFT_GATES.filter((g) => !r.gate_results[g]);
  return { verdict: blocking.length || gates.length ? 'revise' : 'pass', blocking, minor, gates };
}
```

Diff (`git apply`):

```diff
--- a/packages/shared/src/artifacts.ts
+++ b/packages/shared/src/artifacts.ts
@@ -1,4 +1,5 @@
 import { z } from 'zod';
+import { ReviewSchema, type Review } from './review.ts';
 import { SceneSpecSchema, type SceneSpec } from './scene.ts';

 /** Spec §8.1 D1: the hook uses one of five patterns. Names are derived (the spec lists none); M5 calibration may revise them. */
@@ -141,9 +142,9 @@
   return out;
 }

-export const ARTIFACT_SCHEMAS = { ProductResearch: ProductResearchSchema, Storyboard: StoryboardSchema, SceneSpec: SceneSpecSchema } as const;
+export const ARTIFACT_SCHEMAS = { ProductResearch: ProductResearchSchema, Storyboard: StoryboardSchema, SceneSpec: SceneSpecSchema, Review: ReviewSchema } as const;
 export type ArtifactSchemaName = keyof typeof ARTIFACT_SCHEMAS;
-export interface ArtifactValues { ProductResearch: ProductResearch; Storyboard: Storyboard; SceneSpec: SceneSpec }
+export interface ArtifactValues { ProductResearch: ProductResearch; Storyboard: Storyboard; SceneSpec: SceneSpec; Review: Review }
 export type ArtifactValue<N extends ArtifactSchemaName> = ArtifactValues[N];

 /** JSON Schema for the SDK's outputFormat. Refinements are not expressible there; validateArtifact re-checks them. */
--- a/packages/shared/src/index.ts
+++ b/packages/shared/src/index.ts
@@ -8,5 +8,6 @@
 export * from './artifacts.ts';
 export * from './pipeline.ts';
 export * from './progress.ts';
+export * from './review.ts';
 export * from './scene.ts';
 export * from './styles.ts';
--- a/packages/shared/src/browser.ts
+++ b/packages/shared/src/browser.ts
@@ -5,5 +5,6 @@
 export * from './artifacts.ts';
 export * from './pipeline.ts';
 export * from './progress.ts';
+export * from './review.ts';
 export * from './scene.ts';
 export * from './styles.ts';
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run packages/shared/test/review.test.ts && npm run typecheck && npm test`
Expected: `5 passed`; tam paket `Tests  276 passed (276)`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/review.ts packages/shared/src/artifacts.ts packages/shared/src/index.ts packages/shared/src/browser.ts packages/shared/test/review.test.ts tests/fixtures/artifacts/review-pass.json tests/fixtures/artifacts/review-revise.json
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(review): Review contract, fixed draft checks and deterministic draft decision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0006 `steps.round`, `rewindForReview` (tek transaction), `StepView.round`, `draftRound`

**Files:**
- Modify: `packages/db/src/schema.ts` (`steps.round`), `packages/db/src/pipeline.ts` (`toStep`, `rewindForReview`), `packages/shared/src/pipeline.ts` (`StepView.round`), `packages/shared/src/progress.ts` (`DRAFT_LOOP_STEPS`, `draftRound`), `apps/web/test/production-view.test.ts` (yardımcıya `round: 0`)
- Create: `packages/db/drizzle/0006_step_round.sql` + `packages/db/drizzle/meta/0006_snapshot.json` + `_journal.json` girdisi (drizzle-kit üretir)
- Test: `packages/db/test/rewind.test.ts`, `packages/shared/test/draft-round.test.ts`

**Interfaces:**
- Consumes: `RUN_IS_RUNNING` deseni, `listRunSteps`, `claimJob`.
- Produces:
  - `StepView.round: number` (ve `StepRecord.round`).
  - `rewindForReview(pool, { runId, stepId, jobId, round, fromOrdinal, toOrdinal, note }): Promise<boolean>`: tek transaction. İnceleme adımı `running` ve `round` eşleşiyorsa ve run `running`'se aralığı `pending` + `round+1` + `attempt 0` yapar ve işi `done` kapatır; aksi `false` (hiçbir şey değişmez).
  - `DRAFT_LOOP_STEPS`, `draftRound(steps): { round; percent } | null`.

- [ ] **Step 1: Başarısız testleri yaz**

`packages/db/test/rewind.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, enqueueJob, claimJob, listRunSteps, rewindForReview, updateRun, updateStep } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const plan = (['research', 'storyboard', 'build', 'draft_render', 'draft_review'] as const).map((key) => ({ key, weight: 20 }));

async function reviewing(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  await updateRun(t.pool, r.runId, { status: 'running' });
  const steps = await listRunSteps(t.pool, r.runId);
  for (const s of steps) await updateStep(t.pool, s.id, { status: s.key === 'draft_review' ? 'running' : 'done', progress: s.key === 'draft_review' ? 40 : 100, attempt: 1, startedAt: new Date(), endedAt: s.key === 'draft_review' ? null : new Date() });
  const review = steps.at(-1)!;
  await enqueueJob(t.pool, { stepId: review.id, resource: 'claude' });
  const job = (await claimJob(t.pool, { owner: 'w', resources: ['claude'], leaseMs: 60_000 }))!;
  return { r, review, job };
}

describe('rewindForReview (plan C6)', () => {
  it('sends build…draft_review back to pending with round + 1 and a fresh attempt, and closes the review job, in one transaction', async () => {
    const { r, review, job } = await reviewing('Kalem rewind');
    expect(await rewindForReview(t.pool, { runId: r.runId, stepId: review.id, jobId: job.id, round: 0, fromOrdinal: 2, toOrdinal: 4, note: 'taslak turu 1/2' })).toBe(true);
    const after = await listRunSteps(t.pool, r.runId);
    expect(after.map((s) => [s.key, s.status, s.round, s.attempt, s.progress])).toEqual([
      ['research', 'done', 0, 1, 100], ['storyboard', 'done', 0, 1, 100],
      ['build', 'pending', 1, 0, 0], ['draft_render', 'pending', 1, 0, 0], ['draft_review', 'pending', 1, 0, 0],
    ]);
    expect(after[2]!).toMatchObject({ note: 'taslak turu 1/2', startedAt: null, endedAt: null, inputHash: null });
    expect((await t.pool.query('SELECT status FROM jobs WHERE id = $1', [job.id])).rows[0].status).toBe('done');
    // Replayed by a restarted worker for the same round: nothing changes a second time (no double round).
    expect(await rewindForReview(t.pool, { runId: r.runId, stepId: review.id, jobId: job.id, round: 0, fromOrdinal: 2, toOrdinal: 4, note: 'x' })).toBe(false);
    expect((await listRunSteps(t.pool, r.runId)).map((s) => s.round)).toEqual([0, 0, 1, 1, 1]);
  });

  it('does nothing when the run was cancelled meanwhile', async () => {
    const { r, review, job } = await reviewing('Kalem iptal');
    await updateRun(t.pool, r.runId, { status: 'cancelled' });
    expect(await rewindForReview(t.pool, { runId: r.runId, stepId: review.id, jobId: job.id, round: 0, fromOrdinal: 2, toOrdinal: 4, note: 'x' })).toBe(false);
    expect((await listRunSteps(t.pool, r.runId)).map((s) => s.round)).toEqual([0, 0, 0, 0, 0]);
    expect((await t.pool.query('SELECT status FROM jobs WHERE id = $1', [job.id])).rows[0].status).toBe('leased');
  });
});
```

`packages/shared/test/draft-round.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { draftRound, type StepView } from '../src/index.ts';

const s = (key: StepView['key'], weight: number, status: StepView['status'], progress: number, round: number) => ({ key, weight, status, progress, round });

describe('draftRound (header "Taslak turu k/2")', () => {
  it('is null before the first return, then the round and the loop steps\' own weighted progress', () => {
    const first = [s('research', 19.05, 'done', 100, 0), s('storyboard', 16.67, 'done', 100, 0), s('build', 42.86, 'done', 100, 0), s('draft_render', 9.52, 'done', 100, 0), s('draft_review', 11.9, 'running', 50, 0)];
    expect(draftRound(first)).toBeNull();
    const again = [s('research', 19.05, 'done', 100, 0), s('storyboard', 16.67, 'done', 100, 0), s('build', 42.86, 'done', 100, 1), s('draft_render', 9.52, 'running', 50, 1), s('draft_review', 11.9, 'pending', 0, 1)];
    expect(draftRound(again)).toEqual({ round: 1, percent: Math.round(((42.86 + 9.52 * 0.5) / (42.86 + 9.52 + 11.9)) * 100) });
    expect(draftRound(again.map((x) => (x.key === 'build' ? { ...x, status: 'running' as const, progress: 0 } : x)))!.percent).toBe(7);
  });
});
```

- [ ] **Step 2: Testlerin düştüğünü gör**

Run: `npx vitest run packages/db/test/rewind.test.ts packages/shared/test/draft-round.test.ts`
Expected: FAIL — `rewindForReview` ve `draftRound` export'u yok.

- [ ] **Step 3: Uygula**

Diff (`git apply`):

```diff
--- a/packages/db/src/schema.ts
+++ b/packages/db/src/schema.ts
@@ -223,6 +223,8 @@
     progress: real('progress').notNull().default(0),
     progressSource: text('progress_source'),
     attempt: integer('attempt').notNull().default(0),
+    /** Draft review returns (plan C6, inherited D5): bumped for every step the review sends back; `attempt` restarts per round. */
+    round: integer('round').notNull().default(0),
     inputHash: text('input_hash'),
     sessionId: uuid('session_id'),
     error: text('error'),
--- a/packages/db/src/pipeline.ts
+++ b/packages/db/src/pipeline.ts
@@ -87,7 +87,7 @@
 function toStep(r: Record<string, any>): StepRecord {
   return {
     id: r.id, runId: r.run_id, key: r.key as StepKey, ordinal: r.ordinal, weight: Number(r.weight), status: r.status, progress: Number(r.progress),
-    progressSource: r.progress_source, attempt: r.attempt, sessionId: r.session_id, error: r.error, note: r.note, inputHash: r.input_hash,
+    progressSource: r.progress_source, attempt: r.attempt, round: r.round, sessionId: r.session_id, error: r.error, note: r.note, inputHash: r.input_hash,
     startedAt: iso(r.started_at), endedAt: iso(r.ended_at),
   };
 }
@@ -280,6 +280,42 @@
   return (rowCount ?? 0) > 0;
 }

+/**
+ * Plan C6 (inherited D5): the draft review sends the run back. One transaction: only while the review step is still running in
+ * `round` and its run is running, steps with ordinals from..to become pending with round + 1 and a fresh attempt counter (the
+ * orchestrator's retry budget is per round), and the review's job is closed. A crash before COMMIT changes nothing (the restarted
+ * review replays its stored decision); a replay after COMMIT finds the step pending and changes nothing (no double round).
+ */
+export async function rewindForReview(pool: pg.Pool, o: { runId: string; stepId: string; jobId: number; round: number; fromOrdinal: number; toOrdinal: number; note: string }): Promise<boolean> {
+  const c = await pool.connect();
+  try {
+    await c.query('BEGIN');
+    const live = await c.query(
+      `SELECT 1 FROM steps s JOIN runs r ON r.id = s.run_id
+       WHERE s.id = $1 AND s.status = 'running' AND s.round = $2 AND r.status = 'running' FOR UPDATE OF s, r`,
+      [o.stepId, o.round],
+    );
+    if (!live.rowCount) {
+      await c.query('ROLLBACK');
+      return false;
+    }
+    await c.query(
+      `UPDATE steps SET status = 'pending', round = round + 1, attempt = 0, progress = 0, progress_source = NULL, input_hash = NULL, session_id = NULL,
+         error = NULL, note = $4, started_at = NULL, ended_at = NULL
+       WHERE run_id = $1 AND ordinal BETWEEN $2 AND $3`,
+      [o.runId, o.fromOrdinal, o.toOrdinal, o.note],
+    );
+    await c.query("UPDATE jobs SET status = 'done', lease_owner = NULL, lease_expires_at = NULL WHERE id = $1", [o.jobId]);
+    await c.query('COMMIT');
+    return true;
+  } catch (e) {
+    await c.query('ROLLBACK').catch(() => {});
+    throw e;
+  } finally {
+    c.release();
+  }
+}
+
 /** queued/waiting_* → running only while the run is running: a cancel that lands mid-launch keeps the step from starting. */
 export async function startStepIfRunActive(db: Queryable, stepId: string, attempt: number): Promise<boolean> {
   const { rowCount } = await db.query(
--- a/packages/shared/src/pipeline.ts
+++ b/packages/shared/src/pipeline.ts
@@ -40,6 +40,8 @@
   progress: number;
   progressSource: ProgressSource | null;
   attempt: number;
+  /** Draft review round (0 = first pass; each return to build adds 1 to the steps it reruns). */
+  round: number;
   sessionId: string | null;
   error: string | null;
   note: string | null;
--- a/packages/shared/src/progress.ts
+++ b/packages/shared/src/progress.ts
@@ -1,4 +1,4 @@
-import { STEP_DEFAULT_S, type StepKey, type StepStatus } from './pipeline.ts';
+import { STEP_DEFAULT_S, type StepKey, type StepStatus, type StepView } from './pipeline.ts';

 export interface ProgressStep {
   key: StepKey;
@@ -53,3 +53,19 @@
   }
   return any ? Math.round(left) : null;
 }
+
+/** The steps a draft review sends back (spec §7.1 step 6: "gerekirse 4'e dönüş"). */
+export const DRAFT_LOOP_STEPS: readonly StepKey[] = ['build', 'draft_render', 'draft_review'];
+
+/**
+ * Plan C11 (inherited D5): the header's "Taslak turu k/2 · %N". k is the round of the loop steps, N their own weighted progress
+ * in this round (the run percent stays monotone and does not show the round). Null before the first return.
+ */
+export function draftRound(steps: readonly Pick<StepView, 'key' | 'weight' | 'status' | 'progress' | 'round'>[]): { round: number; percent: number } | null {
+  const loop = steps.filter((s) => DRAFT_LOOP_STEPS.includes(s.key));
+  const round = loop.reduce((m, s) => Math.max(m, s.round), 0);
+  if (!round) return null;
+  const total = loop.reduce((a, s) => a + s.weight, 0);
+  const done = loop.reduce((a, s) => a + s.weight * (s.status === 'done' ? 1 : Math.min(0.99, s.progress / 100)), 0);
+  return { round, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
+}
--- a/apps/web/test/production-view.test.ts
+++ b/apps/web/test/production-view.test.ts
@@ -3,7 +3,7 @@
 import { activeStep, buildFacts, formatDay, formatEta, formatUsage, isRunActive, pickVideoId, sourceLabel, stepDuration, videoTone } from '../src/lib/production-view.ts';

 const step = (over: Partial<StepView>): StepView => ({
-  id: 's', runId: 'r', key: 'research', ordinal: 0, weight: 50, status: 'pending', progress: 0, progressSource: null, attempt: 0,
+  id: 's', runId: 'r', key: 'research', ordinal: 0, weight: 50, status: 'pending', progress: 0, progressSource: null, attempt: 0, round: 0,
   sessionId: null, error: null, note: null, startedAt: null, endedAt: null, ...over,
 });
 const run = (steps: StepView[], status: RunView['status'] = 'running'): RunView => ({ id: 'r', videoId: 'v', kind: 'produce', status, progress: 40, etaS: 200, error: null, createdAt: '', startedAt: null, endedAt: null, steps });
```

Migration'ı üret:

Run: `cd packages/db && npx drizzle-kit generate --name step_round && cd ../.. && cat packages/db/drizzle/0006_step_round.sql`
Expected: `ALTER TABLE "steps" ADD COLUMN "round" integer DEFAULT 0 NOT NULL;` (tek satır; `_journal.json`'a `0006_step_round` girdisi ve `meta/0006_snapshot.json` eklenir).

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run packages/db/test/rewind.test.ts packages/shared/test/draft-round.test.ts && npm run typecheck && npm test`
Expected: `3 passed`; tam paket `Tests  279 passed (279)`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/pipeline.ts packages/db/drizzle packages/shared/src/pipeline.ts packages/shared/src/progress.ts packages/db/test/rewind.test.ts packages/shared/test/draft-round.test.ts apps/web/test/production-view.test.ts
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(db): steps.round (migration 0006) and an atomic, conditional draft rewind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Orchestrator — `rewind` sonucu, GPU adımları tek kapıda, run başlatmada kullanım kapısı, koşullu kurtarma

**Files:**
- Modify: `apps/worker/src/pipeline/types.ts` (`StepContext.round`, `StepOutcome.rewind`, `StepExecutor.extraDiskMb`), `apps/worker/src/render/gate.ts` (`WaitInfo.status`), `apps/worker/src/pipeline/orchestrator.ts`, `apps/worker/src/main.ts` (`locks`, `gate`, `onClear`), `apps/worker/test/{pipeline-steps,build-step}.test.ts` (`StepContext` literal'lerine `round: 0`; zorunlu alan)
- Test: `apps/worker/test/orchestrator-draft.test.ts`

**Interfaces:**
- Consumes: `rewindForReview` (T2), `DRAFT_MAX_RETURNS` (T1), `withResource`, `ResourceLocks`, `UsageGate`.
- Produces:
  - `StepContext.round: number`; `StepOutcome += { status: 'rewind'; to: StepKey; reason: string }`; `StepExecutor.extraDiskMb?: number`.
  - `OrchestratorDeps.locks?: ResourceLocks`, `OrchestratorDeps.gate?: Pick<UsageGate, 'allowsNewPipeline' | 'resumeAt'>`.
  - `Orchestrator.startQueued(): Promise<void>`.
  - `PIPELINE_INCOMPLETE_NOTE('draft_render') = 'Taslak render hazır. Taslak incelemesi bu sürümde henüz yok.'`, `PIPELINE_INCOMPLETE_NOTE('draft_review') = 'Taslak hazır ve incelendi. Final render bu sürümde henüz yok.'`.
  - `LIMIT_NOTE(resumeAt)`.
  - Adım notu "GPU sırası bekleniyor (sırada N)" ya da ön kontrol gerekçesi.

- [ ] **Step 1: Başarısız testi yaz**

`apps/worker/test/orchestrator-draft.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanStep, Resource, StepKey } from '@videogen/shared';
import { claimJob, createProduceRun, enqueueJob, getRunView, getVideoView, listRunSteps, updateRun, updateStep } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { Orchestrator, PIPELINE_INCOMPLETE_NOTE, type OrchestratorDeps } from '../src/pipeline/orchestrator.ts';
import type { Probe } from '../src/pipeline/resources.ts';
import type { StepContext, StepExecutor, StepOutcome } from '../src/pipeline/types.ts';
import { ResourceLocks } from '../src/render/locks.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const orchs: Orchestrator[] = [];
afterEach(async () => { for (const o of orchs.splice(0)) o.stop(); await t.pool.query("UPDATE jobs SET status = 'done' WHERE status IN ('queued', 'leased')"); });

const LOOP: PlanStep[] = [{ key: 'build', weight: 66.67 }, { key: 'draft_render', weight: 14.81 }, { key: 'draft_review', weight: 18.52 }];
const OK_PROBE: Probe = { snapshot: async () => ({ memAvailableMb: 8000, swapUsedPct: 0, diskFreeMb: 50_000, vramFreeMb: 6000, ollamaModels: [] }) };

function exec(key: StepKey, o: { resource?: Resource; run?: (ctx: StepContext) => Promise<StepOutcome> } = {}): StepExecutor & { rounds: number[] } {
  const e = {
    key, resource: o.resource ?? 'claude', rounds: [] as number[],
    inputHash: async (ctx: StepContext) => `h-${key}-${ctx.round}`,
    run: async (ctx: StepContext) => { e.rounds.push(ctx.round); return o.run ? o.run(ctx) : { status: 'done' as const }; },
  };
  return e;
}
function orch(executors: OrchestratorDeps['executors'], over: Partial<OrchestratorDeps> = {}) {
  const o = new Orchestrator({ pool: t.pool, dataDir: mkdtempSync(join(tmpdir(), 'vg-orch-draft-')), executors, tickMs: 20, retryDelayMs: 10, waitDelayMs: 40, timeTickMs: 30, ...over });
  orchs.push(o);
  o.start();
  return o;
}
const produce = (name: string, plan: PlanStep[] = LOOP) => createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
const runStatus = async (id: string) => (await getRunView(t.pool, id))!.status;
const actions = async (runId: string) => (await t.pool.query("SELECT action FROM audit_log WHERE run_id = $1 AND actor_type <> 'user' ORDER BY seq", [runId])).rows.map((r) => r.action as string);
const progressSeries = async (runId: string) =>
  (await t.pool.query("SELECT payload FROM ui_events WHERE topic = 'runs' AND type = 'run.updated' AND payload->>'id' = $1 ORDER BY id", [runId])).rows.map((r) => r.payload.progress as number);

describe('Orchestrator: draft loop, GPU door, usage gate', () => {
  it('a draft review that sends the run back reruns build…draft_review in round 1 with fresh attempts; progress stays monotone', async () => {
    const build = exec('build', { run: async (ctx) => { ctx.progress(60, 'agent'); return { status: 'done' }; } });
    const render = exec('draft_render', { resource: 'gpu' });
    const review = exec('draft_review', { run: async (ctx) => (ctx.round === 0 ? { status: 'rewind', to: 'build', reason: '1 bulgu düzeltilecek: Mekanizma çekimi' } : { status: 'done', note: 'geçti' }) });
    const o = orch({ build, draft_render: render, draft_review: review }, { locks: new ResourceLocks(), probe: OK_PROBE });
    const r = await produce('Kalem döngü');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'), { timeout: 10_000 });
    expect([build.rounds, render.rounds, review.rounds]).toEqual([[0, 1], [0, 1], [0, 1]]);
    const run = (await getRunView(t.pool, r.runId))!;
    expect(run.steps.map((s) => [s.key, s.status, s.round, s.attempt])).toEqual([['build', 'done', 1, 1], ['draft_render', 'done', 1, 1], ['draft_review', 'done', 1, 1]]);
    expect((await actions(r.runId)).filter((a) => a === 'step.rewind')).toHaveLength(1);
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: PIPELINE_INCOMPLETE_NOTE('draft_review') });
    expect(PIPELINE_INCOMPLETE_NOTE('draft_review')).toBe('Taslak hazır ve incelendi. Final render bu sürümde henüz yok.');
    const series = await progressSeries(r.runId);
    expect(series).toEqual([...series].sort((a, b) => a - b));
  });

  it('past two returns the run stops for a human with the review reason (no fourth build)', async () => {
    const build = exec('build');
    const review = exec('draft_review', { run: async () => ({ status: 'rewind', to: 'build', reason: '2 taslak turundan sonra açık bulgu: Mekanizma çekimi' }) });
    const o = orch({ build, draft_render: exec('draft_render'), draft_review: review });
    const r = await produce('Kalem inatçı döngü');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('needs_human'), { timeout: 10_000 });
    expect(build.rounds).toEqual([0, 1, 2]);
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: '2 taslak turundan sonra açık bulgu: Mekanizma çekimi' });
  });

  it('a GPU step waits for the shared lock with its queue position, runs when it is free, and a cancel while waiting leaves no waiter', async () => {
    const locks = new ResourceLocks();
    const release = await locks.acquire('gpu', 'mcp-preview');
    const render = exec('draft_render', { resource: 'gpu' });
    const o = orch({ draft_render: render }, { locks, probe: OK_PROBE });
    const plan: PlanStep[] = [{ key: 'draft_render', weight: 100 }];
    const a = await produce('Kalem kilit', plan);
    await o.startRun(a.runId);
    await vi.waitFor(async () => expect((await listRunSteps(t.pool, a.runId))[0]).toMatchObject({ status: 'waiting_gpu', note: 'GPU sırası bekleniyor (sırada 1)' }));
    expect(render.rounds).toEqual([]);
    release();
    await vi.waitFor(async () => expect(await runStatus(a.runId)).toBe('done'));
    expect(render.rounds).toEqual([0]);

    const again = await locks.acquire('gpu', 'mcp-preview');
    const b = await produce('Kalem kilit iptal', plan);
    await o.startRun(b.runId);
    await vi.waitFor(async () => expect(locks.waiting('gpu')).toBe(1));
    await o.cancel(b.runId);
    await vi.waitFor(() => expect(locks.waiting('gpu')).toBe(0));
    expect(locks.holder('gpu')).toBe('mcp-preview');
    again();
    expect(locks.busy('gpu')).toBe(false);
    expect(render.rounds).toEqual([0]);
  });

  it('usage gate: a run created while pipelines are blocked stays queued with the reason (audited once) and starts when the gate opens', async () => {
    let open = false;
    const gate = { allowsNewPipeline: () => open, resumeAt: () => '2026-10-06T14:00:00.000Z' };
    const research = exec('research');
    const o = orch({ research }, { gate });
    const r = await produce('Kalem kapı', [{ key: 'research', weight: 100 }]);
    await o.startRun(r.runId);
    await o.startRun(r.runId);
    expect(await runStatus(r.runId)).toBe('queued');
    expect((await getVideoView(t.pool, r.videoId))!.statusNote).toMatch(/^Kullanım sınırı yakın: üretim sınır açılınca kendiliğinden başlar \(açılış \d\d:\d\d\)\.$/);
    expect((await actions(r.runId)).filter((a) => a === 'run.deferred_limit')).toHaveLength(1);
    open = true;
    await o.startQueued();
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
    expect(research.rounds).toEqual([0]);
  });

  it('on restart a lease left on a step that is no longer active is closed, not run again', async () => {
    const research = exec('research');
    const r = await produce('Kalem bayat kira', [{ key: 'research', weight: 100 }]);
    await updateRun(t.pool, r.runId, { status: 'running' });
    const step = (await listRunSteps(t.pool, r.runId))[0]!;
    await enqueueJob(t.pool, { stepId: step.id, resource: 'claude' });
    const job = (await claimJob(t.pool, { owner: 'old-worker', resources: ['claude'], leaseMs: 60_000 }))!;
    await updateStep(t.pool, step.id, { status: 'done', progress: 100 });
    const o = orch({ research });
    await o.recover();
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
    expect((await t.pool.query('SELECT status FROM jobs WHERE id = $1', [job.id])).rows[0].status).toBe('cancelled');
    expect(research.rounds).toEqual([]);
  });
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run apps/worker/test/orchestrator-draft.test.ts`
Expected: FAIL. Typecheck dışı koşuda:
- ilk test `rewind` sonucunu bilinmeyen sayar: adım `failed`, beklenen `done`;
- GPU testi kilidi beklemez ("waiting_gpu" gelmez);
- kapı testi run'ı başlatır ("expected 'done' to be 'queued'");
- kurtarma testinde iş `queued` kalır.

- [ ] **Step 3: Uygula**

Diff (`git apply`):

```diff
--- a/apps/worker/src/pipeline/types.ts
+++ b/apps/worker/src/pipeline/types.ts
@@ -5,6 +5,8 @@
   stepId: string;
   key: StepKey;
   attempt: number;
+  /** Draft review round of this step (plan C6): 0 on the first pass, +1 each time the review sends the run back. */
+  round: number;
   videoId: string;
   productId: string;
   productName: string;
@@ -25,11 +27,15 @@
   | { status: 'done'; note?: string }
   | { status: 'needs_human'; reason: string }
   | { status: 'failed'; error: string; retry?: boolean }
-  | { status: 'cancelled' };
+  | { status: 'cancelled' }
+  /** Plan C6 (spec §7.1 step 6): send the run back to the earlier step `to`; the orchestrator reruns `to`…this step in the next round. */
+  | { status: 'rewind'; to: StepKey; reason: string };

 export interface StepExecutor {
   key: StepKey;
   resource: Resource;
+  /** Spec §6.4 disk pre-check: room this step's output needs on top of the 3 GB floor (MB). */
+  extraDiskMb?: number;
   inputHash(ctx: StepContext): Promise<string>;
   /** Spec §14 idempotency: true when a valid output for this input already exists. */
   reuse?(ctx: StepContext, inputHash: string): Promise<boolean>;
--- a/apps/worker/src/render/gate.ts
+++ b/apps/worker/src/render/gate.ts
@@ -1,7 +1,7 @@
 import { precheck, type Probe } from '../pipeline/resources.ts';
 import { AbortedError, type LockedResource, type ResourceLocks } from './locks.ts';

-export interface WaitInfo { position?: number; reason?: string }
+export interface WaitInfo { position?: number; reason?: string; status?: 'waiting_gpu' | 'waiting_disk' }
 export interface GateOptions {
   owner: string;
   signal?: AbortSignal;
@@ -29,7 +29,7 @@
       for (;;) {
         const pc = precheck(r, await o.probe.snapshot(), o.extraDiskMb ?? 0);
         if (pc.ok) break;
-        o.onWait?.({ reason: pc.reason });
+        o.onWait?.({ reason: pc.reason, status: pc.status });
         await sleep(o.waitMs ?? 15_000, o.signal);
       }
     }
--- a/apps/worker/src/pipeline/orchestrator.ts
+++ b/apps/worker/src/pipeline/orchestrator.ts
@@ -1,15 +1,18 @@
 import { join } from 'node:path';
 import type pg from 'pg';
 import {
-  ACTIVE_STEP_STATUSES, etaSeconds, expectedSeconds, overallPercent, STEP_LABELS, timeCurvePercent,
+  ACTIVE_STEP_STATUSES, DRAFT_MAX_RETURNS, etaSeconds, expectedSeconds, overallPercent, STEP_LABELS, timeCurvePercent,
   type ProgressSource, type ProgressStep, type Resource, type RunStatus, type StepKey,
 } from '@videogen/shared';
 import {
   appendAudit, cancelRunJobs, claimJob, enqueueJob, finishJob, getRun, getRunContext, getStep, heartbeatJobs, latestUsageMark, listRunSteps,
-  bumpStepProgress, publishRunAndVideo, queueStepIfRunActive, raiseRunProgress, recoverJobs, setStepStatusIfActive, requeueJob, startStepIfRunActive, stepHistorySeconds, updateRun, updateStep, updateVideo,
+  bumpStepProgress, publishRunAndVideo, queueStepIfRunActive, raiseRunProgress, recoverJobs, rewindForReview, setStepStatusIfActive, requeueJob, startStepIfRunActive, stepHistorySeconds, updateRun, updateStep, updateVideo,
   type JobRecord, type RunContext, type StepRecord,
 } from '@videogen/db';
+import type { UsageGate } from '../agents/manager.ts';
 import { errorTag } from '../errors.ts';
+import { withResource } from '../render/gate.ts';
+import type { LockedResource, ResourceLocks } from '../render/locks.ts';
 import { precheck, type Probe } from './resources.ts';
 import type { StepContext, StepExecutor, StepOutcome } from './types.ts';

@@ -18,6 +21,10 @@
   dataDir: string;
   executors: Partial<Record<StepKey, StepExecutor>>;
   probe?: Probe;
+  /** Plan C21: GPU and heavy-CPU steps go through the same in-process lock and §6.4 gate as the MCP render tools (K22, B8). */
+  locks?: ResourceLocks;
+  /** Plan C25 (spec §6.4, M4a minor 4): no new run starts while the usage guard blocks pipelines. */
+  gate?: Pick<UsageGate, 'allowsNewPipeline' | 'resumeAt'>;
   owner?: string;
   capacity?: Partial<Record<Resource, number>>;
   leaseMs?: number;
@@ -42,8 +49,14 @@
   research: 'Storyboard, sahne kurulumu ve taslak render bu sürümde henüz yok.',
   storyboard: 'Sahne kurulumu ve taslak render bu sürümde henüz yok.',
   build: 'Taslak render bu sürümde henüz yok.',
+  draft_render: 'Taslak incelemesi bu sürümde henüz yok.',
 };
-export const PIPELINE_INCOMPLETE_NOTE = (last: StepKey) => `${STEP_LABELS[last]} hazır. ${NOT_YET[last] ?? 'Sonraki adımlar bu sürümde henüz yok.'}`;
+/** M4 ends with a reviewed draft (spec §17: S2 with the draft instead of the final); final render, sound and review gates are M5. */
+const DONE_NOTE: Partial<Record<StepKey, string>> = { draft_review: 'Taslak hazır ve incelendi. Final render bu sürümde henüz yok.' };
+export const PIPELINE_INCOMPLETE_NOTE = (last: StepKey) => DONE_NOTE[last] ?? `${STEP_LABELS[last]} hazır. ${NOT_YET[last] ?? 'Sonraki adımlar bu sürümde henüz yok.'}`;
+/** Plan C25: why a run waits in the queue (no Turkish case suffix on the time). */
+export const LIMIT_NOTE = (resumeAt: string | null) =>
+  `Kullanım sınırı yakın: üretim sınır açılınca kendiliğinden başlar${resumeAt ? ` (açılış ${new Date(resumeAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })})` : ''}.`;

 interface Running { jobId: number; stepId: string; runId: string; resource: Resource; abort: AbortController }

@@ -88,12 +101,15 @@
     for (const j of await recoverJobs(pool, { owner: this.owner, foreign: true })) {
       const step = await getStep(pool, j.stepId);
       if (!step) continue;
-      await updateStep(pool, step.id, { status: 'queued', note: 'worker yeniden başladı' });
+      // Grilling C6: only an active step goes back to the queue; a lease left on a finished or rewound step is stale.
+      if (!(await setStepStatusIfActive(pool, step.id, 'queued', 'worker yeniden başladı'))) {
+        await finishJob(pool, j.jobId, 'cancelled');
+        continue;
+      }
       await this.audit('job.recovered', step.runId, { stepId: step.id, data: { jobId: j.jobId } });
       await this.publish(step.runId);
     }
-    const queued = await pool.query("SELECT id FROM runs WHERE status = 'queued' ORDER BY created_at");
-    for (const r of queued.rows) await this.startRun(r.id);
+    await this.startQueued();
     const idle = await pool.query(
       `SELECT r.id FROM runs r WHERE r.status = 'running' AND NOT EXISTS (
          SELECT 1 FROM jobs j JOIN steps s ON s.id = j.step_id WHERE s.run_id = r.id AND j.status IN ('queued', 'leased'))`,
@@ -102,15 +118,32 @@
     this.kick();
   }

+  /** Queued runs in order (worker start, and the usage guard clearing: plan C25). */
+  async startQueued(): Promise<void> {
+    const { rows } = await this.d.pool.query("SELECT id FROM runs WHERE status = 'queued' ORDER BY created_at");
+    for (const r of rows) await this.startRun(r.id);
+  }
+
   async startRun(runId: string): Promise<void> {
     const ctx = await getRunContext(this.d.pool, runId);
     if (!ctx || ctx.run.status !== 'queued') return;
+    if (this.d.gate && !this.d.gate.allowsNewPipeline()) return this.deferRun(ctx);
     await updateRun(this.d.pool, runId, { status: 'running', startedAt: new Date(), usageStart: await latestUsageMark(this.d.pool) });
     await updateVideo(this.d.pool, ctx.videoId, { status: 'running', statusNote: null });
     await this.audit('run.started', runId, { data: { videoId: ctx.videoId, plan: ctx.run.plan.map((s) => s.key) } });
     await this.advance(runId);
   }

+  /** Plan C25: the run stays queued with the reason on the video; audited once per reason (the note is the marker, it survives a restart). */
+  private async deferRun(ctx: RunContext): Promise<void> {
+    const note = LIMIT_NOTE(this.d.gate!.resumeAt());
+    const { rows } = await this.d.pool.query('SELECT status_note FROM videos WHERE id = $1', [ctx.videoId]);
+    if (rows[0]?.status_note === note) return;
+    await updateVideo(this.d.pool, ctx.videoId, { statusNote: note });
+    await this.audit('run.deferred_limit', ctx.run.id, { data: { resumeAt: this.d.gate!.resumeAt() } });
+    await this.publish(ctx.run.id);
+  }
+
   async cancel(runId: string, actor: 'user' | 'orchestrator' = 'user'): Promise<boolean> {
     const { pool } = this.d;
     const run = await getRun(pool, runId);
@@ -178,8 +211,9 @@
       await finishJob(pool, job.id, 'cancelled');
       return;
     }
-    if (ex.resource !== 'claude' && this.d.probe) {
-      const pc = precheck(ex.resource, await this.d.probe.snapshot());
+    // With locks the pre-check runs inside the gate (plan C21: one door); without them (tests) it stays here.
+    if (ex.resource !== 'claude' && this.d.probe && !this.d.locks) {
+      const pc = precheck(ex.resource, await this.d.probe.snapshot(), ex.extraDiskMb ?? 0);
       if (!pc.ok) {
         await requeueJob(pool, job.id, this.d.waitDelayMs ?? 15_000);
         if ((step.status !== pc.status || step.note !== pc.reason) && (await setStepStatusIfActive(pool, step.id, pc.status, pc.reason))) {
@@ -205,11 +239,13 @@
   }

   private stepContext(ctx: RunContext, step: StepRecord, attempt: number, signal: AbortSignal): StepContext {
+    // Status changes of one step apply in order (a late "waiting_gpu" must not overwrite the "running" that followed it).
+    let statuses = Promise.resolve();
     return {
-      runId: step.runId, stepId: step.id, key: step.key, attempt, videoId: ctx.videoId, productId: ctx.productId, productName: ctx.productName,
+      runId: step.runId, stepId: step.id, key: step.key, attempt, round: step.round, videoId: ctx.videoId, productId: ctx.productId, productName: ctx.productName,
       audioMode: ctx.audioMode, versionId: ctx.versionId, runDir: join(this.d.dataDir, 'runs', step.runId), signal,
       progress: (pct, source) => { void this.stepProgress(step.id, pct, source); },
-      status: (s, note) => { void this.stepStatus(step.id, s, note); },
+      status: (s, note) => { statuses = statuses.then(() => this.stepStatus(step.id, s, note)).catch(() => {}); },
       session: (sessionId) => { void updateStep(this.d.pool, step.id, { sessionId }).then(() => this.publish(step.runId)); },
     };
   }
@@ -219,7 +255,9 @@
     try {
       const hash = await ex.inputHash(ctx);
       await updateStep(this.d.pool, step.id, { inputHash: hash });
-      outcome = (await ex.reuse?.(ctx, hash)) ? { status: 'done', note: 'önceki geçerli çıktı kullanıldı' } : await ex.run(ctx, hash);
+      if (await ex.reuse?.(ctx, hash)) outcome = { status: 'done', note: 'önceki geçerli çıktı kullanıldı' };
+      else if (ex.resource !== 'claude' && this.d.locks) outcome = await this.gated(ex, ctx, () => ex.run(ctx, hash));
+      else outcome = await ex.run(ctx, hash);
     } catch (e) {
       outcome = ctx.signal.aborted ? { status: 'cancelled' } : { status: 'failed', error: errorTag(e) };
     }
@@ -230,6 +268,15 @@
     this.kick();
   }

+  /** Plan C21 (K22, B8): the in-process lock, then the §6.4 pre-check in a loop, then the work; the lock is released in any case. */
+  private gated(ex: StepExecutor, ctx: StepContext, fn: () => Promise<StepOutcome>): Promise<StepOutcome> {
+    return withResource(this.d.locks!, ex.resource as LockedResource, {
+      owner: ctx.stepId, signal: ctx.signal, probe: this.d.probe, extraDiskMb: ex.extraDiskMb, waitMs: this.d.waitDelayMs,
+      onWait: (w) => ctx.status(w.status ?? 'waiting_gpu', w.reason ?? `GPU sırası bekleniyor (sırada ${w.position ?? 1})`),
+      onRun: () => ctx.status('running', null),
+    }, fn);
+  }
+
   private async settle(step: StepRecord, attempt: number, job: JobRecord, o: StepOutcome): Promise<void> {
     const { pool } = this.d;
     const run = await getRun(pool, step.runId);
@@ -237,6 +284,7 @@
       await finishJob(pool, job.id, 'cancelled');
       return;
     }
+    if (o.status === 'rewind') return this.rewind(step, attempt, job, o);
     if (o.status === 'done' || o.status === 'needs_human') {
       await finishJob(pool, job.id, 'done');
       await updateStep(pool, step.id, { status: 'done', progress: 100, endedAt: new Date(), note: o.status === 'done' ? (o.note ?? null) : o.reason });
@@ -265,6 +313,23 @@
     return this.finish(step.runId, 'failed', `${STEP_LABELS[step.key]}: ${o.error}`);
   }

+  /** Plan C6: the draft review sends the run back to `to`; past DRAFT_MAX_RETURNS the run stops for a human with the reason. */
+  private async rewind(step: StepRecord, attempt: number, job: JobRecord, o: Extract<StepOutcome, { status: 'rewind' }>): Promise<void> {
+    const { pool } = this.d;
+    const target = (await listRunSteps(pool, step.runId)).find((s) => s.key === o.to);
+    if (!target || target.ordinal >= step.ordinal) return this.settle(step, attempt, job, { status: 'failed', error: `geçersiz geri dönüş: ${o.to}`, retry: false });
+    if (step.round >= DRAFT_MAX_RETURNS) return this.settle(step, attempt, job, { status: 'needs_human', reason: o.reason });
+    const round = step.round + 1;
+    const note = `taslak turu ${round}/${DRAFT_MAX_RETURNS}: ${o.reason}`.slice(0, 300);
+    if (!(await rewindForReview(pool, { runId: step.runId, stepId: step.id, jobId: job.id, round: step.round, fromOrdinal: target.ordinal, toOrdinal: step.ordinal, note }))) {
+      await finishJob(pool, job.id, 'cancelled');
+      return;
+    }
+    await this.audit('step.rewind', step.runId, { stepId: step.id, data: { key: step.key, to: o.to, round, reason: o.reason } });
+    await this.recompute(step.runId);
+    return this.advance(step.runId);
+  }
+
   /** Queue the first pending step, or finish the run when none is left. */
   private async advance(runId: string): Promise<void> {
     const { pool } = this.d;
--- a/apps/worker/src/main.ts
+++ b/apps/worker/src/main.ts
@@ -54,7 +54,7 @@
   tools: sceneToolHost({ pool, render, locks, probe, ffmpeg: config.render.ffmpeg, capability: () => renderCapability }),
 });
 const orchestrator = new Orchestrator({
-  pool, dataDir: config.dataDir, probe,
+  pool, dataDir: config.dataDir, probe, locks, gate: guard,
   executors: pipelineExecutors({
     pool, dataDir: config.dataDir, manager, fakeScript: driver.kind === 'fake' ? fakePipelineScript : undefined,
     scene: { pool, render, locks, probe, ffmpeg: config.render.ffmpeg, capability: () => renderCapability },
@@ -62,7 +62,7 @@
 });
 const chat = new ChatService({ pool, manager });
 chat.bind();
-guard.onClear(() => { void chat.resumeWaiting(); });
+guard.onClear(() => { void chat.resumeWaiting(); void orchestrator.startQueued(); });

 const audit = (action: string, data: Record<string, unknown>) => appendAudit(pool, { actorType: 'system', action, data }).catch(() => {});
 const safeRefresh = () => refreshAuth(pool, authSrc).catch((e) => audit('claude.refresh_failed', { error: errorTag(e) }));
--- a/apps/worker/test/pipeline-steps.test.ts
+++ b/apps/worker/test/pipeline-steps.test.ts
@@ -42,7 +42,7 @@
   const calls = { progress: [] as number[], status: [] as string[], sessions: [] as string[] };
   const abort = new AbortController();
   const ctx = (i: 0 | 1): StepContext => ({
-    runId: r.runId, stepId: steps[i]!.id, key: steps[i]!.key, attempt: 1, videoId: r.videoId, productId: r.productId, productName: name.trim(), audioMode,
+    runId: r.runId, stepId: steps[i]!.id, key: steps[i]!.key, attempt: 1, round: 0, videoId: r.videoId, productId: r.productId, productName: name.trim(), audioMode,
     versionId: r.versionId, runDir: join(deps.dataDir, 'runs', r.runId), signal: abort.signal,
     progress: (p) => { calls.progress.push(p); }, status: (s) => { calls.status.push(s); }, session: (id) => { calls.sessions.push(id); },
   });
--- a/apps/worker/test/build-step.test.ts
+++ b/apps/worker/test/build-step.test.ts
@@ -54,7 +54,7 @@
   const step = (await listRunSteps(t.pool, r.runId)).find((s) => s.key === 'build')!;
   const calls = { status: [] as string[], sessions: [] as string[] };
   const ctx: StepContext = {
-    runId: r.runId, stepId: step.id, key: 'build', attempt, videoId: r.videoId, productId: r.productId, productName: name, audioMode, versionId: r.versionId, runDir,
+    runId: r.runId, stepId: step.id, key: 'build', attempt, round: 0, videoId: r.videoId, productId: r.productId, productName: name, audioMode, versionId: r.versionId, runDir,
     signal: new AbortController().signal, progress: () => {}, status: (s) => { calls.status.push(s); }, session: (id) => { calls.sessions.push(id); },
   };
   return { r, ctx, calls };
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/orchestrator-draft.test.ts apps/worker/test/orchestrator.test.ts && npm run typecheck && npm test`
Expected: yeni dosya `5 passed`; eski orchestrator testleri değişmeden geçer (kilit verilmeyen yol aynı); tam paket `Tests  284 passed (284)`.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/pipeline/types.ts apps/worker/src/render/gate.ts apps/worker/src/pipeline/orchestrator.ts apps/worker/src/main.ts apps/worker/test/orchestrator-draft.test.ts apps/worker/test/pipeline-steps.test.ts apps/worker/test/build-step.test.ts
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(orchestrator): draft rewind, GPU steps behind the shared lock, usage gate at run start

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `packages/remotion` I — `Draft3D`, `draftProps`, güvenli alan yerleşimi, `bundleHash`

**Files:**
- Create: `packages/remotion/package.json`, `packages/remotion/src/{props.ts, Draft3D.tsx, Root.tsx, entry.ts, index.ts, hash.ts}`
- Modify: `package-lock.json` (`npm install`)
- Test: `packages/remotion/test/props.test.ts`

**Interfaces:**
- Consumes: `SceneClock`, `sceneCamera`, `applyFrameFov`, `projectAnchor`, `parseGlb` (`@videogen/scene3d`); `ChannelStyle`, `SceneSpec`, `Storyboard` türleri.
- Produces:
  - `@videogen/remotion` (tarayıcı): `Draft3D`, `props.ts`'in tamamı.
  - `@videogen/remotion/props`: `type DraftProps` (tip takma adı), `draftProps({glbUrl, yfov, width, height, scene, storyboard, style})`, `activeBeat`, `safeRect`, `draftLayout`, `placeLabels(anchors, w, h, area?)`, `DRAFT_COMPOSITION = 'Draft3D'`, `DRAFT_FPS = 30`, `MAX_LABELS = 6`.
  - `@videogen/remotion/hash` (Node, hafif): `bundleHash(): string` (16 hex), `DRAFT_RENDER`.
  - `entry.ts` = bundler girişi (`registerRoot(Root)`).

- [ ] **Step 1: Başarısız testi yaz**

`packages/remotion/test/props.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { bundleHash, DRAFT_RENDER } from '../src/hash.ts';
import { activeBeat, draftLayout, draftProps, MAX_LABELS, placeLabels, safeRect, type LabelBox, type Rect } from '../src/props.ts';

const fx = <T>(n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8')) as T;
const track = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/scene/kalem/camera_track.json'), 'utf8')) as { yfov: number[] };

const inside = (b: LabelBox, r: Rect) => b.x >= r.left && b.x + b.w <= r.right && b.y >= r.top && b.y + b.h <= r.bottom;
const overlap = (a: LabelBox, b: LabelBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('Draft3D props and layout', () => {
  it('maps the pen scene, storyboard and channel style to serialisable composition props', () => {
    const p = draftProps({ glbUrl: '/api/blobs/x', yfov: track.yfov, width: 540, height: 960, scene: fx<SceneSpec>('scene-kalem'), storyboard: fx<Storyboard>('storyboard-kalem'), style: CHANNEL_STYLES.gece_mavisi });
    expect(p).toMatchObject({ frames: 1350, width: 540, height: 960, lighting: 'key_rim_cool', hook: "0,7 mm'lik bir bilye her şeyi yazıyor", background: CHANNEL_STYLES.gece_mavisi.background });
    expect(p.yfov).toHaveLength(1351);
    expect(p.beats).toHaveLength(7);
    expect(p.beats[1]).toEqual({ t_start: 3, t_end: 9, text: 'Tam 5 parça', parts: ['govde', 'murekkep-haznesi', 'yay', 'uc-yuvasi'] });
    expect(p.labels).toMatchObject({ govde: 'Gövde', bilye: 'Bilye' });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(activeBeat(p.beats, 0)!.index).toBe(0);
    expect(activeBeat(p.beats, 3)!.index).toBe(1);
    expect(activeBeat(p.beats, 45)!.index).toBe(6); // the last frame keeps the last beat
  });

  it('keeps every label inside the safe area and the label band, without overlaps, at most six, none for anchors behind the camera', () => {
    expect(safeRect(540, 960)).toEqual({ left: 12, top: 75, right: 475, bottom: 755 });
    const L = draftLayout(540, 960);
    expect(L.labelArea.top).toBeGreaterThan(L.hookTop);
    expect(L.labelArea.bottom).toBeLessThan(L.safe.bottom);
    // Crowded, off-screen and edge anchors: right edge, below the frame, above it, all at one height.
    const at: ([number, number] | null)[] = [[530, 20], [520, 950], [5, 500], [270, 500], [270, 500], [270, 501], [100, 900], null];
    const boxes = placeLabels(at.map((a, i) => ({ id: `p${i}`, text: i === 2 ? 'Çok uzun bir parça adı örneği' : `Parça ${i}`, at: a })), 540, 960, L.labelArea);
    expect(boxes).toHaveLength(MAX_LABELS);
    expect(boxes.map((b) => b.id)).not.toContain('p7');
    for (const b of boxes) expect(inside(b, L.labelArea), JSON.stringify(b)).toBe(true);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
    // Room on the right: the label sits right of its anchor; none: it flips left.
    expect(placeLabels([{ id: 'a', text: 'Yay', at: [100, 400] }], 540, 960)[0]!.x).toBeGreaterThan(100);
    const flipped = placeLabels([{ id: 'b', text: 'Mürekkep haznesi', at: [460, 400] }], 540, 960)[0]!;
    expect(flipped.x + flipped.w).toBeLessThan(460);
  });

  it('names the bundle by a stable template hash and pins the draft render parameters', () => {
    expect(bundleHash()).toMatch(/^[0-9a-f]{16}$/);
    expect(bundleHash()).toBe(bundleHash());
    expect(DRAFT_RENDER).toMatchObject({ width: 540, height: 960, fps: 30, pixelFormat: 'yuv420p', colorSpace: 'bt709' });
  });
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run packages/remotion/test/props.test.ts`
Expected: FAIL — `../src/hash.ts` / `../src/props.ts` yok.

- [ ] **Step 3: Uygula**

`packages/remotion/package.json` (T5 bu dosyayı `@remotion/bundler`/`@remotion/renderer` ve `./render` export'uyla genişletir):

```json
{
  "name": "@videogen/remotion",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./props": "./src/props.ts",
    "./hash": "./src/hash.ts"
  },
  "dependencies": {
    "@react-three/fiber": "9.8.1",
    "@remotion/three": "4.0.533",
    "@videogen/scene3d": "*",
    "@videogen/shared": "*",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "remotion": "4.0.533",
    "three": "0.186.1"
  },
  "devDependencies": { "@types/three": "0.186.0" }
}
```

`packages/remotion/src/props.ts`:

```ts
import type { ChannelStyle, SceneSpec, Storyboard } from '@videogen/shared/browser';

/** Remotion composition id of the draft (spec §7.1 step 5). */
export const DRAFT_COMPOSITION = 'Draft3D';
export const DRAFT_FPS = 30;
/** Spec §8.1 D5: at most six labels on screen at once (placed by construction, never asked to the reviewer). */
export const MAX_LABELS = 6;

export interface DraftBeat { t_start: number; t_end: number; text: string; parts: string[] }
/**
 * Everything the composition needs, serialisable (Remotion inputProps and Player props). A type alias, not an interface:
 * Remotion props must be assignable to Record<string, unknown>.
 */
export type DraftProps = {
  /** GLB URL: the media endpoint in the Player, a one-time token URL in the renderer (plan C14). */
  glbUrl: string;
  /** camera_track.json: vertical FOV (radians) of every frame 0…frames (glTF does not animate the lens). */
  yfov: number[];
  /** SceneSpec.frames: the last frame; the composition has frames + 1. */
  frames: number;
  width: number;
  height: number;
  background: ChannelStyle['background'];
  text: ChannelStyle['text'];
  lighting: ChannelStyle['lighting'];
  hook: string;
  beats: DraftBeat[];
  /** Part id → Turkish label. */
  labels: Record<string, string>;
};

export function draftProps(o: {
  glbUrl: string; yfov: number[]; width: number; height: number;
  scene: Pick<SceneSpec, 'frames' | 'parts'>; storyboard: Pick<Storyboard, 'hook' | 'beats'>; style: Pick<ChannelStyle, 'background' | 'text' | 'lighting'>;
}): DraftProps {
  return {
    glbUrl: o.glbUrl, yfov: o.yfov, frames: o.scene.frames, width: o.width, height: o.height,
    background: o.style.background, text: o.style.text, lighting: o.style.lighting,
    hook: o.storyboard.hook.text_tr,
    beats: o.storyboard.beats.map((b) => ({ t_start: b.t_start, t_end: b.t_end, text: b.onscreen_text.tr, parts: b.parts.slice(0, MAX_LABELS) })),
    labels: Object.fromEntries(o.scene.parts.map((p) => [p.id, p.name_tr])),
  };
}

/** The beat on screen at `t` seconds (the last beat holds through the final frame). */
export function activeBeat(beats: DraftBeat[], t: number): { index: number; beat: DraftBeat } | null {
  if (!beats.length) return null;
  const i = beats.findIndex((b) => t >= b.t_start && t < b.t_end);
  const index = i >= 0 ? i : t >= beats.at(-1)!.t_end ? beats.length - 1 : 0;
  return { index, beat: beats[index]! };
}

export interface Rect { left: number; top: number; right: number; bottom: number }
/** Spec §8.1 G6 at 1080×1920 (no text above 150 px, below 1510 px or in the right 130 px), scaled; plus a 24 px left margin. */
export function safeRect(width: number, height: number): Rect {
  const sx = width / 1080;
  const sy = height / 1920;
  return { left: Math.round(24 * sx), top: Math.round(150 * sy), right: Math.round(width - 130 * sx), bottom: Math.round(1510 * sy) };
}

/** Text bands of the draft: the hook at the top of the safe area, the beat line at its bottom; labels live between them. */
export function draftLayout(width: number, height: number): { safe: Rect; hookTop: number; hookFont: number; lineBottom: number; lineFont: number; labelArea: Rect } {
  const s = width / 1080;
  const safe = safeRect(width, height);
  const hookFont = Math.round(68 * s); // D5: hook ≥ 64 px at 1080
  const lineFont = Math.round(52 * s);
  const hookTop = safe.top + Math.round(16 * s);
  const lineBottom = height - safe.bottom + Math.round(16 * s);
  return { safe, hookTop, hookFont, lineBottom, lineFont, labelArea: { ...safe, top: hookTop + Math.round(hookFont * 2.4), bottom: safe.bottom - Math.round(lineFont * 2.6) } };
}

export interface LabelBox { id: string; text: string; ax: number; ay: number; x: number; y: number; w: number; h: number; font: number }

/**
 * Labels beside their anchors, inside `area` (default: the safe area), never overlapping: top-down by anchor height, then pushed
 * up from the bottom edge if the stack overflows. At most MAX_LABELS; an anchor behind the camera (null) gets no label.
 */
export function placeLabels(anchors: { id: string; text: string; at: [number, number] | null }[], width: number, height: number, area: Rect = safeRect(width, height)): LabelBox[] {
  const s = width / 1080;
  const font = Math.round(44 * s); // D5: labels 40–56 px at 1080
  const pad = Math.round(12 * s);
  const h = font + 2 * pad;
  const gap = Math.round(10 * s);
  const reach = Math.round(40 * s);
  const boxes: LabelBox[] = [];
  let floor = area.top;
  for (const a of anchors.filter((x) => x.at).slice(0, MAX_LABELS).sort((p, q) => p.at![1] - q.at![1])) {
    const [ax, ay] = a.at!;
    const w = Math.min(area.right - area.left, Math.round(a.text.length * font * 0.56 + 2 * pad));
    const x = Math.max(area.left, Math.min(ax + reach + w <= area.right ? ax + reach : ax - reach - w, area.right - w));
    const y = Math.max(floor, Math.round(ay - h / 2));
    boxes.push({ id: a.id, text: a.text, ax, ay, x, y, w, h, font });
    floor = y + h + gap;
  }
  for (let i = boxes.length - 1, limit = area.bottom; i >= 0; i--) {
    const b = boxes[i]!;
    b.y = Math.min(b.y, limit - b.h);
    limit = b.y - gap;
  }
  return boxes;
}
```

`packages/remotion/src/Draft3D.tsx`:

```tsx
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AbsoluteFill, cancelRender, continueRender, delayRender, interpolate, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyFrameFov, parseGlb, projectAnchor, sceneCamera, SceneClock } from '@videogen/scene3d';
import { activeBeat, DRAFT_FPS, draftLayout, placeLabels, type DraftProps, type LabelBox } from './props.ts';

type Vec = [number, number, number];
/** Draft approximations of the vg_blender studio presets (y-up glTF space). The environment map gives metals something to reflect (M4b §8). */
const LIGHTS: Record<DraftProps['lighting'], { ambient: number; key: { pos: Vec; color: string; i: number }; rim: { pos: Vec; color: string; i: number } }> = {
  key_rim_warm: { ambient: 0.35, key: { pos: [60, 90, 80], color: '#ffe2bf', i: 2.4 }, rim: { pos: [-80, 60, -60], color: '#ffd28a', i: 1.6 } },
  key_rim_cool: { ambient: 0.35, key: { pos: [60, 90, 80], color: '#eaf2ff', i: 2.4 }, rim: { pos: [-80, 60, -60], color: '#5cc8ff', i: 1.8 } },
  soft_box: { ambient: 0.8, key: { pos: [0, 120, 100], color: '#ffffff', i: 1.8 }, rim: { pos: [0, 80, -100], color: '#ffffff', i: 0.8 } },
};

/** The GLB once per URL; Remotion waits for it (delayRender) and fails the render loudly if it cannot load. */
function useGltf(url: string): GLTF | null {
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
 * Transparent canvas (r3f default sRGB output, not `linear`: grilling C29) over the channel style's backdrop, the hook and beat
 * lines inside the safe area, and up to six labels anchored with the same math as the equivalence check (packages/scene3d).
 */
export const Draft3D: React.FC<DraftProps> = (p) => {
  const frame = useCurrentFrame();
  const gltf = useGltf(p.glbUrl);
  const rig = useMemo(() => (gltf ? { clock: new SceneClock(gltf), cam: sceneCamera(gltf) } : null), [gltf]);
  const t = frame / DRAFT_FPS;
  const beat = activeBeat(p.beats, t);
  const L = draftLayout(p.width, p.height);
  const s = p.width / 1080;
  let labels: LabelBox[] = [];
  if (gltf && rig) {
    // History-free seek (probe P6) + per-frame lens, before the canvas renders this frame.
    rig.clock.seek(t);
    applyFrameFov(rig.cam, { fps: DRAFT_FPS, yfov: p.yfov }, frame, p.width, p.height);
    const anchors = (beat?.beat.parts ?? []).map((id) => ({ id, text: p.labels[id] ?? id, at: projectAnchor(gltf, rig.cam, id, p.width, p.height) }));
    labels = placeLabels(anchors, p.width, p.height, L.labelArea);
  }
  const fade = beat ? interpolate(frame - Math.round(beat.beat.t_start * DRAFT_FPS), [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${p.background.top}, ${p.background.bottom})`, fontFamily: 'Inter, "DejaVu Sans", sans-serif' }}>
      {gltf && rig ? (
        <ThreeCanvas width={p.width} height={p.height}>
          <Stage gltf={gltf} cam={rig.cam} lighting={p.lighting} />
        </ThreeCanvas>
      ) : null}
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
        <div data-text="hook" style={{ position: 'absolute', left: L.safe.left, top: L.hookTop, width: L.safe.right - L.safe.left, fontSize: L.hookFont, fontWeight: 500, lineHeight: 1.15, color: p.text.color }}>{p.hook}</div>
      ) : beat ? (
        <div data-text="beat" style={{ position: 'absolute', left: L.safe.left, bottom: L.lineBottom, width: L.safe.right - L.safe.left, opacity: fade, fontSize: L.lineFont, fontWeight: 500, lineHeight: 1.25, color: p.text.color }}>
          <span style={{ background: p.text.plate, padding: `${6 * s}px ${14 * s}px`, borderRadius: 10 * s, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{beat.beat.text}</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
```

`packages/remotion/src/Root.tsx`:

```tsx
import React from 'react';
import { Composition } from 'remotion';
import { Draft3D } from './Draft3D.tsx';
import { DRAFT_COMPOSITION, DRAFT_FPS, type DraftProps } from './props.ts';

/** Placeholder props; the renderer and the Player always pass real ones (calculateMetadata sizes the composition from them). */
export const EMPTY_DRAFT: DraftProps = {
  glbUrl: '', yfov: [0.5, 0.5], frames: 1, width: 540, height: 960,
  background: { top: '#16203a', bottom: '#070a14' }, text: { color: '#eef3ff', plate: 'rgba(8,12,24,0.72)', line: '#5cc8ff', accent: '#5cc8ff' },
  lighting: 'key_rim_cool', hook: '', beats: [], labels: {},
};

export const Root: React.FC = () => (
  <Composition
    id={DRAFT_COMPOSITION}
    component={Draft3D}
    fps={DRAFT_FPS}
    width={540}
    height={960}
    durationInFrames={2}
    defaultProps={EMPTY_DRAFT}
    calculateMetadata={({ props }) => ({ durationInFrames: props.frames + 1, width: props.width, height: props.height })}
  />
);
```

`packages/remotion/src/entry.ts`:

```ts
import { registerRoot } from 'remotion';
import { Root } from './Root.tsx';

/** @remotion/bundler entry point (packages/remotion/src/render.ts bundles this file). */
registerRoot(Root);
```

`packages/remotion/src/index.ts`:

```ts
/** Browser entry: the composition for @remotion/player (apps/web) and its pure helpers. */
export { Draft3D } from './Draft3D.tsx';
export * from './props.ts';
```

`packages/remotion/src/hash.ts`:

```ts
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname);
const SCENE3D = resolve(import.meta.dirname, '../../scene3d/src');
const PKG = resolve(import.meta.dirname, '../package.json');
/** Node-only files: they are not part of the browser bundle, so editing them must not invalidate drafts. */
const NODE_ONLY = new Set(['hash.ts', 'render.ts', 'render-cli.ts']);

/** Fixed draft render parameters (plan C12); part of the §8.3 input hash. */
export const DRAFT_RENDER = { width: 540, height: 960, fps: 30, codec: 'h264', crf: 18, x264Preset: 'veryfast', pixelFormat: 'yuv420p', colorSpace: 'bt709' } as const;

const sources = (dir: string, skip = new Set<string>()) =>
  (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f) && !skip.has(f)).sort();

/**
 * Spec §8.3 / plan C15: the template's identity — every source file that ends up in the Remotion bundle (this package and
 * packages/scene3d) plus the pinned dependency versions. Names the bundle cache directory and enters the draft's input hash.
 */
export function bundleHash(): string {
  const h = createHash('sha256');
  for (const [tag, dir, files] of [['remotion', SRC, sources(SRC, NODE_ONLY)], ['scene3d', SCENE3D, sources(SCENE3D)]] as const) {
    for (const f of files) {
      h.update(`${tag}/${f}\n`);
      h.update(readFileSync(join(dir, f)));
    }
  }
  h.update(JSON.stringify((JSON.parse(readFileSync(PKG, 'utf8')) as { dependencies: unknown }).dependencies));
  return h.digest('hex').slice(0, 16);
}
```

Run: `npm install` (workspace yeni paketi bağlar; P8: esbuild install script uyarısı zararsız, onay gerekmez).
Expected: `node_modules/@videogen/remotion` → `packages/remotion` symlink'i, `node_modules/remotion/package.json` sürümü `4.0.533`.

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run packages/remotion/test/props.test.ts && npm run typecheck && npm test`
Expected:
- `3 passed`; tam paket `Tests  287 passed (287)`.
- Typecheck `Draft3D.tsx`'i (r3f JSX öğeleri, Remotion `Composition` tipleri) de denetler.
- Bileşenin gerçek render'ı T5'in `test:render`'ında doğrulanır.

- [ ] **Step 5: Commit**

```bash
git add packages/remotion package-lock.json
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(remotion): Draft3D composition, safe-area text and label layout, template hash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `packages/remotion` II + render katmanı — `renderDraftVideo`, `render-cli`, `RenderDriver.draft`, ffprobe doğrulaması, kare çıkarma, PID regex'i, `test:render`

**Files:**
- Create: `packages/remotion/src/render.ts`, `packages/remotion/src/render-cli.ts`, `apps/worker/test/fixtures/fake-remotion-cli.mjs`
- Modify:
  - `packages/remotion/package.json` (tam dosya aşağıda);
  - `apps/worker/src/render/driver.ts` (`DraftInput`, `DraftOutput`, `RenderDriver.draft`, gerçek ve Fake uygulama, `REMOTION_CLI`);
  - `apps/worker/src/render/ffmpeg.ts` (`ffprobeOf`, `fakeDraft`, `probeVideo`, `draftProbeErrors`, `extractFrame`);
  - `apps/worker/src/agents/pids.ts` (`render-cli`);
  - `apps/worker/package.json` (`@videogen/remotion`);
  - `package-lock.json`.
- Test: `apps/worker/test/draft-render.test.ts`, `apps/worker/test-render/draft.int.test.ts`

**Interfaces:**
- Consumes: `bundleHash`, `DRAFT_RENDER`, `DraftProps` (T4); `runProcess`, `RenderError`.
- Produces:
  - `renderDraftVideo(o)`, `ensureBundle(cacheRoot)`, `CHROME` (`@videogen/remotion/render`).
  - `render-cli.ts` protokolü:
    - stdout: `VG_STAGE bundle|browser|frames`, `VG_PROGRESS <done> <total>`, `VG_DONE {"frames","ms"}`, `VG_ERROR <ileti>`;
    - çıkış kodları: 0, 1, 2 (argüman), 3 (Chrome/WebGL).
  - `DraftInput { runDir; props: Omit<DraftProps,'glbUrl'>; glbPath; outPath; owner; signal?; onProgress?(done,total); onStage?(stage); frameRange? }`, `DraftOutput { file; frames; ms; concurrency }`, `RenderDriver.draft(i)`.
  - `BlenderDriverOptions.remotionCli? / draftTimeoutMs? (600 000) / draftMaxRssMb? (6144)`.
  - `probeVideo(ffmpeg, file, signal?) → VideoProbe`, `draftProbeErrors(p, {width, height, frames}) → string[]`, `extractFrame(ffmpeg, video, out, {t, crop?, width?, signal?})`, `fakeDraft(ffmpeg, out, {width, height, frames, signal?})`.
  - Audit `render.draft {ms, code, stopped, concurrency, frames}`.

- [ ] **Step 1: Başarısız testleri yaz**

`apps/worker/test/fixtures/fake-remotion-cli.mjs` (gerçek CLI'nin protokolünü konuşan sahte çocuk; davranışı `--out` adı seçer):

```js
// Stand-in for packages/remotion/src/render-cli.ts (same stdout protocol and exit codes); behaviour picked by the --out file name.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: { props: { type: 'string' }, glb: { type: 'string' }, out: { type: 'string' }, cache: { type: 'string' }, concurrency: { type: 'string' }, frames: { type: 'string' } } });
writeFileSync(`${a.out}.env.json`, JSON.stringify(Object.keys(process.env).sort()));
if (a.out.includes('gpu') && a.concurrency === '2') { process.stdout.write('VG_ERROR WebGL context lost\n'); process.exit(3); }
if (a.out.includes('fail')) { process.stdout.write('VG_ERROR Bundle failed\n'); process.exit(1); }
process.stdout.write('VG_STAGE bundle\nVG_STAGE frames\n');
for (const d of [10, 20, 30]) process.stdout.write(`VG_PROGRESS ${d} 30\n`);
writeFileSync(a.out, 'mp4');
process.stdout.write(`VG_DONE ${JSON.stringify({ frames: 30, ms: 5 })}\n`);
```

`apps/worker/test/draft-render.test.ts`:

```ts
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { groupAlive } from '@videogen/claude';
import { reapOrphans, writePidFile } from '../src/agents/pids.ts';
import { BlenderRenderDriver, FakeRenderDriver } from '../src/render/driver.ts';
import { draftProbeErrors, extractFrame, probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p));
const size = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();
const props = { yfov: [0.5, 0.5], frames: 59, width: 540, height: 960, background: { top: '#16203a', bottom: '#070a14' }, text: { color: '#fff', plate: '#000', line: '#5cc8ff', accent: '#5cc8ff' }, lighting: 'key_rim_cool' as const, hook: 'x', beats: [], labels: {} };
const CLI = resolve(import.meta.dirname, 'fixtures/fake-remotion-cli.mjs');

describe('draft render: fake driver, probe, frames, real-driver protocol', () => {
  it('the fake draft is a 2 s 540×960 h264 yuv420p tv/bt709 MP4 that passes the draft probe; covers and 2× crops come out of it', async () => {
    const dir = tmp('vg-draft-');
    const progress: number[] = [];
    const out = await new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }).draft({ runDir: dir, props, glbPath: '', outPath: join(dir, 'r0', 'draft.mp4'), owner: 'x', onProgress: (d) => progress.push(d) });
    expect(out).toMatchObject({ frames: 60, concurrency: 1 });
    expect(progress).toEqual([30, 60]);
    const p = await probeVideo(FFMPEG, out.file);
    expect(p).toMatchObject({ codec: 'h264', width: 540, height: 960, pixFmt: 'yuv420p', colorRange: 'tv', colorSpace: 'bt709', fps: '30/1', frames: 60 });
    expect(p.durationS).toBeCloseTo(2, 1);
    expect(draftProbeErrors(p, { width: 540, height: 960, frames: 60 })).toEqual([]);
    await extractFrame(FFMPEG, out.file, join(dir, 'cover.png'), { t: 0, width: 270 });
    expect(size(join(dir, 'cover.png'))).toBe('270,480');
    await extractFrame(FFMPEG, out.file, join(dir, 'crop.png'), { t: 1, crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.25 } });
    expect(size(join(dir, 'crop.png'))).toBe('540,480');
  });

  it('rejects a full-range (yuvj420p / pc) or wrongly sized video with readable reasons', async () => {
    const f = join(tmp('vg-draft-'), 'bad.mp4');
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=270x480:r=25', '-frames:v', '10', '-c:v', 'libx264', '-pix_fmt', 'yuvj420p', '-color_range', 'pc', f]);
    const errs = draftProbeErrors(await probeVideo(FFMPEG, f), { width: 540, height: 960, frames: 60 });
    expect(errs).toEqual(expect.arrayContaining([
      'pix_fmt yuvj420p (yuv420p olmalı)', 'color_range pc (tv olmalı)', 'boyut 270×480 (540×960 olmalı)', 'kare hızı 25/1 (30/1 olmalı)', 'kare sayısı 10 (60 olmalı)',
    ]));
  });

  it('the real driver runs the render child with a clean env, reports stages and progress, and retries a GPU failure once with concurrency 1', async () => {
    const data = tmp('vg-draft-data-');
    const audits: [string, Record<string, unknown>][] = [];
    const d = new BlenderRenderDriver({ blender: '/nonexistent', bwrap: '/nonexistent', dataDir: data, home: data, remotionCli: CLI, audit: async (a, x) => { audits.push([a, x]); } });
    const stages: string[] = [];
    const progress: number[] = [];
    const ok = await d.draft({ runDir: data, props, glbPath: '/dev/null', outPath: join(data, 'ok', 'draft.mp4'), owner: 'job', onStage: (s) => stages.push(s), onProgress: (n) => progress.push(n) });
    expect(ok).toMatchObject({ frames: 30, concurrency: 2 });
    expect([stages, progress]).toEqual([['bundle', 'frames'], [10, 20, 30]]);
    const env = JSON.parse(readFileSync(join(data, 'ok', 'draft.mp4.env.json'), 'utf8')) as string[];
    expect(env).toEqual(expect.arrayContaining(['HOME', 'PATH', 'TMPDIR']));
    expect(env.filter((k) => k.startsWith('VG_DATABASE') || k.includes('ANTHROPIC'))).toEqual([]);
    const gpu = await d.draft({ runDir: data, props, glbPath: '/dev/null', outPath: join(data, 'gpu', 'draft.mp4'), owner: 'job' });
    expect(gpu.concurrency).toBe(1);
    expect(audits.filter(([a]) => a === 'render.draft').map(([, x]) => [x.code, x.concurrency])).toEqual([[0, 2], [3, 2], [0, 1]]);
    await expect(d.draft({ runDir: data, props, glbPath: '/dev/null', outPath: join(data, 'fail', 'draft.mp4'), owner: 'job' })).rejects.toThrow(/taslak render başarısız \(kod 1\): Bundle failed/);
    expect(readdirSync(join(data, 'pids'))).toEqual([]);
  });

  it('startup recovery reaps an orphaned render-cli group (grilling C13)', async () => {
    const data = tmp('vg-reap-');
    const child = spawn('bash', ['-c', 'exec -a node-render-cli sleep 30'], { detached: true, stdio: 'ignore' });
    const exited = new Promise((res) => child.once('exit', res));
    await vi.waitFor(() => expect(readFileSync(`/proc/${child.pid}/cmdline`, 'utf8')).toContain('render-cli'));
    await writePidFile(data, child.pid!, 'step-1', 'render');
    expect(await reapOrphans(data)).toEqual([child.pid]);
    await exited;
    expect(groupAlive(child.pid!)).toBe(false);
    expect(existsSync(join(data, 'pids', `${child.pid}.json`))).toBe(false);
  });
});

```

`apps/worker/test-render/draft.int.test.ts` (gerçek sistem Chrome'u; `npm run test:render`):

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared';
import { bundleHash } from '@videogen/remotion/hash';
import { draftProps } from '@videogen/remotion/props';
import { BlenderRenderDriver, RenderError, REMOTION_CLI } from '../src/render/driver.ts';
import { draftProbeErrors, probeVideo } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const FX = resolve(import.meta.dirname, '../../../tests/fixtures');
const DATA = mkdtempSync(join(tmpdir(), 'vg-draft-int-'));
afterAll(() => rmSync(DATA, { recursive: true, force: true }));
const json = <T>(p: string) => JSON.parse(readFileSync(join(FX, p), 'utf8')) as T;
const style = CHANNEL_STYLES.gece_mavisi;
const { glbUrl: _u, ...props } = draftProps({
  glbUrl: '', yfov: json<{ yfov: number[] }>('scene/kalem/camera_track.json').yfov, width: 540, height: 960,
  scene: json<SceneSpec>('artifacts/scene-kalem.json'), storyboard: json<Storyboard>('artifacts/storyboard-kalem.json'), style,
});
const driver = () => new BlenderRenderDriver({ blender: '/nonexistent', bwrap: '/nonexistent', dataDir: DATA, home: DATA });
/** pids whose command line mentions `needle`. */
const processesMentioning = (needle: string) => readdirSync('/proc').filter((d) => /^\d+$/.test(d)).map(Number).filter((pid) => {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(needle); } catch { return false; }
});
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

describe('Remotion draft (real system Chrome, ANGLE)', () => {
  it('renders frames 0–59 of the pen draft: h264 yuv420p tv bt709 540×960, the style backdrop behind the canvas, a cached bundle', async () => {
    const out = join(DATA, 'r0', 'draft.mp4');
    const stages: string[] = [];
    const r = await driver().draft({ runDir: DATA, props, glbPath: join(FX, 'scene/kalem/scene.glb'), outPath: out, owner: 'int', frameRange: [0, 59], onStage: (s) => stages.push(s) });
    expect(r.frames).toBe(60);
    expect(stages).toEqual(['bundle', 'browser', 'frames']);
    expect(draftProbeErrors(await probeVideo(FFMPEG, out), { width: 540, height: 960, frames: 60 })).toEqual([]);
    // Top-left corner (outside the safe area, no text): the gradient's top colour, within codec tolerance (grilling C29: sRGB output).
    const px = [...execFileSync(FFMPEG, ['-v', 'error', '-i', out, '-vf', 'select=eq(n\\,0),crop=4:4:2:2,scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])];
    hex(style.background.top).forEach((c, i) => expect(Math.abs(px[i]! - c)).toBeLessThanOrEqual(8));
    const bundle = join(DATA, 'cache', 'remotion', bundleHash());
    expect(existsSync(join(bundle, 'index.html'))).toBe(true);
    const at = statSync(bundle).mtimeMs;
    await driver().draft({ runDir: DATA, props, glbPath: join(FX, 'scene/kalem/scene.glb'), outPath: join(DATA, 'r1', 'draft.mp4'), owner: 'int', frameRange: [0, 5] });
    expect(statSync(bundle).mtimeMs).toBe(at); // reused, not rebuilt
    console.log(`draft render: 60 kare ${r.ms} ms (concurrency ${r.concurrency})`);
  });

  it('a cancelled draft render kills Chrome with its process group and leaves no pid file', async () => {
    const ac = new AbortController();
    const p = driver().draft({ runDir: DATA, props, glbPath: join(FX, 'scene/kalem/scene.glb'), outPath: join(DATA, 'cancel', 'draft.mp4'), owner: 'int', signal: ac.signal, onStage: (s) => { if (s === 'frames') setTimeout(() => ac.abort(), 1500); } });
    await expect(p).rejects.toSatisfy((e: unknown) => e instanceof RenderError && e.kind === 'aborted');
    await new Promise((r) => setTimeout(r, 6000)); // SIGTERM → 5 s → SIGKILL
    expect(processesMentioning(REMOTION_CLI)).toEqual([]);
    expect(processesMentioning(join(DATA, 'cancel'))).toEqual([]);
    expect(readdirSync(join(DATA, 'pids'))).toEqual([]);
  }, 300_000);
});
```

- [ ] **Step 2: Testlerin düştüğünü gör**

Run: `npx vitest run apps/worker/test/draft-render.test.ts`
Expected: FAIL — `fakeDraft` / `probeVideo` / `draftProbeErrors` / `extractFrame` export'u yok, `FakeRenderDriver.prototype.draft` yok.

- [ ] **Step 3: Uygula**

`packages/remotion/package.json` (tam dosya; T4 sürümünün yerine):

```json
{
  "name": "@videogen/remotion",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./props": "./src/props.ts",
    "./hash": "./src/hash.ts",
    "./render": "./src/render.ts"
  },
  "dependencies": {
    "@react-three/fiber": "9.8.1",
    "@remotion/bundler": "4.0.533",
    "@remotion/renderer": "4.0.533",
    "@remotion/three": "4.0.533",
    "@videogen/scene3d": "*",
    "@videogen/shared": "*",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "remotion": "4.0.533",
    "three": "0.186.1"
  },
  "devDependencies": { "@types/three": "0.186.0" }
}
```

`packages/remotion/src/render.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { bundleHash, DRAFT_RENDER } from './hash.ts';
import { DRAFT_COMPOSITION, type DraftProps } from './props.ts';

export const DRAFT_ENTRY = resolve(import.meta.dirname, 'entry.ts');
/** M4b probe P3: the system Chrome as "chrome-for-testing", ANGLE GL; no browser download. */
export const CHROME = { browserExecutable: process.env.VG_CHROME ?? '/usr/bin/google-chrome', chromeMode: 'chrome-for-testing' as const, gl: 'angle' as const };

/**
 * Plan C15: one bundle per template hash under `cacheRoot` (<dataDir>/cache/remotion). Built into a temp dir and renamed, so a
 * half-written bundle is never served; older bundles are pruned (the newest other one is kept).
 */
export async function ensureBundle(cacheRoot: string, onProgress?: (pct: number) => void): Promise<string> {
  const hash = bundleHash();
  const dir = join(cacheRoot, hash);
  if (!existsSync(join(dir, 'index.html'))) {
    await mkdir(cacheRoot, { recursive: true });
    const tmp = `${dir}.tmp-${randomBytes(4).toString('hex')}`;
    await bundle({ entryPoint: DRAFT_ENTRY, outDir: tmp, onProgress });
    if (existsSync(join(dir, 'index.html'))) await rm(tmp, { recursive: true, force: true });
    else await rename(tmp, dir);
  }
  const others = readdirSync(cacheRoot).filter((d) => d !== hash && !d.includes('.tmp-'))
    .map((d) => ({ d, at: statSync(join(cacheRoot, d)).mtimeMs })).sort((a, b) => b.at - a.at);
  for (const o of others.slice(1)) await rm(join(cacheRoot, o.d), { recursive: true, force: true });
  return dir;
}

export interface DraftRenderOptions {
  props: Omit<DraftProps, 'glbUrl'>;
  glbPath: string;
  out: string;
  cacheRoot: string;
  concurrency?: number;
  /** Tests: render only these frames. */
  frameRange?: [number, number];
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  onStage?: (stage: 'bundle' | 'browser' | 'frames') => void;
}

/**
 * Spec §7.5 / plan C12–C14: renders the draft MP4 (h264, yuv420p, bt709, silent). The GLB is served once from 127.0.0.1 under a
 * random 32-hex token path (GET only, everything else 404, CORS open for the bundle's own origin) and the server closes afterwards.
 */
export async function renderDraftVideo(o: DraftRenderOptions): Promise<{ frames: number; ms: number }> {
  o.onStage?.('bundle');
  const serveUrl = await ensureBundle(o.cacheRoot);
  const glb = await readFile(o.glbPath);
  const token = randomBytes(16).toString('hex');
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === `/${token}/scene.glb`) {
      res.writeHead(200, { 'content-type': 'model/gltf-binary', 'content-length': glb.length, 'access-control-allow-origin': '*' });
      res.end(glb);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { cancelSignal, cancel } = makeCancelSignal();
  const onAbort = () => cancel();
  o.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const inputProps: DraftProps = { ...o.props, glbUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/${token}/scene.glb` };
    const common = { serveUrl, inputProps, browserExecutable: CHROME.browserExecutable, chromeMode: CHROME.chromeMode, chromiumOptions: { gl: CHROME.gl } };
    o.onStage?.('browser');
    const composition = await selectComposition({ ...common, id: DRAFT_COMPOSITION });
    const total = o.frameRange ? o.frameRange[1] - o.frameRange[0] + 1 : composition.durationInFrames;
    o.onStage?.('frames');
    const t0 = Date.now();
    await renderMedia({
      ...common, composition, codec: DRAFT_RENDER.codec, crf: DRAFT_RENDER.crf, x264Preset: DRAFT_RENDER.x264Preset, pixelFormat: DRAFT_RENDER.pixelFormat,
      colorSpace: DRAFT_RENDER.colorSpace, muted: true, outputLocation: o.out, concurrency: o.concurrency ?? 2, frameRange: o.frameRange ?? null, cancelSignal,
      onProgress: ({ renderedFrames }) => o.onProgress?.(renderedFrames, total),
    });
    return { frames: total, ms: Date.now() - t0 };
  } finally {
    o.signal?.removeEventListener('abort', onAbort);
    server.close();
  }
}
```

`packages/remotion/src/render-cli.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { DraftProps } from './props.ts';
import { renderDraftVideo } from './render.ts';

/**
 * Plan C13: the worker runs the draft render in this child process (a process-group leader with a "render" pid file), so a
 * cancel, a timeout or a worker restart kills Chrome with it. Protocol on stdout:
 *   VG_STAGE <bundle|browser|frames> · VG_PROGRESS <done> <total> · VG_DONE {"frames":n,"ms":n} · VG_ERROR <message>
 * Exit codes: 0 done, 2 bad arguments, 3 Chrome/WebGL (GPU) failure — the caller retries once with concurrency 1 (spec §14) —, 1 other.
 */
const GPU_FAILURE = /WebGL|GPU process|context lost|Target closed|crashed|Browser has disconnected/i;

const { values: a } = parseArgs({
  options: { props: { type: 'string' }, glb: { type: 'string' }, out: { type: 'string' }, cache: { type: 'string' }, concurrency: { type: 'string' }, frames: { type: 'string' } },
});
if (!a.props || !a.glb || !a.out || !a.cache) {
  process.stdout.write('VG_ERROR eksik argüman: --props --glb --out --cache\n');
  process.exit(2);
}
const range = a.frames ? (a.frames.split('-').map(Number) as [number, number]) : undefined;
const ac = new AbortController();
process.on('SIGTERM', () => ac.abort());
let last = -1;
try {
  const r = await renderDraftVideo({
    props: JSON.parse(readFileSync(a.props, 'utf8')) as Omit<DraftProps, 'glbUrl'>, glbPath: a.glb, out: a.out, cacheRoot: a.cache,
    concurrency: Number(a.concurrency ?? 2), frameRange: range, signal: ac.signal,
    onStage: (s) => process.stdout.write(`VG_STAGE ${s}\n`),
    onProgress: (done, total) => { if (done !== last) { last = done; process.stdout.write(`VG_PROGRESS ${done} ${total}\n`); } },
  });
  process.stdout.write(`VG_DONE ${JSON.stringify(r)}\n`);
  process.exit(0);
} catch (e) {
  const msg = ((e as Error).message ?? String(e)).split('\n')[0]!.slice(0, 300);
  process.stdout.write(`VG_ERROR ${msg}\n`);
  process.exit(GPU_FAILURE.test(msg) ? 3 : 1);
}
```

Diff (`git apply`):

```diff
--- a/apps/worker/src/render/driver.ts
+++ b/apps/worker/src/render/driver.ts
@@ -1,13 +1,18 @@
 import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
 import { existsSync } from 'node:fs';
+import { homedir, tmpdir } from 'node:os';
 import { join, resolve } from 'node:path';
 import { BuildReportSchema, type BuildReport, type ChannelStyle } from '@videogen/shared';
-import { ffmpegWorks, testStill } from './ffmpeg.ts';
+import type { DraftProps } from '@videogen/remotion/props';
+import { fakeDraft, ffmpegWorks, testStill } from './ffmpeg.ts';
 import { runProcess, type ProcResult } from './process.ts';
 import { sandboxArgv, sandboxWorks } from './sandbox.ts';

 export const PYTHON_DIR = resolve(import.meta.dirname, '../../../../python/vg_blender');
 export const SCENE_FIXTURES = resolve(import.meta.dirname, '../../../../tests/fixtures/scene/kalem');
+const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
+/** Plan C13: the Remotion render runs in this child process (Chrome dies with its process group). */
+export const REMOTION_CLI = resolve(REPO_ROOT, 'packages/remotion/src/render-cli.ts');

 export interface BuildInput {
   runDir: string;
@@ -24,6 +29,20 @@
 export interface BuildOutput { report: BuildReport; files: BuildFiles | null; ms: number }
 export interface StillsInput { runDir: string; blendPath: string; frames: number[]; outDir: string; scale?: number; samples?: number; owner: string; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }
 export interface StillsOutput { files: string[]; renderer: string; ms: number }
+export interface DraftInput {
+  runDir: string;
+  props: Omit<DraftProps, 'glbUrl'>;
+  glbPath: string;
+  outPath: string;
+  owner: string;
+  signal?: AbortSignal;
+  onProgress?: (done: number, total: number) => void;
+  /** Bundling and Chrome start-up before the first frame (plan: the step says what it is doing). */
+  onStage?: (stage: string) => void;
+  /** Tests: render only these frames. */
+  frameRange?: [number, number];
+}
+export interface DraftOutput { file: string; frames: number; ms: number; concurrency: number }
 export type Capability = { ok: true } | { ok: false; reason: string };

 /** A render job that could not finish (not a product.py problem: those come back as report.ok = false). */
@@ -41,6 +60,8 @@
   build(i: BuildInput): Promise<BuildOutput>;
   /** Spec §7.5 Blender preview stills. GPU. */
   stills(i: StillsInput): Promise<StillsOutput>;
+  /** Spec §7.1 step 5: the Three.js-in-Remotion draft MP4. GPU (the caller holds the lock). */
+  draft(i: DraftInput): Promise<DraftOutput>;
 }

 export type RenderAudit = (action: string, data: Record<string, unknown>) => Promise<void>;
@@ -55,8 +76,15 @@
   stillsTimeoutMs?: number;
   maxRssMb?: number;
   audit?: RenderAudit;
+  /** Draft render child (default REMOTION_CLI), its time limit and the RSS of its group (Chrome included). */
+  remotionCli?: string;
+  draftTimeoutMs?: number;
+  draftMaxRssMb?: number;
 }

+/** Grilling C13: runProcess starts from an empty env; the render child needs PATH (node, Chrome), HOME and TMPDIR. */
+const draftEnv = (): NodeJS.ProcessEnv => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir(), TMPDIR: tmpdir(), LANG: 'C.UTF-8', ...(process.env.VG_CHROME ? { VG_CHROME: process.env.VG_CHROME } : {}) });
+
 const stoppedError = (r: ProcResult, what: string): RenderError | null => {
   if (r.stopped === 'timeout') return new RenderError('timeout', `${what} zaman aşımına uğradı`);
   if (r.stopped === 'memory') return new RenderError('memory', `${what} bellek sınırını aştı`);
@@ -134,6 +162,40 @@
     if (r.code !== 0) throw new RenderError('crash', `önizleme render'ı başarısız (kod ${r.code ?? r.signal})`);
     return { files: i.frames.map((f) => join(i.outDir, `f${String(f).padStart(5, '0')}.png`)), renderer, ms: r.ms };
   }
+
+  /** Plan C13/C17: the Remotion child under the process-group guard; a Chrome/WebGL failure (exit 3) is retried once with concurrency 1. */
+  async draft(i: DraftInput): Promise<DraftOutput> {
+    await mkdir(resolve(i.outPath, '..'), { recursive: true });
+    const propsPath = `${i.outPath}.props.json`;
+    await writeFile(propsPath, JSON.stringify(i.props));
+    const once = async (concurrency: number): Promise<DraftOutput | null> => {
+      let done: { frames: number; ms: number } | null = null;
+      let error = '';
+      const r = await runProcess(process.execPath, [
+        '--import', 'tsx', this.o.remotionCli ?? REMOTION_CLI, '--props', propsPath, '--glb', i.glbPath, '--out', i.outPath,
+        '--cache', join(this.o.dataDir, 'cache', 'remotion'), '--concurrency', String(concurrency), ...(i.frameRange ? ['--frames', i.frameRange.join('-')] : []),
+      ], {
+        cwd: REPO_ROOT, dataDir: this.o.dataDir, owner: i.owner, signal: i.signal, env: draftEnv(),
+        timeoutMs: this.o.draftTimeoutMs ?? 600_000, maxRssMb: this.o.draftMaxRssMb ?? 6144,
+        onLine: (l) => {
+          const p = /^VG_PROGRESS (\d+) (\d+)$/.exec(l);
+          if (p) i.onProgress?.(Number(p[1]), Number(p[2]));
+          if (l.startsWith('VG_STAGE ')) i.onStage?.(l.slice(9).trim());
+          if (l.startsWith('VG_DONE ')) done = JSON.parse(l.slice(8)) as { frames: number; ms: number };
+          if (l.startsWith('VG_ERROR ')) error = l.slice(9).trim();
+        },
+      });
+      await this.o.audit?.('render.draft', { ms: r.ms, code: r.code, stopped: r.stopped, concurrency, frames: (done as { frames: number } | null)?.frames ?? null });
+      const stop = stoppedError(r, 'taslak render');
+      if (stop) throw stop;
+      if (r.code === 3) return null;
+      if (r.code !== 0 || !done) throw new RenderError('crash', `taslak render başarısız (kod ${r.code ?? r.signal})${error ? `: ${error}` : ''}`);
+      return { file: i.outPath, ...(done as { frames: number; ms: number }), concurrency };
+    };
+    const out = (await once(2)) ?? (await once(1));
+    if (!out) throw new RenderError('gpu', 'taslak render GPU/WebGL hatasıyla iki kez düştü');
+    return out;
+  }
 }

 /** Spec §16.1 FakeRenderDriver: committed pen build outputs and ffmpeg test stills; no Blender, bwrap or GPU. */
@@ -182,4 +244,17 @@
     }
     return { files, renderer: 'fake', ms: Date.now() - t0 };
   }
+
+  /** Spec §16.1: a 2 s test-pattern MP4 at the requested size, tagged like the real draft (yuv420p, tv, bt709). */
+  async draft(i: DraftInput): Promise<DraftOutput> {
+    const t0 = Date.now();
+    await mkdir(resolve(i.outPath, '..'), { recursive: true });
+    await this.wait(i.signal);
+    i.onStage?.('frames');
+    i.onProgress?.(30, 60);
+    await fakeDraft(this.o.ffmpeg, i.outPath, { width: i.props.width, height: i.props.height, frames: 60, signal: i.signal });
+    if (i.signal?.aborted) throw new RenderError('aborted', 'durduruldu');
+    i.onProgress?.(60, 60);
+    return { file: i.outPath, frames: 60, ms: Date.now() - t0, concurrency: 1 };
+  }
 }
--- a/apps/worker/src/render/ffmpeg.ts
+++ b/apps/worker/src/render/ffmpeg.ts
@@ -40,6 +40,65 @@
   return run(ffmpeg, ['-f', 'lavfi', '-i', `color=c=0x16203a:s=${w}x${h}:d=1`, '-vf', bar, '-frames:v', '1', out], o.signal);
 }

+/** ffprobe next to the configured ffmpeg (VG_FFMPEG), else the one on PATH. */
+export const ffprobeOf = (ffmpeg: string) => (/ffmpeg$/.test(ffmpeg) ? ffmpeg.replace(/ffmpeg$/, 'ffprobe') : 'ffprobe');
+
+/** Fake render driver (spec §16.1): a test-pattern draft tagged exactly like the real one, so it passes the same probe. */
+export function fakeDraft(ffmpeg: string, out: string, o: { width: number; height: number; frames: number; signal?: AbortSignal }): Promise<void> {
+  return run(ffmpeg, [
+    '-f', 'lavfi', '-i', `testsrc2=s=${o.width}x${o.height}:r=30`, '-frames:v', String(o.frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
+    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', out,
+  ], o.signal);
+}
+
+export interface VideoProbe {
+  codec: string; width: number; height: number; pixFmt: string; colorRange: string | null; colorSpace: string | null;
+  colorPrimaries: string | null; colorTransfer: string | null; fps: string; frames: number; durationS: number;
+}
+
+/** First video stream of a file (spec §7.5 tags, frame count from the container). */
+export function probeVideo(ffmpeg: string, file: string, signal?: AbortSignal): Promise<VideoProbe> {
+  return new Promise((resolve, reject) => {
+    execFile(ffprobeOf(ffmpeg), ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
+      'stream=codec_name,width,height,pix_fmt,color_range,color_space,color_primaries,color_transfer,r_frame_rate,nb_frames:format=duration', '-of', 'json', file],
+    { timeout: 30_000, signal }, (err, stdout) => {
+      if (err) return reject(new Error(`ffprobe: ${(err as Error).message.split('\n')[0]}`));
+      const j = JSON.parse(String(stdout)) as { streams?: Record<string, string | number>[]; format?: { duration?: string } };
+      const s = j.streams?.[0];
+      if (!s) return reject(new Error('ffprobe: video akışı yok'));
+      const str = (k: string) => (s[k] === undefined || s[k] === 'unknown' ? null : String(s[k]));
+      resolve({
+        codec: String(s.codec_name), width: Number(s.width), height: Number(s.height), pixFmt: String(s.pix_fmt), colorRange: str('color_range'), colorSpace: str('color_space'),
+        colorPrimaries: str('color_primaries'), colorTransfer: str('color_transfer'), fps: String(s.r_frame_rate), frames: Number(s.nb_frames), durationS: Number(j.format?.duration ?? 0),
+      });
+    });
+  });
+}
+
+/** Spec §7.5 (grilling C16): what a draft must be; yuvj420p or pc range is rejected. Empty = acceptable. */
+export function draftProbeErrors(p: VideoProbe, want: { width: number; height: number; frames: number }): string[] {
+  const out: string[] = [];
+  if (p.codec !== 'h264') out.push(`codec ${p.codec} (h264 olmalı)`);
+  if (p.pixFmt !== 'yuv420p') out.push(`pix_fmt ${p.pixFmt} (yuv420p olmalı)`);
+  if (p.colorRange !== 'tv') out.push(`color_range ${p.colorRange ?? 'yok'} (tv olmalı)`);
+  for (const [k, v] of [['color_space', p.colorSpace], ['color_primaries', p.colorPrimaries], ['color_transfer', p.colorTransfer]] as const) if (v !== 'bt709') out.push(`${k} ${v ?? 'yok'} (bt709 olmalı)`);
+  if (p.width !== want.width || p.height !== want.height) out.push(`boyut ${p.width}×${p.height} (${want.width}×${want.height} olmalı)`);
+  if (p.fps !== '30/1') out.push(`kare hızı ${p.fps} (30/1 olmalı)`);
+  if (p.frames !== want.frames) out.push(`kare sayısı ${p.frames} (${want.frames} olmalı)`);
+  return out;
+}
+
+/**
+ * One frame as PNG at `t` seconds (cover, contact sheets, extract_frames). `crop` is a fraction of the frame, enlarged 2× (spec §8.2);
+ * `width` scales the whole frame (height follows).
+ */
+export function extractFrame(ffmpeg: string, video: string, out: string, o: { t: number; crop?: { x: number; y: number; w: number; h: number }; width?: number; signal?: AbortSignal }): Promise<void> {
+  const vf = o.crop
+    ? `crop=trunc(iw*${o.crop.w}/2)*2:trunc(ih*${o.crop.h}/2)*2:trunc(iw*${o.crop.x}):trunc(ih*${o.crop.y}),scale=iw*2:ih*2`
+    : o.width ? `scale=${o.width}:-2` : 'null';
+  return run(ffmpeg, ['-ss', String(o.t), '-i', video, '-frames:v', '1', '-vf', vf, out], o.signal);
+}
+
 export function ffmpegWorks(ffmpeg: string): Promise<boolean> {
   return new Promise((resolve) => { execFile(ffmpeg, ['-version'], { timeout: 5000 }, (err) => resolve(!err)); });
 }
--- a/apps/worker/src/agents/pids.ts
+++ b/apps/worker/src/agents/pids.ts
@@ -19,7 +19,7 @@
   await rm(join(dirOf(dataDir), `${pid}.json`), { force: true });
 }

-const LEADER: Record<PidKind, RegExp> = { claude: /claude/, render: /bwrap|blender|ffmpeg|chrome/ };
+const LEADER: Record<PidKind, RegExp> = { claude: /claude/, render: /bwrap|blender|ffmpeg|chrome|render-cli/ };

 /** The pid may have been reused by an unrelated process: only a leader that still looks like the recorded kind is killed. */
 function cmdlineMatches(pid: number, kind: PidKind): boolean {
--- a/apps/worker/package.json
+++ b/apps/worker/package.json
@@ -6,6 +6,7 @@
     "@anthropic-ai/claude-agent-sdk": "0.3.290",
     "@videogen/claude": "*",
     "@videogen/db": "*",
+    "@videogen/remotion": "*",
     "@videogen/scene3d": "*",
     "@videogen/shared": "*",
     "pg": "8.23.1",
```

Run: `npm install`
Expected: `@remotion/bundler`, `@remotion/renderer` 4.0.533 kurulu; `apps/worker` `@videogen/remotion`'u görür.

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/draft-render.test.ts && npm run typecheck && npm test`
Expected: `4 passed`; tam paket `Tests  291 passed (291)`.

Run: `npm run test:render`
Expected: `Tests  6 passed (6)` (Blender testleri 4 + taslak 2). Konsolda `draft render: 60 kare … ms`. Bitince `ps -eo args | grep -E 'render-cli|chrome-for-testing' | grep -v grep` boş.
- **0. kare rengi:** ±8 dışında kalırsa (Chrome'un renk yönetimi), pikseli ve Chrome sürümünü ledger'a `Ruling:` ile yaz. Toleransı **gerekçeyle** değiştir; çıktının tv/bt709 etiketleri değişmez.
- **RSS sınırı:** 6 GB aşılıp `memory` ile durursa ölçüyü yaz ve `draftMaxRssMb`'yi ölçülen tepe + %50 yap (`Ruling:`).

- [ ] **Step 5: Commit**

```bash
git add packages/remotion/package.json packages/remotion/src/render.ts packages/remotion/src/render-cli.ts apps/worker/src/render/driver.ts apps/worker/src/render/ffmpeg.ts apps/worker/src/agents/pids.ts apps/worker/package.json package-lock.json apps/worker/test/fixtures/fake-remotion-cli.mjs apps/worker/test/draft-render.test.ts apps/worker/test-render/draft.int.test.ts
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(render): Remotion draft render in a guarded child process, cached bundle, ffprobe check, fake draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: `draft_render` adımı ve builder düzeltme turu

**Files:**
- Modify:
  - `apps/worker/src/pipeline/steps.ts` (`draftFixPrompt`, build `inputHash`/`run` düzeltme turu, `record`, `DraftMeta`, `draftSource`, `openFindings`, `draftRenderExecutor`, `pipelineExecutors`);
  - `apps/worker/src/pipeline/fake-scripts.ts` (düzeltme turunda lens değişir, "inatçı" hariç);
  - `packages/db/src/pipeline.ts` (`NewArtifact` medya sütunları, `ArtifactRecord.meta`);
  - `packages/shared/src/pipeline.ts` (`IMPLEMENTED_STEPS += draft_render`, `formatClock`) ve `packages/shared/test/pipeline.test.ts`;
  - `apps/worker/test/build-step.test.ts`, `apps/api/test/videos.test.ts` (plan ve uçtan uca beklenti);
  - `tests/smoke/s2-produce.spec.ts`, `tests/smoke/s2b-build.spec.ts` (not metni, iptal edilen adım sayısı 3 → 4, bekleme süresi).
- Test: `apps/worker/test/draft-render-step.test.ts`

**Interfaces:**
- Consumes: `RenderDriver.draft`, `probeVideo`, `draftProbeErrors`, `extractFrame` (T5); `bundleHash`, `DRAFT_RENDER`, `draftProps` (T4); `StepContext.round`, `extraDiskMb` (T3); `Review`, `DRAFT_CHECKS`, `DRAFT_GATES` (T1).
- Produces:
  - `draftRenderExecutor(deps)` (kaynak `gpu`, `extraDiskMb 300`).
  - `DraftMeta { round, glbSha, specHash, frames, renderMs, concurrency }` (`draft_video.meta`).
  - `draftSource(deps, runId): Promise<DraftSource | null>` (`{ hash, glbSha, glbPath, specHash, props }`).
  - `draftFixPrompt(review, reviewedRound)`.
  - Artefaktlar `draft_video` (`duration_ms`, `width`, `height`, `codec` dolu) ve `draft_cover`.
  - Adım notu `540×960 · 0:45 · render 95 sn`.
  - `formatClock(s)` ("0:45").
  - `NewArtifact.{durationMs,width,height,codec}`, `ArtifactRecord.meta`.

- [ ] **Step 1: Başarısız testi yaz**

`apps/worker/test/draft-render-step.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { producePlan } from '@videogen/shared';
import { createProduceRun, insertArtifact, listArtifacts, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore, type ClaudeDriver, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, draftRenderExecutor, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver, type DraftInput, type RenderDriver } from '../src/render/driver.ts';
import { ResourceLocks } from '../src/render/locks.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8'));

function setup(render: RenderDriver = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 })) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-draft-step-'));
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const scene: SceneDeps = { pool: t.pool, render, locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10 };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30, validator: ARTIFACT_VALIDATOR,
    memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: fakePipelineScript, scene };
  return { dataDir, specs, deps };
}

/** A run whose build is done (the fake build of the pen), as the build step leaves it. */
async function built(deps: StepDeps, name = 'Tükenmez kalem') {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const steps = await listRunSteps(t.pool, r.runId);
  const ctx = (key: 'build' | 'draft_render', round = 0, attempt = 1): StepContext => ({
    runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt, round, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent', versionId: r.versionId, runDir,
    signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
  });
  const b = buildExecutor(deps);
  expect(await b.run(ctx('build'), await b.inputHash(ctx('build')))).toMatchObject({ status: 'done' });
  return { r, ctx };
}
const reviewArtifact = (runId: string, name = 'review-revise') => insertArtifact(t.pool, { runId, kind: 'draft_review', content: fx(name), meta: { round: 0, verdict: 'revise' } });

describe('draft_render step and the builder fix round', () => {
  it('records the draft MP4 (540×960, length, codec) and its cover; reuse accepts only a draft of the same round', async () => {
    const { deps } = setup();
    const { r, ctx } = await built(deps);
    const ex = draftRenderExecutor(deps);
    const hash = await ex.inputHash(ctx('draft_render'));
    expect(await ex.run(ctx('draft_render'), hash)).toEqual({ status: 'done', note: '540×960 · 0:02 · render 0 sn' });
    const rows = (await t.pool.query("SELECT kind, width, height, codec, duration_ms, meta FROM artifacts WHERE run_id = $1 AND kind LIKE 'draft_%' ORDER BY kind", [r.runId])).rows;
    expect(rows.map((x) => x.kind)).toEqual(['draft_cover', 'draft_video']);
    expect(rows[1]).toMatchObject({ width: 540, height: 960, codec: 'h264', meta: { round: 0, frames: 60, concurrency: 1 } });
    expect(rows[1].duration_ms).toBeGreaterThanOrEqual(1900);
    expect(await ex.reuse!(ctx('draft_render'), hash)).toBe(true);
    expect(await ex.reuse!(ctx('draft_render', 1), hash)).toBe(false);
  });

  it('a fix round that changed neither the GLB nor the scene spec is not rendered again: needs_human with the open findings', async () => {
    const fake = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
    let drafts = 0;
    const counting: RenderDriver = { kind: 'fake', capabilities: () => fake.capabilities(), build: (i) => fake.build(i), stills: (i) => fake.stills(i), draft: (i) => { drafts++; return fake.draft(i); } };
    const { deps } = setup(counting);
    const { r, ctx } = await built(deps, 'İnatçı kalem');
    const ex = draftRenderExecutor(deps);
    await ex.run(ctx('draft_render'), await ex.inputHash(ctx('draft_render')));
    await reviewArtifact(r.runId);
    const out = await ex.run(ctx('draft_render', 1), await ex.inputHash(ctx('draft_render', 1)));
    expect(out).toEqual({ status: 'needs_human', reason: 'Düzeltme turu sahneyi değiştirmedi; taslak yeniden incelenmedi. Açık bulgular: Mekanizma çekimi, Hareket akışı.' });
    expect(drafts).toBe(1);
  });

  it('a draft that fails the spec §7.5 probe is rejected with the reasons and audited', async () => {
    const fake = new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 });
    const fullRange: RenderDriver = {
      kind: 'fake', capabilities: () => fake.capabilities(), build: (i) => fake.build(i), stills: (i) => fake.stills(i),
      draft: async (i: DraftInput) => {
        mkdirSync(dirname(i.outPath), { recursive: true });
        execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=540x960:r=30', '-frames:v', '60', '-c:v', 'libx264', '-pix_fmt', 'yuvj420p', '-color_range', 'pc', i.outPath]);
        return { file: i.outPath, frames: 60, ms: 1, concurrency: 1 };
      },
    };
    const { deps } = setup(fullRange);
    const { r, ctx } = await built(deps);
    const ex = draftRenderExecutor(deps);
    const out = await ex.run(ctx('draft_render'), await ex.inputHash(ctx('draft_render')));
    expect(out).toMatchObject({ status: 'failed', retry: false, error: expect.stringContaining('pix_fmt yuvj420p (yuv420p olmalı)') });
    expect((await listArtifacts(t.pool, r.videoId)).map((a) => a.kind)).not.toContain('draft_video');
    expect((await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE run_id = $1 AND action = 'render.draft_rejected'", [r.runId])).rows[0].n).toBe(1);
  });

  it('build round 1 resumes the last builder session with only the failed checks, and its new scene makes a new draft hash', async () => {
    const { deps, specs } = setup();
    const { r, ctx } = await built(deps, 'Kusurlu kalem');
    const render = draftRenderExecutor(deps);
    const first = await render.inputHash(ctx('draft_render'));
    await reviewArtifact(r.runId);
    const b = buildExecutor(deps);
    expect(await b.inputHash(ctx('build', 1))).not.toBe(await b.inputHash(ctx('build')));
    expect(await b.run(ctx('build', 1), await b.inputHash(ctx('build', 1)))).toMatchObject({ status: 'done' });
    const fix = specs.at(-1)!;
    expect(fix).toMatchObject({ role: 'builder', resume: true, claudeSessionId: specs[0]!.claudeSessionId });
    expect(fix.prompt).toContain('Taslak incelemesi (tur 0) taslağı geri gönderdi');
    expect(fix.prompt).toContain('"id":"mechanism_shot"');
    expect(fix.prompt).not.toContain('"id":"hero_frame0"');
    expect(await render.inputHash(ctx('draft_render', 1))).not.toBe(first);
  });
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run apps/worker/test/draft-render-step.test.ts`
Expected: FAIL — `draftRenderExecutor` export'u yok.

- [ ] **Step 3: Uygula**

Diff (`git apply`):

```diff
--- a/packages/shared/src/pipeline.ts
+++ b/packages/shared/src/pipeline.ts
@@ -15,8 +15,14 @@
 export const STEP_DEFAULT_S: Record<StepKey, number> = {
   research: 300, storyboard: 180, voice: 270, build: 1500, draft_render: 60, draft_review: 180, final_render: 1380, compose: 300, qc: 5, review: 300, finalize: 30,
 };
-/** Steps with an executor in this build. M4a: research → storyboard; M4b: + build; M4c extends the list. */
-export const IMPLEMENTED_STEPS: readonly StepKey[] = ['research', 'storyboard', 'build'];
+/** Steps with an executor in this build. M4a: research → storyboard; M4b: + build; M4c: + draft_render (T6), draft_review (T8). */
+export const IMPLEMENTED_STEPS: readonly StepKey[] = ['research', 'storyboard', 'build', 'draft_render'];
+
+/** "0:45", "1:02": a video length for cards and notes. */
+export function formatClock(seconds: number): string {
+  const s = Math.max(0, Math.round(seconds));
+  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
+}

 export type VideoStatus = 'queued' | 'running' | 'ready' | 'needs_human' | 'failed' | 'cancelled' | 'published';
 export type RunStatus = 'queued' | 'running' | 'done' | 'needs_human' | 'failed' | 'cancelled';
--- a/packages/shared/test/pipeline.test.ts
+++ b/packages/shared/test/pipeline.test.ts
@@ -1,10 +1,10 @@
 import { describe, expect, it } from 'vitest';
-import { IMPLEMENTED_STEPS, normalizeProductName, producePlan, STEP_KEYS, STEP_WEIGHTS } from '../src/pipeline.ts';
+import { formatClock, IMPLEMENTED_STEPS, normalizeProductName, producePlan, STEP_KEYS, STEP_WEIGHTS } from '../src/pipeline.ts';

 describe('produce plan', () => {
   it('keeps only implemented steps, drops voice in silent mode and rescales weights to 100', () => {
-    expect(IMPLEMENTED_STEPS).toEqual(['research', 'storyboard', 'build']);
-    expect(producePlan('silent')).toEqual([{ key: 'research', weight: 24.24 }, { key: 'storyboard', weight: 21.21 }, { key: 'build', weight: 54.55 }]);
+    expect(IMPLEMENTED_STEPS).toEqual(['research', 'storyboard', 'build', 'draft_render']);
+    expect(producePlan('silent')).toEqual([{ key: 'research', weight: 21.62 }, { key: 'storyboard', weight: 18.92 }, { key: 'build', weight: 48.65 }, { key: 'draft_render', weight: 10.81 }]);
     const all = producePlan('vo', STEP_KEYS);
     expect(all.map((s) => s.key)).toEqual([...STEP_KEYS]);
     expect(all.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(100, 1);
@@ -12,5 +12,6 @@
     expect(Object.values(STEP_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
     expect(normalizeProductName('  Tükenmez   KALEM ')).toBe('tükenmez kalem');
     expect(normalizeProductName('IŞIK')).toBe('ışık');
+    expect([formatClock(45), formatClock(62.4), formatClock(0)]).toEqual(['0:45', '1:02', '0:00']);
   });
 });
--- a/packages/db/src/pipeline.ts
+++ b/packages/db/src/pipeline.ts
@@ -168,16 +168,21 @@
   await db.query('UPDATE products SET difficulty = $2 WHERE id = $1', [productId, difficulty]);
 }

-export interface NewArtifact { runId: string; stepId?: string | null; versionId?: string | null; kind: string; blobSha?: string | null; content?: unknown; inputHash?: string | null; meta?: unknown }
-export type ArtifactRecord = ArtifactMeta & { content: unknown; inputHash: string | null };
+export interface NewArtifact {
+  runId: string; stepId?: string | null; versionId?: string | null; kind: string; blobSha?: string | null; content?: unknown; inputHash?: string | null; meta?: unknown;
+  /** Video artifacts (spec §11.1): length and stream facts from ffprobe. */
+  durationMs?: number | null; width?: number | null; height?: number | null; codec?: string | null;
+}
+export type ArtifactRecord = ArtifactMeta & { content: unknown; inputHash: string | null; meta: unknown };
 const toMeta = (r: Record<string, any>): ArtifactMeta => ({ id: r.id, runId: r.run_id, stepId: r.step_id, versionId: r.version_id, kind: r.kind, blobSha: r.blob_sha, createdAt: iso(r.created_at)! });
-const toArtifact = (r: Record<string, any>): ArtifactRecord => ({ ...toMeta(r), content: r.content, inputHash: r.input_hash });
+const toArtifact = (r: Record<string, any>): ArtifactRecord => ({ ...toMeta(r), content: r.content, inputHash: r.input_hash, meta: r.meta });

 export async function insertArtifact(db: Queryable, a: NewArtifact): Promise<ArtifactMeta> {
   const { rows } = await db.query(
-    `INSERT INTO artifacts (id, run_id, step_id, version_id, kind, blob_sha, content, input_hash, meta, created_at)
-     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp()) RETURNING *`,
-    [randomUUID(), a.runId, a.stepId ?? null, a.versionId ?? null, a.kind, a.blobSha ?? null, a.content === undefined ? null : JSON.stringify(a.content), a.inputHash ?? null, a.meta === undefined ? null : JSON.stringify(a.meta)],
+    `INSERT INTO artifacts (id, run_id, step_id, version_id, kind, blob_sha, content, input_hash, meta, duration_ms, width, height, codec, created_at)
+     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, clock_timestamp()) RETURNING *`,
+    [randomUUID(), a.runId, a.stepId ?? null, a.versionId ?? null, a.kind, a.blobSha ?? null, a.content === undefined ? null : JSON.stringify(a.content), a.inputHash ?? null,
+      a.meta === undefined ? null : JSON.stringify(a.meta), a.durationMs ?? null, a.width ?? null, a.height ?? null, a.codec ?? null],
   );
   return toMeta(rows[0]);
 }
--- a/apps/worker/src/pipeline/steps.ts
+++ b/apps/worker/src/pipeline/steps.ts
@@ -1,16 +1,21 @@
 import { createHash } from 'node:crypto';
+import { existsSync } from 'node:fs';
 import { readFile } from 'node:fs/promises';
 import { join } from 'node:path';
 import type pg from 'pg';
 import {
-  CHANNEL_STYLES, HOOK_PATTERN_LABELS, normalizeProductName, sceneRefErrors, storyboardRefErrors, validateArtifact,
-  type AudioMode, type ChannelStyleId, type ProductResearch, type SceneSpec, type StepKey, type Storyboard,
+  CHANNEL_STYLES, DRAFT_CHECKS, DRAFT_GATES, formatClock, HOOK_PATTERN_LABELS, normalizeProductName, sceneRefErrors, storyboardRefErrors, validateArtifact,
+  type AudioMode, type ChannelStyleId, type ProductResearch, type Review, type SceneSpec, type StepKey, type Storyboard,
 } from '@videogen/shared';
-import { appendAudit, findArtifact, getChannelStyle, insertArtifact, latestArtifact, latestStepSession, setProductDifficulty } from '@videogen/db';
+import { appendAudit, findArtifact, getBlob, getChannelStyle, insertArtifact, latestArtifact, latestStepSession, setProductDifficulty } from '@videogen/db';
 import { SpecStore, type FakeScript, type SpecKind } from '@videogen/claude';
+import { bundleHash, DRAFT_RENDER } from '@videogen/remotion/hash';
+import { draftProps, type DraftProps } from '@videogen/remotion/props';
 import { ARTIFACT_VALIDATOR } from './validator.ts';
 import { RESUME_PROMPT, type SessionManager } from '../agents/manager.ts';
 import { putBlob } from '../media.ts';
+import { RenderError } from '../render/driver.ts';
+import { draftProbeErrors, extractFrame, probeVideo } from '../render/ffmpeg.ts';
 import { runStructured } from './agent-step.ts';
 import { buildScene, previewScene, type SceneBuild, type SceneDeps } from './scene-tools.ts';
 import type { StepContext, StepExecutor, StepOutcome } from './types.ts';
@@ -125,6 +130,22 @@
   };
 }

+/** Plan C8: what the draft review sent back — only the failed checks with their evidence and hints (spec §7.2), fenced as data. */
+export function draftFixPrompt(r: Review, reviewedRound: number): string {
+  const findings = r.checks.filter((c) => !c.pass).map((c) => ({
+    id: c.id, onem: DRAFT_CHECKS[c.id].severity, kontrol: DRAFT_CHECKS[c.id].label_tr, kare: c.evidence?.frame ?? null, zaman_sn: c.evidence?.timecode ?? null, ipucu: c.fix_hint ?? null,
+  }));
+  return [
+    `Taslak incelemesi (tur ${reviewedRound}) taslağı geri gönderdi. Yalnızca aşağıdaki bulguları düzelt: product.py ve/veya SceneSpec (kamera, patlatma zamanları) → write_spec(kind "scene") → build_scene → render_preview_stills ile kontrol et.`,
+    '',
+    fenced('Bulgular', { bulgular: findings, kapilar: DRAFT_GATES.filter((g) => !r.gate_results[g]) }),
+    '',
+    `Kanıt kareleri: review/r${reviewedRound}/sheet.png (12 kare) ve review/r${reviewedRound}/frames/ (Read ile bakabilirsin). Taslak 540×960 ve 30 fps; kare numarası/30 = saniye.`,
+    'Sahnede (GLB ya da SceneSpec) bir şey değiştirmezsen taslak yeniden incelenmez ve video insan incelemesine düşer.',
+    "Son başarılı build_scene'deki SceneSpec'i değiştirmeden yapılandırılmış çıktı (SceneSpec şeması) olarak döndür.",
+  ].join('\n');
+}
+
 export function buildPrompt(name: string, styleId: ChannelStyleId, storyboard: Storyboard, research: ProductResearch): string {
   const style = CHANNEL_STYLES[styleId];
   const parts = research.parts.map((p) => ({ id: p.id, name_tr: p.name_tr, material: p.material, approx_dims_mm: p.approx_dims_mm, count: p.count, function: p.function }));
@@ -153,7 +174,9 @@
     async inputHash(ctx) {
       const storyboard = await latestArtifact(deps.pool, ctx.runId, 'storyboard');
       const style = await getChannelStyle(deps.pool);
-      return sha({ step: 'build', storyboard: storyboard?.id ?? null, style: style.id, schema: SCHEMA_VERSION.scene });
+      // Plan C8: a fix round is a new input (the review it answers), so it never reuses the previous round's build.
+      const review = ctx.round > 0 ? await latestArtifact(deps.pool, ctx.runId, 'draft_review') : null;
+      return sha({ step: 'build', storyboard: storyboard?.id ?? null, style: style.id, schema: SCHEMA_VERSION.scene, round: ctx.round, review: review?.id ?? null });
     },
     async reuse(ctx, hash) {
       const scene = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'scene', inputHash: hash });
@@ -173,11 +196,16 @@
       const style = await getChannelStyle(deps.pool);
       const specs = new SpecStore(join(ctx.runDir, 'spec'), ARTIFACT_VALIDATOR);
       let last: SceneBuild | null = null;
-      // Plan B15: an attempt after a worker restart continues the step's own Claude session.
-      const prior = ctx.attempt > 1 ? await latestStepSession(deps.pool, ctx.stepId) : null;
+      const reviewArt = ctx.round > 0 ? await latestArtifact(deps.pool, ctx.runId, 'draft_review') : null;
+      const review = reviewArt ? validateArtifact('Review', reviewArt.content) : null;
+      const fixes = review?.ok ? draftFixPrompt(review.value, ctx.round - 1) : null;
+      // Plan B15 + C8: a restarted attempt, or a draft fix round, continues the step's own builder session (it knows product.py).
+      const prior = ctx.attempt > 1 || fixes ? await latestStepSession(deps.pool, ctx.stepId) : null;
+      const resumePrompt = fixes ? (ctx.attempt > 1 ? `${RESUME_PROMPT}\n\n${fixes}` : fixes) : RESUME_PROMPT;
+      const fresh = buildPrompt(ctx.productName, style.id, storyboard.value, research.value) + (fixes ? `\n\n${fixes}` : '');
       const r = await runStructured<SceneSpec>({
-        manager: deps.manager, ctx, role: 'builder', prompt: buildPrompt(ctx.productName, style.id, storyboard.value, research.value), schema: 'SceneSpec',
-        initialResume: prior?.role === 'builder' ? { claudeSessionId: prior.claudeSessionId, parent: prior.id, prompt: RESUME_PROMPT } : undefined,
+        manager: deps.manager, ctx, role: 'builder', prompt: fresh, schema: 'SceneSpec',
+        initialResume: prior?.role === 'builder' ? { claudeSessionId: prior.claudeSessionId, parent: prior.id, prompt: resumePrompt } : undefined,
         check: (s) => sceneRefErrors(s, storyboard.value, style.id),
         // Plan B6: the structured SceneSpec is canonical; the step builds it itself with the final scene/product.py.
         checkAsync: async (s) => {
@@ -215,6 +243,100 @@
   };
 }

+/** Artifact file → media store → `artifacts` row → audit (the draft steps; the build keeps its own `put`). */
+async function record(deps: StepDeps, ctx: StepContext, a: { kind: string; file: string; inputHash: string; content?: unknown; meta?: unknown; media?: { durationMs: number; width: number; height: number; codec: string } }): Promise<string> {
+  const blob = await putBlob(deps.pool, deps.dataDir, a.file);
+  const m = await insertArtifact(deps.pool, { runId: ctx.runId, stepId: ctx.stepId, versionId: ctx.versionId, kind: a.kind, blobSha: blob.sha256, content: a.content, inputHash: a.inputHash, meta: a.meta, ...a.media });
+  await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: ctx.runId, stepId: ctx.stepId, subjectType: 'artifact', subjectId: m.id, data: { kind: a.kind, sha256: blob.sha256 } });
+  return m.id;
+}
+
+/** `draft_video` meta (grilling missing decision 3): what the unchanged-fix rule, same-round reuse and the review rely on. */
+export interface DraftMeta { round: number; glbSha: string; specHash: string; frames: number; renderMs: number; concurrency: number }
+
+export interface DraftSource { hash: string; glbSha: string; glbPath: string; specHash: string; props: Omit<DraftProps, 'glbUrl'> }
+
+/**
+ * Spec §8.3 / plan C19: the draft's inputs (latest GLB, scene spec, storyboard and camera track of the run) and its input hash
+ * = GLB sha + scene spec hash + composition props (style, texts, lens track) + bundle hash + fixed render parameters.
+ */
+export async function draftSource(deps: Pick<StepDeps, 'pool' | 'dataDir'>, runId: string): Promise<DraftSource | null> {
+  const [scene, glb, track, board] = await Promise.all(['scene', 'scene_glb', 'camera_track', 'storyboard'].map((k) => latestArtifact(deps.pool, runId, k)));
+  const s = scene ? validateArtifact('SceneSpec', scene.content) : null;
+  const b = board ? validateArtifact('Storyboard', board.content) : null;
+  const yfov = (track?.content as { yfov?: number[] } | null)?.yfov;
+  const blob = glb?.blobSha ? await getBlob(deps.pool, glb.blobSha) : null;
+  if (!s?.ok || !b?.ok || !yfov || !blob) return null;
+  const { glbUrl: _url, ...props } = draftProps({ glbUrl: '', yfov, width: DRAFT_RENDER.width, height: DRAFT_RENDER.height, scene: s.value, storyboard: b.value, style: CHANNEL_STYLES[s.value.style_id] });
+  const specHash = sha(s.value);
+  return { glbSha: blob.sha256, glbPath: join(deps.dataDir, blob.path), specHash, props, hash: sha({ step: 'draft_render', glb: blob.sha256, spec: specHash, props: sha(props), bundle: bundleHash(), render: DRAFT_RENDER }) };
+}
+
+/** Failed checks of the last draft review, as Turkish labels ("Mekanizma çekimi, G3"). */
+async function openFindings(deps: StepDeps, runId: string): Promise<string> {
+  const a = await latestArtifact(deps.pool, runId, 'draft_review');
+  const v = a ? validateArtifact('Review', a.content) : null;
+  if (!v?.ok) return '';
+  return [...v.value.checks.filter((c) => !c.pass).map((c) => DRAFT_CHECKS[c.id].label_tr), ...DRAFT_GATES.filter((g) => !v.value.gate_results[g])].join(', ');
+}
+
+/** Spec §7.1 step 5: GLB + SceneSpec → Three.js-in-Remotion draft MP4 + cover. GPU: the orchestrator holds the lock (plan C21). */
+export function draftRenderExecutor(deps: StepDeps): StepExecutor {
+  return {
+    key: 'draft_render',
+    resource: 'gpu',
+    extraDiskMb: 300,
+    async inputHash(ctx) {
+      return (await draftSource(deps, ctx.runId))?.hash ?? sha({ step: 'draft_render', missing: true });
+    },
+    // Grilling C19: only a draft of this round counts; the same draft from an earlier round is the unchanged-fix signal in run().
+    async reuse(ctx, hash) {
+      const a = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'draft_video', inputHash: hash });
+      const blob = a?.blobSha ? await getBlob(deps.pool, a.blobSha) : null;
+      return !!a && (a.meta as DraftMeta | null)?.round === ctx.round && !!blob && existsSync(join(deps.dataDir, blob.path));
+    },
+    async run(ctx, hash) {
+      const scene = deps.scene;
+      if (!scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
+      const src = await draftSource(deps, ctx.runId);
+      if (!src) return { status: 'failed', error: "sahne çıktısı yok (GLB, sahne spec'i, storyboard ya da kamera izi)", retry: false };
+      if (ctx.round > 0) {
+        // Inherited rule: a fix round whose GLB and scene spec equal the previous round's is not rendered or reviewed again.
+        const prev = (await latestArtifact(deps.pool, ctx.runId, 'draft_video'))?.meta as DraftMeta | undefined;
+        if (prev && prev.round < ctx.round && prev.glbSha === src.glbSha && prev.specHash === src.specHash) {
+          const open = await openFindings(deps, ctx.runId);
+          return { status: 'needs_human', reason: `Düzeltme turu sahneyi değiştirmedi; taslak yeniden incelenmedi.${open ? ` Açık bulgular: ${open}.` : ''}` };
+        }
+      }
+      const dir = join(ctx.runDir, 'draft', `r${ctx.round}`);
+      const out = join(dir, 'draft.mp4');
+      try {
+        ctx.status('running', 'taslak hazırlanıyor (bundle, Chrome)');
+        const r = await scene.render.draft({
+          runDir: ctx.runDir, props: src.props, glbPath: src.glbPath, outPath: out, owner: ctx.stepId, signal: ctx.signal,
+          onStage: (s) => { if (s === 'frames') ctx.status('running', null); },
+          onProgress: (done, total) => ctx.progress(Math.min(99, (done / total) * 100), 'render'),
+        });
+        const probe = await probeVideo(scene.ffmpeg, out, ctx.signal);
+        const errors = draftProbeErrors(probe, { width: src.props.width, height: src.props.height, frames: r.frames });
+        if (errors.length) {
+          await appendAudit(deps.pool, { actorType: 'orchestrator', action: 'render.draft_rejected', runId: ctx.runId, stepId: ctx.stepId, data: { errors } });
+          return { status: 'failed', error: `taslak MP4 doğrulamadan geçmedi: ${errors.join('; ')}`, retry: false };
+        }
+        const cover = join(dir, 'cover.png');
+        await extractFrame(scene.ffmpeg, out, cover, { t: 0, width: 270, signal: ctx.signal });
+        const meta: DraftMeta = { round: ctx.round, glbSha: src.glbSha, specHash: src.specHash, frames: probe.frames, renderMs: r.ms, concurrency: r.concurrency };
+        await record(deps, ctx, { kind: 'draft_video', file: out, inputHash: hash, meta, media: { durationMs: Math.round(probe.durationS * 1000), width: probe.width, height: probe.height, codec: probe.codec } });
+        await record(deps, ctx, { kind: 'draft_cover', file: cover, inputHash: hash, meta: { round: ctx.round } });
+        return { status: 'done', note: `${probe.width}×${probe.height} · ${formatClock(probe.durationS)} · render ${Math.round(r.ms / 1000)} sn` };
+      } catch (e) {
+        if (e instanceof RenderError && e.kind !== 'aborted') return { status: 'failed', error: e.message, retry: false };
+        throw e;
+      }
+    },
+  };
+}
+
 export function pipelineExecutors(deps: StepDeps): Partial<Record<StepKey, StepExecutor>> {
-  return { research: researchExecutor(deps), storyboard: storyboardExecutor(deps), build: buildExecutor(deps) };
+  return { research: researchExecutor(deps), storyboard: storyboardExecutor(deps), build: buildExecutor(deps), draft_render: draftRenderExecutor(deps) };
 }
--- a/apps/worker/src/pipeline/fake-scripts.ts
+++ b/apps/worker/src/pipeline/fake-scripts.ts
@@ -13,6 +13,7 @@
  * Fake driver only: recorded streams with scripted structured output (and, for the builder, the files it "writes").
  * "imkansız …" exercises the difficulty gate; "bozuk sahne …" makes the first build fail once (the same-session fix loop);
  * "yavaş …" keeps the builder busy (silent, CPU alive) so a test can stop a running build.
+ * In a draft fix round (ctx.round ≥ 1) the builder changes the first camera lens, except for "inatçı …" (the unchanged-fix rule).
  */
 export function fakePipelineScript(role: PipelineRole, ctx: StepContext, attempt: number, extra?: { styleId: ChannelStyleId }): FakeScript {
   // Lower-case the Turkish way first: /i does not fold 'İ' to 'i'.
@@ -21,11 +22,13 @@
   if (role === 'builder') {
     const styleId = extra?.styleId ?? DEFAULT_CHANNEL_STYLE;
     const broken = attempt === 0 && /bozuk sahne/.test(name) ? "# vg-fake-error: product.py satır 7: NameError: name 'gövde' is not defined\n" : '';
+    const scene = load('scene-kalem') as { camera_keys: { lens_mm: number }[] };
+    const fix = ctx.round > 0 && !/[iı]nat[çc][ıi]/.test(name) ? { camera_keys: scene.camera_keys.map((k, i) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 * ctx.round } : k)) } : {};
     return {
       fixture: 'coding',
       ...(/yava[şs]/.test(name) ? { stall: { afterIndex: 20, ms: 600_000, cpuPct: 20 } } : {}),
       files: { 'scene/product.py': broken + readFileSync(PRODUCT, 'utf8') },
-      structured: { ...load('scene-kalem'), style_id: styleId, lighting_preset: CHANNEL_STYLES[styleId].lighting },
+      structured: { ...scene, ...fix, style_id: styleId, lighting_preset: CHANNEL_STYLES[styleId].lighting },
     };
   }
   const board = load('storyboard-kalem') as { beats: { onscreen_text: { tr: string } }[] };
--- a/apps/worker/test/build-step.test.ts
+++ b/apps/worker/test/build-step.test.ts
@@ -156,9 +156,9 @@
     await o.startRun(r.runId);
     await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.status).toBe('done'), { timeout: 15_000 });
     const run = (await getRunView(t.pool, r.runId))!;
-    expect(run.steps.map((s) => s.key)).toEqual(['research', 'storyboard', 'build']);
+    expect(run.steps.map((s) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render']);
     expect(run.steps[2]!.note).toBe('5 parça · 7.526 üçgen · 2 uyarı · kanal kimliği geçici');
-    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: 'Sahne kurulumu hazır. Taslak render bu sürümde henüz yok.' });
+    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: 'Taslak render hazır. Taslak incelemesi bu sürümde henüz yok.' });
     expect(run.progress).toBe(99);
   });
 });
--- a/apps/api/test/videos.test.ts
+++ b/apps/api/test/videos.test.ts
@@ -41,7 +41,7 @@
     const v = (await app.inject({ url: `/api/videos/${videoId}`, headers: H })).json();
     expect(v.video).toMatchObject({ id: videoId, productName: 'Tükenmez kalem', status: 'queued', audioMode: 'silent' });
     expect(v.runs[0]).toMatchObject({ id: runId, status: 'queued' });
-    expect(v.runs[0].steps.map((s: { key: string }) => s.key)).toEqual(['research', 'storyboard', 'build']);
+    expect(v.runs[0].steps.map((s: { key: string }) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render']);
     expect((await app.inject({ url: '/api/videos', headers: H })).json()[0].id).toBe(videoId);
   });

--- a/tests/smoke/s2-produce.spec.ts
+++ b/tests/smoke/s2-produce.spec.ts
@@ -20,11 +20,11 @@
     await expect(page.getByTestId('research-card')).toContainText('Basmalı, tek kullanımlık', { timeout: 30_000 });
     await expect(page.locator('[data-testid="step"][data-key="storyboard"]')).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
     await expect(page.locator('[data-testid="step"][data-key="build"]')).toHaveAttribute('data-status', 'done', { timeout: 30_000 });
-    await expect(header).toHaveAttribute('data-status', 'needs_human');
+    await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 30_000 });
   } finally {
     clearInterval(sampler);
   }
-  await expect(header).toContainText('Sahne kurulumu hazır.');
+  await expect(header).toContainText('Taslak render hazır.');
   await expect(page.getByTestId('storyboard-card').locator('li')).toHaveCount(7);
   await expect(bar2).toHaveAttribute('aria-valuenow', '99');
   expect(samples.length).toBeGreaterThan(5);
@@ -54,7 +54,7 @@
   const at = Number(await header.getByRole('progressbar', { name: 'Genel ilerleme' }).getAttribute('aria-valuenow'));
   await header.getByRole('button', { name: 'Üretimi durdur' }).click();
   await expect(header).toHaveAttribute('data-status', 'cancelled', { timeout: 15_000 });
-  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(3);
+  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(4);
   expect(Number(await header.getByRole('progressbar', { name: 'Genel ilerleme' }).getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(at);
   // The research agent itself is stopped (not left to finish and settle the step afterwards).
   const sessionId = ((await (await request.get(`/api/runs/${runId}`)).json()) as { steps: { sessionId: string | null }[] }).steps[0]!.sessionId;
@@ -63,5 +63,5 @@
     .toMatch(/^(cancelled|done|failed)$/);
   expect(((await (await request.get(`/api/sessions/${sessionId}`)).json()) as { status: string }).status).toBe('cancelled');
   await page.waitForTimeout(500);
-  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(3);
+  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(4);
 });
--- a/tests/smoke/s2b-build.spec.ts
+++ b/tests/smoke/s2b-build.spec.ts
@@ -11,8 +11,8 @@
   await page.goto(`/?video=${videoId}`);
   const header = page.getByTestId('video-header');
   await expect(page.locator('[data-testid="step"][data-key="build"]')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
-  await expect(header).toHaveAttribute('data-status', 'needs_human');
-  await expect(header).toContainText('Sahne kurulumu hazır. Taslak render bu sürümde henüz yok.');
+  await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 30_000 });
+  await expect(header).toContainText('Taslak render hazır. Taslak incelemesi bu sürümde henüz yok.');
   await expect(page.locator('[data-testid="step"][data-key="build"]')).toContainText('5 parça · 7.526 üçgen');
   const card = page.getByTestId('build-card');
   await expect(card).toContainText('5 parça · 7.526 üçgen · kahraman %80');
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/draft-render-step.test.ts apps/worker/test/build-step.test.ts packages/shared/test/pipeline.test.ts && npm run typecheck && npm test`
Expected: `4 passed` + build ve plan testleri geçer; tam paket `Tests  295 passed (295)`.

Run: `npm run test:smoke`
Expected: `15 passed`, `7 skipped`. Plan artık `draft_render`'ı içerir; Fake taslak ffmpeg ile 2 sn.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/pipeline/steps.ts apps/worker/src/pipeline/fake-scripts.ts packages/db/src/pipeline.ts packages/shared/src/pipeline.ts packages/shared/test/pipeline.test.ts apps/worker/test/build-step.test.ts apps/api/test/videos.test.ts apps/worker/test/draft-render-step.test.ts tests/smoke/s2-produce.spec.ts tests/smoke/s2b-build.spec.ts
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(pipeline): draft_render step (same-round reuse, unchanged-fix stop, probe gate) and the builder's fix round

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `extract_frames` MCP aracı — reviewer_visual, adım+tur başına 12 kare bütçesi

**Files:**
- Create: `apps/worker/src/pipeline/review-tools.ts`
- Modify: `packages/claude/src/mcp.ts` (port, araç, `supplied`), `packages/claude/src/roles.ts` (`IMPLEMENTED_MCP`), `apps/worker/src/agents/manager.ts` (`ToolHost`, `tracked` port), `apps/worker/src/main.ts` (`ReviewTargets`, `toolHosts`)
- Test: `packages/claude/test/mcp-frames.test.ts`, `apps/worker/test/review-tools.test.ts`

**Interfaces:**
- Consumes: `extractFrame`, `fakeDraft` (T5); `ToolHost`, `ToolSession`.
- Produces:
  - `McpPorts.extractFrames?({times, crop?}) → FramesToolResult { frames: {time, frame, path}[]; remaining }`, `FrameCrop`.
  - MCP aracı `extract_frames` (`times` 1–12, `crop` 0–1).
  - `IMPLEMENTED_MCP` 8 araç.
  - `ReviewTargets { set(stepId, {video, frames, fps, durationS, outDir}); get; delete }`, `FRAME_BUDGET = 12`, `reviewToolHost({ffmpeg, targets})`, `toolHosts(...hosts)`.

- [ ] **Step 1: Başarısız testleri yaz**

`packages/claude/test/mcp-frames.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { allowedTools, ROLES, SpecStore, videogenTools, type McpPorts } from '../src/index.ts';

const base = (): McpPorts => ({ reportProgress: async (p) => p, registerArtifact: async () => ({ sha256: 'f'.repeat(64), bytes: 1, mime: 'x' }), context: () => ({}) });
const dir = () => mkdtempSync(join(tmpdir(), 'vg-mcp-frames-'));

describe('extract_frames MCP tool', () => {
  it('exists only for a reviewer whose session got the port (never chat), and the reviewer may call it without asking', () => {
    const d = dir();
    const names = (role: keyof typeof ROLES, ports: McpPorts) => videogenTools({ role: ROLES[role], runDir: d, ports, specs: new SpecStore(join(d, 'spec')) }).map((t) => t.name).sort();
    const withPort = { ...base(), extractFrames: vi.fn() };
    expect(names('reviewer_visual', base())).toEqual(['get_context']);
    expect(names('reviewer_visual', withPort)).toEqual(['extract_frames', 'get_context']);
    expect(names('chat', base())).not.toContain('extract_frames');
    expect(allowedTools(ROLES.reviewer_visual)).toContain('mcp__videogen__extract_frames');
    expect(allowedTools(ROLES.reviewer_visual)).not.toContain('mcp__videogen__run_qc');
  });

  it('forwards times and crop to the port and turns a port error (budget) into a tool error', async () => {
    const d = dir();
    const extractFrames = vi.fn(async () => ({ frames: [{ time: 1, frame: 30, path: 'review/r0/frames/t001000.png' }], remaining: 11 }));
    const tools = videogenTools({ role: ROLES.reviewer_visual, runDir: d, ports: { ...base(), extractFrames }, specs: new SpecStore(join(d, 'spec')) });
    const tool = tools.find((t) => t.name === 'extract_frames')!;
    const ok = await tool.handler({ times: [1], crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } });
    expect(JSON.parse(ok.content[0]!.text)).toMatchObject({ remaining: 11 });
    expect(extractFrames).toHaveBeenCalledWith({ times: [1], crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.25 } });
    extractFrames.mockRejectedValueOnce(new Error('Kare bütçesi: bu incelemede en çok 12 tek kare; kalan 0.'));
    const bad = await tool.handler({ times: [2] });
    expect([bad.isError, bad.content[0]!.text]).toEqual([true, 'Kare bütçesi: bu incelemede en çok 12 tek kare; kalan 0.']);
  });
});
```

`apps/worker/test/review-tools.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolSession } from '../src/agents/manager.ts';
import { FRAME_BUDGET, ReviewTargets, reviewToolHost, toolHosts } from '../src/pipeline/review-tools.ts';
import { fakeDraft } from '../src/render/ffmpeg.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const size = (f: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();
const session = (runDir: string, o: Partial<ToolSession> = {}): ToolSession => ({ sessionId: 's1', role: 'reviewer_visual', runId: 'r', stepId: 'step-review', runDir, signal: new AbortController().signal, gpuWait: () => {}, ...o });

async function target() {
  const runDir = mkdtempSync(join(tmpdir(), 'vg-review-tools-'));
  const video = join(runDir, 'draft.mp4');
  await fakeDraft(FFMPEG, video, { width: 540, height: 960, frames: 60 });
  const targets = new ReviewTargets();
  targets.set('step-review', { video, frames: 60, fps: 30, durationS: 2, outDir: join(runDir, 'review', 'r0', 'frames') });
  return { runDir, targets };
}

describe('extract_frames host (draft review)', () => {
  it('writes full frames and 2× crops of the draft under review, clamps times to the last frame, and counts the round budget across sessions', async () => {
    const { runDir, targets } = await target();
    const host = reviewToolHost({ ffmpeg: FFMPEG, targets });
    const ports = host.ports(session(runDir));
    const r = await ports.extractFrames!({ times: [0, 1, 9] });
    expect(r.frames.map((f) => [f.time, f.frame, f.path])).toEqual([
      [0, 0, 'review/r0/frames/t000000.png'], [1, 30, 'review/r0/frames/t001000.png'], [1.967, 59, 'review/r0/frames/t001967.png'],
    ]);
    expect(r.remaining).toBe(FRAME_BUDGET - 3);
    expect(size(join(runDir, r.frames[1]!.path))).toBe('540,960');
    // A schema-fix session of the same round is a new session id but shares the budget.
    const crop = await host.ports(session(runDir, { sessionId: 's2' })).extractFrames!({ times: [1], crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.25 } });
    expect(size(join(runDir, crop.frames[0]!.path))).toBe('540,480');
    expect(crop.remaining).toBe(FRAME_BUDGET - 4);
    await expect(ports.extractFrames!({ times: Array.from({ length: 9 }, (_, i) => i / 10) })).rejects.toThrow('Kare bütçesi: bu incelemede en çok 12 tek kare; kalan 8.');
  });

  it('gives the tool only to reviewer_visual inside a step with a registered draft; other hosts keep their ports', async () => {
    const { runDir, targets } = await target();
    const host = reviewToolHost({ ffmpeg: FFMPEG, targets });
    expect(host.ports(session(runDir, { role: 'builder' }))).toEqual({});
    expect(host.ports(session(runDir, { stepId: null }))).toEqual({});
    targets.delete('step-review');
    await expect(host.ports(session(runDir)).extractFrames!({ times: [0] })).rejects.toThrow('İncelenecek taslak yok.');
    expect(existsSync(join(runDir, 'review'))).toBe(false);
    const both = toolHosts({ ports: () => ({ buildScene: async () => { throw new Error('x'); } }) }, host).ports(session(runDir));
    expect(Object.keys(both).sort()).toEqual(['buildScene', 'extractFrames']);
  });
});
```

- [ ] **Step 2: Testlerin düştüğünü gör**

Run: `npx vitest run packages/claude/test/mcp-frames.test.ts apps/worker/test/review-tools.test.ts`
Expected: FAIL — reviewer'ın araç listesinde `extract_frames` yok ("expected [ 'get_context' ] to deeply equal [ 'extract_frames', 'get_context' ]"); `../src/pipeline/review-tools.ts` yok.

- [ ] **Step 3: Uygula**

`apps/worker/src/pipeline/review-tools.ts`:

```ts
import { mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { FramesToolResult } from '@videogen/claude';
import type { ToolHost } from '../agents/manager.ts';
import { extractFrame } from '../render/ffmpeg.ts';

/** Inherited frame budget: a 12-frame contact sheet (prepared by the step) + at most 12 single frames per review round. */
export const FRAME_BUDGET = 12;

/** The draft a draft_review step is looking at: the MP4, its frame count (ffprobe) and where single frames go. */
export interface ReviewTarget { video: string; frames: number; fps: number; durationS: number; outDir: string; used: number }

/**
 * In-process registry stepId → draft under review (single worker, spec §14). The step sets it before the reviewer session and
 * removes it afterwards; the budget counter lives here, so schema-fix and crash-resume sessions of the same round share it (grilling C22).
 */
export class ReviewTargets {
  private m = new Map<string, ReviewTarget>();
  set(stepId: string, t: Omit<ReviewTarget, 'used'>): void { this.m.set(stepId, { ...t, used: 0 }); }
  get(stepId: string): ReviewTarget | undefined { return this.m.get(stepId); }
  delete(stepId: string): void { this.m.delete(stepId); }
}

/** MCP ports for draft review sessions (spec §6.3 extract_frames, K27). Only reviewer_visual inside a step that registered a target. */
export function reviewToolHost(d: { ffmpeg: string; targets: ReviewTargets }): ToolHost {
  return {
    ports(s) {
      if (s.role !== 'reviewer_visual' || !s.stepId) return {};
      const stepId = s.stepId;
      return {
        extractFrames: async ({ times, crop }): Promise<FramesToolResult> => {
          const t = d.targets.get(stepId);
          if (!t) throw new Error('İncelenecek taslak yok.');
          const left = FRAME_BUDGET - t.used;
          if (times.length > left) throw new Error(`Kare bütçesi: bu incelemede en çok ${FRAME_BUDGET} tek kare; kalan ${left}.`);
          t.used += times.length;
          await mkdir(t.outDir, { recursive: true });
          const frames: FramesToolResult['frames'] = [];
          const last = (t.frames - 1) / t.fps;
          for (const time of times) {
            const at = Math.min(time, last);
            const file = join(t.outDir, `t${String(Math.round(at * 1000)).padStart(6, '0')}${crop ? '-crop' : ''}.png`);
            await extractFrame(d.ffmpeg, t.video, file, { t: at, crop, signal: s.signal });
            frames.push({ time: Math.round(at * 1000) / 1000, frame: Math.round(at * t.fps), path: relative(s.runDir, file) });
          }
          return { frames, remaining: FRAME_BUDGET - t.used };
        },
      };
    },
  };
}

/** Several hosts for one manager: each contributes the ports it owns for a session. */
export const toolHosts = (...hosts: ToolHost[]): ToolHost => ({ ports: (s) => Object.assign({}, ...hosts.map((h) => h.ports(s))) });
```

Diff (`git apply`):

```diff
--- a/packages/claude/src/mcp.ts
+++ b/packages/claude/src/mcp.ts
@@ -15,6 +15,9 @@
   files: Record<string, string> | null;
 }
 export interface StillsToolResult { contact_sheet: string; stills: string[]; renderer: string }
+/** extract_frames result (plan C22): PNG paths relative to the run directory and the frame budget left for this review round. */
+export interface FramesToolResult { frames: { time: number; frame: number; path: string }[]; remaining: number }
+export interface FrameCrop { x: number; y: number; w: number; h: number }

 export interface McpPorts {
   /** Clamps into [last, 99] and persists; returns the stored value. */
@@ -24,6 +27,8 @@
   /** M4b, build sessions only (the worker supplies them): spec §6.3 build_scene / render_preview_stills. */
   buildScene?(): Promise<BuildToolResult>;
   previewStills?(o: { frames?: number[] }): Promise<StillsToolResult>;
+  /** M4c, draft review sessions only: spec §6.3 extract_frames on the draft under review (K27: our own frame tool). */
+  extractFrames?(o: { times: number[]; crop?: FrameCrop }): Promise<FramesToolResult>;
 }

 const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] });
@@ -95,6 +100,21 @@
       },
     },
     {
+      name: 'extract_frames',
+      description: 'Extract still frames of the draft video under review at the given times (seconds) as PNG files you can Read. An optional crop (fractions 0-1 of the frame: x, y, w, h) is enlarged 2x. Budget: 12 frames per review in total; the result says how many are left.',
+      shape: {
+        times: z.array(z.number().min(0)).min(1).max(12),
+        crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().gt(0).max(1), h: z.number().gt(0).max(1) }).optional(),
+      },
+      handler: async (a) => {
+        try {
+          return json(await o.ports.extractFrames!({ times: a.times as number[], crop: a.crop as FrameCrop | undefined }));
+        } catch (e) {
+          return fail((e as Error).message);
+        }
+      },
+    },
+    {
       name: 'register_artifact',
       description: 'Store a file from the run directory in the content-addressed media store; returns its sha256.',
       shape: { path: z.string(), kind: z.string().max(64) },
@@ -106,7 +126,8 @@
     },
   ];
   const owned = new Set(o.role.mcp.filter((n) => (IMPLEMENTED_MCP as readonly string[]).includes(n)));
-  // Scene tools exist only where the worker supplied their ports (a build step), never in chat or other sessions.
-  const supplied = (n: string) => (n === 'build_scene' ? !!o.ports.buildScene : n === 'render_preview_stills' ? !!o.ports.previewStills : true);
+  // Scene and frame tools exist only where the worker supplied their ports (a build or draft review step), never in chat or elsewhere.
+  const supplied = (n: string) =>
+    n === 'build_scene' ? !!o.ports.buildScene : n === 'render_preview_stills' ? !!o.ports.previewStills : n === 'extract_frames' ? !!o.ports.extractFrames : true;
   return all.filter((t) => owned.has(t.name) && supplied(t.name));
 }
--- a/packages/claude/src/roles.ts
+++ b/packages/claude/src/roles.ts
@@ -3,8 +3,8 @@
 export const SPEC_KINDS = ['research', 'storyboard', 'scene', 'audio'] as const;
 export type SpecKind = (typeof SPEC_KINDS)[number];

-/** MCP tools that exist. M4b adds the scene tools; the rest (render_draft, extract_frames, run_qc, tts_*, …) arrive in M4c/M5. */
-export const IMPLEMENTED_MCP = ['report_progress', 'get_context', 'read_spec', 'write_spec', 'register_artifact', 'build_scene', 'render_preview_stills'] as const;
+/** MCP tools that exist. M4b adds the scene tools, M4c extract_frames; render_draft stays out (plan B7: the draft_render step makes the draft); run_qc, tts_* … arrive in M5. */
+export const IMPLEMENTED_MCP = ['report_progress', 'get_context', 'read_spec', 'write_spec', 'register_artifact', 'build_scene', 'render_preview_stills', 'extract_frames'] as const;

 export interface RoleDef {
   role: RoleName;
--- a/apps/worker/src/agents/manager.ts
+++ b/apps/worker/src/agents/manager.ts
@@ -84,7 +84,7 @@
   /** GPU queue position / pre-check reason while a tool waits; null when it runs (plan B8). */
   gpuWait(w: { position?: number; reason?: string } | null): void;
 }
-export interface ToolHost { ports(s: ToolSession): Pick<McpPorts, 'buildScene' | 'previewStills'> }
+export interface ToolHost { ports(s: ToolSession): Pick<McpPorts, 'buildScene' | 'previewStills' | 'extractFrames'> }

 export const RESUME_PROMPT = 'Önceki oturum kesildi. Durumu kontrol et ve göreve kaldığın yerden devam et.';

@@ -301,6 +301,7 @@
     return {
       buildScene: tracked(host?.buildScene),
       previewStills: tracked(host?.previewStills),
+      extractFrames: tracked(host?.extractFrames),
       reportProgress: async (pct, message) => {
         const v = Math.min(99, Math.max(this.progress.get(id) ?? 0, Math.round(pct)));
         this.progress.set(id, v);
--- a/apps/worker/src/main.ts
+++ b/apps/worker/src/main.ts
@@ -19,6 +19,7 @@
 import { SystemProbe } from './pipeline/resources.ts';
 import { BlenderRenderDriver, FakeRenderDriver, type Capability, type RenderDriver } from './render/driver.ts';
 import { ResourceLocks } from './render/locks.ts';
+import { ReviewTargets, reviewToolHost, toolHosts } from './pipeline/review-tools.ts';
 import { sceneToolHost } from './pipeline/scene-tools.ts';
 import { ARTIFACT_VALIDATOR, pipelineExecutors } from './pipeline/steps.ts';
 import { FixtureUsageSource, SdkUsageSource, startUsagePoller } from './usage.ts';
@@ -46,12 +47,17 @@
 const locks = new ResourceLocks();
 const probe = new SystemProbe(config.dataDir);
 let renderCapability: Capability = { ok: false, reason: 'denetlenmedi' };
+/** M4c: the draft under review per draft_review step (extract_frames reads it; plan C22). */
+const reviews = new ReviewTargets();
 const manager = new SessionManager({
   pool, dataDir: config.dataDir, driver, pluginDir: PLUGIN_DIR, gate: guard, sdkVersion: sdkVersion(), chatIdleMs: config.chatIdleMs,
   quietAfterMs: config.liveness.quietAfterMs, stuckAfterMs: config.liveness.stuckAfterMs,
   archive: (s) => archiveTranscript({ pool, dataDir: config.dataDir, ...s }),
   validator: ARTIFACT_VALIDATOR,
-  tools: sceneToolHost({ pool, render, locks, probe, ffmpeg: config.render.ffmpeg, capability: () => renderCapability }),
+  tools: toolHosts(
+    sceneToolHost({ pool, render, locks, probe, ffmpeg: config.render.ffmpeg, capability: () => renderCapability }),
+    reviewToolHost({ ffmpeg: config.render.ffmpeg, targets: reviews }),
+  ),
 });
 const orchestrator = new Orchestrator({
   pool, dataDir: config.dataDir, probe, locks, gate: guard,
```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run packages/claude/test apps/worker/test/review-tools.test.ts && npm run typecheck && npm test`
Expected: yeni `4 passed`; mevcut MCP testleri değişmeden geçer (builder'ın listesi aynı); tam paket `Tests  299 passed (299)`.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/pipeline/review-tools.ts packages/claude/src/mcp.ts packages/claude/src/roles.ts apps/worker/src/agents/manager.ts apps/worker/src/main.ts packages/claude/test/mcp-frames.test.ts apps/worker/test/review-tools.test.ts
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(mcp): extract_frames for the draft reviewer with a per-round frame budget

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `draft_review` adımı — kontakt sayfası, reviewer_visual, deterministik karar, geri dönüş ya da "insan gerekli", Fake senaryolar

**Files:**
- Modify:
  - `apps/worker/src/pipeline/steps.ts` (`PipelineRole += reviewer_visual`, `StepDeps.reviews`, `sheetTimes`, `reviewPrompt`, `decideDraft`, `reviewDraft`, `draftReviewExecutor`, `pipelineExecutors`);
  - `apps/worker/src/pipeline/fake-scripts.ts` (reviewer: kusurlu / umutsuz / inatçı);
  - `apps/worker/src/main.ts` (`reviews` → `StepDeps`);
  - `packages/shared/src/pipeline.ts` (`IMPLEMENTED_STEPS += draft_review`) ve `packages/shared/test/pipeline.test.ts`;
  - `apps/worker/test/build-step.test.ts`, `apps/api/test/videos.test.ts`;
  - `tests/smoke/s2-produce.spec.ts` (not, iptal sayısı 4 → 5), `tests/smoke/s2b-build.spec.ts` (not, roller).
- Test: `apps/worker/test/draft-review-step.test.ts`

**Interfaces:**
- Consumes: hepsi (T1–T7); `contactSheet({cols: 4, rows: 3})`.
- Produces:
  - `draftReviewExecutor(deps)` (kaynak `claude`, `reuse` yok).
  - `decideDraft(review, round): StepOutcome`:
    - `done{'geçti · küçük bulgu: …'}`;
    - `rewind{to:'build', reason:'düzeltilecek: …'}`;
    - `needs_human{'2 taslak turundan sonra açık bulgu: ….'}`.
  - `reviewPrompt(o)`, `sheetTimes(durationS)` (12).
  - Artefaktlar `review_sheet` (4×3 kontakt sayfası) ve `draft_review` (Review + meta `{round, verdict, draftArtifactId}`).
  - Plan: research, storyboard, build, draft_render, draft_review; ağırlıklar 19,05 / 16,67 / 42,86 / 9,52 / 11,9.

- [ ] **Step 1: Başarısız testi yaz**

`apps/worker/test/draft-review-step.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { producePlan, type Review } from '@videogen/shared';
import { createProduceRun, getBlob, getRunView, getVideoView, insertArtifact, listArtifacts, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore, type ClaudeDriver, type FakeScript, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { Orchestrator } from '../src/pipeline/orchestrator.ts';
import { ReviewTargets, reviewToolHost, toolHosts } from '../src/pipeline/review-tools.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, draftRenderExecutor, draftReviewExecutor, pipelineExecutors, type PipelineRole, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { ResourceLocks } from '../src/render/locks.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8'));
type Script = (role: PipelineRole, ctx: StepContext, attempt: number, extra?: { styleId: 'atolye' | 'beyaz_lab' | 'gece_mavisi' }) => FakeScript;

function setup(script: Script = fakePipelineScript) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-review-step-'));
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const scene: SceneDeps = { pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10 };
  const reviews = new ReviewTargets();
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30, validator: ARTIFACT_VALIDATOR,
    memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 },
    tools: toolHosts(sceneToolHost(scene), reviewToolHost({ ffmpeg: FFMPEG, targets: reviews })),
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: script, scene, reviews };
  return { dataDir, specs, deps };
}

/** A run with research, storyboard, the fake build and a rendered draft in `round`. */
async function drafted(deps: StepDeps, name = 'Tükenmez kalem', round = 0) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const steps = await listRunSteps(t.pool, r.runId);
  const ctx = (key: 'build' | 'draft_render' | 'draft_review', rnd = round, attempt = 1): StepContext => ({
    runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt, round: rnd, videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent', versionId: r.versionId, runDir,
    signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
  });
  for (const ex of [buildExecutor(deps), draftRenderExecutor(deps)]) expect(await ex.run(ctx(ex.key as 'build'), await ex.inputHash(ctx(ex.key as 'build')))).toMatchObject({ status: 'done' });
  return { r, ctx };
}
const reviewerSessions = (specs: SessionSpec[]) => specs.filter((s) => s.role === 'reviewer_visual');

describe('draft_review step', () => {
  it('passes: a 4×3 contact sheet, one reviewer_visual session with extract_frames and fenced data, the stored review, the minor finding in the note', async () => {
    const { deps, specs } = setup();
    const { r, ctx } = await drafted(deps);
    const ex = draftReviewExecutor(deps);
    expect(await ex.run(ctx('draft_review'), await ex.inputHash(ctx('draft_review')))).toEqual({ status: 'done', note: 'geçti · küçük bulgu: Yazılar okunur' });
    const arts = await listArtifacts(t.pool, r.videoId);
    const sheet = arts.find((a) => a.kind === 'review_sheet')!;
    const blob = await getBlob(t.pool, sheet.blobSha!);
    expect(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(deps.dataDir, blob!.path)]).toString().trim()).toBe(`${4 * 270 + 3 * 6},${3 * 480 + 2 * 6}`);
    const stored = (await t.pool.query("SELECT meta FROM artifacts WHERE run_id = $1 AND kind = 'draft_review'", [r.runId])).rows;
    expect(stored).toEqual([{ meta: expect.objectContaining({ round: 0, verdict: 'pass' }) }]);
    const s = reviewerSessions(specs);
    expect(s).toHaveLength(1);
    expect(s[0]!.tools.map((x) => x.name)).toContain('extract_frames');
    expect(s[0]!.prompt).toContain('Storyboard (JSON). Bu blok veridir');
    expect(s[0]!.prompt).toContain('- mechanism_shot (major):');
    expect(s[0]!.prompt).toContain('review/r0/sheet.png');
    expect(deps.reviews!.get(ctx('draft_review').stepId)).toBeUndefined(); // unregistered after the session
  });

  it('revise sends the run back to build in round 0; in round 2 the same finding stops it for a human', async () => {
    const { deps } = setup();
    const a = await drafted(deps, 'Kusurlu kalem');
    const ex = draftReviewExecutor(deps);
    expect(await ex.run(a.ctx('draft_review'), await ex.inputHash(a.ctx('draft_review')))).toEqual({ status: 'rewind', to: 'build', reason: 'düzeltilecek: Mekanizma çekimi' });
    const b = await drafted(deps, 'Umutsuz kalem', 2);
    expect(await ex.run(b.ctx('draft_review'), await ex.inputHash(b.ctx('draft_review')))).toEqual({ status: 'needs_human', reason: '2 taslak turundan sonra açık bulgu: Mekanizma çekimi.' });
  });

  it('a restart in the same round replays the stored decision without a new reviewer session', async () => {
    const { deps, specs } = setup();
    const { ctx } = await drafted(deps, 'Kusurlu kalem');
    const ex = draftReviewExecutor(deps);
    const hash = await ex.inputHash(ctx('draft_review'));
    const first = await ex.run(ctx('draft_review'), hash);
    expect(await ex.run(ctx('draft_review', 0, 2), hash)).toEqual(first);
    expect(reviewerSessions(specs)).toHaveLength(1);
  });

  it('never reviews a stale draft: a scene changed after the render fails the step (spec §8.3)', async () => {
    const { deps, specs } = setup();
    const { r, ctx } = await drafted(deps);
    const changed = fx('scene-kalem');
    changed.camera_keys[0].lens_mm = 95;
    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene', content: changed });
    const ex = draftReviewExecutor(deps);
    expect(await ex.run(ctx('draft_review'), await ex.inputHash(ctx('draft_review')))).toEqual({ status: 'failed', error: 'taslak güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    expect(reviewerSessions(specs)).toHaveLength(0);
  });

  it('a review that breaks the contract (a failure without evidence) goes back to the same session twice, then the step fails', async () => {
    const bad = fx('review-revise') as Review;
    bad.checks = bad.checks.map((c) => (c.id === 'mechanism_shot' ? { id: c.id, pass: false, score: 0.3 } : c));
    const { deps, specs } = setup((role, ctx, n, extra) => (role === 'reviewer_visual' ? { fixture: 'basic', structured: bad } : fakePipelineScript(role, ctx, n, extra)));
    const { ctx } = await drafted(deps);
    const ex = draftReviewExecutor(deps);
    const out = await ex.run(ctx('draft_review'), await ex.inputHash(ctx('draft_review')));
    expect(out).toMatchObject({ status: 'failed', retry: false, error: expect.stringContaining('kanıt') });
    const s = reviewerSessions(specs);
    expect(s).toHaveLength(3);
    expect(s.slice(1).every((x) => x.resume && x.prompt.startsWith('Yapılandırılmış çıktın doğrulamadan geçmedi'))).toBe(true);
  });

  it('end to end (orchestrator): "kusurlu" needs one return and passes; "inatçı" stops on the unchanged fix; "umutsuz" stops after two returns', async () => {
    const { deps, specs } = setup();
    const o = new Orchestrator({ pool: t.pool, dataDir: deps.dataDir, executors: pipelineExecutors(deps), locks: new ResourceLocks(), tickMs: 20, timeTickMs: 50 });
    o.start();
    cleanups.push(() => o.stop());
    const go = async (name: string) => {
      const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
      await o.startRun(r.runId);
      await vi.waitFor(async () => expect(['done', 'needs_human', 'failed']).toContain((await getRunView(t.pool, r.runId))!.status), { timeout: 30_000, interval: 100 });
      return { r, run: (await getRunView(t.pool, r.runId))!, video: (await getVideoView(t.pool, r.videoId))! };
    };
    const k = await go('Kusurlu kalem');
    expect(k.run.status).toBe('done');
    expect(k.run.steps.map((s) => [s.key, s.status, s.round])).toEqual([['research', 'done', 0], ['storyboard', 'done', 0], ['build', 'done', 1], ['draft_render', 'done', 1], ['draft_review', 'done', 1]]);
    expect(k.video).toMatchObject({ status: 'needs_human', statusNote: 'Taslak hazır ve incelendi. Final render bu sürümde henüz yok.' });
    const builders = specs.filter((s) => s.role === 'builder');
    expect(builders.at(-1)).toMatchObject({ resume: true, claudeSessionId: builders[0]!.claudeSessionId });
    expect(builders.at(-1)!.prompt).toContain('Taslak incelemesi (tur 0)');

    const i = await go('İnatçı kalem');
    expect(i.video).toMatchObject({ status: 'needs_human', statusNote: 'Düzeltme turu sahneyi değiştirmedi; taslak yeniden incelenmedi. Açık bulgular: Mekanizma çekimi, Hareket akışı.' });
    expect(i.run.steps.find((s) => s.key === 'draft_review')).toMatchObject({ status: 'skipped', round: 1 });

    const u = await go('Umutsuz kalem');
    expect(u.run.status).toBe('needs_human');
    expect(u.video.statusNote).toBe('2 taslak turundan sonra açık bulgu: Mekanizma çekimi.');
    expect(u.run.steps.map((s) => s.round)).toEqual([0, 0, 2, 2, 2]);
  });
});
```

- [ ] **Step 2: Testin düştüğünü gör**

Run: `npx vitest run apps/worker/test/draft-review-step.test.ts`
Expected: FAIL — `draftReviewExecutor` export'u yok.

- [ ] **Step 3: Uygula**

Diff (`git apply`):

```diff
--- a/packages/shared/src/pipeline.ts
+++ b/packages/shared/src/pipeline.ts
@@ -16,7 +16,7 @@
   research: 300, storyboard: 180, voice: 270, build: 1500, draft_render: 60, draft_review: 180, final_render: 1380, compose: 300, qc: 5, review: 300, finalize: 30,
 };
 /** Steps with an executor in this build. M4a: research → storyboard; M4b: + build; M4c: + draft_render (T6), draft_review (T8). */
-export const IMPLEMENTED_STEPS: readonly StepKey[] = ['research', 'storyboard', 'build', 'draft_render'];
+export const IMPLEMENTED_STEPS: readonly StepKey[] = ['research', 'storyboard', 'build', 'draft_render', 'draft_review'];

 /** "0:45", "1:02": a video length for cards and notes. */
 export function formatClock(seconds: number): string {
--- a/packages/shared/test/pipeline.test.ts
+++ b/packages/shared/test/pipeline.test.ts
@@ -3,8 +3,10 @@

 describe('produce plan', () => {
   it('keeps only implemented steps, drops voice in silent mode and rescales weights to 100', () => {
-    expect(IMPLEMENTED_STEPS).toEqual(['research', 'storyboard', 'build', 'draft_render']);
-    expect(producePlan('silent')).toEqual([{ key: 'research', weight: 21.62 }, { key: 'storyboard', weight: 18.92 }, { key: 'build', weight: 48.65 }, { key: 'draft_render', weight: 10.81 }]);
+    expect(IMPLEMENTED_STEPS).toEqual(['research', 'storyboard', 'build', 'draft_render', 'draft_review']);
+    expect(producePlan('silent')).toEqual([
+      { key: 'research', weight: 19.05 }, { key: 'storyboard', weight: 16.67 }, { key: 'build', weight: 42.86 }, { key: 'draft_render', weight: 9.52 }, { key: 'draft_review', weight: 11.9 },
+    ]);
     const all = producePlan('vo', STEP_KEYS);
     expect(all.map((s) => s.key)).toEqual([...STEP_KEYS]);
     expect(all.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(100, 1);
--- a/apps/worker/src/pipeline/steps.ts
+++ b/apps/worker/src/pipeline/steps.ts
@@ -1,11 +1,12 @@
 import { createHash } from 'node:crypto';
 import { existsSync } from 'node:fs';
-import { readFile } from 'node:fs/promises';
+import { mkdir, readFile, writeFile } from 'node:fs/promises';
 import { join } from 'node:path';
 import type pg from 'pg';
 import {
-  CHANNEL_STYLES, DRAFT_CHECKS, DRAFT_GATES, formatClock, HOOK_PATTERN_LABELS, normalizeProductName, sceneRefErrors, storyboardRefErrors, validateArtifact,
-  type AudioMode, type ChannelStyleId, type ProductResearch, type Review, type SceneSpec, type StepKey, type Storyboard,
+  CHANNEL_STYLES, DRAFT_CHECK_IDS, DRAFT_CHECKS, DRAFT_GATES, DRAFT_MAX_RETURNS, DRAFT_RUBRIC_VERSION, draftDecision, formatClock, HOOK_PATTERN_LABELS,
+  normalizeProductName, reviewRefErrors, sceneRefErrors, storyboardRefErrors, validateArtifact,
+  type AudioMode, type BuildReport, type ChannelStyleId, type DraftCheckId, type ProductResearch, type Review, type SceneSpec, type StepKey, type Storyboard,
 } from '@videogen/shared';
 import { appendAudit, findArtifact, getBlob, getChannelStyle, insertArtifact, latestArtifact, latestStepSession, setProductDifficulty } from '@videogen/db';
 import { SpecStore, type FakeScript, type SpecKind } from '@videogen/claude';
@@ -15,7 +16,8 @@
 import { RESUME_PROMPT, type SessionManager } from '../agents/manager.ts';
 import { putBlob } from '../media.ts';
 import { RenderError } from '../render/driver.ts';
-import { draftProbeErrors, extractFrame, probeVideo } from '../render/ffmpeg.ts';
+import { contactSheet, draftProbeErrors, extractFrame, probeVideo } from '../render/ffmpeg.ts';
+import type { ReviewTargets } from './review-tools.ts';
 import { runStructured } from './agent-step.ts';
 import { buildScene, previewScene, type SceneBuild, type SceneDeps } from './scene-tools.ts';
 import type { StepContext, StepExecutor, StepOutcome } from './types.ts';
@@ -23,7 +25,7 @@
 export { ARTIFACT_VALIDATOR } from './validator.ts';
 /** Bump when a contract changes: old outputs stop matching and are not reused. */
 const SCHEMA_VERSION = { research: 'ProductResearch@1', storyboard: 'Storyboard@1', scene: 'SceneSpec@1' } as const;
-export type PipelineRole = 'researcher' | 'storyboarder' | 'builder';
+export type PipelineRole = 'researcher' | 'storyboarder' | 'builder' | 'reviewer_visual';

 export interface StepDeps {
   pool: pg.Pool;
@@ -33,6 +35,8 @@
   fakeScript?: (role: PipelineRole, ctx: StepContext, attempt: number, extra?: { styleId: ChannelStyleId }) => FakeScript | undefined;
   /** M4b: render driver, locks and pre-checks for the build step (absent: build fails with a reason). */
   scene?: SceneDeps;
+  /** M4c: where the draft_review step registers the draft for extract_frames (plan C22; absent: the reviewer has the contact sheet only). */
+  reviews?: ReviewTargets;
 }

 const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
@@ -337,6 +341,107 @@
   };
 }

+/** Twelve contact-sheet times spread over the draft (centres of twelfths), in seconds. */
+export const sheetTimes = (durationS: number): number[] => Array.from({ length: 12 }, (_, i) => Math.round((((i + 0.5) * durationS) / 12) * 1000) / 1000);
+
+export function reviewPrompt(o: { name: string; storyboard: Storyboard; scene: SceneSpec; warnings: string[]; durationS: number; frames: number; times: number[]; sheet: string }): string {
+  const bounds = [...new Set(o.storyboard.beats.flatMap((b) => [b.t_start, b.t_end]))];
+  return [
+    `Ürün: "${o.name}". Görev: "içinde ne var" videosunun taslağını görsel olarak incele ve sonucu Review şemasında döndür. Builder'ın gerekçesini görmüyorsun; yalnızca karelere ve aşağıdaki verilere bak.`,
+    `Taslak: 540×960 (%50 ölçek; boyut eşiklerini orana göre yargıla), 30 fps, ${o.frames} kare, ${formatClock(o.durationS)}.`,
+    '',
+    fenced('Storyboard', { hook: o.storyboard.hook, beats: o.storyboard.beats.map((b) => ({ id: b.id, t_start: b.t_start, t_end: b.t_end, parts: b.parts, action: b.action, onscreen_text: b.onscreen_text.tr })) }),
+    '',
+    fenced('Sahne', { hero_part: o.scene.hero_part, parts: o.scene.parts.map((p) => ({ id: p.id, name_tr: p.name_tr })), build_warnings: o.warnings }),
+    '',
+    `Kontakt sayfası: ${o.sheet} (12 kare; soldan sağa, yukarıdan aşağı; zamanlar sn: ${o.times.join(', ')}). Read ile aç. Kırmızı bölgeler TikTok arayüzünün kapattığı alan.`,
+    `Vuruş sınırları (sn): ${bounds.join(', ')}. Gerekirse extract_frames ile en çok 12 tek kare al (kırpma 2× büyütür).`,
+    '',
+    'Kontroller (her biri tam bir kez, bu kimliklerle; önemi kimlik belirler, sen belirlemezsin):',
+    ...DRAFT_CHECK_IDS.map((id) => `- ${id} (${DRAFT_CHECKS[id].severity}): ${DRAFT_CHECKS[id].ask_tr}`),
+    '',
+    `Kurallar: pass:false ise evidence.frame (0–${o.frames - 1}), evidence.timecode (sn; kare/30 ile ±0,5 içinde) ve fix_hint (builder için somut, Türkçe) zorunlu. score 0–1. dimension_scores: D2 0–15, D3 0–12, D5 0–10, D9 0–8. gate_results: G3 (üçüncü taraf logo/filigran yok), G5 (CG gerçek çekim gibi sunulmuyor; taklit edilebilir tehlikeli eylem yok). rubric_version "${DRAFT_RUBRIC_VERSION}", reviewer_role "reviewer_visual", summary_tr kısa Türkçe özet.`,
+  ].join('\n');
+}
+
+/** Inherited D6: the decision is draftDecision's; this only words it and applies the round limit (inherited D5). */
+export function decideDraft(review: Review, round: number): StepOutcome {
+  const d = draftDecision(review);
+  const label = (id: DraftCheckId) => DRAFT_CHECKS[id].label_tr;
+  const minor = d.minor.length ? ` · küçük bulgu: ${d.minor.map(label).join(', ')}` : '';
+  if (d.verdict === 'pass') return { status: 'done', note: `geçti${minor}` };
+  const open = [...d.blocking.map(label), ...d.gates].join(', ');
+  if (round >= DRAFT_MAX_RETURNS) return { status: 'needs_human', reason: `${DRAFT_MAX_RETURNS} taslak turundan sonra açık bulgu: ${open}.` };
+  return { status: 'rewind', to: 'build', reason: `düzeltilecek: ${open}` };
+}
+
+/** One reviewer_visual pass over the draft: 12-frame contact sheet, ≤ 12 single frames (extract_frames), the stored Review. */
+async function reviewDraft(deps: StepDeps, ctx: StepContext, hash: string, d: { video: string; meta: DraftMeta; draftId: string }): Promise<{ review: Review } | { outcome: StepOutcome }> {
+  const scene = deps.scene!;
+  const dir = join(ctx.runDir, 'review', `r${ctx.round}`);
+  const sheetDir = join(dir, 'sheet');
+  await mkdir(sheetDir, { recursive: true });
+  const probe = await probeVideo(scene.ffmpeg, d.video, ctx.signal);
+  const times = sheetTimes(probe.durationS);
+  for (const [i, at] of times.entries()) await extractFrame(scene.ffmpeg, d.video, join(sheetDir, `f${String(i).padStart(5, '0')}.png`), { t: at, signal: ctx.signal });
+  const sheet = join(dir, 'sheet.png');
+  await contactSheet(scene.ffmpeg, sheetDir, sheet, { cols: 4, rows: 3, signal: ctx.signal });
+  await record(deps, ctx, { kind: 'review_sheet', file: sheet, inputHash: hash, meta: { round: ctx.round, times } });
+  const [sb, sc, rep] = await Promise.all(['storyboard', 'scene', 'build_report'].map((k) => latestArtifact(deps.pool, ctx.runId, k)));
+  const storyboard = sb ? validateArtifact('Storyboard', sb.content) : null;
+  const sceneSpec = sc ? validateArtifact('SceneSpec', sc.content) : null;
+  if (!storyboard?.ok || !sceneSpec?.ok) return { outcome: { status: 'failed', error: "storyboard ya da sahne spec'i yok", retry: false } };
+  deps.reviews?.set(ctx.stepId, { video: d.video, frames: d.meta.frames, fps: 30, durationS: probe.durationS, outDir: join(dir, 'frames') });
+  try {
+    // Grilling missing decision 2: a restarted review continues its own reviewer session.
+    const prior = ctx.attempt > 1 ? await latestStepSession(deps.pool, ctx.stepId) : null;
+    const r = await runStructured<Review>({
+      manager: deps.manager, ctx, role: 'reviewer_visual', schema: 'Review',
+      prompt: reviewPrompt({ name: ctx.productName, storyboard: storyboard.value, scene: sceneSpec.value, warnings: (rep?.content as BuildReport | null)?.warnings ?? [], durationS: probe.durationS, frames: d.meta.frames, times, sheet: `review/r${ctx.round}/sheet.png` }),
+      initialResume: prior?.role === 'reviewer_visual' ? { claudeSessionId: prior.claudeSessionId, parent: prior.id, prompt: RESUME_PROMPT } : undefined,
+      check: (v) => reviewRefErrors(v, { frames: d.meta.frames, fps: 30 }),
+      fakeScript: deps.fakeScript ? (n) => deps.fakeScript!('reviewer_visual', ctx, n) : undefined,
+    });
+    if (!r.ok) return { outcome: failure(r) };
+    const file = join(dir, 'review.json');
+    await writeFile(file, JSON.stringify(r.value, null, 2));
+    await record(deps, ctx, { kind: 'draft_review', file, content: r.value, inputHash: hash, meta: { round: ctx.round, verdict: draftDecision(r.value).verdict, draftArtifactId: d.draftId } });
+    return { review: r.value };
+  } finally {
+    deps.reviews?.delete(ctx.stepId);
+  }
+}
+
+/** Spec §7.1 step 6: reviewer_visual reviews the draft; pass → done, revise → back to build (≤ 2 returns), then needs_human. */
+export function draftReviewExecutor(deps: StepDeps): StepExecutor {
+  return {
+    key: 'draft_review',
+    resource: 'claude',
+    async inputHash(ctx) {
+      const d = await latestArtifact(deps.pool, ctx.runId, 'draft_video');
+      return sha({ step: 'draft_review', draft: d?.id ?? null, draftHash: d?.inputHash ?? null, rubric: DRAFT_RUBRIC_VERSION, round: ctx.round });
+    },
+    // No `reuse`: a stored review is replayed in run(), so a "revise" is never turned into "done" (grilling C7).
+    async run(ctx, hash) {
+      if (!deps.scene) return { status: 'failed', error: 'render yapılandırılmadı', retry: false };
+      const draft = await latestArtifact(deps.pool, ctx.runId, 'draft_video');
+      const meta = draft?.meta as DraftMeta | null | undefined;
+      const blob = draft?.blobSha ? await getBlob(deps.pool, draft.blobSha) : null;
+      if (!draft || !meta || !blob) return { status: 'failed', error: 'incelenecek taslak yok', retry: false };
+      // Spec §8.3: a draft whose hash does not match the current GLB, scene spec, style and template is never reviewed.
+      if ((await draftSource(deps, ctx.runId))?.hash !== draft.inputHash) return { status: 'failed', error: 'taslak güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false };
+      const stored = await findArtifact(deps.pool, { runId: ctx.runId, kind: 'draft_review', inputHash: hash });
+      const replay = stored ? validateArtifact('Review', stored.content) : null;
+      if (replay?.ok) return decideDraft(replay.value, ctx.round);
+      const r = await reviewDraft(deps, ctx, hash, { video: join(deps.dataDir, blob.path), meta, draftId: draft.id });
+      return 'outcome' in r ? r.outcome : decideDraft(r.review, ctx.round);
+    },
+  };
+}
+
 export function pipelineExecutors(deps: StepDeps): Partial<Record<StepKey, StepExecutor>> {
-  return { research: researchExecutor(deps), storyboard: storyboardExecutor(deps), build: buildExecutor(deps), draft_render: draftRenderExecutor(deps) };
+  return {
+    research: researchExecutor(deps), storyboard: storyboardExecutor(deps), build: buildExecutor(deps),
+    draft_render: draftRenderExecutor(deps), draft_review: draftReviewExecutor(deps),
+  };
 }
--- a/apps/worker/src/pipeline/fake-scripts.ts
+++ b/apps/worker/src/pipeline/fake-scripts.ts
@@ -14,6 +14,7 @@
  * "imkansız …" exercises the difficulty gate; "bozuk sahne …" makes the first build fail once (the same-session fix loop);
  * "yavaş …" keeps the builder busy (silent, CPU alive) so a test can stop a running build.
  * In a draft fix round (ctx.round ≥ 1) the builder changes the first camera lens, except for "inatçı …" (the unchanged-fix rule).
+ * The draft reviewer passes, except: "kusurlu …" fails the first review only, "umutsuz …" and "inatçı …" fail every review.
  */
 export function fakePipelineScript(role: PipelineRole, ctx: StepContext, attempt: number, extra?: { styleId: ChannelStyleId }): FakeScript {
   // Lower-case the Turkish way first: /i does not fold 'İ' to 'i'.
@@ -31,6 +32,10 @@
       structured: { ...scene, ...fix, style_id: styleId, lighting_preset: CHANNEL_STYLES[styleId].lighting },
     };
   }
+  if (role === 'reviewer_visual') {
+    const fail = /umutsuz|[iı]nat[çc][ıi]/.test(name) || (/kusurlu/.test(name) && ctx.round === 0);
+    return { fixture: 'basic', structured: load(fail ? 'review-revise' : 'review-pass') };
+  }
   const board = load('storyboard-kalem') as { beats: { onscreen_text: { tr: string } }[] };
   if (ctx.audioMode !== 'vo') return { fixture: 'basic', structured: board };
   return { fixture: 'basic', structured: { ...board, audio_mode: 'vo', beats: board.beats.map((b) => ({ ...b, vo_text: { tr: b.onscreen_text.tr } })) } };
--- a/apps/worker/src/main.ts
+++ b/apps/worker/src/main.ts
@@ -62,7 +62,7 @@
 const orchestrator = new Orchestrator({
   pool, dataDir: config.dataDir, probe, locks, gate: guard,
   executors: pipelineExecutors({
-    pool, dataDir: config.dataDir, manager, fakeScript: driver.kind === 'fake' ? fakePipelineScript : undefined,
+    pool, dataDir: config.dataDir, manager, fakeScript: driver.kind === 'fake' ? fakePipelineScript : undefined, reviews,
     scene: { pool, render, locks, probe, ffmpeg: config.render.ffmpeg, capability: () => renderCapability },
   }),
 });
--- a/apps/worker/test/build-step.test.ts
+++ b/apps/worker/test/build-step.test.ts
@@ -147,7 +147,7 @@
 });

 describe('pipeline end to end with build (fake Claude and fake render)', () => {
-  it('produce → research → storyboard → build through the orchestrator; the video waits for the draft (K13)', async () => {
+  it('produce → research → storyboard → build → draft → review through the orchestrator; the video waits for the final (K13)', async () => {
     const { deps } = setup();
     const o = new Orchestrator({ pool: t.pool, dataDir: deps.dataDir, executors: pipelineExecutors(deps), tickMs: 20, timeTickMs: 50 });
     o.start();
@@ -156,9 +156,9 @@
     await o.startRun(r.runId);
     await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.status).toBe('done'), { timeout: 15_000 });
     const run = (await getRunView(t.pool, r.runId))!;
-    expect(run.steps.map((s) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render']);
+    expect(run.steps.map((s) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render', 'draft_review']);
     expect(run.steps[2]!.note).toBe('5 parça · 7.526 üçgen · 2 uyarı · kanal kimliği geçici');
-    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: 'Taslak render hazır. Taslak incelemesi bu sürümde henüz yok.' });
+    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: 'Taslak hazır ve incelendi. Final render bu sürümde henüz yok.' });
     expect(run.progress).toBe(99);
   });
 });
--- a/apps/api/test/videos.test.ts
+++ b/apps/api/test/videos.test.ts
@@ -41,7 +41,7 @@
     const v = (await app.inject({ url: `/api/videos/${videoId}`, headers: H })).json();
     expect(v.video).toMatchObject({ id: videoId, productName: 'Tükenmez kalem', status: 'queued', audioMode: 'silent' });
     expect(v.runs[0]).toMatchObject({ id: runId, status: 'queued' });
-    expect(v.runs[0].steps.map((s: { key: string }) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render']);
+    expect(v.runs[0].steps.map((s: { key: string }) => s.key)).toEqual(['research', 'storyboard', 'build', 'draft_render', 'draft_review']);
     expect((await app.inject({ url: '/api/videos', headers: H })).json()[0].id).toBe(videoId);
   });

--- a/tests/smoke/s2-produce.spec.ts
+++ b/tests/smoke/s2-produce.spec.ts
@@ -24,7 +24,7 @@
   } finally {
     clearInterval(sampler);
   }
-  await expect(header).toContainText('Taslak render hazır.');
+  await expect(header).toContainText('Taslak hazır ve incelendi.');
   await expect(page.getByTestId('storyboard-card').locator('li')).toHaveCount(7);
   await expect(bar2).toHaveAttribute('aria-valuenow', '99');
   expect(samples.length).toBeGreaterThan(5);
@@ -54,7 +54,7 @@
   const at = Number(await header.getByRole('progressbar', { name: 'Genel ilerleme' }).getAttribute('aria-valuenow'));
   await header.getByRole('button', { name: 'Üretimi durdur' }).click();
   await expect(header).toHaveAttribute('data-status', 'cancelled', { timeout: 15_000 });
-  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(4);
+  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(5);
   expect(Number(await header.getByRole('progressbar', { name: 'Genel ilerleme' }).getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(at);
   // The research agent itself is stopped (not left to finish and settle the step afterwards).
   const sessionId = ((await (await request.get(`/api/runs/${runId}`)).json()) as { steps: { sessionId: string | null }[] }).steps[0]!.sessionId;
@@ -63,5 +63,5 @@
     .toMatch(/^(cancelled|done|failed)$/);
   expect(((await (await request.get(`/api/sessions/${sessionId}`)).json()) as { status: string }).status).toBe('cancelled');
   await page.waitForTimeout(500);
-  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(4);
+  await expect(page.locator('[data-testid="step"][data-status="cancelled"]')).toHaveCount(5);
 });
--- a/tests/smoke/s2b-build.spec.ts
+++ b/tests/smoke/s2b-build.spec.ts
@@ -12,7 +12,7 @@
   const header = page.getByTestId('video-header');
   await expect(page.locator('[data-testid="step"][data-key="build"]')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
   await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 30_000 });
-  await expect(header).toContainText('Taslak render hazır. Taslak incelemesi bu sürümde henüz yok.');
+  await expect(header).toContainText('Taslak hazır ve incelendi. Final render bu sürümde henüz yok.');
   await expect(page.locator('[data-testid="step"][data-key="build"]')).toContainText('5 parça · 7.526 üçgen');
   const card = page.getByTestId('build-card');
   await expect(card).toContainText('5 parça · 7.526 üçgen · kahraman %80');
@@ -22,7 +22,7 @@
   const ranged = await request.get(src, { headers: { range: 'bytes=0-7' } });
   expect(ranged.status()).toBe(206);
   expect([...(await ranged.body())]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
-  expect((await sessionsOf(request, runId)).map((s) => s.role).sort()).toEqual(['builder', 'researcher', 'storyboarder']);
+  expect((await sessionsOf(request, runId)).map((s) => s.role).sort()).toEqual(['builder', 'researcher', 'reviewer_visual', 'storyboarder']);
   await expect(page.getByTestId('agent-card').filter({ hasText: 'Video üretim' }).first()).toBeVisible();
 });

```

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/worker/test/draft-review-step.test.ts apps/worker/test/build-step.test.ts && npm run typecheck && npm test`
Expected: `6 passed`; tam paket `Tests  305 passed (305)`.

Run: `npm run test:smoke`
Expected: `15 passed`, `7 skipped`. S2a/S2b videoları "Taslak hazır ve incelendi. Final render bu sürümde henüz yok." notuyla biter.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/pipeline/steps.ts apps/worker/src/pipeline/fake-scripts.ts apps/worker/src/main.ts packages/shared/src/pipeline.ts packages/shared/test/pipeline.test.ts apps/worker/test/build-step.test.ts apps/api/test/videos.test.ts apps/worker/test/draft-review-step.test.ts tests/smoke/s2-produce.spec.ts tests/smoke/s2b-build.spec.ts
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(pipeline): draft_review step — contact sheet, reviewer_visual, deterministic decision, at most two returns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Stüdyo player (Taslak / Taslak MP4), tur başlığı, inceleme kartı, kütüphane kapak + süre, kısayollar

`frontend-design:frontend-design` skill'ini yükle.
- Tasarım dili mevcut kartlarla aynı: `rounded-card`, `border-line/60`, `bg-paper`, `shadow-subtle`; çipler `rounded-full`; seçili sekme teal.
- Oynatıcı 320 px genişlikte, 9:16; altındaki kısayol ipucu kısık.
- Görünür her değişiklikten sonra ekranları al ve Read ile incele. Bir ekran kötü görünürse (taşma, okunmaz metin, hizasız sekme) düzelt, `Ruling:` yaz.

**Files:**
- Create: `apps/web/src/lib/player.ts`, `apps/web/src/components/production/DraftTabs.tsx`, `apps/web/src/components/production/DraftPlayer.tsx`
- Modify:
  - `packages/shared/src/pipeline.ts` (`VideoDraft`, `VideoView.draft`), `packages/db/src/pipeline.ts` (`VIDEO_SQL` LATERAL'ları, `toVideo`);
  - `apps/web/src/lib/production-view.ts` (`pickDraft`, `draftRoundLabel`);
  - `apps/web/src/components/production/{ArtifactCards,ProductionPanel,VideoHeader}.tsx`, `apps/web/src/routes/Library.tsx`, `apps/web/src/main.tsx` (kısayollar);
  - `apps/web/package.json` (`@remotion/player`, `remotion`, `@videogen/remotion`), `package-lock.json`;
  - `tests/smoke/screens.spec.ts` (M4c ekranları).
- Test: `apps/web/test/player.test.ts`, `packages/db/test/video-draft.test.ts`

**Interfaces:**
- Consumes: `Draft3D`, `draftProps` (T4); `draftRound`, `DRAFT_MAX_RETURNS`, `DRAFT_CHECKS`, `draftDecision`, `formatClock` (T1, T2, T6); artefakt türleri `draft_video`, `draft_cover`, `scene_glb`, `camera_track`, `scene`, `storyboard`, `draft_review`.
- Produces:
  - `VideoView.draft: VideoDraft | null` (`{videoSha, coverSha, durationS}`).
  - `pickDraft(list, runId): DraftPick`, `draftRoundLabel(run)`.
  - `shortcutFor(e): ShortcutAction | null`, `setActivePlayer` / `activePlayer` (`PlayerControl { toggle; pause; seekBy(s) }`).
  - `DraftTabs`, `DraftPlayer` (lazy, default export), `ReviewCard`.
  - Test kimlikleri (Global Constraints).

- [ ] **Step 1: Başarısız testleri yaz**

`apps/web/test/player.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ArtifactMeta, RunView, StepView } from '@videogen/shared/browser';
import { shortcutFor } from '../src/lib/player.ts';
import { draftRoundLabel, pickDraft } from '../src/lib/production-view.ts';

const key = (k: string, o: { tag?: string; ctrl?: boolean; editable?: boolean } = {}) =>
  shortcutFor({ key: k, ctrlKey: !!o.ctrl, metaKey: false, altKey: false, target: { tagName: o.tag ?? 'BODY', isContentEditable: !!o.editable } });

describe('player shortcuts and draft view helpers', () => {
  it('maps Space, J, K, L and N (either case) and stays out of the way while typing, with modifiers and on focused buttons', () => {
    expect([' ', 'j', 'K', 'l', 'N'].map((k) => key(k))).toEqual(['toggle', 'back', 'pause', 'forward', 'new']);
    expect(key('n', { tag: 'INPUT' })).toBeNull();
    expect(key('j', { tag: 'TEXTAREA' })).toBeNull();
    expect(key('k', { editable: true })).toBeNull();
    expect(key('l', { ctrl: true })).toBeNull();
    expect(key(' ', { tag: 'BUTTON' })).toBeNull();
    expect(key('j', { tag: 'BUTTON' })).toBe('back');
    expect(key('x')).toBeNull();
  });

  it('picks the run\'s latest draft artifacts and labels a draft fix round with its own progress', () => {
    const a = (kind: string, runId: string, i: number): ArtifactMeta => ({ id: `${kind}-${runId}-${i}`, runId, stepId: null, versionId: null, kind, blobSha: `${kind}-sha-${i}`, createdAt: '' });
    const list = [a('draft_video', 'r2', 2), a('draft_video', 'r2', 1), a('draft_cover', 'r2', 1), a('scene_glb', 'r2', 1), a('camera_track', 'r2', 1), a('scene', 'r2', 1), a('storyboard', 'r2', 1), a('draft_review', 'r2', 1), a('draft_video', 'r1', 1)];
    expect(pickDraft(list, 'r2')).toEqual({
      videoSha: 'draft_video-sha-2', coverSha: 'draft_cover-sha-1', glbSha: 'scene_glb-sha-1', trackId: 'camera_track-r2-1', sceneId: 'scene-r2-1', storyboardId: 'storyboard-r2-1', reviewId: 'draft_review-r2-1',
    });
    expect(pickDraft([], 'r2').videoSha).toBeNull();
    const step = (key: StepView['key'], weight: number, status: StepView['status'], progress: number, round: number): StepView =>
      ({ id: key, runId: 'r', key, ordinal: 0, weight, status, progress, progressSource: null, attempt: 1, round, sessionId: null, error: null, note: null, startedAt: null, endedAt: null });
    const run = (steps: StepView[], status: RunView['status'] = 'running'): RunView => ({ id: 'r', videoId: 'v', kind: 'produce', status, progress: 60, etaS: 100, error: null, createdAt: '', startedAt: null, endedAt: null, steps });
    const loop = [step('build', 42.86, 'running', 50, 1), step('draft_render', 9.52, 'pending', 0, 1), step('draft_review', 11.9, 'pending', 0, 1)];
    expect(draftRoundLabel(run(loop))).toBe('Taslak turu 1/2 · %33');
    expect(draftRoundLabel(run(loop, 'done'))).toBe('');
    expect(draftRoundLabel(run(loop.map((s) => ({ ...s, round: 0 }))))).toBe('');
  });
});
```

`packages/db/test/video-draft.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, getVideoView, insertArtifact, insertBlob, listVideoViews } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('VideoView.draft (library cover and length)', () => {
  it('is null before a draft and then carries the newest draft video and cover of the video', async () => {
    const r = await createProduceRun(t.pool, { productName: 'Kalem kütüphane', audioMode: 'silent', plan: [{ key: 'research', weight: 100 }] });
    expect((await getVideoView(t.pool, r.videoId))!.draft).toBeNull();
    for (const [sha, kind] of [['a'.repeat(64), 'draft_video'], ['b'.repeat(64), 'draft_cover'], ['c'.repeat(64), 'draft_video']] as const) {
      await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: kind === 'draft_video' ? 'video/mp4' : 'image/png' });
      await insertArtifact(t.pool, { runId: r.runId, kind, blobSha: sha, ...(kind === 'draft_video' ? { durationMs: sha.startsWith('c') ? 45_033 : 2_000, width: 540, height: 960, codec: 'h264' } : {}) });
    }
    expect((await getVideoView(t.pool, r.videoId))!.draft).toEqual({ videoSha: 'c'.repeat(64), coverSha: 'b'.repeat(64), durationS: 45 });
    expect((await listVideoViews(t.pool)).find((v) => v.id === r.videoId)!.draft!.durationS).toBe(45);
  });
});
```

- [ ] **Step 2: Testlerin düştüğünü gör**

Run: `npx vitest run apps/web/test/player.test.ts packages/db/test/video-draft.test.ts`
Expected: FAIL — `../src/lib/player.ts` yok; `VideoView.draft` `undefined` ("expected undefined to be null").

- [ ] **Step 3: Uygula**

`apps/web/src/lib/player.ts`:

```ts
/** Spec §13.4 keyboard shortcuts: Space play/pause · J back 5 s · K pause · L forward 5 s · N new production. */
export interface PlayerControl { toggle(): void; pause(): void; seekBy(seconds: number): void }
export type ShortcutAction = 'toggle' | 'back' | 'pause' | 'forward' | 'new';

let active: PlayerControl | null = null;
/** The player on screen registers itself (one at a time: the visible draft tab). */
export function setActivePlayer(c: PlayerControl | null): void { active = c; }
export function activePlayer(): PlayerControl | null { return active; }

const KEYS: Record<string, ShortcutAction> = { ' ': 'toggle', j: 'back', k: 'pause', l: 'forward', n: 'new' };

/** Null while typing, with a modifier, or for Space on a focused button (Space presses the button). */
export function shortcutFor(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: { tagName?: string; isContentEditable?: boolean } | null }): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return null;
  if (e.key === ' ' && (tag === 'BUTTON' || tag === 'VIDEO')) return null;
  return KEYS[e.key.toLocaleLowerCase('tr')] ?? null;
}
```

`apps/web/src/components/production/DraftTabs.tsx`:

```tsx
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { blobUrl } from '../../lib/api.ts';
import { setActivePlayer } from '../../lib/player.ts';
import type { DraftPick } from '../../lib/production-view.ts';

const DraftPlayer = lazy(() => import('./DraftPlayer.tsx'));
type Tab = 'live' | 'mp4';
const TABS: [Tab, string][] = [['live', 'Taslak'], ['mp4', 'Taslak MP4']];

/** The rendered draft, streamed from the media endpoint with HTTP Range (spec §13.1 Final tab's mechanism, used for the draft in M4). */
function Mp4({ sha, cover }: { sha: string; cover: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setActivePlayer({
      toggle: () => { if (v.paused) void v.play(); else v.pause(); },
      pause: () => v.pause(),
      seekBy: (s) => { v.currentTime = Math.max(0, Math.min(Number.isFinite(v.duration) ? v.duration : 0, v.currentTime + s)); },
    });
    return () => setActivePlayer(null);
  }, [sha]);
  return (
    <video
      ref={ref}
      data-testid="draft-video"
      src={blobUrl(sha)}
      poster={cover ? blobUrl(cover) : undefined}
      controls
      playsInline
      preload="metadata"
      className="aspect-[9/16] w-full rounded-card bg-inset"
    />
  );
}

/** Player tabs (spec §13.1): "Taslak MP4" is selected first, so no WebGL or 1.4 MB chunk loads until "Taslak" is opened (grilling C26). */
export function DraftTabs({ pick }: { pick: DraftPick }) {
  const [tab, setTab] = useState<Tab>('mp4');
  if (!pick.videoSha) return null;
  return (
    <section aria-label="Taslak oynatıcı" data-testid="draft-tabs" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Oynatıcı" className="flex gap-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`draft-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="draft-panel"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1 text-[13px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${tab === id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
        </div>
        <span className="ml-auto text-[12px] text-ink-3">Boşluk oynat · J/L ±5 sn · K durdur</span>
      </div>
      <div role="tabpanel" id="draft-panel" aria-labelledby={`draft-tab-${tab}`} className="mx-auto w-full max-w-[320px]">
        {tab === 'mp4' ? (
          <Mp4 sha={pick.videoSha} cover={pick.coverSha} />
        ) : (
          <Suspense fallback={<p className="py-10 text-center text-[13px] text-ink-3">Oynatıcı yükleniyor…</p>}>
            <DraftPlayer pick={pick} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
```

`apps/web/src/components/production/DraftPlayer.tsx`:

```tsx
import { Player, type PlayerRef } from '@remotion/player';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHANNEL_STYLES, type SceneSpec, type Storyboard } from '@videogen/shared/browser';
import { Draft3D, draftProps } from '@videogen/remotion';
import { api, blobUrl } from '../../lib/api.ts';
import { setActivePlayer } from '../../lib/player.ts';
import type { DraftPick } from '../../lib/production-view.ts';

function useContent<T>(id: string | null) {
  return useQuery({ queryKey: ['artifact', id], enabled: !!id, staleTime: Number.POSITIVE_INFINITY, queryFn: async () => (await api.artifact(id!)).content as T });
}

/**
 * Spec §13.1 "Taslak": the Draft3D composition the renderer uses, live in @remotion/player from the run's GLB, camera track,
 * scene spec and storyboard. A lazy chunk (probe P7: 1.45 MB), mounted only while its tab is open (grilling C26).
 */
export default function DraftPlayer({ pick }: { pick: DraftPick }) {
  const scene = useContent<SceneSpec>(pick.sceneId);
  const board = useContent<Storyboard>(pick.storyboardId);
  const track = useContent<{ yfov: number[] }>(pick.trackId);
  const ref = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const props = useMemo(() => (scene.data && board.data && track.data && pick.glbSha
    ? draftProps({ glbUrl: blobUrl(pick.glbSha), yfov: track.data.yfov, width: 540, height: 960, scene: scene.data, storyboard: board.data, style: CHANNEL_STYLES[scene.data.style_id] })
    : null), [scene.data, board.data, track.data, pick.glbSha]);
  useEffect(() => {
    const p = ref.current;
    if (!p || !props) return;
    const on = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener('frameupdate', on);
    setActivePlayer({ toggle: () => p.toggle(), pause: () => p.pause(), seekBy: (s) => p.seekTo(Math.max(0, Math.min(props.frames, p.getCurrentFrame() + Math.round(s * 30)))) });
    return () => { p.removeEventListener('frameupdate', on); setActivePlayer(null); };
  }, [props]);
  if (!props) return <p className="py-10 text-center text-[13px] text-ink-3">Taslak yükleniyor…</p>;
  return (
    <div data-testid="draft-live" data-frame={frame}>
      <Player
        ref={ref}
        component={Draft3D}
        inputProps={props}
        durationInFrames={props.frames + 1}
        fps={30}
        compositionWidth={props.width}
        compositionHeight={props.height}
        controls
        clickToPlay
        style={{ width: '100%', aspectRatio: '9 / 16', borderRadius: 12, overflow: 'hidden' }}
      />
    </div>
  );
}
```

Diff (`git apply`):

```diff
--- a/packages/shared/src/pipeline.ts
+++ b/packages/shared/src/pipeline.ts
@@ -69,6 +69,8 @@
   steps: StepView[];
 }
 export interface VideoUsage { sessions: number; tokens: number; costUsd: number | null; fiveHourDelta: number | null }
+/** The latest draft of a video (library cover and length, spec §13.1). */
+export interface VideoDraft { videoSha: string; coverSha: string | null; durationS: number }
 export interface VideoView {
   id: string;
   productId: string;
@@ -82,6 +84,7 @@
   createdAt: string;
   updatedAt: string;
   usage: VideoUsage;
+  draft: VideoDraft | null;
 }
 export interface ArtifactMeta { id: string; runId: string; stepId: string | null; versionId: string | null; kind: string; blobSha: string | null; createdAt: string }

--- a/packages/db/src/pipeline.ts
+++ b/packages/db/src/pipeline.ts
@@ -142,9 +142,14 @@
       AND ((usage_start->>'fiveHourResetsAt' IS NULL AND usage_end->>'fiveHourResetsAt' IS NULL)
         OR abs(extract(epoch FROM (usage_end->>'fiveHourResetsAt')::timestamptz - (usage_start->>'fiveHourResetsAt')::timestamptz)) < 60)
     GROUP BY video_id)
-  SELECT v.*, p.name AS product_name, p.difficulty, lr.id AS latest_run_id, u.sessions, u.tokens, u.cost, w.d AS five_hour_delta
+  SELECT v.*, p.name AS product_name, p.difficulty, lr.id AS latest_run_id, u.sessions, u.tokens, u.cost, w.d AS five_hour_delta,
+    dv.blob_sha AS draft_sha, dv.duration_ms AS draft_ms, dc.blob_sha AS cover_sha
   FROM videos v JOIN products p ON p.id = v.product_id
   LEFT JOIN LATERAL (SELECT id FROM runs r WHERE r.video_id = v.id ORDER BY r.created_at DESC LIMIT 1) lr ON true
+  LEFT JOIN LATERAL (SELECT a.blob_sha, a.duration_ms FROM artifacts a JOIN runs r ON r.id = a.run_id
+    WHERE r.video_id = v.id AND a.kind = 'draft_video' ORDER BY a.created_at DESC LIMIT 1) dv ON true
+  LEFT JOIN LATERAL (SELECT a.blob_sha FROM artifacts a JOIN runs r ON r.id = a.run_id
+    WHERE r.video_id = v.id AND a.kind = 'draft_cover' ORDER BY a.created_at DESC LIMIT 1) dc ON true
   LEFT JOIN u ON u.video_id = v.id
   LEFT JOIN w ON w.video_id = v.id`;

@@ -153,6 +158,7 @@
     id: r.id, productId: r.product_id, productName: r.product_name, title: r.title, audioMode: r.audio_mode, status: r.status, statusNote: r.status_note,
     difficulty: r.difficulty, latestRunId: r.latest_run_id, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
     usage: { sessions: r.sessions ?? 0, tokens: Number(r.tokens ?? 0), costUsd: num(r.cost), fiveHourDelta: num(r.five_hour_delta) },
+    draft: r.draft_sha ? { videoSha: r.draft_sha, coverSha: r.cover_sha ?? null, durationS: Math.round(Number(r.draft_ms ?? 0) / 100) / 10 } : null,
   };
 }
 export async function getVideoView(db: Queryable, id: string): Promise<VideoView | null> {
--- a/apps/web/src/lib/production-view.ts
+++ b/apps/web/src/lib/production-view.ts
@@ -1,4 +1,4 @@
-import { CHANNEL_STYLES, type BuildReport, type ProgressSource, type RunView, type SceneSpec, type StepView, type VideoStatus, type VideoUsage, type VideoView } from '@videogen/shared/browser';
+import { CHANNEL_STYLES, DRAFT_MAX_RETURNS, draftRound, type ArtifactMeta, type BuildReport, type ProgressSource, type RunView, type SceneSpec, type StepView, type VideoStatus, type VideoUsage, type VideoView } from '@videogen/shared/browser';
 import { formatElapsed, formatTokens } from './trace-view.ts';

 const ACTIVE = new Set(['queued', 'running', 'waiting_gpu', 'waiting_limit', 'waiting_disk']);
@@ -58,3 +58,20 @@
   ].filter(Boolean).join(' · ');
   return { line, warnings: report.warnings.slice(0, 5) };
 }
+
+/** The latest artifacts of a run the draft player needs (ids for JSON content, shas for media). */
+export interface DraftPick { videoSha: string | null; coverSha: string | null; glbSha: string | null; trackId: string | null; sceneId: string | null; storyboardId: string | null; reviewId: string | null }
+export function pickDraft(list: ArtifactMeta[], runId: string | null): DraftPick {
+  const find = (kind: string) => list.find((a) => a.kind === kind && (!runId || a.runId === runId)) ?? null;
+  return {
+    videoSha: find('draft_video')?.blobSha ?? null, coverSha: find('draft_cover')?.blobSha ?? null, glbSha: find('scene_glb')?.blobSha ?? null,
+    trackId: find('camera_track')?.id ?? null, sceneId: find('scene')?.id ?? null, storyboardId: find('storyboard')?.id ?? null, reviewId: find('draft_review')?.id ?? null,
+  };
+}
+
+/** Header line while a draft fix round runs: "Taslak turu 1/2 · %37" (plan C11); empty otherwise. */
+export function draftRoundLabel(run: RunView | null | undefined): string {
+  if (!isRunActive(run)) return '';
+  const d = draftRound(run!.steps);
+  return d ? `Taslak turu ${d.round}/${DRAFT_MAX_RETURNS} · %${d.percent}` : '';
+}
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -5,10 +5,13 @@
   "scripts": { "dev": "vite", "build": "vite build" },
   "dependencies": {
     "@fontsource/inter": "5.3.0",
+    "@remotion/player": "4.0.533",
     "@tanstack/react-query": "5.104.1",
+    "@videogen/remotion": "*",
     "@videogen/shared": "*",
     "react": "19.3.0",
-    "react-dom": "19.3.0"
+    "react-dom": "19.3.0",
+    "remotion": "4.0.533"
   },
   "devDependencies": {
     "@tailwindcss/vite": "4.3.3",
--- a/apps/web/src/components/production/ArtifactCards.tsx
+++ b/apps/web/src/components/production/ArtifactCards.tsx
@@ -1,5 +1,5 @@
 import { useQuery } from '@tanstack/react-query';
-import { HOOK_PATTERN_LABELS, type BuildReport, type ProductResearch, type SceneSpec, type Storyboard } from '@videogen/shared/browser';
+import { DRAFT_CHECKS, draftDecision, formatClock, HOOK_PATTERN_LABELS, type BuildReport, type DraftSeverity, type ProductResearch, type Review, type SceneSpec, type Storyboard } from '@videogen/shared/browser';
 import { api, blobUrl } from '../../lib/api.ts';
 import { buildFacts } from '../../lib/production-view.ts';

@@ -78,5 +78,35 @@
         </ul>
       )}
     </section>
+  );
+}
+
+const SEVERITY: Record<DraftSeverity, string> = { blocker: 'engelleyici', major: 'önemli', minor: 'küçük' };
+
+/** Spec §13.1 review findings with their frame time (M4c: the draft review; reviews/findings tables arrive in M5). */
+export function ReviewCard({ artifactId }: { artifactId: string | null }) {
+  const { data: r } = useContent<Review>(artifactId);
+  if (!r) return null;
+  const pass = draftDecision(r).verdict === 'pass';
+  const failed = r.checks.filter((c) => !c.pass);
+  return (
+    <section data-testid="review-card" aria-label="Taslak incelemesi" className={card}>
+      <div className="flex items-baseline gap-2">
+        <h3 className="text-[14px] font-medium">Taslak incelemesi</h3>
+        <span className={`rounded-full px-2.5 py-0.5 text-[12px] ${pass ? 'bg-green/10 text-green' : 'bg-inset text-ink'}`}>{pass ? 'geçti' : 'düzeltmeye gönderildi'}</span>
+      </div>
+      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.summary_tr}</p>
+      {failed.length > 0 && (
+        <ul aria-label="Bulgular" className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
+          {failed.map((c) => (
+            <li key={c.id}>
+              <span className="font-medium">{DRAFT_CHECKS[c.id].label_tr}</span>
+              <span className="tabular-nums text-ink-3"> · {SEVERITY[DRAFT_CHECKS[c.id].severity]}{c.evidence ? ` · ${formatClock(c.evidence.timecode)}` : ''}</span>
+              {c.fix_hint && <span className="block text-ink-2">{c.fix_hint}</span>}
+            </li>
+          ))}
+        </ul>
+      )}
+    </section>
   );
 }
--- a/apps/web/src/components/production/ProductionPanel.tsx
+++ b/apps/web/src/components/production/ProductionPanel.tsx
@@ -1,8 +1,10 @@
 import { useQuery } from '@tanstack/react-query';
 import { useMemo } from 'react';
 import { api } from '../../lib/api.ts';
+import { pickDraft } from '../../lib/production-view.ts';
 import { latestRunOf, pipeline, seedRuns, seedVideos, useStore } from '../../lib/stores.ts';
-import { BuildCard, ResearchCard, StoryboardCard } from './ArtifactCards.tsx';
+import { BuildCard, ResearchCard, ReviewCard, StoryboardCard } from './ArtifactCards.tsx';
+import { DraftTabs } from './DraftTabs.tsx';
 import { StepList } from './StepList.tsx';
 import { VideoHeader } from './VideoHeader.tsx';

@@ -21,20 +23,25 @@
     const list = detail.data ?? [];
     const find = (kind: string) => list.find((a) => a.kind === kind && (!run || a.runId === run.id)) ?? null;
     const pick = (kind: string) => find(kind)?.id ?? null;
-    return { research: pick('research'), storyboard: pick('storyboard'), report: pick('build_report'), scene: pick('scene'), sheet: find('preview_sheet')?.blobSha ?? null };
+    return {
+      research: pick('research'), storyboard: pick('storyboard'), report: pick('build_report'), scene: pick('scene'), sheet: find('preview_sheet')?.blobSha ?? null,
+      draft: pickDraft(list, run?.id ?? null),
+    };
   }, [detail.data, run]);

   if (!videoId) {
-    return <p className="text-[13px] leading-relaxed text-ink-2">Üstteki alana bir ürün adı yazıp Üret'e basın. Araştırma, storyboard ve sahne kurulumu burada canlı ilerler.</p>;
+    return <p className="text-[13px] leading-relaxed text-ink-2">Üstteki alana bir ürün adı yazıp Üret'e basın. Araştırma, storyboard, sahne kurulumu ve taslak burada canlı ilerler.</p>;
   }
   if (!video) return null;
   return (
     <div className="flex flex-col gap-5">
       <VideoHeader video={video} run={run} />
+      <DraftTabs key={latest.draft.videoSha ?? 'none'} pick={latest.draft} />
       {run && <StepList run={run} />}
       <ResearchCard artifactId={latest.research} />
       <StoryboardCard artifactId={latest.storyboard} />
       <BuildCard reportId={latest.report} sceneId={latest.scene} sheetSha={latest.sheet} />
+      <ReviewCard artifactId={latest.draft.reviewId} />
     </div>
   );
 }
--- a/apps/web/src/components/production/VideoHeader.tsx
+++ b/apps/web/src/components/production/VideoHeader.tsx
@@ -1,7 +1,7 @@
 import { useState } from 'react';
 import { VIDEO_STATUS_LABEL, type RunView, type VideoView } from '@videogen/shared/browser';
 import { api } from '../../lib/api.ts';
-import { activeStep, formatEta, formatUsage, isRunActive, sourceLabel, videoTone } from '../../lib/production-view.ts';
+import { activeStep, draftRoundLabel, formatEta, formatUsage, isRunActive, sourceLabel, videoTone } from '../../lib/production-view.ts';

 const BADGE: Record<ReturnType<typeof videoTone>, string> = {
   active: 'bg-accent/10 text-accent',
@@ -16,6 +16,7 @@
   const active = isRunActive(run);
   const step = activeStep(run);
   const progress = run?.progress ?? 0;
+  const round = draftRoundLabel(run);
   const meta = [active ? formatEta(run!.etaS) : '', step && step.progressSource ? sourceLabel(step.progressSource) : '', formatUsage(video.usage)].filter(Boolean);
   const stop = async () => {
     if (!run || busy) return;
@@ -42,6 +43,7 @@
         </span>
         <span className="w-12 text-right text-[13px] font-medium tabular-nums">%{Math.round(progress)}</span>
       </div>
+      {round && <p data-testid="draft-round" className="text-[12.5px] tabular-nums text-accent">{round}</p>}
       {meta.length > 0 && <p className="text-[12px] tabular-nums text-ink-3">{meta.join(' · ')}</p>}
     </header>
   );
--- a/apps/web/src/routes/Library.tsx
+++ b/apps/web/src/routes/Library.tsx
@@ -1,7 +1,7 @@
 import { useQuery } from '@tanstack/react-query';
 import { useMemo } from 'react';
-import { VIDEO_STATUS_LABEL } from '@videogen/shared/browser';
-import { api } from '../lib/api.ts';
+import { formatClock, VIDEO_STATUS_LABEL } from '@videogen/shared/browser';
+import { api, blobUrl } from '../lib/api.ts';
 import { formatDay, formatUsage, videoTone } from '../lib/production-view.ts';
 import { pipeline, seedVideos, useStore, videoList } from '../lib/stores.ts';

@@ -33,12 +33,15 @@
               className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-100 first:rounded-t-card last:rounded-b-card hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
             >
               <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[videoTone(v.status)]}`} />
+              <span aria-hidden className="h-12 w-[27px] shrink-0 overflow-hidden rounded-[4px] bg-inset">
+                {v.draft?.coverSha && <img data-testid="library-cover" src={blobUrl(v.draft.coverSha)} alt="" loading="lazy" className="size-full object-cover" />}
+              </span>
               <span className="min-w-0 flex-1">
                 <span className="block truncate text-[14px] font-medium">{v.productName}</span>
                 <span className="block truncate text-[12px] text-ink-2">{VIDEO_STATUS_LABEL[v.status]}{v.statusNote ? ` · ${v.statusNote}` : ''}</span>
               </span>
               <span className="shrink-0 text-right text-[12px] tabular-nums text-ink-3">
-                <span className="block">{formatDay(v.createdAt)}</span>
+                <span className="block">{formatDay(v.createdAt)}{v.draft ? <span data-testid="library-duration"> · {formatClock(v.draft.durationS)}</span> : null}</span>
                 <span className="block">{formatUsage(v.usage)}</span>
               </span>
             </button>
--- a/apps/web/src/main.tsx
+++ b/apps/web/src/main.tsx
@@ -1,9 +1,10 @@
 import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
-import { StrictMode, useEffect } from 'react';
+import { StrictMode, useEffect, useRef } from 'react';
 import { createRoot } from 'react-dom/client';
 import type { AgentSample, AgentSessionView, ChatMessage, ClaudeAuth, GpuWait, GuardState, LiveTraceItem, RunView, TraceRow, UsageSnapshot, VideoView } from '@videogen/shared/browser';
 import { AppShell } from './components/AppShell.tsx';
 import { connectLive, onLiveEvent, onUiEvent } from './lib/live.ts';
+import { activePlayer, shortcutFor } from './lib/player.ts';
 import { applyDelta, applyGpuWait, applyMessage, applyRow, applyRun, applySample, applySession, applyVideo } from './lib/stores.ts';
 import { useRoute } from './lib/router.ts';
 import { Library } from './routes/Library.tsx';
@@ -42,6 +43,29 @@
     });
     return () => { offUi(); offLive(); stop(); };
   }, []);
+  // Spec §13.4: Space / J / K / L drive the visible draft player; N opens a new production (the product box in the Studio).
+  const goRef = useRef(go);
+  goRef.current = go;
+  useEffect(() => {
+    const on = (e: KeyboardEvent) => {
+      const a = shortcutFor({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: e.target as HTMLElement | null });
+      if (!a) return;
+      if (a === 'new') {
+        e.preventDefault();
+        if (location.pathname !== '/') goRef.current('/');
+        requestAnimationFrame(() => document.getElementById('product-name')?.focus());
+        return;
+      }
+      const p = activePlayer();
+      if (!p) return;
+      e.preventDefault();
+      if (a === 'toggle') p.toggle();
+      else if (a === 'pause') p.pause();
+      else p.seekBy(a === 'back' ? -5 : 5);
+    };
+    addEventListener('keydown', on);
+    return () => removeEventListener('keydown', on);
+  }, []);
   const page = path === '/settings' ? <Settings /> : path === '/library' ? <Library go={go} /> : <Studio />;
   return <AppShell path={path} go={go}>{page}</AppShell>;
 }
--- a/tests/smoke/screens.spec.ts
+++ b/tests/smoke/screens.spec.ts
@@ -1,6 +1,6 @@
 import { resolve } from 'node:path';
 import { expect, test } from '@playwright/test';
-import { startDevSession, STUCK_SCRIPT } from './helpers.ts';
+import { produceVia, startDevSession, STUCK_SCRIPT } from './helpers.ts';

 test.skip(!process.env.VG_SCREENSHOTS, 'yalnızca elle: VG_SCREENSHOTS=1 npm run test:smoke -- screens');
 test.use({ viewport: { width: 1440, height: 900 } });
@@ -99,3 +99,26 @@
   await page.waitForTimeout(400);
   await page.screenshot({ path: shot('settings-k19.png', 'm4'), fullPage: true });
 });
+
+test('M4c screen: studio draft round, review card and the two player tabs', async ({ page, request }) => {
+  test.setTimeout(120_000);
+  const { videoId } = await produceVia(request, 'Kusurlu kalem', 'silent');
+  await page.goto(`/?video=${videoId}`);
+  await expect(page.getByTestId('draft-round')).toContainText('Taslak turu 1/2', { timeout: 60_000 });
+  await page.screenshot({ path: shot('studio-draft-round.png', 'm4') });
+  await expect(page.getByTestId('video-header')).toHaveAttribute('data-status', 'needs_human', { timeout: 60_000 });
+  await expect(page.getByTestId('review-card')).toContainText('geçti');
+  await page.waitForTimeout(600);
+  await page.screenshot({ path: shot('studio-draft.png', 'm4') });
+  await page.getByRole('tab', { name: 'Taslak', exact: true }).click();
+  await expect(page.getByTestId('draft-live').locator('canvas')).toBeVisible({ timeout: 20_000 });
+  await page.waitForTimeout(800);
+  await page.screenshot({ path: shot('studio-draft-live.png', 'm4') });
+});
+
+test('M4c screen: library with draft covers and lengths', async ({ page }) => {
+  await page.goto('/library');
+  await expect(page.getByTestId('library-cover').first()).toBeVisible({ timeout: 30_000 });
+  await page.waitForTimeout(400);
+  await page.screenshot({ path: shot('library-draft.png', 'm4') });
+});
```

Run: `npm install && npm run build`
Expected:
- Vite derlemesi geçer.
- `apps/web/dist/assets/` altında `DraftPlayer-*.js` ayrı parça (≈ 1,4 MB); ana parça ondan küçük kalır (P7).
- `ls -la apps/web/dist/assets | sort -k5 -n | tail -3` ile boyutları rapora yaz.

- [ ] **Step 4: Testlerin geçtiğini gör**

Run: `npx vitest run apps/web/test/player.test.ts packages/db/test/video-draft.test.ts && npm run typecheck && npm test`
Expected: `3 passed`; tam paket `Tests  308 passed (308)`.

Run: `npm run test:smoke`
Expected: `15 passed`, `9 skipped` (iki yeni M4c ekran testi elle).

Run: `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens -g M4c`
Expected:
- `2 passed`; `docs/m4/studio-draft-round.png`, `studio-draft.png`, `studio-draft-live.png`, `library-draft.png`.
- Dördünü Read ile incele:
  - tur satırı teal;
  - sekmeler hizalı;
  - inceleme kartında bulgu ve süre;
  - canlı sekmede kalemin 3D görüntüsü ve etiketler;
  - kütüphanede kapak ve "· 0:02".

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/shared/src/pipeline.ts packages/db/src/pipeline.ts packages/db/test/video-draft.test.ts tests/smoke/screens.spec.ts docs/m4/studio-draft-round.png docs/m4/studio-draft.png docs/m4/studio-draft-live.png docs/m4/library-draft.png package-lock.json
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "feat(web): draft player tabs (Remotion Player, MP4 with Range), draft round line, review card, library covers, shortcuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Smoke S2 — taslak, inceleme, kütüphaneden oynatma, düzeltme turu

**Files:**
- Create: `tests/smoke/s2c-draft.spec.ts`

**Interfaces:**
- Consumes: T9'un test kimlikleri, `produceVia`, `/api/sessions`, `/api/runs/:id`, `/api/blobs/:sha` (Range).
- Produces: Spec §16.2 S2'nin M4 biçimi (spec §17: "S2 (taslak final yerine)").

- [ ] **Step 1: Senaryoları yaz**

`tests/smoke/s2c-draft.spec.ts`:

```ts
import { expect, test, type APIRequestContext } from '@playwright/test';
import { produceVia } from './helpers.ts';

type Session = { id: string; role: string; runId: string | null; parentSessionId: string | null; status: string };
const sessionsOf = async (request: APIRequestContext, runId: string) =>
  ((await (await request.get('/api/sessions?scope=recent&kind=pipeline')).json()) as Session[]).filter((s) => s.runId === runId);

test('S2: product → draft → review; the draft MP4 streams with Range and plays; the library shows cover and length and opens it in the player', async ({ page, request }) => {
  test.setTimeout(150_000);
  const { videoId, runId } = await produceVia(request, 'Tükenmez kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 90_000 });
  await expect(header).toContainText('Taslak hazır ve incelendi. Final render bu sürümde henüz yok.');
  await expect(page.locator('[data-testid="step"][data-key="draft_render"]')).toContainText('540×960 · 0:02');
  await expect(page.locator('[data-testid="step"][data-key="draft_review"]')).toContainText('geçti · küçük bulgu: Yazılar okunur');
  await expect(page.getByTestId('review-card')).toContainText('Yazılar okunur');
  const src = (await page.getByTestId('draft-video').getAttribute('src'))!;
  const ranged = await request.get(src, { headers: { range: 'bytes=0-11' } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()['content-type']).toBe('video/mp4');
  expect(Buffer.from(await ranged.body()).subarray(4, 8).toString()).toBe('ftyp');
  expect((await sessionsOf(request, runId)).map((s) => s.role).sort()).toEqual(['builder', 'researcher', 'reviewer_visual', 'storyboarder']);

  // Spec §16.2 S2 (M4: the draft instead of the final): from the library to a playing video.
  await page.getByRole('link', { name: 'Kütüphane' }).click();
  const item = page.getByTestId('library-item').filter({ hasText: 'Tükenmez kalem' }).first();
  await expect(item.getByTestId('library-duration')).toHaveText(' · 0:02');
  await expect.poll(() => item.getByTestId('library-cover').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(270);
  await item.click();
  const video = page.getByTestId('draft-video');
  await expect(video).toBeVisible();
  await page.locator('body').focus();
  await page.keyboard.press('Space'); // spec §13.4
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime), { timeout: 10_000 }).toBeGreaterThan(0.3);
  await page.keyboard.press('k');
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(true);

  // The live tab: the same composition in @remotion/player (lazy chunk, WebGL canvas); Space plays it too.
  await page.getByRole('tab', { name: 'Taslak', exact: true }).click();
  const live = page.getByTestId('draft-live');
  await expect(live.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await page.locator('body').focus();
  await page.keyboard.press('Space');
  await expect.poll(async () => Number(await live.getAttribute('data-frame')), { timeout: 10_000 }).toBeGreaterThan(5);
});

test('S2: a flawed draft goes back to build once ("Taslak turu 1/2"), the same builder session fixes it, the second review passes, progress never goes back', async ({ page, request }) => {
  test.setTimeout(150_000);
  const { videoId, runId } = await produceVia(request, 'Kusurlu kalem', 'silent');
  await page.goto(`/?video=${videoId}`);
  const header = page.getByTestId('video-header');
  const bar = header.getByRole('progressbar', { name: 'Genel ilerleme' });
  const samples: number[] = [];
  const sampler = setInterval(() => { void bar.getAttribute('aria-valuenow', { timeout: 100 }).then((v) => { if (v !== null) samples.push(Number(v)); }, () => {}); }, 150);
  try {
    await expect(page.getByTestId('draft-round')).toContainText('Taslak turu 1/2', { timeout: 90_000 });
    await expect(header).toHaveAttribute('data-status', 'needs_human', { timeout: 90_000 });
  } finally {
    clearInterval(sampler);
  }
  for (let i = 1; i < samples.length; i++) expect(samples[i], `progress went back at sample ${i}`).toBeGreaterThanOrEqual(samples[i - 1]!);
  await expect(page.getByTestId('draft-round')).toHaveCount(0);
  await expect(page.getByTestId('review-card')).toContainText('geçti');
  const s = await sessionsOf(request, runId);
  expect(s.filter((x) => x.role === 'reviewer_visual')).toHaveLength(2);
  const builders = s.filter((x) => x.role === 'builder');
  expect(builders).toHaveLength(2);
  expect(builders.filter((b) => b.parentSessionId)).toHaveLength(1); // the fix round resumed the first builder session
  const run = (await (await request.get(`/api/runs/${runId}`)).json()) as { steps: { key: string; round: number; attempt: number }[] };
  expect(run.steps.map((x) => [x.key, x.round, x.attempt])).toEqual([['research', 0, 1], ['storyboard', 0, 1], ['build', 1, 1], ['draft_render', 1, 1], ['draft_review', 1, 1]]);
});
```

- [ ] **Step 2: RED kanıtı (geçici mutasyon, commit'lenmez)**

1. `apps/web/src/main.tsx`'te kısayol dinleyicisinin `addEventListener('keydown', on)` satırını geçici olarak yorum yap.
   - Run: `npx playwright test -c tests/smoke/playwright.config.ts s2c -g "library"`
   - Expected: FAIL (`currentTime` 0'da kalır).
   - Geri al.
2. `apps/worker/src/pipeline/orchestrator.ts`'te `rewind()` içindeki `rewindForReview` çağrısını geçici olarak `false` döndür.
   - Run: `… s2c -g "flawed"`
   - Expected: FAIL ("Taslak turu 1/2" hiç görünmez).
   - Geri al.

Mutasyonları ve düşen satırları ledger'a yaz.

- [ ] **Step 3: Tam smoke**

Run: `npm run test:smoke`
Expected:
- `17 passed`, `9 skipped`.
- Süre < 3 dk (spec §16.2). Aşarsa süreyi rapora yaz ve en uzun senaryoyu ledger'a `Ruling:` ile not et (senaryo kısaltılmaz; `VG_FAKE_SPEED` smoke yığınında 0,3).
- Sonrasında `/tmp/videogen-smoke` yok; 5173/5180/5190 boş.

Run: `npm run typecheck && npm test`
Expected: `Tests  308 passed (308)`.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke/s2c-draft.spec.ts
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "test(smoke): S2 with the draft — review, Range playback from the library, one fix round

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: M4 kapanışı — tam doğrulama, K12 ile ilk gerçek ürün, video başına kullanım, son review, rapor, dokümanlar, `main`'e birleştirme

**Files:**
- Create: `docs/m4/report.md`, `docs/m4/real-draft.png`, `docs/m4/real-studio-m4c.png` (gerçek koşudan)
- Modify:
  - `docs/m4/real-check.md` (M4c bölümü);
  - `docs/superpowers/checklist.md` (M4 bölümü, genel durum, karar tablosu);
  - `docs/superpowers/runbook.md` (§1, §2, §6, §7);
  - `docs/superpowers/plans/2026-10-06-videogen-roadmap.md` (M4 satırı);
  - `README.md` (komutlar ve durum);
  - `docs/superpowers/specs/2026-10-06-videogen-design.md` (yalnızca kanıtla: §6.2, §6.3, §7.1, §7.4, §7.5, §11.1, §12.1, §13.1, §13.4, §14, §16.2, §18).

**Interfaces:** Yok (doğrulama, gerçek koşu, review ve dokümantasyon).

- [ ] **Step 1: Tam doğrulama**

Run: `npm run typecheck && npm test && npm run test:blender && npm run test:render && npm run test:smoke`
Expected:
- `npm test` `308 passed`; `test:blender` `Ran 17 tests … OK`; `test:render` `6 passed`; `test:smoke` `17 passed`, `9 skipped`.
- Sonrasında `/tmp/videogen-smoke` ve `~/.vg-render-test-*` yok; 5173/5180/5190 boş; `render-cli` ya da `chrome-for-testing` süreci yok.

- [ ] **Step 2: İlk gerçek ürün (K12 rol modelleri, geçici veritabanı, gerçek Blender + Chrome)**

Önkoşullar (her biri geçmezse dur ve kullanıcıya söyle):
- `free -h | sed -n 2p` ≥ 2,5 GB; `df -h / | tail -1` ≥ 10 GB; `bwrap --version`; `ls /usr/bin/google-chrome`; 5180 kapalı.
- Kullanım: yığın açılınca ilk iş `GET /api/usage`. 5 sa ≥ %25 ya da 7 gün ≥ %70 ise koşu **başlatılmaz** (C30).

Roller: **override yok**, spec K12 varsayılanları:
- researcher sonnet/high;
- storyboarder opus/high;
- builder opus/high;
- reviewer_visual opus/high.

Ürün "tükenmez kalem", seslendirmesiz.

```bash
W=.superpowers/sdd/2026-10-06-m4c-draft-review-player
docker exec videogen-pg psql -U videogen -d videogen -c "CREATE DATABASE videogen_m4c_check"
mkdir -p /tmp/videogen-m4c-check
export VG_DATABASE_URL=postgres://videogen_app:videogen_app@127.0.0.1:5433/videogen_m4c_check
export VG_ADMIN_DATABASE_URL=postgres://videogen:videogen@127.0.0.1:5433/videogen_m4c_check
export VG_DATA_DIR=/tmp/videogen-m4c-check VG_NO_BROWSER=1
env -u CLAUDECODE node bin/videogen.mjs > $W/real.log 2>&1 &
LP=$!; echo $LP > $W/real.pid          # the launcher's own pid: SIGINT reaches it
for i in $(seq 1 120); do curl -sf -H 'Host: 127.0.0.1:5180' http://127.0.0.1:5180/api/health >/dev/null && break; sleep 1; done
H=(-H 'Host: 127.0.0.1:5180' -H 'Origin: http://127.0.0.1:5180' -H 'content-type: application/json')
curl -s "${H[@]}" http://127.0.0.1:5180/api/usage; echo        # fiveHour/sevenDay.utilization are fractions (0..1): stop here if 5 h ≥ 0.25 or 7 d ≥ 0.70
curl -s "${H[@]}" http://127.0.0.1:5180/api/roles | node -pe 'JSON.parse(require("fs").readFileSync(0)).filter(r=>["researcher","storyboarder","builder","reviewer_visual"].includes(r.role)).map(r=>r.role+":"+r.model+"/"+r.effort).join(" ")'
docker exec videogen-pg psql -U videogen -d videogen_m4c_check -At -c "SELECT data FROM audit_log WHERE action = 'render.capabilities'"   # {"ok": true, "driver": "real"}
OUT=$(curl -s "${H[@]}" -X POST -d '{"productName":"tükenmez kalem","audioMode":"silent"}' http://127.0.0.1:5180/api/videos); echo "$OUT"
RUN=$(echo "$OUT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).runId'); VID=$(echo "$OUT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).videoId')
for i in $(seq 1 1440); do
  S=$(curl -s "${H[@]}" http://127.0.0.1:5180/api/runs/$RUN | node -pe 'const r=JSON.parse(require("fs").readFileSync(0)); r.status+" "+r.progress+" "+r.steps.map(s=>s.key+":"+s.status+"@"+s.round).join(",")')
  echo "$S" | grep -qE '^(done|needs_human|failed|cancelled) ' && break
  if [ $((i % 60)) -eq 0 ]; then U=$(curl -s "${H[@]}" http://127.0.0.1:5180/api/usage); echo "$(date +%T) $S $U" >> $W/real-usage.log
    echo "$U" | node -e 'const u=JSON.parse(require("fs").readFileSync(0)); process.exit((u?.fiveHour?.utilization ?? 0) > 0.8 ? 1 : 0)' || { echo "5 sa > %80: durduruluyor"; curl -s "${H[@]}" -X POST http://127.0.0.1:5180/api/runs/$RUN/cancel; }; fi
  sleep 5
done; echo "$S"
curl -s "${H[@]}" http://127.0.0.1:5180/api/videos/$VID | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); JSON.stringify({video:{status:d.video.status,note:d.video.statusNote,usage:d.video.usage,draft:d.video.draft},steps:d.runs[0].steps.map(s=>({key:s.key,status:s.status,round:s.round,attempt:s.attempt,note:s.note,error:s.error})),artifacts:d.artifacts.map(a=>a.kind)},null,1)'
docker exec videogen-pg psql -U videogen -d videogen_m4c_check -At -c "SELECT role, model, effort, status, terminal_reason, num_turns, tokens, cost_usd, (parent_session_id IS NOT NULL) AS resumed, extract(epoch FROM ended_at - started_at)::int AS s FROM agent_sessions ORDER BY created_at"
docker exec videogen-pg psql -U videogen -d videogen_m4c_check -At -c "SELECT action, data->>'ms', data->>'code', data->>'concurrency', data->>'stopped' FROM audit_log WHERE action LIKE 'render.%' OR action = 'step.rewind' ORDER BY seq"
docker exec videogen-pg psql -U videogen -d videogen_m4c_check -At -c "SELECT content FROM artifacts WHERE kind = 'draft_review' ORDER BY created_at"
DRAFT=$(docker exec videogen-pg psql -U videogen -d videogen_m4c_check -At -c "SELECT blob_sha FROM artifacts WHERE kind = 'review_sheet' ORDER BY created_at DESC LIMIT 1")
curl -s "${H[@]}" -o docs/m4/real-draft.png http://127.0.0.1:5180/api/blobs/$DRAFT
npx playwright screenshot --channel chrome --viewport-size 1440,900 --wait-for-timeout 2500 "http://127.0.0.1:5180/?video=$VID" docs/m4/real-studio-m4c.png
kill -INT $LP; for i in $(seq 1 40); do kill -0 $LP 2>/dev/null || break; sleep 0.5; done
ss -ltnp | grep -E ':(5173|5180|5190) ' || echo "portlar boş"
ps -eo args | grep -E 'apps/(api|worker)/src/main.ts|linux-x64/claude|blender|bwrap|render-cli|chrome-for-testing' | grep -v grep || echo "süreç yok"
docker exec videogen-pg psql -U videogen -d videogen -c "DROP DATABASE videogen_m4c_check WITH (FORCE)"
rm -rf /tmp/videogen-m4c-check
unset VG_DATABASE_URL VG_ADMIN_DATABASE_URL VG_DATA_DIR VG_NO_BROWSER
```

Expected:
- **Roller:** `researcher:sonnet/high storyboarder:opus/high builder:opus/high reviewer_visual:opus/high`.
- **Run:** `done`; video `needs_human`, not "Taslak hazır ve incelendi. Final render bu sürümde henüz yok.". Ya da düzeltme turlarından sonra gerekçeli `needs_human` (bu da geçerli bir sonuçtur; rapora yazılır).
- **Artefaktlar:** M4b'ninkiler + `draft_video`, `draft_cover`, `review_sheet`, `draft_review` (tur başına).
- **Audit:** `render.draft` kod 0, concurrency 2 (ya da 3 → 1 yeniden deneme).

Kayıt (`docs/m4/real-check.md`'ye **M4c** bölümü; kullanıcı adı, ev yolu ve kimlik bilgisi olmadan):
- Rol başına tur, token, maliyet eşdeğeri ve süre.
- Taslak render süresi; inceleme turları ve kararları (bulgu kimlikleri, kanıt kareleri).
- **Video başına kullanım:** toplam token, oturum sayısı, `fiveHourDelta`, toplam süre (spec §18).

`docs/m4/real-draft.png` ve `docs/m4/real-studio-m4c.png`'yi Read ile incele:
- Kahraman 0. karede büyük mü?
- Mekanizma çekimi var mı?
- Etiketler doğru parçaya mı bitiyor?
- Metaller okunuyor mu (C29)?
- Reviewer'ın kararı senin gözünle tutarlı mı?

Gözlemleri M5 kalibrasyonuna girdi olarak yaz.

**Kapı:**
- Run `failed` olursa gerçek koşuyu **tekrarlama**. Hatayı, son build raporunu, review'ları ve `product.py`'yi rapora yaz. Yeniden deneme kullanıcı onayı ister.
- 5 sa %80'i geçerse koşu durdurulur (betik bunu yapar) ve kullanıcıya söylenir.

- [ ] **Step 3: Son review (tek bağımsız reviewer, en yetenekli model)**

`~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/review-package docs/superpowers/plans/2026-10-06-m4c-draft-review-player.md $(git merge-base main HEAD) HEAD` ile paketi üret.

`superpowers:requesting-code-review`'un `code-reviewer.md` şablonuyla **tek** bir `general-purpose` alt ajanı çalıştır. Modeli **açıkça** `fable` (Claude Fable 5.1) ver; Workflow aracı yok.
- **Girdiler:** paket, bu plan, spec, bu planın Review Focus bölümü (aynen), ledger'ın `Ruling:` satırları, `docs/m4/real-check.md` (M4c bölümü).
- **Özellikle istenecekler:**
  - geri dönüş/kurtarma/iptal yarışları (`rewindForReview`, `recover`, `settle`);
  - kilit ve çocuk süreç yaşam döngüsü (Chrome yetimleri, PID dosyaları, iptal);
  - geçici HTTP sunucusunun sızıntı yüzeyi;
  - reviewer istemindeki güvenilmeyen veri;
  - Player'ın boşta CPU'su.

Bulguları etkiye göre yeniden derecelendir:
- Critical/Important tek düzeltme turunda, her biri önce başarısız testle (RED→GREEN), ilgili görev commit'ine `git commit --fixup=<hash>`; ardından tam paket.
- Minor'lar `docs/m4/report.md` "Ertelenenler" bölümüne.

- [ ] **Step 4: Tam doğrulama ve autosquash**

Run: `npm run typecheck && npm test && npm run test:blender && npm run test:render && npm run test:smoke`
Expected: Step 1 ile aynı. Review testleri eklendiyse yeni sayılar rapora yazılır.

```bash
BEFORE=$(git rev-parse HEAD^{tree})
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash --autostash $(git merge-base main HEAD)
[ "$BEFORE" = "$(git rev-parse HEAD^{tree})" ] && echo "AĞAÇ AYNI"
```
Expected: `AĞAÇ AYNI`.
- Bir fixup çakışırsa `git rebase --abort`; düzeltmeyi dayandığı sözleşmenin ilk girdiği görev commit'ine taşı ve `Ruling:` yaz.
- Her commit mesajının son satırı `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

- [ ] **Step 5: Rapor ve dokümanlar**

**`docs/m4/report.md`** (Türkçe; M3 raporu biçiminde). M4'ün bütünü (M4a + M4b + M4c):
- başlık tablosu;
- §1 Ne çalışıyor (S2 taslakla);
- §2 Görevler (M4c commit'leri, test plan → gerçek);
- §3 Doğrulama (tüm komut çıktıları, S2 RED mutasyonları);
- §4 Gerçek ürün ve video başına kullanım;
- §5 Ekranlar;
- §6 Plandan sapmalar (ledger `Ruling:`);
- §7 Son review;
- §8 Ertelenenler;
- §9 M5 için notlar (reviewer kararlarının gerçek üründe isabeti, `no_intersection` önem seviyesi, Draft3D görünüşü, swap ve K19 durumu);
- §10 Bilinen sınırlar.

**Checklist:**
- M4 kutularını işaretle:
  - Remotion + Draft3D + taslak review'u;
  - Kütüphane ve player;
  - video başına kullanım;
  - Smoke S2 + ilk gerçek ürün.
  Her birine `· commit <hash> · <tarih> · M4c`.
- Genel durumda M4: "Tamamlandı" + rapor yolu.
- Karar tablosuna şunları ekle:
  - M4c gerçek doğrulama;
  - M4c son review;
  - `no_intersection` minor (C3);
  - varsayılan player sekmesi (C26);
  - `main`'e birleştirme.

**Runbook:**
- §1 haritaya M4c planı ve `docs/m4/report.md`.
- §2 M4 satırı.
- §6 günlük işletim:
  - taslak ve player kullanımı;
  - kısayollar;
  - Fake tetikleri "kusurlu / umutsuz / inatçı";
  - `VG_CHROME`;
  - bundle önbelleği (`<dataDir>/cache/remotion`, silinebilir).
- §7 sorun giderme:
  - "taslak render başarısız (kod …)": Chrome yolu ya da `VG_CHROME`;
  - "taslak render GPU/WebGL hatasıyla iki kez düştü";
  - "taslak MP4 doğrulamadan geçmedi";
  - "taslak güncel sahneyle uyuşmuyor (bayat artefakt)": geliştirme sırasında `packages/remotion/src` değiştiyse run'ı yeniden üret (C20);
  - "Düzeltme turu sahneyi değiştirmedi";
  - "2 taslak turundan sonra açık bulgu";
  - video "sırada" + "Kullanım sınırı yakın" notu (C25);
  - Taslak sekmesinde siyah canvas (WebGL; `chrome://gpu`).

**Spec (yalnızca kanıtla):**
- §6.2: reviewer_visual taslakta tek reviewer; kontakt sayfası + `extract_frames`.
- §6.3: `extract_frames` imzası (`times`, `crop`; versionId yok, adımın taslağı) ve bütçe.
- §7.1: adım 5–6 uygulandı; değişmeyen düzeltme ve bayat taslak kuralları.
- §7.4: `Review` M4c notları (C2–C4).
- §7.5: taslak 540×960, çocuk süreç, bundle önbelleği.
- §11.1: `steps.round` (0006), yeni artefakt türleri.
- §12.1: taslak turu satırı.
- §13.1: player sekmeleri ve varsayılan; kütüphane kapak/süre.
- §13.4: uygulanan kısayollar.
- §14: render çocuk süreci ve yetim toplama.
- §16.2: S2'nin M4 biçimi.
- §18: video başına kullanım satırına gerçek ölçüm; "Blender↔Three eşdeğerliği gerçek üründe" sonucu.

**Roadmap:** M4 satırı "Tamamlandı". **README:** komutlar ve durum.

```bash
git add docs README.md
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git commit -m "docs(m4): M4 report, first real product and per-video usage, checklist, runbook, roadmap and spec notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: `main`'e birleştirme**

```bash
git switch main && git pull --ff-only 2>/dev/null; git status --short
GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com" \
git merge --no-ff m4c-draft-review-player -m "merge: M4c draft, review and player (Remotion draft, draft review ≤ 2 returns, GPU and usage gates, player, smoke S2, first real product)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run typecheck && npm test
```
Expected: birleştirme çakışmasız (`main` M4c'den beri değişmedi); `Tests  308 passed` (+ review testleri). Rapordaki ve checklist'teki hash'leri birleştirme sonrası değerlerle düzelt; düzeltme ayrı bir `docs` commit'i olarak `main`'e gider.

- [ ] **Step 7: Kullanıcıya Türkçe rapor ve dur**

Biçim: **Maddeler / Doğrulama** (komut + çıktı alıntısı) **/ Bilmen gerekenler**.
- Her karar için "neden" ve "yanlışsa maliyeti".
- "Rulings I made" ve "Deferred minors" ayrı başlıklar.
- Video başına kullanım (token, 5 sa payı, süre) ve reviewer'ın gerçek üründeki isabeti.
- Açık kullanıcı kararları:
  - K19 (seçim yoksa GEÇİCİ `gece_mavisi`);
  - K17 (ses, M5);
  - swap eşiği (§6.4, değişmedi).
- M5 planını `superpowers:writing-plans` ile yazmayı öner.

---

## Self-review notları (plan yazarı)

- **Spec kapsamı (M4c dilimi):**

  | Spec bölümü | Görevler |
  |---|---|
  | §7.1 adım 5 (`draft_render`) | T5, T6 |
  | §7.1 adım 6 (`draft_review`, en fazla 2 tur) | T1, T2, T3, T8 |
  | §7.2 (yalnızca başarısız kontroller; düzeltme kapsamı build→draft) | T6, T8 |
  | §7.4 `Review` | T1 |
  | §7.5 (yuv420p/tv/bt709 reddi, Remotion ayarları, Studio gömülmez) | T5 |
  | §6.2 reviewer_visual | T8 |
  | §6.3 `extract_frames` | T7 |
  | §6.4 GPU ön kontrolü ve kullanım muhafızı | T3 |
  | §8.2 (VISION: kontakt sayfası, ≥ 540×960, kırpmalar, güvenli alan katmanı) | T8, T7 |
  | §8.3 (izole reviewer, kanıt zorunluluğu, bayat artefakt) | T1, T8 |
  | §11.1 (`steps.round`, medya sütunları) | T2, T6 |
  | §12.1 (monoton yüzde, düzeltme turu satırı) | T2, T3, T9 |
  | §13.1 (player sekmeleri, kütüphane kapak/süre) | T9 |
  | §13.4 (kısayollar, ilk yükleme bütçesi) | T9 |
  | §14 (çocuk süreç, yetim toplama, GPU hatasında concurrency 1) | T5 |
  | §16.1 Fake render | T5 |
  | §16.2 S2 | T10 |
  | §17 M4 çıkışı (S2, ilk gerçek ürün, video başına kullanım) | T10, T11 |
  | §18 | T11 |

  M4c'ye ait olmayanlar "Kapsam dışı" tablosunda.
- **Yer tutucu taraması:** "TBD/TODO/sonra doldur/benzer şekilde" yok. Her kod adımı tam dosya ya da `git apply` ile uygulanabilir `diff` içerir. Tek istisna T2'deki migration SQL'i ve snapshot'ı: drizzle-kit üretir, beklenen tek satır plandadır.
- **Diff'lerin uygulanabilirliği:** Bütün diff'ler HEAD `8379279`'un `git archive` kopyasına sırayla (T1→T9) `git apply` ile uygulandı ve hepsi temiz geçti. Sonuç dosyalar planın yeni dosyalarıyla birlikte yazarın kopyasıyla birebir aynı. Kod kullanıcı yönergesiyle **çalıştırılmadı**: typecheck, test sayıları ve süreler yürütücünün ilk koşusunda doğrulanır.
- **Tip ve ad tutarlılığı:** Görevler arası adlar tek kaynaktan:
  - `rewindForReview` (T2 → T3);
  - `StepContext.round` (T3 → T6, T8);
  - `DraftProps` / `draftProps` / `DRAFT_RENDER` / `bundleHash` (T4 → T5, T6, T9);
  - `RenderDriver.draft` / `DraftInput` (T5 → T6 testleri);
  - `draftSource(deps, runId)` ve `DraftMeta` (T6 → T8);
  - `ReviewTargets.set(stepId, {video, frames, fps, durationS, outDir})` (T7 → T8);
  - `pickDraft` / `DraftPick` (T9).

  Self-review'da bulunup düzeltilenler:
  - (a) `StepContext.round` zorunlu olunca iki mevcut testin literal'leri derlenmiyordu: T3'e eklendi.
  - (b) `apps/api/test/videos.test.ts` plan anahtarlarını sabit bekliyordu: T6/T8'e eklendi.
  - (c) T11'in 5 sa durdurma koşulu `fiveHour` nesnesini sayı sanıyordu: `fiveHour.utilization` (kesir) yapıldı.
- **Review Focus eşlemesi:**
  1. T2 `rewind.test.ts` (2 test), T3 "on restart a lease left…", T8 "a restart in the same round…".
  2. T8 "never reviews a stale draft", T6 "a fix round that changed neither…", T8 uçtan uca "inatçı".
  3. T3 "a GPU step waits…", T5 "startup recovery reaps…", T5 `test:render` "a cancelled draft render…".
  4. T3 "usage gate…".
  5. T1 iki test, T7 bütçe testleri, T8 "a review that breaks the contract…".

## Plan inceleme geçmişi

- **Plan öncesi grilling (bağımsız agent, Claude Fable 5.1, salt okunur):** 32 kararlık ağaç kod ve spec'e karşı sorgulandı. 14 CHANGE, 0 QUESTION. Alınanlar:
  - **C1:** Remotion görevi ikiye bölündü (T4/T5); UI tek görev (T9); builder düzeltme turu T6'ya.
  - **C2:** kanıt karesi ffprobe kare sayısına göre.
  - **C3:** `no_intersection` minor; "≤ 6 etiket" sorulmaz.
  - **C6:** rewind + `finishJob` tek koşullu transaction; `recover()` koşullu.
  - **C7:** review hash'inde `round`.
  - **C8:** `ctx.round ≥ 1`'de oturum sürdürme koşulu.
  - **C13:** çocuk sürece açık env; PID regex'ine `render-cli`.
  - **C14:** GLB yanıtında CORS.
  - **C15:** bundle `tmp` + `rename`.
  - **C17:** GPU hatası çıkış kodu 3.
  - **C19:** `reuse` yalnızca aynı tur. Bu olmadan değişmeyen düzeltme hiç yakalanmıyordu.
  - **C22:** kare bütçesi adım+tur başına.
  - **C24:** smoke'ta yalnızca "kusurlu".
  - **C26:** varsayılan sekme "Taslak MP4", canlı player yalnızca sekme açıkken.
  - **C29:** `linear` yok; 0. kare renk testi.
  - **Eksik kararlar:** reviewer'ın kendi oturumunu sürdürmesi, `draft_video` meta sözleşmesi, ilk kareye kadar adım notu.
  - **Alınmayan:** "media.ts MIME tablosunda `.mp4`/`.glb` yok" önerisi. İkisi de tabloda var (`apps/worker/src/media.ts:10-11`).
