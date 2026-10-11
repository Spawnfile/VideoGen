import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { UsageWindow } from '@videogen/shared/browser';
import { api, useClaudeStatus, type ClaudePhase } from '../../lib/api.ts';
import { ago, guardText } from '../../lib/format.ts';
import { useLive } from '../../lib/live.ts';
import { diskLabel, type DiskTone } from '../../lib/maintenance-view.ts';

const CLAUDE: Record<ClaudePhase, [dot: string, text: string]> = {
  loading: ['bg-line-strong', 'Checking Claude'],
  error: ['bg-line-strong', 'Claude status unavailable'],
  in: ['bg-green', 'Claude connected'],
  out: ['bg-red', 'Claude not connected'],
};
export const DISK_TONE: Record<DiskTone, [dot: string, text: string]> = { ok: ['bg-line-strong', 'text-ink-2'], warn: ['bg-line-strong', 'font-medium text-ink'], low: ['bg-red', 'font-medium text-red'] };

export interface StatusView {
  claude: [dot: string, text: string];
  phase: ClaudePhase;
  plan: string | null;
  fiveHour: UsageWindow | null | undefined;
  sevenDay: UsageWindow | null | undefined;
  guard: string | null;
  updated: string;
  disk: ReturnType<typeof diskLabel>;
  worker: [dot: string, text: string];
  live: 'open' | 'reconnecting' | 'connecting';
}

/** Everything the desktop footer and the phone status sheet show: Claude, the usage windows, the guard, disk and the worker. */
export function useStatus(): StatusView {
  const live = useLive();
  const { c, phase } = useClaudeStatus();
  const usage = useQuery({ queryKey: ['usage'], queryFn: api.usage });
  const guard = useQuery({ queryKey: ['usage', 'guard'], queryFn: api.guard });
  // Plan M7 Y11: free disk on the data dir; Settings → "Data and backups" shares the query.
  const maintenance = useQuery({ queryKey: ['maintenance'], queryFn: api.maintenance, refetchInterval: 60_000 });
  const [now, setNow] = useState(Date.now());
  const [mountedAt] = useState(now);
  useEffect(() => { const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h); }, []);
  const workerAlive = live.heartbeatAt !== null && now - live.heartbeatAt < 6000;
  // Heartbeats arrive every 2 s; until the first one (grace 6 s after load) the worker is "checking", not "down".
  const workerPending = live.heartbeatAt === null && now - mountedAt < 6000;
  return {
    claude: CLAUDE[phase],
    phase,
    plan: c?.subscriptionType ?? null,
    fiveHour: usage.data?.fiveHour,
    sevenDay: usage.data?.sevenDay,
    guard: guard.data?.blocked ? guardText(guard.data) : null,
    updated: usage.data ? ago(usage.data.at, now) : '',
    disk: diskLabel(maintenance.data?.diskFreeMb),
    worker: workerAlive ? ['bg-green', 'Worker live'] : workerPending ? ['bg-line-strong', 'Checking the worker'] : ['bg-red', 'Worker not responding'],
    live: live.status as StatusView['live'],
  };
}
