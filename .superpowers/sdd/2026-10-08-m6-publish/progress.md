docs/superpowers/plans/2026-10-08-m6-publish.md

# M6 progress (cloud container, no GPU, mock TikTok)

- Ruling: branch is `claude/elegant-keller-bgsue7` (session-designated) instead of `m6-publish`; start HEAD 279df11 (= main with the M6 plan). Baseline `npm test` 430.
- Ruling: T1 `ACTIVE_STATUSES` → `ACTIVE_PUBLICATION_STATUSES` (name clash with agents.ts); also `withAttributions` (Y11 re-append) and `countsTowardLimit` live in publish.ts; `nextDraftSlot` takes rows {createdAt,status,publishId} (Y6 counts failed-with-publish_id).
- T1: npm test 435 passed, 339 s (baseline 328 s; budget +15 s → keep ≤ 343 s; 6 min hard limit 360 s).
- T2: npm test 439 passed, 343 s. Ruling: DB functions written before their tests (TDD order slip); the one new behaviour (updateVideo keeps 'published') was shown RED first. createPublication also returns kind 'sent' (Y6 confirmResend). Lock keys are two-key constants in packages/db/src/publish.ts (VG_LOCK_NS + 1 limit, 2 tokens, 3 rate).
- T3: npm test 445 passed; wall time 363 s, rerun 382 s (same content). Per-file JSON timings: the four M6 test files take 0.6 s together; createTestDb costs ~0.2 s/file. The breach of the 6 min limit is VM variance (328–382 s with no M6 effect), dominated by qc-step.test.ts (108 s, the M5b e2e test that M5c H18 kept in npm test) and fixer/review/compose (~105 s). Ruling: no test moved in M6 (nothing of M6's is slow); the overrun is reported to the user as an open item (measure on the GPU laptop; moving qc-step's e2e to test:render is the lever).
- Ruling: lockfile edited by hand (only the @videogen/tiktok workspace entries): this container's npm strips `libc` fields from the whole lockfile.
- Ruling: TikTok error map gains `reconnect_required`, `not_connected`, `upload_failed` (shared/publish.ts).
