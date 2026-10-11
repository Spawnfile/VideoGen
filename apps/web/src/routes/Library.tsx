import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { formatClock } from '@videogen/shared/browser';
import { PosterCard } from '../components/library/PosterCard.tsx';
import { api } from '../lib/api.ts';
import { libraryTotals } from '../lib/poster.ts';
import { latestRunOf, pipeline, seedVideos, useStore, videoList } from '../lib/stores.ts';

/** Spec E13: the library as a contact sheet of 9:16 posters (2 columns on a phone up to 5 on a desktop). */
export function Library({ go }: { go: (url: string) => void }) {
  const q = useQuery({ queryKey: ['videos'], queryFn: async () => { const r = await api.videos(); seedVideos(r.data, r.eventId); return r.data.length; } });
  const state = useStore(pipeline);
  const videos = useMemo(() => videoList(state), [state]);
  const totals = libraryTotals(videos);
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-4 pt-2 pb-8 md:p-8">
      <div className="flex items-baseline gap-3">
        <h1 className="hidden text-[28px] leading-none font-bold tracking-[-0.035em] md:block">Library</h1>
        {totals.count > 0 && (
          <span className="label-mono text-ink-3">
            {totals.count} video{totals.count === 1 ? '' : 's'}{totals.totalS > 0 ? ` · ${formatClock(totals.totalS)} total` : ''}
          </span>
        )}
      </div>
      {q.isSuccess && videos.length === 0 && (
        <p className="text-[13px] text-ink-2">No videos yet. Type a product name in the Studio to start one.</p>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 min-[480px]:grid-cols-3 md:grid-cols-4 desk:grid-cols-5">
        {videos.map((v) => (
          <PosterCard key={v.id} video={v} run={latestRunOf(state, v.id)} onOpen={() => go(`/library/${v.id}`)} />
        ))}
      </div>
    </div>
  );
}
