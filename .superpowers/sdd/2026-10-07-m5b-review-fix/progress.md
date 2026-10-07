docs/superpowers/plans/2026-10-07-m5b-review-fix.md

# M5b progress (subagent-driven, cloud container, no GPU)

- Ruling: branch is `claude/elegant-keller-bgsue7` (session-designated) instead of `m5b-review-fix`.
- Ruling: superpowers:subagent-driven-development is not installed → same discipline by hand: per task a fresh implementer subagent, then a spec-compliance and a code-quality review subagent; review fixes land before the task's single commit (no fixup/autosquash, so no force-push).
- Ruling: subagents run on sonnet (user: no Fable, no opus subagents) — this includes the T12 Step 4 final review the plan assigns to opus.
- Ruling: environment — Node 24.21 (/opt/node24/bin first on PATH), ffmpeg 7.0.2 static (/usr/local/bin), Postgres 16 on 5433 (`service postgresql start`). Baseline: typecheck clean, `npm test` 355 passed (4 min 38 s).
- T1 done: 361 passed. Spec + quality review: no Critical/Important; Minor applied (test 5 asserts the 84.2 total). Minor not applied: averageVisual/panelScore defensive guards for inputs the schema already rules out.
  - Ruling: the final contract is `FinalReview`/`FinalReviewSchema` (artifact key `FinalReview`); `Review` stays the draft schema.
  - Ruling: the 0.55 → 61.65 case needs D7 4 (qc with a failed d7_bitrate, as in test 4); with a clean qc it is 62.65.
  - Ruling: "D8 3,2 → 84,3" cannot be built from passing checks (minimum passing D8 is 4.0) → `rehook` 0.4 and `payoff` 0.3 fail with evidence/hint.
  - Ruling: `finalVerdict` — a known total < 70 is rework even with a failed gate; a null total (AUTO gate failure) is fix.
  - Ruling: `isBorderline` = total 78–82 and no known failed gate (a low dimension does not exclude it); `low` includes the qc-owned D6/D7 (K13 floor on all nine).
  - Ruling: `formatScore` rounds half-up (61.65 → '61,7').
- T2 done: 365 passed. Spec review: 1 Critical (deferred to T4, see below), 1 Important fixed (oscillation missed F,P,P,F → evaluated sequence is collapsed). Quality review: tests now pin the text/structure projections (sfx_cues, hook.text_tr, hook.pattern, vo_text/audio_mode, cta/version separately), non-adjacent regressions/fixes, null total = −1, all STOP_NOTEs; `tracked` uses Object.hasOwn; FixReport's scope enum comes from RERENDER_SCOPES.
  - Ruling (process): the T2 implementer wrote the code before the tests (no failing-first run); the reviewers' mutation testing (scratchpad copy) found the unpinned behaviour, now covered.
  - Ruling: beat `t_start/t_end/parts` sit in the structure projection (the plan test expects a beat-time change → only `storyboard.structure`); text = `hook.text_tr`, `onscreen_text`, `sfx_cues`. Both are compose scope.
  - Ruling: a research-only change → scope `none`, `changed ['research']` (the fixer step rejects it, T8).
  - Ruling: oscillation (F14) only on tracked checks, same noise rationale as regressions; `fixed` lists any F→P.
  - Ruling: STOP_NOTE wording for `oscillation` ("aynı kontrol düzelip yeniden bozuldu; döngü durduruldu") and `no_fixer` ("düzeltme yapacak ajan bağlı değil") chosen by the implementer (plan gives none).
  - Ruling (Critical found by review, F11 premise): Blender's `events_manifest` (python/vg_blender/vg_blender/build.py) writes `label_in` events from storyboard beats (id, t_start, parts), and compose feeds the stored `scene_events` to `planSfx` → a compose-scope beat time/parts fix would keep stale tick cues. Fix goes into T4 (composeSource derives `label_in` events from the current storyboard; other event types stay from events.json) with a test.
