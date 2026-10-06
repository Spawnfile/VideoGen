#!/usr/bin/env bash
# Regenerates tests/fixtures/scene/kalem/ from the example pen. After a vg_blender change: run, review the diff, commit.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/tests/fixtures/scene/kalem"
FX="$ROOT/tests/fixtures/artifacts"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
(cd "$ROOT" && node --input-type=module -e "import { CHANNEL_STYLES } from './packages/shared/src/styles.ts'; process.stdout.write(JSON.stringify(CHANNEL_STYLES.gece_mavisi))") > "$TMP/style.json"
B=("$ROOT/bin/blender-gpu" -b --factory-startup --python-exit-code 1)
"${B[@]}" -P "$ROOT/python/vg_blender/build_cli.py" -- product --spec "$FX/scene-kalem.json" \
  --product "$ROOT/python/vg_blender/examples/kalem/product.py" --out-blend "$TMP/product.blend" --report "$TMP/product.json"
"${B[@]}" --disable-autoexec -P "$ROOT/python/vg_blender/build_cli.py" -- scene --spec "$FX/scene-kalem.json" \
  --storyboard "$FX/storyboard-kalem.json" --style "$TMP/style.json" --blend "$TMP/product.blend" --out "$TMP/out" --report "$TMP/build.json"
node -e "const r = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); if (!r.ok) { console.error(r.errors.join('\n')); process.exit(1); }" "$TMP/build.json"
mkdir -p "$OUT"
cp "$TMP/out/scene.glb" "$TMP/out/anchors.json" "$TMP/out/events.json" "$TMP/out/camera_track.json" "$TMP/build.json" "$OUT/"
echo "fixtures: $OUT"
