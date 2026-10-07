import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProduceRun, getVideoView, insertArtifact, insertBlob, insertVersion, listRunReviews, listRunSteps, listVideoReviews, recordReviewRound, setBestVersion,
  type NewReview,
} from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const plan = (['research', 'review'] as const).map((key) => ({ key, weight: 50 }));
const V1 = '33333333-3333-4333-8333-333333333333';

const finding = (checkId: string, status: 'open' | 'regressed' = 'open') => ({ checkId, severity: 'major', dimension: 'D2', gate: null, evidence: { note: checkId }, fixHint: 'düzelt', status });
const panel = (total: number | null, findings: ReturnType<typeof finding>[], seq = 1): NewReview[] => [
  { reviewerRole: 'reviewer_visual', seq, rubricVersion: 'final@1', total: null, dimensionScores: null, gates: null, verdict: null, summaryTr: null, findings },
  { reviewerRole: 'orchestrator', seq: 1, rubricVersion: 'final@1', total, dimensionScores: { D2: 8 }, gates: { G1: true }, verdict: total !== null && total >= 80 ? 'ready' : 'fix', summaryTr: `toplam ${total}`, findings: [] },
];

async function setup(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  const review = (await listRunSteps(t.pool, r.runId)).find((s) => s.key === 'review')!;
  return { r, review };
}

describe('reviews and findings (plan F22)', () => {
  it('stores a round once (a replay inserts nothing), marks earlier open findings fixed in the new version and keeps regressed ones', async () => {
    const { r, review } = await setup('Kalem inceleme');
    await insertVersion(t.pool, { id: V1, videoId: r.videoId, parentVersionId: r.versionId, round: 1, reason: 'fix:build' });
    const rows0 = panel(76, [finding('mechanism_shot'), finding('text_readable')]).map((x) => ({ ...x, stepId: review.id }));
    await recordReviewRound(t.pool, { runId: r.runId, round: 0, versionId: r.versionId, rows: rows0, fixed: [] });
    await recordReviewRound(t.pool, { runId: r.runId, round: 0, versionId: r.versionId, rows: rows0, fixed: [] }); // replay
    expect(await t.pool.query('SELECT 1 FROM reviews WHERE run_id = $1', [r.runId]).then((x) => x.rowCount)).toBe(2);
    expect(await t.pool.query('SELECT 1 FROM findings').then((x) => x.rowCount)).toBe(2);

    const rows1 = panel(81, [finding('hook_frame0', 'regressed')]).map((x) => ({ ...x, stepId: review.id }));
    await recordReviewRound(t.pool, { runId: r.runId, round: 1, versionId: V1, rows: rows1, fixed: ['text_readable', 'hook_frame0'] });
    await recordReviewRound(t.pool, { runId: r.runId, round: 1, versionId: V1, rows: rows1, fixed: ['text_readable', 'hook_frame0'] });

    const list = await listRunReviews(t.pool, r.runId);
    expect(list.map((x) => [x.round, x.reviewerRole, x.seq])).toEqual([[0, 'orchestrator', 1], [0, 'reviewer_visual', 1], [1, 'orchestrator', 1], [1, 'reviewer_visual', 1]]);
    expect(list[0]).toMatchObject({ total: 76, verdict: 'fix', summaryTr: 'toplam 76', versionId: r.versionId });
    const byCheck = Object.fromEntries(list.flatMap((x) => x.findings).map((f) => [f.checkId, f]));
    expect(byCheck.text_readable).toMatchObject({ status: 'fixed', fixedInVersionId: V1 });
    expect(byCheck.mechanism_shot).toMatchObject({ status: 'open', fixedInVersionId: null });
    // The round's own regressed finding is never closed by the same round's list.
    expect(byCheck.hook_frame0).toMatchObject({ status: 'regressed', fixedInVersionId: null });
    expect((await listVideoReviews(t.pool, r.videoId)).length).toBe(4);

    await recordReviewRound(t.pool, { runId: r.runId, round: 2, versionId: V1, rows: panel(86, []).map((x) => ({ ...x, stepId: review.id })), fixed: ['hook_frame0'] });
    const later = Object.fromEntries((await listRunReviews(t.pool, r.runId)).flatMap((x) => x.findings).map((f) => [f.checkId, f.status]));
    expect(later).toEqual({ mechanism_shot: 'open', text_readable: 'fixed', hook_frame0: 'fixed' });

    const audit = await t.pool.query("SELECT data FROM audit_log WHERE action = 'review.recorded' AND run_id = $1 ORDER BY seq", [r.runId]);
    expect(audit.rows.map((x) => x.data.round)).toEqual([0, 1, 2]);
  });

  it('the library score and final come from the best version; without one, from the newest round', async () => {
    const { r } = await setup('Kalem puan');
    await insertVersion(t.pool, { id: V1.replace('3', '4'), videoId: r.videoId, parentVersionId: r.versionId, round: 1, reason: 'fix:compose' });
    const v1 = V1.replace('3', '4');
    const add = async (c: string, versionId: string) => {
      const sha = c.repeat(64);
      await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
      await insertArtifact(t.pool, { runId: r.runId, versionId, kind: 'final_video_music', blobSha: sha, inputHash: c, durationMs: 40_000, width: 1080, height: 1920, codec: 'h264' });
    };
    expect((await getVideoView(t.pool, r.videoId))!.score).toBeNull();
    await add('a', r.versionId);
    await recordReviewRound(t.pool, { runId: r.runId, round: 0, versionId: r.versionId, rows: panel(78, []), fixed: [] });
    await add('b', v1);
    await recordReviewRound(t.pool, { runId: r.runId, round: 1, versionId: v1, rows: panel(74, []), fixed: [] });
    // An AUTO-gate round (total null) is never the score.
    await recordReviewRound(t.pool, { runId: r.runId, round: 2, versionId: v1, rows: panel(null, []), fixed: [] });
    let v = (await getVideoView(t.pool, r.videoId))!;
    expect([v.score, v.final?.musicSha]).toEqual([74, 'b'.repeat(64)]);
    await setBestVersion(t.pool, r.videoId, r.versionId);
    v = (await getVideoView(t.pool, r.videoId))!;
    expect([v.score, v.final?.musicSha]).toEqual([78, 'a'.repeat(64)]);
  });
});
