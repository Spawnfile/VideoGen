# Tailscale Serve check (2026-10-11)

Machine `alper-pc`, Tailscale 1.102.2, tailnet name `alper-pc.tailef7c0d.ts.net`. Port 443 serves `127.0.0.1:8091` (another service, untouched); VideoGen uses **8443**.

| Check | Result |
|---|---|
| `node bin/tailnet.mjs enable --port 8443 --target 5181` | `https://alper-pc.tailef7c0d.ts.net:8443 → http://127.0.0.1:5181 (tailnet only)` |
| `GET /api/health` through the tailnet URL | 200, certificate verified (`ssl_verify_result` 0) |
| Host header at the API | `alper-pc.tailef7c0d.ts.net:8443` (Serve keeps the client's Host, `ipn/ipnlocal/serve.go:978`) |
| Identity | `Tailscale-User-Login: alper.ekmekci54@gmail.com` set by Serve; a client copy is deleted first (`serve.go:1080–1105`) |
| Write with `Origin: https://alper-pc.tailef7c0d.ts.net:8443` | 202 |
| Write with a foreign Origin | 403 `forbidden: cross-origin write` |
| `POST /api/tiktok/connect` over the tailnet | 409 `connect_on_host` |
| SSE `/events` | heartbeats arrive in the same second over the tailnet as on loopback (14:35:35.30 vs 35.17; 14:35:50.25 vs 50.12): no buffering |
| Funnel | off (`bin/tailnet.mjs status` exits 2 if it is ever on) |
