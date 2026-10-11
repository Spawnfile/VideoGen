import { DEFAULT_DURATION, recommendedWindow } from '@videogen/shared/browser';
import { windowLabel as formatWindow } from './i18n.ts';

/** YAKLASIM spec Y1/Y2: the form's fixed line — the approach decides length, voice and language. */
export const YAKLASIM_LINE = 'YAKLASIM · 12–15 s · no voiceover · English on-screen text';

export interface ProduceBody { productName: string; brief?: string }

export function producePayload(i: { name: string; brief: string }): { ok: true; body: ProduceBody } {
  const body: ProduceBody = { productName: i.name.trim() };
  const brief = i.brief.trim();
  if (brief) body.brief = brief;
  return { ok: true, body };
}

/** What the form says the approach fixes, and what a brief can still steer (spec Y7). */
export const BRIEF_DEFAULTS = 'Every video follows YAKLASIM: 12–15 s, a curiosity chain from a bursting first frame to a looping twist, English text of at most five words, the fixed navy look and the fixed music. Your brief can steer the hidden detail, the number, the twist and the tone; it cannot change the approach, the safe area, sourced facts or license rules.';

/**
 * Y5: the research card's line about the agent's recommendation, against the video's effective window
 * (applied when the video's source is 'agent' and the windows match; overridden when the user decided).
 */
export function recommendationLine(rec: { duration_min_s: number; duration_max_s: number }): string {
  return `Agent suggests ${formatWindow(recommendedWindow(rec))} · YAKLASIM length is fixed at ${formatWindow(DEFAULT_DURATION)}`;
}
