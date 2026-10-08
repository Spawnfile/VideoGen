import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DRAFT_RUBRIC_VERSION, STOP_NOTE, type AudioPlan, type FinalReview, type FixReport, type SceneSpec, type Storyboard, type VoiceTrack } from '@videogen/shared';
import { findArtifact, getChannelStyle, insertArtifact, insertVersion, latestArtifact, listRunReviews } from '@videogen/db';
import { SpecStore, type FakeScript } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { FakeAudioDriver, type FakeAudioOptions, type VoiceOutput } from '../src/audio/driver.ts';
import { putBlob } from '../src/media.ts';
import { finalRenderExecutor, finalSource } from '../src/pipeline/final-steps.ts';
import { causeKey, roundCause } from '../src/pipeline/fix-round.ts';
import { audioRefErrors, runFixer } from '../src/pipeline/fixer.ts';
import { fixVersionId, reviewExecutor } from '../src/pipeline/review-step.ts';
import { buildExecutor, draftRenderExecutor, draftReviewExecutor, sha, storyboardExecutor } from '../src/pipeline/steps.ts';
import { voiceExecutor, voKey } from '../src/pipeline/voice-step.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { panelHarness } from './final-helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const FIX = resolve(import.meta.dirname, '../../../tests/fixtures/artifacts');
const fx = (n: string) => JSON.parse(readFileSync(resolve(FIX, `${n}.json`), 'utf8'));
const PRODUCT = resolve(import.meta.dirname, '../../../python/vg_blender/examples/kalem/product.py');
const SKIP_NOTE = 'final düzeltme turu: taslak incelemesi atlandı (§7.2)';

/**
 * The review step with the real fixer: the panel harness plus what the fixer reads (the SpecStore with the reviewed versions, scene/product.py and
 * the run's product_py artifact), all written under the reviewed version so the fixer's own artifacts are told apart by the pending version.
 */
async function setup(name: string, o: { qc?: string[]; vo?: boolean } = {}) {
  const h = panelHarness(t);
  cleanups.push(() => h.stop());
  h.deps.fixer = runFixer;
  const p = await h.prepare(name, o);
  const store = new SpecStore(join(p.runDir, 'spec'), ARTIFACT_VALIDATOR);
  expect(ARTIFACT_VALIDATOR('audio', fx('audio-plan-vo'))).toEqual({ ok: true }); // M5c: write_spec(audio) is validated
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', o.vo ? 'storyboard-kalem-vo' : 'storyboard-kalem'], ['scene', 'scene-kalem']] as const) await store.write(kind, fx(f));
  mkdirSync(join(p.runDir, 'scene'), { recursive: true });
  copyFileSync(PRODUCT, join(p.runDir, 'scene', 'product.py'));
  const py = await putBlob(t.pool, h.dataDir, join(p.runDir, 'scene', 'product.py'));
  await insertArtifact(t.pool, { runId: p.r.runId, kind: 'product_py', blobSha: py.sha256, versionId: p.r.versionId });
  const base = h.deps.fakeScript!;
  /** Replace the fixer's scripted session for a test (the other roles keep the fake pipeline). */
  const fixerScript = (f: (sc: FakeScript, attempt: number) => FakeScript) => { h.deps.fakeScript = (role, ctx, n, extra) => (role === 'fixer' ? f(base(role, ctx, n, extra)!, n) : base(role, ctx, n, extra)); };
  /** Replace a reviewer's scripted output. */
  const reviewerScript = (role: string, f: (r: FinalReview) => FinalReview) => {
    const prev = h.deps.fakeScript!;
    h.deps.fakeScript = (r, ctx, n, extra) => { const sc = prev(r, ctx, n, extra)!; return r === role ? { ...sc, structured: f(sc.structured as FinalReview) } : sc; };
  };
  const review = async (over = {}) => { const ex = reviewExecutor(h.deps); const c = p.ctx('review', over); return { c, out: await ex.run(c, await ex.inputHash(c)), ex }; };
  const latest = async (kind: string) => (await latestArtifact(t.pool, p.r.runId, kind))!;
  const audits = async (action: string) => (await t.pool.query('SELECT data FROM audit_log WHERE run_id = $1 AND action = $2 ORDER BY id', [p.r.runId, action])).rows.map((x) => x.data);
  const roles = async (key: Parameters<typeof p.ctx>[0]) => h.sessionRoles(p.ctx(key).stepId);
  // A VO run as the pipeline leaves it before the review: compose has persisted the audio plan and the voice step has run (stub stem: no ffmpeg mix).
  const audioOpts: FakeAudioOptions = {};
  const tweak: { out?: (o: VoiceOutput) => VoiceOutput } = {};
  h.deps.audio = { kind: 'fake', capabilities: (v, c) => new FakeAudioDriver().capabilities(v, c), voice: async (i) => { const out = await new FakeAudioDriver(audioOpts).voice(i); return tweak.out ? tweak.out(out) : out; } };
  const vex = voiceExecutor(h.deps, { stem: (_f, i) => Promise.resolve(writeFileSync(i.out, `stem ${i.lines.length} ${i.durationS}`)) });
  if (o.vo) {
    await store.write('audio', fx('audio-plan-vo'));
    await insertArtifact(t.pool, { runId: p.r.runId, kind: 'audio', content: fx('audio-plan-vo'), versionId: p.r.versionId });
    const vc = p.ctx('voice');
    expect(await vex.run(vc, await vex.inputHash(vc))).toMatchObject({ status: 'done' });
  }
  const verdict = (round: number) => insertArtifact(t.pool, { runId: p.r.runId, kind: 'final_verdict', content: { verdict: 'fix', failed: ['text_readable'] }, meta: { fixRound: round } });
  /** One fix round (new round number `round`) without the reviewers: the fixer writes the specs `edits(attempt)` names, as write_spec would. */
  const fix = async (round: number, edits: (attempt: number) => Partial<Record<'storyboard' | 'scene' | 'audio', unknown>>, scope: FixReport['rerender_scope'] = 'compose') => {
    await verdict(round - 1);
    const taken = Object.fromEntries(await Promise.all((['storyboard', 'scene', 'audio'] as const).map(async (k) => [k, (await store.read(k))?.version ?? 0])));
    const report: FixReport = { round, addressed: [{ check_id: 'text_readable', change_summary_tr: 'Düzeltildi', files: [] }], not_addressed: [], rerender_scope: scope, spec_diffs: ['düzeltildi'] };
    fixerScript((sc, n) => ({ ...sc, structured: report, files: Object.fromEntries(Object.entries(edits(n)).map(([k, v]) => [`spec/${k}/v${String(taken[k]! + 1 + n).padStart(4, '0')}.json`, JSON.stringify(v)])) }));
    const finding = { check_id: 'text_readable', severity: 'major', evidence: null, fix_hint: 'Kısalt.' };
    return runFixer(h.deps, p.ctx('review', { fixRound: round - 1 }), { hash: `fix-${round}`, round, versionId: fixVersionId(p.r.runId, round), verdict: 'fix', findings: [finding] });
  };
  const head = async <T>(kind: 'storyboard' | 'scene' | 'audio') => (await store.read(kind))!.value as T;
  return { h, p, store, fixerScript, reviewerScript, review, latest, audits, roles, vex, tweak, fix, head };
}

const withBeat = (s: Storyboard, i: number, f: (b: Storyboard['beats'][number]) => Storyboard['beats'][number]): Storyboard => ({ ...s, beats: s.beats.map((b, k) => (k === i ? f(b) : b)) });
/** The boundary between the first two beats moves by 0,2 s: a timing change that keeps the storyboard valid. */
const shiftBoundary = (s: Storyboard): Storyboard => withBeat(withBeat(s, 0, (b) => ({ ...b, t_end: b.t_end + 0.2 })), 1, (b) => ({ ...b, t_start: b.t_start + 0.2 }));

describe('fixer (final review loop)', () => {
  it('compose scope: the fixer shortens the beat text, the step records the fix report and the new storyboard under the new version, and rewinds to compose', async () => {
    const s = await setup('Tükenmez kalem rötuş');
    const finalBefore = (await finalSource(s.h.deps, s.p.r.runId))!.hash;
    const { c, out } = await s.review();
    const vid = fixVersionId(s.p.r.runId, 1);
    expect(out).toMatchObject({ status: 'rewind', to: 'compose', loop: 'final', version: { id: vid, reason: 'fix:compose' } });
    expect(await s.h.sessionRoles(c.stepId)).toEqual(['fixer', 'reviewer_facts', 'reviewer_retention', 'reviewer_visual']);
    const report = await s.latest('fix_report');
    // Persist first, report last: the storyboard sits under the pending version and the report names it.
    expect(report.meta).toEqual({ fixRound: 0, scope: 'compose', changed: ['storyboard.text'], versionId: vid, claimed: 'compose' });
    expect(report.versionId).toBe(vid);
    expect((report.content as FixReport).round).toBe(1);
    const board = await s.latest('storyboard');
    expect(board.versionId).toBe(vid);
    expect((board.content as Storyboard).beats[1]!.onscreen_text.tr).toBe('Kısa yazı 1');
    expect((await t.pool.query('SELECT parent_version_id, round, reason FROM versions WHERE id = $1', [vid])).rows).toEqual([{ parent_version_id: s.p.r.versionId, round: 1, reason: 'fix:pending' }]);
    // Review focus 2: nothing the final render reads changed, so the frames are not stale and no build artifact was written.
    expect((await finalSource(s.h.deps, s.p.r.runId))!.hash).toBe(finalBefore);
    expect((await s.latest('scene')).versionId).toBeNull();
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind IN ('scene_glb', 'product_py') AND version_id = $2", [s.p.r.runId, vid])).rowCount).toBe(0);
    expect(await s.audits('fix.scope')).toEqual([]);
  }, 180_000);

  it('build scope: a lens change is built in the fixer session (build_scene), the step rewinds to build; the next build runs without a builder session and draft_review passes through', async () => {
    const s = await setup('Tükenmez kalem geometri');
    const finalBefore = (await finalSource(s.h.deps, s.p.r.runId))!.hash;
    const bex = buildExecutor(s.h.deps);
    const hash0 = await bex.inputHash(s.p.ctx('build'));
    const { out } = await s.review();
    const vid = fixVersionId(s.p.r.runId, 1);
    expect(out).toMatchObject({ status: 'rewind', to: 'build', loop: 'final', version: { id: vid, reason: 'fix:build' } });
    expect((await s.latest('fix_report')).meta).toMatchObject({ fixRound: 0, scope: 'build', changed: ['scene.render'], versionId: vid, claimed: 'build' });
    // The trusted build ran inside the fixer's check (a build directory exists) and the new scene sits under the pending version.
    expect((await t.pool.query("SELECT 1 FROM agent_sessions WHERE step_id = $1 AND role = 'fixer'", [s.p.ctx('review').stepId])).rowCount).toBe(1);
    const scene = await s.latest('scene');
    expect(scene.versionId).toBe(vid);
    expect((scene.content as SceneSpec).camera_keys[0]!.lens_mm).not.toBe(fx('scene-kalem').camera_keys[0].lens_mm);
    expect((await s.latest('storyboard')).versionId).toBeNull();
    // The scene changed: the final frames are stale until the rebuild (the §8.3 hash moved).
    expect((await finalSource(s.h.deps, s.p.r.runId))!.hash).not.toBe(finalBefore);

    // Next round: the build step has a new hash (it never reuses the old output), runs agent-free and records the build under the new version.
    const over = { fixRound: 1, versionId: vid };
    const bc = s.p.ctx('build', over);
    const hash1 = await bex.inputHash(bc);
    expect(hash1).not.toBe(hash0);
    expect(await bex.reuse!(bc, hash1)).toBe(false);
    const builders = s.h.specs.filter((x) => x.role === 'builder').length;
    // A trusted build that reports errors fails the agent-free step and records nothing (no builder to send the errors to).
    const render = s.h.deps.scene!.render;
    const realBuild = render.build.bind(render);
    render.build = (async () => ({ report: { ok: false, errors: ['kasıtlı build hatası'], warnings: [] }, files: null })) as unknown as typeof render.build;
    expect(await bex.run(bc, hash1)).toEqual({ status: 'failed', error: 'build_scene: kasıtlı build hatası', retry: false });
    render.build = realBuild;
    for (const kind of ['scene', 'scene_glb', 'product_py', 'preview_sheet']) expect(await findArtifact(t.pool, { runId: s.p.r.runId, kind, inputHash: hash1 }), kind).toBeNull();
    expect(await s.roles('build')).toEqual([]);
    const specVersions = async () => (await import('node:fs/promises')).readdir(join(s.p.runDir, 'spec', 'scene')).then((n) => n.filter((x) => x.endsWith('.json')).length);
    const specsBefore = await specVersions();
    expect(await bex.run(bc, hash1)).toMatchObject({ status: 'done' });
    expect(await specVersions()).toBe(specsBefore); // the agent-free build records the fixer's own spec version, no copy
    expect(await s.roles('build')).toEqual([]);
    expect(s.h.specs.filter((x) => x.role === 'builder')).toHaveLength(builders);
    const glb = await s.latest('scene_glb');
    expect([glb.versionId, glb.inputHash]).toEqual([vid, hash1]);
    expect(await bex.reuse!(bc, hash1)).toBe(true);
    expect((await s.latest('scene')).inputHash).toBe(hash1);
    // The draft review of a build round is skipped, before it even looks at the draft.
    const dex = draftReviewExecutor(s.h.deps);
    const dc = s.p.ctx('draft_review', over);
    expect(await dex.run(dc, await dex.inputHash(dc))).toEqual({ status: 'done', note: SKIP_NOTE });
    expect(await s.roles('draft_review')).toEqual([]);
  }, 180_000);

  it('an unchanged fix stops the loop (unchanged); a claimed scope smaller than the change is raised to the computed one (audited); a research edit goes back to the same session', async () => {
    // değişmez: the fixer changes nothing.
    const a = await setup('Tükenmez kalem değişmez');
    const first = await a.review();
    expect(first.out).toEqual({ status: 'done', note: expect.stringContaining(STOP_NOTE.unchanged) });
    expect((await a.latest('fix_report')).meta).toMatchObject({ scope: 'none', changed: [] });
    expect(await a.audits('loop.stop')).toEqual([expect.objectContaining({ reason: 'unchanged', fixRound: 0 })]);
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND version_id = $2", [a.p.r.runId, fixVersionId(a.p.r.runId, 1)])).rowCount).toBe(1); // the report only
    // A replay decides the same without a session and does not audit the stop twice.
    expect((await a.review()).out).toEqual(first.out);
    expect(await a.audits('loop.stop')).toHaveLength(1);
    expect((await a.roles('review')).filter((r) => r === 'fixer')).toHaveLength(1);

    // cta renders nothing: a "fix" that only touches it counts as unchanged.
    const b = await setup('Tükenmez kalem rötuş');
    b.fixerScript((sc) => {
      const board = fx('storyboard-kalem') as Storyboard;
      return { ...sc, files: { 'spec/storyboard/v0002.json': JSON.stringify({ ...board, cta: { tr: 'Başka bir çağrı' } }) } };
    });
    expect((await b.review()).out).toEqual({ status: 'done', note: expect.stringContaining(STOP_NOTE.unchanged) });
    expect((await b.latest('fix_report')).meta).toMatchObject({ scope: 'none', changed: [], claimed: 'compose' });
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'storyboard' AND version_id = $2", [b.p.r.runId, fixVersionId(b.p.r.runId, 1)])).rowCount).toBe(0);

    // The fixer claims compose but changed a render field: the computed build scope wins and the mismatch is audited.
    const c = await setup('Tükenmez kalem geometri');
    c.fixerScript((sc) => ({ ...sc, structured: { ...(sc.structured as FixReport), rerender_scope: 'compose' } }));
    const out = await c.review();
    expect(out.out).toMatchObject({ status: 'rewind', to: 'build', version: { reason: 'fix:build' } });
    expect(await c.audits('fix.scope')).toEqual([{ claimed: 'compose', computed: 'build', changed: ['scene.render'], fixRound: 0 }]);
    expect((await c.latest('fix_report')).meta).toMatchObject({ scope: 'build', claimed: 'compose' });

    // A research edit goes back to the same fixer session as an error; the corrected round then passes.
    const d = await setup('Tükenmez kalem rötuş');
    d.fixerScript((sc, n) => {
      const research = fx('research-kalem');
      const edit = n === 0 ? { ...research, interpretation: 'Değiştirilmiş yorum' } : research;
      return { ...sc, files: { ...(sc as { files: Record<string, string> }).files, [`spec/research/v${n === 0 ? '0002' : '0003'}.json`]: JSON.stringify(edit) } };
    });
    const r = await d.review();
    expect(r.out).toMatchObject({ status: 'rewind', to: 'compose' });
    const fixers = d.h.specs.filter((x) => x.role === 'fixer');
    expect(fixers).toHaveLength(2);
    expect(fixers[1]).toMatchObject({ resume: true, claudeSessionId: fixers[0]!.claudeSessionId });
    expect(fixers[1]!.prompt).toContain('araştırma');
    expect((await d.latest('fix_report')).meta).toMatchObject({ scope: 'compose', changed: ['storyboard.text'] });
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'research' AND version_id IS NOT NULL", [d.p.r.runId])).rowCount).toBe(0);
  }, 240_000);

  it('fixer model by category: opus for visual/narrative failures, sonnet for qc- or facts-only (K12); the prompt carries only failed checks, fenced', async () => {
    const a = await setup('Tükenmez kalem rötuş');
    await a.review();
    const visual = a.h.specs.find((x) => x.role === 'fixer')!;
    expect(visual.model).toBe('opus');
    const failed = ['text_readable', 'text_dwell', 'd7_bitrate'];
    for (const id of failed) expect(visual.prompt).toContain(id);
    expect(visual.prompt).toContain('<<<VERI');
    expect(visual.prompt).toContain('review/final/r0/');
    // Passing checks and the reviewers' own summaries are not handed over (spec §8.3); the failed findings carry hint and evidence.
    for (const id of ['hero_frame0', 'hook_pattern', 'claims_verified']) expect(visual.prompt).not.toContain(id);
    for (const f of ['final-review-visual-fix', 'final-review-facts-pass', 'final-review-retention-pass']) expect(visual.prompt).not.toContain(fx(f).summary_tr);
    const fixHint = (fx('final-review-visual-fix') as FinalReview).checks.find((x) => x.id === 'text_readable')!.fix_hint!;
    expect(visual.prompt).toContain(fixHint);
    expect(visual.prompt).toContain('Araştırmayı değiştirme');

    // qc-only (an AUTO gate failed, no reviewer ran): technical → sonnet.
    const b = await setup('Tükenmez kalem', { qc: ['g6_layout'] });
    await b.review();
    expect(b.h.specs.find((x) => x.role === 'fixer')).toMatchObject({ model: 'sonnet' });
    expect(b.h.specs.find((x) => x.role === 'fixer')!.prompt).toContain('g6_layout');

    // facts-only: factual → sonnet.
    const c = await setup('Tükenmez kalem');
    c.reviewerScript('reviewer_facts', (r) => ({ ...r, checks: r.checks.map((x) => (x.id === 'claims_verified' ? { id: x.id, pass: false, score: 0.1, evidence: { frame: 30, timecode: 1 }, fix_hint: 'İddiayı yumuşat.' } : x)) }));
    const out = await c.review();
    expect(out.out).toMatchObject({ status: 'rewind', to: 'compose' });
    expect(c.h.specs.find((x) => x.role === 'fixer')).toMatchObject({ model: 'sonnet' });
    expect(c.h.specs.find((x) => x.role === 'fixer')!.prompt).toContain('claims_verified');
  }, 240_000);

  it('rework: the storyboard step gets the failed findings fenced and a new hash; the build continues its builder session with the new storyboard', async () => {
    const s = await setup('Tükenmez kalem vasat');
    const bex = buildExecutor(s.h.deps);
    const sex = storyboardExecutor(s.h.deps);
    const sb0 = await sex.inputHash(s.p.ctx('storyboard'));
    // First pass (fixRound 0): the hashes are exactly the pre-M5b formulas, so existing outputs keep being reused.
    const idOf = async (kind: string) => (await latestArtifact(t.pool, s.p.r.runId, kind))?.id ?? null;
    expect(sb0).toBe(sha({ step: 'storyboard', research: await idOf('research'), audioMode: 'silent', schema: 'Storyboard@1' }));
    const style = await getChannelStyle(t.pool);
    const build0 = await bex.inputHash(s.p.ctx('build'));
    expect(build0).toBe(sha({ step: 'build', storyboard: await idOf('storyboard'), style: style.id, schema: 'SceneSpec@1', round: 0, review: null }));
    const dex0 = draftReviewExecutor(s.h.deps);
    expect(await dex0.inputHash(s.p.ctx('draft_review'))).toBe(sha({ step: 'draft_review', draft: null, draftHash: null, rubric: DRAFT_RUBRIC_VERSION, round: 0 }));
    const { out } = await s.review();
    // The round-0 build ran earlier in the real run; here it comes after the review only because a rebuild would make the reviewed final stale (F23).
    expect(await bex.run(s.p.ctx('build'), await bex.inputHash(s.p.ctx('build')))).toMatchObject({ status: 'done' });
    const first = s.h.specs.filter((x) => x.role === 'builder');
    expect(first).toHaveLength(1);
    const vid = fixVersionId(s.p.r.runId, 1);
    expect(out).toMatchObject({ status: 'rewind', to: 'storyboard', loop: 'final', version: { id: vid, reason: 'fix:rework' } });
    const verdict = await s.latest('final_verdict');
    expect(await roundCause(t.pool, s.p.r.runId, 1)).toEqual({ kind: 'rework', verdictId: verdict.id, fixReportId: null, failed: (verdict.content as { failed: string[] }).failed, rebuild: null, changed: [] });

    const over = { fixRound: 1, versionId: vid };
    const sc = s.p.ctx('storyboard', over);
    const sb1 = await sex.inputHash(sc);
    expect(sb1).not.toBe(sb0);
    expect(await sex.reuse!(sc, sb1)).toBe(false);
    expect(await sex.run(sc, sb1)).toMatchObject({ status: 'done' });
    const sbSpec = s.h.specs.filter((x) => x.role === 'storyboarder').at(-1)!;
    const rework = (await listRunReviews(t.pool, s.p.r.runId)).filter((r) => r.round === 0 && r.seq === 1).flatMap((r) => r.findings);
    expect(rework.length).toBeGreaterThan(0);
    expect(sbSpec.prompt).toContain('Final incelemesi bulguları');
    expect(sbSpec.prompt).toContain('<<<VERI');
    for (const f of rework.filter((x) => x.fixHint)) expect(sbSpec.prompt).toContain(f.fixHint!);
    expect(sbSpec.prompt).toContain('yeniden yaz');

    // The build is agentic again: the step's builder session continues with the new storyboard; a new hash, never a reuse.
    const bc = s.p.ctx('build', over);
    const b1 = await bex.inputHash(bc);
    expect(b1).not.toBe(await bex.inputHash(s.p.ctx('build')));
    expect(await bex.run(bc, b1)).toMatchObject({ status: 'done' });
    const builders = s.h.specs.filter((x) => x.role === 'builder');
    expect(builders).toHaveLength(2);
    expect(builders[1]).toMatchObject({ resume: true, claudeSessionId: first[0]!.claudeSessionId });
    expect(builders[1]!.prompt).toContain('Storyboard yeniden yazıldı');
    expect(builders[1]!.prompt).toContain('<<<VERI');
    // The draft review of a rework round is not skipped (it does not find a draft here, which is the proof it ran).
    const dex = draftReviewExecutor(s.h.deps);
    const dc = s.p.ctx('draft_review', over);
    expect(await dex.run(dc, await dex.inputHash(dc))).toMatchObject({ status: 'failed', error: 'incelenecek taslak yok' });
  }, 240_000);

  it('restart after the fixer: the stored fix report replays the same rewind without a new session; a fixer that died after writing a spec still diffs against the reviewed version; the version id is the same after a restart', async () => {
    const s = await setup('Tükenmez kalem rötuş');
    const vid = fixVersionId(s.p.r.runId, 1);
    const versions = async () => (await t.pool.query('SELECT id FROM versions WHERE video_id = $1 AND round = 1', [s.p.r.videoId])).rows.map((x) => x.id);
    // The first fixer wrote the spec and died with a contract breach (no valid report): nothing persisted, no commit marker.
    let broken = true;
    s.fixerScript((sc) => (broken ? { ...sc, structured: { round: 9 } } : { ...sc, files: {} }));
    expect((await s.review()).out).toMatchObject({ status: 'failed' });
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind IN ('fix_report', 'storyboard') AND version_id = $2", [s.p.r.runId, vid])).rowCount).toBe(0);
    expect(((await s.store.read('storyboard'))!.value as Storyboard).beats[1]!.onscreen_text.tr).toBe('Kısa yazı 1'); // the spec file is there
    // Restart: the fixer session continues (the spec exists already, the new script writes nothing) and the diff still sees the change.
    broken = false;
    const again = await s.review({ attempt: 2 });
    expect(again.out).toMatchObject({ status: 'rewind', to: 'compose', version: { id: vid, reason: 'fix:compose' } });
    expect((await s.latest('fix_report')).meta).toMatchObject({ scope: 'compose', changed: ['storyboard.text'], versionId: vid });
    expect((await s.latest('storyboard')).versionId).toBe(vid);
    const fixers = s.h.specs.filter((x) => x.role === 'fixer');
    expect(fixers.at(-1)).toMatchObject({ resume: true });
    expect(await versions()).toEqual([vid]);
    // Everything stored: the same rewind comes back without a new session or a second artifact.
    const count = fixers.length;
    const artifacts = (await t.pool.query("SELECT count(*)::int AS n FROM artifacts WHERE run_id = $1 AND version_id = $2", [s.p.r.runId, vid])).rows[0].n;
    expect((await s.review({ attempt: 3 })).out).toEqual(again.out);
    expect(s.h.specs.filter((x) => x.role === 'fixer')).toHaveLength(count);
    expect((await t.pool.query("SELECT count(*)::int AS n FROM artifacts WHERE run_id = $1 AND version_id = $2", [s.p.r.runId, vid])).rows[0].n).toBe(artifacts);
    expect(await versions()).toEqual([vid]);

    // Partial revert: a crashed attempt persisted a storyboard under the pending version, then the head went back; a fixer that only changes the
    // scene must leave the newest storyboard artifact of the version equal to the head (the reviewed one), not the stale edit.
    const r = await setup('Tükenmez kalem geometri');
    const rv = fixVersionId(r.p.r.runId, 1);
    await insertVersion(t.pool, { id: rv, videoId: r.p.r.videoId, parentVersionId: r.p.r.versionId, round: 1, reason: 'fix:pending' });
    const stale = { ...(fx('storyboard-kalem') as Storyboard), cta: { tr: 'Eski çağrı' } };
    await insertArtifact(t.pool, { runId: r.p.r.runId, kind: 'storyboard', content: stale, versionId: rv });
    expect((await r.review()).out).toMatchObject({ status: 'rewind', to: 'build' });
    const newest = (await t.pool.query("SELECT content FROM artifacts WHERE run_id = $1 AND kind = 'storyboard' AND version_id = $2 ORDER BY created_at DESC LIMIT 1", [r.p.r.runId, rv])).rows[0].content;
    expect(newest).toEqual(fx('storyboard-kalem'));

    // Crash between persist and the report: the storyboard artifact and the spec head exist, the report does not. Two runs: one artifact, same rewind.
    const c = await setup('Tükenmez kalem rötuş');
    const cv = fixVersionId(c.p.r.runId, 1);
    await insertVersion(t.pool, { id: cv, videoId: c.p.r.videoId, parentVersionId: c.p.r.versionId, round: 1, reason: 'fix:pending' });
    const edited = { ...(fx('storyboard-kalem') as Storyboard), beats: (fx('storyboard-kalem') as Storyboard).beats.map((b, i) => (i === 1 ? { ...b, onscreen_text: { tr: 'Kısa yazı 1' } } : b)) };
    await c.store.write('storyboard', edited);
    await insertArtifact(t.pool, { runId: c.p.r.runId, kind: 'storyboard', content: edited, versionId: cv });
    const one = await c.review();
    expect(one.out).toMatchObject({ status: 'rewind', to: 'compose', version: { id: cv, reason: 'fix:compose' } });
    expect((await c.review({ attempt: 2 })).out).toEqual(one.out);
    expect((await t.pool.query("SELECT count(*)::int AS n FROM artifacts WHERE run_id = $1 AND kind = 'storyboard' AND version_id = $2", [c.p.r.runId, cv])).rows[0].n).toBe(1);
  }, 240_000);

  it('roundCause reads only the previous round: a build round followed by a rework round makes the next build agentic and the draft review run', async () => {
    const s = await setup('Tükenmez kalem');
    const at = (kind: string, fixRound: number, content: unknown, meta: Record<string, unknown> = {}) => insertArtifact(t.pool, { runId: s.p.r.runId, kind, content, meta: { fixRound, ...meta } });
    // Round 0 was fixed with a build; round 1's review then asked for a rework (no fix report: the verdict itself rewound the run).
    const v0 = await at('final_verdict', 0, { verdict: 'fix', failed: ['mechanism_shot'] });
    const f0 = await at('fix_report', 0, fx('fix-report-compose'), { scope: 'build', changed: ['scene.render'], claimed: 'build' });
    const v1 = await at('final_verdict', 1, { verdict: 'rework', failed: ['hook_frame0', 'payoff'] });
    expect(await roundCause(t.pool, s.p.r.runId, 1)).toEqual({ kind: 'build', verdictId: v0.id, fixReportId: f0.id, failed: ['mechanism_shot'], rebuild: null, changed: ['scene.render'] });
    // The M5b shape of the key is kept for a non-voice cause, and a voice track of that round (a rework or voice round's) cannot move a build round's hash.
    expect(causeKey(await roundCause(t.pool, s.p.r.runId, 1))).toEqual({ kind: 'build', verdict: v0.id, fixReport: f0.id });
    const hashOf = async () => buildExecutor(s.h.deps).inputHash(s.p.ctx('build', { fixRound: 1 }));
    const buildHash = await hashOf();
    await at('voice_track', 1, {}, { rebuild: true });
    expect(await hashOf()).toBe(buildHash);
    // A newer fix report of another round never leaks in: round 2 reads round 1 only.
    expect(await roundCause(t.pool, s.p.r.runId, 2)).toEqual({ kind: 'rework', verdictId: v1.id, fixReportId: null, failed: ['hook_frame0', 'payoff'], rebuild: null, changed: [] });
    expect(await roundCause(t.pool, s.p.r.runId, 3)).toBeNull();
    expect(await roundCause(t.pool, s.p.r.runId, 0)).toBeNull();
    // A claimed storyboard rewrite without any change is a rework too.
    await at('final_verdict', 2, { verdict: 'fix', failed: ['payoff'] });
    const f2 = await at('fix_report', 2, fx('fix-report-compose'), { scope: 'none', changed: [], claimed: 'storyboard' });
    expect(await roundCause(t.pool, s.p.r.runId, 3)).toMatchObject({ kind: 'rework', fixReportId: f2.id });

    // Round 2 (cause: rework): the build is agentic (a builder session opens, not the agent-free path) and the draft review is not skipped.
    const over = { fixRound: 2 };
    const bex = buildExecutor(s.h.deps);
    const bc = s.p.ctx('build', over);
    expect(await bex.run(bc, await bex.inputHash(bc))).toMatchObject({ status: 'done' });
    expect(await s.roles('build')).toEqual(['builder']);
    const dex = draftReviewExecutor(s.h.deps);
    const dc = s.p.ctx('draft_review', over);
    expect(await dex.run(dc, await dex.inputHash(dc))).toMatchObject({ status: 'failed', error: 'incelenecek taslak yok' });
    // Round 1 (cause: build): agent-free build and the skipped draft review. A wrong reader (latest artifact of any round) would swap the two.
    const one = { fixRound: 1 };
    const dc1 = s.p.ctx('draft_review', one);
    expect(await dex.run(dc1, await dex.inputHash(dc1))).toEqual({ status: 'done', note: SKIP_NOTE });
    const bc1 = s.p.ctx('build', one);
    expect(await bex.run(bc1, await bex.inputHash(bc1))).toMatchObject({ status: 'done' });
    expect(await s.roles('build')).toEqual(['builder']); // still the one session of round 2
  }, 240_000);
  it('voice scope: the fixer rewrites a vo_text, the step records the fix report and the storyboard under the new version and rewinds to voice; an AudioPlan edit rewinds to compose; a disallowed music track or a beat time edit in VO mode goes back to the same session; in silent mode a beat time stays compose; a VO text plus a lens change rewinds to voice and the build runs agent-free; in VO mode an onscreen_text-only fix is a compose round whose compose accepts the unchanged voice track (same voKey, new storyboard row)', async () => {
    const s = await setup('Tükenmez kalem vo', { vo: true });
    const runId = s.p.r.runId;
    const vo0 = await s.head<Storyboard>('storyboard');
    // Compose has persisted the audio plan: the rounds that do not touch it must not list `audio` (prev and next read the same plan).
    const scene = await s.head<SceneSpec>('scene');
    const edited = withBeat(vo0, 1, (b) => ({ ...b, vo_text: { tr: 'Kalemi açınca içinden yalnızca beş parça çıkıyor.' } }));
    const v1 = fixVersionId(runId, 1);
    // A VO text plus a lens change is a voice round (the earliest step wins); the trusted build ran inside the fixer's check.
    expect(await s.fix(1, () => ({ storyboard: edited, scene: { ...scene, camera_keys: scene.camera_keys.map((k, i) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 } : k)) } }), 'voice'))
      .toMatchObject({ status: 'rewind', to: 'voice', loop: 'final', version: { id: v1, reason: 'fix:voice' } });
    expect((await s.latest('fix_report')).meta).toEqual({ fixRound: 0, scope: 'voice', changed: ['scene.render', 'storyboard.vo'], versionId: v1, claimed: 'voice' });
    const board = await s.latest('storyboard');
    expect([board.versionId, (board.content as Storyboard).beats[1]!.vo_text!.tr]).toEqual([v1, 'Kalemi açınca içinden yalnızca beş parça çıkıyor.']);
    expect((await s.latest('scene')).versionId).toBe(v1);
    expect(await roundCause(t.pool, runId, 1)).toMatchObject({ kind: 'voice', rebuild: null, changed: ['scene.render', 'storyboard.vo'] });
    expect(await s.audits('fix.scope')).toEqual([]);
    // The next build (the voice step ran before it) is agent-free: no builder session, the fixer's scene is built.
    const bex = buildExecutor(s.h.deps);
    const bc = s.p.ctx('build', { fixRound: 1, versionId: v1 });
    // Without this round's voice track the build refuses (the voice step always runs before it).
    expect(await bex.run(bc, await bex.inputHash(bc))).toEqual({ status: 'failed', error: 'seslendirme turu: bu turun seslendirmesi yok', retry: false });
    const vc1 = s.p.ctx('voice', { fixRound: 1, versionId: v1 });
    expect(await s.vex.run(vc1, await s.vex.inputHash(vc1))).toMatchObject({ status: 'done' });
    expect(await bex.run(bc, await bex.inputHash(bc))).toMatchObject({ status: 'done' });
    expect(await s.roles('build')).toEqual([]);
    expect((await s.latest('scene')).inputHash).toBe(await bex.inputHash(bc));

    // An AudioPlan edit recomposes; the plan sits under the new version.
    const plan0 = await s.head<AudioPlan>('audio');
    const v2 = fixVersionId(runId, 2);
    expect(await s.fix(2, () => ({ audio: { ...plan0, duck_db: 14 } }))).toMatchObject({ status: 'rewind', to: 'compose', version: { id: v2, reason: 'fix:compose' } });
    expect((await s.latest('fix_report')).meta).toMatchObject({ scope: 'compose', changed: ['audio'] });
    expect([(await s.latest('audio')).versionId, ((await s.latest('audio')).content as AudioPlan).duck_db]).toEqual([v2, 14]);

    // Round 3: a first attempt with a beat time edit and an unknown music track goes back to the same session; the second is an onscreen_text-only fix.
    const vo2 = await s.head<Storyboard>('storyboard');
    const plan2 = await s.head<AudioPlan>('audio');
    const fixers = () => s.h.specs.filter((x) => x.role === 'fixer');
    const before = fixers().length;
    const text = withBeat(vo2, 2, (b) => ({ ...b, onscreen_text: { tr: 'Kısa yazı 3' } }));
    const boardBefore = await s.latest('storyboard');
    const out3 = await s.fix(3, (n) => (n === 0
      ? { storyboard: shiftBoundary(vo2), audio: { ...plan2, music: { asset_id: '0f8fad5b-d9cb-469f-a165-70867728950e', gain_db: -18 } } }
      : { storyboard: text, audio: plan2 }));
    expect(out3).toMatchObject({ status: 'rewind', to: 'compose', version: { reason: 'fix:compose' } });
    expect(fixers()).toHaveLength(before + 2);
    expect(fixers().at(-1)).toMatchObject({ resume: true, claudeSessionId: fixers().at(-2)!.claudeSessionId });
    expect(fixers().at(-1)!.prompt).toContain("vuruş zamanlarını seslendirme belirler; yalnızca vo_text'i değiştir");
    expect(fixers().at(-1)!.prompt).toContain('izinli müzik');
    expect((await s.latest('fix_report')).meta).toMatchObject({ scope: 'compose', changed: ['storyboard.text'] });
    const textRow = await s.latest('storyboard');
    expect(textRow.id).not.toBe(boardBefore.id);
    // Compose is not run here: it accepts a track whose voKey matches the latest storyboard, and the on-screen text change leaves the voKey as it was.
    expect(voKey(textRow.content as Storyboard)).toBe(voKey(vo2));
    // The prompt of the fixer carries the voice/audio paths and the current plan, fenced.
    expect(fixers()[0]!.prompt).toContain('Seslendirme metni ya da telaffuz');
    expect(fixers()[0]!.prompt).toContain('"duck_db":12');
    expect(fixers()[0]!.prompt).toMatch(/Mevcut ses planı \(AudioPlan\)[^\n]*\n<<<VERI\n\{"version":1/);

    // Silent mode: a beat time edit stays a compose round; the plan's music rules are pure.
    const q = await setup('Tükenmez kalem');
    const sb = await q.head<Storyboard>('storyboard');
    expect(await q.fix(1, () => ({ storyboard: shiftBoundary(sb) }))).toMatchObject({ status: 'rewind', to: 'compose' });
    expect((await q.latest('fix_report')).meta).toMatchObject({ scope: 'compose', changed: ['storyboard.timing'] });
    const music = { ...plan0, mode: 'silent' as const, music: { asset_id: '0f8fad5b-d9cb-469f-a165-70867728950e', gain_db: -18 } };
    const ids = new Map([[music.music.asset_id, 'Parça A']]);
    expect(audioRefErrors({ next: music, prev: music, mode: 'silent', allowedMusic: ids })).toEqual([]);
    expect(audioRefErrors({ next: { ...music, music: { ...music.music, asset_id: null } }, prev: music, mode: 'silent', allowedMusic: ids })).toEqual([expect.stringContaining('müzik kaldırılamaz')]);
    expect(audioRefErrors({ next: { ...music, music: { ...music.music, asset_id: null } }, prev: { ...music, music: { ...music.music, asset_id: null } }, mode: 'silent', allowedMusic: ids })).toEqual([]);
    expect(audioRefErrors({ next: { ...music, mode: 'vo', music: { ...music.music, asset_id: null } }, prev: music, mode: 'vo', allowedMusic: ids })).toEqual([]);
    // An unknown track is refused only when the plan changed (a stored plan is replayed as is), and the error lists what is allowed.
    expect(audioRefErrors({ next: music, prev: music, mode: 'silent', allowedMusic: new Map() })).toEqual([]);
    expect(audioRefErrors({ next: music, prev: null, mode: 'silent', allowedMusic: new Map([['id-2', 'Parça B']]) })).toEqual([expect.stringMatching(/izinli parçalar: id-2 \(Parça B\)/)]);
    // prev === null (a legacy run without a stored plan) counts as "no music before": removal is not refused.
    expect(audioRefErrors({ next: { ...music, music: { ...music.music, asset_id: null } }, prev: null, mode: 'silent', allowedMusic: ids })).toEqual([]);
  }, 240_000);

  it("in a VO video a fix that changes a beat id or its vo text outside a voice-scope round is refused with 'seslendirmeli videoda vuruş kimliklerini ve metinlerini değiştirme'; a voice-scope round may", async () => {
    const s = await setup('Tükenmez kalem vo kimlik', { vo: true });
    const REFUSAL = 'seslendirmeli videoda vuruş kimliklerini ve metinlerini değiştirme';
    const fixers = () => s.h.specs.filter((x) => x.role === 'fixer');
    const vo0 = await s.head<Storyboard>('storyboard');
    // A beat id change alone is a compose-scope change (storyboard.structure), yet the voice track (voKey) belongs to the old id: refused,
    // the same session's second attempt changes the on-screen text only and is a compose round.
    const renamed = withBeat(vo0, 2, (b) => ({ ...b, id: 'b3-yeni' }));
    const text = withBeat(vo0, 2, (b) => ({ ...b, onscreen_text: { tr: 'Kısa yazı 3' } }));
    expect(await s.fix(1, (n) => ({ storyboard: n === 0 ? renamed : text }))).toMatchObject({ status: 'rewind', to: 'compose', version: { reason: 'fix:compose' } });
    expect(fixers()).toHaveLength(2);
    expect(fixers()[1]).toMatchObject({ resume: true, claudeSessionId: fixers()[0]!.claudeSessionId });
    expect(fixers()[1]!.prompt).toContain(REFUSAL);
    expect((await s.latest('fix_report')).meta).toMatchObject({ scope: 'compose', changed: ['storyboard.text'] });
    expect(voKey((await s.latest('storyboard')).content as Storyboard)).toBe(voKey(vo0));

    // A voice-scope round (a vo_text rewrite) may rename the beat too: the voice step makes a new track for the new key.
    const vo1 = await s.head<Storyboard>('storyboard');
    const both = withBeat(vo1, 2, (b) => ({ ...b, id: 'b3-yeni', vo_text: { tr: 'Haznede mürekkep tam ortada duruyor.' } }));
    expect(await s.fix(2, () => ({ storyboard: both }), 'voice')).toMatchObject({ status: 'rewind', to: 'voice', version: { reason: 'fix:voice' } });
    expect(fixers()).toHaveLength(3);
    expect((await s.latest('fix_report')).meta).toMatchObject({ scope: 'voice' });
    expect((await s.latest('storyboard')).content as Storyboard).toMatchObject({ beats: expect.arrayContaining([expect.objectContaining({ id: 'b3-yeni' })]) });
  }, 120_000);

  it('voice round, timings kept: voice keeps the beats (rebuild false), build passes through without a session or artifacts, draft_render is skipped, draft_review is skipped, final_render reuses the frames; compose runs with the new stem', async () => {
    const s = await setup('Tükenmez kalem vo korunur', { vo: true });
    const runId = s.p.r.runId;
    const finalBefore = (await finalSource(s.h.deps, runId))!.hash;
    // The frames of the pre-round scene: a finished final_frames artifact for that hash.
    const framesDir = join(s.p.runDir, 'final', 'frames-before');
    mkdirSync(framesDir, { recursive: true });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40), Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.alloc(4)]);
    for (const f of [0, 1]) writeFileSync(join(framesDir, `f${String(f).padStart(5, '0')}.png`), png);
    await insertArtifact(t.pool, { runId: s.p.r.runId, kind: 'final_frames', inputHash: finalBefore, meta: { dir: join('final', 'frames-before'), frames: 2, skipped: 0, samples: 64, renderer: 'fake', renderMs: 1 } });
    const vo0 = await s.head<Storyboard>('storyboard');
    const storyboards = async () => (await t.pool.query("SELECT count(*)::int AS n FROM artifacts WHERE run_id = $1 AND kind = 'storyboard'", [runId])).rows[0].n as number;
    await s.fix(1, () => ({ storyboard: withBeat(vo0, 1, (b) => ({ ...b, vo_text: { tr: 'Kalemi açınca içinden yalnızca beş parça çıkıyor.' } })) }), 'voice');
    const over = { fixRound: 1, versionId: fixVersionId(runId, 1) };
    const vc = s.p.ctx('voice', over);
    const h0 = await s.vex.inputHash(vc);
    expect(await roundCause(t.pool, runId, 1)).toMatchObject({ kind: 'voice', rebuild: null, changed: ['storyboard.vo'] });
    const count = await storyboards();
    expect(await s.vex.run(vc, h0)).toMatchObject({ status: 'done', note: expect.stringContaining('vuruşlar korundu') });
    // The voice step's own hash does not move with what it writes (a restart reuses the track instead of writing a second one).
    expect(await s.vex.inputHash(vc)).toBe(h0);
    expect(await s.vex.reuse!(vc, h0)).toBe(true);
    const track = await s.latest('voice_track');
    expect(track.meta).toMatchObject({ fixRound: 1, rebuild: false, voiceHash: null });
    expect(await storyboards()).toBe(count); // kept: no retimed storyboard
    expect(await roundCause(t.pool, runId, 1)).toMatchObject({ kind: 'voice', rebuild: false, changed: ['storyboard.vo'] });

    const bex = buildExecutor(s.h.deps);
    const bc = s.p.ctx('build', over);
    const bh = await bex.inputHash(bc);
    expect(await bex.run(bc, bh)).toEqual({ status: 'done', note: 'seslendirme turu: vuruş süreleri korundu; sahne yeniden kullanıldı' });
    expect(await s.roles('build')).toEqual([]);
    expect((await t.pool.query('SELECT 1 FROM artifacts WHERE run_id = $1 AND input_hash = $2', [runId, bh])).rowCount).toBe(0);
    const drc = s.p.ctx('draft_render', over);
    expect(await draftRenderExecutor(s.h.deps).run(drc, 'unused')).toEqual({ status: 'done', note: 'seslendirme turu: taslak yeniden kullanıldı' });
    const dex = draftReviewExecutor(s.h.deps);
    const dc = s.p.ctx('draft_review', over);
    expect(await dex.run(dc, await dex.inputHash(dc))).toEqual({ status: 'done', note: SKIP_NOTE });
    expect(await s.roles('draft_review')).toEqual([]);
    // The scene did not change, so the final frames' hash is the same (final_render reuses them) and compose gets a track that matches the new storyboard.
    expect((await finalSource(s.h.deps, runId))!.hash).toBe(finalBefore);
    expect(await finalRenderExecutor(s.h.deps).reuse!(s.p.ctx('final_render', over), finalBefore)).toBe(true);
    // Compose is not run here: it accepts a track whose voKey matches the latest storyboard.
    expect((track.meta as { voKey: string }).voKey).toBe(voKey((await s.latest('storyboard')).content as Storyboard));
    expect((await t.pool.query("SELECT 1 FROM artifacts WHERE run_id = $1 AND kind = 'voice_stem' AND input_hash = $2", [runId, h0])).rowCount).toBe(1);
  }, 240_000);

  it('voice round, retimed: rebuild true, the build resumes its builder session with the retimed storyboard, draft_review is skipped, final_render renders new frames (stale dir removed); roundCause carries rebuild only for that round', async () => {
    const s = await setup('Tükenmez kalem vo yeniden', { vo: true });
    const runId = s.p.r.runId;
    const bex = buildExecutor(s.h.deps);
    // The first-pass build opens the builder session the retimed round continues.
    expect(await bex.run(s.p.ctx('build'), await bex.inputHash(s.p.ctx('build')))).toMatchObject({ status: 'done' });
    const first = s.h.specs.filter((x) => x.role === 'builder');
    expect(first).toHaveLength(1);
    const vo0 = await s.head<Storyboard>('storyboard');
    await s.fix(1, () => ({ storyboard: withBeat(vo0, 1, (b) => ({ ...b, vo_text: { tr: 'Kalemi açınca içinden yalnızca beş parça çıkıyor.' } })) }), 'voice');
    const over = { fixRound: 1, versionId: fixVersionId(runId, 1) };
    const vc = s.p.ctx('voice', over);
    const h0 = await s.vex.inputHash(vc);
    expect(await roundCause(t.pool, runId, 1)).toMatchObject({ kind: 'voice', rebuild: null });
    // Beat 2's line comes out 0,5 s longer and beat 3's 0,5 s shorter than their beats allow: the beats are retimed (the video stays 45 s).
    s.tweak.out = (o) => ({ ...o, lines: o.lines.map((l, i) => (i === 1 ? { ...l, durationMs: l.durationMs + 500 } : i === 2 ? { ...l, durationMs: l.durationMs - 500 } : l)) });
    expect(await s.vex.run(vc, h0)).toMatchObject({ status: 'done', note: expect.not.stringContaining('korundu') });
    expect(await s.vex.inputHash(vc)).toBe(h0);
    expect(await s.vex.reuse!(vc, h0)).toBe(true);
    expect((await s.latest('voice_track')).meta).toMatchObject({ fixRound: 1, rebuild: true });
    const retimed = await s.latest('storyboard');
    expect(retimed.meta).toMatchObject({ retimedFrom: expect.any(String) });
    expect((retimed.content as Storyboard).beats[1]!.t_end).not.toBe(vo0.beats[1]!.t_end);
    expect(await roundCause(t.pool, runId, 1)).toMatchObject({ kind: 'voice', rebuild: true });
    // rebuild belongs to its round: round 2 (its own cause: a compose fix) has no voice track yet.
    await insertArtifact(t.pool, { runId, kind: 'final_verdict', content: { verdict: 'fix', failed: ['text_readable'] }, meta: { fixRound: 1 } });
    await insertArtifact(t.pool, { runId, kind: 'fix_report', content: fx('fix-report-compose'), meta: { fixRound: 1, scope: 'compose', changed: ['storyboard.text'], claimed: 'compose' } });
    expect(await roundCause(t.pool, runId, 2)).toMatchObject({ kind: 'compose', rebuild: null });

    // The builder continues its session with the retimed storyboard.
    const blendBefore = (await finalSource(s.h.deps, runId))!.hash;
    const bc = s.p.ctx('build', over);
    const bh = await bex.inputHash(bc);
    expect(bh).not.toBe(await bex.inputHash(s.p.ctx('build')));
    // A builder that answers with the same scene and GLB did not rebuild anything: the round fails instead of passing off the old scene.
    expect(await bex.run(bc, bh)).toEqual({ status: 'failed', error: 'seslendirme turu: storyboard yeniden zamanlandı ama sahne değişmedi', retry: false });
    expect(s.h.specs.filter((x) => x.role === 'builder')).toHaveLength(2);
    expect((await t.pool.query('SELECT 1 FROM artifacts WHERE run_id = $1 AND input_hash = $2', [runId, bh])).rowCount).toBe(0);
    // The fake builder now answers with a rebuilt scene (another first camera lens).
    const rebuilt = (sc: SceneSpec): SceneSpec => ({ ...sc, camera_keys: sc.camera_keys.map((k, i) => (i === 0 ? { ...k, lens_mm: k.lens_mm + 5 } : k)) });
    const cur = s.h.deps.fakeScript!;
    s.h.deps.fakeScript = (role, ctx, n, extra) => { const sc = cur(role, ctx, n, extra)!; return role === 'builder' ? { ...sc, structured: rebuilt(sc.structured as SceneSpec) } : sc; };
    expect(await bex.run(bc, bh)).toMatchObject({ status: 'done' });
    const builders = s.h.specs.filter((x) => x.role === 'builder');
    expect(builders).toHaveLength(3);
    expect(builders[2]).toMatchObject({ resume: true, claudeSessionId: first[0]!.claudeSessionId });
    expect(builders[2]!.prompt).toContain('Storyboard seslendirmeye göre yeniden zamanlandı');
    expect(builders[2]!.prompt).toContain('<<<VERI');
    expect(builders[2]!.prompt).toContain(String((retimed.content as Storyboard).beats[1]!.t_end));
    const dex = draftReviewExecutor(s.h.deps);
    const dc = s.p.ctx('draft_review', over);
    expect(await dex.run(dc, await dex.inputHash(dc))).toEqual({ status: 'done', note: SKIP_NOTE });
    // The rebuilt scene (new length) makes the final frames stale: final_render gets a new hash and renders again.
    const newFinal = (await finalSource(s.h.deps, runId))!.hash;
    expect(newFinal).not.toBe(blendBefore);
    expect(await finalRenderExecutor(s.h.deps).reuse!(s.p.ctx('final_render', over), newFinal)).toBe(false);
  }, 240_000);
});
