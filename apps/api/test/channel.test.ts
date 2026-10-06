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

describe('channel style (K19)', () => {
  it('offers three options with their renders, starts provisional, stores a choice with an audit row and rejects unknown ids', async () => {
    const first = (await app.inject({ url: '/api/channel-style', headers: H })).json();
    expect(first).toMatchObject({ id: 'gece_mavisi', chosen: false });
    expect(first.options.map((o: { id: string; image: string }) => [o.id, o.image])).toEqual([['atolye', '/k19/atolye.png'], ['beyaz_lab', '/k19/beyaz_lab.png'], ['gece_mavisi', '/k19/gece_mavisi.png']]);
    expect((await app.inject({ method: 'PUT', url: '/api/channel-style', headers: H, payload: { id: 'neon' } })).statusCode).toBe(400);
    const put = await app.inject({ method: 'PUT', url: '/api/channel-style', headers: H, payload: { id: 'atolye' } });
    expect(put.json()).toMatchObject({ id: 'atolye', chosen: true });
    expect((await app.inject({ method: 'PUT', url: '/api/channel-style', headers: { ...H, origin: 'http://evil.example' }, payload: { id: 'beyaz_lab' } })).statusCode).toBe(403);
    const { rows } = await t.pool.query("SELECT data FROM audit_log WHERE action = 'settings.channel_style' ORDER BY seq");
    expect(rows.map((r) => r.data)).toEqual([{ from: null, to: 'atolye' }]);
  });
});
