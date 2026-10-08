import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { AUDIT_LIMIT_DEFAULT } from '@videogen/shared/browser';
import { AuditFilters } from '../components/audit/AuditFilters.tsx';
import { AuditTable } from '../components/audit/AuditTable.tsx';
import { ChainStatus } from '../components/audit/ChainStatus.tsx';
import { api } from '../lib/api.ts';
import { auditListPath, auditView, queryFromFilter, type AuditQueryFilter } from '../lib/audit-view.ts';

/**
 * Plan M7 Y6 audit explorer. `initial` seeds the filter (the page passes the URL's, the library detail a fixed video);
 * `onFilter` hears every change (the page writes it back to the URL); `fixed` keys stay as given and are not shown.
 */
export function Audit({ initial = {}, onFilter, fixed = [], embedded = false }: {
  initial?: AuditQueryFilter;
  onFilter?: (f: AuditQueryFilter) => void;
  fixed?: (keyof AuditQueryFilter)[];
  embedded?: boolean;
}) {
  const initialKey = queryFromFilter(initial);
  const [filter, setFilter] = useState<AuditQueryFilter>(initial);
  const [open, setOpen] = useState<number | null>(null);
  // Back/forward (or a new host filter) replaces the local one.
  useEffect(() => { setFilter(initial); setOpen(null); }, [initialKey]);
  const change = (f: AuditQueryFilter) => {
    const kept = Object.fromEntries(fixed.filter((k) => initial[k]).map((k) => [k, initial[k]]));
    const next = { ...f, ...kept };
    setFilter(next);
    setOpen(null);
    onFilter?.(next);
  };
  const key = queryFromFilter(filter);
  const q = useInfiniteQuery({
    queryKey: ['audit', 'list', key],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => api.auditPage(auditListPath(filter, pageParam, AUDIT_LIMIT_DEFAULT)),
    getNextPageParam: (last) => last.nextBefore,
    staleTime: 0,
  });
  const rows = useMemo(() => auditView(q.data?.pages.flatMap((p) => p.rows) ?? []).rows, [q.data]);

  return (
    <div data-testid="audit-page" className={`mx-auto flex max-w-[900px] flex-col gap-4 ${embedded ? '' : 'p-8'}`}>
      {!embedded && <h1 className="text-[16px] font-medium">Audit</h1>}
      <ChainStatus />
      <AuditFilters filter={filter} onChange={change} fixed={fixed} />
      {q.isError && <p className="text-[13px] text-red">Audit satırları alınamadı: {q.error instanceof Error ? q.error.message : String(q.error)}</p>}
      {q.isSuccess && rows.length === 0 && <p className="text-[13px] text-ink-2">Bu süzgeçlerle eşleşen satır yok.</p>}
      {rows.length > 0 && (
        <AuditTable rows={rows} open={open} onToggle={(seq) => setOpen((o) => (o === seq ? null : seq))} onFilter={(patch) => change({ ...filter, ...patch })} />
      )}
      {q.hasNextPage && (
        <button
          type="button"
          onClick={() => void q.fetchNextPage()}
          disabled={q.isFetchingNextPage}
          className="w-fit self-center rounded-control border border-line px-3 py-2 text-[13px] text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {q.isFetchingNextPage ? 'Yükleniyor…' : 'Daha eski'}
        </button>
      )}
    </div>
  );
}
