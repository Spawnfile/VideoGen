import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { formatClock, formatScore, VIDEO_STATUS_LABEL } from '@videogen/shared/browser';
import { api, blobUrl } from '../lib/api.ts';
import { formatDay, formatUsage, videoTone } from '../lib/production-view.ts';
import { pipeline, seedVideos, useStore, videoList } from '../lib/stores.ts';

const DOT: Record<ReturnType<typeof videoTone>, string> = {
  active: 'bg-accent', ok: 'bg-green/70', error: 'bg-red/80', waiting: 'border border-ink-2 bg-transparent', muted: 'bg-line-strong',
};

export function Library({ go }: { go: (url: string) => void }) {
  const q = useQuery({ queryKey: ['videos'], queryFn: async () => { const r = await api.videos(); seedVideos(r.data, r.eventId); return r.data.length; } });
  const state = useStore(pipeline);
  const videos = useMemo(() => videoList(state), [state]);
  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 p-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[16px] font-medium">Kütüphane</h1>
        <span className="text-[12px] text-ink-3">{videos.length ? `${videos.length} video` : ''}</span>
      </div>
      {q.isSuccess && videos.length === 0 && (
        <p className="text-[13px] text-ink-2">Henüz video yok. Stüdyo'da bir ürün adı yazıp üretimi başlatın.</p>
      )}
      <ul className="flex flex-col divide-y divide-line rounded-card border border-line/60 bg-paper shadow-subtle">
        {videos.map((v) => {
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
              className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-100 first:rounded-t-card last:rounded-b-card hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
            >
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[videoTone(v.status)]}`} />
              <span aria-hidden className="h-12 w-[27px] shrink-0 overflow-hidden rounded-[4px] bg-inset">
                {cover && <img data-testid="library-cover" src={blobUrl(cover)} alt="" loading="lazy" className="size-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{v.productName}</span>
                <span className="block truncate text-[12px] text-ink-2">{VIDEO_STATUS_LABEL[v.status]}{v.score !== null ? <span data-testid="library-score" className="tabular-nums"> · {formatScore(v.score)} puan</span> : null}{v.statusNote ? ` · ${v.statusNote}` : ''}</span>
              </span>
              <span className="shrink-0 text-right text-[12px] tabular-nums text-ink-3">
                <span className="block">{formatDay(v.createdAt)}{len !== undefined ? <span data-testid="library-duration"> · {formatClock(len)}</span> : null}</span>
                <span className="block">{formatUsage(v.usage)}</span>
              </span>
            </button>
          </li>
          );
        })}
      </ul>
    </div>
  );
}
