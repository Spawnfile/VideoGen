# YAKLASIM: VideoGen'in tek üretim yaklaşımı — tasarım (2026-10-11)

Kullanıcı isteği: `docs/approach/YAKLASIM.md` (Rubik bölümünün yaklaşımı) VideoGen'in izleyeceği tek yol olsun. Grilling turunda karar
"A — tek yaklaşım": kanal stilleri, seslendirme/TTS, serbest besteci ve süre seçimi kalkar; her yeni üretim YAKLASIM kurallarıyla çıkar.
Kullanıcı "staff bakış açısıyla sen karar ver, tüm entegrasyonu bitirene kadar devam et" dedi; aşağıdaki kararlar Claude'undur.
Referans uygulama: `episodes/rubik` (Blender sahnesi, Remotion katmanı, `audio/music.py`, `audio/sfx.py`).

İş iki faza bölünür, her biri ayrı plan ve ayrı yayına alınır:
- **Faz A — davranış:** yeni üretimler YAKLASIM'la çıkar; eski seçenekler giriş noktalarında kapanır (UI ve API). Tek başına yayına alınabilir.
- **Faz B — temizlik:** artık çağrılmayan kod silinir (ses/TTS hattı, anlatıcı sesi, kanal stili seçimi, FluidSynth besteci, ses düzenleme,
  müziksiz varyant). Davranış değişmez; eski kayıtlar okunur kalır.

## Faz A kararları

### Süre, dil, ses kipi

| # | Karar | Gerekçe |
|---|---|---|
| Y1 | Süre penceresi sabit **12–15 sn** (`YAKLASIM.window`). `DEFAULT_DURATION` bu olur; `effectiveDuration` her zaman bunu döner (kaynak `default`). API `duration` alanını reddeder (400 "the length is fixed at 12–15 s by the YAKLASIM approach"); yönergedeki süre ifadeleri çözülmez; araştırmacının süre önerisi uygulanmaz (alanlar şemada kalır, okunur). QC G1 yedek penceresi de 12–15. Şemaların kesin sınırları (10–60) eski kayıtlar okunsun diye değişmez. | YAKLASIM "12–15 saniyelik"; ayar düğmesi yaklaşımı bozmaya davet eder. |
| Y2 | Ses kipi yalnızca **seslendirmesiz** (`silent`). API `audioMode: 'vo'`'yu reddeder; Studio'daki seçim kalkar; anlatıcı sesi ayarı gizlenir. Eski VO videoları okunur. | "Seslendirme yoktur." Kod silme Faz B. |
| Y3 | Ekrandaki her yazı **İngilizce**, en çok **5 kelime**, Türkçe harf yok (`çğıöşüÇĞİÖŞÜ`). Alan adları (`hook.text_tr`, `onscreen_text.tr`) eski kayıtlar ve araç zinciri için değişmez; içerikleri artık İngilizcedir (adlandırma borcu, kayda geçti). | Şema adlarını değiştirmek araştırma → storyboard → fixer → reviewer → Remotion zincirinin tamamını ve eski artefaktları kırar; dil kuralı doğrulayıcıda zorlanır. |
| Y4 | Yeni videolar `videos.approach = 'yaklasim'` ile yaratılır. | Kütüphane filtresi ve sonraki kurallar buna bakar. |

### Storyboard: merak zinciri

| # | Karar | Gerekçe |
|---|---|---|
| Y5 | Beat'e iki isteğe bağlı alan: `role` ∈ {`hook`,`xray`,`macro`,`assembly`,`counter`,`twist`} ve `transition` ∈ {`cut`,`zoom`,`flash`} (beat'in başlangıcındaki geçiş). `counter` beat'ine `counter: { value: string (rakamlar), label: string }`. Storyboard'a `publish: { caption, youtube_title }`. Hepsi şemada isteğe bağlıdır (eski kayıtlar); YAKLASIM doğrulayıcısı zorunlu kılar. | YAKLASIM'ın vuruş zinciri makinenin okuyabileceği hâle gelir; Remotion ve ses bunlarla çalışır. |
| Y6 | `yaklasimStoryboardErrors(sb)` (storyboard adımında ve fixer'da): süre 12–15; beat sınırları 0,5 sn ızgarasında; her beat ≤ 2,5 sn; ≥ 6 beat; ilk beat `hook`, son beat `twist`; `xray`, `macro`, `assembly`, `counter` en az birer kez ve bu sırada (assembly tekrar edebilir); `counter` beat'inde `counter` dolu; kamera hareketi `static` yok; kanca ve beat yazıları Y3'e uyar; vurgu işareti `*…*` bir yazıda en çok bir kez; son beat yazısı kanca yazısıyla aynı (döngü); `publish` Y17'ye uyar. | Kurallar ucuz ve deterministik; reviewer'a bırakılırsa tur ve token harcar. |
| Y7 | Yönerge (brief) YAKLASIM'ın sabitlerini ezemez: süre, dil, kelime sınırı, zincir, görsel kimlik, ses kuralları. Ezebildikleri: konu vurgusu, hangi detayın kahraman olacağı, sayı, twist fikri, ton. | Yaklaşım sabittir; yönerge içerik içindir. |

### Görsel kimlik ve Remotion katmanı

| # | Karar | Gerekçe |
|---|---|---|
| Y8 | Tek stil `yaklasim` (`CHANNEL_STYLES`'a eklenir; eski üçü eski spec'ler için okunur kalır): zemin `#1a2546 → #0d1222 → #070a14` radyal gradyan + kenarlara sönen soluk 90 px ızgara (CSS, Rubik'teki gibi), ışık ön ayarı `yaklasim` (sıcak ana + mavi sol kenar + turuncu sağ kenar güneş). Boru hattı ve fixer kanal stili ayarını okumaz, her zaman `yaklasim` kullanır. Ayarlardaki kanal stili bölümü gizlenir. | "Görsel kimlik sabittir." |
| Y9 | Yazı katmanı: Montserrat 900 (yerel `@fontsource/montserrat`, ağ yok), beyaz, `*vurgu*` kısmı sarı `#ffd23f`, hafif gölge; yazılar **anında** belirir (opaklık 1, 0,94 → 1 ölçek 4 karede), sahneyle birlikte anında değişir; kanca ve sahne yazıları ekranın üst üçte birinde ortalı; parça etiketleri (çizgi + levha) YAKLASIM'da yoktur. Son beat'te kanca yazısı geri gelir. | Rubik katmanı. Türkçe parça adları "Türkçe metin yok" kuralını bozardı; kahraman parçayı sarı halka işaretler. |
| Y10 | Güvenli alan: YAKLASIM payları (üst 250, sağ 120, alt 420, sol 120) ile kalibre edilmiş alanın her kenarda büyüğü. Düzen denetimi (G6) bunu kullanır. | İki kuralın da ihlal edilmemesi. |
| Y11 | Efektler Remotion'da: `transition: 'flash'` beat başında 4 karelik beyaz parlama + 10 karelik sönen sarsıntı ve küçük zoom vuruşu; `macro` beat'inde beat'in ilk parçasının çapasında atan sarı halka; `counter` beat'inde sayaç 0'dan değere hızla tırmanır (beat'in %70'inde varır, son değer tam yazılır). | Rubik'teki vuruşlar; Blender'a gerek yok. |
| Y12 | SceneSpec: parça hareketi `explode`'a isteğe bağlı `back: { t_start, t_end, ease }` (parça yerine döner = kenetlenme) ve parçaya isteğe bağlı `spin: { axis, degrees, t_start, t_end, ease }` (mekanizma gerçek hareketiyle döner). `explode.t_start` −1 sn'ye kadar inebilir (0. karede patlama sürüyor). vg_blender: `back`/`spin` kare kare anahtarlanır; `part_lock` olayı `back.t_end`'de üretilir; yeni şekil `vg.text(body, size, depth)` (gizli "WHAT'S INSIDE" baskısı için). | 0. karede patlama, tek tek kenetlenme, gerçek mekanizma ve kusursuz döngü bunlarsız kurulamaz. |
| Y13 | `yaklasimSceneErrors(spec, sb)` (build adımında ve fixer'da): `style_id = 'yaklasim'`, `lighting_preset = 'yaklasim'`; 0. anda en az iki parça patlama ortasında (ofset oranı 0,05–0,95); patlayan her parçanın `back`'i var, sonuncusu `duration − 1 sn` sonrasında biter (döngü için birleşik son); ardışık kamera anahtarları birbirinden farklı (statik sahne yok). Gizli imza ve x-ray görünümü (`pc_clear` kabuk) builder kuralıdır; denetimini görsel reviewer yapar. | Geometriyi aşırı doğrulamadan YAKLASIM'ın iskeleti garanti edilir. |

### Ses

| # | Karar | Gerekçe |
|---|---|---|
| Y14 | Müzik **deterministik**: `python/audio_service/audio_service/yaklasim_music.py`, Rubik `music.py`'nin parametreli hâli: 120 BPM, Am–F–C–G, 0. karede tam enerji, `macro` beat(ler)inde yalnızca davul seyrelir, döngüye uygun (giriş/çıkış yok), mono 48 kHz WAV. Girdi: süre, seyrek davul pencereleri, tohum. `music` adımı Claude oturumu açmaz; `music_plan` artefaktı (girdiler) ve `music_stem` yazar. | Kural sabit; besteci ajanı token harcar ve kuralı bozabilir. |
| Y15 | Efekt sesleri üretilir (Rubik `sfx.py`): `snap` (330/165/660 Hz), `tap` (294/147 Hz), `land` (70/140 + 440/220 Hz), yumuşak atak (≥ 5 ms), sabit perde. Yerleşim: ilk 5 sn hiç efekt yok; `part_lock` → `snap` (en az 0,25 sn arayla), `flash` geçişi → `tap`, son kenetlenme → `land`. Kanca "whoosh"u, kütüphane efektleri, riser ve tiz darbe YAKLASIM'da kullanılmaz. | YAKLASIM ses kuralları. |
| Y16 | Miks −14 LUFS (mevcut iki geçişli mastering değişmez). Ses düzenleme (`audio_edit`) YAKLASIM videolarında kapalıdır (API 409, düğme gizli): müzik deterministik olduğu için talimat bir şey değiştirmez. | Kullanıcıya etkisiz bir düğme göstermemek. |

### Açıklama ve inceleme

| # | Karar | Gerekçe |
|---|---|---|
| Y17 | `publish.caption`: İngilizce, arama kalıplarına yakın iki cümle + tek soru + "bunu birine gönder" tetikleyicisi, sonda 1–5 hashtag; ≤ 2200 karakter, Türkçe harf yok, en az bir `?`. `publish.youtube_title`: ≤ 100 karakter, hashtag'siz. `finalize` adımı bunları `videos.caption`/`youtube_title`'a yazar — kullanıcı daha önce elle düzenlediyse dokunmaz. | Platforms sekmesindeki kopyala düğmeleri yeni üretimlerde dolu gelir. |
| Y18 | Reviewer ve rol istemleri YAKLASIM ölçütleriyle yeniden yazılır (storyboarder, builder, fixer, researcher, reviewer_visual, reviewer_retention, reviewer_audio). Kontrol kimlikleri ve puanları değişmez; anlamı YAKLASIM'a göre okunur (ör. `hook_text_short` = ≤ 5 kelime; `labels_correct` = sarı halka doğru parçada). `RUBRIC_VERSION` `final@3`'e çıkar (kayıtlar hangi okumayla puanlandığını söyler). | Puanlama makinesi (K13) korunur; ölçütün içeriği değişir. |
| Y19 | Doğruluk ilkesi aynen: her parça, mekanizma ve sayı kaynaklı; uydurma parça yok. Sayaçtaki sayı bir iddiaya (`claim_ids`) bağlıdır. | YAKLASIM'ın son cümlesi. |

### Test altyapısı

| # | Karar | Gerekçe |
|---|---|---|
| Y20 | Sahte (fake) boru hattı fikstürleri YAKLASIM'a geçer: `storyboard-kalem.json` (13,5 sn, İngilizce, zincir, publish), `scene-kalem.json` (`yaklasim` stil/ışık, `back`, `spin`) ve `tests/fixtures/scene/kalem/` `bin/scene-fixtures.sh` ile yeniden üretilir. VO fikstürleri Faz B'de silinir. | Smoke ve birim testleri gerçek kurallara karşı koşar. |

## Faz B kararları (temizlik)

| # | Karar |
|---|---|
| Z1 | Seslendirme hattı silinir: `voice` adımı, VO zamanlama/yeniden zamanlama, VO storyboard kuralları, anlatıcı sesi (API, DB, UI), TTS motorları ve Python TTS/ASR modülleri, ilgili testler ve fikstürler. `AudioPlanSchema`/`captionPages` gibi ortak parçalar silinmeden önce taşınır. `AUDIO_MODES` okuma için kalır (`vo` eski kayıtlarda). |
| Z2 | Kanal stili seçimi silinir: `/api/channel-style`, ayar bölümü, `k19` görselleri, `channel.style` ayarı. Eski stil kimlikleri şemada okunur kalır. |
| Z3 | Serbest besteci silinir: `audio_director` rolü, `MusicScore` üretimi, FluidSynth sürücüsü ve `music.py`/`music_cli.py`; ses düzenleme (`audio_edit` koşusu, `remix` adımı, API ucu, AudioCard düzenleme alanı). Eski `music_score` artefaktları okunur kalır. |
| Z4 | Müziksiz varyant (`final_video_tiktok`) artık üretilmez: compose tek varyant çıkarır; QC, compose `reuse` ve sürüm görünümü `final_video_music`'e bağlanır; `QcReportSchema.tiktok` boş dizi kabul eder; web'deki varyant çipleri kalkar. Eski kayıtlardaki varyant okunur. |
| Z5 | Kütüphane SFX'leri (whoosh, swoosh, click, tick, thud) ve müzik yatağı ön koşulu (`preflight` "izinli müzik gerekli") kalkar; varlık defteri (asset ledger) kalır (lisans kaydı için). |

## Hata durumları

- Storyboard YAKLASIM'a uymazsa adım aynı oturuma hatalarla geri döner (mevcut `check` döngüsü); iki denemeden sonra `needs_human`.
- Sahne YAKLASIM'a uymazsa build adımı aynı builder oturumuna hatalarla döner (mevcut döngü).
- Müzik üretimi başarısızsa adım `failed` (yeniden denenebilir); efekt üretimi deterministik ve yereldir.
- `publish` eksikse storyboard doğrulaması düşer; finalize eski videolarda (publish yok) caption'a dokunmaz.

## Test

- shared: `yaklasimStoryboardErrors` her kural için bir geçen bir kalan örnek; `yaklasimSceneErrors`; güvenli alan birleşimi; caption kuralları; `effectiveDuration` sabit pencere; vurgu ayrıştırma.
- vg_blender (Blender içinde): `back`/`spin` ofsetleri ve `part_lock` olay karesi; `text` şekli.
- audio_service (pytest): müzik süresi = istenen, 48 kHz mono, tepe ≤ 0,89; seyrek davul penceresinde davul enerjisi düşük; aynı tohum aynı çıktı. Efekt sesleri 50–700 Hz bandı dışında enerji taşımaz.
- worker: storyboard/build adımları YAKLASIM hatalarını geri döndürür; music adımı Claude çağırmadan stem yazar; planSfx ilk 5 sn boş, yalnızca snap/tap/land; finalize caption'ı yazar ama elle düzenlenmişi ezmez.
- api: `vo` ve `duration` 400; YAKLASIM videosunda ses düzenleme 409; yeni videonun `approach`'u `yaklasim`.
- remotion: props YAKLASIM katmanı (vurgu, sayaç değeri, halka, parlama kareleri); düzen denetimi birleşik güvenli alanla.
- web: Studio'da ses kipi ve süre denetimi yok; Ayarlar'da stil/anlatıcı bölümü yok.
- smoke: S2 akışları YAKLASIM fikstürleriyle; S2e (süre/yönerge) "süre sabit" olarak güncellenir.
- Gerçek doğrulama: bir gerçek üretim (GPU kuyruğu için takas alanı boş olmalı), çıkan video YAKLASIM.md'ye karşı kare kare izlenir.

## Kapsam dışı

YAKLASIM dışında ikinci bir yaklaşım; çok dilli ekran yazısı; platform API'leri; Blender'da x-ray gölgelendirici (şeffaf kabuk yeterli);
eski videoların YAKLASIM'a yeniden üretilmesi.
