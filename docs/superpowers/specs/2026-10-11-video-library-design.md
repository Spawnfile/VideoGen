# Video kütüphanesi, platform takibi ve eski bölümlerin taşınması — tasarım (2026-10-11)

Kullanıcı isteği: `~/icinde-ne-var` altında elle üretilen videolar uygulamada görünsün; uygulamadan izlenip telefona indirilebilsin; artık
üç platform var (YouTube, Instagram, TikTok) ve yükleme **elle** yapılıyor (TikTok API gönderimi iptal); hangi video hangi platforma
yüklendi history + audit olarak takip edilsin. `~/icinde-ne-var` klasörü **silinmez** ama VideoGen artık onu **hiçbir şekilde kullanmaz**:
gereken her şey VideoGen'e kopyalanır, hiçbir kod/doküman/araç o yola başvurmaz.

Bu, iki parçalı işin birincisidir. İkincisi (`yaklasim-approach`: YAKLASIM.md'nin tek üretim yaklaşımı olması, kanal stillerinin ve ses
modlarının kalkması, 12–15 sn) ayrı spec'tir; bu spec ona bağlı değildir. Kararlar grilling turunda kullanıcının "staff bakış açısıyla
sen karar ver" talimatıyla Claude tarafından verildi; kullanıcı özeti onayladı ve "klasörü silme" düzeltmesini yaptı. Ardından spec
eleştirel incelemeden geçirildi (bkz. "İnceleme bulguları"); bulgular kararlara işlendi.

## Kararlar

### Taşıma

| # | Karar | Gerekçe |
|---|---|---|
| L1 | **Kaynak kopyası (repo):** dokuz bölümün (asma-kilit, cpu, enigma, klavye, kulaklik, pilot-kalem, ps5-kol, rubik, saat) yalnızca metin kaynakları `episodes/<slug>/` altına kopyalanır: `*.py *.ts *.tsx *.json *.md *.txt *.sh`, `remotion/package.json`, `remotion.config.*`. Hariç: `node_modules`, `remotion/public/frames`, `out/` (blender ve remotion), `__pycache__`, `*.blend`, `*.mp4`, `*.wav`, `*.png`, `*.glb`, `.venv`, `tts/clips`, `tts/chosen`. Üst düzey `YAKLASIM.md` ve `prompt-*.md` → `docs/approach/`. | Rubik'in `scene.py`/`music.py`'si YAKLASIM'ın çalışan örneğidir; ikinci parçada builder ve besteci için referans olacak. İkili dosyalar repoya girmez (git-lfs yok, `.git` 23 MB). |
| L2 | **Veri kopyası (repo dışı):** `~/videogen-data/episodes/<slug>/` altına `final.mp4` (bölümün yayımlanan finali), `caption.txt` ve `assets/*.glb` (Sketchfab'den indirilmiş modeller: asma-kilit 5, enigma 1, kulaklik 2, ps5-kol 1, saat 3). Kopya, uygulama sırasında bir kez, repoya girmeyen geçici bir betikle yapılır; sha256'lar `episodes/manifest.json`'a yazılır. | Sahneler bu modellerle yeniden kurulabilir kalır; lisanslı üçüncü taraf modeller repoya ve web'e girmez. Kaynak klasör yolu yalnızca o tek seferlik komutta geçer, hiçbir repo dosyasında değil. |
| L3 | **Yol temizliği:** kopyalanan metinlerde `~/icinde-ne-var/bin/` → `bin/`, `~/icinde-ne-var/<slug>` → `episodes/<slug>`, çıktı adları `icinde-ne-var-<x>.mp4` → `<slug>.mp4`, hafıza dosyası atıfları → `docs/approach/`. Etkilenen: 9 README, 4 prompt, `enigma/tts/qa.py`, `saat/blender/compose.sh`. `episodes/README.md` "referans kaynaktır; modeller ve finaller `~/videogen-data/episodes/` altında; VideoGen bu kodu çalıştırmaz" der. | Kullanıcı: "o klasörün referansını ve kullanımını istemiyorum". |
| L4 | `episodes/` derlemeye ve teste girmez (kök `tsconfig.json` ve `vitest.config.ts` `include` listeleri zaten yalnızca `packages/apps/tests/bin`'i kapsar; bir test bunu sabitler). | Bölüm kodları Remotion 4 / bpy bağımlı; tip denetimine girerse kırılır. |
| L5 | **Araçlar:** VideoGen'de daha yeni bir `bin/blender-gpu` zaten var (`VG_BLENDER` destekli); yalnızca `bin/contact-sheet` ve `bin/sheet` kopyalanır. `~/.local/bin/blender-gpu` bağlantısı `VideoGen/bin/blender-gpu`'ya çevrilir. `camtest*.py` ve üst düzey `tts/` taşınmaz. `Blender-3D-Cutaway-Kilavuzu.md` yeni yolu gösterir. | Sarmalayıcının kaynağı eski klasörde kalırsa "kullanmıyoruz" ilkesi bozulur. |
| L6 | **QC kalibrasyon örneği:** `DEFAULT_PILOT_VIDEO` (`apps/worker/src/real/steps.ts:86`) `<dataDir>/episodes/pilot-kalem/final.mp4`'ü gösterir (`VG_DATA_DIR`'den). `docs/machine-checklist.md` ve `docs/m5/real-check.md` yeni yolu yazar. | Worker eski klasöre bağımlı kalmasın. |
| L7 | **Hafıza:** `~/.claude/projects/-home-alper/memory/icinde-ne-var-*.md`, `.../-home-alper-gpu-server/memory/videogen-platform.md` VideoGen'i tek ev olarak gösterecek şekilde güncellenir. | Yeni oturumlar eski klasörü önermesin. |

### İçe aktarma

| # | Karar | Gerekçe |
|---|---|---|
| L8 | Komut: `node bin/import-episodes.mjs [--dry-run]` (tsx ile paket kaynaklarını yükler, `bin/safe-area.mjs` gibi). Girdi `episodes/manifest.json` + `<dataDir>/episodes/<slug>/`; kaynak klasör argümanı yoktur. Manifest her bölüm için: `slug`, `product` (görünen ürün adı), `title`, `language` (`en`; enigma `tr`), `audioMode` (enigma `vo`, diğerleri `silent`), `approach` (rubik `yaklasim`, diğerleri `null`), `sha256` (final), `recordedAt` (ISO; final dosyanın mtime'ı). | Manifest elle gözden geçirilebilir; ürün adı klasör adından tahmin edilmez. |
| L9 | Her bölüm tek transaction: ürün (`normalized_name` ile bul ya da yarat) → video (`status='ready'`, `origin='import'`, `created_at = recordedAt`) → koşu (`kind='import'`, `trigger='cli'`, `status='done'`, `plan=[]`, `started_at=ended_at=recordedAt`) → sürüm (round 0, `reason='import'`; video `best_version_id = current_version_id` = bu sürüm) → artefaktlar `final_video_music` (blob, ffprobe süre/boyut/kodek) ve `final_cover` (ffmpeg 0. kare PNG), aynı `input_hash` (= MP4 sha256) ve `version_id`. `final_video_tiktok` yaratılmaz. Audit `video.imported` (slug, sha, bytes, durationS). `video.updated` olayı aynı transaction'da yayımlanır. | `listVersions` ve `VIDEO_SQL` finali bu şekilde bulur; Library/Detay sorguları değişmeden çalışır. `RunStatus`'ta `succeeded` yok, `done` var. YAKLASIM'da ilk kare kapaktır. |
| L10 | İdempotans: aynı sha256 bir `final_video_music` artefaktında varsa bölüm atlanır. Final dosyanın sha'sı manifestteki ile uyuşmazsa bölüm reddedilir (transaction yok). ffprobe 1080×1920 / 30 fps değilse uyarı yazılır, yine alınır. Eksik dosya → o bölüm "eksik", diğerleri devam, çıkış kodu 1. `--dry-run` yalnızca planı yazar, DB'ye ve blob deposuna dokunmaz. | Yarıda kalan ya da tekrarlanan içe aktarma çift kayıt yaratmaz; bozuk kopya kütüphaneye girmez. |
| L11 | `RunKind`'e `import` eklenir. İçe aktarılmış video **üretim açısından salt okunur**: `createAudioEditRun` `origin='import'` videoda hata döner (API 409 "imported videos cannot be edited"); Studio'da düzenleme kartları gizlenir; detayda reviews/storyboard/research sekmeleri "Imported — produced outside the pipeline" boş durumunu gösterir. | İçe aktarılmışların sahne spec'i, stem'leri, review'u yok; ses düzenlemesi kırılırdı. |

### Kütüphane ve platform takibi

| # | Karar | Gerekçe |
|---|---|---|
| L12 | **Yeni `videos` sütunları:** `origin text not null default 'pipeline'` (CHECK `pipeline`/`import`), `approach text` (CHECK null ya da `yaklasim`), `caption text`, `youtube_title text`. İçe aktarmada `caption` = `caption.txt`; `youtube_title` = caption'ın ilk cümlesi, hashtag'ler ve emoji atılmış, ≤ 100 karakter (kelime sınırında kesilir). | Filtre ve kopyalanacak metinler DB'den gelir; ikinci parça yeni üretimlerde bu alanları ajandan dolduracak. |
| L13 | **Platform kaydı:** tablo `platform_uploads` (bigserial `id`, `video_id` FK, `version_id` FK, `platform` CHECK ∈ {`youtube`,`instagram`,`tiktok`}, `action` CHECK ∈ {`uploaded`,`retracted`}, `uploaded_at` timestamptz not null, `url` text, `note` text, `created_at` timestamptz(6) default now()), indeks `(video_id, platform, id)`. `REVOKE UPDATE, DELETE, TRUNCATE ... FROM videogen_app`. | History doğal çıkar; yanlış işaret "geri al" olayıyla düzeltilir; aynı videoyu silip tekrar yüklemek de yazılabilir. |
| L14 | Güncel durum türetilir: her (video, platform) için en büyük `id`'li olay `uploaded` ise `state='uploaded'` (`uploadedAt`, `url`, `versionId`), aksi `none`. Video'nun best sürümü olaydaki sürümden farklıysa `state='outdated'`. | Hangi dosyanın gittiği bilinir; yeniden üretimden sonra tekrar yükleme ihtiyacı görünür. |
| L15 | `uploaded` işaretinin `version_id`'si o anki best sürümdür; best sürümün `final_video_music`'i yoksa 409 "no downloadable final". `retracted` yalnızca durum `uploaded`/`outdated` iken (aksi 409); `version_id`'si son `uploaded` olayınınkidir. Durum zaten `uploaded` iken yeni `uploaded` kabul edilir (yeniden yükleme). | Kurallar sunucuda; telefon ve masaüstü aynı davranır. |
| L16 | Doğrulama: `uploadedAt` isteğe bağlı (varsayılan şimdi), şimdiden > 5 dk ileride ise 400; `url` boş ya da `https://` ile başlayan, ≤ 500; `note` ≤ 500; `caption` ≤ 2200 (Instagram sınırı, en dar olanı); `youtubeTitle` ≤ 100; boş metin `null` kaydedilir. | Platform sınırlarının en darı; ileri tarih yazım hatasıdır. |
| L17 | Her platform olayı ve metin düzenlemesi audit zincirine yazılır (`actorType='user'`): `platform.uploaded`, `platform.retracted` (platform, versionId, hasUrl, uploadedAt), `video.text_edited` (field, length, ilk 120 karakter). Aynı transaction'da `video.updated` yayımlanır, böylece açık olan diğer cihaz canlı güncellenir. | Hash zincirli audit "kim ne zaman"ın tek kaynağı; SSE zaten `video.updated` ile kütüphaneyi tazeliyor. |
| L18 | **API:** `GET /api/videos/:id/platforms` → `{ state: {youtube, instagram, tiktok}, events: [...] }` (olaylar yeni→eski); `POST /api/videos/:id/platforms` `{platform, action, uploadedAt?, url?, note?}`; `PATCH /api/videos/:id/text` `{caption?, youtubeTitle?}`. `VideoView`'a `origin`, `approach`, `caption`, `youtubeTitle`, `platforms` (durum özeti) eklenir; `VersionView.published` kalkar. Yazmalar mevcut tailnet kökeni koruyucusundan geçer. | Kütüphane rozetleri ek istek gerektirmez. |
| L19 | **İndirme dosyası:** üç platform için aynı master: best sürümün `final_video_music`'i. İndirme adı `<slug>.mp4`; `slug` = ürün adı Türkçe harfler ASCII'ye çevrilip (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u, İ→i) küçük harf, diğerleri `-`, ≤ 60; boşsa `video`. Mevcut `?download=` kuralına (`^[a-z0-9][a-z0-9-]{0,79}\.mp4$`) uyar. | Üç platform da 1080×1920 H.264 kabul eder; uygulamadan inen dosya hep filigransız. |
| L20 | **Telefona kaydet (iki dokunuş):** 1) **Save to phone** → dosya `fetch` ile belleğe alınır (ilerleme yüzdesi, iptal edilebilir). 2) `navigator.canShare({files:[file]})` doğruysa düğme **Save video** olur → dokununca `navigator.share({files})` (iPhone: "Videoyu Kaydet" → Fotoğraflar); `AbortError` hata sayılmaz; başka hata → indirme bağlantısına düşer. `canShare` yoksa ilk dokunuş doğrudan `?download=` bağlantısını açar (Android/masaüstü). | iOS `navigator.share`'i yalnızca taze bir kullanıcı dokunuşuyla kabul eder; 12–55 MB'lık indirme süresince dokunuş etkinliği düşer. Tek dokunuşlu tasarım iPhone'da sessizce başarısız olurdu. |
| L21 | **Kütüphane:** tek liste. Filtre çipleri: `All` · `YAKLASIM` · `Archive` (approach null) ve `Not on YouTube` / `Not on Instagram` / `Not on TikTok` (durum `none` ya da `outdated`). Kartlarda YT/IG/TT rozetleri (yüklü / eski sürüm / yok) ve içe aktarılmışlarda `Imported` etiketi. Seçili çip URL'de (`?f=`) tutulur. | Günlük soru "neyi henüz nereye yüklemedim?" tek dokunuşla; geri dönünce filtre kaybolmaz. |
| L22 | **Video detayı:** "Publish" sekmesi yerine **Platforms**; içe aktarılmışlarda ve telefonda varsayılan sekme. İçerik: oynatıcı (best final, kapak poster), Save to phone, caption ve YouTube başlığı (kopyala + düzenle), üç platform satırı (durum, tarih, link; **Mark uploaded** → sheet: tarih-saat, link, not; **Undo** → onaylı), olay geçmişi. Final yoksa "No final yet" boş durumu. | Telefondan tek ekranda: izle → kaydet → caption'ı kopyala → yükle → işaretle. |

### TikTok API'nin kaldırılması

| # | Karar | Gerekçe |
|---|---|---|
| L23 | Silinir: `packages/tiktok`; `apps/api/src/routes/{tiktok,publish}.ts`, `app.ts` kaydı ve `tiktokConnectTtlMs`; `apps/worker/src/publish/`, `main.ts` bağlantıları ve `publish.send` işi, `dev/seed-ready.ts`; `packages/db/src/publish.ts` ve `index.ts` dışa aktarımı; `packages/shared/src/publish.ts` ve `config.ts` `tiktok` bloğu (`VG_TIKTOK_*`); web `components/publish/`, `TikTokSection`, `publish-view.ts`, api.ts publish uçları, ProductionPanel'deki FinishCard, i18n `PUBLICATION_STATUS_EN`/`CHECKLIST_EN`/`markBlocker`; `bin/tiktok.mjs`; `guard.ts` `tiktok-poster` girdisi; `apps/api` ve `apps/worker` `package.json` bağımlılığı; ilgili testler, `tests/smoke/s6-publish.spec.ts`, `tests/fixtures/tiktok/`; kökteki `tiktok_api_*.md`. `.env`'deki TikTok anahtarları kullanıcıya bildirilir (dosya elle temizlenir). | Ölü kod, gizli anahtar ve test yükü kalmaz. |
| L24 | **Kalır:** TikTok güvenli alanı (qc, SafeAreaCard, `bin/safe-area.mjs`), `final_video_tiktok` varyantı (ikinci parçanın konusu), `claims` tablosu (final review ve fix döngüsü kullanıyor). | Bunlar yayın API'si değil. |
| L25 | **Migration 0013:** `DROP TABLE publications` (0 satır; migration önce satır sayısını kontrol eder, > 0 ise hata verip durur); `videos` sütunları; `platform_uploads` + REVOKE; `UPDATE videos SET status='ready' WHERE status='published'`. Kod: `VideoStatus`'tan `published` çıkar, `updateVideo`'daki `published` koruması kalkar, `gc.ts` `REFERENCE_COLUMNS`'tan `publications.blob_sha` çıkar. | GC sabit listeden sorgu atıyor; tablo düşüp liste kalırsa çöp toplama hata verir. Satır kontrolü veri kaybını imkânsız kılar. |

## Arayüz akışı (telefon)

Library → `Not on Instagram` çipi → karta dokun → Platforms: video oynar → **Save to phone** → (yüzde) → **Save video** → paylaşım
sayfası → Videoyu Kaydet → **Copy caption** → Instagram'da yükle → uygulamaya dön → Instagram satırında **Mark uploaded** → (isteğe bağlı
link) → kaydet. Rozet IG'yi yüklü gösterir; masaüstü açıksa orada da anında güncellenir; Audit sayfasında satır görünür.

## Test

**db**
- `platform_uploads` append-only: uygulama rolüyle UPDATE/DELETE/TRUNCATE reddedilir.
- Durum türetme: boş → `none`; uploaded → `uploaded`; uploaded → retracted → `none`; uploaded → uploaded (iki satır, `uploaded`);
  yeni best sürüm → `outdated`; platformlar birbirinden bağımsız.
- Migration: `publications` satırı varken 0013 durur; yokken düşer; `published` statüsündeki video `ready` olur.
- GC: `unwiredShaColumns` 0013 sonrası boş; içe aktarılmış final ve kapak blob'ları aday değildir.
- `listVersions` içe aktarılmış sürümün finalini ve kapağını döner; `VIDEO_SQL` `origin/approach/caption/platforms`'u döner.
- Audit zinciri içe aktarma ve işaretlerden sonra `verifyAudit` ile geçerli.

**api**
- platforms GET; POST uploaded/retracted; retract `none` iken 409; final yokken 409; bilinmeyen platform/action 400; `url` http:// 400;
  `uploadedAt` +10 dk 400, geçmiş tarih kabul; not > 500 400.
- text PATCH: sınırlar, boş → null, audit satırı.
- Her yazma `video.updated` olayı yayımlar.
- Tailnet kökeni dışından POST/PATCH reddedilir.
- İçe aktarılmış videoda `POST /api/videos/:id/audio-edits` 409.
- Kaldırılan uçlar (`/api/tiktok`, `/api/videos/:id/publish`, `/api/publications/...`, `/exports/shorts`) 404.

**import**
- Geçici veri dizini + küçük MP4 fixture'ı: ilk çalıştırma ürün/video/koşu/sürüm/iki artefakt/audit yaratır; ikinci çalıştırma atlar.
- Aynı ürün adlı iki bölüm tek ürüne bağlanır.
- sha uyuşmazlığı → bölüm reddedilir, DB değişmez; eksik dosya → diğerleri alınır, çıkış kodu 1.
- 720×1280 fixture → uyarı ve kabul; `--dry-run` hiçbir satır ve blob yazmaz.
- `youtube_title` türetme: hashtag/emoji atılır, 100 karakterde kelime sınırı.

**web**
- Platform özet görünümü ve rozet durumları (`none`/`uploaded`/`outdated`); filtre mantığı (`Not on X` `outdated`'ı içerir);
  `?f=` geri yükleme.
- Save-to-phone durum makinesi: `canShare` yok → doğrudan indirme; var → fetch → "Save video" → share; `AbortError` sessiz; başka hata →
  indirme bağlantısı.
- `slug`: "Kulaklık" → `kulaklik`, "PS5 Kol" → `ps5-kol`, "İğne" → `igne`, "!!!" → `video`.
- i18n: yeni `PLATFORM_EN` tüm platformları kapsar; Türkçe kalmadı testi yeni bileşenleri de tarar.

**depo**
- Bir test, `git ls-files` ile izlenen dosyalarda `icinde-ne-var` dizgisinin yalnızca tarihî/tasarım kayıtlarında geçtiğini doğrular:
  izin listesi `docs/superpowers/**` ve `docs/m5/**`; geri kalan her yol (kod, `episodes/`, `docs/approach/`, kök dokümanlar) temiz olmalı.
- `tsconfig.json` ve `vitest.config.ts` `episodes/`'u kapsamaz.

**smoke**
- S6 publish senaryosu yerine "mark uploaded" (masaüstü + mobil proje): kütüphane → detay → Platforms → işaretle → rozet → geri al.

**gerçek doğrulama**
- 9 bölüm içe aktarılır, blob sha'ları manifestle eşleşir; telefonda (tailnet 8443) rubik oynatılır ve kaydedilir; bir platform
  işaretlenip geri alınır; Audit'te iki satır, zincir geçerli.

## İnceleme bulguları (ilk taslağa göre değişenler)

1. **GC kırılırdı:** `gc.ts` `REFERENCE_COLUMNS` `publications.blob_sha`'yı sabit sorguluyor → L25.
2. **Koşu durumu yanlıştı:** `succeeded` yok, `done` → L9; `RunKind`'e `import` → L11.
3. **İçe aktarılmışlar düzenlenebilirdi:** ses düzenlemesi sahne/stem olmadan kırılırdı → L11.
4. **iPhone'da tek dokunuşla paylaşım çalışmazdı** (dokunuş etkinliği büyük indirme sırasında düşer) → L20.
5. **Eski klasör adı repoya sızardı:** manifestteki final yolları ve bölüm README'leri → L2, L3; içe aktarma artık yalnızca veri dizinini okur.
6. **Sketchfab modelleri kaybolurdu** (`*.glb` hariç tutulmuştu; sahneler onlarsız kurulamaz) → L2.
7. **`blender-gpu` zaten VideoGen'de** (daha yeni sürüm); taşınacak olan yalnızca bağlantı → L5.
8. **Canlı güncelleme eksikti:** işaretleme diğer cihazda görünmezdi → L17 (`video.updated`).
9. **Ürün adından dosya adı** `?download=` kuralını Türkçe harflerle ihlal ederdi → L19.
10. **Doğrulama sınırları belirsizdi** (ileri tarih, url şeması, caption uzunluğu) → L16.
11. **`updateVideo`'daki `published` koruması ve i18n test bağımlılıkları** unutulmuştu → L23, L25.

## Kapsam dışı

Platform API'leri (yükleme, istatistik çekme); platforma özel encode; caption'ın ajan tarafından yazılması ve YAKLASIM kuralları (ikinci
parça); `~/icinde-ne-var`'ın silinmesi; Web Push; içe aktarılmış bölümlerin pipeline'da yeniden üretilmesi.
