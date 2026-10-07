# M5b — İnceleme ve düzeltme döngüsü, `finalize`, "Yayına hazır": özet

| | |
|---|---|
| Tarih | 2026-10-07 |
| Dal | `claude/elegant-keller-bgsue7` (M5a'nın `2bd3f7a` noktasından sonra 11 commit); kullanıcı kararıyla `main` bu dala **fast-forward** edildi (PR yok) |
| Plan | `docs/superpowers/plans/2026-10-07-m5b-review-fix.md` (12 görev). T1–T11 uygulandı (her görev: taze uygulayıcı alt ajan + spec uyumu ve kod kalitesi review'u); T12 kısmi |
| Ortam | Bulut konteyneri: GPU, Blender ve gerçek Claude yok. Node 24.21, ffmpeg 7.0.2 (ffprobe 6.1.1), Postgres 16 (5433). Alt ajanlar **sonnet**'le koştu (kullanıcı: Fable ve opus alt ajan yok) |
| Durum | Seslendirmesiz bir ürün Fake sürücülerle "Yayına hazır" olabiliyor ya da gerekçeli `insan gerekli`de kalıyor. **Bekleyen:** kalem pilotu kalibrasyonu, `test:blender`, Blender final int testi, gerçek "tükenmez kalem" koşusu (müzikli) ve gerçek reviewer isabeti (`docs/m5/real-check.md`, "M5b bekleyenleri") |
| Kanıt | Bu dosya, `docs/m5/studio-review.png`, `docs/m5/library-score.png`, `.superpowers/sdd/2026-10-07-m5b-review-fix/progress.md` (ledger), git geçmişi |

## 1. Ne çalışıyor

M5a'nın `qc`'de biten planına iki adım eklendi (seslendirmesiz plan 8 → 10 adım):
- **`review`** (`apps/worker/src/pipeline/review-step.ts`): Üç reviewer (görsel, doğruluk, izlenme) paralel ve izole oturumlarda müzikli finali inceler. Üç oturum başlamadan önce kullanım kapısına bakılır (kapalıysa adım `waiting_limit`, açılınca üçü birlikte başlar). Reviewer yalnızca kimliği sabit kontrolleri puanlar (`{pass, score 0–1, evidence, fix_hint}`); boyut puanı, kapılar ve K13 kararı saf fonksiyonlardır (`packages/shared/src/final-review.ts`). Sınırda (78–82) ikinci, bağımsız görsel review koşar ve skorlar ortalanır. Önce bayatlık denetlenir (LLM bütçesi harcanmaz).
- **Karar:** `ready` (altı kapı geçti, toplam ≥ 80, her boyut ≥ %60) · `fix` · `rework` (< 70). AUTO kapısı (qc) düşmüşse LLM çalışmaz, tur özeti kaydedilir ("Otomatik kontrol geçmedi: …. İnceleme düzeltmeye gönderecek.") ve fixer qc bulgularıyla başlar.
- **Fixer** `review` adımının içinde koşar (yeni `StepKey` yok): başarısız kontrollerin kimlik, kanıt ve ipucunu alır; opus/high (görsel ya da anlatı kategorisi) ya da sonnet/high (yalnızca `factual`/`technical`). **Kapsamı adım hesaplar** (`fixScope`): storyboard alanı ya da parça etiketi → `compose → qc → review` (final kareler yeniden kullanılır); sahne render alanı ya da `product.py` → `build → … → review` (build ajansız); puan < 70 → `storyboard → … → review`. Fixer'ın beyanı yalnızca iddiadır; hesaplanan kazanır.
- **Döngü:** `steps.fix_round` ayrı sayaç (≤ 3), taslak `round`'una dokunmaz; her tur yeni bir `versions` satırı. Durma nedenleri: tur sınırı, salınım (izlenen kontrolde F→P→F), değişmeyen düzeltme, kullanım sınırı, fixer yok. Regresyon yalnızca izlenen kontrollerde.
- **`finalize`** (`finalize-step.ts`): en iyi sürümü seçer (`pickBest`), `best_version_id`'yi yazar, final kareleri siler. `ready` → "Yayına hazır · 87,5 puan" (tur > 0 ise sonuna " · düzeltme turu k/3"); değilse gerekçeli `needs_human`.
- **Kayıt:** migration `0008_review_fix` (`steps.fix_round`, `reviews`, `findings`); replay için `final_review_*`, `final_verdict`, `fix_report` artefaktları; audit `review.recorded`, `review.verdict`, `fix.scope`, `loop.stop`, `version.created`.
- **Arayüz:** Stüdyo'da `region "İnceleme"` (`review-panel`): toplam puan, 9 boyut çubuğu (%60 işareti), 6 kapı rozeti, kontakt sayfası, "Otomatik kontrol" kartı ve üç reviewer kartı; bulgular zaman kodu + tıklayınca Final oynatıcıyı o ana sarar; başlıkta "Düzeltme turu k/3 · %N"; durum "yayına hazır"; kütüphane satırında puan ("yayına hazır · 87,5 puan"). Reviewer'a builder/fixer metni verilmez; güvenilmeyen veri çitli (`fenced`).
- **Araçlar:** `run_qc` MCP aracı (kayıtlı `qc_report`'u döner, yeniden ölçmez), reviewer başına kare bütçesi (rol + tur + sıra; 12 + 12 + 8), fixer'a sahne araçları, istek başına model (`StartRequest.model`).
- M5a devirleri: M9 (64/32 örnek karışımı notu + audit `render.final_mixed_samples`), içe aktarılan SFX'in ses planına girmesi (`matchSfx`), kare temizliğinin `finalize`'a taşınması. M10 (`failed` run'da karelerin silinmesi) **reddedildi**: v1'de `failed` run sürdürülemez, spec §7.6 dört terminal durumda da siler.

## 2. Görevler

| # | Görev | Commit | `npm test` (plan → gerçek) |
|---|---|---|---|
| T1 | `final@1` review sözleşmesi, deterministik puan, K13 kararı | `7b469c4` | 361 → 361 |
| T2 | Döngü mantığı: `FixReport`, `fixScope`, regresyon/salınım, `loopAction`, `pickBest` | `8792795` | 365 → 365 |
| T3 | Migration 0008, DB: `fix_round`, `reviews`, `findings`, final rewind, sürümler, puan | `90c437b` | 369 → 369 |
| T4 | Pipeline altyapısı: final rewind, bağlam, qc'nin M5b kararı, etiketten bağımsız final hash'i, M9, SFX | `9d90062` | 373 → 373 |
| T5 | MCP ve oturum katmanı: `run_qc`, final `extract_frames`, istek başına model | `bedf7ea` | 377 → 377 |
| T6 | Reviewer girdileri, istemler, Fake reviewer ve fixer | `79c30ea` | 380 → 380 |
| T7 | `review` adımı: panel, toplam, ikinci görsel, kayıt, döngü eylemi | `cbe5a68` | 387 → 387 |
| T8 | Fixer ve kapsamlar, ajansız build turu | `3b515a9` | 394 → 394 |
| T9 | `finalize`, plan, uçtan uca | `bf1b284` | 397 → **396** (§7, F21) |
| T10 | API ve Stüdyo: inceleme paneli, tur satırı, kütüphane puanı | `df191f3` | 400 → **399** |
| T11 | Smoke S2 tam sürüm ve M5b ekranları | `19d5cc7` | 400 → 399 · smoke 19 / 13 |
| T12 | Kapanış (kısmi), dokümanlar | bu dosya | — |

**Sayı zinciri (`npm test`):** 355 (M5a) → T1 361 → T2 365 → T3 369 → T4 373 → T5 377 → T6 380 → T7 387 → T8 394 → T9 396 (planda 397; `rötuş` uçtan uca testi `test:render`'a taşındı, F21) → T10 **399** (planda 400). Smoke 19 / 11 → 19 / 13 (iki M5b ekran testi `VG_SCREENSHOTS=1` olmadan atlanır). `test:render` Blender'sız 5 → **6** (taşınan `rötuş` uçtan uca testi). `test:blender` değişmedi (19, koşulmadı).

## 3. Doğrulama (bu ortamda)

T12 Step 1 (tam doğrulama komutu) kullanıcının isteğiyle **ayrı bir adım olarak koşulmadı**; kanıt görev başınadır:
- `npm run typecheck` temiz; `npm test` **399 geçti** (~5,9 dk).
- `npm run test:smoke` **19 geçti / 13 atlandı** (4,3 dk; tahmin 4,3 dk tuttu).
- M5b ekran testleri (`VG_SCREENSHOTS=1 … screens`, `-g M5b`): **2 geçti** (`docs/m5/studio-review.png`, `docs/m5/library-score.png`).
- `test:render` bir paket olarak yeniden koşulmadı; yalnızca taşınan `rötuş` uçtan uca testi tek başına geçti (~60 sn).
- `test:blender` koşulmadı (Blender/GPU yok).

## 4. Kalem pilotu kalibrasyonu ve D6 alt puanları

**Bekliyor.** Gerçek pilot dosyası ve GPU bu ortamda yok; `docs/m5/real-check.md` §1 komutu ve "M5b bekleyenleri" GPU'lu makinede koşacak. Rubrik `final@1` olarak kaldı; eşik ya da puan değişikliği yapılmadı (`final@2` gerekmedi, kanıt yok).

**D6 alt puanlarının (E3) gerçek pilot ve gerçek ürün ölçümleriyle karşılaştırması bekliyor**: gerçek ürün müzikli koşusu ve pilot ölçümü gerekir. Elde yalnızca sentetik kanıt var: pilot benzeri klipte 7/7 (M5a) ve fake uçtan uca testlerde müzik yatağıyla D6 12/12. Müziksiz karışımın (yalnız SFX) D6'da düştüğü ölçüldü (79,5 → 87,5 farkı, §9). Puan dağılımı (F5: LLM 83 + D6 12 + D7 5) türetilmiştir; gerçek koşudan sonra gözden geçirilmeli (§8.4).

## 5. Gerçek ürün, video başına kullanım ve reviewer isabeti

Koşulmadı (GPU + Blender + gerçek Claude gerekir). Tarif, kapılar ve kayıt tablosu `docs/m5/real-check.md` "M5b bekleyenleri". Açık kalanlar: video başına kullanım (M4 ve M5a'dan beri), reviewer isabeti tablosu (bulgular ve göz incelemesi kontrol kontrol), `reviewer_facts`'in gerçek WebFetch/WebSearch yolu (40 tur yeter mi), opus fixer'ın 5 sa payına etkisi.

## 6. Ekranlar

`docs/m5/studio-review.png` (toplam 87,5, 9 teal çubuk ve %60 işareti, 6 kapı rozeti, kontakt sayfası, "Otomatik kontrol" kartı ve üç reviewer kartı), `docs/m5/library-score.png` (satırda "yayına hazır · 87,5 puan"). Planlanan gerçek koşu görselleri `docs/m5/real-review-sheet.png` ve `docs/m5/real-studio-m5b.png` GPU'lu makinede alınacak.

## 7. Sapmalar (ledger `Ruling:` satırları, özet)

- **Süreç:** dal adı oturumun dalı; `superpowers:subagent-driven-development` kurulu değil → aynı disiplin elle (görev başına taze uygulayıcı + iki review alt ajanı, düzeltmeler görevin tek commit'inden önce; fixup/autosquash yok, force-push yok). Alt ajanlar sonnet (T12 Step 4'ün opus'u dahil). T2'de uygulayıcı kodu testten önce yazdı; review'cuların mutasyon testi örtülmemiş davranışı buldu, testlerle kapandı.
- **F21 (test süresi):** T9'da `npm test` 6,8 dk > 6 dk eşiği → `rötuş` uçtan uca testi `test:render`'a taşındı (`apps/worker/test-render/retouch.int.test.ts`, ortak yardımcı `apps/worker/test/e2e-helpers.ts`; ~60 sn). `npm test` 396 (5 dk 52 sn). Sayı zinciri −1 kaydı, `test:render` 5 → 6.
- **T1 puan ayrıntıları:** sözleşme adı `FinalReview` (`Review` taslak şeması olarak kaldı); 0,55 → 61,65 için D7 4 gerekir (qc'de başarısız `d7_bitrate`, temiz qc'de 62,65); "D8 3,2 → 84,3" geçen kontrollerden kurulamaz (en az geçen D8 4,0) → `rehook` 0,4 ve `payoff` 0,3 kanıt/ipucuyla düşer; `finalVerdict`: bilinen toplam < 70 kapı düşse bile `rework`, `null` toplam (AUTO düşüşü) `fix`; `isBorderline` bilinen düşük kapı yoksa 78–82; `formatScore` yarıyı yukarı yuvarlar (61,65 → "61,7").
- **T2/T4 (Critical, F11 öncülü):** Blender `events_manifest` `label_in` olaylarını storyboard vuruşlarından yazıyor ve compose kayıtlı `scene_events`'i `planSfx`'e veriyor → compose kapsamlı bir vuruş zamanı düzeltmesi bayat tik ses işareti bırakırdı. `composeSource` `label_in` olaylarını güncel storyboard'dan türetir (Python `round`'u için `pyRound`, banker yuvarlama); testle sabitlendi. İkinci Important: salınım F,P,P,F dizisini kaçırıyordu → değerlendirilen dizi daraltılır.
- **T2 metinleri:** plan `oscillation` ve `no_fixer` için metin vermedi; uygulayıcı seçti (metinler runbook §7'de). Vuruş `t_start/t_end/parts` yapı projeksiyonunda; araştırma-yalnız değişiklik `none` + `changed ['research']` (fixer adımı reddeder).
- **T3:** `recordReviewRound` tekrar oynatılan tur için bulgu ve `review.recorded` audit yazmaz; rewind testi tek transaction'ı var olmayan sürüm kimliğiyle ve tam geri alımla sabitler.
- **T4:** `prepare` hataları günlüğe yazılır, yok sayılır (orchestrator ve `final_render.prepare`, `cleanupFrames` gibi); `withImportedSfx` yalnızca `soundPlan`'ın `permitted()` denetiminden geçen varlıkları dikkate alır; `removeStaleFrames` yalnızca 16 haneli hex klasörleri siler; `finalize` fix_round'u 0 tutar (final rewind aralığı `compose…review`), `version.created` audit'ini orchestrator yazar.
- **T5:** istenen model takma adı `agent.session.queued` audit'inde `requestedModel` olarak saklanır (oturum satırının `model`'i sürücünün init olayıyla tam kimliğe yazılır); istek başına model `manager.retry()`/otomatik sürdürmeden sağ çıkar; `run_qc` başarısızları müzikli varyantı, sonra " (müziksiz)" etiketli TikTok varyantını listeler; M4c'nin bir mcp-frames iddiası döndü (`allowedTools(reviewer_visual)` artık `run_qc` içerir).
- **T6:** `fenced` `<<<VERI`/`VERI>>>` kaçışını yapar (JSON içinden blok kapatma deliği, daha önce de vardı) ve yaprak modül `fence.ts`'e taşındı; sayısal iddiası kural sağlayan kaynağı olmayan hedef `numeric` web hedefi olmaz, çiftleri örnek havuzuna girer, `numericGaps` deterministik G2 düşüşü verir; `manifestFacts.minLabelDwellS` `number | null`; fake fixer'ın `FixReport.round`'u yeni tur (`ctx.fixRound + 1`).
- **T7:** (a) sınırda ikinci review'dan sonra seq-1 `reviewer_visual` satırının bulguları ortalanmış sonuçtur (geçmiş ve fixer ortalamayı görür), seq-2 satırı ve `final_review_visual{,2}` ham kalır; (b) §8.3 bağımsızlık: `latestStepSession(db, stepId, role?, since?)` + `priorSession` oturum sürdürmeyi mevcut tur sürüm satırından sonra yaratılanlarla sınırlar (yeniden başlatma önceki turun reviewer oturumunu sürdürmez); (c) `fixVersionId(runId, round)` = sha tabanlı uuid, `round` = YENİ tur; stop notu `STOP_NOTE[reason]` + `: N puan`; rework gerekçesi `puan < 70 (61,7): <etiketler>`; sürüm satırı eksikse oturum sürdürülmez.
- **T8:** `fixRound`, `final_verdict`/`fix_report` meta'sında incelenen (eski) turdur, `roundCause(pool, runId, R)` `meta.fixRound === R − 1` okur; storyboard, build ve draft_review hash'leri yalnızca `roundCause`'tan (`fix-round.ts`) beslenir ve ilk geçiş hash'leri eski formülle sabitlendi; `fix_report` kapsam `none` için de yazılır; `persist(..., {latest})` kopya yazmaz; yarı geri alınmış fixer değişikliği başı yeniden kaydeder; `reviewExecutor` T9'da `fixer: runFixer` ile bağlandı (`null` = fixer yok).
- **T9:** finalize durma nedenini önce `loop.stop` audit'inden (yalnız o `usage`/`no_fixer`'ı bilir), sonra artefaktlardan okur; needs_human metni "<STOP_NOTE>: en iyi sürüm tur N (X puan). Açık bulgular: <≤ 5 etiket (+k)>. Videoyu chat'ten sürdürebilirsiniz."; `finish.openFindings` en iyi turun başarısızları (hazır tur d7_bitrate gibi minorlar taşıyabilir, F4); `finish()` run needs_human/failed biterken de `settleBest` çağırır; "düzeltme turu 1/3" finalize notunda doğrulanır (hazır review notu "Yayına hazır: N puan").
- **T9 bulgusu (T12 için):** uçtan uca testler izinli bir müzik yatağı içe aktarır; hiç müzik yokken yalnız SFX karışımı D6'da düşer (sessizlik/loudness; ölçülen 79,5, müzikli 87,5) ve `silent` modda fixer'ın yazabileceği ses spec'i yoktur → döngü `needs_human` ile biter. Müziksiz bir gerçek koşu "yayına hazır"a **ulaşamaz** (§9).
- **T10:** bulgularda `frameSha` yok (tek kareler blob değil): zaman kodu + seek + turun ana kontakt sayfası (spec §13.1 notu); `ArtifactMeta.meta` yalnızca `final_review_sheet` için sunulur; `ReviewRecord`/`FindingRecord` `packages/shared`'a taşındı (tarayıcıya güvenli); seq-2 görsel satır kart olmaz, görsel kart "iki bağımsız inceleme, ortalama" etiketli; rozet metinleri "yayına hazır" (yeşil), "insan gerekli", "düzeltiliyor", "düzeltme gerekli", "başarısız", "durduruldu"; spec review Important: orchestrator satırı bulguları (qc değer/sınır, G2 `claims_verified`) hiçbir yerde görünmüyordu → "Otomatik kontrol" kartı; `panelView(reviews, runId?)` önce run'ı, sonra en yeni turu seçer.
- **T11:** smoke yığınının ffmpeg/ffprobe yolu için ortam (repo dışı): `/usr/local/bin/ffprobe` → `/usr/bin/ffprobe` bağlantısı, `docker compose up` için scratchpad `docker` shim'i, `/opt/vgshim` (nvidia-smi); hazır video ilerleme çubuğu 100 (M5a'nın `needs_human`'ı 99'du, S2a 100 bekler); fake finalin küçük kareleri "Bit hızı 0,0 Mbps / 3–11 Mbps" (D7, minor) bulgusu verir (beklenen, E17).
- **Kullanıcı kararları (T12):** tam doğrulama ayrı adım olarak koşulmadı (§3); gerçek pilot, GPU ve gerçek ürün koşuları bu konteynerde yapılamadı (§4, §5); son bağımsız review atlandı (§8); alt ajanlar sonnet; `main` kullanıcı isteğiyle fast-forward edildi.

## 8. Son review (atlandı, kullanıcı kararı)

Plandaki T12 Step 4 (tek bağımsız opus ajanı, `git diff main...HEAD`, Review Focus, ledger `Ruling:`'leri) **kullanıcının isteğiyle atlandı**; ayrıca "alt ajan opus yok" kararı bu adımı da kapsıyordu. Yerine görev başına iki review (spec uyumu + kod kalitesi) vardı; hepsi ledger'da: Critical'lar (T2'nin `label_in` öncülü) ve Important'lar RED→GREEN düzeltildi, Minor'lar ya uygulandı ya §9'a yazıldı. **Bağımsız son review GPU'lu makinedeki oturumda yapılmalı** (`docs/m5/real-check.md`). Özellikle bakılması gerekenler: fan-out ve fixer yarıda kalırken replay; final rewind transaction'ı ve sürüm satırı sırası; kapsam hesabının kaçırabileceği alanlar; bayatlık; `reviewer_facts` içeriğinden prompt injection yüzeyi (yazma aracı ve Bash yok); kullanım durdurması.

## 9. Ertelenenler

- **Fixer `writeDirs: null` + Bash:** rol tanımı M5b öncesinden kalma; fixer'ın `review/` ya da `final/` altına doğrudan yazması **algılanmaz** (incelenen kanıta müdahale). Kapanış yolu: incelenen kanıtın hash anlık görüntüsü (T8 ledger'ı).
- **Müziksiz ürün "yayına hazır"a ulaşamaz:** izinli müzik yokken yalnız SFX karışımı D6'da düşer; `silent` modda fixer'ın yazabileceği ses spec'i yoktur; döngü `needs_human` ile biter (pipeline hatası değil). Çözüm: izinli bir müzik parçası (`bin/assets.mjs add`) ya da M5c `AudioPlan` (§10).
- **T12 bekleyenleri (GPU'lu makine):** Step 1 tam komutu (`test:blender` 19 dahil), Step 2 pilot kalibrasyonu ve D6 alt puan karşılaştırması, `test:render` suitinin tam koşusu, Blender final int testi, Step 3 gerçek "tükenmez kalem" koşusu (izinli müzikle) ve video başına kullanım, reviewer isabeti tablosu, `docs/m5/real-review-sheet.png` ve `real-studio-m5b.png`, bağımsız son review (§8). Hepsi `docs/m5/real-check.md` "M5b bekleyenleri"nde. `docs/m4/real-check.md` M4c §4 (video başına kullanım) gerçek koşudan sonra doldurulur.
- **Uygulanmayan T1 minörü:** `averageVisual`/`panelScore` savunmacı koruları (şemanın zaten dışladığı girdiler).
- **Kapsam dışı (plan):** M4c ertelenen minorlar (M4, M6, M7, M8) ve M4a/M3 minorları M7'de; `claims` tablosu, `provenance.json`, `claims.json` M6'da; Karşılaştır sekmesi, sürüm geçmişi arayüzü ve kütüphane detayındaki Review'lar sekmesi M7'de; chat'ten "insan gerekli" videoyu sürdürme (`request_rerender`) M7'de (`finalize` notu kullanıcıyı chat'e yönlendirir); fixer'ın araştırmayı (kaynakları) düzeltmesi yok (G2 ekrandaki iddiayla düzeltilir); §8.4 izlenme verisiyle ağırlık ayarı ilk 10 yayından sonra.

## 10. M5c için notlar

- **G4 (klon ses):** M5b'de G4 her zaman geçer (klon ses yok); klon kuralı ve AIGC kararı M5c'de gelir (K17 onayı bekliyor).
- **`AudioPlan` ve D6:** fixer'ın bir ses spec'i yazabilmesi gerekir (`specWrite` `audio`), böylece D6 düşüşü (SFX, müzik, seviye satırı, spec §7.2) `unchanged` yerine düzeltilebilir; `silent` modda bugün bu satıra ulaşılamaz.
- **`rerender_scope: 'voice'`:** `FixReport` şeması `voice`'u tanır ama `fixReportRefErrors` "seslendirme kapsamı M5c'de" diye reddeder; kapsam tablosu ve `fixScope` `voice → (süre ±0,3 sn ise build'den) compose` yolu ile genişletilmeli.
- **Review paneli tur seçici (M7):** panel yalnızca en yeni turu gösterir ("önceki N tur" etiketi); tur seçici ve sürüm geçmişi M7'ye bırakıldı.
- Müzik kürasyonu elle (`bin/assets.mjs`); prosedürel SFX'in kalitesi dinlenmeli (slop riski).

## 11. Bilinen sınırlar

- `npm test` 5,9 dk (planın tahmini 5,2 dk; `rötuş` uçtan uca testi `test:render`'da); smoke 4,3 dk (> 3 dk hedefi).
- Gerçek LLM isabeti Fake ile ölçülemez; kontrol puanları ve D6 alt puanları ilk gerçek koşudan sonra `final@2` ile değişebilir.
- Build kapsamının tam uçtan uca testi yalnızca gerçek koşuda (bilinçli, F21); build, rework ve salınım yolları stub yürütücülü orchestrator testleri ve adım testleriyle sınandı.
- Bir build kapsamlı tur gerçek koşuda ~35 dk + opus fixer harcar; 5 sa penceresi için `usage` durdurması ve iptal kuralı var.
- `freezedetect` yavaş CG hareketinde yanlış donma verebilir (M5a §10); istem "yavaş ama süren hareketi donma sayma" der, ölçüm puansızdır.
- Tohumlu %30 web örneklemi kötü bir kaynağı kaçırabilir (sayısal iddialar her zaman denetlenir); görsel reviewer kısa bir kusuru kaçırabilir (12 + 12 + 8 kare).
- "Geçmedi" bir kontrol varken K13 sağlanabilir: `ready` + açık küçük bulgular (finalize notu söyler).
- Yarım kalmış bir fixer oturumundan kalan yetim `versions` satırı zararsızdır.
