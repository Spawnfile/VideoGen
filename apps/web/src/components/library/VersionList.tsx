import { formatClock, formatScore, type VersionView } from '@videogen/shared/browser';
import { versionLabel } from '../../lib/compare-view.ts';
import { formatDay } from '../../lib/production-view.ts';

export function reasonLabel(reason: string): string {
  if (reason === 'produce') return 'İlk üretim';
  if (reason === 'fix:rework') return "Storyboard'dan yeniden";
  if (reason === 'fix:pending') return 'Düzeltme';
  return reason.startsWith('fix:') ? `Düzeltme (${reason.slice(4)})` : reason;
}

const badge = 'rounded-full bg-inset px-2 py-0.5 text-[11.5px] text-ink';

/**
 * Plan M7 Y7 "Sürümler": every version by round with its reason, score and flags. A version with a final is picked for the player above;
 * one without (an unfinished round) is labelled "tamamlanmadı" and cannot be picked.
 */
export function VersionList({ versions, selected, onSelect }: { versions: VersionView[]; selected: string | null; onSelect: (id: string) => void }) {
  if (!versions.length) return null;
  return (
    <ul data-testid="versions-list" aria-label="Sürümler" className="flex flex-col divide-y divide-line rounded-card border border-line/60 bg-paper shadow-subtle">
      {versions.map((v) => {
        const body = (
          <>
            <span className="w-20 shrink-0 text-[13.5px] font-medium">{versionLabel(v)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-ink-2">{reasonLabel(v.reason)} · {formatDay(v.createdAt)}</span>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {v.best && <span className={badge}>en iyi</span>}
                {v.current && <span className={badge}>güncel</span>}
                {v.published && <span className="rounded-full bg-green/10 px-2 py-0.5 text-[11.5px] text-green">yayında</span>}
                {!v.finals && <span data-testid="version-unfinished" className={`${badge} text-ink-3`}>tamamlanmadı</span>}
              </span>
            </span>
            <span className="shrink-0 text-right text-[12px] tabular-nums text-ink-3">
              {v.total !== null ? <span className="block text-[13px] text-ink">{formatScore(v.total)} puan</span> : null}
              {v.finals ? <span className="block">{formatClock(v.finals.durationS)}</span> : null}
            </span>
          </>
        );
        return (
          <li key={v.id} data-testid="version-row" data-round={v.round}>
            {v.finals ? (
              <button
                type="button"
                aria-pressed={selected === v.id}
                onClick={() => onSelect(v.id)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 first:rounded-t-card last:rounded-b-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${selected === v.id ? 'bg-accent/10' : 'hover:bg-hover'}`}
              >
                {body}
              </button>
            ) : (
              <div aria-disabled className="flex w-full items-center gap-3 px-4 py-2.5 opacity-70">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
