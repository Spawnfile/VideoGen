# M0 Doğrulama Raporu

| | |
|---|---|
| Tarih | 2026-10-06 |
| Dal | `m0-verification` (main `896983c`'den) |
| Durum | Tamamlandı. (a), (a2), (b), (d) geçti; (c) kısmen (v1'de yedek plan). Çürütülen varsayım yok. Yeni bir risk bulundu (SDK alt ajanı arka plana alabiliyor) ve ek bir sondajla (e) kapatıldı |
| Kanıt kaynakları | `.superpowers/sdd/2026-10-06-m0-verification/task-*-report.md`, `docs/m0/disk-cleanup.md`, `tests/fixtures/claude-streams/`, `spikes/m0/` |

Bu rapor spec §18'deki varsayımları kanıtla kapatır. Her spike için: **Varsayım · Sonuç · Kanıt · Spec'e etkisi.** Spec ve runbook bu rapora göre güncellendi.

## 1. Özet

| Spike | Varsayım | Sonuç |
|---|---|---|
| (a) | Gömülü binary kullanıcının OAuth girişini kullanır; izolasyon çalışır | **geçti** |
| (a2) | Alt ajan + yapılandırılmış çıktı, WebSearch, kodlama diff'i, `PreToolUse` koruması, `interrupt()` | **geçti** (alt ajan için yeni bulgu: arka plan → birden fazla `result`) |
| (b) | `get_usage` sıfır token harcar | **geçti** (birimler `rate_limit_event`'ten farklı) |
| (c) | `auth login` TTY olmadan çalışır | **kısmen** (URL ve kod istemi var; kod yapıştırma yolu test edilmedi) → v1'de (ii) |
| (d) | Blender GLB → Three.js anchor eşdeğerliği ≤ 8 px | **geçti** (0,00 px; LoopOnce + clamp şart) |
| (e) ek | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` alt ajanı ön planda tutar | **geçti** (1/1 koşu + SDK tipleri) |

🚦 Kapılar: minillm-lab temiz (silindi) · `apiKeySource: none` · `PreToolUse` kaçışı engelledi. Üçü de geçti.

## 2. Disk temizliği (Task 1)

| | Boş | Kullanım |
|---|---|---|
| Önce (04:00:06) | 8,1 GB | %94 |
| Sonra (04:00:30) | **32 GB** | %77 |

- Silinenler: `gemma4:e4b`, `gemma4:e2b` (16,8 GB), npm/go/uv önbellekleri, `jet-engine` ve `remotion-test` `node_modules`'ları, `minillm-lab` (8,7 GB).
- **Chrome önbelleği atlandı** (Chrome açıktı, 1,1 GB). Eşik yine tuttu (≥ 30 GB).
- minillm-lab kapısı: status / unpushed / stash boş; HEAD = `origin/main` `eae3905`; yok sayılanlar yalnızca `.venv`'ler.
- Ayrıntı: `docs/m0/disk-cleanup.md`. Rapor anında: `/dev/nvme0n1p5  141G  103G   31G  78% /`.

## 3. Gömülü binary ve taban maliyet

| | Değer |
|---|---|
| SDK | `@anthropic-ai/claude-agent-sdk` 0.3.290 |
| Gömülü CLI | `spikes/m0/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude` → `2.1.290 (Claude Code)`, 249.687.224 bayt |
| `basic` oturumu (haiku, "Reply with exactly: OK", soğuk önbellek) | `input_tokens` 10 · `cache_creation_input_tokens` **29.962** (tamamı `ephemeral_1h`) · `cache_read` 0 · `output_tokens` 51 (44'ü thinking) |
| Alt ajanlı oturum (haiku) | 31.353 cache_creation + 30.202 cache_read (a2); 30.596 + 29.311 (e) |

Taban maliyet ~30K token. Spec §3'teki ~21K tasarım ölçümüydü; yeni değer spec'e işlendi.

## 4. Spike (a): abonelik girişi ve izolasyon

**Varsayım.** SDK'nın gömülü binary'si `~/.claude` OAuth girişini kullanır. `settingSources: []` + `strictMcpConfig` ile kullanıcının hook, plugin, MCP ve skill'leri yüklenmez. Plugin üzerinden symlink'li skill'ler yüklenir.

**Sonuç: geçti.**

**Kanıt** (`env -u CLAUDECODE node spikes/m0/a-auth-isolation.mjs` → `PASS`, tek koşu):
```
"claude_code_version": "2.1.290",
"apiKeySource": "none",
"model": "claude-haiku-4-5-20251001",
"skills": [ "deep-research", "videogen:ffmpeg", "videogen:manim-video", "videogen:remotion-best-practices", ...
            "videogen:remotion-render", "videogen:video-use", "design", ... ],
"plugins": [ "videogen", "cc-plugin-agents-md", "cc-plugin-telemetry", "cc-plugin-plugin-authoring" ],
"mcp_servers": [],
"hookEvents": [],
```
- Kullanıcının skill'leri (grilling, last30days, telegram, video-vision…) yok. Agent'lar sadece yerleşikler: claude, Explore, general-purpose, Plan, statusline-setup.
- Plugin skill'leri **`videogen:<ad>`** adıyla gelir. CLI'ın gömülü skill'leri ve 3 `cc-plugin-*` (yol `builtin`) her zaman listededir.
- `rate_limit_event` her oturumda bir kez, `system/status`'tan hemen sonra gelir: `{status:"allowed", resetsAt:1791252000, rateLimitType:"five_hour", unifiedWindows:{five_hour:{utilization:0.58,…}, seven_day:{utilization:0.15,…}}}`.

**Spec'e etkisi.** §6.1 kimlik doğrulama ve `plugins` satırı "doğrulandı" oldu; skill adları `videogen:*`. §3 taban maliyet ~30K. §18 satır 1 güncellendi. Kullanıcı CLI'sıyla **eşzamanlı token yenilemesi** ayrıca zorlanmadı. M0 boyunca kullanıcının oturumu ve spike'lar aynı girişle sorunsuz çalıştı; risk M3'te izlenir.

## 5. Spike (a2): alt ajan, WebSearch, kodlama, koruma, iptal

**Varsayım.** Rol agent'ı + `outputFormat` şeması doğrulanmış JSON döner. WebSearch ve Write/Edit olayları ThinkingState için gereken alanları taşır. `dontAsk` altında `PreToolUse` hook'u run klasörü dışına yazmayı engeller. `interrupt()` sonrası bir `result` gelir.

**Sonuç: geçti.** Alt ajan için yeni bir davranış bulundu (aşağıda).

**Kanıt** (`env -u CLAUDECODE node spikes/m0/a2-fixtures.mjs`, düzeltme turundan sonraki son tam koşu → `PASS`):
```
websearch tool_use_result keys: [ 'query', 'results', 'durationSeconds', 'searchCount' ]
interrupt result: error_during_execution aborted_streaming
interrupt tail types: [ 'assistant','user','stream_event','stream_event','stream_event','result/error_during_execution' ]
denied: [ '<home>/gpu-server/VideoGen/spikes/m0/work/OUTSIDE.txt' ]
```

| Alt spike | Gözlem (M3 için) |
|---|---|
| subagent | Araç adı `Agent` (init `tools`'ta `Task` da var). `system/task_started{subagent_type:"storyboarder", is_backgrounded, task_type:"local_agent"}` → `task_updated` → `task_notification` → ebeveyne `user` tool_result. Alt ajan mesajları `parent_tool_use_id` taşır; alt ajanın `stream_event`'leri iletilmez. **`task_progress` hiç gelmedi.** Yapılandırılmış çıktı: model sentetik `StructuredOutput` aracını çağırır; `result.structured_output` (nesne) ve `result.result` (aynı JSON metin) birlikte gelir |
| websearch | `tool_use{name:"WebSearch", input:{query, mode}}`. `tool_use_result.results` bir grup dizisidir: `{tool_use_id, content:[{title,url}]}`. `result.usage.server_tool_use.web_search_requests` arama yapılmasına rağmen **0** kaldı; sayaç olarak `searchCount` kullanılır |
| coding | Write (create): `structuredPatch: []` boş → "+N satır" `content`'ten sayılır. Edit: `structuredPatch[].lines` içindeki `+`/`-` satırları |
| guard | Model önce dışarıya yazmayı denedi; hook reddetti, `OUTSIDE.txt` yok, `./inside.txt` yazıldı. Model görür: `tool_result{is_error:true, content:"PreToolUse:Write hook error: Writes are confined to the run directory …"}`. `result.permission_denials` red kaydını taşır. `includeHookEvents: true` olsa da callback hook'lar için `system/hook_*` olayı **gelmedi** |
| interrupt | Sıra: kısmi `assistant` → `user` "[Request interrupted by user]" → kalan `stream_event`'ler → `result{subtype:"error_during_execution", terminal_reason:"aborted_streaming", is_error:true}` → ardından **iterator fırlatır**: `Error: Claude Code returned an error result: [ede_diagnostic] result_type=user …` |

**Yeni bulgu: arka plana alınan alt ajan.** SDK, model `run_in_background` istemese de `Agent` çağrısını arka plana alabiliyor. Bu durumda tek sorguda **birden fazla `result`** ve ikinci bir `system/init` gelir:
```
subagent-background.ndjson 5354  task_started true
subagent-background.ndjson 15537 result success structured_output=false result_index=0
subagent-background.ndjson 15948 init
subagent-background.ndjson 21182 result success structured_output=true  result_index=1
```
Bayraksız üç koşunun ikisinde arka plana alındı, birinde ön planda kaldı (deterministik değil). Ek sondaj (e) bayrağın bunu önlediğini gösterdi (§10).

**Spec'e etkisi.** §6.1 (`env` satırı: bayrak temizlikten sonra yeniden eklenir; `permissionMode` ve `outputFormat` ayrıntıları), §6.4 (iptal sırası: iterator'ın fırlattığı hata yakalanır), §12.2 (`task_progress`'e dayanılmaz), §13.2 (Write create ve arama sayacı), §15 (korumanın kapsamı), §16.1 (fixture listesi), §18 yeni satırlar.

**Fixture'lar** (`tests/fixtures/claude-streams/`, satır): basic 48 · coding 266 · guard 312 · interrupt 177 · subagent 1152 · subagent-background 880 · subagent-nobg 459 · websearch 347 · usage-response.json 1. Hepsinin her satırı `JSON.parse` ediliyor; `grep -lE 'alper|@gmail' … | wc -l` → `0`.

## 6. Spike (b): sıfır token kullanım okuma

**Varsayım.** `get_usage` kontrol çağrısı model turu açmadan 5 saatlik ve haftalık pencereleri döner.

**Sonuç: geçti.**

**Kanıt** (`env -u CLAUDECODE node spikes/m0/b-usage.mjs` → `PASS`, ~1,9 sn duvar saati):
- SDK yöntemi planlandığı adla var: `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({skipBehaviors:true})` (`sdk.d.ts:3056`, kontrol isteği `get_usage`).
- Sıfır token: iterator **0 mesaj** üretti; `session.total_cost_usd = 0`, `total_api_duration_ms = 0`, `model_usage = {}`.
- Yanıt: `subscription_type: "max"`, `rate_limits_available: true`, `rate_limits.five_hour = {utilization: 61, resets_at: "2026-10-06T02:00:00.356002+00:00", …}`, `seven_day = {utilization: 16, …}`.
- Gecikme (usage + accountInfo): 917 / 595 / 911 ms. Kapatma: giriş üreteci bitince CLI temiz çıktı.

**Birimler (M2 için kritik):**

| Kaynak | `utilization` | Sıfırlanma |
|---|---|---|
| `get_usage` → `rate_limits.{five_hour,seven_day}` | **yüzde 0..100** (61) | `resets_at`: ISO 8601 metin |
| `rate_limit_event` → `rate_limit_info.unifiedWindows.*` | **kesir 0..1** (0.58) | `resetsAt`: epoch saniye |

**M2 footer kararı:** Birincil kaynak **`get_usage`** yoklaması (canlı tur olmadan da çalışır). `rate_limit_event` canlı tazeleme ve deneysel API bozulursa yedek. M2 eşleyicisi **kaynağa göre** normalize eder (`get_usage`: her zaman `/100` ve `Date.parse`; `rate_limit_event`: olduğu gibi ve `×1000`). Büyüklüğe göre tahmin (`v > 1 ? v/100 : v`) yanlıştır: `get_usage`'taki %1 değeri %100 gösterilir.

**Spec'e etkisi.** §6.4 kullanım muhafızına birimler eklendi. §18 satır 2 güncellendi. Yöntem adı deneysel kalır: SDK tam sürüme sabitli ve tek adaptörün arkasında.

## 7. Spike (c): TTY olmadan `auth login`

**Varsayım.** `claude auth login` TTY olmadan çalışır; Ayarlar ekranı girişi tarayıcıdan tamamlatabilir.

**Sonuç: kısmen.** URL basılıyor ve stdin'den kod isteniyor. Ancak kod yapıştırma yolu **test edilmedi** (gerçek bir girişi tamamlamak yasaktı).

**Kanıt** (izole `CLAUDE_CONFIG_DIR`, `BROWSER=/bin/true`, stdin kullanılmayan pipe):
```
Opening browser to sign in…
If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=…&…&state=…
Paste code here if prompted >
```
- `ss -ltnp`: çocuk süreç `127.0.0.1:<geçici port>` dinliyor. İki yol yarışıyor: localhost callback (tarayıcı aynı makinedeyse) ve elle kod yapıştırma.
- 15 sn sonra hâlâ bekliyordu; SIGTERM ile çıkış 143. İzole klasörde kimlik dosyası oluşmadı.
- Gerçek giriş dokunulmadı: `auth status` öncesi ve sonrası `loggedIn true, claude.ai, max`; `~/.claude/.credentials.json` boyut ve mtime aynı.

**Giriş akışı kararı:** v1'de **(ii)**: Ayarlar terminalde `! claude auth login` talimatını gösterir ve `auth status`'u 5 sn'de bir yoklar. (i) (ekranda URL + kod yapıştırma) uygulanabilir görünüyor; **v1.1**'de gerçek ve bilinçli bir giriş testiyle prototiplenir. Gerekçe: oturum başına uzun yaşayan bir `auth login` çocuğu, zaman aşımı, localhost yarışı ve kararlı sözleşme olmayan CLI çıktısının ayrıştırılması gerekir. Localhost callback olduğu için (ii) aynı makinedeki terminalden tarayıcıyla sorunsuz tamamlanır.

**Spec'e etkisi.** §13.1 Ayarlar satırı ve §18 satır 3 güncellendi. Karar §18'in yedek planıyla aynı; K2 değişmez.

## 8. Spike (d): Blender GLB → Three.js anchor eşdeğerliği

**Varsayım.** Blender'ın dışa aktardığı GLB Node'da `three` ile yüklenip aynı kamera ve animasyonla izdüşürüldüğünde anchor ekran konumları Blender'la ≤ 8 px uyuşur.

**Sonuç: geçti** (Blender 5.2.2, three 0.186.1).

**Kanıt** (`blender-gpu -b --factory-startup -P spikes/m0/d-scene.py -- "$OUT"` + `node spikes/m0/d-equivalence.mjs "$OUT"`):
```
frame 60 tip: blender(540.0, 1432.7) three(540.0, 1432.7) Δ=0.00px
frame 60 cap: blender(540.0, 336.2) three(540.0, 336.2) Δ=0.00px
frame 60 side: blender(568.1, 799.0) three(568.1, 799.0) Δ=0.00px
worst Δ = 0.00 px (threshold 8)
exit=0
```
- Plan kodunun ilk koşusu `worst Δ = 14.77 px` ile kaldı: kare 60, kare 0'ın değerlerini verdi. Neden: `AnimationAction` varsayılanı `LoopRepeat`; `mixer.setTime(2.0)` klip süresine eşit olduğu için 0'a sarar. Düzeltme: `setLoop(THREE.LoopOnce, 1)` + `clampWhenFinished = true`. Eşik değişmedi.
- Negatif kontroller (review): 20 px kaydırma ve 50 mm lens → çıkış 1.

**GLB gerçekleri (M4'ün eşdeğerlik testi için):**
- Kamera: `{"type":"perspective","perspective":{"aspectRatio":0.5625,"yfov":0.4173635244369507,"znear":0.1,"zfar":1000}}`. `yfov = 2·atan(18/85)` (fark 1,3e-8°): 85 mm lens, 36 mm sensör, `sensor_fit AUTO` dikey karede sensörü yüksekliğe uygular. Ek dikey düzeltme gerekmez.
- Kamera animasyonu kare kare pişirilir (`nla.bake visual_keying=True, clear_constraints=True`): 61 anahtar, 0..2,0 sn. Her düğüm kendi klibini alır (7 animasyon); tek mixer ile hepsi oynatılır; zaman ofseti 0.
- Z-yukarı → Y-yukarı dönüşümünü dışa aktarıcı yapar: Blender `(x, y, z)` → glTF `(x, z, −y)`.
- **Birimler 1:1** (dışa aktarıcı ölçeklemez). "1 birim = 1 cm" bir konvansiyondur; builder tarafında uygulanır.
- `anchor_<ad>` boşlukları adıyla bulunur. Piksel konvansiyonu: Blender `(1 − v.y)·H` = three `(1 − p.y)/2·H`.

**Spec'e etkisi.** §7.3 eşdeğerlik maddesine M0 sonucu, LoopOnce + clamp ve kamera/birim gerçekleri eklendi. §18'e doğrulanmış satır eklendi.

## 9. 🚦 Kapı sonuçları

| Kapı | Sonuç | Kanıt |
|---|---|---|
| minillm-lab'da kaybolacak iş | temiz → silindi | status / unpushed / stash boş; HEAD = `origin/main` `eae3905` |
| `apiKeySource` | `none` → geçti | spike (a) JSON özeti |
| `PreToolUse` yol koruması | kaçışı engelledi → geçti | `permission_denials` = [Write `…/work/OUTSIDE.txt`]; dosya yok; `inside.txt` var |

## 10. Ek sondaj (e): arka plan görevleri kapalıyken alt ajan

**Neden.** Spec §6.1 pipeline rollerinde `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` der. Ama `lib.mjs` `cleanEnv()` tüm `CLAUDE_CODE_*` değişkenlerini sildiği için spike'lar bu bayrağı hiç denemedi.

**Yöntem.** `spikes/m0/e-no-background.mjs`: a2'deki alt ajan istemi, `agents` ve `outputFormat` aynen; `options.env = { ...cleanEnv(), CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' }`. Fixture `subagent-nobg.ndjson`, kayıttan hemen sonra `redactFile`. Tek koşu.

**Kanıt** (`env -u CLAUDECODE node spikes/m0/e-no-background.mjs` → `PASS`, 19,5 sn):
```
"results": [ { "subtype": "success", "result_index": 0, "structured_output": true } ],
"task_started": [ { "subagent_type": "storyboarder", "is_backgrounded": false } ],
"background_tasks_changed": 0,
"inits": 1
```
- Akış: `tool_use Agent` (6933 ms) → `task_started false` → `task_updated` / `task_notification` (15264) → `StructuredOutput` → tek `result` (18905).
- Sızıntı kontrolü: `grep -cE 'alper|@gmail'` → `0`; org-id / `sk-ant` → `0`; 459 satırın hepsi `JSON.parse` ediliyor; betiğin kendi kontrolü (kullanıcı adı, host, ev klasörü, imza, e-posta) geçti.
- Destekleyici kanıt: `sdk.d.ts` `backgroundTasks()` için "@throws when background tasks are disabled for the session (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`) — nothing is backgrounded" der. Gömülü binary'de `backgroundAgentLaunchDisabled` dizgisi var.

**Hüküm.** Bayrak alt ajanı ön planda tutuyor: tek `result`, ikinci `init` yok. Bayraksız davranış deterministik olmadığı için (3 koşunun 2'si arka plan) tek koşu istatistiksel kanıt değildir; SDK tipleriyle birlikte yeterli sayıldı. Savunma olarak sürücü yine **son `result`'u** esas alır ve iterator bitene kadar bekler.

**Spec'e etkisi.** §6.1 `env` satırı: bayrak **temizlikten sonra** eklenir. §18'e yeni risk satırı.

## 11. Plandan sapmalar

| Görev | Ne | Neden |
|---|---|---|
| T1 | Görevi controller doğrudan yürüttü | Kullanıcı verisi silme bir alt ajanın yargısına bırakılmadı |
| T1 | `~/.cache/google-chrome` atlandı | Chrome açıktı; planın kendi koşulu. Eşik yine tuttu (32 GB) |
| T2 | Yok | — |
| T3 | `redact.mjs`'e proje slug kuralı (`-home-alper-…` → `-home-user`) | `init.memory_paths.auto` planın grep'ini 1 yaptı; sonra 0 |
| T4 | Slug kuralı genelleştirildi; her kayıttan hemen sonra redaksiyon; otomatik sızıntı öz-kontrolü | Controller kararı: çökme kişisel veriyi redaksiyonsuz bırakmasın |
| T4 | `lib.mjs record()`: try/catch/finally, NDJSON `finally`'de yazılır, `tolerateError` RegExp | `interrupt()` sonrası iterator fırlatıyor ve kaydı kaybettiriyordu |
| T4 | Interrupt kuyruk tipleri yazdırılıyor; kontrol `error_during_execution` + `aborted_streaming` istiyor | İlk sürüm her hatayı yutuyordu (boş test) |
| T4 | Kullanıcı adı kuralı + delta'lar arası maskeleme, `blockTexts` dışa aktarımı | Akış delta'ları yolu parçalara bölüyor (`/home/al` + `per/gpu`); ev klasörü kuralı yakalayamıyordu |
| T4 | Thinking `signature` → `"redacted"` | base64 çözülünce düz metin hesap/org UUID'si içeriyor |
| T4 | Alt ajan kontrolü `find` → `findLast` (son `result`) | Arka plan alt ajanı birden fazla `result` üretti |
| T4 | Fazladan fixture `subagent-background.ndjson` | Erken, `structured_output`'suz `result` vakasının tek kaydı |
| T4 | Fixture'lar düzeltme turunda yeniden kaydedildi | Tam uçtan uca koşu istendi |
| T5 | `seenCount` / `seenTypes` çıktıya eklendi | Mesaj gelip gelmediği kayda geçsin |
| T5 | Fixture tek satır JSON; `redact.mjs` akış olmayan dosyaları da işliyor; `b-usage.mjs` redaksiyonu kendisi çağırıyor | `redact.mjs` `{t,m}` dışı dosyada çöküyordu |
| T6 | `BROWSER=/bin/true`; `CLAUDE_CODE_*`, API anahtarları silindi | Gerçek tarayıcı açılmasın (controller kararı) |
| T6 | `execFileSync` → `spawnSync` | Çıkış yapılmamışken `auth status` 1 döner, fırlatırdı |
| T6 | SIGTERM'den 2 sn sonra PID ile SIGKILL + canlılık kontrolü | Süreç asılı kalmasın (SIGTERM yetti, 143) |
| T6 | `ss -ltnp` örneklemesi, sorgu değeri maskeleme, klasör listesi ve silme, `os.tmpdir()` koruması; önce/sonra güvenlik anlık görüntüsü; `rawHead` 600 → 800 | Kanıt ve güvenlik |
| T7 | `AnimationMixer` eylemleri `LoopOnce` + `clampWhenFinished` | `LoopRepeat` son kareyi 0'a sarıyordu (14,77 px → 0,00 px) |
| T8 | Ek sondaj `spikes/m0/e-no-background.mjs` + fixture `subagent-nobg.ndjson` | Controller kararı: spec §6.1'in dayandığı bayrak hiç denenmemişti |

Commit sonu satırı: tüm commit'lerde `constraints.md`'ye uygun olarak `Co-Authored-By: Claude Opus 5.5`.

## 12. M3/M4'e devredilenler

**M3 (canlı agent katmanı):**
- **Birden fazla `result`:** Arka plan görevleri açıkken alt ajan bir `result` erken, biri sonra gelir; araya ikinci `system/init` girer. Bayrak (`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`) env **temizlendikten sonra** eklenir. Sürücü yine de son `result`'u esas alır; `background_tasks_changed` boşalana ve iterator bitene kadar bekler. FakeClaudeDriver `subagent-background.ndjson`'u da oynatır.
- **İptal:** `result{error_during_execution, aborted_streaming}` sonrası iterator `Claude Code returned an error result` fırlatır. İptal yolu bunu yakalar ve adımı `cancelled` sayar. Fixture bu hatayı içermez; FakeClaudeDriver gerekirse açıkça fırlatır.
- **`task_progress` hiç gözlenmedi.** Agent kartı ve eşleyici `task_started`, `task_notification` ve `parent_tool_use_id`'den çalışır.
- **Thinking:** `thinking` delta'ları ve `system/thinking_tokens` olayları her oturumda var; eşleyici ikisini de işler.
- **Plugin skill adları** `videogen:*`. Yerleşik skill'ler ve `cc-plugin-*` her zaman listede; daraltma gerekirse `skills` seçeneğiyle yapılır.
- **Koruma kapsamı:** Spike hook'u yalnızca Write/Edit `file_path`'ini denetledi. Bash ve NotebookEdit (`notebook_path`) vektörleri M3'ün `PreToolUse`'unda ayrıca kapsanır. Red tespiti `tool_result.is_error` + `PreToolUse:<Araç> hook error:` öneki veya `result.permission_denials` ile yapılır (hook olayı gelmez).
- **Symlink'ler mutlak yol** (`/home/alper/...`). Kurulumda üretilir ya da vendor edilir.
- **`redact.mjs` akış fixture'larında idempotent değil:** yer tutucu UUID'leri yeniden numaralar. Commit edilmiş fixture'larda **asla yeniden çalıştırılmaz**; sadece yeni kayıtta bir kez.
- `lib.mjs record()` seçenekleri sığ birleştirir: `options.env` verilirse `cleanEnv()` atlanır; env her zaman `cleanEnv()` üzerine kurulur.
- WebSearch sayacı için `server_tool_use.web_search_requests` değil `searchCount`; Write create'te `structuredPatch` boş.

**M4 (dikey dilim):**
- `AnimationMixer`: `LoopOnce` + `clampWhenFinished` (ya da süreyi `duration − ε`'a sıkıştır). Varsayılan döngü moduna güvenilmez.
- GLB kamera gerçekleri: `yfov = 2·atan(sensör/2 / lens)`, `aspectRatio` dışa aktarıcıdan; kamera kare kare pişirilir; düğüm başına bir klip.
- Birimler 1:1: "1 birim = 1 cm" builder'da uygulanır.
- Eşdeğerlik testinde: oran GLB'den alınır (anchors.json'dan değil), eksik düğümde açık hata, ayrı çıkış kodları, sahne parametreleri SceneSpec'ten.

**v1.1:** TTY'siz giriş (i): URL + kod yapıştırma, bilinçli bir gerçek giriş testiyle. Spike'ın `c-auth-login.mjs`'i yeniden kullanılırsa try/finally temizliği ve gerçek durum kontrolü sertleştirilir.

## 13. Kullanım maliyeti

| Görev | Haiku oturumu | Not |
|---|---|---|
| T3 (a) | 1 | Tek koşu |
| T4 (a2) | 16 | İlk koşu 5 (interrupt'ta çöktü) + interrupt tekrarı 1 + düzeltme turunda iki tam koşu 10 |
| T5 (b) | 0 | 3 sıfır token `get_usage` oturumu (model turu yok) |
| T6 (c) | 0 | Sadece `auth` CLI'ı; model oturumu yok |
| T7 (d) | 0 | Claude kullanılmadı |
| T8 (e) | 1 | Tek koşu |
| **Toplam** | **~18** | Hepsi haiku, `maxTurns` ≤ 6 |

5 saatlik pencere M0 boyunca %58 (T3, `rate_limit_event`) → %61–62 (T5, `get_usage`) arasında görüldü. Pencere controller'ın kendi oturumuyla paylaşıldığı için spike'lara ayrıca bölüştürülemez.
