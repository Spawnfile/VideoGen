/**
 * Production brief and duration window (docs/superpowers/specs/2026-10-10-production-brief-design.md).
 * Precedence per field: the user's decision > the agent's recommendation > the default (Y1).
 */

export interface DurationWindow { minS: number; maxS: number }
export const DURATION_SOURCES = ['default', 'agent', 'user'] as const;
export type DurationSource = (typeof DURATION_SOURCES)[number];

/** Spec K8: the channel default. */
export const DEFAULT_DURATION: DurationWindow = { minS: 35, maxS: 55 };
/** Y2: under 15 s the rehook (40–60 %) runs into the 0–3 s hook window; over 60 s the single-chunk upload and render time are at risk. */
export const DURATION_HARD: DurationWindow = { minS: 15, maxS: 60 };
const MIN_WIDTH_S = 2;
export const BRIEF_MAX = 2000;

export const formatWindow = (w: DurationWindow) => `${w.minS}–${w.maxS} sn`;

export function durationWindowErrors(w: DurationWindow): string[] {
  const out: string[] = [];
  if (!Number.isFinite(w.minS) || !Number.isFinite(w.maxS)) return ['süre sayı olmalı'];
  if (w.minS < DURATION_HARD.minS) out.push(`süre en az ${DURATION_HARD.minS} sn olabilir`);
  if (w.maxS > DURATION_HARD.maxS) out.push(`süre en çok ${DURATION_HARD.maxS} sn olabilir`);
  if (w.maxS < w.minS) out.push('süre üst sınırı en az alt sınır kadar olmalı');
  else if (w.maxS - w.minS < MIN_WIDTH_S) out.push(`süre aralığı en az ${MIN_WIDTH_S} sn geniş olmalı`);
  return out;
}

/** Sorted, rounded, clamped into the hard bounds and widened to the minimum width (never rejected). */
export function clampWindow(a: number, b: number): DurationWindow {
  let lo = Math.round(Math.min(a, b));
  let hi = Math.round(Math.max(a, b));
  lo = Math.min(Math.max(lo, DURATION_HARD.minS), DURATION_HARD.maxS);
  hi = Math.min(Math.max(hi, DURATION_HARD.minS), DURATION_HARD.maxS);
  if (hi - lo < MIN_WIDTH_S) {
    const mid = (lo + hi) / 2;
    lo = Math.round(mid - MIN_WIDTH_S / 2);
    hi = lo + MIN_WIDTH_S;
    if (lo < DURATION_HARD.minS) { lo = DURATION_HARD.minS; hi = lo + MIN_WIDTH_S; }
    if (hi > DURATION_HARD.maxS) { hi = DURATION_HARD.maxS; lo = hi - MIN_WIDTH_S; }
  }
  return { minS: lo, maxS: hi };
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
// `\b` only knows ASCII word characters: "3 sütun" would end "s" at a word boundary. A unit is not followed by a letter.
const UNIT = String.raw`(saniye\p{L}*|sn(?!\p{L})|s(?!\p{L})|dakika\p{L}*|dk(?!\p{L}))`;
const num = (s: string) => Number(s.replace(',', '.'));
const seconds = (n: string, unit: string) => num(n) * (/^d/i.test(unit) ? 60 : 1);
/** Shorter than this is a per-scene timing ("ilk 3 sn kanca"), longer is about something else ("5 dakikalık iş"): not the video length. */
const PLAUSIBLE_S = { min: 5, max: 180 };

/**
 * Y3: the video length a brief states ("20 sn", "20–25 saniye", "40 sn ile 50 sn", "en fazla 25 sn", "25 saniyeyi geçmesin", "en az 40 sn",
 * "1 dakika"), clamped into the hard bounds; null when it names none. Every time expression is a candidate; per-scene timings and
 * implausible lengths are dropped and the longest remaining one is the video's (a qualified form beats a bare number of the same length).
 * Numbers without a time unit ("0,7 mm", "3 sütun") are ignored.
 */
export function parseBriefDuration(text: string): DurationWindow | null {
  const t = text.toLocaleLowerCase('tr');
  const found: { lo: number; hi: number; window: DurationWindow; rank: number }[] = [];
  const each = (re: string, rank: number, f: (m: RegExpMatchArray) => [number, number, DurationWindow]) => {
    for (const m of t.matchAll(new RegExp(re, 'gu'))) { const [lo, hi, window] = f(m); found.push({ lo, hi, window, rank }); }
  };
  each(String.raw`${NUM}\s*(?:${UNIT}\s*)?(?:-|–|—|ile)\s*${NUM}\s*${UNIT}`, 3, (m) => {
    const unit = m[2] ?? m[4]!;
    const a = seconds(m[1]!, unit);
    const b = seconds(m[3]!, m[4]!);
    return [Math.min(a, b), Math.max(a, b), clampWindow(a, b)];
  });
  const most = (m: RegExpMatchArray): [number, number, DurationWindow] => { const s = seconds(m[1]!, m[2]!); return [s, s, clampWindow(Math.max(DURATION_HARD.minS, s * 0.7), s)]; };
  each(String.raw`(?:en fazla|en çok|en uzun|maksimum|max\.?|azami)\s*${NUM}\s*${UNIT}`, 2, most);
  each(String.raw`${NUM}\s*${UNIT}\s*(?:\p{L}*\s*)?(?:geçmesin|aşmasın|altında|altı)`, 2, most);
  each(String.raw`(?:en az|minimum|min\.?|asgari)\s*${NUM}\s*${UNIT}`, 2, (m) => {
    const s = seconds(m[1]!, m[2]!);
    return [s, s, clampWindow(s, Math.max(s + MIN_WIDTH_S, DEFAULT_DURATION.maxS))];
  });
  each(String.raw`${NUM}\s*${UNIT}`, 1, (m) => { const s = seconds(m[1]!, m[2]!); return [s, s, clampWindow(s - 2, s + 2)]; });
  const best = found
    .filter((c) => c.hi >= PLAUSIBLE_S.min && c.lo <= PLAUSIBLE_S.max)
    .sort((a, b) => b.hi - a.hi || b.rank - a.rank)[0];
  return best?.window ?? null;
}

/** The agent's recommendation (ProductResearch.recommendation) as a valid window. */
export const recommendedWindow = (r: { duration_min_s: number; duration_max_s: number }) => clampWindow(r.duration_min_s, r.duration_max_s);

/** Y1 for the duration: user > agent > default. */
export function effectiveDuration(i: { user: DurationWindow | null; agent: DurationWindow | null }): { window: DurationWindow; source: DurationSource } {
  if (i.user) return { window: i.user, source: 'user' };
  if (i.agent) return { window: i.agent, source: 'agent' };
  return { window: DEFAULT_DURATION, source: 'default' };
}

/**
 * Y9: the spoken-length bounds of a VO storyboard: [36, 52] s on the default window, as before. The band is at least 3 s wide on a
 * narrow window (a 2 s window would otherwise ask for one exact estimate); the retime pads a short VO up to the window minimum.
 */
export function voBounds(w: DurationWindow): DurationWindow {
  const maxS = Math.max(w.maxS - 3, w.minS - 1);
  return { minS: Math.min(w.minS + 1, maxS - 3), maxS };
}

export const DURATION_SOURCE_LABELS: Record<DurationSource, string> = { default: 'varsayılan', agent: 'ajan önerisi', user: 'senin kararın' };

/** Y9: the storyboard step's check against the video's own window. */
export function windowErrors(durationS: number, w: DurationWindow): string[] {
  return durationS < w.minS || durationS > w.maxS ? [`duration_s ${durationS} sn: bu videonun süre penceresi ${formatWindow(w)}`] : [];
}
