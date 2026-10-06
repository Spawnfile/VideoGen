# M4b — Sahne çekirdeği: özet

| | |
|---|---|
| Tarih | 2026-10-06 |
| Dal | `m4b-scene-core` (M4a `5fedf2d` üstünde). Kullanıcı kararıyla M4a ile birlikte `main`'e birleştirildi |
| Plan | `docs/superpowers/plans/2026-10-06-m4b-scene-core.md` (11 görev). T1–T10 uygulandı; T11 kısaltıldı (aşağıda §6) |
| Durum | Tamam: storyboard'dan doğrulanmış 3D sahneye kadar (Fake ile smoke, gerçek Blender + bubblewrap ile entegrasyon testi) |
| Kanıt | Bu dosya, `docs/m4/studio-build.png`, `docs/m4/settings-k19.png`, git geçmişi |

## 1. Ne çalışıyor (kullanıcı gözüyle)

Plan artık `research → storyboard → build` adımlarından oluşuyor. Build adımında builder agent'ı `python/vg_blender` API'siyle `scene/product.py` ve `SceneSpec` yazıyor. Worker bu kodu iki aşamada, bubblewrap sandbox'ı içinde (ağ yok, ev klasörü gizli, yalnızca run klasörü yazılabilir) çalıştırıyor:

- **Aşama 1:** `product.py` → geometri `.blend`. AST izin listesi ve kısıtlı builtins var; 120 sn ve 4 GB sınırı uygulanıyor.
- **Aşama 2:** worker'ın kendi betiği, `--disable-autoexec` ile. Patlatma ve kamerayı her kareye anahtarlıyor, kanal stilinin ışığını ve arka planını kuruyor. Manifestleri (anchors, events, kamera izi) ve kontrolleri (kahraman boyu, ön plan kapatma, iç içe geçme) üretiyor, GLB'yi dışa aktarıyor.
- **Eşdeğerlik:** her build'de Blender ↔ three.js anchor eşdeğerliği 5 karede ölçülüyor (≤ 8 px; örnek kalemde 0,01 px).
- **Önizleme:** 8 GPU karesi (EEVEE, %50) kanal stilinin tam renkli arka planına bindiriliyor; kontakt sayfasında TikTok güvenli alanı kırmızıyla gösteriliyor.

Stüdyo'da "Sahne" kartı önizleme kontakt sayfasını, parça ve üçgen sayısını, kahraman oranını, kanal kimliğini ve uyarıları gösteriyor. Görsel yeni medya ucundan (`GET /api/blobs/:sha`, HTTP Range) geliyor. Agent kartı GPU beklerken "GPU bekliyor · sırada N" yazıyor; araç çalışırken yanlış "takılmış olabilir" uyarısı çıkmıyor.

Video sonunda `insan gerekli` durumunda kalıyor, not: "Sahne kurulumu hazır. Taslak render bu sürümde henüz yok." (K13).

Ayarlar → Kanal kimliği bölümü üç seçeneği örnek kalemin gerçek render'larıyla sunuyor: Atölye, Beyaz laboratuvar, Gece mavisi. Seçim audit'e yazılıyor ve sonraki build'in `style_id`'si oluyor.

## 2. Görevler

| # | Görev | Commit | Test |
|---|---|---|---|
| T1 | `SceneSpec`, sahne manifestleri, kanal stilleri | `3eed682` | 230 |
| T2 | `vg_blender` kütüphanesi (güvenlik, hareket, malzeme, primitif, `vg` API, stüdyo) | `dd63e70` | 231 · Blender 12 |
| T3 | İki aşamalı build, manifestler, kontroller, GLB, önizleme render'ı, fixture'lar | `2b6524f` | 231 · Blender 17 |
| T4 | `packages/scene3d` (GLB saati, kare başına fov, eşdeğerlik) | `374190f` | 235 |
| T5 | Render katmanı (kilitler, §6.4 kapısı, bwrap, süreç grubu, Fake sürücü) | `dd119c1` | 245 · render 4 |
| T6 | MCP `build_scene` / `render_preview_stills`, araç canlılığı, GPU sırası, güvenlik devirleri | `0d3d565` | 258 |
| T7 | Build adımı (güvenilir build, önizleme, artefaktlar, yeniden başlatmada `resume`, `needs_asset` kapısı) | `52b2186` | 265 (+1 plan incelemesi) · smoke 11 |
| T8 | Medya ucu, build kartı, kartta GPU sırası, adım oturumunda "Yeniden dene" yok | `7ea0145` | 269 |
| T9 | K19 seçenekleri, stil arka planı, Ayarlar seçicisi | `2eb0dc4` | 270 |
| T10 | Smoke S2b | `63242b3` | smoke 15 |

## 3. Doğrulama

```
npm run typecheck && npm test   →  Test Files 50 passed · Tests 271 passed (271)   (270 + plan incelemesinin eklediği stil→hash testi)
npm run test:blender            →  Ran 17 tests … OK
npm run test:render             →  Tests 4 passed (4)   (gerçek bwrap + Blender + NVIDIA; sandbox: net:blocked ssh:False repo:False root:readonly)
npm run test:smoke              →  15 passed · 7 skipped (~1,2 dk); /tmp/videogen-smoke ve portlar temiz
```

S2b RED kanıtı geçici mutasyonlarla alındı:
- Range kapatılınca senaryo 1 düştü.
- Kanal ayarı yok sayılınca senaryo 4 düştü.

Planın kodu yazım sırasında ayrık bir worktree'de görev görev çalıştırıldı. Ardından plan metni temiz bir kopyaya yeniden uygulanıp aynı sayılar alındı.

## 4. Plan yazımında bulunan ve plana işlenen hatalar

- **Animasyon:** Bitmiş `LoopOnce` eylemi `mixer.setTime`'da 0'a dönüyordu (16.611 px fark). Çözüm: her klibe son karede tutma anahtarı + geçmişten bağımsız `seek`.
- **Sandbox bağlama sırası:** `--tmpfs /tmp` bağlamalardan sonra geliyordu ve `/tmp` altındaki run klasörünü ve repo'yu örtüyordu (smoke veri klasörü `/tmp`'de). Tmpfs'ler artık önce kuruluyor.
- **SpecStore:** Aynı süreçteki eşzamanlı yazarlar aynı geçici dosya adını kullanıyordu. Çözüm: yazar başına benzersiz ad + `link()` ile özel sürüm.
- **K19 renkleri:** Blender dünyasıyla çizilen arka planı AgX tonlaması karartıyordu. Önizlemeler artık şeffaf; arka plan stilin tam renkleriyle bindiriliyor (spec §7.5'teki final kurgusuyla aynı).
- **Önizleme kontrolü:** `gpu.platform.renderer_get()` ilk render'dan önce çağrılamıyor. NVIDIA kontrolü ilk kareden sonra yapılıyor.

## 5. Ekranlar

- `docs/m4/studio-build.png`: Sahne kartı (Fake önizleme).
- `docs/m4/settings-k19.png`: kanal kimliği seçicisi.

## 6. Plandan sapmalar

| Karar | Neden | Yanlışsa maliyeti |
|---|---|---|
| T11'in gerçek Claude doğrulaması (haiku/sonnet ile tek ürün) ve tek bağımsız son review yapılmadı | Kullanıcı kararı: kullanım limitini korumak, uygulamaya ve birleştirmeye geçmek | Gerçek bir builder'ın `product.py` kalitesi ve video başına kullanım M4c'nin ilk gerçek ürününde ölçülecek; sandbox ve render gerçek araçlarla `test:render`'da doğrulandı |
| M4a ve M4b, M4c beklenmeden `main`'e birleştirildi | Kullanıcı kararı | M4c ayrı dalda `main` üstünden açılır |
| Tam pakette iki kez, ağır bir işin (Blender/smoke) hemen ardından tek bir test düştü; ayrı koşularda 7/7 tekrar edilemedi | Mekanizma kanıtlanamadı; düşen testin adı yakalanamadı | Kırılgan bir M3/M4a zamanlama testi olabilir; görülürse adı ve gecikme enjeksiyonuyla kanıtlanmalı |

## 7. Açık kullanıcı kararları

- **🚦 K19:** Üç seçenek Ayarlar'da. Seçilene kadar `gece_mavisi` GEÇİCİ kullanılıyor ve build notunda "kanal kimliği geçici" yazıyor.
- **🚦 Swap eşiği:** spec §6.4 `swap < %90` değişmedi. Swap şu an %0; dolarsa GPU önizlemesi gerekçeli bekler (kartta yazar).
- **K17 (ses):** M5'ten önce.

## 8. M4c için notlar

- Remotion taslağı sondajda doğrulandı:
  - sistem Chrome `chrome-for-testing` + `gl:'angle'`;
  - `pixelFormat yuv420p` + `colorSpace bt709`;
  - 45 sn 540×960 ≈ 95 sn.
- Draft3D, `@videogen/scene3d`'nin `SceneClock`/`applyFrameFov`/`projectAnchor` yardımcılarını kullanmalı.
- GLB malzemeleri düz görünüyor; metaller için ortam haritası (RoomEnvironment) gerekiyor.
- `draft_render` GPU adımı `ResourceLocks`'u kullanmalı (MCP önizlemeleriyle aynı kilit).
- Taslak inceleme döngüsünde tur sayacı için `steps.round` sütunu (migration 0006) gerekiyor; `attempt` korunursa yeniden deneme hakkı tükenir.
- Builder'ın `render_draft` aracı kaldırıldı (B7). Taslak, pipeline adımı olarak üretilecek.
