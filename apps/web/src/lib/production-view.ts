import {
  CHANNEL_STYLES, DIMENSIONS, DRAFT_MAX_RETURNS, draftRound, formatClock, GATES, QC_CHECKS, type ArtifactMeta, type BuildReport, type ProgressSource, type QcReport,
  type RunView, type SceneSpec, type StepView, type VideoStatus, type VideoUsage, type VideoView,
} from '@videogen/shared/browser';
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

/** The latest final artifacts of a run (spec §13.1 Final tab, plan E18). */
export interface FinalPick { musicSha: string | null; tiktokSha: string | null; coverSha: string | null; qcId: string | null }
export function pickFinal(list: ArtifactMeta[], runId: string | null): FinalPick {
  const find = (kind: string) => list.find((a) => a.kind === kind && (!runId || a.runId === runId)) ?? null;
  return { musicSha: find('final_video_music')?.blobSha ?? null, tiktokSha: find('final_video_tiktok')?.blobSha ?? null, coverSha: find('final_cover')?.blobSha ?? null, qcId: find('qc_report')?.id ?? null };
}

export type PlayerTab = 'final' | 'mp4' | 'live';
/** Final first when it exists (spec §13.1); the draft tabs stay (C26: the live draft only mounts when opened). */
export function playerTabs(o: { final: boolean; draft: boolean }): { tabs: [PlayerTab, string][]; initial: PlayerTab } {
  const tabs: [PlayerTab, string][] = [...(o.final ? [['final', 'Final'] as [PlayerTab, string]] : []), ...(o.draft ? [['mp4', 'Taslak MP4'], ['live', 'Taslak']] as [PlayerTab, string][] : [])];
  return { tabs, initial: o.final ? 'final' : 'mp4' };
}

/** The QC card's lines: gate marks, the D6/D7 scores, every failed check (value, limit, time). */
export function qcLines(r: QcReport): { gates: string; scores: string; failures: string[] } {
  const mark = (b: boolean) => (b ? '✓' : '✗');
  const failures = [...r.music, ...r.tiktok.filter((c) => !r.music.some((m) => m.id === c.id))]
    .filter((c) => !c.pass)
    .map((c) => `${QC_CHECKS[c.id].label_tr}: ${c.value} (${c.limit})${c.at !== undefined ? ` · ${formatClock(c.at)}` : ''}`);
  return {
    gates: `${GATES.G1.label_tr} ${mark(r.gates.G1)} · ${GATES.G5.label_tr} ${mark(r.gates.G5)} · ${GATES.G6.label_tr} ${mark(r.gates.G6)}`,
    scores: `${DIMENSIONS.D6.label_tr} ${r.scores.D6}/12 · ${DIMENSIONS.D7.label_tr} ${r.scores.D7}/5`,
    failures,
  };
}
