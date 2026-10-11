import { DEFAULT_DURATION, DURATION_HARD, parseBriefDuration, recommendedWindow, type AudioMode, type DurationWindow } from '@videogen/shared/browser';
import { windowLabel as formatWindow } from './i18n.ts';

/**
 * Studio's duration field (brief design Y1–Y3). `auto`: nothing decided, the agent recommends, else the default.
 * `manual` with `origin` 'brief' (read from the brief) or 'user' (typed or switched by hand); a user edit is never overwritten by the brief.
 */
export interface DurationState { mode: 'auto' | 'manual'; minS: number; maxS: number; origin: 'default' | 'brief' | 'user' }

export const initialDurationState = (): DurationState => ({ mode: 'auto', ...DEFAULT_DURATION, origin: 'default' });

export function onBriefChange(s: DurationState, brief: string): DurationState {
  if (s.origin === 'user') return s;
  const w = parseBriefDuration(brief);
  if (w) return { mode: 'manual', ...w, origin: 'brief' };
  return s.origin === 'brief' ? initialDurationState() : s;
}

/** A typed value, kept as typed (intermediate keystrokes must not move the other bound); producePayload validates the window on submit. */
export function onDurationEdit(s: DurationState, patch: { minS?: number; maxS?: number }): DurationState {
  return { mode: 'manual', minS: patch.minS ?? s.minS, maxS: patch.maxS ?? s.maxS, origin: 'user' };
}

export function onDurationMode(s: DurationState, mode: 'auto' | 'manual'): DurationState {
  if (mode === 'auto') return initialDurationState();
  return s.mode === 'manual' ? s : { mode: 'manual', minS: s.minS, maxS: s.maxS, origin: 'user' };
}

export function durationBadge(s: DurationState): string {
  if (s.mode === 'auto') return `Auto · the agent suggests, else the default ${formatWindow(DEFAULT_DURATION)}`;
  return `${formatWindow(s)} · ${s.origin === 'brief' ? 'from the brief' : 'your choice'}`;
}

/** Shared production.ts MIN_WIDTH_S (not exported). */
const MIN_WIDTH_S = 2;

/** The same rule as shared `durationWindowErrors` (hard bounds, at least a 2 s wide window), in English. */
export function windowError(w: DurationWindow): string | null {
  if (!Number.isFinite(w.minS) || !Number.isFinite(w.maxS)) return 'The length must be a number.';
  if (w.minS < DURATION_HARD.minS) return `The length can be at least ${DURATION_HARD.minS} s.`;
  if (w.maxS > DURATION_HARD.maxS) return `The length can be at most ${DURATION_HARD.maxS} s.`;
  if (w.maxS < w.minS) return 'The upper bound must be at least the lower bound.';
  if (w.maxS - w.minS < MIN_WIDTH_S) return `The length window must be at least ${MIN_WIDTH_S} s wide.`;
  return null;
}

export interface ProduceBody { productName: string; audioMode: AudioMode; brief?: string; duration?: { minS: number; maxS: number } }

export function producePayload(i: { name: string; mode: AudioMode; brief: string; duration: DurationState }): { ok: true; body: ProduceBody } | { ok: false; error: string } {
  const body: ProduceBody = { productName: i.name.trim(), audioMode: i.mode };
  const brief = i.brief.trim();
  if (brief) body.brief = brief;
  if (i.duration.mode === 'manual') {
    const w = { minS: i.duration.minS, maxS: i.duration.maxS };
    const error = windowError(w);
    if (error) return { ok: false, error };
    body.duration = w;
  }
  return { ok: true, body };
}

/** What the form says the defaults are, and what a brief cannot change (Y7). */
export const BRIEF_DEFAULTS = `Defaults: length ${formatWindow(DEFAULT_DURATION)}, hook and narration chosen by the agent, look from the channel identity in Settings. Your brief overrides these; the technical format, safe area, sourced facts and license rules stay fixed.`;

/**
 * Y5: the research card's line about the agent's recommendation, against the video's effective window
 * (applied when the video's source is 'agent' and the windows match; overridden when the user decided).
 */
export function recommendationLine(rec: { duration_min_s: number; duration_max_s: number }, video?: { duration: { minS: number; maxS: number }; durationSource: 'default' | 'agent' | 'user' }): string {
  const w = recommendedWindow(rec);
  const base = `Agent suggests ${formatWindow(w)}`;
  if (!video) return base;
  if (video.durationSource === 'user') return `${base} · not applied, your choice of ${formatWindow(video.duration)} stands`;
  if (video.durationSource === 'agent' && video.duration.minS === w.minS && video.duration.maxS === w.maxS) return `${base} · applied`;
  return base;
}
