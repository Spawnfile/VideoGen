# M3 — Gerçek Claude doğrulamaları

Hepsi Max aboneliğiyle, **haiku** ile; ücretli API anahtarı yok (`apiKeySource: none`). Kullanıcı adı, ev yolu ve kimlik bilgisi içermez. Toplam gerçek oturum M3 boyunca: **7** (plan öncesi sondaj 2 + M3a T6 4 + M3b T7 1).

## 1. M3a Task 6 — `SdkClaudeDriver` elle doğrulama (`spikes/m3`, 4 oturum, ilk deneme dahil)

```json
{
  "apiKeySource": "none",
  "cli": "2.1.290",
  "mcp": [
    {
      "name": "videogen",
      "status": "connected",
      "source": "sdk"
    }
  ],
  "hiddenToolsAbsent": true,
  "mcpTools": [
    "mcp__videogen__get_context",
    "mcp__videogen__read_spec",
    "mcp__videogen__register_artifact",
    "mcp__videogen__report_progress",
    "mcp__videogen__write_spec"
  ],
  "progress": [
    40
  ],
  "denied": [
    "Bash: Heavy commands are not allowed in Bash; use mcp__videogen__extract_frames or mcp"
  ],
  "tools": [
    "mcp__videogen__report_progress:done",
    "Bash:denied"
  ],
  "accounting": {
    "numTurns": 3,
    "costUsd": 0.024055800000000002,
    "modelUsage": {
      "claude-haiku-4-5-20251001": {
        "inputTokens": 983,
        "outputTokens": 358,
        "cacheReadInputTokens": 35128,
        "cacheCreationInputTokens": 8885,
        "webSearchRequests": 0,
        "costUSD": 0.024055800000000002,
        "contextWindow": 200000,
        "maxOutputTokens": 32000,
        "thinkingTokens": 200,
        "canonicalModel": "claude-haiku-4-5",
        "provider": "firstParty",
        "costBasis": "list"
      }
    },
    "tokens": 45354,
    "terminalReason": "completed",
    "results": 1
  }
}
```

```
interrupt: error_during_execution aborted_streaming iterator threw; abortError = true 4740 ms
```

Okuma: in-process `videogen` MCP bağlı; gizli araçlar listede yok; `report_progress` yüzdesi 40 kaydedildi; ağır Bash komutu `PreToolUse` korumasıyla reddedildi ve gerekçe doğru MCP aracını gösterdi; streaming-input'ta `interrupt()` sonrası `result{error_during_execution, aborted_streaming}` geldi, iterator ancak giriş kapanınca fırlattı (toplam 4,7 sn).

## 2. M3b Task 7 — tam yığın uçtan uca (1 oturum)

Başlatma: `env -u CLAUDECODE VG_NO_BROWSER=1 node bin/videogen.mjs` (npm değil; SIGINT doğrudan başlatıcıya; skill bağlantılarını başlatıcı kendisi kurar). Chat rolü geçici olarak `haiku`/`low`, sonra `opus`/`high`'a geri alındı (varsayılandan farklı rol: 0).

| Adım | Çıktı |
|---|---|
| `PUT /api/roles/chat {"model":"haiku","effort":"low"}` | `{"role":"chat","model":"haiku","effort":"low"}` |
| Mesaj: "Merhaba! Tek cümleyle kendini tanıt ve get_context aracını bir kez çağır." | `user:done,assistant:done` (6 sn) |
| `GET /api/sessions/<id>/trace` | `reasoning:Düşünce:done \| text:Yanıt:done \| coding:get_context:done \| reasoning:Düşünce:done \| text:Yanıt:done` |
| Oturum | `claude-haiku-4-5-20251001`, `low`; boşta → `interrupt` → `cancelled` (`terminalReason: completed`); 32.532 token; 2 tur; liste fiyatıyla eşdeğer 0,036 $ (abonelikten düşer) |
| Transcript arşivi | `transcript_blob_sha IS NOT NULL` → `t` |
| Kullanım (footer, `get_usage`) | 5 sa %9–10 · 7 gün %24–25 |
| Durdurma | Başlatıcı PID'ine SIGINT → < 1 sn'de çıkış; 5173/5180/5190 boş; yetim `claude` süreci yok |

**Bulgu:** Turun `result` metni yalnızca **son** metin bloğunu taşır. Model araçtan önce de yazdığında ("VideoGen'in chat asistanıyım, …"), arayüz yanıt gelince izdeki bütün metin bloklarını gizlediği için bu ilk cümle kayboluyordu. Fake fixture'larında araçtan önce metin olmadığından smoke yakalayamadı. Düzeltme: yalnızca son metin bloğu (yanıtın kendisi) izden düşer (`withoutAnswer`, birim testli). Ekran: `docs/m3/real-chat.png` (düzeltme sonrası, aynı thread; yeni Claude turu açılmadan yeniden çekildi).
