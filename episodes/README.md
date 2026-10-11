# Episodes (reference sources)

Sources of the nine episodes made by hand before the pipeline adopted the YAKLASIM approach (`docs/approach/YAKLASIM.md`).
Rubik (`episodes/rubik`) is the reference implementation of the approach; the others are earlier, longer Turkish episodes.

- VideoGen does not build or run this code; it is outside `tsconfig.json` and vitest.
- Rendered finals, captions and the Sketchfab models (`*.glb`, third-party licences, not redistributed) live in
  `~/videogen-data/episodes/<slug>/` (`final.mp4`, `caption.txt`, `assets/`). Frames, `.blend` files, `anchors.json` and `node_modules`
  are not kept: each episode's README regenerates them (Blender first, then Remotion).
- The finals reach the Library through `node bin/import-episodes.mjs` (manifest: `episodes/manifest.json`).
