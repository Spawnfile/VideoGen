import { describe, expect, it } from 'vitest';
import { etaSeconds, expectedSeconds, overallPercent, timeCurvePercent, type ProgressStep } from '../src/progress.ts';

const step = (over: Partial<ProgressStep>): ProgressStep => ({ key: 'research', weight: 50, status: 'pending', progress: 0, startedAt: null, expectedS: 300, ...over });

describe('overallPercent', () => {
  it('weights step ratios, counts done and skipped as whole, caps at 99 until complete and never goes back', () => {
    const steps = [step({ status: 'done', weight: 53.33 }), step({ key: 'storyboard', status: 'running', progress: 50, weight: 46.67 })];
    expect(overallPercent(steps)).toBe(76.7);
    expect(overallPercent(steps, 80)).toBe(80);
    const finished = steps.map((s) => ({ ...s, status: 'done' as const }));
    expect(overallPercent(finished)).toBe(99);
    expect(overallPercent(finished, 0, true)).toBe(100);
    expect(overallPercent([step({ status: 'skipped' }), step({ status: 'running', progress: 100 })])).toBe(99);
    expect(overallPercent([])).toBe(0);
  });
});

describe('time curve and expected duration', () => {
  it('rises smoothly to ~63 % at the expected duration and stops at 90 %', () => {
    expect(timeCurvePercent(0, 300)).toBe(0);
    expect(timeCurvePercent(300, 300)).toBe(63.2);
    expect(timeCurvePercent(3000, 300)).toBe(90);
    expect(timeCurvePercent(100, 300)).toBeLessThan(timeCurvePercent(200, 300));
  });

  it('uses the median of the last five runs, else the spec default', () => {
    expect(expectedSeconds('research', [])).toBe(300);
    expect(expectedSeconds('storyboard', [])).toBe(180);
    expect(expectedSeconds('research', [400, 100, 250])).toBe(250);
    expect(expectedSeconds('research', [10, 20, 30, 40, 50, 9999])).toBe(30);
  });
});

describe('etaSeconds', () => {
  it('sums the running remainder (min 5 s) and pending steps; null when nothing is left', () => {
    const now = 1_000_000;
    const running = step({ status: 'running', progress: 50, startedAt: now - 60_000, expectedS: 300 });
    expect(etaSeconds([step({ status: 'done' }), running, step({ key: 'storyboard', expectedS: 180 })], now)).toBe(330);
    expect(etaSeconds([step({ status: 'running', progress: 0, startedAt: now - 100_000, expectedS: 300 })], now)).toBe(200);
    expect(etaSeconds([step({ status: 'running', progress: 0, startedAt: now - 900_000, expectedS: 300 })], now)).toBe(5);
    expect(etaSeconds([step({ status: 'done' }), step({ status: 'cancelled' })], now)).toBeNull();
  });
});
