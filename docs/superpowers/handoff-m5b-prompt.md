Merhaba. **VideoGen** deposundaki platform için **M5b — İnceleme ve düzeltme döngüsü** kilometre taşının **uygulama planını** yazmanı istiyorum. Görevin planı yazmak, incelemeden geçirmek, commit edip push etmek. **Uygulama yapma.** Türkçe raporla. Karar gerektiren her durumda staff mühendis bakışıyla otonom karar ver; bana sorma (yalnızca spec'teki bir K kararını ya da mimariyi değiştirmen gerekirse dur ve sor).

## 1. Bağlam (kısa)

VideoGen tek kullanıcılı, localhost'ta çalışan bir web platformu (kullanıcının laptopu: RTX 3060 6 GB, 14 GB RAM). Ürün adından "içinde ne var" (patlatılmış görünüm) TikTok videosu üretir. Tüm AI işini Claude Code agent'ları kullanıcının **Max aboneliğiyle** yapar; **ücretli API yok**.

Durum (`main`, HEAD `8903200` ya da sonrası; `git log --oneline -15` ile doğrula):
- M0–M3 tamam. M4 (M4a pipeline omurgası, M4b sahne çekirdeği, M4c taslak + taslak incelemesi + player) uygulandı ve `main`'de.
- **M5 üçe bölündü** (`docs/superpowers/plans/2026-10-06-m5a-final-render-qc.md` "Kapsam ve bölme", karar E1):
  - **M5a (uygulandı, `main`'de):** rubrik `final@1` + otomatik QC sözleşmesi, varlık defteri (migration 0007) + lisans kapısı + prosedürel CC0 SFX, Blender final render (`final_render`), `Overlay` + `Final3D` + `layout.json`, `compose` (SFX + müzik + iki geçişli mastering, `final_music.mp4` / `final_tiktok.mp4`), qc_probe + `qc` adımı, Stüdyo "Final" sekmesi + "Otomatik kontrol" kartı, smoke S2 finale kadar. Bugün bir ürün `research → storyboard → build → draft_render → draft_review → final_render → compose → qc` koşup `insan gerekli` durumunda bitiyor; not: "Final video hazır ve otomatik kontrolden geçti. İnceleme ve "yayına hazır" kararı M5b'de."
  - **M5b (bu planın konusu):** LLM reviewer'lar, puan ve K13 kararı, fixer ve düzeltme döngüsü, `finalize`, **"Yayına hazır"**.
  - **M5c (sonra):** seslendirme (TTS + Whisper, `voice` adımı, audio_director, ducking, G4).
- **Bekleyen gerçek doğrulamalar** (GPU'lu makinede; M5a bulut konteynerinde uygulandı): `test:blender` (19), Blender final int testi, kalem pilotu kalibrasyonu (spec §8.3), M4'ten devreden **ilk gerçek ürün + video başına kullanım**. Ayrıntı `docs/m5/real-check.md`. M5b planının kapanış görevi bunları M5b'nin gerçek koşusuyla **tek koşuda** birleştirmeli (ürün "yayına hazır"a kadar).

**M5b'nin kapsamı** (spec §7.1 adım 10–11, §7.2, §8.1–§8.4, §11.1, §12.1, §17 M5 satırı; checklist M5 bölümü):
- `reviews` / `findings` tabloları (migration 0008; §11.1). Gerekirse `versions` kullanımı (sürüm başına tur, en iyi sürüm).
- Final `Review` sözleşmesi (`final@1`): üç reviewer rolü ve **boyut sahipliği** (§8.2 tablosu: reviewer_visual D2/D3/D5/D9 + G3/G5 görsel; reviewer_facts D4 + G2 + storyboard uygunluğu; reviewer_retention D1/D8). Önem derecesi/karar deterministik olmalı (M4c'nin `DRAFT_CHECKS` + `draftDecision` deseni, D6 kararı).
- `review` adımı: üç oturum **paralel**, kullanım muhafızına uyar (fan-out kapısı §6.4); `run_qc` MCP aracı; `extract_frames`'in final videoya genişletilmesi (M4c `ReviewTargets`, bütçe adım+tur başına); reviewer_facts için web doğrulaması (sayısal iddiaların hepsi + URL'lerin rastgele %30'u, §8.2); **sınırda (78–82) ikinci bağımsız görsel review** (§8.3).
- **Puan ve karar (K13):** 6 kapı + puan ≥ 80 + her boyut ≥ ağırlığının %60'ı → "Yayına hazır"; 70–79 ya da kapı/boyut düşük → düzelt; < 70 → storyboard'a dönüş (tur sayılır). Otomatik puanlar (D6, D7) `qc_report`'tan; puansız otomatik ölçümler (D2 siyah, D3 donma, D8 döngü) ilgili reviewer'a girdi.
- **Fixer** rolü + `FixReport` sözleşmesi (§7.4) + **yeniden render kapsamı** (§7.2 tablosu: compose / build / storyboard; voice kapsamı M5c), en çok **3 tur**, **regresyon** (önceki turda geçen kontrol yeniden düşerse) ve **salınım** tespiti (aynı kontrol iki kez düzelip bozulursa erken dur), en iyi sürümün seçimi. M4c'nin `rewind` + `steps.round` + `rewindForReview` mekanizmasını genelleştir; taslak turları (≤ 2) ile final turları (≤ 3) ayrı sayılır.
- **`finalize`** adımı (§7.1 adım 11): en iyi sürüm, kapak, bitirme bilgisi, video `ready`; **kare temizliğinin `finalize`'a taşınması** (M5a E6: compose kapsamlı tur kareleri yeniden kullanmalı).
- Arayüz: üç reviewer kartı (boyut çubukları, kapı rozetleri, kanıt kareleri), toplam puan, "Düzeltme turu k/3" başlık satırı (M4c `draftRound` deseni), "Yayına hazır" durumu, kütüphanede puan.
- Smoke **S2 tam sürüm** (spec §16.2: … → "Yayına hazır" → kütüphanede oynar) + düzeltme turlu bir Fake senaryo.
- M5a'dan devredilenler: ertelenen M9 (çökme sonrası devamda 64/32 örnekli karelerin karışması → not/audit) ve M10 (`failed` run'da kareler silinmesin; temizlik `finalize`'da); içe aktarılan SFX'in ses planına girmesi; D6 alt puanlarının kalibrasyonu (§10 notları).
- Kapanış: tam doğrulama, GPU'lu makinede gerçek koşu (K12 rolleri, "tükenmez kalem", seslendirmesiz, "yayına hazır"a kadar) + bekleyen M5a doğrulamaları + video başına kullanım, son review, `docs/m5/m5b-summary.md`, dokümanlar, `main`.

## 2. Önce oku (bu sırayla; hepsi repoda)

1. `docs/m5/m5a-summary.md` (özellikle §7 sapmalar, §8 son review, §9 ertelenenler, **§10 M5b için notlar**, §11 sınırlar) ve `docs/m5/real-check.md`.
2. `.superpowers/sdd/2026-10-06-m5a-final-render-qc/progress.md` (ledger: `Ruling:` satırları — ortam tuzakları ve bulunan gerçek hatalar burada).
3. `docs/superpowers/plans/2026-10-06-m5a-final-render-qc.md` — **M5b planının biçim örneği**. Okunacak bölümler: başlık, Architecture, Kapsam ve bölme, gerçek arayüzler, Plan öncesi sondaj, Karar kaydı E1–E20, Kapsam dışı, Global Constraints, Review Focus, Başlarken, Self-review notları, Plan inceleme geçmişi. Görevlerin kod bloklarını okumana gerek yok; gerçek kodu repodan oku.
4. `docs/superpowers/plans/2026-10-06-m4c-draft-review-player.md`: Karar kaydı C1–C32 (özellikle C2–C11, C19–C25: Review sözleşmesi, deterministik karar, rewind, değişmeyen düzeltme, kare bütçesi, bayat artefakt) ve Review Focus. M5b bu desenlerin final sürümüdür.
5. Spec `docs/superpowers/specs/2026-10-06-videogen-design.md`:
   - §4 (K6, K12, K13, K15, K17, K19, K22, K27); §6.2 (roller ve modeller; M4b/M4c notları), §6.3 (`run_qc`, `extract_frames`, `write_spec`), §6.4 (fan-out kapısı), §6.6;
   - §7.1 (adım 10–11), **§7.2** (düzeltme döngüsü ve kapsam tablosu), §7.4 (`Review`, `FixReport` + M4c/M5a notları), §7.6 (disk);
   - **§8.1–§8.4** (rubrik, doğrulayıcı sırası, boyut sahipliği, kendi kendini onaylamaya karşı önlemler, sonradan ayarlama);
   - §11.1 (`reviews`, `findings`, `versions`, `claims`), §12.1 (düzeltme turu satırı), §13.1 (Review'lar sekmesi, kütüphane puanı), §14, §16.2 (S2), §17 (M5 satırı), §18.
6. `docs/m4/report.md` (§7–§9) ve `docs/superpowers/checklist.md` (M5 bölümü + karar tablosu), `docs/superpowers/runbook.md` (§1, §5, §6, §7).
7. **Gerçek kod** (imzaları buradan al, tahmin etme):
   - Pipeline: `apps/worker/src/pipeline/{orchestrator,steps,final-steps,agent-step,review-tools,scene-tools,sound,fake-scripts,types}.ts`.
   - Render/QC: `apps/worker/src/render/{qc,ffmpeg,audio,driver,frames,gate,locks}.ts`.
   - Ajan katmanı: `apps/worker/src/agents/{manager,usage-guard}.ts`, `packages/claude/src/{mcp,roles,guard}.ts`.
   - Paylaşılan ve DB: `packages/shared/src/{rubric,qc,review,pipeline,progress,artifacts,assets}.ts`, `packages/db/src/{pipeline,schema,assets}.ts` + `packages/db/drizzle/` (son migration 0007).
   - Remotion: `packages/remotion/src/{props,layout,Overlay,Final3D}.tsx?`.
   - API ve web: `apps/api/src/routes/videos.ts`, `apps/web/src/components/production/*`, `apps/web/src/lib/production-view.ts`, `apps/web/src/routes/Library.tsx`.
   - Testler: `apps/worker/test/{draft-review-step,qc-step,final-helpers,orchestrator-draft}.test.ts`, `tests/smoke/{s2c-draft,s2d-final,screens}.spec.ts`.

Okuduktan sonra bana 5–6 satırlık bir anlayış özeti ver ve doğrudan planlamaya geç (onay bekleme).

## 3. M5a'dan devralınan gerçekler (planla çelişirse bunlar kazanır)

- **Testler (`main`):** `npm test` **355** (~4,7 dk), smoke **19 geçti / 11 atlandı** (~3,8 dk; 3 dk hedefi aşıldı — final adımlarını koşan senaryolar), `test:render` Blender'sız 5 (Blender'lı 10), `test:blender` 19 (GPU'lu makinede koşulmadı). Sayı zinciri 355'ten başlar. Test süresi bütçesini planla: yeni uçtan uca testler Fake reviewer'larla ve mümkünse `until`/kısmi planla (M5a T10'daki geliştirici `until` seçeneği) koşmalı; smoke'a eklenecek her finale-kadar senaryonun süresini tahmin et.
- **Fake desenleri:** `FakeClaudeDriver` kayıtlı akışlar + `structured` çıktı; `fakePipelineScript(role, ctx, attempt)` ürün adı tetikleriyle ("kusurlu", "umutsuz", "inatçı", "bozuk sahne", "yavaş", "imkansız"). `FakeRenderDriver` `final`/`compose` gerçek ffmpeg ile; fake final düz içerik olduğu için `d7_bitrate` düşer (D7 4/5, beklenen). Final-adım test kurulumu `apps/worker/test/final-helpers.ts` (`finalHarness`).
- **Bulunan tuzaklar (yeniden yaşanmasın):** `-preset ultrafast` x264 profili Constrained Baseline yapar (`-x264-params cabac=1:8x8dct=1` ekli); ffmpeg `drawbox` zamanla hareket edemez (`overlay` kullan); AAC kodlaması mastering sınırlayıcısını ~1 dB aşar (−2 dBTP hedefi + teslim dosyası ölçümü); ebur128 LRA kısa kliplerde güvenilmez; `freezedetect n=0.001` yavaş CG'de yanlış donma verebilir.
- **Mekanizmalar:** `StepOutcome.rewind{to, reason}` + `rewindForReview` (tek transaction, koşullu) + `steps.round` (taslak döngüsü); `ResourceLocks`/`withResource` tek kapı (GPU, heavy_cpu); `claimQueuedRun`; `UsageGuard.restore()`; `runProcess` alt süreç ağacını ölçer ve öldürür; bayat artefakt hash'leri (`draftSource`, `finalSource`, `composeSource`); kare temizliği şu an terminal run'da (`removeRunFrames`).
- **Ortam:** Planlama için kod çalıştırman gerekmez. Bulut konteynerindeysen ortam notları ledger'da (Node 24 `/opt/node24`, ffmpeg 7 statik, yerel Postgres, Chrome for Testing). GPU, Blender ve kalem pilotu dosyası yalnızca kullanıcının makinesinde.
- **Açık kullanıcı kararları:** K17 (TTS sesi, M5c), K19 (kanal kimliği; seçim yoksa `gece_mavisi` GEÇİCİ), swap eşiği §6.4 değişmedi, müzik kürasyonu (`bin/assets.mjs add`; izinli müzik yoksa D6 düşer).

## 4. Yöntem ve kurallar

- **Skill:** `superpowers:writing-plans` (yüklüyse); değilse M5a planının biçimini izle.
- **Kararlar:** otonom, spec'le tutarlı best practice. Önemli kararları bir karar ağacına yaz ve **tek** bir bağımsız alt ajana (model `fable`, salt okunur) grilling yaptır; CHANGE önerilerini değerlendir ve "Plan inceleme geçmişi"ne işle. Spec'teki bir K kararını ya da mimariyi değiştirmen gerekirse dur ve sor.
- **Token ekonomisi:** planı doğrulamak için kodu uygulayıp çalıştırma; gerçek kodu oku, plandaki kodu ona göre yaz. Yalnızca gerçekten belirsiz ve ucuz bir teknik soru için en çok 2 küçük sondaj (ör. üç paralel reviewer oturumunun kullanım muhafızıyla etkileşimi, `WebFetch` izinleri); sonucu "Plan öncesi sondaj" tablosuna yaz. Gerçek Claude oturumu açma.
- **Plan dosyası:** `docs/superpowers/plans/2026-10-07-m5b-review-fix.md`.
  - **En çok 12 görev.** Biçim M5a planıyla aynı: başlık (Goal, Architecture, Tech Stack, Spec), Kapsam, gerçek arayüzler, Plan öncesi sondaj, Karar kaydı, Kapsam dışı, Global Constraints, Review Focus (5 madde, her biri teste bağlı), Başlarken, görevler, Self-review notları, Plan inceleme geçmişi.
  - Her görevde: **Files**, **Interfaces** (tam imzalar), TDD adımları (önce başarısız test + beklenen hata, sonra uygulama, sonra geçen test ve tam paket sayısı), commit mesajı.
  - Kod adımları tam dosya, tam fonksiyon gövdesi ya da `git apply` ile uygulanabilir diff; yer tutucu ("TBD", "benzer şekilde") yok. Test sayı zinciri 355'ten başlar; `it` blokları sayılarak hesaplanır.
  - Arayüz görevinde `frontend-design:frontend-design` (yüklüyse) kullanılır; ekran testleri `docs/m5/*.png`.
  - Gerçek LLM kalitesi Fake ile ölçülemez: reviewer istemlerinin (prompt) içeriğini planda **tam metin** yaz (güvenilmeyen veri `fenced` ile; builder'ın akıl yürütmesi reviewer'a verilmez, §8.3).
  - **Kapanış görevi** (GPU'lu makinede): tam doğrulama (`typecheck`, `npm test`, `test:blender`, `test:render`, `test:smoke`); kalem pilotu kalibrasyonu (`qc-cli`, 7 hata) M5a'dan bekliyorsa; geçici DB `videogen_m5b_check`, `/tmp/videogen-m5b-check`; K12 rolleri (override yok), "tükenmez kalem", seslendirmesiz; başlama koşulu 5 sa < %25 ve 7 gün < %70; koşu içinde 5 sa > %80 → iptal; başarısızlıkta tekrar yok; video başına kullanım ölçümü (M4 çıkış maddesi); tek bağımsız son kod review'u (`fable`); `docs/m5/m5b-summary.md`; checklist / runbook / roadmap / README / spec notları; `main`'e birleştirme.
- **İnceleme:** plan bitince
  1. kendi self-review'unu yap (spec kapsamı tablosu, yer tutucu taraması, tip ve ad tutarlılığı, Review Focus eşlemesi, sayı zinciri);
  2. **tek** bir bağımsız alt ajanla (model `fable`, salt okunur) planı spec'e, M5a planına ve gerçek koda karşı inceletip Blocking / Important / Minor bulgu iste;
  3. hepsini plana işle; ikinci inceleme turu yalnızca Blocking çıkarsa. Workflow aracını kullanma.
- **Commit ve push:** oturumun çalışma dalında (yoksa `main`'den `m5b-review-fix` aç) yalnızca plan dosyası (+ gerekirse sondaj betikleri, runbook §1 satırı, checklist M5 durum satırı).
  - Yazar env ile: `GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com"`.
  - Mesajın son satırı tam olarak: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit'lerde model adı/kimliği başka yerde geçmez.
  - Dalı push et; sonra `main`'i bu dala **fast-forward** et ve push et (kullanıcı tercihi: `main` doğrudan güncellenir, PR yok). Force-push yok; geçmişi yeniden yazma.
- **Kapsam disiplini:** `docs/superpowers/handoff-*.md` dosyalarına dokunma; uygulama yok.

## 5. Bitti tanımı ve rapor

Bitti sayılması için:
- Plan dosyası commit'lenmiş ve `main`'de.
- Self-review ve bağımsız incelemenin bulguları plana işlenmiş ("Plan inceleme geçmişi" bölümünde listeli).
- Açık Blocking/Important bulgu kalmamış.

Bana Türkçe rapor ver:
- **Maddeler:** görev listesi tek satırlarla.
- **Kararlar:** her biri için neden ve yanlışsa maliyeti.
- **İnceleme sonuçları.**
- **Bilmen gerekenler:** açık kullanıcı kararları, riskler (özellikle test süreleri ve gerçek koşunun 5 saatlik pencereye etkisi), tahmini kullanım.

Sonunda uygulama yöntemini (inline / subagent-driven) öner ve dur.
