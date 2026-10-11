# PS5 kolunun içinde ne var? (bölüm 4)

Hat aynı (Blender bpy → `anchors.json` → Remotion → iki geçişli loudnorm), anlatım dili farklı:
**yaygın inanış kancası + "Aslında yok 😉" rozeti, X-ray tarama ile yerinde iç görünüm, kesit bıçağı, karşılaştırmalı
mekanizma (dönen motor ✕ / bobin + mıknatıs ✓), kilitli sır rozeti → tetik motoru twist'i, ⏪ geri sarma finali**.
Tema ve müzik klavye/CPU ailesinde (lacivert stüdyo, artı ızgara, 90 BPM chill). Ayrıntı: `PLAN.md`.
Dış kabuk: Sketchfab **"Playstation 5 Dualsense" — AHarmlessPotato, CC BY 4.0**
(`blender/asset_dl/dualsense.glb`, `blender/dualsense_asset.py` ile içe alınır; atıf caption.txt'de). Marka temizliği:
PS tuşundaki logo geometrisi silinip kanal logolu kapakla örtülür, dokudaki ✕○△□ ve "SONY" boyanır.
Dokunmatik panelde kanal reklamı: "WHAT'S INSIDE" + @whatsinit.lab (shrinkwrap ile yüzeye oturan baskı).
İndirme: Sketchfab API token'ı `~/SketchfabToken.md`.

```bash
cd episodes/ps5-kol
# 1) sahne + çapalar (+ ön izleme; --frames 1,450 ; --draft = tüm animasyon %25 ~2,5 dk ; --anchors-only)
blender-gpu -b --factory-startup -P blender/scene.py -- --preview
cp blender/out/anchors.json remotion/src/anchors.json
# kamera açısı varyantları: F=kare V="tx,ty,tz,H,elev,azim,roll;..." → blender/out/ct/
F=1 V="0.9,-0.8,2.2,23,50,26,-11" blender-gpu -b --factory-startup -P blender/scene.py -- --camtest

# 2) ses: müzik + efektler (stdlib sentez, gürültüsüz; thrum.wav aktüatör hareketinden üretilir → anchors.json gerekir)
python3 audio/music.py remotion/public/sfx/music.wav
python3 audio/sfx.py blender/out/anchors.json remotion/public/sfx

# 3) tam render (900 kare, ~1,2 sn/kare ≈ 18 dk) doğrudan Remotion'a
blender-gpu -b blender/out/ps5-kol.blend -o "$PWD/remotion/public/frames/####" -F PNG -a

# 4) Remotion → MP4 → iki geçişli loudnorm (-14 LUFS, VideoGuide §8)
cd remotion && npx remotion render KolIcinde out/raw.mp4 --codec=h264 --crf=18
```

## Kurgu (30 fps, 900 kare = 30 sn, 90 BPM → 1 vuruş = 20 kare)

| Kare | Vuruş | Görüntü | Ekran |
|---|---|---|---|
| 0–50 | Kanca: yaygın inanış | Dutch açı, kol titrer (iki tutamaktan titreşim halkaları, "vrrrr") | "Herkes bu kolun içinde dönen bir MOTOR var sanır… 🤫" |
| 50–80 | Rozet | Titreşim donar, 0,2 sn sessizlik → yumuşak darbe | sarı **"Aslında yok 😉"** rozeti zıplar, MOTOR üstü çizilir; "🔒 Sonda: tetiğin sırrı" köşeye yapışır |
| 83–146 | X-ray tarama | Parlayan tarama çizgisi kabuğu geçer, geçtiği yer hayalete döner; kamera geri çekilir | "X-RAY %0 → ✓ tamam" |
| 158–330 | Seviye 1 (yerinde, DualSense özellikleri) | İç parçalar, hafif dönüş; hareket sensörü ve aktüatörler parlar | 1 Dokunmatik panel · 2 Işık çubuğu · 3 Hareket sensörü (6 eksen) · 4 Mikrofon + hoparlör · 5 Pil (1560 mAh) · 6 Tetik motoru (🔒 sonra) · 7 Titreşim aktüatörü ×2 |
| 330–370 | Dalış | Aktüatör tutamaktan çıkıp kameraya döner, makro + DOF | "Titreşimi bu yapıyor. Motor değilse ne? 👇" |
| 382–418 | Kesit bıçağı | Işık bıçağı boydan geçer, ön yarı (kabuk + bobin) ayrılır | parıltı + kıvılcım, camgöbeği flaş |
| 422–482 | Seviye 2 | Kesit: bobin, N/S mıknatıs, ağırlıklar, yaylar | 8 Bobin · 9 Mıknatıs · 10 Ağırlık · 11 Yaylar |
| 485–615 | Mekanizma | Mıknatıs ileri-geri (yavaş çekim → hızlı → "yağmur damlası" darbeleri), bobin akım yönüne göre turuncu/mavi | +/− akım, itme/çekme oku, canlı titreşim sinyali; "Buna haptik geri bildirim denir"; "eski kol: hep aynı vrrr ✕ / Haptik: her his ayrı ✓" |
| 617–655 | Dönüş | Kabuk kapanır, aktüatör tutamağa döner, kamera sağ tetiğe kayar | — |
| 655–760 | Twist: uyarlanabilir tetik | Modelin kendi R2 tetiği: serbest basış → motor + sonsuz dişli döner, direnç kolu tetiğin önüne girer → basış durur, geri iter | 🔓 "Tetiğin sırrı: içinde gerçek bir motor var! (adı: uyarlanabilir tetik)" 12 Elektrik motoru · 13 Sonsuz dişli · 14 Direnç kolu, DİRENÇ oku |
| 765–818 | ⏪ Geri sarma | Tarama geri gider, kabuk aşağıdan yukarı kapanır, kamera kancaya döner | "Haptik titreşim = bobin + mıknatıs 🔊 · Uyarlanabilir tetik = motor ⚙️" |
| 822–899 | CTA + döngü | Kanca kadrajı (son kare = ilk kare), panel baskısı parlar | "Sıradaki nesne ne olsun? Yorumlara yaz ↓" |

Sesler: hepsi kendi sentezimiz (`audio/music.py`, `audio/sfx.py`), sabit perdeli sinüs, 50–700 Hz efekt bandı;
**riser/whoosh/süpürme ve ani tiz darbe yok** (kullanıcı kuralı). Final: -14,1 LUFS, LRA 3,8 LU, anlık tepe medyanın ~4 dB üstünde.
