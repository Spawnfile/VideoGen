#!/usr/bin/env bash
# K19: renders the example pen in every channel style (frame 0 and the open explode) into apps/web/public/k19/<id>.png.
# Real Blender on the NVIDIA GPU; ~10 s per style. Rerun after a style or vg_blender change, review the images, commit them.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FX="$ROOT/tests/fixtures/artifacts"
OUT="$ROOT/apps/web/public/k19"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
B=("$ROOT/bin/blender-gpu" -b --factory-startup --disable-autoexec --python-exit-code 1)
"${B[@]}" -P "$ROOT/python/vg_blender/build_cli.py" -- product --spec "$FX/scene-kalem.json" \
  --product "$ROOT/python/vg_blender/examples/kalem/product.py" --out-blend "$TMP/product.blend" --report "$TMP/product.json" >/dev/null
for id in $(cd "$ROOT" && node --input-type=module -e "import { CHANNEL_STYLE_IDS } from './packages/shared/src/styles.ts'; console.log(CHANNEL_STYLE_IDS.join(' '))"); do
  (cd "$ROOT" && node --input-type=module -e "import { CHANNEL_STYLES } from './packages/shared/src/styles.ts'; const s = CHANNEL_STYLES['$id']; process.stdout.write(JSON.stringify(s))") > "$TMP/$id.style.json"
  # The fixture scene with this style's lighting; the style colours reach Blender only through style.json (plan B12).
  node -e "const f = require('fs'); const s = JSON.parse(f.readFileSync(process.argv[1])); const st = JSON.parse(f.readFileSync(process.argv[2])); s.style_id = st.id; s.lighting_preset = st.lighting; f.writeFileSync(process.argv[3], JSON.stringify(s));" "$FX/scene-kalem.json" "$TMP/$id.style.json" "$TMP/$id.scene.json"
  "${B[@]}" -P "$ROOT/python/vg_blender/build_cli.py" -- scene --spec "$TMP/$id.scene.json" --storyboard "$FX/storyboard-kalem.json" \
    --style "$TMP/$id.style.json" --blend "$TMP/product.blend" --out "$TMP/$id" --report "$TMP/$id.build.json" >/dev/null
  "${B[@]}" -P "$ROOT/python/vg_blender/render_cli.py" -- --blend "$TMP/$id/scene.blend" --frames 0,240 --out "$TMP/$id/stills" --scale 50 --samples 32 >/dev/null
  # Transparent stills on the style's exact backdrop (the same composite as preview sheets and the Remotion layer).
  BG=$(node -e "const s = JSON.parse(require('fs').readFileSync(process.argv[1])); const h = (c) => '0x' + c.slice(1); console.log('gradients=s=540x960:c0=' + h(s.background.top) + ':c1=' + h(s.background.bottom) + ':x0=0:y0=0:x1=0:y1=960:n=2:speed=0')" "$TMP/$id.style.json")
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "$BG" -i "$TMP/$id/stills/f00000.png" -i "$TMP/$id/stills/f00240.png" \
    -filter_complex "[0:v]split[g0][g1];[g0][1:v]overlay=shortest=1:format=rgb,scale=360:640[a];[g1][2:v]overlay=shortest=1:format=rgb,scale=360:640[b];[a][b]hstack=inputs=2" -frames:v 1 "$OUT/$id.png"
  echo "k19: $OUT/$id.png"
done
