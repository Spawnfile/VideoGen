# VideoGen — Uygulama Takip Listesi

**Nasıl kullanılır:** Her görev bitince kutuyu işaretleyin (`[x]`) ve satırın sonuna `· commit <hash> · <tarih>` ekleyin; gerekiyorsa kısa bir not düşün. Kapılar (🚦) kullanıcı kararı veya onayı ister. M3–M7 maddeleri spec'ten çıkarılmış teslimatlardır; ayrıntılı planları, bir önceki taş bitince yazılır (runbook §5).

**Genel durum**

| Taş | Plan | Durum | Başlangıç | Bitiş | Rapor |
|---|---|---|---|---|---|
| M0 Doğrulama | `plans/2026-10-06-m0-verification.md` | Başlamadı | | | `docs/m0/report.md` |
| M1 Ses | `plans/2026-10-06-m1-audio-listening.md` | Başlamadı | | | `docs/m1/decision.md` |
| M2 İskelet | `plans/2026-10-06-m2-skeleton.md` | Başlamadı | | | `docs/m2/report.md` |
| M3 Canlı agent katmanı | M2 sonrası yazılacak | Plan yok | | | |
| M4 Dikey dilim | M3 sonrası | Plan yok | | | |
| M5 Final ve kalite | M4 sonrası | Plan yok | | | |
| M6 Yayın | M5 sonrası | Plan yok | | | |
| M7 Sertleştirme | M6 sonrası | Plan yok | | | |

---

## M0 — Doğrulama ve disk hazırlığı

- [ ] T1 Onaylı disk temizliği (gemma4 ×2, önbellekler, eski node_modules, minillm-lab) → `docs/m0/disk-cleanup.md`
  - [ ] 🚦 minillm-lab'da kaybolacak iş yok (git status / log @{u}.. / stash boş)
  - [ ] Boş disk ≥ 30 GB
- [ ] T2 Spike çalışma alanı + SDK 0.3.290 (gömülü CLI 2.1.290) + `claude-plugin/` iskeleti
- [ ] T3 Spike (a): abonelik girişi (`apiKeySource: none`), izolasyon (hook sıfır, MCP yok), plugin skill'leri yüklü → `basic.ndjson`
  - [ ] 🚦 Abonelik yolu çalışıyor
- [ ] T4 Spike (a2): alt ajan + yapılandırılmış çıktı, WebSearch, Write/Edit (`structuredPatch`), PreToolUse yol koruması, interrupt → 5 fixture
  - [ ] 🚦 Yol koruması kaçışı engelliyor
- [ ] T5 Spike (b): sıfır token kullanım okuma → `usage-response.json`
- [ ] T6 Spike (c): TTY olmadan giriş akışı (izole config); gerçek giriş sağlam
- [ ] T7 Spike (d): Blender GLB → Three.js anchor eşdeğerliği ≤ 8 px
- [ ] T8 M0 raporu + spec §18 güncellemesi + kullanıcıya özet

## M1 — Ses servisi ve TTS dinleme testi

- [ ] T1 Ses venv'i (Python 3.12, torch CUDA), sabitlenmiş commit'ler (`PINS.md`)
- [ ] T2 Türkçe normalizasyon (TDD, 11 test: ondalık virgül, birimler, TDK sayı yazımı, İ/ı)
- [ ] T3 CER + senaryoya sadık kelime hizalama (TDD, 6 test)
- [ ] T4 Dinleme testi: Chatterbox (hazır ses) · FreyaTTS · (isteğe bağlı) kendi ses klonunuz; VRAM, RTF, CER ölçümleri + kör dinleme sayfası
- [ ] T5 🚦 Kullanıcı kararı: TTS motoru + anlatıcı sesi (klonsa AI etiketi zorunlu) → `docs/m1/decision.md`, spec K17

## M2 — Platform iskeleti

- [ ] T1 Monorepo, config, ücretli anahtar muhafızı (4 test)
- [ ] T2 Veritabanı paketi, migration'lar, hash zincirli audit (5 test)
- [ ] T3 `ui_events` outbox + NOTIFY sırası (3 test)
- [ ] T4 Claude hesap ve kullanım eşleyicileri (8 test)
- [ ] T5 API: tüm isteklerde localhost guard, tekrar oynatmalı SSE, sistem uçları (5 test)
- [ ] T6 Worker: auth durumu, sıfır token kullanım yoklaması, heartbeat, komutlar (3 test + elle doğrulama)
- [ ] T7 Arayüz kabuğu: Perplexity teması, canlı olay deposu, footer, Ayarlar (`frontend-design` skill'i; ekran görüntüsü incelendi)
- [ ] T8 Tek komutla başlatıcı (`npm start`): denetimli yeniden başlatma, anahtar reddi
- [ ] T9 Playwright smoke S1 (3 test)
- [ ] T10 README + M2 raporu; `typecheck` + `test` + `test:smoke` yeşil

## M3 — Canlı agent katmanı *(plan M2 sonrası yazılacak)*

- [ ] `ClaudeDriver` arayüzü: `SdkClaudeDriver` + fixture oynatan `FakeClaudeDriver`
- [ ] Rol tanımları (`claude-plugin/agents/*.md`) ve rol başına model/effort/araç ayarları (spec §6.2)
- [ ] `videogen` MCP sunucusu (in-process): `report_progress`, `get_context`, `read_spec`/`write_spec`, `register_artifact`
- [ ] `PreToolUse` koruması: yol sınırı + ağır komut yasağı; gerekçe doğru MCP aracını gösteriyor
- [ ] `agent_sessions` / `agent_events` tabloları, ham NDJSON, transcript arşivi
- [ ] Agent kartları: durum, yüzde ve kaynağı, alt ajanlar, CPU/RAM, "takılmış olabilir"
- [ ] Canlı ThinkingState (Steps / Reasoning / Search / Coding) + olay→satır eşleyici (fixture testli)
- [ ] Chat paneli: kalıcı oturum, interrupt, resume, ayrılmış chat slotu
- [ ] Kullanım muhafızı: `rate_limit_event` beslemesi, %80 / %90 eşikleri, `resetsAt`'te devam
- [ ] Smoke S3 (canlılık), S4 (SSE kopması), S5 (chat, kısmi)

## M4 — Dikey dilim *(plan M3 sonrası)*

- [ ] Tablolar: `products`, `videos`, `runs`, `steps`, `jobs`, `versions`, `blobs`, `artifacts`
- [ ] Orchestrator + kaynak zamanlayıcı (GPU kilidi, RAM, swap, disk, VRAM, `ollama ps` ön kontrolü), kiralama ve kurtarma
- [ ] İlerleme modeli: ağırlıklı ve monoton toplam yüzde, yüzde kaynakları, ETA
- [ ] research adımı (`ProductResearch`, zorluk kapısı, belirsiz ad yorumu)
- [ ] storyboard adımı (`Storyboard`, kanca kalıpları, sürümlü kayıt)
- [ ] `vg_blender` çekirdeği + `build_scene` + önizleme kareleri + eşdeğerlik testi
- [ ] Paylaşılan Remotion çalışma alanı + Draft3D + `render_draft` + taslak review'u (≤ 2 tur)
- [ ] Kütüphane ve player (HTML5 Range + `@remotion/player`)
- [ ] 🚦 Kanal görsel kimliği: 2–3 seçenek → kullanıcı seçimi (K19)
- [ ] Video başına kullanım ölçümü (spec §18)
- [ ] Smoke S2 (taslak sürümüyle); ilk gerçek ürün

## M5 — Final render ve kalite *(plan M4 sonrası)*

- [ ] voice adımı: TTS servisi (GPU kilidi altında yükle/boşalt), hizalama, storyboard'un yeniden zamanlanması
- [ ] Blender final render (`Fra:` ilerlemesi, GPU doğrulaması, OOM'da düşük ayarla yeniden deneme)
- [ ] compose: Remotion katmanı, SFX cue'ları, müzik defteri ve lisans kapısı, mastering, iki varyant
- [ ] İçerik adresli medya deposu, kare temizliği, disk muhafızı
- [ ] qc_probe otomatik kapıları
- [ ] 3 reviewer (görsel, doğruluk, izlenme) + boyut sahipliği + puanlama
- [ ] Fixer döngüsü (≤ 3 tur, kapsam seçimi, regresyon ve salınım tespiti)
- [ ] Kalibrasyon: rubrik kalem pilotunun 7 hatasını yakalıyor
- [ ] Bir ürün uçtan uca "yayına hazır"; smoke S2 tam sürüm

## M6 — Yayın *(plan M5 sonrası)*

- [ ] TikTok Node modülü (`creator_info`, `inbox/video/init`, chunk yükleme, status yoklaması, token yenileme)
- [ ] Token taşıma (`~/tiktok-poster/tokens.json` → `secrets/`), yeniden bağlanma akışı
- [ ] Yayın penceresi + bitirme kartı + 24 saatte 5 taslak sınırı + hata kodu çevirileri
- [ ] Shorts dışa aktarımı (müzikli varyant)
- [ ] Smoke S6; 🚦 kullanıcı ilk gerçek taslağı gönderir

## M7 — Sertleştirme *(plan M6 sonrası)*

- [ ] Audit gezgini + zincir doğrulama arayüzü + ham olaya inme
- [ ] Sürüm karşılaştırma (yan yana / A-B)
- [ ] Varlık defteri arayüzü (müzik, SFX, 3D; lisans alanları)
- [ ] Zamanlanmış yedek (`pg_dump`, 7 gün) + blob çöp toplama + yetim dosya raporu
- [ ] Performans bütçeleri (smoke S8) + audit smoke S7
- [ ] `test:smoke:real` profili
- [ ] Güvenli alan kalibrasyonu (telefon ekran görüntüleri)

---

## Karar ve kapı kayıtları

| Tarih | Kapı / karar | Sonuç | Kanıt |
|---|---|---|---|
| | | | |
