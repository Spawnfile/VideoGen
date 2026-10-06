# VideoGen

A local-only, single-user video generation studio: a Postgres-backed API + worker platform driven by a Claude subscription (no paid API keys), with a Turkish web UI.

![VideoGen shell](docs/m2/shell.png)

*Studio shell with the live usage footer (fixture values: 5 h window 35 %, 7 d window 12 %).*

## Quick start

```bash
nvm use            # Node 24 (see .nvmrc)
npm install
npm start          # Postgres -> migrations -> API + Worker -> browser
```

`npm start` brings up the Postgres container, applies migrations, builds the SPA if it is missing or stale, starts the API and the worker as supervised child processes and opens http://127.0.0.1:5180. Stop it with `Ctrl+C`. Use `VG_NO_BROWSER=1 npm start` to skip opening the browser.

Prerequisites: Docker (for Postgres 17), a logged-in Claude subscription (`claude auth login` once, in a terminal), Google Chrome (only for the smoke tests).

## Commands

| Command | What it does |
|---|---|
| `npm run db:up` | Start the Postgres 17 container (`videogen-pg`, 127.0.0.1:5433) and wait until healthy |
| `npm run db:migrate` | Apply Drizzle migrations (as the owner role) |
| `npm run dev:api` | API with file watching (Fastify, 127.0.0.1:5180) |
| `npm run dev:worker` | Worker (auth status, usage poller, heartbeat, commands) |
| `npm run dev:web` | Vite dev server on 5173, proxying to the API on 5180 |
| `npm run build` | Build the SPA into `apps/web/dist` |
| `npm start` | Single-command launcher with supervised restarts |
| `npm test` | Unit and integration tests (Vitest; needs the Postgres container) |
| `npm run test:smoke` | Playwright smoke tests against a throwaway stack on port 5190 (system Chrome) |
| `npm run typecheck` | `tsc -p tsconfig.json` (TypeScript 7) |

## Architecture

Process model and event channels are specified in [spec section 5.1](docs/superpowers/specs/2026-10-06-videogen-design.md#51-süreçler). What is real after milestone M2:

- **`apps/api`** (Fastify 5): REST (`/api/health`, `/api/claude/status`, `/api/usage`, `/api/claude/refresh`, `/api/audit/verify`), an SSE stream (`/events`) with `Last-Event-ID` replay, and the built SPA, all on one origin.
- **`apps/worker`**: reads Claude auth status and usage through the bundled CLI / Agent SDK (`get_usage`, zero tokens), publishes a heartbeat every 2 s and handles `vg_commands`. It is crash-only: if its LISTEN connection drops it exits and the launcher restarts it.
- **`apps/web`** (React 19, Vite, TanStack Query): Turkish shell with live SSE store, usage footer and the Claude settings screen. Library, Audit and Assets entries are present but disabled.
- **`packages/db`**: Drizzle schema, migrations, append-only audit log, and the `ui_events` outbox (id-ordered, `NOTIFY`-driven) plus a transient `vg_live` channel.
- **`packages/shared`**: config, paid-key guard, usage and Claude-auth mappers (per-source unit normalization), shared event types.

## Data

Runtime data lives in `~/videogen-data`. Today only `logs/` exists (`api.log`, `worker.log`, appended by the launcher; no rotation yet). Library, assets, backups and run directories arrive in later milestones. The database itself lives in the Docker volume `videogen-pg`.

## Security

- **Localhost only.** Everything binds `127.0.0.1`. A guard runs on every request, including static files, 404s and the SSE stream: the `Host` header must be `127.0.0.1`, `localhost` or `[::1]` (strict regex, optional port), and writes additionally require an absent or loopback `Origin`. CORS stays closed (single origin).
- **Paid-key guard.** If a paid API key is present in the environment (a shared list of exact names plus provider-prefixed patterns, plus Bedrock / Vertex / Foundry routing flags), the launcher, the API and the worker refuse to start. The message names the variables, never their values. The same list strips these variables from every child process environment.
- **Tamper-evident audit.** `audit_log` is append-only: the app role has no `UPDATE`, `DELETE` or `TRUNCATE`, a trigger blocks them for the owner too, and every row carries a SHA-256 hash chained to the previous row over a canonical JSON form (`jsonb_build_array`, so field boundaries cannot be forged). `GET /api/audit/verify` recomputes the chain.
- **Secrets are never written.** Audit data with secret-like keys (token, secret, password, api key, authorization, cookie, private key, in any spelling) is rejected. From the Claude account only `loggedIn`, `authMethod` and `subscriptionType` are kept; email and organization are dropped.

## Status

- M0 (assumption verification): done, see [docs/m0/report.md](docs/m0/report.md).
- M2 (platform skeleton): done, see [docs/m2/report.md](docs/m2/report.md).
- Next: the M1 listening test, then M3 (live agent layer).
