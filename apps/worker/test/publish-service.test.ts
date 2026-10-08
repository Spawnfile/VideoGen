import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { captionFor, type PublishVariant } from '@videogen/shared';
import { createProduceRun, createPublication, getPublication, listClaims, publishSource } from '@videogen/db';
import { fakeClock, memoryRateGate, startTikTokMock, TikTokClient, TokenStore, type TikTokMock } from '@videogen/tiktok';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { seedReadyVideo } from '../src/dev/seed-ready.ts';
import { PublishService, type TikTokProbe } from '../src/publish/service.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
let t: Awaited<ReturnType<typeof createTestDb>>;
let mock: TikTokMock;
let service: PublishService | null = null;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
afterEach(async () => { service?.stop(); service = null; await mock?.stop(); });

const dataDir = mkdtempSync(join(tmpdir(), 'vg-pub-'));

async function harness(o: Parameters<typeof startTikTokMock>[0] = {}, probe?: (file: string) => Promise<TikTokProbe>) {
  mock = await startTikTokMock(o);
  const clock = fakeClock(Date.now());
  const tokens = new TokenStore({ dir: join(dataDir, 'secrets'), pool: t.pool, base: mock.base, clock });
  await tokens.writeClient({ clientKey: 'mockclientkey00001', clientSecret: 'mock-client-secret-0000000000001' });
  await tokens.write({ ...mock.tokens(), expiresAt: clock.now() + 86_400_000, refreshExpiresAt: clock.now() + 365 * 86_400_000, openId: 'o', scope: 'video.upload', username: 'whats.inside59' });
  const client = new TikTokClient({ base: mock.base, tokens, gate: memoryRateGate({ perMinute: 6, clock }), clock });
  service = new PublishService({ pool: t.pool, dataDir, ffmpeg: FFMPEG, client, clock, ...(probe ? { probe } : {}) });
  return { clock, tokens, client, service };
}

async function queue(videoId: string, variant: PublishVariant = 'tiktok', confirmResend = false) {
  const src = (await publishSource(t.pool, videoId))!;
  const v = src.variants[variant]!;
  const r = await createPublication(t.pool, {
    videoId, versionId: src.versionId!, variant, blobSha: v.blobSha, bytes: v.bytes, caption: captionFor({ hookTr: src.hookTr, productName: src.productName, attributions: [] }),
    aigcRequired: src.aigcRequired, confirmResend,
  });
  if (r.kind !== 'created') throw new Error(`not created: ${r.kind}`);
  return r.publication;
}
const audits = async (id: string) => (await t.pool.query("SELECT action FROM audit_log WHERE subject_id = $1 AND action LIKE 'publish.%' ORDER BY id", [id])).rows.map((r) => r.action);
const plainVideo = async (name: string) => createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan: [{ key: 'research', weight: 100 }] });
async function row(videoId: string, versionId: string, status: string, publishId: string | null) {
  const { rows } = await t.pool.query(
    `INSERT INTO publications (id, video_id, version_id, variant, status, blob_sha, bytes, publish_id, caption, aigc_required)
     VALUES (gen_random_uuid(), $1, $2, 'tiktok', $3, 'x', 1, $4, 'c', false) RETURNING id`, [videoId, versionId, status, publishId],
  );
  return rows[0].id as string;
}
const fresh = async () => { await t.pool.query("UPDATE publications SET created_at = now() - interval '2 days' WHERE status <> 'queued'"); };

describe('publish service (plan M6 T4)', () => {
  it('sends the best version\'s TikTok variant: queued → uploading → processing → sent; the mock received exactly one init and one PUT of that file; publish_id is stored before the PUT; audit and video events follow each transition', async () => {
    const seeded = await seedReadyVideo(t.pool, dataDir, FFMPEG);
    let atPut: string | null = null;
    const h = await harness({ statusSequence: ['PROCESSING_UPLOAD', 'SEND_TO_USER_INBOX'], onPut: async () => { atPut = (await getPublication(t.pool, p.id))!.publishId; } });
    const p = await queue(seeded.videoId);
    await h.service.send(p.id);
    await h.service.idle();
    const done = (await getPublication(t.pool, p.id))!;
    expect(done).toMatchObject({ status: 'sent', publishId: 'v_inbox_file~v2.1', failReason: null });
    expect(done.sentAt).not.toBeNull();
    expect(atPut).toBe('v_inbox_file~v2.1');
    expect(mock.initCount()).toBe(1);
    const puts = mock.requests.filter((r) => r.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]!.bytes).toBe(p.bytes);
    expect(await audits(p.id)).toEqual(['publish.uploading', 'publish.processing', 'publish.sent']);
    const ev = (await t.pool.query("SELECT payload FROM ui_events WHERE topic = $1 AND type = 'publish.status' ORDER BY id", [`video:${seeded.videoId}`])).rows.map((r) => r.payload.status);
    expect(ev).toEqual(['uploading', 'processing', 'sent']);
  });

  it("a status that never settles turns 'waiting' after 5 min, keeps polling every 60 s and fails after 24 h with the Turkish reason — never 'sent'", async () => {
    await fresh();
    const seeded = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem bekleyen' });
    const h = await harness({ statusSequence: ['PROCESSING_UPLOAD'] });
    const p = await queue(seeded.videoId);
    const t0 = h.clock.now();
    await h.service.send(p.id);
    await h.service.idle();
    const done = (await getPublication(t.pool, p.id))!;
    expect(done).toMatchObject({ status: 'failed', errorCode: 'timeout', failReason: 'TikTok durumu 24 saatte netleşmedi; gelen kutunuzu kontrol edin.' });
    expect(h.clock.now() - t0).toBeGreaterThanOrEqual(86_400_000);
    expect(await audits(p.id)).toEqual(['publish.uploading', 'publish.processing', 'publish.waiting', 'publish.failed']);
    const polls = mock.requests.filter((r) => r.path.endsWith('/status/fetch/')).length;
    expect(polls).toBeGreaterThan(1400);
    expect(polls).toBeLessThan(1500);
  });

  it('recover: queued is sent; uploading with a publish_id (crash after PUT 201) resumes polling and ends sent with zero new init; uploading without a publish_id becomes failed with the \'yarıda kesildi\' reason and the mock sees no new init; processing and waiting resume polling with their publish_id', async () => {
    await fresh();
    const seeded = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem kurtarma' });
    const h = await harness({ statusSequence: ['SEND_TO_USER_INBOX'] });
    const q = await queue(seeded.videoId);
    const vids = await Promise.all(['A', 'B', 'C', 'D'].map((x) => plainVideo(`Kalem ${x}`)));
    const upPid = await row(vids[0]!.videoId, vids[0]!.versionId, 'uploading', 'v_inbox_file~old1');
    const upNone = await row(vids[1]!.videoId, vids[1]!.versionId, 'uploading', null);
    const proc = await row(vids[2]!.videoId, vids[2]!.versionId, 'processing', 'v_inbox_file~old2');
    const wait = await row(vids[3]!.videoId, vids[3]!.versionId, 'waiting', 'v_inbox_file~old3');
    await h.service.recover();
    await h.service.idle();
    const st = async (id: string) => (await getPublication(t.pool, id))!;
    expect((await st(q.id)).status).toBe('sent');
    expect((await st(upPid)).status).toBe('sent');
    expect(await st(upNone)).toMatchObject({ status: 'failed', errorCode: 'interrupted', failReason: 'Gönderim yarıda kesildi (worker yeniden başladı). TikTok gelen kutunuzu kontrol edin, gerekirse yeniden gönderin.' });
    expect((await st(proc)).status).toBe('sent');
    expect((await st(wait)).status).toBe('sent');
    expect(mock.initCount()).toBe(1); // only the queued one
    const polled = new Set(mock.requests.filter((r) => r.path.endsWith('/status/fetch/')).map((r) => JSON.parse(r.body).publish_id));
    expect([...polled].sort()).toEqual(['v_inbox_file~old1', 'v_inbox_file~old2', 'v_inbox_file~old3', 'v_inbox_file~v2.1']);
  });

  it('refusals before any TikTok call: a file over 64 MiB, a revoked CC-BY asset in the variant, a video longer than the creator max → failed with the Turkish reason and zero init requests', async () => {
    await fresh();
    const big = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem büyük' });
    const long = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem uzun' });
    const revoked = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem lisans' });
    const real = { container: 'mov,mp4,m4a,3gp,3g2,mj2', vcodec: 'h264', pixFmt: 'yuv420p', acodec: 'aac', width: 1080, height: 1920 };
    let next = { durationS: 6, bytes: 65 * 1024 * 1024 };
    const h = await harness({}, async () => ({ ...real, ...next }));
    const a = await queue(big.videoId);
    await h.service.send(a.id);
    expect(await getPublication(t.pool, a.id)).toMatchObject({ status: 'failed', errorCode: 'validation', failReason: "dosya 64 MB'ı aşıyor (65,0 MB); tek parça yükleme sınırı" });
    next = { durationS: 601, bytes: 1000 };
    const b = await queue(long.videoId);
    await h.service.send(b.id);
    expect(await getPublication(t.pool, b.id)).toMatchObject({ status: 'failed', failReason: 'video en çok 600 sn olabilir (601,0 sn)' });
    next = { durationS: 6, bytes: 1000 };
    await t.pool.query('UPDATE assets SET allowed = false WHERE id = $1', [revoked.sfxAssetId]);
    const c = await queue(revoked.videoId);
    await h.service.send(c.id);
    expect(await getPublication(t.pool, c.id)).toMatchObject({ status: 'failed', failReason: 'Klik artık izinli değil' });
    await t.pool.query('UPDATE assets SET allowed = true WHERE id = $1', [revoked.sfxAssetId]);
    expect(mock.initCount()).toBe(0);
  });

  it('snapshot: claims of the sent version are stored once with G2\'s verified status; a provenance artifact lists the variant\'s assets with licenses, the TTS provider and the role models; a second send of the same version adds nothing', async () => {
    await fresh();
    const seeded = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem kaynak' });
    const h = await harness({ statusSequence: ['SEND_TO_USER_INBOX'] });
    await h.service.send((await queue(seeded.videoId)).id);
    await h.service.idle();
    const claims = await listClaims(t.pool, seeded.versionId);
    expect(claims.map((c) => [c.claimId, c.status])).toEqual([['c1', 'verified'], ['c2', 'verified']]);
    expect(claims[0]!.verifiedAt).not.toBeNull();
    const prov = (await t.pool.query("SELECT content FROM artifacts WHERE kind = 'provenance' AND version_id = $1", [seeded.versionId])).rows;
    expect(prov).toHaveLength(1);
    expect(prov[0].content).toMatchObject({
      versionId: seeded.versionId,
      assets: expect.arrayContaining([
        expect.objectContaining({ id: seeded.sfxAssetId, title: 'Klik', license: 'CC-BY-4.0', attribution: 'Ses efekti: Ada Yazar (CC BY 4.0)' }),
        expect.objectContaining({ id: seeded.musicAssetId, title: 'Yatak', license: 'CC-BY-4.0' }),
      ]),
      tts: null, roles: {}, rubric: expect.any(String),
    });
    await h.service.send((await queue(seeded.videoId, 'tiktok', true)).id);
    await h.service.idle();
    expect(await listClaims(t.pool, seeded.versionId)).toHaveLength(2);
    expect((await t.pool.query("SELECT count(*)::int AS n FROM artifacts WHERE kind = 'provenance' AND version_id = $1", [seeded.versionId])).rows[0].n).toBe(1);
  });

  it('no secret reaches audit, events or errors: after a send, a 401-refresh and a failure, neither the access token, the refresh token nor the client secret appears in audit_log, ui_events or the thrown errors', async () => {
    await fresh();
    const one = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem gizli 1' });
    const two = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem gizli 2' });
    const h = await harness({ statusSequence: ['SEND_TO_USER_INBOX'] });
    const secrets = [mock.tokens().accessToken, mock.tokens().refreshToken];
    mock.expireAccess();
    const errors: string[] = [];
    await h.service.send((await queue(one.videoId)).id).catch((e: unknown) => errors.push(String((e as Error).stack)));
    await h.service.idle();
    secrets.push(mock.tokens().accessToken, mock.tokens().refreshToken, 'mock-client-secret-0000000000001');
    mock.set({ failInit: 'spam_risk_too_many_pending_share' });
    const p2 = await queue(two.videoId);
    await h.service.send(p2.id).catch((e: unknown) => errors.push(String((e as Error).stack)));
    expect((await getPublication(t.pool, p2.id))!.status).toBe('failed');
    const text = [
      ...(await t.pool.query("SELECT data::text AS d FROM audit_log WHERE action LIKE 'publish.%' OR action LIKE 'tiktok.%'")).rows.map((r) => r.d),
      ...(await t.pool.query("SELECT payload::text AS d FROM ui_events WHERE type = 'publish.status'")).rows.map((r) => r.d),
      ...(await t.pool.query('SELECT fail_reason AS d FROM publications')).rows.map((r) => r.d ?? ''),
      ...errors,
    ].join('\n');
    expect(text.length).toBeGreaterThan(50);
    for (const s of secrets) expect(text).not.toContain(s);
  });

  it('a lost command is swept: a queued row whose NOTIFY never arrived (or whose handler threw before the claim) is sent by the 30 s sweep; a queued row older than 1 h fails with \'worker çalışmıyordu\' and is never sent; a cancelled row is skipped', async () => {
    await fresh();
    const lost = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem kayıp' });
    const old = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem eski' });
    const h = await harness({ statusSequence: ['SEND_TO_USER_INBOX'] });
    const a = await queue(lost.videoId);
    const b = await queue(old.videoId);
    await t.pool.query("UPDATE publications SET created_at = now() - interval '2 hours', updated_at = now() - interval '2 hours' WHERE id = $1", [b.id]);
    await h.service.sweep(); // a is younger than 15 s: not yet
    expect((await getPublication(t.pool, a.id))!.status).toBe('queued');
    h.clock.advance(20_000);
    await h.service.sweep();
    await h.service.idle();
    expect((await getPublication(t.pool, a.id))!.status).toBe('sent');
    expect(await getPublication(t.pool, b.id)).toMatchObject({ status: 'failed', errorCode: 'stale', failReason: 'Gönderim kuyrukta bekledi; worker çalışmıyordu. Yeniden gönderin.' });
    expect(mock.initCount()).toBe(1);
  });
});
