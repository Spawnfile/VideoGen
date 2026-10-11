Selam! "İçinde Ne Var?" TikTok kanalım (@whatsinit.lab) için **yeni bir format** deniyoruz (bölüm 8):
**NESNE + HİKÂYE + TÜRKÇE YAPAY ZEKÂ SESLENDİRME + KARAOKE ALTYAZI.** Gerçek, doğrulanabilir ve merak uyandıran bir
hikâyenin merkezindeki nesneyi (veya nesneleri) anlatacağız. Hikâye izleyiciyi tutacak; kanalın imzası olan "içini açma"
(patlatılmış görünüm + mekanizma "aha"sı) hikâyenin doruk noktasında gelecek. Proje klasörü: episodes/<slug>/
(slug, seçilen konsepte göre).

Otonom çalış, uzun sessizliklerde kısa ilerleme notu ver. API kullanımı (Sketchfab, Hugging Face, pip/uv kurulumları) önceden
onaylı. **Yalnızca iki yerde bana sor:** (1) Faz 1 sonunda konsept seçimi, (2) YAYINDAN ÖNCE onay.

## 0. Önce oku (zorunlu)
- ~/VideoGuide.md: tam kılavuz. Özellikle §4 tema, §5 storyboard, §6–§8 (scene.py, Remotion, ses), §13 bölüm geçmişi ve
  bölüm 4–7 dersleri (Sketchfab GLB içe alma, kök matris, marka temizliği, animasyon örnekleme/retime, X-ray, kesitli parça,
  Shrinkwrap yerel eksen tuzağı, z-fighting, ses kuralı, müzikte tık giderme, döngü PSNR, etiket yerleşimi).
- docs/approach/prompt-kulaklik.md ve episodes/kulaklik/ (README, PLAN, blender/scene.py + bud_assets.py,
  remotion/src/KulaklikIcinde.tsx, audio/music.py + sfx.py + mix.py). Bu, **en güncel teknik şablon**.
- episodes/klavye/: anlatım ritmi ve müzik referansı (en çok izlenen bölüm).
- ~/TikTokPrivacyCheck.md: yayın yolu.
- Hafıza: ~/.claude/projects/-home-alper/memory/ altında docs/approach/YAKLASIM.md, docs/approach/YAKLASIM.md,
  sketchfab-token.md, ml-dev-environment.md, gpu-hardware-limits.md.

## 1. Faz 1: Konsept seçimi (hikâye + nesne)
1. **6–8 konsept üret.** Her biri: gerçek bir olay/hikâye + merkezinde iç mekanizması "aha" veren bir nesne. Başlangıç havuzu
   (genişlet ya da değiştir):
   - **Apollo 11 ve keçeli kalem:** Ay'dan kalkış şalteri kırılınca Buzz Aldrin devre kesiciyi keçeli kalemle itti. İçi:
     devre kesici + kalem. Kanca: "İki astronotu Ay'dan bir kalem geri getirdi."
   - **Enigma:** "Her gün değişen şifreyi bir makine nasıl üretiyordu ve nasıl kırıldı?" İçi: rotorlar, reflektör, priz
     paneli. Bombe/Turing hikâyesi.
   - **Uçağın kara kutusu:** "Kazadan sağ çıkan tek şey." İçi: zırhlı bellek modülü, su altı konum vericisi (pinger).
   - **Rubik küpü:** "Mucidi kendi küpünü çözmek için ~1 ay uğraştı." İçi: çekirdek, yaylar, kenar/köşe parçaları.
   - **Titanik'ten çıkarılan cep saati:** batış saatini gösteren saatler. İçi: zemberek, eşapman. Saat bölümüyle (5)
     tekrar riski var, farkı hikâye taşımalı.
   - **Diğer adaylar:** pusula (Kolomb/Magellan), pace-maker (dikkat: tıbbi hassasiyet), Polaroid, telgraf ve SOS,
     Voyager altın plağı.
2. **Puanla** (1–5): ilk 2 sn kanca gücü · hikâyenin doğrulanabilirliği · iç mekanizma "aha"sı · duygusal merak/gerilim ·
   **Sketchfab'da CC BY/CC0, indirilebilir, kaliteli mesh var mı** (gerçekten API ile ara: `api.sketchfab.com/v3/search?
   type=models&downloadable=true&q=…`, lisansı `license.label` ile kontrol et; NonCommercial/NoDerivs/ShareAlike yok) ·
   kanalın önceki 7 bölümünden farklılık · marka/telif riski (gerçek logo yok; kişilerin yüzü/benzerliği yok, karakterler
   stilize ya da yalnız el/silüet).
3. **Doğrulama ajanı** (arka planda) her konseptin ana iddialarını kaynakla kontrol etsin. Doğrulanamayanı yumuşat ya da
   konsepti ele.
4. **İlk 3 konsepti tek bir AskUserQuestion ile sun.** Her seçenekte: kanca cümlesi, 1 satırlık hikâye akışı, nesne(ler),
   bulunan mesh'ler (ad, yazar, lisans), puan. Seçimden sonra soru sorma, üretime geç.

## 2. Faz 2: Senaryo ve seslendirme metni
- **Süre:** 40–55 sn (hikâye formatı; klavyenin 28 sn'si yerine). Türkçe anlatım ≈ 2,3–2,6 kelime/sn → 95–130 kelime.
- **Yapı** (klavye ritminin hikâyeye uyarlanmış hali):
  1. **Kanca (0–2 sn):** ses + görüntü + altyazı birlikte. İlk cümle merak boşluğu açsın, cevap sonda.
  2. **Bağlam:** yer, zaman, insanlar (3–6 sn).
  3. **Kriz/gerilim:** ne ters gitti?
  4. **Nesne sahneye girer:** kahraman nesne.
  5. **"İçine bakalım":** kanalın imzası. Patlatılmış görünüm + numaralı etiketler (≤ 2–3 aynı anda), iki seviye içeri.
  6. **Mekanizma "aha":** neden-sonuç + somut sayaç (kulaklıktaki dalga paneli gibi).
  7. **Çözüm/doruk:** hikâye nesnenin bu özelliği sayesinde çözülür.
  8. **Doğrulanmış vay bilgisi.**
  9. **CTA + döngü:** "Sıradaki hikâye hangi nesne olsun? Yorumlara yaz 👇". Son kare = ilk kare (PSNR ≥ 40 dB).
- **Metin kuralları (TTS için):**
  - Sayıları, tarihleri ve kısaltmaları **yazıyla** yaz ("bin dokuz yüz altmış dokuz").
  - Yabancı adlar Türkçe okunuşla gelir; gerekirse fonetik yaz ("Oldrin").
  - Cümleler kısa olsun (≤ 14 kelime), her cümle ayrı bir klip.
  - Ton: yumuşak, merak uyandıran, abartısız; suçlayıcı ya da korkutucu değil.
- Her iddia kaynaklı olacak. PLAN.md'ye "doğrulanan bilgiler + kaynaklar" bölümü yaz.

## 3. Faz 3: Ses önce (zaman çizelgesini seslendirme belirler)
**Model:** EMA Lightning (https://huggingface.co/canberkkkkkk/ema-lightning). Apache 2.0, Türkçe, tek ses, 8,6M parametre,
48 kHz, GPU/CPU, çevrimdışı. `pip install ema-lightning`, API `EMA().say(text, path=..., seed=..., speed=...)`.
- **Kurulum:** sistem Python 3.14 torch'u desteklemiyor. `uv` ile ayrı bir Python 3.12 venv kur:
  `ayrı bir TTS venv (VideoGen'in parçası değil)` (ml-dev-environment hafızasındaki kalıp). Kurulumu kendin çalıştır ve doğrula: örnek bir
  cümle üret, süresini ve örnekleme hızını yazdır.
- **Üretim** (`tts/say.py`): senaryo `script.json`'dan okunur (cümle id, metin, sahne). Her cümle için 3–5 seed dene.
  Kalite seçimi için çevrimdışı ASR ile geri yazıya çevir (faster-whisper, 6 GB VRAM'e sığan model: large-v3-turbo int8
  ya da medium), WER'i en düşük ve süresi hedefe en yakın seed'i seç. Hız `speed` 1.0–1.1.
- **Zamanlama:** her klibin süresi + cümleler arası 0,15–0,35 sn nefes → `timeline.json` (kare cinsinden; Blender T ve
  Remotion aynı dosyayı okur).
- **Kelime zamanları (karaoke):** faster-whisper `word_timestamps=True` ile her klipten kelime başlangıç/bitişini al,
  senaryodaki doğru yazımla eşle (ASR yazımını değil, senaryo metnini göster) → `captions.json`.
- **Yasal/etik:** model kartı yapay zekâ sesinin bildirilmesini istiyor. Ekranda ilk 3 sn'de küçük, okunur bir rozet
  ("🔊 Seslendirme: yapay zekâ") ve caption.txt'de "Bu ses yapay zekâ ile üretilmiştir." olacak. Ses gerçek bir kişiyi
  taklit etmez, gerçek kişilere söylemedikleri söz söyletilmez (alıntılar dolaylı anlatımla).

## 4. Faz 4: Görüntü (birden fazla mesh, farklı animasyonlar)
- **Sahneler:** hikâye 3–5 "set" içerir (ör. uzay aracı içi → kalem → devre kesici kesiti → kalkış). Her set ayrı Sketchfab
  modeli olabilir (CC BY/CC0). İç parçalar kodla tamamlanır. Setler arası geçişler kamera hareketiyle (fly-through, eşleşen
  şekil, zoom-punch) ya da Remotion'da kısa geçişlerle yapılır. Ölçek farkı büyükse iki dünya + iki kamera kullan
  (CPU/asma-kilit dersi).
- **Hareket:** animasyonlu GLB'leri `sample_anim` + `retime` ile kendi zamanlamana al. Hikâye vuruşları seslendirmedeki
  kelimelere senkron olacak (ör. "itti" kelimesinde kalem şaltere değer).
- **İnsan:** gerçekçi yüz yok. Gerekirse eldivenli el (asma-kilit POV el dersi) ya da silüet.
- **Marka:** gerçek logo/isim görünmez (dokudan boya, geometriden sil). Uygun yüzeye "WHAT'S INSIDE" + @whatsinit.lab
  baskısı koy (Shrinkwrap: yerel eksen dersine dikkat).
- **Z-fighting/titreme:** kesit ve patlatmalarda ara, ardışık 5 karede doğrula.

## 5. Faz 5: Remotion (altyazı + etiket + ses miksi)
- Önce `remotion-best-practices` skill'ini yükle, ardından altyazı için `remotion-captions`'ı.
- **Altyazı stili** (kanalın yeni imzası):
  - Montserrat 800, beyaz, okunan kelime **sarı** (#ffd23f) ve hafif pop.
  - Her parçada 2–5 kelime, en fazla 2 satır, koyu yarı saydam kutu.
  - Konum dikeyde ~1180–1460 px (güvenli alan 150–1510, sağdan ≥ 150 px).
  - Etiketlerle ve nesnenin kritik kısmıyla çakışmasın. Gerekirse sahneye göre üst banda (220–420) geç.
- **Tema:** klavye ailesi (lacivert stüdyo + soluk ızgara, Inter/Montserrat latin-ext, sarı vurgu, mavi çerçeveli numaralı
  etiketler). Hikâyenin atmosferine göre küçük varyasyon serbest (ör. yıldız alanı, şifre ızgarası), animasyonluysa son
  karede başa dönsün.
- **Ses miksi:**
  - Konuşma öncelikli. Müzik (klavye müziği ailesi, `music.py` yeniden zamanlı) konuşma altında rampalı olarak −9…−12 dB
    kısılsın (sidechain zarfı; atak 80 ms, bırakma 250 ms).
  - Efektler eski kuralla: sabit perdeli sinüs, 50–700 Hz, atak ≥ 5 ms. Riser, whoosh, süpürme, ding, metal çarpma ve
    gerçek gürültü yok. İlk 2 sn'de efekt yok, yalnız ses ve müzik.
  - Render öncesi `mix.py` ile ölç. Final iki geçişli loudnorm −14 LUFS, tepe ≤ −1,5 dBTP.
  - Konuşma olduğu için LRA ≤ 7 LU yeterli. Anlık tepe ≤ medyan + ~5 dB, müzik/efekt kaynaklı sıçrama olmasın.

## 6. Kalite kontrol (final MP4'ün kendisinden)
1 fps sheet, kritik sahneler büyük boy, ilk/son kare PSNR, ffprobe, ebur128 (I, LRA, saniye saniye M), showspectrumpic.
Ek olarak:
- **Anlaşılırlık:** final MP4'ün sesini faster-whisper ile çevir. Senaryoya göre WER ≤ %5 olmalı (müzik konuşmayı
  bastırıyor mu?).
- **Senkron:** altyazı kelime vurgusu ile ses arasındaki kayma ≤ 2 kare (5 rastgele kelimede ölç).
- **Bilgi:** her sayı/iddia kaynaklı.
- **Ekran:** etiket/altyazı çakışması yok, güvenli alana uyuluyor, Türkçe karakterler doğru.

## 7. Bitirirken
- README.md (komutlar + kurgu tablosu + kaynaklar), PLAN.md (konsept puan tablosu, seçilen hikâye, farklılaşma), script.json,
  caption.txt. caption.txt'de olacaklar: kanca cümlesi + soru, "Bu ses yapay zekâ ile üretilmiştir.", CC BY atıfları,
  12–16 hashtag (#whatsinside #animation #ai #fyp #foryou #viral #howitworks #3danimation #satisfying #keşfet #içindenevar
  + konuya özel 3–5 etiket, ör. #tarih #hikaye #storytime).
- ~/VideoGuide.md: §13'e bölüm 8 satırını ekle, ayrıca yeni bir "§14 Hikâye + seslendirme hattı" bölümü yaz (TTS kurulumu,
  seed seçimi, kelime zamanları, sidechain, altyazı stili, dersler). Hafızayı kısa güncelle.
- Sonucu SendUserFile ile gönder.
- **YAYIN:** önce onayımı iste. Onay gelince `python3 ~/tiktok-poster/privacy_check.py` ile ÖLÇ. Çıkış 0 (gizli) ise
  `post.py VIDEO "$(cat caption.txt)" --privacy SELF_ONLY`; 10 (açık) ise bana bildir, gerekirse `--draft`. Sonra herkese
  açma adımlarını söyle. Yayından sonra public/frames'i silmeyi öner (disk dar, ~2,6 GB boş; PNG kareler 50 sn'de ~2 GB
  tutabilir → önce yer aç ya da render'ı aralıklara böl).
- Final rapor Türkçe, kısa: video yolu, kurgu tablosu, neyi farklı yaptın, kalan sınırlar.
