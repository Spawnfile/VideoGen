import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cancelRunJobs, claimJob, createProduceRun, enqueueJob, finishJob, heartbeatJobs, listRunSteps, recoverJobs, requeueJob } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const plan = [{ key: 'research' as const, weight: 50 }, { key: 'storyboard' as const, weight: 50 }];
async function steps(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  return { runId: r.runId, steps: await listRunSteps(t.pool, r.runId) };
}
/** Each test starts with no active job (earlier tests leave leases that a foreign-lease recovery would pick up). */
const reset = () => t.pool.query("UPDATE jobs SET status = 'done', lease_owner = NULL WHERE status IN ('queued', 'leased')");

describe('jobs', () => {
  it('one active job per step; claims by priority then id; respects run_after and resources', async () => {
    await reset();
    const a = await steps('Ataş');
    const b = await steps('Silgi');
    const j1 = await enqueueJob(t.pool, { stepId: a.steps[0]!.id, resource: 'claude' });
    expect(await enqueueJob(t.pool, { stepId: a.steps[0]!.id, resource: 'claude' })).toBeNull();
    const j2 = await enqueueJob(t.pool, { stepId: b.steps[0]!.id, resource: 'claude', priority: 10 });
    await enqueueJob(t.pool, { stepId: b.steps[1]!.id, resource: 'claude', delayMs: 60_000 });
    await enqueueJob(t.pool, { stepId: a.steps[1]!.id, resource: 'gpu' });
    expect((await claimJob(t.pool, { owner: 'w1', resources: ['claude'], leaseMs: 120_000 }))!.id).toBe(j2!.id);
    const c = await claimJob(t.pool, { owner: 'w1', resources: ['claude'], leaseMs: 120_000 });
    expect(c).toMatchObject({ id: j1!.id, status: 'leased', leaseOwner: 'w1', attempts: 1 });
    expect(await claimJob(t.pool, { owner: 'w1', resources: ['claude'], leaseMs: 120_000 })).toBeNull();
    expect((await claimJob(t.pool, { owner: 'w1', resources: ['gpu'], leaseMs: 120_000 }))!.resource).toBe('gpu');
  });

  it('two concurrent claims never get the same job (SKIP LOCKED)', async () => {
    await reset();
    const a = await steps('Cetvel');
    await enqueueJob(t.pool, { stepId: a.steps[0]!.id, resource: 'claude' });
    await enqueueJob(t.pool, { stepId: a.steps[1]!.id, resource: 'claude' });
    const [x, y] = await Promise.all([1, 2].map((i) => claimJob(t.pool, { owner: `w${i}`, resources: ['claude'], leaseMs: 120_000 })));
    expect(x!.id).not.toBe(y!.id);
  });

  it('heartbeat extends only my leases; recovery requeues expired ones, and foreign ones at startup', async () => {
    await reset();
    const a = await steps('Pergel');
    await enqueueJob(t.pool, { stepId: a.steps[0]!.id, resource: 'claude' });
    await enqueueJob(t.pool, { stepId: a.steps[1]!.id, resource: 'claude' });
    const mine = (await claimJob(t.pool, { owner: 'me', resources: ['claude'], leaseMs: 50 }))!;
    const other = (await claimJob(t.pool, { owner: 'old-worker', resources: ['claude'], leaseMs: 120_000 }))!;
    expect(await heartbeatJobs(t.pool, 'me', [mine.id, other.id], 120_000)).toBe(1);
    await t.pool.query("UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1", [mine.id]);
    expect((await recoverJobs(t.pool, { owner: 'me', foreign: false })).map((r) => r.jobId)).toEqual([mine.id]);
    expect((await recoverJobs(t.pool, { owner: 'me', foreign: true })).map((r) => r.stepId)).toEqual([other.stepId]);
    const { rows } = await t.pool.query('SELECT status, lease_owner FROM jobs WHERE id = ANY($1) ORDER BY id', [[mine.id, other.id]]);
    expect(rows).toEqual([{ status: 'queued', lease_owner: null }, { status: 'queued', lease_owner: null }]);
  });

  it('finish, delayed requeue and run-wide cancel', async () => {
    await reset();
    const a = await steps('Makas');
    const j = (await enqueueJob(t.pool, { stepId: a.steps[0]!.id, resource: 'claude' }))!;
    await claimJob(t.pool, { owner: 'me', resources: ['claude'], leaseMs: 120_000 });
    await requeueJob(t.pool, j.id, 60_000);
    expect(await claimJob(t.pool, { owner: 'me', resources: ['claude'], leaseMs: 120_000 })).toBeNull();
    await enqueueJob(t.pool, { stepId: a.steps[1]!.id, resource: 'claude' });
    expect(await cancelRunJobs(t.pool, a.runId)).toBe(2);
    await finishJob(t.pool, j.id, 'done');
    const { rows } = await t.pool.query('SELECT status FROM jobs WHERE id = $1', [j.id]);
    expect(rows[0].status).toBe('done');
  });
});
