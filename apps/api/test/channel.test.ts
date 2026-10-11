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
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent' } });
});
afterAll(async () => { await app.close(); await hub.stop(); await t.drop(); });

describe('channel style (spec Z2)', () => {
  it('the K19 style choice is gone: no /api/channel-style', async () => {
    expect((await app.inject({ url: '/api/channel-style', headers: H })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/api/channel-style', headers: H, payload: { id: 'atolye' } })).statusCode).toBe(404);
  });
});
