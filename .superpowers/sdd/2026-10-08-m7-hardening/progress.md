docs/superpowers/plans/2026-10-08-m7-hardening.md

# M7 progress (cloud container, no GPU, 4 cores, Fake drivers)

- Ruling: branch is `claude/elegant-keller-bgsue7` (session-designated); start HEAD fe889ee (= main with the reviewed M7 plan). Baseline `npm test` 462 passed, 332 s serial (2026-10-08 probe); parallel probe (3 workers) 147 s, 462/462.
- Ruling (environment): the first `node` on PATH in this container is v22.22.0 (engines asks >=24.18); from T1 on every verification also runs with `PATH=/opt/node24/bin:$PATH` (v24.21.0).
- T1: npm test 463 passed three times in a row, 156 / 152 / 148 s (node 22), and 156 s with node 24; `VG_TEST_WORKERS=1 npx vitest run packages/db/test` 49 passed. Shared path/port scan: nothing shared (servers on port 0, /tmp hits are values only, per-pid fake scripts, mkdtemp elsewhere). Template copy saves little (a direct migrate is ~0.18 s); the gain is the parallel files.
- Ruling: T1 adds an optional migrationsFolder to runMigrations (packages/db/src/migrate.ts, not in the plan's file list) and exports cloneTemplate/withDb from the test helpers so the template test runs on a scratch migration set; createTestDb() signature unchanged. Heavy-file timeouts are set per describe (60 s).
- Ruling: M5c H18 kept — qc-step e2e stays in npm test; the M6 T3 "move the heavy test" note is superseded.
- T2: npm test 468 passed, 153 s (earlier run 156 s). 0010 generated with drizzle-kit like 0009, plus hand-appended CHECKs on maintenance_runs and the REVOKE; extra `maintenance_runs (kind, started_at)` index.
- Ruling: the audit detail reads the tool input from the session's assistant event whose payload.message.content contains the tool_use block (jsonb @>): agent_events.tool_use_id is not set on that event.
- Ruling: a cut string is 4000 chars + "…[kırpıldı]"; past 32 KB the cut tightens to 1000/250/60 chars, then a JSON preview string; `links.tool.truncated` reported. Date range is half-open (from inclusive, to exclusive). Rows carry `hash`; verify adds `cached`; role matches `actor_id = role` or `role:` prefix (LIKE-escaped); unknown or non-numeric seq → 404.
- T3: npm test 470 passed, 152 s; build ok; smoke 21 passed / 15 skipped (260 s, nvidia-smi shim). `useRoute()` returns `[path, go, search]`, `go` keeps the query string; `Audit({initial, onFilter, fixed, embedded})` is the hook for T4's library tab.
- Ruling: T2's "5000 rows filtered by video" timing failed once under parallel load (200 ms bound): now best of three under 500 ms; the index use is what the test guards, not the VM's speed.
- Ruling: audit date filters are inclusive Istanbul days (YYYY-MM-DD) in the URL, converted to the API's ISO from / exclusive to; tones follow the action's last segment (…failed|rejected|refused → error, *cancel* → warn in grey, …completed|succeeded|done → ok); counts grouped with U+00A0; detail line, subject shortening and run/session quick filters accepted within Y6.
