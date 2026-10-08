import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  advancePublication, cancelPublication, claimPublication, createProduceRun, createPublication, getPublication, listClaims, markPublished,
  snapshotClaims, updateVideo,
} from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const plan = (['research', 'storyboard'] as const).map((key) => ({ key, weight: 50 }));
async function video(name: string) {
  return createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
}
const send = (v: { videoId: string; versionId: string }, o: Partial<Parameters<typeof createPublication>[1]> = {}) =>
  createPublication(t.pool, { videoId: v.videoId, versionId: v.versionId, variant: 'tiktok', blobSha: 'a'.repeat(64), bytes: 1000, caption: 'Kanca', aigcRequired: false, ...o });
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

describe('publications and claims (plan M6 T2)', () => {
  it("publications: one active send per video — a second create returns the active row (also while 'waiting'); after it fails a new one is created; a sent version+variant needs confirmResend; two concurrent creates for the same video yield one row", async () => {
    const v = await video('Kalem tek');
    const a = await send(v);
    expect(a.kind).toBe('created');
    const id = a.kind === 'created' ? a.publication.id : '';
    expect(await send(v)).toMatchObject({ kind: 'active', publication: { id } });
    await t.pool.query("UPDATE publications SET status = 'waiting' WHERE id = $1", [id]);
    expect(await send(v)).toMatchObject({ kind: 'active', publication: { id } });
    await t.pool.query("UPDATE publications SET status = 'failed' WHERE id = $1", [id]);
    const b = await send(v);
    expect(b.kind).toBe('created');
    await t.pool.query("UPDATE publications SET status = 'sent' WHERE id = $1", [b.kind === 'created' ? b.publication.id : '']);
    expect((await send(v)).kind).toBe('sent');
    expect((await send(v, { variant: 'music' })).kind).toBe('created'); // another variant is a new send
    await t.pool.query("UPDATE publications SET status = 'failed' WHERE video_id = $1 AND status = 'queued'", [v.videoId]);
    expect((await send(v, { confirmResend: true })).kind).toBe('created');

    const w = await video('Kalem yarış');
    const both = await Promise.all([send(w), send(w)]);
    expect(both.map((r) => r.kind).sort()).toEqual(['active', 'created']);
    expect((await t.pool.query('SELECT count(*)::int AS n FROM publications WHERE video_id = $1', [w.videoId])).rows[0].n).toBe(1);
  });

  it('the 24 h draft limit: five counted rows (any of queued/uploading/processing/sent/waiting/published, or failed with a publish_id) block the sixth with the next slot; failed rows without a publish_id and rows older than 24 h do not count; two concurrent creates at four cannot both pass', async () => {
    await t.pool.query("UPDATE publications SET created_at = now() - interval '2 days'"); // the first test's rows age out
    const seed = async (status: string, hours: number, publishId: string | null = null) => {
      const v = await video(`Kalem ${status} ${hours}`);
      await t.pool.query(
        `INSERT INTO publications (id, video_id, version_id, variant, status, blob_sha, bytes, publish_id, caption, aigc_required, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'tiktok', $3, 'x', 1, $4, 'c', false, $5)`,
        [v.videoId, v.versionId, status, publishId, hoursAgo(hours)],
      );
    };
    await seed('sent', 1); await seed('published', 2); await seed('processing', 3); await seed('failed', 4); await seed('failed', 30, 'old');
    await seed('waiting', 5, 'w');
    expect((await send(await video('Kalem beşinci'))).kind).toBe('created'); // 4 counted + this = 5
    const r = await send(await video('Kalem altıncı'));
    expect(r.kind).toBe('limit');
    expect(r.kind === 'limit' && Math.abs(r.nextSlot.getTime() - (hoursAgo(5).getTime() + 86_400_000))).toBeLessThan(5000);
    await t.pool.query("UPDATE publications SET status = 'failed', publish_id = 'p' WHERE status = 'processing'");
    expect((await send(await video('Kalem yine'))).kind).toBe('limit'); // a failed send with a publish_id still counts

    await t.pool.query("UPDATE publications SET created_at = now() - interval '2 days'");
    for (let n = 0; n < 4; n += 1) await seed('sent', 1);
    const race = await Promise.all([send(await video('Kalem A')), send(await video('Kalem B'))]);
    expect(race.map((x) => x.kind).sort()).toEqual(['created', 'limit']);
  });

  it("transitions are conditional: claim queued→uploading wins once; advance from a wrong status returns null; markPublished moves sent→published and the video to 'published' in one transaction, and refuses a non-sent row; cancel works only from queued; a later run finishing (updateVideo status 'ready') does not downgrade a published video", async () => {
    await t.pool.query("UPDATE publications SET created_at = now() - interval '2 days'");
    const v = await video('Kalem geçiş');
    const p = await send(v);
    const id = p.kind === 'created' ? p.publication.id : '';
    const [c1, c2] = await Promise.all([claimPublication(t.pool, id), claimPublication(t.pool, id)]);
    expect([c1, c2].filter(Boolean)).toHaveLength(1);
    expect(await advancePublication(t.pool, id, ['queued'], { status: 'processing' })).toBeNull();
    expect(await advancePublication(t.pool, id, ['uploading'], { publishId: 'v_inbox_1' })).toMatchObject({ status: 'uploading', publishId: 'v_inbox_1' });
    expect(await markPublished(t.pool, id, { url: 'https://www.tiktok.com/@a/video/1', checklist: {} })).toBeNull();
    expect(await cancelPublication(t.pool, id)).toBeNull();
    await advancePublication(t.pool, id, ['uploading'], { status: 'sent', sentAt: new Date() });
    const m = await markPublished(t.pool, id, { url: 'https://www.tiktok.com/@a/video/1', checklist: { sound: true } });
    expect(m).toMatchObject({ status: 'published', url: 'https://www.tiktok.com/@a/video/1', checklist: { sound: true } });
    expect((await t.pool.query('SELECT status FROM videos WHERE id = $1', [v.videoId])).rows[0].status).toBe('published');
    await updateVideo(t.pool, v.videoId, { status: 'ready', statusNote: 'Yayına hazır' });
    expect((await t.pool.query('SELECT status, status_note FROM videos WHERE id = $1', [v.videoId])).rows[0]).toEqual({ status: 'published', status_note: 'Yayına hazır' });

    const q = await send(await video('Kalem iptal'));
    const qid = q.kind === 'created' ? q.publication.id : '';
    expect(await cancelPublication(t.pool, qid)).toMatchObject({ status: 'failed', errorCode: 'cancelled' });
    expect((await getPublication(t.pool, qid))!.failReason).toBe('Gönderim iptal edildi.');
  });

  it('claims snapshot and grants: inserted once per version and claim id; a replay changes nothing; listed in claim order; the app role gets permission denied on UPDATE/DELETE claims and DELETE publications', async () => {
    const v = await video('Kalem iddia');
    const claims = [
      { id: 'c2', text_tr: 'Mürekkep yağ bazlıdır', sources: [{ url: 'https://a.example/1' }] },
      { id: 'c1', text_tr: 'Bilye 0,7 mm', sources: [{ url: 'https://a.example/2' }] },
    ];
    const at = new Date('2026-10-08T10:00:00Z');
    expect(await snapshotClaims(t.pool, { videoId: v.videoId, versionId: v.versionId, claims, verifiedAt: at })).toBe(2);
    expect(await snapshotClaims(t.pool, { videoId: v.videoId, versionId: v.versionId, claims, verifiedAt: null })).toBe(0);
    const listed = await listClaims(t.pool, v.versionId);
    expect(listed.map((c) => [c.claimId, c.status, c.verifiedAt])).toEqual([['c2', 'verified', at.toISOString()], ['c1', 'verified', at.toISOString()]]);
    await expect(t.pool.query("UPDATE claims SET status = 'unverified'")).rejects.toThrow(/permission denied/);
    await expect(t.pool.query('DELETE FROM claims')).rejects.toThrow(/permission denied/);
    await expect(t.pool.query('DELETE FROM publications')).rejects.toThrow(/permission denied/);
  });
});
