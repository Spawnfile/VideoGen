# Ember arayüzü — tasarım (2026-10-11)

Kullanıcı isteği: VideoGen PWA'sı "çok basit" duruyor. `alper-homelab:~/homelab-repos/yt-summarizer` PWA'sının görsel/UX yaklaşımı
VideoGen'e uygulansın, renk teması değişsin, bir video üretim ürününe yakışan, startup olarak gösterilip satılabilecek kalitede ve
telefonda kusursuz çalışan bir arayüz olsun. Kapsam: **görsel + UX yeniden tasarım** (kullanıcı seçimi); hesap, ödeme, landing yok.

Yön, görsel eşlikçide üç turda seçildi: A "Timecode" (montaj masası) × B "Prism" (renk geçişi) karışımı; mor/mavi "çok göze batıyor"
geri bildirimiyle **Ember** dozu (pembe → mercan kısa geçiş, nötr grafit zemin) seçildi. Referans mockup'lar:
`docs/ember-ui/mockup-layout.html|png` (düzen: Studio, Library, New video) ve `docs/ember-ui/mockup-color.html|png` (renk; seçilen 1 · Ember).
Kullanıcı kapsamı onayladı ve "önerilerinle ilerle, plan bitene kadar soru sorma" dedi; aşağıdaki kararlar Claude'undur.

## yt-summarizer'dan alınan ilkeler

1. **Bir dünya, söylenmeyen metafor.** Malzeme mekanizmayı anlatır: VideoGen bir montaj masasıdır (timeline, playhead, timecode,
   9:16 kareler). Metinde metafor yok: düğme ne yapıyorsa onu söyler ("New video", "Stop production").
2. **Renk bir roldür.** Ember yalnızca canlı iş ve birincil aksiyonda. İkinci bir ember öğe görüyorsan biri yanlıştır.
   "Seni bekliyor" amber, hata kırmızı, atlandı/durduruldu sönük gri: hiçbiri birbirine benzemez.
3. **Başparmak bölgesi.** Birincil aksiyon alt üçte birde; girdiler alt sayfa (sheet) olarak açılır.
4. **Rakamlar mono.** Her sayı, süre, durum ve etiket `ui-monospace`, büyük harf, aralıklı; hizalanan rakamlar `tabular-nums`.
5. **Kaydedilmiş sistem.** Tasarım `apps/web/DESIGN.md`'de yazılı durur (token, bileşen, ses tonu); sonraki işler oraya bakar.

## Kararlar

| # | Karar | Gerekçe |
|---|---|---|
| E1 | **Branch `ember-ui`, worktree `/home/alper/gpu-server/VideoGen-ember`**, main'den (`c0d9caf`). Önizleme worktree'de Vite dev sunucusu, port 5183, `/api` ve `/events` main servisine (5180) gider. `videogen.service`'e ve 8443'e dokunulmaz. | Çalışan yığın kullanıcınındır; dev sunucusu aynı veriyi canlı gösterir. |
| E2 | **Token adları korunur, değerleri değişir; yeni tokenlar eklenir.** Bileşenlerde sabit hex/rgb yok (mevcut kural). | 600+ sınıf kullanımı tek dosyadan yeni temaya geçer; diff küçük kalır. |
| E3 | **Palet (Ember):** `canvas #0A0A0C`, `paper #111114`, `inset #17171B`, `line #222228`, `line-strong #2E2E36`, `ink #EEEEF2`, `ink-2 #A6A6B0`, `ink-3 #7C7C88`, `hover rgb(238 238 242/.05)`, `hover-2 /.08`, `scrim rgb(4 4 6/.62)`; `ember-a #FF4D6A`, `ember-b #FF8A3D`, `--grad-ember: linear-gradient(100deg, ember-a, ember-b)`; `accent #FF6B3D` (düz ember), `accent-glow #FF9466` (odak halkası, bağlantı, ilerleme metni); `amber #FFC94D` (seni bekliyor); `red #F0445C` (hata); `green #4CC38A` (hazır/yayında); `dim #5A5A64` (atlandı/durduruldu). `ink-3` canvas üstünde ≥ 4.5:1. | Kırmızı (gül, 350°) ile ember'in düz tonu (turuncu-mercan, 15°) ayrışır; amber sarıya kaydırıldı ki mercanla karışmasın. Renk tek başına anlam taşımaz: her durum etiket/ikonla da yazılır. |
| E4 | **Ember'in harcandığı yerler (kapalı liste):** birincil düğme (`Create video`, dock'taki `New video`), canlı iş (koşan videonun karesi ve halkası, timeline'daki koşan blok, playhead, `LIVE` göstergesi, genel ilerleme çubuğu), aktif sekme çizgisi, logo. Seçim durumları (segment, çip, sekme hapı) ember **değil**: `bg-ink text-canvas` ya da `bg-inset` + `ring line-strong`. | "Renk bir roldür" ilkesinin uygulanabilir hâli; mevcut 26 `bg-accent` kullanımı bu listeye göre tek tek eşlenir. |
| E5 | **Ortam:** `body::before` sağ üstten sızan ember ışık alanı (radial, opaklık .16, blur), `body::after` satır içi SVG `feTurbulence` grain (%4). İkisi `position: fixed`, `pointer-events: none`, `z-index` içeriğin altında. Dış istek yok. | Mockup'ta seçilen Ember'in "çok soluk ışık"ı; düz siyahtan ayıran tek doku. |
| E6 | **Tipografi:** Inter (yerel `@fontsource`, 400/500/600/700). Ölçek: ekran başlığı 28px/1.0 700 `-.035em`; video başlığı 26px aynı; kart başlığı 14px 600; gövde 14px (telefonda girdiler 16px, mevcut). Mono `--font-mono: ui-monospace, "SF Mono", Menlo, monospace`; `.label-mono` yardımcı sınıfı: 10.5px, büyük harf, `letter-spacing .12em`, `tabular-nums`. | Karakter yüzden değil ölçekten gelir (yt-summarizer); Inter zaten paketli, yeni bağımlılık yok. |
| E7 | **Biçim:** köşeler keskinleşir: `--radius-control 6px`, `--radius-input 10px`, `--radius-card 12px`, `--radius-sheet 16px`; kareler (poster/klip) 6px. Gölge yok, katman `canvas → paper → inset`; tek istisna birincil düğmenin ember parıltısı (`--shadow-ember: 0 8px 24px rgb(255 77 106/.28)`). | A'nın köşeli montaj masası dili; B'nin parıltısı yalnızca birincil aksiyonda. |
| E8 | **Hareket:** mevcutlar (sheet-up, spin, fade) kalır; yeni iki hareket: playhead/ilerleme genişliğinin yumuşak kayması (500ms) ve `LIVE` noktasının nefesi (2.4s, opaklık .55↔1). `prefers-reduced-motion` ikisini de kapatır (mevcut global kural). | Hareket bilgi taşır (iş ilerliyor); süs hareketi eklenmez. |
| E9 | **Kabuk (telefon):** üst çubuk solda ekran başlığı (E6 ölçeği, 22px telefonda) ya da geri oku; sağda, herhangi bir koşu aktifken `LIVE n` göstergesi (ember nokta + ember metin, mono) ve mono durum hapı (`27% · 5H`). Alt sekmeler: ikon + mono büyük harf etiket (10px), aktif sekmede üstte 2px ember çizgi ve `ink` metin; teal hap kalkar. Sohbet canlı noktası ember. Tablet rayı/masaüstü kenar çubuğu: aktif öğe `bg-inset` + solda 2px ember çizgi, logo yeni ikon. | yt-summarizer'ın sabit kabuğu ve harcama göstergesi; VideoGen'de karşılığı kullanım penceresi ve canlı iş sayısı. |
| E10 | **Bin (Studio video şeridi):** yuvarlak çiplerin yerine yatay kayan 9:16 kareler (telefonda 60×106, tablet/masaüstünde gösterilmez; orada mevcut düzen kalır). Kare: kapak görseli (`final.coverSha ?? draft.coverSha`, `/api/blobs/:sha`), yoksa ürün adından türetilen poster (E12). Altında mono etiket: koşuyor → `NN%` (ember metin), `needs_human` → `NEEDS YOU` (amber), `ready` → `READY`, `published` → `POSTED` (green), `failed` → `FAILED` (red), `cancelled` → `STOPPED` (dim), `queued` → `QUEUED`. Seçili kare ember halkalı (2px). Şeridin sonunda `+ New` karesi sheet'i açar. Her kare `role="tab"`, `aria-selected`, erişilebilir adı ürün adı + durum. | Ürün videodur: listede metin değil kare görünmeli. Smoke `getByRole('tab', { name: /Mobil kalem/ })` aynı kalır. |
| E11 | **Timeline (Studio, üretim özeti):** `VideoHeader` ile adım listesi arasında, run varken görünür. Üç şerit: `V` (research, storyboard, build, draft_render, final_render, compose, finalize), `A` (voice, music, remix), `QC` (draft_review, qc, review). Adımlar ordinal sırasıyla zaman ekseninde ardışık; blok genişliği = bitmişse gerçek süre (`endedAt − startedAt`), koşuyorsa `max(geçen, STEP_DEFAULT_S)`, bekleyen/kuyrukta ve hiç başlamadan iptal edilen `STEP_DEFAULT_S`; `skipped` adım zaman kaplamaz, 4px'lik kesik bir işaret olarak çizilir (asgari genişlik kuralına girmez). Okunurluk için diğer her bloğun asgari genişliği toplamın %4'ü (sonra yeniden normalize). Playhead = bitenlerin toplamı + koşanın geçen süresi. Üstte mono cetvel (toplam tahmini sürenin 0/¼/½/¾/1 noktaları, `m:ss`). Blok renkleri: bitti `bg-line-strong` + `ink-2` metin; koşuyor `bg-ember` + beyaz metin; bekliyor kesik `line-strong` çerçeve; başarısız `red` çerçeve + `×`; bekleme (`waiting_*`) amber kesik çerçeve; hiç başlamadan iptal edilen `dim` kesik çerçeve, üstü çizili etiket (durdurulmuş bir koşuda geride kalan iş görünür kalır). Blok etiketi sığarsa içinde, sığmazsa yalnızca `title`. Bloğa dokunmak adım listesindeki satıra kaydırır (`#step-<StepView.id>`; aynı `key` bir inceleme döngüsünde tekrarlanabilir). Altında mono "NOW" satırı: `● NOW · hh:mm:ss` (koşunun başlangıcından beri) + koşan adımın notu. Koşu bitmişse "NOW" yerine `DONE · toplam süre` / `STOPPED` / `FAILED`. Saf hesap `lib/timeline-view.ts`'te, bileşen yalnızca çizer. | A'nın imzası; tamamen gerçek veriden (`StepView.startedAt/endedAt/status`, `STEP_DEFAULT_S`). Adım listesi kalır çünkü notlar orada okunur ve smoke `[data-testid="step"]` ona bağlı. |
| E12 | **Türetilmiş poster:** kapak yoksa `posterTint(productName)`: addan kararlı bir ton (djb2 hash → 8 hazır koyu tondan biri; ember ve kırmızı/amber tonları listede yok), üstte ürün adının ilk harfi büyük ve yarı saydam, altta mono süre penceresi. `lib/poster.ts`, saf. | Boş gri kutu "bitmemiş" görünüyordu; yer tutucu da tasarımın parçası olmalı. |
| E13 | **Library:** satır listesinin yerine poster ızgarası (telefon 2 sütun, ≥ 480px 3, tablet 4, masaüstü 5; `max-w-[1100px]`). Kart: 9:16 poster (E10 kaynağı, E12 yedeği), sol üstte mono durum etiketi, sağ altta süre (`library-duration`), altında ürün adı (14px 600) ve mono tarih + puan (`library-score`). Koşan video ember halkalı ve yüzdeli. Başlıkta mono sayaç: `14 VIDEOS · 3:41 TOTAL`. Kart bileşeni `PosterCard`, sağ üstte boş bir `badges` yuvası taşır (platform rozetleri için). **Filtre çipi ve arama bu işte yok.** | `video-library` branch'i (spec `2026-10-11-video-library-design.md`, henüz uygulanmadı) Library'ye filtre çipleri ve YT/IG/TT rozetleri ekleyecek; çakışmayı küçültmek için bu iş yalnızca görünümü değiştirir ve rozete yer bırakır. `data-testid`'ler aynı. |
| E14 | **VideoHeader:** ürün adı E6 ölçeğinde; durum hap yerine mono etiket (E10 eşlemesi); altında tek mono meta satırı: `VO · 15–17 S · YOUR CHOICE · 1.2M TOK · ABOUT 6 MIN LEFT`. Genel ilerleme çubuğu kalır (`role="progressbar"`, ad aynı), 3px yüksek, dolgu `bg-ember`. `Stop production` ikincil düğme (çerçeveli). Brief `<details>` ve tur etiketi kalır. | Smoke `Overall progress` ve `video-header` kullanır. |
| E15 | **Needs-you şeridi (telefon Studio):** seçili video dışında `needs_human` durumundaki videolar varsa, timeline'ın altında en fazla 2 kart: amber çerçeve, mono `<ÜRÜN> · NEEDS YOU`, `statusNote` (tek satır, kesilir), `Open` düğmesi (o videoyu seçer). | "Durum bir bakışta okunur" ilkesi: kullanıcının aksiyonu gereken iş Studio'da kaybolmaz. Veri zaten store'da. |
| E16 | **New video (dock + sheet + form):** dock: `paper` kutu, yer tutucu metin, sağda `bg-ember` "New video" düğmesi (+ parıltı). Form üç varyantta aynı (`bar`/`sheet`/`hero`): mono bölüm etiketleri (`PRODUCT`, `VOICEOVER`, `LENGTH`, `BRIEF · OPTIONAL`); ürün alanı odakta ember çerçeve (`ring-ember` yardımcı sınıfı: padding-box/border-box gradyan); voiceover iki parçalı segment (seçili `bg-inset` + `ring line-strong`, metin `ink`); Length `Auto`/`Manual` segment (mevcut davranış ve `durationBadge` aynen); `Create video` tam genişlik `bg-ember`, 50px, parıltılı. Hero (boş Studio): büyük başlık "Make your first video" + açıklama + form, arkada ember alanı. | Birincil aksiyon ekrandaki tek dolu ember blok. Davranış (`producePayload`, kilit, hatalar) değişmez. |
| E17 | **Sheet:** `rounded-t-sheet` (16px), `paper` zemin, üst kenarda 1px `line-strong`; tutamak kalır; başlık 20px 700. Klavye davranışı (`--kb-inset`) aynen. | Mevcut erişilebilir `<dialog>` korunur; yalnızca görünüm. |
| E18 | **Diğer yüzeyler** (Chat, Settings ve alt sayfaları, Audit, Assets, LibraryDetail, kartlar, AgentPanel, ReviewPanel, PublishPanel): yeni tokenlarla kendiliğinden döner; ek olarak bir **ince ayar turu**: başlıklar E6 ölçeğinde, sayısal/durum metinleri `font-mono tabular-nums`, seçim durumları E4'e göre, `bg-accent` ve `text-accent-glow` kullanımları E4 listesine göre gözden geçirilir. Yapı ve akış değişmez. | Kullanıcı kapsamı "imza bileşenler + tutarlılık" olarak onayladı (seçenek 1). |
| E19 | **İkon:** yeni master `apps/web/design/app-icon.svg`: koyu zemin (`#0A0A0C`) üstünde sağ üstten hafif ember ışık, ortada ember gradyanlı 9:16 çerçeve, içinde koyu oynat üçgeni, çerçevenin altında üç kısa timeline çubuğu ve ince playhead. Düz `favicon.svg` aynı motifin 32px sadeleştirmesi. `bin/icons.mjs` yeni master'ı okur; PNG'ler yeniden üretilip commit edilir. Eski `docs/mobile-pwa/icon/` dokunulmaz (tarihî). | Ana ekranda kimlik çapası; arayüzle aynı geçiş dili (yt-summarizer: "ikon ve arayüz aynı gradyanı paylaşır"). |
| E20 | **PWA meta:** manifest `background_color`/`theme_color` ve `index.html` `theme-color` → `#0A0A0C`; `description` aynı; `apple-mobile-web-app-status-bar-style` `black-translucent` kalır (üst çubuk `pt-safe`). Servis çalışanı mantığı değişmez. | Açılış ekranı ve durum çubuğu zeminle birleşir. |
| E21 | **`apps/web/DESIGN.md`:** yt-summarizer `DESIGN.md` biçiminde: Dünya, Renk (token tablosu + E4 listesi), Tip, Biçim ve hareket, Düzen, Bileşenler (Bin, Timeline, PosterCard, NeedsYou, ProduceForm/Dock, Sheet, TabBar, TopBar), Ses tonu (metinde metafor yok), İkon. "Yayınlanan yapıdan kaydedildi" notu. | "Yazıya geçmeyen tasarım dağılır" (yt-summarizer yaklaşımı). |

## Bileşen ve modül haritası

- `apps/web/src/styles/theme.css` — E2/E3/E5/E6/E7/E8 tokenları, `@utility bg-ember`, `text-ember` (gradyan metin), `ring-ember`
  (gradyan çerçeve), `.label-mono`, `shadow-ember`, ortam katmanları, `live-breathe` keyframe.
- `apps/web/src/lib/timeline-view.ts` (yeni, saf) — `timelineView(run, nowMs)` → `{ totalS, playheadS, ticks: {atS,label}[], lanes: { id: 'V'|'A'|'QC', blocks: { key, label, startS, widthS, tone, title }[] }[], now: { kind: 'live'|'done'|'stopped'|'failed', clock: string, note: string|null } }`. Tonlar: `done | live | pending | waiting | failed | stopped | skipped` (`stopped` = hiç başlamadan iptal; başlamış sonra iptal edilen adım `failed` değil `done` gibi gri ama `×` işaretli: ton `stopped`, genişlik gerçek süre).
- `apps/web/src/lib/poster.ts` (yeni, saf) — `posterTint(name) → { tone: 0..7, initial: string }`; tonların değerleri `theme.css`'te `--poster-0` … `--poster-7` (koyu iki duraklı gradyanlar), bileşen `style={{ background: 'var(--poster-N)' }}` kullanır;
  `videoLabel(video, run) → { text, tone: 'live'|'needs'|'ok'|'error'|'dim'|'muted' }` (E10 eşlemesi; Bin, PosterCard ve VideoHeader paylaşır).
- `components/production/Timeline.tsx` (yeni) — E11 çizimi; blok dokunuşu `document.getElementById('step-'+key)?.scrollIntoView`.
- `components/studio/VideoBin.tsx` (yeni) — E10; `Studio.tsx` telefon dalında çiplerin yerine.
- `components/studio/NeedsYou.tsx` (yeni) — E15.
- `components/library/PosterCard.tsx` (yeni) — E13 kartı; `Library.tsx` ızgarayı çizer.
- `components/shell/LiveIndicator.tsx` (yeni) — E9 `LIVE n` (store'daki aktif koşu sayısı).
- Değişen: `TopBar`, `TabBar`, `SideNav`, `StatusSheet` (hap), `Sheet`, `ProduceBar` (form + dock), `VideoHeader`, `StepList`
  (satırlara `id="step-<StepView.id>"`, mono süre, yeni durum renkleri), `Studio.tsx`, `Library.tsx`, `ThinkingState` (`StepMark` renkleri),
  E18 kapsamındaki dosyalar, `index.html`, `public/manifest.webmanifest`, `public/favicon.svg`, `public/icons/*`, `bin/icons.mjs`.
- Değişmeyen: `packages/*`, `apps/api`, `apps/worker`, `lib/*-view.ts` mantığı (yalnızca yeni iki modül eklenir), `sw.js`,
  `lib/live.ts`, `lib/stores.ts` davranışı, tüm `data-testid`'ler, erişilebilir adlar ve roller.

## Hata ve kenar durumları

- Run yok (video yeni yaratıldı, run henüz gelmedi): Timeline gizli, VideoHeader görünür.
- Adımın `startedAt`'i var, `endedAt`'i yok, durumu `failed` ya da `cancelled`: genişlik `(run.endedAt ?? now) − startedAt` (StepView'de
  `updatedAt` yok; koşunun bitişi en iyi üst sınırdır).
- Tekrarlanan turlar (draft review dönüşü, final fix turu): aynı `key`'den birden çok `StepView` olabilir; timeline her `StepView`'i ayrı
  blok olarak sırayla çizer (tur dönüşü zamanda görünür), blok `title`'ına `round`/`fixRound` eklenir. Adım listesinin mevcut davranışı aynı.
- Kapak blob'u yüklenemezse (`onError`): türetilmiş postere düşer.
- Çok uzun ürün adı: karede 2 satırda kesilir; Bin etiketinde yalnız durum yazılır, ad erişilebilir adda.
- 320px genişlik: Bin kaydırılır, timeline etiketleri gizlenir (yalnızca bloklar), yatay sayfa kaydırması yok.

## Test

- Birim (vitest, `apps/web/test/`):
  - `timeline-view.test.ts`: bitmiş/koşan/bekleyen genişlikleri; asgari %4 ve normalize; playhead; skipped işaret; şerit ataması (her
    `STEP_KEYS` öğesi tam bir şeritte); tekrar eden `key`; `now` türleri (live/done/stopped/failed) ve saat biçimi; boş run.
  - `poster.test.ts`: `posterTint` kararlı (aynı ad → aynı ton), ton listesi ember/kırmızı/amber içermez; `videoLabel` her `VideoStatus`
    için doğru metin ve ton; koşan video yüzdesi run'dan.
  - `theme-tokens.test.ts`: `theme.css` E3 tokenlarının hepsini tanımlar; `apps/web/src/components` ve `routes` altında sabit hex yok
    (`theme.css` ve `design/` hariç); `bg-accent` hiçbir bileşende kalmaz (düz ember gereken yer `bg-ember` kullanır, seçim durumları E4'e göre nötr).
  - Mevcut testler (nav, viewport, i18n, no-turkish-ui, sw-routes…) yeşil kalır.
- Smoke (Playwright, mevcut S1–S9 desktop + mobile projeleri) yeşil; S9'a eklenen kontroller: Studio'da `video-bin` içinde seçili karenin
  `aria-selected="true"` olması, `timeline` görünür ve en az bir `data-tone="live"|"done"` bloğu, Library'de `library-item` kartlarının
  390px'te 2 sütun dizildiği (ilk iki kartın `y`'si eşit), yatay kaydırma yok.
- Görsel doğrulama: worktree dev sunucusundan 390×844@3x ve 1440×900 ekran görüntüleri (Studio koşan video, New video sheet, Library,
  Chat, Settings, LibraryDetail) `docs/ember-ui/` altına; yt-summarizer ilkelerine göre gözden geçirme (E4 tek ember kuralı, 44px dokunma
  hedefi, kontrast).
- `npm test`, `npm run typecheck`, `npm run build` yeşil.

## Kapsam dışı

Çok kullanıcı, giriş, ödeme, landing/onboarding; açık tema; Library filtre çipleri, arama ve platform rozetleri (video-library işi);
Publish/TikTok akışının yeniden kurgulanması (video-library onu kaldırıyor); ajan/worker metinlerinin İngilizceleşmesi (K5); Web Push;
yeni npm bağımlılığı; masaüstü düzeninin yapısal değişimi (yalnızca token ve ince ayar).

## Birleştirme notu

`video-library` uygulanırken `Library.tsx`, `ProductionPanel.tsx`, `PublishPanel` ve `TikTokSection` değişecek. Bu iş önce birleşirse
video-library `PosterCard`'ın `badges` yuvasını ve yeni tokenları kullanır; sonra birleşirse çakışma yalnızca `Library.tsx`'te beklenir
ve kart bileşeni ayrı dosyada olduğu için küçüktür.
