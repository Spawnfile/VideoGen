import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduceRun, getVideoView, insertArtifact, insertBlob } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('VideoView.final', () => {
  it('pairs the newest final video with the cover of the same compose (same input hash); spec Z4: no music-free variant field', async () => {
    const r = await createProduceRun(t.pool, { productName: 'Kalem final', audioMode: 'silent', plan: [{ key: 'research', weight: 100 }] });
    expect((await getVideoView(t.pool, r.videoId))!.final).toBeNull();
    const add = async (c: string, kind: string, hash: string, ms?: number) => {
      const sha = c.repeat(64);
      await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
      await insertArtifact(t.pool, { runId: r.runId, kind, blobSha: sha, inputHash: hash, ...(ms ? { durationMs: ms, width: 1080, height: 1920, codec: 'h264' } : {}) });
    };
    await add('a', 'final_video_music', 'h1', 45_033);
    await add('c', 'final_cover', 'h1');
    await add('d', 'final_video_music', 'h2', 44_000);
    await add('e', 'final_cover', 'h1'); // a later cover of the older compose must not be paired with h2
    expect((await getVideoView(t.pool, r.videoId))!.final).toEqual({ musicSha: 'd'.repeat(64), coverSha: null, durationS: 44 });
    await add('0', 'final_cover', 'h2');
    expect((await getVideoView(t.pool, r.videoId))!.final).toEqual({ musicSha: 'd'.repeat(64), coverSha: '0'.repeat(64), durationS: 44 });
  });
});
