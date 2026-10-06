import { CHANNEL_STYLES, DRAFT_MAX_RETURNS, draftRound, type ArtifactMeta, type BuildReport, type ProgressSource, type RunView, type SceneSpec, type StepView, type VideoStatus, type VideoUsage, type VideoView } from '@videogen/shared/browser';
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

export function formatDay(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date(now).toDateString()) return `bugün ${time}`;
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}`;
}

/** Build card summary: parts, triangles, hero size at frame 0, channel style; up to five warnings. */
export function buildFacts(report: BuildReport, scene?: SceneSpec): { line: string; warnings: string[] } {
  const line = [
    `${report.parts.length} parça`,
    `${report.triangles.toLocaleString('tr-TR')} üçgen`,
    `kahraman %${Math.round(report.hero_ratio * 100)}`,
    scene ? CHANNEL_STYLES[scene.style_id].name_tr : '',
  ].filter(Boolean).join(' · ');
  return { line, warnings: report.warnings.slice(0, 5) };
}

/** The latest artifacts of a run the draft player needs (ids for JSON content, shas for media). */
export interface DraftPick { videoSha: string | null; coverSha: string | null; glbSha: string | null; trackId: string | null; sceneId: string | null; storyboardId: string | null; reviewId: string | null }
export function pickDraft(list: ArtifactMeta[], runId: string | null): DraftPick {
  const find = (kind: string) => list.find((a) => a.kind === kind && (!runId || a.runId === runId)) ?? null;
  return {
    videoSha: find('draft_video')?.blobSha ?? null, coverSha: find('draft_cover')?.blobSha ?? null, glbSha: find('scene_glb')?.blobSha ?? null,
    trackId: find('camera_track')?.id ?? null, sceneId: find('scene')?.id ?? null, storyboardId: find('storyboard')?.id ?? null, reviewId: find('draft_review')?.id ?? null,
  };
}

/** Header line while a draft fix round runs: "Taslak turu 1/2 · %37" (plan C11); empty otherwise. */
export function draftRoundLabel(run: RunView | null | undefined): string {
  if (!isRunActive(run)) return '';
  const d = draftRound(run!.steps);
  return d ? `Taslak turu ${d.round}/${DRAFT_MAX_RETURNS} · %${d.percent}` : '';
}
