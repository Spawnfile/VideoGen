import { describe, expect, it } from 'vitest';
import type { ArtifactMeta, FindingRecord, ReviewRecord, RunView, StepView } from '@videogen/shared/browser';
import { draftRoundLabel, finalRoundLabel, panelView, pickReviewSheet, reviewBadge, roundLabel } from '../src/lib/production-view.ts';

const step = (key: StepView['key'], o: Partial<StepView> = {}): StepView => ({ id: key, key, status: 'done', progress: 100, weight: 10, round: 0, fixRound: 0, ...o } as StepView);
const run = (steps: StepView[], status: RunView['status'] = 'running'): RunView => ({ id: 'r1', status, steps } as unknown as RunView);

describe('review panel helpers', () => {
  it('finalRoundLabel shows \'Düzeltme turu 1/3 · %50\' while a fix round runs and falls back to the draft label', () => {
    const fixing = run([step('compose', { fixRound: 1 }), step('qc', { fixRound: 1, status: 'running', progress: 0 }), step('review', { fixRound: 0 })]);
    expect(finalRoundLabel(fixing)).toBe('Düzeltme turu 1/3 · %50');
    expect(roundLabel(fixing)).toBe('Düzeltme turu 1/3 · %50');
    expect(finalRoundLabel(run([step('compose', { fixRound: 1 })], 'succeeded' as RunView['status']))).toBe('');
    expect(finalRoundLabel(null)).toBe('');
    const drafting = run([step('build', { round: 1, status: 'running', progress: 0 })]);
    expect(finalRoundLabel(drafting)).toBe('');
    expect(roundLabel(drafting)).toBe(draftRoundLabel(drafting));
    expect(roundLabel(drafting)).toMatch(/^Taslak turu 1\/2/);
  });

  const finding = (checkId: string, o: Partial<FindingRecord> = {}): FindingRecord => ({
    id: checkId, checkId, severity: 'minor', dimension: null, gate: null, evidence: null, fixHint: null, status: 'open', fixedInVersionId: null, ...o,
  });
  const row = (round: number, role: string, seq: number, o: Partial<ReviewRecord> = {}): ReviewRecord => ({
    id: `${round}-${role}-${seq}`, videoId: 'v', versionId: null, runId: 'r1', stepId: null, round, reviewerRole: role, seq, sessionId: null, rubricVersion: 'final@1', total: null,
    dimensionScores: null, gates: null, verdict: null, summaryTr: null, createdAt: '', findings: [], ...o,
  });

  it('panelView: bars scaled to the weight with the 60 % floor, gates with unknowns, reviewer cards ordered visual/facts/retention with the second visual merged, regressed findings marked', () => {
    expect(panelView([])).toBeNull();
    const reviews: ReviewRecord[] = [
      row(0, 'orchestrator', 1, { total: 70, verdict: 'fix', dimensionScores: { D1: 15 }, gates: {} }),
      row(0, 'reviewer_visual', 1, { summaryTr: 'eski tur' }),
      row(1, 'orchestrator', 1, {
        total: 79.4, verdict: 'fix',
        dimensionScores: { D1: 12, D2: 8.9, D3: 9, D4: 12, D5: 8, D6: 9, D7: 4, D8: 4.7, D9: 7 },
        gates: { G1: true, G2: null, G3: true, G4: true, G5: false, G6: true },
      }),
      row(1, 'reviewer_retention', 1, { summaryTr: 'izlenme', findings: [finding('payoff', { severity: 'major', evidence: { frame: 900, timecode: 30 }, fixHint: 'ödülü öne al', status: 'regressed' })] }),
      row(1, 'reviewer_visual', 2, { summaryTr: 'ikinci' }),
      row(1, 'reviewer_facts', 1, { summaryTr: 'doğruluk' }),
      row(1, 'reviewer_visual', 1, {
        summaryTr: 'görsel',
        findings: [finding('no_slop'), finding('hero_frame0', { severity: 'blocker', evidence: { frame: 0, timecode: 0 }, fixHint: 'büyüt' })],
      }),
    ];
    const v = panelView(reviews)!;
    expect(v).toMatchObject({ round: 1, earlier: 1, total: 79.4, verdict: 'fix' });
    expect(v.dimensions.map((d) => d.id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']);
    const d = Object.fromEntries(v.dimensions.map((x) => [x.id, x]));
    expect(d.D1).toMatchObject({ label: 'Kanca', score: 12, weight: 15, low: false });
    expect(d.D2).toMatchObject({ score: 8.9, weight: 15, low: true }); // 60 % of 15 = 9
    expect(d.D3).toMatchObject({ weight: 12, low: false }); // 9 < 7.2 is false
    expect(d.D6).toMatchObject({ weight: 12, low: false }); // 9 ≥ 7.2
    expect(d.D8).toMatchObject({ score: 4.7, weight: 8, low: true }); // 4.7 < 4.8
    expect(v.gates).toEqual([
      { id: 'G1', label: 'Teslim', pass: true }, { id: 'G2', label: 'Doğruluk', pass: null }, { id: 'G3', label: 'Haklar', pass: true },
      { id: 'G4', label: 'Beyan', pass: true }, { id: 'G5', label: 'Güvenlik', pass: false }, { id: 'G6', label: 'Güvenli alan', pass: true },
    ]);
    expect(v.reviewers.map((r) => [r.role, r.label, r.seq])).toEqual([['reviewer_visual', 'Görsel', 1], ['reviewer_facts', 'Doğruluk', 1], ['reviewer_retention', 'İzlenme', 1]]);
    const [visual, , retention] = v.reviewers;
    expect(visual).toMatchObject({ summary: 'görsel', merged: true });
    expect(visual!.findings.map((f) => f.check)).toEqual(['hero_frame0', 'no_slop']); // blocker first
    expect(visual!.findings[0]).toEqual({ id: 'hero_frame0', check: 'hero_frame0', label: 'Kahraman ilk karede', severity: 'blocker', timecode: 0, hint: 'büyüt', status: 'open' });
    expect(visual!.findings[1]).toEqual({ id: 'no_slop', check: 'no_slop', label: 'Kalıp ifade yok', severity: 'minor', status: 'open' });
    expect(retention!.findings[0]).toMatchObject({ check: 'payoff', timecode: 30, status: 'regressed' });
    expect(v.reviewers[1]!.merged).toBe(false);
    // Only the first round: nothing earlier, and an unscored round (AUTO gate failed) keeps null scores.
    const auto = panelView([row(0, 'orchestrator', 1, { total: null, verdict: 'fix', dimensionScores: { D1: null, D6: 9 }, gates: { G1: false } })])!;
    expect(auto).toMatchObject({ round: 0, earlier: 0, total: null, reviewers: [] });
    expect(auto.dimensions.find((x) => x.id === 'D1')!.score).toBeNull();
    expect(auto.dimensions.find((x) => x.id === 'D1')!.low).toBe(false);
    expect(auto.gates.find((g) => g.id === 'G2')!.pass).toBeNull();
    // AUTO-failed round: no reviewer rows, the orchestrator's findings (qc value/limit/time, deterministic G2) show as the auto card.
    const failedAuto = panelView([row(0, 'orchestrator', 1, {
      total: null, verdict: 'fix', summaryTr: 'Otomatik kapı geçmedi', dimensionScores: {}, gates: { G1: false },
      findings: [
        finding('g1_size', { severity: 'blocker', gate: 'G1', evidence: { value: '1080x1900', limit: '1080x1920', at: 12 } }),
        finding('claims_verified', { severity: 'blocker', gate: 'G2', evidence: { frame: 30, timecode: 1 }, fixHint: 'iddiayı çıkar' }),
        finding('zzz_unknown', { severity: 'weird' }),
      ],
    })])!;
    expect(failedAuto.reviewers).toEqual([]);
    expect(failedAuto.auto!.findings.map((f) => [f.label, f.hint, f.timecode])).toEqual([['Boyut', '1080x1900 / 1080x1920', 12], ['İddialar doğrulandı', 'iddiayı çıkar', 1], ['zzz_unknown', undefined, undefined]]);
    expect(panelView(reviews)!.auto).toBeNull();
    // The run is chosen first, then its newest round (a newer round of another run does not win).
    const two = [
      row(2, 'orchestrator', 1, { runId: 'old', total: 90, createdAt: '2026-01-01' }),
      row(0, 'orchestrator', 1, { runId: 'new', total: 71, createdAt: '2026-02-01' }),
    ];
    expect(panelView(two, 'old')).toMatchObject({ runId: 'old', round: 2, total: 90 });
    expect(panelView(two, 'new')).toMatchObject({ runId: 'new', round: 0, total: 71 });
    expect(panelView(two)).toMatchObject({ runId: 'new', total: 71 });
    expect(panelView(two, 'missing')).toBeNull();
    // Badge: green only when ready.
    expect(reviewBadge('ready', 'ready')).toEqual({ text: 'yayına hazır', ok: true });
    expect(reviewBadge('ready', 'running')).toEqual({ text: 'yayına hazır', ok: true });
    expect(reviewBadge('fix', 'running')).toEqual({ text: 'düzeltiliyor', ok: false });
    expect(reviewBadge('ready', 'needs_human')).toEqual({ text: 'insan gerekli', ok: false });
    expect(reviewBadge('fix', 'failed')).toEqual({ text: 'başarısız', ok: false });
    expect(reviewBadge('ready', 'cancelled')).toEqual({ text: 'durduruldu', ok: false });
    // The thumbnail: the latest round's main sheet, never the hook sheet or an older round's.
    const a = (kind: string, meta: Record<string, unknown>, sha: string, runId = 'r1'): ArtifactMeta => ({ id: sha, runId, stepId: null, versionId: null, kind, blobSha: sha, createdAt: '', meta });
    const list = [a('final_review_sheet', { kind: 'hook', fixRound: 1 }, 'hook1'), a('final_review_sheet', { kind: 'main', fixRound: 1 }, 'main1'), a('final_review_sheet', { kind: 'main', fixRound: 0 }, 'main0'), a('final_review_sheet', { kind: 'main', fixRound: 1 }, 'other', 'r0')];
    expect(pickReviewSheet(list, 'r1', 1)).toBe('main1');
    expect(pickReviewSheet(list, 'r1', 0)).toBe('main0');
    expect(pickReviewSheet(list, 'r1', 2)).toBeNull();
  });
});
