import { STEP_DEFAULT_S, type StepKey, type StepStatus } from './pipeline.ts';

export interface ProgressStep {
  key: StepKey;
  weight: number;
  status: StepStatus;
  /** 0..100 */
  progress: number;
  /** ms epoch */
  startedAt: number | null;
  expectedS: number;
}

export const ACTIVE_STEP_STATUSES: readonly StepStatus[] = ['queued', 'running', 'waiting_gpu', 'waiting_limit', 'waiting_disk'];
const round1 = (n: number) => Math.round(n * 10) / 10;

function ratio(s: ProgressStep): number {
  if (s.status === 'done' || s.status === 'skipped') return 1;
  return Math.min(0.99, Math.max(0, s.progress / 100));
}

/** Spec §12.1: Σ weight × ratio, monotone (never below `previous`), 100 only when the video is complete. */
export function overallPercent(steps: ProgressStep[], previous = 0, complete = false): number {
  const total = steps.reduce((a, s) => a + s.weight, 0);
  const raw = total > 0 ? (steps.reduce((a, s) => a + s.weight * ratio(s), 0) / total) * 100 : 0;
  const capped = complete ? 100 : Math.min(99, raw);
  return round1(Math.max(previous, capped));
}

/** Spec §12.1 `time` source: a soft curve from the expected duration (≈ 63 % at the expected time), never above 90 %. */
export function timeCurvePercent(elapsedS: number, expectedS: number): number {
  if (elapsedS <= 0 || expectedS <= 0) return 0;
  return round1(Math.min(90, 100 * (1 - Math.exp(-elapsedS / expectedS))));
}

/** Median of the last five finished durations; the spec §7.1 midpoint until there is history. */
export function expectedSeconds(key: StepKey, history: number[]): number {
  const h = history.filter((x) => x > 0).slice(0, 5).sort((a, b) => a - b);
  return h.length ? h[Math.floor(h.length / 2)]! : STEP_DEFAULT_S[key];
}

/** Remaining seconds for the run, or null when no step is left. */
export function etaSeconds(steps: ProgressStep[], nowMs: number): number | null {
  let left = 0;
  let any = false;
  for (const s of steps) {
    if (s.status === 'pending' || s.status === 'queued') { left += s.expectedS; any = true; continue; }
    if (!ACTIVE_STEP_STATUSES.includes(s.status)) continue;
    any = true;
    const elapsed = s.startedAt === null ? 0 : (nowMs - s.startedAt) / 1000;
    const remaining = s.progress > 0 ? s.expectedS * (1 - s.progress / 100) : s.expectedS - elapsed;
    left += Math.max(5, remaining);
  }
  return any ? Math.round(left) : null;
}
