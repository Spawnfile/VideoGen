# Kablosuz kulaklığın içinde ne var? — "Bu minicik şeyin içine bunlar nasıl sığdı?" (bölüm 7)

Hat aynı (Blender bpy → `anchors.json` → Remotion → iki geçişli loudnorm). Anlatım iskeleti **klavye** (bölüm 2, ana
referans): kullanım hareketiyle kanca → dalga dalga patlatma + numaralı etiketler → kahraman parçaya (hoparlör sürücüsü) dalış
→ kendi parçalarına ayrılma → mekanizma → dönüş + parça yağmuru → CTA. Yeni dokunuş: **"sesi görmek"** (diyaframdan çıkan
ses halkaları; gürültü + ters dalga = düz çizgi). Farklılaşma planı ve doğrulanan bilgiler: `PLAN.md`.

3D model (Sketchfab, **CC BY 4.0**; `blender/asset_dl/jed.glb`, `blender/bud_assets.py` ile içe alınır, atıf caption.txt'de):
- "AirPods Pro" — **Jed Falcone** (uid 3f84ddc3d87a4ec0a5e5f379abfecd9c, 161K yüz) → şarj kutusu + iki kulaklık. Modelde
  doku/logo yok (marka temizliği gerekmedi). Orijinal C4D animasyonu (kapak + kulaklıkların kalkışı) silinir; kapak menteşe
  boşuna bağlanıp kendi zamanlamamızla, kulaklık kendi quaternion yolumuzla keyframe'lenir. Kutunun ön yüzüne **WHAT'S INSIDE +
  @whatsinit.lab** baskısı (Shrinkwrap, CTA'da parlar). Yedek model (JY_JY_, 4478ddd…) indirildi, kullanılmadı.
- Kahraman (sağ) kulaklık yerel çerçevede: orijin baş merkezi, +Z kulak ucu ekseni, +X sapa doğru (`bud_frame`). Kabuk iki
  düzlemle `bisect` edilir (iç kabuk = kulak ucu tarafı, dış kabuk + sap). İç parçalar kodla, gerçek yerleşime göre: sürücü
  kulak ucunun hemen arkasında (r 0,4 cm, kesitli 270° — `spin_solid`), iç mikrofon uç tarafında, **düğme pil başta**
  (iFixit), çip kartı (SiP) pilin altında, sapta anten + basınç sensörü + sap kartı + alt mikrofon (ölçülen sap merkez
  çizgisi boyunca), şarj kontakları modelden.

```bash
cd episodes/kulaklik
# 1) sahne + çapalar (+ ön izleme) — ~10 sn + kare başı ~1 sn
blender-gpu -b --factory-startup -P blender/scene.py -- --preview --frames 1,150,450,620,750,860
blender-gpu -b --factory-startup -P blender/scene.py -- --draft          # tüm animasyon %25 (~2,5 dk) → blender/out/draft
blender-gpu -b --factory-startup -P blender/scene.py -- --anchors-only   # yalnız çapalar (.blend'e dokunmaz)
cp blender/out/anchors.json remotion/src/anchors.json
# kamera varyantları: F=kare V="tx,ty,tz,H,elev,azim;..." → blender/out/ct/
F=200 V="0.3,-0.6,4,10.6,18,-28;0.3,-0.6,4,10.6,22,-18" blender-gpu -b --factory-startup -P blender/scene.py -- --camtest

# 2) ses (stdlib sentez; drive.wav anchors.json'daki diyafram hareketinden) + render öncesi ölçüm miksi
python3 audio/music.py remotion/public/sfx/music.wav
python3 audio/sfx.py blender/out/anchors.json remotion/public/sfx
python3 audio/mix.py remotion/public/sfx /tmp/mix.wav && ffmpeg -i /tmp/mix.wav -af ebur128 -f null -

# 3) tam render ~1–1,5 sn/kare ≈ 20 dk
blender-gpu -b blender/out/kulaklik.blend -o "$PWD/remotion/public/frames/####" -F PNG -a

# 4) Remotion → MP4 → iki geçişli loudnorm (-14 LUFS, VideoGuide §8)
cd remotion && npx remotion render KulaklikIcinde out/raw.mp4 --codec=h264 --crf=18
```

## Kurgu (30 fps, 900 kare = 30 sn; Remotion kareleri)

| Kare | Vuruş | Görüntü | Ekran |
|---|---|---|---|
| 0–80 | Kanca | Kapalı kutu → kapak açılır (3–15), sağ kulaklık mıknatıstan kalkıp kameraya döner | "Herkes içinde sadece bir hoparlör var sanır… 🤫" → "Aslında içinde 3 mikrofon ve bir çip var 😉" |
| 80–142 | Patlama | Kulaklık sunum pozuna (kulak ucu yukarı) döner, 7 katman dalga gecikmeli ayrılır, kutu aşağı çekilir | — (ilk 5 sn yalnız müzik) |
| 152–352 | 1. seviye | Patlatılmış yığın, yavaş tur | 1 Kulak ucu · 2 Hoparlör sürücüsü · 3 İç mikrofon · 4 Pil · 5 Çip · 6 Dış mikrofon · 7 Anten · 8 Basınç sensörü · 9 Şarj kontakları (geçici, ≤3 aynı anda) |
| 346–420 | Köprü + dalış | Diğer katmanlar yukarı/aşağı çekilir, kamera sürücüye | "Sesi yapan parça: hoparlör sürücüsü. İçine bakalım 👇" |
| 424–576 | 2. seviye | Kesitli sürücü 5 parçaya ayrılır | A Izgara · B Diyafram · C Ses bobini · D Mıknatıs · E Çerçeve |
| 578–664 | Mekanizma | Sürücü birleşir; bobin + diyafram ileri-geri (3 → 6 Hz), bobin parlar, **ses halkaları** | "⚡ Elektrik sinyali bobini mıknatısın içinde ileri-geri iter… diyafram havayı iter → SES 🔊" + "Kulağımız saniyede 20 → 20.000 titreşimi duyar" |
| 664–800 | Gürültü engelleme ("aha") | Katmanlar geri gelir, kulaklık dik (kulak ucu sağa), X-ray; dış mikrofon → çip → sürücü parlar | Turuncu gürültü dalgası → dış mikrofon; mavi ters dalga; kulak tarafı düz çizgi; panel "Gürültü + Ters dalga = Toplam 0 🤫"; müzik rampayla kısılır |
| 800–850 | Dönüş + yağmur | Kulaklık kutuya uçar, mıknatısla oturur (838); kulak ucu + düğme pil yağmuru | "Gürültü engelleme sinyali saniyede 200 kez yeniden ayarlanır (1. nesil AirPods Pro tipi)" + ★ Şarj kutusu |
| 846–899 | CTA + döngü | Kapak kapanır, baskı parlar, kanca kadrajı (son kare = ilk kare) | "Sıradaki nesne ne olsun? Yorumlara yaz 👇" |

Sesler: hepsi kendi sentezimiz. `audio/music.py` = **klavye müziği** (120 BPM Am–F–C–G) yeniden zamanlanmış (riser yok,
hat/clap 4 kutuplu alçak geçirgen, bas/pad zarfında klik giderildi, ANC'de 766–796 rampalı kısma). `audio/sfx.py`: pop 523 Hz
(etiket), thump 70 Hz (dalış), drive 196 Hz (diyaframın kare kare hızından), seat 330 Hz (mıknatıs), lid 440 Hz (kapak
"pıt"), tap 294 Hz (yağmur), cta 523→659 Hz. İlk 5 sn efekt yok; gerçek gürültü sesi yok.

## Kaynaklar (doğrulama)
- Apple, AirPods Pro duyurusu (2019; dış/iç mikrofon, ters sinyal, "200 times per second", force sensor, vent system) —
  alıntı: https://audioxpress.com/news/apple-reveals-new-airpods-pro-with-active-noise-cancellation
- Apple AirPods Pro teknik özellikler (2 beamforming + 1 içe bakan mikrofon, sürücü, basınç dengeleme): https://www.apple.com/airpods-pro/specs/
- Apple 2022 AirPods Pro 2 duyurusu (6 sa / 30 sa, 2× ANC): https://www.apple.com/newsroom/2022/09/apple-announces-the-next-generation-of-airpods-pro/
- iFixit AirPods Pro Teardown (düğme pil başta, 0,16 Wh): https://www.ifixit.com/Teardown/AirPods+Pro+Teardown/127551
- İşitme aralığı ~20 Hz–20 kHz: https://hypertextbook.com/facts/2003/ChrisDAmbrose.shtml
