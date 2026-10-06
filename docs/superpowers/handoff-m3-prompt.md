# Handoff prompt — M3 planının yazılması ve inline uygulanması

Yeni bir Claude Code oturumunu `~/gpu-server/VideoGen` klasöründe açın ve aşağıdaki iki çizgi arasındaki metnin tamamını ilk mesaj olarak yapıştırın.

---

Merhaba. `~/gpu-server/VideoGen` deposundaki **VideoGen** platformunun **M3 — Canlı agent katmanı** kilometre taşını iki adımda yapmanı istiyorum:
1. `superpowers:writing-plans` ile M3 uygulama planını yaz.
2. Planı `superpowers:executing-plans` ile **inline** uygula: görevleri kendin yaparsın; görev başına alt ajan yok.

Tasarım onaylı, M0, M2 ve M1 bitti ve `main`'e birleşti. Yeniden tasarım yapma, brainstorming'e girme, spec'teki kararları (§4 K tablosu) tartışma. Kanıtla çalış, kapılarda dur, Türkçe raporla.

## 1. Bağlam (kısaca)

VideoGen, bu laptopta (RTX 3060 6 GB, 14 GB RAM, ~17 GB boş disk) localhost'ta çalışan, tek kullanıcılı bir web platformu. Ürün adından "içinde ne var" (patlatılmış görünüm) TikTok videosu üretir. Tüm AI işini Claude Code agent'ları, kullanıcının **Max aboneliğiyle** yapar. **Hiçbir ücretli API yok.** M3; agent'ları çalıştıran sürücü katmanını, canlı izi (agent kartları, ThinkingState), chat panelini ve kullanım muhafızını kurar. Video üretim hattı (research, storyboard, build) **M4'tür**, M3'e girmez.

## 2. Başlamadan önce oku (bu sırayla)

1. `docs/superpowers/runbook.md`: uygulama sırası, kapılar, görev döngüsü, günlük işletim, sorun giderme. Ana talimat kaynağın bu.
2. `docs/superpowers/checklist.md`: "M3" bölümündeki 10 teslimat (planın kapsamı) ve en alttaki "Karar ve kapı kayıtları" tablosu.
3. `docs/superpowers/specs/2026-10-06-videogen-design.md`. Tek doğruluk kaynağı; M3 için şu bölümler:
   - §5 mimari ve süreçler
   - §6 agent katmanı: sürücü, roller, MCP, eşzamanlılık, kullanım, iptal, transcript
   - §11.1 `agent_sessions` / `agent_events`
   - §11.2 audit kapsamı
   - §12 ilerleme ve canlılık
   - §13.2 ThinkingState
   - §14 hata ve kurtarma
   - §15 güvenlik
   - §16 test stratejisi: FakeClaudeDriver, S3, S4, S5
   - §18
4. `docs/superpowers/plans/2026-10-06-videogen-roadmap.md`: M3 satırı ve çıkış ölçütü (S3, S4, S5 kısmi).
5. Kanıt raporları:
   - `docs/m0/report.md`: SDK'nın gerçek davranışları; **§12 "M3/M4'e devredilenler"**.
   - `docs/m2/report.md`: gerçek arayüzler; **§6 "Bilinen sınırlar"** ve **§7 "M3'e devredilenler"**.
   - `docs/m1/report.md`: yalnızca bilgi için, M3'ü etkilemez.
6. Var olan kod; planın dayanacağı gerçek arayüzler bunlar, uydurma:
   - `packages/shared/src`: config, `assertNoPaidKeys`, `cleanChildEnv`, usage ve auth eşleyicileri, `browser.ts`.
   - `packages/db/src`: schema, migration'lar 0000–0002, `appendAudit` / `verifyAudit` / `findSecretKeys`, `publishEvent` / `publishLive` / `readEventsAfter` / `maxEventId`, `createPool`.
   - `apps/api/src`: `guard`, `EventHub`, `sse` (yeni bağlantı max'tan başlar), `app.ts` uçları.
   - `apps/worker/src`: `claude-binary`, `claude-account`, `usage` (30 sn zaman aşımı), `heartbeat`, `commands` (crash-only LISTEN), `main.ts`.
   - `apps/web/src`: `lib/live.ts` (SSE deposu, yeniden bağlanma, açılışta REST tazeleme), `components/*`, `routes/*`, `styles/theme.css`.
   - `bin/videogen.mjs` ve `tests/smoke/*`.
   - `tests/fixtures/claude-streams/*.ndjson`: 8 gerçek, maskelenmiş kayıt. Satır biçimi `{"t": ms, "m": SDKMessage}`.
   - `claude-plugin/`: skill symlink'leri mutlak yol.
   - `spikes/m0/*.mjs`: yalnızca referans; üretim koduna kopyalanmaz.

Okuduktan sonra bana 6–8 satırlık bir anlayış özeti ver. Ardından §3'teki tek başlangıç sorusunu sor ve plana geç.

## 3. Başlangıçta tek soru: ThinkingState kaynağı

Spec §13.2, "kullanıcının verdiği ThinkingState komponentini" temel alır: başlık, shimmer, chevron, dikey çizgi, `fade-up` satırlar, `variant` / `active` / `done` / `icon` / `onSettled`. Bu komponentin **kaynak kodu repoda yok**. Bana bir kez sor: "ThinkingState komponentinin kaynağını yapıştırır mısın?"
- **Yapıştırırsam:** `apps/web/src/components/thinking/` altına koy ve §13.2'deki değişiklikleri plana yaz.
- **"Yok" dersem ya da kaynak gelmezse:** komponenti §13.2'nin tarifinden yeniden kur ve raporda "Plandan sapmalar" altında belirt.

Bu soru planın yazılmasını bekletmez. Plan iki durumu da kapsayacak şekilde yazılır.

## 4. Adım 1: Plan (`superpowers:writing-plans`)

- **Dosya:** `docs/superpowers/plans/2026-10-06-m3-live-agents.md` (tarih bugünün tarihi). Biçim ve dil önceki planlarla aynı:
  - Türkçe anlatım
  - Goal, Architecture, Tech Stack, Spec satırları
  - **Global Constraints** ve **Review Focus**
  - Görev başına Files ve Interfaces bölümleri
  - TDD adımları: test kodu, "başarısız gör" komutu ve beklentisi, uygulama kodu, "geçtiğini gör" komutu ve **"Beklenen: N passed"**, commit
- **Kapsam:**
  - checklist'teki 10 M3 maddesi
  - `docs/m0/report.md` §12'nin M3 kısmı
  - `docs/m2/report.md` §7'deki tablo
  - §7'deki maddelerden M3'e ait olmayanları (ör. harici audit çıpası → M7) plana alma; plan başında "Kapsam dışı" listesinde gerekçesiyle yaz.
- **Boyut:** Görev sayısı 12'yi aşıyorsa M3'ü iki plana böl:
  - **M3a:** sürücü, MCP, koruma, olay tabloları, kullanım muhafızı ve Worker tarafı.
  - **M3b:** agent kartları, ThinkingState, chat paneli ve smoke S3/S4/S5.
  - İkisini sırayla yaz ve uygula. Bölme kararını rapora yaz.
- **Planın uyması gereken gerçekler** (M0 ve M2'de canlı doğrulandı):
  - **Oturum yapılandırması:** `settingSources: []`, `strictMcpConfig: true`, yalnızca in-process `videogen` MCP, `plugins: [{type:'local', path:'claude-plugin/'}]`.
  - **İzinler:** `permissionMode: 'dontAsk'`; koruma **`PreToolUse` hook**'unda. `canUseTool` dontAsk'te çağrılmaz. `bypassPermissions` ve `--bare` asla yok.
  - **Hook kapsamı:** Write/Edit `file_path`, NotebookEdit `notebook_path`, Bash komutları (izin listesi + ağır komut yasağı; gerekçe doğru MCP aracını göstersin).
  - **Red tespiti:** `tool_result.is_error` + `PreToolUse:<Araç> hook error:` öneki ve `result.permission_denials`; hook olayı gelmez.
  - **Env:** `cleanChildEnv()` sonrasına `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` eklenir. Temizleyici `CLAUDE_CODE_*`'i sildiği için önce temizlik, sonra ekleme. Bayrak n=1 doğrulandı.
  - **Birden fazla `result`:** sürücü buna yine de dayanıklı olmalı. Son `result` esas alınır; `background_tasks_changed` boşalana ve iterator bitene kadar beklenir. Muhasebe **son result'un kümülatif `modelUsage` / `total_cost_usd`** değerini kullanır. Result başına `usage` / `num_turns` bölüm deltasıdır; ikisi karıştırılmaz.
  - **İptal:** `interrupt()` sonrası `result{error_during_execution, aborted_streaming}` gelir, ardından iterator "Claude Code returned an error result" fırlatır. İptal yolu bunu yakalar ve adımı `cancelled` sayar. §6.4'teki sıra: 10 sn sonra SIGTERM, sonra SIGKILL.
  - **Akış olayları:** `task_progress` **gözlenmedi**; kartlar `task_started`, `task_notification` ve `parent_tool_use_id` ile çalışır. `thinking` delta'ları ve `system/thinking_tokens` her oturumda var.
  - **Araç ve skill adları:** Skill'ler `videogen:*` adıyla yüklenir. Alt ajan `tool_use` adı `Agent`, ama `init.tools`'ta `Task` görünür. WebSearch sonucu `{query, results, durationSeconds, searchCount}`.
  - **Kullanım birimleri:** `rate_limit_event.rate_limit_info.unifiedWindows` kesir 0..1 + epoch saniye ve oturumda birden çok kez gelebilir. `get_usage` yüzde 0..100. Eşleyiciler `packages/shared/src/usage.ts`'te hazır.
  - **Binary:** gömülü CLI 2.1.290, SDK 0.3.290 tam sabit. Kurulu `claude`'a güvenilmez (K20).
  - **SSE ve `ui_events`:**
    - Bütün yazmalar `publishEvent` üzerinden yapılır.
    - İkinci bir yazar süreç gelecekse sıralamayı **DB'de zorla**: SECURITY DEFINER yayın fonksiyonu + `REVOKE INSERT`. `BEFORE INSERT` trigger'ı işe yaramaz, çünkü `nextval` trigger'dan önce çalışır.
    - Token token akış `vg_live` ile gider (payload ≤ 7900 bayt; büyük delta'ları böl ya da kısalt).
    - Kalıcı satırlar `ui_events` + `agent_events`'e yazılır.
    - Arayüz flush'ı ~10 Hz ile sınırlanır.
  - **Worker:** tüm Claude süreçlerinin ve slotların tek sahibi (pipeline 3 + ayrılmış chat 1). Chat oturumları da Worker'da çalışır; API sadece komutu iletir (`vg_commands`).
  - **Audit:** agent araç girdileri audit'e girmeden önce gizli anahtar regex'i `*_key` sonekleri ve çoğullar için genişletilir.
  - **Testler:** FakeClaudeDriver 8 fixture'ı hızlandırılmış zamanla oynatır; `subagent-background.ndjson` da buna dahil. Gerçek Claude çağrısı yalnızca isteğe bağlı bir `test:smoke:real`-tarzı elle doğrulama adımında, **haiku** ile ve küçük tutulur.
- **Plan öz-incelemesi:** Yazdıktan sonra plan dosyasını baştan sona yeniden oku. Planda tanımlanmamış tip veya fonksiyon kullanılmamalı, görevler arası arayüzler tutarlı olmalı, her görevde test sayısı yazılı olmalı. Spec'le çelişen bir şey varsa spec kazanır. Bulduklarını düzelt, sonra planı commit et: `docs(m3): implementation plan`.
- **Plan bitince onay bekleme;** doğrudan Adım 2'ye geç. Runbook ve checklist'teki "plan yazılacak" ifadelerini güncelle.

## 5. Adım 2: Inline uygulama (`superpowers:executing-plans`)

- **Dal:** `git switch -c m3-live-agents` (bölünürse `m3a-…`, `m3b-…`). Çıkış ölçütü sağlanınca `git merge --no-ff` ile `main`'e birleştir.
- **TDD, adım atlamadan:** önce testi yaz, çalıştır ve **başarısız olduğunu gör**; sonra uygula, çalıştır ve **geçtiğini gör**; sonra commit et. Test sayıları plandaki "Beklenen" satırlarıyla eşleşmeli. Sayı değişirse sebebini rapora yaz.
- **Commit:** görev başına bir commit. Yazar bilgisi env ile verilir:
  `GIT_AUTHOR_NAME="Alper Ekmekci" GIT_AUTHOR_EMAIL="alper.ekmekci54@gmail.com" GIT_COMMITTER_NAME="Alper Ekmekci" GIT_COMMITTER_EMAIL="alper.ekmekci54@gmail.com"`
  Mesajın son satırı, harness başka bir model adı önerse bile **tam olarak** şudur:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  Bir görevi sonradan düzeltirsen `git commit --fixup=<görev commit'i>` kullan, merge öncesinde `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash <dal tabanı>` ile birleştir ve ağacın değişmediğini doğrula (`git rev-parse HEAD^{tree}` önce ve sonra aynı).
- **Checklist:** her görev bitince `docs/superpowers/checklist.md`'de ilgili M3 kutusunu işaretle ve `· commit <hash> · <tarih>` ekle. Genel durum tablosunu taş başlarken ve biterken güncelle. Kararları en alttaki tabloya yaz. Squash sonrası hash'leri düzelt.
- **Arayüz işleri:**
  - Kodlamadan önce `frontend-design:frontend-design` skill'ini yükle.
  - Token'lar `apps/web/src/styles/theme.css` ile spec §13.3'e uyar: tek vurgu teal `#016a71`; yeşil ve kırmızı yalnızca diff ve durumlarda, kısık tonda; font ağırlıkları yalnızca 400/500; tüm metinler Türkçe.
  - Görünür her değişiklikten sonra Playwright (`channel:'chrome'`) ile ekran görüntüsü al ve Read ile kendin incele.
  - M2'nin a11y sözleşmesini bozma: S1'in sorguladığı metinler ve test id'leri.
- **Kanıt:** bitti demeden önce doğrulama komutunu çalıştır ve çıktısını göster (`superpowers:verification-before-completion`). Her görevin sonunda `npm run typecheck && npm test`; arayüz ve smoke görevlerinde ayrıca `npm run test:smoke`.
- **Plandan sapma:** plan kodu yazıldığı gibi çalışmazsa en küçük düzeltmeyi yap, devam et ve sapmayı `docs/m3/report.md` "Plandan sapmalar" altına yaz. Sapma spec'teki bir **kararı** (§4 K tablosu, mimari) değiştiriyorsa dur ve bana sor.
- **Son review:** bütün görevler bitince `superpowers:requesting-code-review` ile **tek bir** bağımsız code reviewer alt ajanı çalıştır; en yetenekli model, girdi tüm dalın diff'i. Workflow aracını kullanma. Bulguları düzelt, düzeltmeyi doğrula ve kararlarını rapora yaz.
- **Taş sonu** (runbook §3.5):
  - `docs/m3/report.md`: Varsayım · Sonuç · Kanıt · Spec'e etkisi; ayrıca Plandan sapmalar, Bilinen sınırlar, M4'e devredilenler.
  - Spec §18'i ve ilgili bölümleri yalnızca kanıtla keskinleştir.
  - Runbook'u güncelle: günlük işletim ve sorun giderme.
  - Roadmap'te M3 satırını "Tamamlandı" yap.
  - `main`'e `--no-ff` ile birleştir ve bana Türkçe rapor ver.
  - Sonra **dur**. M4 planını yazmayı öner ama ben "evet" demeden yazma.

## 6. Kapılar: burada dur ve bana sor

1. §3'teki ThinkingState sorusu (bir kez).
2. Spec §4'teki bir kararı değiştirecek her sapma.
3. Planda yazmayan **herhangi bir** silme ya da geri alınamaz işlem (DB volume'ü, kullanıcı dosyaları, `~/videogen-data` içeriği): önce hedefi göster, onay al.
4. Gerçek Claude kullanımı haiku ile birkaç küçük oturumu aşacaksa (ör. gerçek opus/sonnet turları): önce sor. Kullanımı izle; 5 saatlik pencere %80'i geçerse gerçek turları durdur ve bana söyle.
5. Boş disk 10 GB'ın altına inerse dur.

## 7. Önceden onaylanmış işlemler (yeniden sorma)

- `videogen-pg` container'ı (127.0.0.1:5433) ve volume'ü; test veritabanları (`vg_test_*`, `videogen_smoke`) oluşturup silmek.
- Haiku ile küçük `claude` probe'ları ve fixture kaydı. Yeni fixture kaydedersen `spikes/m0/redact.mjs` ile **bir kez** maskele, sızıntı kontrolünü çalıştır (kullanıcı adı, hostname, ev yolu, e-posta, thinking signature) ve commit edilmiş fixture'larda maskelemeyi **asla** yeniden çalıştırma; idempotent değil.
- Yeni migration'lar (0003+). Var olan migration'ları düzenleme; dev DB'ye uygulanmışlar.
- `npm install` ile yeni, tam sürüm sabitli bağımlılıklar (`^` yok).

## 8. Kesin yasaklar

- Ücretli API anahtarı kullanma, oluşturma ya da env'e koyma. `--bare` ve `bypassPermissions` kullanma.
- Kullanıcının gerçek Claude girişine ve `~/.claude/` ayarlarına dokunma: `claude config` yok, `claude mcp add` yok, settings.json düzenlemesi yok.
- `npx playwright install` çalıştırma; Playwright her zaman `channel: 'chrome'` kullanır.
- `pkill -f <desen>` kullanma; kendi kabuğunu öldürür. PID ile `kill` kullan. Başlattığın her sunucuyu ya da süreci bitirmeden önce PID ile durdur ve portları kontrol et (5173, 5180, 5190).
- `python/audio_service` içinde **`uv sync` / `uv pip sync` çalıştırma**: chatterbox'ı ve torch'u siler. M3'te ses servisine dokunmaya gerek yok.
- TikTok'a hiçbir şey gönderme (M6'ya kadar yayın yok).
- Fixture'lara, audit'e ve dokümanlara e-posta, org id, token, `.env` veya `tokens.json` içeriği, kullanıcı adı ya da mutlak ev yolu (`/home/<kullanıcı>`) yazma; `~` kullan.
- Repodaki `.env` kullanıcıya ait; okuma, değiştirme.
- **M1 dinleme testinin A/B eşlemesini** (`~/videogen-data/m1/listening/key.json`) hiçbir yerde açıklama. K17 kararı kullanıcıda bekliyor.

## 9. Bilinen tuzaklar

| Tuzak | Çözüm |
|---|---|
| npm 12 install script'lerini engeller | `npm approve-scripts <paket>` → `npm rebuild <paket>` |
| İç içe `claude`: "cannot be launched inside another Claude Code session" | `env -u CLAUDECODE ...`; üretim kodu `cleanChildEnv()` kullanır |
| TypeScript 7'de dosya adı argümanı TS5112 verir | `tsc -p tsconfig.json` |
| RAM dar (14 GB, swap dolu); her Claude süreci ~300 MB | Ağır işten önce `free -h`; testlerde gerçek süreç yerine FakeClaudeDriver |
| `@fastify/static` (`wildcard:false`) dosyaları açılışta tarar | Elle `npm run build` sonrası API'yi yeniden başlat; `npm start` her seferinde derler |
| Worker `vg_commands` LISTEN kopunca `exit(1)` | Başlatıcı yeniden başlatır (crash-only); yeni LISTEN istemcileri de aynı kalıba uyar |
| Yeni SSE bağlantısı geçmişi oynatmaz | İstemci açılışta REST'i tazeler; `Last-Event-ID` yalnızca yeniden bağlanmada |
| Smoke `videogen_smoke` DB'sini ve `/tmp/videogen-smoke-*` dizinlerini bir sonraki koşuya kadar bırakır | Bilinen sınır (M2 raporu §6); M3'te smoke genişlerken düzelt |
| `get_usage` deneysel API | Tek adaptörde kalır (`apps/worker/src/usage.ts`); SDK sürümü tam sabit |
| Orkestrasyon kullanım penceresini doldurabilir | Önceki taşlarda 5 saatlik pencere ~%75'e çıktı; gerçek Claude turlarını en aza indir |

## 10. Raporlama

- Plan yazılınca kısa bir not: dosya yolu, görev sayısı ve, bölündüyse, bölme gerekçesi.
- Taş sonunda ve her kapıda **Türkçe** rapor: **Maddeler / Doğrulama** (komut ve çıktı alıntısı) **/ Bilmen gerekenler**. Verdiğin her kararı "neden" ve "yanlışsa maliyeti" ile listele.
- Ara mesajlar kısa olsun: hangi görev, sonuç.

Başla.

---
