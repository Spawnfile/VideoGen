# Asma kilidin içinde ne var? — "Bu anahtar neden açıyor da yanlışı açmıyor?" (bölüm 6)

Hat aynı (Blender bpy → `anchors.json` → Remotion → iki geçişli loudnorm), anlatım dili yeni: **POV kanca** (izleyicinin
eli anahtarı deliğe yaklaştırır), **kapak menteşeden açılır** (kesitli asma kilit), **anahtar deliğinden içeri dalış →
ölçek şoku** (ikinci dünyada pimler dev sütunlar), **"ya bu parça olmasaydı?"** (yanlış anahtar ✕ / doğru anahtar ✓) ve
**"pimleri say" geri sayımı** (4/5 ✕ → 5/5 ✓). Tema/müzik saat–ps5 ailesinde. Farklılaşma planı: `PLAN.md`.

3D modeller (Sketchfab, hepsi **CC BY 4.0**; `blender/asset_dl/`, `blender/lock_assets.py` ile içe alınır, atıf caption.txt'de):
- "Small Padlock and Key" — **Miljan Bojovic** (uid 91827ac5244a48f0b22fded4b2541188) → dış asma kilit + anahtar.
  Gövdedeki "X-KEY" ovali renk + ORM dokusundan, anahtar başındaki yazı ORM'den boyanır; ön yüze kazınmış
  **WHAT'S INSIDE + @whatsinit.lab** (Shrinkwrap ile kavisli yüzeye oturur, CTA'da parlar). Ön plaka (dış + iç katman) ayrılıp
  menteşeye bağlanır; silindiri saran iç tüp silinir.
- "3December 2020 - Cylinder Lock" — **Jack Kelly** (d18aedad20a24dc294121229fa5a5892) → kahraman pimli silindir, iki kopya:
  asma kilidin içinde (0,1 cm/mm, ekseni dikey) ve dünya 2'de dev kesit (1 birim = 1 mm, plug `bisect` ile önden kesilir).
  **Modeldeki maymuncuk aracı sahneden silinir** (güvenlik: kilit açma tekniği öğretilmez). Üst (sürücü) pimler, kesme çizgisi,
  anahtarlar, kam ve bilyeler kodla.
- "First Person hands rigged" — **David Fischer** (547a45535f0c4fe787948f7a7a6a88db) → POV sağ el (sol kol vertex grubundan
  silinir, parmaklar kemiklerle çimdik pozuna; konum deforme mesh'in vertex grubu ağırlık merkezlerinden hesaplanır).

Pim yükseklikleri **anahtar profilinden kare kare hesaplanır** (`key_profile` + `pin_bottom`): anahtar kaydıkça her pim
diş sırtına oturur, tam takılınca doğru anahtarda 5 ayrım kesme çizgisine (z = 14 mm) gelir; yanlış anahtarda 3. çentik
1,6 mm derin → üst pim çizgiyi keser. Aynı veri `anchors.json` → `pinB` ile pim "tık" sesini üretir.

```bash
cd episodes/asma-kilit
# 1) sahne + çapalar (+ ön izleme) — ~15 sn + kare başı ~3 sn
blender-gpu -b --factory-startup -P blender/scene.py -- --preview --frames 1,150,300,615,840
blender-gpu -b --factory-startup -P blender/scene.py -- --draft          # tüm animasyon %25 (~3 dk) → blender/out/draft
cp blender/out/anchors.json remotion/src/anchors.json
# kamera varyantları: CAM=k1|k2 F=kare V="tx,ty,tz,H,elev,azim[,lens];..." → blender/out/ct/
CAM=k2 F=400 V="499,0,9.5,46,6,0;499,0,9.5,40,10,8" blender-gpu -b --factory-startup -P blender/scene.py -- --camtest

# 2) ses (stdlib sentez, gürültüsüz; pins.wav anchors.json'dan)
python3 audio/music.py remotion/public/sfx/music.wav
python3 audio/sfx.py blender/out/anchors.json remotion/public/sfx

# 3) tam render (tek geçiş; kamera marker'larla dünya 1 ↔ 2) ~1,5 sn/kare ≈ 25 dk
blender-gpu -b blender/out/kilit.blend -o "$PWD/remotion/public/frames/####" -F PNG -a

# 4) Remotion → MP4 → iki geçişli loudnorm (-14 LUFS, VideoGuide §8)
cd remotion && npx remotion render KilitIcinde out/raw.mp4 --codec=h264 --crf=18
```

## Kurgu (30 fps, 990 kare = 33 sn; Remotion kareleri)

| Kare | Vuruş | Görüntü | Ekran |
|---|---|---|---|
| 0–64 | Kanca (POV) | Alttan bakış: izleyicinin eli anahtarı anahtar deliğine yaklaştırır | "Herkes anahtarın deliğe **UYDUĞU** için açtığını sanır… 🤫" → "Aslında **5 minik pim** karar verir 😉" |
| 66–104 | Kapak | El geri çekilir, ön yüz kapı gibi menteşeden açılır | rozet sol üste yapışır: "🔍 pimleri say: 0/5" |
| 108–214 | 1. seviye | Kesitli asma kilit | 1 Gövde · 2 U kol · 3 Silindir · 4 Kilitleme bilyesi |
| 236–290 | Dalış | Kamera kilidin altına iner, anahtar deliğine girer → zoom-punch | "Peki silindir doğru anahtarı nasıl tanıyor? 🤔" |
| 291–372 | Ölçek şoku | Dünya 2: anahtar yolundan (14 mm geniş açı) yukarı, dev pim sütunları → yana çekilir | "🔍 anahtar deliğinin içi", "Gerçekte bir pim ≈ 3 mm 🤏" |
| 372–512 | 2. seviye | Kesit yan görünüm, anahtarsız: üst pimler çizgiyi keser | 5 Silindir · 6 Anahtar pimi · 7 Üst pim · 8 Pim yayı · 9 Kesme çizgisi; "Üst pimler çizgiyi kesiyor → kilitli 🔒" |
| 514–654 | Yanlış anahtar | Gri anahtar girer, pimler zıplar; tarama 1,2 ✓ 3 ✕ 4,5 ✓; silindir titrer, dönmez; çizgi kırmızı | "Ya yanlış anahtar olsaydı? deliğe girer ama…" → "Tek bir pim çizgide kalırsa ✕ silindir dönmez"; sayaç 4/5 ✕ |
| 658–776 | Doğru anahtar | Altın anahtar girer; tarama pim pim yeşil, çizgi yeşil; silindir döner | "Şimdi doğru anahtar 🔑" → "5/5 hizalandı ✓ silindir döner!"; sayaç 1/5…5/5 ✓ |
| 777–836 | Açılış | Asma kilide ters zoom: el anahtarı çevirir, kam döner, bilyeler çekilir, U kol fırlar | "Silindir dönünce kam döner → bilyeler çekilir → U kol açılır 🔓" |
| 836–940 | Vay bilgisi | U kol kapanır, kapak kapanır | "5 pim × 10 derinlik = **100.000** farklı anahtar 🤯 (teorik)" → "Fikir **binlerce yıllık** 😉 Antik Mısır ahşap pimli kilidi → Yale, 1860'lar" |
| 934–989 | CTA + döngü | El anahtarı geri çeker → kanca kadrajı (son kare = ilk kare), kazıma parlar | "Sıradaki nesne ne olsun? Yorumlara yaz 👇" |

Sesler: hepsi kendi sentezimiz (`audio/music.py` = saat/ps5 90 BPM chill müziği yeniden zamanlanmış; `audio/sfx.py`),
sabit perdeli sinüs, 50–700 Hz: pim tıkı 300 Hz, ✓ 587 Hz, ✕ 196/185 Hz, "klik" 440 + 220 Hz, açılış 523 → 659 Hz,
geçiş 70 Hz. **Riser/whoosh/süpürme ve ani tiz darbe yok.** İlk 5 sn yalnız müzik.

## Kaynaklar (doğrulanan bilgiler)
- Pimli silindir ilkesi (anahtar pimi + üst pim + yay, kesme çizgisi) — en.wikipedia.org/wiki/Pin_tumbler_lock
- Linus Yale Sr. 1848; Linus Yale Jr. US 31,278 (1861) ve US 48,475 (1865, düz anahtarlı silindir) —
  patents.google.com/patent/US31278 · lockwiki.com/index.php/Linus_Yale_Jr ; Mısır kökeni (~MÖ 2000 olabilir) —
  en.wikipedia.org/wiki/Pin_tumbler_lock · britannica.com/technology/lock-security (yaş tartışmalı → "binlerce yıllık")
- 10 derinlik (Schlage 0–9, MACS 7) → teorik 10⁵ = 100.000 — kc.allegion.com/kb/article/what-is-schlage-combinating-rule-15 ;
  Kwikset 7 derinlik — clksupplies.com/products/kwikset-kw1-space-depth-keys
- Asma kilitte bilye/mandal + kam — firgelliauto.com/blogs/mechanisms/padlock
- Pim çapı 0,115" ≈ 2,9 mm — clksupplies.com/a/answers/7279633/What-is-the-diameter-of-the-pins-included
