import { describe, expect, it } from 'vitest';
import type { AuditRow } from '@videogen/shared/browser';
import { auditView, chainView, filterFromQuery, queryFromFilter, toolInputView } from '../src/lib/audit-view.ts';

const NOW = new Date('2026-10-08T12:00:00Z');
const RUN = '00000000-0000-4000-8000-0000000000aa';
const VIDEO = '00000000-0000-4000-8000-0000000000bb';
const row = (o: Partial<AuditRow>): AuditRow => ({
  seq: 1, ts: '2026-10-08T07:42:05Z', actorType: 'system', actorId: null, action: 'worker.started', subjectType: null, subjectId: null,
  runId: null, stepId: null, sessionId: null, toolUseId: null, data: {}, hash: 'h', ...o,
});

describe('audit explorer helpers (plan M7 T3)', () => {
  it("auditView and chainView: rows read 'saat · aktör · eylem · konu' in Turkish with tones for failed, rejected and cancelled actions; the chain badge says valid with the count and time, broken with the first bad row, and unknown on an error", () => {
    const { rows } = auditView([
      row({ seq: 9, actorType: 'agent', actorId: 'builder:00000000-0000-4000-8000-000000000001', action: 'agent.tool', subjectType: 'video', subjectId: VIDEO, data: { tool: 'Edit', file: 'scene.ts' } }),
      row({ seq: 8, ts: '2026-10-07T18:05:00Z', actorType: 'user', action: 'run.cancel_requested', subjectType: 'run', subjectId: RUN }),
      row({ seq: 7, actorType: 'orchestrator', action: 'render.draft_rejected' }),
      row({ seq: 6, action: 'usage.read_failed', data: null }),
      row({ seq: 5, action: 'agent.session.refused' }),
      row({ seq: 4, action: 'run.completed' }),
    ], NOW);
    expect(rows[0]).toEqual({ seq: 9, time: '10:42:05', actor: 'builder', action: 'agent.tool', subject: 'video 00000000…', summary: 'tool: Edit · file: scene.ts', tone: 'neutral' });
    // Another day (Istanbul time) carries the date.
    expect(rows[1]).toMatchObject({ time: '7 Eki 21:05', actor: 'Kullanıcı', subject: 'run 00000000…', summary: '', tone: 'warn' });
    expect(rows[2]).toMatchObject({ actor: 'Orkestratör', subject: '—', tone: 'error' });
    expect(rows.slice(3).map((r) => [r.actor, r.tone])).toEqual([['Sistem', 'error'], ['Sistem', 'error'], ['Sistem', 'ok']]);
    // A path subject shows its file name.
    expect(auditView([row({ subjectType: 'file', subjectId: '/w/spikes/coding/notes.txt' })], NOW).rows[0]!.subject).toBe('file notes.txt');
    // Long data is cut for the table.
    const long = auditView([row({ data: { note: 'x'.repeat(300) } })], NOW).rows[0]!.summary;
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith('…')).toBe(true);

    const base = { checkedAt: '2026-10-08T07:42:30Z', ms: 812, lastSeq: 12345 };
    expect(chainView({ ...base, ok: true, checked: 12345, firstBadSeq: null })).toEqual({
      text: 'Zincir geçerli · 12 345 satır · 10:42', tone: 'ok', detail: '12 345 satır 0,8 sn\'de tarandı',
    });
    expect(chainView({ ...base, ok: true, checked: 12345, firstBadSeq: null, cached: true }).detail).toBe('12 345 satır 0,8 sn\'de tarandı · önbellekten');
    expect(chainView({ ...base, ms: 40, ok: true, checked: 4, firstBadSeq: null }).detail).toBe("4 satır 40 ms'de tarandı");
    expect(chainView({ ...base, ok: false, checked: 812, firstBadSeq: 812 })).toMatchObject({ text: 'Zincir bozuk: satır 812', tone: 'error' });
    expect(chainView(null, new Error('/api/audit/verify: 500'))).toEqual({ text: 'Doğrulanamadı', tone: 'neutral', detail: '/api/audit/verify: 500' });
    expect(chainView(null)).toMatchObject({ text: 'Zincir doğrulanıyor…', tone: 'neutral' });
  });

  it('filters round-trip through the URL (run, video, role, action prefix, dates); toolInputView turns an Edit into before/after columns, a Write into its content and anything else into pretty JSON', () => {
    const f = { runId: RUN, videoId: VIDEO, role: 'builder', action: 'publish.*', from: '2026-10-01', to: '2026-10-08' };
    const q = queryFromFilter(f);
    expect(q.startsWith('?')).toBe(true);
    expect(filterFromQuery(q)).toEqual(f);
    expect(queryFromFilter({})).toBe('');
    expect(filterFromQuery('')).toEqual({});
    // Bad values never reach the API (it would answer 400).
    expect(filterFromQuery('?run=nope&role=Bad%20Role&action=x;drop&from=yesterday&video=' + VIDEO)).toEqual({ videoId: VIDEO });
    // Session filters survive as well (the trace links use them).
    expect(filterFromQuery(queryFromFilter({ sessionId: RUN }))).toEqual({ sessionId: RUN });

    expect(toolInputView('Edit', { file_path: '/w/scene.ts', old_string: 'a = 1', new_string: 'a = 2' })).toEqual({ kind: 'edit', path: '/w/scene.ts', before: 'a = 1', after: 'a = 2' });
    expect(toolInputView('Write', { file_path: '/w/plan.md', content: '# Plan' })).toEqual({ kind: 'write', path: '/w/plan.md', content: '# Plan' });
    expect(toolInputView('Bash', { command: 'ls' })).toEqual({ kind: 'json', text: '{\n  "command": "ls"\n}' });
    // An Edit without its strings falls back to JSON rather than an empty diff.
    expect(toolInputView('Edit', { file_path: '/w/x' }).kind).toBe('json');
  });
});
