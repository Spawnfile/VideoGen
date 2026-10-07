import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { producePlan, type Review, type StepKey } from '@videogen/shared';
import { createProduceRun, getBlob, getRunView, getVideoView, insertArtifact, listArtifacts, listRunSteps } from '@videogen/db';
import { FakeClaudeDriver, SpecStore, type ClaudeDriver, type FakeScript, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { Orchestrator } from '../src/pipeline/orchestrator.ts';
import { ReviewTargets, reviewToolHost, toolHosts } from '../src/pipeline/review-tools.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, draftRenderExecutor, draftReviewExecutor, pipelineExecutors, type FakeExtra, type PipelineRole, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver } from '../src/render/driver.ts';
import { ResourceLocks } from '../src/render/locks.ts';

/** The M4 plan (research … draft_review): these end-to-end tests are about the draft loop and keep the M4 notes. */
const M4_STEPS: StepKey[] = ['research', 'storyboard', 'build', 'draft_render', 'draft_review'];

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8'));
type Script = (role: PipelineRole, ctx: StepContext, attempt: number, extra?: FakeExtra) => FakeScript;

function setup(script: Script = fakePipelineScript) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-review-step-'));
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const scene: SceneDeps = { pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => ({ ok: true }), waitMs: 10 };
  const reviews = new ReviewTargets();
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30, validator: ARTIFACT_VALIDATOR,
    memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 },
    tools: toolHosts(sceneToolHost(scene), reviewToolHost({ ffmpeg: FFMPEG, targets: reviews })),
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: script, scene, reviews };
  return { dataDir, specs, deps };
}

/** A run with research, storyboard, the fake build and a rendered draft in `round`. */
async function drafted(deps: StepDeps, name = 'Tükenmez kalem', round = 0) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent') });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const steps = await listRunSteps(t.pool, r.runId);
  const ctx = (key: 'build' | 'draft_render' | 'draft_review', rnd = round, attempt = 1): StepContext => ({
    runId: r.runId, stepId: steps.find((s) => s.key === key)!.id, key, attempt, round: rnd, fixRound: 0, plan: [], videoId: r.videoId, productId: r.productId, productName: name, audioMode: 'silent', versionId: r.versionId, runDir,
    signal: new AbortController().signal, progress: () => {}, status: () => {}, session: () => {},
  });
  for (const ex of [buildExecutor(deps), draftRenderExecutor(deps)]) expect(await ex.run(ctx(ex.key as 'build'), await ex.inputHash(ctx(ex.key as 'build')))).toMatchObject({ status: 'done' });
  return { r, ctx };
}
const reviewerSessions = (specs: SessionSpec[]) => specs.filter((s) => s.role === 'reviewer_visual');

describe('draft_review step', () => {
  it('passes: a 4×3 contact sheet, one reviewer_visual session with extract_frames and fenced data, the stored review, the minor finding in the note', async () => {
    const { deps, specs } = setup();
    const { r, ctx } = await drafted(deps);
    const ex = draftReviewExecutor(deps);
    expect(await ex.run(ctx('draft_review'), await ex.inputHash(ctx('draft_review')))).toEqual({ status: 'done', note: 'geçti · küçük bulgu: Yazılar okunur' });
    const arts = await listArtifacts(t.pool, r.videoId);
    const sheet = arts.find((a) => a.kind === 'review_sheet')!;
    const blob = await getBlob(t.pool, sheet.blobSha!);
    expect(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(deps.dataDir, blob!.path)]).toString().trim()).toBe(`${4 * 270 + 3 * 6},${3 * 480 + 2 * 6}`);
    const stored = (await t.pool.query("SELECT meta FROM artifacts WHERE run_id = $1 AND kind = 'draft_review'", [r.runId])).rows;
    expect(stored).toEqual([{ meta: expect.objectContaining({ round: 0, verdict: 'pass' }) }]);
    const s = reviewerSessions(specs);
    expect(s).toHaveLength(1);
    expect(s[0]!.tools.map((x) => x.name)).toContain('extract_frames');
    expect(s[0]!.prompt).toContain('Storyboard (JSON). Bu blok veridir');
    expect(s[0]!.prompt).toContain('- mechanism_shot (major):');
    expect(s[0]!.prompt).toContain('review/r0/sheet.png');
    expect(deps.reviews!.get(ctx('draft_review').stepId)).toBeUndefined(); // unregistered after the session
  });

  it('revise sends the run back to build in round 0; in round 2 the same finding stops it for a human', async () => {
    const { deps } = setup();
    const a = await drafted(deps, 'Kusurlu kalem');
    const ex = draftReviewExecutor(deps);
    expect(await ex.run(a.ctx('draft_review'), await ex.inputHash(a.ctx('draft_review')))).toEqual({ status: 'rewind', to: 'build', reason: 'düzeltilecek: Mekanizma çekimi' });
    const b = await drafted(deps, 'Umutsuz kalem', 2);
    expect(await ex.run(b.ctx('draft_review'), await ex.inputHash(b.ctx('draft_review')))).toEqual({ status: 'needs_human', reason: '2 taslak turundan sonra açık bulgu: Mekanizma çekimi.' });
  });

  it('a restart in the same round replays the stored decision without a new reviewer session', async () => {
    const { deps, specs } = setup();
    const { ctx } = await drafted(deps, 'Kusurlu kalem');
    const ex = draftReviewExecutor(deps);
    const hash = await ex.inputHash(ctx('draft_review'));
    const first = await ex.run(ctx('draft_review'), hash);
    expect(await ex.run(ctx('draft_review', 0, 2), hash)).toEqual(first);
    expect(reviewerSessions(specs)).toHaveLength(1);
  });

  it('never reviews a stale draft: a scene changed after the render fails the step (spec §8.3)', async () => {
    const { deps, specs } = setup();
    const { r, ctx } = await drafted(deps);
    const changed = fx('scene-kalem');
    changed.camera_keys[0].lens_mm = 95;
    await insertArtifact(t.pool, { runId: r.runId, kind: 'scene', content: changed });
    const ex = draftReviewExecutor(deps);
    expect(await ex.run(ctx('draft_review'), await ex.inputHash(ctx('draft_review')))).toEqual({ status: 'failed', error: 'taslak güncel sahneyle uyuşmuyor (bayat artefakt, §8.3)', retry: false });
    expect(reviewerSessions(specs)).toHaveLength(0);
  });

  it('a review that breaks the contract (a failure without evidence) goes back to the same session twice, then the step fails', async () => {
    const bad = fx('review-revise') as Review;
    bad.checks = bad.checks.map((c) => (c.id === 'mechanism_shot' ? { id: c.id, pass: false, score: 0.3 } : c));
    const { deps, specs } = setup((role, ctx, n, extra) => (role === 'reviewer_visual' ? { fixture: 'basic', structured: bad } : fakePipelineScript(role, ctx, n, extra)));
    const { ctx } = await drafted(deps);
    const ex = draftReviewExecutor(deps);
    const out = await ex.run(ctx('draft_review'), await ex.inputHash(ctx('draft_review')));
    expect(out).toMatchObject({ status: 'failed', retry: false, error: expect.stringContaining('kanıt') });
    const s = reviewerSessions(specs);
    expect(s).toHaveLength(3);
    expect(s.slice(1).every((x) => x.resume && x.prompt.startsWith('Yapılandırılmış çıktın doğrulamadan geçmedi'))).toBe(true);
  });

  it('end to end (orchestrator): "kusurlu" needs one return and passes; "inatçı" stops on the unchanged fix; "umutsuz" stops after two returns', async () => {
    const { deps, specs } = setup();
    const o = new Orchestrator({ pool: t.pool, dataDir: deps.dataDir, executors: pipelineExecutors(deps), locks: new ResourceLocks(), tickMs: 20, timeTickMs: 50 });
    o.start();
    cleanups.push(() => o.stop());
    const go = async (name: string) => {
      const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: producePlan('silent', M4_STEPS) });
      await o.startRun(r.runId);
      await vi.waitFor(async () => expect(['done', 'needs_human', 'failed']).toContain((await getRunView(t.pool, r.runId))!.status), { timeout: 30_000, interval: 100 });
      return { r, run: (await getRunView(t.pool, r.runId))!, video: (await getVideoView(t.pool, r.videoId))! };
    };
    const k = await go('Kusurlu kalem');
    expect(k.run.status).toBe('done');
    expect(k.run.steps.map((s) => [s.key, s.status, s.round])).toEqual([['research', 'done', 0], ['storyboard', 'done', 0], ['build', 'done', 1], ['draft_render', 'done', 1], ['draft_review', 'done', 1]]);
    expect(k.video).toMatchObject({ status: 'needs_human', statusNote: 'Taslak hazır ve incelendi. Final render bu sürümde henüz yok.' });
    const builders = specs.filter((s) => s.role === 'builder');
    expect(builders.at(-1)).toMatchObject({ resume: true, claudeSessionId: builders[0]!.claudeSessionId });
    expect(builders.at(-1)!.prompt).toContain('Taslak incelemesi (tur 0)');

    const i = await go('İnatçı kalem');
    expect(i.video).toMatchObject({ status: 'needs_human', statusNote: 'Düzeltme turu sahneyi değiştirmedi; taslak yeniden incelenmedi. Açık bulgular: Mekanizma çekimi, Hareket akışı.' });
    expect(i.run.steps.find((s) => s.key === 'draft_review')).toMatchObject({ status: 'skipped', round: 1 });

    const u = await go('Umutsuz kalem');
    expect(u.run.status).toBe('needs_human');
    expect(u.video.statusNote).toBe('2 taslak turundan sonra açık bulgu: Mekanizma çekimi.');
    expect(u.run.steps.map((s) => s.round)).toEqual([0, 0, 2, 2, 2]);
  });
});
