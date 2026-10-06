import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent' } });
});
afterAll(async () => { await app.close(); await hub.stop(); await t.drop(); });

describe('system endpoints', () => {
  it('rounds utilization to 4 decimals in /api/usage', async () => {
    await t.pool.query(
      "INSERT INTO usage_snapshots(source, five_hour_util, five_hour_resets_at, seven_day_util, seven_day_resets_at, status, subscription_type) VALUES ('oauth', 12.123456::float4, now(), 0.30000001::float4, now(), 'ok', 'max')",
    );
    const r = await app.inject({ url: '/api/usage', headers: { host: '127.0.0.1:5180' } });
    const body = r.json();
    expect(body.fiveHour.utilization).toBe(12.1235);
    expect(body.sevenDay.utilization).toBe(0.3);
  });
});
