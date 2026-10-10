import { DEFAULT_DURATION, durationWindowErrors, formatWindow, parseBriefDuration, recommendedWindow, type AudioMode } from '@videogen/shared/browser';

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
  if (s.mode === 'auto') return `Otomatik · ajan önerir, yoksa varsayılan ${formatWindow(DEFAULT_DURATION)}`;
  return `${formatWindow(s)} · ${s.origin === 'brief' ? 'yönergeden' : 'senin kararın'}`;
}

export interface ProduceBody { productName: string; audioMode: AudioMode; brief?: string; duration?: { minS: number; maxS: number } }

export function producePayload(i: { name: string; mode: AudioMode; brief: string; duration: DurationState }): { ok: true; body: ProduceBody } | { ok: false; error: string } {
  const body: ProduceBody = { productName: i.name.trim(), audioMode: i.mode };
  const brief = i.brief.trim();
  if (brief) body.brief = brief;
  if (i.duration.mode === 'manual') {
    const w = { minS: i.duration.minS, maxS: i.duration.maxS };
    const errors = durationWindowErrors(w);
    if (errors.length) return { ok: false, error: errors[0]! };
    body.duration = w;
  }
  return { ok: true, body };
}

/** What the form says the defaults are, and what a brief cannot change (Y7). */
export const BRIEF_DEFAULTS_TR = `Varsayılanlar: süre ${formatWindow(DEFAULT_DURATION)}, kanca ve anlatım ajanın seçimi, görsel stil Ayarlar'daki kanal kimliği. Yönergen bunları ezer; teknik format, güvenli alan, kaynaklı bilgi ve lisans kuralları değişmez.`;

/**
 * Y5: the research card's line about the agent's recommendation, against the video's effective window
 * (applied when the video's source is 'agent' and the windows match; overridden when the user decided).
 */
export function recommendationLine(rec: { duration_min_s: number; duration_max_s: number }, video?: { duration: { minS: number; maxS: number }; durationSource: 'default' | 'agent' | 'user' }): string {
  const w = recommendedWindow(rec);
  const base = `Ajanın süre önerisi: ${formatWindow(w)}`;
  if (!video) return base;
  if (video.durationSource === 'user') return `${base} · uygulanmadı, senin kararın ${formatWindow(video.duration)} geçerli`;
  if (video.durationSource === 'agent' && video.duration.minS === w.minS && video.duration.maxS === w.maxS) return `${base} · uygulandı`;
  return base;
}
