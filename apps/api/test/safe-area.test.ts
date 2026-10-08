import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SAFE_AREA, loadConfig } from '@videogen/shared';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { composeInputHash } from '../../worker/src/pipeline/final-steps.ts';
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

const get = async () => (await app.inject({ url: '/api/safe-area', headers: H })).json();
const put = (payload: unknown, headers: Record<string, string> = H) => app.inject({ method: 'PUT', url: '/api/safe-area', headers, payload: payload as object });
const MOVED = { top: 210, bottom: 1480, right: 140, left: 24 };

describe('safe area setting (plan M7 Y15, Y16)', () => {
  it('GET/PUT /api/safe-area validates, stores source and note, audits settings.safe_area, resets to the default; compose\'s input hash changes with the area so an old final is not reused', async () => {
    expect(await get()).toEqual({ area: DEFAULT_SAFE_AREA, source: 'default', measuredAt: null, note: null, warnings: [] });

    // Impossible areas, missing sides, unknown keys and a cross-origin write are refused; nothing is stored.
    for (const bad of [{ area: { ...MOVED, top: 1500 } }, { area: { ...MOVED, left: 600, right: 600 } }, { area: { top: 150 } }, {}, { area: MOVED, extra: 1 }, { area: MOVED, note: 'x'.repeat(201) }]) {
      const r = await put(bad);
      expect(r.statusCode, JSON.stringify(bad)).toBe(400);
      expect(r.json().error).toMatch(/güvenli alan/);
    }
    expect((await put({ area: MOVED }, { ...H, origin: 'http://evil.example' })).statusCode).toBe(403);
    expect((await get()).source).toBe('default');

    const saved = await put({ area: MOVED, note: '  Pixel 7, TikTok 41.2  ' });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ area: MOVED, source: 'calibrated', note: 'Pixel 7, TikTok 41.2', warnings: [] });
    expect(Date.parse(saved.json().measuredAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(await get()).toEqual(saved.json());

    // More than 150 px from the default: stored (the user read it), but flagged.
    const far = await put({ area: { ...MOVED, top: 320 } });
    expect(far.json().warnings).toHaveLength(1);
    expect(far.json().warnings[0]).toMatch(/üst/);

    const reset = await put({ reset: true });
    expect(reset.json()).toEqual({ area: DEFAULT_SAFE_AREA, source: 'default', measuredAt: null, note: null, warnings: [] });

    const { rows } = await t.pool.query("SELECT subject_id, data FROM audit_log WHERE action = 'settings.safe_area' ORDER BY seq");
    expect(rows.map((r) => r.subject_id)).toEqual(['safe_area', 'safe_area', 'safe_area']);
    expect(rows.map((r) => [r.data.from.area, r.data.from.source, r.data.to.area, r.data.to.source])).toEqual([
      [DEFAULT_SAFE_AREA, 'default', MOVED, 'calibrated'],
      [MOVED, 'calibrated', { ...MOVED, top: 320 }, 'calibrated'],
      [{ ...MOVED, top: 320 }, 'calibrated', DEFAULT_SAFE_AREA, 'default'],
    ]);
    expect(rows[0].data.to.note).toBe('Pixel 7, TikTok 41.2');

    // A stored value that no longer validates reads as the default.
    await t.pool.query("UPDATE settings SET value = '{\"area\":{\"top\":5}}' WHERE key = 'safe_area'");
    expect((await get()).source).toBe('default');

    // compose: the same inputs with another area give another hash (a final composed with the old area is not reused).
    const parts = { framesHash: 'f'.repeat(64), glbSha: 'g'.repeat(64), props: { frames: 30 }, preset: 'slow', sound: { cues: [] }, vo: null };
    expect(composeInputHash({ ...parts, safeArea: DEFAULT_SAFE_AREA })).toBe(composeInputHash({ ...parts, safeArea: { ...DEFAULT_SAFE_AREA } }));
    expect(composeInputHash({ ...parts, safeArea: MOVED })).not.toBe(composeInputHash({ ...parts, safeArea: DEFAULT_SAFE_AREA }));
  });
});
