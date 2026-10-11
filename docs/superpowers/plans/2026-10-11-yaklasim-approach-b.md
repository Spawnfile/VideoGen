# YAKLASIM Phase B (cleanup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete every production path that YAKLASIM made dead (spec Z1–Z5). Old records must still read and show.

**Architecture:** Phase A made every new produce run `approach='yaklasim'`. No route resumes or retries an old run, so the voiceover, composer, audio-edit, channel-style, music-free variant and library-SFX branches never run again.

This plan removes them one decision at a time, smallest blast radius first: Z2 → Z4 → Z3 → Z5 → Z1. The suite stays green after every task. Each task adds a pin test that fails while the dead path still exists (an endpoint still answers, a step is still planned, a variant is still written). Each task also ends with a grep gate, so nothing that references the deleted code is left behind.

**Tech Stack:** TypeScript (node 24, tsx, zod 4), Fastify, React 19 + Remotion 4, Postgres 17 + drizzle, Python `audio_service` (pytest), vitest, Playwright smoke.

**Spec:** `docs/superpowers/specs/2026-10-11-yaklasim-approach-design.md` (Phase B decisions Z1–Z5). Live-data facts come from the deletion-surface survey of 2026-10-11:
- 15 videos, no `audio_edit` runs.
- 0 `final_video_tiktok`, `voice_track`, `qc_report`, `scene`, `audio` and `fix_report` artifacts.
- 1 legacy `music` score, 1 `audio_director` session, 2 `voice` step rows with status skipped, and setting `channel.style` = gece_mavisi.

## Global Constraints

- Branch `yaklasim-cleanup` in worktree `/home/alper/gpu-server/VideoGen-yaklasim`, cut from main 84f80a4.
- Never delete or reference `~/icinde-ne-var`.
- **Read-compat. These stay so old records still parse and show:**
  - `AUDIO_MODES` including `'vo'`, and the VideoHeader "With voiceover" label;
  - the `voice` step key and its labels (`STEP_KEYS`, `STEP_LABELS`, `STEP_EN`);
  - the `audio_director` entry in `ROLE_NAMES`, `ROLE_LABELS` and `ROLE_EN`, read-only: not in `roles.ts`, `role-settings` or the roles API;
  - `MusicScoreSchema` and the AudioCard score display;
  - `CHANNEL_STYLES` and `STYLE_EN` with all style ids;
  - the platform `tiktok` (unrelated to the `final_video_tiktok` variant);
  - the `runs.instruction` and `runs.version_id` columns;
  - the VersionList 'Audio edit' label.
- No DB data is deleted. The `channel.style` settings row stays: nothing reads it, and leaving it is reversible.
- Unit suite: `npx vitest run --exclude '**/chat.test.ts' > $WS/unit.log 2>&1; tail -15 $WS/unit.log`. Before the first run in a task, clean any leaked `/tmp/vg-*` (tmpfs quota).
- Typecheck: `npm run typecheck`.
- Render suite: `npm run test:render` (ffmpeg and Remotion, no GPU Blender for compose/qc).
- Python: `cd python/audio_service && /home/alper/gpu-server/VideoGen/python/audio_service/.venv/bin/python -m pytest -q -p no:cacheprovider`.
- Commit messages end with the session attribution lines.

## Review Focus

1. **Old video detail pages.** A pre-YAKLASIM video still loads and shows in the web Library and Production panels:
   - a VO video with skipped `voice` step rows;
   - the cancelled run with a composer `music` score;
   - an `audio_director` agent session.

   Expected: no crash, and labels shown. Pinned in Task 4 (AgentCard fallback) and Task 6 (production-view with a `voice` step row).
2. **Versions and finals without a tiktok variant.** Versions SQL and `VideoFinal` must work when only `final_video_music` exists. Expected: the final is shown and download works. Pinned in Task 2.
3. **Compose reuse.** A rerun of compose must reuse the existing `final_video_music` when its input hash matches, not recompose. Pinned in Task 2.
4. **Preflight with zero music assets.** A YAKLASIM produce must not be blocked by the old "izinli müzik gerekli" rule. Pinned in Task 5.
5. **Asset ledger.** It still imports, lists and revokes `voice_ref` and `music` assets after the narrator code is gone. Expected: revoke works and has no narrator side effect. Pinned in Task 6.

---

### Task 1: Z2 — the channel style choice is gone

**Files:**
- Delete:
  - `apps/api/src/routes/channel.ts`, `apps/api/test/channel.test.ts`
  - `apps/web/src/components/ChannelStyleSection.tsx` (find it with `git ls-files | grep ChannelStyleSection`)
  - `apps/web/public/k19/`, `bin/k19-options.sh`
- Modify:
  - `apps/api/src/app.ts` (route registration)
  - `packages/db/src/channel.ts` (drop `getChannelStyle` and `setChannelStyle`; `styleFor` → fixed)
  - `apps/worker/src/pipeline/steps.ts`, `fixer.ts`, `scene-tools.ts` (callers of `styleFor`)
  - `apps/web/src/lib/api.ts`, `apps/web/src/lib/sw-routes.ts`, `apps/web/public/sw.js` (`^/k19/`)
  - `apps/web/src/screens/Settings.tsx` (drop the hidden section import)
  - `README.md` (k19 line)
- Test: `apps/api/test/videos.test.ts` (or the app-level route test file), `apps/web/test/sw-routes.test.ts`, `apps/worker/test/build-step.test.ts`, `apps/worker/test/scene-tools.test.ts`

**Interfaces:**
- Produces: `styleFor()` is removed. Callers use `CHANNEL_STYLES.yaklasim` from `@videogen/shared` directly; there is no DB lookup. `approachOfRun(db, runId)` stays.

- [ ] **Step 1: Write the pin tests.**
  - API: `GET /api/channel-style` and `PUT /api/channel-style` return 404.
  - Web: `swRoute('/k19/a.png')` is no longer the k19 cache strategy (assert it falls to the default strategy).
  - Worker build-step: the builder prompt names the yaklasim style even when settings hold `channel.style=gece_mavisi` (seed the row in the test).
- [ ] **Step 2: Run them.** Expected: FAIL. The route answers 200, the sw rule matches, and the builder reads the stored style for a non-yaklasim approach. If the build-step pin passes because the run is already yaklasim, write it with a run whose `approach` is null: this phase drops approach-dependent style lookup.
- [ ] **Step 3: Delete and edit.**
  - Delete the files above and the route registration.
  - Callers that took `await styleFor(db, approach)` now use `CHANNEL_STYLES.yaklasim`.
  - In web `api.ts`, drop `channelStyle` and `setChannelStyle`; in `sw-routes.ts` and `sw.js`, drop the k19 rule.
  - Keep `STYLE_EN`.
- [ ] **Step 4: Run the pins, then the unit suite and typecheck.** Expected: all pass.
- [ ] **Step 5: Grep gate.** `git grep -nE "channel-style|ChannelStyleSection|k19|getChannelStyle|setChannelStyle|styleFor\(" -- ':!docs'` returns nothing. Spec and plan docs are excluded; old docs stay as history.
- [ ] **Step 6: Commit.** `refactor: drop the channel style choice — fixed YAKLASIM look, no /api/channel-style, no k19 previews (spec Z2)`

### Task 2: Z4 — compose writes one variant

**Files:**
- Modify:
  - `apps/worker/src/pipeline/final-steps.ts` (compose: 202, 212-213, 259-262, 287; QC: 323-356)
  - `packages/shared/src/qc.ts` (`tiktok` stays in the schema with default `[]`; the checks run on music only)
  - `apps/worker/src/pipeline/review-step.ts:336`, `review-tools.ts:49-56`, `final-review.ts:262`
  - `packages/claude/src/mcp.ts:21`
  - `packages/db/src/pipeline.ts:250-280`, `packages/db/src/versions.ts` (drop the tiktok join; drop `tiktokSha` from `VideoFinal` and the version finals)
  - `packages/shared/src/pipeline.ts:80-81`
  - Web:
    - `apps/web/src/components/DraftTabs.tsx:40-56`
    - `CompareView.tsx:184-201`
    - `lib/compare-view.ts`
    - `screens/LibraryDetail.tsx:114`
    - `lib/production-view.ts:99-102,124`
  - `bin/seed-ready.ts` (or wherever `seed-ready.ts` lives)
- Test:
  - `apps/worker/test-render/compose-variants.int.test.ts` (rename to `compose.int.test.ts`), `qc-report.int.test.ts`
  - `apps/api/test/versions.test.ts`
  - `apps/web/test/{final-view,compare-view}.test.ts`
  - `packages/db/test/{video-final,episodes}.test.ts`
  - `packages/shared/test/qc.test.ts`
  - `tests/smoke/s2d-final.spec.ts:40`, `screens.spec.ts:208`

**Interfaces:**
- Produces:
  - Compose writes exactly one `final_video_music` artifact. `QcReport.tiktok` is `[]` on every new report, and the schema default is `[]`.
  - `VideoFinal` is `{ musicSha, coverSha, … }` with no `tiktokSha`.
  - Versions `finals` drops `tiktokSha`.

- [ ] **Step 1: Write the pin tests.**
  - Render int: after compose, the run's artifacts include `final_video_music` and no `final_video_tiktok`.
  - A second compose with the same inputs reuses the first (artifact count unchanged, no ffmpeg call) — Review Focus 3.
  - QC int: `report.tiktok` is `[]`, and every check is on the music variant.
  - Shared: `QcReportSchema.parse({...without tiktok})` gives `tiktok: []`.
  - API versions: a version whose run has only `final_video_music` shows its final, and the JSON has no `tiktokSha` — Review Focus 2.
  - Web: DraftTabs and CompareView show no variant chip.
- [ ] **Step 2: Run them.** Expected: FAIL. Two variants are written, the schema needs `tiktok`, and the chip is shown.
- [ ] **Step 3: Implement.**
  - Compose renders and stores only the music variant. Reuse looks up `final_video_music` with the same input hash.
  - QC iterates over the music variant only.
  - Drop the variant from the SQL, the types, the web chips and the seed.
- [ ] **Step 4: Run the pins, the unit suite, the render suite and typecheck.** Expected: all pass.
- [ ] **Step 5: Grep gate.** `git grep -nE "final_video_tiktok|tiktokSha" -- ':!docs' ':!packages/db/drizzle'` returns nothing except the read-only artifact-kind enum, if the kinds list keeps it for old rows. Ledger the ruling if it does.
- [ ] **Step 6: Commit.** `refactor(final): compose writes one variant (with music); QC, reuse and versions read final_video_music only (spec Z4)`

### Task 3: Z3a — audio edits are gone

**Files:**
- Delete: `apps/worker/src/pipeline/remix-step.ts`, `apps/worker/test/audio-edit.test.ts`, `tests/smoke/s2f-music.spec.ts`
- Modify:
  - `packages/shared/src/pipeline.ts` (`audioEditPlan`; `remix` out of `STEP_KEYS`; `audio_edit` out of `RunKind`)
  - `packages/db/src/pipeline.ts:65-125` (`createAudioEditRun`, `AUDIO_EDIT_MAX`, `originRunId`)
  - `apps/api/src/routes/videos.ts` (the `/audio-edits` route and its error mapping)
  - `apps/worker/src/pipeline/orchestrator.ts` (185, 276, 419-430), `apps/worker/src/pipeline/types.ts:27` (`edit`), `music-step.ts` (the `ctx.edit` code at 78, 88, 102-108)
  - `apps/web/src/lib/api.ts` (`audioEdit`), `components/AudioCard.tsx` (the edit UI), `ProductionPanel.tsx` (40, 44-45, 61)
- Test:
  - `apps/api/test/videos.test.ts`
  - `packages/shared/test/pipeline.test.ts`, `packages/db/test/{pipeline,episodes}.test.ts`
  - `apps/worker/test/music-step.test.ts`
  - `apps/web/test/*audio*` (whatever covers AudioCard)

**Interfaces:**
- Produces: `RunKind = 'produce' | 'import'`, and `STEP_KEYS` without `remix`. Reading a stored `remix` step label is moot: no rows exist.

- [ ] **Step 1: Write the pin tests.**
  - API: `POST /api/videos/:id/audio-edits` returns 404.
  - Shared: `STEP_KEYS` has no `remix`.
  - Web: AudioCard renders no edit textarea or button for any video (a legacy approach=null one included).
- [ ] **Step 2: Run them.** Expected: FAIL. The route answers 409 or 400 rather than 404, the key exists, and the legacy video shows the edit UI.
- [ ] **Step 3: Delete and edit the files above.**
  - The orchestrator loses its edit branches.
  - `music-step` loses `ctx.edit`.
  - Delete the audio-edit tests and the `s2f` smoke spec.
- [ ] **Step 4: Run the pins, the unit suite and typecheck.** Expected: all pass.
- [ ] **Step 5: Grep gate.** `git grep -nE "audio_edit|audioEdit|remix|AUDIO_EDIT_MAX|createAudioEditRun|originRunId|audio-edits" -- ':!docs' ':!packages/db/drizzle'` returns nothing, except the VersionList 'Audio edit' label (read-compat; it keys on the version source).
- [ ] **Step 6: Commit.** `refactor: drop audio edits — no remix step, no audio_edit runs, no /audio-edits, no AudioCard edit (spec Z3)`

### Task 4: Z3b — the composer is gone

**Files:**
- Delete: `claude-plugin/agents/audio_director.md`, `python/audio_service/audio_service/{music.py,music_cli.py}`, `python/audio_service/tests/test_music.py`
- Modify:
  - `packages/claude/src/roles.ts:33-34`
  - `apps/worker/src/pipeline/music-step.ts` (drop `composerPrompt` and the composer branch; the step always calls `yaklasimMusic`)
  - `apps/worker/src/audio/music.ts` (drop `FluidMusicDriver.render` and `capabilities`; keep `runYaklasimMusic`, `renderYaklasim` and `yaklasimCapabilities`)
  - `apps/worker/src/main.ts:58-60`, `packages/shared/src/config.ts` (soundfont), `apps/worker/src/pipeline/preflight.ts:31`
  - `apps/worker/src/pipeline/fixer.ts` (the music and audio spec path and `audioRefErrors`: 53, 68, 87, 142, 158, 184, 205), `fake-scripts.ts:50,123-127`
  - `packages/shared/src/role-settings.ts:13`, `apps/api/src/routes/roles.ts:12,27`
  - `apps/web/src/components/AgentCard.tsx:55,59` (a fallback for an unknown or retired role)
  - `packages/shared/src/music.ts`: drop `MUSIC_PATTERNS` and `musicScoreErrors` only if `yaklasimScore` and its test do not use them. Check first and ledger the outcome.
- Test:
  - `apps/worker/test/music-step.test.ts`, `fixer.test.ts`
  - `apps/api/test/roles.test.ts`
  - `apps/web/test/` (AgentCard)
  - `tests/smoke/s2b-build.spec.ts:25`, `s2c-draft.spec.ts:23` (expected roles)

**Interfaces:**
- Consumes: the Task 3 `music-step` without `ctx.edit`.
- Produces:
  - `ROLE_NAMES` keeps `audio_director` (read-compat), but no Claude role definition exists for it.
  - `music-step` never opens a Claude session.

- [ ] **Step 1: Write the pin tests.**
  - `music-step`: a run with `approach=null` still writes the deterministic yaklasim stem and opens no session. Today it would take the composer branch.
  - roles API: `GET /api/roles` does not list `audio_director`.
  - AgentCard: a session with role `audio_director` renders with the label "Audio director" (from `ROLE_EN`). A session with an unknown role `retired_x` renders its raw role id and does not throw — Review Focus 1.
- [ ] **Step 2: Run them.** Expected: FAIL. The legacy run takes the composer path, the roles list includes `audio_director`, and an unknown role throws or renders undefined.
- [ ] **Step 3: Delete and edit the files above.**
  - The fixer no longer offers music or audio fixes to any run. For yaklasim runs it already refused them; now the path is gone.
  - Remove the FluidSynth soundfont config and its preflight check.
- [ ] **Step 4: Run the pins, the unit suite, Python pytest and typecheck.** Expected: all pass. Python loses `test_music.py`.
- [ ] **Step 5: Grep gate.** `git grep -nE "composerPrompt|FluidMusicDriver|fluidsynth|soundfont|music_cli|audioRefErrors" -- ':!docs'` returns nothing.
- [ ] **Step 6: Commit.** `refactor: drop the free composer — no audio_director role, no FluidSynth, music is always the fixed YAKLASIM bed (spec Z3)`

### Task 5: Z5 — library SFX and the licensed-music rule are gone

**Files:**
- Modify:
  - `apps/worker/src/assets.ts:26-60` (keep `y_snap`, `y_tap`, `y_land` and `importAsset`)
  - `packages/shared/src/assets.ts:13` (`SFX_NAMES` = the `y_*` names)
  - `apps/worker/src/pipeline/sound.ts:5-38` (drop `SFX_FOR_EVENT`, `matchSfx` and `planSfx`; `planSfxYaklasim` stays)
  - `apps/worker/src/pipeline/final-steps.ts` (189: the non-yaklasim SFX branch; 174-175: `pickMusic`/asset music, since the bed is always the yaklasim stem)
  - `apps/worker/src/pipeline/preflight.ts:13-16,28` (the rule and `musicCount`)
  - `packages/shared/src/voice.ts` `AudioPlan.sfx.exclude` enum (it follows `SFX_NAMES`)
- Test:
  - `apps/worker/test/{sound,assets,orchestrator}.test.ts`
  - `apps/api/test/assets.test.ts`, `apps/web/test/assets-view.test.ts`, `packages/db/test/assets.test.ts`

**Interfaces:**
- Produces: `SFX_NAMES = ['y_snap', 'y_tap', 'y_land']`. Compose always mixes the yaklasim music stem plus `planSfxYaklasim` cues.

- [ ] **Step 1: Write the pin tests.**
  - Preflight with zero music assets in the ledger returns no "izinli müzik gerekli" problem for a produce run — Review Focus 4.
  - `SFX_NAMES` equals the three `y_*` names.
  - Worker `ensureSfx` (or the recipe map) has no `whoosh`.
  - The asset ledger can still import and revoke a `music` asset — Review Focus 5, the music half.
- [ ] **Step 2: Run them.** Expected: FAIL. Preflight names the rule, and the names list has nine entries.
- [ ] **Step 3: Delete and edit the code above.**
- [ ] **Step 4: Run the pins, the unit suite, the render suite and typecheck.** Expected: all pass.
- [ ] **Step 5: Grep gate.** `git grep -nwE "whoosh|swoosh|thud|planSfx|matchSfx|SFX_FOR_EVENT|musicCount|pickMusic" -- ':!docs'` returns nothing. `snap`, `click` and `tick` are common words, so check them by reading the `SFX_NAMES` diff, not by grep.
- [ ] **Step 6: Commit.** `refactor(sound): only the YAKLASIM snap/tap/land cues; no library SFX; no licensed-music preflight rule (spec Z5)`

### Task 6: Z1a — the voiceover pipeline is gone (TS side)

**Files:**
- Create: `packages/shared/src/audio-plan.ts`, which takes `AudioPlanSchema` and `AudioPlan` from `voice.ts:38-54`, exported from `index.ts`.
- Delete:
  - `packages/shared/src/voice.ts` and its test
  - `apps/worker/src/pipeline/voice-step.ts`, `apps/worker/src/audio/driver.ts`
  - `apps/api/src/routes/voice.ts`, `packages/db/src/voice.ts`
  - `apps/web/src/components/{NarratorVoiceSection,VoiceCard}.tsx`
  - VO tests:
    - `apps/worker/test/{voice-step.test.ts,voice-helpers.ts,audio-driver.test.ts,fixtures/fake-voice-cli.mjs}`
    - `apps/worker/test-render/{vo-compose,vo-mix,voice}.int.test.ts`
    - `apps/api/test/voice.test.ts`, `apps/web/test/voice-view.test.ts`
  - Fixtures in `tests/fixtures/artifacts/`:
    - `storyboard-kalem-vo`, `audio-plan-vo`, `voice-track-kalem`, `final-review-facts-vo-fix`, `fix-report-voice`
    - `storyboard-kalem-legacy`, `scene-kalem-legacy`
    - also `tests/fixtures/scene/kalem-legacy/`
- Delete the VO captions:
  - `CaptionWord`, `CaptionPage` and `captionPages`;
  - the Remotion caption overlay, in `props.ts:125-189`, `layout.ts:35,43` and `Overlay.tsx`.

  No VO video is ever re-rendered, so these go rather than move.
- Modify:
  - Worker:
    - `apps/worker/src/pipeline/steps.ts` (imports, the `audio` dep, the storyboard VO check, the voice-round branches, the executor map)
    - `final-steps.ts` (vo, captions, `stem_voice`, `voiceStemSha` and the `composeInputHash` vo inputs), `render/audio.ts:11-32`, `sound.ts` (duck and the vo `defaultAudioPlan` mode)
    - `review-step.ts`, `review-inputs.ts` (`voInputs`), `review-prompts.ts` (keep the G4 gate with `g4: true`)
    - `finalize-step.ts` (the AIGC flag from VO), `fixer.ts`, `fix-round.ts`, `fix-loop.ts`, `music-step.ts` (`voice_track` input)
    - `fake-scripts.ts`, `main.ts`, `preflight.ts` (the TTS capability check), `agents/pids.ts:22`
    - `render/driver.ts` (`SCENE_FIXTURES_LEGACY`)
  - Shared:
    - `packages/shared/src/pipeline.ts` (`IMPLEMENTED_STEPS` without `voice`; `producePlan` loses its `audioMode` voice filter, and `voice` is never planned)
    - `production.ts` (`voBounds`), `assets.ts` (`voiceRefProblem`), `artifacts.ts` and `validator.ts` (import `AudioPlan` from `audio-plan.ts`)
  - `packages/db/src/index.ts`, `packages/db/src/assets.ts` (`resetNarratorForRevokedRef`; revoke loses the narrator side effect)
  - `packages/claude/src/roles.ts:26` (`tts_synthesize`, `align_captions`), `guard.ts:20`
  - API: `apps/api/src/app.ts` (registration), `routes/videos.ts:44`
  - Web:
    - `ProductionPanel.tsx`, `production-view.ts:218-270` (`pickVoice`, `PRODUCE_VO_HINT`, `NarratorItem`, ENGINE/PRESET)
    - `AudioCard.tsx:10` (the voice stem row), `api.ts`
    - `Settings.tsx` (drop the hidden narrator section)
  - `packages/shared/src/config.ts` (`freyaPython`, `modelsDir`, `hfHome`)
- Test (edit the VO cases out):
  - Worker:
    - `apps/worker/test/{e2e-helpers,final-helpers}.ts`
    - `fixer`, `finalize-step`, `review-step`, `review-inputs`, `orchestrator`, `sound`, `build-step`, `music-step` and `pipeline-steps` tests
  - API: `apps/api/test/{assets,videos}.test.ts`
  - Shared: `packages/shared/test/{production,artifacts,fix-loop,pipeline,yaklasim,config,scene}.test.ts`
  - Remotion: `packages/remotion/test/{final,props}.test.ts`
  - Smoke: `tests/smoke/helpers.ts:52`, `screens.spec.ts:163-187`

**Interfaces:**
- Consumes:
  - Task 5 `SFX_NAMES`, used by the `AudioPlan.sfx.exclude` enum. It moves with the schema to `audio-plan.ts`.
  - Task 4 fixer without the music path.
- Produces:
  - `AudioPlanSchema` and `AudioPlan` come from `@videogen/shared` via `audio-plan.ts`.
  - `producePlan(...)` never includes `voice`.
  - `ROLE_NAMES` and the step labels keep their `voice` entries (read-compat).

- [ ] **Step 1: Move `AudioPlanSchema` to `audio-plan.ts` without changing it.** Export it, point the importers at it and run the unit suite. Expected: green. This is a pure move, kept green before any deletion.
- [ ] **Step 2: Write the pin tests.**
  - API: `GET /api/narrator-voice` (whatever paths `routes/voice.ts` registers) returns 404.
  - Shared: `producePlan({ audioMode: 'vo' … })` (or its post-change signature) has no `voice` step.
  - Web `production-view`: a legacy run whose steps include a skipped `voice` row renders its label "Voiceover" (from `STEP_EN`) and does not throw — Review Focus 1.
  - DB assets: revoking a `voice_ref` asset succeeds and leaves no narrator setting written — Review Focus 5.
- [ ] **Step 3: Run them.** Expected: FAIL. The route answers and the VO plan has `voice`. The production-view and revoke pins may already pass; they are regression pins, so record "pre-passing, regression pin" in the ledger.
- [ ] **Step 4: Delete and edit in dependency order: shared → db → claude → worker → api → web → remotion.** After each package, run `npm run typecheck`, and fix only what the deletion broke.
- [ ] **Step 5: Run the pins, the unit suite, the render suite and typecheck.** Expected: all pass.
- [ ] **Step 6: Grep gate.** `git grep -nE "voice_track|VoiceTrack|tts_synthesize|align_captions|captionPages|storyboardVoErrors|LEGACY_VO_WINDOW|voBounds|narrator|NarratorItem|freyaPython|stem_voice|voiceRefProblem|resetNarratorForRevokedRef" -- ':!docs' ':!packages/db/drizzle'` returns nothing. `'voice'` survives only as a step key or label, in `AUDIO_MODES`, and as the `voice_ref` ledger kind.
- [ ] **Step 7: Commit.** `refactor: drop the voiceover path — no voice step, no narrator, no TTS driver, no VO captions; AudioPlan moved to audio-plan.ts (spec Z1)`

### Task 7: Z1b — Python TTS/ASR and the real-smoke voice step are gone

**Files:**
- Delete:
  - `python/audio_service/audio_service/{tts,voice_cli,asr,align,normalize_tr,metrics}.py`
  - `python/audio_service/tests/{test_tts,test_voice_cli,test_align,test_metrics,test_normalize_tr,test_listening_clean_asr}.py` and `tests/conftest.py`
  - `python/audio_service/listening_test.py`
- Modify:
  - `python/audio_service/pyproject.toml` (drop `faster-whisper` and any TTS dependencies), `PINS.md` and `requirements.freeze.txt` (drop the TTS and ASR pins)
  - `bin/real/steps.ts` (step 5) and `apps/worker/test/smoke-real.test.ts:133-137` (find exact paths with `git grep -n "voice_cli\|step 5"`)

**Interfaces:**
- Produces: `audio_service` = `yaklasim_audio`, `yaklasim_cli` and whatever Task 4 left; nothing imports TTS or ASR.

- [ ] **Step 1: Write the pin test.** In the smoke-real test, the step list has no voice step (assert the step names).
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Delete and edit.** Before running Python, make sure nothing left in the package imports a deleted module: `git grep -nE "from \.(tts|asr|align|normalize_tr|metrics)|import (tts|asr|align|normalize_tr|metrics)" python/`.
- [ ] **Step 4: Run Python pytest, the unit suite and typecheck.** Expected: all pass. The venv keeps faster-whisper installed, which is harmless; no reinstall is needed.
- [ ] **Step 5: Grep gate.** `git grep -nE "faster.whisper|voice_cli|normalize_tr|listening_test" -- ':!docs'` returns nothing.
- [ ] **Step 6: Commit.** `refactor(audio_service): drop TTS/ASR modules, their pins and the real-smoke voice step (spec Z1)`

### Task 8: Role prompts, docs pointers and full verification

**Files:**
- Modify:
  - `claude-plugin/agents/{storyboarder,fixer,reviewer_audio,builder,researcher}.md`: delete the paragraphs about voiceover, the narrator, `tts`, the composer, `music_score` edits, library SFX and the music-free variant. YAKLASIM rules stay as written.
  - `README.md` (anything pointing at deleted bins or settings)
- Test: the whole suite.

- [ ] **Step 1: Prompt sweep.** `git grep -niE "seslendirme|voiceover|narrator|anlatıcı|tts|fluidsynth|audio_director|whoosh|tiktok variant|müziksiz" claude-plugin/ README.md` lists the lines to edit. Edit each one; keep the read-only mentions that explain old records.
- [ ] **Step 2: Full verification.** Clean `/tmp/vg-*`, then run:
  - `npm run typecheck`
  - the unit suite
  - `npm run test:render`
  - Python pytest
  - `npm run test:smoke` (the fake pipeline on its own stack; leave the 5190 smoke stack alone)

  Expected: all green. Record the counts in the ledger.
- [ ] **Step 3: Commit.** `docs(agents): role prompts lose the voiceover/composer/variant paragraphs (spec Z1–Z5)`
