import { describe, expect, it } from 'vitest';
import type { FindingRecord, ReviewRecord, VersionView } from '@videogen/shared/browser';
import { compareView, syncPlan } from '../src/lib/compare-view.ts';
import { panelView } from '../src/lib/production-view.ts';

const ver = (round: number, o: Partial<VersionView> = {}): VersionView => ({
  id: `v${round}`, round, reason: round ? 'fix:compose' : 'produce', parentId: round ? `v${round - 1}` : null, createdAt: `2026-10-0${round + 1}T10:00:00.000Z`, runId: 'r1',
  total: null, verdict: null, dims: null, finals: null, best: false, current: false, published: false, ...o,
});
const fin = (c: string, tiktok = true) => ({ musicSha: c.repeat(64), tiktokSha: tiktok ? `${c}1`.repeat(32) : null, coverSha: `${c}2`.repeat(32), durationS: 45 });

describe('compare view', () => {
  it('compareView: picks best vs the previous version by default, shows the score and per-dimension deltas, refuses a version without a final with a Turkish reason; syncPlan seeks B only when it drifts more than 0.15 s', () => {
    const versions = [
      ver(0, { total: 72, dims: { D1: 10, D2: 9 }, finals: fin('a') }),
      ver(1, { total: 78.5, dims: { D1: 11, D2: 9 }, finals: fin('b', false) }),
      ver(2, { total: 84, dims: { D1: 13, D2: 8.5 }, finals: fin('c'), best: true }),
      ver(3, { reason: 'fix:pending' }),
    ];
    // Default: A = the finished version before the best, B = the best.
    const d = compareView(versions, null, null, 'music');
    expect(d.canCompare).toBe(true);
    expect(d.reason).toBeUndefined();
    expect(d.a).toMatchObject({ id: 'v1', label: 'Sürüm 2', sha: 'b'.repeat(64), coverSha: 'b2'.repeat(32), total: 78.5 });
    expect(d.b).toMatchObject({ id: 'v2', label: 'Sürüm 3', sha: 'c'.repeat(64), total: 84, best: true });
    expect(d.delta.total).toBe(5.5);
    expect(d.delta.dims.find((x) => x.id === 'D1')).toEqual({ id: 'D1', label: 'Kanca', a: 11, b: 13, delta: 2 });
    expect(d.delta.dims.find((x) => x.id === 'D2')).toMatchObject({ a: 9, b: 8.5, delta: -0.5 });
    expect(d.delta.dims.find((x) => x.id === 'D9')).toMatchObject({ a: null, b: null, delta: null });
    // The variant applies to both sides; without a TikTok file the music file stands in.
    const t = compareView(versions, 'v0', 'v1', 'tiktok');
    expect([t.a!.sha, t.b!.sha]).toEqual(['a1'.repeat(32), 'b'.repeat(64)]);
    expect(t.delta.total).toBe(6.5);
    // The best is the oldest: the next finished one stands in as the other side.
    const early = compareView([ver(0, { finals: fin('a'), best: true, total: 80 }), ver(1, { finals: fin('b'), total: 70 })], null, null, 'music');
    expect([early.a!.id, early.b!.id]).toEqual(['v1', 'v0']);
    // An unfinished version is refused with a Turkish reason; so are the same version twice and a lone final.
    const bad = compareView(versions, 'v2', 'v3', 'music');
    expect(bad).toMatchObject({ canCompare: false, reason: 'Sürüm 4 tamamlanmadı: finali yok, karşılaştırılamaz' });
    expect(bad.b).toBeNull();
    expect(compareView(versions, 'v2', 'v2', 'music')).toMatchObject({ canCompare: false, reason: 'Aynı sürüm iki kez seçildi' });
    expect(compareView([ver(0, { finals: fin('a') }), ver(1)], null, null, 'music')).toMatchObject({ canCompare: false, reason: 'Karşılaştırmak için finali olan iki sürüm gerekir' });

    expect(syncPlan(10, 10.1)).toEqual({});
    expect(syncPlan(10, 10.15)).toEqual({});
    expect(syncPlan(10, 10.2)).toEqual({ seekB: 10 });
    expect(syncPlan(3.5, 3.2)).toEqual({ seekB: 3.5 });
  });

  const finding = (checkId: string, o: Partial<FindingRecord> = {}): FindingRecord => ({
    id: `${checkId}-${o.status ?? 'open'}`, checkId, severity: 'minor', dimension: null, gate: null, evidence: null, fixHint: null, status: 'open', fixedInVersionId: null, ...o,
  });
  const row = (runId: string, round: number, role: string, o: Partial<ReviewRecord> = {}): ReviewRecord => ({
    id: `${runId}-${round}-${role}`, videoId: 'v', versionId: null, runId, stepId: null, round, reviewerRole: role, seq: 1, sessionId: null, rubricVersion: 'final@1', total: null,
    dimensionScores: null, gates: null, verdict: null, summaryTr: null, createdAt: `2026-10-08T10:0${round}:00.000Z`, findings: [], ...o,
  });

  it('panelView with a round: shows that round\'s reviewers, gates and auto findings; rounds lists every round of the run; without a round it is the newest (unchanged behaviour)', () => {
    const all: ReviewRecord[] = [
      row('r1', 0, 'orchestrator', { total: 64, verdict: 'fix', gates: { G1: false }, findings: [finding('G1', { severity: 'blocker' })], summaryTr: 'teslim düştü' }),
      row('r1', 0, 'reviewer_visual', { summaryTr: 'tur 1 görsel', findings: [finding('hero_frame0', { severity: 'major' })] }),
      row('r1', 1, 'orchestrator', { total: 76, verdict: 'fix', gates: { G1: true } }),
      row('r1', 1, 'reviewer_visual', { summaryTr: 'tur 2 görsel' }),
      row('r1', 1, 'reviewer_facts', { summaryTr: 'tur 2 doğruluk' }),
      row('r1', 2, 'orchestrator', { total: 84, verdict: 'ready', gates: { G1: true } }),
      row('r1', 2, 'reviewer_visual', { summaryTr: 'tur 3 görsel' }),
      row('r1', 2, 'reviewer_facts', { summaryTr: 'tur 3 doğruluk' }),
      row('r1', 2, 'reviewer_retention', { summaryTr: 'tur 3 izlenme' }),
      row('r0', 0, 'orchestrator', { total: 50, createdAt: '2026-10-07T10:00:00.000Z' }),
    ];
    const old = panelView(all, 'r1', 0)!;
    expect(old).toMatchObject({ round: 0, runId: 'r1', rounds: [0, 1, 2], earlier: 0, total: 64, verdict: 'fix' });
    expect(old.gates.find((g) => g.id === 'G1')!.pass).toBe(false);
    expect(old.auto).toMatchObject({ summary: 'teslim düştü', findings: [{ check: 'G1', severity: 'blocker' }] });
    expect(old.reviewers.map((r) => [r.role, r.summary, r.findings.map((f) => f.check)])).toEqual([['reviewer_visual', 'tur 1 görsel', ['hero_frame0']]]);
    const mid = panelView(all, 'r1', 1)!;
    expect(mid).toMatchObject({ round: 1, earlier: 1, total: 76, auto: null });
    expect(mid.reviewers.map((r) => r.summary)).toEqual(['tur 2 görsel', 'tur 2 doğruluk']);
    // No round: the newest round of the run, as before.
    const newest = panelView(all, 'r1')!;
    expect(newest).toMatchObject({ round: 2, rounds: [0, 1, 2], earlier: 2, total: 84 });
    expect(newest.reviewers).toHaveLength(3);
    expect(panelView(all)).toMatchObject({ runId: 'r1', round: 2 });
    expect(panelView(all, 'r0')).toMatchObject({ round: 0, rounds: [0], total: 50 });
    // A round the run does not have shows nothing.
    expect(panelView(all, 'r1', 5)).toBeNull();
  });
});
