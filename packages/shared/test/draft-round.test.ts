import { describe, expect, it } from 'vitest';
import { draftRound, type StepView } from '../src/index.ts';

const s = (key: StepView['key'], weight: number, status: StepView['status'], progress: number, round: number) => ({ key, weight, status, progress, round });

describe('draftRound (header "Taslak turu k/2")', () => {
  it('is null before the first return, then the round and the loop steps\' own weighted progress', () => {
    const first = [s('research', 19.05, 'done', 100, 0), s('storyboard', 16.67, 'done', 100, 0), s('build', 42.86, 'done', 100, 0), s('draft_render', 9.52, 'done', 100, 0), s('draft_review', 11.9, 'running', 50, 0)];
    expect(draftRound(first)).toBeNull();
    const again = [s('research', 19.05, 'done', 100, 0), s('storyboard', 16.67, 'done', 100, 0), s('build', 42.86, 'done', 100, 1), s('draft_render', 9.52, 'running', 50, 1), s('draft_review', 11.9, 'pending', 0, 1)];
    expect(draftRound(again)).toEqual({ round: 1, percent: Math.round(((42.86 + 9.52 * 0.5) / (42.86 + 9.52 + 11.9)) * 100) });
    expect(draftRound(again.map((x) => (x.key === 'build' ? { ...x, status: 'running' as const, progress: 0 } : x)))!.percent).toBe(7);
  });
});
