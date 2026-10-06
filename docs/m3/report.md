# M3 Canlı Agent Katmanı Raporu

| | |
|---|---|
| Tarih | 2026-10-06 |
| Dallar | `m3a-agent-runtime` (main `dba7ff4`'ten; 11 görev) → `m3b-live-ui` (m3a üstünde; 7 görev) |
| Durum | Tamamlandı. `npm run typecheck` temiz, `npm test` **171/171**, `npm run test:smoke` **7 geçti + 3 atlandı** (ekran testleri, yalnızca `VG_SCREENSHOTS=1`), ~38 sn, ardışık 3 koşu kararlı. Tek gerçek haiku uçtan uca doğrulaması geçti. Son review: "With fixes" → 4 Important düzeltildi. Spec kararı (§4) değişmedi |
| Kanıt kaynakları | `.superpowers/sdd/2026-10-06-m3a-agent-runtime/progress.md` ve `…/2026-10-06-m3b-live-ui/progress.md` (yürütme defterleri, git-ignored), `docs/m3/real-check.md`, `docs/m3/*.png`, `tests/smoke/` |

Bu rapor, M3'ün (Claude agent'larının platform içinde canlı, izlenebilir ve durdurulabilir çalışması) neyi kanıtladığını ve nerede sınırlı kaldığını anlatır.

## 1. Özet

- **Çıkış ölçütü (roadmap): S3, S4, S5 (kısmi) — geçti.** S3 canlılık: sessiz ama CPU'su olan oturum "son olay N sn önce · süreç canlı", CPU 0'a inince "Takılmış olabilir" + "Durdur" → `cancelled`. S4: API SIGKILL → "yeniden bağlanıyor" şeridi → yeniden bağlanma; tarayıcının aldığı `ui` kimlikleri boşluksuz ve sonuncusu sunucunun en büyüğü; worker ölümü → "Worker yanıt vermiyor" → geri gelince "Worker canlı". S5 (kısmi): chat mesajı → Search izi canlı → "Web'de arandı, 9 kaynak" → yanıt; aynı karede iki Enter tek mesaj; ikinci tur Coding izi (`notes.txt`, `+3`). v2 ve Karşılaştır M4'te.
- **Checklist M3: 10/10 madde işaretli** (sürücü, roller, MCP, koruma, tablolar, kartlar, ThinkingState, chat paneli, kullanım muhafızı, smoke).
- **Gerçek doğrulama:** M3 boyunca 7 gerçek Claude oturumu, hepsi haiku: plan öncesi sondaj 2, M3a T6 4, M3b T7 1 (`docs/m3/real-check.md`). Ücretli anahtar yok, `apiKeySource: none`.
- **Yeni bulgular (spec'e işlendi):** streaming-input'ta `interrupt()` oturumu bitirmez (§6.4); `result.text` yalnızca turun son metin bloğudur (§13.2, §18); arka plan alt ajanlı turun bitiş kuralı (§18); Playwright `webServer` `gracefulShutdown` verilmezse süreç grubunu SIGKILL'ler (M2 smoke temizliğinin kök nedeni, §16.2).

## 2. Görevler

Her görev tek commit; düzeltmeler `--fixup` ile ilgili commit'e katlandı (autosquash öncesi ve sonrası ağaç aynı: `ee8d79d`).

**M3a — agent çalışma katmanı**

| Görev | Commit | Test (plan → gerçek, suite) | Not |
|---|---|---|---|
| T1 `@videogen/claude`, sürücü arayüzü, `FakeClaudeDriver`, tur takibi | `4a0ff5c` | 60 → 60 | Fake'in uyku/iptal davranışı düzeltildi; sonradan gerçek CLI'ın iptal davranışını taklit eder |
| T2 Akış → iz eşleyicisi (`TraceMapper`) | `9cbe402` | 68 → 68 | Canlı/geçmiş satırlar aynı, sıra alt ajanlarda farklı olabilir (id ile karşılaştırma) |
| T3 Roller, rol istemleri, `PreToolUse` koruması | `5149058` | 80 → 80 | Son review: Grep/Glob arama kökü + gizli dosya listesi (+1 test) |
| T4 Migration 0003, `ui_events` sırası DB'de, depo fonksiyonları | `cab01a1` | 88 → 88 | Dev DB 0003'e taşındı |
| T5 `videogen` MCP araçları, sürümlü spec deposu, içerik adresli depo | `73e50ea` | 95 → 95 | |
| T6 `SdkClaudeDriver`, süreç grubu, elle gerçek doğrulama | `ad23a5c` | 100 → 100 | Gerçek koşu 4 haiku oturumu; iptal bulgusu |
| T7 `SessionRunner` | `846b123` | 107 → 108 | İptal sırasındaki `result` tur sayılmaz (+1 test); son review: `\u0000` (+1 test) |
| T8 `SessionManager` | `58bfe77` | 117 → 118 | Test sıralama hataları düzeltildi; 3 test yarışı (yalnızca test) düzeltildi |
| T9 Kullanım muhafızı | `a1bea90` | 123 → 124 | |
| T10 Worker kablolaması: `ChatService`, komutlar, açılış kurtarma | `afb28a2` | 132 → 133 | Fake kipte elle worker smoke |
| T11 API uçları, adlandırılmış SSE heartbeat, `x-vg-event-id` | `b8de497` | 140 → 142 | Planın test sayımı 1 eksikti; smoke S1 3/3 |
| Checklist | `f8f175e` | — | |

**M3b — canlı arayüz, smoke, taş sonu**

| Görev | Commit | Test (plan → gerçek, suite) | Not |
|---|---|---|---|
| T1 10 Hz canlı katman, yarı açık akış izleme köpeği, olay kimliğiyle sürümlenen depolar | `22e8db9` | 152 → 152 | |
| T2 Canlı ThinkingState + iz görünüm modeli | `49c0bbb` | 158 → 158 | Başlık düğmesine erişilebilir ad (T5'te bulundu); `withoutAnswer` (T7 gerçek bulgu, +1 test) |
| T3 Smoke yığını sertleştirme | `664b82a` | 158 → 158 | Elle denetim/temizlik doğrulaması |
| T4 Agent kartları | `1963d8e` | 160 → 160 | `docs/m3/agents.png` |
| T5 Chat paneli, mod çipleri, rol ayarları, muhafız çipi, migration 0004 | `9089088` | 166 → 166 | Son review: bayat muhafız durumu ve boşta kapanma penceresi (+2 test) |
| T6 Smoke S3/S4/S5 | `21952bb` | 166 → 166 (smoke 7) | RED kanıtı 4 geçici mutasyonla; S5 çift Enter testi güçlendirildi |
| T7 Taş sonu | bu commit | 166 → **171** | +1 gerçek bulgu, +4 review düzeltmesi |

## 3. Test sonuçları

```
$ npm run typecheck   → çıkış 0
$ npm test
 Test Files  30 passed (30)
      Tests  171 passed (171)
$ npm run test:smoke
  ✓ S1: shell boots under 2 s and shows Claude connection, usage and worker liveness
  ✓ S1: non-localhost Host is rejected on reads and on the event stream
  ✓ S1: audit chain is valid after boot
  ✓ S3: a silent session reads "süreç canlı", then "takılmış olabilir"; Durdur cancels it (8,1 sn)
  ✓ S4: API restart → "yeniden bağlanıyor" → reconnect replays every missed event, ids without gaps (8,6 sn)
  ✓ S4: a dead worker shows "Worker yanıt vermiyor" and recovers when restarted (10,5 sn)
  ✓ S5 (kısmi): a chat message streams a Search trace that settles into an answer; a second turn streams Coding rows (5,3 sn)
  3 skipped
  7 passed (38.0s)
$ ls /tmp/videogen-smoke → yok;  videogen_smoke DB sayısı → 0;  5173/5180/5190 → boş
```

**Smoke RED kanıtı (geçici mutasyonlar, commit edilmedi):** `stuck: false` → S3 düştü ("Takılmış olabilir" yok). SSE replay döngüsü kapatıldı → S4 düştü ("gap after 5: expected 6, received 16"). Footer heartbeat yaşını yok saydı → S4b düştü. ChatPanel gönderim kilidi kaldırıldı → planın S5'i **geçti** (iki ayrı `press('Enter')` arasında ilk gönderim kutuyu temizliyordu). Test, iki keydown'u aynı görevde dağıtacak şekilde değiştirildi → düştü ("expected 1, received 2").

## 4. Varsayımlar

| Varsayım | Sonuç | Kanıt | Spec'e etkisi |
|---|---|---|---|
| In-process MCP (`createSdkMcpServer`) gömülü CLI'da ayrı süreç olmadan çalışır | Doğrulandı | Sondaj `spikes/m3/probe.mjs`; M3a T6: `videogen` `connected`, araçlar `mcp__videogen__*`, `report_progress` 40 kaydedildi | §18 satırı eklendi |
| `sessionId` ile oturum kimliği verilebilir, `resume` ile boşta kapanan chat sürer | Doğrulandı | Sondaj (`sessionId`, `resume`, streaming 2. tur); T7 gerçek chat turu | §18 satırı eklendi |
| `PreToolUse` Bash ve NotebookEdit vektörlerini de kapatır | Doğrulandı | Guard birim testleri (izinli okuma komutları, zincirleme/boru/yönlendirme/ikame/glob yasağı, `notebook_path`, `..` ve symlink); gerçek koşuda ağır Bash reddedildi, gerekçe MCP aracını gösterdi. Son review'la Grep/Glob arama kökü de sınırlandı | §18 güncellendi |
| Streaming-input'ta `interrupt()` oturumu bitirir | **Çürütüldü (yeni bulgu)** | Gerçek CLI: `result{error_during_execution, aborted_streaming}` gelir, CLI girdi bekler; iterator ancak `endInput` sonrası fırlatır (4,7 sn; interrupt'tan ~0,7 sn sonra). Runner iptal sırasında gelen `result`'ta girişi hemen kapatır, turu tamamlanmış saymaz; chat iptali < 1 sn | §6.4'e eklendi |
| Arka plana alınmış alt ajanlı turda tek `result` gelir | Çürütüldü (M0) → kural | Tur bitişi = arka plan görev kümesi boş **ve** `result` sayısı ≥ 1 + arka plana alınmış görevlerin `task_notification` sayısı (`subagent.ndjson`'da küme ilk `result`'tan önce boşalıyor) | §18 satırı güncellendi |
| `ui_events` sırası uygulama kodunda korunur | DB'de zorlandı | `vg_publish_event` (SECURITY DEFINER + advisory xact lock), uygulama rolünde `INSERT` yok; S4 boşluksuz kimlik doğrular | — (M2 devri kapandı) |
| Playwright smoke temizliği çalışıyor | **Çürütüldü (M2 kök nedeni)** | `gracefulShutdown` verilmezse `webServer` süreç grubu doğrudan SIGKILL'lenir; `stack.mjs` temizliği hiç çalışmıyordu. `gracefulShutdown: SIGTERM` ile her koşu DB'yi ve dizini siliyor | §16.2 izolasyon satırları güncellendi |
| `result.text` turun tüm metnini taşır | **Çürütüldü (T7 gerçek koşu)** | Araçtan önceki metin ayrı `text` satırı; `result` yalnızca son metin bloğu. Arayüz yanıt gelince tüm metin bloklarını gizlediği için ilk cümle kayboluyordu → yalnızca son metin bloğu gizlenir | §13.2 ve §18 |

## 5. Ekran görüntüleri

- `docs/m3/agents.png`: üç kart (takılmış uyarılı reviewer, `▸ Düzenle … +1 −1` builder, tamamlanmış ve izi açık araştırmacı). Fake'e özgü not: builder satırındaki mutlak yol fixture'ın kayıtlı cwd'sidir (`/home/user/…`, redakte yer tutucu); gerçek oturumda yol run klasörüne göreli görünür.
- `docs/m3/chat-live.png`: ikinci turda canlı Coding bloğu ("Araç çalıştırıyor", `Yaz` dönüyor).
- `docs/m3/chat.png`: tamamlanmış iki tur; Coding bloğu açık (`Yaz +3 −0`, `Düzenle +1 −1`), yanıt metni.
- `docs/m3/settings-roles.png`: Ayarlar → "Agent rolleri", 10 rol, model ve düşünme düzeyi seçicileri.
- `docs/m3/real-chat.png`: gerçek haiku turu (düzeltme sonrası): tanıtım cümlesi → `get_context` → yanıt.

## 6. Plandan sapmalar (iki defterin `Ruling:` satırları)

**M3a**

| Görev | Karar | Neden | Yanlışsa maliyeti |
|---|---|---|---|
| T1 | Fake `sleep`, tüketici mesajı tutarken gelen interrupt/kill'de hemen döner | Test 60 sn uyuyup zaman aşımına düşüyordu | Yok (yalnızca Fake) |
| T2 | Canlı/geçmiş eşdeğerliği satır kimliğiyle karşılaştırılır | Alt ajanlı fixture'larda canlı ve geçmiş sıra farklı | Yeniden yüklemede alt ajan satırı kardeşinin önüne/arkasına düşebilir; arayüz `parentToolUseId` ile iç içe gösterir |
| T6 | `ToolResult` interface → type alias | SDK `CallToolResult` index imzası (TS2345) | Yok |
| T6 | sdk-driver testi seçenekleri `mcpServers` olmadan serileştirir | SDK MCP örneği döngüsel | Yok |
| T6 | Gerçek kontrol istemi ffmpeg denemesini zorlar | İlk koşuda haiku Bash'i hiç denemedi, koruma sınanmadı | Yok |
| T6 | (Spec gerçeği) streaming-input interrupt oturumu bitirmez; Fake buna göre güncellendi, runner kuralı T7'ye | Gerçek koşu | Chat, `interrupted` öncesi boş yanıtla `done` olurdu |
| T7 | Test + runner kuralı: iptal sırasında gelen `result` → `endInput`, `onTurnComplete` yok | Mutasyonla kanıtlandı (kural yokken 5017 ms > 1000) | Yok |
| T8 | Plan testlerindeki iki sıra hatası (eşzamanlı `start()`, `once('exit')` geç bağlanıyor) düzeltildi; ürün kodu aynı | Testlerin kendisi yanlıştı; 3 ardışık yeşil, artık süreç yok | Yok |
| T11 | Plan `agents.test.ts`'i 6 test saymış, 7 var (suite 142, plan 140) | Sayım hatası | Yok |

**M3b**

| Görev | Karar | Neden | Yanlışsa maliyeti |
|---|---|---|---|
| T2 | M3a manager testi "chat: idle…" penceresi 400 → 2000 ms (fixup → M3a T8) | Tam suite yükünde DB yoklaması 400 ms'lik `idle` penceresini kaçırıyordu; 30 ms ile birebir yeniden üretildi | Test +~2 sn |
| T4 | Ekran yolları `import.meta.dirname`'e bağlandı | Planın `'../../docs/m3/*.png'`'si cwd'ye göre çözülüp `~/docs/m3/`'e yazdı; o dizin (yalnızca bu png) silindi | Yok |
| T4 | Builder stall 120 → 194. satır, çekim öncesi 600 ms | 120 coding fixture'ının düşünme aşamasındaydı (`▸` satırı yoktu) | Yok (yalnızca ekran) |
| T5 | ThinkingState başlığına `aria-labelledby` (fixup → T2) | `role=status` içerikten ad vermiyor; ekran testi 60 sn'de düştü (RED) → 4,3 sn (GREEN) | Yok (a11y iyileşmesi) |
| T5 | Chat ekranı ikinci yanıt + 600 ms bekler; ekranlar `shot()` kullanır | İlk çekim açılma geçişinin ortasındaydı | Yok |
| T5 | İki M3a manager test yarışı (`ended` ve `outs` DB'den sonra okunuyordu), geçici 300 ms gecikmeyle birebir üretildi (fixup → M3a T8); ürün kodu aynı | Tam suite'te 165/166 | Yok |
| T6 | S5 çift Enter: iki keydown tek görevde + yalnızca boşluk kontrolü | Planın testi kilit mutasyonunu yakalamıyordu | Yok |
| T7 | (Gerçek bulgu) `withoutAnswer`: yalnızca son metin bloğu izden düşer; `TraceView` `showText` → `answered` (fixup → T2, T5) | Gerçek turda ilk cümle kayboluyordu | Yok |
| T7 | I3 düzeltmesi M3a T8 yerine M3b T5'e katlandı | Düzeltme T5'teki `number \| null` sözleşmesine dayanıyor; T8'e katlamak çakıştı ve T8'de tutarsız test bırakırdı | M3a dalı tek başına boşta kapanma penceresi düzeltmesini içermez (M3b birleştirmesi hemen ardından gelir) |
| Son review | I5 (DB sıfırlamasında depolar sıfırlanmıyor) Important → Minor | Yalnızca DB tarayıcı açıkken yeniden yaratılınca; sayfa yenilemesi düzeltir; veri kaybı yok | Geliştirici DB sıfırlamasından sonra yenileyene kadar donmuş kart görür |
| Son review | Reviewer'ın "Declined to judge" listesi (10 madde) olduğu gibi kalır | Hepsi plan/spec'te M4/M7'ye bırakılmış ya da spec'in istediği yerel kullanıcı verisi | İlgili madde M4/M7'de geri gelir |

## 7. Son review

Tek bağımsız reviewer (general-purpose alt ajan, **Claude Fable 5.1** — en yetenekli model, açıkça belirtildi), aralık `dba7ff4..751a620` (M3a + M3b), girdi: iki plan, spec, iki planın Review Focus bölümleri, iki defterin `Ruling:` satırları. Sonuç: **With fixes** — Critical 0, Important 5, Minor 11. Reviewer tüm `Ruling:` satırlarını doğru buldu.

Düzeltilenler (her biri önce başarısız testle):

| # | Bulgu | Test (RED → GREEN) | Düzeltme |
|---|---|---|---|
| I1 | Grep/Glob özyinelemesi gizli dizinlere ulaşıyordu (`path: ~` → `~/.aws`, `~/.ssh`, repo `.env`); M4'te WebFetch'li rollerle sızıntı yolu olurdu | `confines recursive Grep/Glob searches to the run directory…` + kimlik bilgisi testine `.npmrc`, `.pypirc`, kabuk geçmişi, cargo | Arama kökü (`path` + Glob'un sabit kalıp öneki) run klasörü ya da `~/.claude/skills` içinde olmalı; `SECRET_FILE` genişledi |
| I2 | Worker yeniden başlayınca bayat `usage.guard` kaydı → footer'da kalıcı "Yeni işler bekletiliyor" | `a fresh guard overwrites a stale stored state on its first evaluation…` | İlk değerlendirme her zaman yazar ve yayınlar; audit yalnızca geçişte |
| I3 | Boşta kapanma penceresinde gönderilen chat mesajı kapanan sürece gidip "Yanıt alınamadı" oluyordu | `a chat message in the idle-close window is not handed to the closing process…` | `inputEnded` (boşta kapanma ve iptal); `sendChat` `null` → ChatService `resume` ile yeni süreç |
| I4 | Araç çağrısı/sonucundaki `\u0000` (ikili dosya `cat`'i) `jsonb`'ye girmiyordu: olay kaybı, aynı flush'taki sonraki satırların ve aracın audit satırının kaybı | `a NUL character in a tool call or result…` | NUL → U+FFFD (olaylar ve satırlar tek yerde), satır başına hataya dayanıklı flush |

**Ertelenen minorlar:**
1. DB sıfırlamasında depolar sıfırlanmıyor (I5'ten indirildi): `live.ts` sıfırlamayı algılıyor; depolar temizlenmeli.
2. Spec §12.4 ifadesi: ThinkingState başlığı dışında 4 sonsuz animasyon var (aktif nokta, akış imleci, adım/araç dönen göstergeleri). Hepsi transform/opacity, boşta durur, reduced-motion'da kapanır. **Kullanıcı kararı:** spec "çalışan işin göstergeleri" diye genişletilsin mi, imleç kaldırılsın mı?
3. `jq -f/--from-file/--rawfile/--slurpfile/-L` run dışındaki bir yolu okuyabiliyor (builder/fixer; hata çıktısı bir satır sızdırır): jq bayrakları izin listesine alınmalı.
4. Ağır komut regex'i ham komutta çalışıyor (`cat notes-ffmpeg.md` yanıltıcı gerekçeyle reddediliyor).
5. `VG_DEV_ENDPOINTS=1` gerçek yığında açık kalırsa dev ucu gerçek oturum açar: `claudeDriver === 'fake'` koşulu da eklenmeli.
6. M3a T10'un elle Fake kontrolü gerçek DB'ye yazdı (gerçek Stüdyo'daki "Araştırmacı · websearch" kartı ve audit satırları; audit silinemez). Runbook'a "elle kontroller geçici DB kullanır" kuralı eklendi.
7. `event-hub` `stop()` pump zincirini beklemeli (yalnızca kapanış günlüğü).
8. `SpecStore.write` eşzamanlılık denetimi yok (iki yazar aynı sürümü üretebilir): `wx` + yeniden deneme.
9. Yeniden bağlanmadan sonra akmakta olan metin satırı, bloğu bitene kadar görünmüyor (stream olayları kalıcı değil).
10. `claude-plugin/agents/summarizer.md` `tools: Read` ile `ROLES.summarizer.tools: []` uyumsuz.
11. Yanıtlar ham markdown olarak görünüyor (M4+ temizlenmiş görüntüleyici).
12. `POST /api/sessions/:id/retry` chat oturumlarını da kabul ediyor (arayüz sunmuyor): chat için 409 dönmeli.

## 8. Bilinen sınırlar

- Gerçek sanal kaydırma yok: iz 200 satırı geçince baştaki satırlar "Önceki N satırı göster" arkasında (M7, S8).
- `queued` / `waiting_limit` oturumları worker yeniden başlarsa `failed` (`worker_restart`) olur; iş kuyruğu ve yeniden kuyruğa alma M4.
- `agent_events` metin alanları 20.000 karakterde, iz satırı metni 4.000 karakterde kırpılır.
- Chat salt okunur: "Düzelt" modu yalnızca değişikliği tarif eder; chat'ten yeni sürüm (K15) M4/M7.
- Fake sürücü yalnızca kayıtlı senaryoları oynatır; gerçek limit reddi (`status: rejected`) akışı Fake ile test edildi, gerçek Claude ile tetiklenmedi.
- §7'deki ertelenen minorlar (özellikle DB sıfırlamasında donan depolar, yeniden bağlanmada akan metin boşluğu, dev ucu + SDK sürücüsü).
- API kapanışında "[event-hub] pump failed … Cannot use a pool after calling end on the pool" günlüğü (olay kaybı yok).
- Fake'te kart/iz satırları fixture'ın kayıtlı mutlak yolunu gösterebilir (yalnızca Fake).
- Önceki koşulardan kalan `/tmp/videogen-smoke-*` dizinleri (M2/M3a dönemi, ~10 adet) silinmedi: ön onay kapsamı dışında, kullanıcıya soruldu.

## 9. M4'e devredilenler

| Madde | Neden M4'te |
|---|---|
| İş kuyruğu (`jobs`, kira, yeniden kuyruğa alma) ve `waiting_limit` oturumlarının yeniden başlatmada korunması | Pipeline adımları M4'te geliyor |
| Chat'ten yeni sürüm (v2), Karşılaştır sekmesi, video bağlamı çipi (S5'in kalanı) | `versions` tablosu ve player M4'te |
| Kalan `videogen` MCP araçları (`build_scene`, `render_draft`, `extract_frames`, `run_qc`, `tts_synthesize`…) ve şema içerikleri | Koruma gerekçeleri bu adları zaten gösteriyor |
| Video başına kullanım ölçümü (§18) | İlk gerçek ürün M4'te |
| Yanıtlarda temizlenmiş markdown görüntüleme | Yeni bağımlılık gerektirir |
| §7 ertelenen minorların güvenlikle ilgili olanları (jq bayrakları, dev ucu koşulu, `SpecStore` eşzamanlılığı) | WebFetch'li roller ve eşzamanlı yazarlar M4'te devreye giriyor |
| Kısayolların kalanı (Space, J/K/L, N, `?`) | Player ve üretim M4'te |

## 10. Kullanım

- **Gerçek Claude oturumları (ürün yoluyla):** 7, hepsi haiku: plan öncesi sondaj 2, M3a T6 4 (ilk deneme dahil), M3b T7 1 (32.532 token, 2 tur, liste fiyatıyla eşdeğer 0,036 $; abonelikten düşer).
- **5 saatlik pencere:** M3b T7 sırasında `get_usage` %9–10, 7 günlük %24–25. Orkestrasyon oturumu ve son review alt ajanı aynı abonelik havuzunu paylaşır; ayrıştırılamaz. M2'deki ~%75'e göre pencere düşük kaldı.
- Ürün kodunun kendisi (worker'ın `get_usage` yoklaması) sıfır token harcar; smoke tamamen Fake sürücüyle çalışır.

## 11. Kullanım kılavuzu (kısa)

- `npm start` → Stüdyo: sol panelde agent kartları (aktif + son 6), sağda chat (Soru / Analiz et / Düzelt; Enter gönderir, `/` odaklar, "Durdur" interrupt). Ayarlar → "Agent rolleri" ile rol başına model ve düşünme düzeyi.
- Claude'suz geliştirme: `VG_CLAUDE_DRIVER=fake VG_DEV_ENDPOINTS=1` + `POST /api/dev/sessions` (runbook §6).
- Testler: `npm run typecheck && npm test && npm run test:smoke`; ekranlar `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens`.
