import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { TraceRow } from '@videogen/shared/browser';
import { blockLabels, buildBlocks, type TraceBlock, withoutAnswer } from '../../lib/trace-view.ts';
import ThinkingState, { type ThinkingUi } from './ThinkingState.tsx';

/** Spec §12.4, plan M7 Y13: above this many rows the trace is windowed (only the blocks near the viewport are mounted). */
const WINDOW_ROWS = 200;
const GAP = 8; // gap-2 between blocks
/**
 * The mounted window leans toward the scroll direction: a quarter screen behind the viewport, two and three quarters ahead. It
 * moves only once less than a quarter screen is left on either side, so a steady scroll re-renders once every two and a half
 * screens: each move is a commit plus a repaint of the scrolling panel, one or two long frames under 4× throttling whatever the
 * number of blocks it mounts, so fewer, larger moves keep the p95 frame inside S8's budget (plan M7 Y13). Without a direction
 * (first render, new rows) it is the viewport ± one screen.
 */
const BEHIND = 0.25;
const AHEAD = 2.75;
const SLACK = 0.25;
/** What a windowed trace remembers per top-level block while it is unmounted. */
interface UiMemory { get: (key: string) => ThinkingUi | undefined; set: (ui: ThinkingUi) => void }
const size = (b: TraceBlock) => (b.kind === 'text' ? 1 : b.rows.length);

function Blocks({ blocks, showText, animateMount = true, memory }: { blocks: TraceBlock[]; showText: boolean; animateMount?: boolean; memory?: UiMemory }) {
  return (
    <>
      {blocks.map((b) =>
        b.kind === 'text' ? (
          showText && b.text ? (
            <p key={b.key} className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink" data-testid="trace-text">
              {b.text}
              {b.live && <span aria-hidden className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-ink-2" style={{ animation: 'fade-in 600ms ease-in-out infinite alternate' }} />}
            </p>
          ) : null
        ) : (
          <ThinkingState
            key={b.key}
            variant={b.variant}
            status={b.live ? 'live' : 'settled'}
            rows={b.rows}
            animateMount={animateMount}
            ui={memory?.get(b.key)}
            onUi={memory?.set}
            {...blockLabels(b)}
            renderDetail={(row) =>
              row.children ? (
                <div className="flex flex-col gap-2 border-l border-line pl-3">
                  {row.detail && <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">{row.detail}</p>}
                  <Blocks blocks={row.children} showText={false} />
                </div>
              ) : undefined
            }
          />
        ),
      )}
    </>
  );
}

/** One top-level block of a windowed trace; memoised so a scroll that moves the window re-renders only the blocks it mounts. */
const WindowedBlock = memo(function WindowedBlock({ block, last, fresh, memory }: { block: TraceBlock; last: boolean; fresh: boolean; memory: Map<string, ThinkingUi> }) {
  const mine = useMemo(() => ({ get: (k: string) => memory.get(k), set: (u: ThinkingUi) => { memory.set(block.key, u); } }), [memory, block.key]);
  return (
    <div data-block={block.key} style={last ? undefined : { paddingBottom: GAP }}>
      <Blocks blocks={[block]} showText animateMount={fresh} memory={mine} />
    </div>
  );
});

/**
 * Height of a block never mounted: a collapsed (settled) block is its header, a live one is open with its rows. `learned.header`
 * is the last measured collapsed header, so after the first block the guesses match and mounting moves nothing.
 */
function estimate(b: TraceBlock, learned: { header: number; line: number }): number {
  if (b.kind === 'text') return learned.line * Math.max(1, Math.ceil(b.text.length / 70));
  return b.live ? learned.header + 8 + 32 * b.rows.length : learned.header;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

/**
 * Spec §12.4 "200 satırı geçince sanal kaydırma" (plan M7 Y13): only the top-level blocks in a three-screen window around the
 * viewport are mounted; the rest are two spacers sized from measured (cached per block key) or estimated heights. The outer
 * scroll container is the page's own; the window follows its scroll. No `content-visibility` (P7: it re-paints rows while scrolling).
 */
function WindowedTrace({ blocks }: { blocks: TraceBlock[] }) {
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLElement | null | undefined>(undefined); // the scroll container, found once
  const heights = useRef(new Map<string, number>());
  const guesses = useRef(new Map<string, number>());
  const learned = useRef({ header: 28, line: 23 });
  const [range, setRange] = useState<[number, number]>(() => [0, Math.min(blocks.length, 40)]);
  const [measured, setMeasured] = useState(0);
  const memory = useRef(new Map<string, ThinkingUi>()).current; // opened blocks and rows survive being scrolled away
  // Blocks the trace already had: mounting one on scroll replays no entrance animation; a block new from the stream still fades in.
  const seen = useRef<Set<string> | null>(null);
  seen.current ??= new Set(blocks.map((b) => b.key));
  useEffect(() => { for (const b of blocks) seen.current!.add(b.key); }, [blocks]);
  // `measured` is a dependency on purpose: it changes when a mounted block's height differs from what the offsets assumed.
  const offsets = useMemo(() => {
    const o = new Float64Array(blocks.length + 1);
    guesses.current.clear();
    blocks.forEach((b, i) => {
      let h = heights.current.get(b.key);
      if (h === undefined) { h = estimate(b, learned.current); guesses.current.set(b.key, h); }
      o[i + 1] = o[i]! + h + (i < blocks.length - 1 ? GAP : 0);
    });
    return o;
  }, [blocks, measured]);

  /** Blocks covering the viewport plus `above` and `below` screens (trace coordinates), and the viewport's top. */
  const lastTop = useRef<number | null>(null);
  const want = useCallback((above: number, below: number): { range: [number, number]; top: number } | null => {
    const el = root.current;
    if (!el) return null;
    if (box.current === undefined) box.current = scrollParent(el);
    const view = box.current ? box.current.getBoundingClientRect() : { top: 0, height: innerHeight };
    const screen = Math.max(view.height, 200);
    const top = view.top - el.getBoundingClientRect().top;
    const lo = top - screen * above;
    const hi = top + screen * (1 + below);
    let start = 0;
    while (start < blocks.length - 1 && offsets[start + 1]! <= lo) start++;
    let end = start + 1;
    while (end < blocks.length && offsets[end]! < hi) end++;
    return { range: [start, Math.min(end, blocks.length)], top };
  }, [blocks.length, offsets]);

  /** Keeps the window while it covers the viewport ± SLACK; otherwise moves it, leaning toward the scroll direction. */
  const rewindow = useCallback((r: [number, number]): [number, number] => {
    const need = want(SLACK, SLACK);
    if (!need) return r;
    const dir = lastTop.current === null ? 0 : Math.sign(need.top - lastTop.current);
    lastTop.current = need.top;
    if (need.range[0] >= r[0] && need.range[1] <= r[1] && r[1] <= blocks.length) return r;
    const next = want(dir > 0 ? BEHIND : dir < 0 ? AHEAD : 1, dir > 0 ? AHEAD : dir < 0 ? BEHIND : 1)!.range;
    return next[0] === r[0] && next[1] === r[1] ? r : next;
  }, [want, blocks.length]);

  // Before paint whenever the blocks or their heights changed, and on every scroll of the outer container.
  useLayoutEffect(() => { setRange(rewindow); }, [rewindow]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (box.current === undefined) box.current = scrollParent(el);
    const target: HTMLElement | Window = box.current ?? window;
    // flushSync: the move commits inside the scroll step of the same frame instead of a later task (one long frame, not two).
    const onScroll = () => flushSync(() => setRange(rewindow));
    target.addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => { target.removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); };
  }, [rewindow]);

  // Mounted blocks report their height (opened by hand, a live block growing); the cache keeps it after they unmount.
  const watched = useRef(new Set<HTMLElement>());
  const observer = useMemo(() => (typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    let changed = false;
    for (const e of entries) {
      const node = e.target as HTMLElement;
      const key = node.dataset.block;
      if (!key || !node.isConnected) continue;
      const h = node.offsetHeight - (parseFloat(node.style.paddingBottom) || 0);
      const assumed = heights.current.get(key) ?? guesses.current.get(key);
      if (heights.current.get(key) === undefined) {
        const t = node.querySelector<HTMLElement>(':scope > [data-testid="thinking"]');
        if (t?.dataset.status === 'settled' && t.querySelector('button')?.getAttribute('aria-expanded') === 'false') learned.current.header = h;
      }
      heights.current.set(key, h);
      if (assumed === undefined || Math.abs(assumed - h) > 0.5) changed = true;
    }
    if (changed) setMeasured((n) => n + 1);
  })), []);
  useEffect(() => () => observer?.disconnect(), [observer]);
  useLayoutEffect(() => {
    if (!observer || !root.current) return;
    for (const node of watched.current) if (!node.isConnected) { observer.unobserve(node); watched.current.delete(node); }
    for (const node of root.current.querySelectorAll<HTMLElement>(':scope > [data-block]')) {
      if (!watched.current.has(node)) { observer.observe(node); watched.current.add(node); }
    }
  }, [observer, range, blocks]);

  const start = Math.min(range[0], blocks.length);
  const end = Math.min(Math.max(range[1], start), blocks.length);
  return (
    <div ref={root} className="flex flex-col">
      <div aria-hidden style={{ height: offsets[start] }} />
      {blocks.slice(start, end).map((b, i) => <WindowedBlock key={b.key} block={b} last={start + i === blocks.length - 1} fresh={!seen.current!.has(b.key)} memory={memory} />)}
      <div aria-hidden style={{ height: offsets[blocks.length]! - offsets[end]! }} />
    </div>
  );
}

/** `answered`: the turn's reply is shown as a chat message, so its final text block is left out (earlier prose stays). */
export function TraceView({ rows, answered = false }: { rows: TraceRow[]; answered?: boolean }) {
  const blocks = useMemo(() => (answered ? withoutAnswer(buildBlocks(rows)) : buildBlocks(rows)), [rows, answered]);
  const total = useMemo(() => blocks.reduce((s, b) => s + size(b), 0), [blocks]);
  // An empty text block renders nothing; leaving it out keeps the windowed gaps right.
  const shown = useMemo(() => (total > WINDOW_ROWS ? blocks.filter((b) => b.kind !== 'text' || b.text) : blocks), [blocks, total]);
  if (total > WINDOW_ROWS) return <WindowedTrace blocks={shown} />;
  return (
    <div className="flex flex-col gap-2">
      <Blocks blocks={blocks} showText />
    </div>
  );
}
