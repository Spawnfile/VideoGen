import { usageLevel, type UsageWindow } from '@videogen/shared/browser';
import { pct, resetTime } from '../lib/format.ts';
import { DISK_TONE, useStatus } from './shell/useStatus.ts';

export function UsageBar({ label, testId, w, wide = false }: { label: string; testId: string; w: UsageWindow | null | undefined; wide?: boolean }) {
  const level = usageLevel(w?.utilization ?? null);
  const fill = level === 'high' ? 'bg-red' : level === 'warn' ? 'bg-ink-2' : 'bg-accent-glow';
  return (
    <div data-testid={testId} className={wide ? 'flex flex-col gap-1.5' : 'flex items-center gap-2'} title={resetTime(w?.resetsAt)}>
      <div className={wide ? 'flex items-baseline justify-between gap-2' : 'contents'}>
        <span className="text-ink-2">{label}</span>
        {wide && <span className="tabular-nums font-medium">{pct(w?.utilization)}</span>}
      </div>
      <span className={`relative h-1.5 overflow-hidden rounded-full bg-inset ${wide ? 'w-full' : 'w-24'}`}>
        <span className={`absolute inset-y-0 left-0 ${fill} transition-[width] duration-500`} style={{ width: `${Math.round((w?.utilization ?? 0) * 100)}%` }} />
      </span>
      {!wide && <span className="tabular-nums font-medium">{pct(w?.utilization)}</span>}
      {w?.resetsAt && <span className="text-ink-3">{resetTime(w.resetsAt)}</span>}
    </div>
  );
}

/** Tablet and desktop: one line along the bottom (spec §13.1 footer). Phones show the same facts in the status sheet. */
export function UsageFooter() {
  const s = useStatus();
  return (
    <footer role="contentinfo" className="flex h-9 items-center gap-5 overflow-hidden border-t border-line bg-paper px-4 text-[12px] whitespace-nowrap">
      <span className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${s.claude[0]}`} />
        {s.claude[1]}
      </span>
      {s.plan && <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium capitalize">{s.plan}</span>}
      <UsageBar label="5 h" testId="usage-5h" w={s.fiveHour} />
      <UsageBar label="7 d" testId="usage-7d" w={s.sevenDay} />
      {s.guard && <span data-testid="usage-guard" className="rounded-full bg-inset px-2.5 py-0.5 text-[11.5px] text-ink">{s.guard}</span>}
      {s.updated && <span className="text-ink-3">{s.updated}</span>}
      {s.disk && (
        <span data-testid="disk-free" className={`ml-auto flex items-center gap-1.5 ${DISK_TONE[s.disk.tone][1]}`} title={s.disk.tone === 'ok' ? undefined : 'Free disk is running low: Settings → Data and backups'}>
          <span className={`size-2 rounded-full ${DISK_TONE[s.disk.tone][0]}`} />
          {s.disk.text}
        </span>
      )}
      <span className={`${s.disk ? '' : 'ml-auto '}flex items-center gap-1.5 text-ink-2`}>
        <span className={`size-2 rounded-full ${s.worker[0]}`} />
        {s.worker[1]}
      </span>
    </footer>
  );
}
