import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../db/test/helpers.ts';
import {
  assertSafeBase, authorizeUrl, fakeClock, memoryRateGate, pgRateGate, pkce, publishOutcome, startTikTokMock, TikTokClient, TikTokError, TokenStore,
  type TikTokMock,
} from '../src/index.ts';
import { createHash } from 'node:crypto';

let t: Awaited<ReturnType<typeof createTestDb>>;
let mock: TikTokMock;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
afterEach(async () => { await mock?.stop(); });

async function setup(o: Parameters<typeof startTikTokMock>[0] = {}) {
  mock = await startTikTokMock(o);
  const clock = fakeClock();
  const tokens = new TokenStore({ dir: join(mkdtempSync(join(tmpdir(), 'vg-tt-')), 'secrets'), pool: t.pool, base: mock.base, clock });
  await tokens.writeClient({ clientKey: 'mockclientkey00001', clientSecret: 'mock-client-secret-0000000000001' });
  await tokens.write({ ...mock.tokens(), expiresAt: clock.now() + 86_400_000, refreshExpiresAt: clock.now() + 365 * 86_400_000, openId: 'oid', scope: 'video.upload', username: null });
  const client = new TikTokClient({ base: mock.base, tokens, gate: memoryRateGate({ perMinute: 6, clock }), clock });
  return { clock, tokens, client };
}

describe('TikTok client (plan M6 T3)', () => {
  it('inbox upload against the mock: creator_info, init with a single chunk (chunk_size = video_size, total_chunk_count 1), one PUT with Content-Range bytes 0-(n-1)/n and no Authorization header, status until SEND_TO_USER_INBOX', async () => {
    const { client } = await setup({ statusSequence: ['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX'] });
    expect(await client.creatorInfo()).toEqual({ username: 'whats.inside59', maxDurationS: 600, privacyOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'] });
    const file = Buffer.alloc(12345, 7);
    const init = await client.initInboxUpload(file.length);
    expect(init.publishId).toMatch(/^v_inbox_file~/);
    await client.upload(init.uploadUrl, file, 'video/mp4');
    const seen: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const s = await client.fetchStatus(init.publishId);
      seen.push(s.status);
      if (publishOutcome(s.status) !== 'pending') break;
    }
    expect(seen).toEqual(['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX']);
    const initReq = mock.requests.find((r) => r.path.endsWith('/inbox/video/init/'))!;
    expect(JSON.parse(initReq.body)).toEqual({ source_info: { source: 'FILE_UPLOAD', video_size: 12345, chunk_size: 12345, total_chunk_count: 1 } });
    expect(initReq.headers.authorization).toBe(`Bearer ${mock.tokens().accessToken}`);
    const puts = mock.requests.filter((r) => r.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]!.headers['content-range']).toBe('bytes 0-12344/12345');
    expect(puts[0]!.headers['content-type']).toBe('video/mp4');
    expect(puts[0]!.headers.authorization).toBeUndefined();
    expect(puts[0]!.bytes).toBe(12345);
  });

  it('errors: spam_risk_too_many_pending_share, FAILED and an HTTP 200 with an error envelope map to Turkish TikTokErrors carrying only code, HTTP status and log id; PROCESSING_DOWNLOAD keeps polling and PUBLISH_COMPLETE counts as sent; the access token appears in no error message or stack', async () => {
    const { client } = await setup({ failInit: 'spam_risk_too_many_pending_share', statusSequence: ['FAILED'] });
    const err = await client.initInboxUpload(100).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TikTokError);
    expect(err).toMatchObject({ code: 'spam_risk_too_many_pending_share', http: 200, logId: expect.stringMatching(/^mocklog/) });
    expect((err as Error).message).toBe("TikTok'ta bekleyen taslak sınırı doldu (24 saatte 5). Gelen kutusundaki taslakları paylaşın ya da silin, sonra yeniden deneyin.");
    const token = mock.tokens().accessToken;
    expect(`${(err as Error).message}\n${(err as Error).stack}\n${JSON.stringify(err)}`).not.toContain(token);
    expect(await client.fetchStatus('v_inbox_file~x')).toEqual({ status: 'FAILED', failReason: 'file_format_check_failed' });
    mock.set({ envelopeError: 'scope_not_authorized' });
    await expect(client.creatorInfo()).rejects.toMatchObject({ code: 'scope_not_authorized', http: 200 });
    expect(publishOutcome('PROCESSING_UPLOAD')).toBe('pending');
    expect(publishOutcome('PROCESSING_DOWNLOAD')).toBe('pending');
    expect(publishOutcome('SEND_TO_USER_INBOX')).toBe('sent');
    expect(publishOutcome('PUBLISH_COMPLETE')).toBe('sent');
    expect(publishOutcome('FAILED')).toBe('failed');
  });

  it('rate limiter: a seventh API call within a minute waits, also across two clients sharing pgRateGate (API + worker); the PUT is not counted; a 429 waits 60 s (fake clock) and retries once, except init which fails', async () => {
    const { client, clock } = await setup();
    const start = clock.now();
    for (let i = 0; i < 6; i += 1) await client.creatorInfo();
    expect(clock.now() - start).toBe(0);
    const up = await client.initInboxUpload(10); // 7th call
    expect(clock.now() - start).toBeGreaterThanOrEqual(60_000);
    const before = clock.now();
    await client.upload(up.uploadUrl, Buffer.alloc(10), 'video/mp4');
    expect(clock.now()).toBe(before);

    await mock.stop();
    const shared = await setup();
    await t.pool.query("DELETE FROM settings WHERE key = 'tiktok.calls'");
    const gateA = pgRateGate(t.pool, { perMinute: 6, clock: shared.clock });
    const gateB = pgRateGate(t.pool, { perMinute: 6, clock: shared.clock });
    const a = new TikTokClient({ base: mock.base, tokens: shared.tokens, gate: gateA, clock: shared.clock });
    const b = new TikTokClient({ base: mock.base, tokens: shared.tokens, gate: gateB, clock: shared.clock });
    const t0 = shared.clock.now();
    for (let i = 0; i < 4; i += 1) { await a.creatorInfo(); await b.creatorInfo(); }
    expect(shared.clock.now() - t0).toBeGreaterThanOrEqual(60_000);

    mock.set({ rateLimitOnce: true });
    const t1 = shared.clock.now();
    await expect(a.creatorInfo()).resolves.toMatchObject({ username: 'whats.inside59' });
    expect(shared.clock.now() - t1).toBeGreaterThanOrEqual(60_000);
    mock.set({ rateLimitOnce: true });
    await expect(a.initInboxUpload(10)).rejects.toMatchObject({ code: 'rate_limit_exceeded' });
  });

  it('assertSafeBase and PKCE: http is refused unless loopback; the upload URL must be https or loopback; challenge is the hex SHA-256 of a 43–128 char verifier; the authorize URL carries scopes, state and S256', async () => {
    expect(() => assertSafeBase('https://open.tiktokapis.com')).not.toThrow();
    expect(() => assertSafeBase('http://127.0.0.1:4000')).not.toThrow();
    expect(() => assertSafeBase('http://localhost:4000')).not.toThrow();
    expect(() => assertSafeBase('http://open.tiktokapis.com')).toThrow(/https/);
    expect(() => assertSafeBase('ftp://x')).toThrow();
    const { client } = await setup();
    mock.set({ uploadBase: 'http://upload.example.com' });
    await expect(client.initInboxUpload(10)).rejects.toThrow(/https/);
    const p = pkce();
    expect(p.verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(p.challenge).toBe(createHash('sha256').update(p.verifier).digest('hex'));
    expect(p.state).toMatch(/^[0-9a-f]{64}$/);
    expect(pkce().state).not.toBe(p.state);
    const u = new URL(authorizeUrl({ clientKey: 'ck', scopes: ['user.info.basic', 'video.upload'], redirectUri: 'http://localhost:3455/callback/', state: p.state, challenge: p.challenge }));
    expect(u.origin + u.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_key: 'ck', response_type: 'code', scope: 'user.info.basic,video.upload', redirect_uri: 'http://localhost:3455/callback/',
      state: p.state, code_challenge: p.challenge, code_challenge_method: 'S256',
    });
  });
});
