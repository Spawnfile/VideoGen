import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
const H = { host: '127.0.0.1:5180' };

beforeAll(async () => {
  const dist = mkdtempSync(join(tmpdir(), 'vg-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>VideoGen</title>');
  writeFileSync(join(dist, 'sw.js'), 'self;');
  writeFileSync(join(dist, 'manifest.webmanifest'), '{"name":"VideoGen"}');
  writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'x');
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: dist } });
});
afterAll(async () => { await app.close(); await hub.stop(); await t.drop(); });

describe('app shell caching headers (an installed app must pick up a new build)', () => {
  it('serves the page, the service worker and the manifest uncached', async () => {
    for (const url of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/library/abc']) {
      const r = await app.inject({ url, headers: H });
      expect(r.statusCode, `${url} ${r.body.slice(0, 200)}`).toBe(200);
      expect(r.headers['cache-control'], url).toBe('no-cache');
    }
  });

  it('serves hashed build files as immutable for a year', async () => {
    const r = await app.inject({ url: '/assets/index-abc123.js', headers: H });
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('labels the manifest and lets the worker control the whole app', async () => {
    expect((await app.inject({ url: '/manifest.webmanifest', headers: H })).headers['content-type']).toMatch(/^application\/manifest\+json/);
    expect((await app.inject({ url: '/sw.js', headers: H })).headers['service-worker-allowed']).toBe('/');
  });
});
