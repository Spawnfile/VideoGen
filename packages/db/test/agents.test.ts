import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chatMessagesByStatus, createThread, getSession, getThread, insertAgentEvent, insertBlob, insertChatMessage, insertSession,
  listChatMessages, listSessions, listThreads, markOrphanSessions, publishEvent, readAgentEvents, setThreadClaudeSession,
  updateChatMessage, updateSession,
} from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const session = (over: Record<string, unknown> = {}) => {
  const id = randomUUID();
  return { id, kind: 'pipeline' as const, role: 'researcher' as const, model: 'sonnet', effort: 'high' as const, claudeSessionId: id, runDir: '/tmp/r', status: 'queued' as const, ...over };
};

describe('ui_events ordering is enforced by the database', () => {
  it('the app role cannot insert directly; publishEvent goes through vg_publish_event and notifies the id', async () => {
    await expect(t.pool.query("INSERT INTO ui_events (topic, type, payload) VALUES ('system', 'x', '{}')")).rejects.toMatchObject({ code: '42501' });
    await expect(t.pool.query('UPDATE ui_events SET type = $1', ['y'])).rejects.toMatchObject({ code: '42501' });
    const listener = new pg.Client({ connectionString: t.appUrl });
    await listener.connect();
    const got: string[] = [];
    listener.on('notification', (n) => got.push(n.payload ?? ''));
    await listener.query('LISTEN vg_events');
    const e = await publishEvent(t.pool, { topic: 'system', type: 'probe', payload: { a: 1 } });
    await new Promise((r) => setTimeout(r, 100));
    await listener.end();
    expect(e).toMatchObject({ topic: 'system', type: 'probe', payload: { a: 1 } });
    expect(got).toContain(String(e.id));
  });
});

describe('agent sessions and events', () => {
  it('inserts, updates, reads and lists sessions as views', async () => {
    const a = session();
    const b = session({ kind: 'chat', role: 'chat' });
    await insertSession(t.pool, a);
    await insertSession(t.pool, b);
    await updateSession(t.pool, a.id, { status: 'done', endedAt: new Date(), usage: { m: { inputTokens: 1 } }, costUsd: 0.5, tokens: 42, numTurns: 3, permissionDenials: [{ tool: 'Write', toolUseId: 'toolu_1' }], progress: 50, progressSource: 'agent' });
    const got = await getSession(t.pool, a.id);
    expect(got).toMatchObject({ id: a.id, status: 'done', costUsd: 0.5, tokens: 42, numTurns: 3, progress: 50, progressSource: 'agent', kind: 'pipeline', role: 'researcher' });
    expect(typeof got!.endedAt).toBe('string');
    expect((await listSessions(t.pool, { activeOnly: true })).map((s) => s.id)).toEqual([b.id]);
    expect((await listSessions(t.pool, { kind: 'pipeline' })).map((s) => s.id)).toContain(a.id);
    expect(await getSession(t.pool, randomUUID())).toBeNull();
  });

  it('stores agent events in seq order and the app role cannot alter them', async () => {
    const s = session();
    await insertSession(t.pool, s);
    for (const seq of [2, 1, 3]) await insertAgentEvent(t.pool, { sessionId: s.id, seq, turn: 0, type: 'assistant', subtype: null, parentToolUseId: null, toolUseId: null, taskId: null, payload: { seq } });
    expect((await readAgentEvents(t.pool, s.id)).map((e) => e.seq)).toEqual([1, 2, 3]);
    await expect(t.pool.query('UPDATE agent_events SET turn = 1')).rejects.toMatchObject({ code: '42501' });
    await expect(t.pool.query('DELETE FROM agent_events')).rejects.toMatchObject({ code: '42501' });
  });

  it('marks only active sessions as orphaned on worker restart', async () => {
    const live = session({ status: 'thinking' });
    const ended = session({ status: 'done' });
    await insertSession(t.pool, live);
    await insertSession(t.pool, ended);
    const ids = await markOrphanSessions(t.pool);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(ended.id);
    expect(await getSession(t.pool, live.id)).toMatchObject({ status: 'failed', terminalReason: 'worker_restart' });
  });
});

describe('chat and blobs', () => {
  it('threads and messages round-trip', async () => {
    const th = await createThread(t.pool, { id: randomUUID(), title: 'Kalem' });
    const u = await insertChatMessage(t.pool, { id: randomUUID(), threadId: th.id, role: 'user', text: 'Merhaba', status: 'queued' });
    const sid = randomUUID();
    await setThreadClaudeSession(t.pool, th.id, sid);
    expect((await getThread(t.pool, th.id))!.claudeSessionId).toBe(sid);
    expect((await chatMessagesByStatus(t.pool, ['queued'])).map((m) => m.id)).toContain(u.id);
    const done = await updateChatMessage(t.pool, u.id, { status: 'done', completedAt: new Date(), turn: 0 });
    expect(done).toMatchObject({ status: 'done', turn: 0 });
    await insertChatMessage(t.pool, { id: randomUUID(), threadId: th.id, role: 'assistant', text: 'Selam', status: 'done' });
    expect((await listChatMessages(t.pool, th.id)).map((m) => m.role)).toEqual(['user', 'assistant']);
    expect((await listThreads(t.pool)).map((x) => x.id)).toContain(th.id);
  });

  it('blobs are content-addressed: a second insert of the same sha is a no-op', async () => {
    const b = { sha256: 'a'.repeat(64), path: 'media/sha256/aa/aa/x.json', bytes: 3, mime: 'application/json' };
    expect(await insertBlob(t.pool, b)).toBe(true);
    expect(await insertBlob(t.pool, b)).toBe(false);
  });
});
