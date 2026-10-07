import type { AudioMode } from './artifacts.ts';

/** Spec §7.1, in order. */
export const STEP_KEYS = ['research', 'storyboard', 'voice', 'build', 'draft_render', 'draft_review', 'final_render', 'compose', 'qc', 'review', 'finalize'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export const STEP_WEIGHTS: Record<StepKey, number> = {
  research: 8, storyboard: 7, voice: 5, build: 18, draft_render: 4, draft_review: 5, final_render: 26, compose: 10, qc: 2, review: 12, finalize: 3,
};
export const STEP_LABELS: Record<StepKey, string> = {
  research: 'Araştırma', storyboard: 'Storyboard', voice: 'Seslendirme', build: 'Sahne kurulumu', draft_render: 'Taslak render',
  draft_review: 'Taslak incelemesi', final_render: 'Final render', compose: 'Birleştirme', qc: 'Otomatik kontrol', review: 'İnceleme', finalize: 'Sonlandırma',
};
/** Spec §7.1 duration midpoints (s), used until a step has history. */
export const STEP_DEFAULT_S: Record<StepKey, number> = {
  research: 300, storyboard: 180, voice: 270, build: 1500, draft_render: 60, draft_review: 180, final_render: 1380, compose: 300, qc: 5, review: 300, finalize: 30,
};
/** Steps with an executor in this build. M4a: research → storyboard; M4b: + build; M4c: + draft_render, draft_review; M5a: + final_render, compose, qc; M5b: + review, finalize. */
export const IMPLEMENTED_STEPS: readonly StepKey[] = ['research', 'storyboard', 'voice', 'build', 'draft_render', 'draft_review', 'final_render', 'compose', 'qc', 'review', 'finalize'];

/** "0:45", "1:02": a video length for cards and notes. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type VideoStatus = 'queued' | 'running' | 'ready' | 'needs_human' | 'failed' | 'cancelled' | 'published';
export type RunStatus = 'queued' | 'running' | 'done' | 'needs_human' | 'failed' | 'cancelled';
export type RunKind = 'produce' | 'fix' | 'chat_edit' | 'rerender';
export type StepStatus = 'pending' | 'queued' | 'running' | 'waiting_gpu' | 'waiting_limit' | 'waiting_disk' | 'done' | 'failed' | 'skipped' | 'cancelled';
export type ProgressSource = 'render' | 'agent' | 'time' | 'deterministic';
export type Resource = 'gpu' | 'heavy_cpu' | 'claude';

export interface PlanStep { key: StepKey; weight: number }
/** Usage window marks taken at run start and end (fractions 0..1, spec §18). */
export interface UsageMark { fiveHour: number | null; fiveHourResetsAt: string | null; sevenDay: number | null }

export interface StepView {
  id: string;
  runId: string;
  key: StepKey;
  ordinal: number;
  weight: number;
  status: StepStatus;
  /** 0..100 */
  progress: number;
  progressSource: ProgressSource | null;
  attempt: number;
  /** Draft review round (0 = first pass; each return to build adds 1 to the steps it reruns). */
  round: number;
  /** Final review fix round (plan F3): 0 = first pass; each final-loop rewind adds 1 to the steps it reruns. Independent of `round`. */
  fixRound: number;
  sessionId: string | null;
  error: string | null;
  note: string | null;
  startedAt: string | null;
  endedAt: string | null;
}
export interface RunView {
  id: string;
  videoId: string;
  kind: RunKind;
  status: RunStatus;
  /** 0..100, monotone; 100 only when the video is ready (spec §12.1). */
  progress: number;
  etaS: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  steps: StepView[];
}
export interface VideoUsage { sessions: number; tokens: number; costUsd: number | null; fiveHourDelta: number | null }
/** The latest draft of a video (library cover and length, spec §13.1). */
export interface VideoDraft { videoSha: string; coverSha: string | null; durationS: number }
/** The newest final of a video (spec §13.1 library, plan E18): the music variant with the TikTok variant and cover of the same compose. */
export interface VideoFinal { musicSha: string; tiktokSha: string | null; coverSha: string | null; durationS: number }
export interface VideoView {
  id: string;
  productId: string;
  productName: string;
  title: string;
  audioMode: AudioMode;
  status: VideoStatus;
  statusNote: string | null;
  difficulty: string | null;
  latestRunId: string | null;
  createdAt: string;
  updatedAt: string;
  usage: VideoUsage;
  draft: VideoDraft | null;
  final: VideoFinal | null;
  /** The panel total of the best version's final review (newest round while there is no best version); null before a scored review. */
  score: number | null;
}
/** `meta` is only listed for `final_review_sheet` (the Studio tells the main contact sheet from the hook sheet by it). */
export interface ArtifactMeta { id: string; runId: string; stepId: string | null; versionId: string | null; kind: string; blobSha: string | null; createdAt: string; meta?: Record<string, unknown> | null }

export interface FindingRecord {
  id: string; checkId: string; severity: string; dimension: string | null; gate: string | null; evidence: unknown; fixHint: string | null;
  status: string; fixedInVersionId: string | null;
}
/** One reviewer's (or the orchestrator's) row of a final review round with its findings (GET /api/videos/:id/reviews). */
export interface ReviewRecord {
  id: string; videoId: string; versionId: string | null; runId: string; stepId: string | null; round: number; reviewerRole: string; seq: number; sessionId: string | null;
  rubricVersion: string; total: number | null; dimensionScores: unknown; gates: unknown; verdict: string | null; summaryTr: string | null; createdAt: string;
  findings: FindingRecord[];
}

export const VIDEO_STATUS_LABEL: Record<VideoStatus, string> = {
  queued: 'sırada', running: 'üretiliyor', ready: 'yayına hazır', needs_human: 'insan gerekli', failed: 'başarısız', cancelled: 'durduruldu', published: 'yayında',
};
export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: 'bekliyor', queued: 'sırada', running: 'çalışıyor', waiting_gpu: 'GPU bekliyor', waiting_limit: 'limit bekleniyor', waiting_disk: 'disk bekleniyor',
  done: 'tamamlandı', failed: 'başarısız', skipped: 'atlandı', cancelled: 'durduruldu',
};

export function normalizeProductName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
}

/** Spec §7.1: the produce plan. Skipped steps (voice in silent mode) leave the plan; weights rescale to 100 (2 decimals). */
export function producePlan(audioMode: AudioMode, implemented: readonly StepKey[] = IMPLEMENTED_STEPS): PlanStep[] {
  const keys = STEP_KEYS.filter((k) => implemented.includes(k) && !(k === 'voice' && audioMode === 'silent'));
  const total = keys.reduce((s, k) => s + STEP_WEIGHTS[k], 0);
  return keys.map((k) => ({ key: k, weight: Math.round((STEP_WEIGHTS[k] / total) * 10_000) / 100 }));
}
