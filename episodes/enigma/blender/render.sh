#!/bin/bash
# Tam render, disk dostu: 150 karelik parçalar PNG (geçici) → WebP (q 92, alfa) → remotion/public/frames/NNNN.webp
# Kullanım: blender/render.sh [başlangıç] [bitiş]   (proje kökünden)
set -e
cd "$(dirname "$0")/.."
S=${1:-1}; E=${2:-$(python3 -c "import json;print(json.load(open('timeline.json'))['frames'])")}
TMP=blender/out/tmp_frames
mkdir -p "$TMP" remotion/public/frames
for ((a=S; a<=E; a+=150)); do
  b=$((a+149)); [ $b -gt $E ] && b=$E
  blender-gpu -b blender/out/enigma.blend -o "$PWD/$TMP/####" -F PNG -s $a -e $b -a > blender/out/render.log 2>&1
  for f in "$TMP"/*.png; do
    n=$(basename "$f" .png)
    ffmpeg -v error -y -i "$f" -c:v libwebp -q:v 92 -compression_level 4 "remotion/public/frames/$n.webp" && rm "$f"
  done
  echo "parça $a-$b tamam $(date +%H:%M:%S)"
done
