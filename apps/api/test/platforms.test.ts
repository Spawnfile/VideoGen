import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { createProduceRun, insertArtifact, insertBlob, setBestVersion } from '@videogen/db';
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
async function finished(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  const sha = randomUUID().replace(/-/g, '').repeat(2);
  await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
  await insertArtifact(t.pool, { runId: r.runId, versionId: r.versionId, kind: 'final_video_music', blobSha: sha, inputHash: 'h' });
  await setBestVersion(t.pool, r.videoId, r.versionId);
  return r;
}
const post = (id: string, payload: Record<string, unknown>, headers: Record<string, string> = H) => app.inject({ method: 'POST', url: `/api/videos/${id}/platforms`, headers, payload });
const patch = (id: string, payload: Record<string, unknown>, headers: Record<string, string> = H) => app.inject({ method: 'PATCH', url: `/api/videos/${id}/text`, headers, payload });

describe('platform routes (video library L12, L15, L16, L18)', () => {
  it('mark, read, undo; the list summary carries the state; the read carries the licence lines', async () => {
    const r = await finished('Rota kalemi');
    const a = await post(r.videoId, { platform: 'youtube', action: 'uploaded', url: 'https://youtube.com/shorts/x1', note: 'first' });
    expect(a.statusCode).toBe(201);
    expect(a.json().video.platforms.youtube.status).toBe('uploaded');
    const g = await app.inject({ url: `/api/videos/${r.videoId}/platforms`, headers: H });
    expect(g.json()).toMatchObject({ state: { youtube: { status: 'uploaded', url: 'https://youtube.com/shorts/x1' } }, attributions: [], refused: [] });
    expect(g.json().events).toHaveLength(1);
    const list = await app.inject({ url: '/api/videos', headers: H });
    expect(list.json().find((v: { id: string }) => v.id === r.videoId).platforms.youtube.status).toBe('uploaded');
    expect((await post(r.videoId, { platform: 'youtube', action: 'retracted' })).statusCode).toBe(201);
    expect((await app.inject({ url: `/api/videos/${randomUUID()}/platforms`, headers: H })).statusCode).toBe(404);
  });

  it('400s: unknown platform/action, http url, long note, uploadedAt 10 min ahead; a past uploadedAt and an empty url are fine', async () => {
    const r = await finished('Doğrulama kalemi');
    expect((await post(r.videoId, { platform: 'vimeo', action: 'uploaded' })).statusCode).toBe(400);
    expect((await post(r.videoId, { platform: 'youtube', action: 'deleted' })).statusCode).toBe(400);
    const http = await post(r.videoId, { platform: 'youtube', action: 'uploaded', url: 'http://youtube.com/x' });
    expect([http.statusCode, http.json().error]).toEqual([400, 'the link must start with https://']);
    expect((await post(r.videoId, { platform: 'youtube', action: 'uploaded', url: `https://x.com/${'a'.repeat(500)}` })).statusCode).toBe(400);
    expect((await post(r.videoId, { platform: 'youtube', action: 'uploaded', note: 'n'.repeat(501) })).statusCode).toBe(400);
    const ahead = await post(r.videoId, { platform: 'youtube', action: 'uploaded', uploadedAt: new Date(Date.now() + 600_000).toISOString() });
    expect([ahead.statusCode, ahead.json().error]).toEqual([400, 'the upload time cannot be in the future']);
    expect((await post(r.videoId, { platform: 'youtube', action: 'uploaded', uploadedAt: 'yesterday' })).statusCode).toBe(400);
    const past = await post(r.videoId, { platform: 'youtube', action: 'uploaded', uploadedAt: '2026-10-01T08:00:00+03:00', url: '' });
    expect(past.statusCode).toBe(201);
    expect(past.json().event).toMatchObject({ uploadedAt: '2026-10-01T05:00:00.000Z', url: null });
  });

  it('404 unknown video, 409 no final and undo with nothing uploaded', async () => {
    expect((await post(randomUUID(), { platform: 'youtube', action: 'uploaded' })).statusCode).toBe(404);
    expect((await post('not-a-uuid', { platform: 'youtube', action: 'uploaded' })).statusCode).toBe(404);
    const bare = await createProduceRun(t.pool, { productName: 'Finalsiz', audioMode: 'silent', plan });
    const n = await post(bare.videoId, { platform: 'youtube', action: 'uploaded' });
    expect([n.statusCode, n.json().error]).toEqual([409, 'This video has no downloadable final yet.']);
    const r = await finished('Geri al');
    const u = await post(r.videoId, { platform: 'tiktok', action: 'retracted' });
    expect([u.statusCode, u.json().error]).toEqual([409, 'Nothing to undo: it is not marked as uploaded on TikTok.']);
  });

  it('PATCH text: limits, empty → null, nothing to change → 400, unknown → 404', async () => {
    const r = await finished('Metin');
    const ok = await patch(r.videoId, { caption: 'Hi. Why?', youtubeTitle: '' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ caption: 'Hi. Why?', youtubeTitle: null });
    expect((await patch(r.videoId, { caption: 'c'.repeat(2201) })).statusCode).toBe(400);
    expect((await patch(r.videoId, { youtubeTitle: 't'.repeat(101) })).statusCode).toBe(400);
    expect((await patch(r.videoId, {})).statusCode).toBe(400);
    expect((await patch(randomUUID(), { caption: 'x' })).statusCode).toBe(404);
  });

  it('cross-origin writes are refused', async () => {
    const r = await finished('Köken');
    const evil = { ...H, origin: 'http://evil.example' };
    expect((await post(r.videoId, { platform: 'youtube', action: 'uploaded' }, evil)).statusCode).toBe(403);
    expect((await patch(r.videoId, { caption: 'x' }, evil)).statusCode).toBe(403);
  });

  it('the removed publish endpoints are gone', async () => {
    for (const [method, url] of [['GET', '/api/tiktok'], ['POST', `/api/videos/${randomUUID()}/publish`], ['POST', `/api/videos/${randomUUID()}/exports/shorts`]] as const) {
      expect((await app.inject({ method, url, headers: H, payload: {} })).statusCode).toBe(404);
    }
  });
});
