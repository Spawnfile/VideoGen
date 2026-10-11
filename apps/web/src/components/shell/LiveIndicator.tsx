import { useMemo } from 'react';
import { liveCount } from '../../lib/poster.ts';
import { pipeline, useStore, videoList } from '../../lib/stores.ts';

/** "LIVE n" in the top bar while productions run or wait their turn (spec E9); nothing when none do. */
export function LiveIndicator() {
  const state = useStore(pipeline);
  const n = useMemo(() => liveCount(videoList(state)), [state]);
  if (n === 0) return null;
  return (
    <span data-testid="live-indicator" aria-label={`${n} production${n === 1 ? '' : 's'} running`} className="flex shrink-0 items-center gap-1.5">
      <span aria-hidden className="size-1.5 rounded-full bg-ember animate-breathe" />
      <span aria-hidden className="label-mono text-ember">Live {n}</span>
    </span>
  );
}
