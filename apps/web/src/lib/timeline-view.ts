import { STEP_DEFAULT_S, formatClock, type RunView, type StepKey, type StepView } from '@videogen/shared/browser';
import { STEP_EN, STEP_STATUS_EN } from './i18n.ts';

/**
 * The Studio timeline (spec 2026-10-11-ember-ui E11): a run's steps laid end to end on one time axis, in three lanes. Widths come from
 * real timings where they exist and STEP_DEFAULT_S where they do not; every block but a skipped one gets at least 4 % so it stays
 * tappable. Blocks are keyed by StepView.id because a review loop runs the same step key again.
 *
 * The playhead: 100 for a run that reached its end (done, needs_human), the end of the last started step for a stopped or failed one.
 * now.kind: running → live, queued → queued, done → done, cancelled → stopped, failed → failed, needs_human → done (the amber cue comes
 * from the header and the needs-you strip; the timeline only shows time).
 */

export type LaneId = 'V' | 'A' | 'QC';
export const LANE_OF: Record<StepKey, LaneId> = {
  research: 'V', storyboard: 'V', build: 'V', draft_render: 'V', final_render: 'V', compose: 'V', finalize: 'V',
  voice: 'A', music: 'A', remix: 'A',
  draft_review: 'QC', qc: 'QC', review: 'QC',
};
const LANES: LaneId[] = ['V', 'A', 'QC'];
const MIN_PCT = 4;

export type BlockTone = 'done' | 'live' | 'pending' | 'waiting' | 'failed' | 'stopped' | 'skipped';
export interface TimelineBlock { id: string; key: StepKey; label: string; lane: LaneId; startPct: number; widthPct: number; tone: BlockTone; started: boolean; title: string }
export interface TimelineView {
  totalS: number;
  playheadPct: number;
  ticks: { pct: number; label: string }[];
  lanes: { id: LaneId; blocks: TimelineBlock[] }[];
  now: { kind: 'live' | 'done' | 'stopped' | 'failed' | 'queued'; clock: string; note: string | null };
}

const secs = (from: string, toMs: number) => Math.max(0, (toMs - Date.parse(from)) / 1000);

function toneOf(s: StepView): BlockTone {
  if (s.status === 'done') return 'done';
  if (s.status === 'running') return 'live';
  if (s.status.startsWith('waiting')) return 'waiting';
  if (s.status === 'failed') return 'failed';
  if (s.status === 'cancelled') return 'stopped';
  if (s.status === 'skipped') return 'skipped';
  return 'pending';
}

function durationOf(s: StepView, run: RunView, nowMs: number): number {
  const def = STEP_DEFAULT_S[s.key];
  if (s.status === 'skipped') return 0;
  if (!s.startedAt) return def;
  if (s.status === 'done') return s.endedAt ? secs(s.startedAt, Date.parse(s.endedAt)) : def;
  if (s.status === 'failed' || s.status === 'cancelled') return secs(s.startedAt, Date.parse(s.endedAt ?? run.endedAt ?? new Date(nowMs).toISOString()));
  return Math.max(secs(s.startedAt, nowMs), def); // running or waiting
}

function clock(s: number): string {
  const t = Math.max(0, Math.round(s));
  if (t < 3600) return formatClock(t);
  return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const NOW_KIND: Record<RunView['status'], TimelineView['now']['kind']> = {
  running: 'live', queued: 'queued', done: 'done', cancelled: 'stopped', failed: 'failed', needs_human: 'done',
};

export function timelineView(run: RunView, nowMs: number): TimelineView {
  const steps = run.steps.map((s, i) => ({ s, i })).sort((a, b) => a.s.ordinal - b.s.ordinal || a.i - b.i).map((x) => x.s);
  const raw = steps.map((s) => durationOf(s, run, nowMs));
  const totalS = raw.reduce((a, b) => a + b, 0);
  const floor = (MIN_PCT / 100) * totalS;
  const stretched = steps.map((s, i) => (s.status === 'skipped' ? 0 : Math.max(raw[i], floor)));
  const scale = stretched.reduce((a, b) => a + b, 0);
  const pctOf = (x: number) => (scale > 0 ? (x / scale) * 100 : 0);

  let cursor = 0;
  const blocks: TimelineBlock[] = steps.map((s, i) => {
    const tone = toneOf(s);
    const startPct = pctOf(cursor);
    cursor += stretched[i];
    const rounds = [s.round ? `round ${s.round}` : '', s.fixRound ? `fix ${s.fixRound}` : ''].filter(Boolean);
    const label = STEP_EN[s.key] ?? s.key;
    const title = [label, STEP_STATUS_EN[s.status], raw[i] > 0 && s.startedAt ? clock(raw[i]) : '', ...rounds].filter(Boolean).join(' · ');
    return { id: s.id, key: s.key, label, lane: LANE_OF[s.key], startPct, widthPct: pctOf(stretched[i]), tone, started: !!s.startedAt, title };
  });

  const finished = run.status !== 'running' && run.status !== 'queued';
  const endOfStarted = () => {
    const last = blocks.map((b, i) => (b.started ? i : -1)).filter((i) => i >= 0).pop();
    return last === undefined ? 0 : blocks[last].startPct + blocks[last].widthPct;
  };
  let playheadPct = 0;
  // A run that went to the end sits at 100; a stopped or failed one stays where the work stopped.
  if (run.status === 'done' || run.status === 'needs_human') playheadPct = 100;
  else if (finished) playheadPct = endOfStarted();
  else {
    const li = steps.findIndex((s) => s.status === 'running' || s.status.startsWith('waiting'));
    if (li >= 0) {
      const s = steps[li];
      const frac = s.startedAt && stretched[li] > 0 ? Math.min(1, secs(s.startedAt, nowMs) / Math.max(raw[li], 1)) : 0;
      playheadPct = blocks[li].startPct + frac * blocks[li].widthPct;
    } else playheadPct = endOfStarted();
  }

  const live = steps.find((s) => s.status === 'running' || s.status.startsWith('waiting'));
  const lastStarted = [...steps].reverse().find((s) => s.startedAt);
  const note = live?.note ?? lastStarted?.note ?? lastStarted?.error ?? null;
  const kind = NOW_KIND[run.status];
  const elapsed = run.startedAt ? secs(run.startedAt, finished && run.endedAt ? Date.parse(run.endedAt) : nowMs) : 0;

  return {
    totalS,
    playheadPct,
    ticks: [0, 25, 50, 75, 100].map((pct) => ({ pct, label: clock((totalS * pct) / 100) })),
    lanes: LANES.map((id) => ({ id, blocks: blocks.filter((b) => b.lane === id) })),
    now: { kind, clock: clock(elapsed), note },
  };
}
