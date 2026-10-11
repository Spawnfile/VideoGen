Selam! "İçinde Ne Var?" TikTok kanalım (@whatsinit.lab) için yeni bir 3D "nesnenin içi" videosu üreteceğiz.
SEÇİLEN ÜRÜN: **<ÜRÜN>**  ← aşağıdaki §3 kartlarından birinin adını yaz (ör. "Zeka küpü (Rubik)").
Bu prompt kendi kendine yeterli; önceki bölümlerin birikimi referans dosyalarda.

## 0. Ana referans: KLAVYE bölümü (karar verildi)
En çok izlenen ve en beğenilen video klavye (bölüm 2) oldu → bu bölümün **anlatım iskeleti, ritmi, müziği ve teması klavye**.
~28–32 sn. Soru sorma; doğrudan üretime geç. Otonom çalış, uzun sessizliklerde kısa ilerleme notu ver.
Tek istisna: YAYINDAN ÖNCE ONAY İSTE.

Klavye iskeleti (VideoGuide §5 storyboard'u, 10 vuruş) bu ürüne uyarlanır:
1. **Kanca = ürünün kendi kullanım hareketi** (klavyede tuşlarla harf harf yazılan "İÇİNDE NE VAR?"): yazı hareketle senkron belirir,
   son vuruşta yumuşak pop. İlk 0,5 sn'de hareket + yazı.
2. **Patlama**: parçalar dalga halinde ayrılır (konuma göre 0–18 kare gecikme), kamera geri çekilip yana döner.
3. **Parça etiketleri** (~6, numaralı, çapa takipli; aynı anda ≤ 2–3, geçici).
4. **Köprü** cümlesi → 5. **kahraman parçaya dalış** (diğer katmanlar kadrajdan çekilir) → 6. **kahraman kendi parçalarına ayrılır**
   → 7. alt parça etiketleri → 8. **mekanizma "aha" anı**: hareket → temas/olay → **somut sonuç + sayaç** (klavyede "ekran: H → HE → HEY")
   → 9. **dönüş**: kahraman yerine oturur + **parça yağmuru** (klavyedeki tuş yağmuru) + doğrulanmış **vay bilgisi**
   → 10. **CTA + döngü** ("Sıradaki nesne ne olsun? Yorumlara yaz 👇"), son kare = ilk kare.

## 1. Önce oku (zorunlu)
- ~/VideoGuide.md — tam kılavuz. Özellikle §5 storyboard (klavye), §6–§8 (scene.py, Remotion, ses), §13 "Bölüm geçmişi" tablosu ve
  bölüm 4/5/6 dersleri (Sketchfab GLB içe alma, marka temizliği, ses kuralı, döngü PSNR, etiket yerleşimi, **z-fighting dersi**).
- ~/TikTokPrivacyCheck.md — yayın yolu (gizli → SELF_ONLY Direct Post, açık → --draft).
- **ANA ŞABLON (anlatım + müzik + tema): episodes/klavye/** → README.md, blender/scene.py (F_TYPE0…F_HOME zaman çizelgesi,
  katman patlatma, dalış, kahraman ayrılması, yağmur), remotion/src/KlavyeIcinde.tsx (TypedHook, Label, Caption, Spark,
  ScreenLetters, useShake, Flash), theme.ts, audio/music.py (120 BPM Am–F–C–G — **müziğin kendisi**, yalnız bölüm zamanları yeni kurguya).
- **TEKNİK ŞABLON (Sketchfab mesh hattı): episodes/asma-kilit/** → blender/lock_assets.py (import_glb, fix_materials, bake_world,
  split_faces, bisect_keep, doku temizliği _paint, ray_hit), blender/scene.py (sabitler tek yerde, --preview/--draft/--anchors-only/
  --camtest, shot(), anchor export, set_interp), remotion/src/HudLabel.tsx, audio/sfx.py; gerekirse saat/ (sample_anim/retime: animasyonlu GLB).
- Final referanslar — contact sheet çıkarıp İZLE (önce klavye!):
  ffmpeg -i X.mp4 -vf "select='not(mod(n\,30))',scale=180:320,tile=17x2" -frames:v 1 -fps_mode vfr s.png → Read
  ~/videogen-data/episodes/klavye/final.mp4 (ANA) · ~/videogen-data/episodes/asma-kilit/final.mp4
- Hafıza: ~/.claude/projects/-home-alper/memory/docs/approach/YAKLASIM.md, docs/approach/YAKLASIM.md, sketchfab-token.md.

## 2. Kullanıcının kesin kuralları
- TEMA + MÜZİK: **klavye** ailesi — lacivert stüdyo radyal gradyan + soluk ızgara, Montserrat/Inter (latin-ext), sarı vurgu, mavi çerçeveli
  numaralı etiketler; **klavye müziği** (klavye/audio/music.py, 120 BPM). Küçük tema varyasyonu serbest (ürüne özgü arka plan deseni).
- SES: riser / whoosh / süpürme / tape-stop / kabaran pad YOK; ani tiz veya yüksek ses YOK (ding, metal çarpma, 2 kHz+ tık yok).
  Klavyedeki Kenney/gürültülü thock efektleri KULLANILMAZ → tüm efektler sabit perdeli sinüs, 50–700 Hz, atak ≥ 5 ms (asma-kilit/audio/sfx.py
  kalıbı). İlk 5 sn yalnız müzik (kanca vuruşları müziğe gömülü yumuşak sinüs olabilir). Doğrula: ebur128 LRA ≤ 5 LU, anlık tepe ≤ medyan
  + ~4 dB; spektrumda enerji ~1,5 kHz altında; sessizlik kapılarında giriş VE çıkış rampası (klik yok).
- KANCA TONU: yumuşak, merak uyandıran ("Herkes … sanır 🤫" → "Aslında … 😉" tadında); suçlayıcı değil.
- GERÇEK MESH: dış görünüm (ve mümkünse kahraman) lisanslı Sketchfab modelinden; iç detaylar kodla tamamlanabilir.
- ANLATIM, ADLANDIRILMIŞ İŞLEVLERİ söylesin (kartta listelenen parça adları).
- Marka: gerçek logo/marka adı görünmez (dokudan boya / geometriden sil); ürüne "WHAT'S INSIDE" + @whatsinit.lab kazı/bas, CTA'da parlasın.
- Bilgi: her sayı/tarih kaynakla doğrulanır (arka planda bir doğrulama ajanı kullan); doğrulanamayanı yumuşat ya da kullanma.
- Kesitte hazır modelin içeride kalan **çakışan yüzeylerini** (z-fighting → siyah/gri titreme) ARA: suçlu parçayı gizleyerek bul,
  BVH yüzey mesafesiyle sil, gerekirse kendi geometrinle değiştir; ardışık 5 karede doğrula.

## 3. Ürün kartları (araştırıldı; hepsi indirilebilir, CC BY 4.0 — lisansı yine api.sketchfab.com/v3/models/<uid> ile kontrol et)
Token: ~/SketchfabToken.md (/v3/models/<uid>/download → glb url, 300 sn). İndirmeleri boş bir klasöre koy: episodes/<klasör>/blender/asset_dl/.
Önce her modeli 5 yönden render et (yapı dökümü + parça bbox), sonra seç. Yetmezse ara:
https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=... (yalnız CC BY / CC0; NonCommercial/NoDerivs/ShareAlike KULLANMA).

**A) Zeka küpü (Rubik) — klasör `zeka-kupu`**
- Mesh: "Rubik's Cube" BeyondDigital d7d8aa83720246c782bca30dbadebb98 (11,6K yüz) · yedek "RUBIK'S CUBE" FromSi 4cc7c1bf585f4b929ddd32f6cab3ba58 (animasyonlu).
- Kanca (kullanım hareketi): küp hızlıca karışır/çözülür, her çeyrek turda bir harf → "NEDEN DAĞILMIYOR?"; son turda tüm yüzler tamamlanır.
- Patlama: 26 parça dalga halinde dışarı uçar → ortada **çekirdek (6 kollu haç)** kalır.
- Parçalar: köşe parçası (3 renk), kenar parçası (2 renk), merkez parça (1 renk), çekirdek, vida, yay, merkez kapağı, parça "ayakları".
- Kahraman: çekirdek + vida + yay → mekanizma: dönen katmanın parçaları ayaklarıyla iç yörüngede kayar, merkezler sabit;
  sayaç fikri: "katman döndü: 90° → 180°…" ya da "çözüm: 20 hamle".
- Vay (doğrula): 43.252.003.274.489.856.000 olası dizilim (~43 kentilyon); her dizilim ≤ 20 hamlede çözülebilir ("God's number", 2010);
  Ernő Rubik, 1974. Not: "Rubik's" ticari marka → ekranda "zeka küpü" + bir kez "Rubik küpü" denebilir, logolu merkez kapağı boyanır.
- İç parçalar kodla (modeller yalnız dış yüz): çekirdek, vida/yay, parça ayakları.

**B) Kablosuz kulaklık (AirPods Pro tipi) — klasör `kulaklik`**
- Mesh: "AirPods Pro" Jed Falcone 3f84ddc3d87a4ec0a5e5f379abfecd9c (161K yüz, animasyonlu — kutu kapağı?) · yedek JY_JY_ 4478dddbfa244f6f9b93eebbd027a73b (70K).
- Kanca: kutunun kapağı "pıt" diye açılır, kulaklık mıknatısla yerine çekilir/çıkar; yazı kapağın açılışıyla.
- Parçalar (kodla iç): pil (düğme pil), hoparlör sürücüsü (mıknatıs + bobin + diyafram), mikrofonlar, çip, anten, kuvvet sensörü.
- Kahraman: sürücü → mekanizma: akım → bobin titreşir → diyafram havayı iter → ses dalgası; sayaç: "Hz 20 → 20.000".
- Dikkat: PS5 bölümünde bobin+mıknatıs kullanıldı → mekanizmayı **ses dalgası/gürültü engelleme** (karşı-faz dalga) üzerinden ayrıştır.
- Marka: Apple adı/logosu görünmez; ekranda "kablosuz kulaklık".

**C) Hard disk (HDD) — klasör `hard-disk`**
- Mesh: "WD Green 1TB Hard Disk HDD" MajdyModels e9244f56e0724dd097570e29bae4b7c6 (117K yüz) — marka etiketi boyanır.
- Kanca: disk çalışır, okuma kolu "tık tık" sağa sola sıçrar; yazı kol hareketiyle.
- Parçalar: plaka (platter), motor (spindle), okuma/yazma kafası, aktüatör kolu, ses bobini mıknatısı, park rampası, devre kartı.
- Kahraman: okuma kafası → mekanizma: kafa yüzeye değmeden **hava yastığında uçar**; bit = manyetik yön (N/S) → "okunan: 1 0 1 1…" sayacı.
- Vay (doğrula): 7.200 dev/dk; kafa–yüzey arası birkaç nanometre ("bir parmak izinden binlerce kat ince" tarzı kıyas, kaynağıyla).

**D) Anlık fotoğraf makinesi (Polaroid 600 tipi) — klasör `anlik-kamera`**
- Mesh: "Polaroid 600 Vintage Cool Cam" Perry Wubben 8fdc1e32d83b43d0b8daf83e863e639f (12,9K yüz).
- Kanca: deklanşör "çık" → fotoğraf ağızdan kayarak çıkar; yazı fotoğrafın çıkışıyla.
- Parçalar: lens, deklanşör, flaş, film kartuşu (+ pil kartuşun içinde), merdaneler, ayna, motor/dişliler.
- Kahraman: film karesi → mekanizma: merdaneler kenardaki **kimyasal keseyi** patlatıp yayar → görüntü kendiliğinden belirir (sayaç: "gelişme %0 → %100").
- Vay (doğrula): Polaroid 600 filminde pilin kartuşun içinde olması; görüntünün ~10–15 dk'da tam belirmesi; Edwin Land, 1947.
- Marka: Polaroid adı/logosu boyanır; ekranda "anlık kamera".

**E) Walkman / kasetçalar — klasör `walkman`**
- Mesh: "Walkman" Tom Seddon 1e8296b489084d6ba76b485d1c2fd37c (5,5K yüz, 1.509 beğeni — en "premium" duran düşük poligon).
- Kanca: kapak açılır, kaset takılır, ▶ basılır, makaralar döner; yazı tuşla.
- Parçalar: kaset (makaralar + manyetik bant), okuma kafası, kapstan + baskı silindiri, motor + kayış, kulaklık çıkışı.
- Kahraman: okuma kafası + bant → mekanizma: manyetik desen kafadan geçer → elektrik sinyali → ses (sayaç: bant hızı 4,76 cm/s; doğrula).
- Nostalji kancası güçlü ("Bunu hatırlayan var mı? 📼"). Marka: Sony/Walkman adları görünmez; ekranda "kasetçalar".

(Diğer adaylar, mesh hazır: benzinli çakmak "Constantine Lighter" ead916b4e53642599b5a4b7ef27b5c4e · Li-ion 18650 pil
eefe894897f746f689b899f80b15d325 (iç "jelly roll" kodla, açınca metrelerce şerit) · sonik diş fırçası 74a54eea8293455baf97a25f7eb88cd0
· fidget spinner 5ca2c478b63e4d3c9006883dab4031ac.)

## 4. Farklılaşma
Anlatım iskeleti klavye ama önceki 6 bölümün **tekrarı olmasın**: kanca ürünün kendi hareketi, kahraman ve mekanizma yeni, sayaç ürüne özgü,
final "yağmuru" ürünün parçalarıyla. Kullanılmış anlatım dilleri (VideoGuide §13): yazılan soru, tahmin oyunu, yanlış inanış rozeti, X-ray,
kesit bıçağı, VS bölünmüş ekran, fly-through, raunt/skor, POV el, ölçek şoku, yanlış/doğru karşılaştırma, pimleri say. Klavye iskeletine
en fazla 1 yeni dokunuş ekle (ör. yavaş çekim darbe, parçaların mıknatısla toplanması, "parçaları say" meydan okuması) ve PLAN.md'ye yaz.
Sor: "Klavyeyi seven biri bunu da sonuna kadar izler mi, ve ilk 2 sn'de 'bunun içini hiç görmemiştim' der mi?"

## 5. Sabit kalacaklar
1080×1920, 30 fps, ~28–32 sn; ilk 0,5 sn'de hareket + yazı; TikTok güvenli alanı (önemli içerik dikeyde 150–1510 px, sağdan ≥ 150 px);
çapa takipli numaralı etiketler (aynı anda ≤ 2–3, birbirine/kenara binmesin; dx/dy'yi anchors.json koordinatlarından hesapla; retention çipiyle
çakışmasın); iki seviye "içeri" (ürünün parçaları → kahramanın alt parçaları); doğrulanmış vay bilgisi; CTA; son kare = ilk kare (PSNR ≥ 40 dB;
animasyonlu arka plan deseni son karede başa dönsün); Türkçe (latin-ext).

## 6. Teknik akış
1. İskelet episodes/<klasör>/{blender,remotion,audio}; Remotion'u klavye veya asma-kilit'ten kopyala, node_modules'ü `cp -al` ile hard link'le;
   yeni composition id + bileşen adı.
2. Remotion işinden önce remotion-best-practices skill'ini yükle.
3. scene.py: asma-kilit mimarisi (sabitler tek yerde; --preview/--frames/--draft/--anchors-only/--camtest; shot() + rig'li roll kamerası;
   anchor export) + klavye zaman çizelgesi (F_TYPE…F_HOME). Blender'ı DAİMA bin/blender-gpu ile çalıştır.
   Arka plan modunda soket keyframe interpolasyonunu set_interp ile ayarla.
4. Döngü: preview → sheet → Read; --camtest ile açı varyantları; --draft (%25) → kareleri public/frames'e KOPYALA →
   npx remotion still/ render --scale=0.5; kritik kareleri 432×768 hstack ile büyük incele.
5. Tam render arka planda (Monitor / until-döngüsü ile izle). Ses: klavye music.py (yeni zamanlar) + sfx.py (sinüs). Render öncesi sesi
   <Audio> yerleşimini taklit eden Python miksiyle ölç (Remotion ses render'ı kareleri ister).
6. Final: npx remotion render <Id> out/raw.mp4 --codec=h264 --crf=18 → iki geçişli loudnorm (−14 LUFS) → final MP4.
7. QA (final MP4'ün kendisinden): 1 fps sheet, kritik bölümler büyük, ilk/son kare PSNR, ffprobe, ebur128 (I, LRA, saniye saniye M),
   showspectrumpic, etiket çakışma/güvenli alan, **ardışık karelerde titreme kontrolü** (kesit/iç bölgeler).
8. Disk dar (~3–5 GB boş): PNG kareleri ~1,5–2 GB/video; taslak/ön izleme klasörlerini sil; yalnız değişen aralığı -s/-e ile yeniden render et.

## 7. Bitirirken
- README.md (komutlar + kurgu tablosu + kaynaklar), PLAN.md, caption.txt (yumuşak kanca + soru + CC BY atıfları + 12–16 hashtag:
  #whatsinside #animation #ai #fyp #foryou #viral #howitworks #3danimation #satisfying #keşfet #içindenevar + ürüne özgü 4–5 etiket).
- ~/VideoGuide.md §13'e bölüm 7 satırı + yeni dersler; hafızayı kısa güncelle.
- Sonucu SendUserFile ile gönder.
- YAYIN: önce onayımı iste. Onay gelince python3 ~/tiktok-poster/privacy_check.py ile ÖLÇ (benim "gizli" dememe güvenme; ayar API'ye birkaç
  dakikada yansıyor): 0 (gizli) → post.py VIDEO "$(cat caption.txt)" --privacy SELF_ONLY; 10 (açık) → bana bildir, gerekirse --draft.
  Sonra hesabı/videoyu herkese açma adımlarını söyle. Yayından sonra public/frames'i silmeyi öner.
- Final rapor Türkçe, kısa: video yolu, kurgu tablosu, neyi farklı yaptın, kalan sınırlar.
