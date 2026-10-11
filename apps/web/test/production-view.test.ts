import { describe, expect, it } from 'vitest';
import type { RunView, StepView, VideoView } from '@videogen/shared/browser';
import { activeStep, buildFacts, formatDay, formatEta, formatUsage, isRunActive, pickVideoId, sourceLabel, stepDuration, videoTone } from '../src/lib/production-view.ts';

const step = (over: Partial<StepView>): StepView => ({
  id: 's', runId: 'r', key: 'research', ordinal: 0, weight: 50, status: 'pending', progress: 0, progressSource: null, attempt: 0, round: 0, fixRound: 0,
  sessionId: null, error: null, note: null, startedAt: null, endedAt: null, ...over,
});
const run = (steps: StepView[], status: RunView['status'] = 'running'): RunView => ({ id: 'r', videoId: 'v', kind: 'produce', status, progress: 40, etaS: 200, error: null, createdAt: '', startedAt: null, endedAt: null, steps });

describe('production view helpers', () => {
  it('formats ETA, progress sources, tones, usage and durations in Turkish', () => {
    expect(formatEta(null)).toBe('');
    expect(formatEta(40)).toBe('a few seconds left');
    expect(formatEta(250)).toBe('about 4 min left');
    expect(formatEta(3900)).toBe('about 1 h 5 min left');
    expect(sourceLabel('agent')).toBe('agent report');
    expect(sourceLabel('time')).toBe('estimate');
    expect(sourceLabel('render')).toBe('rendered frames');
    expect(sourceLabel(null)).toBe('');
    expect([videoTone('running'), videoTone('ready'), videoTone('failed'), videoTone('needs_human'), videoTone('cancelled')]).toEqual(['active', 'ok', 'error', 'waiting', 'muted']);
    expect(formatUsage({ sessions: 2, tokens: 41_234, costUsd: 0.1, fiveHourDelta: 0.031 })).toBe('41K tokens · 5 h 3%');
    expect(formatUsage({ sessions: 0, tokens: 0, costUsd: null, fiveHourDelta: null })).toBe('');
    const now = Date.parse('2026-10-06T10:01:05Z');
    expect(stepDuration(step({ status: 'running', startedAt: '2026-10-06T10:00:00Z' }), now)).toBe('1:05');
    expect(stepDuration(step({ status: 'done', startedAt: '2026-10-06T10:00:00Z', endedAt: '2026-10-06T10:00:42Z' }), now)).toBe('0:42');
    expect(stepDuration(step({}), now)).toBe('');
  });

  it('finds the active step and the selected video', () => {
    const r = run([step({ status: 'done' }), step({ id: 's2', key: 'storyboard', status: 'waiting_limit' })]);
    expect(activeStep(r)?.id).toBe('s2');
    expect(isRunActive(r)).toBe(true);
    expect(isRunActive(run([], 'needs_human'))).toBe(false);
    const vids = [{ id: 'b' }, { id: 'a' }] as VideoView[];
    expect(pickVideoId('a', vids)).toBe('a');
    expect(pickVideoId('zzz', vids)).toBe('b');
    expect(pickVideoId('none', vids)).toBeNull(); // "Yeni sohbet" clears the Studio's video on purpose
    expect(pickVideoId(null, [])).toBeNull();
  });
});
describe('formatDay', () => {
  it('says "today" for today and a short English date otherwise (local time)', () => {
    const now = new Date(2026, 9, 6, 18, 0).getTime();
    expect(formatDay(new Date(2026, 9, 6, 14, 5).toISOString(), now)).toBe('today 14:05');
    expect(formatDay(new Date(2026, 9, 1, 9, 30).toISOString(), now)).toBe('1 Oct 09:30');
  });

  it('summarizes a build: parts, triangles, hero size, channel style and at most five warnings', () => {
    const report = { ok: true, errors: [], parts: ['a', 'b', 'c'], missing_parts: [], extra_parts: [], overlaps: [], hero_ratio: 0.7995, occlusion: [], triangles: 7526, frames: 1350, warnings: ['1', '2', '3', '4', '5', '6'] };
    const f = buildFacts(report, { style_id: 'gece_mavisi' } as never);
    expect(f.line).toBe('3 parts · 7,526 triangles · hero 80% · Night blue');
    expect(f.warnings).toEqual(['1', '2', '3', '4', '5']);
    expect(buildFacts({ ...report, warnings: [] }).line).toBe('3 parts · 7,526 triangles · hero 80%');
  });
});
