# M7 — Sertleştirme (audit gezgini, sürüm karşılaştırma, varlık defteri, yedek ve çöp toplama, performans, gerçek smoke, güvenli alan) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Biçim notu (kullanıcı kararı, 2026-10-07):** Bu plan kod bloğu içermez. Her görev şunları verir: dosyalar, arayüz imzaları, gerçek kodda bakılacak yerler (`dosya:satır`, HEAD `75c25da`), testlerin adları ve beklentileri, karar notları. Kodu yürütücü yazar. Satır numaraları kaymışsa sembol adıyla aranır.

**Goal:** VideoGen'i günlük kullanıma dayanıklı hâle getirmek. Ayrıntılar:
- **Audit gezgini:** run, video, agent, olay türü ve tarihe göre süzme; satırdan ham olaya (transcript, araç girdisi, artefakt) inme; zincir doğrulama durumu.
- **Sürüm karşılaştırma:** kütüphane detay sayfası (Sürümler · Review'lar · Audit · Yayın), iki sürümü yan yana ya da A/B oynatma, inceleme panelinde tur seçici.
- **Varlık defteri arayüzü:** müzik/SFX listesi, lisans alanları, önizleme, arayüzden ekleme, izni geri alma.
- **Depolama işletimi:** günlük `pg_dump` (7 gün), referanssız blob'ların onaylı çöp toplaması, yetim dosya raporu, Ayarlar'da "Veri ve yedek".
- **Performans bütçeleri:** smoke S8 (4× CPU yavaşlatmasında p95 ≤ 16,8 ms, boşta CPU bütçesi) ve audit smoke'u S7.
- **`npm run test:smoke:real`:** spec §16.3'ün altı gerçek denetimi tek komutla (kullanıcının makinesinde koşar).
- **Güvenli alan kalibrasyonu:** dört yere gömülü değerler tek ayara toplanır; kalibrasyon kartı ve telefon ekran görüntüsüyle ölçüm akışı.
- **`npm test` 6 dakikanın altında, paylı:** hedef ≤ 240 sn (bugün 328–382 sn).
- **Ertelenen Minor'lardan gerekçeyle seçilenler** (`fix_hint` dahil).
- **Makine kontrol listesi:** M5 kapanışı (M5c T12), M6 T9 ve M7'nin gerçek koşuları tek, sıralı bir dosyada (`docs/machine-checklist.md`).

**Architecture:**
- **Okuma uçları API'de, işletim işleri worker'da.** Audit, sürüm ve varlık uçları API'de (salt okuma + kısa yazımlar). Yedek ve çöp toplama uzun sürebilir ve dosya sistemine yazar, bu yüzden worker'da bir `MaintenanceService` çalışır (zamanlayıcı + `vg_commands` ile elle tetik). Desen: `PublishService` (`apps/worker/src/publish/service.ts:96–97` 30 sn süpürme, `stop()` `:80–82`) ve `heartbeat.ts:13` saatlik budama.
- **Silme yalnızca onayla (spec §11.3).** Çöp toplama haftalık **rapor** üretir; silme Ayarlar'da kullanıcının onayıyla, rapor kimliğine bağlı olarak yapılır. Yetim dosyalar raporlanır, otomatik silinmez.
- **Güvenli alan tek kaynaktan.** `packages/shared/src/safe-area.ts` varsayılanı ve şemayı taşır; ayar `settings` `safe_area` anahtarında; render anında `layout.json` manifestine yazılır ve G6 denetimi manifestteki değeri kullanır (eski manifestler varsayılana düşer).
- **Gerçek smoke profili kod olarak repoda, koşusu makinede.** Adımlar enjekte edilebilir fonksiyonlardır; bulutta yalnızca koşucu mantığı ve çıktı ayrıştırıcıları test edilir.

**Tech Stack:** Mevcut (Node 24, TypeScript 7, zod 4.6.5, pg, drizzle-kit, Fastify 5.12.5, React 19.3, Tailwind 4.3.3, TanStack Query, vitest 5, Playwright 1.63, Remotion). **Yeni npm bağımlılığı yok** (yükleme için `application/octet-stream` gövde ayrıştırıcısı; sanal liste kütüphanesi yok). **Migration 0010** (audit indeksleri, varlık iptal alanları, bakım kayıtları).

**Spec:** `docs/superpowers/specs/2026-10-06-videogen-design.md`:
- §17 M7 satırı: "Audit gezgini, sürüm karşılaştırma, varlık defteri arayüzü, yedekler, performans bütçeleri, gerçek smoke profili" → çıkış "S7, S8, `test:smoke:real`".
- §11.2 (audit sütunları, zincir, `GET /api/audit/verify`, kapsam: silmeler ve ayar değişiklikleri dahil), §11.3 (medya deposu: silme yalnızca DB üzerinden, audit'li ve onaylı; haftalık çöp toplama; yetim dosya raporu; günlük `pg_dump -Fc`, 7 gün).
- §13.1 (Kütüphane video detayı sekmeleri; Audit gezgini; Varlıklar; Ayarlar "veri ve yedek durumu"; M5b notu: tur seçici, Karşılaştır, Review'lar M7'de).
- §12.4 (arayüz donmaz: 200 satır üstünde sanal kaydırma, sonsuz animasyon kısıtı), §15 (gizli bilgiler), §16.2 S7/S8, §16.3 (gerçek smoke profilinin altı maddesi), §18 güvenli alan satırı ("telefon ekran görüntüleriyle kalibrasyon").

**Önceki taşlardan devirler:** `docs/m5/m5c-summary.md` §9 (ertelenenler: `fix_hint`, G4 notu, vuruş kimliği, retime replay, ses CLI sınırları, `review` bayatlığı), M6 defteri `.superpowers/sdd/2026-10-08-m6-publish/progress.md` (T3: `npm test` 363–382 sn ile 6 dk sınırını aştı, kaldıraç `qc-step` e2e; T7: panel SSE yerine 1,5 sn yoklama, "olaylar M7 için yayımlanıyor"), M6 planı "Kapsam dışı" (izlenme verisi, LLM açıklama, kütüphane detay sekmeleri), `docs/m4/report.md:107` ve `m4a-summary.md` §ertelenenler, `checklist.md` M7 bölümü (7 madde).

## Kapsam ve bölme

| Plan | Durum | Çıkış |
|---|---|---|
| M5 (a+b+c) | Kod `main`'de; GPU'lu makinede kapanış bekliyor (`docs/m5/m5c-summary.md` §5) | Bir ürün "yayına hazır" |
| M6 | T1–T8 `main`'de; T9 (gerçek taslak) makinede bekliyor | S6; gerçek taslak |
| **M7 (bu plan, 13 görev)** | — | S7, S8, `test:smoke:real`; audit gezgini, sürüm karşılaştırma, varlık defteri, yedek + çöp toplama, güvenli alan ayarı; `npm test` ≤ 240 sn; makine kontrol listesi |

**Sıra kuralı:** T1–T12 bulutta, Fake sürücülerle ve GPU'suz uygulanır. T13 yalnızca makine kontrol listesini ve dokümanları **yazar**; gerçek koşular (M5 kapanışı, M6 T9, M7'nin gerçek denetimleri) kullanıcının makinesinde o dosyayla yapılır. Bu plan da M5 kapanışından önce yazıldı (runbook §2 sapması M6'daki gibi; gerçek kanıt gerektiren spec notları makine listesinin sonuna bırakılır).

**Görev sayısı:** 13 görev, 12'lik bölme eşiğini (checklist "M3 plan bölme") bir aşar. Bölünmedi: T13 kod içermez (dokümanlar), T10 ve T11 küçük, birbirinden bağımsız düzeltmelerin toplamıdır. Bölmek ikinci bir plan dosyası ve tekrar eden Global Constraints demekti.

## Gerçek arayüzler (`main`, HEAD `75c25da`)

Kod repodan okunmuştur.

**Audit**
- `appendAudit` `packages/db/src/audit.ts:53–66` (gizli anahtarda fırlatır `:54–55`; `seq`, `ts`, `hash` tetikleyiciden), `verifyAudit` `:68–72` → `{ok, checked, firstBadSeq}`, `redactSecretKeys` `:35–51`, `SECRET_KEY` `:19`.
- Zincir: `0002_audit_canonical.sql:7–18` (`pg_advisory_xact_lock(72720002)`, `seq = max+1`, `ts = clock_timestamp()`, `hash = sha256(prev_hash || '|' || audit_row_text)`), doğrulama fonksiyonu `0001_audit_chain.sql:50–63` `audit_verify()` (baştan sona tek tarama). Yetkiler `0001:7–17` (`REVOKE UPDATE, DELETE, TRUNCATE ON audit_log` `:13`).
- Tablo `packages/db/src/schema.ts:4–24`; kimlik sütunları `text`; **tek indeks `audit_log_seq_uq` (`:23`)**: süzme sorguları bugün tam tarama olur.
- API: yalnızca `GET /api/audit/verify` (`apps/api/src/app.ts:68`); listeleme ya da satır okuma ucu yok; doğrulama ucunun API testi yok.
- Ham olaya giden bağlar: `agent.tool` ve `agent.file_write` satırları `sessionId` + `toolUseId` taşır (`apps/worker/src/agents/runner.ts:219,225`); `file_write.data = {path, beforeSha, afterSha}` — **dosya içerikleri saklanmaz**, yalnızca sha. Araç girdisi (Edit `old_string/new_string`, Write `content`) `agent_events.payload`'dadır (`packages/db/src/agents.ts:140–149`; tekil `(session_id, seq)` `schema.ts:119`). Transcript arşivi `agent_sessions.transcript_blob_sha` (`schema.ts:93`). `artifact.created` satırları `subjectId = artifact id` (`apps/worker/src/pipeline/steps.ts:101,308,322`). İz ucu `GET /api/sessions/:id/trace` (`apps/api/src/routes/agents.ts:22`).
- Mevcut audit testleri `packages/db/test/audit.test.ts:11–79` (10 test).

**Sürümler ve incelemeler**
- `versions` `schema.ts:177–187` (indeks yok); üretimde tur 0 `packages/db/src/pipeline.ts:37`; düzeltme turu `insertVersion` `pipeline.ts:244–249` (`review-step.ts:234`, `fixer.ts:124`), gerekçe `rewindForReview` `pipeline.ts:359`, `current_version_id` `:361`; en iyi `setBestVersion` `:251–253`.
- `reviews` `schema.ts:305–326` (`version_id` `:310`), `findings` `:328–344`; okuma `listVideoReviews` `packages/db/src/reviews.ts:97–98`; uç `GET /api/videos/:id/reviews` (`apps/api/src/routes/videos.ts:41–45`). **`versions` tablosunu okuyan uç yok.**
- Web: `panelView` `apps/web/src/lib/production-view.ts:157–183` en yeni turu seçer (`:160`; yorum `:128–129` "no round picker in v1"); `ReviewPanel.tsx:50` "önceki N tur". `DraftTabs.tsx:67` sekmeleri `playerTabs()` `production-view.ts:100–106` (`final|mp4|live`); `FinalPanel` `DraftTabs.tsx:38–61`. **Karşılaştır sekmesi yok.**
- Kütüphane `apps/web/src/routes/Library.tsx:12–58` tek liste; satır Stüdyo'yu açar (`:36`). Yönlendirici `apps/web/src/lib/router.ts:3–11` (yalnızca pathname), sayfa seçimi `apps/web/src/main.tsx:69`; menü `components/NavRail.tsx:4–5` (`/audit`, `/assets` `enabled: false`).

**Varlıklar**
- `assets` `schema.ts:282–302` (`allowed` `:295`, yorum "import anındaki karar" `:282`); migration `0007_assets.sql`. **İptal alanı yok;** `packages/db/src/assets.ts` yalnızca `insertAsset :17`, `listAssets :26`, `getAsset :34`, `findAssetByBlob :39`.
- İçe aktarma `apps/worker/src/assets.ts:27–46` (`asset.imported|rejected|exists`), CLI `bin/assets.mjs` yalnızca `add :14`, `list :19`.
- Kullanım anı denetimleri `allowed`'ı okur: `apps/worker/src/pipeline/sound.ts:56` (`permitted`), `:77–85`, `:100–112`; `final-steps.ts:158–159`; fixer `fixer.ts:85–95,139`; ön kontrol `preflight.ts:25`; yayın `packages/shared/src/publish.ts:94–103`, `apps/api/src/routes/publish.ts:97,152`, `apps/worker/src/publish/service.ts:130–132`. **`voice-step.ts:48` `getAsset`'i `allowed` denetimi olmadan kullanır.**
- Varlık API'si ve arayüzü yok (`components/settings/NarratorVoiceSection.tsx:54` yalnızca CLI'yı anar).

**Depolama**
- `blobs` `schema.ts:139–145`; `putBlob` `apps/worker/src/media.ts:25–48` (`media/sha256/<ab>/<cd>/<sha><ext>` `:28`, geçici + fsync + rename `:33–45`); veri dizini `packages/shared/src/config.ts:31`.
- Blob'a başvuran sütunlar: `artifacts.blob_sha` (FK, `schema.ts:270`), `assets.blob_sha` (FK `:289`), `assets.license_snapshot_sha` (FK `:294`), `agent_sessions.transcript_blob_sha` (**FK yok**, `:93`), `publications.blob_sha` (**FK yok**, `:356`). `artifacts.meta` içinde sha: `glbSha` (`steps.ts:327,404`), `stemSha` (`voice-step.ts:208`), `voiceStemSha` (`final-steps.ts:250`), `musicSha` (`final-steps.ts:319`).
- Kare temizliği `apps/worker/src/render/frames.ts:33,51` (`frames.deleted`); **blob silme, çöp toplama, yetim raporu, yedek kodu yok.** Tek budama `ui_events` (`packages/db/src/events.ts:39`, `heartbeat.ts:13`).
- Disk muhafızı `apps/worker/src/pipeline/resources.ts:18` (`minDiskMb 3072`), `statfs` `:58`. Footer'da disk yok (`UsageFooter.tsx`); Ayarlar'da "veri ve yedek" yok (`routes/Settings.tsx:66–69`).
- Worker açılışı `apps/worker/src/main.ts:106–147` (`publisher.recover` `:144`), kapanış `:150–164`.

**Testler ve smoke**
- `vitest.config.ts`: `fileParallelism: false`, `testTimeout 20_000`; `vitest.render.config.ts`: `test-render/**/*.int.test.ts`, 240 sn.
- `createTestDb` `packages/db/test/helpers.ts:12–48`: her dosyada `CREATE DATABASE` + **migration'ların baştan koşulması** (`:26`); 55 dosya kullanıyor.
- En yavaş dosyalar (2026-10-08 ölçümü): `qc-step.test.ts` 80,7 sn (3 test: `:17` 30,3 sn, `:46` e2e 31,2 sn), `fixer.test.ts` 32,6, `review-step.test.ts` 28,4, `compose-step.test.ts` 22,5 (bir test 20,4 sn), `draft-review-step.test.ts` 18,3 (`:134` e2e 10,2), `qc.test.ts` 16,8. Harness `apps/worker/test/final-helpers.ts:26` (`finalHarness`, gerçek ffmpeg), e2e `e2e-helpers.ts:20`.
- Smoke: `tests/smoke/stack.mjs:43–65` env, `:69–81` sahte TikTok, `:97–128` PID denetimi; ekran testleri `tests/smoke/screens.spec.ts:5` (`VG_SCREENSHOTS`). S7/S8 yok; `test:smoke:real` betiği yok (`package.json`).
- İz listesi `apps/web/src/components/thinking/TraceView.tsx:6` `MAX_ROWS = 200` (yorum: "full virtual scrolling is M7, S8"); "Önceki N satırı göster" hepsini birden açar.
- Sayılar: `npm test` **462** (96 dosya), smoke **21 / 15**, `test:render` Blender'sız 11 / Blender'lı 16, pytest 50.

**Güvenli alan** (1080×1920'de üst 150, alt 1510, sağ 130, sol kenar 24; dört yerde sabit)
- `packages/remotion/src/props.ts:54–58` `safeRect`, `packages/remotion/src/layout.ts:37–46` `layoutIssues` (G6 manifest), `apps/worker/src/render/ffmpeg.ts:11–16` `SAFE_AREA_FILTER` (kontakt sayfası), `apps/worker/src/render/qc.ts:131` (kenar yoğunluğu bantları). Karar `packages/shared/src/qc.ts:100–101`; qc adımı `final-steps.ts:313`.

**Gerçek profil parçaları**
- Haiku oturumu `spikes/m3/probe.mjs:1–48`, `spikes/m0/lib.mjs:20–30`; kullanım `apps/worker/src/usage.ts:19–41` (`SdkUsageSource`); Blender önizleme `apps/worker/src/render/driver.ts:188–206` (`stills`, NVIDIA değilse `RenderError('gpu')` `:204`), `python/vg_blender/vg_blender/render.py:37–40`; Remotion: **still fonksiyonu yok** (`packages/remotion/src/render.ts:8` yalnızca `renderMedia`); ses `apps/worker/src/audio/driver.ts:80–135` (`PythonAudioDriver`), CER kapısı `python/audio_service/audio_service/voice_cli.py:254`; QC `apps/worker/src/render/qc-cli.ts:1–17`, beklenen 7 hata `docs/m5/real-check.md:19–32`.

## Plan öncesi sondaj (2026-10-08)

Bu konteynerde ölçüldü (GPU'suz, 4 çekirdek, 16 GB):

| # | Soru | Sonuç |
|---|---|---|
| P1 | `npm test` süresini ne belirliyor? | Seri koşu **332 sn**, dosya süreleri toplamı 262 sn (fark ~70 sn: 96 dosyanın tek tek yüklenmesi). İlk altı dosya 199 sn. `qc-step.test.ts:17` ve `:46` her biri ~30 sn: ikisi de `finalHarness.composed` ile gerçek ffmpeg compose koşuyor |
| P2 | Dosyalar paralel koşabilir mi? | **Evet:** `--fileParallelism --maxWorkers=3` → **147 sn, 462/462** (tek koşu). Her dosya kendi veritabanında; advisory lock'lar veritabanı kapsamlı; sahte sunucular ve dinleyiciler port 0. Kalıcılık T1'de üç ardışık koşuyla ve sabit yol/port taramasıyla kanıtlanır (Y2). Paralellikle `qc-step` e2e'sini taşımaya gerek kalmıyor (M5c H18 korunur) |
| P3 | `pg_dump` hangi sürüm, hangi rolle? | Konak `pg_dump` **16.15**, sunucu **17** (`postgres:17` konteyneri). 16 istemcisi 17 sunucusunu dökmeyi reddeder. `docker exec videogen-pg pg_dump` 17.11 çalışıyor (runbook §6 "Elle yedek" satırı da bunu kullanıyor). `videogen_app` `drizzle` şemasını okuyamıyor (`permission denied for schema drizzle`): döküm sahip rolüyle alınır. Yedek komutu sürüm denetimli bir çözücüyle seçilir (Y9) |
| P4 | Audit satırından "diff'e inme" neye dayanabilir? | Dosya içerikleri saklanmıyor; `agent.file_write` yalnızca `beforeSha/afterSha` taşıyor (`runner.ts:225`). Değişikliğin kendisi aracın girdisinde: Edit `old_string/new_string`, Write `content` (`agent_events.payload`, `tool_use_id` ile bulunur). Diff görünümü bu girdiden üretilir; tam dosya diff'i yok. **Spec notu §13.1** |
| P5 | Audit süzmesi indeks gerektirir mi? | Evet: tek indeks `seq` (`schema.ts:23`). 0010 `run_id`, `session_id`, `(subject_type, subject_id)`, `action`, `ts` indekslerini ekler (Y4) |
| P6 | `ffmpeg drawtext` var mı (kalibrasyon kartı için)? | **Yok** (bu ffmpeg freetype'sız; yalnızca `drawgrid`). Kart Remotion ile still olarak üretilir; aynı `renderStill` gerçek profilin 4. adımını da karşılar (Y16, Y17) |
| P7 | Başsız Chrome'da 4× yavaşlatmayla kare süresi ölçülebilir mi? | **Evet:** CDP `Emulation.setCPUThrottlingRate 4` + `requestAnimationFrame` aralıkları. 2000 düz satır: p50/p95 16,7 ms. `content-visibility: auto` aynı listede p95'i **33,5 ms**'ye çıkardı (kaydırırken satırları yeniden çiziyor); kullanılmaz. Boşta `Performance.getMetrics` `TaskDuration` farkı 3 sn'de 0,002 sn (Y13) |
| P8 | Varlık iptali için ne değişmeli? | `allowed` yalnızca içe aktarmada yazılıyor; kullanım anı denetimlerinin hepsi `allowed`'ı okuyor (Gerçek arayüzler). İptal = `allowed false` + `revoked_at` + gerekçe; compose, fixer, ön kontrol ve yayın kendiliğinden reddeder. Tek açık: `voice-step.ts:48` (Y8) |
| P9 | Hangi sha'lar blob'a başvuruyor? | Beş sütun (ikisi FK'sız) + `artifacts.meta`/`content` içindeki sha'lar. Çöp toplama bunların birleşimini ve 64 haneli onaltılık her jsonb değerini korur; 7 günden yeni blob'lar silinmez (Y10) |

## Karar kaydı

Hiçbir karar spec'teki bir K kararını değiştirmez. Spec metninden sapan ayrıntılar "Spec notu" ile işaretlidir ve T13'te spec'e işlenir (gerçek koşu kanıtı gerektirenler makine listesinde).

| # | Karar | Neden | Yanlışsa maliyeti |
|---|---|---|---|
| Y1 | 13 görev:<br>• T1 `npm test` süresi<br>• T2 migration 0010 + audit sorgu katmanı + uçlar<br>• T3 audit gezgini arayüzü<br>• T4 sürümler: uç, kütüphane detay sayfası, Karşılaştır, tur seçici, Review'lar sekmesi<br>• T5 varlık defteri (DB, API, yükleme, iptal, CLI, arayüz)<br>• T6 yedek (`MaintenanceService`, çözücü, döndürme, geri yükleme CLI'ı)<br>• T7 blob çöp toplama + yetim raporu + Ayarlar "Veri ve yedek"<br>• T8 güvenli alan (tek kaynak, ayar, manifest, kalibrasyon kartı)<br>• T9 `test:smoke:real`<br>• T10 ertelenenler: pipeline<br>• T11 ertelenenler: `fix_hint` + WebFetch sınırı + web<br>• T12 smoke S7, S8 (+ iz listesinin kademeli açılması) ve M7 ekranları<br>• T13 makine kontrol listesi ve dokümanlar | Süre önce (sonraki her görev hızlı koşar); DB katmanı arayüzden önce; smoke en sonda bütün ekranlar varken | T4 ve T5 büyük; reviewer'ı yorabilir |
| Y2 | **`npm test` süresi:** iki kaldıraç, bu sırayla uygulanır:<br>• (1) **şablon veritabanı:** `vitest` `globalSetup` migration'ları bir kez `vg_tpl_<migration klasörü sha'sının ilk 12 hanesi>` veritabanına koşar. Kurulum `vg_tpl_<h>_building` adına yapılır, bitince `ALTER DATABASE … RENAME` (yarım kalan bir kurulum geçerli sayılmaz; artık `_building` bir sonraki kurulumda silinir). Kurulum ve her `CREATE DATABASE … TEMPLATE` admin bağlantısında aynı `pg_advisory_lock` altında yapılır (Postgres şablon kopyalanırken şablona başka bağlantı istemez; 55006 "being accessed by other users" bir kez beklenip yeniden denenir). Eski `vg_tpl_*` **otomatik silinmez** (başka bir çalışma ağacının koşusu kullanıyor olabilir); `npm run db:test-clean` artık `vg_test_*` ve güncel olmayan `vg_tpl_*`'ları bağlantısı yoksa siler. `createTestDb` şablon yoksa bugünkü yola düşer.<br>• (2) **paralel dosyalar:** `fileParallelism: true`, `maxWorkers` = `VG_TEST_WORKERS` (varsayılan `min(3, çekirdek − 1)`, en az 1). Önce sabit yol ve port taraması (`/tmp/` altında sabit adlar, `listen(<sabit>)`, ortak `settings` anahtarı, `~/videogen-data`); bulunan her paylaşım dosya başına benzersizleştirilir. Gerçek ffmpeg koşan ağır dosyaların (`qc-step`, `compose-step`, `fixer`, `review-step`, `draft-review-step`, `qc`, `sound`, `final-compose`, `review-tools`) test zaman aşımları en az 60 sn'ye çıkarılır (bugün `compose-step` bir testi 20,4 sn ile 20 sn varsayılanın sınırında).<br>• **`qc-step.test.ts:46` e2e `npm test`'te kalır:** M5c H18 (`2026-10-07-m5c-voice.md:123`) M5b'nin tek uçtan uca "ready" testinin taşınmamasını açıkça istiyor; paralellikle (P2: 147 sn) taşımaya gerek kalmıyor. M6 defteri T3'teki "kaldıraç taşımak" notu bu kararla geçersizdir (`Ruling:`).<br>Ölçüt: **üç ardışık tam koşu yeşil, en yavaşı ≤ 240 sn**. Paralel koşu kararsız çıkarsa (aynı commit'te bir kırmızı) kök neden bulunur ve düzeltilir; düzeltilemezse `maxWorkers 2` denenir; o da olmazsa seri + şablon kalır ve sonuç ledger'a `Ruling:` ile yazılır (bu durumda 240 sn ölçütü tutmaz, kullanıcıya açık madde) | P1, P2; M6 defteri T3; M5c H18 | Paralel koşu zamanlamaya duyarlı bir testi kırabilir: kök neden düzeltilir, test atlanmaz |
| Y3 | **Süre bütçesi:** T1'den sonra her görev en çok **+10 sn**; M7 sonunda `npm test` ≤ 270 sn (6 dk sınırına ≥ 90 sn pay). Her görevden sonra süre ledger'a. Yeni gerçek ffmpeg/Chrome işi `npm test`'e girmez, `test:render`'a gider | M5c H18 ve M6 Y23 kuralı; VM varyansı ±30 sn | Sapma `Ruling:` |
| Y4 | **Migration 0010 (tek, geri alınmaz):**<br>• audit indeksleri: `audit_log (run_id, seq)`, `(session_id, seq)`, `(subject_type, subject_id, seq)`, `(action, seq)`, `(ts)`. Tetikleyiciye ve zincire dokunulmaz.<br>• `assets`: `revoked_at timestamptz`, `revoke_reason text`, `updated_at timestamptz`.<br>• `maintenance_runs`: `id uuid`, `kind` (`backup`\|`gc_report`\|`gc_delete`\|`orphan_report`), `status` (`running`\|`done`\|`failed`), `started_at`, `ended_at`, `detail jsonb` (dosya, bayt, sayılar, hata metni). Yetki: `REVOKE DELETE, TRUNCATE ON maintenance_runs FROM videogen_app` (desen `0009_publish.sql:48–49`). Aynı anda tek bakım işi: kısmi benzersiz indeks `maintenance_one_running ((true)) WHERE status = 'running'` (desen `publications_one_active`).<br>• `blobs.touched_at timestamptz NOT NULL DEFAULT now()` (`putBlob` her çağrıda tazeler; çöp toplamanın yaş ölçütü budur, `created_at` değil — Y10).<br>• `versions (video_id, round)` indeksi.<br>`blobs` satırlarını silebilmek için uygulama rolünün mevcut DELETE yetkisi kullanılır (FK'lar başvurulan satırı korur) | P5, P8; spec §11.2 değiştirilemezlik | — |
| Y5 | **Audit sorgu uçları:**<br>• `GET /api/audit?run&video&session&role&action&from&to&before&limit` → `{rows, nextBefore}`. `seq` azalan; `limit` ≤ 200 (varsayılan 50); `before` imleci. `video` = `subject_type='video' AND subject_id` **ya da** o videonun run'ları (`run_id IN …`) **ya da** o run'ların oturumları; `role` = `actor_id` önekinin rol kısmı; `action` tam ad ya da `publish.*` gibi önek; tarih ISO.<br>• `GET /api/audit/actions` → ayrık eylem adları ve sayıları (filtre listesi).<br>• `GET /api/audit/:seq` → `{row, links}`; `links`: `session {id, role, model, transcriptSha}`, `tool {name, input}` (aynı oturumun `agent_events`'inde `tool_use_id` ile; girdi `redactSecretKeys`'ten geçer, her dize 4000 karakterde kesilir, toplam ≤ 32 KB), `artifact {id, kind, blobSha, versionId}`, `file {path, beforeSha, afterSha}`.<br>• `GET /api/audit/verify` korunur, yanıt `{ok, checked, firstBadSeq, lastSeq, checkedAt, ms}` olur. `audit_verify()` tam taramadır: API son sonucu süreç belleğinde tutar; `?fresh=1` yoksa ve sonuç 10 dk'dan yeniyse önbellekten döner (`cached: true`). Sayfa açılışı önbelleği kullanır, "Yeniden doğrula" `fresh=1` gönderir.<br>Hepsi salt okuma; yerel olmayan Host her istekte reddedilir (`apps/api/src/guard.ts:8`) | §11.2, §13.1 Audit gezgini; P4 | Büyük bir audit tablosunda `video` süzmesi yavaşlayabilir (indeksler; S8 değil, T2 testinde 5000 satırla ölçülür) |
| Y6 | **Audit gezgini arayüzü** (`/audit`, menüde etkin):<br>• üstte zincir rozeti: "Zincir geçerli · 12 345 satır · 10:42" (yeşil) / "Zincir bozuk: satır 812" (kırmızı); "Yeniden doğrula" butonu<br>• süzgeçler: run, video (kütüphaneden seçim), agent rolü, eylem (öneklere gruplanmış liste), tarih aralığı; URL sorgusunda tutulur (`/audit?run=…`), böylece kütüphane detayındaki Audit sekmesi aynı bileşeni süzgeçle açar<br>• tablo: saat, aktör, eylem, konu, kısa veri; "Daha eski" ile sayfalama<br>• satır detayı (sağ çekmece değil, satırın altında açılır): ham JSON, "Transcript" (blob indirme), "Araç girdisi" (Edit için iki sütunlu eski/yeni, Write için içerik), "Artefakt" (`/api/artifacts/:id`), "İz" (oturum izini Stüdyo kartıyla aynı `TraceView` ile).<br>Okuma görünümü 900 px (spec §13.1) | §13.1, S7 | — |
| Y7 | **Sürümler ve karşılaştırma:**<br>• `GET /api/videos/:id/versions` → sürüm başına `{id, round, reason, parentId, createdAt, runId, total, verdict, finals: {musicSha, tiktokSha, coverSha, durationS} \| null, best, current, published}`; sıralama tur.<br>• `GET /api/videos/:id/reviews?version=<id>` süzgeci.<br>• **Kütüphane detay sayfası** `/library/<videoId>` (satır artık buraya gider; "Stüdyo'da aç" butonu kalır). Sekmeler: **Sürümler** (liste + Karşılaştır), **Review'lar** (sürüm/tur seçicili `ReviewPanel`), **Storyboard** ve **Araştırma ve kaynaklar** (mevcut `ArtifactCards` bileşenleri, iddialar ve kaynak URL'leri), **Audit** (Y6 bileşeni `video` süzgeciyle), **Yayın** (mevcut `PublishPanel`).<br>• **Karşılaştır:** iki sürüm seçilir (varsayılan: en iyi ve bir önceki); "Yan yana" iki `<video>`'yu tek oynat/duraklat/sar ile eşzamanlar (sapma > 0,15 sn ise düzeltir); "A/B" tek oynatıcıda A ve B arasında aynı zamanda geçer (B tuşu). Varyant çipi her iki tarafa uygulanır. Puan farkı ve boyut farkları altta. Finali olmayan sürümler (yarıda kalan tur; orkestratörün yorumu `orchestrator.ts:366` "orphaned … harmless") listede "tamamlanmadı" etiketiyle görünür ve karşılaştırmaya seçilemez.<br>• Stüdyo `DraftTabs`'a "Karşılaştır" sekmesi yalnızca videoda finalli ≥ 2 sürüm varsa eklenir (aynı bileşen).<br>• **Tur seçici:** `panelView(all, runId, round?)`; panel başlığındaki "önceki N tur" metni tur çiplerine dönüşür. **Spec notu §13.1** (M5b notunun M7 kısmı tamamlandı) | §13.1; M5b notu | S5'teki "chat ile v2 → Karşılaştır" akışı kapsam dışı (chat düzenlemesi sürüm üretmiyor) |
| Y8 | **Varlık defteri:**<br>• DB: `revokeAsset(db, id, reason)` (koşullu: `revoked_at IS NULL`), `listAssets` iptal alanlarıyla. İptal geri alınmaz; aynı dosya yeniden içe aktarılamaz (`(blob_sha, kind)` tekil), yeni bir lisans metniyle yeniden izin **kapsam dışı** (gerekirse yeni varlık).<br>• API: `GET /api/assets?kind` (lisans, yazar, kaynak, atıf, izin, iptal, süre, etiket, kullanım sayısı = bu varlığı içeren `audio_plan`'lı sürüm sayısı); `POST /api/uploads?ext=<wav|mp3|flac|ogg|m4a>` (`application/octet-stream`, ≤ 200 MB, akışla `<dataDir>/uploads/<uuid>.<ext>`; uzantı izin listesinden, dosya ffprobe ile ses olarak doğrulanır, değilse silinip 400; yanıt `{uploadId, sha, bytes, durationMs}`); `POST /api/assets {uploadId, kind: 'music'\|'sfx'\|'voice_ref', title, license, author, licenseText, attribution?, source?, tags?}` → içe aktarma (`uploadId` `^[0-9a-f-]{36}$` ve `uploads/` içinde gerçekten var olan dosya; yol birleştirme yok. Karar `licenseVerdict`, reddedilen de kaydedilir: 201 `allowed:false` + gerekçe); `POST /api/assets/:id/revoke {reason}` → audit `asset.revoked`. Yükleme artıkları (1 saatten eski `uploads/*`) bakım servisinin **saatlik** turunda silinir.<br>• İçe aktarma çekirdeği (`importAsset`, `putBlob`) worker'dan `packages/db/src/media.ts`'e taşınır; ses süresi fonksiyonu (`audioDurationMs`, ffmpeg çağırır, `apps/worker/src/assets.ts:31`) bağımlılık olarak verilir, db paketi süreç başlatmaz. Worker eski yollardan yeniden dışa aktarır (çağıranlar değişmez). API worker'ı içe aktarmaz; ffprobe/ffmpeg'i `config.ffmpeg` ile kendisi çağırır.<br>• **Anlatıcı sesi (`voice_ref`):** klon referansları rıza kaydıdır; `/assets`'te "Ses örneği" türü olarak listelenir ve iptal edilebilir. Anlatıcı ayarındaki varlık iptal edilirse aynı transaction'da ayar hazır sese döner (`DEFAULT_NARRATOR`), audit `settings.narrator_voice {reason: 'revoked'}`. `preflight.ts:37` ve `voice-step.ts:48` iptal edilmiş/izinsiz referansı reddeder.<br>• CLI: `bin/assets.mjs revoke <id> --reason "…"`.<br>• Arayüz `/assets` (menüde etkin): tür çipleri (Müzik, SFX, Ses örneği), tablo (başlık, lisans rozeti, yazar, kaynak bağlantısı, atıf, süre, kullanım), satırda önizleme oynatıcı (`/api/blobs/:sha`), "Ekle" formu (dosya + lisans metni zorunlu; CC-BY seçilince atıf zorunlu), "İzni geri al" (onay metni: "Bu varlık yeni compose ve yayınlarda kullanılamaz; mevcut finaller değişmez").<br>• `voice-step.ts:48` ve `preflight.ts:37` `allowed` + `licenseVerdict` denetimi alır (P8 açığı).<br>3D/HDRI/font türleri listede gösterilmez (pipeline kullanmıyor) | §13.1 Varlıklar ("ekleme ve onay"); §9 lisans kapısı; P8 | Yükleme uç noktası büyük gövde kabul eder: yalnızca yerel Origin, boyut sınırı, geçici dosya 1 saat sonra çöp toplamada silinir |
| Y9 | **Yedek:**<br>• Çözücü `resolvePgDump(cfg)`: `VG_PG_DUMP` (komut + argümanlar, JSON dizi) varsa o; yoksa konak `pg_dump --version` ana sürümü sunucunun `server_version_num` ana sürümüne eşitse konak; değilse `docker exec <VG_PG_CONTAINER, varsayılan videogen-pg> pg_dump`; hiçbiri değilse gerekçeli ret ("pg_dump 16, sunucu 17: VG_PG_DUMP ayarlayın"). **Kimlik:** döküm sahip rolüyle (`adminDatabaseUrl`, `videogen`) alınır: `videogen_app`'in `drizzle` şemasına yetkisi yok (doğrulandı: `permission denied for schema drizzle`) ve migration durumu dökümde olmalı. **Bağlantı:** konak yolunda URL'deki konak/port; docker yolunda konteynerin içinden `-h localhost -p 5432 -U <kullanıcı> -d <db>` açıkça verilir (config'teki 127.0.0.1:5433 konteyner içinde geçersiz). Parola komut satırına değil `PGPASSWORD` env'ine (docker için `docker exec -e PGPASSWORD …`); log'a ve audit'e komutun yalnızca türü (`host`\|`docker`\|`custom`) yazılır. `-Fc` çıktısı ikilidir: stdout doğrudan `.tmp` dosyasına akıtılır (`runProcess`'in satır tamponuna alınmaz), çıkış kodu ve stderr'in son 2 KB'si tutulur.<br>• **Geri yükleme** aynı çözücüyle `pg_restore` seçer (`VG_PG_RESTORE`; konak 16, 17 biçimli arşivi okuyamaz → docker yolu `docker exec -i … pg_restore -h localhost -p 5432 -U … -d <yeni_db>`, arşiv stdin'den). Önce `CREATE DATABASE <yeni_db>` (sahip rolüyle); `videogen_app` rolü kümede yoksa ret (rol dökümde değildir; `0001_audit_chain.sql:1–5` yeni kümede `npm run db:migrate` ile kurulur — runbook notu).<br>• Dosya `<dataDir>/backups/videogen-<YYYY-MM-DD>.dump` (yerel tarih); önce `.tmp`, `fsync`, `rename`; 0600, dizin 0700. Dökümün içinde `blobs` tablosu = medya manifesti (spec §11.3). Medya dosyalarının kendisi yedeklenmez (**Spec notu §11.3**: medya içerik adresli ve büyük; yedeği kullanıcının disk yedeğine bırakılır, runbook notu).<br>• Zamanlama: worker açılışından 5 dk sonra ve saatte bir bakar; bugünün dosyası yoksa alır. Aynı anda tek bakım işi (süreç içi kilit + `maintenance_runs` `running` satırı; açılışta yarım `running` → `failed` "worker yeniden başladı").<br>• Döndürme: başarılı yeni yedekten sonra en yeni **7 dosya** kalır; başarısız yedek eskileri silmez.<br>• `bin/backup.mjs now|list|restore <dosya> --into <yeni_db>`: geri yükleme **yalnızca var olmayan bir veritabanına**; sonra `audit_verify()` ve tablo satır sayıları basılır. Canlı veritabanının üzerine yazma yok (runbook'taki `--clean` satırı bununla değişir).<br>• Audit `backup.created {file, bytes, ms, via}`, `backup.failed {reason}`, `backup.pruned {files}`. Ayar `maintenance.backup` = son durum | §11.3; P3; §15 | Docker'sız ve sürüm uyuşmayan bir makinede yedek alınmaz: Ayarlar kırmızı uyarı gösterir |
| Y10 | **Blob çöp toplama ve yetim raporu:**<br>• **Referans kümesi:** beş sütun (Gerçek arayüzler) ∪ **her tablonun her jsonb sütunundaki** 64 haneli onaltılık dize değerleri (`artifacts.meta/content`, `settings.value`, `jobs.payload`, `findings.evidence`, `reviews.*`, `publications.checklist`, `claims.sources`, `agent_events.payload` …; liste `information_schema.columns`'tan üretilir, elle yazılmaz) ∪ etkin run'ların (`queued/running`) blob'ları ∪ `touched_at`'i son 7 gün içinde olan blob'lar. Şema bekçisi testi: adı `*sha*` olan yeni bir `text` sütun referans kümesine bağlanmadan eklenirse test düşer.<br>• **Yarış (yeniden yazım):** `putBlob` bugün dosya varsa yazmayı atlıyor ve var olan satırı olduğu gibi bırakıyor (`apps/worker/src/media.ts:32–46`, `packages/db/src/blobs.ts:6–8`); eski, referanssız bir blob yeniden kullanılırken silinebilirdi. Yeni sıra: `putBlob` blob başına **paylaşımlı** advisory kilidi (`pg_advisory_xact_lock_shared(<VG sabiti>, hashtext(sha))`) altında satırı upsert eder (`touched_at = now()`), sonra dosyayı denetler, yoksa yazar. Silme aynı anahtarın **özel** kilidi altında: `DELETE … WHERE sha = $1 AND touched_at < now() − 7 gün` ve dosyanın çöp kutusuna taşınması aynı transaction içinde, commit'ten önce. Böylece eşzamanlı bir `putBlob` ya silmeyi engeller ya da silmeden sonra dosyayı yeniden yazar.<br>• **Çöp kutusu (asıl güvence):** silinen dosya `<dataDir>/trash/<YYYY-MM-DD>/<sha><ext>`'e taşınır (`rename`, aynı dosya sistemi) ve **7 gün sonra** bakım turunda kalıcı silinir (`trash.purged` audit). Yedek medya içermediği için (Y9) geri alma yolu budur: `bin/maintenance.mjs restore-blob <sha>` dosyayı geri taşır ve satırı yeniden ekler.<br>• **Rapor** (haftalık, ayrıca elle): aday sayısı, toplam bayt, en büyük 20 aday (sha, mime, bayt, `touched_at`); `maintenance_runs` `gc_report` satırı, `detail.candidates` sha listesi (≤ 10 000).<br>• **Silme** yalnızca `POST /api/maintenance/gc {reportId, confirm: "<aday sayısı>"}` ile; şartlar: rapor ≤ 24 saat eski, son 24 saatte başarılı yedek var (ikincil güvence: DB satırları dökümde), adaylar silme anında **yeniden** referanssız. FK ihlali → atlanır. 500'lük gruplarla audit `blob.deleted {count, bytes, reportId, shas}`.<br>• **Yetim raporu** (silmez): diskte olup `blobs`'ta olmayan medya dosyaları; `blobs`'ta olup diskte olmayanlar ya da boyutu tutmayanlar; `runs` satırı olmayan `runs/<id>` klasörleri; 1 saatten eski `uploads/` dosyaları (bunlar silinir: kullanıcı dosyası değil, yükleme artığı). `maintenance_runs` `orphan_report`.<br>• Haftalık iş pazartesi ilk bakım turunda (yerel saat) | §11.3 ("onay ister", "haftalık", "yetim dosya raporu"); P9 | Korumacı küme bazı çöpleri bırakır (bilinçli); yanlış silme pahalı |
| Y11 | **Ayarlar "Veri ve yedek"** (`data-testid="data-status"`): veri dizini ve boş disk (statfs), DB boyutu (`pg_database_size`), medya toplamı (`sum(blobs.bytes)`), son yedek (zaman, boyut, yol türü, hata), yedek sayısı, "Şimdi yedekle"; son çöp toplama raporu (aday, MB, tarih) + "Sil…" (onay kutusu: aday sayısını yazdırır); yetim raporu özeti + ayrıntı. Footer'a boş disk eklenir ("disk 41 GB boş"; < 10 GB sarı, < 3 GB kırmızı; spec §13.1 footer). Uçlar: `GET /api/maintenance`, `POST /api/maintenance/{backup,gc-report,orphans,gc}` (komut `maintenance.run {kind}` → worker; 202) | §13.1 Ayarlar ve footer | — |
| Y12 | **Smoke S7:** dev ucuyla tohumlanmış bir `ready` video + bir run'ın audit satırları; `/audit` → run süzgeci → yalnızca o run'ın satırları; zincir rozeti "geçerli"; bir `agent.tool` satırı açılır → araç girdisi görünür; bir `artifact.created` satırından artefakta inilir; kütüphane detayının Audit sekmesi aynı satırları video süzgeciyle gösterir. Bozuk zincir smoke'ta denenmez (birim testi var, `audit.test.ts:29`) | §16.2 S7 | — |
| Y13 | **Smoke S8 ve performans bütçeleri** (`tests/smoke/s8-perf.spec.ts`, CDP):<br>• **B1 kaydırma:** 4× CPU yavaşlatması; Stüdyo'da (a) 10 adımlı tamamlanmış bir run'ın adım listesi + açık agent kartları, (b) 1000 satırlık bir oturum izi (dev ucu `POST /api/dev/sessions` ile uzun bir fixture; "Önceki satırları göster" ile 1000 satıra kadar açılmış). Programatik kaydırma, 240 kare; `requestAnimationFrame` aralıklarının **p95 ≤ 16,8 ms**.<br>• **B2 boşta CPU:** yavaşlatmasız, Stüdyo açık, SSE canlı (heartbeat + kullanım yoklaması), 10 sn: ana iş parçacığı `TaskDuration` artışı **≤ 0,2 sn** (%2) ve 50 ms'yi aşan uzun görev yok (`PerformanceObserver longtask`).<br>• **B3 açılış:** S1'in < 2 sn ölçütü aynen (değişmez).<br>• **İz listesinde pencereli çizim zorunlu** (spec §12.4 "200 satırı geçince sanal kaydırma"): 200 satırdan uzun izlerde `TraceView` üst düzey blokları görünür alan ± 1 ekran içinde çizer (blok yükseklikleri ölçülür ve önbelleğe alınır, ölçülmemiş blok için tahmin; dış kaydırma kabı değişmez). "Önceki N satırı göster" kalkar; bütün iz kaydırılarak gezilir. Yeni bağımlılık yok; `content-visibility` kullanılmaz (P7). S8 kaydırmadan sonra DOM'daki iz satırı sayısının **≤ 400** olduğunu da doğrular.<br>• p95, 60 Hz'in tek karesinin (16,67 ms) %0,8 üstü: 240 karede ~12 takılma bütçeyi aşar. Ham dağılım (p50, p95, p99, en büyük, > 16,8 ms kare sayısı) her ölçümde test çıktısına ve ledger'a yazılır.<br>• Bütçeler `tests/smoke/perf-budgets.ts`'de sabit; spec §12.4'e not | §16.2 S8, §12.4; P7 | Bulut VM'sinde kare zamanlaması dalgalanabilir: ölçüm üç kez alınır, ortanca p95 kullanılır; makinede bir kez daha koşulur (makine listesi) |
| Y14 | **`test:smoke:real`** (`npm run test:smoke:real` → `node --import tsx bin/smoke-real.ts`):<br>• Ön koşullar: `ANTHROPIC_API_KEY` env'de varsa ret (§6.6); `GET`-siz doğrudan kullanım okuması 5 sa ≥ %80 ise ret; geçici veri dizini `/tmp/videogen-real-<tarih>` ve geçici DB `videogen_real_check` (sonunda silinir); `~/videogen-data`'ya yalnızca `reports/` altındaki rapor dosyasını yazar. Adım 1 gerçek Claude kullanımı harcar (haiku, tek tur): makine listesinin kullanım durdurma koşuluna tabidir.<br>• Adımlar (spec §16.3, sırayla, her biri `pass\|fail\|skip` + süre + kanıt): (1) izole SDK oturumunda haiku ile 1 tur — `system/init.apiKeySource === 'none'` ve hook olayı 0; (2) `SdkUsageSource.read()` — yüzdeler 0..100, sıfırlanma zamanı; (3) `BlenderRenderDriver.stills` 2 kare 270×480, `renderer_get` NVIDIA; (4) `renderStill` ile gerçek Remotion still (kalibrasyon kartının ilk karesi, Y16); (5) `PythonAudioDriver` tek cümle TTS + Whisper, CER ≤ %5; (6) `qc-cli` kalem pilotu üzerinde (`VG_PILOT_VIDEO`, varsayılan `~/icinde-ne-var/pilot-kalem/…/icinde-ne-var-kalem.mp4`, `docs/m5/real-check.md:22`) çıkış 3 ve 7 beklenen `✗`.<br>• `--only 1,3`, `--skip 5`. Çıktı: tablo + `~/videogen-data/reports/real-smoke-<tarih>.json`; herhangi bir `fail` → çıkış 1.<br>• Bulutta test edilen: koşucu (sıra, ön koşul retleri, `--only`, rapor, çıkış kodu) ve her adımın sonuç ayrıştırıcısı, enjekte sahte adımlarla. Gerçek adımlar makinede | §16.3, §17 | Bir adım makinede beklenmedik biçimde başarısız olursa düzeltme makine oturumunda yapılır (makine listesi) |
| Y15 | **Güvenli alan tek kaynak:**<br>• `SafeArea = {top, bottom, right, left}` (1080×1920 piksel; `bottom` alt sınırın y'si), varsayılan `{150, 1510, 130, 24}`, şema: `0 ≤ top < bottom ≤ 1920`, `0 ≤ left`, `left + right < 1080`, `bottom − top ≥ 900`. `scaleSafeArea(a, w, h)`.<br>• Ayar `settings` `safe_area` = `{area, source: 'default'\|'calibrated', measuredAt?, note?}`; `GET/PUT /api/safe-area` (audit `settings.safe_area`); Ayarlar'da "Güvenli alan" bölümü: dört sayı, kaynak, "Varsayılana dön".<br>• Kullanım: compose `layout.json` manifestine `safeArea` yazar ve Remotion props'u aynı değeri alır; `layoutIssues(m)` `m.safeArea ?? DEFAULT`; kontakt sayfası filtresi ve qc kenar bantları parametre alır. compose'un `inputHash`'i güvenli alanı içerir (ayar değişince eski final yeniden kullanılmaz).<br>• Rubrik sürümü değişmez (`final@1`): kapı aynı, yalnızca sınırlar ölçülür. **Spec notu §7.5/§8.1** | §18 güvenli alan satırı; dört sabit kopya | — |
| Y16 | **Kalibrasyon akışı:** `node bin/safe-area.mjs card` → `<dataDir>/calibration/safe-area-card.mp4` (5 sn, 1080×1920; her 10 px'te etiketli yatay cetvel, sağ kenarda dikey cetvel, köşelerde ölçek) ve aynı karenin PNG'si (Remotion `SafeAreaCard` kompozisyonu, `renderStill` + kısa `renderMedia`). Kart VideoGen'in yayın yolundan **gönderilmez** (`publications` bir videoya ve sürüme bağlıdır, `schema.ts:347–356`; API taslak sayacına da girmez). Kullanıcı kartı telefona elle aktarır (kablo/AirDrop), TikTok uygulamasında "Kimler izleyebilir: Yalnızca ben" ile paylaşır, profilinden akış görünümünde açar, ekran görüntüsü alır ve paylaşımı siler; arayüz öğelerinin başladığı cetvel değerlerini okur ve Ayarlar'a girer (`source: calibrated`, not alanına cihaz). Görüntüden otomatik ölçüm **kapsam dışı** (telefon ekranı ölçeği ve durum çubuğu cihaza bağlı; elle okumak güvenilir ve ucuz) | §18; P6 | Kullanıcı yanlış okursa G6 ya gereksiz düşürür ya kaçırır: değerler varsayılandan > 150 px saparsa Ayarlar uyarır |
| Y17 | **`renderStill`** (`packages/remotion/src/render.ts`): `@remotion/renderer` `renderStill` ile tek kare PNG; `VG_REMOTION_GL` kipi aynen. Testi `test:render`'da (Chrome render'ı) | P6, Y14 adım 4 | — |
| Y18 | **Ertelenenlerden seçilenler (T10, pipeline):**<br>• (3) G4 durdurma notu: ses izi yoksa "seslendirme izi bulunamadı; düzeltme turu bunu çözemez" (yeni `LoopStop 'no_voice_track'`), klon notu yalnızca iz klonsa. Kullanıcıya görünen yanlış gerekçe.<br>• (4) VO'lu videoda fixer vuruş kimliğini değiştiremez: `checkAsync`'te `voKey(next) !== voKey(prev)` ve kapsam `voice` değilse ret ("seslendirmeli videoda vuruş kimliklerini ve metinlerini değiştirme"). Boşa giden bir düzeltme turu ve "bayat" ile düşen compose.<br>• (8) `review` bayatlığı VO'da `voice_track.meta.voKey === voKey(en yeni storyboard)` ve `music.meta.voiceStemSha === track.meta.stemSha` şartlarını da arar. Bayat bir finalin incelenmesi.<br>• (7) ses CLI sınırları config'e: `VG_AUDIO_TIMEOUT_MS` (900 000), `VG_AUDIO_MAX_RSS_MB` (6000); değerler makinede ölçülüp yazılır (makine listesi).<br>• M4c-M4: `rewindForReview` false dönerse (`orchestrator.ts:371–376`) run durumu yeniden okunur; run hâlâ `running` ise adım gerekçeli `failed` olur ("geri sarma uygulanamadı"), böylece run boşta asılı kalmaz | Küçük, testli, kullanıcıya görünen ya da asılı kalma riskli maddeler | — |
| Y19 | **Ertelenenlerden seçilenler (T11):**<br>• **(2b) `fix_hint`:** `reviewer_facts`'in sahip olduğu kontrollerde (`claims_supported`, `claims_verified`) fixer'a giden ipucu serbest metin değil, şablondur: "<kontrol etiketi>: iddia <claim id> kaynakla desteklenmiyor; iddiayı kaldır ya da araştırmadaki doğrulanmış ifadeyle değiştir" (claim id kanıttan; yoksa "ilgili iddia"). Serbest metin `findings.fix_hint`'te kalır (insan okur; panelde görünür), fixer ve rework istemine gitmez. Diğer reviewer'ların ipuçları değişmez.<br>• **WebFetch sınırı:** `GuardContext.webAllow?: string[]`; `reviewer_facts` oturumunda WebFetch yalnızca `webCheckTargets` (`review-inputs.ts:28`) URL'lerine **birebir** izinli: normalleştirmeden sonra (küçük harf konak, varsayılan port atılır, sondaki `/` eşitlenir) şema `https`, konak ve yol aynı, ek sorgu dizesi ya da parça yok (bir sayfanın "aynı URL + `?q=<sızan metin>`" isteği reddedilir); dışı `deny` + gerekçe. Aynı `ctx` alt ajan araç çağrılarında da geçerlidir (guard alt ajanları aynı bağlamla değerlendirir). Yönlendirmeyi WebFetch aracı kendisi izler; hedef listesi araştırmanın kaynak URL'leridir (bilinen risk: hedef sayfanın yönlendirmesi; runbook notu). WebSearch açık kalır (arama sonucu içerik getirmez; getirmek için WebFetch gerekir). researcher'a sınır yok (araştırma serbest gezinmeyi gerektirir; çıktısı zaten çitli).<br>• **SSE `publish.status`:** web `publish.status` olayında `['publish', videoId]` sorgusunu geçersizler; 1,5 sn yoklama kalkar, yedek olarak 10 sn yoklama yalnızca etkin gönderimde kalır (M6 T7 Ruling'i).<br>• **Kısayollar** (M4c-M7): `shortcutFor` `shiftKey`, `repeat`, `isComposing`'i alır; Shift'li harfler ve tekrar eden tuşlar eylem üretmez (yalnızca J/L'nin tekrarı sarmaya devam eder) | Güvenlik (istem enjeksiyonu yüzeyi) + M6/M4c devirleri; M6 T9 Step 4 `fix_hint`'in M7'de yeniden değerlendirilmesini istiyordu | Şablon ipucu fixer'ın düzeltme isabetini azaltabilir: gerçek koşuda ölçülür (makine listesi M5 bölümü) |
| Y20 | **Ertelenip kalanlar (gerekçeli):** (5) retime → keep replay (yalnızca çökme + deterministik olmayan TTS'te; hata sessiz değil, compose "bayat" ile düşer, yeniden üretim çözer); M4a 1–3, 5–11 (kira denemesi, kayıp `run.start` NOTIFY, …: tek kullanıcılı yerel kullanımda görülmedi; M4a-2'nin yayın için karşılığı M6'da süpürmeyle yapıldı); M3 1, 2, 7, 9, 11 (görsel/akış ayrıntıları); M3-10 (`summarizer` v1'de kullanılmıyor); M4c M6, M8; M5a M9 (kare karışımı audit'te zaten `render.final_mixed_samples`); M5b `averageVisual` savunmaları | Kapsam ve maliyet; hiçbiri veri kaybı ya da güvenlik değil | Sonraki taşa ya da gerçek kullanımda görülürse |
| Y21 | **Makine kontrol listesi** (`docs/machine-checklist.md`, T13): tek sıralı liste, her madde: önkoşul, komut, beklenen, kayıt yeri, kapı (🚦) — Bölüm A ortam ve tam doğrulama (M5c T12 Step 1 + M7 sayıları; `test:render` Blender'lı, `test:blender`, pytest gerçek venv, smoke 24/16, `npm test` süresi makinede); B M5 kapanışı (M5c T12 Step 2–9: kalibrasyon, ses ölçümü, iki gerçek koşu, K17, son review, dokümanlar); C M6 T9 (Step 0–7); D M7 gerçek denetimleri (`test:smoke:real`, güvenli alan kalibrasyonu, S8'in makinede tekrarı, gerçek veriyle yedek + geri yükleme provası, çöp toplama raporu ve onaylı silme, ses CLI sınırlarının ölçülüp yazılması, şablon `fix_hint`'in gerçek koşudaki etkisi); E kapanış (spec notları, özetler, `main`, rapor). Eski "beklenen" sayılar (355, 399, 428, 462) güncel M7 sayılarıyla değiştirilir ve listede tek yerde durur | Kullanıcı isteği; dağınık bekleyenler (`real-check.md`, iki plan, iki özet) | — |
| Y22 | **Sayı zinciri** (`npm test`): 462 → T1 463 → T2 468 → T3 470 → T4 474 → T5 479 → T6 483 → T7 490 → T8 493 → T9 495 → T10 500 → T11 504 → T12 504 → T13 504. `test:render` Blender'sız 11 → T8 **12** (Blender'lı 16 → **17**). Smoke 21/15 → T12 **24/16** (S7 1, S8 2, M7 ekran testi 1 atlanır). pytest 50 değişmez | `it` blokları sayılarak | Sapma ledger'a `Ruling:` |

## Kapsam dışı (gerekçeli)

| Madde | Nereye | Neden |
|---|---|---|
| İzlenme verisi girişi ve rubrik ağırlık ayarı (§8.4) | İlk 10 yayından sonra | Veri yok (M6 kapsam dışı satırı) |
| LLM açıklama önerisi (`summarizer`) | Sonraki taş | Claude kullanımı; M6 Y11 deterministik açıklama yeterli |
| Chat'ten sürüm üretimi ve S5'in "Karşılaştır iki sürümü gösterir" adımı | Sonraki taş | Chat düzenlemesi bugün `versions` satırı üretmiyor; Karşılaştır düzeltme turlarının sürümleriyle çalışır |
| 3D/HDRI/font varlık türlerinin içe aktarılması | Pipeline kullanınca | Builder prosedürel; tüketici yok |
| Otomatik güvenli alan ölçümü (ekran görüntüsünden) | — | Y16 |
| Medya dosyalarının yedeği | Kullanıcının disk yedeği | Y9 (içerik adresli, büyük; manifest dökümde) |
| Canlı veritabanının üzerine geri yükleme | — | Y9 (yalnızca yeni veritabanına) |
| Ekranda URL + kod ile Claude girişi | v1.1 | §13.1 |
| Direct Post, gizli önizleme | TikTok audit'i | M6 Y2, Y10 |
| Y20'deki Minor'lar | — | Y20 |

## Global Constraints

- **Ücretli API yok; M7'de Claude kullanımı bulutta sıfır.** Testler Fake sürücülerle; gerçek haiku turu yalnızca `test:smoke:real`'de ve yalnızca makinede.
- **`npm test` ağsızdır ve ≤ 270 sn kalır** (Y3); her görevden sonra süre ledger'a.
- **Silme yalnızca onayla ve audit'le** (§11.3): blob silme (Y10), varlık iptali (Y8), yedek döndürme (Y9). Audit tablosu ve tetikleyicisi değişmez; yalnızca indeks eklenir.
- **Gizli bilgiler:** audit detay ucu araç girdisini `redactSecretKeys`'ten geçirir; `secrets/` altı hiçbir uçtan okunmaz (`/api/blobs` yalnızca `blobs` tablosundaki sha'ları sunar); yedek komutunun parolası log'a ve audit'e girmez; yedek dosyaları 0600. Testler bunu arar (T2, T6).
- **Durum yalnızca koşullu SQL ile ilerler** (`maintenance_runs`, `revokeAsset`); her geçiş audit'e yazılır.
- **Migration 0010 tek ve geri alınmaz.**
- **Arayüz:** metinler Türkçe; font ağırlıkları 400/500; tek vurgu rengi teal `#016a71`; yeşil ve kırmızı yalnızca başarı ve hata için; okuma görünümleri 900 px. Yeni `data-testid`'ler: `audit-page`, `audit-row`, `audit-detail`, `chain-status`, `library-detail`, `versions-list`, `compare-view`, `round-chip`, `assets-page`, `asset-row`, `asset-add`, `asset-revoke`, `data-status`, `safe-area-section`. `frontend-design:frontend-design` yüklüyse kullanılır.
- **Commit:** yazar ve committer `Alper Ekmekci <alper.ekmekci54@gmail.com>` (env ile). Mesajın son satırları `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ve oturumun `Claude-Session:` satırı (oturum talimatı); başka yerde model adı yok. Görev başına bir commit; düzeltmeler commit'ten önce (fixup ve force-push yok).
- **Doğrulama:** her görevde `npm run typecheck && npm test` ve beklenen sayı; arayüz görevlerinde (T3, T4, T5, T7, T8, T11, T12) ayrıca `npm run test:smoke`; render dosyası ekleyen görevde (T8) `VG_REMOTION_GL=swangle npx vitest run -c vitest.render.config.ts <yeni dosya>`.
- **Süreçler:** başlatılan her sunucu PID ile durdurulur; `pkill -f` yok; Playwright yalnızca `channel:'chrome'`. Bulutta smoke için PATH'e scratchpad'de `nvidia-smi` taklidi konur (M6 defteri T8; `5800` basar).

## Review Focus

1. **Yanlış silme.**
   - Durumlar: bir blob'a yalnızca bir jsonb sütununda başvuruluyor; bir run blob'u yazdı ama artefakt satırı henüz yok; eski, referanssız bir blob silinirken `putBlob` onu yeniden kullanıyor; rapor ile silme arasında yeni bir başvuru oluştu; yedek yok; iki silme isteği aynı anda.
   - Beklenen: korumacı referans kümesi + `touched_at` 7 gün penceresi; blob kilidiyle `putBlob`/silme sıralaması; silme anında yeniden denetim; FK ihlali atlanır; dosya 7 gün çöp kutusunda; yedeksiz ve 24 saatten eski raporla silme yok; tek bakım işi (kısmi benzersiz indeks); her silme audit'te; yetim dosyalar silinmez.
   - Testler: T7 "gc report: …", T7 "gc delete: …", T7 "putBlob racing gc …", T7 "orphan report: …", T7 "POST /api/maintenance/gc …".
2. **Yedeğin gerçekten geri yüklenebilmesi ve sızıntı.**
   - Beklenen: sürüm uyuşmazlığı fark edilir; döküm sahip rolüyle ve `drizzle` şeması dahil alınır; docker yolunda konteyner içi bağlantı; yeni bir veritabanına geri yüklenir ve `audit_verify` geçer; 7 dosya kalır; başarısız yedek eskileri silmez; parola log'da/audit'te yok; dosya 0600.
   - Testler: T6 "resolvePgDump: …", T6 "backup round trip: …", T6 "schedule: …".
3. **Audit gezgininin doğruluğu ve sızıntısı.**
   - Beklenen: süzgeçler yalnızca eşleşen satırları ve imleçle eksiksiz sayfaları döndürür (atlanan ya da yinelenen satır yok); video süzgeci run ve oturum satırlarını içerir; detay ucu gizli anahtarları redakte eder ve boyut sınırını uygular; zincir rozeti bozuk zinciri gösterir.
   - Testler: T2 "listAudit: …", T2 "auditDetail: …", T2 "GET /api/audit …", T3 "auditView: …".
4. **Lisans iptalinin her yolda geçerli olması.**
   - Beklenen: iptal edilen müzik/SFX yeni compose'da, fixer'ın ses planında, ön kontrolde ve yayında reddedilir; iptal edilen ses örneği ön kontrolde ve `voice` adımında reddedilir, anlatıcı ayarındaysa ayar hazır sese döner; mevcut finaller değişmez; iptal geri alınmaz ve audit'lidir.
   - Testler: T5 "revokeAsset: …", T5 "a revoked asset is refused by compose, the fixer, the voice step and publish …".
5. **Sürüm ve tur tutarlılığı.**
   - Beklenen: sürüm listesindeki puan o sürümün orkestratör satırından; finaller o sürümün artefaktlarından; Karşılaştır'daki iki oynatıcı aynı zamanda kalır; tur seçici eski turu doğru reviewer kartlarıyla gösterir.
   - Testler: T4 "GET /api/videos/:id/versions …", T4 "compareView …", T4 "panelView with a round …".
6. **Paralel testlerin kararlılığı.**
   - Beklenen: üç ardışık yeşil; paylaşılan yol/port yok; şablon yarım kurulumda geçerli sayılmaz, eşzamanlı kopyalar kilitli; test gerçek `vg_tpl_*`'a dokunmaz.
   - Testler: T1 "templates: …"; ledger'da üç koşunun süresi.

---
## Başlarken (yürütücü)

- **Dal:** oturumun dalı (`claude/elegant-keller-bgsue7`). Başlangıç: `npm run db:migrate && npm run typecheck && npm test` → `Tests 462 passed`.
- **Ledger:** `.superpowers/sdd/2026-10-08-m7-hardening/progress.md` (ilk satır bu planın yolu); sapmalar `Ruling:` satırlarıyla; her görevden sonra sayı ve süre.
- **Önce oku:** bu planın Karar kaydı; `packages/db/src/audit.ts`, `0001_audit_chain.sql:50–63`, `0002_audit_canonical.sql`; `apps/worker/src/publish/service.ts` (zamanlayıcı ve kurtarma deseni); `apps/worker/src/media.ts`, `apps/worker/src/assets.ts`; `apps/web/src/lib/production-view.ts`, `components/production/ReviewPanel.tsx`, `DraftTabs.tsx`; `tests/smoke/stack.mjs`.
- **Ortam tuzakları:**
  - Postgres Docker içinde 5433'te (`docker compose`); `npm run db:migrate` önce. Konak `pg_dump` 16, sunucu 17 (P3).
  - `test:render` GPU'suz makinede `VG_REMOTION_GL=swangle` ister; Blender'lı 5 test burada koşmaz (beklenen).
  - Smoke'ta `nvidia-smi` taklidi PATH'te olmalı; yoksa build/voice adımları `waiting_gpu`'da kalır.
- **Step 1 komutları:** her görevde başarısız testler `npx vitest run <görevin test dosyaları>` ile koşulur; beklenen FAIL (modül ya da işlev yok, ya da yeni beklenti karşılanmıyor). Sonra tam paket.

---
### Task 1: `npm test` süresi — şablon veritabanı, paralel dosyalar

**Files:**
- Create: `packages/db/test/global-setup.ts` (şablonu kurar), `packages/db/test/helpers.test.ts`, `bin/db-test-clean.mjs`.
- Modify: `vitest.config.ts` (`fileParallelism`, `maxWorkers`, `globalSetup`), `packages/db/test/helpers.ts`, kök `package.json` (`db:test-clean`), ağır dosyaların zaman aşımları (Y2), gerekirse paylaşılan yol/port kullanan test dosyaları.

**Interfaces:**
- `templateName(migrationsDir, prefix = 'vg_tpl_') → string` (önek + klasördeki `.sql` dosyalarının ve `meta/_journal.json`'un sha256'sının ilk 12 hanesi).
- `ensureTemplate(adminUrl, o?: { migrationsDir?; prefix? }) → string` (yoksa `<ad>_building`'e kurar ve yeniden adlandırır; varsa dokunmaz; artık `_building` siler; başka şablon silmez; kurulum admin bağlantısında `pg_advisory_lock` altında).
- `createTestDb()` imzası değişmez; `CREATE DATABASE … TEMPLATE` aynı kilit altında, 55006'da bir kez bekleyip yeniden dener; şablon yoksa bugünkü yol.

**Bakılacak yerler:** `packages/db/test/helpers.ts:12–48`, `packages/db/src/migrate.ts` (`MIGRATIONS_DIR`), `vitest.config.ts`, `apps/worker/test/qc-step.test.ts:17,33,46`, `apps/worker/test/e2e-helpers.ts:20`, `final-helpers.ts:26`. Paylaşım taraması: `rg -n "tmpdir\(\)|/tmp/|listen\((?!0)|:5180|:5190|videogen-data" apps packages --glob '*test*'`.

- [ ] **Step 1: Başarısız test** — `helpers.test.ts`, 1 test: "templates: a database created from the template has every table, the app role grants and the audit trigger; migrations run once per template name; a half-built `_building` template is never used; three concurrent creates from one template all succeed; a changed migration set gives a new name" — test geçici bir migration klasörü ve `vg_tpltest_` öneki kullanır, gerçek `vg_tpl_*`'a dokunmaz, sonunda kendi veritabanlarını siler. Run: `npx vitest run packages/db/test/helpers.test.ts`. Expected: FAIL (`templateName` yok).
- [ ] **Step 2: Uygula** önce şablon, sonra paralellik (Y2 sırası). Paylaşım taramasının bulgularını ledger'a yaz (yoksa "bulunmadı"); M5c H18 ile ilgili `Ruling:` satırı (e2e `npm test`'te kalır).
- [ ] **Step 3: Doğrula:** `npm run typecheck`; `npm test` **üç kez ardışık** → her biri `Tests 463 passed`, süreler ledger'a, en yavaşı ≤ 240 sn (Y2). `VG_TEST_WORKERS=1 npx vitest run packages/db/test` da geçer (seri yol bozulmadı); `npm run db:test-clean` artıkları siler.
- [ ] **Step 4: Commit:** `test: npm test runs files in parallel on databases copied from a migrated template`.

---
### Task 2: Migration 0010 ve audit sorgu katmanı, audit uçları

**Files:**
- Create: `packages/db/drizzle/0010_hardening.sql` (+ drizzle meta), `packages/db/src/audit-query.ts`, `packages/db/test/audit-query.test.ts`, `apps/api/src/routes/audit.ts`, `apps/api/test/audit.test.ts`.
- Modify: `packages/db/src/schema.ts` (indeksler; `assets` alanları; `maintenance_runs`), `packages/db/src/index.ts`, `apps/api/src/app.ts` (`:68` doğrulama ucu `routes/audit.ts`'e taşınır), `packages/shared/src/` (`AuditRow`, `AuditFilter`, `AuditDetail` tipleri; `browser.ts`).

**Interfaces:**
- `listAudit(db, f: { runId?; videoId?; sessionId?; role?; action?; from?; to?; before?; limit? }) → { rows: AuditRow[]; nextBefore: number | null }`. `action` `*` ile biterse önek. `nextBefore` yalnızca daha eski satır varsa.
- `auditActions(db) → { action; n }[]`.
- `auditDetail(db, seq) → { row; links: { session?; tool?; artifact?; file? } } | null` (Y5 sınırları).
- `verifyAuditTimed(db) → { ok; checked; firstBadSeq; lastSeq; checkedAt; ms }`.
- Uçlar Y5'teki gibi; geçersiz sorgu (bozuk tarih, `limit` > 200, uuid olmayan run) 400 + Türkçe gerekçe.

**Bakılacak yerler:** `packages/db/src/audit.ts:35–72`, `0001_audit_chain.sql:50–63`, `packages/db/src/agents.ts:140–149` (`agent_events`), `schema.ts:4–24,65–102`, `apps/worker/src/agents/runner.ts:214–227` (satırların taşıdığı bağlar), `apps/api/src/routes/videos.ts` (uç ve doğrulama deseni), `0009_publish.sql:48–49` (REVOKE deseni).

- [ ] **Step 1: Başarısız testler** — 5 test:
  - `audit-query.test.ts`:
    1. "listAudit: run, video (its runs and their sessions included), session, role, exact and prefix action and a date range each return only matching rows, newest first; paging with nextBefore visits every row exactly once; 5000 rows filtered by video in under 200 ms".
    2. "auditDetail: a tool row links its session (role, model, transcript sha) and the tool input from agent_events by tool_use_id with secret keys redacted and long strings cut at 4000 chars; a file_write row carries path and both shas; an artifact.created row links the artifact; an unknown seq is null".
    3. "migration 0010: the audit indexes exist, the trigger and the chain are untouched (verify ok after inserts), the app role still cannot update audit_log and cannot delete maintenance_runs; assets carry revoked_at and revoke_reason".
  - `audit.test.ts`:
    4. "GET /api/audit filters and pages, rejects a bad date, a limit over 200 and a non-uuid run with a Turkish reason; GET /api/audit/actions lists action counts; a non-local Host is refused".
    5. "GET /api/audit/verify reports ok, checked, lastSeq, checkedAt and ms, and firstBadSeq after tampering (owner bypass as in audit.test.ts:29); GET /api/audit/:seq returns the detail and never a value under a secret-like key".

  Run: `npx vitest run packages/db/test/audit-query.test.ts apps/api/test/audit.test.ts`. Expected: FAIL.
- [ ] **Step 2: Uygula.** 0010 Y4'ün tamamını içerir (T5–T7'nin şeması burada; o görevler migration eklemez).
- [ ] **Step 3:** `npm run db:migrate`; `npm run typecheck && npm test` → `Tests 468 passed`; süre ledger'a.
- [ ] **Step 4: Commit:** `feat(db,api): migration 0010 and audit queries — filters with a stable cursor, row detail with the tool input and links, timed chain verification`.

---
### Task 3: Audit gezgini arayüzü

**Files:**
- Create: `apps/web/src/routes/Audit.tsx`, `apps/web/src/components/audit/{AuditTable,AuditDetail,ChainStatus,AuditFilters}.tsx`, `apps/web/src/lib/audit-view.ts`, `apps/web/test/audit-view.test.ts`.
- Modify: `apps/web/src/main.tsx:69` (sayfa seçimi), `apps/web/src/lib/router.ts` (sorgu dizesini koruyan `go`), `components/NavRail.tsx:4` (`enabled: true`), `apps/web/src/lib/api.ts`.

**Interfaces:**
- `auditView(rows, now) → { rows: { seq; time; actor; action; subject; summary; tone: 'neutral'|'ok'|'warn'|'error' }[] }` (`*.failed`, `*.rejected`, `*.refused` → `error`; `*.cancel*` → `warn`).
- `chainView(v | null, error?) → { text; tone; detail }` ("Zincir geçerli · 12 345 satır · 10:42", "Zincir bozuk: satır 812", "Doğrulanamadı").
- `filterFromQuery(search) ↔ queryFromFilter(f)` (URL ile süzgeç).
- `toolInputView(tool, input) → { kind: 'edit'; path; before; after } | { kind: 'write'; path; content } | { kind: 'json'; text }`.

**Bakılacak yerler:** `apps/web/src/routes/Settings.tsx` (sayfa iskeleti, 900 px), `components/thinking/TraceView.tsx` (iz gösterimi), `components/production/ArtifactCards.tsx` (artefakt okuma), `lib/router.ts:3–11`.

- [ ] **Step 1: Başarısız testler** — `audit-view.test.ts`, 2 test:
  1. "auditView and chainView: rows read 'saat · aktör · eylem · konu' in Turkish with tones for failed, rejected and cancelled actions; the chain badge says valid with the count and time, broken with the first bad row, and unknown on an error".
  2. "filters round-trip through the URL (run, video, role, action prefix, dates); toolInputView turns an Edit into before/after columns, a Write into its content and anything else into pretty JSON".
- [ ] **Step 2: Uygula** (Y6).
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 470 passed`; `npm run test:smoke` → 21/15 bozulmaz.
- [ ] **Step 4: Commit:** `feat(web): audit explorer — filters in the URL, chain status, row detail with the raw row, tool input diff, transcript, artifact and trace`.

---
### Task 4: Sürümler — uç, kütüphane detay sayfası, Karşılaştır, tur seçici, Review'lar sekmesi

**Files:**
- Create: `packages/db/src/versions.ts`, `apps/api/test/versions.test.ts`, `apps/web/src/routes/LibraryDetail.tsx`, `apps/web/src/components/library/{VersionList,CompareView,DetailTabs}.tsx`, `apps/web/src/lib/compare-view.ts`, `apps/web/test/compare-view.test.ts`.
- Modify: `apps/api/src/routes/videos.ts` (`versions`, `reviews?version`), `packages/shared/src/pipeline.ts` (`VersionView`), `apps/web/src/routes/Library.tsx:36` (satır detaya gider), `apps/web/src/main.tsx`, `apps/web/src/lib/production-view.ts` (`panelView` `round` parametresi, `playerTabs` `compare`), `components/production/ReviewPanel.tsx` (tur çipleri), `DraftTabs.tsx` (Karşılaştır sekmesi), `apps/web/src/lib/api.ts`.

**Interfaces:**
- `listVersions(db, videoId) → VersionView[]` (Y7 alanları; puan o sürümün `reviewer_role='orchestrator'` en yüksek `seq` satırından; finaller `artifacts.version_id`'ye göre en yeni `final_video_music`/`final_video_tiktok`/`final_cover`; `published` = o sürümün `published` bir yayın satırı).
- `compareView(versions, aId, bId, variant) → { a; b; delta: { total; dims: { id; a; b }[] } ; canCompare; reason? }`.
- `syncPlan(aTime, bTime) → { seekB?: number }` (sapma > 0,15 sn).
- `panelView(all, runId?, round?)`; `PanelView.rounds: number[]`.

**Bakılacak yerler:** `packages/db/src/pipeline.ts:133–182` (`VIDEO_SQL`, en iyi sürüm tercihi), `reviews.ts:85–98`, `production-view.ts:100–106,125–183`, `ReviewPanel.tsx:39–50`, `DraftTabs.tsx:9–67` (`Mp4`, `FinalPanel`), `components/publish/PublishPanel.tsx`, `components/production/ArtifactCards.tsx`.

- [ ] **Step 1: Başarısız testler** — 4 test:
  - `versions.test.ts`:
    1. "GET /api/videos/:id/versions lists the produce version and each fix round with reason, the orchestrator total of that version, its own finals, best, current and published flags; a version without a final is listed as unfinished; 404 for an unknown video".
    2. "GET /api/videos/:id/reviews?version= returns only that version's rounds; a version of another video is 400".
  - `compare-view.test.ts`:
    3. "compareView: picks best vs the previous version by default, shows the score and per-dimension deltas, refuses a version without a final with a Turkish reason; syncPlan seeks B only when it drifts more than 0.15 s".
    4. "panelView with a round: shows that round's reviewers, gates and auto findings; rounds lists every round of the run; without a round it is the newest (unchanged behaviour)".
- [ ] **Step 2: Uygula** (Y7). Kütüphane satırı `/library/<id>`'ye gider; S2'nin "kütüphanede video oynar" adımları detay sayfasının Sürümler sekmesinde oynayan finalle çalışmaya devam etmeli (smoke testleri gerekiyorsa yalnızca seçici açısından güncellenir; beklenti değişmez, ledger'a `Ruling:`).
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 474 passed`; `npm run test:smoke` → 21/15.
- [ ] **Step 4: Commit:** `feat(api,web): library detail with versions, side-by-side and A/B compare, round picker and reviews, storyboard, research, audit and publish tabs`.

---
### Task 5: Varlık defteri — iptal, yükleme, uçlar, CLI, arayüz

**Files:**
- Create: `packages/db/src/media.ts` (taşınan `putBlob`, `importAsset` çekirdeği), `packages/db/test/assets.test.ts` (yoksa; varsa genişletilir), `apps/api/src/routes/assets.ts`, `apps/api/test/assets.test.ts`, `apps/web/src/routes/Assets.tsx`, `apps/web/src/components/assets/{AssetTable,AssetAddForm}.tsx`, `apps/web/src/lib/assets-view.ts`, `apps/web/test/assets-view.test.ts`.
- Modify: `packages/db/src/assets.ts` (`revokeAsset`, iptal alanları, kullanım sayısı), `packages/db/src/voice.ts` (iptalde anlatıcı sıfırlama), `apps/worker/src/media.ts` ve `apps/worker/src/assets.ts` (yeniden dışa aktarım), `apps/worker/src/pipeline/voice-step.ts:48`, `apps/worker/src/pipeline/preflight.ts:37`, `bin/assets.mjs` (`revoke`), `apps/api/src/app.ts`, `components/NavRail.tsx:5`, `apps/web/src/main.tsx`, `apps/web/src/lib/api.ts`.

**Interfaces:**
- `revokeAsset(db, id, reason) → AssetRecord | null` (koşullu; `allowed = false`, `revoked_at`, `revoke_reason`, `updated_at`).
- `assetUsage(db) → Map<assetId, number>`.
- Uçlar Y8'deki gibi. Yükleme: Fastify `addContentTypeParser('application/octet-stream', { bodyLimit: 200 MiB })` akışla dosyaya yazar (belleğe almaz); yazma uçları yerel Origin ister (`guard.ts:12`).
- `assetsView(list, kind) → { rows: { id; title; licenseLabel; tone; attribution; author; source; duration; used; revoked }[]; counts }`; `addFormErrors(f) → string[]` (CC-BY'de atıf, lisans metni, başlık, dosya zorunlu).

**Bakılacak yerler:** `apps/worker/src/assets.ts:27–46`, `apps/worker/src/media.ts:8–48`, `packages/shared/src/assets.ts:6–24`, `bin/assets.mjs:12–22`, `apps/worker/src/pipeline/sound.ts:41–112`, `fixer.ts:85–95,139`, `preflight.ts:25`, `voice-step.ts:48`, `apps/api/src/routes/voice.ts:20,43–44` (anlatıcı sesi seçiminde lisans denetimi), `packages/shared/src/publish.ts:94–103`.

- [ ] **Step 1: Başarısız testler** — 5 test:
  - `packages/db/test/assets.test.ts`:
    1. "revokeAsset: sets allowed false with the time and reason once (a second revoke returns null), lists the revocation, and assetUsage counts versions whose audio plan uses the asset".
  - `apps/api/test/assets.test.ts`:
    2. "upload then import: a CC0 track is allowed, a CC-BY track without attribution is stored as rejected with the Turkish reason, a duplicate returns the stored verdict; a non-audio file, a disallowed extension, an upload over 200 MB, a non-uuid or unknown uploadId (path traversal) and a non-local Origin are refused; the upload file is removed after import".
    3. "GET /api/assets lists license fields, revocation and usage by kind; POST revoke audits asset.revoked with the reason; bin/assets.mjs revoke does the same and prints no path outside the data dir".
    4. "a revoked asset is refused by compose (sound plan), the fixer's audio check, the preflight music count and publish; a revoked voice reference is refused by the voice preflight and the voice step, and revoking the narrator's reference resets the narrator to the stock voice in the same transaction (audited); an existing final stays playable" (worker ve API fonksiyonları doğrudan çağrılır; tam run yok).
  - `assets-view.test.ts`:
    5. "assetsView and addFormErrors: license badges (CC0, CC-BY with attribution, Pixabay, rejected, revoked), usage counts, attribution required for CC-BY and the license text always".
- [ ] **Step 2: Uygula** (Y8).
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 479 passed`; `npm run test:smoke` → 21/15 (smoke yığını CC0 yatağını `bin/assets.mjs` ile içe aktarmaya devam eder, `stack.mjs:85–88`).
- [ ] **Step 4: Commit:** `feat(assets): ledger page with license fields, preview, upload and import from the UI, revocation honoured by compose, fixer, voice and publish`.

---
### Task 6: Yedek — `MaintenanceService`, `pg_dump` çözücüsü, döndürme, geri yükleme CLI'ı

**Files:**
- Create: `apps/worker/src/maintenance/{service,backup,pgdump}.ts`, `apps/worker/test/backup.test.ts`, `bin/backup.mjs`, `packages/db/src/maintenance.ts`.
- Modify: `apps/worker/src/main.ts` (oluşturma, `recover()` `publisher.recover`'dan sonra `:144`, `stop()` kapanışta `:150–164`, komut `maintenance.run`), `packages/shared/src/config.ts` (`VG_PG_DUMP`, `VG_PG_RESTORE`, `VG_PG_CONTAINER`, `VG_BACKUP_KEEP` = 7, `VG_MAINTENANCE_MS` = 3 600 000), `packages/db/src/index.ts`.

**Interfaces:**
- `resolvePgDump(o: { env; serverMajor; run }) → { argv: string[]; via: 'custom'|'host'|'docker'; env } | { error: string }` (`run` enjekte; testte sahte ikililer).
- `takeBackup(deps, now) → { file; bytes; ms; via }` (Y9 dosya kuralları), `pruneBackups(dir, keep) → string[]`.
- `MaintenanceService(deps: { pool; dataDir; config; clock?; audit; run? })`: `recover()` (yarım `running` → `failed`; zamanlayıcı), `tick()` (günlük yedek; T7'de haftalık rapor), `runNow(kind)`, `stop()`. Tek bakım işi kilidi.
- `startMaintenance(db, kind) → id | null` (koşullu: `running` satırı yoksa), `finishMaintenance(db, id, status, detail)`, `latestMaintenance(db, kind)`.
- `bin/backup.mjs restore <dosya> --into <ad>`: ad `^[a-z][a-z0-9_]{2,40}$`, var olan veritabanı → çıkış 2 + Türkçe mesaj.

**Bakılacak yerler:** `apps/worker/src/publish/service.ts:80–101` (zamanlayıcı, `unref`, `stop`), `apps/worker/src/main.ts:106–167`, `apps/worker/src/render/process.ts` ya da `runProcess` (süreç grubu, zaman aşımı), `packages/db/test/helpers.ts` (test DB URL'leri), runbook §6 "Elle yedek" satırı.

- [ ] **Step 1: Başarısız testler** — `backup.test.ts`, 4 test:
  1. "resolvePgDump: VG_PG_DUMP wins; a host pg_dump of the server's major version is used with the owner URL; a mismatched host falls back to docker exec with -h localhost -p 5432 -U/-d and PGPASSWORD in the env, never in argv; neither gives the Turkish 'pg_dump 16, sunucu 17' reason; pg_restore resolves the same way" (sahte ikililer).
  2. "backup round trip: the test database is dumped through the resolved command as the owner (the drizzle schema included), streamed to a 0600 file in a 0700 dir via .tmp + rename; bin/backup.mjs restore loads it into a new database where audit_verify is ok, the migration table and row counts match; restoring into an existing database exits 2".
  3. "rotation keeps the newest 7 dumps after a success and deletes none after a failure; backup.created / backup.failed / backup.pruned are audited without the password or the connection string".
  4. "schedule: one backup per local day (a second tick the same day does nothing, the next day takes one); a half-finished running row is failed on recover with 'worker yeniden başladı'; two runNow calls at once start one job" (sahte saat).
- [ ] **Step 2: Uygula** (Y9).
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 483 passed`; süre ledger'a (gerçek `pg_dump` testi küçük bir test DB'siyle birkaç saniye).
- [ ] **Step 4: Commit:** `feat(worker): daily pg_dump backups with a version-checked dump command, 7-day rotation and a restore CLI that only loads into a new database`.

---
### Task 7: Blob çöp toplama, yetim raporu, Ayarlar "Veri ve yedek", footer diski

**Files:**
- Create: `apps/worker/src/maintenance/{gc,orphans,trash}.ts`, `bin/maintenance.mjs` (`report`, `gc-report`, `orphans`, `restore-blob <sha>`), `apps/worker/test/storage.test.ts`, `apps/api/src/routes/maintenance.ts`, `apps/api/test/maintenance.test.ts`, `apps/web/src/components/settings/DataSection.tsx`, `apps/web/src/lib/maintenance-view.ts`, `apps/web/test/maintenance-view.test.ts`.
- Modify: `packages/db/src/media.ts` ve `packages/db/src/blobs.ts` (`putBlob` upsert + `touched_at` + paylaşımlı blob kilidi, Y10), `apps/worker/src/maintenance/service.ts` (haftalık rapor, saatlik yükleme ve çöp kutusu süpürmesi, komutlar), `packages/db/src/maintenance.ts`, `apps/api/src/app.ts`, `apps/web/src/routes/Settings.tsx`, `components/UsageFooter.tsx` (disk), `apps/web/src/lib/api.ts`.

**Interfaces:**
- `referencedShas(db) → Set<string>` (Y10 kümesi; jsonb sütun listesi `information_schema`'dan; tarama `jsonb_path_query(…, 'strict $.**')` ya da metin üzerinde `[0-9a-f]{64}`; yürütücü ölçülü olanı seçer, test aynı).
- `withBlobLock(db, sha, mode: 'shared'|'exclusive', fn)`; `trashBlob(dataDir, blob) → trashPath`, `purgeTrash(dataDir, now, days = 7)`, `restoreBlob(deps, sha)`.
- `gcReport(deps, now) → { id; candidates: { sha; bytes; mime; createdAt }[]; bytes }`, `gcDelete(deps, { reportId; confirm }) → { deleted; skipped; bytes }` (Y10 şartları).
- `orphanReport(deps) → { diskOnly: string[]; dbOnly: string[]; sizeMismatch: string[]; strayRunDirs: string[]; uploadsRemoved: number }`.
- `GET /api/maintenance` → `{ dataDir; diskFreeMb; dbBytes; mediaBytes; backup: {lastAt, bytes, via, ok, error, count}; gc: {reportId, at, candidates, bytes} | null; orphans: {...} | null; running: kind | null }`; `POST /api/maintenance/{backup|gc-report|orphans}` → 202; `POST /api/maintenance/gc {reportId, confirm}` → 200 sonuç | 409 Türkçe (rapor eski, yedek yok, onay sayısı tutmuyor, iş sürüyor).
- `dataView(m) → { lines; backupTone; canDelete; deleteLabel: "142 dosya · 1,8 GB sil" }`, `diskLabel(mb) → { text; tone }`.

**Bakılacak yerler:** Gerçek arayüzler "Depolama" (beş sütun, meta sha'ları), `apps/worker/src/render/frames.ts:33–60` (silme + audit deseni), `apps/worker/src/pipeline/resources.ts:58` (`statfs`), `routes/Settings.tsx:66–69`, `components/settings/NarratorVoiceSection.tsx` (bölüm deseni).

- [ ] **Step 1: Başarısız testler** — 7 test:
  - `storage.test.ts`:
    1. "gc report: a blob referenced only by artifacts.meta (glbSha, stemSha, voiceStemSha, musicSha), by any other jsonb column, by a transcript, a publication, an asset or its license text, by an active run, or touched in the last 7 days is never a candidate; an old unreferenced blob is; a new *sha* text column not wired into the reference set fails the schema guard".
    2. "gc delete: refused without a backup in the last 24 h, with a report older than 24 h or a wrong confirm count; otherwise deletes the row and moves the file to trash/<date>/, skips a blob that gained a reference after the report, audits blob.deleted in groups and leaves FK-referenced rows; trash older than 7 days is purged; restore-blob brings a trashed blob back".
    3. "putBlob racing gc: an old unreferenced blob that putBlob re-uses while gcDelete runs ends with its row and its file (either the delete is skipped or the file is rewritten); no row without a file and no file without a row".
    4. "orphan report: disk-only files, db-only rows, size mismatches and run dirs without a run are reported and never deleted; upload leftovers older than 1 h are removed".
  - `maintenance.test.ts`:
    5. "GET /api/maintenance reports the data dir, free disk, db and media sizes, the last backup and the latest reports; POST backup / gc-report / orphans send maintenance.run and return 202; a non-local Origin is refused".
    6. "POST /api/maintenance/gc returns the Turkish 409 reasons (old report, no backup, wrong count, a job running) and deletes with a valid confirm".
  - `maintenance-view.test.ts`:
    7. "dataView and diskLabel: backup tone (ok, old, failed, never), delete label with count and size, disabled without a fresh backup; disk warns under 10 GB and is red under 3 GB".
- [ ] **Step 2: Uygula** (Y10, Y11).
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 490 passed`; `npm run test:smoke` → 21/15.
- [ ] **Step 4: Commit:** `feat(maintenance): weekly blob GC report with confirmed deletion after a fresh backup, orphan file report, data and backup status in Settings, free disk in the footer`.

---
### Task 8: Güvenli alan — tek kaynak, ayar, manifest, kalibrasyon kartı, `renderStill`

**Files:**
- Create: `packages/shared/src/safe-area.ts`, `packages/shared/test/safe-area.test.ts`, `apps/api/src/routes/safe-area.ts`, `apps/api/test/safe-area.test.ts`, `packages/remotion/src/SafeAreaCard.tsx` (+ kompozisyon kaydı), `bin/safe-area.mjs`, `apps/web/src/components/settings/SafeAreaSection.tsx`, `apps/worker/test-render/safe-area-card.int.test.ts`.
- Modify: `packages/remotion/src/props.ts:54–58` (`safeRect(width, height, area?)`), `packages/remotion/src/layout.ts:37–46` (manifest `safeArea`), `packages/remotion/src/render.ts` (`renderStill`), `apps/worker/src/render/ffmpeg.ts:11–16` (filtre fonksiyonu), `apps/worker/src/render/qc.ts:131`, `apps/worker/src/pipeline/final-steps.ts` (compose: ayarı okur, props + manifest + `inputHash`; qc: manifest değeri), `packages/db/src/` (`getSafeArea`/`setSafeArea`, desen `voice.ts:6,12`), `packages/shared/src/index.ts`, `browser.ts`, `apps/api/src/app.ts`, `routes/Settings.tsx`.

**Interfaces:**
- `DEFAULT_SAFE_AREA`, `SafeAreaSchema`, `scaleSafeArea(a, w, h) → {top; bottom; right; left}` (piksel, yuvarlanmış), `safeAreaWarnings(a) → string[]` (varsayılandan > 150 px sapma).
- `GET /api/safe-area` → `{area, source, measuredAt, note, warnings}`; `PUT /api/safe-area {area, note?}` (doğrulama, audit `settings.safe_area`); `DELETE`-siz "Varsayılana dön" = `PUT {reset: true}`.
- `renderStill(o: { composition; props; frame; out; gl? }) → { out; ms }` (`@remotion/renderer` 4.0.533 `renderStill`; `render.ts:17`'deki `CHROME` seçenekleri ve `chromeMode` aynen).
- `bin/safe-area.mjs card [--out <dir>]` → MP4 + PNG yolu; `show`; `set --top --bottom --right --left [--note]`.

**Bakılacak yerler:** Gerçek arayüzler "Güvenli alan" (dört yer), `packages/shared/src/qc.ts:100–101`, `final-steps.ts:211,313`, `packages/remotion/src/render.ts:15–18,100–112` (GL kipi, render deseni), `packages/remotion/src/render-cli.ts:14`, `packages/shared/src/voice.ts:131` (VO bandı iki satır: G6'ya bağlı).

- [ ] **Step 1: Başarısız testler** — 3 `npm test` + 1 `test:render`:
  - `safe-area.test.ts`:
    1. "SafeAreaSchema and scaleSafeArea: the default is 150/1510/130/24 at 1080×1920 and scales to 540×960; impossible areas are refused; warnings flag a value more than 150 px from the default".
    2. "one source: safeRect, layoutIssues (from the manifest's safeArea, the default for an old manifest), the contact sheet filter and the qc edge bands all move together when the area changes" (her tüketici değiştirilmiş bir alanla çağrılır).
  - `apps/api/test/safe-area.test.ts`:
    3. "GET/PUT /api/safe-area validates, stores source and note, audits settings.safe_area, resets to the default; compose's input hash changes with the area so an old final is not reused" (compose `inputHash` fonksiyonu doğrudan).
  - `safe-area-card.int.test.ts` (render): 4. "the calibration card renders through renderStill to a 1080×1920 PNG and a 5 s MP4 with the rulers" (`VG_REMOTION_GL=swangle`).
- [ ] **Step 2: Uygula** (Y15–Y17). Ayarlar bölümü dört sayı + kaynak + not + "Kalibrasyon kartı nasıl kullanılır" yönergesi (Y16 metni) + "Varsayılana dön".
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 493 passed`; `VG_REMOTION_GL=swangle npx vitest run -c vitest.render.config.ts apps/worker/test-render/safe-area-card.int.test.ts` → 1 passed; `npm run test:smoke` → 21/15 (S2'nin G6 davranışı varsayılanla aynı).
- [ ] **Step 4: Commit:** `feat(safe-area): one calibrated safe area for layout, G6, contact sheets and qc, stored in the layout manifest; calibration card via a Remotion still`.

---
### Task 9: `test:smoke:real` profili

**Files:**
- Create: `bin/smoke-real.ts`, `apps/worker/src/real/{profile,steps}.ts`, `apps/worker/test/smoke-real.test.ts`.
- Modify: kök `package.json` (`"test:smoke:real": "node --import tsx bin/smoke-real.ts"`).

**Interfaces:**
- `RealStep { id: 1..6; title_tr; run(ctx) → { status: 'pass'|'fail'|'skip'; ms; evidence: Record<string, unknown>; reason? } }`.
- `runProfile(steps, o: { only?; skip?; env; usage: () → Promise<{fiveHour: number}>; clock? }) → { results; exitCode }` (ön koşullar Y14).
- Ayrıştırıcılar (saf): `initEvidence(messages) → { apiKeySource; hookEvents }`, `usageEvidence(u) → {ok; reason?}`, `rendererEvidence(text) → { nvidia; renderer }`, `cerEvidence(result) → { cer; ok }`, `qcEvidence(checks) → { exit; missing: string[] }` (beklenen yedi: `d6_loudness`, `d6_lra`, `d6_first_audio`, `d6_silence`, `d3_freeze`, `g1_color`, `g6_edges`; `docs/m5/real-check.md:22–28`).
- Gerçek adımlar mevcut sınıfları kullanır: `ClaudeDriver`/SDK oturumu `spikes/m3/probe.mjs` ayarlarıyla (`settingSources: []`, `strictMcpConfig`), `SdkUsageSource`, `BlenderRenderDriver.stills`, `renderStill` (T8), `PythonAudioDriver.voice`, `probeQc` + `evaluateQc`.

**Bakılacak yerler:** `spikes/m3/probe.mjs:18–48`, `spikes/m0/lib.mjs:20–30`, `apps/worker/src/usage.ts:19–41`, `apps/worker/src/render/driver.ts:138–206`, `apps/worker/src/audio/driver.ts:80–135`, `apps/worker/src/render/qc-cli.ts`, `docs/m4/real-check.md` (geçici DB tarifi).

- [ ] **Step 1: Başarısız testler** — `smoke-real.test.ts`, 2 test:
  1. "runProfile: refuses with ANTHROPIC_API_KEY set or the 5 h window at 80 %; runs steps in order, honours --only and --skip, records ms and evidence, writes the JSON report and exits 1 on any fail" (sahte adımlar).
  2. "evidence parsers: apiKeySource 'none' and zero hook events pass, any hook event fails; usage percentages outside 0..100 fail; a non-NVIDIA renderer fails; CER above 5 % fails; qc passes only with exit 3 and all seven expected failures, naming the missing ones".
- [ ] **Step 2: Uygula** (Y14). Bulutta `npm run test:smoke:real -- --only 2` gibi bir koşu **yapılmaz** (gerçek kullanım okuması Claude oturumu açar); yalnızca `--help` ve ön koşul reddi elle denenir (`ANTHROPIC_API_KEY=x` → ret).
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 495 passed`.
- [ ] **Step 4: Commit:** `feat(test): test:smoke:real profile — isolated haiku turn, usage read, NVIDIA Blender stills, Remotion still, TTS with CER, qc on the pen pilot; JSON report`.

---
### Task 10: Ertelenenler — pipeline (G4 notu, vuruş kimliği, `review` bayatlığı, ses CLI sınırları, geri sarma)

**Files:**
- Modify: `packages/shared/src/fix-loop.ts:139–147` (`STOP_NOTE`, `LoopStop`), `apps/worker/src/pipeline/review-step.ts:133–145,221–227,256–261`, `apps/worker/src/pipeline/finalize-step.ts:47`, `apps/worker/src/pipeline/fixer.ts:132–150`, `apps/worker/src/pipeline/voice-step.ts:26–28` (`voKey` dışa aktarılır), `apps/worker/src/audio/driver.ts:63–64,123`, `packages/shared/src/config.ts:20,48–50`, `apps/worker/src/main.ts:56`, `apps/worker/src/pipeline/orchestrator.ts:371–376`.
- Test: `apps/worker/test/{review-step,fixer,orchestrator-draft}.test.ts`, `packages/shared/test/{fix-loop,config}.test.ts` (yeni `it`'ler).

**Interfaces:** Y18. `LoopStop` + `'no_voice_track'`; `StoredVerdict.g4Cause?: 'no_track'|'clone'`; `voKey(storyboard)` saf ve dışa aktarılmış; `AudioDriverOptions` config'ten.

- [ ] **Step 1: Başarısız testler** — 5 test:
  1. `review-step.test.ts`: "G4 without a voice track stops with 'seslendirme izi bulunamadı' (not the clone note); with a clone track the clone note stays; finalize shows the same note".
  2. `fixer.test.ts`: "in a VO video a fix that changes a beat id or its vo text outside a voice-scope round is refused with 'seslendirmeli videoda vuruş kimliklerini ve metinlerini değiştirme'; a voice-scope round may".
  3. `review-step.test.ts`: "review refuses a VO final whose voice track key or stem does not match the latest storyboard and the music final (stale artefact, §8.3)".
  4. `config.test.ts`: "VG_AUDIO_TIMEOUT_MS and VG_AUDIO_MAX_RSS_MB reach the audio driver; defaults stay 900 000 ms and 6000 MB; invalid values are refused at start".
  5. `orchestrator-draft.test.ts`: "a rewind that cannot be applied while the run still runs fails the step with 'geri sarma uygulanamadı' instead of leaving the run idle; a cancelled run stays cancelled".
  - Var olan beklenti değişikliği: `fix-loop.test.ts:111` (`STOP_NOTE` eşitliği) yeni anahtarla güncellenir (yeni test sayılmaz).
- [ ] **Step 2: Uygula** (Y18).
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 500 passed`.
- [ ] **Step 4: Commit:** `fix(pipeline): deferred findings — the G4 note without a voice track, beat ids locked outside voice rounds, voice-aware review staleness, audio CLI limits from config, a failed rewind no longer leaves the run idle`.

---
### Task 11: Ertelenenler — `fix_hint` şablonu, WebFetch sınırı, SSE yayın durumu, kısayollar

**Files:**
- Modify: `apps/worker/src/pipeline/fix-round.ts:69–86` (`findingRows`: `reviewer_facts` sahipli kontrollerde şablon ipucu), `apps/worker/src/pipeline/review-step.ts:292,315–333` (kanıttan claim id), `packages/claude/src/guard.ts:65,171–176` (`webAllow`), `apps/worker/src/agents/manager.ts` (oturum bağlamına hedefler), `packages/claude/src/roles.ts:35` (yalnızca belge yorumu), `apps/web/src/main.tsx:21–42` (SSE `publish.status`), `apps/web/src/components/publish/PublishPanel.tsx:23–28`, `apps/web/src/lib/player.ts:27`, `apps/web/src/main.tsx:51`.
- Test: `apps/worker/test/fixer.test.ts` ya da `fix-round.test.ts`, `packages/claude/test/guard.test.ts`, `apps/web/test/{publish-view,player}.test.ts`.

**Interfaces:** Y19. `factsHint(checkId, claimId | null) → string` (saf, shared); `GuardContext.webAllow?: string[]`; `urlAllowed(url, allow) → boolean` (normalleştirilmiş birebir eşitlik; şema `https`; ek sorgu ve parça yok); `liveInvalidation(event) → QueryKey | null` (web, saf); `shortcutFor` girdisi `shiftKey`, `repeat`, `isComposing`.

- [ ] **Step 1: Başarısız testler** — 4 test:
  1. "the fixer and the rework prompt get a templated hint for claims checks (check label, claim id) and never the reviewer's free text; other reviewers' hints are unchanged; the free text stays in findings for the panel".
  2. `guard.test.ts`: "reviewer_facts may WebFetch only its exact check targets after normalization; the same URL with an extra query or fragment, another path, http, or a look-alike host is denied with the reason, also inside a subagent call; researcher is not limited; WebSearch stays allowed".
  3. `publish-view.test.ts`: "liveInvalidation maps publish.status to the publish query of that video and ignores other events; the panel polls only as a 10 s fallback while a send is active".
  4. `player.test.ts`: "shortcutFor ignores Shift-modified letters, IME composition and repeated keys except J and L".
- [ ] **Step 2: Uygula** (Y19).
- [ ] **Step 3:** `npm run typecheck && npm test` → `Tests 504 passed`; `npm run test:smoke` → 21/15 (S6 SSE ile güncellenen panelle geçer).
- [ ] **Step 4: Commit:** `fix: deferred findings — templated claim hints for the fixer, WebFetch limited to the facts reviewer's targets, publish status over SSE, shortcuts ignore Shift, repeat and IME`.

---
### Task 12: Smoke S7, S8, iz listesinin kademeli açılması, M7 ekranları

**Files:**
- Create: `tests/smoke/s7-audit.spec.ts`, `tests/smoke/s8-perf.spec.ts`, `tests/smoke/perf-budgets.ts`, `tests/fixtures/claude-streams/long-trace.ndjson` (yalnızca smoke için üretilmiş, 1000 satırlık; kayıtlı değil, üretici betiği `tests/fixtures/claude-streams/make-long-trace.mjs` ile; spec §16.1'in "gerçek kayıt" kuralının dışında olduğu dosya başında yazılır).
- Modify: `apps/web/src/components/thinking/TraceView.tsx:6` (pencereli çizim, Y13; "Önceki N satırı göster" kalkar), `tests/smoke/screens.spec.ts` (M7 ekranı), `tests/smoke/stack.mjs` (gerekiyorsa dev tohumu), `apps/api/src/routes/roles.ts:52` (dev oturum fixture adı kabulü değişmez; yalnızca yeni fixture).

**Senaryolar:**
- **S7** (Y12) "the audit explorer filters a run, shows a valid chain and opens the raw tool input and the artifact".
- **S8 test 1** "4× CPU: step list and a 1000-row trace scroll at p95 ≤ 16.8 ms with at most 400 trace rows mounted" (üç ölçümün ortancası; ham dağılım çıktıda; bütçe `perf-budgets.ts`).
- **S8 test 2** "idle Studio stays under 0.2 s of main-thread work in 10 s with no long task".
- **screens** (atlanır, `-g M7`): `docs/m7/audit.png`, `docs/m7/library-compare.png`, `docs/m7/assets.png`, `docs/m7/settings-data.png`; Read ile incelenir.

- [ ] **Step 1:** senaryoları yaz; S8'i iz değişikliği olmadan koş → DOM sayısı ölçütü yüzünden FAIL beklenir; ham dağılım ledger'a.
- [ ] **Step 2:** `TraceView` pencereli çizim; Stüdyo kartı ve audit detayındaki iz aynı bileşeni kullanır; S5'in iz satırı beklentileri bozulmaz.
- [ ] **Step 3:** `npm run test:smoke` → **24 passed, 16 skipped**; süre ledger'a (bugün ~4,3 dk; hedef +≤ 60 sn). `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens -g M7` → 1 passed; görüntüler okunur. `npm run typecheck && npm test` → 504.
- [ ] **Step 4: Commit:** `test(smoke): S7 audit explorer and S8 performance budgets under 4× CPU throttling; windowed trace above 200 rows; M7 screens`.

---
### Task 13: Makine kontrol listesi ve dokümanlar

**Files:**
- Create: `docs/machine-checklist.md`, `docs/m7/m7-summary.md`.
- Modify: `docs/superpowers/checklist.md` (M7 satırları ve karar tablosu), `docs/superpowers/runbook.md` (§1 doküman haritası; §6: audit gezgini, kütüphane detayı, varlıklar, yedek/geri yükleme/çöp toplama, güvenli alan, `test:smoke:real`, `VG_TEST_WORKERS`; "Elle yedek" ve "Geri yükleme" satırları Y9'a göre), `docs/superpowers/plans/2026-10-06-videogen-roadmap.md`, `README.md`, `docs/m5/real-check.md` ve `docs/m6/` (yalnızca makine listesine bağlantı; içerikleri taşınmaz, tek sıralı liste makine dosyasıdır), spec (yalnızca bulut kanıtıyla yazılabilecek notlar: §11.3 yedek ve çöp toplama biçimi, §12.4 iz açma, §13.1 kütüphane detayı ve audit diff'i, §16.2 S7/S8 biçimi, §16.3 komut, §17 M7 durumu; gerçek kanıt isteyenler makine listesine).

**`docs/machine-checklist.md` yapısı** (Y21; her madde onay kutusu, komut, beklenen, kayıt yeri):
- **0. Hazırlık:** dalı çek (`main`), `npm ci`, `npm run db:up && npm run db:migrate`, ses venv'i (`python/audio_service/PINS.md`), Blender yolu, `nvidia-smi` gerçek, `~/tiktok-poster` mevcut, disk ≥ 30 GB.
- **A. Tam doğrulama** (M5c T12 Step 1'in güncel sayılarla hâli): `npm run typecheck && npm test` (504, süre kaydı ≤ 6 dk), `npm run test:blender` (19), `npm run test:render` (Blender'lı **17**), `.venv/bin/pytest -q` (50, gerçek venv), `npm run test:smoke` (24/16); temizlik denetimleri (portlar, süreçler, geçici klasörler).
- **A.5 Güvenli alan kalibrasyonu (gerçek koşulardan önce):** `node bin/safe-area.mjs card` → kart telefona elle aktarılır (Y16; VideoGen'in yayın yolu ve API taslak sınırı kullanılmaz) → TikTok'ta "Yalnızca ben" ile paylaş, akışta ekran görüntüsü al, paylaşımı sil → değerleri Ayarlar → "Güvenli alan"a gir. B'deki compose'lar böylece kalibre alanla yapılır (ayar compose `inputHash`'ine girer; sonradan değişirse eski finaller yeniden compose edilmelidir).
- **B. M5 kapanışı** (A.5'ten sonra; M5c T12 Step 2–9 sırasıyla; `docs/m5/real-check.md` §1, M5b-3, M5c tabloları): pilot kalibrasyonu → ses ölçümü (+ M7: ses CLI sınırlarını `VG_AUDIO_*`'a yaz) → A ve B gerçek koşuları (kullanım kapıları aynen; M7: şablon `fix_hint`'in fixer isabetine etkisi B'de not) → 🚦 K17 dinleme onayı → M5b+M5c son review (yapıldı; yalnızca gerçek koşu bulguları) → dokümanlar → `main`.
- **C. M6 T9** (Step 0–7): bağlantı içe aktarma → bağlantıyı sına → 🚦 bir gerçek taslak (B videosu, Müziksiz) → kullanıcı TikTok'ta paylaşır → "Yayınlandı olarak işaretle" → Shorts indirme → son review → dokümanlar.
- **D. M7 gerçek denetimleri:** `npm run test:smoke:real` (altı adım; adım 1 gerçek haiku kullanımı harcar, kullanım durdurma koşuluna tabi; rapor `~/videogen-data/reports/`) → A.5'te girilen güvenli alanla A/B finallerinin kontakt sayfasında G6 bandının gözle denetimi → S8'in makinede tekrarı (`npx playwright test -c tests/smoke/playwright.config.ts s8`) → yedek provası (`node bin/backup.mjs now` → `restore … --into videogen_restore_check` → `audit_verify` → DB'yi sil) → çöp toplama raporu (Ayarlar → "Veri ve yedek"; adayları gözden geçir; 🚦 kullanıcı onayıyla sil) → yetim raporu.
- **E. Kapanış:** spec notları (yalnızca gerçek kanıtla: §18 güvenli alan satırı kalibre değerle, video başına kullanım, K17), `m5c-summary`/`m6-summary`/`m7-summary` güncellemeleri, checklist ve roadmap, `main` fast-forward, Türkçe rapor.
- Her bölümün sonunda "Durdurma koşulları" (kullanım ≥ %80 — `test:smoke:real` adım 1 dahil; `failed`/`needs_human` → tekrar yok; VideoGen'den gerçek TikTok en çok iki taslak, kalibrasyon kartı bunlara girmez) ve "Kayıt" satırı.

- [ ] **Step 1:** `docs/machine-checklist.md`'yi yaz: M5c planı T12 (`docs/superpowers/plans/2026-10-07-m5c-voice.md` Task 12), M6 planı T9 ve bu planın Y21'ini satır satır karşılaştır; her adım tam bir kez görünür; eski beklenen sayılar güncellenir.
- [ ] **Step 2:** `m7-summary.md` (M6 özeti biçiminde: §1 ne çalışıyor, §2 görevler ve commit'ler, §3 doğrulama ve süreler, §4 ekranlar, §5 sapmalar (`Ruling:` özetleri), §6 ertelenenler (Y20 + yeni), §7 makinede bekleyenler (makine listesine bağlantı), §8 sınırlar).
- [ ] **Step 3:** checklist, runbook, roadmap, README, spec notları.
- [ ] **Step 4:** `npm run typecheck && npm test` → 504 (doküman görevi; kod değişmedi).
- [ ] **Step 5: Commit:** `docs(m7): machine checklist that merges the M5 closing, M6 T9 and the M7 real checks; M7 summary, runbook, checklist, roadmap and spec notes`.
- [ ] **Step 6:** `main` fast-forward ve push (PR yok, force-push yok).

## Self-review notları (plan yazarı)

**1. Spec kapsamı (M7 payı):**

| Spec / checklist maddesi | Görev | Durum |
|---|---|---|
| §17 M7: audit gezgini | T2, T3, T12 (S7) | Var |
| §17 M7: sürüm karşılaştırma (yan yana / A-B) | T4 | Var (+ tur seçici, Review'lar sekmesi, kütüphane detayı) |
| §17 M7: varlık defteri arayüzü (müzik, SFX, 3D; lisans alanları) | T5 | Müzik, SFX ve ses örneği; 3D kapsam dışı (tüketici yok; checklist maddesi T13'te buna göre güncellenir, kullanıcıya rapor edilir) |
| §17 M7: yedekler; §11.3 `pg_dump -Fc` 7 gün, manifest yedekte | T6 | Var; medya dosyaları kapsam dışı (Y9) |
| §11.3 haftalık çöp toplama, silme onaylı ve audit'li, yetim raporu | T7 | Var (rapor haftalık, silme onaylı) |
| §17 M7: performans bütçeleri; §16.2 S8; §12.4 sanal kaydırma | T12 | Var; 200 satır üstünde pencereli çizim (DOM ≤ 400 satır, S8 doğrular) |
| §16.2 S7 | T12 | Var |
| §17 M7: `test:smoke:real`; §16.3 altı madde | T9 (+ T8 `renderStill`) | Kod bulutta, koşu makinede (T13 D) |
| Checklist M7: güvenli alan kalibrasyonu (telefon ekran görüntüleri); §18 | T8, T13 A.5 | Tek kaynak + kart bulutta; ölçüm makinede, gerçek koşulardan önce |
| §13.1 Kütüphane detay sekmeleri (Sürümler · Storyboard · Araştırma ve kaynaklar · Review'lar · Audit · Yayın) | T4 | Var |
| §13.1 Ayarlar "veri ve yedek durumu", footer boş disk | T7 | Var |
| §11.2 `GET /api/audit/verify`, kapsam: silmeler | T2, T5, T6, T7 | Var (`blob.deleted`, `asset.revoked`, `backup.pruned`) |
| `npm test` < 6 dk (M6 defteri T3) | T1 | Hedef ≤ 240 sn, M7 sonu ≤ 270 sn; e2e `npm test`'te kalır (M5c H18) |
| `docs/m5/m5c-summary.md` §9 | T10, T11 | (2b), (3), (4), (7), (8) var; (5) ertelendi (Y20) |
| M6 defteri: SSE yerine yoklama | T11 | Var |
| M5b notu: tur seçici, Karşılaştır, Review'lar | T4 | Var |
| M5c T12 + M6 T9 + M7 gerçek koşuları tek dosyada | T13 | `docs/machine-checklist.md` |

**2. Yer tutucu taraması:** "TBD" ve "benzer şekilde" yok. Kod bloğu bilinçli olarak yok. Uygulayıcıya bırakılanlar: arayüzün görsel ayrıntısı, jsonb sha taramasının sorgu biçimi (ölçüt ve test sabit), S8'de pencereli çizimin gerekip gerekmediği (ölçümle; Y13), kalibrasyon kartının çizim ayrıntısı (cetvel aralığı sabit).

**3. Ad ve tip tutarlılığı:**
- `listAudit`, `auditDetail`, `verifyAuditTimed` (T2) → `/api/audit*` (T2) → `auditView`, `chainView`, `toolInputView` (T3) → kütüphane Audit sekmesi (T4) → S7 (T12).
- `listVersions`, `VersionView` (T4) → `compareView`, `syncPlan`, `panelView(…, round)` (T4) → ekran (T12).
- `revokeAsset`, `assetUsage`, `packages/db/src/media.ts` (T5) → `MaintenanceService` (T6, T7 dosya yazımı aynı `putBlob` düzeni).
- `maintenance_runs`, `startMaintenance`, `finishMaintenance`, `latestMaintenance` (T2 şema, T6 fonksiyonlar) → `gcReport`, `gcDelete`, `orphanReport` (T7) → `/api/maintenance` (T7) → `dataView` (T7).
- `SafeArea`, `DEFAULT_SAFE_AREA`, `scaleSafeArea` (T8) → Remotion, qc, ffmpeg, compose (T8); `renderStill` (T8) → `test:smoke:real` adım 4 (T9).
- `voKey` (T10, dışa aktarılır) → fixer ve review bayatlığı (T10).

**4. Review Focus eşlemesi:** 6 maddenin her biri test adlarıyla en az bir teste bağlı.

**5. Sayılar:** T1 1, T2 5, T3 2, T4 4, T5 5, T6 4, T7 7, T8 3, T9 2, T10 5, T11 4 → 462 + 42 = **504**. `test:render` Blender'sız 11 + T8 1 = **12** (Blender'lı 16 + 1 = **17**). Smoke 21/15 + S7 1 + S8 2 + ekran 1 (atlanır) = **24/16**.

**6. Bilinen riskler:**
- Paralel testler bulutta 147 sn ile geçti ama tek koşu: zamanlamaya duyarlı bir test kırılırsa kök neden aranır (Y2); makinede çekirdek sayısı farklı (`VG_TEST_WORKERS`).
- `putBlob`'un sırası değişiyor (upsert + kilit; Y10): her yazım yolunu etkiler; T7'deki yarış testi ve tam paket korur.
- S8 bulut VM'sinde ölçülüyor; gerçek donanımda tekrar (T13 D).
- Konak `pg_dump`/sunucu sürüm uyuşmazlığı kullanıcının makinesinde de olabilir: çözücü Docker'a düşer; Docker yoksa yedek alınmaz ve Ayarlar uyarır.
- Çöp toplama korumacı: bazı referanssız blob'lar kalır (bilinçli).
- `fix_hint` şablonu fixer isabetini düşürebilir; gerçek koşu ölçer (T13 B).
- Güvenli alan değerleri elle okunur; yanlış okuma G6'yı kaydırır (uyarı > 150 px).

## Plan inceleme geçmişi

| Tur | Kim | Bulgu | Sonuç |
|---|---|---|---|
| 0 | Yazar (sondaj) | P1–P9 | Kararlara işlendi (Y2, Y4, Y5, Y8–Y10, Y13, Y16, Y17) |
| 1 | Bağımsız inceleme (salt okunur, sonnet) | **B1:** `putBlob` dosya varsa yazmıyor ve var olan satırın tarihini tazelemiyor (`media.ts:32–46`, `blobs.ts:6–8`); eski bir blob yeniden kullanılırken çöp toplama onu silebilir, satırsız dosya ya da dosyasız satır kalabilirdi | Doğrulandı. `blobs.touched_at`, upsert, blob başına paylaşımlı/özel advisory kilidi, silme ve çöp kutusuna taşıma aynı transaction'da (Y4, Y10, T7 test 3) |
| 1 | Bağımsız inceleme | **B2:** `videogen_app` ile `pg_dump` `drizzle` şemasında düşer | Doğrulandı (`permission denied for schema drizzle`). Döküm sahip rolüyle, migration tablosu dahil (Y9, P3, T6 test 1–2) |
| 1 | Bağımsız inceleme | **B3:** yedek medya içermediği için "taze yedek" şartı silinen dosyayı kurtarmaz | Doğrulandı. 7 günlük çöp kutusu + `restore-blob` asıl güvence; yedek şartı ikincil (Y10, T7 test 2) |
| 1 | Bağımsız inceleme | I4–I5: şablondan eşzamanlı `CREATE DATABASE` 55006 verir; yarım kurulan şablon geçerli sayılırdı; test gerçek şablonu silebilirdi | `_building` + yeniden adlandırma, kopyalar kilit altında ve 55006'da yeniden deneme, otomatik silme yok + `db:test-clean`, test kendi önekiyle (Y2, T1) |
| 1 | Bağımsız inceleme | I6: e2e'yi taşımak M5c H18'e aykırı (`m5c-voice.md:123`) | Doğrulandı. Paralellik yettiği için e2e `npm test`'te kalır; sayılar 504 ve render 12/17 olarak yeniden hesaplandı (Y2, Y22) |
| 1 | Bağımsız inceleme | I7: paralel koşuda ağır ffmpeg testleri 20 sn zaman aşımına takılabilir; Y2 ile T1 sırası çelişiyordu | Ağır dosyalarda ≥ 60 sn; sıra şablon → paralellik (Y2, T1) |
| 1 | Bağımsız inceleme | I8: "aynı origin + yol öneki" `?q=<sızıntı>` ile veri kaçırmaya açık; alt ajanlar | Normalleştirilmiş birebir URL eşitliği, ek sorgu/parça yok, alt ajan çağrılarında da (Y19, T11 test 2) |
| 1 | Bağımsız inceleme | I9: konteyner içi bağlantı, ikili stdout, `pg_restore` sürümü ve rol | Docker yolunda `-h localhost -p 5432`, stdout dosyaya akıtılır, `pg_restore` aynı çözücüyle, rol yoksa ret (Y9) |
| 1 | Bağımsız inceleme | I10: kalibrasyon kartı yayın yoluna sığmaz (`publications` video/sürüm FK'lı), taslak sayısıyla çelişki, kalibrasyon gerçek koşulardan sonra geliyordu | Kart elle aktarılır ("Yalnızca ben" paylaşımı, sonra silinir), taslak sayısına girmez; makine listesinde A.5 olarak B'den önce (Y16, T13) |
| 1 | Bağımsız inceleme | I11: `uploadId` yol enjeksiyonu, uzantısız yükleme (mime), saatlik süpürme, `importAsset`'in ffmpeg'i db paketine taşıması | uuid + var olan dosya, izinli uzantı + ffprobe, saatlik süpürme, süre fonksiyonu bağımlılık olarak (Y8, T5 test 2) |
| 1 | Bağımsız inceleme | I12–I13: `renderStill` ayrıntısı; §12.4 sapması yetersiz tanımlı | `renderStill` 4.0.533 + `CHROME`/`chromeMode`; pencereli çizim **zorunlu**, S8 DOM ≤ 400 satırı doğrular, ham dağılım loglanır (Y13, Y17, T12) |
| 1 | Bağımsız inceleme | I14: ses örneği iptalinin arayüz yolu yok; `preflight.ts:37` denetimsiz | Ses örnekleri `/assets`'te; anlatıcı ayarındaki iptal hazır sese döner; ön kontrol de reddeder (Y8, T5 test 4) |
| 1 | Bağımsız inceleme | Minor: jsonb taramasının genişletilmesi + şema bekçisi, tek bakım işi indeksi, `reports/` istisnası ve kullanım koşulu, doğrulama önbelleği, yarım sürümlerin etiketi, 3D'nin düşürülmesinin raporlanması | Y4, Y5, Y7, Y10, Y14, self-review tablosu. Commit trailer bulgusu yanlış (oturum talimatı Opus 5.5 + `Claude-Session`); Global Constraints buna göre netleştirildi |
