# Klavyenin içinde ne var? (bölüm 2)

Kalem pilotuyla aynı hat: Blender bpy scripti (3D + `anchors.json`) → Remotion (yazı, etiket, SFX, müzik) → MP4.

```bash
cd episodes/klavye
# 1) sahneyi kur (+ ön izleme kareleri; --frames 1,150,... ile seçilebilir)
blender-gpu -b --factory-startup -P blender/scene.py -- --preview
cp blender/out/anchors.json remotion/src/anchors.json
# yalnızca çapaları yeniden üret (.blend'e dokunmaz):  ... -P blender/scene.py -- --anchors-only

# 2) müzik (stdlib sentez, kurguya senkron) ve tam render (840 kare, ~4 sn/kare)
python3 audio/music.py remotion/public/sfx/music.wav
blender-gpu -b blender/out/klavye.blend -o "$PWD/remotion/public/frames/####" -F PNG -a

# 3) Remotion → MP4, ardından TikTok için ses seviyesi (-14 LUFS)
cd remotion && npx remotion render KlavyeIcinde out/klavye-raw.mp4 --codec=h264 --crf=18
ffmpeg -i out/klavye-raw.mp4 -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 192k out/klavye.mp4
```

- Hızlı taslak: `.blend`'i `resolution_percentage=25`, 4 örnek, raytracing kapalı render et (~2,5 dk), kareleri
  `public/frames`'e **kopyala** (Remotion sembolik bağları sunmaz), `npx remotion render ... --scale=0.5`.
- Sesler: `thock_*.wav`, `enter_thock.wav`, `music.wav` kendi sentezimiz; `*.ogg` Kenney (CC0, LICENSE-kenney.txt);
  whoosh/whip/ding remotion.media.
- Kurgu (30 fps): 0–2,5 sn tuşlarla yazılan kanca → patlama → 6 katman etiketi → Enter switch'ine dalış →
  switch patlatma + 6 parça etiketi → kontak mekanizması (3 basış, "ekran: HEY") → tuş yağmuru → CTA; son kare = ilk kare.
