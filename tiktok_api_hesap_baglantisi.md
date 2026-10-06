# TikTok API — Bağlı Hesap ve Uygulama Bilgisi
Son doğrulama: 2026-10-06. Yalnızca okuma sorgularıyla yapıldı (`user/info`, `creator_info/query`), yayın yapılmadı.
Kurulum: `tiktok_api_developer_setup.md`, kullanım: `tiktok_api_kullanim.md`.

## Aktif bağlantı
| Alan | Değer |
|---|---|
| TikTok hesabı | **@whats.inside59** ("What’s Inside ?") |
| open_id | `-000pZAi-3HCH27SH5_ru1RHLvWN6jH-utim` |
| Uygulama | Sandbox, client key `sbawa9gbkywuxcyonp` (secret `.env` içinde) |
| Scope'lar | `user.info.basic`, `video.publish`, `video.upload` |
| Hesap gizliliği | Herkese açık (`PUBLIC_TO_EVERYONE` seçenekler arasında) |
| En uzun video | 600 sn |
| Redirect URI | `http://localhost:3455/callback/` (Desktop) |

## Bu hesapta yayın
- Hesap herkese açık, uygulama onaysız. Bu yüzden Direct Post `unaudited_client_can_only_post_to_private_accounts` hatası verir.
- Taslak modunu kullan: `python3 ~/tiktok-poster/post.py VIDEO.mp4 --draft`. Kullanıcı açıklamayı TikTok'ta yazar ve **Herkes** ile paylaşır.
- Limit: 24 saatte en fazla 5 bekleyen taslak.

## Dosyalar
- `.env` (bu klasördeki kopya; asıl dosya `~/tiktok-poster/.env`): `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`. GİZLİ. Paylaşma, git'e ekleme.
- Token: yalnızca `~/tiktok-poster/tokens.json` içinde (access 24 saat, refresh 365 gün). Script'ler bu dosyayı kullanır ve yenilerken üzerine yazar. Kopyalama, kopyası eskir.
- Eski bağlantı: kişisel hesap @alperekmekci34, eski sandbox key `sbawj78beirdt690jm`, token `~/tiktok-poster/tokens.eski-sbawj78.json`.
