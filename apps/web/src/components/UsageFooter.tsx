import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usageLevel, type UsageWindow } from '@videogen/shared/browser';
import { api, useClaudeStatus, type ClaudePhase } from '../lib/api.ts';
import { ago, guardText, pct, resetTime } from '../lib/format.ts';
import { useLive } from '../lib/live.ts';

const CLAUDE_LABEL: Record<ClaudePhase, [dot: string, text: string]> = {
  loading: ['bg-line-strong', 'Claude durumu alınıyor'],
  error: ['bg-line-strong', 'Claude durumu alınamadı'],
  in: ['bg-green', 'Claude bağlı'],
  out: ['bg-red', 'Claude bağlı değil'],
};

function Bar({ label, testId, w }: { label: string; testId: string; w: UsageWindow | null | undefined }) {
  const level = usageLevel(w?.utilization ?? null);
  const fill = level === 'high' ? 'bg-red' : level === 'warn' ? 'bg-ink-2' : 'bg-accent';
  return (
    <div data-testid={testId} className="flex items-center gap-2" title={resetTime(w?.resetsAt)}>
      <span className="text-ink-2">{label}</span>
      <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-inset">
        <span className={`absolute inset-y-0 left-0 ${fill} transition-[width] duration-500`} style={{ width: `${Math.round((w?.utilization ?? 0) * 100)}%` }} />
      </span>
      <span className="tabular-nums font-medium">{pct(w?.utilization)}</span>
      {w?.resetsAt && <span className="text-ink-3">{resetTime(w.resetsAt)}</span>}
    </div>
  );
}

export function UsageFooter() {
  const live = useLive();
  const { c, phase } = useClaudeStatus();
  const usage = useQuery({ queryKey: ['usage'], queryFn: api.usage });
  const guard = useQuery({ queryKey: ['usage', 'guard'], queryFn: api.guard });
  const [now, setNow] = useState(Date.now());
  const [mountedAt] = useState(now);
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  const workerAlive = live.heartbeatAt !== null && now - live.heartbeatAt < 6000;
  // Heartbeats arrive every 2 s; until the first one (grace 6 s after load) the worker is "checking", not "down".
  const workerPending = live.heartbeatAt === null && now - mountedAt < 6000;
  const [claudeDot, claudeText] = CLAUDE_LABEL[phase];

  return (
    <footer role="contentinfo" className="flex h-9 items-center gap-5 border-t border-line bg-paper px-4 text-[12px]">
      <span className="flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${claudeDot}`} />
        {claudeText}
      </span>
      {c?.subscriptionType && (
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium capitalize">{c.subscriptionType}</span>
      )}
      <Bar label="5 sa" testId="usage-5h" w={usage.data?.fiveHour} />
      <Bar label="7 gün" testId="usage-7d" w={usage.data?.sevenDay} />
      {guard.data?.blocked && (
        <span data-testid="usage-guard" className="rounded-full bg-inset px-2.5 py-0.5 text-[11.5px] text-ink">{guardText(guard.data)}</span>
      )}
      {usage.data && <span className="text-ink-3">{ago(usage.data.at, now)}</span>}
      <span className="ml-auto flex items-center gap-1.5 text-ink-2">
        <span className={`size-2 rounded-full ${workerAlive ? 'bg-green' : workerPending ? 'bg-line-strong' : 'bg-red'}`} />
        {workerAlive ? 'Worker canlı' : workerPending ? 'Worker kontrol ediliyor' : 'Worker yanıt vermiyor'}
      </span>
    </footer>
  );
}
