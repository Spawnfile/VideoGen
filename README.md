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

`npm start` brings up the Postgres container, applies migrations, always rebuilds the SPA, starts the API and the worker as supervised child processes and opens http://127.0.0.1:5180. Stop it with `Ctrl+C`. Use `VG_NO_BROWSER=1 npm start` to skip opening the browser.

Prerequisites: Docker (for Postgres 17), a logged-in Claude subscription (`claude auth login` once, in a terminal), Google Chrome (only for the smoke tests).

`npm install` may warn that install scripts (esbuild) were blocked; this is harmless for VideoGen.

If you run `npm run build` while the API is running (for example next to `npm run dev:api`), restart the API afterwards: static assets are registered when the API starts. `npm start` always builds first, so it is not affected.

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
| `npm run test:blender` | vg_blender unit tests inside Blender 5.2 on the NVIDIA GPU (`bin/blender-gpu`) |
| `npm run test:render` | Real-tool integration: sandboxed (bubblewrap) two-phase build of the example pen, Blender ↔ three.js anchor equivalence, GPU preview stills, sandbox boundary, timeout; M4c: the Remotion draft in system Chrome (frames, §7.5 probe, bundle cache, cancel kills Chrome) and the draft_render + draft_review steps on the full 45 s pen draft; M5a: the Blender final render (RGBA frames, resume) and `Final3D` over frames. On a GPU-less machine set `VG_REMOTION_GL=swangle`; M5b: the "rötuş" end-to-end (a compose-scope fix round through "yayına hazır", moved out of `npm test` to keep it under 6 min). Without Blender 6 tests |
| `bin/scene-fixtures.sh` / `bin/k19-options.sh` | Regenerate the committed pen build fixtures / the three channel-identity option images (real Blender) |
| `node bin/assets.mjs add … / list` | Asset ledger: import a music or SFX file with its license (CC0, CC-BY-4.0 with attribution, Pixabay are allowed; others are stored as rejected) |
| `node --import tsx apps/worker/src/render/qc-cli.ts <video>` | Automatic quality checks (qc_probe) of any MP4, e.g. the pen pilot calibration |
| `npm run test:smoke` | Playwright smoke tests (S1 boot, S2a product → research → storyboard → build / difficulty gate / cancel, S2b build card + media Range / same-session build fix / cancel during build / channel identity, S3 liveness, S4 reconnect + worker death, S5 chat, M4c S2 with the draft: review, Range playback from the library, one fix round; M5a S2 through the final: final render, compose, automatic gates, both variants from the library) against a throwaway stack on port 5190 with the fake Claude driver (system Chrome); the `videogen_smoke` database and `/tmp/videogen-smoke` are removed afterwards; M5b S2 through "Yayına hazır": review panel with three reviewers, K13 score, a compose-scope fix round ("Düzeltme turu 1/3"), library score (19 passed / 13 skipped) |
| `VG_SCREENSHOTS=1 npx playwright test -c tests/smoke/playwright.config.ts screens` | Regenerate the UI screenshots in `docs/m3/` and `docs/m4/` |
| `node bin/link-skills.mjs` | Regenerate `claude-plugin/skills/*` symlinks from `claude-plugin/skills.manifest.json` (the launcher does this on every start) |
| `npm run typecheck` | `tsc -p tsconfig.json` (TypeScript 7) |

## Architecture

Process model and event channels are specified in [spec section 5.1](docs/superpowers/specs/2026-10-06-videogen-design.md#51-süreçler). M3 added the live agent layer: `packages/claude` (driver interface with the Agent SDK and a fixture-replaying fake driver, roles, `PreToolUse` guard, in-process `videogen` MCP tools, stream-to-trace mapper), session runner/manager and usage guard in the worker, session/trace/chat/role endpoints in the API, and in the UI live agent cards, the live ThinkingState trace and a chat panel (see [docs/m3/report.md](docs/m3/report.md)). M4a added the pipeline core: artifact contracts, pipeline tables, a leased job queue with startup recovery, the orchestrator with monotone weighted progress and ETA, the research and storyboard agent steps (structured output, same-session fixes, difficulty gate), produce/video/run endpoints, the Studio production panel and the Library (see [docs/m4/m4a-summary.md](docs/m4/m4a-summary.md)). What was real after milestone M2:

- **`apps/api`** (Fastify 5): REST (`/api/health`, `/api/claude/status`, `/api/usage`, `/api/claude/refresh`, `/api/audit/verify`), an SSE stream (`/events`) with `Last-Event-ID` replay, and the built SPA, all on one origin.
- **`apps/worker`**: reads Claude auth status and usage through the bundled CLI / Agent SDK (`get_usage`, zero tokens), publishes a heartbeat every 2 s and handles `vg_commands`. It is crash-only: if its LISTEN connection drops it exits and the launcher restarts it.
- **`apps/web`** (React 19, Vite, TanStack Query): Turkish shell with live SSE store, usage footer and the Claude settings screen. Library, Audit and Assets entries are present but disabled.
- **`packages/db`**: Drizzle schema, migrations, append-only audit log, and the `ui_events` outbox (id-ordered, `NOTIFY`-driven) plus a transient `vg_live` channel.
- **`packages/shared`**: config, paid-key guard, usage and Claude-auth mappers (per-source unit normalization), shared event types.

## Data

Runtime data lives in `~/videogen-data`. Today only `logs/` exists (`api.log`, `worker.log`, appended by the launcher; no rotation yet). Library, assets, backups and run directories arrive in later milestones. The database itself lives in the Docker volume `videogen-pg`.

## Security

- **Localhost only.** Everything binds `127.0.0.1`. A guard runs on every request, including static files, 404s and the SSE stream: the `Host` header must be `127.0.0.1`, `localhost` or `[::1]` (strict regex, optional port), and writes additionally require an absent or loopback `Origin`. CORS stays closed (single origin).
- **Paid-key guard.** If a paid API key is present in the environment (a shared list of exact names plus provider-prefixed patterns, plus Bedrock / Vertex / Foundry routing flags), the launcher, the API and the worker refuse to start. The message names the variables, never their values. The launcher refuses before anything else runs; the worker additionally strips these variables (plus `CLAUDECODE` / `CLAUDE_CODE_*` and API-routing variables such as `ANTHROPIC_BASE_URL`) from the environment of the Claude CLI / SDK processes it spawns, so the subscription token cannot be routed to another host.
- **Tamper-evident audit.** `audit_log` is append-only: the app role has no `UPDATE`, `DELETE` or `TRUNCATE`, a trigger blocks them for the owner too, and every row carries a SHA-256 hash chained to the previous row over a canonical JSON form (`jsonb_build_array`, so field boundaries cannot be forged). `GET /api/audit/verify` recomputes the chain.
- **Secret-like audit data is rejected.** Audit data with secret-like key names (token, secret, password, api key, authorization, cookie, private key, in any spelling) is rejected; this is a heuristic, see the known limits in [docs/m2/report.md](docs/m2/report.md). From the Claude account only `loggedIn`, `authMethod` and `subscriptionType` are kept; email and organization are dropped.

## Status

- M0 (assumption verification): done, see [docs/m0/report.md](docs/m0/report.md).
- M2 (platform skeleton): done, see [docs/m2/report.md](docs/m2/report.md).
- M1 (audio listening test): provisional TTS decision, waiting for the user's choice, see [docs/m1/decision.md](docs/m1/decision.md).
- M3 (live agent layer): done, see [docs/m3/report.md](docs/m3/report.md).
- M4a (pipeline core: product name → research → storyboard, Studio production panel, Library, smoke S2a): done, see [docs/m4/m4a-summary.md](docs/m4/m4a-summary.md).
- M4b (scene core: vg_blender, sandboxed two-phase build, anchor equivalence, GPU previews, build step, build card, channel identity options, smoke S2b): done and merged, see [docs/m4/m4b-summary.md](docs/m4/m4b-summary.md).
- M4c (Remotion draft render in a guarded child process, draft review with at most two returns to build, GPU and usage gates, Studio player with "Taslak MP4" / live "Taslak" tabs, library cover and length, Space/J/K/L/N shortcuts, smoke S2 with the draft): done and merged, see [docs/m4/report.md](docs/m4/report.md). Still open for the M4 exit: the first real product with the K12 role models and its per-video usage (needs the GPU machine and the Claude subscription; recipe in the report §4).
- M5a (final render, sound and automatic quality gates: Blender final frames, `compose`, procedural SFX and the licensed music ledger, mastering, two variants, `qc` gates G1/G5/G6 + D6/D7, Final tab and QC card): done and merged, see [docs/m5/m5a-summary.md](docs/m5/m5a-summary.md).
- M5b (review and fix loop: three isolated reviewers with a deterministic K13 score, fixer of at most 3 rounds with a computed rerender scope, `finalize` with the best version, "Yayına hazır", review panel and library score; Fake drivers, `npm test` 399, smoke 19 / 13): done and fast-forwarded into `main`, see [docs/m5/m5b-summary.md](docs/m5/m5b-summary.md). Still pending, on the GPU machine: pen-pilot calibration, `test:blender`, the Blender final integration test, the first real product to "yayına hazır" (with an allowed music track) with its per-video usage, and the independent final review that was skipped (`docs/m5/real-check.md`, "M5b bekleyenleri").
- M5c (voice: TTS + Whisper voice CLI, `voice` step, ducking, captions band, G4 clone-voice rule, `voice` fix scope, Seslendirme card): implemented with Fake drivers and fast-forwarded into `main`; the independent M5b + M5c final review is done (one Critical and one Important fixed, `npm test` 430), see [docs/m5/m5c-summary.md](docs/m5/m5c-summary.md). Still pending, on the GPU machine: `test:blender`, Blender `test:render`, pen-pilot calibration, voice-service measurements, two real "tükenmez kalem" runs and the K17 listening decision.
- Next: close M5 on the GPU machine, then M6 (publishing).
