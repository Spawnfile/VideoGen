import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { producePlan, type AudioMode } from '@videogen/shared';
import { createProduceRun, getBlob, getRunView, getVideoView, insertArtifact, insertSession, listArtifacts, listRunSteps, setChannelStyle } from '@videogen/db';
import { FakeClaudeDriver, SpecStore, type ClaudeDriver, type FakeScript, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { Orchestrator } from '../src/pipeline/orchestrator.ts';
import { sceneToolHost, type SceneDeps } from '../src/pipeline/scene-tools.ts';
import { buildExecutor, buildPrompt, pipelineExecutors, researchExecutor, storyboardPrompt, type PipelineRole, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';
import { ARTIFACT_VALIDATOR } from '../src/pipeline/validator.ts';
import { FakeRenderDriver, type Capability } from '../src/render/driver.ts';
import { ResourceLocks } from '../src/render/locks.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
beforeEach(async () => { await t.pool.query("DELETE FROM settings WHERE key = 'channel.style'"); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const fx = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8'));
type Script = (role: PipelineRole, ctx: StepContext, attempt: number, extra?: { styleId: 'atolye' | 'beyaz_lab' | 'gece_mavisi' }) => FakeScript;

function setup(o: { script?: Script; capability?: Capability } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-build-'));
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const scene: SceneDeps = { pool: t.pool, render: new FakeRenderDriver({ ffmpeg: FFMPEG, delayMs: 1 }), locks: new ResourceLocks(), ffmpeg: FFMPEG, capability: () => o.capability ?? { ok: true }, waitMs: 10 };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), sampleEveryMs: 50, pumpRetryMs: 30, validator: ARTIFACT_VALIDATOR,
    memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, tools: sceneToolHost(scene),
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: o.script ?? fakePipelineScript, scene };
  return { dataDir, specs, deps };
}

/** A run whose research and storyboard are done (artifacts + spec files, as the M4a steps leave them). */
async function buildContext(deps: StepDeps, name = 'Tükenmez kalem', attempt = 1, audioMode: AudioMode = 'silent') {
  const r = await createProduceRun(t.pool, { productName: name, audioMode, plan: producePlan(audioMode) });
  const runDir = join(deps.dataDir, 'runs', r.runId);
  const store = new SpecStore(join(runDir, 'spec'), ARTIFACT_VALIDATOR);
  for (const [kind, f] of [['research', 'research-kalem'], ['storyboard', 'storyboard-kalem']] as const) {
    await store.write(kind, fx(f));
    await insertArtifact(t.pool, { runId: r.runId, kind, content: fx(f) });
  }
  const step = (await listRunSteps(t.pool, r.runId)).find((s) => s.key === 'build')!;
  const calls = { status: [] as string[], sessions: [] as string[] };
  const ctx: StepContext = {
    runId: r.runId, stepId: step.id, key: 'build', attempt, videoId: r.videoId, productId: r.productId, productName: name, audioMode, versionId: r.versionId, runDir,
    signal: new AbortController().signal, progress: () => {}, status: (s) => { calls.status.push(s); }, session: (id) => { calls.sessions.push(id); },
  };
  return { r, ctx, calls };
}

describe('build step', () => {
  it("records the step's own trusted build: scene spec, product.py, blend, GLB, anchors, events, camera track, report and preview", async () => {
    const { deps, specs } = setup();
    const { r, ctx } = await buildContext(deps);
    const ex = buildExecutor(deps);
    const hash = await ex.inputHash(ctx);
    const out = await ex.run(ctx, hash);
    expect(out).toEqual({ status: 'done', note: '5 parça · 7.526 üçgen · 2 uyarı · kanal kimliği geçici' });
    const kinds = (await listArtifacts(t.pool, r.videoId)).map((a) => a.kind).sort();
    expect(kinds).toEqual(['build_report', 'camera_track', 'preview_sheet', 'product_py', 'research', 'scene', 'scene_anchors', 'scene_blend', 'scene_events', 'scene_glb', 'storyboard'].sort());
    const sheet = (await listArtifacts(t.pool, r.videoId)).find((a) => a.kind === 'preview_sheet')!;
    expect((await getBlob(t.pool, sheet.blobSha!))!.mime).toBe('image/png');
    expect(specs[0]!.role).toBe('builder');
    expect(specs[0]!.tools.map((x) => x.name)).toEqual(expect.arrayContaining(['build_scene', 'render_preview_stills', 'write_spec']));
    expect(await ex.reuse!(ctx, hash)).toBe(true);
  });

  it('a failing trusted build goes back to the same Claude session as a fix request, then the build passes', async () => {
    const { deps, specs } = setup();
    const { ctx } = await buildContext(deps, 'Bozuk sahne kalem');
    const out = await buildExecutor(deps).run(ctx, 'h');
    expect(out).toMatchObject({ status: 'done' });
    expect(specs).toHaveLength(2);
    expect(specs[1]!.resume).toBe(true);
    expect(specs[1]!.claudeSessionId).toBe(specs[0]!.claudeSessionId);
    expect(specs[1]!.prompt).toContain("build_scene: product.py satır 7: NameError: name 'gövde' is not defined");
  });

  it('a style that is not the channel style is a fix request; a missing sandbox fails without asking the agent', async () => {
    await setChannelStyle(t.pool, 'atolye');
    const wrong: Script = (role, ctx, attempt) => ({ ...fakePipelineScript(role, ctx, attempt, { styleId: 'gece_mavisi' }) });
    const a = setup({ script: wrong });
    const { ctx } = await buildContext(a.deps);
    const out = await buildExecutor(a.deps).run(ctx, 'h');
    expect(out).toMatchObject({ status: 'failed', retry: false });
    expect((out as { error: string }).error).toContain('style_id kanal kimliği "atolye" olmalı');
    expect(a.specs).toHaveLength(3); // 1 + 2 fixes (spec §14)
    await t.pool.query("DELETE FROM settings WHERE key = 'channel.style'");
    const b = setup({ capability: { ok: false, reason: 'bubblewrap çalışmıyor (EPERM)' } });
    const c = await buildContext(b.deps);
    expect(await buildExecutor(b.deps).run(c.ctx, 'h')).toEqual({ status: 'failed', error: 'render kullanılamıyor: bubblewrap çalışmıyor (EPERM)', retry: false });
    expect(b.specs).toHaveLength(0);
  });

  it('after a worker restart (attempt 2) the build resumes its own Claude session (plan B15)', async () => {
    const { deps, specs } = setup();
    const { ctx } = await buildContext(deps, 'Tükenmez kalem', 2);
    const prior = crypto.randomUUID();
    await insertSession(t.pool, { id: prior, kind: 'pipeline', role: 'builder', model: 'opus', effort: 'high', claudeSessionId: prior, runId: ctx.runId, stepId: ctx.stepId, runDir: ctx.runDir, status: 'failed' });
    expect(await buildExecutor(deps).run(ctx, 'h')).toMatchObject({ status: 'done' });
    expect(specs[0]).toMatchObject({ resume: true, claudeSessionId: prior });
    expect(specs[0]!.prompt).toContain('Önceki oturum kesildi');
  });

  it('fences the storyboard and research JSON as data before the rules (spec §6.6, M4a minor 6)', () => {
    const p = buildPrompt('Kalem', 'gece_mavisi', fx('storyboard-kalem'), fx('research-kalem'));
    expect(p.indexOf('<<<VERI')).toBeGreaterThan(0);
    expect(p.lastIndexOf('VERI>>>')).toBeLessThan(p.indexOf('Kurallar:'));
    expect(p).toContain('style_id "gece_mavisi"');
    const s = storyboardPrompt('Kalem', 'silent', fx('research-kalem'));
    expect(s.lastIndexOf('VERI>>>')).toBeLessThan(s.indexOf('Kurallar:'));
  });
});

describe('research gate', () => {
  it('a product that needs a CC0 asset stops at research with the M5 reason (plan B5)', async () => {
    const { deps } = setup({ script: () => ({ fixture: 'websearch', structured: { ...fx('research-kalem'), difficulty: 'needs_asset', difficulty_reason_tr: 'Motor bloğu prosedürel olarak inandırıcı kurulamıyor.' } }) });
    const { ctx } = await buildContext(deps);
    const out = await researchExecutor(deps).run({ ...ctx, key: 'research' }, 'h');
    expect(out).toEqual({ status: 'needs_human', reason: "Hazır 3D varlık gerekiyor; varlık defteri ve lisans kapısı M5'te. Motor bloğu prosedürel olarak inandırıcı kurulamıyor." });
  });
});

describe('pipeline end to end with build (fake Claude and fake render)', () => {
  it('produce → research → storyboard → build through the orchestrator; the video waits for the draft (K13)', async () => {
    const { deps } = setup();
    const o = new Orchestrator({ pool: t.pool, dataDir: deps.dataDir, executors: pipelineExecutors(deps), tickMs: 20, timeTickMs: 50 });
    o.start();
    cleanups.push(() => o.stop());
    const r = await createProduceRun(t.pool, { productName: 'Tükenmez kalem', audioMode: 'silent', plan: producePlan('silent') });
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.status).toBe('done'), { timeout: 15_000 });
    const run = (await getRunView(t.pool, r.runId))!;
    expect(run.steps.map((s) => s.key)).toEqual(['research', 'storyboard', 'build']);
    expect(run.steps[2]!.note).toBe('5 parça · 7.526 üçgen · 2 uyarı · kanal kimliği geçici');
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: 'Sahne kurulumu hazır. Taslak render bu sürümde henüz yok.' });
    expect(run.progress).toBe(99);
  });
});
