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
| `docs/superpowers/plans/2026-10-06-m4b-scene-core.md` | M4b: sahne çekirdeği (vg_blender, iki aşamalı sandbox'lı build, Blender↔three.js eşdeğerliği, GPU önizleme, build adımı, medya ucu, K19 seçenekleri, smoke S2b). M4c planı (taslak render, inceleme, player, ilk gerçek ürün) sırada |
| `docs/superpowers/checklist.md` | Görev bazında ilerleme takibi |
| `docs/m3/report.md`, `docs/m3/real-check.md` | M3 sonuç raporu ve gerçek Claude doğrulama çıktıları |
| `docs/m4/m4a-summary.md`, `docs/m4/real-check.md`, `docs/m4/m4b-summary.md` | M4a özeti (pipeline omurgası), gerçek (haiku) doğrulama çıktıları ve M4b özeti (sahne çekirdeği); M4 raporu M4c sonunda |
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
- **M4 üç plana bölündü:** M4a (pipeline omurgası) ve M4b (sahne çekirdeği: storyboard → doğrulanmış 3D sahne) **tamamlandı** ve kullanıcı kararıyla `main`'e birleştirildi (`docs/m4/m4a-summary.md`, `docs/m4/m4b-summary.md`); M4c (taslak render, taslak inceleme, player, ilk gerçek ürün, M4 raporu) sırada.

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
| Ekran görüntüleri | `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens` → `docs/m3/*.png` (M3) ve `docs/m4/*.png` (M4: `-g M4`) |
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
