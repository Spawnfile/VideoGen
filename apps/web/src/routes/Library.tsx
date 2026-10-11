import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { formatClock, PLATFORMS } from '@videogen/shared/browser';
import { PosterCard } from '../components/library/PosterCard.tsx';
import { api } from '../lib/api.ts';
import { filterHref, LIBRARY_FILTERS, matchesFilter, parseFilter, PLATFORM_EN, PLATFORM_SHORT, STATUS_EN, type LibraryFilter } from '../lib/platform-view.ts';
import { libraryTotals } from '../lib/poster.ts';
import { latestRunOf, pipeline, seedVideos, useStore, videoList } from '../lib/stores.ts';

let lastFilter: LibraryFilter = 'all';
// "Old version uploaded" asks for a re-upload, it is not a failure (Ember: amber, not red).
const BADGE = { uploaded: 'bg-green/20 text-green', outdated: 'bg-amber/20 text-amber', none: 'bg-canvas/70 text-ink-3' } as const;

/** Spec E13: the library as a contact sheet of 9:16 posters (2 columns on a phone up to 5 on a desktop), with the video-library filters. */
export function Library({ go }: { go: (url: string) => void }) {
  const q = useQuery({ queryKey: ['videos'], queryFn: async () => { const r = await api.videos(); seedVideos(r.data, r.eventId); return r.data.length; } });
  const state = useStore(pipeline);
  const videos = useMemo(() => videoList(state), [state]);
  // Video library L21: approach and "not on X" chips; the choice lives in ?f= so going back to the list keeps it.
  // The detail page's Back goes to /library; the last chip is remembered for this session so the list comes back filtered.
  const [filter, setFilter] = useState<LibraryFilter>(() => (window.location.search ? parseFilter(window.location.search) : lastFilter));
  const choose = (f: LibraryFilter) => { lastFilter = f; setFilter(f); window.history.replaceState(window.history.state, '', filterHref(f)); };
  const shown = useMemo(() => videos.filter((v) => matchesFilter(v, filter)), [videos, filter]);
  const totals = libraryTotals(shown);
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-4 pt-2 pb-8 md:p-8">
      <div className="flex items-baseline gap-3">
        <h1 className="hidden text-[28px] leading-none font-bold tracking-[-0.035em] md:block">Library</h1>
        {videos.length > 0 && (
          <span className="label-mono text-ink-3">
            {filter === 'all' ? `${videos.length} video${videos.length === 1 ? '' : 's'}` : `${shown.length} of ${videos.length}`}
            {totals.totalS > 0 ? ` · ${formatClock(totals.totalS)} total` : ''}
          </span>
        )}
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
              className={`min-h-9 shrink-0 rounded-control px-3 text-[13px] whitespace-nowrap transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-accent-glow ${filter === id ? 'bg-ink font-medium text-canvas' : 'border border-line-strong text-ink-2 hover:bg-hover-2'}`}
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
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 min-[480px]:grid-cols-3 md:grid-cols-4 desk:grid-cols-5">
        {shown.map((v) => (
          <PosterCard
            key={v.id}
            video={v}
            run={latestRunOf(state, v.id)}
            onOpen={() => go(`/library/${v.id}`)}
            badges={
              <>
                {v.origin === 'import' && <span data-testid="library-imported" className="label-mono rounded-[3px] bg-canvas/70 px-1 py-0.5 text-[8.5px] text-ink-2 backdrop-blur-sm">Imported</span>}
                {PLATFORMS.map((p) => (
                  <span key={p} data-testid={`library-badge-${p}`} data-status={v.platforms[p].status} title={`${PLATFORM_EN[p]}: ${STATUS_EN[v.platforms[p].status]}`}
                    className={`label-mono rounded-[3px] px-1 py-0.5 text-[8.5px] backdrop-blur-sm ${BADGE[v.platforms[p].status]}`}>{PLATFORM_SHORT[p]}</span>
                ))}
              </>
            }
          />
        ))}
      </div>
    </div>
  );
}
