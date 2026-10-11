Selam! "İçinde Ne Var?" TikTok kanalım (@whatsinit.lab) için yeni bir 3D "nesnenin içi" videosu üreteceğiz (bölüm 7):
KABLOSUZ KULAKLIK (AirPods Pro tipi) — "Bu minicik şeyin içine bunlar nasıl sığdı?" Bu prompt kendi kendine yeterli;
önceki bölümlerin birikimi referans dosyalarda. Proje klasörü: episodes/kulaklik/

## 0. Ana referans: KLAVYE bölümü (karar verildi)
En çok izlenen video klavye (bölüm 2) oldu → **anlatım iskeleti, ritim, müzik ve tema klavye**. ~28–32 sn.
Soru sorma; doğrudan üretime geç. Otonom çalış, uzun sessizliklerde kısa ilerleme notu ver. Tek istisna: YAYINDAN ÖNCE ONAY İSTE.

Klavye iskeleti (VideoGuide §5, 10 vuruş) kulaklığa uyarlanır:
1. **Kanca = kullanım hareketi**: şarj kutusunun kapağı "pıt" diye açılır, kulaklık mıknatısla yuvasından hafifçe kalkıp kameraya döner;
   yazı hareketle senkron belirir. Yumuşak merak tonu, ör. "Herkes içinde sadece bir hoparlör var sanır… 🤫" → "Aslında minik bir
   bilgisayar 😉" (sayıyı/iddiayı doğrulamadan yazma). İlk 0,5 sn'de hareket + yazı.
2. **Patlama**: kulaklık gövdesi (ve sapı) katman katman, dalga gecikmeli ayrılır; kamera geri çekilip yana döner.
3. **Parça etiketleri** (~6, numaralı, çapa takipli, geçici; aynı anda ≤ 2–3).
4. **Köprü** → 5. **kahraman parçaya dalış: hoparlör sürücüsü** → 6. sürücü kendi parçalarına ayrılır (diyafram, ses bobini, mıknatıs,
   kafes/ızgara) → 7. alt parça etiketleri → 8. **mekanizma "aha"**: elektrik sinyali → bobin mıknatısın içinde ileri-geri → diyafram
   havayı iter → ses dalgası; ardından **gürültü engelleme**: dış mikrofon gürültüyü duyar → çip ters (karşı-faz) dalga üretir → ikisi
   toplanınca düz çizgi = sessizlik. Somut sayaç/sonuç (ör. canlı dalga paneli "gürültü + karşı dalga = 0" ya da "Hz 20 → 20.000").
   9. **dönüş**: parçalar yerine oturur + **parça yağmuru** (klavyedeki tuş yağmuru gibi: kulak uçları/ızgaralar/pil yağar) + doğrulanmış
   **vay bilgisi** → 10. kulaklık kutuya geri oturur, kapak kapanır → **CTA + döngü** ("Sıradaki nesne ne olsun? Yorumlara yaz 👇"),
   son kare = ilk kare.
Not: PS5 bölümünde "bobin + mıknatıs" aktüatörü anlatıldı → tekrar hissi vermemek için sürücüyü kısa tut, asıl "aha"yı **karşı dalga ile
gürültü engelleme**ye ver. İki seviye içeri: kulaklığın parçaları → sürücünün alt parçaları.

## 1. Önce oku (zorunlu)
- ~/VideoGuide.md — tam kılavuz: §5 storyboard (klavye), §6–§8 (scene.py, Remotion, ses), §13 "Bölüm geçmişi" tablosu ve bölüm 4/5/6
  dersleri (Sketchfab GLB içe alma, kök matris, marka temizliği, animasyon örnekleme/retime, ses kuralı, döngü PSNR, etiket yerleşimi,
  **z-fighting / titreme dersi**).
- ~/TikTokPrivacyCheck.md — yayın yolu.
- **ANA ŞABLON (anlatım + müzik + tema): episodes/klavye/** → README.md, blender/scene.py (F_TYPE0…F_HOME zaman çizelgesi, dalga
  patlatma, dalış, kahraman ayrılması, yağmur), remotion/src/KlavyeIcinde.tsx (TypedHook, Label, Caption, Spark, ScreenLetters, useShake,
  Flash), theme.ts, audio/music.py (120 BPM Am–F–C–G — **müziğin kendisi**, yalnız bölüm zamanları yeni kurguya).
- **TEKNİK ŞABLON (Sketchfab mesh hattı): episodes/asma-kilit/** → blender/lock_assets.py (import_glb, fix_materials, bake_world,
  split_faces, bisect_keep, _paint doku temizliği, ray_hit), blender/scene.py (sabitler tek yerde, --preview/--draft/--anchors-only/
  --camtest, shot(), anchor export, set_interp), remotion/src/HudLabel.tsx, audio/sfx.py. Animasyonlu GLB için saat/blender/watch_assets.py
  (sample_anim, retime). Dalga paneli fikri için ps5-kol/ (canlı titreşim sinyali paneli).
- Final referanslar — contact sheet çıkarıp İZLE (önce klavye):
  ffmpeg -i X.mp4 -vf "select='not(mod(n\,30))',scale=180:320,tile=17x2" -frames:v 1 -fps_mode vfr s.png → Read
  ~/videogen-data/episodes/klavye/final.mp4 (ANA) · ~/videogen-data/episodes/asma-kilit/final.mp4
- Hafıza: ~/.claude/projects/-home-alper/memory/docs/approach/YAKLASIM.md, docs/approach/YAKLASIM.md, sketchfab-token.md.

## 2. Kullanıcının kesin kuralları
- TEMA + MÜZİK: **klavye** ailesi — lacivert stüdyo radyal gradyan + soluk ızgara, Montserrat/Inter (latin-ext), sarı vurgu, mavi çerçeveli
  numaralı etiketler; **klavye müziği** (klavye/audio/music.py, 120 BPM). Küçük tema varyasyonu serbest (ör. arka planda soluk ses dalgası
  deseni; animasyonluysa son karede başa dönsün).
- SES: riser / whoosh / süpürme / tape-stop / kabaran pad YOK; ani tiz veya yüksek ses YOK (ding, metal çarpma, 2 kHz+ tık yok). Klavyedeki
  Kenney/gürültülü thock efektleri KULLANILMAZ → tüm efektler sabit perdeli sinüs, 50–700 Hz, atak ≥ 5 ms (asma-kilit/audio/sfx.py kalıbı).
  Kutu kapağı "pıt"ı ve mıknatıs "tık"ı da yumuşak orta frekans sinüs. **Gürültü engelleme anında gerçek gürültü (beyaz gürültü) KULLANMA**;
  "gürültü"yü görselle anlat, seste en fazla müziğin kısa süre kısılıp geri gelmesi (rampalı). İlk 5 sn yalnız müzik. Doğrula: ebur128
  LRA ≤ 5 LU, anlık tepe ≤ medyan + ~4 dB; spektrumda enerji ~1,5 kHz altında; sessizlik kapılarında giriş VE çıkış rampası.
- KANCA TONU: yumuşak, merak uyandıran; suçlayıcı değil.
- GERÇEK MESH: kulaklık + şarj kutusu lisanslı Sketchfab modelinden (aşağıda). İç parçalar (pil, sürücü, mikrofonlar, çip/devre, anten,
  basınç sensörü) kodla tamamlanabilir; gerçek ürün yerleşimine sadık kal (sürücü kulak ucunun hemen arkasında, pil sap/gövdede,
  mikrofonlar dış yüzde ve sapta).
- ANLATIM, ADLANDIRILMIŞ İŞLEVLERİ söylesin: kulak ucu (silikon), hoparlör sürücüsü, diyafram, ses bobini, mıknatıs, dış mikrofon,
  iç mikrofon, çip, pil, anten, basınç/dokunmatik sensör (sap), şarj kontakları, şarj kutusu + mıknatıslar.
- Marka: Apple adı/logosu, "Designed by Apple…" yazısı vb. görünmez (dokudan boya / geometriden sil); ekranda "kablosuz kulaklık"
  (ürün adı söylenecekse yalnız "AirPods Pro tipi" gibi açıklayıcı, logosuz). Kutunun kapağına/ön yüzüne "WHAT'S INSIDE" + @whatsinit.lab
  bas; CTA'da parlasın.
- Bilgi: her sayı/tarih/iddia kaynakla doğrulanır (arka planda bir doğrulama ajanı kullan); doğrulanamayanı yumuşat ya da kullanma.
  Doğrulanacak adaylar: aktif gürültü engellemenin çalışma ilkesi (dış/iç mikrofon + karşı-faz sinyal); insan işitme aralığı ~20 Hz–20 kHz;
  kulaklıktaki pilin kapasitesi/boyutu; çipin saniyedeki işlem/örnekleme sayısı (ör. "saniyede 48.000 kez ses ölçer" türü bir iddia ancak
  kaynakla); şarj kutusunun kulaklığı kaç kez şarj ettiği.
- Kesitte/patlatmada hazır modelin içeride kalan **çakışan yüzeylerini** (z-fighting → siyah/gri titreme) ARA: suçlu parçayı gizleyerek bul,
  BVH yüzey mesafesiyle sil, gerekirse kendi geometrinle değiştir; ardışık 5 karede doğrula.

## 3. Mesh: API ile çek (CC BY 4.0 — lisansı yeniden kontrol et)
Token ve indirme: ~/SketchfabToken.md → `curl -H "Authorization: Token …" https://api.sketchfab.com/v3/models/<uid>/download` (glb url,
300 sn geçerli). Lisans: herkese açık `https://api.sketchfab.com/v3/models/<uid>` (license.label). İndirmeyi boş klasöre koy:
episodes/kulaklik/blender/asset_dl/ . Atıf caption.txt + README'ye.
- **Birincil:** "AirPods Pro" — **Jed Falcone** — 3f84ddc3d87a4ec0a5e5f379abfecd9c — 161K yüz, **1 animasyon** (muhtemelen kutu kapağı;
  doğrula; varsa saat/watch_assets.sample_anim + retime ile kendi zamanlamana göre yeniden keyframe'le).
- **Yedek:** "AirPods Pro" — **JY_JY_** — 4478dddbfa244f6f9b93eebbd027a73b — 70K yüz.
- Gerekirse ara: https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=earbuds (yalnız CC BY / CC0; NonCommercial,
  NoDerivs, ShareAlike KULLANMA).
- İlk iş: iki modeli de indir, yapı dökümü (obje/malzeme/doku/animasyon listesi, parça bbox, gevşek parçalar) + 5 yönden render
  (asma-kilit oturumundaki look.py / parts.py kalıbı) → kaliteye, parça ayrımına ve logo durumuna göre seç. Rig'li/deforme mesh varsa noktaları
  kemikten değil deforme mesh'ten ölç.
- GLB notları: kök matrisi uygula (bake_world), yönü render ile doğrula, BLENDED+alfa gelirse alfayı kopar → DITHERED (saydam kutu/kulak ucu
  bilinçli BLENDED kalabilir; sıralama hatasına bak), dokudaki logo/yazıyı numpy ile boya (asma-kilit lock_assets._paint), ölçeği gerçeğe
  yakın tut (kulaklık ~3 cm, kutu ~6 cm; 1 birim = 1 cm).

## 4. Farklılaşma (PLAN.md'ye yaz)
Anlatım iskeleti klavye, ama önceki 6 bölümün tekrarı olmasın. Kullanılmış diller (VideoGuide §13): yazılan soru, tahmin oyunu, yanlış inanış
rozeti, X-ray, kesit bıçağı, VS bölünmüş ekran, fly-through, raunt/skor, POV el, ölçek şoku, yanlış/doğru karşılaştırma, pimleri say.
Bu bölümün yeni dokunuşu: **"sesi görmek"** — kahraman anında ses dalgası görünür hâle gelir (diyaframdan çıkan halkalar), gürültü engellemede
gürültü dalgası + ters dalga üst üste binip düz çizgiye dönüşür. Klavye iskeletine en fazla 1–2 yeni dokunuş ekle.
Sor: "Klavyeyi seven biri bunu da sonuna kadar izler mi, ve ilk 2 sn'de 'bunun içini hiç görmemiştim' der mi?"

## 5. Sabit kalacaklar
1080×1920, 30 fps, ~28–32 sn; ilk 0,5 sn'de hareket + yazı; TikTok güvenli alanı (önemli içerik dikeyde 150–1510 px, sağdan ≥ 150 px);
çapa takipli numaralı etiketler (aynı anda ≤ 2–3, birbirine/kenara/retention çipine binmesin; dx/dy'yi anchors.json koordinatlarından hesapla);
iki seviye "içeri"; doğrulanmış vay bilgisi; CTA; son kare = ilk kare (PSNR ≥ 40 dB); Türkçe (latin-ext).

## 6. Teknik akış
1. İskelet episodes/kulaklik/{blender,remotion,audio}; Remotion'u asma-kilit'ten (veya klavye'den) kopyala, node_modules'ü `cp -al`
   ile hard link'le; yeni composition id `KulaklikIcinde` + bileşen adı.
2. Remotion işinden önce remotion-best-practices skill'ini yükle.
3. scene.py: asma-kilit mimarisi + klavye zaman çizelgesi (F_HOOK…F_HOME). Kahraman sürücü yakın planı küçük ölçekteyse ikinci dünya
   (CPU/asma-kilit dersi) düşünülebilir. Blender'ı DAİMA bin/blender-gpu ile çalıştır. Arka plan modunda soket keyframe
   interpolasyonunu set_interp ile ayarla.
4. Döngü: preview → sheet → Read; --camtest ile açı varyantları; --draft (%25) → kareleri public/frames'e KOPYALA → npx remotion still /
   render --scale=0.5; kritik kareleri 432×768 hstack ile büyük incele.
5. Tam render arka planda (until-döngüsü / Monitor ile izle). Ses: klavye music.py (yeni zamanlar) + sfx.py (sinüs). Render öncesi sesi
   <Audio> yerleşimini taklit eden Python miksiyle ölç (Remotion ses render'ı kareleri ister).
6. Final: npx remotion render KulaklikIcinde out/raw.mp4 --codec=h264 --crf=18 → iki geçişli loudnorm (−14 LUFS) → final MP4
   (out/kulaklik.mp4).
7. QA (final MP4'ün kendisinden): 1 fps sheet, kritik bölümler büyük, ilk/son kare PSNR, ffprobe, ebur128 (I, LRA, saniye saniye M),
   showspectrumpic, etiket çakışma/güvenli alan, ardışık karelerde titreme kontrolü (patlatma/iç bölgeler).
8. Disk dar (~3 GB boş): PNG kareleri ~1,5–2 GB/video; taslak/ön izleme klasörlerini sil; yalnız değişen aralığı -s/-e ile yeniden render et.

## 7. Bitirirken
- README.md (komutlar + kurgu tablosu + kaynaklar), PLAN.md, caption.txt (yumuşak kanca + soru + CC BY atfı + 12–16 hashtag:
  #whatsinside #animation #ai #fyp #foryou #viral #howitworks #3danimation #satisfying #keşfet #içindenevar
  + #earbuds #wirelessearbuds #noisecancelling #kulaklık #kablosuzkulaklık).
- ~/VideoGuide.md §13'e bölüm 7 satırı + yeni dersler; hafızayı kısa güncelle.
- Sonucu SendUserFile ile gönder.
- YAYIN: önce onayımı iste. Onay gelince python3 ~/tiktok-poster/privacy_check.py ile ÖLÇ (benim "gizli" dememe güvenme; ayar API'ye birkaç
  dakikada yansıyor): 0 (gizli) → post.py VIDEO "$(cat caption.txt)" --privacy SELF_ONLY; 10 (açık) → bana bildir, gerekirse --draft.
  Sonra hesabı/videoyu herkese açma adımlarını söyle. Yayından sonra public/frames'i silmeyi öner.
- Final rapor Türkçe, kısa: video yolu, kurgu tablosu, neyi farklı yaptın, kalan sınırlar.
