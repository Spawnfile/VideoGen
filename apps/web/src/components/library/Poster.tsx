import { useState, type ReactNode } from 'react';
import type { VideoView } from '@videogen/shared/browser';
import { blobUrl } from '../../lib/api.ts';
import { windowLabel } from '../../lib/i18n.ts';
import { coverOf, posterTint } from '../../lib/poster.ts';

/**
 * A video as a 9:16 frame (spec E10/E12): its cover when there is one, otherwise a derived poster — a stable dark tone, the initial and
 * the length window — so an unfinished video still looks like a video. A cover that fails to load falls back to the derived poster.
 */
export function Poster({ video, className = '', coverTestId, children }: { video: VideoView; className?: string; coverTestId?: string; children?: ReactNode }) {
  const cover = coverOf(video);
  const [broken, setBroken] = useState<string | null>(null);
  const show = cover && broken !== cover ? cover : null;
  const tint = posterTint(video.productName);
  return (
    <span className={`relative block aspect-[9/16] overflow-hidden rounded-frame bg-inset ${className}`} data-poster={show ? 'cover' : 'tint'}>
      {show ? (
        <img data-testid={coverTestId} src={blobUrl(show)} alt="" loading="lazy" onError={() => setBroken(show)} className="size-full object-cover" />
      ) : (
        <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: `var(--poster-${tint.tone})` }}>
          <span className="text-[2.4em] leading-none font-bold text-ink/25">{tint.initial}</span>
          <span className="label-mono absolute bottom-[8%] text-[0.62em] text-ink/40">{windowLabel(video.duration)}</span>
        </span>
      )}
      {children}
    </span>
  );
}
