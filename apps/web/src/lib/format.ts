import type { GuardState } from '@videogen/shared/browser';
import { percent } from './i18n.ts';
import { dayMonth, time } from './locale.ts';

export const pct = percent;

export function resetTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `Resets at ${time(d)}` : `Resets ${dayMonth(d)} ${time(d)}`;
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function guardText(g: GuardState): string {
  const why = g.reason === 'five_hour' ? `5 h at ${pct(g.fiveHour)}` : g.reason === 'seven_day' ? `7 d at ${pct(g.sevenDay)}` : 'usage limit reached';
  const at = g.resumeAt ? `, resumes at ${time(g.resumeAt)}` : '';
  return `New work is on hold: ${why}${at}`;
}
