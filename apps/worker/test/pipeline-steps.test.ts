import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ProductResearch } from '@videogen/shared';
import { createProduceRun, getRunView, getSession, getVideoView, insertArtifact, latestArtifact, listRunSteps, listSessions } from '@videogen/db';
import { FakeClaudeDriver, loadFixture, type ClaudeDriver, type FakeScript, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager } from '../src/agents/manager.ts';
import { UsageGuard } from '../src/agents/usage-guard.ts';
import { fakePipelineScript } from '../src/pipeline/fake-scripts.ts';
import { Orchestrator } from '../src/pipeline/orchestrator.ts';
import { pipelineExecutors, researchExecutor, storyboardExecutor, type PipelineRole, type StepDeps } from '../src/pipeline/steps.ts';
import type { StepContext } from '../src/pipeline/types.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const cleanups: (() => unknown)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const fx = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${name}.json`), 'utf8'));
const plan = [{ key: 'research' as const, weight: 53.33 }, { key: 'storyboard' as const, weight: 46.67 }];

function setup(o: { script?: (role: PipelineRole, ctx: StepContext, attempt: number) => FakeScript; gate?: UsageGuard } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-steps-'));
  const specs: SessionSpec[] = [];
  const fake = new FakeClaudeDriver({ speed: 0 });
  const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
  const manager = new SessionManager({
    pool: t.pool, dataDir, driver, pluginDir: resolve(import.meta.dirname, '../../../claude-plugin'), gate: o.gate, sampleEveryMs: 50, pumpRetryMs: 30,
    memAvailableMb: () => 8000, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 },
  });
  cleanups.push(() => manager.stop());
  const deps: StepDeps = { pool: t.pool, dataDir, manager, fakeScript: o.script ?? fakePipelineScript };
  return { dataDir, specs, manager, deps };
}

async function context(deps: StepDeps, name = 'Tükenmez kalem', audioMode: 'vo' | 'silent' = 'silent') {
  const r = await createProduceRun(t.pool, { productName: name, audioMode, plan });
  const steps = await listRunSteps(t.pool, r.runId);
  const calls = { progress: [] as number[], status: [] as string[], sessions: [] as string[] };
  const abort = new AbortController();
  const ctx = (i: 0 | 1): StepContext => ({
    runId: r.runId, stepId: steps[i]!.id, key: steps[i]!.key, attempt: 1, round: 0, videoId: r.videoId, productId: r.productId, productName: name.trim(), audioMode,
    versionId: r.versionId, runDir: join(deps.dataDir, 'runs', r.runId), signal: abort.signal,
    progress: (p) => { calls.progress.push(p); }, status: (s) => { calls.status.push(s); }, session: (id) => { calls.sessions.push(id); },
  });
  return { r, ctx, calls, abort };
}

describe('research step', () => {
  it('stores a validated, versioned research artifact and links its session', async () => {
    const { deps, specs } = setup();
    const { r, ctx, calls } = await context(deps);
    const ex = researchExecutor(deps);
    const c = ctx(0);
    const hash = await ex.inputHash(c);
    expect(await ex.run(c, hash)).toEqual({ status: 'done', note: 'Basmalı, tek kullanımlık plastik gövdeli tükenmez kalem' });
    expect(specs[0]!.outputFormat!.schema.type).toBe('object');
    expect(specs[0]!.prompt).toContain('Ürün: "Tükenmez kalem"');
    expect(existsSync(join(c.runDir, 'spec', 'research', 'v0001.json'))).toBe(true);
    const art = (await latestArtifact(t.pool, r.runId, 'research'))!;
    expect(art).toMatchObject({ stepId: c.stepId, versionId: r.versionId, inputHash: hash });
    expect((art.content as ProductResearch).parts).toHaveLength(5);
    expect((await t.pool.query('SELECT 1 FROM blobs WHERE sha256 = $1', [art.blobSha])).rows).toHaveLength(1);
    expect((await t.pool.query('SELECT difficulty FROM products WHERE id = $1', [r.productId])).rows[0].difficulty).toBe('procedural');
    expect(calls.sessions).toHaveLength(1);
    expect(await getSession(t.pool, calls.sessions[0]!)).toMatchObject({ runId: r.runId });
    expect((await t.pool.query('SELECT step_id FROM agent_sessions WHERE id = $1', [calls.sessions[0]])).rows[0].step_id).toBe(c.stepId);
    expect(await ex.reuse!(c, hash)).toBe(true);
    expect(await ex.reuse!(c, 'other')).toBe(false);
  });

  it('stops a too-hard product with the reason (difficulty gate)', async () => {
    const { deps } = setup();
    const { ctx } = await context(deps, 'İmkansız telefon işlemcisi');
    const c = ctx(0);
    expect(await researchExecutor(deps).run(c, await researchExecutor(deps).inputHash(c))).toEqual({
      status: 'needs_human', reason: fx('research-too-hard').difficulty_reason_tr,
    });
  });

  it('asks the same Claude session to fix invalid output at most twice', async () => {
    const bad = { ...fx('research-kalem'), claims: [] };
    const { deps, specs } = setup({ script: (_role, _ctx, attempt) => ({ fixture: 'basic', structured: attempt === 0 ? bad : fx('research-kalem') }) });
    const { ctx } = await context(deps, 'Kalem fix');
    const c = ctx(0);
    expect(await researchExecutor(deps).run(c, 'h')).toMatchObject({ status: 'done' });
    expect(specs).toHaveLength(2);
    expect(specs[1]).toMatchObject({ resume: true, claudeSessionId: specs[0]!.claudeSessionId });
    expect(specs[1]!.prompt).toContain('claims: en az 3 kaynaklı iddia gerekli');

    const never = setup({ script: () => ({ fixture: 'basic', structured: bad }) });
    const n = await context(never.deps, 'Kalem never');
    const out = await researchExecutor(never.deps).run(n.ctx(0), 'h');
    expect(out).toMatchObject({ status: 'failed', retry: false });
    expect((out as { error: string }).error).toMatch(/^şema hatası: claims: en az 3 kaynaklı iddia gerekli/);
    expect(never.specs).toHaveLength(3);
  });

  it('waits out a rejected usage limit as waiting_limit and resumes the same session itself', async () => {
    const gate = new UsageGuard({ pool: t.pool, marginMs: 10 });
    cleanups.push(() => gate.stop());
    const resetsAt = Math.ceil(Date.now() / 1000) + 1;
    const rejected = { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt, rateLimitType: 'five_hour', unifiedWindows: { five_hour: { utilization: 1, resetsAt } } } };
    const idx = loadFixture('basic').findIndex((l) => l.m.type === 'rate_limit_event');
    const { deps, specs } = setup({
      gate,
      script: (_r, _c, attempt) => (attempt === 0
        ? { fixture: 'basic', inject: [{ afterIndex: idx, m: rejected }], failAfter: { index: idx, error: 'Claude Code returned an error result: rate limited' } }
        : { fixture: 'basic', structured: fx('research-kalem') }),
    });
    const { r, ctx, calls } = await context(deps, 'Kalem limit');
    const c = ctx(0);
    expect(await researchExecutor(deps).run(c, 'h')).toMatchObject({ status: 'done' });
    expect(calls.status).toContain('waiting_limit');
    expect(specs).toHaveLength(2);
    expect(specs[1]).toMatchObject({ resume: true, claudeSessionId: specs[0]!.claudeSessionId });
    const sessions = (await listSessions(t.pool, { kind: 'pipeline', limit: 100 })).filter((s) => s.runId === r.runId);
    expect(sessions.map((s) => `${s.status}:${s.terminalReason}`).sort()).toEqual(['done:completed', 'failed:rate_limited']);
  });

  it('cancel stops the agent session and reports cancelled', async () => {
    const { deps } = setup({ script: () => ({ fixture: 'basic', stall: { afterIndex: 2, ms: 60_000 } }) });
    const { ctx, calls, abort } = await context(deps, 'Kalem cancel');
    const c = ctx(0);
    const p = researchExecutor(deps).run(c, 'h');
    await vi.waitFor(() => expect(calls.sessions).toHaveLength(1));
    abort.abort();
    expect(await p).toEqual({ status: 'cancelled' });
    expect((await getSession(t.pool, calls.sessions[0]!))!.status).toBe('cancelled');
  });
});

describe('storyboard step', () => {
  it('needs the research, cross-checks ids and the audio mode, and summarizes the board', async () => {
    const wrong = { ...fx('storyboard-kalem'), beats: fx('storyboard-kalem').beats.map((b: { parts: string[] }, i: number) => (i === 1 ? { ...b, parts: [...b.parts, 'kapak'] } : b)) };
    const { deps, specs } = setup({ script: (_r, _c, attempt) => ({ fixture: 'basic', structured: attempt === 0 ? wrong : fx('storyboard-kalem') }) });
    const { r, ctx } = await context(deps, 'Kalem board');
    const c = ctx(1);
    expect(await storyboardExecutor(deps).run(c, 'h')).toMatchObject({ status: 'failed', retry: false, error: 'araştırma çıktısı yok' });
    await insertArtifact(t.pool, { runId: r.runId, kind: 'research', content: fx('research-kalem') });
    expect(await storyboardExecutor(deps).run(c, 'h')).toEqual({ status: 'done', note: '7 vuruş · 45 sn · kanca: Şaşırtıcı sayı' });
    expect(specs[1]!.prompt).toContain('beats.1.parts: araştırmada olmayan parça: kapak');
    expect(specs[0]!.prompt).toContain('"id":"bilye-capi"');
    expect((await latestArtifact(t.pool, r.runId, 'storyboard'))!.content).toMatchObject({ duration_s: 45 });

    const vo = setup({ script: () => ({ fixture: 'basic', structured: fx('storyboard-kalem') }) });
    const v = await context(vo.deps, 'Kalem vo', 'vo');
    await insertArtifact(t.pool, { runId: v.r.runId, kind: 'research', content: fx('research-kalem') });
    const out = await storyboardExecutor(vo.deps).run(v.ctx(1), 'h');
    expect((out as { error: string }).error).toContain('audio_mode vo olmalı');
  });
});

describe('pipeline end to end (fake driver)', () => {
  it('produce → research → storyboard through the orchestrator', async () => {
    const { deps } = setup();
    const o = new Orchestrator({ pool: t.pool, dataDir: deps.dataDir, executors: pipelineExecutors(deps), tickMs: 20, timeTickMs: 50 });
    o.start();
    cleanups.push(() => o.stop());
    const r = await createProduceRun(t.pool, { productName: 'Tükenmez kalem', audioMode: 'vo', plan });
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.status).toBe('done'), { timeout: 10_000 });
    const run = (await getRunView(t.pool, r.runId))!;
    expect(run.steps.map((s) => [s.status, !!s.sessionId])).toEqual([['done', true], ['done', true]]);
    expect(run.steps[1]!.note).toBe('7 vuruş · 45 sn · kanca: Şaşırtıcı sayı');
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: 'Storyboard hazır. Sahne kurulumu ve taslak render bu sürümde henüz yok.', difficulty: 'procedural' });
    expect(((await latestArtifact(t.pool, r.runId, 'storyboard'))!.content as { audio_mode: string }).audio_mode).toBe('vo');
  });
});
