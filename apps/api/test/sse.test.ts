import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { maxEventId, publishEvent } from '@videogen/db';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let base: string;
let close: () => Promise<void>;

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  const app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent' }, heartbeatMs: 200 });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  close = async () => { await app.close(); await hub.stop(); };
});
afterAll(async () => { await close(); await t.drop(); });

async function readSse(lastEventId: number, until: (ids: number[], text: string) => boolean) {
  const ac = new AbortController();
  const res = await fetch(`${base}/events`, { headers: { 'last-event-id': String(lastEventId) }, signal: ac.signal });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value);
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    if (until(ids, text)) break;
  }
  ac.abort();
  return { text, ids: [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1])) };
}

/** Opens a stream and lets the test wait for conditions on the accumulated text. */
async function openSse(headers: Record<string, string> = {}, query = '') {
  const ac = new AbortController();
  const res = await fetch(`${base}/events${query}`, { headers, signal: ac.signal });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = '';
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | null = null; // never drop an in-flight read when the poll timer wins
  const ids = () => [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
  return {
    ids,
    text: () => text,
    async waitFor(pred: () => boolean, ms = 2500) {
      const deadline = Date.now() + ms;
      while (!pred()) {
        if (Date.now() > deadline) throw new Error(`timeout waiting; got: ${JSON.stringify(text.slice(-300))}`);
        pending ??= reader.read();
        const r = await Promise.race([pending, new Promise<null>((ok) => setTimeout(() => ok(null), 100))]);
        if (r) {
          pending = null;
          if (r.done) break;
          text += dec.decode(r.value);
        }
      }
    },
    close: () => ac.abort(),
  };
}

describe('SSE', () => {
  it('replays after Last-Event-ID, then streams live, exactly once, with heartbeats', async () => {
    const e1 = await publishEvent(t.pool, { topic: 'system', type: 'a', payload: 1 });
    const e2 = await publishEvent(t.pool, { topic: 'system', type: 'b', payload: 2 });
    const e3 = await publishEvent(t.pool, { topic: 'system', type: 'c', payload: 3 });
    setTimeout(() => { publishEvent(t.pool, { topic: 'system', type: 'd', payload: 4 }); }, 50);
    const { ids, text } = await readSse(e1.id, (ids, txt) => ids.length >= 3 && txt.includes('event: hb'));
    expect(ids.slice(0, 3)).toEqual([e2.id, e3.id, e3.id + 1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(text).toContain('retry: 2000');
  });

  it('rejects non-local Host on the stream', async () => {
    const http = await import('node:http');
    const status = await new Promise<number>((ok) => {
      http.get(`${base}/events`, { headers: { host: 'evil.example' } }, (r) => { ok(r.statusCode ?? 0); r.destroy(); });
    });
    expect(status).toBe(403);
  });

  it('fresh connect (no Last-Event-ID, no after) starts at the current max, without replaying history', async () => {
    await publishEvent(t.pool, { topic: 'system', type: 'old1', payload: 1 });
    await publishEvent(t.pool, { topic: 'system', type: 'old2', payload: 2 });
    const c = await openSse();
    await c.waitFor(() => c.text().includes('event: hb')); // replay phase is over once a heartbeat shows up
    const fresh = await publishEvent(t.pool, { topic: 'system', type: 'new', payload: 3 });
    await c.waitFor(() => c.ids().length >= 1);
    c.close();
    expect(c.ids()).toEqual([fresh.id]);
  });

  it('treats a Last-Event-ID beyond the current max as a reset (starts at max)', async () => {
    const max = await maxEventId(t.pool);
    const c = await openSse({ 'last-event-id': String(max + 1000) });
    await c.waitFor(() => c.text().includes('event: hb'));
    const fresh = await publishEvent(t.pool, { topic: 'system', type: 'after-reset', payload: 1 });
    await c.waitFor(() => c.ids().length >= 1);
    c.close();
    expect(c.ids()).toEqual([fresh.id]);
  });

  it('explicit ?after= keeps replay semantics', async () => {
    const e = await publishEvent(t.pool, { topic: 'system', type: 'q1', payload: 1 });
    const e2 = await publishEvent(t.pool, { topic: 'system', type: 'q2', payload: 2 });
    const c = await openSse({}, `?after=${e.id - 1}`);
    await c.waitFor(() => c.ids().length >= 2);
    c.close();
    expect(c.ids().slice(0, 2)).toEqual([e.id, e2.id]);
  });

  it('is gap-free and duplicate-free when connecting while concurrent publishers are running', async () => {
    const base0 = await maxEventId(t.pool);
    const publishers = [0, 1, 2].map(async (p) => {
      const out: number[] = [];
      for (let i = 0; i < 20; i++) out.push((await publishEvent(t.pool, { topic: 'system', type: 'race', payload: { p, i } })).id);
      return out;
    });
    await new Promise((r) => setTimeout(r, 15));
    const c = await openSse({ 'last-event-id': String(base0) });
    const all = (await Promise.all(publishers)).flat();
    const last = Math.max(...all);
    await c.waitFor(() => c.ids().at(-1) === last);
    c.close();
    const expected = Array.from({ length: last - base0 }, (_, i) => base0 + 1 + i);
    expect(c.ids()).toEqual(expected);
    expect(last - base0).toBe(60);
  });

  it('survives a malformed vg_live payload', async () => {
    const c = await openSse();
    await c.waitFor(() => c.text().includes('event: hb'));
    await t.pool.query("SELECT pg_notify('vg_live', 'not json{')");
    await t.pool.query(`SELECT pg_notify('vg_live', '{"kind":"ok"}')`);
    await c.waitFor(() => c.text().includes('event: live'));
    c.close();
    expect(c.text()).toContain('{"kind":"ok"}');
  });

  it('app.close() completes while an SSE client is connected', async () => {
    const hub2 = new EventHub(t.pool, t.appUrl);
    await hub2.start();
    const app2 = await buildApp({ pool: t.pool, hub: hub2, config: { ...loadConfig(), webDist: '/nonexistent' }, heartbeatMs: 200 });
    await app2.listen({ host: '127.0.0.1', port: 0 });
    const addr = app2.server.address();
    const res = await fetch(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/events`);
    const reader = res.body!.getReader();
    await reader.read();
    const outcome = await Promise.race([
      app2.close().then(() => 'closed'),
      new Promise<string>((ok) => setTimeout(() => ok('hung'), 1500)),
    ]);
    reader.cancel().catch(() => {});
    await hub2.stop();
    expect(outcome).toBe('closed');
  });
  it('sends named heartbeat events with a timestamp', async () => {
    const c = await openSse();
    await c.waitFor(() => /event: hb\ndata: \{"ts":\d+\}/.test(c.text()));
    c.close();
  });

  it('treats an empty ?after= / Last-Event-ID as a fresh connection (no replay)', async () => {
    await publishEvent(t.pool, { topic: 'system', type: 'old-empty', payload: 1 });
    for (const c of [await openSse({}, '?after='), await openSse({ 'last-event-id': '' })]) {
      await c.waitFor(() => c.text().includes('event: hb'));
      expect(c.text()).not.toContain('old-empty');
      c.close();
    }
  });
});
