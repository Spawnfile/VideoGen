# Mobil PWA (Tailscale üzerinden telefon, duyarlı arayüz, yalnızca koyu tema) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Görsel işlerde (T5–T10) frontend-design:frontend-design skill'i de yüklenir.
>
> **Biçim notu (kullanıcı kararı, 2026-10-07):** Bu plan kod bloğu içermez. Tel kafes (wireframe) blokları kod değil, ekran çizimidir. Her görev şunları verir: dosyalar, arayüz imzaları, gerçek kodda bakılacak yerler (`dosya:satır`, HEAD `5d718d1`), testlerin adları ve beklentileri, karar notları. Kodu yürütücü yazar. Satır numaraları kaymışsa sembol adıyla aranır.

**Goal:** VideoGen'i telefondan, ana ekrana kurulmuş bir uygulama gibi kullanmak. Ayrıntılar:
- **Erişim:** Tailnet içinden `https://alper-pc.tailef7c0d.ts.net:8443` (Tailscale Serve, gerçek TLS sertifikası). İnternete açılmaz (Funnel yok). API yine yalnızca `127.0.0.1`'i dinler.
- **PWA:** Web app manifest, servis çalışanı (service worker), ikonlar, iOS ve Android'de "Ana ekrana ekle", tam ekran (standalone) açılış, güncelleme bildirimi, "sunucuya ulaşılamıyor" ekranı.
- **Duyarlı arayüz:** Telefon (< 768 px) için alt sekme çubuğu ve tek sütun. Tablet (768–1199 px) için ray ve tek sütun, sohbet yan çekmecede. Masaüstü (≥ 1200 px) bugünkü iki bölmeli düzen.
- **Yalnızca koyu tema:** Perplexity referansının (parchment + tek teal) gece karşılığı: "Gece kâğıdı". Masaüstü dahil tek tema, açık tema yok.
- **Telefonda çalışmayan tek akış açıkça ele alınır:** TikTok hesabı bağlama (OAuth dönüşü `localhost:3455`'e gider), telefonda "bilgisayarda aç" açıklamasıyla kapalı. Yayınlama telefondan çalışır.
- **Arayüz dili İngilizce (kullanıcı kararı, 2026-10-11):** Ekranda görünen her metin İngilizce olur: menüler, düğmeler, durumlar, adım adları, puanlama boyutları, kalite kontrol etiketleri, API hata mesajları, tarih ve sayı biçimleri. **Video içeriği değişmez:** seslendirme, altyazı, TTS ve TikTok metinleri Türkçe kalır (hedef kitle). Ajanların ekrana yazdığı serbest metin (inceleme notları, sohbet yanıtları) için K5'e bakın. Ayrıntı: §3.5 ve F0.
- **Opsiyonel (F6, kullanıcı kararı):** Bildirimler (Web Push) ve uygulama rozeti.

**Architecture:**
- **Tek kod tabanı, tek origin.** SPA, API ve SSE aynı Fastify sürecinden servis edilmeye devam eder. Tailscale Serve yalnızca TLS sonlandırır ve `127.0.0.1:5180`'e ters vekil (reverse proxy) olur. Ayrı bir mobil uygulama, ayrı bir build veya ayrı bir port yok.
- **Güvenlik sınırı Tailscale kimliğidir.** Tailnet'ten gelen istek, Host başlığı yapılandırılmış tailnet adıyla birebir eşleşirse ve `Tailscale-User-Login` izin listesindeyse kabul edilir. Bu başlığı Tailscale gelen istekten siler ve WhoIs sonucundan yeniden yazar, bu yüzden tailnet istemcisi onu taklit edemez (kaynak: `ipn/ipnlocal/serve.go:1080–1105`, v1.102.2). Loopback davranışı aynen korunur.
- **Servis çalışanı API'ye dokunmaz.** Yalnızca uygulama kabuğunu (index.html, hash'li `/assets/*`, ikonlar, manifest) önbelleğe alır. `/api/*`, `/events`, `/api/blobs/*` (Range ile video) için `respondWith` çağrılmaz; tarayıcı doğrudan ağa gider. Böylece SSE akışı, Range istekleri ve canlı veri hiç etkilenmez.
- **Koyu tema token düzeyinde.** Bileşenler zaten `bg-canvas`, `text-ink`, `border-line` gibi token sınıfları kullanıyor. Sabit renk yalnızca iki yerde var (`ProduceBar.tsx` teal gölge, `CompareView.tsx` `#016a71`). Tema değişikliği büyük ölçüde `apps/web/src/styles/theme.css` içinde kalır.
- **Duyarlılık CSS ile, mantık değişmeden.** Görünüm katmanı (`lib/*-view.ts`) olduğu gibi kalır. Değişen şey kabuk (`AppShell`, yeni `TabBar`, `TopBar`, `Sheet`) ve sayfaların düzen sınıflarıdır. Telefonda farklı bir bileşen gerekiyorsa (tablo yerine kart listesi) aynı view fonksiyonunu tüketir.

**Tech Stack:** Mevcut (React 19.3, Vite 8.3.2, Tailwind 4.3.3, TanStack Query 5, Fastify 5, Playwright 1.63). **Yeni çalışma zamanı bağımlılığı yok:** servis çalışanı elle yazılır (yaklaşık 80 satır, aşağıdaki karar notu). Opsiyonel F6 için `web-push` gerekir. **Migration yok** (F6 seçilirse bir tane: `push_subscriptions`).

---

## 1. Araştırma bulguları

### 1.1 Tailscale Serve
- **Makinedeki durum (2026-10-11):** Tailscale 1.102.2 kurulu, cihaz `alper-pc`, tailnet adı `alper-pc.tailef7c0d.ts.net`. HTTPS sertifikaları zaten açık. **443 portunun kökü dolu:** `https://alper-pc.tailef7c0d.ts.net` → `http://127.0.0.1:8091`. VideoGen için önerilen port **8443**. Alternatif: 8091'i başka porta taşıyıp 443'ü VideoGen'e vermek (açık karar K2).
- **Komut (kalıcı, yeniden başlatmada geri gelir):** `tailscale serve --bg --https=8443 http://127.0.0.1:5180`. Durum: `tailscale serve status --json`. Kapatma: `tailscale serve --https=8443 off`. `--bg` ile kurulan yapılandırma `tailscale down/up` ve yeniden başlatmadan sonra da sürer.
- **Root gerekir:** Serve yapılandırması bu makinede `sudo` istiyor. Bir kez `sudo tailscale set --operator=$USER` çalıştırılınca kullanıcı adına yönetilebilir (T1 adım 1).
- **Host başlığı korunur:** `serve.go:978` `r.Out.Host = r.In.Host`. API'ye gelen Host `alper-pc.tailef7c0d.ts.net:8443` olur. Bugünkü `apps/api/src/guard.ts:5` `LOCAL_HOST` deseni bunu reddeder: **bugün Serve açılsa her istek 403 alır.** T2 bunu çözer.
- **Kimlik başlıkları:** Tailscale `Tailscale-User-Login`, `Tailscale-User-Name` ve `Tailscale-User-Profile-Pic` başlıklarını ekler. İstemciden gelen kopyaları önce siler (`serve.go:1080–1084`). Etiketli (tagged) cihazlarda bu başlıklar yoktur. Ayrıca `X-Forwarded-For`, `X-Forwarded-Host` ve `X-Forwarded-Proto: https` başlıklarını da ekler (`serve.go:1068–1075`).
- **SSE:** Serve, Go'nun `httputil.ReverseProxy`'sini kullanır (`serve.go:959`). Go bu proxy'de `text/event-stream` yanıtlarını beklemeden iletir. `/events` akışı tamponlanmaz. Gerçek ölçüm T1 adım 3'te yapılır, çünkü bu oturumda `sudo` olmadığı için deneme yarım kaldı.
- **Funnel asla:** Funnel uygulamayı internete açar. Başlatıcı, 8443 portunda Funnel açık görürse başlamayı reddeder (T3).

### 1.2 PWA platform gerçekleri (2026)
- **Güvenli bağlam şart:** Servis çalışanı ve kurulum yalnızca HTTPS'te çalışır. Tailscale Serve'ün `*.ts.net` sertifikası gerçek bir Let's Encrypt sertifikasıdır. Bu yüzden telefonda uyarısız açılır ve PWA olarak kurulabilir.
- **iOS 26:** Ana ekrana eklenen her site varsayılan olarak web uygulaması (standalone) açılır. iOS hâlâ manifest ikonları yerine `apple-touch-icon` (180×180 PNG) kullanır. `viewport-fit=cover` ve `env(safe-area-inset-*)` gerekir. Arka plan senkronizasyonu yoktur. Uygulama arka plana geçince SSE bağlantısı kesilir; öne gelince yeniden bağlanmak bizim işimizdir (T11).
- **iOS depolama ayrı:** Ana ekran uygulamasının depolaması Safari'den ayrıdır. Bizi etkilemez, çünkü oturum yok; kimlik Tailscale'den gelir.
- **iOS Web Push:** iOS 16.4'ten beri yalnızca kurulu uygulamada çalışır. İzin, kullanıcının dokunuşuyla istenmelidir. Bildirimler Apple/Google push servislerinden geçer: içerik şifrelidir, ama trafik makineden dışarı çıkar. Bu, projenin "yalnızca yerel" ilkesiyle çelişebilir; F6 bu yüzden opsiyonel (K3).
- **vite-plugin-pwa:** 2.0.0 sürümü Vite 8'i destekliyor (`peerDependencies.vite` `^8.0.0` içeriyor, `npm view` ile doğrulandı). Yine de kullanılmıyor, gerekçe T12'de.
- **Uzun sohbet ve oynatıcı:** `DraftPlayer` parçası 1,29 MB (`apps/web/dist/assets/DraftPlayer-*.js`), ana parça 550 KB. Tailnet içinde sorun değil. Remotion Player'ın iOS Safari'deki performansı gerçek cihazda ölçülür (R2).

### 1.3 Mevcut kodun mobil açıdan durumu
- `AppShell.tsx:7` sabit `grid-cols-[56px_1fr]`. `Studio.tsx:27` sabit `minmax(420px,44%)`, yani 390 px telefonda yatay kaydırma olur. `UsageFooter` tek satır ve çok geniş.
- `index.html`'de `theme-color`, `apple-touch-icon` ve `viewport-fit=cover` yok. Manifest de yok.
- `<video>` öğelerinde `playsInline` zaten var (`DraftTabs.tsx:33`, `CompareView.tsx:94`).
- `live.ts:86–140` yeniden bağlanma ve backoff mantığı sağlam. `main.tsx:25` `onOpen` her bağlantıda sorguları tazeliyor. Eksik olan tek şey `visibilitychange` ile backoff'u atlayıp hemen bağlanmak.
- TikTok PKCE dönüşü `http://localhost:3455/callback/` (`apps/api/src/routes/tiktok.ts:47`). Telefondan açılırsa dönüş telefonun localhost'una gider ve başarısız olur.
- Kaynaklar (önceden kapanmış): [tailscale serve komutu](https://tailscale.com/docs/reference/tailscale-cli/serve.md), [Tailscale Serve KB](https://tailscale.com/kb/1312/serve), [Tailscale serve.go v1.102.2](https://github.com/tailscale/tailscale/blob/v1.102.2/ipn/ipnlocal/serve.go), [vite-plugin-pwa #923](https://github.com/vite-pwa/vite-plugin-pwa/issues/923), [PWA iOS sınırlamaları (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide), [iOS 2026 Web Push](https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=en).

---

### 1.4 Kod tabanının yeniden kontrolü (2026-10-11, HEAD `802ab2c`)
Başka bir agent bu planın ardından main'e müzik ve yönerge işlerini ekledi (`b956b3e`…`802ab2c`). Arayüzü etkileyenler:
- **Yeni Ses parçaları kartı** (`apps/web/src/components/production/AudioCard.tsx`): müzik, seslendirme ve efekt stem'leri dinlenir ve FLAC olarak indirilir; bestecinin notası tek satırda; "Sesi ajanlarla düzenle" (`api.audioEdit`) `audio_edit` türünde yeni bir run açar. Mobil tasarım bu kartı kapsar.
- **Ses incelemecisi (`reviewer_audio`):** İnceleme panelinde dördüncü incelemeci. Rubric etiketleri değişti (D6 ölçüm ve ses olarak ikiye bölündü).
- **Yönerge ve süre penceresi** (`ProduceBar` + `brief-view.ts`): Otomatik/Elle süre, en az/en çok saniye, 1000 karakterlik yönerge. Telefondaki "Yeni video" alt sayfası bunların hepsini taşır.
- **"Yeni sohbet" Stüdyo'nun seçili videosunu da temizler** (`ChatPanel` → `onNewThread`). Sohbet ayrı rotaya taşınınca bu bağ korunur.
- **Paylaşılan etiketler ajanlara da gidiyor.** `STEP_LABELS`, `ROLE_LABELS`, `DURATION_SOURCE_LABELS`, `HOOK_PATTERN_LABELS`, `formatWindow`, `formatScore` ve `label_tr` alanları worker promptlarında ve TikTok açıklamasında kullanılıyor (`apps/worker/src/pipeline/steps.ts`, `review-prompts.ts`, `fixer.ts`, `render/qc-cli.ts`, `packages/shared/src/publish.ts`). **F0'daki "shared etiketlerini çevir" adımı bu yüzden iptal edildi.** İngilizce etiketler web'de, aynı kimliklere bağlı ayrı bir katmanda tutulur (`apps/web/src/lib/i18n.ts`). Bir test, shared'daki her kimliğin İngilizce karşılığı olduğunu doğrular; shared'a yeni bir adım ya da boyut eklenince test kırılır. Ajan ve video tarafı değişmez.
- **Sunucunun yazdığı serbest metin:** Worker'ın `statusNote`, adım notları ve hataları ile ajan çıktıları (özetler, bulgular, iddialar, `_tr` alanları) Türkçe kalır (K5, sonraki iş). API'nin kullanıcıya döndürdüğü 49 hata metni yalnızca arayüze gittiği için İngilizceye çevrilir.
- **Ortam:** Makinede şifresiz `sudo` var. Kullanıcının `npm start` yığını main'den 5180'de çalışıyor; branch API'si bu yüzden **5181**'de ayrı çalışır, aynı veritabanını ve aynı worker'ı kullanır (migration yok; `vg_commands` aynı worker'a gider). Tailnet adresi `https://alper-pc.tailef7c0d.ts.net:8443` → `127.0.0.1:5181`; merge'den sonra hedef 5180'e çevrilir. İzinli login: `alper.ekmekci54@gmail.com`.
- **API ebeveynini izliyor** (`packages/shared/src/parent-watch.ts`): ebeveyn ölünce kapanır. Branch API'si bu yüzden yaşayan bir kabuk sarmalayıcıyla başlatılır.

## 2. Tasarım sistemi: "Gece kâğıdı"

**Fikir:** Perplexity'nin "cam arkasında akademisyen parşömeni" fikrinin gece hâli: ışığı kısılmış bir çalışma masası. Zemin nötr siyah ya da soğuk gri değil, referanstaki Ink'in (`#27251e`) kahverengi alt tonunu taşıyan sıcak grafit. Metin referansın parşömen rengi. Teal referanstaki marka teal'i ve yine yalnızca dolgu ve seçili durumda kullanılır. İkinci bir kromatik vurgu yok.

### 2.1 Renk tokenları (aynı adlar korunur, değerler değişir)
| Token | Değer | Rol | Kontrast |
|---|---|---|---|
| `--color-canvas` | `#191815` | Sayfa zemini, kabuk | — |
| `--color-paper` | `#211f1b` | Kart yüzeyi (referanstaki Soft Paper'ın bir basamak üstü) | — |
| `--color-inset` | `#2a2823` | Girdi, alt sayfa (sheet), çip zemini, ilerleme yuvası | — |
| `--color-line` | `#38362f` | Kıl çizgi (kart, ayırıcı) | dekoratif |
| `--color-line-strong` | `#4d4a42` | Kontrol kenarı (ghost button, select) | Kontrol tanımı inset dolgusuyla birlikte sağlanır |
| `--color-ink` | `#ece7de` | Birincil metin, ikon (referansın parşömeni metne döner) | canvas 14,4 · paper 13,4 |
| `--color-ink-2` | `#a8a49a` | İkincil metin, pasif sekme, ikon | canvas 7,1 · inset 5,9 |
| `--color-ink-3` | `#8c887e` | Yardımcı metin, zaman damgası | canvas 5,0 · inset 4,2 → inset üstünde yalnızca ≥ 14 px |
| `--color-accent` | `#016a71` | Etkin sekme dolgusu, seçili çip, "yeni" rozeti, Üret düğmesi | Üstünde `#ffffff` 6,4 |
| `--color-accent-glow` | `#2fa3aa` | Yalnızca metin dışı: odak halkası, ilerleme dolgusu, Üret kutusu ışıması | canvas 5,9 · inset 4,9 |
| `--color-green` | `#6fae8a` | "geçti" ve canlı durum noktası | canvas 6,9 |
| `--color-red` | `#e08a76` | Hata, başarısız kontrol | canvas 6,8 |
| `--color-hover` / `--color-hover-2` | `rgb(236 231 222 / .05)` / `/ .08` | Hover ve basılı durum | — |
- `color-scheme: dark` kök öğede tanımlanır, böylece select, kaydırma çubuğu ve tarih seçici de koyu olur. `<meta name="theme-color" content="#191815">`.
- **Gölge yok.** Referans tek bir 1 px gölgeye izin veriyor; koyu zeminde gölge görünmez. Katmanlama yüzey basamaklarıyla (canvas → paper → inset) yapılır. Alt sayfa (sheet) üstte `--color-line` kıl çizgisi ve canvas'ın %60'ı opaklığında bir arka plan perdesi kullanır.

### 2.2 Tipografi
- **Inter 400/500** (mevcut `@fontsource/inter`, referansın pplxSans yerine önerdiği yazı tipi). Ağırlık en fazla 500 olur; hiyerarşi renk ve boşlukla kurulur.
- Ölçek: 11 (sekme etiketi, rozet) · 12 (meta) · 14 (arayüz, gövde) · **16 (tüm girdiler; iOS 16 px altında odaklanınca yakınlaştırır)** · 20/500 (telefonda sayfa başlığı; referansta karşılığı olmayan tek ekleme, üst çubuk için gerekli).
- Puan, yüzde ve süreler `font-variant-numeric: tabular-nums`. Böylece canlı ilerleme sayıları titremez.
- Etiketlerde BÜYÜK HARF yok, cümle düzeni kullanılır (referansın "Sidebar Section Label"ı gibi).

### 2.3 Şekil, boşluk, dokunma
- Yarıçaplar referanstaki gibi: kart 16, girdi ve dolgulu düğme 12, ghost düğme 6, çip ve rozet tam yuvarlak. Alt sayfanın üst köşeleri 20 (telefonda tek ek).
- Taban 4 px. Telefonda kenar boşluğu 16, kart iç boşluğu 16, öğe aralığı 8, bölüm aralığı 24 (masaüstünde 32).
- **Dokunma hedefi en az 44×44.** Görünen çip 32 px yüksek olabilir; dokunma alanı dolgu ya da yalancı öğeyle 44'e tamamlanır.
- Hareket: yalnızca kullanıcı eylemine yanıt olarak. Alt sayfa 220 ms ease-out ile kayar, sekme değişiminde hareket yok. `prefers-reduced-motion` zaten `theme.css:43`'te.

### 2.4 Tek cesur öğe: Üret kutusu
Perplexity'de arama kutusu sayfanın odak noktasıdır. VideoGen'de bunun karşılığı **Üret kutusu** (`ProduceBar`). Telefonda başparmak bölgesine, alt sekme çubuğunun hemen üstüne yerleşir. `--color-accent-glow`'un %35'iyle 1 px kenar ve 24 px yumuşak ışıma alır; bu, uygulamadaki tek ışıma efektidir. Geri kalan her şey sessizdir: düz yüzeyler, kıl çizgiler, gölgesiz.

### 2.5 Uygulama ikonu (kullanıcı isteği, 2026-10-11: profesyonel, parlak, "AI slop" değil)
- **Ana dosya:** `docs/mobile-pwa/icon/app-icon.svg` (1024×1024, elle çizilmiş vektör). Önizleme: `docs/mobile-pwa/icon/app-icon-preview.png` (1024, 180, 60, 40 px, açık duvar kâğıdı, Android dairesel maske).
- **Kavram:** Ürünün kendisi: dikey (9:16) bir video karesi, arkasında yelpaze gibi açılmış iki storyboard karesi. Öndeki kare teal camdır ve güvenli alanda iki altyazı satırı taşır. Arkadakiler fildişi emayedir. Bu, mevcut favicon'daki "üç katman, ortadaki teal" fikrinin malzemeye dönüşmüş hâlidir; marka sürekliliği korunur.
- **Parlaklık nasıl kuruldu:** Tek ışık kaynağı (sol üst). Zemin sıcak grafit, üstten aşağı kararıyor ve sol üstte zayıf bir anahtar ışığı var. Karolarda 1 px kenar ışığı yalnızca üst kenarda. Cam karede çapraz, yumuşak bir yansıma ve altta camın içinden kırılan teal ışık var; zemine de teal bir ışık düşüyor. Emaye karelerde üst kenar parlaması ve gerçekçi düşen gölge. Tüm yansımalar aynı yönden geldiği için nesne "fotoğraflanmış" gibi okunur.
- **Bilinçli olarak kaçınılanlar:** Gökkuşağı/mor-mavi gradyan, ✨ kıvılcım, oynat üçgeni, neon dış ışıma, cam "blob", 3B harf "V". İlk taslakta üç yatay çubuk kullanılmıştı; büyük boyutta bile hamburger menü gibi okunduğu ve jel bandı 2008 "aqua" düğmesine benzediği için atıldı.
- **Küçük boyut kuralı:** 48 px ve altında (favicon 16/32, Android bildirim simgesi) parlaklık okunmaz. Bunun için ayrı, düz bir sürüm kullanılır: aynı üç kare silüeti, düz renk, yansıma ve gölge yok. `favicon.svg` bu düz sürümle değiştirilir. Tarayıcı sekmesi koyu ve açık temada ayrı test edilir.
- **Üretim:** `bin/icons.mjs`, sistem Chrome ile şu PNG'leri basar: `icon-192`, `icon-512`, `icon-maskable-512` (tam taşma; köşe yuvarlatması yok, zemin kenara kadar), `apple-touch-icon-180` (tam kare; iOS köşeyi kendisi keser), `favicon-32`. Ana SVG'deki köşe yuvarlatması (`rx=228`) yalnızca önizleme içindir; maskable ve apple sürümlerinde kaldırılır.
- **Kabul:** 40 px'te "dikey video karesi" okunuyor; hamburger, pil veya kart destesi gibi okunmuyor (kullanıcı onayı). iOS ana ekranında koyu ve açık duvar kâğıdında, Android'de daire ve squircle maskelerinde gerçek cihazda kontrol edilir (T17).

### 2.6 Varsayılanlara karşı gözden geçirme
- **"Neredeyse siyah + tek parlak vurgu" kalıbı riski:** Koyu tema ve teal brief'in kendisinden geliyor. Kalıba düşmemek için zemin `#111` gibi nötr değil, Ink ailesinden sıcak grafit seçildi. Teal neon/asit tonu değil, referansın koyu `#016a71`'i; açık teal (`#2fa3aa`) metin olarak hiç kullanılmıyor.
- **SaaS kart kiti riski:** Her şeyi aynı karta bölmemek için telefonda liste satırları (Ayarlar, Kütüphane) kart değil, kıl çizgiyle ayrılmış satırlar oluyor. Kart yalnızca bağımsız birimlere verilir: video, inceleme, ajan. Yarıçap hiyerarşisi (16/12/6/tam) korunur.
- **Şablon süsleri:** Etiketlerin üstüne "eyebrow" yok. Düğme metinlerinin sonuna "→" yok. Numaralı işaretçi yalnızca gerçekten sıralı olan üretim adımlarında (`StepList`) var.

---

## 3. Bilgi mimarisi ve ekranlar

### 3.1 Kırılım noktaları
| Genişlik | Kabuk | Stüdyo | Sohbet |
|---|---|---|---|
| < 768 (telefon) | Üst çubuk + alt sekme çubuğu | Tek sütun, Üret kutusu altta | Kendi sekmesi, tam ekran |
| 768–1199 (tablet, telefon yatay) | Sol ray (56 px) + üst çubuk yok, durum altta | Tek sütun | Sağdan açılan çekmece (420 px) |
| ≥ 1200 (masaüstü) | Bugünkü kabuk | Bugünkü iki bölme | Sağ bölme |

### 3.2 Sekmeler (telefon)
Dört sekme: **Stüdyo · Sohbet · Kütüphane · Ayarlar**. Audit ve Varlıklar telefonda Ayarlar'ın içinde "Kayıtlar ve varlıklar" grubunda iki satır olarak durur; URL'leri (`/audit`, `/assets`) aynı kalır. Etkin sekme: ikonun arkasında 56×32 teal hap (referanstaki Sidebar Nav Item'ın etkin dolgusu), altında 11 px etiket. Sohbet sekmesi canlı bir yanıt akarken ikon üstünde 6 px yeşil nokta gösterir.

### 3.3 Tel kafesler (390 × 844, güvenli alanlar dahil)

Stüdyo — etkin bir üretim varken:
```
┌──────────────────────────────────────┐
│ ░ durum çubuğu (safe-area-top)       │
│ Stüdyo                  ● %58  5 sa  │  ← üst çubuk; hap → durum sayfası
├──────────────────────────────────────┤
│ (Tükenmez kalem) (Termos) (+2)       │  ← yatay kayan video çipleri
│ ┌──────────────────────────────────┐ │
│ │ Tükenmez kalem    yayına hazır   │ │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━  %100  │ │
│ │ 1 Araştırma ✓ 2 Storyboard ✓ …   │ │  ← StepList (gerçek sıra)
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │       ┌────────────┐             │ │
│ │       │   9:16     │             │ │  ← taslak oynatıcı, en çok 56dvh
│ │       │  oynatıcı  │             │ │
│ │       └────────────┘             │ │
│ │ İnceleme 87,5 puan   tur 1  ⌄    │ │  ← katlanır; açınca boyut çubukları
│ └──────────────────────────────────┘ │
│ Ajanlar  (3 çalışıyor)           ⌄  │
├──────────────────────────────────────┤
│ ╭──────────────────────────────────╮ │
│ │ Ürün adı, ör. tükenmez kalem  ⊕ │ │  ← Üret kutusu (teal ışıma)
│ ╰──────────────────────────────────╯ │
├──────────────────────────────────────┤
│  ▣ Stüdyo  ◌ Sohbet  ▥ Kütüp. ≡ Ayar │  ← sekme çubuğu + safe-area-bottom
└──────────────────────────────────────┘
```

Stüdyo — hiç video yokken (ilk açılış): Üret kutusu ekranın ortasına çıkar, Perplexity ana sayfası gibi. Altında iki satır örnek ("Tükenmez kalem", "Termos") olur; dokununca kutuyu doldurur.

Üret kutusuna dokununca — alt sayfa:
```
┌──────────────────────────────────────┐
│               ───                    │
│ Yeni video                           │
│ ╭──────────────────────────────────╮ │
│ │ Ürün adı                         │ │
│ ╰──────────────────────────────────╯ │
│ (Seslendirmesiz)  (Seslendirmeli)    │
│ Süre  30–45 sn                    ⌄  │  ← üretim brief'i / süre penceresi
│ Brief (isteğe bağlı)              ⌄  │
│ ┌──────────────────────────────────┐ │
│ │              Üret                │ │  ← tam genişlik, accent dolgu
│ └──────────────────────────────────┘ │
│ ░ klavye                             │
└──────────────────────────────────────┘
```

Sohbet:
```
┌──────────────────────────────────────┐
│ Sohbet: Tükenmez kalem  ⌄   Yeni     │  ← konu seçici üst sayfa açar
│ (Soru) (Analiz et) (Düzelt)          │
│                                      │
│  akış: düşünme izleri katlanmış,     │
│  araç çağrıları tek satır özet,      │
│  dokununca tam ekran iz görünümü     │
│                                      │
│ ╭──────────────────────────────────╮ │
│ │ Bir şey sorun…              ↑    │ │  ← visualViewport ile klavyeye yapışır
│ ╰──────────────────────────────────╯ │
│  ▣  ◉  ▥  ≡                          │
└──────────────────────────────────────┘
```

Kütüphane listesi: Satırda solda 56×100 küçük 9:16 kare (son sürümün ilk karesi; poster yoksa canvas üstünde ürünün baş harfi), ortada ad ve durum çipi, sağda puan. Kıl çizgiyle ayrılmış satırlar, kart yok.

Kütüphane detayı: Geri oku ve ad üst çubukta. Sekmeler (Sürümler · Review'lar · Storyboard · Araştırma · Audit · Yayın) yatay kayan çip satırı olur. Karşılaştır telefonda **A/B varsayılan**: iki 9:16 video 390 px'e yan yana sığmaz. "Yan yana" yalnızca yatay yönde etkin olur. Puan farkı tablosunda üç sayı sütunu korunur, boyut adları tek satıra kısaltılmaz, satır sarar.

Ayarlar: iOS benzeri gruplu satırlar, her satır alt sayfaya iter (push).
- *Hesap ve kullanım:* Claude, Kullanım
- *Kanal:* Kanal kimliği, Anlatıcı sesi, Güvenli alan, TikTok
- *Ajanlar:* Roller
- *Kayıtlar ve varlıklar:* Audit, Varlıklar
- *Veri ve yedek*
- *Bu cihaz:* Uygulamayı kur (yalnızca kurulmamışsa), Sürüm, Bildirimler (F6)

Durum sayfası (üst çubuktaki haptan): Bugünkü `UsageFooter` içeriği dikey olarak gösterilir: Claude bağlantısı ve plan, 5 saatlik ve 7 günlük pencere çubukları ve sıfırlanma saatleri, disk boşluğu, worker durumu. Bağlantı yoksa hap kırmızı noktalı "Bağlantı yok" olur ve `ConnectionBanner` üst çubuğun altında ince bir şerit olarak görünür.

### 3.4 Metin dili
> §3.3'teki tel kafeslerde etiketler Türkçe çizildi; uygulamada §3.5 sözlüğündeki İngilizce karşılıkları kullanılır.
- Eylemler fiil ve cümle düzeninde: "Create video", "Send", "Publish", "Install app", "Reload".
- Güncelleme: "A new version is ready." + düğme "Reload".
- Ulaşılamıyor ekranı: "Can't reach the VideoGen server. Check that Tailscale is on for this phone and that the computer is awake." + düğme "Try again". Özür yok, belirsiz ifade yok.
- TikTok bağlama telefonda: "To connect your TikTok account, open VideoGen on this computer. Once it's connected, you can publish from your phone."

### 3.5 Arayüz dili: İngilizce
- **Yöntem:** i18n kütüphanesi yok. Tek dil hedefleniyor, bu yüzden metinler yerinde çevrilir (YAGNI; ikinci bir dil gelirse o gün `t()` katmanı eklenir). Tutarlılığı aşağıdaki sözlük sağlar: bir eylem her yerde aynı adı taşır ("Publish" düğmesi → "Published" bildirimi).
- **Biçimler:** Tek modül `apps/web/src/lib/locale.ts`: `LOCALE = 'en-GB'` (24 saat, "6 Oct 02:00"), `TZ = 'Europe/Istanbul'` korunur. Ondalık nokta ("87.5 points"); yüzde sayıdan sonra ("58%"). Bugün 11 yerde dağınık duran `'tr-TR'` çağrıları (`format.ts`, `audit-view.ts`, `agent-view.ts`, `publish-view.ts`, `maintenance-view.ts`, `PublishHistory.tsx`, `SafeAreaSection.tsx`, `AuditDetail.tsx`) bu modüle bağlanır.
- **Dokunulmayacaklar:** Türkçe **içerik** işleyen kod `'tr'` locale'ini korur: `packages/shared/src/voice.ts:313` (hece sayımı), `production.ts:60`, TTS ve CER ölçümü, altyazı. Klavye kısayolları (`player.ts:42`, `CompareView.tsx:62`) `toLowerCase()`'e döner.
- **Sözlük (çekirdek):**

| Türkçe (bugün) | İngilizce |
|---|---|
| Stüdyo · Kütüphane · Sohbet · Ayarlar · Varlıklar · Audit | Studio · Library · Chat · Settings · Assets · Audit log |
| Üret / Yeni video | Create video / New video |
| Ürün adı, ör. tükenmez kalem | Product name, e.g. ballpoint pen |
| Seslendirmesiz / Seslendirmeli | No voiceover / With voiceover |
| sırada · üretiliyor · yayına hazır · insan gerekli · başarısız · durduruldu · yayında | Queued · In production · Ready to publish · Needs you · Failed · Stopped · Published |
| bekliyor · çalışıyor · GPU bekliyor · limit bekleniyor · disk bekleniyor | Waiting · Running · Waiting for GPU · Waiting for usage limit · Waiting for disk space |
| Araştırma · Storyboard · Seslendirme · Müzik · Sahne kurulumu · Taslak render · Taslak incelemesi · Final render · Birleştirme · Otomatik kontrol · İnceleme · Sonlandırma | Research · Storyboard · Voiceover · Music · Scene build · Draft render · Draft review · Final render · Compose · Automatic checks · Review · Finalize |
| İnceleme 87,5 puan · tur 1 | Review 87.5 points · round 1 |
| Kanca · Görsel zanaat · Hareket ve tempo · Bilgi ve doğruluk · Tipografi ve etiketler · Ses · Teknik cila · Döngü ve izlenme · Özgünlük | Hook · Visual craft · Motion and pacing · Facts and accuracy · Type and labels · Sound · Technical polish · Loop and retention · Originality |
| Teslim · Doğruluk · Haklar · Beyan · Güvenlik · Güvenli alan | Delivery · Accuracy · Rights · Disclosure · Safety · Safe area |
| Düzeltme turu 1/3 | Fix round 1/3 |
| Sürümler · Karşılaştır · Yan yana · Müzikli/Müziksiz | Versions · Compare · Side by side · With music / No music |
| Claude bağlı · Worker canlı · 5 sa · 7 gün · …'de sıfırlanır | Claude connected · Worker live · 5 h · 7 d · Resets at … |
| Soru · Analiz et · Düzelt · Yeni sohbet · Bir şey sorun… | Ask · Analyze · Fix · New chat · Ask anything… |

- **Bilinçli olarak İngilizceleştirilmeyenler:** Ürün adları ve kullanıcının yazdığı her şey; Türkçe video başlıkları ve altyazılar; audit satırlarındaki ham olay gövdeleri (JSON).

---

## 4. Görevler

### F0 — Arayüz dili (İngilizce)

#### T0a: Paylaşılan etiketler ve API hata mesajları
- **Dosyalar:** `packages/shared/src/pipeline.ts:13–14, 126–129` (adım ve durum adları), `rubric.ts` (`label_tr` → `label`), `qc.ts` (`label_tr` → `label`), `agents.ts:9–13` (rol adları), `publish.ts:60–63` (teslim denetimi mesajları), `voice.ts` doğrulama mesajları (yalnızca ekrana çıkanlar), `progress.ts`, `review.ts`, `fix-loop.ts`, `assets.ts`, `safe-area.ts`; API: `apps/api/src/routes/*.ts` içindeki 45 Türkçe `error:` metni.
- **Kural:** Alan adı `label_tr` → `label` olarak yeniden adlandırılır. **Önce kontrol:** `rg "label_tr"` ile bu alanın DB'ye veya artefakt JSON'una yazılıp yazılmadığına bakılır. Yazılıyorsa eski kayıtlar için okuma sırasında `label ?? label_tr` uyumluluğu bırakılır ve migration yapılmaz.
- **Ajan promptları bu görevde değişmez** (K5).
- **Testler:** Etiket ve mesajlara bakan birim testleri İngilizce beklentiyle güncellenir (14 web test dosyası, `apps/api/test/*`). Yeni bir test eklenir: `test/no-turkish-ui.test.ts`, `apps/web/src` altındaki `.tsx` dosyalarında JSX metni ve `aria-label`/`title`/`placeholder` değerlerinde Türkçe karakter (`[çğıöşüÇĞİÖŞÜ]`) olmadığını tarar. Yorum satırları hariç tutulur.

#### T0b: Web arayüzü metinleri ve biçimler
- **Dosyalar:** `apps/web/src` altında Türkçe içeren 54 dosya (yaklaşık 380 satır), yeni `lib/locale.ts`, `apps/web/index.html` (`lang="en"`).
- **Sıra:** T0a'dan sonra (etiketler oradan geliyor). T5'ten önce ya da birlikte, böylece ekran görüntüleri bir kez üretilir.
- **Smoke:** `tests/smoke/*.ts` içindeki 147 Türkçe seçici İngilizceye çevrilir. Mümkün olan yerlerde metin yerine rol ve `aria-label` ile seçilir, böylece gelecekteki metin değişiklikleri testi kırmaz.
- **Kabul:** `no-turkish-ui` testi yeşil; S1–S9 yeşil; ekran görüntülerinde Türkçe arayüz metni yok (video içeriği hariç).

### F1 — Erişim (Tailscale)

#### T1: Tailscale ön koşulları ve ölçüm (makinede, kullanıcıyla)
- [ ] `sudo tailscale set --operator=$USER` (bir kez; sonrası sudo'suz).
- [ ] Geçici yankı (echo) sunucusuyla 8443'te Serve kurulur. Doğrulanır: Host = `alper-pc.tailef7c0d.ts.net:8443`; istemcinin gönderdiği sahte `Tailscale-User-Login` sunucuya ulaşmıyor; gerçek değer `alper.ekmekci54@…` biçiminde geliyor; `X-Forwarded-Proto: https` geliyor.
- [ ] SSE ölçümü: 700 ms aralıklı 5 olay telefondan (ya da başka bir tailnet cihazından) zamanlamasıyla alınır. Kabul: her olay en geç 150 ms sapmayla ulaşır (tamponlama yok).
- [ ] Bulgular `docs/mobile-pwa/tailscale-check.md`'ye yazılır. Serve ayarı kaldırılır.

#### T2: İstek koruması (guard) tailnet adını tanır
- **Dosyalar:** `apps/api/src/guard.ts`, `packages/shared/src/config.ts`, `apps/api/test/guard.test.ts`.
- **Config:** `tailnet: { host: string | null; users: string[] }`. Ortam değişkenleri `VG_TAILNET_HOST` (portlu tam ad, ör. `alper-pc.tailef7c0d.ts.net:8443`) ve `VG_TAILNET_USERS` (virgüllü login listesi). Biri boşsa tailnet erişimi kapalı (bugünkü davranış). `host: '127.0.0.1'` literal tipi **değişmez**: API yine yalnızca loopback'i dinler.
- **İmzalar:** `hostIsLocal` aynen kalır; yanına `requestScope(headers, cfg): 'local' | 'tailnet' | null` eklenir. `'tailnet'`: Host birebir `cfg.tailnet.host` (büyük-küçük harf duyarlı, `LOCAL_HOST` gibi kapalı başarısızlık) **ve** `tailscale-user-login` başlığı `users` içinde. Yazma isteklerinde Origin `https://<tailnet.host>` olmalı (port dahil). `registerGuard(app, cfg)` imzası config alır; çağrı yeri `apps/api/src/app.ts`.
- **Ret metinleri:** `forbidden: non-localhost Host` korunur (mevcut testler buna bakıyor). Yenileri: `forbidden: tailnet user not allowed`, `forbidden: cross-origin write`.
- **Audit:** Tailnet'ten gelen yazmalarda audit `meta.via = 'tailnet'` ve `meta.login` yazılır. Bakılacak yer: `appendAudit` çağrılarının ortak yolu yoksa `onRequest` hook'unda `req.vgScope` süslemesi yapılır, `appendAudit` aktör alanına ekler. Kapsam: yalnızca API'nin yazdığı kullanıcı eylemleri.
- **Testler (`guard.test.ts`):** "tailnet host + izinli login → 200"; "tailnet host + login yok → 403"; "tailnet host + izinsiz login → 403"; "tailnet host + yazma + Origin https://tailnet:8443 → kabul"; "tailnet host + yazma + Origin http://evil → 403"; "tailnet host yapılandırılmamış → bugünkü 403"; "Host büyük harfle → 403"; "Host portsuz → 403".

#### T3: Başlatıcıda tailnet adımı ve `bin/tailnet.mjs`
- **Dosyalar:** `bin/tailnet.mjs` (yeni), `npm start` başlatıcısı (`bin/` altındaki launcher; README "Quick start" bölümünden bulunur), `README.md`.
- **Komutlar:** `node bin/tailnet.mjs status | enable | disable`. `enable`: `tailscale serve --bg --https=<port> http://127.0.0.1:<VG_PORT>` çalıştırır, `tailscale status --json`'dan DNS adını okuyup `VG_TAILNET_HOST` değerini ve `whoami` login'ini `.env`'e önerir (yazmadan önce gösterir). `status`: `tailscale serve status --json` ayrıştırır; Funnel açıksa **hata ve çıkış kodu 2**.
- **Başlatıcı:** `VG_TAILNET_HOST` doluysa başlangıçta serve durumunu kontrol eder ve telefon adresini yazdırır ("Telefon: https://alper-pc.tailef7c0d.ts.net:8443"). Serve kapalıysa uyarır, kendisi açmaz. Funnel açıksa başlamaz.
- **Testler:** Ayrıştırıcı saf fonksiyon olarak (`parseServeStatus(json)`) `apps/api/test/` veya `tests/unit` altında: Funnel açık/kapalı, port eşleşmesi, port başka hedefe yönlenmiş. Fixture JSON'ları bu makinedeki gerçek çıktıdan alınır.

#### T4: Telefonda TikTok bağlamayı açıkça kapat
- **Dosyalar:** `apps/web/src/components/settings/TikTokSection.tsx`, `apps/api/src/routes/tiktok.ts` (bağlantı başlatma ucu).
- **API:** Bağlantı başlatma isteği `'tailnet'` kapsamından gelirse 409 ve `{ error: 'connect_on_host' }` döner. Arayüz bu durumu `location.hostname` ile önceden bilir ve düğmeyi gizleyip §3.4'teki metni gösterir.
- **Test:** `tiktok.test.ts`'e "tailnet kapsamında connect → 409 connect_on_host".

### F2 — Tema

#### T5: "Gece kâğıdı" tokenları
- **Dosyalar:** `apps/web/src/styles/theme.css`, `apps/web/index.html`, `apps/web/src/components/production/ProduceBar.tsx` (teal gölge `rgb(1_106_113_/_0.12)` → `--color-accent-glow` tokenı), `apps/web/src/components/library/CompareView.tsx` (`#016a71` → token).
- §2.1'deki tablo uygulanır. Yeni tokenlar `--color-accent-glow`, `--radius-sheet: 20px`, `--tab-h: 56px`. `--shadow-subtle` `none` olur (kullanım yerleri kalabilir).
- `html { color-scheme: dark }`, `body { background: var(--color-canvas) }`, `-webkit-tap-highlight-color: transparent`, `overscroll-behavior-y: none` (kabukta; iç kaydırıcılar `contain`).
- Odak halkası her yerde `focus-visible:outline-accent-glow` (bugün `outline-ink`; `NavRail.tsx:27` ve diğerleri `grep focus-visible:outline-ink` ile bulunur).
- **Kabul:** `rg -n "#[0-9a-fA-F]{6}|rgb\(" apps/web/src --glob '*.tsx'` boş döner. Tüm `docs/m*/` ekran görüntüleri yeniden üretildiğinde açık renkli yüzey kalmaz (T15'te gözle kontrol).

### F3 — Duyarlı kabuk

#### T6: `AppShell`, `TopBar`, `TabBar`, durum sayfası
- **Dosyalar:** `components/AppShell.tsx`, `components/NavRail.tsx` (öğe listesi ortak modüle taşınır: `lib/nav.ts` → `NAV_ITEMS`, `MOBILE_TABS`), yeni `components/shell/TopBar.tsx`, `components/shell/TabBar.tsx`, `components/shell/StatusSheet.tsx`, `components/UsageFooter.tsx` (veri kancası `useUsageView()` olarak ayrılır, footer ve sheet ikisi de onu kullanır).
- **Düzen:** CSS grid ve `@media` (Tailwind `md:` 768, `xl:` 1200). Telefonda satırlar `[TopBar][içerik][TabBar]`, yükseklik `100dvh`. Güvenli alan paddingleri: üst çubuk `env(safe-area-inset-top)`, sekme çubuğu `env(safe-area-inset-bottom)`, yan kenarlar `inset-left/right` (yatayda çentik).
- **Etkin sekme kuralı:** `NavRail.tsx:20`'deki `active` mantığı `lib/nav.ts`'e taşınır. `/audit` ve `/assets` telefonda "Ayarlar" sekmesini etkin gösterir.
- **Test (birim):** `test/nav.test.ts`: `activeTab('/audit') === '/settings'`, `activeTab('/library/abc') === '/library'`, `activeTab('/chat') === '/chat'`.

#### T7: `Sheet` ilkel bileşeni ve klavye uyumu
- **Dosyalar:** yeni `components/shell/Sheet.tsx`, `lib/viewport.ts`.
- **Sheet:** `<dialog>` tabanlı (odak tuzağı ve Esc yerleşik). Alttan kayar; tutamaçla ya da perdeye dokunarak kapanır; aşağı sürükleyerek kapatma eşiği 25 %. `aria-labelledby` başlığa bağlanır. Masaüstünde ortada 480 px'lik modal olur.
- **viewport.ts:** `visualViewport` yüksekliğinden `--kb-inset` CSS değişkenini yazar. Böylece Üret kutusu ve sohbet girdisi klavyenin üstünde kalır (iOS'ta `interactive-widget` desteği sınırlı).
- **Test (birim):** `test/viewport.test.ts`: klavye açık/kapalı yükseklik hesabı (saf fonksiyon `keyboardInset(innerHeight, vv)`).

### F4 — Ekranlar

#### T8: Stüdyo ve yeni `/chat` rotası
- **Dosyalar:** `routes/Studio.tsx`, yeni `routes/Chat.tsx`, `main.tsx:76` (rota tablosu), `components/production/ProduceBar.tsx` (üç görünüm: `hero` | `docked` | `sheet`), `components/production/ProductionPanel.tsx`, `components/production/ReviewPanel.tsx` (telefonda katlanır, varsayılan kapalı; puan başlıkta).
- **Video çipleri:** `videoList(state)` (`lib/stores.ts`) çip satırına beslenir. Seçim davranışı `Studio.tsx:20` `select` ile aynı (`?video=`).
- **Sohbet:** Telefonda `/chat` tam ekran `ChatPanel`. Tablette Stüdyo'da sağ çekmece. Masaüstünde bugünkü sağ bölme; `/chat` masaüstünde `/`'a yönlendirir ve sohbeti zaten görünür kılar.
- **Oynatıcı yüksekliği:** `max-height: 56dvh`, oran 9:16 korunur.
- **N kısayolu:** `main.tsx:58` `product-name`'e odaklanır. Telefonda Üret sheet'ini açar (kısayol klavyeli tablette anlamlı).
- **Smoke etkisi:** S2 ve S5 masaüstü genişliğinde koştuğu için seçiciler korunur. `#product-name` kimliği üç görünümde de aynı girdide kalır.

#### T9: Kütüphane, detay, karşılaştırma
- **Dosyalar:** `routes/Library.tsx`, `routes/LibraryDetail.tsx`, `components/library/DetailTabs.tsx` (yatay kayan çipler, `scroll-snap`), `components/library/CompareView.tsx` (telefonda A/B varsayılan; "Yan yana" `(orientation: landscape)` dışında `aria-disabled`), `components/library/VersionList.tsx`.
- **Küçük kare:** Liste satırı son sürümün posterini kullanır. Poster yoksa harf rozeti gösterilir. Yeni API ucu açılmaz; mevcut video görünümünde poster/blob alanı yoksa harf rozetiyle yetinilir ve not düşülür (F7 sonrası iş).
- **Test (birim):** `compare-view.test.ts`'e "dar ekranda varsayılan mod ab" (mod seçimi saf fonksiyona çekilirse).

#### T10: Ayarlar, Audit, Varlıklar, düşünme izi
- **Dosyalar:** `routes/Settings.tsx` (telefonda gruplu satır listesi + alt sayfalar; masaüstünde bugünkü uzun sayfa), `routes/Audit.tsx` ve `components/audit/AuditTable.tsx` (telefonda kart listesi: zaman, aktör, eylem; dokununca `AuditDetail` sheet'te), `components/audit/AuditFilters.tsx` (filtreler sheet'te, üstte "Filtre (3)" çipi), `routes/Assets.tsx` ve `components/assets/AssetTable.tsx` (kart listesi; `AssetAddForm` dosya seçiciyle telefondan yükleme), `components/thinking/TraceView.tsx` (telefonda tam ekran sheet).
- **Görünüm katmanı değişmez:** `audit-view.ts`, `assets-view.ts`, `trace-view.ts` aynen kullanılır.
- **Kabul:** 390 px genişlikte hiçbir rotada yatay kaydırma yok (S9'da ölçülür: `document.documentElement.scrollWidth <= innerWidth`).

### F5 — PWA

#### T11: Canlı bağlantı yeniden uyanınca
- **Dosyalar:** `apps/web/src/lib/live.ts`, `test/live.test.ts`.
- `document.visibilityState === 'visible'` olduğunda ve `es` OPEN değilse backoff beklemeden hemen `open()` çağrılır. OPEN ama son olaydan beri 2 × heartbeat aralığı geçtiyse yarı açık sayılır ve yeniden açılır (`live.ts:137`'deki denetim tetiklenir). `pageshow` (bfcache dönüşü) aynı yolu kullanır.
- **Testler:** "gizliyken kopan bağlantı, görünür olunca backoff'u beklemeden açılır"; "görünür olduğunda OPEN ve taze bağlantıya dokunulmaz".

#### T12: Manifest, ikonlar, `index.html`
- **Dosyalar:** `apps/web/public/manifest.webmanifest`, `apps/web/public/icons/` (192, 512, maskable-512, apple-touch-180 PNG), `bin/icons.mjs` (favicon.svg'den PNG'leri sistem Chrome ile üretir; çıktılar commit edilir, build'e bağımlılık eklenmez), `apps/web/index.html`.
- **Manifest:** `name` "VideoGen Studio", `short_name` "VideoGen", `lang` "en", `start_url` "/", `scope` "/", `display` "standalone", `orientation` "any" (Karşılaştır yatayda yan yana açılır), `background_color` ve `theme_color` `#191815`, `icons`, `shortcuts` (New video → `/?new=1`, Library → `/library`).
- **index.html:** `viewport` içerik `width=device-width, initial-scale=1, viewport-fit=cover`, `theme-color`, `apple-touch-icon`, `apple-mobile-web-app-status-bar-style` "black-translucent", `apple-mobile-web-app-title` "VideoGen", `<link rel="manifest">`.
- **İkon:** §2.5'teki ana dosyadan (`docs/mobile-pwa/icon/app-icon.svg`) üretilir. Maskable sürümde güvenli bölge 80 %; ön kare ve yelpaze zaten bu dairenin içinde (önizlemede doğrulandı). Favicon (16/32) ayrı ve düz kalır (§2.5).

#### T13: Servis çalışanı (elle, bağımlılıksız)
- **Karar notu:** vite-plugin-pwa 2.0.0 Vite 8'i destekliyor. Yine de elle yazılıyor, çünkü: (1) önbelleğe alınacak yüzey küçük (kabuk + hash'li assets); (2) Range, SSE ve blob isteklerinin **kesinlikle** geçmesi gerekiyor ve bunu tek bir saf fonksiyonla test etmek Workbox yapılandırmasından daha güvenli; (3) proje bağımlılık eklememe çizgisini (M7) sürdürüyor.
- **Dosyalar:** `apps/web/public/sw.js`, yeni saf modül `apps/web/src/lib/sw-routes.ts` (SW'ye build sırasında kopyalanmaz; aynı kural `sw.js` içinde tekrarlanır ve test, iki kopyanın aynı tabloyu verdiğini doğrular, ya da `vite.config.ts`'e `sw.ts`'i ayrı giriş olarak derleyen küçük bir `build.rollupOptions.input` eklenir; yürütücü ikincisini dener, olmazsa birincisine döner), `apps/web/src/lib/sw-register.ts`, `components/shell/UpdateToast.tsx`, `apps/web/public/offline.html` yerine SPA içinde `components/shell/Unreachable.tsx`.
- **Kurallar (`classify(request) → 'shell' | 'asset' | 'bypass'`):**
  - `bypass` (`respondWith` yok): `/api/*`, `/events`, `Range` başlığı olan her istek, GET dışındaki her metot, başka origin.
  - `asset` (önce önbellek, sonra ağ; sınırsız saklanır çünkü hash'li): `/assets/*`, `/icons/*`, `/k19/*`, yazı tipleri.
  - `shell` (ağ önce, 3 sn zaman aşımı, sonra önbellekteki `index.html`): `mode === 'navigate'` istekleri.
- **Ulaşılamıyor:** Kabuk önbellekten açıldı ama `/api/health` başarısızsa SPA `Unreachable` ekranını gösterir. Ayrı bir offline.html yok; tek dil, tek tasarım.
- **Güncelleme:** `registration.waiting` varsa `UpdateToast` "Yeni sürüm hazır" + "Yenile" gösterir. Yenile → `postMessage('skipWaiting')` → `controllerchange` → `location.reload()`. Sessiz otomatik yenileme yok; kullanıcı ortasında bir üretimi izliyor olabilir.
- **Eski önbellek:** `activate` sırasında `vg-shell-<BUILD_ID>` dışındaki önbellekler silinir. `BUILD_ID` Vite `define` ile verilir.
- **Kayıt yalnızca güvenli bağlamda ve dev dışında:** `import.meta.env.PROD && isSecureContext`. Smoke yığını `127.0.0.1` olduğu için güvenli bağlamdır; S9 SW'yi orada da test eder.
- **Testler (`test/sw-routes.test.ts`):** "Range'li /api/blobs → bypass"; "/events → bypass"; "POST /api/videos → bypass"; "/assets/index-abc.js → asset"; "navigate /library/x → shell"; "başka origin → bypass".

#### T14: Sunucu tarafı önbellek başlıkları
- **Dosyalar:** `apps/api/src/app.ts:99–104` (SPA statik kaydı), `apps/api/test/system.test.ts` (ya da yeni `static.test.ts`).
- `index.html`, `sw.js`, `manifest.webmanifest` → `Cache-Control: no-cache`. `/assets/*` → `public, max-age=31536000, immutable`. `sw.js` ayrıca `Service-Worker-Allowed: /`. `manifest.webmanifest` içerik türü `application/manifest+json`.
- **Testler:** Her üç başlık grubu için birer istek ve beklenen başlık. "SPA fallback (`/library/x`) no-cache döner".

### F6 — Bildirimler (opsiyonel, K3 kararına bağlı)

#### T15a: Uygulama rozeti (dışarı trafik yok)
- `navigator.setAppBadge(n)`: n = incelemeni bekleyen ya da hata alan video sayısı (`lib/stores.ts`'ten türetilir). Yalnızca uygulama açıkken ve destekleniyorsa güncellenir. Push gerektirmez.

#### T15b: Web Push (K3 = evet ise)
- **Olaylar:** "yayına hazır", "düzeltme turu senin kararını bekliyor", "render başarısız", "kullanım koruması üretimi durdurdu". Yük yalnızca başlık ve video kimliği içerir; ürün adı dışında içerik yok.
- **Parçalar:** Migration `push_subscriptions` (endpoint, keys, created_at, login). VAPID anahtarı `settings` tablosunda. Gönderim worker'da, `ui_events` dinleyicisi olarak. API uçları `POST/DELETE /api/push/subscription`. Ayarlar → Bu cihaz → Bildirimler anahtarı (izin istemi yalnızca bu dokunuşla). `sw.js` `push` ve `notificationclick` (ilgili `/?video=` açar).
- **İlke notu:** Trafik `web.push.apple.com` / FCM üzerinden çıkar. Spec'teki "yalnızca yerel" ilkesine istisna olarak spec §'e karar notu eklenir.

### F7 — Doğrulama

#### T16: Smoke S9 (mobil) ve ekran görüntüleri
- **Dosyalar:** `tests/smoke/playwright.config.ts` (ikinci proje `mobile`: viewport 390×844, `isMobile`, `hasTouch`, `deviceScaleFactor` 3, sistem Chrome), yeni `tests/smoke/s9-mobile.spec.ts`, `tests/smoke/screens.spec.ts` (`-g mobile` ile telefon ekranları), `docs/mobile-pwa/*.png`.
- **S9 adımları:** Açılışta sekme çubuğu görünür ve ray gizlidir. Üret kutusu → sheet → ürün adı → Üret → video çipi belirir ve ilerleme akar (sahte Claude sürücüsü). Sohbet sekmesinde soru gönderilir, yanıt akar. Kütüphane → detay → Karşılaştır'da A/B varsayılandır. Ayarlar → Audit → bir satır → detay sheet'i açılır. Her rotada `scrollWidth <= innerWidth`. `manifest.webmanifest` 200 döner ve JSON'da `display: standalone` vardır. SW `activated` olur. API durdurulunca `Unreachable` görünür; yeniden başlatılınca kendiliğinden kalkar.
- **S8 (performans):** Mobil projede de koşar. Bütçe aynıdır (p95 ≤ 16,8 ms, 4× CPU). Aşarsa önce Studio çip satırı ve sheet animasyonu incelenir.
- **Erişilebilirlik:** S9 içinde axe yok (bağımlılık yok); bunun yerine sekme çubuğu ve sheet için rol ve etiket varlığı kontrol edilir: `nav[aria-label="Ana menü"]`, `dialog[aria-labelledby]`.

#### T17: Gerçek cihaz kontrol listesi
- **Dosya:** `docs/machine-checklist.md`'ye "Mobil PWA" bölümü (A.8 akışından sonra).
- **iPhone (Safari) ve Android (Chrome), ikisi de Tailscale açık:** Adresi aç (sertifika uyarısı yok) → Ana ekrana ekle → simgeden aç: standalone, durum çubuğu koyu, çentik ve home indicator taşması yok. Bir üretim başlat, ilerlemeyi canlı izle. Uygulamayı 5 dakika arka plana al, geri dön: 2 sn içinde canlı. Taslağı oynat (Range, ileri sarma). Karşılaştır'da A/B ve yatayda yan yana. Varlıklar'a Dosyalar'dan müzik yükle. Sohbette klavye girdiyi örtmüyor. Bilgisayarda `npm run build` sonrası telefonda "Yeni sürüm hazır". Telefonda Tailscale'i kapat: "ulaşılamıyor" ekranı; aç: kendiliğinden döner. Ayarlar → TikTok'ta açıklama metni görünür, bağlama düğmesi yok.
- **Remotion Player ölçümü (R2):** iPhone'da 45 sn'lik taslak; kare atlaması ve ısınma gözle not edilir.

#### T18: Belgeler
- `README.md`: giriş cümlesindeki "Turkish web UI" → "English web UI (video content in Turkish)"; "Telefondan kullanım" bölümü (operator, `bin/tailnet.mjs enable`, `.env` değişkenleri, kurulum adımları, Funnel uyarısı).
- `docs/mobile-pwa/summary.md`: kararlar, ölçümler, ekran görüntüleri.

---

## 5. Sıra ve bağımlılık
- **T0a → T0b** önce: diğer bütün ekran işleri İngilizce metin üzerinde yapılır.
- **T1 → T2 → T3** (erişim olmadan telefonda hiçbir şey denenemez; T2 ve T3 bulut ortamında T1'siz de yazılabilir, fixture'larla).
- **T5** her ekran işinden önce (görüntüler bir kez yeniden üretilsin).
- **T6 → T7 → T8 / T9 / T10** (T8–T10 birbirinden bağımsız, paralel ajanlara verilebilir).
- **T11–T14** F3'ten bağımsız, T5'ten sonra paralel.
- **T4** her zaman, bağımsız.
- **T15** en son ve yalnızca K3'e göre.
- **T16–T18** kapanış.

## 6. Kararlar (2026-10-11 güncellemesi)
- **Karara bağlananlar:** K1 evet (kullanıcı: "hem PC hem telefon, bu yeni tasarımla"). K2 = 8443 (443'teki 8091 servisine dokunulmaz). K3 = yalnızca rozet; push ertelendi. K5 ertelendi; sunucu ve ajan metni Türkçe kalır. **K6 (yeni):** Shared etiketleri ve worker değişmez; İngilizce web katmanı kullanılır (bkz. 1.4).
- **Uygulama planı:** `docs/superpowers/plans/2026-10-11-mobile-pwa-implementation.md`.

### Önceki açık kararlar
- **K1 — Koyu tema masaüstünde de mi?** Brief "responsive + yalnızca koyu" diyor ve tek kod tabanı var. Plan masaüstünü de koyuya çeviriyor. Sonuç: `docs/m2`–`docs/m7` ekran görüntüleri eskir; T16'da yeniden üretilir ve README'deki örnek görsel değişir.
- **K2 — Port:** 443 şu anda `127.0.0.1:8091`'e gidiyor. Öneri **8443** (adres `…ts.net:8443`). Alternatif: 8091 servisini taşıyıp VideoGen'i köke almak (daha kısa adres; bir PWA kurulduktan sonra origin değişirse yeniden kurulum gerekir, bu yüzden baştan karar verilmeli).
- **K3 — Web Push:** Trafik Apple/Google push servisinden geçer. Öneri: önce yalnızca rozet (T15a). Push'u bu işten sonraya bırakmak.
- **K5 — Ajanların ekrana yazdığı metnin dili:** İnceleme notları, araştırma özetleri ve sohbet yanıtları bugün Türkçe üretiliyor (`claude-plugin/agents/*.md`). Arayüz İngilizce olunca bu metinler Türkçe kalırsa ekran iki dilli görünür. Öneri: ajanlar **kullanıcıya yazdıklarını İngilizce**, **video için ürettiklerini (seslendirme, altyazı, başlık) Türkçe** yazsın. Bu, prompt değişikliği ve incelemeler için yeniden kalibrasyon demek; ayrı bir görev olarak bu işten sonraya bırakılabilir.
- **K4 — İzinli kullanıcılar:** Varsayılan yalnızca tailnet sahibi login'i. Paylaşılan cihaz ya da ikinci bir kullanıcı yok varsayılıyor.

## 7. Riskler
- **R1 — Host/Origin kayması:** Telefon tarayıcısı Origin'i portla gönderir. `VG_TAILNET_HOST` portsuz yazılırsa her yazma 403 alır. T3 `enable` değeri kendisi üretir ve T2'nin hata metni beklenen değeri gösterir.
- **R2 — Remotion Player mobil performansı:** 1,3 MB parça ve canlı kompozisyon iPhone'da ısınabilir. B planı: taslak MP4 varsa telefonda `<video>` ile oynatmak (DraftTabs'ta final için zaten var). T17'deki ölçüm sonucuna göre karar verilir.
- **R3 — iOS arka plan:** iOS, SSE'yi ve zamanlayıcıları dondurur. T11 öne gelişte toparlar; arka planda ilerleme bildirimi ancak F6 ile mümkün.
- **R4 — SW'nin eski kabuk servis etmesi:** `no-cache` başlıkları (T14) ve "Yenile" akışı (T13) bunu önler. Acil durumda Ayarlar → Bu cihaz → "Önbelleği temizle" satırı SW kaydını siler ve sayfayı yeniler (T13 kapsamında küçük ek).
- **R5 — Smoke süresi:** Mobil proje S1, S2 alt kümesi, S8 ve S9'u ekler. Tahmini +1,5 dk. `npm test` etkilenmez.
