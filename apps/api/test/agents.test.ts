import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { insertAgentEvent, insertSession, maxEventId } from '@videogen/db';
import { loadFixture } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { buildApp } from '../src/app.ts';
import { EventHub } from '../src/event-hub.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
let hub: EventHub;
let app: Awaited<ReturnType<typeof buildApp>>;
let dev: Awaited<ReturnType<typeof buildApp>>;
let listener: pg.Client;
const commands: Record<string, unknown>[] = [];
const H = { host: '127.0.0.1:5180' };

beforeAll(async () => {
  t = await createTestDb();
  hub = new EventHub(t.pool, t.appUrl);
  await hub.start();
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', devEndpoints: false } });
  dev = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', devEndpoints: true } });
  listener = new pg.Client({ connectionString: t.appUrl });
  await listener.connect();
  listener.on('notification', (n) => { if (n.channel === 'vg_commands') commands.push(JSON.parse(n.payload!)); });
  await listener.query('LISTEN vg_commands');
});
afterAll(async () => { await listener.end(); await app.close(); await dev.close(); await hub.stop(); await t.drop(); });

const settle = () => new Promise((r) => setTimeout(r, 80));
async function session(status = 'thinking' as const) {
  const id = randomUUID();
  await insertSession(t.pool, { id, kind: 'pipeline', role: 'researcher', model: 'sonnet', effort: 'high', claudeSessionId: id, runDir: '/home/user/gpu-server/VideoGen/spikes/m0/work', status });
  return id;
}

describe('session endpoints', () => {
  it('lists sessions as browser views, filtered by scope', async () => {
    const live = await session('thinking');
    const ended = await session('done' as never);
    const all = (await app.inject({ url: '/api/sessions', headers: H })).json();
    expect(all.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining([live, ended]));
    expect(all[0]).not.toHaveProperty('runDir');
    expect(all[0]).not.toHaveProperty('pid');
    const active = (await app.inject({ url: '/api/sessions?scope=active', headers: H })).json();
    expect(active.map((s: { id: string }) => s.id)).toContain(live);
    expect(active.map((s: { id: string }) => s.id)).not.toContain(ended);
  });

  it('rebuilds the trace from stored agent events; unknown or malformed ids are 404', async () => {
    const id = await session();
    const persisted = loadFixture('basic').map((l) => l.m).filter((m) => m.type !== 'stream_event' && m.subtype !== 'thinking_tokens');
    let seq = 0;
    for (const m of persisted) await insertAgentEvent(t.pool, { sessionId: id, seq: ++seq, turn: 0, type: m.type, subtype: m.subtype ?? null, parentToolUseId: null, toolUseId: null, taskId: null, payload: m });
    const rows = (await app.inject({ url: `/api/sessions/${id}/trace`, headers: H })).json();
    expect(rows.map((r: { variant: string }) => r.variant)).toEqual(['reasoning', 'text']);
    expect((await app.inject({ url: `/api/sessions/${randomUUID()}/trace`, headers: H })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/sessions/not-a-uuid', headers: H })).statusCode).toBe(404);
  });

  it('cancel and retry are accepted (202), audited and forwarded with ids only', async () => {
    const id = await session();
    commands.length = 0;
    for (const action of ['cancel', 'retry']) {
      const r = await app.inject({ method: 'POST', url: `/api/sessions/${id}/${action}`, headers: H });
      expect(r.statusCode).toBe(202);
    }
    await settle();
    expect(commands).toEqual([{ type: 'session.cancel', sessionId: id }, { type: 'session.retry', sessionId: id }]);
    const { rows } = await t.pool.query("SELECT action FROM audit_log WHERE session_id = $1 AND actor_type = 'user' ORDER BY seq", [id]);
    expect(rows.map((r) => r.action)).toEqual(['session.cancel_requested', 'session.retry_requested']);
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${randomUUID()}/cancel`, headers: H })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${id}/cancel`, headers: { ...H, origin: 'http://evil.example' } })).statusCode).toBe(403);
  });
});

describe('chat endpoints', () => {
  it('creates a thread, accepts a message without putting its text into NOTIFY, and renames the thread', async () => {
    const th = (await app.inject({ method: 'POST', url: '/api/chat/threads', headers: H, payload: {} })).json();
    expect(th.title).toBe('Yeni sohbet');
    commands.length = 0;
    const r = await app.inject({ method: 'POST', url: `/api/chat/threads/${th.id}/messages`, headers: H, payload: { text: '  Tükenmez kalemin içinde ne var?  ' } });
    expect(r.statusCode).toBe(202);
    const m = r.json();
    expect(m).toMatchObject({ role: 'user', status: 'queued', text: 'Tükenmez kalemin içinde ne var?' });
    await settle();
    expect(commands).toEqual([{ type: 'chat.send', messageId: m.id }]);
    const got = (await app.inject({ url: `/api/chat/threads/${th.id}`, headers: H })).json();
    expect(got.thread.title).toBe('Tükenmez kalemin içinde ne var?');
    expect(got.messages.map((x: { id: string }) => x.id)).toEqual([m.id]);
    const ev = await t.pool.query("SELECT payload FROM ui_events WHERE topic = $1 AND type = 'chat.message'", [`chat:${th.id}`]);
    expect(ev.rows).toHaveLength(1);
    for (const text of ['', '   ', 'x'.repeat(20_001)]) {
      expect((await app.inject({ method: 'POST', url: `/api/chat/threads/${th.id}/messages`, headers: H, payload: { text } })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: `/api/chat/threads/${randomUUID()}/messages`, headers: H, payload: { text: 'x' } })).statusCode).toBe(404);
    commands.length = 0;
    expect((await app.inject({ method: 'POST', url: `/api/chat/threads/${th.id}/interrupt`, headers: H })).statusCode).toBe(202);
    await settle();
    expect(commands).toEqual([{ type: 'chat.interrupt', threadId: th.id }]);
  });
  it('stores the chat mode and rejects an unknown one', async () => {
    const th = (await app.inject({ method: 'POST', url: '/api/chat/threads', headers: H, payload: {} })).json();
    const r = await app.inject({ method: 'POST', url: `/api/chat/threads/${th.id}/messages`, headers: H, payload: { text: 'incele', mode: 'analyze' } });
    expect(r.json().mode).toBe('analyze');
    expect((await app.inject({ method: 'POST', url: `/api/chat/threads/${th.id}/messages`, headers: H, payload: { text: 'x', mode: 'yolo' } })).statusCode).toBe(400);
  });
});

describe('roles, dev endpoint and freshness header', () => {
  it('reads defaults, validates and stores overrides with an audit row and a reload command', async () => {
    const roles = (await app.inject({ url: '/api/roles', headers: H })).json();
    expect(roles.find((r: { role: string }) => r.role === 'builder')).toEqual({ role: 'builder', label: 'Video üretim', model: 'opus', effort: 'high', defaults: { model: 'opus', effort: 'high' } });
    expect((await app.inject({ method: 'PUT', url: '/api/roles/chat', headers: H, payload: { model: 'gpt-5' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/roles/chat', headers: H, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/roles/nobody', headers: H, payload: { model: 'haiku' } })).statusCode).toBe(404);
    commands.length = 0;
    const r = await app.inject({ method: 'PUT', url: '/api/roles/chat', headers: H, payload: { model: 'haiku', effort: 'low' } });
    expect(r.statusCode).toBe(200);
    await settle();
    expect(commands).toEqual([{ type: 'roles.changed' }]);
    expect((await app.inject({ url: '/api/roles', headers: H })).json().find((x: { role: string }) => x.role === 'chat')).toMatchObject({ model: 'haiku', effort: 'low' });
    const { rows } = await t.pool.query("SELECT data FROM audit_log WHERE action = 'settings.role_changed'");
    expect(rows[0].data).toEqual({ role: 'chat', before: null, after: { model: 'haiku', effort: 'low' } });
  });

  it('the dev session endpoint exists only when enabled', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/dev/sessions', headers: H, payload: { role: 'researcher' } })).statusCode).toBe(404);
    commands.length = 0;
    const r = await dev.inject({ method: 'POST', url: '/api/dev/sessions', headers: H, payload: { role: 'researcher', prompt: 'p', script: { fixture: 'basic', stall: { afterIndex: 1, ms: 10_000 } } } });
    expect(r.statusCode).toBe(202);
    expect((await dev.inject({ method: 'POST', url: '/api/dev/sessions', headers: H, payload: { role: 'boss' } })).statusCode).toBe(400);
    await settle();
    expect(commands).toEqual([{ type: 'dev.session.start', role: 'researcher', prompt: 'p', script: { fixture: 'basic', stall: { afterIndex: 1, ms: 10_000 } } }]);
  });

  it('GET /api/* carries x-vg-event-id (the max event id when the read began); health does not', async () => {
    const r = await app.inject({ url: '/api/usage', headers: H });
    expect(Number(r.headers['x-vg-event-id'])).toBe(await maxEventId(t.pool));
    expect((await app.inject({ url: '/api/health', headers: H })).headers['x-vg-event-id']).toBeUndefined();
  });
});

describe('usage guard endpoint', () => {
  it('reports the open state until the worker stores one', async () => {
    expect((await app.inject({ url: '/api/usage/guard', headers: H })).json()).toEqual({ blocked: false, reason: null, resumeAt: null, fiveHour: null, sevenDay: null });
    const g = { blocked: true, reason: 'five_hour', resumeAt: '2026-10-06T14:00:00.000Z', fiveHour: 0.82, sevenDay: 0.2 };
    await t.pool.query("INSERT INTO settings (key, value) VALUES ('usage.guard', $1)", [JSON.stringify(g)]);
    expect((await app.inject({ url: '/api/usage/guard', headers: H })).json()).toEqual(g);
  });
});
