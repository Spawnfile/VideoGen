import { describe, expect, it } from 'vitest';
import { STEP_DEFAULT_S, STEP_KEYS, type RunView, type StepKey, type StepView } from '@videogen/shared/browser';
import { LANE_OF, timelineView } from '../src/lib/timeline-view.ts';

const T0 = Date.parse('2026-10-11T10:00:00Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
let n = 0;
const step = (key: StepKey, over: Partial<StepView> = {}): StepView => ({
  id: `s${n++}`, runId: 'r', key, ordinal: n, weight: 1, status: 'pending', progress: 0, progressSource: null, attempt: 0, round: 0, fixRound: 0,
  sessionId: null, error: null, note: null, startedAt: null, endedAt: null, ...over,
});
const run = (steps: StepView[], over: Partial<RunView> = {}): RunView => ({
  id: 'r', videoId: 'v', kind: 'produce', status: 'running', progress: 30, etaS: null, error: null, createdAt: at(0), startedAt: at(0), endedAt: null, steps, ...over,
});
const blocks = (v: ReturnType<typeof timelineView>) => v.lanes.flatMap((l) => l.blocks).sort((a, b) => a.startPct - b.startPct);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('timelineView', () => {
  it('done step width is its real duration', () => {
    const v = timelineView(run([step('research', { status: 'done', startedAt: at(0), endedAt: at(600) }), step('storyboard', { status: 'done', startedAt: at(600), endedAt: at(1200) })], { status: 'done', endedAt: at(1200) }), T0 + 1200_000);
    expect(v.totalS).toBe(1200);
    expect(blocks(v).map((b) => b.widthPct)).toEqual([50, 50]);
  });

  it('running step uses the default until it outlives it', () => {
    const short = timelineView(run([step('research', { status: 'running', startedAt: at(0) })]), T0 + 10_000);
    expect(short.totalS).toBe(STEP_DEFAULT_S.research);
    const long = timelineView(run([step('research', { status: 'running', startedAt: at(0) })]), T0 + 900_000);
    expect(long.totalS).toBe(900);
  });

  it('pending steps use STEP_DEFAULT_S', () => {
    const v = timelineView(run([step('storyboard'), step('qc')]), T0);
    expect(v.totalS).toBe(STEP_DEFAULT_S.storyboard + STEP_DEFAULT_S.qc);
  });

  it('every STEP_KEYS entry belongs to exactly one lane', () => {
    for (const k of STEP_KEYS) expect(['V', 'A', 'QC']).toContain(LANE_OF[k]);
    expect(Object.keys(LANE_OF).sort()).toEqual([...STEP_KEYS].sort());
  });

  it('lanes always come back in V, A, QC order', () => {
    expect(timelineView(run([step('qc')]), T0).lanes.map((l) => l.id)).toEqual(['V', 'A', 'QC']);
  });

  it('tiny steps get at least 4 percent and widths still sum to 100', () => {
    const v = timelineView(run([step('build'), step('qc'), step('finalize')]), T0);
    const w = blocks(v).map((b) => b.widthPct);
    expect(Math.min(...w)).toBeGreaterThan(3.5); // stretched to 4% of the raw total, then rescaled
    expect(sum(w)).toBeCloseTo(100, 6);
    const qc = blocks(v).find((b) => b.key === 'qc')!;
    expect(qc.widthPct).toBeGreaterThan((STEP_DEFAULT_S.qc / (STEP_DEFAULT_S.build + STEP_DEFAULT_S.qc + STEP_DEFAULT_S.finalize)) * 100);
  });

  it('skipped step has zero width and is not stretched', () => {
    const v = timelineView(run([step('research', { status: 'done', startedAt: at(0), endedAt: at(300) }), step('storyboard', { status: 'skipped' }), step('build')]), T0 + 300_000);
    const sk = blocks(v).find((b) => b.key === 'storyboard')!;
    expect(sk.tone).toBe('skipped');
    expect(sk.widthPct).toBe(0);
    expect(sum(blocks(v).map((b) => b.widthPct))).toBeCloseTo(100, 6);
  });

  it('cancelled before starting is stopped, not started, default width', () => {
    const v = timelineView(run([step('research', { status: 'done', startedAt: at(0), endedAt: at(300) }), step('storyboard', { status: 'cancelled' })], { status: 'cancelled', endedAt: at(300) }), T0 + 400_000);
    const b = blocks(v).find((x) => x.key === 'storyboard')!;
    expect(b).toMatchObject({ tone: 'stopped', started: false });
    expect(v.totalS).toBe(300 + STEP_DEFAULT_S.storyboard);
  });

  it('started then cancelled keeps its real width and started:true', () => {
    const v = timelineView(run([step('research', { status: 'cancelled', startedAt: at(0) })], { status: 'cancelled', endedAt: at(120) }), T0 + 999_000);
    expect(blocks(v)[0]).toMatchObject({ tone: 'stopped', started: true });
    expect(v.totalS).toBe(120);
  });

  it('playhead sits at done plus elapsed of the running step', () => {
    const v = timelineView(run([step('research', { status: 'done', startedAt: at(0), endedAt: at(300) }), step('storyboard', { status: 'running', startedAt: at(300) }), step('qc')]), T0 + 360_000);
    // total = 300 + 180 (default, not outlived) + 5 (qc, stretched later) ; playhead at 360 of the real timeline
    const research = blocks(v)[0];
    const board = blocks(v)[1];
    expect(v.playheadPct).toBeGreaterThan(research.widthPct);
    expect(v.playheadPct).toBeLessThan(research.widthPct + board.widthPct);
    expect(board.tone).toBe('live');
  });

  it('finished run puts the playhead at 100', () => {
    const v = timelineView(run([step('research', { status: 'done', startedAt: at(0), endedAt: at(300) })], { status: 'done', endedAt: at(300) }), T0 + 300_000);
    expect(v.playheadPct).toBe(100);
    expect(v.now).toMatchObject({ kind: 'done', clock: '5:00' });
  });

  it('stopped run puts the playhead where the work stopped', () => {
    const v = timelineView(run([step('research', { status: 'done', startedAt: at(0), endedAt: at(300) }), step('build', { status: 'cancelled', startedAt: at(300) }), step('final_render', { status: 'cancelled' })], { status: 'cancelled', endedAt: at(400) }), T0 + 999_000);
    const build = blocks(v).find((b) => b.key === 'build')!;
    expect(v.playheadPct).toBeCloseTo(build.startPct + build.widthPct, 6);
    expect(v.playheadPct).toBeLessThan(100);
  });

  it('repeated key yields two blocks with distinct ids in order', () => {
    const a = step('build', { status: 'done', startedAt: at(0), endedAt: at(100) });
    const b = step('build', { status: 'running', startedAt: at(100), round: 1 });
    const v = timelineView(run([a, b]), T0 + 150_000);
    const bs = blocks(v).filter((x) => x.key === 'build');
    expect(bs.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(bs[1].title).toContain('round 1');
  });

  it('clock skew clamps to zero', () => {
    const v = timelineView(run([step('research', { status: 'running', startedAt: at(60) })], { startedAt: at(60) }), T0);
    expect(v.playheadPct).toBeGreaterThanOrEqual(0);
    for (const b of blocks(v)) expect(b.widthPct).toBeGreaterThanOrEqual(0);
    expect(v.now.clock).toBe('0:00');
  });

  it('all skipped run has totalS 0 and finite positions', () => {
    const v = timelineView(run([step('research', { status: 'skipped' }), step('storyboard', { status: 'skipped' })], { status: 'done', endedAt: at(0) }), T0);
    expect(v.totalS).toBe(0);
    for (const b of blocks(v)) { expect(Number.isFinite(b.startPct)).toBe(true); expect(Number.isFinite(b.widthPct)).toBe(true); }
    expect(Number.isFinite(v.playheadPct)).toBe(true);
    expect(v.ticks.map((t) => t.label)).toEqual(['0:00', '0:00', '0:00', '0:00', '0:00']);
  });

  it('now is live with the running step note', () => {
    const v = timelineView(run([step('build', { status: 'running', startedAt: at(0), note: 'sahne 4/7' })]), T0 + 252_000);
    expect(v.now).toEqual({ kind: 'live', clock: '4:12', note: 'sahne 4/7' });
  });

  it('now clock uses h:mm:ss past an hour', () => {
    const v = timelineView(run([step('final_render', { status: 'running', startedAt: at(0) })]), T0 + 3_725_000);
    expect(v.now.clock).toBe('1:02:05');
  });

  it('needs_human run reads "needs you", keeps the last step note and stops the playhead where the work stopped', () => {
    const v = timelineView(run([step('review', { status: 'done', startedAt: at(0), endedAt: at(60), note: 'onay bekliyor' }), step('finalize')], { status: 'needs_human', endedAt: at(60) }), T0 + 120_000);
    expect(v.now).toEqual({ kind: 'needs', clock: '1:00', note: 'onay bekliyor' });
    const review = blocks(v).find((b) => b.key === 'review')!;
    expect(v.playheadPct).toBeCloseTo(review.startPct + review.widthPct, 6);
    expect(v.playheadPct).toBeLessThan(100);
  });

  it('marks waiting and failed steps with their tones and puts five ruler ticks', () => {
    const v = timelineView(run([step('research', { status: 'failed', startedAt: at(0), endedAt: at(30), error: 'kırıldı' }), step('build', { status: 'waiting_gpu', startedAt: at(30) })]), T0 + 60_000);
    expect(blocks(v).map((b) => b.tone)).toEqual(['failed', 'waiting']);
    expect(v.ticks.map((t) => t.pct)).toEqual([0, 25, 50, 75, 100]);
  });
});
