import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProduceRun, findArtifact, getArtifact, getRunView, getVideoView, insertArtifact, insertSession, latestArtifact, latestUsageMark,
  listArtifacts, listRunSteps, listVideoViews, stepHistorySeconds, updateRun, updateSession, updateStep,
} from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const plan = [{ key: 'research' as const, weight: 53.33 }, { key: 'storyboard' as const, weight: 46.67 }];
const produce = (name = 'Tükenmez Kalem') => createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });

describe('createProduceRun', () => {
  it('creates product, video, version, run and pending steps in one transaction and audits the request', async () => {
    const a = await produce();
    const b = await produce('  tükenmez   kalem');
    expect(b.productId).toBe(a.productId);
    expect(b.videoId).not.toBe(a.videoId);
    const v = await getVideoView(t.pool, a.videoId);
    expect(v).toMatchObject({ productName: 'Tükenmez Kalem', audioMode: 'silent', status: 'queued', latestRunId: a.runId, usage: { sessions: 0, tokens: 0 } });
    const run = await getRunView(t.pool, a.runId);
    expect(run).toMatchObject({ status: 'queued', kind: 'produce', progress: 0 });
    expect(run!.steps.map((s) => [s.key, s.ordinal, s.status, s.weight])).toEqual([['research', 0, 'pending', 53.33], ['storyboard', 1, 'pending', 46.67]]);
    const { rows } = await t.pool.query("SELECT action, subject_id FROM audit_log WHERE action = 'video.produce_requested' AND subject_id = $1", [a.videoId]);
    expect(rows).toHaveLength(1);
    const ver = await t.pool.query('SELECT round, reason FROM versions WHERE id = $1 AND video_id = $2', [a.versionId, a.videoId]);
    expect(ver.rows[0]).toEqual({ round: 0, reason: 'produce' });
  });

  it('allows one active run per video (enforced by the database)', async () => {
    const a = await produce('Zımba');
    const dup = t.pool.query("INSERT INTO runs (id, video_id, kind, trigger, plan, status) VALUES ($1, $2, 'produce', 'user', '[]', 'queued')", [randomUUID(), a.videoId]);
    await expect(dup).rejects.toMatchObject({ code: '23505' });
    await updateRun(t.pool, a.runId, { status: 'done', endedAt: new Date() });
    await t.pool.query("INSERT INTO runs (id, video_id, kind, trigger, plan, status) VALUES ($1, $2, 'rerender', 'user', '[]', 'queued')", [randomUUID(), a.videoId]);
  });
});

describe('views', () => {
  it('maps step patches into the run view in ordinal order', async () => {
    const a = await produce('Mandal');
    const [research] = await listRunSteps(t.pool, a.runId);
    const started = new Date(Date.now() - 4000);
    await updateStep(t.pool, research!.id, { status: 'running', progress: 40, progressSource: 'agent', attempt: 1, startedAt: started, note: 'web araması' });
    await updateRun(t.pool, a.runId, { status: 'running', progress: 21.3, etaS: 290, startedAt: started });
    const run = await getRunView(t.pool, a.runId);
    expect(run).toMatchObject({ status: 'running', progress: 21.3, etaS: 290, startedAt: started.toISOString() });
    expect(run!.steps[0]).toMatchObject({ status: 'running', progress: 40, progressSource: 'agent', attempt: 1, note: 'web araması' });
    expect(run!.steps[0]).not.toHaveProperty('inputHash');
  });

  it('sums agent usage per video and the 5 h window share only when the window did not reset', async () => {
    const a = await produce('Fener');
    for (const tokens of [1000, 2500]) {
      const id = randomUUID();
      await insertSession(t.pool, { id, kind: 'pipeline', role: 'researcher', model: 'haiku', effort: 'low', claudeSessionId: id, runId: a.runId, stepId: null, runDir: '/tmp/r', status: 'done' });
      await updateSession(t.pool, id, { tokens, costUsd: 0.01 });
    }
    const resets = '2026-10-06T15:00:00.000Z';
    await updateRun(t.pool, a.runId, { usageStart: { fiveHour: 0.1, fiveHourResetsAt: resets, sevenDay: 0.2 }, usageEnd: { fiveHour: 0.13, fiveHourResetsAt: resets, sevenDay: 0.21 } });
    const v = await getVideoView(t.pool, a.videoId);
    expect(v!.usage).toMatchObject({ sessions: 2, tokens: 3500 });
    expect(v!.usage.costUsd).toBeCloseTo(0.02, 6);
    expect(v!.usage.fiveHourDelta).toBeCloseTo(0.03, 6);
    await updateRun(t.pool, a.runId, { usageEnd: { fiveHour: 0.05, fiveHourResetsAt: '2026-10-06T20:00:00.000Z', sevenDay: 0.21 } });
    expect((await getVideoView(t.pool, a.videoId))!.usage.fiveHourDelta).toBeNull();
    expect((await listVideoViews(t.pool)).find((x) => x.id === a.videoId)!.usage.tokens).toBe(3500);
  });

  it('treats the same 5 h window written by get_usage (ms) and rate_limit_event (s) as one window (real check)', async () => {
    const a = await produce('Kalem pencere');
    await updateRun(t.pool, a.runId, {
      usageStart: { fiveHour: 0.02, fiveHourResetsAt: '2026-10-06T16:59:59.916Z', sevenDay: 0.36 },
      usageEnd: { fiveHour: 0.04, fiveHourResetsAt: '2026-10-06T17:00:00.000Z', sevenDay: 0.36 },
    });
    expect((await getVideoView(t.pool, a.videoId))!.usage.fiveHourDelta).toBeCloseTo(0.02, 6);
  });
});

describe('artifacts and history', () => {
  it('stores JSON artifacts, finds one by input hash and lists a video newest first', async () => {
    const a = await produce('Kalemtıraş');
    const [research] = await listRunSteps(t.pool, a.runId);
    const m1 = await insertArtifact(t.pool, { runId: a.runId, stepId: research!.id, versionId: a.versionId, kind: 'research', content: { v: 1 }, inputHash: 'h1' });
    const m2 = await insertArtifact(t.pool, { runId: a.runId, stepId: research!.id, versionId: a.versionId, kind: 'research', content: { v: 2 }, inputHash: 'h2' });
    expect(await findArtifact(t.pool, { runId: a.runId, kind: 'research', inputHash: 'h1' })).toMatchObject({ id: m1.id, content: { v: 1 } });
    expect(await findArtifact(t.pool, { runId: a.runId, kind: 'research', inputHash: 'nope' })).toBeNull();
    expect(await latestArtifact(t.pool, a.runId, 'research')).toMatchObject({ id: m2.id, content: { v: 2 } });
    expect((await listArtifacts(t.pool, a.videoId)).map((x) => x.id)).toEqual([m2.id, m1.id]);
    expect(await getArtifact(t.pool, m1.id)).toMatchObject({ kind: 'research', content: { v: 1 } });
  });

  it('reports recent durations of finished steps and the latest usage mark', async () => {
    const a = await produce('Raptiye');
    const steps = await listRunSteps(t.pool, a.runId);
    const now = Date.now();
    await updateStep(t.pool, steps[0]!.id, { status: 'done', startedAt: new Date(now - 200_000), endedAt: new Date(now - 20_000) });
    expect((await stepHistorySeconds(t.pool, 'research')).slice(0, 1)).toEqual([180]);
    expect(await latestUsageMark(t.pool)).toBeNull();
    await t.pool.query("INSERT INTO usage_snapshots (source, five_hour_util, five_hour_resets_at, seven_day_util) VALUES ('get_usage', 0.42, '2026-10-06T15:00:00Z', 0.2)");
    expect(await latestUsageMark(t.pool)).toEqual({ fiveHour: 0.42, fiveHourResetsAt: '2026-10-06T15:00:00.000Z', sevenDay: 0.2 });
  });
});
