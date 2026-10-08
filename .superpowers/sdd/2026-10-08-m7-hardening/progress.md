docs/superpowers/plans/2026-10-08-m7-hardening.md

# M7 progress (cloud container, no GPU, 4 cores, Fake drivers)

- Ruling: branch is `claude/elegant-keller-bgsue7` (session-designated); start HEAD fe889ee (= main with the reviewed M7 plan). Baseline `npm test` 462 passed, 332 s serial (2026-10-08 probe); parallel probe (3 workers) 147 s, 462/462.
- Ruling (environment): the first `node` on PATH in this container is v22.22.0 (engines asks >=24.18); from T1 on every verification also runs with `PATH=/opt/node24/bin:$PATH` (v24.21.0).
- T1: npm test 463 passed three times in a row, 156 / 152 / 148 s (node 22), and 156 s with node 24; `VG_TEST_WORKERS=1 npx vitest run packages/db/test` 49 passed. Shared path/port scan: nothing shared (servers on port 0, /tmp hits are values only, per-pid fake scripts, mkdtemp elsewhere). Template copy saves little (a direct migrate is ~0.18 s); the gain is the parallel files.
- Ruling: T1 adds an optional migrationsFolder to runMigrations (packages/db/src/migrate.ts, not in the plan's file list) and exports cloneTemplate/withDb from the test helpers so the template test runs on a scratch migration set; createTestDb() signature unchanged. Heavy-file timeouts are set per describe (60 s).
- Ruling: M5c H18 kept — qc-step e2e stays in npm test; the M6 T3 "move the heavy test" note is superseded.
