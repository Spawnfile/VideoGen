# Rubik küpü — "Why doesn't it FALL APART?" (bölüm 9, 12,5 sn)

Plan ve öneri (FYP/Reels) tasarımı: `PLAN.md`. Tema/müzik: klavye ailesi. Mesh tamamen kodla (hazır model yok).

```bash
cd episodes/rubik
# 1) sahne + anchors.json (+ ön izleme: --preview --pct 40 --frames 1,75,130)
blender-gpu -b --factory-startup -P blender/scene.py
cp blender/out/anchors.json remotion/src/anchors.json
# 2) ses
python3 audio/music.py remotion/public/sfx/music.wav && python3 audio/sfx.py remotion/public/sfx
# 3) tam render (375 kare)
blender-gpu -b blender/out/rubik.blend -o "$PWD/remotion/public/frames/####" -F PNG -a
# 4) Remotion → MP4 → -14 LUFS
cd remotion && npx remotion render RubikIcinde out/rubik-raw.mp4 --codec=h264 --crf=18
ffmpeg -i out/rubik-raw.mp4 -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 192k out/rubik.mp4
```

Kurgu (30 fps, Blender kare no): 1–45 kanca/patlama · 46–105 iskelet x-ray (vida+yay) · 106–165 sert kesme: gizli ayak
makro · 166–244 kenetlenme + x-ray'de katman dönüşü · 245–315 karıştırma + 43 kentilyon sayacı · 316–375 patlat →
havada çözülmüş halde birleş (son kare → ilk kare "şak → patla" döngüsü).
