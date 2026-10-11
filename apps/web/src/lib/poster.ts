import type { RunView, VideoStatus, VideoView } from '@videogen/shared/browser';

/** Ember posters and status labels (spec 2026-10-11-ember-ui E10/E12): one source for the Studio bin, the library cards and the header. */

export type PosterTone = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** A stable dark tone (theme.css --poster-N) and the initial for a video that has no cover yet. */
export function posterTint(name: string): { tone: PosterTone; initial: string } {
  const key = name.trim().toLocaleLowerCase('tr');
  let h = 5381;
  for (const ch of key) h = ((h << 5) + h + ch.codePointAt(0)!) >>> 0;
  const first = [...key][0];
  return { tone: (h % 8) as PosterTone, initial: first ? first.toLocaleUpperCase('tr') : '·' };
}

/** The final's cover first, the draft's until a final exists (plan E18 order). */
export const coverOf = (v: Pick<VideoView, 'final' | 'draft'>): string | null => v.final?.coverSha ?? v.draft?.coverSha ?? null;
export const lengthOf = (v: Pick<VideoView, 'final' | 'draft'>): number | null => v.final?.durationS ?? v.draft?.durationS ?? null;

export type LabelTone = 'live' | 'needs' | 'ok' | 'error' | 'dim' | 'muted';

const LABELS: Record<Exclude<VideoStatus, 'running'>, { text: string; tone: LabelTone }> = {
  queued: { text: 'QUEUED', tone: 'muted' },
  needs_human: { text: 'NEEDS YOU', tone: 'needs' },
  ready: { text: 'READY', tone: 'ok' },
  published: { text: 'POSTED', tone: 'ok' },
  failed: { text: 'FAILED', tone: 'error' },
  cancelled: { text: 'STOPPED', tone: 'dim' },
};

export function videoLabel(video: Pick<VideoView, 'status'>, run: Pick<RunView, 'progress' | 'status'> | null): { text: string; tone: LabelTone } {
  if (video.status === 'running') return { text: run ? `${Math.round(run.progress)}%` : 'RUNNING', tone: 'live' };
  return LABELS[video.status];
}

export const LABEL_CLASS: Record<LabelTone, string> = {
  live: 'text-ember', needs: 'text-amber', ok: 'text-green', error: 'text-red', dim: 'text-dim', muted: 'text-ink-3',
};

/** The top bar's LIVE count: productions that are running or waiting their turn. */
export const liveCount = (videos: Pick<VideoView, 'status'>[]): number => videos.filter((v) => v.status === 'running' || v.status === 'queued').length;

/** Spec E15: other videos waiting for the user, newest first, at most two (the Studio strip under the bin). */
export function pickNeedsYou<V extends Pick<VideoView, 'id' | 'status' | 'createdAt'>>(videos: V[], selected: string | null): V[] {
  return videos
    .filter((v) => v.status === 'needs_human' && v.id !== selected)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 2);
}
