# M4a — Pipeline omurgası: özet

| | |
|---|---|
| Tarih | 2026-10-06 |
| Dal | `m4a-pipeline-core` (main `541890f` üstünde). **`main`'e birleştirilmedi**; M4b bu dalın üstünde açılır, taş sonu ve birleştirme M4b'de |
| Plan | `docs/superpowers/plans/2026-10-06-m4a-pipeline-core.md` (12 görev, inline yürütme) |
| Durum | Tamam: T1–T11 + kapanış (gerçek doğrulama, son review, autosquash, dokümanlar) |
| Kanıt | Bu dosya, `docs/m4/real-check.md`, `docs/m4/*.png`, git geçmişi |

## 1. Ne çalışıyor (kullanıcı gözüyle)

Stüdyo'nun üstündeki alana ürün adı yazılıp "Üret"e basılır (ses modu çipi, varsayılan Seslendirmesiz). Ürün, video, sürüm, run ve adım kayıtları tek transaction'da oluşur. Worker'daki orchestrator kiralı iş kuyruğuyla önce **araştırma**, sonra **storyboard** agent adımını çalıştırır. Stüdyo şunları canlı gösterir:
- adım listesi, monoton genel yüzde, ETA, yüzdenin kaynağı ("agent raporu" / "tahmin") ve video başına kullanım;
- araştırma kartı: yorum, zorluk, parçalar, mekanizma, iddia sayısı;
- storyboard kartı: kanca, süre, vuruşlar.

Run storyboard'da biter. Video "insan gerekli" olur ve şu notu taşır: "Storyboard hazır. Sahne kurulumu ve taslak render bu sürümde henüz yok." (K13 gereği "yayına hazır" yalnızca planda `finalize` varken.)
- **Zor ürün** (araştırma `too_hard`): run araştırmada gerekçeyle durur, storyboard `skipped` olur.
- **"Üretimi durdur":** run, adımlar, işler ve agent oturumu `cancelled` olur.
- **Kütüphane:** videoları durum, tarih ve kullanımla listeler; satıra tıklamak videoyu Stüdyo'da açar.

- **Fake:** smoke S2a üç senaryoyu uçtan uca geçer.
- **Gerçek (haiku/low, tek ürün, geçici DB):** "tükenmez kalem" 5 dk 57 sn'de `done`. 2 oturum çalıştı, düzeltme turu olmadı, 5 sa payı ≈ %2 (`docs/m4/real-check.md`).

## 2. Görevler

| # | Görev | Commit | Test (plan → gerçek) | Not |
|---|---|---|---|---|
| T1 | Artefakt sözleşmeleri (zod 4.6.5 `packages/shared`'e) | `bc71c3a` | 179 → 179 | |
| T2 | Migration 0005 + depo fonksiyonları | `b44c042` | 186 → 186 | + gerçek koşu bulgusu: 5 sa penceresi toleransı (T12, katlandı) |
| T3 | İlerleme modeli | `be821f6` | 190 → 190 | |
| T4 | İş kuyruğu + kaynak ön kontrolleri | `d77a817` | 197 → 197 | |
| T5 | SessionManager abonelikleri, `stepId`, Fake yapılandırılmış çıktı | `dd44519` | 200 → 200 | + M3 runner tur numarası yarışı düzeltildi |
| T6 | Orchestrator | `23d77ac` | 207 → 207 | + son review I1, I2 (katlandı; +2 test) |
| T7 | research/storyboard adımları + worker kablolaması | `7cb5f0b` | 214 → 214 | TS7022 tip notu |
| T8 | API uçları | `1ba9e1f` | 218 → 218 | elle Fake yığın kontrolü |
| T9 | Stüdyo üretim paneli | `4f76cf2` | 221 → 221 | ekranlar `studio-*.png` |
| T10 | Kütüphane | `80f4597` | 222 → 222 | ekran `library.png` |
| T11 | Smoke S2a | `8018d5b` | smoke 10 → 11 | + S5 akış beklemesi, chat "Yeni sohbet" yarışı (+1 smoke) |
| T12 | Kapanış | bu commit | **225** (222 + 3 review/gerçek koşu testi) | |

## 3. Test ve smoke

```
npm run typecheck && npm test   →  Test Files 40 passed · Tests 225 passed (225)
npm run test:smoke              →  11 passed · 5 skipped (~50 sn); son düzeltmelerden sonra 3/3 ardışık yeşil
```

S2a'nın RED kanıtı geçici mutasyonlarla alındı; hepsi geri alındı:

| Mutasyon | Sonuç |
|---|---|
| %99 üst sınırı kaldırıldı | `aria-valuenow` 100 ≠ 99 |
| Mutlu yolda yüzde 5'e düşürüldü | "progress went back at sample 21" |
| Gönderim kilidi kaldırıldı | 2 video ≠ 1 |
| Zorluk kapısı devre dışı | video `failed` ≠ `needs_human` |
| İptal yürütücüyü durdurmuyor + `settle` koruması yok | İlk hâliyle **yakalanmadı**; test güçlendirildi: oturum `done` ≠ `cancelled` |

## 4. Gerçek doğrulama

Ayrıntı `docs/m4/real-check.md`'de.
- İlk deneme 5 sa **%83**'te kullanım kapısıyla durduruldu; hiç oturum açılmadı.
- Sıfırlanmadan sonraki koşu:
  - researcher 25 tur / 592 110 token, storyboarder 5 tur / 79 587 token;
  - haiku iki sözleşmeye de ilk denemede uydu;
  - 5 sa penceresi %2 → %4.
- Bulgu ve düzeltme: video başına 5 sa payı `null` görünüyordu. `get_usage` (ms) ile `rate_limit_event` (saniye) aynı sıfırlanma anını farklı yazıyor; karşılaştırmaya 60 sn tolerans eklendi.
- Kalite notu: haiku metinlerinde Türkçe yazım hataları ve İngilizce karışması var. M4b gerçek rol modelleriyle ölçecek.

## 5. Ekranlar

`docs/m4/studio-running.png`, `docs/m4/studio-done.png`, `docs/m4/library.png` (Fake), `docs/m4/real-studio.png` (gerçek haiku koşusu).

## 6. Plandan sapmalar (ledger `Ruling:` satırları)

| Görev | Karar | Neden | Yanlışsa maliyeti |
|---|---|---|---|
| T5 | (Gerçek bulgu, M3 kodu) Runner, chat turunun numarasını `idle` yazılmadan önce sabitliyor | `idle` görünür olunca gönderilen mesaj `turn++` yapıyor, tur 0, 1 olarak raporlanıyordu (kırılgan M3 manager testi). 300 ms gecikmeyle birebir üretildi | Yok |
| T5 | RED iletisi `[undefined, {…}]` (planda `{product: …}`) | Kaydın ilk `result`'ında `structured_output` yok; neden aynı | Yok |
| T7 | `runStructured`'a `Resume` tip takma adı | Plan kodu TS7022 veriyordu; davranış aynı | Yok |
| T9 | `screens.spec.ts` yorumu `docs/<dir>` | Yeni klasör parametresi | Yok |
| T11 | İptal testi güçlendirildi (oturum `cancelled` bitmeli, adımlar 500 ms sonra da `cancelled`) | Plan mutasyonu 5'i yakalamıyordu | Yok |
| T11 | (Açık bulgu → kapandı) S5 göndermeden önce "Worker canlı"yı bekliyor | Taze SSE bağlantısı geçmişi oynatmaz; akış geç açılırsa iz DOM'a `settled` girer. `/events` 6 sn geciktirilince birebir üretildi; bekleme ile aynı enjeksiyon geçiyor. Doğal tetikleyici yavaş sayfa açılışı (swap %100), isteğe bağlı üretilemedi | S5 bu mekanizma dışı bir nedenle yine kırılabilir |
| T11 | (Gerçek bulgu, M3 arayüzü) "Yeni sohbet" sürerken gönderilen mesaj o yeni sohbete gidiyor | Mesaj eski sohbete ya da ikinci yeni sohbete gidip görünmez oluyordu. Yeni smoke vakası RED → GREEN | Yok |
| T12 | (Gerçek bulgu) 5 sa penceresi 60 sn toleransla karşılaştırılıyor | Gerçek koşuda pay `null` çıktı | 60 sn'den yakın iki farklı pencere birleşir (5 sa pencerede imkânsız) |
| T12 | haiku kalite notu M4b'ye | Sözleşme sorunu değil; K12 rolleri sonnet/opus | Yok |
| Son review | Reviewer'ın "Declined to judge" listesindeki 10 madde (§7) | 9'u plan/spec kapsamı ya da belgelenmiş uyarı olarak kalır; "pipeline kartında Yeniden dene" bulguya çevrildi (Minor) | İlgili madde M4b/M5'te geri gelir |

## 7. Son review

Tek bağımsız reviewer çalıştı: Claude Fable 5.1, salt okunur, aralık `541890f..cf8d98c`. Girdiler plan, spec, Review Focus ve ledger kararlarıydı.
- Sonuç: **With fixes** — Critical 0, Important 2, Minor 10.
- Ledger'daki 10 kararın hepsi doğru bulundu.

| # | Bulgu | Test (RED → GREEN) | Düzeltme |
|---|---|---|---|
| I1 | Zorluk kapısında duran ürün "%99" gösteriyordu (atlanan adımlar tam pay alıyordu) | orchestrator `a needs_human step…` + yüzde 53,3 ("expected 99 to be 53.3") | Yüzde atlamadan önce hesaplanıyor; `needs_human` bitişinde yeniden hesaplanmıyor |
| I2 | Durdur, `launch`/`advance` sırasında gelirse adım iptal edilmiş run içinde başlıyor ya da kuyruğa giriyordu; Claude oturumu Durdur'dan sonra çalışıyordu | orchestrator `a cancel that lands while a step is being launched…` (yürütücü 1 kez çalıştı) + DB `conditional step transitions` | `startStepIfRunActive` / `queueStepIfRunActive` (run durumuna koşullu SQL); `launch` koşullu başlatmadan önce kaydeder |

**Ertelenenler (Minor):**
1. Kira kurtarması yeniden deneme hakkını tüketiyor (`attempt` kurtarmaları da sayıyor).
2. Worker ayaktayken kaybolan `run.start` / `run.cancel` NOTIFY için güvenlik ağı yok.
3. `researchWarnings` (G2 yumuşak kuralı) adıma bağlı değil; `new URL()` bozuk URL'de fırlatabilir.
4. **Spec §6.4:** 5 sa ≥ %80'de yeni run başlamamalı. M4a run'ı başlatıyor, ilk oturum `waiting_limit` olarak bekliyor. **Kullanıcı kararı.**
5. "Üretimi durdur"da aynı kare kilidi yok; eşzamanlı iptaller iki `run.cancelled` audit satırı yazıyor.
6. Storyboard isteminde araştırma JSON'u çitlenmeli, kurallar arkasında kalmalı (M4b'de builder Bash alacak).
7. `x-vg-event-id` REST okumasından sonra alınıyor; arada işlenen bir olay düşebilir (M3 tasarımı).
8. `stepHistorySeconds` yeniden kullanılan/kurtarılan adımları ETA medyanına katıyor.
9. "Worker dururken kira kalır, sonuç yazılmaz" için test yok.
10. Üret sonrası yeni video depoya gelene kadar seçim bir an eski videoya düşüyor.
11. Pipeline agent kartındaki "Yeniden dene" orchestrator dışında oturum açıyor; `stepId` varken gizlenmeli.

## 8. M4b için notlar

- **🚦 Swap %100 ve GPU ön kontrolü:** spec §6.4'teki `swap < %90` kuralı aynen uygulanırsa M4b'nin GPU adımları `waiting_gpu`'da ("swap %100 ≥ %90") kalır. M4a bu durumu yalnızca ölçüp gösteriyor. **Eşik kullanıcı kararı.**
- `IMPLEMENTED_STEPS`'e `build`, `draft_render`, `draft_review` eklenecek. `SceneSpec` sözleşmesi `packages/shared/src/artifacts.ts` deseniyle yazılacak.
- `videos.status_note` "Storyboard hazır…" notu, taslak sonu için yeni bir not/durum kararıyla değişecek. K13 gereği `ready` yalnızca `finalize`'la gelir.
- M3'ten devreden güvenlik minorları (jq bayrakları, dev ucu + SDK sürücüsü koşulu, `SpecStore` eşzamanlılığı) build/fixer devreye girmeden kapatılmalı.
- İlk gerçek ürün spec K12 rol modelleriyle koşulacak. Kalite (Türkçe metin) ve video başına kullanım orada ölçülecek.
- K19 (kanal görsel kimliği) ve K17 (ses) kullanıcı kararları bekliyor.

## 9. Bilinen sınırlar

- `voice`, `build`, taslak, player yok (M4b/M5); seslendirmeli modda storyboard yalnızca `vo_text` taşır.
- Video başına 5 sa payı kullanım izinin tazeliğine bağlıdır (boşta yoklama ≤ 5 dk); kaba bir göstergedir.
- Kütüphane en çok 50 video listeler; kapak, puan ve süre M4b/M5'te.
- Sorunsuz akışta yeni run'lar için periyodik süpürme yok: kaybolan `run.start`, worker'ın bir sonraki açılışında telafi edilir.
