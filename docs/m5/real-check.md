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

---

# M5b bekleyenleri

| | |
|---|---|
| Durum | **Bekliyor.** M5b bulut konteynerinde (GPU yok, Blender yok, gerçek Claude yok) uygulandı; T12 Step 1 (ayrı tam doğrulama) kullanıcının isteğiyle koşulmadı, Step 2–3 bu konteynerde yapılamadı, Step 4 (son bağımsız review) kullanıcının isteğiyle atlandı |
| Plan | `docs/superpowers/plans/2026-10-07-m5b-review-fix.md` T12 Step 1–4 (karar kaydı F25) |
| Bu ortamda yapılan | typecheck temiz · `npm test` 399 geçti (~5,9 dk) · smoke 19 geçti / 13 atlandı (4,3 dk) · M5b ekran testleri 2 geçti · taşınan `rötuş` uçtan uca testi tek başına geçti. `test:render` bir paket olarak yeniden koşulmadı; `test:blender` koşulmadı |
| Özet | `docs/m5/m5b-summary.md` |

M5a'nın üç bekleyeni (§0, §1, §2) ve M5b'nin bekleyenleri **aynı GPU oturumunda** kapatılır; §2'deki M5a "finale kadar" koşusu M5b'nin "yayına hazır"a kadar koşusuyla birleşir.

## M5b-1. Tam doğrulama (T12 Step 1)

```bash
npm run typecheck && npm test && npm run test:blender && npm run test:render && npm run test:smoke
```

Beklenen:
- `npm test` **399**.
- `test:blender` `Ran 19 tests … OK`.
- `test:render`:
  - Blender'sız makinede **6** (taslak 2 + taslak adımı 1 + final compose 2 + taşınan `rötuş` uçtan uca 1).
  - Blender'lı makinede **11**: plan 10 bekliyordu (Blender 4 + final Blender 1 + taslak 3 + final compose 2); `rötuş` uçtan uca testi `test:render`'a taşındığı için +1 (F21). Sayı farklıysa `Ruling:` yaz.
- Smoke **19 / 13**.
- Ardından `/tmp/videogen-smoke`, `~/.vg-render-test-*` yok; 5173/5180/5190 boş; `render-cli`, `blender`, `chrome-for-testing` süreci yok.

Blender final int testi (M5a T3, `test:blender` içindeki iki final testi) bu oturumda ilk kez gerçek Blender'da koşar; sonucu kaydet.

## M5b-2. Kalem pilotu kalibrasyonu ve D6 alt puanları (T12 Step 2)

§1 komutu (`qc-cli` ile gerçek pilot) aynen koşulur.
- Çıkış 3 ve en az 7 kimlik `✗` beklenir.
- Eksik varsa eşik gerekçeyle ayarlanır, `RUBRIC_VERSION` `final@2` olur, ledger'a `Ruling:` yazılır.
- **D6 alt puanlarının (E3) gerçek pilot ve gerçek ürün ölçümleriyle karşılaştırması** `docs/m5/m5b-summary.md` §4'e yazılır (şu an "bekliyor"); değişiklik yalnızca kanıtla. Müzikli gerçek ürünün qc raporundaki D6 alt puanları (LUFS, LRA, ilk ses, sessizlik, tepe) pilotun ölçümleriyle yan yana tablolanır.

## M5b-3. Gerçek ürün — "yayına hazır"a kadar tek koşu (T12 Step 3)

Tarif `docs/m4/real-check.md` M4c §3 ve §2'dekiyle aynı; farklar:
- **Ürün ve roller:** "tükenmez kalem", seslendirmesiz, K12 rolleri (override yok).
- **Ortam:** geçici DB `videogen_m5b_check`, klasör `/tmp/videogen-m5b-check`, bekleme döngüsü 6 sa.
- **Zorunlu: izinli bir müzik parçası.** Koşudan önce `node bin/assets.mjs add --kind music --file … --title … --license CC0-1.0 --author … --license-text …`. **Müzik yoksa D6 düşer** (yalnız SFX karışımı sessizlik/loudness'ta kalır; ölçülen 79,5, müzikli 87,5), `silent` modda fixer'ın yazabileceği ses spec'i yoktur ve koşu `needs_human` ile biter (pipeline hatası değil; M5c `AudioPlan` ile açılır). Müziksiz koşu "yayına hazır"ı kanıtlamaz; yalnızca bu davranışın doğrulaması olur ve rapora öyle yazılır.
- **Kapı:**
  - Başlama koşulu: `GET /api/usage/guard` ile 5 sa < %25 ve 7 gün < %70.
  - Koşu içinde 5 sa > %80 → iptal (kodda `usage` durdurması da devrede).
  - `failed` ya da `needs_human` olursa tekrar yok; gerekçe ve son artefaktlar rapora.
- **Kayıt** (aşağıdaki tablolar):
  - Rol başına tur, token, maliyet eşdeğeri ve süre; taslak ve final turları.
  - Reviewer kararları ve tur özetleri (`reviews`, `findings`); fixer kapsamları (`fix.scope` audit); `final_render` ve `compose` süreleri; `render.final_mixed_samples` var mı.
  - **Video başına kullanım** (toplam token, oturum, `fiveHourDelta`, toplam süre) → buraya ve `docs/m4/real-check.md` M4c §4.
  - Görseller: `docs/m5/real-review-sheet.png` (son turun kontakt sayfası) ve `docs/m5/real-studio-m5b.png` (Stüdyo inceleme paneli).
- **Gözle:** §2'deki liste + inceleme panelinin üç kartı, toplam puan ve kapılar; `Düzeltme turu k/3` satırı; "Yayına hazır · N puan" notu; kütüphane puanı.

| Rol | Tur | Token | Maliyet eşdeğeri | Süre |
|---|---|---|---|---|
| (doldurulacak) | | | | |

| Ölçüm | Değer |
|---|---|
| (doldurulacak) | |

**Reviewer isabeti (M4 §9):** reviewer bulguları ile göz incelemesi kontrol kontrol tablolanır; ilk kalibrasyon verisidir (kontrol puanları `final@2` ile değişebilir).

| Kontrol | Reviewer (geçti/kaldı, kanıt) | Göz incelemesi | Uyum |
|---|---|---|---|
| (doldurulacak) | | | |

## M5b-4. Atlanan son review (T12 Step 4)

Kullanıcının isteğiyle atlandı; GPU'lu makinedeki oturumda tek bağımsız ajanla (salt okunur) yapılır. Girdiler: `git diff main...HEAD` yerine M5b'nin başlangıcı için `git diff 2bd3f7a..HEAD`, M5b planı, spec, planın Review Focus bölümü (aynen), ledger `Ruling:` satırları, bu dosya. Özellikle: fan-out ve fixer yarıda kalırken replay; final rewind transaction'ı ve sürüm satırı sırası; kapsam hesabının kaçırabileceği alanlar; bayatlık; `reviewer_facts` içeriğinden prompt injection yüzeyi (yazma aracı ve Bash yok); kullanım durdurması; fixer'ın `writeDirs: null` + Bash ile `review/` ya da `final/` altına yazması (algılanmıyor, `m5b-summary` §9). Critical/Important → RED→GREEN + `--fixup`; Minor → özetin "Ertelenenler"ine.
