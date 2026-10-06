# TikTok Content Posting API — Kullanım ve Limitler Kılavuzu
Çalışan örnek: `~/tiktok-poster/post.py` (Python stdlib, bağımlılık yok). Hesap/OAuth kurulumu: `tiktok_api_developer_setup.md`.
2026-10-06'da sandbox uygulama + @alperekmekci34 hesabıyla uçtan uca test edildi.

## 1. Hızlı kullanım
- Taslak (önerilen): `python3 ~/tiktok-poster/post.py VIDEO.mp4 --draft`. Video TikTok gelen kutusuna düşer, kullanıcı açıklamayı yazıp **Herkes** ile paylaşır.
- Direct Post: `python3 ~/tiktok-poster/post.py VIDEO.mp4 "başlık" --privacy SELF_ONLY` (yalnızca hesap GİZLİYKEN çalışır, aşağıya bak).
- Token `~/tiktok-poster/tokens.json` içinde: access 24 saat, refresh 365 gün geçerli. `post.py` süresi dolanı kendisi yeniler. Refresh token da biterse `python3 auth.py`.

## 2. Onaysız (unaudited/sandbox) uygulama kuralları: ÖLÇÜLDÜ
| Durum | Direct Post | Taslak (inbox) |
|---|---|---|
| Hesap gizli | Çalışır, video zorunlu olarak `SELF_ONLY` | Çalışır |
| Hesap herkese açık | `403 unaudited_client_can_only_post_to_private_accounts` | Çalışır. Uygulamada **Herkes** seçilebiliyor |
- Sonuç: Herkese açık yayın için taslak modunu kullan. Direct Post ile herkese açık yayın ancak TikTok audit'i ile açılır (2–6 hafta, red oranı yüksek).
- `SELF_ONLY` videoyu "Herkes" yapmak için hesabın herkese açık olması gerekiyor (gizli hesapta seçenek kapalı).

## 3. Endpoint'ler (taban `https://open.tiktokapis.com/v2/post/publish`)
Header: `Authorization: Bearer <access_token>`, `Content-Type: application/json; charset=UTF-8`.
1. `POST /creator_info/query/` body `{}` → `privacy_level_options`, `max_video_post_duration_sec`, `duet/stitch/comment_disabled`, `creator_username`. Direct Post'tan önce ZORUNLU (UX kuralı). privacy_level bu listeden seçilmeli.
2a. Direct: `POST /video/init/` body:
   `{"post_info":{"title","privacy_level","disable_duet","disable_stitch","disable_comment"},"source_info":{"source":"FILE_UPLOAD","video_size","chunk_size","total_chunk_count"}}`
   İsteğe bağlı: `video_cover_timestamp_ms`, `brand_content_toggle`, `brand_organic_toggle`, `is_aigc` (yapay zekâyla üretilen içerikte true). title en fazla 2200 karakter.
2b. Taslak: `POST /inbox/video/init/` body yalnızca `{"source_info":{...}}`. title/privacy alanı yok, onları kullanıcı uygulamada girer.
3. Dönen `upload_url`'e `PUT` (1 saat geçerli). Header'lar: `Content-Type: video/mp4|video/quicktime|video/webm`, `Content-Length`, `Content-Range: bytes {ilk}-{son}/{toplam}`. Başarı: HTTP 201 (son parça).
4. `POST /status/fetch/` body `{"publish_id"}` → `PROCESSING_UPLOAD` → `PUBLISH_COMPLETE` (direct) / `SEND_TO_USER_INBOX` (taslak) / `FAILED` (+`fail_reason`). 5 sn aralıkla sorgula; ölçülen süre 10–20 sn.
- `PULL_FROM_URL` (`video_url`) seçeneği de var ama domain'in DNS TXT ile doğrulanmış olması, https olması ve yönlendirme (3xx) olmaması gerekir. Yerel dosya için FILE_UPLOAD kullan.

## 4. Parçalama (chunk)
- Test edilen: ≤64 MB dosya TEK parça (`chunk_size = video_size`, `total_chunk_count = 1`). 4.4 ve 5.5 MB ile 201 döndü.
- Daha büyük dosyada post.py 10 MB parça kullanıyor, `count = floor(boyut/10MB)` ve son parça kalan baytların tamamını alıyor. Bu yol test EDİLMEDİ; resmi `content-posting-api-media-transfer-guide` sayfasından doğrula.

## 5. Limitler (TikTok kesin rakam yayımlamıyor; üçüncü taraf kaynaklar)
- Bekleyen taslak: kullanıcı başına 24 saatte en fazla 5 → `spam_risk_too_many_pending_share`.
- Direct Post: hesap başına günde yaklaşık 15 (15–25 arası, tüm API uygulamaları için ortak) → `spam_risk_too_many_posts`.
- İstek hızı: access token başına dakikada 6 istek → `429 rate_limit_exceeded`.
- Onaysız uygulama: 24 saatte yaklaşık 5 farklı paylaşım yapan kullanıcı → `reached_active_user_cap`.
- Diğer hatalar: `401 access_token_invalid` (token'ı yenile), `spam_risk_user_banned_from_posting`.

## 6. Video ve içerik notları
- Kullanılan format: MP4, H.264 + AAC, 1080×1920, 30 fps. `yuvj420p` sorunsuz kabul edildi.
- Hızlı test videosu: `ffmpeg -f lavfi -i testsrc2=size=1080x1920:rate=30:duration=6 -f lavfi -i sine=frequency=440:duration=6 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest test.mp4`
- Türkiye'de Creator Rewards (izlenme başına ödeme) yok. Gelir yolları: marka iş birlikleri, affiliate, LIVE hediyeleri (1.000 takipçi). VPN ya da sahte ülke kullanmak program şartlarına aykırı.
