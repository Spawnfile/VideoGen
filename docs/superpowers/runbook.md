# VideoGen — Uygulama Runbook'u

Bu doküman; planların **hangi sırayla, nasıl, hangi kapılardan geçerek** uygulanacağını ve platform ayağa kalktıktan sonra **günlük işletimin** nasıl yapılacağını anlatır. İlerlemeyi takip etmek için: `docs/superpowers/checklist.md`.

## 1. Doküman haritası

| Doküman | Ne için |
|---|---|
| `docs/superpowers/specs/2026-10-06-videogen-design.md` | Tek doğruluk kaynağı: kararlar, mimari, kalite rubriği, riskler |
| `docs/superpowers/plans/2026-10-06-videogen-roadmap.md` | Kilometre taşları, giriş ve çıkış ölçütleri |
| `docs/superpowers/plans/2026-10-06-m0-verification.md` | M0: doğrulama spike'ları, fixture kaydı, disk temizliği |
| `docs/superpowers/plans/2026-10-06-m1-audio-listening.md` | M1: ses servisi temeli, TTS dinleme testi |
| `docs/superpowers/plans/2026-10-06-m2-skeleton.md` | M2: platform iskeleti |
| `docs/superpowers/plans/2026-10-06-m3a-agent-runtime.md` | M3a: agent çalışma katmanı (sürücü, roller, MCP, koruma, olay tabloları, kullanım muhafızı, chat servisi, API). M3b planı ayrı satırda |
| `docs/superpowers/plans/2026-10-06-m3b-live-ui.md` | M3b: canlı arayüz (10 Hz olay deposu, ThinkingState, agent kartları, chat paneli, rol ayarları), smoke S3/S4/S5, taş sonu |
| `docs/superpowers/plans/2026-10-06-m4a-pipeline-core.md` | M4a: pipeline omurgası (tablolar, iş kuyruğu, orchestrator, ilerleme, research/storyboard adımları, API, Stüdyo üretim paneli, Kütüphane, smoke S2a). M4b planı M4a sonrası |
| `docs/superpowers/plans/2026-10-06-m4b-scene-core.md` | M4b: sahne çekirdeği (vg_blender, iki aşamalı sandbox'lı build, Blender↔three.js eşdeğerliği, GPU önizleme, build adımı, medya ucu, K19 seçenekleri, smoke S2b). M4c planı ayrı satırda |
| `docs/superpowers/plans/2026-10-06-m4c-draft-review-player.md` | M4c: `Review` sözleşmesi, `steps.round` (0006), taslak döngüsü, GPU ve kullanım kapıları, `packages/remotion` (Draft3D + çocuk süreçte render), `draft_render`, `extract_frames`, `draft_review` (≤ 2 geri dönüş), player + kütüphane + kısayollar, smoke S2, M4 kapanışı |
| `docs/superpowers/plans/2026-10-06-m5a-final-render-qc.md` | M5a: rubrik `final@1` + QC sözleşmesi, varlık defteri + lisans kapısı + prosedürel SFX (0007), Blender final render (devam, düşük ayarla yeniden deneme), `final_render`, `Overlay` + `Final3D` + `layout.json`, final Remotion render'ı, SFX/müzik/mastering/varyantlar, `compose`, qc_probe, `qc`, Final sekmesi + QC kartı, smoke S2 final, kapanış (pilot kalibrasyonu, ilk gerçek ürün). M5b (review + fixer) ve M5c (ses) planları M5a sonrası |
| `docs/superpowers/plans/2026-10-07-m5b-review-fix.md` | M5b: `final@1` review sözleşmesi + deterministik puan ve K13 kararı, döngü mantığı (`fixScope`, regresyon/salınım, `pickBest`), migration 0008 (`steps.fix_round`, `reviews`, `findings`), `run_qc` ve reviewer araç katmanı, üç reviewer istemi ve Fake'ler, `review` adımı (fixer dahil), `finalize`, inceleme paneli + "Düzeltme turu k/3" + kütüphane puanı, smoke S2 tam sürüm, kapanış (pilot kalibrasyonu, gerçek ürün "yayına hazır"a kadar). M5c (ses) planı M5b sonrası |
| `docs/superpowers/plans/2026-10-07-m5c-voice.md` | M5c: seslendirme (`voice` adımı, TTS + Whisper CLI'ı), `AudioPlan`, ducking, altyazı, G4, `voice` kapsamlı düzeltme turu, Seslendirme kartı; kapanış (M5'in GPU'lu makine doğrulamaları, K17) |
| `docs/superpowers/plans/2026-10-08-m6-publish.md` | M6: yayın sözleşmeleri, `publications` + `claims` (0009), `packages/tiktok` (taslak gönderimi, token deposu, PKCE, sahte sunucu), worker `PublishService`, TikTok bağlantısı, yayın uçları + Shorts, Yayın paneli ve bitirme kartı, smoke S6, kapanış (gerçek taslak) |
| `docs/superpowers/plans/2026-10-08-m7-hardening.md` | M7: `npm test` süresi (şablon veritabanı, paralel dosyalar), migration 0010, audit gezgini, kütüphane detayı + sürüm karşılaştırma + tur seçici, varlık defteri arayüzü, yedek + blob çöp toplama + yetim raporu, güvenli alan ayarı ve kalibrasyon kartı, `test:smoke:real`, ertelenen bulgular, smoke S7/S8, makine kontrol listesi |
| `docs/machine-checklist.md` | Kullanıcının makinesinde yapılacak bütün gerçek koşular tek sıralı listede: M5 kapanışı (M5c T12), M6 T9, M7 gerçek denetimleri (M7 T13'te yazılır) |
| `docs/superpowers/checklist.md` | Görev bazında ilerleme takibi |
| `docs/m3/report.md`, `docs/m3/real-check.md` | M3 sonuç raporu ve gerçek Claude doğrulama çıktıları |
| `docs/m4/m4a-summary.md`, `docs/m4/real-check.md`, `docs/m4/m4b-summary.md`, `docs/m4/report.md` | M4a özeti (pipeline omurgası), gerçek (haiku) doğrulama çıktıları, M4b özeti (sahne çekirdeği) ve M4 raporu (M4c dahil) |
| `docs/m5/m5a-summary.md`, `docs/m5/m5b-summary.md`, `docs/m5/real-check.md` | M5a ve M5b özetleri (sapmalar, ertelenenler, sonraki taş için notlar) ve GPU'lu makinede bekleyen gerçek doğrulamalar (M5a + "M5b bekleyenleri") |
| `docs/m<N>/report.md` | Her taşın kanıtlı sonuç raporu (uygulama sırasında oluşur) |

## 2. Uygulama sırası

```
M0 Doğrulama ──┬──► M1 Ses (kullanıcı dinleme testine katılır) ──┐
               │                                                  ├──► M5 Final ve kalite ──► M6 Yayın ──► M7 Sertleştirme
               └──► M2 İskelet ──► M3 Canlı agent ──► M4 Dikey dilim ──┘
```

- **M0 her şeyden önce gelir.** Disk temizliği M1'in önkoşuludur. Spike sonuçları M2'nin footer veri kaynağını ve M3'ün sürücü ayrıntılarını belirler.
- **M0 tamamlandı** (`docs/m0/report.md`): footer'ın birincil kaynağı `get_usage` (yüzde 0..100), `rate_limit_event` (kesir 0..1) canlı tazeleme ve yedek; giriş akışı v1'de terminal talimatı; M3 ve M4'e devredilen maddeler raporun §12'sinde.
- **M1 ve M2 birbirinden bağımsızdır.** Önerilen sıra M2 → M1. Önce iskelet ve testler hazır olur; dinleme testi kullanıcının vakti olduğunda yapılır.
- **M3–M7 planları önceden yazılmaz.** Her biri, bir önceki taşın raporu ve kanıtlarıyla yazılır (§5).
- **M3 iki plana bölündü** (17 görev): M3a (agent çalışma katmanı) → M3b (arayüz + smoke S3/S4/S5). **M3 tamamlandı** (`docs/m3/report.md`).
- **M4 üç plana bölündü:** M4a (pipeline omurgası) ve M4b (sahne çekirdeği: storyboard → doğrulanmış 3D sahne) **tamamlandı** ve kullanıcı kararıyla `main`'e birleştirildi (`docs/m4/m4a-summary.md`, `docs/m4/m4b-summary.md`); M4c (taslak render, taslak inceleme, player, smoke S2) de uygulandı ve `main`'e birleştirildi (`docs/m4/report.md`). **Açık kalan tek M4 çıkış maddesi:** K12 rol modelleriyle ilk gerçek ürün ve video başına kullanım ölçümü; GPU'lu makinede `docs/m4/report.md` §4'teki tarifle koşulur.

## 3. Bir planı uygulamak

### 3.1 Önkoşul kontrolü (her oturumun başında)

```bash
cd ~/gpu-server/VideoGen
git status --short && git log --oneline -3   # temiz çalışma ağacı
df -h / | tail -1                            # boş disk (M1 için ≥ 30 GB)
free -h | sed -n 2p                          # boş RAM (render ve agent işleri için ≥ 2,5 GB)
docker ps --format '{{.Names}}' | head       # Docker çalışıyor
claude auth status | grep -E 'loggedIn|subscriptionType'
env | grep -E 'ANTHROPIC_API_KEY|OPENAI_API_KEY|ELEVENLABS' || echo "ücretli anahtar yok ✓"
```

Gerçek Claude oturumu açan işler (spike'lar, `test:smoke:real`) Claude Code içinden `env -u CLAUDECODE ...` ile başlatılır; model haiku, koşu sayısı en az. Gömülü CLI sürümü: `spikes/m0/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude --version` → M0'da `2.1.290`.

### 3.2 Dal (branch) düzeni

Her kilometre taşı kendi dalında yürür; çıkış ölçütü sağlanınca `main`'e birleştirilir:

```bash
git switch -c m0-verification      # m1-audio, m2-skeleton, ...
# ... görevler, görev başına bir commit ...
git switch main && git merge --no-ff m0-verification -m "merge: M0 verification"
```

### 3.3 Yürütme yöntemi

Yeni bir Claude Code oturumu açın (cwd: `~/gpu-server/VideoGen`) ve şunu yazın:

> `docs/superpowers/plans/2026-10-06-m0-verification.md` planını **superpowers:subagent-driven-development** ile uygula. Her görevden sonra `docs/superpowers/checklist.md` dosyasını güncelle. Kapı (gate) koşullarında dur ve bana sor.

- **Subagent-driven (önerilen):** Her görevi taze bir alt ajan uygular, taze bir reviewer kontrol eder. Görevler birbirinin arayüzlerine bağımlı olduğu ve hatalı bir audit/SSE temelinin bütün platformu etkileyeceği için bu yöntem önerilir.
- **Native:** Tek oturumda sırayla uygulanır, en sonda tek bir review yapılır. Daha ucuz ve hızlı, ama ara review yok.

### 3.4 Görev döngüsü (planlardaki her görev)

1. Başarısız testi yaz → çalıştır → **başarısız olduğunu gör**.
2. En küçük uygulamayı yaz → testi çalıştır → **geçtiğini gör**.
3. Commit et. Yazar env'le verilir; mesaj sonunda `Co-Authored-By` satırı bulunur (planlardaki Global Constraints).
4. `checklist.md`'de kutuyu işaretle; commit hash'ini ve varsa notu ekle.

### 3.5 Taş sonu

1. Planın son görevindeki doğrulama komutlarını çalıştır (testler, smoke, elle doğrulama).
2. `docs/m<N>/report.md` dosyasını yaz: Varsayım · Sonuç · Kanıt · Spec'e etkisi.
3. Spec §18'i güncelle (doğrulanan veya çürütülen varsayımlar).
4. Dalı `main`'e birleştir.
5. Kullanıcıya Türkçe rapor: **Maddeler / Doğrulama / Bilmen gerekenler**.
6. Bir sonraki taşın planını yaz (§5).

## 4. Kapılar: dur ve kullanıcıya sor

| Durum | Nerede | Ne yapılır |
|---|---|---|
| `minillm-lab`'da commit edilmemiş, push edilmemiş ya da stash'lenmiş iş var | M0 Task 1 (geçti: temiz) | Silme atlanır; liste kullanıcıya gösterilip yeniden onay istenir |
| `apiKeySource` `none` değil (abonelik yolu çalışmıyor) | M0 Task 3 (geçti: `none`) | Dur. Spec §18 yedek planı kullanıcıyla konuşulur |
| `PreToolUse` yol koruması kaçışı engellemiyor | M0 Task 4 (geçti: engelledi) | Dur. Spec §6.1 ve §15 güncellenmeden M3'e geçilmez |
| Boş disk < 30 GB (M1) veya < 3 GB + kare tahmini (render) | M1 (29,5 GiB = 31,7 GB ile geçildi; indirmelerde taban 10 GiB), M4+ | Dur. Temizlik önerisi sunulur |
| TTS motoru ve anlatıcı sesi seçimi | M1 Task 5 (**geçici karar kaydedildi**: Chatterbox ML V3 + hazır ses; `docs/m1/decision.md`) | Kullanıcı karar verir (K17): `~/videogen-data/m1/listening/index.html` sayfasını kör dinler, seçimini söyler; karar ve spec K17 güncellenir. M5 `voice` adımından önce kesinleşmeli |
| Kanal görsel kimliği seçimi | M4 | Kullanıcı 2–3 seçenekten birini seçer (K19) |
| Gerçek TikTok taslak gönderimi | M6 | Kullanıcı butona kendisi basar |
| Herhangi bir silme veya geri alınamaz işlem (planda yazanlar dışında) | Her yer | Önce hedef gösterilir, onay alınır |

## 5. Sonraki planın yazımı (M3 → M7)

Taş raporu bittikten sonra yeni bir oturumda:

> `superpowers:writing-plans` ile M<N+1> planını yaz. Girdi olarak spec'i, `plans/2026-10-06-videogen-roadmap.md`'yi, `docs/m<N>/report.md`'yi ve `checklist.md`'deki M<N+1> maddelerini kullan. Plan; önceki taşın ürettiği gerçek arayüzlere (dosya yolları, fonksiyon imzaları) dayanmalı. Bitince runbook ile checklist'i güncelle.

## 6. Günlük işletim (M2 sonrası)

| İş | Komut |
|---|---|
| Başlat | `npm start` (Postgres → migration → web derlemesi → API + Worker → tarayıcı). Web paketi **her başlatışta** yeniden derlenir (API'den önce) |
| Tarayıcısız başlat | `VG_NO_BROWSER=1 npm start` |
| Durdur | Başlatıcının terminalinde `Ctrl+C` (çocuk süreçlere SIGTERM, 10 sn sonra SIGKILL) |
| Loglar | `tail -f ~/videogen-data/logs/api.log ~/videogen-data/logs/worker.log` |
| Sağlık | `curl -s http://127.0.0.1:5180/api/health` |
| Audit zinciri | `curl -s http://127.0.0.1:5180/api/audit/verify` → `{"ok":true,...}` |
| Elle yedek | `docker exec videogen-pg pg_dump -U videogen -Fc videogen > ~/videogen-data/backups/videogen-$(date +%F).dump` |
| Geri yükleme (boş veritabanına) | `docker exec -i videogen-pg pg_restore -U videogen -d videogen --clean < ~/videogen-data/backups/<dosya>.dump` |
| Disk | `df -h / && du -sh ~/videogen-data/*` |
| Geliştirme kipi | `npm run dev:api` + `npm run dev:worker` + `npm run dev:web` (Vite 5173 → 5180). `dev:api` çalışırken `npm run build` yaptıysan `dev:api`'yi yeniden başlat (statik dosyalar API açılışında kaydedilir) |
| Testler | `npm run typecheck && npm test && npm run test:smoke` |
| Ses servisi testleri | `cd python/audio_service && .venv/bin/pytest -q` (tüm testler geçmeli, GPU gerekmez). Kurulum/yeniden kurulum: `python/audio_service/PINS.md` (**`uv sync` asla**) |
| Smoke | `npm run test:smoke`: kendi yığınını port **5190**, `videogen_smoke` veritabanı ve `/tmp/videogen-smoke` diziniyle kurar, her koşuda web'i derler; Claude yerine Fake sürücü. Koşu bitince DB ve dizin silinir (M3). ~50 sn, 11 senaryo (S1 3 + S2a 3 + S3 1 + S4 2 + S5 2) + 5 atlanan ekran testi. S5 göndermeden önce "Worker canlı"yı bekler (taze SSE bağlantısı geçmişi oynatmaz) |
| Ekran görüntüleri | `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens` → `docs/m3/*.png` (M3), `docs/m4/*.png` (M4: `-g M4`) ve `docs/m5/*.png` (M5a: `-g M5a`, M5b: `-g M5b`) |
| Fake kipte geliştirme (Claude'suz) | Worker ve API'yi `VG_CLAUDE_DRIVER=fake VG_DEV_ENDPOINTS=1` ile başlat (`npm run dev:api`, `npm run dev:worker`). Hız `VG_FAKE_SPEED` (0,3 = 3× hızlı), chat senaryoları `VG_FAKE_CHAT=websearch,coding`, canlılık eşikleri `VG_QUIET_AFTER_MS` / `VG_STUCK_AFTER_MS`, chat boşta kapanma `VG_CHAT_IDLE_MS` |
| Dev oturumu başlat (yalnızca `VG_DEV_ENDPOINTS=1`) | `curl -s -H 'Host: 127.0.0.1:5180' -H 'Origin: http://127.0.0.1:5180' -H 'content-type: application/json' -X POST -d '{"role":"researcher","script":{"fixture":"websearch"}}' http://127.0.0.1:5180/api/dev/sessions` → 202; kart Stüdyo'da görünür |
| Rol başına model / düşünme düzeyi | Ayarlar → "Agent rolleri" (ya da `PUT /api/roles/<rol> {"model":"haiku","effort":"low"}`). Bir sonraki oturumda geçerli olur, audit'e yazılır |
| Skill bağlantıları | `claude-plugin/skills/*` git'te değil; `claude-plugin/skills.manifest.json`'dan üretilir. Başlatıcı her açılışta `node bin/link-skills.mjs` çalıştırır; elle de çalıştırılabilir |
| Elle doğrulama (Fake ya da gerçek) | Gerçek DB'ye yazmamak için `VG_DATABASE_URL` / `VG_ADMIN_DATABASE_URL`'yi geçici bir veritabanına yönelt (smoke yığını gibi). `audit_log` silinemez: varsayılan DB'ye düşen deneme satırları kalıcıdır (M3a T10'un Fake oturumu bu yüzden gerçek Stüdyo'da görünür) |
| Üretim (Stüdyo) | Üstteki alana ürün adı → ses modu çipi (varsayılan Seslendirmesiz) → "Üret". Adım listesi, genel yüzde, ETA ve kaynak etiketi canlı akar; araştırma ve storyboard kartları adım bitince görünür. M4a'da run storyboard'da biter: video `insan gerekli`, not "Storyboard hazır. Sahne kurulumu ve taslak render bu sürümde henüz yok." "Üretimi durdur" run'ı iptal eder |
| Blender ve render testleri | `npm run test:blender` (vg_blender birim testleri, Blender 5.2 NVIDIA'da) · `npm run test:render` (gerçek bubblewrap + Blender + eşdeğerlik + GPU önizleme). İkisi de `npm test`'e girmez; vg_blender, sandbox ya da render kodu değişince çalıştır |
| Sahne fixture'ları ve K19 görselleri | `bin/scene-fixtures.sh` (örnek kalemin build çıktıları → `tests/fixtures/scene/kalem/`; vg_blender değişince yeniden üret, farkı incele) · `bin/k19-options.sh` (üç kanal kimliği görseli → `apps/web/public/k19/`) |
| Kanal kimliği (K19) | Ayarlar → Kanal kimliği: üç seçenek; seçim audit'e yazılır ve sonraki build'in `style_id`'si olur. Seçilmemişse `gece_mavisi` geçici olarak kullanılır (build notu "kanal kimliği geçici") |
| Sandbox gereksinimi | Build agent kodunu bubblewrap içinde çalıştırır (`/usr/bin/bwrap`, `VG_BWRAP`). Worker açılışta denetler ve audit'e `render.capabilities` yazar; sandbox yoksa build adımı gerekçeyle düşer, korumasız çalışmaz. Blender `VG_BLENDER` (varsayılan `~/apps/blender-5.2.2-linux-x64/blender`), ffmpeg `VG_FFMPEG`; smoke ve testler `VG_RENDER_DRIVER=fake` ile Blender'sız çalışır |
| Kütüphane | Sol menü → Kütüphane: videolar (son güncellenen önce), durum, tarih, token ve 5 sa payı; satıra tıklamak videoyu Stüdyo'da açar (`/?video=<id>`) |
| Fake kipte üretim | Worker ve API `VG_CLAUDE_DRIVER=fake` ile: araştırma kayıtlı `websearch` akışını, storyboard `basic` akışını oynatır ve fixture artefaktlarını yapılandırılmış çıktı olarak verir. Adında "imkansız" geçen ürün zorluk kapısını dener (`needs_human` + gerekçe) |
| Gerçek uçtan uca doğrulama (geçici DB) | `docs/m4/real-check.md`'deki tarif: `videogen_m4a_check` veritabanı + `/tmp/videogen-m4a-check` veri klasörü, `VG_DATABASE_URL`/`VG_ADMIN_DATABASE_URL`/`VG_DATA_DIR` bunlara yöneltilir, `env -u CLAUDECODE node bin/videogen.mjs`, roller `PUT /api/roles/<rol> {"model":"haiku","effort":"low"}`, `POST /api/videos`; bitince launcher PID'ine SIGINT, DB `DROP … WITH (FORCE)`, klasör silinir. Önce `GET /api/usage/guard`: `blocked: true` ise (5 sa ≥ %80) koşma |
| Taslak ve player (M4c) | Build'den sonra `draft_render` (Remotion, 540×960, sessiz; GPU kilidi + §6.4 ön kontrolü) ve `draft_review` (reviewer_visual: 4×3 kontakt sayfası + `extract_frames` ≤ 12 kare) koşar. İnceleme `revise` derse build…draft_review yeni tura alınır (en çok 2 geri dönüş, başlıkta "Taslak turu k/2 · %N"). Stüdyo'da "Taslak MP4" (varsayılan, HTML5 + Range) ve "Taslak" (canlı `@remotion/player`, yalnızca sekme açıkken) sekmeleri; inceleme kartı bulguları gösterir. Kütüphane satırında kapak ve süre |
| Kısayollar | Boşluk oynat/durdur · J −5 sn · K durdur · L +5 sn · N yeni üretim (ürün adı kutusu). Yazı alanında ve değiştirici tuşla çalışmaz |
| Fake taslak tetikleri | Ürün adında "kusurlu" → ilk inceleme `revise`, ikinci geçer · "umutsuz" → her inceleme `revise`, 2 geri dönüşten sonra `needs_human` · "inatçı" → builder sahneyi değiştirmez, düzeltme turu `needs_human` |
| Final, ses ve otomatik kontrol (M5a) | Taslak incelemesinden sonra `final_render` (Blender EEVEE RGBA PNG; GPU kilidi + §6.4, `extraDiskMb` 2000; yeniden başlatmada hazır kareler atlanır), `compose` (Remotion `Final3D` → teslim kodlaması → SFX + müzik + mastering → `final_music.mp4` / `final_tiktok.mp4`, kapak, `layout.json`) ve `qc` (qc_probe: G1, G5 flaş, G6 + D6/D7). Kapı düşerse video `insan gerekli` + gerekçe; geçerse not "Final video hazır ve otomatik kontrolden geçti." ("yayına hazır" M5b). Stüdyo'da "Final" sekmesi (Müzikli/Müziksiz) ve "Otomatik kontrol" kartı. Terminal run'ın kareleri silinir (`frames.deleted`). **M5b'den itibaren** plan `review` ve `finalize` içerir: qc kapısı düşerse video `insan gerekli` olmaz, `review` düzeltmeye gönderir (not "Otomatik kontrol geçmedi: …. İnceleme düzeltmeye gönderecek.") |
| İnceleme ve düzeltme döngüsü (M5b) | `review` üç reviewer'ı (görsel, doğruluk, izlenme) paralel ve izole oturumlarda koşar; üç oturum başlamadan önce kullanım kapısına bakılır (kapalıysa adım "limit bekleniyor", açılınca üçü birlikte başlar). Reviewer yalnızca kontrol sonucu verir; puan, kapılar ve karar kodla hesaplanır (K13: altı kapı + toplam ≥ 80 + her boyut ≥ %60 → hazır; < 70 → storyboard'a dön; aksi halde düzelt). Toplam 78–82 ise ikinci, bağımsız görsel review koşar. Fixer aynı adımda çalışır (görsel/anlatı → opus, yalnız doğruluk/teknik → sonnet); kapsamı kod hesaplar: storyboard alanı ya da parça etiketi → `compose → qc → review` (kareler yeniden kullanılır), sahne render alanı ya da `product.py` → `build → … → review`, puan < 70 → `storyboard → … → review`. En çok 3 düzeltme turu (`steps.fix_round`; taslak turlarından ayrı), her tur yeni bir `versions` satırı. `finalize` en iyi sürümü seçer, kareleri siler; hazırsa "Yayına hazır · 87,5 puan" (tur > 0 ise " · düzeltme turu k/3"). Stüdyo'da inceleme paneli (puan, 9 boyut çubuğu, 6 kapı rozeti, "Otomatik kontrol" kartı, üç reviewer kartı; bulgudaki zaman kodu Final oynatıcıyı o ana sarar), başlıkta "Düzeltme turu k/3 · %N", kütüphanede puan |
| İzinli müzik (M5b için zorunlu) | Seslendirmesiz bir ürünün "yayına hazır" olabilmesi için defterde izinli en az bir müzik parçası olmalı (`node bin/assets.mjs add --kind music …`). Müzik yoksa yalnız SFX karışımı D6'da düşer, fixer'ın yazabileceği ses spec'i yoktur (M5c'ye kadar) ve video `insan gerekli` ile biter |
| Fake inceleme tetikleri (M5b) | Ürün adında "rötuş" → ilk final turunda görsel `text_readable` + `text_dwell` düşer, fixer vuruş yazısını kısaltır (compose kapsamı), ikinci tur geçer · "geometri" → `mechanism_shot` + `parts_visible` düşer, fixer lensi değiştirir (build kapsamı) · "dengesiz" → izlenme `hook_frame0` + `hook_pattern` düşer (1. tur geçer) · "vasat" → tüm skorlar 0,55 (< 70, storyboard'a dönüş) · "sınırda" → toplam 79,9, ikinci görsel review geçer · "değişmez" → fixer bir şey değiştirmez, `insan gerekli` |
| Müzik ve SFX defteri | `node bin/assets.mjs add --kind music --file parca.mp3 --title "Sakin" --license CC0-1.0 --author "Ad" --license-text lisans.txt [--source URL] [--attribution "…"] [--tags a,b]` · `node bin/assets.mjs list`. İzinli: `CC0-1.0`, `CC-BY-4.0` (`--attribution` zorunlu), `LicenseRef-Pixabay`; diğerleri reddedilip kaydedilir (çıkış 3). Prosedürel CC0 SFX kütüphanesi ilk compose'da `<dataDir>/cache/sfx` altında üretilir ve deftere girer. İzinli müzik yoksa müzikli varyant SFX'ten ibarettir |
| Teslim kodlaması hızı | `VG_ENCODE_PRESET` (varsayılan `slow`; smoke `ultrafast`). Profil her preset'te High kalır |
| QC'yi elle çalıştırmak | `node --import tsx apps/worker/src/render/qc-cli.ts <video.mp4> [--layout layout.json]` → ölçümler + kontroller (JSON) ve `✗` satırları; kapı düşerse çıkış 3. Kalibrasyon: kalem pilotu 7 hatayı vermeli (spec §8.3) |
| Eski smoke senaryoları | `POST /api/videos {…, "until": "draft_review"}` planı o adımda bitirir; yalnızca `VG_DEV_ENDPOINTS=1` iken (aksi 400) |
| Chrome ve GL | Taslak render sistem Chrome'unu kullanır: `VG_CHROME` (varsayılan `/usr/bin/google-chrome`), `chrome-for-testing` kipi, `VG_REMOTION_GL` (varsayılan `angle`; GPU'suz makinede `swangle`). Tarayıcı indirilmez. Player'ın h264 oynatması için Google Chrome gerekir (Chromium'da tescilli codec yok) |
| Bundle önbelleği | `<dataDir>/cache/remotion/<bundleHash>` (~50 MB); şablon değişince yenisi derlenir, en yeni diğeri dışındakiler silinir. Elle silinebilir |
| Başlatıcıyı arka planda çalıştırıp durdurmak | `node bin/videogen.mjs &` → `kill -INT <node PID>`. PID'i başlatıcının kendisinden al: `&` bir `&&` zincirinin içindeyse `$!` alt kabuğun PID'idir ve arka plandaki kabuk SIGINT'i yok sayar |

## 7. Sorun giderme

| Belirti | Olası neden | Çözüm |
|---|---|---|
| `npm install` sonrası bir paket çalışmıyor | npm 12 install script'lerini engelliyor | `npm approve-scripts <paket>` → `npm rebuild <paket>` |
| `docker compose up` port hatası | 5433'ü başka bir süreç tutuyor | `ss -ltnp | grep 5433`; ilgili container'ı durdur |
| Spike'ta "cannot be launched inside another Claude Code session" | `CLAUDECODE` env değişkeni | Spike'lar env'i temizler; elle çalıştırırken `env -u CLAUDECODE ...` |
| Blender yavaş (~3×) | iGPU'ya düşmüş | Daima `blender-gpu`; `gpu.platform.renderer_get()` içinde "NVIDIA" yazmalı |
| Playwright tarayıcı indirmeye çalışıyor | `channel` eksik | Config'te `channel: 'chrome'`; `npx playwright install` **çalıştırma** (disk) |
| Footer'da kullanım "—" | `get_usage` yanıt vermiyor (deneysel API; SDK yükseltmesinde adı ya da şekli değişmiş olabilir) ya da `VG_USAGE_POLL_MS=0` | M0'da `get_usage` çalıştı. Adaptörü yeni SDK'ya göre güncelle; o arada footer `rate_limit_event`'ten beslenir (`docs/m0/report.md` §6) |
| Footer yüzdesi 100 kat yanlış (ör. %1 yerine %100) | Birim karışıklığı: `get_usage` yüzde 0..100 + ISO, `rate_limit_event` kesir 0..1 + epoch sn | Kaynağa göre normalize et; değerin büyüklüğüne bakarak tahmin etme |
| Alt ajanlı oturumda iki `result` geliyor ya da ilk `result`'ta `structured_output` yok | SDK `Agent` çağrısını arka plana aldı | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` env **temizlendikten sonra** ekli mi bak; sürücü son `result`'u almalı ve iterator bitene kadar beklemeli |
| İptalden sonra süreç `Claude Code returned an error result` ile düşüyor | `interrupt()` sonrası `result/error_during_execution` (`aborted_streaming`) gelir, ardından iterator fırlatır | `for await` döngüsünü try/catch içine al; bu hatayı iptal olarak say |
| `PreToolUse` reddi audit'te hook olayı olarak görünmüyor | Callback hook'lar `system/hook_*` olayı üretmez | Reddi `tool_result.is_error` + `PreToolUse:<Araç> hook error:` önekinden ya da `result.permission_denials`'tan oku |
| Fixture diff'inde bütün UUID'ler değişmiş | `spikes/m0/redact.mjs` commit edilmiş bir fixture'a yeniden çalıştırıldı (akış dosyalarında idempotent değil) | `git checkout -- tests/fixtures/claude-streams/`; redact'ı yalnızca yeni kayda, bir kez çalıştır |
| Three.js eşdeğerlik testinde son kare ilk kareyle aynı (~15 px fark) | `AnimationMixer` varsayılanı `LoopRepeat`, klip süresinde 0'a sarar | Her eylemde `setLoop(THREE.LoopOnce, 1)` + `clampWhenFinished = true` |
| "Worker yanıt vermiyor" | Worker çöktü ya da yeniden başlıyor (6 sn heartbeat yok) | `tail ~/videogen-data/logs/worker.log`; başlatıcı otomatik yeniden başlatır. Açılışta yetim Claude süreçleri PID dosyalarından öldürülür, yarım kalan oturumlar `failed` (`worker_restart`) olur |
| Video "insan gerekli", not "Storyboard hazır. Sahne kurulumu ve taslak render bu sürümde henüz yok." | M4a'da plan storyboard'da biter (beklenen) | M4b build ve taslak adımlarını ekler; "yayına hazır" yalnızca planda `finalize` varken (K13) |
| Adım "GPU bekliyor", not "swap %100 ≥ %90" | Spec §6.4 GPU ön kontrolü: swap kullanımı ≥ %90 (bu makinede swap sürekli dolu) | Eşik kullanıcı kararı (M4b öncesi). Geçici çözüm: swap'ı boşalt (`sudo swapoff -a && sudo swapon -a`, yeterli boş RAM varken) |
| Build adımı "render kullanılamıyor: bubblewrap çalışmıyor" | AppArmor ayrıcalıksız kullanıcı ad alanlarını kısıtlıyor (`kernel.apparmor_restrict_unprivileged_userns`) ya da bwrap kurulu değil | `bwrap --ro-bind / / --dev /dev --unshare-net true` ile dene; çalışana kadar build yapılmaz (güvenlik gereği) |
| "GPU NVIDIA değil" | Blender PRIME env'i olmadan Intel iGPU'ya düştü | `bin/blender-gpu` ile `nvidia-smi` kontrol; worker sandbox'ı aynı üç değişkeni koyar |
| "product.py çalıştırması zaman aşımına uğradı" / "bellek sınırını aştı" | Agent'ın `product.py`'si 120 sn ya da 4 GB sınırını aştı | Süreç grubu öldürülür; hata aynı oturuma düzeltme isteği olarak gider |
| "Blender↔three.js anchor eşdeğerliği geçmedi" | Dışa aktarıcı ya da kamera kurgusu iki tarafta farklı sonuç veriyor | `bin/scene-fixtures.sh` + `npm run test:render` ile ayır; kare başına anahtar ve `camera_track.json` bekleniyor |
| Adım "GPU sırası bekleniyor" / kartta "GPU bekliyor · sırada N" | Başka bir önizleme GPU'yu tutuyor ya da §6.4 ön kontrolü (RAM, swap, VRAM, ollama) geçmiyor | Bekle; gerekçe kartta ve adım notunda yazar |
| Video "insan gerekli", not "Hazır 3D varlık gerekiyor…" | Araştırma ürünü `needs_asset` buldu; varlık defteri M5'te | Beklenen (plan B5) |
| Agent kartında "Yeniden dene" yok | Pipeline adımının oturumu: adım kendi yeniden denemesini yapar | Beklenen; "Durdur" çalışır |
| Adım hatası "taslak render başarısız (kod …)" | Chrome bulunamadı ya da Remotion çocuğu düştü | `ls -l ${VG_CHROME:-/usr/bin/google-chrome}`; `worker.log`'daki `VG_ERROR` satırı. `render-cli`'yi elle dene: `node --import tsx packages/remotion/src/render-cli.ts --props … --glb … --out /tmp/d.mp4 --cache /tmp/rc --frames 0-5` |
| "taslak render GPU/WebGL hatasıyla iki kez düştü" (M4c metni) | Chrome'da WebGL bağlamı açılmadı (ANGLE/GPU) | `chrome://gpu`; GPU'suz makinede `VG_REMOTION_GL=swangle` (yavaş: 45 sn taslak ≈ 3,3 dk, 4 çekirdek) |
| "taslak render Chrome hatasıyla iki kez düştü" / "final birleştirme Chrome hatasıyla iki kez düştü" | M5a'dan itibaren aynı metin (taslak ve final ortak Remotion çocuğu). Chrome çöktü ya da WebGL bağlamı açılmadı | Yukarıdaki satır; final WebGL kullanmaz, Chrome'un kendisine bak |
| "final render iki kez çöktü (varsayılan ve 32 örnek)" | Blender final render varsayılan örnekle ve 32 örnekle iki kez sıfırdan farklı kodla çıktı (GPU belleği, sürücü) | `nvidia-smi`; başka GPU işi var mı; audit `render.final` satırları. Hazır kareler korunur, yeniden üretim kaldığı kareden devam eder |
| "final kareler güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)" | `final_render`'dan sonra sahne, `.blend` ya da stil değişti | Run'ı yeniden üret; eski kareler hiçbir zaman birleştirilmez |
| "eksik final kare: N (ilk: fNNNNN)" | Kare dizini yarım (silinmiş ya da kesilmiş PNG) | Yeniden üret; `final_render` eksik kareleri yeniden render eder |
| "final video doğrulamadan geçmedi: …" | Teslim kodlaması spec §7.5'e uymadı (kodek, yuv420p/tv/bt709, boyut, kare sayısı) | Audit `render.final_rejected`; ffmpeg sürümünü (≥ 7) kontrol et |
| "Otomatik kontrol geçmedi: …" | qc kapılarından biri düştü (Teslim, Güvenlik flaş, Güvenli alan). M5b'den itibaren plan `review` içerir, bu bir hata değildir: adım `done` olur, not "Otomatik kontrol geçmedi: …. İnceleme düzeltmeye gönderecek." | Gerekçe ve zaman notta ve QC kartında (Stüdyo'da "Otomatik kontrol" kartı da gösterir); LLM reviewer koşmaz, fixer qc bulgularıyla başlar. Bekle. Plan `review` içermiyorsa (geliştirici `until:'qc'`) video M5a gibi `insan gerekli` olur; elle: `qc-cli` |
| "final video güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)" | `review` (ya da `qc`), müzikli finalin `framesHash`'i ya da qc raporunun müzik sha'sı güncel sahne ve müzikle uyuşmadığı için hiçbir LLM bütçesi harcamadan durdu: final üretildikten sonra sahne, `.blend`, stil ya da müzik değişti | Run'ı yeniden üret; bayat final hiçbir zaman incelenmez. (Final kareler için aynı durumun metni "final kareler güncel sahneyle uyuşmuyor …" satırında) |
| Not "final düzeltme turu: taslak incelemesi atlandı (§7.2)" | Beklenen: build kapsamlı bir final düzeltme turunda `draft_render` yeniden koşar ama `draft_review` yeniden çalışmaz (final turlarında taslak incelemesi §7.2'ye göre yoktur) | Bir şey yapma; review final üzerinde yapılır. Taslak turu sayacı (`k/2`) artmaz |
| Not "3 düzeltme turundan sonra eşik geçilemedi: …" (video `insan gerekli`) | `fixRound ≥ 3`: üç fixer turundan sonra karar hâlâ hazır değil. Not en iyi sürümü, puanını ve açık bulguları söyler ("en iyi sürüm tur N (X puan). Açık bulgular: …") | İnsan kararı: inceleme paneli ve kareler. Videoyu chat'ten sürdürebilirsiniz (`request_rerender`, M7'de tam yol); kütüphane en iyi sürümün final'ini ve puanını gösterir |
| Not "aynı kontrol düzelip yeniden bozuldu; döngü durduruldu" (`insan gerekli`) | Salınım: izlenen bir kontrol (kapı, ≥ 3 puanlı ya da qc kapı kontrolü) F→P→F gitti; döngü erken durdu | Açık bulgular ve en iyi sürüm notta; kontrolün iki turdaki kanıtını panelde karşılaştır, elle düzelt ya da chat'ten sürdür |
| Not "düzeltme turu hiçbir şeyi değiştirmedi: N puan" (`insan gerekli`) | Fixer ne storyboard, sahne render alanı, `product.py` ne de parça etiketi değiştirdi (ya da yalnızca `cta`/`loop_strategy`/`research`'e dokundu, bunlar render etmez; fixer araştırmayı değiştiremez). Hesaplanan kapsam `none` | Açık bulgular notta; modeli büyütüp (Ayarlar → fixer) yeniden üret ya da elle düzelt. Müziksiz üründe D6 düşüşü tipik nedendir (aşağıya bak) |
| Not "kullanım sınırı yakın; yeni düzeltme turu başlatılmadı: N puan" (`insan gerekli`) | Kullanım muhafızı kapalıyken yeni fixer turu başlamaz (tek run 5 sa penceresini taşmasın). Video iyi ama hazır olmayan sürümde kalır | Muhafız açılınca (footer'daki saat) videoyu chat'ten sürdür; `GET /api/usage/guard` |
| Not "düzeltme yapacak ajan bağlı değil" (`insan gerekli`) | Planda `review` var ama fixer bağlı değil (yalnızca geliştirici/test kurulumu) | Üretim kurulumunda görülmez; `pipelineExecutors` varsayılanı fixer'ı bağlar |
| Video "insan gerekli", D6 (Ses) düşük, müzik yok (not "… düzeltme turu hiçbir şeyi değiştirmedi …" ya da "… eşik geçilemedi …") | Defterde izinli müzik yok; yalnız SFX karışımı sessizlik/loudness'ta düşer ve `silent` modda fixer'ın yazabileceği ses spec'i yoktur (M5b sınırı) | İzinli bir müzik parçası ekle (`node bin/assets.mjs add --kind music …`) ve yeniden üret; ya da chat'ten sürdür (M7). Seslendirme/ses spec'i M5c'de gelir |
| Adım "limit bekleniyor" ve not "Kullanım sınırı yakın: …" `review` adımında | Üç reviewer'ın fan-out'u kullanım kapısına tek birim olarak uyar; kapı kapalıyken üç oturum da başlamaz | Bekle; açılınca üçü birlikte başlar. Tek reviewer limite çarparsa o oturum sıfırlanmada kendini sürdürür |
| "Düzeltme turu k/3" başlıkta, kartta "İnceleme" altında fixer görünür | Beklenen: fixer `review` adımının içinde koşar (ayrı adım yok) | Bir şey yapma; tur ilerlemesi kendi yüzdesiyle ilerler, genel yüzde review'un sonundaki değerde sabit kalır |
| Not "… müzik defterinde izinli parça yok (bin/assets.mjs add)" | Defterde `allowed` müzik yok; müzikli varyant yalnız SFX | Bir CC0/Pixabay/CC-BY parça ekle (yukarıdaki komut) ve yeniden üret |
| "lisans kapısı: izinsiz ses/müzik: …" | Ses planındaki bir varlık defterde izinli değil | `node bin/assets.mjs list`; varlığı izinli lisansla yeniden içe aktar |
| "taslak MP4 doğrulamadan geçmedi" | ffprobe çıktısı spec §7.5'e uymuyor (yuv420p, tv, bt709, 30/1, boyut, kare sayısı) | Audit `render.draft_rejected` gerekçeyi yazar; Remotion sürümü ya da `pixelFormat/colorSpace` değişmiş olabilir |
| "taslak güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)" | Render'dan sonra sahne, stil ya da `packages/remotion/src` (bundle hash'i) değişti | Run'ı yeniden üret. Geliştirme sırasında Remotion kodunu değiştirmek çalışan run'ı düşürür (beklenen) |
| "Düzeltme turu sahneyi değiştirmedi; taslak yeniden incelenmedi" | Builder düzeltme turunda GLB'yi ve sahne spec'ini aynı bıraktı | Açık bulgular notta; elle düzelt ya da modeli büyütüp yeniden üret |
| "2 taslak turundan sonra açık bulgu: …" | İki geri dönüşten sonraki inceleme de `revise` dedi | İnsan kararı: inceleme kartındaki bulgular ve kareler |
| Video "sırada", not "Kullanım sınırı yakın: üretim sınır açılınca kendiliğinden başlar (açılış SS:DD)." | Run başlatma kullanım kapısı (§6.4) | Bekle; muhafız açılınca run kendiliğinden başlar |
| "Taslak" sekmesinde siyah canvas | Tarayıcıda WebGL yok | `chrome://gpu`; "Taslak MP4" sekmesi her zaman çalışır |
| "Taslak MP4" oynamıyor (`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`) | Tarayıcı Chromium (h264 yok) | Google Chrome kullan |
| Run "sırada"da kaldı | `run.start` komutu worker'a ulaşmadı (worker yeniden başlıyordu) | Worker açılışta `queued` run'ları kendisi başlatır: worker'ı yeniden başlat (başlatıcı yeniden başlatır) |
| Adım notu "yeniden deneniyor (2/2)" | Yürütücü geçici hatayla döndü; bir kez daha denenir | Bekle; ikinci hatada adım ve run `failed` olur, gerekçe başlıkta |
| Adım hatası "şema hatası: …" | Agent, yapılandırılmış çıktıyı aynı oturumda 2 düzeltme isteğine rağmen sözleşmeye uyduramadı | Hata listesine bak (`GET /api/runs/<id>`); rol modelini büyüt (Ayarlar → Agent rolleri) ve yeniden üret |
| Adım "limit bekleniyor" | Kullanım limiti reddi: adım aynı Claude oturumunu sıfırlanma anında kendisi sürdürür | Bekle; footer'daki muhafız çipi açılma saatini gösterir |
| Agent kartında "Takılmış olabilir" | 120 sn olay yok **ve** CPU < %1 (spec §12.3) | "Durdur" oturumu `cancelled` yapar; "Yeniden dene" aynı Claude oturumunu `resume` ile yeni bir alt oturumda sürdürür. Yalnızca "son olay N sn önce · süreç canlı" yazıyorsa agent çalışıyordur, bekle |
| Chat mesajının altında "Durduruldu" | "Durdur" ile interrupt gönderildi | Beklenen: o turun süreci kapatılır (`cancelled`). Bir sonraki mesaj aynı Claude oturumunu `resume` ile yeni bir süreçte sürdürür (konuşma geçmişi korunur) |
| Footer'da "Yeni işler bekletiliyor: 5 sa %82, 14:00'de açılır" | Kullanım muhafızı: 5 sa ≥ %80 ya da 7 gün ≥ %90, veya limit reddi | Yeni pipeline oturumu başlamaz, chat çalışır. Belirtilen saatte kendiliğinden açılır; `GET /api/usage/guard` |
| Başlatıcı "skill hedefi bulunamadı, atlandı" der | `skills.manifest.json`'daki bir hedef dizin yok (ör. `~/Developer/video-use`) | Hedefi kur ya da manifestten çıkar; eksik skill yalnızca o skill'i kullanan role eksik gelir |
| `ui_events`'e doğrudan `INSERT` "permission denied" ile reddediliyor | Bilinçli: sıra DB'de zorlanır, yazma yalnızca `vg_publish_event()` ile | Kodda `publishEvent()` kullan; elle olay eklemek gerekiyorsa `SELECT vg_publish_event(...)` |
| API kapanırken "[event-hub] pump failed … Cannot use a pool after calling end on the pool" | Kapanışta havuz kapanırken uçuşta bir olay okuması vardı | Yalnızca kapanış günlüğü; olay kaybı yok (istemci yeniden bağlanınca replay eder) |
| Üstte "Bağlantı koptu" şeridi | API yeniden başladı | Kendiliğinden yeniden bağlanır; kaçan olaylar tekrar oynatılır |
| Açılış "Ücretli API anahtarı bulundu" ile reddedildi | Kabukta anahtar export edilmiş | `unset <ANAHTAR>`; `~/.bashrc` / `~/.profile` içinden kaldır |
| `[videogen] 127.0.0.1:5180 dolu` | Başka bir VideoGen örneği ya da başka bir süreç 5180'i tutuyor | `ss -ltnp | grep 5180` ile PID'i bul, o süreci PID ile durdur (`kill <PID>`); sonra `npm start` |
| Postgres yeniden başladıktan sonra api/worker günlüklerinde yeniden başlatmalar | Beklenen: worker crash-only (LISTEN bağlantısı kopunca çıkar), başlatıcı backoff ile (1→2→4… 30 sn) yeniden başlatır | Bir şey yapma; birkaç saniye içinde footer yeniden "Worker canlı" olur |
| Elle `npm run build` sonrası boş sayfa / eksik dosya | API statik dosyaları açılışta kaydeder; derleme dosya adlarını değiştirdi | API'yi yeniden başlat (`npm start` her zaman önce derler) |
| `başarısız: docker compose … (spawnSync docker ENOENT)` | `docker` PATH'te yok ya da kurulu değil | Docker'ı kur/başlat, `docker ps` çalışıyor mu bak; 127.0.0.1:5433 boş mu kontrol et |
| Ses venv'inde `import torch` / `import chatterbox` başarısız (paketler kaybolmuş), ortada bir `uv.lock` var | Birisi `python/audio_service` içinde `uv sync` çalıştırdı: pyproject chatterbox/torch'u listelemez, sync onları **siler** (M1 Task 3'te oldu) | `cd python/audio_service && rm -f uv.lock && uv pip install --python .venv -r requirements.freeze.txt && uv pip install --python .venv --no-deps -e .`; doğrula: `uv pip freeze --python .venv/bin/python \| grep -v '^-e' \| diff - requirements.freeze.txt` boş. **`uv sync` asla** (`PINS.md`) |
| faster-whisper WAV açamıyor: `TypeError` (`av.open(..., metadata_errors=...)`) | `av` 19.x faster-whisper 1.2.1 ile uyumsuz | `cd python/audio_service && uv pip install --python .venv av==16.1.0` (freeze'de zaten sabit; freeze'den yeniden kurulumla gelir) |
| Freya / Whisper ağırlıkları `~/videogen-data/models` altında yok, yeniden iniyor sanılıyor | Bu makinede `HF_HOME=~/gpu-server/hf-cache` (`~/.bashrc`'de export; kullanıcının paylaşılan önbelleği); Freya, VoxCPM2 `audiovae.pth` ve Whisper turbo oraya iner. Yalnız Chatterbox `~/videogen-data/models/chatterbox`'ta | Önbelleği silme; disk hesabında `du -sh ~/gpu-server/hf-cache` ayrıca say. Sabit anlık görüntüler `python/audio_service/PINS.md`. **Ses servisi `HF_HOME`/`download_root`'u kendisi ayarlamalı:** `HF_HOME` yalnızca `~/.bashrc`'nin etkileşimli bölümünde export edilir, etkileşimsiz süreçler (işçi, systemd, cron) onu okumaz; `align.transcribe_words` yoksa `~/videogen-data/models/hf/hub`'a düşer ve yeniden indirir |
