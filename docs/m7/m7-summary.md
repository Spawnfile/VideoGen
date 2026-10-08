# M7 — Sertleştirme: özet

| | |
|---|---|
| Tarih | 2026-10-08 |
| Dal | `claude/elegant-keller-bgsue7` (başlangıç `fe889ee` = incelenmiş M7 planıyla `main`; ledger commit'i + 12 görev commit'i + bu doküman görevi) |
| Plan | `docs/superpowers/plans/2026-10-08-m7-hardening.md` (13 görev). T1–T12 uygulandı; T13 bu özet, makine kontrol listesi ve takip dokümanları |
| Ortam | Bulut konteyneri: 4 çekirdek, GPU yok, Blender yok, ses venv'i ve modeller yok, gerçek Claude ve gerçek TikTok yok (Fake sürücüler). Node 24.21 (`/opt/node24/bin`; PATH'teki ilk `node` 22 olduğu için her doğrulama bu yolla), ffmpeg 7.0.2, Postgres 17.11 (docker, 5433) |
| Durum | Audit gezgini, kütüphane detayı ve sürüm karşılaştırma, varlık defteri arayüzü, günlük yedek ve geri yükleme CLI'ı, onaylı blob çöp toplama ve yetim raporu, tek kaynaklı güvenli alan ve kalibrasyon kartı, `test:smoke:real` profili, ertelenen bulguların seçilenleri, smoke S7/S8 bulutta çalışıyor. `npm test` 504, paralel, ~175–195 sn. **Bekleyen (kullanıcının makinesi):** `docs/machine-checklist.md` (bu taşın gerçek denetimleri D bölümünde) |
| Kanıt | Bu dosya, `docs/m7/*.png`, ledger `.superpowers/sdd/2026-10-08-m7-hardening/progress.md`, git geçmişi (`fe889ee..HEAD`) |

## 1. Ne çalışıyor

- **`npm test` paralel** (T1): test dosyaları paralel işçilerde koşar (`VG_TEST_WORKERS`, varsayılan `min(3, çekirdek − 1)`); her dosya migration'ı bir kez uygulanmış bir şablon veritabanından kopyalanan kendi veritabanını alır. Yarım kurulan şablon geçerli sayılmaz (`_building` + yeniden adlandırma), eşzamanlı kopyalar kilit altında. Artık test veritabanları `npm run db:test-clean` ile silinir (otomatik silme yok). M5c H18 gereği uçtan uca testler `npm test`'te kaldı.
- **Migration 0010 ve audit sorguları** (T2): audit indeksleri, varlık iptal alanları, `maintenance_runs`. `GET /api/audit` süzgeçler (run, video, rol, eylem, tarih aralığı) ve kararlı bir imleçle sayfalar; `GET /api/audit/:seq` ham satırı, araç girdisini (oturumun `tool_use` bloğundan), transcript, artefakt ve iz bağlantılarını verir; `GET /api/audit/verify` süreli ve kısa süre önbellekli (`cached`).
- **Audit gezgini** (T3): Audit sayfası; süzgeçler URL'de, zincir durumu üstte, satır detayında ham satır, araç girdisi (Edit için önce/sonra diff'i, Write için içerik, diğerleri JSON), transcript, artefakt ve iz bağlantıları. Tarihler İstanbul günü olarak girilir.
- **Kütüphane detayı** (T4): `/library/<videoId>` sekmeleri Sürümler · Review'lar · Storyboard · Araştırma ve kaynaklar · Audit · Yayın. İki finalli sürüm yan yana ya da A/B oynatılır, altta puan ve boyut farkları; inceleme panelinde tur çipleri.
- **Varlıklar sayfası** (T5): müzik, SFX ve ses örneği defteri; lisans alanları, kullanım yerleri, önizleme, arayüzden yükleme (en çok 200 MiB, ffprobe denetimli) ve içe aktarma, gerekçeli izin geri alma (API ve `node bin/assets.mjs revoke`). Geri alınan bir varlığı compose, fixer, seslendirme ve yayın kullanmaz; anlatıcının kendi ses örneği geri alınırsa anlatıcı hazır sese döner.
- **Yedek** (T6): worker'daki `MaintenanceService` günde bir `pg_dump -Fc` alır (sahip rolüyle, migration tablosu dahil), son 7 dosya kalır (`VG_BACKUP_KEEP`). `pg_dump` çözücüsü konak aracının ana sürümünü sunucuyla karşılaştırır, uymazsa `docker exec` ile konteynerdekini kullanır; `VG_PG_DUMP`/`VG_PG_RESTORE` ile elle verilebilir. `node bin/backup.mjs now|list|restore <dosya> --into <yeni_db>`: geri yükleme yalnızca var olmayan bir veritabanına yapılır, ardından `audit_verify` ve tablo sayıları yazılır.
- **Çöp toplama ve yetim raporu** (T7): haftalık (pazartesi) referanssız blob raporu; silme yalnızca Ayarlar → "Veri ve yedek"ten, aday sayısını yazarak onayla ve son 24 saatte alınmış bir yedekle. Silinen dosyalar 7 gün çöp kutusunda durur (`node bin/maintenance.mjs restore-blob <sha>`). Yetim raporu (diskte olup kaydı olmayan, tersi, boyutu tutmayan, sahipsiz run klasörü) hiçbir şey silmez; yalnızca 1 saatten eski yükleme artıklarını temizler. Footer'da boş disk (< 10 GB uyarı, < 3 GB kırmızı).
- **Güvenli alan** (T8): `packages/shared/src/safe-area.ts` tek kaynak; ayar `settings.safe_area`'da, compose sırasında `layout.json`'a yazılır ve G6, kontakt sayfaları ve qc oradan okur. Ayarlar → "Güvenli alan" ve `node bin/safe-area.mjs card|show|set`; kalibrasyon kartı bir Remotion still'i ve 5 sn'lik MP4'tür (10 px'te bir çizgi, 50 px'te etiket, iki kenarda cetvel, kesik çizgiyle varsayılan alan).
- **`npm run test:smoke:real`** (T9): spec §16.3'ün altı gerçek denetimi tek komutta; ücretli anahtar, 5 sa ≥ %80 ya da okunamayan kullanım → çıkış 2 ve rapor yok; herhangi bir `fail` → çıkış 1. Geçici veri dizini ve geçici veritabanıyla koşar; rapor `<dataDir>/reports/real-smoke-<tarih>.json`.
- **Ertelenen bulgular** (T10, T11): G4 notu seslendirme izi yokken doğru metni söylüyor; seslendirme turu dışında vuruş kimlikleri kilitli; review bayatlığı seslendirmeyi de denetliyor; ses CLI'ının süre ve RSS sınırları config'den (`VG_AUDIO_TIMEOUT_MS`, `VG_AUDIO_MAX_RSS_MB`); başarısız bir geri sarma run'ı boşta bırakmıyor. Doğruluk reviewer'ının `fix_hint`'i şablondan üretiliyor, WebFetch yalnızca o reviewer'ın hedef URL'lerine; yayın durumu SSE ile geliyor; kısayollar Shift, tuş tekrarı ve IME ile tetiklenmiyor.
- **Smoke S7, S8 ve pencereli iz** (T12): S7 audit gezginini, S8 performans bütçelerini 4× CPU yavaşlatmasında ölçer. 200 satırı geçen iz pencereli çizilir (DOM'da en çok 400 satır).

## 2. Görevler ve commit'ler

| # | Görev | Commit |
|---|---|---|
| — | Yürütme defteri | `6a6ea1d` |
| T1 | Paralel `npm test`, şablon veritabanı | `0e093af` |
| T2 | Migration 0010, audit sorguları ve uçları | `8c145a2` |
| T3 | Audit gezgini | `fd1f317` |
| T4 | Kütüphane detayı, karşılaştırma, tur seçici | `64a5852` |
| T5 | Varlıklar sayfası, yükleme, izin geri alma | `6f2c86a` |
| T6 | Günlük yedek, döndürme, geri yükleme CLI'ı | `7366f2e` |
| T7 | Blob çöp toplama, yetim raporu, Ayarlar "Veri ve yedek", footer'da disk | `6a9d2c3` |
| T8 | Tek kaynaklı güvenli alan, kalibrasyon kartı | `f318513` |
| T9 | `test:smoke:real` profili | `67d6ea3` |
| T10 | Ertelenen bulgular (boru hattı) | `c678613` |
| T11 | Ertelenen bulgular (`fix_hint`, WebFetch, SSE, kısayollar) | `6aa6e51` |
| T12 | Smoke S7/S8, pencereli iz, M7 ekranları | `bb415fc` |
| T13 | Makine kontrol listesi ve dokümanlar | bu dokümanların commit'i |

## 3. Doğrulama ve süreler (bu ortamda)

Her görevden sonra `npm run typecheck && npm test` (Node 24). Başlangıç 462 test, seri 332 sn; paralel sondaj (3 işçi) 147 sn.

| Görev | `npm test` | Süre | Smoke |
|---|---|---|---|
| T1 | 463 | 156 / 152 / 148 sn (üst üste üç koşu), Node 24 ile 156 sn | — |
| T2 | 468 | 153 sn | — |
| T3 | 470 | 152 sn | 21 / 15, 260 sn |
| T4 | 474 | 154 / 164 sn | 21 / 15, 4 dk 38 sn |
| T5 | 479 | 167 sn | 21 / 15, 281 sn |
| T6 | 483 | 176 sn (`backup.test.ts` 6,3 sn; 5,2 sn'si gerçek docker döküm + geri yükleme) | — |
| T7 | 490 | 179 / 192 sn | 21 / 15, 4,8 dk |
| T8 | 493 | 202 sn (yetim bir vitest işçisi yüzünden şişkin; T9'da yeniden ölçüldü) | 21 / 15, 4,8 dk |
| T9 | 495 | 187 sn | — |
| T10 | 500 | 193 sn | — |
| T11 | 504 | 195 sn | 21 / 15, 294 sn |
| T12 | 504 | 174 sn | **24 / 16, 336 sn** (~5,6 dk; S8 ~67 sn) |

- Smoke bulutta GPU'suz konteynerde `nvidia-smi` yerine geçen bir betikle koşuldu. S6'nın ilk testi T11'den sonra "Gelen kutusunda"ya 4,1 sn'de ulaşıyor (SSE; 10 sn'lik yedek yoklama değil).
- `test:render`: bulutta yalnızca T8'in yeni kalibrasyon kartı testi koşuldu (1 geçti, ~34 sn, `VG_REMOTION_GL=swangle`). Beklenen sayılar Blender'sız 12, Blender'lı 17 (makinede A.3).
- `test:blender` (19) ve ses servisi pytest'i (50) M7'de değişmedi ve bu ortamda koşulmadı.
- `test:smoke:real`: bulutta yalnızca `--help` ve `ANTHROPIC_API_KEY` reddi elle denendi (çıkış 2; veritabanı, geçici dizin ve rapor oluşmadı). Hiçbir gerçek adım koşulmadı.

**S8 ölçümleri** (4× CPU, 240 kare, üç ölçümün medyanı):

| Sahne | Önce | Sonra |
|---|---|---|
| (a) adım listesi + 3 açık agent kartı | p95 16,7 ms | p95 16,7 ms |
| (b) 1000 satırlık iz | p95 300 ms, 1000 satır DOM'da (planlandığı gibi FAIL) | p95 16,8 ms, p99 ~66,7 ms, 240 karenin 7–8'i yavaş, 225 satır DOM'da |
| Boşta Stüdyo (10 sn) | — | `TaskDuration` 0,068 sn (koşular arasında 0,07–0,13), uzun görev yok |

## 4. Ekranlar

`VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens -g M7` → `docs/m7/`:

- `audit.png`: audit gezgini (süzgeçler, zincir durumu, satır detayı).
- `library-compare.png`: kütüphane detayında iki sürümün karşılaştırması.
- `assets.png`: varlık defteri.
- `settings-data.png`: Ayarlar → "Veri ve yedek".

Görüntüler okunup denetlendi. Kozmetik notlar: başsız Chrome tarih kutularında `mm/dd/yyyy` gösteriyor; ses önizlemeleri `0:00` okuyor; karşılaştırma ekranındaki ikinci sürüm SQL ile eklendi ve aynı klibi kullanıyor (yalnızca ekran için).

## 5. Sapmalar (`Ruling:` özetleri)

**Ortam ve test altyapısı**
- Node: PATH'teki ilk `node` v22; T1'den itibaren her doğrulama `PATH=/opt/node24/bin:$PATH` ile.
- T1: `runMigrations`'a isteğe bağlı migration klasörü eklendi ve test yardımcıları `cloneTemplate`/`withDb`'yi dışa aktarıyor (plan dosya listesi dışında); `createTestDb()` imzası aynı. Ağır dosyalarda zaman aşımı describe başına 60 sn. Şablon kopyası az kazandırıyor (doğrudan migration ~0,18 sn); kazanç paralel dosyalardan.
- **M5c H18 korundu:** qc adımının uçtan uca testi `npm test`'te kalır; M6 T3'ün "ağır testi taşı" notu geçersiz.
- T2'nin "5000 satır, video süzgeci" zamanlama testi paralel yükte bir kez düştü (200 ms): artık üç denemenin en iyisi < 500 ms; test indeks kullanımını korur, VM hızını değil.
- T7: test havuzlarına hata dinleyicisi eklendi (teardown'da `DROP … FORCE` boştaki bir istemciyi öldürünce 57P01 işlenmemiş kalıyordu; paylaşılan yardımcı, T7 listesi dışında).
- T10: yeni orkestratör testinde ilk orkestratör ikinci run'ın işlerini alıyordu; artık önce durduruluyor (dosya tek başına 3/3).

**Audit**
- Araç girdisi, `tool_use` bloğunu içeren asistan olayından okunur (jsonb `@>`), çünkü o olayda `agent_events.tool_use_id` dolu değil.
- Kırpma: 4000 karakter + "…[kırpıldı]"; 32 KB'yi geçince 1000/250/60 karaktere, sonra JSON önizlemesine iner (`links.tool.truncated`). Tarih aralığı yarı açık; rol `actor_id = rol` ya da `rol:` önekiyle eşleşir; bilinmeyen ya da sayısal olmayan `seq` → 404.
- Arayüzde tarih süzgeçleri kapsayıcı İstanbul günleri; eylem tonları son parçaya göre (failed/rejected/refused hata, cancel gri uyarı, completed/succeeded/done başarılı).

**Kütüphane ve karşılaştırma**
- `VersionView` boyut farkları için `dims` taşır; varsayılan çift A = en iyiden önceki finalli sürüm, B = en iyi (farklar B − A). "Stüdyo'da aç" detay başlığında. Tek bir taşıma iki karşılaştırma kipini sürer, yan yana kipte B sessiz. Olmayan bir tur istenirse panel en yeni tura düşer.

**Varlıklar**
- Ortak çekirdek `importAssetFile` (worker `importAsset`'i korur); API ve CLI aynı `revokeAssetAudited`'ı kullanır (iptal + `asset.revoked` + anlatıcı sıfırlama tek transaction'da). Fastify akış ayrıştırıcılarına `bodyLimit` uygulamadığı için 200 MiB sınırı bayt sayacı ve `Content-Length` ön denetimiyle (413). İçe aktarma yeni 201 / mükerrer 200; zaten geri alınmış 409. Anlatıcı PUT'u ile iptal yarışı kullanım anında yakalanır (ön kontrol, `voice` adımı).

**Yedek: sahip rolüyle `pg_dump`, docker yedeği**
- Döküm sahip rolüyle (uygulama rolü `drizzle` şemasını okuyamaz). `VG_PG_DUMP`/`VG_PG_RESTORE` geçersiz kılması aynı bağlantı argümanlarını alır ve sürüm denetiminden geçmez (docker ile verilirse `-e PGPASSWORD` taşımalı). Döküm 30 dk zaman aşımlı bir süreç grubunda; ölen bir worker'ın bıraktığı `.tmp` bir sonraki denemede silinir. `bin/backup.mjs now` süreç içinde sahip olarak koşar (tek çalışan satır çakışmayı önler). Geri yükleme çıkış kodları: 2 reddedildi, 1 yükleme başarısız (yeni DB silinir), 4 yüklendi ama `audit_verify` bozuk. Geçersiz `VG_PG_*`/`VG_BACKUP_KEEP`/`VG_MAINTENANCE_MS` açılışı reddeder.

**Çöp toplama: blob kilidi ve çöp kutusu**
- Çöp toplama çekirdeği `@videogen/db`'de (`packages/db/src/gc.ts`; API onaylı silmeyi kendisi koşar ve 200/409 döner). Blob başına advisory kilit kendi ad alanında: `putBlob` paylaşımlı, silme ve geri getirme özel.
- Referans kümesi her `jsonb` sütununu tarar; `audit_log.data` (geçmiş) ve `maintenance_runs.detail` (raporun kendi listesi) hariç. Etkin run koruması zamana göre (en eski kuyruktaki/çalışan run'dan beri dokunulan blob'lar). Haftalık rapor `maintenance.weekly` ayarıyla; worker bütün pazartesi kapalıysa telafi yok. Footer'da < 10 GB uyarısı mürekkep rengi (paletteki sarı yok), < 3 GB kırmızı.

**Güvenli alan**
- `renderStill` bundle önbelleğini de alır. M7'deki güvenli alan değişikliği mevcut compose hash'lerini bir kez geçersiz kılar (gerçek final henüz yok). Taslaklar varsayılan alanda kalır; ayarı yalnızca compose (ve `layout.json` üzerinden final kontakt sayfaları) okur; `layout.json`'u olmayan finallerin qc kenar bantları varsayılanı kullanır.

**`test:smoke:real`**
- Adım sonucu `{status, evidence, reason?}`, süreyi koşucu ölçer. Eksik araç ya da girdi `fail` (gerekçeyle), `skip` yalnızca `--only`/`--skip` ile. Adım 1'de herhangi bir `hook_*` olayı sızıntı sayılır; adım 3 örnek kalemin 0. ve 675. karesini 270×480 çizer; adım 4 kalibrasyon kartının ilk karesi 1080×1920; adım 5 hazır anlatıcıyla tek sabit cümle; adım 6 qc-cli gibi `--layout` olmadan. `tsconfig` `bin/*.ts`'i içerir (dosya listesi dışında).

**Ertelenen bulgular**
- Y18 (8): en yeni olmayan bir seslendirmeyle karışmış final bayattır; mevcut G4 panel testi bu yüzden en yeni izi inceliyor (kurulum değişti, doğrulama silinmedi). Seslendirme bayatlığının kendi mesajı var: "final video güncel seslendirmeyle uyuşmuyor (bayat artefakt, §8.3)".
- **`fix_hint` şablonu:** `reviewer_facts`'in sahip olduğu her kontrolde ipucu şablondan ("<etiket>: <rubrik sorusu>"); iddia kimliği yalnızca orkestratörün G2 bulgusundan (temizlenerek), yoksa "ilgili iddia". **Tam URL ile WebFetch:** `webAllow` olmadan başlatılan bir `reviewer_facts` oturumu (yeniden deneme/sürdürme) boş liste alır (kapalı kalır); URL'ler ayrıştırılarak karşılaştırılır. Yalnızca Shift+harf yok sayılır (Shift+Boşluk oynatır).

**Smoke S7/S8 ve pencereli iz**
- **Asimetrik pencere:** pencereli iz 0,25 ekran geride / 2,75 ekran ileride çizer (kaydırma yönü yoksa ± 1 ekran). 4× yavaşlatmada her pencere kayması boyutundan bağımsız 1–2 uzun kareye mal oluyor; simetrik ± 1 ekran S8'de bir koşuda p95 33 ms ile düştü. 16,8 ms bütçesi (spec §16.2) gevşetilmedi.
- Kapanan düşünme blokları satırlarını DOM'dan kaldırır (S8 `data-rows`'tan sayar). S7 araştırmaya kadar giden bir Fake run kullanır; araç girdisi kütüphane detayının Audit sekmesinden açılır (`agent.tool` satırlarında yalnızca `session_id` var). rAF aralıkları yüzdelikten önce 0,1 ms'e yuvarlanır. Smoke'a +80 sn kabul edildi (S8 her sahneyi üç kez ölçer).
- Ekran testi için uzun iz kaydı üretilmiş bir fixture'dır (`tests/fixtures/claude-streams/make-long-trace.mjs`), kayıt değildir; Fake sürücü testi artık 9 fixture bekler.

**Makine kontrol listesi**
- **B ve C gerçek kurulumda koşar** (geçici veritabanında değil): C'deki gerçek taslak B'nin videosunu gönderir ve TikTok token'ı veri dizinine taşınır; geçici dizin silinince token da giderdi. Öncesinde bir yedek alınır (A.7). Güvenli alan kalibrasyonu A.8 olarak B'den önce (plan A.5 diyordu).

## 6. Ertelenenler

- **Y20 (gerekçeli):** M5c §9 (5) voice replay'de retime → keep (yalnızca çökme + deterministik olmayan TTS; hata sessiz değil, compose "bayat" ile düşer, yeniden üretim çözer); M4a 1–3, 5–11 (tek kullanıcılı yerel kullanımda görülmedi); M3 1, 2, 7, 9, 11 (görsel/akış ayrıntıları) ve M3-10 (`summarizer` v1'de kullanılmıyor); M4c M6, M8; M5a M9 (kare karışımı audit'te zaten var); M5b `averageVisual` savunmaları. Hiçbiri veri kaybı ya da güvenlik değil.
- **3D varlık türü:** varlık defterinde yok (tüketicisi yok); defter müzik, SFX ve ses örneğiyle sınırlı.
- **Yeni açık maddeler:**
  - **S8(b) bu VM'de yaklaşık bir kareyle geçiyor** (p95 16,8 ms = bütçe). Makinede yeniden ölçülür (makine listesi A.5/D.3); bütçe gevşetilmez.
  - **T4'ün ilk tam koşusunda tanımlanamayan bir test hatası** sonraki beş koşuda yinelenmedi. İzleme maddesi: sonraki her tam koşu JSON raporlayıcıyla denetlendi, yinelenirse testin adı çıkar.
  - **Audit tarih kutuları** başsız Chrome'un yerel ayarını gösteriyor (`mm/dd/yyyy`); URL ve API biçimi İstanbul günü (YYYY-MM-DD). Kozmetik.

## 7. Makinede bekleyenler

Hepsi tek sıralı listede: [`docs/machine-checklist.md`](../machine-checklist.md). Bölümler:

- **0. Hazırlık:** kod, Node, Postgres ve migration (0010), araçlar (`nvidia-smi`, Blender, bwrap, Chrome, ffmpeg), ses venv'i, disk, TikTok kaynakları, pilot dosyası, Claude girişi.
- **A. Tam doğrulama:** `npm test` 504 (süre kaydı), `test:blender` 19, `test:render` 17, pytest 50 (gerçek venv), smoke 24/16 (S8 sayıları), temizlik, gerçek kurulumun ilk yedeği.
- **A.8 Güvenli alan kalibrasyonu:** kart → telefona elle → TikTok "Yalnızca ben" → ekran görüntüsü → değerler Ayarlar'a (B'den önce; ayar compose girdisine girer).
- **B. M5 kapanışı:** kalem pilotu kalibrasyonu, ses servisi ölçümü (+ `VG_AUDIO_*` sınırları), iki gerçek "tükenmez kalem" koşusu (şablon `fix_hint`'in etkisi dahil), 🚦 K17, gerçek koşu bulgularının review'u, dokümanlar.
- **C. M6 kapanışı:** bağlantının içe aktarılması, 🚦 bir gerçek taslak, Shorts indirme, son review, dokümanlar.
- **D. M7 gerçek denetimleri:** `npm run test:smoke:real`, G6'nın gözle denetimi, S8'in makinede tekrarı, yedek + geri yükleme provası, 🚦 çöp toplama, yetim raporu, `docs/m7/real-check.md`.
- **E. Kapanış:** spec notları (yalnızca gerçek kanıtla), özetler, takip dokümanları, `main`, Türkçe rapor.

## 8. Sınırlar

- Bu taşta hiçbir gerçek ölçüm yok: güvenli alan değerleri hâlâ spec §8.1'in varsayılanı; ses CLI sınırları (6000 MB, 900 sn) ölçülmedi; `test:smoke:real` ve S8'in gerçek donanımdaki sonucu bilinmiyor.
- Yedek yalnızca veritabanını alır; medya dosyaları (`media/`, run klasörleri) dökümde yok. Silinen bir blob'un asıl güvencesi 7 günlük çöp kutusudur.
- Çöp toplama bilinçli olarak korumacı: bazı referanssız blob'lar kalır (7 günden yeni dokunulanlar ve en eski etkin run başladığından beri dokunulanlar aday olmaz). Audit geçmişinde anılması bir blob'u korumaz.
- Konakta da docker'da da uyumlu `pg_dump` yoksa yedek alınmaz; Ayarlar ve `node bin/backup.mjs list` bunu gösterir.
- Güvenli alan elle okunur; yanlış okuma G6'yı kaydırır (varsayılandan > 150 px sapan değer uyarı verir ama kaydedilir).
- `npm test` süresi bulutta 3 işçiyle ölçüldü; makinede çekirdek sayısı farklı.
