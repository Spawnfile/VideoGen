import type { ReactNode } from 'react';
import { formatClock, type RunView, type VideoView } from '@videogen/shared/browser';
import { score as formatScore, VIDEO_STATUS_EN } from '../../lib/i18n.ts';
import { LABEL_CLASS, lengthOf, videoLabel } from '../../lib/poster.ts';
import { formatDay } from '../../lib/production-view.ts';
import { Poster } from './Poster.tsx';

/**
 * Spec E13: one video on the library's contact sheet — the poster with its state and length, the product, the day and the score. The
 * top-right slot is empty for now; the video-library work puts platform badges there.
 */
export function PosterCard({ video, run, onOpen, badges }: { video: VideoView; run: RunView | null; onOpen: () => void; badges?: ReactNode }) {
  const label = videoLabel(video, run);
  const len = lengthOf(video);
  const live = label.tone === 'live';
  return (
    <button
      type="button"
      data-testid="library-item"
      data-status={video.status}
      onClick={onOpen}
      title={VIDEO_STATUS_EN[video.status]}
      className="group flex min-w-0 flex-col gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-glow"
    >
      <span className={`block rounded-[8px] transition-transform duration-150 group-hover:-translate-y-0.5 ${live ? 'ring-ember [--ring-fill:var(--color-canvas)]' : 'border border-line'}`}>
        <Poster video={video} coverTestId="library-cover" className="text-[15px]">
          <span className={`label-mono absolute top-1.5 left-1.5 rounded-[3px] bg-canvas/70 px-1.5 py-0.5 text-[9px] backdrop-blur-sm ${LABEL_CLASS[label.tone]}`}>{label.text}</span>
          {badges && <span className="absolute top-1.5 right-1.5 flex gap-1">{badges}</span>}
          {len !== null && <span aria-hidden className="absolute right-1.5 bottom-1.5 rounded-[3px] bg-canvas/70 px-1 py-0.5 font-mono text-[10px] tabular-nums text-ink backdrop-blur-sm">{formatClock(len)}</span>}
        </Poster>
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-[14px] leading-snug font-semibold break-words">{video.productName}</span>
        <span className="label-mono mt-1 block truncate text-[9.5px] text-ink-3">
          {formatDay(video.createdAt)}
          {len !== null && <span data-testid="library-duration"> · {formatClock(len)}</span>}
          {video.score !== null && <span data-testid="library-score"> · {formatScore(video.score)} points</span>}
        </span>
      </span>
    </button>
  );
}
