import { useLayoutEffect, useRef, useState } from 'react';
import type { RunView } from '@videogen/shared/browser';
import { timelineView, type BlockTone, type TimelineView } from '../../lib/timeline-view.ts';
import { useNow } from '../../lib/use-now.ts';

/** Spec E11: the production as an editing timeline — three lanes, blocks from real timings, the playhead, and the NOW line. */
const TONE: Record<BlockTone, string> = {
  live: 'bg-ember text-white',
  done: 'bg-line-strong text-ink-2',
  pending: 'border border-dashed border-line-strong text-ink-3',
  waiting: 'border border-dashed border-amber text-amber',
  failed: 'border border-red text-red',
  stopped: 'bg-line text-ink-3',
  skipped: 'border-l border-dashed border-line-strong',
};
const NOW: Record<TimelineView['now']['kind'], [string, string]> = {
  live: ['● Now', 'text-ember'], queued: ['● Queued', 'text-ember'], done: ['Done', 'text-ink-2'], stopped: ['Stopped', 'text-dim'], failed: ['Failed', 'text-red'],
};
const LABEL_MIN_PX = 44;

export function Timeline({ run }: { run: RunView }) {
  const now = useNow(1000);
  const v = timelineView(run, now);
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setWidth(track.current?.clientWidth ?? 0);
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, []);
  const [nowLabel, nowClass] = NOW[v.now.kind];
  const running = v.now.kind === 'live' || v.now.kind === 'queued';
  // A run whose every step was skipped has no time to show.
  if (v.totalS === 0) return null;
  return (
    <section aria-label="Timeline" data-testid="timeline" className="-mx-4 border-y border-line bg-paper/70 px-4 pt-2.5 pb-3 md:mx-0 md:rounded-card md:border">
      <div className="flex gap-2">
        <span className="w-[22px] shrink-0" />
        <div className="label-mono flex flex-1 justify-between text-[9px] text-ink-3">
          {v.ticks.map((t) => <span key={t.pct}>{t.label}</span>)}
        </div>
      </div>
      <div className="relative mt-1.5 flex flex-col gap-1">
        {v.lanes.map((lane) => (
          <div key={lane.id} className="flex items-center gap-2">
            <span className="label-mono w-[22px] shrink-0 text-[9px] text-ink-3">{lane.id}</span>
            <div ref={lane.id === 'V' ? track : undefined} className="relative h-[22px] flex-1">
              {lane.blocks.map((b) => {
                const px = (b.widthPct / 100) * width;
                const label = b.tone === 'skipped' || px < LABEL_MIN_PX ? '' : b.label;
                const mark = (b.tone === 'failed' || (b.tone === 'stopped' && b.started)) && px >= 16 ? '× ' : '';
                const stoppedEarly = b.tone === 'stopped' && !b.started;
                return (
                  <button
                    key={b.id}
                    type="button"
                    data-testid="timeline-block"
                    data-tone={b.tone}
                    data-key={b.key}
                    title={b.title}
                    aria-label={b.title}
                    onClick={() => document.getElementById(`step-${b.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    style={{ left: `${b.startPct}%`, width: b.tone === 'skipped' ? 4 : `max(${b.widthPct}%, 4px)` }}
                    className={`absolute inset-y-0 flex items-center overflow-hidden rounded-[4px] px-1.5 text-[10px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent-glow ${
                      stoppedEarly ? 'border border-dashed border-dim text-dim line-through' : TONE[b.tone]
                    }`}
                  >
                    {mark}{label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div aria-hidden className="pointer-events-none absolute inset-y-[-4px] right-0 left-[30px]">
          <span className={`absolute inset-y-0 w-0.5 -translate-x-1/2 transition-[left] duration-500 ${running ? 'bg-ember' : 'bg-ink-3'}`} style={{ left: `${v.playheadPct}%` }}>
            <span className={`absolute -top-1 left-1/2 size-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent ${running ? 'border-t-ember-a' : 'border-t-ink-3'}`} />
          </span>
        </div>
      </div>
      <p className={`label-mono mt-3 ${nowClass}`}>{nowLabel} · {v.now.clock}</p>
      {v.now.note && <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-ink-2">{v.now.note}</p>}
    </section>
  );
}
