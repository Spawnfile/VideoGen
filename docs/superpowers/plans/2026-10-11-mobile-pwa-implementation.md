# Mobil PWA — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (kullanıcı inline yürütmeyi seçti, 2026-10-11). Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Biçim notu (kullanıcı kararı, 2026-10-07):** Bu plan kod bloğu içermez. Her görev dosyaları, arayüz imzalarını, testlerin adlarını ve beklentilerini, kabul ölçütlerini verir. Kodu yürütücü yazar.

**Goal:** VideoGen web arayüzünü, bütün mevcut işlevleriyle birlikte, İngilizce ve koyu temalı, telefonda ve PC'de çalışan duyarlı bir PWA'ya çevirmek ve Tailscale üzerinden `https://alper-pc.tailef7c0d.ts.net:8443` adresinde çalışır hâlde teslim etmek.

**Architecture:** Görünüm katmanı (`apps/web/src/lib/*-view.ts`) ve API sözleşmeleri korunur; kabuk (AppShell) kırılım noktalarına göre üç düzene ayrılır (telefon: üst çubuk + alt sekmeler; tablet: ray; masaüstü: etiketli kenar çubuğu + iki bölme). İngilizce metin web'de yaşar: paylaşılan etiketler (`packages/shared`) ajanlara da gittiği için değiştirilmez, web onları kimlikleriyle İngilizce haritalara çevirir. Erişim Tailscale Serve ile; API yalnızca loopback'i dinler, tailnet isteğini Host + Tailscale kimlik başlığıyla kabul eder. Servis çalışanı yalnızca uygulama kabuğunu önbelleğe alır; API, SSE ve Range istekleri ona hiç uğramaz.

**Tech Stack:** Node 24, TypeScript 7, React 19.3, Vite 8.3.2, Tailwind 4.3.3, TanStack Query 5, Fastify 5, Vitest, Playwright 1.63 (sistem Chrome), Tailscale 1.102.2. Yeni npm bağımlılığı yok. Migration yok.

**Spec:** `docs/superpowers/plans/2026-10-11-mobile-pwa.md` (tasarım ve araştırma; özellikle §1.4 kod tabanı kontrolü, §2 tasarım sistemi, §3 ekranlar ve sözlük, §6 kararlar) ve tıklanabilir prototip https://claude.ai/artifact/FJq8HJxJxMn8bYoRuKmcvV.

## Global Constraints
- Branch `mobile-pwa`, worktree `/home/alper/gpu-server/VideoGen-mobile`. Main'deki çalışan yığına (5180) dokunulmaz.
- Milestone adı kullanılmaz (M8 vb.); dosya ve başlıklar "mobile-pwa" adını taşır.
- `packages/shared`, `apps/worker`, `packages/claude`, `claude-plugin` değişmez (K6). İstisna yok.
- Arayüz metni İngilizce, cümle düzeninde, eylemler fiil (§3.5 sözlüğü). Video içeriği, ajan çıktıları ve worker notları Türkçe kalır.
- Yalnızca koyu tema; renkler `theme.css` tokenlarından; bileşenlerde sabit hex/rgb yok.
- Kırılımlar: < 768 telefon, 768–1199 tablet, ≥ 1200 masaüstü. 390 px'te hiçbir rotada yatay kaydırma yok. Dokunma hedefi ≥ 44 px (telefonda). Telefonda girdiler 16 px.
- API yalnızca `127.0.0.1`'i dinler. Tailnet erişimi yalnızca `VG_TAILNET_HOST` birebir eşleşmesi ve `VG_TAILNET_USERS` içindeki login ile. Funnel asla.
- Servis çalışanı `/api/*`, `/events`, Range'li ve GET dışı isteklere `respondWith` çağırmaz.
- Mevcut `data-testid` değerleri korunur (smoke testleri onlara bağlı).
- `npm test`, `npm run typecheck`, `npm run build` ve smoke (S1–S8 + yeni S9) yeşil biter.

## Review Focus
- **Telefon klavyesi açıkken girdi görünür kalmalı:** Üret alt sayfası ve sohbet girdisi `visualViewport` ile klavyenin üstünde kalır. Test: `viewport.test.ts` içinde `keyboardInset` (T5).
- **Uygulama arka plandan dönünce canlı veri kendiliğinden gelir:** SSE kopmuşsa görünür olunca backoff beklemeden yeniden açılır. Test: `live.test.ts` "visible reconnects without waiting for backoff" (T9).
- **Yeni sürüm kurulunca eski kabuk servis edilmez:** `index.html` ve `sw.js` `no-cache`; hash'li varlıklar `immutable`. Test: `static-cache.test.ts` (T9).
- **Tailnet'ten yazma isteği Origin'le geçer, sahte Host veya kimliksiz istek reddedilir:** Test: `guard.test.ts` tailnet vakaları (T1).
- **Paylaşılan pakete yeni adım/boyut/durum eklenirse arayüz Türkçe kimlik sızdırmaz:** Test: `i18n.test.ts` "every shared id has an English label" (T3).

---

### Task 1: Tailnet erişimi (config, guard, TikTok bağlama sınırı, `bin/tailnet.mjs`)

**Files:**
- Create: `apps/api/src/tailnet.ts` (tailnet ayarı API içinde okunur; `packages/shared/src/config.ts` değişmez).
- Modify: `apps/api/src/guard.ts`, `apps/api/src/app.ts` (guard çağrısı), `apps/api/src/routes/tiktok.ts` (bağlantı başlatma).
- Create: `bin/tailnet.mjs`, `bin/tailnet-status.mjs` (saf ayrıştırıcı, test için ayrı modül).
- Test: `apps/api/test/guard.test.ts`, `apps/api/test/tiktok.test.ts`, `apps/api/test/tailnet-status.test.ts`.

**Interfaces:**
- Produces: `tailnetConfig(env): { host: string | null; users: string[] }` (`VG_TAILNET_HOST`, `VG_TAILNET_USERS` virgüllü). `requestScope(headers, cfg): 'local' | 'tailnet' | null`. `registerGuard(app, cfg)` (cfg verilmezse eski davranış). Fastify isteğine `vgScope` süslemesi. `parseServeStatus(json, port): { served: boolean; target: string | null; funnel: boolean }`.

- [ ] Testleri yaz: "tailnet host + allowed login → 200", "tailnet host without login → 403 tailnet user not allowed", "tailnet host + other login → 403", "tailnet write with Origin https://host:8443 → accepted", "tailnet write with foreign Origin → 403", "tailnet not configured → 403 non-localhost Host", "uppercase host → 403", "host without port when configured with port → 403"; tiktok: "connect from tailnet scope → 409 connect_on_host"; status: funnel açık/kapalı, port eşleşmesi.
- [ ] Çalıştır, kırmızı gör.
- [ ] Uygula. Ret metinleri: mevcut `forbidden: non-localhost Host` ve `forbidden: cross-origin write` korunur; yeni `forbidden: tailnet user not allowed`.
- [ ] `bin/tailnet.mjs status|enable|disable`: `enable` = `sudo tailscale serve --bg --https=<port> http://127.0.0.1:<target>`; Funnel açıksa çıkış kodu 2.
- [ ] Testler yeşil; commit.

### Task 2: "Gece kâğıdı" teması ve `index.html`

**Files:** Modify `apps/web/src/styles/theme.css`, `apps/web/index.html`, `components/production/ProduceBar.tsx` (sabit teal gölge), `components/library/CompareView.tsx` (`accent-[#016a71]`), `bg-red … text-white` kullanan iki yıkıcı düğme (`DataSection.tsx`, `AssetTable.tsx`).

**Interfaces:** Produces tokenlar: `canvas paper inset line line-strong ink ink-2 ink-3 accent accent-glow green red hover hover-2 scrim`, `--radius-sheet`, `--tab-h`. `bg-red` üstünde metin `text-canvas`.

- [ ] §2.1 değerleri; `color-scheme: dark`; `-webkit-tap-highlight-color: transparent`; odak halkası `outline-accent-glow` (tüm `focus-visible:outline-ink` → `focus-visible:outline-accent-glow`).
- [ ] `index.html`: `lang="en"`, `viewport-fit=cover`, `theme-color #191815`, manifest ve apple-touch-icon linkleri (dosyalar T9'da).
- [ ] Kabul: `rg "#[0-9a-fA-F]{6}|rgb\(" apps/web/src --glob '*.tsx'` boş (SVG ikon dosyaları hariç değil: bileşenlerde de yok). Commit.

### Task 3: İngilizce katman (`i18n.ts`, `locale.ts`)

**Files:** Create `apps/web/src/lib/i18n.ts`, `apps/web/src/lib/locale.ts`. Test: `apps/web/test/i18n.test.ts`.

**Interfaces:**
- Produces: `STEP_EN`, `STEP_STATUS_EN`, `VIDEO_STATUS_EN`, `ROLE_EN`, `DURATION_SOURCE_EN`, `HOOK_PATTERN_EN`, `DIMENSION_EN`, `GATE_EN`, `DRAFT_CHECK_EN`, `QC_CHECK_EN`, `CHECKLIST_EN`, `PUBLICATION_STATUS_EN`, `REVIEWER_EN`; `score(n): string` (nokta ondalık, bir basamak), `windowLabel({minS,maxS}): string` ("30–45 s"), `percent(u): string` ("58%"), `markBlocker(checklist, ticked, url): string | null` (shared `canMarkPublished` ile aynı doğruluk, İngilizce metin). `locale.ts`: `LOCALE = 'en-GB'`, `TZ = 'Europe/Istanbul'`, `time(d)`, `dayMonth(d)`, `dateTime(d)`.
- [ ] Testler: "every shared id has an English label" (shared haritalarının anahtarları üzerinde döner: `STEP_LABELS`, `STEP_STATUS_LABEL`, `VIDEO_STATUS_LABEL`, `ROLE_LABELS`, `DURATION_SOURCE_LABELS`, `HOOK_PATTERN_LABELS`, `DIMENSIONS`, `GATES`, `DRAFT_CHECKS`, `QC_CHECKS`, checklist kimlikleri); "score uses a dot"; "markBlocker agrees with canMarkPublished" (dört vaka: eksik zorunlu madde, geçersiz URL, boş URL, hepsi tamam).
- [ ] Uygula; yeşil; commit.

### Task 4: Web görünüm katmanının İngilizceye çevrilmesi

**Files:** Modify `apps/web/src/lib/format.ts`, `production-view.ts`, `publish-view.ts`, `agent-view.ts`, `trace-view.ts`, `audit-view.ts`, `assets-view.ts`, `maintenance-view.ts`, `brief-view.ts`, `compare-view.ts`, `api.ts`, `player.ts` (`toLocaleLowerCase('tr')` → `toLowerCase()`), `production-view.ts:281` slug **'tr' korunur** (Türkçe ürün adı dosya adı). Test: `apps/web/test/*.test.ts` beklentileri İngilizceye.
- [ ] Önce testlerin beklentilerini §3.5 sözlüğüne göre İngilizceye çevir; kırmızı gör.
- [ ] Dosyaları çevir; `'tr-TR'` çağrıları `locale.ts`'e bağlanır.
- [ ] `npm test -- apps/web` yeşil; commit.

### Task 5: Duyarlı kabuk

**Files:** Create `apps/web/src/lib/nav.ts`, `apps/web/src/lib/viewport.ts`, `components/shell/TopBar.tsx`, `components/shell/TabBar.tsx`, `components/shell/SideNav.tsx` (NavRail'in yerini alır; tablette ikon rayı, masaüstünde etiketli), `components/shell/Sheet.tsx`, `components/shell/StatusSheet.tsx`, `lib/usage-view.ts` (UsageFooter'ın türetilmiş verisi). Modify `components/AppShell.tsx`, `components/UsageFooter.tsx`, `components/ConnectionBanner.tsx`, `main.tsx` (rota tablosu `/chat`). Delete `components/NavRail.tsx`. Test: `apps/web/test/nav.test.ts`, `apps/web/test/viewport.test.ts`.

**Interfaces:** `NAV_ITEMS` (Studio, Chat, Library, Audit log, Assets, Settings), `MOBILE_TABS` (Studio, Chat, Library, Settings), `activeTab(path): string`, `keyboardInset(innerHeight, vv: { height: number; offsetTop: number } | null): number`. `<Sheet open onClose title>` (`<dialog>` tabanlı).
- [ ] Testler: `activeTab('/audit') === '/settings'` (telefon), `activeTab('/library/x') === '/library'`, `activeTab('/chat') === '/chat'`; `keyboardInset` klavye kapalı 0, açık fark.
- [ ] Uygula. Telefonda footer gizli, üst çubukta durum hapı → StatusSheet. Masaüstünde footer görünür. `nav[aria-label="Main menu"]` her düzende bir tane görünür.
- [ ] Commit.

### Task 6: Stüdyo, Üret, Sohbet ve üretim kartları

**Files:** Modify `routes/Studio.tsx`, Create `routes/Chat.tsx`, Modify `components/production/*.tsx` (ProduceBar, ProductionPanel, VideoHeader, StepList, ArtifactCards, DraftTabs, DraftPlayer, QcCard, VoiceCard, AudioCard, ReviewPanel), `components/agents/*.tsx`, `components/chat/ChatPanel.tsx`, `components/thinking/*.tsx`, `components/publish/*.tsx`.
- [ ] ProduceBar üç görünüm: masaüstü üst çubuk (bugünkü), telefonda boş Stüdyo'da `hero`, video varken alttaki `docked` kutu → `Sheet` içinde tam form (ad, ses modu, süre, yönerge). `#product-name` her görünümde aynı girdi.
- [ ] Telefonda video çip satırı (Studio seçimi `?video=`), oynatıcı en çok `56dvh`, İnceleme paneli katlanır. Sohbet telefonda `/chat`, tablette Studio'da çekmece, masaüstünde sağ bölme; `/chat` masaüstünde Studio'ya yönlenir. "New chat" Studio seçimini temizler (`NO_VIDEO`).
- [ ] Bütün metinler İngilizce (sözlük). `window.confirm` metni İngilizce.
- [ ] Commit.

### Task 7: Kütüphane, ayrıntı, karşılaştırma

**Files:** `routes/Library.tsx`, `routes/LibraryDetail.tsx`, `components/library/*.tsx`. Test: `apps/web/test/compare-view.test.ts` ("narrow screens default to ab": `defaultMode(width)`).
- [ ] Liste satırları kıl çizgili; ayrıntıda geri oku; sekmeler yatay kayan çipler; telefonda Karşılaştır varsayılanı A/B, "Side by side" yalnızca ≥ 600 px genişlikte. Commit.

### Task 8: Ayarlar, Audit, Varlıklar ve API hata metinleri

**Files:** `routes/Settings.tsx`, `components/settings/*.tsx`, `routes/Audit.tsx`, `components/audit/*.tsx`, `routes/Assets.tsx`, `components/assets/*.tsx`, `apps/api/src/routes/*.ts` (49 Türkçe `error` metni), `apps/api/test/*.test.ts`.
- [ ] Ayarlar: telefonda gruplu satır listesi; satır → bölüm alt sayfası (`/settings#section` yerine yerel durum; geri düğmesi). Masaüstünde bugünkü uzun sayfa. "This device" grubu: Install app talimatı, sürüm (BUILD_ID), "Clear cached app" (SW kaydını siler, yeniler).
- [ ] Audit telefonda kart listesi; filtreler alt sayfada "Filter (n)" çipiyle; ayrıntı alt sayfada. Varlıklar kart listesi.
- [ ] TikTok bölümü tailnet'ten açıldıysa bağlama düğmesi yerine §3.4 metni (`location.hostname` loopback değilse).
- [ ] API metinlerini çevir, API testlerini güncelle; yeşil; commit.

### Task 9: PWA (manifest, ikonlar, servis çalışanı, önbellek, canlı bağlantı)

**Files:** Create `apps/web/public/manifest.webmanifest`, `apps/web/public/icons/*` (`bin/icons.mjs` ile `docs/mobile-pwa/icon/app-icon.svg`'den; favicon düz sürüm), `apps/web/public/sw.js`, `apps/web/src/lib/sw-routes.ts`, `apps/web/src/lib/sw-register.ts`, `components/shell/UpdateToast.tsx`, `components/shell/Unreachable.tsx`. Modify `apps/web/vite.config.ts` (`__BUILD_ID__` define), `apps/api/src/app.ts` (önbellek başlıkları), `apps/web/src/lib/live.ts` (visibility/pageshow). Test: `apps/web/test/sw-routes.test.ts`, `apps/api/test/static-cache.test.ts`, `apps/web/test/live.test.ts`.

**Interfaces:** `classify({ url, method, mode, headers }, origin): 'shell' | 'asset' | 'bypass'`; `sw.js` aynı tabloyu kullanır (test, `sw.js` metnindeki desenlerin `sw-routes.ts` ile aynı olduğunu doğrular).
- [ ] Testler: Range'li `/api/blobs` → bypass; `/events` → bypass; POST → bypass; `/assets/index-x.js` → asset; navigate `/library/x` → shell; başka origin → bypass. Statik: `index.html`/`sw.js`/manifest `no-cache`, `/assets/*` immutable, SPA fallback no-cache, manifest `application/manifest+json`. Live: gizliyken kopan bağlantı görünür olunca hemen açılır.
- [ ] Uygula; yeşil; commit.

### Task 10: Smoke testleri ve mobil proje

**Files:** `tests/smoke/*.spec.ts` (Türkçe seçicileri İngilizceye), `tests/smoke/playwright.config.ts` (proje `desktop` 1440×900 ve `mobile` 390×844 isMobile hasTouch), Create `tests/smoke/s9-mobile.spec.ts`.
- [ ] S1–S8 masaüstü projesinde yeşil; S9 mobil: sekmeler, Üret alt sayfasından üretim, sohbet, kütüphane ayrıntısı, ayarlar → audit satırı, her rotada `scrollWidth <= innerWidth`, manifest 200, SW `activated`.
- [ ] Commit.

### Task 11: Yayına alma ve doğrulama

**Files:** Create `bin/mobile-serve.sh` (branch API'sini 5181'de yaşayan kabukla başlatır, log `~/videogen-data/logs/mobile-api.log`), Modify `README.md` ("Phone access" bölümü), Create `docs/mobile-pwa/summary.md`, ekran görüntüleri `docs/mobile-pwa/*.png`.
- [ ] `npm run build`; API'yi `VG_PORT=5181 VG_TAILNET_HOST=alper-pc.tailef7c0d.ts.net:8443 VG_TAILNET_USERS=alper.ekmekci54@gmail.com` ile başlat; `node bin/tailnet.mjs enable --port 8443 --target 5181`.
- [ ] Doğrula: tailnet URL'sinden `curl` ile `/api/health` 200, manifest 200, `/events` akışı; Playwright ile tailnet URL'sinde mobil ekran görüntüsü.
- [ ] Commit.

### Task 12: Kendi incelemesi

- [ ] `code-review` skill'i (yüksek düzey) branch farkı üzerinde; bulguları düzelt; testleri yeniden koş; commit.
