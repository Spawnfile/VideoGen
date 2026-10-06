# Remotion ile Etkileşimli 3D Video Kılavuzu (Three.js / R3F)

## 1. Kurulum ve skill akışı
- Önce `remotion-best-practices` skill'ini yükle → `remotion-create` ve `remotion-markup/3d.md` referanslarını oku.
- Dolu klasörde alt klasöre kur: `npx create-video@latest --yes --blank --no-tailwind <ad> && npm i`
- 3D: `npx remotion add @remotion/three` (three + @react-three/fiber gelir), `npm i -D @types/three`.
- Tüm `@remotion/*` paketleri remotion ile AYNI tam sürümde olmalı (`^` varsa kaldır).
- Studio: `npx remotion studio --no-open --port 3123` (arka planda), URL `/<CompositionId>`.

## 2. Remotion 3D kuralları
- 3D içerik `<ThreeCanvas width height>` içinde olmalı; `useFrame()` YASAK, tüm hareket `useCurrentFrame()`'den türetilir.
- Önizlemede ThreeCanvas `frameloop="always"`, render'da `never` + kare başına `advance()`; React state değişimi önizlemede anında çizilir.
- Dönen parçalar: `rotation-x={frame * hız}`. Kanat aralığına yakın kare-başı açı stroboskopik (geri dönüyor) görünür; açıyı küçük tut.
- Ortam yansıması: `PMREMGenerator.fromScene(new RoomEnvironment())` → `useMemo` ile üret, `useLayoutEffect` ile `scene.environment` ata (ilk kare render'dan önce hazır olur).
- Ağır geometrileri modül seviyesinde bir kez üret (lazy cache); kanat dizilerini `mergeGeometries` ile tek mesh yap.

## 3. Prosedürel geometri tarifleri
- Dönel gövde: `LatheGeometry` (eksen Y) → `geometry.rotateZ(-PI/2)` ile eksen X olur.
- Kesit (cutaway): lathe'e `phiStart/phiLength` ver, kesik yüzlere `ShapeGeometry` kapak koy (`rotateX(phi + PI/2)`), kırmızı kesit materyali.
- Kanat: segmentli `BoxGeometry` vertex'lerini kök→uç burulma + kamber ile deforme et, N kopya `rotateX(i*2π/N)`, birleştir.
- Additive efekt (alev, egzoz, parçacık) şeffaf canvas üzerinde: rengi sabit tut, sönümlemeyi ALFA'ya koy. `vec4(renk*a, 1.0)` siyah leke yapar → `vec4(renk, a)` kullan. Points için 4 bileşenli `color` attribute.
- Egzoz bulutu: fresnel benzeri ShaderMaterial (`|dot(normal, viewDir)|^2` × uzunlamasına solma), `depthWrite:false`.

## 4. Etkileşim (sadece önizleme)
- `useRemotionEnvironment().isRendering` true ise etkileşimi kapat, varsayılan kamera/durumu kullan → render deterministik kalır.
- Kamera: zaman çizelgesi pozu (interpolate ile keyframe: hedef, azimut, elevasyon, mesafe) + kullanıcı ofseti (yaw/pitch/zoom). Etiketler için aynı pozu ayrı bir `PerspectiveCamera` ile `project()` et → DOM overlay.
- Sürükleme: sarmalayıcı div'de pointer events + `setPointerCapture`; zoom: `addEventListener('wheel', fn, {passive:false})` + `preventDefault`.
- Patlat animasyonu duraklatılmışken de çalışmalı → `requestAnimationFrame` tween (yalnız önizlemede, render'da 0).
- Hover: R3F `onPointerOver/Out` + `stopPropagation`. Yüz binlerce üçgene raycast yavaş → parça başına görünmez düşük poligon "hit" mesh, diğer mesh'lerde `raycast = () => null`.
- Vurgu için her parçaya AYRI materyal seti ver (paylaşılan materyal = hepsi yanar). `emissiveIntensity` varsayılanı 1'dir; emissive rengi küçük ölçekli ekle, yoksa parça beyazlaşır.

## 5. Kritik tuzaklar
- Remotion Studio önizlemesinde sürükleme Studio'nun "eleman taşı" aracına gider ve KAYNAK KODA `translate` yazar! Etkileşim için ayrı Player sayfası kur ve kodu kontrol et.
- Player sayfası: `npm i @remotion/player vite` (@vitejs/plugin-react babel peer çakışması verdi; gerek yok, Vite tsx'i kendisi derler). `<Player component clickToPlay={false} doubleClickToFullscreen={false} controls loop autoPlay acknowledgeRemotionLicense />`, script: `vite player --port 5173`.
- Chrome eklentisi yoksa test: `puppeteer-core` + `/usr/bin/google-chrome --use-angle=swiftshader --enable-unsafe-swiftshader`. Swiftshader ~0.5 fps → hover testinde Player'ı Space ile duraklat, küçük viewport kullan.
- Görsel kontrol: `npx remotion still <Id> out.jpg --frame=N --gl=angle`, görüntüyü Read ile incele. Yakın plan yazı okunurluğu için sol/alt gradyan perde ekle.
- Kullanıcı açıkça istemedikçe MP4 render etme; Studio/Player önizlemesi yeterli.
