Merhaba. `~/gpu-server/VideoGen` deposundaki **VideoGen** platformu için **M4c — Taslak, inceleme ve player** kilometre taşının **uygulama planını** yazmanı istiyorum. Görevin yalnızca planı yazmak, incelemeden geçirmek ve commit etmek. **Uygulama yapma.** Türkçe raporla.

## 1. Bağlam (kısa)

VideoGen bu laptopta (RTX 3060 6 GB, 14 GB RAM, ~15 GB boş disk) localhost'ta çalışan tek kullanıcılı bir web platformu. Ürün adından "içinde ne var" (patlatılmış görünüm) TikTok videosu üretir. Tüm AI işini Claude Code agent'ları kullanıcının **Max aboneliğiyle** yapar; **ücretli API yok**.

Durum (`main`, HEAD `8379279`):
- M0–M3 tamam.
- **M4a** (pipeline omurgası: ürün adı → araştırma → storyboard) ve **M4b** (sahne çekirdeği: `vg_blender`, bubblewrap içinde iki aşamalı build, Blender↔Three.js eşdeğerliği, GPU önizleme, build adımı, medya ucu, K19 seçenekleri) tamam ve `main`'e birleştirildi.
- Bugün bir ürün `research → storyboard → build` adımlarından geçip `insan gerekli` durumunda bitiyor. Not: "Sahne kurulumu hazır. Taslak render bu sürümde henüz yok."

**M4c'nin kapsamı:** taslak video ve player. M4'ün çıkış ölçütü: S2 (taslakla), ilk gerçek ürün, video başına kullanım ölçümü. Kapsam şunları içerir:
- `Review` sözleşmesi ve taslak kontrol listesi.
- Migration 0006 (`steps.round`).
- `packages/remotion` (Draft3D + `renderDraftVideo`).
- Orchestrator'ın GPU kilidine bağlanması; run başlatmada kullanım kapısı (spec §6.4).
- `draft_render` adımı.
- Reviewer için `extract_frames` MCP aracı.
- `draft_review` adımı (en fazla 2 geri dönüş).
- Player: "Taslak" sekmesi `@remotion/player`, "Taslak MP4" sekmesi HTML5 + HTTP Range. Kütüphanede kapak ve süre. Kısayollar: Space, J/K/L, N.
- Tam smoke S2 (taslak + kütüphanede oynatma).
- Kapanış: K12 rol modelleriyle ilk gerçek ürün, video başına kullanım, son review, `docs/m4/report.md`, `main`'e birleştirme.

## 2. Önce oku (bu sırayla; hepsi repo'da)

1. `docs/m4/m4b-summary.md`, özellikle **§8 "M4c için notlar"** ve §6–§7.
2. `docs/superpowers/plans/2026-10-06-m4b-scene-core.md`. Okunacak bölümler:
   - başlık bölümleri: Architecture, Kapsam ve bölme, M4a'dan gelen arayüzler, plan öncesi sondaj P1–P6, **Karar kaydı B1–B20**, Kapsam dışı, Global Constraints, Review Focus;
   - sondaki "Self-review notları" ve "Plan inceleme geçmişi".

   Bu plan M4c'nin **biçim örneğidir**. Kod bölümlerini okumana gerek yok; gerçek kodu repo'dan oku.
3. Spec `docs/superpowers/specs/2026-10-06-videogen-design.md`:
   - §4 (özellikle K7, K12, K13, K19, K22, K23);
   - §6.2–§6.4, §7.1 (adım 5–6), §7.2, §7.4 (`Review`), §7.5;
   - §8.2–§8.3 (izolasyon, bayat artefakt koruması);
   - §11.1, §12.1–§12.4, §13.1, §13.4, §14, §16.1–§16.2 (S2), §17 (M4 satırı), §18.
4. `docs/m4/m4a-summary.md` §7 (ertelenen minorlar; 4 numara run başlatmada kullanım kapısı) ve `docs/m3/report.md` §7, §9.
5. `docs/superpowers/checklist.md` (M4 bölümü + karar tablosu), `docs/superpowers/runbook.md` (§1, §6, §7).
6. **Gerçek kod** (planın dayanacağı arayüzler; imzaları buradan al, tahmin etme):
   - Pipeline: `apps/worker/src/pipeline/{orchestrator,steps,agent-step,scene-tools,types,fake-scripts,resources}.ts`.
   - Render: `apps/worker/src/render/{driver,locks,gate,sandbox,process,ffmpeg}.ts`.
   - Ajan katmanı: `apps/worker/src/agents/manager.ts`, `packages/claude/src/{mcp,roles,guard}.ts`.
   - Paylaşılan ve DB: `packages/shared/src/{pipeline,progress,scene,styles,artifacts}.ts`, `packages/scene3d/src/index.ts`, `packages/db/src/{pipeline,jobs,channel}.ts`.
   - API ve web: `apps/api/src/routes/{videos,media}.ts`, `apps/web/src/components/production/*`, `apps/web/src/routes/{Studio,Library}.tsx`.
   - Testler: `tests/smoke/{s2-produce,s2b-build,screens}.spec.ts`.
   - Sondaj: `spikes/m4b/{render2.mjs,src/Draft.tsx}` (Remotion + Three.js; çalıştı).

Okuduktan sonra bana 5–6 satırlık bir anlayış özeti ver ve doğrudan planlamaya geç (onay bekleme).

## 3. M4b'den devralınan gerçekler (planla çelişirse bunlar kazanır)

- **Remotion (sondaj P3):**
  - `remotion` / `@remotion/*` 4.0.533 tam sürüm; three 0.186.1; @react-three/fiber 9.8.1.
  - Sistem Chrome: `browserExecutable: '/usr/bin/google-chrome'`, `chromeMode: 'chrome-for-testing'`, `gl: 'angle'`; tarayıcı indirilmez.
  - `pixelFormat: 'yuv420p'` + `colorSpace: 'bt709'` (varsayılan `yuvj420p`/pc'dir ve spec §7.5 reddeder).
  - Ölçüm: 45 sn 540×960 ≈ 95 sn; 1080×1920'de 61 kare 3,9 sn.
  - `esbuild` install script'i npm 12'de onay ister (`npm install-scripts approve esbuild`).
- **Three.js tarafı:**
  - Klipler `@videogen/scene3d`'nin `SceneClock.seek` ile oynatılır: bitmiş `LoopOnce` eylemi `mixer.setTime`'da 0'a döner (P6).
  - FOV kare başına `applyFrameFov` ile uygulanır (`camera_track.json`); etiket çizgileri `projectAnchor` ile çizilir.
  - GLB malzemeleri düz görünür; metaller için ortam haritası (RoomEnvironment) gerekir.
- **Arka plan ve GPU:**
  - Final ve önizleme kareleri şeffaftır; arka planı stilin tam renkleriyle (`CHANNEL_STYLES[*].background`) Remotion çizer.
  - GPU ve ağır CPU işleri için **tek kapı** worker'daki `ResourceLocks` / `withResource` (§6.4 ön kontrolü dahil). `draft_render` aynı kilidi kullanmalı; orchestrator'ın kapasite sayımı MCP işlerini görmez.
- **Adım ve yürütücü:**
  - Artefakt türleri: `scene`, `scene_glb`, `scene_anchors`, `scene_events`, `camera_track`, `build_report`, `preview_sheet`, `product_py`, `scene_blend`. Medya `GET /api/blobs/:sha` ile sunulur (Range, immutable).
  - Builder'ın `render_draft` aracı **kaldırıldı** (B7); taslağı adım üretir.
  - `runStructured`'da `checkAsync` (güvenilir doğrulama → aynı oturuma düzeltme isteği) ve `initialResume` var.
  - Fake senaryolar: `FakeScript.files`; ürün adı tetikleri "imkansız", "bozuk sahne", "yavaş".
- **Plan öncesi grilling'den M4c'ye devredilenler (uygulanmalı):**
  - **D5:** Döngü için `steps.round`. Tur başına `attempt` sıfırlanır; korunursa orchestrator'ın yeniden deneme hakkı (`maxAttempts` 2) tükenir. "≤ 2 tur" = en çok 2 geri dönüş (3 inceleme). Run yüzdesi monotondur (`GREATEST`); başlık "Taslak turu k/2"yi kendi ilerlemesiyle gösterir.
  - **D6:** `severity` kontrol kimliğine göre `DRAFT_CHECKS`'te sabittir, reviewer belirlemez. Karar deterministiktir. `pass:false` kanıt (kare, zaman kodu) ister. `dimension_scores` / `gate_results` açık özellikli nesnedir (`z.record(enum)` zod 4'te tüm anahtarları zorunlu kılar; CLI JSON Schema'sında `propertyNames` doğrulanmadı).
  - **Değişmeyen düzeltme:** tur k'daki GLB sha + spec hash'i k−1 ile aynıysa yeniden incelenmez, `needs_human` olur.
  - **Reviewer kare bütçesi:** 12 karelik kontakt sayfası + en çok 12 tek kare (vuruş sınırları).
  - **Bayat artefakt koruması (§8.3):** taslağın `inputHash`'i = GLB sha + spec sürümü + stil + bundle hash + render parametreleri.
  - Diğerleri: `StepExecutor.extraDiskMb`; render sonrası `ffprobe` doğrulaması; geçici HTTP sunucusu (127.0.0.1, jetonlu yol); bundle önbelleği (`<dataDir>/cache/remotion/<hash>`, eskileri budanır).
- **Test sayıları (`main`):**
  - `npm test` 271; `npm run test:blender` 17; `npm run test:render` 4.
  - `npm run test:smoke` 15 passed / 7 skipped.
  - Tam pakette yük altında ara sıra düşen ve adı yakalanamamış bir eski test olabilir. Görülürse önce mekanizmayı kanıtla.
- **Açık kullanıcı kararları:**
  - K19: seçim bekleniyor; `gece_mavisi` GEÇİCİ.
  - K17: ses, M5.
  - Swap kuralı §6.4 değişmedi.

## 4. Yöntem ve kurallar

- **Skill'ler:** `superpowers:writing-plans`.
- **Kararlar:** Karar gerekiyorsa otonom ve spec'le tutarlı best practice karar ver. Önemli kararları bir karar ağacına yaz ve **tek** bir bağımsız alt ajana (model `fable`) grilling yaptır; CHANGE önerilerini değerlendir. Spec'teki bir **K kararını** ya da mimariyi değiştirmen gerekirse dur ve bana sor.
- **Token ekonomisi (önemli):**
  - Planı doğrulamak için kodu bir worktree'de uygulayıp çalıştırma. Önceki oturumda bu, planlamayı fiilen uygulamaya çevirdi ve çok token yedi.
  - Gerçek kodu oku, plandaki kodu ona göre yaz.
  - Yalnızca gerçekten belirsiz ve ucuz bir teknik soru için en çok 2 küçük sondaj yap (ör. `@remotion/player` + three'nin Vite derlemesi). Sonucu planın "Plan öncesi sondaj" tablosuna yaz.
  - Gerçek Claude oturumu açma.
- **Plan dosyası:** `docs/superpowers/plans/2026-10-06-m4c-draft-review-player.md`.
  - **En çok 12 görev.** Biçim M4b planıyla aynı: başlık, Kapsam, gerçek arayüzler, Karar kaydı, Kapsam dışı, Global Constraints, Review Focus (5 madde, her biri bir teste bağlı), görevler, Self-review notları, Plan inceleme geçmişi.
  - Her görevde: **Files**, **Interfaces** (tam imzalar), TDD adımları (önce başarısız test + beklenen hata, sonra uygulama, sonra geçen test ve tam paket sayısı), commit komutu.
  - Kod adımları tam dosya ya da `git apply` ile uygulanabilir `diff` içerir; yer tutucu ("TBD", "benzer şekilde") yok. Test sayı zinciri 271'den başlar.
  - Arayüz görevlerinde `frontend-design:frontend-design` skill'i yüklenir; ekran testleri `docs/m4/*.png`.
  - Kapanış görevinde gerçek doğrulama (geçici DB `videogen_m4c_check`, `/tmp/videogen-m4c-check`):
    - K12 modelleri; ürün "tükenmez kalem", seslendirmesiz;
    - başlama koşulu 5 sa < %25 ve 7 gün < %70;
    - ardından tek bağımsız son kod review'u, `docs/m4/report.md`, checklist / runbook / roadmap / spec §18, `main`'e `--no-ff` birleştirme.
- **İnceleme:** Plan bitince:
  1. Kendi self-review'unu yap (spec kapsamı, yer tutucu taraması, tip ve ad tutarlılığı, Review Focus eşlemesi).
  2. **Tek** bir bağımsız alt ajanla (model `fable`, salt okunur) planı spec'e, M4b planına ve repo'daki gerçek koda karşı inceletip Blocking / Important / Minor bulgu iste.
  3. Hepsini plana işle; ikinci bir inceleme turu yalnızca Blocking bulgu çıktıysa yapılır.
  4. Workflow aracını kullanma.
- **Commit:** `main`'den `m4c-draft-review-player` dalını aç; planı orada commit et (yalnızca plan dosyası + gerekirse sondaj betikleri).
  - Yazar env ile: `GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com"`.
  - Mesajın son satırı tam olarak: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Kapsam disiplini:** `docs/superpowers/handoff-*.md` dosyalarına dokunma; `main`'e birleştirme yok; uygulama yok.

## 5. Bitti tanımı ve rapor

Bitti sayılması için şunların hepsi gerekir:
- Plan dosyası commit'lenmiş.
- Self-review ve bağımsız incelemenin bulguları plana işlenmiş ("Plan inceleme geçmişi" bölümünde listeli).
- Açık Blocking/Important bulgu kalmamış.

Bana Türkçe rapor ver:
- **Maddeler:** görev listesi tek satırlarla.
- **Kararlar:** her biri için neden ve yanlışsa maliyeti.
- **İnceleme sonuçları.**
- **Bilmen gerekenler:** açık kullanıcı kararları, riskler, tahmini kullanım.

Sonunda uygulama yöntemini (subagent-driven / native) öner ve dur.
