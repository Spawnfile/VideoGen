import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, enqueueJob, claimJob, listRunSteps, rewindForReview, updateRun, updateStep } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const plan = (['research', 'storyboard', 'build', 'draft_render', 'draft_review'] as const).map((key) => ({ key, weight: 20 }));

async function reviewing(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  await updateRun(t.pool, r.runId, { status: 'running' });
  const steps = await listRunSteps(t.pool, r.runId);
  for (const s of steps) await updateStep(t.pool, s.id, { status: s.key === 'draft_review' ? 'running' : 'done', progress: s.key === 'draft_review' ? 40 : 100, attempt: 1, startedAt: new Date(), endedAt: s.key === 'draft_review' ? null : new Date() });
  const review = steps.at(-1)!;
  await enqueueJob(t.pool, { stepId: review.id, resource: 'claude' });
  const job = (await claimJob(t.pool, { owner: 'w', resources: ['claude'], leaseMs: 60_000 }))!;
  return { r, review, job };
}

describe('rewindForReview (plan C6)', () => {
  it('sends build…draft_review back to pending with round + 1 and a fresh attempt, and closes the review job, in one transaction', async () => {
    const { r, review, job } = await reviewing('Kalem rewind');
    expect(await rewindForReview(t.pool, { runId: r.runId, stepId: review.id, jobId: job.id, round: 0, fromOrdinal: 2, toOrdinal: 4, note: 'taslak turu 1/2' })).toBe(true);
    const after = await listRunSteps(t.pool, r.runId);
    expect(after.map((s) => [s.key, s.status, s.round, s.attempt, s.progress])).toEqual([
      ['research', 'done', 0, 1, 100], ['storyboard', 'done', 0, 1, 100],
      ['build', 'pending', 1, 0, 0], ['draft_render', 'pending', 1, 0, 0], ['draft_review', 'pending', 1, 0, 0],
    ]);
    expect(after[2]!).toMatchObject({ note: 'taslak turu 1/2', startedAt: null, endedAt: null, inputHash: null });
    expect((await t.pool.query('SELECT status FROM jobs WHERE id = $1', [job.id])).rows[0].status).toBe('done');
    // Replayed by a restarted worker for the same round: nothing changes a second time (no double round).
    expect(await rewindForReview(t.pool, { runId: r.runId, stepId: review.id, jobId: job.id, round: 0, fromOrdinal: 2, toOrdinal: 4, note: 'x' })).toBe(false);
    expect((await listRunSteps(t.pool, r.runId)).map((s) => s.round)).toEqual([0, 0, 1, 1, 1]);
  });

  it('does nothing when the run was cancelled meanwhile', async () => {
    const { r, review, job } = await reviewing('Kalem iptal');
    await updateRun(t.pool, r.runId, { status: 'cancelled' });
    expect(await rewindForReview(t.pool, { runId: r.runId, stepId: review.id, jobId: job.id, round: 0, fromOrdinal: 2, toOrdinal: 4, note: 'x' })).toBe(false);
    expect((await listRunSteps(t.pool, r.runId)).map((s) => s.round)).toEqual([0, 0, 0, 0, 0]);
    expect((await t.pool.query('SELECT status FROM jobs WHERE id = $1', [job.id])).rows[0].status).toBe('leased');
  });
});
