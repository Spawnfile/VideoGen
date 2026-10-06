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
| `docs/superpowers/plans/2026-10-06-m3a-agent-runtime.md` | M3a: agent çalışma katmanı (sürücü, roller, MCP, koruma, olay tabloları, kullanım muhafızı, chat servisi, API). M3b planı (arayüz + smoke) M3a bitince yazılır |
| `docs/superpowers/checklist.md` | Görev bazında ilerleme takibi |
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
- **M3 iki plana bölündü** (17 görev): M3a (agent çalışma katmanı) → M3b (arayüz + smoke S3/S4/S5). M3 raporu, son review ve `main`'e birleştirme M3b'nin sonundadır.

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
| Smoke | `npm run test:smoke`: kendi yığınını port **5190** ve `videogen_smoke` veritabanıyla kurar, her koşuda web'i derler. `videogen_smoke` DB'si ve `/tmp/videogen-smoke-*` bir sonraki koşuya kadar kalır (sonraki koşu DB'yi silip yeniden oluşturur) |

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
| "Worker yanıt vermiyor" | Worker çöktü ya da yeniden başlıyor | `tail ~/videogen-data/logs/worker.log`; başlatıcı otomatik yeniden başlatır |
| Üstte "Bağlantı koptu" şeridi | API yeniden başladı | Kendiliğinden yeniden bağlanır; kaçan olaylar tekrar oynatılır |
| Açılış "Ücretli API anahtarı bulundu" ile reddedildi | Kabukta anahtar export edilmiş | `unset <ANAHTAR>`; `~/.bashrc` / `~/.profile` içinden kaldır |
| `[videogen] 127.0.0.1:5180 dolu` | Başka bir VideoGen örneği ya da başka bir süreç 5180'i tutuyor | `ss -ltnp | grep 5180` ile PID'i bul, o süreci PID ile durdur (`kill <PID>`); sonra `npm start` |
| Postgres yeniden başladıktan sonra api/worker günlüklerinde yeniden başlatmalar | Beklenen: worker crash-only (LISTEN bağlantısı kopunca çıkar), başlatıcı backoff ile (1→2→4… 30 sn) yeniden başlatır | Bir şey yapma; birkaç saniye içinde footer yeniden "Worker canlı" olur |
| Elle `npm run build` sonrası boş sayfa / eksik dosya | API statik dosyaları açılışta kaydeder; derleme dosya adlarını değiştirdi | API'yi yeniden başlat (`npm start` her zaman önce derler) |
| `başarısız: docker compose … (spawnSync docker ENOENT)` | `docker` PATH'te yok ya da kurulu değil | Docker'ı kur/başlat, `docker ps` çalışıyor mu bak; 127.0.0.1:5433 boş mu kontrol et |
| Ses venv'inde `import torch` / `import chatterbox` başarısız (paketler kaybolmuş), ortada bir `uv.lock` var | Birisi `python/audio_service` içinde `uv sync` çalıştırdı: pyproject chatterbox/torch'u listelemez, sync onları **siler** (M1 Task 3'te oldu) | `cd python/audio_service && rm -f uv.lock && uv pip install --python .venv -r requirements.freeze.txt && uv pip install --python .venv --no-deps -e .`; doğrula: `uv pip freeze --python .venv/bin/python \| grep -v '^-e' \| diff - requirements.freeze.txt` boş. **`uv sync` asla** (`PINS.md`) |
| faster-whisper WAV açamıyor: `TypeError` (`av.open(..., metadata_errors=...)`) | `av` 19.x faster-whisper 1.2.1 ile uyumsuz | `cd python/audio_service && uv pip install --python .venv av==16.1.0` (freeze'de zaten sabit; freeze'den yeniden kurulumla gelir) |
| Freya / Whisper ağırlıkları `~/videogen-data/models` altında yok, yeniden iniyor sanılıyor | Bu makinede `HF_HOME=~/gpu-server/hf-cache` (`~/.bashrc`'de export; kullanıcının paylaşılan önbelleği); Freya, VoxCPM2 `audiovae.pth` ve Whisper turbo oraya iner. Yalnız Chatterbox `~/videogen-data/models/chatterbox`'ta | Önbelleği silme; disk hesabında `du -sh ~/gpu-server/hf-cache` ayrıca say. Sabit anlık görüntüler `python/audio_service/PINS.md`. **Ses servisi `HF_HOME`/`download_root`'u kendisi ayarlamalı:** `HF_HOME` yalnızca `~/.bashrc`'nin etkileşimli bölümünde export edilir, etkileşimsiz süreçler (işçi, systemd, cron) onu okumaz; `align.transcribe_words` yoksa `~/videogen-data/models/hf/hub`'a düşer ve yeniden indirir |
