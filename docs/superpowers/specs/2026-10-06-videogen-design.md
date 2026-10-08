# VideoGen — Tasarım Dokümanı

| | |
|---|---|
| Tarih | 2026-10-06 |
| Durum | Tasarım onaylandı (brainstorming + grilling). M0, M1 (K17 geçici, kullanıcı onayı bekliyor), M2, M3, M4a ve M4b tamamlandı (`docs/m0/report.md`, `docs/m1/decision.md`, `docs/m2/report.md`, `docs/m3/report.md`, `docs/m4/m4a-summary.md`, `docs/m4/m4b-summary.md`); sırada M4c |
| Sahibi | Alper (tek kullanıcı) |
| Kapsam | v1: ürün adından yayına hazır TikTok "içinde ne var" videosuna kadar ajanlı üretim platformu |

Bu doküman; kullanıcı gereksinimlerini, brainstorming ve grilling turlarında verilen kararları, 10 ajanlı keşif araştırmasının bulgularını ve canlı Claude Code denemelerini tek yerde toplar. Her önemli kararın yanında kanıtı vardır. Doğrulanmamış varsayımlar §18'de açıkça listelenmiştir ve ilk kilometre taşında (M0) doğrulanır.

---

## 1. Amaç ve başarı ölçütleri

**Amaç:** Bu laptopta, localhost'ta çalışan, tek kullanıcılı bir web platformu. Kullanıcı bir ürün adı yazar. Platform Claude Code agent'larıyla ürünü araştırır, storyboard'unu çıkarır, 3D patlatılmış görünüm ("içinde ne var") videosunu üretir, bağımsız reviewer agent'larla kalitesini denetler, düzeltir ve yayına hazır hale getirir. TikTok'a gönderim tek butondur. Her adım audit'lenir, tüm eski videolar ve sürümleri izlenebilir.

**Kalite iddiası:** "Mükemmel, ilgi çekici, izlemesi keyifli; asla AI slop ya da basit görünümlü değil." Bu iddia §8'deki ölçülebilir rubrikle somutlaştırılır.

**Başarı ölçütleri (v1):**
1. Bir ürün adı girildikten sonra insan müdahalesi olmadan şu iki sonuçtan biri çıkar: **"Yayına hazır"** (tüm kapılar geçmiş, puan ≥ 80) ya da gerekçeli **"İnsan gerekli"**.
2. Sol panelde her an şunlar görülür: genel yüzde, aktif adım, **her agent'ın canlı kartı** (rol, model, durum, yüzde ve yüzdenin kaynağı, alt ajanlar, canlılık sinyali). Ekran hiçbir koşulda donmuş görünmez (§12).
3. Her agent oturumu, araç çağrısı, dosya değişikliği, render, review bulgusu ve yayın; korelasyon kimlikleriyle, değiştirilemez audit kaydındadır (§11).
4. Kütüphanede her video ve her sürümü oynatılabilir ve karşılaştırılabilir.
5. Chat panelinden herhangi bir videoya agent açılıp analiz ve düzeltme yaptırılabilir. Değişiklik yeni sürüm olarak aynı pipeline'dan geçer.
6. **Sıfır ücretli API.** Tek AI kaynağı, Claude Code Max aboneliğidir.
7. Playwright smoke testleri yeşildir (§16).

## 2. Kapsam

**v1'de var:** Ürün → araştırma → storyboard → 3D (hibrit) → ses (seslendirmeli veya seslendirmesiz) → render → otomatik QC → reviewer'lar → en fazla 3 düzeltme turu → TikTok taslak gönderimi. Bunların yanında: chat paneli, kütüphane ve sürümler, audit gezgini, Claude bağlantı ekranı, kullanım footer'ı, varlık/lisans defteri, iş sırası.

**v1'de yok (gelecek, §19):**
- Storyboard onay kapısı ve chat'ten storyboard düzenleme. Mimari buna hazır: storyboard ayrı ve sürümlü bir kayıt.
- İngilizce varyant. Metinler baştan dil anahtarlı tutulur.
- YouTube Shorts'a otomatik yükleme. v1'de sadece MP4 dışa aktarımı var.
- TikTok izlenme analitiği entegrasyonu.
- Uzaktan erişim ve platform şifresi.

## 3. Kısıtlar (ölçülmüş)

| Kısıt | Değer | Etki |
|---|---|---|
| GPU | RTX 3060 Laptop, 5,67 GB kullanılabilir VRAM, hibrit (Intel iGPU) | Aynı anda tek GPU işi; Blender her zaman `blender-gpu` PRIME sarmalayıcısıyla (düz `blender` iGPU'ya düşer, ~3× yavaş) |
| RAM | 14 GB, swap 3,1–3,4/4 GB dolu; Docker yığını ~2,2 GB (Langfuse ~1,9 GB) | Claude süreci başına ~280–300 MB (ölçüldü); süreç sınırı ve RAM ön kontrolü |
| Disk | M0 temizliği: 8,1 → 32 GB boş (Chrome önbelleği açık olduğu için atlandı) | 45 sn video ≈ 1,6 GB geçici PNG kare dizisi; kareler render sonrası silinir |
| Claude | Claude Code, **Max** abonelik (`claude auth status`), API key yok | 5 saatlik ve haftalık kullanım pencereleri; boş bir oturumun taban maliyeti ~30K token (M0: haiku, soğuk önbellek, `cache_creation_input_tokens` 29.962 + 10 girdi + 51 çıktı) |
| Ücretli API | **Kesinlikle yok** | TTS, müzik, SFX ve 3D yerel ya da lisanslı ücretsiz kaynaklardan gelir |
| Ağ | Sadece localhost, şifresiz | 127.0.0.1'e bağlanma + Host/Origin koruması |
| Diğer | Node 24.18 (nvm), npm 12 (install script'lerini engeller), sistem Python 3.14 (torch desteklemez → uv ile 3.12 venv'leri) | Kurulum adımlarında `npm approve-scripts` ve ayrı venv |

## 4. Karar özeti

| # | Karar | Kaynak / kanıt |
|---|---|---|
| K1 | Storyboard'u ayrı bir agent hazırlar; onay beklenmez, kayıt sürümlüdür | Kullanıcı kararı |
| K2 | Claude bağlantı ekranı + 5 saat / 7 gün kullanım footer'ı; platform şifresi yok | Kullanıcı kararı |
| K3 | Postgres 17 kendi container'ında, port 5433. Medya diskte, içerik özetiyle adlandırılır; metadata Postgres'te | Kullanıcı kararı. `postgres:17` imajı makinede zaten var (645 MB, ek disk yok). 5432 Langfuse'da |
| K4 | Ses modu video başına seçilir: seslendirmeli (VO) veya seslendirmesiz | Kullanıcı kararı |
| K5 | Yayın butonla, TikTok **taslak (inbox)** modunda | Kullanıcı kararı. Sandbox uygulamada herkese açık yayın sadece bu yolla mümkün (ölçüldü) |
| K6 | Otomatik düzeltme döngüsü, en fazla 3 tur; sonra "insan gerekli" | Kullanıcı kararı |
| K7 | Hibrit 3D: final Blender EEVEE; taslak ve önizleme Three.js-in-Remotion | Kullanıcı kararı. Three.js ~20× hızlı ama kalite tavanı "temiz diyagram" (ölçüldü) |
| K8 | Hedef süre 35–55 sn, 1080×1920, 30 fps | Kullanıcı kararı. Referans kanallarda medyan süre 44–61 sn |
| K9 | Müzik iki varyantlı: müzikli final + müziksiz TikTok taslağı (trend ses uygulamada eklenir) | Kullanıcı kararı. API ile TikTok kütüphane sesi eklenemiyor |
| K10 | Disk temizliği (~26 GB): gemma4 modelleri, önbellekler, eski node_modules, minillm-lab | Kullanıcı kararı. M0'da her silmeden önce son durum gösterilerek yapılır |
| K11 | Mimari B: API + Worker, Postgres üzerinden haberleşir | Kullanıcı kararı. ~23 dk'lık render yeniden başlatmalara dayanıklı olmalı |
| K12 | Rol başına model: yaratıcı ve görsel işler Opus, araştırma ve teknik işler Sonnet, yardımcı işler Haiku; fixer modeli hata kategorisine göre | Kullanıcı kararı (Q2a) + tutarlılık düzeltmesi |
| K13 | "Yayına hazır" = 6 kapının hepsi geçer + puan ≥ 80 + her boyut ≥ ağırlığının %60'ı; < 70 → storyboard'a dönüş | Kullanıcı kararı (Q3) + rubrik araştırması |
| K14 | İş sırası: birden fazla ürün sıraya girer; Claude adımları paralel, GPU adımları sırayla | Kullanıcı kararı (Q4) |
| K15 | Chat agent'ının her değişikliği yeni sürüm olur ve aynı pipeline'dan geçer; silme ve yayın sadece butonla | Kullanıcı kararı (Q5) |
| K16 | Shorts için v1'de sadece MP4 dışa aktarımı | Kullanıcı kararı (Q6) |
| K17 | Anlatıcı sesi (hazır ses ya da klon) TTS dinleme testinde seçilir; klon seçilirse AI etiketi zorunlu. **GEÇİCİ (M1, 2026-10-06): Chatterbox ML V3 + hazır ses; Freya yedek; klon test edilmedi; kullanıcı onayı bekliyor** | Kullanıcı kararı (Q7). TikTok AIGC kuralı. Geçici seçim ölçümlerden (adil CER %0,5 / %17,9; `docs/m1/decision.md`) |
| K18 | Ekran yazıları Türkçe; metinler dil anahtarlı tutulur (İngilizce varyanta hazır) | Kullanıcı kararı (Q8) |
| K19 | Sabit kanal görsel kimliği; ilk dikey dilimde 2–3 seçenek sunulur | Kullanıcı kararı (Q9) |
| K20 | Agent SDK tam sürüme sabitlenir ve **kendi gömülü CLI binary'siyle** çalışır | Kurulu CLI `autoUpdates:false` iken 3 haftada 283→286→289→290 sürümlerine geçti (ölçüldü) |
| K21 | Pipeline agent'ları izoledir: kullanıcı hook/plugin/MCP'leri yüklenmez | Canlı deneme: izolasyon olmadan superpowers hook'u pipeline agent'larına enjekte oluyor |
| K22 | GPU işlerini sadece orchestrator yapar; agent'lar MCP araçlarıyla ister | 6 GB VRAM'de iki GPU işi aynı anda çalışamaz; kuyruk, progress ve audit tek yerde kalır |
| K23 | Geometrinin tek kaynağı bpy'dir; Blender dışa aktarılan GLB'yi Three.js taslağına verir | Tutarlılık düzeltmesi (§7.3) |
| K24 | Remotion görüntüyü bir kez ve sessiz render eder; ses ffmpeg'de mastering yapılıp iki varyanta mux'lanır | Tutarlılık ve performans düzeltmesi (§7.6) |
| K26 | Seslendirme build'den **önce** üretilir; storyboard gerçek TTS sürelerine göre yeniden zamanlanır | Görüntü-anlatım senkronu (rubrik P7); §7.1 |
| K27 | Pipeline üçüncü taraf MCP'ye bağımlı değil; kare incelemesi kendi `extract_frames` aracımızla yapılır | claude-video-vision her açılışta `npx @latest` ile ağdan iniyor |
| K28 | Tek origin (5180): API, SPA'yı da sunar; CORS kapalı | Host/Origin koruması tek origin varsayıyor |
| K25 | Testler Playwright smoke (sistem Chrome) + kayıtlı gerçek stream'leri oynatan sahte Claude sürücüsü | Kullanıcı talebi; dag-wireboard'da kanıtlanmış desen |

## 5. Mimari

### 5.1 Süreçler

```
                ┌──────────────────────── tarayıcı (http://127.0.0.1:5180) ──────────────────┐
                │ React 19 SPA: Stüdyo · Kütüphane · Audit · Varlıklar · Ayarlar             │
                └──────────────┬─────────────────────────────────────▲───────────────────────┘
                               │ HTTP (komutlar → 202)               │ SSE (olaylar, Last-Event-ID)
                ┌──────────────▼─────────────────────────────────────┴───────────────────────┐
                │ apps/api  (Fastify 5, 127.0.0.1:5180 — SPA'yı da aynı origin'den sunar)     │
                │  - REST komutları: üret, iptal, chat mesajı, yayınla, varlık ekle            │
                │  - SSE yayıncısı: LISTEN vg_events / vg_live → istemcilere                   │
                │  - Medya sunucusu: HTTP Range ile MP4 / görsel                               │
                │  - Durumsuz: Claude süreci veya GPU işi YOK                                  │
                └──────────────┬─────────────────────────────────────▲───────────────────────┘
                     INSERT jobs/commands + NOTIFY            NOTIFY vg_events(id) / vg_live(payload)
                ┌──────────────▼─────────────────────────────────────┴───────────────────────┐
                │ Postgres 17 (docker, 127.0.0.1:5433, volume videogen-pg)                     │
                └──────────────▲─────────────────────────────────────┬───────────────────────┘
                               │                                     │ LISTEN vg_commands
                ┌──────────────┴─────────────────────────────────────▼───────────────────────┐
                │ apps/worker                                                                  │
                │  - Orchestrator (adım DAG'ı, ilerleme, düzeltme döngüsü)                     │
                │  - Kaynak zamanlayıcı: GPU kilidi(1) · ağır CPU(1) · Claude(3 + 1 chat)       │
                │  - ClaudeDriver (Agent SDK) + videogen MCP sunucusu (in-process)             │
                │  - RenderDriver: Blender (blender-gpu), Remotion (@remotion/renderer), ffmpeg │
                │  - AudioService istemcisi (Python sidecar: TTS + Whisper)                    │
                │  - Süreç gözcüsü: her 2 sn çocuk süreç CPU/RSS → canlılık                     │
                │  - Zamanlanmış işler: pg_dump, transcript arşivi, kullanım yoklaması          │
                └──────────────────────────────────────────────────────────────────────────────┘
```

- **Worker, tüm Claude süreçlerinin ve GPU'nun tek sahibidir.** Chat oturumları da Worker'da çalışır. API sadece mesajı iletir. Böylece süreç ve RAM sınırları tek yerde sayılır.
- **Tek origin:** Üretimde API, derlenmiş SPA'yı (`apps/web/dist`) ve `/api/*`, `/events` uçlarını **aynı port üzerinden (5180)** sunar. Böylece CORS tamamen kapalı kalır ve Host/Origin koruması tek bir origin'i bekler. Geliştirmede Vite (5173) `/api` ve `/events` isteklerini 5180'e proxy'ler.
- **Bir videoda tek aktif run:** Bir videonun aynı anda yalnızca bir yazan run'ı olur. Run sürerken chat analiz yapabilir. Chat düzenleme isteği ise kuyruğa girer ve bunu açıkça gösterir.
- **Olay kanalları:**
  - `vg_events`: kalıcı olaylar. Önce `ui_events` outbox tablosuna `INSERT` edilir, sonra `NOTIFY(id)` atılır. SSE'nin `id` alanı bu tablonun global sırasıdır; `Last-Event-ID` ile tekrar oynatma buradan yapılır.
  - `vg_live`: geçici olaylar. Token token metin akışı ve canlılık örnekleri; sadece `NOTIFY` (payload < 8 KB), tabloya yazılmaz.
  - `vg_commands`: API'den Worker'a giden komutlar.
- **Başlatma:** `bin/videogen` sırayla şunları yapar: Postgres container'ını ayağa kaldırır, migration'ları uygular, API ve Worker'ı çocuk süreç olarak başlatır, çöken süreci artan bekleme süresiyle (backoff) yeniden başlatır, port hazır olunca tarayıcıyı açar.
- **Geliştirme modu:** Web için Vite HMR, API için `tsx watch`. **Worker watch modunda çalışmaz**; elle yeniden başlatılır, böylece geliştirme sırasında render ölmez.

### 5.2 Depo düzeni

```
~/gpu-server/VideoGen/            (git deposu)
  apps/web/            React 19 + Vite 8 + Tailwind v4 + TanStack Query
  apps/api/            Fastify 5
  apps/worker/         orchestrator, scheduler, drivers
  packages/shared/     zod şemaları (artefakt sözleşmeleri, olay tipleri, rubrik), ortak tipler
  packages/db/         drizzle şeması + migration'lar + audit trigger'ları
  packages/claude/     ClaudeDriver (SDK + Fake), rol tanımları, MCP araçları, stream→UI eşleyici
  packages/remotion/   tek paylaşılan Remotion çalışma alanı (Draft3D, Compose, etiket/altyazı bileşenleri)
  python/vg_blender/   bpy kütüphanesi (primitive'ler, malzemeler, ışık, kamera, anchors/events/GLB export)
  python/audio_service/ TTS (Chatterbox; yedek Freya ayrı venv'de) + Whisper hizalama, tek venv
  python/qc/           qc_probe (otomatik kapılar; araştırmadaki prototipten)
  claude-plugin/       platform plugin'i: skills (symlink), agents/*.md, guides/ (MCP'ye uyarlanmış kılavuzlar)
  tests/smoke/         Playwright smoke testleri
  tests/fixtures/claude-streams/   kayıtlı gerçek stream-json akışları
  bin/videogen, bin/blender-gpu
  docker-compose.yml   (postgres)
  docs/                bu spec, planlar, mevcut kılavuzlar
~/videogen-data/
  media/sha256/ab/cd/<sha256>.<ext>    içerik adresli depo
  runs/<runId>/                        çalışma klasörleri (agent'ların yazabildiği tek yer)
  archive/transcripts/                 Claude transcript arşivi (sıkıştırılmış)
  backups/                             pg_dump (son 7 gün)
  logs/                                sistem logları (30 gün)
  secrets/                             TikTok token'ları (0600)
```

### 5.3 Sürüm sabitleme

| Bileşen | Sürüm | Not |
|---|---|---|
| Node | 24.18 (`.nvmrc`) | |
| `@anthropic-ai/claude-agent-sdk` | M0'daki güncel 0.3.x, **tam sürüm** (bugün 0.3.290) | Gömülü linux-x64 binary'si (≈ 250 MB; ölçülen 249.687.224 bayt) kullanılır |
| `remotion` + `@remotion/*` | **4.0.533 tam** | Pilotla aynı; tüm `@remotion/*` paketleri aynı sürümde |
| three / @react-three/fiber | 0.186.1 / 9.8.1 | jet-engine'de çalıştı |
| Fastify / drizzle-orm / TanStack Query | 5.12 / 0.45 / 5.104 | npm'de doğrulandı |
| React / Vite / Tailwind | 19.3 / 8.3 / 4.3 | |
| @playwright/test | 1.63, `channel:'chrome'` | Tarayıcı indirilmez |
| Blender | 5.2.2 (`~/apps`) | |
| Postgres | `postgres:17` imajı | Makinede mevcut |

Lockfile commit edilir. Yeni bir skill veya plugin eklenmeden önce skillspector incelemesinden geçer.

## 6. Agent katmanı

### 6.1 Sürücü

- `ClaudeDriver` arayüzünün iki gerçekleştirimi var: `SdkClaudeDriver` ve testler için `FakeClaudeDriver` (§16).
- Her oturum `query()` ile ve streaming input modunda açılır.
- Oturum kimliği spawn'dan önce bir UUID olarak üretilir ve audit'e yazılır.
- Kimlik doğrulama: kullanıcının Claude.ai OAuth girişi (`apiKeySource: none`; M0'da gömülü CLI 2.1.290 ile doğrulandı). **`--bare` asla kullanılmaz**, çünkü OAuth'u kapatır.
- **Sonuç mesajları (M0):** Tek sorgu birden fazla `result` üretebilir (arka plana alınan alt ajan; `result_index` 0, 1, …). Sürücü son `result`'u esas alır ve iterator bitene kadar bekler. Kullanım için esas alınan değerler son `result`'un kümülatif `modelUsage` / `total_cost_usd` alanlarıdır; result başına `usage` / `num_turns` segment farkıdır, ikisi karıştırılmaz (ayrıntı §6.5). `outputFormat` ile model sentetik `StructuredOutput` aracını çağırır; veri `result.structured_output`'tadır.

**Her oturumun ortak yapılandırması:**

| Ayar | Değer | Neden |
|---|---|---|
| `settingSources` | `[]` | Kullanıcının global hook'ları (superpowers, last30days), plugin'leri ve MCP'leri yüklenmez (canlı denemede kanıtlandı) |
| `strictMcpConfig` | `true`; sadece `videogen` (in-process) | Pipeline, üçüncü taraf MCP'lere bağımlı değil. claude-video-vision `npx @latest` ile her açılışta ağdan iniyor (tedarik zinciri ve tekrarlanabilirlik riski). Kare inceleme bizim `extract_frames` aracımız + Read ile yapılır |
| `plugins` | `[{type:'local', path:'claude-plugin/'}]` | Skill'ler: remotion-\*, ffmpeg, video-use, manim-video (symlink); rol agent'ları; uyarlanmış kılavuzlar. M0'da doğrulandı: symlink'li skill'ler `videogen:<ad>` adıyla yüklenir (ör. `videogen:remotion-render`); CLI'ın yerleşik skill'leri ve `cc-plugin-*` plugin'leri de her zaman listededir. Symlink hedefleri mutlak yol olduğu için kurulumda üretilir |
| `env` | Temizlenmiş: `CLAUDECODE` ve `CLAUDE_CODE_*` çıkarılır; `ENABLE_TOOL_SEARCH=false`; pipeline rollerinde `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` **temizlikten sonra yeniden eklenir** (temizleyici tüm `CLAUDE_CODE_*` değişkenlerini siler) | Ertelenmiş araçlar ekstra bir tur maliyeti getirir. Arka plan alt görevleri birden fazla `result` olayı üretir: M0'da bayraksız 3 koşunun 2'sinde `Agent` çağrısı arka plana alındı; bayrakla 1/1 koşuda ön planda kaldı ve tek `result` geldi |
| `permissionMode` | `dontAsk` + `permissionPrompts:'none'` + rol bazlı `allowedTools` (ön onay) + **`PreToolUse` hook callback'i** (yol ve komut koruması) | Gözetimsiz çalışma. `dontAsk` modunda önceden onaylanmamış araçlar `canUseTool` çağrılmadan reddedilir (SDK tipleri, 0.3.290). Bu yüzden koruma `canUseTool`'da değil, her araç çağrısından önce çalışan `PreToolUse`'ta durur; `permissionDecision:'deny'` ile birlikte modele gidecek gerekçeyi döndürür. M0'da doğrulandı: red, modele `tool_result{is_error:true}` + `PreToolUse:<Araç> hook error:` önekiyle gider ve `result.permission_denials`'a yazılır; callback hook'lar için `system/hook_*` olayı gelmez. **`bypassPermissions` asla** (ev klasöründe gerçek projeler ve kimlik bilgileri var) |
| `includePartialMessages`, `forwardSubagentText`, `agentProgressSummaries` | `true` | Canlı iz ve alt ajan görünürlüğü |
| `thinking` | `{type:'adaptive', display:'summarized'}` | Reasoning satırları için düşünme metni |
| `cwd` | `~/videogen-data/runs/<runId>/` | Yazma sınırı |
| `maxTurns` | Rol başına (§6.2) | |
| `outputFormat` | Rolün JSON şeması | Aşamalar arası veri doğrulanmış JSON olarak akar |

### 6.2 Roller

| Rol | Model / effort | Araçlar | Çıktı (şema) | Max tur |
|---|---|---|---|---|
| **researcher** | Sonnet / high | WebSearch, WebFetch, Read, Write (`run/research/`); MCP: `report_progress` | `ProductResearch` | 40 |
| **storyboarder** | Opus / high | Read; MCP: `read_spec`, `report_progress` | `Storyboard` | 20 |
| **builder** ("video üretim agent'ı") | Opus / high | Read, Write, Edit (`run/scene/`), izin listeli Bash; MCP: `build_scene`, `render_preview_stills`, `render_draft`, `read_spec`, `write_spec(scene)`, `report_progress` | `SceneSpec` + `product.py` | 60 |
| **audio_director** | Sonnet / medium | Read; MCP: `tts_synthesize`, `align_captions`, `search_assets`, `read_spec`, `write_spec(audio)` | `AudioPlan` | 25 |
| **reviewer_visual** (görsel + anti-slop) | Opus / high | Read; MCP: `extract_frames`, `run_qc` | `Review` | 25 |
| **reviewer_facts** (doğruluk + storyboard uygunluğu) | Sonnet / high | Read, WebFetch, WebSearch; MCP: `read_spec`, `extract_frames` | `Review` | 25 |
| **reviewer_retention** (kanca, tempo, TikTok) | Sonnet / high | Read; MCP: `extract_frames`, `run_qc`, `read_spec` | `Review` | 20 |
| **fixer** | Görsel/anlatı hatası → Opus/high; teknik hata → Sonnet/high | Read, Write, Edit (run), izin listeli Bash; MCP: `write_spec`, `build_scene`, `render_preview_stills`, `report_progress` | `FixReport` | 40 |
| **chat** | Opus / high | Kütüphane salt okunur, düzenleme oturumunda run klasörüne yazma; tüm MCP araçları + `request_rerender` | Serbest metin + isteğe bağlı yeni sürüm | Etkileşimli |
| **summarizer** | Haiku / low | Yok | Kısa Türkçe özetler (audit ve kart başlıkları) | 3 |

- Model ve effort ayarları Ayarlar ekranından rol bazında değiştirilebilir. Değişiklik audit'e yazılır.
- **M4b:** GPU ve ağır CPU işleri için tek kapı, worker'daki süreç içi `ResourceLocks` (K22; MCP araçları ondan geçer, orchestrator'ın GPU adımları M4c'de aynı kilide bağlanır). `render_preview_stills`'in `scale` parametresi yok: önizleme sabit %50, 16 örnek. Builder'ın MCP listesinden `render_draft` çıkarıldı. Taslak videoyu `draft_render` pipeline adımı üretir; builder kareleri `render_preview_stills` ile görür. `build_scene` ve `render_preview_stills` uygulandı. Sonuç, run klasörüne göre yollarla `{ok, errors, warnings, report, equivalence, files}` olarak döner. GPU beklemesi kartta "GPU bekliyor · sırada N" diye görünür; araç sürerken oturum "takılmış" sayılmaz.
- **M4c (kanıt `docs/m4/report.md`):** orchestrator'ın GPU adımları (`draft_render`) MCP araçlarıyla aynı `ResourceLocks` kilidinden ve §6.4 ön kontrolünden geçer (tek kapı; adım notu "GPU sırası bekleniyor (sırada N)" ya da ön kontrol gerekçesi). Run başlatma kullanım kapısına uyar: muhafız kapalıyken run `queued` kalır, video notu "Kullanım sınırı yakın: …", muhafız açılınca kendiliğinden başlar. `extract_frames({times[1–12], crop?})` uygulandı: yalnızca reviewer_visual ve kayıtlı taslağı olan bir `draft_review` adımının oturumu; bütçe adım+tur başına 12 kare; kırpma 2× büyütülür. Taslak incelemesinde reviewer_visual tek reviewer'dır: 4×3 kontakt sayfası + `extract_frames`.
- Reviewer'lar **builder'ın akıl yürütmesini görmez**. Sadece artefaktları (kareler, manifestler, spec) görürler.
- **Spec notu (M5b):** `reviewer_facts` `maxTurns` 25 → **40** (web doğrulama hedefleri, §8.2 notu). Fixer `ROLES`'ta `specWrite` yalnızca `storyboard` ve `scene` (araştırmayı yazamaz); reviewer'lara builder ya da fixer çıktısının metni (özet, gerekçe) verilmez, güvenilmeyen veri çitli (`fenced`) gider.

### 6.3 `videogen` MCP sunucusu (in-process, `createSdkMcpServer`)

| Araç | İşlev | Kaynak |
|---|---|---|
| `report_progress(percent, message)` | Agent kilometre taşı. Orchestrator değeri `[son, 99]` aralığına sıkıştırır ve monoton tutar | — |
| `get_context()` | Run, video, sürüm kimlikleri, yollar, rubrik sürümü, ses modu | — |
| `read_spec(kind)` / `write_spec(kind, json)` | Spec okuma ve yazma. Yazma zod ile doğrulanır, sürümlenir ve farkı döner | — |
| `build_scene()` | `product.py`'yi Blender'da render'sız çalıştırır → `.blend`, `scene.glb`, anchors ve events tanımları, BVH çakışma raporu | CPU |
| `render_preview_stills(frames, scale)` | Blender EEVEE ile birkaç kare + kontakt sayfası + güvenli alan katmanı | GPU |
| `render_draft()` | Three.js-in-Remotion taslağı (GLB + SceneSpec) → MP4 + kontakt sayfası | GPU |
| `extract_frames(versionId, times \| fps, size)` | Tam çözünürlüklü kareler ve kırpmalar | CPU |
| `run_qc(versionId)` | Otomatik kapılar (qc_probe) → JSON | CPU |
| `tts_synthesize(lines)` / `align_captions()` | Ses servisi aracılığıyla | GPU |
| `search_assets(kind, query)` | Sadece lisans kapısından geçmiş varlıklar | — |
| `register_artifact(path, kind)` | İçerik adresli depoya alır | — |
| `request_rerender(scope)` | Sadece chat rolünde. Orchestrator'dan yeni bir run ister | — |

**Kural:** Agent'lar `blender`, `remotion render`, `npx remotion` veya `ffmpeg` gibi ağır komutları Bash'ten çalıştıramaz. `PreToolUse` hook'u bu komutları reddeder ve gerekçesinde doğru MCP aracını söyler. Bash izin listesi: `python3 -I -m py_compile` (yalıtılmış kip: çalışma klasörü `sys.path`'e girmez; M5c son review), `ls`, `cat`, `head`, `jq` ve run klasörüyle sınırlı okuma komutları.

### 6.4 Eşzamanlılık, kullanım ve iptal

- **Claude slotları:** pipeline için 3, chat için **ayrılmış 1**. Chat asla sıra beklemez.
- Boşta kalan chat süreçleri 10 dk sonra kapatılır. Bir sonraki mesajda oturum `resume` ile kaldığı yerden açılır.
- **Ön kontrol:** Spawn'dan önce boş RAM (`MemAvailable`) ≥ 1 GB olmalı. GPU işinden önce şu koşullar aranır:
  - boş RAM ≥ 2,5 GB
  - swap < %90
  - boş disk ≥ 3 GB + kare tahmini
  - `nvidia-smi` boş VRAM ≥ 4 GB
  - `ollama ps` boş
- **Kullanım muhafızı:** Kullanım bilgisi boştayken 5 dakikada bir `get_usage` kontrol çağrısından (sıfır token; birincil kaynak) ve `rate_limit_event`'ten (en az bir kez, ilk API yanıtından sonra gelir; tekrarlanabilir, her biri bir güncelleme olarak işlenir; canlı tazeleme ve yedek) okunur. **Birimler kaynağa göre farklıdır (M0):** `get_usage` → `rate_limits.{five_hour,seven_day}.utilization` yüzde 0..100, `resets_at` ISO 8601 metin; `rate_limit_event` → `rate_limit_info.unifiedWindows.*.utilization` kesir 0..1, `resetsAt` epoch saniye. Eşleyici büyüklüğe göre değil, kaynağa göre normalize eder. Davranış:
  - 5 saatlik pencere ≥ %80 veya haftalık ≥ %90 olursa yeni run ve reviewer fan-out'u başlamaz.
  - Limit aşılırsa (`status: rejected`), çalışan adım "limit bekleniyor" durumuna geçer ve `resetsAt` anında kendiliğinden devam eder.
  - Her geçiş audit'e yazılır.
- **İptal sırası:** `interrupt()` → sonucun gelmesi beklenir (`aborted_*`) → giriş üreteci kapatılır → 10 sn sonra süreç grubuna SIGTERM, ardından SIGKILL. Adım `cancelled` olur.
  - M0'da gözlenen sıra: `user` "[Request interrupted by user]" → kalan `stream_event`'ler → `result{subtype:'error_during_execution', terminal_reason:'aborted_streaming', is_error:true}` → ardından SDK iterator'ı `Claude Code returned an error result` hatasını **fırlatır**. İptal yolu bu hatayı yakalar ve iptal olarak sayar. Yakalanmayan hata süreci düşürür (M0'da spike betiği böyle çöktü).
  - **Streaming-input (chat) oturumunda `interrupt()` oturumu bitirmez (M3a, gerçek CLI):** `result{error_during_execution, aborted_streaming}` gelir, ardından CLI yeni girdi bekler; iterator hatayı ancak giriş kapatılınca (`endInput`) fırlatır. Bu yüzden iptal sırasında gelen `result`'ta giriş hemen kapatılır ve tur "tamamlandı" sayılmaz (yanıt mesajı yazılmaz). Ölçüm: toplam 4,7 sn, interrupt'tan sonra ~0,7 sn; chat iptali < 1 sn (`docs/m3/real-check.md`).

### 6.5 Transcript ve kullanım muhasebesi

- Her oturum için şunlar kaydedilir: `result.usage`, `modelUsage`, `num_turns`, `terminal_reason`, `permission_denials`, süre ve alt ajan istatistikleri. Bunlar video başına toplanır; kullanım maliyeti kütüphanede görünür.
- **Kullanım muhasebesi (M0, `subagent.ndjson`):** Arka plana alınan koşularda her `result`'ın `usage`, `num_turns` ve `duration_ms` alanları yalnızca kendi bölümünü kapsar (segment farkı); `modelUsage` ve `total_cost_usd` ise kümülatiftir (result 0: `usage` cache_read 91.393 / cache_creation 998, 4 tur; result 1: `usage` 31.200 / 1.697, 2 tur, `modelUsage` 122.593 / 2.695 = toplam; maliyet 0,02514 → 0,03520). Muhasebe **son `result`'un** `modelUsage` ve `total_cost_usd` değerini esas alır; `modelUsage` result'lar arasında toplanmaz, tek başına son `usage` alınmaz; ikisi asla karıştırılmaz.
- İş bitince `~/.claude/projects/<slug>/<sid>.jsonl` dosyası ve `subagents/` klasörü sıkıştırılıp arşive kopyalanır. Sebep: `~/.claude/projects` 30 günde temizleniyor.

### 6.6 Güvenlik (agent'lar)

- **Prompt injection:** Güvenilmeyen web içeriğini sadece `researcher` ve `reviewer_facts` okur. İkisinin de Bash yetkisi yoktur ve sadece kendi klasörlerine yazabilirler. Sonraki agent'lar ham web metnini değil, şemayla doğrulanmış JSON'u alır.
- **Referans kuralı:** Web kaynakları sadece **gerçek bilgi** için kullanılır: parça adları, sayılar, malzemeler, oranlar, montaj sırası. Üçüncü taraf görseller, video kareleri ve diyagramlar asla indirilmez, gömülmez veya çizilerek kopyalanmaz. Her iddia URL ve erişim tarihiyle birlikte `claims.json`'a girer.
- **Ücretli API muhafızı:** API ve Worker açılışta env'i tarar. `ANTHROPIC_API_KEY` veya bilinen ücretli anahtar desenleri (ElevenLabs, OpenAI vb.) bulunursa **çalışmayı reddeder** ve bunu audit'e yazar. Agent env'ine anahtar geçirilmez.
  - *M2 notu:* Başlatıcı, API ve Worker reddeder ama **audit satırı yazmaz**: başlatıcı Postgres ayağa kalkmadan reddeder, API/Worker DB bağlantısından önce. Reddetme stderr'de yalnızca değişken adlarıyla görünür. Audit kaydı M7'de yeniden ele alınacak.

## 7. Pipeline

### 7.1 Adımlar

| # | Adım | Ağırlık | Yapan | Girdi → Çıktı | Tahmini süre (45 sn video) | İlerleme kaynağı |
|---|---|---|---|---|---|---|
| 1 | research | 8 | researcher | ürün adı → `ProductResearch` (+ zorluk seviyesi) | 4–6 dk | agent |
| 2 | storyboard | 7 | storyboarder | research → `Storyboard` (tahmini vuruş süreleriyle) | 2–4 dk | agent |
| 3 | voice | 5 | audio_director + ses servisi | **sadece VO modunda.** Storyboard → normalize metin → TTS → Whisper hizalama → gerçek satır süreleri → **storyboard'un yeniden zamanlanmış yeni sürümü** + altyazılar + müzik seçimi | 3–6 dk | agent + TTS satır sayısı |
| 4 | build | 18 | builder | storyboard (son zamanlama) → `SceneSpec`, `product.py`, `.blend`, `scene.glb`, `events.json`, önizleme kareleri | 15–35 dk | agent + build olayları |
| 5 | draft_render | 4 | orchestrator | GLB + SceneSpec (+ VO) → taslak MP4 | ~1 dk | **render (gerçek kare)** |
| 6 | draft_review | 5 | reviewer_visual (tek) | taslak kareleri → bulgular; gerekirse 4'e dönüş (**en fazla 2 tur**, final 3 turdan ayrı) | 3 dk | agent |
| 7 | final_render | 26 | orchestrator | `.blend` → RGBA PNG kareleri (1350 kare × ~1 sn) | ~23 dk | **render (`Fra:`)** |
| 8 | compose | 10 | orchestrator | kareler + Remotion katmanı → sessiz video; `events.json`'dan deterministik SFX cue'ları; ffmpeg mastering → müzikli ve müziksiz mux | ~5 dk | **render (`onProgress`)** |
| 9 | qc | 2 | orchestrator | iki varyant → otomatik kapı raporu | < 5 sn | deterministik |
| 10 | review | 12 | 3 reviewer paralel | müzikli varyant + manifestler → puan ve bulgular | 4–6 dk | agent (3 kart) |
| 11 | finalize | 3 | orchestrator | en iyi sürüm, `cover.png`, bitirme kartı, karelerin silinmesi | < 1 dk | deterministik |

- **Sıralama gerekçesi:** Patlatma animasyonunun zamanlaması build adımında sabitlenir. Seslendirme build'den sonra üretilseydi, gerçek TTS süreleri storyboard tahminlerinden saptığında görüntü ile anlatım kayardı (rubrik P7: anlatılan parça ±0,5 sn içinde ekranda olmalı). Bu yüzden VO önce üretilir ve storyboard gerçek sürelere göre yeniden zamanlanır. SFX ise `events.json`'a bağlı olduğu için compose aşamasında kalır.
- **Seslendirmesiz modda** `voice` adımı `skipped` olur. Ağırlığı plandan çıkarılır ve kalan ağırlıklar toplam 100 olacak şekilde orantılı olarak ölçeklenir. Müzik seçimi bu modda build'in başında audio_director tarafından kısa bir alt görevle yapılır.
- **Toplam:** ~60–90 dk, düzeltme turları hariç. Gerçek süreler ölçülür ve sonraki tahminlerde kullanılır; ETA geçmiş ölçümlerden gelir.
- **Run klasörü tohumlama:** Düzeltme ve chat run'larında `runs/<runId>/` klasörü, ebeveyn sürümün artefaktlarıyla (spec'ler, `product.py`, `.blend`, stem'ler) tohumlanır. Agent'lar sürümler arasında dosya paylaşmaz.
- **Zorluk kapısı:** Araştırma ürünü "zor" bulursa (prosedürel olarak modellenemiyor ve lisanslı CC0 model de yok), run 1. adımın sonunda **gerekçeli** olarak "insan gerekli" durumuna düşer. Basit görünen bir video üretmektense durmak tercih edilir.
- **Belirsiz ürün adı:** Agent en yaygın yorumu seçer, seçimini `ProductResearch.interpretation` alanına yazar ve arayüzde gösterir.

### 7.2 Düzeltme döngüsü ve yeniden render kapsamı

`review` sonucuna göre:
- **Yayına hazır:** Tüm kapılar geçti, puan ≥ 80 ve her boyut kendi ağırlığının ≥ %60'ında.
- **Düzelt:** Puan 70–79 ya da bir kapı veya boyut başarısız.
- **Yeniden işle:** Puan < 70. Run storyboard adımına döner. Bu da tura sayılır.

Fixer'a **sadece başarısız kontrol kimlikleri, kanıtları ve düzeltme ipuçları** verilir. Düzeltmenin türü, yeniden çalıştırılacak kapsamı belirler:

| Düzeltme türü | Yeniden çalışanlar |
|---|---|
| Metin, etiket, altyazı (Remotion katmanı) | compose → qc → review (~6 dk) |
| SFX, müzik, seviye | compose → qc → review |
| VO metni veya telaffuz | voice → (herhangi bir vuruşun süresi ±0,3 sn'den fazla değiştiyse build'den itibaren tamamı, değişmediyse) compose → qc → review |
| Geometri, malzeme, ışık, kamera | build → draft_render → final_render → compose → qc → review (~35 dk) |
| Storyboard (yeniden işleme) | storyboard'dan itibaren tamamı |

- En fazla 3 tur yapılır. Bir önceki turda geçen bir kontrol yeniden başarısız olursa **regresyon** olarak işaretlenir ve o sürüm tercih edilmez.
- 3 tur sonunda eşik geçilemezse durum "insan gerekli" olur. En yüksek puanlı sürüm ve açık bulgular gösterilir; kullanıcı chat'ten devam eder.
- **Salınım tespiti:** Aynı kontrol iki kez düzelip yeniden bozulursa döngü erken durur.

**Spec notu (M5b):**
- **Kapsamı orchestrator hesaplar** (`fixScope`), fixer'ın beyanı yalnızca iddiadır. **build** yalnızca `product.py` ya da sahnenin render alanları (`name_tr` ve `recipe.note` hariç) değiştiyse; **compose** storyboard'un herhangi bir alanı ya da parça `name_tr` değiştiyse (compose `label_in` olaylarını güncel storyboard'dan türetir); `cta`, `loop_strategy`, `version` hiçbir şey render etmez → değişmemiş sayılır. Değişiklik yoksa ve beyan `storyboard` ise yeniden işleme; aksi halde dur (`unchanged`).
- **Sayaç:** `steps.fix_round` (≤ 3) taslak `round`'undan (≤ 2) ayrıdır; her tur yeni bir `versions` satırı. Build kapsamlı turda build ajansızdır (SpecStore'daki son sahne + `product.py`), `draft_review` "final düzeltme turu: taslak incelemesi atlandı (§7.2)" notuyla atlanır. Durma sırası: hazır; tur sınırı; kullanım muhafızı kapalı (`usage`); salınım; yeniden işle; düzelt.
- **Regresyon ve salınım yalnızca izlenen kontrollerde** (kapılar, ≥ 3 puanlı kontroller, qc kapı kontrolleri): sürekli skorlardaki 1–2 puanlık oynama gürültüdür. "İki kez düzelip bozulma" beş review gerektirir; ≤ 3 turda hiç tetiklenmez, bu yüzden salınım F→P→F ile (değerlendirilen turlarda) algılanır.
- **Seslendirmesiz kipte "SFX, müzik, seviye" satırına ulaşılamaz:** fixer'ın yazabileceği bir ses spec'i yoktur; D6 düşüşü (ör. izinli müzik yok) `unchanged` ile durur. M5c `AudioPlan` ile açar. VO satırı ve `rerender_scope 'voice'` M5c'de.

### 7.3 Tek geometri kaynağı: bpy → GLB

- Builder, `python/vg_blender` kütüphanesini kullanarak `product.py`'yi yazar. Kütüphanenin içeriği:
  - **Primitive'ler:** lathe profili, kutu ve bevel, yay, dişli, vida ve diş, ekstrüzyon, PCB ve bileşen, tel ve kablo, cam ve şeffaf hazne
  - **Malzemeler:** aşınma, pürüz, bump ve fırçalanmış metal içeren preset'ler; pirinç, krom, ABS, PC şeffaf
  - **Stüdyo ışığı:** HDRI veya alan ışıkları, AgX
  - **Kamera düzeneği:** 50–135 mm, DOF, hareket bulanıklığı
  - **Patlatma animasyonu:** SceneSpec'ten
  - **Dışa aktarımlar:** `anchors.json`, `events.json`, BVH çakışma raporu, `scene.glb`
- `build_scene()` Blender'ı headless ve render'sız çalıştırır (CPU, saniyeler). Çıktılar `.blend` ve `scene.glb`.
- Three.js taslağı `scene.glb`'yi yükler. Patlatma ve kamerayı **aynı SceneSpec anahtar karelerinden** interpolasyonla üretir. Gölgelendirme daha basittir ama düzen, kamera, zamanlama ve etiketler aynıdır.
- **Eşdeğerlik testi:** Her build'de seçili 5 karede anchor'ların ekran konumları iki taraftan hesaplanır: Blender tarafında `anchors.json`, Three.js tarafında Node içinde `three` matematiğiyle (`Vector3.project`; render yok, GPU yok, milisaniyeler). Fark 8 px'ten fazlaysa build başarısız sayılır. Konvansiyonlar: 1 birim = 1 cm; Blender Z-yukarı, glTF Y-yukarı dönüşümü; kamera FOV'u lens ve sensör genişliğinden türetilir.
- **M0 sonucu (spike d, Blender 5.2.2 / three 0.186.1):** 5 kare × 3 anchor'da en kötü fark **0,00 px**. Uygulamada uyulacak gerçekler:
  - `AnimationMixer` eylemleri `LoopOnce` + `clampWhenFinished` ile oynatılır. Varsayılan `LoopRepeat`, klip süresine eşit zamanda (son kare) 0'a sarar; M0'da bu 14,77 px hata verdi.
  - Dışa aktarıcı kamerayı `yfov = 2·atan(sensör/2 ÷ lens)` ve `aspectRatio` (0,5625) ile yazar; dikey karede `sensor_fit AUTO` için ek düzeltme gerekmez.
  - Kamera (TRACK_TO dahil) `nla.bake(visual_keying)` ile kare kare pişirilir; her düğüm kendi klibini alır, tek mixer hepsini oynatır. M0'da GLB'nin kendi klipleri kullanıldı.
  - Z-yukarı → Y-yukarı dönüşümünü dışa aktarıcı yapar: `(x, y, z)` → `(x, z, −y)`.
  - Birimler 1:1 aktarılır, ölçekleme yoktur. "1 birim = 1 cm" builder tarafında uygulanır.
- **M4b uygulaması (kanıt `docs/m4/m4b-summary.md`):**
  - **Hareketin de tek kaynağı bpy'dir.** SceneSpec'in patlatma ve kamera anahtarları Blender'da her kareye anahtarlanır (kısıt ya da NLA bake yok); her animasyonlu nesneye son karede tutma anahtarı eklenir. Three.js GLB kliplerini geçmişten bağımsız bir `seek` ile oynatır. glTF lensi animasyonlamadığı için dikey FOV kare başına `camera_track.json`'dan gelir. Kalem örneğinde 5 karede en kötü fark 0,01 px.
  - **`product.py` sözleşmesi:** yalnızca `import math` ve `def build(vg)`; parçalar `vg.part(kimlik, …)` ile kurulur.
  - **İki aşamalı build, bubblewrap içinde:** ağ yok, `$HOME` boş tmpfs, yalnızca run klasörü yazılabilir. Aşama 1 güvenilmeyen kodu çalıştırıp yalnızca geometri `.blend`'ini üretir; aşama 2 worker betiğidir (`--disable-autoexec`) ve manifestleri hesaplar. AST izin listesi agent'a kısa gerekçe veren ilk süzgeçtir, sınır bwrap'tır.
- **Pilottan öğrenilenler (kütüphane varsayılanları):**
  - kapalı yay uçları
  - mekanizmanın çalıştığı yeri gösteren zorunlu bir "mekanizma çekimi"
  - ön plan kapatma kontrolü: o vuruşun konusu olmayan bir parçanın ekrana izdüşen kutusu kadraj alanının %25'ini aşarsa build uyarı verir (pilottaki dev yay hatası)
  - pirinç ve metal renk doğruluğu
  - ilk karede kahraman nesne (kadraj yüksekliğinin ≥ %35'i)
- **3D varlık sırası:**
  1. prosedürel bpy
  2. elektronikler için KiCad STEP (STEP Importer eklentisi)
  3. Poly Haven CC0
  4. Smithsonian CC0
  5. Objaverse cc0/by (atıfla)

  Yapay zekâyla 3D üretim 6 GB'a sığmıyor ve kullanılmaz (PartCrafter ≥ 8 GB, TRELLIS ≥ 16 GB; araştırmayla doğrulandı).

### 7.4 Artefakt sözleşmeleri (zod, `packages/shared`)

| Şema | Ana alanlar |
|---|---|
| `ProductResearch` | `interpretation`, `difficulty` (`procedural` \| `needs_asset` \| `too_hard`), `parts[]{id, name_tr, function, material, approx_dims_mm, count, assembly_order, sources[]}`, `mechanism{summary_tr, steps[]}`, `claims[]{id, text_tr, sources[]{url, quote, accessed_at, type}}`, `fun_facts[]`, `engineer_insight` |
| `Storyboard` | `version`, `audio_mode`, `duration_s`, `hook{pattern, text_tr}`, `beats[]{id, t_start, t_end, camera{shot, move, lens_mm}, parts[], action, onscreen_text{tr}, vo_text{tr}?, sfx_cues[], claim_ids[]}`, `rehook_at`, `payoff_at`, `loop_strategy`, `cta?` |
| `SceneSpec` | `units:'cm'`, `parts[]{id, recipe \| asset_ref, material_preset, explode{vector, t_start, t_end, ease}, anchor_local}`, `camera_keys[]`, `lighting_preset`, `style_id` (kanal kimliği), `fps:30`, `frames` |
| `AudioPlan` | `mode`, `vo_lines[]{beat_id, text_tr, normalized_tr, wav, start_ms}`, `captions[]` (Remotion `Caption`), `sfx[]{event_id, asset_id, offset_ms, gain_db}`, `music{asset_id, gain_db}?`, `mastering{target_lufs:-14, tp:-1}` |
| Manifestler | `anchors.json`, `events.json` (`explode_start`, `part_lock`, `label_in`, `zoom`), `layout.json` (metin kutuları, px, renk), `provenance.json` (varlık, araç, model, lisans), `claims.json` |
| `Review` | `rubric_version`, `reviewer_role`, `checks[]{id, pass, score, evidence{frame, timecode, crop}, fix_hint}`, `dimension_scores` (sadece rolün sahip olduğu boyutlar, §8.2), `gate_results` |
| `FixReport` | `round`, `addressed[]{check_id, change_summary_tr, files[]}`, `not_addressed[]{check_id, reason}`, `rerender_scope` (`compose` \| `voice` \| `build` \| `storyboard`), `spec_diffs[]` |

Her JSON artefakt hem içerik adresli dosya olarak hem de Postgres'te `jsonb` olarak tutulur, böylece sorgulanabilir.

**M4a uygulama notları (`packages/shared/src/artifacts.ts`):**
- `ProductResearch.difficulty_reason_tr` eklendi: `too_hard` için zorunlu (zorluk kapısı gerekçeli durur, §7.1). `approx_dims_mm` 3 pozitif sayılık sabit uzunluklu dizi (`minItems/maxItems`; `prefixItems` kullanılmaz). Yapılabilir üründe en az 3 parça ve 3 kaynaklı iddia.
- Kanca kalıp adları türetilmiştir (spec ad vermiyor; M5 kalibrasyonunda gözden geçirilir): `question`, `number`, `misconception`, `reveal`, `contrast`. Kamera: `shot ∈ {hero, wide, medium, close, macro}`, `move ∈ {static, orbit, push_in, pull_out, pan, tilt}`, `lens_mm` 50–135.
- **Sert kurallar** (ihlal → aynı oturumda düzeltme isteği): kimlik tekilliği, vuruşlar 0'dan `duration_s`'ye bitişik, `rehook_at` sürenin %40–60'ı, `payoff_at` ≥ %70, ses moduna göre `vo_text` zorunlu/yasak, parça ve iddia kimlikleri araştırmada var. **Yumuşak kurallar** (yalnızca uyarı; G2 kapısı M5'te): sayısal iddia için 2 bağımsız ya da 1 birincil kaynak.
- SDK'ya `outputFormat` olarak `z.toJSONSchema` çıktısı (`$schema` olmadan) verilir; incelikler (refine) JSON Schema'da ifade edilemediği için sonuç zod ile yeniden doğrulanır.

**M4b uygulama notları (`packages/shared/src/scene.ts`, `styles.ts`):**
- `SceneSpec` şu alanları taşır:
  - `duration_s` (storyboard ile aynı), `frames = round(duration_s × 30)`, `hero_part`;
  - parçalarda `name_tr` ve `recipe{primitive, note}` (betimleyici; geometrinin kaynağı `product.py`);
  - kamera anahtarlarında `ease` (lens 50–135).
- `asset_ref` şemada vardır ama varlık defteri gelene kadar (M5) reddedilir. Araştırma `needs_asset` derse run `needs_human` olur.
- `style_id` Ayarlar'daki kanal kimliğidir (K19; üç seçenek: `atolye`, `beyaz_lab`, `gece_mavisi`). Renkler yalnızca `styles.ts`'te tutulur; Blender onları build başına `style.json` olarak alır.
- Manifestler:
  - `anchors.json`: 5 karede bir + eşdeğerlik kareleri;
  - `events.json`;
  - `camera_track.json`: kare başına `yfov`;
  - `build.json`: sert hatalar (eksik ya da fazla parça, üçgen > 400 bin, `product.py` hatası) ve uyarılar (kahraman < %35, ön plan kapatma > %25, iç içe geçme).
- Önizleme kareleri şeffaftır; kontakt sayfası stilin tam renkli arka planına bindirilir (AgX tonlaması dünya rengini kaydırıyordu).

**M4c uygulama notları (`packages/shared/src/review.ts`):**
- Taslak `Review`'u `rubric_version 'draft@1'`, `reviewer_role 'reviewer_visual'`, 8 kontrol (`hero_frame0` blocker; `mechanism_shot`, `parts_visible`, `labels_correct` major; `no_intersection`, `text_readable`, `motion_flow`, `no_slop` minor), `dimension_scores{D2,D3,D5,D9}`, `gate_results{G3,G5}` taşır. Her kontrol tam bir kez; `pass:false` kanıt (kare, zaman kodu) ve `fix_hint` ister; kare taslağın ffprobe kare sayısının içinde ve `|kare/30 − zaman| ≤ 0,5` olmalıdır.
- Önem derecesi kontrol kimliğine bağlıdır (`DRAFT_CHECKS`), reviewer belirlemez. Karar `draftDecision`'ın işidir: başarısız blocker/major ya da kapı → `revise`; minor yalnızca notta. Puan karara girmez (kalibrasyon M5).
- `reviews/findings` tabloları M5'te; M4c'de Review `artifacts` satırıdır (`kind 'draft_review'`, meta `{round, verdict, draftArtifactId}`).

**M5b uygulama notları (`packages/shared/src/final-review.ts`, `fix-loop.ts`):**
- **`dimension_scores` hesaplanır, reviewer yazmaz** (F4): Reviewer her kontrol için `{pass, score 0–1, evidence, fix_hint}` verir (pass ⇔ score ≥ 0,5; pass:false ise kanıt ve ipucu zorunlu); boyut puanı = Σ(kontrol puanı × score), kapı = kapının kontrollerinin hepsi geçti; `panelScore` + `finalVerdict` saf fonksiyonlardır. `final@1` 30 kontrol taşır (LLM 83 + D6 12 + D7 5 = 100). Önem derecesi yalnızca fixer sırası ve arayüz içindir. Bu yüzden "geçmedi" bir kontrol varken K13 sağlanabilir (`ready` + açık küçük bulgular).
- Sözleşme adı `FinalReview` (taslak `Review` ayrı kalır). **FixReport**: `round 1–3`, `addressed[]`, `not_addressed[]`, `rerender_scope` (`compose|voice|build|storyboard`), `spec_diffs[]`; her başarısız kontrol tam bir listede olmalı; `voice` M5b'de reddedilir ("seslendirme kapsamı M5c'de"). Hesaplanan kapsam beyandan farklıysa hesaplanan kazanır (`fix.scope` audit).
- Fixer `research`'ü değiştiremez (G2 düzeltmesi ekrandaki iddiayı çıkarmak ya da yeniden yazmaktır → compose).

### 7.5 Render

- **Blender önizleme:** 8 kare, %50 ölçek, 16 örnek, kontakt sayfası ve güvenli alan katmanı (~20 sn).
- **Blender final:** EEVEE, raytracing, 64 örnek, AgX "Punchy". Çıktı RGBA PNG. `Fra:` satırları ayrıştırılarak gerçek kare ilerlemesi alınır. Her işten önce `gpu.platform.renderer_get()` çıktısında "NVIDIA" yazdığı doğrulanır.
- **Remotion:** Tek bir paylaşılan çalışma alanı kullanılır; şablon değişmedikçe bundle tekrar alınmaz. `renderMedia` için `inputProps`, `concurrency: 2`, `onProgress` ve `cancelSignal` kullanılır. `chromiumOptions.gl='angle'` sadece ThreeCanvas'ta. Remotion Studio asla gömülmez (sürükleme kaynak koda `translate` yazıyor).
- **M4c taslağı:** 540×960, 30 fps, h264 CRF 18 `veryfast`, `yuv420p` + tv + bt709, sessiz; kapak 0. kare 270×480. Render worker'da değil `packages/remotion/src/render-cli.ts` çocuk sürecinde (süreç grubu + `render` PID dosyası; iptal, zaman aşımı 600 sn ve yeniden başlatma Chrome'u da öldürür); Chrome/WebGL hatası bir kez `concurrency 1` ile yeniden denenir. GLB tek seferlik jetonlu bir 127.0.0.1 yolundan sunulur. Bundle `<dataDir>/cache/remotion/<bundleHash>` altında önbelleğe alınır. Çıktı ffprobe ile doğrulanır; uymayan taslak kaydedilmez (`render.draft_rejected`). GL `VG_REMOTION_GL` ile seçilebilir (varsayılan `angle`).
- **Kodlama:** H.264 High, CRF 16–18, preset slow, `yuv420p`, `color_range tv`, bt709, GOP ≤ 2 sn, `faststart`, AAC 48 kHz. `yuvj420p` veya pc range çıktıları **otomatik reddedilir**.
- **M5a final (plan E5–E8):** Blender `final_cli.py` `.blend`'in kendi ayarlarıyla (EEVEE 64, raytracing, AgX Punchy) `film_transparent` RGBA PNG `fNNNNN.png` yazar; her kare geçici adla yazılıp yeniden adlandırılır, imzası ve IEND'i tam olan kare yeniden başlatmada atlanır (`VG_SKIPPED`). İlerleme `Fra:` yerine kare başına `VG_PROGRESS done total`. Çökme bir kez `--samples 32` ile yeniden denenir (§14), ikincisi `failed`. Kareler blob deposuna girmez (`runs/<id>/final/<hash16>/frames`). `Final3D` (Remotion) kareyi kanal stilinin arka planına bindirir ve taslakla **aynı** `Overlay`/`labelsAt`'ı kullanır (WebGL yok); kareler ve GLB tek seferlik jetonlu 127.0.0.1 yolundan sunulur. **Kodlama zinciri iki aşamalıdır:** Remotion → sessiz `master.mp4` (CRF 14, `fast`) → tek ffmpeg teslim kodlaması (`libx264 -profile:v high -crf 17 -preset slow -g 60 -keyint_min 30 -sc_threshold 0`, yuv420p/tv/bt709, faststart; `-x264-params cabac=1:8x8dct=1`: `ultrafast` preset'i aksi halde Constrained Baseline işaretler) → iki varyant `-c:v copy` + AAC 48 kHz. Teslim preset'i `VG_ENCODE_PRESET` (varsayılan `slow`, smoke `ultrafast`).

### 7.6 Ses ve iki varyant

- **VO modu (`voice` adımı, build'den önce):**
  1. Türkçe metin normalizasyonu: sayılar, birimler, kısaltmalar, ondalık virgül
  2. Cümle bazında TTS
  3. Whisper ile kelime zamanları; senaryo metniyle eşleştirilir; CER > %5 ise yeni seed ile yeniden üretilir. CER **iki tarafa da `normalize_tr` uygulanarak** hesaplanır (`cer(normalize_tr(betik), normalize_tr(asr))`): Whisper sayıları rakamla yazar ("0,7 mm"), betik sözle açılır; ham ASR'ye karşı CER doğru okumayı da cezalandırır (M1: %13,9 yerine %0,5, `docs/m1/decision.md` §3)
  4. 120–250 ms aralar
  5. 48 kHz'e yeniden örnekleme
- **Seslendirmesiz mod:** Her vuruşu metin ve SFX taşır.
- **SFX:** `events.json`'dan otomatik cue çıkarılır. Örneğin `explode_start` → whoosh, `part_lock` → click/snap. Başlangıç zamanı ±1 kare doğrulukta; aynı ses 10 sn içinde en fazla 3 kez çalınır.
- **Mastering (ffmpeg, `compose` adımında):** Sidechain ducking ile müzik konuşma altında 10–14 dB düşer. İki geçişli `loudnorm` ile −14 LUFS / −1 dBTP hedeflenir; sonuç `ebur128` ile doğrulanır. Not: −14 LUFS resmi bir TikTok değeri değil, kanal konvansiyonudur.
- **M5a (seslendirmesiz, plan E10–E12):** SFX prosedürel CC0 kütüphaneden (ffmpeg ile üretilir, defterde `allowed`): `explode_start→whoosh`, `part_lock→click`, `label_in→tick`, `zoom→swoosh`; storyboard `sfx_cues` kelimeleri kütüphane adlarıyla eşleşirse vuruş başına; 0. ms'de kanca `whoosh`'u; aynı 2 kare içinde tek cue. Müzik yalnızca defterde `allowed` parçalardan, video kimliğinin hash'iyle seçilir; yatak −18 dB, 1 sn giriş / 2 sn çıkış; izinli müzik yoksa müzikli varyant SFX'ten ibarettir ve qc notu bunu söyler. Mastering −14 LUFS'u, AAC kodlamasının sınırlayıcıyı 0,5–1,1 dB taşırdığı ölçüldüğü için **−2 dBTP** hedefiyle yapar; teslim dosyası ölçülür, −1,3 dBTP'yi aşarsa karışım sınırlayıcı aşım kadar indirilerek bir kez daha masterlanır (loudness korunur). Ducking ve VO M5c.
- **Varyantlar:** Remotion videoyu **bir kez ve sessiz** render eder. Ses iki varyant için ayrı ayrı mux'lanır (`-c:v copy`):
  - `final_music.mp4` → asıl sürüm; Shorts ve arşiv için
  - `final_tiktok.mp4` → müziksiz; TikTok'a varsayılan olarak bu gider
- **Disk:** PNG kareleri, run son durumuna (`ready`, `needs_human`, `failed`, `cancelled`) ulaşınca `finalize`/temizlik adımında silinir. QC'den hemen sonra silinmez, çünkü sadece metin düzelten (compose kapsamlı) bir tur bu kareleri yeniden kullanır; silinmiş olsalar ~23 dk'lık Blender render'ı boşa tekrarlanırdı. Disk muhafızı aktif run'ların karelerini hesaba katar. Kalıcı olarak tutulanlar:
  - MP4 varyantları
  - taslak MP4
  - kontakt sayfaları
  - `.blend`, `scene.glb`
  - spec'ler ve manifestler
  - stem'ler (FLAC)
  - kapak görseli

  Toplam ~25–40 MB/video.

  M5a: kareleri orchestrator run terminal duruma geçince siler (`frames.deleted` audit; iptal edilen run'da son çalışan iş bittiğinde). M5b'de fixer turları kareleri yeniden kullanacağı için temizlik `finalize`'a taşınır.

## 8. Kalite sistemi

### 8.1 Rubrik (sürümlü, `packages/shared/rubric.yaml`)

*M5a notu (plan E2–E4):* rubrik YAML yerine tipli modüldür: `packages/shared/src/rubric.ts` (`final@1`, kapı/boyut tabloları, sahipler) + `qc.ts` (sabit QC kontrol kimlikleri, `QC_LIMITS`, saf `evaluateQc`). Otomatik puanlar yalnızca orchestrator'ın boyutlarında: D6 12 (loudness 4, true peak 2, LRA 1, ilk ses 2, sessizlik 3), D7 5 (GOP 2, bitrate 1, faststart 1, kapak 1); D2/D3/D8 ölçümleri puansızdır (reviewer'a girdi). LRA ≤ 11 LU kanal konvansiyonudur ve yalnızca ≥ 10 sn içerikte uygulanır (kısa kliplerde güvenilmez).

**Kapılar.** Biri bile başarısız olursa video yayına hazır sayılmaz:

| Kapı | İçerik |
|---|---|
| G1 Teslim | 1080×1920, 30 fps, H.264 High, `yuv420p`/tv/bt709, AAC 48 kHz, 35–55 sn, < 64 MB |
| G2 Doğruluk | Desteksiz veya çelişkili iddia sıfır. Sayısal iddialar için 2 bağımsız kaynak ya da 1 birincil kaynak |
| G3 Haklar | Üçüncü taraf görüntü, logo veya filigran yok. Müzik lisanslı ya da uygulamada eklenecek. Marka adları sadece tanımlayıcı olarak |
| G4 Beyan | AIGC kararı: klon ses → etiket zorunlu; Blender CG ve hazır TTS sesi → gerekmez |
| G5 Güvenlik | Saniyede ≤ 3 flaş. Taklit edilebilir tehlikeli eylem yok (ör. Li-ion hücre açma). CG gerçek çekimmiş gibi sunulmaz |
| G6 Güvenli alan | Sert maskede hiçbir karede metin yok: üst 150 px, alt y > 1510, sağ 130 px. Telefon ekran görüntüleriyle kalibre edilecek (§18) |

**Boyutlar.** Toplam 100 puan:

| Boyut | Ağırlık | Örnek kontroller |
|---|---|---|
| D1 Kanca | 15 | Kahraman nesne ve kanca yazısı 0. karede; yazı ≤ 0,5 sn'de tam görünür; ilk ses ≤ 0,15 sn; VO'da ilk kelime ≤ 0,3 sn ve 5 kanca kalıbından biri; yasaklı açılışlar yok |
| D2 Görsel zanaat | 15 | Siyah segment yok; özne/arka plan kontrastı ≥ 3:1; inandırıcı malzemeler; BVH çakışması sıfır; z-fighting veya titreme yok |
| D3 Hareket/tempo | 12 | Her 2 sn'de ≥ 1 görsel olay; 0,5 sn'den uzun donma yok; Bezier yumuşatma; wagon-wheel kuralı |
| D4 Bilgi/doğruluk | 15 | Her 5 sn'de ≥ 1 kaynaklı bilgi; en az 1 neden-sonuç mekanizması; en az 1 mühendis içgörüsü |
| D5 Tipografi/etiketler | 10 | Kanca ≥ 64 px; etiketler 40–56 px; kontrast ≥ 4,5:1; aynı anda ≤ 6 etiket; etiket çizgisi doğru parçaya bitiyor |
| D6 Ses | 12 | −14 LUFS ±1; true peak ≤ −1 dBTP; ses başladıktan sonra 0,3 sn'den uzun sessizlik yok; SFX senkronu; VO hızı 4,0–5,5 hece/sn |
| D7 Teknik cila | 5 | Renk etiketleri, bitrate ve GOP, kapak, açıklama |
| D8 Döngü/izlenme | 8 | Son→ilk kare SSIM ≥ 0,90; açık soru 0–3 sn'de; ikinci kanca runtime'ın %40–60'ında; ödül ≥ %70'te |
| D9 Özgünlük/anti-slop | 8 | Kahraman görselde üretken AI yok; son 10 bölümle kanca benzerliği < 0,6; slop ifadeleri listesi (TR ve EN) sıfır; ekranda emoji yok |

Ölçütlerin tam listesi ve kanıt seviyesi etiketleri (resmi / üçüncü taraf / folklor / türetilmiş) araştırma raporundan alınarak `rubric.yaml`'a girer.

### 8.2 Doğrulayıcı sırası (önce ucuz kontroller)

1. **AUTO (~2 sn):** qc_probe (ffprobe, `ebur128`, `blackdetect`, `freezedetect`, `scdet`, SSIM). Otomatik doğrulanabilen kapılardan (G1, G6 ve G5'in flaş kontrolü) biri başarısızsa LLM reviewer'lar hiç çalışmaz; doğrudan fixer'a gidilir. Böylece bariz teknik hatalar için kullanım limiti harcanmaz.
2. **MANIFEST:** `layout.json`, `anchors.json`, `events.json` ve storyboard üzerinden güvenli alan, punto, kalma süresi, olay yoğunluğu ve SFX senkron kontrolleri.
3. **VISION:** reviewer_visual. Saniyede 1 kare, segment sınırlarında ek kareler, 540×960 ve üstü çözünürlük, 12 karelik kontakt sayfası, 2× kırpmalar, güvenli alan katmanı.
4. **WEB:** reviewer_facts. Sayısal iddiaların hepsi ve URL'lerin rastgele %30'u yeniden doğrulanır; storyboard uygunluğu kontrol edilir.
5. **Retention:** reviewer_retention. Kanca, ikinci kanca, ödül, döngü, slop ifadeleri.

**Boyut sahipliği ve toplam puan.** Her boyutun puanını tek bir sahip verir; toplam bu puanların toplamıdır. Bir boyutun hem otomatik hem görsel kontrolleri varsa otomatik kontroller sahibine girdi olarak verilir.

| Sahip | Boyutlar ve kapılar |
|---|---|
| orchestrator (AUTO + MANIFEST, LLM yok) | D6 Ses, D7 Teknik cila, G1, G6, G5 (flaş) |
| reviewer_visual | D2 Görsel zanaat, D3 Hareket/tempo, D5 Tipografi/etiketler, D9 Özgünlük/anti-slop, G3 (görsel kısmı), G5 (gerçek çekim yanılsaması) |
| reviewer_facts | D4 Bilgi/doğruluk, G2, storyboard uygunluğu (D4 içinde) |
| reviewer_retention | D1 Kanca, D8 Döngü/izlenme |
| orchestrator (kural) | G4 (AIGC kararı: ses seçimi ve provenance'tan deterministik) |

**Spec notu (M5b):**
- **Kare bütçesi** "saniyede 1 kare" yerine **12 + 12 + 8** (maliyet): adım müzikli varyanttan 4×3 kontakt sayfası (12 kare) hazırlar; reviewer rol + tur + sıra başına 12 tek kare ister (`extract_frames`, 1080×1920'den); izlenme reviewer'ına ek olarak 4×2 "kanca sayfası" (0, 0,5, 1, 2, 3 sn, `rehook_at`, `payoff_at`, son kare) verilir. `run_qc` kayıtlı `qc_report`'u döner, yeniden ölçmez.
- **Web hedefleri:** yalnızca videoda kullanılan iddialar (storyboard `claim_ids`); her sayısal iddianın kuralı sağlayan kaynakları + kalan (iddia, URL) çiftlerinden `runId:fixRound` ile tohumlanmış %30 (yukarı yuvarlanır), en çok 16. Reviewer her hedef için `web_checks{claim_id, url, reachable, supports}` döndürmek zorundadır. "Desteksiz" yalnızca ulaşılabilen bir kaynağın iddiayı taşımadığı ve hiçbir ulaşılabilen kaynağın desteklemediği durumdur; erişilemeyen sayfa tek başına G2'yi düşürmez.
- AUTO kapısı düşerse (adım 1) `review` LLM çalıştırmaz, tur özeti (toplam `null`) kaydedilir ve fixer qc bulgularıyla başlar; değerlendirilmeyen LLM kontrolleri "bilinmiyor" sayılır.

### 8.3 Kendi kendini onaylamaya karşı önlemler

- Reviewer'lar ayrı ve izole oturumlarda çalışır. Builder'ın düşüncesini görmezler; her bulguyu kare ve zaman koduyla kanıtlamak zorundadırlar.
- Sınırdaki puanlarda (78–82) ikinci, bağımsız bir görsel review çalışır. Puanların ortalaması alınır.
  - **Spec notu (M5b):** İkinci review yalnızca görsel reviewer'ındır (`seq 2`, taze oturum, ilk review'un oturumu sürdürülmez); kontrol başına skor ortalaması alınır (pass = ortalama ≥ 0,5), kapı kontrolleri için ikisinin de geçmesi gerekir. Seq-1 satırının bulguları ortalanmış sonuçtur; ham çıktılar `final_review_visual{,2}` artefaktlarında. Tetik: kapıların hiçbiri düşmemiş ve toplam 78–82.
- **Kalibrasyon:** Kalem pilotu (`~/icinde-ne-var/pilot-kalem/remotion/out/icinde-ne-var-kalem.mp4`) bilinen kötü örnek olarak kullanılır. Rubrik bu videoda en az şu 7 hatayı yakalamalı: −23,4 LUFS, LRA 20,6, ilk ses 0,79 sn, sessizlikler, donmalar, renk etiketleri, güvenli alan ihlalleri. Yakalamıyorsa rubrik hatalı sayılır.
  M5a: `qc-cli` (`apps/worker/src/render/qc-cli.ts`) ile ölçülür. Pilot benzeri sentetik klip (14 sn; −29,3 LUFS, LRA 16,9, ilk ses 0,81 sn, sessizlik, 1,3 sn donma, yuvj420p/pc, bantta metin izi) 7 hatanın hepsinde düşer (`apps/worker/test/qc.test.ts`); gerçek pilot dosyasıyla doğrulama GPU'lu makinede (`docs/m5/real-check.md` §1).
- **Bayat artefakt koruması:** Her render için `sha256(spec + src + lock)` kaydedilir. Hash'i güncel spec'le uyuşmayan bir artefakt review edilmez.

### 8.4 Sonradan ayarlama

İlk 10 yayından sonra kullanıcı TikTok Studio'daki ortalama izlenme süresi ve tam izlenme oranını elle girer. Bu verilerle boyut ağırlıkları yeniden ayarlanır; folklor etiketli eşikler ilk revize edilenlerdir.

## 9. Ses ve varlık katmanı (ücretsiz, yerel, lisanslı)

| Alan | Karar | Kanıt |
|---|---|---|
| TTS | M1'de **dinleme testi**: Chatterbox Multilingual V3 (MIT) ve FreyaTTS-small (Apache-2.0), aynı Türkçe metinle; hazır ses ve kendi ses klonu yan yana. Kararı kullanıcı verir. **M1 sonucu (GEÇİCİ, kullanıcı onayı bekliyor): varsayılan Chatterbox Multilingual V3** (kaynak `5de7a54`, ağırlık `t3_mtl23ls_v3`, `t3_model="v3"`), hazır ses; **yedek FreyaTTS** yalnızca VRAM baskısında. Klon test edilmedi (kullanıcı kaydı yok) | Ticari kullanıma uygun, Türkçe konuşan ve 6 GB'a sığan sadece bu ikisi. XTTS-v2, MMS ve F5 ticari değil; Kokoro'da Türkçe yok. M1 ölçümü (3 cümle, tek tohum): Chatterbox adil CER %0,5, `rtf_gen` 0,63, tepe 3611 MB; Freya adil CER %17,9 (> %5; yanlış telaffuz + tekrar), `rtf_gen` 0,30, tepe 1811 MB (`docs/m1/decision.md`) |
| TTS çalışma şekli | `python/audio_service`: Chatterbox + Whisper tek uv venv (Python 3.12). Model **sadece ses işi sırasında, GPU kilidi altında** yüklenir ve iş bitince boşaltılır. Freya yedeği ayrı venv'de (`~/videogen-data/venvs/freya`; olası bağımlılık çakışmasına karşı) | Chatterbox M1'de tepe **3,3–3,6 GB** VRAM tuttu (torch 3251 MB / nvidia-smi 3611 MB); yüklü kalırsa Blender çakışır |
| Hizalama | faster-whisper (large-v3-turbo veya bu GPU'ya sığan en büyük model) kendi venv'inde. M1: large-v3-turbo, `audio_service` venv'inde; `av==16.1.0` sabit (av 19 ile WAV açılamıyor). Kelime zamanları senaryoyla eşleştirilir ve Remotion `createTikTokStyleCaptions` ile kullanılır | Mevcut `transcription` komutu başka bir deneyin venv'ine bağlı; kırılgan, ona güvenilmez |
| SFX | Kenney CC0 paketleri + lisansı CC0 olarak doğrulanmış Remotion sesleri (whoosh, whip, mouse-click, switch, page-turn, shutter). Remotion'un `ding.wav` sesi **lisanssız**, kullanılmaz. Gerekirse ffmpeg ile prosedürel SFX | Araştırma raporu |
| Müzik | `assets` defteri: başlık, kaynak URL, SPDX lisansı, yazar, atıf metni, lisansın anlık görüntüsü, sha256. Sadece Pixabay Content License, CC0 ve CC-BY-4.0 kabul edilir; NC, ND, SA ve YouTube Audio Library standart lisansı engellenir. Kürasyon arayüzden elle yapılır | Ücretli API yok; MusicGen ve YuE çıktıları ticari değil |
| Lisans kapısı | Render, defterde olmayan veya izin verilmeyen bir varlığı **reddeder**. CC-BY atıfları açıklama metnine otomatik eklenir | |
| Klon ses | Seçilirse G4 kapısı AI etiketini zorunlu tutar ve bitirme kartı bunu hatırlatır | TikTok AIGC kuralı |

*M5a notu (plan E13):* `assets` defteri (migration 0007) içe aktarımda lisansı denetler: `CC0-1.0`, `CC-BY-4.0` (atıf metni zorunlu), `LicenseRef-Pixabay` izinli; diğerleri `allowed=false` + `asset.rejected` audit'iyle kaydedilir. Lisans metninin anlık görüntüsü blob'dur. İçe aktarma `node bin/assets.mjs add …` (arayüz kürasyonu M7). Ses planı varlığı kullanım anında yeniden denetler (`LicenseError`). Atıf `audio_plan`'da saklanır; açıklama metnine eklenmesi M6.

## 10. Yayın

- **TikTok modülü:** `~/tiktok-poster` Node/TypeScript'e taşınır (`apps/worker/src/publish/tiktok.ts`). Kapsam:
  - endpoint'ler: `creator_info`, `inbox/video/init` (varsayılan), `video/init` (sadece "gizli önizleme" seçeneği için)
  - sırayla PUT chunk'ları (≤ 64 MB tek parça; test edilmiş yol)
  - 5 sn aralıklı `status/fetch` yoklaması
  - token yenileme
  - `validatePost` ve `is_aigc` alanı `tiktok-publisher-mvp`'den alınır
- **Token:** `~/videogen-data/secrets/tiktok-tokens.json` (0600). İlk kurulumda `~/tiktok-poster/tokens.json` kopyalanır. Yeniden bağlanma Desktop PKCE akışıyla, `localhost:3455` üzerinden yapılır. Token içerikleri asla loglanmaz veya audit'e yazılmaz.
- **Sınırlar:** Son 24 saatteki taslak sayısı veritabanından tutulur; 5'te gönderim engellenir. Hata kodları Türkçe mesajlara çevrilir: `spam_risk_too_many_pending_share`, `rate_limit_exceeded`, `access_token_invalid`, `unaudited_client_can_only_post_to_private_accounts`. Zaman aşımı "bekliyor" sayılır, başarı değil.
- **Bitirme kartı** (gönderimden sonra):
  - kopyalanacak açıklama ve 3–4 hashtag
  - "uygulamadan ses ekle" (müziksiz varyantta **zorunlu**)
  - "Herkes" seçimi
  - AI etiketi kararı
  - ticari içerik anahtarı
  - "Yayınlandı olarak işaretle" (URL ve zaman audit'e yazılır)
- **Shorts:** Müzikli varyantın dışa aktarımı (indirme). v1'de API yok.

## 11. Veri modeli, audit ve depolama

### 11.1 Tablolar (drizzle, `packages/db`)

| Tablo | Ana sütunlar |
|---|---|
| `products` | id, name, normalized_name, difficulty, created_at |
| `videos` | id, product_id, title, audio_mode, language, status (`queued`/`running`/`ready`/`needs_human`/`failed`/`cancelled`/`published`), current_version_id, best_version_id |
| `runs` | id, video_id, kind (`produce`/`fix`/`chat_edit`/`rerender`), trigger, parent_run_id, plan (jsonb: adımlar + ağırlıklar), progress, eta_s, status, started_at, ended_at |
| `steps` | id, run_id, key, ordinal, weight, status (`pending`/`queued`/`running`/`waiting_gpu`/`waiting_limit`/`waiting_disk`/`done`/`failed`/`skipped`/`cancelled`), progress, progress_source (`render`/`agent`/`time`/`deterministic`), attempt, input_hash, error, started_at, ended_at |
| `jobs` | id, step_id, resource (`gpu`/`heavy_cpu`/`claude`/`chat`), priority, status, run_after, lease_owner, lease_expires_at, heartbeat_at, payload. **Kira (lease) yalnızca burada tutulur;** adım durumu `steps`'te |
| `ui_events` | id (bigserial, SSE `id`), ts, topic (`run:<id>` / `video:<id>` / `session:<id>` / `system`), type, payload. Arayüzün kalıcı olay outbox'ı. Türetilmiş veri olduğu için 30 gün saklanır; asıl kayıt `audit_log` ve `agent_events`'tedir |
| `versions` | id, video_id, parent_version_id, round, spec_hash, src_hash, reason, created_by_session_id |
| `blobs` | sha256 (PK), path, bytes, mime, created_at |
| `artifacts` | id, version_id, run_id, kind, blob_sha, content (jsonb, JSON türleri için), duration_ms, width, height, codec, meta |
| `agent_sessions` | id, run_id, step_id, role, model, effort, claude_session_id, parent_session_id, sdk_version, cli_version, status, usage, num_turns, terminal_reason, transcript_blob_sha, started_at, ended_at |
| `agent_events` | id (bigserial), session_id, seq, type, subtype, parent_tool_use_id, tool_use_id, task_id, payload, ts |
| `reviews` / `findings` | review: version_id, round, reviewer_role, session_id, rubric_version, total, dimension_scores, gates, verdict · finding: check_id, severity, gate, evidence (kare, zaman kodu, kırpma), fix_hint, status (`open`/`fixed`/`regressed`/`wontfix`), fixed_in_version_id |
| `claims` | video_id, version_id, text_tr, sources (jsonb), status, verified_at |
| `assets` | kind (`music`/`sfx`/`model3d`/`hdri`/`font`/`voice_ref`), title, blob_sha, license_spdx, source_url, author, attribution, license_snapshot_sha, allowed, platforms | + M5a: tags, duration_ms, created_at; (blob_sha, kind) tekil (0007) |
| `publications` | version_id, variant, platform, mode, publish_id, status, error_code, requested_at, completed_at, finished_in_app_at, url |
| `usage_snapshots` | ts, source, five_hour_util, five_hour_resets_at, seven_day_util, seven_day_resets_at, status, raw |
| `chat_threads` | id, video_id, title, claude_session_id, created_at |
| `settings` | key, value (rol başına model ve effort, eşikler, kanal kimliği) |

**M4a uygulama notları (migration `0005_pipeline`):** `videos.status_note` (kullanıcıya gösterilen gerekçe: `needs_human`/`failed`/"Storyboard hazır…"), `runs.error`, `runs.usage_start/usage_end` (run başı/sonu kullanım izi, §18), `steps.session_id` ve `steps.note` eklendi. Kısmi benzersiz indeksler: bir videoda tek aktif run (`runs(video_id) WHERE status IN ('queued','running')`), bir adımda tek aktif iş (`jobs(step_id) WHERE status IN ('queued','leased')`). Kimlikler `uuid`, `jobs.id` `bigserial`. Olay konuları `run:<id>`/`video:<id>` yerine `runs` / `videos` (`run.updated` → `RunView`, `video.updated` → `VideoView`), M3'ün `agents` konusu gibi; SSE konuya göre filtrelemez.

**M4c uygulama notları (migration `0006_step_round`):** `steps.round integer NOT NULL DEFAULT 0`. Taslak incelemesi `rewind` dönerse orchestrator `rewindForReview` ile tek transaction'da (inceleme adımı hâlâ `running` ve aynı turdaysa, run `running`'se) build…draft_review aralığını `pending`, `round+1`, `attempt 0` yapar ve işi kapatır; tekrar oynatma çift tur üretmez, iptal edilmiş run yeni tura geçmez. Yeni artefakt türleri: `draft_video` (`duration_ms/width/height/codec` dolu), `draft_cover`, `review_sheet`, `draft_review`. `VideoView.draft = {videoSha, coverSha, durationS}`.

**M5b uygulama notları (migration `0008_review_fix`):**
- `steps.fix_round integer NOT NULL DEFAULT 0`: final döngüsünün ayrı sayacı. Final `rewind` onu artırır, taslak `steps.round`'una dokunmaz; taslak dönüşleri run başına toplam ≤ 2 kalır.
- `reviews`: tur başına reviewer satırları + `reviewer_role 'orchestrator'` tur özeti (toplam, 9 boyut, 6 kapı, karar `ready|fix|rework`); `seq` (sınırdaki ikinci görsel review `seq 2`) ve `summary_tr` eklendi; tekillik `(run_id, round, reviewer_role, seq)`, yazımlar `ON CONFLICT DO NOTHING` (replay). `findings`: önceki turların açık bulguları düzelince `fixed` + `fixed_in_version_id`.
- Her final turu yeni bir `versions` satırıdır (`reason 'fix:pending'` → rewind'de `fix:compose`/`fix:build`/`fix:rework`); kimlik deterministiktir (`sha(runId, 'fix', fixRound)`). `finalize` `videos.best_version_id`'yi yazar; kütüphane puanı ve final önce en iyi sürümden alınır. `claims` tablosu M6'da.

| `audit_log` | §11.2 |

### 11.2 Audit

- **Sütunlar:** `id bigserial`, `ts`, `actor_type` (`user`/`orchestrator`/`agent`/`system`), `actor_id` (rol + oturum), `action`, `subject_type`, `subject_id`, `run_id`, `step_id`, `session_id`, `tool_use_id`, `data jsonb`, `prev_hash`, `hash`.
- **Değiştirilemezlik:** Güncelleme ve silme bir trigger'la engellenir. Uygulama rolünün `UPDATE`/`DELETE` yetkisi yoktur.
- **Hash zinciri:** `BEFORE INSERT` trigger'ı `pg_advisory_xact_lock` ile satırları sıraya koyar ve `hash = sha256(prev_hash || canonical(row))` hesaplar. Kanonik satır biçimi bir **JSON dizisidir** (`jsonb_build_array(...)::text`; alan sınırları taklit edilemez). `ts` istemciden alınmaz, trigger tarafından `clock_timestamp()` ile atanır. API ve Worker aynı yazma fonksiyonunu kullanır. `GET /api/audit/verify` zinciri baştan doğrular.
- **Kapsam:**
  - kullanıcı komutları
  - adım geçişleri
  - agent oturumu açılış ve kapanışı
  - her araç çağrısı (araç adı, girdi özeti, sonuç durumu, `tool_use_id`)
  - dosya yazımları (yol, önceki ve sonraki sha)
  - render'lar (komut, süre, çıktı sha)
  - review bulguları
  - lisans kapısı kararları
  - kullanım muhafızı geçişleri
  - yayınlar
  - ayar değişiklikleri
  - silmeler

  Gizli bilgiler asla yazılmaz.
- **Üç katman:** (1) `audit_log`, (2) `agent_events` + sıkıştırılmış ham NDJSON + transcript arşivi, (3) sistem logları (pino JSON, 30 gün). Audit ve agent olayları **sonsuza kadar** saklanır.

### 11.3 Medya deposu

- **Yazma:** Dosya önce geçici bir yola yazılır, `fsync` edilir, sonra `rename` ile `media/sha256/ab/cd/<sha>.<ext>` yoluna taşınır. Aynı içerik ikinci kez saklanmaz.
- **Silme:** Sadece veritabanı üzerinden yapılır, audit'e yazılır ve onay ister. Referanssız blob'lar haftalık çöp toplama işiyle silinir.
- **Yetim dosya raporu:** Diskte olup veritabanında kaydı olmayan dosyalar (ve tersi) raporlanır.
- **Yedekler:** Günlük `pg_dump -Fc` alınır, son 7 gün tutulur. Medya manifestinin kendisi de yedeğin içindedir.

## 12. İlerleme ve canlılık modeli (ekran donmaz)

### 12.1 İlerleme hesabı

- **Genel yüzde:** `Σ ağırlık × adım_oranı`. **Monoton** tutulur ve "yayına hazır" olmadan %100 gösterilmez.
- **Adım oranı kaynakları:**
  - `render`: gerçek kare sayısı. Blender'da `Fra:` satırları, Remotion'da `onProgress`.
  - `agent`: `report_progress` çağrıları, `[son, 99]` aralığına sıkıştırılmış.
  - `time`: rapor gelmezse geçmiş ölçümlerden türetilen yumuşak bir zaman eğrisi.
  - `deterministic`: orchestrator adımları.
- **Arayüzde yüzdenin kaynağı yazar:** "gerçek kare" ya da "tahmin".
- **Düzeltme turu:** Genel yüzde, review adımının sonundaki değerde sabit kalır. "Düzeltme turu k/3" kendi yüzdesiyle ilerler ve ETA güncellenir.
- **M4a uygulama (`packages/shared/src/progress.ts`):** `done` oran 1, diğerleri `ilerleme/100` (en çok 0,99); yayına hazır olmadan en çok %99, bir ondalık; yüzde DB'de `GREATEST` ile ve yayın tek advisory lock altında yükselir (olay akışı da monoton). Zaman eğrisi `100 × (1 − e^(−t/beklenen))`, en çok %90; `agent`/`render` raporu gelince zaman eğrisi o adıma yazmaz. Beklenen süre: son 5 bitmiş adımın medyanı, yoksa §7.1 orta değerleri. ETA: çalışan adım `beklenen × (1 − ilerleme/100)` (en az 5 sn) + bekleyen adımların beklenen süresi. Zorluk kapısında durdurulan run'da atlanan adımlar pay almaz (yüzde araştırma sonundaki değerde kalır; son review I1).
- **Spec notu (M5b):** `fix_round > 0` iken başlık "Düzeltme turu k/3 · %N" gösterir (k en yeni `fixRound`, N o turun ağırlıklı yüzdesi); değilse taslak etiketi ("Taslak turu k/2"). Genel yüzde, `finalize` bitmeden %100 olmaz (hazır video %100).

### 12.2 Agent kartı

```
┌ Builder · Opus 5.5 · high ─────────────── ● araç çalıştırıyor  04:12 ┐
│ ▸ Edit  scene/product.py                     +84 −12                 │
│   geometri 3/5 parça  ███████░░░  %62 · agent raporu                 │
│   ↳ alt ajan: "yay geometrisi"  ● çalışıyor  0:41                     │
│   son olay 2 sn önce · CPU %38 · 290 MB · 41K token                   │
└──────────────────────────────────────────────────────────────────────┘
```

- **Durumlar:** sırada · başlıyor · düşünüyor · araç çalıştırıyor · GPU bekliyor (sıradaki yeriyle) · limit bekleniyor (sıfırlanma saatiyle) · tamamlandı · başarısız · durduruldu.
- **Alt ajanlar** `task_started`, `task_progress` ve `task_notification` olaylarından ve `parent_tool_use_id` alanından türetilir. Kartlar iç içe gösterilir. M0'da `task_progress` hiç gelmedi ve alt ajanın `stream_event`'leri iletilmedi; kart `task_started` / `task_notification` ve `parent_tool_use_id`'li mesajlarla tek başına çalışmalıdır.
- Karta tıklanınca tam iz açılır: ThinkingState satırları, araç çağrıları, diff'ler, ham olaylar.
- **Gerçekleşen hali (M3, `docs/m3/agents.png`):** Stüdyo sol panelinde aktif pipeline oturumları + son 6 biten oturum. Başlık: rol · model etiketi · effort, durum noktası + Türkçe durum + geçen süre (`limit bekleniyor`'da açılma saati). `▸` son ana iş parçacığı araç satırı (yol/komut, `+/−`, `reddedildi`). İlerleme çubuğu + `%N` + kaynak (`agent raporu` / `tahmin`) + mesaj. `↳ alt ajan` satırları (durum + süre). Canlılık satırı `son olay N sn önce · süreç canlı · CPU % · MB · K token`; biten oturumda yalnızca token ve toplam süre. "Takılmış olabilir" uyarısı `role=alert` ile "Durdur" ve "Yeniden dene" taşır. "İzi göster" tam izi açar, Esc kapatır. Ham olaylar ve audit gezgini M7'de.

### 12.3 Canlılık

- Worker her 2 sn'de her çocuk sürecin (Claude, Blender, Chrome, ses servisi) CPU ve RSS değerini ölçer ve `vg_live` üzerinden yayınlar.
- **"Takılmış olabilir"** uyarısı şu durumda çıkar: 120 sn boyunca hiç olay gelmemiş **ve** CPU %1'in altında. Uyarıyla birlikte "Durdur" ve "Yeniden dene" butonları gösterilir.
- Sadece olay gelmiyor ama CPU çalışıyorsa kartta sadece "son olay N sn önce · süreç canlı" yazar.

### 12.4 Arayüzün kendisi donmaz

- Uzun işlerin hiçbiri istek/yanıt içinde yapılmaz. Komutlar `202` döner, sonuç olaylarla gelir.
- SSE olayları `requestAnimationFrame` ile toplu çizilir (≤ 10 Hz). İz listeleri 200 satırı geçince sanal kaydırma kullanılır.
- SSE her 15 sn'de heartbeat gönderir. Bağlantı koparsa üstte "yeniden bağlanıyor…" şeridi çıkar ve `Last-Event-ID` ile kaçan olaylar tekrar oynatılır. Olay sıra numaralarında boşluk olmamalı; bu test edilir.
- Replay yalnızca **yeniden bağlanmalar** içindir. Taze bir SSE bağlantısı (`Last-Event-ID` yok) o anki en büyük olay id'sinden başlar; istemci her `open`'da REST durumunu yeniden çeker. En büyük id'den büyük bir `Last-Event-ID` sıfırlama sayılır (veritabanı sıfırlanmış) ve akış o anki en büyük id'den başlar.
- Sonsuz animasyon sadece aktif ilerleme göstergesinde ve canlı ThinkingState başlığında vardır (yalnızca `transform` ve `opacity`).

## 13. Arayüz

> Uygulama sırasında `frontend-design:frontend-design` skill'i kullanılır. Kullanıcının verdiği ThinkingState komponenti ve Perplexity stil kılavuzu temel alınır.

### 13.1 Bilgi mimarisi

- **Nav rail** (56 px, ikonlar): Stüdyo · Kütüphane · Audit · Varlıklar · Ayarlar.
- **Stüdyo:**
  - **Üst bar:** ürün giriş alanı (Perplexity'deki ana arama kutusu gibi; teal halo), ses modu çipleri (Seslendirmeli / Seslendirmesiz), "Üret".
  - **Sol üretim paneli** (~%44):
    - başlık: ürün, durum rozeti, genel yüzde çubuğu ve ETA
    - player sekmeleri: **Taslak** (`@remotion/player`, spec'ten canlı) · **Final** (HTML5 video, Range) · **Karşılaştır** (sürümleri yan yana veya A/B oynatma) — M4c: "Taslak MP4" (HTML5 + Range, **varsayılan**) ve "Taslak" (`@remotion/player`, lazy parça, yalnızca sekme açıkken mount) uygulandı; Final ve Karşılaştır M5/M7 — M5a: "Final" (final varken varsayılan; "Müzikli/Müziksiz" varyant çipi) ve otomatik kontrol kartı (kapılar, D6/D7, başarısız kontroller); kütüphane kapak ve süreyi önce finalden alır
    - adım listesi (ThinkingState "Steps" diliyle)
    - agent kartları
  - **Sağ chat paneli:**
    - video bağlamı çipi
    - mod çipleri (Analiz et / Düzelt / Soru)
    - mesajlar ve canlı ThinkingState izleri
  - **Footer:** Claude bağlantı noktası ve plan rozeti · 5 sa ve 7 gün kullanım çubukları (sıfırlanma saatiyle) · GPU kuyruğu · boş disk.
- **Kütüphane:** Video kartları (kapak, puan, durum, süre, kullanım maliyeti). Video detayının sekmeleri: Sürümler · Storyboard · Araştırma ve kaynaklar · Review'lar (boyut çubukları, kapı rozetleri, kareli bulgular) · Audit · Yayın. M4c: satırda taslak kapağı (9:16) ve süre; satır videoyu Stüdyo'da açar.
  - **Spec notu (M5b):** Stüdyo'da "Final" sekmesinin altında **inceleme paneli** (`region "İnceleme"`, `review-panel`): toplam puan, 9 boyut çubuğu (%60 işareti), 6 kapı rozeti, turun ana kontakt sayfası, "Otomatik kontrol" kartı (qc bulguları ve G2 `claims_verified`) ve üç reviewer kartı. Bulgular **kare yerine zaman kodu + seek + turun kontakt sayfası** olarak gösterilir (tek kareler blob olarak saklanmaz; `frameSha` yok); zaman koduna tıklamak Final oynatıcıyı o ana sarar. Panel en yeni turu gösterir ("önceki N tur"); tur seçici, Karşılaştır sekmesi ve kütüphane detayındaki Review'lar sekmesi M7'de. Kütüphane satırı ve kart **puanı** en iyi sürümden gösterir ("yayına hazır · 87,5 puan"). Puan her yerde bir ondalık ve virgüllüdür.
- **Audit gezgini:** Filtreler: run, video, agent, olay türü, tarih. Her satırdan ham transcript'e, diff'e ve artefakta inilir. Zincir doğrulama durumu gösterilir.
- **Varlıklar:** Müzik, SFX ve 3D defteri; lisans alanları; ekleme ve onay.
- **Ayarlar:**
  - Claude bağlantısı: `auth status`, giriş akışı, gömülü CLI sürümü. **v1 giriş akışı:** ekranda terminal talimatı (`! claude auth login`) + 5 sn'de bir `auth status` yoklaması. TTY'siz `auth login` URL basıp stdin'den kod bekliyor (M0, spike c); ekranda URL + kod yapıştırma v1.1'e kaldı
  - rol başına model ve effort
  - eşikler
  - kanal kimliği
  - TikTok bağlantısı
  - veri ve yedek durumu
- **Okuma görünümleri** (audit detayı, spec ve araştırma metinleri) 900 px ile sınırlanır. Stüdyo bir çalışma alanı olduğu için tam genişliktir. Bu, Perplexity kılavuzundan bilinçli bir sapmadır.

### 13.2 ThinkingState'in canlı hale getirilmesi

- Görsel dil aynen korunur: başlık, shimmer, chevron, dikey çizgi, `fade-up` satırlar.
- Zamanlayıcıya bağlı `useSequence` kaldırılır. Yeni prop'lar: `status: 'live' | 'settled'`, akışla büyüyen `rows`, `startedAt`/`endedAt` ("N saniye düşündü"), `defaultExpanded`. Mevcut `variant`, `active`, `done`, `icon`, `onSettled` korunur.
- **Genişleme davranışı:** Canlıyken otomatik açık, bitince otomatik kapanır. Kullanıcı elle açıp kapattıysa (`manualExpanded`) o tercihi korunur.
- **Olay → varyant eşlemesi:**
  - **Steps:** orchestrator adımları ve `task_started` alt görevleri; TodoWrite girdileri.
  - **Reasoning:** `thinking` delta'ları (summarized). Metin boşsa `thinking_tokens` sayacı gösterilir.
  - **Search:** `WebSearch` sorgusu (`input_json_delta`) ve sonuç `{title, url}` satırları (alan adıyla); WebFetch URL'leri "okundu" olarak. M0: `tool_use_result.results` gruplar halindedir (`[{tool_use_id, content:[{title,url}]}]`); arama sayısı `searchCount`'tan alınır, `usage.server_tool_use.web_search_requests` 0 kalıyor.
  - **Coding:** Read (`file_path`, satır sayısı); Edit/Write (`structuredPatch` üzerinden +eklenen/−silinen; M0: Write ile yeni dosyada `structuredPatch` boş gelir, +N `content`'ten sayılır); Bash ve MCP çalıştırmaları (komut veya araç adı, durum, süre).
- Satırlar `parent_tool_use_id` ile ilgili alt ajanın altına yerleşir.
- **Kaynak ve uyarlama (M3):** Kullanıcının tasarım oturumunda verdiği özgün komponent `docs/m3/thinking-state.original.tsx`'te saklanır; canlı hali `apps/web/src/components/thinking/ThinkingState.tsx` (farklar M3b planında: zamanlayıcı ve örnek içerik kaldırıldı, satır gecikmeleri ve `minHeight` kaldırıldı, arama noktaları mürekkep tonunda). Başlık düğmesinin erişilebilir adı `aria-labelledby` ile durum bölgesinden gelir (`role=status` içerikten ad vermiyor). Ardışık aynı varyant satırları tek blok olur; aradaki metin ayrı metin bloğudur. İz 200 satırı geçince baştaki satırlar "Önceki N satırı göster" arkasına alınır (gerçek sanal kaydırma M7).
- **Yanıtı gelen chat turu (M3 gerçek koşu bulgusu):** `result.text` yalnızca turun **son** metin bloğudur; model araçtan önce de yazarsa o metin izde kalır, yalnızca son metin bloğu (yanıt mesajının kendisi) izden düşer.

### 13.3 Tema (Tailwind v4 `@theme`)

| Komponent token'ı | Değer |
|---|---|
| `ink` | #27251e |
| `ink-2` | #72706b (graphite) |
| `ink-3` | #92918b (ash) |
| `line` | #d1d1cd (warm mist) |
| `line-strong` | #b8b6af |
| `hover` | rgb(39 37 30 / .04) |
| `hover-2` | rgb(39 37 30 / .07) |
| `inset` | #f3f0eb |
| `accent` | #016a71 (deep teal) |
| zemin / kart | #faf8f5 / #fdfbfa |
| `rounded-control` | 6 px |
| kart / input / çip | 16 / 12 / 9999 px |

- **Renk kuralı:** Tek vurgu rengi teal'dir; aktif, seçili ve ilerleme durumlarında kullanılır. Komponentteki turuncu/yeşil arama noktaları **mürekkep tonlarıyla** değiştirilir. Yeşil (#3d7a5a) ve kırmızı (#a3412f) yalnızca `+/−` diff sayılarında ve başarı/hata durumlarında, kısık tonlarda kullanılır.
- **Tipografi:** Font ağırlıkları sadece 400 ve 500. Inter (latin-ext, yerel dosya). Türkçe büyük harfe çevirme `toLocaleUpperCase('tr')` ile yapılır.
- **Diğer:** Sekme başlığı "VideoGen"; fütüristik SVG favicon (16/32/180 px).

### 13.4 Etkileşim

- **Kısayollar:** Space oynat/durdur · J/K/L sarma · N yeni üretim · `/` chat'e odaklan · Esc kapat · `?` yardım paneli. M4c: Space, J (−5 sn), K (durdur), L (+5 sn), N uygulandı (görünen oynatıcıya; yazı alanında ve değiştirici tuşla devre dışı); `?` M7.
- Silme her zaman onay ister ve kaç öğe silineceğini gösterir.
- Arayüzdeki tüm metinler Türkçe.
- **Durum yönetimi:** TanStack Query + SSE olay deposu (normalize, `seq` korumalı). Komutlarda iyimser güncelleme.
- **Performans bütçesi:**
  - boştayken CPU ≈ 0 (6 sn'de ~0 ms)
  - 4× CPU yavaşlatmasında kaydırma ve etkileşimde kare süresi p95 ≤ 16,8 ms
  - ilk yükleme < 2 sn

## 14. Hata yönetimi ve kurtarma

| Durum | Davranış |
|---|---|
| Worker çöktü veya yeniden başladı | Açılışta PID dosyası ve süreç grubu üzerinden yetim süreçler öldürülür. Kirası (`jobs` tablosunda; 30 sn heartbeat, 2 dk süre) dolan işler yeniden kuyruğa girer ve adımları `queued` durumuna döner. Adımlar `input_hash` ile idempotenttir; geçerli çıktısı olan adım yeniden çalışmaz |
| Agent hatası | Aynı oturum `resume` ile bir kez yeniden denenir. Şema doğrulama hatasında oturum içinde en fazla 2 kez yeniden istenir. Model aşırı yüklüyse yedek modele geçilir |
| Kullanım limiti | `waiting_limit` durumuna geçilir; `resetsAt` anında kendiliğinden devam edilir; kartta geri sayım gösterilir |
| GPU bellek yetmedi | Bir kez daha düşük ayarlarla denenir (EEVEE 64→32 örnek, Remotion concurrency 2→1). Yine olmazsa gerekçeli hata verilir |
| Disk eşik altında | `waiting_disk` durumuna geçilir; arayüzde uyarı ve temizlenebilecek öğelerin önerisi gösterilir |
| Kullanıcı iptali | §6.4'teki iptal sırası uygulanır; audit'e yazılır |
| Yayın zaman aşımı | "Bekliyor" olarak işaretlenir ve yoklama sürdürülür; başarı sayılmaz |
| SSE koptu | Otomatik yeniden bağlanılır ve kaçan olaylar `Last-Event-ID` ile tekrar oynatılır |

**M4a uygulama notları:** Tek worker değişmezi: açılışta başka sahibin bütün kiraları hemen yeniden kuyruğa girer (önceki worker artık yok); çalışma sırasında periyodik süpürme yoktur (kendi kiralarını heartbeat uzatır, süpürme çalışan bir işi ikinci kez başlatabilirdi). Agent adımı limit reddinde oturumu kendisi sürdürür (`autoResume: false`): eski oturum `failed`/`rate_limited` kapanır, aynı Claude oturumu aynı istemle `resume` edilir ve muhafız açılana kadar bekler; limit beklemesi düzeltme ve çökme sayaçlarına girmez, üst üste 5 retten sonra adım `failed`. Şema hatasında ≤ 2 düzeltme, çökmede 1 `resume`; ikisi de tükenirse adım yeniden denenmez (orchestrator'ın yeniden denemesi aynı işi tekrarlardı). İptal ile adım başlatma/kuyruğa alma arasındaki yarış koşullu SQL geçişleriyle kapatıldı (son review I2).

## 15. Güvenlik

- **Ağ:** API sadece 127.0.0.1'e bağlanır. Yazma uçlarında Host/Origin kontrolü ile CSRF ve DNS-rebinding koruması vardır (dag-wireboard `server/app.py:25-90` modeli). CORS kapalıdır.
- **Gizli bilgiler:** `~/videogen-data/secrets/` (0600) altında durur. Loglara, audit'e, agent env'ine ve UI'ya asla çıkmaz; UI'da sadece var/yok ve son kullanma tarihi gösterilir.
- **Agent izinleri:** `bypassPermissions` asla kullanılmaz. `PreToolUse` hook'u yazma yollarını run klasörüyle sınırlar (M0'da `dontAsk` altında Write `file_path` kaçışıyla doğrulandı). Hook her yazma vektörünü kapsamalıdır (M3): Bash komutları ve NotebookEdit `notebook_path` de denetlenir (M0 spike'ı yalnızca Write `file_path`'i doğruladı). Kısıtlı Bash ve ağır komut yasağı uygulanır (§6.3).
- Ücretli API muhafızı ve bağımlılık kilidi (§6.6, §5.3).

## 16. Test stratejisi

### 16.1 Değiştirilebilir sürücüler

- **`FakeClaudeDriver`:** `tests/fixtures/claude-streams/` altındaki **gerçek** stream-json kayıtlarını hızlandırılmış zamanlamayla oynatır. Kayıtlar M0'daki haiku denemelerinden alınır (tasarım sırasında yapılan canlı denemelerin çıktıları başlangıç noktasıdır). Rol bazlı senaryolar: normal akış, alt ajanlı akış, uzun sessizlik, hata, limit.
  - M0 kayıtları (`{t, m}` satırları): `basic`, `subagent` (arka plana alınmış; iki `result`, ikisinde de `structured_output`), `subagent-background` (erken `structured_output`'suz `result`), `subagent-nobg` (bayrakla tek `result`), `websearch`, `coding`, `guard`, `interrupt`; ayrıca `usage-response.json`. `interrupt` kaydı son `result`'ta biter; iterator'ın ardından fırlattığı hatayı sahte sürücü açıkça taklit eder.
  - Kayıtlar `spikes/m0/redact.mjs` ile **yalnızca kayıttan hemen sonra bir kez** temizlenir. Betik akış dosyalarında idempotent değildir (yer tutucu UUID'leri yeniden numaralar); commit edilmiş kayıtlarda yeniden çalıştırılmaz.
- **`FakeRenderDriver`:** ffmpeg `testsrc2` ile 2 sn'lik 270×480 videolar üretir ve gerçekçi kare ilerleme olayları yayar.
- **TikTok mock sunucusu:** Fastify, rastgele port. `creator_info`, `inbox/video/init`, PUT ve `status/fetch` uçlarını taklit eder.

### 16.2 Playwright smoke senaryoları (`npm run test:smoke`, hedef < 3 dk)

| # | Senaryo | Doğrular |
|---|---|---|
| S1 | Açılış | < 2 sn yüklenme; Claude bağlantı kartı; kullanım footer'ı değerleri; konsolda hata yok |
| S2 | Üretim | Ürün adı → run oluşur → adımlar ilerler → agent kartları (rol, model, durum) ve iç içe alt ajan kartı görünür → **genel yüzde monoton artar** (örneklenerek) → "Yayına hazır" → kütüphanede video oynar (`currentTime` ilerler) |
| S3 | Canlılık | Sahte sürücü 10 sn sessiz kalır, süreç canlı → "son olay N sn önce · süreç canlı". CPU sıfıra indirilir → "takılmış olabilir" uyarısı → "Durdur" çalışır ve adım `cancelled` olur |
| S4 | SSE kopması | Bağlantı kesilir (API SIGKILL) → "yeniden bağlanıyor" şeridi → yeniden bağlanılır → olay sırasında boşluk yok ve son kimlik sunucunun en büyüğü. Worker öldürülür → footer "Worker yanıt vermiyor" → yeniden başlayınca "Worker canlı" (M3) |
| S5 | Chat | Mesaj gönderilir → ThinkingState Search ve Coding satırları akar → izi kapanır → yeni sürüm (v2) oluşur → Karşılaştır sekmesi iki sürümü gösterir |
| S6 | Yayın | Bitirme penceresi → mock TikTok'a taslak gönderilir → `SEND_TO_USER_INBOX` → audit satırı oluşur. 24 saatteki 6. taslak engellenir |
| S7 | Audit | Run'a göre filtre; zincir doğrulaması "geçerli"; satırdan ham olaya inilir |
| S8 | Performans | 4× CPU yavaşlatmasında adım listesi ve iz kaydırma p95 ≤ 16,8 ms; boştayken CPU bütçesi |

**M4 biçimi (M4c):** S2 final yerine taslakla koşar (`tests/smoke/s2c-draft.spec.ts`): ürün → research → storyboard → build → taslak → inceleme; taslak MP4 Range ile akar; kütüphanede kapak ve süre görünür, satır Stüdyo'da açılır ve Space ile oynar; "kusurlu" ürün bir kez build'e döner ("Taslak turu 1/2"), ilerleme geri gitmez. Tam smoke 17 geçti / 9 atlandı, 1,8 dk.

**M5a biçimi:** S2a (arayüzden "Üret") ve S2d (`tests/smoke/s2d-final.spec.ts`) finale ve otomatik kapılara kadar koşar: final_render (fake kareler) → compose (gerçek ffmpeg teslim kodlaması `ultrafast`, ses, iki varyant) → qc; video `insan gerekli`, not "Final video hazır ve otomatik kontrolden geçti."; QC kartı kapıları ve puanları gösterir; kütüphaneden final iki varyantta Range ile oynar; terminal run'ın kareleri silinir. Eski senaryolar plan sonunu geliştirici `until: 'draft_review'` ile seçer. Tam smoke 19 geçti / 11 atlandı, 3,8 dk (hedef 3 dk aşıldı: iki senaryo ve bir ekran testi finale kadar koşar).

**M5b biçimi:** S2a ve S2d (`tests/smoke/s2d-final.spec.ts`) "Yayına hazır"a kadar koşar (Fake sürücü, içe aktarılan CC0 müzik yatağı): üç reviewer + K13 → `finalize` → video `ready` ("Yayına hazır · 87,5 puan"), genel yüzde 100; inceleme paneli (puan, 9 boyut çubuğu, 6 kapı rozeti, "Otomatik kontrol" kartı, üç reviewer kartı) ve kütüphane puanı görünür. İkinci senaryo `rötuş`: compose kapsamlı bir düzeltme turu ("Düzeltme turu 1/3" başlıkta, `compose`/`qc`/`review` adımları `fixRound` 1) sonra panel yeniden ≥ 80. Smoke 19 geçti / 13 atlandı, 4,3 dk (iki M5b ekran testi `VG_SCREENSHOTS=1` ister).

**İzolasyon:**
- Aynı container'da ayrı bir `videogen_smoke` veritabanı kullanılır; her koşuda oluşturulup silinir (M3: Playwright `webServer.gracefulShutdown` SIGTERM; verilmezse süreç grubu SIGKILL'lenir ve temizlik hiç çalışmaz).
- Veri klasörü sabit `/tmp/videogen-smoke` (açılışta ve kapanışta silinir; `pids.json` ve `hold-<ad>` dosyaları burada); test API'si (SPA dahil) 5190, TikTok mock sunucusu rastgele port. Smoke yığını API ve worker'ı kendisi denetler (beklenmedik çıkışta 300 ms sonra yeniden başlatır); Claude yerine Fake sürücü kayıtlı akışları oynatır.
- `~/videogen-data`'ya asla dokunulmaz.
- Testler `channel:'chrome'` ile çalışır. Hata durumunda trace ve ekran görüntüsü alınır.

### 16.3 Gerçek smoke profili (`npm run test:smoke:real`, elle, sürüm öncesi)

1. İzole SDK oturumunda haiku ile 1 tur. Doğrulanır: `apiKeySource: none` ve sıfır hook olayı.
2. `get_usage` çağrısı.
3. 2 kare ve 270×480 Blender önizleme. Doğrulanır: `renderer_get` çıktısında NVIDIA yazıyor.
4. Gerçek bir Remotion still.
5. Tek cümlelik TTS ve Whisper ile CER ölçümü.
6. Kalem pilotu üzerinde qc_probe. 7 bilinen hata yakalanmalı.

### 16.4 Birim testleri (vitest)

- ilerleme hesabı (monotonluk dahil)
- stream→ThinkingState eşleyici (kayıtlı fixture'larla)
- zod şemaları
- güvenli alan denetleyici
- lisans kapısı
- audit hash zinciri
- kuyruk kiralama ve yeniden kuyruğa alma
- ücretli API muhafızı (env'de `ANTHROPIC_API_KEY` → açılış reddedilir)
- Blender↔Three anchor eşdeğerliği (fixture'larla)

### 16.5 Bitti tanımı (her görev için)

- İlgili smoke ve birim testleri yeşil.
- Kullanıcıya görünen bir değişiklikse Playwright ekran görüntüsü alınıp incelenmiş.
- Değişiklik audit'te izlenebiliyor.
- Kullanıcıya Türkçe rapor: Maddeler / Doğrulama / Bilmen gerekenler.

## 17. Kilometre taşları

| Taş | İçerik | Çıkış ölçütü |
|---|---|---|
| **M0 Doğrulama** | Disk temizliği (onaylı maddeler, her biri öncesi son durum gösterilerek). Spike'lar: (a) SDK'nın gömülü binary'si kullanıcının OAuth girişini kullanıyor mu ve izolasyon çalışıyor mu; (b) `get_usage`; (c) TTY olmadan `auth login` akışı; (d) Blender GLB → Three.js anchor eşdeğerliği. Gerçek fixture'ların kaydı | Her spike için kanıtlı rapor; çalışmayan varsayımlar için spec güncellemesi |
| **M1 Ses** | `audio_service` venv'i; Chatterbox ve Freya dinleme testi (hazır ses ve klon); VRAM ölçümü; Whisper hizalama | Kullanıcının TTS ve ses kararı (K17) |
| **M2 İskelet** | Monorepo, Postgres container'ı, migration'lar, audit zinciri, API + Worker, SSE, tema ve kabuk arayüz, Claude bağlantı ekranı, kullanım footer'ı | S1 + ücretli API muhafızı testi |
| **M3 Canlı agent katmanı** | SDK sürücüsü, roller, MCP sunucusu, agent kartları, canlılık, chat + canlı ThinkingState | S3, S4, S5 (kısmi) |
| **M4 Dikey dilim** | research → storyboard → build (`vg_blender` çekirdeği) → taslak → kütüphanede oynatma; video başına kullanım ölçümü; kanal kimliği seçenekleri (K19) | S2 (taslak final yerine); ilk gerçek ürün |
| **M5 Final ve kalite** | Blender final, ses, compose ve varyantlar, qc_probe, reviewer'lar, düzeltme döngüsü, kalem pilotuyla kalibrasyon | Rubrik pilotun 7 hatasını yakalıyor; gerçek bir ürün "yayına hazır" |
| **M6 Yayın** | TikTok Node modülü, bitirme kartı, taslak limiti, Shorts dışa aktarımı | S6; gerçek taslak gönderimi |
| **M7 Sertleştirme** | Audit gezgini, sürüm karşılaştırma, varlık defteri arayüzü, yedekler, performans bütçeleri, gerçek smoke profili | S7, S8, `test:smoke:real` |

## 18. Doğrulanmamış varsayımlar ve riskler

| Varsayım / risk | Doğrulama | Yedek plan |
|---|---|---|
| SDK'nın gömülü binary'si `~/.claude` OAuth bilgilerini kullanıyor; kullanıcının terminaldeki CLI'sıyla aynı anda token yenilemesi sorun çıkarmıyor | M0: doğrulandı (docs/m0/report.md): `apiKeySource: none`, gömülü CLI 2.1.290. Eşzamanlı token yenilemesi ayrıca zorlanmadı; M0 boyunca ve M3'te (7 gerçek haiku oturumu, kullanıcının terminal Claude Code oturumu açıkken) sorun görülmedi | `pathToClaudeCodeExecutable` ile kurulu CLI kullanılır ve sürüm her açılışta kontrol edilir |
| `get_usage` sıfır token harcıyor. SDK'da bu çağrı `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` adıyla geçiyor ve "her sürümde değişebilir" uyarısı taşıyor | M0: doğrulandı (docs/m0/report.md): 0 mesaj, `total_cost_usd` 0, ~0,6–0,9 sn. Birim: yüzde 0..100 + ISO `resets_at` (`rate_limit_event`: 0..1 + epoch sn). Çağrı tek bir adaptörün arkasında tutulur, SDK yükseltmesinde gerçek smoke ile kontrol edilir | Son `rate_limit_event`, "x dk önce" damgasıyla |
| `auth login` TTY olmadan çalışıyor | M0: kısmen doğrulandı (docs/m0/report.md): URL basıyor, stdin'den kod bekliyor, 127.0.0.1 callback dinliyor; kod yapıştırma test edilmedi → v1'de yedek plan, URL + kod v1.1 | Ekranda talimat: terminalde `! claude auth login`; ekran durumu yoklar |
| Chatterbox 5,67 GB VRAM'e sığıyor | M1: doğrulandı — tepe 3611 MB (nvidia-smi) / 3251 MB (torch) (docs/m1/decision.md) | FreyaTTS (M1 tepesi 1811 MB; Türkçe adil CER %17,9, §7.6 kapısını geçmiyor) |
| Video başına kullanım (token, 5 saatlik pencere payı) bilinmiyor | M4'te ölçülür. **M4a:** ölçüm altyapısı hazır (oturum token/maliyet toplamı + run başı/sonu 5 sa izi; aynı pencere `get_usage` ms ve `rate_limit_event` saniye ile farklı yazıldığından 60 sn tolerans). İlk ölçüm (haiku/low, yalnızca research + storyboard, `docs/m4/real-check.md`): 2 oturum, 671 697 token, 5 sa payı ≈ %2, 5 dk 57 sn. Gerçek rol modelleriyle tam ürün ölçümü M4c'ye kaldı; M4c bulut ortamında uygulandı (gerçek Claude oturumu, Blender ve GPU yok), ölçüm GPU'lu makinede `docs/m4/report.md` §4 tarifiyle yapılacak | Rol modelleri ve reviewer sayısı ayarlanır |
| Video başına kullanım, M5b koşusu (final turları ve fixer dahil) | **Bekliyor:** gerçek "tükenmez kalem" koşusu (izinli müzikle, K12 rolleri) GPU'lu makinede; kayıt tablosu `docs/m5/real-check.md` M5b-3, sonuç `docs/m4/real-check.md` M4c §4 ve `docs/m5/m5b-summary.md` §5'e yazılır. Kodda koruma: kullanım muhafızı kapalıyken yeni düzeltme turu başlamaz (`usage` durdurması) | Final turu sayısını ya da fixer modelini düşür |
| Claude yapılandırılmış çıktısı (`outputFormat` JSON Schema) zod sözleşmesine uyar | M4a gerçek koşu: haiku/low `ProductResearch` ve `Storyboard`'a ilk denemede uydu (düzeltme 0); Fake testleri düzeltme (≤ 2), çökme (1 `resume`) ve limit yolunu kapsar | Aynı oturumda hata listesiyle ≤ 2 düzeltme, sonra adım `failed` |
| Güvenli alan pikselleri resmi değil (üçüncü taraf değerler çelişiyor) | Kullanıcının telefonundan ekran görüntüleriyle kalibrasyon (M5) | Pilot kılavuzundaki değerler (150–1510 dikey, sağ 130 px) |
| −14 LUFS resmi bir TikTok değeri değil | Kanal konvansiyonu; ilk 10 yayından sonra gözden geçirilir | — |
| Karmaşık ürünlerde prosedürel model kalitesi | Zorluk kapısı (§7.1) | CC0 varlık kaynakları; olmuyorsa "insan gerekli" |
| SDK veya CLI protokol değişikliği | Tam sürüm sabitleme; yükseltmeden önce gerçek smoke | — |
| İzolasyon: `settingSources: []` + `strictMcpConfig` ile kullanıcı hook/plugin/MCP/skill'leri yüklenmez; plugin skill'leri symlink'le yüklenir | M0: doğrulandı (docs/m0/report.md): hook olayı 0, MCP 0; skill'ler `videogen:*` adıyla | — |
| `dontAsk` altında `PreToolUse` hook'u run klasörü dışına yazmayı engelliyor | M0: doğrulandı (docs/m0/report.md): run dışına Write reddedildi (matcher `Write\|Edit`, `file_path`), `permission_denials`'a yazıldı. M3: Bash (yalnızca run klasöründe izinli okuma komutları; ağır komut, zincirleme, boru, yönlendirme, komut ikamesi ve glob yasağı), NotebookEdit `notebook_path`, `..` ve symlink kaçışı birim testli; gerçek koşuda ağır Bash komutu reddedildi ve gerekçe doğru MCP aracını gösterdi (`docs/m3/real-check.md`) | Bash izin listesi daraltılır; NotebookEdit `allowedTools` dışında kalır |
| Blender GLB → Three.js anchor eşdeğerliği ≤ 8 px | M0: doğrulandı (docs/m0/report.md): 0,00 px; mixer `LoopOnce` + clamp şart; birimler 1:1. M4b: kare başına anahtar + son kare tutma + `camera_track` ile kalem örneğinde 0,01 px; bitmiş `LoopOnce` eylemi `setTime`'da 0'a dönüyordu (16.611 px) → geçmişten bağımsız `seek`. Her build'de ölçülür; gerçek agent ürünlerindeki sonuç M4c'de. M4c: Blender'ın kalem GLB'si Remotion'da (`Draft3D`, `SceneClock.seek` + `applyFrameFov` + `projectAnchor`) 1351 karelik taslak olarak render edildi (`npm run test:render`); gerçek agent ürünü GPU'lu makinede bekliyor | — |
| Agent'ın yazdığı `product.py` güvenle çalıştırılabilir | M4b: bubblewrap 0.11.1 bu makinede çalışıyor; gerçek araç testinde ağ engelli, ev klasörü ve repo görünmez, kök salt okunur; zaman aşımı ve RSS sınırı süreç grubunu öldürür (`npm run test:render`) | bwrap çalışmazsa build reddedilir (korumasız çalışma yok) |
| SDK alt ajanı kendiliğinden arka plana alabiliyor → tek sorguda birden fazla `result` ve ikinci `system/init` | M0: bayraksız 3 koşunun 2'sinde gözlendi; `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` (temizlikten sonra eklenir) ile 1/1 koşuda tek `result` | Sürücü son `result`'u esas alır, `background_tasks_changed` boşalana ve iterator bitene kadar bekler M3: tur bitişi = arka plan görev kümesi boş **ve** `result` sayısı ≥ 1 + arka plana alınmış görevlerin `task_notification` sayısı (`subagent.ndjson`'da küme ilk `result`'tan önce boşalıyor) |
| In-process MCP (`createSdkMcpServer`) gömülü CLI'da çalışıyor, ayrı süreç gerekmiyor | M3: doğrulandı — plan öncesi sondaj (`spikes/m3/probe.mjs`) ve M3a T6 gerçek koşusu: `videogen` sunucusu `connected`, araçlar `mcp__videogen__*`, `report_progress` kaydedildi | — |
| Chat süreci boşta kapanınca oturum `resume` ile sürer; streaming-input ikinci tur aynı süreçte çalışır | M3: doğrulandı — sondaj (`resume`, `sessionId`, ikinci tur) + Fake/gerçek testler; M3b T7'de gerçek chat turu (haiku, 6 sn, `get_context` çağrısı, transcript arşivi) | — |
| `result.text` turun tüm metnini taşır | M3: **çürütüldü** — yalnızca son metin bloğu; araçtan önceki metin ayrı `text` satırıdır (M3b T7 gerçek koşu). Arayüz yalnızca son metin bloğunu izden düşürür | — |

## 19. Gelecek (v1 sonrası)

- Storyboard onay kapısı ve chat'ten storyboard düzenleme. Tek bir kontrol noktası olarak eklenebilir.
- İngilizce varyant (metinler zaten dil anahtarlı).
- YouTube Shorts'a API ile yükleme.
- İzlenme verisinden rubrik ağırlıklarını otomatik yeniden ayarlama.
- ComfyUI ile doku ve dekor üretimi. Sadece kahraman olmayan öğelerde ve AIGC etiketiyle.
