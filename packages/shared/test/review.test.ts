import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAFT_CHECK_IDS, DRAFT_CHECKS, draftDecision, outputJsonSchema, reviewRefErrors, validateArtifact, type Review } from '../src/index.ts';

const fx = (n: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../tests/fixtures/artifacts', `${n}.json`), 'utf8')) as Review;
const errorsOf = (v: unknown) => { const r = validateArtifact('Review', v); return r.ok ? [] : r.errors; };

describe('Review contract (draft review)', () => {
  it('accepts both fixtures; every check id appears exactly once and severities are fixed by id', () => {
    expect(errorsOf(fx('review-pass'))).toEqual([]);
    expect(errorsOf(fx('review-revise'))).toEqual([]);
    expect(Object.keys(DRAFT_CHECKS).sort()).toEqual([...DRAFT_CHECK_IDS].sort());
    expect(DRAFT_CHECKS.hero_frame0.severity).toBe('blocker');
    expect(DRAFT_CHECK_IDS.filter((id) => DRAFT_CHECKS[id].severity === 'minor')).toEqual(['no_intersection', 'text_readable', 'motion_flow', 'no_slop']);
  });

  it('rejects a missing or repeated check, a failure without evidence or fix hint, and a severity field from the reviewer', () => {
    const r = fx('review-revise');
    expect(errorsOf({ ...r, checks: r.checks.slice(1) }).join(' ')).toContain('checks');
    expect(errorsOf({ ...r, checks: [...r.checks.slice(1), r.checks[1]] })).toEqual(expect.arrayContaining([expect.stringContaining('tekrarlanan kontrol: mechanism_shot'), expect.stringContaining('eksik kontrol: hero_frame0')]));
    const bare = r.checks.map((c) => (c.id === 'mechanism_shot' ? { id: c.id, pass: false, score: 0.2 } : c));
    expect(errorsOf({ ...r, checks: bare })).toEqual(expect.arrayContaining([expect.stringContaining('kanıt'), expect.stringContaining('düzeltme ipucu')]));
    // zod strips unknown keys: a reviewer-supplied severity never reaches the decision.
    const sneaky = { ...r, checks: r.checks.map((c) => ({ ...c, severity: 'minor' })) };
    const v = validateArtifact('Review', sneaky);
    expect(v.ok && draftDecision(v.value).verdict).toBe('revise');
  });

  it('cross-checks evidence against the reviewed draft: frame inside the video, timecode agrees with the frame', () => {
    const r = fx('review-revise');
    expect(reviewRefErrors(r, { frames: 60, fps: 30 })).toEqual([]);
    expect(reviewRefErrors(r, { frames: 40, fps: 30 })).toEqual([expect.stringContaining('checks.6.evidence.frame')]);
    const off = { ...r, checks: r.checks.map((c) => (c.id === 'mechanism_shot' ? { ...c, evidence: { frame: 30, timecode: 9 } } : c)) };
    expect(reviewRefErrors(off, { frames: 60, fps: 30 })).toEqual([expect.stringContaining('checks.1.evidence.timecode')]);
  });

  it('decides deterministically: blocker/major failures or a failed gate revise, minor failures only annotate', () => {
    expect(draftDecision(fx('review-pass'))).toEqual({ verdict: 'pass', blocking: [], minor: ['text_readable'], gates: [] });
    expect(draftDecision(fx('review-revise'))).toEqual({ verdict: 'revise', blocking: ['mechanism_shot'], minor: ['motion_flow'], gates: [] });
    const gate = { ...fx('review-pass'), gate_results: { G3: false, G5: true } };
    expect(draftDecision(gate)).toMatchObject({ verdict: 'revise', gates: ['G3'] });
    // Scores never decide: a perfect pass list with zero scores still passes.
    const zero = { ...fx('review-pass'), checks: fx('review-pass').checks.map((c) => ({ ...c, pass: true, score: 0 })) };
    expect(draftDecision(zero).verdict).toBe('pass');
  });

  it('gives the CLI a JSON schema with explicit dimension and gate properties (no propertyNames)', () => {
    const s = outputJsonSchema('Review') as { properties: Record<string, { required?: string[]; propertyNames?: unknown }> };
    expect(s.properties.dimension_scores!.required).toEqual(['D2', 'D3', 'D5', 'D9']);
    expect(s.properties.gate_results!.required).toEqual(['G3', 'G5']);
    expect(JSON.stringify(s)).not.toContain('propertyNames');
  });
});
