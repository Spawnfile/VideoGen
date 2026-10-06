import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiEvent } from '@videogen/shared/browser';

type Listener = (ev: { data: string }) => void;

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static all: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Listener[]>();
  constructor(readonly url: string) { FakeEventSource.all.push(this); }
  addEventListener(type: string, fn: Listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  close() { this.readyState = FakeEventSource.CLOSED; }
  open() { this.readyState = FakeEventSource.OPEN; this.onopen?.(); }
  /** Browser auto-retry case: the connection drops but EventSource keeps CONNECTING and retries itself. */
  drop() { this.readyState = FakeEventSource.CONNECTING; this.onerror?.(); }
  /** Non-200 response (proxy 5xx, guard 403): EventSource gives up for good. */
  fail() { this.readyState = FakeEventSource.CLOSED; this.onerror?.(); }
  emit(type: string, data: string) { for (const fn of this.listeners.get(type) ?? []) fn({ data }); }
  hb(): void { this.emit('hb', '{"ts":0}'); }
  live(type: string, payload: unknown) { this.emit('live', JSON.stringify({ topic: 't', type, payload })); }
  ui(id: number) { this.emit('ui', JSON.stringify({ id, ts: '', topic: 'system', type: 't', payload: null } satisfies UiEvent)); }
}

const last = () => FakeEventSource.all.at(-1)!;
type Live = typeof import('../src/lib/live.ts');
let live: Live;

beforeEach(async () => {
  FakeEventSource.all = [];
  vi.useFakeTimers();
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(0), 16));
  vi.resetModules();
  live = await import('../src/lib/live.ts');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('connectLive reconnect', () => {
  it('re-creates a CLOSED EventSource with backoff, ?after=<lastEventId> and the same onOpen hook', () => {
    const onOpen = vi.fn();
    live.connectLive('/events', { onOpen });
    last().open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    last().ui(5);
    vi.advanceTimersByTime(20);

    const first = last();
    first.fail();
    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    vi.advanceTimersByTime(999);
    expect(FakeEventSource.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.all).toHaveLength(2);
    expect(last().url).toBe('/events?after=5');

    last().fail();
    vi.advanceTimersByTime(1999);
    expect(FakeEventSource.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.all).toHaveLength(3);

    last().open();
    expect(onOpen).toHaveBeenCalledTimes(2);
    last().fail();
    vi.advanceTimersByTime(1000);
    expect(FakeEventSource.all).toHaveLength(4); // backoff reset on open
  });

  it('caps the backoff at 10 s', () => {
    live.connectLive('/events');
    for (let i = 0; i < 6; i++) { last().fail(); vi.advanceTimersByTime(10_000); }
    const n = FakeEventSource.all.length;
    expect(n).toBe(7);
    last().fail();
    vi.advanceTimersByTime(9_999);
    expect(FakeEventSource.all).toHaveLength(n);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.all).toHaveLength(n + 1);
  });

  it('leaves the browser auto-retry (CONNECTING) alone and only reports reconnecting', () => {
    live.connectLive('/events');
    last().open();
    last().drop();
    vi.advanceTimersByTime(30_000);
    expect(FakeEventSource.all).toHaveLength(1);
  });

  it('the disposer closes the stream and cancels a pending retry', () => {
    const stop = live.connectLive('/events');
    const es = last();
    es.fail();
    stop();
    vi.advanceTimersByTime(30_000);
    expect(FakeEventSource.all).toHaveLength(1);
    expect(es.readyState).toBe(FakeEventSource.CLOSED);
  });
});

describe('ui event dedupe and robustness', () => {
  it('drops duplicates by id and accepts a lower id first after an open (DB reset)', () => {
    const seen: number[] = [];
    live.onUiEvent((e) => seen.push(e.id));
    live.connectLive('/events');
    last().open();
    last().ui(10); last().ui(11); last().ui(11); last().ui(9);
    vi.advanceTimersByTime(20);
    expect(seen).toEqual([10, 11]);

    last().drop();
    last().open(); // reconnected to a reset database whose ids restart
    last().ui(3); last().ui(4); last().ui(4);
    vi.advanceTimersByTime(120);
    expect(seen).toEqual([10, 11, 3, 4]);
  });

  it('a throwing handler does not lose the batch, malformed JSON is ignored', () => {
    const seen: number[] = [];
    live.onUiEvent(() => { throw new Error('boom'); });
    live.onUiEvent((e) => seen.push(e.id));
    live.connectLive('/events');
    last().open();
    expect(() => { last().emit('ui', '{not json'); last().emit('live', 'nope'); }).not.toThrow();
    last().ui(1); last().ui(2);
    expect(() => vi.advanceTimersByTime(20)).not.toThrow();
    expect(seen).toEqual([1, 2]);
  });
});
describe('flush cap, live events and the half-open watchdog', () => {
  it('caps dispatch at ~10 Hz and still delivers every event', () => {
    const flushes: number[][] = [];
    let batch: number[] = [];
    live.onUiEvent((e) => batch.push(e.id));
    live.connectLive('/events');
    last().open();
    const tick = () => { if (batch.length) { flushes.push(batch); batch = []; } };
    for (let i = 1; i <= 50; i++) { last().ui(i); vi.advanceTimersByTime(2); tick(); }
    vi.advanceTimersByTime(300);
    tick();
    expect(flushes.flat()).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(flushes.length).toBeLessThanOrEqual(3); // 100 ms window: ≤ 2 flushes during the 100 ms burst + 1 tail
  });

  it('dispatches live events to onLiveEvent in the same flush and keeps the worker heartbeat', () => {
    const got: string[] = [];
    live.onLiveEvent((e) => got.push(e.type));
    live.connectLive('/events');
    last().open();
    last().live('trace.delta', { sessionId: 's', d: [] });
    last().live('worker.heartbeat', { rssMb: 50 });
    vi.advanceTimersByTime(120);
    expect(got).toEqual(['trace.delta', 'worker.heartbeat']);
  });

  it('reconnects a silent (half-open) stream after staleMs, while heartbeats keep a quiet stream alive', () => {
    live.connectLive('/events', { staleMs: 35_000 });
    last().open();
    last().ui(7);
    for (let s = 0; s < 6; s++) { vi.advanceTimersByTime(10_000); last().hb(); }
    expect(FakeEventSource.all).toHaveLength(1);
    vi.advanceTimersByTime(40_000);
    expect(FakeEventSource.all[0]!.readyState).toBe(FakeEventSource.CLOSED);
    vi.advanceTimersByTime(1_000);
    expect(FakeEventSource.all).toHaveLength(2);
    expect(last().url).toBe('/events?after=7');
  });
});
