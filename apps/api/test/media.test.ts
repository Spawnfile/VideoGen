import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { insertBlob } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
const dataDir = mkdtempSync(join(tmpdir(), 'vg-media-'));
const H = { host: '127.0.0.1:5180' };
const SHA = 'ab'.repeat(32);
const REL = join('media', 'sha256', 'ab', 'ab', `${SHA}.mp4`);

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', dataDir } });
  mkdirSync(join(dataDir, 'media', 'sha256', 'ab', 'ab'), { recursive: true });
  writeFileSync(join(dataDir, REL), Buffer.from('0123456789'));
  await insertBlob(t.pool, { sha256: SHA, path: REL, bytes: 10, mime: 'video/mp4' });
});
afterAll(async () => { await app.close(); await hub.stop(); await t.drop(); rmSync(dataDir, { recursive: true, force: true }); });

describe('media', () => {
  it('serves a stored blob with HTTP Range and an immutable cache; unknown, malformed or missing files are refused', async () => {
    const full = await app.inject({ url: `/api/blobs/${SHA}`, headers: H });
    expect(full.statusCode).toBe(200);
    expect(full.body).toBe('0123456789');
    expect(full.headers['content-type']).toBe('video/mp4');
    expect(full.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(full.headers['accept-ranges']).toBe('bytes');
    const part = await app.inject({ url: `/api/blobs/${SHA}`, headers: { ...H, range: 'bytes=2-5' } });
    expect(part.statusCode).toBe(206);
    expect(part.body).toBe('2345');
    expect(part.headers['content-range']).toBe('bytes 2-5/10');
    expect((await app.inject({ url: '/api/blobs/../../etc/passwd', headers: H })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/blobs/xyz', headers: H })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/blobs/${'cd'.repeat(32)}`, headers: H })).statusCode).toBe(404);
    await insertBlob(t.pool, { sha256: 'ef'.repeat(32), path: 'media/sha256/ef/ef/gone.mp4', bytes: 1, mime: 'video/mp4' });
    expect((await app.inject({ url: `/api/blobs/${'ef'.repeat(32)}`, headers: H })).statusCode).toBe(404);
  });
});
