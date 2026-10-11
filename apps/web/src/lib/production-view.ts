import {
  CHANNEL_STYLES, DIMENSION_FLOOR, DIMENSION_IDS, DIMENSIONS, DRAFT_MAX_RETURNS, draftRound, FINAL_CHECKS, FINAL_MAX_ROUNDS, finalRound, formatClock, GATE_IDS, GATES, QC_CHECKS,
  type ArtifactMeta, type BuildReport, type DimensionId, type FinalCheckId, type FinalReviewerRole, type GateId, type ProgressSource, type QcReport, type ReviewRecord,
  type RunView, type SceneSpec, type StepView, type VideoStatus, type VideoUsage, type VideoView, type VoiceTrack,
} from '@videogen/shared/browser';
import type { NarratorVoiceState } from './api.ts';
import { DIMENSION_EN, FINAL_CHECK_EN, GATE_EN, QC_CHECK_EN, REVIEWER_EN, STYLE_EN } from './i18n.ts';
import { int, time } from './locale.ts';
import { formatElapsed, formatTokens } from './trace-view.ts';

const ACTIVE = new Set(['queued', 'running', 'waiting_gpu', 'waiting_limit', 'waiting_disk']);

export function formatEta(s: number | null): string {
  if (s === null) return '';
  if (s < 60) return 'a few seconds left';
  const m = Math.round(s / 60);
  return m < 60 ? `about ${m} min left` : `about ${Math.floor(m / 60)} h ${m % 60} min left`;
}

export function sourceLabel(src: ProgressSource | null): string {
  return src === 'agent' ? 'agent report' : src === 'time' ? 'estimate' : src === 'render' ? 'rendered frames' : '';
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

/** `none`: nothing selected on purpose ("Yeni sohbet" clears the Studio); otherwise the wanted video, else the newest. */
export const NO_VIDEO = 'none';
export function pickVideoId(param: string | null, videos: Pick<VideoView, 'id'>[]): string | null {
  if (param === NO_VIDEO) return null;
  if (param && videos.some((v) => v.id === param)) return param;
  return videos[0]?.id ?? null;
}

export function formatUsage(u: VideoUsage): string {
  const parts = [u.tokens ? `${formatTokens(u.tokens)} tokens` : '', u.fiveHourDelta !== null ? `5 h ${Math.round(u.fiveHourDelta * 100)}%` : ''];
  return parts.filter(Boolean).join(' · ');
}

export function formatDay(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const at = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === new Date(now).toDateString()) return `today ${at}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${at}`;
}

/** Build card summary: parts, triangles, hero size at frame 0, channel style; up to five warnings. */
export function buildFacts(report: BuildReport, scene?: SceneSpec): { line: string; warnings: string[] } {
  const line = [
    `${report.parts.length} parts`,
    `${int(report.triangles)} triangles`,
    `hero ${Math.round(report.hero_ratio * 100)}%`,
    scene && CHANNEL_STYLES[scene.style_id] ? STYLE_EN[scene.style_id].name : '',
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
  return d ? `Draft round ${d.round}/${DRAFT_MAX_RETURNS} · ${d.percent}%` : '';
}

/** Header line while a final fix round runs: "Düzeltme turu 1/3 · %50" (plan F3); empty otherwise. */
export function finalRoundLabel(run: RunView | null | undefined): string {
  if (!isRunActive(run)) return '';
  const f = finalRound(run!.steps);
  return f ? `Fix round ${f.round}/${FINAL_MAX_ROUNDS} · ${f.percent}%` : '';
}
/** The header shows the final fix round first, the draft round otherwise. */
export const roundLabel = (run: RunView | null | undefined): string => finalRoundLabel(run) || draftRoundLabel(run);

/** The latest final artifacts of a run (spec §13.1 Final tab, plan E18). */
export interface FinalPick { musicSha: string | null; tiktokSha: string | null; coverSha: string | null; qcId: string | null }
export function pickFinal(list: ArtifactMeta[], runId: string | null): FinalPick {
  const find = (kind: string) => list.find((a) => a.kind === kind && (!runId || a.runId === runId)) ?? null;
  return { musicSha: find('final_video_music')?.blobSha ?? null, tiktokSha: find('final_video_tiktok')?.blobSha ?? null, coverSha: find('final_cover')?.blobSha ?? null, qcId: find('qc_report')?.id ?? null };
}

export type PlayerTab = 'final' | 'compare' | 'mp4' | 'live';
/**
 * Final first when it exists (spec §13.1); the draft tabs stay (C26: the live draft only mounts when opened). Plan M7 Y7: "Karşılaştır"
 * after the final, only when the video has two or more versions with a final.
 */
export function playerTabs(o: { final: boolean; draft: boolean; compare?: boolean }): { tabs: [PlayerTab, string][]; initial: PlayerTab } {
  const tabs: [PlayerTab, string][] = [
    ...(o.final ? [['final', 'Final'] as [PlayerTab, string]] : []),
    ...(o.final && o.compare ? [['compare', 'Compare'] as [PlayerTab, string]] : []),
    ...(o.draft ? [['mp4', 'Draft MP4'], ['live', 'Live draft']] as [PlayerTab, string][] : []),
  ];
  return { tabs, initial: o.final ? 'final' : 'mp4' };
}

/** The QC card's lines: gate marks, the D6/D7 scores, every failed check (value, limit, time). */
const qcMax = (d: 'D6' | 'D7') => Object.values(QC_CHECKS).filter((c) => c.dimension === d).reduce((a, c) => a + c.points, 0);

export function qcLines(r: QcReport): { gates: string; scores: string; failures: string[] } {
  const mark = (b: boolean) => (b ? '✓' : '✗');
  const failures = [...r.music, ...r.tiktok.filter((c) => !r.music.some((m) => m.id === c.id))]
    .filter((c) => !c.pass)
    .map((c) => `${QC_CHECK_EN[c.id] ?? c.id}: ${c.value} (${c.limit})${c.at !== undefined ? ` · ${formatClock(c.at)}` : ''}`);
  return {
    gates: `${GATE_EN.G1} ${mark(r.gates.G1)} · ${GATE_EN.G5} ${mark(r.gates.G5)} · ${GATE_EN.G6} ${mark(r.gates.G6)}`,
    // final@2: qc's own share of D6 (the audio reviewer holds the rest of the 12), so the card never reads as a low score.
    scores: `${DIMENSION_EN.D6} (measured) ${r.scores.D6}/${qcMax('D6')} · ${DIMENSION_EN.D7} ${r.scores.D7}/${qcMax('D7')}`,
    failures,
  };
}

const REVIEWER_LABEL = REVIEWER_EN as Record<FinalReviewerRole, string>;
const SEVERITY_ORDER = ['blocker', 'major', 'minor'];
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface PanelFinding { id: string; check: string; label: string; severity: string; timecode?: number; hint?: string; status: string }
export interface PanelView {
  round: number;
  runId: string;
  /** How many earlier rounds there are. */
  earlier: number;
  /** Plan M7 Y7: every round of the run, ascending (the round chips). */
  rounds: number[];
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
  const qc = (QC_CHECK_EN as Record<string, string | undefined>)[f.checkId];
  const gate = f.checkId === 'G4' ? 'AI disclosure (G4)' : undefined; // GATES.G4 reads just "Beyan"; the finding needs the AI-declaration context // the orchestrator's rule finding (voice/AI-label declaration)
  const time = typeof ev?.timecode === 'number' ? ev.timecode : typeof ev?.at === 'number' ? ev.at : undefined;
  const measured = ev && ev.value !== undefined && ev.limit !== undefined ? `${String(ev.value)} / ${String(ev.limit)}` : null;
  const hint = f.fixHint ?? measured;
  return { id: f.id, check: f.checkId, label: (def ? FINAL_CHECK_EN[f.checkId as FinalCheckId] : undefined) ?? qc ?? gate ?? f.checkId, severity: f.severity, ...(time !== undefined ? { timecode: time } : {}), ...(hint ? { hint } : {}), status: f.status };
}

/**
 * A final review round as the Studio draws it (plan T10): K13 bars and gates from the orchestrator's row, one card per reviewer.
 * The run is chosen first (the given one, else the run of the newest row), then the given round (plan M7 Y7 round picker), else its newest.
 */
export function panelView(all: ReviewRecord[], runId?: string | null, pick?: number | null): PanelView | null {
  const reviews = all.filter((r) => r.runId === (runId ?? all.reduce((n, r) => (r.createdAt >= n.createdAt ? r : n), all[0]!).runId));
  if (!reviews.length) return null;
  const rounds = [...new Set(reviews.map((r) => r.round))].sort((a, b) => a - b);
  const round = pick ?? rounds.at(-1)!;
  const rows = reviews.filter((r) => r.round === round);
  if (!rows.length) return null;
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
    round, runId: rows[0]!.runId, earlier: rounds.filter((r) => r < round).length, rounds, total: orch?.total ?? null, verdict: orch?.verdict ?? null,
    dimensions: DIMENSION_IDS.map((id) => {
      const score = dims[id] ?? null;
      return { id, label: DIMENSION_EN[id], score, weight: DIMENSIONS[id].weight, low: score !== null && score < r2(DIMENSIONS[id].weight * DIMENSION_FLOOR) };
    }),
    gates: GATE_IDS.map((id) => ({ id, label: GATE_EN[id], pass: gates[id] ?? null })),
    auto: autoFindings.length ? { summary: orch!.summaryTr ?? '', findings: autoFindings } : null,
    reviewers,
  };
}

/** The badge next to the panel score: green only when ready; everything else stays neutral. */
export function reviewBadge(verdict: string | null, status: VideoStatus): { text: string; ok: boolean } {
  if (status === 'ready' || status === 'published' || ((status === 'running' || status === 'queued') && verdict === 'ready')) return { text: 'ready to publish', ok: true };
  if (status === 'needs_human') return { text: 'needs you', ok: false };
  if (status === 'failed') return { text: 'failed', ok: false };
  if (status === 'cancelled') return { text: 'stopped', ok: false };
  return { text: 'fixing', ok: false };
}

/** The newest run's contact sheet of the reviewed round (`final_review_sheet`, meta.kind 'main'); the list is newest first. */
export function pickReviewSheet(list: ArtifactMeta[], runId: string | null, round: number): string | null {
  const a = list.find((x) => x.kind === 'final_review_sheet' && (!runId || x.runId === runId) && x.meta?.kind === 'main' && x.meta?.fixRound === round);
  return a?.blobSha ?? null;
}

/** The newest voice_track of the run and the stem it names (meta.stemSha); no stem when none matches. */
export function pickVoice(list: ArtifactMeta[], runId: string | null): { voiceTrack: string | null; voiceStem: string | null } {
  const track = list.find((a) => a.kind === 'voice_track' && (!runId || a.runId === runId)) ?? null;
  const want = (track?.meta as { stemSha?: unknown } | undefined)?.stemSha;
  const stem = typeof want === 'string' ? list.find((a) => a.kind === 'voice_stem' && a.blobSha === want) : undefined;
  return { voiceTrack: track?.id ?? null, voiceStem: stem?.blobSha ?? null };
}

/** Produce bar hint of the VO mode (K17: the narrator voice is chosen in Settings). */
export const PRODUCE_VO_HINT = 'Narration uses local TTS; pick the voice in Settings';

const ENGINE_NAME: Record<string, string> = { chatterbox: 'Chatterbox', freya: 'Freya' };
const dec = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '–');
/** Spec §8.1: a line whose ASR round trip misses more than 3 % of the characters is flagged. */
const CER_WARN = 0.03;

export interface VoiceViewModel {
  title: string; provisional: boolean; lines: number; duration: string; worstCer: string; firstWord: string; pace: string; aigc: boolean;
  rows: { beat: string; text: string; cer: string; warn: boolean }[];
}
/** The Seslendirme card (plan T10): engine and voice, the provisional K17 mark, the facts of the track and one row per line; null without a track. */
export function voiceView(track: VoiceTrack | null, o: { chosen: boolean }): VoiceViewModel | null {
  // An invalid stored payload draws no card rather than throwing in render.
  if (!track || !track.provider || !track.facts || !Array.isArray(track.lines)) return null;
  const { engine, voice } = track.provider;
  const who = voice.kind === 'clone' ? 'cloned voice' : voice.id === 'hazir' ? 'stock voice' : voice.id === 'leyla' ? 'Leyla' : voice.id;
  return {
    title: `Voiceover · ${ENGINE_NAME[engine] ?? engine} · ${who}`,
    provisional: !o.chosen,
    lines: track.lines.length,
    duration: `${dec(track.duration_ms / 1000)} s`,
    worstCer: `${dec(track.facts.max_cer * 100)}%`,
    firstWord: `${dec(track.facts.first_word_s)} s`,
    pace: `${dec(track.facts.syllables_per_s)} syllables/s`,
    aigc: voice.kind === 'clone',
    rows: track.lines.map((l) => ({ beat: l.beat_id, text: l.text_tr, cer: `${dec(l.cer * 100)}%`, warn: l.cer > CER_WARN })),
  };
}

export interface NarratorItem { key: string; label: string; value: NarratorVoiceState['voice']; selected: boolean; provisional: boolean }
/** Settings → Anlatıcı sesi: the flat option list; the selected one is marked provisional until the user chooses. */
export function narratorOptions(s: NarratorVoiceState): { items: NarratorItem[]; hasClone: boolean; note: string } {
  const items = s.options.flatMap((g) => g.voices.map((v): NarratorItem => {
    const value = (v.kind === 'clone' ? { engine: g.engine, voice: { kind: 'clone', asset_id: v.asset_id! } } : { engine: g.engine, voice: { kind: 'preset', id: v.id! } }) as NarratorVoiceState['voice'];
    const selected = s.voice.engine === g.engine && s.voice.voice.kind === v.kind && (v.kind === 'clone' ? (s.voice.voice as { asset_id: string }).asset_id === v.asset_id : (s.voice.voice as { id: string }).id === v.id);
    return {
      key: `${g.engine}:${v.kind}:${v.asset_id ?? v.id}`, value, selected, provisional: selected && !s.chosen,
      label: `${ENGINE_NAME[g.engine] ?? g.engine} · ${v.kind === 'clone' ? `clone: ${v.label_tr}` : v.label_tr}`,
    };
  }));
  return { items, hasClone: items.some((i) => i.value.voice.kind === 'clone'), note: s.chosen ? '' : 'Not chosen yet: provisional default' };
}

/** Agent music design A5: the run's newest stems (a compose or remix records all of them together) and the composer's score. */
export interface StemPick { music: string | null; voice: string | null; sfx: string | null; scoreId: string | null }
export function pickStems(list: ArtifactMeta[], runId: string | null, o: { fallback?: boolean } = {}): StemPick {
  // `fallback` (an audio edit still running): the video's newest stems until the edit records its own.
  const inRun = (kind: string) => list.find((a) => a.kind === kind && (!runId || a.runId === runId)) ?? null;
  const own = !runId || list.some((a) => a.runId === runId && (a.kind === 'stem_music' || a.kind === 'stem_sfx'));
  const newest = (kind: string) => (o.fallback && !own ? list.find((a) => a.kind === kind) ?? null : inRun(kind));
  return { music: newest('stem_music')?.blobSha ?? null, voice: newest('stem_voice')?.blobSha ?? null, sfx: newest('stem_sfx')?.blobSha ?? null, scoreId: newest('music')?.id ?? null };
}

/** "tukenmez-kalem-music.flac": a plain ASCII name the media endpoint accepts for ?download=. */
export function stemFileName(productName: string, part: 'music' | 'voice' | 'effects'): string {
  const slug = productName.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';
  return `${slug}-${part}.flac`;
}
