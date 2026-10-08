import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../db/test/helpers.ts';
import { fakeClock, memoryRateGate, startTikTokMock, TikTokClient, TokenStore, type TikTokMock } from '../src/index.ts';

const POSTER = resolve(import.meta.dirname, '../../../tests/fixtures/tiktok/poster');

let t: Awaited<ReturnType<typeof createTestDb>>;
let mock: TikTokMock;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });
afterEach(async () => { await mock?.stop(); });

const dirOf = () => join(mkdtempSync(join(tmpdir(), 'vg-tt-')), 'secrets');
const mode = (p: string) => statSync(p).mode & 0o777;

describe('TikTok token store (plan M6 T3)', () => {
  it('TokenStore: files are written atomically with mode 0600 in a 0700 dir; status() exposes no secret; importFrom copies .env + tokens.json (fixture with TikTok OAuth field names), writes ours before renaming the source, refreshes at once when no absolute expiry is known; concurrent writers (two stores, one pool) never leave a torn file', async () => {
    mock = await startTikTokMock({ acceptRefresh: 'rft.poster.fixture' });
    const clock = fakeClock();
    const dir = dirOf();
    const store = new TokenStore({ dir, pool: t.pool, base: mock.base, clock });
    expect(await store.status()).toEqual({ connected: false, username: null, expiresAt: null, refreshExpiresAt: null, scopes: [], clientConfigured: false });

    const poster = mkdtempSync(join(tmpdir(), 'vg-poster-'));
    cpSync(POSTER, poster, { recursive: true });
    const client = new TikTokClient({ base: mock.base, tokens: store, gate: memoryRateGate({ perMinute: 6, clock }), clock });
    const r = await store.importFrom(poster, async () => (await client.creatorInfo()).username);
    expect(r).toEqual({ username: 'whats.inside59' });
    expect(mode(dir)).toBe(0o700);
    expect(mode(join(dir, 'tiktok-tokens.json'))).toBe(0o600);
    expect(mode(join(dir, 'tiktok-client.json'))).toBe(0o600);
    expect(existsSync(join(poster, 'tokens.json'))).toBe(false);
    expect(readdirSync(poster).some((f) => /^tokens\.videogen-tasindi-\d{8}\.json$/.test(f))).toBe(true);
    // No absolute expiry in the poster file: the access token counted as expired and was rotated at once.
    expect(mock.requests.filter((q) => q.path === '/v2/oauth/token/' && q.body.includes('grant_type=refresh_token'))).toHaveLength(1);
    const saved = JSON.parse(readFileSync(join(dir, 'tiktok-tokens.json'), 'utf8'));
    expect(saved.refresh_token).toBe(mock.tokens().refreshToken);
    expect(saved.refresh_token).not.toBe('rft.poster.fixture');
    const st = await store.status();
    expect(st).toMatchObject({ connected: true, username: 'whats.inside59', scopes: ['user.info.basic', 'video.publish', 'video.upload'], clientConfigured: true });
    const shown = JSON.stringify(st);
    for (const secret of [mock.tokens().accessToken, mock.tokens().refreshToken, 'mock-client-secret-0000000000001']) expect(shown).not.toContain(secret);

    const bad = mkdtempSync(join(tmpdir(), 'vg-poster-bad-'));
    cpSync(POSTER, bad, { recursive: true });
    const env = readFileSync(join(bad, '.env'), 'utf8').replace('mock-client-secret-0000000000001', 'short');
    (await import('node:fs')).writeFileSync(join(bad, '.env'), env);
    await expect(new TokenStore({ dir: dirOf(), pool: t.pool, base: mock.base, clock }).importFrom(bad, async () => 'x')).rejects.toThrow('TIKTOK_CLIENT_SECRET 32 karakter olmalı');
    expect(existsSync(join(bad, 'tokens.json'))).toBe(true);

    const a = new TokenStore({ dir, pool: t.pool, base: mock.base, clock });
    const b = new TokenStore({ dir, pool: t.pool, base: mock.base, clock });
    const base = { expiresAt: 1, refreshExpiresAt: 2, openId: 'o', scope: 's', username: null };
    await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).write({ ...base, accessToken: `A${i}`.repeat(200), refreshToken: `R${i}` })));
    const final = JSON.parse(readFileSync(join(dir, 'tiktok-tokens.json'), 'utf8'));
    expect(final.access_token).toBe(`A${final.refresh_token.slice(1)}`.repeat(200));
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('refresh: a token expiring within 10 min is refreshed once for two concurrent callers and the new refresh token is stored; a 401 refreshes once and repeats the same call; a dead refresh token raises the Turkish reconnect message', async () => {
    mock = await startTikTokMock();
    const clock = fakeClock();
    const dir = dirOf();
    const one = new TokenStore({ dir, pool: t.pool, base: mock.base, clock });
    const two = new TokenStore({ dir, pool: t.pool, base: mock.base, clock });
    await one.writeClient({ clientKey: 'mockclientkey00001', clientSecret: 'mock-client-secret-0000000000001' });
    await one.write({ ...mock.tokens(), expiresAt: clock.now() + 5 * 60_000, refreshExpiresAt: clock.now() + 365 * 86_400_000, openId: 'o', scope: 'video.upload', username: 'u' });
    const [x, y] = await Promise.all([one.accessToken(), two.accessToken()]);
    const refreshes = () => mock.requests.filter((q) => q.path === '/v2/oauth/token/').length;
    expect(refreshes()).toBe(1);
    expect(x).toBe(y);
    expect(x).toBe(mock.tokens().accessToken);
    expect(JSON.parse(readFileSync(join(dir, 'tiktok-tokens.json'), 'utf8')).refresh_token).toBe(mock.tokens().refreshToken);

    const client = new TikTokClient({ base: mock.base, tokens: one, gate: memoryRateGate({ perMinute: 60, clock }), clock });
    mock.expireAccess();
    await expect(client.creatorInfo()).resolves.toMatchObject({ username: 'whats.inside59' });
    expect(refreshes()).toBe(2);
    expect(mock.requests.filter((q) => q.path.endsWith('/creator_info/query/'))).toHaveLength(2);

    mock.expireAccess();
    mock.revokeRefresh();
    await expect(client.creatorInfo()).rejects.toMatchObject({
      code: 'reconnect_required',
      message: 'TikTok bağlantısının yenilenmesi gerekiyor: Ayarlar → TikTok bağlantısı → Yeniden bağlan.',
    });
  });
});
