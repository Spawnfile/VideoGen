# VideoGen — Uygulama Takip Listesi

**Nasıl kullanılır:** Her görev bitince kutuyu işaretleyin (`[x]`) ve satırın sonuna `· commit <hash> · <tarih>` ekleyin; gerekiyorsa kısa bir not düşün. Kapılar (🚦) kullanıcı kararı veya onayı ister. M3–M7 maddeleri spec'ten çıkarılmış teslimatlardır; ayrıntılı planları, bir önceki taş bitince yazılır (runbook §5).

**Genel durum**

| Taş | Plan | Durum | Başlangıç | Bitiş | Rapor |
|---|---|---|---|---|---|
| M0 Doğrulama | `plans/2026-10-06-m0-verification.md` | Tamamlandı | 2026-10-06 | 2026-10-06 | `docs/m0/report.md` |
| M1 Ses | `plans/2026-10-06-m1-audio-listening.md` | Tamamlandı (K17 kullanıcı onayı bekliyor) | 2026-10-06 | 2026-10-06 | `docs/m1/decision.md` |
| M2 İskelet | `plans/2026-10-06-m2-skeleton.md` | Tamamlandı | 2026-10-06 | 2026-10-06 | `docs/m2/report.md` |
| M3 Canlı agent katmanı | `plans/2026-10-06-m3a-agent-runtime.md` (M3a) + `plans/2026-10-06-m3b-live-ui.md` (M3b) | Tamamlandı | 2026-10-06 | 2026-10-06 | `docs/m3/report.md` |
| M4 Dikey dilim | M3 sonrası (plan kullanıcı onayıyla) | Plan yok, sırada | | | |
| M5 Final ve kalite | M4 sonrası | Plan yok | | | |
| M6 Yayın | M5 sonrası | Plan yok | | | |
| M7 Sertleştirme | M6 sonrası | Plan yok | | | |

---

## M0 — Doğrulama ve disk hazırlığı

- [x] T1 Onaylı disk temizliği (gemma4 ×2, önbellekler, eski node_modules, minillm-lab) → `docs/m0/disk-cleanup.md` · commit d6f44b9 · 2026-10-06 · Chrome açıktı → `~/.cache/google-chrome` atlandı
  - [x] 🚦 minillm-lab'da kaybolacak iş yok (git status / log @{u}.. / stash boş; HEAD = origin/main)
  - [x] Boş disk ≥ 30 GB (8,1 → 32 GB)
- [x] T2 Spike çalışma alanı + SDK 0.3.290 (gömülü CLI 2.1.290) + `claude-plugin/` iskeleti · commit e6b25bd · 2026-10-06
- [x] T3 Spike (a): abonelik girişi (`apiKeySource: none`), izolasyon (hook sıfır, MCP yok), plugin skill'leri yüklü → `basic.ndjson` · commit 277de5e · 2026-10-06 · sapma: proje slug'ı için ek maskeleme kuralı
  - [x] 🚦 Abonelik yolu çalışıyor
- [x] T4 Spike (a2): alt ajan + yapılandırılmış çıktı, WebSearch, Write/Edit (`structuredPatch`), PreToolUse yol koruması, interrupt → 5 fixture · commit 10eccfd · 2026-10-06 · +`subagent-background.ndjson`; maskeleme sertleştirildi
  - [x] 🚦 Yol koruması kaçışı engelliyor
- [x] T5 Spike (b): sıfır token kullanım okuma → `usage-response.json` · commit cb091d2 · 2026-10-06 · geçti (~0,9 sn, 0 mesaj, maliyet 0); oranlar yüzde (0–100), `resets_at` ISO
- [x] T6 Spike (c): TTY olmadan giriş akışı (izole config); gerçek giriş sağlam · commit 8cdf9f6 · 2026-10-06 · URL + "Paste code" + 127.0.0.1 callback; M2 kararı (ii) terminal talimatı
- [x] T7 Spike (d): Blender GLB → Three.js anchor eşdeğerliği ≤ 8 px · commit 79332a6 · 2026-10-06 · en kötü Δ 0,00 px; sapma: mixer `LoopOnce` + clamp
- [x] T8 M0 raporu + spec §18 güncellemesi + kullanıcıya özet · commit d9370cd · 2026-10-06 · + final review düzeltmeleri 1b3a282 (kullanım semantiği, M2 errata, gizlilik); runbook güncellendi

## M1 — Ses servisi ve TTS dinleme testi

- [x] T1 Ses venv'i (Python 3.12, torch CUDA), sabitlenmiş commit'ler (`PINS.md`) · commit 49c0899 · 2026-10-06 · + `requirements.freeze.txt`, av==16.1.0, paket yapılandırması
- [x] T2 Türkçe normalizasyon (TDD, 11 test: ondalık virgül, birimler, TDK sayı yazımı, İ/ı) · commit 2ff0aba · 2026-10-06 · + noktalı ondalık, L, eksi, ≥10^12; 17 test
- [x] T3 CER + senaryoya sadık kelime hizalama (TDD, 6 test) · commit ef959d2 · 2026-10-06 · + noktalama, Whisper rakamları, "0"+",7" birleştirme, Whisper revizyon sabitleme
- [x] T4 Dinleme testi: Chatterbox (hazır ses) · FreyaTTS · (isteğe bağlı) kendi ses klonunuz; VRAM, RTF, CER ölçümleri + kör dinleme sayfası · commit a3006be · 2026-10-06 · klon test edilmedi (kayıt yok); adil CER: Chatterbox %0,5, Freya %17,9
- [ ] T5 🚦 Kullanıcı kararı: TTS motoru + anlatıcı sesi (klonsa AI etiketi zorunlu) → `docs/m1/decision.md`, spec K17 · commit 57cce67 · 2026-10-06 · **GEÇİCİ karar kaydedildi (Chatterbox ML V3 + hazır ses; Freya yedek); kullanıcının `~/videogen-data/m1/listening/index.html` dinleyip onaylaması bekleniyor**

## M2 — Platform iskeleti

- [x] T1 Monorepo, config, ücretli anahtar muhafızı (4 test) · commit a9b4c2a · 2026-10-06 · sapma: anahtar listesi sağlayıcı desenleriyle genişletildi
- [x] T2 Veritabanı paketi, migration'lar, hash zincirli audit (5 test) · commit 6a51edd · 2026-10-06 · sapma: 0002 JSON kanonik biçim + `clock_timestamp`, normalize gizli anahtar; 8 test
- [x] T3 `ui_events` outbox + NOTIFY sırası (3 test) · commit ab5a818 · 2026-10-06 · 5 test (prune, çok baytlı)
- [x] T4 Claude hesap ve kullanım eşleyicileri (8 test) · commit 15d1ffe · 2026-10-06 · M0 errata: kaynağa göre birim; 9 test
- [x] T5 API: tüm isteklerde localhost guard, tekrar oynatmalı SSE, sistem uçları (5 test) · commit dfb0221 · 2026-10-06 · yeni bağlantı max'tan başlar; 12 test
- [x] T6 Worker: auth durumu, sıfır token kullanım yoklaması, heartbeat, komutlar (3 test + elle doğrulama) · commit 506f225 · 2026-10-06 · crash-only LISTEN, 30 sn zaman aşımı; 6 test
- [x] T7 Arayüz kabuğu: Perplexity teması, canlı olay deposu, footer, Ayarlar (`frontend-design` skill'i; ekran görüntüsü incelendi) · commit e198c71 · 2026-10-06 · açılışta REST tazeleme, CLOSED yeniden bağlanma; 6 test
- [x] T8 Tek komutla başlatıcı (`npm start`): denetimli yeniden başlatma, anahtar reddi · commit 8757175 · 2026-10-06 · port ön kontrolü, ortak muhafız
- [x] T9 Playwright smoke S1 (3 test) · commit 38f064b · 2026-10-06 · 3/3
- [x] T10 README + M2 raporu; `typecheck` + `test` + `test:smoke` yeşil · commit 70bdbd9 · 2026-10-06 · + final review düzeltmeleri 1ecf4a3; 51/51 + smoke 3/3

## M3 — Canlı agent katmanı *(iki plan: M3a `plans/2026-10-06-m3a-agent-runtime.md` — sürücü, roller, MCP, koruma, tablolar, kullanım muhafızı; M3b `plans/2026-10-06-m3b-live-ui.md` — kartlar, ThinkingState, chat paneli, smoke, taş sonu)*

- [x] `ClaudeDriver` arayüzü: `SdkClaudeDriver` + fixture oynatan `FakeClaudeDriver` · commit 4a0ff5c, ad23a5c · 2026-10-06 · M3a T1/T6; elle gerçek doğrulama (haiku): MCP bağlı, guard reddi, interrupt → giriş kapanınca iterator fırlatır
- [x] Rol tanımları (`claude-plugin/agents/*.md`) ve rol başına model/effort/araç ayarları (spec §6.2) · commit 5149058, b8de497 · 2026-10-06 · M3a T3 (+ skill symlink'leri manifestten üretiliyor), ayar uçları T11; Ayarlar arayüzü M3b
- [x] `videogen` MCP sunucusu (in-process): `report_progress`, `get_context`, `read_spec`/`write_spec`, `register_artifact` · commit 73e50ea · 2026-10-06 · M3a T5; şema içerikleri M4
- [x] `PreToolUse` koruması: yol sınırı + ağır komut yasağı; gerekçe doğru MCP aracını gösteriyor · commit 5149058 · 2026-10-06 · M3a T3; + symlink kaçışı, Bash izin listesi, gizli dosya okuma yasağı; son review: Grep/Glob arama kökü run klasörüne sınırlandı, gizli dosya listesi genişledi (5149058)
- [x] `agent_sessions` / `agent_events` tabloları, ham NDJSON, transcript arşivi · commit cab01a1, 846b123, 58bfe77 · 2026-10-06 · M3a T4/T7/T8; `ui_events` sırası DB'de zorlanıyor
- [x] Agent kartları: durum, yüzde ve kaynağı, alt ajanlar, CPU/RAM, "takılmış olabilir" · commit 1963d8e · 2026-10-06 · M3b T4; tam iz, Durdur/Yeniden dene; ekran `docs/m3/agents.png`
- [x] Canlı ThinkingState (Steps / Reasoning / Search / Coding) + olay→satır eşleyici (fixture testli) · commit 49c0bbb · 2026-10-06 · M3b T2 (eşleyici M3a T2); 10 Hz canlı katman 22e8db9 (T1)
- [x] Chat paneli: kalıcı oturum, interrupt, resume, ayrılmış chat slotu · commit 9089088 · 2026-10-06 · M3b T5 (servis M3a T10); mod çipleri (Soru / Analiz et / Düzelt, migration 0004), Ayarlar'da rol başına model/effort, footer'da muhafız çipi; ekranlar `docs/m3/chat*.png`, `settings-roles.png`
- [x] Kullanım muhafızı: `rate_limit_event` beslemesi, %80 / %90 eşikleri, `resetsAt`'te devam · commit a1bea90 · 2026-10-06 · M3a T9; footer gösterimi M3b
- [x] Smoke S3 (canlılık), S4 (SSE kopması), S5 (chat, kısmi) · commit 21952bb · 2026-10-06 · M3b T6 (yığın T3); S4'te worker ölümü de; 7 passed × 3, ~39 sn; RED kanıtı geçici mutasyonlarla

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
| 2026-10-06 | 🚦 M0 T1 minillm-lab kaybolacak iş | Temiz → silindi | status/unpushed/stash boş; `git ls-remote` HEAD = yerel eae3905; yok sayılanlar yalnızca `.venv` (8,7 GB) |
| 2026-10-06 | 🚦 M0 T3 abonelik yolu | Geçti | init: `apiKeySource:none`, CLI 2.1.290, hook olayı 0, MCP 0, 8 skill `videogen:*` olarak yüklü |
| 2026-10-06 | 🚦 M0 T4 yol koruması | Geçti | `dontAsk` altında PreToolUse `deny`; OUTSIDE.txt oluşmadı; `permission_denials`'ta kayıtlı; model run klasörüne döndü (`guard.ndjson`) |
| 2026-10-06 | M0 footer veri kaynağı (M2) | `get_usage` birincil (yüzde 0–100), `rate_limit_event` canlı/yedek (0–1) | `docs/m0/report.md` §6 |
| 2026-10-06 | M0 giriş akışı (M2) | (ii) terminal `! claude auth login` + 5 sn yoklama; (i) v1.1 | `docs/m0/report.md` §8 |
| 2026-10-06 | M2 planı errata | `toFraction` kaldırıldı; kaynak başına normalizasyon | M2 planı başındaki errata |
| 2026-10-06 | 🚦 M1 öncesi disk eşiği (< 30 GB) | Otonom karar: devam (önceden onaylı `~/.npm` yeniden temizlendi → 29,5 GiB / 31,7 GB). M1 sırasında boş alan < 10 GiB olursa indirmeler durur | M2 sonrası `node_modules` (0,5 GB) + spike (0,3 GB) + npm önbelleği (0,8 GB) alanı tüketti; M1 gerçek ihtiyacı ~8–13 GB (uv hardlink'leri ikinci venv'i ucuzlatır); `df -B1M` 30203 MiB |
| 2026-10-06 | M2 final review | With fixes → düzeltildi (havuz hata dinleyicisi, idempotent kapanış, smoke her seferinde derler, yönlendirme env'leri temizlenir) | `docs/m2/report.md` §5 |
| 2026-10-06 | 🚦 M1 T4 ses klonu | Atlandı (kayıt yok; `/goal` gereği sorulmadı) | `docs/m1/report.md` |
| 2026-10-06 | 🚦 M1 T5 TTS ve anlatıcı sesi (K17) | GEÇİCİ: Chatterbox ML V3 + hazır ses (adil CER %0,5, VRAM 3,6 GB, rtf_gen 0,63); Freya yedek (CER %17,9 > %5 kapısı). **Kullanıcı onayı bekliyor** | `docs/m1/decision.md`; `~/videogen-data/m1/listening/results.json` |
| 2026-10-06 | M0 T1 disk eşiği | 32 GB boş ≥ 30 ✓ | `docs/m0/disk-cleanup.md` |
| 2026-10-06 | M3 plan bölme | M3 → M3a (11 görev) + M3b (~6 görev); M3b planı M3a'nın gerçek arayüzleriyle yazılır | 17 görev > 12 sınırı (handoff §4) |
| 2026-10-06 | M3 plan öncesi sondaj | In-process MCP, `sessionId`, Bash hook gerekçesi, streaming 2. tur, `resume`, detached spawn: hepsi doğrulandı | `spikes/m3/probe.mjs` (haiku, 2 oturum, 11 sn) |
| 2026-10-06 | ThinkingState kaynağı | Kullanıcının tasarım oturumunda yapıştırdığı özgün komponent bulundu ve repoya alındı; yeniden kurulmayacak, §13.2'ye göre uyarlanacak | `docs/m3/thinking-state.original.tsx` (kaynak: `~/.claude/paste-cache`, 02:02) |
| 2026-10-06 | M3 gerçek uçtan uca doğrulama (tek haiku chat oturumu) | Geçti + 1 bulgu düzeltildi (`result.text` yalnızca son metin bloğu → izde önceki metin kayboluyordu) | `docs/m3/real-check.md`, `docs/m3/real-chat.png` |
| 2026-10-06 | M3 son review (tek bağımsız reviewer, Claude Fable 5.1) | With fixes → 4 Important düzeltildi (Grep/Glob kökü run klasörüne, bayat muhafız durumu, boşta kapanma penceresi, `\u0000`), 1 Important Minor'a indirildi, 11 Minor ertelendi | `docs/m3/report.md` §7 |
