import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LEDGER_KINDS, type LedgerKind } from '@videogen/shared/browser';
import { AssetAddForm } from '../components/assets/AssetAddForm.tsx';
import { AssetTable } from '../components/assets/AssetTable.tsx';
import { api } from '../lib/api.ts';
import { assetsView, KIND_LABEL } from '../lib/assets-view.ts';
import { useShellBar } from '../components/shell/ShellContext.tsx';
import { backTo } from '../lib/router.ts';

const chip = (on: boolean) =>
  `min-h-9 shrink-0 rounded-control px-3.5 py-1 text-[12px] whitespace-nowrap transition-colors md:min-h-0 md:px-3 duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow ${on ? 'bg-ink font-medium text-canvas' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`;

/** Plan M7 Y8 asset ledger (spec §13.1 Varlıklar): license fields, preview, usage, Add (upload + license gate) and revoke. */
export function Assets() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<LedgerKind>('music');
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['assets'], queryFn: api.assets, staleTime: 0 });
  const view = useMemo(() => assetsView(q.data ?? [], kind), [q.data, kind]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['assets'] });
  useShellBar({ title: 'Assets', back: { label: 'Settings', onBack: () => backTo('/settings') } }, []);

  return (
    <div data-testid="assets-page" className="mx-auto flex max-w-[900px] flex-col gap-4 px-4 pt-2 pb-8 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="hidden text-[28px] leading-none font-bold tracking-[-0.035em] md:block">Assets</h1>
        <button
          type="button"
          aria-expanded={adding}
          onClick={() => setAdding((a) => !a)}
          className="min-h-10 rounded-control bg-ink px-4 py-1.5 text-[13px] font-medium text-canvas md:min-h-0 md:px-3 transition-opacity duration-100 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow"
        >
          {adding ? 'Close' : 'Add'}
        </button>
      </div>
      <div role="group" aria-label="Kind" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
        {LEDGER_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
            {KIND_LABEL[k]} <span className="tabular-nums opacity-70">{view.counts[k]}</span>
          </button>
        ))}
      </div>
      {adding && <AssetAddForm kind={kind} onDone={() => { setAdding(false); void refresh(); }} />}
      {q.isError && <p className="text-[13px] text-red">Could not load the assets: {q.error instanceof Error ? q.error.message : String(q.error)}</p>}
      {q.isSuccess && view.rows.length === 0 && <p className="text-[13px] text-ink-2">No assets of this kind yet.</p>}
      {view.rows.length > 0 && <AssetTable rows={view.rows} onRevoked={() => void refresh()} />}
    </div>
  );
}
