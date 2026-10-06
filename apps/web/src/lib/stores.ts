import { useSyncExternalStore } from 'react';
import type { AgentSample, AgentSessionView, ChatMessage, LiveTraceItem, RunView, TraceRow, VideoView } from '@videogen/shared/browser';

export interface Store<S> { get(): S; set(fn: (s: S) => S): void; subscribe(l: () => void): () => void }

export function createStore<S>(init: S): Store<S> {
  let s = init;
  const ls = new Set<() => void>();
  return {
    get: () => s,
    set: (fn) => { const next = fn(s); if (next === s) return; s = next; for (const l of ls) l(); },
    subscribe: (l) => { ls.add(l); return () => { ls.delete(l); }; },
  };
}

export function useStore<S>(store: Store<S>): S {
  return useSyncExternalStore(store.subscribe, store.get);
}

/** A value and the event id it is current as of (REST: x-vg-event-id at read start; SSE: the event's id). */
interface Versioned<T> { value: T; eventId: number }
const fresher = <T>(cur: Versioned<T> | undefined, eventId: number) => !cur || eventId >= cur.eventId;

export type SampleView = AgentSample & { receivedAt: number };
export interface AgentsState { sessions: Record<string, Versioned<AgentSessionView>>; samples: Record<string, SampleView> }
export const agents = createStore<AgentsState>({ sessions: {}, samples: {} });

export function seedSessions(list: AgentSessionView[], eventId: number): void {
  agents.set((s) => {
    const sessions = { ...s.sessions };
    for (const v of list) if (fresher(sessions[v.id], eventId)) sessions[v.id] = { value: v, eventId };
    return { ...s, sessions };
  });
}
export function applySession(v: AgentSessionView, eventId: number): void {
  agents.set((s) => (fresher(s.sessions[v.id], eventId) ? { ...s, sessions: { ...s.sessions, [v.id]: { value: v, eventId } } } : s));
}
export function applySample(x: AgentSample): void {
  agents.set((s) => ({ ...s, samples: { ...s.samples, [x.sessionId]: { ...x, receivedAt: Date.now() } } }));
}

export interface TraceState { rows: Record<string, Versioned<TraceRow>>; pending: Record<string, string> }
export const traces = createStore<Record<string, TraceState>>({});
const EMPTY_TRACE: TraceState = { rows: {}, pending: {} };

function updateTrace(sessionId: string, fn: (t: TraceState) => TraceState): void {
  traces.set((all) => {
    const cur = all[sessionId] ?? EMPTY_TRACE;
    const next = fn(cur);
    return next === cur ? all : { ...all, [sessionId]: next };
  });
}

export function seedTrace(sessionId: string, rows: TraceRow[], eventId: number): void {
  updateTrace(sessionId, (t) => {
    const r = { ...t.rows };
    for (const row of rows) if (fresher(r[row.id], eventId)) r[row.id] = { value: row, eventId };
    return { ...t, rows: r };
  });
}

/** Text that arrived before its row is appended when the row arrives running; a row that arrives done already has it. */
export function applyRow(row: TraceRow, eventId: number): void {
  updateTrace(row.sessionId, (t) => {
    if (!fresher(t.rows[row.id], eventId)) return t;
    const pend = t.pending[row.id];
    let pending = t.pending;
    let value = row;
    if (pend !== undefined) {
      pending = { ...t.pending };
      delete pending[row.id];
      if (row.status === 'running') value = { ...row, text: (row.text ?? '') + pend };
    }
    return { rows: { ...t.rows, [row.id]: { value, eventId } }, pending };
  });
}

export function applyDelta(sessionId: string, items: LiveTraceItem[]): void {
  updateTrace(sessionId, (t) => {
    const rows = { ...t.rows };
    const pending = { ...t.pending };
    for (const it of items) {
      const cur = rows[it.rowId];
      if (!cur) {
        if (it.text) pending[it.rowId] = (pending[it.rowId] ?? '') + it.text;
        continue;
      }
      if (cur.value.status !== 'running') continue;
      rows[it.rowId] = {
        ...cur,
        value: { ...cur.value, ...(it.text ? { text: (cur.value.text ?? '') + it.text } : {}), ...(it.tokens !== undefined ? { tokens: it.tokens } : {}) },
      };
    }
    return { rows, pending };
  });
}

export function traceRows(t: TraceState | undefined): TraceRow[] {
  return t ? Object.values(t.rows).map((v) => v.value).sort((a, b) => a.seq - b.seq) : [];
}

export const chats = createStore<Record<string, Record<string, Versioned<ChatMessage>>>>({});

export function seedMessages(threadId: string, msgs: ChatMessage[], eventId: number): void {
  chats.set((all) => {
    const cur = { ...(all[threadId] ?? {}) };
    for (const m of msgs) if (fresher(cur[m.id], eventId)) cur[m.id] = { value: m, eventId };
    return { ...all, [threadId]: cur };
  });
}
export function applyMessage(m: ChatMessage, eventId: number): void {
  chats.set((all) => {
    const cur = all[m.threadId] ?? {};
    return fresher(cur[m.id], eventId) ? { ...all, [m.threadId]: { ...cur, [m.id]: { value: m, eventId } } } : all;
  });
}
export function chatMessages(t: Record<string, Versioned<ChatMessage>> | undefined): ChatMessage[] {
  return Object.values(t ?? {}).map((v) => v.value).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export interface PipelineState { videos: Record<string, Versioned<VideoView>>; runs: Record<string, Versioned<RunView>> }
export const pipeline = createStore<PipelineState>({ videos: {}, runs: {} });

function put<T extends { id: string }>(map: Record<string, Versioned<T>>, items: T[], eventId: number): Record<string, Versioned<T>> {
  let out = map;
  for (const it of items) {
    if (!fresher(out[it.id], eventId)) continue;
    if (out === map) out = { ...map };
    out[it.id] = { value: it, eventId };
  }
  return out;
}
export const seedVideos = (list: VideoView[], eventId: number) => pipeline.set((s) => { const videos = put(s.videos, list, eventId); return videos === s.videos ? s : { ...s, videos }; });
export const applyVideo = (v: VideoView, eventId: number) => seedVideos([v], eventId);
export const seedRuns = (list: RunView[], eventId: number) => pipeline.set((s) => { const runs = put(s.runs, list, eventId); return runs === s.runs ? s : { ...s, runs }; });
export const applyRun = (r: RunView, eventId: number) => seedRuns([r], eventId);

export function videoList(s: PipelineState): VideoView[] {
  return Object.values(s.videos).map((x) => x.value).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function latestRunOf(s: PipelineState, videoId: string): RunView | null {
  let best: RunView | null = null;
  for (const { value } of Object.values(s.runs)) if (value.videoId === videoId && (!best || value.createdAt > best.createdAt)) best = value;
  return best;
}
