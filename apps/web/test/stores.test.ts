import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSessionView, ChatMessage, RunView, TraceRow, VideoView } from '@videogen/shared/browser';

type Stores = typeof import('../src/lib/stores.ts');
let st: Stores;
beforeEach(async () => { vi.resetModules(); st = await import('../src/lib/stores.ts'); });

const view = (status: AgentSessionView['status']): AgentSessionView => ({
  id: 's1', kind: 'pipeline', role: 'researcher', model: 'sonnet', effort: 'high', status, claudeSessionId: 's1', parentSessionId: null, threadId: null,
  runId: null, stepId: null, progress: null, progressSource: null, progressMessage: null, tokens: 0, costUsd: null, numTurns: 0, terminalReason: null, error: null,
  waitingUntil: null, createdAt: '2026-10-06T00:00:00.000Z', startedAt: null, endedAt: null, lastEventAt: null,
});
const row = (over: Partial<TraceRow> = {}): TraceRow => ({ id: 'r1', sessionId: 's1', turn: 0, seq: 1, parentToolUseId: null, variant: 'reasoning', kind: 'thinking', title: 'Düşünce', status: 'running', startedAt: 0, ...over });

describe('freshness by event id', () => {
  it('an older REST snapshot never overwrites a newer SSE update; a newer one does', () => {
    st.applySession(view('done'), 50);
    st.seedSessions([view('thinking')], 40);
    expect(st.agents.get().sessions.s1!.value.status).toBe('done');
    st.seedSessions([view('failed')], 60);
    expect(st.agents.get().sessions.s1!.value.status).toBe('failed');
    st.applySession(view('thinking'), 55);
    expect(st.agents.get().sessions.s1!.value.status).toBe('failed');
  });

  it('samples keep their receive time', () => {
    st.applySample({ sessionId: 's1', cpuPct: 12, rssMb: 290, silentMs: 3000, liveness: 'active' });
    expect(st.agents.get().samples.s1).toMatchObject({ cpuPct: 12, silentMs: 3000, receivedAt: expect.any(Number) });
  });
});

describe('trace deltas', () => {
  it('buffers text that arrives before its row, appends to running rows, ignores deltas after done', () => {
    st.applyDelta('s1', [{ rowId: 'r1', text: 'Yay ' }]);
    expect(st.traceRows(st.traces.get().s1)).toEqual([]);
    st.applyRow(row({ text: '' }), 10);
    st.applyDelta('s1', [{ rowId: 'r1', text: 'sıkışır' }, { rowId: 'r1', tokens: 42 }]);
    expect(st.traceRows(st.traces.get().s1)[0]).toMatchObject({ text: 'Yay sıkışır', tokens: 42 });
    st.applyRow(row({ status: 'done', text: 'Yay sıkışır.' }), 11);
    st.applyDelta('s1', [{ rowId: 'r1', text: ' FAZLA' }]);
    expect(st.traceRows(st.traces.get().s1)[0]).toMatchObject({ status: 'done', text: 'Yay sıkışır.' });
  });

  it('a delta buffered for a row that then arrives done is dropped (no duplicate text)', () => {
    st.applyDelta('s1', [{ rowId: 'r2', text: 'tam' }]);
    st.applyRow(row({ id: 'r2', status: 'done', text: 'tam metin' }), 12);
    expect(st.traceRows(st.traces.get().s1)[0]!.text).toBe('tam metin');
    expect(st.traces.get().s1!.pending).toEqual({});
  });

  it('seeded REST rows sort by seq and lose to newer SSE rows', () => {
    st.applyRow(row({ id: 'b', seq: 2, status: 'done', title: 'SSE' }), 30);
    st.seedTrace('s1', [row({ id: 'a', seq: 1 }), row({ id: 'b', seq: 2, title: 'REST' })], 20);
    expect(st.traceRows(st.traces.get().s1).map((r) => `${r.id}:${r.title}`)).toEqual(['a:Düşünce', 'b:SSE']);
  });
});

describe('chat messages', () => {
  it('orders by creation time and replaces a message only with a fresher version', () => {
    const m = (id: string, createdAt: string, status: ChatMessage['status']): ChatMessage => ({ id, threadId: 't', role: 'user', text: id, status, mode: 'ask', sessionId: null, turn: null, createdAt, completedAt: null });
    st.seedMessages('t', [m('b', '2026-10-06T10:00:02Z', 'queued'), m('a', '2026-10-06T10:00:01Z', 'done')], 5);
    st.applyMessage(m('b', '2026-10-06T10:00:02Z', 'running'), 6);
    st.applyMessage(m('b', '2026-10-06T10:00:02Z', 'queued'), 4);
    expect(st.chatMessages(st.chats.get().t).map((x) => `${x.id}:${x.status}`)).toEqual(['a:done', 'b:running']);
  });
});

describe('getFresh', () => {
  it('returns the body with the x-vg-event-id watermark', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([1]), { headers: { 'x-vg-event-id': '77' } })));
    const { getFresh } = await import('../src/lib/api.ts');
    await expect(getFresh('/api/sessions')).resolves.toEqual({ data: [1], eventId: 77 });
    vi.unstubAllGlobals();
  });
});
describe('pipeline store', () => {
  it('keeps the freshest video and run, lists videos newest first and finds the latest run', () => {
    const v = (id: string, updatedAt: string, status: VideoView['status']) => ({ id, updatedAt, status } as VideoView);
    const r = (id: string, createdAt: string, progress: number) => ({ id, videoId: 'v1', createdAt, progress, steps: [] } as unknown as RunView);
    st.seedVideos([v('v1', '2026-10-06T10:00:00Z', 'running'), v('v2', '2026-10-06T11:00:00Z', 'queued')], 10);
    st.applyVideo(v('v1', '2026-10-06T12:00:00Z', 'needs_human'), 12);
    st.seedVideos([v('v1', '2026-10-06T10:00:00Z', 'running')], 11);
    expect(st.videoList(st.pipeline.get()).map((x) => `${x.id}:${x.status}`)).toEqual(['v1:needs_human', 'v2:queued']);
    st.applyRun(r('r1', '2026-10-06T10:00:00Z', 50), 20);
    st.applyRun(r('r1', '2026-10-06T10:00:00Z', 30), 19);
    st.seedRuns([r('r2', '2026-10-06T12:00:00Z', 0)], 21);
    expect(st.latestRunOf(st.pipeline.get(), 'v1')?.id).toBe('r2');
    expect(st.pipeline.get().runs.r1!.value.progress).toBe(50);
  });
});
