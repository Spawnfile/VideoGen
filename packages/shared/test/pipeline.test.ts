import { describe, expect, it } from 'vitest';
import { formatClock, IMPLEMENTED_STEPS, normalizeProductName, producePlan, STEP_KEYS, STEP_WEIGHTS } from '../src/pipeline.ts';

describe('produce plan', () => {
  it('keeps only implemented steps, never plans voice (spec Z1) and rescales weights to 100', () => {
    expect(IMPLEMENTED_STEPS).toEqual(['research', 'storyboard', 'music', 'build', 'draft_render', 'draft_review', 'final_render', 'compose', 'qc', 'review', 'finalize']);
    expect(producePlan('vo').map((s) => s.key)).not.toContain('voice'); // spec Z1: no voice step for any video
    expect(STEP_KEYS).toContain('voice'); // read-compat: old runs have voice step rows
    expect(STEP_KEYS).not.toContain('remix'); // spec Z3: no audio edits
    expect(producePlan('silent')).toEqual([
      { key: 'research', weight: 8.42 }, { key: 'storyboard', weight: 7.37 }, { key: 'music', weight: 3.16 }, { key: 'build', weight: 18.95 }, { key: 'draft_render', weight: 4.21 }, { key: 'draft_review', weight: 5.26 }, { key: 'final_render', weight: 24.21 }, { key: 'compose', weight: 10.53 }, { key: 'qc', weight: 2.11 }, { key: 'review', weight: 12.63 }, { key: 'finalize', weight: 3.16 },
    ]);
    const produced = STEP_KEYS.filter((k) => k !== 'voice');
    expect(producePlan('vo').map((s) => s.key)).toEqual(produced);
    const all = producePlan('vo', STEP_KEYS);
    expect(all.map((s) => s.key)).toEqual(produced);
    expect(all.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(100, 1);
    expect(producePlan('silent', STEP_KEYS).map((s) => s.key)).not.toContain('voice');
    expect(STEP_KEYS.reduce((a, k) => a + STEP_WEIGHTS[k], 0)).toBe(100);
    expect(normalizeProductName('  Tükenmez   KALEM ')).toBe('tükenmez kalem');
    expect(normalizeProductName('IŞIK')).toBe('ışık');
    expect([formatClock(45), formatClock(62.4), formatClock(0)]).toEqual(['0:45', '1:02', '0:00']);
  });
});
