import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getSession, insertSession, readAgentEvents } from '@videogen/db';
import { FakeClaudeDriver, loadFixture, type DriverSession, type FakeScript, type Msg, type SessionSpec } from '@videogen/claude';
import { createTestDb } from '../../../packages/db/test/helpers.ts';
import { chunkLive } from '../src/agents/live-chunks.ts';
import { SessionRunner, type RunnerHooks } from '../src/agents/runner.ts';

let t: Awaited<ReturnType<typeof createTestDb>>;
const data = mkdtempSync(join(tmpdir(), 'vg-runner-'));
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.drop(); });

const CWD = '/home/user/gpu-server/VideoGen/spikes/m0/work';
const spec = (fakeScript: FakeScript): SessionSpec => ({
  sessionId: 'x', claudeSessionId: 'x', resume: false, role: 'builder', prompt: 'p', model: 'haiku', effort: 'low', maxTurns: null, cwd: CWD,
  appendSystemPrompt: '', allowedTools: [], disallowedTools: [], outputFormat: null, tools: [], preToolUse: async () => ({ allow: true }),
  disableBackgroundTasks: true, fakeScript,
});

async function start(fixture: string | FakeScript, o: { kind?: 'pipeline' | 'chat'; hooks?: RunnerHooks; session?: DriverSession; deps?: object } = {}) {
  const id = randomUUID();
  await insertSession(t.pool, { id, kind: o.kind ?? 'pipeline', role: 'builder', model: 'haiku', effort: 'low', claudeSessionId: id, runDir: CWD, status: 'starting' });
  const script = typeof fixture === 'string' ? { fixture } : fixture;
  const session = o.session ?? new FakeClaudeDriver({ speed: 0 }).start(spec(script));
  const runner = new SessionRunner({ pool: t.pool, dataDir: data, flushMs: 10, ...o.deps }, { id, kind: o.kind ?? 'pipeline', role: 'builder', cwd: CWD }, session, o.hooks);
  return { id, runner };
}
const audits = async (id: string) => (await t.pool.query('SELECT action, tool_use_id, data FROM audit_log WHERE session_id = $1 ORDER BY seq', [id])).rows;
const traceRows = async (id: string) => (await t.pool.query("SELECT payload FROM ui_events WHERE topic = $1 AND type = 'trace.row' ORDER BY id", [`session:${id}`])).rows.map((r) => r.payload);

describe('SessionRunner', () => {
  it('persists a session: status, accounting, agent_events without stream deltas, trace rows, raw gz and audit', async () => {
    const { id, runner } = await start('basic');
    const end = await runner.run();
    expect(end).toMatchObject({ status: 'done', resultIsError: false });
    const s = await getSession(t.pool, id);
    expect(s).toMatchObject({ status: 'done', numTurns: 1, terminalReason: 'completed' });
    expect(s!.tokens).toBeGreaterThan(29_000);
    expect(s!.costUsd).toBeCloseTo(0.061131, 6);
    const ev = await readAgentEvents(t.pool, id);
    const persisted = loadFixture('basic').filter((l) => l.m.type !== 'stream_event' && l.m.subtype !== 'thinking_tokens');
    expect(ev.map((e) => e.type)).toEqual(persisted.map((l) => l.m.type));
    expect(ev.map((e) => e.seq)).toEqual(persisted.map((_, i) => i + 1));
    const rows = await traceRows(id);
    expect(rows.at(-1)).toMatchObject({ variant: 'text', status: 'done', text: 'OK' });
    const raw = gunzipSync(readFileSync(join(data, 'agent-raw', `${id}.ndjson.gz`))).toString().trim().split('\n');
    expect(raw).toHaveLength(loadFixture('basic').length);
    expect((await audits(id)).map((a) => a.action)).toContain('agent.session.closed');
  });

  it('audits tool calls and file writes', async () => {
    const { id, runner } = await start('coding');
    await runner.run();
    const a = await audits(id);
    const tools = a.filter((x) => x.action === 'agent.tool').map((x) => [x.data.tool, x.data.status]);
    expect(tools).toEqual([['Write', 'done'], ['Edit', 'done']]);
    const writes = a.filter((x) => x.action === 'agent.file_write');
    expect(writes.map((x) => x.data.path)).toEqual(['coding/notes.txt', 'coding/notes.txt']);
    expect(writes[0].tool_use_id).toMatch(/^toolu_/);
  });

  it('a NUL character in a tool call or result (cat of a binary file) is stored without it and loses no event or trace row', async () => {
    // jsonb rejects \u0000: unsanitised, the event insert fails and the flush stops at the first such row.
    const call = { type: 'assistant', message: { id: 'msg_nul', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_nul', name: 'Bash', input: { command: 'cat scene/a\u0000.blend' } }] }, parent_tool_use_id: null, session_id: 'x', uuid: 'u-nul-1' } as unknown as Msg;
    const result = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_nul', content: 'BLENDER\u0000\u0000v3' }] }, parent_tool_use_id: null, session_id: 'x', uuid: 'u-nul-2' } as unknown as Msg;
    const { id, runner } = await start({ fixture: 'coding', inject: [{ afterIndex: 177, m: call }, { afterIndex: 177, m: result }] });
    expect(await runner.run()).toMatchObject({ status: 'done' });
    const ev = (await readAgentEvents(t.pool, id)).filter((e) => JSON.stringify(e.payload).includes('toolu_nul'));
    expect(ev).toHaveLength(2);
    expect(JSON.stringify(ev)).not.toContain('\\u0000');
    const rows = await traceRows(id);
    expect(rows.filter((r) => r.id === 'toolu_nul').at(-1)).toMatchObject({ tool: 'Bash', status: 'done' });
    expect(rows.filter((r) => r.title === 'Düzenle').at(-1)).toMatchObject({ status: 'done' });
    expect((await audits(id)).filter((a) => a.action === 'agent.tool').map((a) => a.data.tool)).toEqual(['Write', 'Bash', 'Edit']);
  });

  it('records guard denials: audit status denied and permission_denials on the session', async () => {
    const { id, runner } = await start('guard');
    await runner.run();
    expect((await audits(id)).filter((x) => x.action === 'agent.tool').map((x) => x.data.status)).toEqual(['denied', 'done']);
    expect((await getSession(t.pool, id)) as unknown).toBeTruthy();
    const { rows } = await t.pool.query('SELECT permission_denials FROM agent_sessions WHERE id = $1', [id]);
    expect(rows[0].permission_denials).toEqual([{ tool: 'Write', toolUseId: expect.stringMatching(/^toolu_/) }]);
  });

  it('a backgrounded subagent completes the turn only on the final result and passes its structured output', async () => {
    const done: unknown[] = [];
    const { id, runner } = await start('subagent-background', { hooks: { onTurnComplete: (r) => { done.push(r.structured); } } });
    await runner.run();
    expect(done).toHaveLength(1);
    expect((done[0] as { scenes: unknown[] }).scenes.length).toBeGreaterThan(0);
    expect(await getSession(t.pool, id)).toMatchObject({ status: 'done', numTurns: 5 });
  });

  it('cancel() during a stall interrupts, ends cancelled and leaves no running trace rows', async () => {
    const { id, runner } = await start({ fixture: 'coding', stall: { afterIndex: 30, ms: 60_000 } });
    const run = runner.run();
    await new Promise((r) => setTimeout(r, 50));
    await runner.cancel();
    expect((await run).status).toBe('cancelled');
    expect(await getSession(t.pool, id)).toMatchObject({ status: 'cancelled' });
    const latest = new Map<string, { status: string }>();
    for (const r of await traceRows(id)) latest.set(r.id, r);
    expect([...latest.values()].some((r) => r.status === 'running')).toBe(false);
    expect((await audits(id)).map((a) => a.action)).toEqual(expect.arrayContaining(['agent.session.cancel_requested', 'agent.session.closed']));
  });

  it('a chat cancel ends on the aborted result at once: no turn completion, input closed, status cancelled', async () => {
    const turns: unknown[] = [];
    const { id, runner } = await start({ fixture: 'basic', stall: { afterIndex: 5, ms: 60_000 } }, { kind: 'chat', hooks: { onTurnComplete: (r) => { turns.push(r); } }, deps: { resultWaitMs: 5_000 } });
    const run = runner.run();
    await new Promise((r) => setTimeout(r, 50));
    const t0 = Date.now();
    await runner.cancel();
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect((await run).status).toBe('cancelled');
    expect(turns).toEqual([]);
    expect(await getSession(t.pool, id)).toMatchObject({ status: 'cancelled' });
  });

  it('escalates to SIGTERM then SIGKILL when the CLI ignores the interrupt', async () => {
    const signals: string[] = [];
    let release!: () => void;
    const stuck = new Promise<void>((r) => { release = r; });
    const session: DriverSession = {
      pid: null,
      messages: (async function* () { yield loadFixture('basic')[0]!.m; await stuck; throw new Error('Claude Code process terminated by signal SIGKILL'); })(),
      send: () => {}, endInput: () => {}, interrupt: () => new Promise(() => {}), sample: async () => null,
      kill: (s) => { signals.push(s); if (s === 'SIGKILL') release(); },
    };
    const { id, runner } = await start('basic', { session, deps: { resultWaitMs: 20, cancelGraceMs: 30, killGraceMs: 30 } });
    const run = runner.run();
    await new Promise((r) => setTimeout(r, 20));
    await runner.cancel();
    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect((await run).status).toBe('cancelled');
    expect(await getSession(t.pool, id)).toMatchObject({ status: 'cancelled' });
  });

  it('live deltas are chunked under the NOTIFY limit and none are lost', async () => {
    const big = 'ğ'.repeat(20_000);
    const chunks = chunkLive('s', [{ rowId: 'r1', text: big }, { rowId: 'r1', text: 'x' }, { rowId: 'r2', tokens: 5 }, { rowId: 'r2', tokens: 9 }]);
    for (const c of chunks) expect(Buffer.byteLength(JSON.stringify({ topic: 'session:s', type: 'trace.delta', payload: c }))).toBeLessThanOrEqual(7900);
    const text = chunks.flatMap((c) => c.d).filter((d) => d.rowId === 'r1').map((d) => d.text).join('');
    expect(text).toBe(`${big}x`);
    expect(chunks.flatMap((c) => c.d).filter((d) => d.rowId === 'r2')).toEqual([{ rowId: 'r2', tokens: 9 }]);

    const listener = new pg.Client({ connectionString: t.appUrl });
    await listener.connect();
    let notifies = 0;
    listener.on('notification', (n) => { if (n.channel === 'vg_live' && n.payload?.includes('trace.delta')) notifies++; });
    await listener.query('LISTEN vg_live');
    const { runner } = await start('basic');
    await runner.run();
    await new Promise((r) => setTimeout(r, 100));
    await listener.end();
    const deltas = loadFixture('basic').filter((l: { m: Msg }) => l.m.type === 'stream_event').length;
    expect(notifies).toBeGreaterThan(0);
    expect(notifies).toBeLessThan(deltas);
  });
});
