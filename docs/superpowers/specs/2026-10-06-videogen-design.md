# VideoGen — Tasarım Dokümanı

| | |
|---|---|
| Tarih | 2026-10-06 |
| Durum | Tasarım onaylandı (brainstorming + grilling), uygulama planı bekleniyor |
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
| Disk | 7,7 GB boş; onaylı temizlik sonrası ~34 GB | 45 sn video ≈ 1,6 GB geçici PNG kare dizisi; kareler render sonrası silinir |
| Claude | Claude Code, **Max** abonelik (`claude auth status`), API key yok | 5 saatlik ve haftalık kullanım pencereleri; boş bir oturumun taban maliyeti ~21K token |
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
| K17 | Anlatıcı sesi (hazır ses ya da klon) TTS dinleme testinde seçilir; klon seçilirse AI etiketi zorunlu | Kullanıcı kararı (Q7). TikTok AIGC kuralı |
| K18 | Ekran yazıları Türkçe; metinler dil anahtarlı tutulur (İngilizce varyanta hazır) | Kullanıcı kararı (Q8) |
| K19 | Sabit kanal görsel kimliği; ilk dikey dilimde 2–3 seçenek sunulur | Kullanıcı kararı (Q9) |
| K20 | Agent SDK tam sürüme sabitlenir ve **kendi gömülü CLI binary'siyle** çalışır | Kurulu CLI `autoUpdates:false` iken 3 haftada 283→286→289→290 sürümlerine geçti (ölçüldü) |
| K21 | Pipeline agent'ları izoledir: kullanıcı hook/plugin/MCP'leri yüklenmez | Canlı deneme: izolasyon olmadan superpowers hook'u pipeline agent'larına enjekte oluyor |
| K22 | GPU işlerini sadece orchestrator yapar; agent'lar MCP araçlarıyla ister | 6 GB VRAM'de iki GPU işi aynı anda çalışamaz; kuyruk, progress ve audit tek yerde kalır |
| K23 | Geometrinin tek kaynağı bpy'dir; Blender dışa aktarılan GLB'yi Three.js taslağına verir | Tutarlılık düzeltmesi (§7.3) |
| K24 | Remotion görüntüyü bir kez ve sessiz render eder; ses ffmpeg'de mastering yapılıp iki varyanta mux'lanır | Tutarlılık ve performans düzeltmesi (§7.6) |
| K25 | Testler Playwright smoke (sistem Chrome) + kayıtlı gerçek stream'leri oynatan sahte Claude sürücüsü | Kullanıcı talebi; dag-wireboard'da kanıtlanmış desen |

## 5. Mimari

### 5.1 Süreçler

```
                ┌──────────────────────── tarayıcı (127.0.0.1:5180) ─────────────────────────┐
                │ React 19 SPA: Stüdyo · Kütüphane · Audit · Varlıklar · Ayarlar             │
                └──────────────┬─────────────────────────────────────▲───────────────────────┘
                               │ HTTP (komutlar → 202)               │ SSE (olaylar, Last-Event-ID)
                ┌──────────────▼─────────────────────────────────────┴───────────────────────┐
                │ apps/api  (Fastify 5, 127.0.0.1:5181)                                       │
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
- **Olay kanalları:**
  - `vg_events`: kalıcı olaylar. Önce `INSERT` edilir, sonra `NOTIFY(id)` atılır. SSE tekrar oynatması bunun üzerinden yapılır.
  - `vg_live`: geçici olaylar. Token token metin akışı ve canlılık örnekleri; sadece `NOTIFY` (payload < 8 KB), tabloya yazılmaz.
  - `vg_commands`: API'den Worker'a giden komutlar.
- **Başlatma:** `bin/videogen` sırayla şunları yapar: Postgres container'ını ayağa kaldırır, migration'ları uygular, API ve Worker'ı çocuk süreç olarak başlatır, çöken süreci artan bekleme süresiyle (backoff) yeniden başlatır, port hazır olunca tarayıcıyı açar.
- **Geliştirme modu:** Web için Vite HMR, API için `tsx watch`. **Worker watch modunda çalışmaz**; elle yeniden başlatılır, böylece geliştirme sırasında render ölmez.

### 5.2 Depo düzeni

```
/home/alper/gpu-server/VideoGen/            (git deposu)
  apps/web/            React 19 + Vite 8 + Tailwind v4 + TanStack Query
  apps/api/            Fastify 5
  apps/worker/         orchestrator, scheduler, drivers
  packages/shared/     zod şemaları (artefakt sözleşmeleri, olay tipleri, rubrik), ortak tipler
  packages/db/         drizzle şeması + migration'lar + audit trigger'ları
  packages/claude/     ClaudeDriver (SDK + Fake), rol tanımları, MCP araçları, stream→UI eşleyici
  packages/remotion/   tek paylaşılan Remotion çalışma alanı (Draft3D, Compose, etiket/altyazı bileşenleri)
  python/vg_blender/   bpy kütüphanesi (primitive'ler, malzemeler, ışık, kamera, anchors/events/GLB export)
  python/audio_service/ TTS (Chatterbox/Freya) + Whisper hizalama, tek venv
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
| `@anthropic-ai/claude-agent-sdk` | M0'daki güncel 0.3.x, **tam sürüm** (bugün 0.3.290) | Gömülü linux-x64 binary'si (246 MB) kullanılır |
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
- Kimlik doğrulama: kullanıcının Claude.ai OAuth girişi (`apiKeySource: none`). **`--bare` asla kullanılmaz**, çünkü OAuth'u kapatır.

**Her oturumun ortak yapılandırması:**

| Ayar | Değer | Neden |
|---|---|---|
| `settingSources` | `[]` | Kullanıcının global hook'ları (superpowers, last30days), plugin'leri ve MCP'leri yüklenmez (canlı denemede kanıtlandı) |
| `strictMcpConfig` | `true`; sadece `videogen` (in-process) + gerekiyorsa `claude-video-vision` | |
| `plugins` | `[{type:'local', path:'claude-plugin/'}]` | Skill'ler: remotion-\*, ffmpeg, video-use, manim-video (symlink); rol agent'ları; uyarlanmış kılavuzlar |
| `env` | Temizlenmiş: `CLAUDECODE` ve `CLAUDE_CODE_*` çıkarılır; `ENABLE_TOOL_SEARCH=false`; pipeline rollerinde `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` | Ertelenmiş araçlar ekstra bir tur maliyeti getirir; arka plan alt görevleri birden fazla `result` olayı üretir |
| `permissionMode` | `dontAsk` + `permissionPrompts:'none'` + `canUseTool` yol koruması | Gözetimsiz çalışma. **`bypassPermissions` asla** (ev klasöründe gerçek projeler ve kimlik bilgileri var) |
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
| **audio_director** | Sonnet / medium | Read; MCP: `tts_synthesize`, `align_captions`, `search_assets`, `write_spec(audio)` | `AudioPlan` | 25 |
| **reviewer_visual** (görsel + anti-slop) | Opus / high | Read; MCP: `extract_frames`, `run_qc`; plugin: video-vision | `Review` | 25 |
| **reviewer_facts** (doğruluk + storyboard uygunluğu) | Sonnet / high | Read, WebFetch, WebSearch; MCP: `read_spec`, `extract_frames` | `Review` | 25 |
| **reviewer_retention** (kanca, tempo, TikTok) | Sonnet / high | Read; MCP: `extract_frames`, `run_qc`, `read_spec` | `Review` | 20 |
| **fixer** | Görsel/anlatı hatası → Opus/high; teknik hata → Sonnet/high | Read, Write, Edit (run), izin listeli Bash; MCP: `write_spec`, `build_scene`, `render_preview_stills`, `report_progress` | `FixReport` | 40 |
| **chat** | Opus / high | Kütüphane salt okunur, düzenleme oturumunda run klasörüne yazma; tüm MCP araçları + `request_rerender` | Serbest metin + isteğe bağlı yeni sürüm | Etkileşimli |
| **summarizer** | Haiku / low | Yok | Kısa Türkçe özetler (audit ve kart başlıkları) | 3 |

- Model ve effort ayarları Ayarlar ekranından rol bazında değiştirilebilir. Değişiklik audit'e yazılır.
- Reviewer'lar **builder'ın akıl yürütmesini görmez**. Sadece artefaktları (kareler, manifestler, spec) görürler.

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

**Kural:** Agent'lar `blender`, `remotion render`, `npx remotion` veya `ffmpeg` gibi ağır komutları Bash'ten çalıştıramaz. `canUseTool` bu komutları reddeder ve mesajında doğru MCP aracını söyler. Bash izin listesi: `python3 -m py_compile`, `ls`, `cat`, `head`, `jq` ve run klasörüyle sınırlı okuma komutları.

### 6.4 Eşzamanlılık, kullanım ve iptal

- **Claude slotları:** pipeline için 3, chat için **ayrılmış 1**. Chat asla sıra beklemez.
- Boşta kalan chat süreçleri 10 dk sonra kapatılır. Bir sonraki mesajda oturum `resume` ile kaldığı yerden açılır.
- **Ön kontrol:** Spawn'dan önce boş RAM (`MemAvailable`) ≥ 1 GB olmalı. GPU işinden önce şu koşullar aranır:
  - boş RAM ≥ 2,5 GB
  - swap < %90
  - boş disk ≥ 3 GB + kare tahmini
  - `nvidia-smi` boş VRAM ≥ 4 GB
  - `ollama ps` boş
- **Kullanım muhafızı:** Kullanım bilgisi `rate_limit_event`'ten (her oturumda gelir) ve boştayken 5 dakikada bir `get_usage` kontrol çağrısından (sıfır token) okunur. Davranış:
  - 5 saatlik pencere ≥ %80 veya haftalık ≥ %90 olursa yeni run ve reviewer fan-out'u başlamaz.
  - Limit aşılırsa (`status: rejected`), çalışan adım "limit bekleniyor" durumuna geçer ve `resetsAt` anında kendiliğinden devam eder.
  - Her geçiş audit'e yazılır.
- **İptal sırası:** `interrupt()` → sonucun gelmesi beklenir (`aborted_*`) → giriş üreteci kapatılır → 10 sn sonra süreç grubuna SIGTERM, ardından SIGKILL. Adım `cancelled` olur.

### 6.5 Transcript ve kullanım muhasebesi

- Her oturum için şunlar kaydedilir: `result.usage`, `modelUsage`, `num_turns`, `terminal_reason`, `permission_denials`, süre ve alt ajan istatistikleri. Bunlar video başına toplanır; kullanım maliyeti kütüphanede görünür.
- İş bitince `~/.claude/projects/<slug>/<sid>.jsonl` dosyası ve `subagents/` klasörü sıkıştırılıp arşive kopyalanır. Sebep: `~/.claude/projects` 30 günde temizleniyor.

### 6.6 Güvenlik (agent'lar)

- **Prompt injection:** Güvenilmeyen web içeriğini sadece `researcher` ve `reviewer_facts` okur. İkisinin de Bash yetkisi yoktur ve sadece kendi klasörlerine yazabilirler. Sonraki agent'lar ham web metnini değil, şemayla doğrulanmış JSON'u alır.
- **Referans kuralı:** Web kaynakları sadece **gerçek bilgi** için kullanılır: parça adları, sayılar, malzemeler, oranlar, montaj sırası. Üçüncü taraf görseller, video kareleri ve diyagramlar asla indirilmez, gömülmez veya çizilerek kopyalanmaz. Her iddia URL ve erişim tarihiyle birlikte `claims.json`'a girer.
- **Ücretli API muhafızı:** API ve Worker açılışta env'i tarar. `ANTHROPIC_API_KEY` veya bilinen ücretli anahtar desenleri (ElevenLabs, OpenAI vb.) bulunursa **çalışmayı reddeder** ve bunu audit'e yazar. Agent env'ine anahtar geçirilmez.

## 7. Pipeline

### 7.1 Adımlar

| # | Adım | Ağırlık | Yapan | Girdi → Çıktı | Tahmini süre (45 sn video) | İlerleme kaynağı |
|---|---|---|---|---|---|---|
| 1 | research | 8 | researcher | ürün adı → `ProductResearch` (+ zorluk seviyesi) | 4–6 dk | agent |
| 2 | storyboard | 7 | storyboarder | research → `Storyboard` | 2–4 dk | agent |
| 3 | build | 18 | builder | storyboard → `SceneSpec`, `product.py`, `.blend`, `scene.glb`, önizleme kareleri | 15–35 dk | agent + build olayları |
| 4 | draft_render | 4 | orchestrator | GLB + SceneSpec → taslak MP4 | ~1 dk | **render (gerçek kare)** |
| 5 | draft_review | 5 | reviewer_visual (tek) | taslak kareleri → bulgular; gerekirse 3'e dönüş (**en fazla 2 tur**, final 3 turdan ayrı) | 3 dk | agent |
| 6 | audio | 8 | audio_director + ses servisi | storyboard + zamanlama → VO, altyazılar, SFX cue listesi, müzik seçimi, stem'ler | 3–6 dk | agent + TTS satır sayısı |
| 7 | final_render | 26 | orchestrator | `.blend` → RGBA PNG kareleri (1350 kare × ~1 sn) | ~23 dk | **render (`Fra:`)** |
| 8 | compose | 7 | orchestrator | kareler + Remotion katmanı → sessiz video; ffmpeg mastering → müzikli ve müziksiz mux | ~4 dk | **render (`onProgress`)** |
| 9 | qc | 2 | orchestrator | iki varyant → otomatik kapı raporu | < 5 sn | deterministik |
| 10 | review | 12 | 3 reviewer paralel | müzikli varyant + manifestler → puan ve bulgular | 4–6 dk | agent (3 kart) |
| 11 | finalize | 3 | orchestrator | en iyi sürüm, `cover.png`, bitirme kartı, karelerin silinmesi | < 1 dk | deterministik |

- **Toplam:** ~60–90 dk, düzeltme turları hariç. Gerçek süreler ölçülür ve sonraki tahminlerde kullanılır; ETA geçmiş ölçümlerden gelir.
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
| Metin, etiket, altyazı, zamanlama (Remotion katmanı) | compose → qc → review (~6 dk) |
| Ses (VO, SFX, müzik, seviye) | audio → compose → qc → review |
| Geometri, malzeme, ışık, kamera | build → draft_render → final_render → compose → qc → review (~35 dk) |
| Storyboard (yeniden işleme) | storyboard'dan itibaren tamamı |

- En fazla 3 tur yapılır. Bir önceki turda geçen bir kontrol yeniden başarısız olursa **regresyon** olarak işaretlenir ve o sürüm tercih edilmez.
- 3 tur sonunda eşik geçilemezse durum "insan gerekli" olur. En yüksek puanlı sürüm ve açık bulgular gösterilir; kullanıcı chat'ten devam eder.
- **Salınım tespiti:** Aynı kontrol iki kez düzelip yeniden bozulursa döngü erken durur.

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
- **Eşdeğerlik testi:** Her build'de Blender ve Three.js, seçili 5 karede anchor'ların ekran konumlarını üretir. Fark 8 px'ten fazlaysa build başarısız sayılır. Konvansiyonlar: 1 birim = 1 cm; Blender Z-yukarı, glTF Y-yukarı dönüşümü.
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
| `Review` | `rubric_version`, `checks[]{id, pass, score, evidence{frame, timecode, crop}, fix_hint}`, `dimension_scores`, `gates`, `total`, `verdict` |

Her JSON artefakt hem içerik adresli dosya olarak hem de Postgres'te `jsonb` olarak tutulur, böylece sorgulanabilir.

### 7.5 Render

- **Blender önizleme:** 8 kare, %50 ölçek, 16 örnek, kontakt sayfası ve güvenli alan katmanı (~20 sn).
- **Blender final:** EEVEE, raytracing, 64 örnek, AgX "Punchy". Çıktı RGBA PNG. `Fra:` satırları ayrıştırılarak gerçek kare ilerlemesi alınır. Her işten önce `gpu.platform.renderer_get()` çıktısında "NVIDIA" yazdığı doğrulanır.
- **Remotion:** Tek bir paylaşılan çalışma alanı kullanılır; şablon değişmedikçe bundle tekrar alınmaz. `renderMedia` için `inputProps`, `concurrency: 2`, `onProgress` ve `cancelSignal` kullanılır. `chromiumOptions.gl='angle'` sadece ThreeCanvas'ta. Remotion Studio asla gömülmez (sürükleme kaynak koda `translate` yazıyor).
- **Kodlama:** H.264 High, CRF 16–18, preset slow, `yuv420p`, `color_range tv`, bt709, GOP ≤ 2 sn, `faststart`, AAC 48 kHz. `yuvj420p` veya pc range çıktıları **otomatik reddedilir**.

### 7.6 Ses ve iki varyant

- **VO modu:**
  1. Türkçe metin normalizasyonu: sayılar, birimler, kısaltmalar, ondalık virgül
  2. Cümle bazında TTS
  3. Whisper ile kelime zamanları; senaryo metniyle eşleştirilir; CER > %5 ise yeni seed ile yeniden üretilir
  4. 120–250 ms aralar
  5. 48 kHz'e yeniden örnekleme
- **Seslendirmesiz mod:** Her vuruşu metin ve SFX taşır.
- **SFX:** `events.json`'dan otomatik cue çıkarılır. Örneğin `explode_start` → whoosh, `part_lock` → click/snap. Başlangıç zamanı ±1 kare doğrulukta; aynı ses 10 sn içinde en fazla 3 kez çalınır.
- **Mastering (ffmpeg):** Sidechain ducking ile müzik konuşma altında 10–14 dB düşer. İki geçişli `loudnorm` ile −14 LUFS / −1 dBTP hedeflenir; sonuç `ebur128` ile doğrulanır. Not: −14 LUFS resmi bir TikTok değeri değil, kanal konvansiyonudur.
- **Varyantlar:** Remotion videoyu **bir kez ve sessiz** render eder. Ses iki varyant için ayrı ayrı mux'lanır (`-c:v copy`):
  - `final_music.mp4` → asıl sürüm; Shorts ve arşiv için
  - `final_tiktok.mp4` → müziksiz; TikTok'a varsayılan olarak bu gider
- **Disk:** Compose ve QC geçtikten sonra PNG kareleri silinir. Kalıcı olarak tutulanlar:
  - MP4 varyantları
  - taslak MP4
  - kontakt sayfaları
  - `.blend`, `scene.glb`
  - spec'ler ve manifestler
  - stem'ler (FLAC)
  - kapak görseli

  Toplam ~25–40 MB/video.

## 8. Kalite sistemi

### 8.1 Rubrik (sürümlü, `packages/shared/rubric.yaml`)

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

1. **AUTO (~2 sn):** qc_probe (ffprobe, `ebur128`, `blackdetect`, `freezedetect`, `scdet`, SSIM). Kapılar başarısızsa LLM reviewer'lar hiç çalışmaz; doğrudan fixer'a gidilir.
2. **MANIFEST:** `layout.json`, `anchors.json`, `events.json` ve storyboard üzerinden güvenli alan, punto, kalma süresi, olay yoğunluğu ve SFX senkron kontrolleri.
3. **VISION:** reviewer_visual. Saniyede 1 kare, segment sınırlarında ek kareler, 540×960 ve üstü çözünürlük, 12 karelik kontakt sayfası, 2× kırpmalar, güvenli alan katmanı.
4. **WEB:** reviewer_facts. Sayısal iddiaların hepsi ve URL'lerin rastgele %30'u yeniden doğrulanır; storyboard uygunluğu kontrol edilir.
5. **Retention:** reviewer_retention. Kanca, ikinci kanca, ödül, döngü, slop ifadeleri.

### 8.3 Kendi kendini onaylamaya karşı önlemler

- Reviewer'lar ayrı ve izole oturumlarda çalışır. Builder'ın düşüncesini görmezler; her bulguyu kare ve zaman koduyla kanıtlamak zorundadırlar.
- Sınırdaki puanlarda (78–82) ikinci, bağımsız bir görsel review çalışır. Puanların ortalaması alınır.
- **Kalibrasyon:** Kalem pilotu (`~/icinde-ne-var/pilot-kalem/remotion/out/icinde-ne-var-kalem.mp4`) bilinen kötü örnek olarak kullanılır. Rubrik bu videoda en az şu 7 hatayı yakalamalı: −23,4 LUFS, LRA 20,6, ilk ses 0,79 sn, sessizlikler, donmalar, renk etiketleri, güvenli alan ihlalleri. Yakalamıyorsa rubrik hatalı sayılır.
- **Bayat artefakt koruması:** Her render için `sha256(spec + src + lock)` kaydedilir. Hash'i güncel spec'le uyuşmayan bir artefakt review edilmez.

### 8.4 Sonradan ayarlama

İlk 10 yayından sonra kullanıcı TikTok Studio'daki ortalama izlenme süresi ve tam izlenme oranını elle girer. Bu verilerle boyut ağırlıkları yeniden ayarlanır; folklor etiketli eşikler ilk revize edilenlerdir.

## 9. Ses ve varlık katmanı (ücretsiz, yerel, lisanslı)

| Alan | Karar | Kanıt |
|---|---|---|
| TTS | M1'de **dinleme testi**: Chatterbox Multilingual V3 (MIT) ve FreyaTTS-small (Apache-2.0), aynı Türkçe metinle; hazır ses ve kendi ses klonu yan yana. Kararı kullanıcı verir | Ticari kullanıma uygun, Türkçe konuşan ve 6 GB'a sığan sadece bu ikisi. XTTS-v2, MMS ve F5 ticari değil; Kokoro'da Türkçe yok |
| TTS çalışma şekli | `python/audio_service`: tek uv venv (Python 3.12). Model **sadece ses işi sırasında, GPU kilidi altında** yüklenir ve iş bitince boşaltılır | Chatterbox 4–6 GB VRAM tutuyor; yüklü kalırsa Blender çakışır |
| Hizalama | faster-whisper (large-v3-turbo veya bu GPU'ya sığan en büyük model) kendi venv'inde. Kelime zamanları senaryoyla eşleştirilir ve Remotion `createTikTokStyleCaptions` ile kullanılır | Mevcut `transcription` komutu başka bir deneyin venv'ine bağlı; kırılgan, ona güvenilmez |
| SFX | Kenney CC0 paketleri + lisansı CC0 olarak doğrulanmış Remotion sesleri (whoosh, whip, mouse-click, switch, page-turn, shutter). Remotion'un `ding.wav` sesi **lisanssız**, kullanılmaz. Gerekirse ffmpeg ile prosedürel SFX | Araştırma raporu |
| Müzik | `assets` defteri: başlık, kaynak URL, SPDX lisansı, yazar, atıf metni, lisansın anlık görüntüsü, sha256. Sadece Pixabay Content License, CC0 ve CC-BY-4.0 kabul edilir; NC, ND, SA ve YouTube Audio Library standart lisansı engellenir. Kürasyon arayüzden elle yapılır | Ücretli API yok; MusicGen ve YuE çıktıları ticari değil |
| Lisans kapısı | Render, defterde olmayan veya izin verilmeyen bir varlığı **reddeder**. CC-BY atıfları açıklama metnine otomatik eklenir | |
| Klon ses | Seçilirse G4 kapısı AI etiketini zorunlu tutar ve bitirme kartı bunu hatırlatır | TikTok AIGC kuralı |

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
| `steps` | id, run_id, key, ordinal, weight, status (`pending`/`queued`/`running`/`waiting_gpu`/`waiting_limit`/`waiting_disk`/`done`/`failed`/`skipped`/`cancelled`), progress, progress_source (`render`/`agent`/`time`/`deterministic`), attempt, input_hash, lease_owner, lease_expires_at, error |
| `jobs` | id, step_id, resource (`gpu`/`heavy_cpu`/`claude`/`chat`), priority, status, run_after, lease_owner, lease_expires_at, payload |
| `versions` | id, video_id, parent_version_id, round, spec_hash, src_hash, reason, created_by_session_id |
| `blobs` | sha256 (PK), path, bytes, mime, created_at |
| `artifacts` | id, version_id, run_id, kind, blob_sha, content (jsonb, JSON türleri için), duration_ms, width, height, codec, meta |
| `agent_sessions` | id, run_id, step_id, role, model, effort, claude_session_id, parent_session_id, sdk_version, cli_version, status, usage, num_turns, terminal_reason, transcript_blob_sha, started_at, ended_at |
| `agent_events` | id (bigserial), session_id, seq, type, subtype, parent_tool_use_id, tool_use_id, task_id, payload, ts |
| `reviews` / `findings` | review: version_id, round, reviewer_role, session_id, rubric_version, total, dimension_scores, gates, verdict · finding: check_id, severity, gate, evidence (kare, zaman kodu, kırpma), fix_hint, status (`open`/`fixed`/`regressed`/`wontfix`), fixed_in_version_id |
| `claims` | video_id, version_id, text_tr, sources (jsonb), status, verified_at |
| `assets` | kind (`music`/`sfx`/`model3d`/`hdri`/`font`/`voice_ref`), title, blob_sha, license_spdx, source_url, author, attribution, license_snapshot_sha, allowed, platforms |
| `publications` | version_id, variant, platform, mode, publish_id, status, error_code, requested_at, completed_at, finished_in_app_at, url |
| `usage_snapshots` | ts, source, five_hour_util, five_hour_resets_at, seven_day_util, seven_day_resets_at, status, raw |
| `chat_threads` | id, video_id, title, claude_session_id, created_at |
| `settings` | key, value (rol başına model ve effort, eşikler, kanal kimliği) |
| `audit_log` | §11.2 |

### 11.2 Audit

- **Sütunlar:** `id bigserial`, `ts`, `actor_type` (`user`/`orchestrator`/`agent`/`system`), `actor_id` (rol + oturum), `action`, `subject_type`, `subject_id`, `run_id`, `step_id`, `session_id`, `tool_use_id`, `data jsonb`, `prev_hash`, `hash`.
- **Değiştirilemezlik:** Güncelleme ve silme bir trigger'la engellenir. Uygulama rolünün `UPDATE`/`DELETE` yetkisi yoktur.
- **Hash zinciri:** `BEFORE INSERT` trigger'ı `pg_advisory_xact_lock` ile satırları sıraya koyar ve `hash = sha256(prev_hash || canonical(row))` hesaplar. API ve Worker aynı yazma fonksiyonunu kullanır. `GET /api/audit/verify` zinciri baştan doğrular.
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
- **Alt ajanlar** `task_started`, `task_progress` ve `task_notification` olaylarından ve `parent_tool_use_id` alanından türetilir. Kartlar iç içe gösterilir.
- Karta tıklanınca tam iz açılır: ThinkingState satırları, araç çağrıları, diff'ler, ham olaylar.

### 12.3 Canlılık

- Worker her 2 sn'de her çocuk sürecin (Claude, Blender, Chrome, ses servisi) CPU ve RSS değerini ölçer ve `vg_live` üzerinden yayınlar.
- **"Takılmış olabilir"** uyarısı şu durumda çıkar: 120 sn boyunca hiç olay gelmemiş **ve** CPU %1'in altında. Uyarıyla birlikte "Durdur" ve "Yeniden dene" butonları gösterilir.
- Sadece olay gelmiyor ama CPU çalışıyorsa kartta sadece "son olay N sn önce · süreç canlı" yazar.

### 12.4 Arayüzün kendisi donmaz

- Uzun işlerin hiçbiri istek/yanıt içinde yapılmaz. Komutlar `202` döner, sonuç olaylarla gelir.
- SSE olayları `requestAnimationFrame` ile toplu çizilir (≤ 10 Hz). İz listeleri 200 satırı geçince sanal kaydırma kullanılır.
- SSE her 15 sn'de heartbeat gönderir. Bağlantı koparsa üstte "yeniden bağlanıyor…" şeridi çıkar ve `Last-Event-ID` ile kaçan olaylar tekrar oynatılır. Olay sıra numaralarında boşluk olmamalı; bu test edilir.
- Sonsuz animasyon sadece aktif ilerleme göstergesinde ve canlı ThinkingState başlığında vardır (yalnızca `transform` ve `opacity`).

## 13. Arayüz

> Uygulama sırasında `frontend-design:frontend-design` skill'i kullanılır. Kullanıcının verdiği ThinkingState komponenti ve Perplexity stil kılavuzu temel alınır.

### 13.1 Bilgi mimarisi

- **Nav rail** (56 px, ikonlar): Stüdyo · Kütüphane · Audit · Varlıklar · Ayarlar.
- **Stüdyo:**
  - **Üst bar:** ürün giriş alanı (Perplexity'deki ana arama kutusu gibi; teal halo), ses modu çipleri (Seslendirmeli / Seslendirmesiz), "Üret".
  - **Sol üretim paneli** (~%44):
    - başlık: ürün, durum rozeti, genel yüzde çubuğu ve ETA
    - player sekmeleri: **Taslak** (`@remotion/player`, spec'ten canlı) · **Final** (HTML5 video, Range) · **Karşılaştır** (sürümleri yan yana veya A/B oynatma)
    - adım listesi (ThinkingState "Steps" diliyle)
    - agent kartları
  - **Sağ chat paneli:**
    - video bağlamı çipi
    - mod çipleri (Analiz et / Düzelt / Soru)
    - mesajlar ve canlı ThinkingState izleri
  - **Footer:** Claude bağlantı noktası ve plan rozeti · 5 sa ve 7 gün kullanım çubukları (sıfırlanma saatiyle) · GPU kuyruğu · boş disk.
- **Kütüphane:** Video kartları (kapak, puan, durum, süre, kullanım maliyeti). Video detayının sekmeleri: Sürümler · Storyboard · Araştırma ve kaynaklar · Review'lar (boyut çubukları, kapı rozetleri, kareli bulgular) · Audit · Yayın.
- **Audit gezgini:** Filtreler: run, video, agent, olay türü, tarih. Her satırdan ham transcript'e, diff'e ve artefakta inilir. Zincir doğrulama durumu gösterilir.
- **Varlıklar:** Müzik, SFX ve 3D defteri; lisans alanları; ekleme ve onay.
- **Ayarlar:**
  - Claude bağlantısı: `auth status`, giriş akışı, gömülü CLI sürümü
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
  - **Search:** `WebSearch` sorgusu (`input_json_delta`) ve sonuç `{title, url}` satırları (alan adıyla); WebFetch URL'leri "okundu" olarak.
  - **Coding:** Read (`file_path`, satır sayısı); Edit/Write (`structuredPatch` üzerinden +eklenen/−silinen); Bash ve MCP çalıştırmaları (komut veya araç adı, durum, süre).
- Satırlar `parent_tool_use_id` ile ilgili alt ajanın altına yerleşir.

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

- **Kısayollar:** Space oynat/durdur · J/K/L sarma · N yeni üretim · `/` chat'e odaklan · Esc kapat · `?` yardım paneli.
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
| Worker çöktü veya yeniden başladı | Açılışta PID dosyası ve süreç grubu üzerinden yetim süreçler öldürülür. Kirası (lease, 30 sn heartbeat, 2 dk süre) dolan adımlar yeniden kuyruğa girer. Adımlar `input_hash` ile idempotenttir; geçerli çıktısı olan adım yeniden çalışmaz |
| Agent hatası | Aynı oturum `resume` ile bir kez yeniden denenir. Şema doğrulama hatasında oturum içinde en fazla 2 kez yeniden istenir. Model aşırı yüklüyse yedek modele geçilir |
| Kullanım limiti | `waiting_limit` durumuna geçilir; `resetsAt` anında kendiliğinden devam edilir; kartta geri sayım gösterilir |
| GPU bellek yetmedi | Bir kez daha düşük ayarlarla denenir (EEVEE 64→32 örnek, Remotion concurrency 2→1). Yine olmazsa gerekçeli hata verilir |
| Disk eşik altında | `waiting_disk` durumuna geçilir; arayüzde uyarı ve temizlenebilecek öğelerin önerisi gösterilir |
| Kullanıcı iptali | §6.4'teki iptal sırası uygulanır; audit'e yazılır |
| Yayın zaman aşımı | "Bekliyor" olarak işaretlenir ve yoklama sürdürülür; başarı sayılmaz |
| SSE koptu | Otomatik yeniden bağlanılır ve kaçan olaylar `Last-Event-ID` ile tekrar oynatılır |

## 15. Güvenlik

- **Ağ:** API sadece 127.0.0.1'e bağlanır. Yazma uçlarında Host/Origin kontrolü ile CSRF ve DNS-rebinding koruması vardır (dag-wireboard `server/app.py:25-90` modeli). CORS kapalıdır.
- **Gizli bilgiler:** `~/videogen-data/secrets/` (0600) altında durur. Loglara, audit'e, agent env'ine ve UI'ya asla çıkmaz; UI'da sadece var/yok ve son kullanma tarihi gösterilir.
- **Agent izinleri:** `bypassPermissions` asla kullanılmaz. `canUseTool` yazma yollarını run klasörüyle sınırlar. Kısıtlı Bash ve ağır komut yasağı uygulanır (§6.3).
- Ücretli API muhafızı ve bağımlılık kilidi (§6.6, §5.3).

## 16. Test stratejisi

### 16.1 Değiştirilebilir sürücüler

- **`FakeClaudeDriver`:** `tests/fixtures/claude-streams/` altındaki **gerçek** stream-json kayıtlarını hızlandırılmış zamanlamayla oynatır. Kayıtlar M0'daki haiku denemelerinden alınır (tasarım sırasında yapılan canlı denemelerin çıktıları başlangıç noktasıdır). Rol bazlı senaryolar: normal akış, alt ajanlı akış, uzun sessizlik, hata, limit.
- **`FakeRenderDriver`:** ffmpeg `testsrc2` ile 2 sn'lik 270×480 videolar üretir ve gerçekçi kare ilerleme olayları yayar.
- **TikTok mock sunucusu:** Fastify, rastgele port. `creator_info`, `inbox/video/init`, PUT ve `status/fetch` uçlarını taklit eder.

### 16.2 Playwright smoke senaryoları (`npm run test:smoke`, hedef < 3 dk)

| # | Senaryo | Doğrular |
|---|---|---|
| S1 | Açılış | < 2 sn yüklenme; Claude bağlantı kartı; kullanım footer'ı değerleri; konsolda hata yok |
| S2 | Üretim | Ürün adı → run oluşur → adımlar ilerler → agent kartları (rol, model, durum) ve iç içe alt ajan kartı görünür → **genel yüzde monoton artar** (örneklenerek) → "Yayına hazır" → kütüphanede video oynar (`currentTime` ilerler) |
| S3 | Canlılık | Sahte sürücü 10 sn sessiz kalır, süreç canlı → "son olay N sn önce · süreç canlı". CPU sıfıra indirilir → "takılmış olabilir" uyarısı → "Durdur" çalışır ve adım `cancelled` olur |
| S4 | SSE kopması | Bağlantı kesilir → "yeniden bağlanıyor" şeridi → yeniden bağlanılır → olay sırasında boşluk yok |
| S5 | Chat | Mesaj gönderilir → ThinkingState Search ve Coding satırları akar → izi kapanır → yeni sürüm (v2) oluşur → Karşılaştır sekmesi iki sürümü gösterir |
| S6 | Yayın | Bitirme penceresi → mock TikTok'a taslak gönderilir → `SEND_TO_USER_INBOX` → audit satırı oluşur. 24 saatteki 6. taslak engellenir |
| S7 | Audit | Run'a göre filtre; zincir doğrulaması "geçerli"; satırdan ham olaya inilir |
| S8 | Performans | 4× CPU yavaşlatmasında adım listesi ve iz kaydırma p95 ≤ 16,8 ms; boştayken CPU bütçesi |

**İzolasyon:**
- Aynı container'da ayrı bir `videogen_test` veritabanı kullanılır; her koşuda oluşturulup silinir.
- Veri klasörü `$TMPDIR/videogen-test-<id>`; portlar 5190/5191.
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
| SDK'nın gömülü binary'si `~/.claude` OAuth bilgilerini kullanıyor; kullanıcının terminaldeki CLI'sıyla aynı anda token yenilemesi sorun çıkarmıyor | M0 spike (a) | `pathToClaudeCodeExecutable` ile kurulu CLI kullanılır ve sürüm her açılışta kontrol edilir |
| `get_usage` sıfır token harcıyor | M0 spike (b) | Son `rate_limit_event`, "x dk önce" damgasıyla |
| `auth login` TTY olmadan çalışıyor | M0 spike (c) | Ekranda talimat: terminalde `! claude auth login`; ekran durumu yoklar |
| Chatterbox 5,67 GB VRAM'e sığıyor | M1 ölçümü | FreyaTTS (1,5 GB) |
| Video başına kullanım (token, 5 saatlik pencere payı) bilinmiyor | M4'te ölçülür | Rol modelleri ve reviewer sayısı ayarlanır |
| Güvenli alan pikselleri resmi değil (üçüncü taraf değerler çelişiyor) | Kullanıcının telefonundan ekran görüntüleriyle kalibrasyon (M5) | Pilot kılavuzundaki değerler (150–1510 dikey, sağ 130 px) |
| −14 LUFS resmi bir TikTok değeri değil | Kanal konvansiyonu; ilk 10 yayından sonra gözden geçirilir | — |
| Karmaşık ürünlerde prosedürel model kalitesi | Zorluk kapısı (§7.1) | CC0 varlık kaynakları; olmuyorsa "insan gerekli" |
| SDK veya CLI protokol değişikliği | Tam sürüm sabitleme; yükseltmeden önce gerçek smoke | — |

## 19. Gelecek (v1 sonrası)

- Storyboard onay kapısı ve chat'ten storyboard düzenleme. Tek bir kontrol noktası olarak eklenebilir.
- İngilizce varyant (metinler zaten dil anahtarlı).
- YouTube Shorts'a API ile yükleme.
- İzlenme verisinden rubrik ağırlıklarını otomatik yeniden ayarlama.
- ComfyUI ile doku ve dekor üretimi. Sadece kahraman olmayan öğelerde ve AIGC etiketiyle.
