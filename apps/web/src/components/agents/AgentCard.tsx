import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ROLE_LABELS, type AgentSessionView } from '@videogen/shared/browser';
import { cardMeta, isLiveStatus } from '../../lib/agent-view.ts';
import { api } from '../../lib/api.ts';
import { seedTrace, traceRows, traces, useStore, type SampleView } from '../../lib/stores.ts';
import { formatElapsed, lastActivity, modelLabel, STATUS_LABEL, statusTone, subagents } from '../../lib/trace-view.ts';
import { useNow } from '../../lib/use-now.ts';
import { TraceView } from '../thinking/TraceView.tsx';

const DOT: Record<ReturnType<typeof statusTone>, string> = {
  active: 'bg-accent',
  waiting: 'border border-ink-3 bg-transparent',
  ok: 'bg-green/70',
  error: 'bg-red/80',
  muted: 'bg-line-strong',
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

export function AgentCard({ session, sample }: { session: AgentSessionView; sample: SampleView | undefined }) {
  const now = useNow(1000);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const all = useStore(traces);
  const rows = useMemo(() => traceRows(all[session.id]), [all, session.id]);
  useQuery({
    queryKey: ['trace', session.id],
    queryFn: async () => { const r = await api.trace(session.id); seedTrace(session.id, r.data, r.eventId); return r.data.length; },
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open]);

  const live = isLiveStatus(session.status);
  const meta = cardMeta(session, sample, now);
  const tone = statusTone(session.status);
  const started = session.startedAt ? Date.parse(session.startedAt) : null;
  const elapsed = started === null ? null : formatElapsed((session.endedAt ? Date.parse(session.endedAt) : now) - started);
  const activity = lastActivity(rows);
  const subs = subagents(rows);
  const label = session.status === 'waiting_limit' && session.waitingUntil ? `${STATUS_LABEL.waiting_limit} (${clock(session.waitingUntil)})` : STATUS_LABEL[session.status];
  const act = (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); fn().catch(() => undefined).finally(() => setBusy(false)); };
  const stats = live
    ? [meta.ago && `son olay ${meta.ago}`, meta.alive && 'süreç canlı', meta.cpu, meta.ram, meta.tokens]
    : [meta.tokens, elapsed && `toplam ${elapsed}`];

  return (
    <article
      data-testid="agent-card"
      data-session={session.id}
      data-status={session.status}
      aria-label={`${ROLE_LABELS[session.role]} agent'ı`}
      className="rounded-card border border-line/60 bg-paper px-4 py-3 shadow-subtle"
    >
      <header className="flex items-center gap-2">
        <h3 className="text-[14px] font-medium">{ROLE_LABELS[session.role]}</h3>
        <span className="text-[12px] text-ink-2">{modelLabel(session.model)} · {session.effort}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-2">
          <span className={`size-2 rounded-full ${DOT[tone]}`} style={tone === 'active' ? { animation: 'fade-in 900ms ease-in-out infinite alternate' } : undefined} />
          <span>{label}</span>
          {elapsed && <span className="tabular-nums text-ink-3">{elapsed}</span>}
        </span>
      </header>

      {activity && (
        <p className="mt-2 flex min-w-0 items-center gap-2 text-[12.5px]">
          <span aria-hidden className="text-ink-3">▸</span>
          <span className="font-medium">{activity.title}</span>
          {activity.detail && <span className={`min-w-0 truncate text-ink-2 ${activity.mono ? 'font-mono text-[11.5px]' : ''}`}>{activity.detail}</span>}
          {activity.add !== undefined && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums"><span className="text-green">+{activity.add}</span> <span className="text-red">−{activity.del ?? 0}</span></span>
          )}
          {activity.status === 'denied' && <span className="shrink-0 text-[11.5px] text-red/80">reddedildi</span>}
        </p>
      )}

      {session.progress !== null && (
        <div className="mt-2 flex items-center gap-3 text-[12px]">
          {session.progressMessage && <span className="min-w-0 truncate text-ink-2">{session.progressMessage}</span>}
          <span className="relative h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-inset" role="progressbar" aria-valuenow={session.progress} aria-valuemin={0} aria-valuemax={100}>
            <span className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500" style={{ width: `${session.progress}%` }} />
          </span>
          <span className="shrink-0 tabular-nums">%{Math.round(session.progress)}</span>
          <span className="shrink-0 text-ink-3">{session.progressSource === 'time' ? 'tahmin' : 'agent raporu'}</span>
        </div>
      )}

      {subs.map((s) => (
        <p key={s.id} className="mt-1.5 flex items-center gap-2 pl-3 text-[12px] text-ink-2">
          <span aria-hidden className="text-ink-3">↳</span>
          <span>alt ajan: “{s.title}”</span>
          <span className={`size-1.5 rounded-full ${s.status === 'running' ? 'bg-accent' : s.status === 'done' ? 'bg-green/70' : 'bg-red/80'}`} />
          <span>{s.status === 'running' ? 'çalışıyor' : s.status === 'done' ? 'bitti' : 'hata'}</span>
          <span className="tabular-nums text-ink-3">{formatElapsed((s.endedAt ?? now) - s.startedAt)}</span>
        </p>
      ))}

      {session.status === 'failed' && session.error && <p className="mt-2 text-[12px] text-red/80">Hata: {session.error}</p>}

      {meta.stuck && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-input bg-inset px-3 py-2 text-[12.5px]">
          <span><span className="font-medium">Takılmış olabilir.</span> <span className="text-ink-2">Uzun süredir olay yok ve süreç boşta.</span></span>
          <span className="ml-auto flex gap-2">
            <button type="button" disabled={busy} onClick={() => act(() => api.cancelSession(session.id))} className="rounded-control border border-line-strong px-2.5 py-1 hover:bg-hover-2 focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-50">Durdur</button>
            <button type="button" disabled={busy} onClick={() => act(() => api.retrySession(session.id))} className="rounded-control px-2.5 py-1 text-ink-2 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-50">Yeniden dene</button>
          </span>
        </div>
      )}

      <footer className="mt-2 flex items-center gap-3">
        <p className="min-w-0 truncate text-[12px] tabular-nums text-ink-3">{stats.filter(Boolean).join(' · ')}</p>
        {rows.length > 0 && (
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="ml-auto shrink-0 rounded-control px-1.5 py-0.5 text-[12px] text-ink-2 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">
            {open ? 'İzi gizle' : 'İzi göster'}
          </button>
        )}
      </footer>

      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <TraceView rows={rows} />
        </div>
      )}
    </article>
  );
}
