Selam! "İçinde Ne Var?" TikTok kanalım (@whatsinit.lab) için yeni bir 3D "nesnenin içi" videosu üreteceğiz:
ASMA KİLİT — "Bu anahtar neden açıyor da yanlışı açmıyor?" Bu prompt kendi kendine yeterli; önceki bölümlerin birikimi
referans dosyalarda.

## 0. Format (karar verildi)
~30–33 sn, tek nesne + tek kahraman (pimli silindir). Anlatım dili: POV kanca + ölçek şoku (anahtar deliğinden içeri uçuş,
pimler dev sütunlar) + "ya bu parça olmasaydı?" (yanlış anahtar ✕ / doğru anahtar ✓) + "pimleri say" geri sayımı.
Soru sorma; doğrudan üretime geç. Otonom çalış, uzun sessizliklerde kısa ilerleme notu ver. Tek istisna: YAYINDAN ÖNCE ONAY İSTE.

## 1. Önce oku (zorunlu)
- ~/VideoGuide.md — tam kılavuz. Özellikle §13 "Bölüm geçmişi" tablosu, "Bölüm 4 (PS5 kolu) dersleri" ve
  "Bölüm 5 (Saat) dersleri" (Sketchfab GLB içe alma, animasyon örnekleme/yeniden zamanlama, marka temizliği, panel/çok kamera,
  çapa export'u, ses kuralı, döngü PSNR, etiket yerleşimini anchors.json'dan hesaplama).
- ~/TikTokPrivacyCheck.md — yayın yolu (gizli → SELF_ONLY Direct Post, açık → --draft).
- ANA ŞABLON: episodes/saat/ → blender/scene.py (sabitler tek yerde, dünya/kamera yapısı, shot(), anchor export,
  --preview/--draft/--anchors-only/--camtest), blender/watch_assets.py (import_glb, fix_materials, sample_anim/retime, doku
  temizliği, ray_hit), blender/render_pass.py, blender/compose.sh, remotion/src/SaatIcinde.tsx + HudLabel.tsx (oy prop'lu) +
  theme.ts, audio/music.py, audio/sfx.py, README.md, PLAN.md, caption.txt. Gerekirse ps5-kol/ (X-ray shader, kesit, DOF, dutch).
- Final referanslar: ~/videogen-data/episodes/saat/final.mp4 ve ~/videogen-data/episodes/ps5-kol/final.mp4.
  MP4'ten contact sheet çıkarıp İZLE:
  ffmpeg -i X.mp4 -vf "select='not(mod(n\,30))',scale=180:320,tile=17x2" -frames:v 1 -fps_mode vfr s.png → Read.
- Hafıza: ~/.claude/projects/-home-alper/memory/docs/approach/YAKLASIM.md, docs/approach/YAKLASIM.md, sketchfab-token.md.

## 2. Kullanıcının kesin kuralları
- TEMA + MÜZİK AİLESİ KORUNUR: lacivert stüdyo, Montserrat/Inter, sarı vurgu, mavi çerçeveli numaralı etiketler, chill müzik
  (ps5-kol/saat 90 BPM ailesi; yalnız bölüm zamanları yeni kurguya). Farklılaşma ANLATIMDA. Küçük tema varyasyonu serbest
  (ör. arka planda anahtar dişi profili / pim deseni).
- SES: riser / whoosh / süpürme / tape-stop / kabaran pad YOK; ani tiz veya yüksek ses YOK (ding, metal çarpma, 2 kHz+ tık yok).
  Tüm efektler sabit perdeli sinüs, 50–700 Hz, atak ≥5 ms. Kilit "klik"i ve pim sesleri de yumuşak orta frekans sinüs.
  Doğrula: ebur128 LRA ≤ 5 LU, anlık tepe ≤ medyan + ~4 dB (vurgu sesleri müzik vurgularıyla üst üste binmesin);
  spektrumda enerji ~1,5 kHz altında.
- KANCA TONU: suçlayıcı/sert değil, yumuşak ve merak uyandıran ("Herkes … sanır 🤫" → "Aslında … 😉" tadında).
- GERÇEK MESH: dış görünüm ve kahraman mekanizma için lisanslı Sketchfab modelleri; iç detaylar kodla tamamlanabilir.
- ANLATIM, ADLANDIRILMIŞ İŞLEVLERİ söylesin: gövde, U kol (shackle), silindir (plug), anahtar pimi, üst pim (driver pin),
  pim yayı, kesme çizgisi (shear line), anahtar dişleri (bitting), kilitleme dili/bilye.
- Marka: gerçek logo/marka adı görünmez (gövdedeki marka yazısını temizle; gövdeye "WHAT'S INSIDE" + @whatsinit.lab kazı).
- GÜVENLİK: kilit açma (lockpicking/bumping) tekniği ÖĞRETİLMEZ; yalnızca doğru anahtarın neden çalıştığı anlatılır.

## 3. Sketchfab modelleri (araştırıldı; hepsi indirilebilir, CC BY — lisansı yeniden kontrol et)
Token ve indirme: ~/SketchfabToken.md (/v3/models/<uid>/download → glb url, 300 sn geçerli). İndirmeleri ayrı boş klasöre koy
(episodes/asma-kilit/blender/asset_dl/). Lisansı önce https://api.sketchfab.com/v3/models/<uid> ile kontrol et. CC BY →
atıf caption.txt + README'ye. Önce her modeli 5 yönden render edip (saat oturumundaki look.py kalıbı) seç.
- Kahraman (pimli silindir): "3December 2020 - Cylinder Lock" — Jack Kelly — d18aedad20a24dc294121229fa5a5892 — 3,7K yüz;
  saydam alıştırma kilidi + kesit (cutaway) → pimler, yaylar, silindir görünür. Pim/yay parçalarını ayrı objelere ayır,
  basış/hizalanma animasyonunu kodla yap.
- Dış asma kilit (aday): "Small Padlock and Key" — Miljan Bojovic — 91827ac5244a48f0b22fded4b2541188 — 17K yüz, anahtar dahil.
- Yedekler: "Padlock & Key" (tediuminteractive, 745c1c723d26498e9681cc0d7d065b3c, animasyonlu, 1,7K yüz) ·
  "Lock cylinder" (RX10, 1217888924d14cb9b85ea404df42136d, 869K yüz — ağır, 6 GB VRAM'e dikkat) ·
  "Padlock" (Nichgon, c9f0cf0cbbe64ba49001d644244b1d16) · "Closed shackle padlock" (Virtual Museums of Małopolska,
  bdbad12e9bab41c6ae4507456fbab40d, 110K yüz, tarihi).
- Gerekirse ara: https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=... (CC BY / CC0; NonCommercial KULLANMA).
GLB notları: kök matrisi uygula, yönü render ile doğrula, BLENDED+alfa gelirse alfayı kopar → DITHERED (saydam gövde bilinçli
olarak BLENDED kalabilir; sıralama hatasına bak), dokudaki marka yazısını numpy ile boya (saat: watch_assets._paint).

## 4. Doğrulanacak bilgiler (kaynakla doğrula; doğrulanmayanı kullanma)
- Pimli silindir (pin tumbler) ilkesi: her yuvada alt/anahtar pimi + üst/sürücü pim + yay; doğru anahtar tüm pim ayrımlarını
  kesme çizgisine getirir → silindir döner. Yanlış anahtarda en az bir pim çizgiyi keser → dönmez.
- Tarihçe: modern pimli silindir Linus Yale Sr. (1848) / Linus Yale Jr. (1861–1865 patentleri); fikrin atası ~4000 yıllık
  Mısır ahşap pimli kilidi — twist adayı ("aslında 4000 yıllık bir fikir 😉").
- Kombinasyon sayısı: 5 pim × yuva başına derinlik sayısı (ör. 5–10) → teorik 5^5 = 3.125 … 10^5 = 100.000; üreticiler MACS
  kısıtıyla daha azını kullanır — kesin cümleyi kaynakla kur.
- Asma kilitte U kolu tutan kilitleme dili / bilyeler ve silindirin bunları nasıl serbest bıraktığı.

## 5. Farklılaşma (önceki bölümler: kalem, klavye, CPU, PS5 kolu, saat — VideoGuide §13 tablosu)
Bu bölümde kullanılacak, henüz kullanılmamışlar: **POV kanca** (anahtarı kilide sokan el), **ölçek şoku** (anahtar deliğinden
içeri uçuş; pimler dev sütun), **"ya bu parça olmasaydı?"** (yanlış anahtar → bir pim kesme çizgisinde takılır ✕; doğru anahtar →
hepsi hizalanır ✓), **"pimleri say" geri sayımı** (5/5 hizalandı ✓). Saatten farklı olarak bölünmüş ekran YOK (tek kahraman),
fly-through anahtar deliğinden. En az 4 eksende saat ve PS5 bölümünden ayrış; farklılaşma planını PLAN.md'ye yaz.
Sor: "Önceki bölümleri izlemiş biri ilk 2 sn'de 'aa bu farklı' der mi?"

## 6. Sabit kalacaklar
1080×1920, 30 fps, ~30–33 sn; ilk 0,5 sn'de hareket + yazı; TikTok güvenli alanı (önemli içerik dikeyde 150–1510 px, sağdan
≥150 px içeride); çapa takipli numaralı etiketler (aynı anda en çok 2–3, birbirine/kenara binmesin; dx/dy'yi anchors.json
koordinatlarından hesapla); iki seviye "içeri" (asma kilidin parçaları → silindirin pimleri); doğrulanmış vay bilgisi;
CTA ("Sıradaki nesne ne olsun? Yorumlara yaz" veya içeriğe uygun bir soru); son kare = ilk kare (PSNR ≥ 40 dB;
arka plan deseni animasyonluysa son karede ilk kareye dönsün); Türkçe (latin-ext).

## 7. Teknik akış
1. İskelet episodes/asma-kilit/{blender,remotion,audio}; Remotion'u saat'ten kopyala, node_modules'ü cp -al ile
   hard link'le; yeni composition id + bileşen adı.
2. Remotion işinden önce remotion-best-practices skill'ini yükle.
3. scene.py: saat mimarisi (sabitler tek yerde, --preview/--frames/--draft/--anchors-only/--camtest, shot() + rig'li roll
   kamerası, DOF, anchor export). Ölçek şoku için gerekirse iki dünya + iki kamera (CPU bölümü dersi). Blender'ı DAİMA
   bin/blender-gpu ile çalıştır.
4. Döngü: preview → sheet → Read; --camtest ile açı varyantları; --draft (%25) → kareleri public/frames'e KOPYALA →
   npx remotion render … --scale=0.5; contact sheet + kritik kareleri büyük boyutta (432×768 hstack) incele.
5. Tam render arka planda (Monitor ile izle). Ses: audio/music.py (chill, gürültüsüz) + audio/sfx.py.
6. Final: npx remotion render <Id> out/raw.mp4 --codec=h264 --crf=18 → iki geçişli loudnorm (-14 LUFS) → final MP4.
7. QA: 1 fps sheet, kritik bölümler, ilk/son kare PSNR, ffprobe, ebur128 (I, LRA, anlık tepe — saniye saniye M dökümü),
   showspectrumpic, etiket çakışma/güvenli alan.
8. Disk dar (~5 GB boş): PNG kareleri ~1,5 GB/video; taslak/ön izleme klasörlerini sil.

## 8. Bitirirken
- README.md (komutlar + kurgu tablosu + kaynaklar), PLAN.md, caption.txt (yumuşak kanca + soru + CC BY atıfları + 12–16
  hashtag: #whatsinside #animation #ai #fyp #foryou #viral #howitworks #3danimation #satisfying #keşfet #içindenevar
  + #padlock #lock #howlockswork #kilit #asmakilit).
- ~/VideoGuide.md §13'e bölüm 6 satırı + yeni dersler; hafızayı kısa güncelle.
- Sonucu SendUserFile ile gönder.
- YAYIN: önce onayımı iste. Onay gelince python3 ~/tiktok-poster/privacy_check.py: 0 (gizli) →
  post.py VIDEO "$(cat caption.txt)" --privacy SELF_ONLY; 10 (açık) → post.py VIDEO --draft ve açıklamayı bana ver.
  Sonra hesabı/videoyu herkese açma adımlarını söyle. Yayından sonra public/frames'i silmeyi öner.
- Final rapor Türkçe, kısa: video yolu, kurgu tablosu, neyi farklı yaptın, kalan sınırlar.
