import { useSyncExternalStore } from 'react';
import type { UiEvent } from '@videogen/shared/browser';

export interface LiveState {
  status: 'connecting' | 'open' | 'reconnecting';
  lastEventId: number;
  heartbeatAt: number | null;
  workerRssMb: number | null;
}

export interface ConnectOptions {
  /** Runs on every open (first connect and each reconnect). A fresh connect does not replay history, so callers refetch REST state here. */
  onOpen?: () => void;
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 10_000;

let state: LiveState = { status: 'connecting', lastEventId: 0, heartbeatAt: null, workerRssMb: null };
const listeners = new Set<() => void>();
const uiHandlers = new Set<(e: UiEvent) => void>();
let pending: UiEvent[] = [];
let scheduled = false;
/** Highest ui event id accepted so far (ahead of state.lastEventId until the next frame flush). */
let received = 0;
/** Set on every open: the first ui event after it may restart ids (database reset), see accept(). */
let firstAfterOpen = false;

function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

/** Dispatches the batch accepted since the last frame: one render per animation frame. */
function flush() {
  scheduled = false;
  const batch = pending;
  pending = [];
  for (const e of batch) {
    for (const h of uiHandlers) {
      try { h(e); } catch (err) { console.error('ui event handler failed', err); }
    }
  }
  if (received !== state.lastEventId) set({ lastEventId: received });
}

/** Drops duplicates by id. The server never resends ids at or below the one we resumed from, so a lower id as the first
 *  event after an open means the database was reset: accept it and restart the watermark instead of dropping forever. */
function accept(e: UiEvent) {
  if (firstAfterOpen) {
    firstAfterOpen = false;
    if (e.id <= received) received = e.id - 1;
  }
  if (e.id <= received) return;
  received = e.id;
  pending.push(e);
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush);
  }
}

function parse<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * Opens the SSE stream. A dropped connection is retried by EventSource itself (it stays CONNECTING and sends Last-Event-ID);
 * a non-200 response (proxy 5xx, guard 403) moves it to CLOSED for good, so then we re-create it with backoff and ?after=.
 */
export function connectLive(url = '/events', opts: ConnectOptions = {}) {
  let es: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let backoff = RETRY_MIN_MS;
  let stopped = false;

  const open = () => {
    const src = received > 0 ? `${url}${url.includes('?') ? '&' : '?'}after=${received}` : url;
    const cur = new EventSource(src);
    es = cur;
    cur.onopen = () => {
      backoff = RETRY_MIN_MS;
      firstAfterOpen = true;
      set({ status: 'open' });
      opts.onOpen?.();
    };
    cur.onerror = () => {
      set({ status: 'reconnecting' });
      if (stopped || cur.readyState !== EventSource.CLOSED) return;
      cur.close();
      clearTimeout(retry);
      retry = setTimeout(() => { if (!stopped) open(); }, backoff);
      backoff = Math.min(backoff * 2, RETRY_MAX_MS);
    };
    cur.addEventListener('ui', (ev) => {
      const e = parse<UiEvent>((ev as MessageEvent).data);
      if (e && typeof e.id === 'number') accept(e);
    });
    cur.addEventListener('live', (ev) => {
      const l = parse<{ type?: string; payload?: { rssMb?: number } }>((ev as MessageEvent).data);
      if (l?.type === 'worker.heartbeat') set({ heartbeatAt: Date.now(), workerRssMb: l.payload?.rssMb ?? null });
    });
  };

  open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    es?.close();
  };
}

export function onUiEvent(fn: (e: UiEvent) => void): () => void {
  uiHandlers.add(fn);
  return () => { uiHandlers.delete(fn); };
}

export function useLive(): LiveState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}
