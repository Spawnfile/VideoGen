import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api.ts';
import { chainView } from '../../lib/audit-view.ts';

const TEXT = { ok: 'text-green', error: 'text-red', warn: 'text-ink', neutral: 'text-ink-2' } as const;
const DOT = { ok: 'bg-green', error: 'bg-red', warn: 'bg-line-strong', neutral: 'bg-line-strong' } as const;

/** Plan M7 Y6: the page load reads the cached chain check; "Yeniden doğrula" asks for a fresh full scan. */
export function ChainStatus() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['audit', 'verify'], queryFn: () => api.auditVerify(false), staleTime: 0, retry: false });
  const [busy, setBusy] = useState(false);
  const [freshError, setFreshError] = useState<unknown>(null);
  const v = chainView(freshError ? null : (q.data ?? null), freshError ?? q.error);
  const recheck = async () => {
    if (busy) return;
    setBusy(true);
    try {
      qc.setQueryData(['audit', 'verify'], await api.auditVerify(true));
      setFreshError(null);
    } catch (e) {
      setFreshError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex items-center gap-3 rounded-card border border-line/60 bg-paper px-4 py-3 shadow-subtle">
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[v.tone]}`} />
      <div className="min-w-0 flex-1">
        <p data-testid="chain-status" data-tone={v.tone} className={`text-[14px] font-medium tabular-nums ${TEXT[v.tone]}`}>{busy ? 'Zincir doğrulanıyor…' : v.text}</p>
        {v.detail && !busy && <p className="truncate text-[12px] tabular-nums text-ink-3">{v.detail}</p>}
      </div>
      <button
        type="button"
        onClick={() => void recheck()}
        disabled={busy}
        className="rounded-control border border-line px-3 py-1.5 text-[13px] text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Yeniden doğrula
      </button>
    </section>
  );
}
