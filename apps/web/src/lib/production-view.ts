import type { ProgressSource, RunView, StepView, VideoStatus, VideoUsage, VideoView } from '@videogen/shared/browser';
import { formatElapsed, formatTokens } from './trace-view.ts';

const ACTIVE = new Set(['queued', 'running', 'waiting_gpu', 'waiting_limit', 'waiting_disk']);

export function formatEta(s: number | null): string {
  if (s === null) return '';
  if (s < 60) return 'birkaç saniye kaldı';
  const m = Math.round(s / 60);
  return m < 60 ? `~${m} dk kaldı` : `~${Math.floor(m / 60)} sa ${m % 60} dk kaldı`;
}

export function sourceLabel(src: ProgressSource | null): string {
  return src === 'agent' ? 'agent raporu' : src === 'time' ? 'tahmin' : src === 'render' ? 'gerçek kare' : '';
}

export function videoTone(s: VideoStatus): 'active' | 'ok' | 'error' | 'waiting' | 'muted' {
  if (s === 'running' || s === 'queued') return 'active';
  if (s === 'ready' || s === 'published') return 'ok';
  if (s === 'failed') return 'error';
  if (s === 'needs_human') return 'waiting';
  return 'muted';
}

export const isRunActive = (r: RunView | null | undefined): boolean => !!r && (r.status === 'queued' || r.status === 'running');
export const activeStep = (r: RunView | null | undefined): StepView | null => r?.steps.find((s) => ACTIVE.has(s.status)) ?? null;

export function stepDuration(s: StepView, now: number): string {
  if (!s.startedAt) return '';
  const end = s.endedAt ? Date.parse(s.endedAt) : now;
  return formatElapsed(end - Date.parse(s.startedAt));
}

export function pickVideoId(param: string | null, videos: Pick<VideoView, 'id'>[]): string | null {
  if (param && videos.some((v) => v.id === param)) return param;
  return videos[0]?.id ?? null;
}

export function formatUsage(u: VideoUsage): string {
  const parts = [u.tokens ? `${formatTokens(u.tokens)} token` : '', u.fiveHourDelta !== null ? `5 sa %${Math.round(u.fiveHourDelta * 100)}` : ''];
  return parts.filter(Boolean).join(' · ');
}
