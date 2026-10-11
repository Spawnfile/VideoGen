import { pct } from '../../lib/format.ts';
import { UsageBar } from '../UsageFooter.tsx';
import { Sheet } from './Sheet.tsx';
import { DISK_TONE, useStatus, type StatusView } from './useStatus.ts';

/** The phone top bar's status pill: the 5-hour use, or the connection problem when there is one. */
export function StatusPill({ onOpen }: { onOpen: () => void }) {
  const s = useStatus();
  const problem = s.live === 'reconnecting' ? 'Reconnecting' : s.phase === 'out' ? 'Claude offline' : null;
  return (
    <button
      type="button"
      data-testid="status-pill"
      onClick={onOpen}
      aria-label={problem ?? `Usage: ${pct(s.fiveHour?.utilization)} of the 5-hour window`}
      className="label-mono flex min-h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-paper/80 px-2.5 text-ink-2 focus-visible:outline-2 focus-visible:outline-accent-glow"
    >
      <span className={`size-1.5 rounded-full ${problem ? 'bg-red' : s.claude[0]}`} />
      {problem ?? `${pct(s.fiveHour?.utilization)} · 5H`}
    </button>
  );
}

function Row({ dot, text, aside }: { dot: string; text: string; aside?: string }) {
  return (
    <div className="flex min-h-11 items-center gap-2 border-b border-line py-2 last:border-0">
      <span className={`size-2 rounded-full ${dot}`} />
      <span className="flex-1">{text}</span>
      {aside && <span className="text-[12px] text-ink-3">{aside}</span>}
    </div>
  );
}

export function StatusBody({ s }: { s: StatusView }) {
  return (
    <div className="flex flex-col gap-4 text-[14px]">
      <section className="flex flex-col gap-4 rounded-card bg-inset/60 p-4">
        <UsageBar label="5-hour window" testId="sheet-usage-5h" w={s.fiveHour} wide />
        <UsageBar label="7-day window" testId="sheet-usage-7d" w={s.sevenDay} wide />
        {s.guard && <p className="text-[13px] text-ink">{s.guard}</p>}
        {s.updated && <p className="text-[12px] text-ink-3">Updated {s.updated}</p>}
      </section>
      <section className="rounded-card bg-inset/60 px-4">
        <Row dot={s.claude[0]} text={s.claude[1]} aside={s.plan ?? undefined} />
        <Row dot={s.worker[0]} text={s.worker[1]} />
        <Row dot={s.live === 'open' ? 'bg-green' : 'bg-red'} text={s.live === 'open' ? 'Live updates on' : 'Live updates reconnecting'} />
        {s.disk && <Row dot={DISK_TONE[s.disk.tone][0]} text={s.disk.text} />}
      </section>
    </div>
  );
}

export function StatusSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStatus();
  return (
    <Sheet open={open} onClose={onClose} title="Usage and status">
      <StatusBody s={s} />
    </Sheet>
  );
}
