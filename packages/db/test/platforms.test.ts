import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createProduceRun, finalLicence, insertArtifact, insertAsset, insertBlob, insertVersion, listPlatformEvents, recordPlatformEvent, setBestVersion, setVideoText, verifyAudit,
} from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
const plan = [{ key: 'research' as const, weight: 100 }];
const hex = () => randomUUID().replace(/-/g, '').repeat(2);

async function blob(): Promise<string> {
  const sha = hex();
  await insertBlob(t.pool, { sha256: sha, path: `media/${sha}`, bytes: 1, mime: 'video/mp4' });
  return sha;
}
async function finished(name: string) {
  const r = await createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
  await insertArtifact(t.pool, { runId: r.runId, versionId: r.versionId, kind: 'final_video_music', blobSha: await blob(), inputHash: 'h', durationMs: 12_500 });
  await setBestVersion(t.pool, r.videoId, r.versionId);
  return r;
}
const audits = async (videoId: string) => (await t.pool.query("SELECT action, data FROM audit_log WHERE subject_id = $1 AND action LIKE 'platform.%' ORDER BY seq", [videoId])).rows;
const events = async () => Number((await t.pool.query("SELECT count(*) FROM ui_events WHERE type = 'video.updated'")).rows[0].count);

describe('platform events (video library L13–L17)', () => {
  it('mark → state uploaded on the best version, audited, video.updated published in the same write; undo → none; re-upload adds a row', async () => {
    const r = await finished('Platform kalemi');
    const before = await events();
    const a = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'uploaded', url: 'https://www.instagram.com/reel/abc/', note: 'ilk' });
    if ('error' in a) throw new Error(a.error);
    expect(a.event).toMatchObject({ platform: 'instagram', action: 'uploaded', versionId: r.versionId, url: 'https://www.instagram.com/reel/abc/', note: 'ilk' });
    expect(a.video.platforms.instagram.status).toBe('uploaded');
    expect(a.video.platforms.youtube.status).toBe('none');
    expect(await events()).toBe(before + 1);
    const b = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'retracted' });
    if ('error' in b) throw new Error(b.error);
    expect(b.event.versionId).toBe(r.versionId);
    expect(b.video.platforms.instagram.status).toBe('none');
    await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'uploaded' });
    await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'uploaded' });
    const list = await listPlatformEvents(t.pool, r.videoId);
    expect(list.map((e) => e.action)).toEqual(['uploaded', 'uploaded', 'retracted', 'uploaded']);
    expect((await audits(r.videoId)).map((x) => x.action)).toEqual(['platform.uploaded', 'platform.retracted', 'platform.uploaded', 'platform.uploaded']);
    expect((await audits(r.videoId))[0].data).toMatchObject({ platform: 'instagram', versionId: r.versionId, hasUrl: true });
    expect((await verifyAudit(t.pool)).ok).toBe(true);
  });

  it('errors: unknown video, no final on the best version, undo with nothing uploaded', async () => {
    expect(await recordPlatformEvent(t.pool, { videoId: randomUUID(), platform: 'youtube', action: 'uploaded' })).toEqual({ error: 'video_not_found' });
    const bare = await createProduceRun(t.pool, { productName: 'Finalsiz kalem', audioMode: 'silent', plan });
    expect(await recordPlatformEvent(t.pool, { videoId: bare.videoId, platform: 'youtube', action: 'uploaded' })).toEqual({ error: 'no_final' });
    const r = await finished('Geri alma kalemi');
    expect(await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'tiktok', action: 'retracted' })).toEqual({ error: 'not_uploaded' });
  });

  it('a new best version makes an earlier upload outdated, and undo still points at the uploaded version', async () => {
    const r = await finished('Sürüm kalemi');
    await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'youtube', action: 'uploaded' });
    const v1 = randomUUID();
    await insertVersion(t.pool, { id: v1, videoId: r.videoId, parentVersionId: r.versionId, round: 1, reason: 'fix:compose' });
    await insertArtifact(t.pool, { runId: r.runId, versionId: v1, kind: 'final_video_music', blobSha: await blob(), inputHash: 'h1' });
    await setBestVersion(t.pool, r.videoId, v1);
    const x = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'tiktok', action: 'uploaded' });
    if ('error' in x) throw new Error(x.error);
    expect(x.video.platforms.youtube.status).toBe('outdated');
    expect(x.video.platforms.tiktok.status).toBe('uploaded');
    const y = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'youtube', action: 'retracted' });
    if ('error' in y) throw new Error(y.error);
    expect(y.event.versionId).toBe(r.versionId);
  });

  it('uploadedAt is stored as given (a past date is fine)', async () => {
    const r = await finished('Tarih kalemi');
    const a = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'tiktok', action: 'uploaded', uploadedAt: new Date('2026-10-01T08:30:00.000Z') });
    if ('error' in a) throw new Error(a.error);
    expect(a.event.uploadedAt).toBe('2026-10-01T08:30:00.000Z');
    expect(a.video.platforms.tiktok.uploadedAt).toBe('2026-10-01T08:30:00.000Z');
  });

  it('licence: CC-BY music gives an attribution line; a revoked asset blocks marking as uploaded (undo still works)', async () => {
    const r = await finished('Lisans kalemi');
    const bed = (await insertAsset(t.pool, { kind: 'music', title: 'Yatak', blobSha: await blob(), licenseSpdx: 'CC-BY-4.0', author: 'A', attribution: 'Yatak by A (CC BY 4.0)', allowed: true }))!;
    const klik = (await insertAsset(t.pool, { kind: 'sfx', title: 'Klik', blobSha: await blob(), licenseSpdx: 'CC0-1.0', author: 'B', allowed: true }))!;
    await insertArtifact(t.pool, { runId: r.runId, versionId: r.versionId, kind: 'audio_plan', content: { cues: [{ assetId: klik.id }], music: { assetId: bed.id } } });
    expect(await finalLicence(t.pool, r.videoId)).toEqual({ attributions: ['Yatak by A (CC BY 4.0)'], refused: [] });
    const ok = await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'youtube', action: 'uploaded' });
    expect('error' in ok).toBe(false);
    await t.pool.query('UPDATE assets SET allowed = false, revoked_at = now() WHERE id = $1', [klik.id]);
    expect(await finalLicence(t.pool, r.videoId)).toEqual({ attributions: ['Yatak by A (CC BY 4.0)'], refused: ['Klik'] });
    expect(await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'instagram', action: 'uploaded' })).toEqual({ error: 'licence_refused', refused: ['Klik'] });
    expect('error' in (await recordPlatformEvent(t.pool, { videoId: r.videoId, platform: 'youtube', action: 'retracted' }))).toBe(false);
  });

  it('licence: a final without a sound plan (imported, composer-only) has no lines and nothing refused', async () => {
    const r = await finished('Plansız kalem');
    expect(await finalLicence(t.pool, r.videoId)).toEqual({ attributions: [], refused: [] });
    expect(await finalLicence(t.pool, randomUUID())).toEqual({ attributions: [], refused: [] });
  });

  it('setVideoText stores caption and title, empty → null, audits field and length, publishes video.updated; unknown video → null', async () => {
    const r = await finished('Metin kalemi');
    const before = await events();
    const v = await setVideoText(t.pool, r.videoId, { caption: 'Two sentences. One question?', youtubeTitle: '  ' });
    expect(v).toMatchObject({ caption: 'Two sentences. One question?', youtubeTitle: null });
    expect(await events()).toBe(before + 1);
    const rows = (await t.pool.query("SELECT data FROM audit_log WHERE subject_id = $1 AND action = 'video.text_edited' ORDER BY seq", [r.videoId])).rows;
    expect(rows.map((x) => x.data.field).sort()).toEqual(['caption', 'youtubeTitle']);
    expect(rows.find((x) => x.data.field === 'caption').data).toMatchObject({ length: 28, preview: 'Two sentences. One question?' });
    expect(await setVideoText(t.pool, randomUUID(), { caption: 'x' })).toBeNull();
  });
});
