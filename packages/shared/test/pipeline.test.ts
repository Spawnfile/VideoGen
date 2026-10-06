import { describe, expect, it } from 'vitest';
import { formatClock, IMPLEMENTED_STEPS, normalizeProductName, producePlan, STEP_KEYS, STEP_WEIGHTS } from '../src/pipeline.ts';

describe('produce plan', () => {
  it('keeps only implemented steps, drops voice in silent mode and rescales weights to 100', () => {
    expect(IMPLEMENTED_STEPS).toEqual(['research', 'storyboard', 'build', 'draft_render', 'draft_review']);
    expect(producePlan('silent')).toEqual([
      { key: 'research', weight: 19.05 }, { key: 'storyboard', weight: 16.67 }, { key: 'build', weight: 42.86 }, { key: 'draft_render', weight: 9.52 }, { key: 'draft_review', weight: 11.9 },
    ]);
    const all = producePlan('vo', STEP_KEYS);
    expect(all.map((s) => s.key)).toEqual([...STEP_KEYS]);
    expect(all.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(100, 1);
    expect(producePlan('silent', STEP_KEYS).map((s) => s.key)).not.toContain('voice');
    expect(Object.values(STEP_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(normalizeProductName('  Tükenmez   KALEM ')).toBe('tükenmez kalem');
    expect(normalizeProductName('IŞIK')).toBe('ışık');
    expect([formatClock(45), formatClock(62.4), formatClock(0)]).toEqual(['0:45', '1:02', '0:00']);
  });
});
