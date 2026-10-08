import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { blobUrl } from '../../lib/api.ts';
import { setActivePlayer, setShowFinal } from '../../lib/player.ts';
import type { VersionView } from '@videogen/shared/browser';
import { finished } from '../../lib/compare-view.ts';
import { playerTabs, type DraftPick, type FinalPick, type PlayerTab } from '../../lib/production-view.ts';
import { CompareView } from '../library/CompareView.tsx';

const DraftPlayer = lazy(() => import('./DraftPlayer.tsx'));

/** An MP4 streamed from the media endpoint with HTTP Range (spec §13.1 Final tab; the draft MP4 uses the same element). */
function Mp4({ sha, cover, testId, kind }: { sha: string; cover: string | null; testId: string; kind: 'final' | 'draft' }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setActivePlayer({
      kind,
      toggle: () => { if (v.paused) void v.play(); else v.pause(); },
      pause: () => v.pause(),
      seekBy: (s) => { v.currentTime = Math.max(0, Math.min(Number.isFinite(v.duration) ? v.duration : 0, v.currentTime + s)); },
      seekTo: (s) => { v.currentTime = Math.max(0, Number.isFinite(v.duration) ? Math.min(v.duration, s) : s); },
    });
    return () => setActivePlayer(null);
  }, [sha, kind]);
  return (
    <video
      ref={ref}
      data-testid={testId}
      src={blobUrl(sha)}
      poster={cover ? blobUrl(cover) : undefined}
      controls
      playsInline
      preload="metadata"
      className="aspect-[9/16] w-full rounded-card bg-inset"
    />
  );
}

/** Plan E18: the final in its two variants (spec §7.6): with music, and without (the sound is added in the TikTok app). */
function FinalPanel({ final }: { final: FinalPick }) {
  const [variant, setVariant] = useState<'music' | 'tiktok'>('music');
  const sha = variant === 'music' ? final.musicSha! : (final.tiktokSha ?? final.musicSha!);
  return (
    <div className="flex flex-col gap-2">
      <Mp4 key={sha} sha={sha} cover={final.coverSha} testId="final-video" kind="final" />
      <div className="flex justify-center gap-1" role="group" aria-label="Varyant">
        {([['music', 'Müzikli'], ['tiktok', 'Müziksiz']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid="variant-chip"
            aria-pressed={variant === id}
            disabled={id === 'tiktok' && !final.tiktokSha}
            onClick={() => setVariant(id)}
            className={`rounded-full px-3 py-1 text-[12px] transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-40 ${variant === id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-hover-2 hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Player tabs (spec §13.1): "Final" first when a final exists, else "Taslak MP4"; the live "Taslak" only mounts when opened, so no
 * WebGL or 1.4 MB chunk loads before (grilling C26). Plan M7 Y7: "Karşılaştır" when two or more versions have a final.
 */
export function DraftTabs({ pick, final, versions = [] }: { pick: DraftPick; final: FinalPick; versions?: VersionView[] }) {
  const { tabs, initial } = playerTabs({ final: !!final.musicSha, draft: !!pick.videoSha, compare: finished(versions).length >= 2 });
  const [tab, setTab] = useState<PlayerTab>(initial);
  const hasFinal = !!final.musicSha;
  useEffect(() => {
    if (!hasFinal) return;
    setShowFinal(() => setTab('final'));
    return () => setShowFinal(null);
  }, [hasFinal]);
  if (!tabs.length) return null;
  return (
    <section aria-label="Taslak oynatıcı" data-testid="draft-tabs" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Oynatıcı" className="flex gap-1">
        {tabs.map(([id, label]) => (
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
      <div role="tabpanel" id="draft-panel" aria-labelledby={`draft-tab-${tab}`} className={`mx-auto w-full ${tab === 'compare' ? 'max-w-[660px]' : 'max-w-[320px]'}`}>
        {tab === 'final' ? (
          <FinalPanel final={final} />
        ) : tab === 'compare' ? (
          <CompareView versions={versions} />
        ) : tab === 'mp4' ? (
          <Mp4 sha={pick.videoSha!} cover={pick.coverSha} testId="draft-video" kind="draft" />
        ) : (
          <Suspense fallback={<p className="py-10 text-center text-[13px] text-ink-3">Oynatıcı yükleniyor…</p>}>
            <DraftPlayer pick={pick} />
          </Suspense>
        )}
      </div>
    </section>
  );
}
