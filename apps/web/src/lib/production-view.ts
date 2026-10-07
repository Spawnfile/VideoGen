import {
  CHANNEL_STYLES, DIMENSION_FLOOR, DIMENSION_IDS, DIMENSIONS, DRAFT_MAX_RETURNS, draftRound, FINAL_CHECKS, FINAL_MAX_ROUNDS, finalRound, formatClock, GATE_IDS, GATES, QC_CHECKS,
  type ArtifactMeta, type BuildReport, type DimensionId, type FinalCheckId, type FinalReviewerRole, type GateId, type ProgressSource, type QcReport, type ReviewRecord,
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

/** Header line while a final fix round runs: "Düzeltme turu 1/3 · %50" (plan F3); empty otherwise. */
export function finalRoundLabel(run: RunView | null | undefined): string {
  if (!isRunActive(run)) return '';
  const f = finalRound(run!.steps);
  return f ? `Düzeltme turu ${f.round}/${FINAL_MAX_ROUNDS} · %${f.percent}` : '';
}
/** The header shows the final fix round first, the draft round otherwise. */
export const roundLabel = (run: RunView | null | undefined): string => finalRoundLabel(run) || draftRoundLabel(run);

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

const REVIEWER_LABEL: Record<FinalReviewerRole, string> = { reviewer_visual: 'Görsel', reviewer_facts: 'Doğruluk', reviewer_retention: 'İzlenme' };
const SEVERITY_ORDER = ['blocker', 'major', 'minor'];
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface PanelFinding { id: string; check: string; label: string; severity: string; timecode?: number; hint?: string; status: string }
export interface PanelView {
  round: number;
  runId: string;
  /** How many earlier rounds there are (no round picker in v1). */
  earlier: number;
  total: number | null;
  verdict: string | null;
  dimensions: { id: DimensionId; label: string; score: number | null; weight: number; low: boolean }[];
  gates: { id: GateId; label: string; pass: boolean | null }[];
  /** The orchestrator's own row: failed qc checks and the deterministic G2 failure (no reviewer card). */
  auto: { summary: string; findings: PanelFinding[] } | null;
  /** `merged`: a second, independent visual review was averaged into this card (plan F7); its own row is not a card. */
  reviewers: { role: FinalReviewerRole; label: string; seq: number; summary: string; merged: boolean; findings: PanelFinding[] }[];
}

const severityRank = (s: string) => { const i = SEVERITY_ORDER.indexOf(s); return i < 0 ? SEVERITY_ORDER.length : i; };

function toFinding(f: ReviewRecord['findings'][number]): PanelFinding {
  const ev = f.evidence as { timecode?: unknown; value?: unknown; limit?: unknown; at?: unknown } | null;
  const def = FINAL_CHECKS[f.checkId as FinalCheckId] as (typeof FINAL_CHECKS)[FinalCheckId] | undefined;
  const qc = (QC_CHECKS as Record<string, { label_tr: string } | undefined>)[f.checkId];
  const time = typeof ev?.timecode === 'number' ? ev.timecode : typeof ev?.at === 'number' ? ev.at : undefined;
  const measured = ev && ev.value !== undefined && ev.limit !== undefined ? `${String(ev.value)} / ${String(ev.limit)}` : null;
  const hint = f.fixHint ?? measured;
  return { id: f.id, check: f.checkId, label: def?.label_tr ?? qc?.label_tr ?? f.checkId, severity: f.severity, ...(time !== undefined ? { timecode: time } : {}), ...(hint ? { hint } : {}), status: f.status };
}

/**
 * The newest final review round as the Studio draws it (plan T10): K13 bars and gates from the orchestrator's row, one card per reviewer.
 * The run is chosen first (the given one, else the run of the newest row), then its newest round.
 */
export function panelView(all: ReviewRecord[], runId?: string | null): PanelView | null {
  const reviews = all.filter((r) => r.runId === (runId ?? all.reduce((n, r) => (r.createdAt >= n.createdAt ? r : n), all[0]!).runId));
  if (!reviews.length) return null;
  const round = Math.max(...reviews.map((r) => r.round));
  const rows = reviews.filter((r) => r.round === round);
  const orch = rows.find((r) => r.reviewerRole === 'orchestrator');
  const dims = (orch?.dimensionScores ?? {}) as Partial<Record<DimensionId, number | null>>;
  const gates = (orch?.gates ?? {}) as Partial<Record<GateId, boolean | null>>;
  const reviewers = (Object.keys(REVIEWER_LABEL) as FinalReviewerRole[]).flatMap((role) => {
    const first = rows.find((r) => r.reviewerRole === role && r.seq === 1);
    if (!first) return [];
    const findings = first.findings.map(toFinding).sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
    return [{ role, label: REVIEWER_LABEL[role], seq: first.seq, summary: first.summaryTr ?? '', merged: role === 'reviewer_visual' && rows.some((r) => r.reviewerRole === role && r.seq === 2), findings }];
  });
  const autoFindings = orch ? orch.findings.map(toFinding).sort((a, b) => severityRank(a.severity) - severityRank(b.severity)) : [];
  return {
    round, runId: rows[0]!.runId, earlier: new Set(reviews.filter((r) => r.round < round).map((r) => r.round)).size, total: orch?.total ?? null, verdict: orch?.verdict ?? null,
    dimensions: DIMENSION_IDS.map((id) => {
      const score = dims[id] ?? null;
      return { id, label: DIMENSIONS[id].label_tr, score, weight: DIMENSIONS[id].weight, low: score !== null && score < r2(DIMENSIONS[id].weight * DIMENSION_FLOOR) };
    }),
    gates: GATE_IDS.map((id) => ({ id, label: GATES[id].label_tr, pass: gates[id] ?? null })),
    auto: autoFindings.length ? { summary: orch!.summaryTr ?? '', findings: autoFindings } : null,
    reviewers,
  };
}

/** The badge next to the panel score: green only when ready; everything else stays neutral. */
export function reviewBadge(verdict: string | null, status: VideoStatus): { text: string; ok: boolean } {
  if (status === 'ready' || status === 'published' || ((status === 'running' || status === 'queued') && verdict === 'ready')) return { text: 'yayına hazır', ok: true };
  if (status === 'needs_human') return { text: 'insan gerekli', ok: false };
  if (status === 'failed') return { text: 'başarısız', ok: false };
  if (status === 'cancelled') return { text: 'durduruldu', ok: false };
  return { text: 'düzeltiliyor', ok: false };
}

/** The newest run's contact sheet of the reviewed round (`final_review_sheet`, meta.kind 'main'); the list is newest first. */
export function pickReviewSheet(list: ArtifactMeta[], runId: string | null, round: number): string | null {
  const a = list.find((x) => x.kind === 'final_review_sheet' && (!runId || x.runId === runId) && x.meta?.kind === 'main' && x.meta?.fixRound === round);
  return a?.blobSha ?? null;
}
