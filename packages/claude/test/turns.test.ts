import { describe, expect, it } from 'vitest';
import { isAbortError, loadFixture, rateLimitInfo, TurnTracker } from '../src/index.ts';

function feed(name: string) {
  const t = new TurnTracker();
  const completeAt: number[] = [];
  loadFixture(name).forEach((l, i) => { if (t.push(l.m) === 'turn_complete') completeAt.push(i); });
  return { t, completeAt, lines: loadFixture(name) };
}

describe('TurnTracker', () => {
  it('subagent: completes only on the follow-up result; accounting uses the last cumulative result, turns are summed', () => {
    const { t, completeAt, lines } = feed('subagent');
    const results = lines.map((l, i) => [i, l.m] as const).filter(([, m]) => m.type === 'result');
    expect(results).toHaveLength(2);
    expect(completeAt).toEqual([results[1]![0]]);
    const a = t.accounting();
    expect(a.numTurns).toBe(6);
    expect(a.costUsd).toBeCloseTo(0.0351953, 7);
    const mu = Object.values(a.modelUsage!)[0] as Record<string, number>;
    expect(mu.cacheReadInputTokens).toBe(122593);
    expect(mu.cacheCreationInputTokens).toBe(2695);
    expect(a.tokens).toBe(3551 + 2799 + 122593 + 2695);
    expect(a.terminalReason).toBe('completed');
  });

  it('subagent-background: the early result without structured_output does not complete the turn', () => {
    const { t, completeAt, lines } = feed('subagent-background');
    expect(completeAt).toHaveLength(1);
    expect(lines[completeAt[0]!]!.m.type).toBe('result');
    expect((t.lastResult as { structured_output?: { scenes?: unknown[] } }).structured_output?.scenes?.length).toBeGreaterThan(0);
  });

  it('single-result sessions complete at their only result', () => {
    for (const name of ['basic', 'subagent-nobg', 'websearch', 'coding']) {
      const { completeAt, lines } = feed(name);
      expect(completeAt.map((i) => lines[i]!.m.type), name).toEqual(['result']);
    }
  });

  it('collects permission denials with the tool_use_id', () => {
    const { t } = feed('guard');
    expect(t.permissionDenials()).toEqual([{ tool: 'Write', toolUseId: expect.stringMatching(/^toolu_/) }]);
  });

  it('classifies the interrupt error and extracts rate limit info', () => {
    expect(isAbortError(new Error('Claude Code returned an error result: [ede_diagnostic] result_type=user'))).toBe(true);
    expect(isAbortError(new Error('Claude Code process exited with code 1'))).toBe(false);
    expect(isAbortError('x')).toBe(false);
    const ev = loadFixture('basic').map((l) => l.m).find((m) => m.type === 'rate_limit_event')!;
    expect(rateLimitInfo(ev)?.unifiedWindows?.five_hour?.utilization).toBeGreaterThan(0);
    expect(rateLimitInfo({ type: 'assistant' })).toBeNull();
  });
});
