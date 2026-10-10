# Üretim yönergesi ve süre penceresi — tasarım (2026-10-10)

Kullanıcı isteği: Stüdyo'da ürün adının yanında videonun nasıl üretileceğine dair serbest yönerge; süre varsayılan 35–55 sn ama kullanıcı isterse kısaltabilir; varsayılanlar ekranda yazar; ajan da süre ve yönerge önerir; **kullanıcının kararı ajanın önerisini, ajanın önerisi varsayılanı ezer.** Kullanıcı "soru sormadan, kontrol bende" dedi; aşağıdaki kararlar Claude'un gerekçeli seçimleridir (grilling turu kullanıcı isteğiyle otonom kapatıldı).

## Kararlar

| # | Karar | Gerekçe |
|---|---|---|
| Y1 | Öncelik: **kullanıcı > ajan > varsayılan**, alan alan (süre, yönerge). Her etkin değerin kaynağı (`user` / `agent` / `default`) saklanır ve ekranda yazar. | "Kontrol bende" ilkesinin ölçülebilir hâli; hangi değerin kimden geldiği her zaman görünür. |
| Y2 | Süre bir **pencere**dir: `{minS, maxS}`. Varsayılan 35–55 sn (spec K8). Kesin sınırlar 10–60 sn (2026-10-11: kullanıcı "max 10-15 saniye" istedi; ilk karar 15 sn idi); pencere genişliği ≥ 2 sn. | Hesaplar (VO tahmini, yeniden zamanlama dolgusu, QC G1) aralık ister. 10 sn'de kanca (0–3 sn), ikinci kanca (4–6 sn) ve ödül (≥ 7 sn) hâlâ ayrışır; altı kanca penceresine çakışır; 60 sn üstü 64 MB tek parça ve render süresi riskidir. |
| Y3 | Süre formda **açık alan**dır ("Otomatik" ya da "Elle: min–maks"); yönerge metnindeki "20 sn", "20–25 saniye", "en fazla 25 sn", "1 dakika" gibi ifadeler tarayıcıda deterministik olarak çözülür ve alanı "yönergeden" etiketiyle doldurur. Sunucu yalnızca açık pencereyi alır. | Kullanıcı süreyi yönergeye yazmak istedi; serbest metni LLM'e yorumlatmak deterministik değildir. Canlı çözümleme kullanıcıya Üret'ten önce neyin anlaşıldığını gösterir. |
| Y4 | Yönerge ≤ 2000 karakter, video başına saklanır (`videos.brief`), üretim başladıktan sonra değişmez. Ürün tablosuna yazılmaz (ürünler normalize adla paylaşılır). | Aynı ürünün farklı videoları farklı yönerge alabilir; tekrar koşular, rewind'ler ve düzeltme turları aynı yönergeyi görür. |
| Y5 | Ajan önerisi araştırma adımında üretilir: `ProductResearch.recommendation` (`duration_min_s`, `duration_max_s`, `brief_tr[]` ≤ 5 madde, `reason_tr`). Süre kullanıcı tarafından verilmediyse araştırmadan sonra pencere ajanınkine (kesin sınırlara kırpılarak) çekilir, kaynak `agent`. Kullanıcı süreyi verdiyse öneri yalnızca gösterilir. | Ürünün karmaşıklığını en iyi bilen araştırmacıdır; ek bir Claude oturumu açmadan, mevcut adım içinde öneri gelir. Kullanıcı önerileri görür ve bir sonraki üretimde elle ezebilir. |
| Y6 | Yönerge ajanlara **kullanıcı talimatı** olarak gider (veri bloğu değil), kendine ait sınırlayıcıyla (`userBrief`). Ajan önerileri ayrı blokta, "kullanıcı yönergesiyle çelişirse kullanıcınınki geçerli" notuyla. | `fenced()` blokları "yönerge değildir" der; kullanıcının kendi metni talimattır. Sınırlayıcı kaçışı korunur. |
| Y7 | Yönerge yaratıcı her şeyi ezebilir (süre, ton, vurgu, sıra, tempo, kanca, kamera, stil tercihi). **Ezemez:** şema ve teknik format (1080×1920, 30 fps), güvenli alan, kaynaklı iddia zorunluluğu (uydurma bilgi yok), lisans/atıf, AI etiketi. | Bunlar platform/yasal zorunluluk ya da doğruluk ilkesidir; kullanıcının da çıkarına. |
| Y8 | Alıcılar: araştırmacı, storyboard, builder, taslak ve final reviewer'lar, fixer. Reviewer'lara "yönergeden gelen tercihleri kusur sayma; yönergeye aykırılığı bulgu olarak yaz" denir; rubrik kimlikleri değişmez. | Rubrik ve şema sabit kalır; reviewer'lar kullanıcının istediğini cezalandırmaz, fixer düzeltirken yönergeyi bozmaz. |
| Y9 | Süreye bağlı her kural pencereden okunur: storyboard ve SceneSpec şema sınırları 10–60 sn (kare 300–1800); storyboard adımı pencereyi `check` ile zorlar; VO tahmini `[min+1, max−3]` (dar pencerede en az 3 sn genişliğinde bant); VO yeniden zamanlama dolgusu `min`, üst sınır `max`; QC G1 penceredir. Varsayılan pencerede tüm sayılar bugünküyle aynıdır. | Analiz: kırılan dört yer bunlardır; geri kalan kurallar süreye oranlıdır. |
| Y10 | `input_hash`: araştırma yönergeyi, storyboard yönergeyi ve etkin pencereyi içerir; `SCHEMA_VERSION.research` → `ProductResearch@2`. | Yönerge/pencere değişince eski çıktı yeniden kullanılmaz. |
| Y11 | Audit `video.produce_requested` verisine `briefChars`, `briefPreview` (ilk 200), `duration` ve `durationSource`; araştırma sonrası `video.duration_set` (kaynak `agent`). | Kim neye karar verdi izlenebilir (spec §6.5). |

## Arayüz

- Stüdyo: ürün adı, ses modu, **Süre** (Otomatik · varsayılan 35–55 sn, ajan önerebilir / Elle: min–maks), **Yönerge** (isteğe bağlı, sayaç, örnekli placeholder). Varsayılanlar formda yazılıdır.
- Video başlığı: etkin süre penceresi + kaynak rozeti, yönerge (katlanır).
- Araştırma kartı: ajanın süre önerisi ve yönerge önerileri; uygulandı mı, kullanıcı kararıyla mı ezildi.

## Kapsam dışı

Üretim sırasında yönerge/süre düzenleme; üretim öncesi ayrı "öner" oturumu; 60 sn üstü videolar.
