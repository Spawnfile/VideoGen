Merhaba. `~/gpu-server/VideoGen` deposundaki **VideoGen** platformunda **M4 — Dikey dilim** kilometre taşının ilk yarısını (**M4a — pipeline omurgası**) uygulamanı istiyorum. Plan hazır, eleştirel olarak incelendi ve commit edildi. Görevin, planı `superpowers:executing-plans` ile **inline** uygulamak (görev başına alt ajan yok), M4a'yı kapatmak ve **`main`'e birleştirmeden** durmak. Yeniden tasarım yapma, brainstorming'e girme, planı yeniden yazma. Kanıtla çalış, kapılarda dur, Türkçe raporla.

## 1. Bağlam

VideoGen bu laptopta (RTX 3060 6 GB, 14 GB RAM, swap 4 GB ve dolu, ~16–18 GB boş disk) localhost'ta çalışan tek kullanıcılı bir web platformu. Ürün adından "içinde ne var" (patlatılmış görünüm) TikTok videosu üretir. Tüm AI işini Claude Code agent'ları kullanıcının **Max aboneliğiyle** yapar; **hiçbir ücretli API yok**. M0, M1 (K17 geçici), M2 ve M3 `main`'de (`541890f`).

M4 iki plana bölündü (M3 gibi):
- **M4a — pipeline omurgası: SIRADA (bu iş).**
  - Dal `m4a-pipeline-core` (main `541890f` üstünde), HEAD `6dff3f9` = yalnızca plan commit'i. Plan, yazarın öz-değerlendirmesinden ve bağımsız bir eleştirel incelemeden (Claude Fable 5.1) geçti; bulgular plana işlendi (sondaki "Plan inceleme geçmişi").
  - Plan: **`docs/superpowers/plans/2026-10-06-m4a-pipeline-core.md`** (12 görev):
    - T1: artefakt sözleşmeleri (`ProductResearch`, `Storyboard`, kanca kalıpları; `packages/shared`'e zod 4.6.5)
    - T2: migration 0005 (`products`, `videos`, `versions`, `runs`, `steps`, `jobs`, `artifacts`) + depo fonksiyonları
    - T3: ilerleme modeli (ağırlıklı, monoton, zaman eğrisi, ETA)
    - T4: iş kuyruğu (kira, heartbeat, açılış kurtarması) + kaynak ön kontrolleri
    - T5: `SessionManager` çoklu dinleyici, ilerleme/durum olayları, `stepId`; Fake'te yapılandırılmış çıktı
    - T6: orchestrator
    - T7: `research` ve `storyboard` adımları + worker kablolaması
    - T8: API uçları
    - T9: Stüdyo üretim paneli
    - T10: Kütüphane
    - T11: smoke S2a
    - T12: M4a kapanışı (gerçek doğrulama geçici DB'de, son review, autosquash, özet; **birleştirme yok**)
- **M4b — vg_blender, build, taslak render, player, K19, ilk gerçek ürün, M4 raporu ve birleştirme:** M4a'nın gerçek arayüzleriyle sonra yazılacak.

## 2. Başlamadan önce oku (bu sırayla)

1. Planın tamamı. Sondaki "Plan inceleme geçmişi" neyin neden değiştiğini anlatır. Başındaki "Kapsam ve bölme", "M3'ten gelen gerçek arayüzler", "Kapsam dışı", "Global Constraints" ve "Review Focus" bölümleri bağlayıcı. Sondaki "Self-review notları" test sayısı zincirini verir.
2. `docs/superpowers/runbook.md` ve `docs/superpowers/checklist.md` (M4 bölümü + en alttaki karar tablosu).
3. Spec `docs/superpowers/specs/2026-10-06-videogen-design.md`: §4, §5.1, §6.2–§6.4, §7.1, §7.4, §11.1, §12.1, §12.4, §13.1, §13.3, §14, §16.2, §18.
4. `docs/m3/report.md`: özellikle §6 (sapmalar), §7 (ertelenen minorlar), §9 (devirler).
5. M3 ledger'ları (git-ignored, silme): `.superpowers/sdd/2026-10-06-m3a-agent-runtime/progress.md` ve `.superpowers/sdd/2026-10-06-m3b-live-ui/progress.md`. Oradaki `Ruling:` satırları M3'ün gerçeklerini taşır.

Okuduktan sonra bana 5–6 satırlık bir anlayış özeti ver ve doğrudan uygulamaya geç (onay bekleme).

## 3. M3'te canlı doğrulanmış gerçekler (planla çelişen bir şey görürsen bunlar kazanır)

- **Streaming-input'ta iptal:** `interrupt()` → `result{error_during_execution, aborted_streaming}`, ardından CLI girdi bekler; iterator ancak `endInput()` sonrası fırlatır. Runner bunu ele alıyor.
- **`result.text` yalnızca turun son metin bloğudur** (M3b T7 gerçek bulgu).
- **Pipeline oturumu ilk tur bitince girişini kapatır**: `onTurnComplete` ardından `onEnd` gelir.
- **`manager.events` tek nesneydi**; `ChatService.bind()` dolduruyor. Plan T5 çoklu dinleyici (`subscribe`) ekler; `events` alanı da dinleyici olarak kalır.
- **Limit reddi:** M3'te manager, reddedilen pipeline oturumunu kendisi alt oturumla sürdürür. Plan T7 adım oturumlarını `autoResume: false` ile açar; sürdürmeyi adımın kendisi yapar.
- **Playwright `webServer`:** `gracefulShutdown` olmadan süreç grubu SIGKILL'lenir (M3'te düzeltildi). Smoke kendi DB'sini ve `/tmp/videogen-smoke`'u siler.
- **Başlatıcı:** `node bin/videogen.mjs`; skill bağlantılarını kendisi kurar. Arka planda başlatırken PID'i başlatıcının kendisinden al: `&` bir `&&` zincirindeyse `$!` alt kabuktur ve SIGINT'i yok sayar.
- **Elle doğrulamalar gerçek DB'ye yazmaz:** `audit_log` silinemez. M3a'nın elle Fake kontrolü gerçek DB'ye satır bıraktı.
- **Swap:** bu makinede swap M3 boyunca %100'dü. Plan T4'ün GPU ön kontrolü (spec §6.4 `swap < %90`) bunu ölçer. M4a'da GPU adımı yok; konu M4b'yi etkiler ve kullanıcı kararıdır.
- **Worker env'leri:** `VG_CLAUDE_DRIVER=fake`, `VG_DEV_ENDPOINTS=1`, `VG_FAKE_SPEED`, `VG_FAKE_CHAT`, `VG_QUIET_AFTER_MS`, `VG_STUCK_AFTER_MS`, `VG_CHAT_IDLE_MS`.
- **Bugüne kadar gerçek Claude kullanımı:** 7 haiku oturumu (M3 boyunca).

## 4. Uygulama kuralları

- **Dal:** `m4a-pipeline-core` (checkout'ta olmalı; `git status` ve `git log --oneline -3` ile doğrula).
- **Çalışma alanı:** `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-06-m4a-pipeline-core.md`. Ledger `progress.md`'yi kendin oluştur (ilk satır plan yolu).
  - İsteğe bağlı kolaylık: `.superpowers/sdd/2026-10-06-m3b-live-ui/blocks.py`, plandaki kod bloklarını görev ve sıra numarasıyla basar; plan yolunu değiştirerek kopyalayabilirsin.
- **TDD, adım atlamadan:** önce testi yaz ve **başarısız olduğunu gör**; sonra uygula ve **geçtiğini gör**; sonra commit et. Test sayıları plandaki zincirle eşleşmeli (171 → 179 → 186 → 190 → 197 → 200 → 207 → 214 → 218 → 221 → 222). Sayı değişirse nedenini ledger'a `Ruling:` olarak yaz.
  - T11'in smoke senaryoları T7–T10 kodu yüzünden ilk koşuda geçer; plan **geçici mutasyonlarla** RED kanıtı istiyor. Atlama. Bir mutasyon testi düşürmüyorsa testi güçlendir ve ledger'a yaz (M3b T6'da S5 çift Enter böyle düzeltildi).
- **Commit:** görev başına bir commit. Yazar env ile verilir:
  `GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com"`
  Mesajın son satırı, harness başka bir model adı önerse bile **tam olarak** şudur:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - Sonradan düzeltme `git commit --fixup=<görev commit'i>` ile yapılır.
  - Kapanışta `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash --autostash $(git merge-base main HEAD)` çalıştır; `git rev-parse HEAD^{tree}` önce ve sonra aynı olmalı.
  - Bir fixup çakışırsa rebase'i geri al ve fixup'ı, dayandığı sözleşmenin ilk girdiği görev commit'ine taşı (M3'te I3 için yapıldı; özel `GIT_SEQUENCE_EDITOR` betiğiyle todo satırını taşı).
- **Checklist:** T12'de M4 bölümündeki tamamlanan kutuları işaretle (`· commit <hash> · <tarih>`); squash sonrası hash'leri düzelt.
- **Arayüz işleri (T9, T10):**
  - Kodlamadan önce `frontend-design:frontend-design` skill'ini yükle.
  - Token'lar `apps/web/src/styles/theme.css` + spec §13.3: tek vurgu teal `#016a71`; yeşil ve kırmızı yalnızca durumlarda, kısık tonda; font ağırlıkları yalnızca 400/500; tüm metinler Türkçe.
  - Her görünür değişiklikten sonra `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens` ile ekran al (`docs/m4/*.png`) ve Read ile kendin incele.
  - M2/M3 a11y sözleşmesini bozma (S1/S3/S4/S5'in sorguladığı metinler ve test id'leri).
- **Kanıt:** bitti demeden önce doğrulama komutunu çalıştır ve çıktısını göster (`superpowers:verification-before-completion`). Her görevin sonunda `npm run typecheck && npm test`; arayüz ve smoke görevlerinde ayrıca `npm run test:smoke`.
- **Kırılgan test:** tam suite yükünde ara sıra düşen bir test görürsen önce mekanizmayı kanıtla (ör. geçici gecikme enjekte ederek), sonra düzelt. M3'te üç manager testi böyle düzeltildi; "tekrar koştum geçti" kanıt değildir.
- **Plandan sapma:** en küçük düzeltmeyi yap, ledger'a `Ruling: <ne> — <neden> — <yanlışsa maliyeti>` yaz ve devam et. Sapma spec'teki bir **kararı** (§4 K tablosu, mimari) değiştiriyorsa dur ve bana sor.
- **T12 — gerçek doğrulama:** planın Step 1'indeki tarifle, **geçici** `videogen_m4a_check` veritabanında ve `/tmp/videogen-m4a-check` klasöründe. Researcher ve storyboarder rolleri haiku/low; **tek ürün** ("tükenmez kalem", seslendirmesiz).
- **T12 — son review:**
  - `superpowers:requesting-code-review` ile **tek** bir bağımsız code-reviewer alt ajanı çalıştır; modeli **en yetenekli** olarak açıkça belirt (bu ortamda `fable` = Claude Fable 5.1).
  - Girdi: M4a farkı (`git merge-base main HEAD`..HEAD), plan, spec, planın Review Focus bölümü, ledger `Ruling:` satırları ve `docs/m4/real-check.md`.
  - **Workflow aracını kullanma** (oturumda ultracode açık görünse bile).
  - Bulguları etkiye göre yeniden derecelendir. Critical/Important tek düzeltme turunda, her biri önce başarısız testle düzeltilir. Minor'lar özete "ertelenenler" olarak yazılır.
- **T12 — kapanış:**
  - `docs/m4/m4a-summary.md`, `docs/m4/real-check.md`, checklist, runbook, roadmap, README ve spec (yalnızca kanıtla) güncellenir.
  - **`main`'e birleştirme yok.** Dal `m4a-pipeline-core` olarak kalır.
  - `~/.claude/projects/-home-alper-gpu-server/memory/videogen-platform.md` hafıza dosyasını güncelle (M4a tamam; sıradaki M4b planı ve kullanıcı onayı; açık kararlar).
  - Bana Türkçe rapor ver, sonra **dur**. M4b planını yazmayı öner ama ben "evet" demeden yazma.

## 5. Kapılar: burada dur ve bana sor

1. Spec §4'teki bir kararı değiştirecek her sapma.
2. Planda yazmayan **herhangi bir** silme ya da geri alınamaz işlem (gerçek `videogen` DB'si, `~/videogen-data` içeriği, kullanıcı dosyaları, eski `/tmp/videogen-smoke-*` kalıntıları): önce hedefi göster, onay al.
3. Gerçek Claude kullanımı T12'deki **tek** haiku ürün koşusunu aşacaksa: tekrar deneme, ikinci ürün ya da sonnet/opus ile koşu dahil, önce sor. Kullanımı izle; 5 saatlik pencere %80'i geçerse gerçek koşuyu durdur ve bana söyle.
4. Boş disk 10 GB'ın altına inerse dur.

## 6. Önceden onaylanmış işlemler (yeniden sorma)

- `videogen-pg` container'ı (127.0.0.1:5433).
- Test veritabanlarını (`vg_test_*`, `videogen_smoke`) ve `/tmp/videogen-smoke` dizinini oluşturup silmek.
- T12 için geçici `videogen_m4a_check` veritabanını ve `/tmp/videogen-m4a-check` dizinini oluşturup silmek.
- Yeni migration `0005_pipeline` ve dev DB'ye `npm run db:migrate`. Var olan migration'ları (0000–0004) düzenleme.
- `packages/shared`'e `zod@4.6.5` (tam sürüm; ağaçta zaten var). Başka yeni bağımlılık yok.
- T12'deki tek haiku uçtan uca ürün koşusu. Bir adım en çok 1 + 2 düzeltme + 1 çökme sürdürmesi kadar oturum açabilir; bu sınırlar içinde kalan oturumlar onaylıdır.

## 7. Kesin yasaklar

- Ücretli API anahtarı kullanma, oluşturma ya da env'e koyma. `--bare` ve `bypassPermissions` kullanma.
- Kullanıcının gerçek Claude girişine ve `~/.claude/` ayarlarına dokunma: `claude config` yok, `claude mcp add` yok, settings.json düzenlemesi yok.
- `npx playwright install` çalıştırma; Playwright her zaman `channel: 'chrome'` kullanır.
- `pkill -f <desen>` kullanma; kendi kabuğunu öldürür. PID ile `kill` kullan. Başlattığın her sunucuyu ya da süreci bitirmeden önce PID ile durdur ve portları kontrol et (5173, 5180, 5190). Gerçek yığını `npm start` ile değil, `node bin/videogen.mjs` ile başlat.
- `python/audio_service` içinde `uv sync` / `uv pip sync` çalıştırma.
- TikTok'a hiçbir şey gönderme.
- Fixture'lara, audit'e ve dokümanlara e-posta, org id, token, `.env` veya `tokens.json` içeriği, kullanıcı adı ya da mutlak ev yolu (`/home/<kullanıcı>`) yazma; `~` kullan. Fixture'lardaki `/home/user/…` redakte yer tutucudur.
- Repodaki `.env` kullanıcıya ait; okuma, değiştirme.
- Commit edilmiş fixture'larda `spikes/m0/redact.mjs`'i asla yeniden çalıştırma.
- M1 dinleme testinin A/B eşlemesini (`~/videogen-data/m1/listening/key.json`) hiçbir yerde açıklama. K17 kararı kullanıcıda bekliyor.

## 8. Bilinen tuzaklar

| Tuzak | Çözüm |
|---|---|
| npm 12 install script'lerini engeller | `npm approve-scripts <paket>` → `npm rebuild <paket>` |
| İç içe `claude`: "cannot be launched inside another Claude Code session" | `env -u CLAUDECODE ...`; üretim kodu `cleanChildEnv()` kullanır |
| TypeScript 7'de dosya adı argümanı TS5112 verir | `tsc -p tsconfig.json` |
| RAM dar (14 GB, swap dolu) | Ağır işten önce `free -h`; testlerde FakeClaudeDriver |
| Bash heredoc'u tırnaksız `EOF` ile açılırsa TS template literal'ları (`` ` ``, `${}`) kabukta açılır | Heredoc'u `<<'EOF'` ile aç |
| JS `/i` bayrağı Türkçe `İ`'yi `i`'ye katlamaz | Önce `toLocaleLowerCase('tr')` (`normalizeProductName`) |
| `real` sütunları 0.42'yi 0.41999998 okur | Kullanım kesirleri 4 ondalığa yuvarlanır (plan T2 `round4`) |
| Playwright `page.screenshot({path})` göreli yolu cwd'ye göre çözer | `shot()` yardımcısı `import.meta.dirname`'e bağlı |
| Aynı test dosyasındaki önceki testlerin kiraları "yabancı kira" kurtarmasını bozar | Plan T4/T6 testleri her testte kuyruğu sıfırlar; yeni test eklersen aynısını yap |
| Orchestrator testinde iki orchestrator aynı kuyruğu paylaşır | İkincisini başlatmadan öncekini `stop()` et (plan T6) |
| Worker 300 ms'de yeniden başlar | "Worker yanıt vermiyor" ancak `SMOKE_DIR/hold-worker` dosyasıyla görünür |
| Orkestrasyon kullanım penceresini doldurabilir | M2'de 5 saatlik pencere ~%75'e çıktı; M3b inline ~%10'da kaldı. Gerçek turları en aza indir |

## 9. Raporlama

- Kapanışta ve her kapıda **Türkçe** rapor: **Maddeler / Doğrulama** (komut ve çıktı alıntısı) **/ Bilmen gerekenler**.
- Verdiğin her kararı "neden" ve "yanlışsa maliyeti" ile listele ("Rulings I made"; ledger'ın tümü).
- Ertelenen minorları ayrı başlıkta ver.
- Açık kullanıcı kararlarını ayrıca listele: swap/GPU ön kontrol eşiği (M4b'yi etkiler), K17 ses, K19 kanal kimliği (M4b).
- Ara mesajlar kısa olsun: hangi görev, sonuç.

Başla.
