# Handoff prompt — mevcut planların subagent-driven ile uygulanması

Yeni bir Claude Code oturumunu `~/gpu-server/VideoGen` klasöründe açın ve aşağıdaki çizgiler arasındaki metnin tamamını ilk mesaj olarak yapıştırın.

---

Merhaba. `~/gpu-server/VideoGen` deposundaki **VideoGen** platformunun mevcut uygulama planlarını sırayla, **superpowers:subagent-driven-development** skill'iyle uygulamanı istiyorum. Tasarım ve planlar önceki oturumda onaylandı. Yeniden tasarım yapma, brainstorming'e girme, kararları tekrar tartışma. Planları uygula, kapılarda dur, kanıtla raporla.

## 1. Bağlam (kısaca)

VideoGen, bu laptopta (RTX 3060 6 GB, 14 GB RAM, disk dar) localhost'ta çalışan, tek kullanıcılı bir React web platformu. Ürün adından "içinde ne var" (patlatılmış görünüm) TikTok videoları üretir. Tüm AI işini Claude Code agent'ları, kullanıcının **Max aboneliğiyle** yapar. **Hiçbir ücretli API kullanılmaz:** Anthropic API key yok; ElevenLabs, OpenAI ve Edge-TTS yok.

## 2. Başlamadan önce oku (bu sırayla, tamamını)

1. `docs/superpowers/runbook.md`: uygulama sırası, kapılar, görev döngüsü, sorun giderme. **Ana talimat kaynağın bu.**
2. `docs/superpowers/checklist.md`: ilerleme takibi; her görevden sonra güncelleyeceksin.
3. `docs/superpowers/specs/2026-10-06-videogen-design.md`: tasarım (özellikle §4 karar tablosu, §6 agent katmanı, §17 kilometre taşları, §18 doğrulanmamış varsayımlar).
4. `docs/superpowers/plans/2026-10-06-videogen-roadmap.md`
5. Uygulayacağın planlar:
   - `docs/superpowers/plans/2026-10-06-m0-verification.md`
   - `docs/superpowers/plans/2026-10-06-m2-skeleton.md`
   - `docs/superpowers/plans/2026-10-06-m1-audio-listening.md`

Okuduktan sonra bana 5–8 satırlık bir anlayış özeti ver ve hemen M0'a başla. Onay bekleme; kapılar dışında durma.

## 3. Sıra

**M0 → M2 → M1.** Bu sıra runbook §2'den gelir: M1 ve M2 bağımsızdır; önce iskelet, sonra benim katılmam gereken dinleme testi.

- **M0 Doğrulama:** disk temizliği, 4 doğrulama spike'ı, gerçek stream fixture'ları, `docs/m0/report.md`.
- **M2 İskelet:** monorepo, Postgres, audit zinciri, SSE, API + Worker, arayüz kabuğu, `npm start`, smoke S1. M0 raporundaki sonuçlara göre uygulanır (footer veri kaynağı: M0 spike (b)).
- **M1 Ses:** venv, normalizasyon ve hizalama, dinleme testi. Task 4–5'te bana dinletip kararımı alacaksın.

Üç plan bitince **dur**. `docs/m0`, `docs/m1` ve `docs/m2` raporlarına dayanarak M3 planını yazmayı öner, ama ben "evet" demeden yazma.

## 4. Yürütme kuralları

- **Yöntem:** Her plan için `superpowers:subagent-driven-development`. Her görevi taze bir alt ajan uygular, taze bir reviewer kontrol eder; plan sonunda tüm dal review edilir. Workflow tool'unu ben açıkça istemedikçe kullanma.
- **Dal:** Her kilometre taşı kendi dalında: `m0-verification`, `m2-skeleton`, `m1-audio`. Çıkış ölçütü sağlanınca `git merge --no-ff` ile `main`'e birleştir (runbook §3.2).
- **TDD:** Planlardaki adımları sırasıyla uygula. Önce testi yaz ve başarısız olduğunu gör, sonra uygula ve geçtiğini gör, sonra commit et. Adım atlama.
- **Commit:** Görev başına bir commit. Yazar bilgisi env ile verilir:
  `GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com"`
  Mesaj sonuna `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` satırını ekle.
- **Checklist:** Her görev bitince `docs/superpowers/checklist.md`'de kutuyu işaretle ve `· commit <hash> · <tarih>` ekle. Kapı kararlarını en alttaki "Karar ve kapı kayıtları" tablosuna yaz. Genel durum tablosunu taş başlarken ve biterken güncelle.
- **Kanıt:** "Bitti" demeden önce doğrulama komutunu çalıştır ve çıktısını göster (`superpowers:verification-before-completion`). Test sayıları plandaki "Beklenen" satırlarıyla eşleşmeli.
- **Plandan sapma:** Plan kodu yazıldığı gibi çalışmazsa (paket API'si farklı, sürüm uyumsuzluğu vb.) en küçük düzeltmeyi yap, sapmayı ilgili taş raporuna "Plandan sapmalar" başlığıyla yaz ve devam et. Sapma spec'teki bir **kararı** değiştiriyorsa dur ve bana sor.
- **Taş sonu** (runbook §3.5): `docs/m<N>/report.md` (Varsayım · Sonuç · Kanıt · Spec'e etkisi) yaz, spec §18'i güncelle, `main`'e birleştir, bana Türkçe rapor ver.

## 5. Kapılar: burada dur ve bana sor (runbook §4)

1. **M0 Task 1:** `~/gpu-server/minillm-lab` içinde commit edilmemiş değişiklik, push edilmemiş commit veya stash varsa silme. Listeyi göster ve onay iste.
2. **M0 Task 3:** `apiKeySource` `none` değilse (abonelik yolu çalışmıyor) dur.
3. **M0 Task 4:** `PreToolUse` yol koruması run klasörü dışına yazmayı engellemiyorsa dur. Spec §6.1 ve §15 güncellenmeden ilerleme.
4. **Disk eşikleri:** M1 öncesi boş disk < 30 GB ise dur.
5. **M1 Task 4 Step 6:** Kendi ses klonum için kayıt isteyeceksen sor. Kayıt vermezsem o adımı atla ve raporda "klon test edilmedi" yaz.
6. **M1 Task 5:** TTS motoru ve anlatıcı sesi kararı bende. Dinleme sayfasını aç ve kararımı bekle.
7. Planda yazmayan **herhangi bir** silme veya geri alınamaz işlemden önce hedefi göster ve onay al.

## 6. Önceden onaylanmış işlemler (yeniden sorma)

- **M0 disk temizliği:** yalnızca şu dört madde, her birinden önce son durum kaydedilerek:
  - Ollama `gemma4:e4b` + `gemma4:e2b`
  - `~/.npm`, `~/.cache/go-build`, `~/.cache/google-chrome` (Chrome açıksa atla), `~/.cache/uv`
  - `~/gpu-server/jet-engine/node_modules` + `~/gpu-server/remotion-test/node_modules`
  - `~/gpu-server/minillm-lab` (kapı 1 temizse)
- Haiku modeliyle yapılan küçük `claude` probe'ları (M0 spike'ları).
- `postgres:17` container'ı (`videogen-pg`, `127.0.0.1:5433`) ve volume'ü.

## 7. Kesin yasaklar

- Ücretli API anahtarı kullanma, oluşturma veya env'e koyma. `--bare` kullanma (OAuth'u kapatır). `bypassPermissions` kullanma.
- Kullanıcının gerçek Claude girişine dokunma. Giriş spike'ı (M0 Task 6) yalnızca izole bir `CLAUDE_CONFIG_DIR` ile çalışır.
- `~/.claude/` altındaki ayarları değiştirme (`claude config`, `claude mcp add`, settings.json düzenleme yok).
- `npx playwright install` çalıştırma. Playwright her zaman `channel: 'chrome'` (`/usr/bin/google-chrome`) kullanır; disk dar.
- `pkill -f <desen>` kullanma; kendi kabuğunu öldürür. PID ile `kill` kullan.
- TikTok'a hiçbir şey gönderme (M6'ya kadar yayın yok).
- Fixture'lara ve audit'e e-posta, org id, token, `.env` veya `tokens.json` içeriği yazma.

## 8. Bilinen tuzaklar

| Tuzak | Çözüm |
|---|---|
| npm 12 install script'lerini engeller | `npm approve-scripts <paket>` → `npm rebuild <paket>` |
| İç içe `claude` çalıştırınca "cannot be launched inside another Claude Code session" | `env -u CLAUDECODE ...`. Spike script'leri env'i zaten temizliyor |
| Düz `blender` iGPU'ya düşer (~3× yavaş) | Daima `blender-gpu` (`~/.local/bin`) |
| TypeScript 7'de dosya adını argüman verince TS5112 hatası | `tsc -p tsconfig.json` |
| RAM dar (14 GB, swap dolu; Langfuse yığını ~1,9 GB tutuyor) | Ağır işlerden önce `free -h`; aynı anda gereksiz süreç açma |
| Kurulu `claude` kendi kendine güncelleniyor | Platform, SDK'nın gömülü CLI'ını (2.1.290) kullanır; kurulu `claude` sürümüne güvenme |

## 9. Raporlama

- Her taşın sonunda ve her kapıda bana **Türkçe** rapor ver. Bölümler: **Maddeler / Doğrulama** (komut ve çıktı alıntısı) **/ Bilmen gerekenler**. Gerekirse önce/sonra tablosu ekle.
- Ara mesajlar kısa olsun: hangi taş, hangi görev, sonuç.

Başla.

---
