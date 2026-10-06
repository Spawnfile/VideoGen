# M4c plan öncesi sondaj (2026-10-06)

Kurulum: `npm install` (bu dizinde; workspace dışı), sonra `mkdir -p node_modules/@vg && ln -sfn ../../lib node_modules/@vg/fake`.

| # | Soru | Komut | Sonuç |
|---|---|---|---|
| P7 | `@remotion/player` 4.0.533 + `@remotion/three` + r3f 9.8.1 + three 0.186.1, Vite 8.3.2 (rolldown) ile derleniyor mu? | `npx vite build` | Derlendi, 475 ms. Tek parça 1.454,97 kB (gzip 410 kB): Taslak sekmesi `React.lazy` ile ayrı parçaya alınmalı (spec §13.4 ilk yükleme < 2 sn) |
| P8 | `@remotion/bundler` symlink'li workspace paketinin TS kaynağını (`exports` → `.ts`, `.ts` uzantılı göreli import) derliyor mu? | `node bundle.mjs` | Derledi: ilk 6,6 sn, ikinci 1,3 sn (webpack önbelleği); `lib/src/util.ts` kodu bundle'da. esbuild install script'i engelli olduğu hâlde çalıştı (platform paketi) |

`node_modules` silindi; betikler kanıt olarak kalır.
