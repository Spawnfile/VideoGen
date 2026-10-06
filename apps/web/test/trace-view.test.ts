import { describe, expect, it } from 'vitest';
import type { TraceRow } from '@videogen/shared/browser';
import { loadFixture, mapHistory } from '@videogen/claude';
import { blockLabels, buildBlocks, formatAgo, formatElapsed, formatTokens, modelLabel, STATUS_LABEL, type ThinkingBlock, type TraceBlock, withoutAnswer } from '../src/lib/trace-view.ts';

const CWD = '/home/user/gpu-server/VideoGen/spikes/m0/work';
const rowsOf = (name: string, cwd = CWD) => mapHistory('s', loadFixture(name).map((l) => ({ m: l.m, turn: 0, at: l.t })), cwd);
const thinking = (bs: TraceBlock[]) => bs.filter((b): b is ThinkingBlock => b.kind === 'thinking');

describe('trace view model', () => {
  it('websearch: reasoning, a search block with the query and result rows, then the answer text', () => {
    const blocks = buildBlocks(rowsOf('websearch'));
    expect(blocks.map((b) => (b.kind === 'text' ? 'text' : b.variant))).toEqual(['reasoning', 'search', 'reasoning', 'text']);
    const s = thinking(blocks).find((b) => b.variant === 'search')!;
    expect(s.rows[0]).toMatchObject({ kind: 'query', primary: 'ballpoint pen parts diagram' });
    expect(s.rows.filter((r) => r.kind === 'result').map((r) => r.secondary).slice(0, 1)).toEqual(['nguyeneng21007.commons.gc.cuny.edu']);
    expect(s.rows.at(-1)!.primary).toBe('+1 kaynak daha');
    expect(blockLabels(s).done).toBe("Web'de arandı, 9 kaynak");
    expect(blockLabels(thinking(blocks)[0]!).done).toMatch(/^\d+ saniye düşündü$/);
  });

  it('coding: write and edit rows carry run-relative paths and +/- counts', () => {
    const rows = thinking(buildBlocks(rowsOf('coding', `${CWD}/coding`))).filter((b) => b.variant === 'coding').flatMap((b) => b.rows);
    expect(rows.map((r) => [r.primary, r.secondary, r.add, r.del])).toEqual([['Yaz', 'notes.txt', 3, 0], ['Düzenle', 'notes.txt', 1, 1]]);
  });

  it('guard: the denied write shows the guard reason', () => {
    const rows = thinking(buildBlocks(rowsOf('guard', `${CWD}/guard`))).flatMap((b) => b.rows).filter((r) => r.primary === 'Yaz');
    expect(rows.map((r) => r.tone)).toEqual(['denied', 'normal']);
    expect(rows[0]!.detail).toMatch(/^Koruma reddetti: Writes are confined/);
  });

  it('subagent: a steps row nests the subagent trace as children', () => {
    const steps = thinking(buildBlocks(rowsOf('subagent-nobg'))).find((b) => b.variant === 'steps')!;
    expect(steps.rows[0]).toMatchObject({ secondary: 'storyboarder', tone: 'normal' });
    expect(steps.rows[0]!.children!.length).toBeGreaterThan(0);
  });

  it('a running block is live; an empty reasoning row shows its token estimate', () => {
    const r: TraceRow = { id: 'x', sessionId: 's', turn: 0, seq: 1, parentToolUseId: null, variant: 'reasoning', kind: 'thinking', title: 'Düşünce', status: 'running', text: '', tokens: 120, startedAt: 0 };
    const [b] = thinking(buildBlocks([r]));
    expect(b).toMatchObject({ live: true, endedAt: null });
    expect(b!.rows[0]!.primary).toBe('120 token düşündü');
    expect(blockLabels(b!).active).toBe('Düşünüyor');
  });

  it('an answered turn drops only its final text block (the reply message carries it); earlier prose stays', () => {
    // Real haiku turn (M3 T7): prose, get_context, prose — result.text is only the last one.
    const base = { sessionId: 's', turn: 0, parentToolUseId: null, status: 'done' as const, startedAt: 0 };
    const rows: TraceRow[] = [
      { ...base, id: 'a', seq: 1, variant: 'text', kind: 'text', title: 'Yanıt', text: 'Önce tanıtım.' },
      { ...base, id: 'b', seq: 2, variant: 'coding', kind: 'tool', title: 'get_context', tool: 'mcp__videogen__get_context' },
      { ...base, id: 'c', seq: 3, variant: 'text', kind: 'text', title: 'Yanıt', text: 'Son yanıt.' },
    ];
    const kept = withoutAnswer(buildBlocks(rows));
    expect(kept.map((b) => (b.kind === 'text' ? `text:${b.text}` : b.variant))).toEqual(['text:Önce tanıtım.', 'coding']);
  });

  it('formats models, statuses, ages, durations and token counts in Turkish', () => {
    expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5');
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5');
    expect(modelLabel('opus')).toBe('Opus');
    expect(STATUS_LABEL.tool).toBe('araç çalıştırıyor');
    expect(STATUS_LABEL.waiting_limit).toBe('limit bekleniyor');
    expect(formatAgo(2_400)).toBe('2 sn önce');
    expect(formatAgo(125_000)).toBe('2 dk önce');
    expect(formatElapsed(252_000)).toBe('4:12');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(formatTokens(41_234)).toBe('41K');
    expect(formatTokens(812)).toBe('812');
    expect(formatTokens(1_250_000)).toBe('1,3M');
  });
});
