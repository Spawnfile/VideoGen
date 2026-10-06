import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Resource, StepKey } from '@videogen/shared';
import { claimJob, createProduceRun, enqueueJob, getRunView, getVideoView, listRunSteps, updateRun, updateStep } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { Orchestrator, type OrchestratorDeps } from '../src/pipeline/orchestrator.ts';
import type { Probe, ResourceSnapshot } from '../src/pipeline/resources.ts';
import type { StepContext, StepExecutor, StepOutcome } from '../src/pipeline/types.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const orchs: Orchestrator[] = [];
afterEach(async () => { for (const o of orchs.splice(0)) o.stop(); await t.pool.query("UPDATE jobs SET status = 'done' WHERE status IN ('queued', 'leased')"); });

const plan = [{ key: 'research' as const, weight: 53.33 }, { key: 'storyboard' as const, weight: 46.67 }];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function exec(key: StepKey, o: { resource?: Resource; run?: (ctx: StepContext) => Promise<StepOutcome>; reuse?: boolean } = {}): StepExecutor & { calls: number } {
  const e = {
    key, resource: o.resource ?? 'claude', calls: 0,
    inputHash: async () => `h-${key}`,
    reuse: async () => o.reuse ?? false,
    run: async (ctx: StepContext) => { e.calls++; return o.run ? o.run(ctx) : { status: 'done' as const }; },
  };
  return e;
}
function orch(executors: OrchestratorDeps['executors'], over: Partial<OrchestratorDeps> = {}) {
  const o = new Orchestrator({
    pool: t.pool, dataDir: mkdtempSync(join(tmpdir(), 'vg-orch-')), executors, tickMs: 20, retryDelayMs: 10, waitDelayMs: 40, timeTickMs: 30, ...over,
  });
  orchs.push(o);
  o.start();
  return o;
}
async function produce(name: string) { return createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan }); }
const runStatus = async (id: string) => (await getRunView(t.pool, id))!.status;
const actions = async (runId: string) => (await t.pool.query("SELECT action FROM audit_log WHERE run_id = $1 AND actor_type <> 'user' ORDER BY seq", [runId])).rows.map((r) => r.action);
const progressSeries = async (runId: string) =>
  (await t.pool.query("SELECT payload FROM ui_events WHERE topic = 'runs' AND type = 'run.updated' AND payload->>'id' = $1 ORDER BY id", [runId])).rows.map((r) => r.payload.progress as number);

describe('Orchestrator', () => {
  it('runs the plan in order and stops honestly before the steps this build lacks', async () => {
    await t.pool.query("INSERT INTO usage_snapshots (source, five_hour_util, five_hour_resets_at, seven_day_util) VALUES ('get_usage', 0.3, '2026-10-06T15:00:00Z', 0.2)");
    const research = exec('research', { run: async (ctx) => { ctx.progress(40, 'agent'); await sleep(30); ctx.progress(80, 'agent'); return { status: 'done', note: 'tükenmez kalem' }; } });
    const storyboard = exec('storyboard');
    const o = orch({ research, storyboard });
    const r = await produce('Kalem A');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
    const run = (await getRunView(t.pool, r.runId))!;
    expect(run.steps.map((s) => [s.key, s.status, s.progress, s.attempt])).toEqual([['research', 'done', 100, 1], ['storyboard', 'done', 100, 1]]);
    expect(run.steps[0]!.note).toBe('tükenmez kalem');
    expect(run).toMatchObject({ progress: 99, etaS: null });
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: 'Storyboard hazır. Sahne kurulumu ve taslak render bu sürümde henüz yok.' });
    const series = await progressSeries(r.runId);
    expect(series.length).toBeGreaterThan(3);
    expect(series).toEqual([...series].sort((a, b) => a - b));
    expect(await actions(r.runId)).toEqual(['run.started', 'step.started', 'step.done', 'step.started', 'step.done', 'run.done']);
    const marks = await t.pool.query('SELECT usage_start, usage_end FROM runs WHERE id = $1', [r.runId]);
    expect(marks.rows[0].usage_start).toMatchObject({ fiveHour: 0.3 });
    expect(marks.rows[0].usage_end).toMatchObject({ fiveHour: 0.3 });
  });

  it('a needs_human step skips the rest and shows the reason', async () => {
    const storyboard = exec('storyboard');
    const o = orch({ research: exec('research', { run: async () => ({ status: 'needs_human', reason: 'Prosedürel olarak modellenemiyor.' }) }), storyboard });
    const r = await produce('Yonga');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('needs_human'));
    expect((await getRunView(t.pool, r.runId))!.steps.map((s) => s.status)).toEqual(['done', 'skipped']);
    expect(storyboard.calls).toBe(0);
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: 'Prosedürel olarak modellenemiyor.' });
    // Gate-skipped steps earn nothing: the header must not read "%99" when only research was done.
    expect((await getRunView(t.pool, r.runId))!.progress).toBe(53.3);
  });

  it('retries a failed step once, then fails the run with the step name', async () => {
    let n = 0;
    const flaky = exec('research', { run: async () => (++n === 1 ? { status: 'failed', error: 'geçici' } : { status: 'done' }) });
    const o = orch({ research: flaky, storyboard: exec('storyboard') });
    const r1 = await produce('Kalem B');
    await o.startRun(r1.runId);
    await vi.waitFor(async () => expect(await runStatus(r1.runId)).toBe('done'));
    expect((await getRunView(t.pool, r1.runId))!.steps[0]).toMatchObject({ status: 'done', attempt: 2 });
    expect(await actions(r1.runId)).toContain('step.retry');
    o.stop(); // both orchestrators share the queue: only one may claim

    const o2 = orch({ research: exec('research', { run: async () => ({ status: 'failed', error: 'boom' }) }), storyboard: exec('storyboard') });
    const r2 = await produce('Kalem C');
    await o2.startRun(r2.runId);
    await vi.waitFor(async () => expect(await runStatus(r2.runId)).toBe('failed'));
    expect((await getRunView(t.pool, r2.runId))!.steps[0]).toMatchObject({ status: 'failed', attempt: 2, error: 'boom' });
    expect(await getVideoView(t.pool, r2.videoId)).toMatchObject({ status: 'failed', statusNote: 'Araştırma: boom' });
  });

  it('cancel aborts the running executor, cancels jobs and steps, and nothing advances afterwards', async () => {
    const seen: string[] = [];
    const research = exec('research', {
      run: (ctx) => new Promise((resolve) => {
        ctx.progress(25, 'agent');
        ctx.signal.addEventListener('abort', () => { seen.push('aborted'); setTimeout(() => resolve({ status: 'done' }), 20); });
      }),
    });
    const storyboard = exec('storyboard');
    const o = orch({ research, storyboard });
    const r = await produce('Kalem D');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.steps[0]!.progress).toBe(25));
    // ctx.progress is fire-and-forget: wait until the run's own progress has been raised too (≈ 13.3), then read it.
    await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.progress).toBeGreaterThan(0));
    const before = (await getRunView(t.pool, r.runId))!.progress;
    expect(await o.cancel(r.runId)).toBe(true);
    await vi.waitFor(() => expect(seen).toEqual(['aborted']));
    await sleep(100);
    const run = (await getRunView(t.pool, r.runId))!;
    expect(run.status).toBe('cancelled');
    expect(run.steps.map((s) => s.status)).toEqual(['cancelled', 'cancelled']);
    expect(run.progress).toBe(before);
    expect(storyboard.calls).toBe(0);
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'cancelled', statusNote: 'Kullanıcı durdurdu' });
    const { rows } = await t.pool.query("SELECT count(*)::int AS n FROM jobs j JOIN steps s ON s.id = j.step_id WHERE s.run_id = $1 AND j.status IN ('queued', 'leased')", [r.runId]);
    expect(rows[0].n).toBe(0);
    expect(await o.cancel(r.runId)).toBe(false);
  });

  it('recovers at startup: requeues a dead worker\'s lease, starts queued runs, and reuses a valid output', async () => {
    const r = await produce('Kalem E');
    await updateRun(t.pool, r.runId, { status: 'running', startedAt: new Date() });
    const [research] = await listRunSteps(t.pool, r.runId);
    await updateStep(t.pool, research!.id, { status: 'running', attempt: 1 });
    await enqueueJob(t.pool, { stepId: research!.id, resource: 'claude' });
    await claimJob(t.pool, { owner: 'old-worker', resources: ['claude'], leaseMs: 120_000 });
    const queued = await produce('Kalem F');
    const reused = exec('research', { reuse: true });
    const o = orch({ research: reused, storyboard: exec('storyboard') });
    await o.recover();
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
    await vi.waitFor(async () => expect(await runStatus(queued.runId)).toBe('done'));
    expect(reused.calls).toBe(0);
    expect((await getRunView(t.pool, r.runId))!.steps[0]).toMatchObject({ status: 'done', note: 'önceki geçerli çıktı kullanıldı', attempt: 2 });
    expect(await actions(r.runId)).toContain('job.recovered');
  });

  it('holds a GPU step in waiting_gpu with the reason until the pre-check passes', async () => {
    let snap: ResourceSnapshot = { memAvailableMb: 8000, swapUsedPct: 100, diskFreeMb: 50_000, vramFreeMb: 5000, ollamaModels: [] };
    const probe: Probe = { snapshot: async () => snap };
    const o = orch({ research: exec('research'), storyboard: exec('storyboard', { resource: 'gpu' }) }, { probe });
    const r = await produce('Kalem G');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.steps[1]).toMatchObject({ status: 'waiting_gpu', note: 'swap %100 ≥ %90' }));
    snap = { ...snap, swapUsedPct: 10 };
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
    expect(await actions(r.runId)).toContain('step.waiting');
  });

  it('a cancel that lands while a step is being launched (pre-check pending) never starts the step', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const snapshot: ResourceSnapshot = { memAvailableMb: 8000, swapUsedPct: 10, diskFreeMb: 50_000, vramFreeMb: 5000, ollamaModels: [] };
    let asked = 0;
    const probe: Probe = { snapshot: async () => { asked++; await gate; return snapshot; } };
    const gpu = exec('research', { resource: 'gpu' });
    const o = orch({ research: gpu, storyboard: exec('storyboard') }, { probe });
    const r = await produce('Kalem I');
    await o.startRun(r.runId);
    await vi.waitFor(() => expect(asked).toBe(1));
    expect(await o.cancel(r.runId)).toBe(true);
    release();
    await sleep(200);
    expect(gpu.calls).toBe(0);
    expect((await getRunView(t.pool, r.runId))!.steps.map((s) => s.status)).toEqual(['cancelled', 'cancelled']);
    const { rows } = await t.pool.query("SELECT count(*)::int AS n FROM jobs j JOIN steps s ON s.id = j.step_id WHERE s.run_id = $1 AND j.status IN ('queued', 'leased')", [r.runId]);
    expect(rows[0].n).toBe(0);
  });

  it('fills silence with the time curve; an agent report takes over and progress never goes back', async () => {
    let release = () => {};
    let ctxRef: StepContext | null = null;
    const research = exec('research', { run: (ctx) => { ctxRef = ctx; return new Promise((res) => { release = () => res({ status: 'done' }); }); } });
    const o = orch({ research, storyboard: exec('storyboard') }, { expectedS: { research: 1 } });
    const r = await produce('Kalem H');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.steps[0]).toMatchObject({ progressSource: 'time' }));
    await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.steps[0]!.progress).toBeGreaterThan(5));
    ctxRef!.progress(70, 'agent');
    await vi.waitFor(async () => expect((await getRunView(t.pool, r.runId))!.steps[0]).toMatchObject({ progress: 70, progressSource: 'agent' }));
    ctxRef!.progress(50, 'agent');
    await sleep(120);
    expect((await getRunView(t.pool, r.runId))!.steps[0]).toMatchObject({ progress: 70, progressSource: 'agent' });
    release();
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
  });
});
