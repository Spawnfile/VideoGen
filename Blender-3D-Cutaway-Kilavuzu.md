# Blender ile kodla 3D "içinde ne var" videosu — ajan kılavuzu
Hedef: nesnenin parçalarına ayrıldığı (patlatılmış görünüm) dikey kısa video (1080×1920, 30 fps). Proje düzeni: `blender/scene.py` (sahne) ve `remotion/src/` (yazı ve ses katmanı).

## Ortam (bu makine: RTX 3060 6 GB, hibrit dizüstü, 14 GB RAM)
- Blender 5.2.2 LTS: `~/apps/blender-5.2.2-linux-x64/`. Ek skill ya da MCP gerekmez, `blender -b --factory-startup -P sahne.py` yeterli.
- Blender'ı **mutlaka `blender-gpu` ile çalıştır** (`~/icinde-ne-var/bin/`, `~/.local/bin`'e bağlı; aynı klasörde `contact-sheet` da var). Bu sarmalayıcı şu değişkenleri ayarlar: `__NV_PRIME_RENDER_OFFLOAD=1`, `__GLX_VENDOR_LIBRARY_NAME=nvidia`, `__EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/10_nvidia.json`. Düz `blender` Intel iGPU'ya düşer ve yaklaşık 3 kat yavaştır. Kontrol için `gpu.platform.renderer_get()` çıktısında "NVIDIA" yazmalı.
- EEVEE 1080×1920, 64 örnek, raytracing açıkken kare başına ~1 sn sürer (720 kare ≈ 12 dk). Kare dizisi yaklaşık 850 MB tutar ve disk dar, iş bitince sil.

## Akış: Blender (3D) → Remotion (yazı ve ses) → MP4
1. `scene.py` sahneyi koddan kurar, `.blend` dosyasını kaydeder ve `anchors.json` üretir: her etiket noktasının her karedeki ekran konumu (px).
2. Ön izleme: `-- --preview` ile 8 kareyi %50 boyut ve 16 örnekle render et (saniyeler sürer). `contact-sheet` ile hepsini tek bir şerit PNG yap, **görseli Read ile kendin incele**, düzelt, tekrarla. Tam render'a ancak ön izleme temizse geç.
3. Tam render: `blender-gpu -b out/x.blend -o "$PWD/remotion/public/frames/####" -F PNG -a`. Film şeffaf (RGBA) olduğu için arka planı Remotion çizer.
4. Remotion: karelerin üstüne etiket, kanca yazısı, açıklama ve SFX eklenir, ardından `npx remotion render <Id> out/x.mp4 --codec=h264 --crf=18`. Son olarak MP4'ten kare çıkarıp görsel kontrol yap, sesi `volumedetect` ile doğrula.

## Modelleme (1 birim = 1 cm, nesne yerel Z ekseninde)
- Dönel parçalar (gövde, buton, uç, hazne) için lathe kullan: (r, z) profil noktaları → `bmesh.ops.spin(angle=2π, steps=96)`, ardından `remove_doubles` ve `recalc_face_normals`. r>0 olan profilde halkayı kapatırsan et kalınlığı oluşur.
- Pürüzsüz ama keskin köşeli gölgeleme için `me.shade_smooth(); me.set_sharp_from_angle(angle=radians(35))`. Kutular için Bevel modifier ve `harden_normals=True`.
- Yay: 3D POLY eğri, sarmal noktalar ve `bevel_depth` ile tel kalınlığı. Kanatçık ve diş gibi detaylar küçük kutularla yapılır.
- Kodla en iyi sonuç sade, stilize ve low-poly nesnelerde alınır. Motor, anatomi gibi karmaşık nesneler için hazır CC0 model gerekir.

## Animasyon yapısı
- Hiyerarşi: `Egim` (Y ekseninde ~12°, kadrajı çaprazlar) → `Yuva_<parça>` (patlatma ötelemesi) → `<parça>` (kendi ekseninde döner).
- Parçaları ortak bir pivot etrafında döndürme. Gövdeler yörüngede dönerse orta sütunu kapatır.
- Patlatma: orta sütun Z boyunca, iri gövdeler yanlara (x ±2 cm). Döngü için 720 karede tam tur sayısı kadar dön ve son kareyi ilk kareyle aynı yap.
- Blender 5'te `action.fcurves` yok (katmanlı action'lar). İnterpolasyonu anahtar kare eklemeden önce ayarla: `prefs.edit.keyframe_new_interpolation_type = 'LINEAR' | 'BEZIER'`.
- Kamera: hedef boş nesneye TRACK_TO kısıtı, 85 mm lens. Dikey yükseklik `H` cm'yi göstermek için mesafe `d = H/2 / tan(atan(18/lens))`. Bunu `shot(kare, z, H)` gibi bir fonksiyona sar. Makro çekimde `clip_start = 0.01`.

## Görünüm
- `BLENDER_EEVEE`, `taa_render_samples=64`, `use_raytracing=True`, AgX + "Punchy" look.
- Işık: ölçekten bağımsız oldukları için güneş ışıkları kullan: ana ışık 4.5, iki renkli kenar ışığı (mavi ve turuncu) ve bir dolgu ışığı.
- Dünya: Generated Z'yi (z·0.5+0.5) aralığına çevirip ColorRamp ile koyu → gri → parlak geçişli stüdyo yap. Bu olmazsa kromlar siyah görünür.
- Şeffaf hazne için `surface_render_method='BLENDED'` ve alpha ≈0.18. İçindeki mürekkebe hafif emission ver.
- Bilyenin döndüğü görünsün diye malzemesine noise ile mürekkep lekeleri ekle.

## TikTok güvenli alanı (1080×1920)
- Önemli içerik dikeyde ~150–1510 px arasında kalmalı. Sağdaki ~130 px butonlara, alttaki ~400 px açıklamaya ayrılır.
- Kadrajı `anchors.json`'daki ekran koordinatlarıyla ölçerek ayarla.

## Remotion notları (4.0.533, Node 24, npm 12)
- Kurulum: `npx create-video@latest --yes --blank --no-tailwind remotion`. npm 12 esbuild'in kurulum scriptini engeller, sonra `npm install-scripts approve esbuild && npm rebuild esbuild` çalıştır.
- Ek paketler: `npx remotion add @remotion/google-fonts @remotion/media`. JSON import edebilmek için tsconfig'e `"resolveJsonModule": true` ekle.
- Kare dizisi: `<Img src={staticFile(\`frames/${String(frame+1).padStart(4,"0")}.png\`)}/>`. Remotion karesi r, Blender karesi r+1'e karşılık gelir.
- Etiket: SVG çizgiyle çapadan kutuya (çapa + dx/dy) bağlanır ve çizgi animasyonla çizilir. Türkçe karakterler için fontu `latin-ext` alt kümesiyle yükle. Yazıların arkasına yarı saydam zemin koy.
- SFX: `https://remotion.media/{mouse-click,whoosh,switch,ding}.wav` ve `<Audio from=… volume=…/>`. Müzik videoya gömülü değilse telifsiz olanı ekle.

## Tuzaklar
- Kendi komutunu öldürme: `pkill -f "<desen>"` komut satırını içeren kendi bash sürecini de eşleştirir, bunun yerine PID kullan.
- Tam render'ı arka planda başlat, beklerken Remotion tarafını kur ve hazır olan karelerle `npx remotion still` ile ara kontrol yap.
