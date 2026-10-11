import type { VideoView } from '@videogen/shared/browser';
import { VIDEO_STATUS_EN } from '../../lib/i18n.ts';
import { LABEL_CLASS, videoLabel } from '../../lib/poster.ts';
import { latestRunOf, pipeline, useStore } from '../../lib/stores.ts';
import { Poster } from '../library/Poster.tsx';

/** Spec E10: the phone Studio's videos as a strip of 9:16 frames, each labelled with its state; the live one wears the ember ring. */
export function VideoBin({ videos, selected, onSelect, onNew }: { videos: VideoView[]; selected: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const state = useStore(pipeline);
  return (
    <div role="tablist" aria-label="Videos" data-testid="video-bin" className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-0.5">
      {videos.map((v) => {
        const on = v.id === selected;
        const label = videoLabel(v, latestRunOf(state, v.id));
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`${v.productName}, ${label.text}`}
            title={VIDEO_STATUS_EN[v.status]}
            onClick={() => onSelect(v.id)}
            className="flex w-[60px] shrink-0 snap-start flex-col gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow"
          >
            <span className={`block rounded-[8px] ${on ? 'ring-ember [--ring-fill:var(--color-canvas)]' : 'border border-line'}`}>
              <Poster video={v} className="text-[11px]" />
            </span>
            <span className={`label-mono truncate text-[9px] ${LABEL_CLASS[label.tone]}`}>{label.text}</span>
          </button>
        );
      })}
      <button type="button" onClick={onNew} aria-label="New video" className="flex w-[60px] shrink-0 snap-start flex-col gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-glow">
        <span className="flex aspect-[9/16] w-full items-center justify-center rounded-[8px] border border-dashed border-line-strong text-ink-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </span>
        <span className="label-mono text-[9px] text-ink-3">New</span>
      </button>
    </div>
  );
}
