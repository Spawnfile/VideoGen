import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { startTikTokMock, TokenStore, type TikTokMock } from '@videogen/tiktok';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const POSTER = join(ROOT, 'tests/fixtures/tiktok/poster');
const H = { host: '127.0.0.1:5180' };
const CLIENT = { clientKey: 'mockclientkey00001', clientSecret: 'mock-client-secret-0000000000001' };

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let mock: TikTokMock;
let app: Awaited<ReturnType<typeof buildApp>> | null = null;
beforeAll(async () => { t = await createTestDb(); hub = new EventHub(t.pool, t.appUrl); await hub.start(); mock = await startTikTokMock(); });
afterAll(async () => { await mock.stop(); await hub.stop(); await t.drop(); });
afterEach(async () => { await app?.close(); app = null; });

async function boot(o: { connectTtlMs?: number } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'vg-api-tt-'));
  const config = { ...loadConfig(), webDist: '/nonexistent', dataDir, tiktok: { base: mock.base, pollMs: 10, ratePerMinute: 600, callbackPort: 0 } };
  app = await buildApp({ pool: t.pool, hub, config, ...(o.connectTtlMs ? { tiktokConnectTtlMs: o.connectTtlMs } : {}) });
  const store = new TokenStore({ dir: join(dataDir, 'secrets'), pool: t.pool, base: mock.base });
  return { dataDir, store };
}
const secretsOf = () => [mock.tokens().accessToken, mock.tokens().refreshToken, CLIENT.clientSecret];

describe('TikTok connection (plan M6 T5)', () => {
  it('connect: the authorize URL carries the client key, scopes, a fresh state and the hex S256 challenge; the callback with that state stores tokens (0600) and audits tiktok.connected with the username only; a wrong state is refused and stores nothing; the listener closes after one callback or 5 min', async () => {
    const { dataDir, store } = await boot();
    expect((await app!.inject({ method: 'POST', url: '/api/tiktok/connect', headers: H })).json()).toEqual({ error: 'İstemci bilgisi yok: önce `node bin/tiktok.mjs import` çalıştırın.' });
    await store.writeClient(CLIENT);
    const r = await app!.inject({ method: 'POST', url: '/api/tiktok/connect', headers: H });
    expect(r.statusCode).toBe(200);
    const u = new URL(r.json().authorizeUrl);
    expect(u.origin + u.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    const q = Object.fromEntries(u.searchParams);
    expect(q).toMatchObject({ client_key: CLIENT.clientKey, response_type: 'code', scope: 'user.info.basic,video.publish,video.upload', code_challenge_method: 'S256' });
    expect(q.code_challenge).toMatch(/^[0-9a-f]{64}$/);
    expect(q.state).toMatch(/^[0-9a-f]{64}$/);
    const again = (await app!.inject({ method: 'POST', url: '/api/tiktok/connect', headers: H })).json();
    expect(new URL(again.authorizeUrl).searchParams.get('state')).toBe(q.state); // one flow at a time
    const cb = new URL(q.redirect_uri!);
    expect(cb.pathname).toBe('/callback/');
    const callback = (query: string) => fetch(`http://127.0.0.1:${cb.port}${cb.pathname}?${query}`);
    expect((await fetch(`http://127.0.0.1:${cb.port}/favicon.ico`)).status).toBe(404);
    const bad = await callback(`code=mock-code&state=${'0'.repeat(64)}`);
    expect(bad.status).toBe(400);
    expect(existsSync(join(dataDir, 'secrets', 'tiktok-tokens.json'))).toBe(false);
    const ok = await callback(`code=mock-code&state=${q.state}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('Bağlandı, bu sekmeyi kapatabilirsiniz');
    expect(statSync(join(dataDir, 'secrets', 'tiktok-tokens.json')).mode & 0o777).toBe(0o600);
    expect(await store.status()).toMatchObject({ connected: true, username: 'whats.inside59' });
    const audit = (await t.pool.query("SELECT data FROM audit_log WHERE action = 'tiktok.connected' ORDER BY id DESC LIMIT 1")).rows[0].data;
    expect(audit).toEqual({ username: 'whats.inside59', scopes: ['user.info.basic', 'video.publish', 'video.upload'], via: 'pkce' });
    await expect(callback(`code=mock-code&state=${q.state}`)).rejects.toThrow(); // closed after one callback

    await app!.close();
    app = null;
    const short = await boot({ connectTtlMs: 150 });
    await short.store.writeClient(CLIENT);
    const s = new URL(new URL((await app!.inject({ method: 'POST', url: '/api/tiktok/connect', headers: H })).json().authorizeUrl).searchParams.get('redirect_uri')!);
    await new Promise((r) => setTimeout(r, 300));
    await expect(fetch(`http://127.0.0.1:${s.port}/callback/?code=x&state=y`)).rejects.toThrow();
  });

  it('GET /api/tiktok never returns a token: connected, username, expiry and scopes only; without client credentials it says clientConfigured false', async () => {
    const { store } = await boot();
    expect((await app!.inject({ url: '/api/tiktok', headers: H })).json()).toEqual({ connected: false, username: null, expiresAt: null, refreshExpiresAt: null, scopes: [], clientConfigured: false });
    await store.writeClient(CLIENT);
    await store.write({ ...mock.tokens(), expiresAt: Date.now() + 3_600_000, refreshExpiresAt: Date.now() + 86_400_000, openId: 'o', scope: 'video.upload,user.info.basic', username: 'whats.inside59' });
    const res = await app!.inject({ url: '/api/tiktok', headers: H });
    expect(res.json()).toMatchObject({ connected: true, username: 'whats.inside59', scopes: ['user.info.basic', 'video.upload'], clientConfigured: true });
    for (const s of secretsOf()) expect(res.body).not.toContain(s);
  });

  it('POST /api/tiktok/test returns the creator summary; an expired refresh token gives the Turkish reconnect message; a non-local Origin is refused', async () => {
    const { store } = await boot();
    await store.writeClient(CLIENT);
    await store.write({ ...mock.tokens(), expiresAt: Date.now() + 3_600_000, refreshExpiresAt: Date.now() + 86_400_000, openId: 'o', scope: 'video.upload', username: null });
    const ok = await app!.inject({ method: 'POST', url: '/api/tiktok/test', headers: H });
    expect(ok.json()).toEqual({ username: 'whats.inside59', maxDurationS: 600, privacyOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'] });
    expect((await app!.inject({ method: 'POST', url: '/api/tiktok/test', headers: { ...H, origin: 'https://evil.example' } })).statusCode).toBe(403);
    await store.write({ ...mock.tokens(), expiresAt: Date.now() - 1000, refreshExpiresAt: Date.now() - 1000, openId: 'o', scope: 'video.upload', username: null });
    const dead = await app!.inject({ method: 'POST', url: '/api/tiktok/test', headers: H });
    expect(dead.statusCode).toBe(409);
    expect(dead.json()).toEqual({ error: 'TikTok bağlantısının yenilenmesi gerekiyor: Ayarlar → TikTok bağlantısı → Yeniden bağlan.', code: 'reconnect_required' });
  });

  it('bin/tiktok.mjs import: imports from a fixture poster dir, verifies with user/info, renames tokens.json, prints no secret; a short secret is refused', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'vg-cli-tt-'));
    const run = (poster: string) => new Promise<{ code: number; out: string }>((done) => {
      execFile(process.execPath, [join(ROOT, 'bin/tiktok.mjs'), 'import', '--from', poster], {
        cwd: ROOT, timeout: 15_000,
        env: { ...process.env, VG_DATA_DIR: dataDir, VG_TIKTOK_BASE: mock.base, VG_TIKTOK_RATE_PER_MIN: '600', VG_DATABASE_URL: t.appUrl, VG_ADMIN_DATABASE_URL: t.adminUrl },
      }, (err, stdout, stderr) => done({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, out: `${stdout}${stderr}` }));
    });
    const poster = mkdtempSync(join(tmpdir(), 'vg-poster-'));
    cpSync(POSTER, poster, { recursive: true });
    // The mock rotates refresh tokens: start it from the fixture's.
    await mock.stop();
    mock = await startTikTokMock({ acceptRefresh: 'rft.poster.fixture' });
    const r = await run(poster);
    expect(r.out, r.out).toContain('Bağlandı: @whats.inside59');
    expect(r.code).toBe(0);
    expect(readdirSync(poster).some((f) => f.startsWith('tokens.videogen-tasindi-'))).toBe(true);
    expect(existsSync(join(poster, 'tokens.json'))).toBe(false);
    for (const s of [...secretsOf(), 'rft.poster.fixture', 'act.poster.fixture']) expect(r.out).not.toContain(s);
    expect((await t.pool.query("SELECT data FROM audit_log WHERE action = 'tiktok.connected' ORDER BY id DESC LIMIT 1")).rows[0].data).toMatchObject({ username: 'whats.inside59', via: 'import' });

    const bad = mkdtempSync(join(tmpdir(), 'vg-poster-bad-'));
    cpSync(POSTER, bad, { recursive: true });
    writeFileSync(join(bad, '.env'), readFileSync(join(bad, '.env'), 'utf8').replace('mock-client-secret-0000000000001', 'short'));
    const b = await run(bad);
    expect(b.code).not.toBe(0);
    expect(b.out).toContain('TIKTOK_CLIENT_SECRET 32 karakter olmalı');
    expect(b.out).not.toContain('short');
  });
});
