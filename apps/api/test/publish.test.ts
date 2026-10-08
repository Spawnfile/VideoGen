import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { TokenStore } from '@videogen/tiktok';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { seedReadyVideo } from '../../worker/src/dev/seed-ready.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

const FFMPEG = process.env.VG_FFMPEG ?? 'ffmpeg';
const H = { host: '127.0.0.1:5180' };
const URL_OK = 'https://www.tiktok.com/@whats.inside59/video/7423456789012345678';
let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
let listener: pg.Client;
const commands: Record<string, unknown>[] = [];
const dataDir = mkdtempSync(join(tmpdir(), 'vg-api-pub-'));

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  const config = { ...loadConfig(), webDist: '/nonexistent', dataDir, tiktok: { base: 'http://127.0.0.1:9', pollMs: 10, ratePerMinute: 600, callbackPort: 0 } };
  app = await buildApp({ pool: t.pool, hub, config });
  listener = new pg.Client({ connectionString: t.appUrl });
  await listener.connect();
  listener.on('notification', (n) => commands.push(JSON.parse(n.payload!)));
  await listener.query('LISTEN vg_commands');
});
afterAll(async () => { await listener.end(); await app.close(); await hub.stop(); await t.drop(); });

const store = () => new TokenStore({ dir: join(dataDir, 'secrets'), pool: t.pool, base: 'http://127.0.0.1:9' });
async function connect() {
  const s = store();
  await s.writeClient({ clientKey: 'mockclientkey00001', clientSecret: 'mock-client-secret-0000000000001' });
  await s.write({ accessToken: 'act.x', refreshToken: 'rft.x', expiresAt: Date.now() + 3_600_000, refreshExpiresAt: Date.now() + 86_400_000, openId: 'o', scope: 'video.upload', username: 'whats.inside59' });
}
const post = (url: string, payload: object = {}) => app.inject({ method: 'POST', url, headers: H, payload });
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('publish endpoints (plan M6 T6)', () => {
  it('publish queues a TikTok draft for a ready video and notifies the worker; a double click returns the same publication; the sixth send in 24 h is 409 with the next slot; a needs_human video or a missing TikTok connection is refused with a Turkish reason', async () => {
    const v = await seedReadyVideo(t.pool, dataDir, FFMPEG);
    expect((await post(`/api/videos/${v.videoId}/publish`, { variant: 'tiktok' })).json()).toEqual({ error: 'TikTok bağlı değil: Ayarlar → TikTok bağlantısı.' });
    await connect();
    const first = await post(`/api/videos/${v.videoId}/publish`, { variant: 'tiktok' });
    expect(first.statusCode).toBe(202);
    const pub = first.json().publication;
    expect(pub).toMatchObject({ status: 'queued', variant: 'tiktok', versionId: v.versionId, blobSha: v.tiktokSha, aigcRequired: false });
    await settle();
    expect(commands).toContainEqual({ type: 'publish.send', publicationId: pub.id });
    expect((await post(`/api/videos/${v.videoId}/publish`, { variant: 'tiktok' })).json().publication.id).toBe(pub.id);

    const nh = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem insan' });
    await t.pool.query("UPDATE videos SET status = 'needs_human' WHERE id = $1", [nh.videoId]);
    expect((await post(`/api/videos/${nh.videoId}/publish`, { variant: 'tiktok' })).json()).toEqual({ error: "Yayın yalnızca 'Yayına hazır' videolar için." });

    const more = await Promise.all(['B', 'C', 'D', 'E', 'F'].map((x) => seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: `Kalem ${x}` })));
    for (const m of more.slice(0, 4)) expect((await post(`/api/videos/${m.videoId}/publish`, { variant: 'tiktok' })).statusCode).toBe(202);
    const sixth = await post(`/api/videos/${more[4]!.videoId}/publish`, { variant: 'tiktok' });
    expect(sixth.statusCode).toBe(409);
    expect(sixth.json().error).toMatch(/^Son 24 saatte 5 taslak gönderildi; bir sonraki gönderim \d{2}:\d{2}'(de|da|te|ta) açılır\.$/);
    expect(new Date(sixth.json().nextSlot).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    await t.pool.query("UPDATE publications SET status = 'failed', created_at = now() - interval '2 days'");
  });

  it("GET publish lists the variants, the draft count, the caption with the music variant's attribution only for 'music', the checklist with aigc required when the finish says so, and the claims of the best version", async () => {
    await connect();
    const v = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem görünüm', aigcLabel: true });
    const g = (await app.inject({ url: `/api/videos/${v.videoId}/publish`, headers: H })).json();
    expect(g).toMatchObject({
      eligible: true, blockers: [], draftsUsed: 0, draftLimit: 5, nextSlot: null, aigcRequired: true, connected: true,
      variants: { tiktok: { sha: v.tiktokSha, durationS: 6 }, music: { sha: v.musicSha } },
      attributions: { tiktok: ['Ses efekti: Ada Yazar (CC BY 4.0)'], music: ['Ses efekti: Ada Yazar (CC BY 4.0)', 'Müzik: Bora Besteci (CC BY 4.0)'] },
    });
    expect(g.captions.tiktok).not.toContain('Bora Besteci');
    expect(g.captions.music).toContain('Müzik: Bora Besteci (CC BY 4.0)');
    expect(g.captions.tiktok.split('\n')[0]).toBe('Bu kalemin içinde 7 parça var');
    expect(g.checklist.tiktok.find((i: { id: string }) => i.id === 'aigc')).toMatchObject({ required: true });
    expect(g.claims.map((c: { id: string }) => c.id)).toEqual(['c1', 'c2']);
    expect(g.publications).toEqual([]);
    await t.pool.query('UPDATE assets SET allowed = false WHERE id = $1', [v.musicAssetId]);
    const blocked = (await app.inject({ url: `/api/videos/${v.videoId}/publish`, headers: H })).json();
    expect(blocked.variantBlockers.music).toEqual(['Yatak artık izinli değil']);
    expect(blocked.variantBlockers.tiktok).toEqual([]);
    await t.pool.query('UPDATE assets SET allowed = true WHERE id = $1', [v.musicAssetId]);
  });

  it('mark and cancel: mark is refused without the required ticks or with a non-TikTok URL; accepted → publication \'published\', video \'published\', audit publish.marked with the URL; cancel works from queued only; a caption without the CC-BY line gets it re-appended', async () => {
    await connect();
    const v = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Kalem işaret' });
    const q = await post(`/api/videos/${v.videoId}/publish`, { variant: 'music', caption: 'Kendi açıklamam' });
    const pub = q.json().publication;
    expect(pub.caption).toBe('Kendi açıklamam\n\nSes efekti: Ada Yazar (CC BY 4.0)\nMüzik: Bora Besteci (CC BY 4.0)');
    expect((await post(`/api/publications/${pub.id}/mark`, { url: URL_OK, checklist: { visibility: true, commercial: true } })).json()).toEqual({ error: 'Yalnızca gelen kutusuna ulaşmış bir taslak yayınlandı olarak işaretlenebilir.' });
    expect((await post(`/api/publications/${pub.id}/cancel`)).json()).toMatchObject({ publication: { status: 'failed', errorCode: 'cancelled' } });
    expect((await post(`/api/publications/${pub.id}/cancel`)).statusCode).toBe(409);

    const s = (await post(`/api/videos/${v.videoId}/publish`, { variant: 'tiktok' })).json().publication;
    await t.pool.query("UPDATE publications SET status = 'sent', publish_id = 'p', sent_at = now() WHERE id = $1", [s.id]);
    expect((await post(`/api/publications/${s.id}/mark`, { url: URL_OK, checklist: { visibility: true, commercial: true } })).json()).toEqual({ error: 'işaretlenmemiş zorunlu madde: Uygulamadan ses ekle' });
    expect((await post(`/api/publications/${s.id}/mark`, { url: 'https://example.com/v/1', checklist: { sound: true, visibility: true, commercial: true } })).json()).toEqual({ error: 'geçerli bir TikTok video bağlantısı girin' });
    const ok = await post(`/api/publications/${s.id}/mark`, { url: URL_OK, checklist: { sound: true, visibility: true, commercial: true } });
    expect(ok.json().publication).toMatchObject({ status: 'published', url: URL_OK });
    expect((await t.pool.query('SELECT status FROM videos WHERE id = $1', [v.videoId])).rows[0].status).toBe('published');
    expect((await t.pool.query("SELECT data FROM audit_log WHERE action = 'publish.marked' ORDER BY id DESC LIMIT 1")).rows[0].data).toMatchObject({ url: URL_OK, publicationId: s.id });
    const again = await post(`/api/videos/${v.videoId}/publish`, { variant: 'tiktok' });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'Bu sürüm zaten taslak olarak gönderildi.', confirmResend: true });
    expect((await post(`/api/videos/${v.videoId}/publish`, { variant: 'tiktok', confirmResend: true })).statusCode).toBe(202);
  });

  it('Shorts export returns the music final with a safe download name and its attribution caption, audited; /api/blobs ?download sets Content-Disposition and rejects an unsafe name', async () => {
    const v = await seedReadyVideo(t.pool, dataDir, FFMPEG, { productName: 'Çaydanlık Şişe' });
    const r = (await post(`/api/videos/${v.videoId}/exports/shorts`)).json();
    expect(r.url).toBe(`/api/blobs/${v.musicSha}?download=caydanlik-sise-shorts.mp4`);
    expect(r.caption).toContain('Müzik: Bora Besteci (CC BY 4.0)');
    expect((await t.pool.query("SELECT data FROM audit_log WHERE action = 'export.shorts' ORDER BY id DESC LIMIT 1")).rows[0].data).toMatchObject({ videoId: v.videoId, versionId: v.versionId, sha: v.musicSha });
    const dl = await app.inject({ url: r.url, headers: H });
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-disposition']).toBe('attachment; filename="caydanlik-sise-shorts.mp4"');
    expect(dl.headers['content-type']).toBe('video/mp4');
    for (const bad of ['../x.mp4', 'a"b.mp4', 'x.exe', `${'a'.repeat(90)}.mp4`]) {
      expect((await app.inject({ url: `/api/blobs/${v.musicSha}?download=${encodeURIComponent(bad)}`, headers: H })).statusCode, bad).toBe(400);
    }
  });
});
