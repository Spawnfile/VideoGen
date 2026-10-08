import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { createProduceRun, insertArtifact, insertBlob, insertVersion, recordReviewRound, setBestVersion } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
const H = { host: '127.0.0.1:5180' };

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', devEndpoints: false } });
});
afterAll(async () => { await app.close(); await hub.stop(); await t.drop(); });

const plan = [{ key: 'research' as const, weight: 100 }];
const orch = (total: number, d1: number) => ({ reviewerRole: 'orchestrator', seq: 1, rubricVersion: 'final@1', total, dimensionScores: { D1: d1 }, gates: { G1: true }, verdict: total >= 80 ? 'ready' : 'fix', summaryTr: `Toplam ${total}`, findings: [] });
const visual = (summary: string) => ({ reviewerRole: 'reviewer_visual', seq: 1, rubricVersion: 'final@1', summaryTr: summary, findings: [] });

/** Produce version (round 0) and two fix rounds: round 1 is finished, scored, best and published; round 2 is an orphaned fix:pending row. */
async function seed(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  const v1 = randomUUID();
  const v2 = randomUUID();
  await insertVersion(t.pool, { id: v1, videoId: r.videoId, parentVersionId: r.versionId, round: 1, reason: 'fix:compose' });
  await insertVersion(t.pool, { id: v2, videoId: r.videoId, parentVersionId: v1, round: 2, reason: 'fix:pending' });
  const final = async (versionId: string, c: string, hash: string, ms: number) => {
    for (const [kind, ch] of [['final_video_music', c], ['final_video_tiktok', `${c}1`], ['final_cover', `${c}2`]] as const) {
      const sha = ch.repeat(64 / ch.length);
      await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
      await insertArtifact(t.pool, { runId: r.runId, versionId, kind, blobSha: sha, inputHash: hash, ...(kind === 'final_cover' ? {} : { durationMs: ms, width: 1080, height: 1920, codec: 'h264' }) });
    }
  };
  await final(r.versionId, 'a', 'h0', 45_000);
  await final(v1, 'b', 'h1', 44_000);
  // A later music file of round 1 with its own variants: the version's newest compose wins.
  await final(v1, 'c', 'h1b', 43_000);
  await recordReviewRound(t.pool, { runId: r.runId, round: 0, versionId: r.versionId, fixed: [], rows: [orch(72, 10), visual('ilk tur')] });
  await recordReviewRound(t.pool, { runId: r.runId, round: 1, versionId: v1, fixed: [], rows: [orch(84, 13), visual('ikinci tur')] });
  await setBestVersion(t.pool, r.videoId, v1);
  await t.pool.query('UPDATE videos SET current_version_id = $2 WHERE id = $1', [r.videoId, v2]);
  await t.pool.query(
    `INSERT INTO publications (id, video_id, version_id, variant, status, blob_sha, bytes, caption, aigc_required, published_at)
     VALUES ($1, $2, $3, 'tiktok', 'published', $4, 1, 'altyazı', false, now())`,
    [randomUUID(), r.videoId, v1, 'c1'.repeat(32)],
  );
  return { ...r, v1, v2 };
}

describe('versions', () => {
  it('GET /api/videos/:id/versions lists the produce version and each fix round with reason, the orchestrator total of that version, its own finals, best, current and published flags; a version without a final is listed as unfinished; 404 for an unknown video', async () => {
    const s = await seed('Sürüm kalemi');
    const other = await seed('Başka kalem');
    const res = await app.inject({ url: `/api/videos/${s.videoId}/versions`, headers: H });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.map((v: { id: string }) => v.id)).toEqual([s.versionId, s.v1, s.v2]);
    expect(list[0]).toMatchObject({
      round: 0, reason: 'produce', parentId: null, runId: s.runId, total: 72, verdict: 'fix', dims: { D1: 10 },
      finals: { musicSha: 'a'.repeat(64), tiktokSha: 'a1'.repeat(32), coverSha: 'a2'.repeat(32), durationS: 45 }, best: false, current: false, published: false,
    });
    expect(list[1]).toMatchObject({
      round: 1, reason: 'fix:compose', parentId: s.versionId, runId: s.runId, total: 84, verdict: 'ready', dims: { D1: 13 },
      finals: { musicSha: 'c'.repeat(64), tiktokSha: 'c1'.repeat(32), coverSha: 'c2'.repeat(32), durationS: 43 }, best: true, current: false, published: true,
    });
    expect(list[2]).toMatchObject({ round: 2, reason: 'fix:pending', parentId: s.v1, runId: s.runId, total: null, verdict: null, finals: null, best: false, current: true, published: false });
    expect(typeof list[0].createdAt).toBe('string');
    // The other video's rows never leak in.
    expect(list.some((v: { id: string }) => [other.versionId, other.v1, other.v2].includes(v.id))).toBe(false);
    expect((await app.inject({ url: '/api/videos/00000000-0000-4000-8000-000000000000/versions', headers: H })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/videos/nope/versions', headers: H })).statusCode).toBe(404);
  });

  it('GET /api/videos/:id/reviews?version= returns only that version\'s rounds; a version of another video is 400', async () => {
    const s = await seed('İnceleme kalemi');
    const other = await seed('Öteki kalem');
    const all = (await app.inject({ url: `/api/videos/${s.videoId}/reviews`, headers: H })).json();
    expect(all.map((r: { round: number }) => r.round)).toEqual([0, 0, 1, 1]);
    const one = await app.inject({ url: `/api/videos/${s.videoId}/reviews?version=${s.v1}`, headers: H });
    expect(one.statusCode).toBe(200);
    expect(one.json().map((r: { round: number; reviewerRole: string; versionId: string }) => [r.round, r.reviewerRole, r.versionId])).toEqual([[1, 'orchestrator', s.v1], [1, 'reviewer_visual', s.v1]]);
    expect((await app.inject({ url: `/api/videos/${s.videoId}/reviews?version=${s.v2}`, headers: H })).json()).toEqual([]);
    const foreign = await app.inject({ url: `/api/videos/${s.videoId}/reviews?version=${other.v1}`, headers: H });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json().error).toMatch(/sürüm/);
    expect((await app.inject({ url: `/api/videos/${s.videoId}/reviews?version=nope`, headers: H })).statusCode).toBe(400);
  });
});
