# Saatin içinde ne var? — İsviçre mi Japon mu? (bölüm 5)

Hat aynı (Blender bpy → `anchors.json` → Remotion → iki geçişli loudnorm), anlatım dili yeni:
**VS bölünmüş ekran** (üst panel İsviçre eşapmanı, alt panel Seiko Magic Lever), **kadrana fly-through**, yavaş çekimde
**"tik"in anatomisi → gerçek hız (saniyede 8 tik)**, **"bileğini salla"** rotor oku, **skor tabelası**, **🔒 ortak sır** twist'i
(ikisinin kalbi aynı çatallı eşapman; atası İngiliz Thomas Mudge). Tema/müzik ps5-kol ailesinde. Ayrıntı: `PLAN.md`.

3D modeller (Sketchfab, hepsi **CC BY 4.0**; `blender/asset_dl/`, `blender/watch_assets.py` ile içe alınır, atıf caption.txt'de):
- "FREDERIQUE CONSTANT AUTOMATIC MOVEMENT - FC-0050" — **Not.3D** (uid e90a10bbf31e40e79aa4ae6299332348) → ortak kasa.
  Kadrandaki marka yazısı ve "SWISS MADE", arka kapak halkası dokudan boyanır; yerine kadrana **WHAT'S INSIDE + @whatsinit.lab** baskısı.
- "Swiss lever escapement mechanism" — **C. Yamahata** (96cf82a6bdcd4ddda7635fbd33d0e016) → üst panel + twist'te alt panel kopyası.
- "Seiko Magic Lever" — **C. Yamahata** (e9fd9159debc4e94a295888e66de0541) → alt panel.

Animasyonlu GLB'ler örneklenip (`sample_anim`) kendi zaman eğrimizle yeniden keyframe'lenir (`retime`): kaynak döngü
tekrarlanır, eşapman çarkı/cırcır gibi tek eksende dönen parçaların döngü başına dönüşü birikir → yavaş çekim ↔ gerçek hız serbest.
Tik anları eşapman çarkının açısal hız tepelerinden bulunur ve `anchors.json` → `ticksTop/ticksBot` (ses + "tik/tak" yazıları).

```bash
cd episodes/saat
# 1) sahne + çapalar (+ ön izleme; panel kareleri üst/alt ayrı) — ~20 sn
blender-gpu -b --factory-startup -P blender/scene.py -- --preview --frames 1,150,420,800
blender/compose.sh blender/out/preview sheet.png            # üst+alt panelleri yığarak sheet
cp blender/out/anchors.json remotion/src/anchors.json
# kamera varyantları: CAM=full|top|bot F=kare V="tx,ty,tz,boyut,elev,azim;..." → blender/out/ct/
CAM=top F=200 V="99,1,0,22,58,14;99,1,0,19,52,0" blender-gpu -b --factory-startup -P blender/scene.py -- --camtest

# 2) ses (stdlib sentez, gürültüsüz; ticks.wav/thrum.wav anchors.json'dan)
python3 audio/music.py remotion/public/sfx/music.wav
python3 audio/sfx.py blender/out/anchors.json remotion/public/sfx

# 3) render: üç geçiş (full 1080×1920 kanca+çıkış ; top/bot 1080×960 paneller), --draft = %25
for p in full top bot; do blender-gpu -b blender/out/saat.blend -P blender/render_pass.py -- $p; done

# 4) Remotion → MP4 → iki geçişli loudnorm (-14 LUFS, VideoGuide §8)
cd remotion && npx remotion render SaatIcinde out/raw.mp4 --codec=h264 --crf=18
```

## Kurgu (30 fps, 990 kare = 33 sn; Remotion kareleri)

| Kare | Vuruş | Görüntü | Ekran |
|---|---|---|---|
| 0–64 | Kanca | Saat yakın plan, sarı saniye ibresi saniyede 8 adım "süpürür", yumuşak tik-tak | "Herkes İsviçre ve Japon saatinin kalbi **BAMBAŞKA** sanır… 🤫" + **🇨🇭 İSVİÇRE VS JAPON 🇯🇵** şeridi; "🔒 Sonda: ortak sır" |
| 64–112 | Fly-through | Kamera camı ve ibreleri geçip kadrana dalar → zoom-punch + flaş | — |
| 100–118 | Bölünme | Üst panel soldan, alt panel sağdan kayar; ortada sarı çizgi + **VS** rozeti | ülke çipleri |
| 120–380 | Raunt 1 · KALP | Üst panel parlak (alt söner): İsviçre eşapmanı **yavaş çekimde** (her tikte çatalda "tik/tak"), 290–315 speed-ramp → **gerçek 4 Hz** | 1 Balans çarkı · 2 Spiral yay · 3 Çatal · 4 Eşapman çarkı; "Her salınımda çatal çarktan bir diş bırakır → tik!"; sayaç **saniyede 8 tik** → "Günde **691.200** tik 🤯" |
| 380–630 | Raunt 2 · MOTOR | Alt panel parlak: Seiko rotoru iki yöne sallanır (beyaz ok yön değiştirir), cırcır hep tek yöne (sarı ok), Magic Lever parlar | 5 Rotor · 6 Magic Lever (tek parça Y kol · 1959) · 7 Cırcır çarkı; "🤚 bileğini salla"; "→ ana yay kurulur 🔋 ≈ 41 saat" |
| 630–750 | Raunt 3 · SKOR | İki panel yarı sönük | Skor tabelası: tik/sn 8 ↔ 6 · güç rezervi ~40 ↔ ~41 sa · oto. kurma 2 değiştirme çarkı ↔ tek kol |
| 750–890 | Twist | "Peki Japon saatinin kalbi?" → flaş, alt panel de eşapmana döner: üstte 8, altta 6 tik/sn yan yana | 🔓 "İkisinin kalbi **AYNI** 😉 çatallı eşapman" → "Ve onu bir **İngiliz** icat etti 🇬🇧 Thomas Mudge, 1750'ler" |
| 890–950 | Birleşme | Paneller kapanır, kamera kadrandan geri uçar | — |
| 914–989 | CTA + döngü | Kanca kadrajı (son kare = ilk kare), kadran baskısı parlar | "Sen hangisini **seçerdin?** 🇨🇭 mi 🇯🇵 mu? Yorumlara yaz 👇" |

Sesler: hepsi kendi sentezimiz (`audio/music.py` = ps5-kol 90 BPM chill müziği yeniden zamanlanmış, `audio/sfx.py`),
sabit perdeli sinüs, 50–700 Hz; tik 680 Hz / tak 620 Hz (twist'te alt panel 600/560 Hz). **Riser/whoosh/süpürme ve ani tiz darbe yok.**

## Kaynaklar (doğrulanan bilgiler)
- ETA 2824-2: 28.800 vph, 25 taş, ~38–42 sa — wiki.grail-watch.com/index.php/ETA_2824-2 · shopb2b.eta.ch (2824-2)
- Seiko Magic Lever 1959 (Gyro Marvel) — museum.seiko.co.jp/en/seiko_history/milestone/milestone_05/ ;
  tek parça Y kol, iki mandal — reference.grail-watch.com/winding/automatic/seiko-magic-lever-winding/ ; 7S26 21.600 vph, ~41 sa
- Çatallı (club tooth) eşapman bugün yaygın; Thomas Mudge ~1756 — museum.seiko.co.jp/en/knowledge/MechanicalTimepieces06/ ·
  en.wikipedia.org/wiki/Lever_escapement
- ETA iki yönlü kurma (iki değiştirme çarkı) — watchesbysjx.com/2026/07/automatic-winding-efficiency.html
