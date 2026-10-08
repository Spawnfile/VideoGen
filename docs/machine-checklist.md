# Makinede yapılacak testler — tek sıralı liste

Bu dosya, bulut oturumlarında yapılamayan **bütün gerçek koşuları** tek bir sırada toplar: M5 kapanışı (M5c planı T12), M6 kapanışı (M6 planı T9) ve M7'nin gerçek denetimleri (M7 planı T13 / Y21). Kaynak planlar:
- `docs/superpowers/plans/2026-10-07-m5c-voice.md` → Task 12 (Step 1–9)
- `docs/superpowers/plans/2026-10-08-m6-publish.md` → Task 9 (Step 0–7)
- `docs/superpowers/plans/2026-10-08-m7-hardening.md` → Y21, T13

Her madde: **önkoşul**, **komut**, **beklenen**, **kayıt yeri**. 🚦 = kullanıcı kararı. Bir madde beklenen sonucu vermezse durulur; neden kaydedilir; düzeltme bir sonraki maddeye geçmeden yapılır. Eski dokümanlardaki beklenen sayılar (355, 399, 428, 462) geçersizdir; güncel sayılar yalnızca bu dosyadadır.

**Kayıt dosyaları:** `docs/m5/real-check.md` (M5), `docs/m6/real-check.md` (M6, C'de oluşur), `docs/m7/real-check.md` (M7, D'de oluşur), `docs/m4/real-check.md` M4c §4 (video başına kullanım). Ledger satırları ilgili taşın `.superpowers/sdd/…/progress.md` dosyasına `Ruling:` ile.

**Genel durdurma koşulları (her bölümde geçerli):**
- Claude kullanımı: başlamadan `GET /api/usage/guard`; gerçek koşu ancak 5 sa < %25 ve 7 gün < %70 iken başlar; koşu içinde 5 sa > %80 → iptal. `npm run test:smoke:real` adım 1 de gerçek kullanım harcar (haiku, tek tur).
- `failed` ya da `needs_human` biten bir gerçek koşu **tekrarlanmaz**; gerekçe ve son artefaktlar kayda.
- VideoGen'den gerçek TikTok'a en çok **iki** taslak (ikincisi yalnızca ilki gerçek bir hatayla düştüyse ve neden düzeltildiyse). Güvenli alan kartı bu sayıya girmez (VideoGen'den gönderilmez).
- Gizli bilgiler (token, client secret) hiçbir kayda, ekran görüntüsüne ya da sohbete yazılmaz.

**Karar (M7, bu dosya): B ve C gerçek kurulumda koşar.** Eski tarifler gerçek koşuları geçici bir veritabanında (`videogen_m5c_check`) yapıyordu. Ama C'deki gerçek taslak B'nin "yayına hazır" videosunu gönderir ve TikTok token'ı `~/tiktok-poster`'dan veri dizinine **taşınır** (kopyalanmaz); geçici dizin silinince token da giderdi. Bu yüzden B ve C varsayılan kurulumda (`~/videogen-data`, `videogen` veritabanı) yapılır; öncesinde A.6'da bir yedek alınır. Audit satırları kalıcıdır; bunlar gerçek ürün kayıtlarıdır.

---

## 0. Hazırlık

- [ ] **0.1 Kod:** `git switch main && git pull` → HEAD M7 kapanış commit'i. `npm ci`.
- [ ] **0.2 Node:** `node -v` → v24.18 ya da üstü (`package.json` `engines`).
- [ ] **0.3 Postgres:** `npm run db:up && npm run db:migrate` → "migrations applied" (0010 dahil).
- [ ] **0.4 Araçlar:** `nvidia-smi` gerçek kartı gösterir (6 GB, RTX 3060 Laptop); Blender `~/apps/blender-5.2.2-linux-x64/blender` (ya da `VG_BLENDER`); `/usr/bin/bwrap`; `/usr/bin/google-chrome`; ffmpeg 7.
- [ ] **0.5 Ses venv'i:** `python/audio_service/.venv` ve modeller yerinde (`python/audio_service/PINS.md`; **`uv sync` asla**).
- [ ] **0.6 Disk:** `df -h ~` ≥ 30 GB boş.
- [ ] **0.7 TikTok kaynakları:** `~/tiktok-poster/.env` ve `~/tiktok-poster/tokens.json` var (C'de taşınacak).
- [ ] **0.8 Pilot dosyası:** `~/icinde-ne-var/pilot-kalem/remotion/out/icinde-ne-var-kalem.mp4` var (yoksa `VG_PILOT_VIDEO` ile yolu verilir).
- [ ] **0.9 Claude girişi:** `claude auth status` → giriş yapılmış; `env | grep ANTHROPIC_API_KEY` boş.

## A. Tam doğrulama (M5c T12 Step 1, güncel sayılarla)

- [ ] **A.1** `npm run typecheck && npm test` → `Tests 504 passed`. Süreyi kaydet (bulutta ~190 sn, 3 işçi; makinede `VG_TEST_WORKERS` çekirdek sayısına göre). Beklenen ≤ 6 dk.
- [ ] **A.2** `npm run test:blender` → `Ran 19 tests … OK` (M5a'nın iki final testi ilk kez gerçek Blender'da).
- [ ] **A.3** `npm run test:render` → **17 passed** (Blender'sız 12 + Blender'lı 5). Sayı farklıysa nedeni M7 ledger'ına `Ruling:`.
- [ ] **A.4** `cd python/audio_service && .venv/bin/pytest -q` → **50 passed** (gerçek venv, torch/Chatterbox ile).
- [ ] **A.5** `npm run test:smoke` → **24 passed / 16 skipped** (S1–S8). S8'in bu makinedeki ölçümleri (p50/p95/p99, > 16,8 ms kare sayısı, DOM satır sayısı, boşta `TaskDuration`) test çıktısından `docs/m7/real-check.md`'ye.
- [ ] **A.6 Temizlik:** `/tmp/videogen-smoke` ve `~/.vg-render-test-*` yok; 5173/5180/5190 boş; `render-cli`, `blender`, `chrome-for-testing`, `voice_cli` süreci yok; `nvidia-smi` süreç listesi boş.
- [ ] **A.7 Gerçek kurulumun ilk yedeği:** `npm start` (ya da `VG_NO_BROWSER=1 npm start`) bir kez açılıp kapanır (migration), sonra `node bin/backup.mjs now` → `~/videogen-data/backups/videogen-<tarih>.dump`, `node bin/backup.mjs list`. Konak `pg_dump` sunucuyla aynı ana sürümde değilse çözücü `docker exec`'e düşer; ikisi de yoksa `VG_PG_DUMP` ayarlanır. Kayıt: dosya, bayt, yol türü (`host`/`docker`/`custom`).

## A.8 Güvenli alan kalibrasyonu (M7 Y16; B'deki gerçek koşulardan önce)

Neden önce: güvenli alan compose'un `inputHash`'ine girer; B'nin finalleri kalibre alanla üretilir. Sonradan değişirse finaller yeniden compose edilmelidir.

- [ ] **A.8.1** `node bin/safe-area.mjs card` → `~/videogen-data/calibration/safe-area-card.mp4` ve `.png`. PNG'yi aç: 10 px'te bir çizgi, 50 px'te bir etiket, sağ ve sol kenarda cetvel, kesik çizgiyle varsayılan alan.
- [ ] **A.8.2** MP4'ü telefona **elle** aktar (kablo/AirDrop). VideoGen'in yayın yolu ve API taslak sınırı kullanılmaz.
- [ ] **A.8.3** TikTok uygulamasında yükle → "Kimler izleyebilir: **Yalnızca ben**" → paylaş → profilden videoyu akış görünümünde aç → ekran görüntüsü al (üst çubuk, sağ düğme sütunu, alttaki açıklama/müzik satırı görünür olmalı) → paylaşımı **sil**.
- [ ] **A.8.4** Ekran görüntüsünde arayüz öğelerinin başladığı cetvel değerlerini oku: üst (üst çubuğun bittiği y), alt (açıklama metninin başladığı y), sağ (düğme sütununun sol kenarına sağdan uzaklık), sol (sol kenar boşluğu).
- [ ] **A.8.5** Ayarlar → "Güvenli alan" → dört değer, not alanına cihaz ve TikTok sürümü → Kaydet (ya da `node bin/safe-area.mjs set --top … --bottom … --right … --left … --note "…"`). Varsayılandan > 150 px sapan değerde uyarı çıkar; değeri yeniden kontrol et.
- [ ] **Kayıt:** `docs/m7/real-check.md` "Güvenli alan" tablosu (eski/yeni değerler, cihaz, tarih) ve ekran görüntüsünün kırpılmış bir kopyası `docs/m7/real-safe-area.png` (kişisel bilgi içermeyecek biçimde).

## B. M5 kapanışı (M5c T12 Step 2–9)

- [ ] **B.1 Kalem pilotu kalibrasyonu** (M5c T12 Step 2; `docs/m5/real-check.md` §1):
  `node --import tsx apps/worker/src/render/qc-cli.ts ~/icinde-ne-var/pilot-kalem/remotion/out/icinde-ne-var-kalem.mp4 > /tmp/pilot-qc.json; echo "çıkış $?"` ve `grep '^✗' /tmp/pilot-qc.json`.
  Beklenen: çıkış 3; en az `d6_loudness`, `d6_lra`, `d6_first_audio`, `d6_silence`, `d3_freeze`, `g1_color`, `g6_edges` `✗`. Eksik varsa eşik gerekçeyle ayarlanır, `RUBRIC_VERSION` `final@2`, `Ruling:`. Kayıt: `real-check.md` §1 tablosu.
- [ ] **B.2 Ses servisi gerçek ölçümü** (M5c T12 Step 3): B.4'teki seslendirmeli koşunun `voice` adımında model yükleme süresi, `rtf_gen`, tepe VRAM (`nvidia-smi` 0,25 sn örnekleme), satır CER dağılımı, yeniden deneme sayısı, Whisper kelime zamanlarının altyazıyla uyumu (5 rastgele kelime, ±0,5 sn), CLI'ın tepe RSS'i. Blender ile çakışma olmadığı audit sırasından gösterilir.
  **M7 eki:** ölçülen tepe RSS ve en uzun `voice` süresine pay ekleyerek `VG_AUDIO_MAX_RSS_MB` ve `VG_AUDIO_TIMEOUT_MS` değerlerini belirle (varsayılan 6000 MB, 900 000 ms); farklıysa başlatıcının ortamına yaz ve runbook §6'ya not düş. Kayıt: `real-check.md` "M5c" bölümü.
- [ ] **B.3 Koşu A — "tükenmez kalem", seslendirmesiz** (M5c T12 Step 4A; M5b-3'ün yerine):
  - Önkoşul: Varlıklar sayfasından ya da `node bin/assets.mjs add --kind music …` ile **izinli bir müzik** (CC0/CC-BY/Pixabay; CC-BY'de atıf zorunlu). Müzik yoksa koşu `needs_human` ile biter (bilinen sınır).
  - Kapı: kullanım koşulları (yukarıda). Roller K12 (override yok).
  - Stüdyo → ürün adı "tükenmez kalem" → Seslendirmesiz → Üret. "Yayına hazır"a kadar izle.
  - Kayıt (`real-check.md` M5b-3 tabloları): rol başına tur, token, maliyet eşdeğeri, süre; taslak ve final turları; reviewer kararları ve tur özetleri; fixer kapsamları (`fix.scope`); `final_render` ve `compose` süreleri; `render.final_mixed_samples` var mı; **video başına kullanım** (toplam token, oturum, `fiveHourDelta`, süre) → ayrıca `docs/m4/real-check.md` M4c §4.
  - Reviewer isabeti: bulgular ile göz incelemesi kontrol kontrol.
  - **M7 eki:** kütüphane detayında Sürümler sekmesi (düzeltme turu olduysa Karşılaştır'da iki sürüm), Review'lar sekmesinde tur seçici, Audit sekmesi (video süzgeci).
  - Görseller: `docs/m5/real-review-sheet.png`, `docs/m5/real-studio-m5b.png`.
- [ ] **B.4 Koşu B — "tükenmez kalem", seslendirmeli** (M5c T12 Step 4B): A bittikten sonra, kullanım koşulları yeniden sağlanınca (gerekirse pencerenin sıfırlanması beklenir; en çok 6 sa).
  - Kayıt: A ile aynı + seslendirme iddiaları ve sözlü kanca için reviewer isabeti.
  - **M7 eki:** `fix_hint` artık doğruluk reviewer'ının kontrollerinde şablon (M7 Y19). Fixer bir doğruluk bulgusunu düzeltmeye çalıştıysa düzeltmenin isabetini not et (şablon ipucu yeterli miydi?).
  - Görseller: `docs/m5/real-voice-sheet.png` (son turun kontakt sayfası, altyazı bandı görünür), `docs/m5/real-studio-m5c.png`.
- [ ] **B.5 🚦 K17 dinleme onayı** (M5c T12 Step 5): `listening_test.py`'nin çok cümleli sürümüyle B'nin `vo_text`'i (≥ 6 cümle) 3 tohum × (Chatterbox hazır, Freya Leyla) → `~/videogen-data/m5c/listening/index.html` (kör sayfa kuralları: nötr adlar, karıştırma, RMS eşitleme, 48 kHz) + B'nin müzikli finali. Tek soru: "Hangi örnek daha doğal ve neden? Varsayılan anlatıcı Chatterbox hazır ses kalsın mı, Freya mı olsun, yoksa kendi sesinizden klon mu (klon her seslendirmeli videoda AI etiketi demektir)?" Yanıta göre `docs/m1/decision.md` §1/§7, spec K17 ve §9, Ayarlar → Anlatıcı sesi. Yanıt yoksa K17 GEÇİCİ kalır.
- [ ] **B.6 Son review (gerçek koşu bulguları için):** M5b + M5c kod review'u bulutta yapıldı (`docs/m5/m5c-summary.md` §8). Burada yalnızca A ve B'nin gerçek koşu bulguları değerlendirilir; Critical/Important → RED → GREEN, ayrı commit.
- [ ] **B.7 Dokümanlar** (M5c T12 Step 7): `m5c-summary.md` §4 kalibrasyon, §5 gerçek koşular ve kullanım, §6 ekranlar; checklist M5 satırları; runbook §6 ses servisi; spec notları yalnızca kanıtla (M5c planı T12 Step 7 listesi).

## C. M6 kapanışı (M6 T9)

- [ ] **C.0 Ön koşullar** (Step 0): B bitti, en az bir `ready` video var (tercihen B). K17 kararı ve B'nin final boyutları M6 Y5 (≤ 64 MB tek parça) ve Y9 (AI etiketi) ile yeniden okunur; sapma `Ruling:`.
- [ ] **C.1 Doğrulama** (Step 1): A.1 ve A.5 bugün yapıldıysa tekrarlanmaz.
- [ ] **C.2 Bağlantı** (Step 2):
  - `~/tiktok-poster/tokens.json`'un yalnızca alan **adlarını** oku (değerleri değil) ve M6 Y3 beklentisiyle karşılaştır.
  - `node bin/tiktok.mjs import` → "Bağlandı: @whats.inside59; ~/tiktok-poster/tokens.json taşındı". Başarısızsa Ayarlar → TikTok bağlantısı → "Bağlan" (PKCE, tarayıcıda onay).
  - Ayarlar → "Bağlantıyı sına" → `maxDurationS`, gizlilik seçenekleri (`PUBLIC_TO_EVERYONE` beklenir).
  - Kayıt (`docs/m6/real-check.md`): tarih, kullanıcı adı, scope'lar. Token içeriği yazılmaz. Not: bundan sonra `post.py` çalışmaz (bilinçli).
- [ ] **C.3 🚦 Bir gerçek taslak** (Step 3):
  - B'nin videosu (yoksa A), **Müziksiz** varyant → Yayınla → "TikTok'a taslak gönder".
  - Ölç ve kaydet: dosya boyutu, `init` → `SEND_TO_USER_INBOX` süresi, yoklama sayısı, dönen durumlar.
  - Kullanıcı TikTok'ta taslağı açar, açıklamayı yapıştırır, uygulamadan ses ekler, **Herkes** ile paylaşır, AI etiketi gerekiyorsa açar.
  - VideoGen'de "Yayınlandı olarak işaretle" (URL ile). Ekran: `docs/m6/real-publish-panel.png`.
  - Başarısızlıkta en çok bir tekrar ve yalnızca neden düzeltildiyse.
  - "Shorts için indir" → dosya oynar; açıklamada müzik atıfı var.
- [ ] **C.4 Son review** (Step 4; tek bağımsız ajan, salt okunur): M6'nın `git diff` aralığı (`279df11..75c25da`) + M6 planı Review Focus + spec §10/§14/§15 + M6 ledger + `docs/m6/real-check.md`. Özellikle yinelenen taslak, limit yarışı, gizli bilgi, 3455 dinleyicisi ve `state`, `upload_url`'e Authorization sızmaması, atıflar, AI etiketi onayı, `markPublished` transaction'ı. (`fix_hint` maddesi M7'de kapatıldı; burada yeniden açılmaz.) Critical/Important → RED → GREEN.
- [ ] **C.5 Dokümanlar** (Step 5): `docs/m6/m6-summary.md` (§1–§10), checklist M6 satırları ve karar tablosu (Y2, Y3, Y8, Y9, Y11, Y16), spec notları (M6 planı T9 Step 5 listesi), roadmap, README.

## D. M7 gerçek denetimleri

- [ ] **D.1 `npm run test:smoke:real`** (M7 Y14): altı adım sırayla (haiku tek tur → kullanım okuması → NVIDIA Blender 2 kare 270×480 → Remotion still 1080×1920 → tek cümle TTS + CER ≤ %5 → kalem pilotu qc, 7 beklenen `✗`). Beklenen: hepsi `pass`, çıkış 0. Rapor `~/videogen-data/reports/real-smoke-<tarih>.json`. `fail` olan adım için neden ve düzeltme `docs/m7/real-check.md`'ye; düzeltme ayrı commit.
- [ ] **D.2 G6'nın gözle denetimi:** A ve B finallerinin inceleme kontakt sayfalarında güvenli alan bandı A.8'deki değerlerle çiziliyor; etiket ve altyazılar bandın içinde.
- [ ] **D.3 S8 makinede** (A.5'te koşulduysa yalnızca sayıları karşılaştır): `npx playwright test -c tests/smoke/playwright.config.ts s8` → 2 passed.
- [ ] **D.4 Yedek provası:** `node bin/backup.mjs now` → `node bin/backup.mjs restore ~/videogen-data/backups/videogen-<tarih>.dump --into videogen_restore_check` → "audit_verify: ok · N satır" ve tablo sayıları canlı veritabanıyla tutarlı → `docker exec videogen-pg psql -U videogen -d videogen -c "DROP DATABASE videogen_restore_check"`. Kayıt: süre, dosya boyutu, satır sayıları.
- [ ] **D.5 🚦 Çöp toplama:** Ayarlar → Veri ve yedek → "Çöp toplama" → "Rapor oluştur" (ya da `node bin/maintenance.mjs gc-report`; CLI en büyük 20 adayı listeler, `report` son raporu gösterir). Adayları gözden geçir. Silmek kullanıcının kararıdır ve yalnızca Ayarlar'dan yapılır: "Sil…" → aday sayısını yaz → onayla. Silme, son 24 saatte alınmış başarılı bir yedek ve 24 saatten yeni bir rapor ister (D.4'ün yedeği yeter). Silinenler 7 gün `~/videogen-data/trash/<tarih>/`'te durur; geri almak için `node bin/maintenance.mjs restore-blob <sha>`. Kayıt: aday sayısı, MB, silindi mi.
- [ ] **D.6 Yetim raporu:** `node bin/maintenance.mjs orphans` → diskte olup DB'de olmayanlar, tersi, boyutu tutmayanlar, sahipsiz `runs/` klasörleri. Hiçbiri otomatik silinmez; bulguların nedeni not edilir.
- [ ] **D.7 Kayıt:** `docs/m7/real-check.md` (D.1–D.6 + A.5'in S8 sayıları + A.8).

## E. Kapanış

- [ ] **E.1 Spec notları (yalnızca gerçek kanıtla):** §18 güvenli alan satırı (kalibre değerler), §18 video başına kullanım ve VRAM satırları (B), K17 (B.5), §10 tek parça boyutu (C.3), §17 M5/M6/M7 durumları.
- [ ] **E.2 Özetler:** `docs/m5/m5c-summary.md`, `docs/m6/m6-summary.md`, `docs/m7/m7-summary.md` §7 ("makinede bekleyenler" → kapandı).
- [ ] **E.3 Takip:** `docs/superpowers/checklist.md` (M5, M6, M7 satırları ve karar tablosu), roadmap, README.
- [ ] **E.4 `main`:** dal `main`'e fast-forward (PR yok, force-push yok); `npm run typecheck && npm test` → 504; push.
- [ ] **E.5 Türkçe rapor:** Maddeler / Doğrulama / Bilmen gerekenler; açık kararlar (K17, K19, müzik kürasyonu, D6 alt puanları, `final@2`, Direct Post için TikTok audit başvurusu, LLM açıklama, izlenme verisi girişi).
