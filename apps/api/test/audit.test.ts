import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '@videogen/shared';
import { appendAudit, createProduceRun, findSecretKeys, insertAgentEvent, insertSession } from '@videogen/db';
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
  app = await buildApp({ pool: t.pool, hub, config: { ...loadConfig(), webDist: '/nonexistent', devEndpoints: false } });
});
afterAll(async () => { await app.close(); await hub.stop(); await t.drop(); });
const get = (url: string, headers: Record<string, string> = H) => app.inject({ url, headers });

describe('audit endpoints', () => {
  it('GET /api/audit filters and pages, rejects a bad date, a limit over 200 and a non-uuid run with a Turkish reason; GET /api/audit/actions lists action counts; a non-local Host is refused', async () => {
    const v = await createProduceRun(t.pool, { productName: 'Silgi', audioMode: 'silent', plan: [{ key: 'research', weight: 100 }] });
    const s0 = Number((await t.pool.query("SELECT seq FROM audit_log WHERE action = 'video.produce_requested' AND subject_id = $1", [v.videoId])).rows[0].seq);
    const s1 = await appendAudit(t.pool, { actorType: 'orchestrator', action: 'run.started', runId: v.runId });
    const s2 = await appendAudit(t.pool, { actorType: 'user', action: 'publish.queued', subjectType: 'video', subjectId: v.videoId });
    const s3 = await appendAudit(t.pool, { actorType: 'system', action: 'publish.sent', subjectType: 'video', subjectId: v.videoId });
    await appendAudit(t.pool, { actorType: 'system', action: 'other.thing' });

    const byVideo = await get(`/api/audit?video=${v.videoId}`);
    expect(byVideo.statusCode).toBe(200);
    expect(byVideo.json().rows.map((r: { seq: number }) => r.seq)).toEqual([s3.seq, s2.seq, s1.seq, s0]);
    expect(byVideo.json().nextBefore).toBeNull();
    const p1 = (await get('/api/audit?action=publish.*&limit=1')).json();
    expect(p1).toMatchObject({ rows: [{ seq: s3.seq, action: 'publish.sent' }], nextBefore: s3.seq });
    const p2 = (await get(`/api/audit?action=publish.*&limit=1&before=${p1.nextBefore}`)).json();
    expect(p2).toMatchObject({ rows: [{ seq: s2.seq }], nextBefore: null });
    expect((await get(`/api/audit?run=${v.runId}`)).json().rows.map((r: { seq: number }) => r.seq)).toEqual([s1.seq, s0]);
    expect((await get(`/api/audit?from=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`)).json().rows).toEqual([]);

    for (const [q, word] of [['from=dün', 'tarih'], ['to=2026-13-45', 'tarih'], ['limit=201', 'limit'], ['limit=0', 'limit'], ['run=abc', 'run'], ['session=x', 'oturum'], ['before=-1', 'before']] as const) {
      const r = await get(`/api/audit?${q}`);
      expect(r.statusCode, q).toBe(400);
      expect(r.json().error, q).toContain(word);
    }

    const acts = await get('/api/audit/actions');
    expect(acts.statusCode).toBe(200);
    expect(acts.json()).toEqual(expect.arrayContaining([{ action: 'publish.queued', n: 1 }, { action: 'publish.sent', n: 1 }, { action: 'run.started', n: 1 }]));

    for (const url of ['/api/audit', '/api/audit/actions', '/api/audit/verify', `/api/audit/${s1.seq}`]) {
      expect((await get(url, { host: 'evil.example:5180' })).statusCode, url).toBe(403);
    }
  });

  it('GET /api/audit/verify reports ok, checked, lastSeq, checkedAt and ms, and firstBadSeq after tampering (owner bypass as in audit.test.ts:29); GET /api/audit/:seq returns the detail and never a value under a secret-like key', async () => {
    const sid = randomUUID();
    await insertSession(t.pool, { id: sid, kind: 'pipeline', role: 'builder', model: 'opus', effort: 'high', claudeSessionId: sid, runDir: '/tmp/r', status: 'queued' });
    await insertAgentEvent(t.pool, {
      sessionId: sid, seq: 1, turn: 1, type: 'assistant', subtype: null, parentToolUseId: null, toolUseId: null, taskId: null,
      payload: { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', id: 'tu_x', name: 'mcp__web__fetch', input: { url: 'https://x', access_token: 'sk-secret-9', nested: [{ password: 'p4ss' }] } }] } },
    });
    const tool = await appendAudit(t.pool, { actorType: 'agent', actorId: `builder:${sid}`, action: 'agent.tool', subjectType: 'tool', subjectId: 'mcp__web__fetch', sessionId: sid, toolUseId: 'tu_x', data: { tool: 'mcp__web__fetch' } });

    const first = await get('/api/audit/verify');
    expect(first.statusCode).toBe(200);
    const v1 = first.json();
    expect(v1).toMatchObject({ ok: true, firstBadSeq: null, lastSeq: tool.seq, cached: false });
    expect(v1.checked).toBe(tool.seq);
    expect(Number.isNaN(Date.parse(v1.checkedAt))).toBe(false);
    expect(typeof v1.ms).toBe('number');

    const admin = new pg.Client({ connectionString: t.adminUrl });
    await admin.connect();
    await admin.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update');
    await admin.query("UPDATE audit_log SET action = 'tampered' WHERE seq = 2");
    await admin.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update');
    await admin.end();

    expect((await get('/api/audit/verify')).json()).toMatchObject({ ok: true, cached: true, checkedAt: v1.checkedAt });
    const fresh = (await get('/api/audit/verify?fresh=1')).json();
    expect(fresh).toMatchObject({ ok: false, firstBadSeq: 2, checked: 2, lastSeq: tool.seq, cached: false });

    const d = await get(`/api/audit/${tool.seq}`);
    expect(d.statusCode).toBe(200);
    const body = d.json();
    expect(body.row).toMatchObject({ seq: tool.seq, action: 'agent.tool', toolUseId: 'tu_x' });
    expect(body.links.session).toEqual({ id: sid, role: 'builder', model: 'opus', transcriptSha: null });
    expect(body.links.tool).toMatchObject({ name: 'mcp__web__fetch', input: { url: 'https://x' } });
    expect(findSecretKeys(body)).toEqual([]);
    expect(d.body).not.toContain('sk-secret-9');
    expect(d.body).not.toContain('p4ss');
    expect((await get('/api/audit/999999')).statusCode).toBe(404);
    expect((await get('/api/audit/abc')).statusCode).toBe(404);
  });
});
