# Video kütüphanesi, platform takibi ve eski bölümlerin taşınması — tasarım (2026-10-11)

Kullanıcı isteği: `~/icinde-ne-var` altında elle üretilen videolar uygulamada görünsün; uygulamadan izlenip telefona indirilebilsin; artık
üç platform var (YouTube, Instagram, TikTok) ve yükleme **elle** yapılıyor (TikTok API gönderimi iptal); hangi video hangi platforma
yüklendi history + audit olarak takip edilsin. `~/icinde-ne-var` klasörü **silinmez** ama VideoGen artık onu **hiçbir şekilde kullanmaz**:
gereken her şey VideoGen'e kopyalanır, hiçbir kod/doküman/araç o yola başvurmaz.

Bu, iki parçalı işin birincisidir. İkincisi (`yaklasim-approach`: YAKLASIM.md'nin tek üretim yaklaşımı olması, kanal stillerinin ve ses
modlarının kalkması, 12–15 sn) ayrı spec'tir; bu spec ona bağlı değildir. Kararlar grilling turunda kullanıcının "staff bakış açısıyla
sen karar ver" talimatıyla Claude tarafından verildi; kullanıcı özeti onayladı ve "klasörü silme" düzeltmesini yaptı.

## Kararlar

| # | Karar | Gerekçe |
|---|---|---|
| L1 | **Kaynak kopyası:** dokuz bölümün (asma-kilit, cpu, enigma, klavye, kulaklik, pilot-kalem, ps5-kol, rubik, saat) yalnızca metin kaynakları `episodes/<slug>/` altına kopyalanır: `*.py *.ts *.tsx *.json *.md *.txt *.sh`, `remotion/package.json`, `remotion.config.*`. Hariç: `node_modules`, `remotion/public/frames`, `out/`, `*.blend`, `*.mp4`, `*.wav`, `*.png`, `.venv`, `tts/clips`, `tts/chosen`. Üst düzey `YAKLASIM.md` ve `prompt-*.md` → `docs/approach/`. Bölüm README/PLAN'larındaki `~/icinde-ne-var/...` yolları VideoGen yollarına çevrilir. | Rubik'in `scene.py`/`music.py`'si YAKLASIM'ın çalışan örneğidir; ikinci parçada builder ve besteci için referans olacak. İkili dosyalar yeniden üretilebilir ve repoya girmez (git-lfs yok, `.git` 23 MB). |
| L2 | `episodes/` derlemeye girmez: kök `tsconfig.json` `include` listesi zaten yalnızca `packages/apps/tests/bin` kapsar; vitest `include` da öyle. Ek olarak `episodes/README.md` "referans kaynaktır, VideoGen tarafından çalıştırılmaz" der. | Bölüm kodları Remotion 4 / bpy bağımlılıklı; tip denetimine ve teste girmemeli. |
| L3 | **Araçlar:** `bin/blender-gpu`, `bin/contact-sheet`, `bin/sheet` VideoGen'e kopyalanır; `~/.local/bin/blender-gpu` bağlantısı VideoGen'deki kopyaya çevrilir. `camtest*.py` ve üst düzey `tts/` taşınmaz. `Blender-3D-Cutaway-Kilavuzu.md` yeni yolu gösterir. | Blender'ı NVIDIA'da çalıştıran sarmalayıcı VideoGen'in de aracıdır; kaynağı eski klasörde kalırsa "kullanmıyoruz" ilkesi bozulur. |
| L4 | **QC kalibrasyon örneği:** pilot-kalem final MP4'ü `~/videogen-data/calibration/pilot-kalem.mp4`'e kopyalanır, sha256 `docs/machine-checklist.md`'ye yazılır; `DEFAULT_PILOT_VIDEO` (`apps/worker/src/real/steps.ts:86`) bu yolu gösterir. Eski yolu anan dokümanlar güncellenir (tarihî plan/spec metinleri hariç: onlar o günün kaydıdır). | Worker kodu eski klasöre bağımlı kalmasın; veri dizini zaten `VG_DATA_DIR`. |
| L5 | **İçe aktarma:** tek seferlik, idempotent komut `bin/import-episodes.mjs <kaynak-kök>`. Kaynak kök argümandır (kodda sabit yol yok). Girdi, repodaki `episodes/manifest.json`: her bölüm için `slug`, `product`, `title`, `language`, `audioMode` (`enigma` = `vo`, diğerleri `silent`), `approach` (`rubik` = `yaklasim`, diğerleri `null`), `finalPath` (köke göre), `recordedAt` (final dosyanın mtime'ı, manifeste yazılı). | Manifest elle gözden geçirilebilir, tekrar çalıştırılabilir; ürün adı/başlık klasör adından tahmin edilmez. |
| L6 | Her bölüm için tek transaction: ürün (normalize adla bul ya da yarat) → video (`status='ready'`, `origin='import'`) → koşu (`kind='import'`, `trigger='cli'`, `status='succeeded'`, plan `{source:'episode', slug}`) → sürüm (round 0, `reason='import'`, `best` = `current` = bu sürüm) → artefaktlar `final_video_music` (blob, ffprobe süre/boyut/kodek) ve `final_cover` (ffmpeg ile 0. kare PNG), ikisi aynı `input_hash` (= MP4 sha256). `final_video_tiktok` yaratılmaz. Audit: `video.imported` (slug, sha, bytes, durationS). | `listVersions`/`VIDEO_SQL` final'i bu üç sorguyla buluyor; aynı şekli üretmek Library/Detay kodunu değiştirmeden çalıştırır. YAKLASIM'da ilk kare kapaktır. |
| L7 | İdempotans: aynı MP4 sha256'sı zaten bir `final_video_music` artefaktında varsa bölüm atlanır ("zaten var" yazılır). `--dry-run` yalnızca planı yazar. Sonunda her bölüm için blob sha256'sı kaynak dosyanınkiyle karşılaştırılır. | Yarıda kalan ya da tekrar edilen içe aktarma çift kayıt yaratmaz. |
| L8 | **Yeni sütunlar** (`videos`): `origin text not null default 'pipeline'` (`pipeline`/`import`), `approach text` (`yaklasim` ya da null), `caption text`, `youtube_title text`. İçe aktarmada `caption` = `caption.txt` olduğu gibi; `youtube_title` = caption'ın ilk cümlesi, ≤ 100 karakter, hashtag'siz. | Filtre ve kopyalanacak metinler DB'den gelir; ikinci parça yeni üretimlerde bu alanları ajandan dolduracak. |
| L9 | **Platform kaydı:** yeni tablo `platform_uploads` (bigserial `id`, `video_id`, `version_id`, `platform` ∈ {`youtube`,`instagram`,`tiktok`}, `action` ∈ {`uploaded`,`retracted`}, `uploaded_at` timestamptz (kullanıcının söylediği an, varsayılan şimdi), `url` (isteğe bağlı, yalnızca `https://`, ≤ 500), `note` (≤ 500), `created_at`). `REVOKE UPDATE, DELETE, TRUNCATE` (append-only). | History doğal çıkar; yanlış işaret "geri al" olayıyla düzeltilir, kayıt silinmez; aynı videoyu silip tekrar yüklemek de yazılabilir. |
| L10 | Güncel durum türetilir: her (video, platform) için en son olay `uploaded` ise "yüklendi" (tarih, link, sürüm). İşaret, o anki **best** sürüme bağlanır; video sonradan yeni best sürüm alırsa rozet "eski sürüm yüklü" der. | Hangi dosyanın gittiği bilinir; yeniden üretimden sonra tekrar yükleme ihtiyacı görünür. |
| L11 | Her platform olayı ve caption/başlık düzenlemesi audit zincirine de yazılır: `platform.uploaded`, `platform.retracted` (platform, versionId, url var mı, uploadedAt), `video.caption_edited` (alan, eski/yeni uzunluk, ilk 120 karakter). `actorType='user'`. | Mevcut hash zincirli audit, "kim ne zaman" sorusunun tek kaynağı kalır. |
| L12 | **API:** `GET /api/videos/:id/platforms` (durum + olaylar, yeni→eski); `POST /api/videos/:id/platforms` `{platform, action, uploadedAt?, url?, note?}` (`retracted` yalnızca durum "yüklendi" iken; aksi 409); `PATCH /api/videos/:id/text` `{caption?, youtubeTitle?}` (caption ≤ 2200, başlık ≤ 100). `GET /api/videos` her videoya `platforms: {youtube, instagram, tiktok}` özetini ve `origin`, `approach`'u ekler. Yazmalar mevcut tailnet kökeni kuralına tabidir. | Telefon ve masaüstü aynı uçları kullanır. |
| L13 | **İndirme dosyası:** platforma göre ayrı dosya yok; best sürümün `final_video_music`'i (müzikli, -14 LUFS) üç platform için de aynı master. İndirme adı `<slug>.mp4` (`slug` = ürün adından, mevcut `?download=` kuralına uyar). | Üç platform da 1080×1920 H.264'ü kabul eder; YAKLASIM'ın "ayrı dosya" kuralı filigranlı dosyayı başka platforma yüklememek içindir ve uygulamadan inen dosya hep temizdir. |
| L14 | **Telefona kaydet:** `navigator.canShare({files})` destekleniyorsa dosya fetch edilip Web Share ile paylaşılır (iPhone'da "Videoyu Kaydet" → Fotoğraflar); değilse `?download=` bağlantısı (Android/masaüstü). Paylaşım sırasında ilerleme gösterilir; iptal hata sayılmaz. | iOS PWA'da `download` özniteliği videoyu Fotoğraflar'a koymaz; Android'de düz indirme yeterli. Kullanıcının telefon tipi bilinmiyor; iki yol da çalışır. |
| L15 | **Kütüphane:** tek liste. Filtre çipleri: `All` · `YAKLASIM` (`approach='yaklasim'`) · `Archive` (geri kalan) ve platform çipleri `Not on YouTube` / `Not on Instagram` / `Not on TikTok`. Kartlarda YT/IG/TT rozetleri (yüklü / eski sürüm yüklü / yok) ve içe aktarılmışlarda küçük `Imported` etiketi. 5 "Ruj" test videosu `Archive`'da kalır. | Hiçbir şey kaybolmaz; günlük soru "neyi henüz nereye yüklemedim?" tek dokunuşla cevaplanır. |
| L16 | **Video detayı:** "Publish" sekmesinin yerine **Platforms** sekmesi, telefonda varsayılan sekme: oynatıcı (best final), **Save to phone**, caption ve YouTube başlığı kopyala/düzenle, üç platform satırı (**Mark uploaded** → sayfa altı sheet: tarih-saat, link, not; **Undo**), altında olay geçmişi. İçe aktarılmış videoda üretim sekmeleri (reviews, storyboard, research) boş durum gösterir. | Telefondan tek ekranda: izle → kaydet → caption'ı kopyala → yükle → işaretle. |
| L17 | **TikTok API kaldırma:** `packages/tiktok`; `apps/api/src/routes/{tiktok,publish}.ts` ve `app.ts` kaydı; `apps/worker/src/publish/`, `main.ts` bağlantıları ve `publish.send` işi, `dev/seed-ready.ts`; `packages/db/src/publish.ts`; `packages/shared/src/publish.ts` ve `config.ts` `tiktok` bloğu (`VG_TIKTOK_*`); web `components/publish/`, `TikTokSection`, `publish-view.ts`, api.ts publish uçları, ProductionPanel'deki FinishCard; `bin/tiktok.mjs`; `guard.ts` `tiktok-poster` girdisi; ilgili testler, `tests/smoke/s6-publish.spec.ts`, `tests/fixtures/tiktok/`; kökteki `tiktok_api_*.md`; `.env`'deki TikTok anahtarları (kullanıcıya bildirilir, dosya elle temizlenir). **Kalır:** TikTok güvenli alanı (qc, SafeAreaCard, `bin/safe-area.mjs`), `final_video_tiktok` varyantı (ikinci parçanın konusu), `claims` tablosu (final review kullanıyor). | API yolu artık kullanılmayacak; ölü kod, gizli anahtar ve test yükü taşımaz. |
| L18 | **Migration 0013:** `DROP TABLE publications` (0 satır, doğrulandı); `videos` sütunları; `platform_uploads` + REVOKE; `UPDATE videos SET status='ready' WHERE status='published'`; `VideoStatus`'tan `published` çıkar. `listVersions`'taki `published` alanı L10'daki platform durumuyla değişir. | Tek migration, geri dönüşsüz kısım yalnızca boş tablo. |
| L19 | **Hafıza ve dokümanlar:** `~/.claude/projects/-home-alper/memory/icinde-ne-var-*.md` ve `~/.claude/projects/-home-alper-gpu-server/memory/videogen-platform.md` VideoGen'i tek ev olarak gösterecek şekilde güncellenir; yeni oturumlar eski klasörü önermez. | "O klasörün referansını ve kullanımını istemiyorum." |

## Arayüz akışı (telefon)

Library → `Not on Instagram` çipi → karta dokun → Platforms sekmesi: video oynar → **Save to phone** (paylaşım sayfası → Videoyu Kaydet) →
**Copy caption** → Instagram'da yükle → uygulamaya dön → Instagram satırında **Mark uploaded** → (isteğe bağlı link yapıştır) → kaydet.
Rozet IG'yi yüklü gösterir; olay geçmişi ve Audit sayfası kaydı içerir.

## Hata durumları

- İçe aktarma: final dosya yok/okunamıyor → o bölüm "eksik" raporlanır, diğerleri devam eder, çıkış kodu ≠ 0. ffprobe 1080×1920 değilse
  uyarı (yine alınır). Blob sha uyuşmazlığı → transaction geri alınır.
- Platform işareti: video'nun best final'i yoksa 409 ("indirilebilir dosya yok"). Aynı platform zaten "yüklendi" iken tekrar `uploaded`
  kabul edilir (yeniden yükleme) ve geçmişe ayrı satır düşer.
- Web Share hatası (`AbortError` dışında) → otomatik olarak indirme bağlantısına düşer.

## Test

- db: `platform_uploads` append-only (UPDATE/DELETE reddedilir); durum türetme (uploaded → retracted → uploaded); eski sürüm tespiti.
- api: platforms GET/POST/409 durumları, url doğrulaması, text PATCH sınırları, audit satırları yazılıyor, publish/tiktok uçları 404.
- import: geçici veri diziniyle küçük bir MP4 fixture'ı; ilk çalıştırma kayıtları yaratır, ikincisi atlar; `listVersions` finali görür;
  `--dry-run` hiçbir şey yazmaz.
- web: platform özet görünümü, filtre mantığı, Save-to-phone yol seçimi (`canShare` var/yok) birim testleri.
- smoke: S6 publish senaryosu yerine "mark uploaded" senaryosu (masaüstü + mobil proje); bir test, VideoGen'de `icinde-ne-var` dizgisinin
  yalnızca tarihî docs ve `episodes/` metadatası dışında geçmediğini doğrular.
- Gerçek doğrulama: 9 bölüm içe aktarılır, telefonda (tailnet 8443) rubik oynatılır, kaydedilir, bir platform işaretlenip geri alınır.

## Kapsam dışı

Platform API'leri (yükleme, istatistik çekme); platforma özel encode; caption'ın ajan tarafından yazılması ve YAKLASIM kuralları (ikinci
parça); `~/icinde-ne-var`'ın silinmesi; Web Push.
