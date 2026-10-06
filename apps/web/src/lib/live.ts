import { useSyncExternalStore } from 'react';
import type { LiveEvent, UiEvent } from '@videogen/shared/browser';

export interface LiveState {
  status: 'connecting' | 'open' | 'reconnecting';
  lastEventId: number;
  heartbeatAt: number | null;
  workerRssMb: number | null;
}

export interface ConnectOptions {
  /** Runs on every open (first connect and each reconnect). A fresh connect does not replay history, so callers refetch REST state here. */
  onOpen?: () => void;
  /** No message at all (ui, live or the 15 s `hb`) for this long means a half-open stream: close and reconnect. */
  staleMs?: number;
}

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 10_000;
const STALE_MS = 35_000;
/** Spec §12.4: at most ~10 flushes per second, each in an animation frame. */
export const FLUSH_MIN_MS = 100;

let state: LiveState = { status: 'connecting', lastEventId: 0, heartbeatAt: null, workerRssMb: null };
const listeners = new Set<() => void>();
const uiHandlers = new Set<(e: UiEvent) => void>();
const liveHandlers = new Set<(e: LiveEvent) => void>();
let pending: UiEvent[] = [];
let pendingLive: LiveEvent[] = [];
let scheduled = false;
let lastFlush = Number.NEGATIVE_INFINITY;
/** Highest ui event id accepted so far (ahead of state.lastEventId until the next flush). */
let received = 0;
/** Set on every open: the first ui event after it may restart ids (database reset), see accept(). */
let firstAfterOpen = false;

function set(patch: Partial<LiveState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function dispatch<T>(items: T[], handlers: Set<(e: T) => void>, what: string) {
  for (const e of items) {
    for (const h of handlers) {
      try { h(e); } catch (err) { console.error(`${what} handler failed`, err); }
    }
  }
}

function flush() {
  scheduled = false;
  lastFlush = Date.now();
  const batch = pending;
  const live = pendingLive;
  pending = [];
  pendingLive = [];
  dispatch(batch, uiHandlers, 'ui event');
  dispatch(live, liveHandlers, 'live event');
  if (received !== state.lastEventId) set({ lastEventId: received });
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  const wait = Math.max(0, lastFlush + FLUSH_MIN_MS - Date.now());
  setTimeout(() => requestAnimationFrame(flush), wait);
}

/** Drops duplicates by id. A lower id as the first event after an open means the database was reset: restart the watermark. */
function accept(e: UiEvent) {
  if (firstAfterOpen) {
    firstAfterOpen = false;
    if (e.id <= received) received = e.id - 1;
  }
  if (e.id <= received) return;
  received = e.id;
  pending.push(e);
  schedule();
}

function parse<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/**
 * Opens the SSE stream. A dropped connection is retried by EventSource itself (CONNECTING + Last-Event-ID); a non-200
 * response leaves it CLOSED for good, and a half-open stream stays OPEN but silent: both are re-created with backoff and ?after=.
 */
export function connectLive(url = '/events', opts: ConnectOptions = {}) {
  let es: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let backoff = RETRY_MIN_MS;
  let stopped = false;
  let lastMessageAt = Date.now();
  const touch = () => { lastMessageAt = Date.now(); };

  const reopenLater = () => {
    clearTimeout(retry);
    retry = setTimeout(() => { if (!stopped) open(); }, backoff);
    backoff = Math.min(backoff * 2, RETRY_MAX_MS);
  };

  const open = () => {
    const src = received > 0 ? `${url}${url.includes('?') ? '&' : '?'}after=${received}` : url;
    const cur = new EventSource(src);
    es = cur;
    cur.onopen = () => {
      touch();
      backoff = RETRY_MIN_MS;
      firstAfterOpen = true;
      set({ status: 'open' });
      opts.onOpen?.();
    };
    cur.onerror = () => {
      set({ status: 'reconnecting' });
      if (stopped || cur.readyState !== EventSource.CLOSED) return;
      cur.close();
      reopenLater();
    };
    cur.addEventListener('hb', touch);
    cur.addEventListener('ui', (ev) => {
      touch();
      const e = parse<UiEvent>((ev as MessageEvent).data);
      if (e && typeof e.id === 'number') accept(e);
    });
    cur.addEventListener('live', (ev) => {
      touch();
      const l = parse<LiveEvent>((ev as MessageEvent).data);
      if (!l || typeof l.type !== 'string') return;
      if (l.type === 'worker.heartbeat') set({ heartbeatAt: Date.now(), workerRssMb: (l.payload as { rssMb?: number } | null)?.rssMb ?? null });
      pendingLive.push(l);
      schedule();
    });
  };

  const watchdog = setInterval(() => {
    if (stopped || !es || es.readyState !== EventSource.OPEN) return;
    if (Date.now() - lastMessageAt <= (opts.staleMs ?? STALE_MS)) return;
    es.close();
    set({ status: 'reconnecting' });
    reopenLater();
  }, 5_000);

  open();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearInterval(watchdog);
    es?.close();
  };
}

export function onUiEvent(fn: (e: UiEvent) => void): () => void {
  uiHandlers.add(fn);
  return () => { uiHandlers.delete(fn); };
}

export function onLiveEvent(fn: (e: LiveEvent) => void): () => void {
  liveHandlers.add(fn);
  return () => { liveHandlers.delete(fn); };
}

export function useLive(): LiveState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}
