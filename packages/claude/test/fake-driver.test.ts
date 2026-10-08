import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeClaudeDriver, FIXTURES_DIR, loadFixture, type Msg, type SessionSpec } from '../src/index.ts';

function spec(over: Partial<SessionSpec> = {}): SessionSpec {
  return {
    sessionId: 's1', claudeSessionId: 's1', resume: false, role: 'chat', prompt: 'hi', model: 'haiku', effort: 'low',
    maxTurns: null, cwd: '/tmp', appendSystemPrompt: '', allowedTools: [], disallowedTools: [], outputFormat: null,
    tools: [], preToolUse: async () => ({ allow: true }), disableBackgroundTasks: true, ...over,
  };
}
const key = (m: Msg) => `${m.type}/${m.subtype ?? ''}`;

describe('FakeClaudeDriver', () => {
  it('replays every recorded fixture completely and in order', async () => {
    const names = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.ndjson')).map((f) => f.replace('.ndjson', ''));
    expect(names).toHaveLength(9); // eight recordings and long-trace (generated for smoke S8 by make-long-trace.mjs)
    const d = new FakeClaudeDriver({ speed: 0 });
    for (const name of names) {
      const s = d.start(spec({ fakeScript: { fixture: name } }));
      const got: Msg[] = [];
      const run = (async () => { for await (const m of s.messages) { got.push(m); if (m.type === 'result' && got.filter((x) => x.type === 'result').length === loadFixture(name).filter((l) => l.m.type === 'result').length) s.endInput(); } })();
      await (name === 'interrupt' ? run.catch(() => {}) : run);
      expect(got.map(key), name).toEqual(loadFixture(name).map((l) => key(l.m)));
    }
  });

  it('plays the next scripted turn on send() and ends after endInput()', async () => {
    const d = new FakeClaudeDriver({ speed: 0, pick: (_s, turn) => ({ fixture: turn === 0 ? 'basic' : 'coding' }) });
    const s = d.start(spec());
    let results = 0;
    const seen: string[] = [];
    for await (const m of s.messages) {
      if (m.type === 'system' && m.subtype === 'init') seen.push(String(m.session_id));
      if (m.type === 'result' && ++results === 1) s.send('again');
      else if (m.type === 'result') s.endInput();
    }
    expect(results).toBe(2);
    expect(seen).toHaveLength(2);
  });

  it('on interrupt yields the recorded tail and then throws like the SDK iterator', async () => {
    const d = new FakeClaudeDriver({ speed: 0 });
    const s = d.start(spec({ fakeScript: { fixture: 'coding', stall: { afterIndex: 5, ms: 60_000 } } }));
    const got: Msg[] = [];
    let ended = false;
    const run = (async () => {
      for await (const m of s.messages) {
        got.push(m);
        if (got.length === 6) void s.interrupt();
        // Real CLI in streaming-input mode (M3 real check): after the aborted result it waits for input; the iterator
        // throws only once the input is closed.
        if (m.type === 'result') setTimeout(() => { ended = true; s.endInput(); }, 30);
      }
    })();
    await expect(run).rejects.toThrow(/Claude Code returned an error result/);
    expect(ended).toBe(true);
    const last = got.at(-1)!;
    expect(last).toMatchObject({ type: 'result', subtype: 'error_during_execution', terminal_reason: 'aborted_streaming' });
    expect(JSON.stringify(got.find((m) => m.type === 'user'))).toContain('[Request interrupted by user]');
  });

  it('stall keeps the session silent with scripted CPU, and kill() ends it', async () => {
    const d = new FakeClaudeDriver({ speed: 0 });
    const s = d.start(spec({ fakeScript: { fixture: 'basic', stall: { afterIndex: 2, ms: 60_000, cpuPct: 30, zeroCpuAfterMs: 50 } } }));
    let n = 0;
    const run = (async () => { for await (const _m of s.messages) n++; })();
    await new Promise((r) => setTimeout(r, 20));
    expect(n).toBe(3);
    expect((await s.sample())?.cpuPct).toBe(30);
    await new Promise((r) => setTimeout(r, 60));
    expect((await s.sample())?.cpuPct).toBe(0);
    s.kill('SIGTERM');
    await expect(run).rejects.toThrow(/terminated by signal SIGTERM/);
  });

  it('gives every result of a scripted turn the script\'s structured output (pipeline steps in fake mode)', async () => {
    const d = new FakeClaudeDriver({ speed: 0 });
    const s = d.start(spec({ fakeScript: { fixture: 'subagent-background', structured: { ok: 1 } } }));
    const results: unknown[] = [];
    for await (const m of s.messages) {
      if (m.type === 'result') { results.push(m.structured_output); if (results.length === 2) s.endInput(); }
    }
    expect(results).toEqual([{ ok: 1 }, { ok: 1 }]);
    const plain = d.start(spec({ fakeScript: { fixture: 'basic' } }));
    for await (const m of plain.messages) if (m.type === 'result') { expect(m.structured_output).toBeUndefined(); plain.endInput(); }
  });
});
