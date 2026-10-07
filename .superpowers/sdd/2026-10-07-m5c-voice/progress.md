docs/superpowers/plans/2026-10-07-m5c-voice.md

# M5c progress (subagent-driven, cloud container, no GPU)

- Ruling: branch is `claude/elegant-keller-bgsue7` (session-designated) instead of `m5c-voice`; start HEAD eaa47fc (= main + the M5c plan commits).
- Ruling: superpowers:subagent-driven-development is not installed → same discipline by hand: per task a fresh implementer subagent (sonnet), then a spec-compliance and a code-quality review subagent (sonnet); failing test first; review fixes land before the task's single commit (no fixup/autosquash, no force-push).
- Ruling: all subagents run on sonnet (user: no Fable, no opus subagents).
- Ruling: environment — Node 24.21 (/opt/node24/bin first on PATH), ffmpeg 7 static (/usr/local/bin, ffprobe symlinked to /usr/bin/ffprobe), Postgres 16 on 5433 (`service postgresql start`), /opt/vgshim (nvidia-smi). No GPU, no Blender, no real Claude, system Python 3.13 (pytest via a scratchpad venv).
- Baseline: typecheck clean, `npm test` 399 passed (333 s with the JSON reporter); pytest 35 passed.
- T1 Step 0 (H18): slowest tests (JSON reporter) — qc-step "measures both variants…" 31.1 s; qc-step e2e "ready" 29.7 s (excluded by the plan); qc-step "a failed gate stops the run…" 27.4 s; compose-step "records the layout, the sound plan, both variants…" 22.7 s; compose-step "without an allowed music track…" 18.9 s; qc-step "never checks a final made from an older scene" 18.5 s; qc.test "passes a clean, mastered 36 s final" 13.0 s; draft-review-step e2e 8.4 s; fixer "unchanged fix stops" 7.0 s; fixer "restart after the fixer" 5.6 s.
  - Coverage: "measures both variants" — the e2e ready test runs qc on both variants and records the report, qc.test measures the checks; "records the layout… both variants" — the e2e ready test composes with a music bed (layout, both variants, plan), compose-step keeps the no-music, label-rename and stale/hole tests. "a failed gate" (G6 → needs_human/F6 text) has no other test → kept; "never checks a final made from an older scene" only here → kept.
  - Moved: apps/worker/test-render/qc-report.int.test.ts and compose-variants.int.test.ts (2 passed, 53 s). `npm test` 397 passed in 273 s (4 min 33 s; gain ~60 s ≥ 30 s). M5c budget ceiling (H18 +20 s): 293 s.
  - Ruling: Step 0 is its own commit, as the plan's Step 0 says (`test: move two slow covered tests to test:render (M5c time budget)`); the T1 code is the task's single commit.
