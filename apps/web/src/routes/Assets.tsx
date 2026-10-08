import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LEDGER_KINDS, type LedgerKind } from '@videogen/shared/browser';
import { AssetAddForm } from '../components/assets/AssetAddForm.tsx';
import { AssetTable } from '../components/assets/AssetTable.tsx';
import { api } from '../lib/api.ts';
import { assetsView, KIND_LABEL } from '../lib/assets-view.ts';

const chip = (on: boolean) =>
  `rounded-full px-3 py-1 text-[12px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${on ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`;

/** Plan M7 Y8 asset ledger (spec §13.1 Varlıklar): license fields, preview, usage, Add (upload + license gate) and revoke. */
export function Assets() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<LedgerKind>('music');
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['assets'], queryFn: api.assets, staleTime: 0 });
  const view = useMemo(() => assetsView(q.data ?? [], kind), [q.data, kind]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['assets'] });

  return (
    <div data-testid="assets-page" className="mx-auto flex max-w-[900px] flex-col gap-4 p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[16px] font-medium">Varlıklar</h1>
        <button
          type="button"
          aria-expanded={adding}
          onClick={() => setAdding((a) => !a)}
          className="rounded-control bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity duration-100 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {adding ? 'Kapat' : 'Ekle'}
        </button>
      </div>
      <div role="group" aria-label="Tür" className="flex gap-1">
        {LEDGER_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
            {KIND_LABEL[k]} <span className="tabular-nums opacity-70">{view.counts[k]}</span>
          </button>
        ))}
      </div>
      {adding && <AssetAddForm kind={kind} onDone={() => { setAdding(false); void refresh(); }} />}
      {q.isError && <p className="text-[13px] text-red">Varlıklar alınamadı: {q.error instanceof Error ? q.error.message : String(q.error)}</p>}
      {q.isSuccess && view.rows.length === 0 && <p className="text-[13px] text-ink-2">Bu türde kayıtlı varlık yok.</p>}
      {view.rows.length > 0 && <AssetTable rows={view.rows} onRevoked={() => void refresh()} />}
    </div>
  );
}
