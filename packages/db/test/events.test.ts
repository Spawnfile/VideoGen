import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maxEventId, publishEvent, publishLive, pruneEvents, readEventsAfter } from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

describe('ui_events outbox', () => {
  it('notifies ids in strictly increasing order under concurrent writers', async () => {
    const listener = new pg.Client({ connectionString: t.appUrl });
    await listener.connect();
    const seen: number[] = [];
    listener.on('notification', (n) => { if (n.channel === 'vg_events') seen.push(Number(n.payload)); });
    await listener.query('LISTEN vg_events');
    await Promise.all(Array.from({ length: 20 }, (_, i) => publishEvent(t.pool, { topic: 'run:1', type: 'step', payload: { i } })));
    await new Promise((r) => setTimeout(r, 300));
    await listener.end();
    expect(seen).toHaveLength(20);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    const rows = await readEventsAfter(t.pool, 0);
    expect(rows.map((r) => r.id)).toEqual(seen);
    const ts = rows.map((r) => Date.parse(r.ts));
    expect(ts).toEqual([...ts].sort((a, b) => a - b));
    expect(await maxEventId(t.pool)).toBe(seen[19]);
  });

  it('reads only events after the given id', async () => {
    const before = await maxEventId(t.pool);
    const e = await publishEvent(t.pool, { topic: 'system', type: 'x', payload: { ok: true } });
    const after = await readEventsAfter(t.pool, before);
    expect(after).toEqual([e]);
    expect(e.payload).toEqual({ ok: true });
  });

  it('rejects oversized live payloads', async () => {
    await expect(publishLive(t.pool, { topic: 'system', type: 'big', payload: 'x'.repeat(9000) })).rejects.toThrow('too large');
  });

  it('measures live payload size in bytes, not characters', async () => {
    await expect(publishLive(t.pool, { topic: 'system', type: 'big', payload: 'é'.repeat(3950) })).rejects.toThrow('too large');
    await expect(publishLive(t.pool, { topic: 'system', type: 'ok', payload: 'é'.repeat(3800) })).resolves.toBeUndefined();
  });

  it('prunes only events older than the cutoff', async () => {
    const old = await publishEvent(t.pool, { topic: 'system', type: 'old', payload: {} });
    const recent = await publishEvent(t.pool, { topic: 'system', type: 'recent', payload: {} });
    const admin = new pg.Client({ connectionString: t.adminUrl });
    await admin.connect();
    await admin.query(`UPDATE ui_events SET ts = now() - interval '40 days' WHERE id = $1`, [old.id]);
    await admin.end();
    expect(await pruneEvents(t.pool, 30)).toBeGreaterThanOrEqual(1);
    const left = (await readEventsAfter(t.pool, old.id - 1)).map((r) => r.id);
    expect(left).not.toContain(old.id);
    expect(left).toContain(recent.id);
  });
});
