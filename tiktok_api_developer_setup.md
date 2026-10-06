# TikTok Developer Hesabı ve OAuth Kurulum Kılavuzu
Amaç: Kişisel TikTok hesabına API ile video göndermek. Çalışan örnek: `~/tiktok-poster/auth.py`. API kullanımı ve limitler: `tiktok_api_kullanim.md`.
2026-10-06'da uçtan uca yapıldı. Uygulama review'una gerek kalmadan **Sandbox** ile çalışıyor.

## 1. Portal (developers.tiktok.com)
1. E-postayla developer hesabı aç → **Manage apps** → **Connect an app**. Kişisel kullanımda organization gerekmiyor.
2. Üstten **Sandbox** moduna geç → **Create Sandbox**. Sandbox'ın kendi client key'i `sb…` ile başlar, API'de bunu kullan.
   - Neden sandbox: Production'da review için ToS, Privacy ve website gerekir (gerçek site, linkler ana sayfada görünür olmalı). Onaysız production uygulama da zaten sandbox'la aynı kısıtlara tabi.
3. URL doğrulaması isteyebilir: **Verify → Domain** (`www` olmadan ana domain) → verilen değeri DNS'e `TXT @` kaydı olarak ekle → Verify. Domain doğrulaması alt alan adlarını da kapsar, tersi geçerli değil. Belgelenen tek yöntem DNS TXT.
4. **Platforms: Desktop**'u işaretle. Desktop seçilince redirect olarak localhost kullanılabiliyor, site gerekmiyor.
5. **Add products:** Login Kit ve Content Posting API. Content Posting içinde **Direct Post**'u aç.
6. **Login Kit → Desktop → Redirect URI:** `http://localhost:3455/callback/`
   - Birebir eşleşmeli (sondaki `/` dahil). Web bölümü yalnızca https kabul ediyor, oraya girme. Kural: localhost/127.0.0.1 olmalı ve port zorunlu.
   - URI hiç girilmemişse TikTok "redirect_uri'yi düzeltin" hatası gösterir (yaşandı).
7. **Scopes:** `user.info.basic`, `video.publish` (direct), `video.upload` (taslak).
8. **Sandbox settings → Target users → Add account:** Paylaşım yapılacak TikTok hesabıyla giriş yap (en fazla 10 hesap; etkinleşmesi bir saati bulabilir). Sonra **Apply**.

## 2. Gizli bilgiler
- `~/tiktok-poster/.env` (izin 600): `TIKTOK_CLIENT_KEY=`, `TIKTOK_CLIENT_SECRET=`, isteğe bağlı `TIKTOK_REDIRECT_URI=`.
- Secret'ı sohbete yazdırma, kullanıcı kendisi doldursun (`! nano ~/tiktok-poster/.env`). Kontrolü uzunlukla yap: key 18, secret 32 karakter.
- `.gitignore`: `.env`, `tokens.json`.

## 3. OAuth akışı (Desktop + PKCE)
- `python3 ~/tiktok-poster/auth.py` → 127.0.0.1:3455'te dinler, tarayıcıyı açar, kullanıcı izin verir, `tokens.json` yazılır (600).
- Arka planda çalıştır (`run_in_background`), URL'yi kullanıcıya ver, bitince bildirim gelir.
- Authorize: `https://www.tiktok.com/v2/auth/authorize/?client_key&response_type=code&scope=a,b,c&redirect_uri&state&code_challenge&code_challenge_method=S256`
- **TikTok'a özgü:** `code_challenge = hex(SHA256(verifier))`. Standart base64url DEĞİL. Verifier 43–128 karakter, `[A-Za-z0-9-._~]`.
- Token: `POST https://open.tiktokapis.com/v2/oauth/token/` (form-urlencoded): `client_key, client_secret, code, grant_type=authorization_code, redirect_uri, code_verifier`.
  Yanıt: `access_token` (86400 sn), `refresh_token` (365 gün), `open_id`, `scope`.
- Yenileme: aynı endpoint, `grant_type=refresh_token` + `refresh_token`. Dönen yeni refresh_token'ı KAYDET (değişebilir).
- İptal: `POST /v2/oauth/revoke/` (`client_key, client_secret, token=<access_token>`).

## 4. Doğrulama
- `GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name` → `error.code == "ok"`.
- `POST /v2/post/publish/creator_info/query/` → hesap gizliyse `privacy_level_options` içinde `PUBLIC_TO_EVERYONE` yoktur.

## 5. Tuzaklar
- Port 3455 doluysa eski auth.py çalışıyor olabilir: `ss -ltn | grep 3455`.
- Production'a geçince client key ve secret değişir, redirect URI ve scope'ları orada da tanımlamak gerekir.
