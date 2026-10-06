# M4a — Gerçek Claude doğrulaması

Max aboneliğiyle; ücretli API anahtarı yok. Kullanıcı adı, ev yolu ve kimlik bilgisi içermez. Gerçek veritabanına yazılmadı: geçici `videogen_m4a_check` veritabanı ve `/tmp/videogen-m4a-check` veri klasörü kullanıldı, ikisi de koşudan sonra silindi.

## 1. Zamanlama ve kullanım kapısı

| An (UTC) | Olay |
|---|---|
| 2026-10-06 10:21 | İlk deneme: yığın açılınca `get_usage` 5 sa **%83** (sıfırlanma 12:00), muhafız `blocked: true` (`five_hour`). Handoff kapısı (5 sa ≥ %80) gereği **hiç oturum açılmadan** durduruldu; geçici DB'de 0 oturum. Yığın kapatıldı, DB ve klasör silindi |
| 2026-10-06 12:01 | Kullanıcı kararı (seçenek 1): sıfırlanmadan sonra koş. Muhafız açık, 5 sa %2, 7 gün %36 |
| 12:01:55 → 12:07:52 | Tek ürün koşusu: run `done`, toplam **5 dk 57 sn** |

## 2. Tarif

```bash
docker exec videogen-pg psql -U videogen -d videogen -c "CREATE DATABASE videogen_m4a_check"
mkdir -p /tmp/videogen-m4a-check
VG_DATABASE_URL=postgres://videogen_app:videogen_app@127.0.0.1:5433/videogen_m4a_check \
VG_ADMIN_DATABASE_URL=postgres://videogen:videogen@127.0.0.1:5433/videogen_m4a_check \
VG_DATA_DIR=/tmp/videogen-m4a-check VG_NO_BROWSER=1 env -u CLAUDECODE node bin/videogen.mjs > real.log 2>&1 &
# başlatıcının PID'i (alt kabuk değil) saklanır; /api/health hazır olunca:
H=(-H 'Host: 127.0.0.1:5180' -H 'Origin: http://127.0.0.1:5180' -H 'content-type: application/json')
curl -s "${H[@]}" http://127.0.0.1:5180/api/usage/guard          # blocked: true ise koşma
for role in researcher storyboarder; do curl -s "${H[@]}" -X PUT -d '{"model":"haiku","effort":"low"}' http://127.0.0.1:5180/api/roles/$role; done
curl -s "${H[@]}" -X POST -d '{"productName":"tükenmez kalem","audioMode":"silent"}' http://127.0.0.1:5180/api/videos
# … GET /api/runs/<runId> bitene kadar; ekran: npx playwright screenshot --channel chrome … "/?video=<videoId>"
kill -INT <başlatıcı PID>
docker exec videogen-pg psql -U videogen -d videogen -c "DROP DATABASE videogen_m4a_check WITH (FORCE)"
rm -r /tmp/videogen-m4a-check
```

## 3. Sonuç

```json
{
 "run": { "status": "done", "progress": 99, "etaS": null },
 "steps": [
  { "key": "research", "status": "done", "attempt": 1, "progressSource": "agent", "süre": "5:00",
    "note": "Tükenmez kalem, kalıcı mürekkek ile yazı yazma aracı. Adı, toptan yavaş tüketilen mürekkekin görünen \"tükenmezliğinden\" kaynaklanır." },
  { "key": "storyboard", "status": "done", "attempt": 1, "progressSource": "agent", "süre": "0:57",
    "note": "9 vuruş · 45 sn · kanca: Görsel açılış" }
 ],
 "video": { "status": "needs_human", "note": "Storyboard hazır. Sahne kurulumu ve taslak render bu sürümde henüz yok.", "difficulty": "procedural" },
 "artifacts": ["storyboard", "research"]
}
```

Oturumlar (`agent_sessions`):

| Rol | Model | Durum | Tur | Token | Maliyet (liste fiyatı, ödenmedi) | `resume` |
|---|---|---|---|---|---|---|
| researcher | `claude-haiku-4-5-20251001` | done / completed | 25 | 592 110 | 0,6128 $ | hayır |
| storyboarder | `claude-haiku-4-5-20251001` | done / completed | 5 | 79 587 | 0,0875 $ | hayır |

- **Yapılandırılmış çıktı:** haiku iki sözleşmeye de **ilk denemede** uydu: düzeltme turu 0, çökme sürdürmesi 0, limit reddi 0. Bir adımın oturum sınırı (1 + 2 düzeltme + 1 çökme) hiç zorlanmadı.
- **Araştırma:** 8 parça (`barrel`, `cap`, `refill`, `ball_point`, `spring`, `clip`, `click_mechanism`, `ink`), 8 iddia (her biri 1 kaynak; `primary` ve `independent` türleri; 6 ayrı alan adı), 6 mekanizma adımı, 10 ilginç bilgi, zorluk `procedural`.
- **Storyboard:** seslendirmesiz, 45 sn, kanca `reveal` ("Tükenmezliğin Sırı"), 9 bitişik vuruş, ikinci kanca 23 sn (%51), ödül 33 sn (%73), lensler 75–135 mm; bütün parça ve iddia kimlikleri araştırmada var (çapraz kontrol geçti).
- **Kullanım:** 5 sa penceresi %2 → %4 (bu koşunun payı ≈ **%2**), 7 gün %36 → %36. Video başına toplam 671 697 token.

Ekran: `docs/m4/real-studio.png` (başlık, adım listesi, araştırma ve storyboard kartları; incelendi).

## 4. Bulgular

1. **Gerçek bulgu, düzeltildi:** Video başına 5 sa payı `null` görünüyordu. Run başı izi `get_usage`'tan (`16:59:59.916Z`, milisaniye), sonu `rate_limit_event`'ten (`17:00:00Z`, tam saniye) geldi; aynı pencere olduğu hâlde metinler birebir karşılaştırılıyordu. Düzeltme: sıfırlanma anları 60 sn içindeyse aynı pencere sayılıyor. Test `treats the same 5 h window written by get_usage (ms) and rate_limit_event (s) as one window` önce başarısız, sonra geçti; T2 commit'ine katlandı.
2. **Kalite notu (sözleşme değil):** haiku/low metinlerinde Türkçe yazım hataları ("mürekkek") ve İngilizce karışması ("Tungsten Carbide", "Retraktabl") var; bazı vuruşlar tutarsız parça çiftleri içeriyor (kapak ve tıklama mekanizması aynı karede). Spec K12 rolleri sonnet/opus'tur; bu koşu yalnızca sözleşme yolunu kanıtlar. M4b "ilk gerçek ürün" bunu gerçek modellerle ölçer.
3. **G2 yumuşak kuralı:** sayısal iddiaların hepsi tek kaynaklı; `researchWarnings` adıma bağlı olmadığı için uyarı yazılmadı (son review M3, ertelendi).

## 5. Toplam gerçek Claude kullanımı (M4a)

2 haiku oturumu (bu koşu). İlk denemede kullanım kapısı nedeniyle 0 oturum. Son review alt ajanı (Claude Fable 5.1) ayrı bir Claude Code alt ajanıdır; pipeline oturumu değildir.
