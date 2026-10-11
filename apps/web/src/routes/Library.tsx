import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { formatClock, PLATFORMS } from '@videogen/shared/browser';
import { score as formatScore, VIDEO_STATUS_EN } from '../lib/i18n.ts';
import { api, blobUrl } from '../lib/api.ts';
import { filterHref, LIBRARY_FILTERS, matchesFilter, parseFilter, PLATFORM_EN, PLATFORM_SHORT, STATUS_EN, type LibraryFilter } from '../lib/platform-view.ts';
import { formatDay, formatUsage, videoTone } from '../lib/production-view.ts';
import { pipeline, seedVideos, useStore, videoList } from '../lib/stores.ts';

let lastFilter: LibraryFilter = 'all';
const BADGE = { uploaded: 'bg-green/15 text-green', outdated: 'bg-red/15 text-red', none: 'bg-inset text-ink-3' } as const;

const DOT: Record<ReturnType<typeof videoTone>, string> = {
  active: 'bg-accent-glow', ok: 'bg-green/70', error: 'bg-red/80', waiting: 'border border-ink-2 bg-transparent', muted: 'bg-line-strong',
};

export function Library({ go }: { go: (url: string) => void }) {
  const q = useQuery({ queryKey: ['videos'], queryFn: async () => { const r = await api.videos(); seedVideos(r.data, r.eventId); return r.data.length; } });
  const state = useStore(pipeline);
  const videos = useMemo(() => videoList(state), [state]);
  // Video library L21: approach and "not on X" chips; the choice lives in ?f= so going back to the list keeps it.
  // The detail page's Back goes to /library; the last chip is remembered for this session so the list comes back filtered.
  const [filter, setFilter] = useState<LibraryFilter>(() => (window.location.search ? parseFilter(window.location.search) : lastFilter));
  const choose = (f: LibraryFilter) => { lastFilter = f; setFilter(f); window.history.replaceState(window.history.state, '', filterHref(f)); };
  const shown = useMemo(() => videos.filter((v) => matchesFilter(v, filter)), [videos, filter]);
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-4 pt-2 pb-6 md:p-8">
      <div className="flex items-baseline gap-3">
        <h1 className="hidden text-[16px] font-medium md:block">Library</h1>
        <span className="text-[12px] text-ink-3">{videos.length ? (filter === 'all' ? `${videos.length} video${videos.length === 1 ? '' : 's'}` : `${shown.length} of ${videos.length}`) : ''}</span>
      </div>
      {videos.length > 0 && (
        <div role="group" aria-label="Filter" className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {LIBRARY_FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`library-filter-${id}`}
              aria-pressed={filter === id}
              onClick={() => choose(id)}
              className={`min-h-9 shrink-0 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-accent-glow ${filter === id ? 'bg-accent text-white' : 'border border-line-strong text-ink-2 hover:bg-hover-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {videos.length > 0 && shown.length === 0 && <p className="text-[13px] text-ink-2">Nothing matches this filter.</p>}
      {q.isSuccess && videos.length === 0 && (
        <p className="text-[13px] text-ink-2">No videos yet. Type a product name in the Studio to start one.</p>
      )}
      <ul className="flex flex-col divide-y divide-line rounded-card bg-paper">
        {shown.map((v) => {
          // Plan E18: the final's cover and length first, the draft's until a final exists.
          const cover = v.final?.coverSha ?? v.draft?.coverSha;
          const len = v.final?.durationS ?? v.draft?.durationS;
          return (
          <li key={v.id}>
            <button
              type="button"
              data-testid="library-item"
              data-status={v.status}
              onClick={() => go(`/library/${v.id}`)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left md:gap-4 md:px-4 transition-colors duration-100 first:rounded-t-card last:rounded-b-card hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-glow"
            >
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[videoTone(v.status)]}`} />
              <span aria-hidden className="h-[72px] w-[41px] shrink-0 overflow-hidden rounded-[6px] bg-inset md:h-12 md:w-[27px] md:rounded-[4px]">
                {cover && <img data-testid="library-cover" src={blobUrl(cover)} alt="" loading="lazy" className="size-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{v.productName}</span>
                <span className="block truncate text-[12px] text-ink-2">{VIDEO_STATUS_EN[v.status]}{v.score !== null ? <span data-testid="library-score" className="tabular-nums"> · {formatScore(v.score)} points</span> : null}{v.statusNote ? ` · ${v.statusNote}` : ''}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {PLATFORMS.map((p) => (
                    <span key={p} data-testid={`library-badge-${p}`} data-status={v.platforms[p].status} title={`${PLATFORM_EN[p]}: ${STATUS_EN[v.platforms[p].status]}`}
                      className={`rounded px-1 text-[10.5px] font-medium ${BADGE[v.platforms[p].status]}`}>{PLATFORM_SHORT[p]}</span>
                  ))}
                  {v.origin === 'import' && <span data-testid="library-imported" className="rounded bg-inset px-1 text-[10.5px] text-ink-3">Imported</span>}
                </span>
              </span>
              <span className="shrink-0 text-right text-[12px] tabular-nums text-ink-3">
                <span className="block">{formatDay(v.createdAt)}{len !== undefined ? <span data-testid="library-duration"> · {formatClock(len)}</span> : null}</span>
                <span className="hidden md:block">{formatUsage(v.usage)}</span>
              </span>
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
