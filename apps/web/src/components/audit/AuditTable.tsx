import type { AuditQueryFilter, AuditRowView, AuditTone } from '../../lib/audit-view.ts';
import { AuditDetail } from './AuditDetail.tsx';

const ACTION: Record<AuditTone, string> = { neutral: 'text-ink', ok: 'text-green', warn: 'text-ink', error: 'text-red' };
const MARK: Record<AuditTone, string> = { neutral: 'bg-transparent', ok: 'bg-green/70', warn: 'bg-line-strong', error: 'bg-red/80' };
const cols = 'grid grid-cols-[6px_92px_104px_minmax(0,190px)_120px_minmax(0,1fr)] items-baseline gap-x-3';

/** saat · aktör · eylem · konu · kısa veri; a row's detail opens under it (not in a side drawer). */
export function AuditTable({ rows, open, onToggle, onFilter }: { rows: AuditRowView[]; open: number | null; onToggle: (seq: number) => void; onFilter: (patch: AuditQueryFilter) => void }) {
  return (
    <div role="table" aria-label="Audit satırları" className="rounded-card border border-line/60 bg-paper shadow-subtle">
      <div role="row" className={`${cols} border-b border-line px-4 py-2 text-[12px] text-ink-3`}>
        <span aria-hidden />
        <span role="columnheader">Saat</span>
        <span role="columnheader">Aktör</span>
        <span role="columnheader">Eylem</span>
        <span role="columnheader">Konu</span>
        <span role="columnheader">Veri</span>
      </div>
      <ul className="divide-y divide-line/70">
        {rows.map((r) => (
          <li key={r.seq} role="row">
            <button
              type="button"
              data-testid="audit-row"
              data-seq={r.seq}
              data-tone={r.tone}
              aria-expanded={open === r.seq}
              onClick={() => onToggle(r.seq)}
              className={`${cols} w-full px-4 py-2 text-left text-[13px] transition-colors duration-100 hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${open === r.seq ? 'bg-hover' : ''}`}
            >
              <span aria-hidden className={`size-1.5 translate-y-[-1px] self-center rounded-full ${MARK[r.tone]}`} />
              <span className="tabular-nums text-ink-2">{r.time}</span>
              <span className="truncate">{r.actor}</span>
              <span className={`truncate font-mono text-[12px] ${ACTION[r.tone]}`}>{r.action}</span>
              <span className="truncate text-ink-2">{r.subject}</span>
              <span className="truncate text-[12px] text-ink-3">{r.summary}</span>
            </button>
            {open === r.seq && <AuditDetail seq={r.seq} onFilter={onFilter} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
