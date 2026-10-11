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

describe('narrator voice (spec Z1)', () => {
  it('the voiceover path is gone: no /api/narrator-voice', async () => {
    expect((await app.inject({ url: '/api/narrator-voice', headers: H })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/api/narrator-voice', headers: H, payload: { engine: 'chatterbox', voice: { kind: 'preset', id: 'hazir' } } })).statusCode).toBe(404);
  });
});
