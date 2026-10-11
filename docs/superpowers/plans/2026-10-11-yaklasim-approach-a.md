# YAKLASIM Approach — Phase A (behaviour) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new production follows `docs/approach/YAKLASIM.md`: 12–15 s, no voice, ≤ 5 English words on screen, the curiosity chain, fixed navy/grid/yellow identity, deterministic 120 BPM music and sine snaps, a seamless loop, and a ready caption/YouTube title.

**Architecture:** One shared module (`packages/shared/src/yaklasim.ts`) owns the constants and the deterministic validators; the storyboard, build and fixer steps call them inside their existing check loops. The Blender builder gains reassembly/spin motion, a YAKLASIM light rig and a text shape; Remotion gains a YAKLASIM text/effect layer chosen by the scene style; the music step stops calling Claude and renders a parametrised port of Rubik's synth; the sound plan places sine snaps. Entry points (API, Studio, Settings) stop offering voice, length and style.

**Tech Stack:** TypeScript (node 24, tsx, zod 4), Fastify, React 19, Remotion 4, Python 3 (audio_service venv, pytest), Blender 5.2 bpy, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-yaklasim-approach-design.md` (decisions Y1–Y20).

## Global Constraints

- Window 12–15 s; beats on a 0.5 s grid, each ≤ 2.5 s, ≥ 6 beats; chain hook → xray → macro → assembly(+) → counter → twist.
- On-screen text: English, ≤ 5 words, no `çğıöşüÇĞİÖŞÜ`, at most one `*accent*` span; last beat text = hook text.
- Palette: `#1a2546 → #0d1222 → #070a14`, grid 90 px, white text, accent `#ffd23f`; font Montserrat 900 (local).
- Safe margins: top 250, right 120, bottom 420, left 120 at 1080×1920, merged with the calibrated area by max.
- Music: 120 BPM, Am–F–C–G, full energy at 0 s, drums thin in macro beats, −14 LUFS master; SFX only after 5 s, only snap/tap/land, 50–700 Hz.
- Caption: English, ≥ 1 `?`, 1–5 hashtags, ≤ 2200; YouTube title ≤ 100, no hashtags.
- Old records stay readable: no schema field is removed or renamed; new fields are optional in the schema and required only by the YAKLASIM validators.
- Each task ends with `npm run typecheck` and its tests green; `VG_TEST_WORKERS=4` under load; smoke on `VG_SMOKE_PORT=5191 VG_SMOKE_DB=videogen_smoke_lib VG_SMOKE_DIR=/tmp/videogen-smoke-lib` (another stack holds 5190).

## Review Focus

1. A storyboard that is valid by schema but breaks one YAKLASIM rule must come back to the same storyboarder session with that rule named — pinned in Task 1 tests (one failing example per rule) and Task 5 (step returns the errors).
2. A video produced before YAKLASIM (old style id, Turkish text) must still render and play the way it did — pinned in Task 4 (`look` = legacy for non-`yaklasim` styles).
3. The first 5 s carry no SFX and music starts at frame 0 (QC first-audio ≤ 0.15 s) — pinned in Task 6 (planSfx) and Task 3 (music has energy at t=0).
4. A user who already edited the caption must not lose it when a fix round finalizes again — pinned in Task 7 (finalize keeps an edited caption).
5. The loop seam: frame-0 explosion offsets small, text identical on first and last frame — pinned in Task 1 (`yaklasimSceneErrors` offset fraction) and Task 4 (last beat shows hook).

---

## File Structure

| Path | Responsibility |
|---|---|
| `packages/shared/src/yaklasim.ts` (new) | constants, accent/word helpers, `yaklasimStoryboardErrors`, `yaklasimSceneErrors`, `publishErrors`, `yaklasimSafeArea` |
| `packages/shared/src/artifacts.ts` | beat `role`/`transition`/`counter`, storyboard `publish` (optional) |
| `packages/shared/src/scene.ts` | `explode.back`, part `spin`, `explode.t_start ≥ −1`, `text` primitive, `yaklasim` lighting |
| `packages/shared/src/styles.ts` | `yaklasim` style, `YAKLASIM_STYLE_ID` |
| `packages/shared/src/production.ts`, `qc.ts`, `rubric.ts` | fixed window, QC fallback, `final@3` |
| `python/vg_blender/vg_blender/{motion,build,stage,primitives,api}.py` | back/spin, part_lock at back end, light rig, text shape |
| `python/audio_service/audio_service/yaklasim_audio.py` (new) + `yaklasim_cli.py` | music + SFX synth |
| `apps/worker/src/audio/yaklasim.ts` (new) | driver for the python CLI (+ fake) |
| `apps/worker/src/pipeline/{music-step,sound,steps,fixer,finalize-step,review-prompts}.ts`, `claude-plugin/agents/*.md` | step behaviour and prompts |
| `packages/remotion/src/{props,Overlay,Final3D,Draft3D,layout}.ts(x)`, `yaklasim-layer.tsx` (new) | YAKLASIM look |
| `apps/api/src/routes/videos.ts`, `packages/db/src/pipeline.ts` | entry rules, approach on create |
| `apps/web/src/components/production/ProduceBar.tsx`, `routes/Settings.tsx`, `AudioCard` | UI |
| `tests/fixtures/artifacts/{storyboard,scene}-kalem.json`, `tests/fixtures/scene/kalem/` | YAKLASIM fixtures |

---

### Task 1: Shared YAKLASIM rules and schema extensions

**Files:** create `packages/shared/src/yaklasim.ts`, `packages/shared/test/yaklasim.test.ts`; modify `artifacts.ts`, `scene.ts`, `styles.ts`, `production.ts`, `qc.ts`, `rubric.ts`, `index.ts`, `browser.ts`.

**Interfaces (produces):**
```ts
export const YAKLASIM = {
  window: { minS: 12, maxS: 15 }, beatGridS: 0.5, beatMaxS: 2.5, minBeats: 6, maxWords: 5, sfxFromS: 5,
  roles: ['hook', 'xray', 'macro', 'assembly', 'counter', 'twist'] as const,
  transitions: ['cut', 'zoom', 'flash'] as const,
  palette: { inner: '#1a2546', mid: '#0d1222', outer: '#070a14', text: '#ffffff', accent: '#ffd23f', gridPx: 90 },
  margins: { top: 250, right: 120, bottom: 420, left: 120 },
  bpm: 120, hashtagsMax: 5,
};
export type BeatRole = (typeof YAKLASIM.roles)[number];
export type BeatTransition = (typeof YAKLASIM.transitions)[number];
export function splitAccent(text: string): { before: string; accent: string | null; after: string } | null; // null = more than one accent span / unbalanced
export function plainText(text: string): string;   // accents removed
export function wordCount(text: string): number;    // of plainText
export function yaklasimStoryboardErrors(sb: Storyboard): string[]; // English messages naming the rule
export function yaklasimSceneErrors(spec: SceneSpec, sb: Storyboard): string[];
export function publishErrors(p: { caption: string; youtube_title: string } | undefined): string[];
export function yaklasimSafeArea(calibrated: SafeArea): SafeArea; // per-edge max with margins (bottom edge expressed as y: min)
export const YAKLASIM_STYLE_ID = 'yaklasim';
```
Schema additions: `BeatSchema` gets `role?: enum(roles)`, `transition?: enum(transitions)`, `counter?: { value: /^[0-9]{1,24}$/, label: tr(30) }`; `StoryboardBase` gets `publish?: { caption: string ≤ 2200, youtube_title: string ≤ 100 }`. `explode` gets `back?: { t_start, t_end > t_start, ease }` and `t_start: min(-1)`; part gets `spin?: { axis: 'x'|'y'|'z', degrees: −3600..3600, t_start, t_end, ease }`; `PRIMITIVES` + `'text'`; `LIGHTING_PRESETS` + `'yaklasim'`; `CHANNEL_STYLE_IDS` + `'yaklasim'` with `CHANNEL_STYLES.yaklasim = { background: { top: '#1a2546', bottom: '#070a14' }, lighting: 'yaklasim', text: { color: '#ffffff', plate: 'rgba(0,0,0,0)', line: '#ffd23f', accent: '#ffd23f' }, name_tr: 'YAKLASIM', description_tr: '…' }` (match the existing shape). `DEFAULT_DURATION = YAKLASIM.window`; `effectiveDuration(...)` returns `{ window: YAKLASIM.window, source: 'default' }` regardless of input; `QC_LIMITS` duration 12–15; `RUBRIC_VERSION = 'final@3'`.

- [ ] **Step 1: failing tests** — `packages/shared/test/yaklasim.test.ts` builds a valid storyboard `good()` (13.5 s: hook 0–1.5 flash? no: hook 0–1.5, xray 1.5–3.5, macro 3.5–5.5 transition `cut`, assembly 5.5–8 `flash`, counter 8–10.5 with `counter: {value:'43252003274489856000', label:'combos'}`, twist 10.5–13.5 text = hook; hook text `Why doesn't it *FALL APART*?`; publish valid; claim ids/parts as in the kalem research fixture) and asserts `[]`; then one mutation per rule asserting the matching message substring: duration 16 → `12–15 s`; beat 1.25 s boundary → `0.5 s grid`; a 3 s beat → `at most 2.5 s`; 5 beats → `at least 6 beats`; first role `xray` → `starts with the hook`; last role not twist → `ends with the twist`; missing counter role → `counter`; order macro before xray → `order`; counter beat without `counter` → `counter value`; `camera.move: 'static'` → `static`; hook with 6 words → `5 words`; Turkish letter → `English`; two accents → `one accent`; last text ≠ hook → `loop`; publish missing → `publish`. `publishErrors`: no `?`, 6 hashtags, Turkish letter, title > 100, title with `#`. `wordCount("Why doesn't it *FALL APART*?") === 5`. `yaklasimSafeArea({top:150,bottom:1510,right:130,left:24})` → `{top:250,bottom:1500,right:130,left:120}`. `yaklasimSceneErrors`: a spec with `style_id 'gece_mavisi'` → `yaklasim style`; lighting not yaklasim; fewer than two parts mid-explosion at t=0; exploded part without `back`; last back end < duration − 1; two identical consecutive camera keys → `static camera`. `effectiveDuration` with a user window still returns 12–15.
- [ ] **Step 2:** run `npx vitest run packages/shared/test/yaklasim.test.ts` → FAIL (module missing).
- [ ] **Step 3:** implement; offset fraction at t=0 for part p = `ease(p.explode.ease, (0 − t_start)/(t_end − t_start))` clamped (reuse a TS port of `motion.ease`; put `ease()` in `yaklasim.ts`).
- [ ] **Step 4:** run the new test + `npx vitest run packages/shared` (fix `production`/`qc`/`rubric` tests that pinned 35–55 or `final@2`) → PASS; `npm run typecheck` (fix compile errors from the new enums, e.g. `STYLE_EN` needs `yaklasim`, `i18n.test` coverage).
- [ ] **Step 5:** commit `feat(shared): YAKLASIM rules — fixed 12–15 s window, curiosity chain, English ≤ 5 words, accents, loop, caption; scene back/spin/text; yaklasim style and lights (spec Y1, Y3, Y5–Y13, Y17)`.

### Task 2: vg_blender — reassembly, spin, light rig, text shape

**Files:** `python/vg_blender/vg_blender/motion.py`, `build.py`, `stage.py`, `primitives.py`, `api.py`; tests `python/vg_blender/tests/test_motion.py`, `test_build.py`, `test_primitives.py`.

**Interfaces:** `motion.explode_offset(explode, t)` honours `back` (offset goes from full vector back to 0 across `back.t_start..t_end` with `back.ease`); `motion.spin_angle(spin, t) -> float` (degrees, 0 before, full after); `build` keys `rotation_euler` per frame when `spin` exists (on the part root, around its local axis); `events_manifest` emits `part_lock` at `back.t_end` when `back` exists (else at `explode.t_end`); `stage` light preset `yaklasim`: key warm `(1.0, 0.86, 0.72)` 4.5, rim left `(0.35, 0.55, 1.0)` 3.2, rim right `(1.0, 0.55, 0.25)` 3.2, fill 0.6; `vg.text(body, size, depth)` → a mesh shape from a Blender text curve (converted to mesh, centred).

- [ ] **Step 1: failing tests** — `test_motion.py`: explode with back → offset at t_start=0 (or before) 0, mid-explode partial, after t_end full, during back partial, after back.t_end 0; negative t_start → offset at t=0 > 0; `spin_angle` before/mid/after. `test_build.py`: a two-part spec with back + spin builds; `events.json` has `part_lock` at round(back.t_end×30). `test_primitives.py`: `vg.text("WHAT'S INSIDE", 0.6, 0.05)` gives a mesh with > 0 faces, bounding box width > height.
- [ ] **Step 2:** run `npm run test:blender` → the new cases FAIL.
- [ ] **Step 3:** implement (keep everything per-frame keyed, no constraints/NLA — same as today).
- [ ] **Step 4:** `npm run test:blender` → PASS.
- [ ] **Step 5:** commit `feat(vg_blender): parts reassemble (back) and spin, part_lock at the reassembly, YAKLASIM light rig, text shape for the hidden signature (spec Y8, Y12)`.

### Task 3: audio_service — YAKLASIM music and SFX

**Files:** create `python/audio_service/audio_service/yaklasim_audio.py`, `yaklasim_cli.py`, `python/audio_service/tests/test_yaklasim_audio.py`.

**Interfaces:** `music(duration_s: float, sparse: list[tuple[float,float]], seed: int = 7) -> list[float]` (mono 48 kHz, peak ≤ 0.89; port of `episodes/rubik/audio/music.py` with `DUR` and the break windows as parameters; a sparse window = kick on every other beat, no hats/claps; full energy at 0 s; 40 ms tail fade only); `sfx(kind: 'snap'|'tap'|'land') -> list[float]` (port of `sfx.py`); `write_wav(path, samples)`. CLI: `python -m audio_service.yaklasim_cli music --duration 13.5 --sparse 3.5:5.5 --out m.wav` and `python -m audio_service.yaklasim_cli sfx --out-dir dir` (writes snap.wav, tap.wav, land.wav); prints a JSON line `{ "ok": true, ... }`.

- [ ] **Step 1: failing tests** — length = round(13.5 × 48000) ± 1; `max(abs) ≤ 0.89 + 1e-6`; RMS of the first 0.1 s > 0.01 (music at frame 0); drum energy (high-pass by first difference RMS) inside a sparse window < 0.6 × outside; same seed twice → identical; sfx: each kind non-empty, and an FFT (numpy if present, else a coarse DFT on 2048 samples) has < 5 % energy above 800 Hz.
- [ ] **Step 2:** `cd python/audio_service && .venv/bin/python -m pytest tests/test_yaklasim_audio.py -q` → FAIL (never `uv sync`).
- [ ] **Step 3:** implement.
- [ ] **Step 4:** PASS; also run the CLI once and `ffprobe` the WAV.
- [ ] **Step 5:** commit `feat(audio): YAKLASIM music (120 BPM Am–F–C–G, sparse drums in macro beats) and sine SFX, deterministic (spec Y14, Y15)`.

### Task 4: Remotion — YAKLASIM look

**Files:** `packages/remotion/src/props.ts`, `Overlay.tsx`, `Final3D.tsx`, `Draft3D.tsx`, `layout.ts`, create `yaklasim-layer.tsx`; `packages/remotion/package.json` (+ `@fontsource/montserrat`); tests `packages/remotion/test/props.test.ts`, new `yaklasim.test.ts`.

**Interfaces:** `DraftProps` gains `look: 'yaklasim' | 'legacy'`, beats gain `role?`, `transition?`, `counter?`; `draftProps()` sets `look = scene.style_id === 'yaklasim' ? 'yaklasim' : 'legacy'` and, for yaklasim, `safeArea = yaklasimSafeArea(safeArea)`. Pure helpers (exported for tests): `flashAt(beats, frame) -> { white: number; dx: number; dy: number; zoom: number }`, `counterText(value: string, progress: number) -> string` (digits grouped with commas; progress ≥ 1 → exact value), `textScale(framesSinceStart) -> number` (0.94 → 1 over 4 frames), `yaklasimLayout(width, height, area) -> { textTop, textWidth, hookFont, lineFont }`. `layoutIssues` uses the yaklasim layout for yaklasim props (text boxes measured with the same font metrics as today).

- [ ] **Step 1: failing tests** — `draftProps` with a yaklasim scene → `look 'yaklasim'`, merged safe area; with `gece_mavisi` → `legacy` and unchanged area; `flashAt` → white 1 at the flash beat's first frame, 0 after 4 frames, shake decays to < 1 px by frame 10; `counterText('43252003274489856000', 1) === '43,252,003,274,489,856,000'`, `counterText(...,0.5)` has fewer digits; `textScale(0) === 0.94`, `textScale(4) === 1`; last beat in a yaklasim video renders the hook (activeBeat of the twist beat → text equals hook).
- [ ] **Step 2:** `npx vitest run packages/remotion` → FAIL.
- [ ] **Step 3:** implement: `Final3D`/`Draft3D` render `<YaklasimBackdrop/>` (radial gradient + masked 90 px grid, exactly as `episodes/rubik/remotion/src/RubikIcinde.tsx` `Background`) when `look === 'yaklasim'`, the frame inside a wrapper with the flash shake/zoom transform, then `<YaklasimLayer/>` (hook/scene text centred in the top band, Montserrat 900 via `import '@fontsource/montserrat/900.css'`, white with the accent span `#ffd23f`, text-shadow `0 4px 18px rgba(0,0,0,.55)`, scale by `textScale`, the ring on `macro` beats at the first part's anchor from `labels`' anchor machinery (anchor only, no label box), the counter line on `counter` beats, white flash overlay); otherwise the legacy `Overlay`.
- [ ] **Step 4:** PASS + `npm run typecheck`; render one still with `npx remotion still` (the remotion package's existing still script / render-cli) of a yaklasim fixture frame and look at it.
- [ ] **Step 5:** commit `feat(remotion): YAKLASIM look — navy grid backdrop, Montserrat 900 with one yellow accent, instant text, macro ring, counter, flash and shake; legacy look for old styles (spec Y8–Y11)`.

### Task 5: Pipeline — storyboard, build, fixer under YAKLASIM

**Files:** `apps/worker/src/pipeline/steps.ts` (storyboard prompt/check, build prompt/check/style), `fixer.ts`, `scene-tools.ts`, `claude-plugin/agents/{storyboarder,builder,fixer,researcher}.md`, `apps/worker/src/pipeline/fake-scripts.ts`, fixtures `tests/fixtures/artifacts/storyboard-kalem.json`, `scene-kalem.json`, regenerate `tests/fixtures/scene/kalem/` with `bin/scene-fixtures.sh` (switch it to `CHANNEL_STYLES.yaklasim`); tests `apps/worker/test/{build-step,storyboard?,fixer,scene-tools}.test.ts`.

**Behaviour:** storyboard check = existing checks + `yaklasimStoryboardErrors`; the runtime prompt states the YAKLASIM rules (window 12–15, roles, transitions, ≤ 5 English words, accent syntax, loop, counter, publish, no VO) and the storyboarder role prompt is rewritten from YAKLASIM.md (English on-screen text; research claims stay Turkish). Build: style is always `CHANNEL_STYLES.yaklasim` (stop reading `getChannelStyle`), check = existing + `yaklasimSceneErrors`; builder role prompt gains the YAKLASIM build rules (object fills centre/lower-centre, frame 0 mid-burst with small offsets, staggered `back` snaps on the beat grid, real mechanism via `spin`, `pc_clear` shell for x-ray, hidden `vg.text("WHAT'S INSIDE", …)` on a surface, camera always moving with eased keys, cut to macro on the beat). Fixer: same validators in its checks; prompt notes music/SFX are deterministic (no audio fixes). Researcher: no duration recommendation; everyday object framing.

- [ ] **Step 1: failing tests** — storyboard step with a schema-valid but non-YAKLASIM storyboard returns the YAKLASIM errors to the session (assert the check text contains `0.5 s grid`); build step with a `gece_mavisi` spec returns `yaklasim style`; the new kalem fixtures pass both validators (a fixture test in `packages/shared/test/yaklasim.test.ts` loading `tests/fixtures/artifacts/*-kalem.json`).
- [ ] **Step 2:** run them → FAIL.
- [ ] **Step 3:** implement; write the fixtures (kalem, 13.5 s, English, parts/claims from `research-kalem.json`, back/spin in the scene); regenerate scene fixtures (`bin/scene-fixtures.sh`, Blender directly — not through the worker gate).
- [ ] **Step 4:** `npx vitest run apps/worker packages/shared` → PASS (update tests that pinned 45 s kalem timings).
- [ ] **Step 5:** commit `feat(pipeline): storyboard, build and fixer enforce YAKLASIM; prompts rewritten from the approach; YAKLASIM kalem fixtures (spec Y5–Y7, Y12–Y13, Y20)`.

### Task 6: Pipeline — deterministic music and sine SFX

**Files:** create `apps/worker/src/audio/yaklasim.ts`; modify `apps/worker/src/pipeline/music-step.ts`, `sound.ts`, `final-steps.ts` (SFX files), `apps/worker/src/assets.ts` (YAKLASIM SFX source), `apps/worker/src/main.ts` (driver wiring), `preflight.ts`; tests `apps/worker/test/{music-step,sound,compose-step}.test.ts`.

**Interfaces:** `interface YaklasimAudio { music(o: { durationS: number; sparse: [number, number][]; out: string; signal?: AbortSignal }): Promise<void>; sfx(dir: string): Promise<Record<'snap'|'tap'|'land', string>> }` with `PythonYaklasimAudio` (spawns the CLI in the audio venv) and `FakeYaklasimAudio` (ffmpeg sine bed / short sines — same shape). Music step: no Claude session; `sparse` = macro beat windows; writes artifacts `music_plan` (`{ bpm: 120, key: 'Am', durationS, sparse }`) and `music_stem` (WAV → FLAC as today); the generated-music flag the audio plan uses stays true. `planSfx` YAKLASIM branch: no hook whoosh, nothing before 5 s, `part_lock` → `snap` (≥ 0.25 s apart), beats with `transition: 'flash'` → `tap`, the last `part_lock` → `land`; label_in/zoom/explode_start → nothing.

- [ ] **Step 1: failing tests** — music step with the fake driver: no Claude call (the fake manager records no session), artifacts `music_plan` with sparse windows equal to macro beats, `music_stem` present; `planSfx` (yaklasim): no cue < 5000 ms, only snap/tap/land, spacing ≥ 250 ms, last lock is `land`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** implement; compose uses the YAKLASIM SFX files for yaklasim videos.
- [ ] **Step 4:** PASS (`npx vitest run apps/worker`); `npm run test:render` subset for compose if GPU-free (`vitest -c vitest.render.config.ts apps/worker/test-render/final-compose.int.test.ts`).
- [ ] **Step 5:** commit `feat(pipeline): deterministic YAKLASIM music (no composer session) and sine snaps after 5 s (spec Y14–Y16)`.

### Task 7: Finalize caption, review prompts, rubric

**Files:** `apps/worker/src/pipeline/finalize-step.ts`, `packages/db/src/platforms.ts` (helper `setGeneratedText`), `apps/worker/src/pipeline/review-prompts.ts`, `claude-plugin/agents/reviewer_*.md`, `packages/shared/src/final-review.ts` (check descriptions only); tests `apps/worker/test/finalize-step.test.ts`, `packages/db/test/platforms.test.ts`.

**Interfaces:** `setGeneratedText(db, videoId, { caption, youtubeTitle }) -> boolean` — writes each field only when it is NULL and no `video.text_edited` audit row exists for that field; audits `video.text_generated`; publishes `video.updated`.

- [ ] **Step 1: failing tests** — finalize with a storyboard `publish` sets caption/title; a second finalize after the user edited the caption keeps the edit (title still generated if untouched); a storyboard without `publish` changes nothing.
- [ ] **Step 2:** FAIL. **Step 3:** implement; rewrite reviewer task texts with YAKLASIM criteria (visual: identity, no static scene, flash/shake on snaps, ring on the hero, hidden signature, text ≤ 5 words instant; retention: frame 0 already bursting with the question at full size, ≤ 2.5 s beats, chain, loop seam, fast twist; audio: no SFX in first 5 s, music at 0 s, drums thin on macro, −14 LUFS; facts: the counter number sourced). **Step 4:** PASS. **Step 5:** commit `feat(pipeline): finalize writes the generated caption and YouTube title (never over an edit); reviewers judge against YAKLASIM, rubric final@3 (spec Y17–Y19)`.

### Task 8: Entry points — API and web

**Files:** `apps/api/src/routes/videos.ts`, `packages/db/src/pipeline.ts` (`createProduceRun` sets `approach='yaklasim'`, `createAudioEditRun` refuses yaklasim), `apps/web/src/components/production/ProduceBar.tsx`, `apps/web/src/lib/brief-view.ts`, `apps/web/src/routes/Settings.tsx`, `apps/web/src/components/production/AudioCard.tsx` / `ProductionPanel.tsx`; tests `apps/api/test/videos.test.ts`, `apps/web/test/brief-view.test.ts`, smoke `s2e-brief.spec.ts`, `s2-produce.spec.ts`.

- [ ] **Step 1: failing tests** — POST /api/videos with `audioMode 'vo'` → 400 (`Voiceover is not part of the YAKLASIM approach`), with `duration` → 400 (`The length is fixed at 12–15 s`), plain → 202 and the video has `approach 'yaklasim'`, `duration {12,15}`; audio edit on a yaklasim video → 409 (`YAKLASIM music is fixed; there is nothing to edit.`); web `producePayload` never sends `duration`/`vo`.
- [ ] **Step 2:** FAIL. **Step 3:** implement; ProduceBar: product + brief only, a static line "YAKLASIM · 12–15 s · no voiceover"; Settings: hide channel style and narrator sections; AudioCard edit hidden for yaklasim videos. **Step 4:** PASS + `npm run build`. **Step 5:** commit `feat: Studio and API produce only YAKLASIM videos — no voiceover, fixed length, fixed style; audio edits off (spec Y1, Y2, Y4, Y16)`.

### Task 9: Smoke, full suite, deploy, real production

- [ ] **Step 1:** update smoke specs that assert voice/length/style/45 s timings (`s2-produce`, `s2b-build` K19 test → YAKLASIM identity, `s2e-brief` → fixed length, `screens`), run the non-GPU smoke subset on the isolated stack and the GPU flows if swap allows.
- [ ] **Step 2:** `npm run typecheck && VG_TEST_WORKERS=4 npm test && npm run build`; `npm run test:blender`; audio pytest.
- [ ] **Step 3:** final whole-branch review (fresh reviewer, most capable model); fix Critical/Important with RED→GREEN.
- [ ] **Step 4:** deploy: backup, ff-merge to main, `npm install`, `npm run db:migrate` (no migration expected), build, `systemctl --user restart videogen`.
- [ ] **Step 5:** one real production of an everyday object (e.g. "Clothespin") when swap allows; watch the final against YAKLASIM.md frame by frame (`claude-video-vision` or contact sheet) and record findings.
