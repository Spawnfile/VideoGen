import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { TraceRow } from '@videogen/shared';
import { FIXTURES_DIR, loadFixture, mapHistory, TraceMapper, type Msg } from '../src/index.ts';

const CWD = '/home/user/gpu-server/VideoGen/spikes/m0/work';

function live(name: string, cwd = CWD) {
  const mp = new TraceMapper({ sessionId: 's', cwd, now: () => 0 });
  const ops = loadFixture(name).flatMap((l) => mp.push(l.m, 0, l.t));
  return { mp, ops, rows: mp.list() };
}
const shape = (r: TraceRow) => ({
  id: r.id, kind: r.kind, variant: r.variant, title: r.title, detail: r.detail, status: r.status, add: r.add, del: r.del,
  count: r.count, items: r.items?.length, text: r.text, note: r.note, parent: r.parentToolUseId,
});

describe('TraceMapper', () => {
  it('basic: a settled reasoning row with streamed deltas and a text answer', () => {
    const { ops, rows } = live('basic');
    expect(rows.map((r) => r.variant)).toEqual(['reasoning', 'text']);
    expect(rows.every((r) => r.status === 'done')).toBe(true);
    expect(rows[0]!.text!.length).toBeGreaterThan(10);
    expect(rows[1]!.text).toBe('OK');
    expect(ops.filter((o) => o.op === 'delta').length).toBeGreaterThan(5);
  });

  it('attaches thinking_tokens estimates to the running reasoning row', () => {
    const { ops, rows } = live('basic');
    const tok = ops.filter((o) => o.op === 'tokens');
    expect(tok.length).toBeGreaterThan(0);
    expect(tok.every((o) => o.op === 'tokens' && o.rowId === rows[0]!.id)).toBe(true);
    expect(rows[0]!.tokens).toBeGreaterThan(0);
  });

  it('websearch: a search row with query, result items with domains, and the searchCount', () => {
    const { rows } = live('websearch');
    const s = rows.find((r) => r.tool === 'WebSearch')!;
    expect(s).toMatchObject({ variant: 'search', status: 'done', detail: 'ballpoint pen parts diagram', count: 1 });
    expect(s.items!.length).toBe(9);
    expect(s.items![0]).toMatchObject({ domain: 'nguyeneng21007.commons.gc.cuny.edu' });
  });

  it('coding: Write counts created lines, Edit counts +/- from structuredPatch, paths are run-relative', () => {
    const { rows } = live('coding', `${CWD}/coding`);
    const w = rows.find((r) => r.tool === 'Write')!;
    const e = rows.find((r) => r.tool === 'Edit')!;
    expect(w).toMatchObject({ variant: 'coding', title: 'Yaz', detail: 'notes.txt', add: 3, del: 0, status: 'done', mono: true });
    expect(e).toMatchObject({ title: 'Düzenle', detail: 'notes.txt', add: 1, del: 1, status: 'done' });
  });

  it('guard: the denied write is marked denied with the hook reason; the fallback write is done', () => {
    const { rows } = live('guard', `${CWD}/guard`);
    const writes = rows.filter((r) => r.tool === 'Write');
    expect(writes.map((r) => r.status)).toEqual(['denied', 'done']);
    expect(writes[0]!.text).toMatch(/^Writes are confined to the run directory/);
  });

  it('subagent-background: subagent row stays running after the async launch and settles on task_notification; child rows nest under it', () => {
    const mp = new TraceMapper({ sessionId: 's', now: () => 0 });
    const lines = loadFixture('subagent-background');
    let afterLaunch: TraceRow | undefined;
    for (const l of lines) {
      mp.push(l.m, 0, l.t);
      if (l.m.type === 'user' && JSON.stringify(l.m).includes('async_launched')) afterLaunch = mp.list().find((r) => r.kind === 'subagent');
    }
    expect(afterLaunch).toMatchObject({ status: 'running', note: 'arka planda', variant: 'steps', detail: 'storyboarder' });
    const sub = mp.list().find((r) => r.kind === 'subagent')!;
    expect(sub.status).toBe('done');
    expect(sub.text!.length).toBeGreaterThan(0);
    expect(mp.list().filter((r) => r.parentToolUseId === sub.id).length).toBeGreaterThan(0);
  });

  it('finish(cancelled) closes every running row: tools become errors, text becomes done', () => {
    const mp = new TraceMapper({ sessionId: 's', now: () => 0 });
    const lines = loadFixture('coding');
    const firstToolStart = lines.findIndex((l) => JSON.stringify(l.m).includes('"content_block_start"') && JSON.stringify(l.m).includes('"tool_use"'));
    for (const l of lines.slice(0, firstToolStart + 1)) mp.push(l.m, 0);
    expect(mp.activity()).toBe('tool');
    const ops = mp.finish('cancelled');
    expect(ops.length).toBeGreaterThan(0);
    expect(mp.list().some((r) => r.status === 'running')).toBe(false);
    expect(mp.list().find((r) => r.kind === 'tool')!.status).toBe('error');
  });

  it('history (persisted events, no stream_event / thinking_tokens) yields the same rows as live mapping for all fixtures', () => {
    const names = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.ndjson')).map((f) => f.replace('.ndjson', ''));
    for (const name of names) {
      const persisted = loadFixture(name).map((l) => l.m).filter((m: Msg) => m.type !== 'stream_event' && !(m.type === 'system' && m.subtype === 'thinking_tokens'));
      const hist = mapHistory('s', persisted.map((m) => ({ m, turn: 0 })), CWD);
      // Same rows, compared by id: a main-thread text row is created at content_block_start live but at its assistant
      // message in history, so interleaved subagent rows can sort differently (the UI nests them by parentToolUseId).
      const byId = (rows: TraceRow[]) => rows.map(shape).sort((x, y) => x.id.localeCompare(y.id));
      expect(byId(hist), name).toEqual(byId(live(name).rows));
    }
  });
});
