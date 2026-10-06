import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { blobUrl } from '../../lib/api.ts';
import { setActivePlayer } from '../../lib/player.ts';
import type { DraftPick } from '../../lib/production-view.ts';

const DraftPlayer = lazy(() => import('./DraftPlayer.tsx'));
type Tab = 'live' | 'mp4';
const TABS: [Tab, string][] = [['live', 'Taslak'], ['mp4', 'Taslak MP4']];

/** The rendered draft, streamed from the media endpoint with HTTP Range (spec §13.1 Final tab's mechanism, used for the draft in M4). */
function Mp4({ sha, cover }: { sha: string; cover: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setActivePlayer({
      toggle: () => { if (v.paused) void v.play(); else v.pause(); },
      pause: () => v.pause(),
      seekBy: (s) => { v.currentTime = Math.max(0, Math.min(Number.isFinite(v.duration) ? v.duration : 0, v.currentTime + s)); },
    });
    return () => setActivePlayer(null);
  }, [sha]);
  return (
    <video
      ref={ref}
      data-testid="draft-video"
      src={blobUrl(sha)}
      poster={cover ? blobUrl(cover) : undefined}
      controls
      playsInline
      preload="metadata"
      className="aspect-[9/16] w-full rounded-card bg-inset"
    />
  );
}

/** Player tabs (spec §13.1): "Taslak MP4" is selected first, so no WebGL or 1.4 MB chunk loads until "Taslak" is opened (grilling C26). */
export function DraftTabs({ pick }: { pick: DraftPick }) {
  const [tab, setTab] = useState<Tab>('mp4');
  if (!pick.videoSha) return null;
  return (
    <section aria-label="Taslak oynatıcı" data-testid="draft-tabs" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Oynatıcı" className="flex gap-1">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`draft-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="draft-panel"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1 text-[13px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${tab === id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
        </div>
        <span className="ml-auto text-[12px] text-ink-3">Boşluk oynat · J/L ±5 sn · K durdur</span>
      </div>
      <div role="tabpanel" id="draft-panel" aria-labelledby={`draft-tab-${tab}`} className="mx-auto w-full max-w-[320px]">
        {tab === 'mp4' ? (
          <Mp4 sha={pick.videoSha} cover={pick.coverSha} />
        ) : (
          <Suspense fallback={<p className="py-10 text-center text-[13px] text-ink-3">Oynatıcı yükleniyor…</p>}>
            <DraftPlayer pick={pick} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
