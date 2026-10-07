# M5a — Gerçek araç doğrulaması

| | |
|---|---|
| Durum | **Bekliyor.** M5a bulut konteynerinde (GPU yok, Blender yok, kalem pilotu dosyası yok) uygulandı; aşağıdaki üç adım GPU'lu makinede koşulacak |
| Plan | `docs/superpowers/plans/2026-10-06-m5a-final-render-qc.md` T12 Step 1–3 |
| Bu ortamda yapılan | `npm test` 355 · smoke 19 geçti / 11 atlandı · `test:render`'ın Blender'sız dosyaları (taslak 2, taslak adımı 1, final compose 2) gerçek sistem Chrome'u ve `VG_REMOTION_GL=swangle` ile 5 geçti · pilot benzeri sentetik klipte qc 7/7 |

## 0. Tam doğrulama (T12 Step 1)

```bash
npm run typecheck && npm test && npm run test:blender && npm run test:render && npm run test:smoke
```

Beklenen: `npm test` 355; `test:blender` `Ran 19 tests … OK` (T3'ün iki testi: `test_complete_png_rejects_truncated_and_foreign_files`, `test_final_frames_are_transparent_rgba_and_a_rerun_skips_complete_ones`); `test:render` 10 (Blender 4 + final Blender 1 + taslak 3 + final compose 2; konsolda `final render: 5 kare … ms` ve `final compose: 30 kare … ms`); smoke 19 / 11. Ardından `/tmp/videogen-smoke`, `~/.vg-render-test-*` yok; 5173/5180/5190 boş; `render-cli`, `blender`, `chrome-for-testing` süreci yok.

Bulut konteynerinde final Blender yolu yalnızca sahte `bpy`/`gpu` modülleriyle sınandı (taze render, kesilmiş PNG'den devam, hepsi hazırken Blender açılmaz, NVIDIA değilse çıkış 3). Gerçek Blender'da ilk kez burada koşacak.

## 1. Kalem pilotu kalibrasyonu (spec §8.3, T12 Step 2)

```bash
node --import tsx apps/worker/src/render/qc-cli.ts ~/icinde-ne-var/pilot-kalem/remotion/out/icinde-ne-var-kalem.mp4 > /tmp/pilot-qc.json; echo "çıkış $?"
grep '^✗' /tmp/pilot-qc.json || true
```

Beklenen: çıkış 3; `✗` satırları en az `d6_loudness` (−23,4), `d6_lra` (20,6), `d6_first_audio` (0,79), `d6_silence`, `d3_freeze`, `g1_color`, `g6_edges`. Biri eksikse eşik gerekçeyle ayarlanır, `RUBRIC_VERSION` `final@2` olur.

Sentetik karşılığı (bu ortamda ölçüldü, `apps/worker/test/qc.test.ts`): I −29,3 LUFS, LRA 16,9 LU, TP −15,0, ilk ses 0,811 sn, sessizlik 7,02–8,32 sn, donma 5,9–7,23 sn, kenar yoğunluğu 0,181 (2 sn), GOP 250 → 7 hatanın hepsi ve G1 düştü.

| Ölçüm | Gerçek pilot | Sonuç |
|---|---|---|
| (doldurulacak) | | |

## 2. İlk gerçek ürün — finale kadar tek koşu (K12, T12 Step 3)

`docs/m4/real-check.md` M4c §3'teki tarif; farkları: veritabanı `videogen_m5a_check`, klasör `/tmp/videogen-m5a-check`, plan `producePlan('silent')` (8 adım), koşudan önce bir izinli müzik (`node bin/assets.mjs add --kind music … --license CC0-1.0 …`; yoksa müziksiz, rapora yazılır), bekleme döngüsü 4 sa. Kapı: başlama 5 sa < %25 ve 7 gün < %70; koşuda 5 sa > %80 → iptal.

Kayıt: rol başına tur/token/maliyet eşdeğeri/süre; taslak turları; `final_render` süresi (`render.final` audit'i) ve örnek sayısı; `compose` süresi; qc raporu; **video başına kullanım** (toplam token, oturum, `fiveHourDelta`, toplam süre) → buraya ve `docs/m4/real-check.md` M4c §4. `docs/m5/real-final-sheet.png` (müzikli varyanttan 12 kare) ve `docs/m5/real-studio-m5a.png`.

Gözle: kahraman 0. karede; metaller (EEVEE + AgX); etiket çizgileri doğru parçaya; SFX zamanlaması; müzik seviyesi; QC kartındaki LUFS ve gerçek tepe.

| Ölçüm | Değer |
|---|---|
| (doldurulacak) | |
