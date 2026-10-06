import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, getVideoView, insertArtifact, insertBlob, listVideoViews } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('VideoView.draft (library cover and length)', () => {
  it('is null before a draft and then carries the newest draft video and cover of the video', async () => {
    const r = await createProduceRun(t.pool, { productName: 'Kalem kütüphane', audioMode: 'silent', plan: [{ key: 'research', weight: 100 }] });
    expect((await getVideoView(t.pool, r.videoId))!.draft).toBeNull();
    for (const [sha, kind] of [['a'.repeat(64), 'draft_video'], ['b'.repeat(64), 'draft_cover'], ['c'.repeat(64), 'draft_video']] as const) {
      await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: kind === 'draft_video' ? 'video/mp4' : 'image/png' });
      await insertArtifact(t.pool, { runId: r.runId, kind, blobSha: sha, ...(kind === 'draft_video' ? { durationMs: sha.startsWith('c') ? 45_033 : 2_000, width: 540, height: 960, codec: 'h264' } : {}) });
    }
    expect((await getVideoView(t.pool, r.videoId))!.draft).toEqual({ videoSha: 'c'.repeat(64), coverSha: 'b'.repeat(64), durationS: 45 });
    expect((await listVideoViews(t.pool)).find((v) => v.id === r.videoId)!.draft!.durationS).toBe(45);
  });
});
