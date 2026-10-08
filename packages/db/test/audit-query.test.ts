import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditRow } from '@videogen/shared';
import {
  appendAudit, auditActions, auditDetail, createProduceRun, findSecretKeys, insertAgentEvent, insertArtifact, insertBlob, insertSession, listAudit, verifyAudit,
} from '../src/index.ts';
import { createTestDb } from './helpers.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t?.drop(); });

const plan = [{ key: 'research' as const, weight: 100 }];
const produce = (name: string) => createProduceRun(t.pool, { productName: name, audioMode: 'silent', plan });
const session = async (role: 'researcher' | 'storyboarder', runId: string | null) => {
  const id = randomUUID();
  await insertSession(t.pool, { id, kind: 'pipeline', role, model: 'sonnet', effort: 'high', claudeSessionId: id, runDir: '/tmp/r', status: 'queued', runId });
  return id;
};
const seqs = (rows: AuditRow[]) => rows.map((r) => r.seq);
const isDesc = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! > x);

describe('audit query layer', () => {
  it('listAudit: run, video (its runs and their sessions included), session, role, exact and prefix action and a date range each return only matching rows, newest first; paging with nextBefore visits every row exactly once; 5000 rows filtered by video in under 500 ms (best of three, files run in parallel)', async () => {
    const a = await produce('Kalem A');
    const b = await produce('Kalem B');
    const sa = await session('researcher', a.runId);
    const sb = await session('storyboarder', b.runId);
    const produced = async (videoId: string) =>
      Number((await t.pool.query("SELECT seq FROM audit_log WHERE action = 'video.produce_requested' AND subject_id = $1", [videoId])).rows[0].seq);
    const mine: number[] = [await produced(a.videoId)];
    const bProduce = await produced(b.videoId);
    const push = async (p: Promise<{ seq: number }>) => (await p).seq;
    mine.push(await push(appendAudit(t.pool, { actorType: 'user', action: 'video.created', subjectType: 'video', subjectId: a.videoId })));
    mine.push(await push(appendAudit(t.pool, { actorType: 'orchestrator', action: 'run.started', runId: a.runId })));
    mine.push(await push(appendAudit(t.pool, { actorType: 'agent', actorId: `researcher:${sa}`, action: 'agent.tool', sessionId: sa, toolUseId: 'tu_1' })));
    const bRun = await push(appendAudit(t.pool, { actorType: 'orchestrator', action: 'run.started', runId: b.runId }));
    const bTool = await push(appendAudit(t.pool, { actorType: 'agent', actorId: `storyboarder:${sb}`, action: 'agent.tool', sessionId: sb, toolUseId: 'tu_2' }));
    const pub1 = await push(appendAudit(t.pool, { actorType: 'user', action: 'publish.queued', subjectType: 'video', subjectId: b.videoId }));
    const pub2 = await push(appendAudit(t.pool, { actorType: 'system', action: 'publish.sent', subjectType: 'video', subjectId: b.videoId }));
    await push(appendAudit(t.pool, { actorType: 'system', action: 'publisher.tick' }));
    const midTs = (await t.pool.query('SELECT clock_timestamp() AS ts')).rows[0].ts as Date;
    mine.push(await push(appendAudit(t.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: a.runId, subjectType: 'artifact', subjectId: randomUUID() })));

    expect(seqs((await listAudit(t.pool, { videoId: a.videoId })).rows)).toEqual([...mine].reverse());
    expect(seqs((await listAudit(t.pool, { runId: b.runId })).rows)).toEqual([bRun, bProduce]);
    expect(seqs((await listAudit(t.pool, { sessionId: sb })).rows)).toEqual([bTool]);
    expect(seqs((await listAudit(t.pool, { role: 'storyboarder' })).rows)).toEqual([bTool]);
    expect(seqs((await listAudit(t.pool, { action: 'publish.sent' })).rows)).toEqual([pub2]);
    expect(seqs((await listAudit(t.pool, { action: 'publish.*' })).rows)).toEqual([pub2, pub1]);
    const after = (await listAudit(t.pool, { from: midTs.toISOString() })).rows;
    expect(seqs(after)).toEqual([mine.at(-1)!]);
    const before = (await listAudit(t.pool, { to: midTs.toISOString(), action: 'run.*' })).rows;
    expect(seqs(before)).toEqual([bRun, mine[2]!]);
    expect((await listAudit(t.pool, { videoId: a.videoId })).rows[0]).toMatchObject({ action: 'artifact.created', actorType: 'orchestrator', runId: a.runId, subjectType: 'artifact' });
    expect(await listAudit(t.pool, { runId: randomUUID() })).toEqual({ rows: [], nextBefore: null });

    // Noise: 5000 rows over other runs, one statement (the chain trigger numbers each row).
    await t.pool.query(
      `INSERT INTO audit_log (actor_type, action, run_id, data)
       SELECT 'orchestrator', 'noise.' || (g % 7), gen_random_uuid()::text, jsonb_build_object('g', g) FROM generate_series(1, 5000) g`,
    );
    await t.pool.query('ANALYZE audit_log');
    const total = Number((await t.pool.query('SELECT count(*) AS n FROM audit_log')).rows[0].n);
    const seen: number[] = [];
    let cursor: number | undefined;
    for (let pages = 0; pages < 100; pages++) {
      const page = await listAudit(t.pool, { limit: 200, ...(cursor ? { before: cursor } : {}) });
      expect(page.rows.length).toBeLessThanOrEqual(200);
      seen.push(...seqs(page.rows));
      if (page.nextBefore === null) break;
      expect(page.nextBefore).toBe(page.rows.at(-1)!.seq);
      cursor = page.nextBefore;
    }
    expect(seen.length).toBe(total);
    expect(new Set(seen).size).toBe(total);
    expect(isDesc(seen)).toBe(true);
    const small = await listAudit(t.pool, { action: 'publish.*', limit: 1 });
    expect(seqs(small.rows)).toEqual([pub2]);
    expect(small.nextBefore).toBe(pub2);
    expect(await listAudit(t.pool, { action: 'publish.*', limit: 1, before: pub2 })).toMatchObject({ rows: [{ seq: pub1 }], nextBefore: null });

    await listAudit(t.pool, { videoId: a.videoId });
    // Best of three: other test files load the same Postgres in parallel (plan M7 Y2).
    let ms = Infinity;
    let v = await listAudit(t.pool, { videoId: a.videoId });
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      v = await listAudit(t.pool, { videoId: a.videoId });
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(seqs(v.rows)).toEqual([...mine].reverse());
    expect(ms).toBeLessThan(500);
    const actions = await auditActions(t.pool);
    expect(actions.find((x) => x.action === 'publish.sent')).toEqual({ action: 'publish.sent', n: 1 });
    expect(actions.filter((x) => x.action.startsWith('noise.')).reduce((s, x) => s + x.n, 0)).toBe(5000);
  });

  it('auditDetail: a tool row links its session (role, model, transcript sha) and the tool input from agent_events by tool_use_id with secret keys redacted and long strings cut at 4000 chars; a file_write row carries path and both shas; an artifact.created row links the artifact; an unknown seq is null', async () => {
    const v = await produce('Kalem Detay');
    const sid = await session('researcher', v.runId);
    const transcript = 'a'.repeat(64);
    await t.pool.query('UPDATE agent_sessions SET transcript_blob_sha = $2 WHERE id = $1', [sid, transcript]);
    const long = 'x'.repeat(10_000);
    const assistant = (id: string, input: unknown) => ({
      type: 'assistant', message: { id: `msg_${id}`, content: [{ type: 'text', text: 'tamam' }, { type: 'tool_use', id, name: 'Write', input }] },
    });
    await insertAgentEvent(t.pool, { sessionId: sid, seq: 1, turn: 1, type: 'assistant', subtype: null, parentToolUseId: null, toolUseId: null, taskId: null, payload: assistant('tu_other', { file_path: 'other.txt' }) });
    await insertAgentEvent(t.pool, {
      sessionId: sid, seq: 2, turn: 1, type: 'assistant', subtype: null, parentToolUseId: null, toolUseId: null, taskId: null,
      payload: assistant('tu_w', { file_path: 'notes.md', content: long, headers: { Authorization: 'Bearer sk-live-1', keep: 'ok' }, api_key: 'sk-live-2' }),
    });
    // Many long strings: the 32 KB total still holds.
    await insertAgentEvent(t.pool, {
      sessionId: sid, seq: 3, turn: 1, type: 'assistant', subtype: null, parentToolUseId: null, toolUseId: null, taskId: null,
      payload: assistant('tu_big', { parts: Array.from({ length: 40 }, (_, i) => `${i}:${long}`) }),
    });
    const actorId = `researcher:${sid}`;
    const tool = await appendAudit(t.pool, { actorType: 'agent', actorId, action: 'agent.tool', subjectType: 'tool', subjectId: 'Write', sessionId: sid, toolUseId: 'tu_w', data: { tool: 'Write', status: 'done' } });
    const big = await appendAudit(t.pool, { actorType: 'agent', actorId, action: 'agent.tool', subjectType: 'tool', subjectId: 'Write', sessionId: sid, toolUseId: 'tu_big', data: { tool: 'Write', status: 'done' } });
    const file = await appendAudit(t.pool, {
      actorType: 'agent', actorId, action: 'agent.file_write', subjectType: 'file', subjectId: 'notes.md', sessionId: sid, toolUseId: 'tu_w',
      data: { path: 'notes.md', beforeSha: null, afterSha: 'b'.repeat(64) },
    });
    const sha = 'c'.repeat(64);
    await insertBlob(t.pool, { sha256: sha, path: 'media/x', bytes: 3, mime: 'application/json' });
    const art = await insertArtifact(t.pool, { runId: v.runId, versionId: v.versionId, kind: 'research', blobSha: sha });
    const created = await appendAudit(t.pool, { actorType: 'orchestrator', action: 'artifact.created', runId: v.runId, subjectType: 'artifact', subjectId: art.id, data: { kind: 'research', sha256: sha } });

    const d = await auditDetail(t.pool, tool.seq);
    expect(d!.row).toMatchObject({ seq: tool.seq, action: 'agent.tool', sessionId: sid, toolUseId: 'tu_w' });
    expect(d!.links.session).toEqual({ id: sid, role: 'researcher', model: 'sonnet', transcriptSha: transcript });
    expect(d!.links.tool!.name).toBe('Write');
    const input = d!.links.tool!.input as Record<string, any>;
    expect(input.file_path).toBe('notes.md');
    expect(input.content.length).toBeLessThanOrEqual(4000 + 20);
    expect(input.content.startsWith('x'.repeat(4000))).toBe(true);
    expect(input.headers.keep).toBe('ok');
    expect(findSecretKeys(d)).toEqual([]);
    expect(JSON.stringify(d)).not.toContain('sk-live');
    expect(d!.links.artifact).toBeUndefined();

    const bd = await auditDetail(t.pool, big.seq);
    expect(Buffer.byteLength(JSON.stringify(bd!.links.tool!.input))).toBeLessThanOrEqual(32 * 1024);
    expect(bd!.links.tool!.truncated).toBe(true);
    expect(d!.links.tool!.truncated).toBe(true);

    const fd = await auditDetail(t.pool, file.seq);
    expect(fd!.links.file).toEqual({ path: 'notes.md', beforeSha: null, afterSha: 'b'.repeat(64) });
    expect(fd!.links.session!.id).toBe(sid);

    const ad = await auditDetail(t.pool, created.seq);
    expect(ad!.links.artifact).toEqual({ id: art.id, kind: 'research', blobSha: sha, versionId: v.versionId });
    expect(ad!.links.session).toBeUndefined();

    expect(await auditDetail(t.pool, 999_999)).toBeNull();
  });

  it('migration 0010: the audit indexes exist, the trigger and the chain are untouched (verify ok after inserts), the app role still cannot update audit_log and cannot delete maintenance_runs; assets carry revoked_at and revoke_reason', async () => {
    const { rows: idx } = await t.pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'audit_log'");
    expect(idx.map((r) => r.indexname)).toEqual(expect.arrayContaining([
      'audit_log_seq_uq', 'audit_log_run_seq_idx', 'audit_log_session_seq_idx', 'audit_log_subject_seq_idx', 'audit_log_action_seq_idx', 'audit_log_ts_idx',
    ]));
    const { rows: trg } = await t.pool.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_log'::regclass AND NOT tgisinternal ORDER BY tgname");
    expect(trg.map((r) => r.tgname)).toEqual(['audit_log_chain', 'audit_log_no_truncate', 'audit_log_no_update']);
    await appendAudit(t.pool, { actorType: 'system', action: 'm10.check' });
    expect((await verifyAudit(t.pool)).ok).toBe(true);
    await expect(t.pool.query("UPDATE audit_log SET action = 'x' WHERE seq = 1")).rejects.toMatchObject({ code: '42501' });

    const { rows: m } = await t.pool.query("INSERT INTO maintenance_runs (id, kind, status) VALUES (gen_random_uuid(), 'backup', 'running') RETURNING id");
    await expect(t.pool.query('DELETE FROM maintenance_runs')).rejects.toMatchObject({ code: '42501' });
    await expect(t.pool.query("INSERT INTO maintenance_runs (id, kind, status) VALUES (gen_random_uuid(), 'gc_report', 'running')")).rejects.toMatchObject({ code: '23505' });
    await expect(t.pool.query("INSERT INTO maintenance_runs (id, kind, status) VALUES (gen_random_uuid(), 'nope', 'done')")).rejects.toMatchObject({ code: '23514' });
    await t.pool.query("UPDATE maintenance_runs SET status = 'done', ended_at = now() WHERE id = $1", [m[0].id]);
    await t.pool.query("INSERT INTO maintenance_runs (id, kind, status) VALUES (gen_random_uuid(), 'gc_report', 'running')");

    const cols = async (table: string) =>
      Object.fromEntries((await t.pool.query('SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = $1', [table])).rows.map((r) => [r.column_name, r.is_nullable]));
    expect(await cols('assets')).toMatchObject({ revoked_at: 'YES', revoke_reason: 'YES', updated_at: 'YES' });
    expect(await cols('blobs')).toMatchObject({ touched_at: 'NO' });
    const { rows: vidx } = await t.pool.query("SELECT indexdef FROM pg_indexes WHERE tablename = 'versions'");
    expect(vidx.some((r) => /\(video_id, round\)/.test(r.indexdef))).toBe(true);

    const admin = new pg.Client({ connectionString: t.adminUrl });
    await admin.connect();
    await expect(admin.query("UPDATE audit_log SET action = 'x' WHERE seq = 1")).rejects.toThrow('append-only');
    await admin.end();
  });
});
