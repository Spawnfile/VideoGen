import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getSession, insertSession } from '@videogen/db';
import { FakeClaudeDriver, groupAlive, type ClaudeDriver, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { SessionManager, type ManagerDeps, type ToolHost, type ToolSession } from '../src/agents/manager.ts';
import { reapOrphans, recoverOnStartup, writePidFile } from '../src/agents/pids.ts';
import { archiveTranscript } from '../src/agents/transcripts.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const managers: SessionManager[] = [];
afterEach(async () => { for (const m of managers.splice(0)) await m.stop(); });

const STALL = { fixture: 'basic', stall: { afterIndex: 1, ms: 60_000 } };
function make(over: Partial<ManagerDeps> = {}) {
  const m = new SessionManager({
    pool: t.pool, dataDir: mkdtempSync(join(tmpdir(), 'vg-mgr-')), driver: new FakeClaudeDriver({ speed: 0 }), pluginDir: join(import.meta.dirname, '../../../claude-plugin'),
    sampleEveryMs: 20, pumpRetryMs: 30, runner: { flushMs: 5, resultWaitMs: 50, cancelGraceMs: 50, killGraceMs: 50 }, memAvailableMb: () => 8_000, ...over,
  });
  managers.push(m);
  return m;
}
const status = async (id: string) => (await getSession(t.pool, id))!.status;

describe('SessionManager', () => {
  it('runs at most 3 pipeline sessions and starts the queued one when a slot frees', async () => {
    const m = make();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push(await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p', fakeScript: STALL })); // queue order = call order
    await vi.waitFor(async () => expect(await Promise.all(ids.slice(0, 3).map(status))).toEqual(['thinking', 'thinking', 'thinking']));
    expect(await status(ids[3]!)).toBe('queued');
    await m.cancel(ids[0]!);
    await vi.waitFor(async () => expect(await status(ids[3]!)).toBe('thinking'));
    expect(await status(ids[0]!)).toBe('cancelled');
  });

  it('keeps one reserved chat slot: chat starts while pipelines are full, a second chat waits', async () => {
    const m = make();
    for (let i = 0; i < 3; i++) await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p', fakeScript: STALL });
    const c1 = await m.start({ kind: 'chat', role: 'chat', prompt: 'merhaba', threadId: null, fakeScript: STALL });
    const c2 = await m.start({ kind: 'chat', role: 'chat', prompt: 'iki', fakeScript: STALL });
    await vi.waitFor(async () => expect(await status(c1)).toBe('thinking'));
    expect(await status(c2)).toBe('queued');
  });

  it('defers spawning while MemAvailable is below 1 GB and audits it once', async () => {
    let free = 500;
    const m = make({ memAvailableMb: () => free });
    const id = await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p', fakeScript: STALL });
    await new Promise((r) => setTimeout(r, 150));
    expect(await status(id)).toBe('queued');
    const { rows } = await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE session_id = $1 AND action = 'agent.session.deferred_ram'", [id]);
    expect(rows[0].n).toBe(1);
    free = 4_000;
    await vi.waitFor(async () => expect(await status(id)).toBe('thinking'));
  });

  it('chat: idle after a turn, a second turn on the same process, closes after the idle timeout', async () => {
    const m = make({ chatIdleMs: 2000, driver: new FakeClaudeDriver({ speed: 0, pick: (_s, turn) => ({ fixture: turn === 0 ? 'basic' : 'coding' }) }) });
    const turns: number[] = [];
    const ended: string[] = [];
    m.events = { onTurnComplete: (_id, r) => { turns.push(r.turn); }, onEnd: (_id, e) => { ended.push(e.status); } };
    const id = await m.start({ kind: 'chat', role: 'chat', prompt: 'merhaba' });
    await vi.waitFor(async () => expect(await status(id)).toBe('idle'));
    expect(m.sendChat(id, 'devam')).toBe(1);
    await vi.waitFor(() => expect(turns).toEqual([0, 1]));
    await vi.waitFor(async () => expect(await status(id)).toBe('done'), { timeout: 5000 });
    await vi.waitFor(() => expect(ended).toEqual(['done'])); // onEnd runs after the runner stored 'done'
    expect(m.isLive(id)).toBe(false);
  });

  it('a chat message in the idle-close window is not handed to the closing process (sendChat → null, the caller resumes)', async () => {
    const fake = new FakeClaudeDriver({ speed: 0, pick: () => ({ fixture: 'basic' }) });
    // The real CLI takes a while to exit after its input closes; hold the fake's end for 400 ms to open that window.
    const driver: ClaudeDriver = {
      kind: 'fake',
      start: (s) => {
        const ses = fake.start(s);
        return new Proxy(ses, {
          get: (o, k) => (k === 'endInput' ? () => { setTimeout(() => o.endInput(), 400); } : ((v) => (typeof v === 'function' ? v.bind(o) : v))(Reflect.get(o, k))),
        });
      },
    };
    const m = make({ chatIdleMs: 50, driver });
    const id = await m.start({ kind: 'chat', role: 'chat', prompt: 'merhaba' });
    await vi.waitFor(async () => {
      const { rows } = await t.pool.query("SELECT 1 FROM audit_log WHERE session_id = $1 AND action = 'agent.session.idle_closed'", [id]);
      expect(rows).toHaveLength(1);
    });
    expect(m.isLive(id)).toBe(true);
    expect(m.sendChat(id, 'devam')).toBeNull();
    await vi.waitFor(async () => expect(await status(id)).toBe('done'));
  });

  it('publishes liveness samples: active → quiet_alive → maybe_stuck, and audits the stuck transition once', async () => {
    const m = make({ quietAfterMs: 60, stuckAfterMs: 160 });
    const listener = new pg.Client({ connectionString: t.appUrl });
    await listener.connect();
    const seen: string[] = [];
    let id = '';
    listener.on('notification', (n) => {
      const p = JSON.parse(n.payload ?? '{}');
      if (p.type === 'agent.sample' && p.payload.sessionId === id && seen.at(-1) !== p.payload.liveness) seen.push(p.payload.liveness);
    });
    await listener.query('LISTEN vg_live');
    id = await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p', fakeScript: { fixture: 'basic', stall: { afterIndex: 2, ms: 60_000, cpuPct: 30, zeroCpuAfterMs: 200 } } });
    await vi.waitFor(() => expect(seen).toEqual(['active', 'quiet_alive', 'maybe_stuck']), { timeout: 3000 });
    await listener.end();
    const { rows } = await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE session_id = $1 AND action = 'agent.session.maybe_stuck'", [id]);
    expect(rows[0].n).toBe(1);
  });

  it('a worker-side tool call (Blender, a GPU queue) keeps a silent session alive and shows the GPU wait (plan B8, B9)', async () => {
    const specs: SessionSpec[] = [];
    const fake = new FakeClaudeDriver({ speed: 0 });
    const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
    let finish = () => {};
    const tools: ToolHost = {
      ports: (s) => ({
        buildScene: async () => {
          s.gpuWait({ position: 1 });
          await new Promise<void>((r) => { finish = r; });
          s.gpuWait(null);
          return { ok: true, errors: [], warnings: [], report: null, equivalence: null, files: null };
        },
      }),
    };
    const m = make({ driver, tools, quietAfterMs: 40, stuckAfterMs: 120 });
    const id = await m.start({ kind: 'pipeline', role: 'builder', prompt: 'p', runId: randomUUID(), fakeScript: { fixture: 'basic', stall: { afterIndex: 2, ms: 60_000, cpuPct: 0, zeroCpuAfterMs: 0 } } });
    await vi.waitFor(async () => expect(await status(id)).toBe('thinking'));
    const call = specs[0]!.tools.find((t) => t.name === 'build_scene')!.handler({});
    await vi.waitFor(async () => expect(await status(id)).toBe('waiting_gpu'));
    await new Promise((r) => setTimeout(r, 400));
    const stuck = async () => (await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE session_id = $1 AND action = 'agent.session.maybe_stuck'", [id])).rows[0].n;
    expect(await stuck()).toBe(0);
    finish();
    await call;
    await vi.waitFor(async () => expect(await status(id)).toBe('tool'));
    await vi.waitFor(async () => expect(await stuck()).toBe(1), { timeout: 3000 }); // silent and idle again: the warning comes back
  });

  it('cancelling a session aborts the signal its tools received', async () => {
    let seen: ToolSession | null = null;
    const m = make({ tools: { ports: (s) => { seen = s; return {}; } } });
    const id = await m.start({ kind: 'pipeline', role: 'builder', prompt: 'p', runId: randomUUID(), fakeScript: STALL });
    await vi.waitFor(async () => expect(await status(id)).toBe('thinking'));
    expect(seen!.signal.aborted).toBe(false);
    await m.cancel(id);
    expect(seen!.signal.aborted).toBe(true);
  });

  it('retry resumes the same Claude session as a child session and cancels the old one', async () => {
    const specs: SessionSpec[] = [];
    const fake = new FakeClaudeDriver({ speed: 0, pick: () => STALL });
    const driver: ClaudeDriver = { kind: 'fake', start: (s) => { specs.push(s); return fake.start(s); } };
    const m = make({ driver });
    const old = await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p' });
    await vi.waitFor(async () => expect(await status(old)).toBe('thinking'));
    const nid = (await m.retry(old))!;
    expect(await status(old)).toBe('cancelled');
    const rec = (await getSession(t.pool, nid))!;
    expect(rec).toMatchObject({ parentSessionId: old, claudeSessionId: (await getSession(t.pool, old))!.claudeSessionId });
    await vi.waitFor(() => expect(specs).toHaveLength(2));
    expect(specs[1]).toMatchObject({ resume: true, claudeSessionId: specs[0]!.claudeSessionId });
  });

  it('report_progress is clamped to [last, 99] and stored with source agent', async () => {
    const outs: string[] = [];
    const fake = new FakeClaudeDriver({ speed: 0 });
    const driver: ClaudeDriver = {
      kind: 'fake',
      start: (s) => {
        const tool = s.tools.find((x) => x.name === 'report_progress')!;
        void (async () => { for (const percent of [40, 20, 150]) outs.push((await tool.handler({ percent, message: `m${percent}` })).content[0]!.text); })();
        return fake.start({ ...s, fakeScript: STALL });
      },
    };
    const m = make({ driver });
    const id = await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p' });
    await vi.waitFor(async () => expect(await getSession(t.pool, id)).toMatchObject({ progress: 99, progressSource: 'agent', progressMessage: 'm150' }));
    await vi.waitFor(() => expect(outs).toEqual(['ok: 40', 'ok: 40', 'ok: 99'])); // the tool returns after the row update and publish
  });

  it('notifies every subscriber (and the legacy events slot) of turns and ends, and stores runId/stepId', async () => {
    const m = make({ driver: new FakeClaudeDriver({ speed: 0 }) });
    const a: string[] = [];
    const b: string[] = [];
    m.events = { onEnd: (_id, e) => { a.push(`legacy:${e.status}`); } };
    const off = m.subscribe({ onTurnComplete: (_id, r) => { b.push(`turn:${String((r.structured as { ok?: number } | null)?.ok)}`); }, onEnd: (_id, e) => { b.push(`end:${e.status}`); } });
    const runId = randomUUID();
    const stepId = randomUUID();
    const id = await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p', runId, stepId, fakeScript: { fixture: 'basic', structured: { ok: 1 } } });
    await vi.waitFor(() => expect(b).toEqual(['turn:1', 'end:done']));
    expect(a).toEqual(['legacy:done']);
    const { rows } = await t.pool.query('SELECT run_id, step_id FROM agent_sessions WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ run_id: runId, step_id: stepId });
    off();
    await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p', fakeScript: { fixture: 'basic' } });
    await vi.waitFor(() => expect(a).toEqual(['legacy:done', 'legacy:done']));
    expect(b).toHaveLength(2);
  });

  it('emits progress reports and status changes to subscribers', async () => {
    const outs: string[] = [];
    const fake = new FakeClaudeDriver({ speed: 0 });
    const driver: ClaudeDriver = {
      kind: 'fake',
      start: (s) => {
        const tool = s.tools.find((x) => x.name === 'report_progress')!;
        void (async () => { await tool.handler({ percent: 30, message: 'kaynaklar' }); })();
        return fake.start({ ...s, fakeScript: STALL });
      },
    };
    const m = make({ driver });
    m.subscribe({ onProgress: (_id, pct, msg) => { outs.push(`p:${pct}:${msg}`); }, onStatus: (_id, st) => { if (!outs.includes(`s:${st}`)) outs.push(`s:${st}`); } });
    const id = await m.start({ kind: 'pipeline', role: 'researcher', prompt: 'p' });
    await vi.waitFor(() => expect(outs).toEqual(expect.arrayContaining(['s:queued', 's:starting', 'p:30:kaynaklar'])));
    await m.cancel(id);
    await vi.waitFor(() => expect(outs).toContain('s:cancelled'));
  });
});

describe('startup recovery and transcripts', () => {
  it('kills orphaned claude process groups from pid files and fails sessions left active', async () => {
    const data = mkdtempSync(join(tmpdir(), 'vg-reap-'));
    const child = spawn('bash', ['-c', 'exec -a claude-fake sleep 30'], { detached: true, stdio: 'ignore' });
    const exited = new Promise((res) => child.once('exit', res)); // before the kill: the event must not be missed
    await writePidFile(data, child.pid!, 'x');
    const other = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    await writePidFile(data, other.pid!, 'y');
    const stale = { id: crypto.randomUUID(), kind: 'pipeline' as const, role: 'builder' as const, model: 'opus', effort: 'high' as const, runDir: '/tmp', status: 'tool' as const };
    await insertSession(t.pool, { ...stale, claudeSessionId: stale.id });
    const r = await recoverOnStartup(t.pool, data);
    expect(r.killed).toEqual([child.pid]);
    await exited;
    expect(groupAlive(child.pid!)).toBe(false);
    expect(groupAlive(other.pid!)).toBe(true);
    process.kill(-other.pid!, 'SIGKILL');
    expect(r.orphaned).toContain(stale.id);
    expect(await getSession(t.pool, stale.id)).toMatchObject({ status: 'failed', terminalReason: 'worker_restart' });
    expect(existsSync(join(data, 'pids', `${child.pid}.json`))).toBe(false);
    expect(await reapOrphans(data)).toEqual([]);
  });

  it('archives the session transcript and subagent transcripts gzipped, recording the blob', async () => {
    const config = mkdtempSync(join(tmpdir(), 'vg-cfg-'));
    const data = mkdtempSync(join(tmpdir(), 'vg-arch-'));
    const cid = crypto.randomUUID();
    mkdirSync(join(config, 'projects', '-tmp-run', cid, 'subagents'), { recursive: true });
    writeFileSync(join(config, 'projects', '-tmp-run', `${cid}.jsonl`), '{"a":1}\n');
    writeFileSync(join(config, 'projects', '-tmp-run', cid, 'subagents', 'agent-x.jsonl'), '{"b":2}\n');
    const sha = await archiveTranscript({ pool: t.pool, dataDir: data, sessionId: 's1', claudeSessionId: cid, configDir: config });
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    const dir = join(data, 'archive', 'transcripts', 's1');
    expect(gunzipSync(readFileSync(join(dir, `${cid}.jsonl.gz`))).toString()).toBe('{"a":1}\n');
    expect(gunzipSync(readFileSync(join(dir, 'subagents', 'agent-x.jsonl.gz'))).toString()).toBe('{"b":2}\n');
    expect(await archiveTranscript({ pool: t.pool, dataDir: data, sessionId: 's2', claudeSessionId: crypto.randomUUID(), configDir: config })).toBeNull();
  });
});
