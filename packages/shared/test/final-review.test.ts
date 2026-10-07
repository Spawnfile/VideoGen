import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  averageVisual, buildQcReport, checksOf, DIMENSIONS, FINAL_CHECK_IDS, FINAL_CHECKS, FINAL_REVIEWER_ROLES, finalReviewRefErrors, finalVerdict, formatScore, isBorderline,
  outputJsonSchema, panelScore, QC_CHECKS, scoreReview, validateArtifact, type FinalReview, type FinalReviewerRole, type PanelScore, type QcCheckResult,
} from '../src/index.ts';

const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `final-review-${n}.json`), 'utf8')) as FinalReview;
const errorsOf = (v: unknown) => { const r = validateArtifact('FinalReview', v); return r.ok ? [] : r.errors; };
const reviews = () => ({ reviewer_visual: fx('visual-pass'), reviewer_facts: fx('facts-pass'), reviewer_retention: fx('retention-pass') });
/** A music + TikTok qc report where every check passes except the given ids (spec §8.2 AUTO part). */
const qcReport = (failing: string[] = ['d7_bitrate']) => {
  const run = (variant: 'music' | 'tiktok'): QcCheckResult[] => (Object.keys(QC_CHECKS) as (keyof typeof QC_CHECKS)[])
    .filter((id) => QC_CHECKS[id].variants.includes(variant)).map((id) => ({ id, pass: !failing.includes(id), value: 'x', limit: 'y' }));
  return buildQcReport(run('music'), run('tiktok'));
};
const withChecks = (r: FinalReview, set: Record<string, { score: number; pass?: boolean }>): FinalReview => ({
  ...r,
  checks: r.checks.map((c) => {
    const s = set[c.id];
    if (!s) return c;
    const pass = s.pass ?? s.score >= 0.5;
    return { ...c, score: s.score, pass, ...(pass ? {} : { evidence: { frame: 30, timecode: 1 }, fix_hint: 'Düzelt.' }) };
  }),
});

describe('final@1 review contract', () => {
  it('every LLM dimension has one owner and its check points add up to the §8.1 weight; LLM + D6 + D7 = 100', () => {
    const llm = Object.entries(DIMENSIONS).filter(([, d]) => d.owner.startsWith('reviewer_'));
    for (const [id, d] of llm) {
      const mine = FINAL_CHECK_IDS.filter((c) => FINAL_CHECKS[c].dimension === id);
      expect(mine.length, id).toBeGreaterThan(0);
      expect(new Set(mine.map((c) => FINAL_CHECKS[c].owner)), id).toEqual(new Set([d.owner]));
      expect(mine.reduce((a, c) => a + FINAL_CHECKS[c].points, 0), id).toBe(d.weight);
    }
    const gates = FINAL_CHECK_IDS.filter((c) => FINAL_CHECKS[c].gate);
    expect(gates).toEqual(expect.arrayContaining(['no_third_party', 'honest_cg', 'claims_verified']));
    expect(gates).toHaveLength(3);
    expect(gates.map((c) => FINAL_CHECKS[c].gate).sort()).toEqual(['G2', 'G3', 'G5']);
    expect(gates.every((c) => FINAL_CHECKS[c].points === 0 && FINAL_CHECKS[c].dimension === null && FINAL_CHECKS[c].severity === 'blocker')).toBe(true);
    expect(FINAL_CHECK_IDS).toHaveLength(30);
    expect(FINAL_REVIEWER_ROLES.map((r) => checksOf(r).length)).toEqual([17, 6, 7]);
    expect(FINAL_CHECK_IDS.reduce((a, c) => a + FINAL_CHECKS[c].points, 0) + 12 + 5).toBe(100);
    expect(JSON.stringify(outputJsonSchema('FinalReview'))).not.toContain('propertyNames');
  });

  it('accepts the fixtures; rejects a foreign or missing check, a failure without evidence or hint, pass/score disagreement, facts without web checks', () => {
    for (const n of ['visual-pass', 'visual-fix', 'facts-pass', 'retention-pass']) expect(errorsOf(fx(n)), n).toEqual([]);
    const v = fx('visual-pass');
    expect(errorsOf({ ...v, checks: v.checks.slice(1) }).join(' ')).toContain('eksik kontrol: hero_frame0');
    expect(errorsOf({ ...v, checks: [...v.checks, { id: 'hook_frame0', pass: true, score: 1 }] }).join(' ')).toContain('bu rolün kontrolü değil: hook_frame0');
    expect(errorsOf({ ...v, checks: [...v.checks.slice(1), v.checks[1]] }).join(' ')).toContain('tekrarlanan kontrol: mechanism_shot');
    const bare = v.checks.map((c) => (c.id === 'text_readable' ? { id: c.id, pass: false, score: 0.2 } : c));
    expect(errorsOf({ ...v, checks: bare })).toEqual(expect.arrayContaining([expect.stringContaining('kanıt'), expect.stringContaining('düzeltme ipucu')]));
    const lie = v.checks.map((c) => (c.id === 'hero_frame0' ? { ...c, pass: false, score: 0.9, evidence: { frame: 1, timecode: 0.03 }, fix_hint: 'x' } : c));
    expect(errorsOf({ ...v, checks: lie }).join(' ')).toContain('geçti ⇔ score ≥ 0,5');
    const low = v.checks.map((c) => (c.id === 'hero_frame0' ? { ...c, pass: true, score: 0.4 } : c));
    expect(errorsOf({ ...v, checks: low }).join(' ')).toContain('geçti ⇔ score ≥ 0,5');
    const { web_checks: _w, ...noWeb } = fx('facts-pass');
    expect(errorsOf(noWeb).join(' ')).toContain('web_checks');
    // The reviewer writes no dimension scores or severities: zod strips them, the score is always computed.
    const sneaky = validateArtifact('FinalReview', { ...v, dimension_scores: { D2: 15 }, checks: v.checks.map((c) => ({ ...c, severity: 'minor' })) });
    expect(sneaky.ok && Object.keys(sneaky.value)).not.toContain('dimension_scores');
  });

  it('cross-checks against the reviewed final and the web targets; an unsupported claim cannot pass claims_verified', () => {
    const v = fx('visual-fix');
    const base = { role: 'reviewer_visual' as FinalReviewerRole, frames: 1500, fps: 30 };
    expect(finalReviewRefErrors(v, base)).toEqual([]);
    expect(finalReviewRefErrors(v, { ...base, frames: 40 }).join(' ')).toContain('checks.');
    expect(finalReviewRefErrors(v, { ...base, role: 'reviewer_facts' }).join(' ')).toContain('reviewer_role');
    const off = { ...v, checks: v.checks.map((c) => (c.id === 'text_readable' ? { ...c, evidence: { frame: 30, timecode: 9 } } : c)) };
    expect(finalReviewRefErrors(off, base).join(' ')).toContain('evidence.timecode');

    const f = fx('facts-pass');
    const fb = { role: 'reviewer_facts' as FinalReviewerRole, frames: 1500, fps: 30 };
    const targets = [{ claim_id: 'bilye-capi', url: 'https://en.wikipedia.org/wiki/Ballpoint_pen' }, { claim_id: 'yag-bazli', url: 'https://en.wikipedia.org/wiki/Ballpoint_pen' }];
    expect(finalReviewRefErrors(f, { ...fb, webTargets: targets })).toEqual(['web_checks: hedef kontrol edilmedi: yag-bazli https://en.wikipedia.org/wiki/Ballpoint_pen']);
    // One unreachable page is no error and no unsupported claim (F10).
    const unreachable = { ...f, web_checks: [...f.web_checks!, { claim_id: 'yag-bazli', url: 'https://en.wikipedia.org/wiki/Ballpoint_pen', reachable: false, supports: false }] };
    expect(finalReviewRefErrors(unreachable, { ...fb, webTargets: targets })).toEqual([]);
    // A reachable source that does not carry the claim, with no supporting source, cannot pass claims_verified.
    const bad = { ...f, web_checks: [...f.web_checks!, { claim_id: 'yag-bazli', url: 'https://en.wikipedia.org/wiki/Ballpoint_pen', reachable: true, supports: false, note_tr: 'iddia yok' }] };
    expect(finalReviewRefErrors(bad, { ...fb, webTargets: targets }).join(' ')).toContain('claims_verified');
    // ...unless another reachable source supports it.
    const rescued = { ...bad, web_checks: [...bad.web_checks!, { claim_id: 'yag-bazli', url: 'https://www.bicworld.com/en/our-products', reachable: true, supports: true }] };
    expect(finalReviewRefErrors(rescued, fb)).toEqual([]);
    const honest = withChecks(bad, { claims_verified: { score: 0.2 } });
    expect(finalReviewRefErrors(honest, { ...fb, webTargets: targets })).toEqual([]);
  });

  it('scores dimensions from check points × score; qc gives D6/D7 and G1/G5/G6; G4 by rule', () => {
    const s = panelScore({ qc: qcReport(), reviews: reviews(), g4: true });
    expect(s.dimensions).toEqual({ D1: 13, D2: 13, D3: 10.4, D4: 13, D5: 8.7, D6: 12, D7: 4, D8: 6.4, D9: 7 });
    expect(s.total).toBe(87.5);
    expect(s.gates).toEqual({ G1: true, G2: true, G3: true, G4: true, G5: true, G6: true });
    expect(s.failed).toEqual(['d7_bitrate']);
    expect(s.low).toEqual([]);
    expect(s.failedGates).toEqual([]);
    expect(scoreReview(fx('visual-pass')).dimensions).toEqual({ D2: 13, D3: 10.4, D5: 8.7, D9: 7 });
    // G5 is the qc flash count AND the reviewer's "CG presented as real".
    const dishonest = { ...reviews(), reviewer_visual: withChecks(fx('visual-pass'), { honest_cg: { score: 0.1 } }) };
    const g = panelScore({ qc: qcReport(), reviews: dishonest, g4: true });
    expect(g.gates.G5).toBe(false);
    expect(g.failed).toContain('honest_cg');
    expect(panelScore({ qc: qcReport(['g5_flash']), reviews: reviews(), g4: true }).gates.G5).toBe(false);
    expect(panelScore({ qc: qcReport(), reviews: reviews(), g4: false }).gates.G4).toBe(false);
    // AUTO gate failed: the reviewers did not run, so the total and the LLM parts are unknown (F6).
    const auto = panelScore({ qc: qcReport(['g6_layout']), reviews: null, g4: true });
    expect(auto.total).toBeNull();
    expect(auto.gates).toMatchObject({ G1: true, G2: null, G3: null, G4: true, G5: null, G6: false });
    expect(auto.dimensions).toMatchObject({ D1: null, D2: null, D6: 12, D7: 5 });
    expect(auto.failedGates).toEqual(['G6']);
    expect(auto.failed).toEqual(['g6_layout']);
  });

  it('K13: ready needs six gates, ≥ 80 and every dimension ≥ 60 %; < 70 rework; otherwise fix; failed automatic gates → fix', () => {
    const ready = panelScore({ qc: qcReport(), reviews: reviews(), g4: true });
    expect(finalVerdict(ready)).toBe('ready');
    const g3 = panelScore({ qc: qcReport(), reviews: { ...reviews(), reviewer_visual: withChecks(fx('visual-pass'), { no_third_party: { score: 0.1 } }) }, g4: true });
    expect(g3.total).toBe(87.5);
    expect(g3.failedGates).toEqual(['G3']);
    expect(finalVerdict(g3)).toBe('fix');
    // D8 3.2 (< 60 % of 8) keeps a total of 84.3 from being ready.
    const d8 = withChecks(fx('retention-pass'), { loop_seam: { score: 0.5 }, rehook: { score: 0.4 }, payoff: { score: 0.3 } });
    const low = panelScore({ qc: qcReport(), reviews: { ...reviews(), reviewer_retention: d8 }, g4: true });
    expect(low.dimensions.D8).toBe(3.2);
    expect(low.total).toBe(84.3);
    expect(low.low).toEqual(['D8']);
    expect(finalVerdict(low)).toBe('fix');
    // 84.2 total but D5 low is a plain fix; a failed automatic gate (total null) is a fix as well.
    const fixer = panelScore({ qc: qcReport(), reviews: { ...reviews(), reviewer_visual: fx('visual-fix') }, g4: true });
    expect(fixer.total).toBe(84.2);
    expect(fixer.low).toEqual(['D5']);
    expect(finalVerdict(fixer)).toBe('fix');
    expect(finalVerdict(panelScore({ qc: qcReport(['g1_size']), reviews: null, g4: true }))).toBe('fix');
    // Every score 0.55: 83 × 0.55 + 16 = 61.65 → rework.
    const flat = Object.fromEntries(FINAL_REVIEWER_ROLES.map((role) => [role, withChecks(reviews()[role], Object.fromEntries(checksOf(role).map((id) => [id, { score: 0.55 }])))]));
    const vasat = panelScore({ qc: qcReport(), reviews: flat, g4: true });
    expect(vasat.total).toBe(61.65);
    expect(finalVerdict(vasat)).toBe('rework');
  });

  it('a borderline panel gets a second visual review; averaging keeps gate checks strict, scores averaged, evidence from the failing side', () => {
    const at = (total: number | null, failedGates: PanelScore['failedGates'] = []) => isBorderline({ total, failedGates } as PanelScore);
    expect([at(77.9), at(78), at(82), at(82.1), at(80, ['G3']), at(null)]).toEqual([false, true, true, false, false, false]);
    const a = fx('visual-pass');
    const b = withChecks(fx('visual-pass'), { hero_frame0: { score: 0.4 }, no_third_party: { score: 0.2 }, labels_correct: { score: 0.55 }, text_readable: { score: 0.3 } });
    const m = averageVisual(a, b);
    const by = (id: string) => m.checks.find((c) => c.id === id)!;
    expect(by('hero_frame0')).toMatchObject({ pass: true, score: 0.7 });
    expect(by('hero_frame0').evidence).toBeUndefined();
    // Gate checks need both: one failing review fails the gate and its score is the minimum.
    expect(by('no_third_party')).toMatchObject({ pass: false, score: 0.2 });
    expect(by('no_third_party').evidence).toEqual({ frame: 30, timecode: 1 });
    expect(by('labels_correct')).toMatchObject({ pass: true, score: 0.65 });
    expect(by('text_readable')).toMatchObject({ pass: true, score: 0.6 });
    expect(m.summary_tr).toBe(`${a.summary_tr} / ${b.summary_tr}`.slice(0, 400));
    expect(errorsOf(m)).toEqual([]);
    expect(formatScore(87.5)).toBe('87,5');
    expect(formatScore(61.65)).toBe('61,7');
    expect(formatScore(80)).toBe('80,0');
  });
});
