import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, enqueueJob, claimJob, insertVersion, listRunSteps, rewindForReview, updateRun, updateStep } from '../src/index.ts';
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

describe('rewindForReview, final loop (plan F3/F13)', () => {
  const finalPlan = (['research', 'storyboard', 'build', 'draft_render', 'draft_review', 'final_render', 'compose', 'qc', 'review', 'finalize'] as const).map((key) => ({ key, weight: 10 }));

  async function finalReviewing(name: string) {
    const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: finalPlan });
    await updateRun(t.pool, r.runId, { status: 'running' });
    const steps = await listRunSteps(t.pool, r.runId);
    for (const s of steps) {
      const running = s.key === 'review';
      if (s.key === 'finalize') continue;
      await updateStep(t.pool, s.id, { status: running ? 'running' : 'done', progress: running ? 40 : 100, attempt: 1, startedAt: new Date(), endedAt: running ? null : new Date() });
    }
    await t.pool.query("UPDATE steps SET round = 1 WHERE run_id = $1 AND key IN ('build', 'draft_render', 'draft_review')", [r.runId]);
    const review = steps.find((s) => s.key === 'review')!;
    await enqueueJob(t.pool, { stepId: review.id, resource: 'claude' });
    const job = (await claimJob(t.pool, { owner: 'w', resources: ['claude'], leaseMs: 60_000 }))!;
    return { r, review, job };
  }

  it('fix_round + 1 on compose…review only, draft rounds untouched, the pending version becomes current, one transaction; a replay changes nothing', async () => {
    const { r, review, job } = await finalReviewing('Kalem final döngü');
    const vid = '11111111-1111-4111-8111-111111111111';
    await insertVersion(t.pool, { id: vid, videoId: r.videoId, parentVersionId: r.versionId, round: 1, reason: 'fix:pending' });
    await insertVersion(t.pool, { id: vid, videoId: r.videoId, parentVersionId: r.versionId, round: 1, reason: 'ignored' }); // restart: same row
    const args = { runId: r.runId, stepId: review.id, jobId: job.id, round: 0, fromOrdinal: 6, toOrdinal: 8, note: 'düzeltme turu 1/3', counter: 'fix_round' as const };

    // A version that does not exist aborts the whole rewind: nothing moved, the job is still leased.
    await expect(rewindForReview(t.pool, { ...args, version: { id: '22222222-2222-4222-8222-222222222222', reason: 'fix:compose' } })).rejects.toThrow();
    expect((await t.pool.query('SELECT fix_round FROM steps WHERE run_id = $1', [r.runId])).rows.every((x) => x.fix_round === 0)).toBe(true);
    expect((await t.pool.query('SELECT status FROM jobs WHERE id = $1', [job.id])).rows[0].status).toBe('leased');

    expect(await rewindForReview(t.pool, { ...args, version: { id: vid, reason: 'fix:compose' } })).toBe(true);
    const after = await t.pool.query('SELECT key, status, round, fix_round, attempt FROM steps WHERE run_id = $1 ORDER BY ordinal', [r.runId]);
    expect(after.rows.map((x) => x.fix_round)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 0]);
    expect(after.rows.map((x) => x.round)).toEqual([0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
    expect(after.rows.slice(6, 9).map((x) => [x.status, x.attempt])).toEqual([['pending', 0], ['pending', 0], ['pending', 0]]);
    expect(after.rows[5]).toMatchObject({ status: 'done', attempt: 1 });
    const v = (await t.pool.query('SELECT parent_version_id, round, reason FROM versions WHERE id = $1', [vid])).rows[0];
    expect(v).toEqual({ parent_version_id: r.versionId, round: 1, reason: 'fix:compose' });
    expect((await t.pool.query('SELECT current_version_id FROM videos WHERE id = $1', [r.videoId])).rows[0].current_version_id).toBe(vid);
    expect((await t.pool.query('SELECT status FROM jobs WHERE id = $1', [job.id])).rows[0].status).toBe('done');

    // A replay (the step is pending now) returns false and changes nothing, not even the version.
    expect(await rewindForReview(t.pool, { ...args, version: { id: vid, reason: 'fix:build' } })).toBe(false);
    expect((await t.pool.query('SELECT fix_round FROM steps WHERE run_id = $1 ORDER BY ordinal', [r.runId])).rows.map((x) => x.fix_round)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 0]);
    expect((await t.pool.query('SELECT reason FROM versions WHERE id = $1', [vid])).rows[0].reason).toBe('fix:compose');
  });
});
