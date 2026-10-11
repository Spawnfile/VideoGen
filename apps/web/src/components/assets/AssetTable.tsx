import { useState } from 'react';
import { api } from '../../lib/api.ts';
import { REVOKE_CONFIRM, type AssetRowView, type AssetTone } from '../../lib/assets-view.ts';

const BADGE: Record<AssetTone, string> = {
  allowed: 'border border-line text-ink',
  rejected: 'bg-red/10 text-red',
  revoked: 'bg-inset text-ink-2',
};

/** One row per asset: title, license badge, author, source link, attribution, duration, usage, a preview player and the revoke action. */
export function AssetTable({ rows, onRevoked }: { rows: AssetRowView[]; onRevoked: () => void }) {
  return (
    <ul aria-label="Assets" className="divide-y divide-line/70 rounded-card bg-paper">
      {rows.map((r) => <AssetRow key={r.id} row={r} onRevoked={onRevoked} />)}
    </ul>
  );
}

function AssetRow({ row: r, onRevoked }: { row: AssetRowView; onRevoked: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revoke = async () => {
    setBusy(true);
    setError(null);
    const res = await api.revokeAsset(r.id, reason.trim());
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setConfirming(false);
    onRevoked();
  };
  return (
    <li data-testid="asset-row" data-id={r.id} data-tone={r.tone} className="flex flex-col gap-2 px-4 py-3 text-[13px]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-medium ${r.revoked ? 'text-ink-2 line-through decoration-ink-3/60' : ''}`}>{r.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11.5px] ${BADGE[r.tone]}`}>{r.licenseLabel}</span>
        <span className="text-ink-2">{r.author}</span>
        {r.source && <a href={r.source.href} target="_blank" rel="noreferrer noopener" className="text-accent-glow underline-offset-2 hover:underline">{r.source.label}</a>}
        <span className="flex gap-3 tabular-nums text-ink-2 md:ml-auto">
          <span title="Length">{r.duration}</span>
          <span title="Usage">{r.used}</span>
        </span>
      </div>
      {r.attribution && <p className="text-[12.5px] text-ink-2">Attribution: {r.attribution}</p>}
      {r.note && <p className={`text-[12.5px] ${r.tone === 'rejected' ? 'text-red' : 'text-ink-2'}`}>{r.tone === 'revoked' ? 'Reason: ' : ''}{r.note}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <audio controls preload="none" src={r.preview} className="h-9 w-full md:h-8 md:max-w-[360px] md:flex-1" aria-label={`${r.title} preview`} />
        {r.canRevoke && !confirming && (
          <button
            type="button"
            data-testid="asset-revoke"
            onClick={() => setConfirming(true)}
            className="min-h-9 rounded-control border border-line px-3 py-1 text-[12.5px] text-ink-2 transition-colors duration-100 hover:bg-hover-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow"
          >
            Revoke permission
          </button>
        )}
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="Revoke permission" className="flex flex-col gap-2 rounded-input bg-inset px-3 py-2.5">
          <p className="text-[12.5px]">{REVOKE_CONFIRM}. This cannot be undone.</p>
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            Reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="h-10 rounded-control border border-line bg-inset px-2 text-[13px] md:h-8 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="asset-revoke-confirm"
              disabled={busy || !reason.trim()}
              onClick={() => void revoke()}
              className="rounded-control bg-red px-3 py-1 text-[12.5px] font-medium text-canvas transition-opacity duration-100 hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-glow"
            >
              Revoke permission
            </button>
            <button type="button" onClick={() => { setConfirming(false); setError(null); }} className="min-h-10 rounded-control px-3 py-1 text-[12.5px] text-ink-2 hover:bg-hover-2 md:min-h-0">
              Cancel
            </button>
          </div>
          {error && <p role="alert" className="text-[12.5px] text-red">{error}</p>}
        </div>
      )}
    </li>
  );
}
