import { useEffect } from 'react';
import type { VideoView } from '@videogen/shared/browser';
import { pipeline, useStore, videoList } from './stores.ts';

/** Videos that wait for the user: a human decision is needed, or the production failed. */
export const badgeCount = (videos: Pick<VideoView, 'status'>[]): number => videos.filter((v) => v.status === 'needs_human' || v.status === 'failed').length;

/** Keeps the installed app's icon badge in step with the videos (decision K3: a badge, no push). Browsers without the API ignore it. */
export function useAppBadge(): void {
  const state = useStore(pipeline);
  const n = badgeCount(videoList(state));
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!nav.setAppBadge) return;
    void (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge?.())?.catch(() => {});
  }, [n]);
}
