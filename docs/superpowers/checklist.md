# VideoGen — Uygulama Takip Listesi

**Nasıl kullanılır:** Her görev bitince kutuyu işaretleyin (`[x]`) ve satırın sonuna `· commit <hash> · <tarih>` ekleyin; gerekiyorsa kısa bir not düşün. Kapılar (🚦) kullanıcı kararı veya onayı ister. M3–M7 maddeleri spec'ten çıkarılmış teslimatlardır; ayrıntılı planları, bir önceki taş bitince yazılır (runbook §5).

**Genel durum**

| Taş | Plan | Durum | Başlangıç | Bitiş | Rapor |
|---|---|---|---|---|---|
| M0 Doğrulama | `plans/2026-10-06-m0-verification.md` | Tamamlandı | 2026-10-06 | 2026-10-06 | `docs/m0/report.md` |
| M1 Ses | `plans/2026-10-06-m1-audio-listening.md` | Tamamlandı (K17 kullanıcı onayı bekliyor) | 2026-10-06 | 2026-10-06 | `docs/m1/decision.md` |
| M2 İskelet | `plans/2026-10-06-m2-skeleton.md` | Tamamlandı | 2026-10-06 | 2026-10-06 | `docs/m2/report.md` |
| M3 Canlı agent katmanı | `plans/2026-10-06-m3a-agent-runtime.md` (M3a) + `plans/2026-10-06-m3b-live-ui.md` (M3b) | Tamamlandı | 2026-10-06 | 2026-10-06 | `docs/m3/report.md` |
| M4 Dikey dilim | `plans/2026-10-06-m4a-pipeline-core.md` (M4a) + `plans/2026-10-06-m4b-scene-core.md` (M4b) + `plans/2026-10-06-m4c-draft-review-player.md` (M4c) | M4a, M4b ve M4c uygulandı ve `main`'e birleştirildi (`docs/m4/report.md`); açık tek madde: K12 rolleriyle ilk gerçek ürün ve video başına kullanım (makinede, `docs/machine-checklist.md` B.3–B.4) | 2026-10-06 | | `docs/m4/m4a-summary.md`, `docs/m4/m4b-summary.md` |
| M5 Final ve kalite | `plans/2026-10-06-m5a-final-render-qc.md` (M5a) + `plans/2026-10-07-m5b-review-fix.md` (M5b) + `plans/2026-10-07-m5c-voice.md` (M5c) | M5a, M5b ve M5c uygulandı (bulut konteynerinde, `main`'e fast-forward; M5b ve M5c: T1–T11 + T12 kısmi); GPU'lu makine adımları (Blender testleri, kalibrasyon, gerçek ürün koşuları, ses ölçümü, K17 onayı) bekliyor | 2026-10-06 | | `docs/m5/m5a-summary.md`, `docs/m5/m5b-summary.md`, `docs/m5/m5c-summary.md` |
| M6 Yayın | `plans/2026-10-08-m6-publish.md` | T1–T8 uygulandı (bulut, sahte TikTok); T9 (gerçek taslak, son review) bekliyor | 2026-10-08 | | `.superpowers/sdd/2026-10-08-m6-publish/progress.md` |
| M7 Sertleştirme | `plans/2026-10-08-m7-hardening.md` | T1–T13 bulutta uygulandı (Fake sürücüler; `npm test` 504, smoke 24/16); gerçek denetimler ve güvenli alan ölçümü kullanıcının makinesinde bekliyor (`docs/machine-checklist.md` A.8, D) | 2026-10-08 | | `docs/m7/m7-summary.md`, `.superpowers/sdd/2026-10-08-m7-hardening/progress.md` |

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

## M4 — Dikey dilim *(üç plan: M4a `plans/2026-10-06-m4a-pipeline-core.md` — tablolar, orchestrator, ilerleme, research, storyboard, Stüdyo, Kütüphane; M4b `plans/2026-10-06-m4b-scene-core.md` — vg_blender, sandbox'lı build, eşdeğerlik, önizleme, build adımı, K19 seçenekleri; M4c — taslak render, taslak inceleme, player, ilk gerçek ürün)*

- [x] Tablolar: `products`, `videos`, `runs`, `steps`, `jobs`, `versions`, `blobs`, `artifacts` · commit b44c042 · 2026-10-06 · M4a T2 (migration 0005; `blobs` M3'ten); `reviews/findings/claims/assets/publications` M5/M6
- [x] Orchestrator + kaynak zamanlayıcı (GPU kilidi, RAM, swap, disk, VRAM, `ollama ps` ön kontrolü), kiralama ve kurtarma · commit d77a817, 23d77ac · 2026-10-06 · M4a T4/T6; son review I2 (iptal yarışı) düzeltildi; 🚦 swap %100 iken GPU ön kontrolü eşiği kullanıcı kararı (M4b öncesi)
- [x] İlerleme modeli: ağırlıklı ve monoton toplam yüzde, yüzde kaynakları, ETA · commit be821f6, 23d77ac · 2026-10-06 · M4a T3/T6; son review I1 (zorluk kapısında %99) düzeltildi
- [x] research adımı (`ProductResearch`, zorluk kapısı, belirsiz ad yorumu) · commit bc71c3a, 7cb5f0b · 2026-10-06 · M4a T1/T7; gerçek haiku koşusu ilk denemede geçti (`docs/m4/real-check.md`)
- [x] storyboard adımı (`Storyboard`, kanca kalıpları, sürümlü kayıt) · commit bc71c3a, 7cb5f0b · 2026-10-06 · M4a T1/T7; Stüdyo kartları T9 (4f76cf2)
- [x] `vg_blender` çekirdeği + `build_scene` + önizleme kareleri + eşdeğerlik testi · commit dd63e70, 2b6524f, 374190f, dd119c1, 0d3d565, 52b2186 · 2026-10-06 · M4b T2–T7; iki aşamalı bwrap sandbox, kalem eşdeğerliği 0,01 px; gerçek Claude builder koşusu M4c'ye kaldı (kullanıcı kararı)
- [ ] Paylaşılan Remotion çalışma alanı + Draft3D + `render_draft` + taslak review'u (≤ 2 tur)
- [ ] Kütüphane ve player (HTML5 Range + `@remotion/player`) · Kütüphane listesi M4a T10 (80f4597); medya ucu (HTTP Range) M4b T8 (7ea0145); player M4c
- [ ] 🚦 Kanal görsel kimliği: 2–3 seçenek → kullanıcı seçimi (K19) · seçenekler ve seçici commit 2eb0dc4 · 2026-10-06 · M4b T9; **kullanıcı seçimi bekleniyor** (Ayarlar → Kanal kimliği), o zamana kadar `gece_mavisi` GEÇİCİ
- [ ] Video başına kullanım ölçümü (spec §18) · altyapı M4a T2/T6 (toplam + 5 sa payı; gerçek koşuda pencere karşılaştırma hatası bulundu ve düzeltildi); gerçek ürün ölçümü M4c
- [ ] Smoke S2 (taslak sürümüyle); ilk gerçek ürün · S2a (taslak öncesi) M4a T11 (8018d5b); S2b (sahne) M4b T10 (63242b3); taslaklı S2 ve ilk gerçek ürün M4c

## M5 — Final render ve kalite *(plan M4 sonrası)*

- [ ] voice adımı: TTS servisi (GPU kilidi altında yükle/boşalt), hizalama, storyboard'un yeniden zamanlanması
- [ ] Blender final render (`Fra:` ilerlemesi, GPU doğrulaması, OOM'da düşük ayarla yeniden deneme) · kod M5a T3/T4 (`VG_PROGRESS` kare ilerlemesi, NVIDIA denetimi, 32 örnekle bir yeniden deneme, devam); `test:blender` ve Blender int testi GPU'lu makinede bekliyor
- [x] compose: Remotion katmanı, SFX cue'ları, müzik defteri ve lisans kapısı, mastering, iki varyant · M5a T2, T5–T8 · 2026-10-07 (seslendirmesiz; VO ve ducking M5c)
- [x] İçerik adresli medya deposu, kare temizliği, disk muhafızı · M4b (`putBlob`), M5a T4 (terminal run'da kare temizliği; `extraDiskMb` 2000/600) · 2026-10-07
- [x] qc_probe otomatik kapıları · M5a T1, T9, T10 (G1, G5 flaş, G6 manifest/kenar; D6 12, D7 5; rubrik `final@1`) · 2026-10-07
- [x] 3 reviewer (görsel, doğruluk, izlenme) + boyut sahipliği + puanlama · M5b T1, T5–T7 (`final@1`: 30 kontrol, deterministik `panelScore` + K13 kararı, `run_qc`, sınırda ikinci görsel review; commit 7b469c4, bedf7ea, 79c30ea, cbe5a68) · 2026-10-07 · Fake sürücüyle; gerçek reviewer isabeti GPU'lu makinede bekliyor (`docs/m5/real-check.md` M5b-3)
- [x] Fixer döngüsü (≤ 3 tur, kapsam seçimi, regresyon ve salınım tespiti) · M5b T2, T3, T4, T8 (hesaplanan kapsam compose/build/rework, `steps.fix_round`, migration 0008; commit 8792795, 90c437b, 9d90062, 3b515a9) · 2026-10-07 · yalnızca izlenen kontrollerde regresyon/salınım; seslendirme satırı M5c
- [ ] Kalibrasyon: rubrik kalem pilotunun 7 hatasını yakalıyor · pilot benzeri sentetik klipte 7/7 (M5a T9); gerçek pilot dosyasıyla `qc-cli` GPU'lu makinede bekliyor (`docs/m5/real-check.md` §1)
- [ ] Bir ürün uçtan uca "yayına hazır"; smoke S2 tam sürüm · **smoke S2 tam sürüm ✓** (M5b T9–T11: Fake sürücüyle "Yayına hazır · 87,5 puan", `rötuş` düzeltme turu, inceleme paneli; smoke 19/13; commit bf1b284, 19d5cc7; 2026-10-07) · **gerçek ürün bekliyor** (izinli müzikle "tükenmez kalem" yayına hazır; `docs/m5/real-check.md` M5b-3; müziksiz koşu D6'da `needs_human` ile biter)
- [x] `finalize`: en iyi sürüm, kare temizliği, gerekçeli `needs_human` · M5b T9 (commit bf1b284) · 2026-10-07 (M5a M10 reddedildi: v1'de `failed` run sürdürülemez)

## M6 — Yayın *(plan `plans/2026-10-08-m6-publish.md`)*

- [x] Yayın sözleşmeleri ve migration 0009 (`publications`, `claims`) · M6 T1–T2 · 2026-10-08 · tek parça, deterministik açıklama, atıf varyanta göre, `published` geri düşmez
- [x] TikTok Node modülü (`creator_info`, `inbox/video/init`, tek parça yükleme, status yoklaması, token yenileme, paylaşılan hız sınırı, sahte sunucu) · M6 T3 · 2026-10-08 · `packages/tiktok`
- [x] Gönderim servisi (durum makinesi, kurtarma, süpürme, claims + provenance) · M6 T4 · 2026-10-08 · otomatik yeniden gönderim yok
- [x] Token taşıma (`~/tiktok-poster/tokens.json` → `secrets/`, kopyalanmaz), yeniden bağlanma akışı (PKCE, 3455) · M6 T5 · 2026-10-08
- [x] Yayın penceresi + bitirme kartı + 24 saatte 5 taslak sınırı + hata kodu çevirileri · M6 T6–T7 · 2026-10-08
- [x] Shorts dışa aktarımı (müzikli varyant, atıflı açıklama) · M6 T6–T7 · 2026-10-08
- [x] Smoke S6 (21 geçti / 15 atlandı) · M6 T8 · 2026-10-08
- [ ] 🚦 Kullanıcı ilk gerçek taslağı gönderir (M6 T9; M5 kapanışından sonra, kullanıcının makinesinde) ve son review

## M7 — Sertleştirme *(plan `plans/2026-10-08-m7-hardening.md`)*

- [x] Audit gezgini + zincir doğrulama arayüzü + ham olaya inme · commit 8c145a2, fd1f317 · 2026-10-08 · M7 T2 (migration 0010, `/api/audit*`, süreli ve önbellekli doğrulama) + T3 (süzgeçler URL'de, satır detayı: ham satır, araç girdisi farkı, transcript, artefakt, iz)
- [x] Sürüm karşılaştırma (yan yana / A-B) · commit 64a5852 · 2026-10-08 · M7 T4: kütüphane detay sayfası (Sürümler · Review'lar · Storyboard · Araştırma · Audit · Yayın), tur çipleri; ekran `docs/m7/library-compare.png`
- [x] Varlık defteri arayüzü (müzik, SFX, 3D; lisans alanları) · commit 6f2c86a · 2026-10-08 · M7 T5: müzik, SFX ve ses örneği; yükleme, önizleme, izin geri alma (arayüz + `bin/assets.mjs revoke`). **3D varlık türü kapsam dışı bırakıldı** (tüketicisi yok)
- [x] Zamanlanmış yedek (`pg_dump`, 7 gün) + blob çöp toplama + yetim dosya raporu · commit 7366f2e, 6a9d2c3 · 2026-10-08 · M7 T6 (sahip rolüyle, sürüm denetimli döküm, docker'a düşer; geri yükleme yalnızca yeni DB'ye) + T7 (haftalık rapor, onaylı silme, 7 gün çöp kutusu, yetim raporu silmez, Ayarlar "Veri ve yedek"); gerçek veriyle prova makinede (`docs/machine-checklist.md` A.7, D.4–D.6)
- [x] Performans bütçeleri (smoke S8) + audit smoke S7 · commit bb415fc · 2026-10-08 · M7 T12: 200 satır üstü pencereli iz; smoke 24/16 (336 sn); S8(b) bu VM'de yaklaşık bir kareyle geçiyor, makinede yeniden ölçülecek (makine listesi A.5/D.3)
- [x] `test:smoke:real` profili · commit 67d6ea3 · 2026-10-08 · M7 T9: kod ve koşucu testleri bulutta; gerçek koşu makinede (makine listesi D.1)
- [ ] Güvenli alan kalibrasyonu (telefon ekran görüntüleri) · kod commit f318513 · 2026-10-08 · M7 T8: tek kaynak (`settings.safe_area` → `layout.json` → G6, kontakt sayfaları, qc), Ayarlar "Güvenli alan", `bin/safe-area.mjs`, kalibrasyon kartı. **Telefon ölçümü bekliyor** (makine listesi A.8)
- [x] `npm test` 6 dakikanın altında · commit 0e093af · 2026-10-08 · M7 T1: şablon veritabanı + paralel dosyalar; 462 test 332 → ~150 sn; M7 sonunda 504 test 174–195 sn (3 işçi); e2e `npm test`'te kaldı (M5c H18)
- [x] Ertelenen bulgular (M5c §9 2b, 3, 4, 7, 8; M6 SSE yoklaması; kısayollar) · commit c678613, 6aa6e51 · 2026-10-08 · M7 T10–T11; (5) ve Y20'deki Minor'lar ertelendi (`docs/m7/m7-summary.md` §6)
- [x] Makine kontrol listesi (M5 kapanışı + M6 T9 + M7 gerçek denetimleri tek sırada) · `docs/machine-checklist.md` · 2026-10-08 · M7 T13
- [ ] Makinedeki gerçek denetimler (`docs/machine-checklist.md` D) ve M7 kapanışı (E)

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
| 2026-10-06 | 🚦 M4a gerçek doğrulama: kullanım kapısı | İlk deneme durduruldu (5 sa %83 ≥ %80, muhafız `blocked`; 0 oturum). Kullanıcı: sıfırlanmadan sonra koş | `docs/m4/real-check.md` §1 |
| 2026-10-06 | M4a gerçek doğrulama (tek haiku ürün koşusu) | Geçti: run `done` 5 dk 57 sn, 2 oturum, düzeltme 0; 1 bulgu düzeltildi (video başına 5 sa payı `null`: iki kaynağın sıfırlanma anı farklı yazılıyor) | `docs/m4/real-check.md`, `docs/m4/real-studio.png` |
| 2026-10-06 | M4a son review (tek bağımsız reviewer, Claude Fable 5.1) | With fixes → 2 Important düzeltildi (zorluk kapısında %99, iptal/başlatma yarışı), 10 Minor + 1 ertelendi; ledger kararlarının hepsi doğru bulundu | `docs/m4/m4a-summary.md` §7 |
| 2026-10-06 | M4a S5 kırılganlığı ve chat yarışı | S5 kökü kanıtlandı (taze SSE replay etmez; test akışı bekliyor); "Yeni sohbet" + hemen gönderim yarışı düzeltildi | `docs/m4/m4a-summary.md` §6 |
| 2026-10-06 | 🚦 Swap / GPU ön kontrol eşiği (spec §6.4 `swap < %90`) | Kural değişmedi (plan B2): M4b sırasında swap %0; dolarsa GPU önizlemesi/taslağı gerekçeyle bekler ve kartta yazar. Kullanıcı isterse eşik değiştirilebilir | `docs/m4/m4b-summary.md` §7 |
| 2026-10-06 | M4 plan bölme | M4 → M4a + M4b + M4c (bağımsız grilling incelemesi: tek planda 12 görev sınırı aşılıyordu) | `plans/2026-10-06-m4b-scene-core.md` "Kapsam ve bölme" |
| 2026-10-06 | M4b uygulama ve birleştirme (kullanıcı kararı) | T1–T10 uygulandı; gerçek Claude doğrulaması ve bağımsız son review atlandı (kullanım limiti); M4a + M4b `main`'e birleştirildi | `docs/m4/m4b-summary.md` §6 |
| 2026-10-07 | M5 plan bölme | M5 → M5a (final, ses, otomatik kapılar) + M5b (reviewer'lar, fixer, "yayına hazır") + M5c (seslendirme) | `plans/2026-10-06-m5a-final-render-qc.md` E1 |
| 2026-10-07 | M5a uygulama (bulut konteyneri, GPU'suz; inline yürütme, her görevden sonra self-review) | T1–T11 uygulandı; `npm test` 355, smoke 19/11, render (Blender'sız) 5; Blender testleri, gerçek pilot kalibrasyonu ve ilk gerçek ürün GPU'lu makinede bekliyor; `main`'e birleştirilmedi (kullanıcı onayı) | `docs/m5/m5a-summary.md`, `docs/m5/real-check.md` |
| 2026-10-07 | M5a rubrik modülü (E2), LRA eşiği (E4), kare temizliği (E6), kodlama zinciri (E8), müzik yoksa davranış (E11) | Plandaki gibi; ek: teslim kodlaması her preset'te High profil, mastering −2 dBTP + AAC sonrası denetim | spec §7.5, §7.6, §8.1 notları |
| 2026-10-07 | M5b uygulama (bulut konteyneri, GPU'suz; alt ajanlar sonnet, kullanıcı: Fable ve opus alt ajan yok) | T1–T11 uygulandı (11 commit, her görevde spec + kalite review'u); `npm test` 399, smoke 19/13, M5b ekranları 2; `main` kullanıcı isteğiyle **fast-forward** (PR yok) | `docs/m5/m5b-summary.md`, ledger `.superpowers/sdd/2026-10-07-m5b-review-fix/progress.md` |
| 2026-10-07 | M5b T12 (kullanıcı kararları) | Tam doğrulama ayrı adım olarak koşulmadı (kanıt görev başına; `test:render` suiti ve `test:blender` koşulmadı); pilot kalibrasyonu, Blender testleri ve gerçek ürün koşusu GPU'lu makinede bekliyor; **son bağımsız review atlandı** | `docs/m5/real-check.md` M5b bekleyenleri |
| 2026-10-07 | M5b F4: boyut puanı ve kapılar deterministik (reviewer yalnız kontrol sonucu verir) | Plandaki gibi; spec §7.4 notu. D6 alt puanları (E3) karşılaştırması gerçek pilot/ürün bekliyor, rubrik `final@1` kaldı | `packages/shared/src/final-review.ts`, `m5b-summary` §4 |
| 2026-10-08 | M5c uygulama (bulut konteyneri, GPU'suz) | T1–T11 + son review düzeltmeleri (`006e876`); `main` fast-forward (PR yok). T12'nin GPU'lu makine adımları ve K17 dinleme onayı bekliyor | `docs/m5/m5c-summary.md`, ledger `.superpowers/sdd/2026-10-07-m5c-voice/progress.md` |
| 2026-10-08 | M5b + M5c son review (bulut, GPU'suz) | Critical: final döngüsü rewind'ında `fix_round` kayması → küresel tur; Important: web araçlı rollerin Read'i run dizini + skills; Minor: `runProcess` spawn hatası worker'ı düşürmüyor. Diğer Minor'lar ertelendi. `npm test` 430. GPU'lu makine adımları hâlâ bekliyor | `docs/m5/m5c-summary.md` §4b, §8, §9 |
| 2026-10-08 | M6 planı | 9 görev; yalnızca TikTok taslak (inbox) yolu; token `~/tiktok-poster`'dan taşınır (kopyalanmaz); `is_aigc` taslakta gönderilemediği için AI etiketi zorunlu onay kutusu; açıklama deterministik (Claude kullanımı yok); otomatik yeniden gönderim yok. Bağımsız inceleme: 4 blocking + 7 important işlendi | `plans/2026-10-08-m6-publish.md` |
| 2026-10-08 | M7 planı | 13 görev; `npm test` için şablon veritabanı + paralel dosyalar (sondaj: 332 → 147 sn), M5c H18 gereği e2e `npm test`'te kalır; yedek sahip rolüyle ve sürüm denetimli `pg_dump` (konak 16, sunucu 17); blob silme yalnızca onaylı, 7 gün çöp kutusu; güvenli alan tek ayar + elle kalibrasyon kartı; 3D varlık türü kapsam dışı. Bağımsız inceleme: 3 blocking + 11 important işlendi | `plans/2026-10-08-m7-hardening.md` |
| 2026-10-08 | M7 uygulama (bulut konteyneri, GPU'suz, Fake sürücüler) | T1–T12 + T13 dokümanları; `npm test` 462 → 504, ~175–195 sn paralel; smoke 21/15 → 24/16; gerçek denetimler makine listesinde | `docs/m7/m7-summary.md`, ledger `.superpowers/sdd/2026-10-08-m7-hardening/progress.md` |
| 2026-10-08 | M7 T1: paralel testler + şablon veritabanı; M5c H18 korundu | Dosyalar paralel işçilerde, her biri migration'lı şablondan kopyalanan kendi DB'sinde; e2e `npm test`'te kalır (M6 T3'ün "ağır testi taşı" notu geçersiz) | ledger T1 |
| 2026-10-08 | M7 T6: yedek sahip rolüyle, sürüm denetimli `pg_dump`, docker'a düşüş | Uygulama rolü `drizzle` şemasını okuyamaz; konak `pg_dump` sunucuyla aynı ana sürümde değilse `docker exec`; `VG_PG_DUMP` geçersiz kılması denetlenmez; geri yükleme yalnızca var olmayan bir DB'ye | ledger T6, spec §11.3 notu |
| 2026-10-08 | M7 T7: blob başına kilit + çöp kutusu | Ayrı ad alanında advisory kilit (`putBlob` paylaşımlı, silme/geri getirme özel); silinen dosya 7 gün `trash/<gün>/`'de, `restore-blob` ile geri; referans taraması `audit_log.data` hariç | ledger T7, spec §11.3 notu |
| 2026-10-08 | M7 T11: tam URL ile WebFetch, şablon `fix_hint` | `reviewer_facts` WebFetch'i yalnızca hedef URL'lerine (ayrıştırılmış karşılaştırma; `webAllow` yoksa boş liste); ipucu kontrol etiketi + rubrik sorusundan | ledger T11 |
| 2026-10-08 | M7 T12: pencereli iz, asimetrik pencere | 200 satır üstünde 0,25 ekran geride / 2,75 ekran ileride; simetrik ± 1 ekran S8'de düştü; 16,8 ms bütçesi gevşetilmedi. S8(b) bu VM'de yaklaşık bir kareyle geçiyor: makinede yeniden ölçülür | ledger T12, spec §12.4 notu |
| 2026-10-08 | M7 T13: makine listesinde B ve C gerçek kurulumda | Geçici veritabanı yerine `~/videogen-data` + `videogen` (C'nin taslağı B'nin videosunu gönderir, token veri dizinine taşınır); öncesinde yedek (A.7); güvenli alan kalibrasyonu A.8, B'den önce | `docs/machine-checklist.md` |
| 2026-10-08 | M7 kapsam: 3D varlık türü | Kapsam dışı (tüketicisi yok); defter müzik, SFX, ses örneği | M7 planı self-review, T5 |
| 2026-10-07 | M5b F11/F12/F14: kapsamı adım hesaplar; build ajansız; regresyon ve salınım yalnız izlenen kontrollerde | Plandaki gibi; ek: compose kapsamında `label_in` olayları güncel storyboard'dan türetilir (T2 Critical) | spec §7.2 notu, ledger T2/T4 |
| 2026-10-07 | M5b F16: M10 reddedildi; F21: `rötuş` uçtan uca testi `test:render`'a taşındı (`npm test` 6,8 → 5,9 dk) | `npm test` 399 (plan 400), `test:render` Blender'sız 6 | ledger T9 |
| 2026-10-07 | M5b T9 bulgusu: müziksiz ürün D6'da düşer, fixer ses spec'i yazamaz → `needs_human` | Bilinçli sınır; çözüm izinli müzik ya da M5c `AudioPlan` | `m5b-summary` §9–§10 |
| 2026-10-07 | 🚦 K17 (TTS/ses kararı), K19, müzik kürasyonu, D6 alt puanları | Açık (K17 ve K19 değişmedi) | `docs/m1/decision.md`, `m5b-summary` §4 |
