# VideoGen — Uygulama Yol Haritası

**Spec:** `docs/superpowers/specs/2026-10-06-videogen-design.md`

Spec birden çok bağımsız alt sistemi kapsıyor. Bu nedenle her kilometre taşı kendi planıyla, kendi başına çalışan ve test edilebilen bir yazılım üretir. Planlar **sırayla ve bir önceki taşın kanıtlarıyla** yazılır. M0'daki doğrulama denemeleri (SDK binary'si, `get_usage`, giriş akışı, GLB eşdeğerliği) M3 ve sonrasının kod ayrıntılarını değiştirebilir. Bu yüzden onların ayrıntılı planını bugünden yazmak boşa iş riski taşır (YAGNI).

| Taş | Plan dosyası | Durum | Giriş koşulu | Çıkış ölçütü |
|---|---|---|---|---|
| M0 Doğrulama | `2026-10-06-m0-verification.md` | **Tamamlandı** (`docs/m0/report.md`) | — | `docs/m0/report.md`: dört spike için kanıtlı sonuç; kayıtlı fixture'lar; disk ≥ 30 GB boş |
| M1 Ses | `2026-10-06-m1-audio-listening.md` | **Tamamlandı — K17 kullanıcı onayı bekliyor** (`docs/m1/decision.md`) | M0 disk temizliği | Kullanıcının TTS ve ses kararı (K17), VRAM ölçümü, Whisper hizalaması çalışıyor |
| M2 İskelet | `2026-10-06-m2-skeleton.md` | **Tamamlandı** (`docs/m2/report.md`) | M0 spike (b), (c) sonuçları (footer veri kaynağı, giriş akışı) | `npm run test:smoke` içinde S1 yeşil; audit zinciri; SSE tekrar oynatma; ücretli anahtar muhafızı |
| M3 Canlı agent katmanı | `2026-10-06-m3a-agent-runtime.md` (M3a) + `2026-10-06-m3b-live-ui.md` (M3b) | **Tamamlandı** (`docs/m3/report.md`) | M0 (a) fixture'ları, M2 | S3, S4, S5 (kısmi) |
| M4 Dikey dilim | `2026-10-06-m4a-pipeline-core.md` (M4a) + `2026-10-06-m4b-scene-core.md` (M4b) + `2026-10-06-m4c-draft-review-player.md` (M4c) | **Uygulandı, `main`'e birleştirildi** — M4a, M4b, M4c (`docs/m4/report.md`). Açık tek çıkış maddesi: K12 modelleriyle ilk gerçek ürün ve video başına kullanım ölçümü (GPU'lu makinede, rapor §4) | M3 | S2 (taslak) ✓; ilk gerçek ürün; video başına kullanım ölçümü |
| M5 Final ve kalite | `2026-10-06-m5a-final-render-qc.md` (M5a) + `2026-10-07-m5b-review-fix.md` (M5b) + M5c (yazılacak) | M5a ve M5b **uygulandı, `main`'e fast-forward** (`docs/m5/m5a-summary.md`, `docs/m5/m5b-summary.md`; bulut konteynerinde, Fake sürücülerle). GPU'lu makinede bekleyen: pilot kalibrasyonu, `test:blender`, Blender final int testi, gerçek ürün "yayına hazır" ve son review (`docs/m5/real-check.md`); sırada M5c (ses) | M1 kararı, M4 | Rubrik pilotun 7 hatasını yakalıyor; bir ürün "yayına hazır" |
| M6 Yayın | M5 bitince | Bekliyor | M5 | S6; gerçek taslak gönderimi |
| M7 Sertleştirme | M6 bitince | Bekliyor | M6 | S7, S8, `test:smoke:real` |

**Paralellik:** M1 ve M2 birbirinden bağımsızdır; M0'dan sonra herhangi bir sırayla yürütülebilir. M1, kullanıcının dinleme testine katılmasını gerektirir.

**Her taşın sonunda:**
1. Kullanıcıya Türkçe rapor: Maddeler / Doğrulama / Bilmen gerekenler.
2. Spec'in "Doğrulanmamış varsayımlar" tablosu (§18) güncellenir.
3. Bir sonraki taşın planı yazılır.
