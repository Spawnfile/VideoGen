# İşlemcinin (CPU) içinde ne var? (bölüm 3)

Hat aynı (Blender bpy → `anchors.json` → Remotion → loudnorm), anlatım dili farklı: **tahmin oyunu kancası,
lazerle kesip soyma, mikro ölçeğe küçülerek dalış**; tema ve müzik klavye ailesinde (lacivert stüdyo, klavye müziği yeniden zamanlanmış). Ayrıntı: `PLAN.md`.
Kapakta (IHS) kanal reklamı: kazınmış "WHAT'S INSIDE" + logo + @whatsinit.lab (gerçek marka yok).

```bash
cd episodes/cpu
# 1) sahne + çapalar (+ ön izleme; --frames 1,450,... ; --draft = tüm animasyon %25 ~2 dk)
blender-gpu -b --factory-startup -P blender/scene.py -- --preview
cp blender/out/anchors.json remotion/src/anchors.json

# 2) ses: müzik = klavye/audio/music.py, CPU bölüm zamanlarıyla (stdlib sentez, 48 kHz) — efektler ffmpeg aevalsrc ile sinüs tabanlı üretildi
python3 audio/music.py remotion/public/sfx/music.wav

# 3) tam render (900 kare, ~1–2 sn/kare), kareleri Remotion'a KOPYALA (symlink çalışmaz)
blender-gpu -b blender/out/cpu.blend -o "$PWD/blender/out/frames/####" -F PNG -a
rm -rf remotion/public/frames && cp -r blender/out/frames remotion/public/frames

# 4) Remotion → MP4 → iki geçişli loudnorm (-14 LUFS)
cd remotion && npx remotion render CpuIcinde out/raw.mp4 --codec=h264 --crf=18
# loudnorm komutu: VideoGuide §8 → out/cpu.mp4
```

## Kurgu (30 fps, 900 kare = 30 sn, 150 BPM → 1 vuruş = 12 kare)

| Kare | Vuruş | Görüntü | Ekran |
|---|---|---|---|
| 0–84 | Kanca: tahmin oyunu | CPU, tarama çizgisi geçer, kazıma parlar | "TAHMİN ET · Bu minik çipte kaç tane ANAHTAR var?" A/B/C şıkları, "CEVAP SONDA" rozeti (köşeye yapışır) |
| 84–108 | Lazer | Macenta lazer kapağın çevresini keser | kıvılcımlar, RGB-glitch ile kanca çıkışı |
| 108–262 | Soyma (seviye 1) | Kapak kalkar → uçar, termal lehim parlayıp erir, çip ortaya çıkar | HUD etiketleri: ısı kapağı, termal lehim, silikon çip, kondansatör |
| 264–360 | Ters çevirme | CPU döner: ~1700 altın ped | "~1700 ALTIN TEMAS" |
| 336–450 | Asansör inişi | Çipe dikey dalış, çip deseni (X-ray) parlar, çekirdeğe yaklaşma | "Şimdi çipin içine küçülüyoruz", çekirdek ×8, önbellek, YAKINLAŞTIRMA ×… çubuğu |
| 450 | Zoom-punch kesme | Mikro dünyaya geçiş | camgöbeği flaş |
| 450–540 | Bakır yollar | Dalış bacasından 8 kat bakır yol arasından iniş | "15'ten fazla kat bakır yol" |
| 540–606 | Transistör (seviye 2) | FinFET: kaynak – kapı – akaç | kapı, kaynak, akaç, kanal etiketleri |
| 612–720 | Mekanizma | Kapı parlar → kanal açılır → elektronlar akar (1) / durur (0), sonra 5 GHz strobe | ÇIKIŞ 1/0, bit akışı; "Kapıya voltaj → 1 / voltaj yok → 0" (2 adımlı tek yazı), "Bunu saniyede 5 MİLYAR kez yapar" (672–744) |
| 672–744 · 746–804 | "5 milyar" + cevap + geri zoom | Bacadan yukarı → çip → CPU, lehim ve kapak geri gelir | "CEVAP: C · ≈20 MİLYAR transistör" şıklar yeniden |
| 806 | Darbe | Kapak oturur | şok dalgası, flaş, sarsıntı |
| 812–899 | CTA + döngü | Kanca kadrajı (son kare = ilk kare) | "Tahminin tuttu mu? Yorumlara yaz 👇" |

Bilgi kaynakları: `PLAN.md` (Ryzen 9 9950X ≈ 20,03 milyar transistör; Intel 4: 18 metal katman; LGA1700/AM5: 1700/1718 ped).
Sesler: `music.wav`, `laser.wav`, `punch.wav`, `scan.wav`, `heat.wav`, `blip.wav`, `pop.wav` kendi sentezimiz (gürültüsüz); `*.ogg` Kenney CC0; whoosh/whip remotion.media.
