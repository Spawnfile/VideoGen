import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlanStep, Resource, StepKey } from '@videogen/shared';
import { claimJob, createProduceRun, enqueueJob, getRunView, getVideoView, listRunSteps, updateRun, updateStep } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { Orchestrator, PIPELINE_INCOMPLETE_NOTE, type OrchestratorDeps } from '../src/pipeline/orchestrator.ts';
import type { Probe } from '../src/pipeline/resources.ts';
import type { StepContext, StepExecutor, StepOutcome } from '../src/pipeline/types.ts';
import { ResourceLocks } from '../src/render/locks.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const orchs: Orchestrator[] = [];
afterEach(async () => { for (const o of orchs.splice(0)) o.stop(); await t.pool.query("UPDATE jobs SET status = 'done' WHERE status IN ('queued', 'leased')"); });

const LOOP: PlanStep[] = [{ key: 'build', weight: 66.67 }, { key: 'draft_render', weight: 14.81 }, { key: 'draft_review', weight: 18.52 }];
const OK_PROBE: Probe = { snapshot: async () => ({ memAvailableMb: 8000, swapUsedPct: 0, diskFreeMb: 50_000, vramFreeMb: 6000, ollamaModels: [] }) };

function exec(key: StepKey, o: { resource?: Resource; run?: (ctx: StepContext) => Promise<StepOutcome> } = {}): StepExecutor & { rounds: number[] } {
  const e = {
    key, resource: o.resource ?? 'claude', rounds: [] as number[],
    inputHash: async (ctx: StepContext) => `h-${key}-${ctx.round}`,
    run: async (ctx: StepContext) => { e.rounds.push(ctx.round); return o.run ? o.run(ctx) : { status: 'done' as const }; },
  };
  return e;
}
function orch(executors: OrchestratorDeps['executors'], over: Partial<OrchestratorDeps> = {}) {
  const o = new Orchestrator({ pool: t.pool, dataDir: mkdtempSync(join(tmpdir(), 'vg-orch-draft-')), executors, tickMs: 20, retryDelayMs: 10, waitDelayMs: 40, timeTickMs: 30, ...over });
  orchs.push(o);
  o.start();
  return o;
}
const produce = (name: string, plan: PlanStep[] = LOOP) => createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
const runStatus = async (id: string) => (await getRunView(t.pool, id))!.status;
const actions = async (runId: string) => (await t.pool.query("SELECT action FROM audit_log WHERE run_id = $1 AND actor_type <> 'user' ORDER BY seq", [runId])).rows.map((r) => r.action as string);
const progressSeries = async (runId: string) =>
  (await t.pool.query("SELECT payload FROM ui_events WHERE topic = 'runs' AND type = 'run.updated' AND payload->>'id' = $1 ORDER BY id", [runId])).rows.map((r) => r.payload.progress as number);

describe('Orchestrator: draft loop, GPU door, usage gate', () => {
  it('a draft review that sends the run back reruns build…draft_review in round 1 with fresh attempts; progress stays monotone', async () => {
    const build = exec('build', { run: async (ctx) => { ctx.progress(60, 'agent'); return { status: 'done' }; } });
    const render = exec('draft_render', { resource: 'gpu' });
    const review = exec('draft_review', { run: async (ctx) => (ctx.round === 0 ? { status: 'rewind', to: 'build', reason: '1 bulgu düzeltilecek: Mekanizma çekimi' } : { status: 'done', note: 'geçti' }) });
    const o = orch({ build, draft_render: render, draft_review: review }, { locks: new ResourceLocks(), probe: OK_PROBE });
    const r = await produce('Kalem döngü');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'), { timeout: 10_000 });
    expect([build.rounds, render.rounds, review.rounds]).toEqual([[0, 1], [0, 1], [0, 1]]);
    const run = (await getRunView(t.pool, r.runId))!;
    expect(run.steps.map((s) => [s.key, s.status, s.round, s.attempt])).toEqual([['build', 'done', 1, 1], ['draft_render', 'done', 1, 1], ['draft_review', 'done', 1, 1]]);
    expect((await actions(r.runId)).filter((a) => a === 'step.rewind')).toHaveLength(1);
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: PIPELINE_INCOMPLETE_NOTE('draft_review') });
    expect(PIPELINE_INCOMPLETE_NOTE('draft_review')).toBe('Taslak hazır ve incelendi. Final render bu sürümde henüz yok.');
    const series = await progressSeries(r.runId);
    expect(series).toEqual([...series].sort((a, b) => a - b));
  });

  it('past two returns the run stops for a human with the review reason (no fourth build)', async () => {
    const build = exec('build');
    const review = exec('draft_review', { run: async () => ({ status: 'rewind', to: 'build', reason: '2 taslak turundan sonra açık bulgu: Mekanizma çekimi' }) });
    const o = orch({ build, draft_render: exec('draft_render'), draft_review: review });
    const r = await produce('Kalem inatçı döngü');
    await o.startRun(r.runId);
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('needs_human'), { timeout: 10_000 });
    expect(build.rounds).toEqual([0, 1, 2]);
    expect(await getVideoView(t.pool, r.videoId)).toMatchObject({ status: 'needs_human', statusNote: '2 taslak turundan sonra açık bulgu: Mekanizma çekimi' });
  });

  it('a GPU step waits for the shared lock with its queue position, runs when it is free, and a cancel while waiting leaves no waiter', async () => {
    const locks = new ResourceLocks();
    const release = await locks.acquire('gpu', 'mcp-preview');
    const render = exec('draft_render', { resource: 'gpu' });
    const o = orch({ draft_render: render }, { locks, probe: OK_PROBE });
    const plan: PlanStep[] = [{ key: 'draft_render', weight: 100 }];
    const a = await produce('Kalem kilit', plan);
    await o.startRun(a.runId);
    await vi.waitFor(async () => expect((await listRunSteps(t.pool, a.runId))[0]).toMatchObject({ status: 'waiting_gpu', note: 'GPU sırası bekleniyor (sırada 1)' }));
    expect(render.rounds).toEqual([]);
    release();
    await vi.waitFor(async () => expect(await runStatus(a.runId)).toBe('done'));
    expect(render.rounds).toEqual([0]);

    const again = await locks.acquire('gpu', 'mcp-preview');
    const b = await produce('Kalem kilit iptal', plan);
    await o.startRun(b.runId);
    await vi.waitFor(async () => expect(locks.waiting('gpu')).toBe(1));
    await o.cancel(b.runId);
    await vi.waitFor(() => expect(locks.waiting('gpu')).toBe(0));
    expect(locks.holder('gpu')).toBe('mcp-preview');
    again();
    expect(locks.busy('gpu')).toBe(false);
    expect(render.rounds).toEqual([0]);
  });

  it('usage gate: a run created while pipelines are blocked stays queued with the reason (audited once) and starts when the gate opens', async () => {
    let open = false;
    const gate = { allowsNewPipeline: () => open, resumeAt: () => '2026-10-06T14:00:00.000Z' };
    const research = exec('research');
    const o = orch({ research }, { gate });
    const r = await produce('Kalem kapı', [{ key: 'research', weight: 100 }]);
    await o.startRun(r.runId);
    await o.startRun(r.runId);
    expect(await runStatus(r.runId)).toBe('queued');
    expect((await getVideoView(t.pool, r.videoId))!.statusNote).toMatch(/^Kullanım sınırı yakın: üretim sınır açılınca kendiliğinden başlar \(açılış \d\d:\d\d\)\.$/);
    expect((await actions(r.runId)).filter((a) => a === 'run.deferred_limit')).toHaveLength(1);
    open = true;
    await o.startQueued();
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
    expect(research.rounds).toEqual([0]);
  });

  it('startRun is a conditional claim: concurrent starts begin the run once, and a cancel that lands first is never undone (final review M5)', async () => {
    const research = exec('research', { run: async () => { await new Promise((r) => setTimeout(r, 200)); return { status: 'done' }; } });
    const o = orch({ research });
    const r = await produce('Kalem çift başlatma', [{ key: 'research', weight: 100 }]);
    await Promise.all([o.startRun(r.runId), o.startRun(r.runId), o.startRun(r.runId), o.startQueued()]);
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
    expect((await actions(r.runId)).filter((a) => a === 'run.started')).toHaveLength(1);
    expect(research.rounds).toEqual([0]);
    // A cancel that lands between the queued check and the claim: the gate is consulted in that window.
    const c = await produce('Kalem iptal arada', [{ key: 'research', weight: 100 }]);
    let cancelled: Promise<unknown> = Promise.resolve();
    const racing = orch({ research }, { gate: { allowsNewPipeline: () => { cancelled = updateRun(t.pool, c.runId, { status: 'cancelled' }); return true; }, resumeAt: () => null } });
    await racing.startRun(c.runId);
    await cancelled;
    expect(await runStatus(c.runId)).toBe('cancelled');
  });

  it('on restart a lease left on a step that is no longer active is closed, not run again', async () => {
    const research = exec('research');
    const r = await produce('Kalem bayat kira', [{ key: 'research', weight: 100 }]);
    await updateRun(t.pool, r.runId, { status: 'running' });
    const step = (await listRunSteps(t.pool, r.runId))[0]!;
    await enqueueJob(t.pool, { stepId: step.id, resource: 'claude' });
    const job = (await claimJob(t.pool, { owner: 'old-worker', resources: ['claude'], leaseMs: 60_000 }))!;
    await updateStep(t.pool, step.id, { status: 'done', progress: 100 });
    const o = orch({ research });
    await o.recover();
    await vi.waitFor(async () => expect(await runStatus(r.runId)).toBe('done'));
    expect((await t.pool.query('SELECT status FROM jobs WHERE id = $1', [job.id])).rows[0].status).toBe('cancelled');
    expect(research.rounds).toEqual([]);
  });
});
